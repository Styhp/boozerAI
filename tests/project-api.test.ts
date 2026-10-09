import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExplanationService } from '../src/server/explain/index.js';
import type { ExplanationEvent } from '../src/shared/explanation.js';
import type { GraphResponse } from '../src/shared/project-api.js';
import { handleProjectApi } from '../src/server/project-api.js';
import { InputError, LocalInputAdapter } from '../src/server/local-input.js';
import { ProjectSession } from '../src/server/project-session.js';
import { projectArgument } from '../src/server/launcher.js';

// In-process HTTP streams and a labeled service double; no sockets or model calls.
class ResponseSink extends Writable {
  readonly chunks: Buffer[] = [];
  readonly headers = new Map<string, string>();
  statusCode = 0;
  headersSent = false;
  _write(chunk: Buffer, _encoding: string, callback: () => void) { this.chunks.push(Buffer.from(chunk)); callback(); }
  writeHead(status: number, headers: Record<string, string>) { this.statusCode = status; this.headersSent = true; for (const [k, v] of Object.entries(headers)) this.headers.set(k, v); return this; }
  flushHeaders() {}
  get text() { return Buffer.concat(this.chunks).toString('utf8'); }
  get json(): any { return JSON.parse(this.text); }
}
const roots: string[] = [];
const sessions: ProjectSession[] = [];
const ready = { state: 'ready', model: 'service-double', runtimeVersion: 'test', digest: 'test' } as const;
function service(events: readonly ExplanationEvent[] = [{ type: 'error', code: 'runtime-unavailable', message: 'Labeled service double.' }]): ExplanationService {
  return { status: vi.fn(async () => ready), preload: vi.fn(async () => ready), explain: vi.fn(async function* () { yield* events; }) };
}
async function fixture() {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'boozer-api-'));
  roots.push(root);
  await writeFile(join(root, 'main.ts'), "import './dep';\n// inert target text\n");
  await writeFile(join(root, 'dep.ts'), 'export const value = 1;\n');
  await writeFile(join(root, 'credentials.ts'), 'DO NOT READ THIS FILE');
  const input = await LocalInputAdapter.select(root);
  const session = new ProjectSession(input, 'Inert test project');
  sessions.push(session);
  const capability = new URLSearchParams(new URL(session.launchUrl(false)).hash.slice(1)).get('cap')!;
  const engine = service();
  const id = input.projectId;
  const request = (action: string, method = 'GET', value?: unknown, headers: Record<string, string | undefined> = {}, development = false) => {
    const req = Readable.from(value === undefined ? [] : [Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))]) as unknown as IncomingMessage;
    req.method = method;
    req.url = action.startsWith('/api/') ? action : `/api/projects/${id}/${action}`;
    req.headers = { host: '127.0.0.1:4173', authorization: `Bearer ${capability}`, origin: 'http://127.0.0.1:4173', 'content-type': 'application/json', ...headers };
    const res = new ResponseSink();
    const done = handleProjectApi(req, res as unknown as ServerResponse, session, engine, development);
    return { req, res, done };
  };
  const call = async (...args: Parameters<typeof request>) => { const call = request(...args); await call.done; return call.res; };
  return { root, input, session, capability, engine, id, request, call };
}
afterEach(async () => {
  sessions.splice(0).forEach((session) => session.close());
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('M2 launch and project authority', () => {
  it('accepts one explicit launcher root, never browser-supplied roots or Origin switches', () => {
    expect(projectArgument([])).toBeNull();
    expect(projectArgument(['--project', '.'])).toBe('.');
    for (const args of [['.'], ['--project'], ['--project', '.', '--dev'], ['--origin', 'http://evil.example']]) expect(() => projectArgument(args)).toThrow();
  });
  it('exposes only pending opaque metadata until explicit confirmation', async () => {
    const f = await fixture();
    const read = vi.spyOn(f.input, 'snapshot');
    const status = await f.call('/api/session');
    expect(status.json).toEqual({ project: { id: f.id, label: 'Inert test project', state: 'selected' } });
    expect(status.text).not.toContain(f.root);
    expect(status.text).not.toContain(f.capability);
    expect((await f.call('graph')).statusCode).toBe(409);
    expect(read).not.toHaveBeenCalled();
    expect((await f.call('confirm', 'POST', { root: f.root })).statusCode).toBe(400);
    expect(read).not.toHaveBeenCalled();
  });
  it('rejects missing/wrong capabilities on every read, write and unknown API', async () => {
    const f = await fixture();
    for (const authorization of [undefined, 'Bearer wrong', `bearer ${f.capability}`, `Bearer ${f.capability} `]) {
      for (const [path, method] of [['/api/session', 'GET'], ['graph', 'GET'], ['confirm', 'POST'], ['refresh', 'POST'], ['close', 'POST'], ['explanations', 'POST'], ['/api/unknown', 'GET']]) {
        const response = await f.call(path!, method!, {}, { authorization });
        expect(response.statusCode).toBe(401);
      }
    }
    expect(f.session.descriptor()?.state).toBe('selected');
  });
  it('requires exact Origin and JSON for mutations; production does not accept the dev Origin', async () => {
    const f = await fixture();
    for (const origin of [undefined, 'null', 'https://evil.example', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173/']) expect((await f.call('confirm', 'POST', {}, { origin })).statusCode).toBe(403);
    for (const value of ['{}', '[]', 'null', '{']) {
      if (value !== '{}') expect((await f.call('confirm', 'POST', value)).statusCode).toBe(400);
    }
    expect((await f.call('confirm', 'POST', {}, { 'content-type': 'text/plain' })).statusCode).toBe(415);
    expect((await f.call('confirm', 'POST', 'x'.repeat(8_193))).statusCode).toBe(413);
    expect((await f.call('confirm', 'POST', {}, { origin: 'http://127.0.0.1:5173' }, true)).statusCode).toBe(200);
  });
  it('publishes parser output with opaque per-snapshot file IDs and serves only indexed source', async () => {
    const f = await fixture();
    const indexed = await f.call('confirm', 'POST', {});
    expect(indexed.statusCode).toBe(200);
    const result = indexed.json as GraphResponse;
    expect(result.graph.edges.map((e) => [e.from, e.target])).toEqual([['main.ts', { type: 'file', path: 'dep.ts' }]]);
    expect(result.graph.coverage.files).toMatchObject({ found: 3, parsed: 2, skipped: 1 });
    expect(result.files.map((entry) => entry.path)).toEqual(['dep.ts', 'main.ts']);
    expect(indexed.text).not.toContain('DO NOT READ');
    expect(indexed.text).not.toContain('inert target text');
    expect(indexed.text).not.toContain(f.root);
    const file = result.files.find((entry) => entry.path === 'main.ts')!;
    const source = await f.call(`files/${file.id}?snapshotId=${result.graph.snapshotId}`);
    expect(source.json).toMatchObject({ path: 'main.ts', snapshotId: result.graph.snapshotId, text: "import './dep';\n// inert target text\n" });
    expect(source.headers.get('Cache-Control')).toBe('no-store');
    expect((await f.call(`files/${file.id}`)).statusCode).toBe(400);
    expect((await f.call(`files/main.ts?snapshotId=${result.graph.snapshotId}`)).statusCode).toBe(404);
    expect((await f.call(`files/${randomUUID()}?snapshotId=${result.graph.snapshotId}`)).statusCode).toBe(404);
    expect((await f.call(`files/${file.id}?snapshotId=sha256:${'a'.repeat(64)}`)).statusCode).toBe(409);
    expect((await f.call('confirm', 'POST', {})).statusCode).toBe(409);
  });
  it('rejects cross-project IDs, escaping paths, extra queries and arbitrary files', async () => {
    const f = await fixture();
    for (const path of [`/api/projects/${randomUUID()}/confirm`, `/api/projects/${randomUUID()}/graph`, '/api/projects/../../etc/passwd', `/api/projects/${f.id}/files/%2e%2e`, `/api/projects/${f.id}/graph?path=/etc/passwd`]) expect([400,404]).toContain((await f.call(path, path.endsWith('confirm') ? 'POST' : 'GET', {})).statusCode);
  });
  it('refresh immediately removes old authority and atomically publishes the new snapshot', async () => {
    const f = await fixture();
    const previous = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    const original = f.input.snapshot.bind(f.input);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(f.input, 'snapshot').mockImplementation(async (...args) => { await gate; return original(...args); });
    await writeFile(join(f.root, 'dep.ts'), 'export const value = 2;\n');
    const refresh = f.request('refresh', 'POST', { snapshotId: previous.graph.snapshotId });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect((await f.call('graph')).statusCode).toBe(409);
    expect((await f.call('refresh', 'POST', { snapshotId: previous.graph.snapshotId })).statusCode).toBe(409);
    release(); await refresh.done;
    const next = refresh.res.json as GraphResponse;
    expect(next.graph.snapshotId).not.toBe(previous.graph.snapshotId);
    expect(next.files.map((f) => f.id)).not.toEqual(previous.files.map((f) => f.id));
    expect((await f.call(`files/${previous.files[0]!.id}?snapshotId=${previous.graph.snapshotId}`)).statusCode).toBe(409);
    expect((await f.call(`files/${previous.files[0]!.id}?snapshotId=${next.graph.snapshotId}`)).statusCode).toBe(404);
    expect((await f.call('explanations', 'POST', { snapshotId: previous.graph.snapshotId, path: 'main.ts' })).statusCode).toBe(409);
    expect(f.engine.explain).not.toHaveBeenCalled();
  });
  it('a failed refresh returns no old/partial graph; retry is explicit', async () => {
    const f = await fixture();
    const previous = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    vi.spyOn(f.input, 'snapshot').mockRejectedValueOnce(new InputError('total-bytes-limit'));
    expect((await f.call('refresh', 'POST', { snapshotId: previous.graph.snapshotId })).json).toEqual({ error: { code: 'total-bytes-limit' } });
    expect((await f.call('graph')).statusCode).toBe(409);
    expect((await f.call('confirm', 'POST', {})).statusCode).toBe(200);
  });
  it('closing revokes capability, source and future reads/writes', async () => {
    const f = await fixture();
    await f.call('confirm', 'POST', {});
    expect((await f.call('close', 'POST', {})).json).toEqual({ closed: true });
    expect(f.session.authorized(`Bearer ${f.capability}`)).toBe(false);
    expect((await f.call('graph')).statusCode).toBe(401);
    expect((await f.call('confirm', 'POST', {})).statusCode).toBe(401);
    await expect(f.input.snapshot(f.id, { analysisKey: 'test' })).rejects.toMatchObject({ code: 'revoked' });
  });
});

describe('authorized ExplanationService transport', () => {
  it('accepts only the approved provider body forms and passes them unchanged', async () => {
    const f = await fixture();
    const graph = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    const previewHash = 'a'.repeat(64);
    for (const options of [{}, { provider: 'local' }, { provider: 'cloud', previewHash }]) {
      const response = await f.call('explanations', 'POST', { snapshotId: graph.graph.snapshotId, path: 'main.ts', ...options });
      expect(response.statusCode).toBe(200);
      expect(response.json).toEqual({ type: 'error', code: 'runtime-unavailable', message: 'Labeled service double.' });
      const received = vi.mocked(f.engine.explain).mock.lastCall![0];
      expect(received.snapshot).toBe(f.session.current(f.id).snapshot);
      expect(received.graph).toBe(f.session.current(f.id).response.graph);
      expect(received.selected).toBe('main.ts');
      expect(received.signal).toBeInstanceOf(AbortSignal);
      expect(received).toMatchObject(options);
      if (!('provider' in options)) expect(received).not.toHaveProperty('provider');
      if (!('previewHash' in options)) expect(received).not.toHaveProperty('previewHash');
    }
    expect(f.engine.status).not.toHaveBeenCalled();
    expect(f.engine.preload).not.toHaveBeenCalled();
  });
  it('rejects extra fields, unknown providers and malformed or misplaced preview hashes', async () => {
    const f = await fixture();
    const graph = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    const hash = 'a'.repeat(64);
    const badOptions = [
      { provider: null }, { provider: '' }, { provider: 'automatic' }, { provider: 'Cloud' }, { provider: {} },
      { previewHash: hash }, { provider: 'local', previewHash: hash }, { provider: 'cloud' },
      ...[null, 64, '', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'x'.repeat(64)].map((previewHash) => ({ provider: 'cloud', previewHash })),
      { provider: 'local', extra: 'reject' }, { provider: 'cloud', previewHash: hash, root: f.root },
    ];
    for (const options of badOptions) {
      const response = await f.call('explanations', 'POST', { snapshotId: graph.graph.snapshotId, path: 'main.ts', ...options });
      expect(response.statusCode).toBe(400);
      expect(response.json).toEqual({ error: { code: 'invalid-body' } });
    }
    expect(f.engine.explain).not.toHaveBeenCalled();
  });
  it('keeps authorization and snapshot-only selection checks for cloud bodies', async () => {
    const f = await fixture();
    const graph = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    const body = { snapshotId: graph.graph.snapshotId, path: 'main.ts', provider: 'cloud', previewHash: 'a'.repeat(64) };
    expect((await f.call('explanations', 'POST', body, { authorization: undefined })).statusCode).toBe(401);
    expect((await f.call('explanations', 'POST', body, { origin: undefined })).statusCode).toBe(403);
    expect((await f.call(`/api/projects/${randomUUID()}/explanations`, 'POST', body)).statusCode).toBe(404);
    expect((await f.call('explanations', 'POST', { ...body, snapshotId: 'old' })).json).toEqual({ error: { code: 'stale-snapshot' } });
    expect((await f.call('explanations', 'POST', { ...body, path: '../private.ts' })).json).toEqual({ error: { code: 'invalid-file' } });
    expect(f.engine.explain).not.toHaveBeenCalled();
    expect((await f.call('explanations/preview', 'POST', { snapshotId: body.snapshotId, path: body.path })).statusCode).toBe(404);
    expect((await f.call('/api/session')).json).not.toHaveProperty('cloud');
  });
  it('streams service events as NDJSON without changing parser graph', async () => {
    const f = await fixture();
    const graph = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    const before = JSON.stringify(f.session.current(f.id).response.graph);
    const events: ExplanationEvent[] = [{ type: 'snippets', snippets: [] }, { type: 'token', text: '<script>inert output</script>' }, { type: 'error', code: 'runtime-unavailable', message: 'Labeled service double.' }];
    f.engine.explain = service(events).explain;
    const response = await f.call('explanations', 'POST', { snapshotId: graph.graph.snapshotId, path: 'main.ts' });
    expect(response.headers.get('Content-Type')).toBe('application/x-ndjson');
    expect(response.text.trim().split('\n').map((line) => JSON.parse(line))).toEqual(events);
    expect(JSON.stringify(f.session.current(f.id).response.graph)).toBe(before);
    expect(f.engine.preload).not.toHaveBeenCalled();
  });
  it('aborts an active explanation on refresh and does not publish stale tokens', async () => {
    const f = await fixture();
    const graph = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    let started!: () => void;
    const pending = new Promise<void>((resolve) => { started = resolve; });
    f.engine.explain = async function* ({ signal }) {
      started();
      await new Promise<void>((resolve) => { signal!.addEventListener('abort', () => resolve(), { once: true }); });
      yield { type: 'token', text: 'stale text must not publish' };
    };
    const stream = f.request('explanations', 'POST', { snapshotId: graph.graph.snapshotId, path: 'main.ts' });
    await pending;
    expect((await f.call('explanations', 'POST', { snapshotId: graph.graph.snapshotId, path: 'main.ts' })).statusCode).toBe(409);
    await f.call('refresh', 'POST', { snapshotId: graph.graph.snapshotId });
    await stream.done;
    expect(stream.res.text).not.toContain('stale text');
    expect(stream.res.json).toMatchObject({ type: 'error', code: 'cancelled' });
  });
  it('passes disconnect cancellation to the service and sanitizes unexpected failures', async () => {
    const f = await fixture();
    const graph = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    let started!: () => void;
    const pending = new Promise<void>((resolve) => { started = resolve; });
    let aborted = false;
    f.engine.explain = async function* ({ signal }) {
      started();
      await new Promise<void>((resolve) => { signal!.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true }); });
      throw new Error(`private native error: ${f.root}`);
    };
    const stream = f.request('explanations', 'POST', { snapshotId: graph.graph.snapshotId, path: 'main.ts' });
    await pending; stream.res.emit('close'); await stream.done;
    expect(aborted).toBe(true);
    expect(stream.res.text).not.toContain(f.root);
    expect(stream.res.json).toMatchObject({ type: 'error', code: 'cancelled' });
  });
});
