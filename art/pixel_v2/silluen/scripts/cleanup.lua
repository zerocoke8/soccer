-- Native pixel cleanup of the sampled draft. Coordinates are native 64x64 pixels.
-- The draft supplies pose and design; deliberate clusters replace resampling noise.
return function(s,palette)
 local layers={}
 local im
 local function layer(name)
  local l=s:newLayer();l.name=name;im=Image(64,64,ColorMode.RGB)
  s:newCel(l,1,im,Point(0,0));layers[#layers+1]={layer=l,image=im};return im
 end
 local function px(x,y,c) if x>=0 and x<64 and y>=0 and y<64 then im:drawPixel(x,y,c==0 and 0 or palette[c]) end end
 local function rect(x,y,w,h,c) for yy=y,y+h-1 do for xx=x,x+w-1 do px(xx,yy,c) end end end
 local function line(x0,y0,x1,y1,c)
  local dx,dy=math.abs(x1-x0),-math.abs(y1-y0);local sx=x0<x1 and 1 or -1;local sy=y0<y1 and 1 or -1;local e=dx+dy
  while true do px(x0,y0,c);if x0==x1 and y0==y1 then break end;local e2=2*e;if e2>=dy then e=e+dy;x0=x0+sx end;if e2<=dx then e=e+dx;y0=y0+sy end end
 end
 local function poly(points,c,outline)
  local ymin,ymax=64,0;for _,p in ipairs(points) do ymin=math.min(ymin,p[2]);ymax=math.max(ymax,p[2]) end
  for y=ymin,ymax do
   local nodes={};local j=#points
   for i=1,#points do local a,b=points[i],points[j]
    if (a[2]<=y and b[2]>y) or (b[2]<=y and a[2]>y) then nodes[#nodes+1]=a[1]+(y-a[2])/(b[2]-a[2])*(b[1]-a[1]) end;j=i
   end
   table.sort(nodes);for i=1,#nodes-1,2 do for x=math.ceil(nodes[i]),math.floor(nodes[i+1]) do px(x,y,c) end end
  end
  for i=1,#points do local a,b=points[i],points[i%#points+1];line(a[1],a[2],b[1],b[2],outline or c) end
 end
 layer('Hair - long straight back locks')
 poly({{27,14},{35,13},{41,16},{45,21},{46,29},{45,37},{46,44},{47,51},{45,55},{41,56},{39,53},{24,56},{20,54},{18,50},{19,43},{20,33},{20,24},{23,18}},3,1)
 poly({{25,22},{29,20},{28,35},{26,44},{25,53},{23,55},{20,52},{20,44},{22,34}},4)
 poly({{24,29},{26,26},{25,39},{23,47},{23,53},{21,51},{22,40}},5)
 poly({{41,22},{44,26},{44,38},{45,49},{44,53},{42,54},{41,44}},4)
 line(43,36,44,49,5);line(44,49,43,52,5)
 poly({{27,37},{30,37},{28,51},{26,54},{25,53}},2)
 line(20,43,20,50,3)

 layer('Body - socks and boots')
 poly({{29,48},{35,49},{34,58},{34,60},{28,60},{28,57}},9,7)
 poly({{37,48},{42,48},{41,58},{43,60},{37,60},{36,57}},9,7)
 rect(29,52,5,6,24);rect(29,52,4,1,15);rect(29,53,2,4,25);rect(33,53,1,5,22)
 rect(37,52,4,6,24);rect(37,52,4,1,15);rect(37,53,2,4,25);rect(40,53,1,5,22)
 poly({{28,57},{31,57},{32,58},{34,59},{35,60},{34,61},{28,61},{27,60}},15,1)
 rect(28,58,3,2,24);rect(30,59,4,1,24);rect(29,58,2,1,20);rect(28,60,6,1,2)
 poly({{37,57},{40,57},{41,58},{43,59},{43,61},{37,61},{36,60}},15,1)
 rect(37,58,3,2,24);rect(39,59,3,1,24);rect(38,58,2,1,20);rect(37,60,5,1,2)

 layer('Outfit - moss bodice and ivory side panels')
 poly({{31,37},{37,36},{40,39},{41,46},{40,50},{37,52},{35,50},{33,51},{29,50},{28,45},{29,39}},14,1)
 poly({{30,39},{36,38},{39,40},{38,43},{33,44},{30,42}},24)
 rect(31,39,4,2,25);rect(37,41,2,2,23)
 poly({{29,42},{31,43},{32,45},{38,44},{39,42},{40,44},{39,48},{30,48}},15)
 rect(31,46,8,1,19);rect(34,45,2,3,20);rect(35,46,1,1,25)
 poly({{31,48},{35,48},{35,50},{33,51},{30,50}},14)
 poly({{36,48},{39,48},{40,50},{37,51},{35,50}},2)
 poly({{29,44},{31,46},{29,51},{28,58},{25,57},{25,52},{27,47}},24,18)
 poly({{29,47},{29,50},{27,55},{27,57},{26,56},{27,50}},25)
 line(28,50,26,55,16);rect(25,55,3,1,20);px(26,53,16)
 poly({{40,44},{42,46},{43,52},{44,57},{41,58},{39,55},{39,49}},15,18)
 poly({{41,47},{42,51},{42,55},{43,56},{41,56},{40,51},{40,48}},24)
 line(41,52,42,55,16);rect(41,56,2,1,20)
 -- Gold collar and a readable leaf-shaped brooch.
 line(31,38,33,40,20);line(33,40,36,38,20);rect(34,40,1,2,19)

 layer('Arms - ivory sleeves and gloves')
 poly({{28,39},{30,40},{29,43},{28,45},{26,44},{25,42},{26,40}},10,7)
 rect(27,40,2,2,11)
 poly({{25,43},{28,44},{28,48},{26,49},{23,47},{24,44}},24,2)
 rect(24,44,2,3,25);rect(24,47,3,1,20);rect(25,44,3,1,15)
 poly({{25,48},{28,48},{28,51},{27,52},{25,51},{24,50}},14,1)
 rect(26,50,2,1,10);px(27,49,11)
 poly({{40,40},{42,41},{43,45},{41,46},{40,43}},10,7)
 poly({{41,44},{43,44},{44,47},{43,49},{40,48}},24,2)
 rect(42,45,1,2,25);line(41,47,43,47,20)
 poly({{41,48},{43,48},{44,50},{43,51},{41,51},{40,50}},14,1)
 rect(42,49,1,2,10)

 layer('Face - pointed ears, eyes and gentle smile')
 -- Ears deliberately wider than the draft to remain unmistakably elven at 1x.
 poly({{13,25},{17,25},{24,27},{26,30},{23,32},{19,30},{16,28}},10,7)
 line(15,26,23,28,11);line(18,28,23,30,8);rect(21,29,3,1,9)
 poly({{43,29},{50,29},{48,32},{44,34},{42,32}},9,7)
 line(44,30,48,30,11);line(45,32,47,31,8)
 poly({{27,23},{36,22},{42,26},{43,31},{41,36},{38,38},{32,38},{28,36},{25,32},{25,27}},10,7)
 poly({{27,25},{35,24},{40,27},{41,32},{39,36},{32,37},{28,34},{26,31}},11)
 line(28,35,31,37,10);line(32,37,38,37,10)
 -- Wide-set three-pixel irises, dark lashes, white one-pixel catchlights.
 line(28,29,31,29,7);px(27,28,7);rect(28,30,4,3,25)
 rect(29,30,2,3,15);rect(29,31,2,1,28);rect(29,32,2,1,17);px(29,30,26);px(31,30,7)
 line(37,29,40,29,7);px(41,30,7);rect(37,30,4,3,25)
 rect(38,30,2,3,15);rect(38,31,2,1,28);rect(38,32,2,1,17);px(38,30,26);px(40,30,7)
 line(28,27,31,27,8);line(38,27,40,28,8)
 rect(27,33,2,1,13);rect(40,33,2,1,13)
 rect(34,35,2,1,12);px(36,34,9)

 layer('Hair - cap, highlight band and chunky fringe')
 poly({{22,22},{23,18},{26,15},{30,13},{36,13},{40,15},{43,18},{45,22},{46,28},{45,34},{43,38},{41,39},{42,34},{43,29},{41,24},{39,22},{37,24},{35,27},{33,29},{33,25},{31,26},{29,28},{27,29},{26,32},{27,36},{29,39},{26,38},{24,35},{23,30}},4,2)
 -- Solid highlight masses, no dither or isolated strand pixels.
 poly({{25,19},{27,16},{31,14},{36,14},{39,16},{35,16},{31,18},{28,21},{26,24},{24,24}},5)
 poly({{27,18},{30,15},{34,14},{36,14},{33,16},{30,17}},6)
 poly({{24,22},{26,20},{28,19},{27,23},{25,27},{24,31},{24,26}},5)
 poly({{31,19},{35,17},{39,17},{37,20},{34,22},{32,25},{29,27},{28,27},{29,23}},5)
 poly({{32,18},{35,17},{37,17},{35,19},{32,20},{30,22}},6)
 poly({{38,19},{40,18},{42,21},{42,24},{40,22},{38,24},{35,27},{34,27},{35,23}},5)
 poly({{43,22},{44,24},{45,28},{44,32},{43,35},{42,37},{42,34},{43,29}},5)
 line(30,20,28,23,3);line(36,18,33,21,4)
 line(40,19,42,22,3);line(25,29,25,34,3)
 line(26,35,28,37,5)

 layer('Accessories - leaf ornament and gold earring')
 poly({{22,20},{22,17},{25,12},{26,15},{25,19},{23,22}},16,14)
 line(23,19,25,15,17)
 poly({{22,21},{19,20},{17,16},{20,17},{23,20}},16,14)
 line(19,18,21,20,17)
 poly({{23,21},{26,20},{29,20},{27,23},{24,24},{22,23}},15,14)
 line(24,22,27,21,17)
 rect(22,22,2,2,19);px(22,22,21);px(23,23,20)
 line(21,31,21,33,18);rect(20,33,2,2,20);px(20,33,21)
 line(21,35,20,38,2);rect(20,36,1,3,3)
 -- Commit after drawing; Aseprite cels own copies of the supplied images.
 for _,item in ipairs(layers) do item.layer:cel(1).image=item.image end
 return layers
end
