# Graph workspace: implementation spec

Status: **approved design, not implemented**. Written 2026-10-10 for the agent that builds it in `src/client/`. Read [README.md](README.md) first for the approvals and order of work.

When two sources disagree, use this order: **this SPEC → `assets/tokens.css` + `assets/components.css` → `reference/graph-engine.ts` + `reference/GraphView.tsx` → `COPY.md` + `reference/copy.ts` → `screenshots/` → `reference/prototype.html`.** The prototype runs on invented data and uses its own class names (`ob-*`); it shows behaviour, not code to copy. Any number not written here or in the engine's `GRAPH` constants comes from the prototype.

---

## 1. What you are building

One screen, the **graph workspace**, replacing today's toolbar, summary strip and three fixed columns (`SummaryPanel`, `GraphList`, `MapCanvas`, `DetailPane` stacking).

```
┌ ribbon 44 ┬ sidebar 260 ───────┬ graph view (flex) ───────────────────┬ detail pane min(600px,46%) ┐
│ B         │ plant-journal  ≡ × │ [Graph view]                          │ [usePlants.ts ×]            │
│ files     │ ▾ src              │ ▢  plant-journal · read 15:20  ILLUS. │ ‹ ›  src / hooks / usePl… ⟨⟩│
│ search    │   ▾ hooks          │ (hint pill)                     ⚙ ⤢   │                              │
│ overview  │     usePlants.ts   │        • ─── •                         │ note (scrolls)               │
│ notes •   │   ▸ lib            │     •──●──•    (canvas)                │                              │
│           │ vite.config.ts     │        •                               │                              │
│ refresh   │ ● On this computer │ (legend)                               │ status bar                   │
└───────────┴────────────────────┴────────────────────────────────────────┴──────────────────────────────┘
```

- **Hover** a dot: its neighbourhood lights up (blue = files it uses, green = files that use it, dots flowing in the "uses" direction) and a card lists the import lines the parser found.
- **Click** a dot: the pane slides in with the file note. The dot keeps a ring and its neighbourhood stays lit.
- **After indexing** the graph draws itself in read order (a replay of real results, see §6.1), then the Overview note slides in.

Out of scope: chat input, health or risk scores, guessed roles/features, GitHub import, the whole-project React Flow canvas beyond the >300-node fallback (§5.9), and any new server route except the optional runtime status route (§12).

---

## 2. Files to create and what they replace

Move the reference files into `src/client/` and fix import paths. Suggested layout:

| New file | From | Replaces / uses |
|---|---|---|
| `src/client/styles/tokens.css` | `assets/tokens.css` (verbatim) | the `:root` vars in `style.css` |
| `src/client/styles/components.css` | `assets/components.css` (verbatim) | `style.css`, `NotesPanel.css`, `InsightsPanel.css`, `project-gate.css` (delete their rules as views move) |
| `src/client/graph/engine.ts` | `reference/graph-engine.ts` | `map/layout.ts` for the default view |
| `src/client/graph/GraphView.tsx` | `reference/GraphView.tsx` | `MapCanvas.tsx` (keep MapCanvas only for §5.9) |
| `src/client/graph/copy.ts` | `reference/copy.ts` | — |
| `src/client/ui/Icon.tsx` | `assets/icons.tsx` | inline SVGs |
| `src/client/workspace/Workspace.tsx` | new | `App.tsx` layout (keep App's data loading and `explain()`) |
| `src/client/workspace/Ribbon.tsx`, `Sidebar.tsx`, `FileTree.tsx` | new | `GraphList.tsx` |
| `src/client/workspace/Pane.tsx` | new | `DetailPane.tsx` |
| `src/client/workspace/OverviewNote.tsx` | new | `SummaryPanel.tsx` + `InsightsPanel.tsx` (reuse `coverageSummary`, `analyzeInsights`) |
| `src/client/workspace/FileNote.tsx` | new | the per-file stack in `DetailPane.tsx` |
| `src/client/workspace/LinksSection.tsx` | new | `GraphList` relationships + impact "Dependencies" toggle |
| `src/client/workspace/SourceMode.tsx` | `SourceView` in `DetailPane.tsx` | — |
| `src/client/workspace/NotesNote.tsx` | new | — (uses `NotesSource.list`) |
| restyle in place | `ExplanationPanel.tsx`, `CloudComparePanel.tsx`, `ImpactPanel.tsx`, `NotesPanel.tsx` | markup classes → `bz-*`, copy → COPY.md |
| `src/shared/reading-starts.ts` | new pure helper `rankStarts(graph)` | sorts `analyzeInsights().readingStarts` by `walkGraph(graph,{selected,direction:'dependencies',maxDepth:null}).reachable.length`, ties by path. (Don't edit Codex's `insights.ts`.) |

Load order in `main.tsx`: `tokens.css` → `components.css` → nothing else. The root element gets `class="ws-shell bz"`.

---

## 3. State model

Keep the existing data flow (`ProjectSource`, `App.explain`, per-file `explanations` map). Replace the single `Selection` union with this:

```ts
type PaneView = { kind: 'overview' } | { kind: 'file'; path: FilePath } | { kind: 'notes' };
type Evidence = { file: FilePath; from: number; to: number; origin: 'cite' | 'import' | 'note'; snippetId?: string; stale: boolean };

interface WorkspaceState {
  view: PaneView;                 // what the pane shows
  paneOpen: boolean;              // width 0 when false; graph takes the space
  mode: 'note' | 'source';        // file view only
  evidence: Evidence | null;      // lines to highlight in source mode
  back: { view: PaneView; mode: 'note' | 'source' }[];   // pane history
  fwd:  { view: PaneView; mode: 'note' | 'source' }[];
  sideOpen: boolean;              // sidebar (tree) visible
  side: 'files' | 'search';
  collapsed: Record<string, boolean>;   // folder path → collapsed
  filters: GraphFilters;          // engine type; search lives here too
  hoverId: string | null;         // node id hovered in tree or pane (external hover)
  replayKey: number | null;       // bump to replay the drawing animation
}
```

Rules:
- `go(view)`: push `{view, mode}` onto `back`, clear `fwd`, set `view`, `mode='note'`, `evidence=null`, `paneOpen=true`, scroll the pane to top. On narrow, also `sideOpen=false`.
- Opening the file that is already open only resets `mode='note'` (no history entry).
- `‹` pops `back` into `view`/`mode` and pushes the current one onto `fwd`; `›` is the reverse. Disabled at 35% opacity when empty.
- Citation, import line, chain step or note link: if the file isn't open, `go(file)` first; then `evidence = {…}`, `mode='source'`, scroll to the first highlighted line minus 160px, focus "Back to the explanation".
- Closing the pane (×) sets `paneOpen=false` and `evidence=null`; it keeps `view`, so reopening shows the same note.
- Selection shown in the graph = `view.kind==='file' && paneOpen ? view.path : null`.
- `layoutKey` passed to GraphView = `${paneOpen}:${sideOpen}:${containerWidthBucket}`. GraphView waits 320ms, then calls `revealNode` (selection) or `fitCamera`.

---

## 4. Layout and spacing

All sizes in CSS px. The classes listed are already written in `components.css`.

### 4.1 Regions (desktop, container > 760px)

| Region | Class | Size | Background | Border |
|---|---|---|---|---|
| Ribbon | `.ws-ribbon` | 44px wide, padding 10px 0, gap 4px | `surface-navigation` | right 1px `border` |
| Ribbon mark | `.ws-ribbon-mark` | 26×26, radius 8, 8px below | `brand`, text `on-brand` 700 13px "B" | — |
| Ribbon button | `.ws-ribbon-btn` | 32×32, radius 8, glyph 18px | hover `glass-hover`; pressed `brand-subtle` + `brand-ink` | — |
| Sidebar | `.ws-side` | 260px; collapsed = `margin-left:-260px; opacity:0` | `surface-navigation` | right 1px `border` |
| Sidebar head | `.ws-side-head` | 44px, padding 0 8 0 14 | — | bottom 1px `border-inner` |
| Sidebar body | `.ws-side-body` | padding 8 6 16, scrolls | — | — |
| Sidebar foot | `.ws-side-foot` | 40px, padding 0 14, 12.5px | — | top 1px `border-inner` |
| Tree row | `.ws-tree-row` | min-height 28, padding 3 8 (files 3 8 3 26), radius 6, 13.5px | hover `glass-hover`; current `glass-tint` + `brand-ink` 600 | — |
| Tree indent | `.ws-tree .ws-tree` | padding-left 14, margin-left 9 | — | left 1px `border-inner` guide |
| Tab strip | `.ws-tabs` | 40px, padding 0 8 | `surface-navigation` | bottom 1px `border` |
| Tab | `.ws-tab` | 32px tall, padding 0 10 0 12, radius 8 8 0 0, max 260px, 13px | `canvas` (graph) / `surface` (pane) | 1px `border`, no bottom |
| View header | `.ws-viewhead` | 38px, padding 0 10, 13px, title centred | — | — |
| Graph | `.ws-graph` | flex 1 | `canvas` | — |
| Graph tools | `.ws-graph-tools` | top 10, right 12, 28×28 buttons, gap 4 | — | — |
| Hint pill | `.ws-graph-hint` | top 12, left 12, padding 6 12, 12.5px | `glass-elevated` | 1px `glass-rim` |
| Legend | `.ws-graph-legend` | left 12, bottom 12, padding 8 12, radius 12, gap 6 14, 12.5px | `glass-elevated` + 12px blur | 1px `glass-rim` |
| Settings | `.ws-graph-settings` | top 10, right 52, 268px, padding 12 14, radius 14, gap 10 | `surface-elevated` + `shadow-elevated` | 1px `border` |
| Hover card | `.ws-hovercard` | 320px, padding 12 14, radius 14, 13px; pointer +16/+16, flips at 8px from edges | `surface-elevated` + `shadow-elevated` | 1px `border` |
| Replay overlay | `.ws-replay` | centred, bottom 22, min 320, padding 12 16, radius 14 | `surface-elevated` | 1px `border` |
| Pane | `.ws-pane` | 0 → `min(600px, 46%)`; inner fixed `min(600px,46vw)`, min 360 | `surface` | left 1px `border` when open |
| Pane status | `.ws-status` | 30px, padding 0 14, gap 14, 12px, right-aligned | — | top 1px `border-inner` |
| Note | `.ws-note` | max 680, padding 22 32 64, section gap 22 | — | — |

Below 1360px container width, collapse the sidebar automatically the first time the pane opens after indexing (the user can reopen it). The ribbon never collapses on desktop.

### 4.2 Note internals

| Element | Spec |
|---|---|
| Title | `h1` 28px/1.15, −0.02em. File notes: `h1.is-file` mono 24px, folders in `.ws-dir` (`text-muted`, 400) |
| Properties | `.ws-props`: radius 10, 1px `border`; head 7px 12px on `fact-subtle` with uppercase 11px label + **Found in code** tag; `dl` columns 9.5em / 1fr, rows padding 6 12, top border `border-inner`, tabular numbers |
| Section heading | `h2` 18px/1.35 600, tag pushed right (`margin-left:auto`) |
| Section body | grid gap 10 |
| Link card | `.ws-link-card`: padding 8 12, radius 10, 1px `border`, `surface-subtle`; hover `border-strong` + `surface-selected` (140ms) |
| Context line | `.ws-ctx`: mono 12.5/1.5, columns 2.6em (line no., right-aligned) / 1fr; specifier in `<mark>` washed 22% `fact-ink` (uses) or 24% `brand` (used by) |
| Group heading | `.ws-group h3` 14px with 16px glyph: `uses` glyph in `fact-ink`, `usedBy` glyph in `brand-ink`; count in `.ws-n` |
| Explanation, notes, gaps, impact | existing `bz-*` blocks from `components.css` (`bz-ai`, `bz-checks`, `bz-snip`, `bz-note`, `bz-gaps`, `bz-impact-list`, `bz-notice--*`) |
| Source mode header | `.ws-source-head` sticky, padding 14 20 12, bottom 1px `border` |
| Source lines | `.bz-source` on `surface-code`; 13.5/1.6 mono; numbers 3.4em column; cited lines `data-cited` (AI wash + 3px inset rule), import line `data-import` (fact), note range `data-note` (note) |

### 4.3 Z-order inside `.ws-shell`
graph canvas 0 · hint 4 · tools/legend 5 · settings/replay 6 · hover card 20 · narrow sidebar 30 · narrow pane 40 · narrow tab bar 50 · gate 70 · glossary popover 90.

### 4.4 Narrow (container ≤ 760px)
Container query on `.ws-shell` (`container: ws`), so it also applies when Boozer sits in a half-width window. Ribbon and graph tab strip hidden. Graph fills the screen. Tab bar `.ws-tabbar`: left/right/bottom 12, height 62, radius 20, four items (Graph · Files · Overview · My notes), 20px glyphs, 11.5px labels, active `brand-ink` 600. Sidebar slides over from the left (`translateX(-100%)` → 0, 240ms), stopping 74px above the bottom. Pane is a bottom sheet: top 56, radius 20 20 0 0, `translateY(105%)` → 0 over 300ms, with a 40×4 grab handle 8px from the top and 80px bottom padding so content clears the tab bar. Touch: no hover card; a tap on a dot opens the file. The legend moves up to bottom 86; the replay overlay to bottom 92 at full width minus 32.

---

## 5. Graph view

The engine (`reference/graph-engine.ts`) holds every number in `GRAPH`. Don't inline numbers; change them there.

### 5.1 Model
- One node per `graph.files` entry (`file`, or `error` if `parse.status==='error'`), per distinct package (`pkg:<name>`), and per unresolved/excluded edge (`gap:<edge.id>`). One link per `graph.edges` entry. Nothing else creates a link.
- File radius = 4.5 + 2.4·√(importers) world px. Package 3.2. Gap ring 4.
- After Refresh, `buildModel(newGraph, oldModel)` keeps existing positions; new nodes appear in place; alpha re-heats to ≥0.4.

### 5.2 Encoding (colours read from CSS variables on `.ws-graph`, re-read on theme change)
| Thing | Colour token | Style |
|---|---|---|
| File dot at rest | `text-muted` | filled |
| Neighbour of focus | `text` | filled |
| Focused / selected | `brand` | filled; focus gets an 18% `brand` halo (r+7, ±1.5 at 4 rad/s); selected gets a 2px ring at r+3.5 |
| Parse-error file | `danger-ink` | filled |
| Package | `text-subtle` | filled, smaller |
| Couldn't follow | `gap-ink` | 1.5px dashed ring (2/2.5) |
| Line at rest | `border-strong` at 55% of dot opacity | 1px; type-only dashed 5/4; to a gap dotted 2/3 |
| Line, focused file uses → target | `fact-ink` 95% | 1.8px + arrowhead 7px |
| Line, importer → focused file | `brand` 95% | 1.8px + arrowhead 7px |
| Arrowheads | same as line | 5px at rest; only when zoom > 0.55 and Arrows is on |
| Labels | `text-secondary`, halo `canvas` 85% 3px | 12px (focus 13px 600), 5px below the dot. Files fade in from zoom 0.7 to 1.0; packages and gaps from 1.25 to 1.55. While something is focused, only the neighbourhood is labelled |

### 5.3 Focus rule
`focus = hovered dot ?? externally hovered id (tree/pane) ?? selected file`. While a focus exists, non-neighbours ease to 14% opacity and their lines to 6%. Search (settings) eases non-matching dots to 18% and never removes them.

### 5.4 Pointer
| Input | Result |
|---|---|
| Move over a dot (mouse/pen) | hover focus + hover card; cursor `pointer`; hint pill disappears for good |
| Move off | card closes, focus returns to the selection |
| Click a file or error dot (no drag) | `onOpen(path)` → `go({kind:'file',path})` |
| Click a package or gap | shows its card (no navigation) |
| Drag a dot (>4px) | pins it under the pointer (`fx/fy`), re-heats to 0.3; released on pointer-up |
| Drag background | pans (cancels camera tween) |
| Wheel | zooms around the pointer, k ∈ [0.25, 3.5], factor e^(−Δy·0.0015) |
| ⤢ Fit | animated fit of visible nodes, k ∈ [0.35, 2] |
| Touch tap on a dot | opens the file (no card) |

Hit radius = max(6, r·k + 5) screen px; ignore dots under 30% opacity.

### 5.5 Hover card (`HoverCard` in GraphView.tsx)
- **File:** mono path (h4) · **Found in code** tag · `→ uses N files + N packages` (`fact-ink`) · `← used by N` (`brand-ink`) · up to 5 import lines as `line  'specifier'` (+ " · types only") · "+ N more import lines" · up to 4 importers as `file.ts:line imports this` · "+ N more" · foot "Click to open · lines found by reading the code".
- **Parse error:** the same header, then "Couldn't be parsed. No connections found in it." in `danger-ink`.
- **Package:** name · *Package* tag · used by N · up to 4 importers · foot "Code installed from outside your project. Boozer doesn't read inside it."
- **Gap:** specifier · *Not analysed* tag · **reason label.** consequence (from `ISSUE_WORDS`/`SKIP_WORDS`).
- Uses edge evidence only (`specifier`, `evidence.startLine`): **never fetch source on hover.** (The prototype shows whole lines because its data is in memory.)

### 5.6 Settings popover
Search field, toggles: Packages · Imports Boozer couldn't follow · Type-only links · Arrows · File names, and the note "Hidden items are still counted on Overview." Toggling re-heats the layout to 0.3. Closes on Escape, on canvas pointer-down or on the gear.

### 5.7 Legend (always visible)
`uses` (blue line + dot) · `used by` (green line + dot) · `types only` (dashed) · `couldn't follow` (dotted ring) · "Bigger dot = more files use it (not more important)".

### 5.8 Camera after layout changes
When the pane or sidebar opens or closes, wait 320ms (after the 280ms transition), then: if a file is selected and within 40px of an edge (80 at the bottom), ease to it at zoom ≥ 0.9; otherwise fit. Following a link in the pane to another file does the same reveal.

### 5.9 Size limits
The simulation is O(n²) per frame while warm and sleeps below alpha 0.005. Up to today's `NODE_CAP` (300 rendered nodes, `map/layout.ts`) draw the graph. Above it, keep C4's list-first behaviour: the graph area shows "This project has N files and packages, over the 300 the graph draws. Use the file tree, or search to narrow it." and the tree stays complete. Search results under 300 draw as a graph.

---

## 6. Animation spec

Easing everywhere: `cubic-bezier(0.2, 0, 0, 1)` (`--ws-ease`, Athelstan's standard). Under `prefers-reduced-motion: reduce`: no replay (everything appears at once and fits), no flow dots, pulses, halo wobble or eased camera, and CSS transitions/animations off (the rule is at the end of `components.css`).

| # | Moment | What moves | Timing | Source |
|---|---|---|---|---|
| 6.1 | **Drawing what Boozer found** (after indexing, and on Replay) | Nodes seeded on an ellipse (rx 140, ry 110, ±15 jitter). In path order (files + skipped files): each file's dot appears with a green ring expanding 14px and fading over 700ms; each of its import lines grows importer→target over 380ms, starting 180ms after the dot and 60ms apart; package/gap dots appear 200ms after their first line starts; a line to a not-yet-shown file waits until 120ms after that file appears. The overlay counts "N of M files · K imports" and logs the current file, or the skip and its reason in `gap-ink`. | Lead 300ms, step = min(150ms, 2400ms ÷ items), tail 700ms. Then the overlay closes, the camera fits, and 450ms later the Overview pane slides in; a second fit runs 320ms after that | `planReplay`, `ReplayOverlay` |
| 6.2 | Skip | Everything appears; fit; Overview opens | immediate | `finishReplay` |
| 6.3 | Simulation | Forces: repulsion 1700/d² (900 with a package), cutoff 400; springs rest 74 (46 to leaves) × 0.035; gravity 0.006; damping 0.82; alpha ×0.992 per frame, sleeps < 0.005 | continuous while warm | `stepSimulation` |
| 6.4 | Hover focus | Dot and line opacity ease toward their targets at 16% per frame (≈150ms); hot lines thicken to 1.8px and recolour | per frame | `drawGraph` |
| 6.5 | Flow dots | 3 dots per hot line, radius 2.4, moving importer→target (the "uses" direction for both colours) at 0.7 line-lengths per second, phase offset by import line | per frame | `drawGraph` |
| 6.6 | Focus halo | 18% `brand` disc at r+7, ±1.5px at 4 rad/s | per frame | `drawGraph` |
| 6.7 | Hover card / settings / glossary | `ws-pop`: fade + 4px rise + scale .98→1 | 140ms / 160ms | CSS |
| 6.8 | Pane open/close | width 0 ↔ `min(600px,46%)`; left border fades in | 280ms | `.ws-pane` |
| 6.9 | Pane content change | `ws-slide-in`: fade + 14px from the right | 220ms | `.ws-pane-body > *` |
| 6.10 | Camera | eases 14% per frame toward the target (fit / reveal) | ≈400ms | `stepCamera` |
| 6.11 | Sidebar | margin-left 0 ↔ −260px + opacity | 220ms | `.ws-side` |
| 6.12 | Tree chevron | rotate −90° when collapsed | 160ms | `.ws-tree-chevron` |
| 6.13 | Toggle switch | knob slides 14px, track to `brand` | 160ms | `.ws-toggle` |
| 6.14 | Link card hover | border and background | 140ms | `.ws-link-card` |
| 6.15 | Refresh | Files whose `contentHash` changed re-run the 700ms birth pulse (set `node.born = now`) | 700ms | engine |
| 6.16 | Streaming explanation | caret blinks 1s steps(2) | — | `.bz-caret` |
| 6.17 | Narrow sheet / drawer | pane `translateY(105%)`→0 300ms; tree `translateX(-100%)`→0 240ms | — | CSS |

The replay is a replay. The launcher returns the graph in one response, so during the real request show the existing gate state "Reading plant-journal…" (no percentage), and start the replay when the graph arrives. Its title is "Drawing what Boozer found in <label>…", never "Reading".

---

## 7. Detail pane

### 7.1 Chrome
- Tab: glyph (`file` / `overview` / `notes`) + title (file name, "Overview", "My notes") + × (closes the pane).
- Header: ‹ › history · centred breadcrumb (`plant-journal / Overview`, or the path's folders with the file name bold) · for files only, a toggle on the right: `code` glyph = "Show source", `book` glyph = "Show note" (`aria-pressed` = source mode).
- Status bar: file: `Used by N · Uses N files · N lines · ● On this computer`; other views: `N files · N imports · N gaps · ●…`. After any cloud send, the locality reads "N requests sent online" in `external-ink`.

### 7.2 Overview note (content order)
1. Chip "Illustrative project…" (prototype only; drop it in the product).
2. `h1` project label.
3. Properties "What Boozer read" + Found in code: Code files `**P** of F read` · Imports `N found by reading the code` · Snapshot time · Analysis `Possibly incomplete · N gaps` (`gap-ink`) or `No gaps recorded`.
4. Lead (18px): "Each dot in the graph is one of your files. A line means one file *imports* another. Point at a dot to see what it connects to; click it to open it here." (*imports* is a glossary term.)
5. `bz-gaps` block, one row per reason with paths (data: `coverageSummary`/`graph.coverage`; words: `SKIP_WORDS`/`ISSUE_WORDS`). Parse-error paths are links; skipped paths are plain `code`.
6. "Where could I start reading?" + Found in code: hint, then 3 link cards from `rankStarts` (first parsed one gets the primary **Start here** button), sub-line "Nothing imports it · reaches N other files" or the parse-error line; "Show all N".
7. "Files many others use" + Found in code: top 3 of `mostImported` with "used by N files" and a **types only** tag when every incoming edge is a type import.
8. "Files that import each other" + Found in code: `cycles` as `a ⇄ b` cards with "Each imports the other (lines x and y)."
9. "What happens to your code here": local/cloud/notes status sentence.
Every path in this note has `data-hover-id` so hovering lights its dot.

### 7.3 File note (content order)
1. `h1.is-file` with dimmed folders.
2. Properties + Found in code: Language · Lines · Uses `N of your files` · Used by `N file(s)` · Gaps `None in this file` / `N import(s) not followed` (`gap-ink`).
3. Parse-error files: danger notice ("Couldn't be parsed… You can still read its source with the code button above.") and **no** explanation section.
4. "What does this file do?" + AI tag → ExplanationBlock (states in COPY.md). Optional cloud comparison collapsed under it, only when `cloud.status().available`.
5. "How is it connected?" + Found in code:
   - **This file uses** (blue glyph): sub "Files it *imports*, with the line that does it. Blue lines in the graph." Link cards for file targets (plus **types only**), then unresolved/excluded imports (spec in `code` + gap tag "couldn't follow" / "not code"). Each card: path link + context line (full source line from the loaded file, specifier marked). Show 4, then "Show all N". Then "Also uses N packages: `react`, …".
   - **Used by** (green glyph): sub "Files that import this one, with the line in each. Green lines in the graph." Each card: importer path + the line. Without the importer's source loaded, render the line as `import … from '<specifier>'` (or `import type … from`, `require('<specifier>')`, `import('<specifier>')`, `export … from`) using `edge.kind`; never fetch on render. Empty: the "doesn't mean it's unused" sentence.
   - Clicking a context line opens source mode on that line (in the other file for Used by entries).
6. "Before you change it" + Found in code → restyled ImpactPanel (importers only; Direct · Up to 2 steps · All; How chains; gap notice linking to Overview).
7. "What Boozer can't tell you here" → this file's gaps plus the static-analysis sentence.
8. "Your notes" + Your note tag → NotesPanel (consent flow unchanged). The line inputs pre-fill from `evidence` when source is open on this file.

### 7.4 Source mode
Sticky header: "‹ Back to the explanation" (origin `cite`) or "Back to the note" (book glyph), the **Exact text from your file** fact tag, and the meta line ("Lines 8–11, cited as S1 by the AI explanation · snapshot …", "The import on line 3", "Lines 12–18, linked by your note", "Whole file"). Stale → gap notice and no highlight (`referenceState` rule unchanged). Escape returns to the note.

### 7.5 My notes
`h1` "My notes", hint, then groups: **Needs a look** (moved, stale, missing), **Up to date**, **Not linked to lines**, each note preceded by its file link. Notes off → the consent block. The ribbon notes button shows a 7px `gap-ink` dot while any note needs a look.

---

## 8. File tree and search
- Tree from `graph.files` paths: folders sorted, files after folders; folder rows toggle `collapsed[path]` (chevron); file rows show the name, with the full path in `title`; flags `N gap` (`gap-ink`, from `coverage.imports.issues` whose edge `from` is this file) and `parse error` (`danger-ink`). The open file's row is `aria-current`.
- Head: project label, "collapse all" (overview glyph), × to close.
- Search mode (ribbon search): an input that filters the tree to matching paths (flat list) and sets `filters.search`, which fades non-matching dots. Copy: "N files match. Other dots fade in the graph." / "Type part of a name or folder."
- Foot: locality + file count.
- Hovering any row sets `hoverId` (external focus). Click → `go(file)` and reveal the dot.

---

## 9. Cross-highlighting
Any element with `data-hover-id="<node id>"` in the tree or pane sets `hoverId` on `mouseover` and clears it on leaving to an element without one. Ids: file path, `pkg:<name>`, `gap:<edge.id>`. GraphView gets it as `externalHoverId`. Link cards, starting-candidate cards, impact rows and file links all carry it.

---

## 10. Accessibility and keyboard
- The canvas is `role="img"` with the label in `GRAPH_COPY.canvasLabel`. Everything in it is reachable without it: the tree, the pane links, and search.
- All controls are buttons with labels (`aria-label` on icon buttons). Ribbon toggles use `aria-pressed`; the tree uses `aria-expanded` and `aria-current`; the narrow tab bar uses `aria-current`.
- Focus ring: 2px solid `focus-ring`, 2px offset (in `components.css`).
- Escape closes, in order: glossary popover → graph settings → source mode.
- Live regions: replay overlay `role="status"`; streaming explanation `aria-live="polite"`; errors `role="alert"`.
- Text contrast meets 4.5:1 on its stated grounds in both themes (checked); `text-subtle` is for packages and decoration only.

---

## 11. Truth rules (review blockers)
1. Only parser edges are drawn or listed as connections. The model never adds one.
2. Dot size and "files many others use" are import counts, always with "not more important".
3. Impact copy says "potentially affected" and both limits. Never "will break", "safe", "unused" or "dead".
4. Starting candidates are never called entry points.
5. Every AI answer carries "AI explanation · may be wrong"; parser facts carry "Found in code"; notes carry "Your note"; gaps carry dotted gap styling and counts.
6. No colour, cluster, lane or label derived from guessed roles (UI/API/DB/feature). Positions mean nothing.
7. Local explanations start only on the button. A local failure never offers or triggers cloud. Cloud sends only after preview + Send, and the locality indicators count it.
8. The replay is labelled as drawing what was found, not live reading.

---

## 12. Optional server addition
`GET /api/projects/:id/runtime` → `RuntimeStatus` (the type already exists in `shared/explanation.ts`; `ModelAdapter.status()` exists). With it, the Explain section can show "The local AI isn't running" before a click. It is Codex's area (server routes) and **not required**: without it, errors appear after the click as they do today.

---

## 12b. Entry screens and deployment modes

- **Before a project is ready**, keep today's entry flows: `ProjectGate` (local confirm/indexing/failed), `ProjectEntry` (M2-PICK folder picker, in review) and `HostedGate` (P-19 pilot, proposed). Restyle them with `.ws-gate` / `.ws-gate-card` (screenshot 00) and the copy in COPY.md. Don't change their logic or security checks.
- **Open another folder** (M2-PICK): when that route exists, add a ribbon button with the `folderOpen` glyph above Refresh, and "Choose a different folder" on the confirm card. Until it merges, show neither, rather than drawing a dead control.
- **Local mode (default):** everything in this spec as written.
- **Hosted pilot mode (P-19, only if it ships):** the locality indicators must not say "On this computer". Use "Uploaded to the Boozer pilot server" (sidebar foot and status bar, `external-ink` dot), and after any OpenAI request, "N requests sent to OpenAI". There is no local model, so the Explain section shows only the existing cloud preview → Send flow, titled "Explain with OpenAI (sends code online)". There is never a local "Explain this file" button and nothing runs automatically. Notes are disabled in the pilot: hide "Your notes" and My notes, and show the ribbon notes button disabled with the title "Notes aren't available in the hosted pilot". Everything else (graph, replay, pane, impact) is identical. Read the mode from `root.dataset.hosted === 'true'`, as `main.tsx` does.

## 13. Assets
- **Fonts:** none to ship. `--font-sans: "Helvetica Neue", Helvetica, Arial, sans-serif` (Athelstan's fallback stack; Aeonik Trial is not licensed for Boozer) and `--font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`. The canvas label font uses the same sans stack (`GRAPH.label.font`).
- **Icons:** `assets/icons.tsx`, 24 original 16px line glyphs (1.5 stroke, round caps, `currentColor`). Where each one is used is listed at the bottom of that file. No emoji. Don't use Athelstan's `ShellGlyph`.
- **Logo:** none. Ribbon mark = "B" on `brand`; wordmark = "Boozer **AI**" with "AI" in `brand-ink`.
- **Images/wallpapers:** none. The ground is `canvas`. Athelstan's wallpapers have no recorded licence and are not used.
- **Tokens:** `assets/tokens.json` (source, with a usage note per token) → `assets/tokens.css` (generated). Night first; Paper via `prefers-color-scheme: light` or `data-theme`.

---

## 14. Build order (each slice ships on its own)

| Slice | Contents | Done when |
|---|---|---|
| S1 Tokens + shell | tokens.css, components.css, Workspace with ribbon, sidebar + tree, graph area using today's MapCanvas, pane rendering today's DetailPane content | App runs; layout matches screenshot 04 apart from the graph; typecheck/tests pass |
| S2 Graph engine | engine.ts + GraphView (no replay): hover focus, card, click → pane, drag/pan/zoom, legend, settings, fit/reveal | Screenshots 03, 07, 10 reproduce on the fixture and on Boozer's own repo |
| S3 Notes in the pane | OverviewNote, FileNote (properties, LinksSection, restyled Explanation/Impact/Notes/Cloud), SourceMode, history, NotesNote | Screenshots 02, 04–09, 11–13 |
| S4 Replay + narrow | planReplay wiring after indexing, Skip, reduced motion; container-query narrow layout with tab bar, drawer and sheet | Screenshots 01, 16–18; reduced motion verified |
| S5 Refresh continuity (optional) | Keep `Workspace` mounted across Refresh; diff `contentHash` per file; pulse changed files; mark explanations "Written before your last refresh" | Screenshot 14 |

## 15. Tests
Default suite (offline, no DOM): unit-test the engine's pure functions on `fixtures/basic` and a hand-written graph:
- `buildModel`: one node per file, package, gap; links = edges; radius formula; positions kept on rebuild.
- `targetId`, `nodeVisible`, `linkVisible` with every filter.
- `planReplay`: steps sorted by path, include non-parse-error skips, step ≤ 150ms, `endsAt ≤ 300 + 2400 + 700`; package/gap `born` after their first link; links to later files wait for them.
- `hitTest` with camera transforms; `fitCamera` bounds within [0.35, 2]; `zoomAt` clamps to [0.25, 3.5] and keeps the pointer's world point fixed.
- `hoverCardData`: counts split files/packages, importers listed with lines, gaps carry reasons.
- `rankStarts`: order by reach, ties by path, parse-error starts included.
- Copy guard: rendered strings must not contain "unused", "dead code", "safe", "will break" or "entry point" **except** inside these allowlisted negations: "That doesn't mean it's unused: entry points, config and tests are often loaded another way.", "It doesn't mean they will break, and an empty list doesn't mean a change is safe.", "It doesn't mean they will break.", "And no files listed doesn't mean a change is safe.", "Entry points, config files and tests usually look like this." Implement it as a test over the strings module.

**Human checks** (browser; don't tick them yourself): hover/click on Boozer's own repo (79 files), Paper and Night, narrow at 390px and half-width, reduced motion, the usability script in the design system.
