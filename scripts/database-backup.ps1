param(
  [string]$ComposeFile = 'compose.deploy.yml',
  [string]$EnvFile = 'deploy/roomora.env',
  [string]$OutputDirectory = 'backups',
  [string]$ContainerName,
  [string]$DatabaseName = 'roomora',
  [string]$DatabaseUser = 'roomora'
)
$ErrorActionPreference = 'Stop'
$taskCompose = @('compose', '--env-file', $EnvFile, '-f', $ComposeFile)
$taskExec = if ($ContainerName) { @('exec', $ContainerName) } else { $taskCompose + @('exec', '-T', 'postgres') }
$taskContainer = if ($ContainerName) { $ContainerName } else { & docker @taskCompose ps --quiet postgres }
if (!$taskContainer) { throw 'PostgreSQL container is not running' }
$taskBackupId = [Guid]::NewGuid().ToString('N')
$taskRemoteFile = "/tmp/roomora-$taskBackupId.dump"
$taskDirectory = New-Item -ItemType Directory -Force -Path $OutputDirectory
$taskOutput = Join-Path $taskDirectory.FullName "roomora-$(Get-Date -Format 'yyyyMMdd-HHmmss')-$taskBackupId.dump"
try {
  & docker @taskExec pg_dump -U $DatabaseUser -d $DatabaseName --format=custom --no-owner --no-acl --file=$taskRemoteFile
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed' }
  & docker cp "${taskContainer}:$taskRemoteFile" $taskOutput
  if ($LASTEXITCODE -ne 0) { throw 'Copying backup failed' }
  $taskHash = (Get-FileHash -LiteralPath $taskOutput -Algorithm SHA256).Hash
  Set-Content -LiteralPath "$taskOutput.sha256" -Value $taskHash -Encoding ascii
  Write-Output $taskOutput
} finally {
  & docker @taskExec rm -f $taskRemoteFile
}
