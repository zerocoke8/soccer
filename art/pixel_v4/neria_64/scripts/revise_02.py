"""Explicit hand edits to the maps; Aseprite remains the only sprite renderer."""
from pathlib import Path
import re

file = Path('scripts/draw.lua')
text = file.read_text(encoding='utf-8')
def replace(name, x, y, rows):
    global text
    block = "layer('%s', %d, %d, {\n" % (name,x,y)
    block += ''.join("  '%s',\n" % row for row in rows)
    block += '})'
    pattern = r"layer\('" + re.escape(name) + r"'.*?\n\}\)"
    text, count = re.subn(pattern, lambda _: block, text, flags=re.S)
    assert count == 1, name

replace('01 Hair back / long calm aqua ends', 10, 2, [
    '..................HHHHHHHH................',
    '..............HHHHmmwwwwmmHHH.............',
    '...........HHHmmmwwWWWWwwwwmmHH...........',
    '.........HHmmwwWWWWWWWWWWwwwmmHH..........',
    '........HmmwwWWWWWWWWWWWWWWwwmmH.........',
    '.......HmmwwWWWWWWWWWWWWWWWWWwmHH........',
    '......HmmwwWWWWWWWWWWWWWWWWWWwmmH........',
    '.....HmmwwWWWWWWWWWWWWWWWWWWWwwmmH.......',
    '....HmmwwWWWWWWWWWWWWWWWWWWWWWwwmmH......',
    '...HHmwwWWWWWWWWWWWWWWWWWWWWWWwwmmH......',
    '...HmmwwWWWWWWWWWWWWWWWWWWWWWWwwmmH......',
    '..HHmwwWWWWWWWWWWWWWWWWWWWWWWWwwmsHH.....',
    '..HsmwwWWWWWWWWWWWWWWWWWWWWWWWwwmsmH.....',
    '..HsmwwWWWWWWWWWWWWWWWWWWWWWWwwwmsmH.....',
    '.HHsmwwWWWWWWWWWWWWWWWWWWWWWWwwmmsmH.....',
    '.HhsmwwWWWWWWWWWWWWWWWWWWWWWwwwmmsmH.....',
    '.HhsmwwWWWWWWWWWWWWWWWWWWWWWwwwmssmHH....',
    '.HhsmwwWWWWWWWWWWWWWWWWWWWWWwwmmssmmH....',
    '.HhsmwwWWWWWWWWWWWWWWWWWWWWWwwmmssmmH....',
    '.HhsmwwWWWWWWWWWWWWWWWWWWWWWwwmmssmmH....',
    '.HhsmwwWWWWWWWWWWWWWWWWWWWWWwwmmssmmH....',
    '.HhsmwwWWWWWWWWWWWWWWWWWWWWWwwmmssmmH....',
    '.HhsmwwwWWWWWWWWWWWWWWWWWWWWwwmmssmmH....',
    '.HhsmwwwwwWWWWWWWWWWWWWWWWWwwwmmssmmH....',
    '.HhsmmwwwwWWWWWWWWWWWWWWWWWwwwmmssmmH....',
    '.HhsmmwwwwWWWWWWWWWWWWWWWWWwwmmmssmmH....',
    '.HhsmmwwwwWWWWWWWWWWWWWWWWWwwmmmssmmH....',
    '.HhsmmwwwwWWWWWWWWWWWWWWWWWwwmmmssmmH....',
    '.HhsmmwwwwWWWWWWWWWWWWWWWWWwwmmmssmmH....',
    '.HhsmmwwwwWWWWWWWWWWWWWWWWWwwmmmssmmH....',
    '.HhsmmwwwwWWWWWWWWWWWWWWWWWwwmmmssmmH....',
    '.HhsmmwwwwmshHHHHHHHHHHHHHmwwmmmssmmH....',
    '.HhsmmwwwwmshH............HmwwmmssmmH....',
    '.HhsmmwwwwmshH............HmwwmmssmmH....',
    '.HhsmmwwwwmshH............HmwwmmssmmH....',
    '.HhsmmwwwwmshH............HmiwmmssmmH....',
    '.HhsmmwwwwmshH............HmiimmssmmH....',
    '.HhsmmwiwwmshH............HmiimmsammH....',
    '.HhsmmwiwwmshH............HmiiimsammH....',
    '.HhsmmwiiwmshH............HmiiimsammH....',
    '.HhsmmwiiimshH............HmiiimsammH....',
    '.HhsmmwiiaashH............HmiiimsammH....',
    '.HhsmmwiiaashH............HmiiaasamH.....',
    '.HhsmmwiiaaskH............HmiiaasamH.....',
    '.HhsmmiiaaaskH............HmiaaasamH.....',
    '.HhsmmiiaaaskH............HmiaaasaH......',
    '.HhsmaiiaaaskH............HmiaaaskH......',
    '..HskaiaaaskH.............HmiaaaskH......',
    '..HskaiaaaskH.............HmiaaakH.......',
    '...HkaiaaakH...............HiaakH........',
    '....HkaaaHH.................HHHH.........',
    '.....HkkH................................',
    '......HH.................................',
])

replace('07 Crown swept fringe and long sidelocks', 14, 4, [
    '.............hssmmmmmmmsshh............',
    '..........hssmwwwwwwwwwwwmmhh..........',
    '........hsmwwWWWWwwwwwwwwwmmsh.........',
    '......hsmwWWWWWWWWwwwmmmmwwwmsh........',
    '.....hsmwWWWWWWWWWWWwmsmmwwwwmsh.......',
    '....hsmwWWWWWWWWWWWWmshmwwwwwmsh......',
    '...hsmwWWWWWWWWWWWWwmshmwwwwwmmsh.....',
    '..hsmwWWWWWWWWWWWWWwmhsmwwwwwwmsh.....',
    '..smwWWWWWWWWWWWWWWmshsmwwwwwwmmsh....',
    '.hsmwWWWWWWWWWWWWWwmshsmwwwwwwmmsh....',
    '.hsmwWWWWWWWWWWWWWmshsmwwwwwwmmssh....',
    '.hsmwWWWWWWWWWWWWwmshsmwwwwwwmmssh....',
    '.hsmwWWWWWWWWWWWwmshsmwwwwwwmmmsh.....',
    '.hsmwWWWWWWWWWWwmshsmwwwwwmmmssh......',
    '.hsmwWWWWWWWWWwmshsmwwwwmmmsshh.......',
    '.hsmwWWWWWWWWmsshsmwwwmmmsshh.........',
    '.hsmwWWWWWWmsshsmwwmmmsshh...........',
    '.hsmwWWWWmsshsmwwmmsshh.............',
    '.hsmwWWwmsh..Hhmmsshh...............',
    '.hsmwWWmsh....HHHHH.................',
    '.hsmwWWmsh..........................',
    '.hsmwWWmsh..........................',
    '.hsmwWWmsh..........................',
    '.hsmwWWmsh..........................',
    '.hsmwWWmsh..........................',
    '.hsmwWWmsh..........................',
    '.hsmwWWmsh..........................',
    '..HmwWWmsh..........................',
    '..HmwWWmsh..........................',
    '..HmwWWmsh..........................',
    '..HmwWWmsh..........................',
    '..HmwWWmsh..........................',
    '..HmwWWmsh..........................',
    '..HmwWWmsh..........................',
    '..Hmwwimsh..........................',
    '..Hmwwimsh..........................',
    '..HmwiiHh...........................',
    '..HmwiiHh...........................',
    '..HmiiaH............................',
    '...HiiaH............................',
    '...HiaH.............................',
    '....HH..............................',
])

replace('06 Face / eyes brows and mouth', 29, 19, [
    '..ttt........ttt....',
    '.mm............mm...',
    'DDDDDD......DDDDD...',
    'wllWlw......wlWlw...',
    'wllElw......wlElw...',
    '.bbcbl......lbcb....',
    '..bbb........bb.....',
])

file.write_text(text, encoding='utf-8')
