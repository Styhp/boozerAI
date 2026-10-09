import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { InsightsPanel } from '../src/client/components/InsightsPanel';
import { loadExpectedGraph } from './support/fixture-snapshot';
import { insightGraph } from './support/insight-graph';

describe('reading insights panel', () => {
  it('shows counted reading starts, ranking, cycle members and actual import evidence', () => {
    const graph = loadExpectedGraph(), select = vi.fn();
    const html = renderToStaticMarkup(<InsightsPanel graph={graph} onSelect={select} />);
    expect(html).toContain('Where to start reading (3)');
    expect(html).toContain('No importers found by static analysis.');
    expect(html).toContain('Most-imported files (10)');
    expect(html).toContain('3 importing files');
    expect(html).toContain('Static import cycle groups (1)');
    expect(html).toContain('data-file="main.ts"');
    expect(html).toContain('data-edge="pricing.ts#2"');
    expect(html).toContain('>type-import<');
    expect(html).toContain('data-snapshot-id="&lt;FIXTURE_SNAPSHOT_ID&gt;"');
    expect(html).toContain('Showing 8 of 10.');
    expect(html).toContain('>Show all<');
    expect(select).not.toHaveBeenCalled();
    expect(html).not.toMatch(/unused|dead code|will break|\bsafe\b|type-only path/i);
  });

  it('shows exact coverage gaps rather than claiming complete analysis', () => {
    const html = renderToStaticMarkup(<InsightsPanel graph={loadExpectedGraph()} onSelect={() => undefined} />);
    expect(html).toContain('Possibly incomplete. Skipped files: 2; pruned directories: 0; excluded imports: 1; unresolved imports: 3; unsupported patterns: 0.');
    const clean = renderToStaticMarkup(<InsightsPanel graph={insightGraph(['a.ts'])} onSelect={() => undefined} />);
    expect(clean).not.toContain('Possibly incomplete');
  });

  it('handles empty and self-import snapshots with honest zero-result wording', () => {
    const empty = renderToStaticMarkup(<InsightsPanel graph={insightGraph([])} onSelect={() => undefined} />);
    expect(empty).toContain('Reading insights (0 indexed files)');
    expect(empty).toContain('No files with zero known importers');
    expect(empty).toContain('No local file imports found by static analysis.');
    expect(empty).toContain('No import cycles found by static analysis.');
    const self = renderToStaticMarkup(<InsightsPanel graph={insightGraph(['a.ts'], [{ from: 'a.ts', to: 'a.ts' }])} onSelect={() => undefined} />);
    expect(self).toContain('1 file (self import), 1 import statement');
    expect(self).not.toContain('No importers found by static analysis.');
  });

  it('escapes untrusted file names and never creates source-supplied links or HTML', () => {
    const path = '<script>alert(1)</script>.ts';
    const html = renderToStaticMarkup(<InsightsPanel graph={insightGraph([path])} onSelect={() => undefined} />);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;.ts');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href=');
  });

  it('reports invalid graphs with a fixed error instead of publishing partial insights', () => {
    const html = renderToStaticMarkup(<InsightsPanel graph={insightGraph(['a.ts'], [{ from: 'a.ts', to: 'private/path.ts' }])} onSelect={() => undefined} />);
    expect(html).toContain('Reading insights could not be calculated for this snapshot.');
    expect(html).not.toContain('private/path.ts');
    expect(html).not.toContain('Where to start reading');
  });
});
