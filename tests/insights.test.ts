import { describe, expect, it } from 'vitest';
import type { DependencyGraph } from '../src/shared/contracts';
import { analyzeInsights } from '../src/shared/insights';
import { loadExpectedGraph } from './support/fixture-snapshot';
import { insightGraph } from './support/insight-graph';

describe('full-snapshot reading insights', () => {
  it('matches hand-written fixture reading starts, importer counts and cycle evidence', () => {
    const graph = loadExpectedGraph(), result = analyzeInsights(graph);
    expect(result.readingStarts).toEqual(['broken.ts', 'legacy.cjs', 'main.ts']);
    expect(result.mostImported.map((file) => [file.path, file.importerCount])).toEqual([
      ['inventory.ts', 3], ['config.ts', 2], ['utils/math.ts', 2], ['export-csv.ts', 1], ['format.ts', 1],
      ['pricing.ts', 1], ['report.ts', 1], ['tripwire.ts', 1], ['utils/index.ts', 1], ['utils/text.ts', 1],
    ]);
    expect(result.mostImported[0]?.importers).toEqual(['main.ts', 'pricing.ts', 'report.ts']);
    expect(result.cycles.map((group) => [group.files, group.edges.map((edge) => edge.id)])).toEqual([
      [['inventory.ts', 'pricing.ts'], ['inventory.ts#1', 'pricing.ts#1', 'pricing.ts#2']],
    ]);
    expect(result.snapshotId).toBe(graph.snapshotId);
    expect(result.coverage).toBe(graph.coverage);
    expect(result.possiblyIncomplete).toBe(true);
    for (const edge of result.cycles[0]!.edges) expect(graph.edges).toContain(edge);
  });

  it('counts each direct importer once, retains type imports and includes self loops', () => {
    const graph = insightGraph(['a.ts', 'b.ts', 'self.ts'], [
      { from: 'a.ts', to: 'b.ts' }, { from: 'a.ts', to: 'b.ts', kind: 'type-import' },
      { from: 'self.ts', to: 'self.ts', kind: 'dynamic-import' },
    ]);
    const result = analyzeInsights(graph);
    expect(result.readingStarts).toEqual(['a.ts']);
    expect(result.mostImported).toEqual([
      { path: 'b.ts', importerCount: 1, importers: ['a.ts'] }, { path: 'self.ts', importerCount: 1, importers: ['self.ts'] },
    ]);
    expect(result.cycles.map((group) => group.files)).toEqual([['self.ts']]);
    const types = analyzeInsights(insightGraph(['a.ts', 'b.ts'], [{ from: 'a.ts', to: 'b.ts', kind: 'type-import' }, { from: 'b.ts', to: 'a.ts' }]));
    expect(types.cycles[0]?.files).toEqual(['a.ts', 'b.ts']);
  });

  it('keeps one-way edges between SCCs outside cycle evidence', () => {
    const graph = insightGraph(['a.ts', 'b.ts', 'c.ts', 'd.ts'], [
      { from: 'a.ts', to: 'b.ts' }, { from: 'b.ts', to: 'a.ts' }, { from: 'b.ts', to: 'c.ts' },
      { from: 'c.ts', to: 'd.ts' }, { from: 'd.ts', to: 'd.ts' },
    ]);
    expect(analyzeInsights(graph).cycles.map((group) => [group.files, group.edges.map((edge) => edge.id)])).toEqual([
      [['a.ts', 'b.ts'], ['a.ts#1', 'b.ts#2']], [['d.ts'], ['d.ts#5']],
    ]);
  });

  it('handles empty and disconnected graphs without invented relationships', () => {
    expect(analyzeInsights(insightGraph([]))).toMatchObject({ readingStarts: [], mostImported: [], cycles: [], possiblyIncomplete: false });
    expect(analyzeInsights(insightGraph(['b.ts', 'a.ts']))).toMatchObject({ readingStarts: ['a.ts', 'b.ts'], mostImported: [], cycles: [] });
  });

  it('is invariant to input ordering and uses UTF-8 bytewise ties', () => {
    const graph = insightGraph(['root.ts', '\uE000.ts', '😀.ts', 'z.ts', 'a.ts'], [
      { from: 'root.ts', to: '😀.ts' }, { from: 'root.ts', to: '\uE000.ts' },
      { from: 'root.ts', to: 'z.ts' }, { from: 'root.ts', to: 'a.ts' }, { from: 'a.ts', to: 'root.ts' },
    ]);
    const result = analyzeInsights(graph);
    expect(result.mostImported.map((file) => file.path)).toEqual(['a.ts', 'root.ts', 'z.ts', '\uE000.ts', '😀.ts']);
    expect(analyzeInsights({ ...graph, files: [...graph.files].reverse(), edges: [...graph.edges].reverse() })).toEqual(result);
  });

  it('does not traverse package, excluded or unresolved targets', () => {
    const graph = insightGraph(['a.ts', 'b.ts']);
    const evidence = { snapshotId: graph.snapshotId, file: 'a.ts', startLine: 1, endLine: 1, contentHash: 'b'.repeat(64) };
    const mixed: DependencyGraph = { ...graph, edges: [
      { id: 'package', from: 'a.ts', specifier: 'b.ts', kind: 'import', target: { type: 'package', name: 'b.ts', builtin: false }, evidence },
      { id: 'excluded', from: 'a.ts', specifier: './b.ts', kind: 'import', target: { type: 'excluded', path: 'b.ts', reason: 'binary' }, evidence },
      { id: 'failed', from: 'a.ts', specifier: './b.ts', kind: 'import', target: { type: 'unresolved', reason: 'not-found' }, evidence },
    ] };
    expect(analyzeInsights(mixed)).toMatchObject({ readingStarts: ['a.ts', 'b.ts'], mostImported: [], cycles: [] });
  });

  it('retains every coverage reason that can make static findings incomplete', () => {
    const graph = insightGraph(['a.ts']), coverage = graph.coverage;
    const gaps = [
      { ...coverage, files: { ...coverage.files, skipped: 1 } },
      { ...coverage, files: { ...coverage.files, prunedDirectories: [{ path: 'vendor', reason: 'ignored' as const }] } },
      { ...coverage, imports: { ...coverage.imports, excluded: 1 } },
      { ...coverage, imports: { ...coverage.imports, failed: 1 } },
      { ...coverage, unsupported: [{ reason: 'unsupported-syntax', evidence: { snapshotId: graph.snapshotId, file: 'a.ts', startLine: 1, endLine: 1, contentHash: 'b'.repeat(64) } }] },
    ];
    for (const c of gaps) expect(analyzeInsights({ ...graph, coverage: c }).possiblyIncomplete).toBe(true);
    expect(analyzeInsights({ ...graph, coverage: { ...coverage, imports: { ...coverage.imports, external: 1 } } }).possiblyIncomplete).toBe(false);
  });

  it('never mutates a deeply frozen input graph', () => {
    const graph = loadExpectedGraph(), before = JSON.stringify(graph);
    const freeze = (value: unknown) => {
      if (value !== null && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    };
    freeze(graph);
    analyzeInsights(graph);
    expect(JSON.stringify(graph)).toBe(before);
  });

  it('fails loudly on duplicate files or dangling file endpoints', () => {
    expect(() => analyzeInsights(insightGraph(['a.ts', 'a.ts']))).toThrow('duplicate files');
    expect(() => analyzeInsights(insightGraph(['a.ts'], [{ from: 'a.ts', to: 'missing.ts' }]))).toThrow('outside this graph');
    expect(() => analyzeInsights(insightGraph(['a.ts'], [{ from: 'missing.ts', to: 'a.ts' }]))).toThrow('outside this graph');
  });

  it('walks a 12,000-file chain and cycle iteratively', () => {
    const paths = Array.from({ length: 12_000 }, (_, i) => `f${String(i).padStart(5, '0')}.ts`);
    const imports = paths.slice(1).map((to, i) => ({ from: paths[i]!, to }));
    const chain = analyzeInsights(insightGraph(paths, imports));
    expect(chain.cycles).toEqual([]);
    expect(chain.readingStarts).toEqual([paths[0]]);
    const cycle = analyzeInsights(insightGraph(paths, [...imports, { from: paths.at(-1)!, to: paths[0]! }]));
    expect(cycle.readingStarts).toEqual([]);
    expect(cycle.cycles[0]?.files).toEqual(paths);
    expect(cycle.cycles[0]?.edges).toHaveLength(12_000);
  });

  it('matches independent reachability for all 512 directed three-file graphs', () => {
    const paths = ['a.ts', 'b.ts', 'c.ts'];
    for (let mask = 0; mask < 512; mask += 1) {
      const reach = paths.map(() => paths.map(() => false));
      const imports: { from: string; to: string }[] = [];
      for (let from = 0; from < 3; from += 1) for (let to = 0; to < 3; to += 1) {
        if ((mask & (1 << (from * 3 + to))) !== 0) { reach[from]![to] = true; imports.push({ from: paths[from]!, to: paths[to]! }); }
      }
      // A separate tiny Floyd-Warshall oracle; no production output creates expectations.
      for (let via = 0; via < 3; via += 1) for (let from = 0; from < 3; from += 1) for (let to = 0; to < 3; to += 1) {
        reach[from]![to] ||= reach[from]![via]! && reach[via]![to]!;
      }
      const seen = new Set<number>(), expected: string[][] = [];
      for (let from = 0; from < 3; from += 1) {
        if (seen.has(from)) continue;
        const group = paths.filter((_, to) => reach[from]![to] && reach[to]![from]);
        if (group.length > 0) { expected.push(group); group.forEach((path) => seen.add(paths.indexOf(path))); }
      }
      expect(analyzeInsights(insightGraph(paths, imports)).cycles.map((group) => group.files)).toEqual(expected);
    }
  });
});
