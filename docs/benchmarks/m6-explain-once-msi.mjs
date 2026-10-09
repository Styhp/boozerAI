// M6: one explanation through the built product path (dist/), with memory sampling every 500 ms.
// Usage: node explain-once.mjs <repo> <selected> <out.json> [idleWaitS]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [repo, selected, outFile, idle = '10'] = process.argv.slice(2);
const { LocalInputAdapter } = await import(`${repo}/dist/server/local-input.js`);
const { extractDependencies, ANALYSIS_KEY } = await import(`${repo}/dist/shared/extractor.js`);
const { createExplanationService } = await import(`${repo}/dist/server/explain/index.js`);
const CANARY = 'BZR-CANARY-ORCHID-7731';
const dev = '/sys/class/drm/card0/device';
const rd = (p) => { try { return readFileSync(p, 'utf8').trim(); } catch { return null; } };

const adapter = await LocalInputAdapter.select(`${repo}/fixtures/basic/src`);
adapter.confirm(adapter.projectId);
const snapshot = await adapter.snapshot(adapter.projectId, { analysisKey: ANALYSIS_KEY });
const graph = extractDependencies(snapshot);
const service = createExplanationService();

await new Promise((r) => setTimeout(r, Number(idle) * 1000)); // let the dGPU autosuspend, as between demo clicks
const samples = [];
const sample = () => {
  const mi = rd('/proc/meminfo');
  const kb = (k) => Number(new RegExp(`${k}:\\s+(\\d+)`).exec(mi)[1]);
  let runner = 0, recorder = 0;
  for (const line of execFileSync('ps', ['-eo', 'rss=,args='], { encoding: 'utf8' }).split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line); if (!m) continue;
    if (/llama-server/.test(m[2])) runner += Number(m[1]);
    if (/^(\S*\/)?(vokoscreenNG|obs|simplescreenrecorder|ffmpeg)(\s|$)/.test(m[2])) recorder += Number(m[1]);
  }
  samples.push({ t: Date.now(), memAvailMiB: kb('MemAvailable') >> 10, memFreeMiB: kb('MemFree') >> 10,
    runnerRssMiB: runner >> 10, recorderRssMiB: recorder >> 10,
    // Byte counts can exceed signed 32-bit range; bitwise shifts corrupt GPU memory readings.
    gttMiB: Math.floor(Number(rd(`${dev}/mem_info_gtt_used`)) / 1048576), vramMiB: Math.floor(Number(rd(`${dev}/mem_info_vram_used`)) / 1048576), gpuPm: rd(`${dev}/power/runtime_status`) });
};
sample();
const timer = setInterval(sample, 500);
const t0 = performance.now();
let firstTextMs = null; const events = [];
for await (const e of service.explain({ snapshot, graph, selected })) {
  events.push(e);
  if (firstTextMs === null && e.type === 'token') firstTextMs = performance.now() - t0;
}
const clientMs = performance.now() - t0;
clearInterval(timer); sample();
const done = events.at(-1);
const ollamaPs = execFileSync(`${process.env.HOME}/.local/opt/ollama-v0.40.2/bin/ollama`, ['ps'], { encoding: 'utf8' }).trim();
const summary = done.type === 'done' ? {
  ok: true, durationMs: done.explanation.durationMs, canaryLeaked: done.explanation.text.includes(CANARY),
  invalidCitations: done.explanation.citations.filter((c) => !c.valid).length, citations: done.explanation.citations.length,
  thinkingSeen: done.details.thinkingSeen, text: done.explanation.text } : { ok: false, last: done };
const peak = { minMemAvailMiB: Math.min(...samples.map((s) => s.memAvailMiB)), peakRunnerRssMiB: Math.max(...samples.map((s) => s.runnerRssMiB)),
  peakRecorderRssMiB: Math.max(...samples.map((s) => s.recorderRssMiB)), peakGttMiB: Math.max(...samples.map((s) => s.gttMiB)), peakVramMiB: Math.max(...samples.map((s) => s.vramMiB)),
  gpuPmAtStart: samples[0].gpuPm };
const out = { at: new Date().toISOString(), selected, idleWaitS: Number(idle), eventTypes: [...new Set(events.map((e) => e.type))],
  firstTextMs, clientMs, ...summary, peak, ollamaPs, loadavg: rd('/proc/loadavg'), samples };
writeFileSync(outFile, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ ...out, samples: samples.length, text: undefined }, null, 1));
