// Manual M2-PICK browser/native probe. Uses installed Chromium and zenity; no downloads.
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../dist/server/app.js';
import { launchSession } from '../../dist/server/launcher.js';
import { createExplanationService } from '../../dist/server/explain/index.js';
const run = promisify(execFile);
const profile = await mkdtemp(join(tmpdir(), 'boozer-picker-browser-'));
const session = await launchSession([]);
const server = createServer(await createApp(false, { session, service: createExplanationService() }));
let browser, ws;
const records = [];
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
  await waitFor(`document.body.innerText.includes('Choose folder')`, 'No-project launch shows Choose folder');
  await click('Choose folder');
  await waitFor(`document.body.innerText.includes('Choosing folder…')`, 'Choosing state appears immediately');
  await run('python3', ['docs/benchmarks/m2-picker-native-input-msi.py', 'cancel']);
  await waitFor(`document.body.innerText.includes('No folder selected.')`, 'Native cancel returns to start');
  await click('Choose folder');
  await run('python3', ['docs/benchmarks/m2-picker-native-input-msi.py', 'select']);
  await waitFor(`document.body.innerText.includes('Open boozer-ai?')`, 'Native selection requires confirmation');
  if (session.descriptor()?.state !== 'selected') throw new Error('Indexed before confirmation');
  await click('Read this folder');
  await waitFor(`document.body.innerText.includes('Open another folder') && document.body.innerText.includes('Chat Boozer')`, 'Confirmed folder opens real workspace');
  const old = session.descriptor().id;
  await send('Page.reload');
  await waitFor(`document.body.innerText.includes('Open another folder')`, 'Reload restores selected project');
  await click('Open another folder');
  await run('python3', ['docs/benchmarks/m2-picker-native-input-msi.py', 'cancel']);
  await waitFor(`document.body.innerText.includes('No folder selected.')`, 'Open another folder closes old project on cancel');
  if (session.descriptor() !== null) throw new Error('Old project retained');
  let retired = false;
  try { session.current(old); } catch { retired = true; }
  if (!retired) throw new Error('Old project still readable');
  records.push({ check: 'Previous project is no longer readable', passed: true });
  await click('Choose folder');
  await run('python3', ['docs/benchmarks/m2-picker-native-input-msi.py', 'select']);
  await waitFor(`document.body.innerText.includes('Open boozer-ai?')`, 'Folder can be selected again without server restart');
  if (session.descriptor().id === old) throw new Error('Old project ID reused');
  records.push({ check: 'New selection has a fresh project ID', passed: true });
} catch (error) {
  records.push({ check: 'Browser/native flow', passed: false, error: String(error) });
  process.exitCode = 1;
} finally {
  session.close();
  ws?.close();
  browser?.kill('SIGTERM');
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (browser && browser.exitCode === null) await new Promise((resolve) => browser.once('exit', resolve));
  await rm(profile, { recursive: true, force: true });
  await writeFile('docs/benchmarks/m2-picker-browser-msi.json', JSON.stringify({ at: new Date().toISOString(), records }, null, 2) + '\n');
  console.log(JSON.stringify(records, null, 2));
}
