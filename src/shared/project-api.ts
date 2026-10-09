import type { DependencyGraph } from './contracts.js';

// M2 wire contract: paths are display metadata; requests read only opaque IDs.
export interface ProjectStatus {
  readonly id: string;
  readonly label: string;
  readonly state: 'selected' | 'indexing' | 'ready' | 'failed';
}
export interface SessionResponse { readonly project: ProjectStatus | null }
export interface GraphResponse {
  readonly projectId: string;
  readonly label: string;
  readonly graph: DependencyGraph;
  readonly files: readonly { readonly id: string; readonly path: string }[];
}
export interface FileResponse {
  readonly snapshotId: string;
  readonly path: string;
  readonly contentHash: string;
  readonly text: string;
}
