import type { DependencyGraph } from '../../shared/contracts';
import type { CloudPreview, CloudStatus, ExplanationEvent, ExplainRequestBody } from '../../shared/explanation';
import type { FileResponse, GraphResponse, SessionResponse } from '../../shared/project-api';
import { readExplanationEvents } from './explanation-stream';
import { sha256Hex, type ProjectSource } from './project-source';

export class ProjectApiError extends Error {
  constructor(readonly status: number, readonly code: string) { super(`Project request failed: ${code}`); }
}

export function takeCapability(location: Pick<Location, 'hash' | 'pathname' | 'search'>, history: Pick<History, 'replaceState'>): string | null {
  const hash = location.hash;
  if (hash !== '') history.replaceState(null, '', `${location.pathname}${location.search}`);
  const params = new URLSearchParams(hash.slice(1));
  const cap = params.get('cap');
  return [...params.keys()].length === 1 && cap !== null && /^[0-9a-f]{64}$/.test(cap) ? cap : null;
}

type ApiFetch = (input: string, init: RequestInit) => Promise<Response>;

// Capability stays in this closure and is never attached to a URL or stored on disk.
export class ProjectConnection {
  #capability: string;
  readonly #fetch: ApiFetch;
  #revoked = false;
  #cloud: CloudStatus = { available: false };

  constructor(capability: string, transport: ApiFetch = (input, init) => fetch(input, init)) {
    this.#capability = capability;
    this.#fetch = transport;
  }

  async request(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<Response> {
    if (this.#revoked) throw new ProjectApiError(401, 'revoked');
    const response = await this.#fetch(path, {
      method, credentials: 'omit', mode: 'same-origin', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { Authorization: `Bearer ${this.#capability}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...(signal === undefined ? {} : { signal }),
    });
    if (!response.ok) {
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
  async confirm(id: string): Promise<GraphResponse> { return (await this.request(`/api/projects/${id}/confirm`, 'POST', {})).json() as Promise<GraphResponse>; }
  async refresh(id: string, snapshotId: string): Promise<GraphResponse> { return (await this.request(`/api/projects/${id}/refresh`, 'POST', { snapshotId })).json() as Promise<GraphResponse>; }
  async close(id: string): Promise<void> {
    try { await this.request(`/api/projects/${id}/close`, 'POST', {}); }
    finally { this.#revoked = true; this.#capability = ''; }
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
    const node = this.#response.graph.files.find((entry) => entry.path === path);
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
}
