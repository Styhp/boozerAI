# Graph workspace: design handover

Everything an implementing agent needs to build Boozer's graph-workspace redesign as designed: the layout and spacing, tokens and CSS, icons, copy, a typed graph engine with all the animation, a reference React GraphView, a runnable prototype and screenshots of every key state.

**Status:** approved design from the human lead (Claude Design session, 2026-10-09/10). **Not implemented.** Nothing in `src/` has changed. This folder is uncommitted.

## Before writing code (AGENTS.md)

1. **Human lead:** record the redesign as a product decision (next free P-number) and assign owners in TASKS.md. Suggested rows are below.
2. **C4 amendment (review needed):** ARCHITECTURE.md's C4 specifies an original *layered* layout with list-first above 300 nodes. This design uses a hand-written force-directed layout for the default view and keeps list-first above 300 (SPEC §5.9). Codex reviews the amendment.
3. **No new dependencies.** The engine is plain TypeScript with no packages. Don't add d3-force or similar without the approval AGENTS.md requires.
4. Client UI is Agent B's area. `InsightsPanel.tsx` / `insights.ts` are Codex-authored, so add `rankStarts` in a new module. Server routes are Codex's (the optional runtime route in SPEC §12).
5. The hosted pilot (P-19) and the folder picker (M2-PICK) are other sessions' work. SPEC §12b says how the workspace adapts to them; don't change their logic.

## Reading order

1. **[SPEC.md](SPEC.md)**: the contract. Layout, spacing, state model, graph behaviour, every animation with timings, pane contents, truth rules, accessibility, build slices, tests.
2. **[screenshots/](screenshots/)**: what each state must look like (desktop 1440×900, narrow 390×844, both themes).
3. **[reference/prototype.html](reference/prototype.html)**: open it in a browser to feel the behaviour. Use **Prototype controls** (bottom right) for themes, narrow, AI states, cloud, notes, Replay and Refresh. Invented data; not code to ship.
4. **[assets/](assets/)**: `tokens.json` (source, with a usage note per token), `tokens.css` (generated), `components.css` (all `bz-*` and `ws-*` classes), `icons.tsx` (the 24 glyphs and where each is used).
5. **[reference/](reference/)**: `graph-engine.ts` (model, replay, simulation, camera, hit testing, drawing, hover-card data; every number in `GRAPH`), `GraphView.tsx` (canvas, loop, pointer input, hover card, replay overlay, legend, settings), `copy.ts` (graph strings and gap words).
6. **[COPY.md](COPY.md)**: every other string, with the required phrases marked.

If sources disagree: SPEC → assets CSS/tokens → engine/GraphView → copy → screenshots → prototype.

## Verified so far

- `reference/*.ts(x)` and `assets/icons.tsx` type-check against the repo's strict `tsconfig.json` and `src/shared/contracts.ts`: `node_modules/.bin/tsc -p docs/design/graph-workspace/reference/tsconfig.json` exits 0 (2026-10-10).
- The prototype ran in headless Chromium at 1440×900 and 390×844 in Night and Paper with no script errors; the screenshots come from that run.
- Text colours meet 4.5:1 on their stated grounds in both themes, except `text-subtle` on white in Paper (4.1:1), which is kept from Athelstan and restricted to packages and decoration.

**Not verified:** the engine inside the real app, performance on Boozer's own 79-file / 300-edge graph or near the 300-node cap, the MSI demo machine, and usability with real users.

## Suggested TASKS.md rows

| ID | Task | Owner (proposed) | Depends on | Done when |
|---|---|---|---|---|
| UX-G0 | Record P-number; C4 amendment for the force layout | Human lead; Codex reviews | — | Decision and amendment recorded |
| UX-G1 | Tokens + workspace shell (S1) | Agent B | UX-G0 | SPEC §14 S1 |
| UX-G2 | Graph engine + GraphView (S2) | Agent B; Codex reviews | UX-G1 | S2 + engine unit tests |
| UX-G3 | Pane notes, source mode, history, My notes (S3) | Agent B | UX-G2 | S3 |
| UX-G4 | Replay + narrow layout + reduced motion (S4) | Agent B | UX-G3 | S4 |
| UX-G5 | Refresh continuity (S5, optional) | Agent B | UX-G4 | S5 |
| UX-G6 | Optional runtime-status route | Codex | — | SPEC §12 |

## Files

```
graph-workspace/
├─ README.md            this file
├─ SPEC.md              implementation contract
├─ COPY.md              copy deck
├─ assets/
│  ├─ tokens.json       design tokens (source)
│  ├─ tokens.css        generated CSS custom properties, Night default + Paper
│  ├─ components.css    bz-* shared components + ws-* workspace
│  └─ icons.tsx         24 glyphs + usage map
├─ reference/
│  ├─ graph-engine.ts   framework-free engine with all graph motion
│  ├─ GraphView.tsx     React wrapper
│  ├─ copy.ts           graph strings, SKIP_WORDS, ISSUE_WORDS
│  ├─ tsconfig.json     type-checks the reference against the repo
│  └─ prototype.html    runnable behaviour reference (invented data)
└─ screenshots/         00–18, named by state
```

## Disclosure

Colour, spacing, radius, glass and shadow values come from the human lead's private Athelstan repository (`athelstan-platform` @ `962f69d`); no components, icons, fonts, logo or wallpapers were reused. The row for SUBMISSION.md's register is in the design system's "Athelstan reuse record". The human lead should confirm ownership and permission before publishing.
