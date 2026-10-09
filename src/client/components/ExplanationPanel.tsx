import type { EvidenceRef, Explanation, FilePath, Snippet } from '../../shared/contracts';
import type { ExplanationDetails, ExplanationErrorCode } from '../../shared/explanation';
import { formatExplanation, type Inline } from '../explain/format';
import type { Selection } from '../map/model';

export type ExplanationState =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly snippets: readonly Snippet[]; readonly text: string }
  | { readonly status: 'done'; readonly explanation: Explanation; readonly details: ExplanationDetails }
  | { readonly status: 'error'; readonly code: ExplanationErrorCode; readonly message: string; readonly snippets: readonly Snippet[]; readonly text: string };

const ERROR_TITLES: Record<ExplanationErrorCode, string> = {
  'invalid-selection': 'This file cannot be explained',
  'no-excerpt': 'No excerpt of this file fits the model\'s context',
  'stale-snapshot': 'The project changed since this map was built',
  'runtime-unavailable': 'Local model runtime not available',
  'model-missing': 'Approved local model not installed',
  'model-mismatch': 'Installed model is not the approved build',
  timeout: 'The local model took too long',
  cancelled: 'Explanation cancelled',
  'runtime-error': 'The local model failed',
  'cloud-unavailable': 'No cloud provider is configured',
  'preview-mismatch': 'The request changed after your preview',
  'cloud-error': 'The cloud provider failed',
};

const rangeLabel = (ref: EvidenceRef) =>
  `${ref.file}:${ref.startLine}${ref.endLine !== ref.startLine ? `–${ref.endLine}` : ''}`;

function InlineView({ parts, snippets, path, onSelect }: {
  parts: readonly Inline[]; snippets: readonly Snippet[]; path: FilePath; onSelect: (s: Selection) => void;
}) {
  return (
    <>
      {parts.map((part, i) => {
        switch (part.kind) {
          case 'text': return <span key={i}>{part.text}</span>;
          case 'code': return <code key={i}>{part.text}</code>;
          case 'bold': return <strong key={i}>{part.text}</strong>;
          case 'citation': {
            const snippet = snippets.find((s) => s.id === part.id);
            return snippet ? (
              <button key={i} type="button" className="citation" title={rangeLabel(snippet.ref)}
                onClick={() => onSelect({ kind: 'range', ref: snippet.ref, returnTo: path })}>[{part.id}]</button>
            ) : <span key={i} className="citation invalid" title="Unknown citation: no snippet with this ID was sent">[{part.id}]?</span>;
          }
          case 'mention': {
            const label = part.code ? <code>{part.text}</code> : part.text;
            const target = part.mention.path;
            return part.mention.status === 'linked' && target !== undefined ? (
              <button key={i} type="button" className="link mention" onClick={() => onSelect({ kind: 'file', path: target })}>{label}</button>
            ) : (
              <span key={i} className={`mention ${part.mention.status}`}
                title={part.mention.status === 'not-indexed' ? 'In the project but not indexed as source'
                  : part.mention.status === 'ambiguous' ? 'Several indexed files have this name' : 'No file with this path in the snapshot'}>
                {label}?
              </span>
            );
          }
        }
      })}
    </>
  );
}

function SnippetList({ snippets, path, onSelect }: { snippets: readonly Snippet[]; path: FilePath; onSelect: (s: Selection) => void }) {
  return (
    <details className="snippets">
      <summary>Code the AI was shown ({snippets.length})</summary>
      <p className="hint">The AI saw only these excerpts. Each [S#] link in the answer points to one of them.</p>
      <ol>
        {snippets.map((s) => (
          <li key={s.id} id={`snippet-${s.id}`}>
            <button type="button" className="link" onClick={() => onSelect({ kind: 'range', ref: s.ref, returnTo: path })}>
              [{s.id}] {rangeLabel(s.ref)}
            </button>{' '}
            <span className="muted">{s.reason}</span>
            <pre>{s.text}</pre>
          </li>
        ))}
      </ol>
    </details>
  );
}

export function ExplanationPanel({ path, state, onExplain, onCancel, onSelect }: {
  path: FilePath;
  state: ExplanationState;
  onExplain: () => void;
  onCancel: () => void;
  onSelect: (selection: Selection) => void;
}) {
  const running = state.status === 'running';
  return (
    <section className="explanation" aria-label="Local explanation" data-state={state.status}>
      <div className="explain-bar">
        {running
          ? <button type="button" onClick={onCancel}>Cancel</button>
          : <button type="button" onClick={onExplain} title="Runs the approved AI model on this computer; nothing is sent online">
            {state.status === 'idle' ? 'Explain in plain English' : 'Explain again'}</button>}
        {running && <span className="muted" role="status">The AI on this computer is writing… this can take up to six minutes. You can cancel at any time.</span>}
      </div>
      <ExplanationResult path={path} state={state} onSelect={onSelect} />
    </section>
  );
}

// The answer, its labels, checks and snippets. Shared by the local panel and the optional
// cloud comparison so both answers are shown and checked the same way.
export function ExplanationResult({ path, state, onSelect }: {
  path: FilePath;
  state: ExplanationState;
  onSelect: (selection: Selection) => void;
}) {
  const text = state.status === 'done' ? state.explanation.text : state.status === 'idle' ? '' : state.text;
  const snippets = state.status === 'done' ? state.explanation.snippets : state.status === 'idle' ? [] : state.snippets;
  const mentions = state.status === 'done' ? state.details.mentions : [];
  const blocks = formatExplanation(text, mentions);

  return (
    <>
      {state.status === 'done' && (
        <p className="model-labels">
          <span className="badge">{state.explanation.model.name}</span>{' '}
          <span className="badge">{state.explanation.model.runtime}</span>{' '}
          <span className={`badge ${state.explanation.model.location}`}>{state.explanation.model.location}</span>{' '}
          <span className="badge">{(state.explanation.durationMs / 1000).toFixed(1)} s</span>
        </p>
      )}
      {state.status === 'error' && (
        <p className="notice error" role="status"><strong>{ERROR_TITLES[state.code]}.</strong> {state.message}</p>
      )}

      {blocks.length > 0 && (
        <div className="explanation-text">
          {blocks.map((block, i) => (block.kind === 'paragraph'
            ? <p key={i}><InlineView parts={block.inline} snippets={snippets} path={path} onSelect={onSelect} /></p>
            : <ul key={i}>{block.items.map((item, j) => <li key={j}><InlineView parts={item} snippets={snippets} path={path} onSelect={onSelect} /></li>)}</ul>))}
        </div>
      )}

      {state.status === 'done' && state.details.suspectedInjections.length > 0 && (
        <div className="notice warning" role="status">
          <strong>Possible prompt injection.</strong> The code shown to the AI contains text that looks aimed at AI
          tools, and the AI may have followed it instead of just explaining. Check the answer against the source:{' '}
          {state.details.suspectedInjections.map((s, i) => {
            const snippet = snippets.find((candidate) => candidate.id === s.snippetId);
            return (
              <span key={`${s.snippetId}:${s.line}`}>
                {i > 0 && ', '}
                {snippet
                  ? <button type="button" className="link" onClick={() => onSelect({ kind: 'range', ref: { ...snippet.ref, startLine: s.line, endLine: s.line }, returnTo: path })}>{s.file}:{s.line}</button>
                  : `${s.file}:${s.line}`}
              </span>
            );
          })}
        </div>
      )}
      {state.status === 'done' && (() => {
        const invalid = state.explanation.citations.filter((c) => !c.valid).length;
        const unknown = state.details.mentions.filter((m) => m.status !== 'linked');
        return (
          <ul className="checks">
            <li>{state.explanation.citations.length} source links like [S1], {invalid === 0 ? 'all pointing to code the AI was shown' : `${invalid} unknown (flagged with ?)`}.</li>
            {unknown.length > 0 && <li className="warning">File names not found as indexed source: {unknown.map((m) => m.text).join(', ')}.</li>}
            {state.details.truncated && <li className="warning">The answer reached the output limit and may be cut short.</li>}
            {state.details.thinkingSeen && <li className="warning">The model produced thinking text despite thinking being off (not shown).</li>}
            <li className="muted">A source link shows where a claim came from. It does not prove the claim is correct, so check the code when it matters.</li>
          </ul>
        );
      })()}

      {snippets.length > 0 && <SnippetList snippets={snippets} path={path} onSelect={onSelect} />}
    </>
  );
}
