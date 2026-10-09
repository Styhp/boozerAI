# Project notes, phase 1: handoff

Branch `feat/project-notes`. It was created from local `main`, which was already at `04ddf4f` (`93d300d` plus the docs-only P-17 line in PRODUCT.md). Current `main` (`34a9288`, the P-16 cloud transport in `7dc92cd`) was then merged in, in merge commit `c0ab37a`, so `git diff main` shows only notes changes. Built by one Claude Code session (Agent B, implementer) on 2026-10-09, about 21:32–22:30 UTC+8. Under P-17 it merges only after independent review and a passing full suite by 05:00 UTC+8. Nothing here is on `main`.

**Status:** built and agent-verified. The typecheck, the full suite (also run with networking denied) and the build pass. Human browser check: **not run**. Independent review: **not done**.

## What it does

Notes the user writes, each linked to at most one line range, saved on this computer outside the selected project. Each note is flagged Current, Moved, Stale, Missing or Not linked against the current snapshot. No model is involved: the prompt, retriever, `ModelAdapter` and explanation service are unchanged and never see notes.

- **Off by default.** Notes start disabled on each launch. They turn on when the user clicks "Remember notes for this folder", or when a notes file for this folder already exists from an earlier explicit enable (persisted consent is that file existing). While notes are off, nothing is created in the app data directory (tested).
- **Storage.** One file per folder at `<data dir>/notes-<key>.json`, schema `{ schemaVersion: 1, notes: [...] }`. The data dir is `~/Library/Application Support/Boozer AI/` on macOS. On Linux it is `$XDG_DATA_HOME/boozer-ai/`, falling back to `~/.local/share/boozer-ai/`. `key` = sha256 hex of `"boozer-notes-v1\0" + canonical root`. The directory is mode 0700 and files are 0600. Each write goes to a temp file in the same directory, is fsynced, then renamed over the target. Writes are serialized in-process. Caps: 500 notes, 2,000 chars per note (after trim), 2 MiB per file.
- **A store that fails to read** (corrupt, wrong schema, oversize, unreadable or a symlink) returns `state: 'error'` with a sanitized code. It stays read-only for that launch, and nothing is deleted or rewritten. Graph, source, explanations and refresh keep working (tested through the API).
- **Overlap refusal.** Enable, and every write, is refused with 409 `notes-overlap` when the selected root and the data dir overlap in either direction. The check uses canonical real paths. For a data dir that doesn't exist yet, it uses the nearest existing ancestor. On macOS the comparison is case-insensitive, so it can only refuse more. If the check can't run, it counts as an overlap.
- **Server-stamped links.** The browser sends `{path, startLine, endLine}`. The path must exactly name a source file in the current in-memory snapshot (404 `invalid-file` otherwise). The server stamps the hashes from that snapshot. The browser never sends a hash or a path to read, and no response contains a hash, the key, the root or the data dir (tested).

### Status rules (`src/server/note-status.ts`, pure)

In order:

1. No link: `not-linked`.
2. The file isn't in the snapshot: `missing`.
3. `fileHash` equals the current `contentHash`: `current`.
4. The same range still hashes to `rangeHash`: `current`.
5. The exact line sequence appears exactly once elsewhere: `moved`, with `movedTo`. The link is never updated automatically; "Update link" sends `relink: 'moved'`, which re-stamps.
6. Otherwise (the lines are gone, or appear more than once): `stale`, with `currentText` of the stored range (at most 20 lines).

Lines are split exactly like `sourceLines` in `src/client/map/model.ts` and the retriever. Splitting is on `\n` only, so a CRLF line keeps its `\r`, and a final newline adds no line. A test checks `noteLines` against `sourceLines` on ten inputs, including CRLF.

## Files

New:

- `src/shared/notes.ts`: wire types only.
- `src/server/note-status.ts`: pure status rules, line splitting and hash stamping.
- `src/server/local-store.ts`: `LocalStore`, the only new disk writer. Also holds the data-dir choice and strict schema parsing.
- `src/server/project-notes.ts`: consent, overlap checks, the notes route table and body validation.
- `src/client/components/NotesPanel.tsx` and `NotesPanel.css`
- Tests: `tests/note-status.test.ts`, `tests/local-store.test.ts`, `tests/notes-api.test.ts`, `tests/notes-panel.test.tsx`
- This file.

Hooks in existing files are listed in the next section.

Not touched: fixtures, the hand-written oracle, every existing test, README, TASKS, PRODUCT, ARCHITECTURE, SUBMISSION*, DEMO, and the explanation code. No package was added.

## Hooks for review in Codex-owned files

Each hook is marked in the code with `--- Project notes hook (phase 1) ---` and `--- end project notes hook ---`. Line numbers are on this branch.

| File | Lines | What |
|---|---|---|
| `src/server/local-input.ts` | 4 | adds `dirname` to the `node:path` import |
| `src/server/local-input.ts` | 91–116 | `StorageIdentity` type and the `contains` and `canonicalPath` helpers |
| `src/server/local-input.ts` | 155–171 | `storageIdentity()`: returns `{ key, overlaps(dir) }`. The root stays in the adapter's closure; `JSON.stringify` of the identity doesn't contain it (tested). |
| `src/server/project-session.ts` | 6–7 | imports |
| `src/server/project-session.ts` | 30–47 | Optional third constructor parameter `notesStore` (default `defaultLocalStore()`, which touches no disk). Also `notes(id)`, which uses the same authority as the graph: this project, not revoked, indexed. It returns 404 `notes-unavailable` when there is no store. |
| `src/server/project-api.ts` | 6 | import |
| `src/server/project-api.ts` | 75–88 | Notes route match, placed before the existing route regex and after the existing capability, Origin and URL checks. The body goes through the existing `body()` (JSON + 8 KiB cap), and output through the existing `json()` (no-store). `NotesError` becomes `ApiError`. |
| `src/client/data/project-source.ts` | 3, 23–35 | optional `notes?: NotesSource` and the `NotesSource` interface |
| `src/client/data/http-project-source.ts` | 3, 6 | imports |
| `src/client/data/http-project-source.ts` | 96–119 | `notes` methods over the existing `ProjectConnection` and revocation signal. A note ID must be 32 lowercase hex before it goes into a URL. |
| `src/client/components/DetailPane.tsx` | 7–8, 54, 60–61, 124 | optional `notes` prop. Mounts `NotesPanel` after `ImpactPanel` for file selections only. |
| `src/client/App.tsx` | 103 | **Deviation from the brief:** one prop, `notes={project.notes}`. DetailPane has no other way to reach the project source. The fixture preview has no `notes`, so it renders no panel. |

## Routes

All routes are under `/api/projects/:id/notes`. They use the existing bearer capability, exact Host and Origin, JSON-only POST, the 8 KiB body cap and exact field sets. They also require a confirmed, indexed project (409 `not-indexed` otherwise).

| Method and path | Body or query | Result |
|---|---|---|
| `GET notes` | `?snapshotId=` (exactly this one parameter) | `{ enabled, state, errorCode?, notes: [{ note, status, movedTo?, currentText? }] }`. A stale snapshot returns 409. |
| `POST notes/enable` | `{}` | `{ enabled: true }`. 409 `notes-overlap`. |
| `POST notes/disable` | `{}` | `{ enabled: false }`. Off for this launch; the file is kept. |
| `POST notes` | `{ snapshotId, kind, text, link?: { path, startLine, endLine } }` | `{ note }`. Errors: 404 `invalid-file`, 400 `invalid-range` / `note-too-long` / `invalid-body`, 409 `notes-disabled` / `note-limit` / `store-full` / `store-read-only`. |
| `POST notes/:noteId` | `{ snapshotId, revision, text?, kind?, relink?: 'moved' }` | `{ note }`. Errors: 409 `revision-conflict` / `not-moved`, 404 `note-not-found`. |
| `POST notes/:noteId/delete` | `{ revision }` | `{ deleted: true }` |
| `POST notes/clear` | `{}` | `{ cleared: true }`. Empties this folder's notes and keeps the file, so consent stays. |

## Commands run (macOS 15.7.7 x86_64, Node v24.16.0, npm 11.13.0)

Node 24 was already installed, so nothing was downloaded.

| Command | Result |
|---|---|
| `npm ci --ignore-scripts` | added 65 packages, exit 0 |
| `npm test` on `main` before any change (baseline) | 16 files, 194 tests, all passed |
| `npx vitest run … tests/local-store.test.ts` (first run) | 1 failure: a 5 s timeout, because `toEqual` on 2 MiB Buffers was slow. Fixed by comparing with `Buffer.equals`; then 11/11 passed. |
| `npm run typecheck` (mid-work) | Failed on test-only typing (an `ExplanationErrorCode` literal and two `StoreRead` casts). Fixed in the tests. |
| `npm run typecheck` (final) | exit 0 |
| `npm test` (before merging main) | exit 0. 20 files, 243 tests passed: the 194 existing ones plus 49 new. |
| `git merge main` (brings in `7dc92cd`, `34a9288`) | Conflicts in `src/server/project-api.ts` (route regex next to the notes hook) and `src/client/data/http-project-source.ts` (imports; the notes block next to `#previewCloud`). Both resolved by keeping both sides unchanged. `tests/notes-api.test.ts` then failed typecheck: the service double needed main's new `CloudComparison` members, copied from main's `project-api.test.ts` double. |
| `npm test` (final, after merge) | exit 0. **20 files, 261 tests passed**. Main's 16 files on the merged code alone (`vitest run` with the 4 notes files excluded) give 212 passed, so 212 existing plus 49 new. |
| `sandbox-exec -p '(version 1)(allow default)(deny network-outbound (remote ip))(deny network-outbound (remote unix-socket))' /bin/sh -c 'curl … http://1.1.1.1; npm test'` | Inside the sandbox, curl failed with "Couldn't connect to server". Before the merge: `npm test` exit 0, 243 passed. After the merge: `npm test` exit 0, **20 files, 261 tests passed**. |
| `npm run typecheck` and `npm run build` (after merge) | both exit 0 |
| `npm run build` | exit 0. The only warning is the existing `@xyflow/react` "use client" directive warning. |
| Scratch smoke (`node <scratchpad>/smoke.mjs dist <worktree>`, not committed) | Ran on Boozer's own repo (88 files) with a temp data dir. Before enable: `{"enabled":false,…}`, and the data dir did not exist. 300 linked notes saved in 13.7 s (about 45 ms each, fsync per save). After a line was inserted at the top of the biggest file, listing the 300 notes took 13 ms: 288 moved, 12 stale (the stale ones are ranges whose lines repeat elsewhere, so "ambiguous" applies). |

## Verified and not verified

Verified by tests (agent, terminal only):

- **Status rules:** current; current with a changed file but the same range; moved after an insert above; stale after an edit; stale when duplicated elsewhere; still current when duplicated but the original still matches; missing; not-linked; CRLF; empty-line ranges; the 20-line bound on current text.
- **Store:** survives a restart (a new instance); a failed atomic rename leaves the old bytes and no temp file; modes 0700 and 0600; the note cap and size cap write nothing; concurrent in-process writes are all kept. Corrupt, wrong-schema and oversize files report an error, become read-only and keep their bytes. An unreadable file, and a symlinked file, are reported and the link is never followed.
- **Overlap and identity:** overlap is detected in both directions, including through a symlink and on a not-yet-created directory; a sibling with a shared name prefix is not an overlap; two roots get different keys.
- **API:** 401, 403 and 415/413 on every notes route; 404 for a wrong project; 409 for an unindexed project and for a stale snapshot; 400 for extra or invalid fields; 404 `invalid-file` for paths outside the snapshot, including a secret-named file, `../`, an absolute path and the wrong case. Responses contain no root, key, data dir or 64-hex hash. With notes off, no data dir is created across session/confirm/graph/file/explanations/refresh/notes routes. The full lifecycle works across a restart, including moved, relinked, stale and missing. A corrupt store doesn't affect graph, file, explanations or refresh. Close revokes the notes routes. The explanation service is never called by notes routes.
- **Panel:** off, error, failed and on states; all badges; stable control IDs; hostile note and line text is escaped. Only a `current` note renders a clickable range, and the existing range view highlights exactly those lines. Moved, stale and missing render plain text. Mounted by DetailPane only for file selections, and only with a notes source.

Not verified:

- Anything in a real browser: clicks, focus, layout, reloads. The panel tests are static renders, because there is no DOM test library and none was added.
- The real `~/Library/Application Support/Boozer AI/` path was never written. Tests and the smoke used temp directories.
- Linux paths and modes: not run on Linux.
- Two launcher processes writing the same folder's notes at once. There is no cross-process lock (see open questions).

## Human browser check

Run this from a checkout of `feat/project-notes`. It writes to the real app data dir. Back it up first if it already exists.

1. Run `npm run build`, then `npm start -- --project .`. Click **Confirm and index**.
2. In the list, click `src/shared/notes.ts`. Below the impact panel, expect "Your notes", then "Notes are off for this folder." with a **Remember notes for this folder** button, and "Notes are saved on this computer, outside the project folder." In a terminal, `ls ~/Library/Application\ Support/Boozer\ AI/` should show no new `notes-*.json` file.
3. Click **Remember notes for this folder**. Expect the form (Kind, Your note, Link to these lines, Lines 1 to 1, Save) and "No notes on this file yet."
4. Set Kind to Decision, text "Keep wire types hash-free.", Lines 8 to 9, leave **Link to these lines** checked, and click **Save**. Expect the note with badges `Decision` and `Current`, and a link `src/shared/notes.ts:8–9`.
5. Click that link. Expect "Cited lines 8–9" with exactly lines 8–9 highlighted (`export interface NoteLink {` and the `file` line).
6. Stop the launcher (Ctrl-C), run `npm start -- --project .` again, confirm, and select `src/shared/notes.ts`. Expect the note back, still Current, without clicking enable. Then `ls -la ~/Library/Application\ Support/Boozer\ AI/` should show one `notes-<64 hex>.json` with `-rw-------` in a `drwx------` directory. `git status` in the repo should show no new files.
7. Set up a scratch folder: `mkdir ~/boozer-notes-scratch && cp src/shared/notes.ts ~/boozer-notes-scratch/notes.ts`. Use a folder under home: `/tmp` is a symlink on macOS, and the launcher refuses symlinked roots. Stop the launcher and run `npm start -- --project ~/boozer-notes-scratch`. Confirm, then select `notes.ts`. Expect "Notes are off for this folder.": the second folder sees none of the first folder's notes.
8. Click **Remember notes for this folder**. Add a note on lines 8 to 9 and save. Expect Current.
9. In an editor, add one new line at the very top of `~/boozer-notes-scratch/notes.ts` and save. Click **Refresh snapshot**, then select `notes.ts`. Expect badge **Moved**, "These exact lines are now at 9–10. The link was not changed.", the range `notes.ts:8–9` as plain text (not clickable), and an **Update link** button. Click **Update link**. Expect **Current** with link `notes.ts:9–10`, which highlights lines 9–10 when clicked.
10. Change line 10 in the editor (for example rename `file` to `path`) and save. Click **Refresh snapshot** and select `notes.ts`. Expect badge **Stale**, "The linked lines changed since this note was saved. Lines 9–10 now read:" followed by the new text, and no clickable link or highlighting.
11. Optional, on the scratch folder only:
    1. Stop the launcher and find the newest `notes-*.json` in the data dir: `ls -t … | head -1`.
    2. Append `garbage` to it, restart on the scratch folder and confirm.
    3. Expect "Notes couldn't be read (store-corrupt). Nothing was changed. The rest of Boozer works normally." The map, source, explanation and impact should still work, and the file should be unchanged.
12. Clean up: `rm -rf ~/boozer-notes-scratch`. Remove the scratch folder's `notes-*.json` by hand if you want; "Delete all notes…" empties it but keeps the file.

## Open questions and follow-ups

1. **The `App.tsx` one-line change is outside the brief's file list.** I chose it over a global or context hack. Is that acceptable to the merging session?
2. **Notes without a link** belong to no file. They appear in a collapsed "Notes not linked to lines (N)" list under every file. Keep this, or drop unlinked notes from phase 1?
3. **The lines default is always 1–1.** The panel shows only for file selections, and nothing is highlighted there, so "default to the highlighted evidence range" never applies. Showing the panel for range selections too would make it apply.
4. **Clicking a current note's link has no "Back" link.** It opens the existing range view without `returnTo`, because that link's label reads "Back to the explanation of …", which would be wrong for a note.
5. **Added beyond the brief:** a stored `headHash` (sha256 of the first linked line) narrows the moved-lines search, and linked ranges are capped at 200 lines (`invalid-range`). Without these, the search cost on a large file is unbounded. Both also apply when parsing a stored file.
6. **No in-app way out of a corrupt store.** The store is read-only, and clear is refused too, so the user must fix or remove the file by hand and restart. A failed read also stays failed for the whole launch.
7. **No cross-process lock.** Two launchers on the same folder could lose an update in the short window between read and rename. Single-process writes are serialized, and revision checks run against the file just read.
8. **Docs need updating before or at merge.** I did not edit them, as instructed. ARCHITECTURE "Local storage and cache" still says "nothing is written to disk by the demo app"; S-11 persistence is still Proposed; the M2 routes table has no notes routes; and the security model needs the notes boundary. ARCHITECTURE also mentions a future "clear-local-data action" and disk budget, neither of which exists. TASKS needs a status line.
9. **Linux data dir:** the code reads `XDG_DATA_HOME` (absolute values only) and `os.homedir()` (`HOME`), and no other environment variable.
