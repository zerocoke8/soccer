local im=Image{fromFile='base.png'}
local colors=dofile('scripts/palette.lua')
local pc=app.pixelColor local lookup={}
for i,h in ipairs(colors) do lookup[pc.rgba(tonumber(h:sub(1,2),16),tonumber(h:sub(3,4),16),tonumber(h:sub(5,6),16),255)]=('ABCDEFGHIJKLMNOPQRSTUVWXYZabc'):sub(i,i) end
for y=27,39 do
 local row=''
 for x=26,43 do row=row..(lookup[im:getPixel(x,y)] or '.') end
 print(y..' '..row)
end
