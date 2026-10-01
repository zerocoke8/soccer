-- Verify exported PNG against reopened Aseprite; export comparison using Lua.
local pc=app.pixelColor
local im=Image{fromFile='base.png'}
local doc=app.open('base.aseprite')
local rendered=Image(64,64,ColorMode.RGB)
rendered:drawSprite(doc,1)
local cols,alphas={},{}
local minx,miny,maxx,maxy=64,64,-1,-1
local opaque,partial,mismatch=0,0,0
local mask={}
for y=0,63 do for x=0,63 do
  local p=im:getPixel(x,y);local a=pc.rgbaA(p)
  alphas[a]=true
  if a~=0 and a~=255 then partial=partial+1 end
  if a>0 then
    opaque=opaque+1;cols[p]=true;mask[y*64+x]=true
    minx=math.min(minx,x);miny=math.min(miny,y)
    maxx=math.max(maxx,x);maxy=math.max(maxy,y)
  end
  if p~=rendered:getPixel(x,y) then mismatch=mismatch+1 end
end end
local count=0;for _ in pairs(cols) do count=count+1 end
local function components(diagonal)
  local seen,sizes={},{}
  for key in pairs(mask) do if not seen[key] then
    local q={key};seen[key]=true;local n=1
    while n<=#q do
      local k=q[n];n=n+1;local x,y=k%64,math.floor(k/64)
      for dy=-1,1 do for dx=-1,1 do
        if (diagonal or math.abs(dx)+math.abs(dy)==1) and not (dx==0 and dy==0) then
          local xx,yy=x+dx,y+dy;local nk=yy*64+xx
          if xx>=0 and xx<64 and yy>=0 and yy<64 and mask[nk] and not seen[nk] then seen[nk]=true;q[#q+1]=nk end
        end
      end end
    end
    sizes[#sizes+1]=#q
  end end
  table.sort(sizes,function(a,b) return a>b end)
  return sizes
end
local c8,c4=components(true),components(false)
local isolated=0;for _,n in ipairs(c8) do if n==1 then isolated=isolated+1 end end
local preview=Image{fromFile='preview_8x.png'}
local previewMismatch=0
for y=0,511 do for x=0,511 do
  local p=im:getPixel(math.floor(x/8),math.floor(y/8))
  if pc.rgbaA(p)==0 then p=pc.rgba(128,128,128,255) end
  if preview:getPixel(x,y)~=p then previewMismatch=previewMismatch+1 end
end end
local passed=im.width==64 and im.height==64 and partial==0 and count+1<=32 and maxy-miny+1>=44 and maxy-miny+1<=50 and (maxy==60 or maxy==61) and isolated==0 and #c8==1 and mismatch==0 and preview.width==512 and preview.height==512 and previewMismatch==0
local f=io.open('verification.txt','w')
f:write('ULRIKA - NATIVE BASE SPRITE VERIFICATION\n')
f:write('Generated and verified with Aseprite '..tostring(app.version)..' Lua API.\n')
f:write('Coordinate convention: zero-based, inclusive bounds.\n\n')
f:write('Result: '..(passed and 'PASS' or 'FAIL')..'\n')
f:write(string.format('Canvas: %d x %d px\n',im.width,im.height))
f:write(string.format('Opaque colours: %d; including transparent entry: %d (limit 32)\n',count,count+1))
f:write('Alpha values: 0, 255; partial-alpha pixels: '..partial..'\n')
f:write(string.format('Opaque bounding box: (%d,%d)-(%d,%d)\n',minx,miny,maxx,maxy))
f:write(string.format('Bounding box width/height: %d x %d px\n',maxx-minx+1,maxy-miny+1))
f:write('Feet baseline: y='..maxy..' (both boots at y=61)\n')
f:write('Opaque pixels: '..opaque..'\n')
f:write('8-connected opaque components: '..#c8..'; sizes: '..table.concat(c8,', ')..'\n')
f:write('4-connected opaque components: '..#c4..'; sizes: '..table.concat(c4,', ')..'\n')
f:write('Detached isolated opaque pixels (8-neighbour): '..isolated..'\n')
f:write('Reopened ASEPRITE vs PNG pixel mismatches: '..mismatch..'\n')
f:write('8x preview: 512 x 512, exact nearest-neighbour on #808080; mismatches: '..previewMismatch..'\n')
f:write('Native document: 64 x 64, 1 frame, '..#doc.layers..' visible editable layers\n')
f:write('Layer coverage: tail; body and outfit; hair face and ears.\n\n')
f:write('Visual review: 3/4 front, both eyes visible with iris/glint; tiny fang grin;\n')
f:write('silver ears and bob; fluffy tail; pine/cream crop top; diagonal harness;\n')
f:write('teal shorts, dark knee socks, two teal/cream boots. No soccer ball.\n')
f:write('Hair/head excluding ear tips spans approximately y=20..39 (20px);\n')
f:write('ears plus hair/head span y=12..39 (28px), body/legs y=40..61 (22px).\n')
f:write('Intentional singleton colour accents: eye glints, fang, gold clasps;\n')
f:write('these belong to the connected sprite and are not detached stray pixels.\n\n')
f:write('Known limitations: ornate embroidery, thigh straps, hanging coat panels\n')
f:write('and small jewellery are simplified/omitted at native 64px resolution.\n')
f:write('Single idle base only; no animation or mirrored team variant requested.\n')
f:write('Reference crops are comparison-only and never copied into the base sprite.\n')
f:write('Draft generated once using built-in imagegen, then sampled and extensively\n')
f:write('redrawn into native colour clusters in scripts/cleanup.lua.\n')
f:close()
assert(passed,'Verification failed; inspect verification.txt')

local grey=pc.rgba(128,128,128,255)
local canvas=Image(1232,736,ColorMode.RGB);canvas:clear(grey)
local src=Image{fromFile='source.png'}
src:resize{width=304,height=456,method='bilinear'}
canvas:drawImage(src,Point(16,112))
local sprite8=Image(im);sprite8:resize{width=512,height=512,method='nearest'}
canvas:drawImage(sprite8,Point(336,80))
local sheet=Image{fromFile='reference_pixel.png'}
local function crop(x,y,w,h,dx,dy)
  local c=Image(w,h,ColorMode.RGB);c:drawImage(sheet,Point(-x,-y))
  c:resize{width=w*2,height=h*2,method='nearest'}
  canvas:drawImage(c,Point(dx,dy))
end
crop(1250,1475,180,165,864,48)
crop(1070,875,150,155,894,394)
-- Small bitmap captions keep the entire export independent of system fonts.
local glyph={
 A={'01110','10001','10001','11111','10001','10001','10001'},
 B={'11110','10001','10001','11110','10001','10001','11110'},
 C={'01111','10000','10000','10000','10000','10000','01111'},
 E={'11111','10000','10000','11110','10000','10000','11111'},
 F={'11111','10000','10000','11110','10000','10000','10000'},
 I={'111','010','010','010','010','010','111'},
 K={'10001','10010','10100','11000','10100','10010','10001'},
 L={'10000','10000','10000','10000','10000','10000','11111'},
 N={'10001','11001','10101','10011','10001','10001','10001'},
 O={'01110','10001','10001','10001','10001','10001','01110'},
 P={'11110','10001','10001','11110','10000','10000','10000'},
 R={'11110','10001','10001','11110','10100','10010','10001'},
 S={'01111','10000','10000','01110','00001','00001','11110'},
 T={'11111','00100','00100','00100','00100','00100','00100'},
 U={'10001','10001','10001','10001','10001','10001','01110'},
 V={'10001','10001','10001','10001','10001','01010','00100'},
 X={'10001','10001','01010','00100','01010','10001','10001'},
 Y={'10001','10001','01010','00100','00100','00100','00100'},
 ['1']={'010','110','010','010','010','010','111'},
 ['4']={'10010','10010','10010','11111','00010','00010','00010'},
 ['6']={'01110','10000','10000','11110','10001','10001','01110'},
 ['8']={'01110','10001','10001','01110','10001','10001','01110'},
 ['-']={'000','000','000','111','000','000','000'},
}
local function label(str,x,y,scale)
  for c in str:gmatch('.') do
    local g=glyph[c]
    if g then
      for yy,row in ipairs(g) do for xx=1,#row do if row:sub(xx,xx)=='1' then
        for oy=0,scale-1 do for ox=0,scale-1 do canvas:drawPixel(x+(xx-1)*scale+ox,y+(yy-1)*scale+oy,pc.rgba(246,246,239,255)) end end
      end end end
      x=x+(#g[1]+1)*scale
    else x=x+4*scale end
  end
end
label('SOURCE',88,72,3)
label('ULRIKA - 64 X 64 - 8X',344,40,2)
label('STYLE ONLY',920,18,2)
label('NATIVE 1X',376,657,2)
canvas:drawImage(im,Point(540,624))
canvas:saveAs('compare.png')
doc:close()
print(string.format('PASS: %d opaque colours; bbox (%d,%d)-(%d,%d); %dpx high; %d connected component',count,minx,miny,maxx,maxy,maxy-miny+1,#c8))
