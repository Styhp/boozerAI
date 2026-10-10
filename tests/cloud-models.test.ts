import { describe, expect, it, vi } from 'vitest';
import { createOpenAIAdapter, OPENAI_MODELS_ENDPOINT } from '../src/server/explain/cloud-adapter.js';
import { createExplanationService } from '../src/server/explain/service.js';
import { extractDependencies } from '../src/shared/extractor.js';
import type { ExplanationEvent } from '../src/shared/explanation.js';
import { isCloudChatRequest } from '../src/shared/cloud-chat.js';
import { loadFixtureSnapshot } from './support/fixture-snapshot.js';
const key = 'fake-model-list-key';
async function collect(events: AsyncIterable<ExplanationEvent>) { const values = []; for await (const e of events) values.push(e); return values; }
describe('explicit OpenAI model choice and discovery', () => {
  it('does not discover automatically and lists only safe IDs through a fixed authenticated metadata GET', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'model-b' }, { id: 'model-a' }, { id: 'model-b' }, { id: '<script>' }, null] })));
    const adapter = createOpenAIAdapter({ apiKey: key, model: 'configured', fetch });
    adapter.status(); adapter.payloadJson([]); adapter.advicePayloadJson!([], true);
    expect(fetch).not.toHaveBeenCalled();
    expect(await adapter.listModels!()).toEqual(['model-a', 'model-b']);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(OPENAI_MODELS_ENDPOINT, expect.objectContaining({
      method: 'GET', headers: { Authorization: `Bearer ${key}` }, redirect: 'error',
    }));
    expect((fetch.mock.calls[0] as unknown[])[1]).not.toHaveProperty('body');
  });
  it('reports unavailable, malformed and oversized metadata without provider bodies or fallback', async () => {
    for (const response of [new Response(key, { status: 403 }), new Response('{}'), new Response('x'.repeat(1_048_577))]) {
      const adapter = createOpenAIAdapter({ apiKey: key, fetch: async () => response });
      try { await adapter.listModels!(); throw new Error('Unexpected successful listing'); }
      catch (error) { expect(error).toHaveProperty('code', 'cloud-error'); expect(String(error)).not.toContain(key); }
    }
    const fetch = vi.fn(); const off = createOpenAIAdapter({ apiKey: '', fetch });
    await expect(off.listModels!()).rejects.toHaveProperty('code', 'cloud-unavailable'); expect(fetch).not.toHaveBeenCalled();
  });
  it('cancels metadata requests', async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit): Promise<Response> => new Promise((_resolve, reject) => {
      if (init?.signal?.aborted) reject(init.signal.reason);
      else init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    }));
    const adapter = createOpenAIAdapter({ apiKey: key, fetch }); const controller = new AbortController();
    const pending = adapter.listModels!(controller.signal); controller.abort();
    await expect(pending).rejects.toHaveProperty('code', 'cancelled');
  });
  it('binds model choice to both previews and refuses a changed model before network access', async () => {
    const snapshot = loadFixtureSnapshot(); const graph = extractDependencies(snapshot);
    const fetch = vi.fn(async () => new Response('', { status: 403 }));
    const local = { status: vi.fn(), preload: vi.fn(), stream: vi.fn() };
    const cloud = createOpenAIAdapter({ apiKey: key, model: 'default-model', fetch });
    const service = createExplanationService(local, cloud);
    const base = { snapshot, graph, selected: 'pricing.ts', model: 'chosen-model' };
    const preview = service.previewCloud(base); if (preview.type !== 'preview') throw new Error('Expected preview');
    expect(preview.preview.model).toBe('chosen-model'); expect(JSON.parse(preview.preview.payloadJson).model).toBe('chosen-model');
    expect(JSON.parse(preview.preview.payloadJson)).not.toHaveProperty('reasoning_effort');
    expect(await collect(service.explain({ ...base, model: 'different-model', provider: 'cloud', previewHash: preview.preview.previewHash }))).toMatchObject([{ type: 'error', code: 'preview-mismatch' }]);
    const request = { snapshot, graph, snapshotId: snapshot.snapshotId, question: 'What is here?', history: [], searchDocs: true, model: 'chosen-model' };
    const chat = service.previewCloudChat(request); if (chat.type !== 'preview') throw new Error('Expected preview');
    expect(chat.preview.model).toBe('chosen-model'); expect(JSON.parse(chat.preview.payloadJson).model).toBe('chosen-model');
    expect(await collect(service.cloudChat({ ...request, model: 'different-model', previewHash: chat.preview.previewHash }))).toMatchObject([{ type: 'error', code: 'preview-mismatch' }]);
    expect(fetch).not.toHaveBeenCalled();
    await collect(service.explain({ ...base, provider: 'cloud', previewHash: preview.preview.previewHash }));
    expect(fetch.mock.calls[0]).toEqual([expect.any(String), expect.objectContaining({ body: preview.preview.payloadJson })]);
    await collect(service.cloudChat({ ...request, previewHash: chat.preview.previewHash }));
    expect(fetch.mock.calls[1]).toEqual([expect.any(String), expect.objectContaining({ body: chat.preview.payloadJson })]);
    expect(local.stream).not.toHaveBeenCalled(); expect(cloud.status()).toHaveProperty('model', 'default-model');
    expect(service.previewCloud({ ...base, model: '../invalid' })).toMatchObject({ type: 'error', code: 'invalid-selection' });
    expect(await collect(service.explain({ ...base, model: '../invalid', provider: 'cloud' }))).toMatchObject([{ type: 'error', code: 'invalid-selection' }]);
  });
  it('rejects invalid model fields instead of forwarding arbitrary provider settings', () => {
    const body = { snapshotId: 'snapshot', question: 'Question?', history: [], searchDocs: false };
    expect(isCloudChatRequest({ ...body, model: 'gpt-5.6-luna' })).toBe(true);
    for (const model of [null, 3, '', ' space ', '../bad', 'x'.repeat(129)]) expect(isCloudChatRequest({ ...body, model })).toBe(false);
    expect(isCloudChatRequest({ ...body, model: 'model', endpoint: 'http://evil' })).toBe(false);
  });
});
