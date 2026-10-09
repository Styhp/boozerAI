// Boozer graph workspace engine (P-20, SPEC §5–6), from the design handover's
// reference/graph-engine.ts.
//
// Framework-free: model building, force simulation, hit testing, camera and canvas drawing for
// the GraphView. Every number the design depends on lives in GRAPH below; change them there, not
// inline. The reading replay (planReplay) joins in S4.
//
// Truth rules this file enforces:
//  - Every line drawn is a parser edge from DependencyGraph.edges. Nothing else creates a line.
//  - Dot size depends only on how many edges point at the node (importers), never on a guess.
//  - Positions come from a physics layout and carry no meaning.
import type { DependencyEdge, DependencyGraph, FilePath } from '../../shared/contracts';

// A display subset carries original parser entries, never a replacement coverage report.
export type GraphData = Pick<DependencyGraph, 'files' | 'edges'>;

/* ───────────────────────────── Design constants ───────────────────────────── */

export const GRAPH = {
  radius: {
    fileBase: 4.5,            // world px; file dot = fileBase + perSqrtImporter * sqrt(importers)
    perSqrtImporter: 2.4,
    pkg: 3.2,                 // package dot
    gap: 4,                   // dotted ring for unresolved / excluded imports
    minScreen: 2.2,           // never draw a dot smaller than this on screen
    hitPad: 5,                // screen px added to the radius for hit testing
    hitMin: 6,                // minimum hit radius in screen px
    hitMinAlpha: 0.3,         // dots fainter than this can't be hovered or clicked
  },
  force: {
    repulsion: 1700,          // pairwise, divided by distance²
    repulsionPkg: 900,        // when either node is a package
    cutoff: 400,              // ignore pairs farther than this (world px)
    linkLength: 74,           // file → file rest length
    linkLengthLeaf: 46,       // file → package / gap rest length
    spring: 0.035,
    gravity: 0.006,           // pull toward (0,0)
    damping: 0.82,            // velocity multiplier per frame
    alphaDecay: 0.992,        // per frame
    alphaMin: 0.005,          // below this the simulation sleeps
    reheatDrag: 0.3,
    reheatBirth: 0.6,
    reheatFilter: 0.3,
    reheatRefresh: 0.4,       // alpha after a rebuild that kept positions
    spawnSpread: 80,          // new dots start within ±spawnSpread/2 of the origin
    minDistance: 0.01,        // avoids dividing by zero for coincident dots
    seedRadiusX: 140,         // reading replay seeds nodes on an ellipse
    seedRadiusY: 110,
    seedJitter: 30,
  },
  zoom: {
    min: 0.25, max: 3.5, wheel: 0.0015,
    fitMin: 0.35, fitMax: 2, fitPadX: 80, fitPadY: 120, fitMargin: 60, fitOffsetY: 10,
    focusMin: 0.9,            // zoom used when centring a selected node
    edgeMargin: 40,           // re-centre if the selected node is within this of the edge
    edgeMarginBottom: 80,
    settleK: 0.002, settleXY: 0.3,   // camera snaps to its target when this close
  },
  alpha: {
    dimmed: 0.14,             // non-neighbours while something is focused
    searchMiss: 0.18,         // non-matching dots while searching
    tween: 0.16,              // per-frame easing of dot opacity (≈150ms to settle)
    edgeRest: 0.55, edgeDimmed: 0.06, edgeSearch: 0.35, edgeHot: 0.95,
    drawMin: 0.01,            // skip anything fainter
  },
  stroke: {
    rest: 1, hot: 1.8, selRing: 2, selRingGap: 3.5,
    typeDash: [5, 4] as const, gapDash: [2, 3] as const, gapRingDash: [2, 2.5] as const, gapRing: 1.5,
    arrowRest: 5, arrowHot: 7, arrowAngle: 0.45, arrowMinZoom: 0.55, arrowGap: 3,
  },
  label: {
    font: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    size: 12, sizeFocus: 13, weight: 400, weightFocus: 600, offset: 5, halo: 3, haloAlpha: 0.85, minAlpha: 0.02,
    fadeStart: 0.7, fadeSpan: 0.3, leafFadeStart: 1.25, leafFadeSpan: 0.3, restAlpha: 0.85, leafAlpha: 0.6,
  },
  motion: {
    birthPulseMs: 700,        // green ring that expands from a newly read dot
    birthPulseGrow: 14,       // px the ring grows
    birthPulseAlpha: 0.8, birthPulseWidth: 2,
    edgeDelayMs: 180,         // after its file appears, each import line starts growing
    edgeStaggerMs: 60,        // between a file's import lines
    edgeGrowMs: 380,          // line draws from importer to target
    leafDelayMs: 200,         // package / gap dot appears after the line starts
    targetSettleMs: 120,      // a line to a not-yet-read file waits until that file appears
    readLeadMs: 300,          // before the first file
    readStepMs: 150,          // between files (shortened so the whole replay ≤ readMaxMs)
    readMaxMs: 2400,
    readTailMs: 700,          // after the last file, before the pane opens
    flowDots: 3, flowSpeed: 0.7, flowDotRadius: 2.4,   // dots per hot line, lengths per second
    flowPhaseSteps: 7,        // phase offset by import line number modulo this
    haloPad: 7, haloPulse: 1.5, haloSpeed: 4, haloAlpha: 0.18,   // focused dot halo (radians per second)
    cameraEase: 0.14,         // per-frame camera easing
    afterLayoutMs: 320,       // wait for the 280ms pane/sidebar transition before moving the camera
  },
  pointer: {
    dragThreshold: 4,         // screen px before a press becomes a drag
    cardOffset: 16,           // hover card sits this far right of and below the pointer
    cardEdge: 8,              // and flips or clamps this far from the canvas edges
  },
} as const;

/* ───────────────────────────── Model ───────────────────────────── */

export type NodeKind = 'file' | 'error' | 'pkg' | 'gap';

export interface GraphNode {
  readonly id: string;              // file path, `pkg:<name>` or `gap:<edge id>`
  kind: NodeKind;
  label: string;                    // file name, package name or import specifier
  path?: FilePath;                  // files only
  reason?: string;                  // gaps only: UnresolvedReason or FileSkipReason
  x: number; y: number; vx: number; vy: number;
  fx: number | null; fy: number | null;   // pinned while dragged
  a: number;                        // current opacity, eased toward its target
  born: number;                     // performance.now() time it appears; Infinity = not yet
  r: number;                        // world radius
  importers: number;                // edges pointing at it
  imports: number;                  // edges leaving it
}

export interface GraphLink {
  readonly edge: DependencyEdge;
  readonly s: GraphNode;            // importer
  readonly t: GraphNode;            // what it uses
  readonly typeOnly: boolean;
  born: number;                     // 0 = always shown; otherwise the time the line starts growing
}

export interface GraphModel {
  nodes: GraphNode[];
  byId: Map<string, GraphNode>;
  links: GraphLink[];
  alpha: number;                    // simulation heat
}

export interface GraphFilters {
  packages: boolean;    // show package dots
  gaps: boolean;        // show couldn't-follow rings
  typeLinks: boolean;   // show type-only lines
  arrows: boolean;
  labels: boolean;
  search: string;       // fades non-matching dots; never removes them
}

export const DEFAULT_FILTERS: GraphFilters = { packages: true, gaps: true, typeLinks: true, arrows: true, labels: true, search: '' };

export function targetId(edge: DependencyEdge): string {
  const t = edge.target;
  if (t.type === 'file') return t.path;
  if (t.type === 'package') return `pkg:${t.name}`;
  return `gap:${edge.id}`;
}

/** Builds (or rebuilds after Refresh) the drawable model. Existing nodes keep their positions. */
export function buildModel(graph: GraphData, previous?: GraphModel, appearNow = true): GraphModel {
  const old = previous?.byId ?? new Map<string, GraphNode>();
  const nodes: GraphNode[] = [];
  const byId = new Map<string, GraphNode>();
  const make = (id: string, kind: NodeKind, label: string, extra: Partial<GraphNode>) => {
    const prev = old.get(id);
    const node: GraphNode = prev ?? {
      id, kind, label, x: (Math.random() - 0.5) * GRAPH.force.spawnSpread, y: (Math.random() - 0.5) * GRAPH.force.spawnSpread, vx: 0, vy: 0,
      fx: null, fy: null, a: 0, born: appearNow ? 0 : Infinity, r: 0, importers: 0, imports: 0,
    };
    node.kind = kind; node.label = label; Object.assign(node, extra);
    nodes.push(node); byId.set(id, node);
    return node;
  };
  for (const file of graph.files) {
    make(file.path, file.parse.status === 'error' ? 'error' : 'file', file.path.split('/').pop() ?? file.path, { path: file.path });
  }
  for (const edge of graph.edges) {
    const id = targetId(edge);
    if (byId.has(id)) continue;
    const t = edge.target;
    if (t.type === 'package') make(id, 'pkg', t.name, {});
    else if (t.type === 'unresolved' || t.type === 'excluded') make(id, 'gap', edge.specifier, { reason: t.reason });
  }
  const links: GraphLink[] = [];
  for (const edge of graph.edges) {
    const s = byId.get(edge.from); const t = byId.get(targetId(edge));
    if (s && t) links.push({ edge, s, t, typeOnly: edge.kind === 'type-import', born: 0 });
  }
  for (const n of nodes) {
    n.importers = links.filter((l) => l.t === n).length;
    n.imports = links.filter((l) => l.s === n).length;
    n.r = n.kind === 'pkg' ? GRAPH.radius.pkg : n.kind === 'gap' ? GRAPH.radius.gap
      : GRAPH.radius.fileBase + GRAPH.radius.perSqrtImporter * Math.sqrt(n.importers);
  }
  return { nodes, byId, links, alpha: previous ? Math.max(previous.alpha, GRAPH.force.reheatRefresh) : 1 };
}

export const nodeVisible = (n: GraphNode, f: GraphFilters) => (n.kind !== 'pkg' || f.packages) && (n.kind !== 'gap' || f.gaps);
export const linkVisible = (l: GraphLink, f: GraphFilters) => nodeVisible(l.s, f) && nodeVisible(l.t, f) && (!l.typeOnly || f.typeLinks);

/* ───────────────────────────── Simulation ───────────────────────────── */

export function stepSimulation(model: GraphModel, now: number, filters: GraphFilters) {
  if (model.alpha <= GRAPH.force.alphaMin) return;
  const F = GRAPH.force; const alpha = model.alpha;
  const live = model.nodes.filter((n) => n.born <= now && nodeVisible(n, filters));
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!, b = live[j]!;
      let dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy || F.minDistance; const d = Math.sqrt(d2);
      if (d > F.cutoff) continue;
      const f = ((a.kind === 'pkg' || b.kind === 'pkg') ? F.repulsionPkg : F.repulsion) / d2 * alpha;
      dx /= d; dy /= d;
      a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
    }
  }
  for (const l of model.links) {
    if (l.s.born > now || l.t.born > now || !linkVisible(l, filters)) continue;
    const rest = l.t.kind === 'pkg' || l.t.kind === 'gap' ? F.linkLengthLeaf : F.linkLength;
    let dx = l.t.x - l.s.x, dy = l.t.y - l.s.y; const d = Math.sqrt(dx * dx + dy * dy) || F.minDistance;
    const f = (d - rest) * F.spring * alpha; dx /= d; dy /= d;
    l.s.vx += dx * f; l.s.vy += dy * f; l.t.vx -= dx * f; l.t.vy -= dy * f;
  }
  for (const n of live) {
    n.vx -= n.x * F.gravity * alpha; n.vy -= n.y * F.gravity * alpha;
    if (n.fx !== null && n.fy !== null) { n.x = n.fx; n.y = n.fy; n.vx = n.vy = 0; continue; }
    n.vx *= F.damping; n.vy *= F.damping; n.x += n.vx; n.y += n.vy;
  }
  model.alpha *= F.alphaDecay;
}
export const reheat = (model: GraphModel, to: number) => { model.alpha = Math.max(model.alpha, to); };

/* ───────────────────────────── Camera ───────────────────────────── */

export interface Camera { x: number; y: number; k: number; target: { x: number; y: number; k: number } | null }
export interface Viewport { w: number; h: number }
export const toScreen = (c: Camera, v: Viewport, x: number, y: number): [number, number] => [(x - c.x) * c.k + v.w / 2, (y - c.y) * c.k + v.h / 2];
export const toWorld = (c: Camera, v: Viewport, sx: number, sy: number): [number, number] => [(sx - v.w / 2) / c.k + c.x, (sy - v.h / 2) / c.k + c.y];

export function stepCamera(c: Camera, reduceMotion: boolean) {
  const t = c.target; if (!t) return;
  const e = reduceMotion ? 1 : GRAPH.motion.cameraEase;
  c.x += (t.x - c.x) * e; c.y += (t.y - c.y) * e; c.k += (t.k - c.k) * e;
  const Z = GRAPH.zoom;
  if (Math.abs(t.k - c.k) < Z.settleK && Math.abs(t.x - c.x) < Z.settleXY && Math.abs(t.y - c.y) < Z.settleXY) { c.x = t.x; c.y = t.y; c.k = t.k; c.target = null; }
}
export function fitCamera(c: Camera, v: Viewport, model: GraphModel, filters: GraphFilters, animate: boolean) {
  const Z = GRAPH.zoom;
  const ns = model.nodes.filter((n) => nodeVisible(n, filters) && n.born !== Infinity);
  if (!ns.length) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of ns) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
  const k = Math.min(Z.fitMax, Math.max(Z.fitMin, Math.min((v.w - Z.fitPadX) / (x1 - x0 + Z.fitMargin), (v.h - Z.fitPadY) / (y1 - y0 + Z.fitMargin))));
  const target = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 + Z.fitOffsetY / k, k };
  if (animate) c.target = target; else { c.x = target.x; c.y = target.y; c.k = target.k; c.target = null; }
}
/** After a pane opens or a link is followed: bring the node into view only if it is near an edge. */
export function revealNode(c: Camera, v: Viewport, n: GraphNode) {
  const Z = GRAPH.zoom; const [x, y] = toScreen(c, v, n.x, n.y);
  if (x < Z.edgeMargin || x > v.w - Z.edgeMargin || y < Z.edgeMargin || y > v.h - Z.edgeMarginBottom) c.target = { x: n.x, y: n.y, k: Math.max(c.k, Z.focusMin) };
}
export function zoomAt(c: Camera, v: Viewport, sx: number, sy: number, deltaY: number) {
  const Z = GRAPH.zoom; const [wx, wy] = toWorld(c, v, sx, sy);
  const k = Math.min(Z.max, Math.max(Z.min, c.k * Math.exp(-deltaY * Z.wheel)));
  c.target = null; c.k = k; c.x = wx - (sx - v.w / 2) / k; c.y = wy - (sy - v.h / 2) / k;
}

/* ───────────────────────────── Hit testing ───────────────────────────── */

export function hitTest(model: GraphModel, c: Camera, v: Viewport, sx: number, sy: number): GraphNode | null {
  let best: GraphNode | null = null, bestD = Infinity;
  for (const n of model.nodes) {
    if (n.a < GRAPH.radius.hitMinAlpha) continue;
    const [x, y] = toScreen(c, v, n.x, n.y);
    const d = Math.hypot(x - sx, y - sy); const r = Math.max(GRAPH.radius.hitMin, n.r * c.k + GRAPH.radius.hitPad);
    if (d < r && d < bestD) { bestD = d; best = n; }
  }
  return best;
}

/* ───────────────────────────── Drawing ───────────────────────────── */

/** Read from CSS custom properties on the graph element; re-read on theme change. */
export interface GraphColors { node: string; nodeStrong: string; edge: string; out: string; in: string; sel: string; gap: string; err: string; pkg: string; bg: string; label: string }
export function readColors(el: Element): GraphColors {
  const cs = getComputedStyle(el); const v = (name: string) => cs.getPropertyValue(name).trim();
  return { node: v('--text-muted'), nodeStrong: v('--text'), edge: v('--border-strong'), out: v('--fact-ink'), in: v('--brand'), sel: v('--brand'), gap: v('--gap-ink'), err: v('--danger-ink'), pkg: v('--text-subtle'), bg: v('--canvas'), label: v('--text-secondary') };
}
export function rgba(hex: string, a: number): string {
  if (!hex.startsWith('#')) return hex;
  const h = hex.length === 4 ? hex.slice(1).split('').map((ch) => ch + ch).join('') : hex.slice(1, 7);
  const n = parseInt(h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export interface DrawState {
  focus: GraphNode | null;          // hovered dot, else externally hovered (tree / pane), else selected
  selected: GraphNode | null;       // file open in the pane: keeps a ring
  filters: GraphFilters;
  reduceMotion: boolean;
}

/** One frame. Call after stepSimulation and stepCamera. `now` in ms (performance.now()). */
export function drawGraph(ctx: CanvasRenderingContext2D, dpr: number, v: Viewport, c: Camera, model: GraphModel, colors: GraphColors, st: DrawState, now: number) {
  const A = GRAPH.alpha, S = GRAPH.stroke, L = GRAPH.label, M = GRAPH.motion;
  const t = now / 1000; const F = st.focus; const q = st.filters.search.trim().toLowerCase(); const k = c.k;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, v.w, v.h);

  // Neighbourhood of the focused dot, split by direction.
  const near = new Set<GraphNode>(); const outL = new Set<GraphLink>(); const inL = new Set<GraphLink>();
  if (F) {
    near.add(F);
    for (const l of model.links) {
      if (!linkVisible(l, st.filters)) continue;
      if (l.s === F) { near.add(l.t); outL.add(l); }
      if (l.t === F) { near.add(l.s); inL.add(l); }
    }
  }
  // Ease every dot's opacity toward its target.
  for (const n of model.nodes) {
    const born = n.born <= now; const match = !q || (n.path ?? n.label).toLowerCase().includes(q);
    const target = !born || !nodeVisible(n, st.filters) ? 0 : F ? (near.has(n) ? 1 : A.dimmed) : match ? 1 : A.searchMiss;
    n.a += (target - n.a) * (st.reduceMotion ? 1 : A.tween);
  }

  // Lines.
  for (const l of model.links) {
    if (!linkVisible(l, st.filters)) continue;
    const grow = l.born ? Math.min(1, Math.max(0, (now - l.born) / M.edgeGrowMs)) : 1;
    if (grow <= 0 || l.s.a < A.drawMin || l.t.a < A.drawMin) continue;
    const [x1, y1] = toScreen(c, v, l.s.x, l.s.y); const [tx, ty] = toScreen(c, v, l.t.x, l.t.y);
    const x2 = x1 + (tx - x1) * grow, y2 = y1 + (ty - y1) * grow;
    const hot = outL.has(l) || inL.has(l);
    const col = outL.has(l) ? colors.out : inL.has(l) ? colors.in : l.t.kind === 'gap' ? colors.gap : colors.edge;
    const a = hot ? A.edgeHot : F ? A.edgeDimmed : Math.min(l.s.a, l.t.a) * (q ? A.edgeSearch : A.edgeRest);
    ctx.strokeStyle = rgba(col, a); ctx.lineWidth = hot ? S.hot : S.rest;
    ctx.setLineDash(l.typeOnly ? [...S.typeDash] : l.t.kind === 'gap' ? [...S.gapDash] : []);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
    if ((st.filters.arrows || hot) && grow === 1 && k > S.arrowMinZoom) {
      const ang = Math.atan2(y2 - y1, x2 - x1); const rr = l.t.r * k + S.arrowGap;
      const ax = x2 - Math.cos(ang) * rr, ay = y2 - Math.sin(ang) * rr; const size = hot ? S.arrowHot : S.arrowRest;
      ctx.fillStyle = rgba(col, a); ctx.beginPath(); ctx.moveTo(ax, ay);
      ctx.lineTo(ax - Math.cos(ang - S.arrowAngle) * size, ay - Math.sin(ang - S.arrowAngle) * size);
      ctx.lineTo(ax - Math.cos(ang + S.arrowAngle) * size, ay - Math.sin(ang + S.arrowAngle) * size); ctx.closePath(); ctx.fill();
    }
    if (hot && !st.reduceMotion) {
      // Flow dots travel importer → used file: the direction of "uses", for both colours.
      for (let i = 0; i < M.flowDots; i++) {
        const p = (t * M.flowSpeed + i / M.flowDots + (l.edge.evidence.startLine % M.flowPhaseSteps) / M.flowPhaseSteps) % 1;
        ctx.fillStyle = rgba(col, A.edgeHot); ctx.beginPath(); ctx.arc(x1 + (x2 - x1) * p, y1 + (y2 - y1) * p, M.flowDotRadius, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // Dots and labels.
  for (const n of model.nodes) {
    if (n.a < A.drawMin) continue;
    const [x, y] = toScreen(c, v, n.x, n.y); const r = Math.max(GRAPH.radius.minScreen, n.r * k);
    const isF = n === F; const sel = n === st.selected;
    const col = n.kind === 'gap' ? colors.gap : n.kind === 'error' ? colors.err : n.kind === 'pkg' ? colors.pkg
      : isF || sel ? colors.sel : F && near.has(n) ? colors.nodeStrong : colors.node;
    const pulse = n.born > 0 && n.born <= now ? Math.max(0, 1 - (now - n.born) / M.birthPulseMs) : 0;
    if (pulse > 0 && !st.reduceMotion) { ctx.strokeStyle = rgba(colors.sel, pulse * M.birthPulseAlpha); ctx.lineWidth = M.birthPulseWidth; ctx.beginPath(); ctx.arc(x, y, r + M.birthPulseGrow * (1 - pulse), 0, Math.PI * 2); ctx.stroke(); }
    if (isF) { ctx.fillStyle = rgba(colors.sel, M.haloAlpha); ctx.beginPath(); ctx.arc(x, y, r + M.haloPad + (st.reduceMotion ? 0 : Math.sin(t * M.haloSpeed) * M.haloPulse), 0, Math.PI * 2); ctx.fill(); }
    if (n.kind === 'gap') { ctx.strokeStyle = rgba(col, n.a); ctx.lineWidth = S.gapRing; ctx.setLineDash([...S.gapRingDash]); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    else { ctx.fillStyle = rgba(col, n.a); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    if (sel && !isF) { ctx.strokeStyle = rgba(colors.sel, n.a); ctx.lineWidth = S.selRing; ctx.beginPath(); ctx.arc(x, y, r + S.selRingGap, 0, Math.PI * 2); ctx.stroke(); }
    const leaf = n.kind === 'pkg' || n.kind === 'gap';
    const labelA = isF || (F && near.has(n)) ? 1 : F ? 0 : !st.filters.labels ? 0
      : leaf ? clamp01((k - L.leafFadeStart) / L.leafFadeSpan) * L.leafAlpha : clamp01((k - L.fadeStart) / L.fadeSpan) * L.restAlpha;
    if (labelA * n.a > L.minAlpha) {
      const text = n.kind === 'pkg' ? `${n.label} (package)` : n.label;
      ctx.font = `${isF ? L.weightFocus : L.weight} ${isF ? L.sizeFocus : L.size}px ${L.font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.lineWidth = L.halo; ctx.strokeStyle = rgba(colors.bg, L.haloAlpha * labelA * n.a); ctx.strokeText(text, x, y + r + L.offset);
      ctx.fillStyle = rgba(isF ? colors.nodeStrong : colors.label, labelA * n.a); ctx.fillText(text, x, y + r + L.offset);
    }
  }
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/* ───────────────────────────── Hover card data ───────────────────────────── */

export interface HoverCardData {
  title: string;
  kind: NodeKind;
  usesFiles: number; usesPackages: number; usedBy: number;
  importLines: { line: number; specifier: string; kind: DependencyEdge['kind'] }[];  // this file's imports
  importers: { file: FilePath; line: number }[];                                     // who imports it
  reason?: string;
}
/** Uses edge evidence only (line + specifier), so no source fetch is needed on hover. */
export function hoverCardData(model: GraphModel, n: GraphNode): HoverCardData {
  const out = model.links.filter((l) => l.s === n); const inn = model.links.filter((l) => l.t === n);
  return {
    title: n.path ?? n.label, kind: n.kind,
    // Counted in distinct files and packages, like the pane: a value and a type import of the
    // same file are one file used, not two. The line lists below keep every import statement.
    usesFiles: new Set(out.filter((l) => l.t.kind === 'file' || l.t.kind === 'error').map((l) => l.t)).size,
    usesPackages: new Set(out.filter((l) => l.t.kind === 'pkg').map((l) => l.t)).size,
    usedBy: new Set(inn.map((l) => l.s)).size,
    importLines: out.map((l) => ({ line: l.edge.evidence.startLine, specifier: l.edge.specifier, kind: l.edge.kind })),
    importers: inn.map((l) => ({ file: l.edge.from, line: l.edge.evidence.startLine })),
    ...(n.reason ? { reason: n.reason } : {}),
  };
}
