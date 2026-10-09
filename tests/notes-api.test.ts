import { randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloudComparison, ExplanationService } from '../src/server/explain/index.js';
import type { NotesResponse } from '../src/shared/notes.js';
import type { GraphResponse } from '../src/shared/project-api.js';
import { handleProjectApi } from '../src/server/project-api.js';
import { LocalInputAdapter } from '../src/server/local-input.js';
import { LocalStore } from '../src/server/local-store.js';
import { ProjectSession } from '../src/server/project-session.js';

// Project notes phase 1 through the real API handler, in-process (no sockets, no model).
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
const temps: string[] = [];
const sessions: ProjectSession[] = [];
async function temp(prefix: string) {
  const dir = await mkdtemp(join(await realpath(tmpdir()), prefix));
  temps.push(dir);
  return dir;
}
function service(): ExplanationService & CloudComparison {
  const ready = { state: 'ready', model: 'service-double', runtimeVersion: 'test', digest: 'test' } as const;
  return {
    cloudStatus: vi.fn(() => ({ available: false } as const)),
    previewCloud: vi.fn(() => ({ type: 'error', code: 'cloud-unavailable', message: 'No cloud provider is configured for this launch.' } as const)),
    status: vi.fn(async () => ready), preload: vi.fn(async () => ready), explain: vi.fn(async function* () { yield { type: 'error' as const, code: 'runtime-unavailable' as const, message: 'Labeled service double.' }; }),
  };
}
const MAIN = "import './dep';\n// first linked line\n// second linked line\nexport const x = 1;\n";
async function project(root?: string) {
  const dir = root ?? await temp('boozer-notes-root-');
  await writeFile(join(dir, 'main.ts'), MAIN);
  await writeFile(join(dir, 'dep.ts'), 'export const value = 1;\n');
  await writeFile(join(dir, 'credentials.ts'), 'DO NOT READ THIS FILE');
  return dir;
}
async function launch(root: string, dataDir: string | null) {
  const input = await LocalInputAdapter.select(root);
  const session = new ProjectSession(input, 'Inert notes project', dataDir === null ? null : new LocalStore(dataDir));
  sessions.push(session);
  const capability = new URLSearchParams(new URL(session.launchUrl(false)).hash.slice(1)).get('cap')!;
  const engine = service();
  const id = input.projectId;
  const call = async (action: string, method = 'GET', value?: unknown, headers: Record<string, string | undefined> = {}) => {
    const req = Readable.from(value === undefined ? [] : [Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))]) as unknown as IncomingMessage;
    req.method = method;
    req.url = action.startsWith('/api/') ? action : `/api/projects/${id}/${action}`;
    req.headers = { host: '127.0.0.1:4173', authorization: `Bearer ${capability}`, origin: 'http://127.0.0.1:4173', 'content-type': 'application/json', ...headers };
    const res = new ResponseSink();
    await handleProjectApi(req, res as unknown as ServerResponse, session, engine, false);
    return res;
  };
  const confirm = async () => (await call('confirm', 'POST', {})).json as GraphResponse;
  const list = async (snapshotId: string) => (await call(`notes?snapshotId=${snapshotId}`)).json as NotesResponse;
  return { root, session, capability, engine, id, call, confirm, list, key: input.storageIdentity().key };
}
const exists = async (path: string) => stat(path).then(() => true, () => false);
afterEach(async () => {
  sessions.splice(0).forEach((session) => session.close());
  vi.restoreAllMocks();
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const routes = (snapshotId: string, noteId = 'c'.repeat(32)): [string, string, unknown][] => [
  [`notes?snapshotId=${snapshotId}`, 'GET', undefined],
  ['notes/enable', 'POST', {}],
  ['notes/disable', 'POST', {}],
  ['notes', 'POST', { snapshotId, kind: 'decision', text: 'x' }],
  [`notes/${noteId}`, 'POST', { snapshotId, revision: 1, text: 'y' }],
  [`notes/${noteId}/delete`, 'POST', { revision: 1 }],
  ['notes/clear', 'POST', {}],
];

describe('notes routes: authority and validation', () => {
  it('reject a missing or wrong capability (401) and a bad Origin on POST (403)', async () => {
    const data = join(await temp('boozer-data-'), 'app');
    const f = await launch(await project(), data);
    const graph = await f.confirm();
    for (const [path, method, body] of routes(graph.graph.snapshotId)) {
      for (const authorization of [undefined, 'Bearer wrong', `bearer ${f.capability}`]) {
        expect((await f.call(path, method, body, { authorization })).statusCode).toBe(401);
      }
      if (method === 'POST') {
        for (const origin of [undefined, 'null', 'https://evil.example', 'http://127.0.0.1:5173', 'http://localhost:4173']) {
          expect((await f.call(path, method, body, { origin })).statusCode).toBe(403);
        }
        expect((await f.call(path, method, body, { 'content-type': 'text/plain' })).statusCode).toBe(415);
        expect((await f.call(path, method, 'x'.repeat(8_193))).statusCode).toBe(413);
      }
    }
    expect(await exists(data)).toBe(false);
  });

  it('reject a wrong project (404), an unindexed project (409) and a stale snapshot (409)', async () => {
    const data = join(await temp('boozer-data-'), 'app');
    const f = await launch(await project(), data);
    const stale = `sha256:${'a'.repeat(64)}`;
    for (const [path, method, body] of routes(stale)) {
      expect((await f.call(path, method, body)).json).toEqual({ error: { code: 'not-indexed' } });
      expect((await f.call(`/api/projects/${randomUUID()}/${path}`, method, body)).statusCode).toBe(404);
    }
    await f.confirm();
    expect((await f.call('notes/enable', 'POST', {})).statusCode).toBe(200);
    for (const [path, method, body] of routes(stale).filter(([path, method]) => method === 'GET' || path === 'notes' || /^notes\/c+$/.test(path))) {
      expect((await f.call(path, method, body)).json).toEqual({ error: { code: 'stale-snapshot' } });
    }
  });

  it('accept exact field sets only and reject malformed queries, paths and methods', async () => {
    const data = join(await temp('boozer-data-'), 'app');
    const f = await launch(await project(), data);
    const snapshotId = (await f.confirm()).graph.snapshotId;
    for (const [path, method, body] of routes(snapshotId)) {
      if (method === 'POST') expect((await f.call(path, method, { ...(body as object), root: f.root })).json).toEqual({ error: { code: 'invalid-body' } });
    }
    expect((await f.call('notes/enable', 'POST', {})).statusCode).toBe(200);
    const bad = [
      { snapshotId, kind: 'fact', text: 'x' }, { snapshotId, kind: 'decision', text: '   ' }, { snapshotId, kind: 'decision', text: 7 },
      { snapshotId, kind: 'decision' }, { kind: 'decision', text: 'x' }, { snapshotId: 'old', kind: 'decision', text: 'x' },
      { snapshotId, kind: 'decision', text: 'x', link: 'main.ts' },
      { snapshotId, kind: 'decision', text: 'x', link: { path: 'main.ts', startLine: 1 } },
      { snapshotId, kind: 'decision', text: 'x', link: { path: 'main.ts', startLine: 1, endLine: 1, fileHash: 'a'.repeat(64) } },
      { snapshotId, kind: 'decision', text: 'x', link: { path: 'main.ts', startLine: '1', endLine: 1 } },
      { snapshotId, kind: 'decision', text: 'x', link: { path: 'main.ts', startLine: 0, endLine: 1 } },
      { snapshotId, kind: 'decision', text: 'x', link: { path: 'main.ts', startLine: 1.5, endLine: 2 } },
    ];
    for (const body of bad) expect((await f.call('notes', 'POST', body)).json).toEqual({ error: { code: 'invalid-body' } });
    expect((await f.call('notes', 'POST', { snapshotId, kind: 'decision', text: 'x'.repeat(2_001) })).json).toEqual({ error: { code: 'note-too-long' } });
    for (const query of ['notes', 'notes?snapshotId=old', `notes?snapshotId=${snapshotId}&root=/`, `notes?path=main.ts`]) {
      expect((await f.call(query)).statusCode).toBe(400);
    }
    expect((await f.call(`notes/enable?snapshotId=${snapshotId}`, 'POST', {})).statusCode).toBe(400);
    for (const path of ['notes/unknown', 'notes/../confirm', `notes/${'c'.repeat(32)}/remove`, 'notes/enable/x', `notes/${'C'.repeat(32)}`, 'notes//enable']) {
      expect((await f.call(path, 'POST', {})).statusCode).toBe(404);
    }
    expect((await f.call('notes/enable')).statusCode).toBe(405);
    expect((await f.call(`notes?snapshotId=${snapshotId}`, 'DELETE')).statusCode).toBe(405);
  });

  it('links only to a source file in the current snapshot and only to lines inside it', async () => {
    const data = join(await temp('boozer-data-'), 'app');
    const f = await launch(await project(), data);
    const snapshotId = (await f.confirm()).graph.snapshotId;
    await f.call('notes/enable', 'POST', {});
    for (const path of ['credentials.ts', '../main.ts', join(f.root, 'main.ts'), 'MAIN.ts', './main.ts', 'nope.ts']) {
      expect((await f.call('notes', 'POST', { snapshotId, kind: 'decision', text: 'x', link: { path, startLine: 1, endLine: 1 } })).json).toEqual({ error: { code: 'invalid-file' } });
    }
    for (const [startLine, endLine] of [[1, 5], [3, 2], [5, 5]]) {
      expect((await f.call('notes', 'POST', { snapshotId, kind: 'decision', text: 'x', link: { path: 'main.ts', startLine, endLine } })).json).toEqual({ error: { code: 'invalid-range' } });
    }
    expect((await f.list(snapshotId)).notes).toEqual([]);
  });
});

describe('notes off by default: existing behavior unchanged', () => {
  it('creates no file or directory in the data dir unless notes are enabled', async () => {
    const data = join(await temp('boozer-data-'), 'app');
    const f = await launch(await project(), data);
    expect((await f.call('/api/session')).statusCode).toBe(200);
    const graph = await f.confirm();
    expect((await f.call('graph')).statusCode).toBe(200);
    const file = graph.files.find((entry) => entry.path === 'main.ts')!;
    expect((await f.call(`files/${file.id}?snapshotId=${graph.graph.snapshotId}`)).statusCode).toBe(200);
    expect((await f.call('explanations', 'POST', { snapshotId: graph.graph.snapshotId, path: 'main.ts' })).statusCode).toBe(200);
    expect(await f.list(graph.graph.snapshotId)).toEqual({ enabled: false, state: 'ok', notes: [] });
    expect((await f.call('notes', 'POST', { snapshotId: graph.graph.snapshotId, kind: 'decision', text: 'x' })).json).toEqual({ error: { code: 'notes-disabled' } });
    expect((await f.call('notes/clear', 'POST', {})).json).toEqual({ error: { code: 'notes-disabled' } });
    expect((await f.call('notes/disable', 'POST', {})).json).toEqual({ enabled: false });
    const refreshed = (await f.call('refresh', 'POST', { snapshotId: graph.graph.snapshotId })).json as GraphResponse;
    expect(await f.list(refreshed.graph.snapshotId)).toEqual({ enabled: false, state: 'ok', notes: [] });
    expect(await exists(data)).toBe(false);
    expect(await readdir(f.root)).toEqual(expect.arrayContaining(['main.ts', 'dep.ts', 'credentials.ts']));
    expect((await readdir(f.root)).sort()).toEqual(['credentials.ts', 'dep.ts', 'main.ts']);
  });

  it('reports notes unavailable when there is no app data directory, without breaking other routes', async () => {
    const f = await launch(await project(), null);
    const graph = await f.confirm();
    expect((await f.call(`notes?snapshotId=${graph.graph.snapshotId}`)).json).toEqual({ error: { code: 'notes-unavailable' } });
    expect((await f.call('graph')).statusCode).toBe(200);
  });
});

describe('notes lifecycle', () => {
  it('enables, saves a server-stamped linked note, and returns no path, key or hash to the browser', async () => {
    const data = join(await temp('boozer-data-'), 'app');
    const f = await launch(await project(), data);
    const snapshotId = (await f.confirm()).graph.snapshotId;
    expect((await f.call('notes/enable', 'POST', {})).json).toEqual({ enabled: true });
    const created = await f.call('notes', 'POST', { snapshotId, kind: 'constraint', text: '  Keep these two lines together.  ', link: { path: 'main.ts', startLine: 2, endLine: 3 } });
    expect(created.statusCode).toBe(200);
    const listing = await f.call(`notes?snapshotId=${snapshotId}`);
    const body = listing.json as NotesResponse;
    expect(body.enabled).toBe(true);
    expect(body.state).toBe('ok');
    expect(body.notes).toHaveLength(1);
    expect(body.notes[0]).toMatchObject({ status: 'current', note: { kind: 'constraint', text: 'Keep these two lines together.', revision: 1, link: { file: 'main.ts', startLine: 2, endLine: 3 } } });
    expect(Object.keys(body.notes[0]!.note.link!).sort()).toEqual(['endLine', 'file', 'startLine']);
    expect(body.notes[0]!.note.id).toMatch(/^[0-9a-f]{32}$/);
    for (const text of [listing.text, created.text]) {
      expect(text).not.toContain(f.root);
      expect(text).not.toContain(f.key);
      expect(text).not.toContain(data);
      expect(text).not.toMatch(/[0-9a-f]{64}/);
      expect(text).not.toContain('first linked line');
    }
    expect(listing.headers.get('Cache-Control')).toBe('no-store');
    // Stored server-side with hashes, outside the root, under the opaque key only.
    expect(await readdir(data)).toEqual([`notes-${f.key}.json`]);
    const stored = JSON.parse(await readFile(join(data, `notes-${f.key}.json`), 'utf8'));
    expect(stored.schemaVersion).toBe(1);
    expect(stored.notes[0].link).toMatchObject({ file: 'main.ts', startLine: 2, endLine: 3, fileHash: expect.stringMatching(/^[0-9a-f]{64}$/), rangeHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(JSON.stringify(stored)).not.toContain(f.root);
    expect((await readdir(f.root)).sort()).toEqual(['credentials.ts', 'dep.ts', 'main.ts']);
    // The model service never sees notes.
    expect(f.engine.explain).not.toHaveBeenCalled();
  });

  it('persists across a launcher restart and follows the file: moved, relinked, stale, missing', async () => {
    const data = join(await temp('boozer-data-'), 'app');
    const root = await project();
    const first = await launch(root, data);
    const snap1 = (await first.confirm()).graph.snapshotId;
    await first.call('notes/enable', 'POST', {});
    await first.call('notes', 'POST', { snapshotId: snap1, kind: 'decision', text: 'Linked', link: { path: 'main.ts', startLine: 2, endLine: 3 } });
    await first.call('notes', 'POST', { snapshotId: snap1, kind: 'question', text: 'Unlinked' });
    first.session.close();

    // Restart: a new session for the same root sees the notes (consent = the file exists).
    const second = await launch(root, data);
    const snap2 = (await second.confirm()).graph.snapshotId;
    const listed = await second.list(snap2);
    expect(listed.enabled).toBe(true);
    expect(listed.notes.map((n) => [n.note.text, n.status])).toEqual([['Linked', 'current'], ['Unlinked', 'not-linked']]);
    const linked = listed.notes[0]!.note;

    await writeFile(join(root, 'main.ts'), `// inserted above\n${MAIN}`);
    const snap3 = ((await second.call('refresh', 'POST', { snapshotId: snap2 })).json as GraphResponse).graph.snapshotId;
    const moved = (await second.list(snap3)).notes[0]!;
    expect(moved).toMatchObject({ status: 'moved', movedTo: { startLine: 3, endLine: 4 }, note: { link: { startLine: 2, endLine: 3 } } });
    expect((await second.call(`notes/${linked.id}`, 'POST', { snapshotId: snap3, revision: 99, relink: 'moved' })).json).toEqual({ error: { code: 'revision-conflict' } });
    expect((await second.call(`notes/${linked.id}`, 'POST', { snapshotId: snap3, revision: 1, relink: 'later' })).json).toEqual({ error: { code: 'invalid-body' } });
    expect((await second.call(`notes/${linked.id}`, 'POST', { snapshotId: snap3, revision: 1, relink: 'moved' })).statusCode).toBe(200);
    const relinked = (await second.list(snap3)).notes[0]!;
    expect(relinked).toMatchObject({ status: 'current', note: { revision: 2, link: { startLine: 3, endLine: 4 } } });
    expect((await second.call(`notes/${linked.id}`, 'POST', { snapshotId: snap3, revision: 2, relink: 'moved' })).json).toEqual({ error: { code: 'not-moved' } });

    await writeFile(join(root, 'main.ts'), `// inserted above\nimport './dep';\n// first linked line EDITED\n// second linked line\nexport const x = 1;\n`);
    const snap4 = ((await second.call('refresh', 'POST', { snapshotId: snap3 })).json as GraphResponse).graph.snapshotId;
    const stale = (await second.list(snap4)).notes[0]!;
    expect(stale).toEqual(expect.objectContaining({ status: 'stale', currentText: '// first linked line EDITED\n// second linked line' }));

    await rm(join(root, 'main.ts'));
    const snap5 = ((await second.call('refresh', 'POST', { snapshotId: snap4 })).json as GraphResponse).graph.snapshotId;
    expect((await second.list(snap5)).notes[0]!.status).toBe('missing');
  });

  it('edits with revision checks, deletes, clears, and disables without deleting the file', async () => {
    const data = join(await temp('boozer-data-'), 'app');
    const f = await launch(await project(), data);
    const snapshotId = (await f.confirm()).graph.snapshotId;
    await f.call('notes/enable', 'POST', {});
    const a = ((await f.call('notes', 'POST', { snapshotId, kind: 'decision', text: 'A' })).json as { note: { note: { id: string } } }).note.note.id;
    const b = ((await f.call('notes', 'POST', { snapshotId, kind: 'decision', text: 'B' })).json as { note: { note: { id: string } } }).note.note.id;
    expect((await f.call(`notes/${a}`, 'POST', { snapshotId, revision: 1 })).json).toEqual({ error: { code: 'invalid-body' } });
    expect((await f.call(`notes/${a}`, 'POST', { snapshotId, revision: 1, text: 'A2', kind: 'question' })).statusCode).toBe(200);
    expect((await f.call(`notes/${a}`, 'POST', { snapshotId, revision: 1, text: 'lost update' })).json).toEqual({ error: { code: 'revision-conflict' } });
    expect((await f.call(`notes/${'d'.repeat(32)}`, 'POST', { snapshotId, revision: 1, text: 'x' })).json).toEqual({ error: { code: 'note-not-found' } });
    expect((await f.call(`notes/${a}`, 'POST', { snapshotId, revision: 2, relink: 'moved' })).json).toEqual({ error: { code: 'not-moved' } });
    expect((await f.list(snapshotId)).notes.map((n) => [n.note.text, n.note.kind, n.note.revision])).toEqual([['A2', 'question', 2], ['B', 'decision', 1]]);
    expect((await f.call(`notes/${a}/delete`, 'POST', { revision: 1 })).json).toEqual({ error: { code: 'revision-conflict' } });
    expect((await f.call(`notes/${a}/delete`, 'POST', { revision: 2 })).json).toEqual({ deleted: true });
    expect((await f.call(`notes/${a}/delete`, 'POST', { revision: 2 })).json).toEqual({ error: { code: 'note-not-found' } });
    expect((await f.list(snapshotId)).notes.map((n) => n.note.id)).toEqual([b]);
    expect((await f.call('notes/clear', 'POST', {})).json).toEqual({ cleared: true });
    expect((await f.list(snapshotId)).notes).toEqual([]);
    expect((await f.call('notes/disable', 'POST', {})).json).toEqual({ enabled: false });
    expect(await f.list(snapshotId)).toEqual({ enabled: false, state: 'ok', notes: [] });
    expect((await f.call('notes', 'POST', { snapshotId, kind: 'decision', text: 'C' })).json).toEqual({ error: { code: 'notes-disabled' } });
    expect(await exists(join(data, `notes-${f.key}.json`))).toBe(true);
    expect((await f.call('notes/enable', 'POST', {})).statusCode).toBe(200);
    expect((await f.list(snapshotId)).enabled).toBe(true);
  });

  it('keeps two folders isolated', async () => {
    const data = join(await temp('boozer-data-'), 'app');
    const one = await launch(await project(), data);
    const two = await launch(await project(), data);
    const s1 = (await one.confirm()).graph.snapshotId;
    const s2 = (await two.confirm()).graph.snapshotId;
    await one.call('notes/enable', 'POST', {});
    await one.call('notes', 'POST', { snapshotId: s1, kind: 'decision', text: 'Only in one' });
    expect(one.key).not.toBe(two.key);
    expect(await two.list(s2)).toEqual({ enabled: false, state: 'ok', notes: [] });
    await two.call('notes/enable', 'POST', {});
    expect((await two.list(s2)).notes).toEqual([]);
    expect((await one.list(s1)).notes).toHaveLength(1);
  });
});

describe('notes safety boundaries', () => {
  it('refuses to enable when the data directory is inside the selected root, and writes nothing', async () => {
    const root = await project();
    const data = join(root, 'app-data');
    const f = await launch(root, data);
    const snapshotId = (await f.confirm()).graph.snapshotId;
    expect((await f.call('notes/enable', 'POST', {})).json).toEqual({ error: { code: 'notes-overlap' } });
    expect(await f.list(snapshotId)).toEqual({ enabled: false, state: 'ok', notes: [] });
    expect(await exists(data)).toBe(false);
    expect((await readdir(root)).sort()).toEqual(['credentials.ts', 'dep.ts', 'main.ts']);
  });

  it('refuses to enable when the selected root is inside the data directory', async () => {
    const data = await temp('boozer-data-');
    const root = join(data, 'project');
    await mkdir(root);
    await project(root);
    const f = await launch(root, data);
    await f.confirm();
    expect((await f.call('notes/enable', 'POST', {})).json).toEqual({ error: { code: 'notes-overlap' } });
    expect((await readdir(data)).sort()).toEqual(['project']);
  });

  it('refuses a data directory that is a symlink outside the root: nothing written, target mode unchanged', async () => {
    const outside = await temp('boozer-outside-');
    await chmod(outside, 0o755);
    const data = join(await temp('boozer-data-'), 'app');
    await symlink(outside, data);
    const f = await launch(await project(), data);
    const snapshotId = (await f.confirm()).graph.snapshotId;
    expect((await f.call('notes/enable', 'POST', {})).json).toEqual({ error: { code: 'store-unavailable' } });
    expect(await f.list(snapshotId)).toEqual({ enabled: false, state: 'ok', notes: [] });
    expect((await f.call('notes', 'POST', { snapshotId, kind: 'decision', text: 'x' })).json).toEqual({ error: { code: 'notes-disabled' } });
    expect(await readdir(outside)).toEqual([]);
    expect((await stat(outside)).mode & 0o777).toBe(0o755);
    expect((await f.call('graph')).statusCode).toBe(200);
  });

  it('refuses a data directory that is a symlink into the root as an overlap', async () => {
    const root = await project();
    await mkdir(join(root, 'inside'));
    const data = join(await temp('boozer-data-'), 'app');
    await symlink(join(root, 'inside'), data);
    const f = await launch(root, data);
    await f.confirm();
    expect((await f.call('notes/enable', 'POST', {})).json).toEqual({ error: { code: 'notes-overlap' } });
    expect(await readdir(join(root, 'inside'))).toEqual([]);
  });

  it('an unknown note ID returns 404 and leaves the notes file untouched', async () => {
    const data = join(await temp('boozer-data-'), 'app');
    const f = await launch(await project(), data);
    const snapshotId = (await f.confirm()).graph.snapshotId;
    await f.call('notes/enable', 'POST', {});
    await f.call('notes', 'POST', { snapshotId, kind: 'decision', text: 'Keep' });
    const target = join(data, `notes-${f.key}.json`);
    const bytes = await readFile(target);
    const before = await stat(target);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const unknown = 'd'.repeat(32);
    expect((await f.call(`notes/${unknown}`, 'POST', { snapshotId, revision: 1, text: 'x' })).json).toEqual({ error: { code: 'note-not-found' } });
    expect((await f.call(`notes/${unknown}/delete`, 'POST', { revision: 1 })).json).toEqual({ error: { code: 'note-not-found' } });
    const after = await stat(target);
    expect((await readFile(target)).equals(bytes)).toBe(true);
    expect([after.ino, after.mtimeMs]).toEqual([before.ino, before.mtimeMs]);
  });

  it('a corrupt notes file is reported, read-only and untouched; the rest of Boozer keeps working', async () => {
    const data = join(await temp('boozer-data-'), 'app');
    const root = await project();
    const key = (await LocalInputAdapter.select(root)).storageIdentity().key;
    await mkdir(data, { recursive: true });
    const target = join(data, `notes-${key}.json`);
    await writeFile(target, '{"schemaVersion":1,"notes":[{"broken":');
    const before = await readFile(target);
    const f = await launch(root, data);
    const graph = await f.confirm();
    const snapshotId = graph.graph.snapshotId;
    expect(await f.list(snapshotId)).toEqual({ enabled: true, state: 'error', errorCode: 'store-corrupt', notes: [] });
    expect((await f.call('notes', 'POST', { snapshotId, kind: 'decision', text: 'x' })).json).toEqual({ error: { code: 'store-read-only' } });
    expect((await f.call('notes/clear', 'POST', {})).json).toEqual({ error: { code: 'store-read-only' } });
    expect((await f.call('notes/enable', 'POST', {})).json).toEqual({ enabled: true });
    expect(await f.list(snapshotId)).toMatchObject({ state: 'error', errorCode: 'store-corrupt' });
    expect((await readFile(target)).equals(before)).toBe(true);
    expect(await readdir(data)).toEqual([`notes-${key}.json`]);
    // Graph, source, explanations and refresh are unaffected.
    expect((await f.call('graph')).statusCode).toBe(200);
    const file = graph.files.find((entry) => entry.path === 'main.ts')!;
    expect((await f.call(`files/${file.id}?snapshotId=${snapshotId}`)).json).toMatchObject({ path: 'main.ts', text: MAIN });
    expect((await f.call('explanations', 'POST', { snapshotId, path: 'main.ts' })).statusCode).toBe(200);
    expect((await f.call('refresh', 'POST', { snapshotId })).statusCode).toBe(200);
    expect(f.engine.explain).toHaveBeenCalledTimes(1);
  });

  it('close revokes notes routes like every other route', async () => {
    const data = join(await temp('boozer-data-'), 'app');
    const f = await launch(await project(), data);
    const snapshotId = (await f.confirm()).graph.snapshotId;
    await f.call('notes/enable', 'POST', {});
    await f.call('close', 'POST', {});
    expect((await f.call(`notes?snapshotId=${snapshotId}`)).statusCode).toBe(401);
    expect((await f.call('notes', 'POST', { snapshotId, kind: 'decision', text: 'x' })).statusCode).toBe(401);
  });
});
