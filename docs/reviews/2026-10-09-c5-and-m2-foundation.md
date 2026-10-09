# Review: C5 recheck and M2 snapshot foundation

**Reviewer:** Claude Code (review chat), 2026-10-09, about 17:10–17:30 AWST.
**Reviewed:** `c3847f2` (C5 fix) and `d930b2f`, `fc50f19`, `46cf19c` (M2 foundation), all by Codex, on `main` at `58bb47e`. The reviewer authored none of them.
**Why this is a separate file:** Agent B was editing TASKS.md for 1.6 during this review, so this report stays out of that file to keep one editor per doc. The review-log rows are added to TASKS.md once Agent B's edits are committed.

## Verdicts

| Item | Verdict |
|---|---|
| C5 recheck (dev-proxy Origin) | **Approved.** C5 is resolved. |
| M2 snapshot foundation | **Approved with condition C7.** 1.4 can integrate against it. C7 must be fixed before M2 opens a real repository: the launcher/UI wiring, the demo, and M6. Owner: Codex. |

## Re-run from a clean clone at `58bb47e`

| Command | Result |
|---|---|
| `npm ci --ignore-scripts --offline` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` under `sandbox-exec … (deny network*)` | exit 0, 3 files / 37 tests |
| `npm run build`, network denied | exit 0 |

**C5, end to end.** My clone's processes were confirmed on both ports.

| Probe | Result |
|---|---|
| Dev proxy `GET /api/x` with `Origin: http://127.0.0.1:5173` | 404, reaches the app (was 403) |
| Dev proxy `POST` with the same Origin | 405, reaches the app |
| Dev proxy with `Origin: http://evil.example` or `http://localhost:5173` | 403 |
| Vite with `Host: evil.example` | 403 |
| Production `GET /` with `Origin: http://127.0.0.1:5173` | 403; production never enables the dev origin |
| Production `GET /` with no Origin | 200 |
| Production with `Host: localhost:4173` | 403 |

Both ports were released after stop. The new tests cover lookalike origins (`https://`, a trailing `/`, `:51730`).

**M2, a probe that ran the built adapter on an inert temporary folder** containing `src/small.ts` and `src/vendor/huge.min.js` (1,500,004 bytes), with networking denied: `snapshot()` threw `InputError: file-bytes-limit`, and **no snapshot was produced**.

## Condition C7 (Codex, before M2 opens real repositories)

One supported file over the 1 MiB per-file cap aborts the entire snapshot (`src/server/local-input.ts:234` and `:253`). Siblings whose names differ only in case also abort it (`:208`). The shared contract defines `oversize` and `case-collision` as **skip** reasons (`src/shared/contracts.ts:13–15`), but neither is ever emitted. In practice, any project with a vendored or minified library over 1 MiB, outside the pruned folders, cannot be opened at all. That is a usability failure on exactly the "real repository" the demo needs.

Proposed fix (Codex decides and documents it in ARCHITECTURE.md):

- A file over `maxFileBytes` becomes an `oversize` skip: not read, but counted. Keep the file-count, total-bytes, entry and depth caps as aborts, because those protect the whole run.
- Case collisions become `case-collision` skips of the colliding entries rather than an abort. Keep an abort only if you can show that skipping would misrepresent resolution.
- Add tests for both, including a growing file that crosses the cap during the read, which may still abort.

Once fixed, the M2 check "binary/oversize handling … verified" is accurate. It is currently ticked for abort behavior that contradicts the contract.

## Non-blocking notes

- **N1.** `secretName` (`local-input.ts:51–56`) also matches ordinary source names such as `auth-credentials.ts` or `use-secret.ts`. They're excluded and counted, which is safe. The coverage list should make this visible to users.
- **N2.** An unreadable subdirectory aborts the whole snapshot (`:287–289`). Consider the same skip-and-count approach as C7. Lower priority.
- **N3.** The ancestor-symlink rejection refuses folders under macOS `/tmp` or `/var` (symlinked system directories). That's acceptable, but the launcher's error message should say why.
- **N4.** Native case-collision behavior is unverified, because this Mac's filesystem is case-insensitive. The MSI's ext4 is case-sensitive, so check it in M6.

## Checklist

| Area | Result |
|---|---|
| Scope (server-only foundation, no API, UI, parser or packages) | Pass |
| Dependencies | N/A (none added) |
| Docs | Pass |
| Clean-checkout re-run | Pass |
| Offline default suite | Pass |
| Weakened checks | Pass. The case-collision test became a labeled simulation because of the case-insensitive filesystem; disclosed. |
| Ticked checks have evidence | Pass, except the oversize wording (C7) |
| Text-only reads, no-follow opens, root confinement, only the input adapter reads target files, no network | Pass |
| Honesty | Pass |

**Not checked:** native case collisions, real-time file-replacement races beyond the tests, the MSI, and the launcher, UI and API (not built yet).
