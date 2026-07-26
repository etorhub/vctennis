# Claude Code — Vinya Canadell Tennis

Follow the project agent guide: [`AGENTS.md`](AGENTS.md).

## Git workflow (mandatory)

- Default branch: **`master`**. Never commit or push to it.
- Every new plan/implementation from a conversation gets its **own branch** from up-to-date `master`, then lands via **PR → `master`**.
- Do not reuse another conversation's branch unless the user explicitly continues that work.
- Branch names: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- Read-only Q&A needs no branch. Create the branch before the first implementation edit.
- Push / open a PR only when the user asks (or offer when the work is ready). Do not merge unless asked.

Hooks under `.claude/` reinforce this (block commits/pushes and file edits on `master`).
