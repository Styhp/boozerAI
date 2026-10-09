// C1 v1: serializable, readonly contracts. Paths are root-relative POSIX paths.
export type FilePath = string;
export type Language = 'js' | 'jsx' | 'ts' | 'tsx' | 'mjs' | 'cjs';

export interface EvidenceRef {
  readonly snapshotId: string;
  readonly file: FilePath;
  readonly startLine: number;
  readonly endLine: number;
  readonly contentHash: string;
}

export type FileSkipReason =
  | 'ignored' | 'secret-name' | 'unsupported-extension' | 'binary'
  | 'oversize' | 'symlink' | 'unreadable' | 'case-collision' | 'parse-error';

export interface FileSkip {
  readonly path: FilePath;
  readonly reason: FileSkipReason;
}

export interface SnapshotFile {
  readonly path: FilePath;
  readonly language: Language;
  readonly sizeBytes: number;
  readonly contentHash: string;
  readonly text: string;
}

export interface SnapshotLimits {
  readonly maxFiles: number;
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
}

// Source text is server-side only; DependencyGraph is the browser-safe projection.
export interface WorkspaceSnapshot {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly snapshotId: string;
  readonly files: readonly SnapshotFile[];
  readonly inventory: {
    readonly found: number;
    readonly skipped: readonly FileSkip[];
    readonly prunedDirectories: readonly { readonly path: FilePath; readonly reason: 'ignored' }[];
  };
  readonly limits: SnapshotLimits;
  readonly createdAt: string;
}

export interface FileNode {
  readonly path: FilePath;
  readonly language: Language;
  readonly sizeBytes: number;
  readonly contentHash: string;
  readonly parse: { readonly status: 'ok' } | { readonly status: 'error'; readonly reason: 'parse-error' };
}

export type EdgeKind = 'import' | 'type-import' | 're-export' | 'require' | 'dynamic-import';
export type UnresolvedReason =
  | 'not-found' | 'non-literal' | 'outside-root' | 'absolute-path'
  | 'unsupported-alias' | 'ambiguous-require' | 'unsupported-syntax';
export type EdgeTarget =
  | { readonly type: 'file'; readonly path: FilePath }
  | { readonly type: 'package'; readonly name: string; readonly builtin: boolean }
  | { readonly type: 'excluded'; readonly path: FilePath; readonly reason: FileSkipReason }
  | { readonly type: 'unresolved'; readonly reason: UnresolvedReason };

export interface DependencyEdge {
  readonly id: string;
  readonly from: FilePath;
  readonly specifier: string;
  readonly kind: EdgeKind;
  readonly target: EdgeTarget;
  readonly evidence: EvidenceRef;
}

export interface AnalysisCoverage {
  readonly files: {
    readonly found: number;
    readonly parsed: number;
    readonly skipped: number;
    readonly skips: readonly FileSkip[];
    readonly prunedDirectories: readonly { readonly path: FilePath; readonly reason: 'ignored' }[];
  };
  readonly imports: {
    readonly seen: number;
    readonly resolved: number;
    readonly external: number;
    readonly excluded: number;
    readonly failed: number;
    readonly issues: readonly {
      readonly edgeId: string;
      readonly outcome: 'excluded' | 'failed';
      readonly reason: FileSkipReason | UnresolvedReason;
    }[];
  };
  readonly unsupported: readonly { readonly reason: string; readonly evidence: EvidenceRef }[];
}

export interface DependencyGraph {
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly files: readonly FileNode[];
  readonly edges: readonly DependencyEdge[];
  readonly extractor: { readonly name: string; readonly version: string };
  readonly coverage: AnalysisCoverage;
}

export interface GraphWalkQuery {
  readonly selected: FilePath;
  readonly direction: 'importers' | 'dependencies';
  readonly maxDepth: number | null;
}

export interface GraphWalkEntry {
  readonly path: FilePath;
  readonly depth: number;
  readonly chain: readonly DependencyEdge[];
  readonly includesTypeOnly: boolean;
}

export interface GraphWalkResult extends GraphWalkQuery {
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly algorithmVersion: 'bfs-v1';
  readonly reachable: readonly GraphWalkEntry[];
  readonly depthLimited: boolean;
  readonly coverage: AnalysisCoverage;
  readonly possiblyIncomplete: boolean;
}

export interface ImpactResult extends Omit<GraphWalkResult, 'direction' | 'reachable'> {
  readonly direction: 'importers';
  readonly potentiallyAffected: readonly GraphWalkEntry[];
}

export interface Snippet {
  readonly id: string;
  readonly ref: EvidenceRef;
  readonly text: string;
  readonly reason: string;
}

export interface Explanation {
  readonly text: string;
  readonly snippets: readonly Snippet[];
  readonly citations: readonly { readonly marker: string; readonly snippetId?: string; readonly valid: boolean }[];
  readonly model: { readonly runtime: string; readonly name: string; readonly location: 'local' | 'cloud' };
  readonly durationMs: number;
}
