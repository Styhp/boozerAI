import type { DependencyGraph, EdgeKind } from '../../src/shared/contracts';

// Hand-authored graph data only; no source extraction or execution builds these cases.
export function insightGraph(paths: readonly string[], imports: readonly { from: string; to: string; kind?: EdgeKind }[] = []): DependencyGraph {
  const snapshotId = `sha256:${'a'.repeat(64)}`, contentHash = 'b'.repeat(64);
  return {
    schemaVersion: 1, snapshotId, extractor: { name: 'hand-authored', version: '1' },
    files: paths.map((path) => ({ path, language: 'ts', sizeBytes: 1, contentHash, parse: { status: 'ok' } })),
    edges: imports.map(({ from, to, kind }, i) => ({
      id: `${from}#${i + 1}`, from, specifier: to, kind: kind ?? 'import', target: { type: 'file', path: to },
      evidence: { snapshotId, file: from, startLine: i + 1, endLine: i + 1, contentHash },
    })),
    coverage: {
      files: { found: paths.length, parsed: paths.length, skipped: 0, skips: [], prunedDirectories: [] },
      imports: { seen: imports.length, resolved: imports.length, external: 0, excluded: 0, failed: 0, issues: [] },
      unsupported: [],
    },
  };
}
