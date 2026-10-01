local ref=Image{fromFile='reference_pixel.png'}
print('Reference dimensions',ref.width,ref.height)
local crops={{860,1295,145,130},{1075,1295,125,130},{1440,265,190,150},{660,1295,135,130}}
local board=Image(1200,340,ColorMode.RGB)
board:clear(app.pixelColor.rgba(240,240,240,255))
for n,r in ipairs(crops) do
 local im=Image(r[3],r[4],ColorMode.RGB)
 im:drawImage(ref,Point(-r[1],-r[2]))
 im:saveAs('scripts/reference_crop_'..n..'.png')
 local big=Image(im); big:resize{width=im.width*2,height=im.height*2}
 board:drawImage(big,Point((n-1)*300,20))
end
board:saveAs('scripts/reference_study.png')
