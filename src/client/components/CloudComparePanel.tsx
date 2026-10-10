import { useEffect, useRef, useState } from 'react';
import type { FilePath } from '../../shared/contracts';
import type { CloudPreview, CloudStatus } from '../../shared/explanation';
import type { Selection } from '../map/model';
import { ExplanationResult, type ExplanationState } from './ExplanationPanel';
import { CloudModelPicker } from './CloudModelPicker';

// P-16: optional, per-request cloud comparison. Nothing leaves the machine until the user
// has seen the exact request body and pressed Send. It never runs on its own, and it is
// never offered as a fallback when the local model fails.

export type CloudPreviewState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'loading' }
  | { readonly phase: 'ready'; readonly preview: CloudPreview }
  | { readonly phase: 'failed'; readonly message: string };

export function CloudComparePanel({ path, status, answer, onPreview, onSend, onCancel, onSelect, loadModels, initialPreview = { phase: 'idle' } }: {
  path: FilePath;
  status: Extract<CloudStatus, { available: true }>;
  answer: ExplanationState;
  onPreview: (model?: string) => Promise<CloudPreview>;
  onSend: (previewHash: string, model?: string) => void;
  loadModels?: ((signal: AbortSignal) => Promise<readonly string[]>) | undefined;
  onCancel: () => void;
  onSelect: (selection: Selection) => void;
  initialPreview?: CloudPreviewState;
}) {
  const [preview, setPreview] = useState<CloudPreviewState>(initialPreview);
  const [model, setModel] = useState('');
  const revision = useRef(0);
  useEffect(() => () => { revision.current++; }, []);
  const running = answer.status === 'running';

  const requestPreview = () => {
    const current = ++revision.current;
    setPreview({ phase: 'loading' });
    onPreview(model || undefined).then(
      (result) => { if (revision.current === current) setPreview({ phase: 'ready', preview: result }); },
      (error: unknown) => { if (revision.current === current) setPreview({ phase: 'failed', message: error instanceof Error ? error.message : 'The preview failed.' }); },
    );
  };

  return (
    <section className="explanation cloud" aria-label="Cloud comparison" data-phase={preview.phase}>
      <h3>Compare with cloud (optional)</h3>
      <p className="muted small">
        Uses the internet. Code from this project leaves your machine only after you check the exact request below and
        press Send. It is never used automatically, and never as a fallback for the local model.
      </p>

      <CloudModelPicker model={model} defaultModel={status.model} disabled={running} loadModels={loadModels}
        onChange={(value) => { revision.current++; setModel(value); setPreview({ phase: 'idle' }); }} />

      {preview.phase !== 'ready' && !running && (
        <div className="explain-bar">
          <button type="button" onClick={requestPreview} disabled={preview.phase === 'loading'}>
            Preview request to {status.provider} ({model || status.model})
          </button>
          {preview.phase === 'failed' && <span className="notice error" role="status">{preview.message}</span>}
        </div>
      )}

      {preview.phase === 'ready' && (
        <div className="cloud-preview">
          <p>
            <strong>Not sent yet.</strong> Destination <code>{preview.preview.endpoint}</code>, provider {preview.preview.provider},
            model <code>{preview.preview.model}</code>. The API key stays on the server and is not shown or included below.
          </p>
          {preview.preview.suspectedInjections.length > 0 && (
            <p className="notice warning" role="status">
              <strong>Possible prompt injection</strong> in the code below:{' '}
              {preview.preview.suspectedInjections.map((s) => `${s.file}:${s.line}`).join(', ')}. The cloud model may follow it too.
            </p>
          )}
          <p className="muted small">Exact request body ({new TextEncoder().encode(preview.preview.payloadJson).length} bytes):</p>
          <pre className="payload">{preview.preview.payloadJson}</pre>
          <div className="explain-bar">
            <button type="button" onClick={() => { onSend(preview.preview.previewHash, preview.preview.model); setPreview({ phase: 'idle' }); }}>
              Send to {preview.preview.provider}
            </button>
            <button type="button" className="secondary" onClick={() => setPreview({ phase: 'idle' })}>Discard</button>
          </div>
        </div>
      )}

      {running && (
        <div className="explain-bar">
          <button type="button" onClick={onCancel}>Cancel</button>
          <span className="muted" role="status">Waiting for {status.provider}…</span>
        </div>
      )}
      <ExplanationResult path={path} state={answer} onSelect={onSelect} />
    </section>
  );
}
