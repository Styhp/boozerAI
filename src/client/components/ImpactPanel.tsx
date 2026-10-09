import { useState } from 'react';
import type { DependencyGraph, FilePath, GraphWalkResult } from '../../shared/contracts';
import { GraphQueryError, runtimeReachable, walkGraph } from '../../shared/graph-queries.js';
import type { Selection } from '../map/model';

const DEPTHS: readonly (number | null)[] = [1, 2, 3, null];
const depthLabel = (depth: number | null) => (depth === null ? 'All' : String(depth));
// P-18: "depth 2" reads as jargon; the row badge says how many steps away a file is.
const stepsLabel = (depth: number) => (depth === 1 ? 'direct' : `${depth} steps away`);

// Wording rules (C1): importer rows are "potentially affected"; never claim that a change
// will or won't break anything. Dependency rows are labeled dependencies.
export function ImpactPanel({ graph, path, onSelect }: { graph: DependencyGraph; path: FilePath; onSelect: (s: Selection) => void }) {
  const [direction, setDirection] = useState<'importers' | 'dependencies'>('importers');
  const [maxDepth, setMaxDepth] = useState<number | null>(1);

  let result: GraphWalkResult;
  let runtime: Set<FilePath>;
  try {
    result = walkGraph(graph, { selected: path, direction, maxDepth });
    runtime = runtimeReachable(graph, path, direction);
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
          <button type="button" aria-pressed={importers} onClick={() => setDirection('importers')}
            title="Files that use this file">Potentially affected</button>
          <button type="button" aria-pressed={!importers} onClick={() => setDirection('dependencies')}
            title="Files this file uses">Dependencies</button>
        </div>
        <div role="group" aria-label="Depth">
          <span className="muted small">How many steps:</span>
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
      <p className="hint">
        {importers
          ? 'Files that use this file, directly or through other files. If you change this file, check these too.'
          : 'Files this file uses, directly or through other files.'}
      </p>
      {result.reachable.length === 0 ? (
        <p className="muted">
          {importers ? `No importers found by static analysis${within}.` : `No local dependencies found by static analysis${within}.`}
        </p>
      ) : (
        <ol className="impact-rows">
          {result.reachable.map((entry) => (
            <li key={entry.path}>
              <button type="button" className="link" onClick={() => onSelect({ kind: 'file', path: entry.path })}>{entry.path}</button>
              <span className="badge" title={`depth ${entry.depth}`}>{stepsLabel(entry.depth)}</span>
              {entry.includesTypeOnly && (runtime.has(entry.path)
                ? <span className="badge kind-type">shown chain includes a type import; a runtime path also exists</span>
                : <span className="badge kind-type" title="Only type definitions connect these files; no running code">type-only path</span>)}
              <span className="chain" aria-label="Evidence chain">
                <span className="muted">How: </span>
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
      <p className="muted small">Static import reachability shows potential relationships, not proof of runtime effects. Boozer read the imports; it did not run the code.</p>
    </section>
  );
}
