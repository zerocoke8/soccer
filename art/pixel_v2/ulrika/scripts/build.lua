-- Aseprite 1.3.18; run from project root. All raster operations use Lua API.
local pc=app.pixelColor
local palette={
  {66,58,76},     -- 1 silver outline
  {100,96,111},   -- 2 silver deepest shade
  {146,145,158},  -- 3 silver shade
  {191,192,201},  -- 4 silver base
  {226,228,231},  -- 5 silver light
  {252,249,231},  -- 6 warm white
  {133,88,74},    -- 7 skin outline
  {198,125,94},   -- 8 skin shadow
  {241,171,128},  -- 9 skin mid
  {255,211,164},  -- 10 skin light
  {230,133,117},  -- 11 blush
  {146,68,64},    -- 12 mouth
  {30,57,59},     -- 13 pine outline
  {39,83,81},     -- 14 pine shadow
  {51,115,107},   -- 15 pine base
  {86,150,136},   -- 16 pine light
  {40,40,47},     -- 17 sock/harness outline
  {59,65,65},     -- 18 sock/harness base
  {85,99,99},     -- 19 sock/harness light
  {129,99,60},    -- 20 gold shadow
  {195,150,74},   -- 21 gold base
  {246,208,118},  -- 22 gold light
  {173,158,133},  -- 23 cream shadow
  {221,207,172},  -- 24 cream base
  {76,117,122},   -- 25 iris
  {135,183,180},  -- 26 iris light
  {158,138,138},  -- 27 ear inner shadow
  {201,174,165},  -- 28 ear inner base
}
local colors={}
for i,c in ipairs(palette) do colors[i]=pc.rgba(c[1],c[2],c[3],255) end
local function near(r,g,b)
  local best,dist=1,math.huge
  for i,c in ipairs(palette) do
    local d=(r-c[1])^2*0.3+(g-c[2])^2*0.59+(b-c[3])^2*0.11
    if d<dist then best,dist=i,d end
  end
  return best
end
local src=Image{fromFile='draft.png'}
local function isbg(p)
  return pc.rgbaA(p)<128 or (pc.rgbaR(p)>180 and pc.rgbaB(p)>180 and pc.rgbaG(p)<100)
end
local minx,miny,maxx,maxy=src.width,src.height,-1,-1
for it in src:pixels() do
  if not isbg(it()) then
    minx=math.min(minx,it.x);maxx=math.max(maxx,it.x)
    miny=math.min(miny,it.y);maxy=math.max(maxy,it.y)
  end
end
local sw,sh=maxx-minx+1,maxy-miny+1
local th=50
local tw=math.floor(sw*th/sh+0.5)
local tx=math.floor((64-tw)/2);local ty=62-th
local data={}
for y=0,63 do data[y]={};for x=0,63 do data[y][x]=0 end end
-- Sample nine interior points per destination cell. Background majority wins;
-- average foreground colours are reduced to the deliberate hand-tuned palette.
for y=0,th-1 do for x=0,tw-1 do
  local r,g,b,n=0,0,0,0
  for sy=1,3 do for sx=1,3 do
    local px=math.min(maxx,math.floor(minx+(x+sx/4)*sw/tw))
    local py=math.min(maxy,math.floor(miny+(y+sy/4)*sh/th))
    local p=src:getPixel(px,py)
    if not isbg(p) then r=r+pc.rgbaR(p);g=g+pc.rgbaG(p);b=b+pc.rgbaB(p);n=n+1 end
  end end
  if n>=5 then data[y+ty][x+tx]=near(r/n,g/n,b/n) end
end end
local function put(x,y,c) if x>=0 and x<64 and y>=0 and y<64 then data[y][x]=c end end
local function rect(x,y,w,h,c) for yy=y,y+h-1 do for xx=x,x+w-1 do put(xx,yy,c) end end end
-- Explicit pixel corrections are applied here after initial draft inspection.
local owner={}
if app.params.cleanup~='no' then
  local clean=loadfile('scripts/cleanup.lua')
  if clean then owner=clean()(data,put,rect) end
end
-- Remove detached opaque singleton components (8-neighbour connectivity).
local seen={};local removed=0
for y=0,63 do for x=0,63 do
  local key=y*64+x
  if data[y][x]>0 and not seen[key] then
    local q={{x,y}};seen[key]=true;local p=1
    while p<=#q do
      local v=q[p];p=p+1
      for dy=-1,1 do for dx=-1,1 do
        local xx,yy=v[1]+dx,v[2]+dy
        if xx>=0 and xx<64 and yy>=0 and yy<64 and data[yy][xx]>0 and not seen[yy*64+xx] then
          seen[yy*64+xx]=true;q[#q+1]={xx,yy}
        end
      end end
    end
    if #q==1 then put(x,y,0);removed=removed+1 end
  end
end end
local sprite=Sprite(64,64,ColorMode.RGB)
sprite:setPalette(Palette(#palette+1))
sprite.palettes[1]:setColor(0,Color{r=0,g=0,b=0,a=0})
for i,c in ipairs(palette) do sprite.palettes[1]:setColor(i,Color{r=c[1],g=c[2],b=c[3],a=255}) end
local layers={'body and outfit','hair face and ears','tail'}
local images={Image(64,64,ColorMode.RGB),Image(64,64,ColorMode.RGB),Image(64,64,ColorMode.RGB)}
local flat=Image(64,64,ColorMode.RGB)
for y=0,63 do for x=0,63 do
  local c=data[y][x]
  if c>0 then
    local layer=1
    if owner[y*64+x]=='hair face and ears' then layer=2 elseif owner[y*64+x]=='tail' then layer=3 end
    images[layer]:drawPixel(x,y,colors[c]);flat:drawPixel(x,y,colors[c])
  end
end end
sprite.layers[1].name=layers[1];sprite.cels[1].image=images[1]
for i=2,3 do local l=sprite:newLayer();l.name=layers[i];sprite:newCel(l,1,images[i]) end
sprite:saveAs('base.aseprite')
flat:saveAs('base.png')
local preview=Image(64,64,ColorMode.RGB)
preview:clear(pc.rgba(128,128,128,255));preview:drawImage(flat)
preview:resize{width=512,height=512,method='nearest'}
preview:saveAs('preview_8x.png')
local f=io.open('scripts/sampling.txt','w')
f:write(string.format('Draft %dx%d; foreground bbox (%d,%d)-(%d,%d).\n',src.width,src.height,minx,miny,maxx,maxy))
f:write(string.format('Sample target %dx%d at (%d,%d). Nine-point majority foreground sampling.\n',tw,th,tx,ty))
f:write('Removed detached singleton components: '..removed..'\n');f:close()
local rows=io.open('scripts/pixel_map.txt','w')
local symbols='0123456789ABCDEFGHIJKLMNOPQRS'
for y=0,63 do
  rows:write(string.format('%02d ',y))
  for x=0,63 do local n=data[y][x];rows:write(n==0 and '.' or symbols:sub(n+1,n+1)) end
  rows:write('\n')
end
rows:close()
print('Built sprite; '..tw..'x'..th..' sampled footprint')
