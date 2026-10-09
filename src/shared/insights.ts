import type { AnalysisCoverage, DependencyEdge, DependencyGraph, FilePath } from './contracts.js';
import { possiblyIncomplete } from './graph-queries.js';

export interface ImportedFile {
  readonly path: FilePath;
  readonly importerCount: number;
  readonly importers: readonly FilePath[];
}

export interface ImportCycleGroup {
  readonly files: readonly FilePath[];
  readonly edges: readonly DependencyEdge[];
}

export interface GraphInsights {
  readonly snapshotId: string;
  readonly algorithmVersion: 'insights-v1';
  readonly readingStarts: readonly FilePath[];
  readonly mostImported: readonly ImportedFile[];
  readonly cycles: readonly ImportCycleGroup[];
  readonly coverage: AnalysisCoverage;
  readonly possiblyIncomplete: boolean;
}

const encoder = new TextEncoder();
const bytewise = (a: string, b: string): number => {
  const left = encoder.encode(a), right = encoder.encode(b);
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    if (left[i] !== right[i]) return left[i]! - right[i]!;
  }
  return left.length - right.length;
};

interface FileIndex {
  readonly paths: readonly FilePath[];
  readonly outgoing: ReadonlyMap<FilePath, readonly FilePath[]>;
  readonly incoming: ReadonlyMap<FilePath, readonly FilePath[]>;
  readonly edges: readonly DependencyEdge[];
}

function indexFiles(graph: DependencyGraph): FileIndex {
  const paths = graph.files.map((file) => file.path).sort(bytewise);
  if (new Set(paths).size !== paths.length) throw new Error('The graph contains duplicate files.');
  const outgoing = new Map(paths.map((path) => [path, new Set<FilePath>()]));
  const incoming = new Map(paths.map((path) => [path, new Set<FilePath>()]));
  const edges: DependencyEdge[] = [];
  for (const edge of graph.edges) {
    if (!outgoing.has(edge.from)) throw new Error('An importer is outside this graph.');
    if (edge.target.type !== 'file') continue;
    if (!incoming.has(edge.target.path)) throw new Error('An imported file is outside this graph.');
    // Parallel statements, including value plus type imports, contribute one importer.
    outgoing.get(edge.from)!.add(edge.target.path);
    incoming.get(edge.target.path)!.add(edge.from);
    edges.push(edge);
  }
  const sorted = (map: Map<FilePath, Set<FilePath>>) => new Map([...map].map(([path, next]) => [path, [...next].sort(bytewise)]));
  return { paths, outgoing: sorted(outgoing), incoming: sorted(incoming), edges };
}

function rankImports(index: FileIndex): ImportedFile[] {
  return index.paths.map((path) => ({ path, importerCount: index.incoming.get(path)!.length, importers: index.incoming.get(path)! }))
    .filter((file) => file.importerCount > 0)
    .sort((a, b) => b.importerCount - a.importerCount || bytewise(a.path, b.path));
}

// Iterative Kosaraju passes: neither a long chain nor a large SCC uses the call stack.
// These are groups of mutually reachable files, not invented simple-cycle paths.
function cycleGroups(index: FileIndex): ImportCycleGroup[] {
  const seen = new Set<FilePath>();
  const finished: FilePath[] = [];
  for (const start of index.paths) {
    if (seen.has(start)) continue;
    seen.add(start);
    const stack = [{ path: start, next: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const neighbours = index.outgoing.get(frame.path)!;
      if (frame.next < neighbours.length) {
        const next = neighbours[frame.next++]!;
        if (!seen.has(next)) { seen.add(next); stack.push({ path: next, next: 0 }); }
      } else { finished.push(frame.path); stack.pop(); }
    }
  }

  seen.clear();
  const groups: { files: FilePath[]; edges: DependencyEdge[] }[] = [];
  for (let i = finished.length - 1; i >= 0; i -= 1) {
    const start = finished[i]!;
    if (seen.has(start)) continue;
    const files: FilePath[] = [], stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const path = stack.pop()!;
      files.push(path);
      for (const next of index.incoming.get(path)!) {
        if (!seen.has(next)) { seen.add(next); stack.push(next); }
      }
    }
    if (files.length > 1 || index.outgoing.get(start)!.includes(start)) groups.push({ files: files.sort(bytewise), edges: [] });
  }
  groups.sort((a, b) => bytewise(a.files[0]!, b.files[0]!));
  const membership = new Map(groups.flatMap((group, i) => group.files.map((path) => [path, i] as const)));
  for (const edge of index.edges) {
    const group = membership.get(edge.from);
    if (group !== undefined && edge.target.type === 'file' && membership.get(edge.target.path) === group) groups[group]!.edges.push(edge);
  }
  for (const group of groups) group.edges.sort((a, b) => bytewise(a.id, b.id));
  return groups;
}

// Full parser graph only. Type and self imports count; non-file targets remain in coverage.
// A zero known importer count suggests where to begin reading, never absence of use.
export function analyzeInsights(graph: DependencyGraph): GraphInsights {
  const index = indexFiles(graph);
  return {
    snapshotId: graph.snapshotId,
    algorithmVersion: 'insights-v1',
    readingStarts: index.paths.filter((path) => index.incoming.get(path)!.length === 0),
    mostImported: rankImports(index),
    cycles: cycleGroups(index),
    coverage: graph.coverage,
    possiblyIncomplete: possiblyIncomplete(graph),
  };
}
