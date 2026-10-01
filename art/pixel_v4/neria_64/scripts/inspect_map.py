"""Print native palette symbols; no image-writing library is used."""
from pathlib import Path
import re
code=Path('scripts/draw.lua').read_text(encoding='utf-8')
grid=[['.']*64 for _ in range(64)]
for name,x,y,body in re.findall(r"layer\('([^']+)', (\d+), (\d+), \{\n(.*?)\n\}\)",code,re.S):
    x,y=int(x),int(y)
    for j,row in enumerate(re.findall(r"'([^']*)'",body)):
        for i,c in enumerate(row):
            if c!='.': grid[y+j][x+i]=c
for y in range(5,21):
    print(str(y).rjust(2),''.join(grid[y][40:57]))
