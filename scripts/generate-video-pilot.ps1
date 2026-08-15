param(
  [string[]]$Only = @(),
  [switch]$All,
  [switch]$Force,
  [string]$OutputRoot = ""
)

$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"

$projectRoot = Split-Path -Parent $PSScriptRoot
$taskFile = Join-Path $projectRoot "docs\video\vertical-slice-tasks.json"
$referenceRoot = Join-Path $projectRoot "assets\references"
$videoRoot = if ($OutputRoot) {
  if ([System.IO.Path]::IsPathRooted($OutputRoot)) { $OutputRoot } else { Join-Path $projectRoot $OutputRoot }
} else {
  Join-Path $projectRoot "assets\video"
}
$providerRoot = "C:\Users\vivix\.codex\skills\media-generation\providers\video\seedance-2-0-asset"
$generator = Join-Path $providerRoot "scripts\generate.py"

$config = Get-Content -Raw -Encoding utf8 $taskFile | ConvertFrom-Json
$pilotIds = @($config.pricing.pilot_ids)
$Only = @($Only | ForEach-Object { $_ -split "," } | Where-Object { $_ } | ForEach-Object { $_.Trim() })
$requestedIds = if ($Only.Count -gt 0) {
  $Only
} elseif ($All) {
  @($config.tasks | ForEach-Object { $_.id })
} else {
  $pilotIds
}
$tasks = @($config.tasks | Where-Object { $requestedIds -contains $_.id })

if ($tasks.Count -ne $requestedIds.Count) {
  $found = @($tasks | ForEach-Object { $_.id })
  $missing = @($requestedIds | Where-Object { $found -notcontains $_ })
  throw "Unknown task id(s): $($missing -join ', ')"
}

New-Item -ItemType Directory -Force -Path $videoRoot | Out-Null

foreach ($task in $tasks) {
  $outputPath = Join-Path $videoRoot $task.file
  if ((Test-Path -LiteralPath $outputPath) -and -not $Force) {
    Write-Host "[skip] $($task.id) already exists: $outputPath"
    continue
  }

  $prompt = "$($config.shared_prompt)`n`n$($task.prompt)"
  $cliArgs = @(
    "-3",
    $generator,
    "--prompt", $prompt,
    "--duration", [string]$task.duration,
    "--resolution", [string]$config.resolution,
    "--ratio", [string]$config.ratio,
    "--route", "asset",
    "--output", $outputPath
  )

  if ($config.audio -eq $false) {
    $cliArgs += "--no-audio"
  }

  foreach ($reference in $task.references) {
    $referencePath = Join-Path $referenceRoot $reference
    if (-not (Test-Path -LiteralPath $referencePath)) {
      throw "Missing reference image: $referencePath"
    }
    $cliArgs += @("--image", $referencePath)
  }

  Write-Host "[generate] $($task.id) $($task.duration)s -> $outputPath"
  & py @cliArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Seedance generation failed for $($task.id) with exit code $LASTEXITCODE"
  }
}

Write-Host "[done] Requested pilot videos are available in $videoRoot"
