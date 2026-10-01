Run from the parent (mirka) directory using Aseprite 1.3.18:
"C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe" -b --script scripts/study.lua
"C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe" -b --script scripts/sample_draft.lua
"C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe" -b --script scripts/build.lua
"C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe" -b --script scripts/verify_export.lua

The saved draft.png came from one built-in imagegen call with both supplied
images. The full prompt is saved in draft_prompt.txt. Regeneration of the
deliverables is deterministic from the saved draft and source references.
sample_draft.lua uses 5x5 cell voting, removes neutral-grey background, and
quantizes to the fixed palette. build.lua performs the native pixel redraw
and retains the sampled draft as a hidden construction layer.
base.aseprite: semantic editable RGBA layers, fixed palette, one frame.
base.png: flattened transparent 64x64. preview_8x.png: exact nearest-neighbour.
compare.png: source at left; final at centre; reference crops at right.
