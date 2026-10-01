-- Read-only reference measurements. No reference pixels are exported.
local im=Image{fromFile='reference_pose.png'}
local pc=app.pixelColor
local function bounds(y0,y1)
  local a,b,c,d=96,98,-1,-1
  for y=y0,y1 do for x=0,95 do
    local p=im:getPixel(x,y)
    if pc.rgbaA(p)>0 and math.min(pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p))<205 then
      a=math.min(a,x);b=math.min(b,y);c=math.max(c,x);d=math.max(d,y)
    end
  end end
  return string.format('(%d,%d)-(%d,%d), width %d height %d',a,b,c,d,c-a+1,d-b+1)
end
print('Reference sheet: '..im.width..' x '..im.height..'; cell 96.75 x 98')
print('First cell, dark contour threshold: '..bounds(0,97))
print('Upper head/hair region y 0..53: '..bounds(0,53))
print('Boot region y 86..97: '..bounds(86,97))
