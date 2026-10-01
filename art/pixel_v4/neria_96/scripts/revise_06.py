from pathlib import Path
p=Path('scripts/draw.lua');s=p.read_text(encoding='utf-8')
start=s.index("layer('07 Oversized");end=s.index("layer('08 Hair jewellery",start)
s=s[:start]+'''layer('07 Oversized gloves - four fingers padded palms')
map(30,59,[[
.....NNNNNNNN
....NnbcccbbnN
....NbgGGGgbnN
....NbglwlgbnN
...NbbgggggbbnN
..Hssllwlllmmssn
.Hllwwllccccllmn
HlwwwwlcbGGbclmn
HlwwwHlcglGbcmln
HlwwH.wlcGbcmlmn
HlmH.Hwlccclmlmn
.nn..Hwlblwblwlmn
.....Hwlblwblwlmn
.....Hlmblmblmlmn
......nn.nn.nn.nn
]])
map(64,55,[[
....NNNNNN
...NnbccbnN
...NbgGGgbnN
...NbglwgbnN
..NbbggggbbnN
.Hssllwwlmssn
Hllwwllcbcllmn
HlwwwlcbGGbclmn
HlwwHlcglGbcmln
HlmH.wlcGbcmlmn
.nn.Hwlcccllmn
....Hwlblwblmn
....Hwlblwblmn
....Hlmblmblmn
.....nn.nn.nn
]])

''' +s[end:]
# A short swept bang gives the hair a natural off-centre parting.
pos=s.index('-- Crown strand glints')
s=s[:pos]+'''map(58,22,[[
lllmshH
.lllmshH
..lllmshH
...llmshH
...llmshH
...llmshH
...lmshH
...mshH
..mshH
..shH
...H
]])
''' +s[pos:]
# Rebuild lower boot sole rows with two broad cleat clusters on a shared y=93.
s=s.replace('NmmllllmmbnN\n.NNNNNNNNNN\n]])',
'''NnmmllmmbnnN
.NNN....NNN
]])''')
s=s.replace('..NmlllllmmmsN\n...NNNNNNNNNN\n]])',
'''..NnmllllmmmnN
...NNN....NNN
]])''')
# Additional wave curl belongs to the cloth layer, beneath the gloves.
pos=s.index("layer('03 Legs")
s=s[:pos]+'''map(34,75,[[
..ccc
.cdcc
.cdll
.ccml
..ccc
...cb
..cbb
.ccbb
.ddbc
]])

''' +s[pos:]
p.write_text(s,encoding='utf-8')
