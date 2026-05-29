# Agent instructions for this repository

This is a **PUBLIC** GitHub repository containing **configuration only** for a personal
self-hosted Docker stack. Any AI agent (Claude Code, Copilot, Codex, Cursor, etc.) working
here MUST follow these rules.

## 🔴 Golden rule: never commit secrets or personal data

This repo is public. Treat everything you stage as if the whole internet will read it — because
it will.

### Never commit (these are git-ignored; keep them that way)
- `**/.env` — real API keys and encryption secrets (`NEXTAUTH_SECRET`, `MEILI_MASTER_KEY`,
  `SECRET_ENCRYPTION_KEY`, `OPENAI_API_KEY`, etc.)
- `*/data/`, `*/appdata/` — app databases (contain user accounts and **password hashes**)
- `backups/` — full snapshots (secrets + databases)
- `*.log` — may contain hostnames, tokens, internal details

### Never put these in ANY tracked file (compose, README, scripts, examples, commit messages)
- Real secret values, API keys, tokens, or passwords
- The Tailscale tailnet name / MagicDNS hostname or Tailscale `100.x` IPs
- Personal email addresses (use a GitHub `@users.noreply.github.com` address for commits)
- Anything else you would not post publicly

## Rules of engagement
1. **Never** use `git add -f` / `--force` to stage an ignored file. If something is ignored,
   that is deliberate.
2. **Before every commit**, review `git status` and `git diff --cached`. If you see a `.env`,
   a `data/`/`appdata/`/`backups/` path, a `.log`, or any real key/password/host/IP — STOP and
   remove it from the staging area. Do not commit.
3. Secrets live ONLY in local, git-ignored `.env` files. For every secret a new app needs, add a
   sanitized `<app>/.env.example` with `__CHANGE_ME__` placeholders instead.
4. If you add an app whose data is bind-mounted to a new folder, add that folder to `.gitignore`
   in the SAME change.
5. If a secret is ever committed by mistake, treat it as compromised: rotate the secret AND scrub
   git history (e.g. `git filter-repo`) before pushing — `.gitignore` does not un-leak history.

## Project conventions
- Each app = its own folder with `docker-compose.yml` (+ `.env` for secrets, mirrored by
  `.env.example`). The root `compose.yaml` `include`s them all under one project (`homelab`);
  bring everything up with `docker compose up -d`, or a single app with
  `docker compose -f <app>/docker-compose.yml up -d`.
- Karakeep's named volumes are pinned (`name: karakeep_data` / `karakeep_meilisearch`) so its
  data survives the same whether run standalone or via the unified project. Don't unpin them.
- See `README.md` for the full architecture, ports, remote access (Tailscale), backups, and
  system-monitoring (native Glances) details.
