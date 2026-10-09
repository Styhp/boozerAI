import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { MODEL_TAG, buildBenchmarkRequest, checkOutput, installedDigest, streamChat } from './request.js';

// Task 1.6 benchmark (boozer-model-benchmark skill): one cold run, then three warm runs,
// all with the same saved request. Opt-in because it takes minutes:
//   BOOZER_BENCHMARK=1 npm run test:model
// Failures are recorded as results, never retried away.

const run = promisify(execFile);
const ollamaBin = process.env.OLLAMA_BIN ?? `${homedir()}/.local/opt/ollama-v0.40.2/bin/ollama`;
const outDir = new URL('../../docs/benchmarks/', import.meta.url);
const label = process.env.BOOZER_BENCHMARK_LABEL ?? 'dev-mac';

async function sh(file: string, args: string[]) {
  return (await run(file, args, { timeout: 30_000 })).stdout;
}

// Approximate peak RSS of Ollama's model runner process, sampled once a second.
function sampleRunnerRss() {
  let peakKb = 0;
  const timer = setInterval(() => {
    sh('ps', ['-axo', 'rss=,command=']).then((out) => {
      for (const line of out.split('\n')) {
        const match = /^\s*(\d+)\s+(.*)$/.exec(line);
        // Ollama 0.40.2 serves the model from a `llama-server` child; older builds used `ollama runner`.
        if (match && /llama-server|ollama runner/.test(match[2]!)) peakKb = Math.max(peakKb, Number(match[1]));
      }
    }, () => undefined);
  }, 1_000);
  return () => { clearInterval(timer); return peakKb; };
}

describe.runIf(process.env.BOOZER_BENCHMARK === '1')('1.6 benchmark', () => {
  it('records one cold and three warm runs', async () => {
    const digest = await installedDigest();
    expect(digest, 'full digest is required provenance').toMatch(/^[0-9a-f]{64}$/);
    const runtime = (await sh(ollamaBin, ['--version'])).trim();
    const { request, snippets } = buildBenchmarkRequest();
    mkdirSync(outDir, { recursive: true });
    writeFileSync(new URL(`1.6-request.json`, outDir), `${JSON.stringify(request, null, 2)}\n`);

    // Ollama reuses the KV cache for an identical prompt prefix. A short unrelated request
    // before each warm-uncached run forces full prompt processing, as a newly selected file
    // would. The final warm-cached run shows the cache effect for reference only.
    const flush = {
      model: request.model, stream: false, think: false, keep_alive: request.keep_alive,
      options: { ...request.options, num_predict: 2 },
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
    };
    const runs = [];
    for (const condition of ['cold', 'warm-uncached', 'warm-uncached', 'warm-uncached', 'warm-cached'] as const) {
      if (condition === 'cold') await sh(ollamaBin, ['stop', MODEL_TAG]);
      if (condition === 'warm-uncached') await streamChat(flush);
      const alsoRunning = {
        loadavg: (await sh('sysctl', ['-n', 'vm.loadavg'])).trim(),
        topCpu: (await sh('ps', ['-axo', 'pcpu=,pmem=,comm=', '-r'])).split('\n').slice(0, 8).map((l) => l.trim()),
      };
      const stopSampling = sampleRunnerRss();
      const startedAt = new Date().toISOString();
      try {
        const result = await streamChat(request);
        const peakRssKb = stopSampling();
        const ns = (key: string) => Number(result.final[key] ?? NaN);
        runs.push({
          condition, startedAt, ok: true,
          loadS: ns('load_duration') / 1e9,
          promptTokens: ns('prompt_eval_count'),
          promptEvalS: ns('prompt_eval_duration') / 1e9,
          outputTokens: ns('eval_count'),
          evalS: ns('eval_duration') / 1e9,
          totalS: ns('total_duration') / 1e9,
          tokensPerS: ns('eval_count') / (ns('eval_duration') / 1e9),
          ttftS: result.ttftMs === null ? null : result.ttftMs / 1000,
          clientTotalS: result.clientTotalMs / 1000,
          doneReason: result.final.done_reason,
          peakRunnerRssMiB: Math.round(peakRssKb / 1024),
          processor: (await sh(ollamaBin, ['ps'])).trim(),
          ...checkOutput(result.content, result.thinking, snippets.map((s) => s.id)),
          alsoRunning,
          content: result.content,
          thinking: result.thinking,
        });
      } catch (error) {
        stopSampling();
        runs.push({ condition, startedAt, ok: false, error: String(error), alsoRunning });
      }
    }
    const record = {
      date: new Date().toISOString(), label, runtime, model: MODEL_TAG, digest,
      settings: { think: request.think, ...request.options }, snippets, runs,
    };
    writeFileSync(new URL(`1.6-${label}-raw.json`, outDir), `${JSON.stringify(record, null, 2)}\n`);
    expect(runs.filter((r) => !r.ok)).toEqual([]);
  }, 1_800_000);
});
