-- Validate the saved native and flattened assets, then make reproducible previews.
local root=app.params.root or '.'
local function path(s) return root..'/'..s end
local pc=app.pixelColor
local s=app.open(path('base.aseprite'))
assert(s.width==64 and s.height==64,'Native canvas must be 64x64')
assert(#s.frames==1,'Exactly one frame required')
local im=Image{fromFile=path('base.png')}
assert(im.width==64 and im.height==64,'PNG canvas must be 64x64')
local flat=Image(64,64,ColorMode.RGB); flat:drawSprite(s,1)
local colors,alphas={},{}
local xmin,ymin,xmax,ymax=64,64,-1,-1
local opaque=0
for y=0,63 do for x=0,63 do
  local p=im:getPixel(x,y); local a=pc.rgbaA(p)
  assert(p==flat:getPixel(x,y),'Native/PNG mismatch')
  assert(a==0 or a==255,'Non-binary alpha')
  alphas[a]=true
  if a==255 then
    colors[p]=true; opaque=opaque+1
    xmin=math.min(xmin,x); xmax=math.max(xmax,x)
    ymin=math.min(ymin,y); ymax=math.max(ymax,y)
  end
end end
local count=0; for _ in pairs(colors) do count=count+1 end
assert(count+1<=32,'Palette including transparency exceeds 32')
assert(xmin>0 and xmax<63 and ymin>0 and ymax<63,'Silhouette touches canvas boundary')
assert(ymax==62,'Feet baseline must be y=62')
local function bottom(x1,x2)
  local b=-1
  for x=x1,x2 do for y=0,63 do if pc.rgbaA(im:getPixel(x,y))>0 then b=math.max(b,y) end end end
  return b
end
assert(bottom(23,39)==62 and bottom(40,52)==62,'Both feet must reach common baseline')
local seen,components={},{}
local stray=0
for y=0,63 do for x=0,63 do
  local k=y*64+x
  if pc.rgbaA(im:getPixel(x,y))>0 and not seen[k] then
    local q={{x,y}}; seen[k]=true; local n=1
    while n<=#q do
      local p=q[n]; n=n+1
      for dy=-1,1 do for dx=-1,1 do
        local xx,yy=p[1]+dx,p[2]+dy; local kk=yy*64+xx
        if xx>=0 and xx<64 and yy>=0 and yy<64 and not seen[kk] and pc.rgbaA(im:getPixel(xx,yy))>0 then
          seen[kk]=true; q[#q+1]={xx,yy}
        end
      end end
    end
    components[#components+1]=#q
    if #q==1 then stray=stray+1 end
  end
end end
assert(stray==0,'Isolated stray opaque pixels')
assert(#components==1,'Detached silhouette components')
-- Confirm all opaque colors occur in the illustration, not just the draft.
local source=Image{fromFile=path('source.png')}
local remaining={}; for p in pairs(colors) do remaining[p]=true end
for y=0,source.height-1,3 do for x=0,source.width-1,3 do remaining[source:getPixel(x,y)]=nil end end
assert(next(remaining)==nil,'A color is not sampled from source')

local bg=pc.rgba(157,157,157,255)
local preview=Image(512,512,ColorMode.RGB); preview:clear(bg)
for y=0,511 do for x=0,511 do
  local p=im:getPixel(math.floor(x/8),math.floor(y/8))
  if pc.rgbaA(p)>0 then preview:drawPixel(x,y,p) end
end end
preview:saveAs(path('preview_8x.png'))
local compare=Image(896,544,ColorMode.RGB); compare:clear(bg)
-- Area-sample the source illustration only; sprite always uses nearest neighbour.
local sw=math.floor(source.width*512/source.height)
for y=0,511 do for x=0,sw-1 do
  local x1=math.floor(x*source.width/sw); local x2=math.floor((x+1)*source.width/sw)-1
  local y1=math.floor(y*source.height/512); local y2=math.floor((y+1)*source.height/512)-1
  local r,g,b,n=0,0,0,0
  for sy=y1,y2 do for sx=x1,x2 do
    local p=source:getPixel(sx,sy); r=r+pc.rgbaR(p); g=g+pc.rgbaG(p); b=b+pc.rgbaB(p); n=n+1
  end end
  compare:drawPixel(x+12,y+16,pc.rgba(math.floor(r/n+0.5),math.floor(g/n+0.5),math.floor(b/n+0.5),255))
end end
compare:drawImage(preview,Point(368,16))
compare:saveAs(path('compare.png'))
local f=io.open(path('verification.txt'),'w')
f:write('GRETA BASE SPRITE - PASS\n')
f:write('Native canvas: 64x64; flattened PNG: 64x64\n')
f:write('Frames: '..#s.frames..'; visible semantic layers: '..#s.layers..'\n')
f:write('Native composite and base.png: pixel-exact match\n')
f:write('Alpha values: 0, 255 only\n')
f:write('Opaque colors: '..count..'; total including transparency: '..(count+1)..' / 32\n')
f:write('All opaque colors are sampled from source.png: PASS\n')
f:write(string.format('Opaque bounding box (inclusive, zero-based): (%d, %d)-(%d, %d); %dx%d\n',xmin,ymin,xmax,ymax,xmax-xmin+1,ymax-ymin+1))
f:write('Both boot baselines: y=62\n')
f:write('Opaque pixels: '..opaque..'; 8-connected components: '..#components..'; isolated stray pixels: '..stray..'\n')
f:write('Preview: 512x512, exact nearest-neighbour 8x over neutral gray\n')
f:write('Comparison: 896x544, source beside native sprite enlarged 8x\n')
f:write('Visual intent: 3/4 right-facing idle, oversized head, muscular broad build, two horns, cheek scar, grin, flame cloth and boots; no ball.\n')
f:write('Known limitations: dense costume embroidery is simplified at 64x64; no animation frames. No tail is visible in the source, so none was added.\n')
f:write('Draft: one built-in imagegen call; prompt recorded in scripts/draft_prompt.txt. Final construction/cleanup/export performed in Aseprite Lua.\n')
f:close()
print(string.format('PASS: %d opaque colors, bbox (%d,%d)-(%d,%d), baseline 62, no stray pixels.',count,xmin,ymin,xmax,ymax))
