import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DependencyGraph, Snippet } from '../shared/contracts';
import { DetailPane } from './components/DetailPane';
import type { ExplanationState } from './components/ExplanationPanel';
import { GraphList } from './components/GraphList';
import { MapCanvas } from './components/MapCanvas';
import { SummaryPanel } from './components/SummaryPanel';
import type { ProjectSource } from './data/project-source';
import { layoutMap } from './map/layout';
import { selectedPath, type Selection, type SourceState } from './map/model';

type GraphState =
  | { status: 'loading' }
  | { status: 'loaded'; graph: DependencyGraph }
  | { status: 'failed'; message: string };

export function App({ project }: { project: ProjectSource | null }) {
  const [graphState, setGraphState] = useState<GraphState>({ status: 'loading' });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [source, setSource] = useState<SourceState>({ status: 'idle' });
  const [filter, setFilter] = useState('');
  // Kept per file so a cited range can be opened and the explanation found again.
  const [explanations, setExplanations] = useState<ReadonlyMap<string, ExplanationState>>(new Map());
  const running = useRef(new Map<string, AbortController>());

  useEffect(() => {
    if (project === null) return;
    project.loadGraph().then(
      (graph) => setGraphState({ status: 'loaded', graph }),
      (error: unknown) => setGraphState({ status: 'failed', message: String(error) }),
    );
  }, [project]);

  const graph = graphState.status === 'loaded' ? graphState.graph : null;
  const path = graph === null ? null : selectedPath(graph, selection);
  useEffect(() => {
    if (project === null || path === null) { setSource({ status: 'idle' }); return; }
    let current = true;
    setSource({ status: 'loading', path });
    project.loadSource(path).then(
      (loaded) => { if (current) setSource({ status: 'loaded', source: loaded }); },
      (error: unknown) => { if (current) setSource({ status: 'failed', path, message: String(error) }); },
    );
    return () => { current = false; };
  }, [project, path]);

  const explain = useCallback(async (path: string) => {
    if (project === null || graph === null) return;
    running.current.get(path)?.abort();
    const controller = new AbortController();
    running.current.set(path, controller);
    const update = (state: ExplanationState) => setExplanations((all) => new Map(all).set(path, state));
    let snippets: Snippet[] = [];
    let text = '';
    update({ status: 'running', snippets, text });
    try {
      for await (const event of project.explain({ snapshotId: graph.snapshotId, path }, controller.signal)) {
        if (event.type === 'snippets') snippets = [...event.snippets];
        else if (event.type === 'token') text += event.text;
        if (event.type === 'done') { update({ status: 'done', explanation: event.explanation, details: event.details }); return; }
        if (event.type === 'error') { update({ status: 'error', code: event.code, message: event.message, snippets, text }); return; }
        update({ status: 'running', snippets, text });
      }
      update({ status: 'error', code: 'runtime-error', message: 'The explanation stream ended early.', snippets, text });
    } catch {
      update({ status: 'error', code: controller.signal.aborted ? 'cancelled' : 'runtime-error', message: 'The explanation did not finish.', snippets, text });
    } finally {
      if (running.current.get(path) === controller) running.current.delete(path);
    }
  }, [project, graph]);

  const layout = useMemo(() => (graph === null ? null : layoutMap(graph, filter)), [graph, filter]);

  if (project === null) {
    return (
      <main className="message-screen">
        <p className="eyebrow">Boozer AI</p>
        <h1>No project connected.</h1>
        <p>This build can't load a project yet.</p>
      </main>
    );
  }
  if (graphState.status === 'loading') return <main className="message-screen"><p>Loading graph…</p></main>;
  if (graphState.status === 'failed') return <main className="message-screen"><p className="notice error">Could not load the graph: {graphState.message}</p></main>;

  return (
    <div className="app">
      <SummaryPanel graph={graphState.graph} sourceLabel={project.label} isPreview={project.isPreview} />
      <div className="workspace">
        <GraphList graph={graphState.graph} selection={selection} onSelect={setSelection} />
        <MapCanvas layout={layout!} selection={selection} filter={filter} onFilter={setFilter} onSelect={setSelection} />
        <DetailPane graph={graphState.graph} selection={selection} source={source} onSelect={setSelection}
          explanation={selection?.kind === 'file' ? {
            state: explanations.get(selection.path) ?? { status: 'idle' },
            onExplain: () => { void explain(selection.path); },
            onCancel: () => running.current.get(selection.path)?.abort(),
          } : undefined} />
      </div>
    </div>
  );
}
