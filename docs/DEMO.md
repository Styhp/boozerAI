# One-minute MSI demo

The human lead requested a **60-second video**, initially with natural AI narration; the human then chose a **silent version for now** when no API key was configured on 2026-10-10 (UTC+8). This replaces the earlier 3–4-minute storyboard. M7 publication and submission remain with the human lead.

## Current production

Codex (MSI demo session) recorded the real production app at application commit `8d52d37`, opening Boozer AI's own repository. Footage and production files are local at `/home/boozer/Videos/BoozerAI/`; video binaries and credentials do not belong in Git. The screen capture uses installed Chromium on an isolated X11 display and ffmpeg at 1920×1080, 30 fps, without desktop audio.

The app reads the chosen folder through its normal input/parser/session routes. Chat runs through the real local model adapter, using Ollama 0.40.2 and `qwen3:4b-instruct` on the MSI. No fake model replies, substituted source text or graph edges are used.

## Narration

> Ever opened a codebase and had no idea where to start? Meet Boozer AI.
>
> Open a local project, and its imports become an interactive map. Pick a file to explore the code and the connections around it.
>
> Got a question? Just ask Boozer. Here, we're asking which errors the folder picker can report. The answer streams from a model running right here on this laptop.
>
> And you don't have to take its word for it. Click a citation to jump straight to the source lines. You can also see which files might be affected by a change, and follow the imports behind that connection.
>
> That's Boozer AI: a way into unfamiliar code, with the evidence right beside you.

The exact text and speech request are prepared in `narration.txt` and `speech-request.json` in the local video directory. The proposed voice was OpenAI Cedar, with conversational delivery directions. The human approved the narration-only cloud request, but the generator stopped locally because this device had neither the ignored `.env` nor an exported key. **No cloud request was sent.** The human then requested the silent version. If narration is added later, use the already prepared request and put **AI-generated narration** visibly in that version. The current silent cut contains action captions and no audio track.

## Storyboard

| Approximate time | Actual footage |
|---|---|
| 0–4.5 s | Recorded confirmation and reading state for the chosen local project |
| 4.5–17.8 s | Recorded animated graph, hover/click, selected folder-picker file and chat navigation |
| 17.8–25.1 s | Type the question and show the entire real local generation wait |
| 25.1–31.7 s | Finished answer, source-link caution, model/runtime and 4.0-second label |
| 31.7–38.5 s | Click the citation; inspect highlighted constructor source |
| 38.5–44.2 s | Potentially affected files and the incompleteness warning |
| 44.2–49.13 s | Click the import-evidence link and inspect its highlighted source |
| 49.13–60 s | Recorded graph hover/drag/movement with closing caption |

The entire video is app footage: **no slides, screenshots, freeze frames or sped-up generation**. Editing joins three actual X11 recordings, adds action captions, and gently zooms toward the chat/source pane for readability. The main 44.63-second take remains continuous, including its entire generation wait.

## Rehearsal evidence and limits

The chosen question is: **Which error codes are declared in FolderPickerError? Answer in one sentence.** The focused rehearsal returned all five literal constructor codes and one valid citation. Clicking that citation highlighted lines 2–13 of `src/server/folder-picker.ts`, including the constructor. Its UI showed 7.8 seconds while ffmpeg was recording; this is an observed rehearsal duration, not a formal M6 benchmark or a general latency claim.

Discarded rehearsal: asking what happens when a user cancels the picker produced a misleading error-vs-null explanation despite valid citation links. A second broad error-code question included unsupported absence claims beyond its correct list. Neither answer belongs in the final cut. The actual take was checked: its answer lists exactly the five constructor codes with one valid `[S1]` citation, highlights lines 2–13, and displays 4.0 seconds. The impact panel lists three direct importing files, then the clicked chain opens the import in `src/server/project-session.ts`.

Wi-Fi remains on: the human could not disable it. This video must not claim a Wi-Fi-off rehearsal, injection resistance, complete analysis, guaranteed impact, or submission readiness. Existing M6 gates and independent review statuses remain open. The graph's incompleteness warnings and the answer's citation caution remain visible; a valid source link is not proof that an AI claim is correct.

## Delivery checks

- Verify the actual take's entire answer against the constructor and click its citation.
- Check final video duration, resolution, codecs, absence of an audio track for this silent version, and representative frames.
- Preserve raw footage and metadata for the human lead.
- Human acceptance covers readability and final viewing. Voice naturalness is unverified because no voice was generated.
- Do not upload, publish, push, or mark the complete M7 submission done without separate authorization.


## Rendered artifact

`/home/boozer/Videos/BoozerAI/BoozerAI-demo-60s-silent.mp4`: 60.000000 seconds, 1,800 frames, 1920×1080, 30 fps, H.264, 6,166,453 bytes, no audio stream. Full decode succeeded and representative final frames were inspected. Companion captions: `BoozerAI-demo-60s.srt`. Raw recordings and edit metadata remain in the same local folder. Human viewing acceptance remains pending.
