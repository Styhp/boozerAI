import type { CloudStatus } from '../../shared/explanation.js';
import { ModelError, type ChatMessage } from './model-adapter.js';

// Optional cloud comparison (P-16). The only code that talks to a cloud model. Off unless
// OPENAI_API_KEY is set at launch, and used only for a request the user confirmed after
// seeing its exact payload. Never a fallback for local failures. No SDK, one fixed HTTPS
// endpoint, no redirects, no tools. The key never leaves this module: it is not logged,
// not echoed in errors and not sent to the browser.

export const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
// Verified 2026-10-09 at developers.openai.com/api/docs/models/gpt-6-luna: "our most
// efficient model for focused, high-volume tasks", Chat Completions supported. The `model`
// field of each response is recorded as the source of truth for what actually answered.
export const OPENAI_MODEL = 'gpt-6-luna';
const DEFAULT_TIMEOUT_MS = 60_000;

export type CloudChunk =
  | { readonly type: 'token'; readonly text: string }
  | {
    readonly type: 'done';
    readonly model: string | null;
    readonly promptTokens: number | null;
    readonly outputTokens: number | null;
    readonly truncated: boolean;
  };

export interface CloudAdapter {
  status(): CloudStatus;
  // The exact JSON body to send for these messages (also what the preview shows).
  payloadJson(messages: readonly ChatMessage[]): string;
  stream(payloadJson: string, signal?: AbortSignal): AsyncIterable<CloudChunk>;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export function createOpenAIAdapter(options: { apiKey?: string | undefined; fetch?: Fetch; timeoutMs?: number } = {}): CloudAdapter {
  // Read once at launch; an empty value counts as absent.
  const apiKey = (options.apiKey ?? process.env.OPENAI_API_KEY ?? '').trim();
  const fetchImpl: Fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    status: () => (apiKey === ''
      ? { available: false }
      : { available: true, provider: 'OpenAI', model: OPENAI_MODEL, endpoint: OPENAI_ENDPOINT }),

    payloadJson: (messages) => JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      reasoning_effort: 'none',        // fastest setting; comparable with local think: false
      max_completion_tokens: 300,      // same output cap as the local model
      store: false,
    }),

    async *stream(payloadJson, signal) {
      if (apiKey === '') throw new ModelError('cloud-unavailable', 'No cloud provider is configured for this launch.');
      let response: Response;
      try {
        response = await fetchImpl(OPENAI_ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: payloadJson,
          redirect: 'error',
          signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]),
        });
      } catch (error) {
        throw cloudError(error, signal);
      }
      // Status only: response bodies are never surfaced.
      if (response.status === 401) throw new ModelError('cloud-error', 'OpenAI rejected the configured API key.');
      if (response.status === 429) throw new ModelError('cloud-error', 'OpenAI rate-limited or declined the request (HTTP 429).');
      if (!response.ok || response.body === null) throw new ModelError('cloud-error', `OpenAI returned HTTP ${response.status}.`);

      const decoder = new TextDecoder();
      let buffered = '';
      let model: string | null = null;
      let truncated = false;
      let promptTokens: number | null = null;
      let outputTokens: number | null = null;
      try {
        for await (const bytes of response.body) {
          buffered += decoder.decode(bytes as Uint8Array, { stream: true });
          let newline: number;
          while ((newline = buffered.indexOf('\n')) >= 0) {
            const line = buffered.slice(0, newline).trim();
            buffered = buffered.slice(newline + 1);
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') {
              yield { type: 'done', model, promptTokens, outputTokens, truncated };
              return;
            }
            const chunk = JSON.parse(data) as {
              model?: string; error?: unknown;
              choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
              usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
            };
            if (chunk.error !== undefined) throw new ModelError('cloud-error', 'OpenAI reported an error while generating.');
            if (typeof chunk.model === 'string') model = chunk.model;
            const choice = chunk.choices?.[0];
            if (choice?.finish_reason === 'length') truncated = true;
            const text = choice?.delta?.content ?? '';
            if (text !== '') yield { type: 'token', text };
            if (chunk.usage) {
              promptTokens = chunk.usage.prompt_tokens ?? null;
              outputTokens = chunk.usage.completion_tokens ?? null;
            }
          }
        }
      } catch (error) {
        throw cloudError(error, signal);
      }
      throw new ModelError('cloud-error', 'The OpenAI stream ended before finishing.');
    },
  };
}

function cloudError(error: unknown, signal: AbortSignal | undefined): ModelError {
  if (error instanceof ModelError) return error;
  if (signal?.aborted) return new ModelError('cancelled', 'The explanation was cancelled.');
  if (error instanceof DOMException && error.name === 'TimeoutError') return new ModelError('timeout', 'OpenAI did not finish in time.');
  if (error instanceof SyntaxError) return new ModelError('cloud-error', 'OpenAI sent malformed output.');
  return new ModelError('cloud-error', 'Could not reach OpenAI.');
}
