from pathlib import Path
p=Path('scripts/draw.lua')
s=p.read_text(encoding='utf-8')
start=s.index("map(36,22,[[")
end=s.index('-- Ears are attached',start)
s=s[:start]+'''map(36,22,[[
........KKKKKKKKKKKKKKKKKKKKKK
.....KKKttuuuvvvvvvvvvvvvuutttkK
...KKtuuvvffffffffffffffffvvvuuttkK
..KtuuvvffffffffffffffffffffvvvuutkK
.KtuuvvfffffffffffffffffffffvvvutkK
KtuuvvffffffffffffffffffffffvvvutkK
KtuuvvffffffffffffffffffffffvvvutkK
KtuuvvffffffffffffffffffffffvvvutkK
KtuvvvffffffffffffffffffffffvvvutkK
KtuvvvffffffffffffffffffffffvvvutkK
KtuvvvffffffffffffffffffffffvvvutkK
KtuvvvffffffffffffffffffffffvvvutkK
KtuuvvffffffffffffffffffffffvvvutkK
KtuuvvffffffffffffffffffffffvvvutkK
.KtuuvvfffffffffffffffffffffvvvutkK
.KtuuvvfffffffffffffffffffffvvvutkK
..KtuuvvfffffffffffffffffffvvvutK
..KtuuvvffffffffffffffffffvvvutK
...KtuuvvffffffffffffffffvvvutK
....KtuuvvfffffffffffffvvvvuutK
.....KtuuvvffffffffffvvvvuutK
......KttuvvvvvvvvvvvvvvuttK
........KttuuuuvvvvvvuuttK
..........KKttttttttttKK
.............KKKKKKKK
]])
''' + s[end:]
s=s.replace('map(59,32,[[','map(62,32,[[')
s=s.replace('rRRr...........rRRr\n+.rr.............rr','rRRr................rRRr\n+.rr..................rr')
s=s.replace('map(57,39,[[','map(61,39,[[').replace('map(54,43,[[','map(58,43,[[')
start=s.index("layer('06 Crown")
end=s.index("layer('07 Oversized",start)
s=s[:start]+'''layer('06 Crown - broad silver bangs and locks')
map(22,3,[[
..................hhhhhhhhhhhhhhhh
..............hhhhssmmmmmmmmmmmmsshhh
...........hhhssmmmmllllllllllllmmmmshh
.........hhssmmmlllllwwwwwwllllllmmmmsshH
.......hhssmmllllwwwwwwwwwwwwwlllllmmmsshH
......hssmmllllwwwwwwwwwwwwwwwwwllllmmmsshH
.....hssmmlllwwwwwwwwwwwwwwwwwwwwllllmmmsshH
....hssmmlllwwwwwwwwwwwwwwwwwwwwwwllllmmsshH
...hssmllllwwwwwwwwwwwwwwwwwwwwwwwwllllmmsshH
..hssmllllwwwwwwwwwwwwwwwwwwwwllllwwwlllmmsshH
..hsmllllwwwwwwwwwwwwwwwwwwwllllmmlllllllmmsshH
.hsmllllwwwwwwwwwwwwwwwwwwllllmmssmmlllllmmsshH
.hsmlllwwwwwwwwwwwwwwwwwllllmmsshhssmlllllmmsshH
hsmlllwwwwwwwwwwwwwwwwllllmmsshhsmhssmllllmmsshH
hsmlllwwwwwwwwwwwwwwwllllmmshhssmlmhssmllllmmsshH
hsmlllwwwwwwwwwwwwwwllllmmshhssmllmhssmllllmmsshH
hsmlllwwwwwwwwwwwwwllllmmshhssmlllmmhssmllllmmsshH
hsmlllwwwwwwwwwwwwllllmmshhssmllllmmhssmllllmmsshH
hsmlllwwwwwwwwwwwllllmmshhssmlllllmmhssmllllmmsshH
hsmlllwwwwwwwwwlllllmmshhssmllllllmmhssmllllmmsshH
hsmlllwwwwwwwwlllllmmshhssmlllllllmmhssmllllmmsshH
hsmlllwwwwwwllllllmmshhssmllllllllmmhssmllllmmsshH
hsmlllwwwwlllllllmmshhssmllllllllmmshssmllllmmsshH
hsmlllwwwlllllllmmshhssmllllllllmmshssmllllmmsshH
hsmlllwwlllllllmmshhssmlllllllmmsshHssmllllmmsshH
hsmlllwwllllllmmshhssmllllllmmsshH.HssmllllmmsshH
hsmlllwwllllmmsshhssmllllmmsshH....HssmllllmmsshH
hsmlllwwlllmmshhssmlllmmsshH.......HssmllllmmsshH
hsmlllwwllmmshhssmllmsshH..........HssmllllmmsshH
hsmlllwwlmmshhssmmsshH............HssmllllmmsshH
hsmlllwwmmsHhssmshH...............HssmllllmmsshH
hsmlllwwmsHhssmshH................HssmllllmmsshH
hsmlllwwmsHhssmshH................HssmllllmmsshH
hsmlllwwmsHhssmshH................HssmllllmmsshH
hsmlllwwmsHhssmshH................HssmllllmmsshH
hsmlllwwmsHhssmshH................HssmllllmmsshH
hsmlllwwmsHhssmshH................HssmllllmmsshH
hsmlllwwmsHhssmshH................HssmllllmmsshH
hsmlllwwmsHhssmshH................HssmllllmmsshH
hsmlllwwmsHhssmshH................HssmllllmmsshH
hsmlllwwmsHhssmshH................HssmllllmmsshH
.HslllwwmsHhssmshH.................HsllllmmsshH
.HslllwwmsHhssmshH.................HsllllmmsshH
.HslllwwmsHhssmshH.................HsllllmmsshH
.HslllwwmsHhssmshH..................HslllmmsshH
..HslllwmsHhssmshH..................HslllmmsshH
..HslllwmsHhssmshH..................HslllmmsshH
..HslllwmsHhssmshH...................HsllmmsshH
...HsllwmsHhssmshH...................HsllmmsshH
...HsllwmsHhssmshH....................HslmmsshH
....HslwmsHhssmshH....................HslmmsshH
....HslwmsHhssmshH.....................HsmsshH
.....HslmsHhssmshH......................HsshH
......HsmsHhssmshH.......................HHH
.......HssHHhsshH
........HH..HHH
]])

''' +s[end:]
# Add the far sleeve below the neck and behind the hair.
where=s.index('-- Shoulder harness')
s=s[:where]+'''map(63,49,[[
.HhshH
HlllmshH
HlwwlmshH
HlwwllmshH
.HlwwlmshH
.HllwlmshH
..HlllmshH
..HlllmshH
...HlmmshH
...HllshH
....HshH
.....HH
]])
''' +s[where:]
p.write_text(s,encoding='utf-8')
