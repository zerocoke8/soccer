"""Final form pass: far hair volume, face framing and keeper-glove finger planes."""
from pathlib import Path
import re
file=Path('scripts/draw.lua')
text=file.read_text(encoding='utf-8')
back="""
layer('01b Far hair / shaded aqua fall', 47, 17, {
  'hmmmsH....',
  'hmmwmsH...',
  'hmmwwmsH..',
  'hmmwwmsH..',
  'hmmwwmsH..',
  'smmwwmsH..',
  'smmwwmsH..',
  'smmwwmsH..',
  'smmwwmsH..',
  'smmwwmsH..',
  'smmwwmsH..',
  'smmwwmsH..',
  'smmwwmsH..',
  'smmwwmsH..',
  'smmwwmsH..',
  'smmwwmsH..',
  'smmwwmsH..',
  'smmwwmsH..',
  'smmwimsH..',
  'smmwimsH..',
  'smiwimsH..',
  'smiwiasH..',
  'smiwiasH..',
  'smiiiasH..',
  'smiiiasH..',
  'smiiiasH..',
  'smiiiasH..',
  'smiiiasH..',
  'smiaiasH..',
  '.saiaasH..',
  '.saiaakH..',
  '.saiaakH..',
  '..kaaakH..',
  '...kkkH...',
  '....HH....',
})

"""
text=text.replace("layer('02 Boots socks and legs'",back+"layer('02 Boots socks and legs'")
text=text.replace("'DwwGbwDwmD...'","'DwwGbwnwmD...'")
text=text.replace("'.DwwwwDwmD...'","'.DwwwwnwmD...'")
text=text.replace("'.DuDwwDwmD...'","'.DunwwnwmD...'")
text=text.replace("'DNbwWGGDDumD..'","'DNbwWGGnnumD..'")
text=text.replace("'..DumDDwwumD..'","'..DumnnwwumD..'")

# A short, silver face-framing lock, fully authored at 1x.
front="""
layer('13 Cheek framing silver lock', 46, 20, {
  '..msH...',
  '..msH...',
  '..msH...',
  '..msH...',
  '..msH...',
  '..msH...',
  '..msH...',
  '..msH...',
  '.wmsh...',
  '.wmsh...',
  '.wmsh...',
  'wwmsh...',
  'wmmsh...',
  'mmsh....',
  'msh.....',
  'hh......',
})

"""
text=text.replace("sprite:saveAs('base.aseprite')",front+"sprite:saveAs('base.aseprite')")
file.write_text(text,encoding='utf-8')
