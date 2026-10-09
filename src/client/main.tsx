import { createRoot } from 'react-dom/client';
import { App } from './App';
import type { ProjectSource } from './data/project-source';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing');

// Only the dev server gets the fixture preview; `import.meta.env.DEV` is false in
// production builds, so the fixture and its answer key are not bundled there.
const project: ProjectSource | null = import.meta.env.DEV
  ? (await import('./data/fixture-preview')).fixturePreview
  : null;

createRoot(root).render(<App project={project} />);
