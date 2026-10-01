"""Polish the far-side hair silhouette so its roots join the crown naturally."""
from pathlib import Path
import re
file=Path('scripts/draw.lua')
text=file.read_text(encoding='utf-8')
rows=[
    '..H.......', # y10
    '.smH......',
    '.wmsH.....',
    'wwmssH....',
    'wwmmssH...',
    'wwmmssH...',
    'wwmmssH...',
    'mwwmssH...',
    'mwwmssH...',
    'mwwmssH...',
    'mmwmssH...',
    'mmwmssH...',
    'smwmssH...',
    'smwmssH...',
    'smwmssH...',
    'smwmssH...',
    'smwmssH...',
    'smwmssH...',
    'smwmssH...',
    'smwmssH...',
    'smwmssH...',
    'smwmssH...',
    'smwmssH...',
    'smwmssH...',
    'smiwmsH...',
    'smiimsH...',
    'smiimsH...',
    'smiimsH...',
    'smiiisH...',
    'smiiisH...',
    'smiiisH...',
    'smiiasH...',
    'smiiasH...',
    'smiiasH...',
    'smiaasH...',
    '.siaasH...',
    '.siaasH...',
    '.siaakH...',
    '.siaakH...',
    '..aakH....',
    '..kkH.....',
    '...H......',
]
block="layer('01b Far hair / shaded aqua fall', 47, 10, {\n"+''.join("  '%s',\n"%r for r in rows)+'})'
text,n=re.subn(r"layer\('01b Far hair / shaded aqua fall'.*?\n\}\)",lambda _:block,text,flags=re.S)
assert n==1
file.write_text(text,encoding='utf-8')
