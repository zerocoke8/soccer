from pathlib import Path
p=Path('scripts/draw.lua'); s=p.read_text(encoding='utf-8')
start=s.index('map(22,3,[['); end=s.index(']])',start)+3
rows=s[start:end].split('[[',1)[1].split(']]',1)[0].strip().splitlines()
out=[]
for y,r in enumerate(rows,3):
    if y<=27:
        pos=len(r)-12
        # Explicitly extend the existing crown's tonal cluster; this writes
        # literal characters to draw.lua, never scales or resamples pixels.
        key='h' if y==3 else 'm' if y==4 else 'l'
        out.append(r[:pos]+key*6+r[pos:])
    else:
        cut=r.find('.',len(r)-len(r.lstrip('.')))
        out.append(r[:cut] if cut>=0 else r)
right='''map(69,25,[[
HsmlllmsshH
HsmlllmsshH
HsmlllmsshH
HsmlllmsshH
HsmlllmsshH
HsmlllmsshH
HsmlllmsshH
HsmlllmsshH
HsmlllmsshH
HsmlllmsshH
HsmlllmsshH
HsmlllmsshH
HsmlllmsshH
HsmlllmsshH
HsmlllmsshH
HsmlllmsshH
HsmlllmsshH
HsmlllmsshH
HsmlllmsshH
HsmlllmsshH
HsmlllmsshH
HsmlllmsshH
.HslllmshH
.HslllmshH
.HslllmshH
.HslllmshH
..HsllmshH
..HsllmshH
..HsllmshH
...HslmshH
...HslmshH
....HsmshH
.....HshH
......HH
]])'''
s=s[:start]+'map(22,3,[[\n'+'\n'.join(out)+'\n]])\n'+right+s[end:]
p.write_text(s,encoding='utf-8')
