import { useEffect, useState } from 'react';
import type { ProjectStatus } from '../shared/project-api';
import { App } from './App';
import { HttpProjectSource, ProjectApiError, ProjectConnection } from './data/http-project-source';
import { GateCard } from './workspace/GateCard';

type State =
  | { status: 'loading' | 'closed' | 'empty' | 'expired' }
  | { status: 'selected'; project: ProjectStatus }
  | { status: 'indexing'; project: ProjectStatus }
  | { status: 'ready'; project: ProjectStatus; source: HttpProjectSource; snapshotId: string }
  | { status: 'failed'; project: ProjectStatus | null; message: string };

export function LaunchHelp() {
  return <GateCard title="Open Boozer from its launcher.">
    <p className="bz-read">This tab has no active session. The server may have restarted, the project was closed, or this address was opened in a new tab.</p>
    <p className="bz-read">From Boozer's terminal, stop the old server with Ctrl+C if it is still running, then run:</p>
    <div className="bz-snip"><pre>npm start -- --project &lt;folder&gt;</pre></div>
    <p className="bz-meta">Use the new tab that opens. Refreshing that tab keeps your project connected while the server is running. Development uses npm run dev instead.</p>
  </GateCard>;
}

export function ProjectGate({ connection }: { connection: ProjectConnection }) {
  const [state, setState] = useState<State>({ status: 'loading' });
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
    return <App project={state.source} onRefresh={() => void index(state.project, state.snapshotId)} onClose={() => void close(state.project)} />;
  }

  // Wording from the design handover's COPY.md; the states and actions above are unchanged.
  if (state.status === 'selected') return <GateCard title={`Open ${state.project.label}?`}>
    <p className="bz-lead">Boozer will read this folder's code as text and draw how its files connect.</p>
    <ul>
      <li>Nothing is run, installed or changed in the folder.</li>
      <li>Reading happens on this computer. Nothing is sent online.</li>
      <li>Limits: 2,000 code files, 1 MiB per file, 20 MiB in total. Anything skipped is counted and shown.</li>
    </ul>
    <div className="bz-inline">
      <button type="button" className="bz-btn bz-btn--primary" onClick={() => void index(state.project)}>Read this folder</button>
      <button type="button" className="bz-btn" onClick={() => void close(state.project)}>Cancel</button>
    </div>
    <p className="bz-meta">Folder chosen when Boozer was started: <code>{state.project.label}</code>.</p>
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
  </GateCard>;
  if (state.status === 'empty') return <GateCard title="No project selected">
    <p className="bz-read">Start Boozer with the folder you want to read:</p>
    <div className="bz-snip"><pre>npm start -- --project &lt;folder&gt;</pre></div>
  </GateCard>;
  if (state.status === 'closed') return <GateCard title="Project closed."><p>Start a new launcher session to open a project.</p></GateCard>;
  return <GateCard><p role="status">Connecting to the local launcher…</p></GateCard>;
}
