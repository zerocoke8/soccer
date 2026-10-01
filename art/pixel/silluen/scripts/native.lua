-- All artwork is redrawn as integer pixel clusters from the draft/reference.
local root=app.params['root'] or '.'
local pc=app.pixelColor
local desired={
 {57,57,49},{78,81,68},{98,108,88},{125,137,112},
 {124,125,110},{155,156,139},{182,184,165},{207,207,189},{226,224,207},
 {132,99,80},{179,140,117},{214,177,151},{239,207,182},
 {135,114,78},{172,148,105},{198,176,133},
 {146,142,126},{187,182,164},{221,215,196},{242,234,215},
 {68,84,84},{106,126,126},{94,108,77},
}
-- Snap the design swatches to exact RGB samples in the original illustration.
local src=Image{fromFile=root..'/source.png'}
local pal=Palette(#desired+1);pal:setColor(0,Color{r=0,g=0,b=0,a=0})
local C,samples={},{}
for i,want in ipairs(desired) do
 local best,bd,bx,by=nil,math.huge,0,0
 for y=0,src.height-1,3 do for x=0,src.width-1,3 do
  local p=src:getPixel(x,y)
  local r,g,b=pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p)
  local d=(r-want[1])^2+(g-want[2])^2+(b-want[3])^2
  if d<bd then best,bd,bx,by=p,d,x,y end
 end end
 C[i]=pc.rgba(pc.rgbaR(best),pc.rgbaG(best),pc.rgbaB(best),255)
 pal:setColor(i,Color{r=pc.rgbaR(best),g=pc.rgbaG(best),b=pc.rgbaB(best),a=255})
 samples[i]={bx,by}
end
local O,G0,G1,G2,H0,H1,H2,H3,H4,S0,S1,S2,S3,B0,B1,B2,I0,I1,I2,I3,T0,T1,L=table.unpack(C)
local spr=Sprite(64,64,ColorMode.RGB);spr:setPalette(pal)
local first=true;local im
local function layer(name)
 local l
 if first then l=spr.layers[1];first=false else l=spr:newLayer() end
 l.name=name;local img=Image(64,64,ColorMode.RGB)
 if #l.cels>0 then l.cels[1].image=img else spr:newCel(l,1,img) end
 im=l.cels[1].image
end
local function dot(x,y,c) if x>=0 and x<64 and y>=0 and y<64 then im:drawPixel(x,y,c) end end
local function rect(x,y,w,h,c) for yy=y,y+h-1 do for xx=x,x+w-1 do dot(xx,yy,c) end end end
local function line(x0,y0,x1,y1,c)
 local dx,dy=math.abs(x1-x0),-math.abs(y1-y0)
 local sx,sy=x0<x1 and 1 or -1,y0<y1 and 1 or -1;local err=dx+dy
 while true do
  dot(x0,y0,c);if x0==x1 and y0==y1 then break end
  local e=2*err;if e>=dy then err=err+dy;x0=x0+sx end
  if e<=dx then err=err+dx;y0=y0+sy end
 end
end
local function poly(v,c,outline)
 local ymin,ymax=63,0
 for _,p in ipairs(v) do ymin=math.min(ymin,p[2]);ymax=math.max(ymax,p[2]) end
 for y=ymin,ymax do
  local xs={}
  for i,a in ipairs(v) do local b=v[i%#v+1]
   if (a[2]<=y and b[2]>y) or (b[2]<=y and a[2]>y) then xs[#xs+1]=a[1]+(y-a[2])*(b[1]-a[1])/(b[2]-a[2]) end
  end
  table.sort(xs)
  for i=1,#xs-1,2 do for x=math.ceil(xs[i]),math.floor(xs[i+1]) do dot(x,y,c) end end
 end
 for i,a in ipairs(v) do local b=v[i%#v+1];line(a[1],a[2],b[1],b[2],outline or c) end
end
layer('01 Hair - long calm silver-sage')
poly({{29,8},{37,9},{37,23},{34,31},{33,42},{30,53},{27,56},{21,56},{17,53},{16,47},{18,38},{21,30},{23,18}},H1,O)
poly({{26,17},{30,18},{28,31},{25,42},{24,52},{26,55},{21,53},{20,48},{22,36}},H3)
poly({{29,19},{32,19},{31,33},{28,43},{27,52},{29,53},{31,45},{32,31}},H2)
line(24,22,23,32,H4);line(23,32,20,43,H4);line(20,43,19,49,H3)
line(18,47,19,52,H0);line(19,52,22,54,H0)
line(27,29,24,42,H1);line(24,42,24,50,H1);line(29,39,28,49,H0)
layer('02 Far arm and hanging panel')
poly({{40,28},{43,30},{44,35},{47,39},{47,42},{45,43},{42,38},{40,34}},I1,O)
poly({{42,32},{43,35},{46,39},{44,40},{41,36}},I2)
line(44,39,47,40,B1)
poly({{45,41},{47,40},{49,44},{48,46},{46,45}},G0,O)
rect(47,44,1,2,S2);dot(48,44,S3)
poly({{35,39},{39,40},{39,51},{37,57},{34,56},{34,46}},G1,O)
line(37,44,37,54,B1);line(36,47,37,48,B1);line(38,50,37,51,B1);line(35,55,37,56,B2)
layer('03 Legs - thigh highs and soccer boots')
poly({{29,41},{34,42},{34,48},{33,53},{33,58},{30,59},{28,55},{28,48}},S2,O)
rect(29,44,4,4,S3);line(29,47,33,47,G0)
poly({{29,48},{33,48},{32,54},{33,58},{30,59},{29,56}},I2)
line(29,49,32,49,G2);line(29,51,29,55,I1)
poly({{29,58},{32,58},{33,59},{35,60},{35,62},{29,62},{28,60}},G0,O)
poly({{30,58},{31,58},{32,60},{34,60},{34,61},{30,61}},I2)
line(30,59,32,60,B1);dot(29,62,B0);dot(34,62,B0)
poly({{37,41},{42,42},{43,47},{42,53},{42,58},{38,59},{37,54},{37,49},{35,45}},S2,O)
poly({{38,43},{41,43},{42,46},{41,48},{38,48},{37,45}},S3)
line(37,47,42,46,G0)
poly({{38,49},{42,48},{41,54},{42,58},{38,59},{38,54}},I2)
line(38,49,42,48,G2);line(39,50,41,50,I3);line(41,52,40,57,I3);line(38,52,38,56,I1)
poly({{38,58},{42,58},{43,59},{47,60},{48,61},{48,62},{38,62},{37,60}},G0,O)
poly({{39,59},{41,59},{43,60},{46,60},{47,61},{41,61},{39,60}},I2)
line(39,58,40,60,B1);dot(42,60,B1);dot(39,62,B0);dot(46,62,B0)
layer('04 Curved ivory bodice and moss shorts')
poly({{32,23},{37,23},{39,26},{42,27},{44,30},{43,32},{40,33},{39,35},{41,38},{42,41},{40,44},{36,45},{32,43},{30,40},{32,35},{30,30}},G0,O)
poly({{34,25},{38,25},{39,27},{42,28},{43,30},{41,32},{35,32},{33,29}},I2)
poly({{36,27},{39,27},{41,28},{42,30},{37,30}},I3);line(35,32,40,32,I1)
poly({{35,33},{38,33},{38,35},{39,36},{36,36}},I2);rect(32,34,2,2,S2)
poly({{34,38},{39,38},{41,40},{40,43},{37,44},{34,42}},G1)
poly({{31,39},{34,38},{35,42},{33,43},{31,41}},G2);line(36,41,37,43,G0);line(33,26,32,32,G2)
line(39,29,38,31,L);dot(37,29,L);dot(40,30,L)
rect(35,26,2,2,B0);dot(36,26,B2);line(36,28,36,30,T0);dot(37,29,T1)
poly({{31,36},{35,36},{40,37},{41,38},{35,38},{31,37}},O)
line(32,37,39,38,B1);rect(35,36,3,3,B0);rect(36,37,1,1,I2);dot(39,38,B2)
layer('05 Long ivory side panel - leaf embroidery')
poly({{31,38},{34,39},{31,44},{30,50},{29,56},{27,59},{23,57},{23,53},{26,47},{28,41}},I2,O)
poly({{30,40},{31,41},{28,48},{27,54},{26,57},{24,56},{26,49}},I3)
poly({{31,45},{30,52},{28,57},{27,58},{27,53},{29,46}},G1)
line(32,40,30,46,B1);line(30,46,29,53,B1);line(29,53,27,57,B1);line(24,56,27,58,B2)
line(26,50,26,55,L);line(26,52,24,51,L);dot(24,50,L);line(26,54,28,52,L);dot(28,51,L)
line(27,46,29,43,B1);dot(28,43,B2);rect(29,41,1,3,T0);rect(30,43,1,2,T1)
layer('06 Near arm - sleeve cuff and glove')
poly({{29,25},{32,25},{34,27},{34,29},{32,32},{31,34},{27,33},{26,29},{27,26}},S2,O)
poly({{28,26},{31,26},{33,28},{32,30},{28,30},{27,28}},S3)
line(27,30,32,31,G0);line(27,31,31,32,G1);dot(29,31,B1)
poly({{27,32},{31,33},{32,36},{30,39},{30,42},{27,44},{24,42},{25,37}},I2,O)
poly({{27,33},{29,34},{29,38},{27,41},{25,41},{26,37}},I3)
line(29,35,29,38,I1);dot(28,36,B1);dot(27,37,B1)
line(25,41,28,42,G1);line(25,42,28,43,B1)
poly({{27,43},{29,43},{30,45},{29,47},{27,47},{26,45}},G0,O)
line(28,44,29,45,B1);rect(28,46,1,2,S2);dot(29,46,S3)
layer('07 Face - calm right profile and long elf ear')
poly({{31,8},{38,7},{42,9},{43,12},{43,16},{44,17},{43,18},{43,20},{41,22},{38,23},{36,22},{35,24},{32,23},{33,20},{30,17}},S2,O)
poly({{34,10},{39,9},{41,11},{42,14},{42,17},{44,17},{42,19},{42,20},{40,21},{37,21},{34,18}},S3)
line(36,21,38,22,S1);rect(34,21,2,2,S2)
poly({{21,12},{27,13},{32,14},{33,17},{30,18},{25,16}},S2,O)
line(23,13,30,15,S3);line(26,15,30,16,S1);dot(31,16,S2)
line(38,13,41,13,H0);line(38,15,41,15,O);dot(37,14,O)
rect(39,16,2,1,I3);dot(41,16,G1);dot(41,17,G2)
line(41,20,42,20,S0);dot(43,19,S1)
poly({{33,23},{36,23},{37,24},{38,24},{38,25},{33,25}},G0,O)
rect(35,23,1,2,B1);dot(36,25,B2)
layer('08 Crown bangs and silver face framing locks')
poly({{26,10},{26,7},{28,5},{31,3},{37,3},{41,5},{43,7},{44,10},{44,14},{43,16},{41,15},{41,11},{39,9},{37,12},{34,14},{33,19},{34,24},{32,23},{30,19},{30,15},{28,13}},H2,O)
poly({{28,8},{31,5},{36,4},{39,5},{36,7},{33,9},{31,12},{29,12}},H3)
poly({{31,6},{34,4},{37,4},{34,6}},H4)
poly({{37,6},{40,6},{42,8},{42,12},{41,12},{40,9},{38,8},{36,11},{34,12}},H3)
poly({{32,10},{35,7},{36,7},{34,10},{32,14},{32,20},{33,22},{31,20},{31,15}},H3)
line(30,13,30,18,H0);line(31,19,32,21,H1);line(40,7,42,10,H4);line(43,10,43,14,H1)
line(38,7,36,10,H1);dot(35,11,H1)
poly({{33,20},{34,22},{34,26},{35,28},{34,30},{33,27},{32,24}},H2);line(33,23,33,26,H3)
layer('09 Leaf ornament and earring')
poly({{28,9},{25,8},{24,5},{27,6}},L,O);line(25,6,27,8,G2)
poly({{27,7},{27,4},{29,2},{30,2},{29,5}},L,O);line(28,4,29,3,G2)
poly({{27,9},{24,9},{23,11},{26,11},{28,10}},L,O);line(24,10,26,10,G2)
rect(27,9,2,2,B0);dot(28,9,B2)
line(30,18,30,19,B1);dot(29,19,B2);rect(29,20,2,3,T0);line(30,20,30,22,T1)
-- Final readable eye over the fringe, preserving its right-facing direction.
dot(38,14,O);line(38,15,41,15,O)
dot(39,16,I3);dot(40,16,G1);dot(41,16,G0);dot(40,17,G2)
dot(41,19,S2);dot(42,19,S1);dot(41,20,S0)
spr:saveAs(root..'/base.aseprite');spr:saveCopyAs(root..'/base.png')
local f=io.open(root..'/scripts/palette_source.txt','w')
f:write('Opaque design colours sampled from source.png. Zero-based x,y.\n')
for i,c in ipairs(C) do f:write(string.format('%02d #%02X%02X%02X source (%d,%d)\n',i,pc.rgbaR(c),pc.rgbaG(c),pc.rgbaB(c),samples[i][1],samples[i][2])) end
f:close();print('Built layered one-frame 64x64 Silluen in Aseprite.')
