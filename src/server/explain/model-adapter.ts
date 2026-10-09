import { LOCAL_EXPLANATION_TIMEOUT_MS, type ExplanationErrorCode, type RuntimeStatus } from '../../shared/explanation.js';

// Ollama runs Boozer's local AI on the same computer using the installed qwen3:4b-instruct model.
// Chat Boozer selects bounded source excerpts from the confirmed repository snapshot.
// The backend sends those excerpts and the question to Ollama's /api/chat at 127.0.0.1:11434.
// Ollama generates answer text locally and streams it back through this adapter to the UI.
// The chat service checks citation references against the supplied excerpts; claims can still be wrong.
// Ollama receives no shell/file tools and does not build or change the parser's dependency graph.
// Setup needs the runtime/model installed; local questions need no internet or OpenAI key.
// Optional OpenAI file comparison is a separate preview-and-send action, never a chat fallback.

// The only code that talks to a model runtime (AGENTS.md code boundaries). Fixed loopback
// endpoint, one allowlisted model by exact digest, no tools, no pull/install API, no
// redirects and no fallback provider. Tests inject `fetch`; the endpoint is not configurable.

export const OLLAMA_ENDPOINT = 'http://127.0.0.1:11434';
export const APPROVED_MODEL = {
  tag: 'qwen3:4b-instruct',
  digest: '0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0',
} as const;

// Fixed generation settings (P-5): deterministic, thinking off, output and context capped.
// preload uses the same num_ctx so Ollama doesn't reload the model for the first request.
export const GENERATION = { temperature: 0, seed: 1006, num_ctx: 4096, num_predict: 300 } as const;
const KEEP_ALIVE = '30m';

export interface ChatMessage { readonly role: 'system' | 'user'; readonly content: string }

export type ModelChunk =
  | { readonly type: 'token'; readonly text: string }
  | { readonly type: 'thinking' }
  | {
    readonly type: 'done';
    readonly promptTokens: number | null;
    readonly outputTokens: number | null;
    readonly truncated: boolean;
  };

export class ModelError extends Error {
  constructor(readonly code: ExplanationErrorCode, message: string) { super(message); }
}

export interface ModelAdapter {
  status(signal?: AbortSignal): Promise<RuntimeStatus>;
  preload(signal?: AbortSignal): Promise<RuntimeStatus>;
  stream(messages: readonly ChatMessage[], signal?: AbortSignal): AsyncIterable<ModelChunk>;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export function createOllamaAdapter(options: { fetch?: Fetch; timeoutMs?: number } = {}): ModelAdapter {
  const fetchImpl: Fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const timeoutMs = options.timeoutMs ?? LOCAL_EXPLANATION_TIMEOUT_MS;

  const call = async (path: string, init: RequestInit, signal: AbortSignal | undefined, timeout: number) => {
    const signals = [AbortSignal.timeout(timeout), ...(signal ? [signal] : [])];
    const requestSignal = AbortSignal.any(signals);
    try {
      return await fetchImpl(`${OLLAMA_ENDPOINT}${path}`, { ...init, redirect: 'error', signal: requestSignal });
    } catch (error) {
      throw toModelError(error, requestSignal);
    }
  };

  const status = async (signal?: AbortSignal): Promise<RuntimeStatus> => {
    let runtimeVersion: string;
    let models: { name: string; digest: string }[];
    try {
      const version = await call('/api/version', { method: 'GET' }, signal, 5_000);
      runtimeVersion = String(((await version.json()) as { version?: unknown }).version ?? 'unknown');
      const tags = await call('/api/tags', { method: 'GET' }, signal, 5_000);
      models = ((await tags.json()) as { models?: { name: string; digest: string }[] }).models ?? [];
    } catch (error) {
      const modelError = toModelError(error, signal);
      if (modelError.code === 'cancelled') throw modelError;
      return { state: 'runtime-unavailable', message: 'No local Ollama runtime is answering on 127.0.0.1:11434.' };
    }
    const installed = models.find((model) => model.name === APPROVED_MODEL.tag);
    if (installed === undefined) {
      return { state: 'model-missing', message: `The approved model ${APPROVED_MODEL.tag} is not installed. Boozer never downloads models.` };
    }
    if (installed.digest !== APPROVED_MODEL.digest) {
      return { state: 'model-mismatch', message: `${APPROVED_MODEL.tag} is installed with a different digest than the approved model.` };
    }
    return { state: 'ready', runtimeVersion, model: APPROVED_MODEL.tag, digest: APPROVED_MODEL.digest };
  };

  return {
    status,

    async preload(signal) {
      const current = await status(signal);
      if (current.state !== 'ready') return current;
      const response = await call('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: APPROVED_MODEL.tag, keep_alive: KEEP_ALIVE, options: { num_ctx: GENERATION.num_ctx } }),
      }, signal, timeoutMs);
      if (!response.ok) throw new ModelError('runtime-error', `The runtime refused to load the model (HTTP ${response.status}).`);
      await response.body?.cancel();
      return current;
    },

    async *stream(messages, signal) {
      const requestSignal = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
      const response = await call('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: APPROVED_MODEL.tag, messages, stream: true, think: false, keep_alive: KEEP_ALIVE, options: GENERATION,
        }),
      }, requestSignal, timeoutMs);
      if (response.status === 404) throw new ModelError('model-missing', `The approved model ${APPROVED_MODEL.tag} is not installed.`);
      if (!response.ok || response.body === null) throw new ModelError('runtime-error', `The runtime returned HTTP ${response.status}.`);

      const decoder = new TextDecoder();
      let buffered = '';
      try {
        for await (const bytes of response.body) {
          buffered += decoder.decode(bytes as Uint8Array, { stream: true });
          let newline: number;
          while ((newline = buffered.indexOf('\n')) >= 0) {
            const line = buffered.slice(0, newline).trim();
            buffered = buffered.slice(newline + 1);
            if (line === '') continue;
            const chunk = JSON.parse(line) as {
              message?: { content?: string; thinking?: string }; done?: boolean; done_reason?: string;
              prompt_eval_count?: number; eval_count?: number; error?: string;
            };
            if (chunk.error !== undefined) throw new ModelError('runtime-error', 'The runtime reported an error while generating.');
            if ((chunk.message?.thinking ?? '') !== '') yield { type: 'thinking' };
            const text = chunk.message?.content ?? '';
            if (text !== '') yield { type: 'token', text };
            if (chunk.done) {
              yield {
                type: 'done',
                promptTokens: chunk.prompt_eval_count ?? null,
                outputTokens: chunk.eval_count ?? null,
                truncated: chunk.done_reason === 'length',
              };
              return;
            }
          }
        }
      } catch (error) {
        throw toModelError(error, requestSignal);
      }
      throw new ModelError('runtime-error', 'The runtime closed the stream before finishing.');
    },
  };
}

function toModelError(error: unknown, signal: AbortSignal | undefined): ModelError {
  if (error instanceof ModelError) return error;
  if (signal?.aborted) return signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError'
    ? new ModelError('timeout', 'The local model did not finish in time.')
    : new ModelError('cancelled', 'The explanation was cancelled.');
  if (error instanceof DOMException && error.name === 'TimeoutError') return new ModelError('timeout', 'The local model did not finish in time.');
  if (error instanceof SyntaxError) return new ModelError('runtime-error', 'The runtime sent malformed output.');
  return new ModelError('runtime-unavailable', 'No local Ollama runtime is answering on 127.0.0.1:11434.');
}
