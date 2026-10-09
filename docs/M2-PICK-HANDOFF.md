# M2-PICK — Choose folder on MSI

Codex, MSI folder-picker session, 2026-10-10 about 06:08 UTC+8. **In review; Claude's independent review and human acceptance remain open.** Base: `e12a04a` on `feat/graph-workspace`. The human requested the missing start button after the transfer; this implements the already assigned M2-PICK scope on this device.

Starting `npm start` now opens **Open a project → Choose folder**. The native dialog returns a selected folder for **Read this folder** confirmation. **Open another folder** is visible in the graph header and returns to selection without a server restart. CLI preselection remains available. No source is read before confirmation; the browser cannot supply a filesystem root.

Changed paths:

- `src/server/folder-picker.ts`: one native-dialog boundary, fixed `execFile` arguments (no shell), Linux zenity / macOS osascript, one dialog at a time, 60-second timeout, 16 KiB output cap, cancellation and sanitized errors. Existing installed executables only; no package/runtime/model installation.
- `src/server/project-session.ts`: mutable current selection behind the same launch capability; picker injection for tests; shared project cleanup retires input, snapshot, notes instance and active model streams. Picking cannot overlap indexing or another picker. Disconnect/shutdown rejects late selections. A replacement receives a new project ID and requires confirmation. Explicit Close still revokes the whole capability.
- `src/server/project-api.ts`, `src/shared/project-api.ts`: `POST /api/session/pick`, exact empty JSON body, existing bearer/Host/Origin/body controls; selected basename/ID or cancellation response. No root, command or native-dialog options accepted from the browser.
- `src/client/data/http-project-source.ts`, `ProjectGate.tsx`, `App.tsx`, `workspace/Workspace.tsx`: start button, immediate disabled choosing state, cancellation/error recovery, confirmation, workspace switch button, cancellation of old source requests, and late-response rejection. Launcher-help instructions now use `npm start`.
- `tests/folder-picker.test.ts`, `tests/project-api.test.ts`, `tests/http-project-source.test.ts`: process-policy doubles, API auth/CSRF/body rejection, deferred reading, root replacement, old-project revocation, cancellation/concurrency/error checks, client transport and late-response checks. Existing checks were not removed or weakened.
- README.md, docs/ARCHITECTURE.md, PRODUCT.md, MSI-GRAPH-SETUP.md, TASKS.md and this report: matching behavior and task status. MSI-only diagnostic scripts/results under `docs/benchmarks/m2-picker-*msi*` record the real browser/native run and final startup. No fixture/oracle or package-lock change.

Verification on MSI Bravo 15 / Parrot 6.4, Node 24.16.0, npm 11.13.0:

| Command | Actual result |
|---|---|
| `npm test -- tests/folder-picker.test.ts tests/project-api.test.ts tests/http-project-source.test.ts` | Exit 0; 3 files / 69 tests |
| `npm run typecheck` | Exit 0 |
| `npm test` | Exit 0; 28 files / **375 passed, zero failures/skips**, model-free/offline |
| `npm run build` | Exit 0; both strict typechecks, server compilation, **208 client modules** |
| `node docs/benchmarks/m2-picker-browser-msi.mjs` | Exit 0; **10 browser/native checks passed** |
| Node 24 `dist/server/index.js` with no project argument | Process remains running; normal launcher opened a fresh browser tab; loopback root HTTP 200 |
| `git diff --check` | Exit 0 |

The browser probe uses **installed Chromium**, the actual compiled HTTP app/session/input adapter, and **actual zenity**, without model inference. It does not insert a precomputed graph or fake a dialog. The task-owned Python helper sends X11 keys only to Boozer's exact named dialog, choosing Boozer's own repo; no clipboard or personal-browser state is used. The isolated Chromium profile is removed afterwards. Its capability stays in memory and is not printed or committed.

Verified sequence: no-project start → visible Choose folder → immediate choosing state → native Cancel → start screen → real folder selection → confirmation without indexing → Read this folder → actual graph workspace/Chat Boozer → browser reload → Open another folder → Cancel with old project unreadable → choose again without restart → fresh project ID. [Raw browser/native results](benchmarks/m2-picker-browser-msi.json). The final normal application launch is [recorded here](benchmarks/m2-picker-launch-msi.json); it is left running on `127.0.0.1:4173` for the human at the new start screen.

Warnings retained: existing unknown npm `allow-scripts` configuration, React Flow `use client` directive warning, and the existing large-client-chunk warning. No failing implementation test/build/native run occurred. Exploratory reads of nonexistent `Topbar.tsx`/browser test filenames and a nonexistent workspace CSS glob failed; the actual modules were located with `rg` and inspected. `xdotool`/`wmctrl` were absent, so the manual native probe used already-installed X11 libraries and Chromium; nothing was downloaded.

Not verified: native macOS execution (argument/cancel behavior covered with process doubles), human visual/accessibility acceptance, a physical 60-second timeout run (execFile timeout configuration and sanitized killed-process result are tested), new model quality/performance, networking-off rehearsal or recorder headroom. Existing M6 injection/grounding limitations are unchanged. The dialog opens on the server machine; this is the loopback local app. Canceling a replacement returns to an empty start screen because the previous project has already been closed.

Human check: use the newly opened launcher tab, click **Choose folder**, cancel once, then choose a project and click **Read this folder**. Check that the graph appears and **Open another folder** opens the system dialog again. Independent reviewer should rerun the terminal gates and check the new authenticated route, root/notes/stream cleanup and retained Close revocation. This is author evidence, not self-approval. Implementation is local; earlier MSI-evidence push permission does not authorize pushing these app-code changes.
