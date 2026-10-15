function makeSample(){
  const mulberry=a=>{return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}};
  const W=2400,H=1600,c=document.createElement('canvas'); c.width=W; c.height=H; const g=c.getContext('2d'); const rnd=mulberry(42);
  let gr=g.createLinearGradient(0,0,0,760); gr.addColorStop(0,'#1d5aa8'); gr.addColorStop(.7,'#86b4de'); gr.addColorStop(1,'#d6e3ea');
  g.fillStyle=gr; g.fillRect(0,0,W,H);
  for(let i=0;i<7;i++){ const cx=rnd()*W, cy=90+rnd()*260, s=90+rnd()*120;
    for(let k=0;k<6;k++){ const x=cx+(rnd()-.5)*s*2.4, y=cy+(rnd()-.5)*s*.5, r=s*(.5+rnd()*.6);
      const rg=g.createRadialGradient(x,y,0,x,y,r); rg.addColorStop(0,'rgba(255,255,255,.85)'); rg.addColorStop(1,'rgba(255,255,255,0)');
      g.fillStyle=rg; g.beginPath(); g.arc(x,y,r,0,7); g.fill(); } }
  { const sx=1880, sy=150; let rg=g.createRadialGradient(sx,sy,0,sx,sy,420); rg.addColorStop(0,'rgba(255,253,240,1)'); rg.addColorStop(.08,'rgba(255,250,225,1)'); rg.addColorStop(.25,'rgba(255,240,200,.45)'); rg.addColorStop(1,'rgba(255,240,200,0)');
    g.fillStyle=rg; g.beginPath(); g.arc(sx,sy,420,0,7); g.fill(); }
  function ridge(base,amp,seed,freq){ const r=mulberry(seed), ph=[r()*9,r()*9,r()*9,r()*9], ys=new Float32Array(W+1);
    for(let x=0;x<=W;x++){ const u=x/W*freq; ys[x]=base-amp*(.55*Math.sin(u*1.1+ph[0])+.3*Math.sin(u*2.7+ph[1])+.15*Math.sin(u*6.3+ph[2])+.07*Math.sin(u*15+ph[3])); }
    return ys; }
  function fillRidge(ys,fill){ g.fillStyle=fill; g.beginPath(); g.moveTo(0,H); for(let x=0;x<=W;x+=2) g.lineTo(x,ys[x]); g.lineTo(W,H); g.fill(); }
  // far snowy range
  const far=ridge(560,230,3,5); fillRidge(far,'#7e93ad');
  for(let x=0;x<W;x+=2){ const snow=470+Math.sin(x*.05)*18+rnd()*14; if (far[x]<snow){ g.fillStyle=rnd()<.8?'#eef3f8':'#c9d5e2'; g.fillRect(x,far[x],2,snow-far[x]); } }
  for(let i=0;i<500;i++){ const x=rnd()*W|0, y=far[x]+rnd()*180; g.fillStyle='rgba(60,72,96,.25)'; g.fillRect(x,y,2+rnd()*4,8+rnd()*30); }
  // haze
  gr=g.createLinearGradient(0,520,0,760); gr.addColorStop(0,'rgba(214,227,234,0)'); gr.addColorStop(1,'rgba(214,227,234,.75)'); g.fillStyle=gr; g.fillRect(0,520,W,240);
  // forest ridge
  const mid=ridge(820,120,9,4); fillRidge(mid,'#3e5f4c');
  for(let i=0;i<5000;i++){ const x=rnd()*W|0, y=mid[x]+rnd()*260, s=6+rnd()*12; g.fillStyle=rnd()<.5?'#2c4a3a':'#557a5b'; g.beginPath(); g.moveTo(x,y-s*1.6); g.lineTo(x-s*.6,y); g.lineTo(x+s*.6,y); g.fill(); }
  // meadow
  const near=ridge(1040,70,17,2.4);
  gr=g.createLinearGradient(0,960,0,H); gr.addColorStop(0,'#7da33f'); gr.addColorStop(1,'#4f7a2a'); g.fillStyle=gr;
  g.beginPath(); g.moveTo(0,H); for(let x=0;x<=W;x+=2) g.lineTo(x,near[x]); g.lineTo(W,H); g.fill();
  // road
  g.strokeStyle='#c9b48d'; g.lineWidth=60; g.lineCap='round'; g.beginPath(); g.moveTo(700,H+40); g.bezierCurveTo(900,1350,1500,1250,1300,1090); g.stroke();
  g.strokeStyle='rgba(120,100,70,.35)'; g.lineWidth=6; g.stroke();
  // houses
  const roofs=['#9c3b2b','#7a4a35','#3f6a8c','#a8452f','#5b5f66'];
  const houses=[[980,1050,150],[1180,1010,120],[1400,1030,170],[1640,1060,140],[1840,1020,110],[820,1110,130],[1560,1150,190]];
  houses.forEach(([x,y,s],n)=>{ const hgt=s*.62;
    g.fillStyle='#f0ebe1'; g.fillRect(x,y-hgt,s,hgt); g.fillStyle='#cdc4b4'; g.fillRect(x+s*.72,y-hgt,s*.28,hgt);
    g.fillStyle=roofs[n%roofs.length]; g.beginPath(); g.moveTo(x-s*.1,y-hgt); g.lineTo(x+s*.5,y-hgt-s*.42); g.lineTo(x+s*1.1,y-hgt); g.fill();
    g.fillStyle='#2b2f36'; for(let k=0;k<2;k++) g.fillRect(x+s*(.14+k*.3),y-hgt*.68,s*.14,s*.18);
    g.fillStyle='#5a3d2a'; g.fillRect(x+s*.75,y-hgt*.62,s*.12,hgt*.62); });
  // church
  g.fillStyle='#f4f1ea'; g.fillRect(2060,860,90,210); g.fillStyle='#2f7a5f'; g.beginPath(); g.ellipse(2105,860,44,52,0,Math.PI,0); g.fill();
  g.fillStyle='#d9b04a'; g.fillRect(2102,770,6,46); g.fillRect(2093,785,24,5); g.fillStyle='#2b2f36'; g.fillRect(2093,920,24,40);
  // trees
  for(let i=0;i<26;i++){ const x=600+rnd()*1700, y=1000+rnd()*160, r=24+rnd()*36;
    g.fillStyle=rnd()<.5?'#2f5a2a':'#41702f'; g.beginPath(); g.ellipse(x,y-r,r*.55,r*1.3,0,0,7); g.fill(); g.fillStyle='#4a3424'; g.fillRect(x-3,y,6,14); }
  // grass & flowers
  for(let i=0;i<14000;i++){ const x=rnd()*W, y=1120+rnd()*(H-1120), len=6+(y-1100)/18*rnd();
    g.strokeStyle=['#5f8f2e','#88ad42','#3e6a22','#a6b84f'][i%4]; g.lineWidth=1.5+(y-1100)/400; g.beginPath(); g.moveTo(x,y); g.lineTo(x+(rnd()-.5)*6,y-len); g.stroke(); }
  for(let i=0;i<900;i++){ const x=rnd()*W, y=1250+rnd()*(H-1250), r=2+(y-1250)/90;
    g.fillStyle=['#d8333a','#f2c230','#8c5ad6','#f4f1ea'][i%4]; g.beginPath(); g.arc(x,y,r,0,7); g.fill(); }
  // fence
  g.fillStyle='#6b4a32'; for(let x=0;x<760;x+=70){ g.fillRect(x,1360-x*.12,14,170); } g.fillRect(0,1380,760,12); g.fillRect(0,1440,760,12);
  // fine texture
  const id=g.getImageData(0,0,W,H), d=id.data; for(let i=0;i<d.length;i+=4){ const n=(rnd()-.5)*10; d[i]+=n; d[i+1]+=n; d[i+2]+=n; } g.putImageData(id,0,0);
  return c;
}

