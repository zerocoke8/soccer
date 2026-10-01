-- Native 64px art direction / pixel cleanup. All coordinates are integers.
return function(p)
local function dot(x,y,c) if x>=0 and x<64 and y>=0 and y<64 then p[y][x]=c end end
local function rect(x1,y1,x2,y2,c) for y=y1,y2 do for x=x1,x2 do dot(x,y,c) end end end
local function line(x1,y1,x2,y2,c)
  local dx,dy=math.abs(x2-x1),-math.abs(y2-y1)
  local sx,sy=x1<x2 and 1 or -1,y1<y2 and 1 or -1
  local e=dx+dy
  while true do
    dot(x1,y1,c); if x1==x2 and y1==y2 then break end
    local e2=2*e
    if e2>=dy then e=e+dy;x1=x1+sx end
    if e2<=dx then e=e+dx;y1=y1+sy end
  end
end
local function poly(v,c)
  local minY,maxY=63,0
  for _,a in ipairs(v) do minY=math.min(minY,a[2]);maxY=math.max(maxY,a[2]) end
  for y=minY,maxY do
    local xs={}
    for i,a in ipairs(v) do
      local b=v[i%#v+1]
      if (a[2]<=y and b[2]>y) or (b[2]<=y and a[2]>y) then
        xs[#xs+1]=a[1]+(y-a[2])*(b[1]-a[1])/(b[2]-a[2])
      end
    end
    table.sort(xs)
    for i=1,#xs-1,2 do for x=math.ceil(xs[i]),math.floor(xs[i+1]) do dot(x,y,c) end end
  end
  for i,a in ipairs(v) do local b=v[i%#v+1];line(a[1],a[2],b[1],b[2],c) end
end
-- Keep the draft's tail silhouette; replace mottled reduction with fur clusters.
for y=29,53 do for x=5,23 do if p[y][x]~=0 then p[y][x]=5 end end end
poly({{19,30},{14,31},{11,33},{9,36},{7,40},{8,43},{10,39},{11,41},{13,36},{15,35},{14,37},{18,34},{21,33}},6)
poly({{9,42},{8,45},{10,48},{14,51},{19,52},{16,50},{13,48},{12,45},{12,42},{10,45}},6)
poly({{18,37},{15,41},{15,44},{17,47},{21,49},{20,46},{18,44},{17,42}},4)
poly({{18,39},{17,42},{19,45},{21,46},{19,42}},6)
poly({{13,38},{11,41},{12,44},{13,45},{12,41}},7)
-- Replace head pixels, preserving composition of the draft.
rect(24,24,49,63,0)
rect(24,0,46,23,0)
poly({{27,11},{29,8},{31,6},{33,2},{34,1},{35,7},{38,7},{41,4},{43,4},{42,10},{44,14},{44,18},{42,21},{41,23},{37,24},{29,23},{26,22},{27,20},{24,20},{26,17},{25,16},{26,13}},1)
-- Ears: large, silver, triangular. The left ear is seen from its back.
poly({{29,10},{31,6},{34,2},{34,7},{35,10}},5)
poly({{30,9},{33,4},{33,7},{34,9}},7)
line(32,6,32,8,4)
poly({{38,8},{41,5},{42,5},{41,10}},5)
poly({{39,8},{41,6},{41,9}},7)
-- Hair mass.
poly({{28,11},{31,9},{36,8},{39,9},{41,11},{43,14},{43,18},{41,21},{40,23},{36,23},{35,21},{32,23},{30,22},{27,22},{29,19},{26,20},{27,17},{26,16}},5)
poly({{29,11},{33,9},{37,9},{34,11},{32,14},{30,18},{29,19},{29,16},{27,18},{28,14}},6)
poly({{33,10},{37,9},{39,11},{40,14},{39,16},{37,13},{35,12},{33,15},{31,19},{30,19},{32,14}},7)
line(32,10,29,14,5)
poly({{27,20},{29,18},{30,15},{30,18},{29,21}},4)
poly({{31,20},{33,17},{33,21},{32,22},{30,22}},6)
-- Right-facing human face; nose, grin and chin have separate clusters.
poly({{37,13},{40,14},{41,17},{43,18},{42,19},{42,21},{40,23},{37,23},{35,21},{35,17}},8)
poly({{37,14},{39,14},{40,17},{42,18},{41,19},{41,21},{39,22},{37,22},{36,20},{36,17}},11)
line(36,20,37,21,10);line(37,22,39,22,10)
-- Half-lidded amber-gray eye and confident eyebrow.
line(38,15,40,15,8)
line(37,16,40,16,1)
dot(38,17,18);dot(39,17,20);dot(40,17,1)
dot(38,18,10);dot(39,18,10)
line(39,20,41,20,23);dot(40,20,18);dot(40,21,18)
-- Forelock and near cheek lock overlap skin.
poly({{34,12},{37,11},{39,12},{39,14},{38,13},{37,14},{36,17},{35,17},{35,20},{36,22},{35,22},{33,20},{33,17}},4)
poly({{34,12},{37,11},{37,13},{35,16},{34,18},{34,20},{33,18},{34,15}},6)
poly({{39,11},{41,12},{42,15},{42,17},{41,17},{40,14}},6)
-- Ear ornament is attached, with a restrained gold / teal tassel.
dot(42,8,20);dot(42,9,19);dot(42,10,21)
rect(42,11,43,13,12);line(42,11,42,12,14)
-- Collar and cropped torso, turned to the right.
poly({{34,23},{39,23},{40,25},{39,27},{35,27},{33,25}},1)
rect(35,24,39,25,12);rect(37,24,38,25,20);dot(37,25,1)
poly({{33,26},{37,26},{40,28},{41,30},{41,33},{38,35},{33,33},{32,29}},1)
poly({{34,27},{37,27},{39,29},{40,30},{40,32},{37,33},{34,32}},13)
poly({{35,28},{37,28},{39,30},{39,31},{36,32},{35,31}},14)
poly({{33,27},{34,27},{35,29},{34,32},{33,31}},18)
line(34,28,34,31,17)
-- Cream scroll on the front of the crop top, tiny and continuous.
line(39,30,39,31,17);line(38,31,39,31,17);dot(38,32,17)
-- Shoulder strap, waist belt and dull gold buckle.
line(34,26,32,32,2);dot(34,27,20);dot(33,28,20)
rect(33,33,40,34,1);rect(35,33,36,34,20);dot(36,34,2)
line(37,33,39,33,19)
-- Midriff and angled hip belt.
poly({{34,35},{39,35},{40,37},{38,38},{33,37}},10)
poly({{35,35},{38,35},{39,37},{35,37}},11)
dot(38,37,9)
poly({{32,37},{36,38},{40,38},{41,40},{39,41},{34,39},{31,39}},1)
line(32,38,39,40,19);rect(36,38,37,39,20);dot(37,39,1)
-- Teal shorts and cream hems.
poly({{32,39},{35,40},{39,40},{40,43},{38,45},{35,43},{34,45},{30,43}},12)
poly({{32,40},{35,41},{36,42},{34,44},{31,43}},14)
poly({{37,41},{39,41},{39,43},{37,44},{36,42}},13)
line(31,43,33,44,17);line(37,44,39,43,17)
-- Rear arm visible to the right of the torso, bent forward with a fist.
rect(41,27,48,39,0)
poly({{41,29},{42,30},{42,33},{44,35},{46,36},{47,38},{46,39},{44,38},{43,36},{41,35},{40,33}},1)
line(41,31,41,33,17);line(42,34,44,36,10)
line(43,34,44,35,11)
line(44,36,45,37,12);dot(45,36,20)
line(46,37,46,38,10);dot(45,38,11)
-- Near bare shoulder, detached sleeve, glove and readable curled hand.
rect(25,23,32,28,0)
poly({{29,23},{32,23},{34,25},{34,27},{32,30},{29,29},{27,27}},1)
poly({{29,24},{31,24},{33,25},{33,27},{31,28},{29,27}},11)
line(29,27,31,28,10)
line(28,27,31,29,1);dot(28,27,20)
poly({{27,29},{30,30},{30,33},{28,36},{26,37},{24,34},{24,32}},1)
poly({{27,30},{29,31},{29,33},{27,35},{25,34},{25,32}},13)
line(26,31,28,31,17);line(25,32,25,34,18);dot(26,35,17)
poly({{26,35},{28,36},{27,38},{25,39},{24,37}},1)
line(25,35,27,36,20);dot(26,36,19)
line(25,37,26,37,10);line(25,38,26,38,11)
-- Hanging embroidered panel, attached at the hip and distinct from the tail.
poly({{30,37},{33,38},{31,41},{30,46},{27,51},{24,51},{23,49},{25,43},{28,39}},1)
poly({{30,38},{31,39},{29,44},{28,48},{26,50},{24,49},{26,44},{28,40}},14)
line(30,39,28,42,17)
line(28,43,26,45,17);line(26,45,28,45,17);line(28,45,28,46,17)
line(28,46,26,48,17);line(26,48,25,47,17)
line(24,49,26,50,20)
rect(25,51,25,52,19);rect(24,53,25,54,12);dot(24,53,14)
-- Two separated legs with matching grounded boots. No hanging lone pixels.
rect(27,45,34,63,0);rect(35,45,49,63,0)
poly({{30,44},{33,45},{33,47},{31,50},{29,50},{28,48}},8)
poly({{30,45},{32,45},{32,47},{30,49},{29,48}},11)
line(29,48,30,49,10)
poly({{37,45},{40,44},{41,46},{41,50},{40,51},{38,50},{37,47}},8)
poly({{38,45},{40,45},{40,49},{39,50},{38,48}},11)
line(38,46,40,46,1);dot(39,46,20)
-- Socks with cream double stripe and restrained teal tassel.
poly({{28,49},{31,50},{30,56},{31,57},{28,58},{26,57},{27,53}},1)
line(28,50,30,51,17);line(28,52,30,52,17)
line(28,53,28,56,22);dot(30,53,20);line(30,54,30,55,14)
poly({{38,50},{41,50},{42,55},{43,57},{40,58},{39,56}},1)
line(39,51,41,51,17);line(39,53,41,53,17)
line(40,54,41,56,22);dot(41,54,20)
-- Teal-and-cream football boots both point right and meet y61.
poly({{27,56},{30,56},{31,58},{33,59},{34,60},{34,61},{25,61},{25,59},{26,58}},1)
poly({{27,57},{29,57},{30,59},{33,60},{26,60},{26,59}},13)
line(27,57,28,57,17);line(26,59,28,60,18)
line(30,59,32,60,18);dot(33,60,15)
line(28,58,29,58,20);line(29,59,30,59,20)
poly({{40,56},{42,56},{43,58},{46,59},{47,60},{47,61},{39,61},{38,60},{39,57}},1)
poly({{40,57},{41,57},{42,59},{45,59},{46,60},{39,60},{39,58}},13)
line(40,57,41,57,17);line(39,59,40,60,18)
line(43,59,44,60,18);line(44,60,46,60,17)
line(41,58,42,58,20);line(41,59,42,59,20)
-- Consistent selective dark silhouette, no antialias or additional pixels.
local edge={}
for y=1,62 do for x=1,62 do
  if p[y][x]>0 and (p[y-1][x]==0 or p[y+1][x]==0 or p[y][x-1]==0 or p[y][x+1]==0) then
    edge[#edge+1]={x,y,(x<24 and y>28) and 3 or 1}
  end
end end
for _,a in ipairs(edge) do dot(a[1],a[2],a[3]) end
end
