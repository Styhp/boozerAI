import { useEffect, useRef, useState } from 'react';
import type { ProjectStatus } from '../shared/project-api';
import { App } from './App';
import { HttpProjectSource, ProjectApiError, ProjectConnection } from './data/http-project-source';
import { GateCard } from './workspace/GateCard';

type State =
  | { status: 'loading' | 'closed' | 'expired' | 'picking' }
  | { status: 'empty'; message?: string }
  | { status: 'selected'; project: ProjectStatus }
  | { status: 'indexing'; project: ProjectStatus }
  | { status: 'ready'; project: ProjectStatus; source: HttpProjectSource; snapshotId: string }
  | { status: 'failed'; project: ProjectStatus | null; message: string };

export function LaunchHelp() {
  return <GateCard title="Open Boozer from its launcher.">
    <p className="bz-read">This tab has no active session. The server may have restarted, the project was closed, or this address was opened in a new tab.</p>
    <p className="bz-read">From Boozer's terminal, stop the old server with Ctrl+C if it is still running, then run:</p>
    <div className="bz-snip"><pre>npm start</pre></div>
    <p className="bz-meta">Use the new tab that opens. Refreshing that tab keeps your project connected while the server is running. Development uses npm run dev instead.</p>
  </GateCard>;
}

export function ChooseFolder({ onChoose, busy = false, message }: { onChoose: () => void; busy?: boolean; message?: string | undefined }) {
  return <GateCard title="Open a project">
    <p className="bz-lead">Choose a folder on this computer to see how its code connects.</p>
    <p className="bz-read">You'll confirm the folder before Boozer reads it. Nothing is run or changed.</p>
    {message && <p className="bz-notice" role="status">{message}</p>}
    <button type="button" className="bz-btn bz-btn--primary" disabled={busy} onClick={onChoose}>
      {busy ? 'Choosing folder…' : 'Choose folder'}
    </button>
    {busy && <p className="bz-meta" role="status">Use the folder dialog to select a project, or cancel to return here.</p>}
  </GateCard>;
}

function pickerMessage(error: unknown): string {
  if (error instanceof ProjectApiError) {
    const messages: Record<string, string> = {
      'picker-unavailable': 'The system folder picker is unavailable. You can still start Boozer with npm start -- --project <folder>.',
      'picker-busy': 'A folder dialog or project read is already open. Finish it, then try again.',
      'picker-timeout': 'The folder dialog timed out. Choose folder to try again.',
      'cancelled': 'No folder selected. Choose folder to try again.',
    };
    if (Object.hasOwn(messages, error.code)) return messages[error.code]!;
  }
  return 'Could not open that folder. Choose an accessible folder and try again.';
}

export function ProjectGate({ connection }: { connection: ProjectConnection }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const picking = useRef<AbortController | null>(null);
  useEffect(() => () => { picking.current?.abort(); }, []);
  useEffect(() => {
    let current = true;
    connection.resume().then(
      ({ project, response }) => {
        if (!current) return;
        if (project === null) setState({ status: 'empty' });
        else if (response !== null) setState({ status: 'ready', project, source: new HttpProjectSource(connection, response), snapshotId: response.graph.snapshotId });
        else if (project.state === 'indexing') setState({ status: 'failed', project: null, message: 'Boozer is still reading this folder. Wait a moment, then refresh the page again.' });
        else setState({ status: 'selected', project });
      },
      (error: unknown) => { if (current) setState(error instanceof ProjectApiError && error.status === 401
        ? { status: 'expired' }
        : { status: 'failed', project: null, message: 'Could not reconnect to Boozer. Check that its server is running, then refresh this tab.' }); },
    );
    return () => { current = false; };
  }, [connection]);
  useEffect(() => {
    if (state.status !== 'ready') return;
    return () => state.source.revoke();
  }, [state]);

  async function chooseFolder() {
    if (picking.current !== null) return;
    const controller = new AbortController();
    picking.current = controller;
    if (state.status === 'ready') state.source.revoke();
    setState({ status: 'picking' });
    try {
      const result = await connection.chooseFolder(controller.signal);
      if (!controller.signal.aborted) setState(result.status === 'selected'
        ? { status: 'selected', project: result.project }
        : { status: 'empty', message: 'No folder selected.' });
    } catch (error) {
      if (!controller.signal.aborted) setState(error instanceof ProjectApiError && error.status === 401
        ? { status: 'expired' }
        : { status: 'empty', message: pickerMessage(error) });
    } finally { if (picking.current === controller) picking.current = null; }
  }

  async function index(project: ProjectStatus, snapshotId?: string) {
    // Unmount the old map immediately; no old selection or citation survives a refresh.
    if (state.status === 'ready') state.source.revoke();
    setState({ status: 'indexing', project });
    try {
      const response = snapshotId === undefined ? await connection.confirm(project.id) : await connection.refresh(project.id, snapshotId);
      setState({ status: 'ready', project, source: new HttpProjectSource(connection, response), snapshotId: response.graph.snapshotId });
    } catch (error) { setState({ status: 'failed', project, message: String(error) }); }
  }

  async function close(project: ProjectStatus) {
    if (state.status === 'ready') state.source.revoke();
    setState({ status: 'closed' });
    try { await connection.close(project.id); }
    catch { setState({ status: 'failed', project: null, message: 'Could not confirm server shutdown. Stop the launcher to revoke the session.' }); }
  }

  if (state.status === 'expired') return <LaunchHelp />;
  if (state.status === 'ready') {
    return <App project={state.source} onRefresh={() => void index(state.project, state.snapshotId)} onClose={() => void close(state.project)} onOpenAnother={() => void chooseFolder()} />;
  }

  // Either selection path still requires a separate confirmation before reading source.
  if (state.status === 'selected') return <GateCard title={`Open ${state.project.label}?`}>
    <p className="bz-lead">Boozer will read this folder's code as text and draw how its files connect.</p>
    <ul>
      <li>Nothing is run, installed or changed in the folder.</li>
      <li>Reading happens on this computer. Nothing is sent online.</li>
      <li>Limits: 2,000 code files, 1 MiB per file, 20 MiB in total. Anything skipped is counted and shown.</li>
    </ul>
    <div className="bz-inline">
      <button type="button" className="bz-btn bz-btn--primary" onClick={() => void index(state.project)}>Read this folder</button>
      <button type="button" className="bz-btn" onClick={() => void chooseFolder()}>Choose another folder</button>
      <button type="button" className="bz-btn" onClick={() => void close(state.project)}>Cancel</button>
    </div>
    <p className="bz-meta">Selected folder: <code>{state.project.label}</code>.</p>
  </GateCard>;
  if (state.status === 'indexing') return <GateCard><p className="bz-lead" role="status">Reading {state.project.label}…</p></GateCard>;
  if (state.status === 'failed') return <GateCard title={state.project ? `Couldn't finish reading ${state.project.label}` : undefined}>
    <p className="bz-notice bz-notice--danger" role="alert">{state.message}</p>
    {state.project && <>
      <p className="bz-read">Boozer stopped without building a partial map, so nothing on screen would be misleading. Nothing in your folder was changed.</p>
      <div className="bz-inline">
        <button type="button" className="bz-btn bz-btn--primary" onClick={() => void index(state.project!)}>Try again</button>
        <button type="button" className="bz-btn" onClick={() => void close(state.project!)}>Close</button>
      </div>
    </>}
    <button type="button" className="bz-btn" onClick={() => void chooseFolder()}>Choose another folder</button>
  </GateCard>;
  if (state.status === 'empty' || state.status === 'picking') return <ChooseFolder onChoose={() => void chooseFolder()}
    busy={state.status === 'picking'} message={state.status === 'empty' ? state.message : undefined} />;
  if (state.status === 'closed') return <GateCard title="Project closed."><p>Start a new launcher session to open a project.</p></GateCard>;
  return <GateCard><p role="status">Connecting to the local launcher…</p></GateCard>;
}
