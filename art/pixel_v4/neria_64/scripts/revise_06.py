"""Join the far-side hair to the upper silhouette without a forked root."""
from pathlib import Path
import re
file=Path('scripts/draw.lua')
text=file.read_text(encoding='utf-8')
pat=r"layer\('01b Far hair / shaded aqua fall', 47, 10, \{\n(.*?)\n\}\)"
m=re.search(pat,text,re.S)
assert m
rows=re.findall(r"'([^']*)'",m[1])
rows=['H...........','mHH.........','mmsHH.......','wmmsHH......','wwmmsHH.....','wwwmmsHH....','wwwwmmsHH...']+['..'+row for row in rows[5:]]
block="layer('01b Far hair / shaded aqua fall', 45, 8, {\n"+''.join("  '%s',\n"%r for r in rows)+'})'
text=text[:m.start()]+block+text[m.end():]
file.write_text(text,encoding='utf-8')
