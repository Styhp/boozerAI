# Product

**Status: local launcher, authenticated APIs and real-project map/source integration independently approved in M2; C5/C7/C8 resolved.** Map/impact are approved after C10. Agent B's local M3 engine/panel is Approved with C9 after its grounding/file-name fixes; two wider injection tests still fail and are disclosed. Human browser acceptance and MSI rehearsal remain open. Secondary cloud integration under P-16 is separate pending work.

## Users and problem

Primary users are developers joining unfamiliar codebases and developers reviewing AI-generated code. Privacy-constrained teams are secondary users. Reading structure across many files is slow; unsupported AI claims make that harder. Users need checkable source evidence without requiring a cloud AI service.

## Product promises (acceptance targets)

1. Dependency edges come only from static parsing and resolution. Unsupported patterns stay unresolved; the model never adds, removes, or changes edges.
2. Explanations expose their input snippets and validate citation references. A valid reference does not prove that an explanation is correct; answer quality needs separate evaluation.
3. Impact is potential reachability, never proof of breakage or safety.
4. Core analysis, AI explanations, and evaluation work locally after setup. Optional services cannot become mandatory prerequisites or silent fallbacks.
5. Target repositories are untrusted data: never executed, installed, edited, or obeyed as instructions.

## Core journey (planned)

1. Select a local project explicitly at launch; later, import a public GitHub archive.
2. Open the dashboard and inspect indexing status, file counts, and limitations.
3. Navigate the canvas or accessible list; select a file or dependency to open its source in the detail pane.
4. Request a local explanation with visible snippets and clickable references.
5. Inspect graph calculations and potential impact with evidence chains.
6. Use the navigation rail and insights to move between findings and source evidence.

## Full roadmap and delivery phases

Phases describe order, not exclusions. Only the bounded first delivery is a candidate for this submission, subject to actual evidence and time. Every row below is **planned / not implemented**.

| Phase | Retained product capability | First increment and integration |
|---|---|---|
| A: first vertical slice | Dashboard, navigation rail | Project status, counts, map/inspector/impact navigation using a shared project and selection state |
| A | Parser and basic CommonJS support | JS/JSX/TS/TSX/MJS/CJS imports, re-exports, type imports, literal `require` and `import()`; unresolved reasons for dynamic forms |
| A | Canvas and detail pane | Clickable parser graph plus accessible list; source/evidence/explanation tabs |
| A | Ingestion pipeline and local folder input | Explicit root selection → bounded read-only snapshot → parse/resolve → graph; original fixture uses the same pipeline |
| A | Graph calculations and initial insights | Direct/transitive importers, cycles, counts, evidence paths; show static-analysis limitations |
| A | Local explanations and initial evaluations | Ollama adapter, snippet citations, injection cases, hand-written graph/impact oracles, optional local-model evaluation run |
| B: extend after the core gates | Explanations with caching and tracing | Content/config-keyed local cache and local trace records; optional explicit LangSmith export |
| B | GitHub input | Public archive import feeds the same ingestion pipeline; no target execution |
| B | Framework adapters, fuller CommonJS and Express support | Static framework annotations and route/middleware metadata; module exports, shadowed `require`, aliases, workspaces, and package maps have explicit supported/unsupported cases |
| B | Expanded graph calculations, navigation rail and insights | Degree/cycle summaries and navigable findings; deterministic calculations with evidence |
| B | Evaluations | Local datasets and reports covering correctness, citations, injection resistance, quality, latency, and cache behavior; no cloud dependency |
| C: later product depth | Agent | Bounded read-only investigation over snapshot/search/graph tools with citations; no shell, writes, network tools, or graph mutation |
| C | Landing page | Original design, honest feature/status copy, local-app entry; publishing is separately authorized |
| C | Optional JEV and OpenAI integrations | Secondary services behind explicit consent and data preview; JEV severity and scores (P-12); JEV role/API remains to be clarified |
| C | Deeper analysis and reports | Symbol-level map, call relationships where statically supported, selected ranges, diff-aware impact, exportable evidence reports, verified hardware acceleration where available |

Framework route annotations are a separate evidence-backed view; they are not AI-generated dependency edges. The adapter contract can extend static parsing but cannot use model guesses as facts.

## First delivery boundary

Candidate submission: a tiny original fixture and a bounded user-selected local project, file-level parsing, dashboard shell, canvas/list, detail pane, basic navigation, local file explanations, and potential impact. Basic CommonJS literal imports are included; complete CommonJS/Express/framework semantics are later work. Offline deterministic tests and a separately labeled real local-model check are required.

Later phases remain on the roadmap even if they miss the hackathon. In particular, GitHub input, caching, richer tracing/evaluation, framework adapters, fuller insights, the agent, and the landing page are not removed. See [TASKS.md](TASKS.md) for gates and the time buffer. Any smaller submission or change to the cut line requires the human lead; never replace missing local inference with a cloud-only demo while claiming local AI.

## Exclusions and safety boundaries

- Executing, installing, testing, or modifying analyzed target code is excluded. Testing Boozer AI itself is separate.
- Arbitrary filesystem access outside the selected root, secret ingestion, telemetry, and background cloud traffic are excluded.
- AI-authored dependency edges and guarantees that a change is safe or will break are excluded.
- Authenticated/private GitHub access is not in the initial public-import contract; it requires a later design and approval.

## Decisions

### Decided by the human lead in the 2026-10-09 reconciliation request

| ID | Decision | Rationale |
|---|---|---|
| P-1 | Local folder first, GitHub second; preserve both on the roadmap. | Deliver an offline input path before network/archive handling. |
| P-4 | Keep JEV and OpenAI as optional secondary cloud integrations. | Core local AI must remain useful without either; JEV's exact role is still open. |
| P-7 | Preserve the full roadmap and separate phases from exclusions. | The remaining hackathon time is not evidence that the entire tutorial can be completed. |
| P-8 | LangSmith is optional and off by default; local evaluation remains possible. | Trace payloads can contain code, prompts, outputs, and metadata; explicit export consent is required. |
| P-9 | Test the MSI before relying on it for recorded or live demos. | Neither suitability nor GPU acceleration has been verified. |
| P-10 | Phase A splits into demo-critical and **[Hardening]** tiers (TASKS.md, 0.2 condition C2). The demo must show real parser and real local-model output: never mocked, canned or pre-recorded. (Human lead, 2026-10-09, after 0.2.) | Hardening items (persistence, race detection, content secret scanning, the evaluation report, dashboard/rail/insights) produce no demo output and remove no judged capability. Real output is a submission rule. |
| P-2 | **The MSI Bravo 15 is the demo machine.** (Human lead, 2026-10-09, about 16:25 AWST.) M6 must pass for each use, recording and live. The Mac is the fallback only after its own offline rehearsal, decided at the 00:00 MSI go/no-go (SUBMISSION.md). | The human lead's choice. MSI setup runs tonight in parallel with the build, so it doesn't consume post-freeze time. Steps are in [MSI-SETUP.md](MSI-SETUP.md). |
| P-5 | **Latency target (provisional):** first streamed token within 15 s on a warm model, complete answer within 60 s. Requests are capped near 500 prompt tokens of snippets and near 300 output tokens, and the model is preloaded at app start. Confirm or revise at M6 with MSI measurements. (Human lead, 2026-10-09, accepting Agent B's 1.6 proposal.) | 1.6 on the contended dev Mac CPU: about 11 s to first token for a new file, about 52 s for 300 tokens (see docs/BENCHMARKS.md). The MSI is unmeasured. Misses are recorded, not hidden. |
| P-14 | **The demo opens Boozer AI's own repository** for the live shots (open, map, explain, cite, impact). The 1.3 fixture appears only as the known-answer proof (DEMO.md shot 7). (Human lead, 2026-10-09, about 17:40 AWST.) | Real code, available offline, already measured (49 nodes / 144 edges at `d964188`, under the 300-node cap), and no third-party download. Boozer is itself AI-assisted code built tonight, which fits the product story. |
| P-15 | **M3 is split.** Agent B (Claude Code) owns the explanation engine in new files under `src/server/explain/` (ModelAdapter, retriever and prompt, citation and file-name validation, ExplanationService) plus the client explanation panel. Codex keeps M2 and the `POST /api/projects/:id/explanations` route, which calls `ExplanationService`. Each reviews the other's part. (Human lead, 2026-10-09, about 17:40 AWST.) | M3 is the local-AI feature (25% of the rubric). Codex alone could not finish M2 and M3 before the 06:00 freeze. Agent B already holds the 1.6 model findings. Codex updates the M3 row in TASKS.md, since it is editing that file. |
| P-16 | **Secondary cloud AI: OpenAI, as a stretch feature after M2 and the end-to-end check pass.** Agent B owns it on the existing ModelAdapter boundary. Rules: off by default; per-request opt-in after a preview of the exact payload; labeled `cloud`; **never** an automatic fallback when local fails; key read server-side from the `OPENAI_API_KEY` environment variable at launch, never committed, logged or sent to the browser; no SDK (plain `fetch` to a fixed allowlisted endpoint); exact model ID recorded. Kimi (OpenAI-compatible) may be added later the same way. Cloud API calls during development are approved for this feature. (Human lead, 2026-10-09, about 18:25 AWST.) | The original brief allows cloud AI as a secondary feature (P-4). Local stays the default and the demo's local-AI proof. Cloud use is listed under "requires internet" and in the disclosure register once used. |
| P-12 | Severity and scores are in scope as an optional JEV cloud feature, **deferred until after the hackathon**, with space reserved in the design. (Human lead, 2026-10-09, in a later Claude Code session.) | JEV is the candidate for structured decisions, but its API is unknown (P-11) and the consent, preview and guardrail work doesn't fit the remaining time. |

### P-12 guardrails (proposed by Claude Code; Codex reviews in 0.3)

**Reserved space, not built:** the `ScoreProvider` contract in ARCHITECTURE.md, and a Scores position in the detail pane design. Nothing for JEV is coded, stubbed, or shown in the UI before M12. A visible "coming soon" slot would make the demo look unfinished.

- **Labeled as judgment.** Scores show that JEV produced them and are never styled like parser facts.
- **Evidence or nothing.** Each score cites the parser facts (fan-in, transitive importers, depth, cycles, coverage) and snippet IDs it used. A score without citations isn't shown.
- **Arithmetic stays local.** Counts that can be derived from the graph are computed locally and shown as facts. JEV may interpret them but never recomputes or overrides them.
- **No new claims about structure or breakage.** Scores never change edges or impact results, and their wording never says a change will break or is safe.
- **Optional and visible.** JEV scoring is off by default, opt-in for each request, and shows a preview of the outgoing data. With JEV off or offline the app is complete. Scores are not part of the local-AI claim and are listed under "requires internet".
- Blocked until P-11 (what JEV is) and P-13 (what is scored) are settled.

### Open / proposed

| ID | Question | Proposed default | Decide by |
|---|---|---|---|
| P-3 | File-level or selected-range explanations first? | File-level first; ranges remain later scope. | Before M3 |
| P-6 | Team names and repository license? | Human lead supplies team list and chooses license. | Before publication |
| P-11 | What does JEV provide, and under which endpoint/data terms? | Keep an optional provider boundary; do not assume an API or install a dependency. | Before M12 implementation |
| P-13 | What do JEV scores rate? | Change risk for the selected file, based on parser facts and snippets. Not code quality or "issues found", so Boozer stays an explainer of structure rather than a code reviewer. | Before M12 implementation |
