import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DependencyGraph, FilePath } from '../../shared/contracts';
import { DetailPane, type ExplanationControls } from '../components/DetailPane';
import { MapCanvas } from '../components/MapCanvas';
import { SummaryPanel } from '../components/SummaryPanel';
import type { NotesSource } from '../data/project-source';
import { layoutMap } from '../map/layout';
import { describeTarget, selectedPath, sourceLines, type Selection, type SourceState } from '../map/model';
import { Icon } from '../ui/Icon';
import { buildTree, fileGapCounts, fileLinks, fileName, folderPaths, formatReadTime, gapCount, plural } from './model';
import { Pane, PathCrumbs } from './Pane';
import { Ribbon } from './Ribbon';
import { Locality, Sidebar } from './Sidebar';

// SPEC §4.1: below this container width the sidebar collapses the first time the pane opens.
const AUTO_COLLAPSE_BELOW = 1360;

// S1 shell: ribbon, sidebar + file tree, today's MapCanvas, and a sliding pane showing
// today's summary (Overview) or DetailPane. The S2 engine replaces MapCanvas.
export function Workspace({ graph, label, isPreview, readAt, selection, onSelection, source, explanation, notes,
  cloudSends, onRefresh, onClose }: {
  graph: DependencyGraph;
  label: string;
  isPreview: boolean;
  readAt: Date;
  selection: Selection | null;
  onSelection: (selection: Selection) => void;
  source: SourceState;
  explanation?: ExplanationControls | undefined;
  notes?: NotesSource | undefined;
  cloudSends: number;
  onRefresh?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
}) {
  const [sideOpen, setSideOpen] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Indexing has finished when this mounts, so the Overview opens at once (as after Skip, §6.2).
  const [paneOpen, setPaneOpen] = useState(true);
  const [view, setView] = useState<'overview' | 'detail'>('overview');
  const [filter, setFilter] = useState('');
  const main = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const width = main.current?.parentElement?.clientWidth ?? Infinity;
    if (width < AUTO_COLLAPSE_BELOW) setSideOpen(false);
  }, []);

  const tree = useMemo(() => buildTree(graph.files), [graph]);
  const gaps = useMemo(() => fileGapCounts(graph), [graph]);
  const layout = useMemo(() => layoutMap(graph, filter), [graph, filter]);

  const showingDetail = paneOpen && view === 'detail' && selection !== null;
  const current = showingDetail ? selectedPath(graph, selection) : null;

  const open = (next: Selection) => { onSelection(next); setView('detail'); setPaneOpen(true); };
  const openFile = (path: FilePath) => open({ kind: 'file', path });
  const toggleFolder = (path: string) => setCollapsed((all) => ({ ...all, [path]: all[path] !== true }));
  const collapseAll = () => {
    const folders = folderPaths(tree);
    const allClosed = folders.every((path) => collapsed[path] === true);
    setCollapsed(Object.fromEntries(folders.map((path) => [path, !allClosed])));
  };

  const detail = view === 'detail' && selection !== null;
  const detailPath = detail ? selectedPath(graph, selection) : null;
  const lines = detailPath !== null && source.status === 'loaded' && source.source.path === detailPath
    ? sourceLines(source.source.text).length : null;
  const links = detailPath === null ? null : fileLinks(graph, detailPath);
  const title = !detail ? 'Overview' : detailPath !== null ? fileName(detailPath) : terminalLabel(graph, selection);

  return <>
    <Ribbon sideOpen={sideOpen} onFiles={() => setSideOpen((was) => !was)}
      onOverview={() => { setView('overview'); setPaneOpen(true); }} onRefresh={onRefresh} onClose={onClose} />
    <Sidebar open={sideOpen} label={label} files={graph.files} tree={tree} collapsed={collapsed} current={current} gaps={gaps}
      cloudSends={cloudSends} onToggleFolder={toggleFolder} onCollapseAll={collapseAll} onClose={() => setSideOpen(false)} onOpen={openFile} />
    <main className="ws-main" ref={main}>
      <div className="ws-tabs"><div className="ws-tab"><Icon name="graph" /><span>Graph view</span></div></div>
      <div className="ws-viewhead">
        <button type="button" className="ws-icon-btn" title="Toggle file tree" aria-label="Toggle file tree"
          onClick={() => setSideOpen((was) => !was)}><Icon name="files" /></button>
        <div className="ws-viewhead-title"><b>{label}</b> · read {formatReadTime(readAt)}</div>
      </div>
      <div className="ws-graph">
        <MapCanvas layout={layout} selection={showingDetail ? selection : null} filter={filter} onFilter={setFilter} onSelect={open} />
      </div>
    </main>
    <Pane open={paneOpen} icon={detail ? 'file' : 'overview'} title={title}
      crumbs={!detail ? <>{label} / <b>Overview</b></> : detailPath !== null ? <PathCrumbs path={detailPath} /> : <>{label} / <b>{title}</b></>}
      status={links !== null ? <>
        <span>Used by {links.usedBy}</span>
        <span>Uses {plural(links.uses, 'file')}</span>
        {lines !== null && <span>{plural(lines, 'line')}</span>}
        <Locality cloudSends={cloudSends} />
      </> : <>
        <span>{plural(graph.files.length, 'file')}</span>
        <span>{plural(graph.coverage.imports.seen, 'import')}</span>
        <span>{plural(gapCount(graph), 'gap')}</span>
        <Locality cloudSends={cloudSends} />
      </>}
      onClose={() => setPaneOpen(false)}>
      {detail
        ? <DetailPane graph={graph} selection={selection} source={source} onSelect={open} explanation={explanation} notes={notes} />
        : <div className="ws-note"><SummaryPanel graph={graph} sourceLabel={label} isPreview={isPreview} onSelect={open} /></div>}
    </Pane>
  </>;
}

// Packages, excluded and unresolved targets have no file; name them as DetailPane does.
function terminalLabel(graph: DependencyGraph, selection: Selection): string {
  if (selection.kind !== 'terminal') return '';
  const edge = graph.edges.find(({ id, target }) =>
    (target.type === 'package' && selection.nodeId === `package:${target.name}`) ||
    (target.type !== 'file' && selection.nodeId === `${target.type}:${id}`));
  return edge === undefined ? '' : describeTarget(edge).label;
}
