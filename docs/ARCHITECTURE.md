# Architecture (proposed)

**Status:** proposal only; nothing here is implemented. All S-choices are **Proposed** for Claude Code review in task 0.2 before scaffolding. Human authorization then gates 1.1; independent scaffold review 1.2 must confirm the choices and implementation before feature work. See [TASKS.md](TASKS.md).

## Principles

1. **The parser is the only source of graph edges.** The model can read the graph but never writes to it.
2. **Source claims carry evidence references:** snapshot, file, line range, and content hash. Aggregate counts/calculations identify their graph snapshot and algorithm version.
3. **The model only narrates evidence it was given.** Its citations are checked against the snippets that were actually sent.
4. **Target code is untrusted data.** It is read as text and is never executed, installed, or obeyed.
5. **Local by default.** External network access is explicit, started by the user, and visible. No silent cloud fallback or automatic trace export.
6. **Contracts before breadth.** Versioned snapshots and immutable parser graphs serve all views and future adapters; later milestones do not require a second ingestion or inference system.

## Components

```
Input adapter (local folder; GitHub later)
  │
  ▼
Workspace snapshot (files, hashes, ignore rules, caps)
  │
  ▼
Extractor + Resolver (parse as text; never execute)
  │
  ▼
DependencyGraph (read-only once built)
  ├──▶ Graph view + File inspector
  ├──▶ Impact analyzer ──▶ Impact panel
  └──▶ Snippet retriever ──▶ Prompt builder ──▶ Model adapter ──▶ Citation validator ──▶ Explanation panel
                                                (local by default;
                                                 cloud optional, later)
```

| Component | Responsibility | Notes |
|---|---|---|
| Input adapter | Builds a read-only file tree from a local folder, or later from a GitHub archive | Never writes into the target |
| Workspace snapshot | Lists files with content hashes and languages; applies ignore rules and size/count caps | Proposed caps below; enforced and tested in M2 |
| Extractor | Parses each file and finds import, export-from, require, and dynamic import statements, with their positions | Parses text only; never evaluates code |
| Resolver | Maps each specifier to a file, a package, or `unresolved` | Covers relative paths, extensions, and index files first; tsconfig paths later |
| Graph | Holds the `DependencyGraph` built from extractor and resolver output | Serializable, deterministic JSON |
| Impact analyzer | Finds every file that reaches the selected file through imports, with an evidence chain for each | Results are labeled "potentially affected" |
| Snippet retriever | Picks source excerpts for a question | Starts with the selected file and its import statements |
| Prompt builder | Wraps snippets as delimited, labeled data and gives each one an ID | Instructions inside snippets are treated as data |
| Model adapter | Calls a local runtime over loopback (candidate: Ollama); optional cloud later | Gives the model no tools or function calling |
| Citation validator | Matches `[S#]` markers to the supplied snippets and flags the rest | Never quietly "fixes" a citation |
| UI | Dashboard, navigation rail, canvas/list, detail pane and insights | Shared snapshot/selection state; renders source and model output as text |
| Framework adapters (later) | Add static annotations for conventions, CommonJS exports and Express routes/middleware | Evidence required; never run target code or framework configuration |
| Explanation cache and local trace sink (later) | Reuse validated answers and retain bounded local diagnostics | Snapshot/config keys, explicit clearing, no automatic cloud export |
| Evaluation runner | Compare parser/impact results to hand-written oracles; run separately labeled local-model cases | Local JSON reports; no model or network in default tests |
| Read-only agent (later) | Orchestrate bounded snapshot lookup, text search and graph queries | Separate allowlisted tool interface; no shell, writes, external network or edge mutation |
| Landing page (later) | Explain actual capabilities and link to app entry | Original local assets; no analytics; publishing separately approved |

## Data interfaces (sketch)

```ts
// Provisional. Paths are POSIX, relative to the target root. Lines are 1-based and inclusive.
type FilePath = string;

interface EvidenceRef {
  snapshotId: string;
  file: FilePath;
  startLine: number;
  endLine: number;
  contentHash: string;          // hash of the file content when the ref was made
}

interface FileNode {
  path: FilePath;
  language: "js" | "jsx" | "ts" | "tsx" | "mjs" | "cjs";
  sizeBytes: number;
  contentHash: string;
  parse: { status: "ok" } | { status: "error" | "skipped"; reason: string };
}

type EdgeKind = "import" | "type-import" | "re-export" | "require" | "dynamic-import";

type EdgeTarget =
  | { type: "file"; path: FilePath }
  | { type: "package"; name: string }          // bare specifier; node_modules is never read
  | { type: "unresolved"; reason: string };    // e.g. "file not found", "non-literal specifier"

interface DependencyEdge {
  from: FilePath;
  specifier: string;            // exactly as written in the source
  kind: EdgeKind;
  target: EdgeTarget;
  evidence: EvidenceRef;        // the statement that created this edge
}

interface DependencyGraph {
  schemaVersion: 1;
  snapshotId: string;
  files: FileNode[];
  edges: DependencyEdge[];      // produced only by the extractor and resolver
  extractor: { name: string; version: string };
}

interface ImpactResult {
  selected: FilePath;
  potentiallyAffected: { path: FilePath; depth: number; chain: DependencyEdge[] }[];
  possiblyIncomplete: boolean;  // unresolved imports, parse failures, skipped files or unsupported semantics
}

interface Snippet {
  id: string;                   // "S1", "S2", … unique within one request
  ref: EvidenceRef;
  text: string;                 // the exact source lines
  reason: string;               // why it was retrieved, e.g. "selected file"
}

interface Explanation {
  text: string;                 // model output containing [S#] markers
  snippets: Snippet[];          // exactly what was sent to the model
  citations: { marker: string; snippetId?: string; valid: boolean }[];
  model: { runtime: string; name: string; location: "local" | "cloud" };
  durationMs: number;
}
```

## Evidence references

- Every `DependencyEdge` points to the statement that created it.
- Every citation in an explanation resolves to a `Snippet`, and every snippet has an `EvidenceRef`.
- Every impact result carries the chain of edges that connects it to the selected file.
- A reference is clickable only if it resolves to a file in the current snapshot.
- `contentHash` lets the UI mark a reference as stale when the file has changed since indexing.

## Extraction and resolution rules (first demo)

| Source pattern | Result |
|---|---|
| `import x from './a'`, `import './a'` | `import` edge |
| `import type { T } from './a'` | `type-import` edge |
| `export * from './a'`, `export { x } from './a'` | `re-export` edge |
| `require('./a')` with a string literal | `require` edge |
| `import('./a')` with a string literal | `dynamic-import` edge |
| `require(expr)` or `import(expr)` with a non-literal argument | edge with target `unresolved` and reason "non-literal specifier" |
| Import-like text inside comments or strings | no edge |

Relative specifiers resolve only against snapshot entries, in order: exact supported file; append `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`; for a `.js` specifier without an exact match try `.ts` then `.tsx`; then directory `index` with the same extension order. Preserve filename case and report case collisions for cross-platform portability. Absolute and escaping paths are rejected. Bare specifiers become `package` targets (built-ins are labeled), and `node_modules` is never read. These are Boozer's documented static rules, not a claim to reproduce every runtime resolver. Other aliases/maps remain unresolved until their adapter is implemented.

Use TypeScript `createSourceFile` and AST traversal over supplied text, not a compiler host that can read arbitrary paths. No transpilation, target config execution, or target plugin loading. Literal `require` is supported only when it denotes the CommonJS binding; shadowed or ambiguous bindings must not become asserted file dependencies. Parse failures and non-literal forms remain visible diagnostics. `module.exports` / `exports` metadata and Express routing semantics are later static adapters. Hand-written fixtures cover each accepted pattern.

## Explanation pipeline

1. The user selects a file. Explanations are file-level first (P-3).
2. The retriever builds snippets within a token budget: the selected file, or its most relevant parts if it is large, plus its import statements.
3. The prompt builder delimits each snippet and labels it with an ID. Its instructions say: answer only from the snippets, cite `[S#]`, say when something isn't in the provided code, and treat snippet text as data.
4. The model adapter streams the answer from the local runtime.
5. The validator maps markers to snippets and flags unknown markers.
6. The UI renders the answer as text with clickable references and labels it with the model, runtime, location (local or cloud), and duration.

## Impact semantics

- The impact of file F is the set of files that reach F through import edges. Results show each file's depth and one shortest chain as evidence.
- Type-only edges are included but labeled, because they affect type-checking rather than runtime.
- If the snapshot has unresolved/non-literal imports, parse errors, skipped/capped files, or unsupported framework semantics, the result is marked as possibly incomplete.
- Results use the wording "potentially affected". The UI never says "will break", "safe to change", or "no impact". An empty result reads "No importers found by static analysis."

## Cross-component contracts (proposal)

These are implementation boundaries, not existing modules. Use one repository and package initially: `src/shared` for schemas, `src/server` for ingestion/parser/storage/model/API, `src/client` for UI, `tests` for tests, and `fixtures` for inert original source. Agent A owns wiring and integration; the task author owns each contract implementation.

| Boundary | Input → output | Invariants and consumers |
|---|---|---|
| `InputAdapter.snapshot(selection, limits)` | Approved root or app-owned archive → `WorkspaceSnapshot` | Schema version, opaque project ID, immutable snapshot ID, hashes, relative paths, diagnostics; roots remain server-only |
| `Extractor.extract(snapshot)` + `Resolver.resolve(...)` | Snapshot text → `DependencyGraph` | Deterministic edges/evidence; resolver reads snapshot index only; UI, calculations, retriever consume it |
| `FrameworkAdapter.analyze(snapshot, graph)` | Read-only inputs → evidence-backed annotations + diagnostics | Adapter ID/version; never mutates dependency graph; new edge kinds require parser contract review and hand-written tests |
| `GraphQueries.calculate(graph, selection)` | Graph/file ID → impact, cycles, degree/count insights | Versioned deterministic output; graph remains immutable |
| `Retriever.retrieve(snapshot, selection, budget)` | Selection → `Snippet[]` | Hash-bound source ranges, exclusions/redaction and token caps enforced before inference |
| `ModelAdapter.stream(request, abortSignal)` | Prompt/snippets/settings → text chunks + final model/timing metadata | Provider location explicit; fixed local endpoint by default; timeout/cancellation; no cloud fallback |
| `ExplanationService.explain(...)` | Snapshot/selection/provider settings → validated `Explanation` | Owns cache lookup, retrieval, inference and citation checks; invalid references visible |
| `LocalStore` | Versioned graph/cache/trace/evaluation records → bounded app-owned persistence | Atomic save/load/remove by opaque key; never accepts a target path; deletion only of app-owned data |
| `TraceSink.record` / `exportApprovedTrace` | Minimal local events / explicitly selected redacted payload → local record / optional upload | Default local-only sink; no auto-export, no SDK auto-instrumentation |
| `EvaluationRunner.run(dataset, adapter?)` | Hand-written cases → local report | Deterministic suite needs no model; real-model suite separate and offline-capable |
| `AgentTools` (later) | Validated bounded requests → snapshot evidence | `readSnippet`, `searchSnapshot`, `queryGraph` only; step/token/time budgets and cancellation; never takes a host filesystem path |
| `ScoreProvider.score(facts, snippets)` (reserved for M12; not built before the hackathon) | Parser facts from `GraphQueries` plus validated snippets → labeled, cited score records | JEV is the first provider once P-11 and P-13 are settled. Scores are stored apart from `DependencyGraph` and `ImpactResult` and never feed back into them. The local build never requires a provider (P-12) |

`WorkspaceSnapshot` contains `{ schemaVersion, projectId, snapshotId, files, diagnostics, limits, createdAt }`; source bytes are retained server-side in a bounded immutable snapshot. `DependencyGraph`, snippets, cache entries and UI selection must share that snapshot ID. Derive snapshot identity from sorted file paths/content hashes and parser/resolver configuration, not timestamps; keep timestamps outside deterministic graph output. A changed refresh creates a new snapshot and invalidates old selection/citations; the UI must never quietly attach old lines to changed source.

Proposed HTTP routes: authenticated `GET /api/projects/:id/graph`, `GET /api/projects/:id/files/:fileId`, `POST /api/projects/:id/explanations` with streamed response, and `POST /api/projects/:id/refresh`. Each checks the session's authorized project and snapshot; file IDs map to snapshot entries rather than browser-supplied filesystem paths. Closing the project revokes access. Later archive import, cache clearing and agent routes reuse the same authorization and contracts. Errors are structured (invalid selection, excluded file, stale snapshot, limit exceeded, parse error, runtime unavailable, cancelled) without source or absolute paths in logs.

## Local project selection and loopback inference

A normal web page cannot safely receive arbitrary host directory access. The minimal cross-platform flow is a launcher/CLI with a user-supplied `--project <folder>` argument, followed by an explicit confirmation in the local UI before indexing. The server holds the canonical root and issues an opaque project ID. The dashboard does not browse the host filesystem or offer an unrestricted path-reading endpoint. Switching roots requires another explicit launcher selection/session. A native folder picker is later UX work, not needed for this first contract.

Bind the server to `127.0.0.1` only, never all interfaces. Serve built UI and API from the same origin; dev Vite must also bind loopback and proxy the API. Allow only the exact configured Host and Origin, reject hostile/null origins on mutations and all cross-origin browser requests, and disable permissive CORS. Generate a per-launch random capability token delivered via the launch URL fragment; immediately remove the fragment and keep the token in browser memory, never URLs, logs, persistent browser storage, or referrers. Require it in an authorization header for **all** API reads and writes. State changes use POST with JSON, Origin checks, and the token; session shutdown revokes it. Test DNS rebinding/Host attacks, CSRF, missing tokens, and cross-project IDs. Loopback binding alone is insufficient.

The browser never calls Ollama directly. The server adapter uses fixed `http://127.0.0.1:11434`, a local installed-model allowlist, bounded context/output, timeout and cancellation; it rejects remote endpoint URLs, cloud model tags, redirects and browser-selected proxy targets. Do not expose model-pull/install APIs. Missing Ollama/model produces setup status, never automatic download or cloud fallback. No API credentials enter the browser. Once setup is explicitly approved and completed, the first demo must work with internet disabled.

## Local storage and cache

Start with memory for source snapshots and versioned JSON files for graph metadata/preferences under an OS-appropriate app-owned user-data directory, outside the selected project. Reject a selection that contains or overlaps the app data directory before any storage write; this prevents selecting a home directory from turning app persistence into a target write. No database server, native database module, vector store or cloud account is required. Server-side `LocalStore` permits a later SQLite implementation if measured scale requires it; that would be a new reviewed choice.

Use opaque names, owner-only permissions, atomic replacement, a single writer and bounded retention; never derive storage paths from a target specifier. Proposed limits: 2,000 source files, 1 MiB per file, 20 MiB source total; render at most 300 nodes at once with visible filtering and access to all indexed files via the list. Refuse an over-limit snapshot visibly instead of silently presenting a complete graph. Proposed disk budget: 100 MiB, with oldest cache/trace eviction and a clear-local-data action. These are unmeasured defaults to validate in M2.

Phase B explanation-cache keys include snapshot/content hashes, selected range, exact snippet hashes, question hash, parser/retriever/prompt/validator versions, provider location, model digest/quantization and generation settings. A change to any key component forces recomputation. Cache only complete validated results; errors, cancelled streams and unknown model identity are not cached. Persisting source-containing answers/snippets requires an explicit local-cache choice; source snapshots otherwise stay in memory. Local traces default to IDs, durations and sanitized error codes, without prompts/source/output/absolute paths. Provide clear/disable controls and retention tests; cache correctness and provenance precede hit-rate claims.

## Local and cloud boundaries

| Capability | Where it runs | Network and consent |
|---|---|---|
| Snapshot, parser, graph, UI, calculations, local storage | Local | Loopback between browser/server only |
| Default explanations and agent reasoning | Local model runtime | Loopback only; unavailable runtime is an error, not cloud fallback |
| Default tests and local evaluations | Local | Tests need no model; separately labeled evaluation may use an installed local model; no internet required |
| GitHub input (later) | Archive download, then local processing | User starts each public-repo import |
| OpenAI and JEV (later, optional secondary providers) | Remote service | Off by default; human approval before cloud dependency/API use during development; user previews and approves exact payload per request in product |
| LangSmith (later, optional) | Remote tracing service | Off by default; only explicit previewed export, never an automatic background upload |
| Dependencies/runtime/model setup | Local installation using external downloads | Separate setup action; human approval required for runtime/software/model downloads |

The local path must be tested with no cloud keys, no cloud services, tracing disabled, and internet unavailable. OpenAI uses the model-provider boundary; JEV's precise role/API is unresolved (P-11), so no invented API contract or dependency is proposed. Neither service may modify parser edges or bypass evidence validation. JEV severity and scores (P-12) read parser facts from `GraphQueries` plus validated snippets and return labeled, cited judgments. They are stored and displayed separately from `DependencyGraph` and `ImpactResult` and never feed back into either.

**Trace data disclosure:** enabled tracing can send prompts (including source snippets/questions), model responses, tool inputs/outputs, run IDs and parent/child relationships, timestamps/durations, model/provider identifiers, token counts, errors, tags and metadata. Paths and repository names can leak through these fields. LangSmith documents separate controls for [inputs/outputs and metadata](https://docs.langchain.com/langsmith/mask-inputs-outputs) and its [trace/run concepts](https://docs.langchain.com/langsmith/observability-concepts). Hiding inputs alone is insufficient. Boozer proposes exporting only a user-previewed, redacted allowlist from local records; exclude secrets, absolute paths and raw source by default, and require explicit selection for any additional source-bearing fields. Never auto-enable tracing just because an environment variable/key exists. Local evaluations and reports do not depend on LangSmith, LangChain or a hosted judge.

## Security model for untrusted repositories

- **No execution:** read text only; no target imports, scripts, package installs, config execution, framework plugin loading or shell tools. Later tsconfig/package maps are parsed as bounded data, never loaded as code or allowed to expand the root.
- **Filesystem confinement:** canonicalize the selected root; reject absolute/escaping paths and all symlink entries for the initial version. Resolve only snapshot entries. Check path components and file identity during reads, use no-follow file opens where supported, and reject detected replacement/race changes. Enforce root containment again before each read/refresh; tests include external and nested symlinks and replacement attempts. This is an app read boundary, not OS isolation against a hostile process with the same user privileges.
- **Exclusions/caps:** skip `.git`, `node_modules`, build output, `.env*`, credential files/private keys and binary files before reading source. Apply file/count/byte/request/token limits, cancellation and sanitized error handling. Source code can also contain embedded secrets: redact/reject recognized secrets before snippets/cache/logs and preview every cloud payload; filename exclusions are not a guarantee of secret detection.
- **Prompt injection:** source is delimited untrusted data. Initial explanation models have no tools. Later agent tools are capability-limited as above. Instruction delimiters and citation validation do not prove semantic correctness or injection immunity; adversarial evaluation and visible limitations remain necessary.
- **Rendering:** source/model output is escaped text. Only validated snapshot references become links; no raw HTML, executable Markdown or source-supplied URLs.
- **GitHub archives:** allow public HTTPS GitHub owner/repository inputs only; constrain redirects/download hosts, reject internal-network targets, bound compressed/uncompressed bytes and file counts, reject traversal, absolute paths, symlinks and hardlinks. Extract into a fresh app-owned directory, never the target; no hooks, submodules, LFS, installs or scripts. Feed the same snapshot validation and delete only task-owned temporary artifacts.

## Stack choices for independent review

All rows are **Proposed**, not installed or accepted. Review 0.2 assesses this proposal; 1.2 confirms the actual scaffold. Pin exact compatible versions and record licenses at authorized installation, not by guessing a lockfile now.

| ID | Choice | Proposal and rationale | Validation gate |
|---|---|---|---|
| S-1 | Language/runtime | TypeScript on Node.js 24 LTS; one language for server/shared/client, portable macOS/Linux runtime | 0.2/1.2; Mac checks, MSI M6 |
| S-2 | App shape/server | Local web app using Node HTTP and built-in fetch; one local process serves built assets/API; no desktop shell or hosted backend | 0.2/1.2; security M2 |
| S-3 | Parser | TypeScript compiler API, pin a compatible release below 7; AST over supplied JS/TS/JSX text gives source positions without executing it | 0.2/1.2, fixture 1.4 |
| S-4 | Resolution | Small deterministic snapshot-only resolver with the explicit rules above; extension points for later adapters | 1.4, M9 |
| S-5 | Canvas | React Flow (`@xyflow/react`); controlled nodes/edges, built-in navigation interactions; simple deterministic initial layout with cycles supported | 0.2/1.2, 1.5; benchmark larger graphs later |
| S-6 | UI/build | React + Vite, locally bundled CSS/assets; shared selection state, no extra state library initially | 0.2/1.2, 1.5 |
| S-7 | Local inference | Ollama loopback HTTP; first candidate `qwen3:4b-instruct`, Q4_K_M, registry size 2.5 GB; optional smaller `qwen2.5-coder:1.5b` only after separate approval | Human download approval, 1.6, M6 |
| S-8 | Packages/tests | npm with lockfile, Vitest for offline TS contract tests, TypeScript typecheck; real-model evaluations separate | 0.2/1.2 |
| S-9 | GitHub import | Bounded public archive download, no git execution; archive library chosen/disclosed only when M5 is claimed | M5 |
| S-10 | Optional cloud | OpenAI model adapter and optional JEV integration; no cloud SDK in scaffold; no silent fallback | P-11, M12 |
| S-11 | Storage | Versioned local JSON behind `LocalStore`, atomic writes and caps; memory-only source by default | M2/M8 |
| S-12 | Tracing/evaluation | Local records and offline evaluation runner; optional explicit LangSmith export later; no required orchestration SDK | M3/M8; optional export M12 |

Official references checked 2026-10-09: [Node release schedule](https://nodejs.org/en/about/previous-releases), [TypeScript compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) (documents the pre-7 API boundary), [React Flow](https://reactflow.dev/learn), [Vite](https://vite.dev/guide/), [Ollama macOS requirements](https://docs.ollama.com/macos), and [candidate model listing](https://ollama.com/library/qwen3:4b-instruct). These are proposal references, not copied implementation code or proof of local compatibility. The registry tag may move: record the actual digest, quantization, size and runtime version when authorized to download/test.

## Hardware assumptions

| Machine | Role | Spec | Verified |
|---|---|---|---|
| Dev Mac | Development; possible demo fallback after rehearsal | Intel macOS 15.7.7, Core i5-8500B, 32 GB RAM | Confirmed as the development spec by human lead; earlier docs report a Claude hardware check; Codex did not rerun it |
| MSI Bravo 15 | Possible recorded or live demo, gated by M6 | Ryzen 5, 16 GB RAM, Radeon RX 5500, ParrotOS | As reported; OS version, exact CPU/GPU model, and drivers not checked |

Plan for CPU inference on both machines. Ollama's macOS documentation lists x86 as CPU-only; the stated macOS 15.7.7 exceeds its macOS 14 minimum. This establishes a plausible first test, not measured performance. GPU acceleration on the RX 5500 under ParrotOS is unverified and must not be claimed without measured evidence.

M6 is mandatory before relying on the MSI for **either recorded or live demos**. Test the actual OS/runtime/model, offline app flow and memory headroom with the screen recorder for recording, or actual display/presentation setup for live use. If it fails or is not run, the MSI is not a demo dependency; use the Mac only after a successful rehearsal there, or let the human lead revise the submission plan. No runtime/model is downloaded, installed, benchmarked or approved by this proposal.
