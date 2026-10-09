import type { MouseEvent } from 'react';
import type { FileNode, FilePath } from '../../shared/contracts';
import { Icon } from '../ui/Icon';
import { FileRow, FileTree } from './FileTree';
import { matchesSearch, plural, type TreeFolder } from './model';
import type { SideMode } from './Ribbon';

// Where code has gone: always visible, and counts every cloud request once one is sent.
export function Locality({ cloudSends }: { cloudSends: number }) {
  return cloudSends === 0
    ? <span className="ws-loc">On this computer</span>
    : <span className="ws-loc is-external">{plural(cloudSends, 'request')} sent online</span>;
}

// SPEC §9: anything carrying data-hover-id lights its dot while the pointer is over it.
export const hoverIdOf = (event: MouseEvent) =>
  (event.target as Element).closest('[data-hover-id]')?.getAttribute('data-hover-id') ?? null;

export function Sidebar({ open, mode, label, files, tree, collapsed, current, gaps, search, cloudSends,
  onSearch, onToggleFolder, onCollapseAll, onClose, onOpen, onHover }: {
  open: boolean;
  mode: SideMode;
  label: string;
  files: readonly FileNode[];
  tree: TreeFolder;
  collapsed: Readonly<Record<string, boolean>>;
  current: FilePath | null;
  gaps: ReadonlyMap<FilePath, number>;
  search: string;
  cloudSends: number;
  onSearch: (query: string) => void;
  onToggleFolder: (path: string) => void;
  onCollapseAll: () => void;
  onClose: () => void;
  onOpen: (path: FilePath) => void;
  onHover: (id: string | null) => void;
}) {
  const rows = { current, gaps, onOpen };
  const query = search.trim();
  const matches = query === '' ? [] : files.filter((file) => matchesSearch(file.path, query));
  return (
    <aside className="ws-side" data-open={open} aria-label="Files" aria-hidden={!open}
      onMouseOver={(event) => onHover(hoverIdOf(event))} onMouseLeave={() => onHover(null)}>
      <div className="ws-side-head">
        <b>{mode === 'search' ? 'Search' : label}</b>
        {mode === 'files' && (
          <button type="button" className="ws-icon-btn" title="Collapse all folders" aria-label="Collapse all folders" onClick={onCollapseAll}>
            <Icon name="overview" /></button>
        )}
        <button type="button" className="ws-icon-btn" title="Close sidebar" aria-label="Close sidebar" onClick={onClose}>
          <Icon name="close" /></button>
      </div>
      <div className="ws-side-body">
        {mode === 'search' ? <>
          {/* Margins from the prototype's search field and hint; components.css leaves them out. */}
          <input className="ws-search" style={{ marginBottom: 8 }} autoFocus placeholder="Filter files and graph" aria-label="Filter files and graph"
            value={search} spellCheck={false} onChange={(event) => onSearch(event.target.value)} />
          <p className="ws-sub" style={{ margin: '0 6px 8px' }}>
            {query === '' ? 'Type part of a name or folder.' : `${plural(matches.length, 'file')} match. Other dots fade in the graph.`}
          </p>
          <ul className="ws-tree">{matches.map((file) => <FileRow key={file.path} file={file} {...rows} />)}</ul>
        </> : <FileTree folder={tree} collapsed={collapsed} onToggle={onToggleFolder} {...rows} />}
      </div>
      <div className="ws-side-foot">
        <Locality cloudSends={cloudSends} />
        <span className="ws-count">{plural(files.length, 'file')}</span>
      </div>
    </aside>
  );
}
