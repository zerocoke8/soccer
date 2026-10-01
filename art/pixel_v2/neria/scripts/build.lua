-- Reusable native construction, traced/simplified from the generated draft.
-- Aseprite -b --script scripts/build.lua
local pc=app.pixelColor
local defs=dofile('scripts/palette.lua')
local col={['.']=0}; local pal=Palette(#defs+1); pal:setColor(0,Color{r=0,g=0,b=0,a=0})
for i,v in ipairs(defs) do
  local r,g,b=(v[2]>>16)&255,(v[2]>>8)&255,v[2]&255
  col[v[1]]=pc.rgba(r,g,b,255);pal:setColor(i,Color{r=r,g=g,b=b,a=255})
end
local spr=Sprite(64,64,ColorMode.RGB);spr:setPalette(pal)
spr.layers[1].name='Draft - sampled guide (hidden)'
spr.cels[1].image=Image{fromFile='scripts/draft_sampled.png'}
spr.layers[1].isVisible=false
local im
local function layer(name)
  local l=spr:newLayer();l.name=name;im=Image(64,64,ColorMode.RGB);spr:newCel(l,1,im,Point(0,0));im=spr.cels[#spr.cels].image
  return l
end
local function px(x,y,k) im:drawPixel(x,y,col[k]) end
local function rect(x,y,w,h,k) for yy=y,y+h-1 do for xx=x,x+w-1 do px(xx,yy,k) end end end
local function line(x0,y0,x1,y1,k)
  local dx,dy=math.abs(x1-x0),-math.abs(y1-y0);local sx=x0<x1 and 1 or -1;local sy=y0<y1 and 1 or -1;local err=dx+dy
  while true do px(x0,y0,k);if x0==x1 and y0==y1 then break end;local e2=2*err;if e2>=dy then err=err+dy;x0=x0+sx end;if e2<=dx then err=err+dx;y0=y0+sy end end
end
local function poly(points,k)
  local lo,hi=64,0;for _,p in ipairs(points) do lo=math.min(lo,p[2]);hi=math.max(hi,p[2]) end
  for y=lo,hi do
    local xs={}
    for i,a in ipairs(points) do local b=points[i%#points+1]
      if (a[2]<=y and b[2]>y) or (b[2]<=y and a[2]>y) then xs[#xs+1]=a[1]+(y-a[2])/(b[2]-a[2])*(b[1]-a[1]) end
    end
    table.sort(xs);for i=1,#xs-1,2 do for x=math.ceil(xs[i]),math.floor(xs[i+1]) do px(x,y,k) end end
  end
  for i,a in ipairs(points) do local b=points[i%#points+1];line(a[1],a[2],b[1],b[2],k) end
end
local function stamp(x,y,rows)
  for yy,row in ipairs(rows) do for xx=1,#row do local k=row:sub(xx,xx);if k~=' ' then px(x+xx-1,y+yy-1,k) end end end
end

-- Hair curtain: broad continuous planes, straight sides and chunky aqua tips.
layer('Hair - long back and aqua tips')
poly({{24,24},{43,24},{46,31},{46,43},{48,52},{47,56},{44,57},{41,54},{25,55},{22,57},{19,55},{18,51},{20,43},{21,33}},'H')
poly({{24,25},{31,27},{29,45},{26,54},{22,56},{20,53},{21,43},{22,33}},'M')
poly({{24,28},{27,28},{26,44},{23,53},{21,51},{22,40}},'W')
poly({{27,32},{30,30},{28,48},{25,54},{24,51},{26,42}},'S')
poly({{40,25},{43,27},{45,34},{45,45},{47,53},{45,56},{42,53},{40,41}},'S')
poly({{41,31},{43,31},{43,43},{46,52},{44,54},{42,48}},'M')
poly({{21,47},{23,46},{23,51},{25,49},{26,47},{26,53},{23,56},{20,53},{19,51}},'A')
poly({{21,47},{22,46},{21,51},{23,54},{21,53},{20,51}},'L')
poly({{25,49},{27,46},{27,51},{25,54},{24,54}},'T')
poly({{43,47},{44,46},{45,51},{46,51},{46,55},{44,56},{42,52},{42,49}},'A')
line(43,49,44,53,'L');line(44,53,44,54,'L')

-- Small body and short legs; far leg shifted right for a three-quarter stance.
layer('Body - neck legs and shoes')
rect(32,34,7,5,'O');rect(33,34,5,3,'d');rect(34,35,4,2,'f')
poly({{29,48},{35,48},{34,55},{33,58},{28,58},{28,54}},'O')
rect(29,50,5,4,'d');rect(30,50,4,3,'f')
poly({{37,48},{42,49},{42,57},{40,59},{36,58},{36,55}},'O')
rect(37,51,4,4,'f');rect(40,51,1,4,'d')
stamp(28,54,{'ONNNNO','OMWWNO','OMWBDO','OMWWDO','OMMNOO'})
stamp(36,55,{'ONNNNO','OVWWNO','OVWBNO','OMWWNO'})
stamp(27,58,{' ODDD  ','ONWWWO ','ONMWWWO',' OOOOOO '})
stamp(36,58,{' ODDD   ','ODMWMO  ','ONMWWWOO',' OOOOOOO'})

layer('Outfit - high collar jersey and shorts')
poly({{30,36},{33,37},{38,36},{41,38},{42,44},{40,48},{29,48},{27,42},{28,38}},'O')
poly({{29,38},{32,38},{33,40},{38,39},{40,39},{40,45},{38,47},{30,46},{28,42}},'W')
poly({{29,39},{30,40},{30,44},{33,45},{39,44},{39,47},{30,47},{28,43}},'M')
poly({{37,39},{40,39},{40,44},{36,45},{34,43},{36,42},{38,42}},'B')
line(38,40,38,42,'C');rect(35,43,2,1,'C');px(37,44,'b')
stamp(32,36,{'ODDDDDO',' ONNDO ','  OOO  '})
rect(34,37,2,1,'G')
rect(29,47,12,2,'O');rect(30,47,9,1,'D');rect(36,47,2,1,'G')
poly({{29,49},{41,49},{41,52},{37,53},{35,51},{34,53},{28,53}},'O')
rect(29,49,5,3,'D');rect(30,49,3,1,'N');rect(37,49,3,3,'D');rect(37,49,2,1,'N')
line(30,52,33,52,'B');line(38,52,40,52,'B')

-- Face is kept broad and clean; warm skin separates pale hair from the jersey.
layer('Face - calm eyes and blush')
poly({{29,23},{39,23},{42,26},{44,29},{43,33},{40,36},{33,36},{29,34},{27,30},{27,27}},'s')
poly({{30,24},{39,24},{41,27},{43,29},{42,33},{39,35},{33,35},{29,33},{28,29}},'f')
poly({{31,25},{39,25},{40,28},{42,29},{41,33},{38,34},{33,34},{30,32}},'h')
stamp(25,28,{'ssd','sfh','sdf',' sd'})
-- Wide-set 3px high irises; dark top lids are calm, not angry.
stamp(30,27,{' oooo ','oWIeo ',' fiei ','  ee  '})
stamp(39,27,{' ooo','oIeo',' fie','  ee'})
rect(30,31,2,1,'r');rect(41,31,2,1,'r')
rect(36,33,2,1,'s');px(38,32,'d')

-- Crown and bangs follow the draft, but collapse fine strands into four tones.
layer('Hair - crown bangs and front locks')
poly({{28,12},{36,12},{36,13},{40,13},{40,14},{42,14},{42,16},{44,16},{44,18},{45,18},{45,22},{46,22},{46,29},{45,32},{43,34},{42,35},{41,33},{43,29},{42,24},{41,23},{39,25},{37,27},{34,28},{34,26},{31,27},{29,30},{29,35},{31,39},{30,41},{27,39},{25,35},{24,31},{23,28},{22,23},{22,18},{24,15},{26,14},{26,13},{28,13}},'H')
poly({{28,13},{36,13},{40,15},{42,17},{44,21},{44,27},{43,30},{41,31},{43,27},{41,21},{37,21},{32,24},{29,27},{28,31},{28,35},{30,39},{28,38},{26,34},{25,27},{23,23},{23,19},{25,16}},'M')
poly({{28,14},{35,14},{39,15},{41,17},{36,16},{32,17},{28,20},{25,25},{24,22},{24,19},{26,16}},'W')
poly({{33,17},{38,17},{40,18},{36,18},{32,20},{29,23},{27,27},{26,30},{26,25},{28,21}},'W')
poly({{35,19},{40,18},{41,20},{41,23},{39,25},{36,27},{36,25},{38,22},{36,23},{33,25},{30,26},{32,22}},'W')
poly({{39,20},{40,20},{39,23},{37,26},{35,27},{35,26},{37,24}},'S')
poly({{42,20},{43,22},{44,26},{43,29},{42,31},{41,32},{42,28}},'S')
line(42,23,42,26,'W')
poly({{25,25},{27,25},{27,33},{29,37},{29,39},{27,37},{26,34}},'W')
line(25,29,25,33,'S')
-- One clear highlight band on the lit crown; no scattered individual hairs.
line(27,17,29,15,'I');line(30,15,34,15,'I')
line(29,18,33,16,'I')

-- Final face pass after the fringe: preserve BOTH open eyes at native scale.
layer('Face - readable eye finish')
rect(30,28,5,4,'h');rect(39,28,3,4,'h')
stamp(31,28,{'oooo','WIeo','hieo',' hee'})
stamp(39,28,{'ooo','Ieo','ieo','eeh'})
rect(30,32,2,1,'r');rect(41,32,2,1,'r')
rect(35,33,4,1,'h');rect(36,34,2,1,'s')

layer('Accessories - blue flower and coral tassel')
stamp(20,17,{'    OO  ','   ONCO ',' OONIWO ','ONCONO  ','ONIWGNNO',' OOGWIWO','  ONNNO ','  OCO   ','  ONO   '})
rect(21,25,1,3,'O');rect(22,25,1,3,'B');rect(21,28,2,3,'b');px(21,28,'C');rect(21,31,2,1,'O')
rect(24,25,1,3,'D');rect(24,28,2,3,'B');px(24,28,'C');rect(24,31,2,1,'O')
rect(41,48,1,3,'g');rect(41,50,2,1,'G');rect(41,51,2,1,'c');rect(41,52,2,3,'p');rect(42,53,1,2,'c');rect(41,55,2,1,'O')

-- Keeper gloves: white finger blocks, cerulean padding, distinct thumb lobes.
layer('Gloves - oversized padded goalkeeper gloves')
stamp(23,40,{
 '  OOOO   ',
 ' ONNNOO  ',
 ' OWWMDO  ',
 'OWWWWNO  ',
 'OWCCWNOO ',
 'OWBBWMWO ',
 'OWCCWMWO ',
 ' OWWWWDO ',
 '  ONNDO  ',
 '   OOO   ',
})
stamp(40,41,{
 '  OOOO  ',
 '  ONNDO ',
 '  OWWWO ',
 ' OWMWWWO',
 'OWMBCWWO',
 'OWMBBWMO',
 ' ODMWWMO',
 '  ODMMO ',
 '   OOO  ',
})
px(26,43,'I');rect(25,47,3,1,'I');rect(44,44,2,1,'I')

spr:saveAs('base.aseprite')
print('Built native layered base.aseprite')
