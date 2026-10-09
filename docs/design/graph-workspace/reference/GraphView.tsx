// Boozer graph workspace — reference React wrapper for the graph engine.
// Owns the canvas, the animation loop, pointer/wheel input, the parser hover card, the replay
// overlay, the hint, the legend and the settings popover. Everything else (tree, pane, routing)
// talks to it through props. Class names match assets/components.css.
import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import type { DependencyGraph, FilePath } from '../../../../src/shared/contracts';
import {
  GRAPH, buildModel, drawGraph, finishReplay, fitCamera, hitTest, hoverCardData, planReplay, readColors, reheat, revealNode,
  stepCamera, stepSimulation, toWorld, zoomAt,
  type Camera, type GraphColors, type GraphFilters, type GraphModel, type GraphNode, type ReplayStep, type Viewport,
} from './graph-engine';
import { GRAPH_COPY as C, ISSUE_WORDS, SKIP_WORDS } from './copy';

export interface GraphViewProps {
  graph: DependencyGraph;
  projectLabel: string;
  selectedPath: FilePath | null;          // file open in the detail pane (ring + lit neighbourhood)
  externalHoverId: string | null;         // node id hovered in the tree or pane (path, pkg:…, gap:…)
  filters: GraphFilters;
  onFiltersChange: (f: GraphFilters) => void;
  replayKey: number | null;               // change it to replay "drawing what Boozer found"; null = none
  layoutKey: string;                      // change when the canvas width changes (pane/sidebar toggles)
  themeKey: string;                       // change when the theme changes so colours are re-read
  onOpen: (path: FilePath) => void;
  onReplayDone?: () => void;
}

const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function GraphView(props: GraphViewProps) {
  const { graph, filters } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<GraphModel | null>(null);
  const camRef = useRef<Camera>({ x: 0, y: 0, k: 1, target: null });
  const viewRef = useRef<Viewport>({ w: 0, h: 0 });
  const colorsRef = useRef<GraphColors | null>(null);
  const hoverRef = useRef<GraphNode | null>(null);
  const live = useRef(props); live.current = props;   // latest props for the rAF loop
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);
  const [replay, setReplay] = useState<{ steps: ReplayStep[]; shown: number; total: number } | null>(null);

  // Model: rebuild when the graph changes. Refresh keeps existing positions; new files appear at once.
  const model = useMemo(() => buildModel(graph, modelRef.current ?? undefined), [graph]);
  modelRef.current = model;

  // Colours from CSS custom properties.
  useEffect(() => { if (wrapRef.current) colorsRef.current = readColors(wrapRef.current); }, [props.themeKey]);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => { if (wrapRef.current) colorsRef.current = readColors(wrapRef.current); };
    mq.addEventListener('change', on); return () => mq.removeEventListener('change', on);
  }, []);

  // Size.
  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current; if (!wrap || !canvas) return;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect(); const dpr = devicePixelRatio || 1;
      viewRef.current = { w: r.width, h: r.height }; canvas.width = Math.max(1, r.width * dpr); canvas.height = Math.max(1, r.height * dpr);
    });
    ro.observe(wrap); return () => ro.disconnect();
  }, []);

  // After a pane or sidebar toggles: wait for the 280ms width transition, then keep the selection visible.
  useEffect(() => {
    const id = setTimeout(() => {
      const m = modelRef.current; if (!m) return;
      const sel = live.current.selectedPath ? m.byId.get(live.current.selectedPath) : undefined;
      if (sel) revealNode(camRef.current, viewRef.current, sel); else fitCamera(camRef.current, viewRef.current, m, live.current.filters, true);
    }, 320);
    return () => clearTimeout(id);
  }, [props.layoutKey]);

  // Reading replay.
  useEffect(() => {
    const m = modelRef.current; if (!m) return;
    if (props.replayKey === null || prefersReducedMotion()) { finishReplay(m); fitCamera(camRef.current, viewRef.current, m, filters, false); setReplay(null); return; }
    const start = performance.now();
    const plan = planReplay(m, graph, start);
    camRef.current = { x: 0, y: 0, k: 1, target: null };
    setReplay({ steps: plan.steps, shown: 0, total: graph.coverage.files.found });
    const timers = plan.steps.map((s, i) => setTimeout(() => { setReplay((r) => (r ? { ...r, shown: i + 1 } : r)); reheat(m, GRAPH.force.reheatBirth); }, s.at));
    timers.push(setTimeout(() => { setReplay(null); fitCamera(camRef.current, viewRef.current, m, live.current.filters, true); live.current.onReplayDone?.(); }, plan.endsAt));
    return () => timers.forEach(clearTimeout);
  }, [props.replayKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  const skipReplay = () => {
    const m = modelRef.current; if (!m) return;
    finishReplay(m); setReplay(null); fitCamera(camRef.current, viewRef.current, m, filters, true); props.onReplayDone?.();
  };

  // Animation loop: simulation → camera → draw, every frame.
  useEffect(() => {
    let raf = 0; const reduce = prefersReducedMotion();
    const frame = (now: number) => {
      const m = modelRef.current, canvas = canvasRef.current, colors = colorsRef.current; const p = live.current;
      if (m && canvas && colors) {
        stepSimulation(m, now, p.filters); stepCamera(camRef.current, reduce);
        const ext = p.externalHoverId ? m.byId.get(p.externalHoverId) ?? null : null;
        const sel = p.selectedPath ? m.byId.get(p.selectedPath) ?? null : null;
        const ctx = canvas.getContext('2d');
        if (ctx) drawGraph(ctx, devicePixelRatio || 1, viewRef.current, camRef.current, m, colors, { focus: hoverRef.current ?? ext ?? sel, selected: sel, filters: p.filters, reduceMotion: reduce }, now);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame); return () => cancelAnimationFrame(raf);
  }, []);

  // Pointer input: hover, click to open, drag a dot, drag the background to pan, wheel to zoom.
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    let drag: { node: GraphNode | null; sx: number; sy: number; cx: number; cy: number; moved: boolean; touch: boolean } | null = null;
    const local = (e: PointerEvent | WheelEvent) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
    const placeCard = (sx: number, sy: number) => {
      const el = cardRef.current; if (!el) return; const v = viewRef.current; const r = el.getBoundingClientRect();
      let x = sx + 16, y = sy + 16;
      if (x + r.width > v.w - 8) x = sx - r.width - 16; if (y + r.height > v.h - 8) y = Math.max(8, v.h - r.height - 8);
      el.style.left = `${Math.max(8, x)}px`; el.style.top = `${y}px`;
    };
    const setHover = (n: GraphNode | null, sx: number, sy: number) => {
      if (n !== hoverRef.current) { hoverRef.current = n; setHoverId(n ? n.id : null); canvas.dataset.cursor = n ? 'pointer' : ''; if (n) setHintVisible(false); }
      requestAnimationFrame(() => placeCard(sx, sy));
    };
    const down = (e: PointerEvent) => {
      const m = modelRef.current; if (!m) return; const [sx, sy] = local(e);
      drag = { node: hitTest(m, camRef.current, viewRef.current, sx, sy), sx, sy, cx: camRef.current.x, cy: camRef.current.y, moved: false, touch: e.pointerType === 'touch' };
      canvas.setPointerCapture(e.pointerId); setSettingsOpen(false);
    };
    const move = (e: PointerEvent) => {
      const m = modelRef.current; if (!m) return; const [sx, sy] = local(e); const cam = camRef.current;
      if (drag) {
        if (Math.hypot(sx - drag.sx, sy - drag.sy) > 4) drag.moved = true;
        if (drag.moved) {
          canvas.dataset.cursor = 'grabbing';
          if (drag.node) { const [wx, wy] = toWorld(cam, viewRef.current, sx, sy); drag.node.fx = wx; drag.node.fy = wy; reheat(m, GRAPH.force.reheatDrag); }
          else { cam.target = null; cam.x = drag.cx - (sx - drag.sx) / cam.k; cam.y = drag.cy - (sy - drag.sy) / cam.k; setHover(null, sx, sy); }
          return;
        }
      }
      if (e.pointerType !== 'touch') setHover(hitTest(m, cam, viewRef.current, sx, sy), sx, sy);
    };
    const up = () => {
      const d = drag; drag = null; canvas.dataset.cursor = hoverRef.current ? 'pointer' : '';
      if (!d) return;
      if (d.node && d.moved) { d.node.fx = d.node.fy = null; return; }
      if (!d.moved && d.node) {
        if ((d.node.kind === 'file' || d.node.kind === 'error') && d.node.path) live.current.onOpen(d.node.path);
        else if (!d.touch) setHover(d.node, d.sx, d.sy);
      }
    };
    const leave = () => { if (!drag) setHover(null, 0, 0); };
    const wheel = (e: WheelEvent) => { e.preventDefault(); const [sx, sy] = local(e); zoomAt(camRef.current, viewRef.current, sx, sy, e.deltaY); };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointerleave', leave); canvas.addEventListener('wheel', wheel, { passive: false });
    return () => {
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointerleave', leave); canvas.removeEventListener('wheel', wheel);
    };
  }, []);

  // Filters reheat the layout.
  useEffect(() => { if (modelRef.current) reheat(modelRef.current, GRAPH.force.reheatFilter); }, [filters.packages, filters.gaps, filters.typeLinks]);

  const m = modelRef.current;
  const hovered = hoverId && m ? m.byId.get(hoverId) ?? null : null;

  return (
    <div className="ws-graph" ref={wrapRef}>
      <canvas ref={canvasRef} role="img" aria-label={C.canvasLabel} />
      <div className="ws-graph-tools">
        <button type="button" className="ws-icon-btn" aria-label={C.settings.title} title={C.settings.title} aria-expanded={settingsOpen} onClick={() => setSettingsOpen((o) => !o)}>{Icon.gear}</button>
        <button type="button" className="ws-icon-btn" aria-label={C.fit} title={C.fit} onClick={() => m && fitCamera(camRef.current, viewRef.current, m, filters, true)}>{Icon.fit}</button>
      </div>
      {settingsOpen && <GraphSettings filters={filters} onChange={props.onFiltersChange} />}
      {replay ? <ReplayOverlay label={props.projectLabel} replay={replay} onSkip={skipReplay} />
        : hintVisible && <div className="ws-graph-hint">{C.hint}</div>}
      {hovered && m && <HoverCard ref={cardRef} node={hovered} model={m} />}
      <GraphLegend />
    </div>
  );
}

/* ───────── Hover card: what the parser found ───────── */
function HoverCard({ node, model, ref }: { node: GraphNode; model: GraphModel; ref: Ref<HTMLDivElement> }) {
  const d = hoverCardData(model, node);
  let body: ReactNode;
  if (d.kind === 'file' || d.kind === 'error') {
    body = <>
      <h4>{d.title}</h4>
      <div className="ws-hc-row"><span className="bz-tag bz-tag--fact">{Icon.fact}{C.card.found}</span>
        <span className="ws-hc-out">{C.card.uses(d.usesFiles, d.usesPackages)}</span><span className="ws-hc-in">{C.card.usedBy(d.usedBy)}</span></div>
      {d.kind === 'error' ? <p className="ws-hc-error">{C.card.parseError}</p>
        : d.importLines.length === 0 ? <p className="ws-sub">{C.card.noImports}</p>
          : <ol>{d.importLines.slice(0, 5).map((l) => <li key={`${l.line}:${l.specifier}`}><span>{l.line}</span><code><em>'{l.specifier}'</em>{l.kind === 'type-import' ? ' · types only' : ''}</code></li>)}</ol>}
      {d.importLines.length > 5 && <div className="ws-hc-more">{C.card.more(d.importLines.length - 5)}</div>}
      {d.importers.length > 0 && <ol className="ws-hc-importers">{d.importers.slice(0, 4).map((i) => <li key={`${i.file}:${i.line}`} className="in"><span>{i.file.split('/').pop()}:{i.line}</span><code><em>{C.card.importsThis}</em></code></li>)}
        {d.importers.length > 4 && <li className="in"><span>{C.card.moreImporters(d.importers.length - 4)}</span><code /></li>}</ol>}
      <div className="ws-hc-foot">{C.card.footFile}</div>
    </>;
  } else if (d.kind === 'pkg') {
    body = <>
      <h4>{d.title}</h4>
      <div className="ws-hc-row"><span className="bz-tag bz-tag--plain">{C.card.package}</span><span className="ws-hc-in">{C.card.usedBy(d.usedBy)}</span></div>
      <ol>{d.importers.slice(0, 4).map((i) => <li key={`${i.file}:${i.line}`} className="in"><span>{i.line}</span><code>{i.file.split('/').pop()}</code></li>)}</ol>
      <div className="ws-hc-foot">{C.card.footPackage}</div>
    </>;
  } else {
    const w = (d.reason && (ISSUE_WORDS[d.reason] ?? SKIP_WORDS[d.reason])) ?? ['Couldn’t follow', ''];
    body = <>
      <h4>{d.title}</h4>
      <div className="ws-hc-row"><span className="bz-tag bz-tag--gap">{Icon.gap}{C.card.gap}</span></div>
      <p><b>{w[0]}.</b> <span className="ws-sub">{w[1]}</span></p>
    </>;
  }
  return <div className="ws-hovercard" ref={ref} role="tooltip">{body}</div>;
}

/* ───────── Replay overlay ───────── */
function ReplayOverlay({ label, replay, onSkip }: { label: string; replay: { steps: ReplayStep[]; shown: number; total: number }; onSkip: () => void }) {
  const shown = replay.steps.slice(0, replay.shown);
  const imports = shown.reduce((n, s) => n + (s.imports ?? 0), 0);
  const last = shown[shown.length - 1];
  const line = !last ? '' : last.kind === 'skip' ? C.replay.skipLine(last.path, (last.reason && SKIP_WORDS[last.reason]?.[0]) ?? 'skipped')
    : last.parseError ? C.replay.parseErrorLine(last.path) : C.replay.fileLine(last.path, last.imports ?? 0);
  return (
    <div className="ws-replay" role="status">
      <div className="bz-row-head"><b>{C.replay.title(label)}</b><span className="bz-meta">{C.replay.progress(shown.length, replay.total, imports)}</span></div>
      <div className="ws-replay-bar"><i style={{ width: `${Math.round((shown.length / Math.max(1, replay.steps.length)) * 100)}%` }} /></div>
      <div className={last?.kind === 'skip' || last?.parseError ? 'ws-replay-log is-gap' : 'ws-replay-log'}>{line}</div>
      <button type="button" className="bz-btn bz-btn--quiet ws-replay-skip" onClick={onSkip}>{C.replay.skip}</button>
    </div>
  );
}

/* ───────── Legend and settings ───────── */
function GraphLegend() {
  return (
    <div className="ws-graph-legend" aria-label="Legend">
      <span><svg viewBox="0 0 26 10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" className="lg-out" /><circle cx="18" cy="5" r="2.2" className="lg-out-dot" /></svg>{C.legend.uses}</span>
      <span><svg viewBox="0 0 26 10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" className="lg-in" /><circle cx="8" cy="5" r="2.2" className="lg-in-dot" /></svg>{C.legend.usedBy}</span>
      <span><svg viewBox="0 0 26 10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" className="lg-type" /></svg>{C.legend.typeOnly}</span>
      <span><svg viewBox="0 0 26 10" aria-hidden="true"><circle cx="13" cy="5" r="4" className="lg-gap" /></svg>{C.legend.gap}</span>
      <span>{C.legend.size}</span>
    </div>
  );
}
function GraphSettings({ filters, onChange }: { filters: GraphFilters; onChange: (f: GraphFilters) => void }) {
  const toggle = (key: 'packages' | 'gaps' | 'typeLinks' | 'arrows' | 'labels', label: string) => (
    <label htmlFor={`gs-${key}`}>{label}<input id={`gs-${key}`} className="ws-toggle" type="checkbox" checked={filters[key]} onChange={(e) => onChange({ ...filters, [key]: e.target.checked })} /></label>
  );
  return (
    <div className="ws-graph-settings" role="dialog" aria-label={C.settings.title}>
      <h3>{C.settings.filters}</h3>
      <input id="gs-search" className="ws-search" placeholder={C.settings.search} value={filters.search} onChange={(e) => onChange({ ...filters, search: e.target.value })} aria-label={C.settings.search} />
      {toggle('packages', C.settings.packages)}{toggle('gaps', C.settings.gaps)}{toggle('typeLinks', C.settings.typeLinks)}
      <h3>{C.settings.display}</h3>
      {toggle('arrows', C.settings.arrows)}{toggle('labels', C.settings.labels)}
      <p className="bz-meta">{C.settings.note}</p>
    </div>
  );
}

/* ───────── Icons used here (full set: assets/icons.tsx) ───────── */
const svg = (d: ReactNode) => <svg viewBox="0 0 16 16" aria-hidden="true">{d}</svg>;
const Icon = {
  gear: svg(<><circle cx="8" cy="8" r="2.1" /><path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6" /></>),
  fit: svg(<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />),
  fact: svg(<path d="M3 8.5 6.5 12 13 4" />),
  gap: svg(<><circle cx="8" cy="8" r="6" strokeDasharray="2 2" /><path d="M8 5v3.5M8 11h.01" /></>),
};
