import { spawn } from 'node:child_process';
import { createServer } from 'vite';

// Vite serves the UI and proxies authenticated APIs to the loopback Node host.
// The package script builds first so that host always has local UI assets.
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
try {
  await vite.listen();
  vite.printUrls();
  for (const args of [
    ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.server.json', '--watch'],
    ['--watch', 'scripts/dev-host.mjs', ...process.argv.slice(2)],
  ]) {
    const child = spawn(process.execPath, args, { stdio: 'inherit' });
    children.push(child);
    child.on('error', () => void stop(1));
    child.on('exit', (code) => { if (!stopping) void stop(code ?? 1); });
  }
} catch {
  console.error('Could not start Boozer AI development servers. Check ports 4173 and 5173 and run npm run build.');
  await stop(1);
}
