import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { WorkspaceSnapshot } from '../shared/contracts.js';
import type { FileResponse, GraphResponse, ProjectStatus } from '../shared/project-api.js';
import { ANALYSIS_KEY, extractDependencies } from '../shared/extractor.js';
import { InputError, LocalInputAdapter } from './local-input.js';
import { defaultLocalStore, type LocalStore } from './local-store.js';
import { ProjectNotes } from './project-notes.js';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

interface Indexed {
  readonly snapshot: WorkspaceSnapshot;
  readonly response: GraphResponse;
  readonly files: ReadonlyMap<string, FileResponse>;
}

/** One launch owns one root, one capability and one current snapshot. */
export class ProjectSession {
  readonly #capability = randomBytes(32).toString('hex');
  readonly #input: LocalInputAdapter | null;
  readonly #label: string;
  #revoked = false;
  #state: ProjectStatus['state'] = 'selected';
  #current: Indexed | null = null;
  #indexing: AbortController | null = null;
  readonly #streams = new Set<AbortController>();

  // --- Project notes hook (phase 1) ---
  // Notes stay off until a notes route enables them; constructing the store touches no disk.
  // Tests pass their own LocalStore (or null); production uses the platform data directory.
  readonly #notes: ProjectNotes | null;

  constructor(input: LocalInputAdapter | null, label: string, notesStore: LocalStore | null = defaultLocalStore()) {
    this.#input = input;
    this.#label = label;
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
      const ids = snapshot.files.map((file) => {
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
    if (this.#streams.size > 0) throw new ApiError(409, 'explanation-running');
    const controller = new AbortController();
    this.#streams.add(controller);
    return {
      snapshot: current.snapshot, graph: current.response.graph, selected: path,
      signal: AbortSignal.any([signal, controller.signal]),
      finish: () => { this.#streams.delete(controller); },
    };
  }

  #cancelStreams(): void { for (const stream of this.#streams) stream.abort(); this.#streams.clear(); }
  close(): void {
    this.#revoked = true;
    this.#indexing?.abort();
    this.#cancelStreams();
    this.#current = null;
    this.#input?.close();
  }
}
