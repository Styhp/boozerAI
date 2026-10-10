import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RepoChatPanel } from '../src/client/components/RepoChatPanel';
import { Ribbon } from '../src/client/workspace/Ribbon';
import type { ChatState } from '../src/client/data/repo-chat-controller';
import { loadExpectedGraph } from './support/fixture-snapshot.js';
const graph = loadExpectedGraph();
const noop = () => undefined;
const render = (state: ChatState = { turns: [], running: false }) => renderToStaticMarkup(<RepoChatPanel graph={graph}
  chat={{ state, onAsk: noop, onCancel: noop, onClear: noop }} contextPath="pricing.ts" onSelect={noop} />);

describe('repo chat panel', () => {
  it('offers an explicit cloud choice while keeping local selected and nothing sent', () => {
    const html = renderToStaticMarkup(<RepoChatPanel graph={graph} contextPath={null} onSelect={noop}
      chat={{ state: { turns: [], running: false }, onAsk: noop, onCancel: noop, onClear: noop,
        cloud: { preview: async () => { throw new Error('Rendering must not preview or send.'); }, send: () => { throw new Error('Rendering must not send.'); } } }} />);
    expect(html).toContain('value="local" selected=""');
    expect(html).toContain('OpenAI (preview and send)');
    expect(html).not.toContain('>Send to OpenAI</button>');
    expect(html).toContain('nothing sent online');
  });
  it('offers local questions, bounded composition, explicit file context and counted missing analysis', () => {
    const html = render();
    for (const label of ['<h2>Chat Boozer</h2>', 'nothing sent online', '2 files skipped', '3 imports not followed',
      'Your question', 'maxLength="600"', '>Chat Boozer</button>', 'Include selected file:', 'pricing.ts', 'latest eight']) expect(html).toContain(label);
    expect(html).not.toContain('OpenAI');
  });
  it('shows Cancel and escapes question/model text rather than rendering executable markup', () => {
    const html = render({ turns: [{ id: 1, question: '<img src=x onerror=evil()>', answer: { status: 'running', text: '<script>evil()</script>', snippets: [] } }], running: true });
    expect(html).toContain('Cancel answer'); expect(html).toContain('up to six minutes');
    expect(html).toContain('&lt;img'); expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>'); expect(html).not.toContain('type="submit"');
  });
  it('offers a chat ribbon action only for a real chat source', () => {
    const base = { sideOpen: true, side: 'files' as const, onSide: noop, onOverview: noop };
    expect(renderToStaticMarkup(<Ribbon {...base} />)).not.toContain('Chat Boozer');
    const html = renderToStaticMarkup(<Ribbon {...base} onChat={noop} chatOpen />);
    expect(html).toContain('aria-label="Chat Boozer" aria-pressed="true"');
  });
});
