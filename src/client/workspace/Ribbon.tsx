import { Icon } from '../ui/Icon';

// SPEC §4.1: 44px ribbon. Refresh and Close project appear only with a project server.
// Search joins in S2, when it can fade dots in the graph as its copy says.
export function Ribbon({ sideOpen, onFiles, onOverview, onRefresh, onClose }: {
  sideOpen: boolean;
  onFiles: () => void;
  onOverview: () => void;
  onRefresh?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
}) {
  return (
    <nav className="ws-ribbon" aria-label="Views">
      <div className="ws-ribbon-mark" title="Boozer AI">B</div>
      <button type="button" className="ws-ribbon-btn" title="Files" aria-label="Files" aria-pressed={sideOpen} onClick={onFiles}>
        <Icon name="files" /></button>
      <button type="button" className="ws-ribbon-btn" title="Overview" aria-label="Overview" onClick={onOverview}>
        <Icon name="overview" /></button>
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
