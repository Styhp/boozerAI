import { createRoot } from 'react-dom/client';
import { App } from './App';
import type { ProjectSource } from './data/project-source';
import { ProjectGate } from './ProjectGate';
import { ProjectConnection, takeCapability } from './data/http-project-source';
// Load order (SPEC §2): tokens, then components. style.css is the S1 interim for panels not yet restyled.
import './styles/tokens.css';
import './styles/components.css';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing');

// Only the dev server gets the fixture preview; `import.meta.env.DEV` is false in
// production builds, so the fixture and its answer key are not bundled there.
const capability = takeCapability(window.location, window.history);
const project: ProjectSource | null = capability === null && import.meta.env.DEV
  ? (await import('./data/fixture-preview')).fixturePreview
  : null;

createRoot(root).render(capability === null
  ? <App project={project} />
  : <ProjectGate connection={new ProjectConnection(capability)} />);
