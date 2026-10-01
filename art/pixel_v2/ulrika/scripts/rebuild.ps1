$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectPath
try {
  $asepritePath = 'C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe'
  $buildProcess = Start-Process -FilePath $asepritePath -ArgumentList @('-b','--script','scripts/build.lua') -WindowStyle Hidden -Wait -PassThru
  if ($buildProcess.ExitCode -ne 0) { throw 'Sprite build failed.' }
  $verifyProcess = Start-Process -FilePath $asepritePath -ArgumentList @('-b','--script','scripts/verify_export.lua') -WindowStyle Hidden -Wait -PassThru
  if ($verifyProcess.ExitCode -ne 0) { throw 'Verification/export failed.' }
} finally {
  Pop-Location
}
