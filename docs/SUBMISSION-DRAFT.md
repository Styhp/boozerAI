# Submission draft

Paste-ready answers for the 08:00 submission (SUBMISSION.md schedule). Everything here describes what is built and verified as of the date below. Items marked **[pending]** must be confirmed or deleted before pasting. Don't paste a pending claim as if it were done.

*Drafted by Claude Code, 2026-10-09 18:30 AWST, at the M3 commit that adds explain-v3 and the injection warning.*

---

## Project description

Boozer AI helps developers understand unfamiliar or AI-generated JavaScript and TypeScript code without sending it anywhere. It parses the project, never running it, into a dependency map in which every arrow points to the import line that created it. You can open any file's source, ask an on-device model to explain it, and click each `[S#]` citation to see the exact lines the model was given. Boozer also checks that every file the model names really exists. For any file, it lists which other files are *potentially affected* through their imports, with the chain of import statements as evidence. It also says plainly what it couldn't analyze.

## What runs locally

Everything in the app:

- **Reading the project:** a folder you choose at launch, read as text. It's never executed, installed or written to.
- **Parsing and resolving imports, and every graph calculation** (map, potential impact, coverage counts).
- **The user interface,** served from a loopback-only local server.
- **AI explanations:** `qwen3:4b-instruct` (Q4_K_M) running in Ollama 0.40.2 on the CPU, called only on `127.0.0.1`.
- **Every test,** including the real-model checks.

## What requires internet

Only setup: downloading Node.js, npm packages, Ollama and the model once. After that, Boozer needs no network, no accounts and no API keys. It makes no telemetry or background calls and has no cloud fallback. If the local model isn't available, it says so instead of answering. GitHub import and optional cloud integrations are planned later phases and are not in this build.

## Why local AI matters

The code people most need help with is often private, and many teams can't send it to a cloud service. A local model lets a developer ask about that code without it leaving the machine. It also works offline and costs nothing per question. Boozer keeps the model's role narrow: the parser owns the facts (the dependency graph), the model only explains snippets it was shown, and every citation is checked against those snippets. A valid citation shows where a claim came from; it doesn't prove the claim is right. Boozer says that on screen.

---

## README usage section (draft)

```sh
npm ci --ignore-scripts
npm run build
npm start -- --project /path/to/your/project      # [pending M2: confirm against the merged launcher]
```

Then open the URL the launcher prints and confirm the project in the browser. [pending M2: describe the confirmation step as built.]

For explanations, start the local model server first:

```sh
OLLAMA_HOST=127.0.0.1:11434 ollama serve      # model: qwen3:4b-instruct, digest 0edcdef3…168ba0
```

Boozer only checks that the approved model is installed; it never downloads one.

---

## How we verified it

| Claim | Evidence |
|---|---|
| The parser's dependency graph is right | A hand-written answer key for an original 13-file fixture (22 import statements, every edge with its line), written before any parser existed and checked line by line by a second agent. The parser's output equals it exactly (independent review 1.4). |
| Target code is never executed | The fixture includes a file that throws if run; it never fires. Target files are read as text; there is no `require`, `import` or `eval` of them. |
| Works on real code | Boozer's own repository: 49 nodes and 144 relationships (at `d964188`), under the 300-node map cap. |
| Offline by default | The default suite runs with all networking denied by the OS (`sandbox-exec … deny network*`) and uses no model. [pending: final test count at the frozen commit.] |
| Citations and file names are checked | Every `[S#]` marker is matched to a sent snippet; unknown markers are flagged, not dropped. Every file name in the answer is linked if it exists in the snapshot and flagged if not. |
| The browser can't run attacker HTML | Source and model output render as text. Tests feed `<script>` and `<img onerror>` and check they appear escaped. |
| Potential impact is computed correctly | Hand-derived expected results for the fixture, including the two-file cycle and a file nothing imports. Wording is "potentially affected", never "will break" or "safe". |
| Local-model speed | Dev Mac (Intel Core i5-8500B, 32 GB RAM, CPU only, other work running): about 52 s for a 300-token answer, and 9 s to load the model cold (1.6 benchmark). Product answers of about 125–180 tokens took 16–65 s. [pending M6: the MSI numbers used in the video.] |
| Prompt injection: partly resisted, **not solved** | The fixture plants a hidden instruction and a canary token. With the product prompt, the canary leaked in 0 of 24 runs (about 10 distinct answers at temperature 0); the earlier system-only prompt leaked it in 9 of 9. But 2 of 5 differently worded injections in separate test files still got the model to output their token. When the sent code contains text addressed to AI tools, Boozer now shows a "Possible prompt injection" warning that links to the line. The failing cases stay in the real-model suite. |

## Known limitations (keep these in the submission)

- Static analysis only: dynamic imports with computed paths, aliases and framework conventions are shown as unresolved, with a reason, and counted.
- Explanations come from a 4-billion-parameter model on a CPU. They can be wrong even when every citation is valid.
- Prompt injection is not solved: in our tests the local model still followed 2 of 5 differently worded instructions hidden in code. Boozer warns where such text appears, but can't stop the model from obeying it.
- Without a GPU, a full answer takes tens of seconds; the video trims waits and says so.

## Before pasting at 08:00

- [ ] Replace every [pending] with the verified fact, or delete the line.
- [ ] The launcher command and confirmation step match the merged M2.
- [ ] Test count and MSI timings come from the frozen commit and M6.
- [ ] The injection result matches docs/BENCHMARKS.md exactly, failures included.
- [ ] Every sentence above is true on the demo machine.
