import { describe, expect, it } from 'vitest';
import type { DependencyGraph, GraphWalkEntry } from '../src/shared/contracts.js';
import { GraphQueryError, potentialImpact, runtimeReachable, walkGraph } from '../src/shared/graph-queries.js';
import { loadExpectedGraph } from './support/fixture-snapshot.js';

// Expected sets below were derived by hand from the fixture's file edges (see
// fixtures/basic/README.md), before running the walk. They are not generated output.

const graph = loadExpectedGraph();
const rows = (entries: readonly GraphWalkEntry[]) =>
  entries.map((e) => ({ path: e.path, depth: e.depth, chain: e.chain.map((edge) => edge.id), typeOnly: e.includesTypeOnly }));

describe('potential impact (importers) on the fixture', () => {
  it('inventory.ts at depth 1: the shortest path from main.ts is the type-only import', () => {
    const impact = potentialImpact(graph, 'inventory.ts');
    expect(impact.maxDepth).toBe(1);
    expect(rows(impact.potentiallyAffected)).toEqual([
      { path: 'main.ts', depth: 1, chain: ['main.ts#4'], typeOnly: true },
      { path: 'pricing.ts', depth: 1, chain: ['pricing.ts#1'], typeOnly: false },
      { path: 'report.ts', depth: 1, chain: ['report.ts#1'], typeOnly: false },
    ]);
    expect(impact.depthLimited).toBe(false);
  });

  it('utils/math.ts defaults to direct importers and reports the hidden files beyond depth 1', () => {
    const direct = potentialImpact(graph, 'utils/math.ts');
    expect(rows(direct.potentiallyAffected)).toEqual([
      { path: 'legacy.cjs', depth: 1, chain: ['legacy.cjs#1'], typeOnly: false },
      { path: 'utils/index.ts', depth: 1, chain: ['utils/index.ts#1'], typeOnly: false },
    ]);
    expect(direct.depthLimited).toBe(true);

    const two = potentialImpact(graph, 'utils/math.ts', 2);
    expect(two.potentiallyAffected.map((e) => e.path)).toEqual(['legacy.cjs', 'utils/index.ts', 'report.ts']);
    expect(two.depthLimited).toBe(true);

    const full = potentialImpact(graph, 'utils/math.ts', null);
    expect(rows(full.potentiallyAffected)).toEqual([
      { path: 'legacy.cjs', depth: 1, chain: ['legacy.cjs#1'], typeOnly: false },
      { path: 'utils/index.ts', depth: 1, chain: ['utils/index.ts#1'], typeOnly: false },
      { path: 'report.ts', depth: 2, chain: ['report.ts#4', 'utils/index.ts#1'], typeOnly: false },
      { path: 'main.ts', depth: 3, chain: ['main.ts#5', 'report.ts#4', 'utils/index.ts#1'], typeOnly: false },
    ]);
    expect(full.depthLimited).toBe(false);
  });

  it('pricing.ts in the two-file cycle never lists itself', () => {
    const full = potentialImpact(graph, 'pricing.ts', null);
    expect(rows(full.potentiallyAffected)).toEqual([
      { path: 'inventory.ts', depth: 1, chain: ['inventory.ts#1'], typeOnly: false },
      { path: 'main.ts', depth: 2, chain: ['main.ts#4', 'inventory.ts#1'], typeOnly: true },
      { path: 'report.ts', depth: 2, chain: ['report.ts#1', 'inventory.ts#1'], typeOnly: false },
    ]);
  });

  it('an entry point has no importers, and the result still carries coverage limits', () => {
    const impact = potentialImpact(graph, 'main.ts', null);
    expect(impact.potentiallyAffected).toEqual([]);
    expect(impact.depthLimited).toBe(false);
    expect(impact.possiblyIncomplete).toBe(true);
    expect(impact.coverage).toBe(graph.coverage);
    expect(impact).toMatchObject({ schemaVersion: 1, algorithmVersion: 'bfs-v1', direction: 'importers', snapshotId: graph.snapshotId });
  });
});

describe('runtime reachability for type-only labels (C10)', () => {
  it('finds main.ts reaches inventory.ts at runtime even though its shortest chain is the type import', () => {
    expect([...runtimeReachable(graph, 'inventory.ts', 'importers')].sort()).toEqual(['main.ts', 'pricing.ts', 'report.ts']);
    const onlyTypes = { ...graph, edges: graph.edges.filter((edge) => edge.id === 'main.ts#4') };
    expect(runtimeReachable(onlyTypes, 'inventory.ts', 'importers').size).toBe(0);
    expect(potentialImpact(onlyTypes, 'inventory.ts').potentiallyAffected[0]).toMatchObject({ path: 'main.ts', includesTypeOnly: true });
  });
});

describe('the same walk for dependencies', () => {
  it('main.ts reaches ten local files, chains running from the selection', () => {
    const walk = walkGraph(graph, { selected: 'main.ts', direction: 'dependencies', maxDepth: null });
    expect(rows(walk.reachable)).toEqual([
      { path: 'config.ts', depth: 1, chain: ['main.ts#3'], typeOnly: false },
      { path: 'inventory.ts', depth: 1, chain: ['main.ts#4'], typeOnly: true },
      { path: 'report.ts', depth: 1, chain: ['main.ts#5'], typeOnly: false },
      { path: 'tripwire.ts', depth: 1, chain: ['main.ts#1'], typeOnly: false },
      { path: 'export-csv.ts', depth: 2, chain: ['main.ts#5', 'report.ts#7'], typeOnly: false },
      { path: 'format.ts', depth: 2, chain: ['main.ts#5', 'report.ts#3'], typeOnly: false },
      { path: 'pricing.ts', depth: 2, chain: ['main.ts#4', 'inventory.ts#1'], typeOnly: true },
      { path: 'utils/index.ts', depth: 2, chain: ['main.ts#5', 'report.ts#4'], typeOnly: false },
      { path: 'utils/math.ts', depth: 3, chain: ['main.ts#5', 'report.ts#4', 'utils/index.ts#1'], typeOnly: false },
      { path: 'utils/text.ts', depth: 3, chain: ['main.ts#5', 'report.ts#4', 'utils/index.ts#2'], typeOnly: false },
    ]);
  });
});

describe('walk invariants and invalid queries', () => {
  it('depth equals chain length and every chain edge is an unchanged graph edge', () => {
    for (const file of graph.files) {
      for (const direction of ['importers', 'dependencies'] as const) {
        for (const entry of walkGraph(graph, { selected: file.path, direction, maxDepth: null }).reachable) {
          expect(entry.depth).toBe(entry.chain.length);
          for (const edge of entry.chain) expect(graph.edges).toContain(edge);
        }
      }
    }
  });

  it('never modifies the graph', () => {
    const before = JSON.stringify(graph);
    for (const file of graph.files) potentialImpact(graph, file.path, null);
    expect(JSON.stringify(graph)).toBe(before);
  });

  it('handles a one-file graph and rejects bad selections, depths and directions', () => {
    const single: DependencyGraph = { ...graph, files: [graph.files[0]!], edges: [] };
    expect(potentialImpact(single, graph.files[0]!.path).potentiallyAffected).toEqual([]);
    const empty: DependencyGraph = { ...graph, files: [], edges: [] };
    expect(() => potentialImpact(empty, 'main.ts')).toThrow(GraphQueryError);
    expect(() => potentialImpact(graph, 'missing.ts')).toThrow('not in this graph');
    for (const depth of [0, -1, 1.5, Number.NaN]) expect(() => potentialImpact(graph, 'main.ts', depth)).toThrow('positive integer');
    expect(() => walkGraph(graph, { selected: 'main.ts', direction: 'sideways' as never, maxDepth: 1 })).toThrow('direction');
  });

  it('walks a long cycle iteratively', () => {
    const files = Array.from({ length: 5_000 }, (_, i) => ({ ...graph.files[0]!, path: `n${i}.ts` }));
    const edges = files.map((f, i) => ({
      ...graph.edges[0]!, id: `${f.path}#1`, from: f.path, target: { type: 'file' as const, path: files[(i + 1) % files.length]!.path },
    }));
    const result = potentialImpact({ ...graph, files, edges }, 'n0.ts', null);
    expect(result.potentiallyAffected).toHaveLength(4_999);
    expect(result.potentiallyAffected.at(-1)).toMatchObject({ path: 'n1.ts', depth: 4_999 });
  });
});
