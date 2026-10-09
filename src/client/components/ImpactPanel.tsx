import { useState } from 'react';
import type { DependencyGraph, FilePath, GraphWalkResult } from '../../shared/contracts';
import { GraphQueryError, walkGraph } from '../../shared/graph-queries.js';
import type { Selection } from '../map/model';

const DEPTHS: readonly (number | null)[] = [1, 2, 3, null];
const depthLabel = (depth: number | null) => (depth === null ? 'All' : String(depth));

// Wording rules (C1): importer rows are "potentially affected"; never claim that a change
// will or won't break anything. Dependency rows are labeled dependencies.
export function ImpactPanel({ graph, path, onSelect }: { graph: DependencyGraph; path: FilePath; onSelect: (s: Selection) => void }) {
  const [direction, setDirection] = useState<'importers' | 'dependencies'>('importers');
  const [maxDepth, setMaxDepth] = useState<number | null>(1);

  let result: GraphWalkResult;
  try {
    result = walkGraph(graph, { selected: path, direction, maxDepth });
  } catch (error) {
    const message = error instanceof GraphQueryError ? error.message : String(error);
    return <section className="impact" data-state="error"><p className="notice error" role="status">{message}</p></section>;
  }
  const importers = direction === 'importers';
  const within = maxDepth === null ? '' : ` within depth ${maxDepth}`;

  return (
    <section className="impact" aria-label={importers ? 'Potential impact' : 'Dependencies'} data-direction={direction}>
      <div className="impact-controls">
        <div role="group" aria-label="Direction">
          <button type="button" aria-pressed={importers} onClick={() => setDirection('importers')}>Potentially affected</button>
          <button type="button" aria-pressed={!importers} onClick={() => setDirection('dependencies')}>Dependencies</button>
        </div>
        <div role="group" aria-label="Depth">
          {DEPTHS.map((depth) => (
            <button key={depthLabel(depth)} type="button" aria-pressed={maxDepth === depth} onClick={() => setMaxDepth(depth)}>
              {depthLabel(depth)}
            </button>
          ))}
        </div>
      </div>
      <h3>
        {importers ? 'Potentially affected files' : 'Dependencies'} ({result.reachable.length}{within})
      </h3>
      {result.reachable.length === 0 ? (
        <p className="muted">
          {importers ? `No importers found by static analysis${within}.` : `No local dependencies found by static analysis${within}.`}
        </p>
      ) : (
        <ol className="impact-rows">
          {result.reachable.map((entry) => (
            <li key={entry.path}>
              <button type="button" className="link" onClick={() => onSelect({ kind: 'file', path: entry.path })}>{entry.path}</button>
              <span className="badge">depth {entry.depth}</span>
              {entry.includesTypeOnly && <span className="badge kind-type">type-only path</span>}
              <span className="chain" aria-label="Evidence chain">
                {entry.chain.map((edge, i) => (
                  <span key={edge.id}>
                    {i > 0 && ' → '}
                    <button type="button" className="link" title={`${edge.kind} ${edge.specifier}`}
                      onClick={() => onSelect({ kind: 'edge', id: edge.id })}>
                      {edge.from}:{edge.evidence.startLine}
                    </button>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ol>
      )}
      {result.depthLimited && maxDepth !== null && (
        <p className="notice">
          More files are reachable beyond depth {maxDepth}.{' '}
          <button type="button" className="link" onClick={() => setMaxDepth(maxDepth + 1)}>Expand to depth {maxDepth + 1}</button>{' '}
          <button type="button" className="link" onClick={() => setMaxDepth(null)}>Show all</button>
        </p>
      )}
      {result.possiblyIncomplete && (
        <p className="notice warning" role="status">
          Possibly incomplete: this graph has skipped files or excluded and unresolved imports (see the summary), so
          some relationships may be missing.
        </p>
      )}
      <p className="muted small">Static import reachability shows potential relationships, not proof of runtime effects.</p>
    </section>
  );
}
