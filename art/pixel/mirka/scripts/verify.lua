-- Verification and nearest-neighbour previews, entirely through Aseprite Lua.
local root=app.params['root'] or '.'
local function path(s)return root..'/'..s end
local s=app.open(path('base.aseprite'))
local im=Image{fromFile=path('base.png')}
local rgba=app.pixelColor.rgba
local alpha=app.pixelColor.rgbaA
local checks={};local function check(ok,msg) checks[#checks+1]=(ok and 'PASS: ' or 'FAIL: ')..msg;return ok end
local passed=true
local function test(ok,msg) if not check(ok,msg) then passed=false end end
test(s.width==64 and s.height==64 and im.width==64 and im.height==64,'Native document and PNG are exactly 64x64')
test(#s.frames==1,'Exactly one idle frame')
local colors,alphas,opaque={},{},{}
local x0,y0,x1,y1=64,64,-1,-1
local count=0
for y=0,63 do for x=0,63 do local p=im:getPixel(x,y);local a=alpha(p);alphas[a]=true
 if a>0 then
  colors[p]=true;opaque[y*64+x]=true;count=count+1
  x0=math.min(x0,x);y0=math.min(y0,y);x1=math.max(x1,x);y1=math.max(y1,y)
 end
end end
local nc=0;for _ in pairs(colors)do nc=nc+1 end
local binary=true;for a in pairs(alphas)do if a~=0 and a~=255 then binary=false end end
test(binary and alphas[0] and alphas[255],'Alpha values are only 0 and 255; transparent background present')
test(nc<=32,'Opaque colour count '..nc..'; total RGBA colours including transparency '..(nc+1))
test(x0>0 and y0>0 and x1<63 and y1<=62,'Whole silhouette contained in canvas; bbox inclusive ('..x0..','..y0..')-('..x1..','..y1..')')
test(y1==62,'Foot baseline y=62')
local runs={};local begin=nil
for x=0,64 do local yes=x<64 and opaque[62*64+x]
 if yes and not begin then begin=x end
 if not yes and begin then runs[#runs+1]={begin,x-1};begin=nil end
end
test(#runs==2,'Two separated boot soles share the baseline ('..#runs..' runs)')
-- 8-connected components detect isolated debris without misclassifying diagonal outlines.
local seen,components={},{}
for key in pairs(opaque) do if not seen[key] then
 local queue={key};seen[key]=true;local n=0;local h=1
 while h<=#queue do local q=queue[h];h=h+1;n=n+1;local x=q%64;local y=math.floor(q/64)
  for dy=-1,1 do for dx=-1,1 do local xx,yy=x+dx,y+dy
   local k=yy*64+xx
   if xx>=0 and xx<64 and yy>=0 and yy<64 and opaque[k] and not seen[k] then seen[k]=true;queue[#queue+1]=k end
  end end
 end
 components[#components+1]=n
end end
table.sort(components)
test(#components==1,'Single connected silhouette; component sizes '..table.concat(components,',')..'; no isolated stray pixels')
local flat=Image(64,64,ColorMode.RGB);flat:drawSprite(s,1)
local equal=true
for y=0,63 do for x=0,63 do if flat:getPixel(x,y)~=im:getPixel(x,y) then equal=false end end end
test(equal,'Flattened native document exactly matches base.png')
local bg=rgba(157,157,157,255)
local preview=Image(512,512,ColorMode.RGB)
for y=0,511 do for x=0,511 do local p=im:getPixel(math.floor(x/8),math.floor(y/8));preview:drawPixel(x,y,alpha(p)==0 and bg or p) end end
preview:saveAs(path('preview_8x.png'))
local source=Image{fromFile=path('source.png')}
local compare=Image(880,544,ColorMode.RGB)
for y=0,543 do for x=0,879 do compare:drawPixel(x,y,bg) end end
local sw=math.floor(source.width*512/source.height)
for y=0,511 do for x=0,sw-1 do compare:drawPixel(8+x,16+y,source:getPixel(math.floor(x*source.width/sw),math.floor(y*source.height/512))) end end
compare:drawImage(preview,Point(360,16))
compare:saveAs(path('compare.png'))
local f=io.open(path('verification.txt'),'w')
f:write('MIRKA / native 64x64 idle base sprite\n')
f:write(table.concat(checks,'\n')..'\n')
f:write('Opaque pixels: '..count..'\nLayers: '..#s.layers..'\n')
f:write('Visual intent: petite 3/4 right-facing character; no soccer ball; simplified knot clasps, split jacket panels, striped socks and tail.\n')
f:write('Known limitations: single idle frame only; tiny fang is one pixel; decorative embroidery simplified. Relative height cannot be compared without other team sprites.\n')
f:write('RESULT: '..(passed and 'PASS' or 'FAIL')..'\n');f:close()
print(table.concat(checks,'\n'));assert(passed,'Verification failed')
