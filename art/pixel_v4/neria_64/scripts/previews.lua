-- All preview resampling is exact nearest-neighbour. No reference sheets used.
local pass = app.params['pass'] or '01'
local img = Image{fromFile='base.png'}
local gray = Color{r=145,g=147,b=151,a=255}.rgbaPixel
local function composite(filename,w,h,parts)
  local out=Sprite(w,h,ColorMode.RGB)
  local canvas=Image(w,h,ColorMode.RGB)
  canvas:clear(gray)
  for _,part in ipairs(parts) do
    for y=0,part.h-1 do
      for x=0,part.w-1 do
        local px=part.image:getPixel(math.floor(x*part.image.width/part.w),
                                    math.floor(y*part.image.height/part.h))
        if app.pixelColor.rgbaA(px)>0 then
          canvas:drawPixel(part.x+x,part.y+y,px)
        end
      end
    end
  end
  out:newCel(out.layers[1],1,canvas,Point(0,0))
  out:saveCopyAs(filename)
  return out
end
local preview=composite('preview_8x.png',512,512,{{image=img,x=0,y=0,w=512,h=512}})
preview:saveCopyAs('scripts/pass_'..pass..'_8x.png')
composite('scripts/native_check.png',64,64,{{image=img,x=0,y=0,w=64,h=64}})
local source=Image{fromFile='source.png'}
composite('side.png',912,544,{
  {image=source,x=16,y=16,w=341,h=512},
  {image=img,x=384,y=16,w=512,h=512},
})
print('Preview '..pass..' saved.')
