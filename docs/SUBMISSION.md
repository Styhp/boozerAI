# Submission

## Deadline

**2026-10-10, 10:00 Manila time (PHT, UTC+8)**, which is 2026-10-10 02:00 UTC. The existing brief says no extensions. Deadline, rubric and rules below are carried forward from the baseline; an organizer source has not been supplied for independent verification. The human lead should confirm them before submission.

- Planning uses Australia/Perth (AWST, UTC+8), the same offset as Manila. The old 14:36 countdown is not a current time estimate.
- **Schedule.** The human lead decided on 2026-10-09 about 16:25 AWST: maximize build time, keep the 09:00–10:00 buffer, and demo on the MSI (P-2). Claude Code set these times to fit those decisions; the human lead may adjust them. They replace the earlier 05:00 proposal.

  | When (UTC+8) | What |
  |---|---|
  | Tonight, in parallel with the build | MSI setup and a first run of the current build ([MSI-SETUP.md](MSI-SETUP.md)). An agent drafts the final README and submission answers before the freeze. |
  | **00:00** | **MSI go/no-go.** If the MSI can't run the app and the local model by now, the demo moves to the Mac, which then needs its own offline rehearsal. |
  | **06:00** | **Feature freeze.** After this, only fixes for demo-breaking bugs found in rehearsal, until 06:45. |
  | 06:00–06:20 | Final build onto the MSI; run the tests there. |
  | 06:20–07:00 | Offline rehearsal on the MSI, with Wi-Fi off. |
  | 07:00–08:00 | Record the demo video. |
  | 08:00–09:00 | Publish and submit: make the repo public, post the video on X or LinkedIn, finalize the answers, submit. |
  | **09:00–10:00** | **Buffer.** No planned work. The 10:00 deadline has no extensions. |

  The freeze can't move later than 06:00 without cutting rehearsal or recording. About three hours of post-freeze work remain even with the MSI prepared in advance.
- If a cutoff is missed, the human lead must choose a smaller honest submission or another course; do not assume the whole tutorial can fit. Later roadmap phases remain planned.
- Public uploads/posts and submission actions require human authorization. An asset being ready does not authorize publishing it.

## Judging rubric

| Criterion | Weight | What the demo must show |
|---|---|---|
| Usefulness | 25% | A developer gets a checkable answer about unfamiliar code faster than by reading it alone |
| Local AI | 25% | Explanations generated on-device with networking off, with the model, hardware, and timings stated |
| Technical execution | 20% | A parser-built graph checked against a known fixture, validated citations, and safe handling of untrusted input |
| Innovation | 15% | Evidence-bound AI: parser-owned edges, visible explanation snippets and checked citation references, and potential impact with its chain; citation validity does not prove claim correctness |
| Product and demo quality | 15% | A clear, short journey: open, map, inspect, explain, check impact, verify |

## Required deliverables

| Item | Status | Notes |
|---|---|---|
| Project name | Done | Boozer AI |
| Project description | Draft | See draft answers below |
| Team | Missing | See P-6 |
| Public GitHub repository | Not created | Local Git initialized in 1.1. No remote/public repository; publication still needs human approval |
| Demo video | Not recorded | The recording/live-demo machine depends on P-2; MSI reliance requires M6 for either use |
| X or LinkedIn post with the video (URL) | Not posted | |
| What runs locally | Draft | See below; must match the final build |
| What requires internet | Draft | See below; must match the final build |
| Why local AI matters | Draft | See below |

## Draft answers

These describe planned behavior. Revise them to match what was actually built before submitting.

**Description.** Boozer AI helps developers understand unfamiliar or AI-generated JavaScript/TypeScript code. It parses the code to build a dependency map, lets you inspect files, explains selected code with an on-device model that cites the exact source lines it used, and shows which files could be affected by a change.

**Runs locally.** Reading the project, parsing, the dependency graph, impact analysis, the UI, and AI explanations. Explanations use a local model whose runtime and model are still to be chosen (S-7).

**Requires internet.** Setup downloads (app dependencies, runtime if missing, and local model) happen before offline use. Later GitHub input uses the internet for each explicit import. Optional OpenAI/JEV requests (JEV severity and scores are planned for after the hackathon) and optional LangSmith trace export use the internet only when enabled and explicitly requested; they are not prerequisites for local explanations or local evaluation. No such integration is implemented yet.

**Why local AI matters.** The code people most need help understanding is often private, and many teams aren't allowed to send it to a cloud service. A local model lets developers ask about that code without it leaving their machine. It also works offline and costs nothing per request. The planned design provides parsed facts and source snippets and checks citation references. This reduces unsupported references; it does not guarantee that model claims are correct.

## Rules

- AI coding tools and open-source components are allowed but must be disclosed.
- The project must be substantially built during the hackathon. Our commit history is the evidence, so commit regularly once git is initialized.
- External human help is prohibited.
- Write original code and design; do not copy tutorial implementations or assets. No reused external code/assets have been identified in the current documentation-only workspace. Disclose any later reuse with source, license and exact usage; do not invent copying claims.

## Disclosure register: actual assistance and use

Record actual contributions as they occur. Development assistants are separate from runtime models. Unknown versions/model identities stay unknown until verified; do not substitute a proposed runtime model for a development assistant's identity.

| Item | Category | Version / source | Actual contribution | License / terms record | Added (date, by) |
|---|---|---|---|---|---|
| Claude Code | AI development tool | Claude Code 2.1.226 running Claude Opus 5.5 (`claude-opus-5-5`), self-reported 2026-10-09 | Initial README, AGENTS.md, CLAUDE.md and project documentation baseline (M0); agent working rules and project skills (0.3). Independent proposal review 0.2 completed; scaffold review 1.2 remains pending | Tool/provider terms | 2026-10-09, Codex reconciliation; version and 0.3 added by Claude Code |
| ChatGPT / boozer | AI planning assistance | As identified by human lead; exact model/version and transcript not supplied | Product/planning assistance reported by human lead; no runtime integration implied | Tool/provider terms; model identity unverified | 2026-10-09, Codex at human request |
| Ollama | Local model runtime | v0.40.2, official GitHub release `ollama-darwin.tgz`, checksum verified; installed in `~/.local/opt/ollama-v0.40.2` on the dev Mac | Installed and server verified on loopback, for task 1.6. No Boozer code uses it yet | MIT (Homebrew formula metadata; confirm in the release's LICENSE) | 2026-10-09, Claude Code after human approval |
| Codex (Agent A) | AI development tool | Current Codex session; exact underlying model version not independently recorded | Read project docs; reconciled roadmap, proposed stack/interfaces/security/storage, delivery gates, hardware plan and disclosure register; checked public technical documentation and local document consistency. Task 1.1 adds original static server/client scaffold, pinned configuration, offline tests, C1 contracts and C4 layout specification. Task 0.3 independent review and C6 recheck completed; C5 dev-proxy Origin correction with tests; independent fixture/oracle review and 1.4 claim. No parser/analysis implementation or model inference in this session; independent C5 recheck remains separate | Tool/provider terms | 2026-10-09, Codex |

Task 1.1 installs the direct packages below for the scaffold. No application cloud service or model inference is used. Reading public documentation is research, not an application cloud integration. Add exact package/runtime versions, sources and licenses when actually installed or used. The checked-in package-lock.json pins direct/transitive artifacts with integrity hashes; [DEPENDENCIES.json](DEPENDENCIES.json) records all 89 locked package/license entries, including optional binaries for other platforms. 65 packages were added on the Intel Mac; uninstalled optional records do not claim local execution. Installation uses --ignore-scripts. All 89 records have license metadata; this is metadata inventory, not a legal assessment.

## Scaffold dependencies and tools actually used (1.1, Codex, 2026-10-09)

| Item | Exact version | Contribution / source | License metadata |
|---|---|---|---|
| Node.js | 24.16.0, pre-existing | Runtime, HTTP server, file/child-process primitives; nodejs.org | MIT plus bundled third-party notices |
| npm | 11.13.0, pre-existing | Package install and lockfile; npmjs.com | Artistic-2.0 |
| Git | 2.39.5 (Apple Git-154), pre-existing | Local history only; git-scm.com | GPL-2.0 |
| TypeScript | 6.0.3 | Strict typecheck/server compilation; parser API reserved for 1.4; npm registry `typescript` | Apache-2.0 |
| React / React DOM | 19.3.0 / 19.3.0 | Original static client shell; npm registry `react`, `react-dom` | MIT |
| React Flow | @xyflow/react 12.12.0 | Installed S-5 canvas dependency; no map implemented yet; npm registry | MIT |
| Vite | 8.3.4 | Local UI build/dev server; npm registry | MIT |
| Vitest | 5.0.3 | Offline scaffold tests and separate model entry; npm registry | MIT |
| @types/node | 24.19.1 | Node declarations; npm registry | MIT |
| @types/react / @types/react-dom | 19.3.0 / 19.3.0 | Client declarations; npm registry | MIT |

No external snippet, tutorial implementation, design or asset was copied. The C4 layout is an original specification; no layout library was added. Package licenses/versions come from registry and lock metadata. Official Vite/Vitest compatibility and React Flow layout documentation were consulted; local command evidence is in TASKS.md.

## Runtime models: proposed versus actually used

| State | Model/runtime | Purpose and evidence |
|---|---|---|
| Downloaded on the dev Mac 2026-10-09 (human-approved); not yet tested or benchmarked | Ollama v0.40.2 + `qwen3:4b-instruct` | Digest `0edcdef34593…8ba0`, Q4_K_M, 4.0B parameters, 2.5 GB, Apache-2.0 per `ollama show --license`. Details in the TASKS.md 1.6 setup record. Measurements come from 1.6, not from this listing. |
| Proposed fallback only | `qwen2.5-coder:1.5b` | Consider only if first test fails quality/latency/memory requirements; separate download approval and exact variant verification required. |
| Actually used as Boozer AI runtime | None recorded | No application or local-inference benchmark exists. Development-tool assistance above is separate. |

Official references checked 2026-10-09: [Ollama macOS requirements](https://docs.ollama.com/macos) lists x86 CPU-only support on macOS 14+; [Qwen candidate listing](https://ollama.com/library/qwen3:4b-instruct) supplies tag/size/quantization and an Apache-2.0 license label. Verify the actual downloaded artifact/license at authorized setup. Size is not a RAM estimate or a speed claim.

## Stack and later integrations

- Local scaffold packages are recorded above. The parser and Ollama integration remain planned. The demo uses memory only; local JSON persistence is later M8 hardening.
- Secondary cloud: OpenAI and JEV, both off by default and subject to explicit cloud approval. JEV service identity/API/data terms remain unresolved (P-11).
- Optional tracing: LangSmith, off by default. Traces can expose prompts/snippets, outputs, tool inputs/results, identifiers, timing, model settings/token usage, errors and metadata. Only an explicit previewed/redacted export may transmit data. See [ARCHITECTURE.md](ARCHITECTURE.md) for the proposed payload controls. Local traces and evaluations do not require LangSmith.

## Reused code and assets

None identified or introduced in this documentation task. Codex consulted official documentation for compatibility and design facts; it did not copy an implementation or assets. No tutorial source or asset was imported. Record source, license, adapted portions and where used if reuse occurs later; acknowledge the AI documentation/planning assistance above independently of code reuse.

**References consulted, not reused.** On 2026-10-09, at the human lead's request, Claude Code read the agent-workflow and planning files of [adrianhajdin/cartograph](https://github.com/adrianhajdin/cartograph): `CLAUDE.md`, `AGENTS.md`, `docs/project-doc.md`, all ten `docs/specs/` phase specs, and the `.agents/skills` + `.claude/skills` symlink layout. Engineering lessons from the specs are queued as 0.2 review findings in TASKS.md, written in our own words. Some working-rule ideas were rewritten in our own words in AGENTS.md (0.3): fresh-context orientation, agent versus human checks, not weakening checks, "absent beats approximate", and single code paths for risky capabilities. No text, code, specs, skills or assets were copied. The repository published no license when checked, so its contents must not be copied.

## Hardware and demo evidence

- Development spec supplied by human lead: Intel macOS 15.7.7, i5-8500B, 32 GB RAM. CPU inference is the proposed first test; no timings have been measured here.
- Possible demo machine: MSI Bravo 15, Ryzen 5, 16 GB RAM, RX 5500, ParrotOS. Exact OS/CPU/driver/runtime details and GPU acceleration are unverified.
- **M6 must pass before relying on MSI for either recording or live demonstration.** Test the actual display/recorder workload. A successful Mac test does not clear the MSI, and a successful recording check does not automatically clear an untested live setup.
- Every benchmark must state date, machine, OS, runtime version, exact model tag/digest and quantization, conditions and measured results including failures. Never infer GPU acceleration from hardware specifications.

## Final submission checklist (not completed)

- [ ] Human lead confirms organizer rules/deadline/rubric and team/license (P-6).
- [ ] Implemented and verified capabilities replace planned language in final answers; unfinished roadmap items stay visibly planned.
- [ ] Full offline model-free suite and separate real local-model evaluation results are recorded; failures and limitations disclosed.
- [ ] Chosen machine passes the offline demo rehearsal; M6 passes for each intended MSI use or MSI is not relied on.
- [ ] Video shows real local inference with networking off, model/runtime/hardware attribution and measured timing.
- [ ] Actual AI assistance, package licenses, runtime models and any reused code/assets are disclosed separately from proposals.
- [ ] Tested setup/run commands and local-versus-internet behavior match the delivered build.
- [ ] Human authorizes publication; repository, video and required social post exist and their links work.
- [ ] Human submits by the 09:00 target, verifies receipt and records actual time; 10:00 deadline buffer is retained or any miss explicitly reported.
