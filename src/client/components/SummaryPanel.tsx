import type { DependencyGraph } from '../../shared/contracts';
import { coverageSummary, formatRate } from '../map/model';

export function SummaryPanel({ graph, sourceLabel, isPreview }: { graph: DependencyGraph; sourceLabel: string; isPreview: boolean }) {
  const summary = coverageSummary(graph);
  const { files, imports } = summary;
  return (
    <section className="summary" aria-label="Snapshot summary">
      <div className="summary-head">
        <p className="eyebrow">Boozer AI</p>
        <p className={isPreview ? 'source-label preview' : 'source-label'}>{sourceLabel}</p>
        <p className="snapshot-id" title={graph.snapshotId}>Snapshot {graph.snapshotId}</p>
      </div>
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
        <p className={summary.possiblyIncomplete ? 'status incomplete' : 'status'}>
          {summary.possiblyIncomplete ? 'Analysis possibly incomplete' : 'No coverage gaps recorded'}
        </p>
        <ul>
          {summary.limitations.map((line) => <li key={line}>{line}</li>)}
          <li>Static analysis only: relationships are potential, not proof of runtime behavior.</li>
        </ul>
      </div>
    </section>
  );
}
