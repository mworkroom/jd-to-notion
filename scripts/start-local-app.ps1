param(
  [switch]$NoBrowser,
  [switch]$NoDialogs,
  [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$appUrl = "http://127.0.0.1:$Port/"
$expectedTitle = '<title>JD to Notion</title>'
$localStateDirectory = Join-Path $projectRoot '.local'
$standardOutputLog = Join-Path $localStateDirectory 'app-server.log'
$standardErrorLog = Join-Path $localStateDirectory 'app-server-error.log'
$serverPidFile = Join-Path $localStateDirectory 'app-server.pid'

function Get-LocalAppStatus {
  $tcpClient = [System.Net.Sockets.TcpClient]::new()

  try {
    $connectTask = $tcpClient.ConnectAsync('127.0.0.1', $Port)

    if (-not $connectTask.Wait(500) -or -not $tcpClient.Connected) {
      return 'stopped'
    }
  } catch {
    return 'stopped'
  } finally {
    $tcpClient.Dispose()
  }

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $appUrl -TimeoutSec 2
    if ($response.StatusCode -eq 200 -and $response.Content.Contains($expectedTitle)) {
      return 'ready'
    }

    return 'occupied'
  } catch {
    return 'occupied'
  }
}

function Show-LauncherError {
  param([string]$Message)

  if ($NoDialogs) {
    [Console]::Error.WriteLine($Message)
    return
  }

  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show(
    $Message,
    'JD to Notion',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
}

function Open-LocalApp {
  if (-not $NoBrowser) {
    Start-Process $appUrl
  }
}

function Stop-RecordedLocalServer {
  if (-not (Test-Path -LiteralPath $serverPidFile)) {
    return $false
  }

  $recordedPid = 0
  if (-not [int]::TryParse((Get-Content -Raw -LiteralPath $serverPidFile).Trim(), [ref]$recordedPid)) {
    Remove-Item -LiteralPath $serverPidFile -Force -ErrorAction SilentlyContinue
    return $false
  }

  $recordedProcess = Get-Process -Id $recordedPid -ErrorAction SilentlyContinue
  if (-not $recordedProcess -or $recordedProcess.ProcessName -ne 'node') {
    Remove-Item -LiteralPath $serverPidFile -Force -ErrorAction SilentlyContinue
    return $false
  }

  Stop-Process -Id $recordedPid -ErrorAction Stop
  $recordedProcess.WaitForExit(3000)
  Remove-Item -LiteralPath $serverPidFile -Force -ErrorAction SilentlyContinue
  return $true
}

$initialStatus = Get-LocalAppStatus

if ($initialStatus -eq 'ready') {
  if (-not (Stop-RecordedLocalServer)) {
    Open-LocalApp
    exit 0
  }
  $initialStatus = Get-LocalAppStatus
}

if ($initialStatus -eq 'occupied') {
  Show-LauncherError "Port $Port is already being used by another app.`n`nClose that app and try again."
  exit 1
}

try {
  $nodeCommand = Get-Command node.exe -ErrorAction Stop
} catch {
  Show-LauncherError 'Node.js could not be found. Reinstall Node.js or add it to PATH.'
  exit 1
}

New-Item -ItemType Directory -Path $localStateDirectory -Force | Out-Null
$env:PORT = [string]$Port

# Some terminal hosts expose both `Path` and `PATH`. Windows PowerShell's
# Start-Process treats those names as duplicates, so keep the canonical entry.
$processEnvironment = [Environment]::GetEnvironmentVariables()
$pathKeys = @($processEnvironment.Keys | Where-Object { $_ -ieq 'Path' })
if ($pathKeys -ccontains 'Path' -and $pathKeys -ccontains 'PATH') {
  [Environment]::SetEnvironmentVariable('PATH', $null, 'Process')
}

try {
  $serverProcess = Start-Process `
    -FilePath $nodeCommand.Source `
    -ArgumentList @('src/server/server.js') `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $standardOutputLog `
    -RedirectStandardError $standardErrorLog `
    -PassThru
  Set-Content -LiteralPath $serverPidFile -Value $serverProcess.Id -Encoding Ascii
} catch {
  Show-LauncherError "The local server could not be started.`n`n$($_.Exception.Message)"
  exit 1
}

for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
  Start-Sleep -Milliseconds 250
  $status = Get-LocalAppStatus

  if ($status -eq 'ready') {
    Open-LocalApp
    exit 0
  }

  if ($status -eq 'occupied') {
    Show-LauncherError "Port $Port was taken by another app while JD to Notion was starting."
    exit 1
  }

  if ($serverProcess.HasExited) {
    break
  }
}

Show-LauncherError "JD to Notion did not start successfully.`n`nCheck:`n$standardErrorLog"
exit 1
