import { createHash } from 'node:crypto';
import type { Snippet } from '../../shared/contracts.js';
import { PROMPT_VERSION, type CloudPreview, type ExplanationEvent } from '../../shared/explanation.js';
import { createOpenAIAdapter, type CloudAdapter } from './cloud-adapter.js';
import type { CloudComparison, CloudPreviewResult, ExplainRequest, ExplanationService } from './index.js';
import { ModelError, createOllamaAdapter, type ChatMessage, type ModelAdapter } from './model-adapter.js';
import { buildPrompt } from './prompt.js';
import { retrieveSnippets } from './retriever.js';
import { findInstructionLikeText, validateCitations, validateMentions } from './validate.js';
import { createRepoChatService } from './chat-service.js';
import type { RepoChatService } from '../../shared/repo-chat.js';
import { createCloudRepoChatService, type CloudRepoChatService } from './cloud-chat-service.js';

// No cache in the demo tier (S-11/M8), so every answer is generated fresh. Local and
// cloud answers share retrieval, prompt and validation so they are directly comparable,
// and a failure on one provider never switches to the other.

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

type Prepared =
  | { readonly ok: true; readonly snippets: Snippet[]; readonly messages: ChatMessage[] }
  | { readonly ok: false; readonly code: 'stale-snapshot' | 'invalid-selection' | 'no-excerpt'; readonly message: string };

function prepare({ snapshot, graph, selected }: ExplainRequest): Prepared {
  if (graph.snapshotId !== snapshot.snapshotId) {
    return { ok: false, code: 'stale-snapshot', message: 'The graph was built from a different snapshot.' };
  }
  if (!snapshot.files.some((file) => file.path === selected)) {
    return { ok: false, code: 'invalid-selection', message: 'The selected path is not a source file in this snapshot.' };
  }
  const snippets = retrieveSnippets(snapshot, graph, selected);
  // M3 review F1: no exact excerpt of the selected file means no model call, local or cloud.
  if (snippets[0]?.ref.file !== selected) {
    return {
      ok: false, code: 'no-excerpt',
      message: 'No exact excerpt of this file fits the explanation budget (its first line is too long), so nothing was sent to the model.',
    };
  }
  return { ok: true, snippets, messages: buildPrompt(selected, snippets) };
}

export function createExplanationService(
  adapter: ModelAdapter = createOllamaAdapter(),
  cloud: CloudAdapter = createOpenAIAdapter(),
): ExplanationService & CloudComparison & RepoChatService & CloudRepoChatService {
  return {
    ...createRepoChatService(adapter),
    ...createCloudRepoChatService(cloud),
    status: (signal) => adapter.status(signal),
    preload: (signal) => adapter.preload(signal),
    cloudStatus: () => cloud.status(),

    previewCloud(request): CloudPreviewResult {
      const status = cloud.status();
      if (!status.available) return { type: 'error', code: 'cloud-unavailable', message: 'No cloud provider is configured for this launch.' };
      const prepared = prepare(request);
      if (!prepared.ok) return { type: 'error', code: prepared.code, message: prepared.message };
      const payloadJson = cloud.payloadJson(prepared.messages);
      const preview: CloudPreview = {
        provider: status.provider,
        endpoint: status.endpoint,
        model: status.model,
        payload: JSON.parse(payloadJson) as unknown,
        payloadJson,
        previewHash: sha256(payloadJson),
        suspectedInjections: findInstructionLikeText(prepared.snippets),
      };
      return { type: 'preview', preview };
    },

    async *explain(request: ExplainRequest): AsyncIterable<ExplanationEvent> {
      const { snapshot, selected, signal } = request;
      const provider = request.provider ?? 'local';
      const prepared = prepare(request);
      if (!prepared.ok) {
        yield { type: 'error', code: prepared.code, message: prepared.message };
        return;
      }
      const { snippets, messages } = prepared;
      const started = performance.now();

      // Cloud only with a key and only for exactly the payload the user confirmed.
      let payloadJson = '';
      const cloudStatus = cloud.status();
      if (provider === 'cloud') {
        if (!cloudStatus.available) {
          yield { type: 'error', code: 'cloud-unavailable', message: 'No cloud provider is configured for this launch.' };
          return;
        }
        payloadJson = cloud.payloadJson(messages);
        if (request.previewHash !== sha256(payloadJson)) {
          yield { type: 'error', code: 'preview-mismatch', message: 'The request differs from the preview you confirmed. Preview it again before sending.' };
          return;
        }
      }
      yield { type: 'snippets', snippets };

      try {
        let label: { runtime: string; name: string; location: 'local' | 'cloud'; digest: string | null; runtimeVersion: string };
        let chunks: AsyncIterable<
          | { type: 'token'; text: string } | { type: 'thinking' }
          | { type: 'done'; promptTokens: number | null; outputTokens: number | null; truncated: boolean; model?: string | null }>;
        if (provider === 'cloud') {
          label = { runtime: 'OpenAI API', name: cloudStatus.available ? cloudStatus.model : '', location: 'cloud', digest: null, runtimeVersion: 'OpenAI Chat Completions' };
          chunks = cloud.stream(payloadJson, signal);
        } else {
          const runtime = await adapter.status(signal);
          if (runtime.state !== 'ready') {
            yield { type: 'error', code: runtime.state, message: runtime.message };
            return;
          }
          label = { runtime: `Ollama ${runtime.runtimeVersion}`, name: runtime.model, location: 'local', digest: runtime.digest, runtimeVersion: runtime.runtimeVersion };
          chunks = adapter.stream(messages, signal);
        }

        let text = '';
        let thinkingSeen = false;
        for await (const chunk of chunks) {
          if (chunk.type === 'thinking') thinkingSeen = true;
          else if (chunk.type === 'token') {
            text += chunk.text;
            yield { type: 'token', text: chunk.text };
          } else {
            yield {
              type: 'done',
              explanation: {
                text,
                snippets,
                citations: validateCitations(text, snippets),
                // For cloud, the model the provider reports having used is the source of truth.
                model: { runtime: label.runtime, name: chunk.model ?? label.name, location: label.location },
                durationMs: Math.round(performance.now() - started),
              },
              details: {
                promptVersion: PROMPT_VERSION,
                modelDigest: label.digest,
                runtimeVersion: label.runtimeVersion,
                promptTokens: chunk.promptTokens,
                outputTokens: chunk.outputTokens,
                truncated: chunk.truncated,
                thinkingSeen,
                mentions: validateMentions(text, snapshot),
                suspectedInjections: findInstructionLikeText(snippets),
              },
            };
            return;
          }
        }
        yield { type: 'error', code: provider === 'cloud' ? 'cloud-error' : 'runtime-error', message: 'The model stream ended without a result.' };
      } catch (error) {
        const code = error instanceof ModelError ? error.code : signal?.aborted ? 'cancelled' : provider === 'cloud' ? 'cloud-error' : 'runtime-error';
        const message = error instanceof ModelError ? error.message : 'The explanation failed.';
        yield { type: 'error', code, message };
      }
    },
  };
}
