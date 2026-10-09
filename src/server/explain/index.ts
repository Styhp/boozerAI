import type { DependencyGraph, FilePath, WorkspaceSnapshot } from '../../shared/contracts.js';
import type { ExplanationEvent, RuntimeStatus } from '../../shared/explanation.js';

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
}

export interface ExplanationService {
  // Always ends with exactly one `done` or `error` event, and never throws.
  explain(request: ExplainRequest): AsyncIterable<ExplanationEvent>;
  // Runtime/model readiness for the summary panel; makes no download.
  status(signal?: AbortSignal): Promise<RuntimeStatus>;
  // Loads the approved model into memory at app start (P-5) so the first request skips the cold load.
  preload(signal?: AbortSignal): Promise<RuntimeStatus>;
}

export { createExplanationService } from './service.js';
