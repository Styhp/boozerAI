import { spawn } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { LocalInputAdapter } from './local-input.js';
import { ProjectSession } from './project-session.js';

export function projectArgument(args: readonly string[]): string | null {
  if (args.length === 0) return null;
  if (args.length !== 2 || args[0] !== '--project' || !args[1] || args[1].startsWith('--')) {
    throw new Error('Usage: npm start -- --project <folder>');
  }
  return args[1];
}

export async function launchSession(args: readonly string[]): Promise<ProjectSession> {
  const folder = projectArgument(args);
  if (folder === null) return new ProjectSession(null, '');
  const input = await LocalInputAdapter.select(folder);
  return new ProjectSession(input, basename(resolve(folder)));
}

// No shell interpolation, URL logging, clipboard or persistent capability storage.
export async function openLaunchUrl(url: string): Promise<void> {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'linux' ? 'xdg-open' : null;
  if (command === null) throw new Error('Automatic browser launch is unavailable.');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [url], { stdio: 'ignore' });
    child.once('error', () => reject(new Error('Could not open the local browser.')));
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error('Could not open the local browser.')));
  });
}
