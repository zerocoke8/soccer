$ErrorActionPreference = 'Stop'
$spriteRoot = Split-Path -Parent $PSScriptRoot
$asepriteExe = 'C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe'
Push-Location -LiteralPath $spriteRoot
try {
    foreach ($luaScript in @('scripts/build_base.lua', 'scripts/verify.lua')) {
        $process = Start-Process -FilePath $asepriteExe -ArgumentList @('-b', '--script', $luaScript) -WorkingDirectory $spriteRoot -WindowStyle Hidden -Wait -PassThru
        if ($process.ExitCode -ne 0) { throw "Aseprite failed: $luaScript ($($process.ExitCode))" }
    }
    Get-Content -LiteralPath 'verification.txt'
} finally {
    Pop-Location
}
