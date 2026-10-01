from pathlib import Path
p=Path('scripts/draw.lua');s=p.read_text(encoding='utf-8')
start=s.index('map(32,45,[[');end=s.index(']])',start)+3
rows=s[start:end].split('[[',1)[1].split(']]',1)[0].strip().splitlines()
# Fill and contour the far waist so the keeper top joins the shorts.
# Every entry is a specifically placed five-pixel material/embroidery cluster.
inserts={49:'lwllm',50:'lwwll',51:'wwllm',52:'wllmm',53:'llmmm',
         54:'llccc',55:'ccddc',56:'cddll',57:'dclll',58:'clllm',
         59:'cllmm',60:'ccmmm',61:'mmsss',62:'nnbbn',63:'nnnnn',
         64:'NNNNN',65:'bbbbn',66:'bbbbn',67:'bbbbn'}
for y,cluster in inserts.items():
    i=y-45;r=rows[i];rows[i]=r[:-4]+cluster+r[-4:]
s=s[:start]+'map(32,45,[[\n'+'\n'.join(rows)+'\n]])'+s[end:]
p.write_text(s,encoding='utf-8')
