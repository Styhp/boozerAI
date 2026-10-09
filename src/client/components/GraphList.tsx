import type { DependencyGraph } from '../../shared/contracts';
import { EDGE_KIND_HINTS, describeTarget, type Selection } from '../map/model';

// The complete file and relationship list. It always shows every indexed entry,
// whatever the canvas filter or cap is doing.
export function GraphList({ graph, selection, onSelect }: {
  graph: DependencyGraph;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
}) {
  const isFile = (path: string) => selection?.kind === 'file' && selection.path === path;
  const isEdge = (id: string) => selection?.kind === 'edge' && selection.id === id;
  return (
    <nav className="graph-list" aria-label="Files and relationships">
      <h2>Files <span className="muted">({graph.files.length})</span></h2>
      <p className="hint">Click a file to see its code, an explanation and what it connects to.</p>
      <ul>
        {graph.files.map((file) => (
          <li key={file.path}>
            <button type="button" className={isFile(file.path) ? 'row selected' : 'row'} aria-pressed={isFile(file.path)}
              onClick={() => onSelect({ kind: 'file', path: file.path })}>
              <span className="path">{file.path}</span>
              <span className={file.parse.status === 'error' ? 'badge error' : 'badge'}>
                {file.parse.status === 'error' ? 'parse error' : file.language}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <h2>Relationships <span className="muted">({graph.edges.length})</span></h2>
      <p className="hint">Each row is one import: a file and line that uses another file or package.</p>
      <ul>
        {graph.edges.map((edge) => {
          const target = describeTarget(edge);
          return (
            <li key={edge.id}>
              <button type="button" className={isEdge(edge.id) ? 'row selected' : 'row'} aria-pressed={isEdge(edge.id)}
                onClick={() => onSelect({ kind: 'edge', id: edge.id })}>
                <span className="path">{edge.from}:{edge.evidence.startLine}</span>
                <span className={`badge kind-${edge.target.type}`} title={EDGE_KIND_HINTS[edge.kind]}>{edge.kind}</span>
                <span className="target">→ {target.label}{target.reason ? ` (${target.reason})` : ''}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
