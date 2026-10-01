-- Read actual illustration samples and document the hand-adjusted pixel palette.
local source=Image{fromFile='source.png'}
local anchors={
  {'Silver hair','hair',337,15,615,230,224,218,215},
  {'Aqua hair tips','aqua',185,550,330,970,164,193,197},
  {'Navy cloth','navy',485,625,615,755,60,74,93},
  {'Cerulean embroidery','blue',589,315,667,409,95,130,148},
  {'Warm white cloth','cloth',370,340,420,425,233,226,215},
  {'Skin light','skin',488,155,551,184,241,210,190},
  {'Skin shade','shade',472,143,539,186,213,173,154},
  {'Blue grey iris','eye',550,138,568,150,102,119,136},
  {'Antique brass','gold',518,500,599,573,175,151,120},
  {'Coral tassel','coral',451,392,469,450,186,123,107},
}
local groups={D='navy',N='navy',n='navy',b='blue',c='blue',a='aqua',i='aqua',
  H='hair',h='hair',s='hair',m='hair',w='cloth',W='hair',S='shade',t='shade',
  p='shade',f='skin',F='skin',r='coral',E='eye',g='gold',G='gold',L='gold',
  o='coral',O='coral',v='cloth',u='cloth',k='aqua',l='eye'}
local samples={}
local out=io.open('scripts/palette.txt','w')
out:write('NERIA / source-sampled, hand-adjusted palette\n\n')
out:write('The following material anchors are actual source.png pixels. Within each\n')
out:write('material region the closest pixel to the visually selected source tone is\n')
out:write('recorded. Coordinates are zero-based. The sprite ramps deliberately increase\n')
out:write('contrast and brighten lights for legibility at 64 x 64. These are not literal\n')
out:write('copies of every intermediate illustration shade. No colours are dithered.\n\n')
for _,a in ipairs(anchors) do
  local best,bx,by,br,bg,bb=1e9
  for y=a[4],a[6] do for x=a[3],a[5] do
    local px=source:getPixel(x,y)
    local r,g,b=app.pixelColor.rgbaR(px),app.pixelColor.rgbaG(px),app.pixelColor.rgbaB(px)
    local d=(r-a[7])^2+(g-a[8])^2+(b-a[9])^2
    if d<best then best,bx,by,br,bg,bb=d,x,y,r,g,b end
  end end
  samples[a[2]]={bx,by,br,bg,bb}
  out:write(string.format('%-22s (%4d,%4d) RGB(%3d,%3d,%3d) #%02X%02X%02X\n',a[1],bx,by,br,bg,bb,br,bg,bb))
end
local input=io.open('scripts/draw.lua','r')
local code=input:read('*a');input:close()
out:write('\nMap key | Final hex | Material anchor | Use\n')
for char,hex,label in code:gmatch("{'(.)', 0x(%x+), '([^']+)'}") do
  out:write(string.format('   %s    | #%s | %-15s | %s\n',char,hex,groups[char] or 'transparent',label))
end
out:write('\nAlpha is exactly 0 for the dot key, exactly 255 for all other keys.\n')
out:write('Unused cloth shade v remains in the editable palette; it is not a visible colour.\n')
out:close()
print('Source anchors and palette recorded in scripts/palette.txt.')
