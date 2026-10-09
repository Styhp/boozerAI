import type { FileNode, FilePath } from '../../shared/contracts';
import { Icon } from '../ui/Icon';
import { FileTree } from './FileTree';
import { plural, type TreeFolder } from './model';

// Where code has gone: always visible, and counts every cloud request once one is sent.
export function Locality({ cloudSends }: { cloudSends: number }) {
  return cloudSends === 0
    ? <span className="ws-loc">On this computer</span>
    : <span className="ws-loc is-external">{plural(cloudSends, 'request')} sent online</span>;
}

export function Sidebar({ open, label, files, tree, collapsed, current, gaps, cloudSends,
  onToggleFolder, onCollapseAll, onClose, onOpen }: {
  open: boolean;
  label: string;
  files: readonly FileNode[];
  tree: TreeFolder;
  collapsed: Readonly<Record<string, boolean>>;
  current: FilePath | null;
  gaps: ReadonlyMap<FilePath, number>;
  cloudSends: number;
  onToggleFolder: (path: string) => void;
  onCollapseAll: () => void;
  onClose: () => void;
  onOpen: (path: FilePath) => void;
}) {
  return (
    <aside className="ws-side" data-open={open} aria-label="Files" aria-hidden={!open}>
      <div className="ws-side-head">
        <b>{label}</b>
        <button type="button" className="ws-icon-btn" title="Collapse all folders" aria-label="Collapse all folders" onClick={onCollapseAll}>
          <Icon name="overview" /></button>
        <button type="button" className="ws-icon-btn" title="Close sidebar" aria-label="Close sidebar" onClick={onClose}>
          <Icon name="close" /></button>
      </div>
      <div className="ws-side-body">
        <FileTree folder={tree} collapsed={collapsed} onToggle={onToggleFolder} current={current} gaps={gaps} onOpen={onOpen} />
      </div>
      <div className="ws-side-foot">
        <Locality cloudSends={cloudSends} />
        <span className="ws-count">{plural(files.length, 'file')}</span>
      </div>
    </aside>
  );
}
