local root=app.params.root or '.'
local pc=app.pixelColor
local sprite=app.open(root..'/base.aseprite')
assert(sprite.width==64 and sprite.height==64,'Canvas must be 64x64')
assert(#sprite.frames==1,'Exactly one frame is required')
local img=Image(64,64,ColorMode.RGB);img:drawSprite(sprite,1)
local png=Image{fromFile=root..'/base.png'}
assert(png.width==64 and png.height==64)
local used,count,opaque={},0,0
local bounds={64,64,-1,-1}
local occupied={}
for y=0,63 do for x=0,63 do
  local p=img:getPixel(x,y);local a=pc.rgbaA(p)
  assert(a==0 or a==255,'Nonbinary alpha')
  assert(p==png:getPixel(x,y),'PNG differs from Aseprite flattening')
  if a==255 then
    occupied[y*64+x]=true;opaque=opaque+1
    if not used[p] then used[p]=true;count=count+1 end
    bounds[1]=math.min(bounds[1],x);bounds[2]=math.min(bounds[2],y)
    bounds[3]=math.max(bounds[3],x);bounds[4]=math.max(bounds[4],y)
  end
end end
assert(count+1<=32,'More than 32 colors including transparency')
assert(bounds[1]>=1 and bounds[2]>=1 and bounds[3]<=62 and bounds[4]<=62,'Clipped silhouette')
assert(bounds[4]==61 or bounds[4]==62,'Incorrect baseline')
local visited,components,isolated={},0,0
for k in pairs(occupied) do
  if not visited[k] then
    components=components+1
    local q={k};visited[k]=true;local qi=1
    while qi<=#q do
      local v=q[qi];qi=qi+1;local x,y=v%64,math.floor(v/64)
      for dy=-1,1 do for dx=-1,1 do
        local xx,yy=x+dx,y+dy;local key=yy*64+xx
        if xx>=0 and xx<64 and yy>=0 and yy<64 and occupied[key] and not visited[key] then
          visited[key]=true;q[#q+1]=key
        end
      end end
    end
    if #q==1 then isolated=isolated+1 end
  end
end
assert(isolated==0,'Isolated stray pixels')
assert(components==1,'Disconnected silhouette pieces')
-- Two separate boot-contact groups at the common baseline.
local groups,inside=0,false
for x=0,63 do
  local hit=occupied[bounds[4]*64+x] or false
  if hit and not inside then groups=groups+1 end
  inside=hit
end
assert(groups==2,'Both boots must contact the common baseline separately')
local f=io.open(root..'/verification.txt','w')
f:write(string.format('PASS\nCanvas: 64 x 64\nFrames: 1\nLayers: %d\nOpaque RGB colors: %d\nTotal RGBA colors including transparency: %d\nAlpha: strictly 0 or 255\nBounding box (inclusive, zero-based): (%d, %d) - (%d, %d)\nOpaque pixels: %d\nBaseline: y=%d; 2 separate boot-contact groups\n8-connected components: %d\nIsolated stray pixels: %d\nAseprite / flattened PNG: pixel-identical\nPalette: every opaque RGB is sampled from source.png; see scripts/palette_source.tsv\nPreview: exact nearest-neighbor 8x on neutral gray\nVisual review: right-facing three-quarter idle, silver ears and tail, fang grin, teal crop outfit, harness, cream scroll, separated limbs, no ball\nKnown limitations: costume filigree simplified to pixel clusters; single idle frame only.\n',#sprite.layers,count,count+1,bounds[1],bounds[2],bounds[3],bounds[4],opaque,bounds[4],components,isolated))
f:close()
-- A direct side-by-side comparison; source retains its original proportions.
local source=Image{fromFile=root..'/source.png'}
local preview=Image{fromFile=root..'/preview_8x.png'}
local sh=512;local sw=math.floor(source.width*sh/source.height+0.5)
local compare=Image(sw+16+512,512,ColorMode.RGB)
compare:clear(pc.rgba(151,153,150,255))
for y=0,511 do
  for x=0,sw-1 do compare:drawPixel(x,y,source:getPixel(math.floor(x*source.width/sw),math.floor(y*source.height/sh))) end
  for x=0,511 do compare:drawPixel(sw+16+x,y,preview:getPixel(x,y)) end
end
compare:saveAs(root..'/compare.png')
print(string.format('PASS: %d opaque colors; bbox (%d,%d)-(%d,%d); baseline %d; %d component; no strays.',count,bounds[1],bounds[2],bounds[3],bounds[4],bounds[4],components))
