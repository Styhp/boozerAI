import type { DependencyGraph, FilePath, WorkspaceSnapshot } from '../../shared/contracts.js';
import type { CloudPreview, CloudStatus, ExplanationErrorCode, ExplanationEvent, RuntimeStatus } from '../../shared/explanation.js';

// ExplanationService (ARCHITECTURE.md cross-component contracts; P-15). The route
// `POST /api/projects/:id/explanations` (Codex, M2/M3) authorizes the project, checks the
// body's snapshotId, then streams `explain(...)` events to the browser as NDJSON.
// The service only reads the snapshot and graph; it never modifies either and never
// falls back to another provider.

export interface ExplainRequest {
  readonly snapshot: WorkspaceSnapshot;
  readonly graph: DependencyGraph;
  readonly selected: FilePath;
  readonly signal?: AbortSignal;
  // P-16: 'cloud' requires the previewHash returned by previewCloud for the same request.
  readonly provider?: 'local' | 'cloud';
  readonly previewHash?: string;
}

export type CloudPreviewResult =
  | { readonly type: 'preview'; readonly preview: CloudPreview }
  | { readonly type: 'error'; readonly code: ExplanationErrorCode; readonly message: string };

export interface ExplanationService {
  // Always ends with exactly one `done` or `error` event, and never throws.
  explain(request: ExplainRequest): AsyncIterable<ExplanationEvent>;
  // Runtime/model readiness for the summary panel; makes no download.
  status(signal?: AbortSignal): Promise<RuntimeStatus>;
  // Loads the approved model into memory at app start (P-5) so the first request skips the cold load.
  preload(signal?: AbortSignal): Promise<RuntimeStatus>;
}

// P-16, optional cloud comparison: a separate interface so existing ExplanationService
// consumers and doubles are unaffected. createExplanationService implements both.
export interface CloudComparison {
  // Safe to show the browser: never contains the key.
  cloudStatus(): CloudStatus;
  // The exact payload a cloud request would send, for the user to confirm. Sends nothing.
  previewCloud(request: Omit<ExplainRequest, 'provider' | 'previewHash'>): CloudPreviewResult;
}

export { createExplanationService } from './service.js';
