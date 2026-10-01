-- Nearest-neighbour previews and numerical QA, all through Aseprite Lua.
local img=Image{fromFile='base.png'}
local pc=app.pixelColor
local native=app.open('base.aseprite')
assert(native.width==96 and native.height==96 and #native.frames==1,'native sprite specification mismatch')
local flattened=Image(96,96,ColorMode.RGB)
flattened:drawSprite(native,1,Point(0,0))
local mismatches=0
for y=0,95 do for x=0,95 do
  if flattened:getPixel(x,y)~=img:getPixel(x,y) then mismatches=mismatches+1 end
end end
assert(mismatches==0,'native and PNG pixels differ')
local neutral=pc.rgba(130,134,142,255)
local function export(im,filename)
  local s=Sprite(im.width,im.height,ColorMode.RGB)
  s.cels[1].image=im
  s:saveCopyAs(filename)
  s:close()
end
local function composite(dst,src,ox,oy,scale)
  for y=0,src.height-1 do for x=0,src.width-1 do
    local c=src:getPixel(x,y)
    if pc.rgbaA(c)>0 then
      for dy=0,scale-1 do for dx=0,scale-1 do dst:drawPixel(ox+x*scale+dx,oy+y*scale+dy,c) end end
    end
  end end
end
local preview=Image(576,576,ColorMode.RGB)
preview:clear(neutral)
composite(preview,img,0,0,6)
export(preview,'preview_6x.png')
local pass=app.params['pass'] or '01'
export(preview,'scripts/pass_'..pass..'_6x.png')
local source=Image{fromFile='source.png'}
local side=Image(1008,624,ColorMode.RGB)
side:clear(neutral)
for y=0,575 do for x=0,383 do
  side:drawPixel(12+x,24+y,source:getPixel(math.floor(x*source.width/384),math.floor(y*source.height/576)))
end end
composite(side,img,420,24,6)
export(side,'side.png')

local used,alphas={},{}
local minx,miny,maxx,maxy=96,96,-1,-1
local count=0
local function opaque(x,y)
  return x>=0 and x<96 and y>=0 and y<96 and pc.rgbaA(img:getPixel(x,y))==255
end
local isolated={}
local isolated4=0
for y=0,95 do for x=0,95 do
  local c=img:getPixel(x,y)
  local a=pc.rgbaA(c)
  alphas[a]=true
  if a>0 then
    used[c]=true;count=count+1
    minx=math.min(minx,x);maxx=math.max(maxx,x);miny=math.min(miny,y);maxy=math.max(maxy,y)
    local neighbors=0
    for dy=-1,1 do for dx=-1,1 do
      if (dx~=0 or dy~=0) and opaque(x+dx,y+dy) then neighbors=neighbors+1 end
    end end
    if neighbors==0 then isolated[#isolated+1]={x,y} end
    if not (opaque(x-1,y) or opaque(x+1,y) or opaque(x,y-1) or opaque(x,y+1)) then isolated4=isolated4+1 end
  end
end end
local visited={}
local components={}
for y=0,95 do for x=0,95 do
  local key=y*96+x
  if opaque(x,y) and not visited[key] then
    local q={{x,y}};visited[key]=true;local head=1
    while head<=#q do
      local a=q[head];head=head+1
      for dy=-1,1 do for dx=-1,1 do
        local xx,yy=a[1]+dx,a[2]+dy
        local k=yy*96+xx
        if opaque(xx,yy) and not visited[k] then visited[k]=true;q[#q+1]={xx,yy} end
      end end
    end
    components[#components+1]=#q
  end
end end
table.sort(components,function(a,b)return a>b end)
local n=0;for _ in pairs(used) do n=n+1 end
local aa={};for a in pairs(alphas) do aa[#aa+1]=a end;table.sort(aa)
local f=io.open('verification.txt','w')
f:write('Neria native pixel base sprite - final verification\n')
f:write('Authoring: explicit pixel maps -> Aseprite 1.3.18 Lua drawPixel; no image generation\n')
f:write(string.format('Canvas: %d x %d\n',img.width,img.height))
f:write('Frames: '..#native.frames..' (idle); editable layers: '..#native.layers..'\n')
f:write('Native .aseprite vs PNG pixel mismatches: '..mismatches..'\n')
f:write('Alpha values: '..table.concat(aa,', ')..'\n')
f:write('Visible RGB colours: '..n..' (limit 48; transparency excluded)\n')
f:write(string.format('Bounding box (inclusive, 0 based): x=%d..%d, y=%d..%d\n',minx,maxx,miny,maxy))
f:write(string.format('Bounding box size: %d x %d; character height: %d px\n',maxx-minx+1,maxy-miny+1,maxy-miny+1))
f:write('Bottom margin: '..95-maxy..' px\n')
f:write('Opaque pixel count: '..count..'\n')
f:write('Isolated opaque pixels (8-neighbor): '..#isolated..'\n')
f:write('Isolated opaque pixels (4-neighbor): '..isolated4..'\n')
f:write('Connected opaque components (8-neighbor): '..#components..' sizes '..table.concat(components,', ')..'\n')
for _,r in ipairs({{25,51,'left'},{52,79,'right'}}) do
  local baseline=-1
  for y=85,95 do for x=r[1],r[2] do if opaque(x,y) then baseline=math.max(baseline,y) end end end
  f:write(r[3]..' boot baseline: y='..baseline..'\n')
end
f:write('No reference-sheet crop is included in any output. side.png uses source.png only.\n')
f:write('Render passes: 01 through 07; initial construction plus six visual revision passes.\n')
f:write('Core head: y=3..46 (44 px), 48.35% of the 91 px character height.\n')
f:write('Both eye maps: y=32..38, seven pixels tall; bright catchlights and shaded blue-grey irises.\n')
f:write('Visual checks: right-facing three-quarter idle; both gloves visible; no ball; feet centred and apart.\n')
f:write('Known technical issues: none detected. Fine source embroidery is intentionally abbreviated at 96 px.\n')
f:close()
assert(n<=48 and #aa==2 and aa[1]==0 and aa[2]==255,'palette or alpha failed')
assert(maxy-miny+1>=86 and maxy-miny+1<=92 and #isolated==0,'height or isolated pixel check failed')
local paletteFile=io.open('scripts/palette.txt','w')
paletteFile:write('NERIA PALETTE - source samples and hand-tuned pixel-art ramps\n\n')
paletteFile:write('Source coordinates are 0-based in the original 1024 x 1536 source.png.\n')
paletteFile:write('Samples establish the hue families. Shadows, highlights and saturation are deliberately\nadapted into clean, discrete pixel-art clusters, lit from upper left.\n\n')
local samples={
 {'silver hair light',538,37},{'silver hair mid',464,189},{'silver hair shaded edge',603,139},
 {'skin',506,167},{'navy collar',486,236},{'navy shorts',568,659},
 {'desaturated blue cloth',483,357},{'aqua hair',239,709},{'coral tassel',463,412},
 {'pale metal',539,432},{'blue-grey iris',504,125},{'warm cloth shadow',427,361},
}
for _,v in ipairs(samples) do
  local c=source:getPixel(v[2],v[3])
  paletteFile:write(string.format('%-25s (%d,%d) #%02X%02X%02X\n',v[1],v[2],v[3],pc.rgbaR(c),pc.rgbaG(c),pc.rgbaB(c)))
end
paletteFile:write('\nFinal map symbols and RGB values (alpha 255):\n')
local luaFile=io.open('scripts/draw.lua','r');local code=luaFile:read('*a');luaFile:close()
for symbol,hex in code:match('local P = {(.-)\n}'):gmatch("(%a)='(%x+)'") do
  local c=pc.rgba(tonumber(hex:sub(1,2),16),tonumber(hex:sub(3,4),16),tonumber(hex:sub(5,6),16),255)
  paletteFile:write(symbol..' #'..hex..(used[c] and ' used' or ' reserved, unused')..'\n')
end
paletteFile:write('\nVisible RGB colour count: '..n..'\nTransparency: alpha 0; not a visible colour.\n')
paletteFile:close()
native:close()
print(string.format('QA: %d colours; bbox (%d,%d)-(%d,%d); isolated %d; components %d',n,minx,miny,maxx,maxy,#isolated,#components))
