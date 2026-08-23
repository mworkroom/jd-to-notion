param(
  [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$launcherPath = Join-Path $PSScriptRoot 'start-local-app.ps1'
$syncUrl = "http://127.0.0.1:$Port/api/google-sheets/sync"
$localStateDirectory = Join-Path $projectRoot '.local'
$syncLogPath = Join-Path $localStateDirectory 'google-sheets-sync.log'

function Show-SyncNotification {
  param(
    [string]$Title,
    [string]$Message,
    [ValidateSet('Info', 'Warning', 'Error')]
    [string]$Tone = 'Info'
  )

  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $notification = New-Object System.Windows.Forms.NotifyIcon
  try {
    $notification.Icon = switch ($Tone) {
      'Error' { [System.Drawing.SystemIcons]::Error }
      'Warning' { [System.Drawing.SystemIcons]::Warning }
      default { [System.Drawing.SystemIcons]::Information }
    }
    $notification.Visible = $true
    $toolTipIcon = [System.Windows.Forms.ToolTipIcon]::$Tone
    $notification.ShowBalloonTip(5000, $Title, $Message, $toolTipIcon)
    Start-Sleep -Seconds 5
  } finally {
    $notification.Dispose()
  }
}

function Write-SyncLog {
  param([string]$Message)

  New-Item -ItemType Directory -Path $localStateDirectory -Force | Out-Null
  Add-Content -LiteralPath $syncLogPath -Value "$(Get-Date -Format o) $Message" -Encoding UTF8
}

function Get-SafeApiError {
  param($ErrorRecord)

  $payload = $null
  if ($ErrorRecord.ErrorDetails.Message) {
    try {
      $payload = $ErrorRecord.ErrorDetails.Message | ConvertFrom-Json
    } catch {
      $payload = $null
    }
  }

  if (-not $payload -and $ErrorRecord.Exception.Response) {
    try {
      $stream = $ErrorRecord.Exception.Response.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      $payload = $reader.ReadToEnd() | ConvertFrom-Json
      $reader.Dispose()
    } catch {
      $payload = $null
    }
  }

  $code = [string]$payload.error.code
  $message = [string]$payload.error.message
  $issue = $payload.error.details.issue
  $targetName = [string]$payload.error.details.target.name

  if ($code -eq 'GOOGLE_SHEETS_NOT_READY' -and $issue.code -eq 'GOOGLE_TARGET_SHEET_MISSING') {
    return "$targetName 탭이 없습니다. 탭을 만든 뒤 다시 실행해주세요."
  }
  if ($code -eq 'GOOGLE_SYNC_IN_PROGRESS') {
    return '이미 Google Sheets 동기화가 실행 중입니다.'
  }
  if ($code -eq 'GOOGLE_SHEETS_WRITE_DISABLED') {
    return 'Google Sheets 쓰기 기능이 비활성화되어 있습니다.'
  }
  if ($issue.message) {
    return [string]$issue.message
  }
  if ($message) {
    return $message
  }
  return $ErrorRecord.Exception.Message
}

function Invoke-Utf8JsonPost {
  param(
    [string]$Uri,
    [string]$Body,
    [int]$TimeoutMilliseconds = 120000
  )

  $request = [System.Net.HttpWebRequest]::Create($Uri)
  $request.Method = 'POST'
  $request.ContentType = 'application/json; charset=utf-8'
  $request.Accept = 'application/json'
  $request.Timeout = $TimeoutMilliseconds
  $request.ReadWriteTimeout = $TimeoutMilliseconds

  $requestBytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
  $request.ContentLength = $requestBytes.Length
  $requestStream = $request.GetRequestStream()
  try {
    $requestStream.Write($requestBytes, 0, $requestBytes.Length)
  } finally {
    $requestStream.Dispose()
  }

  $response = $request.GetResponse()
  try {
    $reader = New-Object System.IO.StreamReader(
      $response.GetResponseStream(),
      [System.Text.Encoding]::UTF8
    )
    try {
      return $reader.ReadToEnd() | ConvertFrom-Json
    } finally {
      $reader.Dispose()
    }
  } finally {
    $response.Dispose()
  }
}

try {
  $powershellPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $launcherArguments = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-WindowStyle', 'Hidden',
    '-File', ('"{0}"' -f $launcherPath),
    '-NoBrowser',
    '-NoDialogs',
    '-EnsureRunning',
    '-Port', [string]$Port
  )
  $launcher = Start-Process `
    -FilePath $powershellPath `
    -ArgumentList $launcherArguments `
    -WindowStyle Hidden `
    -Wait `
    -PassThru
  if ($launcher.ExitCode -ne 0) {
    throw "JD to Notion 서버를 시작하지 못했습니다. 종료 코드: $($launcher.ExitCode)"
  }

  $body = @{ mode = 'all'; confirm = $true } | ConvertTo-Json -Compress
  $result = Invoke-Utf8JsonPost -Uri $syncUrl -Body $body

  if ([int]$result.writtenRowCount -gt 0) {
    $message = "$($result.target.name) · $($result.writtenRowCount)행 / Work Log $($result.writtenPageCount)건 전송 완료"
    if ([int]$result.heldPageCount -gt 0) {
      $message += " · 보류 $($result.heldPageCount)건"
    }
  } elseif ([int]$result.heldPageCount -gt 0) {
    $message = "$($result.target.name) · 전송 가능한 Work Log가 없습니다. · 보류 $($result.heldPageCount)건 (앱에서 사유를 확인해주세요.)"
  } else {
    $message = "$($result.target.name) · 새로 전송할 Work Log가 없습니다."
  }

  Write-SyncLog "SUCCESS $message"
  Show-SyncNotification -Title 'JD to Notion · Google Sheets' -Message $message
  exit 0
} catch {
  $safeMessage = Get-SafeApiError $_
  Write-SyncLog "ERROR $safeMessage"
  Show-SyncNotification -Title 'Google Sheets 동기화 중단' -Message $safeMessage -Tone 'Error'
  exit 1
}
