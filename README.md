# Homelab

A personal, Docker-based self-hosted app library running on a Windows 11 PC (Docker Desktop),
reached privately from anywhere over [Tailscale](https://tailscale.com/). Nothing is exposed to
the public internet.

> **Heads-up:** This repo holds **configuration only**. Secrets (`.env`), app databases
> (`*/data`, `*/appdata`), and `backups/` are git-ignored and must never be committed.
> Each machine generates its own — see [Setup](#setup).

## Apps

| App | Purpose | Host port | Notes |
|-----|---------|-----------|-------|
| [Karakeep](https://github.com/karakeep-app/karakeep) | Bookmarks / read-it-later | 3000 | web + headless Chrome + Meilisearch |
| [Memos](https://github.com/usememos/memos) | Notes | 5230 | pinned to `:stable` (currently v0.29.x) |
| [Homarr](https://github.com/homarr-labs/homarr) | Dashboard / home base | 7575 | links to everything + live widgets |
| [Uptime Kuma](https://github.com/louislam/uptime-kuma) | Uptime monitoring | 3001 | per-app up/down + history |
| [Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) | Document archive (OCR + search) | 8000 | web + PostgreSQL + Redis; drop files in `paperless/consume/` |
| [Stirling-PDF](https://github.com/stirling-tools/stirling-pdf) | PDF toolkit (split/merge/convert…) | 8082 | login enabled; `admin` account, password set on first login |
| [Jellyfin](https://github.com/jellyfin/jellyfin) | Media server | 8096 | reads `E:\Media` read-only; no HW transcode on Docker Desktop |
| [Syncthing](https://github.com/syncthing/syncthing) | File sync across devices | 8384 | P2P sync on `22000`; works fine even when not 24/7 |
| [Diun](https://github.com/crazy-max/diun) | Image-update notifier | — | no UI; daily check, logs only (`docker compose logs diun`) |
| [Glances](https://github.com/nicolargo/glances) | System metrics (CPU/RAM/GPU) | 61208 | **native Windows**, not Docker (see below) |

Homarr is the front door: open it and everything else is one click away, with a **Docker stats**
widget (live container health) and a **System Health Monitoring** widget (CPU/RAM/GPU via Glances).

## Architecture

- **Containers:** each app lives in its own folder with a `docker-compose.yml` (+ `.env` for secrets).
  All use `restart: unless-stopped`.
- **Remote access:** Tailscale. Every app is reachable at `http://<this-host>.<tailnet>.ts.net:<port>`
  from any device that has Tailscale running. That MagicDNS name is also the canonical URL baked into
  app configs (e.g. Karakeep's `NEXTAUTH_URL`).
- **System metrics exception:** Glances runs **natively on Windows**, not in a container — a
  container on Docker Desktop only sees the WSL2 VM, not the real host (and can't read the GPU).
  Homarr reaches it at `http://host.docker.internal:61208`.

## Setup

Prerequisites: Docker Desktop, Tailscale (signed in), and — for system metrics — Python 3.12+.

### 1. Secrets

Each app with secrets ships a `.env.example`. Copy and fill it in:

```powershell
Copy-Item karakeep\.env.example  karakeep\.env
Copy-Item homarr\.env.example    homarr\.env
Copy-Item paperless\.env.example paperless\.env
```

Generate strong values (Git Bash / WSL has `openssl`; or use PowerShell):

```powershell
# 36-byte base64 (NEXTAUTH_SECRET, MEILI_MASTER_KEY)
[Convert]::ToBase64String((1..36 | % { Get-Random -Max 256 }))
# 64 hex chars (Homarr SECRET_ENCRYPTION_KEY)
-join ((1..32) | % { '{0:x2}' -f (Get-Random -Max 256) })
```

Set each app's `NEXTAUTH_URL`-style address to your own Tailscale MagicDNS name.

### 2. Bring up the stacks

A root [`compose.yaml`](compose.yaml) `include`s every app, so the whole library
comes up with one command from this folder:

```powershell
docker compose up -d        # start / update everything
docker compose pull         # pull newer images, then `up -d` again
docker compose down         # stop everything
docker compose ps           # status
docker compose logs -f      # follow logs (append a service name to narrow)
```

Each app still has its own folder and `docker-compose.yml`, so you can also run
just one: `docker compose -f karakeep/docker-compose.yml up -d`.

First run of each app: open it and create the admin account.

### 3. System metrics (Glances, native)

```powershell
py -3.12 -m pip install --upgrade "glances[gpu,web]"
```

Glances is started hidden at logon by `glances-start.vbs` → `glances-start.bat`
(uses `pythonw` with output redirected to `glances.log` — without the redirect Glances crashes
under `pythonw`). In Homarr, add a **Glances** integration pointing at
`http://host.docker.internal:61208`, then add the **System Health Monitoring** widget.

## Backups

`homelab-backup.ps1` snapshots config + bind-mount data (`robocopy`) and the Karakeep Docker
volumes (`alpine tar`) into `backups\<timestamp>\`, keeping the newest 7. Run it manually, or via
the **"Homelab Backup"** scheduled task (daily, *start-when-available* so it catches up when this
not-24/7 PC is on).

> `backups/` is git-ignored. For real safety, copy snapshots off this disk (external drive / cloud).

## Autostart on boot

- **Docker Desktop** and **Glances** — Startup-folder shortcuts (run at logon).
- **Tailscale** — Windows service, `Automatic`.
- Containers — `restart: unless-stopped`.

So a reboot brings the whole stack (and remote access) back with no manual steps.

## Layout

```
homelab/
├─ compose.yaml   root entry point — includes every app (docker compose up -d)
├─ karakeep/      docker-compose.yml, .env(.example)
├─ memos/         docker-compose.yml
├─ homarr/        docker-compose.yml, .env(.example)
├─ uptime-kuma/   docker-compose.yml
├─ paperless/     docker-compose.yml, .env(.example)
├─ stirling-pdf/  docker-compose.yml
├─ jellyfin/      docker-compose.yml
├─ syncthing/     docker-compose.yml
├─ diun/          docker-compose.yml
├─ homelab-backup.ps1
├─ glances-start.bat / glances-start.vbs
└─ README.md
```
