# Homelab

A personal, Docker-based self-hosted app library running on a Windows 11 PC (Docker Desktop),
reached privately from anywhere over [Tailscale](https://tailscale.com/). Nothing is exposed to
the public internet.

> **Heads-up:** This repo holds **configuration only**. Secrets (`.env`), app databases
> (`*/data`, `*/appdata`), and `backups/` are git-ignored and must never be committed.
> Each machine generates its own — see [Setup](#setup).

## Apps

Every app is reached over HTTPS at its own Tailscale hostname, `https://<HTTPS host>.<tailnet>.ts.net`
(via Caddy — see [HTTPS](#https-per-app-over-tailscale)). Containers no longer publish raw host ports.

| App | Purpose | HTTPS host | Notes |
|-----|---------|-----------|-------|
| [Karakeep](https://github.com/karakeep-app/karakeep) | Bookmarks / read-it-later | `karakeep` | web + headless Chrome + Meilisearch |
| [Miniflux](https://github.com/miniflux/v2) | RSS / feed reader | `rss` | web + PostgreSQL; admin via `.env`, strong REST API |
| [Memos](https://github.com/usememos/memos) | Notes | `memos` | pinned to `:stable` (currently v0.29.x) |
| [Homarr](https://github.com/homarr-labs/homarr) | Dashboard / home base | `homarr` | links to everything + live widgets |
| [Uptime Kuma](https://github.com/louislam/uptime-kuma) | Uptime monitoring | `uptime` | per-app up/down + history |
| [Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) | Document archive (OCR + search) | `paperless` | web + PostgreSQL + Redis; drop files in `paperless/consume/` |
| [Stirling-PDF](https://github.com/stirling-tools/stirling-pdf) | PDF toolkit (split/merge/convert…) | `stirling` | login enabled; `admin` account, password set on first login |
| [Jellyfin](https://github.com/jellyfin/jellyfin) | Media server | `jellyfin` | reads `E:\Media` read-only; no HW transcode on Docker Desktop |
| [Syncthing](https://github.com/syncthing/syncthing) | File sync across devices | `syncthing` | UI via Caddy; P2P ports `22000`/`21027` stay published |
| [n8n](https://github.com/n8n-io/n8n) | Workflow automation | `n8n` | web + PostgreSQL |
| [Activepieces](https://github.com/activepieces/activepieces) | Workflow automation (no-code) | `activepieces` | web + PostgreSQL + Redis |
| [ntfy](https://github.com/binwiederhier/ntfy) | Push notifications (HTTP → phone) | `ntfy` | automation/alert sink; iOS instant push via `ntfy.sh` upstream |
| [Diun](https://github.com/crazy-max/diun) | Image-update notifier | — | no UI; daily check, logs only (`docker compose logs diun`) |
| [Glances](https://github.com/nicolargo/glances) | System metrics (CPU/RAM/GPU) | `glances` | **native Windows**, not Docker; Caddy proxies to the host |
| [Caddy](https://caddyserver.com/) | Reverse proxy → per-app HTTPS | — | terminates TLS for every app (see [HTTPS](#https-per-app-over-tailscale)) |

Homarr is the front door: open it and everything else is one click away, with a **Docker stats**
widget (live container health) and a **System Health Monitoring** widget (CPU/RAM/GPU via Glances).

## Architecture

- **Containers:** each app lives in its own folder with a `docker-compose.yml` (+ `.env` for secrets).
  All use `restart: unless-stopped`.
- **Remote access:** Tailscale. Apps are reachable only through Caddy at their own HTTPS hostnames
  (below) from any device running Tailscale — the containers no longer publish raw host ports. The one
  exception is Syncthing's peer-to-peer ports (`22000`/`21027`), which must stay published.
- **HTTPS:** a single Caddy container (with the
  [`caddy-tailscale`](https://github.com/tailscale/caddy-tailscale) plugin) fronts every web app and
  serves it over **HTTPS at its own MagicDNS hostname** — `https://<app>.<tailnet>.ts.net` — with a real,
  auto-renewing Let's Encrypt cert. Each app sits at the root path (not a subpath), which is what makes
  PWA installs and browser features that **require a secure context** (microphone, camera, service
  workers) work — e.g. Memos voice memos on iOS. See [HTTPS](#https-per-app-over-tailscale).
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

### CLI (`homelab`)

A thin PowerShell wrapper (`homelab.ps1`) abstracts the `docker compose` commands and works from any
directory. Install the `homelab` function into your PowerShell profile once:

```powershell
.\homelab.ps1 install   # run in the PowerShell edition you use (5.1 and 7 have separate profiles)
. $PROFILE              # reload, or open a new terminal
```

Then, from anywhere:

```powershell
homelab up                  # start / refresh everything (docker compose up -d)
homelab up karakeep memos   # just these apps (resolves to their services)
homelab down                # tear everything down
homelab down karakeep       # stop + remove just karakeep's containers (data kept)
homelab list                # status grouped by app, with each app's https URL
homelab logs caddy          # follow one app's logs
homelab restart paperless
homelab update              # pull newer images, then recreate
homelab build caddy         # rebuild the custom Caddy image, then recreate
```

App names are the folders in `compose.yaml`; `homelab uninstall` removes the profile function.
Tab-completion suggests commands and app names.

### 3. System metrics (Glances, native)

```powershell
py -3.12 -m pip install --upgrade "glances[gpu,web]"
```

Glances is started hidden at logon by `glances-start.vbs` → `glances-start.bat`
(uses `pythonw` with output redirected to `glances.log` — without the redirect Glances crashes
under `pythonw`). In Homarr, add a **Glances** integration pointing at
`http://host.docker.internal:61208`, then add the **System Health Monitoring** widget.

## HTTPS (per app, over Tailscale)

Caddy gives every app its own HTTPS hostname (`https://<app>.<tailnet>.ts.net`) so browser features
that need a **secure context** work. It joins the tailnet as one node per app via the
[`caddy-tailscale`](https://github.com/tailscale/caddy-tailscale) plugin and gets free, auto-renewing
`*.ts.net` certs — no domain to buy, nothing exposed to the public internet.

```powershell
Copy-Item caddy\.env.example caddy\.env   # then fill in TS_NET + TS_AUTHKEY
```

- **`TS_NET`** — your tailnet domain (the part after the machine name in a MagicDNS hostname, e.g.
  `tailXXXX.ts.net`). Find it on the Tailscale admin **DNS** page.
- **`TS_AUTHKEY`** — a **reusable, non-ephemeral** auth key (admin console → *Settings → Keys*). One
  key registers all the per-app nodes.

You must also **enable HTTPS Certificates** in the Tailscale admin console (**DNS** page → *Enable
HTTPS*). This is a separate toggle from MagicDNS; without it, nodes have no `*.ts.net` cert domains and
Caddy can't obtain certificates (handshakes fail with a missing-`tailscaled.sock` error). MagicDNS must
be enabled too.

Caddy uses a **custom image** (stock Caddy has no Tailscale support), so build it on first bring-up:

```powershell
docker compose up -d --build        # builds caddy + starts everything
docker compose logs -f caddy        # watch the nodes register
```

Within a minute or so the new devices appear in your Tailscale admin console and the apps are live at
`https://memos.<tailnet>.ts.net`, `https://karakeep.<tailnet>.ts.net`, etc. (hostnames:
`karakeep`, `rss`, `memos`, `homarr`, `uptime`, `paperless`, `stirling`, `jellyfin`, `syncthing`,
`n8n`, `activepieces`, `ntfy`, `glances`).

> **Per-app canonical URL:** apps that bake in their own base URL must point at the HTTPS hostname, or
> logins/redirects/CSRF break. Set these in each app's `.env` to `https://<app>.<tailnet>.ts.net`:
> Karakeep `NEXTAUTH_URL`, Paperless `PAPERLESS_URL`, Activepieces `AP_FRONTEND_URL`, ntfy
> `NTFY_BASE_URL`, and n8n `N8N_HOST` + `WEBHOOK_URL` + `N8N_EDITOR_BASE_URL` (leave `N8N_PROTOCOL=http`
> — Caddy terminates TLS; forcing `https` makes n8n try to serve TLS itself). After editing, run
> `docker compose up -d` to recreate the affected containers.

> **Raw ports are not published:** traffic flows only through Caddy. Container-to-container calls use the
> Docker network directly (e.g. publish to ntfy at `http://ntfy`), and Syncthing keeps its P2P ports
> (`22000`/`21027`). To reach an app from a client, always use its `https://<app>.<tailnet>.ts.net` URL.

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
├─ caddy/         Dockerfile, Caddyfile, docker-compose.yml, .env(.example)
├─ karakeep/      docker-compose.yml, .env(.example)
├─ miniflux/      docker-compose.yml, .env(.example)
├─ memos/         docker-compose.yml
├─ homarr/        docker-compose.yml, .env(.example)
├─ uptime-kuma/   docker-compose.yml
├─ paperless/     docker-compose.yml, .env(.example)
├─ stirling-pdf/  docker-compose.yml
├─ jellyfin/      docker-compose.yml
├─ syncthing/     docker-compose.yml
├─ n8n/           docker-compose.yml, .env(.example)
├─ activepieces/  docker-compose.yml, .env(.example)
├─ ntfy/          docker-compose.yml, .env(.example)
├─ diun/          docker-compose.yml
├─ homelab-backup.ps1
├─ glances-start.bat / glances-start.vbs
└─ README.md
```
