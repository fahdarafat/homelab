# Homelab CLI — Design Spec

**Date:** 2026-05-30
**Status:** Approved (pending written-spec review)

## Goal

Abstract the repetitive `docker compose -f …` invocations behind a single `homelab`
command that works **from any directory**, e.g.:

```
homelab up
homelab down
homelab list
homelab up karakeep            # one app
homelab up karakeep memos      # several apps
homelab logs caddy
```

## Non-goals (YAGNI)

- Not a cross-platform binary. PowerShell-only, single Windows host. (If it ever needs
  Linux/Mac or a TUI, the pure logic is isolated so a port to Node/Go is small.)
- No Docker-API integration — it shells out to `docker compose`.
- No service-resolution cache in v1 (revisit only if `list` feels slow).

## Architecture

Approach **A**: one self-contained script + a profile function.

- **`homelab.ps1`** (repo root) holds all logic. It resolves its own directory via
  `$PSScriptRoot` and runs every Docker call as
  `docker compose -f $PSScriptRoot\compose.yaml <args>`. It therefore never depends on the
  caller's current directory, and always targets the unified `homelab` compose project.
- **Profile function** — `homelab install` idempotently writes a `homelab` function into the
  user's `$PROFILE` that forwards args to the script by its absolute path:
  `function homelab { & '<abs>\homelab.ps1' @args }`. `homelab uninstall` removes it.
  This makes the command available in every PowerShell session regardless of cwd.
- **Tab completion** — `install` also registers an `ArgumentCompleter` for `homelab` that
  completes verbs (first token) and app names (subsequent tokens).

### Location independence (key requirement)

Guaranteed by two independent mechanisms: (1) the function is defined in `$PROFILE` so it
exists in every session, and (2) the script uses `$PSScriptRoot` + absolute `-f` paths so the
working directory is irrelevant.

## App model (dynamic discovery)

"Apps" are **not hardcoded**. They are derived at runtime:

- **App list** — parse the `include:` entries in `compose.yaml`; each `"<folder>/docker-compose.yml"`
  yields the app name `<folder>` (e.g. `karakeep`, `stirling-pdf`, `uptime-kuma`).
- **App → services** — parse the top-level keys under `services:` in each app folder's
  `docker-compose.yml`. (These files follow a strict 2-space-indent convention; a Pester test
  pins the parser. `docker compose -f <folder>/docker-compose.yml config --services` is the
  documented fallback if a parse ever returns empty.)
- **App → URL** — parse the `Caddyfile`: each `reverse_proxy <service>:<port>` under a
  `<host>.{$TS_NET} { … }` block maps a service to its hostname. Combined with `TS_NET` from
  `caddy/.env`, this yields `https://<host>.<TS_NET>` for the app's proxied service. Apps with
  no Caddy route (or when `caddy/.env` is absent) simply show no URL.

Adding a new app to the repo (new folder + include line, and optionally a Caddyfile block)
requires **no changes** to the CLI.

## Commands

All verbs accept optional positional app names; **no apps = all apps**. `--filter <app>` is
accepted as an alias for a positional app (back-compat with the originally requested syntax).
App names are resolved to their compose services before invoking Docker.

| Command | Behavior |
|---|---|
| `homelab up [apps]` | `compose up -d [services]` |
| `homelab down [apps]` | no apps → `compose down`; with apps → `compose rm -sf [services]` (stop + remove just those) |
| `homelab list [apps]` | Enhanced, grouped-by-app status (see below) |
| `homelab logs [apps]` | `compose logs -f --tail=100 [services]` |
| `homelab restart [apps]` | `compose restart [services]` |
| `homelab update [apps]` | `compose pull [services]` then `compose up -d [services]` |
| `homelab build [apps]` | `compose build [services]` then `compose up -d [services]` |
| `homelab install` / `uninstall` | manage the `$PROFILE` function + completer |
| `homelab help` / (no args) | usage |

### Dependency & app-scoping semantics

App resolution is **folder-scoped**: an app name maps only to the services defined in *its own*
`docker-compose.yml`. Consequences:

- **`up <app>`** starts the app's full service set (e.g. `karakeep` → `web` + `chrome` +
  `meilisearch`) — resolution expands to all services so the app's helpers come up with it.
- **`down <app>`** stops + removes that full set, including the app's private dependencies
  (databases, caches, headless Chrome, Meilisearch). It never reaches into another app's services.
- **No shared dependencies exist** in this repo — every app bundles its own datastore
  (`paperless-db`, `n8n-postgres`, `activepieces-postgres`/`-redis`, karakeep's `chrome` +
  `meilisearch`). So tearing one app down cannot affect another; folder-scoped resolution would
  prevent cross-app impact even if a shared service were introduced later.
- **Data is preserved** — `rm -sf` carries no `-v`, so named volumes / bind mounts survive.
- The shared `homelab_default` network and the Caddy proxy are left untouched; Caddy simply
  returns 502 for a downed app's hostname until it is brought back up.

### `list` output

Read running containers via `docker compose … ps --format json`. Group by app (using the
app→services map). For each app show its containers' state + health, and the app's
`https://<host>.<TS_NET>` URL where one exists. Reads as a per-app dashboard rather than the
raw per-service compose table.

## Error handling

- **Docker not running / not installed** — detect a failed `docker compose version` and print a
  one-line friendly message, no PowerShell stack trace; exit non-zero.
- **Unknown app name** — print the offending name and list the valid apps; exit non-zero.
- **`logs` follow** — runs in the foreground; Ctrl-C detaches cleanly (compose default).
- All commands return the underlying `docker compose` exit code.

## Testing

Pure logic is factored into independently testable functions and covered by **Pester** unit
tests using fixture files (no Docker required):

- `Get-HomelabApps` — parse the include list.
- `Get-AppServices` — parse a folder's service keys.
- `Get-ServiceUrls` — parse the Caddyfile + `TS_NET`.
- `Resolve-Targets` — map verb + app args (incl. `--filter`) to a service list / passthrough.

The thin `docker compose` passthrough is verified with a manual smoke test
(`homelab up memos`, `homelab list`, `homelab logs caddy`, `homelab down memos`).

## Deliverables

- `homelab.ps1` — the CLI (new, tracked).
- `tests/homelab.Tests.ps1` (+ fixtures) — Pester tests.
- README section documenting install + commands.
- This spec.

No secrets are read into tracked files; `caddy/.env` is only read at runtime for the URL column.
