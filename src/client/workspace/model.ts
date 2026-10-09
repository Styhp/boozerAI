import type { DependencyGraph, FileNode, FilePath } from '../../shared/contracts';
import { targetId, type GraphData } from '../graph/engine';

// Pure display rules for the workspace shell (SPEC §4, §7.1, §8). Counts come only from
// parser output; nothing here guesses roles or fills a gap.

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Every coverage gap that makes the analysis "possibly incomplete", the same reasons the
// summary counts, so the status bar never reads "0 gaps" while something was missed.
export function gapCount(graph: DependencyGraph): number {
  const { files, imports, unsupported } = graph.coverage;
  return files.skipped + files.prunedDirectories.length + imports.excluded + imports.failed + unsupported.length;
}

// Tree flag "N gap": imports in each file that Boozer excluded or couldn't follow.
export function fileGapCounts(graph: DependencyGraph): ReadonlyMap<FilePath, number> {
  const fromById = new Map(graph.edges.map((edge) => [edge.id, edge.from]));
  const counts = new Map<FilePath, number>();
  for (const issue of graph.coverage.imports.issues) {
    const from = fromById.get(issue.edgeId);
    if (from !== undefined) counts.set(from, (counts.get(from) ?? 0) + 1);
  }
  return counts;
}

// Distinct files, not import statements: two imports of one file still count as one.
export function fileLinks(graph: DependencyGraph, path: FilePath): { uses: number; usedBy: number } {
  const uses = new Set<FilePath>();
  const usedBy = new Set<FilePath>();
  for (const edge of graph.edges) {
    if (edge.target.type !== 'file') continue;
    if (edge.from === path) uses.add(edge.target.path);
    if (edge.target.path === path) usedBy.add(edge.from);
  }
  return { uses: uses.size, usedBy: usedBy.size };
}

// Dots the graph would draw: files, distinct packages and one ring per import not followed.
export function graphNodeCount(graph: GraphData): number {
  return new Set([...graph.files.map((file) => file.path), ...graph.edges.map(targetId)]).size;
}

// Narrow only the drawing. Preserve parser objects, and keep both endpoints of file links.
export function filterGraph(graph: GraphData, query: string): GraphData {
  if (query.trim() === '') return graph;
  const files = graph.files.filter((file) => matchesSearch(file.path, query));
  const shown = new Set(files.map((file) => file.path));
  const edges = graph.edges.filter((edge) => shown.has(edge.from)
    && (edge.target.type !== 'file' || shown.has(edge.target.path)));
  return { files, edges };
}

export interface TreeFolder {
  readonly name: string;
  readonly path: string;
  readonly folders: readonly TreeFolder[];
  readonly files: readonly FileNode[];
}

// Folders sorted by name, then the folder's files in graph order.
export function buildTree(files: readonly FileNode[]): TreeFolder {
  interface Draft { name: string; path: string; folders: Map<string, Draft>; files: FileNode[] }
  const root: Draft = { name: '', path: '', folders: new Map(), files: [] };
  for (const file of files) {
    let node = root;
    for (const part of file.path.split('/').slice(0, -1)) {
      let next = node.folders.get(part);
      if (next === undefined) {
        next = { name: part, path: node.path === '' ? part : `${node.path}/${part}`, folders: new Map(), files: [] };
        node.folders.set(part, next);
      }
      node = next;
    }
    node.files.push(file);
  }
  const freeze = (d: Draft): TreeFolder => ({
    name: d.name, path: d.path, files: d.files,
    folders: [...d.folders.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).map(freeze),
  });
  return freeze(root);
}

export function folderPaths(tree: TreeFolder): string[] {
  return tree.folders.flatMap((folder) => [folder.path, ...folderPaths(folder)]);
}

// Search matches any part of the path, ignoring case (SPEC §8).
export const matchesSearch = (path: FilePath, query: string) => path.toLowerCase().includes(query.trim().toLowerCase());

export const fileName = (path: FilePath) => path.slice(path.lastIndexOf('/') + 1);

// "Thu 9 Oct, 15:20" (COPY.md graph header).
export function formatReadTime(date: Date): string {
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  return `${day}, ${time}`;
}
