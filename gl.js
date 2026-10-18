/* ===== Мыльница GPU engine (WebGL2) =====
   geo (crop/rotate, mip-filtered) → colour (v1 look: WB, flash, vignette, CCD colour, contrast, clip,
   optional OKLab hue bands, IR leak, B&W) → soft blur mix ("мыло") → halo sharpening + lateral CA
   + smooth sensor grain → strength mix. Spatial sizes scale with k = outputLong / effectiveSensorRes,
   so preview and 12 MP export look the same. */
const GLE = (() => {
'use strict';
const VS = `#version 300 es
out vec2 uv; void main(){ vec2 p=vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); uv=p; gl_Position=vec4(p*2.0-1.0,0.0,1.0); }`;
const HEAD = `#version 300 es
precision highp float; precision highp int; in vec2 uv; out vec4 o;`;

const FS_GEO = HEAD + `uniform sampler2D S; uniform vec3 m0; uniform vec3 m1;
void main(){ vec2 q=vec2(uv.x,1.0-uv.y); vec2 s=vec2(dot(m0,vec3(q,1.0)),dot(m1,vec3(q,1.0)));
  vec2 a=(dFdx(s)+dFdy(s))*.25, b=(dFdx(s)-dFdy(s))*.25;
  o=vec4((texture(S,s+a).rgb+texture(S,s-a).rgb+texture(S,s+b).rgb+texture(S,s-b).rgb)*.25,1.0); }`;

const FS_COLOR = HEAD + `uniform sampler2D S; uniform vec2 res;
uniform float ev,temp,tint,flash,fsize,vig,ccd,contrast,blow,sat,ir,bw; uniform vec2 fpos;
uniform vec4 bands[4]; uniform float bandL[4]; uniform int nb;
const float PI=3.14159265;
vec3 toOk(vec3 c){ vec3 l=vec3(dot(c,vec3(.4122214708,.5363325363,.0514459929)),dot(c,vec3(.2119034982,.6806995451,.1073969566)),dot(c,vec3(.0883024619,.2817188376,.6299787005)));
  l=pow(max(l,0.0),vec3(1.0/3.0));
  return vec3(dot(l,vec3(.2104542553,.7936177850,-.0040720468)),dot(l,vec3(1.9779984951,-2.4285922050,.4505937099)),dot(l,vec3(.0259040371,.7827717662,-.8086757660))); }
vec3 fromOk(vec3 k){ vec3 l=vec3(k.x+.3963377774*k.y+.2158037573*k.z, k.x-.1055613458*k.y-.0638541728*k.z, k.x-.0894841775*k.y-1.2914855480*k.z); l=l*l*l;
  return vec3(4.0767416621*l.x-3.3077115913*l.y+.2309699292*l.z, -1.2684380046*l.x+2.6097574011*l.y-.3413193965*l.z, -.0041960863*l.x-.7034186147*l.y+1.7076147010*l.z); }
void main(){
  vec3 c=texture(S,uv).rgb; vec3 l=c*c;
  if(ir>0.0){ float Y=dot(l,vec3(.2126,.7152,.0722)); float mx=max(l.r,l.b);
    float fol=smoothstep(.06,.3,(l.g-mx)/(l.g+1e-4))*smoothstep(.005,.04,l.g);
    float mxa=max(l.r,max(l.g,l.b)), mna=min(l.r,min(l.g,l.b)); float chr=mxa>1e-4?(mxa-mna)/mxa:0.0;
    float dark=(1.0-smoothstep(.015,.09,Y))*(1.0-smoothstep(.12,.35,chr));
    float leak=ir*(fol*(.55*Y+.02)+dark*.006+.015*Y); l+=leak*vec3(1.0,.12,.5); }
  float evm=exp2(ev); l*=vec3(evm*(1.0+.16*temp)*(1.0+.03*tint), evm*(1.0-.07*tint), evm*(1.0-.18*temp)*(1.0+.03*tint));
  if(flash>0.0){ vec2 P=uv*res, F=fpos*res; float Lm=max(res.x,res.y); vec2 d=(P-F)/Lm; float dd=dot(d,d);
    float sg=.1+.32*fsize; float hot=exp(-dd/(2.0*sg*sg)); float t=clamp((sqrt(dd)-sg*.7)/(sg*2.2),0.0,1.0);
    float fall=1.0-.8*flash*t*t*(3.0-2.0*t); float amb=1.0-.45*flash, add=flash*hot;
    l=(l*amb+add*(l*vec3(2.1,2.1,2.25)+vec3(.035,.035,.045)))*fall; }
  vec2 v=(uv-.5)*2.0; float rv=dot(v,v)/2.0; float vm=1.0-vig*.75*rv*sqrt(rv+1e-4)*1.4;
  c=sqrt(max(l,0.0))*vm;
  float lum=dot(c,vec3(.299,.587,.114)); float sh=1.0-min(1.0,lum); float s2=sh*sh*ccd;
  c+=vec3(-.035,.008,.04)*s2; float hl=lum*lum*lum*ccd; c.g+=.015*hl; c.b+=.012*hl;
  lum=dot(c,vec3(.299,.587,.114)); float bs=sat*(1.0+.32*ccd)+(c.b>c.r?.12*ccd:0.0);
  c=lum+(c-lum)*bs; c=clamp(c,0.0,1.0);
  float con=contrast*1.6; c+=con*c*(1.0-c)*(2.0*c-1.0);
  c*=1.0+blow*.7;
  // soft shoulder instead of a hard clip: bright sun keeps some detail
  c=mix(c, .82+.18*(1.0-exp(-(c-.82)/.18)), step(.82,c));
  if(nb>0){ vec3 k=toOk(c*c); float C=length(k.yz), C0=C; float hh=degrees(atan(k.z,k.y)); if(hh<0.0) hh+=360.0;
    for(int i=0;i<4;i++){ if(i>=nb) break; vec4 B=bands[i]; float dd=abs(mod(hh-B.x+540.0,360.0)-180.0);
      if(dd<B.y){ float w=(.5+.5*cos(PI*dd/B.y))*min(1.0,C0/.04); hh+=B.z*w; C*=1.0+B.w*w; k.x+=bandL[i]*w*min(1.0,C0/.1); } }
    float hr=radians(hh); k.yz=C*vec2(cos(hr),sin(hr)); c=sqrt(max(fromOk(k),0.0)); }
  if(bw>0.0){ float y=dot(c,vec3(.3,.59,.11)); c=mix(c,vec3(y),bw); }
  o=vec4(clamp(c,0.0,1.0),1.0);
}`;

const FS_DOWN = HEAD + `uniform sampler2D S; uniform vec2 tx; uniform float f;
void main(){ float a=max(0.0,f*.5-.5); vec2 d=tx*a*.5; o=vec4((texture(S,uv+vec2(-d.x,-d.y)).rgb+texture(S,uv+vec2(d.x,-d.y)).rgb+texture(S,uv+vec2(-d.x,d.y)).rgb+texture(S,uv+vec2(d.x,d.y)).rgb)*.25,1.0); }`;

const FS_BLUR = HEAD + `uniform sampler2D S; uniform vec2 dir; uniform float sigma;
void main(){ vec3 s=vec3(0.0); float ws=0.0; float k=-1.0/(2.0*max(sigma*sigma,1e-4));
  for(int i=-12;i<=12;i++){ float x=float(i); float w=exp(x*x*k); s+=w*texture(S,uv+dir*x).rgb; ws+=w; } o=vec4(s/ws,1.0); }`;

const FS_SOFT = HEAD + `uniform sampler2D A; uniform sampler2D B; uniform float m;
void main(){ o=vec4(mix(texture(A,uv).rgb,texture(B,uv).rgb,m),1.0); }`;

const FS_FINAL = HEAD + `uniform sampler2D A; uniform sampler2D Bl; uniform sampler2D O; uniform sampler2D St; uniform vec2 res;
uniform float sharp,ca,iso,chroma,strength,k,flipY,gsize; uniform uint seed; uniform int bypass, gtype, hasSt; uniform vec2 pixN; uniform vec4 stRect;
uint h3(uvec3 v){ v=v*1664525u+1013904223u; v.x+=v.y*v.z; v.y+=v.z*v.x; v.z+=v.x*v.y; v^=v>>16u; v.x+=v.y*v.z; v.y+=v.z*v.x; v.z+=v.x*v.y; return v.x; }
float gn(ivec2 p, uint s){ uint a=h3(uvec3(uvec2(p+ivec2(32768)), s+seed)); float u=float(a&255u)+float((a>>8)&255u)+float((a>>16)&255u)+float(a>>24); return (u/255.0-2.0)*1.732; }
float gf(ivec2 p, uint s){ uint a=h3(uvec3(uvec2(p+ivec2(32768)), s)); float u=float(a&255u)+float((a>>8)&255u)+float((a>>16)&255u)+float(a>>24); return (u/255.0-2.0)*1.732; }
float vn(vec2 x, uint s){ vec2 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f); ivec2 p=ivec2(i);
  return mix(mix(gn(p,s),gn(p+ivec2(1,0),s),f.x),mix(gn(p+ivec2(0,1),s),gn(p+ivec2(1,1),s),f.x),f.y)*1.6; }
vec3 shp(vec2 p){ vec3 a=texture(A,p).rgb; return a+(a-texture(Bl,p).rgb)*sharp; }
vec3 shpPix(vec2 p, vec2 h){ return (shp(p+vec2(-h.x,-h.y))+shp(p+vec2(h.x,-h.y))+shp(p+vec2(-h.x,h.y))+shp(p+vec2(h.x,h.y)))*.25; }
void main(){
  vec2 q=flipY>.5?vec2(uv.x,1.0-uv.y):uv;
  vec3 orig=texture(O,q).rgb;
  if(bypass==1){ o=vec4(orig,1.0); return; }
  bool px=pixN.x>0.0; vec2 P, hb=vec2(0.0); float kk=k;
  if(px){ vec2 cell=floor(q*pixN); q=(cell+.5)/pixN; hb=.25/pixN; P=cell; kk=1.0; } else { P=q*res; }
  vec2 d=q-.5; float s=ca*.006;
  vec3 c = px ? vec3(shpPix(.5+d*(1.0-s),hb).r, shpPix(q,hb).g, shpPix(.5+d*(1.0+s),hb).b)
              : vec3(shp(.5+d*(1.0-s)).r, shp(q).g, shp(.5+d*(1.0+s)).b);
  float lum=clamp(dot(c,vec3(.299,.587,.114)),0.0,1.0), dk=1.0-lum;
  float gs=.6+gsize*1.8;
  if(iso>0.0){
    if(gtype==1){ // film: clumpy, mono, strongest in midtones
      float kc=max(1.0,kk)*gs; float n=vn(P/kc,1u)*.55+vn(P/(kc*2.3),4u)*.35+gn(ivec2(P),5u)*.22;
      float w=.25+2.8*lum*(1.0-lum); c+=n*iso*.075*w; c*= 1.0+n*iso*.02;
    } else if(gtype==2){ // sensor grid: visible pixel cells, column/row banding, RGB mosaic tint
      float cs=max(2.0,kk*2.0*gs); vec2 f=fract(P/cs); ivec2 ci=ivec2(floor(P/cs));
      float edge=min(min(f.x,1.0-f.x),min(f.y,1.0-f.y)); float g=smoothstep(0.0,.18,edge);
      c*=mix(1.0,.55+.45*g,min(1.0,iso*1.1));
      int par=(ci.x&1)+2*(ci.y&1); vec3 tint= par==0?vec3(1.06,.97,.97): par==3?vec3(.97,.97,1.07): vec3(.97,1.05,.97);
      c*=mix(vec3(1.0),tint,iso);
      c+=gf(ivec2(ci.x,0),7u)*iso*.025 + gf(ivec2(0,ci.y),8u)*iso*.012;
      c+=gn(ivec2(P),1u)*iso*(.01+.04*dk);
    } else { // CCD digital noise
      float kc=max(1.0,kk)*gs; float n = kc<=1.05 ? gn(ivec2(P),1u) : vn(P/kc,1u); c+=n*iso*(.012+.07*dk*sqrt(dk));
    }
  }
  if(chroma>0.0){ float cell=5.0*max(kk,.6)*gs; float cr=vn(P/cell,2u), cb=vn(P/cell,3u); float a=chroma*(.015+.12*dk*dk); c.r+=cr*a; c.b+=cb*a; c.g-=(cr+cb)*a*.35; }
  c=mix(orig,c,strength);
  if(hasSt==1){ vec2 qq=flipY>.5?vec2(uv.x,1.0-uv.y):uv; vec2 sq=(qq-stRect.xy)/(stRect.zw-stRect.xy);
    if(sq.x>=0.0&&sq.y>=0.0&&sq.x<=1.0&&sq.y<=1.0){ vec4 t=texture(St,sq); c=c*(1.0-t.a)+t.rgb; } }
  o=vec4(clamp(c,0.0,1.0),1.0);
}`;

function Engine(canvas){
  const gl = canvas.getContext('webgl2',{premultipliedAlpha:false, preserveDrawingBuffer:true, antialias:false, alpha:false});
  if(!gl) throw new Error('no-webgl2');
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const progs = {};
  function compile(type,src){ const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s); if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  function prog(name,fs){ const p=gl.createProgram(); gl.attachShader(p,compile(gl.VERTEX_SHADER,VS)); gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fs)); gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); p.u={}; progs[name]=p; }
  prog('geo',FS_GEO); prog('color',FS_COLOR); prog('down',FS_DOWN); prog('blur',FS_BLUR); prog('soft',FS_SOFT); prog('final',FS_FINAL);
  const vao=gl.createVertexArray(); gl.bindVertexArray(vao);
  const U=(p,n)=> (n in p.u)?p.u[n]:(p.u[n]=gl.getUniformLocation(p,n));

  function mkTex(w,h){ const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    const fb=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,fb); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);
    return {t,fb,w,h}; }
  function freeTex(x){ if(!x) return; gl.deleteTexture(x.t); gl.deleteFramebuffer(x.fb); }
  const sets=new Map();
  function getSet(w,h){ const key=w+'x'+h; let s=sets.get(key);
    if(!s){ s={w,h,T:[mkTex(w,h),mkTex(w,h),mkTex(w,h),mkTex(w,h)],small:new Map()}; sets.set(key,s); } s.used=performance.now(); return s; }
  function dropSet(w,h){ const key=w+'x'+h, s=sets.get(key); if(!s) return; s.T.forEach(freeTex); s.small.forEach(p=>p.forEach(freeTex)); sets.delete(key); }
  function smallPair(s,f){ let p=s.small.get(f); if(!p){ const w=Math.max(1,Math.ceil(s.w/f)), h=Math.max(1,Math.ceil(s.h/f)); p=[mkTex(w,h),mkTex(w,h)]; s.small.set(f,p); } return p; }

  let src=null, srcW=0, srcH=0;
  const stamp={tex:null, aspect:1, text:null};
  // seven-segment date imprint, like the LED date backs of 90s–2000s cameras
  const SEG={'0':'abcdef','1':'bc','2':'abged','3':'abgcd','4':'fgbc','5':'afgcd','6':'afgedc','7':'abc','8':'abcdefg','9':'abcdfg'};
  function drawSeg(g,ch,x,y,w,h,t){
    const sk=.12; const P=(px,py)=>[x+px+(h-py)*sk, y+py];
    const hz=(yy)=>[P(t*.6,yy),P(t*1.1,yy-t/2),P(w-t*1.1,yy-t/2),P(w-t*.6,yy),P(w-t*1.1,yy+t/2),P(t*1.1,yy+t/2)];
    const vt=(xx,y0,y1)=>[P(xx,y0+t*.6),P(xx+t/2,y0+t*1.1),P(xx+t/2,y1-t*1.1),P(xx,y1-t*.6),P(xx-t/2,y1-t*1.1),P(xx-t/2,y0+t*1.1)];
    const m=h/2, segs={a:hz(t/2), g:hz(m), d:hz(h-t/2), f:vt(t/2,0,m), b:vt(w-t/2,0,m), e:vt(t/2,m,h), c:vt(w-t/2,m,h)};
    for(const k of SEG[ch]||''){ const pts=segs[k]; g.beginPath(); g.moveTo(pts[0][0],pts[0][1]); for(const p of pts.slice(1)) g.lineTo(p[0],p[1]); g.closePath(); g.fill(); }
  }
  function setStamp(text, style){
    style = style==null ? 2 : style;
    const key = text ? text+'|'+style : null;
    if(key===stamp.text) return; stamp.text=key;
    if(!text){ return; }
    const H=96, pad=H*.6; let c, g;
    if(style>=2){
      // our monospace font: lime with a soft glow, or white with a thin shadow
      const font=`600 ${Math.round(H*1.08)}px ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace`;
      c=document.createElement('canvas'); g=c.getContext('2d'); g.font=font; const tw=g.measureText(text).width;
      c.width=Math.ceil(tw+pad*2); c.height=Math.ceil(H+pad*2); g=c.getContext('2d'); g.font=font; g.textBaseline='middle';
      const paint=(blur,color,alpha)=>{ g.save(); g.shadowColor=color; g.shadowBlur=blur; g.globalAlpha=alpha; g.fillStyle=color; g.fillText(text,pad,pad+H/2); g.restore(); };
      if(style===2){ paint(H*.3,'#b8ff00',.45); paint(H*.1,'#d4ff1a',.75); paint(H*.02,'#e0ff00',1); paint(0,'#f4ffb8',.45); }
      else { paint(H*.14,'#000000',.55); paint(0,'#ffffff',.95); }
    } else {
      const W=H*.52, T=H*.13, gap=H*.2, sp=H*.34;
      let width=gap; for(const ch of text){ width += ch===' '?sp : ch==="'"?H*.18 : ch==='.'?H*.18 : W+gap*.55; }
      c=document.createElement('canvas'); c.width=Math.ceil(width+pad*2); c.height=Math.ceil(H+pad*2); g=c.getContext('2d');
      const paint=(blur,color,alpha)=>{ g.save(); g.shadowColor=color; g.shadowBlur=blur; g.globalAlpha=alpha; g.fillStyle=color; let x=pad;
        for(const ch of text){ if(ch===' '){ x+=sp; continue; }
          if(ch==="'"){ g.beginPath(); g.moveTo(x+H*.1,pad); g.lineTo(x+H*.16,pad); g.lineTo(x+H*.08,pad+H*.26); g.lineTo(x+H*.02,pad+H*.26); g.closePath(); g.fill(); x+=H*.18; continue; }
          if(ch==='.'){ g.fillRect(x+H*.02,pad+H-T,T,T); x+=H*.18; continue; }
          drawSeg(g,ch,x,pad,W,H,T); x+=W+gap*.55; }
        g.restore(); };
      const C = style===1 ? ['#a8ff00','#c8ff10','#e0ff00','#f4ffa8'] : ['#ff3c00','#ff6a10','#ff9a3c','#ffc070'];
      paint(H*.28,C[0],.55); paint(H*.1,C[1],.8); paint(H*.025,C[2],1); paint(0,C[3],.55);
    }
    const id=g.getImageData(0,0,c.width,c.height), d=id.data; for(let i=0;i<d.length;i+=4){ const a=d[i+3]/255*0.9; d[i]=d[i]*a; d[i+1]=d[i+1]*a; d[i+2]=d[i+2]*a; d[i+3]=a*255; }
    if(!stamp.tex) stamp.tex=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,stamp.tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,c.width,c.height,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(d.buffer));
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    stamp.aspect=c.width/c.height;
  }
  function setSource(img, opt){ const mip=!(opt&&opt.live);
    const w=img.videoWidth||img.width, h=img.videoHeight||img.height;
    if(!src){ src=gl.createTexture(); }
    gl.bindTexture(gl.TEXTURE_2D,src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,img);
    if(mip) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,mip?gl.LINEAR_MIPMAP_LINEAR:gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    srcW=w; srcH=h;
  }
  function pass(p, target, tex, set){ gl.useProgram(p);
    if(target){ gl.bindFramebuffer(gl.FRAMEBUFFER,target.fb); gl.viewport(0,0,target.w,target.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.viewport(0,0,canvas.width,canvas.height); }
    let unit=0; for(const n in tex){ gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D,tex[n]); gl.uniform1i(U(p,n),unit); unit++; }
    set&&set(p); gl.drawArrays(gl.TRIANGLES,0,3); }
  function blur(s, input, sigma, tmpFull, outFull){
    const f=Math.max(1,Math.ceil(sigma/3.5));
    if(f===1){
      pass(progs.blur,tmpFull,{S:input.t},p=>{ gl.uniform2f(U(p,'dir'),1/input.w,0); gl.uniform1f(U(p,'sigma'),sigma); });
      pass(progs.blur,outFull,{S:tmpFull.t},p=>{ gl.uniform2f(U(p,'dir'),0,1/tmpFull.h); gl.uniform1f(U(p,'sigma'),sigma); });
      return outFull; }
    const [a,b]=smallPair(s,f), sg=sigma/f;
    pass(progs.down,a,{S:input.t},p=>{ gl.uniform2f(U(p,'tx'),1/input.w,1/input.h); gl.uniform1f(U(p,'f'),f); });
    pass(progs.blur,b,{S:a.t},p=>{ gl.uniform2f(U(p,'dir'),1/a.w,0); gl.uniform1f(U(p,'sigma'),sg); });
    pass(progs.blur,a,{S:b.t},p=>{ gl.uniform2f(U(p,'dir'),0,1/b.h); gl.uniform1f(U(p,'sigma'),sg); });
    return a;
  }
  /* geom: {m0,m1}; P: params; out: {w,h, toScreen:bool, flip:bool, bypass:bool} */
  function render(geom, P, out){
    const w=out.w, h=out.h, s=getSet(w,h), [T0,T1,T2,T3]=s.T;
    const long=Math.max(w,h), k=long/(P.res||2048);
    pass(progs.geo,T0,{S:src},p=>{ gl.uniform3fv(U(p,'m0'),geom.m0); gl.uniform3fv(U(p,'m1'),geom.m1); });
    let target=out.toScreen?null:T1;
    if(out.bypass){
      pass(progs.final,target,{A:T0.t,Bl:T0.t,O:T0.t},p=>{ gl.uniform1i(U(p,'bypass'),1); gl.uniform1f(U(p,'flipY'),out.flip?1:0); });
      return target; }
    pass(progs.color,T1,{S:T0.t},p=>{ const f=(n,v)=>gl.uniform1f(U(p,n),v);
      gl.uniform2f(U(p,'res'),w,h); f('ev',P.ev); f('temp',P.temp); f('tint',P.tint); f('flash',P.flash); f('fsize',P.fsize);
      f('vig',P.vig); f('ccd',P.ccd); f('contrast',P.contrast); f('blow',P.blow); f('sat',P.sat==null?1:P.sat); f('ir',P.ir||0); f('bw',P.bw||0);
      gl.uniform2f(U(p,'fpos'),P.fx,1-P.fy);
      const B=P.bands||[], arr=new Float32Array(16), L=new Float32Array(4);
      B.slice(0,4).forEach((b,i)=>{ arr.set([b[0],b[1],b[2],b[3]],i*4); L[i]=b[4]||0; });
      gl.uniform4fv(U(p,'bands[0]'),arr); gl.uniform1fv(U(p,'bandL[0]'),L); gl.uniform1i(U(p,'nb'),Math.min(4,B.length)); });
    // "мыло": v1 used two box passes of radius r → variance 2r(r+1)/3
    const rS=(.6+P.soft*2.4)*k, sigS=Math.sqrt(2*rS*(rS+1)/3), m=Math.min(1,P.soft*1.1);
    let Bs = P.soft>0 ? blur(s,T1,sigS,T3,T2) : T1;
    pass(progs.soft,T3,{A:T1.t,B:Bs.t},p=>gl.uniform1f(U(p,'m'),P.soft>0?m:0));
    const rU=Math.max(.5,1.6*k), sigU=Math.max(.45,Math.sqrt(rU*(rU+1)/3));
    const Bu = blur(s,T3,sigU,T1,T2);
    target = out.toScreen?null:T1;
    const stOn = !!(P.date && stamp.tex);
    pass(progs.final,target,{A:T3.t,Bl:Bu.t,O:T0.t,St:stOn?stamp.tex:T0.t},p=>{ const f=(n,v)=>gl.uniform1f(U(p,n),v);
      gl.uniform1i(U(p,'bypass'),0); gl.uniform2f(U(p,'res'),w,h); f('sharp',P.sharp*1.25); f('ca',P.ca); f('iso',P.iso); f('chroma',P.chroma);
      f('strength',P.strength==null?1:P.strength); f('k',k); f('flipY',out.flip?1:0); gl.uniform1ui(U(p,'seed'),(P.seed||7)>>>0);
      f('gsize',P.gsize==null?.3:P.gsize); gl.uniform1i(U(p,'gtype'),P.gtype|0);
      const pn=P.pix|0; if(pn>0){ const L=Math.max(w,h); gl.uniform2f(U(p,'pixN'),Math.round(pn*w/L),Math.round(pn*h/L)); } else gl.uniform2f(U(p,'pixN'),0,0);
      gl.uniform1i(U(p,'hasSt'),stOn?1:0);
      if(stOn){ const m=Math.min(w,h), hh=0.075*m, ww=hh*stamp.aspect, mx=0.03*m; gl.uniform4f(U(p,'stRect'),1-(mx+ww)/w, mx/h, 1-mx/w, (mx+hh)/h); } });
    return target;
  }
  function read(target){ const px=new Uint8Array(target.w*target.h*4); gl.bindFramebuffer(gl.FRAMEBUFFER,target.fb); gl.readPixels(0,0,target.w,target.h,gl.RGBA,gl.UNSIGNED_BYTE,px); return px; }
  function trim(keepKeys){ for(const [key,s] of sets){ if(!keepKeys.includes(key)){ s.T.forEach(freeTex); s.small.forEach(p=>p.forEach(freeTex)); sets.delete(key); } } }
  return {gl, maxTex, setSource, setStamp, render, read, trim, dropSet, get srcW(){return srcW;}, get srcH(){return srcH;}};
}

/* crop → affine map from output (u, v-down) to source uv, plus crop size in source px */
function cropGeom(W,H,c){
  const k=((c.rot%4)+4)%4, Sw=k%2?H:W, Sh=k%2?W:H;
  const th=c.angle*Math.PI/180, co=Math.cos(th), si=Math.sin(th), ac=Math.abs(co), as=Math.abs(si);
  let a = c.aspect ? c.aspect : Sw/Sh; if(c.aspect && Sh>Sw) a=1/a;
  const hmax=Math.min(Sw/(a*ac+as), Sh/(a*as+ac)), ch=hmax/Math.max(1,c.zoom), cw=ch*a;
  // clamp offset so that all crop corners stay inside the (rotated) source
  const inside=(ox,oy)=>{ for(const [sx,sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){ const px=sx*cw/2, py=sy*ch/2; const x=co*px-si*py+ox, y=si*px+co*py+oy; if(Math.abs(x)>Sw/2+1e-6||Math.abs(y)>Sh/2+1e-6) return false; } return true; };
  let ox=c.ox*Sw, oy=c.oy*Sh;
  if(!inside(ox,oy)){ let lo=0,hi=1; for(let i=0;i<24;i++){ const mid=(lo+hi)/2; if(inside(ox*mid,oy*mid)) lo=mid; else hi=mid; } ox*=lo; oy*=lo; }
  c.ox=ox/Sw; c.oy=oy/Sh;
  // inverse of k*90° clockwise display rotation (y-down)
  const ph=-k*Math.PI/2, pc=Math.round(Math.cos(ph)), ps=Math.round(Math.sin(ph));
  // M = D · Rphi · Rth · diag(cw,ch)
  const r00=co*cw, r01=-si*ch, r10=si*cw, r11=co*ch;
  const q00=pc*r00-ps*r10, q01=pc*r01-ps*r11, q10=ps*r00+pc*r10, q11=ps*r01+pc*r11;
  const oxs=pc*ox-ps*oy, oys=ps*ox+pc*oy;
  const M00=q00/W, M01=q01/W, M10=q10/H, M11=q11/H;
  const t0=-(M00*.5+M01*.5)+oxs/W+.5, t1=-(M10*.5+M11*.5)+oys/H+.5;
  return {m0:[M00,M01,t0], m1:[M10,M11,t1], cw, ch, Sw, Sh, th};
}
return {Engine, cropGeom};
})();
