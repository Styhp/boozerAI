# Demo script

The script for the 3–4 minute submission video and the 06:20 rehearsal on the MSI. Times are UTC+8 on 2026-10-10; the schedule is in [SUBMISSION.md](SUBMISSION.md).

**Ground rules (P-10):** every shot shows real parser output and real local-model output, recorded live on the MSI. Nothing is mocked, canned or pre-recorded. If a shot's feature isn't working at the 06:00 freeze, drop the shot. Don't fake it.

## Status of each shot

Check this table again at 06:00. Only shots marked **Ready** go in the video.

| Shot | Needs | Status (2026-10-09 18:45) |
|---|---|---|
| 1. Offline proof | MSI with Wi-Fi off | Pending: M6 (MSI setup tonight) |
| 2. Open a project | Launcher `--project`, UI confirmation, graph API | Implemented, M2 in review. Agent verified explicit dev confirmation and the real own-repo map; human/MSI rehearsal pending. No fixture preview in video |
| 3. Map and inspect | Map screen (1.5) on real parser output | Built, approved (1.5); own-repo HTTP source and import highlight verified by agent. Human/MSI acceptance pending |
| 4. Local explanation | Explanation panel, ModelAdapter, prompt (M3) | Built; M2 route completed a real local explain-v3 request over Boozer's snapshot. M2/M3 independent review and human browser/MSI rehearsal pending |
| 5. Verify a citation | `[S#]` links, citation and file-name checks, injection warning (M3) | Built and tested (M3, in review); native route returned current-snapshot snippets. Citation click in the live app and human/MSI rehearsal pending |
| 6. Potential impact | Impact panel (M4) | Built, approved (M4, C10 fixed). Browser check pending |
| 7. Technical proof | `npm test`, benchmark numbers | Ready: the parser matches the hand-written answer key (1.4 review). MSI timings pending M6 |

## Shot list (about 3:40)

| Time | Shot | What's on screen | Say (short) | Rubric |
|---|---|---|---|---|
| 0:00–0:15 | Problem | Title card: "Boozer AI: understand unfamiliar code with evidence." | Unfamiliar or AI-written code is slow to read, and AI answers about it are hard to check. | Usefulness |
| 0:15–0:30 | 1. Offline proof | MSI network menu showing Wi-Fi off. A terminal: `curl -sS -m 5 https://example.com` fails. | Everything you'll see runs on this laptop with networking off. | Local AI |
| 0:30–0:50 | 2. Open a project | `npm start -- --project <folder>` (pending M2: confirm the flag), then the in-app confirmation. The summary panel shows files found, parsed and skipped, imports, and "possibly incomplete" reasons. | Boozer reads the project as text, never runs it, and says what it couldn't analyze. | Technical execution, Product |
| 0:50–1:20 | 3. Map and inspect | The map. Click a file: its source with line numbers. Click an arrow: the import line highlighted. Show the full list beside the map. | Every arrow comes from the parser, and each one points at the line that created it. | Technical execution, Innovation |
| 1:20–2:15 | 4. Local explanation | Select **the file chosen in rehearsal** (checklist below) and ask for an explanation. It streams in. The labels show model `qwen3:4b-instruct`, runtime Ollama, **local**, and the duration. The snippets sent are visible. If a "Possible prompt injection" warning appears, keep it on screen; never crop it out. Trim the wait (see below). | The model runs on this CPU, sees only these snippets, and must cite them. | Local AI, Usefulness |
| 2:15–2:40 | 5. Verify a citation | Click an `[S#]` marker: the cited lines open; click "Back to the explanation". If a marker or file name is flagged with `?`, or a warning is shown, show it and click its link. | Each citation links to real lines. A valid citation shows where a claim came from; it doesn't prove the claim is right. | Innovation, Usefulness |
| 2:40–3:10 | 6. Potential impact | On the same file: "Potentially affected files" at depth 1, then "Expand", then click a chain link to its import line. | These files could be affected through their imports. It's potential, with the chain as evidence. | Innovation, Usefulness |
| 3:10–3:35 | 7. Technical proof | A terminal: `npm test` passing, highlighting the parser-vs-answer-key test. A caption with MSI CPU, RAM, model, quantization, and measured time to first token and total time from M6. Then the **injection disclosure** caption (below). | The parser is checked against a hand-written answer key. These timings were measured on this machine. Prompt injection is partly resisted, not solved. | Technical execution, Local AI |
| 3:35–3:45 | Close | Card: what runs locally; what's planned (GitHub import, agent, cloud options are later phases). | Local-first, evidence-bound, honest about its limits. | Product |

**Project (P-14, decided).** Shots 2–6 open Boozer AI's own repository (49 nodes and 144 relationships at `d964188`). The fixture appears only in shot 7 as the known-answer proof.

**Injection disclosure (required, P-10 honesty).** Show this caption in shot 7, and keep it in the written answers:

> Prompt injection: partly resisted, not solved. A hidden instruction planted in our test project was obeyed in 0 of 24 runs. Two of five differently worded instructions in other test files were still obeyed. Boozer shows a warning where code contains text addressed to AI tools.

These numbers come from the Mac (docs/BENCHMARKS.md, M3 section). If M6 re-runs them on the MSI, use the MSI numbers and say so. Boozer's own repo contains its injection test cases (`tests/model/injection-variants.test.ts`) and its prompt (`src/server/explain/prompt.ts`), so explaining either should trigger the warning. Don't use them for shot 4 unless rehearsal showed exactly what happens.

## Handling the model wait

With the final prompt, whole answers took 16–65 s on the contended Mac (125–180 tokens). The MSI is unmeasured until M6.

- Record in real time. Never speed up footage without saying so.
- Show the first streamed words, then cut, with an on-screen caption: **"Cut: about N s of on-device generation. Real time shown in the duration label."** Use the real N from that take.
- End the shot on the finished answer with its duration label readable.
- If the answer fails (runtime error, timeout, an obeyed injection), don't cut it into a success. Either show the failure state honestly or drop the shot, and tell the human lead before recording continues.

## Words to avoid

Never say "will break", "safe to change", "no impact", "unused" or "dead code". Don't claim GPU acceleration unless M6 measured it. Don't call the app injection-proof or say the warning catches every injection; it was written after seeing the test phrasings. A valid citation is not proof that the explanation is correct.

## Rehearsal checklist (MSI, 06:20–07:00)

Before 06:20:

- [ ] The MSI checkout is at the frozen commit (`git log -1` matches the Mac). `npm ci --ignore-scripts`, `npm run typecheck`, `npm test` and `npm run build` pass on the MSI.
- [ ] `ollama serve` is listening on `127.0.0.1:11434` only (`ss -ltn`), and `/api/tags` shows digest `0edcdef34593…168ba0`.
- [ ] The demo project folder is on the MSI and outside the Boozer checkout.

Rehearsal, with Wi-Fi off:

- [ ] `curl -sS -m 5 https://example.com` fails.
- [ ] Start the app, open the project, and walk shots 2–6 once with a timer. Write down the real first-token and total times.
- [ ] **Choose the shot-4 file now and read its whole answer.** Pick one source file in Boozer's repo, explain it, and check: every citation is valid, no file name is flagged `?`, the answer isn't marked "cut short", and you know whether the injection warning appears. Use that same file in the take, so its result is known. If anything in the answer is wrong or surprising, pick another file and repeat.
- [ ] The model is already loaded (the app preloads it at start). The first explanation in the take shouldn't pay the cold-start load.
- [ ] Open the screen recorder, run one explanation with it recording, and note free memory (`free -h`) during generation. This is M6's recording-load check.
- [ ] Don't reload the browser during the take. A reload loses the session token and needs a relaunch (0.2 note N1). Rehearse the relaunch once so a mistake costs seconds.
- [ ] Browser zoom makes source and labels readable at the recording resolution. Close notifications and unrelated windows.
- [ ] Decide which shots are Ready (table above) and cut the rest from the script.
- [ ] If any shot fails, record what failed in TASKS.md under M6 and tell the human lead before 07:00.

Recording (07:00–08:00): record two full takes and keep the better one. Keep the raw files until submission is confirmed.
