import { execFile } from 'node:child_process';
import { isAbsolute } from 'node:path';

export class FolderPickerError extends Error {
  constructor(readonly code: 'picker-unavailable' | 'picker-busy' | 'picker-timeout' | 'picker-failed' | 'cancelled') {
    super(code);
  }
}

export type FolderPicker = (signal: AbortSignal) => Promise<string | null>;
type DialogRunner = (file: string, args: string[], signal: AbortSignal) => Promise<string>;

// The dialog is a host action, never a shell command or code from the selected repository.
const runDialog: DialogRunner = (file, args, signal) => new Promise((resolve, reject) => {
  execFile(file, args, { encoding: 'utf8', signal, timeout: 60_000, maxBuffer: 16_384 }, (error, stdout, stderr) => {
    if (error === null) resolve(stdout);
    else if (!signal.aborted && error.code === 1 && (file === 'zenity' || stderr.includes('(-128)'))) resolve('');
    else reject(error);
  });
});

export function createFolderPicker(platform: NodeJS.Platform = process.platform, run: DialogRunner = runDialog): FolderPicker {
  let busy = false;
  return async (signal) => {
    if (signal.aborted) throw new FolderPickerError('cancelled');
    if (busy) throw new FolderPickerError('picker-busy');
    if (platform !== 'linux' && platform !== 'darwin') throw new FolderPickerError('picker-unavailable');
    busy = true;
    try {
      const output = platform === 'darwin'
        ? await run('/usr/bin/osascript', ['-e', 'POSIX path of (choose folder with prompt "Choose a project folder for Boozer AI")'], signal)
        : await run('zenity', ['--file-selection', '--directory', '--title=Choose a project folder for Boozer AI'], signal);
      if (signal.aborted) throw new FolderPickerError('cancelled');
      if (output === '') return null;
      // Remove the dialog's line ending, not spaces belonging to the chosen folder name.
      const folder = output.replace(/\r?\n$/, '');
      if (!isAbsolute(folder) || /[\0\r\n]/.test(folder)) throw new FolderPickerError('picker-failed');
      return folder;
    } catch (error) {
      if (signal.aborted) throw new FolderPickerError('cancelled');
      if (error instanceof FolderPickerError) throw error;
      const failure = error as NodeJS.ErrnoException & { killed?: boolean };
      throw new FolderPickerError(failure.code === 'ENOENT' ? 'picker-unavailable' : failure.killed ? 'picker-timeout' : 'picker-failed');
    } finally { busy = false; }
  };
}

// Shared across sessions so a launch can never open overlapping native dialogs.
export const pickFolder = createFolderPicker();
