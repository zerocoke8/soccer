SILLUEN - REUSABLE NATIVE SPRITE WORKFLOW

Run from PowerShell: ./scripts/rebuild.ps1
Requires Aseprite 1.3.18 at the Steam path configured in rebuild.ps1.
All reads and writes are relative to this project root.

Inputs: source.png, reference_pixel.png, draft.png.
1. study.lua crops four style references into scripts/reference_crop_*.png.
2. build.lua removes the draft's magenta background, finds its bounding box,
   samples 5x5 subpoints per target cell, and reduces to the fixed palette.
3. cleanup.lua reconstructs face, eyes, outlines, hair and clothing with native
   pixel clusters in seven editable layers. The sampled trace is hidden.
4. verify_export.lua reopens base.aseprite, checks its visible composite against
   base.png, verifies geometry/alpha/palette/connectivity, and writes the exact
   nearest-neighbour preview, comparison image and verification.txt.

Generation provenance: ONE built-in imagegen call with both supplied images.
Exact prompt: scripts/draft_prompt.txt. No API/CLI imagegen fallback was used.
draft.png is the preserved generated draft, not the final native sprite.
Reference-sheet characters are cropped only for comparison; their pixels are
never incorporated into base.png or the visible Aseprite layers.

Edit cleanup.lua coordinates or build.lua palette to change the final sprite.
Native coordinate origin is top left; all bounding boxes are inclusive.
Expected final: 27 opaque RGB colours, bbox (13,12)-(50,61), height 50,
feet baseline y=61, no detached opaque components, alpha only 0 or 255.
Known simplification: fine illustration embroidery is reduced to gold piping
and small leaf marks to preserve readability at 64x64.
