import { useEffect, useState } from 'react';
import type { ProjectStatus } from '../shared/project-api';
import { App } from './App';
import { HttpProjectSource, ProjectConnection } from './data/http-project-source';
import './project-gate.css';

type State =
  | { status: 'loading' | 'closed' | 'empty' }
  | { status: 'selected'; project: ProjectStatus }
  | { status: 'indexing'; project: ProjectStatus }
  | { status: 'ready'; project: ProjectStatus; source: HttpProjectSource; snapshotId: string }
  | { status: 'failed'; project: ProjectStatus | null; message: string };

export function ProjectGate({ connection }: { connection: ProjectConnection }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  useEffect(() => {
    let current = true;
    connection.session().then(
      ({ project }) => { if (current) setState(project === null ? { status: 'empty' } : { status: 'selected', project }); },
      (error: unknown) => { if (current) setState({ status: 'failed', project: null, message: String(error) }); },
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

  if (state.status === 'ready') return <>
    <div className="project-toolbar" aria-label="Project controls">
      <span>{state.project.label}</span>
      <button type="button" onClick={() => void index(state.project, state.snapshotId)}>Refresh snapshot</button>
      <button type="button" onClick={() => void close(state.project)}>Close project</button>
    </div>
    <App project={state.source} />
  </>;

  return <main className="message-screen">
    <p className="eyebrow">Boozer AI</p>
    {state.status === 'loading' && <p>Connecting to the local launcher…</p>}
    {state.status === 'selected' && <>
      <h1>Open {state.project.label}?</h1>
      <p>Index this selected folder as text on your machine. Boozer never executes or changes its files.</p>
      <p>Limits: 2,000 source candidates, 1 MiB per file and 20 MiB read total. Exclusions and incomplete analysis stay visible.</p>
      <button type="button" onClick={() => void index(state.project)}>Confirm and index</button>{' '}
      <button type="button" onClick={() => void close(state.project)}>Cancel</button>
    </>}
    {state.status === 'indexing' && <p role="status">Indexing {state.project.label}…</p>}
    {state.status === 'failed' && <>
      <p className="notice error" role="alert">{state.message}</p>
      {state.project && <button type="button" onClick={() => void index(state.project!)}>Retry indexing</button>}
    </>}
    {state.status === 'empty' && <><h1>No project selected.</h1><p>Restart with <code>npm start -- --project .</code> to open Boozer's own repository.</p></>}
    {state.status === 'closed' && <><h1>Project closed.</h1><p>Start a new launcher session to open a project.</p></>}
  </main>;
}
