-- Mirka: native-grid cleanup traced from the sampled imagegen draft.
-- All geometry is integer native pixels. No resampling in the final artwork.
local pc=app.pixelColor
local hex=dofile('scripts/palette.lua')
local C={}
local alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabc'
for i,h in ipairs(hex) do C[alphabet:sub(i,i)]=pc.rgba(tonumber(h:sub(1,2),16),tonumber(h:sub(3,4),16),tonumber(h:sub(5,6),16),255) end
local s=Sprite(64,64,ColorMode.RGB)
s:deleteLayer(s.layers[1])
local im
local function layer(name)
 local l=s:newLayer() l.name=name
 im=Image(64,64,ColorMode.RGB)
 s:newCel(l,1,im,Point(0,0))
 im=l:cel(1).image
 return l
end
local function p(x,y,c) im:putPixel(x,y,C[c] or 0) end
local function rect(x,y,w,h,c) for yy=y,y+h-1 do for xx=x,x+w-1 do p(xx,yy,c) end end end
local function line(x0,y0,x1,y1,c)
 local dx,dy=math.abs(x1-x0),-math.abs(y1-y0)
 local sx,sy=x0<x1 and 1 or -1,y0<y1 and 1 or -1
 local e=dx+dy
 while true do p(x0,y0,c) if x0==x1 and y0==y1 then break end
 local e2=2*e if e2>=dy then e=e+dy x0=x0+sx end if e2<=dx then e=e+dx y0=y0+sy end end
end
local function poly(v,c)
 local minx,miny,maxx,maxy=63,63,0,0
 for _,q in ipairs(v) do minx=math.min(minx,q[1]) miny=math.min(miny,q[2]) maxx=math.max(maxx,q[1]) maxy=math.max(maxy,q[2]) end
 for y=miny,maxy do for x=minx,maxx do
  local inside=false local j=#v
  for i=1,#v do
   local a,b=v[i],v[j]
   if ((a[2]>y)~=(b[2]>y)) and x<(b[1]-a[1])*(y-a[2])/(b[2]-a[2])+a[1] then inside=not inside end
   j=i
  end
  if inside then p(x,y,c) end
 end end
 for i,a in ipairs(v) do local b=v[i%#v+1] line(a[1],a[2],b[1],b[2],c) end
end
local function shape(v,fill,edge)
 poly(v,fill)
 for i,a in ipairs(v) do local b=v[i%#v+1] line(a[1],a[2],b[1],b[2],edge) end
end

local ref=layer('Draft sample - hidden construction reference')
im:drawImage(Image{fromFile='scripts/sampled.png'}) ref.isVisible=false

layer('Striped tail')
shape({{27,46},{23,48},{19,47},{16,45},{15,43},{16,41},{18,42},{20,41},{20,39},{18,37},{15,37},{12,39},{11,42},{11,45},{13,48},{16,50},{21,51},{25,50},{28,48}},'D','B')
poly({{12,40},{14,38},{17,38},{15,40},{13,43},{12,43}},'E')
poly({{16,38},{18,38},{19,39},{19,41},{17,41},{16,40}},'G')
poly({{12,42},{14,41},{15,42},{14,45},{13,46},{12,45}},'G')
poly({{15,47},{17,46},{19,47},{18,50},{16,49}},'G')
poly({{22,48},{24,47},{25,48},{24,50},{22,50}},'G')
line(14,47,15,48,'E') line(19,50,21,50,'C') p(25,49,'C')

layer('Body and short legs')
shape({{29,38},{36,38},{39,42},{39,49},{38,53},{38,57},{40,59},{40,61},{35,61},{34,58},{34,53},{32,52},{32,57},{32,59},{33,61},{28,61},{27,59},{29,54},{28,49},{27,42}},'N','N')
rect(29,50,4,5,'S') rect(29,50,4,1,'R') rect(29,51,3,3,'T')
rect(35,51,3,4,'S') rect(35,51,2,3,'T')
rect(28,55,4,4,'O') rect(29,55,3,1,'E') rect(28,57,3,1,'E')
rect(35,55,4,4,'O') rect(35,55,3,1,'E') rect(35,57,3,1,'E')
rect(28,59,4,2,'G') rect(28,59,1,2,'I') rect(29,59,2,1,'b')
rect(35,59,4,2,'G') rect(35,59,1,2,'I') rect(36,59,2,1,'b')

layer('Cream mint jacket and plum outfit')
shape({{27,38},{31,39},{34,39},{38,39},{39,42},{42,44},{41,47},{40,48},{42,54},{40,56},{36,50},{29,50},{26,56},{23,54},{25,47},{23,45},{24,41}},'G','J')
poly({{26,40},{28,40},{27,44},{28,47},{25,53},{24,54},{24,50},{26,47}},'L')
rect(25,41,2,2,'M')
poly({{39,44},{41,45},{40,47},{40,49},{41,53},{40,54},{38,50},{38,46}},'L')
shape({{30,39},{34,40},{36,39},{38,42},{37,45},{39,49},{36,51},{33,50},{30,51},{28,49},{30,45}},'O','N')
poly({{31,40},{32,41},{33,44},{32,45},{31,44}},'Q')
rect(34,41,2,3,'P') rect(30,47,7,1,'P')
line(33,48,33,50,'N')
line(29,49,31,49,'G') line(35,50,37,50,'G')
poly({{28,39},{29,40},{29,45},{28,48},{26,53},{25,53},{27,47}},'G')
line(28,41,28,45,'H') line(26,49,25,52,'H')
poly({{36,40},{37,40},{38,43},{37,44},{38,47},{40,51},{40,53},{38,50},{36,46},{36,43}},'H')
line(37,42,37,44,'G') line(39,49,40,51,'G')
rect(29,45,9,2,'N') rect(33,45,2,2,'b') p(34,46,'N')
shape({{24,42},{27,43},{27,46},{25,47},{23,45}},'G','I')
rect(24,43,2,2,'G') p(25,45,'H')
shape({{39,43},{41,44},{41,46},{39,47},{38,45}},'G','I')
rect(39,44,2,1,'G')
rect(24,46,2,2,'R') rect(24,46,2,1,'T')
rect(39,46,2,2,'R') rect(39,46,2,1,'T')
line(24,51,23,55,'P') line(41,51,42,54,'P')
rect(27,41,1,3,'P') p(28,40,'b') p(37,41,'b')

layer('Cat ears and bob silhouette')
shape({{23,24},{24,20},{26,16},{28,12},{30,16},{32,20},{35,21},{38,22},{43,20},{48,19},{47,24},{45,28},{45,34},{46,36},{44,39},{41,40},{39,38},{26,38},{24,36},{22,37},{20,35},{19,32},{20,29},{21,26}},'D','A')
poly({{25,22},{26,19},{28,15},{30,20},{30,22}},'C')
poly({{26,22},{27,18},{28,20},{29,19},{30,22},{28,24}},'G')
p(27,22,'H') p(28,23,'H')
poly({{41,23},{46,21},{46,24},{44,27}},'C')
poly({{42,24},{46,22},{45,25},{44,26}},'G')
p(45,24,'H')
poly({{23,27},{24,25},{28,23},{34,23},{37,24},{29,25},{26,28},{24,32},{24,35},{22,34},{21,31}},'E')
poly({{21,32},{23,34},{24,32},{26,35},{27,38},{24,36},{22,36}},'C')
poly({{40,26},{43,28},{44,33},{45,35},{43,38},{41,39},{40,36}},'C')
line(43,32,42,36,'D') line(44,34,43,37,'E')

layer('Face - amber eyes and fang')
shape({{29,27},{34,26},{39,28},{41,31},{41,35},{39,38},{33,39},{29,37},{27,34},{27,31}},'S','R')
poly({{29,28},{34,27},{39,29},{40,32},{40,36},{38,38},{33,38},{29,36},{28,33}},'T')
rect(29,32,4,3,'Z') rect(37,32,3,3,'Z')
rect(30,32,2,3,'X') rect(38,32,1,3,'X')
p(30,34,'Y') p(38,34,'Y') p(30,32,'Z') p(38,32,'Z')
line(29,31,32,31,'N') p(28,30,'N') p(28,31,'N') p(32,32,'W')
line(37,31,40,31,'N') p(40,30,'N') p(37,32,'W')
rect(28,35,2,1,'U') rect(39,35,2,1,'U')
line(34,36,36,36,'V') p(37,35,'V') p(36,37,'V') p(35,37,'Z')

layer('Chunky bangs and hair highlights')
shape({{24,25},{26,23},{30,22},{34,22},{38,23},{41,25},{43,28},{43,32},{42,35},{40,37},{40,33},{40,29},{38,27},{37,30},{34,32},{33,32},{34,28},{32,29},{29,30},{28,33},{29,35},{27,35},{25,32},{25,28},{24,30},{23,32},{22,30}},'D','C')
poly({{25,25},{28,23},{32,23},{30,25},{28,28},{27,31},{26,32},{25,30}},'E')
poly({{31,25},{33,23},{36,23},{38,24},{37,26},{36,29},{34,30},{35,26},{33,27}},'E')
poly({{39,25},{40,26},{42,29},{42,32},{41,34},{41,29}},'E')
poly({{25,26},{27,25},{28,26},{29,26},{28,28},{26,28}},'F')
poly({{31,26},{32,26},{33,27},{35,27},{35,28},{32,28}},'F')
rect(38,27,2,1,'F') p(39,28,'F')
line(25,32,27,34,'D') line(29,24,28,25,'D')

layer('Gold hair clasp')
rect(22,24,2,2,'K') p(22,24,'M')
rect(22,26,4,3,'a') rect(23,25,2,5,'a')
rect(23,26,2,3,'b') rect(22,27,4,1,'b') p(24,27,'A') p(23,26,'c')
rect(23,30,1,2,'b') rect(22,32,2,3,'P') p(22,32,'Q')

layer('Final facial cleanup')
rect(34,35,4,3,'T')
line(35,36,37,36,'V') p(36,37,'Z')

local pal=Palette(#hex+1) pal:setColor(0,Color{r=0,g=0,b=0,a=0})
for i,h in ipairs(hex) do pal:setColor(i,Color{r=tonumber(h:sub(1,2),16),g=tonumber(h:sub(3,4),16),b=tonumber(h:sub(5,6),16),a=255}) end
s:setPalette(pal)
s:saveAs('base.aseprite')
local flat=Image(64,64,ColorMode.RGB) flat:drawSprite(s,1)
flat:saveAs('base.png')
local preview=Image(64,64,ColorMode.RGB) preview:clear(pc.rgba(128,128,128,255)) preview:drawImage(flat)
preview:resize{width=512,height=512} preview:saveAs('preview_8x.png')
print('Saved layered base.aseprite and native base.png')
