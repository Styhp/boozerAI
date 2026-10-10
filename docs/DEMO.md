# One-minute demo

Record the actual app and local model. Use the actual MSI setup and the checks below; previous recording evidence does not clear the merged revision or Wi-Fi-off rehearsal. Runtime/model attribution and limitations belong in the video description and [submission disclosures](SUBMISSION.md).

## Prepare

Stop only the identified previous Boozer server with Ctrl-C in its terminal; keep Ollama running. In the trusted Boozer checkout, with the local model already available:

```sh
cd ~/boozer-ai
export PATH="$HOME/.local/opt/node-v24.16.0-linux-x64/bin:$HOME/.local/opt/ollama-v0.40.2/bin:$PATH"
npm test
npm run build
npm start -- --project .
```

Use the launcher's new tab. Do not confirm the folder until recording starts. To demonstrate another repository, replace `.` with its folder. **Choose folder** and **Open another folder** are also implemented; every new selection requires confirmation.

## Recording sequence

| Time | Action | Suggested narration |
|---|---|---|
| 0–10 s | Click **Read this folder**; let indexing finish | “Boozer reads a repository locally and builds this map from parsed imports.” |
| 10–20 s | Select a file, inspect source and relationships | “Each relationship comes from code, and I can inspect its source.” |
| 20–30 s | Open **Chat Boozer** and ask about a named function in the selected file | “I can ask the local model about the code. Thinking shows that it is working.” |
| 30–45 s | Show the streamed answer; expand **Evidence the AI was shown**, then open a citation | “These are the source excerpts the model saw, with links back to the lines.” |
| 45–55 s | Show potential impact and an import chain | “These files could be affected through their imports. This is potential impact.” |
| 55–60 s | Close on the graph | “The graph and chat work locally. Checked citations help me verify answers, but do not guarantee correctness.” |

Generation may exceed the available minute. If editing out waiting time, label the cut with the actual duration from that take; do not speed up footage or use a canned answer as live inference. Show Thinking/Replying honestly. Rehearse one narrow question before recording. A timeout or incorrect answer is not a successful local-AI demonstration.

The written description should identify the actual machine, Ollama 0.40.2, `qwen3:4b-instruct` / Q4_K_M, AI development tools and Athelstan token reuse. Disclose that two of five wider injection phrasings failed in recorded tests; see [BENCHMARKS.md](BENCHMARKS.md). Only claim networking-off operation or GPU performance if measured in the recorded setup.

## Rehearse before the take

1. Complete GitHub sync while online. Use the newly opened launcher tab and click **Read this folder**. Confirm the graph and missing-analysis counts appear.
2. Start the recorder. Disable Wi-Fi and any other internet connection; retain loopback/Ollama. Show the network indicator and run `curl -sS --connect-timeout 3 --max-time 5 https://example.com` in a terminal. It must fail. A browser-only network block does not establish system-wide offline operation.
3. Click a file dot, then a visible faded dot elsewhere: Details must change to each file. Hover, drag, zoom and Fit graph. For an over-cap project, choose a small folder or search; a complete subset under 300 nodes should animate, and Clear should restore the full list.
4. Select `src/server/folder-picker.ts`. In **Chat Boozer**, ask **Which error codes are declared in FolderPickerError? Answer in one sentence.** Observe **Thinking…**, then **Replying…**, then a completed local answer. Record the displayed duration from this take; do not borrow earlier timings.
5. Check the five codes against the constructor: `picker-unavailable`, `picker-busy`, `picker-timeout`, `picker-failed`, `cancelled`. Expand **Evidence the AI was shown**, click the valid citation and inspect the highlighted source. Returning to Chat Boozer should retain the answer. Inspect potential impact and an import-evidence link.
6. Refresh the same browser tab while the server stays running: the graph reconnects without confirmation; chat clears as documented. Rehearse once more after refresh before the real take. Check source/captions at recording resolution and free memory during generation (`free -h`). Keep raw footage and failed takes.

If any answer is incorrect, truncated, times out or follows an injected instruction, record that failure and retry a suitable narrow question; do not edit failure into success. Two of five wider injection phrasings remain known failures. Agent browser checks are implementation evidence; human acceptance and independent review are separate.

## Optional online advice check (separate from offline proof)

With networking enabled, open Chat Boozer and select **OpenAI (preview and send)**. Ask **What if I add Codex here as a coding agent, what are the prerequisites and how should I do it?** Keep **Look up current official OpenAI documentation** checked. Review the exact outgoing request and injection warnings before choosing **Send to OpenAI**. This sends the previewed excerpts/question to OpenAI and can incur generation/search charges. Check repository `[S#]` citations, external `[W#]` documentation links, and whether existing behavior is distinguished from proposals. Record failed requests and incorrect claims. HTTP 403/model_not_found blocked the default `gpt-6-luna`; MSI now explicitly configures `gpt-5.6-luna`, which passed source-free live comparison and official-docs advice checks. Verify the preview shows that configured model before retrying; the actual repository answer remains unverified. This cloud check does not establish offline readiness or execute/install Codex.

## Previous recording, preserved locally

The pre-merge MSI handoff reports `/home/boozer/Videos/BoozerAI/BoozerAI-demo-60s-silent.mp4`: 60 seconds, 1920×1080, 30 fps, H.264, no audio. It includes an uninterrupted local generation wait, a five-code answer with `[S1]`, highlighted `folder-picker.ts` lines 2–13 and an import-source click. The recorded UI displayed 4.0 seconds; an earlier focused rehearsal displayed 7.8 seconds. These are historical take observations, not current measurements or general latency claims.

Raw footage, captions and edit metadata remain in that local video directory. The earlier narration generator failed its missing-key precheck; no speech API call was sent and the human chose silent delivery. Discarded rehearsals included an incorrect cancellation explanation and unsupported absence claims. Wi-Fi remained on; human viewing remains pending. The [full earlier demo record](https://github.com/Styhp/boozerAI/blob/8042c07/docs/DEMO.md) and [handoff](https://github.com/Styhp/boozerAI/blob/8042c07/docs/TASKS.md#m7-demo-handoff--codex-msi-demo-session-2026-10-10-utc8) preserve details. No video publication is authorized by this integration task.

## This integration check

The merged MSI source passed 383 offline tests and the build. The compiled app was checked in installed Chromium: graph clicks including faded nodes, hover/pan/zoom/Fit, Thinking/Replying, a correct five-code local answer, citation lines 2–13 and same-tab refresh all passed. The local answer displayed 7.2 seconds with Ollama 0.40.2 / qwen3:4b-instruct / Q4_K_M; this is a single UI observation. **Wi-Fi was enabled and no recorder was running.** Repeat the numbered rehearsal with the actual recorder and internet disabled before claiming an offline recording. See TASKS.md for commands, evidence and probe failures.

The subsequent chat-retrieval fix passes **386 offline tests and the build**. Asking **how does ollama works here as local ai** now retrieves the documented adapter flow; a real local answer explained Qwen, selected source excerpts and the loopback endpoint, with a working `[S2]` citation to adapter lines 1–9. Thinking/Replying and pane-return retention were observed. This is an optional rehearsal question, with the same recorder/networking-off and independent-review gates still open; it does not replace the numbered checks above.

The current corpus revision passes **399 offline tests and the build**, with one earlier timeout run retained in TASKS.md. Chat can now cite Markdown and actual package manifests; the exact tech-stack question retrieves Node/React/TypeScript/Vite/Vitest evidence and its manifest citation opens. **Answer quality is not approved:** a real stack answer still incorrectly denied cloud/API services, and an authorization answer omitted a check present in its excerpt. Inspect every take against its evidence; do not present those claims as true. The earlier source-comment workaround is removed, and the recorder/offline and independent-review gates remain open.
