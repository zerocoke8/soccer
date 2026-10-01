$ErrorActionPreference = 'Stop'
$asepriteExe = 'C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe'
$projectDirectory = Split-Path -Parent $PSScriptRoot
foreach ($luaScript in @('scripts/build_base.lua', 'scripts/verify.lua')) {
    $process = Start-Process -FilePath $asepriteExe -ArgumentList '-b','--script',$luaScript -WorkingDirectory $projectDirectory -Wait -PassThru -WindowStyle Hidden
    if ($process.ExitCode -ne 0) { throw "Aseprite failed: $luaScript" }
}
Get-Content -LiteralPath (Join-Path $projectDirectory 'verification.txt')
