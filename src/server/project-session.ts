import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { basename } from 'node:path';
import type { WorkspaceSnapshot } from '../shared/contracts.js';
import type { FileResponse, FolderSelectionResponse, GraphResponse, ProjectStatus } from '../shared/project-api.js';
import { ANALYSIS_KEY, extractDependencies } from '../shared/extractor.js';
import { InputError, LocalInputAdapter } from './local-input.js';
import { defaultLocalStore, type LocalStore } from './local-store.js';
import { ProjectNotes } from './project-notes.js';
import { FolderPickerError, pickFolder, type FolderPicker } from './folder-picker.js';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

interface Indexed {
  readonly snapshot: WorkspaceSnapshot;
  readonly response: GraphResponse;
  readonly files: ReadonlyMap<string, FileResponse>;
}

/** One launch owns one capability and at most one selected root/current snapshot. */
export class ProjectSession {
  readonly #capability = randomBytes(32).toString('hex');
  #input: LocalInputAdapter | null;
  #label: string;
  #picking: AbortController | null = null;
  readonly #picker: FolderPicker;
  readonly #notesStore: LocalStore | null;
  #revoked = false;
  #state: ProjectStatus['state'] = 'selected';
  #current: Indexed | null = null;
  #indexing: AbortController | null = null;
  readonly #streams = new Set<AbortController>();

  // --- Project notes hook (phase 1) ---
  // Notes stay off until a notes route enables them; constructing the store touches no disk.
  // Tests pass their own LocalStore (or null); production uses the platform data directory.
  #notes: ProjectNotes | null;

  constructor(input: LocalInputAdapter | null, label: string, notesStore: LocalStore | null = defaultLocalStore(), picker: FolderPicker = pickFolder) {
    this.#input = input;
    this.#label = label;
    this.#notesStore = notesStore;
    this.#picker = picker;
    this.#notes = input === null || notesStore === null ? null : new ProjectNotes(notesStore, input.storageIdentity());
  }

  // Same authority as the graph: this project, not revoked, and confirmed/indexed.
  notes(id: string): ProjectNotes {
    this.current(id);
    if (this.#notes === null) throw new ApiError(404, 'notes-unavailable');
    return this.#notes;
  }
  // --- end project notes hook ---

  // Used once by the launcher, never sent by an HTTP response or logged.
  launchUrl(development: boolean): string {
    return `http://127.0.0.1:${development ? 5173 : 4173}/#cap=${this.#capability}`;
  }

  authorized(authorization: string | undefined): boolean {
    if (this.#revoked || authorization === undefined) return false;
    const expected = Buffer.from(`Bearer ${this.#capability}`);
    const supplied = Buffer.from(authorization);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }

  descriptor(): ProjectStatus | null {
    return this.#input === null ? null : { id: this.#input.projectId, label: this.#label, state: this.#state };
  }

  async chooseFolder(signal: AbortSignal): Promise<FolderSelectionResponse> {
    if (this.#revoked) throw new ApiError(401, 'revoked');
    if (signal.aborted) throw new ApiError(409, 'cancelled');
    if (this.#picking !== null || this.#indexing !== null) throw new ApiError(409, 'picker-busy');
    const controller = new AbortController();
    this.#picking = controller;
    const combined = AbortSignal.any([signal, controller.signal]);
    // Retire all authority over the previous root before the host asks for a new one.
    this.#clearProject();
    try {
      const folder = await this.#picker(combined);
      if (combined.aborted || this.#revoked) throw new ApiError(409, 'cancelled');
      if (folder === null) return { status: 'cancelled' };
      const input = await LocalInputAdapter.select(folder);
      if (combined.aborted || this.#revoked) { input.close(); throw new ApiError(409, 'cancelled'); }
      this.#input = input;
      this.#label = basename(folder) || 'Selected folder';
      this.#notes = this.#notesStore === null ? null : new ProjectNotes(this.#notesStore, input.storageIdentity());
      return { status: 'selected', project: this.descriptor()! };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof FolderPickerError) {
        throw new ApiError(error.code === 'picker-busy' ? 409 : error.code === 'picker-unavailable' ? 503 : 400, error.code);
      }
      if (error instanceof InputError) throw new ApiError(422, error.code);
      throw new ApiError(500, 'picker-failed');
    } finally { this.#picking = null; }
  }

  #project(id: string): LocalInputAdapter {
    if (this.#revoked) throw new ApiError(401, 'revoked');
    if (this.#input === null || id !== this.#input.projectId) throw new ApiError(404, 'invalid-project');
    return this.#input;
  }

  current(id: string, snapshotId?: string): Indexed {
    this.#project(id);
    if (this.#current === null) throw new ApiError(409, 'not-indexed');
    if (snapshotId !== undefined && snapshotId !== this.#current.snapshot.snapshotId) throw new ApiError(409, 'stale-snapshot');
    return this.#current;
  }

  file(id: string, fileId: string, snapshotId: string): FileResponse {
    const source = this.current(id, snapshotId).files.get(fileId);
    if (source === undefined) throw new ApiError(404, 'invalid-file');
    return source;
  }

  async index(id: string, signal: AbortSignal, previousSnapshot?: string): Promise<GraphResponse> {
    const input = this.#project(id);
    if (this.#indexing !== null) throw new ApiError(409, 'indexing');
    if (previousSnapshot !== undefined) this.current(id, previousSnapshot);
    else if (this.#current !== null) throw new ApiError(409, 'already-confirmed');
    this.#cancelStreams();
    this.#current = null;
    this.#state = 'indexing';
    const controller = new AbortController();
    const combined = AbortSignal.any([signal, controller.signal]);
    this.#indexing = controller;
    try {
      input.confirm(id);
      const snapshot = await input.snapshot(id, { analysisKey: ANALYSIS_KEY, signal: combined });
      const graph = extractDependencies(snapshot);
      if (combined.aborted || this.#revoked) throw new ApiError(409, 'cancelled');
      const files = new Map<string, FileResponse>();
      const ids = [...snapshot.files, ...(snapshot.documents ?? [])].map((file) => {
        const fileId = randomUUID();
        files.set(fileId, Object.freeze({ snapshotId: snapshot.snapshotId, path: file.path, contentHash: file.contentHash, text: file.text }));
        return Object.freeze({ id: fileId, path: file.path });
      });
      const response = Object.freeze({ projectId: id, label: this.#label, graph, files: Object.freeze(ids) });
      this.#current = { snapshot, response, files };
      this.#state = 'ready';
      return response;
    } catch (error) {
      this.#state = 'failed';
      if (error instanceof ApiError) throw error;
      if (error instanceof InputError) throw new ApiError(422, error.code);
      throw new ApiError(422, 'indexing-failed');
    } finally { this.#indexing = null; }
  }

  // Refresh and close invalidate pending model streams before they publish more text.
  beginExplanation(id: string, snapshotId: string, path: string, signal: AbortSignal) {
    const current = this.current(id, snapshotId);
    if (!current.snapshot.files.some((file) => file.path === path)) throw new ApiError(404, 'invalid-file');
    return { ...this.beginChat(id, snapshotId, signal), selected: path };
  }

  // Chat and explanations share the same active-model slot and revocation lifecycle.
  beginChat(id: string, snapshotId: string, signal: AbortSignal) {
    const current = this.current(id, snapshotId);
    if (this.#streams.size > 0) throw new ApiError(409, 'explanation-running');
    const controller = new AbortController();
    this.#streams.add(controller);
    return {
      snapshot: current.snapshot, graph: current.response.graph,
      signal: AbortSignal.any([signal, controller.signal]),
      finish: () => { this.#streams.delete(controller); },
    };
  }

  #cancelStreams(): void { for (const stream of this.#streams) stream.abort(); this.#streams.clear(); }
  #clearProject(): void {
    this.#indexing?.abort();
    this.#cancelStreams();
    this.#current = null;
    this.#input?.close();
    this.#input = null;
    this.#notes = null;
    this.#label = '';
    this.#state = 'selected';
  }
  close(): void {
    this.#revoked = true;
    this.#picking?.abort();
    this.#clearProject();
  }
}
