import { useEffect, useRef, useState } from 'react';
import type { FileHistory } from '../../shared/project-api';

export function fileAge(date: string, now = Date.now()): string {
  const elapsed = now - Date.parse(date);
  if (!Number.isFinite(elapsed)) return 'Unknown age';
  if (elapsed < 0) return 'Future timestamp';
  const days = Math.floor(elapsed / 86_400_000);
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} ago`;
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return 'Less than an hour ago';
}

export function FileHistoryPanel({ path, load }: {
  path: string; load: (path: string, signal: AbortSignal) => Promise<FileHistory>;
}) {
  const [result, setResult] = useState<FileHistory | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'failed'>('idle');
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const check = () => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setState('loading'); setResult(null);
    load(path, controller.signal).then(
      (value) => { if (!controller.signal.aborted) { setResult(value); setState('done'); } },
      () => { if (!controller.signal.aborted) setState('failed'); },
    );
  };
  const stamp = (value: string) => <><strong>{fileAge(value)}</strong> · <time dateTime={value}>{new Date(value).toLocaleString()}</time></>;
  return <section className="file-history" aria-label="File age and Git history">
    <h3>File age</h3>
    <p className="muted small">Age does not prove code is stale or unused. Filesystem dates can change after a checkout or copy.</p>
    <button type="button" className="secondary" disabled={state === 'loading'} onClick={check}>{state === 'loading' ? 'Checking file history…' : 'Check last edit and commit'}</button>
    {state === 'failed' && <p className="notice error" role="status">Could not read file history. Refresh the folder and try again.</p>}
    {result && <div role="status">
      <p>Filesystem modified: {result.modifiedAt ? stamp(result.modifiedAt) : 'Unavailable (file missing or unreadable)'}</p>
      {result.git.status === 'committed' ? <><p>Latest commit affecting this path: {stamp(result.git.committedAt)}</p>
        <p><code title={result.git.hash}>{result.git.hash.slice(0, 12)}</code> · {result.git.subject}</p></>
        : <p>Git history: {result.git.status === 'not-repository' ? 'No .git directory in this folder' : result.git.status === 'no-history' ? 'No commit found for this path on HEAD' : 'Unavailable (Git missing, incomplete history, or unsupported metadata)'}</p>}
      <p className="muted small">Checked {new Date(result.checkedAt).toLocaleString()}. Committer date on HEAD; earlier names are not followed. Code and graph still use the folder snapshot.</p>
    </div>}
  </section>;
}
