import { startHost } from './app.js';

try {
  // Production never selects the development Origin, including with ambient env vars.
  const host = await startHost();
  process.on('SIGINT', host.stop);
  process.on('SIGTERM', host.stop);
} catch {
  console.error('Could not launch Boozer AI. Use npm start -- --project <folder>; check the folder, browser, port 4173 and build.');
  process.exitCode = 1;
}
