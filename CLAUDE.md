# CLAUDE.md

The full agent guide for this repository lives in **[AGENTS.md](AGENTS.md)** — read and follow it.

## 🔴 Non-negotiable (repeated here so it is never missed)

This is a **PUBLIC** repo. **Never commit secrets or personal data.**

- Never commit `**/.env`, `*/data/`, `*/appdata/`, `backups/`, or `*.log` (all git-ignored — keep it so).
- Never put real keys, passwords, tokens, the Tailscale hostname/IP, or personal emails in any
  tracked file or commit message.
- Never `git add -f` an ignored file. Before committing, review `git diff --cached` and abort if
  anything sensitive appears.
- Secrets go only in local `.env` files; commit sanitized `.env.example` templates instead.

See [AGENTS.md](AGENTS.md) for the rationale, full ignore list, and project conventions.
