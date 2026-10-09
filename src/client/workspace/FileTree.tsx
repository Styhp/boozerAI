import type { FileNode, FilePath } from '../../shared/contracts';
import { Icon } from '../ui/Icon';
import { fileName, plural, type TreeFolder } from './model';

export interface TreeRowProps {
  readonly current: FilePath | null;
  readonly gaps: ReadonlyMap<FilePath, number>;
  readonly onOpen: (path: FilePath) => void;
}

// SPEC §8: name only, full path in the title; a parse error outranks the gap flag.
export function FileRow({ file, current, gaps, onOpen }: TreeRowProps & { file: FileNode }) {
  const gapsHere = gaps.get(file.path) ?? 0;
  return (
    <li>
      <button type="button" className="ws-tree-row is-file" title={file.path} data-hover-id={file.path}
        aria-current={current === file.path ? 'true' : undefined} onClick={() => onOpen(file.path)}>
        <span className="ws-tree-name">{fileName(file.path)}</span>
        {file.parse.status === 'error'
          ? <span className="ws-flag is-error">parse error</span>
          : gapsHere > 0 && <span className="ws-flag is-gap">{plural(gapsHere, 'gap')}</span>}
      </button>
    </li>
  );
}

export function FileTree({ folder, collapsed, onToggle, ...rows }: TreeRowProps & {
  folder: TreeFolder;
  collapsed: Readonly<Record<string, boolean>>;
  onToggle: (path: string) => void;
}) {
  return (
    <ul className="ws-tree">
      {folder.folders.map((child) => {
        const open = collapsed[child.path] !== true;
        return (
          <li key={child.path}>
            <button type="button" className="ws-tree-row" aria-expanded={open} onClick={() => onToggle(child.path)}>
              <Icon name="chevron" className="ws-tree-chevron" />
              <span className="ws-tree-name">{child.name}</span>
            </button>
            {open && <FileTree folder={child} collapsed={collapsed} onToggle={onToggle} {...rows} />}
          </li>
        );
      })}
      {folder.files.map((file) => <FileRow key={file.path} file={file} {...rows} />)}
    </ul>
  );
}
