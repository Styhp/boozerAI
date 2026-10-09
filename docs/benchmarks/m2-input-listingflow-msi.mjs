// Manual MSI ListingFlow regression probe. Uses installed Chromium and real input/parser; no target code executes.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../dist/server/app.js';
import { launchSession } from '../../dist/server/launcher.js';
import { createExplanationService } from '../../dist/server/explain/index.js';
const profile = await mkdtemp(join(tmpdir(), 'boozer-listingflow-browser-'));
const session = await launchSession(['--project', '/home/boozer/ListingFlow']);
const server = createServer(await createApp(false, { session, service: createExplanationService() }));
let browser, ws;
const records = [];
let summary;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4173, '127.0.0.1', resolve); });
  browser = spawn('/usr/bin/chromium', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; }
    catch { await pause(100); }
  }
  if (!port) throw new Error('Chromium debugging endpoint did not start');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', ({ data }) => {
    const value = JSON.parse(data);
    if (pending.has(value.id)) { pending.get(value.id)(value); pending.delete(value.id); }
  });
  const send = async (method, params = {}) => {
    const next = ++id;
    const response = new Promise((resolve) => pending.set(next, resolve));
    ws.send(JSON.stringify({ id: next, method, params }));
    const value = await response;
    if (value.error) throw new Error('Browser protocol failed');
    return value.result;
  };
  const evaluate = async (expression) => {
    const value = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (value.exceptionDetails) throw new Error('Browser evaluation failed');
    return value.result?.value;
  };
  const waitFor = async (expression, label) => {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) { records.push({ check: label, passed: true }); return; } await pause(100); }
    throw new Error(`Timed out: ${label}`);
  };
  const click = (text) => evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(text)})?.click()`);
  await send('Page.enable');
  await send('Page.navigate', { url: session.launchUrl(false) }); // capability remains in memory; never printed.
  await waitFor(`document.body.innerText.includes('Open ListingFlow?')`, 'ListingFlow requires confirmation before indexing');
  if (session.descriptor()?.state !== 'selected') throw new Error('Indexed before confirmation');
  const started = performance.now();
  await click('Read this folder');
  await waitFor(`document.body.innerText.includes('Open another folder') && document.body.innerText.includes('Chat Boozer')`, 'Confirmed ListingFlow opens the graph workspace');
  const { snapshot, response } = session.current(session.descriptor().id);
  if (snapshot.files.length !== 314) throw new Error('Unexpected primary source count');
  if (snapshot.files.some(({ path }) => path.includes('.claude/worktrees/'))) throw new Error('Duplicate sources retained');
  if (!snapshot.inventory.prunedDirectories.some(({ path }) => path === '.claude/worktrees')) throw new Error('Missing pruned worktree inventory');
  records.push({ check: '314 primary sources indexed; duplicate worktrees excluded and reported', passed: true });
  summary = {
    sourceFiles: snapshot.files.length, sourceBytes: snapshot.files.reduce((sum, file) => sum + file.sizeBytes, 0),
    prunedDirectories: snapshot.inventory.prunedDirectories.length,
    graphFiles: response.graph.files.length, graphEdges: response.graph.edges.length,
    coverage: {
      files: Object.fromEntries(Object.entries(response.graph.coverage.files).filter(([, value]) => typeof value === 'number')),
      imports: Object.fromEntries(Object.entries(response.graph.coverage.imports).filter(([, value]) => typeof value === 'number')),
      gapReasons: response.graph.coverage.imports.issues.reduce((counts, { reason }) => {
        counts[reason] = (counts[reason] ?? 0) + 1; return counts;
      }, {}),
    },
    confirmToWorkspaceMs: Math.round(performance.now() - started),
  };
  await send('Page.reload');
  await waitFor(`document.body.innerText.includes('Open another folder') && document.body.innerText.includes('314 files')`, 'Reload restores the ListingFlow graph and file count');

} catch (error) {
  records.push({ check: 'ListingFlow browser flow', passed: false, error: String(error) });
  process.exitCode = 1;
} finally {
  session.close();
  ws?.close();
  browser?.kill('SIGTERM');
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (browser && browser.exitCode === null) await new Promise((resolve) => browser.once('exit', resolve));
  await rm(profile, { recursive: true, force: true });
  await writeFile('docs/benchmarks/m2-input-listingflow-msi.json', JSON.stringify({ at: new Date().toISOString(), node: process.version, records, summary }, null, 2) + '\n');
  console.log(JSON.stringify({ records, summary }, null, 2));
}
