import { createHash, randomUUID } from 'node:crypto';
import { constants, type BigIntStats, type Dirent } from 'node:fs';
import { lstat, open, opendir, realpath } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import type { FileSkip, Language, SnapshotFile, SnapshotLimits, WorkspaceSnapshot } from '../shared/contracts.js';

export const DEFAULT_SNAPSHOT_LIMITS: SnapshotLimits = Object.freeze({
  maxFiles: 2_000, maxFileBytes: 1_048_576, maxTotalBytes: 20_971_520,
});

// Bound metadata traversal too: unsupported files and empty folders consume work.
const MAX_ENTRIES = 20_000;
const MAX_DEPTH = 64;
const IGNORED_DIRECTORIES = ['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.vite', '.ssh', '.aws'];
const LANGUAGES: Readonly<Record<string, Language>> = {
  '.js': 'js', '.jsx': 'jsx', '.ts': 'ts', '.tsx': 'tsx', '.mjs': 'mjs', '.cjs': 'cjs',
};
const POLICY_VERSION = 'local-input-v2';
const bytewise = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const hash = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

export type InputErrorCode =
  | 'invalid-selection' | 'unconfirmed' | 'revoked' | 'invalid-config' | 'invalid-limits'
  | 'outside-root' | 'symlink-root' | 'changed-during-read' | 'unreadable-directory'
  | 'file-limit' | 'file-bytes-limit' | 'total-bytes-limit'
  | 'entry-limit' | 'depth-limit' | 'cancelled';

// Error text contains neither target paths/content nor native filesystem errors.
export class InputError extends Error {
  constructor(readonly code: InputErrorCode) {
    super(`Local input failed: ${code}`);
    this.name = 'InputError';
  }
}

export interface SnapshotOptions {
  // The future parser supplies its version and resolver configuration identity here.
  readonly analysisKey: string;
  readonly limits?: SnapshotLimits;
  readonly signal?: AbortSignal;
}

function sameFile(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

function unchangedFile(a: BigIntStats, b: BigIntStats): boolean {
  return sameFile(a, b) && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

function secretName(name: string): boolean {
  return /^\.env/i.test(name)
    || /^(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)(?:\.|$)/i.test(name)
    || /(?:^|[._-])(?:credentials?|secrets?|private[._-]?key)(?:[._-]|$)/i.test(name)
    || /\.(?:pem|key|p12|pfx|keystore)$/i.test(name);
}

function normalizeLimits(input: SnapshotLimits = DEFAULT_SNAPSHOT_LIMITS): SnapshotLimits {
  const limits = { maxFiles: input.maxFiles, maxFileBytes: input.maxFileBytes, maxTotalBytes: input.maxTotalBytes };
  for (const key of ['maxFiles', 'maxFileBytes', 'maxTotalBytes'] as const) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] <= 0 || limits[key] > DEFAULT_SNAPSHOT_LIMITS[key]) {
      throw new InputError('invalid-limits');
    }
  }
  return Object.freeze(limits);
}

async function noSymlinkComponents(absolute: string): Promise<BigIntStats> {
  let current = parse(absolute).root;
  let stat = await lstat(current, { bigint: true });
  for (const component of relative(current, absolute).split(sep).filter(Boolean)) {
    current = join(current, component);
    stat = await lstat(current, { bigint: true });
    if (stat.isSymbolicLink()) throw new InputError('symlink-root');
  }
  return stat;
}

function confinedPath(root: string, path: string): string {
  // Paths originate in directory entries, but validate them before any filesystem use.
  if (path.includes('\\') || path.includes('\0') || isAbsolute(path)
    || path.split('/').some((part) => part === '.' || part === '..' || part === '')) {
    throw new InputError('outside-root');
  }
  const absolute = join(root, ...path.split('/'));
  const rel = relative(root, absolute);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) throw new InputError('outside-root');
  return absolute;
}

/** Server-only authority for one explicitly selected folder; never loads target code. */
export class LocalInputAdapter {
  readonly #projectId = randomUUID();
  readonly #root: string;
  readonly #rootIdentity: BigIntStats;
  #confirmed = false;
  #revoked = false;

  private constructor(root: string, rootIdentity: BigIntStats) {
    this.#root = root;
    this.#rootIdentity = rootIdentity;
  }

  get projectId(): string { return this.#projectId; }

  // The launcher passes the folder. Future browser handlers accept only projectId.
  static async select(folder: string): Promise<LocalInputAdapter> {
    if (typeof folder !== 'string' || folder.length === 0 || folder.includes('\0')) {
      throw new InputError('invalid-selection');
    }
    try {
      const absolute = resolve(folder);
      if (IGNORED_DIRECTORIES.includes(basename(absolute)) || secretName(basename(absolute))) {
        throw new InputError('invalid-selection');
      }
      const stat = await noSymlinkComponents(absolute);
      if (!stat.isDirectory()) throw new InputError('invalid-selection');
      const root = await realpath(absolute);
      const canonicalStat = await noSymlinkComponents(root);
      if (!sameFile(stat, canonicalStat)) throw new InputError('changed-during-read');
      return new LocalInputAdapter(root, canonicalStat);
    } catch (error) {
      if (error instanceof InputError) throw error;
      throw new InputError('invalid-selection');
    }
  }

  confirm(projectId: string): void {
    this.#authorize(projectId, false);
    this.#confirmed = true;
  }

  close(): void {
    this.#revoked = true;
    this.#confirmed = false;
  }

  #authorize(projectId: string, requireConfirmation = true): void {
    if (this.#revoked) throw new InputError('revoked');
    if (projectId !== this.projectId) throw new InputError('invalid-selection');
    if (requireConfirmation && !this.#confirmed) throw new InputError('unconfirmed');
  }

  async #checkRoot(): Promise<void> {
    try {
      const stat = await noSymlinkComponents(this.#root);
      if (!stat.isDirectory() || !sameFile(stat, this.#rootIdentity)) throw new InputError('changed-during-read');
    } catch {
      throw new InputError('changed-during-read');
    }
  }

  async #checkPath(path: string): Promise<BigIntStats> {
    await this.#checkRoot();
    const absolute = confinedPath(this.#root, path);
    const stat = await noSymlinkComponents(absolute);
    const canonical = await realpath(absolute);
    const rel = relative(this.#root, canonical);
    if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) {
      throw new InputError('outside-root');
    }
    return stat;
  }

  async snapshot(projectId: string, options: SnapshotOptions): Promise<WorkspaceSnapshot> {
    this.#authorize(projectId);
    if (typeof options.analysisKey !== 'string' || options.analysisKey.trim().length === 0
      || options.analysisKey.length > 4_096) throw new InputError('invalid-config');
    const analysisKey = options.analysisKey;
    const signal = options.signal;
    const limits = normalizeLimits(options.limits);
    const check = () => {
      this.#authorize(projectId);
      if (signal?.aborted) throw new InputError('cancelled');
    };
    const files: SnapshotFile[] = [];
    const skipped: FileSkip[] = [];
    const pruned: { readonly path: string; readonly reason: 'ignored' }[] = [];
    const pending = [''];
    let entries = 0;
    let sourceCandidates = 0;
    let totalBytes = 0;

    try {
      while (pending.length > 0) {
        check();
        const directory = pending.pop()!;
        await this.#checkRoot();
        const absolute = directory === '' ? this.#root : confinedPath(this.#root, directory);
        const before = directory === '' ? await noSymlinkComponents(this.#root) : await this.#checkPath(directory);
        if (!before.isDirectory()) {
          throw new InputError('changed-during-read');
        }
        const names = new Map<string, number>();
        const children: Dirent[] = [];
        const dir = await opendir(absolute);
        let iterating = false;
        try {
          const after = directory === '' ? await noSymlinkComponents(this.#root) : await this.#checkPath(directory);
          if (!after.isDirectory() || !sameFile(before, after)) throw new InputError('changed-during-read');
          iterating = true;
          // Streaming enumeration avoids materializing an unbounded target directory.
          for await (const entry of dir) {
            check();
            if (++entries > MAX_ENTRIES) throw new InputError('entry-limit');
            const path = directory === '' ? entry.name : `${directory}/${entry.name}`;
            confinedPath(this.#root, path);
            const caseKey = entry.name.normalize('NFC').toLowerCase();
            names.set(caseKey, (names.get(caseKey) ?? 0) + 1);
            children.push(entry);
          }
          // Resolve collisions before any source read/descendant traversal. Metadata
          // buffering is bounded by MAX_ENTRIES, including unsupported entries.
          children.sort((a, b) => bytewise(a.name, b.name));
          for (const entry of children) {
            check();
            const path = directory === '' ? entry.name : `${directory}/${entry.name}`;
            const language = LANGUAGES[extname(entry.name)];
            if (!entry.isSymbolicLink() && entry.isFile() && language !== undefined && !secretName(entry.name)) {
              if (++sourceCandidates > limits.maxFiles) throw new InputError('file-limit');
            }
            if ((names.get(entry.name.normalize('NFC').toLowerCase()) ?? 0) > 1) {
              skipped.push({ path, reason: 'case-collision' });
              continue;
            }
            // Never traverse a symlink, including a link masquerading as an ignored tree.
            if (entry.isSymbolicLink()) {
              skipped.push({ path, reason: 'symlink' });
            } else if (entry.isDirectory()) {
              if (IGNORED_DIRECTORIES.includes(entry.name) || secretName(entry.name)) {
                pruned.push({ path, reason: 'ignored' });
              } else {
                if (path.split('/').length > MAX_DEPTH) throw new InputError('depth-limit');
                pending.push(path);
              }
            } else if (secretName(entry.name)) {
              skipped.push({ path, reason: 'secret-name' });
            } else {
              if (language === undefined) {
                skipped.push({ path, reason: 'unsupported-extension' });
              } else if (!entry.isFile()) {
                skipped.push({ path, reason: 'unreadable' });
              } else {
                let bytes: Buffer;
                try {
                  const before = await this.#checkPath(path);
                  if (!before.isFile()) throw new InputError('changed-during-read');
                  if (before.size > BigInt(limits.maxFileBytes)) {
                    skipped.push({ path, reason: 'oversize' });
                    continue;
                  }
                  if (before.size > BigInt(limits.maxTotalBytes - totalBytes)) throw new InputError('total-bytes-limit');
                  const handle = await open(confinedPath(this.#root, path),
                    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
                  try {
                    const opened = await handle.stat({ bigint: true });
                    if (!opened.isFile() || !unchangedFile(before, opened)
                      || !unchangedFile(opened, await this.#checkPath(path))) {
                      throw new InputError('changed-during-read');
                    }
                    // Read at most one byte beyond either cap; growth cannot allocate unbounded memory.
                    const capacity = Math.min(Number(opened.size), limits.maxFileBytes, limits.maxTotalBytes - totalBytes) + 1;
                    const buffer = Buffer.alloc(capacity);
                    let used = 0;
                    while (used < capacity) {
                      check();
                      const { bytesRead } = await handle.read(buffer, used, Math.min(65_536, capacity - used), used);
                      if (bytesRead === 0) break;
                      used += bytesRead;
                      if (used > limits.maxFileBytes) throw new InputError('file-bytes-limit');
                      if (totalBytes + used > limits.maxTotalBytes) throw new InputError('total-bytes-limit');
                    }
                    if (!unchangedFile(opened, await handle.stat({ bigint: true }))
                      || !unchangedFile(opened, await this.#checkPath(path))) {
                      throw new InputError('changed-during-read');
                    }
                    bytes = buffer.subarray(0, used);
                    totalBytes += used;
                  } finally {
                    await handle.close();
                  }
                } catch (error) {
                  if (error instanceof InputError) throw error;
                  const code = (error as NodeJS.ErrnoException).code;
                  if (code === 'EACCES' || code === 'EPERM') {
                    skipped.push({ path, reason: 'unreadable' });
                    continue;
                  }
                  throw new InputError('changed-during-read');
                }
                let text: string;
                try {
                  if (bytes.includes(0)) throw new Error();
                  // Preserve BOM/source bytes: evidence hashes describe exactly this UTF-8 text.
                  text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
                } catch {
                  skipped.push({ path, reason: 'binary' });
                  continue;
                }
                files.push(Object.freeze({ path, language, sizeBytes: bytes.length, contentHash: hash(bytes), text }));
              }
            }
          }
        } catch (error) {
          if (error instanceof InputError) throw error;
          throw new InputError('unreadable-directory');
        } finally {
          // for-await closes the directory itself once iteration has begun.
          if (!iterating) await dir.close();
        }
      }
      check();
      await this.#checkRoot();
      check();
    } catch (error) {
      if (error instanceof InputError) throw error;
      throw new InputError('unreadable-directory');
    }

    files.sort((a, b) => bytewise(a.path, b.path));
    skipped.sort((a, b) => bytewise(a.path, b.path));
    pruned.sort((a, b) => bytewise(a.path, b.path));
    skipped.forEach(Object.freeze);
    pruned.forEach(Object.freeze);
    const inventory = Object.freeze({
      found: files.length + skipped.length,
      skipped: Object.freeze(skipped), prunedDirectories: Object.freeze(pruned),
    });
    const identity = JSON.stringify({
      policy: POLICY_VERSION, analysisKey, limits,
      ignoredDirectories: IGNORED_DIRECTORIES, maxEntries: MAX_ENTRIES, maxDepth: MAX_DEPTH,
      files: files.map(({ path, contentHash }) => [path, contentHash]), inventory,
    });
    return Object.freeze({
      schemaVersion: 1, projectId: this.projectId, snapshotId: `sha256:${hash(identity)}`,
      files: Object.freeze(files), inventory, limits, createdAt: new Date().toISOString(),
    });
  }
}
