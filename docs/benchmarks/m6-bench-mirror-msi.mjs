// M6 mirror of tests/model/benchmark.test.ts for Linux. Same saved request
// (docs/benchmarks/1.6-request.json), same run sequence, same output checks.
// Differences: Linux loadavg (/proc/loadavg) and `ps --sort=-pcpu` replace macOS sysctl/ps -r,
// plus one extra 'new-file-uncached' run (different selected file and snippet order).
// Usage: node bench-msi.mjs <repo> <out.json> [label]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [repo, outFile, label = 'msi'] = process.argv.slice(2);
const OLLAMA = 'http://127.0.0.1:11434';
const BIN = `${process.env.HOME}/.local/opt/ollama-v0.40.2/bin/ollama`;
const CANARY = 'BZR-CANARY-ORCHID-7731';
const request = JSON.parse(readFileSync(`${repo}/docs/benchmarks/1.6-request.json`, 'utf8'));
const ids = ['S1', 'S2', 'S3'];
const sh = (f, a) => execFileSync(f, a, { encoding: 'utf8', timeout: 30_000 });

async function streamChat(req) {
  const started = performance.now();
  const res = await fetch(`${OLLAMA}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req), redirect: 'error', signal: AbortSignal.timeout(300_000) });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  let content = '', thinking = '', ttftMs = null, final = {}, buf = '';
  const dec = new TextDecoder();
  for await (const bytes of res.body) {
    buf += dec.decode(bytes, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line) continue;
      const c = JSON.parse(line);
      if (c.error) throw new Error(`Ollama error: ${c.error}`);
      const p = c.message?.content ?? '', t = c.message?.thinking ?? '';
      if (ttftMs === null && (p || t)) ttftMs = performance.now() - started;
      content += p; thinking += t;
      if (c.done) final = c;
    }
  }
  return { content, thinking, ttftMs, clientTotalMs: performance.now() - started, final };
}

function check(content, thinking) {
  const markers = [...content.matchAll(/\[(S\d+(?:\s*,\s*S\d+)*)\]/g)].flatMap((m) => m[1].split(/\s*,\s*/));
  return { citations: markers.length, invalidCitations: markers.filter((id) => !ids.includes(id)),
    canaryLeaked: content.includes(CANARY) || thinking.includes(CANARY),
    thinkingAppeared: thinking.trim() !== '' || /<think>/i.test(content) };
}

// Approximate peak RSS: model runner process, and all ollama-binary processes together.
function sampler() {
  let runnerKb = 0, allKb = 0, minAvailKb = Infinity;
  const t = setInterval(() => {
    try {
      let sum = 0;
      for (const line of sh('ps', ['-eo', 'rss=,args=']).split('\n')) {
        const m = /^\s*(\d+)\s+(.*)$/.exec(line);
        if (!m || !/ollama-v0\.40\.2|llama-server/.test(m[2])) continue;
        sum += Number(m[1]);
        if (/llama-server|ollama runner|\brunner\b/.test(m[2])) runnerKb = Math.max(runnerKb, Number(m[1]));
      }
      allKb = Math.max(allKb, sum);
      const avail = /MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo', 'utf8'));
      if (avail) minAvailKb = Math.min(minAvailKb, Number(avail[1]));
    } catch {}
  }, 1_000);
  return () => { clearInterval(t); return { peakRunnerRssMiB: Math.round(runnerKb / 1024), peakOllamaTotalRssMiB: Math.round(allKb / 1024), minMemAvailableMiB: Math.round(minAvailKb / 1024) }; };
}

const flush = { model: request.model, stream: false, think: false, keep_alive: request.keep_alive,
  options: { ...request.options, num_predict: 2 }, messages: [{ role: 'user', content: 'Reply with the single word OK.' }] };

// A newly selected file: different user message from its first token, same system prompt and settings.
const user = request.messages[1].content;
const snippetBlocks = user.slice(user.indexOf('<snippet')).split('</snippet>\n\n').map((b, i, a) => i < a.length - 1 ? `${b}</snippet>` : b);
if (snippetBlocks.length !== 3) throw new Error('snippet split failed');
const newFile = { ...request, messages: [request.messages[0], { role: 'user',
  content: `Explain what the file inventory.ts does and how it relates to the other snippets.\n\n${[snippetBlocks[1], snippetBlocks[0], snippetBlocks[2]].join('\n\n')}` }] };

const tags = await (await fetch(`${OLLAMA}/api/tags`)).json();
const digest = tags.models.find((m) => m.name === request.model)?.digest;
if (!/^[0-9a-f]{64}$/.test(digest ?? '')) throw new Error('full digest missing: benchmark blocked');
const runtime = (await (await fetch(`${OLLAMA}/api/version`)).json()).version;

const runs = [];
for (const condition of ['cold', 'warm-uncached', 'warm-uncached', 'warm-uncached', 'warm-cached', 'new-file-uncached']) {
  if (condition === 'cold') sh(BIN, ['stop', request.model]);
  if (condition === 'warm-uncached') await streamChat(flush);
  const alsoRunning = { loadavg: readFileSync('/proc/loadavg', 'utf8').trim(),
    topCpu: sh('ps', ['-eo', 'pcpu=,pmem=,comm=', '--sort=-pcpu']).split('\n').slice(0, 8).map((l) => l.trim()) };
  const stop = sampler();
  const startedAt = new Date().toISOString();
  try {
    const r = await streamChat(condition === 'new-file-uncached' ? newFile : request);
    const mem = stop();
    const ns = (k) => Number(r.final[k] ?? NaN);
    runs.push({ condition, startedAt, ok: true, loadS: ns('load_duration') / 1e9, promptTokens: ns('prompt_eval_count'),
      promptEvalS: ns('prompt_eval_duration') / 1e9, outputTokens: ns('eval_count'), evalS: ns('eval_duration') / 1e9,
      totalS: ns('total_duration') / 1e9, tokensPerS: ns('eval_count') / (ns('eval_duration') / 1e9),
      ttftS: r.ttftMs === null ? null : r.ttftMs / 1000, clientTotalS: r.clientTotalMs / 1000, doneReason: r.final.done_reason,
      ...mem, ollamaPs: sh(BIN, ['ps']).trim(), ...check(r.content, r.thinking), alsoRunning, content: r.content, thinking: r.thinking });
  } catch (e) {
    stop(); runs.push({ condition, startedAt, ok: false, error: String(e), alsoRunning });
  }
  const last = runs.at(-1);
  console.log(condition, last.ok ? `ttft=${last.ttftS?.toFixed(2)} total=${last.totalS.toFixed(2)} prompt=${last.promptTokens} out=${last.outputTokens} tok/s=${last.tokensPerS.toFixed(2)} runnerRSS=${last.peakRunnerRssMiB} minAvail=${last.minMemAvailableMiB} canary=${last.canaryLeaked} invalid=${last.invalidCitations.length}\n${last.ollamaPs}` : last.error);
}
writeFileSync(outFile, `${JSON.stringify({ date: new Date().toISOString(), label, runtime, model: request.model, digest,
  settings: { think: request.think, ...request.options }, harness: 'M6 Linux mirror of tests/model/benchmark.test.ts', runs }, null, 2)}\n`);
