$ErrorActionPreference = 'Stop'
$asepriteExe = 'C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe'
$projectDir = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectDir
try {
    foreach ($luaScript in @('scripts/build_base.lua', 'scripts/previews.lua', 'scripts/verify.lua')) {
        $process = Start-Process -FilePath $asepriteExe -ArgumentList '-b', '--script', $luaScript -WindowStyle Hidden -Wait -PassThru
        if ($process.ExitCode -ne 0) { throw "Aseprite failed: $luaScript" }
    }
    Get-Content -LiteralPath 'verification.txt'
} finally {
    Pop-Location
}
