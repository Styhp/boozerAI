import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
  events: [] as string[],
  load: vi.fn(),
  launch: vi.fn(),
  service: vi.fn(),
  listen: vi.fn((_port: number, _host: string, ready: () => void) => ready()),
  open: vi.fn(),
}));

vi.mock('../src/server/env.js', () => ({ loadServerEnv: hooks.load }));
vi.mock('../src/server/launcher.js', () => ({ launchSession: hooks.launch, openLaunchUrl: hooks.open }));
vi.mock('../src/server/explain/index.js', () => ({ createExplanationService: hooks.service }));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async () => Buffer.from('<html></html>')),
  readdir: vi.fn(async () => []),
}));
vi.mock('node:http', () => ({
  createServer: vi.fn(() => ({
    once: vi.fn(), off: vi.fn(), on: vi.fn(), listen: hooks.listen,
    close: vi.fn(), closeAllConnections: vi.fn(),
  })),
}));

import { startHost } from '../src/server/app.js';

describe('configuration at server startup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.events.length = 0;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    hooks.load.mockImplementation(() => {
      hooks.events.push('configuration');
      vi.stubEnv('OPENAI_API_KEY', 'fake-launch-key');
    });
    hooks.launch.mockImplementation(async () => {
      hooks.events.push('session');
      return { close: vi.fn(), launchUrl: () => 'http://127.0.0.1:4173/#fake' };
    });
    hooks.service.mockImplementation(() => {
      hooks.events.push(process.env.OPENAI_API_KEY === 'fake-launch-key' ? 'configured-provider' : 'missing-key');
      return { preload: vi.fn(async () => undefined) };
    });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it.each([false, true])('loads settings before the provider in developmentProxy=%s', async (developmentProxy) => {
    const host = await startHost(developmentProxy, []);
    expect(hooks.events).toEqual(['configuration', 'session', 'configured-provider']);
    expect(hooks.listen).toHaveBeenCalledOnce();
    host.stop();
  });

  it('stops before opening a session or server if configuration cannot be read', async () => {
    hooks.load.mockImplementation(() => { throw new Error('configuration unavailable'); });
    await expect(startHost(false, [])).rejects.toThrow('configuration unavailable');
    expect(hooks.launch).not.toHaveBeenCalled();
    expect(hooks.service).not.toHaveBeenCalled();
    expect(hooks.listen).not.toHaveBeenCalled();
    expect(hooks.open).not.toHaveBeenCalled();
  });
});
