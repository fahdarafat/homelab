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
