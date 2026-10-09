import type {
  DependencyEdge, DependencyGraph, FilePath, GraphWalkEntry, GraphWalkQuery, GraphWalkResult, ImpactResult,
} from './contracts.js';

// GraphQueries (ARCHITECTURE.md "Impact semantics — C1 v1"). Pure functions over an
// immutable graph; they never modify it. Imports only contract types, so the browser
// bundle can use them without the parser.

export class GraphQueryError extends Error {
  constructor(readonly code: 'invalid-selection' | 'invalid-depth' | 'invalid-direction', message: string) {
    super(message);
  }
}

const bytewise = (a: string, b: string): number => {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    if (left[i] !== right[i]) return left[i]! - right[i]!;
  }
  return left.length - right.length;
};

export function possiblyIncomplete(graph: DependencyGraph): boolean {
  const { files, imports, unsupported } = graph.coverage;
  return files.skipped > 0 || files.prunedDirectories.length > 0 ||
    imports.excluded > 0 || imports.failed > 0 || unsupported.length > 0;
}

// One iterative breadth-first walk for both directions. Only `file` targets are traversed;
// package, excluded and unresolved targets stay in coverage.
export function walkGraph(graph: DependencyGraph, query: GraphWalkQuery): GraphWalkResult {
  const { selected, direction, maxDepth } = query;
  if (direction !== 'importers' && direction !== 'dependencies') {
    throw new GraphQueryError('invalid-direction', `Unknown walk direction: ${String(direction)}`);
  }
  if (maxDepth !== null && !(Number.isInteger(maxDepth) && maxDepth > 0)) {
    throw new GraphQueryError('invalid-depth', 'maxDepth must be a positive integer or null');
  }
  if (!graph.files.some((file) => file.path === selected)) {
    throw new GraphQueryError('invalid-selection', 'The selected file is not in this graph');
  }

  // Next hops per file: importers follow file edges in reverse, dependencies forward.
  const hops = new Map<FilePath, { edge: DependencyEdge; next: FilePath }[]>();
  for (const edge of graph.edges) {
    if (edge.target.type !== 'file') continue;
    const [at, next] = direction === 'importers' ? [edge.target.path, edge.from] : [edge.from, edge.target.path];
    if (!hops.has(at)) hops.set(at, []);
    hops.get(at)!.push({ edge, next });
  }

  // The selection is visited from the start, so cycles never return it as a result.
  const chains = new Map<FilePath, readonly DependencyEdge[]>([[selected, []]]);
  const reachable: GraphWalkEntry[] = [];
  let frontier: FilePath[] = [selected];
  let depth = 0;
  let depthLimited = false;
  while (frontier.length > 0) {
    // Equal-length paths: the lowest edge ID (bytewise) at this frontier claims each file.
    const candidates = frontier
      .flatMap((at) => (hops.get(at) ?? []).map((hop) => ({ ...hop, parent: at })))
      .filter((c) => !chains.has(c.next))
      .sort((a, b) => bytewise(a.edge.id, b.edge.id));
    if (candidates.length === 0) break;
    if (maxDepth !== null && depth === maxDepth) { depthLimited = true; break; }
    depth += 1;
    const nextFrontier: FilePath[] = [];
    for (const { edge, next, parent } of candidates) {
      if (chains.has(next)) continue;
      const parentChain = chains.get(parent)!;
      // Importer chains run from the affected file to the selection; dependency chains
      // run from the selection to the dependency. Both keep original import direction.
      const chain = direction === 'importers' ? [edge, ...parentChain] : [...parentChain, edge];
      chains.set(next, chain);
      nextFrontier.push(next);
      reachable.push({ path: next, depth, chain, includesTypeOnly: chain.some((e) => e.kind === 'type-import') });
    }
    frontier = nextFrontier;
  }

  reachable.sort((a, b) => a.depth - b.depth || bytewise(a.path, b.path));
  return {
    schemaVersion: 1,
    snapshotId: graph.snapshotId,
    algorithmVersion: 'bfs-v1',
    selected,
    direction,
    maxDepth,
    reachable,
    depthLimited,
    coverage: graph.coverage,
    possiblyIncomplete: possiblyIncomplete(graph),
  };
}

export function potentialImpact(graph: DependencyGraph, selected: FilePath, maxDepth: number | null = 1): ImpactResult {
  const { reachable, ...walk } = walkGraph(graph, { selected, direction: 'importers', maxDepth });
  return { ...walk, direction: 'importers', potentiallyAffected: reachable };
}
