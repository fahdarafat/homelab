$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here '..\homelab.lib.ps1')
$fixtures = Join-Path $here 'fixtures'

Describe 'Get-HomelabApps' {
    It 'extracts app folder names from compose.yaml include entries' {
        $apps = Get-HomelabApps -ComposePath (Join-Path $fixtures 'compose.yaml')
        $apps.Count | Should Be 3
        ($apps -contains 'karakeep')     | Should Be $true
        ($apps -contains 'stirling-pdf') | Should Be $true
        ($apps -contains 'caddy')        | Should Be $true
    }
}

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
