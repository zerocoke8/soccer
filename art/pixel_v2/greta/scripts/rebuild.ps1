$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  $aseprite = 'C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe'
  Start-Process -FilePath $aseprite -ArgumentList '-b','--script','scripts/study.lua' -Wait -WindowStyle Hidden
  Start-Process -FilePath $aseprite -ArgumentList '-b','--script','scripts/build.lua' -Wait -WindowStyle Hidden
  Start-Process -FilePath $aseprite -ArgumentList '-b','--script','scripts/verify_export.lua' -Wait -WindowStyle Hidden
} finally { Pop-Location }
