# Boozer AI

Understand unfamiliar JavaScript and TypeScript repositories with a dependency graph, source inspection, and a local AI assistant. Boozer reads code as text; the parser builds the graph, and the model explains the source excerpts it receives.

## What you can do

- Explore files and imports in the graph and file tree.
- Inspect source, open cited lines, and ask for a local file explanation.
- Ask repository questions in **Chat Boozer**, beside **Details**. **Thinking…** appears while waiting, then **Replying…** as text streams. Expand **Code the AI was shown** to check its excerpts.
- See potential change impact with the import chain as evidence.
- Optionally save your own project notes outside the analyzed folder.

The graph workspace and chat are implemented; their independent reviews remain open. Earlier parser, local-project integration, explanation engine and impact reviews are recorded in the [task status](docs/TASKS.md).

## Run locally

Use **Node.js 24.x** and **npm 11.x**. Local AI requires Ollama on `127.0.0.1:11434` with the already installed **qwen3:4b-instruct** model; exact runtime/model details are in the [disclosure register](docs/SUBMISSION.md).

Run these commands in the trusted **Boozer AI checkout**, never in an unfamiliar repository selected for analysis:

```sh
npm ci --ignore-scripts
npm test
npm run build
npm start -- --project .
```

The launcher opens `http://127.0.0.1:4173`. Click **Read this folder** to confirm the selected repository. To analyze another folder:

```sh
npm start -- --project "/path/to/repository"
```

For development:

```sh
npm run dev -- --project .
```

Development opens port **5173**, with the backend on **4173**. Stop with Ctrl-C. Ports are fixed; stop the previous Boozer server before starting another.

**No folder button?** Select the folder with `--project`. Starting without it does not select a repository. Use the new tab opened by the launcher; opening the bare address in another tab has no active session.

**Refresh:** the same tab reconnects to its analyzed project while the server stays running. A server restart needs its fresh launcher tab. Chat history resets on browser reload, project refresh or closure; it is kept only in memory.

For the existing MSI installation, follow [MSI setup](docs/MSI-GRAPH-SETUP.md).

## Local AI and privacy

Reading, parsing, graph analysis, source inspection, default explanations and Chat Boozer run locally after setup. Analyzed repositories are treated as untrusted data: Boozer does not execute or install them, follow their instructions, or write into them. Source and graphs stay in memory. Optional notes use the app data directory outside the target.

Package/runtime/model setup needs downloads. Optional **OpenAI file comparison** needs internet and a server-side `OPENAI_API_KEY` in this checkout's ignored `.env` or launch environment. Copy the empty `.env.example` if configuring it. Restart after changes. The UI previews the exact outgoing request and sends only after **Send to OpenAI**. Local chat needs no API key; cloud comparison is a secondary feature with no automatic fallback. GitHub import, JEV and LangSmith integration are not implemented.

## Limits

Static parsing can miss unsupported imports and framework relationships; Boozer counts missing analysis. Impact means **potentially affected**, never guaranteed breakage or safety. Chat searches indexed JS/TS source excerpts and can miss relevant code. Checked citations establish valid references, not correct claims.

Local answers can take a minute or more on a busy CPU. The model deadline is six minutes, and **Cancel answer** remains available. Prompt injection is partly resisted: two of five wider test phrasings still failed in recorded model runs. See [validation and benchmarks](docs/BENCHMARKS.md).

## Development and documentation

```sh
npm run typecheck
npm test
npm run build
```

The default suite is offline and model-free. `npm run test:model` separately exercises the installed local model and retains the known injection failures. `BOOZER_BENCHMARK=1 npm run test:model` opts into the longer benchmark; the historical Mac harness has a disclosed Linux observation failure.

| Document | Purpose |
|---|---|
| [Product](docs/PRODUCT.md) | Scope, current behavior and product decisions |
| [Architecture](docs/ARCHITECTURE.md) | Components, contracts and safety boundaries |
| [Submission and disclosures](docs/SUBMISSION.md) | AI tools, models, APIs, dependencies and reused assets |
| [Dependency inventory](docs/DEPENDENCIES.json) | Locked package versions and license metadata |
| [Validation](docs/BENCHMARKS.md) | Recorded performance, failures and hardware limits |
| [MSI setup](docs/MSI-GRAPH-SETUP.md) | Fetch, rebuild and verify this branch on MSI |
| [One-minute demo](docs/DEMO.md) | A short recording sequence with real local output |
| [Task status](docs/TASKS.md) | Current owners, pending reviews and verification |

Contributor rules are in [AGENTS.md](AGENTS.md). Historical handoffs, raw measurements and design references are preserved in Git history; they are omitted from the current documentation tree.

## License

The project license has not been chosen. Third-party package/model licenses and asset reuse are disclosed separately in [SUBMISSION.md](docs/SUBMISSION.md).
