import type { DependencyEdge, DependencyGraph, EdgeKind, FilePath } from '../../shared/contracts';

// C4 map layout (ARCHITECTURE.md "Map layout — C4"). Pure: takes the graph and a display
// filter and returns positions only. It never adds, removes or changes graph edges.

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 72;
export const COLUMN_PITCH = 320;
export const ROW_PITCH = 112;
export const NODE_CAP = 300;

export type MapNodeKind = 'file' | 'package' | 'excluded' | 'unresolved';

export interface MapNode {
  readonly id: string;
  readonly kind: MapNodeKind;
  readonly label: string;
  readonly detail: string;
  readonly x: number;
  readonly y: number;
  readonly rank: number;
  readonly path?: FilePath;
  readonly edgeId?: string;
  readonly parseError?: boolean;
}

export interface MapEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly kind: EdgeKind;
}

export type MapMode = 'canvas' | 'empty' | 'list-first' | 'filter-too-large';

export interface MapLayout {
  readonly mode: MapMode;
  readonly filter: string | null;
  readonly nodes: readonly MapNode[];
  readonly edges: readonly MapEdge[];
  readonly counts: {
    readonly indexedFiles: number;
    readonly indexedEdges: number;
    readonly displayedFiles: number;
    readonly displayedEdges: number;
    readonly renderedNodes: number;
    readonly omittedFiles: number;
    readonly omittedEdges: number;
  };
}

export const bytewise = (a: string, b: string): number => {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    if (left[i] !== right[i]) return left[i]! - right[i]!;
  }
  return left.length - right.length;
};

export const fileNodeId = (path: FilePath) => `file:${path}`;

export function terminalNodeId(edge: DependencyEdge): string | null {
  switch (edge.target.type) {
    case 'package': return `package:${edge.target.name}`;
    case 'excluded': return `excluded:${edge.id}`;
    case 'unresolved': return `unresolved:${edge.id}`;
    case 'file': return null;
  }
}

function terminalNode(edge: DependencyEdge, id: string): Omit<MapNode, 'x' | 'y' | 'rank'> {
  const { target } = edge;
  if (target.type === 'package') {
    return { id, kind: 'package', label: target.name, detail: target.builtin ? 'built-in package' : 'external package' };
  }
  if (target.type === 'excluded') {
    return { id, kind: 'excluded', label: edge.specifier, detail: `excluded: ${target.reason}`, edgeId: edge.id };
  }
  const reason = target.type === 'unresolved' ? target.reason : 'unknown';
  return { id, kind: 'unresolved', label: edge.specifier, detail: `unresolved: ${reason}`, edgeId: edge.id };
}

export function matchesFilter(path: FilePath, filter: string | null): boolean {
  return filter === null || filter === '' || path.startsWith(filter);
}

// Iterative Kosaraju: no recursion, so deep or cyclic graphs never exhaust the call stack.
function stronglyConnected(nodes: readonly string[], forward: ReadonlyMap<string, readonly string[]>): Map<string, number> {
  const reverse = new Map<string, string[]>(nodes.map((n) => [n, []]));
  for (const [from, targets] of forward) for (const to of targets) reverse.get(to)!.push(from);
  for (const list of reverse.values()) list.sort(bytewise);

  const order: string[] = [];
  const visited = new Set<string>();
  for (const start of nodes) {
    if (visited.has(start)) continue;
    visited.add(start);
    const stack: { node: string; next: number }[] = [{ node: start, next: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const targets = forward.get(frame.node)!;
      if (frame.next < targets.length) {
        const to = targets[frame.next++]!;
        if (!visited.has(to)) { visited.add(to); stack.push({ node: to, next: 0 }); }
      } else {
        order.push(frame.node);
        stack.pop();
      }
    }
  }

  const component = new Map<string, number>();
  let count = 0;
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const start = order[i]!;
    if (component.has(start)) continue;
    const stack = [start];
    component.set(start, count);
    while (stack.length > 0) {
      for (const from of reverse.get(stack.pop()!)!) {
        if (!component.has(from)) { component.set(from, count); stack.push(from); }
      }
    }
    count += 1;
  }
  return component;
}

export function layoutMap(graph: DependencyGraph, filter: string | null = null): MapLayout {
  const activeFilter = filter === '' ? null : filter;
  const files = graph.files.filter((f) => matchesFilter(f.path, activeFilter)).sort((a, b) => bytewise(a.path, b.path));
  const shown = new Set(files.map((f) => f.path));
  const edges = graph.edges.filter((e) => shown.has(e.from) && (e.target.type !== 'file' || shown.has(e.target.path)));

  const terminals = new Map<string, Omit<MapNode, 'x' | 'y' | 'rank'>>();
  for (const edge of edges) {
    const id = terminalNodeId(edge);
    if (id !== null && !terminals.has(id)) terminals.set(id, terminalNode(edge, id));
  }
  const renderedNodes = files.length + terminals.size;
  const counts = {
    indexedFiles: graph.files.length,
    indexedEdges: graph.edges.length,
    displayedFiles: files.length,
    displayedEdges: edges.length,
    renderedNodes,
    omittedFiles: graph.files.length - files.length,
    omittedEdges: graph.edges.length - edges.length,
  };
  const empty = { filter: activeFilter, nodes: [], edges: [], counts };
  if (renderedNodes > NODE_CAP) return { mode: activeFilter === null ? 'list-first' : 'filter-too-large', ...empty };
  if (renderedNodes === 0) return { mode: 'empty', ...empty };

  // File-to-file adjacency, importer → dependency, de-duplicated and sorted for determinism.
  const paths = files.map((f) => f.path);
  const forward = new Map<string, string[]>(paths.map((p) => [p, []]));
  for (const edge of edges) {
    if (edge.target.type !== 'file') continue;
    const list = forward.get(edge.from)!;
    if (!list.includes(edge.target.path)) list.push(edge.target.path);
  }
  for (const list of forward.values()) list.sort(bytewise);

  const component = stronglyConnected(paths, forward);
  const members = new Map<number, string[]>();
  for (const path of paths) {
    const c = component.get(path)!;
    if (!members.has(c)) members.set(c, []);
    members.get(c)!.push(path);
  }

  // Longest-predecessor rank over the condensed DAG, in Kahn topological order.
  const successors = new Map<number, Set<number>>([...members.keys()].map((c) => [c, new Set()]));
  const indegree = new Map<number, number>([...members.keys()].map((c) => [c, 0]));
  for (const [from, targets] of forward) {
    for (const to of targets) {
      const a = component.get(from)!;
      const b = component.get(to)!;
      if (a !== b && !successors.get(a)!.has(b)) {
        successors.get(a)!.add(b);
        indegree.set(b, indegree.get(b)! + 1);
      }
    }
  }
  const rank = new Map<number, number>();
  const queue = [...members.keys()].filter((c) => indegree.get(c) === 0);
  for (const c of queue) rank.set(c, 0);
  while (queue.length > 0) {
    const c = queue.shift()!;
    for (const next of successors.get(c)!) {
      rank.set(next, Math.max(rank.get(next) ?? 0, rank.get(c)! + 1));
      indegree.set(next, indegree.get(next)! - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }

  const nodes: MapNode[] = [];
  const rowsUsed = new Map<number, number>();
  const place = (r: number) => {
    const row = rowsUsed.get(r) ?? 0;
    rowsUsed.set(r, row + 1);
    return { rank: r, x: r * COLUMN_PITCH, y: row * ROW_PITCH };
  };
  const byFile = new Map(files.map((f) => [f.path, f]));
  const components = [...members.entries()]
    .map(([c, list]) => ({ rank: rank.get(c)!, list: list.sort(bytewise) }))
    .sort((a, b) => a.rank - b.rank || bytewise(a.list[0]!, b.list[0]!));
  const fileRank = new Map<string, number>();
  for (const { rank: r, list } of components) {
    for (const path of list) {
      fileRank.set(path, r);
      nodes.push({
        id: fileNodeId(path), kind: 'file', label: path, path,
        detail: byFile.get(path)!.parse.status === 'error' ? 'parse error' : byFile.get(path)!.language,
        parseError: byFile.get(path)!.parse.status === 'error',
        ...place(r),
      });
    }
  }

  // Terminals sit one rank after their deepest displayed importer, after file components, by ID.
  const terminalRank = new Map<string, number>();
  for (const edge of edges) {
    const id = terminalNodeId(edge);
    if (id !== null) terminalRank.set(id, Math.max(terminalRank.get(id) ?? 0, fileRank.get(edge.from)! + 1));
  }
  const orderedTerminals = [...terminals.values()]
    .sort((a, b) => terminalRank.get(a.id)! - terminalRank.get(b.id)! || bytewise(a.id, b.id));
  for (const terminal of orderedTerminals) nodes.push({ ...terminal, ...place(terminalRank.get(terminal.id)!) });

  const mapEdges = edges.map((edge) => ({
    id: edge.id,
    source: fileNodeId(edge.from),
    target: terminalNodeId(edge) ?? fileNodeId((edge.target as { path: FilePath }).path),
    kind: edge.kind,
  }));
  return { mode: 'canvas', filter: activeFilter, nodes, edges: mapEdges, counts };
}
