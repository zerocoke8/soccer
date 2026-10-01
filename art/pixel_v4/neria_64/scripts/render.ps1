# Run from the current project directory. Lua alone draws and exports the sprite.
$ErrorActionPreference = 'Stop'
$asepriteExe = 'C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe'
& $asepriteExe -b --script-param pass=final --script scripts/draw.lua | Out-String
if ($LASTEXITCODE -ne 0) { throw 'Sprite rendering failed.' }
& $asepriteExe -b --script-param pass=final --script scripts/previews.lua | Out-String
if ($LASTEXITCODE -ne 0) { throw 'Preview rendering failed.' }
& $asepriteExe -b --script scripts/palette.lua | Out-String
& $asepriteExe -b --script scripts/verify.lua | Out-String
if ($LASTEXITCODE -ne 0) { throw 'Verification failed.' }
