import { spawn } from 'node:child_process';
import { createServer } from 'vite';

// Vite serves the UI during development; the Node entry is the future API host.
// Build the UI once so the production host can also start without a fallback.
const vite = await createServer();
const children = [];
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  await vite.close();
  process.exitCode = code;
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
await vite.listen();
vite.printUrls();
for (const args of [
  ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.server.json', '--watch'],
  ['--watch', 'dist/server/index.js'],
]) {
  const child = spawn(process.execPath, args, { stdio: 'inherit' });
  children.push(child);
  child.on('error', () => void stop(1));
  child.on('exit', (code) => { if (!stopping) void stop(code ?? 1); });
}
