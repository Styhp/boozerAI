import { useEffect, useRef } from 'react';
import type { DependencyEdge, DependencyGraph } from '../../shared/contracts';
import type { CloudPreview, CloudStatus } from '../../shared/explanation';
import { CloudComparePanel } from './CloudComparePanel';
import { ExplanationPanel, type ExplanationState } from './ExplanationPanel';
import { ImpactPanel } from './ImpactPanel';
import { NotesPanel } from './NotesPanel';
import type { NotesSource } from '../data/project-source';
import { describeTarget, findEdge, findFile, referenceState, sourceLines, type Selection, type SourceState } from '../map/model';

function EvidenceLink({ edge, onSelect }: { edge: DependencyEdge; onSelect: (s: Selection) => void }) {
  return (
    <button type="button" className="link" onClick={() => onSelect({ kind: 'edge', id: edge.id })}>
      {edge.from}:{edge.evidence.startLine}{edge.evidence.endLine !== edge.evidence.startLine ? `–${edge.evidence.endLine}` : ''}
    </button>
  );
}

function SourceView({ text, highlight }: { text: string; highlight: { start: number; end: number } | null }) {
  const first = useRef<HTMLLIElement>(null);
  useEffect(() => { first.current?.scrollIntoView?.({ block: 'center' }); }, [text, highlight?.start]);
  return (
    // React renders text nodes, so source is always escaped; no HTML is interpreted.
    <ol className="source" aria-label="Source">
      {sourceLines(text).map((line, index) => {
        const number = index + 1;
        const marked = highlight !== null && number >= highlight.start && number <= highlight.end;
        return (
          <li key={number} ref={marked && number === highlight!.start ? first : undefined}
            className={marked ? 'line evidence' : 'line'} data-line={number}>
            <span className="line-number" aria-hidden="true">{number}</span>
            <code>{line === '' ? ' ' : line}</code>
          </li>
        );
      })}
    </ol>
  );
}

export interface ExplanationControls {
  readonly state: ExplanationState;
  readonly onExplain: () => void;
  readonly onCancel: () => void;
  // P-16, present only when the server offers a cloud comparison.
  readonly cloud?: {
    readonly status: Extract<CloudStatus, { available: true }>;
    readonly answer: ExplanationState;
    readonly onPreview: () => Promise<CloudPreview>;
    readonly onSend: (previewHash: string) => void;
    readonly onCancel: () => void;
  } | undefined;
}

export function DetailPane({ graph, selection, source, onSelect, explanation, notes }: {
  graph: DependencyGraph;
  selection: Selection | null;
  source: SourceState;
  onSelect: (selection: Selection) => void;
  explanation?: ExplanationControls | undefined;
  // Project notes (phase 1); absent for the fixture preview.
  notes?: NotesSource | undefined;
}) {
  if (selection === null) {
    return <aside className="detail" data-state="empty"><p className="muted">Select a file or relationship to inspect its source.</p></aside>;
  }

  if (selection.kind === 'terminal') {
    const edges = graph.edges.filter((edge) => {
      const t = edge.target;
      return (t.type === 'package' && selection.nodeId === `package:${t.name}`) ||
        (t.type !== 'file' && selection.nodeId === `${t.type}:${edge.id}`);
    });
    const first = edges[0];
    if (first === undefined) return <aside className="detail" data-state="missing"><p>This item is not in the current graph.</p></aside>;
    const target = describeTarget(first);
    return (
      <aside className="detail" data-state="terminal">
        <h2>{target.label}</h2>
        <p className={`badge kind-${first.target.type}`}>{target.reason}</p>
        <p>Imported by {edges.length === 1 ? 'one statement' : `${edges.length} statements`}. Boozer never reads package or excluded file contents.</p>
        <ul>{edges.map((edge) => <li key={edge.id}><EvidenceLink edge={edge} onSelect={onSelect} /> <code>{edge.specifier}</code></li>)}</ul>
      </aside>
    );
  }

  const edge = selection.kind === 'edge' ? findEdge(graph, selection.id) : undefined;
  // A cited range is evidence like an edge's: highlighted only while it matches the source.
  const evidence = selection.kind === 'range' ? selection.ref : edge?.evidence;
  const path = selection.kind === 'file' ? selection.path : selection.kind === 'range' ? selection.ref.file : edge?.from;
  const file = path === undefined ? undefined : findFile(graph, path);
  if (file === undefined) return <aside className="detail" data-state="missing"><p>This item is not in the current graph.</p></aside>;

  const header = (
    <header>
      <h2>{file.path}</h2>
      {edge && (
        <p className="relationship">
          <span className={`badge kind-${edge.target.type}`}>{edge.kind}</span>{' '}
          <code>{edge.specifier}</code> → {describeTarget(edge).label}
          {describeTarget(edge).reason && <span className="muted"> ({describeTarget(edge).reason})</span>}
        </p>
      )}
      {file.parse.status === 'error' && (
        <p className="notice error" role="status">Parse error: this file contributed no relationships. Its source is shown as text.</p>
      )}
      {selection.kind === 'range' && (
        <p className="relationship">
          Cited lines {selection.ref.startLine}–{selection.ref.endLine}
          {selection.returnTo !== undefined && (
            <>{' · '}<button type="button" className="link" onClick={() => onSelect({ kind: 'file', path: selection.returnTo! })}>
              Back to the explanation of {selection.returnTo}</button></>
          )}
        </p>
      )}
      {selection.kind === 'file' && explanation !== undefined && (
        <ExplanationPanel path={file.path} state={explanation.state} onExplain={explanation.onExplain}
          onCancel={explanation.onCancel} onSelect={onSelect} />
      )}
      {selection.kind === 'file' && explanation?.cloud !== undefined && (
        <CloudComparePanel key={file.path} path={file.path} status={explanation.cloud.status} answer={explanation.cloud.answer}
          onPreview={explanation.cloud.onPreview} onSend={explanation.cloud.onSend} onCancel={explanation.cloud.onCancel} onSelect={onSelect} />
      )}
      {selection.kind === 'file' && <ImpactPanel key={file.path} graph={graph} path={file.path} onSelect={onSelect} />}
      {selection.kind === 'file' && notes !== undefined && <NotesPanel key={file.path} notes={notes} graph={graph} path={file.path} onSelect={onSelect} />}
    </header>
  );

  if (source.status === 'loading' || source.status === 'idle' || (source.status === 'loaded' && source.source.path !== file.path)) {
    return <aside className="detail" data-state="loading">{header}<p className="muted">Loading source…</p></aside>;
  }
  if (source.status === 'failed') {
    return <aside className="detail" data-state="failed">{header}<p className="notice error" role="status">Source unavailable: {source.message}</p></aside>;
  }

  const stale = evidence !== undefined && referenceState(evidence, source.source) === 'stale';
  const highlight = evidence !== undefined && !stale ? { start: evidence.startLine, end: evidence.endLine } : null;
  return (
    <aside className="detail" data-state={stale ? 'stale' : file.parse.status === 'error' ? 'parse-error' : 'source'}>
      {header}
      {stale && (
        <p className="notice warning" role="status">
          Stale reference: this was recorded against different file contents, so no lines are highlighted.
        </p>
      )}
      <SourceView text={source.source.text} highlight={highlight} />
    </aside>
  );
}
