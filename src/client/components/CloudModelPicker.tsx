import { useEffect, useRef, useState } from 'react';

export function CloudModelPicker({ model, defaultModel, onChange, loadModels, disabled = false }: {
  model: string; defaultModel?: string | undefined; onChange(model: string): void;
  loadModels?: ((signal: AbortSignal) => Promise<readonly string[]>) | undefined; disabled?: boolean;
}) {
  const [models, setModels] = useState<readonly string[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'loaded' | 'failed'>('idle');
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const load = () => {
    if (!loadModels) return;
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setState('loading');
    loadModels(controller.signal).then(
      (value) => { if (!controller.signal.aborted) { setModels(value); setState('loaded'); } },
      () => { if (!controller.signal.aborted) setState('failed'); },
    );
  };
  return <div className="cloud-model-picker">
    <label>Cloud model <select aria-label="Cloud model" value={model} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      <option value="">{defaultModel ? `${defaultModel} (configured default)` : 'Configured default'}</option>
      {[...new Set([...models, ...(model ? [model] : [])])].map((id) => <option key={id} value={id}>{id}</option>)}
    </select></label>
    {loadModels && <><p className="muted small">Load models contacts api.openai.com/v1/models using your server key. No code or question is sent.</p>
      <button type="button" className="secondary" disabled={disabled || state === 'loading'} onClick={load}>{state === 'loading' ? 'Loading models…' : 'Load models from OpenAI'}</button></>}
    {state === 'loaded' && <p className="muted small" role="status">{models.length} models listed for this key. Listing does not guarantee chat or web-search support. Different models have different API costs.</p>}
    {state === 'failed' && <p className="notice error" role="status">Could not load models. Check API access and internet; your selection has not changed.</p>}
  </div>;
}
