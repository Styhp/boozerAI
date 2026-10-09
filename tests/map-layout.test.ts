import { describe, expect, it } from 'vitest';
import { COLUMN_PITCH, NODE_CAP, NODE_HEIGHT, NODE_WIDTH, ROW_PITCH, layoutMap } from '../src/client/map/layout.js';
import type { DependencyGraph, FileNode } from '../src/shared/contracts.js';
import { loadExpectedGraph } from './support/fixture-snapshot.js';

const graph = loadExpectedGraph();

// Hand-derived from the fixture's file edges (C4: SCC condensation, longest-predecessor
// rank, rows by smallest component path, terminals after files ordered by ID).
const expectedPositions: Record<string, [rank: number, row: number]> = {
  'file:broken.ts': [0, 0], 'file:legacy.cjs': [0, 1], 'file:main.ts': [0, 2],
  'file:report.ts': [1, 0], 'file:tripwire.ts': [1, 1],
  'excluded:main.ts#2': [1, 2], 'package:node:path': [1, 3], 'unresolved:legacy.cjs#2': [1, 4],
  'file:config.ts': [2, 0], 'file:export-csv.ts': [2, 1], 'file:format.ts': [2, 2],
  'file:inventory.ts': [2, 3], 'file:pricing.ts': [2, 4], 'file:utils/index.ts': [2, 5],
  'unresolved:report.ts#5': [2, 6], 'unresolved:report.ts#8': [2, 7],
  'file:utils/math.ts': [3, 0], 'file:utils/text.ts': [3, 1], 'package:zod': [3, 2],
};

const syntheticFiles = (count: number, prefix = 'f'): FileNode[] => Array.from({ length: count }, (_, i) => ({
  path: `${prefix}/${String(i).padStart(4, '0')}.ts`, language: 'ts', sizeBytes: 1, contentHash: 'x', parse: { status: 'ok' },
}));
const withFiles = (files: FileNode[], edges: DependencyGraph['edges'] = []): DependencyGraph => ({ ...graph, files, edges });

describe('C4 layout on the fixture graph', () => {
  const layout = layoutMap(graph);

  it('renders every file and terminal at its hand-derived position', () => {
    expect(layout.mode).toBe('canvas');
    expect(Object.fromEntries(layout.nodes.map((n) => [n.id, [n.x / COLUMN_PITCH, n.y / ROW_PITCH]]))).toEqual(expectedPositions);
  });

  it('counts match the graph JSON', () => {
    expect(layout.counts).toEqual({
      indexedFiles: 13, indexedEdges: 22, displayedFiles: 13, displayedEdges: 22, renderedNodes: 19, omittedFiles: 0, omittedEdges: 0,
    });
  });

  it('keeps every parser edge by ID, including both directions of the cycle, and adds none', () => {
    expect(layout.edges.map((e) => e.id)).toEqual(graph.edges.map((e) => e.id));
    expect(layout.edges.find((e) => e.id === 'inventory.ts#1')).toMatchObject({ source: 'file:inventory.ts', target: 'file:pricing.ts' });
    expect(layout.edges.find((e) => e.id === 'pricing.ts#1')).toMatchObject({ source: 'file:pricing.ts', target: 'file:inventory.ts' });
    expect(layout.edges.find((e) => e.id === 'main.ts#4')?.kind).toBe('type-import');
  });

  it('gives initial boxes that never overlap', () => {
    expect(NODE_WIDTH).toBeLessThan(COLUMN_PITCH);
    expect(NODE_HEIGHT).toBeLessThan(ROW_PITCH);
    const cells = layout.nodes.map((n) => `${n.x},${n.y}`);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it('is repeatable under input permutation', () => {
    const shuffled = { ...graph, files: [...graph.files].reverse(), edges: [...graph.edges].reverse() };
    const again = layoutMap(shuffled);
    expect(again.nodes).toEqual(layout.nodes);
    expect([...again.edges].sort((a, b) => a.id.localeCompare(b.id))).toEqual([...layout.edges].sort((a, b) => a.id.localeCompare(b.id)));
  });
});

describe('C4 filters, caps and edge cases', () => {
  it('a folder filter shows only edges whose endpoints are displayed and counts what it hides', () => {
    const layout = layoutMap(graph, 'utils/');
    expect(layout.mode).toBe('canvas');
    expect(layout.nodes.map((n) => n.id)).toEqual(['file:utils/index.ts', 'file:utils/math.ts', 'file:utils/text.ts']);
    expect(layout.edges.map((e) => e.id)).toEqual(['utils/index.ts#1', 'utils/index.ts#2']);
    expect(layout.counts).toMatchObject({ displayedFiles: 3, omittedFiles: 10, displayedEdges: 2, omittedEdges: 20 });
  });

  it('handles an empty graph and a filter that matches nothing', () => {
    expect(layoutMap(withFiles([])).mode).toBe('empty');
    expect(layoutMap(graph, 'nothing/').mode).toBe('empty');
  });

  it('draws 300 nodes but switches to list-first at 301', () => {
    expect(layoutMap(withFiles(syntheticFiles(NODE_CAP))).mode).toBe('canvas');
    const over = layoutMap(withFiles(syntheticFiles(NODE_CAP + 1)));
    expect(over.mode).toBe('list-first');
    expect(over.nodes).toEqual([]);
    expect(over.counts.renderedNodes).toBe(301);
  });

  it('opens a filtered canvas only when the whole filtered set fits', () => {
    const files = [...syntheticFiles(NODE_CAP + 1, 'a'), ...syntheticFiles(5, 'b')];
    expect(layoutMap(withFiles(files), 'a/').mode).toBe('filter-too-large');
    const narrow = layoutMap(withFiles(files), 'b/');
    expect(narrow.mode).toBe('canvas');
    expect(narrow.counts).toMatchObject({ displayedFiles: 5, omittedFiles: 301 });
  });

  it('places a 300-file cycle in one rank without recursion', () => {
    const files = syntheticFiles(NODE_CAP);
    const edges = files.map((file, i) => ({
      id: `${file.path}#1`, from: file.path, specifier: 'next', kind: 'import' as const,
      target: { type: 'file' as const, path: files[(i + 1) % files.length]!.path },
      evidence: { snapshotId: 's', file: file.path, startLine: 1, endLine: 1, contentHash: 'x' },
    }));
    const layout = layoutMap(withFiles(files, edges));
    expect(new Set(layout.nodes.map((n) => n.rank))).toEqual(new Set([0]));
    expect(layout.nodes.map((n) => n.y)).toEqual(files.map((_, i) => i * ROW_PITCH));
  });
});
