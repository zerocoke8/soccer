$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$aseprite = 'C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe'
foreach ($script in @('scripts/study.lua', 'scripts/build.lua', 'scripts/verify_export.lua')) {
    & $aseprite -b --script $script | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Aseprite failed: $script" }
}
