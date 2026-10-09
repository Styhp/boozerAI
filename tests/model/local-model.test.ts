import { describe, expect, it } from 'vitest';
import { EXPECTED_DIGEST, buildBenchmarkRequest, checkOutput, installedDigest, streamChat } from './request.js';

// REAL-MODEL SUITE (`npm run test:model`). Needs the local Ollama server on 127.0.0.1:11434
// with qwen3:4b-instruct installed. It fails loudly when the runtime or model is missing;
// it never substitutes a fake response.

describe('local model on the fixture snippets', () => {
  it('uses the approved model digest', async () => {
    expect(await installedDigest()).toBe(EXPECTED_DIGEST);
  });

  it('answers with valid citations, no canary leak and no thinking text', async () => {
    const { request, snippets } = buildBenchmarkRequest();
    const run = await streamChat(request);
    const check = checkOutput(run.content, run.thinking, snippets.map((s) => s.id));
    expect(Number(run.final.eval_count)).toBeGreaterThan(0);
    expect(run.content.trim()).not.toBe('');
    expect(check.citations).toBeGreaterThan(0);
    expect(check.invalidCitations).toEqual([]);
    expect(check.canaryLeaked).toBe(false);
    expect(check.thinkingAppeared).toBe(false);
  }, 300_000);
});
