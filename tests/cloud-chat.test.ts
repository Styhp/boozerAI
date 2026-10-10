import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createOpenAIAdapter, OPENAI_RESPONSES_ENDPOINT } from '../src/server/explain/cloud-adapter.js';
import { createCloudRepoChatService, inspectCloudContext, CLOUD_CONTEXT_CHARS } from '../src/server/explain/cloud-chat-service.js';
import { isCloudChatRequest, isOfficialDocsUrl, OPENAI_DOC_DOMAINS } from '../src/shared/cloud-chat.js';
import type { ExplanationEvent } from '../src/shared/explanation.js';
import { extractDependencies } from '../src/shared/extractor.js';
import { loadFixtureSnapshot } from './support/fixture-snapshot.js';
import { RepoChatController } from '../src/client/data/repo-chat-controller';

// Inert fixture text and provider doubles. The offline suite prohibits network.
function fixture(dependency = 'react') {
  const base = loadFixtureSnapshot();
  const documents = Object.entries({ 'package.json': JSON.stringify({ engines: { node: '>=24 <25' }, dependencies: { [dependency]: '1.0.0' } }, null, 2),
    'README.md': '# Sample project\nA local pricing application.\nNo coding agent is implemented here.\n',
    'docs/ARCHITECTURE.md': '# Architecture\nThe application reads data and returns prices.\n' }).map(([path, text]) => ({ path, text,
      kind: path === 'package.json' ? 'manifest' as const : 'markdown' as const, sizeBytes: Buffer.byteLength(text), contentHash: createHash('sha256').update(text).digest('hex') }));
  const snapshot = { ...base, documents };
  const graph = extractDependencies(snapshot);
  const body = { snapshotId: snapshot.snapshotId, question: 'What if I add Codex here as coding agent, what are the prerequisites and how should I do it?', history: [], searchDocs: true };
  return { snapshot, graph, body };
}
const sse = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`;
const text = 'Labeled provider double. Repository [S1]. External guidance (source).';
function completed(url = 'https://learn.chatgpt.com/docs/codex-sdk') {
  return { type: 'response.completed', response: { model: 'reported-model-snapshot', usage: { input_tokens: 250, output_tokens: 60 },
    output: [{ type: 'message', content: [{ type: 'output_text', text, annotations: [
      { type: 'url_citation', start_index: text.indexOf('(source)'), end_index: text.length, url, title: 'Official Codex SDK' },
    ] }] }] } };
}
function provider(events: unknown[] = [ { type: 'response.output_text.delta', delta: text }, completed() ], status = 200) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(status !== 200 ? 'PRIVATE PROVIDER BODY' : events.map(sse).join(''), { status }));
  const adapter = createOpenAIAdapter({ apiKey: 'fake-cloud-chat-key', model: 'gpt-6-luna', fetch });
  return { fetch, adapter, service: createCloudRepoChatService(adapter) };
}
async function collect(events: AsyncIterable<ExplanationEvent>) { const out: ExplanationEvent[] = []; for await (const e of events) out.push(e); return out; }

describe('cloud repository inspection and consent', () => {
  it('previews hypothetical advice from actual repository evidence without calling a model', () => {
    const f = fixture(); const p = provider();
    const preview = p.service.previewCloudChat({ snapshot: f.snapshot, graph: f.graph, ...f.body });
    expect(preview.type).toBe('preview');
    if (preview.type !== 'preview') throw new Error('Expected preview.');
    const payload = JSON.parse(preview.preview.payloadJson);
    expect(payload).toMatchObject({ model: 'gpt-6-luna', store: false, stream: true, max_output_tokens: 2000, tool_choice: 'required' });
    expect(payload.tools[0].filters.allowed_domains).toEqual(OPENAI_DOC_DOMAINS);
    expect(payload.input[0].content).toContain('proposed changes/prerequisites');
    expect(payload.input[0].content).toContain('untrusted data');
    expect(payload.input[1].content).toContain('>=24 <25');
    expect(payload.input[1].content).toContain('package.json');
    expect(preview.preview.endpoint).toBe(OPENAI_RESPONSES_ENDPOINT);
    expect(JSON.stringify(preview)).not.toContain('fake-cloud-chat-key');
    expect(p.fetch).not.toHaveBeenCalled();
  });

  it('uses another repository\'s manifest and keeps original lines/hash within the larger budget', () => {
    const f = fixture('svelte');
    const snippets = inspectCloudContext(f.snapshot, f.graph, f.body);
    expect(snippets.map((s) => s.text).join('\n')).toContain('svelte');
    expect(snippets.map((s) => s.text).join('\n')).not.toContain('react');
    expect(snippets.length).toBeLessThanOrEqual(12);
    expect(snippets.reduce((n, s) => n + s.text.length, 0)).toBeLessThanOrEqual(CLOUD_CONTEXT_CHARS);
    for (const snippet of snippets) {
      const source = [...f.snapshot.files, ...f.snapshot.documents].find((file) => file.path === snippet.ref.file)!;
      expect(snippet.ref.contentHash).toBe(source.contentHash);
      expect(snippet.text).toBe(source.text.split('\n').slice(snippet.ref.startLine - 1, snippet.ref.endLine).join('\n'));
    }
    const changed = { ...f.graph, documents: [] };
    expect(inspectCloudContext(f.snapshot, changed, f.body).some((s) => s.ref.file === 'package.json')).toBe(false);
  });

  it('sends only the matching preview and returns repository and web citations separately', async () => {
    const f = fixture(); const p = provider();
    const request = { snapshot: f.snapshot, graph: f.graph, ...f.body }; const result = p.service.previewCloudChat(request);
    if (result.type !== 'preview') throw new Error('Expected preview.');
    for (const changes of [{ question: 'A changed question' }, { searchDocs: false }, { history: ['changed'] }, { contextPath: 'pricing.ts' }, { previewHash: '0'.repeat(64) }]) {
      expect((await collect(p.service.cloudChat({ ...request, previewHash: result.preview.previewHash, ...changes }))).at(-1)).toMatchObject({ type: 'error', code: 'preview-mismatch' });
    }
    expect(p.fetch).not.toHaveBeenCalled();
    const events = await collect(p.service.cloudChat({ ...request, previewHash: result.preview.previewHash }));
    expect(p.fetch).toHaveBeenCalledExactlyOnceWith(OPENAI_RESPONSES_ENDPOINT, expect.objectContaining({ body: result.preview.payloadJson, redirect: 'error' }));
    const done = events.at(-1)!;
    if (done.type !== 'done') throw new Error('Expected completion.');
    expect(done.explanation.text).toContain('[W1]');
    expect(done.explanation.citations).toEqual([{ marker: '[S1]', snippetId: 'S1', valid: true }]);
    expect(done.explanation.model).toMatchObject({ name: 'reported-model-snapshot', location: 'cloud' });
    expect(done.details.webCitations).toEqual([{ id: 'W1', title: 'Official Codex SDK', url: 'https://learn.chatgpt.com/docs/codex-sdk' }]);
    expect(done.details).toMatchObject({ searchedDocs: true, promptTokens: 250, outputTokens: 60 });
  });

  it('rejects unconfigured/stale/invalid/cancelled inputs before any provider call', async () => {
    const f = fixture(); const p = provider();
    for (const [change, code] of [[{ snapshotId: 'old' }, 'stale-snapshot'], [{ contextPath: '../private' }, 'invalid-selection'],
      [{ source: 'caller injected code' }, 'invalid-selection'], [{ signal: AbortSignal.abort() }, 'cancelled']] as const) {
      expect(p.service.previewCloudChat({ snapshot: f.snapshot, graph: f.graph, ...f.body, ...change })).toMatchObject({ type: 'error', code });
    }
    const unavailable = createCloudRepoChatService(createOpenAIAdapter({ apiKey: '', fetch: p.fetch }));
    expect(unavailable.previewCloudChat({ snapshot: f.snapshot, graph: f.graph, ...f.body })).toMatchObject({ type: 'error', code: 'cloud-unavailable' });
    expect(p.fetch).not.toHaveBeenCalled();
  });

  it('retains injection warnings without executing instructions or hiding evidence', () => {
    const f = fixture(); const p = provider();
    const result = p.service.previewCloudChat({ snapshot: f.snapshot, graph: f.graph, ...f.body, contextPath: 'pricing.ts' });
    if (result.type !== 'preview') throw new Error('Expected preview.');
    expect(result.preview.suspectedInjections.some((s) => s.file === 'pricing.ts')).toBe(true);
    expect(result.preview.payloadJson).toContain('BZR-CANARY-ORCHID-7731');
    expect(p.fetch).not.toHaveBeenCalled();
  });
});

describe('Responses streaming and failures', () => {
  it.each([403, 404, 429, 500])('reports HTTP %s without exposing raw provider data', async (status) => {
    const p = provider([], status); const f = fixture(); const request = { snapshot: f.snapshot, graph: f.graph, ...f.body };
    const preview = p.service.previewCloudChat(request); if (preview.type !== 'preview') throw new Error();
    const events = await collect(p.service.cloudChat({ ...request, previewHash: preview.preview.previewHash }));
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'cloud-error' });
    expect(JSON.stringify(events)).toContain(`HTTP ${status}`);
    expect(JSON.stringify(events)).not.toContain('PRIVATE PROVIDER BODY');
    expect(JSON.stringify(events)).not.toContain('fake-cloud-chat-key');
  });
  it('parses split frames and labels incomplete output', async () => {
    const event = { ...completed(), type: 'response.incomplete' };
    const bytes = new TextEncoder().encode(sse(event));
    const adapter = createOpenAIAdapter({ apiKey: 'fake', fetch: async () => new Response(new ReadableStream({ start(c) {
      for (let i = 0; i < bytes.length; i += 3) c.enqueue(bytes.slice(i, i + 3)); c.close();
    } })) });
    const chunks = []; for await (const chunk of adapter.streamAdvice!('{}')) chunks.push(chunk);
    expect(chunks.at(-1)).toMatchObject({ type: 'done', truncated: true, text: expect.stringContaining('[W1]') });
  });
  it('rejects incomplete/failed streams and unsafe documentation URLs', async () => {
    for (const events of [[], [{ type: 'response.failed' }]]) {
      await expect(async () => { for await (const _chunk of provider(events).adapter.streamAdvice!('{}')) { /* consume */ } }).rejects.toThrow();
    }
    for (const url of ['javascript:alert(1)', 'https://learn.chatgpt.com.evil.example/docs', 'http://learn.chatgpt.com/docs', 'https://user@learn.chatgpt.com/docs']) {
      expect(isOfficialDocsUrl(url)).toBe(false);
      const chunks = []; for await (const chunk of provider([completed(url)]).adapter.streamAdvice!('{}')) chunks.push(chunk);
      expect(chunks.at(-1)).toMatchObject({ webCitations: [] });
    }
  });
  it('forwards cancellation and has a bounded provider deadline', async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit): Promise<Response> => {
      await new Promise((_, reject) => { init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true }); });
      throw new Error('unreachable');
    });
    const adapter = createOpenAIAdapter({ apiKey: 'fake', fetch, timeoutMs: 10 });
    await expect(async () => { for await (const _chunk of adapter.streamAdvice!('{}')) { /* consume */ } }).rejects.toMatchObject({ code: 'timeout' });
    const cancel = new AbortController();
    const pending = (async () => { for await (const _chunk of adapter.streamAdvice!('{}', cancel.signal)) { /* consume */ } })();
    cancel.abort(); await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  });
});

describe('cloud request and transcript boundaries', () => {
  it('requires explicit search choice and send hash and rejects provider/source overrides', () => {
    const { body } = fixture();
    expect(isCloudChatRequest(body)).toBe(true);
    expect(isCloudChatRequest(body, true)).toBe(false);
    for (const change of [{ source: 'bad' }, { provider: 'local' }, { searchDocs: 'yes' }, { endpoint: 'https://evil.example' }, { previewHash: undefined }]) {
      expect(isCloudChatRequest({ ...body, ...change })).toBe(false);
    }
  });
  it('keeps local and cloud sends separate and suppresses late output after clear', async () => {
    const local = vi.fn(async function* () { yield { type: 'error', code: 'no-excerpt', message: 'local double' } as const; });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const cloud = vi.fn(async function* () { await gate; yield { type: 'token', text: 'late cloud text' } as const; });
    const f = fixture(); const controller = new RepoChatController(local, f.body.snapshotId, vi.fn(), cloud);
    const request = { ...f.body, previewHash: 'a'.repeat(64) };
    const pending = controller.ask(request.question, undefined, request);
    expect(controller.state.turns[0]?.provider).toBe('cloud');
    controller.clear(); release(); await pending;
    expect(controller.state).toEqual({ turns: [], running: false });
    expect(local).not.toHaveBeenCalled(); expect(cloud).toHaveBeenCalledOnce();
  });
});
