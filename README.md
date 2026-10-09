# Boozer AI

Boozer AI is a planned codebase intelligence app for developers who need to understand unfamiliar or AI-generated JavaScript/TypeScript code. The design combines a parser-built dependency map with source inspection and on-device explanations that cite their input snippets.

## Status

**Documentation only.** There is no application code yet, nothing to install, and nothing to run. Install and run commands will be added here when the scaffold lands (task 1.1 in [docs/TASKS.md](docs/TASKS.md)).

Everything below describes planned behavior.

## What it is meant to do

- **Dependency map from real parsing.** Edges come only from parsed import, export, and require statements. The AI never adds or removes edges.
- **File inspection.** Click a file or an edge to see the source, with the import line highlighted.
- **Source-grounded explanations.** A local model explains selected code from retrieved snippets. Every citation links to a file and line range.
- **Potential change impact.** Lists files that could be affected by a change, with the import chain as evidence. It shows possible impact, never guaranteed breakage.
- **Local-first.** Parsing, the graph, and default explanations run on your machine. Internet is needed only for setup and for optional features such as GitHub import.
- **Safe with untrusted code.** Analyzed repositories are treated as data: never executed, never installed, and instructions inside them are ignored.

Input: local folders first, GitHub import in a later delivery phase. Neither input is implemented.

## Full roadmap and delivery

The roadmap retains a dashboard, parser, graph canvas, detail pane, graph calculations, navigation rail and insights, ingestion pipeline, framework adapters, CommonJS and Express support, explanations with caching and tracing, evaluations, a read-only agent, landing page, and local folder and GitHub input. [PRODUCT.md](docs/PRODUCT.md) separates delivery phases from permanent safety exclusions; none of these features is implemented.

The proposed first delivery is a small offline vertical slice: fixture and selected local folder → parsed map → inspection → local explanation → potential impact. JEV and OpenAI remain optional secondary cloud integrations. LangSmith is optional and off by default; local evaluation needs no cloud account. The full roadmap is not a promise to finish the tutorial before the deadline.

## Proposal awaiting review

Agent A (Codex) proposes TypeScript on Node.js 24 LTS, a loopback web server, React/Vite, React Flow, the TypeScript compiler parser, bounded local JSON storage, and Ollama over loopback. All stack choices remain **Proposed** in [ARCHITECTURE.md](docs/ARCHITECTURE.md). A project is explicitly selected at local launch; the browser receives a project ID, not unrestricted filesystem access.

Claude Code must independently review the documentation proposal (0.2) before the human lead authorizes scaffolding (1.1). Scaffold review (1.2) then gates feature work. Nothing has been installed or downloaded for this task.

Development targets the Intel Mac: macOS 15.7.7, i5-8500B, 32 GB RAM. The possible MSI demo machine is Ryzen 5, 16 GB RAM, RX 5500, ParrotOS. MSI testing is required before relying on it for **either recorded or live demos**. GPU acceleration and local-model performance remain unverified.

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
