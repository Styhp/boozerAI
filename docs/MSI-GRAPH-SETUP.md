# Set up the graph workspace and Chat Boozer on MSI

Use branch `feat/graph-workspace`, which contains the current graph view, browser refresh recovery and local Chat Boozer. The human authorized its push to the existing `Styhp/boozerAI` repository on 2026-10-10, and the remote branch is verified. The fetch commands below are ready to use. This guide does not claim that this new revision has been tested on MSI.

Tested application commit: `feb281978705efe633aa043b0bed6fd945369ee8`. Its exported source passes **361 offline tests / 0 failures / 0 skips** and the build on the Mac without private configuration. The following handoff commit changes documentation only; use the final branch SHA supplied by the Mac when checking your checkout below.

In the existing Boozer development checkout on the MSI, first check `git status --short`. Stop if it lists local changes; preserve them before switching branches. Stop the previous Boozer server in its own terminal with Ctrl-C so the new launch serves the rebuilt assets.

```sh
git fetch origin
git switch feat/graph-workspace
git pull --ff-only
git rev-parse HEAD
```

Verify that HEAD matches the full commit SHA supplied by the Mac. If an existing local branch diverges, stop and inspect it; do not reset or overwrite local work.

The earlier [MSI verification](M6-MSI.md) records Node 24.16.0, npm 11.13.0 and Ollama 0.40.2 already installed at these locations. Reuse them; this update needs no new runtime or model download.

```sh
export PATH="$HOME/.local/opt/node-v24.16.0-linux-x64/bin:$HOME/.local/opt/ollama-v0.40.2/bin:$PATH"
node --version
npm --version
ollama --version
ollama list
```

The existing Ollama service must answer on `127.0.0.1:11434`, with the already approved `qwen3:4b-instruct` model. Boozer checks its full digest `0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0`; the short ID displayed by `ollama list` is not the full digest. A setup error is shown if the service/model is unavailable or mismatched. Do not pull a replacement as part of this update.

Run these commands only in the trusted Boozer app checkout, never in a repository selected for analysis:

```sh
npm ci --ignore-scripts
npm test
npm run build
npm start
```

`npm ci` installs the existing locked app dependencies, including Linux-specific build packages; no dependency was added for chat. The default tests run offline without a model. Build includes both typechecks. The launcher opens the local browser at **Choose folder**. Select Boozer's repo (or another local project) in the system dialog, then click **Read this folder**. The existing `npm start -- --project .` shortcut still works. Linux uses the already-installed zenity; no new download is required on this MSI.

Check these behaviors in the new launch tab:

1. **Choose folder** opens the system dialog; Cancel returns to the start screen. Choose a folder and confirm: the graph opens and **Details / Chat Boozer** appear above the right pane. **Open another folder** in the graph header returns to folder selection without relaunching.
2. Select a file, open Chat Boozer and ask about a named function. **Thinking…** appears before answer text, then **Replying…** while text streams. Local replies can be slow; Cancel remains available.
3. **Code the AI was shown** starts closed. Expand it to check the actual excerpts, open a source link, and return to the retained conversation. Checked links do not prove answer correctness.
4. Reload the browser: the analyzed project reconnects while the server stays running. Chat history resets on reload. Restarting the server requires its fresh launch tab.

Local chat needs no API key. The Mac's private `.env` is excluded from Git. Optional OpenAI comparison is available only if separately configured on MSI and explicitly previewed/sent; no cloud request is needed for this setup.

Independent review and MSI browser/offline/recording checks remain separate from the Mac test/build evidence. Keep the known model-grounding and injection limitations in the existing handoffs visible.

M2-PICK MSI author verification: 375 offline tests and build pass; installed Chromium plus the actual zenity dialog passed selection, cancel, confirmation, graph load, reload and switching. See [folder-picker handoff](M2-PICK-HANDOFF.md). Independent review and human acceptance remain open.
