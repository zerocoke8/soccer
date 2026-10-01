-- Neria: hand-authored native pixel maps. Run from the project directory.
-- Aseprite 1.3.18. Each character below is exactly one native pixel.
local pass = app.params['pass'] or '01'
local sprite = Sprite(64, 64, ColorMode.RGB)
sprite.filename = 'base.aseprite'
local colors = {
  {'.', 0x000000, 'transparent'},
  {'D', 0x29384D, 'navy outline'},
  {'N', 0x35495F, 'navy shade'},
  {'n', 0x4D657C, 'navy light'},
  {'b', 0x547F99, 'cerulean'},
  {'c', 0x79A8BA, 'blue light'},
  {'a', 0xA4CBD1, 'aqua'},
  {'i', 0xCDE5E2, 'aqua light'},
  {'H', 0x687487, 'hair outline'},
  {'h', 0x969AAA, 'hair deep shade'},
  {'s', 0xB8BBC9, 'hair shade'},
  {'m', 0xD6D5DC, 'hair midtone'},
  {'w', 0xF0ECE6, 'warm white'},
  {'W', 0xFFFCF4, 'ivory highlight'},
  {'S', 0xA57372, 'skin outline'},
  {'t', 0xC99086, 'skin deep shade'},
  {'p', 0xE6B39F, 'skin shade'},
  {'f', 0xF4CEB4, 'skin base'},
  {'F', 0xFFE4C9, 'skin highlight'},
  {'r', 0xDC9994, 'blush'},
  {'E', 0x91C1D5, 'iris highlight'},
  {'g', 0x887A6D, 'antique brass shade'},
  {'G', 0xBEA583, 'antique brass'},
  {'L', 0xE8CDA5, 'brass highlight'},
  {'o', 0xB87569, 'coral shade'},
  {'O', 0xE4A38F, 'coral light'},
  {'v', 0xABA5A6, 'cloth shade'},
  {'u', 0xCBC3BC, 'cloth midtone'},
  {'k', 0x7395A6, 'aqua dark'},
  {'l', 0x44607C, 'iris'},
}
local P = {}
local palette = Palette(#colors)
for index, def in ipairs(colors) do
  local hex = def[2]
  local color = Color{r=(hex >> 16)&255, g=(hex >> 8)&255, b=hex&255,
                      a=def[1]=='.' and 0 or 255}
  P[def[1]] = color.rgbaPixel
  palette:setColor(index-1, color)
end
sprite:setPalette(palette)

local first = true
local function layer(name, x, y, rows)
  local target
  if first then target=sprite.layers[1]; first=false else target=sprite:newLayer() end
  target.name=name
  local img=Image(64,64,ColorMode.RGB)
  img:clear()
  for dy, row in ipairs(rows) do
    for dx=1,#row do
      local char=row:sub(dx,dx)
      assert(P[char], 'Unknown palette character '..char..' in '..name)
      local px,py=x+dx-1,y+dy-1
      assert(px>=0 and px<64 and py>=0 and py<64, 'Map outside canvas: '..name)
      if char~='.' then img:drawPixel(px,py,P[char]) end
    end
  end
  sprite:newCel(target,1,img,Point(0,0))
end

layer('01 Hair back / long calm aqua ends', 10, 2, {
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
  'HhsmwwwWWWWWWWWWWWWWWWWWWWWwwmmssmmH....',
  'HhsmwwwwwWWWWWWWWWWWWWWWWWwwwmmssmmH....',
  'HhsmmwwwwWWWWWWWWWWWWWWWWWwwwmmssmmH....',
  'HhsmmwwwwWWWWWWWWWWWWWWWWWwwmmmssmmH....',
  'HhsmmwwwwWWWWWWWWWWWWWWWWWwwmmmssmmH....',
  'HhsmmwwwwWWWWWWWWWWWWWWWWWwwmmmssmmH....',
  'HhsmmwwwwWWWWWWWWWWWWWWWWWwwmmmssmmH....',
  'HhsmmwwwwWWWWWWWWWWWWWWWWWwwmmmssmmH....',
  'HhsmmwwwwWWWWWWWWWWWWWWWWWwwmmmssmmH....',
  'HhsmmwwwwmshHHHHHHHHHHHHHmwwmmmssmmH....',
  'HhsmmwwwwmshH............HmwwmmssmmH....',
  'HhsmmwwwwmshH............HmwwmmssmmH....',
  'HhsmmwwwwmshH............HmwwmmssmmH....',
  'HhsmmwwwwmshH............HmiwmmssmmH....',
  'HhsmmwwwwmshH............HmiimmssmmH....',
  'HhsmmwiwwmshH............HmiimmsammH....',
  '.HhsmmwiwwmshH............HmiiimsammH....',
  '..HhsmmwiiwmshH............HmiiimsammH....',
  '..HhsmmwiiimshH............HmiiimsammH....',
  '..HhsmmwiiaashH............HmiiimsammH....',
  '..HhsmmwiiaashH............HmiiaasamH.....',
  '..HhsmmwiiaaskH............HmiiaasamH.....',
  '..HhsmmiiaaaskH............HmiaaasamH.....',
  '..HhsmmiiaaaskH............HmiaaasaH......',
  '.HhsmaiiaaaskH............HmiaaaskH......',
  '..HskaiaaaskH.............HmiaaaskH......',
  '..HskaiaaaskH.............HmiaaakH.......',
  '...HkaiaaakH...............HiaakH........',
  '....HkaaaHH.................HHHH.........',
  '.....HkkH................................',
  '......HH.................................',
})


layer('01b Far hair / shaded aqua fall', 47, 10, {
  '..H.......',
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
})

layer('02 Boots socks and legs', 22, 45, {
  '....DDDDDD.........DDDDD......',
  '...DppfffpD.......DppfffpD....',
  '...DpffffpD.......DpffffpD....',
  '...DpffffpD.......DpffffpD....',
  '...DppfffpD.......DppfffpD....',
  '..DDNbbNND........DNbbNNDD....',
  '..DNwLLwND........DNwLLwND....',
  '..DNWwwNND........DNWwwNND....',
  '..DuWWwumD........DmWWwumD....',
  '..DuWWwwmD........DmWWwwmD....',
  '..DuwWWwmD........DmWWwwmD....',
  '..DNwwbNmD........DNwwbNmD....',
  '.DDNNbNNND........DNNbNNNDD...',
  '.DuwwLWwND........DNwWLwwwuD..',
  'DuwWWwbbND........DNbwWWwwwuD.',
  'DNnuwwwuND........DNuwwwuunnD.',
  '.DD...DDD..........DD...DDD...',
})

layer('03 Blouse collar belt and shorts', 22, 29, {
  '...........DNNNND...........',
  '..........DNnbNnND..........',
  '.........DNnGLGnnND.........',
  '......DDDNnNGGnnNDHH........',
  '....DDwwuDNnNnnNDwwwDD......',
  '...DwWWwuNDnnNNDWWwwmuD.....',
  '..DwWWWwuNDDnnDwWWwwmuD.....',
  '..DuWWwwuNNDnDwWWwwwmuD.....',
  '.DmuWWwumNNnDwwWWwbbmuDD....',
  '.DmuwwwumNNnwwWWWwwbcmuND...',
  '.DNmuwwumNNnwWWWwbbcmuNnD...',
  '..DNmuumNNNnwwwwbwwmuNNnD...',
  '...DNNuDNNNNnnwwwuNNNNND....',
  '....DDNDNNNNNNNNNNNGGND.....',
  '......DNNNnNNNNNNNNGLND.....',
  '......DNnnnnnnNNnnNNND......',
  '.....DNnnnnnnnDNnnnnND......',
  '.....DNnnnnnnnDNnnnnnD......',
  '.....DNnnnbbnNDNnnbnnD......',
  '.....DNNnnbcnDDNnnbbnD......',
  '......DNNNNND..DNNNND.......',
})

layer('04 White side panel / wave and coral cord', 18, 43, {
  '........DNgGND........',
  '.......DwwGLND........',
  '......DwWWwND.........',
  '.....DwWWwuND.........',
  '....DwWWbwuND.........',
  '....DuWbbwuND.........',
  '...DuwbWbwuND.........',
  '...DuwbWwuND..........',
  '..DuwwbbwuND..........',
  '..DuwbbbwuND..........',
  '..DuwbcbwuND..........',
  '..DubbcbwuND..........',
  '..DbbcbwwuND..........',
  '...DbbwwuND...........',
  '....DGGGND............',
  '.....DoD..............',
  '.....DoO..............',
  '.....Doo..............',
})

layer('05 Face and ears', 23, 12, {
  '..........SSSSSS.........',
  '.......SSSppffffSS........',
  '.....SSppffffFFFFfS.......',
  '....SpffffFFFFFFFffS......',
  '...SpffffFFFFFFFFfffS.....',
  '..SpffffFFFFFFFFFffffS....',
  '..SpffffFFFFFFFFFffffS....',
  '.StpffffFFFFFFFFFffffpS...',
  'StppffffFFFFFFFFFffffpS...',
  'SpfpffffFFFFFFFFFffffpS...',
  'SptpffffFFFFFFFFFffffpS...',
  '.StpffffFFFFFFFFFffffpS...',
  '..SpffffFFFFFFFFfffffpS...',
  '...SpfffFFFFFFFFFffffpS...',
  '...SppfffFFFFFFFffffppS...',
  '....SpprrffffffffpprrS....',
  '.....SppfffffStffffppS....',
  '......SSppffffffffpSS.....',
  '........SSppffffppS.......',
  '..........SSppppSS........',
  '............SSSS..........',
})

layer('06 Face / eyes brows and mouth', 29, 20, {
  '..ttt........ttt....',
  '...................',
  'DDDDDD......DDDDD...',
  'wllWlw......wlWlw...',
  'wllElw......wlElw...',
  '.bbcbl......lbcb....',
  '..bbb........bb.....',
})

layer('07 Crown swept fringe and long sidelocks', 14, 4, {
  '.............hssmmmmmmmsshh............',
  '..........hssmwwwwwwwwwwwmmhh..........',
  '........hsmwwWWWWwwwwwwwwwmmsh.........',
  '......hsmwWWWWWWWWwwwmmmmwwwmsh........',
  '.....hsmwWWWWWWWWWWWwmsmmwwwwmsh.......',
  '....hsmwWWWWWWWWWWWWmshmwwwwwmsh......',
  '...hsmwWWWWWWWWWWWWwmssmwwwwwmmsh.....',
  '..hsmwWWWWWWWWWWWWWwmssmwwwwwwmsh.....',
  '..smwWWWWWWWWWWWWWwwmssmwwwwwwmmsh....',
  '.hsmwWWWWWWWWWWWwwwmssmmwwwwwwmmsh....',
  '.hsmwWWWWWWWWWWwwwwmssmwwwwwwmmssh....',
  '.hsmwWWWWWWWWWwwwwwmssmwwwwwwmmssh....',
  '.hsmwWWWWWWWwwwwwwmssmwwwwwwmmmsh.....',
  '.hsmwWWWWWwwwwwwwmssmwwwwwmmmssh......',
  '.hsmwWWWWwwwwwwwmssmwwwwmmmsshh.......',
  '.hsmwWWWwwwwwwmssmmwwwmmmsshh.........',
  '.hsmwWWWwwwwmssmmwwmmmsshh............',
  '.hsmwWWwwwmssmmwwmmsshh...............',
  '.hsmwWWwmsh...........................',
  '.hsmwWWmsh............................',
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
})

layer('08 Near sleeve and keeper glove', 19, 34, {
  '..DDD........',
  '.DwWuD.......',
  'DwWWwuD......',
  'DwWWwuD......',
  'DuwWmuD......',
  '.DNnND.......',
  '.DNbnDD......',
  'DuwGgwuD.....',
  'DWwGbwumD....',
  'DWwbGwwumD...',
  'DwwGbwnwmD...',
  '.DwwwwnwmD...',
  '.DunwwnwmD...',
  '..DuwuumuD...',
  '...DDDDDD....',
})

layer('09 Forward keeper glove', 40, 37, {
  '......DDD.....',
  '.....DWwmD....',
  '..DDDDWwmD....',
  '.DNuwWWwwmD...',
  'DNbwWGLwwumD..',
  'DNbwGbGwwwmD..',
  'DNbwWGGnnumD..',
  '.DNuwWWwwumD..',
  '..DumnnwwumD..',
  '...DuwwuumD...',
  '....DDDDDD....',
})

layer('10 Blue hair ornament and tassels', 12, 9, {
  '......HDD........',
  '.....HbLGD.......',
  '...DDbGGD........',
  '..DbcDGND........',
  '.DbLcbDGD........',
  '.DbbDDGLD........',
  '..DDbcbD.........',
  '..DbLcbD.........',
  '..DbbDD..........',
  '...DgD...........',
  '...DcD...........',
  '...DbD...........',
  '...DgD...........',
  '..DbcbD..........',
  '..DbcbD..........',
  '..DbcbD..........',
  '..DbcbD..........',
  '..DbcbD..........',
  '..DbbbD..........',
  '...DDD...........',
})

layer('11 Brass fittings coral accent', 29, 35, {
  'gL..............',
  'GG..............',
  'ND..............',
  'ND..............',
  'gG..............',
  'oO..............',
  'oO..............',
  'oo..............',
})


layer('12 Waist buckle and boot accents', 31, 41, {
  'NNnnNNgggD........',
  'NNNNNNGLGD........',
  'NnnNNNGNLD........',
  'NNNNNNGGGD........',
})


layer('13 Cheek framing silver lock', 46, 20, {
  '..msH...',
  '..msH...',
  '..msH...',
  '..msH...',
  '..msH...',
  '..msH...',
  '..msH...',
  '..msH...',
  '.wmsh...',
  '.wmsh...',
  '.wmsh...',
  'wwmsh...',
  'wmmsh...',
  'mmsh....',
  'msh.....',
  'hh......',
})

sprite:saveAs('base.aseprite')
sprite:saveCopyAs('base.png')
sprite:saveCopyAs('scripts/pass_'..pass..'.png')
print('Rendered pass '..pass..': '..#sprite.layers..' named layers, '..#colors..' palette entries including transparent.')
