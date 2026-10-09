// Manual MSI graph-click regression probe. Uses installed Chromium and real input/parser; no target code executes.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../dist/server/app.js';
import { launchSession } from '../../dist/server/launcher.js';
import { createExplanationService } from '../../dist/server/explain/index.js';
const profile = await mkdtemp(join(tmpdir(), 'boozer-click-browser-'));
const session = await launchSession(['--project', '/home/boozer/boozer-ai']);
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
    window.__graphProbe = { frames: 0, points: [], events: [] };
    for (const type of ['pointerdown', 'pointerup', 'pointercancel']) window.addEventListener(type, event => {
      window.__graphProbe.events.push({ type, target: event.target.tagName });
    }, true);
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    const arc = CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.clearRect = function(...args) {
      if (this.canvas.getAttribute('role') === 'img') { window.__graphProbe.frames++; window.__graphProbe.points = []; }
      return clear.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.arc = function(x, y, radius, ...args) {
      if (this.canvas.getAttribute('role') === 'img' && radius >= 1 && window.__graphProbe.points.length < 1000)
        window.__graphProbe.points.push({ x, y, radius, alpha: (String(this.fillStyle).startsWith('rgba(') ? Number(String(this.fillStyle).split(',').at(-1).slice(0, -1)) : 1) * this.globalAlpha });
      return arc.call(this, x, y, radius, ...args);
    };
  ` });
  await send('Page.navigate', { url: session.launchUrl(false) }); // capability remains in memory; never printed.
  await waitFor(`document.body.innerText.includes('Open boozer-ai?')`, 'Boozer requires confirmation before indexing');
  if (session.descriptor()?.state !== 'selected') throw new Error('Indexed before confirmation');
  const started = performance.now();
  await click('Read this folder');
  await waitFor(`document.body.innerText.includes('Open another folder') && document.body.innerText.includes('Chat Boozer')`, 'Confirmed Boozer opens the graph workspace');
  const { snapshot, response } = session.current(session.descriptor().id);
  summary = { sourceFiles: snapshot.files.length, graphEdges: response.graph.edges.length };
  await waitFor(`document.querySelector('.ws-graph canvas')?.width > 0 && window.__graphProbe.frames > 2`, 'Boozer own-repo canvas mounts');
  const motion = await evaluate(`(async () => {
    const canvas = document.querySelector('.ws-graph canvas');
    const before = canvas.toDataURL(); const frame = window.__graphProbe.frames;
    await new Promise(resolve => setTimeout(resolve, 350));
    return { frames: window.__graphProbe.frames - frame, pixelsChanged: before !== canvas.toDataURL(), width: canvas.width, height: canvas.height };
  })()`);
  if (motion.frames < 2 || !motion.pixelsChanged || motion.width < 100 || motion.height < 100) throw new Error('Canvas motion not observed');
  summary.motion = motion;
  records.push({ check: 'Canvas renders multiple changed frames at usable dimensions', passed: true });
  // Let the actual force simulation settle so a recorded coordinate stays on the same dot.
  await pause(12_000);
  // Fit, then use actual pointer events on painted dots.
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
  const first = await evaluate(`document.querySelector('.ws-hovercard h4')?.textContent`);
  summary.hoveredFile = response.graph.files.some(({ path }) => path === first);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...hoverPoint, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...hoverPoint, button: 'left', clickCount: 1 });
  await pause(300);
  summary.firstClick = await evaluate(`({ expected: ${JSON.stringify(first)}, actual: document.querySelector('.detail h2')?.textContent, events: window.__graphProbe.events })`);
  const clickScreenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile('/tmp/boozer-graph-click-msi.png', Buffer.from(clickScreenshot.data, 'base64'));
  await waitFor(`document.querySelector('.detail h2')?.textContent === ${JSON.stringify(first)}`, 'Actual file-node click opens the matching Details pane');
  // Allow focus dimming, then try another visible faded dot while the first stays selected.
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 20, y: 20 });
  await pause(800);
  await evaluate(`document.querySelector('[aria-label="Fit graph"]').click()`);
  await pause(500);
  let changed = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    const point = await evaluate(`(() => {
      const rect = document.querySelector('.ws-graph canvas').getBoundingClientRect();
      const points = window.__graphProbe.points.filter(p => p.alpha > 0.1 && p.alpha < 0.2 && p.x > 35 && p.x < rect.width - 60 && p.y > 35 && p.y < rect.height - 80);
      const p = points[${attempt} % points.length]; return p ? { x: p.x + rect.x, y: p.y + rect.y } : null;
    })()`);
    if (!point) continue;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    await pause(40);
    if (await evaluate(`Boolean(document.querySelector('.detail h2')) && document.querySelector('.detail h2').textContent !== ${JSON.stringify(first)}`)) { changed = true; break; }
  }
  if (!changed) throw new Error('Visible faded nodes did not open another Details pane');
  records.push({ check: 'A subsequent click can select a visible faded node', passed: true });

} catch (error) {
  records.push({ check: 'Boozer animated graph flow', passed: false, error: String(error) });
  process.exitCode = 1;
} finally {
  session.close();
  ws?.close();
  browser?.kill('SIGTERM');
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (browser && browser.exitCode === null) await new Promise((resolve) => browser.once('exit', resolve));
  await rm(profile, { recursive: true, force: true });
  await writeFile('docs/benchmarks/ux-g2-click-msi.json', JSON.stringify({ at: new Date().toISOString(), node: process.version, records, summary }, null, 2) + '\n');
  console.log(JSON.stringify({ records, summary }, null, 2));
}
