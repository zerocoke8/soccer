-- Native document and PNG verification plus source/sprite comparison.
-- Run: Aseprite -b --script scripts/verify.lua
local pc=app.pixelColor
local s=app.open('base.aseprite')
local png=Image{fromFile='base.png'}
local flat=Image(s.spec); flat:drawSprite(s,1)
local checks={}
local function check(ok,message)
  checks[#checks+1]=(ok and 'PASS: ' or 'FAIL: ')..message
  return ok
end
check(s.width==64 and s.height==64 and png.width==64 and png.height==64,'Native document and PNG are exactly 64x64')
check(#s.frames==1,'Exactly one frame')
local colors,alphas,mask={},{},{}
local minx,miny,maxx,maxy=64,64,-1,-1
local matches=true; local opaque=0
for y=0,63 do for x=0,63 do
  local v=png:getPixel(x,y); local a=pc.rgbaA(v)
  alphas[a]=true; colors[v]=true
  if v~=flat:getPixel(x,y) then matches=false end
  if a>0 then
    mask[y*64+x]=true; opaque=opaque+1
    minx=math.min(minx,x); miny=math.min(miny,y)
    maxx=math.max(maxx,x); maxy=math.max(maxy,y)
  end
end end
local count=0; for _ in pairs(colors) do count=count+1 end
local strict=true; for a in pairs(alphas) do if a~=0 and a~=255 then strict=false end end
check(matches,'PNG exactly matches flattened Aseprite frame')
check(strict and alphas[0] and alphas[255],'Alpha values are exclusively 0 and 255; background is transparent')
check(count<=32,'Palette count including transparency = '..count..' (opaque = '..(count-1)..')')
check(minx>0 and miny>0 and maxx<63 and maxy<=62,'Bounding box inclusive, zero-based: ('..minx..','..miny..')-('..maxx..','..maxy..'), '..(maxx-minx+1)..'x'..(maxy-miny+1))
local seen,components={},{}
for id in pairs(mask) do
  if not seen[id] then
    local q={id}; seen[id]=true; local n=1
    while n<=#q do
      local k=q[n]; n=n+1; local x,y=k%64,math.floor(k/64)
      for dy=-1,1 do for dx=-1,1 do
        local xx,yy=x+dx,y+dy; local j=yy*64+xx
        if xx>=0 and xx<64 and yy>=0 and yy<64 and mask[j] and not seen[j] then seen[j]=true; q[#q+1]=j end
      end end
    end
    components[#components+1]=#q
  end
end
table.sort(components,function(a,b)return a>b end)
check(#components==1,'One connected silhouette (8-neighbour), components = '..#components..'; no isolated stray pixels')
local footA,footB=false,false
for x=25,38 do if mask[62*64+x] then footA=true end end
for x=39,49 do if mask[62*64+x] then footB=true end end
check(maxy==62 and footA and footB,'Both feet reach shared baseline y=62')
local src=Image{fromFile='source.png'}
local missing={}; for v in pairs(colors) do if pc.rgbaA(v)>0 then missing[v]=true end end
for y=0,src.height-1,4 do for x=0,src.width-1,4 do missing[src:getPixel(x,y)]=nil end end
local remaining=0; for _ in pairs(missing) do remaining=remaining+1 end
check(remaining==0,'All opaque palette colours are exact RGB samples from source.png')
checks[#checks+1]='Opaque pixel count: '..opaque
checks[#checks+1]='Layer count: '..#s.layers
checks[#checks+1]='Visual review: right-facing profile, 21px head, white/aqua long hair, two keeper gloves, navy shorts, wave panel, coral tassels; no soccer ball.'
checks[#checks+1]='Known limitations: ornate embroidery simplified to compact wave/metal clusters at 64x64. Single idle pose only.'
local passed=true
for _,v in ipairs(checks) do if v:sub(1,4)=='FAIL' then passed=false end end
table.insert(checks,1,'VERIFICATION '..(passed and 'PASS' or 'FAIL'))
local f=assert(io.open('verification.txt','w')); f:write(table.concat(checks,'\n')..'\n'); f:close()
print(table.concat(checks,'\n'))
assert(passed,'Pixel verification failed')
-- Comparison: original fitted on the left, exact 8x native sprite on right.
local comp=Sprite(900,544,ColorMode.RGB)
local out=comp.cels[1].image
local bg=pc.rgba(154,157,159,255)
for y=0,543 do for x=0,899 do out:drawPixel(x,y,bg) end end
local h=512; local w=math.floor(src.width*h/src.height)
for y=0,h-1 do for x=0,w-1 do
  out:drawPixel(16+x,16+y,src:getPixel(math.floor(x*src.width/w),math.floor(y*src.height/h)))
end end
for y=0,511 do for x=0,511 do
  local v=png:getPixel(math.floor(x/8),math.floor(y/8))
  if pc.rgbaA(v)>0 then out:drawPixel(372+x,16+y,v) end
end end
comp:saveCopyAs('compare.png')
