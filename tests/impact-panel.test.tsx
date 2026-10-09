import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DetailPane } from '../src/client/components/DetailPane.js';
import { ImpactPanel } from '../src/client/components/ImpactPanel.js';
import type { DependencyGraph } from '../src/shared/contracts.js';
import { loadExpectedGraph } from './support/fixture-snapshot.js';

const graph = loadExpectedGraph();
const noop = () => undefined;
const panel = (path: string, g: DependencyGraph = graph) => renderToStaticMarkup(<ImpactPanel graph={g} path={path} onSelect={noop} />);

describe('impact panel', () => {
  it('lists direct importers by default with depth, type-only labels and a clickable chain', () => {
    const html = panel('inventory.ts');
    expect(html).toContain('Potentially affected files (3 within depth 1)');
    expect(html).toContain('type-only path');
    expect(html).toContain('main.ts:5');
    expect(html).toContain('pricing.ts:1');
    expect(html).toContain('report.ts:1');
    expect(html).toMatch(/aria-pressed="true">1</);
  });

  it('uses the exact empty wording with the depth limit', () => {
    expect(panel('main.ts')).toContain('No importers found by static analysis within depth 1.');
  });

  it('offers expansion when the depth limit hides reachable files', () => {
    const html = panel('utils/math.ts');
    expect(html).toContain('More files are reachable beyond depth 1.');
    expect(html).toContain('Expand to depth 2');
    expect(panel('inventory.ts')).not.toContain('More files are reachable');
  });

  it('flags incomplete analysis only when coverage has gaps', () => {
    expect(panel('inventory.ts')).toContain('Possibly incomplete');
    const clean: DependencyGraph = {
      ...graph,
      coverage: {
        files: { found: graph.files.length, parsed: graph.files.length, skipped: 0, skips: [], prunedDirectories: [] },
        imports: { seen: 0, resolved: 0, external: 0, excluded: 0, failed: 0, issues: [] },
        unsupported: [],
      },
    };
    expect(panel('inventory.ts', clean)).not.toContain('Possibly incomplete');
  });

  it('never words reachability as breakage or safety, for any file', () => {
    for (const file of graph.files) {
      const html = renderToStaticMarkup(
        <DetailPane graph={graph} selection={{ kind: 'file', path: file.path }} source={{ status: 'loading', path: file.path }} onSelect={noop} />);
      expect(html).toContain('Potentially affected files');
      expect(html).not.toMatch(/will break|\bsafe\b|no impact|unused|dead code/i);
    }
  });
});
