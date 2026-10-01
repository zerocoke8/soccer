-- Neria: native pixel construction based on source.png and draft.png.
-- Run from project root with Aseprite -b --script scripts/build_base.lua
local pc = app.pixelColor
local targets = {
  {51,60,70}, {66,80,95}, {82,104,121}, {104,135,151},
  {137,167,178}, {174,198,202}, {199,215,213},
  {150,148,146}, {183,180,174}, {212,207,199}, {235,230,222},
  {168,131,114}, {203,163,144}, {229,193,173}, {245,215,194},
  {132,118,98}, {168,148,120}, {198,178,150},
  {158,103,89}, {191,130,109}, {210,155,129},
  {71,92,106}, {121,153,167}, {225,219,210}
}
-- Snap every colour to an actual sampled illustration pixel.
local source = Image{fromFile='source.png'}
local palette, best = {}, {}
for i=1,#targets do best[i]=math.huge end
for y=0,source.height-1,4 do
  for x=0,source.width-1,4 do
    local v=source:getPixel(x,y)
    local r,g,b=pc.rgbaR(v),pc.rgbaG(v),pc.rgbaB(v)
    for i,t in ipairs(targets) do
      local d=(r-t[1])^2+(g-t[2])^2+(b-t[3])^2
      if d<best[i] then best[i]=d; palette[i]=pc.rgba(r,g,b,255) end
    end
  end
end
local spr=Sprite(64,64,ColorMode.RGB)
local pal=Palette(#palette+1)
pal:setColor(0,Color{r=0,g=0,b=0,a=0})
for i,v in ipairs(palette) do pal:setColor(i,Color(v)) end
spr:setPalette(pal)
local img
local function layer(name)
  local l
  if #spr.layers==1 and spr.layers[1].name=='Layer 1' then l=spr.layers[1]
  else l=spr:newLayer() end
  l.name=name; img=Image(64,64,ColorMode.RGB)
  spr:newCel(l,1,img,Point(0,0))
  img=l:cel(1).image
end
local function p(x,y,c) img:drawPixel(x,y,c==0 and 0 or palette[c]) end
local function rect(x1,y1,x2,y2,c)
  for y=y1,y2 do for x=x1,x2 do p(x,y,c) end end
end
local function line(x1,y1,x2,y2,c)
  local dx,dy=math.abs(x2-x1),-math.abs(y2-y1)
  local sx,sy=x1<x2 and 1 or -1,y1<y2 and 1 or -1
  local e=dx+dy
  while true do
    p(x1,y1,c); if x1==x2 and y1==y2 then break end
    local e2=2*e
    if e2>=dy then e=e+dy; x1=x1+sx end
    if e2<=dx then e=e+dx; y1=y1+sy end
  end
end
local function poly(v,c)
  local ymin,ymax=63,0
  for _,q in ipairs(v) do ymin=math.min(ymin,q[2]); ymax=math.max(ymax,q[2]) end
  for y=ymin,ymax do
    local xs={}
    for i,a in ipairs(v) do
      local b=v[i%#v+1]
      if (a[2]<=y and b[2]>y) or (b[2]<=y and a[2]>y) then
        xs[#xs+1]=a[1]+(y-a[2])*(b[1]-a[1])/(b[2]-a[2])
      end
    end
    table.sort(xs)
    for i=1,#xs-1,2 do rect(math.ceil(xs[i]),y,math.floor(xs[i+1]),y,c) end
  end
  for i,a in ipairs(v) do local b=v[i%#v+1]; line(a[1],a[2],b[1],b[2],c) end
end

layer('01 Hair - back and aqua tips')
poly({{26,12},{37,12},{37,31},{34,42},{31,51},{26,54},{24,52},{22,54},{18,53},{16,50},{14,52},{12,50},{13,43},{17,34},{21,25}},1)
poly({{26,14},{35,15},{35,32},{32,43},{29,51},{26,52},{25,48},{22,52},{19,51},{18,47},{14,50},{14,44},{18,35},{22,26}},9)
poly({{27,17},{30,19},{28,34},{23,46},{20,49},{20,44},{24,32}},11)
poly({{32,21},{34,19},{33,35},{29,46},{26,48},{28,39}},10)
poly({{18,38},{20,37},{18,45},{15,48},{15,44}},6)
poly({{23,39},{26,36},{23,47},{21,51},{19,49},{20,45}},6)
poly({{28,39},{31,35},{29,49},{27,51},{26,48}},6)
line(16,45,14,49,4); line(22,45,20,51,4); line(29,45,27,51,4)
line(24,29,21,37,8); line(31,26,29,36,8)

layer('02 Far arm and leg')
poly({{37,27},{41,27},{44,30},{46,30},{47,34},{42,36},{39,32}},1)
poly({{39,28},{41,29},{43,32},{45,32},{44,34},{42,34},{39,31}},10)
rect(42,32,45,34,3)
poly({{37,42},{44,42},{44,50},{43,56},{45,58},{48,59},{49,61},{48,62},{39,62},{37,60},{38,55},{37,50}},1)
rect(38,44,43,49,13); rect(40,44,43,48,14)
rect(38,50,43,52,3); rect(39,50,42,50,17)
rect(39,53,42,57,10); rect(41,54,43,57,3)
rect(39,58,44,60,3); rect(43,59,47,60,10)
rect(40,61,47,61,2); p(40,62,16); p(46,62,16)

layer('03 Keeper top and shorts')
poly({{31,23},{37,23},{38,26},{41,28},{42,34},{40,38},{43,41},{43,44},{36,45},{34,43},{29,44},{27,41},{28,36},{27,30},{29,27}},1)
rect(32,24,36,27,2); rect(34,25,37,26,3); p(35,25,17)
poly({{31,27},{35,28},{38,27},{40,29},{41,33},{39,36},{30,36},{29,31}},10)
poly({{32,28},{35,30},{39,29},{40,32},{38,34},{32,34}},11)
line(29,29,31,32,3); line(31,32,31,35,2)
line(35,28,37,29,17)
-- Large curled wave on the front of the keeper jersey.
rect(39,30,40,31,4); p(38,30,4); p(39,32,4)
rect(36,33,39,34,4); p(35,32,4); p(36,32,4)
rect(30,36,40,38,2); rect(35,36,37,38,16); p(36,37,10)
poly({{29,39},{40,39},{42,41},{42,43},{36,44},{34,42},{33,44},{28,43}},2)
poly({{30,39},{34,40},{33,42},{29,42}},3)
rect(37,40,40,42,3); line(35,40,34,43,1)
line(29,43,32,43,4); line(37,44,41,43,4)

layer('04 Near leg and cleat')
poly({{28,44},{34,44},{35,46},{33,52},{32,57},{34,58},{38,59},{39,61},{38,62},{27,62},{25,60},{26,57},{26,51}},1)
poly({{29,45},{33,45},{33,48},{31,52},{27,51},{28,47}},14)
line(28,46,27,50,13); rect(28,46,33,47,2); p(31,46,17)
poly({{27,52},{32,53},{31,58},{27,58}},10)
rect(27,51,32,52,3); line(28,52,30,53,17)
poly({{30,54},{32,54},{31,58},{29,58},{29,56}},3)
p(29,55,4); p(28,56,4)
poly({{27,58},{31,58},{33,59},{37,60},{37,61},{27,61},{26,60}},3)
rect(28,59,31,60,10); rect(32,60,37,60,11)
line(29,58,32,59,17); p(29,60,2); p(32,60,2)
rect(28,62,29,62,16); rect(35,62,36,62,16)

layer('05 Wave panel and coral tassels')
poly({{28,38},{30,40},{27,47},{26,53},{22,55},{19,53},{22,46},{25,41}},1)
poly({{27,40},{28,41},{25,48},{24,52},{22,53},{21,52},{24,45}},10)
poly({{25,44},{26,44},{25,47},{23,49},{24,51},{22,52},{21,51},{23,46}},3)
rect(23,47,24,48,4); p(24,47,10); p(22,50,4)
line(20,53,22,54,17); line(22,54,25,52,17)
rect(40,44,41,46,16); rect(41,46,42,49,18); rect(41,47,41,49,20)
rect(21,55,22,57,18); p(21,55,17); p(22,56,20)

layer('06 Head - right profile')
poly({{27,3},{31,2},{37,2},{41,4},{43,6},{45,10},{45,15},{44,17},{45,18},{45,19},{44,20},{43,22},{41,24},{38,24},{35,22},{33,21},{28,21},{25,18},{24,13},{24,7}},1)
poly({{33,10},{41,10},{43,13},{43,17},{44,18},{43,20},{42,22},{40,23},{38,23},{35,21},{32,18}},13)
poly({{36,12},{41,12},{42,15},{42,18},{43,18},{42,20},{41,22},{39,22},{36,20}},14)
rect(32,16,34,19,12); rect(33,16,34,18,14)
-- Calm, narrow slate-blue eye looking right.
line(39,16,42,16,1); p(38,15,12)
rect(40,17,42,18,11); rect(41,17,42,18,3); p(42,17,4)
rect(42,21,43,21,12)
-- Broad silver fringe; no noisy strand dithering.
poly({{27,5},{31,3},{37,3},{40,5},{42,7},{43,10},{41,12},{38,13},{36,15},{35,19},{34,21},{32,20},{32,15},{29,17},{26,15},{25,12},{25,8}},9)
poly({{28,5},{32,4},{37,4},{39,5},{40,7},{37,9},{34,13},{31,15},{29,14},{30,10}},11)
poly({{40,7},{42,9},{43,12},{42,14},{40,15},{41,12},{39,13},{37,14},{37,12}},10)
line(38,6,34,10,8); line(34,10,32,14,8)
poly({{29,14},{31,14},{30,20},{31,25},{32,29},{30,28},{28,23},{28,18}},10)
line(29,18,29,24,11)
line(43,10,44,13,8); line(44,13,43,16,8)

layer('07 Hair flower and blue ribbons')
-- Four compact petals and muted gold edging echo the ornate hair clasp.
poly({{26,5},{28,6},{28,8},{30,9},{29,11},{27,11},{26,13},{24,12},{23,10},{24,8},{24,6}},1)
rect(25,6,26,8,3); p(26,6,17); p(25,7,10)
rect(27,9,29,10,3); p(29,9,17); p(28,9,5)
rect(24,9,25,11,3); p(24,9,17); p(25,10,5)
rect(26,11,27,12,3); p(26,11,17)
rect(26,8,27,9,17); p(26,9,10)
line(24,12,24,16,16); rect(23,15,24,19,1); rect(23,16,23,18,4)
line(27,13,27,17,16); rect(26,17,28,22,1); rect(27,17,28,21,3); line(27,18,27,21,4)

layer('08 Near sleeve and ornate gloves')
-- Far glove is raised, near glove is lower: distinct padded silhouettes.
poly({{45,29},{49,29},{51,31},{51,34},{49,36},{45,35},{43,33},{43,31}},1)
poly({{45,30},{48,30},{50,31},{50,33},{48,35},{45,34},{44,32}},9)
rect(46,30,48,32,11); rect(47,33,49,34,10)
line(49,31,50,31,3); line(48,33,50,33,3)
rect(44,31,45,33,3); p(45,32,17)
poly({{28,28},{31,29},{33,33},{32,35},{35,36},{36,40},{32,41},{28,39},{26,36},{26,31}},1)
poly({{28,30},{30,30},{31,33},{30,36},{33,37},{33,39},{30,39},{27,36},{27,32}},10)
rect(28,31,30,34,11); line(28,37,30,38,8)
line(27,30,29,29,3); line(27,32,27,35,3)
rect(33,36,36,40,2); rect(34,37,35,39,3)
poly({{37,35},{41,35},{43,36},{46,37},{47,39},{46,41},{42,42},{38,41},{36,39},{36,36}},1)
poly({{38,36},{41,36},{42,37},{45,38},{46,39},{45,40},{42,41},{39,40},{37,39},{37,37}},10)
rect(38,36,41,39,3); p(39,36,17); rect(39,37,40,38,17); p(39,38,4)
line(42,37,45,38,11); line(42,39,45,40,11)
line(42,38,45,39,3); line(41,40,44,41,3)
rect(37,37,37,39,17)
-- Small coral shoulder tassel, attached to the seam.
rect(29,32,29,34,16); rect(29,34,30,36,18); p(30,35,20)

spr:saveAs('base.aseprite')
spr:saveCopyAs('base.png')
local flat=Image(spr.spec); flat:drawSprite(spr,1)
local preview=Sprite(512,512,ColorMode.RGB)
local canvas=preview.cels[1].image
for y=0,511 do for x=0,511 do
  local v=flat:getPixel(math.floor(x/8),math.floor(y/8))
  canvas:drawPixel(x,y,pc.rgbaA(v)==0 and pc.rgba(154,157,159,255) or v)
end end
preview:saveCopyAs('preview_8x.png')
print('Built base.aseprite, base.png, preview_8x.png')
