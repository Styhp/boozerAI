import { createServer } from 'node:http';
import { createApp } from './app.js';

try {
  const server = createServer(await createApp());
  server.on('error', () => {
    console.error('Could not start Boozer AI on 127.0.0.1:4173');
    process.exitCode = 1;
  });
  server.listen(4173, '127.0.0.1', () => console.log('Boozer AI: http://127.0.0.1:4173'));
  const stop = () => server.close();
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} catch {
  console.error('Built UI unavailable. Run npm run build before npm start.');
  process.exitCode = 1;
}
