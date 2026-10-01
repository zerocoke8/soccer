local pc=app.pixelColor
local src=Image{fromFile='draft.png'}
local hex={'443247','624760','826580','AD86B0','C7A5CB','E4C7E4',
 'FCEDD4','DECBAE','B09D89','70645F','51645B','80A58A','B0CFAB',
 '372E40','514054','725571','966A8D','DDA27E','F7C49B','FFE0B5',
 'E99083','AC645F','87542F','CB873B','F8BA51','FFF9E8',
 '947346','CEAB61','F1D78C'}
local colors={}
for i,h in ipairs(hex) do
 colors[i]=pc.rgba(tonumber(h:sub(1,2),16),tonumber(h:sub(3,4),16),tonumber(h:sub(5,6),16),255)
end
local function foreground(p)
 local r,g,b=pc.rgbaR(p),pc.rgbaG(p),pc.rgbaB(p)
 return math.max(r,g,b)-math.min(r,g,b)>4
end
local x0,y0,x1,y1=src.width,src.height,0,0
for y=0,src.height-1 do for x=0,src.width-1 do
 if foreground(src:getPixel(x,y)) then x0=math.min(x0,x) y0=math.min(y0,y) x1=math.max(x1,x) y1=math.max(y1,y) end
end end
print(string.format('Draft %dx%d, chromatic bounds %d,%d..%d,%d',src.width,src.height,x0,y0,x1,y1))
local w=math.floor((x1-x0+1)/(y1-y0+1)*50+0.5)
local out=Image(64,64,ColorMode.RGB)
local rows={}
local alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabc'
for y=0,63 do
 local row=''
 for x=0,63 do
  local idx=0
  if x>=12 and x<12+w and y>=12 and y<=61 then
   local counts={}
   for sy=1,5 do for sx=1,5 do
    local ox=math.min(x1,math.floor(x0+(x-12+(sx-0.5)/5)*(x1-x0+1)/w))
    local oy=math.min(y1,math.floor(y0+(y-12+(sy-0.5)/5)*(y1-y0+1)/50))
    local p=src:getPixel(ox,oy)
    local best,dist=0,1e10
    if foreground(p) then
     for i,c in ipairs(colors) do
      local dr,dg,db=pc.rgbaR(p)-pc.rgbaR(c),pc.rgbaG(p)-pc.rgbaG(c),pc.rgbaB(p)-pc.rgbaB(c)
      local d=dr*dr+dg*dg+db*db
      if d<dist then best,dist=i,d end
     end
    end
    counts[best]=(counts[best] or 0)+1
   end end
   local most=0
   for i=0,#colors do if (counts[i] or 0)>most then idx,most=i,counts[i] end end
  end
  if idx>0 then out:putPixel(x,y,colors[idx]) row=row..alphabet:sub(idx,idx) else row=row..'.' end
 end
 rows[#rows+1]=row
end
out:saveAs('scripts/sampled.png')
out:resize{width=512,height=512}
out:saveAs('scripts/sampled_8x.png')
local f=io.open('scripts/sampled_grid.txt','w')
for y,row in ipairs(rows) do f:write(string.format('%02d %s\n',y-1,row)) end
f:close()
local p=io.open('scripts/palette.lua','w')
p:write('return {\n')
for i,h in ipairs(hex) do p:write(" '"..h.."', -- "..alphabet:sub(i,i)..'\n') end
p:write('}\n') p:close()
