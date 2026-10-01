local src = Image{fromFile='source.png'}
local ref = Image{fromFile='reference_pixel.png'}
local study = Image(1000, 700, ColorMode.RGB)
study:clear(app.pixelColor.rgba(225,225,225,255))
local crops = {{265,95,135,125,0,0,3},{1245,245,180,170,440,0,3},{1080,1300,125,140,0,390,2},{235,680,180,145,290,400,2}}
for _,c in ipairs(crops) do
 for y=0,c[4]-1 do for x=0,c[3]-1 do
  local p=ref:getPixel(c[1]+x,c[2]+y)
  for yy=0,c[7]-1 do for xx=0,c[7]-1 do
   local dx,dy=c[5]+x*c[7]+xx,c[6]+y*c[7]+yy
   if dx<study.width and dy<study.height then study:drawPixel(dx,dy,p) end
  end end
 end end
end
study:saveAs('scripts/_reference_study.png')
local face=Image(560,560,ColorMode.RGB)
for y=0,559 do for x=0,559 do face:drawPixel(x,y,src:getPixel(370+x//2,10+y//2)) end end
face:saveAs('scripts/_source_study.png')
local points={
 {'hair light',518,47},{'hair mid',414,201},{'hair shadow',462,312},{'aqua tip',217,767},
 {'skin light',546,169},{'skin shadow',466,142},{'blush',554,158},{'eye',505,124},
 {'white shirt',547,337},{'white shade',588,399},{'navy',590,659},{'navy deep',490,224},
 {'wave blue',647,367},{'glove white',616,552},{'glove blue',548,536},{'gold trim',542,435},{'coral',464,416}
}
local f=io.open('scripts/source_samples.txt','w')
f:write('Samples obtained directly with Aseprite Lua Image:getPixel.\nSource ',src.width,'x',src.height,'; reference ',ref.width,'x',ref.height,'\n')
for _,v in ipairs(points) do local p=src:getPixel(v[2],v[3]); f:write(string.format('%s (%d,%d): #%02X%02X%02X\n',v[1],v[2],v[3],app.pixelColor.rgbaR(p),app.pixelColor.rgbaG(p),app.pixelColor.rgbaB(p))) end
f:close()
