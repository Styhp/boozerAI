import type { DependencyGraph } from './contracts.js';
import type { CloudStatus } from './explanation.js';

// M2 wire contract: project/file IDs are opaque; explanation paths are snapshot keys.
export interface ProjectStatus {
  readonly id: string;
  readonly label: string;
  readonly state: 'selected' | 'indexing' | 'ready' | 'failed';
}
export interface SessionResponse {
  readonly project: ProjectStatus | null;
  readonly cloud: CloudStatus;
}
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
