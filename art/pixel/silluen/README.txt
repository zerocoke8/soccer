SILLUEN / SILVER-SAGE FOREST ELF

base.aseprite : one 64x64 frame, nine editable layers
base.png      : flattened transparent native sprite
preview_8x.png: exact nearest-neighbour 8x preview on neutral grey
compare.png   : reduced original illustration beside the 8x sprite
draft.png     : one imagegen reference draft, not production pixel art
verification.txt : machine checks and visual-review notes

Rebuild from the project directory:
  powershell -ExecutionPolicy Bypass -File scripts/rebuild.ps1
Or run each Lua script in order with Aseprite -b --script:
  scripts/build_base.lua
  scripts/previews.lua
  scripts/verify.lua

build_base.lua loads scripts/native.lua, the native pixel drawing implementation.
All files are written relative to the project directory. No Python dependencies.
Source colour provenance: scripts/palette_source.txt.
Built-in imagegen prompt and draft evaluation: scripts/draft_prompt.txt.

Pose: relaxed right-facing three-quarter profile. Both feet contact y=62.
Preserved identity: silver-sage straight hair, pointed ear, leaf ornament,
calm green eye, adult curved torso, ivory/moss costume, brass fittings,
long leaf-embroidered panels, thigh-high socks, green-and-ivory boots.
No ball. Fine embroidery, fingers and fittings are intentionally simplified.
