import { createHash } from 'node:crypto';
import type { Dir, Dirent } from 'node:fs';
import { chmod, mkdir, mkdtemp, opendir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SNAPSHOT_LIMITS, InputError, LocalInputAdapter } from '../src/server/local-input.js';
import type { SnapshotLimits, WorkspaceSnapshot } from '../src/shared/contracts.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, opendir: vi.fn(actual.opendir) };
});

const analysisKey = 'test-extractor-v1/resolver-v1';
const ownedFolders: string[] = [];

async function folder(): Promise<string> {
  // macOS /var and /tmp are aliases; the adapter deliberately rejects symlink selections.
  const root = await mkdtemp(join(await realpath(tmpdir()), 'boozer-input-test-'));
  ownedFolders.push(root);
  return root;
}

async function put(root: string, path: string, text: string | Buffer): Promise<void> {
  const absolute = join(root, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, text);
}

async function selected(root: string): Promise<LocalInputAdapter> {
  const adapter = await LocalInputAdapter.select(root);
  adapter.confirm(adapter.projectId);
  return adapter;
}

const snapshot = (adapter: LocalInputAdapter, limits?: SnapshotLimits): Promise<WorkspaceSnapshot> =>
  adapter.snapshot(adapter.projectId, limits === undefined ? { analysisKey } : { analysisKey, limits });

afterEach(async () => {
  vi.mocked(opendir).mockReset();
  await Promise.all(ownedFolders.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('local selection authority', () => {
  it('requires explicit confirmation, rejects other project IDs and revokes on close', async () => {
    const root = await folder();
    await put(root, 'main.ts', 'export const answer = 42;');
    const adapter = await LocalInputAdapter.select(root);
    expect(adapter.projectId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(adapter)).not.toContain(root);
    await expect(snapshot(adapter)).rejects.toMatchObject({ code: 'unconfirmed' });
    expect(() => adapter.confirm('../elsewhere')).toThrow(InputError);
    adapter.confirm(adapter.projectId);
    for (const id of ['unknown', root, '/outside.ts', '../outside.ts']) {
      await expect(adapter.snapshot(id, { analysisKey })).rejects.toMatchObject({ code: 'invalid-selection' });
    }
    expect((await snapshot(adapter)).files).toHaveLength(1);
    adapter.close();
    expect(() => adapter.confirm(adapter.projectId)).toThrow('revoked');
    await expect(snapshot(adapter)).rejects.toMatchObject({ code: 'revoked' });
  });

  it('rejects missing/file/secret roots with sanitized errors', async () => {
    const root = await folder();
    await put(root, 'main.ts', 'DO_NOT_LOG_SOURCE');
    await mkdir(join(root, '.env-private'));
    for (const path of ['', join(root, 'missing'), join(root, 'main.ts'), join(root, '.env-private')]) {
      const error = await LocalInputAdapter.select(path).catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(InputError);
      expect(String(error)).toBe('InputError: Local input failed: invalid-selection');
      expect(String(error)).not.toContain(root);
      expect(String(error)).not.toContain('DO_NOT_LOG_SOURCE');
    }
  });

  it('rejects a symlink root and any symlink ancestor', async () => {
    const root = await folder();
    const links = await folder();
    await mkdir(join(root, 'child'));
    await symlink(root, join(links, 'alias'), 'dir');
    for (const path of [join(links, 'alias'), join(links, 'alias/child')]) {
      await expect(LocalInputAdapter.select(path)).rejects.toMatchObject({ code: 'symlink-root' });
    }
  });

  it('rejects a replaced root on refresh without reading the replacement', async () => {
    const parent = await folder();
    const root = join(parent, 'project');
    await put(root, 'old.ts', 'export const original = true;');
    const adapter = await selected(root);
    const old = await snapshot(adapter);
    await rename(root, join(parent, 'old-project'));
    await put(root, 'replacement.ts', 'DO_NOT_READ_REPLACEMENT');
    await expect(snapshot(adapter)).rejects.toMatchObject({ code: 'changed-during-read' });
    expect(old.files[0]?.path).toBe('old.ts');
  });

  it('revokes a scan already in progress', async () => {
    const root = await folder();
    await put(root, 'main.ts', 'export {};');
    const adapter = await selected(root);
    const pending = snapshot(adapter);
    setImmediate(() => adapter.close());
    await expect(pending).rejects.toMatchObject({ code: 'revoked' });
  });
});

describe('snapshot bytes and identity', () => {
  it('handles all supported languages and hashes exact UTF-8 bytes without running code', async () => {
    const root = await folder();
    const texts = new Map([
      ['a.ts', '\uFEFFexport const accented = "café";\r\n'], ['nested/b.tsx', 'export const View = () => <p />;'],
      ['c.js', 'throw new Error("TRIPWIRE_MUST_NEVER_EXECUTE");'], ['d.jsx', 'export default <p />;'],
      ['e.mjs', 'export default import("./c.js");'], ['f.cjs', 'require("./c.js");'],
      ['vite.config.ts', 'process.exit(77);'],
    ]);
    for (const [path, text] of texts) await put(root, path, text);
    const result = await snapshot(await selected(root));
    expect(result.files.map(({ path }) => path)).toEqual([...texts.keys()].sort());
    for (const file of result.files) {
      const bytes = Buffer.from(texts.get(file.path)!);
      expect(file.text).toBe(texts.get(file.path));
      expect(file.sizeBytes).toBe(bytes.length);
      expect(file.contentHash).toBe(createHash('sha256').update(bytes).digest('hex'));
      expect(await readFile(join(root, file.path))).toEqual(bytes);
    }
    expect(result.files.map(({ language }) => language).sort()).toEqual(['cjs', 'js', 'jsx', 'mjs', 'ts', 'ts', 'tsx']);
    expect(result.inventory.found).toBe(7);
    expect(result.inventory.skipped).toEqual([]);
    expect(result.limits).toEqual(DEFAULT_SNAPSHOT_LIMITS);
  });

  it('is independent of enumeration order, absolute root, project ID and timestamps', async () => {
    const first = await folder();
    const second = await folder();
    for (const path of ['z.ts', 'nested/a.ts', 'b.js', 'readme.md']) await put(first, path, `// ${path}`);
    for (const path of ['readme.md', 'b.js', 'nested/a.ts', 'z.ts']) await put(second, path, `// ${path}`);
    const a = await snapshot(await selected(first));
    const b = await snapshot(await selected(second));
    expect(a.projectId).not.toBe(b.projectId);
    expect(a.snapshotId).toBe(b.snapshotId);
    expect(a.files).toEqual(b.files);
    expect(a.inventory).toEqual(b.inventory);
    expect(Number.isNaN(Date.parse(a.createdAt))).toBe(false);
    expect(JSON.stringify(a)).not.toContain(first);
  });

  it('changes identity for content, path, exclusion inventory, limits and parser configuration', async () => {
    const root = await folder();
    await put(root, 'main.ts', 'export const n = 1;');
    const adapter = await selected(root);
    const ids: string[] = [(await snapshot(adapter)).snapshotId];
    await put(root, 'main.ts', 'export const n = 2;');
    ids.push((await snapshot(adapter)).snapshotId);
    await rename(join(root, 'main.ts'), join(root, 'renamed.ts'));
    ids.push((await snapshot(adapter)).snapshotId);
    await put(root, '.env.ts', 'SECRET_BYTES');
    ids.push((await snapshot(adapter)).snapshotId);
    ids.push((await snapshot(adapter, { ...DEFAULT_SNAPSHOT_LIMITS, maxFiles: 1 })).snapshotId);
    ids.push((await adapter.snapshot(adapter.projectId, { analysisKey: 'resolver-v2' })).snapshotId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('freezes every contract layer and retains earlier source after a refresh', async () => {
    const root = await folder();
    await put(root, 'main.ts', 'export const old = 1;');
    await put(root, 'readme.md', 'notes');
    await mkdir(join(root, 'dist'));
    const adapter = await selected(root);
    const old = await snapshot(adapter);
    for (const value of [old, old.files, old.files[0], old.inventory, old.inventory.skipped,
      old.inventory.skipped[0], old.inventory.prunedDirectories, old.inventory.prunedDirectories[0], old.limits]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(Reflect.set(old.files[0]!, 'text', 'mutated')).toBe(false);
    await put(root, 'main.ts', 'export const newValue = 2;');
    const refreshed = await snapshot(adapter);
    expect(old.files[0]?.text).toBe('export const old = 1;');
    expect(refreshed.snapshotId).not.toBe(old.snapshotId);
    expect(refreshed.projectId).toBe(old.projectId);
  });
});

describe('untrusted input exclusions and bounds', () => {
  it('prunes ignored/secret folders and excludes secret filenames before content reads', async () => {
    const root = await folder();
    for (const directory of ['node_modules', '.git', 'build', 'dist', '.next', 'coverage', '.vite', '.ssh', '.aws', '.env-data']) {
      await put(root, `${directory}/tripwire.ts`, 'throw new Error("DO_NOT_EXECUTE");');
    }
    for (const name of ['.env', '.env.local.ts', 'credentials.ts', 'service.secret.js', 'id_rsa', 'private-key.ts', 'server.pem']) {
      await put(root, name, 'PRIVATE_BYTES');
      await chmod(join(root, name), 0o000);
    }
    await put(root, 'src/main.ts', 'export const n = 1;');
    const result = await snapshot(await selected(root));
    expect(result.files.map(({ path }) => path)).toEqual(['src/main.ts']);
    expect(result.inventory.skipped).toHaveLength(7);
    expect(result.inventory.skipped.every(({ reason }) => reason === 'secret-name')).toBe(true);
    expect(result.inventory.prunedDirectories).toHaveLength(10);
    expect(result.inventory.found).toBe(8);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_BYTES');
  });

  it('rejects file and nested directory symlink entries without following them', async () => {
    const root = await folder();
    const outside = await folder();
    await put(outside, 'outside.ts', 'DO_NOT_READ_OUTSIDE');
    await put(root, 'local.ts', 'export const local = true;');
    await mkdir(join(root, 'nested'));
    await symlink(join(outside, 'outside.ts'), join(root, 'linked.ts'));
    await symlink(outside, join(root, 'nested/linked-folder'), 'dir');
    await symlink(join(root, 'local.ts'), join(root, 'internal.ts'));
    const result = await snapshot(await selected(root));
    expect(result.files.map(({ path }) => path)).toEqual(['local.ts']);
    expect(result.inventory.skipped).toEqual([
      { path: 'internal.ts', reason: 'symlink' }, { path: 'linked.ts', reason: 'symlink' },
      { path: 'nested/linked-folder', reason: 'symlink' },
    ]);
    expect(result.inventory.found).toBe(4);
    expect(JSON.stringify(result)).not.toContain('DO_NOT_READ_OUTSIDE');
  });

  it('aborts for case-colliding directory entries (simulated on this insensitive filesystem)', async () => {
    const root = await folder();
    await put(root, 'Case.ts', 'export {};');
    // This Mac cannot create both names. Enumerate the real file then a synthetic alias;
    // the adapter must reject it before attempting to read that second entry.
    vi.mocked(opendir).mockImplementationOnce(async (...args) => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
      const dir = await actual.opendir(...args);
      return {
        async *[Symbol.asyncIterator]() {
          for await (const entry of dir) {
            yield entry;
            yield { ...entry, name: 'case.ts' } as Dirent;
          }
        },
      } as Dir;
    });
    await expect(snapshot(await selected(root))).rejects.toMatchObject({ code: 'case-collision' });
  });

  it('aborts a metadata-only flood at the entry cap (simulated enumeration)', async () => {
    const root = await folder();
    vi.mocked(opendir).mockImplementationOnce(async () => ({
      async *[Symbol.asyncIterator]() {
        for (let index = 0; index < 20_001; index++) {
          yield { name: `unsupported-${index}.md`, isSymbolicLink: () => false, isDirectory: () => false } as Dirent;
        }
      },
    }) as Dir);
    await expect(snapshot(await selected(root))).rejects.toMatchObject({ code: 'entry-limit' });
  });

  it('rejects cross-platform escaping path syntax before reading bytes', async () => {
    const root = await folder();
    await put(root, '..\\outside.ts', 'DO_NOT_READ_ESCAPING_NAME');
    await expect(snapshot(await selected(root))).rejects.toMatchObject({ code: 'outside-root' });
  });

  it('skips NUL bytes and invalid UTF-8 without guessing source text', async () => {
    const root = await folder();
    await put(root, 'nul.ts', Buffer.from([65, 0, 66]));
    await put(root, 'invalid.js', Buffer.from([0xc3, 0x28]));
    await put(root, 'valid.ts', 'export {};');
    const result = await snapshot(await selected(root));
    expect(result.files.map(({ path }) => path)).toEqual(['valid.ts']);
    expect(result.inventory.skipped).toEqual([
      { path: 'invalid.js', reason: 'binary' }, { path: 'nul.ts', reason: 'binary' },
    ]);
    expect(result.inventory.found).toBe(3);
  });

  it('records unreadable source without native errors or sensitive text', async () => {
    const root = await folder();
    await put(root, 'blocked.ts', 'DO_NOT_LOG_UNREADABLE');
    await chmod(join(root, 'blocked.ts'), 0o000);
    const result = await snapshot(await selected(root));
    expect(result.files).toEqual([]);
    expect(result.inventory.skipped).toEqual([{ path: 'blocked.ts', reason: 'unreadable' }]);
    expect(JSON.stringify(result)).not.toContain('DO_NOT_LOG_UNREADABLE');
  });

  it('aborts an unreadable directory instead of guessing its file count', async () => {
    const root = await folder();
    await put(root, 'blocked/hidden.ts', 'DO_NOT_LOG_UNKNOWN_INVENTORY');
    await chmod(join(root, 'blocked'), 0o000);
    try {
      await expect(snapshot(await selected(root))).rejects.toMatchObject({
        code: 'unreadable-directory', message: 'Local input failed: unreadable-directory',
      });
    } finally {
      await chmod(join(root, 'blocked'), 0o700);
    }
  });

  it('aborts oversize snapshots rather than returning a partial graph input', async () => {
    const root = await folder();
    await put(root, 'main.ts', 'export {};');
    const adapter = await selected(root);
    await expect(snapshot(adapter, { ...DEFAULT_SNAPSHOT_LIMITS, maxFileBytes: 3 }))
      .rejects.toMatchObject({ code: 'file-bytes-limit' });
    await expect(snapshot(adapter, { ...DEFAULT_SNAPSHOT_LIMITS, maxTotalBytes: 3 }))
      .rejects.toMatchObject({ code: 'total-bytes-limit' });
    await put(root, 'second.ts', 'export {};');
    await expect(snapshot(adapter, { ...DEFAULT_SNAPSHOT_LIMITS, maxFiles: 1 }))
      .rejects.toMatchObject({ code: 'file-limit' });
    await expect(snapshot(adapter, { ...DEFAULT_SNAPSHOT_LIMITS, maxTotalBytes: 15 }))
      .rejects.toMatchObject({ code: 'total-bytes-limit' });
  });

  it('rejects invalid or expanded limits and missing analysis identity', async () => {
    const adapter = await selected(await folder());
    for (const value of [0, -1, 1.5, Number.NaN, DEFAULT_SNAPSHOT_LIMITS.maxFiles + 1]) {
      await expect(snapshot(adapter, { ...DEFAULT_SNAPSHOT_LIMITS, maxFiles: value }))
        .rejects.toMatchObject({ code: 'invalid-limits' });
    }
    await expect(adapter.snapshot(adapter.projectId, { analysisKey: '' }))
      .rejects.toMatchObject({ code: 'invalid-config' });
  });

  it('honors cancellation before traversal and during a scan', async () => {
    const root = await folder();
    await put(root, 'main.ts', 'export {};');
    const adapter = await selected(root);
    const before = AbortSignal.abort('PRIVATE_CANCEL_REASON');
    await expect(adapter.snapshot(adapter.projectId, { analysisKey, signal: before }))
      .rejects.toMatchObject({ code: 'cancelled', message: 'Local input failed: cancelled' });
    const controller = new AbortController();
    const pending = adapter.snapshot(adapter.projectId, { analysisKey, signal: controller.signal });
    setImmediate(() => controller.abort('PRIVATE_CANCEL_REASON'));
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    expect((await snapshot(adapter)).files).toHaveLength(1);
  });

  it('bounds deep trees without recursion or returning a partial snapshot', async () => {
    const root = await folder();
    await mkdir(join(root, ...Array.from({ length: 65 }, () => 'd')), { recursive: true });
    await expect(snapshot(await selected(root))).rejects.toMatchObject({ code: 'depth-limit' });
  });
});
