local sheet=Image{fromFile='reference_pixel.png'}
local crops={{230,675,185,155},{1250,1475,180,165},{1070,875,150,155}}
local canvas=Image(1080,360,ColorMode.RGB)
canvas:clear(app.pixelColor.rgba(238,238,234,255))
for i,r in ipairs(crops) do
  local im=Image(r[3],r[4],ColorMode.RGB)
  im:drawImage(sheet,Point(-r[1],-r[2]))
  im:resize{width=r[3]*2,height=r[4]*2,method='nearest'}
  canvas:drawImage(im,Point((i-1)*360,20))
end
canvas:saveAs('scripts/reference_study.png')
print('Reference size '..sheet.width..'x'..sheet.height)
