import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { FileNode } from '../src/shared/contracts.js';
import {
  buildTree, fileGapCounts, fileLinks, filterGraph, folderPaths, formatReadTime, gapCount, graphNodeCount, plural,
} from '../src/client/workspace/model.js';
import { Workspace } from '../src/client/workspace/Workspace.js';
import { loadExpectedGraph } from './support/fixture-snapshot.js';

const graph = loadExpectedGraph();
const noop = () => undefined;
const file = (path: string): FileNode => ({ path, language: 'ts', sizeBytes: 1, contentHash: 'h', parse: { status: 'ok' } });

// Every expectation below is hand-derived from fixtures/basic/expected-graph.json:
// 13 indexed files (broken.ts has a parse error); coverage 2 skipped files, 0 pruned folders,
// 22 imports seen, 1 excluded (main.ts#2), 3 failed (legacy.cjs#2, report.ts#5, report.ts#8), 0 unsupported.
describe('workspace display rules', () => {
  it('counts every coverage gap reason once', () => {
    expect(gapCount(graph)).toBe(6);
  });

  it('flags each file with the imports it could not follow or that were excluded', () => {
    expect([...fileGapCounts(graph)].sort()).toEqual([['legacy.cjs', 1], ['main.ts', 1], ['report.ts', 2]]);
  });

  it('counts distinct linked files, not import statements', () => {
    // pricing.ts and report.ts each import inventory.ts twice (value + type).
    expect(fileLinks(graph, 'inventory.ts')).toEqual({ uses: 1, usedBy: 3 });
    expect(fileLinks(graph, 'report.ts')).toEqual({ uses: 5, usedBy: 1 });
    expect(fileLinks(graph, 'broken.ts')).toEqual({ uses: 0, usedBy: 0 });
  });

  it('builds a tree with folders sorted first and files in graph order', () => {
    const tree = buildTree(['root.ts', 'b/z.ts', 'a/y.ts', 'a/c/x.ts', 'a/w.ts'].map(file));
    expect(tree.files.map((f) => f.path)).toEqual(['root.ts']);
    expect(tree.folders.map((f) => f.path)).toEqual(['a', 'b']);
    expect(tree.folders[0]!.folders.map((f) => f.path)).toEqual(['a/c']);
    expect(tree.folders[0]!.files.map((f) => f.path)).toEqual(['a/y.ts', 'a/w.ts']);
    expect(folderPaths(tree)).toEqual(['a', 'a/c', 'b']);
  });

  it('pluralises with the noun and formats the read time like the copy deck', () => {
    expect([plural(1, 'gap'), plural(2, 'gap'), plural(0, 'file')]).toEqual(['1 gap', '2 gaps', '0 files']);
    expect(formatReadTime(new Date(2026, 9, 8, 15, 20))).toBe('Thu 8 Oct, 15:20');
  });

  it('narrows a drawing to matching files and their original internal edges without changing the full graph', () => {
    const before = JSON.stringify(graph);
    const drawing = filterGraph(graph, '  UTILS/ ');
    expect(drawing.files.map(({ path }) => path)).toEqual(['utils/index.ts', 'utils/math.ts', 'utils/text.ts']);
    expect(drawing.edges.map(({ id }) => id)).toEqual(['utils/index.ts#1', 'utils/index.ts#2']);
    for (const edge of drawing.edges) expect(graph.edges.find(({ id }) => id === edge.id)).toBe(edge);
    for (const file of drawing.files) expect(graph.files.find(({ path }) => path === file.path)).toBe(file);
    expect(graphNodeCount(drawing)).toBe(3);
    expect(drawing).not.toHaveProperty('coverage');
    expect(JSON.stringify(graph)).toBe(before);
    expect(filterGraph(graph, ' ')).toBe(graph);
    expect(filterGraph(graph, 'no-such-folder/')).toEqual({ files: [], edges: [] });
  });

  it('counts package and excluded terminal nodes in a narrowed view', () => {
    // main.ts has external node:path and one excluded import; its file targets are outside this view.
    const drawing = filterGraph(graph, 'main.ts');
    expect(drawing.files.map(({ path }) => path)).toEqual(['main.ts']);
    expect(drawing.edges.map(({ id }) => id)).toEqual(['main.ts#2', 'main.ts#6']);
    expect(graphNodeCount(drawing)).toBe(3);
    expect(drawing.edges.every((edge) => edge.target.type !== 'file')).toBe(true);
  });
});

describe('workspace shell (S1)', () => {
  const render = (props: Partial<Parameters<typeof Workspace>[0]> = {}) => renderToStaticMarkup(
    <div className="ws-shell bz">
      <Workspace graph={graph} label="basic" isPreview={false} readAt={new Date(2026, 9, 8, 15, 20)} selection={null}
        onSelection={noop} source={{ status: 'idle' }} cloudSends={0} {...props} />
    </div>,
  );

  it('lists every indexed file in the tree, with parse-error and gap flags', () => {
    const html = render();
    expect(html.match(/class="ws-tree-row is-file"/g)).toHaveLength(13);
    expect(html).toContain('title="broken.ts" data-hover-id="broken.ts"><span class="ws-tree-name">broken.ts</span><span class="ws-flag is-error">parse error</span>');
    expect(html).toContain('title="report.ts" data-hover-id="report.ts"><span class="ws-tree-name">report.ts</span><span class="ws-flag is-gap">2 gaps</span>');
    expect(html).toContain('<span class="ws-tree-name">utils</span>');
  });

  it('opens on the Overview with project counts and the locality in the status bar', () => {
    const html = render();
    expect(html).toContain('<section class="ws-pane" data-open="true" aria-label="Detail" aria-hidden="false">');
    expect(html).toContain('<span>Overview</span>');
    expect(html).toContain('<span>13 files</span><span>22 imports</span><span>6 gaps</span><span class="ws-loc">On this computer</span>');
    expect(html).toContain('<b>basic</b> · read Thu 8 Oct, 15:20');
  });

  it('counts cloud requests in place of "On this computer" once any is sent', () => {
    const html = render({ cloudSends: 2 });
    expect(html).not.toContain('On this computer');
    expect(html.match(/<span class="ws-loc is-external">2 requests sent online<\/span>/g)).toHaveLength(2);
  });

  it('draws the force graph with its legend and hint under the 300-node cap (S2)', () => {
    const html = render();
    expect(html).toContain('<canvas role="img" aria-label="Graph of files and their imports. Use the file tree for a keyboard-friendly list."></canvas>');
    expect(html).toContain('<span>Bigger dot = more files use it (not more important)</span>');
    expect(html).toContain('<div class="ws-graph-hint">Point at a dot to see what it connects to · click to open it</div>');
    expect(html).not.toContain('Folder or path filter');
  });

  it('shows Refresh and Close project only with a project server', () => {
    expect(render()).not.toContain('Refresh: read the folder again');
    expect(render()).not.toContain('Close project');
    const html = render({ onRefresh: noop, onClose: noop });
    expect(html).toContain('aria-label="Refresh: read the folder again"');
    expect(html).toContain('aria-label="Close project"');
  });

  it('keeps a large project list-first and exposes folder/search controls without a partial canvas', () => {
    const large = { ...graph, files: Array.from({ length: 301 }, (_, i) => file(`src/f${i}.ts`)), edges: [] };
    const html = render({ graph: large });
    expect(html).not.toContain('<canvas');
    expect(html).toContain('Choose a folder to show the animated graph');
    expect(html).toContain('This view needs 301 nodes');
    expect(html).toContain('aria-label="Graph filter"');
    expect(html).toContain('<option value="src/">src/</option>');
    expect(html.match(/class="ws-tree-row is-file"/g)).toHaveLength(301);
  });

  it('still renders all 300 nodes at the canvas boundary', () => {
    const full = { ...graph, files: Array.from({ length: 300 }, (_, i) => file(`src/f${i}.ts`)), edges: [] };
    const html = render({ graph: full });
    expect(html).toContain('<canvas');
    expect(html).not.toContain('aria-label="Graph filter"');
  });
});
