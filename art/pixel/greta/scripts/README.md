# Greta base sprite

Run these commands in the project directory using PowerShell:

```powershell
& 'C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe' -b --script scripts/build_base.lua
& 'C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe' -b --script scripts/verify.lua
```

`build_base.lua` creates one RGB frame with six semantic layers and exports `base.aseprite` and `base.png`. Every final pixel is drawn on the native 64x64 canvas. The matte palette is snapped to actual RGB samples in `source.png`.

`draft.png` was produced by one built-in imagegen call, with the exact prompt in `draft_prompt.txt`. Its proportions and irregular pixel grid needed correction, so the final anatomy, hair, face, costume and outlines were reconstructed as native Lua pixel clusters after visual study rather than retaining a downsampled image. The draft is a reference, not another game sprite.

`verify.lua` reopens the saved native asset and PNG, checks their pixel equality, canvas, frame count, binary alpha, palette size, source color membership, bounds, boot baseline and connected silhouette. It writes `verification.txt`, `preview_8x.png` and `compare.png`. The sprite preview uses exact nearest-neighbour enlargement; only the illustration in the comparison is area-downsampled.

Coordinates are zero-based. Foot baseline is y=62. The head is about 21 pixels tall excluding the horns. Brass harness, bracers, cheek scar, grin, rear flame cloth and flame boots are simplified for 1x readability. No ball, ground shadow or invented tail is included.
