import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CloudComparePanel } from '../src/client/components/CloudComparePanel.js';
import { DetailPane } from '../src/client/components/DetailPane.js';
import type { ExplanationState } from '../src/client/components/ExplanationPanel.js';
import type { CloudPreview } from '../src/shared/explanation.js';
import { loadExpectedGraph } from './support/fixture-snapshot.js';

const graph = loadExpectedGraph();
const noop = () => undefined;
const status = { available: true as const, provider: 'OpenAI' as const, model: 'gpt-6-luna', endpoint: 'https://api.openai.com/v1/chat/completions' };
const payloadJson = '{"model":"gpt-6-luna","messages":[{"role":"user","content":"<snippet id=\\"S1\\">x</snippet>"}]}';
const preview: CloudPreview = {
  provider: 'OpenAI', endpoint: status.endpoint, model: status.model, payload: JSON.parse(payloadJson), payloadJson,
  previewHash: 'a'.repeat(64), suspectedInjections: [{ snippetId: 'S1', file: 'pricing.ts', line: 5 }],
};
const render = (answer: ExplanationState = { status: 'idle' }, initialPreview?: Parameters<typeof CloudComparePanel>[0]['initialPreview']) =>
  renderToStaticMarkup(<CloudComparePanel path="pricing.ts" status={status} answer={answer}
    onPreview={async () => preview} onSend={noop} onCancel={noop} onSelect={noop} {...(initialPreview ? { initialPreview } : {})} />);

describe('cloud comparison panel (P-16)', () => {
  it('starts with only an opt-in preview action and an internet disclaimer', () => {
    const html = render();
    expect(html).toContain('Preview request to OpenAI (gpt-6-luna)');
    expect(html).toContain('Uses the internet');
    expect(html).toContain('never as a fallback for the local model');
    expect(html).not.toContain('Send to OpenAI');
    expect(html).not.toContain('class="payload"');
  });

  it('shows the exact request body, escaped, before anything is sent', () => {
    const html = render({ status: 'idle' }, { phase: 'ready', preview });
    expect(html).toContain('Not sent yet.');
    expect(html).toContain('https://api.openai.com/v1/chat/completions');
    expect(html).toContain('&lt;snippet id=\\&quot;S1\\&quot;&gt;x&lt;/snippet&gt;');
    expect(html).toContain(`Exact request body (${new TextEncoder().encode(payloadJson).length} bytes)`);
    expect(html).toContain('Possible prompt injection');
    expect(html).toContain('Send to OpenAI');
    expect(html).toContain('Discard');
    expect(html).toContain('The API key stays on the server');
  });

  it('labels a cloud answer with location cloud and the model the provider reported', () => {
    const html = render({
      status: 'done',
      explanation: {
        text: 'It doubles prices [S1].', snippets: [],
        citations: [{ marker: '[S1]', valid: false }],
        model: { runtime: 'OpenAI API', name: 'gpt-6-luna-2026-09-15', location: 'cloud' }, durationMs: 4200,
      },
      details: {
        promptVersion: 'explain-v3', modelDigest: null, runtimeVersion: 'OpenAI Chat Completions', promptTokens: 500, outputTokens: 120,
        truncated: false, thinkingSeen: false, mentions: [], suspectedInjections: [],
      },
    });
    expect(html).toContain('class="badge cloud">cloud<');
    expect(html).toContain('gpt-6-luna-2026-09-15');
    expect(html).toContain('OpenAI API');
  });

  it('is absent unless the server offers a cloud provider', () => {
    const html = renderToStaticMarkup(<DetailPane graph={graph} selection={{ kind: 'file', path: 'pricing.ts' }}
      source={{ status: 'loading', path: 'pricing.ts' }} onSelect={noop}
      explanation={{ state: { status: 'idle' }, onExplain: noop, onCancel: noop }} />);
    expect(html).toContain('Explain with local model');
    expect(html).not.toContain('Compare with cloud');
  });
});
