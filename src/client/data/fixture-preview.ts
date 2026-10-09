import type { DependencyGraph } from '../../shared/contracts';
import { sha256Hex, type ProjectSource } from './project-source';

// DEV ONLY. Loaded behind `import.meta.env.DEV`, so production builds never include it.
// `?raw` brings fixture files in as plain strings; nothing here imports or runs them.
// The graph is the hand-written 1.3 answer key, not parser output, and is labeled so.

const graphFiles = import.meta.glob<string>('../../../fixtures/basic/expected-graph.json', {
  query: '?raw', import: 'default', eager: true,
});
const sourceFiles = import.meta.glob<string>('../../../fixtures/basic/src/**/*', { query: '?raw', import: 'default' });
const sourcePrefix = '../../../fixtures/basic/src/';

export const fixturePreview: ProjectSource = {
  label: 'Fixture preview: hand-written answer key, not parser output',
  isPreview: true,
  async loadGraph() {
    const text = Object.values(graphFiles)[0];
    if (text === undefined) throw new Error('Fixture answer key not found');
    return JSON.parse(text) as DependencyGraph;
  },
  async loadSource(path) {
    const load = sourceFiles[`${sourcePrefix}${path}`];
    if (load === undefined) throw new Error(`No fixture source for ${path}`);
    const text = await load();
    const graph = await this.loadGraph();
    return { snapshotId: graph.snapshotId, path, contentHash: await sha256Hex(text), text };
  },
};
