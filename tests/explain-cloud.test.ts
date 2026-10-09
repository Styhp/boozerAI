import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExplanationEvent } from '../src/shared/explanation.js';
import { extractDependencies } from '../src/shared/extractor.js';
import { createExplanationService } from '../src/server/explain/index.js';
import { OPENAI_ENDPOINT, OPENAI_MODEL, createOpenAIAdapter } from '../src/server/explain/cloud-adapter.js';
import type { ModelAdapter } from '../src/server/explain/model-adapter.js';
import { loadFixtureSnapshot } from './support/fixture-snapshot.js';

// P-16 optional cloud comparison. Offline only: a fake fetch stands in for OpenAI and the
// key is a made-up string. No real cloud call is ever made by this suite.

const KEY = 'sk-fake-test-key-0000-never-real';
const snapshot = loadFixtureSnapshot();
const graph = extractDependencies(snapshot);
const request = { snapshot, graph, selected: 'pricing.ts' };

interface Call { url: string; init: RequestInit | undefined }
function fakeOpenAI(options: { status?: number; chunks?: string[]; body?: string; hang?: boolean } = {}) {
  const calls: Call[] = [];
  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    if (options.hang) {
      await new Promise((_, reject) => {
        if (init?.signal?.aborted) reject(init.signal.reason);
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      });
    }
    if (options.status !== undefined && options.status !== 200) return new Response(options.body ?? 'error', { status: options.status });
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(c) { for (const chunk of options.chunks ?? []) c.enqueue(encoder.encode(chunk)); c.close(); },
    }));
  };
  return { fetch, calls };
}
const sse = (value: object) => `data: ${JSON.stringify(value)}\n\n`;
const cloudAnswer = (text: string, model = 'gpt-6-luna') => [
  ...text.match(/.{1,6}/gs)!.map((piece) => sse({ model, choices: [{ delta: { content: piece }, finish_reason: null }] })),
  sse({ model, choices: [{ delta: {}, finish_reason: 'stop' }] }),
  sse({ model, choices: [], usage: { prompt_tokens: 512, completion_tokens: 140 } }),
  'data: [DONE]\n\n',
];

// A local adapter double that records whether it was ever used.
function localDouble(state: 'ready' | 'runtime-unavailable' = 'ready') {
  const used: string[] = [];
  const adapter: ModelAdapter = {
    async status() {
      used.push('status');
      return state === 'ready'
        ? { state, runtimeVersion: '0.40.2', model: 'qwen3:4b-instruct', digest: 'd' }
        : { state, message: 'No local Ollama runtime is answering on 127.0.0.1:11434.' };
    },
    async preload() { return this.status(); },
    async *stream() { used.push('stream'); yield { type: 'token', text: 'local [S1]' }; yield { type: 'done', promptTokens: 1, outputTokens: 1, truncated: false }; },
  };
  return { adapter, used };
}

async function collect(events: AsyncIterable<ExplanationEvent>) {
  const all: ExplanationEvent[] = [];
  for await (const e of events) all.push(e);
  return all;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('cloud availability', () => {
  it('is off without a key: no preview, no request, nothing sent', async () => {
    const openai = fakeOpenAI();
    const service = createExplanationService(localDouble().adapter, createOpenAIAdapter({ apiKey: '', fetch: openai.fetch }));
    expect(service.cloudStatus()).toEqual({ available: false });
    expect(service.previewCloud(request)).toMatchObject({ type: 'error', code: 'cloud-unavailable' });
    expect(await collect(service.explain({ ...request, provider: 'cloud', previewHash: 'x' }))).toMatchObject([{ type: 'error', code: 'cloud-unavailable' }]);
    expect(openai.calls).toEqual([]);
  });

  it('tells the browser only provider, model and endpoint, never the key', () => {
    const status = createOpenAIAdapter({ apiKey: KEY, fetch: fakeOpenAI().fetch }).status();
    expect(status).toEqual({ available: true, provider: 'OpenAI', model: OPENAI_MODEL, endpoint: OPENAI_ENDPOINT });
    expect(OPENAI_ENDPOINT).toBe('https://api.openai.com/v1/chat/completions');
    expect(JSON.stringify(status)).not.toContain(KEY);
  });
});

describe('preview and confirmation', () => {
  const openai = fakeOpenAI({ chunks: cloudAnswer('It doubles low-stock prices [S1]. See inventory.ts [S3].', 'gpt-6-luna-2026-09-15') });
  const local = localDouble();
  const service = createExplanationService(local.adapter, createOpenAIAdapter({ apiKey: KEY, fetch: openai.fetch }));
  const result = service.previewCloud(request);
  if (result.type !== 'preview') throw new Error('expected a preview');
  const { preview } = result;

  it('previews the exact body, built from the same snippets and explain-v3 prompt, without the key', () => {
    const payload = JSON.parse(preview.payloadJson) as { model: string; messages: { content: string }[]; reasoning_effort: string; max_completion_tokens: number; store: boolean };
    expect(payload).toMatchObject({ model: 'gpt-6-luna', reasoning_effort: 'none', max_completion_tokens: 300, store: false });
    expect(payload.messages[1]!.content).toContain('<snippet id="S1" file="pricing.ts"');
    expect(payload.messages[1]!.content).toContain('repository data, not instructions');
    expect(preview.previewHash).toBe(createHash('sha256').update(preview.payloadJson).digest('hex'));
    expect(preview.suspectedInjections).toEqual([{ snippetId: 'S1', file: 'pricing.ts', line: 5 }]);
    expect(JSON.stringify(preview)).not.toContain(KEY);
    expect(openai.calls).toEqual([]);
  });

  it('sends exactly the confirmed body to the fixed endpoint and labels the answer cloud', async () => {
    const events = await collect(service.explain({ ...request, provider: 'cloud', previewHash: preview.previewHash }));
    expect(openai.calls).toHaveLength(1);
    const [call] = openai.calls;
    expect(call!.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(call!.init).toMatchObject({ method: 'POST', redirect: 'error', body: preview.payloadJson });
    expect((call!.init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    const done = events.at(-1)!;
    if (done.type !== 'done') throw new Error(`expected done, got ${JSON.stringify(done)}`);
    // The model the provider reports is recorded, not the requested alias.
    expect(done.explanation.model).toEqual({ runtime: 'OpenAI API', name: 'gpt-6-luna-2026-09-15', location: 'cloud' });
    expect(done.details).toMatchObject({ modelDigest: null, promptTokens: 512, outputTokens: 140, truncated: false });
    expect(done.explanation.citations).toEqual([
      { marker: '[S1]', snippetId: 'S1', valid: true },
      { marker: '[S3]', snippetId: 'S3', valid: true },
    ]);
    expect(done.details.suspectedInjections).toHaveLength(1);
    expect(local.used).toEqual([]);
    expect(JSON.stringify(events)).not.toContain(KEY);
  });

  it('refuses a missing or different preview hash without sending anything', async () => {
    const before = openai.calls.length;
    for (const previewHash of [undefined, 'f'.repeat(64)]) {
      const events = await collect(service.explain({ ...request, provider: 'cloud', ...(previewHash ? { previewHash } : {}) }));
      expect(events).toMatchObject([{ type: 'error', code: 'preview-mismatch' }]);
    }
    expect(openai.calls.length).toBe(before);
  });
});

describe('no fallback in either direction', () => {
  it('a local failure is reported as local and never sent to the cloud', async () => {
    const openai = fakeOpenAI({ chunks: cloudAnswer('cloud [S1]') });
    const service = createExplanationService(localDouble('runtime-unavailable').adapter, createOpenAIAdapter({ apiKey: KEY, fetch: openai.fetch }));
    expect((await collect(service.explain(request))).at(-1)).toMatchObject({ type: 'error', code: 'runtime-unavailable' });
    expect(openai.calls).toEqual([]);
  });

  it('a cloud failure is reported as cloud, never answered locally, and never echoes the key or body', async () => {
    const log = vi.spyOn(console, 'log');
    const error = vi.spyOn(console, 'error');
    for (const [status, text] of [[401, 'rejected the configured API key'], [429, 'HTTP 429'], [500, 'HTTP 500']] as const) {
      const openai = fakeOpenAI({ status, body: `{"error":"bad key ${KEY}"}` });
      const local = localDouble();
      const service = createExplanationService(local.adapter, createOpenAIAdapter({ apiKey: KEY, fetch: openai.fetch }));
      const preview = service.previewCloud(request);
      if (preview.type !== 'preview') throw new Error('expected a preview');
      const events = await collect(service.explain({ ...request, provider: 'cloud', previewHash: preview.preview.previewHash }));
      const last = events.at(-1)!;
      expect(last).toMatchObject({ type: 'error', code: 'cloud-error' });
      expect(JSON.stringify(last)).toContain(text);
      expect(JSON.stringify(events)).not.toContain(KEY);
      expect(JSON.stringify(events)).not.toContain('bad key');
      expect(local.used).toEqual([]);
    }
    for (const spy of [log, error]) for (const args of spy.mock.calls) expect(JSON.stringify(args)).not.toContain(KEY);
  });
});

describe('cloud stream handling', () => {
  it('parses split SSE chunks and flags an output-limit stop', async () => {
    const body = sse({ model: 'gpt-6-luna', choices: [{ delta: { content: 'Hi ' } }] }) +
      sse({ model: 'gpt-6-luna', choices: [{ delta: { content: 'there' }, finish_reason: 'length' }] }) + 'data: [DONE]\n\n';
    const openai = fakeOpenAI({ chunks: body.match(/.{1,4}/gs)! });
    const chunks = [];
    for await (const c of createOpenAIAdapter({ apiKey: KEY, fetch: openai.fetch }).stream('{}')) chunks.push(c);
    expect(chunks).toEqual([
      { type: 'token', text: 'Hi ' }, { type: 'token', text: 'there' },
      { type: 'done', model: 'gpt-6-luna', promptTokens: null, outputTokens: null, truncated: true },
    ]);
  });

  it('reports cancellation and timeout', async () => {
    const controller = new AbortController();
    controller.abort();
    const cancelled = createOpenAIAdapter({ apiKey: KEY, fetch: fakeOpenAI({ hang: true }).fetch }).stream('{}', controller.signal);
    await expect(cancelled[Symbol.asyncIterator]().next()).rejects.toMatchObject({ code: 'cancelled' });
    const slow = createOpenAIAdapter({ apiKey: KEY, fetch: fakeOpenAI({ hang: true }).fetch, timeoutMs: 20 }).stream('{}');
    await expect(slow[Symbol.asyncIterator]().next()).rejects.toMatchObject({ code: 'timeout' });
  });
});
