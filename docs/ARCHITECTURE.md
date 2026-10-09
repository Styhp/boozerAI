# Architecture (proposed)

**Status:** scaffold approved in 1.2; C5 independently Approved by Claude at `dc22467`. M2's server-only snapshot foundation is Approved with condition C7; its correction is implemented at `22ba446` and awaits recheck before launcher/UI wiring. The pure 1.4 parser/resolver is Approved with condition C8 at `9576e50`; its fixture output matches the hand-written oracle and S-4 is Accepted subject to C8. C1/C4 are specified below and in the shared types. Actual API integration remains pending. See [TASKS.md](TASKS.md), [Claude's C5/M2 review](reviews/2026-10-09-c5-and-m2-foundation.md) and [1.4 review](reviews/2026-10-09-1.4-parser.md).

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
| Workspace snapshot | Lists files with content hashes and languages; applies ignore rules and size/count caps | M2 foundation enforces/tests defaults below; parser/UI integration pending |
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

## Data interfaces — C1 v1

The canonical, serializable TypeScript shapes are in [src/shared/contracts.ts](../src/shared/contracts.ts). Producers and consumers import these types rather than defining substitutes. This is the first concrete version; no fixture or parser output existed before it. Agent B writes `fixtures/basic/expected-graph.json` by hand against `DependencyGraph`, including coverage, after 1.2 approval. The fixture snapshot harness belongs to 1.3; no fixture directory is populated by 1.1.

| Shape | Contract |
|---|---|
| `WorkspaceSnapshot` | Server-only source text plus hashes, languages, byte sizes, limits, inventory and creation time. `inventory.found = files.length + inventory.skipped.length`. No `parse-error` skips until extraction. |
| `FileNode` | A snapshot source entry with `parse.status` `ok` or `error`. A parse-error node remains inspectable, emits no edges, and is counted as skipped. Unread/excluded entries are coverage records rather than pretend source nodes. |
| `DependencyEdge` | Stable `id`, importer `from`, source `specifier`, kind, target and statement evidence. Target is exactly one of `file`, `package`, `excluded`, `unresolved`. Package `name` preserves the complete decoded specifier, including subpaths; built-ins are external package targets with `builtin: true`. |
| `AnalysisCoverage` | File denominator and per-file skips; import denominator and per-edge issue reasons; evidence-backed unsupported-pattern diagnostics. Embedded in the graph and graph-walk results. |
| `GraphWalkQuery` / `GraphWalkResult` | Direction `importers` or `dependencies`; `maxDepth` positive integer or `null` for explicitly requested full reachability; snapshot and `bfs-v1` algorithm identity; bounded reachability and chains. |
| `ImpactResult` | Importers-only projection of the same walk, renaming `reachable` to `potentiallyAffected`. It carries the query, coverage, depth-limit status and incompleteness status. No second traversal algorithm. |

Paths are POSIX relative to the selected root, never absolute or escaping. Lines are 1-based inclusive. Hashes are lowercase SHA-256 of UTF-8 source bytes; counts are non-negative integers. Evidence matches a source node's snapshot/hash and valid line range. Types describe wire shapes; runtime validation and immutability enforcement belong to producers at 1.3/1.4/M2, not this scaffold.

Coverage invariants for the oracle and subsequent producer tests:

- `files.found = files.parsed + files.skipped`, and `files.skipped = files.skips.length`. Every discovered file has exactly one outcome. Every non-parse-error skip comes from snapshot inventory; every parse-error source adds one skip. `graph.files.length = files.parsed + number of parse-error skips`.
- The denominator covers individual entries examined in the bounded traversal, including unsupported/secret-name/symlink and case-collision entries. Ignored directories are pruned without enumerating their contents. Report `prunedDirectories` separately with `ignored` reasons; do not invent file counts inside them. C7: pre-read oversize files and every colliding sibling become counted skips. A skipped colliding directory counts as one examined entry; its unknown contents are never enumerated or counted. File-count, total-read-byte, entry and depth caps/cancellation abort the snapshot with an explicit error and no partial result.
- `imports.seen = resolved + external + excluded + failed = graph.edges.length`. A recognized import/re-export/require/dynamic-import candidate has one edge, including unsupported or ambiguous candidates. Comments and ordinary strings do not count. Parse-error files contribute no import candidates because their syntax cannot be trusted.
- Each `file` target counts as resolved; each `package` target as external; an exact candidate excluded by the snapshot rules counts as excluded; an unresolved candidate counts as failed. A missing path is `not-found`, never guessed excluded. Every excluded/failed edge has exactly one issue with its edge ID and the same reason; the edge holds the source example/evidence. Unsupported patterns carry evidence and reasons; counts do not assert knowledge of unrecognized runtime behavior.
- Display counts and reason breakdowns first. Any derived parsed-file rate is `parsed / found`; local import resolution rate is `resolved / seen`, labeled exactly that. A zero denominator is `null` / “No files examined” or “No recognized imports”, never 100%. External classification is not local resolution.
- `possiblyIncomplete` is true if any skipped file, excluded/failed import, pruned directory or unsupported diagnostic exists. Type-only relationships are included and labeled. Static reachability is always potential; even a clean count does not prove runtime completeness.

Deterministic ordering: files/skips/pruned directories by bytewise UTF-8 POSIX path (not locale-dependent comparison); edges by importer path then numeric source-order ordinal; issues in edge order; unsupported diagnostics by file and line. `edge.id` is `<from>#<ordinal>` with a 1-based ordinal among recognized statements in that file (not among resolved edges). For non-literal imports, `specifier` is the exact argument-expression text; literal specifiers preserve source characters between quote delimiters. Resolution may use the AST-decoded literal value without rewriting the stored specifier. Repeated specifiers remain separate statement edges. No timestamps occur in graph/walk outputs.

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
| `require(expr)` or `import(expr)` with a non-literal argument | edge with target `unresolved` and reason code `non-literal` |
| Import-like text inside comments or strings | no edge |

Relative specifiers resolve only against snapshot entries, in order: exact path; append `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`; for a `.js` specifier without an exact match try `.ts` then `.tsx`; then directory `index` with the same extension order. C8: the first candidate found in either source entries or skipped inventory wins, producing `file` or `excluded` with that actual candidate's path/reason. A later supported candidate does not override an earlier known exclusion. This amends 1.3's original exact-specifier-only interpretation without changing its hand-written oracle. Preserve filename case and report case collisions for cross-platform portability. Absolute and escaping paths are rejected. Bare specifiers become `package` targets (built-ins are labeled), and `node_modules` is never read. These are Boozer's documented static rules, not a claim to reproduce every runtime resolver. Other aliases/maps remain unresolved until their adapter is implemented.

Use TypeScript `createSourceFile` and AST traversal over supplied text, not a compiler host that can read arbitrary paths. No transpilation, target config execution, or target plugin loading. Literal `require` is supported only when it denotes the CommonJS binding; shadowed or ambiguous bindings must not become asserted file dependencies. Parse failures and non-literal forms remain visible diagnostics. `module.exports` / `exports` metadata and Express routing semantics are later static adapters. Hand-written fixtures cover each accepted pattern.

1.4 implementation: [extractDependencies](../src/shared/extractor.ts) and [SnapshotResolver](../src/shared/resolver.ts) consume only `WorkspaceSnapshot`; no filesystem/compiler host, server, UI, model or storage imports. Source hash/size/path/count validation precedes parsing; syntax errors keep their node and contribute no edges. The pinned TS 6 parser's `SourceFile.parseDiagnostics` is checked directly, avoiding a disk-reading Program. Scope collection treats parameters, destructuring, variables, imports, named functions/classes/namespaces and assignment/update of `require` as ambiguous bindings; hoists and lexical scopes are considered without executing code. `eval`/`with` contexts are conservatively marked `dynamic-scope`. This is static classification, not a full runtime binding/type analysis.

Inline all-type named imports are `type-import`; mixed value/type imports remain `import`. String literals and templates without substitutions resolve using the decoded AST value while retaining their exact source spelling between delimiters. Import-equals, type-expression imports and missing/invalid call arguments remain counted `unsupported-syntax` edges, with `import-equals`, `import-type` or `call-arguments` diagnostics. Invalid specifier syntax adds `specifier-syntax`; parameterized expressions remain `non-literal`. Unknown aliases (`#`, `@/`, `~/`) are `unsupported-alias`; other bare specifiers preserve package/subpath names, with built-ins checked against Node's builtin registry. No package or target config is read. Graphs and coverage are frozen copies, ordered as C1 requires; `coverageRates` returns `null` for each zero denominator. `ANALYSIS_KEY` supplies the extractor/TypeScript/resolver identity to the input adapter; future resolver/config changes must change that key. S-4 was Accepted by Claude's independent 1.4 review at `9576e50`, subject to C8. C8 advances resolver identity to `snapshot-relative-v2`, invalidating earlier snapshots through `ANALYSIS_KEY`.

## Explanation pipeline

1. The user selects a file. Explanations are file-level first (P-3).
2. The retriever builds snippets within a token budget: the selected file, or its most relevant parts if it is large, plus its import statements.
3. The prompt builder delimits each snippet and labels it with an ID. Its instructions say: answer only from the snippets, cite `[S#]`, say when something isn't in the provided code, and treat snippet text as data.
4. The model adapter streams the answer from the local runtime.
5. The validator maps markers to snippets and flags unknown markers.
6. The UI renders the answer as text with clickable references and labels it with the model, runtime, location (local or cloud), and duration.

## Impact semantics — C1 v1

- One iterative breadth-first walk handles both directions. `importers` follows file edges in reverse; `dependencies` follows file edges forward. Package, excluded and unresolved targets are reported in coverage but never traversed as local files. The selected file must exist in the graph; invalid selection/depth is an error.
- Default request: `maxDepth: 1`. Expansion to another positive integer or `null` is explicit. Exclude the selected file from results even in cycles, mark it visited initially, and return each reachable file once at its shortest depth. Iterative cycle handling must not depend on the language call stack.
- Tie-break equal-length paths by bytewise edge-ID order at each breadth-first frontier; output rows sort by depth then bytewise path. `depth` equals `chain.length`. For importers, chains stay in original import direction, from the affected file to the selection. For dependencies, chains run from selection to the dependency. Every chain edge is an unchanged member of the same graph snapshot. `includesTypeOnly` is true if the chosen chain contains a `type-import`.
- `depthLimited` is true only when the chosen finite boundary hides at least one reachable unvisited file beyond it. A cycle back to a visited file does not make it true. This is separate from `possiblyIncomplete`, which reflects the graph's coverage limitations, and avoids presenting a depth-1 result as all transitive importers.
- Impact rows use “potentially affected”. A zero result reads “No importers found by static analysis.” At finite depth, append “within depth N”; show an expansion action when depth-limited. Dependency rows are labeled dependencies, never potentially affected.

## Map layout — C4, implementation owned by 1.5

React Flow provides rendering/interactions rather than automatic layout ([official layout guide](https://reactflow.dev/learn/layouting/layouting)). Use an original, deterministic layered layout, without another package. The layout takes the graph and a display filter and returns positions only; it never alters graph edges.

1. On the displayed file-to-file graph, compute strongly connected components with iterative Kosaraju passes. Condense cycles into an acyclic layout graph internally; no synthetic dependency edges are emitted or displayed. Keep cycle members as individual adjacent file nodes with their original cycle edges.
2. Place importer-to-dependency edges left to right. Assign each component the longest-predecessor rank in topological order (sources at rank 0). Order ties by the component's smallest bytewise path, then member path. At each rank assign sequential rows. All initial node boxes are 240 × 72 px, with 320 px column and 112 px row pitch. This guarantees separated initial boxes; it does not promise minimal edge crossings.
3. Use file node IDs `file:<path>`, package IDs `package:<target.name>`, and per-edge non-file IDs `excluded:<edge.id>` / `unresolved:<edge.id>`. Place non-file terminal nodes one rank after their deepest displayed importer, ordered by ID after file components. Deduplicate package nodes by complete specifier; retain distinct failed statements and evidence. UI edges use parser edge IDs and keep import arrows, including cycles. Truncate long labels visually with the complete path available in accessible text.
4. Count all rendered nodes, including terminals, against the **300-node cap**. At 300 or below show canvas plus the complete file/edge list. Above 300 default to **list-first**, with no automatic arbitrary subset canvas. All indexed files/edges remain available in the list. An explicit folder/path filter may open a canvas only if its full node set fits the cap; otherwise ask for a narrower filter and retain the list.
5. A filtered canvas shows only original edges whose endpoints are displayed. Display indexed versus displayed node/edge counts, the active filter and omitted relationship counts. Hidden nodes are never treated as absent or excluded from parser coverage/impact. Layout/display selection has no effect on calculations over the full graph.

Agent B's 1.5 checks: repeatable positions under input permutation, no overlapping initial boxes, empty/disconnected/cyclic graphs, type/package/excluded/unresolved targets, 300 versus 301 total nodes, and selection/evidence from the full list while a canvas filter is active. A larger already-local repository and its real measured counts are exercised in M2; this scaffold makes no scale/performance claim.

## Cross-component contracts (proposal)

These are implementation boundaries, not existing modules. Use one repository and package initially: `src/shared` for schemas, `src/server` for ingestion/parser/storage/model/API, `src/client` for UI, `tests` for tests, and `fixtures` for inert original source. Agent A owns wiring and integration; the task author owns each contract implementation.

| Boundary | Input → output | Invariants and consumers |
|---|---|---|
| `InputAdapter.snapshot(selection, limits)` | Approved root or app-owned archive → `WorkspaceSnapshot` | Schema version, opaque project ID, immutable snapshot ID, hashes, relative paths, diagnostics; roots remain server-only |
| `Extractor.extract(snapshot)` + `Resolver.resolve(...)` | Snapshot text → `DependencyGraph` | Deterministic edges/evidence; resolver reads snapshot index only; UI, calculations, retriever consume it |
| `FrameworkAdapter.analyze(snapshot, graph)` | Read-only inputs → evidence-backed annotations + diagnostics | Adapter ID/version; never mutates dependency graph; new edge kinds require parser contract review and hand-written tests |
| `GraphQueries.walk(graph, query)` | `GraphWalkQuery` → `GraphWalkResult`; importers projection → `ImpactResult` | Versioned deterministic output; graph remains immutable |
| `Retriever.retrieve(snapshot, selection, budget)` | Selection → `Snippet[]` | Hash-bound source ranges, exclusions/redaction and token caps enforced before inference |
| `ModelAdapter.stream(request, abortSignal)` | Prompt/snippets/settings → text chunks + final model/timing metadata | Provider location explicit; fixed local endpoint by default; timeout/cancellation; no cloud fallback |
| `ExplanationService.explain(...)` | Snapshot/selection/provider settings → validated `Explanation` | Owns cache lookup, retrieval, inference and citation checks; invalid references visible |
| `LocalStore` | Versioned graph/cache/trace/evaluation records → bounded app-owned persistence | Atomic save/load/remove by opaque key; never accepts a target path; deletion only of app-owned data |
| `TraceSink.record` / `exportApprovedTrace` | Minimal local events / explicitly selected redacted payload → local record / optional upload | Default local-only sink; no auto-export, no SDK auto-instrumentation |
| `EvaluationRunner.run(dataset, adapter?)` | Hand-written cases → local report | Deterministic suite needs no model; real-model suite separate and offline-capable |
| `AgentTools` (later) | Validated bounded requests → snapshot evidence | `readSnippet`, `searchSnapshot`, `queryGraph` only; step/token/time budgets and cancellation; never takes a host filesystem path |
| `ScoreProvider.score(facts, snippets)` (reserved for M12; not built before the hackathon) | Parser facts from `GraphQueries` plus validated snippets → labeled, cited score records | JEV is the first provider once P-11 and P-13 are settled. Scores are stored apart from `DependencyGraph` and `ImpactResult` and never feed back into them. The local build never requires a provider (P-12) |

`WorkspaceSnapshot` contains `{ schemaVersion, projectId, snapshotId, files, inventory, limits, createdAt }`; source bytes are retained server-side in a bounded immutable snapshot. `DependencyGraph`, snippets, cache entries and UI selection must share that snapshot ID. Derive snapshot identity from sorted file paths/content hashes, skipped/pruned inventory, limits/ignore rules and parser/resolver configuration, not timestamps; keep timestamps outside deterministic graph output. A changed refresh creates a new snapshot and invalidates old selection/citations; the UI must never quietly attach old lines to changed source.

M2 foundation implementation: [LocalInputAdapter](../src/server/local-input.ts) owns the canonical root privately. `select(folder)` validates the root without reading source; the future launcher supplies this argument. `confirm(projectId)` authorizes indexing and `snapshot(projectId, { analysisKey, limits?, signal? })` returns the shared shape with every layer frozen. `close()` revokes the adapter, including pending scans. These are server methods, not browser APIs or capability-token substitutes. `analysisKey` is required and must encode the reviewed parser/resolver version/configuration when 1.4 integrates. Snapshot identity also includes the versioned input policy, ignore rules, sorted skips/pruned directories and caps, excluding absolute root, project ID and creation time. This does not yet invalidate browser selections/citations because no integration exists.

Traversal uses streamed directory enumeration with a 20,000-entry metadata cap (including directories and unsupported entries) and 64-directory depth cap. Each bounded directory's metadata is collected before reading source or descending, so all case/NFC-colliding siblings can be skipped with `case-collision`; the first entry never wins by enumeration order. Colliding directories are not traversed, and their unknown descendants are not counted. Defaults prune `.git`, `node_modules`, `dist`, `build`, `coverage`, `.next`, `.vite`, `.ssh`, `.aws` and secret-named directories. Secret-named files are excluded before opening; symlink entries are `symlink` skips and never followed. Root/ancestor symlinks are rejected outright. UTF-8 decoding is strict and preserves the BOM; NUL or invalid UTF-8 records a binary skip. Unreadable source records a skip; unreadable directories still abort because their unknown inventory cannot be represented as complete (review N2 remains a follow-up).

C7 correction: a supported file already over `maxFileBytes` at the confined pre-read stat becomes an `oversize` skip without opening or reading its contents. Oversize/colliding supported regular-file candidates still consume the file-count budget; secret-named files do not become source candidates. Total bytes means bytes actually read, so a pre-read oversize skip consumes no byte budget. File-count, total-read-byte, metadata/depth overflow and cancellation still abort with sanitized codes and no partial result. A detected replacement or a file growing during a read also aborts; a failed read is never quietly relabeled as a trustworthy oversize skip. No graph/parse-error status is fabricated by this layer. Input policy identity advances to `local-input-v2`, invalidating earlier snapshots after this behavior change. C7 implementation awaits independent recheck before launcher/UI wiring.

Proposed HTTP routes: authenticated `GET /api/projects/:id/graph`, `GET /api/projects/:id/files/:fileId`, `POST /api/projects/:id/explanations` with streamed response, and `POST /api/projects/:id/refresh`. Each checks the session's authorized project and snapshot; file IDs map to snapshot entries rather than browser-supplied filesystem paths. Closing the project revokes access. Later archive import, cache clearing and agent routes reuse the same authorization and contracts. Errors are structured (invalid selection, excluded file, stale snapshot, limit exceeded, parse error, runtime unavailable, cancelled) without source or absolute paths in logs.

## Local project selection and loopback inference

A normal web page cannot safely receive arbitrary host directory access. The minimal cross-platform flow is a launcher/CLI with a user-supplied `--project <folder>` argument, followed by an explicit confirmation in the local UI before indexing. The server holds the canonical root and issues an opaque project ID. The dashboard does not browse the host filesystem or offer an unrestricted path-reading endpoint. Switching roots requires another explicit launcher selection/session. A native folder picker is later UX work, not needed for this first contract.

Bind the server to `127.0.0.1` only, never all interfaces. Serve built UI and API from the same origin; dev Vite must also bind loopback and proxy the API. C5 startup separates the production entry (`src/server/index.ts`, default policy) from the watched dev child (`scripts/dev-host.mjs`, launched by `scripts/dev.mjs`). Only the latter selects the additional exact Origin `http://127.0.0.1:5173`; both require Host `127.0.0.1:4173`. Production does not consult ambient environment variables or CLI flags to widen Origin acceptance. This supplies no permissive CORS and does not replace M2 token/project checks. Allow only the exact configured Host and Origin, reject hostile/null origins on mutations and all cross-origin browser requests, and disable permissive CORS. Generate a per-launch random capability token delivered via the launch URL fragment; immediately remove the fragment and keep the token in browser memory, never URLs, logs, persistent browser storage, or referrers. Require it in an authorization header for **all** API reads and writes. State changes use POST with JSON, Origin checks, and the token; session shutdown revokes it. Test DNS rebinding/Host attacks, CSRF, missing tokens, and cross-project IDs. Loopback binding alone is insufficient.

The browser never calls Ollama directly. The server adapter uses fixed `http://127.0.0.1:11434`, a local installed-model allowlist, bounded context/output, timeout and cancellation; it rejects remote endpoint URLs, cloud model tags, redirects and browser-selected proxy targets. Do not expose model-pull/install APIs. Missing Ollama/model produces setup status, never automatic download or cloud fallback. No API credentials enter the browser. Once setup is explicitly approved and completed, the first demo must work with internet disabled.

## Local storage and cache

The demo tier uses memory only for source snapshots, graphs and results. Versioned JSON persistence behind `LocalStore` is deferred to M8 hardening; nothing is written to disk by the demo app. Future app data lives under an OS-appropriate app-owned user-data directory, outside the selected project. Reject a selection that contains or overlaps the app data directory before any storage write; this prevents selecting a home directory from turning app persistence into a target write. No database server, native database module, vector store or cloud account is required. Server-side `LocalStore` permits a later SQLite implementation if measured scale requires it; that would be a new reviewed choice.

Use opaque names, owner-only permissions, atomic replacement, a single writer and bounded retention; never derive storage paths from a target specifier. M2 foundation limits: 2,000 supported source candidates, 1 MiB per file, 20 MiB total bytes read (including candidates subsequently excluded as binary); callers may lower these limits, never raise them. Unreadable supported candidates consume the file cap too. The 300-node rendering cap is separate, with visible filtering and access to all indexed files via the list. Refuse an over-limit snapshot visibly instead of silently presenting a complete graph. Proposed disk budget: 100 MiB, with oldest cache/trace eviction and a clear-local-data action. Source caps are enforced by foundation tests; UI-scale/experience and future disk budgets remain unvalidated.

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

Review 1.2 (Claude Code, 2026-10-09, commit `4718e27`) marked S-1, S-2, S-3, S-5, S-6, S-8 and S-11 **Accepted** as scaffold choices; each still has to pass the later gate in its row. S-4, S-7, S-9, S-10 and S-12 remain **Proposed** until their gates. Direct package pins are recorded in package.json and SUBMISSION.md when installed for 1.1. Review 0.2 assesses this proposal; 1.2 confirms the actual scaffold. Pin exact compatible versions and record licenses at authorized installation, not by guessing a lockfile now.

| ID | Choice | Proposal and rationale | Validation gate |
|---|---|---|---|
| S-1 | Language/runtime | TypeScript on Node.js 24 LTS; one language for server/shared/client, portable macOS/Linux runtime | **Accepted 1.2** (Node 24.16.0, TS 6.0.3 on the Mac); MSI M6 |
| S-2 | App shape/server | Local web app using Node HTTP and built-in fetch; one local process serves built assets/API; no desktop shell or hosted backend | **Accepted 1.2** (static loopback host verified); C5 independently Approved at `dc22467`; API security M2 |
| S-3 | Parser | TypeScript compiler API, pin a compatible release below 7; AST over supplied JS/TS/JSX text gives source positions without executing it | **Accepted 1.2** (`typescript` 6.0.3 pinned); parser behavior 1.4 |
| S-4 | Resolution | Small deterministic snapshot-only resolver with the explicit rules above; extension points for later adapters | **Accepted 1.4** at `9576e50`, subject to C8 recheck before M2 shows real repos; later adapters M9 |
| S-5 | Canvas | React Flow (`@xyflow/react`); original iterative SCC/layer layout specified in C4; list-first above 300 total rendered nodes; no layout dependency | **Accepted 1.2** (`@xyflow/react` 12.12.0, C4 spec); implementation 1.5; larger graphs M2 |
| S-6 | UI/build | React + Vite, locally bundled CSS/assets; shared selection state, no extra state library initially | **Accepted 1.2** (React 19.3.0, Vite 8.3.4; offline build verified); UI 1.5 |
| S-7 | Local inference | Ollama loopback HTTP; first candidate `qwen3:4b-instruct`, Q4_K_M, registry size 2.5 GB; optional smaller `qwen2.5-coder:1.5b` only after separate approval | Human download approval, 1.6, M6 |
| S-8 | Packages/tests | npm with lockfile, Vitest for offline TS contract tests, TypeScript typecheck; real-model evaluations separate | **Accepted 1.2** (`npm ci` from lockfile, Vitest 5.0.3, network-denied suite verified) |
| S-9 | GitHub import | Bounded public archive download, no git execution; archive library chosen/disclosed only when M5 is claimed | M5 |
| S-10 | Optional cloud | OpenAI model adapter and optional JEV integration; no cloud SDK in scaffold; no silent fallback | P-11, M12 |
| S-11 | Storage | Memory-only demo; versioned local JSON behind `LocalStore` with atomic writes/caps deferred to M8 | **Accepted 1.2** for the memory-only demo (P-10); persistence stays Proposed for M8 |
| S-12 | Tracing/evaluation | Local records and offline evaluation runner; optional explicit LangSmith export later; no required orchestration SDK | M3/M8; optional export M12 |

Official references checked 2026-10-09: [Node release schedule](https://nodejs.org/en/about/previous-releases), [TypeScript compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) (documents the pre-7 API boundary), [React Flow](https://reactflow.dev/learn), [Vite](https://vite.dev/guide/), [Ollama macOS requirements](https://docs.ollama.com/macos), and [candidate model listing](https://ollama.com/library/qwen3:4b-instruct). These are proposal references, not copied implementation code or proof of local compatibility. The registry tag may move: record the actual digest, quantization, size and runtime version when authorized to download/test.

## Hardware assumptions

| Machine | Role | Spec | Verified |
|---|---|---|---|
| Dev Mac | Development; possible demo fallback after rehearsal | Intel macOS 15.7.7, Core i5-8500B, 32 GB RAM | Confirmed as the development spec by human lead; earlier docs report a Claude hardware check; Codex did not rerun it |
| MSI Bravo 15 | Possible recorded or live demo, gated by M6 | Ryzen 5, 16 GB RAM, Radeon RX 5500, ParrotOS | As reported; OS version, exact CPU/GPU model, and drivers not checked |

Plan for CPU inference on both machines. Ollama's macOS documentation lists x86 as CPU-only; the stated macOS 15.7.7 exceeds its macOS 14 minimum. This establishes a plausible first test, not measured performance. GPU acceleration on the RX 5500 under ParrotOS is unverified and must not be claimed without measured evidence.

M6 is mandatory before relying on the MSI for **either recorded or live demos**. Test the actual OS/runtime/model, offline app flow and memory headroom with the screen recorder for recording, or actual display/presentation setup for live use. If it fails or is not run, the MSI is not a demo dependency; use the Mac only after a successful rehearsal there, or let the human lead revise the submission plan. Runtime/model setup was separately approved and performed by Claude Code as recorded in TASKS.md; no inference or hardware benchmark is implied by this architecture or the scaffold.
