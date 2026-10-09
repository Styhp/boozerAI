# Task status

Current application: `feat/graph-workspace`, packaged at `feb281978705efe633aa043b0bed6fd945369ee8`. Subsequent cleanup changes documentation/tracking only. The human lead authorized pushing this branch; this does not change repository visibility or establish independent approval.

## Ownership and review

Codex is Agent A (scaffold/parser/ingestion/integration); Claude Code is Agent B (fixture/UI/model/impact). Each task has one owner. Authors do not approve their own work. Claim a new task in this table before editing; preserve unrelated work and record actual checks/results.

| Task | Owner | Status |
|---|---|---|
| DOCS-PUBLIC: streamline GitHub documentation | Codex (public-docs session, 2026-10-10) | In progress: cleanup verified; incoming MSI-only evidence preserved; commit/push verification remains |
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
| Folder picker, GitHub input and remaining roadmap | Owners/acceptance contracts in historical register | Not implemented in this branch; see PRODUCT.md |

## Original acceptance checks and records

The complete [task register, acceptance checks and review log at the pre-cleanup commit](https://github.com/Styhp/boozerAI/blob/a5ece9d6da3eedbd9e6fb585b2565cfd90d2f7e7/docs/TASKS.md) are preserved verbatim in Git history. The same commit's [docs directory](https://github.com/Styhp/boozerAI/tree/a5ece9d6da3eedbd9e6fb585b2565cfd90d2f7e7/docs) contains all author handoffs, independent reviews, design contracts and raw measurements. Consult the relevant original checks before resuming a task; cleanup does not weaken, complete or remove those requirements.

A byte-for-byte local copy of the pre-cleanup tracked documents, with SHA-256 manifest, is kept outside the analyzed checkout at `~/Library/Application Support/Boozer AI development/archives/graph-workspace-2026-10-10/` on the Mac. The incoming MSI record at `e12a04a` and its three added raw artifacts are preserved in an additional archive with their own manifest and in Git history. Historical source files also remain locally after removal from the Git index. They are excluded from the latest branch tree to keep its documentation readable.

## DOCS-PUBLIC scope and checks

Scope: README, core public documentation, current-phase orientation in AGENTS.md and `.gitignore`/tracking. Keep product/architecture contracts, submission disclosures, dependency inventory, benchmarks, MSI setup, a one-minute demo guide and this status register. Archive old handoffs, review logs, design prototypes/screenshots and raw benchmark outputs. No application, test, fixture, dependency, model or private configuration changes; no history rewrite.

- [x] Agent: verify the local archive against its SHA-256 manifest and the original Git tree.
- [x] Agent: validate links against the staged tree, fences, dependency inventory and whitespace; verify archived runtime-independent documentation is absent from the latest tree.
- [x] Agent: run the complete offline suite and build from an exported staged source tree, without private `.env` or local archives.
- [ ] Agent: commit the explicit owned paths and push to the existing remote graph branch; verify its exact SHA.
- [ ] Human: verify the current graph/chat revision on MSI using MSI-GRAPH-SETUP.md; Mac checks do not satisfy this requirement.

## DOCS-PUBLIC author handoff

Codex (public-docs session), 2026-10-10. Retained 8 core docs from the latest 101-file documentation tree; removed 93 historical paths from tracking while preserving their local bytes/history. Changed README, AGENTS current-phase orientation, ignore rules, architecture/product status and history links, submission/disclosures, validation, MSI setup, demo guide and this task register. Application, tests, fixtures, scripts, dependencies and private configuration are unchanged.

Verification: exported the staged tree without `.env`, local archives or removed docs, reusing installed dependencies. `npm test`: exit 0, **27 files / 361 passed / 0 failed / 0 skipped**, **9.45 s**. `npm run build`: exit 0, both typechecks/server compile and **208-module** bundle; existing React Flow directive and **505.22 kB** chunk warnings remain. Archive validation: 101 original tracked files match `a5ece9d` byte-for-byte, plus four incoming MSI evidence copies match `e12a04a`. All 89 dependency version/license entries match the lockfile. Staged whitespace/link/fence and owned-path checks pass: **56 local links / 16 pinned historical links / 13 Markdown files / 0 errors**, **103 owned changes**. All 120 application/test/fixture/script/package files match the tested export and incoming remote source.

The remote advanced with a documentation-only MSI continuation during cleanup. Fast-forwarded to `e12a04a`, preserved its raw records/history and summarized its measured terminal/launch evidence. Source equality against the tested export confirms no app change; no redundant model or app test rerun is claimed. Preparatory checks hit unmatched shell globs, a mistaken archive-count assertion and a JSON list/mapping mismatch; targeted/list-aware reads corrected them. The assertion stopped before mutation. No test/build failure occurred.

Commit and authorized push are the remaining publication step. No repository visibility change, history rewrite, model/runtime install, cloud send or external post. Independent app review, claim correctness, MSI browser/chat/model acceptance, offline/recorder rehearsal and submission receipt remain open.
