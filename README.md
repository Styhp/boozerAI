# Boozer AI

Boozer AI is a codebase intelligence project for developers who need to understand unfamiliar or AI-generated JavaScript/TypeScript code. The design combines a parser-built dependency map with source inspection and on-device explanations that cite their input snippets.

## Status

**Scaffold approved; M2's server-only local snapshot foundation is ready for independent review.** The static React shell, loopback Node server, shared contracts and offline tests run locally. The input adapter selects/confirms a folder and builds a bounded immutable snapshot; launcher/UI/API integration is pending. The hand-written fixture/oracle is approved for 1.4. Parser, map, impact and explanation features remain pending. Proposal review 0.2 approved scaffolding; the human lead authorized 1.1 and this M2 foundation on 2026-10-09.

The product capabilities below describe planned behavior; the Development section describes the scaffold.

## What it is meant to do

- **Dependency map from real parsing.** Edges come only from parsed import, export, and require statements. The AI never adds or removes edges.
- **File inspection.** Click a file or an edge to see the source, with the import line highlighted.
- **Source-grounded explanations.** A local model explains selected code from retrieved snippets. Every citation links to a file and line range.
- **Potential change impact.** Lists files that could be affected by a change, with the import chain as evidence. It shows possible impact, never guaranteed breakage.
- **Local-first.** Parsing, the graph, and default explanations run on your machine. Internet is needed only for setup and for optional features such as GitHub import.
- **Safe with untrusted code.** Analyzed repositories are treated as data: never executed, never installed, and instructions inside them are ignored.

Input: local-folder snapshot code exists server-side; the application input flow is pending. GitHub import is a later delivery phase.

## Full roadmap and delivery

The roadmap retains a dashboard, parser, graph canvas, detail pane, graph calculations, navigation rail and insights, ingestion pipeline, framework adapters, CommonJS and Express support, explanations with caching and tracing, evaluations, a read-only agent, landing page, and local folder and GitHub input. [PRODUCT.md](docs/PRODUCT.md) separates delivery phases from permanent safety exclusions. These user-facing features remain pending.

The proposed first delivery is a small offline vertical slice: fixture and selected local folder → parsed map → inspection → local explanation → potential impact. JEV and OpenAI remain optional secondary cloud integrations. LangSmith is optional and off by default; local evaluation needs no cloud account. The full roadmap is not a promise to finish the tutorial before the deadline.

## Reviewed scaffold

Agent A (Codex) proposes TypeScript on Node.js 24 LTS, a loopback web server, React/Vite, React Flow, the TypeScript compiler parser, bounded local JSON storage, and Ollama over loopback. Scaffold stack choices are **Accepted** in [ARCHITECTURE.md](docs/ARCHITECTURE.md); later choices remain Proposed until their gates. The planned input contract selects a project explicitly at local launch; the browser will receive a project ID. The scaffold does not yet accept a project or expose file-reading APIs.

Claude Code approved the scaffold in 1.2; fixture and UI work may proceed under their recorded ownership and input-review gates. C1 coverage/impact shapes live in `src/shared/contracts.ts`; C4 specifies original layered layout and list-first navigation above 300 nodes in ARCHITECTURE.md. Dependencies are pinned and disclosed in SUBMISSION.md. Runtime/model setup is recorded separately; no inference is performed by this scaffold.

Development targets the Intel Mac: macOS 15.7.7, i5-8500B, 32 GB RAM. The possible MSI demo machine is Ryzen 5, 16 GB RAM, RX 5500, ParrotOS. MSI testing is required before relying on it for **either recorded or live demos**. GPU acceleration and local-model performance remain unverified.

## Development

Use Node.js 24 LTS and npm 11 (verified here: Node 24.16.0, npm 11.13.0). Install dependencies in the **Boozer AI checkout only**, never in a project selected for analysis. Installation may download packages; application startup and default tests need no internet or model.

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
npm start
```

Open `http://127.0.0.1:4173`. The only current screen says project analysis is not available yet. Stop with Ctrl-C. The production static server accepts only Host `127.0.0.1:4173` and Origin `http://127.0.0.1:4173` (or no Origin), and has no APIs. Full token/project authorization is M2 work; this shell is not permission to expose target source.

For development, run `npm run dev` and open `http://127.0.0.1:5173`. It performs the initial build, starts Vite plus the loopback Node host at 4173, and watches server code. Ports are fixed and an occupied port fails visibly. Vite uses local assets and loopback HMR. Its watched Node child, `scripts/dev-host.mjs`, explicitly permits the additional exact Origin `http://127.0.0.1:5173`; the Host check stays `127.0.0.1:4173`. The production entry never reads an environment variable or CLI flag to enable this Origin. This is a development server; future project APIs still require M2 authorization.

`npm test` is the model-free default suite; its setup rejects socket/fetch calls. `npm run test:model` is the separate real-model suite in `tests/model/`. It needs the local Ollama server on `127.0.0.1:11434` with `qwen3:4b-instruct` installed, and fails loudly without them. It never downloads anything or substitutes a fake answer. It currently **fails** its injection check: the model echoes the fixture's canary token (see [docs/BENCHMARKS.md](docs/BENCHMARKS.md)). `BOOZER_BENCHMARK=1 npm run test:model` also runs the multi-minute 1.6 benchmark.

Shared types live in [src/shared/contracts.ts](src/shared/contracts.ts); server/client entry points are `src/server/index.ts` and `src/client/main.tsx`. Source fixtures and a hand-written oracle belong at `fixtures/basic/` in 1.3 after review 1.2. Do not execute fixtures. There are no parser/model/storage stubs or cloud SDKs. See [dependency inventory](docs/DEPENDENCIES.json) for locked package versions/licenses, including platform-optional packages.

M2's [LocalInputAdapter](src/server/local-input.ts) is callable from server code or a plain script: `select(folder)`, `confirm(projectId)`, then `snapshot(projectId, { analysisKey })`; `close()` revokes further operations. `analysisKey` must identify the caller's parser/resolver version and configuration. The default limits are 2,000 supported source candidates, 1 MiB per file and 20 MiB read total, with metadata bounds of 20,000 entries and 64 directory levels. Callers may lower the source limits. Caps/cancellation fail with sanitized codes and return no partial snapshot. Source is retained only in memory, never executed or written into the selected root. This module is awaiting independent review and is not wired to the launcher or browser; parser integration waits for reviewed 1.4.

## Documentation

| File | Contents |
|---|---|
| [AGENTS.md](AGENTS.md) | Working rules for everyone building Boozer AI, human or AI agent |
| [CLAUDE.md](CLAUDE.md) | Entry point for Claude Code; defers to AGENTS.md |
| [.agents/skills/](.agents/skills/) | Shared agent procedures: independent review, local-model benchmark (linked into `.claude/skills/`) |
| [docs/PRODUCT.md](docs/PRODUCT.md) | Users, problem, core journey, first-demo scope, product decisions |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Proposed components, data interfaces, local/cloud boundaries, stack choices |
| [docs/TASKS.md](docs/TASKS.md) | Ordered milestones, owners, acceptance checks |
| [docs/SUBMISSION.md](docs/SUBMISSION.md) | Hackathon deadline, rubric, deliverables, disclosure register |

## Hackathon

Built for a hackathon. Submission deadline: **2026-10-10 10:00 Manila time (UTC+8)**. See [docs/SUBMISSION.md](docs/SUBMISSION.md).

## License

Not chosen yet (P-6 in [docs/PRODUCT.md](docs/PRODUCT.md)).
