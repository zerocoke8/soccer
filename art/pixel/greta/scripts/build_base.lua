-- Greta: deterministic native 64x64 sprite, hand-rebuilt from the draft study.
-- Run from project root: Aseprite.exe -b --script scripts/build_base.lua
local pc = app.pixelColor
local root = app.params.root or '.'
local function path(s) return root..'/'..s end
local source = Image{fromFile=path('source.png')}

-- Desired matte ramps. Each color is snapped to an actual opaque source pixel.
local targets = {
  {48,37,32}, {68,50,43}, {84,66,53}, {111,77,55},
  {76,44,37}, {111,53,45}, {145,65,55}, {171,81,68}, {187,102,83},
  {136,89,68}, {174,119,92}, {202,145,111}, {223,165,130}, {236,185,150},
  {56,49,43}, {72,62,52}, {91,77,63}, {113,94,72},
  {144,111,71}, {172,137,88}, {197,162,111},
  {171,149,119}, {207,187,154}, {232,217,189},
}
local rgba, rgb = {}, {}
for i,t in ipairs(targets) do
  local best, bd = nil, math.huge
  for y=0,source.height-1,3 do
    for x=0,source.width-1,3 do
      local p=source:getPixel(x,y)
      local r,g,b=pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p)
      local d=(r-t[1])^2+(g-t[2])^2+(b-t[3])^2
      if d<bd then best={r,g,b}; bd=d end
    end
  end
  rgb[i]=best; rgba[i]=pc.rgba(best[1],best[2],best[3],255)
end
local s=Sprite(64,64,ColorMode.RGB)
s.filename=path('base.aseprite')
s.layers[1].name='00 - Rear cloth'
local pal=Palette(#rgba+1)
pal:setColor(0,Color{r=0,g=0,b=0,a=0})
for i,c in ipairs(rgb) do pal:setColor(i,Color{r=c[1],g=c[2],b=c[3],a=255}) end
s:setPalette(pal)
local img
local function layer(name, first)
  local l=first and s.layers[1] or s:newLayer()
  l.name=name
  img=Image(64,64,ColorMode.RGB)
  s:newCel(l,1,img,Point(0,0))
  img=l:cel(1).image
end
local function px(x,y,c)
  if x>=0 and x<64 and y>=0 and y<64 then img:drawPixel(x,y,c==0 and 0 or rgba[c]) end
end
local function rect(x1,y1,x2,y2,c)
  for y=y1,y2 do for x=x1,x2 do px(x,y,c) end end
end
local function line(x1,y1,x2,y2,c)
  local dx,dy=math.abs(x2-x1),-math.abs(y2-y1)
  local sx,sy=x1<x2 and 1 or -1,y1<y2 and 1 or -1
  local e=dx+dy
  while true do
    px(x1,y1,c)
    if x1==x2 and y1==y2 then break end
    local e2=2*e
    if e2>=dy then e=e+dy; x1=x1+sx end
    if e2<=dx then e=e+dx; y1=y1+sy end
  end
end
local function poly(v,c)
  local ymin,ymax=63,0
  for _,p in ipairs(v) do ymin=math.min(ymin,p[2]); ymax=math.max(ymax,p[2]) end
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
local function outline(v,fill)
  poly(v,fill)
  for i,a in ipairs(v) do local b=v[i%#v+1]; line(a[1],a[2],b[1],b[2],1) end
end

-- Cloth is attached at the back of the belt, with cream lining and one bold flame.
layer('00 - Rear flame cloth',true)
outline({{27,39},{34,41},{28,55},{22,57},{12,53},{17,46},{22,42}},6)
poly({{25,42},{29,43},{24,54},{21,55},{14,52},{19,46}},7)
poly({{28,43},{31,43},{27,54},{22,56},{20,55},{25,48}},22)
line(28,45,24,54,23)
poly({{18,52},{16,51},{18,48},{20,48},{21,45},{22,47},{21,50},{19,51},{20,53}},20)
line(14,53,20,55,19)
rect(20,56,21,58,5); rect(20,56,20,58,7)

-- Far arm, slightly darker, visible beyond the chest with transparent elbow gap.
layer('01 - Far arm')
outline({{43,26},{48,27},{51,30},{51,33},{54,37},{53,41},{49,41},{47,36},{46,32}},11)
poly({{46,28},{48,29},{49,32},{48,34},{47,32}},12)
line(49,34,51,35,10)
outline({{50,36},{54,36},{55,41},{53,44},{50,43},{49,39}},15)
line(50,37,54,37,19); line(51,40,54,40,4)
outline({{51,43},{54,42},{55,44},{54,46},{51,46},{50,45}},2)
rect(51,44,53,45,11); px(54,44,12)

-- Two separated legs and rightward cleats on the same baseline.
layer('02 - Legs and cleats')
outline({{38,45},{45,45},{46,49},{44,54},{44,57},{46,59},{51,60},{52,61},{51,62},{40,62},{38,60},{39,55},{37,50}},11)
poly({{40,47},{44,47},{44,50},{42,53},{40,52}},12)
rect(40,53,44,57,15); line(40,53,44,53,19)
poly({{41,55},{42,56},{41,58},{44,58},{45,60},{49,60},{50,61},{40,61},{39,59}},3)
line(44,56,43,58,7); line(42,58,43,60,8)
line(41,59,46,60,19); line(40,61,51,61,18)
px(42,62,1); px(47,62,1)
outline({{27,44},{35,45},{37,49},{34,53},{32,55},{31,58},{33,59},{38,60},{39,61},{38,62},{25,62},{23,60},{25,54},{25,49}},12)
poly({{28,46},{33,47},{34,49},{32,52},{28,53},{27,50}},13)
line(34,49,32,52,11); line(27,51,28,53,11)
outline({{25,54},{32,54},{31,58},{32,59},{28,60},{24,59}},15)
rect(26,55,30,56,16); line(25,54,32,54,19)
poly({{29,56},{31,55},{30,57},{28,58},{29,59},{27,59},{27,57}},8)
outline({{25,58},{30,58},{32,59},{36,59},{39,61},{38,62},{24,62},{23,60}},3)
poly({{26,59},{29,59},{30,60},{35,60},{37,61},{28,61}},7)
line(27,59,29,60,20); line(31,60,33,61,20)
line(24,61,27,61,18); line(34,61,38,61,18)
px(25,62,1); px(30,62,1); px(36,62,1)

layer('03 - Torso and shorts')
-- Right-facing chest, cropped vest, exposed abdomen.
outline({{31,23},{38,23},{40,26},{45,27},{48,31},{48,34},{44,36},{44,38},{46,41},{43,44},{28,43},{26,39},{29,35},{26,30}},12)
poly({{35,35},{41,35},{42,39},{40,41},{34,40},{32,38}},13)
line(41,36,41,38,11); px(42,39,10)
line(34,38,36,39,11)
outline({{30,23},{36,23},{38,25},{40,24},{42,25},{41,28},{35,29},{30,27}},15)
line(31,23,35,23,19); line(40,25,40,27,19)
outline({{28,26},{32,26},{35,28},{43,27},{46,29},{48,32},{47,34},{42,36},{31,35},{28,32}},6)
poly({{32,28},{35,29},{34,33},{32,34},{29,31}},7)
poly({{38,28},{43,28},{46,30},{47,32},{46,34},{40,35},{36,33},{36,30}},15)
poly({{39,29},{43,29},{45,31},{45,32},{38,32},{37,31}},16)
line(36,34,42,35,2)
line(31,27,44,29,19); line(32,28,43,30,2)
line(41,30,42,33,20); rect(42,32,43,33,21)
outline({{30,34},{34,35},{44,34},{44,36},{33,38},{29,36}},15)
line(32,36,41,35,18); rect(40,35,41,36,20)
outline({{29,40},{35,40},{43,41},{46,42},{46,46},{43,48},{38,48},{35,46},{31,48},{26,46},{26,43}},15)
poly({{29,42},{33,42},{35,44},{34,46},{30,46},{27,45}},16)
poly({{38,43},{44,43},{44,46},{40,47},{38,46}},16)
line(36,43,37,46,1); line(27,46,31,47,7); line(39,48,44,47,7)
line(28,45,30,46,19); line(41,46,43,45,19)
-- Belt slopes toward the right; brass buckle and red harness.
outline({{28,39},{35,39},{44,41},{46,42},{44,44},{34,41},{28,42}},3)
line(30,40,35,40,18); line(39,41,44,42,18)
rect(35,40,38,43,19); rect(36,41,37,42,2); px(38,41,21)
line(31,36,29,41,5); line(32,36,30,41,8)
rect(31,37,32,38,19)

-- Near muscular arm: broad deltoid, biceps, bracer, compact closed hand.
layer('04 - Near arm and brass bracer')
outline({{26,25},{30,26},{33,29},{32,32},{29,35},{27,38},{29,41},{27,44},{23,44},{20,40},{17,36},{18,32},{20,28},{23,26}},12)
poly({{23,27},{27,26},{30,28},{31,30},{29,32},{25,32},{21,31},{21,29}},13)
poly({{24,27},{27,27},{29,28},{30,30},{27,31},{23,30},{22,29}},14)
line(22,32,25,33,11); line(26,33,29,32,11)
poly({{21,34},{24,34},{26,35},{25,37},{23,38},{20,37},{19,36}},13)
line(21,34,23,34,14)
line(20,38,22,39,11)
-- Upper arm band, small knot; no detached decoration.
line(20,32,23,32,15); line(23,33,28,34,15)
line(20,33,23,33,3); line(24,34,27,35,3)
rect(20,32,21,33,19)
outline({{20,38},{24,37},{27,38},{29,42},{26,45},{22,44},{20,41}},15)
line(21,38,24,38,19); line(25,38,26,40,19)
poly({{22,39},{24,39},{25,40},{24,41},{25,42},{24,43},{22,41}},18)
line(22,39,23,39,20); line(22,40,23,41,19)
line(22,44,27,43,19)
outline({{25,44},{28,43},{30,44},{31,46},{29,48},{26,48},{24,46}},2)
poly({{28,44},{29,45},{30,46},{28,46},{27,45}},12)
line(26,47,28,47,3)

-- The generated draft had an irregular grid and overly tall proportions.
-- Reconstruct its head as deliberate native clusters instead of keeping resample noise.
layer('05 - Crimson hair horns and face')
poly({{34,20},{39,20},{41,23},{39,25},{35,24}},11)
line(36,22,39,23,12)
outline({{28,6},{31,4},{35,4},{38,3},{41,5},{44,5},{46,7},{47,10},{49,11},{47,12},{48,15},{46,18},{46,20},{43,23},{39,23},{36,21},{33,22},{31,20},{28,21},{28,18},{25,19},{26,16},{24,17},{25,13},{24,13},{26,10},{25,10},{28,8},{27,8}},6)
poly({{28,9},{32,6},{36,6},{39,5},{43,6},{45,8},{46,11},{44,15},{43,19},{40,21},{36,20},{32,19},{28,17},{27,14}},7)
poly({{29,9},{32,7},{35,7},{33,9},{31,10},{28,12}},8)
poly({{34,7},{37,5},{40,6},{39,8},{36,10},{33,11}},8)
poly({{29,12},{32,11},{30,14},{30,17},{28,18},{28,15}},8)
line(26,14,27,12,5); line(28,18,30,19,5)
line(32,17,33,20,5)
-- Jaw, cheek, ear, profile nose, grinning mouth and amber eye.
poly({{37,13},{42,12},{45,14},{45,16},{47,17},{46,18},{46,20},{43,22},{40,22},{37,20},{35,17}},12)
poly({{39,14},{43,14},{44,16},{45,17},{44,20},{42,21},{39,20},{37,17}},14)
line(40,22,43,23,1); line(44,22,46,20,1)
line(46,18,47,18,10); px(47,17,12)
-- Near ear.
poly({{32,14},{34,14},{35,16},{35,18},{33,18},{31,16},{31,15}},11)
rect(32,15,33,16,13); px(33,16,10)
line(35,18,37,20,10)
-- Strong raised brow and rightward eye.
line(39,13,41,13,5); line(42,14,43,14,5)
line(40,14,42,14,1)
rect(40,15,42,16,24); rect(42,15,42,16,19); rect(43,15,43,16,1)
-- 5-pixel grin with warm ivory teeth and dark lower edge.
line(40,17,41,19,1); line(42,20,44,20,1); line(45,19,46,18,1)
line(41,18,45,18,24); line(42,19,44,19,24)
-- Cheek scar is a two-pixel warm red slash.
px(38,17,9); px(37,18,9)
-- Forelock overlaps forehead without hiding the expression.
poly({{37,8},{40,9},{39,12},{38,14},{38,16},{36,14},{35,12}},7)
line(36,11,37,14,6); line(39,8,41,10,8)
poly({{42,7},{44,8},{45,11},{44,14},{43,12},{43,10}},8)
line(45,10,45,14,6); line(46,12,46,15,5)
-- Small horns with solid stepped contours.
outline({{34,7},{34,4},{36,2},{37,2},{37,5},{36,8}},2)
line(35,4,36,3,4); line(35,6,36,6,18)
outline({{44,7},{45,4},{46,5},{46,8},{45,9}},2)
px(45,6,4)

-- Remove any detached alpha component; purposeful facial pixels stay connected.
local function flatten()
  local flat=Image(64,64,ColorMode.RGB)
  flat:drawSprite(s,1)
  return flat
end
local flat=flatten()
local seen,groups={},{}
for y=0,63 do for x=0,63 do
  local key=y*64+x
  if not seen[key] and pc.rgbaA(flat:getPixel(x,y))>0 then
    local q={{x,y}}; seen[key]=true; local n=1
    while n<=#q do
      local a=q[n]; n=n+1
      for dy=-1,1 do for dx=-1,1 do
        local xx,yy=a[1]+dx,a[2]+dy; local k=yy*64+xx
        if xx>=0 and xx<64 and yy>=0 and yy<64 and not seen[k] and pc.rgbaA(flat:getPixel(xx,yy))>0 then
          seen[k]=true; q[#q+1]={xx,yy}
        end
      end end
    end
    groups[#groups+1]=q
  end
end end
table.sort(groups,function(a,b) return #a>#b end)
for i=2,#groups do
  for _,p in ipairs(groups[i]) do
    for _,l in ipairs(s.layers) do l:cel(1).image:drawPixel(p[1],p[2],0) end
  end
end
s:saveAs(path('base.aseprite'))
s:saveCopyAs(path('base.png'))
local f=io.open(path('scripts/palette.txt'),'w')
f:write('Transparent + 24 source-sampled matte colors (RGB):\n')
for i,c in ipairs(rgb) do f:write(string.format('%02d: %d %d %d\n',i,c[1],c[2],c[3])) end
f:close()
print('Saved base.aseprite and base.png')
