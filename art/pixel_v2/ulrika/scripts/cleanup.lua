-- Native-pixel cleanup over the sampled draft. Coordinates deliberately remain
-- integers; large clusters replace sub-pixel draft details and thin contours.
return function(data,put,rect)
  local owner={};local group='tail';local rawput=put
  put=function(x,y,c)
    rawput(x,y,c)
    if x>=0 and x<64 and y>=0 and y<64 then owner[y*64+x]=group end
  end
  rect=function(x,y,w,h,c) for yy=y,y+h-1 do for xx=x,x+w-1 do put(xx,yy,c) end end end
  -- Draft pose retained: tilted ears, silver bob, raised near hand, far hand on
  -- hip, tail to screen right. Reconstruct native clusters to avoid resample AA.
  for y=0,63 do for x=0,63 do put(x,y,0) end end
  local function line(x0,y0,x1,y1,c)
    local dx,dy=math.abs(x1-x0),-math.abs(y1-y0)
    local sx,sy=x0<x1 and 1 or -1,y0<y1 and 1 or -1
    local e=dx+dy
    while true do
      put(x0,y0,c);if x0==x1 and y0==y1 then break end
      local z=2*e;if z>=dy then e=e+dy;x0=x0+sx end
      if z<=dx then e=e+dx;y0=y0+sy end
    end
  end
  local function poly(v,c)
    local xmin,ymin,xmax,ymax=63,63,0,0
    for _,p in ipairs(v) do xmin=math.min(xmin,p[1]);xmax=math.max(xmax,p[1]);ymin=math.min(ymin,p[2]);ymax=math.max(ymax,p[2]) end
    for y=ymin,ymax do for x=xmin,xmax do
      local inside=false;local j=#v
      for i=1,#v do
        local a,b=v[i],v[j]
        if (a[2]>y)~=(b[2]>y) and x<(b[1]-a[1])*(y-a[2])/(b[2]-a[2])+a[1] then inside=not inside end
        j=i
      end
      if inside then put(x,y,c) end
    end end
    for i=1,#v do local a,b=v[i],v[i%#v+1];line(a[1],a[2],b[1],b[2],c) end
  end
  -- Big fluffy tail, behind the body. Silhouette follows broad stepped tufts.
  poly({{37,44},{41,41},{44,42},{46,41},{46,43},{49,44},{48,45},{51,47},{50,48},{52,50},{51,51},{51,54},{49,56},{47,58},{43,59},{39,58},{37,56},{40,56},{42,54},{42,51},{39,49}},1)
  poly({{39,44},{42,42},{44,44},{46,43},{46,45},{49,46},{48,48},{50,49},{50,53},{48,56},{45,57},{41,57},{40,56},{43,54},{43,50},{40,48}},3)
  poly({{40,44},{43,43},{45,45},{47,45},{46,47},{49,49},{49,52},{47,55},{44,56},{42,56},{45,53},{45,49},{42,47}},4)
  poly({{41,43},{44,44},{43,45},{46,46},{45,47},{47,48},{48,50},{47,52},{46,53},{46,50},{44,49},{44,47},{41,46}},5)
  -- Short legs: thigh, dark knee socks, boots. Both boots face slightly right.
  group='body and outfit'
  poly({{24,49},{29,49},{29,54},{27,57},{27,60},{29,60},{29,61},{21,61},{21,59},{23,56},{23,53}},17)
  rect(24,50,4,4,9);rect(25,50,3,3,10)
  rect(23,54,5,1,24);rect(23,55,4,3,18);rect(23,55,2,3,19)
  rect(22,59,5,2,14);rect(23,58,4,1,24);rect(22,60,6,1,15);rect(22,59,2,1,6)
  poly({{32,49},{37,49},{37,54},{36,57},{37,59},{39,60},{39,61},{31,61},{31,59},{32,56}},17)
  rect(33,50,3,4,9);rect(33,50,2,3,10)
  rect(32,54,5,1,24);rect(32,55,4,3,18);rect(32,55,2,3,19)
  rect(32,59,4,2,14);rect(33,58,3,1,24);rect(32,60,6,1,15);rect(35,59,2,1,6)
  -- Teal shorts with cream hems and simple dark hip harness.
  poly({{26,46},{35,46},{38,48},{37,51},{32,52},{30,50},{28,52},{23,51},{24,48}},13)
  poly({{26,47},{34,47},{36,48},{36,50},{32,50},{31,48},{29,50},{25,50}},15)
  line(25,51,28,51,24);line(33,51,36,51,24)
  line(26,47,35,48,18);rect(31,47,2,2,21);put(31,47,22)
  -- Tiny torso. Crop-top, cream side panel, bare waist and diagonal harness.
  poly({{27,38},{33,38},{36,40},{37,44},{35,47},{27,46},{25,43},{25,40}},13)
  poly({{28,39},{32,39},{35,41},{35,43},{28,43},{26,41}},15)
  rect(29,39,3,2,16);rect(26,40,2,3,24);put(26,40,6)
  rect(28,44,7,2,9);rect(29,44,6,1,10)
  line(27,43,35,43,18);put(32,43,21)
  line(28,39,30,42,18);put(28,39,21)
  -- Raised short arm and simplified hanging cream/teal sleeve.
  poly({{22,39},{25,39},{27,42},{26,46},{23,47},{20,45},{19,42},{18,40},{18,38},{20,37},{21,37}},13)
  poly({{21,41},{24,41},{25,43},{24,45},{22,45},{21,44}},24)
  rect(22,42,2,3,15);put(21,42,6);put(24,43,6)
  rect(20,39,3,3,18);rect(20,39,2,1,21)
  poly({{18,38},{18,36},{19,35},{20,35},{20,36},{22,37},{22,39},{20,39}},7)
  rect(19,36,1,3,10);rect(20,37,2,2,10);put(21,38,9)
  -- Far arm bent at hip: exposed shoulder and compact cuff/hand.
  poly({{35,39},{38,39},{40,42},{40,45},{37,46},{35,44},{37,42}},13)
  rect(36,40,2,2,9);put(36,40,10)
  rect(38,42,2,2,24);put(38,42,6);rect(37,44,3,1,18)
  rect(35,44,3,2,7);rect(35,44,2,1,10);put(36,45,9)
  -- Hair behind face: a large silver bob, deliberately chunky at the ends.
  group='hair face and ears'
  poly({{23,22},{27,20},{32,20},{36,22},{39,25},{40,29},{42,33},{41,36},{39,37},{40,39},{37,39},{36,38},{34,40},{31,39},{28,40},{26,39},{23,40},{22,38},{20,39},{19,37},{17,37},{18,34},{17,31},{18,27},{20,24}},1)
  poly({{22,24},{27,21},{32,21},{36,23},{38,27},{38,31},{40,34},{39,36},{37,37},{38,38},{35,37},{34,39},{32,38},{29,39},{27,37},{24,39},{23,36},{20,38},{20,35},{18,36},{19,32},{18,30},{20,27}},3)
  poly({{23,24},{27,22},{32,22},{35,24},{36,27},{36,32},{37,36},{35,37},{33,35},{28,37},{25,36},{23,37},{21,35},{21,31},{20,30},{21,27}},4)
  -- Wolf ears, one tilted outwards, one upright, silver rim / warm inner fur.
  poly({{17,15},{21,16},{25,19},{26,23},{22,26},{20,23},{18,22}},1)
  poly({{18,16},{21,17},{24,20},{24,23},{22,24},{20,21},{19,21}},4)
  line(18,16,23,19,5)
  poly({{19,18},{22,20},{23,22},{21,23},{20,21}},27)
  poly({{20,20},{22,21},{22,23},{21,22}},6)
  poly({{32,21},{35,17},{38,12},{39,16},{39,23},{36,26}},1)
  poly({{33,22},{36,18},{38,14},{38,22},{36,24}},4)
  line(33,21,37,16,5)
  poly({{36,20},{37,17},{38,21},{37,23},{35,23}},27)
  poly({{36,21},{37,20},{37,23},{35,23}},6)
  -- Face, shifted right for 3/4 front view. Two fully visible eyes.
  poly({{25,27},{29,25},{34,26},{37,28},{38,31},{39,31},{39,34},{37,35},{37,37},{34,39},{29,39},{26,37},{24,34}},7)
  poly({{26,28},{30,26},{34,27},{36,29},{37,32},{38,32},{38,33},{36,34},{36,37},{33,38},{29,38},{26,36},{25,33}},9)
  poly({{27,28},{30,27},{33,28},{36,29},{36,35},{34,37},{29,37},{26,35},{26,32}},10)
  -- Expressive eye clusters: lash, light sclera, 3-px teal iris and glint.
  line(26,31,30,31,7);rect(27,32,4,3,6)
  rect(28,32,2,3,25);rect(28,34,2,1,26);put(28,32,6);put(29,32,13)
  line(26,31,30,31,17);put(26,32,17)
  line(34,30,37,30,17);rect(34,31,3,3,6)
  rect(35,31,2,3,25);rect(35,33,2,1,26);put(35,31,6);put(36,31,13)
  line(27,29,29,29,8);line(34,28,36,28,8)
  rect(26,35,2,1,11);rect(36,34,2,1,11)
  line(31,36,34,36,12);put(32,37,11);put(33,36,6)
  -- Foreground bangs: broad cap, light band, several coherent tapered locks.
  poly({{21,25},{24,22},{28,21},{32,22},{35,24},{37,27},{36,29},{34,28},{32,26},{32,30},{31,32},{29,31},{27,29},{26,27},{25,30},{23,33},{22,36},{20,35},{21,31},{20,29}},2)
  poly({{22,25},{25,23},{28,22},{31,23},{34,24},{35,26},{34,27},{31,25},{31,29},{30,30},{28,28},{26,25},{24,29},{23,32},{22,33},{22,29},{21,28}},4)
  poly({{23,25},{26,23},{29,23},{31,24},{32,25},{29,25},{28,26},{26,24},{24,27},{22,28}},5)
  line(25,24,27,24,6);line(29,24,30,24,6)
  line(24,28,23,31,5);line(30,27,30,29,5)
  -- Side locks frame eyes, with dark underside visible at their stepped tips.
  poly({{38,27},{39,30},{40,32},{39,35},{37,37},{35,38},{36,36},{37,33}},2)
  poly({{38,29},{39,32},{38,35},{37,36},{36,36},{38,33}},4)
  line(38,30,38,33,5)
  line(21,33,21,36,4);put(22,37,4);put(24,37,5)
  -- One gold ear clasp and one simple teal tassel. No embroidered noise.
  rect(39,23,2,3,20);rect(39,23,2,1,22);put(40,24,21)
  rect(39,26,2,3,13);rect(39,26,1,2,16);put(40,28,15)
  -- Final foreground pass restores hand and costume landmarks occluded by bob.
  group='body and outfit'
  rect(28,40,5,1,13);put(31,40,21)
  line(29,41,31,43,18);put(29,41,21);put(32,43,22)
  line(33,41,34,41,16)
  poly({{18,38},{18,36},{19,35},{20,35},{20,36},{22,37},{22,39},{20,40}},7)
  rect(19,36,1,3,10);rect(20,37,2,2,10);put(21,38,9)
  line(19,39,21,40,18);put(20,40,21)
  return owner
end
