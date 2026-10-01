local root=app.params['root'] or '.'
local pc=app.pixelColor
local flat=Image{fromFile=root..'/base.png'}
local neutral=pc.rgba(151,153,149,255)
local function save(img,name)
 local s=Sprite(img.width,img.height,ColorMode.RGB)
 s.cels[1].image=img;s:saveCopyAs(root..'/'..name);s:close()
end
local out=Image(512,512,ColorMode.RGB)
for y=0,511 do for x=0,511 do
 local p=flat:getPixel(math.floor(x/8),math.floor(y/8))
 out:drawPixel(x,y,pc.rgbaA(p)==0 and neutral or p)
end end
save(out,'preview_8x.png')
local source=Image{fromFile=root..'/source.png'}
local comp=Image(864,512,ColorMode.RGB);comp:clear(neutral)
-- Area-average reduction affects only the illustration, never the sprite.
for y=0,511 do for x=0,340 do
 local r,g,b,n=0,0,0,0
 for sy=math.floor(y*source.height/512),math.floor((y+1)*source.height/512)-1 do
  for sx=math.floor(x*source.width/341),math.floor((x+1)*source.width/341)-1 do
   local p=source:getPixel(sx,sy);r=r+pc.rgbaR(p);g=g+pc.rgbaG(p);b=b+pc.rgbaB(p);n=n+1
  end
 end
 comp:drawPixel(x,y,pc.rgba(math.floor(r/n),math.floor(g/n),math.floor(b/n),255))
end end
comp:drawImage(out,Point(352,0));save(comp,'compare.png')
print('Saved 8x nearest-neighbour preview and reference comparison.')
