import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Only rename is wrapped, so a test can make the final atomic step fail on demand.
const faults = vi.hoisted(() => ({ rename: false }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rename: async (...args: Parameters<typeof actual.rename>) => {
      if (faults.rename) throw Object.assign(new Error('simulated rename failure'), { code: 'EIO' });
      return actual.rename(...args);
    },
  };
});

const { LocalStore, MAX_NOTES, MAX_STORE_BYTES, defaultDataDirectory, parseStore } = await import('../src/server/local-store.js');
const { LocalInputAdapter } = await import('../src/server/local-input.js');
type StoredNote = import('../src/server/local-store.js').StoredNote;

const key = 'a'.repeat(64);
const otherKey = 'b'.repeat(64);
const temps: string[] = [];
async function temp(prefix: string) {
  const dir = await mkdtemp(join(await realpath(tmpdir()), prefix));
  temps.push(dir);
  return dir;
}
const notesOf = (read: unknown) => (read as { notes: readonly StoredNote[] }).notes;
const note = (id: string, text = 'Your note text', extra: Partial<StoredNote> = {}): StoredNote => ({
  id: id.padStart(32, '0'), kind: 'decision', text, link: null, revision: 1,
  createdAt: '2026-10-09T00:00:00.000Z', updatedAt: '2026-10-09T00:00:00.000Z', ...extra,
});
const posix = process.platform !== 'win32';
const root = typeof process.getuid === 'function' && process.getuid() === 0;

beforeEach(() => { faults.rename = false; });
afterEach(async () => {
  faults.rename = false;
  await Promise.all(temps.splice(0).map(async (dir) => {
    await chmod(dir, 0o700).catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }));
});

describe('LocalStore (the only disk writer)', () => {
  it('uses the platform app data directory and ignores relative XDG values', () => {
    const dir = defaultDataDirectory();
    if (process.platform === 'darwin') expect(dir).toMatch(/\/Library\/Application Support\/Boozer AI$/);
    if (process.platform === 'linux') expect(dir).toMatch(/\/boozer-ai$/);
    expect(() => new LocalStore('relative/dir')).toThrow();
  });

  it('creates nothing until an explicit create; then persists across new instances (restart)', async () => {
    const base = await temp('boozer-store-');
    const dir = join(base, 'data');
    const store = new LocalStore(dir);
    expect(await store.exists(key)).toBe(false);
    expect(await store.read(key)).toEqual({ state: 'ok', exists: false, notes: [] });
    await expect(readdir(dir)).rejects.toMatchObject({ code: 'ENOENT' });
    await store.create(key);
    await store.update(key, (notes) => [...notes, note('1')]);
    const restarted = new LocalStore(dir);
    expect(await restarted.exists(key)).toBe(true);
    expect(await restarted.read(key)).toEqual({ state: 'ok', exists: true, notes: [note('1')] });
    expect(await restarted.read(otherKey)).toEqual({ state: 'ok', exists: false, notes: [] });
    expect(await readdir(dir)).toEqual([`notes-${key}.json`]);
  });

  it.skipIf(!posix)('creates the directory 0700 and files 0600', async () => {
    const dir = join(await temp('boozer-store-'), 'data');
    const store = new LocalStore(dir);
    await store.create(key);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect((await stat(join(dir, `notes-${key}.json`))).mode & 0o777).toBe(0o600);
    await store.update(key, (notes) => [...notes, note('2')]);
    expect((await stat(join(dir, `notes-${key}.json`))).mode & 0o777).toBe(0o600);
  });

  it('leaves the old file intact and no temp file behind when the atomic rename fails', async () => {
    const dir = join(await temp('boozer-store-'), 'data');
    const store = new LocalStore(dir);
    await store.create(key);
    await store.update(key, (notes) => [...notes, note('1')]);
    const target = join(dir, `notes-${key}.json`);
    const before = await readFile(target);
    faults.rename = true;
    await expect(store.update(key, (notes) => [...notes, note('2')])).rejects.toMatchObject({ code: 'store-write-failed' });
    faults.rename = false;
    expect((await readFile(target)).equals(before)).toBe(true);
    expect(await readdir(dir)).toEqual([`notes-${key}.json`]);
    // The store keeps working after the failure.
    await store.update(key, (notes) => [...notes, note('3')]);
    expect(notesOf(await new LocalStore(dir).read(key)).map((n) => n.id.slice(-1))).toEqual(['1', '3']);
  });

  it('enforces the note cap and the file size cap without writing anything', async () => {
    const dir = join(await temp('boozer-store-'), 'data');
    const store = new LocalStore(dir);
    await store.create(key);
    const many = Array.from({ length: MAX_NOTES }, (_, i) => note(String(i + 1)));
    await store.update(key, () => many);
    const target = join(dir, `notes-${key}.json`);
    const full = await readFile(target);
    await expect(store.update(key, (notes) => [...notes, note('999')])).rejects.toMatchObject({ code: 'note-limit' });
    expect((await readFile(target)).equals(full)).toBe(true);
    // Control characters escape to six bytes each in JSON, so 2,000-char notes can exceed 2 MiB.
    const heavy = Array.from({ length: 200 }, (_, i) => note(String(i + 1), '\u0001'.repeat(2_000)));
    await expect(store.update(key, () => heavy)).rejects.toMatchObject({ code: 'store-full' });
    expect((await readFile(target)).equals(full)).toBe(true);
    expect(await readdir(dir)).toEqual([`notes-${key}.json`]);
  });

  it('serializes concurrent writes in-process so none is lost', async () => {
    const dir = join(await temp('boozer-store-'), 'data');
    const store = new LocalStore(dir);
    await store.create(key);
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.update(key, (notes) => [...notes, note(String(i + 1))])));
    expect(notesOf(await new LocalStore(dir).read(key))).toHaveLength(20);
  });

  it('reports corrupt, wrong-schema and oversize files as errors, read-only, bytes unchanged', async () => {
    const cases: [string | Buffer, string][] = [
      ['{not json', 'store-corrupt'],
      [Buffer.from([0xff, 0xfe, 0x00]), 'store-corrupt'],
      ['', 'store-corrupt'],
      ['{"schemaVersion":2,"notes":[]}', 'store-schema'],
      ['{"schemaVersion":1,"notes":[],"extra":1}', 'store-schema'],
      ['{"schemaVersion":1,"notes":[{"id":"x"}]}', 'store-schema'],
      [JSON.stringify({ schemaVersion: 1, notes: [note('1'), note('1')] }), 'store-schema'],
      [JSON.stringify({ schemaVersion: 1, notes: [{ ...note('1'), link: { file: 'a.ts', startLine: 1, endLine: 1, fileHash: 'x', rangeHash: 'x', headHash: 'x' } }] }), 'store-schema'],
      [Buffer.alloc(MAX_STORE_BYTES + 1, 0x20), 'store-too-large'],
    ];
    for (const [bytes, code] of cases) {
      const dir = join(await temp('boozer-store-'), 'data');
      await mkdir(dir, { recursive: true });
      const target = join(dir, `notes-${key}.json`);
      await writeFile(target, bytes);
      const before = await readFile(target);
      const store = new LocalStore(dir);
      expect(await store.exists(key)).toBe(true);
      expect(await store.read(key)).toEqual({ state: 'error', code });
      await expect(store.update(key, () => [note('5')])).rejects.toMatchObject({ code: 'store-read-only' });
      await expect(store.update(key, () => [])).rejects.toMatchObject({ code: 'store-read-only' });
      expect(await store.create(key)).toEqual({ state: 'error', code });
      expect((await readFile(target)).equals(before)).toBe(true);
      expect(await readdir(dir)).toEqual([`notes-${key}.json`]);
    }
  });

  it.skipIf(!posix || root)('reports an unreadable file or a symlinked file as unreadable and never follows the link', async () => {
    const dir = join(await temp('boozer-store-'), 'data');
    await mkdir(dir, { recursive: true });
    const target = join(dir, `notes-${key}.json`);
    await writeFile(target, JSON.stringify({ schemaVersion: 1, notes: [] }), { mode: 0o000 });
    expect(await new LocalStore(dir).read(key)).toEqual({ state: 'error', code: 'store-unreadable' });
    const elsewhere = join(await temp('boozer-elsewhere-'), 'notes.json');
    await writeFile(elsewhere, JSON.stringify({ schemaVersion: 1, notes: [note('7')] }));
    await symlink(elsewhere, join(dir, `notes-${otherKey}.json`));
    const store = new LocalStore(dir);
    expect(await store.read(otherKey)).toEqual({ state: 'error', code: 'store-unreadable' });
    await expect(store.update(otherKey, () => [])).rejects.toMatchObject({ code: 'store-read-only' });
    expect(JSON.parse(await readFile(elsewhere, 'utf8')).notes).toHaveLength(1);
  });

  it('parses only the exact v1 schema', () => {
    expect(parseStore(JSON.stringify({ schemaVersion: 1, notes: [note('1')] }))).toEqual({ state: 'ok', exists: true, notes: [note('1')] });
    expect(parseStore(JSON.stringify({ schemaVersion: 1, notes: [{ ...note('1'), text: '   ' }] }))).toMatchObject({ state: 'error' });
    expect(parseStore(JSON.stringify({ schemaVersion: 1, notes: [{ ...note('1'), kind: 'fact' }] }))).toMatchObject({ state: 'error' });
    expect(parseStore(JSON.stringify({ schemaVersion: 1, notes: [{ ...note('1'), revision: 0 }] }))).toMatchObject({ state: 'error' });
  });
});

describe('storage identity from the input adapter', () => {
  it('derives an opaque key per canonical root; two roots never share one', async () => {
    const a = await temp('boozer-root-a-');
    const b = await temp('boozer-root-b-');
    const ka = (await LocalInputAdapter.select(a)).storageIdentity().key;
    const kb = (await LocalInputAdapter.select(b)).storageIdentity().key;
    expect(ka).toMatch(/^[0-9a-f]{64}$/);
    expect(ka).not.toBe(kb);
    expect(ka).not.toContain(a);
    expect((await LocalInputAdapter.select(a)).storageIdentity().key).toBe(ka);
    expect(JSON.stringify((await LocalInputAdapter.select(a)).storageIdentity())).not.toContain(a);
  });

  it('detects overlap in both directions on canonical paths, including not-yet-created directories', async () => {
    const base = await temp('boozer-overlap-');
    const project = join(base, 'project');
    await mkdir(project);
    const identity = (await LocalInputAdapter.select(project)).storageIdentity();
    expect(await identity.overlaps(project)).toBe(true);
    expect(await identity.overlaps(join(project, 'data', 'not', 'yet'))).toBe(true);
    expect(await identity.overlaps(base)).toBe(true);
    expect(await identity.overlaps(join(base, 'project-data'))).toBe(false);
    expect(await identity.overlaps(join(base, 'sibling'))).toBe(false);
    // A symlinked data directory resolving into the root is still an overlap.
    await symlink(project, join(base, 'link-to-project'));
    expect(await identity.overlaps(join(base, 'link-to-project', 'data'))).toBe(true);
    if (process.platform === 'darwin') expect(await identity.overlaps(join(project.toUpperCase(), 'x'))).toBe(true);
  });
});
