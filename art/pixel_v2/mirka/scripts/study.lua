local src=Image{fromFile='reference_pixel.png'}
print('Reference dimensions: '..src.width..'x'..src.height)
local crops={{1080,875,130,153},{1260,875,135,153},{452,1480,155,158},{869,1295,150,138}}
local sheet=Image(1240,330,ColorMode.RGB)
sheet:clear(app.pixelColor.rgba(238,238,238,255))
for i,r in ipairs(crops) do
 local crop=Image(r[3],r[4],ColorMode.RGB)
 crop:drawImage(src,Point(-r[1],-r[2]))
 crop:saveAs('scripts/reference_crop_'..i..'.png')
 crop:resize{width=r[3]*2,height=r[4]*2}
 sheet:drawImage(crop,Point((i-1)*310,0))
end
sheet:saveAs('scripts/reference_study.png')
