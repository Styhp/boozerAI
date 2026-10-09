// React wrapper for the graph engine (P-20, SPEC §5), from the design handover's
// reference/GraphView.tsx. Owns the canvas, the animation loop, pointer/wheel input, the parser
// hover card, the hint, the legend and the settings popover. Everything else (tree, pane, routing)
// talks to it through props. The reading replay overlay joins in S4.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import type { DependencyGraph, FilePath } from '../../shared/contracts';
import { Icon } from '../ui/Icon';
import { GRAPH_COPY as C, ISSUE_WORDS, SKIP_WORDS } from './copy';
import {
  GRAPH, buildModel, drawGraph, fitCamera, hitTest, hoverCardData, readColors, reheat, revealNode,
  stepCamera, stepSimulation, toWorld, zoomAt,
  type Camera, type GraphColors, type GraphFilters, type GraphModel, type GraphNode, type Viewport,
} from './engine';

export interface GraphViewProps {
  graph: DependencyGraph;
  selectedPath: FilePath | null;          // file open in the detail pane (ring + lit neighbourhood)
  externalHoverId: string | null;         // node id hovered in the tree or pane (path, pkg:…, gap:…)
  filters: GraphFilters;
  onFiltersChange: (f: GraphFilters) => void;
  layoutKey: string;                      // change when the canvas width changes (pane/sidebar toggles)
  onOpen: (path: FilePath) => void;
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
  const pointerRef = useRef<readonly [number, number]>([0, 0]);
  // A dot clicked in the graph is already under the pointer, so opening it doesn't move the camera.
  const openedHere = useRef<FilePath | null>(null);
  const live = useRef(props); live.current = props;   // latest props for the rAF loop
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);

  // Model: rebuild when the graph changes; existing nodes keep their positions.
  const model = useMemo(() => buildModel(graph, modelRef.current ?? undefined), [graph]);
  modelRef.current = model;

  // Colours from CSS custom properties, re-read when the OS theme changes.
  useEffect(() => {
    const read = () => { if (wrapRef.current) colorsRef.current = readColors(wrapRef.current); };
    read();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', read); return () => mq.removeEventListener('change', read);
  }, []);

  // Size. Until the S4 replay fits the camera after drawing, fit once on the first measurement.
  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current; if (!wrap || !canvas) return;
    let fitted = false;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect(); const dpr = devicePixelRatio || 1;
      viewRef.current = { w: r.width, h: r.height }; canvas.width = Math.max(1, r.width * dpr); canvas.height = Math.max(1, r.height * dpr);
      const m = modelRef.current;
      if (!fitted && m && r.width > 0) { fitted = true; fitCamera(camRef.current, viewRef.current, m, live.current.filters, false); }
    });
    ro.observe(wrap); return () => ro.disconnect();
  }, []);

  // After a pane or sidebar toggles: keep the selection visible, else fit.
  useEffect(() => {
    const id = setTimeout(() => {
      const m = modelRef.current; if (!m) return;
      const sel = live.current.selectedPath ? m.byId.get(live.current.selectedPath) : undefined;
      if (sel) revealNode(camRef.current, viewRef.current, sel); else fitCamera(camRef.current, viewRef.current, m, live.current.filters, true);
    }, GRAPH.motion.afterLayoutMs);
    return () => clearTimeout(id);
  }, [props.layoutKey]);

  // A file opened from the tree or the pane: bring its dot into view if it is near an edge.
  useEffect(() => {
    const path = props.selectedPath;
    if (path === null || path === openedHere.current) { openedHere.current = null; return; }
    const node = modelRef.current?.byId.get(path);
    if (node) revealNode(camRef.current, viewRef.current, node);
  }, [props.selectedPath]);

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

  // Hover card: +16/+16 from the pointer, flipped or clamped 8px from the edges (SPEC §4.1).
  const placeCard = () => {
    const el = cardRef.current; if (!el) return; const v = viewRef.current; const r = el.getBoundingClientRect();
    const [sx, sy] = pointerRef.current; const { cardOffset: o, cardEdge: e } = GRAPH.pointer;
    let x = sx + o, y = sy + o;
    if (x + r.width > v.w - e) x = sx - r.width - o;
    if (y + r.height > v.h - e) y = Math.max(e, v.h - r.height - e);
    el.style.left = `${Math.max(e, x)}px`; el.style.top = `${y}px`;
  };
  // A new card mounts after the hover state renders, so place it once it exists.
  useLayoutEffect(placeCard, [hoverId]);

  // Pointer input: hover, click to open, drag a dot, drag the background to pan, wheel to zoom.
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    let drag: { node: GraphNode | null; sx: number; sy: number; cx: number; cy: number; moved: boolean; touch: boolean } | null = null;
    const local = (e: PointerEvent | WheelEvent) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
    const setHover = (n: GraphNode | null, sx: number, sy: number) => {
      pointerRef.current = [sx, sy];
      if (n !== hoverRef.current) { hoverRef.current = n; setHoverId(n ? n.id : null); canvas.dataset.cursor = n ? 'pointer' : ''; if (n) setHintVisible(false); }
      placeCard();
    };
    const down = (e: PointerEvent) => {
      const m = modelRef.current; if (!m) return; const [sx, sy] = local(e);
      drag = { node: hitTest(m, camRef.current, viewRef.current, sx, sy), sx, sy, cx: camRef.current.x, cy: camRef.current.y, moved: false, touch: e.pointerType === 'touch' };
      canvas.setPointerCapture(e.pointerId); setSettingsOpen(false);
    };
    const move = (e: PointerEvent) => {
      const m = modelRef.current; if (!m) return; const [sx, sy] = local(e); const cam = camRef.current;
      if (drag) {
        if (Math.hypot(sx - drag.sx, sy - drag.sy) > GRAPH.pointer.dragThreshold) drag.moved = true;
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
        if ((d.node.kind === 'file' || d.node.kind === 'error') && d.node.path) { openedHere.current = d.node.path; live.current.onOpen(d.node.path); }
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

  // Escape closes the settings popover (SPEC §10).
  useEffect(() => {
    if (!settingsOpen) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setSettingsOpen(false); };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [settingsOpen]);

  // Filters reheat the layout.
  useEffect(() => { if (modelRef.current) reheat(modelRef.current, GRAPH.force.reheatFilter); }, [filters.packages, filters.gaps, filters.typeLinks]);

  const m = modelRef.current;
  const hovered = hoverId && m ? m.byId.get(hoverId) ?? null : null;

  return (
    <div className="ws-graph" ref={wrapRef}>
      <canvas ref={canvasRef} role="img" aria-label={C.canvasLabel} />
      <div className="ws-graph-tools">
        <button type="button" className="ws-icon-btn" aria-label={C.settings.title} title={C.settings.title} aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((o) => !o)}><Icon name="gear" /></button>
        <button type="button" className="ws-icon-btn" aria-label={C.fit} title={C.fit}
          onClick={() => m && fitCamera(camRef.current, viewRef.current, m, filters, true)}><Icon name="fit" /></button>
      </div>
      {settingsOpen && <GraphSettings filters={filters} onChange={props.onFiltersChange} />}
      {hintVisible && <div className="ws-graph-hint">{C.hint}</div>}
      {hovered && m && <HoverCard ref={cardRef} node={hovered} model={m} />}
      <GraphLegend />
    </div>
  );
}

/* ───────── Hover card: what the parser found ───────── */
export function HoverCard({ node, model, ref }: { node: GraphNode; model: GraphModel; ref?: Ref<HTMLDivElement> }) {
  const d = hoverCardData(model, node);
  let body: ReactNode;
  if (d.kind === 'file' || d.kind === 'error') {
    body = <>
      <h4>{d.title}</h4>
      <div className="ws-hc-row"><span className="bz-tag bz-tag--fact"><Icon name="fact" />{C.card.found}</span>
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
      <div className="ws-hc-row"><span className="bz-tag bz-tag--gap"><Icon name="gap" />{C.card.gap}</span></div>
      <p><b>{w[0]}.</b> <span className="ws-sub">{w[1]}</span></p>
    </>;
  }
  return <div className="ws-hovercard" ref={ref} role="tooltip">{body}</div>;
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
