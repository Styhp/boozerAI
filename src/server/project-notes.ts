import { randomBytes } from 'node:crypto';
import type { SnapshotFile, WorkspaceSnapshot } from '../shared/contracts.js';
import type { NoteKind, NotesResponse, NoteView } from '../shared/notes.js';
import { MAX_NOTE_CHARS, StoreError, type LocalStore, type StoredNote } from './local-store.js';
import type { StorageIdentity } from './local-input.js';
import { noteLines, noteStatus, stampLink, validRange, type LineHashCache } from './note-status.js';

// Project notes, phase 1: the user's own notes linked to lines. No model reads, writes or
// receives them. Off by default per launch; persisted consent is an existing notes file.
// The browser never supplies a hash or a path to read: links name a file in the current
// in-memory snapshot and the server stamps hashes from that snapshot's text.

export class NotesError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

const KINDS: readonly NoteKind[] = ['decision', 'constraint', 'question'];
const SNAPSHOT = /^sha256:[0-9a-f]{64}$/;
const NOTE_ID = /^[0-9a-f]{32}$/;
const invalid = () => new NotesError(400, 'invalid-body');
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

// Exact field sets: every required name present, nothing beyond required + optional.
function keys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  const names = Object.keys(value);
  if (required.some((name) => !Object.hasOwn(value, name)) || names.some((name) => !required.includes(name) && !optional.includes(name))) throw invalid();
}
function kind(value: unknown): NoteKind {
  if (!KINDS.includes(value as NoteKind)) throw invalid();
  return value as NoteKind;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw invalid();
  const trimmed = value.trim();
  if (trimmed.length === 0) throw invalid();
  if (trimmed.length > MAX_NOTE_CHARS) throw new NotesError(400, 'note-too-long');
  return trimmed;
}
function snapshotId(value: unknown): string {
  if (typeof value !== 'string' || !SNAPSHOT.test(value)) throw invalid();
  return value;
}
function positive(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw invalid();
  return value as number;
}

function publicView(note: StoredNote, files: ReadonlyMap<string, SnapshotFile>, cache: LineHashCache): NoteView {
  const result = noteStatus(note.link, note.link === null ? undefined : files.get(note.link.file), cache);
  // Rebuilt field by field so no stored hash can reach the browser.
  return {
    note: {
      id: note.id, kind: note.kind, text: note.text, revision: note.revision, createdAt: note.createdAt, updatedAt: note.updatedAt,
      link: note.link === null ? null : { file: note.link.file, startLine: note.link.startLine, endLine: note.link.endLine },
    },
    status: result.status,
    ...(result.movedTo === undefined ? {} : { movedTo: { startLine: result.movedTo.startLine, endLine: result.movedTo.endLine } }),
    ...(result.currentText === undefined ? {} : { currentText: result.currentText }),
  };
}
const fileMap = (snapshot: WorkspaceSnapshot) => new Map(snapshot.files.map((file) => [file.path, file]));

export class ProjectNotes {
  readonly #store: LocalStore;
  readonly #identity: StorageIdentity;
  // Per-launch choice; null follows persisted consent (the notes file exists).
  #choice: boolean | null = null;

  constructor(store: LocalStore, identity: StorageIdentity) {
    this.#store = store;
    this.#identity = identity;
  }

  async #enabled(): Promise<boolean> { return this.#choice ?? await this.#store.exists(this.#identity.key); }

  // Fails closed: an overlap check that can't run counts as an overlap.
  async #overlapping(): Promise<boolean> {
    try { return await this.#identity.overlaps(this.#store.directory); } catch { return true; }
  }

  async #writable(): Promise<void> {
    if (!(await this.#enabled())) throw new NotesError(409, 'notes-disabled');
    if (await this.#overlapping()) throw new NotesError(409, 'notes-overlap');
  }

  async #update(change: (notes: readonly StoredNote[]) => readonly StoredNote[]): Promise<readonly StoredNote[]> {
    try { return await this.#store.update(this.#identity.key, change); } catch (error) {
      throw error instanceof StoreError ? new NotesError(error.status, error.code) : error;
    }
  }

  async list(snapshot: WorkspaceSnapshot): Promise<NotesResponse> {
    if (!(await this.#enabled())) return { enabled: false, state: 'ok', notes: [] };
    if (await this.#overlapping()) return { enabled: true, state: 'error', errorCode: 'notes-overlap', notes: [] };
    const read = await this.#store.read(this.#identity.key);
    if (read.state === 'error') return { enabled: true, state: 'error', errorCode: read.code, notes: [] };
    const files = fileMap(snapshot);
    const cache: LineHashCache = new Map();
    return { enabled: true, state: 'ok', notes: read.notes.map((note) => publicView(note, files, cache)) };
  }

  async enable(): Promise<{ enabled: true }> {
    if (await this.#overlapping()) throw new NotesError(409, 'notes-overlap');
    try { await this.#store.create(this.#identity.key); } catch (error) {
      throw error instanceof StoreError ? new NotesError(error.status, error.code) : error;
    }
    // A store that failed to read stays enabled-but-read-only; listing reports its code.
    this.#choice = true;
    return { enabled: true };
  }

  disable(): { enabled: false } {
    this.#choice = false;
    return { enabled: false };
  }

  async create(snapshot: WorkspaceSnapshot, input: { kind: NoteKind; text: string; link: { path: string; startLine: number; endLine: number } | null }): Promise<{ note: NoteView }> {
    await this.#writable();
    let link = null;
    if (input.link !== null) {
      const file = snapshot.files.find((entry) => entry.path === input.link!.path);
      if (file === undefined) throw new NotesError(404, 'invalid-file');
      if (!validRange(noteLines(file.text), input.link.startLine, input.link.endLine)) throw new NotesError(400, 'invalid-range');
      link = stampLink(file.path, file, input.link.startLine, input.link.endLine);
    }
    const now = new Date().toISOString();
    const note: StoredNote = { id: randomBytes(16).toString('hex'), kind: input.kind, text: input.text, link, revision: 1, createdAt: now, updatedAt: now };
    await this.#update((notes) => [...notes, note]);
    return { note: publicView(note, fileMap(snapshot), new Map()) };
  }

  async edit(snapshot: WorkspaceSnapshot, noteId: string, input: { revision: number; text?: string; kind?: NoteKind; relink: boolean }): Promise<{ note: NoteView }> {
    await this.#writable();
    const files = fileMap(snapshot);
    let edited: StoredNote | undefined;
    await this.#update((notes) => {
      // Inside the change callback, so an unknown ID writes nothing.
      if (!notes.some((note) => note.id === noteId)) throw new NotesError(404, 'note-not-found');
      return notes.map((note) => {
        if (note.id !== noteId) return note;
        if (note.revision !== input.revision) throw new NotesError(409, 'revision-conflict');
        let link = note.link;
        if (input.relink) {
          const file = link === null ? undefined : files.get(link.file);
          const status = noteStatus(link, file);
          // Re-link only to the one place the exact lines moved to; never to a guess.
          if (link === null || file === undefined || status.status !== 'moved' || status.movedTo === undefined) throw new NotesError(409, 'not-moved');
          link = stampLink(link.file, file, status.movedTo.startLine, status.movedTo.endLine);
        }
        edited = {
          ...note, link, kind: input.kind ?? note.kind, text: input.text ?? note.text,
          revision: note.revision + 1, updatedAt: new Date().toISOString(),
        };
        return edited;
      });
    });
    if (edited === undefined) throw new NotesError(404, 'note-not-found');
    return { note: publicView(edited, files, new Map()) };
  }

  async remove(noteId: string, revision: number): Promise<{ deleted: true }> {
    await this.#writable();
    await this.#update((notes) => {
      // Inside the change callback, so an unknown ID writes nothing.
      const note = notes.find((entry) => entry.id === noteId);
      if (note === undefined) throw new NotesError(404, 'note-not-found');
      if (note.revision !== revision) throw new NotesError(409, 'revision-conflict');
      return notes.filter((entry) => entry.id !== noteId);
    });
    return { deleted: true };
  }

  async clear(): Promise<{ cleared: true }> {
    await this.#writable();
    await this.#update(() => []);
    return { cleared: true };
  }
}

export interface NotesRouteInput {
  readonly method: string | undefined;
  // Sub-path after /api/projects/:id/notes: '', '/enable', '/disable', '/clear', '/:noteId', '/:noteId/delete'.
  readonly path: string;
  readonly query: string | undefined;
  readonly body: () => Promise<Record<string, unknown>>;
  readonly notes: ProjectNotes;
  // Throws the session's own 409 for a stale snapshot, like the file route.
  readonly snapshot: (snapshotId: string) => WorkspaceSnapshot;
}

/** Notes route table. Authorization, Origin, JSON and the body cap are checked by the caller. */
export async function routeNotes({ method, path, query, body, notes, snapshot }: NotesRouteInput): Promise<unknown> {
  const parts = path === '' ? [] : path.slice(1).split('/');
  if (path !== '' && (!path.startsWith('/') || parts.some((part) => part === ''))) throw new NotesError(404, 'not-found');
  const noteId = parts[0] !== undefined && NOTE_ID.test(parts[0]) ? parts[0] : undefined;
  const action = parts.length === 0 ? 'collection'
    : parts.length === 1 && ['enable', 'disable', 'clear'].includes(parts[0]!) ? parts[0]!
    : parts.length === 1 && noteId !== undefined ? 'edit'
    : parts.length === 2 && noteId !== undefined && parts[1] === 'delete' ? 'delete'
    : null;
  if (action === null) throw new NotesError(404, 'not-found');

  if (method === 'GET') {
    if (action !== 'collection') throw new NotesError(405, 'method-not-allowed');
    const params = new URLSearchParams(query ?? '');
    const id = params.get('snapshotId');
    if (query === undefined || id === null || !SNAPSHOT.test(id) || [...params.keys()].length !== 1) throw new NotesError(400, 'snapshot-required');
    return notes.list(snapshot(id));
  }
  if (method !== 'POST') throw new NotesError(405, 'method-not-allowed');
  if (query !== undefined) throw new NotesError(400, 'invalid-query');
  const input = await body();
  switch (action) {
    case 'enable': keys(input, []); return notes.enable();
    case 'disable': keys(input, []); return notes.disable();
    case 'clear': keys(input, []); return notes.clear();
    case 'collection': {
      // POST to the collection creates one note.
      keys(input, ['snapshotId', 'kind', 'text'], ['link']);
      const current = snapshot(snapshotId(input.snapshotId));
      let link = null;
      if (Object.hasOwn(input, 'link')) {
        const value = input.link;
        if (!record(value)) throw invalid();
        keys(value, ['path', 'startLine', 'endLine']);
        if (typeof value.path !== 'string' || value.path === '') throw invalid();
        link = { path: value.path, startLine: positive(value.startLine), endLine: positive(value.endLine) };
      }
      return notes.create(current, { kind: kind(input.kind), text: text(input.text), link });
    }
    case 'edit': {
      keys(input, ['snapshotId', 'revision'], ['text', 'kind', 'relink']);
      if (Object.keys(input).length === 2) throw invalid();
      if (Object.hasOwn(input, 'relink') && input.relink !== 'moved') throw invalid();
      const current = snapshot(snapshotId(input.snapshotId));
      return notes.edit(current, noteId!, {
        revision: positive(input.revision), relink: input.relink === 'moved',
        ...(Object.hasOwn(input, 'text') ? { text: text(input.text) } : {}),
        ...(Object.hasOwn(input, 'kind') ? { kind: kind(input.kind) } : {}),
      });
    }
    default: {
      keys(input, ['revision']);
      return notes.remove(noteId!, positive(input.revision));
    }
  }
}
