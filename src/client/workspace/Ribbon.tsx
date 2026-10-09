import { Icon } from '../ui/Icon';

export type SideMode = 'files' | 'search';

// SPEC §4.1: 44px ribbon. Refresh and Close project appear only with a project server.
export function Ribbon({ sideOpen, side, onSide, onOverview, onChat, chatOpen, onRefresh, onClose }: {
  sideOpen: boolean;
  side: SideMode;
  onSide: (mode: SideMode) => void;
  onOverview: () => void;
  onChat?: (() => void) | undefined;
  chatOpen?: boolean | undefined;
  onRefresh?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
}) {
  return (
    <nav className="ws-ribbon" aria-label="Views">
      <div className="ws-ribbon-mark" title="Boozer AI">B</div>
      <button type="button" className="ws-ribbon-btn" title="Files" aria-label="Files"
        aria-pressed={sideOpen && side === 'files'} onClick={() => onSide('files')}><Icon name="files" /></button>
      <button type="button" className="ws-ribbon-btn" title="Search" aria-label="Search"
        aria-pressed={sideOpen && side === 'search'} onClick={() => onSide('search')}><Icon name="search" /></button>
      <button type="button" className="ws-ribbon-btn" title="Overview" aria-label="Overview" onClick={onOverview}>
        <Icon name="overview" /></button>
      {onChat && <button type="button" className="ws-ribbon-btn" title="Chat Boozer" aria-label="Chat Boozer" aria-pressed={chatOpen === true} onClick={onChat}>
        <Icon name="ai" /></button>}
      <span className="ws-ribbon-spacer" />
      {onRefresh && (
        <button type="button" className="ws-ribbon-btn" title="Refresh: read the folder again" aria-label="Refresh: read the folder again"
          onClick={onRefresh}><Icon name="refresh" /></button>
      )}
      {/* Not in the handover: kept from the old toolbar at the human lead's request (2026-10-10). */}
      {onClose && (
        <button type="button" className="ws-ribbon-btn" title="Close project" aria-label="Close project" onClick={onClose}>
          <Icon name="close" /></button>
      )}
    </nav>
  );
}
