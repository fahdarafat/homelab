# Self-hosted apps backup - config + bind-mount data + named Docker volumes.
# Creates a timestamped, standalone snapshot under E:\selfhosted\backups and keeps the newest $Keep.
$ErrorActionPreference = 'Continue'
$Root       = 'E:\selfhosted'
$BackupRoot = Join-Path $Root 'backups'
$Keep       = 7
# Named Docker volumes to archive (bind mounts are covered by the file copy below):
$Volumes    = @('karakeep_data', 'karakeep_meilisearch')

$ts   = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$Dest = Join-Path $BackupRoot $ts
$VolDir = Join-Path $Dest 'volumes'
New-Item -ItemType Directory -Force -Path $VolDir | Out-Null

Start-Transcript -Path (Join-Path $Dest 'backup.log') -Force | Out-Null
"[$(Get-Date -Format o)] Backup START -> $Dest"

# 1) Config files + bind-mounted data (everything under E:\selfhosted except the backups folder)
"Copying config + bind-mount data ..."
robocopy $Root (Join-Path $Dest 'files') /E /XD $BackupRoot /R:1 /W:1 /NFL /NDL /NP /NJH /NJS | Out-Null
"  robocopy exit code: $LASTEXITCODE (0-7 means success)"

# 2) Named Docker volumes -> tar.gz (skipped gracefully if Docker isn't running)
docker version --format '{{.Server.Version}}' 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  foreach ($v in $Volumes) {
    "Archiving volume $v ..."
    docker run --rm -v "${v}:/data:ro" -v "${VolDir}:/backup" alpine tar czf "/backup/$v.tar.gz" -C /data . 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { "  OK: $v.tar.gz" } else { "  FAILED: $v" }
  }
} else {
  "Docker not reachable - skipped volume archives. File copy above still captured config and bind mounts."
}

# 3) Retention - keep the newest $Keep snapshots
Get-ChildItem $BackupRoot -Directory | Sort-Object Name -Descending | Select-Object -Skip $Keep | ForEach-Object {
  "Pruning old backup: $($_.Name)"
  Remove-Item $_.FullName -Recurse -Force
}

"[$(Get-Date -Format o)] Backup DONE"
Stop-Transcript | Out-Null
