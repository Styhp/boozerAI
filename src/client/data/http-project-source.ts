import type { DependencyGraph } from '../../shared/contracts';
import type { CloudPreview, CloudStatus, ExplanationEvent, ExplainRequestBody } from '../../shared/explanation';
import type { NoteCreateBody, NoteEditBody, NotesResponse } from '../../shared/notes';
import type { FileResponse, FolderSelectionResponse, GraphResponse, SessionResponse } from '../../shared/project-api';
import { readExplanationEvents } from './explanation-stream';
import { sha256Hex, type NotesSource, type ProjectSource } from './project-source';
import { isRepoChatRequest, type RepoChatRequest } from '../../shared/repo-chat';

export class ProjectApiError extends Error {
  constructor(readonly status: number, readonly code: string) { super(`Project request failed: ${code}`); }
}

type CapabilityStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const CAPABILITY_KEY = 'boozer.local-capability';

export function clearCapability(storage?: CapabilityStorage, expected?: string): void {
  try {
    // A late response from an old connection cannot erase a newly launched session.
    if (expected === undefined || storage?.getItem(CAPABILITY_KEY) === expected) storage?.removeItem(CAPABILITY_KEY);
  } catch { /* Storage can be blocked; never prevent revocation of in-memory authority. */ }
}

export function takeCapability(location: Pick<Location, 'hash' | 'pathname' | 'search'>, history: Pick<History, 'replaceState'>, storage?: CapabilityStorage): string | null {
  const hash = location.hash;
  if (hash !== '') {
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    clearCapability(storage);
    const params = new URLSearchParams(hash.slice(1));
    const cap = params.get('cap');
    if ([...params.keys()].length !== 1 || cap === null || !/^[0-9a-f]{64}$/.test(cap)) return null;
    try { storage?.setItem(CAPABILITY_KEY, cap); } catch { /* The launch still works when browser storage is blocked. */ }
    return cap;
  }
  try {
    const cap = storage?.getItem(CAPABILITY_KEY);
    if (typeof cap === 'string' && /^[0-9a-f]{64}$/.test(cap)) return cap;
  } catch { /* No stored authority is available. */ }
  clearCapability(storage);
  return null;
}

type ApiFetch = (input: string, init: RequestInit) => Promise<Response>;

// Requests use only bearer headers. Local bootstrap retains the launch token in
// tab-scoped sessionStorage; the server remains the authority for its lifetime.
export class ProjectConnection {
  #capability: string;
  readonly #fetch: ApiFetch;
  readonly #onRevoked: () => void;
  #revoked = false;
  #cloud: CloudStatus = { available: false };

  constructor(capability: string, transport: ApiFetch = (input, init) => fetch(input, init), onRevoked: () => void = () => undefined) {
    this.#capability = capability;
    this.#fetch = transport;
    this.#onRevoked = onRevoked;
  }

  async request(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<Response> {
    if (this.#revoked) throw new ProjectApiError(401, 'revoked');
    const response = await this.#fetch(path, {
      method, credentials: 'omit', mode: 'same-origin', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { Authorization: `Bearer ${this.#capability}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...(signal === undefined ? {} : { signal }),
    });
    if (!response.ok) {
      if (response.status === 401) this.#revoke();
      let code = 'request-failed';
      try {
        const failure = await response.json() as { error?: { code?: unknown } };
        if (typeof failure.error?.code === 'string' && /^[a-z-]{1,40}$/.test(failure.error.code)) code = failure.error.code;
      } catch { /* Only sanitized codes become visible errors. */ }
      throw new ProjectApiError(response.status, code);
    }
    if (this.#revoked) throw new ProjectApiError(401, 'revoked');
    return response;
  }

  get cloudStatus(): CloudStatus { return this.#revoked ? { available: false } : this.#cloud; }

  async session(): Promise<SessionResponse> {
    const session = await (await this.request('/api/session')).json() as SessionResponse;
    if (this.#revoked) throw new ProjectApiError(401, 'revoked');
    // Availability is fixed at launch. Cache the authenticated status for each source.
    this.#cloud = session.cloud;
    return session;
  }
  async resume(): Promise<SessionResponse & { response: GraphResponse | null }> {
    const session = await this.session();
    if (session.project?.state !== 'ready') return { ...session, response: null };
    const response = await (await this.request(`/api/projects/${session.project.id}/graph`)).json() as GraphResponse;
    if (this.#revoked) throw new ProjectApiError(401, 'revoked');
    if (response.projectId !== session.project.id) throw new ProjectApiError(409, 'stale-snapshot');
    return { ...session, response };
  }
  async confirm(id: string): Promise<GraphResponse> { return (await this.request(`/api/projects/${id}/confirm`, 'POST', {})).json() as Promise<GraphResponse>; }
  async chooseFolder(signal: AbortSignal): Promise<FolderSelectionResponse> {
    const result = await (await this.request('/api/session/pick', 'POST', {}, signal)).json() as FolderSelectionResponse;
    if (this.#revoked) throw new ProjectApiError(401, 'revoked');
    if (signal.aborted) throw new ProjectApiError(409, 'cancelled');
    return result;
  }
  async refresh(id: string, snapshotId: string): Promise<GraphResponse> { return (await this.request(`/api/projects/${id}/refresh`, 'POST', { snapshotId })).json() as Promise<GraphResponse>; }
  async close(id: string): Promise<void> {
    try { await this.request(`/api/projects/${id}/close`, 'POST', {}); }
    finally { this.#revoke(); }
  }
  #revoke(): void {
    if (this.#revoked) return;
    this.#revoked = true;
    this.#capability = '';
    this.#cloud = { available: false };
    this.#onRevoked();
  }
}

export class HttpProjectSource implements ProjectSource {
  readonly isPreview = false;
  readonly label: string;
  readonly cloud?: NonNullable<ProjectSource['cloud']>;
  readonly #connection: ProjectConnection;
  readonly #id: string;
  readonly #initialSnapshot: string;
  readonly #abort = new AbortController();
  #response: GraphResponse;

  constructor(connection: ProjectConnection, response: GraphResponse) {
    this.#connection = connection;
    this.#response = response;
    this.#id = response.projectId;
    this.#initialSnapshot = response.graph.snapshotId;
    this.label = response.label;
    if (connection.cloudStatus.available) {
      this.cloud = {
        status: async () => this.#abort.signal.aborted ? { available: false } : connection.cloudStatus,
        preview: (body) => this.#previewCloud(body),
      };
    }
  }

  revoke(): void { this.#abort.abort(); }

  // --- Project notes hook (phase 1): same connection, capability and revocation signal.
  // Only opaque IDs, the snapshot ID and the user's own text/lines are sent.
  readonly notes: NotesSource = {
    list: async (snapshotId: string) => {
      const response = await this.#connection.request(`/api/projects/${this.#id}/notes?snapshotId=${encodeURIComponent(snapshotId)}`, 'GET', undefined, this.#abort.signal);
      return response.json() as Promise<NotesResponse>;
    },
    enable: async () => { await this.#notesPost('/enable', {}); },
    disable: async () => { await this.#notesPost('/disable', {}); },
    create: async (body: NoteCreateBody) => { await this.#notesPost('', body); },
    edit: async (noteId: string, body: NoteEditBody) => { await this.#notesPost(`/${this.#noteId(noteId)}`, body); },
    remove: async (noteId: string, revision: number) => { await this.#notesPost(`/${this.#noteId(noteId)}/delete`, { revision }); },
    clear: async () => { await this.#notesPost('/clear', {}); },
  };

  #noteId(noteId: string): string {
    if (!/^[0-9a-f]{32}$/.test(noteId)) throw new ProjectApiError(404, 'note-not-found');
    return noteId;
  }

  async #notesPost(path: string, body: unknown): Promise<void> {
    await this.#connection.request(`/api/projects/${this.#id}/notes${path}`, 'POST', body, this.#abort.signal);
  }
  // --- end project notes hook ---

  async #previewCloud(body: ExplainRequestBody): Promise<CloudPreview> {
    if (this.#abort.signal.aborted) throw new Error('Cloud preview cancelled.');
    if (body.snapshotId !== this.#initialSnapshot || !this.#response.files.some((entry) => entry.path === body.path)) {
      throw new Error('Refresh and select the file again.');
    }
    try {
      const response = await this.#connection.request(`/api/projects/${this.#id}/explanations/preview`, 'POST',
        { snapshotId: body.snapshotId, path: body.path }, this.#abort.signal);
      const preview = await response.json() as CloudPreview;
      if (this.#abort.signal.aborted) throw new Error();
      if (!this.#connection.cloudStatus.available) throw new ProjectApiError(401, 'revoked');
      return preview;
    } catch (error) {
      if (this.#abort.signal.aborted) throw new Error('Cloud preview cancelled.');
      const messages: Readonly<Record<string, string>> = {
        'cloud-unavailable': 'No cloud provider is configured for this launch.',
        'stale-snapshot': 'Refresh and select the file again.',
        'invalid-selection': 'Select a source file in the current snapshot.',
        'no-excerpt': 'No exact excerpt of this file fits the explanation budget, so nothing was sent.',
        'unauthorized': 'The project session has ended. Restart the launcher.',
        'revoked': 'The project session has ended. Restart the launcher.',
      };
      const message = error instanceof ProjectApiError && Object.hasOwn(messages, error.code) ? messages[error.code] : undefined;
      throw new Error(message ?? 'Could not preview the cloud request.');
    }
  }

  async loadGraph(): Promise<DependencyGraph> {
    const result = await this.#connection.request(`/api/projects/${this.#id}/graph`, 'GET', undefined, this.#abort.signal);
    const response = await result.json() as GraphResponse;
    if (response.projectId !== this.#id || response.graph.snapshotId !== this.#initialSnapshot || this.#abort.signal.aborted) throw new ProjectApiError(409, 'stale-snapshot');
    this.#response = response;
    return response.graph;
  }

  async loadSource(path: string): Promise<FileResponse> {
    const file = this.#response.files.find((entry) => entry.path === path);
    const node = [...this.#response.graph.files, ...(this.#response.graph.documents ?? [])].find((entry) => entry.path === path);
    if (file === undefined || node === undefined) throw new ProjectApiError(404, 'invalid-file');
    const result = await this.#connection.request(`/api/projects/${this.#id}/files/${file.id}?snapshotId=${this.#initialSnapshot}`, 'GET', undefined, this.#abort.signal);
    const source = await result.json() as FileResponse;
    if (source.snapshotId !== this.#initialSnapshot || source.path !== path || typeof source.text !== 'string'
      || source.contentHash !== node.contentHash || await sha256Hex(source.text) !== source.contentHash || this.#abort.signal.aborted) {
      throw new ProjectApiError(409, 'stale-snapshot');
    }
    return source;
  }

  async *explain(body: ExplainRequestBody, signal: AbortSignal): AsyncIterable<ExplanationEvent> {
    if (body.snapshotId !== this.#initialSnapshot || !this.#response.files.some((entry) => entry.path === body.path)) {
      yield { type: 'error', code: 'stale-snapshot', message: 'Select a file in the current snapshot.' }; return;
    }
    try {
      const response = await this.#connection.request(`/api/projects/${this.#id}/explanations`, 'POST', body, AbortSignal.any([signal, this.#abort.signal]));
      if (response.body === null || response.headers.get('Content-Type') !== 'application/x-ndjson') throw new Error();
      yield* readExplanationEvents(response.body);
    } catch (error) {
      const stale = error instanceof ProjectApiError && error.code === 'stale-snapshot';
      const cancelled = signal.aborted || this.#abort.signal.aborted;
      yield { type: 'error', code: cancelled ? 'cancelled' : stale ? 'stale-snapshot' : 'runtime-error', message: cancelled ? 'Explanation cancelled.' : stale ? 'Refresh and select the file again.' : 'Could not request an explanation.' };
    }
  }

  async *chat(body: RepoChatRequest, signal: AbortSignal): AsyncIterable<ExplanationEvent> {
    if (signal.aborted || this.#abort.signal.aborted) { yield { type: 'error', code: 'cancelled', message: 'Chat cancelled.' }; return; }
    if (!isRepoChatRequest(body) || body.snapshotId !== this.#initialSnapshot
      || (body.contextPath !== undefined && !this.#response.files.some((entry) => entry.path === body.contextPath))) {
      yield { type: 'error', code: 'stale-snapshot', message: 'Ask about a file in the current project snapshot.' }; return;
    }
    try {
      const response = await this.#connection.request(`/api/projects/${this.#id}/chat`, 'POST', body, AbortSignal.any([signal, this.#abort.signal]));
      if (response.body === null || response.headers.get('Content-Type') !== 'application/x-ndjson') throw new Error();
      for await (const event of readExplanationEvents(response.body)) {
        if (signal.aborted || this.#abort.signal.aborted) return;
        yield event;
      }
    } catch (error) {
      const cancelled = signal.aborted || this.#abort.signal.aborted;
      const stale = error instanceof ProjectApiError && error.code === 'stale-snapshot';
      const busy = error instanceof ProjectApiError && error.code === 'explanation-running';
      yield { type: 'error', code: cancelled ? 'cancelled' : stale ? 'stale-snapshot' : 'runtime-error',
        message: cancelled ? 'Chat cancelled.' : stale ? 'The snapshot changed. Start a new chat.' : busy ? 'Another AI answer is running. Wait for it or cancel it first.' : 'Could not ask the local model.' };
    }
  }
}
