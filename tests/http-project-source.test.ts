import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { DependencyGraph } from '../src/shared/contracts.js';
import type { GraphResponse } from '../src/shared/project-api.js';
import { HttpProjectSource, ProjectApiError, ProjectConnection, takeCapability } from '../src/client/data/http-project-source';

const snapshotId = `sha256:${'a'.repeat(64)}`;
const text = 'export const value = 1;\n';
const hash = createHash('sha256').update(text).digest('hex');
const id = randomUUID();
const fileId = randomUUID();
const graph: DependencyGraph = {
  schemaVersion: 1, snapshotId, extractor: { name: 'test', version: '1' },
  files: [{ path: 'main.ts', language: 'ts', sizeBytes: Buffer.byteLength(text), contentHash: hash, parse: { status: 'ok' } }], edges: [],
  coverage: { files: { found: 1, parsed: 1, skipped: 0, skips: [], prunedDirectories: [] }, imports: { seen: 0, resolved: 0, external: 0, excluded: 0, failed: 0, issues: [] }, unsupported: [] },
};
const envelope: GraphResponse = { projectId: id, label: 'Inert fixture', graph, files: [{ id: fileId, path: 'main.ts' }] };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

describe('M2 browser capability and HTTP ProjectSource', () => {
  it('calls the default browser fetch without rebinding its receiver to the connection', async () => {
    const standalone = vi.spyOn(globalThis, 'fetch').mockImplementation(function (this: unknown) {
      expect(this === undefined || this === globalThis).toBe(true);
      return Promise.resolve(json({ project: null }));
    });
    try {
      expect(await new ProjectConnection('c'.repeat(64)).session()).toEqual({ project: null });
    } finally { standalone.mockRestore(); }
  });
  it('removes the launch fragment immediately and accepts only the exact capability field', () => {
    const history = { replaceState: vi.fn() };
    const capability = 'b'.repeat(64);
    expect(takeCapability({ hash: `#cap=${capability}`, pathname: '/', search: '?view=map' }, history)).toBe(capability);
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/?view=map');
    for (const hash of ['', '#cap=wrong', `#cap=${capability}&root=/etc`, `#cap=${capability}&cap=${capability}`]) expect(takeCapability({ hash, pathname: '/', search: '' }, history)).toBeNull();
  });
  it('sends authority only in a bearer header; mutations use JSON and no cookies/redirects/cache', async () => {
    const transport = vi.fn(async () => json({ project: { id, label: 'Inert fixture', state: 'selected' } }));
    const connection = new ProjectConnection('c'.repeat(64), transport);
    await connection.session();
    await connection.confirm(id);
    await connection.refresh(id, snapshotId);
    for (const [url, init] of transport.mock.calls as unknown as [string, RequestInit][]) {
      expect(url).not.toContain('c'.repeat(64));
      expect(init).toMatchObject({ credentials: 'omit', mode: 'same-origin', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { Authorization: `Bearer ${'c'.repeat(64)}` } });
      if (init.method === 'POST') expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    }
  });
  it('fetches a real graph and translates display paths to opaque source IDs bound to its snapshot', async () => {
    const transport = vi.fn(async (url: string) => url.endsWith('/graph') ? json(envelope) : json({ snapshotId, path: 'main.ts', contentHash: hash, text }));
    const source = new HttpProjectSource(new ProjectConnection('c'.repeat(64), transport), envelope);
    expect(source.isPreview).toBe(false);
    expect(await source.loadGraph()).toEqual(graph);
    expect(await source.loadSource('main.ts')).toEqual({ snapshotId, path: 'main.ts', contentHash: hash, text });
    expect(transport.mock.calls[1]![0]).toBe(`/api/projects/${id}/files/${fileId}?snapshotId=${snapshotId}`);
    await expect(source.loadSource('../outside.ts')).rejects.toMatchObject({ status: 404, code: 'invalid-file' });
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('never presents mismatching graph, source snapshot, path, claimed hash or changed bytes as current', async () => {
    const graphTransport = vi.fn(async () => json({ ...envelope, graph: { ...graph, snapshotId: 'other' } }));
    const staleGraph = new HttpProjectSource(new ProjectConnection('c'.repeat(64), graphTransport), envelope);
    await expect(staleGraph.loadGraph()).rejects.toMatchObject({ code: 'stale-snapshot' });
    const valid = { snapshotId, path: 'main.ts', contentHash: hash, text };
    for (const change of [{ snapshotId: 'other' }, { path: 'other.ts' }, { contentHash: 'b'.repeat(64) }, { text: 'changed source' }]) {
      const source = new HttpProjectSource(new ProjectConnection('c'.repeat(64), async () => json({ ...valid, ...change })), envelope);
      await expect(source.loadSource('main.ts')).rejects.toMatchObject({ code: 'stale-snapshot' });
    }
  });
  it('clears authority after close and aborts old source requests on refresh/unmount', async () => {
    const transport = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return json({ closed: true });
    });
    const connection = new ProjectConnection('c'.repeat(64), transport);
    const source = new HttpProjectSource(connection, envelope);
    source.revoke();
    await expect(source.loadSource('main.ts')).rejects.toMatchObject({ name: 'AbortError' });
    await connection.close(id);
    await expect(connection.session()).rejects.toMatchObject({ code: 'revoked' });
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('streams an explicit explanation request and rejects stale selections without transport', async () => {
    const events = [{ type: 'snippets', snippets: [] }, { type: 'token', text: 'inert service-double output' }, { type: 'error', code: 'runtime-unavailable', message: 'Labeled transport double.' }];
    const transport = vi.fn(async () => new Response(events.map((event) => JSON.stringify(event)).join('\n') + '\n', { headers: { 'Content-Type': 'application/x-ndjson' } }));
    const source = new HttpProjectSource(new ProjectConnection('c'.repeat(64), transport), envelope);
    const received = [];
    for await (const event of source.explain({ snapshotId, path: 'main.ts' }, new AbortController().signal)) received.push(event);
    expect(received).toEqual(events);
    const stale = [];
    for await (const event of source.explain({ snapshotId: 'old', path: 'main.ts' }, new AbortController().signal)) stale.push(event);
    expect(stale).toMatchObject([{ type: 'error', code: 'stale-snapshot' }]);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('shows sanitized API errors and treats cancellation as an incomplete explanation', async () => {
    const connection = new ProjectConnection('c'.repeat(64), async () => json({ error: { code: '/private/path contains sensitive text' } }, 500));
    await expect(connection.session()).rejects.toEqual(new ProjectApiError(500, 'request-failed'));
    const controller = new AbortController(); controller.abort();
    const source = new HttpProjectSource(new ProjectConnection('c'.repeat(64), async () => { throw new Error(); }), envelope);
    const received = [];
    for await (const event of source.explain({ snapshotId, path: 'main.ts' }, controller.signal)) received.push(event);
    expect(received).toMatchObject([{ type: 'error', code: 'cancelled' }]);
  });
});
