import { useEffect, useRef, useState } from 'react';
import type { CloudChatRequest, CloudChatSend } from '../../shared/cloud-chat';
import type { CloudPreview } from '../../shared/explanation';

export interface CloudChatControls {
  readonly defaultModel?: string | undefined;
  models?(signal: AbortSignal): Promise<readonly string[]>;
  preview(question: string, contextPath: string | undefined, searchDocs: boolean, signal: AbortSignal, model?: string): Promise<{ request: CloudChatRequest; preview: CloudPreview }>;
  send(request: CloudChatSend): void;
}

// The parent keys this component by every draft field and transcript revision. An
// edited draft or switched project discards consent and ignores late previews.
export function CloudChatPreview({ controls, question, contextPath, searchDocs, model, onSent }: {
  controls: CloudChatControls; question: string; contextPath: string | undefined; searchDocs: boolean; model?: string | undefined; onSent(): void;
}) {
  const [state, setState] = useState<{ phase: 'idle' | 'loading' | 'failed'; message?: string }
    | { phase: 'ready'; request: CloudChatRequest; preview: CloudPreview }>({ phase: 'idle' });
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); }, []);
  const prepare = () => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setState({ phase: 'loading' });
    controls.preview(question, contextPath, searchDocs, controller.signal, model).then(
      (ready) => { if (!controller.signal.aborted) setState({ phase: 'ready', ...ready }); },
      (error: unknown) => { if (!controller.signal.aborted) setState({ phase: 'failed', message: error instanceof Error ? error.message : 'Preview failed.' }); },
    );
  };
  return <section className="cloud-preview" aria-label="OpenAI chat preview">
    <p className="muted">OpenAI inspects the excerpts below and can propose changes. It cannot edit files or run a coding agent. Uses internet and your API account.</p>
    {searchDocs && <p className="muted">Includes live search of official OpenAI documentation. Search terms may be derived from this request; web search may add API charges.</p>}
    {state.phase !== 'ready' && <button type="button" disabled={!question.trim() || state.phase === 'loading'} onClick={prepare}>
      {state.phase === 'loading' ? 'Preparing preview…' : 'Preview OpenAI request'}</button>}
    {state.phase === 'failed' && <p className="notice error" role="status">{state.message}</p>}
    {state.phase === 'ready' && <>
      <p><strong>Not sent yet.</strong> Check the question, excerpts and settings. Destination <code>{state.preview.endpoint}</code>, model <code>{state.preview.model}</code>.</p>
      {state.preview.suspectedInjections.length > 0 && <p className="notice warning">Possible prompt injection in the selected evidence: {state.preview.suspectedInjections.map((s) => `${s.file}:${s.line}`).join(', ')}. A cloud model may follow it too.</p>}
      <details open><summary>Exact outgoing request ({new TextEncoder().encode(state.preview.payloadJson).length} bytes)</summary><pre className="payload">{state.preview.payloadJson}</pre></details>
      <button type="button" onClick={() => { controls.send({ ...state.request, previewHash: state.preview.previewHash }); setState({ phase: 'idle' }); onSent(); }}>Send to OpenAI</button>{' '}
      <button type="button" className="secondary" onClick={() => setState({ phase: 'idle' })}>Discard</button>
    </>}
  </section>;
}
