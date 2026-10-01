MIRKA - native 64 x 64 base sprite

Deliverables
  base.aseprite   Editable 8-layer RGB sprite, one frame.
  base.png        Flattened transparent sprite, native 64 x 64.
  draft.png       Built-in imagegen reference draft (not the game asset).
  preview_8x.png  Exact nearest-neighbour 8x preview on neutral grey.
  compare.png     Source reference alongside the 8x preview.
  verification.txt  Automated checks and limitations.

Build from this directory (PowerShell):
  powershell -ExecutionPolicy Bypass -File scripts/rebuild.ps1
  (Rebuild waits for the build before verifying and exporting previews.)

The scripts only read/write inside the current directory. Both accept a root
script parameter if needed. No Python packages or network calls are required.
The build script overwrites its named outputs to reproduce this exact sprite.

Process
One built-in imagegen call produced draft.png; its exact prompt is preserved in
scripts/draft_prompt.txt. The draft did not obey a native 64px grid and was too
front-facing. Rather than reducing its detailed pixels, the final silhouette,
limbs and facial features were redrawn on the native grid using Aseprite Lua.
All rendering is integer-pixel polygon fills, Bresenham lines and individual
pixels. Palette targets are mapped to actual opaque source illustration pixels;
scripts/palette.tsv records the resulting source-sampled RGB swatches.
The final PNG uses 23 opaque colours plus transparent, from 25 opaque swatches.

Coordinates (zero based, inclusive)
  Silhouette: (8,8) through (49,62), size 42 x 55.
  Baseline: y62, two distinct boot soles.
  Face and body: right-facing three-quarter profile.
  Top margin: 8 pixels, intentionally petite relative to a full-height sprite.

Known limitations
This is a single idle base frame. Fine embroidery is simplified to gold knots,
plum tassels, and sage/cream panels. The fang is one pixel. Relative team height
must be checked against the other character assets, which were not supplied.
