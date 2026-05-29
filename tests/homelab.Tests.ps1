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
