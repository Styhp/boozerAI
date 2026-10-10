import { useCallback, useEffect, useRef, useState } from 'react';
import type { DependencyGraph, Snippet } from '../shared/contracts';
import type { CloudStatus } from '../shared/explanation';
import type { ExplanationState } from './components/ExplanationPanel';
import type { ProjectSource } from './data/project-source';
import { selectedPath, type Selection, type SourceState } from './map/model';
import { GateCard } from './workspace/GateCard';
import { Workspace } from './workspace/Workspace';
import { useRepoChat } from './data/use-repo-chat';

type GraphState =
  | { status: 'loading' }
  // readAt: when this browser received the parser's graph, shown as "read Thu 9 Oct, 15:20".
  | { status: 'loaded'; graph: DependencyGraph; readAt: Date }
  | { status: 'failed'; message: string };

export function App({ project, onRefresh, onClose, onOpenAnother }: {
  project: ProjectSource | null;
  onRefresh?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
  onOpenAnother?: (() => void) | undefined;
}) {
  const [graphState, setGraphState] = useState<GraphState>({ status: 'loading' });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [source, setSource] = useState<SourceState>({ status: 'idle' });
  // Kept per file so a cited range can be opened and the explanation found again.
  const [explanations, setExplanations] = useState<ReadonlyMap<string, ExplanationState>>(new Map());
  const running = useRef(new Map<string, AbortController>());
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>({ available: false });
  // Cloud requests actually issued this session; the locality indicators count them.
  const [cloudSends, setCloudSends] = useState(0);

  useEffect(() => {
    project?.cloud?.status().then(setCloudStatus, () => setCloudStatus({ available: false }));
  }, [project]);

  useEffect(() => {
    if (project === null) return;
    project.loadGraph().then(
      (graph) => setGraphState({ status: 'loaded', graph, readAt: new Date() }),
      (error: unknown) => setGraphState({ status: 'failed', message: String(error) }),
    );
  }, [project]);

  const graph = graphState.status === 'loaded' ? graphState.graph : null;
  const chat = useRepoChat(project, graph?.snapshotId ?? null);
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

  // Local answers are keyed by path; cloud answers by `cloud:` + path, so both can be compared.
  const explain = useCallback(async (path: string, cloud?: { previewHash: string; model?: string }) => {
    if (project === null || graph === null) return;
    const key = cloud ? `cloud:${path}` : path;
    running.current.get(key)?.abort();
    const controller = new AbortController();
    running.current.set(key, controller);
    const update = (state: ExplanationState) => setExplanations((all) => new Map(all).set(key, state));
    let snippets: Snippet[] = [];
    let text = '';
    update({ status: 'running', snippets, text });
    if (cloud) setCloudSends((n) => n + 1);
    try {
      const body = cloud
        ? { snapshotId: graph.snapshotId, path, provider: 'cloud' as const, previewHash: cloud.previewHash, ...(cloud.model === undefined ? {} : { model: cloud.model }) }
        : { snapshotId: graph.snapshotId, path };
      for await (const event of project.explain(body, controller.signal)) {
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
      if (running.current.get(key) === controller) running.current.delete(key);
    }
  }, [project, graph]);

  if (project === null) {
    return <GateCard title="No project connected."><p>This build can't load a project yet.</p></GateCard>;
  }
  if (graphState.status === 'loading') return <GateCard><p role="status">Loading graph…</p></GateCard>;
  if (graphState.status === 'failed') {
    return <GateCard><p className="bz-notice bz-notice--danger" role="alert">Could not load the graph: {graphState.message}</p></GateCard>;
  }

  return (
    <Workspace graph={graphState.graph} label={project.label} isPreview={project.isPreview} readAt={graphState.readAt}
      selection={selection} onSelection={setSelection} source={source} notes={project.notes} cloudSends={cloudSends}
      fileHistory={project.fileHistory ? (path, signal) => project.fileHistory!(path, signal) : undefined}
      onRefresh={onRefresh} onClose={onClose} onOpenAnother={onOpenAnother} chat={chat}
      explanation={selection?.kind === 'file' ? {
        state: explanations.get(selection.path) ?? { status: 'idle' },
        onExplain: () => { void explain(selection.path); },
        onCancel: () => running.current.get(selection.path)?.abort(),
        cloud: cloudStatus.available && project.cloud && graph ? {
          status: cloudStatus,
          answer: explanations.get(`cloud:${selection.path}`) ?? { status: 'idle' },
          loadModels: project.cloud.models,
          onPreview: (model?: string) => project.cloud!.preview({ snapshotId: graph.snapshotId, path: selection.path, ...(model === undefined ? {} : { model }) }),
          onSend: (previewHash: string, model?: string) => { void explain(selection.path, { previewHash, ...(model === undefined ? {} : { model }) }); },
          onCancel: () => running.current.get(`cloud:${selection.path}`)?.abort(),
        } : undefined,
      } : undefined} />
  );
}
