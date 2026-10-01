NERIA -- reproducible native 64x64 sprite

Rebuild everything from the project directory:
  powershell -ExecutionPolicy Bypass -File scripts/rebuild.ps1

Or run these scripts, in sequence, with Aseprite 1.3.18:
  Aseprite.exe -b --script scripts/study.lua
  Aseprite.exe -b --script scripts/sample_draft.lua
  Aseprite.exe -b --script scripts/build.lua
  Aseprite.exe -b --script scripts/export_verify.lua

Inputs: source.png, reference_pixel.png, draft.png.
The one draft was generated using the built-in imagegen tool with BOTH supplied
images as references. The exact generation prompt is in draft_prompt.txt.
The draft is a concept/shape guide, not the production sprite.

sample_draft.lua measures the draft foreground rectangle, samples cells on a
64x64 grid, removes the grey backdrop and maps to the shared palette. This raw
sample has holes and aliasing: it is retained only as a hidden guide layer.

build.lua traces and extensively redraws that guide with native Lua pixel
primitives: hair silhouette and clusters, facial features, jersey, gloves,
shorts, feet and accessories. Drawing is deterministic, without smoothing.
The hidden sampled guide does not contribute to the final rendering.
Edit coordinates/stamps in build.lua and colours in palette.lua to revise.

export_verify.lua REOPENS the .aseprite source, renders visible layers, exports
base.png, checks dimensions/alpha/colours/bounds/connectivity/baseline, and
creates the nearest-neighbour preview and comparison. No generated API call
is needed to rerun this workflow.

Final outputs:
- base.aseprite: one frame, eight visible editable layers and one hidden guide.
- base.png: native transparent 64x64 RGBA sprite.
- preview_8x.png: 512x512 exact nearest-neighbour on neutral grey.
- compare.png: source illustration left, final 8x middle, style crops right.
- verification.txt: measured structural checks and known simplifications.

Coordinates are zero-based and bounding-box endpoints are inclusive.
Colour counts refer to visible opaque RGB colours; transparency adds one
palette entry. Single-pixel eye highlights and similar functional details
are intentionally allowed; isolated opaque silhouette pixels are forbidden.
Reference crops are for visual comparison only, never incorporated into art.
