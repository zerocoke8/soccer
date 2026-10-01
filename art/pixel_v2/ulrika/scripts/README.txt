ULRIKA BASE SPRITE - REPRODUCIBLE ASEPRITE LUA PIPELINE

From the project directory, run:
  powershell -ExecutionPolicy Bypass -File scripts/rebuild.ps1

Or use the provided Aseprite executable with -b --script for each Lua file:
  scripts/study.lua          : reference crop study (optional)
  scripts/build.lua          : draft sampling + native cleanup + editable sprite
  scripts/verify_export.lua  : verification.txt and compare.png

All inputs and outputs resolve relative to this project directory.
draft.png is the unchanged output of one built-in imagegen call using BOTH
source.png and reference_pixel.png. Exact prompt: scripts/draft_prompt.txt.
No API key or generation call is needed to rebuild from the saved draft.

build.lua samples the draft's detected magenta-background foreground into
33x50 pixels, maps to a deliberate 28-colour palette, then cleanup.lua
reconstructs readable native clusters, contours, eyes, hands and clothing.
The final artwork uses a subset of that palette. All drawing/export is done
through Aseprite Lua, not another raster library.
For inspecting the raw quantized draft only, pass --script-param cleanup=no
to build.lua (this overwrites base outputs; rerun rebuild.ps1 for final art).

Edit scripts/cleanup.lua to adjust the final native pixels. Palette entries
are documented in scripts/build.lua. Coordinates are zero-based.
The three layers partition final pixels by drawn feature and remain editable.
Reference crops are style-analysis and comparison material only.

Files delivered:
base.aseprite, base.png, preview_8x.png, compare.png, verification.txt,
draft.png, plus the reusable scripts and style/prompt notes in scripts/.
