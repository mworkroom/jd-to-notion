param(
  [switch]$NoBrowser,
  [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$appUrl = "http://127.0.0.1:$Port/"
$expectedTitle = '<title>Admissions Guideline Helper</title>'
$localStateDirectory = Join-Path $projectRoot '.local'
$standardOutputLog = Join-Path $localStateDirectory 'app-server.log'
$standardErrorLog = Join-Path $localStateDirectory 'app-server-error.log'

function Get-LocalAppStatus {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $appUrl -TimeoutSec 2

    if ($response.StatusCode -eq 200 -and $response.Content.Contains($expectedTitle)) {
      return 'ready'
    }

    return 'occupied'
  } catch {
    if ($_.Exception.Response) {
      return 'occupied'
    }

    return 'stopped'
  }
}

function Show-LauncherError {
  param([string]$Message)

  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show(
    $Message,
    'Admission Helper',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
}

function Open-LocalApp {
  if (-not $NoBrowser) {
    Start-Process $appUrl
  }
}

$initialStatus = Get-LocalAppStatus

if ($initialStatus -eq 'ready') {
  Open-LocalApp
  exit 0
}

if ($initialStatus -eq 'occupied') {
  Show-LauncherError "Port $Port is already being used by another app.`n`nClose that app and try again."
  exit 1
}

try {
  $npmCommand = Get-Command npm.cmd -ErrorAction Stop
} catch {
  Show-LauncherError 'Node.js/npm could not be found. Reinstall Node.js or add npm to PATH.'
  exit 1
}

New-Item -ItemType Directory -Path $localStateDirectory -Force | Out-Null

try {
  $serverProcess = Start-Process `
    -FilePath $npmCommand.Source `
    -ArgumentList @('start') `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $standardOutputLog `
    -RedirectStandardError $standardErrorLog `
    -PassThru
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
    Show-LauncherError "Port $Port was taken by another app while Admission Helper was starting."
    exit 1
  }

  if ($serverProcess.HasExited) {
    break
  }
}

Show-LauncherError "Admission Helper did not start successfully.`n`nCheck:`n$standardErrorLog"
exit 1

