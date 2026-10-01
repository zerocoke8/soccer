local ref = Image{fromFile='reference_pixel.png'}
local out = Image(960,360,ColorMode.RGB)
out:clear(app.pixelColor.rgba(245,245,242,255))
local crops={{58,1295,175,1435},{665,690,797,822},{1050,64,1220,216}}
for i,r in ipairs(crops) do
  local im=Image(r[3]-r[1],r[4]-r[2],ColorMode.RGB)
  im:drawImage(ref,Point(-r[1],-r[2]))
  im:resize{width=im.width*2,height=im.height*2,method='nearest'}
  out:drawImage(im,Point((i-1)*320,10))
end
out:saveAs('scripts/reference_study.png')
