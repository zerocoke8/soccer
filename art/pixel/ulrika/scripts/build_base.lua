-- Rebuild from the one imagegen draft. All final painting occurs in native pixels.
local root = app.params.root or '.'
local draft = Image{fromFile=root..'/draft.png'}
local pc = app.pixelColor
local W,H = draft.width,draft.height
local colors = {
  '303635', -- 1 colored outline
  '4b4844', -- 2 warm outline
  '66615b', -- 3 deepest silver
  '8f8983', -- 4 silver shade
  'b3ada6', -- 5 silver middle
  'd0cbc3', -- 6 silver light
  'e5dfd4', -- 7 silver/cream light
  '8c6858', -- 8 skin outline
  'b78d76', -- 9 skin shade
  'd5ad95', -- 10 skin middle
  'e8c5ac', -- 11 skin light
  '263a3c', -- 12 deepest pine
  '374d4e', -- 13 pine shade
  '4c6260', -- 14 pine middle
  '657873', -- 15 pine light
  'b7aa90', -- 16 cream shade
  'd4c8ae', -- 17 cream middle
  'e8deca', -- 18 cream light
  '6b5941', -- 19 muted metal shade
  'a18960', -- 20 muted gold
  'c1aa80', -- 21 muted metal light
  '48504e', -- 22 sock light
  '75544a', -- 23 mouth
}
local rgb,packed = {},{[0]=0}
-- Anchor each swatch to an actual opaque pixel from the supplied illustration.
local source=Image{fromFile=root..'/source.png'}
local samples={}
for y=0,source.height-1,4 do for x=0,source.width-1,4 do
  local p=source:getPixel(x,y)
  if pc.rgbaA(p)==255 then samples[#samples+1]={pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p),x,y} end
end end
local swatchFile=io.open(root..'/scripts/palette_source.tsv','w')
swatchFile:write('index\thex\tsource_x\tsource_y\n')
for i,h in ipairs(colors) do
  local r,g,b=tonumber(h:sub(1,2),16),tonumber(h:sub(3,4),16),tonumber(h:sub(5,6),16)
  local best,dist=nil,1e10
  for _,s in ipairs(samples) do
    local d=(r-s[1])^2+(g-s[2])^2+(b-s[3])^2
    if d<dist then best,dist=s,d end
  end
  r,g,b=best[1],best[2],best[3]
  swatchFile:write(string.format('%d\t#%02X%02X%02X\t%d\t%d\n',i,r,g,b,best[4],best[5]))
  rgb[i]={r,g,b}; packed[i]=pc.rgba(r,g,b,255)
end
swatchFile:close()
-- Flood only the connected neutral background; enclosed gray hair is retained.
local bg,queue={},{}
local function enqueue(x,y)
  if x<0 or y<0 or x>=W or y>=H then return end
  local k=y*W+x
  if bg[k] then return end
  local p=draft:getPixel(x,y)
  local r,g,b=pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p)
  if math.max(r,g,b)-math.min(r,g,b)<=13 and r>=140 and r<=218 then
    bg[k]=true; queue[#queue+1]=k
  end
end
for x=0,W-1 do enqueue(x,0); enqueue(x,H-1) end
for y=0,H-1 do enqueue(0,y); enqueue(W-1,y) end
local qi=1
while qi<=#queue do
  local k=queue[qi]; qi=qi+1
  local x,y=k%W,math.floor(k/W)
  enqueue(x-1,y);enqueue(x+1,y);enqueue(x,y-1);enqueue(x,y+1)
end
local cache={}
local function nearest(p)
  if cache[p] then return cache[p] end
  local r,g,b=pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p)
  local best,dist=1,1e10
  for i,c in ipairs(rgb) do
    local d=(r-c[1])^2+(g-c[2])^2+(b-c[3])^2
    if d<dist then best,dist=i,d end
  end
  cache[p]=best; return best
end
local pixels={}
for y=0,63 do
  pixels[y]={}
  for x=0,63 do
    local counts,total,fg={},0,0
    for sy=math.floor(y*H/64),math.floor((y+1)*H/64)-1 do
      for sx=math.floor(x*W/64),math.floor((x+1)*W/64)-1 do
        total=total+1
        if not bg[sy*W+sx] then
          fg=fg+1
          local i=nearest(draft:getPixel(sx,sy));counts[i]=(counts[i] or 0)+1
        end
      end
    end
    local best,n=0,0
    if fg/total>=0.42 then
      for i=1,#colors do if (counts[i] or 0)>n then best,n=i,counts[i] end end
    end
    pixels[y][x]=best
  end
end
-- Native-grid cleanup is applied after sampling, before editable layers are made.
local function put(x,y,c) pixels[y][x]=c end
local function run(y,x,values) for i=1,#values do put(x+i-1,y,values[i]) end end
local cleanup=dofile(root..'/scripts/cleanup.lua')
cleanup(pixels)

local sprite=Sprite(64,64,ColorMode.RGB)
sprite.filename=root..'/base.aseprite'
local palette=Palette(#colors+1)
palette:setColor(0,Color{r=0,g=0,b=0,a=0})
for i,c in ipairs(rgb) do palette:setColor(i,Color{r=c[1],g=c[2],b=c[3],a=255}) end
sprite:setPalette(palette)
local names={'Tail','Far limbs','Body and costume','Hair ears face','Near arm'}
local layers,images={},{}
for i,name in ipairs(names) do
  layers[i]=i==1 and sprite.layers[1] or sprite:newLayer()
  layers[i].name=name; images[i]=Image(64,64,ColorMode.RGB)
end
for y=0,63 do for x=0,63 do
  local idx=pixels[y][x]
  if idx>0 then
    local layer=3
    if y<24 then layer=4
    elseif x<23 and y>=29 then layer=1
    elseif x>=40 and y>=29 and y<41 then layer=5
    elseif x>=35 and y>=40 then layer=2 end
    images[layer]:drawPixel(x,y,packed[idx])
  end
end end
for i=1,#layers do sprite:newCel(layers[i],1,images[i],Point(0,0)) end
sprite:saveAs(root..'/base.aseprite')
sprite:saveCopyAs(root..'/base.png')
local flat=Image(64,64,ColorMode.RGB); flat:drawSprite(sprite,1)
local preview=Image(512,512,ColorMode.RGB)
for y=0,511 do for x=0,511 do
  local p=flat:getPixel(math.floor(x/8),math.floor(y/8))
  if pc.rgbaA(p)==0 then p=pc.rgba(151,153,150,255) end
  preview:drawPixel(x,y,p)
end end
preview:saveAs(root..'/preview_8x.png')
local f=io.open(root..'/scripts/pixel_map.txt','w')
local alphabet='.123456789ABCDEFGHIJKLMNOPQRSTUV'
for y=0,63 do
  local line=''; for x=0,63 do line=line..alphabet:sub(pixels[y][x]+1,pixels[y][x]+1) end
  f:write(string.format('%02d %s\n',y,line))
end
f:close()
print('Built base.aseprite, base.png, preview_8x.png')
