import { useMemo, useState, type ReactNode } from 'react';
import type { DependencyGraph, FilePath } from '../../shared/contracts';
import { analyzeInsights } from '../../shared/insights';
import type { Selection } from '../map/model';
import './InsightsPanel.css';

const INITIAL_ROWS = 8;

function InsightList<T>({ entries, render }: { entries: readonly T[]; render: (entry: T) => ReactNode }) {
  const [all, setAll] = useState(false);
  const visible = all ? entries : entries.slice(0, INITIAL_ROWS);
  return <>
    <ol>{visible.map(render)}</ol>
    {entries.length > INITIAL_ROWS && <p className="small muted">
      Showing {visible.length} of {entries.length}.{' '}
      <button type="button" className="link" onClick={() => setAll(!all)}>{all ? 'Show fewer' : 'Show all'}</button>
    </p>}
  </>;
}

// Agent B mounts this with the current snapshot graph and the shared selection callback.
export function InsightsPanel({ graph, onSelect }: { graph: DependencyGraph; onSelect: (selection: Selection) => void }) {
  const result = useMemo(() => {
    try { return analyzeInsights(graph); } catch { return null; }
  }, [graph]);
  if (result === null) return <section className="insights" aria-label="Reading insights">
    <p className="notice error" role="status">Reading insights could not be calculated for this snapshot.</p>
  </section>;
  const fileLink = (path: FilePath) => <button type="button" className="link" data-file={path}
    onClick={() => onSelect({ kind: 'file', path })}>{path}</button>;
  const { files, imports, unsupported } = result.coverage;
  return <details className="insights" data-snapshot-id={result.snapshotId}>
    <summary>Reading insights ({graph.files.length} indexed files)</summary>
    <div className="insight-groups">
      <p className="small muted">Calculated from the full snapshot. Counts use distinct direct importing files, including type and self imports.</p>
      {result.possiblyIncomplete && <p className="notice warning" role="status">
        Possibly incomplete. Skipped files: {files.skipped}; pruned directories: {files.prunedDirectories.length};{' '}
        excluded imports: {imports.excluded}; unresolved imports: {imports.failed}; unsupported patterns: {unsupported.length}.
      </p>}
      <details open>
        <summary>Where to start reading ({result.readingStarts.length})</summary>
        {result.readingStarts.length === 0 ? <p className="muted">No files with zero known importers in this snapshot.</p>
          : <>
            <p className="small muted">No importers found by static analysis. These files can be starting points for reading this snapshot.</p>
            <InsightList key={`${result.snapshotId}:starts`} entries={result.readingStarts} render={(path) => <li key={path}>{fileLink(path)}</li>} />
          </>}
      </details>
      <details>
        <summary>Most-imported files ({result.mostImported.length})</summary>
        {result.mostImported.length === 0 ? <p className="muted">No local file imports found by static analysis.</p>
          : <InsightList key={`${result.snapshotId}:rank`} entries={result.mostImported} render={(file) => <li key={file.path}>
            {fileLink(file.path)}{' '}<span className="badge">{file.importerCount} importing {file.importerCount === 1 ? 'file' : 'files'}</span>
            <details><summary className="small">Importing files</summary>
              <InsightList key={`${result.snapshotId}:${file.path}:importers`} entries={file.importers}
                render={(path) => <li key={path}>{fileLink(path)}</li>} />
            </details>
          </li>} />}
      </details>
      <details>
        <summary>Static import cycle groups ({result.cycles.length})</summary>
        <p className="small muted">Files in a group are mutually reachable through local imports. Type imports are included; static relationships may differ from runtime behavior.</p>
        {result.cycles.length === 0 ? <p className="muted">No import cycles found by static analysis.</p>
          : <InsightList key={`${result.snapshotId}:cycles`} entries={result.cycles} render={(group) => <li key={group.files[0]}>
            <p className="small">{group.files.length} {group.files.length === 1 ? 'file (self import)' : 'files'}, {group.edges.length} import {group.edges.length === 1 ? 'statement' : 'statements'}</p>
            <InsightList key={`${result.snapshotId}:${group.files[0]}:members`} entries={group.files}
              render={(path) => <li key={path}>{fileLink(path)}</li>} />
            <details><summary className="small">Import evidence</summary>
              <InsightList key={`${result.snapshotId}:${group.files[0]}:edges`} entries={group.edges} render={(edge) => <li key={edge.id}>
                <button type="button" className="link" data-edge={edge.id} onClick={() => onSelect({ kind: 'edge', id: edge.id })}>
                  {edge.evidence.file}:{edge.evidence.startLine}{edge.evidence.endLine === edge.evidence.startLine ? '' : `–${edge.evidence.endLine}`}
                </button>{' '}<span className="badge">{edge.kind}</span>{' → '}{edge.target.type === 'file' ? edge.target.path : ''}
              </li>} />
            </details>
          </li>} />}
      </details>
    </div>
  </details>;
}
