import type { ReactNode } from 'react';
import { Icon, type IconName } from '../ui/Icon';

// SPEC §7.1 chrome: tab, centred breadcrumb, scrolling body, status bar. Closing keeps the
// view, so reopening shows the same content. History and the source toggle arrive in S3.
export function Pane({ open, icon, title, crumbs, status, onClose, children }: {
  open: boolean;
  icon: IconName;
  title: string;
  crumbs: ReactNode;
  status: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <section className="ws-pane" data-open={open} aria-label="Detail" aria-hidden={!open}>
      <div className="ws-pane-inner">
        <div className="ws-tabs">
          <div className="ws-tab">
            <Icon name={icon} />
            <span>{title}</span>
            <button type="button" aria-label="Close pane" title="Close pane" onClick={onClose}><Icon name="close" /></button>
          </div>
        </div>
        <div className="ws-viewhead"><div className="ws-viewhead-title">{crumbs}</div></div>
        <div className="ws-pane-body">{children}</div>
        <div className="ws-status">{status}</div>
      </div>
    </section>
  );
}

// "src / hooks / usePlants.ts" with the file name bold.
export function PathCrumbs({ path }: { path: string }) {
  const parts = path.split('/');
  return <>{parts.map((part, index) => index === parts.length - 1
    ? <b key={index}>{part}</b>
    : <span key={index}>{part} / </span>)}</>;
}
