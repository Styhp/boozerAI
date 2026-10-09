import { useEffect, useMemo, useState } from 'react';
import type { DependencyGraph } from '../shared/contracts';
import { DetailPane } from './components/DetailPane';
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
        <DetailPane graph={graphState.graph} selection={selection} source={source} onSelect={setSelection} />
      </div>
    </div>
  );
}
