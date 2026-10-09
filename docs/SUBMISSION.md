# Submission and disclosures

Boozer AI helps developers understand unfamiliar or AI-generated JavaScript/TypeScript code through a parser-built dependency graph, source inspection, local explanations, repository chat and potential impact with evidence chains.

## Hackathon rules and submission

The organizer's **Rules and tools** slide supplied by the human lead allows AI coding tools and open-source models/libraries, requires disclosure of tools, models, frameworks, APIs and existing code/assets, and permits cloud APIs as secondary components. Core Local AI must not depend entirely on cloud AI. The slide also says the project must be substantially built during the hackathon and prohibits help from people outside it. No specific model, OS or hardware is required. This register records known assistance and reuse; the human lead confirms team eligibility and final submission statements.

The existing brief records **2026-10-10, 10:00 Manila/Perth (UTC+8)** as the deadline, a public GitHub repository, a demo video and an X or LinkedIn video post as deliverables. Its rubric is Usefulness 25%, Local AI 25%, Technical execution 20%, Innovation 15%, Product/demo quality 15%. These deadline/deliverable/rubric details were not independently verified from the supplied FAQ slide. The [historical brief](https://github.com/Styhp/boozerAI/blob/a5ece9d6da3eedbd9e6fb585b2565cfd90d2f7e7/docs/SUBMISSION.md) retains the original schedule and checklist.

Repository: [Styhp/boozerAI](https://github.com/Styhp/boozerAI), branch `feat/graph-workspace`. It was verified private during this documentation cleanup. Pushing this branch does not change visibility or submit the project. Team names, project license, final video/post URLs and submission receipt remain unrecorded here.

## What runs locally

Project confirmation and bounded source reads, static parsing, dependency graph, source inspection, impact/insights, local file explanations and **Chat Boozer**. Optional user-written notes are saved outside the analyzed repository. Source/graphs and chat answers otherwise stay in memory. Core use after setup does not require a cloud account.

Setup downloads require internet. Optional OpenAI file comparison requires internet, configuration and an explicit send after payload preview. It is never a fallback for local failures. GitHub import, JEV scoring and LangSmith export remain planned, with no installed service/SDK or app traffic to those services.

Local AI matters because repository source can stay on the user's machine and answers remain available without an inference service. Citations expose the source the model saw; they do not guarantee factual accuracy.

## AI assistance used during development

Development assistants are separate from the local model used by the app.

| Tool | Actual contribution | Version record |
|---|---|---|
| Codex (Agent A) | Documentation, scaffold/configuration, parser/resolver, ingestion/authenticated HTTP, integration, independent reviews of Claude-authored work, browser refresh recovery, provider repair, local repository chat, pane tabs/waiting feedback, native folder picker, MSI worktree/graph repairs, local recording preparation, packaging and documentation integration/cleanup | Exact underlying development-model/runtime version not independently recorded |
| Claude Code (Agent B and separate review sessions) | Initial documentation and working rules/skills, fixture/oracle, UI, local-model measurements, explanation engine/panel, impact and project notes, graph workspace, independent reviews of Codex-authored work | Claude Code 2.1.226 / Claude Opus 5.5 (`claude-opus-5-5`), self-reported on 2026-10-09 |
| ChatGPT / “boozer” | Product/planning assistance reported by the human lead | Exact model/version not supplied |
| Claude Design | Human lead's graph-workspace design session on 2026-10-09/10 | Exact version not recorded |

Codex also documented the local Ollama flow and corrected repository-chat lexical retrieval after a question about Ollama returned unrelated UI excerpts. This adds cited source context, not a trained model or a stored answer.

These tools are not dependencies of Boozer's local inference. Commits and the [historical task register](https://github.com/Styhp/boozerAI/blob/a5ece9d6da3eedbd9e6fb585b2565cfd90d2f7e7/docs/TASKS.md) retain development chronology, ownership, reviews and failures.

## Runtime model and API

| Component | Exact configured version/model | Use and license record |
|---|---|---|
| Ollama | 0.40.2; loopback `127.0.0.1:11434` | Local runtime for file explanations and chat; MIT per recorded runtime metadata |
| Qwen | `qwen3:4b-instruct`, Q4_K_M, 4.0B parameters, about 2.5 GB | Actually downloaded and used after approval; Apache-2.0 per recorded `ollama show --license` check |
| OpenAI API | Configured model `gpt-6-luna`; fixed `https://api.openai.com/v1/chat/completions` endpoint | Optional file comparison using native server-side fetch, no SDK. Exact response model is recorded when returned; configuration alone does not prove live access. Provider terms apply |

Boozer verifies the approved local model's full digest:

```text
0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0
```

The current local adapter uses a 4096-token context and a 300-token output cap. Model/runtime details and historical measurements are in [BENCHMARKS.md](BENCHMARKS.md); benchmark settings can differ from current app settings.

## Frameworks, libraries and development tools

The lockfile pins artifacts and integrity hashes. [DEPENDENCIES.json](DEPENDENCIES.json) records **89 locked package/license entries**, including optional packages for platforms not installed on the Mac. This is a metadata inventory, not a legal assessment.

| Component | Version | Role | License metadata |
|---|---|---|---|
| Node.js | 24.16.0 | HTTP server and app runtime | MIT plus bundled third-party notices |
| npm | 11.13.0 | Package installation and lockfile | Artistic-2.0 |
| Git | 2.39.5 (Apple Git-154), recorded Mac version | Source history | GPL-2.0 |
| TypeScript | 6.0.3 | Compiler API parser, typechecking and compilation | Apache-2.0 |
| React / React DOM | 19.3.0 / 19.3.0 | Client UI | MIT |
| React Flow (`@xyflow/react`) | 12.12.0 | Retained map component/dependency; current force-graph bundle excludes it | MIT |
| Vite | 8.3.4 | Development server and client build | MIT |
| Vitest | 5.0.3 | Offline and separate real-model tests | MIT |
| `@types/node` | 24.19.1 | Node declarations | MIT |
| `@types/react` / `@types/react-dom` | 19.3.0 / 19.3.0 | React declarations | MIT |

The graph workspace uses an original plain-TypeScript force engine without an additional layout package. No model creates dependency edges.

## Existing code and assets

**Athelstan design tokens:** colour, spacing, radius, glass and shadow values come from the human lead's private `athelstan-platform` repository at `962f69d` (`tokens.css`, `glass-tokens.css`). The human lead confirmed ownership and approved reuse on 2026-10-10. Values are used in [Boozer's tokens](../src/client/styles/tokens.css). No Athelstan components, icons, fonts, logo or wallpapers were reused.

**Reference consulted:** Claude Code read the planning/agent-workflow files of `adrianhajdin/cartograph` on the human lead's request, 2026-10-09. Working-rule ideas were rewritten in our own words. No code, text, skills or assets were copied; no license was present when checked. This is reference consultation rather than reused implementation.

No other pre-existing code/asset reuse is identified in the current register. The project license remains the human lead's open decision (P-6).

## Validation and remaining submission checks

[Benchmarks](BENCHMARKS.md) retain measured performance and failures. In particular, two wider injection phrasings still fail; warning detection and valid citations do not make the model safe or correct. Historical MSI Vulkan measurements do not establish readiness of this new graph/chat revision or recorder/offline rehearsal.

- [ ] Human: confirm organizer deadline/deliverables, team eligibility and project license.
- [ ] Human: rehearse the actual final machine with networking off and recorder/display workload; show real local output and honest measured timing.
- [ ] Human: approve any repository visibility change or public video/social publication, then record working links and submission receipt.
- [ ] Reviewer: independently review the graph-workspace/reload/provider/chat changes listed in [TASKS.md](TASKS.md).

The complete original submission checklist, including unresolved checks, remains in the versioned historical brief linked above; none is represented as completed by this cleanup.
