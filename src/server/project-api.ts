import { once } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LOCAL_EXPLANATION_TIMEOUT_MS, type ExplainRequestBody } from '../shared/explanation.js';
import type { CloudComparison, ExplanationService } from './explain/index.js';
import { ApiError, ProjectSession } from './project-session.js';
import { NotesError, routeNotes } from './project-notes.js';
import { isRepoChatRequest, type RepoChatService } from '../shared/repo-chat.js';
import { isCloudChatRequest, isCloudModelId, type CloudChatSend } from '../shared/cloud-chat.js';
import type { CloudRepoChatService } from './explain/cloud-chat-service.js';

const MAX_BODY = 8_192;
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const json = (response: ServerResponse, status: number, value: unknown) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
};

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (request.headers['content-type'] !== 'application/json') throw new ApiError(415, 'json-required');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY) throw new ApiError(413, 'body-limit');
    chunks.push(bytes);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!object(value)) throw new Error();
    return value;
  } catch { throw new ApiError(400, 'invalid-body'); }
}

function fields(value: Record<string, unknown>, names: readonly string[]): void {
  if (Object.keys(value).length !== names.length || names.some((name) => typeof value[name] !== 'string' || value[name] === '')) {
    throw new ApiError(400, 'invalid-body');
  }
}

function explanationBody(input: Record<string, unknown>): ExplainRequestBody {
  const provider = input.provider;
  if (!Object.hasOwn(input, 'provider')) {
    fields(input, ['snapshotId', 'path']);
    return { snapshotId: input.snapshotId as string, path: input.path as string };
  }
  if (provider === 'local') {
    fields(input, ['snapshotId', 'path', 'provider']);
    return { snapshotId: input.snapshotId as string, path: input.path as string, provider };
  }
  if (provider === 'cloud') {
    fields(input, ['snapshotId', 'path', 'provider', 'previewHash', ...(Object.hasOwn(input, 'model') ? ['model'] : [])]);
    if (Object.hasOwn(input, 'model') && !isCloudModelId(input.model)) throw new ApiError(400, 'invalid-body');
    if (!/^[0-9a-f]{64}$/.test(input.previewHash as string)) throw new ApiError(400, 'invalid-body');
    return { snapshotId: input.snapshotId as string, path: input.path as string, provider, previewHash: input.previewHash as string, ...(typeof input.model === 'string' ? { model: input.model } : {}) };
  }
  throw new ApiError(400, 'invalid-body');
}

export async function handleProjectApi(request: IncomingMessage, response: ServerResponse, session: ProjectSession, service: ExplanationService & CloudComparison & Partial<RepoChatService & CloudRepoChatService>, development: boolean): Promise<void> {
  const controller = new AbortController();
  let timedOut = false;
  const disconnected = () => { if (!response.writableEnded) controller.abort(); };
  response.on('close', disconnected);
  request.on('aborted', disconnected);
  try {
    if (!session.authorized(request.headers.authorization)) throw new ApiError(401, 'unauthorized');
    const raw = request.url ?? '';
    // No URL normalization may turn an escaping path into an authorized route.
    if (!raw.startsWith('/api/') || raw.length > 4_096 || raw.includes('#') || raw.split('?').length > 2) throw new ApiError(404, 'not-found');
    const [pathname, query] = raw.split('?');
    const method = request.method;
    if (method === 'POST') {
      const origin = request.headers.origin;
      if (origin !== 'http://127.0.0.1:4173' && !(development && origin === 'http://127.0.0.1:5173')) throw new ApiError(403, 'origin-required');
    }
    if (method === 'GET' && pathname === '/api/session' && query === undefined) {
      json(response, 200, { project: session.descriptor(), cloud: service.cloudStatus() }); return;
    }
    if (pathname === '/api/cloud/models') {
      if (method !== 'POST') throw new ApiError(405, 'method-not-allowed');
      if (query !== undefined) throw new ApiError(400, 'invalid-query');
      fields(await body(request), []);
      if (!service.listCloudModels) throw new ApiError(404, 'cloud-unavailable');
      try { json(response, 200, { models: await service.listCloudModels(controller.signal) }); }
      catch { throw new ApiError(502, 'cloud-models-unavailable'); }
      return;
    }
    if (pathname === '/api/session/pick') {
      if (method !== 'POST') throw new ApiError(405, 'method-not-allowed');
      if (query !== undefined) throw new ApiError(400, 'invalid-query');
      fields(await body(request), []);
      json(response, 200, await session.chooseFolder(controller.signal)); return;
    }
    // --- Project notes hook (phase 1): its own route table behind the same auth, Origin,
    // JSON and body-cap checks; errors become the same sanitized { error: { code } }.
    const notesRoute = /^\/api\/projects\/([0-9a-f-]{36})\/notes((?:\/[0-9a-z-]+){0,2})$/.exec(pathname ?? '');
    if (notesRoute !== null) {
      const id = notesRoute[1]!;
      try {
        json(response, 200, await routeNotes({
          method, path: notesRoute[2]!, query, body: () => body(request), notes: session.notes(id),
          snapshot: (snapshotId) => session.current(id, snapshotId).snapshot,
        }));
      } catch (error) { throw error instanceof NotesError ? new ApiError(error.status, error.code) : error; }
      return;
    }
    // --- end project notes hook ---
    const route = /^\/api\/projects\/([0-9a-f-]{36})\/(confirm|graph|files\/([0-9a-f-]{36})(?:\/history)?|refresh|close|explanations|explanations\/preview|chat|chat\/cloud|chat\/cloud\/preview)$/.exec(pathname ?? '');
    if (route === null) throw new ApiError(404, 'not-found');
    const id = route[1]!;
    const action = route[2]!;
    if (route[3] === undefined && query !== undefined) throw new ApiError(400, 'invalid-query');
    if (method === 'GET' && action === 'graph' && query === undefined) {
      json(response, 200, session.current(id).response); return;
    }
    if (method === 'GET' && route[3] !== undefined && !action.endsWith('/history')) {
      const params = new URLSearchParams(query);
      const snapshotId = params.get('snapshotId');
      if (snapshotId === null || !/^sha256:[0-9a-f]{64}$/.test(snapshotId) || [...params.keys()].length !== 1) throw new ApiError(400, 'snapshot-required');
      json(response, 200, session.file(id, route[3], snapshotId)); return;
    }
    if (method !== 'POST') throw new ApiError(405, 'method-not-allowed');
    if (query !== undefined) throw new ApiError(400, 'invalid-query');
    const input = await body(request);
    if (action.endsWith('/history') && route[3] !== undefined) {
      fields(input, ['snapshotId']);
      json(response, 200, await session.fileHistory(id, route[3], input.snapshotId as string, AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]))); return;
    }
    if (action === 'confirm') {
      fields(input, []);
      json(response, 200, await session.index(id, controller.signal)); return;
    }
    if (action === 'refresh') {
      fields(input, ['snapshotId']);
      json(response, 200, await session.index(id, controller.signal, input.snapshotId as string)); return;
    }
    if (action === 'close') {
      fields(input, []);
      // Validate the selected project even when it hasn't been confirmed yet.
      if (session.descriptor()?.id !== id) throw new ApiError(404, 'invalid-project');
      session.close(); json(response, 200, { closed: true }); return;
    }
    if (action === 'explanations/preview') {
      fields(input, ['snapshotId', 'path', ...(Object.hasOwn(input, 'model') ? ['model'] : [])]);
      if (Object.hasOwn(input, 'model') && !isCloudModelId(input.model)) throw new ApiError(400, 'invalid-body');
      const current = session.current(id, input.snapshotId as string);
      // Selection stays a snapshot key. Only the service builds the exact cloud payload.
      const result = service.previewCloud({ snapshot: current.snapshot, graph: current.response.graph, selected: input.path as string, ...(typeof input.model === 'string' ? { model: input.model } : {}), signal: controller.signal });
      if (result.type === 'error') {
        const status = result.code === 'cloud-unavailable' ? 404 : result.code === 'stale-snapshot' ? 409
          : result.code === 'invalid-selection' || result.code === 'no-excerpt' ? 400 : 500;
        throw new ApiError(status, result.code);
      }
      json(response, 200, result.preview); return;
    }
    if (action === 'chat' || action === 'chat/cloud' || action === 'chat/cloud/preview') {
      const cloud = action !== 'chat';
      if (!(cloud ? isCloudChatRequest(input, action === 'chat/cloud') : isRepoChatRequest(input))) throw new ApiError(400, 'invalid-body');
      // Both validators share the base request contract; cloud adds only consent/search.
      const chatBody = input as unknown as CloudChatSend;
      const current = session.current(id, chatBody.snapshotId);
      if (chatBody.contextPath !== undefined && ![...current.snapshot.files, ...(current.snapshot.documents ?? [])]
        .some((file) => file.path === chatBody.contextPath)) throw new ApiError(404, 'invalid-file');
      if (action === 'chat/cloud/preview') {
        if (!service.previewCloudChat) throw new ApiError(404, 'cloud-unavailable');
        const result = service.previewCloudChat({ ...chatBody, snapshot: current.snapshot, graph: current.response.graph, signal: controller.signal });
        if (result.type === 'error') throw new ApiError(result.code === 'cloud-unavailable' ? 404 : 400, result.code);
        json(response, 200, result.preview); return;
      }
      if (cloud ? service.cloudChat === undefined : service.chat === undefined) throw new ApiError(404, 'chat-unavailable');
      const chat = session.beginChat(id, chatBody.snapshotId, controller.signal);
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort(new DOMException('The chat request timed out.', 'TimeoutError'));
      }, cloud ? 130_000 : LOCAL_EXPLANATION_TIMEOUT_MS + 10_000);
      timeout.unref();
      try {
        response.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' });
        response.flushHeaders();
        let terminal = false;
        const context = { snapshot: chat.snapshot, graph: chat.graph, signal: chat.signal };
        const events = cloud ? service.cloudChat!({ ...chatBody, ...context }) : service.chat!({ ...chatBody, ...context });
        for await (const event of events) {
          if (chat.signal.aborted) break;
          if (!response.write(`${JSON.stringify(event)}\n`)) await once(response, 'drain', { signal: chat.signal });
          if (event.type === 'done' || event.type === 'error') { terminal = true; break; }
        }
        if (!terminal && !response.destroyed) response.write(`${JSON.stringify({ type: 'error', code: timedOut ? 'timeout' : chat.signal.aborted ? 'cancelled' : 'runtime-error',
          message: timedOut ? 'The model did not finish within the request time limit.' : 'The chat ended before completion.' })}\n`);
        response.end();
      } finally { clearTimeout(timeout); chat.finish(); }
      return;
    }
    if (action !== 'explanations') throw new ApiError(405, 'method-not-allowed');
    const selection = explanationBody(input);
    const explanation = session.beginExplanation(id, selection.snapshotId, selection.path, controller.signal);
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException('The explanation request timed out.', 'TimeoutError'));
    }, selection.provider === 'cloud' ? 120_000 : LOCAL_EXPLANATION_TIMEOUT_MS + 10_000);
    timeout.unref();
    try {
      response.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' });
      response.flushHeaders();
      let terminal = false;
      for await (const event of service.explain({
        ...explanation,
        ...(selection.provider === undefined ? {} : { provider: selection.provider }),
        ...(selection.previewHash === undefined ? {} : { previewHash: selection.previewHash }),
        ...(selection.model === undefined ? {} : { model: selection.model }),
      })) {
        if (explanation.signal.aborted) break;
        if (!response.write(`${JSON.stringify(event)}\n`)) await once(response, 'drain', { signal: explanation.signal });
        if (event.type === 'done' || event.type === 'error') { terminal = true; break; }
      }
      if (!terminal && !response.destroyed) response.write(`${JSON.stringify({ type: 'error', code: timedOut ? 'timeout' : explanation.signal.aborted ? 'cancelled' : 'runtime-error', message: timedOut ? 'The model did not finish within the request time limit.' : 'The explanation ended before completion.' })}\n`);
      response.end();
    } finally { clearTimeout(timeout); explanation.finish(); }
  } catch (error) {
    if (!response.destroyed) {
      if (response.headersSent) {
        response.end(`${JSON.stringify({ type: 'error', code: timedOut ? 'timeout' : controller.signal.aborted ? 'cancelled' : 'runtime-error', message: timedOut ? 'The model did not finish within the request time limit.' : 'The explanation failed.' })}\n`);
      } else {
        const failure = error instanceof ApiError ? error : new ApiError(500, 'request-failed');
        json(response, failure.status, { error: { code: failure.code } });
      }
    }
  } finally {
    response.off('close', disconnected);
    request.off('aborted', disconnected);
  }
}
