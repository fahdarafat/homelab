# Homelab CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `homelab` PowerShell command that wraps `docker compose` behind friendly verbs (`up`, `down`, `list`, `logs`, `restart`, `update`, `build`) with positional app targeting, runnable from any directory.

**Architecture:** A self-contained `homelab.ps1` (entry/dispatch) dot-sources `homelab.lib.ps1` (pure, testable helpers). All Docker calls run as `docker compose -f <repo>\compose.yaml …` using `$PSScriptRoot`, so the working directory is irrelevant. A `homelab` function installed into `$PROFILE` forwards to the script, making it global. App→services and app→URL are discovered dynamically from the repo (no hardcoded app list).

**Tech Stack:** Windows PowerShell 5.1-compatible script; Pester 3.4.0 (bundled) for unit tests; Docker Compose v2.

**Spec:** `docs/superpowers/specs/2026-05-30-homelab-cli-design.md`

---

## File Structure

- `homelab.lib.ps1` (repo root) — pure functions, no Docker, no side effects: `Get-HomelabApps`, `Get-AppServices`, `Get-EnvValue`, `Get-ServiceUrls`, `Resolve-AppArgs`, `Resolve-Services`. Dot-sourced by both the entry script and the tests.
- `homelab.ps1` (repo root) — entry point: dot-sources the lib, Docker preflight, verb dispatch, `list` rendering, `install`/`uninstall`.
- `tests/homelab.Tests.ps1` — Pester 3.x unit tests for the pure functions.
- `tests/fixtures/` — stable sample files: `compose.yaml`, `karakeep/docker-compose.yml`, `Caddyfile`, `caddy.env`.
- `README.md` — new "CLI" section.

Work happens on branch `feat/homelab-cli` (already created).

---

## Task 1: Test fixtures and library scaffold

**Files:**
- Create: `homelab.lib.ps1`
- Create: `tests/fixtures/compose.yaml`
- Create: `tests/fixtures/karakeep/docker-compose.yml`
- Create: `tests/fixtures/Caddyfile`
- Create: `tests/fixtures/caddy.env`
- Create: `tests/homelab.Tests.ps1`

- [ ] **Step 1: Create the empty library file**

`homelab.lib.ps1`:

```powershell
# Pure helper functions for the homelab CLI.
# No Docker calls, no side effects — safe to dot-source in tests.
```

- [ ] **Step 2: Create the fixture compose.yaml**

`tests/fixtures/compose.yaml`:

```yaml
name: homelab
include:
  - caddy/docker-compose.yml
  - karakeep/docker-compose.yml
  - stirling-pdf/docker-compose.yml
```

- [ ] **Step 3: Create the fixture app compose (with a volumes block to prove volume keys are NOT counted as services)**

`tests/fixtures/karakeep/docker-compose.yml`:

```yaml
services:
  web:
    image: ghcr.io/karakeep-app/karakeep:release
    volumes:
      - data:/data
  chrome:
    image: gcr.io/zenika-hub/alpine-chrome:124
  meilisearch:
    image: getmeili/meilisearch:v1.41.0

volumes:
  meilisearch:
    name: karakeep_meilisearch
  data:
    name: karakeep_data
```

- [ ] **Step 4: Create the fixture Caddyfile**

`tests/fixtures/Caddyfile`:

```caddyfile
{
	tailscale {
		ephemeral false
	}
}

karakeep.{$TS_NET} {
	bind tailscale/karakeep
	reverse_proxy web:3000
}

stirling.{$TS_NET} {
	bind tailscale/stirling
	reverse_proxy stirling-pdf:8080
}
```

- [ ] **Step 5: Create the fixture env file**

`tests/fixtures/caddy.env`:

```
TS_NET=example.ts.net
TS_AUTHKEY=tskey-auth-DUMMY
```

- [ ] **Step 6: Create the test file header (dot-sources the lib + locates fixtures)**

`tests/homelab.Tests.ps1`:

```powershell
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here '..\homelab.lib.ps1')
$fixtures = Join-Path $here 'fixtures'
```

- [ ] **Step 7: Commit**

```bash
git add homelab.lib.ps1 tests/
git commit -m "test: scaffold homelab CLI lib + fixtures"
```

---

## Task 2: `Get-HomelabApps` — parse the include list

**Files:**
- Modify: `homelab.lib.ps1`
- Test: `tests/homelab.Tests.ps1`

- [ ] **Step 1: Write the failing test** (append to `tests/homelab.Tests.ps1`)

```powershell
Describe 'Get-HomelabApps' {
    It 'extracts app folder names from compose.yaml include entries' {
        $apps = Get-HomelabApps -ComposePath (Join-Path $fixtures 'compose.yaml')
        $apps.Count | Should Be 3
        ($apps -contains 'karakeep')     | Should Be $true
        ($apps -contains 'stirling-pdf') | Should Be $true
        ($apps -contains 'caddy')        | Should Be $true
    }
}
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `powershell -NoProfile -Command "Invoke-Pester -Path tests\homelab.Tests.ps1 -TestName 'Get-HomelabApps'"`
Expected: FAIL — `Get-HomelabApps` is not recognized.

- [ ] **Step 3: Implement** (append to `homelab.lib.ps1`)

```powershell
function Get-HomelabApps {
    param([Parameter(Mandatory)][string]$ComposePath)
    $apps = @()
    foreach ($line in Get-Content -LiteralPath $ComposePath) {
        if ($line -match '^\s*-\s*([A-Za-z0-9._-]+)/docker-compose\.ya?ml\s*$') {
            $apps += $Matches[1]
        }
    }
    return ,$apps
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `powershell -NoProfile -Command "Invoke-Pester -Path tests\homelab.Tests.ps1 -TestName 'Get-HomelabApps'"`
Expected: PASS (1 passed).

- [ ] **Step 5: Commit**

```bash
git add homelab.lib.ps1 tests/homelab.Tests.ps1
git commit -m "feat: Get-HomelabApps parses the compose include list"
```

---

## Task 3: `Get-AppServices` — parse service names from an app's compose

**Files:**
- Modify: `homelab.lib.ps1`
- Test: `tests/homelab.Tests.ps1`

- [ ] **Step 1: Write the failing test**

```powershell
Describe 'Get-AppServices' {
    It 'returns the service keys and excludes top-level volume keys' {
        $svc = Get-AppServices -AppComposePath (Join-Path $fixtures 'karakeep\docker-compose.yml')
        $svc.Count | Should Be 3
        ($svc -contains 'web')         | Should Be $true
        ($svc -contains 'chrome')      | Should Be $true
        ($svc -contains 'meilisearch') | Should Be $true
        # 'data' is a volume key, not a service — must NOT appear:
        ($svc -contains 'data')        | Should Be $false
    }
}
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `powershell -NoProfile -Command "Invoke-Pester -Path tests\homelab.Tests.ps1 -TestName 'Get-AppServices'"`
Expected: FAIL — `Get-AppServices` not recognized.

- [ ] **Step 3: Implement**

```powershell
function Get-AppServices {
    param([Parameter(Mandatory)][string]$AppComposePath)
    $services = @()
    $inServices = $false
    foreach ($line in Get-Content -LiteralPath $AppComposePath) {
        if ($line -match '^services:\s*$') { $inServices = $true; continue }
        # A new top-level key (column 0, not whitespace, not a comment) ends the block.
        if ($line -match '^[^\s#]') { $inServices = $false }
        if ($inServices -and $line -match '^  ([A-Za-z0-9._-]+):\s*$') {
            $services += $Matches[1]
        }
    }
    return ,$services
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `powershell -NoProfile -Command "Invoke-Pester -Path tests\homelab.Tests.ps1 -TestName 'Get-AppServices'"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add homelab.lib.ps1 tests/homelab.Tests.ps1
git commit -m "feat: Get-AppServices parses service keys, ignores volume keys"
```

---

## Task 4: `Get-EnvValue` — read a key from a .env file

**Files:**
- Modify: `homelab.lib.ps1`
- Test: `tests/homelab.Tests.ps1`

- [ ] **Step 1: Write the failing test**

```powershell
Describe 'Get-EnvValue' {
    It 'returns the value for a key' {
        Get-EnvValue -EnvPath (Join-Path $fixtures 'caddy.env') -Key 'TS_NET' | Should Be 'example.ts.net'
    }
    It 'returns $null for a missing key' {
        Get-EnvValue -EnvPath (Join-Path $fixtures 'caddy.env') -Key 'NOPE' | Should Be $null
    }
    It 'returns $null when the file does not exist' {
        Get-EnvValue -EnvPath (Join-Path $fixtures 'no-such.env') -Key 'TS_NET' | Should Be $null
    }
}
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `powershell -NoProfile -Command "Invoke-Pester -Path tests\homelab.Tests.ps1 -TestName 'Get-EnvValue'"`
Expected: FAIL.

- [ ] **Step 3: Implement**

```powershell
function Get-EnvValue {
    param(
        [Parameter(Mandatory)][string]$EnvPath,
        [Parameter(Mandatory)][string]$Key
    )
    if (-not (Test-Path -LiteralPath $EnvPath)) { return $null }
    $escaped = [regex]::Escape($Key)
    foreach ($line in Get-Content -LiteralPath $EnvPath) {
        if ($line -match "^\s*$escaped\s*=\s*(.*?)\s*$") {
            return $Matches[1]
        }
    }
    return $null
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `powershell -NoProfile -Command "Invoke-Pester -Path tests\homelab.Tests.ps1 -TestName 'Get-EnvValue'"`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add homelab.lib.ps1 tests/homelab.Tests.ps1
git commit -m "feat: Get-EnvValue reads a key from a .env file"
```

---

## Task 5: `Get-ServiceUrls` — map services to HTTPS URLs from the Caddyfile

**Files:**
- Modify: `homelab.lib.ps1`
- Test: `tests/homelab.Tests.ps1`

- [ ] **Step 1: Write the failing test**

```powershell
Describe 'Get-ServiceUrls' {
    It 'maps each proxied service to its https URL' {
        $urls = Get-ServiceUrls -CaddyfilePath (Join-Path $fixtures 'Caddyfile') -TsNet 'example.ts.net'
        $urls['web']          | Should Be 'https://karakeep.example.ts.net'
        $urls['stirling-pdf'] | Should Be 'https://stirling.example.ts.net'
    }
    It 'returns an empty map when TsNet is missing' {
        $urls = Get-ServiceUrls -CaddyfilePath (Join-Path $fixtures 'Caddyfile') -TsNet ''
        $urls.Count | Should Be 0
    }
}
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `powershell -NoProfile -Command "Invoke-Pester -Path tests\homelab.Tests.ps1 -TestName 'Get-ServiceUrls'"`
Expected: FAIL.

- [ ] **Step 3: Implement**

```powershell
function Get-ServiceUrls {
    param(
        [Parameter(Mandatory)][string]$CaddyfilePath,
        [string]$TsNet
    )
    $map = @{}
    if ([string]::IsNullOrWhiteSpace($TsNet) -or -not (Test-Path -LiteralPath $CaddyfilePath)) {
        return $map
    }
    $currentHost = $null
    foreach ($line in Get-Content -LiteralPath $CaddyfilePath) {
        if ($line -match '^([A-Za-z0-9._-]+)\.\{\$TS_NET\}\s*\{') {
            $currentHost = $Matches[1]
        }
        elseif ($line -match '^\s*reverse_proxy\s+([A-Za-z0-9._-]+):\d+') {
            if ($currentHost) { $map[$Matches[1]] = "https://$currentHost.$TsNet" }
        }
        elseif ($line -match '^\}') {
            $currentHost = $null
        }
    }
    return $map
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `powershell -NoProfile -Command "Invoke-Pester -Path tests\homelab.Tests.ps1 -TestName 'Get-ServiceUrls'"`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add homelab.lib.ps1 tests/homelab.Tests.ps1
git commit -m "feat: Get-ServiceUrls maps services to https URLs from the Caddyfile"
```

---

## Task 6: `Resolve-AppArgs` — extract app names from raw args

**Files:**
- Modify: `homelab.lib.ps1`
- Test: `tests/homelab.Tests.ps1`

- [ ] **Step 1: Write the failing test**

```powershell
Describe 'Resolve-AppArgs' {
    It 'returns positional app names' {
        $r = Resolve-AppArgs -RawArgs @('karakeep','memos')
        ($r -join ',') | Should Be 'karakeep,memos'
    }
    It 'treats --filter <app> as an app name' {
        (Resolve-AppArgs -RawArgs @('--filter','karakeep')) -join ',' | Should Be 'karakeep'
    }
    It 'treats --filter=<app> as an app name' {
        (Resolve-AppArgs -RawArgs @('--filter=memos')) -join ',' | Should Be 'memos'
    }
    It 'ignores other flags' {
        (Resolve-AppArgs -RawArgs @('--tail=100')).Count | Should Be 0
    }
    It 'returns empty for no args' {
        (Resolve-AppArgs -RawArgs @()).Count | Should Be 0
    }
}
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `powershell -NoProfile -Command "Invoke-Pester -Path tests\homelab.Tests.ps1 -TestName 'Resolve-AppArgs'"`
Expected: FAIL.

- [ ] **Step 3: Implement**

```powershell
function Resolve-AppArgs {
    param([string[]]$RawArgs = @())
    $apps = @()
    for ($i = 0; $i -lt $RawArgs.Count; $i++) {
        $a = $RawArgs[$i]
        if ($a -eq '--filter') {
            if ($i + 1 -lt $RawArgs.Count) { $apps += $RawArgs[$i + 1]; $i++ }
        }
        elseif ($a -like '--filter=*') {
            $apps += ($a -replace '^--filter=', '')
        }
        elseif ($a -notmatch '^-') {
            $apps += $a
        }
    }
    return ,$apps
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `powershell -NoProfile -Command "Invoke-Pester -Path tests\homelab.Tests.ps1 -TestName 'Resolve-AppArgs'"`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add homelab.lib.ps1 tests/homelab.Tests.ps1
git commit -m "feat: Resolve-AppArgs extracts app names (positional + --filter)"
```

---

## Task 7: `Resolve-Services` — map app names to a flat service list

**Files:**
- Modify: `homelab.lib.ps1`
- Test: `tests/homelab.Tests.ps1`

- [ ] **Step 1: Write the failing test**

```powershell
Describe 'Resolve-Services' {
    $map = @{ karakeep = @('web','chrome','meilisearch'); memos = @('memos') }

    It 'expands app names to all their services' {
        (Resolve-Services -AppNames @('karakeep') -AppServices $map) -join ',' | Should Be 'web,chrome,meilisearch'
    }
    It 'returns empty when no app names given (means all)' {
        (Resolve-Services -AppNames @() -AppServices $map).Count | Should Be 0
    }
    It 'throws a helpful error on an unknown app' {
        { Resolve-Services -AppNames @('bogus') -AppServices $map } | Should Throw
    }
}
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `powershell -NoProfile -Command "Invoke-Pester -Path tests\homelab.Tests.ps1 -TestName 'Resolve-Services'"`
Expected: FAIL.

- [ ] **Step 3: Implement**

```powershell
function Resolve-Services {
    param(
        [string[]]$AppNames = @(),
        [Parameter(Mandatory)][hashtable]$AppServices
    )
    $services = @()
    foreach ($app in $AppNames) {
        if (-not $AppServices.ContainsKey($app)) {
            $valid = (($AppServices.Keys) | Sort-Object) -join ', '
            throw "Unknown app '$app'. Valid apps: $valid"
        }
        $services += $AppServices[$app]
    }
    return ,$services
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `powershell -NoProfile -Command "Invoke-Pester -Path tests\homelab.Tests.ps1 -TestName 'Resolve-Services'"`
Expected: PASS (3 passed).

- [ ] **Step 5: Run the FULL suite to confirm everything is green**

Run: `powershell -NoProfile -Command "Invoke-Pester -Path tests\homelab.Tests.ps1 -EnableExit"`
Expected: PASS (all tests), process exit code 0.

- [ ] **Step 6: Commit**

```bash
git add homelab.lib.ps1 tests/homelab.Tests.ps1
git commit -m "feat: Resolve-Services maps apps to services, errors on unknown app"
```

---

## Task 8: `homelab.ps1` entry — preflight + dispatch (up/down/restart/logs/update/build)

**Files:**
- Create: `homelab.ps1`

This part shells out to Docker, so it is verified by manual smoke test rather than Pester.

- [ ] **Step 1: Write the entry script**

`homelab.ps1`:

```powershell
#requires -Version 5.1
# homelab — thin wrapper around `docker compose` for this repo.
# Runnable from any directory; always targets <repo>\compose.yaml.

$ErrorActionPreference = 'Stop'
$RepoRoot    = $PSScriptRoot
$ComposeFile = Join-Path $RepoRoot 'compose.yaml'
. (Join-Path $RepoRoot 'homelab.lib.ps1')

function Invoke-Compose {
    param([string[]]$ComposeArgs)
    & docker compose -f $ComposeFile @ComposeArgs
    return $LASTEXITCODE
}

function Test-DockerReady {
    & docker compose version *> $null
    return ($LASTEXITCODE -eq 0)
}

function Get-AppServicesMap {
    $map = @{}
    foreach ($app in (Get-HomelabApps -ComposePath $ComposeFile)) {
        $svcPath = Join-Path $RepoRoot (Join-Path $app 'docker-compose.yml')
        if (Test-Path -LiteralPath $svcPath) {
            $map[$app] = Get-AppServices -AppComposePath $svcPath
        }
    }
    return $map
}

function Show-Usage {
    @"
homelab — manage the homelab docker compose stack from anywhere

Usage: homelab <command> [apps...]

Commands:
  up       [apps]   start/refresh (docker compose up -d)
  down     [apps]   no apps: tear down everything; apps: stop+remove just those
  list     [apps]   status grouped by app, with HTTPS URLs
  logs     [apps]   follow logs (last 100 lines)
  restart  [apps]   restart containers
  update   [apps]   pull newer images, then recreate
  build    [apps]   rebuild images (e.g. caddy), then recreate
  install           add the 'homelab' function + tab-completion to your PowerShell profile
  uninstall         remove them
  help              this message

Apps are folder names from compose.yaml (e.g. karakeep, memos, caddy).
No apps = all apps. '--filter <app>' is accepted as an alias.
"@ | Write-Host
}

# --- dispatch ---
$verb = if ($args.Count -ge 1) { $args[0] } else { 'help' }
$rest = if ($args.Count -ge 2) { @($args[1..($args.Count - 1)]) } else { @() }

if ($verb -in @('help', '-h', '--help', '')) { Show-Usage; exit 0 }
if ($verb -eq 'install')   { Install-Homelab;   exit 0 }   # defined in Task 10
if ($verb -eq 'uninstall') { Uninstall-Homelab; exit 0 }   # defined in Task 10

if (-not (Test-DockerReady)) {
    Write-Host "Docker isn't responding. Is Docker Desktop running?" -ForegroundColor Yellow
    exit 1
}

try {
    $map      = Get-AppServicesMap
    $appNames = Resolve-AppArgs -RawArgs $rest
    $services = Resolve-Services -AppNames $appNames -AppServices $map
}
catch {
    Write-Host $_.Exception.Message -ForegroundColor Yellow
    exit 1
}

switch ($verb) {
    'up'      { exit (Invoke-Compose (@('up','-d')              + $services)) }
    'restart' { exit (Invoke-Compose (@('restart')             + $services)) }
    'logs'    { exit (Invoke-Compose (@('logs','-f','--tail=100') + $services)) }
    'update'  {
        $c = Invoke-Compose (@('pull') + $services)
        if ($c -ne 0) { exit $c }
        exit (Invoke-Compose (@('up','-d') + $services))
    }
    'build'   {
        $c = Invoke-Compose (@('build') + $services)
        if ($c -ne 0) { exit $c }
        exit (Invoke-Compose (@('up','-d') + $services))
    }
    'down'    {
        if ($services.Count -eq 0) { exit (Invoke-Compose @('down')) }
        else { exit (Invoke-Compose (@('rm','-s','-f') + $services)) }
    }
    'list'    { Show-HomelabList; exit 0 }   # defined in Task 9
    default   { Write-Host "Unknown command '$verb'." -ForegroundColor Yellow; Show-Usage; exit 1 }
}
```

> Note: `Show-HomelabList`, `Install-Homelab`, and `Uninstall-Homelab` are added in Tasks 9 and 10. Until then, `list`/`install`/`uninstall` will error — that's expected; this task only verifies the compose-passthrough verbs.

- [ ] **Step 2: Smoke-test the passthrough verbs against the real stack**

Run each and confirm behavior:

```powershell
.\homelab.ps1 help                 # prints usage
.\homelab.ps1 up memos             # recreates only memos; `docker ps` shows memos running
.\homelab.ps1 restart memos        # memos restarts
.\homelab.ps1 up karakeep          # web + chrome + meilisearch all come up
.\homelab.ps1 down memos           # memos container stopped+removed; others untouched
.\homelab.ps1 up bogusapp          # prints "Unknown app 'bogusapp'. Valid apps: ..." and exits 1
.\homelab.ps1 up memos --filter karakeep   # both memos and karakeep services come up
```

Expected: each maps to the right `docker compose` action; unknown app gives the friendly error; `down memos` leaves other apps running (`.\homelab.ps1 list` or `docker compose -f compose.yaml ps` to confirm).

- [ ] **Step 3: Commit**

```bash
git add homelab.ps1
git commit -m "feat: homelab.ps1 entry with preflight and compose-passthrough verbs"
```

---

## Task 9: `list` — enhanced, grouped-by-app status

**Files:**
- Modify: `homelab.ps1`

- [ ] **Step 1: Add the `Show-HomelabList` function** (insert in `homelab.ps1` above the `# --- dispatch ---` line)

```powershell
function Show-HomelabList {
    $map      = Get-AppServicesMap
    $appNames = Resolve-AppArgs -RawArgs $rest
    # Validate filter args (throws on unknown app, matching other verbs):
    [void](Resolve-Services -AppNames $appNames -AppServices $map)
    $appsToShow = if ($appNames.Count -gt 0) { $appNames } else { $map.Keys | Sort-Object }

    $tsNet = Get-EnvValue -EnvPath (Join-Path $RepoRoot 'caddy\.env') -Key 'TS_NET'
    $urls  = Get-ServiceUrls -CaddyfilePath (Join-Path $RepoRoot 'Caddyfile') -TsNet $tsNet

    # Current containers, keyed by service name.
    $byService = @{}
    $raw = & docker compose -f $ComposeFile ps --format json
    foreach ($line in $raw) {
        if (-not $line) { continue }
        $obj = $line | ConvertFrom-Json
        $byService[$obj.Service] = $obj
    }

    foreach ($app in $appsToShow) {
        $services = $map[$app]
        # App URL = the first of its services that Caddy proxies.
        $appUrl = $null
        foreach ($s in $services) { if ($urls.ContainsKey($s)) { $appUrl = $urls[$s]; break } }

        $header = $app
        if ($appUrl) { $header = "$app  ->  $appUrl" }
        Write-Host $header -ForegroundColor Cyan

        foreach ($s in $services) {
            if ($byService.ContainsKey($s)) {
                $c = $byService[$s]
                $state  = $c.State
                $health = if ($c.Health) { " ($($c.Health))" } else { "" }
                $color  = if ($state -eq 'running') { 'Green' } else { 'Red' }
                Write-Host ("    {0,-22} {1}{2}" -f $s, $state, $health) -ForegroundColor $color
            }
            else {
                Write-Host ("    {0,-22} {1}" -f $s, 'stopped') -ForegroundColor DarkGray
            }
        }
        Write-Host ""
    }
}
```

- [ ] **Step 2: Smoke-test**

```powershell
.\homelab.ps1 list
.\homelab.ps1 list karakeep
.\homelab.ps1 up memos
.\homelab.ps1 list memos          # memos service shown 'running' (green) with its URL
.\homelab.ps1 down memos
.\homelab.ps1 list memos          # memos shown 'stopped' (grey)
```

Expected: apps printed as headers with their `https://<app>.<tailnet>.ts.net` URL; each service line shows running/health in green or stopped in grey; filtering by app limits output; unknown app errors.

- [ ] **Step 3: Commit**

```bash
git add homelab.ps1
git commit -m "feat: homelab list shows per-app status with HTTPS URLs"
```

---

## Task 10: `install` / `uninstall` — profile function + tab-completion

**Files:**
- Modify: `homelab.ps1`

- [ ] **Step 1: Add `Install-Homelab` and `Uninstall-Homelab`** (insert in `homelab.ps1` above the `# --- dispatch ---` line)

```powershell
$script:HomelabMarkerStart = '# >>> homelab cli >>>'
$script:HomelabMarkerEnd   = '# <<< homelab cli <<<'

function Get-HomelabProfileBlock {
    $scriptPath = Join-Path $RepoRoot 'homelab.ps1'
    $libPath    = Join-Path $RepoRoot 'homelab.lib.ps1'
    $composePath = Join-Path $RepoRoot 'compose.yaml'
    @"
$script:HomelabMarkerStart
function homelab { & '$scriptPath' @args }
Register-ArgumentCompleter -CommandName homelab -ScriptBlock {
    param(`$wordToComplete, `$commandAst, `$cursorPosition)
    `$verbs = 'up','down','list','logs','restart','update','build','install','uninstall','help'
    if (`$commandAst.CommandElements.Count -le 2) {
        `$verbs | Where-Object { `$_ -like "`$wordToComplete*" } |
            ForEach-Object { [System.Management.Automation.CompletionResult]::new(`$_, `$_, 'ParameterValue', `$_) }
    }
    else {
        . '$libPath'
        Get-HomelabApps -ComposePath '$composePath' |
            Where-Object { `$_ -like "`$wordToComplete*" } |
            ForEach-Object { [System.Management.Automation.CompletionResult]::new(`$_, `$_, 'ParameterValue', `$_) }
    }
}
$script:HomelabMarkerEnd
"@
}

function Install-Homelab {
    $profilePath = $PROFILE
    $dir = Split-Path -Parent $profilePath
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    if (-not (Test-Path -LiteralPath $profilePath)) { New-Item -ItemType File -Path $profilePath -Force | Out-Null }

    $existing = Get-Content -LiteralPath $profilePath -Raw -ErrorAction SilentlyContinue
    if (-not $existing) { $existing = '' }

    $block = Get-HomelabProfileBlock
    # Remove any prior block, then append the fresh one (idempotent).
    $pattern = [regex]::Escape($script:HomelabMarkerStart) + '.*?' + [regex]::Escape($script:HomelabMarkerEnd)
    $cleaned = [regex]::Replace($existing, $pattern, '', 'Singleline').TrimEnd()
    $newContent = if ($cleaned) { "$cleaned`r`n`r`n$block`r`n" } else { "$block`r`n" }
    Set-Content -LiteralPath $profilePath -Value $newContent -Encoding UTF8

    Write-Host "Installed 'homelab' into $profilePath" -ForegroundColor Green
    Write-Host "Open a new PowerShell session (or run: . `$PROFILE) to use it." -ForegroundColor Green
}

function Uninstall-Homelab {
    $profilePath = $PROFILE
    if (-not (Test-Path -LiteralPath $profilePath)) { Write-Host "Nothing to remove."; return }
    $existing = Get-Content -LiteralPath $profilePath -Raw
    $pattern = [regex]::Escape($script:HomelabMarkerStart) + '.*?' + [regex]::Escape($script:HomelabMarkerEnd)
    $cleaned = [regex]::Replace($existing, $pattern, '', 'Singleline').TrimEnd()
    Set-Content -LiteralPath $profilePath -Value ($cleaned + "`r`n") -Encoding UTF8
    Write-Host "Removed 'homelab' from $profilePath" -ForegroundColor Green
}
```

- [ ] **Step 2: Smoke-test install/uninstall in a throwaway profile**

```powershell
# Use a temp profile so the real one isn't touched during the test:
$real = $PROFILE
$tmp  = Join-Path $env:TEMP 'hl_profile_test.ps1'
"# pre-existing line" | Set-Content $tmp

# Temporarily point $PROFILE at the temp file and run install twice (idempotency):
powershell -NoProfile -Command "`$PROFILE='$tmp'; . '.\homelab.ps1' install; . '.\homelab.ps1' install; Get-Content '$tmp'"
```

Expected: the temp profile contains exactly ONE `# >>> homelab cli >>>` … `# <<< homelab cli <<<` block (not two), plus the pre-existing line. Then:

```powershell
powershell -NoProfile -Command "`$PROFILE='$tmp'; . '.\homelab.ps1' uninstall; Get-Content '$tmp'"
Remove-Item $tmp
```

Expected: the block is gone; the pre-existing line remains.

- [ ] **Step 3: Real install + end-to-end check**

```powershell
.\homelab.ps1 install
. $PROFILE
homelab help              # works as a global command
cd C:\
homelab list              # works from a different directory
homelab up <TAB>          # tab-completes app names
```

Expected: `homelab` works from any directory; tab-completion offers verbs then app names.

- [ ] **Step 4: Commit**

```bash
git add homelab.ps1
git commit -m "feat: homelab install/uninstall manage profile function + completer"
```

---

## Task 11: README documentation + final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a CLI section to the README** (insert after the "## Setup" → "### 2. Bring up the stacks" content, before "### 3. System metrics")

```markdown
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
```

- [ ] **Step 2: Run the full test suite one more time**

Run: `powershell -NoProfile -Command "Invoke-Pester -Path tests\homelab.Tests.ps1 -EnableExit"`
Expected: all tests pass, exit code 0.

- [ ] **Step 3: Final smoke test of every verb**

```powershell
homelab list
homelab up memos ; homelab list memos ; homelab restart memos ; homelab down memos ; homelab list memos
homelab logs caddy   # Ctrl-C to exit
```

Expected: each behaves as documented; `down memos` leaves other apps running.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document the homelab CLI"
```

---

## Self-Review Notes (addressed)

- **Spec coverage:** every command in the spec table maps to a task (verbs → Task 8; `list` → Task 9; `install`/`uninstall` → Task 10). Dynamic discovery → Tasks 2/3/5. URL column → Tasks 4/5/9. Location independence → `$PSScriptRoot` + `$PROFILE` function (Tasks 8/10). Dependency/app-scoping semantics → `Resolve-Services` folder-scoping (Task 7) + `down` behavior (Task 8). Error handling → preflight + try/catch (Task 8). Testing → Tasks 2–7.
- **Deviation from spec:** the spec mentioned a `docker compose config --services` fallback for service parsing; the implementation uses only the parser (`Get-AppServices`) because it is fixture-tested and dependency-free, and the repo's compose files follow a strict convention. No functional gap.
- **Type/name consistency:** `Get-HomelabApps`, `Get-AppServices`, `Get-EnvValue`, `Get-ServiceUrls`, `Resolve-AppArgs`, `Resolve-Services`, `Get-AppServicesMap`, `Show-HomelabList`, `Install-Homelab`, `Uninstall-Homelab` are referenced consistently across tasks.
