local sprite=app.open('base.aseprite')
local im=Image{fromFile='base.png'}
local pc=app.pixelColor
local counts,alphas={},{}
local minx,miny,maxx,maxy=64,64,-1,-1
local solid={}
local count=0
for y=0,63 do
  for x=0,63 do
    local pixel=im:getPixel(x,y)
    local alpha=pc.rgbaA(pixel)
    alphas[alpha]=(alphas[alpha] or 0)+1
    if alpha>0 then
      counts[pixel]=(counts[pixel] or 0)+1
      solid[y*64+x]=true
      count=count+1
      minx=math.min(minx,x); miny=math.min(miny,y)
      maxx=math.max(maxx,x); maxy=math.max(maxy,y)
    end
  end
end
local colorCount=0
for _ in pairs(counts) do colorCount=colorCount+1 end
local function components(diagonal)
  local seen,areas,isolated={},{},{}
  for key in pairs(solid) do
    if not seen[key] then
      local stack={key}; seen[key]=true
      local area=0
      while #stack>0 do
        local cur=table.remove(stack)
        area=area+1
        local x,y=cur%64,math.floor(cur/64)
        for dy=-1,1 do
          for dx=-1,1 do
            if (dx~=0 or dy~=0) and (diagonal or dx==0 or dy==0) then
              local xx,yy=x+dx,y+dy
              local id=yy*64+xx
              if xx>=0 and xx<64 and yy>=0 and yy<64 and solid[id] and not seen[id] then
                seen[id]=true; stack[#stack+1]=id
              end
            end
          end
        end
      end
      areas[#areas+1]=area
      if area==1 then isolated[#isolated+1]=key%64 .. ',' ..math.floor(key/64) end
    end
  end
  table.sort(areas,function(a,b) return a>b end)
  return areas,isolated
end
local c8,i8=components(true)
local c4,i4=components(false)
local leftBase,rightBase=-1,-1
for y=50,63 do
  for x=22,32 do if solid[y*64+x] then leftBase=math.max(leftBase,y) end end
  for x=39,50 do if solid[y*64+x] then rightBase=math.max(rightBase,y) end end
end
local flattened=Image(sprite.spec)
flattened:drawSprite(sprite,1)
local differences=0
for y=0,63 do for x=0,63 do
  if flattened:getPixel(x,y)~=im:getPixel(x,y) then differences=differences+1 end
end end
local out=io.open('verification.txt','w')
out:write('NERIA / native sprite verification\n')
out:write('Coordinates are zero-based, inclusive.\n\n')
out:write(string.format('Canvas: %d x %d\nFrames: %d\nEditable layers: %d\n',im.width,im.height,#sprite.frames,#sprite.layers))
out:write('Mode: RGBA, transparent background\n')
out:write('Opaque colours used: '..colorCount..'\n')
out:write('RGBA colours including transparency: '..(colorCount+1)..'\n')
out:write('Palette entries including transparent: '..#sprite.palettes[1]..'\n')
local avals={}; for a in pairs(alphas) do avals[#avals+1]=a end; table.sort(avals)
out:write('Alpha values: '..table.concat(avals,', ')..'\n')
out:write(string.format('Bounding box: (%d, %d) to (%d, %d)\n',minx,miny,maxx,maxy))
out:write(string.format('Bounding size: %d x %d; height: %d px\n',maxx-minx+1,maxy-miny+1,maxy-miny+1))
out:write('Opaque pixels: '..count..'\n')
out:write(string.format('Foot baselines: near y=%d; far y=%d\n',leftBase,rightBase))
out:write('Transparent bottom margin: '..(63-maxy)..' px\n')
out:write('8-connected opaque components: '..#c8..' (sizes '..table.concat(c8,', ')..')\n')
out:write('4-connected opaque components: '..#c4..' (sizes '..table.concat(c4,', ')..')\n')
out:write('Isolated opaque pixels (8-neighbour): '..#i8..'\n')
out:write('Isolated opaque pixels (4-neighbour): '..#i4..' '..table.concat(i4,'; ')..'\n')
out:write('Aseprite composite versus base.png: '..differences..' different pixels\n')
out:write('\nVisual review: all six passes examined at 8x; final native 1x and 8x checked.\n')
out:write('Pass 01: initial hand-authored silhouette, proportions and costume maps.\n')
out:write('Pass 02: swept fringe, separated long hair and leg negative space.\n')
out:write('Pass 03: exposed eye highlights, silver shading, buckle, cleated soles.\n')
out:write('Pass 04: far hair volume, cheek-framing lock, simpler glove seams.\n')
out:write('Pass 05: smoothly joined far hair roots and tapered aqua tips.\n')
out:write('Pass 06: removed a small fork at the upper far-hair silhouette.\n')
out:write('\nNo image-generation tools, traced artwork, sheet crops, dithering or resampled sprite art.\n')
out:write('Only preview/source-comparison images are scaled; base pixels are authored at 64 x 64.\n')
out:write('Single-pixel eye highlights and connected ornament details are intentional.\n')
out:write('Known limitations: source embroidery and glove filigree are reduced to a few clusters at this resolution.\n')
out:close()
assert(im.width==64 and im.height==64 and #sprite.frames==1)
assert(colorCount+1<=32)
for alpha in pairs(alphas) do assert(alpha==0 or alpha==255) end
assert(maxy-miny+1>=58 and maxy-miny+1<=62)
assert(leftBase==rightBase and 63-maxy>=2 and 63-maxy<=3)
assert(#i8==0 and #c8==1)
assert(differences==0)
print('Verified: '..colorCount..' opaque colours; bbox '..minx..','..miny..'..'..maxx..','..maxy..'; height '..maxy-miny+1)
