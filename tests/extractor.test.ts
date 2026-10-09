import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { DependencyGraph, FileSkip, Language, SnapshotFile, WorkspaceSnapshot } from '../src/shared/contracts.js';
import { coverageRates, extractDependencies, ExtractionError } from '../src/shared/extractor.js';
import { applyOraclePlaceholders, loadExpectedGraph, loadFixtureSnapshot } from './support/fixture-snapshot.js';

function memorySnapshot(sources: Readonly<Record<string, string>>, skipped: readonly FileSkip[] = []): WorkspaceSnapshot {
  const files: SnapshotFile[] = Object.entries(sources).map(([path, text]) => ({
    path, text, language: path.split('.').at(-1) as Language, sizeBytes: Buffer.byteLength(text),
    contentHash: createHash('sha256').update(text).digest('hex'),
  }));
  return { schemaVersion: 1, snapshotId: 'in-memory-test', projectId: 'in-memory-project', files,
    inventory: { found: files.length + skipped.length, skipped, prunedDirectories: [] },
    limits: { maxFiles: 2_000, maxFileBytes: 1_048_576, maxTotalBytes: 20_971_520 }, createdAt: '2026-10-09T00:00:00Z' };
}

function assertCoverage(graph: DependencyGraph): void {
  const { files, imports } = graph.coverage;
  expect(files.found).toBe(files.parsed + files.skipped);
  expect(files.skipped).toBe(files.skips.length);
  expect(graph.files.length).toBe(files.parsed + files.skips.filter(({ reason }) => reason === 'parse-error').length);
  expect(imports.seen).toBe(graph.edges.length);
  expect(imports.seen).toBe(imports.resolved + imports.external + imports.excluded + imports.failed);
  expect(imports.issues).toEqual(graph.edges.flatMap((edge): DependencyGraph['coverage']['imports']['issues'][number][] => edge.target.type === 'excluded'
    ? [{ edgeId: edge.id, outcome: 'excluded', reason: edge.target.reason }]
    : edge.target.type === 'unresolved' ? [{ edgeId: edge.id, outcome: 'failed', reason: edge.target.reason }] : []));
}

describe('independently reviewed hand-written oracle', () => {
  it('equals every file, edge, evidence and coverage field after identity guards', () => {
    const snapshot = loadFixtureSnapshot();
    const actual = extractDependencies(snapshot);
    expect(actual.snapshotId).toBe(snapshot.snapshotId);
    expect(actual.edges.every((edge) => edge.evidence.snapshotId === snapshot.snapshotId)).toBe(true);
    expect(JSON.stringify(extractDependencies(snapshot))).toBe(JSON.stringify(actual));
    expect(applyOraclePlaceholders(actual)).toEqual(loadExpectedGraph());
    assertCoverage(actual);
  });

  it('binds each evidence range/hash to its snapshot and literal/expression text', () => {
    const snapshot = loadFixtureSnapshot();
    const graph = extractDependencies(snapshot);
    for (const edge of graph.edges) {
      const source = snapshot.files.find(({ path }) => path === edge.from)!;
      expect(edge.evidence.file).toBe(source.path);
      expect(edge.evidence.contentHash).toBe(source.contentHash);
      expect(source.text.split('\n').slice(edge.evidence.startLine - 1, edge.evidence.endLine).join('\n')).toContain(edge.specifier);
    }
    expect(graph.edges.find(({ id }) => id === 'report.ts#1')?.evidence).toMatchObject({ startLine: 1, endLine: 4 });
  });

  it('keeps a parse-error node but extracts none of its otherwise valid imports', () => {
    const graph = extractDependencies(loadFixtureSnapshot());
    expect(graph.files.find(({ path }) => path === 'broken.ts')?.parse).toEqual({ status: 'error', reason: 'parse-error' });
    expect(graph.edges.some(({ from }) => from === 'broken.ts')).toBe(false);
    expect(graph.coverage.files.skips).toContainEqual({ path: 'broken.ts', reason: 'parse-error' });
  });

  it('reads tripwire and injection source only as supplied text, ignoring instructions/comments/strings', () => {
    const snapshot = loadFixtureSnapshot();
    const tripwire = snapshot.files.find(({ path }) => path === 'tripwire.ts')!;
    expect(tripwire.text).toContain('throw');
    const graph = extractDependencies(snapshot);
    expect(graph.edges.filter(({ from }) => from === 'tripwire.ts' || from === 'utils/text.ts')).toEqual([]);
    expect(graph.edges.find(({ id }) => id === 'main.ts#1')?.target).toEqual({ type: 'file', path: 'tripwire.ts' });
  });

  it('is deterministic under input permutation and timestamp changes without modifying inputs', () => {
    const original = loadFixtureSnapshot();
    const before = JSON.stringify(original);
    const permuted = { ...original, createdAt: '2099-01-01T00:00:00Z', files: [...original.files].reverse(),
      inventory: { ...original.inventory, skipped: [...original.inventory.skipped].reverse() } };
    expect(extractDependencies(permuted)).toEqual(extractDependencies(original));
    expect(JSON.stringify(original)).toBe(before);
    const graph = extractDependencies(original);
    expect(Object.isFrozen(graph)).toBe(true);
    expect(Object.isFrozen(graph.edges[0]?.target)).toBe(true);
    expect(Object.isFrozen(graph.coverage.imports.issues)).toBe(true);
    expect(Reflect.set(graph.edges[0]!, 'specifier', 'mutated')).toBe(false);
  });

  it('renaming the leaf imported only by report creates exactly one new unresolved edge', () => {
    const original = loadFixtureSnapshot();
    const changed = { ...original, files: original.files.map((file) => file.path === 'export-csv.ts'
      ? { ...file, path: 'renamed-csv.ts' } : file) };
    const graph = extractDependencies(changed);
    const previous = extractDependencies(original);
    const newlyFailed = graph.edges.filter((edge) => edge.target.type === 'unresolved'
      && previous.edges.find(({ id }) => id === edge.id)?.target.type !== 'unresolved');
    expect(newlyFailed.map(({ id, target }) => ({ id, target }))).toEqual([
      { id: 'report.ts#7', target: { type: 'unresolved', reason: 'not-found' } },
    ]);
    expect(graph.coverage.imports.failed).toBe(previous.coverage.imports.failed + 1);
    assertCoverage(graph);
  });
});

describe('literal resolution and unsupported outcomes', () => {
  it('applies exact, extension, JS-to-TS and directory-index precedence from snapshot entries only', () => {
    const snapshot = memorySnapshot({
      'main.ts': ["import './exact.js';", "import './extension';", "import './typed.js';", "import './folder';", "import './skipped';"].join('\n'),
      'exact.js': '', 'exact.ts': '', 'extension.ts': '', 'extension.tsx': '', 'typed.ts': '', 'typed.tsx': '',
      'folder/index.ts': '', 'folder/index.js': '', 'skipped.ts': '',
    }, [{ path: 'skipped', reason: 'ignored' }]);
    expect(extractDependencies(snapshot).edges.map(({ target }) => target)).toEqual([
      { type: 'file', path: 'exact.js' }, { type: 'file', path: 'extension.ts' }, { type: 'file', path: 'typed.ts' },
      { type: 'file', path: 'folder/index.ts' }, { type: 'excluded', path: 'skipped', reason: 'ignored' },
    ]);
  });

  it('checks skips at every extension, JS-to-TS and index candidate in the same precedence order', () => {
    const graph = extractDependencies(memorySnapshot({
      'main.ts': ["import './credentials';", "import './data.js';", "import './folder';", "import './large';",
        "import './shadow';", "import './collision';", "import './later';", "import './missing';"].join('\n'),
      'shadow.tsx': '', 'later.ts': '',
    }, [
      { path: 'credentials.ts', reason: 'secret-name' }, { path: 'data.ts', reason: 'binary' },
      { path: 'folder/index.ts', reason: 'unreadable' }, { path: 'large.ts', reason: 'oversize' },
      { path: 'shadow.ts', reason: 'oversize' }, { path: 'collision.ts', reason: 'case-collision' },
      { path: 'later.tsx', reason: 'binary' },
    ]));
    expect(graph.edges.map(({ target }) => target)).toEqual([
      { type: 'excluded', path: 'credentials.ts', reason: 'secret-name' },
      { type: 'excluded', path: 'data.ts', reason: 'binary' },
      { type: 'excluded', path: 'folder/index.ts', reason: 'unreadable' },
      { type: 'excluded', path: 'large.ts', reason: 'oversize' },
      { type: 'excluded', path: 'shadow.ts', reason: 'oversize' },
      { type: 'excluded', path: 'collision.ts', reason: 'case-collision' },
      { type: 'file', path: 'later.ts' }, { type: 'unresolved', reason: 'not-found' },
    ]);
    expect(graph.coverage.imports).toMatchObject({ seen: 8, resolved: 1, excluded: 6, failed: 1 });
    assertCoverage(graph);
  });

  it('does not guess missing/excluded files or aliases; rejects absolute/root escapes', () => {
    const source = ["import './missing';", "import './large.ts';", "import './collision.ts';", "import './absent.ts';",
      "import '../escape';", "import '/absolute.ts';", "import 'C:\\\\absolute.ts';", "import '@/alias';", "import '#map';"].join('\n');
    const snapshot = memorySnapshot({ 'main.ts': source }, [
      { path: 'large.ts', reason: 'oversize' }, { path: 'collision.ts', reason: 'case-collision' },
      { path: 'absent.tsx', reason: 'unreadable' },
    ]);
    const graph = extractDependencies(snapshot);
    expect(graph.edges.map(({ target }) => target)).toEqual([
      { type: 'unresolved', reason: 'not-found' }, { type: 'excluded', path: 'large.ts', reason: 'oversize' },
      { type: 'excluded', path: 'collision.ts', reason: 'case-collision' }, { type: 'unresolved', reason: 'not-found' },
      { type: 'unresolved', reason: 'outside-root' }, { type: 'unresolved', reason: 'absolute-path' },
      { type: 'unresolved', reason: 'absolute-path' }, { type: 'unresolved', reason: 'unsupported-alias' },
      { type: 'unresolved', reason: 'unsupported-alias' },
    ]);
    assertCoverage(graph);
  });

  it('preserves literal source escapes while resolving the decoded value, and preserves package subpaths', () => {
    const source = String.raw`import './\x61';
import 'pkg/subpath';
import 'fs/promises';
import 'node:fs';
import 'node:not-a-real-builtin';`;
    const graph = extractDependencies(memorySnapshot({ 'main.ts': source, 'a.ts': '' }));
    expect(graph.edges[0]).toMatchObject({ specifier: String.raw`./\x61`, target: { type: 'file', path: 'a.ts' } });
    expect(graph.edges.slice(1).map(({ target }) => target)).toEqual([
      { type: 'package', name: 'pkg/subpath', builtin: false }, { type: 'package', name: 'fs/promises', builtin: true },
      { type: 'package', name: 'node:fs', builtin: true }, { type: 'package', name: 'node:not-a-real-builtin', builtin: false },
    ]);
  });

  it('parses JSX/TSX and JS module dialects without compiling or evaluating them', () => {
    const graph = extractDependencies(memorySnapshot({
      'view.jsx': 'import "./part"; export default <div />;', 'view.tsx': 'import type { T } from "./part"; export default <div />;',
      'module.mjs': 'export * from "./part";', 'legacy.cjs': 'require("./part");', 'part.ts': 'export type T = string;',
    }));
    expect(graph.coverage.files.parsed).toBe(5);
    expect(graph.edges.map(({ kind }) => kind)).toEqual(['require', 're-export', 'import', 'type-import']);
    expect(graph.edges.every(({ target }) => target.type === 'file' && target.path === 'part.ts')).toBe(true);
  });

  it('labels inline all-type imports but preserves mixed value imports and repeated statements', () => {
    const graph = extractDependencies(memorySnapshot({ 'main.ts': [
      'import { type T } from "./a";', 'import { type T, value } from "./a";', 'import "./a";',
    ].join('\n'), 'a.ts': 'export type T = string; export const value = 1;' }));
    expect(graph.edges.map(({ id, kind }) => ({ id, kind }))).toEqual([
      { id: 'main.ts#1', kind: 'type-import' }, { id: 'main.ts#2', kind: 'import' }, { id: 'main.ts#3', kind: 'import' },
    ]);
  });

  it('records nonliteral and unsupported syntax with evidence and matching issue counts', () => {
    const graph = extractDependencies(memorySnapshot({ 'main.ts': [
      'require(name);', 'import(prefix + suffix);', 'require();', 'require("./a", extra);',
      'import A = require("./a");', 'type A = import("./a").A;',
    ].join('\n'), 'a.ts': 'export type A = string;' }));
    expect(graph.edges.map(({ target }) => target)).toEqual([
      { type: 'unresolved', reason: 'non-literal' }, { type: 'unresolved', reason: 'non-literal' },
      ...Array.from({ length: 4 }, () => ({ type: 'unresolved', reason: 'unsupported-syntax' })),
    ]);
    expect(graph.coverage.unsupported.map(({ reason }) => reason)).toEqual(['call-arguments', 'call-arguments', 'import-equals', 'import-type']);
    assertCoverage(graph);
  });

  it('uses the innermost statement evidence for calls and handles literal templates', () => {
    const graph = extractDependencies(memorySnapshot({ 'main.ts': [
      '// leading comment', 'function f() {', '  return require(', '    `./a`', '  );', '}',
    ].join('\n'), 'a.ts': '' }));
    expect(graph.edges[0]).toMatchObject({ specifier: './a', target: { type: 'file', path: 'a.ts' },
      evidence: { startLine: 3, endLine: 5 } });
  });
});

describe('CommonJS binding ambiguity', () => {
  it.each([
    'function f(require) { require("./a"); }', 'function f({ loader: require }) { require("./a"); }',
    'function f() { require("./a"); var require; }', '{ require("./a"); const require = loader; }',
    'import require from "loader"; require("./a");', 'import { loader as require } from "loader"; require("./a");',
    'function require() {}; require("./a");', 'const require = loader; require("./a");',
    'try {} catch (require) { require("./a"); }', 'for (const require of loaders) { require("./a"); }',
    'const f = function require() { require("./a"); };', 'class require {}; require("./a");',
    'require("./a"); require = loader;',
    'for (require of loaders) { require("./a"); }', 'namespace require {}; require("./a");',
  ])('does not assert a dependency for a local/reassigned require: %s', (source) => {
    const graph = extractDependencies(memorySnapshot({ 'main.ts': source, 'a.ts': '' }));
    expect(graph.edges.filter(({ kind }) => kind === 'require').map(({ target }) => target))
      .toEqual([{ type: 'unresolved', reason: 'ambiguous-require' }]);
    assertCoverage(graph);
  });

  it('limits lexical bindings to their scopes and leaves unrelated CommonJS calls resolvable', () => {
    const graph = extractDependencies(memorySnapshot({ 'main.ts': [
      'function f(require) { require("./a"); }', '{ const require = loader; require("./a"); }', 'require("./a");',
    ].join('\n'), 'a.ts': '' }));
    expect(graph.edges.map(({ target }) => target)).toEqual([
      { type: 'unresolved', reason: 'ambiguous-require' }, { type: 'unresolved', reason: 'ambiguous-require' },
      { type: 'file', path: 'a.ts' },
    ]);
  });

  it('keeps dynamic scope visible instead of assuming require binding authority', () => {
    const graph = extractDependencies(memorySnapshot({ 'main.js': 'eval(code); require("./a");', 'a.ts': '' }));
    expect(graph.edges[0]?.target).toEqual({ type: 'unresolved', reason: 'ambiguous-require' });
    expect(graph.coverage.unsupported[0]?.reason).toBe('dynamic-scope');
    assertCoverage(graph);
  });
});

describe('empty coverage and snapshot validation', () => {
  it('returns absent rates for zero denominators, never full coverage', () => {
    const empty = extractDependencies(memorySnapshot({}));
    expect(coverageRates(empty.coverage)).toEqual({ parsedFiles: null, localImportResolution: null });
    const noImports = extractDependencies(memorySnapshot({ 'main.ts': 'export const n = 1;' }));
    expect(coverageRates(noImports.coverage)).toEqual({ parsedFiles: 1, localImportResolution: null });
    assertCoverage(empty);
    assertCoverage(noImports);
  });

  it('rejects tampered source/hash, duplicate paths, escapes and inconsistent inventory', () => {
    const good = memorySnapshot({ 'main.ts': 'export {};' });
    for (const bad of [
      { ...good, files: [{ ...good.files[0]!, text: 'mutated' }] },
      { ...good, files: [good.files[0]!, good.files[0]!], inventory: { ...good.inventory, found: 2 } },
      { ...good, files: [{ ...good.files[0]!, path: '../outside.ts' }] },
      { ...good, inventory: { ...good.inventory, found: 999 } },
    ]) expect(() => extractDependencies(bad)).toThrow(ExtractionError);
  });
});
