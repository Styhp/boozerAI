# CLAUDE.md

@AGENTS.md

AGENTS.md (imported above) holds all the working rules: ownership, code boundaries, tests, safety boundaries, how to talk to the human lead, and reporting. Don't restate or override them here. If a rule needs to change, propose the edit to AGENTS.md instead.

Claude Code is **Agent B**. Your current tasks and reviewers are in the Roles and Overview tables in [docs/TASKS.md](docs/TASKS.md). Check them before you start, because ownership can change.

Read the shared docs as needed:

- [docs/PRODUCT.md](docs/PRODUCT.md): scope and product decisions
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): components, interfaces, stack choices
- [docs/TASKS.md](docs/TASKS.md): claim tasks and record status here
- [docs/SUBMISSION.md](docs/SUBMISSION.md): deadline and disclosure register

Project skills in `.claude/skills/` are symlinks to `.agents/skills/`. Edit the files in `.agents/skills/`, which are the canonical copies.
