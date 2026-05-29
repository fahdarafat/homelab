# Pure helper functions for the homelab CLI.
# No Docker calls, no side effects — safe to dot-source in tests.

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
