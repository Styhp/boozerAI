import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMemo } from 'react';
import { NODE_CAP, NODE_HEIGHT, NODE_WIDTH, fileNodeId, type MapLayout } from '../map/layout';
import type { Selection } from '../map/model';

export function MapCanvas({ layout, selection, filter, onFilter, onSelect }: {
  layout: MapLayout;
  selection: Selection | null;
  filter: string;
  onFilter: (filter: string) => void;
  onSelect: (selection: Selection) => void;
}) {
  const selectedNode = selection?.kind === 'file' ? fileNodeId(selection.path) : selection?.kind === 'terminal' ? selection.nodeId : null;
  const selectedEdge = selection?.kind === 'edge' ? selection.id : null;

  const nodes = useMemo<Node[]>(() => layout.nodes.map((n) => ({
    id: n.id,
    position: { x: n.x, y: n.y },
    data: {
      label: (
        <span className="node-label" title={n.label}>
          <span className="node-name">{n.label}</span>
          <span className="node-detail">{n.detail}</span>
        </span>
      ),
    },
    className: `map-node kind-${n.kind}${n.parseError ? ' parse-error' : ''}${n.id === selectedNode ? ' selected' : ''}`,
    style: { width: NODE_WIDTH, height: NODE_HEIGHT },
    draggable: false,
    connectable: false,
  })), [layout, selectedNode]);

  const edges = useMemo<Edge[]>(() => layout.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    className: `map-edge kind-${e.kind}${e.id === selectedEdge ? ' selected' : ''}`,
    markerEnd: { type: MarkerType.ArrowClosed },
    ariaLabel: `${e.kind} ${e.id}`,
  })), [layout, selectedEdge]);

  const { counts } = layout;
  return (
    <section className="canvas" aria-label="Dependency map">
      <div className="canvas-bar">
        <label>
          Folder or path filter{' '}
          <input value={filter} onChange={(event) => onFilter(event.target.value)} placeholder="e.g. utils/" spellCheck={false} />
        </label>
        <p className="hint">
          Each box is a file; an arrow points from a file to what it uses. Blue dashed boxes are outside packages,
          dotted boxes are imports Boozer skipped (yellow) or could not follow (red), and dashed arrows carry only type definitions. Click a box to open it.
        </p>
        <p className="muted">
          Showing {counts.displayedFiles} of {counts.indexedFiles} files and {counts.displayedEdges} of {counts.indexedEdges} relationships
          {counts.omittedFiles + counts.omittedEdges > 0 && ` (${counts.omittedFiles} files and ${counts.omittedEdges} relationships hidden by the filter; still indexed and in the list)`}
        </p>
      </div>
      {layout.mode === 'canvas' && (
        <div className="flow">
          <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.1} nodesConnectable={false} nodesDraggable={false}
            onNodeClick={(_, node) => {
              const n = layout.nodes.find((candidate) => candidate.id === node.id);
              if (n?.path !== undefined) onSelect({ kind: 'file', path: n.path });
              else if (n) onSelect({ kind: 'terminal', nodeId: n.id });
            }}
            onEdgeClick={(_, edge) => onSelect({ kind: 'edge', id: edge.id })}>
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      )}
      {layout.mode === 'empty' && <p className="canvas-message">No files match this view. The list still shows every indexed file.</p>}
      {layout.mode === 'list-first' && (
        <p className="canvas-message">
          This graph needs {counts.renderedNodes} map nodes, over the {NODE_CAP}-node canvas cap. Use the list, or filter to a folder to open a canvas.
        </p>
      )}
      {layout.mode === 'filter-too-large' && (
        <p className="canvas-message">
          This filter still needs {counts.renderedNodes} map nodes, over the {NODE_CAP}-node cap. Narrow the filter; the list shows everything.
        </p>
      )}
    </section>
  );
}
