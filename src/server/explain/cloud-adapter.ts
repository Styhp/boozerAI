import type { CloudStatus } from '../../shared/explanation.js';
import { ModelError, type ChatMessage } from './model-adapter.js';
import { isCloudModelId, isOfficialDocsUrl, OPENAI_DOC_DOMAINS, type WebCitation } from '../../shared/cloud-chat.js';

// Optional cloud comparison (P-16). The only code that talks to a cloud model. Off unless
// OPENAI_API_KEY is set at launch, and used only for a request the user confirmed after
// seeing its exact payload. Never a fallback for local failures. No SDK; fixed HTTPS
// generation endpoints and explicit model-list metadata, no redirects. Advice can explicitly enable official-docs web search.
// The key never leaves this module: it is not logged,
// not echoed in errors and not sent to the browser.

export const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
export const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';
export const OPENAI_MODELS_ENDPOINT = 'https://api.openai.com/v1/models';
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
    readonly text?: string;
    readonly webCitations?: readonly WebCitation[];
  };

export interface CloudAdapter {
  status(): CloudStatus;
  // The exact JSON body to send for these messages (also what the preview shows).
  payloadJson(messages: readonly ChatMessage[], model?: string): string;
  stream(payloadJson: string, signal?: AbortSignal): AsyncIterable<CloudChunk>;
  advicePayloadJson?(messages: readonly ChatMessage[], searchDocs: boolean, model?: string): string;
  listModels?(signal?: AbortSignal): Promise<readonly string[]>;
  streamAdvice?(payloadJson: string, signal?: AbortSignal): AsyncIterable<CloudChunk>;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export function createOpenAIAdapter(options: { apiKey?: string | undefined; model?: string | undefined; fetch?: Fetch; timeoutMs?: number } = {}): CloudAdapter {
  // Read once at launch; an empty value counts as absent.
  const apiKey = (options.apiKey ?? process.env.OPENAI_API_KEY ?? '').trim();
  const modelName = (options.model ?? process.env.OPENAI_MODEL ?? OPENAI_MODEL).trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(modelName)) throw new Error('OPENAI_MODEL must be a valid model ID.');
  const fetchImpl: Fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const selectedModel = (model = modelName) => {
    if (!isCloudModelId(model)) throw new ModelError('invalid-selection', 'Choose a valid OpenAI model.');
    return model;
  };

  return {
    status: () => (apiKey === ''
      ? { available: false }
      : { available: true, provider: 'OpenAI', model: modelName, endpoint: OPENAI_ENDPOINT }),

    payloadJson: (messages, model) => JSON.stringify({
      model: selectedModel(model),
      messages,
      stream: true,
      stream_options: { include_usage: true },
      // Preserve the established low-latency setting only for the two verified
      // Luna families. Other selected models use their own reasoning default.
      ...(['gpt-6-luna', 'gpt-5.6-luna'].some((id) => selectedModel(model) === id || selectedModel(model).startsWith(`${id}-`))
        ? { reasoning_effort: 'none' } : {}),
      max_completion_tokens: 300,      // same output cap as the local model
      store: false,
    }),

    advicePayloadJson: (messages, searchDocs, model) => JSON.stringify({
      model: selectedModel(model), input: messages, stream: true, store: false, max_output_tokens: 2_000,
      ...(searchDocs ? { tools: [{ type: 'web_search', filters: { allowed_domains: OPENAI_DOC_DOMAINS }, search_context_size: 'low' }],
        tool_choice: 'required', max_tool_calls: 3 } : {}),
    }),

    // Only an explicit UI metadata request calls this. Listing does not prove that a
    // model supports a given endpoint or web search; generation errors stay visible.
    async listModels(signal) {
      if (apiKey === '') throw new ModelError('cloud-unavailable', 'No OpenAI key is configured for this launch.');
      try {
        const response = await fetchImpl(OPENAI_MODELS_ENDPOINT, {
          method: 'GET', headers: { Authorization: `Bearer ${apiKey}` }, redirect: 'error',
          signal: AbortSignal.any([AbortSignal.timeout(15_000), ...(signal ? [signal] : [])]),
        });
        checkResponse(response);
        let text = '';
        let size = 0;
        const decoder = new TextDecoder();
        for await (const bytes of response.body!) {
          size += bytes.byteLength;
          if (size > 1_048_576) throw new ModelError('cloud-error', 'OpenAI model list exceeded the response limit.');
          text += decoder.decode(bytes, { stream: true });
        }
        const data = JSON.parse(text + decoder.decode()) as { data?: { id?: unknown }[] };
        if (!Array.isArray(data.data)) throw new SyntaxError();
        const models = [...new Set(data.data.map((item) => item?.id).filter(isCloudModelId))];
        if (models.length > 2_000) throw new ModelError('cloud-error', 'OpenAI model list exceeded the model limit.');
        return models.sort();
      } catch (error) { throw cloudError(error, signal); }
    },

    async *streamAdvice(payloadJson, signal) {
      if (apiKey === '') throw new ModelError('cloud-unavailable', 'No OpenAI key is configured for this launch.');
      try {
        const response = await fetchImpl(OPENAI_RESPONSES_ENDPOINT, {
          method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: payloadJson,
          redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(options.timeoutMs ?? 120_000), ...(signal ? [signal] : [])]),
        });
        checkResponse(response);
        const decoder = new TextDecoder();
        let buffer = '';
        let received = 0;
        for await (const bytes of response.body!) {
          received += bytes.byteLength;
          buffer += decoder.decode(bytes, { stream: true });
          if (received > 8 * 1024 * 1024 || buffer.length > 2 * 1024 * 1024) throw new ModelError('cloud-error', 'OpenAI output exceeded the response limit.');
          let newline: number;
          while ((newline = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
            if (!line.startsWith('data:')) continue;
            const raw: unknown = JSON.parse(line.slice(5).trim());
            if (!raw || typeof raw !== 'object') throw new SyntaxError();
            const event = raw as Record<string, unknown>;
            if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') yield { type: 'token', text: event.delta };
            if (event.type === 'error' || event.type === 'response.failed') throw new ModelError('cloud-error', 'OpenAI could not complete the request. Check model and web-search access.');
            if (event.type === 'response.completed' || event.type === 'response.incomplete') {
              const completed = readAdviceResponse(event.response);
              yield { type: 'done', ...completed, truncated: event.type === 'response.incomplete' }; return;
            }
          }
        }
        throw new ModelError('cloud-error', 'The OpenAI stream ended before finishing.');
      } catch (error) { throw cloudError(error, signal); }
    },

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
      checkResponse(response);

      const decoder = new TextDecoder();
      let buffered = '';
      let model: string | null = null;
      let truncated = false;
      let promptTokens: number | null = null;
      let outputTokens: number | null = null;
      try {
        for await (const bytes of response.body!) {
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

function checkResponse(response: Response): void {
  // Provider bodies can contain sensitive values; expose status and fixed guidance only.
  if (response.status === 401) throw new ModelError('cloud-error', 'OpenAI rejected the configured API key.');
  if (response.status === 403 || response.status === 404) throw new ModelError('cloud-error', `OpenAI returned HTTP ${response.status}. Check this API project's model permissions; set OPENAI_MODEL in Boozer's .env to an accessible model and restart. No fallback was used.`);
  if (response.status === 429) throw new ModelError('cloud-error', 'OpenAI rate-limited or declined the request (HTTP 429).');
  if (!response.ok || response.body === null) throw new ModelError('cloud-error', `OpenAI returned HTTP ${response.status}.`);
}

// Accept citation URLs only from provider annotations, never from model-written links.
// Replace their exact text ranges with stable markers for escaped, clickable UI output.
function readAdviceResponse(value: unknown): { text: string; model: string | null; webCitations: WebCitation[]; promptTokens: number | null; outputTokens: number | null } {
  const response = value as { model?: string; output?: { type?: string; content?: { type?: string; text?: string; annotations?: { type?: string; url?: string; title?: string; start_index?: number; end_index?: number }[] }[] }[]; usage?: { input_tokens?: number; output_tokens?: number } };
  if (!response || !Array.isArray(response.output)) throw new SyntaxError();
  const webCitations: WebCitation[] = [];
  const parts: string[] = [];
  for (const item of response.output) {
    if (item.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content.type !== 'output_text' || typeof content.text !== 'string') continue;
      const original = content.text;
      let text = '';
      let cursor = 0;
      for (const annotation of [...(content.annotations ?? [])].sort((a, b) => (a.start_index ?? 0) - (b.start_index ?? 0))) {
        const { start_index: start, end_index: end, url } = annotation;
        if (annotation.type !== 'url_citation' || typeof url !== 'string' || !isOfficialDocsUrl(url)
          || !Number.isInteger(start) || !Number.isInteger(end) || start! < cursor || end! < start! || end! > original.length) continue;
        const citation = { id: `W${webCitations.length + 1}`, url, title: (annotation.title || url).slice(0, 300) };
        webCitations.push(citation);
        text += original.slice(cursor, start) + `[${citation.id}]`; cursor = end!;
      }
      parts.push(text + original.slice(cursor));
    }
  }
  if (parts.length === 0 || parts.join('').trim() === '') throw new ModelError('cloud-error', 'OpenAI returned no answer text.');
  return { text: parts.join('\n\n'), model: typeof response.model === 'string' ? response.model : null, webCitations,
    promptTokens: response.usage?.input_tokens ?? null, outputTokens: response.usage?.output_tokens ?? null };
}

function cloudError(error: unknown, signal: AbortSignal | undefined): ModelError {
  if (error instanceof ModelError) return error;
  if (signal?.aborted) return new ModelError('cancelled', 'The explanation was cancelled.');
  if (error instanceof DOMException && error.name === 'TimeoutError') return new ModelError('timeout', 'OpenAI did not finish in time.');
  if (error instanceof SyntaxError) return new ModelError('cloud-error', 'OpenAI sent malformed output.');
  return new ModelError('cloud-error', 'Could not reach OpenAI.');
}
