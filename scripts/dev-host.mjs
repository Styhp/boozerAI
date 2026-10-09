import { startHost } from '../dist/server/app.js';
import { ServerEnvError } from '../dist/server/env.js';

// The dev.mjs launcher watches this entry; production uses src/server/index.ts.
try {
  const host = await startHost(true);
  process.on('SIGINT', host.stop);
  process.on('SIGTERM', host.stop);
} catch (error) {
  console.error(error instanceof ServerEnvError ? error.message : 'Could not start Boozer AI development host on 127.0.0.1:4173. Check the port and run npm run build.');
  process.exitCode = 1;
}
