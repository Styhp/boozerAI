# C8 skipped resolution candidates

Owner: Codex (Agent A, this session), 2026-10-09. Scope claimed: fix the 1.4 resolver/hand-written tests and matching architecture/handoff documentation after the independently Approved-with-C8 review at `9576e50`. C8 is the parser coverage correction needed alongside C7 before M2 wiring; no additional input/API/UI/model feature. Existing 1.4/M2 ownership applies. TASKS.md and fixture README status/interpretation updates will be made once shared-document editing is free; source fixtures and the oracle remain unchanged.

Contract: inspect the documented exact/extension/JS-to-TS/index candidate list in order, returning the first source or known skip outcome. Exclusion uses that actual candidate's path/reason. No match remains `not-found`. A later source file cannot hide an earlier known skipped candidate. This explicitly replaces the earlier exact-specifier-only rule; it does not regenerate or change oracle output. Resolver version advances to `snapshot-relative-v2` in `ANALYSIS_KEY`.

**Status: In review; correction implemented, independent C8 recheck pending.** 1.4 is independently Approved with C8 (S-4 Accepted); C7 is implemented at `22ba446`. Both corrections precede M2 launcher/UI/API wiring; no wiring was performed.

Files changed: `src/shared/resolver.ts`, `tests/extractor.test.ts`, `tests/local-input.test.ts`, ARCHITECTURE.md and this report. Existing exact-skip precedence expectation changed by hand to reflect Claude's reviewed C8 contract, not by generating output. The approved 1.3 source/oracle bytes remain untouched.

Hand-written cases cover extensionless credentials, `.js` -> binary `.ts`, excluded directory index, extensionless oversize/case collision, an earlier exclusion ahead of a later supported candidate, a source ahead of a later exclusion, and genuine absence. A native inert folder supplies credentials.ts, binary data.ts and vendor/index.ts, a source above 1 MiB, and one importer: **5 found / 1 parsed / 4 skipped**, **4 imports / 4 excluded / 0 failed**, with actual candidate paths and matching reason codes. Secret and oversize paths are never opened. No target code/config is executed or installed.

Initial network-denied `npm test`: exit 0, **7 files / 105 tests** including Agent B's in-progress M4 tests; C8 adds one resolver case and one native adapter/parser case. `npm run typecheck` then failed in Agent B's actively edited `src/client/components/DetailPane.tsx:81` because `ImpactPanel` was not yet imported. That concurrent UI failure is preserved here and is not attributed to the resolver or silently repaired by Codex. Final committed-checkout checks will be recorded below.

Pending: independent C7/C8 recheck, shared-doc status/fixture-interpretation updates once free, browser/token/project wiring, native MSI case-collision proof and the existing non-blocking parser notes. No package/shared-wire-shape, launcher, model, benchmark, publication or push changes by this session.
