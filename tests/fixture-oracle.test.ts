import { describe, expect, it } from 'vitest';
import type { AnalysisCoverage, DependencyEdge } from '../src/shared/contracts.js';
import {
  FIXTURE_CANARY, ORACLE_PLACEHOLDERS, applyOraclePlaceholders, bytewise, loadExpectedGraph, loadFixtureSnapshot,
} from './support/fixture-snapshot.js';

// These cases check the hand-written answer key against the fixture files and the C1
// invariants. They never derive expected values from a parser; none is involved.

const snapshot = loadFixtureSnapshot();
const graph = loadExpectedGraph();
const ordinal = (edge: DependencyEdge) => Number(edge.id.slice(edge.id.lastIndexOf('#') + 1));

describe('fixture snapshot harness', () => {
  it('reads the fixture as text with the expected inventory', () => {
    expect(snapshot.inventory.found).toBe(14);
    expect(snapshot.files).toHaveLength(13);
    expect(snapshot.inventory.skipped).toEqual([{ path: 'styles.css', reason: 'unsupported-extension' }]);
    expect(snapshot.inventory.prunedDirectories).toEqual([]);
  });

  it('derives the same snapshot identity from the same files', () => {
    expect(loadFixtureSnapshot().snapshotId).toBe(snapshot.snapshotId);
  });

  it('keeps the prompt-injection canary that 1.6 and M3 rely on', () => {
    const pricing = snapshot.files.find((file) => file.path === 'pricing.ts');
    expect(pricing?.text).toContain(FIXTURE_CANARY);
  });
});

describe('hand-written expected graph', () => {
  it('records the real size and hash of every snapshot source file', () => {
    expect(graph.files.map(({ path, language, sizeBytes, contentHash }) => ({ path, language, sizeBytes, contentHash })))
      .toEqual(snapshot.files.map(({ path, language, sizeBytes, contentHash }) => ({ path, language, sizeBytes, contentHash })));
  });

  it('uses the agreed placeholders', () => {
    expect(graph.snapshotId).toBe(ORACLE_PLACEHOLDERS.snapshotId);
    expect(graph.extractor).toEqual(ORACLE_PLACEHOLDERS.extractor);
    for (const edge of graph.edges) expect(edge.evidence.snapshotId).toBe(ORACLE_PLACEHOLDERS.snapshotId);
  });

  it('satisfies the C1 file counting invariants', () => {
    const { files } = graph.coverage;
    const parseErrors = files.skips.filter((skip) => skip.reason === 'parse-error');
    expect(files.found).toBe(snapshot.inventory.found);
    expect(files.found).toBe(files.parsed + files.skipped);
    expect(files.skipped).toBe(files.skips.length);
    expect(graph.files).toHaveLength(files.parsed + parseErrors.length);
    expect(files.skips.filter((skip) => skip.reason !== 'parse-error')).toEqual(snapshot.inventory.skipped);
    for (const skip of parseErrors) {
      expect(graph.files.find((file) => file.path === skip.path)?.parse.status).toBe('error');
      expect(graph.edges.filter((edge) => edge.from === skip.path)).toEqual([]);
    }
  });

  it('satisfies the C1 import counting invariants', () => {
    const { imports } = graph.coverage;
    const count = (type: DependencyEdge['target']['type']) => graph.edges.filter((edge) => edge.target.type === type).length;
    expect(imports.seen).toBe(graph.edges.length);
    expect(imports.seen).toBe(imports.resolved + imports.external + imports.excluded + imports.failed);
    expect([imports.resolved, imports.external, imports.excluded, imports.failed])
      .toEqual([count('file'), count('package'), count('excluded'), count('unresolved')]);
    const expectedIssues = graph.edges.flatMap((edge): AnalysisCoverage['imports']['issues'][number][] =>
      edge.target.type === 'excluded' ? [{ edgeId: edge.id, outcome: 'excluded', reason: edge.target.reason }]
        : edge.target.type === 'unresolved' ? [{ edgeId: edge.id, outcome: 'failed', reason: edge.target.reason }]
          : []);
    expect(imports.issues).toEqual(expectedIssues);
  });

  it('orders files, skips and edges deterministically with contiguous statement ordinals', () => {
    const paths = graph.files.map((file) => file.path);
    expect(paths).toEqual([...paths].sort(bytewise));
    const skipPaths = graph.coverage.files.skips.map((skip) => skip.path);
    expect(skipPaths).toEqual([...skipPaths].sort(bytewise));
    const sorted = [...graph.edges].sort((a, b) => bytewise(a.from, b.from) || ordinal(a) - ordinal(b));
    expect(graph.edges).toEqual(sorted);
    for (const path of new Set(graph.edges.map((edge) => edge.from))) {
      const ids = graph.edges.filter((edge) => edge.from === path).map((edge) => edge.id);
      expect(ids).toEqual(ids.map((_, index) => `${path}#${index + 1}`));
    }
  });

  it('points every edge at real evidence that contains its specifier', () => {
    for (const edge of graph.edges) {
      const source = snapshot.files.find((file) => file.path === edge.from);
      expect(source, edge.id).toBeDefined();
      const lines = source!.text.split('\n');
      expect(edge.evidence.file, edge.id).toBe(edge.from);
      expect(edge.evidence.contentHash, edge.id).toBe(source!.contentHash);
      expect(edge.evidence.startLine, edge.id).toBeGreaterThanOrEqual(1);
      expect(edge.evidence.endLine, edge.id).toBeGreaterThanOrEqual(edge.evidence.startLine);
      expect(edge.evidence.endLine, edge.id).toBeLessThanOrEqual(lines.length);
      const statement = lines.slice(edge.evidence.startLine - 1, edge.evidence.endLine).join('\n');
      expect(statement, edge.id).toContain(edge.specifier);
    }
  });

  it('targets only files and skips that exist', () => {
    const paths = new Set(graph.files.map((file) => file.path));
    for (const edge of graph.edges) {
      if (edge.target.type === 'file') expect(paths.has(edge.target.path), edge.id).toBe(true);
      if (edge.target.type === 'excluded') {
        expect(graph.coverage.files.skips, edge.id).toContainEqual({ path: edge.target.path, reason: edge.target.reason });
      }
    }
  });
});

describe('applyOraclePlaceholders', () => {
  it('replaces only the snapshot and extractor identity', () => {
    const actual = {
      ...graph,
      snapshotId: 'real-id',
      extractor: { name: 'x', version: '1' },
      edges: graph.edges.map((edge) => ({ ...edge, evidence: { ...edge.evidence, snapshotId: 'real-id' } })),
    };
    expect(applyOraclePlaceholders(actual)).toEqual(graph);
  });
});
