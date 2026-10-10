# Set up the graph workspace and Chat Boozer on MSI

Use branch `feat/graph-workspace`, which contains the current graph view, browser refresh recovery and local Chat Boozer. The human authorized its push to the existing `Styhp/boozerAI` repository on 2026-10-10, and the remote branch is verified. The fetch commands below are ready to use. The integrated MSI source passed 383 offline tests, build and compiled-browser graph/chat/citation/refresh checks. Human acceptance, offline and recorder rehearsal remain open. See [validation](BENCHMARKS.md).

Application source includes MSI commits through `8d52d37`, merged with Mac public-doc cleanup `267ccc7`. Use the final integration SHA and check results in [TASKS.md](TASKS.md); the earlier 361-test Mac result does not validate these newer MSI fixes.

In the existing Boozer development checkout on the MSI, first check `git status --short`. Stop if it lists local changes; preserve them before switching branches. Stop the previous Boozer server in its own terminal with Ctrl-C so the new launch serves the rebuilt assets.

```sh
git fetch origin
git switch feat/graph-workspace
git pull --ff-only
git rev-parse HEAD
```

Verify that HEAD matches the final integration SHA supplied by the integrating session. If an existing local branch diverges, stop and inspect it; do not reset or overwrite local work.

The earlier [MSI verification](https://github.com/Styhp/boozerAI/blob/a5ece9d6da3eedbd9e6fb585b2565cfd90d2f7e7/docs/M6-MSI.md) records Node 24.16.0, npm 11.13.0 and Ollama 0.40.2 already installed at these locations. Reuse them; this update needs no new runtime or model download.

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
npm test
npm run build
npm start -- --project .
```

Reuse the installed locked dependencies. The default tests run offline without a model; build includes both typechecks. The launcher preselects Boozer's repo; click **Read this folder** in its new tab. Starting without `--project` opens **Choose folder**; select another project using its native dialog. Linux uses the already-installed zenity; no new download is required on this MSI.

Check these behaviors in the new launch tab:

1. **Choose folder** opens the system dialog; Cancel returns to the start screen. Choose a folder and confirm: the graph opens and **Details / Chat Boozer** appear above the right pane. **Open another folder** in the graph header returns to folder selection without relaunching.
2. Select a file, open Chat Boozer and ask about a named function. **Thinking…** appears before answer text, then **Replying…** while text streams. Local replies can be slow; Cancel remains available.
3. **Evidence the AI was shown** starts closed. Expand it to check the actual excerpts, open a source link, and return to the retained conversation. Checked links do not prove answer correctness.
4. Reload the browser: the analyzed project reconnects while the server stays running. Chat history resets on reload. Restarting the server requires its fresh launch tab.

Local chat needs no API key. The Mac's private `.env` is excluded from Git. Optional OpenAI comparison and repository advice require MSI configuration and explicit preview/send. Advice optionally searches current official OpenAI documentation. `OPENAI_MODEL` selects a model your API project can access; restart after changing it. The default model previously returned HTTP 403/model_not_found. No cloud request is needed for local setup; cloud streaming/search quality remain unverified with this key.

Independent review and human MSI browser/offline/recording acceptance remain separate from terminal and automated-browser checks. Keep known grounding/injection failures in [BENCHMARKS.md](BENCHMARKS.md) visible; historical handoffs and current integration evidence are linked in [TASKS.md](TASKS.md).

M2-PICK and the three MSI graph/input fixes are preserved in the integrated branch. The prior picker handoff records 375 passing tests and actual Chromium/zenity checks; later dimmed-node repair records 383. Those are historical author checks, not independent approval. Use [DEMO.md](DEMO.md) for the current recording checks.
