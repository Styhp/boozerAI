import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DependencyGraph, FilePath } from '../../shared/contracts';
import { DetailPane, type ExplanationControls } from '../components/DetailPane';
import { MapCanvas } from '../components/MapCanvas';
import { DEFAULT_FILTERS, type GraphFilters } from '../graph/engine';
import { GraphView } from '../graph/GraphView';
import { SummaryPanel } from '../components/SummaryPanel';
import type { NotesSource } from '../data/project-source';
import { NODE_CAP, layoutMap } from '../map/layout';
import { describeTarget, selectedPath, sourceLines, type Selection, type SourceState } from '../map/model';
import { Icon } from '../ui/Icon';
import { buildTree, fileGapCounts, fileLinks, fileName, folderPaths, formatReadTime, gapCount, graphNodeCount, plural } from './model';
import { Pane, PathCrumbs } from './Pane';
import { Ribbon, type SideMode } from './Ribbon';
import { Locality, Sidebar } from './Sidebar';
import { RepoChatPanel, type RepoChatControls } from '../components/RepoChatPanel';

// SPEC §4.1: below this container width the sidebar collapses the first time the pane opens.
const AUTO_COLLAPSE_BELOW = 1360;

// Ribbon, sidebar + file tree, the force-directed graph (S2) and a sliding pane showing today's
// summary (Overview) or DetailPane until S3. Above the 300-node cap the graph area keeps C4's
// list-first MapCanvas with its folder filter (SPEC §5.9).
export function Workspace({ graph, label, isPreview, readAt, selection, onSelection, source, explanation, notes, chat,
  cloudSends, onRefresh, onClose, onOpenAnother }: {
  graph: DependencyGraph;
  label: string;
  isPreview: boolean;
  readAt: Date;
  selection: Selection | null;
  onSelection: (selection: Selection) => void;
  source: SourceState;
  explanation?: ExplanationControls | undefined;
  notes?: NotesSource | undefined;
  chat?: RepoChatControls | undefined;
  cloudSends: number;
  onRefresh?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
  onOpenAnother?: (() => void) | undefined;
}) {
  const [sideOpen, setSideOpen] = useState(true);
  const [side, setSide] = useState<SideMode>('files');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Indexing has finished when this mounts, so the Overview opens at once (as after Skip, §6.2).
  const [paneOpen, setPaneOpen] = useState(true);
  const [view, setView] = useState<'overview' | 'detail'>('overview');
  const [chatOpen, setChatOpen] = useState(false);
  const [filters, setFilters] = useState<GraphFilters>(DEFAULT_FILTERS);
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Folder filter for the over-cap MapCanvas only.
  const [filter, setFilter] = useState('');
  const main = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const width = main.current?.parentElement?.clientWidth ?? Infinity;
    if (width < AUTO_COLLAPSE_BELOW) setSideOpen(false);
  }, []);

  const tree = useMemo(() => buildTree(graph.files), [graph]);
  const gaps = useMemo(() => fileGapCounts(graph), [graph]);
  const overCap = useMemo(() => graphNodeCount(graph) > NODE_CAP, [graph]);
  const layout = useMemo(() => (overCap ? layoutMap(graph, filter) : null), [overCap, graph, filter]);

  const showingChat = chatOpen && chat !== undefined;
  const showingDetail = paneOpen && !showingChat && view === 'detail' && selection !== null;
  const current = showingDetail ? selectedPath(graph, selection) : null;

  const open = (next: Selection) => { onSelection(next); setView('detail'); setChatOpen(false); setPaneOpen(true); };
  const openFile = (path: FilePath) => open({ kind: 'file', path });
  const toggleFolder = (path: string) => setCollapsed((all) => ({ ...all, [path]: all[path] !== true }));
  const showSide = (mode: SideMode) => {
    if (sideOpen && side === mode) { setSideOpen(false); return; }
    setSide(mode); setSideOpen(true);
  };
  const collapseAll = () => {
    const folders = folderPaths(tree);
    const allClosed = folders.every((path) => collapsed[path] === true);
    setCollapsed(Object.fromEntries(folders.map((path) => [path, !allClosed])));
  };

  const detail = view === 'detail' && selection !== null;
  const detailPath = detail ? selectedPath(graph, selection) : null;
  const lines = detailPath !== null && source.status === 'loaded' && source.source.path === detailPath
    ? sourceLines(source.source.text).length : null;
  const links = detailPath === null || showingChat ? null : fileLinks(graph, detailPath);
  const title = showingChat ? 'Chat Boozer' : !detail ? 'Overview' : detailPath !== null ? fileName(detailPath) : terminalLabel(graph, selection);

  return <>
    <Ribbon sideOpen={sideOpen} side={side} onSide={showSide}
      onOverview={() => { setView('overview'); setChatOpen(false); setPaneOpen(true); }} onRefresh={onRefresh} onClose={onClose}
      onChat={chat === undefined ? undefined : () => { setChatOpen(true); setPaneOpen(true); }} chatOpen={paneOpen && showingChat} />
    <Sidebar open={sideOpen} mode={side} label={label} files={graph.files} tree={tree} collapsed={collapsed} current={current} gaps={gaps}
      search={filters.search} cloudSends={cloudSends} onSearch={(search) => setFilters((all) => ({ ...all, search }))}
      onToggleFolder={toggleFolder} onCollapseAll={collapseAll} onClose={() => setSideOpen(false)} onOpen={openFile} onHover={setHoverId} />
    <main className="ws-main" ref={main}>
      <div className="ws-tabs"><div className="ws-tab"><Icon name="graph" /><span>Graph view</span></div></div>
      <div className="ws-viewhead">
        <button type="button" className="ws-icon-btn" title="Toggle file tree" aria-label="Toggle file tree"
          onClick={() => setSideOpen((was) => !was)}><Icon name="files" /></button>
        <div className="ws-viewhead-title"><b>{label}</b> · read {formatReadTime(readAt)}</div>
        {onOpenAnother && <button type="button" className="bz-btn" onClick={onOpenAnother}>Open another folder</button>}
      </div>
      {layout === null
        ? <GraphView graph={graph} selectedPath={current} externalHoverId={hoverId} filters={filters} onFiltersChange={setFilters}
            layoutKey={`${paneOpen}:${sideOpen}`} onOpen={openFile} />
        : <div className="ws-graph">
            <MapCanvas layout={layout} selection={showingDetail ? selection : null} filter={filter} onFilter={setFilter} onSelect={open} />
          </div>}
    </main>
    <Pane open={paneOpen} icon={showingChat ? 'ai' : detail ? 'file' : 'overview'} title={title}
      tabs={chat === undefined ? undefined : [
        { id: 'ws-details-tab', label: 'Details', icon: detail ? 'file' : 'overview', selected: !showingChat, onSelect: () => setChatOpen(false) },
        { id: 'ws-chat-tab', label: 'Chat Boozer', icon: 'ai', selected: showingChat, onSelect: () => setChatOpen(true) },
      ]}
      crumbs={showingChat || !detail ? <>{label} / <b>{title}</b></> : detailPath !== null ? <PathCrumbs path={detailPath} /> : <>{label} / <b>{title}</b></>}
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
      {showingChat ? <RepoChatPanel graph={graph} chat={chat} contextPath={selectedPath(graph, selection)} onSelect={open} /> : detail
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
