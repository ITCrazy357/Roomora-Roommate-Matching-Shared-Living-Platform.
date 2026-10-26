param(
  [Parameter(Mandatory)][string]$BackupFile,
  [string]$ComposeFile = 'compose.deploy.yml',
  [string]$EnvFile = 'deploy/roomora.env',
  [string]$ContainerName,
  [string]$DatabaseUser = 'roomora'
)
$ErrorActionPreference = 'Stop'
$taskBackup = (Resolve-Path -LiteralPath $BackupFile).Path
$taskChecksum = "$taskBackup.sha256"
if (!(Test-Path -LiteralPath $taskChecksum)) { throw 'Missing SHA256 sidecar' }
if ((Get-FileHash -LiteralPath $taskBackup -Algorithm SHA256).Hash -ne (Get-Content -LiteralPath $taskChecksum).Trim()) {
  throw 'Backup checksum does not match'
}
$taskCompose = @('compose', '--env-file', $EnvFile, '-f', $ComposeFile)
$taskExec = if ($ContainerName) { @('exec', '-i', $ContainerName) } else { $taskCompose + @('exec', '-T', 'postgres') }
$taskContainer = if ($ContainerName) { $ContainerName } else { & docker @taskCompose ps --quiet postgres }
if (!$taskContainer) { throw 'PostgreSQL container is not running' }
$taskId = [Guid]::NewGuid().ToString('N')
$taskDatabase = "roomora_restore_$taskId"
$taskRemoteFile = "/tmp/roomora-restore-$taskId.dump"
$taskCreated = $false
try {
  & docker cp $taskBackup "${taskContainer}:$taskRemoteFile"
  if ($LASTEXITCODE -ne 0) { throw 'Copying backup failed' }
  & docker @taskExec createdb -U $DatabaseUser $taskDatabase
  if ($LASTEXITCODE -ne 0) { throw 'Creating isolated restore database failed' }
  $taskCreated = $true
  & docker @taskExec pg_restore -U $DatabaseUser -d $taskDatabase --exit-on-error --single-transaction --no-owner --no-acl $taskRemoteFile
  if ($LASTEXITCODE -ne 0) { throw 'Restoring backup failed' }
  # Print exact counts for every restored table, including Prisma migration history.
  $taskQuery = @'
SELECT format('SELECT %L AS table_name, count(*) AS rows FROM %I.%I;', tablename, schemaname, tablename)
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
\gexec
'@
  $taskQuery | & docker @taskExec psql -X -v ON_ERROR_STOP=1 -U $DatabaseUser -d $taskDatabase
  if ($LASTEXITCODE -ne 0) { throw 'Reading restored tables failed' }
  Write-Output "Restore verified in isolated database $taskDatabase"
} finally {
  # Only drop the random database created by this invocation, never a supplied target.
  if ($taskCreated -and $taskDatabase -match '^roomora_restore_[a-f0-9]{32}$') {
    & docker @taskExec dropdb -U $DatabaseUser $taskDatabase
    if ($LASTEXITCODE -ne 0) { Write-Warning "Cleanup failed for $taskDatabase" }
  }
  & docker @taskExec rm -f $taskRemoteFile
}
