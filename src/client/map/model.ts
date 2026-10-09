import type { DependencyEdge, DependencyGraph, EvidenceRef, FileNode, FilePath } from '../../shared/contracts';

// Display rules for counts, targets and evidence. Pure functions over C1 data.

export type Selection =
  | { readonly kind: 'file'; readonly path: FilePath }
  | { readonly kind: 'edge'; readonly id: string }
  | { readonly kind: 'terminal'; readonly nodeId: string };

export interface LoadedSource {
  readonly snapshotId: string;
  readonly path: FilePath;
  readonly contentHash: string;
  readonly text: string;
}

export type SourceState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly path: FilePath }
  | { readonly status: 'loaded'; readonly source: LoadedSource }
  | { readonly status: 'failed'; readonly path: FilePath; readonly message: string };

// A zero denominator has no rate: "No files examined" is never shown as 100%.
export const rate = (part: number, whole: number): number | null => (whole === 0 ? null : part / whole);

export const formatRate = (value: number | null, empty: string) =>
  value === null ? empty : `${Math.round(value * 100)}%`;

function countBy<T>(items: readonly T[], key: (item: T) => string): string {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts].map(([name, n]) => `${n} ${name}`).join(', ');
}

export function coverageSummary(graph: DependencyGraph) {
  const { files, imports, unsupported } = graph.coverage;
  const limitations: string[] = [];
  if (files.skipped > 0) limitations.push(`${files.skipped} of ${files.found} files skipped (${countBy(files.skips, (s) => s.reason)})`);
  if (files.prunedDirectories.length > 0) limitations.push(`${files.prunedDirectories.length} ignored directories not examined`);
  if (imports.failed > 0) {
    const failed = imports.issues.filter((i) => i.outcome === 'failed');
    limitations.push(`${imports.failed} imports unresolved (${countBy(failed, (i) => i.reason)})`);
  }
  if (imports.excluded > 0) limitations.push(`${imports.excluded} imports point at excluded files`);
  if (unsupported.length > 0) limitations.push(`${unsupported.length} unsupported patterns found`);
  return {
    files,
    imports,
    parsedRate: rate(files.parsed, files.found),
    resolutionRate: rate(imports.resolved, imports.seen),
    possiblyIncomplete: limitations.length > 0,
    limitations,
  };
}

export function describeTarget(edge: DependencyEdge): { label: string; reason: string | null } {
  const { target } = edge;
  switch (target.type) {
    case 'file': return { label: target.path, reason: null };
    case 'package': return { label: target.name, reason: target.builtin ? 'built-in package' : 'external package' };
    case 'excluded': return { label: target.path, reason: `excluded: ${target.reason}` };
    case 'unresolved': return { label: edge.specifier, reason: `unresolved: ${target.reason}` };
  }
}

export const findFile = (graph: DependencyGraph, path: FilePath): FileNode | undefined =>
  graph.files.find((file) => file.path === path);

export const findEdge = (graph: DependencyGraph, id: string): DependencyEdge | undefined =>
  graph.edges.find((edge) => edge.id === id);

// Lines exactly as stored; a final newline does not create an extra empty line.
export function sourceLines(text: string): string[] {
  const lines = text.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// Highlight evidence only when it provably belongs to the loaded text. Otherwise the
// reference is stale and no lines are highlighted: absent beats approximate.
export function referenceState(evidence: EvidenceRef, source: LoadedSource): 'current' | 'stale' {
  const lineCount = sourceLines(source.text).length;
  return evidence.snapshotId === source.snapshotId &&
    evidence.file === source.path &&
    evidence.contentHash === source.contentHash &&
    evidence.startLine >= 1 && evidence.endLine >= evidence.startLine && evidence.endLine <= lineCount
    ? 'current' : 'stale';
}

// Which file the detail pane should load for a selection.
export function selectedPath(graph: DependencyGraph, selection: Selection | null): FilePath | null {
  if (selection === null) return null;
  if (selection.kind === 'file') return selection.path;
  if (selection.kind === 'edge') return findEdge(graph, selection.id)?.from ?? null;
  return null;
}
