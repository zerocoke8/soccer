-- Run from project root with Aseprite 1.3.18: Aseprite.exe -b --script scripts/build.lua
local pc=app.pixelColor
local hex={
 '343F3B','515E52','788875','AAB69B','D4DCC0','F4F2D9', -- 1-6 hair
 '694C41','B98065','E9AC87','FFD3AB','FFE5C7', -- 7-11 skin
 'B95857','EE9B87', -- 12-13 mouth and blush
 '314B39','4C7044','73964F','ACC16C', -- 14-17 green
 '6E573C','A27D43','D4AB5F','F4D58C', -- 18-21 gold
 '8B9380','C5CCB4','E7E8CF','FFFAE7', -- 22-25 ivory
 'FFFFFF','294A40','69A56A' -- 26-28 eyes
}
local palette={}
for i,h in ipairs(hex) do palette[i]=pc.rgba(tonumber(h:sub(1,2),16),tonumber(h:sub(3,4),16),tonumber(h:sub(5,6),16),255) end
local function near(c)
 local r,g,b=pc.rgbaR(c),pc.rgbaG(c),pc.rgbaB(c)
 if r>180 and b>150 and g<90 then return 0 end
 local best,dist=1,1e12
 for i,p in ipairs(palette) do
  local d=(r-pc.rgbaR(p))^2+(g-pc.rgbaG(p))^2+(b-pc.rgbaB(p))^2
  if d<dist then best,dist=i,d end
 end
 return best
end
local src=Image{fromFile='draft.png'}
local x0,y0,x1,y1=src.width,src.height,0,0
for it in src:pixels() do if near(it())~=0 then x0=math.min(x0,it.x);y0=math.min(y0,it.y);x1=math.max(x1,it.x);y1=math.max(y1,it.y) end end
print('Draft bounds',x0,y0,x1,y1)
local H=50; local W=math.floor((x1-x0+1)/(y1-y0+1)*H+.5)
local ox=math.floor((64-W)/2); local oy=62-H
local grid={};for y=0,63 do grid[y]={};for x=0,63 do grid[y][x]=0 end end
for y=0,H-1 do for x=0,W-1 do
 local votes={}
 for sy=0,4 do for sx=0,4 do
  local xx=math.min(x1,math.floor(x0+(x+(sx+.5)/5)*(x1-x0+1)/W))
  local yy=math.min(y1,math.floor(y0+(y+(sy+.5)/5)*(y1-y0+1)/H))
  local n=near(src:getPixel(xx,yy));local weight=(sx==2 and sy==2) and 3 or 1
  votes[n]=(votes[n] or 0)+weight
 end end
 local n,max=0,-1;for i=0,#palette do if (votes[i] or 0)>max then n,max=i,votes[i] or 0 end end
 grid[oy+y][ox+x]=n
end end
local s=Sprite(64,64,ColorMode.RGB)
local pal=Palette(#palette+1);pal:setColor(0,Color{r=0,g=0,b=0,a=0})
for i,p in ipairs(palette) do pal:setColor(i,Color(p)) end;s:setPalette(pal)
local layer=s.layers[1];layer.name='Draft sampled - cleaned base'
local im=Image(64,64,ColorMode.RGB)
for y=0,63 do for x=0,63 do if grid[y][x]>0 then im:drawPixel(x,y,palette[grid[y][x]]) end end end
s:newCel(layer,1,im,Point(0,0))
layer.name='Draft - sampled trace (hidden)';layer.isVisible=false
local cleanup=dofile('scripts/cleanup.lua');cleanup(s,palette)
im=Image(64,64,ColorMode.RGB);im:drawSprite(s,1)
s:saveAs('base.aseprite');im:saveAs('base.png')
local big=Image(512,512,ColorMode.RGB);big:clear(pc.rgba(128,132,132,255))
local enlarged=Image(im);enlarged:resize{width=512,height=512};big:drawImage(enlarged);big:saveAs('preview_8x.png')
local f=io.open('scripts/sampled_grid.txt','w');for y=0,63 do for x=0,63 do f:write(string.format('%02d ',grid[y][x])) end;f:write('\n') end;f:close()
print('Saved sampled base',W,H)
