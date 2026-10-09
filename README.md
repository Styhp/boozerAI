# Boozer AI

Boozer AI is a codebase intelligence project for developers who need to understand unfamiliar or AI-generated JavaScript/TypeScript code. The design combines a parser-built dependency map with source inspection and on-device explanations that cite their input snippets.

## Status

**Local-project integration independently approved.** The launcher asks for confirmation before indexing, then the authenticated UI shows the pure parser's graph and snapshot-bound source. C5, C7 and C8 are independently resolved; map/impact are approved after C10. Agent B's local explanation engine/panel is Approved with C9 after its grounding/file-name corrections in the [M3 review](docs/reviews/2026-10-09-m3-engine-panel.md); the M2 route streams its events. Two wider prompt-injection cases still fail and are disclosed. Human browser acceptance and MSI verification remain open. Status and evidence are in [TASKS.md](docs/TASKS.md) and the [M2 handoff](docs/M2-WIRING-HANDOFF.md).

Development describes the implemented local flow; later roadmap features remain delivery targets.

## What it is meant to do

- **Dependency map from real parsing.** Edges come only from parsed import, export, and require statements. The AI never adds or removes edges.
- **File inspection.** Click a file or an edge to see the source, with the import line highlighted.
- **Source-grounded explanations.** A local model explains selected code from retrieved snippets. Every citation links to a file and line range.
- **Local repo chat.** Ask questions about the confirmed repository, ask short follow-ups, and open cited source ranges. The current snapshot is searched as text; the chat uses the installed local model.
- **Potential change impact.** Lists files that could be affected by a change, with the import chain as evidence. It shows possible impact, never guaranteed breakage.
- **Local-first.** Parsing, the graph, and default explanations run on your machine. Internet is needed only for setup and for optional features such as GitHub import.
- **Safe with untrusted code.** Analyzed repositories are treated as data: never executed, never installed, and instructions inside them are ignored.

Input: explicitly selected local folders, confirmed before indexing. GitHub import is a later delivery phase.

## Full roadmap and delivery

The roadmap retains a dashboard, parser, graph canvas, detail pane, graph calculations, navigation rail and insights, ingestion pipeline, framework adapters, CommonJS and Express support, explanations with caching and tracing, evaluations, a read-only agent, landing page, and local folder and GitHub input. [PRODUCT.md](docs/PRODUCT.md) separates phases from safety exclusions. Local-folder map, inspection and potential-impact integration is independently approved; human/MSI acceptance and later features remain pending.

The proposed first delivery is a small offline vertical slice: fixture and selected local folder → parsed map → inspection → local explanation → potential impact. JEV and OpenAI remain optional secondary cloud integrations. LangSmith is optional and off by default; local evaluation needs no cloud account. The full roadmap is not a promise to finish the tutorial before the deadline.

## Reviewed scaffold

Agent A (Codex) proposed TypeScript on Node.js 24 LTS, a loopback web server, React/Vite, React Flow, the TypeScript compiler parser, bounded local JSON storage, and Ollama over loopback. Scaffold stack choices and S-4 resolution are **Accepted** in [ARCHITECTURE.md](docs/ARCHITECTURE.md); later choices remain Proposed until their gates. The current input contract selects a project explicitly at local launch; authenticated browser requests use opaque project/file IDs. Demo snapshots, graphs and results stay in memory; JSON persistence is later work.

Claude Code approved the scaffold in 1.2. C1 coverage/impact shapes live in `src/shared/contracts.ts`; C4 specifies original layered layout and list-first navigation above 300 nodes in ARCHITECTURE.md. Dependencies are pinned and disclosed in SUBMISSION.md. Approved local runtime/model setup is recorded separately; the app preloads the installed model and requests an explanation only when its button is clicked.

Development targets the Intel Mac: macOS 15.7.7, i5-8500B, 32 GB RAM. The MSI demo machine is Ryzen 5, 16 GB RAM, RX 5500, ParrotOS (P-2). MSI testing is required before relying on it for **either recorded or live demos**. GPU acceleration/MSI performance remain unverified. Agent B's Mac measurements and disclosed injection failures are in [BENCHMARKS.md](docs/BENCHMARKS.md); 1.6 is approved with C9 before demo.

## Development

Use Node.js 24 LTS and npm 11 (verified here: Node 24.16.0, npm 11.13.0). Install dependencies in the **Boozer AI checkout only**, never in a project selected for analysis. Installation may download packages; application startup and default tests need no internet or model.

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
npm start -- --project .
```

The launcher automatically opens the default browser at `http://127.0.0.1:4173` with a launch fragment. Confirm the selected folder before source is read. `.` opens Boozer's own repo for the demo (P-14); another folder can be supplied explicitly. Stop with Ctrl-C. Only the basename appears in the UI; absolute roots and capabilities are not logged. Every API needs the per-launch bearer token. POSTs also require JSON and the exact same Origin; Host remains `127.0.0.1:4173`. The fragment is removed immediately and only its token is retained in tab-scoped sessionStorage. Refreshing the same tab reconnects to the existing project and analyzed graph while the server stays running; no confirmation or reindexing is repeated. Closing the project, a rejected token or a server restart ends that session; use a fresh launcher tab to reconnect. Browser session recovery may retain sessionStorage, but the token cannot outlive its server launch. Source and AI answers are not saved in browser storage. Starting without `--project` selects no folder.

For development, run `npm run dev -- --project .`. It builds first, starts Vite plus the loopback Node host at 4173, watches server code and opens confirmation at 5173. Ports are fixed and an occupied port fails visibly. Vite proxies `/api` with the upstream Host rewritten to 4173 and the browser Origin preserved. Its watched child, `scripts/dev-host.mjs`, explicitly permits the additional exact Origin `http://127.0.0.1:5173`; production never reads an environment variable or CLI flag to enable it. A server rebuild revokes the old capability and opens a fresh confirmation. Visiting 5173 without an active tab session shows launcher guidance; the labeled fixture preview requires `?preview=fixture`; production bundles contain no fixture text or answer key.

**AI configuration in this checkout.** The local Ollama model stays on loopback. A local explanation has a six-minute model deadline and ten seconds of HTTP grace, accommodating slow CPU generation on a loaded machine; slower requests end with a timeout message, while explicit Cancel ends with cancellation. The waiting message reflects that limit. This longer wait does not change the provisional latency target or guarantee fast generation.

For the MSI update, see [graph workspace setup](docs/MSI-GRAPH-SETUP.md). Use the graph branch after its separately authorized transfer; no new model download is needed.

**Chat Boozer (M3-CHAT, pending independent review).** Click the **Chat Boozer** tab beside **Details**, above the right pane. The left ribbon's speech-bubble icon is also a shortcut. Type a question and press **Chat Boozer** (or Ctrl/⌘ + Enter). Name a file or symbol when possible. An optional selected file adds context. Switching tabs keeps the last details view and conversation; Arrow keys, Home and End switch tabs from the keyboard. **Thinking…** appears immediately while waiting for answer text, then **Replying…** while it streams; both disappear when the request ends. **Code the AI was shown** starts collapsed; expand it to inspect the exact excerpts. Answers stream with checked source links; opening a link activates Details, and returning to Chat Boozer keeps the conversation. **Cancel answer** stops generation; **Clear chat** removes it. The latest eight question/answer pairs live only in memory; project refresh/close and browser reload reset them. The last two user questions help follow-ups; earlier AI answers are not reused as evidence. Search uses only indexed JS/TS source excerpts and can miss relevant code, so it does not provide whole-repository knowledge. Missing analysis is counted. No new model, cloud request, embedding service, tools or saved transcript is used; only one AI answer can run at a time.

For optional OpenAI comparison, the server loads only `OPENAI_API_KEY` from this Boozer checkout's ignored `.env` before constructing the provider. Existing terminal exports, including an empty value, win; changes require a server restart. Vite does not load any env files. `.env.example` is the empty template; keep credentials private and never use a `VITE_` key. When configured, a selected file shows **Compare with cloud (optional)**. Preview the exact request, then press **Send to OpenAI** to send it; configuration and preview send nothing. A configured key does not prove provider access.

`npm test` is the model-free default suite; its setup rejects socket/fetch calls. `npm run test:model` is the separate real-model suite in `tests/model/`. It needs the approved local Ollama server on `127.0.0.1:11434` with `qwen3:4b-instruct` installed, and fails loudly without them. It never downloads anything or substitutes a fake answer. The product prompt's fixture canary passes in Agent B's recorded runs, but two wider injection phrasings still **fail**; a visible warning does not guarantee protection (see [BENCHMARKS.md](docs/BENCHMARKS.md)). `BOOZER_BENCHMARK=1 npm run test:model` also runs the multi-minute 1.6 benchmark.

Shared types live in [src/shared/contracts.ts](src/shared/contracts.ts); server/client entry points are `src/server/index.ts` and `src/client/main.tsx`. The approved hand-written fixture/oracle is at `fixtures/basic/`; do not execute it. The pure [extractor](src/shared/extractor.ts) and [resolver](src/shared/resolver.ts) consume only supplied snapshots. There are no parser/model/storage stubs or cloud SDKs. See [dependency inventory](docs/DEPENDENCIES.json) for locked package versions/licenses, including platform-optional packages.

M2's [LocalInputAdapter](src/server/local-input.ts) is callable from server code or a plain script: `select(folder)`, `confirm(projectId)`, then `snapshot(projectId, { analysisKey: ANALYSIS_KEY })`; pass the result directly to `extractDependencies`. `ANALYSIS_KEY` and `extractDependencies` are exported by the [extractor module](src/shared/extractor.ts). `close()` revokes further operations. Defaults: 2,000 supported source candidates, 1 MiB per file, 20 MiB read total, 20,000 metadata entries and 64 directory levels; callers may lower the source limits. Known oversize files and every case-colliding sibling become counted skips before reads/traversal. Whole-run file-count/total-byte/entry/depth caps, cancellation and detected mid-read growth abort with sanitized codes and no partial result. Source stays in memory, is never executed or written, and graph evidence shares its snapshot ID. The input/parser, C7/C8 corrections and local launcher/API/browser integration are independently approved; human/MSI rehearsal remains separate.

**Project notes (optional, P-17).** In a file's detail pane, "Remember notes for this folder" turns on notes you write yourself, linked to lines of code. Boozer marks each note current, moved, stale or missing as the code changes; the model never sees them. They are saved outside the project, in `~/Library/Application Support/Boozer AI/` on macOS or `~/.local/share/boozer-ai/` on Linux. Nothing is written until you turn notes on. To stop notes for a folder on later launches, or to recover from a notes file Boozer reports as unreadable, quit Boozer and remove that folder's `notes-<key>.json` there.

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
