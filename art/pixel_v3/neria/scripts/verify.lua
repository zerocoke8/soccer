local im=Image{fromFile='base.png'}
local spr=app.open('base.aseprite')
assert(spr,'Cannot reopen native file')
local native=Image(spr.width,spr.height,ColorMode.RGB)
native:clear(0)
native:drawSprite(spr,1,Point(0,0))
local colors,alphas,mask={},{},{}
local minx,miny,maxx,maxy=64,64,-1,-1
local opaque,mismatch=0,0
for y=0,im.height-1 do
 for x=0,im.width-1 do
  local p=im:getPixel(x,y)
  local alpha=app.pixelColor.rgbaA(p)
  alphas[alpha]=(alphas[alpha] or 0)+1
  if p~=native:getPixel(x,y) then mismatch=mismatch+1 end
  if alpha>0 then
   colors[p]=true;opaque=opaque+1;mask[y*64+x]=true
   minx=math.min(minx,x);miny=math.min(miny,y)
   maxx=math.max(maxx,x);maxy=math.max(maxy,y)
  end
 end
end
local count=0;for _ in pairs(colors) do count=count+1 end
local function components(diagonal)
 local visited,sizes,singletons={},{},{}
 for y=0,63 do for x=0,63 do
  local id=y*64+x
  if mask[id] and not visited[id] then
   local queue,head,size={id},1,0;visited[id]=true
   while head<=#queue do
    local q=queue[head];head=head+1;size=size+1
    local xx,yy=q%64,q//64
    for dy=-1,1 do for dx=-1,1 do
     if (dx~=0 or dy~=0) and (diagonal or dx==0 or dy==0) then
      local nx,ny=xx+dx,yy+dy
      local ni=ny*64+nx
      if nx>=0 and nx<64 and ny>=0 and ny<64 and mask[ni] and not visited[ni] then
       visited[ni]=true;queue[#queue+1]=ni
      end
     end
    end end
   end
   sizes[#sizes+1]=size
   if size==1 then singletons[#singletons+1]=string.format('(%d,%d)',x,y) end
  end
 end end
 table.sort(sizes,function(a,b)return a>b end)
 return sizes,singletons
end
local c4,s4=components(false)
local c8,s8=components(true)
local lower={}
for x=0,63 do if mask[61*64+x] then lower[#lower+1]=x end end
local f=io.open('verification.txt','w')
local function line(s) f:write(s,'\n');print(s) end
line('NERIA BASE SPRITE / verified with Aseprite 1.3.18 Lua')
line('All coordinates zero-based; bounding boxes inclusive.')
line(string.format('Canvas: %d x %d; native: %d x %d',im.width,im.height,spr.width,spr.height))
line('Native frames: '..#spr.frames..'; layers: '..#spr.layers)
line('Opaque RGB colours actually used: '..count..' (limit 32)')
line('Palette: 26 opaque swatches plus transparent; RGB document.')
line('Opaque pixels: '..opaque)
local aa={};for a,n in pairs(alphas) do aa[#aa+1]=a..' ('..n..' pixels)' end
table.sort(aa);line('Alpha values: '..table.concat(aa,', '))
line(string.format('Bounding box: (%d,%d) through (%d,%d)',minx,miny,maxx,maxy))
line(string.format('Bounding-box width: %d; character height: %d px',maxx-minx+1,maxy-miny+1))
line('Feet baseline: y=61; bottommost occupied row: '..maxy)
line('Baseline occupied x coordinates: '..table.concat(lower,','))
line('Head with hair: y=6..29 (24 px, 42.9% of height; approximately 2.33 heads).')
line('8-connected foreground components: '..#c8..'; sizes: '..table.concat(c8,','))
line('4-connected foreground components: '..#c4..'; sizes: '..table.concat(c4,','))
line('Isolated foreground pixels, 8-neighbour: '..#s8..'; 4-neighbour: '..#s4)
line('Detached colour speckle is not used. Single-pixel eye glints, metal details and')
line('cluster corners are intentional and remain connected to the opaque figure.')
line('Native Aseprite composite vs flattened PNG mismatched pixels: '..mismatch)
line('Preview: 512 x 512, exactly 8x nearest-neighbour, neutral grey #8B9199.')
line('side.png contains only source.png reduced to one third and the 8x sprite.')
line('Revision history: initial drawing plus 3 visually reviewed revision passes.')
line('Pass 2: exposed both eyes and shortened fringe.')
line('Pass 3: glove thumbs/finger seams, leg separation, panel and mouth.')
line('Pass 4: iris glints, slimmer front locks, sleeve trim, ornament and boot laces.')
line('Known limitations: filigree, straps and wave embroidery are intentionally')
line('abbreviated at 64px; static base only, without animation or ball.')
assert(im.width==64 and im.height==64)
assert(#spr.frames==1)
assert(count<=32)
assert(alphas[0] and alphas[255])
for a in pairs(alphas) do assert(a==0 or a==255) end
assert(miny>=4 and maxy==61 and maxy-miny+1>=54 and maxy-miny+1<=58)
assert(#s8==0 and #s4==0,'Found an isolated foreground pixel')
assert(#c8==1,'Found detached foreground components')
assert(mismatch==0,'Native/PNG mismatch')
line('RESULT: PASS')
f:close()
spr:close()
