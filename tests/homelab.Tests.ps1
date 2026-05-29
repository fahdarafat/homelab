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
    It 'returns empty when the compose file does not exist' {
        (Get-AppServices -AppComposePath (Join-Path $fixtures 'no-such.yml')).Count | Should Be 0
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
    It 'does not add an entry for a non-container upstream (host.docker.internal)' {
        $urls = Get-ServiceUrls -CaddyfilePath (Join-Path $fixtures 'Caddyfile') -TsNet 'example.ts.net'
        $urls.ContainsKey('host.docker.internal') | Should Be $false
        $urls.ContainsKey('host')                 | Should Be $false
    }
    It 'returns an empty map when the Caddyfile does not exist' {
        (Get-ServiceUrls -CaddyfilePath (Join-Path $fixtures 'no-such-Caddyfile') -TsNet 'example.ts.net').Count | Should Be 0
    }
}

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
    It 'throws when --filter has no value' {
        { Resolve-AppArgs -RawArgs @('--filter') } | Should Throw
    }
}

Describe 'Resolve-Services' {
    $map = @{ karakeep = @('web','chrome','meilisearch'); memos = @('memos') }

    It 'expands app names to all their services' {
        (Resolve-Services -AppNames @('karakeep') -AppServices $map) -join ',' | Should Be 'web,chrome,meilisearch'
    }
    It 'returns empty when no app names given (means all)' {
        (Resolve-Services -AppNames @() -AppServices $map).Count | Should Be 0
    }
    It 'throws a helpful error on an unknown app' {
        { Resolve-Services -AppNames @('bogus') -AppServices $map } | Should Throw "Unknown app 'bogus'"
    }
}
