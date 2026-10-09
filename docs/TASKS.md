# Tasks

Ordered milestones for Boozer AI. Current and proposed owners are listed below. To claim a task, write your name in its **Owner** cell before starting; the rules are in [AGENTS.md](../AGENTS.md). Tick an acceptance check only after verifying it, and note how you verified it.

## Time check and proposed delivery order

- Deadline recorded in the existing submission brief: **2026-10-10 10:00 Manila / Perth (UTC+8)**. Organizer source has not been supplied for independent verification.
- Do not reuse the baseline's 14:36 countdown as current time. The remaining time is not a commitment to finish the tutorial or every roadmap phase.
- Submission candidate: Phase A / M1–M4 plus M7. The MSI is the demo machine (P-2, decided 2026-10-09), so M6 is mandatory. GitHub (M5) and M8–M12 stay on the roadmap; they are not required to be finished before this deadline.
- Cutoffs on **2026-10-10 UTC+8** (human lead, 2026-10-09 about 16:25 AWST; full table in [SUBMISSION.md](SUBMISSION.md#deadline)): **00:00 MSI go/no-go** (otherwise the demo moves to the Mac, which then needs its own offline rehearsal), **06:00 feature freeze**, 06:00–07:00 final MSI build and offline rehearsal, 07:00–08:00 recording, 08:00–09:00 publish and submit, **09:00–10:00 buffer**, **10:00 deadline**. These replace the earlier 05:00 proposal. If a cutoff is already missed, escalate to the human lead immediately; do not silently consume the buffer or claim missing checks.
- **Tiers (P-10, decided 2026-10-09).** Phase A checks marked **[Hardening]** are built only after the demo path works end to end; otherwise they move after the hackathon. Untagged Phase A checks are demo-critical. The demo must show real parser and real local-model output, never mocked or pre-recorded.
- At freeze, unfinished work is reported as unfinished. Reducing the candidate scope, accepting slower measured latency, or submitting a partial build is a human decision. Cloud inference cannot substitute for the required local-AI evidence.

## Roles and ownership

| Role | Who | Responsibility |
|---|---|---|
| Human lead | User (team/display name still needed) | Scope/deadline decisions, installations/downloads/cloud approvals, demo operation, publishing and submission |
| Agent A | Codex | 0.1 documentation proposal; scaffolding (1.1), parser/resolver (1.4), ingestion (M2), explanations (M3) and integration |
| Agent B | Claude Code (implementation chat) | 1.2 scaffold review; fixture (1.3), canvas/detail pane (1.5), local-model test (1.6), potential impact (M4) |

Reviews 0.2 and task 0.3 were done in a separate Claude Code chat with the human lead, not in the Agent B implementation chat. Both record their work under "Claude Code"; Codex reviews all Claude-authored work.

Future owners below are proposed assignments, not evidence that work has started. Each owner must mark their task In progress before working. Any reassignment is recorded here first. Every author has a different reviewer. Codex reviews Claude-authored fixture/UI work; Claude reviews Codex-authored scaffold/parser/integration. Neither reviews their own contributions.

## Overview and integration points

| ID | Milestone / task | Owner | Depends on | Integration point | Status |
|---|---|---|---|---|---|
| M0 | Documentation baseline | Claude Code | None | Shared project docs | Historical draft; reconciled in 0.1 |
| 0.1 | Reconcile docs and propose architecture | Codex (Agent A) | All project docs read | README.md, AGENTS.md, PRODUCT.md, ARCHITECTURE.md, TASKS.md, SUBMISSION.md | Approved for 1.1 in 0.2; C1–C4 resolved (C1/C4 verified in 1.2) |
| 0.2 | Independent proposal review | Claude Code (Agent B) | 0.1 | Proposed S-choices, roadmap, safety contracts, schedule | Done: Approved for 1.1 with conditions C1–C4 (2026-10-09) |
| 0.3 | Agent working rules and project skills | Claude Code | Human lead request, 2026-10-09 | AGENTS.md, CLAUDE.md, `.agents/skills/`, `.claude/skills/` | Done: Approved by Codex; C6 skill correction rechecked at `0b41795` |
| 0.3-R | Independent review of Claude-authored 0.3 | Codex (this session) | 0.3 handoff; human request | Review skill, rules, P-12/P-13 and reserved ScoreProvider | Done: Approved after C6 recheck |
| 1.1 | Scaffold/configuration | Codex (Agent A, this session) | 0.2 Approved + human start approval | Shared types, server/client/test entry points | Done: Approved in 1.2 at `4718e27`; condition C5 open for M2/M3 |
| 1.2 | Independent scaffold review | Claude Code (review chat) | 1.1 | Rerun scaffold gates; record accepted stack | Done: Approved with condition C5 (2026-10-09); 1.3, 1.5 and 1.6 may start |
| 1.1-C5 | Dev-proxy Origin correction | Codex (this session) | 1.2 condition C5; human request | Dev launcher → Node Origin policy; production remains strict | Done: rechecked and Approved by Claude Code (review chat), 2026-10-09; see docs/reviews/2026-10-09-c5-and-m2-foundation.md |
| 1.3 | Original fixture and hand-written graph | Claude Code (Agent B chat) | 1.2 Approved | Snapshot/graph schemas; Codex reviews oracle | Done: independently Approved by Codex at pinned review artifact `af671e8` |
| 1.4 | Parser/resolver | Codex (Agent A, this session) | 1.3 reviewed | Snapshot → graph; Claude reviews | In progress: claimed after 1.3 approval; implementation not begun |
| 1.5 | Dashboard, canvas, detail pane, navigation | Claude Code (Agent B chat) | 1.2 Approved; reviewed 1.3 data | Graph/evidence and shared selection; Codex reviews | In review: map screen built on the fixture preview; human browser check and API wiring (M2) pending |
| 1.6 | Early local-model test | Claude Code (Agent B chat) | 1.2 Approved; download approved 2026-10-09; 1.3 snippets | ModelAdapter → benchmark record; Codex reviews | In review: benchmarked on the dev Mac; injection check **failed** (canary leaked every run), handed to M3 |
| M2 | Ingestion and local folder input | Codex (Agent A, this session) | Foundation: 1.2 and shared contracts; integration: reviewed 1.4, 1.5 and C5 recheck | Authorized root → immutable snapshot → parser → 1.5 UI | In progress: snapshot foundation Approved with condition C7 (oversize/case-collision must skip, not abort, before M2 opens real repos); integration pending |
| M3 | Grounded explanations and initial evaluations | Codex | 1.4, 1.5, 1.6 on the fixture snapshot; M2 for real folders | Retriever/ModelAdapter/validator → detail pane | Not started |
| M4 | Graph calculations, potential impact, insights | Claude Code (Agent B) | 1.4, 1.5 | GraphQueries → navigation/insights views; Codex reviews | Not started |
| M6 | MSI verification, if used for any demo | Human lead | M3, M4; approved setup | Actual runtime/app/display/recorder → evidence | Not started; MSI reliance blocked until pass |
| M7 | Submission package and demo | Human lead | M1–M4 verified; M6 if MSI; chosen-machine rehearsal | Tested build → truthful video/disclosures/submission | Not started |
| M5 | GitHub input | Codex | M2; human approval for development network use | Archive InputAdapter → same ingestion | Not started; later phase unless core and buffer secured |
| M8 | Local cache, traces and evaluations | Codex | M3 | LocalStore, TraceSink, EvaluationRunner | Not started; later phase |
| M9 | Framework adapters, CommonJS/Express, richer insights | Codex | 1.4, M4 | Static annotations and versioned graph queries | Not started; later phase |
| M10 | Read-only agent | Codex | M8 local evaluations, M9 | Bounded AgentTools over snapshots/graph | Not started; later phase |
| M11 | Landing page | Claude Code | Actual capability inventory; P-6 before publication | Original page → local-app entry; Codex reviews | Not started; later phase |
| M12 | Optional secondary cloud integrations/export, including JEV severity/scores (after the hackathon, P-12) | Codex | M8; P-11 and P-13 before JEV; explicit cloud approval | ModelAdapter and explicit TraceSink export | Not started; later phase |

Status values: Not started · In progress · In review · Done · Blocked (with reason). M1 means tasks 1.1–1.6, not an additional task.

Execution order is 0.1 → 0.2 → human approval → 1.1 → 1.2. Only after 1.2 is Approved may fixture/parser, UI, and local-model tracks overlap; their inputs must be reviewed first. This is a future work plan, not permission to spawn reviewers or begin parallel implementation now. Agent A integrates at M2, M3 and M4; consumers must not fabricate substitute contracts without recording changes. Review schema changes before merging producer and consumer work.

## M0: Documentation baseline

- [x] README.md, AGENTS.md, CLAUDE.md, and docs/PRODUCT.md, ARCHITECTURE.md, TASKS.md, and SUBMISSION.md exist. (Verified by Claude Code on 2026-10-09; the workspace was empty before.)
- [x] No app code, dependencies, or models were added. (Same check.)
- [x] The human lead supplied the six reconciliation decisions on 2026-10-09; 0.1 records them. This does not approve the implementation or schedule.
- [ ] The human lead accepts or corrects P-10, the cut line and proposed cutoffs after 0.2. (P-10 and the cut line were accepted 2026-10-09; the cutoff times are still to confirm.)

### 0.1 Documentation proposal (Codex)

Scope claimed before editing: README.md, AGENTS.md and all four docs/*.md files; CLAUDE.md read but unchanged. No scaffold, installs, model downloads, publication or other-project edits.

- [x] Full roadmap traced to delivery phases and task ownership, with safety exclusions separate. (Codex document inspection, 2026-10-09; not independent approval.)
- [x] Stack/parser/storage/interfaces and safe localhost selection/inference proposed, all choices still Proposed. (Codex document inspection, 2026-10-09.)
- [x] Local/cloud/tracing/evaluation boundaries, hardware gates and disclosures reconciled. (Codex document inspection against the six human decisions, 2026-10-09.)
- [x] Local Markdown links and phase/gate consistency checked; actual commands/results reported below. (Python link/fence check and Codex cross-document inspection, 2026-10-09.)
- [x] Review handoff prepared below for the human to give Claude Code; no reviewer invoked and no review verdict recorded. (Codex, 2026-10-09.)

### 0.2 Independent proposal review (Claude Code)

- [x] Reviewer is Claude Code, not proposal author Codex. (Limitation noted in the report.)
- [x] Full roadmap, minimal stack, selected-root access, local inference and storage contracts reviewed. (Conditions C1, C4.)
- [x] Optional OpenAI/JEV/LangSmith boundaries and local evaluation independence reviewed. (Pass. Claude Code's own P-12 lines are excluded; Codex reviews them in 0.3.)
- [x] Hardware/demo gates, actual-versus-proposed disclosures, milestone ownership and time buffer reviewed. (Conditions C2, C3.)
- [x] Verdict and required corrections recorded in the review log; this gate is Approved before asking the human to start 1.1. (Approved for 1.1, 2026-10-09.)
- [x] Human start authorization recorded separately with date/scope. A review verdict does not itself authorize installations or scaffolding. (See the authorization record below.)

**Findings queued before the review** (Claude Code, 2026-10-09). These are engineering lessons from reading Cartograph's `docs/` (project-doc.md and phase specs 1–10). They aren't its design and nothing was copied. They are now formal 0.2 findings, mapped to conditions and notes in the report below.

1. **Explanations must not name files that don't exist (M3).** The validator checks `[S#]` markers but not file paths written in the prose. Check every path-like token against the snapshot: link the ones that exist and flag the rest. Prove it with a test.
2. **Coverage needs a real denominator (1.4, M4).** Replace or extend the `possiblyIncomplete` boolean with counts. Files found = parsed + skipped, each skip with a reason. Imports seen = resolved + external + excluded + failed, each failure with a reason and examples. A project with zero recognized imports must not read as 100% covered.
3. **Parser checks beyond the fixture (1.4, M2).** Renaming one imported file produces exactly one new unresolved import, named. For code that relies on index files that re-export others (barrel files), compare re-exports found against resolved. Hand-check five files on a real repo.
4. **Canvas scale (1.5, M2).** A 10–15 file fixture and Boozer's own small repo won't reveal a flat file graph turning into a hairball at a few hundred files. Pick a grouping or list-first strategy, and test on a larger repo already on disk. Downloading one needs approval.
5. **One graph walk (M4).** Impact (importers) and dependencies (imports) should be the same walk with a direction and a depth limit. Default to shallow and expand on request. Cycle detection must be iterative, not recursive.
6. **"No importers" isn't "unused" (M4).** Entry points, configs, tests and framework-reached files have no importers by design. Insight wording says "no importers found by static analysis", never "dead" or "unused".
7. **Routes are exact or absent (M9).** M9 plans Express route extraction, but Express routes are assembled at runtime. Propose roles only, and add a route table only where the method and full path are statically exact.
8. **Explanation formatting (M3).** Models don't reliably obey "no formatting". Permit and safely render a small subset (inline code, bullets, bold) and escape everything else. This fits "never raw HTML".

**0.2 review report** (Claude Code, 2026-10-09, about 15:40 AWST)

*Reviewed:* README.md, AGENTS.md, CLAUDE.md and the four docs/*.md files as they stood at 15:19–15:35 (no git, so modification times stand in for a SHA). *Excluded:* Claude Code's own 0.3 lines (P-12/P-13, `ScoreProvider`, the JEV boundary sentence, the M12 JEV check, the queued findings, and the SUBMISSION.md 0.3 notes); Codex reviews those in 0.3. *Limitation:* some text Codex kept came from Claude Code's M0 baseline (data-interface sketch, extraction table, fixture list, M1 checks). This review covers Codex's changes to that text, not its original wording.

**Verdict: Approved for 1.1, with conditions C1–C4.** The stack and contracts are sound enough to scaffold, and nothing in the conditions changes what 1.1 builds. The human lead still has to authorize 1.1.

*Re-run:* link/fence check: 11 files, 33 local links, 0 broken, 0 unbalanced fences. Toolchain: Node v24.16.0, npm 11.13.0, git 2.39.5 and the Xcode Command Line Tools are present, so S-1 and `git init` need no system installs. `ollama` is not installed.

*Checklist:*
- Scope: Pass. Dependencies: N/A (nothing installed). Docs consistent: Pass.
- Re-run checks: Pass. App suite: N/A. No check weakened (the M1 checks were kept and strengthened): Pass. Every ticked 0.1 check has evidence: Pass.
- Safety design: Pass. That covers no execution, root confinement, loopback with Host/Origin checks and a per-launch token, opaque IDs, a fixed Ollama endpoint, no cloud fallback, and escaped rendering. The one exception is that incomplete analysis isn't counted (C1).
- Parser boundary search: N/A (no code). Honesty: Pass.

*Conditions.* Each must be resolved before the named task starts:

- **C1, before 1.3 (Codex, during 1.1):** settle the schemas the hand-written oracle depends on. Add coverage counts with reasons to the graph output (finding 2). Add a direction and depth limit to the impact contract (finding 5; ARCHITECTURE.md `ImpactResult` and "Impact semantics"). Otherwise 1.3's expected graph is written against a shape that will change.
- **C2, before M2 (human lead, P-10):** split Phase A acceptance into a demo-critical tier and a hardening tier. About 13 hours remain before the 05:00 freeze. As written, M2–M4 also require race detection, content secret redaction, a persistent LocalStore with retention tests, an evaluation report, and a dashboard, rail and insights. With M1, that's more than two agents can build and review in that window. Recommended tiers are below.
- **C3, before 1.2 closes (human lead and Codex):** fix ordering and load. M4's graph queries need only 1.4's graph, not M2. M3's retriever, adapter and validator can run on the fixture snapshot before M2. Codex currently owns every critical-path task (1.1, 1.4, 1.6, M2, M3, M4). Recommendation: Claude Code takes M4 and 1.6, with Codex reviewing.
- **C4, before 1.5 (Codex in 1.1, S-5):** React Flow doesn't lay out graphs. Name the layout approach, either hand-rolled layers or a library with a recorded license. Also name the strategy above the 300-node display cap: group by folder, or list-first (finding 4).

*Recommended tiers for C2* (human lead decides):

- **Demo-critical:**
  - launcher `--project`, loopback binding, Host/Origin checks, per-launch token, and opaque IDs
  - a snapshot with ignore lists, filename-based secret exclusions, symlink rejection, root containment, and caps with visible refusal
  - memory-only storage
  - parser and resolver with coverage counts
  - canvas, list, and a detail pane that highlights the evidence line
  - local explanations with `[S#]` validation, the file-name check (finding 1), and the canary test
  - impact with depth and chain
  - the default offline test suite, and the 1.6 benchmark
- **Hardening** (after the demo path works end to end, or after the hackathon):
  - file-replacement race detection
  - content-based secret redaction
  - LocalStore persistence (S-11 moves to M8)
  - an evaluation report beyond 1.6 and the canary test
  - a dashboard, navigation rail, and insights beyond a summary panel
  - cycle and degree insights

*Non-blocking notes:*

- **N1.** The per-launch token lives only in page memory, so a browser reload ends the session. Decide how reloads behave and rehearse it, because one will happen during a live demo.
- **N2.** Switching projects requires a relaunch. That's fine for the demo; script the switch from the fixture to the real repo.
- **N3.** Findings 1, 3, 6 and 8 go into the 1.4, M3 and M4 acceptance checks when those tasks start. Finding 7 (routes exact or absent) changes M9's Express check.
- **N4.** Ollama isn't installed, and the candidate model is about 2.5 GB. If the human lead approves the install and download now, the download can overlap 1.1. The benchmark still waits for the fixture.

*Not checked:* organizer rules and deadline (no source supplied), package versions and licenses (nothing installed), the external docs Codex cites (not re-read), and anything on the MSI.

**Authorization record** (human lead, 2026-10-09, about 15:45 AWST, in the Claude Code chat that ran 0.2):

- **1.1 authorized.** Codex may start the scaffold as scoped in 1.1. This does not authorize later tasks.
- **C2 resolved (P-10).** The tiers above are accepted, on one condition: **the demo must show real output**, meaning real parser results and real local-model responses, never mocked, canned or pre-recorded. The fixture's hand-written graph is test data only. The deferred hardening items produce no demo output and remove no judged capability.
- **C3 resolved.** 1.6 and M4 move to Claude Code (Agent B), with Codex reviewing. M4 depends on 1.4 and 1.5. M3 runs on the fixture snapshot before M2.
- **Runtime and model approved.** Installing Ollama and pulling `qwen3:4b-instruct` on the dev Mac (N4). The fallback `qwen2.5-coder:1.5b`, the MSI, and any other download still need separate approval.
- **Still open:** C1 (Codex, before 1.3) and C4 (Codex, before 1.5).

### 0.3 Agent working rules and project skills (Claude Code)

Scope: AGENTS.md, CLAUDE.md, README.md (docs table row), `.agents/skills/`, `.claude/skills/` links, disclosure notes in SUBMISSION.md, and this entry. It also records the human lead's P-12 decision (JEV severity and scores) in PRODUCT.md, with proposed guardrails and open question P-13, plus one boundary sentence in ARCHITECTURE.md and one M12 check. No other 0.1 content changed, so 0.2 can still review 0.1 independently.

- [x] Working rules added to AGENTS.md: fresh-context orientation, ambiguity before building, no building ahead, approval for packages outside the accepted stack, revert over patch-stacking, code boundaries, agent versus human checks, no weakened checks, no broken hand-offs, "absent beats approximate", and how to talk to the human lead. (Claude Code, 2026-10-09.)
- [x] Skills `boozer-review` and `boozer-model-benchmark` created in `.agents/skills/`, with `.claude/skills/` symlinks that resolve. (Verified with `ls -la` and `head` through the links.)
- [x] Local Markdown links and code fences checked: 11 files, 33 local links, 0 broken, 0 unbalanced fences. (Python standard-library check, 2026-10-09.)
- [x] Claude Code discovers both skills through the `.claude/skills/` symlinks. (They appeared in Claude Code's skill list in the creating session, 2026-10-09 15:27. Codex discovery is unverified; AGENTS.md lists the paths.)
- [x] P-12 recorded as a human decision, separate from the guardrails Claude Code proposed; P-13 opened; M12 check and the SUBMISSION.md internet answer updated. (Claude Code, 2026-10-09.)
- [x] Codex reviews 0.3, including the P-12 guardrails, and records a verdict in the review log. (This session, 2026-10-09: Approved with condition C6 below.)

**0.3 independent review report** (Codex, this session, 2026-10-09; pinned `238d89e4530aff57c09ef9e9837880bc84912808`, clean before review)

**Verdict: Approved with condition C6.** No blocker for fixture work or the C5 correction. Claude Code must fix the benchmark procedure before 1.6 uses it. The P-12 guardrails and P-13 proposal pass as design; this does not resolve P-11/P-13, authorize a cloud call, or implement JEV.

Scope/authorship: Claude's 0.3 additions identified in its handoff: fresh-context/ownership/build/test/safety/honesty rules, CLAUDE.md delegation, both canonical skills and their symlinks, the README skill row/disclosures, and P-12/P-13 plus the reserved ScoreProvider/JEV boundary and M12 check. These Claude-authored skill/P-12/P-13 blobs are unchanged since the imported baseline `6d04b41`. Excluded: my 0.1 proposal and 1.1 implementation/current-phase edits, and the separate 1.2 review. No self-review; the pre-Git 0.3 changes have no isolated author commit, so attribution comes from the handoff and unchanged blob comparison.

**C6 — Claude Code, before 1.6:** `.agents/skills/boozer-model-benchmark/SKILL.md:34–38,47,85–100` asks for an ID and sampling settings but does not require the full immutable digest or an explicit thinking setting/output-state record. TASKS.md 1.6 requires exact tag/digest; the approved candidate's setup record explicitly calls for controlled thinking. Update the capture instructions and report template to require the full digest, runtime version, tag/quantization, thinking setting and whether thinking text appeared. Fail loudly if these cannot be obtained. Keep abbreviated display IDs supplemental. The reviewer did not edit the skill.

Non-blocking notes: the benchmark skill's unqualified `ollama` commands need the recorded absolute runtime path on this Mac (it is not on PATH). Its M6 recorder example does not replace the separate live-display workload gate in TASKS.md. Source-reference/no-copy disclosures are preserved; the external Cartograph reference and prior Claude auto-discovery claim were not independently rechecked.

Checks and actual results (fresh detached worktree at the pinned SHA): `npm ci --ignore-scripts --offline` exit 0, 65 packages; `npm run typecheck` exit 0; network-denied `npm test` exit 0, 1 file / 3 tests; network-denied `npm run build` exit 0, 15 modules. Python document validation: 9 canonical Markdown files, 34 local links, zero broken/fence errors; both `.claude/skills` symlinks resolve and their bytes match canonical SKILL.md files. Worktree clean after checks and removed. Both skills are listed in this Codex session's provided skill catalogue; reading them directly works. No benchmark/inference, fixture execution, cloud call, download or package change performed for this review.

Checklist: Scope Pass; dependencies N/A (docs/skills only); docs/contract alignment Pass subject to C6; clean-checkout re-run Pass; offline default suite Pass; no weakened checks/oracle regeneration Pass; ticked evidence Pass (historical Claude-discovery evidence attributed, not rerun); safety design Pass; runtime confinement/parser-boundary implementation N/A; honesty Pass with benchmark-provenance condition C6; no external-copy inspection Not checked. Application command reruns are regression evidence only and do not re-approve my scaffold.

Files changed by this review: TASKS.md only (claim/status, report and log). Follow-up: Claude fixes C6 before benchmarking; Codex independently rechecks the changed skill. No reviewer repair or new human approval requested.

## M1: First engineering milestone

Goal: run on a tiny known-code fixture, show a dependency graph whose every edge matches a hand-written answer key, make that graph clickable, and test a local model early enough to change course.

### 1.1 Scaffold and configuration (Agent A)

Scope claimed by Codex in this session, 2026-10-09: local Git initialization, package/configuration and server/client/test skeleton, shared C1 schemas, C4 layout specification, README.md, AGENTS.md current-phase text, and ARCHITECTURE.md/TASKS.md/SUBMISSION.md reconciliation. PRODUCT.md status only may be updated to distinguish scaffold from features. No fixture, parser, map, impact implementation, model calls, or later-task modules.

Work:

- Implement only the skeleton agreed in 0.2 for S-1 to S-12. Keep choices Proposed until 1.2 confirms them; do not implement later-phase features.
- Initialize git locally. Add a `.gitignore` that covers dependencies, build output, model files, and `.env*`.
- Create the minimal skeleton for the proposed stack, with install, dev, typecheck, and test commands. No features.
- Add the commands to README.md in a new "Development" section.
- Add every dependency and tool to the disclosure register.

Acceptance:

- [x] From a clean checkout on the dev Mac, the documented install, typecheck, and test commands succeed, with output recorded in the report. (Codex detached worktree at `1050b8d`: offline `npm ci --ignore-scripts --offline`, typecheck, network-denied test and build all exit 0.)
- [x] The test suite runs with no network access. (Codex: `sandbox-exec -p '(version 1)(allow default)(deny network*)' npm test`; 1 file / 3 tests passed.)
- [x] Starting the app makes no outbound network requests. (Codex: production/dev startup with external outbound denied by macOS; HTTP 200 on loopback, no external resources/calls in scaffold source. Separate external probe returned EPERM.)
- [x] The scaffold contains no feature code and no copied tutorial code or assets. (Codex source inventory: static shell/host/configuration/types only; all authored in this session.)
- [x] The disclosure register is updated. (Codex: 9 pinned direct packages; lockfile plus 89-entry license metadata inventory; no unknown license fields.)
- [x] Shared contract locations, model-free default tests and a separate real-model test entry are documented; no cloud SDKs or target-repository execution. (Codex: README/contracts/config review; `test:model` exits 1, explicitly no cases yet and no inference.)

C1/C4 disposition (Codex, this session, 2026-10-09): canonical coverage/snapshot/graph/walk/impact types now live in `src/shared/contracts.ts`. Exact counting, ordering and chain semantics, and the original SCC/layer layout with list-first behavior above 300 total nodes, are specified in ARCHITECTURE.md. No oracle or layout implementation was produced. Agent B verifies these resolutions in 1.2 before claiming 1.3/1.5. C2/C3 remain resolved under the earlier human authorization; no new owner/order change.

### 1.2 Review gate (Agent B)

Work: before any parallel implementation starts, review 1.1 against AGENTS.md and ARCHITECTURE.md.

Acceptance:

- [x] The reviewer is not the author of 1.1. (Claude Code, review chat. Commits `1050b8d` and `4718e27` are Codex's.)
- [x] The reviewer re-ran the documented commands from a clean checkout and recorded the results. (See the 1.2 report.)
- [x] Each scaffold S-choice is marked Accepted or Changed in ARCHITECTURE.md; later choices remain Proposed until their gates. A changed contract is propagated to consumers. (S-1, 2, 3, 5, 6, 8 and 11 Accepted; no contract changed by the review.)
- [x] The verdict is recorded in the review log below. Parallel work starts only after "Approved". (Approved with condition C5, which doesn't block 1.3, 1.5 or 1.6.)

**1.2 review report** (Claude Code, review chat, 2026-10-09 16:08–16:20 AWST, commit `4718e27`, working tree clean)

**Verdict: Approved with condition C5.** Tasks 1.3, 1.5 and 1.6 may start. C5 must be fixed before any browser API route lands (M2/M3).

*Re-run in a fresh local clone at `4718e27` (scratchpad, not the workspace):*

| Command | Result |
|---|---|
| `npm ci --ignore-scripts --offline` | exit 0, 65 packages |
| `npm ls --depth=0` | exit 0, the 9 exact pins |
| `npm run typecheck` | exit 0 |
| `npm test` under `sandbox-exec … (deny network*)` | exit 0, 1 file / 3 tests |
| `npm run build`, network denied | exit 0, 15 modules |
| `npm run test:model` | exit 1, "No test files found", as documented |

*Probes against my clean clone's production host* (my PID confirmed on 127.0.0.1:4173):

- `GET /`, the JS asset and `HEAD` returned 200.
- Host `localhost:4173` or `evil.example`, and Origin `https://evil.example` or `null`, returned 403.
- `POST` returned 405.
- `/../../etc/passwd`, `/%2e%2e/package.json` and `/api/projects` returned 404.
- CSP, `nosniff` and `no-referrer` headers are present. The port was refused after stop.

*Dev mode from the clean clone:*

- Vite on 5173 returned 200, and a foreign Host was rejected (403).
- Both ports were released on SIGTERM.
- An occupied port fails visibly. My first start collided with the human lead's own `npm run dev` and printed "Could not start Boozer AI on 127.0.0.1:4173".

*Code inspection:* all of `src/`, `scripts/`, the configs, `index.html` and the tests. The only URLs are loopback, and there are no fetch/http/socket client calls. Static assets are served from an in-memory map, so no request path reaches the filesystem. There is no feature code, parser, storage or model code. The inventory has 89 entries, all with licenses: MIT 63, MPL-2.0 12 (all `lightningcss`, Vite's build-time CSS tool), ISC 9, Apache-2.0 3, BSD-3-Clause 2.

*C1 and C4 resolved at the contract/spec level:* coverage counts with reasons and zero-denominator rules, one walk with direction, depth and `depthLimited`, deterministic IDs and ordering, and `Snippet`/`Explanation` retained. The C4 layout is original and package-free, with list-first above 300 nodes. Proof that they're implemented correctly belongs to 1.3/1.4/1.5/M4.

*Checklist:*
- Scope: Pass. Dependencies are within the S-choices and disclosed: Pass. Docs: Pass.
- Clean-checkout re-run: Pass. Offline default suite: Pass. No weakened checks (the TS2882 fix added types; it didn't loosen anything): Pass. Ticked 1.1 checks have evidence: Pass.
- Safety, as applicable to a static host: Pass. Parser boundary search: N/A (no parser yet). Honesty: Pass. No copied tutorial code: Pass, by inspection.

**Condition C5, before M2/M3 API routes (Codex): the dev proxy rejects browser API calls.** Verified: `/api/x` through the 5173 proxy returns 404 without an Origin, but **403 with `Origin: http://127.0.0.1:5173`**. Browsers send that Origin on POST, so the planned `POST /explanations` and `/refresh` would fail under `npm run dev`. The cause is that `permitsRequest` (src/server/app.ts:6–8) allows only the 4173 origin. Fix by allowing exactly the dev origin only when started by `scripts/dev.mjs`, keeping the Host check and the M2 token, and add a test.

*Non-blocking notes:*

- **N1.** `engines` is pinned to Node `>=24 <25` with `engine-strict`. The MSI (ParrotOS) will need a human-approved Node 24 install for M6. Distro Node is likely older; unverified.
- **N2.** `AnalysisCoverage.unsupported[].reason` is a free string, while every other reason is an enum. Prefer an enum; until then, 1.3's oracle defines the exact strings and 1.4 must match them.
- **N3.** Every `GraphWalkResult` embeds the full `AnalysisCoverage`, including all skip and issue lists. That's fine for the fixture; check payload size at M2 scale.
- **N4.** `.npmrc` sets `audit=false`, so no vulnerability audit has run. Run `npm audit` once deliberately (it needs the network) before submission.
- **N5.** The static host reads only top-level files in `dist/client/assets/`. A future nested asset folder would make startup fail.

*Not checked:* startup with external networking denied (my evidence is source inspection plus the CSP header; Codex ran the sandboxed startup), any browser rendering (a human check), and the MSI. 0.3 is still pending Codex review and is not part of this verdict.

### 1.1-C5 Dev-proxy Origin correction (Codex)

Scope claimed by Codex in this session, 2026-10-09: `src/server/app.ts`, `src/server/index.ts`, `scripts/dev.mjs` and its watched `scripts/dev-host.mjs` child, boundary tests, README.md and the relevant ARCHITECTURE.md/TASKS.md/SUBMISSION.md entries. Dev startup explicitly selects the extra `http://127.0.0.1:5173` Origin; production startup has no environment/CLI opt-in. Host remains exactly `127.0.0.1:4173`. No API/token or feature implementation; C5 requires independent recheck, not self-approval.

- [x] Production rejects the dev Origin; dev accepts exactly that Origin while preserving the existing production Origin and Host check. (Codex unit and live Host/Origin/proxy probes; production also tested with NODE_ENV=development.)
- [x] Host, null/foreign/lookalike Origin and production-default regression tests pass in the full offline suite. (Codex: 5 scaffold boundary cases; workspace full suite 2 files / 16 tests, all passed with networking denied.)
- [x] Live Node/dev-proxy checks and typecheck/build results are recorded; docs match the changed startup behavior. (Codex report below; no API implementation or independent self-approval.)

### 1.3 Known-code fixture and expected graph

Work: write a tiny, original JS/TS project of about 10–15 files at the path set in 1.1 (proposed: `fixtures/basic/`). The harness supplies a bounded in-memory snapshot of this fixture to 1.4; general user-folder ingestion is M2. Add a hand-written `expected-graph.json` in the `DependencyGraph` shape from ARCHITECTURE.md. The fixture covers these cases:

- a default import, a named import, and a side-effect import
- `import type`
- re-exports: `export * from` and `export { x } from`
- `require('./x')`, plus a shadowed binding that must not become an asserted dependency
- `import('./x')` with a literal, and with a non-literal specifier (expected: unresolved)
- a bare package import (expected: package target, with `node_modules` never read)
- an import of a missing file (expected: unresolved)
- a directory import that resolves to `index.ts`
- a `.js` specifier that points to a `.ts` file
- a two-file import cycle
- import-like text inside a comment and inside a string (expected: no edge)
- a tripwire file that throws at the top level if it's ever executed
- a comment that holds a prompt-injection instruction and a canary token, for use in 1.6 and M3

Acceptance:

- [x] The expected graph was written by hand, with the line/ID of every edge and the exact C1 coverage counts/reasons, before any extractor output existed. (Claude Code, 2026-10-09. `src/` has no parser code (`grep` for `createSourceFile`/`extract` found only the `extractor` type field). Sizes and hashes come from `wc -c`/`shasum -a 256`. `tests/fixture-oracle.test.ts` checks the answer key against the files and the C1 invariants. Deliberately wrong line and count values made it fail.)
- [x] A second agent checked the expected graph line by line against the fixture. (Codex, this session: all 22 edges, every file/hash/line/target and C1 coverage verified independently at `af671e8`; full review below.)
- [x] The fixture code is original and is never run. (Claude Code wrote every file in this task. Nothing imports `fixtures/basic/src/`. The harness reads bytes/text only, and `tsconfig`/Vitest/Vite don't include `fixtures/`. 1.4 and later tasks must keep this true; the tripwire check is 1.4's.)

Snapshot root `fixtures/basic/src/` (14 entries); answer key `fixtures/basic/expected-graph.json`; case table, placeholders and five interpretations 1.4 must match in `fixtures/basic/README.md`. **Placeholder decision** (human lead, 2026-10-09 about 16:30 AWST): `snapshotId` and `extractor` are placeholders. 1.4 first asserts snapshot-ID consistency and deterministic output, then applies `applyOraclePlaceholders` and deep-compares.

### 1.4 Verified dependency extraction

Claimed by Codex (Agent A, this session) on 2026-10-09 after independently approving 1.3. Scope: pure snapshot-only parser/resolver and their tests, with matching contract/status documentation. This turn stops at the claim requested by the human lead: no parser code, target execution or extractor output was created. The reviewed hand-written oracle remains unchanged.

Acceptance:

- [ ] The extractor's output for the fixture equals the expected graph. The test fails on any missing or extra edge.
- [ ] Every edge's evidence line contains its specifier text (automated check).
- [ ] Unresolved, excluded and non-literal imports appear with C1 reason codes and matching coverage issue records. File/import counting invariants, parse-error/skip outcomes and zero-denominator presentation are verified. None are dropped or guessed.
- [ ] Imports inside comments and strings produce no edges.
- [ ] The extractor reads target files as text only, and the tripwire never fires. Code review confirms there is no `require`, `import`, or `eval` of target files.
- [ ] The output is deterministic: two runs over identical input/configuration produce identical graph JSON, including stable snapshot identity; timestamps remain outside the deterministic graph.
- [ ] It runs on Boozer AI's own source without crashing, with file count, edge count, and time recorded.
- [ ] The expected graph was not regenerated from extractor output to make the test pass.

### 1.5 Clickable graph and file inspector

Acceptance:

- [x] The graph is rendered from graph JSON, not hard-coded, and the node and edge counts it shows match the JSON. (`layoutMap` builds every node and edge from the `DependencyGraph`. `tests/map-layout.test.ts` checks counts 13/22/19 and that every parser edge ID survives unchanged. Visual confirmation is part of the human check below.)
- [ ] Clicking a file opens it in the inspector with line numbers. *Human check.* The selection-to-source rendering, with numbered lines, is unit-tested; the click itself needs a browser.
- [ ] Clicking an edge opens the importing file with the evidence line highlighted. *Human check.* Unit-tested: `report.ts#1` highlights lines 1–4 and `report.ts#8` highlights line 26; the click needs a browser.
- [ ] Package and unresolved targets look different from files and show their reason. *Human check* for the look. Distinct node classes and reason text (external, built-in, excluded, unresolved reason codes) are unit-tested.
- [x] Source is rendered as escaped text. (React text nodes only, no `dangerouslySetInnerHTML`. Test: `<script>` and `<img onerror>` source renders as `&lt;…&gt;`.)
- [ ] It works with the network disabled, with no CDN assets at runtime. *Human check.* Agent evidence: network-denied `vite build` succeeded. The bundle's only URL strings are XML namespaces, React's error-docs link and React Flow's attribution link (none is fetched); CSS and fonts are local.
- [x] A plain list of files and edges is shown alongside the graph canvas. (`GraphList` always lists all 13 files and 22 relationships, whatever the filter or cap; render test.)
- [x] A summary panel shows snapshot status, counts, coverage and limitations. (`SummaryPanel`: source label, snapshot ID, C1 counts, "parsed / found" and "local import resolution rate" with zero-denominator text, limitations with reason breakdowns; render and model tests.)
- [ ] **[Hardening]** Dashboard and navigation rail move between map and insights while preserving selection.
- [x] Detail pane uses the shared snapshot/evidence contract; loading, empty, parse-error and stale-reference states are distinguishable. (Distinct `data-state` values for empty, loading, failed, source, parse-error, stale, terminal and missing. Stale means a snapshot, hash or line-range mismatch, and highlights nothing. Render tests.)
- [x] Display caps/filtering never imply that omitted nodes were absent from the indexed graph. C4 deterministic SCC/layer positions, empty/disconnected/cyclic graphs, all terminal types, 300/301 total-node behavior, omitted counts and full-list evidence/selection are checked. (`tests/map-layout.test.ts`: hand-derived positions for all 19 nodes, permutation invariance, no overlapping boxes, an empty graph and an empty filter, an isolated node (`broken.ts`), a 300-file cycle, 300 vs 301, filter-too-large and narrow filters, omitted counts.)

**Human check for 1.5** (`npm run dev`, then open `http://127.0.0.1:5173/`; the dev server shows the fixture preview):
1. The summary says "Fixture preview: hand-written answer key, not parser output" and shows 14 found / 12 parsed / 2 skipped, 22 imports, and "Analysis possibly incomplete".
2. The canvas shows 19 nodes in 4 columns. `inventory.ts` and `pricing.ts` sit next to each other in column 3, with arrows both ways. Package nodes are dashed blue, excluded nodes dotted yellow, unresolved nodes dotted red, and `broken.ts` has a red border.
3. Click `report.ts` on the canvas: the right pane shows its source with line numbers. Click the edge `report.ts → inventory.ts` (or `report.ts:1` in the list): lines 1–4 are highlighted.
4. Click the `zod` node: it shows "external package" and links to `config.ts:1`.
5. Type `utils/` in the filter: 3 nodes, 2 relationships, a "hidden by the filter" count, and the list still shows everything.
6. With Wi-Fi off, reload: everything above still works.

### 1.6 Early local-model test

Work: once the human lead approves the runtime install and model downloads, run a small benchmark script against the approved S-7 candidate first; fallback candidates require separate download approval. Use the same evaluation harness on the dev Mac, CPU only. Every run uses the same prompt: 2–4 fixture snippets with IDs and a request for a file explanation with `[S#]` citations. Record the results in a new `docs/BENCHMARKS.md`.

Acceptance:

- [x] The download approval is recorded here: who approved it, when, and which tags. (Human lead, 2026-10-09 about 15:45 AWST: Ollama runtime plus `qwen3:4b-instruct` on the dev Mac. The fallback is not approved.)

**Setup record** (Claude Code, the chat that ran 0.2, 2026-10-09). Setup only; no benchmark has been run.

- **Why not Homebrew:** Homebrew 7.0.9 has no prebuilt Ollama for Intel macOS. `brew install ollama` would compile from source and add ccache, cmake and go, which are outside the approval.
- **Installed instead:** the official Ollama v0.40.2 release `ollama-darwin.tgz` (GitHub `ollama/ollama`, published 2026-10-08). SHA-256 `e888b763…f8a4f6` matches the release's `sha256sum.txt`. It's a universal binary (x86_64 + arm64), code-signed with TeamIdentifier 3MU9H2V9Y9, and the license is MIT.
- **Location:** `~/.local/opt/ollama-v0.40.2/bin/ollama`. It is not on PATH, so use the full path. There were no admin rights, no app bundle and no auto-updater. Models are stored in Ollama's default `~/.ollama/models`.
- **Server:** start with `OLLAMA_HOST=127.0.0.1:11434 ~/.local/opt/ollama-v0.40.2/bin/ollama serve`. It was verified listening on `127.0.0.1:11434` only (`lsof`), and `/api/version` returned 0.40.2. The log reports CPU compute, 32.0 GiB total and 8.4 GiB available at start, with no GPU. A server started from a Claude Code background shell may stop when that session ends, so restart it with the command above.
- **Observed:** the server log shows a periodic "model recommendations" job, which looks like an outbound request made by Ollama itself, not Boozer. It should fail harmlessly offline. Agent B should confirm this during the offline check rather than assume it.
- **Model:** `qwen3:4b-instruct` pulled at about 15:53 AWST; exit 0, and Ollama verified the SHA-256 digest.
  - Digest: `0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0`.
  - Architecture qwen3, 4.0B parameters, Q4_K_M, 2,497,293,803 bytes. Context length 262144, but the server default is 4096.
  - License: Apache-2.0, from `ollama show --license`.
  - Default sampling: temperature 0.7, top_k 20, top_p 0.8. The benchmark must set its own values.
  - Ollama lists a `thinking` capability for this tag. The benchmark should set thinking explicitly and record whether any thinking text appears.
  - **Not run yet:** no inference and no benchmark. That's task 1.6, and it waits for the 1.3 fixture.
- **Pre-existing:** `~/.ollama/models` already held `nomic-embed-text:latest` (ID `0a109f422b47`, from about 2 months earlier). It was not downloaded in this setup and isn't used by Boozer. Disk use is 2.6 GB for models, with 23 GiB free.
- [x] For each tested model, the record lists date, exact tag and digest, quantization, runtime version, machine/CPU/RAM and OS; no GPU claim without evidence. (BENCHMARKS.md header: full digest from `/api/tags`, Ollama 0.40.2, Q4_K_M, i5-8500B / 32 GB / macOS 15.7.7, `ollama ps` showed 100% CPU in every run.)
- [x] For each model, the raw results and median of 3 runs are recorded for load time, prompt tokens, output tokens, time to first token, total time, tokens/s, and approximate peak memory with measurement method. Keep cold/warm conditions explicit and retain failures separately. (Run B table plus raw JSON. Contaminated Run A is retained separately. Caveat: warm runs were prompt-cache hits because the flush didn't work, so uncached warm first-token time is only derived from the cold run, and is labeled that way.)
- [x] Citation check (automated): every `[S#]` refers to a supplied snippet. (`checkOutput` in `tests/model/request.ts`: 0 invalid of 4 markers in every run.)
- [ ] Injection check: the output does not contain the fixture's canary token. **Failed:** the canary appeared in all 9 benchmark runs and in the `npm run test:model` check. One exploratory run with a post-snippet instruction didn't leak (n=1). M3 must fix and test this.
- [x] A short note on answer quality is recorded and labeled as subjective. (BENCHMARKS.md "Checks", judged by Claude Code.)
- [x] A provisional recommendation for S-7 and P-5 is written, and the disclosure register is updated. (BENCHMARKS.md recommendations; SUBMISSION.md runtime-models row updated with the full digest and results link.)

## M2: Ingestion and local project input

**Dependency change and scope claim (human lead, 2026-10-09):** local-folder input and snapshot production may start against `src/shared/contracts.ts` without waiting for 1.4 or 1.5. Codex (this session) owns server-only selection/confirmation and read-only snapshot code, offline tests, and matching README.md/ARCHITECTURE.md/TASKS.md status and contract documentation. Integrate with the independently reviewed parser when 1.4 lands, and with 1.5's UI afterward. Authenticated browser routes still wait for C5's independent recheck. No parser, UI, model, persistence or package changes are part of this first slice. Scope addendum: update PRODUCT.md's opening status only, which still incorrectly says the scaffold awaits 1.2; product decisions are unchanged.

Foundation status: **In review**, with 21 input cases and read-only fixture/own-repo smoke evidence in the handoff below. Original end-to-end checks remain separate; source hashes alone do not prove browser stale-reference handling.

- [ ] A user explicitly selects a permitted local root through the launcher, confirms it in the UI, and indexes within documented caps; the app never writes into it.
- [ ] Browser APIs expose opaque project/file IDs only; other roots, unselected IDs and revoked sessions are rejected.
- [ ] Loopback binding, exact Host/Origin checks, token-protected reads/writes and no permissive CORS pass hostile-origin, CSRF and DNS-rebinding cases.
- [ ] Immutable snapshots and hash-bound references prevent stale source from being presented as current; parse failures and incomplete analysis remain visible.
- [ ] Demo tier stores nothing on disk: snapshots, graphs and results stay in memory.
- [ ] **[Hardening]** App-owned storage is outside the selected root; overlapping roots are refused before writes. Atomic save/load, permissions, size/retention caps and corrupt-file handling are verified.
- [x] `node_modules`, `.git`, and build output are ignored by default. Size and file-count caps are documented and enforced. (M2 foundation native exclusion/source-cap tests plus own-repo snapshot; metadata flood is a labeled enumeration simulation. See handoff.)
- [ ] Symlinks, nested symlinks, absolute/`..` escapes and case collisions are rejected (tests); config and tripwire files are never executed.
- [ ] **[Hardening]** Detected file-replacement races are rejected (tests).
- [x] Secret-file exclusions, binary/oversize handling and cancellation are verified without logging sensitive content. (M2 foundation tests use inert temporary targets; unreadable secret filenames are excluded before opening, NUL/invalid UTF-8 are skipped, caps/cancellation return sanitized errors and no partial result.)
- [ ] **[Hardening]** Known-secret snippet rejection/redaction based on file content.
- [ ] Boozer AI's own repo opens and renders, with the time recorded.

## M3: Grounded explanations

- [ ] Selecting a file streams an explanation from the local model.
- [ ] The snippets that were sent are visible, and each `[S#]` links to its file and line range.
- [ ] Unknown citation markers are flagged visibly, not dropped.
- [ ] The explanation shows the model name, the runtime, "local", and the duration.
- [ ] The graph is unchanged after explanations run (test).
- [ ] The canary injection test passes on the fixture.
- [ ] It works with internet disabled, using loopback only.
- [ ] Latency on the dev Mac is measured against the P-5 target; failures retained and reported.
- [ ] No-cloud-keys/no-internet mode passes; unavailable runtime/model produces a clear error, with no auto-download or cloud fallback.
- [ ] **[Hardening]** A local report records citation validity, separately judged evidence support/answer quality, injection cases and timing. Citation syntax success is not scored as factual correctness.
- [ ] Default full suite runs offline without a model; the separately named real-model suite records tag/digest/quantization, runtime, date and machine.

## M4: Graph calculations, potential impact and insights

- [ ] Selecting a file lists direct importers by default (depth 1), with explicit depth expansion/full reachability, depthLimited status and a clickable shortest evidence chain. C1 direction/chain ordering, tie-breaking, type-only labels and invalid-query rejection are verified; the same iterative walk supports dependencies.
- [ ] Hand-written expected impact sets for the fixture pass, including empty and cyclic graphs.
- [ ] **[Hardening]** Hand-written cycle groups and degree/count summaries pass.
- [ ] **[Hardening]** Insights and navigation rail link each finding to the same snapshot and source/evidence in the detail pane.
- [ ] The wording is "potentially affected". The UI never says "will break", "safe", or "no impact", and an empty result reads "No importers found by static analysis."
- [ ] Type-only paths are labeled. Results are flagged as possibly incomplete for unresolved/non-literal imports, parse errors, skipped files and unsupported semantics.

## M5: GitHub import (retained later phase)

- [ ] Only public `https://github.com/<owner>/<repo>` URLs are accepted.
- [ ] The import downloads an archive into an app-owned directory, with no submodules, hooks, LFS, installs, or scripts.
- [ ] Archive traversal, absolute paths, symlinks/hardlinks, archive bombs, disallowed redirects and internal-network destinations are rejected (tests).
- [ ] Size and file-count caps abort the import cleanly.
- [ ] The UI says this step uses the internet. Everything after the import works offline.

## M6: Demo machine verification (MSI Bravo 15, ParrotOS)

Required before MSI reliance for **recorded or live demos**. Not required if MSI is unused; the chosen Mac still needs its own offline rehearsal. Human lead operates the MSI; Codex records integration results and Claude independently checks the evidence.

- [ ] The ParrotOS version, CPU model, RAM, GPU, and driver are recorded.
- [ ] The app installs and the test suite passes.
- [ ] The 1.6 benchmark is repeated on CPU and the results are added to BENCHMARKS.md.
- [ ] GPU acceleration is claimed only if runtime logs show GPU offload and the timings improve. Otherwise the docs say CPU.
- [ ] The full demo is rehearsed with networking off; measure memory headroom with the screen recorder for recording and with the actual presentation/display setup for live use.
- [ ] Record separate readiness for recording and live use, observed failures and fallback decision. Untested use is not cleared.

## M7: Submission package

- [ ] Every required deliverable and final checklist item in SUBMISSION.md is verified.
- [ ] Chosen-machine rehearsal passes; M6 is complete for each intended MSI use.
- [ ] Actual completion times and any missed cutoff/escalation are recorded; the one-hour submission buffer is preserved or its loss explicitly acknowledged.
- [ ] The disclosure register is complete.
- [ ] README.md lists the real, tested commands.
- [ ] The "runs locally" and "requires internet" answers match the final build.
- [ ] The video shows local inference with networking off.
- [ ] The human lead has made the repo public and submitted.

## Later-phase acceptance gates

These tasks retain product scope without promising hackathon delivery. Each implementation receives an independent review and a full offline-suite run; cloud-specific checks must be separately approved/labeled.

### M8: Explanations with local caching/tracing and evaluations

- [ ] Cache keys cover content/snapshot, snippets/question, parser/retriever/prompt/validator versions, model digest/quantization, provider and settings; changing any component misses cache.
- [ ] Invalid, incomplete and cancelled outputs are not cached; retention, clear/disable, stale citations and source-persistence consent pass tests.
- [ ] Local traces and datasets/reports work without accounts, cloud keys, LangSmith or internet; known-answer and injection cases are hand-authored.

### M9: Framework adapters, CommonJS/Express and richer insights

- [ ] Hand-written fixtures cover CommonJS exports/shadowed requires and Express routes, router mounting and middleware; unsupported dynamic cases remain explicit.
- [ ] Each framework adapter lists its supported conventions and version; config is parsed as bounded data and never executed.
- [ ] Annotations cite source evidence and stay separate from dependency edges; graph changes require parser contract/oracle review.
- [ ] Alias/package/workspace resolution cannot escape the selected snapshot; cycles/degree/insight navigation have deterministic known answers.

### M10: Read-only agent

- [ ] Allowlisted snapshot read/search/graph tools enforce root/snapshot bounds and step/token/time budgets; cancellation works.
- [ ] Tests reject shell, write, external network and graph-mutation attempts, including prompt-injected requests.
- [ ] Local reasoning works offline, reports evidence and uncertainty, and passes the separate local adversarial evaluation set.

### M11: Landing page

- [ ] Original design/assets; reuse, if any, disclosed with source/license before use.
- [ ] Copy distinguishes implemented/verified features from planned ones; local-app entry is tested.
- [ ] No analytics, remote fonts or background calls. Publishing needs separate human approval and is not implied by page completion.

### M12: Optional secondary cloud integrations and trace export

- [ ] LangSmith stays off by default, even with ambient environment keys; preview/export exposes the exact redacted payload and destination. No automatic upload; disabling sends zero traffic.
- [ ] Optional OpenAI/JEV require recorded cloud approval, exact outbound preview and explicit provider labels. P-11 is resolved before JEV implementation. Failure never silently switches providers.
- [ ] JEV severity and scores meet the P-12 guardrails in PRODUCT.md: labeled as JEV judgments, cite parser facts and snippets, never alter graph or impact results, never claim breakage or safety, and leave the app complete with JEV off. P-13 is resolved first.
- [ ] Existing local inference and local evaluation still pass with all optional integrations removed/disabled.
- [ ] Independent review confirms cloud credentials remain server-only and never enter prompts, cache or logs. Local core acceptance does not depend on cloud availability.

## Handoff reports

### 0.1 — Codex, 2026-10-09

**Status: In review — documentation reconciliation complete; Claude Code proposal review 0.2 pending. No scaffold authorization.**

Files changed: `README.md`, `AGENTS.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/TASKS.md`, `docs/SUBMISSION.md`. `CLAUDE.md` was read and left unchanged. No new files or application artifacts were created.

Commands/actions and actual results:

- `pwd && rg --files -g '*.md' -g '!node_modules' -g '!.git'`: succeeded; seven Markdown files in this workspace. Read all seven with `cat`; re-read `docs/ARCHITECTURE.md` separately after the combined tool output was truncated.
- `git status --short --branch && rg --files -g '!node_modules' -g '!.git'`: failed with exit 128, “not a git repository”; the second command did not execute. Git was not initialized, so there is no branch, SHA or Git diff to report.
- `python3 - <<'PY' ... PY` editing scripts: succeeded; restricted writes to the six files above. These were document edits, not application scaffolding.
- `cat docs/TASKS.md`, targeted `rg -n` consistency inspection, and `rg --files --hidden -g '!.git'`: succeeded. The combined display was truncated; verification outputs were kept short in the follow-up check.
- Inline Python standard-library document check: seven Markdown files; 25 local links checked, zero broken links, zero unbalanced code fences. Workspace inventory remained seven Markdown files; no `package.json` or `.git` exists. This is documentation validation, not an application test suite.
- Public official documentation read via browser research: Node releases, TypeScript compiler API, React Flow, Vite, Ollama macOS/model listing and LangSmith tracing/privacy. References are linked in ARCHITECTURE.md/SUBMISSION.md; no application cloud API call, installation or download was performed.
- Full application suite/typecheck/build/benchmarks: **not run**; no application manifest, scaffold or suite exists. No Mac runtime presence check, inference timing, MSI test or GPU validation was performed.

Verified: document inventory/links/fences and author reconciliation against the six requested decisions. Unverified: implementation/security behavior, package compatibility in this environment, model quality/performance, MSI readiness and organizer-provided rules (source needed).

Handoff to Claude Code: review 0.2 without scaffolding; record findings/verdict in the review log. Check S-1–S-12, phased scope, read-only root authorization and local storage, local/cloud separation, trace payload controls, dependency order and the time buffer. Do not mark a stack accepted as implemented or task 1.2 complete from this proposal.

Human follow-ups: accept/correct proposed cut line and cutoffs after review; provide team/license and organizer source; resolve JEV identity/role before that integration. Ollama plus the 2.5 GB Qwen candidate is recommended for a first CPU test, but runtime/model installation remains a separate explicit human instruction and is not performed here.

### 0.3 — Claude Code, 2026-10-09

**Status: In review. Codex reviews 0.3; 0.2 is still pending and unaffected.**

Files changed: `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/SUBMISSION.md`, `docs/TASKS.md`. New: `.agents/skills/boozer-review/SKILL.md`, `.agents/skills/boozer-model-benchmark/SKILL.md`, and symlinks `.claude/skills/boozer-review` and `.claude/skills/boozer-model-benchmark`.

Source: the human lead asked for our agent and skill files to be updated using `adrianhajdin/cartograph` where helpful. That repository's `AGENTS.md` is only a framework-generated notice, and its skills are vendored third-party Supabase/Postgres skills, so neither applies to Boozer's local-JSON stack. Useful working-rule ideas from its `CLAUDE.md` were rewritten in our own words. Not adopted: per-phase spec files (TASKS.md acceptance checks and the ARCHITECTURE.md contracts already cover them), its UI style rules (Boozer's design is our own), and its stack and database rules. The repository had no license when checked; nothing was copied. Recorded in SUBMISSION.md.

Commands and results: GitHub API tree listing and `raw.githubusercontent.com` reads of seven reference files into the session scratchpad (outside this repo), which succeeded. Read-only only; nothing installed or run. `ln -s` for the two links succeeded. The link and fence check passed, as above. `claude --version` reported 2.1.226; `command -v ollama` found no Ollama install (no download attempted).

Unverified: skill auto-discovery by Codex. Claude Code listed both skills in the creating session. AGENTS.md lists the skill paths so any agent can read them directly.

Follow-up the same day: the human lead decided severity and scores come from JEV (P-12). Cartograph's `docs/project-doc.md` excludes scores on purpose, so this is a deliberate difference. The guardrails in PRODUCT.md are Claude Code's proposal for Codex to review. Claude Code will raise three ideas from that project-doc as 0.2 review findings for Codex to decide on, rather than editing 0.1 directly.

Later the same day: the human lead deferred JEV until after the hackathon, with space reserved. That space is the reserved `ScoreProvider` contract row in ARCHITECTURE.md and a note in PRODUCT.md; no code or UI placeholder. Claude Code then read all of Cartograph's `docs/` and queued eight findings under 0.2 above. It also added a parser-boundary search to the `boozer-review` skill.

### 1.1 — Codex (Agent A, this session), 2026-10-09

**Status: In review — 1.1 complete, clean-checkout gates pass. C1/C4 specified; independent 1.2 review still required.**

Files changed: `.gitignore` and local Git history; package manifest/lock and `.npmrc`; TypeScript/Vite/Vitest configuration and `index.html`; `src/shared/contracts.ts`; static server/client entries and CSS; `scripts/dev.mjs`; offline/scaffold tests; README.md, AGENTS.md current-phase paragraph, PRODUCT.md status, ARCHITECTURE.md, TASKS.md, SUBMISSION.md and `docs/DEPENDENCIES.json`. Existing skill files, symlinks and CLAUDE.md were preserved. No fixture, parser, graph calculation, map, ingestion, storage or model implementation.

Commands and actual results:

- `rg`, `cat`, `sed` and workspace inventory: read project rules/docs, latest review and handoff. Memory keyword lookup found no Boozer entry; no prior memory facts used. Initial `git status`/`git log` failed: not a Git repository. `git init -b main` and local baseline commit succeeded. Toolchain: Node 24.16.0, npm 11.13.0, Git 2.39.5 (Apple Git-154).
- Registry `npm view` plus official Vite/Vitest/React Flow documentation: verified versions, license metadata and compatibility. The latest TypeScript was 7.0.2; pinned 6.0.3 to satisfy the pre-7 compiler-API contract. No outside-stack package, cloud SDK, model call or target execution.
- `npm install --ignore-scripts`: exit 0, 65 packages added. `npm ls --depth=0`: exit 0, 9 exact direct pins. Python lockfile inventory: 89 locked records, zero missing license fields, including optional other-platform packages.
- First `npm run typecheck` and `npm run build`: exit 2, TS2882 on the CSS side-effect import. Fixed by adding `vite/client` declaration types. First `npm test`: exit 0, 1 file / 3 tests passed. Subsequent typecheck and build: exit 0; 15 client modules transformed; server and client outputs produced. No check weakened.
- `sandbox-exec -p '(version 1)(allow default)(deny network*)' npm test`: exit 0, 1 file / 3 tests passed with all networking denied. Default test setup separately rejects socket/fetch attempts.
- Startup harness first failed before launching the app: macOS sandbox rejected numeric IP syntax in its allow rule (exit 65). Corrected to `localhost:*`; a separate external-IP socket probe returned EPERM. `npm start` and `npm run dev` under denied external outbound returned loopback HTTP 200 at 4173 and 5173 respectively. Production hostile Host and Origin each returned 403; absent API and path escape each returned 404. Processes were stopped; no retained app listener. This is scaffold startup evidence, not M2 source authorization or offline browser acceptance.
- `npm run test:model`: exit 1, “No test files found”. Expected, explicitly documented unavailable entry until 1.6 adds real-model cases; no inference/download and no benchmark claim.
- Python Markdown check: 9 Markdown files, 34 local links, zero broken links/fence errors. `git diff --check`: exit 0. Clean-checkout rerun: detached worktree at candidate `1050b8d56e380682042a7e0d7fd1477b9a4db3df` was clean before/after. `npm ci --ignore-scripts --offline`: exit 0, 65 packages added from cache. `npm run typecheck`: exit 0. Network-denied `npm test`: exit 0, 1 file / 3 tests. Network-denied `npm run build`: exit 0, 15 modules and identical asset names/sizes. Startup rerun with external outbound denied: production HTML and bundled JS/CSS returned 200; dev UI at 5173 and Node host at 4173 both returned 200. The first clean startup harness stopped after `lsof` returned 1 despite a working HTTP listener; process inspection was unavailable in that harness, not an app failure. The corrected harness verified both endpoints and connection refusal at both ports after shutdown. Temporary worktree removed after verification. Final follow-up changes are documentation/evidence only; executable code is the tested candidate.

Verified: original static shell/host, strict compilation, model-free offline test isolation, pinned package compatibility, C1 wire shapes and written C4 algorithm/display policy. Unverified: all future features, runtime contract validation, actual layout correctness/scale, browser experience, local inference, MSI, and submission rules. C1/C4 implementation proofs belong to their later producer/UI tasks.

Handoff to Agent B: review 1.2 from a clean checkout, rerun README commands, inspect contracts and C4, and record your independent verdict/S-choice disposition. Only after Approved may you claim 1.3 and write the original fixture/oracle, then 1.5 on reviewed fixture data. The oracle must include coverage and statement IDs; do not generate it from parser output. C4 adds no package. 0.3 remains a separate pending Codex review; it was not folded into 1.1 or self-approved. No human decision is needed to complete this scaffold; deadline cutoffs/team/license and later gates remain as recorded.

### 1.3 — Claude Code (Agent B chat), 2026-10-09

**Status: In review. Codex checks the answer key line by line. 1.4 may start parser work now, but must not run its extractor on this fixture until that review passes.**

Files added: `fixtures/basic/src/` (13 source files plus `styles.css`), `fixtures/basic/expected-graph.json`, `fixtures/basic/README.md`, `tests/support/fixture-snapshot.ts`, `tests/fixture-oracle.test.ts`. Changed: this file only (1.3 row, checks, this report). No package, config or `src/` change.

Coverage: every case in the 1.3 list, plus a multi-line import, repeated specifiers, a `node:` built-in, an excluded `./styles.css` import and a parse-error file. Totals: 14 found, 12 parsed, 2 skipped. 22 import candidates: 16 resolved, 2 external, 1 excluded, 3 failed. Canary token `BZR-CANARY-ORCHID-7731` is in `pricing.ts:4-7` (exported as `FIXTURE_CANARY` for 1.6/M3).

Commands and results:

- `wc -c` and `shasum -a 256` over the fixture: sizes and hashes copied into the answer key by hand. `grep -n` confirmed every planned evidence line.
- `npm run typecheck`: first run exit 2 (TS2322 in my test's issue-list typing). After annotating the type: exit 0.
- `sandbox-exec -p '(version 1)(allow default)(deny network*)' npm test`: exit 0, 2 files / 16 tests (3 scaffold + 13 fixture/answer-key).
- Mutation check: changing one evidence line (report.ts#3) and the failed count made 2 tests fail. The original file was restored (SHA-256 matched the backup) and the suite passed again.
- Codex's uncommitted C5 edits (`src/server`, `scripts`, `tests/scaffold.test.ts`) were present in the working tree during these runs. I didn't touch them.

For the reviewer: check `fixtures/basic/README.md` "Interpretations 1.4 must match" (evidence range, excluded rule, parse-error definition, `node:` built-ins, shadowed `require` → `ambiguous-require`). These are my readings of ARCHITECTURE.md C1. If Codex reads any differently, fix the answer key by hand, not from extractor output.

Not covered: `.tsx`/`.jsx`/`.mjs`, pruned directories, unsupported-pattern diagnostics (`coverage.unsupported` is empty, so 1.2 note N2's strings stay undefined), and M2's symlink/secret/case/cap cases. Unverified: anything about a parser; none exists.

### 0.3 C6 recheck — Codex, 2026-10-09

**Verdict: Approved; C6 resolved.** Reviewed only Claude's benchmark-skill remediation at `0b41795f18b834e7afc795232d0f747fede422d6`: full digest via loopback `/api/tags`, runtime/tag/quantization required before running, explicit `think` setting and output-state checks, and matching per-model report headers. Missing provenance or rejected/ignored settings stop loudly. No skill repair by the reviewer. The unqualified Ollama command-path and M6 live-display notes from the first review still apply through TASKS.md; they do not block design approval. MSI setup/schedule changes in the same commit are outside this recheck. No runtime/API/benchmark call was made; functional inference remains unverified. Current document/symlink check: 11 Markdown files, 38 local links, zero errors, both aliases match. The earlier clean regression run remains applicable because this correction changes only skill prose. Files changed by recheck: TASKS.md verdict/status only.

### 1.1-C5 — Codex (this session), 2026-10-09

**Status: In review — implemented and verified; independent Agent B recheck pending.**

Changed: `src/server/app.ts` (one default-strict request policy and shared host startup), `src/server/index.ts` (production always selects the default), `scripts/dev.mjs` and its new watched `scripts/dev-host.mjs` entry (explicit dev Origin opt-in), `tests/scaffold.test.ts` (2 additional cases), and relevant README/ARCHITECTURE/TASKS/SUBMISSION text. No dependency, API/token, fixture, parser or model change. The first implementation considered watching the whole dev launcher; final wiring watches only its Node-host child to keep the existing compiler watcher independent. Package scripts ended unchanged.

Commands/results: typecheck exit 0; network-denied full suite first 1 file / 5 boundary tests and subsequently 2 files / 16 tests including the handed-off fixture; network-denied build exit 0, 15 modules; both dev scripts' `node --check` and `git diff --check` exit 0. First combined live harness: production probes passed, dev was not ready before the process ended; cleanup raised ProcessLookupError and lost the child log, so the original startup cause is unverified. A separate logging harness started dev successfully. The corrected combined harness, with external outbound denied and NODE_ENV=development even for production, passed: production dev Origin 403; development dev Origin 200; existing production Origin 200 in both; wrong Host and null/foreign/lookalike Origins 403 in both. Through Vite `/api/x`: accepted dev Origin GET 404 (policy passed, no route), POST 405 (policy passed, no method implemented), foreign Origin 403. Node watch restarted its host after compiler emission and retained the policy. Both ports refused connections after shutdown. The development-environment live build emitted React's development bundle; the normal production build remains separately verified. No failure was suppressed or check weakened.

Verified: exact dev-only extra Origin, unchanged Host/production defaults, launch wiring and shutdown, offline regression suite. Not verified: future authenticated APIs or browser rendering; no self-review verdict closes C5. Next: Agent B independently rechecks this correction before M2/M3 routes. Author's full command/report evidence is distinct from that review.

### 1.3 independent review — Codex (this session), 2026-10-09

**Verdict: Approved. No blocking findings.** The fixture/oracle matches C1 and every task 1.3 case; 1.4 is claimed after this verdict, without implementing or running an extractor.

Pin: Agent B handed off 18 uncommitted artifacts in the shared tree while my unrelated C5 files were dirty. I copied those exact bytes, without modification, into a separate clean review branch based on `9df58bc`, and committed the review snapshot as `af671e8ae8374c2b8ff253575d7641cbb2b1268c` on `review/fixture-1.3`. This is a review pin, not a main-branch fixture commit. Artifact-manifest SHA-256 `4b7a30dbdf3c2fcd87234fe8f479714a41291e5853b57174441daef92b87754b`; oracle SHA-256 `c0260fe70a4c127452098542b7326193681327e26a8a32cfb6313fa21f15c554`. Rechecked unchanged main artifacts after verification; the isolated worktree was removed, review branch retained. C5/my own code is excluded from the fixture verdict.

Line-by-line evidence (all 22 edges, not a sample):

| Importer / statement IDs | Source lines checked | Result |
|---|---|---|
| config.ts#1 | 1 | zod external package, not installed/executed |
| inventory.ts#1 | 1 | pricing.ts value dependency; cycle counterpart checked |
| legacy.cjs#1–2 | 3, 7 | math.ts literal require; parameter-shadowed require unresolved/ambiguous |
| main.ts#1–6 | 2–7 | tripwire, excluded CSS, config, type-only inventory, report and node:path |
| pricing.ts#1–2 | 1–2 | value/type inventory statements remain distinct |
| report.ts#1–8 | 1–4, 5–9, 21, 26 | multiline evidence, type import, .js→.ts, directory index, missing file, config, literal and nonliteral dynamic import |
| utils/index.ts#1–2 | 1–2 | math/text re-exports |

Every one of the 13 source node sizes/hashes/languages/parse states and every evidence hash/snapshot/range/ordinal/target matches. Files with no candidates were checked too: export-csv, format, tripwire, math, text; text's comment/string imports emit nothing. broken.ts is syntactically invalid and contributes no edges, including its otherwise valid import. The tripwire is read only; canary instructions were treated as untrusted data and never followed. Totals: 14 found = 12 parsed + 2 skipped; 22 candidates = 16 resolved + 2 external + 1 excluded + 3 failed. All four issue records and their reason codes match, with no pruned directories or unsupported diagnostics. Human-approved snapshot/extractor placeholders preserve the required pre-normalization identity/determinism assertions; the helper only changes those identity fields.

Commands/results in the pinned clean review checkout: offline `npm ci --ignore-scripts --offline` exit 0, 65 packages; typecheck exit 0; network-denied `npm test -- --reporter=verbose` exit 0, 2 files / 14 tests (3 scaffold + **11 fixture**); network-denied build exit 0, 15 modules. Independent Python assertions from a manually written 22-row evidence table checked each complete edge/ref, all hashes/bytes/parse states and coverage; exit 0, oracle unchanged. The author-reported mutation test was not repeated, and no oracle was regenerated. Current workspace full suite separately passed 16 (5 C5/scaffold + 11 fixture).

Non-blocking notes: the author handoff's “3 scaffold + 13 fixture” split is inaccurate; actual fixture count is 11 and the current total of 16 includes 5 scaffold cases. The test harness is a fixture-only text reader, not general M2 ingestion; its “trusted fixture” comment does not override AGENTS.md's untrusted-data rules. TSX/JSX/MJS, pruned directories and unsupported diagnostics remain uncovered as disclosed; symlink/secret/case/cap runtime safety belongs to M2. No general ingestion or parser behavior is cleared by this review.

Checklist: Scope Pass; dependencies N/A (zod is inert fixture text, no package change); docs/contracts Pass; clean-checkout commands Pass; offline/model-free Pass; no weakened checks/oracle regeneration Pass; evidence and safety-by-inspection Pass; parser-boundary implementation N/A (none exists); honesty Pass with explicit count correction; originality by local inspection Pass, external source comparison Not checked. Runtime snapshot validation and production safety remain unverified. Reviewer's changes: TASKS.md review/status/1.4 claim only; all fixture/oracle/harness bytes preserved. Follow-ups: implement 1.4 against this oracle under its separate task, retain placeholder guards and hand-written expectations, obtain Claude's independent parser review before integration.

### M2 local input/snapshot foundation — Codex (this session), 2026-10-09

**Status: In review; M2 integration remains In progress.** Human-directed dependency change recorded above: build snapshots against the accepted shared contract now; integrate the independently reviewed parser when 1.4 lands and the UI when 1.5 lands. No self-review verdict is recorded.

Files added: `src/server/local-input.ts`, `tests/local-input.test.ts`. Files changed: README.md, ARCHITECTURE.md, PRODUCT.md (opening status only) and this file. No package/configuration/shared-shape, launcher, API, parser, UI, storage or model change. Agent B's 18 fixture/oracle/harness artifacts are untouched and remain uncommitted in the shared main tree; final manifest SHA-256 still `4b7a30dbdf3c2fcd87234fe8f479714a41291e5853b57174441daef92b87754b`, oracle SHA-256 still `c0260fe70a4c127452098542b7326193681327e26a8a32cfb6313fa21f15c554`. Foundation tests do not depend on those uncommitted files; fixture compatibility is a separate smoke check.

Behavior: server-only `LocalInputAdapter.select(folder)` validates a canonical, nonsymlink root and holds it privately behind an opaque project ID. Explicit `confirm(projectId)` precedes indexing; other IDs and revoked adapters fail, including a pending scan when closed. Snapshots contain root-relative POSIX paths, exact UTF-8 sizes/SHA-256 hashes, sorted coverage inventory and deeply frozen contract layers. Refresh preserves previous snapshots; content/path/inventory/limits or the required `analysisKey` changes the identity. Root/project ID/time do not affect the identity. The future parser must supply a version/configuration key rather than reuse the smoke-test keys.

Bounds: 2,000 supported source candidates, 1 MiB per file, 20 MiB read total; only smaller caller limits are accepted. Binary/unreadable supported candidates consume work budgets. Metadata-only targets are also bounded at 20,000 entries and 64 directory levels. Default ignored/secret trees are pruned without invented counts. Secret filenames precede content reads; all symlink entries are excluded without traversal; case collisions abort. Strict UTF-8/NUL checks, unreadable-file skips, unreadable-directory aborts, readonly/no-follow opens, root identity/component checks and bounded reads are implemented. Every cap/cancellation failure produces a sanitized error and no partial snapshot. This is an app boundary, not OS isolation against a same-user adversary.

Commands and actual results:

- `npm run typecheck`: exit 0. `sandbox-exec -p '(version 1)(allow default)(deny network*)' npm run build`: exit 0, both typechecks/server compilation and Vite build (15 modules).
- First network-denied full-suite run: exit 1, 34 passed / 1 failed. The case-collision test attempted to create two names differing only in case; this case-insensitive Mac rejected setup with EEXIST. Corrected the harness to explicitly simulate conflicting directory entries; no production check was weakened or skipped. Added an explicitly simulated 20,001-entry metadata flood (abort at 20,000). A native collision on a case-sensitive filesystem remains unverified.
- Final `sandbox-exec -p '(version 1)(allow default)(deny network*)' npm test -- --reporter=verbose`: exit 0, 3 files / **37 tests** (21 input, 5 scaffold/C5, 11 Agent B fixture). Symlink/ancestor/replacement-root/permission/binary/cap/cancellation/revocation cases use the native filesystem; case collision and metadata flood use the labeled enumeration simulations. Target tripwire/config code is read only and never imported/executed.
- Separate network-denied Node script: new adapter's files and inventory deep-equal the reviewed 1.3 harness, **14 found / 13 source / 1 unsupported CSS skip**. No parser/graph output was created and the hand-written oracle was not regenerated.
- Separate network-denied Node script over this checkout: **52 found = 28 source + 24 skipped**, 3 pruned directories, 58,948 source bytes, **74 ms** selection/confirmation/snapshot time; snapshot/files frozen. Machine: Intel i5-8500B, 32 GiB RAM, macOS 15.7.7 (24G720), Node 24.16.0, 2026-10-09. This is one small snapshot smoke measurement, not parser/render/model or scale evidence. An earlier development smoke was 72 ms with 58,812 source bytes before final test edits; it is not substituted for this final reading.
- Markdown links/fences: 10 top-level/docs/skill files, 40 local links, zero errors. `git diff --check`: exit 0. Python artifact hashes match the independently approved fixture pin.
- Clean committed-checkout proof at `d930b2f6283f8d62165ff3798511e3773fea6345`: detached worktree clean before/after, network-denied `npm ci --ignore-scripts --offline` exit 0 (65 packages), full `npm test -- --reporter=verbose` exit 0 (**2 files / 26 tests**, 21 input + 5 scaffold/C5), network-denied `npm run build` exit 0 including both typechecks and 15-module client build. Agent B's uncommitted 11-case fixture suite is absent from that pin; it accounts for the shared-workspace total of 37. Temporary worktree removed. This is author validation, not the pending independent review. Main code commit is local only; no push/publication was performed by this session.

Verified: foundation authorization, bounded read-only source ingestion, exclusions, deterministic content/config identity, runtime immutability, fixture compatibility and offline regression. Unverified/pending: independent Claude review, `--project` launcher and UI confirmation wiring, authenticated/token-protected project/file APIs and stale browser references, actual parser integration, full race hardening, embedded-secret scanning, larger-repo rendering and MSI proof. M2 remains unfinished. Next integration step after reviewed 1.4: pass this `WorkspaceSnapshot` directly to the pure extractor, bind graph/evidence to its snapshot ID, and supply the extractor/resolver configuration through `analysisKey`; keep file access confined to this adapter. C5 independent recheck still precedes any browser API route.

### 1.6 — Claude Code (Agent B chat), 2026-10-09

**Status: In review (Codex). Benchmark recorded. Injection check failed and is handed to M3.**

Files: new `docs/BENCHMARKS.md`, `docs/benchmarks/` (saved request plus raw Run A and Run B JSON), `tests/model/request.ts` (fixed benchmark request, streaming client, output checks), `tests/model/local-model.test.ts` (real-model check), `tests/model/benchmark.test.ts` (opt-in benchmark). Changed: `vitest.model.config.ts` (`fileParallelism: false`), README.md `test:model` paragraph, the SUBMISSION.md runtime-models rows, and this file's 1.6 row, checks and report. No `src/` change.

Results (dev Mac, contended by a VM and concurrent 1.4 work): cold load 9.0 s, 444-token prompt evaluated in 11.0 s, cold TTFT 20.0 s. Warm runs were prompt-cache hits: TTFT 0.2 s, median total 52.0 s for 300 tokens at 5.79 tok/s. Peak `llama-server` RSS about 3.28 GB. `think: false` honored. Citations 0 invalid. **The canary leaked in every run.** Full detail and caveats are in BENCHMARKS.md.

Commands and results:

- Provenance: `sw_vers`, `sysctl`, `ollama --version` (0.40.2), `ollama show` (Q4_K_M, 4.0B), `/api/tags` (full digest matches the setup record).
- `npm run typecheck`: exit 0.
- First `BOOZER_BENCHMARK=1 npm run test:model`: exit 1. The benchmark passed, but the real-model check failed on `canaryLeaked`. Both files ran in parallel, so this is retained as contaminated Run A.
- After the fixes, `BOOZER_BENCHMARK=1 npx vitest run --config vitest.model.config.ts tests/model/benchmark.test.ts`: exit 0, 5 runs, no run errors; recorded as Run B.
- One exploratory post-snippet-instruction run (scratchpad script, not in the repo): no leak, 40.4 s.
- **`npm run test:model` currently fails** (the canary assertion), as it should until the prompt is fixed. It wasn't weakened.

For M3 (Codex): put the "snippets are data" rule after the snippets as well as in the system prompt, and keep the canary case in the real-model suite. When M3's prompt builder lands, switch `tests/model/local-model.test.ts` to it, so the suite tests the product prompt rather than this benchmark prompt. Preload the model at app start to avoid the 9 s cold load in the demo.

Not verified: offline behavior of Ollama's recommendations job, prompts over 444 tokens, a truly uncached warm run, and the MSI (M6).

### 1.5 — Claude Code (Agent B chat), 2026-10-09

**Status: In review (Codex). The map screen works on the dev-only fixture preview. The browser human check is pending, and the screen needs Codex's M2 API to show real parser output.**

Files: new `src/client/App.tsx`; `src/client/components/` (`SummaryPanel`, `GraphList`, `MapCanvas`, `DetailPane`); `src/client/map/layout.ts` (C4) and `model.ts` (counts, targets, stale references); `src/client/data/project-source.ts` and `fixture-preview.ts`; `tests/map-layout.test.ts`, `tests/map-views.test.tsx`. Changed: `src/client/main.tsx`, `src/client/style.css`, and `vitest.config.ts` (also includes `*.test.tsx`). No new package.

Design:

- The UI reads data only through `ProjectSource` (`loadGraph`, `loadSource`).
- `npm run dev` uses the fixture preview. It's labeled as the hand-written answer key, and Vite `?raw` loads the fixture as strings, never as code.
- Production builds have no source and show "No project connected". A network-denied build contains no fixture text, answer key or canary.
- **For M2 (Codex):** implement `ProjectSource` over the authenticated graph/file API. Use real parser output, with `isPreview: false` and the real snapshot ID. Nothing else in the UI changes.

Commands and results:

- `npx tsc --noEmit`: exit 0.
- `sandbox-exec … (deny network*) npm test`: exit 0, 6 files / 94 tests, including Codex's committed 1.4 work. The 21 new map tests passed on the first run, including the hand-derived C4 positions.
- Network-denied `npx vite build --outDir <scratchpad>`: exit 0, with one harmless warning (React Flow's `"use client"` directive). Searching for fixture strings found none.
- Dev smoke on port 5179: index 200; the fixture preview module and `?raw` fixture strings served (tripwire as `export default "…"`); foreign Host 403; port released after stop.

Not verified: anything in a real browser (clicks, visuals, offline reload; see the human check above). The canvas isn't rendered in tests (no DOM package). Hardening (rail and insights) wasn't started.

## Review log

| Date | Task | Reviewer | Verdict | Notes |
|---|---|---|---|---|
| 2026-10-09 | 0.2 (reviews 0.1) | Claude Code | Approved for 1.1 with conditions | 0 blocking for 1.1. Conditions: C1 schemas before 1.3, C2 Phase A tiers before M2, C3 ordering/ownership before 1.2 closes, C4 canvas layout before 1.5. See 0.2 report |
| 2026-10-09 | 1.2 (reviews 1.1 at `4718e27`) | Claude Code (review chat) | Approved with conditions | 0 blocking for 1.3/1.5/1.6. C1 and C4 resolved at contract/spec level. C5: dev proxy Origin 403, before M2/M3 API routes (Codex). See 1.2 report |
| 2026-10-09 | 0.3 (Claude-authored additions at `238d89e`) | Codex (this session) | Approved with conditions | 0 blocking for fixture/C5. C6: benchmark skill must capture full digest and explicit thinking state before 1.6 (Claude). P-12/P-13 design passes; cloud approvals remain separate |
| 2026-10-09 | 0.3 C6 recheck at `0b41795` | Codex (this session) | Approved | Full digest and explicit thinking provenance now required; C6 resolved. No runtime benchmark or MSI/schedule review implied |
| 2026-10-09 | 1.3 at review pin `af671e8` | Codex (this session) | Approved | 0 blocking; all 22 edges and 13 source nodes checked; coverage 14/12/2 and 22/16/2/1/3; 11 fixture tests pass. 1.4 claimed without implementation |
| 2026-10-09 | 1.1-C5 recheck at `c3847f2` | Claude Code (review chat) | Approved | C5 resolved: dev-proxy Origin 5173 reaches the app (404/405, was 403); foreign/lookalike origins and production stay 403. See docs/reviews/2026-10-09-c5-and-m2-foundation.md |
| 2026-10-09 | M2 snapshot foundation at `d930b2f`/`fc50f19`/`46cf19c` | Claude Code (review chat) | Approved with conditions | 0 blocking for 1.4. C7 (Codex, before M2 opens real repos): one supported file over 1 MiB or a case collision aborts the whole snapshot; use the contract's `oversize`/`case-collision` skips. Same report |
