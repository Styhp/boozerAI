import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExplanationService, type CloudComparison, type ExplanationService } from '../src/server/explain/index.js';
import { createOpenAIAdapter, OPENAI_ENDPOINT, OPENAI_MODEL } from '../src/server/explain/cloud-adapter.js';
import type { ModelAdapter } from '../src/server/explain/model-adapter.js';
import type { ExplanationEvent } from '../src/shared/explanation.js';
import type { RepoChatService } from '../src/shared/repo-chat.js';
import type { GraphResponse } from '../src/shared/project-api.js';
import { handleProjectApi } from '../src/server/project-api.js';
import { InputError, LocalInputAdapter } from '../src/server/local-input.js';
import { ProjectSession } from '../src/server/project-session.js';
import { projectArgument } from '../src/server/launcher.js';
import { FolderPickerError, type FolderPicker } from '../src/server/folder-picker.js';
import { HttpProjectSource, ProjectConnection, takeCapability } from '../src/client/data/http-project-source';

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
function service(events: readonly ExplanationEvent[] = [{ type: 'error', code: 'runtime-unavailable', message: 'Labeled service double.' }]): ExplanationService & CloudComparison & Partial<RepoChatService> {
  return {
    status: vi.fn(async () => ready), preload: vi.fn(async () => ready), explain: vi.fn(async function* () { yield* events; }),
    cloudStatus: vi.fn(() => ({ available: false } as const)),
    previewCloud: vi.fn(() => ({ type: 'error', code: 'cloud-unavailable', message: 'No cloud provider is configured for this launch.' } as const)),
  };
}
function cloudService(key = '') {
  const local: ModelAdapter = {
    status: vi.fn(async () => ready), preload: vi.fn(async () => ready),
    stream: vi.fn(async function* () { throw new Error('The local model must not run during preview.'); }),
  };
  const cloudFetch = vi.fn(async (_url: string, _init?: RequestInit): Promise<Response> => { throw new Error('The cloud must not run during preview or a mismatching send.'); });
  const engine = createExplanationService(local, createOpenAIAdapter({ apiKey: key, fetch: cloudFetch }));
  return { engine, local, cloudFetch };
}
async function fixture(engine = service(), picker?: FolderPicker, empty = false) {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'boozer-api-'));
  roots.push(root);
  await writeFile(join(root, 'main.ts'), "import './dep';\n// inert target text\n");
  await writeFile(join(root, 'dep.ts'), 'export const value = 1;\n');
  await writeFile(join(root, 'credentials.ts'), 'DO NOT READ THIS FILE');
  const input = await LocalInputAdapter.select(root);
  const session = new ProjectSession(empty ? null : input, 'Inert test project', undefined, picker);
  sessions.push(session);
  const capability = new URLSearchParams(new URL(session.launchUrl(false)).hash.slice(1)).get('cap')!;
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

describe('cloud chat preview and send routes', () => {
  it('authorizes previews locally and binds sending to the exact question and documentation option', async () => {
    const { engine, cloudFetch, local } = cloudService('fake-chat-key');
    const f = await fixture(engine);
    const indexed = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    const body = { snapshotId: indexed.graph.snapshotId, question: 'What if I add a coding agent?', history: [], searchDocs: true };
    const preview = await f.call('chat/cloud/preview', 'POST', body);
    expect(preview.statusCode).toBe(200);
    expect(preview.json.endpoint).toBe('https://api.openai.com/v1/responses');
    expect(cloudFetch).not.toHaveBeenCalled(); expect(local.stream).not.toHaveBeenCalled();
    expect((await f.call('chat/cloud', 'POST', body)).statusCode).toBe(400);
    const send = { ...body, previewHash: preview.json.previewHash };
    for (const changed of [{ question: 'Different question' }, { searchDocs: false }, { history: ['Changed history'] }]) {
      expect((await f.call('chat/cloud', 'POST', { ...send, ...changed })).text).toContain('preview-mismatch');
    }
    expect(cloudFetch).not.toHaveBeenCalled();
    const result = await f.call('chat/cloud', 'POST', send);
    expect(result.text).toContain('cloud-error'); // provider double deliberately fails
    expect(cloudFetch).toHaveBeenCalledExactlyOnceWith('https://api.openai.com/v1/responses', expect.objectContaining({ body: preview.json.payloadJson }));
    expect(local.stream).not.toHaveBeenCalled();
  });
  it('retains auth, Origin, body limits, snapshot and inert-input boundaries for both routes', async () => {
    const { engine, cloudFetch } = cloudService('fake-chat-key'); const f = await fixture(engine);
    const indexed = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    for (const action of ['chat/cloud/preview', 'chat/cloud']) {
      const body = { snapshotId: indexed.graph.snapshotId, question: 'How would I extend this?', history: [], searchDocs: false,
        ...(action.endsWith('preview') ? {} : { previewHash: 'a'.repeat(64) }) };
      expect((await f.call(action, 'POST', body, { authorization: undefined })).statusCode).toBe(401);
      expect((await f.call(action, 'POST', body, { origin: 'https://evil.example' })).statusCode).toBe(403);
      expect((await f.call(action, 'POST', body, { 'content-type': 'text/plain' })).statusCode).toBe(415);
      expect((await f.call(action, 'POST', { ...body, question: 'x'.repeat(9000) })).statusCode).toBe(413);
      expect((await f.call(action, 'POST', { ...body, snapshotId: 'old' })).statusCode).toBe(409);
      expect((await f.call(action, 'POST', { ...body, contextPath: 'credentials.ts' })).statusCode).toBe(404);
      for (const extra of [{ source: 'untrusted' }, { provider: 'local' }, { tools: ['shell'] }, { searchDocs: 'true' }]) {
        expect((await f.call(action, 'POST', { ...body, ...extra })).statusCode).toBe(400);
      }
    }
    expect(cloudFetch).not.toHaveBeenCalled();
  });
});

describe('M2 native folder selection route', () => {
  it('requires token, Origin, JSON and an empty POST before invoking the dialog', async () => {
    const picker = vi.fn(async () => null);
    const f = await fixture(service(), picker, true);
    const path = '/api/session/pick';
    expect((await f.call(path, 'POST', {}, { authorization: undefined })).statusCode).toBe(401);
    expect((await f.call(path, 'POST', {}, { origin: 'https://foreign.example' })).statusCode).toBe(403);
    expect((await f.call(path, 'POST', {}, { origin: undefined })).statusCode).toBe(403);
    expect((await f.call(path, 'POST', {}, { 'content-type': 'text/plain' })).statusCode).toBe(415);
    expect((await f.call(path, 'GET')).statusCode).toBe(405);
    expect((await f.call(path + '?root=/etc', 'POST', {})).statusCode).toBe(400);
    for (const payload of [{ root: f.root }, { path: '/etc' }, { command: 'inert' }, '{']) {
      expect((await f.call(path, 'POST', payload)).statusCode).toBe(400);
    }
    expect((await f.call(path, 'POST', { ignored: 'x'.repeat(9000) })).statusCode).toBe(413);
    expect(picker).not.toHaveBeenCalled();
    expect((await f.call(path, 'POST', {})).json).toEqual({ status: 'cancelled' });
    expect(picker).toHaveBeenCalledOnce();
  });
  it('selects only the dialog result and waits for confirmation before reading source', async () => {
    const picker = vi.fn(async (): Promise<string | null> => null);
    const f = await fixture(service(), picker, true);
    picker.mockResolvedValue(f.root);
    const snapshots = vi.spyOn(LocalInputAdapter.prototype, 'snapshot');
    const result = await f.call('/api/session/pick', 'POST', {});
    expect(result.statusCode).toBe(200);
    expect(result.json).toMatchObject({ status: 'selected', project: { state: 'selected' } });
    expect(result.text).not.toContain(f.root);
    expect(result.text).not.toContain(f.capability);
    expect(snapshots).not.toHaveBeenCalled();
    const base = `/api/projects/${result.json.project.id}`;
    expect((await f.call(base + '/graph')).statusCode).toBe(409);
    expect((await f.call(base + '/confirm', 'POST', {})).json.graph.files.map((file: { path: string }) => file.path)).toEqual(['dep.ts', 'main.ts']);
    expect(snapshots).toHaveBeenCalledOnce();
    expect((await f.call('/api/session')).json.project.state).toBe('ready');
  });
  it('closes the old input, snapshot, notes and streams when choosing another folder', async () => {
    const picker = vi.fn(async (): Promise<string | null> => null);
    const f = await fixture(service(), picker);
    const old = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    const stream = f.session.beginChat(f.id, old.graph.snapshotId, new AbortController().signal);
    const oldNotes = f.session.notes(f.id);
    const close = vi.spyOn(f.input, 'close');
    picker.mockResolvedValue(f.root);
    const chosen = (await f.call('/api/session/pick', 'POST', {})).json;
    expect(stream.signal.aborted).toBe(true);
    expect(close).toHaveBeenCalledOnce();
    expect((await f.call('graph')).statusCode).toBe(404);
    expect((await f.call('notes?snapshotId=' + old.graph.snapshotId)).statusCode).toBe(404);
    expect(chosen.project.id).not.toBe(f.id);
    const base = `/api/projects/${chosen.project.id}`;
    const next = (await f.call(base + '/confirm', 'POST', {})).json as GraphResponse;
    expect(f.session.notes(next.projectId)).not.toBe(oldNotes);
    expect(next.files.map((file) => file.id)).not.toEqual(old.files.map((file) => file.id));
    await f.call(base + '/close', 'POST', {});
    expect((await f.call('/api/session/pick', 'POST', {})).statusCode).toBe(401);
    expect(picker).toHaveBeenCalledOnce();
  });
  it('serializes dialog requests and discards late selections on disconnect or shutdown', async () => {
    for (const end of ['disconnect', 'shutdown']) {
      let finish!: (folder: string) => void;
      const picker = vi.fn((_signal: AbortSignal) => new Promise<string>((resolve) => { finish = resolve; }));
      const f = await fixture(service(), picker, true);
      const pending = f.request('/api/session/pick', 'POST', {});
      await vi.waitFor(() => expect(picker).toHaveBeenCalledOnce());
      expect((await f.call('/api/session/pick', 'POST', {})).json).toEqual({ error: { code: 'picker-busy' } });
      if (end === 'disconnect') pending.res.emit('close'); else f.session.close();
      expect(picker.mock.calls[0]![0].aborted).toBe(true);
      finish(f.root); await pending.done;
      expect(f.session.descriptor()).toBeNull();
    }
  });
  it('returns sanitized picker failures and allows a new attempt after cancellation', async () => {
    const picker = vi.fn(async (): Promise<string | null> => null);
    const f = await fixture(service(), picker, true);
    for (const code of ['picker-unavailable', 'picker-timeout'] as const) {
      picker.mockRejectedValueOnce(new FolderPickerError(code));
      expect((await f.call('/api/session/pick', 'POST', {})).json).toEqual({ error: { code } });
    }
    picker.mockRejectedValueOnce(new Error('/private/failure'));
    expect((await f.call('/api/session/pick', 'POST', {})).json).toEqual({ error: { code: 'picker-failed' } });
    expect((await f.call('/api/session/pick', 'POST', {})).json).toEqual({ status: 'cancelled' });
    expect(f.session.descriptor()).toBeNull();
    picker.mockResolvedValueOnce(f.root);
    expect((await f.call('/api/session/pick', 'POST', {})).json.status).toBe('selected');
  });
});

describe('M2 launch and project authority', () => {
  it('serves document citations from the confirmed snapshot with opaque IDs and rejects stale references', async () => {
    const f = await fixture();
    await writeFile(join(f.root, 'README.md'), '# Inert docs\nA different project uses Svelte.\n');
    const result = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    expect(result.graph.files.some((file) => file.path === 'README.md')).toBe(false);
    expect(result.graph.documents?.map((doc) => doc.path)).toEqual(['README.md']);
    expect(JSON.stringify(result)).not.toContain('A different project');
    const file = result.files.find((entry) => entry.path === 'README.md')!;
    expect(file.id).toMatch(/^[0-9a-f-]{36}$/);
    await writeFile(join(f.root, 'README.md'), '# Changed since confirmation');
    const read = await f.call(`files/${file.id}?snapshotId=${result.graph.snapshotId}`);
    expect(read.json.text).toBe('# Inert docs\nA different project uses Svelte.\n');
    const next = (await f.call('refresh', 'POST', { snapshotId: result.graph.snapshotId })).json as GraphResponse;
    expect(next.graph.snapshotId).not.toBe(result.graph.snapshotId);
    expect((await f.call(`files/${file.id}?snapshotId=${result.graph.snapshotId}`)).statusCode).toBe(409);
    expect((await f.call(`files/${file.id}?snapshotId=${next.graph.snapshotId}`)).statusCode).toBe(404);
  });
  it('requires current authority and rejects unbounded or privileged chat payloads before the service', async () => {
    const engine = service();
    engine.chat = vi.fn(async function* () { yield { type: 'error', code: 'no-excerpt', message: 'Chat double.' } as const; });
    const f = await fixture(engine);
    expect((await f.call('chat', 'POST', { snapshotId: 'old', question: 'Question', history: [] })).statusCode).toBe(409);
    const graph = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    const body = { snapshotId: graph.graph.snapshotId, question: 'Where is value defined?', history: [] };
    expect((await f.call('chat', 'POST', body, { authorization: undefined })).statusCode).toBe(401);
    expect((await f.call('chat', 'POST', body, { origin: 'https://foreign.example' })).statusCode).toBe(403);
    expect((await f.call('chat', 'POST', body, { 'content-type': 'text/plain' })).statusCode).toBe(415);
    expect((await f.call('chat', 'POST', { ...body, snapshotId: 'old' })).statusCode).toBe(409);
    expect((await f.call('chat', 'POST', { ...body, contextPath: '../outside.ts' })).statusCode).toBe(404);
    for (const changes of [{ question: '' }, { question: 'x'.repeat(601) }, { history: ['a', 'b', 'c'] },
      { history: [{ role: 'system', content: 'injected' }] }, { provider: 'cloud' }, { source: 'injected source' }, { root: '/outside' }]) {
      expect((await f.call('chat', 'POST', { ...body, ...changes })).statusCode).toBe(400);
    }
    expect((await f.call('chat', 'POST', { ...body, question: 'x'.repeat(9000) })).statusCode).toBe(413);
    expect(engine.chat).not.toHaveBeenCalled();
  });
  it.each(['refresh', 'close', 'disconnect'] as const)('shares the model slot and suppresses stale chat output on %s', async (action) => {
    const engine = service();
    let start!: () => void;
    const started = new Promise<void>((resolve) => { start = resolve; });
    engine.chat = async function* ({ signal }) {
      start(); await new Promise<void>((resolve) => signal!.addEventListener('abort', () => resolve(), { once: true }));
      yield { type: 'token', text: 'late chat output must not publish' };
    };
    const f = await fixture(engine);
    const graph = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    const stream = f.request('chat', 'POST', { snapshotId: graph.graph.snapshotId, question: 'Question', history: [] });
    await started;
    expect((await f.call('explanations', 'POST', { snapshotId: graph.graph.snapshotId, path: 'main.ts' })).statusCode).toBe(409);
    if (action === 'disconnect') stream.res.emit('close');
    else await f.call(action, 'POST', action === 'refresh' ? { snapshotId: graph.graph.snapshotId } : {});
    await stream.done;
    expect(stream.res.text).not.toContain('late chat output');
    expect(stream.res.json).toMatchObject({ type: 'error', code: 'cancelled' });
    if (action !== 'close') {
      const next = f.session.beginExplanation(f.id, graph.graph.snapshotId, 'main.ts', new AbortController().signal); next.finish();
    }
  });
  it('bounds a local chat deadline and reports expiry as timeout', async () => {
    const engine = service();
    let start!: () => void;
    const started = new Promise<void>((resolve) => { start = resolve; });
    engine.chat = async function* ({ signal }) {
      start(); await new Promise<void>((resolve) => signal!.addEventListener('abort', () => resolve(), { once: true }));
      yield { type: 'token', text: 'late deadline text' };
    };
    const f = await fixture(engine);
    const graph = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const stream = f.request('chat', 'POST', { snapshotId: graph.graph.snapshotId, question: 'Question', history: [] });
      await started; await vi.advanceTimersByTimeAsync(370000); await stream.done;
      expect(stream.res.text).not.toContain('late deadline text'); expect(stream.res.json).toMatchObject({ code: 'timeout' });
    } finally { vi.useRealTimers(); }
  });
  it('streams local repository questions against the current snapshot', async () => {
    const engine = service();
    engine.chat = vi.fn(async function* () { yield { type: 'error', code: 'runtime-unavailable', message: 'Labeled chat service double.' } as const; });
    const f = await fixture(engine);
    const graph = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    const response = await f.call('chat', 'POST', { snapshotId: graph.graph.snapshotId, question: 'Where is value defined?', history: [] });
    expect(response.statusCode).toBe(200);
    expect(response.json).toMatchObject({ type: 'error', message: 'Labeled chat service double.' });
    expect(vi.mocked(engine.chat).mock.lastCall![0].snapshot).toBe(f.session.current(f.id).snapshot);
    expect(engine.explain).not.toHaveBeenCalled();
  });
  it('keeps chat local even when an OpenAI key is configured', async () => {
    const { engine, local, cloudFetch } = cloudService('fake-chat-cloud-key');
    const f = await fixture(engine);
    const graph = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    const response = await f.call('chat', 'POST', { snapshotId: graph.graph.snapshotId, question: 'Where is value defined?', history: [] });
    expect(response.statusCode).toBe(200);
    expect(local.status).toHaveBeenCalledOnce(); expect(local.stream).toHaveBeenCalledOnce(); expect(cloudFetch).not.toHaveBeenCalled();
  });
  it.each([150_000, 300_000])('allows a local explanation to finish after the old cutoffs (%i ms)', async (durationMs) => {
    const f = await fixture();
    const graph = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    let started!: () => void;
    const pending = new Promise<void>((resolve) => { started = resolve; });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      f.engine.explain = async function* ({ signal }) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, durationMs);
          signal!.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
          started();
        });
        if (signal!.aborted) return;
        yield {
          type: 'done',
          explanation: { text: 'Slow local service double.', snippets: [], citations: [], model: { runtime: 'test', name: 'test', location: 'local' }, durationMs },
          details: { promptVersion: 'test', modelDigest: 'test', runtimeVersion: 'test', promptTokens: 0, outputTokens: 0, truncated: false, thinkingSeen: false, mentions: [], suspectedInjections: [] },
        };
      };
      const stream = f.request('explanations', 'POST', { snapshotId: graph.graph.snapshotId, path: 'main.ts' });
      await pending;
      await vi.advanceTimersByTimeAsync(durationMs);
      await stream.done;
      expect(stream.res.json).toMatchObject({ type: 'done', explanation: { text: 'Slow local service double.' } });
    } finally { vi.useRealTimers(); }
  });
  it('reports the bounded local route deadline as timeout and releases the active stream', async () => {
    const f = await fixture();
    const graph = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    let started!: () => void;
    const pending = new Promise<void>((resolve) => { started = resolve; });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      f.engine.explain = async function* ({ signal }) {
        started();
        await new Promise<void>((resolve) => signal!.addEventListener('abort', () => resolve(), { once: true }));
        yield { type: 'token', text: 'late text must not publish' };
      };
      const stream = f.request('explanations', 'POST', { snapshotId: graph.graph.snapshotId, path: 'main.ts' });
      await pending;
      await vi.advanceTimersByTimeAsync(370_000);
      await stream.done;
      expect(stream.res.json).toMatchObject({ type: 'error', code: 'timeout' });
      expect(stream.res.text).not.toContain('late text');
      const next = f.session.beginExplanation(f.id, graph.graph.snapshotId, 'main.ts', new AbortController().signal);
      next.finish();
    } finally { vi.useRealTimers(); }
  });
  it('reloads the same confirmed graph and source through the real API without reading target files again', async () => {
    const f = await fixture();
    const confirmed = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    const snapshot = vi.spyOn(f.input, 'snapshot');
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    const location = { hash: `#cap=${f.capability}`, pathname: '/', search: '' };
    takeCapability(location, { replaceState: () => { location.hash = ''; } }, storage);
    const capability = takeCapability(location, { replaceState: vi.fn() }, storage)!;
    const transport = vi.fn(async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      const response = await f.call(url, init.method, undefined, { authorization: headers.Authorization });
      return new Response(response.text, { status: response.statusCode });
    });
    const connection = new ProjectConnection(capability, transport);
    const restored = await connection.resume();
    expect(restored.project?.state).toBe('ready');
    expect(restored.response).toEqual(confirmed);
    const source = new HttpProjectSource(connection, restored.response!);
    expect(await source.loadGraph()).toEqual(confirmed.graph);
    expect(await source.loadSource('main.ts')).toMatchObject({ snapshotId: confirmed.graph.snapshotId, path: 'main.ts', text: "import './dep';\n// inert target text\n" });
    expect(snapshot).not.toHaveBeenCalled();
    for (const [, init] of transport.mock.calls) expect(init.method).toBe('GET');
  });
  it('accepts one explicit launcher root, never browser-supplied roots or Origin switches', () => {
    expect(projectArgument([])).toBeNull();
    expect(projectArgument(['--project', '.'])).toBe('.');
    for (const args of [['.'], ['--project'], ['--project', '.', '--dev'], ['--origin', 'http://evil.example']]) expect(() => projectArgument(args)).toThrow();
  });
  it('exposes only pending opaque metadata until explicit confirmation', async () => {
    const f = await fixture();
    const read = vi.spyOn(f.input, 'snapshot');
    const status = await f.call('/api/session');
    expect(status.json).toEqual({ project: { id: f.id, label: 'Inert test project', state: 'selected' }, cloud: { available: false } });
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
      for (const [path, method] of [['/api/session', 'GET'], ['graph', 'GET'], ['confirm', 'POST'], ['refresh', 'POST'], ['close', 'POST'], ['explanations', 'POST'], ['explanations/preview', 'POST'], ['/api/unknown', 'GET']]) {
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

describe('P-16 authenticated cloud preview transport', () => {
  const key = 'sk-fake-route-test-key-never-real';
  it('publishes only safe cloud status after authorization without reading source or calling a model', async () => {
    const { engine, local, cloudFetch } = cloudService(key);
    const f = await fixture(engine);
    const read = vi.spyOn(f.input, 'snapshot');
    const status = vi.spyOn(engine, 'cloudStatus');
    expect((await f.call('/api/session', 'GET', undefined, { authorization: undefined })).statusCode).toBe(401);
    expect(status).not.toHaveBeenCalled();
    const response = await f.call('/api/session');
    expect(response.json).toEqual({ project: f.session.descriptor(), cloud: { available: true, provider: 'OpenAI', model: OPENAI_MODEL, endpoint: OPENAI_ENDPOINT } });
    for (const secret of [key, f.capability, f.root, 'DO NOT READ']) expect(response.text).not.toContain(secret);
    expect(status).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
    expect(local.status).not.toHaveBeenCalled();
    expect(local.preload).not.toHaveBeenCalled();
    expect(cloudFetch).not.toHaveBeenCalled();
  });
  it('returns the exact preview object from the current in-memory snapshot without sending or rereading files', async () => {
    const { engine, local, cloudFetch } = cloudService(key);
    const f = await fixture(engine);
    const indexed = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    const current = f.session.current(f.id);
    const before = JSON.stringify(current);
    const expected = engine.previewCloud({ snapshot: current.snapshot, graph: current.response.graph, selected: 'main.ts' });
    if (expected.type !== 'preview') throw new Error('Expected an offline preview.');
    const preview = vi.spyOn(engine, 'previewCloud');
    const read = vi.spyOn(f.input, 'snapshot');
    await writeFile(join(f.root, 'main.ts'), 'CHANGED ON DISK AFTER SNAPSHOT');
    const response = await f.call('explanations/preview', 'POST', { snapshotId: indexed.graph.snapshotId, path: 'main.ts' });
    expect(response.statusCode).toBe(200);
    expect(response.json).toEqual(expected.preview);
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const received = preview.mock.lastCall![0];
    expect(received.snapshot).toBe(current.snapshot);
    expect(received.graph).toBe(current.response.graph);
    expect(received.selected).toBe('main.ts');
    expect(received.signal).toBeInstanceOf(AbortSignal);
    expect(response.json.payloadJson).toContain('inert target text');
    for (const secret of [key, f.capability, f.root, 'DO NOT READ', 'CHANGED ON DISK']) expect(response.text).not.toContain(secret);
    expect(JSON.stringify(current)).toBe(before);
    expect(read).not.toHaveBeenCalled();
    expect(local.status).not.toHaveBeenCalled();
    expect(local.stream).not.toHaveBeenCalled();
    expect(cloudFetch).not.toHaveBeenCalled();
  });
  it('requires token, exact Origin/JSON, exact body, project and current snapshot before previewing', async () => {
    const f = await fixture();
    const preview = vi.mocked(f.engine.previewCloud);
    expect((await f.call('explanations/preview', 'POST', { snapshotId: 'old', path: 'main.ts' })).json).toEqual({ error: { code: 'not-indexed' } });
    const graph = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    const body = { snapshotId: graph.graph.snapshotId, path: 'main.ts' };
    expect((await f.call('explanations/preview', 'POST', body, { authorization: undefined })).statusCode).toBe(401);
    for (const origin of [undefined, 'null', 'http://evil.example', 'http://127.0.0.1:5173', 'http://localhost:4173']) {
      expect((await f.call('explanations/preview', 'POST', body, { origin })).statusCode).toBe(403);
    }
    expect((await f.call('explanations/preview', 'POST', body, { 'content-type': 'text/plain' })).statusCode).toBe(415);
    expect((await f.call('explanations/preview', 'POST', 'x'.repeat(8_193))).statusCode).toBe(413);
    for (const value of [{}, { snapshotId: body.snapshotId }, { ...body, path: '' }, { ...body, snapshotId: null }, { ...body, provider: 'cloud' }, { ...body, previewHash: 'a'.repeat(64) }, { ...body, root: f.root }, [], 'null', '{']) {
      const response = await f.call('explanations/preview', 'POST', value);
      expect(response.statusCode).toBe(400);
      expect(response.json).toEqual({ error: { code: 'invalid-body' } });
    }
    expect((await f.call(`/api/projects/${randomUUID()}/explanations/preview`, 'POST', body)).json).toEqual({ error: { code: 'invalid-project' } });
    expect((await f.call('explanations/preview', 'POST', { ...body, snapshotId: 'old' })).json).toEqual({ error: { code: 'stale-snapshot' } });
    expect((await f.call('explanations/preview?x=y', 'POST', body)).statusCode).toBe(400);
    expect((await f.call('explanations/preview', 'GET')).statusCode).toBe(405);
    expect(preview).not.toHaveBeenCalled();
    // The dev exception remains explicit, with the same production Host restriction in app.ts.
    expect((await f.call('explanations/preview', 'POST', body, { origin: 'http://127.0.0.1:5173' }, true)).json).toEqual({ error: { code: 'cloud-unavailable' } });
    expect(preview).toHaveBeenCalledTimes(1);
  });
  it('maps unavailable, invalid-selection, no-excerpt and stale-snapshot errors without model calls', async () => {
    for (const configured of [false, true]) {
      const { engine, local, cloudFetch } = cloudService(configured ? key : '');
      const f = await fixture(engine);
      await writeFile(join(f.root, 'long.ts'), `//${'x'.repeat(20_000)}\n`);
      const graph = (await f.call('confirm', 'POST', {})).json as GraphResponse;
      const body = { snapshotId: graph.graph.snapshotId, path: 'main.ts' };
      const unavailable = await f.call('explanations/preview', 'POST', body);
      expect(unavailable.statusCode).toBe(configured ? 200 : 404);
      if (!configured) expect(unavailable.json).toEqual({ error: { code: 'cloud-unavailable' } });
      if (configured) {
        for (const path of ['../private.ts', '/etc/passwd', 'credentials.ts', '%2e%2e/private.ts']) {
          const response = await f.call('explanations/preview', 'POST', { ...body, path });
          expect(response.statusCode).toBe(400);
          expect(response.json).toEqual({ error: { code: 'invalid-selection' } });
        }
        const noExcerpt = await f.call('explanations/preview', 'POST', { ...body, path: 'long.ts' });
        expect(noExcerpt.statusCode).toBe(400);
        expect(noExcerpt.json).toEqual({ error: { code: 'no-excerpt' } });
      }
      const stale = await f.call('explanations/preview', 'POST', { ...body, snapshotId: 'old' });
      expect(stale.statusCode).toBe(409);
      expect(stale.json).toEqual({ error: { code: 'stale-snapshot' } });
      expect(local.status).not.toHaveBeenCalled();
      expect(local.stream).not.toHaveBeenCalled();
      expect(cloudFetch).not.toHaveBeenCalled();
    }
  });
  it('rejects a mismatching confirmed hash before any model call and passes the fixed service message unchanged', async () => {
    const { engine, local, cloudFetch } = cloudService(key);
    const f = await fixture(engine);
    const graph = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    const response = await f.call('explanations', 'POST', { snapshotId: graph.graph.snapshotId, path: 'main.ts', provider: 'cloud', previewHash: 'a'.repeat(64) });
    expect(response.statusCode).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/x-ndjson');
    expect(response.json).toEqual({ type: 'error', code: 'preview-mismatch', message: 'The request differs from the preview you confirmed. Preview it again before sending.' });
    expect(local.status).not.toHaveBeenCalled();
    expect(local.stream).not.toHaveBeenCalled();
    expect(cloudFetch).not.toHaveBeenCalled();
  });
  it('sends the exact preview payload only on an explicit matching-hash explanation, using a fake provider', async () => {
    const { engine, local, cloudFetch } = cloudService(key);
    const f = await fixture(engine);
    const graph = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    const body = { snapshotId: graph.graph.snapshotId, path: 'main.ts' };
    const preview = (await f.call('explanations/preview', 'POST', body)).json;
    expect(cloudFetch).not.toHaveBeenCalled();
    cloudFetch.mockResolvedValueOnce(new Response([
      `data: ${JSON.stringify({ model: 'reported-model-double', choices: [{ delta: { content: 'It imports dep.ts [S1].' }, finish_reason: null }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`,
      'data: [DONE]\n\n',
    ].join('')));
    const response = await f.call('explanations', 'POST', { ...body, provider: 'cloud', previewHash: preview.previewHash });
    expect(response.statusCode).toBe(200);
    const events: ExplanationEvent[] = response.text.trim().split('\n').map((line) => JSON.parse(line));
    expect(events.map((event) => event.type)).toEqual(['snippets', 'token', 'done']);
    expect(events.at(-1)).toMatchObject({ type: 'done', explanation: { model: { location: 'cloud', name: 'reported-model-double' } } });
    expect(cloudFetch).toHaveBeenCalledTimes(1);
    expect(cloudFetch.mock.calls[0]).toEqual([OPENAI_ENDPOINT, expect.objectContaining({ body: preview.payloadJson, redirect: 'error', signal: expect.any(AbortSignal) })]);
    expect(response.text).not.toContain(key);
    expect(local.status).not.toHaveBeenCalled();
    expect(local.stream).not.toHaveBeenCalled();
  });
  it('invalidates previews on refresh/close and sanitizes unexpected preview exceptions', async () => {
    const f = await fixture();
    const graph = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    const body = { snapshotId: graph.graph.snapshotId, path: 'main.ts' };
    vi.mocked(f.engine.previewCloud).mockImplementationOnce(() => { throw new Error(`private exception: ${f.root}`); });
    const failed = await f.call('explanations/preview', 'POST', body);
    expect(failed.statusCode).toBe(500);
    expect(failed.json).toEqual({ error: { code: 'request-failed' } });
    await writeFile(join(f.root, 'main.ts'), 'export const changed = 1;\n');
    await f.call('refresh', 'POST', { snapshotId: body.snapshotId });
    expect((await f.call('explanations/preview', 'POST', body)).json).toEqual({ error: { code: 'stale-snapshot' } });
    await f.call('close', 'POST', {});
    expect((await f.call('explanations/preview', 'POST', body)).statusCode).toBe(401);
    expect(f.engine.previewCloud).toHaveBeenCalledTimes(1);
  });
});

describe('file history and cloud model selection routes', () => {
  it('only exposes history for confirmed file IDs behind auth, Origin and snapshot checks', async () => {
    const f = await fixture(); const indexed = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    const action = `files/${indexed.files[0]!.id}/history`; const body = { snapshotId: indexed.graph.snapshotId };
    expect((await f.call(action, 'POST', body, { authorization: undefined })).statusCode).toBe(401);
    expect((await f.call(action, 'POST', body, { origin: 'https://evil.example' })).statusCode).toBe(403);
    expect((await f.call(action, 'POST', { snapshotId: 'old' })).statusCode).toBe(409);
    expect((await f.call(action, 'POST', { ...body, path: '../outside' })).statusCode).toBe(400);
    const result = await f.call(action, 'POST', body);
    expect(result.statusCode).toBe(200); expect(result.json).toMatchObject({ snapshotId: body.snapshotId, path: indexed.files[0]!.path, git: { status: 'not-repository' } });
    expect(result.text).not.toContain(f.root); expect(result.text).not.toContain('DO NOT READ');
  });
  it('model listing requires an explicit authenticated POST without project content', async () => {
    const listCloudModels = vi.fn(async () => ['selected-model']); const f = await fixture({ ...service(), listCloudModels });
    await f.call('/api/session'); expect(listCloudModels).not.toHaveBeenCalled();
    expect((await f.call('/api/cloud/models', 'GET')).statusCode).toBe(405);
    expect((await f.call('/api/cloud/models', 'POST', {}, { origin: undefined })).statusCode).toBe(403);
    expect((await f.call('/api/cloud/models', 'POST', {}, { authorization: undefined })).statusCode).toBe(401);
    expect((await f.call('/api/cloud/models', 'POST', { question: 'unwanted data' })).statusCode).toBe(400);
    expect(listCloudModels).not.toHaveBeenCalled();
    expect((await f.call('/api/cloud/models', 'POST', {})).json).toEqual({ models: ['selected-model'] });
    expect(listCloudModels).toHaveBeenCalledTimes(1);
  });
  it('carries the selected comparison model end to end and invalidates a mismatching send', async () => {
    const { engine, cloudFetch } = cloudService('fake-key'); const f = await fixture(engine);
    const indexed = (await f.call('confirm', 'POST', {})).json as GraphResponse;
    const body = { snapshotId: indexed.graph.snapshotId, path: 'main.ts', model: 'chosen-model' };
    const preview = await f.call('explanations/preview', 'POST', body);
    expect(preview.statusCode).toBe(200); expect(preview.json.model).toBe('chosen-model');
    expect((await f.call('explanations', 'POST', { ...body, model: 'changed', provider: 'cloud', previewHash: preview.json.previewHash })).text).toContain('preview-mismatch');
    expect(cloudFetch).not.toHaveBeenCalled();
    await f.call('explanations', 'POST', { ...body, provider: 'cloud', previewHash: preview.json.previewHash });
    expect(cloudFetch).toHaveBeenCalledExactlyOnceWith(OPENAI_ENDPOINT, expect.objectContaining({ body: preview.json.payloadJson }));
    expect((await f.call('explanations', 'POST', { ...body, provider: 'local' })).statusCode).toBe(400);
  });
});
