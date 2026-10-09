import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DetailPane } from '../src/client/components/DetailPane.js';
import { ExplanationPanel, type ExplanationState } from '../src/client/components/ExplanationPanel.js';
import { readExplanationEvents } from '../src/client/data/explanation-stream.js';
import { formatExplanation, formatInline } from '../src/client/explain/format.js';
import type { Snippet } from '../src/shared/contracts.js';
import type { ExplanationEvent } from '../src/shared/explanation.js';
import { loadExpectedGraph, loadFixtureSnapshot } from './support/fixture-snapshot.js';

const graph = loadExpectedGraph();
const snapshot = loadFixtureSnapshot();
const noop = () => undefined;
const pricing = snapshot.files.find((f) => f.path === 'pricing.ts')!;
const snippets: Snippet[] = [{
  id: 'S1', reason: 'selected file', text: pricing.text.split('\n').slice(0, 2).join('\n'),
  ref: { snapshotId: graph.snapshotId, file: 'pricing.ts', startLine: 1, endLine: 2, contentHash: pricing.contentHash },
}];
const panel = (state: ExplanationState) => renderToStaticMarkup(
  <ExplanationPanel path="pricing.ts" state={state} onExplain={noop} onCancel={noop} onSelect={noop} />);

describe('safe explanation formatting', () => {
  it('renders only paragraphs, bullets, inline code, bold, citations and file mentions', () => {
    expect(formatExplanation('First line\ncontinues [S1].\n\n- one `a`\n- **two** [S2, S9]\nAfter.')).toEqual([
      { kind: 'paragraph', inline: [{ kind: 'text', text: 'First line continues ' }, { kind: 'citation', id: 'S1' }, { kind: 'text', text: '.' }] },
      { kind: 'list', items: [
        [{ kind: 'text', text: 'one ' }, { kind: 'code', text: 'a' }],
        [{ kind: 'bold', text: 'two' }, { kind: 'text', text: ' ' }, { kind: 'citation', id: 'S2' }, { kind: 'citation', id: 'S9' }],
      ] },
      { kind: 'paragraph', inline: [{ kind: 'text', text: 'After.' }] },
    ]);
  });

  it('turns validated file names into mentions, inside or outside code', () => {
    const mentions = [{ text: 'inventory.ts', status: 'linked' as const, path: 'inventory.ts' }, { text: 'nope.ts', status: 'unknown' as const }];
    expect(formatInline('uses `inventory.ts` and nope.ts', mentions)).toEqual([
      { kind: 'text', text: 'uses ' },
      { kind: 'mention', text: 'inventory.ts', mention: mentions[0], code: true },
      { kind: 'text', text: ' and ' },
      { kind: 'mention', text: 'nope.ts', mention: mentions[1], code: false },
    ]);
  });
});

describe('explanation panel', () => {
  const done: ExplanationState = {
    status: 'done',
    explanation: {
      text: 'It prices items [S1]. See inventory.ts and ghost.ts [S4].\n<img src=x onerror=alert(1)> # Heading [link](http://x)',
      snippets,
      citations: [{ marker: '[S1]', snippetId: 'S1', valid: true }, { marker: '[S4]', valid: false }],
      model: { runtime: 'Ollama 0.40.2', name: 'qwen3:4b-instruct', location: 'local' },
      durationMs: 41_234,
    },
    details: {
      promptVersion: 'explain-v1', modelDigest: 'd', runtimeVersion: '0.40.2', promptTokens: 480, outputTokens: 120,
      truncated: false, thinkingSeen: false,
      mentions: [{ text: 'inventory.ts', status: 'linked', path: 'inventory.ts' }, { text: 'ghost.ts', status: 'unknown' }],
      suspectedInjections: [],
    },
  };

  it('labels model, runtime, local and duration, and keeps the sent snippets visible', () => {
    const html = panel(done);
    for (const label of ['qwen3:4b-instruct', 'Ollama 0.40.2', '>local<', '41.2 s', 'Code the AI was shown (1)', '[S1] pricing.ts:1–2']) {
      expect(html).toContain(label);
    }
  });

  it('links valid citations and flags unknown citations and file names', () => {
    const html = panel(done);
    expect(html).toContain('class="citation" title="pricing.ts:1–2">[S1]</button>');
    expect(html).toContain('class="citation invalid"');
    expect(html).toContain('[S4]?');
    expect(html).toContain('class="mention unknown"');
    expect(html).toContain('2 source links like [S1], 1 unknown (flagged with ?)');
    expect(html).toContain('File names not found as indexed source: ghost.ts');
    expect(html).toContain('does not prove the claim is correct');
  });

  it('warns where the sent code contains text addressed to AI tools, and stays quiet otherwise', () => {
    expect(panel(done)).not.toContain('Possible prompt injection');
    if (done.status !== 'done') throw new Error('fixture state');
    const warned = panel({ ...done, details: { ...done.details, suspectedInjections: [{ snippetId: 'S1', file: 'pricing.ts', line: 5 }] } });
    expect(warned).toContain('Possible prompt injection');
    expect(warned).toContain('pricing.ts:5');
  });

  it('escapes everything outside the safe subset', () => {
    const html = panel(done);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<a ');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; # Heading [link](http://x)');
  });

  it('shows clear states for idle, running and a missing runtime, with no invented answer', () => {
    expect(panel({ status: 'idle' })).toContain('Explain in plain English');
    const running = panel({ status: 'running', snippets, text: 'Partial' });
    expect(running).toContain('Cancel');
    expect(running).toContain('up to six minutes');
    const missing = panel({ status: 'error', code: 'runtime-unavailable', message: 'No local Ollama runtime is answering on 127.0.0.1:11434.', snippets: [], text: '' });
    expect(missing).toContain('Local model runtime not available');
    const noExcerpt = panel({ status: 'error', code: 'no-excerpt', message: 'No exact excerpt of this file fits the explanation budget (its first line is too long), so nothing was sent to the model.', snippets: [], text: '' });
    expect(noExcerpt).toContain('No excerpt of this file fits the model&#x27;s context');
    expect(noExcerpt).toContain('nothing was sent to the model');
    expect(missing).not.toContain('explanation-text');
  });

  it('opens a cited range with its lines highlighted and a way back', () => {
    const html = renderToStaticMarkup(<DetailPane graph={graph} selection={{ kind: 'range', ref: snippets[0]!.ref, returnTo: 'report.ts' }}
      source={{ status: 'loaded', source: { snapshotId: graph.snapshotId, path: 'pricing.ts', contentHash: pricing.contentHash, text: pricing.text } }}
      onSelect={noop} />);
    expect([...html.matchAll(/class="line evidence" data-line="(\d+)"/g)].map((m) => Number(m[1]))).toEqual([1, 2]);
    expect(html).toContain('Back to the explanation of report.ts');
  });
});

describe('NDJSON explanation stream', () => {
  const streamOf = (text: string) => new Response(text).body!;
  const collect = async (events: AsyncIterable<ExplanationEvent>) => { const all = []; for await (const e of events) all.push(e); return all; };

  it('reads events split across chunks and stops at the final event', async () => {
    const body = '{"type":"snippets","snippets":[]}\n{"type":"token","text":"Hi"}\n{"type":"error","code":"timeout","message":"slow"}\n{"type":"token","text":"late"}\n';
    expect(await collect(readExplanationEvents(streamOf(body)))).toEqual([
      { type: 'snippets', snippets: [] }, { type: 'token', text: 'Hi' }, { type: 'error', code: 'timeout', message: 'slow' },
    ]);
  });

  it('ends a truncated or malformed stream with an error, never a finished answer', async () => {
    expect((await collect(readExplanationEvents(streamOf('{"type":"token","text":"Hi"}\n')))).at(-1)).toMatchObject({ type: 'error', code: 'runtime-error' });
    expect((await collect(readExplanationEvents(streamOf('not json\n')))).at(-1)).toMatchObject({ type: 'error', code: 'runtime-error' });
  });
});

describe('client bundle boundary (N5)', () => {
  it('client code never imports the parser, resolver or server code', () => {
    const root = fileURLToPath(new URL('../src/client/', import.meta.url));
    const files = readdirSync(root, { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).map((d) => join(d.parentPath, d.name));
    for (const file of files) {
      const imports = [...readFileSync(file, 'utf8').matchAll(/from\s+'([^']+)'|import\('([^']+)'\)/g)].map((m) => m[1] ?? m[2]!);
      for (const spec of imports) expect(spec, file).not.toMatch(/extractor|resolver|\/server\/|^typescript$|^node:/);
    }
  });
});
