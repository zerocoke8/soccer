-- Aseprite -b --script scripts/export_verify.lua
-- Reopen the saved editable source, render it, verify and create presentation PNGs.
local pc=app.pixelColor
local spr=app.open('base.aseprite')
assert(spr,'base.aseprite not found')
local im=Image(spr.width,spr.height,ColorMode.RGB)
im:drawSprite(spr,1)
im:saveAs('base.png')
local colours,alphas,opaque,isolated={},{},0,0
local minx,miny,maxx,maxy=64,64,-1,-1
local function solid(x,y)
  return x>=0 and y>=0 and x<im.width and y<im.height and pc.rgbaA(im:getPixel(x,y))>0
end
for y=0,im.height-1 do for x=0,im.width-1 do
  local c=im:getPixel(x,y); local a=pc.rgbaA(c); alphas[a]=true
  if a>0 then
    colours[c]=true; opaque=opaque+1
    minx=math.min(minx,x); maxx=math.max(maxx,x); miny=math.min(miny,y); maxy=math.max(maxy,y)
    local n=0
    for dy=-1,1 do for dx=-1,1 do if (dx~=0 or dy~=0) and solid(x+dx,y+dy) then n=n+1 end end end
    if n==0 then isolated=isolated+1 end
  end
end end
local ncol=0; for _ in pairs(colours) do ncol=ncol+1 end
local binary=true; for a in pairs(alphas) do if a~=0 and a~=255 then binary=false end end
local function components(diagonals)
  local seen={}; local sizes={}
  for y=0,63 do for x=0,63 do
    local k=y*64+x
    if solid(x,y) and not seen[k] then
      local queue={{x,y}}; seen[k]=true; local i=1
      while i<=#queue do
        local v=queue[i]; i=i+1
        for dy=-1,1 do for dx=-1,1 do
          if (dx~=0 or dy~=0) and (diagonals or dx==0 or dy==0) then
            local nx,ny=v[1]+dx,v[2]+dy; local nk=ny*64+nx
            if solid(nx,ny) and not seen[nk] then seen[nk]=true; queue[#queue+1]={nx,ny} end
          end
        end end
      end
      sizes[#sizes+1]=#queue
    end
  end end
  return sizes
end
local c8=components(true); local c4=components(false)
local pass=spr.width==64 and spr.height==64 and binary and ncol<=32 and isolated==0 and #c8==1 and maxy>=60 and maxy<=61 and maxy-miny+1>=44 and maxy-miny+1<=50
local f=assert(io.open('verification.txt','w'))
f:write('NERIA / native pixel sprite verification\n')
f:write('Renderer: Aseprite '..tostring(app.version)..' / Lua API\n')
f:write('Verified by reopening base.aseprite and rendering frame 1.\n')
f:write('Canvas: '..spr.width..' x '..spr.height..' pixels\nFrames: '..#spr.frames..'\nVisible layers: ')
for _,l in ipairs(spr.layers) do if l.isVisible then f:write(l.name..'; ') end end
f:write('\nOpaque RGB colours: '..ncol..' (limit 32)\n')
f:write('Palette entries including transparency: '..#spr.palettes[1]..'\n')
f:write('Alpha values: '..(binary and '0 and 255 only / PASS' or 'FAIL')..'\n')
f:write('Bounding box, inclusive, zero-based: ('..minx..','..miny..') - ('..maxx..','..maxy..')\n')
f:write('Bounding size: '..(maxx-minx+1)..' x '..(maxy-miny+1)..'; height '..(maxy-miny+1)..' px\n')
f:write('Bottom occupied row / feet baseline: y='..maxy..'\nOpaque pixels: '..opaque..'\n')
f:write('Isolated opaque pixels (8-neighbour): '..isolated..'\n')
f:write('Opaque connected components: '..#c8..' (8-neighbour), '..#c4..' (4-neighbour)\n')
f:write('Functional single-pixel colour details (eye glints, etc.) are intentional.\n')
f:write('Overall structural verification: '..(pass and 'PASS' or 'FAIL')..'\n')
f:write('Art direction: 3/4 front facing right, both eyes; white/aqua long hair; blue ornament; oversized keeper gloves; navy shorts; blue-white socks; coral tassel; no ball.\n')
f:write('Known limitations: tiny costume embroidery and source jewellery are deliberately simplified at 64x64.\n')
f:write('Preview: exact nearest-neighbour 8x, opaque neutral #808080 backdrop.\n')
f:write('Comparison: source illustration, final 8x sprite, two reference crops used only for style.\n')
f:close()
local preview=Image(512,512,ColorMode.RGB); preview:clear(pc.rgba(128,128,128,255))
local scaled=Image(im); scaled:resize{width=512,height=512,method='nearest'}
preview:drawImage(scaled); preview:saveAs('preview_8x.png')
local cmp=Image(1200,544,ColorMode.RGB); cmp:clear(pc.rgba(128,128,128,255))
local source=Image{fromFile='source.png'}
source:resize{width=math.floor(source.width*512/source.height),height=512,method='bilinear'}
cmp:drawImage(source,Point(16,16)); cmp:drawImage(preview,Point(374,16))
local ref=Image{fromFile='reference_pixel.png'}
local crops={{775,1170,120,125},{970,1170,115,125}}
for i,r in ipairs(crops) do
  for j=1,4 do r[j]=math.floor(r[j]*ref.width/1503) end
  local c=Image(r[3],r[4],ColorMode.RGB); c:drawImage(ref,Point(-r[1],-r[2]))
  c:resize{width=math.floor(r[3]*240/r[4]),height=240,method='nearest'}
  cmp:drawImage(c,Point(916,16+(i-1)*264))
end
cmp:saveAs('compare.png')
print('Verification '..(pass and 'PASS' or 'FAIL')..': '..ncol..' opaque colours, bounds '..minx..','..miny..' to '..maxx..','..maxy..', '..isolated..' isolated pixels.')
assert(pass,'Sprite failed required structural checks; see verification.txt')
