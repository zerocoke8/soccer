local root=app.params['root'] or '.'
local pc=app.pixelColor
local spr=app.open(root..'/base.aseprite')
local img=Image{fromFile=root..'/base.png'}
local report={}
local function check(ok,msg) report[#report+1]=(ok and 'PASS ' or 'FAIL ')..msg;assert(ok,msg) end
check(spr.width==64 and spr.height==64 and img.width==64 and img.height==64,'Canvas is exactly 64x64')
check(#spr.frames==1,'Exactly one animation frame')
local native=Image(spr.spec);native:drawSprite(spr,1)
local colors,alpha,occupied={},{},{}
local minx,miny,maxx,maxy=64,64,-1,-1
local count=0
for y=0,63 do for x=0,63 do
 local p=img:getPixel(x,y);local a=pc.rgbaA(p)
 alpha[a]=true
 check(p==native:getPixel(x,y),'')
 report[#report]=nil
 if a>0 then
  colors[p]=true;count=count+1;occupied[y*64+x]=true
  minx=math.min(minx,x);miny=math.min(miny,y);maxx=math.max(maxx,x);maxy=math.max(maxy,y)
 end
end end
check(true,'Flattened Aseprite pixels equal base.png exactly')
for a,_ in pairs(alpha) do check(a==0 or a==255,'Alpha value '..a..' is binary') end
local n=0;for _ in pairs(colors) do n=n+1 end
check(n+1<=32,'Colour count: '..n..' opaque + transparency = '..(n+1)..' total')
check(minx>0 and miny>0 and maxx<63 and maxy<63,'Bounding box inclusive: ('..minx..','..miny..')-('..maxx..','..maxy..'), '..(maxx-minx+1)..'x'..(maxy-miny+1))
check(maxy==62,'Common feet baseline is y=62')
local spans={};local start=nil
for x=0,64 do
 if x<64 and occupied[62*64+x] then if not start then start=x end
 elseif start then spans[#spans+1]={start,x-1};start=nil end
end
check(#spans==2,'Two distinct boot contact spans at the baseline')
report[#report+1]='Boot spans: '..spans[1][1]..'..'..spans[1][2]..' and '..spans[2][1]..'..'..spans[2][2]
local visited={};local sizes={}
for key,_ in pairs(occupied) do if not visited[key] then
 local q={key};visited[key]=true;local head=1
 while head<=#q do
  local k=q[head];head=head+1;local x=k%64;local y=math.floor(k/64)
  for dy=-1,1 do for dx=-1,1 do
   local xx,yy=x+dx,y+dy;local nk=yy*64+xx
   if xx>=0 and xx<64 and yy>=0 and yy<64 and occupied[nk] and not visited[nk] then visited[nk]=true;q[#q+1]=nk end
  end end
 end
 sizes[#sizes+1]=#q
end end
table.sort(sizes)
check(#sizes==1,'One connected silhouette (8-neighbour); no detached or isolated stray pixels')
report[#report+1]='Opaque pixel count: '..count
report[#report+1]='Visible editable layers: '..#spr.layers
report[#report+1]='Visual review: right-facing 3/4 idle, silver-sage hair, long elf ear, leaf ornament, calm smile, ivory/moss costume, brass belt, embroidered panels, thigh highs, separated boots; no ball.'
report[#report+1]='Known limitations: embroidery, fingers, and fittings deliberately simplified to native-pixel clusters. One idle pose only.'
report[#report+1]='RESULT: PASS'
local f=io.open(root..'/verification.txt','w');f:write(table.concat(report,'\n')..'\n');f:close()
print(table.concat(report,'\n'))
