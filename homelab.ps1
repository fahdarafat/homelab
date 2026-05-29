#requires -Version 5.1
# homelab — thin wrapper around `docker compose` for this repo.
# Runnable from any directory; always targets <repo>\compose.yaml.

$ErrorActionPreference = 'Stop'
$RepoRoot    = $PSScriptRoot
$ComposeFile = Join-Path $RepoRoot 'compose.yaml'
. (Join-Path $RepoRoot 'homelab.lib.ps1')

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# list — grouped-by-app status with HTTPS URLs
# ---------------------------------------------------------------------------

function Show-HomelabList {
    $map      = Get-AppServicesMap
    $appNames = Resolve-AppArgs -RawArgs $rest
    # Validate filter args (throws on unknown app, matching other verbs):
    [void](Resolve-Services -AppNames $appNames -AppServices $map)
    $appsToShow = if ($appNames.Count -gt 0) { $appNames } else { $map.Keys | Sort-Object }

    $tsNet = Get-EnvValue -EnvPath (Join-Path $RepoRoot 'caddy\.env') -Key 'TS_NET'
    $urls  = Get-ServiceUrls -CaddyfilePath (Join-Path $RepoRoot 'caddy\Caddyfile') -TsNet $tsNet

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

# ---------------------------------------------------------------------------
# install / uninstall — manage the $PROFILE function + tab-completion
# ---------------------------------------------------------------------------

$script:HomelabMarkerStart = '# >>> homelab cli >>>'
$script:HomelabMarkerEnd   = '# <<< homelab cli <<<'

function Get-HomelabProfileBlock {
    $scriptPath  = Join-Path $RepoRoot 'homelab.ps1'
    $libPath     = Join-Path $RepoRoot 'homelab.lib.ps1'
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

# ---------------------------------------------------------------------------
# dispatch
# ---------------------------------------------------------------------------

$verb = if ($args.Count -ge 1) { $args[0] } else { 'help' }
$rest = if ($args.Count -ge 2) { @($args[1..($args.Count - 1)]) } else { @() }

if ($verb -in @('help', '-h', '--help', '')) { Show-Usage; exit 0 }
if ($verb -eq 'install')   { Install-Homelab;   exit 0 }
if ($verb -eq 'uninstall') { Uninstall-Homelab; exit 0 }

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
    'up'      { exit (Invoke-Compose (@('up','-d')               + $services)) }
    'restart' { exit (Invoke-Compose (@('restart')               + $services)) }
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
    'list'    { Show-HomelabList; exit 0 }
    default   { Write-Host "Unknown command '$verb'." -ForegroundColor Yellow; Show-Usage; exit 1 }
}
