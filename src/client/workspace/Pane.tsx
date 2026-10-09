import { useRef, type ReactNode } from 'react';
import { Icon, type IconName } from '../ui/Icon';

export interface PaneTab {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

// SPEC §7.1 chrome: tabs, centred breadcrumb, scrolling body, status bar. Closing keeps the
// view, so reopening shows the same content. History and the source toggle arrive in S3.
export function Pane({ open, icon, title, tabs, crumbs, status, onClose, children }: {
  open: boolean;
  icon: IconName;
  title: string;
  tabs?: readonly PaneTab[] | undefined;
  crumbs: ReactNode;
  status: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const activeTab = tabs?.find((tab) => tab.selected);
  return (
    <section className="ws-pane" data-open={open} aria-label="Detail" aria-hidden={!open} inert={!open}>
      <div className="ws-pane-inner">
        <div className="ws-tabs">
          {tabs === undefined ? <div className="ws-tab">
            <Icon name={icon} />
            <span>{title}</span>
            <button type="button" aria-label="Close pane" title="Close pane" onClick={onClose}><Icon name="close" /></button>
          </div> : <>
            <div className="ws-pane-tablist" role="tablist" aria-label="Detail pane views">
              {tabs.map((tab, index) => <button type="button" className="ws-tab" role="tab" id={tab.id} key={tab.id}
                aria-selected={tab.selected} aria-controls="ws-pane-content" tabIndex={tab.selected ? 0 : -1}
                ref={(element) => { tabButtons.current[index] = element; }} onClick={tab.onSelect}
                onKeyDown={(event) => {
                  const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
                    : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
                    : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
                  if (next === null) return;
                  event.preventDefault();
                  tabs[next]!.onSelect();
                  tabButtons.current[next]?.focus();
                }}><Icon name={tab.icon} /><span>{tab.label}</span></button>)}
            </div>
            <button type="button" className="ws-icon-btn ws-pane-close" aria-label="Close pane" title="Close pane" onClick={onClose}>
              <Icon name="close" />
            </button>
          </>}
        </div>
        <div className="ws-viewhead"><div className="ws-viewhead-title">{crumbs}</div></div>
        <div className="ws-pane-body" role={activeTab === undefined ? undefined : 'tabpanel'}
          id={activeTab === undefined ? undefined : 'ws-pane-content'} aria-labelledby={activeTab?.id}
          tabIndex={activeTab === undefined ? undefined : 0}>{children}</div>
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
