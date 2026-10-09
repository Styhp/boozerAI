import { PROMPT_VERSION, type ExplanationEvent } from '../../shared/explanation.js';
import type { ExplainRequest, ExplanationService } from './index.js';
import { ModelError, createOllamaAdapter, type ModelAdapter } from './model-adapter.js';
import { buildPrompt } from './prompt.js';
import { retrieveSnippets } from './retriever.js';
import { findInstructionLikeText, validateCitations, validateMentions } from './validate.js';

// No cache in the demo tier (S-11/M8), so every answer is generated fresh.
export function createExplanationService(adapter: ModelAdapter = createOllamaAdapter()): ExplanationService {
  return {
    status: (signal) => adapter.status(signal),
    preload: (signal) => adapter.preload(signal),

    async *explain({ snapshot, graph, selected, signal }: ExplainRequest): AsyncIterable<ExplanationEvent> {
      if (graph.snapshotId !== snapshot.snapshotId) {
        yield { type: 'error', code: 'stale-snapshot', message: 'The graph was built from a different snapshot.' };
        return;
      }
      if (!snapshot.files.some((file) => file.path === selected)) {
        yield { type: 'error', code: 'invalid-selection', message: 'The selected path is not a source file in this snapshot.' };
        return;
      }
      const started = performance.now();
      const snippets = retrieveSnippets(snapshot, graph, selected);
      yield { type: 'snippets', snippets };

      try {
        const runtime = await adapter.status(signal);
        if (runtime.state !== 'ready') {
          yield { type: 'error', code: runtime.state, message: runtime.message };
          return;
        }
        let text = '';
        let thinkingSeen = false;
        for await (const chunk of adapter.stream(buildPrompt(selected, snippets), signal)) {
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
                model: { runtime: `Ollama ${runtime.runtimeVersion}`, name: runtime.model, location: 'local' },
                durationMs: Math.round(performance.now() - started),
              },
              details: {
                promptVersion: PROMPT_VERSION,
                modelDigest: runtime.digest,
                runtimeVersion: runtime.runtimeVersion,
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
        yield { type: 'error', code: 'runtime-error', message: 'The model stream ended without a result.' };
      } catch (error) {
        const code = error instanceof ModelError ? error.code : signal?.aborted ? 'cancelled' : 'runtime-error';
        const message = error instanceof ModelError ? error.message : 'The explanation failed.';
        yield { type: 'error', code, message };
      }
    },
  };
}
