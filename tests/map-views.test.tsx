import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DetailPane } from '../src/client/components/DetailPane.js';
import { GraphList } from '../src/client/components/GraphList.js';
import { MapCanvas } from '../src/client/components/MapCanvas.js';
import { SummaryPanel } from '../src/client/components/SummaryPanel.js';
import { layoutMap } from '../src/client/map/layout.js';
import {
  coverageSummary, formatRate, rate, referenceState, sourceLines, type LoadedSource, type Selection, type SourceState,
} from '../src/client/map/model.js';
import type { DependencyGraph } from '../src/shared/contracts.js';
import { loadExpectedGraph, loadFixtureSnapshot } from './support/fixture-snapshot.js';

const graph = loadExpectedGraph();
const snapshot = loadFixtureSnapshot();
const noop = () => undefined;

function loaded(path: string, override: Partial<LoadedSource> = {}): SourceState {
  const file = snapshot.files.find((f) => f.path === path)!;
  return { status: 'loaded', source: { snapshotId: graph.snapshotId, path, contentHash: file.contentHash, text: file.text, ...override } };
}
const detail = (selection: Selection | null, source: SourceState = { status: 'idle' }, g: DependencyGraph = graph) =>
  renderToStaticMarkup(<DetailPane graph={g} selection={selection} source={source} onSelect={noop} />);
const evidenceLines = (html: string) => [...html.matchAll(/class="line evidence" data-line="(\d+)"/g)].map((m) => Number(m[1]));

describe('display model', () => {
  it('summarizes coverage with labeled rates and listed limitations', () => {
    const summary = coverageSummary(graph);
    expect(summary.parsedRate).toBeCloseTo(12 / 14);
    expect(summary.resolutionRate).toBeCloseTo(16 / 22);
    expect(summary.possiblyIncomplete).toBe(true);
    expect(summary.limitations).toEqual([
      '2 of 14 files skipped (1 parse-error, 1 unsupported-extension)',
      '3 imports unresolved (1 ambiguous-require, 1 not-found, 1 non-literal)',
      '1 imports point at excluded files',
    ]);
  });

  it('never shows a zero denominator as a rate', () => {
    expect(rate(0, 0)).toBeNull();
    expect(formatRate(rate(0, 0), 'No recognized imports')).toBe('No recognized imports');
  });

  it('marks references stale on any snapshot, hash or line mismatch', () => {
    const edge = graph.edges.find((e) => e.id === 'report.ts#1')!;
    const ok = (loaded('report.ts') as { source: LoadedSource }).source;
    expect(referenceState(edge.evidence, ok)).toBe('current');
    expect(referenceState(edge.evidence, { ...ok, contentHash: 'changed' })).toBe('stale');
    expect(referenceState(edge.evidence, { ...ok, snapshotId: 'other' })).toBe('stale');
    expect(referenceState({ ...edge.evidence, endLine: 999 }, ok)).toBe('stale');
  });

  it('does not invent a line for a final newline', () => {
    expect(sourceLines('a\nb\n')).toEqual(['a', 'b']);
  });
});

describe('detail pane states', () => {
  it('distinguishes empty, loading, failed, source, parse-error and stale states', () => {
    expect(detail(null)).toContain('data-state="empty"');
    expect(detail({ kind: 'file', path: 'main.ts' }, { status: 'loading', path: 'main.ts' })).toContain('data-state="loading"');
    expect(detail({ kind: 'file', path: 'main.ts' }, { status: 'failed', path: 'main.ts', message: 'gone' })).toContain('data-state="failed"');
    expect(detail({ kind: 'file', path: 'main.ts' }, loaded('main.ts'))).toContain('data-state="source"');
    const broken = detail({ kind: 'file', path: 'broken.ts' }, loaded('broken.ts'));
    expect(broken).toContain('data-state="parse-error"');
    expect(broken).toContain('Parse error');
    const stale = detail({ kind: 'edge', id: 'report.ts#1' }, loaded('report.ts', { contentHash: 'changed' }));
    expect(stale).toContain('data-state="stale"');
    expect(evidenceLines(stale)).toEqual([]);
  });

  it('opens an edge in its importing file with the whole evidence range highlighted and numbered lines', () => {
    const html = detail({ kind: 'edge', id: 'report.ts#1' }, loaded('report.ts'));
    expect(html).toContain('<h2>report.ts</h2>');
    expect(evidenceLines(html)).toEqual([1, 2, 3, 4]);
    expect(html).toContain('data-line="28"');
    expect(evidenceLines(detail({ kind: 'edge', id: 'report.ts#8' }, loaded('report.ts')))).toEqual([26]);
  });

  it('renders source as escaped text', () => {
    const text = '<script>alert(1)</script>\n<img src=x onerror=alert(2)>\n';
    const html = detail({ kind: 'file', path: 'main.ts' }, loaded('main.ts', { text }));
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('describes package, excluded and unresolved targets with their reasons', () => {
    expect(detail({ kind: 'terminal', nodeId: 'package:zod' })).toContain('external package');
    expect(detail({ kind: 'terminal', nodeId: 'package:node:path' })).toContain('built-in package');
    expect(detail({ kind: 'terminal', nodeId: 'excluded:main.ts#2' })).toContain('excluded: unsupported-extension');
    expect(detail({ kind: 'terminal', nodeId: 'unresolved:legacy.cjs#2' })).toContain('unresolved: ambiguous-require');
  });
});

describe('list, summary and canvas messages', () => {
  it('lists every indexed file and relationship', () => {
    const html = renderToStaticMarkup(<GraphList graph={graph} selection={{ kind: 'edge', id: 'main.ts#2' }} onSelect={noop} />);
    expect(html.match(/<button/g)).toHaveLength(13 + 22);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('→ styles.css (excluded: unsupported-extension)');
  });

  it('labels the fixture preview and the incomplete-analysis status', () => {
    const html = renderToStaticMarkup(<SummaryPanel graph={graph} sourceLabel="Fixture preview: hand-written answer key, not parser output" isPreview onSelect={noop} />);
    expect(html).toContain('Fixture preview: hand-written answer key, not parser output');
    expect(html).toContain('Analysis possibly incomplete');
    expect(html).toContain('Local import resolution rate');
    expect(html).toContain('73%');
  });

  it('mounts reading insights over the full snapshot graph', () => {
    const html = renderToStaticMarkup(<SummaryPanel graph={graph} sourceLabel="Fixture" isPreview={false} onSelect={noop} />);
    // Hand-derived from the oracle: 13 indexed files, 3 reading starts, 10 imported files, 1 cycle group.
    expect(html).toContain('Reading insights (13 indexed files)');
    expect(html).toContain('Where to start reading (3)');
    expect(html).toContain('Most-imported files (10)');
    expect(html).toContain('Static import cycle groups (1)');
  });

  it('explains list-first mode and filter counts instead of drawing a partial canvas', () => {
    const files = Array.from({ length: 301 }, (_, i) => ({ path: `f/${i}.ts`, language: 'ts' as const, sizeBytes: 1, contentHash: 'x', parse: { status: 'ok' as const } }));
    const html = renderToStaticMarkup(
      <MapCanvas layout={layoutMap({ ...graph, files, edges: [] })} selection={null} filter="" onFilter={noop} onSelect={noop} />);
    expect(html).toContain('over the 300-node canvas cap');
    expect(html).not.toContain('react-flow');
    const filtered = renderToStaticMarkup(
      <MapCanvas layout={layoutMap(graph, 'nothing/')} selection={null} filter="nothing/" onFilter={noop} onSelect={noop} />);
    expect(filtered).toContain('13 files and 22 relationships hidden by the filter');
  });
});
