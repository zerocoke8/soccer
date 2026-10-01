-- Run from the project directory with Aseprite -b --script scripts/study.lua
local ref=Image{fromFile='reference_pixel.png'}
local crops={{775,1170,120,125},{970,1170,115,125},{245,625,110,120},{950,260,155,115}}
local out=Image(1280,310,ColorMode.RGB)
out:clear(app.pixelColor.rgba(226,226,226,255))
for i,r in ipairs(crops) do
  for j=1,4 do r[j]=math.floor(r[j]*ref.width/1503) end
  local im=Image(r[3],r[4],ColorMode.RGB)
  im:drawImage(ref,Point(-r[1],-r[2]))
  im:resize{width=r[3]*2,height=r[4]*2,method='nearest'}
  out:drawImage(im,Point((i-1)*320,10))
end
out:saveAs('scripts/reference_study.png')
print('Reference dimensions: '..ref.width..'x'..ref.height)
