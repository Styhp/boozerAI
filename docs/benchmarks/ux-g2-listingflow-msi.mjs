// Manual MSI animated-graph probe. Uses installed Chromium and real input/parser; no target code executes.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../dist/server/app.js';
import { launchSession } from '../../dist/server/launcher.js';
import { createExplanationService } from '../../dist/server/explain/index.js';
const profile = await mkdtemp(join(tmpdir(), 'boozer-graph-browser-'));
const session = await launchSession(['--project', '/home/boozer/ListingFlow']);
const server = createServer(await createApp(false, { session, service: createExplanationService() }));
let browser, ws;
const records = [];
let summary;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4173, '127.0.0.1', resolve); });
  browser = spawn('/usr/bin/chromium', ['--headless=new', '--window-size=1440,1000', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
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
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__graphProbe = { frames: 0, points: [] };
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    const arc = CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.clearRect = function(...args) {
      if (this.canvas.getAttribute('role') === 'img') { window.__graphProbe.frames++; window.__graphProbe.points = []; }
      return clear.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.arc = function(x, y, radius, ...args) {
      if (this.canvas.getAttribute('role') === 'img' && radius >= 1 && window.__graphProbe.points.length < 1000)
        window.__graphProbe.points.push({ x, y, radius });
      return arc.call(this, x, y, radius, ...args);
    };
  ` });
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
  await waitFor(`!document.querySelector('.ws-graph canvas') && document.body.innerText.includes('Choose a folder to show the animated graph')`, 'Large project exposes graph controls without silently truncating the graph');
  await evaluate(`(() => {
    const select = document.querySelector('[aria-label="Choose graph folder"]');
    select.value = 'server/'; select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(`document.querySelector('.ws-graph canvas')?.width > 0 && window.__graphProbe.frames > 2`, 'Choosing server/ mounts and paints the animated canvas');
  summary.scope = 'server/';
  summary.scopeCounts = await evaluate(`document.querySelector('.ws-graph-scope [role="status"]').textContent`);
  const motion = await evaluate(`(async () => {
    const canvas = document.querySelector('.ws-graph canvas');
    const before = canvas.toDataURL(); const frame = window.__graphProbe.frames;
    await new Promise(resolve => setTimeout(resolve, 350));
    return { frames: window.__graphProbe.frames - frame, pixelsChanged: before !== canvas.toDataURL(), width: canvas.width, height: canvas.height };
  })()`);
  if (motion.frames < 2 || !motion.pixelsChanged || motion.width < 100 || motion.height < 100) throw new Error('Canvas motion not observed');
  summary.motion = motion;
  records.push({ check: 'Canvas renders multiple changed frames at usable dimensions', passed: true });
  // Fit after the initial force expansion, then use actual pointer events on painted dots.
  await evaluate(`document.querySelector('[aria-label="Fit graph"]').click()`);
  await pause(1500);
  let hovered = false;
  let hoverPoint;
  for (let attempt = 0; attempt < 12; attempt++) {
    const point = await evaluate(`(() => {
      const rect = document.querySelector('.ws-graph canvas').getBoundingClientRect();
      const points = window.__graphProbe.points.filter(p => p.x > 70 && p.x < rect.width - 70 && p.y > 100 && p.y < rect.height - 100).sort((a, b) => b.radius - a.radius);
      const p = points[${attempt} % points.length]; return p ? { x: p.x + rect.x, y: p.y + rect.y } : null;
    })()`);
    if (!point) continue;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await pause(50);
    if (await evaluate(`Boolean(document.querySelector('.ws-hovercard'))`)) { hovered = true; hoverPoint = point; break; }
  }
  if (!hovered) throw new Error('Pointer hover card did not appear');
  records.push({ check: 'Moving pointer onto a painted node opens its hover card', passed: true });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...hoverPoint, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hoverPoint.x - 40, y: hoverPoint.y - 40, buttons: 1 });
  if (!await evaluate(`document.querySelector('.ws-graph canvas').dataset.cursor === 'grabbing'`)) throw new Error('Graph drag did not engage');
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hoverPoint.x - 40, y: hoverPoint.y - 40, button: 'left', clickCount: 1 });
  records.push({ check: 'Actual pointer drag engages graph interaction', passed: true });
  const rect = await evaluate(`(() => { const r = document.querySelector('.ws-graph canvas').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...rect, deltaX: 0, deltaY: -100 });
  await evaluate(`document.querySelector('[aria-label="Fit graph"]').click()`);
  await pause(500);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 20, y: 20 });
  await pause(100);
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile('/tmp/boozer-listingflow-graph-msi.png', Buffer.from(screenshot.data, 'base64'));
  const search = (query) => evaluate(`(() => {
    const input = document.querySelector('[aria-label="Graph filter"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(query)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await search('client/');
  await waitFor(`!document.querySelector('.ws-graph canvas') && document.body.innerText.includes('Narrow the filter')`, 'An over-cap folder does not draw an arbitrary subset');
  await search('no-such-folder/');
  await waitFor(`!document.querySelector('.ws-graph canvas') && document.body.innerText.includes('No files match this view')`, 'An unmatched search has an explicit empty state');
  await search('SERVER/');
  await waitFor(`document.querySelector('.ws-graph canvas')?.width > 0 && document.body.innerText.includes('Showing 116 of 314 files')`, 'Case-insensitive search restores the animated subset and full-project counts');
  await click('Clear graph filter');
  await waitFor(`!document.querySelector('.ws-graph canvas') && document.querySelector('[aria-label="Graph filter"]').value === ''`, 'Clearing the filter returns to the complete list-first view');
  await send('Page.reload');
  await waitFor(`document.body.innerText.includes('Open another folder') && document.body.innerText.includes('314 files')`, 'Reload restores the ListingFlow graph and file count');

} catch (error) {
  records.push({ check: 'ListingFlow animated graph flow', passed: false, error: String(error) });
  process.exitCode = 1;
} finally {
  session.close();
  ws?.close();
  browser?.kill('SIGTERM');
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (browser && browser.exitCode === null) await new Promise((resolve) => browser.once('exit', resolve));
  await rm(profile, { recursive: true, force: true });
  await writeFile('docs/benchmarks/ux-g2-listingflow-msi.json', JSON.stringify({ at: new Date().toISOString(), node: process.version, records, summary }, null, 2) + '\n');
  console.log(JSON.stringify({ records, summary }, null, 2));
}
