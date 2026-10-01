-- Mirka: deliberately redrawn at native resolution from source.png and draft.png.
-- Run from project root with Aseprite -b --script scripts/build_base.lua
local root = app.params['root'] or '.'
local function path(s) return root .. '/' .. s end
local sprite = Sprite(64,64,ColorMode.RGB)
sprite.layers[1].name = 'Tail'
local target = {
 {'O',68,55,68}, {'D',85,72,86}, {'P',105,83,105}, {'Q',131,103,126},
 {'H',153,133,151}, {'I',179,157,173}, {'J',199,179,191},
 {'C',229,220,205}, {'B',205,193,179}, {'A',173,161,151},
 {'M',146,160,140}, {'N',116,133,115}, {'V',181,190,166},
 {'S',238,201,180}, {'T',211,170,152}, {'U',173,133,125},
 {'G',166,137,91}, {'F',199,170,120}, {'E',115,94,70},
 {'K',90,82,94}, {'L',118,105,120}, {'W',245,232,208},
 {'R',120,119,83}, {'Y',169,161,114}, {'Z',99,87,96}
}
-- Every swatch is an actual opaque RGB value sampled from the illustration.
local src = Image{fromFile=path('source.png')}
local rgba=app.pixelColor.rgba
local rr,gg,bb=app.pixelColor.rgbaR,app.pixelColor.rgbaG,app.pixelColor.rgbaB
local col, actual = {}, {}
for _,v in ipairs(target) do
 local best,dist=nil,math.huge
 for y=0,src.height-1,2 do for x=0,src.width-1,2 do
  local p=src:getPixel(x,y)
  local d=(rr(p)-v[2])^2+(gg(p)-v[3])^2+(bb(p)-v[4])^2
  if d<dist then dist=d;best=p end
 end end
 col[v[1]]=rgba(rr(best),gg(best),bb(best),255)
 actual[#actual+1]={v[1],rr(best),gg(best),bb(best)}
end
local palette=Palette(#target+1)
palette:setColor(0,Color{r=0,g=0,b=0,a=0})
for i,v in ipairs(actual) do palette:setColor(i,Color{r=v[2],g=v[3],b=v[4],a=255}) end
sprite:setPalette(palette)
local im
local function layer(name,first)
 local l=first and sprite.layers[1] or sprite:newLayer()
 l.name=name; im=Image(64,64,ColorMode.RGB);sprite:newCel(l,1,im,Point(0,0))
 -- newCel copies its image, so work on the cel image itself.
 im=l:cel(1).image
end
local function px(x,y,c) if x>=0 and x<64 and y>=0 and y<64 then im:drawPixel(x,y,col[c] or 0) end end
local function line(x0,y0,x1,y1,c)
 local dx,dy=math.abs(x1-x0),-math.abs(y1-y0)
 local sx,sy=x0<x1 and 1 or -1,y0<y1 and 1 or -1
 local e=dx+dy
 while true do
  px(x0,y0,c);if x0==x1 and y0==y1 then break end
  local e2=2*e;if e2>=dy then e=e+dy;x0=x0+sx end
  if e2<=dx then e=e+dx;y0=y0+sy end
 end
end
local function rect(x,y,w,h,c) for yy=y,y+h-1 do for xx=x,x+w-1 do px(xx,yy,c) end end end
local function poly(points,c,outline)
 local minx,miny,maxx,maxy=64,64,0,0
 for _,p in ipairs(points) do minx=math.min(minx,p[1]);maxx=math.max(maxx,p[1]);miny=math.min(miny,p[2]);maxy=math.max(maxy,p[2]) end
 for y=miny,maxy do for x=minx,maxx do
  local inside=false;local j=#points
  for i=1,#points do
   local a,b=points[i],points[j]
   if ((a[2]>y)~=(b[2]>y)) and x<(b[1]-a[1])*(y-a[2])/(b[2]-a[2])+a[1] then inside=not inside end
   j=i
  end
  if inside then px(x,y,c) end
 end end
 for i,a in ipairs(points) do local b=points[i%#points+1];line(a[1],a[2],b[1],b[2],outline or c) end
end
layer('01 Tail',true)
poly({{32,43},{27,45},{20,45},{16,43},{13,40},{13,37},{15,35},{18,35},{20,37},{21,36},{21,33},{19,31},{15,30},{11,32},{8,36},{8,41},{10,45},{14,48},{20,50},{26,49},{32,46}},'H','O')
poly({{11,33},{14,31},{18,32},{19,34},{16,34},{13,36},{10,37}},'B')
poly({{9,39},{12,39},{14,43},{12,45},{10,43}},'C')
poly({{15,45},{18,46},{21,46},{20,49},{16,48},{14,47}},'C')
poly({{25,46},{29,44},{30,46},{26,48},{24,48}},'B')
line(9,37,9,40,'I');line(12,46,17,49,'H');line(18,32,20,34,'I')
layer('02 Far limbs')
-- Forward arm, clearly distinguished from the near sleeve.
poly({{40,35},{44,35},{47,39},{47,44},{44,46},{41,43}},'B','O')
rect(44,40,3,3,'C');rect(44,43,3,2,'N')
poly({{44,45},{47,45},{48,47},{46,49},{44,48}},'T','O');line(45,46,46,46,'S')
-- Far leg and boot: same y62 baseline as the near boot.
poly({{39,46},{44,46},{44,51},{43,55},{44,58},{47,59},{49,61},{49,62},{40,62},{39,60},{39,56},{38,52}},'T','O')
poly({{39,51},{44,51},{43,57},{44,59},{40,59},{39,56}},'K','O')
line(40,52,43,52,'B');line(40,54,42,54,'A')
poly({{40,58},{44,58},{45,59},{47,59},{48,61},{40,61}},'B','O')
line(42,59,44,59,'N');line(43,60,47,60,'C');line(40,62,49,62,'O')
layer('03 Jacket and body')
-- Split jacket tails retain plum and sage panels without hiding the leg gap.
poly({{30,42},{35,44},{33,49},{29,54},{25,53},{27,47}},'P','O')
poly({{30,44},{32,45},{30,50},{27,52},{27,49}},'M')
line(29,47,30,47,'C');line(28,48,29,49,'C')
rect(26,53,2,3,'P');line(27,53,27,54,'G')
poly({{41,42},{44,43},{46,50},{45,54},{42,52},{40,47}},'M','O')
line(44,47,45,51,'C');rect(44,53,2,3,'P');px(44,53,'G')
poly({{33,32},{39,32},{42,35},{43,41},{42,46},{34,47},{30,43},{30,36}},'K','O')
poly({{32,34},{35,34},{35,41},{33,45},{30,43},{30,37}},'C')
poly({{40,34},{42,36},{42,41},{41,44},{39,44},{40,40}},'C')
line(37,35,38,39,'L');line(39,36,40,40,'D')
-- High cream collar with muted sage lining.
poly({{30,32},{35,32},{38,34},{35,36},{31,35}},'C','O')
line(31,33,34,33,'N');line(35,34,36,34,'M')
line(37,33,40,34,'D');px(39,34,'G')
-- Belt with antique gold buckle, and asymmetric cream hem.
line(34,41,42,41,'O');line(34,42,42,42,'D')
rect(39,41,3,2,'G');px(40,41,'O')
poly({{34,43},{36,43},{37,46},{33,48},{31,47}},'C','O')
line(33,45,35,45,'B')
-- Shorts, with the trouser-leg seam kept clear.
poly({{35,44},{40,44},{43,45},{43,48},{40,50},{37,48},{34,49},{32,47}},'K','O')
line(38,46,38,48,'O');line(33,48,36,49,'B');line(40,49,42,48,'B')
layer('04 Near leg')
poly({{33,48},{37,49},{37,52},{35,55},{35,58},{37,60},{38,62},{28,62},{27,60},{29,57},{30,53},{30,50}},'S','O')
line(31,51,31,53,'T')
poly({{30,53},{35,54},{35,57},{34,59},{29,59},{28,58}},'K','O')
line(30,54,34,55,'B');line(29,56,34,57,'B')
poly({{29,58},{34,59},{34,60},{37,60},{38,61},{37,62},{28,62},{27,61},{27,60}},'C','O')
line(29,59,32,59,'N');line(30,60,33,60,'M');line(29,61,35,61,'C');px(28,60,'G')
layer('05 Near sleeve and ornaments')
poly({{30,35},{33,35},{35,38},{35,43},{33,46},{29,45},{27,42},{27,38}},'C','O')
poly({{28,38},{30,37},{31,39},{30,41},{28,41}},'M')
line(29,38,30,38,'V');line(31,37,33,39,'B');line(32,41,34,40,'B')
poly({{28,42},{30,43},{34,42},{33,45},{30,45}},'M')
line(30,44,32,44,'N')
poly({{32,46},{34,45},{36,46},{36,48},{34,49},{32,48}},'S','O');line(34,46,35,47,'T')
-- Gold knot with a compact plum tassel: the main costume signature.
rect(29,36,3,3,'E');px(30,36,'F');px(29,37,'G');px(31,37,'G');px(30,38,'G');px(30,37,'O')
rect(29,39,2,3,'P');line(29,39,29,41,'Q')
line(33,36,35,40,'P');px(34,39,'G')
layer('06 Ears and bob')
-- Native 20px head, with ears safely below the top margin.
poly({{28,22},{27,10},{29,8},{35,18},{37,21}},'H','O')
poly({{29,12},{30,12},{33,18},{30,20}},'B')
poly({{30,15},{32,18},{30,19}},'C')
poly({{39,18},{47,12},{48,12},{46,23},{41,25}},'H','O')
poly({{43,18},{46,15},{45,21},{42,22}},'C')
poly({{29,18},{34,16},{40,17},{44,19},{46,23},{46,28},{43,33},{36,35},{29,32},{26,29},{25,24}},'I','O')
poly({{27,24},{29,21},{29,29},{32,32},{30,32},{27,29}},'H')
line(27,25,27,28,'J');line(29,29,29,31,'D')
layer('07 Face and fringe')
-- Rightward nose silhouette, half-lidded olive eye and a one-pixel fang.
poly({{36,22},{41,21},{44,23},{45,26},{48,28},{47,29},{46,29},{46,31},{43,33},{39,33},{36,31},{34,27}},'S','O')
line(38,31,40,32,'T');line(40,33,43,33,'T');px(47,28,'S');px(46,28,'S')
poly({{34,19},{39,18},{43,20},{45,23},{44,26},{42,27},{42,24},{40,25},{39,24},{37,27},{36,30},{34,29},{33,25}},'I','H')
poly({{36,20},{39,19},{40,20},{37,23},{35,27},{34,25}},'J')
line(40,20,39,22,'H');line(43,21,44,24,'J')
-- Long side lock and small visible ear.
poly({{31,23},{34,22},{35,26},{34,30},{36,32},{34,33},{31,30}},'I','H')
line(32,24,32,28,'J');px(35,28,'T');px(35,29,'S')
-- Eye width 4 pixels, swept lid. Face aimed right.
line(41,26,44,27,'O');rect(42,27,2,2,'R');px(42,27,'Y');px(44,27,'O');px(43,29,'T')
line(43,31,45,30,'D');px(44,31,'W')
-- Nape silhouette and front-facing neck.
line(36,33,37,34,'H')
layer('08 Hair clasp')
rect(27,20,3,2,'N');px(27,20,'V')
px(29,19,'G');rect(29,20,3,3,'E');px(30,20,'F');px(29,21,'G');px(31,21,'G');px(30,22,'G');px(30,21,'O')
line(29,23,28,26,'P');line(30,23,29,26,'Q')
sprite:saveAs(path('base.aseprite'))
sprite:saveCopyAs(path('base.png'))
local f=io.open(path('scripts/palette.tsv'),'w');f:write('symbol\tr\tg\tb\n')
for _,v in ipairs(actual) do f:write(table.concat(v,'\t')..'\n') end;f:close()
print('Built base.aseprite and base.png; '..#target..' sampled opaque palette entries.')
