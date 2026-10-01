from pathlib import Path
p=Path('scripts/draw.lua');s=p.read_text(encoding='utf-8')
s=s.replace("H='77818E', h='A0A6B0', s='C3C5CD', m='DDDDE1', l='F0EEEC', w='FFF9ED'", "H='66778C', h='949EAF', s='BFC6D2', m='DFE1E6', l='F2EFEF', w='FFF9EF'")
s=s.replace("K='936F7C', k='B98C90', t='D8A79D', u='EDC1AE', v='F9D8BF', f='FFE9D0'", "K='936E7A', k='B6868A', t='D5A39B', u='ECC0AE', v='F6D6C2', f='FFE9D5'")
start=s.index('map(36,22,[[');end=s.index('-- Ears are attached',start)
s=s[:start]+'''map(36,22,[[
........KKKKKKKKKKKKKKKKKKKKKK
.....KKKttuuuvvvvvvvvvvvvuutttkK
...KKtuuvvffffffffffffffffvvvuuttkK
..KtuuvvffffffffffffffffffffvvvuutkK
.KtuuvvfffffffffffffffffffffvvvutkK
KtuuvvffffffffffffffffffffffvvvutkK
KtuuvvffffffffffffffffffffffvvvutkK
KtuuvvffffffffffffffffffffffvvvutkK
KtuvvvfffffffffffffffffffffvvvvutkK
KtuvvvffffffffffffffffffffvvvvvutkK
KtuvvvfffffffffffffffffffvvvvvvutkK
KtuvvvffffffffffffffffffvvvvvvvutkK
KtuuvvfffffffffffffffffvvvvvvvvvutkK
KtuuvvffffffffffffffffvvvvvvvvvutkK
.KtuuvvffffffffffffffvvvvvvvvvutkK
.KtuuvvfffffffffffffvvvvvvvvvvutkK
..KtuuvvfffffffffffvvvvvvvvvvvutkK
...KtuuvvfffffffffvvvvvvvvvvvvutkK
....KtuuvvffffffffvvvvvvvvvvvuutK
......KtuuvvfffffvvvvvvvvvvvuutK
.......KtuuvvffffvvvvvvvvvvuutK
.........KttuvvvvvvvvvvvvuuttK
............KttuuuvvvvuuuttK
...............KKttttttttKK
...................KKKKKK
]])
''' +s[end:]
s=s.replace('map(66,40,[[\nrRr\n.r\n]])','map(64,39,[[\nrRRr\n.rr\n]])')
s=s.replace('map(58,43,[[\nktt\n.uv\n]])','map(58,43,[[\nKkk\n.uv\n]])')
# Stronger pupil and lower iris. This eye is shaded as clusters, not a white square.
s=s.replace('IOiOOibIN\n.OiOOibIN\n.OiijibIN\n.OiijibIN\n..bjjibI.\n...bbb..',
'''IOiOOibIN
.OiOOinIN
.OiibInIN
.OijibnIN
..bjjibI.
...bbb..''')
s=s.replace('IOiOOIn\n.OiOOIn\n.OiibIn\n.OijbIn\n..bjjI.\n...bb..',
'''IOOOinI
.OiOInI
.OibInI
.OijbnI
..bjjI.
...bb..''')
# Left cheek lock: one full tapering clump rather than two uniform stripes.
start=s.index('map(22,3,[[');end=s.index(']])',start)+3
rows=s[start:end].split('[[',1)[1].split(']]',1)[0].strip().splitlines()
rows=rows[:29]+'''HsmlllwwlmssmmlhH
HsmlllwwlmssmmlhH
HsmlllwwlmssmmlhH
HsmlllwwlmssmmlhH
HsmlllwwlmssmmlhH
HsmlllwwlmssmmlhH
HsmlllwwlmssmmlhH
HsmlllwwlmssmmlhH
.HslllwwlmssmmlhH
.HslllwwlmssmmlhH
.HslllwwlmssmmlhH
.HslllwwlmssmmlhH
..HsllwwlmssmmlhH
..HsllwwlmssmmlhH
..HsllwllmssmmlhH
..HsllwllmssmmlhH
...HslwllmssmmlhH
...HslwllmssmmlhH
....HslwllmssmlhH
....HslwllmssmlhH
.....HslwllmsmlhH
......HslwllmmlhH
.......HslwllmlhH
........HslwlmhH
.........HslmhH
..........HshH
...........HH'''.splitlines()
s=s[:start]+'map(22,3,[[\n'+'\n'.join(rows)+'\n]])'+s[end:]
# Deliberately designed broad glints following the curve of the crown.
pos=s.index("layer('07 Oversized")
s=s[:pos]+'''-- Crown strand glints and a short parting shadow; all clusters are attached.
map(29,9,[[
...................llmm
................llmmm
.............lllmmm
..........llllmmm
........llllmm
.....llllmmm
...llllmmm
.llllmmm
lllmmm
llmmm
lmmm
]])
map(57,8,[[
mmss
llmss
.llmss
..llmss
...llmss
....llmss
.....llmss
......llmss
.......llmss
........llmss
.........llmss
..........llms
...........lms
............ms
]])

''' +s[pos:]
# Make the coral shoulder accent a hanging cord with a two-strand tassel.
s=s.replace('map(39,57,[[\n.gg\n.gn\n.pp\npCCp\npCCp\npCpp\n.pp\n]])',
'''map(40,56,[[
gg
gn
pp
pC
pC
pC
pC
pp
]])''')
p.write_text(s,encoding='utf-8')
