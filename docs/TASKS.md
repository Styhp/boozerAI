# Task status

Current application: `feat/graph-workspace`, including MSI commits `b156b8e` (folder picker), `2cfbb57` (worktree exclusions), `1cd1341` (filtered large graphs) and `8d52d37` (dimmed-node clicks). MSI integration reconciles these with the Mac documentation cleanup at `267ccc7`; application code is unchanged by the merge. The human lead authorized pushing this branch; this does not change repository visibility or establish independent approval.

## Ownership and review

Codex is Agent A (scaffold/parser/ingestion/integration); Claude Code is Agent B (fixture/UI/model/impact). Each task has one owner. Authors do not approve their own work. Claim a new task in this table before editing; preserve unrelated work and record actual checks/results.

| Task | Owner | Status |
|---|---|---|
| MSI-DEMO-SYNC: preserve MSI fixes, merge cleanup and prepare demo | Codex (MSI integration session, 2026-10-10 UTC+8) | Implementation checks complete: MSI fixes and eight public docs preserved; 383 tests/build and browser/local-answer checks pass. Normal merge commit/push pending; recorder/Wi-Fi-off acceptance and independent review remain open |
| M7-DEMO: previous silent recording | Codex (MSI demo session); human lead accepts | Prior handoff reports a checked 60-second local MP4; human viewing and Wi-Fi-off proof remain open; see DEMO.md |
| M2-PICK / M2-INPUT-FIX / UX-G2-FIX / UX-G2-CLICK | Codex; Claude reviews | Implemented on MSI; prior author checks retained; independent review and human acceptance pending |
| DOCS-PUBLIC: streamline GitHub documentation | Codex (public-docs session, 2026-10-10) | Done: essential docs published to `origin/feat/graph-workspace` at `0d6b602`; tests/build pass, archives preserved and app reviews unchanged |
| Parser/resolver, local input/authenticated APIs, baseline explanation engine and impact | Original Codex/Claude owners, individually recorded in the historical register | Independently reviewed baseline; model injection failures remain disclosed |
| UX-P18: plain-language explanation/UI pass | Claude Code | Pending Codex review; MSI needs current-prompt rerun |
| UX-G1: graph tokens and workspace shell | Claude Code | Implemented at `1885ed0`; human browser acceptance pending |
| UX-G2: force-directed graph and C4 amendment | Claude Code; Codex reviews | Included in `feb2819`; independent review and human browser acceptance pending |
| M2-RELOAD: same-tab browser refresh recovery | Codex; Claude reviews | Implemented; independent review pending |
| M2-AI-REPAIR: configured cloud comparison and bounded local wait | Codex; Claude reviews | Implemented; independent review pending |
| M3-CHAT / tabs / feedback | Codex; Claude reviews | Implemented Chat Boozer, pane tabs and Thinking/Replying feedback; independent review pending |
| M3-SYNC: package and transfer current app | Codex | `feb2819` and handoff pushed; MSI terminal gates/compiled launch verified at `e12a04a`, browser/chat and rehearsal remain open |
| M6: actual MSI demo/recording/offline rehearsal | Human lead | Historical setup gate GO; full rehearsal remains open and model tests retain failures |
| UX-G3 / UX-G4 / UX-G6 | Original designated owners in historical register | Not started |
| UX-G5: snapshot-refresh continuity | Claude Code | Not requested |
| GitHub input and remaining roadmap | Owners/acceptance contracts in historical register | Not implemented in this branch; see PRODUCT.md |

## Original acceptance checks and records

The complete [task register, acceptance checks and review log at the pre-cleanup commit](https://github.com/Styhp/boozerAI/blob/a5ece9d6da3eedbd9e6fb585b2565cfd90d2f7e7/docs/TASKS.md) are preserved verbatim in Git history. The same commit's [docs directory](https://github.com/Styhp/boozerAI/tree/a5ece9d6da3eedbd9e6fb585b2565cfd90d2f7e7/docs) contains all author handoffs, independent reviews, design contracts and raw measurements. Consult the relevant original checks before resuming a task; cleanup does not weaken, complete or remove those requirements.

A byte-for-byte local copy of the pre-cleanup tracked documents, with SHA-256 manifest, is kept outside the analyzed checkout at `~/Library/Application Support/Boozer AI development/archives/graph-workspace-2026-10-10/` on the Mac. The incoming MSI record at `e12a04a` and its three added raw artifacts are preserved in an additional archive with their own manifest and in Git history. The Mac retained historical files locally after index removal. On MSI, historical files are moved outside the analyzed repository so old prototypes/probes cannot affect its graph.

On MSI, the complete pre-merge docs and original working/staged patches are preserved with a verified SHA-256 manifest at `/home/boozer/.local/share/boozer-ai-development/archives/msi-demo-sync-20261009T230843Z`. All 116 tracked documentation files were checked against this copy. The [MSI task register and review log](https://github.com/Styhp/boozerAI/blob/8042c07/docs/TASKS.md) and [previous recording report](https://github.com/Styhp/boozerAI/blob/8042c07/docs/DEMO.md) preserve the later fixes, acceptance checks, failures and recording history in Git.

## DOCS-PUBLIC scope and checks

Scope: README, core public documentation, current-phase orientation in AGENTS.md and `.gitignore`/tracking. Keep product/architecture contracts, submission disclosures, dependency inventory, benchmarks, MSI setup, a one-minute demo guide and this status register. Archive old handoffs, review logs, design prototypes/screenshots and raw benchmark outputs. No application, test, fixture, dependency, model or private configuration changes; no history rewrite.

- [x] Agent: verify the local archive against its SHA-256 manifest and the original Git tree.
- [x] Agent: validate links against the staged tree, fences, dependency inventory and whitespace; verify archived runtime-independent documentation is absent from the latest tree.
- [x] Agent: run the complete offline suite and build from an exported staged source tree, without private `.env` or local archives.
- [x] Agent: commit the explicit owned paths and push to the existing remote graph branch; verify its exact SHA.
- [ ] Human: verify the current graph/chat revision on MSI using MSI-GRAPH-SETUP.md; Mac checks do not satisfy this requirement.

## DOCS-PUBLIC author handoff

Codex (public-docs session), 2026-10-10. Retained 8 core docs from the latest 101-file documentation tree; removed 93 historical paths from tracking while preserving their local bytes/history. Changed README, AGENTS current-phase orientation, ignore rules, architecture/product status and history links, submission/disclosures, validation, MSI setup, demo guide and this task register. Application, tests, fixtures, scripts, dependencies and private configuration are unchanged.

Verification: exported the staged tree without `.env`, local archives or removed docs, reusing installed dependencies. `npm test`: exit 0, **27 files / 361 passed / 0 failed / 0 skipped**, **9.45 s**. `npm run build`: exit 0, both typechecks/server compile and **208-module** bundle; existing React Flow directive and **505.22 kB** chunk warnings remain. Archive validation: 101 original tracked files match `a5ece9d` byte-for-byte, plus four incoming MSI evidence copies match `e12a04a`. All 89 dependency version/license entries match the lockfile. Staged whitespace/link/fence and owned-path checks pass: **56 local links / 16 pinned historical links / 13 Markdown files / 0 errors**, **103 owned changes**. All 120 application/test/fixture/script/package files match the tested export and incoming remote source.

The remote advanced with a documentation-only MSI continuation during cleanup. Fast-forwarded to `e12a04a`, preserved its raw records/history and summarized its measured terminal/launch evidence. Source equality against the tested export confirms no app change; no redundant model or app test rerun is claimed. Preparatory checks hit unmatched shell globs, a mistaken archive-count assertion and a JSON list/mapping mismatch; targeted/list-aware reads corrected them. The assertion stopped before mutation. No test/build failure occurred.

Cleanup commit **`0d6b602ea0a003023d8eefecafc9a50845ceaa6b`**, parent **`e12a04aca9e39a38d65c0cf60939ae90b9076aea`**, was pushed to the existing `origin/feat/graph-workspace` branch; `git ls-remote` verified the exact SHA. This following commit records completion in TASKS.md only. The working tree was clean after the cleanup commit. No repository visibility change, history rewrite, model/runtime install, cloud send or external post. Independent app review, claim correctness, MSI browser/chat/model acceptance, offline/recorder rehearsal and submission receipt remain open.

## MSI-DEMO-SYNC scope and acceptance

Scope: normal merge of the fetched graph branch; README, eight public docs and inherited cleanup tracking; external historical archive; existing-toolchain checks, identified-server restart, real local demo verification and normal push. No application, test, fixture or dependency changes. This session owns the integration docs; historical review verdicts remain unchanged.

- [x] Agent: inspect branch/HEAD/index/worktree; fetch actual remote; preserve pending DEMO/TASKS edits in `8042c07` after checking the explicit staged diff; verify external archive.
- [x] Agent: resolve each conflict, retain exactly eight public docs and disclosures, and verify MSI source equality.
- [x] Agent: run full `npm test` and `npm run build` with existing Node 24/npm 11.
- [x] Agent: launch `npm start -- --project .`, retain Ollama, verify real browser/local-model behavior or provide exact manual checks.
- [ ] Agent: commit integration, push normally to `origin/feat/graph-workspace` and verify its SHA.
- [ ] Human: accept readability/interactions and rehearse with the recorder running and networking off; keep actual timing and failures.
- [ ] Reviewer: independently review outstanding application changes; implementation checks do not grant approval.

## MSI-DEMO-SYNC implementation handoff — 2026-10-10 UTC+8

Codex (MSI integration session). Fetched remote `267ccc7baa000b8bfecfc9de3e77df8f1f1bec43`; saved existing DEMO/TASKS edits and ownership in `8042c07`, then merged normally. Resolved README, DEMO, MSI setup and TASKS content conflicts and the modified/deleted historical SPEC by retaining the compact public structure plus MSI behavior and archiving the latest SPEC. Retained exactly eight public docs; 108 historical tracked paths are removed from this tree after external preservation. Changed paths are README, AGENTS, `.gitignore` and documentation only. All application, test, fixture, script, package and lockfile bytes remain identical to MSI `8d52d37`. AI/model/dependency/Athelstan disclosures remain.

Actual checks on MSI Bravo 15 / Parrot 6.4, kernel `6.12.95+deb12-amd64`, existing Node **24.16.0** / npm **11.13.0**:

- `npm test`: exit 0, **28 files / 383 passed / 0 failed / 0 skipped**, 2.69 s. `npm run build`: exit 0, both typechecks, server compilation and **52 client modules**; existing npm `allow-scripts` configuration warnings only. No test changes, installs or downloads. The separate model suite/benchmark was **not rerun**; known **2/5 wider injection failures** remain disclosed.
- Identified and stopped old production PID 131407 and the Node-22 dev launcher 134912/npm 134716; kept Ollama PID 93148 running. Started **`npm start -- --project .`** with Node 24. Compiled server PID 136017 serves HTTP 200 on loopback 4173; 5173 is released. The launcher opened an isolated installed-Chromium window through a task-local opener wrapper; no application launcher code changed and no capability was logged.
- Initial **Read this folder** screen observed; the user confirmed it before the scripted probe. Actual compiled workspace: **115 indexed files / 495 imports**. Browser checks pass: animated pixels, file-dot and faded-dot selection, hover, drag pan, wheel zoom, Fit, selected-file chat context, **Thinking → Replying → complete**, initially collapsed/expandable excerpts, valid citation navigation, retained answer on tab return, and same-tab reload reconnecting the graph without confirmation while clearing chat.
- Real local question: “Which error codes are declared in FolderPickerError? Answer in one sentence.” The answer lists exactly the five constructor codes and `[S1]`; source click highlights `src/server/folder-picker.ts` lines **2–13**. UI labels: **qwen3:4b-instruct / Ollama 0.40.2 / local / 7.2 s**. Installed digest matches the approved full digest in SUBMISSION.md, quantization Q4_K_M. This is one observed answer, not a formal latency benchmark or general quality claim. No cloud send.
- Validation: `git diff --cached --check` clean; **57 local links / 20 pinned historical Git links** resolve; **89 dependency version/license/artifact entries** match the lockfile; external archive's original **121 SHA-256 entries** verify. Only the eight public docs remain physically under `docs/`, preventing archived source probes/prototypes from entering analysis. Detailed browser probes/results/screenshots are in the archive's `integration-verification/` directory, outside the analyzed root.
- Probe failures retained separately from app checks: an early connection raced Chromium startup; a confirmation assertion met an already-confirmed tab; returning a DOM node exceeded CDP serialization limits; an exact-one-turn assumption failed after the user added a second question (corrected to compare the exact retained answer). Drag/zoom probing initially targeted the legend and sampled an edge particle; direct canvas/node assertions then passed. Reloaded observation state and two probe-instrumentation syntax errors were corrected. None required application changes or weakened acceptance. A source-view lookup used a nonexistent filename before inspecting the actual component.

Unverified: recorder workload and networking-off operation in this integration run (**Wi-Fi enabled**), human readability/native-picker acceptance, touch/pen, another large-project browser rerun, full M6 and independent application review. Earlier recording evidence is preserved in DEMO.md, not claimed as this run. Follow [DEMO.md](DEMO.md) for the recorder/offline rehearsal and retain failures. This is implementation verification, with no new independent-review verdict. Push confirmation is recorded after the normal push.
