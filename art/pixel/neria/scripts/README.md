# Neria native sprite

Run from this project directory in PowerShell:

```powershell
& 'C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe' -b --script scripts/build_base.lua
& 'C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe' -b --script scripts/verify.lua
```

`build_base.lua` creates the 64x64, one-frame layered sprite and an exact nearest-neighbour preview. Each palette entry is snapped to a real RGB pixel in `source.png`. All construction uses integer pixel fills and Bresenham lines. Coordinates use an inclusive zero-based convention.

`draft.png` was generated in one built-in image_gen call with `source.png` as the identity reference. The exact prompt is saved in `draft_prompt.txt`. Its overly fine grid and frontal stance made automatic downsampling unsuitable, so the final sprite is manually reconstructed in Lua from that draft and the illustration, with a right-facing face, clean clusters, separated gloves and common foot baseline. Rebuilding requires only `source.png`; it does not call imagegen again.

`verify.lua` checks the native file against the PNG, dimensions, frame count, alpha, palette, source palette membership, bounding box, connectivity and both feet at y=62. It writes `verification.txt` and `compare.png`.

Layers are arranged back to front for later animation. Ornamental filigree is deliberately reduced to waves, hair-clasp petals, glove padding and coral tassels.
