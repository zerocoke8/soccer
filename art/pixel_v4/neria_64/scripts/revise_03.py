"""Second refinement: eyes, layered silver fringe, belt and cleated boots."""
from pathlib import Path
import re

file=Path('scripts/draw.lua')
text=file.read_text(encoding='utf-8')
def read(name):
    pat=r"layer\('"+re.escape(name)+r"', (\d+), (\d+), \{\n(.*?)\n\}\)"
    m=re.search(pat,text,re.S)
    return int(m[1]),int(m[2]),re.findall(r"'([^']*)'",m[3])
def replace(name,x,y,rows):
    global text
    block="layer('%s', %d, %d, {\n"%(name,x,y)+''.join("  '%s',\n"%r for r in rows)+'})'
    text,n=re.subn(r"layer\('"+re.escape(name)+r"'.*?\n\}\)",lambda _:block,text,flags=re.S)
    assert n==1

text=text.replace('0xFFF8EC','0xFFFCF4').replace('0xEEE9E3','0xF0ECE6')
text=text.replace('0xD7D3D4','0xD6D5DC').replace('0xB9B9C3','0xB8BBC9')

x,y,rows=read('07 Crown swept fringe and long sidelocks')
rows[6]='...hsmwWWWWWWWWWWWWwmssmwwwwwmmsh.....'
rows[7]='..hsmwWWWWWWWWWWWWWwmssmwwwwwwmsh.....'
rows[8]='..smwWWWWWWWWWWWWWwwmssmwwwwwwmmsh....'
rows[9]='.hsmwWWWWWWWWWWWwwwmssmmwwwwwwmmsh....'
rows[10]='.hsmwWWWWWWWWWWwwwwmssmwwwwwwmmssh....'
rows[11]='.hsmwWWWWWWWWWwwwwwmssmwwwwwwmmssh....'
rows[12]='.hsmwWWWWWWWwwwwwwmssmwwwwwwmmmsh.....'
rows[13]='.hsmwWWWWWwwwwwwwmssmwwwwwmmmssh......'
rows[14]='.hsmwWWWWwwwwwwwmssmwwwwmmmsshh.......'
rows[15]='.hsmwWWWwwwwwwmssmmwwwmmmsshh.........'
rows[16]='.hsmwWWWwwwwmssmmwwmmmsshh............'
rows[17]='.hsmwWWwwwmssmmwwmmsshh...............'
rows[18]='.hsmwWWwmsh...........................'
rows[19]='.hsmwWWmsh............................'
replace('07 Crown swept fringe and long sidelocks',x,y,rows)

replace('06 Face / eyes brows and mouth',29,20,[
    '..ttt........ttt....',
    '...................',
    'DDDDDD......DDDDD...',
    'wllWlw......wlWlw...',
    'wllElw......wlElw...',
    '.bbcbl......lbcb....',
    '..bbb........bb.....',
])

x,y,rows=read('05 Face and ears')
rows[13]='...SpfffFFFFFFFFFffffpS...'
rows[14]='...SppfffFFFFFFFffffppS...'
rows[15]='....SpprrffffffffpprrS....'
rows[16]='.....SppfffffStffffppS....'
replace('05 Face and ears',x,y,rows)

x,y,rows=read('01 Hair back / long calm aqua ends')
# Shape the outer curtain into a gentle convex fall; no windblown strands.
for index in range(22,33):
    rows[index]=rows[index][1:]
for index in range(33,38):
    rows[index]=rows[index][1:]
for index in range(39,46):
    rows[index]='.'+rows[index]
replace('01 Hair back / long calm aqua ends',x,y,rows)

x,y,rows=read('02 Boots socks and legs')
rows[-2]='DNnuwwwuND........DNuwwwuunnD.'
rows[-1]='.DD...DDD..........DD...DDD...'
replace('02 Boots socks and legs',x,y,rows)

addition="""
layer('12 Waist buckle and boot accents', 31, 41, {
  'NNnnNNgggD........',
  'NNNNNNGLGD........',
  'NnnNNNGNLD........',
  'NNNNNNGGGD........',
})

"""
text=text.replace("sprite:saveAs('base.aseprite')",addition+"sprite:saveAs('base.aseprite')")
file.write_text(text,encoding='utf-8')
