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
