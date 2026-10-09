# M8-N: independent review of the notes hooks only

**Verdict: Approved, 0 blocking findings.** Reviewer: Codex (this session), 2026-10-09. Review pin: `13d05ad68cac61a617b01a3d0dbf58b24884e39c` on `feat/project-notes`; preserved transport baseline: `7dc92cd7b1fd02e9f45a8e462df8f29b4037083c`. Procedure: boozer-review. Agent B authored the notes additions; Codex's earlier implementation is comparison context, excluded from this independent verdict.

Scope is exactly the human-requested additions: local-input.ts lines 4, 91–116, 155–171; project-session.ts 6–7, 30–47; project-api.ts 6, 75–88; http-project-source.ts 3, 6, 96–119. NOTES-HANDOFF.md and directly called contracts were read for context. This is not a second review of LocalStore, note status rules, panels or the full notes feature. No implementation files changed; no merge, push, model or cloud call.

## Findings

No blockers in these hooks:

- **Input identity:** canonical root stays in the adapter closure; the public identity exposes only a deterministic namespaced hash and the overlap operation. Overlap uses path components in both directions, resolves existing symlink ancestors, supports missing directories through their nearest existing ancestor, and conservatively folds case on macOS/Windows. Errors propagate to the caller's fail-closed overlap handling. No target content read or write path is added.
- **Session:** the default store factory/constructors do not create or write files. Notes access goes through `current(id)`, preserving project, revoked-session and indexed-state checks. Null store/input remains unavailable. Snapshot/parser and explanation lifecycles are unchanged.
- **API:** the notes route is a separate exact path match after token, raw-URL and POST Origin checks. Its body callback reuses JSON and 8 KiB bounds; its snapshot callback uses current project/snapshot authority. Fixed NotesError status/code is converted to ApiError and uses the existing no-store JSON response; unexpected exceptions remain sanitized. The notes match cannot consume the cloud preview/session routes.
- **HTTP source:** all seven notes methods reuse ProjectConnection's bearer header and source revocation signal. Snapshot query text is encoded; edit/delete accept only 32 lowercase hex note IDs before constructing a URL. Constructing the methods makes no background request. Path values in note links are snapshot keys, not filesystem reads.

**Cloud preservation confirmed:** removing only the named notes import/hook from project-api.ts yields a byte-for-byte match with `7dc92cd`, including `GET /api/session` with cloud status, `POST …/explanations/preview`, exact bodies, auth/Origin/snapshot checks and NDJSON provider/hash forwarding. The same comparison passes for http-project-source.ts after removing only its named additions. app.ts, shared/project-api.ts and shared/explanation.ts are byte-identical to that baseline, preserving intersection service typing, launch behavior and browser-safe cloud types. The existing project API/client regression test files are also byte-identical and pass.

## Verification

Clean detached checkout pinned to `13d05ad`; git status was empty before and after the gates. No shared author worktree was edited.

| Command / check | Actual result |
|---|---|
| `npm ci --ignore-scripts --offline` | Passed, 65 packages from cache; no scripts/downloads |
| `npm test` | **20 files / 265 passed**, no failures/skips. Default harness forbids sockets/global fetch |
| `npm run build` | Both strict typechecks, server compilation and Vite build passed; **190 modules**. Existing React Flow use-client directive warning only |
| Baseline comparison script (`git show`, removal of named notes additions) | API and HTTP source match `7dc92cd`; app/shared cloud types and original transport tests unchanged |
| Independent scratch client probe against transpiled pinned modules | All seven methods forward exact paths/bodies/query/token/signal; eight malformed-ID edit/delete attempts reject without transport; revoke passes an aborted signal and rejects; close revokes further calls. No background requests; sockets/global fetch disabled |
| Manifest/lockfile, fixture/oracle, parser/resolver and explanation diff against `7dc92cd` | No changes |

Scoped checklist: **Pass** scope/ownership, contract compatibility, dependencies, clean offline verification, unchanged regression checks/oracle, root/storage authority, sanitized API errors and cloud preservation. **N/A** new parser/model/impact/rendering behavior or benchmark claims. **Not checked** full store/status/panel correctness, browser interaction, Linux/MSI behavior, real data-directory persistence and merge documentation outside these hooks. Existing independent notes review and its follow-ups remain separate.

Non-blocking note: `tests/http-project-source.test.ts` does not exercise the new notes methods at `src/client/data/http-project-source.ts:96–119` directly. The independent scratch probe covers their forwarding/ID/revocation behavior; Agent B can preserve those cases in the suite during a later client transport change.

This verdict closes the Codex hook-review gate only. It does not merge notes or close the documented merge-time architecture/status updates and human browser check.
