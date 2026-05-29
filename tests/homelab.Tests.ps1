$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here '..\homelab.lib.ps1')
$fixtures = Join-Path $here 'fixtures'
