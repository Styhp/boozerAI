import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

export class ServerEnvError extends Error {
  constructor() {
    super('Could not read Boozer AI\'s .env. Check that it is a readable file, then restart the server.');
    this.name = 'ServerEnvError';
  }
}

// src/server and dist/server are both two levels below Boozer's root. Never look
// in the working directory or an analyzed project for application credentials.
export function loadServerEnv(
  file = new URL('../../.env', import.meta.url),
  environment: NodeJS.ProcessEnv = process.env,
): void {
  let content: string;
  try {
    content = readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    // Do not retain the filesystem error: it can contain private paths.
    throw new ServerEnvError();
  }
  const settings = parseEnv(content);
  // Deliberate allowlist: a .env cannot change Origin policy, model endpoints,
  // app-data paths or enable tracing. An explicitly empty export also wins.
  if (environment.OPENAI_API_KEY === undefined && settings.OPENAI_API_KEY !== undefined) {
    environment.OPENAI_API_KEY = settings.OPENAI_API_KEY;
  }
}
