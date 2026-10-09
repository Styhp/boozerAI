import type { ReactNode } from 'react';

// Entry and status screens before a project is ready (SPEC §12b, screenshot 00).
export function GateCard({ title, children }: { title?: string | undefined; children: ReactNode }) {
  return (
    <div className="ws-gate">
      <div className="ws-gate-card">
        <span className="bz-wordmark">Boozer <b>AI</b></span>
        {title !== undefined && <h1>{title}</h1>}
        {children}
      </div>
    </div>
  );
}
