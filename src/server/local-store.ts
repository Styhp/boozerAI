import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import type { NoteKind } from '../shared/notes.js';
import { MAX_LINK_LINES, type StoredLink } from './note-status.js';

// LocalStore is the only code that writes to disk (AGENTS.md "Code boundaries"). Phase 1
// stores project notes: one JSON file per project key in the app data directory, never in
// the selected project. File names come only from the opaque project key.

export const MAX_NOTES = 500;
export const MAX_NOTE_CHARS = 2_000;
export const MAX_STORE_BYTES = 2 * 1_048_576;
const KEY = /^[0-9a-f]{64}$/;
const HASH = /^[0-9a-f]{64}$/;
const NOTE_ID = /^[0-9a-f]{32}$/;
const KINDS: readonly NoteKind[] = ['decision', 'constraint', 'question'];

export interface StoredNote {
  readonly id: string;
  readonly kind: NoteKind;
  readonly text: string;
  readonly link: StoredLink | null;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type StoreRead =
  | { readonly state: 'ok'; readonly exists: boolean; readonly notes: readonly StoredNote[] }
  | { readonly state: 'error'; readonly code: StoreErrorCode };

export type StoreErrorCode = 'store-unreadable' | 'store-corrupt' | 'store-schema' | 'store-too-large';

// Sanitized failure: the code and HTTP status only, never a path or native error text.
export class StoreError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`Local store failed: ${code}`);
    this.name = 'StoreError';
  }
}

/** macOS: ~/Library/Application Support/Boozer AI; Linux: $XDG_DATA_HOME/boozer-ai or ~/.local/share/boozer-ai. */
export function defaultDataDirectory(): string | null {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Boozer AI');
  if (process.platform === 'linux') {
    const xdg = process.env.XDG_DATA_HOME;
    // The XDG spec ignores relative values.
    return join(xdg !== undefined && isAbsolute(xdg) ? xdg : join(homedir(), '.local', 'share'), 'boozer-ai');
  }
  return null;
}

const exact = (value: Record<string, unknown>, names: readonly string[]) =>
  Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name));
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const line = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1;
const timestamp = (value: unknown) => typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));

function parseLink(value: unknown): StoredLink | null | undefined {
  if (value === null) return null;
  if (!record(value) || !exact(value, ['file', 'startLine', 'endLine', 'fileHash', 'rangeHash', 'headHash'])) return undefined;
  const { file, startLine, endLine, fileHash, rangeHash, headHash } = value;
  if (typeof file !== 'string' || file.length === 0 || file.length > 4_096 || !line(startLine) || !line(endLine)
    || endLine < startLine || endLine - startLine + 1 > MAX_LINK_LINES || [fileHash, rangeHash, headHash].some((hash) => typeof hash !== 'string' || !HASH.test(hash))) return undefined;
  return { file, startLine, endLine, fileHash: fileHash as string, rangeHash: rangeHash as string, headHash: headHash as string };
}

function parseNote(value: unknown): StoredNote | undefined {
  if (!record(value) || !exact(value, ['id', 'kind', 'text', 'link', 'revision', 'createdAt', 'updatedAt'])) return undefined;
  const { id, kind, text, revision, createdAt, updatedAt } = value;
  const link = parseLink(value.link);
  if (typeof id !== 'string' || !NOTE_ID.test(id) || !KINDS.includes(kind as NoteKind) || typeof text !== 'string'
    || text.trim().length === 0 || text.length > MAX_NOTE_CHARS || link === undefined || !line(revision)
    || !timestamp(createdAt) || !timestamp(updatedAt)) return undefined;
  return { id, kind: kind as NoteKind, text, link, revision, createdAt: createdAt as string, updatedAt: updatedAt as string };
}

/** Strict schema check; anything unexpected is an error, never a partial repair. */
export function parseStore(text: string): StoreRead {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { state: 'error', code: 'store-corrupt' }; }
  if (!record(value) || !exact(value, ['schemaVersion', 'notes']) || value.schemaVersion !== 1
    || !Array.isArray(value.notes) || value.notes.length > MAX_NOTES) return { state: 'error', code: 'store-schema' };
  const notes: StoredNote[] = [];
  const ids = new Set<string>();
  for (const entry of value.notes) {
    const note = parseNote(entry);
    if (note === undefined || ids.has(note.id)) return { state: 'error', code: 'store-schema' };
    ids.add(note.id);
    notes.push(note);
  }
  return { state: 'ok', exists: true, notes };
}

export class LocalStore {
  readonly directory: string;
  // Writes are serialized in-process; this process is the single writer.
  #tail: Promise<unknown> = Promise.resolve();
  // A project whose file failed to read stays read-only for this launch; nothing is rewritten.
  readonly #failed = new Map<string, StoreErrorCode>();

  constructor(directory: string) {
    if (typeof directory !== 'string' || !isAbsolute(directory) || directory.includes('\0')) throw new StoreError(500, 'store-unavailable');
    this.directory = directory;
  }

  #file(key: string): string {
    if (!KEY.test(key)) throw new StoreError(500, 'store-unavailable');
    return join(this.directory, `notes-${key}.json`);
  }

  // Persisted consent is the file's existence. Never creates anything.
  async exists(key: string): Promise<boolean> {
    try {
      await lstat(this.#file(key));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      // Unknown means the store can't be trusted; report it rather than guess "absent".
      return true;
    }
  }

  async read(key: string): Promise<StoreRead> {
    const failed = this.#failed.get(key);
    if (failed !== undefined) return { state: 'error', code: failed };
    const result = await this.#readFile(key);
    if (result.state === 'error') this.#failed.set(key, result.code);
    return result;
  }

  async #readFile(key: string): Promise<StoreRead> {
    const path = this.#file(key);
    let handle;
    try {
      handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { state: 'ok', exists: false, notes: [] };
      return { state: 'error', code: 'store-unreadable' };
    }
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) return { state: 'error', code: 'store-unreadable' };
      if (stat.size > MAX_STORE_BYTES) return { state: 'error', code: 'store-too-large' };
      // One byte beyond the size seen: growth during the read is detected, never unbounded.
      const buffer = Buffer.alloc(Math.min(stat.size, MAX_STORE_BYTES) + 1);
      let used = 0;
      while (used < buffer.length) {
        const { bytesRead } = await handle.read(buffer, used, buffer.length - used, used);
        if (bytesRead === 0) break;
        used += bytesRead;
      }
      if (used > stat.size) return { state: 'error', code: 'store-unreadable' };
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, used)); } catch { return { state: 'error', code: 'store-corrupt' }; }
      return parseStore(text);
    } catch {
      return { state: 'error', code: 'store-unreadable' };
    } finally {
      await handle.close().catch(() => undefined);
    }
  }

  #serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.#tail.then(task, task);
    this.#tail = run.catch(() => undefined);
    return run;
  }

  /** Creates an empty store for an explicit enable. An existing file is left exactly as it is. */
  create(key: string): Promise<StoreRead> {
    return this.#serial(async () => {
      const current = await this.read(key);
      if (current.state === 'error' || current.exists) return current;
      await this.#write(key, []);
      return { state: 'ok', exists: true, notes: [] };
    });
  }

  /** Read-modify-write. Callers check consent first. If `change` throws, nothing is written. */
  update(key: string, change: (notes: readonly StoredNote[]) => readonly StoredNote[]): Promise<readonly StoredNote[]> {
    return this.#serial(async () => {
      const current = await this.read(key);
      if (current.state === 'error') throw new StoreError(409, 'store-read-only');
      const next = change(current.notes);
      if (next.length > MAX_NOTES) throw new StoreError(409, 'note-limit');
      await this.#write(key, next);
      return next;
    });
  }

  // The data directory must be a real directory, never a link: mkdir succeeds on a link to a
  // directory, and chmod or writes through it would land in the link's target. A link or a
  // non-directory is refused before anything is created or changed. Mode is set through a
  // no-follow handle on the verified directory, never by path.
  async #prepareDirectory(): Promise<void> {
    const unavailable = () => new StoreError(409, 'store-unavailable');
    try {
      const info = await lstat(this.directory);
      if (info.isSymbolicLink() || !info.isDirectory()) throw unavailable();
    } catch (error) {
      if (error instanceof StoreError) throw error;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw unavailable();
      try { await mkdir(this.directory, { recursive: true, mode: 0o700 }); } catch { throw new StoreError(500, 'store-write-failed'); }
    }
    let dir;
    try { dir = await open(this.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); } catch { throw unavailable(); }
    try {
      if (!(await dir.stat()).isDirectory()) throw unavailable();
      await dir.chmod(0o700);
    } catch (error) {
      throw error instanceof StoreError ? error : new StoreError(500, 'store-write-failed');
    } finally { await dir.close().catch(() => undefined); }
  }

  // Temp file in the same directory, fsync, then rename over the target: a reader sees the
  // old file or the new one, never a partial write.
  async #write(key: string, notes: readonly StoredNote[]): Promise<void> {
    const body = Buffer.from(`${JSON.stringify({ schemaVersion: 1, notes }, null, 1)}\n`, 'utf8');
    if (body.length > MAX_STORE_BYTES) throw new StoreError(409, 'store-full');
    const target = this.#file(key);
    await this.#prepareDirectory();
    const temp = join(this.directory, `.notes-${key}.${randomBytes(8).toString('hex')}.tmp`);
    let created = false;
    try {
      const handle = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      created = true;
      try {
        // On the open handle, never by path: a path could be swapped for a link.
        await handle.chmod(0o600);
        await handle.writeFile(body);
        await handle.sync();
      } finally { await handle.close(); }
      await rename(temp, target);
      created = false;
    } catch {
      if (created) await unlink(temp).catch(() => undefined);
      throw new StoreError(500, 'store-write-failed');
    }
    // Best effort: persist the rename itself.
    try {
      const dir = await open(this.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      try { await dir.sync(); } finally { await dir.close(); }
    } catch { /* Some platforms can't fsync a directory; the rename is still atomic. */ }
  }
}

/** Production store, or null where Boozer has no app data directory (unsupported platform). */
export function defaultLocalStore(): LocalStore | null {
  const directory = defaultDataDirectory();
  return directory === null ? null : new LocalStore(directory);
}
