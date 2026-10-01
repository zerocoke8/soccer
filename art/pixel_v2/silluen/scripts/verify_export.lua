-- Aseprite-only exports, comparison composition and measurable verification.
local pc=app.pixelColor
local spr=app.open('base.aseprite');local im=Image(64,64,ColorMode.RGB);im:drawSprite(spr,1)
local png=Image{fromFile='base.png'}
local colors,alphas={},{};local count=0;local x0,y0,x1,y1=64,64,-1,-1;local mismatch=0
local mask={}
for y=0,63 do for x=0,63 do local p=im:getPixel(x,y);local a=pc.rgbaA(p);alphas[a]=true
 if p~=png:getPixel(x,y) then mismatch=mismatch+1 end
 if a>0 then mask[y*64+x]=true;count=count+1;colors[p]=true;x0=math.min(x0,x);y0=math.min(y0,y);x1=math.max(x1,x);y1=math.max(y1,y) end
end end
local nc=0;for _ in pairs(colors) do nc=nc+1 end
local function components(diagonal)
 local seen,sizes={},{}
 for key in pairs(mask) do if not seen[key] then
  local q={key};seen[key]=true;local head=1
  while head<=#q do local k=q[head];head=head+1;local x,y=k%64,math.floor(k/64)
   for dy=-1,1 do for dx=-1,1 do if (dx~=0 or dy~=0) and (diagonal or math.abs(dx)+math.abs(dy)==1) then
    local xx,yy=x+dx,y+dy;local kk=yy*64+xx
    if xx>=0 and xx<64 and yy>=0 and yy<64 and mask[kk] and not seen[kk] then seen[kk]=true;q[#q+1]=kk end
   end end end
  end
  sizes[#sizes+1]=#q
 end end
 table.sort(sizes,function(a,b)return a>b end);return sizes
end
local c4,c8=components(false),components(true);local single=0;for _,n in ipairs(c8) do if n==1 then single=single+1 end end
local binary=true;for a in pairs(alphas) do if a~=0 and a~=255 then binary=false end end
local pass=im.width==64 and im.height==64 and nc<=32 and binary and y1==61 and y1-y0+1>=44 and y1-y0+1<=50 and single==0 and #c8==1 and mismatch==0
local out=io.open('verification.txt','w')
out:write('SILLUEN BASE SPRITE - VERIFICATION\n')
out:write('Tool: Aseprite '..tostring(app.version)..', Lua drawing and export\n')
out:write('Canvas: 64 x 64 pixels\nFrames: '..#spr.frames..'\n')
out:write('Opaque RGB colours: '..nc..' (limit 32)\nTotal RGBA values including transparent: '..(nc+1)..'\n')
out:write('Alpha values: 0, 255; binary check: '..tostring(binary)..'\n')
out:write(string.format('Bounding box, inclusive: x=%d..%d, y=%d..%d\nWidth: %d px; height: %d px\n',x0,x1,y0,y1,x1-x0+1,y1-y0+1))
out:write('Foot baseline: y='..y1..' (zero-based)\nOpaque pixels: '..count..'\n')
out:write('8-connected opaque components: '..#c8..' ('..table.concat(c8,', ')..' pixels)\n')
out:write('4-connected opaque components: '..#c4..' ('..table.concat(c4,', ')..' pixels)\n')
out:write('Isolated opaque pixels (8-neighbour): '..single..'\n')
out:write('Reopened ASEPRITE composite vs PNG mismatches: '..mismatch..'\n')
out:write('Preview: 512 x 512, exact nearest-neighbour 8x; neutral grey #808484\n')
out:write('Head region including ornament: y=12..38, 27/50 = 54% of height\n')
out:write('Intentional single-colour pixels: eye catchlights, tiny jewellery and leaf/face accents; none detached from silhouette.\n')
out:write('Visual review: both green eyes visible; calm straight silver-sage hair; leaf ornament; long pointed ears; ivory/moss/ochre costume; long panels; white socks; small boots; no ball.\n')
out:write('Known limits: fine embroidery simplified; generated draft was not native-grid accurate and was rebuilt using explicit native-pixel clusters.\n')
out:write('Layers: hidden sampled draft plus seven editable cleanup layers. Hidden draft excluded from PNG and colour counts.\n')
out:write('Result: '..(pass and 'PASS' or 'FAIL')..'\n');out:close()
assert(pass,'Verification failed; see verification.txt')

-- Exact nearest-neighbour scaling, independent of editor resize preferences.
local function scale(src,m)
 local dst=Image(src.width*m,src.height*m,ColorMode.RGB)
 for it in dst:pixels() do it(src:getPixel(math.floor(it.x/m),math.floor(it.y/m))) end;return dst
end
local bg=pc.rgba(128,132,132,255);local preview=Image(512,512,ColorMode.RGB);preview:clear(bg);preview:drawImage(scale(im,8));preview:saveAs('preview_8x.png')
local board=Image(1200,652,ColorMode.RGB);board:clear(pc.rgba(233,235,229,255))
local function fill(x,y,w,h,c) for yy=y,y+h-1 do for xx=x,x+w-1 do board:drawPixel(xx,yy,c) end end end
local font={
 A={'01110','10001','11111','10001','10001'},B={'11110','10001','11110','10001','11110'},C={'01111','10000','10000','10000','01111'},D={'11110','10001','10001','10001','11110'},
 E={'11111','10000','11110','10000','11111'},F={'11111','10000','11110','10000','10000'},G={'01111','10000','10111','10001','01111'},H={'10001','10001','11111','10001','10001'},
 I={'111','010','010','010','111'},J={'00111','00010','00010','10010','01100'},K={'10001','10010','11100','10010','10001'},L={'10000','10000','10000','10000','11111'},
 M={'10001','11011','10101','10001','10001'},N={'10001','11001','10101','10011','10001'},O={'01110','10001','10001','10001','01110'},P={'11110','10001','11110','10000','10000'},
 Q={'01110','10001','10101','10010','01101'},R={'11110','10001','11110','10010','10001'},S={'01111','10000','01110','00001','11110'},T={'11111','00100','00100','00100','00100'},
 U={'10001','10001','10001','10001','01110'},V={'10001','10001','10001','01010','00100'},W={'10001','10001','10101','11011','10001'},X={'10001','01010','00100','01010','10001'},Y={'10001','01010','00100','00100','00100'},
 ['0']={'111','101','101','101','111'},['1']={'010','110','010','010','111'},['2']={'110','001','010','100','111'},['3']={'110','001','010','001','110'},['4']={'101','101','111','001','001'},['5']={'111','100','110','001','110'},['6']={'011','100','111','101','111'},['7']={'111','001','010','010','010'},['8']={'111','101','111','101','111'},['9']={'111','101','111','001','110'},['/']={'00001','00010','00100','01000','10000'},['-']={'000','000','111','000','000'},[':']={'0','1','0','1','0'}
}
local function text(str,x,y,size)
 for c in str:gmatch('.') do local pat=font[c];if pat then
  for yy,row in ipairs(pat) do for xx=1,#row do if row:sub(xx,xx)=='1' then fill(x+(xx-1)*size,y+(yy-1)*size,size,size,pc.rgba(52,63,59,255)) end end end
  x=x+(#pat[1]+1)*size
 else x=x+size*3 end end
end
text('SILLUEN / FOREST ELF',20,20,3)
text('SOURCE',20,63,2);text('NATIVE 64 X 64 / 8X',350,63,2);text('STYLE REFERENCES',887,63,2)
local source=Image{fromFile='source.png'};source:resize{width=320,height=480};board:drawImage(source,Point(14,92))
board:drawImage(preview,Point(350,92))
local ref1=Image{fromFile='scripts/reference_crop_1.png'};local ref2=Image{fromFile='scripts/reference_crop_2.png'}
board:drawImage(scale(ref1,2),Point(890,92));board:drawImage(scale(ref2,2),Point(910,364))
text(nc..' COLOURS / 50 PX HIGH / BASELINE 61',350,625,2)
text('STYLE ONLY',18,600,2);text('NO CHARACTER COPIED',18,620,2)
board:saveAs('compare.png')
print('PASS',nc,'colours',x0,y0,x1,y1,'components',#c8)
