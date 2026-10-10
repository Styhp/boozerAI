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
export type FolderSelectionResponse =
  | { readonly status: 'selected'; readonly project: ProjectStatus }
  | { readonly status: 'cancelled' };
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

export interface FileHistory {
  readonly snapshotId: string;
  readonly path: string;
  readonly checkedAt: string;
  readonly modifiedAt: string | null;
  readonly git: { readonly status: 'committed'; readonly hash: string; readonly committedAt: string; readonly subject: string }
    | { readonly status: 'not-repository' | 'unavailable' | 'no-history' };
}
