import type { DependencyGraph } from '../../shared/contracts';
import { coverageSummary, formatRate, type Selection } from '../map/model';
import { InsightsPanel } from './InsightsPanel';

// P-18: one plain sentence and the coverage status stay visible; the exact counts, rates and
// snapshot ID move under Details. Gaps are always counted where they are first mentioned.
export function SummaryPanel({ graph, sourceLabel, isPreview, onSelect }: {
  graph: DependencyGraph; sourceLabel: string; isPreview: boolean; onSelect: (selection: Selection) => void;
}) {
  const summary = coverageSummary(graph);
  const { files, imports } = summary;
  // Every reason that can set possiblyIncomplete is counted here, so the line never reads "incomplete" with no cause.
  const gaps = ([
    [files.skipped, 'file skipped', 'files skipped'], [files.prunedDirectories.length, 'folder not read', 'folders not read'],
    [imports.excluded, 'import excluded', 'imports excluded'], [imports.failed, 'import not followed', 'imports not followed'],
    [graph.coverage.unsupported.length, 'unsupported code pattern', 'unsupported code patterns'],
  ] as const).filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`).join(', ');
  return (
    <section className="summary" aria-label="Snapshot summary">
      <div className="summary-head">
        <p className="eyebrow">Boozer AI</p>
        <p className={isPreview ? 'source-label preview' : 'source-label'}>{sourceLabel}</p>
      </div>
      <div className="summary-plain">
        <p>
          Read <strong>{files.parsed} of {files.found}</strong> code files and found <strong>{imports.seen}</strong> imports
          (places where one file uses another).
        </p>
        <p className={summary.possiblyIncomplete ? 'status incomplete' : 'status'}>
          {summary.possiblyIncomplete
            ? `Analysis possibly incomplete: ${gaps}. See Details for why.`
            : 'No coverage gaps recorded'}
        </p>
        <p className="muted small">Boozer reads code but never runs or changes it, so links are possible connections, not proof of what happens when it runs.</p>
      </div>
      <details className="summary-details">
        <summary>Details</summary>
        <p className="snapshot-id" title={graph.snapshotId}>Snapshot {graph.snapshotId}</p>
        <dl className="counts">
          <div><dt>Files found</dt><dd>{files.found}</dd></div>
          <div><dt>Parsed</dt><dd>{files.parsed}</dd></div>
          <div><dt>Skipped</dt><dd>{files.skipped}</dd></div>
          <div><dt>Parsed / found</dt><dd>{formatRate(summary.parsedRate, 'No files examined')}</dd></div>
          <div><dt>Imports seen</dt><dd>{imports.seen}</dd></div>
          <div><dt>Resolved locally</dt><dd>{imports.resolved}</dd></div>
          <div><dt>External</dt><dd>{imports.external}</dd></div>
          <div><dt>Excluded</dt><dd>{imports.excluded}</dd></div>
          <div><dt>Unresolved</dt><dd>{imports.failed}</dd></div>
          <div><dt>Local import resolution rate</dt><dd>{formatRate(summary.resolutionRate, 'No recognized imports')}</dd></div>
        </dl>
        <div className="limitations">
          <ul>
            {summary.limitations.map((line) => <li key={line}>{line}</li>)}
            <li>Static analysis only: relationships are potential, not proof of runtime behavior.</li>
          </ul>
        </div>
      </details>
      {/* The full snapshot graph, never the map filter: insight counts must not shrink with the view. */}
      <InsightsPanel graph={graph} onSelect={onSelect} />
    </section>
  );
}
