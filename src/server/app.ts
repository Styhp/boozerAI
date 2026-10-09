import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

const origin = 'http://127.0.0.1:4173';
const devOrigin = 'http://127.0.0.1:5173';

export function permitsRequest(host: string | undefined, requestOrigin: string | undefined, developmentProxy = false): boolean {
  return host === '127.0.0.1:4173' && (
    requestOrigin === undefined || requestOrigin === origin ||
    (developmentProxy && requestOrigin === devOrigin)
  );
}

// This reads only Boozer's built assets, never a selected target repository.
export async function createApp(developmentProxy = false) {
  const client = new URL('../client/', import.meta.url);
  const assets = new Map<string, { body: Buffer; type: string }>();
  assets.set('/', { body: await readFile(new URL('index.html', client)), type: 'text/html' });
  for (const name of await readdir(new URL('assets/', client))) {
    const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    assets.set(`/assets/${name}`, { body: await readFile(new URL(`assets/${name}`, client)), type });
  }
  return (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    if (!permitsRequest(request.headers.host, request.headers.origin, developmentProxy)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
      return;
    }
    const asset = assets.get((request.url ?? '').split('?')[0] ?? '');
    if (!asset) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': `${asset.type}; charset=utf-8` });
    response.end(request.method === 'HEAD' ? undefined : asset.body);
  };
}

export async function startHost(developmentProxy = false) {
  const server = createServer(await createApp(developmentProxy));
  await new Promise<void>((resolve, reject) => {
    const failed = () => reject(new Error('Could not start Boozer AI on 127.0.0.1:4173'));
    server.once('error', failed);
    server.listen(4173, '127.0.0.1', () => {
      server.off('error', failed);
      resolve();
    });
  });
  server.on('error', () => {
    console.error('Boozer AI host error on 127.0.0.1:4173');
    process.exitCode = 1;
    server.close();
  });
  console.log('Boozer AI: http://127.0.0.1:4173');
  return server;
}
