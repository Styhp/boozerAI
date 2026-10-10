import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { DependencyGraph } from '../src/shared/contracts.js';
import type { CloudPreview, CloudStatus } from '../src/shared/explanation.js';
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
const cloudStatus: CloudStatus = { available: true, provider: 'OpenAI', model: 'cloud-service-double', endpoint: 'https://api.openai.com/v1/chat/completions' };
const preview: CloudPreview = {
  provider: 'OpenAI', endpoint: cloudStatus.endpoint, model: cloudStatus.model,
  payload: { messages: [{ content: 'inert preview text' }] }, payloadJson: '{"messages":[{"content":"inert preview text"}]}',
  previewHash: createHash('sha256').update('{"messages":[{"content":"inert preview text"}]}').digest('hex'), suspectedInjections: [],
};

describe('M2 browser capability and HTTP ProjectSource', () => {
  it('hash-checks document source through the authenticated snapshot file route', async () => {
    const text = '# Different repository\nUses Svelte.\n';
    const contentHash = createHash('sha256').update(text).digest('hex');
    const doc = { path: 'README.md', kind: 'markdown' as const, sizeBytes: Buffer.byteLength(text), contentHash };
    const response = { ...envelope, files: [...envelope.files, { id: 'doc-id', path: doc.path }], graph: { ...graph, documents: [doc] } };
    for (const actualText of [text, 'tampered source']) {
      const transport = vi.fn(async () => json({ snapshotId, path: doc.path, contentHash, text: actualText }));
      const source = new HttpProjectSource(new ProjectConnection('c'.repeat(64), transport), response);
      if (actualText === text) expect(await source.loadSource(doc.path)).toMatchObject({ text, contentHash });
      else await expect(source.loadSource(doc.path)).rejects.toMatchObject({ code: 'stale-snapshot' });
      expect(transport.mock.calls[0]).toMatchObject([`/api/projects/${id}/files/doc-id?snapshotId=${snapshotId}`,
        { headers: { Authorization: `Bearer ${'c'.repeat(64)}` } }]);
    }
  });
  it('opens the native picker with an authenticated empty body and no browser path', async () => {
    const result = { status: 'selected', project: { id, label: 'Chosen folder', state: 'selected' } };
    const transport = vi.fn(async (_url: string, _init: RequestInit) => json(result));
    const signal = new AbortController().signal;
    expect(await new ProjectConnection('c'.repeat(64), transport).chooseFolder(signal)).toEqual(result);
    expect(transport).toHaveBeenCalledWith('/api/session/pick', expect.objectContaining({
      method: 'POST', body: '{}', signal, headers: { Authorization: `Bearer ${'c'.repeat(64)}`, 'Content-Type': 'application/json' },
    }));
  });
  it('discards picker results after cancellation or launch revocation, including delayed JSON', async () => {
    for (const action of ['abort', 'close']) {
      let finish!: (value: unknown) => void;
      const transport = vi.fn(async (url: string) => url === '/api/session/pick'
        ? { ok: true, json: () => new Promise((resolve) => { finish = resolve; }) } as Response
        : json({ closed: true }));
      const connection = new ProjectConnection('c'.repeat(64), transport);
      const controller = new AbortController();
      const pending = connection.chooseFolder(controller.signal);
      await vi.waitFor(() => expect(finish).toBeDefined());
      if (action === 'abort') controller.abort(); else await connection.close(id);
      finish({ status: 'selected', project: { id, label: 'Late', state: 'selected' } });
      await expect(pending).rejects.toMatchObject({ code: action === 'abort' ? 'cancelled' : 'revoked' });
    }
  });
  it('sends bounded questions/history through authenticated chat without source or cloud fields', async () => {
    const event = { type: 'error', code: 'no-excerpt', message: 'Labeled chat double.' };
    const transport = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(event) + '\n', { headers: { 'Content-Type': 'application/x-ndjson' } }));
    const source = new HttpProjectSource(new ProjectConnection('c'.repeat(64), transport), envelope);
    const body = { snapshotId, question: 'What does this file do?', history: ['Where does the app start?'], contextPath: 'main.ts' };
    const received = []; for await (const value of source.chat(body, new AbortController().signal)) received.push(value);
    expect(received).toEqual([event]);
    expect(transport.mock.lastCall![0]).toBe(`/api/projects/${id}/chat`);
    expect(JSON.parse((transport.mock.lastCall as unknown as [string, RequestInit])[1].body as string)).toEqual(body);
  });
  it('does not transport cancelled, revoked, stale or malformed chat requests', async () => {
    const transport = vi.fn(async () => { throw new Error('Must not transport.'); });
    const source = new HttpProjectSource(new ProjectConnection('c'.repeat(64), transport), envelope);
    const body = { snapshotId, question: 'Question', history: [] };
    const cancelled = new AbortController(); cancelled.abort();
    for await (const _event of source.chat(body, cancelled.signal)) { /* drain */ }
    for (const change of [{ snapshotId: 'old' }, { contextPath: '../outside.ts' }, { question: 'x'.repeat(601) }]) {
      for await (const _event of source.chat({ ...body, ...change }, new AbortController().signal)) { /* drain */ }
    }
    source.revoke(); for await (const _event of source.chat(body, new AbortController().signal)) { /* drain */ }
    expect(transport).not.toHaveBeenCalled();
  });
  it('suppresses already buffered chat output if the project is revoked after response headers', async () => {
    const transport = vi.fn(async () => new Response('{"type":"token","text":"late text"}\n', { headers: { 'Content-Type': 'application/x-ndjson' } }));
    const source = new HttpProjectSource(new ProjectConnection('c'.repeat(64), transport), envelope);
    const stream = source.chat({ snapshotId, question: 'Question', history: [] }, new AbortController().signal)[Symbol.asyncIterator]();
    const next = stream.next(); source.revoke();
    expect(await next).toMatchObject({ done: true });
  });
  it('calls the default browser fetch without rebinding its receiver to the connection', async () => {
    const standalone = vi.spyOn(globalThis, 'fetch').mockImplementation(function (this: unknown) {
      expect(this === undefined || this === globalThis).toBe(true);
      return Promise.resolve(json({ project: null, cloud: { available: false } }));
    });
    try {
      expect(await new ProjectConnection('c'.repeat(64)).session()).toEqual({ project: null, cloud: { available: false } });
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
    const transport = vi.fn(async () => json({ project: { id, label: 'Inert fixture', state: 'selected' }, cloud: { available: false } }));
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

describe('P-16 HTTP cloud methods', () => {
  it('offers cloud only after authenticated available session metadata, without a status/preview background request', async () => {
    const transport = vi.fn(async () => json({ project: null, cloud: cloudStatus }));
    const connection = new ProjectConnection('c'.repeat(64), transport);
    expect(new HttpProjectSource(connection, envelope).cloud).toBeUndefined();
    await connection.session();
    const source = new HttpProjectSource(connection, envelope);
    expect(await source.cloud!.status()).toEqual(cloudStatus);
    expect(await source.cloud!.status()).toEqual(cloudStatus);
    expect(transport).toHaveBeenCalledTimes(1);
    const unavailable = new ProjectConnection('c'.repeat(64), async () => json({ project: null, cloud: { available: false } }));
    await unavailable.session();
    expect(new HttpProjectSource(unavailable, envelope).cloud).toBeUndefined();
    const unauthorized = new ProjectConnection('c'.repeat(64), async () => json({ error: { code: 'unauthorized' } }, 401));
    await expect(unauthorized.session()).rejects.toMatchObject({ code: 'unauthorized' });
    expect(new HttpProjectSource(unauthorized, envelope).cloud).toBeUndefined();
  });
  it('previews only on explicit request with exact selection JSON and the token header, then forwards cloud/hash through NDJSON', async () => {
    const event = { type: 'error', code: 'cloud-error', message: 'Fixed cloud service message.' };
    const transport = vi.fn(async (url: string, _init: RequestInit) => {
      if (url === '/api/session') return json({ project: null, cloud: cloudStatus });
      if (url.endsWith('/preview')) return json(preview);
      return new Response(`${JSON.stringify(event)}\n`, { headers: { 'Content-Type': 'application/x-ndjson' } });
    });
    const connection = new ProjectConnection('c'.repeat(64), transport);
    await connection.session();
    const source = new HttpProjectSource(connection, envelope);
    expect(await source.cloud!.preview({ snapshotId, path: 'main.ts' })).toEqual(preview);
    expect(transport.mock.calls[1]).toEqual([`/api/projects/${id}/explanations/preview`, expect.objectContaining({
      method: 'POST', body: JSON.stringify({ snapshotId, path: 'main.ts' }), signal: expect.any(AbortSignal),
      credentials: 'omit', mode: 'same-origin', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { Authorization: `Bearer ${'c'.repeat(64)}`, 'Content-Type': 'application/json' },
    })]);
    const body = { snapshotId, path: 'main.ts', provider: 'cloud' as const, previewHash: preview.previewHash };
    const received = [];
    for await (const value of source.explain(body, new AbortController().signal)) received.push(value);
    expect(received).toEqual([event]);
    expect(transport.mock.calls[2]).toEqual([`/api/projects/${id}/explanations`, expect.objectContaining({ body: JSON.stringify(body) })]);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(transport.mock.calls.every(([url]) => url.startsWith('/api/'))).toBe(true);
  });
  it('refuses stale/unknown preview selections without transporting any source path', async () => {
    const transport = vi.fn(async () => json({ project: null, cloud: cloudStatus }));
    const connection = new ProjectConnection('c'.repeat(64), transport);
    await connection.session();
    const source = new HttpProjectSource(connection, envelope);
    for (const body of [{ snapshotId: 'old', path: 'main.ts' }, { snapshotId, path: '../private.ts' }]) {
      await expect(source.cloud!.preview(body)).rejects.toThrow('Refresh and select the file again.');
    }
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each([
    [404, 'cloud-unavailable', 'No cloud provider is configured for this launch.'],
    [409, 'stale-snapshot', 'Refresh and select the file again.'],
    [400, 'invalid-selection', 'Select a source file in the current snapshot.'],
    [400, 'no-excerpt', 'No exact excerpt of this file fits the explanation budget, so nothing was sent.'],
    [401, 'unauthorized', 'The project session has ended. Restart the launcher.'],
    [500, '/private/exception contains a key', 'Could not preview the cloud request.'],
  ])('shows a fixed readable error for preview HTTP %s / %s', async (status, code, message) => {
    const transport = async (url: string) => url === '/api/session' ? json({ project: null, cloud: cloudStatus }) : json({ error: { code, message: 'NEVER SHOW THIS PRIVATE EXCEPTION' } }, status);
    const connection = new ProjectConnection('c'.repeat(64), transport);
    await connection.session();
    const source = new HttpProjectSource(connection, envelope);
    await expect(source.cloud!.preview({ snapshotId, path: 'main.ts' })).rejects.toEqual(new Error(message));
  });
  it('aborts pending previews and suppresses late results after source revocation', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const transport = vi.fn(async (url: string, _init: RequestInit) => {
      if (url === '/api/session') return json({ project: null, cloud: cloudStatus });
      await gate; return json(preview); // This double intentionally ignores AbortSignal.
    });
    const connection = new ProjectConnection('c'.repeat(64), transport);
    await connection.session();
    const source = new HttpProjectSource(connection, envelope);
    const pending = source.cloud!.preview({ snapshotId, path: 'main.ts' });
    source.revoke();
    expect(transport.mock.calls[1]![1].signal!.aborted).toBe(true);
    release();
    await expect(pending).rejects.toThrow('Cloud preview cancelled.');
    expect(await source.cloud!.status()).toEqual({ available: false });
    await expect(source.cloud!.preview({ snapshotId, path: 'main.ts' })).rejects.toThrow('Cloud preview cancelled.');
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('clears cached availability on close and suppresses a preview whose JSON finishes after close', async () => {
    let release!: () => void;
    let draining!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { draining = resolve; });
    const transport = vi.fn(async (url: string) => {
      if (url === '/api/session') return json({ project: null, cloud: cloudStatus });
      if (url.endsWith('/close')) return json({ closed: true });
      const response = json(preview);
      response.json = async () => { draining(); await gate; return preview; };
      return response;
    });
    const connection = new ProjectConnection('c'.repeat(64), transport);
    await connection.session();
    const source = new HttpProjectSource(connection, envelope);
    const pending = source.cloud!.preview({ snapshotId, path: 'main.ts' });
    await started;
    await connection.close(id);
    release();
    await expect(pending).rejects.toThrow('The project session has ended. Restart the launcher.');
    expect(await source.cloud!.status()).toEqual({ available: false });
    expect(new HttpProjectSource(connection, envelope).cloud).toBeUndefined();
  });
});
