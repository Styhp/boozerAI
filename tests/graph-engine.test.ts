import { describe, expect, it } from 'vitest';
import type { DependencyGraph } from '../src/shared/contracts.js';
import { GRAPH_COPY, ISSUE_WORDS, SKIP_WORDS } from '../src/client/graph/copy.js';
import {
  DEFAULT_FILTERS, GRAPH, buildModel, fitCamera, hitTest, hoverCardData, linkVisible, nodeVisible, targetId, toWorld, zoomAt,
  type Camera, type GraphFilters, type GraphModel,
} from '../src/client/graph/engine.js';
import { graphNodeCount } from '../src/client/workspace/model.js';
import { loadExpectedGraph } from './support/fixture-snapshot.js';

const graph = loadExpectedGraph();
const node = (model: GraphModel, id: string) => model.byId.get(id)!;
const edge = (id: string) => graph.edges.find((e) => e.id === id)!;

// Hand-derived from fixtures/basic/expected-graph.json: 13 files (broken.ts has a parse error),
// 2 packages (zod, node:path), 4 imports not followed (legacy.cjs#2, main.ts#2, report.ts#5,
// report.ts#8) and 22 edges. inventory.ts is imported by main.ts#4, pricing.ts#1–2 and report.ts#1–2.
describe('buildModel', () => {
  it('makes one node per file, package and import not followed, and one link per parser edge', () => {
    const model = buildModel(graph);
    expect(model.nodes).toHaveLength(19);
    expect(graphNodeCount(graph)).toBe(19);
    expect(model.nodes.filter((n) => n.kind === 'file')).toHaveLength(12);
    expect(node(model, 'broken.ts').kind).toBe('error');
    expect(model.nodes.filter((n) => n.kind === 'pkg').map((n) => n.id).sort()).toEqual(['pkg:node:path', 'pkg:zod']);
    expect(model.nodes.filter((n) => n.kind === 'gap').map((n) => n.id).sort())
      .toEqual(['gap:legacy.cjs#2', 'gap:main.ts#2', 'gap:report.ts#5', 'gap:report.ts#8']);
    expect(model.links.map((l) => l.edge.id)).toEqual(graph.edges.map((e) => e.id));
  });

  it('sizes file dots by importer count only', () => {
    const model = buildModel(graph);
    expect(node(model, 'inventory.ts').importers).toBe(5);
    expect(node(model, 'inventory.ts').r).toBeCloseTo(4.5 + 2.4 * Math.sqrt(5));
    expect(node(model, 'main.ts').r).toBe(4.5);
    expect(node(model, 'pkg:zod').r).toBe(3.2);
    expect(node(model, 'gap:report.ts#5').r).toBe(4);
  });

  it('keeps positions on rebuild and re-heats to at least 0.4', () => {
    const first = buildModel(graph);
    const n = node(first, 'report.ts'); n.x = 123; n.y = -45;
    first.alpha = 0.01;
    const second = buildModel(graph, first);
    expect(node(second, 'report.ts')).toBe(n);
    expect([n.x, n.y]).toEqual([123, -45]);
    expect(second.alpha).toBe(0.4);
  });
});

describe('ids and filters', () => {
  it('names targets by path, package or edge', () => {
    expect(targetId(edge('main.ts#1'))).toBe('tripwire.ts');
    expect(targetId(edge('main.ts#6'))).toBe('pkg:node:path');
    expect(targetId(edge('main.ts#2'))).toBe('gap:main.ts#2');
    expect(targetId(edge('report.ts#8'))).toBe('gap:report.ts#8');
  });

  it('hides packages, gaps and type-only links only through their own toggles', () => {
    const model = buildModel(graph);
    const pkg = node(model, 'pkg:zod'), gap = node(model, 'gap:main.ts#2'), file = node(model, 'main.ts');
    const typeLink = model.links.find((l) => l.edge.id === 'main.ts#4')!;
    const pkgLink = model.links.find((l) => l.edge.id === 'main.ts#6')!;
    const gapLink = model.links.find((l) => l.edge.id === 'main.ts#2')!;
    const fileLink = model.links.find((l) => l.edge.id === 'main.ts#1')!;
    const off = (key: keyof GraphFilters): GraphFilters => ({ ...DEFAULT_FILTERS, [key]: false });
    expect([pkg, gap, file].every((n) => nodeVisible(n, DEFAULT_FILTERS))).toBe(true);
    expect([typeLink, pkgLink, gapLink, fileLink].every((l) => linkVisible(l, DEFAULT_FILTERS))).toBe(true);
    expect([nodeVisible(pkg, off('packages')), nodeVisible(gap, off('packages')), linkVisible(pkgLink, off('packages'))]).toEqual([false, true, false]);
    expect([nodeVisible(gap, off('gaps')), nodeVisible(pkg, off('gaps')), linkVisible(gapLink, off('gaps'))]).toEqual([false, true, false]);
    expect([linkVisible(typeLink, off('typeLinks')), linkVisible(fileLink, off('typeLinks'))]).toEqual([false, true]);
    // Arrows, labels and search change drawing, never visibility: search fades dots, it doesn't remove them.
    for (const f of [off('arrows'), off('labels'), { ...DEFAULT_FILTERS, search: 'nothing-matches' }]) {
      expect([pkg, gap, file].every((n) => nodeVisible(n, f))).toBe(true);
      expect([typeLink, pkgLink, gapLink, fileLink].every((l) => linkVisible(l, f))).toBe(true);
    }
  });
});

describe('camera and hit testing', () => {
  const view = { w: 200, h: 100 };

  it('hits a dot within max(6, r·k + 5) screen px and ignores faint dots', () => {
    const model = buildModel(graph);
    for (const n of model.nodes) { n.x = 1000; n.y = 1000; n.a = 1; }
    const main = node(model, 'main.ts');
    main.x = 10; main.y = 5;   // screen (120, 60) at k = 2 around the origin
    const cam: Camera = { x: 0, y: 0, k: 2, target: null };
    // r = 4.5 → hit radius 4.5·2 + 5 = 14.
    expect(hitTest(model, cam, view, 130, 60)).toBe(main);
    expect(hitTest(model, cam, view, 135, 60)).toBeNull();
    main.a = 0.29;
    expect(hitTest(model, cam, view, 120, 60)).toBeNull();
  });

  it('fits within zoom 0.35–2', () => {
    const view = { w: 800, h: 600 };
    const model = buildModel(graph);
    const cam: Camera = { x: 0, y: 0, k: 1, target: null };
    model.nodes.forEach((n, i) => { n.x = i * 1000; n.y = 0; });
    fitCamera(cam, view, model, DEFAULT_FILTERS, false);
    expect(cam.k).toBe(GRAPH.zoom.fitMin);
    model.nodes.forEach((n) => { n.x = 0; n.y = 0; });
    fitCamera(cam, view, model, DEFAULT_FILTERS, false);
    expect(cam.k).toBe(GRAPH.zoom.fitMax);
    fitCamera(cam, view, model, DEFAULT_FILTERS, true);
    expect(cam.target).not.toBeNull();
  });

  it('zooms around the pointer and clamps to 0.25–3.5', () => {
    const cam: Camera = { x: 30, y: -20, k: 1, target: null };
    const before = toWorld(cam, view, 150, 20);
    zoomAt(cam, view, 150, 20, -200);
    expect(cam.k).toBeCloseTo(Math.exp(200 * GRAPH.zoom.wheel));
    const after = toWorld(cam, view, 150, 20);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
    zoomAt(cam, view, 150, 20, -100_000);
    expect(cam.k).toBe(3.5);
    zoomAt(cam, view, 150, 20, 100_000);
    expect(cam.k).toBe(0.25);
  });
});

describe('hover card data', () => {
  it('splits files from packages and lists import lines from parser evidence', () => {
    const model = buildModel(graph);
    const d = hoverCardData(model, node(model, 'main.ts'));
    // main.ts → tripwire, config, inventory, report (files); node:path (package); styles.css (gap).
    expect([d.usesFiles, d.usesPackages, d.usedBy]).toEqual([4, 1, 0]);
    expect(d.importLines).toEqual([
      { line: 2, specifier: './tripwire', kind: 'import' }, { line: 3, specifier: './styles.css', kind: 'import' },
      { line: 4, specifier: './config', kind: 'import' }, { line: 5, specifier: './inventory', kind: 'type-import' },
      { line: 6, specifier: './report', kind: 'import' }, { line: 7, specifier: 'node:path', kind: 'import' },
    ]);
  });

  it('counts distinct files, not import statements', () => {
    const model = buildModel(graph);
    // inventory.ts: 5 import statements from 3 files. report.ts imports inventory.ts twice.
    expect(hoverCardData(model, node(model, 'inventory.ts')).usedBy).toBe(3);
    expect(hoverCardData(model, node(model, 'report.ts')).usesFiles).toBe(5);
    expect(hoverCardData(model, node(model, 'report.ts')).importLines).toHaveLength(8);
  });

  it('lists importers with their lines and gives gaps their reason', () => {
    const model = buildModel(graph);
    expect(hoverCardData(model, node(model, 'inventory.ts')).importers).toEqual([
      { file: 'main.ts', line: 5 }, { file: 'pricing.ts', line: 1 }, { file: 'pricing.ts', line: 2 },
      { file: 'report.ts', line: 1 }, { file: 'report.ts', line: 5 },
    ]);
    const gap = hoverCardData(model, node(model, 'gap:report.ts#5'));
    expect([gap.kind, gap.reason]).toEqual(['gap', 'not-found']);
    expect(hoverCardData(model, node(model, 'gap:main.ts#2')).reason).toBe('unsupported-extension');
  });

  it('builds from any graph without a source fetch', () => {
    const tiny: DependencyGraph = { ...graph, files: [graph.files[0]!], edges: [] };
    const model = buildModel(tiny);
    expect(hoverCardData(model, model.nodes[0]!)).toMatchObject({ usesFiles: 0, usesPackages: 0, usedBy: 0, importLines: [], importers: [] });
  });
});

// SPEC §15 copy guard over the graph strings module. Words are matched whole and case-insensitively;
// the allowlisted negations are removed first.
const BANNED = /\b(unused|dead code|safe|will break|entry points?)\b/i;
const ALLOWED = [
  'That doesn’t mean it’s unused: entry points, config and tests are often loaded another way.',
  "That doesn't mean it's unused: entry points, config and tests are often loaded another way.",
  "It doesn't mean they will break, and an empty list doesn't mean a change is safe.",
  "It doesn't mean they will break.",
  "And no files listed doesn't mean a change is safe.",
  'Entry points, config files and tests usually look like this.',
];
function copyViolations(text: string): string | null {
  let rest = text;
  for (const ok of ALLOWED) rest = rest.split(ok).join('');
  return BANNED.exec(rest)?.[0] ?? null;
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  // Functions are called with counts 1 and 2 (or text, for those that take labels) so every branch's wording is checked.
  if (typeof value === 'function') {
    const fn = value as (...a: unknown[]) => unknown;
    return [1, 2].flatMap((n) => { try { return strings(fn(n, n, n)); } catch { return strings(fn(`label ${n}`, `label ${n}`, `label ${n}`)); } });
  }
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

describe('copy guard', () => {
  it('finds banned words and lets the allowlisted negations through', () => {
    expect(copyViolations('This file is unused.')).toBe('unused');
    expect(copyViolations('Safe to change')).toBe('Safe');
    expect(copyViolations("It doesn't mean they will break.")).toBeNull();
    expect(copyViolations('Entry points, config files and tests usually look like this.')).toBeNull();
  });

  it('passes every graph string', () => {
    const all = strings([GRAPH_COPY, SKIP_WORDS, ISSUE_WORDS]);
    expect(all.length).toBeGreaterThan(40);
    expect(all.filter((text) => copyViolations(text) !== null)).toEqual([]);
  });
});
