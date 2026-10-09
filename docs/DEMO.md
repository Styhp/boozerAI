# Demo script

The script for the 3–4 minute submission video and the 06:20 rehearsal on the MSI. Times are UTC+8 on 2026-10-10; the schedule is in [SUBMISSION.md](SUBMISSION.md).

**Ground rules (P-10):** every shot shows real parser output and real local-model output, recorded live on the MSI. Nothing is mocked, canned or pre-recorded. If a shot's feature isn't working at the 06:00 freeze, drop the shot. Don't fake it.

## Status of each shot

Check this table again at 06:00. Only shots marked **Ready** go in the video.

| Shot | Needs | Status (2026-10-09 18:20) |
|---|---|---|
| 1. Offline proof | MSI with Wi-Fi off | Pending: M6 (MSI setup tonight) |
| 2. Open a project | Launcher `--project`, UI confirmation, graph API | **Pending: M2 wiring (Codex).** The map currently shows only the dev fixture preview, which must not appear in the video |
| 3. Map and inspect | Map screen (1.5) on real parser output | Built and unit-tested (1.5, in review). Browser check pending. Real data waits on M2 |
| 4. Local explanation | Explanation panel, ModelAdapter, prompt (M3) | **Pending: M3 not started.** The 1.6 prompt leaked the injection canary, and M3 must fix that |
| 5. Verify a citation | `[S#]` links, citation validator (M3) | Pending: M3 |
| 6. Potential impact | Impact panel (M4) | Built and unit-tested (M4, in review). Browser check pending |
| 7. Technical proof | `npm test`, benchmark numbers | Ready: the parser matches the hand-written answer key (1.4 review). MSI timings pending M6 |

## Shot list (about 3:40)

| Time | Shot | What's on screen | Say (short) | Rubric |
|---|---|---|---|---|
| 0:00–0:15 | Problem | Title card: "Boozer AI: understand unfamiliar code with evidence." | Unfamiliar or AI-written code is slow to read, and AI answers about it are hard to check. | Usefulness |
| 0:15–0:30 | 1. Offline proof | MSI network menu showing Wi-Fi off. A terminal: `curl -sS -m 5 https://example.com` fails. | Everything you'll see runs on this laptop with networking off. | Local AI |
| 0:30–0:50 | 2. Open a project | `npm start -- --project <folder>` (pending M2: confirm the flag), then the in-app confirmation. The summary panel shows files found, parsed and skipped, imports, and "possibly incomplete" reasons. | Boozer reads the project as text, never runs it, and says what it couldn't analyze. | Technical execution, Product |
| 0:50–1:20 | 3. Map and inspect | The map. Click a file: its source with line numbers. Click an arrow: the import line highlighted. Show the full list beside the map. | Every arrow comes from the parser, and each one points at the line that created it. | Technical execution, Innovation |
| 1:20–2:15 | 4. Local explanation | Select a file and ask for an explanation. It streams in. The labels show model `qwen3:4b-instruct`, runtime Ollama, **local**, and the duration. The snippets sent are visible. Trim the wait (see below). | The model runs on this CPU, sees only these snippets, and must cite them. | Local AI, Usefulness |
| 2:15–2:40 | 5. Verify a citation | Click an `[S#]` marker: the cited lines open. If any marker is flagged invalid, show the flag. | Each citation links to real lines. A valid citation shows where a claim came from; it doesn't prove the claim is right. | Innovation, Usefulness |
| 2:40–3:10 | 6. Potential impact | On the same file: "Potentially affected files" at depth 1, then "Expand", then click a chain link to its import line. | These files could be affected through their imports. It's potential, with the chain as evidence. | Innovation, Usefulness |
| 3:10–3:35 | 7. Technical proof | A terminal: `npm test` passing, highlighting the parser-vs-answer-key test. A caption with MSI CPU, RAM, model, quantization, and measured time to first token and total time from M6. | The parser is checked against a hand-written answer key. These timings were measured on this machine. | Technical execution, Local AI |
| 3:35–3:45 | Close | Card: what runs locally; what's planned (GitHub import, agent, cloud options are later phases). | Local-first, evidence-bound, honest about its limits. | Product |

**Which project to open (human lead's choice).** I recommend a real local repository the viewer hasn't seen, such as Boozer's own checkout (34 files and 81 relationships in the 1.4 review), for shots 2–6. That reads as "unfamiliar code" better than the 13-file fixture. Use the fixture only in shot 7 as the known-answer test. If M3 fixes the injection, a 10-second fixture shot of `pricing.ts`, explained without obeying its planted instruction, is strong evidence. Show it only if it passes on the MSI.

## Handling the model wait

On the MSI CPU a full answer is expected to take about 50–60 s (the Mac measured about 52 s; MSI unmeasured until M6).

- Record in real time. Never speed up footage without saying so.
- Show the first streamed words, then cut, with an on-screen caption: **"Cut: about N s of on-device generation. Real time shown in the duration label."** Use the real N from that take.
- End the shot on the finished answer with its duration label readable.
- If the answer fails (runtime error, timeout, leaked canary), don't cut it into a success. Either show the failure state honestly or drop the shot, and tell the human lead before recording continues.

## Words to avoid

Never say "will break", "safe to change", "no impact", "unused" or "dead code". Don't claim GPU acceleration unless M6 measured it, and don't call the app injection-proof. A valid citation is not proof that the explanation is correct.

## Rehearsal checklist (MSI, 06:20–07:00)

Before 06:20:

- [ ] The MSI checkout is at the frozen commit (`git log -1` matches the Mac). `npm ci --ignore-scripts`, `npm run typecheck`, `npm test` and `npm run build` pass on the MSI.
- [ ] `ollama serve` is listening on `127.0.0.1:11434` only (`ss -ltn`), and `/api/tags` shows digest `0edcdef34593…168ba0`.
- [ ] The demo project folder is on the MSI and outside the Boozer checkout.

Rehearsal, with Wi-Fi off:

- [ ] `curl -sS -m 5 https://example.com` fails.
- [ ] Start the app, open the project, and walk shots 2–6 once with a timer. Write down the real first-token and total times.
- [ ] Open the screen recorder, run one explanation with it recording, and note free memory (`free -h`) during generation. This is M6's recording-load check.
- [ ] Don't reload the browser during the take. A reload loses the session token and needs a relaunch (0.2 note N1). Rehearse the relaunch once so a mistake costs seconds.
- [ ] Browser zoom makes source and labels readable at the recording resolution. Close notifications and unrelated windows.
- [ ] Decide which shots are Ready (table above) and cut the rest from the script.
- [ ] If any shot fails, record what failed in TASKS.md under M6 and tell the human lead before 07:00.

Recording (07:00–08:00): record two full takes and keep the better one. Keep the raw files until submission is confirmed.
