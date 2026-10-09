import { readFile, readdir } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';

const origin = 'http://127.0.0.1:4173';

export function permitsRequest(host: string | undefined, requestOrigin: string | undefined): boolean {
  return host === '127.0.0.1:4173' && (requestOrigin === undefined || requestOrigin === origin);
}

// This reads only Boozer's built assets, never a selected target repository.
export async function createApp() {
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
    if (!permitsRequest(request.headers.host, request.headers.origin)) {
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
