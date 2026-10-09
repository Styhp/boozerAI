import type { DependencyGraph, FilePath } from '../../shared/contracts';
import type { CloudPreview, CloudStatus, ExplainRequestBody, ExplanationEvent } from '../../shared/explanation';
import type { LoadedSource } from '../map/model';

// The map screen reads everything through this interface. The M2/M3 API integration
// provides the real implementation; until then only the dev-only fixture preview exists.
export interface ProjectSource {
  readonly label: string;
  // True when the graph is not parser output (the hand-written fixture answer key).
  readonly isPreview: boolean;
  loadGraph(): Promise<DependencyGraph>;
  loadSource(path: FilePath): Promise<LoadedSource>;
  // Streams a local-model explanation. The API implementation POSTs the body to
  // /api/projects/:id/explanations and passes the response to readExplanationEvents.
  explain(body: ExplainRequestBody, signal: AbortSignal): AsyncIterable<ExplanationEvent>;
  // Optional cloud comparison (P-16), present only when the server offers it. `preview`
  // returns the exact payload and sends nothing; it rejects with a user-readable Error.
  readonly cloud?: {
    status(): Promise<CloudStatus>;
    preview(body: ExplainRequestBody): Promise<CloudPreview>;
  };
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
