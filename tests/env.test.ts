import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadServerEnv, ServerEnvError } from '../src/server/env.js';
import { createOpenAIAdapter } from '../src/server/explain/cloud-adapter.js';
import { resolveConfig } from 'vite';

describe('private application environment', () => {
  let root: string;
  let file: URL;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'boozer-env-'));
    file = pathToFileURL(join(root, '.env'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('excludes application env files from both development and production client configuration', async () => {
    for (const name of ['.env', '.env.local', '.env.development', '.env.production']) {
      writeFileSync(join(root, name), 'OPENAI_API_KEY=fake-server-secret\nVITE_PRIVATE_TEST=fake-browser-canary\n');
    }
    for (const [command, mode] of [['serve', 'development'], ['build', 'production']] as const) {
      const config = await resolveConfig({ root, configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)), mode }, command);
      expect(config.env).not.toHaveProperty('VITE_PRIVATE_TEST');
      expect(JSON.stringify(config.env)).not.toContain('fake-browser-canary');
      expect(JSON.stringify(config.env)).not.toContain('fake-server-secret');
    }
  });

  it('needs no file and leaves the environment alone', () => {
    const environment = { EXISTING: 'preserved' };
    loadServerEnv(file, environment);
    expect(environment).toEqual({ EXISTING: 'preserved' });
  });

  it('parses quotes, comments and CRLF as data', () => {
    writeFileSync(file, '# local configuration\r\nOPENAI_API_KEY="fake-key#literal" # comment\r\n');
    const environment: NodeJS.ProcessEnv = {};
    loadServerEnv(file, environment);
    expect(environment.OPENAI_API_KEY).toBe('fake-key#literal');
  });

  it.each(['already-exported-fake-key', ''])('preserves a terminal export, including empty (%j)', (value) => {
    writeFileSync(file, 'OPENAI_API_KEY=fake-file-key\n');
    const environment = { OPENAI_API_KEY: value };
    loadServerEnv(file, environment);
    expect(environment.OPENAI_API_KEY).toBe(value);
  });

  it.each(['', 'OPENAI_API_KEY=\n', 'OPENAI_API_KEY="   "\n'])('keeps an empty configuration unavailable (%j)', (content) => {
    writeFileSync(file, content);
    const environment: NodeJS.ProcessEnv = {};
    loadServerEnv(file, environment);
    expect(createOpenAIAdapter({ apiKey: environment.OPENAI_API_KEY ?? '' }).status()).toEqual({ available: false });
  });

  it('does not expand shell syntax or load unrelated settings', () => {
    writeFileSync(file, [
      'OPENAI_API_KEY="${OTHER_KEY}-$(echo do-not-execute)"',
      'NODE_OPTIONS=--inspect=0.0.0.0',
      'VITE_OPENAI_API_KEY=fake-client-secret',
      'XDG_DATA_HOME=/untrusted',
      'LANGSMITH_TRACING=true',
    ].join('\n'));
    const environment: NodeJS.ProcessEnv = {};
    loadServerEnv(file, environment);
    expect(environment).toEqual({ OPENAI_API_KEY: '${OTHER_KEY}-$(echo do-not-execute)' });
  });

  it('reports a read failure without a private path or underlying cause', () => {
    mkdirSync(file);
    let caught: unknown;
    try { loadServerEnv(file, {}); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(ServerEnvError);
    const error = caught as ServerEnvError;
    expect(error.message).toBe("Could not read Boozer AI's .env. Check that it is a readable file, then restart the server.");
    expect(error.message).not.toContain(root);
    expect(error.cause).toBeUndefined();
  });

  it('configures safe provider metadata without making a request or exposing the key', () => {
    writeFileSync(file, 'OPENAI_API_KEY=fake-private-key\n');
    const environment: NodeJS.ProcessEnv = {};
    loadServerEnv(file, environment);
    const cloud = createOpenAIAdapter({ apiKey: environment.OPENAI_API_KEY });
    expect(cloud.status().available).toBe(true);
    expect(JSON.stringify(cloud.status())).not.toContain('fake-private-key');
    expect(cloud.payloadJson([])).not.toContain('fake-private-key');
    // tests/offline.ts rejects any actual fetch/socket; no network is needed here.
  });

  it('uses the app root even when launched from another project directory', () => {
    const app = join(root, 'app');
    const target = join(root, 'selected-project');
    mkdirSync(join(app, 'src/server'), { recursive: true });
    mkdirSync(target);
    const modulePath = join(app, 'src/server/env.ts');
    // Only our trusted loader is executed; the target contains inert data only.
    copyFileSync(new URL('../src/server/env.ts', import.meta.url), modulePath);
    writeFileSync(join(app, '.env'), 'OPENAI_API_KEY=fake-app-key\n');
    writeFileSync(join(target, '.env'), 'OPENAI_API_KEY=fake-target-key\n');
    const environment = { ...process.env };
    delete environment.OPENAI_API_KEY;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { loadServerEnv } = await import(${JSON.stringify(pathToFileURL(modulePath).href)});
      loadServerEnv();
      console.log(process.env.OPENAI_API_KEY === 'fake-app-key');
    `], { cwd: target, env: environment, encoding: 'utf8', timeout: 10_000 });
    expect(output.trim()).toBe('true');
  });
});
