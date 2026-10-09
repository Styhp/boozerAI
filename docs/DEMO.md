# One-minute demo

Record the actual app and local model. Use the machine you have rehearsed; the latest graph/chat revision is not yet verified on MSI. Runtime/model attribution and limitations belong in the video description and [submission disclosures](SUBMISSION.md).

## Prepare

Stop the previous Boozer server with Ctrl-C in its terminal. In the trusted Boozer checkout, with the local model already available:

```sh
npm run build
npm start -- --project .
```

Use the launcher's new tab. Do not confirm the folder until recording starts. To demonstrate another repository, replace `.` with its folder. No in-app folder picker is implemented.

## Recording sequence

| Time | Action | Suggested narration |
|---|---|---|
| 0–10 s | Click **Read this folder**; let indexing finish | “Boozer reads a repository locally and builds this map from parsed imports.” |
| 10–20 s | Select a file, inspect source and relationships | “Each relationship comes from code, and I can inspect its source.” |
| 20–30 s | Open **Chat Boozer** and ask about a named function in the selected file | “I can ask the local model about the code. Thinking shows that it is working.” |
| 30–45 s | Show the streamed answer; expand **Code the AI was shown**, then open a citation | “These are the source excerpts the model saw, with links back to the lines.” |
| 45–55 s | Show potential impact and an import chain | “These files could be affected through their imports. This is potential impact.” |
| 55–60 s | Close on the graph | “The graph and chat work locally. Checked citations help me verify answers, but do not guarantee correctness.” |

Generation may exceed the available minute. If editing out waiting time, label the cut with the actual duration from that take; do not speed up footage or use a canned answer as live inference. Show Thinking/Replying honestly. Rehearse one narrow question before recording. A timeout or incorrect answer is not a successful local-AI demonstration.

The written description should identify the actual machine, Ollama 0.40.2, `qwen3:4b-instruct` / Q4_K_M, AI development tools and Athelstan token reuse. Disclose that two of five wider injection phrasings failed in recorded tests; see [BENCHMARKS.md](BENCHMARKS.md). Only claim networking-off operation or GPU performance if measured in the recorded setup.
