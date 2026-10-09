# P-16 preview and HTTP transport handoff

Author: Codex (this session), 2026-10-09. Status: **In review; Claude reviews.** Base: `04ddf4f45f9eea2a330136330eb9e2bae8e8b21c` on `main`. The human lead now authorizes steps 2–5 of Agent B's P16-CLOUD-HANDOFF.md, extending the earlier body-only slice. Step 1 remains the approved strict provider/hash contract at `15502da`.

## Changes

- `src/server/project-api.ts`: authenticated `POST /api/projects/:id/explanations/preview`, exact `{snapshotId, path}` body, existing Origin/JSON/body-limit checks, project/current-snapshot checks, then `previewCloud` on the immutable in-memory snapshot and graph. Returns the preview object itself as JSON 200. Maps cloud-unavailable to 404, stale-snapshot to 409, invalid-selection/no-excerpt to 400; unexpected exceptions expose only request-failed. `path` remains a snapshot key and is never joined to a filesystem path. `GET /api/session` now includes safe `cloudStatus()` metadata after token auth.
- `src/shared/project-api.ts`: required browser-safe `cloud: CloudStatus` in `SessionResponse`.
- `src/server/app.ts`: service dependency and launch variable use `ExplanationService & CloudComparison`; startup/preload behavior is unchanged.
- `src/client/data/http-project-source.ts`: connection caches authenticated launch availability; new sources expose optional `cloud.status()` and `cloud.preview()` only when available. Status uses cached metadata without a background fetch. Explicit preview posts only snapshotId/path with the existing token header and reads the preview JSON. Errors use fixed readable messages; refresh/unmount aborts previews and suppresses late results, and close hides availability. Existing NDJSON transport passes provider/hash and service error messages unchanged.
- `tests/project-api.test.ts`, `tests/http-project-source.test.ts`: 18 additional offline cases, including the actual explanation service behind fake local/cloud adapters. Existing no-preview/no-cloud assertions from the body-only slice were replaced because this task explicitly introduces both contracts. All prior authority/body/streaming checks remain.
- `docs/ARCHITECTURE.md`, `docs/TASKS.md`, this report: contract, task claim and author evidence.

The engine, cloud adapter, shared explanation interface and explanation-panel files are Agent B's and were not edited. No package, model, real cloud call, local inference or push was needed.

## Verification

| Command | Actual result |
|---|---|
| `npx vitest run --config vitest.config.ts tests/project-api.test.ts tests/http-project-source.test.ts` | 2 files / 40 tests passed; before the final successful-send case was added |
| `npm test` | 16 files / **212 tests passed**, no failures or skips. Default harness rejects sockets/global fetch; provider calls use injected doubles |
| First `npm run build` | Failed typecheck: the optional class `cloud` declaration also admitted explicit undefined under exactOptionalPropertyTypes |
| Corrected `npm run build` | Passed both strict typechecks, server compilation and Vite production build, **188 modules**. Fixed declaration is optional `NonNullable<ProjectSource['cloud']>`. Existing React Flow use-client directive warning remains |
| `git diff --check` | Passed before handoff |
| Built client marker inspection | No OPENAI_API_KEY, fake route key, model-adapter factories, node:fs or node:http markers in the client JS |

The new tests verify authenticated status without reading source or calling a model; exact preview output without secrets/root/token or rereading changed disk content; wrong/missing token, Origin, JSON, extra fields, queries and project/snapshot rejection; unavailable, invalid/skipped/escaping selection and long-first-line errors; refresh/close invalidation and sanitized exceptions; mismatching hash rejection with the fixed message unchanged; explicit matching-hash send to a **fake** provider with the exact preview payload and a cloud-labeled done event. Client cases cover availability, token/body forwarding, readable errors, stale selections, aborts and delayed JSON after close. Existing Host/C5 and local-route tests pass in the full suite.

Final author verification at **`7dc92cd7b1fd02e9f45a8e462df8f29b4037083c`** reproduced `npm test` (**16 files / 212 passed, no failures/skips**) and `npm run build` (**188 modules**, both strict typechecks/server build passed), plus the clean client marker inspection, in a detached checkout with clean tracked files. The only untracked entry was a temporary node_modules symlink reusing the existing package install; no install or download. Agent B's concurrent App/SummaryPanel mounting diff is excluded from these pinned results. This is author verification, not Claude's independent review.

## Follow-up

- Claude independently reviews this transport; this author report is not an approval. The existing cloud engine/UI remains a separate Agent B contribution for cross-model review.
- Human browser/cloud acceptance is **not run**. Use Agent B's human check: launch without a key and verify the cloud panel is absent; launch with a key set privately in your terminal, inspect the exact escaped preview, then explicitly Send and verify provider/model labels and citations. A real cloud response and offline-failure behavior remain unverified by this task.
- P-17 notes is being built separately on feat/project-notes and touches project-api.ts/http-project-source.ts. Reconcile those hooks against this preview/session/connection contract when merging; neither contribution should erase the other's auth or snapshot checks.
- Existing C9 disclosure, human local/browser checks and MSI rehearsal remain open. Preview hashes bind payload bytes; they do not prove that the user viewed the panel.
- Other sessions' pending DEMO.md, SUBMISSION-DRAFT.md, review/notes TASKS.md changes, untracked proposal/review files and .claude/worktrees are preserved outside this commit.
