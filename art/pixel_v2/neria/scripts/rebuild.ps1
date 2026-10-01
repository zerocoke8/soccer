param([string]$Aseprite = 'C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectRoot
try {
    foreach ($luaScript in @('study.lua', 'sample_draft.lua', 'build.lua', 'export_verify.lua')) {
        $process = Start-Process -FilePath $Aseprite -ArgumentList @('-b', '--script', ('scripts/' + $luaScript)) -WorkingDirectory $projectRoot -WindowStyle Hidden -Wait -PassThru
        if ($process.ExitCode -ne 0) { throw ('Aseprite failed: ' + $luaScript) }
    }
    $report = Get-Content -LiteralPath 'verification.txt' -Raw
    if ($report -notmatch 'Overall structural verification: PASS') { throw 'Verification failed; inspect verification.txt.' }
    Write-Output $report
} finally {
    Pop-Location
}
