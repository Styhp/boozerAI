# Copy deck

Every interface string in the graph workspace. Use these words exactly; the required phrases are marked **(required)** because PRODUCT.md or C1 depends on them. Graph-view strings (hint, legend, hover card, replay, settings) live in code in `reference/copy.ts` and are repeated here only where they need explanation. `{n}` = a number; `{path}` = a relative path; pluralise with the noun ("1 file", "2 files").

Voice: plain, calm, second person. Plain word first, technical term second (as a glossary link). No exclamation marks, no emoji. Sentence case everywhere.

**Never write:** unused · dead code · safe to change · will break · entry point · score · risk · health · confidence · "Reading…" for the replay.

## Entry (gate cards)

| Where | Text |
|---|---|
| Confirm title | Open {label}? |
| Confirm lead | Boozer will read this folder's code as text and draw how its files connect. |
| Confirm bullets | Nothing is run, installed or changed in the folder. · Reading happens on this computer. Nothing is sent online. · Limits: 2,000 code files, 1 MiB per file, 20 MiB in total. Anything skipped is counted and shown. |
| Buttons | **Read this folder** (primary) · Cancel |
| Meta | Folder chosen when Boozer was started: `{label}`. |
| Indexing (real request) | Reading {label}… (no percentage; the launcher sends no progress) |
| Failed | Couldn't finish reading {label} · {plain reason}. Boozer stopped without building a partial map, so nothing on screen would be misleading. Nothing in your folder was changed. · Try again · Close |
| No folder | No project selected · Start Boozer with the folder you want to read: `npm start -- --project <folder>` |
| Picker (only when M2-PICK has merged) | Choose a folder… · Open another folder |

## Ribbon and sidebar

| Element | Text |
|---|---|
| Ribbon titles / aria-labels | Files · Search · Overview · My notes · Refresh: read the folder again · Open another folder |
| My notes dot (title) | Some notes need a look |
| Tree head | {label} · Collapse all folders · Close sidebar |
| Search head | Search |
| Search input | Filter files and graph |
| Search results | {n} files match. Other dots fade in the graph. / Type part of a name or folder. |
| Tree flags | {n} gap · parse error |
| Foot (local) | On this computer · {n} files |
| Foot after cloud sends | {n} requests sent online |
| Foot (hosted pilot) | Uploaded to the Boozer pilot server |

## Graph view
| Element | Text |
|---|---|
| Tab | Graph view |
| Header | **{label}** · read {Ddd D Mon, HH:MM} (append " · refreshed" after Refresh) |
| Toggle tree | Toggle file tree |
| Hint (desktop) | Point at a dot to see what it connects to · click to open it |
| Hint (touch) | Tap a dot to open it |
| Over the cap | This project has {n} files and packages, over the 300 the graph draws. Use the file tree, or search to narrow it. |
| Everything else | `reference/copy.ts` → `GRAPH_COPY` (legend, hover card, replay, settings, fit) |

## Detail pane chrome

| Element | Text |
|---|---|
| Tab titles | Overview · My notes · {file name} |
| History | Back · Forward |
| Source toggle | Show source / Show note |
| Close | Close pane |
| Status (file) | Used by {n} · Uses {n} files · {n} lines · ● On this computer |
| Status (other) | {n} files · {n} imports · {n} gaps · ● On this computer |

## Overview note

| Element | Text |
|---|---|
| Properties head | What Boozer read · [Found in code] |
| Rows | Code files: **{parsed}** of {found} read · Imports: {n} found by reading the code · Snapshot: {time} · Analysis: Possibly incomplete · {n} gaps / No gaps recorded |
| Lead | Each dot in the graph is one of your files. A line means one file [imports] another. Point at a dot to see what it connects to; click it to open it here. |
| Gaps title | What Boozer couldn't examine · [Possibly incomplete] |
| Gaps hint | Connections involving these are missing from the graph and from "potentially affected" lists. In the graph they show as dotted rings. |
| Gap rows | File skipped / Files skipped — {label}: {paths} · Folders not opened: {paths} · Import not followed / Imports not followed — {label}: `{spec}` in {path} — labels and consequences from `SKIP_WORDS` / `ISSUE_WORDS` in copy.ts |
| No gaps | No gaps recorded · Every code file was read and every import was followed. Boozer still only reads code; it can't see what happens while the app runs. |
| Starts title | Where could I start reading? · [Found in code] |
| Starts hint | These files aren't imported by any other file, so they're often where things begin. Boozer can't tell which one runs first. Sorted by how many files each one reaches. [About starting candidates] |
| Start row | Nothing imports it · reaches {n} other files / Nothing imports it, but its own imports are unknown. |
| Start button | **Start here** |
| Show more | Show all {n} / Show fewer |
| Ranked title | Files many others use · [Found in code] |
| Ranked hint | The biggest dots. A change here could reach more of the project; it doesn't make them the most important. **(required meaning)** |
| Ranked row | used by {n} files · [types only] |
| Loops title | Files that import each other · [Found in code] |
| Loops hint | A [circular dependency] isn't always a bug, but it makes load order harder to follow. / No loops found. |
| Loop row | {a} ⇄ {b} · Each imports the other (lines {x} and {y}). |
| Local title | What happens to your code here |
| Local body | Reading, the graph and explanations run on this computer. {No cloud AI is set up for this session. / A cloud comparison is set up, but it only sends after you preview the exact request and press Send.} Notes are {on / off until you turn them on}. |

## File note

| Element | Text |
|---|---|
| Properties | Properties · [Found in code] · Language: TypeScript / TypeScript + JSX / JavaScript / JavaScript + JSX · Lines: {n} · Uses: {n} of your files · Used by: {n} file(s) · Gaps: None in this file / {n} import(s) not followed |
| Parse error | **Couldn't be parsed.** This file has a syntax error, so Boozer found no connections in it. You can still read its source with the code button above. |
| Explain title | What does this file do? · [AI explanation · may be wrong] **(required)** |
| Explain idle | Ask the AI on this computer to explain this file in everyday words. It is shown only this file's code, and every claim links to the lines it came from. It can still be wrong. · **Explain this file** · Runs on this computer · nothing is sent online |
| Reading excerpts | Reading {n} excerpts of this file… |
| Streaming | Writing on this computer… this can take up to a minute · Waiting for the first words · Stop |
| Done chip | {model} · {runtime} · local · {s} s |
| Technical details | Technical details · for when you want the terms |
| Checks | {n} [source links], all pointing to code the AI was shown. · Mentions a file Boozer didn't find: `{path}`. · A source link shows where a claim came from. It doesn't prove the claim is right, so check the lines when it matters. **(required)** |
| Snippets | Code the AI was shown · {n} excerpts |
| Again | Explain again |
| Cancelled | **Explanation stopped.** Nothing was saved and nothing was sent anywhere. (+ "The partial answer below is incomplete." when text exists) |
| Runtime unavailable | **The local AI isn't running.** Boozer couldn't reach Ollama on this computer. Start Ollama, then try again. |
| Model missing | **The AI model isn't installed.** Boozer needs the approved model {tag} in Ollama. |
| Model mismatch | **The installed model isn't the approved build.** Reinstall {tag} in Ollama, then try again. |
| Timeout | **The local AI took too long.** Try again; the first answer after starting can be slow. |
| Runtime error | **The local AI stopped with an error.** This sometimes happens when the computer is busy. Try again. |
| Error suffix (all) | Nothing was sent online, and the graph, links and source still work. · Try again |
| Injection warning | **Possible prompt injection.** The code shown to the AI contains text that looks aimed at AI tools, and the AI may have followed it instead of just explaining. Check the answer against the source: {file:line links} |
| Stale after refresh | **Written before your last refresh.** This file has changed since, so source links open without highlighting. Explain again |
| Cloud collapsed | Compare with a cloud AI · optional · sends code online |
| Cloud notice | This sends excerpts of `{path}` to OpenAI. You'll see the exact request first; nothing is sent until you press Send. Boozer never does this automatically, even if the local AI fails. **(required)** |
| Cloud preview | Request to OpenAI — not sent yet · [Would leave this computer] · Destination `{endpoint}` · {n} bytes. Your API key stays on the server and isn't included below. · Exact request body · Send to OpenAI · Discard |
| Cloud waiting / done | Waiting for OpenAI… · [AI explanation · cloud · may be wrong] [Sent online · OpenAI] |
| Links title | How is it connected? · [Found in code] |
| Uses group | This file uses {n} · Files it [imports], with the line that does it. Blue lines in the graph. · empty: It doesn't import any of your other files. · gap tags: couldn't follow / not code · Also uses {n} [packages]: `{names}`. |
| Used-by group | Used by {n} · Files that import this one, with the line in each. Green lines in the graph. · empty: No files import it, according to the code Boozer read. That doesn't mean it's unused: entry points, config and tests are often loaded another way. **(required meaning)** |
| Impact title | Before you change it · [Found in code] |
| Impact hint | These files use this one and are [potentially affected] by a change: check them too. It doesn't mean they will break, and an empty list doesn't mean a change is safe. **(required)** |
| Impact count | {n} files potentially affected (+ "({n} in total)") · Direct · Up to 2 steps · All |
| Impact row | direct / {n} steps away · [types only] · How: {file:line} → … → {file} |
| Impact empty | No files import this one, according to the code Boozer read. **(required)** |
| Impact gaps | The project has {n} gaps, so this list may be missing files. See what's missing |
| Unknowns title | What Boozer can't tell you here · [{n} gaps in this file] |
| Unknowns | Every import in this file was followed. · Boozer only reads the code. It can't see what happens while the app runs: data from a server, settings from the environment, or files loaded by name at run time. |
| Notes title | Your notes · [Your note] |
| Notes off | Write down what you learn, decide or want to ask, linked to lines of code. Notes are your own words: Boozer saves them on this computer outside your project folder, never checks them, and never sends them to an AI. · Turn on notes for {label} · Nothing is written to disk until you turn notes on. |
| Notes form | Kind: Decision / Constraint / Question · Lines {from} to {to} · Your note (placeholder: e.g. Sync only runs once at start. Ask whether that's intended.) · Save note · Lines prefilled from the source you opened. |
| Note statuses | Lines match · Lines moved — The same lines are now at {a}–{b}. The link wasn't changed. Update link · Lines changed — The linked lines changed since you wrote this. They now read: · File not found — {path} isn't in this snapshot. · Not linked to lines · Delete |

## Source mode

| Element | Text |
|---|---|
| Back | Back to the explanation (from a citation) / Back to the note |
| Tag | Exact text from your file |
| Meta | Lines {a}–{b}, cited as S{n} by the AI explanation · The import on line {n} · Lines {a}–{b}, linked by your note · Whole file — then " · snapshot {time}" |
| Stale | **These lines may have moved.** The citation was made before you refreshed, so nothing is highlighted. |
| Unavailable | Source unavailable: {reason}. The explanation and links are unchanged. |

## My notes

| Element | Text |
|---|---|
| Title / hint | My notes · Everything you've written about {label}. Each note stays with its lines of code; open one to jump there. |
| Groups | Needs a look · Up to date · Not linked to lines |
| Empty | No notes yet. Open a file and add one under "Your notes". |

## Glossary (popover on dotted-underlined terms)

| Term | Definition | Small print |
|---|---|---|
| Import | A line that connects this file to another file or package so it can use its code. | In code: import … from … or require(…) |
| Dependency | Something this file imports. If it changes, this file might need to change too. | Boozer lists files under "This file uses". |
| Used by | A file that imports this one. Technical name: importer. | |
| Circular dependency | Files connected in a loop: A imports B and B imports A, directly or through other files. | Also called an import cycle. |
| Type-only import | Uses only type descriptions, which disappear when the app is built. No running code is shared. | In code: import type … |
| Package | Code installed from outside your project, such as react or express. Boozer doesn't read inside packages. | |
| Static analysis | Reading code as text without running it. Boozer finds connections this way, so it can't see what only happens while the app runs. | |
| Snapshot | The copy of your files Boozer read at one moment. Edit your code, then Refresh to read it again. | |
| Potentially affected | Files that import this one, directly or through other files. They might need checking after a change. It doesn't mean they will break. | And no files listed doesn't mean a change is safe. |
| Starting candidate | A file that no other file imports. Entry points, config files and tests usually look like this. Boozer can't tell which one runs first. | |
| Source link | A tag like [S1] points to the exact lines the AI was shown. Checked means the lines exist; it doesn't prove the AI read them correctly. | |

## Hosted pilot (only if P-19 ships)

| Element | Text |
|---|---|
| Locality | Uploaded to the Boozer pilot server · {n} requests sent to OpenAI |
| Explain title | Explain with OpenAI (sends code online) |
| Notes button title | Notes aren't available in the hosted pilot |
