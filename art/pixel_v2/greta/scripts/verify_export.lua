local pc=app.pixelColor
local base=Image{fromFile='base.png'}
local grey=pc.rgba(145,145,145,255)
local function scaled(im,w,h) local cp=Image(im);cp:resize{width=w,height=h,method='nearest'};return cp end
local prev=Image(512,512,ColorMode.RGB);prev:clear(grey)
prev:drawImage(scaled(base,512,512),Point(0,0));prev:saveAs('preview_8x.png')
local comp=Image(1240,560,ColorMode.RGB);comp:clear(grey)
local src=Image{fromFile='source.png'};src:resize{width=341,height=512,method='bilinear'}
comp:drawImage(src,Point(12,24));comp:drawImage(prev,Point(365,24))
local ref=Image{fromFile='reference_pixel.png'}
local crops={{58,1295,175,1435},{665,690,797,822}}
for i,r in ipairs(crops) do
 local crop=Image(r[3]-r[1],r[4]-r[2],ColorMode.RGB);crop:drawImage(ref,Point(-r[1],-r[2]))
 crop:resize{width=crop.width*2,height=crop.height*2,method='nearest'}
 comp:drawImage(crop,Point(905,(i-1)*276+4))
end
comp:saveAs('compare.png')
local colors,alphas,opaque={},{},{}
local minx,miny,maxx,maxy=64,64,-1,-1
local n=0
for y=0,63 do for x=0,63 do
 local c=base:getPixel(x,y);local a=pc.rgbaA(c);alphas[a]=true
 if a>0 then
  colors[string.format('%02x%02x%02x',pc.rgbaR(c),pc.rgbaG(c),pc.rgbaB(c))]=true
  opaque[y*64+x]=true;n=n+1;minx=math.min(minx,x);miny=math.min(miny,y);maxx=math.max(maxx,x);maxy=math.max(maxy,y)
 end
end end
local count=0;for _ in pairs(colors) do count=count+1 end
local invalidAlpha=false;for a in pairs(alphas) do if a~=0 and a~=255 then invalidAlpha=true end end
local isolated={};local seen={};local components={}
for key in pairs(opaque) do
 local x,y=key%64,math.floor(key/64);local neighbors=0
 for dy=-1,1 do for dx=-1,1 do if dx~=0 or dy~=0 then if opaque[(y+dy)*64+x+dx] then neighbors=neighbors+1 end end end end
 if neighbors==0 then table.insert(isolated,key) end
 if not seen[key] then
  local q={key};seen[key]=true;local index=1
  while index<=#q do local k=q[index];index=index+1;local xx,yy=k%64,math.floor(k/64)
   for dy=-1,1 do for dx=-1,1 do if dx~=0 or dy~=0 then local nx,ny=xx+dx,yy+dy;local nk=ny*64+nx
    if nx>=0 and nx<64 and ny>=0 and ny<64 and opaque[nk] and not seen[nk] then seen[nk]=true;table.insert(q,nk) end
   end end end
  end
  table.insert(components,#q)
 end
end
local ase=app.open('base.aseprite')
local flat=Image(ase.spec);flat:drawSprite(ase,1)
local mismatch=0;for y=0,63 do for x=0,63 do if flat:getPixel(x,y)~=base:getPixel(x,y) then mismatch=mismatch+1 end end end
local pass=base.width==64 and base.height==64 and not invalidAlpha and count<=32 and maxy==61 and maxy-miny+1<=50 and maxy-miny+1>=44 and #isolated==0 and #components==1 and mismatch==0
local f=io.open('verification.txt','w')
f:write('GRETA BASE SPRITE - verification\n')
f:write('Result: '..(pass and 'PASS' or 'FAIL')..'\n')
f:write('Canvas: '..base.width..'x'..base.height..'\n')
f:write('Opaque RGB colours: '..count..' (limit 32); transparent slot is additional\n')
f:write('Alpha values: 0 and 255 only: '..tostring(not invalidAlpha)..'\n')
f:write(string.format('Opaque bounding box (inclusive, zero-based): (%d,%d)-(%d,%d)\n',minx,miny,maxx,maxy))
f:write(string.format('Occupied size: %dx%d; height: %d px; baseline: y=%d\n',maxx-minx+1,maxy-miny+1,maxy-miny+1,maxy))
f:write('Opaque pixels: '..n..'\n8-connected silhouette components: '..#components..'\nIsolated opaque pixels (8-neighbour): '..#isolated..'\n')
f:write('Aseprite visible layers: '..#ase.layers..'; frames: '..#ase.frames..'\nPNG/Aseprite composite mismatches: '..mismatch..'\n')
f:write('preview_8x.png: exact 512x512 nearest-neighbour, neutral #919191 background\n')
f:write('compare.png: source illustration | native sprite at 8x | two reference-only crops\n')
f:write('Draft: built-in imagegen, once, both source images supplied; prompt in scripts/draft_prompt.txt\n')
f:write('Native construction: Aseprite Lua; sampled draft study followed by deliberate native pixel reconstruction\n')
f:write('Known limitations: costume filigree simplified; giant scale conveyed by shoulder/arm breadth within 50 px height.\n')
f:write('Isolated colour accents such as eye glints are intentional; isolated-pixel check concerns disconnected opaque pixels.\n')
f:close()
print('Verification '..(pass and 'PASS' or 'FAIL')..': '..count..' colours, bounds '..minx..','..miny..'..'..maxx..','..maxy)
