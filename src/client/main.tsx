import { createRoot } from 'react-dom/client';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing');

createRoot(root).render(
  <main>
    <p className="eyebrow">Boozer AI</p>
    <h1>Understand the code.</h1>
    <p>The application scaffold is ready. Project analysis is not available yet.</p>
  </main>,
);
