import { startHost } from './app.js';

try {
  // Production never selects the development Origin, including with ambient env vars.
  const server = await startHost();
  const stop = () => server.close();
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} catch {
  console.error('Could not start Boozer AI on 127.0.0.1:4173. Check the port and run npm run build.');
  process.exitCode = 1;
}
