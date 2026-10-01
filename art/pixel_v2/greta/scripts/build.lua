-- Greta: native 64x64 pixel construction, Aseprite 1.3.18.
-- Run from project root. Draft is sampled first as a composition study;
-- final layers rebuild clusters at native resolution for deliberate pixel placement.
local pc=app.pixelColor
local colors={
  ink='382632', hairDark='642d3b', hairShadow='973440', red='c74745',
  hairLight='ef6650', hairShine='ff9865', skinDark='ae6356', skinShadow='db8e6c',
  skin='f7b887', skinLight='ffdab0', blush='e77769', white='fff1d0',
  charcoal='343038', darkMid='4f4548', darkLight='73605a', brassDark='805335',
  brass='bc863e', gold='edb752', goldLight='ffe292', leather='623e37',
  clothDark='772f3b', cloth='b23b3d', clothLight='e65b43', flame='f39245',
  eyeDark='663829', amber='e69528', amberLight='ffd260', cream='e0c298'
}
local order={'ink','hairDark','hairShadow','red','hairLight','hairShine','skinDark','skinShadow','skin','skinLight','blush','white','charcoal','darkMid','darkLight','brassDark','brass','gold','goldLight','leather','clothDark','cloth','clothLight','flame','eyeDark','amber','amberLight','cream'}
local P={}; local rgb={}
for _,k in ipairs(order) do
 local h=colors[k]; local r=tonumber(h:sub(1,2),16); local g=tonumber(h:sub(3,4),16); local b=tonumber(h:sub(5,6),16)
 P[k]=pc.rgba(r,g,b,255); rgb[k]={r,g,b}
end
local draft=Image{fromFile='draft.png'}
local sample=Image(64,64,ColorMode.RGB); sample:clear()
-- The draft is larger and more detailed than the target; use its occupied bounds
-- to sample into the intended 32x50 composition before hand-cluster cleanup.
for y=12,61 do for x=17,47 do
 local sx=math.floor((270+(x-17+.5)*700/31)*draft.width/1254)
 local sy=math.floor((68+(y-12+.5)*1128/50)*draft.height/1254)
 local c=draft:getPixel(math.min(sx,draft.width-1),math.min(sy,draft.height-1))
 local r,g,b=pc.rgbaR(c),pc.rgbaG(c),pc.rgbaB(c)
 if math.max(r,g,b)-math.min(r,g,b)>18 then
  local best,dist=nil,1e12
  for _,k in ipairs(order) do local q=rgb[k]; local d=(r-q[1])^2+(g-q[2])^2+(b-q[3])^2; if d<dist then best=k;dist=d end end
  sample:drawPixel(x,y,P[best])
 end
end end
sample:saveAs('scripts/draft_sample.png')

local spr=Sprite(64,64,ColorMode.RGB)
local pal=Palette(#order+1); pal:setColor(0,Color{r=0,g=0,b=0,a=0})
for i,k in ipairs(order) do local q=rgb[k];pal:setColor(i,Color{r=q[1],g=q[2],b=q[3],a=255}) end
spr:setPalette(pal)
local im
local function layer(name)
 local l
 if #spr.layers==1 and spr.layers[1].name=='Layer 1' then l=spr.layers[1] else l=spr:newLayer() end
 l.name=name;im=Image(64,64,ColorMode.RGB);im:clear();spr:newCel(l,1,im,Point(0,0));im=l:cel(1).image
end
local function dot(x,y,c) im:drawPixel(x,y,P[c]) end
local function rect(x1,y1,x2,y2,c) for y=y1,y2 do for x=x1,x2 do dot(x,y,c) end end end
local function line(x0,y0,x1,y1,c)
 local dx,dy=math.abs(x1-x0),-math.abs(y1-y0);local sx=x0<x1 and 1 or -1;local sy=y0<y1 and 1 or -1;local e=dx+dy
 while true do dot(x0,y0,c);if x0==x1 and y0==y1 then break end;local e2=2*e;if e2>=dy then e=e+dy;x0=x0+sx end;if e2<=dx then e=e+dx;y0=y0+sy end end
end
local function poly(points,c,outline)
 local minx,miny,maxx,maxy=63,63,0,0
 for _,p in ipairs(points) do minx=math.min(minx,p[1]);miny=math.min(miny,p[2]);maxx=math.max(maxx,p[1]);maxy=math.max(maxy,p[2]) end
 for y=miny,maxy do for x=minx,maxx do
  local inside=false;local j=#points
  for i=1,#points do local a,b=points[i],points[j]
   if (a[2]>y)~=(b[2]>y) and x<(b[1]-a[1])*(y-a[2])/(b[2]-a[2])+a[1] then inside=not inside end;j=i
  end
  if inside then dot(x,y,c) end
 end end
 for i=1,#points do local a,b=points[i],points[i%#points+1];line(a[1],a[2],b[1],b[2],outline or c) end
end

layer('01 Hair - rear silhouette')
poly({{15,23},{20,20},{18,19},{23,18},{25,16},{30,16},{33,14},{36,16},{39,16},{41,18},{45,18},{45,21},{47,23},{47,26},{49,29},{47,29},{48,33},{45,32},{46,36},{43,35},{42,38},{38,37},{34,39},{30,37},{26,38},{24,36},{20,37},{21,34},{17,35},{19,31},{15,32},{17,28},{14,28},{18,25}},'red','hairDark')
poly({{18,27},{24,24},{25,30},{23,35},{20,35},{22,31},{17,32}},'hairShadow')
poly({{39,21},{44,23},{45,29},{44,35},{42,34},{41,37},{38,35}},'hairShadow')
poly({{25,31},{32,32},{32,38},{29,36},{26,37}},'hairDark')
line(19,28,22,25,'hairLight')

layer('02 Outfit - trailing flame cloth')
poly({{25,47},{29,49},{25,58},{20,58},{21,53}},'cloth','ink')
poly({{22,51},{25,50},{24,56},{22,56}},'clothLight')
poly({{39,47},{42,48},{43,51},{45,53},{46,58},{43,60},{39,58},{37,52}},'cloth','ink')
poly({{41,50},{42,52},{44,54},{44,57},{42,58},{40,55}},'clothLight')
poly({{42,52},{42,54},{44,56},{44,58},{41,57},{40,55},{41,55},{42,56},{43,56},{41,53}},'gold')
line(40,58,42,59,'cream')

layer('03 Body - muscular chibi')
-- Neck and compact torso.
poly({{28,36},{36,36},{36,39},{40,41},{39,48},{37,51},{28,50},{26,44},{25,40},{29,39}},'skin','skinDark')
rect(29,37,34,39,'skinShadow');rect(30,38,34,39,'skin')
-- Broad near shoulder and bent near arm.
poly({{23,38},{26,38},{28,40},{28,43},{25,45},{24,48},{21,49},{17,47},{16,44},{17,41},{19,39}},'skin','skinDark')
poly({{19,40},{22,39},{25,39},{26,41},{24,42},{21,41},{18,43}},'skinLight')
poly({{17,44},{19,43},{22,44},{23,46},{21,48},{18,47}},'skinShadow')
line(22,42,24,42,'skinShadow');line(24,42,25,43,'skinShadow')
-- Far arm, a little narrower.
poly({{39,39},{42,40},{45,43},{47,46},{45,49},{41,48},{40,44},{38,42}},'skin','skinDark')
poly({{40,40},{42,41},{43,43},{41,43},{40,42}},'skinLight')
poly({{43,44},{45,45},{45,47},{43,48},{41,46}},'skinShadow')
-- Short sturdy thighs.
poly({{25,50},{31,50},{31,54},{29,57},{23,56},{23,53}},'skin','skinDark')
poly({{25,52},{29,52},{28,55},{24,55}},'skinLight')
poly({{34,50},{40,51},{40,56},{34,57},{33,54}},'skin','skinDark')
rect(35,52,38,54,'skinLight')

layer('04 Outfit - crop top shorts boots')
poly({{27,39},{30,40},{35,40},{38,39},{40,42},{39,45},{28,45},{25,43}},'cloth','ink')
poly({{31,41},{35,40},{38,41},{39,43},{37,44},{30,44}},'charcoal')
rect(32,41,35,42,'darkMid');line(27,40,27,43,'clothLight')
line(28,45,38,45,'brass');line(29,46,38,46,'charcoal')
-- Bare midriff below crop top.
rect(30,47,37,48,'skinLight');dot(35,48,'skinShadow')
poly({{28,49},{38,49},{40,51},{39,53},{35,54},{32,52},{30,54},{24,53},{25,51}},'charcoal','ink')
poly({{27,50},{31,50},{30,52},{26,52}},'darkMid')
poly({{34,50},{37,50},{38,52},{35,52}},'darkMid')
line(25,53,29,54,'clothLight');line(35,54,39,53,'clothLight')
line(27,49,38,50,'leather');rect(32,49,33,50,'gold');dot(32,49,'goldLight')
-- Small flame-motif boots, baseline 61.
poly({{23,56},{29,56},{29,59},{30,60},{29,61},{21,61},{21,59},{23,58}},'charcoal','ink')
rect(24,57,27,58,'darkMid');line(23,56,28,56,'brass');line(22,60,28,60,'brass')
poly({{25,57},{25,58},{24,59},{26,59},{27,57},{27,59},{26,60},{23,60}},'flame')
poly({{34,56},{39,56},{39,58},{41,59},{42,60},{42,61},{34,61},{33,59}},'charcoal','ink')
rect(35,57,37,58,'darkMid');line(34,56,39,56,'brass');line(35,60,41,60,'brass')
poly({{38,57},{37,59},{39,59},{40,60},{37,60},{36,59}},'flame')

layer('05 Face')
poly({{28,24},{35,23},{41,25},{43,28},{43,33},{41,36},{38,38},{33,38},{29,36},{26,33},{26,28}},'skin','skinDark')
poly({{28,26},{34,24},{39,25},{41,28},{40,34},{38,36},{33,36},{29,34},{27,31}},'skinLight')
poly({{24,29},{26,29},{28,31},{27,34},{24,33},{23,31}},'skin','skinDark')
line(25,30,26,31,'skinLight');dot(25,32,'skinShadow')
poly({{41,30},{42,29},{42,33},{40,36},{38,37},{34,37},{33,36},{39,35}},'skin')

layer('06 Hair - chunky fringe and highlight band')
poly({{19,22},{23,19},{29,17},{33,17},{34,19},{30,23},{26,25},{23,27},{18,28},{20,25},{17,25}},'red')
poly({{20,22},{25,19},{30,18},{32,18},{29,20},{25,21},{23,23},{20,24},{18,24}},'hairLight')
poly({{23,21},{27,19},{30,19},{28,20},{25,21}},'hairShine')
poly({{28,22},{34,18},{38,18},{40,21},{38,24},{36,26},{35,29},{33,29},{34,25},{30,27},{28,30},{27,34},{25,33},{24,29},{25,26}},'red','hairShadow')
poly({{29,23},{33,20},{36,19},{37,20},{34,22},{32,25},{29,27},{27,30},{27,27}},'hairLight')
poly({{29,23},{32,21},{35,20},{34,22},{31,23}},'hairShine')
poly({{39,20},{42,20},{44,23},{44,28},{42,31},{40,32},{40,29},{41,26},{40,24},{38,25}},'red','hairShadow')
poly({{40,21},{42,22},{43,25},{42,27},{41,25}},'hairLight')
poly({{20,29},{23,27},{23,32},{22,34},{21,32}},'red')
line(21,29,21,31,'hairLight')
line(44,29,44,32,'red');line(42,34,43,33,'red')

layer('07 Accessories - horns brass bracers')
poly({{23,19},{23,16},{25,13},{27,12},{26,15},{27,18},{26,20}},'charcoal','ink')
poly({{24,16},{26,13},{25,16},{26,18},{24,18}},'darkLight')
line(24,19,26,19,'brass')
poly({{40,18},{41,15},{42,14},{42,17},{43,19},{42,21},{40,20}},'charcoal','ink')
line(41,17,41,19,'darkLight');line(41,20,42,20,'brass')
-- Left arm band.
line(18,42,22,43,'charcoal');line(18,41,19,41,'brass');dot(20,42,'gold')
-- Big near leather/brass bracer and short glove.
poly({{17,45},{20,44},{23,46},{24,49},{21,51},{18,50},{16,48}},'charcoal','ink')
poly({{18,45},{20,45},{22,47},{22,49},{20,50},{18,48}},'brass','brassDark')
line(18,46,18,47,'goldLight');line(19,46,20,46,'gold')
poly({{19,47},{20,46},{21,48},{20,49},{19,48}},'gold')
poly({{23,48},{25,47},{27,48},{27,50},{25,51},{22,51},{21,50}},'darkMid','ink')
line(25,48,26,48,'skinLight');line(25,49,26,49,'skin')
-- Far bracer and hand on hip.
poly({{43,46},{46,46},{46,49},{43,51},{40,50},{40,48}},'charcoal','ink')
poly({{44,47},{45,47},{45,49},{43,50},{42,48}},'brass')
line(43,47,44,47,'goldLight');dot(43,48,'gold')
line(40,48,41,49,'skinLight');dot(40,49,'skin')
-- Neck clasp and short tassel.
rect(29,39,30,40,'charcoal');dot(30,39,'gold');line(30,40,34,41,'brass')
rect(36,41,36,43,'gold');dot(36,41,'goldLight')

layer('08 Expression - amber eyes scar grin')
-- Deliberate three-pixel-high wide-set eyes; lids follow slight head tilt.
line(29,29,32,29,'hairDark');dot(29,30,'eyeDark')
rect(30,30,32,32,'white');rect(31,30,32,32,'amber');dot(31,30,'white');line(32,30,32,31,'eyeDark');dot(31,32,'amberLight')
line(38,30,40,30,'hairDark')
rect(38,31,40,33,'white');rect(39,31,40,33,'amber');dot(39,31,'white');line(40,31,40,32,'eyeDark');dot(39,33,'amberLight')
-- Two-pixel scar, small blush, compact toothy grin.
dot(28,33,'blush');dot(29,34,'skinDark');dot(28,35,'skinDark')
dot(41,34,'blush');dot(35,33,'skinShadow')
line(34,36,36,36,'eyeDark');line(34,35,36,35,'white');dot(33,35,'eyeDark');dot(37,35,'eyeDark')

spr:saveAs('base.aseprite')
spr:saveCopyAs('base.png')
print('Built base.aseprite and base.png; 8 native pixel layers.')
