-- Seed image only. Native drawing cleanup is applied in build.lua.
local pc=app.pixelColor
local palette=dofile('scripts/palette.lua')
local cols={}; for _,v in ipairs(palette) do cols[#cols+1]={v[1],(v[2]>>16)&255,(v[2]>>8)&255,v[2]&255} end
local draft=Image{fromFile='draft.png'}
local out=Image(64,64,ColorMode.RGB)
local function classify(c)
  local r,g,b=pc.rgbaR(c),pc.rgbaG(c),pc.rgbaB(c)
  if math.max(r,g,b)-math.min(r,g,b)<19 and r>100 and r<159 then return 0,'.' end
  local best,dist=nil,1e9
  for _,v in ipairs(cols) do
    local d=(r-v[2])^2+(g-v[3])^2+(b-v[4])^2
    if d<dist then best=v;dist=d end
  end
  return pc.rgba(best[2],best[3],best[4],255),best[1]
end
local rows={}
-- The draft has a finer, imperfect grid; regular cell resampling plus hand cleanup
-- establishes a true 64x64 grid. Rect coordinates are measured from draft.png.
local x0,y0,x1,y1=276,300,923,1196
for y=0,63 do
  local row=''
  for x=0,63 do
    local c,k=0,'.'
    if x>=14 and x<=48 and y>=13 and y<=60 then
      local sx=x0+(x-14+0.5)*(x1-x0)/35
      local sy=y0+(y-13+0.5)*(y1-y0)/48
      local votes,keys={},{}
      for oy=-1,1 do for ox=-1,1 do
        local q,letter=classify(draft:getPixel(math.floor(sx+ox*4),math.floor(sy+oy*4)))
        votes[q]=(votes[q] or 0)+1; keys[q]=letter
      end end
      local n=-1; for q,count in pairs(votes) do if count>n then c=q;k=keys[q];n=count end end
      out:drawPixel(x,y,c)
    end
    row=row..k
  end
  rows[#rows+1]=row
end
out:saveAs('scripts/draft_sampled.png')
local f=io.open('scripts/draft_sampled.txt','w');f:write(table.concat(rows,'\n'));f:close()
local prev=Image(512,512,ColorMode.RGB);prev:clear(pc.rgba(128,128,128,255))
out:resize{width=512,height=512,method='nearest'};prev:drawImage(out);prev:saveAs('scripts/draft_sampled_8x.png')
