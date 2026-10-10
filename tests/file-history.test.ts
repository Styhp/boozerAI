import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, realpath, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalInputAdapter } from '../src/server/local-input.js';
import { ProjectSession } from '../src/server/project-session.js';
import { fileAge } from '../src/client/components/FileHistoryPanel.js';
const exec = promisify(execFile);
const roots: string[] = [];
const signal = () => new AbortController().signal;
async function fixture(git = true) {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'boozer-history-')); roots.push(root);
  await writeFile(join(root, 'main.ts'), 'export const value = 1;\n');
  const command = (...args: string[]) => exec('git', args, { cwd: root, env: {
    PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_DATE: '2020-01-02T03:04:05Z', GIT_COMMITTER_DATE: '2020-02-03T04:05:06Z',
  } });
  if (git) {
    await command('init', '--initial-branch=main'); await command('add', 'main.ts');
    await command('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', '<script>inert commit subject</script>');
    await writeFile(join(root, 'other.ts'), 'export {};'); await command('add', 'other.ts');
    await command('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Unrelated later commit');
  }
  const input = await LocalInputAdapter.select(root); input.confirm(input.projectId);
  return { root, input, command };
}
afterEach(async () => { await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true }))); });
describe('file modification and bounded Git history', () => {
  it('separates filesystem mtime from the latest commit affecting this literal path', async () => {
    const f = await fixture();
    await utimes(join(f.root, 'main.ts'), new Date('2024-06-07T08:09:10Z'), new Date('2024-06-07T08:09:10Z'));
    const before = await readFile(join(f.root, 'main.ts'), 'utf8');
    const value = await f.input.fileHistory(f.input.projectId, 'main.ts', signal());
    expect(value.modifiedAt).toBe('2024-06-07T08:09:10.000Z');
    expect(value.git).toMatchObject({ status: 'committed', committedAt: '2020-02-03T04:05:06+00:00', subject: '<script>inert commit subject</script>' });
    expect(await readFile(join(f.root, 'main.ts'), 'utf8')).toBe(before);
    await writeFile(join(f.root, '*.ts'), 'export {};');
    expect((await f.input.fileHistory(f.input.projectId, '*.ts', signal())).git.status).toBe('no-history');
  });
  it('reports missing files, non-Git folders and files with no history without inventing dates', async () => {
    const plain = await fixture(false);
    const value = await plain.input.fileHistory(plain.input.projectId, 'main.ts', signal());
    expect(value.modifiedAt).not.toBeNull(); expect(value.git.status).toBe('not-repository');
    const f = await fixture(); await writeFile(join(f.root, 'new.ts'), 'export {};');
    expect((await f.input.fileHistory(f.input.projectId, 'new.ts', signal())).git.status).toBe('no-history');
    await rm(join(f.root, 'main.ts'));
    const missing = await f.input.fileHistory(f.input.projectId, 'main.ts', signal());
    expect(missing.modifiedAt).toBeNull(); expect(missing.git.status).toBe('committed');
  });
  it('refuses symlinked metadata, external config includes, alternates and worktree pointers', async () => {
    for (const kind of ['symlink', 'include', 'alternates', 'worktree']) {
      const f = await fixture();
      if (kind === 'symlink') await symlink('/tmp', join(f.root, '.git', 'external'));
      if (kind === 'include') await writeFile(join(f.root, '.git', 'config'), '[include]\npath=/outside/config\n');
      if (kind === 'alternates') await writeFile(join(f.root, '.git', 'objects', 'info', 'alternates'), '/outside/objects\n');
      if (kind === 'worktree') { await rm(join(f.root, '.git'), { recursive: true }); await writeFile(join(f.root, '.git'), 'gitdir: /outside/worktree\n'); }
      expect((await f.input.fileHistory(f.input.projectId, 'main.ts', signal())).git.status).toBe('unavailable');
    }
  });
  it('requires a confirmed current file ID and drops revoked/cancelled authority', async () => {
    const f = await fixture(false); const fresh = await LocalInputAdapter.select(f.root);
    await expect(fresh.fileHistory(fresh.projectId, 'main.ts', signal())).rejects.toMatchObject({ code: 'unconfirmed' });
    const session = new ProjectSession(f.input, 'Fixture', null); const indexed = await session.index(f.input.projectId, signal());
    await expect(session.fileHistory(f.input.projectId, 'fake-file', indexed.graph.snapshotId, signal())).rejects.toMatchObject({ code: 'invalid-file' });
    await expect(session.fileHistory(f.input.projectId, indexed.files[0]!.id, 'old-snapshot', signal())).rejects.toMatchObject({ code: 'stale-snapshot' });
    const aborted = new AbortController(); aborted.abort();
    await expect(f.input.fileHistory(f.input.projectId, 'main.ts', aborted.signal)).rejects.toMatchObject({ code: 'cancelled' });
    session.close(); await expect(f.input.fileHistory(f.input.projectId, 'main.ts', signal())).rejects.toMatchObject({ code: 'revoked' });
  });
  it('does not turn invalid or future timestamps into reassuring ages', () => {
    const now = Date.parse('2026-10-09T12:00:00Z');
    expect(fileAge('2026-10-08T12:00:00Z', now)).toBe('1 day ago');
    expect(fileAge('2026-10-09T09:00:00Z', now)).toBe('3 hours ago');
    expect(fileAge('2026-10-10T12:00:00Z', now)).toBe('Future timestamp');
    expect(fileAge('invalid', now)).toBe('Unknown age');
  });
});
