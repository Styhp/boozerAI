import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFolderPicker } from '../src/server/folder-picker.js';

// Dialog output is a double. Default tests never display a window or run a target project.
describe('native folder-picker boundary', () => {
  it.each(['linux', 'darwin'] as const)('uses a fixed %s executable and argument list', async (platform) => {
    const run = vi.fn(async () => '/tmp/folder with spaces /\n');
    const signal = new AbortController().signal;
    expect(await createFolderPicker(platform, run)(signal)).toBe('/tmp/folder with spaces /');
    expect(run).toHaveBeenCalledWith(platform === 'linux' ? 'zenity' : '/usr/bin/osascript',
      platform === 'linux' ? ['--file-selection', '--directory', '--title=Choose a project folder for Boozer AI']
        : ['-e', 'POSIX path of (choose folder with prompt "Choose a project folder for Boozer AI")'], signal);
  });
  it('returns cancellation without inventing a root, and rejects relative or multiline output', async () => {
    const signal = new AbortController().signal;
    expect(await createFolderPicker('linux', async () => '')(signal)).toBeNull();
    for (const text of ['relative\n', '/one\n/two\n', '/tmp/\0bad']) {
      await expect(createFolderPicker('linux', async () => text)(signal)).rejects.toMatchObject({ code: 'picker-failed' });
    }
  });
  it('allows one dialog at a time and frees the slot after completion', async () => {
    let finish!: (path: string) => void;
    const run = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
    const choose = createFolderPicker('linux', run);
    const signal = new AbortController().signal;
    const first = choose(signal);
    await expect(choose(signal)).rejects.toMatchObject({ code: 'picker-busy' });
    finish('/tmp/first\n'); await first;
    const next = choose(signal); finish(''); expect(await next).toBeNull();
    expect(run).toHaveBeenCalledTimes(2);
  });
  it('classifies unavailable, timeout and private failures without echoing their data', async () => {
    const signal = new AbortController().signal;
    for (const [failure, code] of [
      [{ code: 'ENOENT', message: '/private/missing' }, 'picker-unavailable'],
      [{ killed: true, message: '/private/timeout' }, 'picker-timeout'],
      [new Error('/private/path'), 'picker-failed'],
    ] as const) {
      await expect(createFolderPicker('linux', async () => { throw failure; })(signal)).rejects.toMatchObject({ code, message: code });
    }
    const run = vi.fn(async () => '');
    await expect(createFolderPicker('win32', run)(signal)).rejects.toMatchObject({ code: 'picker-unavailable' });
    expect(run).not.toHaveBeenCalled();
  });
  it('rejects both an already-cancelled action and output arriving after cancellation', async () => {
    const controller = new AbortController();
    const run = vi.fn(async () => { controller.abort(); return '/tmp/late\n'; });
    const choose = createFolderPicker('linux', run);
    await expect(choose(controller.signal)).rejects.toMatchObject({ code: 'cancelled' });
    await expect(choose(controller.signal)).rejects.toMatchObject({ code: 'cancelled' });
    expect(run).toHaveBeenCalledOnce();
  });
});

// Test the actual execFile wrapper with a process double to prove timeout/buffer/no-shell
// policy and distinguish native cancel from a killed or failed process.
describe('native dialog process policy', () => {
  afterEach(() => { vi.doUnmock('node:child_process'); vi.resetModules(); });
  it('bounds execFile and maps native cancellation without retaining stderr', async () => {
    const execFile = vi.fn((_file: string, _args: string[], _options: unknown, callback: Function) => callback({ code: 1 }, '', 'private stderr'));
    vi.doMock('node:child_process', () => ({ execFile })); vi.resetModules();
    const { createFolderPicker: native } = await import('../src/server/folder-picker.js');
    const signal = new AbortController().signal;
    expect(await native('linux')(signal)).toBeNull();
    expect(execFile.mock.lastCall?.[2]).toEqual({ encoding: 'utf8', signal, timeout: 60000, maxBuffer: 16384 });
    execFile.mockImplementationOnce((_file, _args, _options, callback) => callback({ code: 1 }, '', 'User canceled. (-128)'));
    expect(await native('darwin')(signal)).toBeNull();
    execFile.mockImplementationOnce((_file, _args, _options, callback) => callback({ code: 1 }, '', 'private failure'));
    await expect(native('darwin')(signal)).rejects.toMatchObject({ code: 'picker-failed' });
  });
});
