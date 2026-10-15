const RC = (() => {
'use strict';
/* ---------- JPEG encoder (baseline, IJG tables, 4:4:4 / 4:2:2 / 4:2:0) ---------- */
const ZZ=[0,1,8,16,9,2,3,10,17,24,32,25,18,11,4,5,12,19,26,33,40,48,41,34,27,20,13,6,7,14,21,28,35,42,49,56,57,50,43,36,29,22,15,23,30,37,44,51,58,59,52,45,38,31,39,46,53,60,61,54,47,55,62,63];
const QL=[16,11,10,16,24,40,51,61,12,12,14,19,26,58,60,55,14,13,16,24,40,57,69,56,14,17,22,29,51,87,80,62,18,22,37,56,68,109,103,77,24,35,55,64,81,104,113,92,49,64,78,87,103,121,120,101,72,92,95,98,112,100,103,99];
const QC=[17,18,24,47,99,99,99,99,18,21,26,66,99,99,99,99,24,26,56,99,99,99,99,99,47,66,99,99,99,99,99,99].concat(new Array(32).fill(99));
const DC_L_N=[0,1,5,1,1,1,1,1,1,0,0,0,0,0,0,0], DC_L_V=[0,1,2,3,4,5,6,7,8,9,10,11];
const DC_C_N=[0,3,1,1,1,1,1,1,1,1,1,0,0,0,0,0], DC_C_V=[0,1,2,3,4,5,6,7,8,9,10,11];
const AC_L_N=[0,2,1,3,3,2,4,3,5,5,4,4,0,0,1,0x7d];
const AC_L_V=[0x01,0x02,0x03,0x00,0x04,0x11,0x05,0x12,0x21,0x31,0x41,0x06,0x13,0x51,0x61,0x07,0x22,0x71,0x14,0x32,0x81,0x91,0xa1,0x08,0x23,0x42,0xb1,0xc1,0x15,0x52,0xd1,0xf0,0x24,0x33,0x62,0x72,0x82,0x09,0x0a,0x16,0x17,0x18,0x19,0x1a,0x25,0x26,0x27,0x28,0x29,0x2a,0x34,0x35,0x36,0x37,0x38,0x39,0x3a,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x4a,0x53,0x54,0x55,0x56,0x57,0x58,0x59,0x5a,0x63,0x64,0x65,0x66,0x67,0x68,0x69,0x6a,0x73,0x74,0x75,0x76,0x77,0x78,0x79,0x7a,0x83,0x84,0x85,0x86,0x87,0x88,0x89,0x8a,0x92,0x93,0x94,0x95,0x96,0x97,0x98,0x99,0x9a,0xa2,0xa3,0xa4,0xa5,0xa6,0xa7,0xa8,0xa9,0xaa,0xb2,0xb3,0xb4,0xb5,0xb6,0xb7,0xb8,0xb9,0xba,0xc2,0xc3,0xc4,0xc5,0xc6,0xc7,0xc8,0xc9,0xca,0xd2,0xd3,0xd4,0xd5,0xd6,0xd7,0xd8,0xd9,0xda,0xe1,0xe2,0xe3,0xe4,0xe5,0xe6,0xe7,0xe8,0xe9,0xea,0xf1,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf8,0xf9,0xfa];
const AC_C_N=[0,2,1,2,4,4,3,4,7,5,4,4,0,1,2,0x77];
const AC_C_V=[0x00,0x01,0x02,0x03,0x11,0x04,0x05,0x21,0x31,0x06,0x12,0x41,0x51,0x07,0x61,0x71,0x13,0x22,0x32,0x81,0x08,0x14,0x42,0x91,0xa1,0xb1,0xc1,0x09,0x23,0x33,0x52,0xf0,0x15,0x62,0x72,0xd1,0x0a,0x16,0x24,0x34,0xe1,0x25,0xf1,0x17,0x18,0x19,0x1a,0x26,0x27,0x28,0x29,0x2a,0x35,0x36,0x37,0x38,0x39,0x3a,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x4a,0x53,0x54,0x55,0x56,0x57,0x58,0x59,0x5a,0x63,0x64,0x65,0x66,0x67,0x68,0x69,0x6a,0x73,0x74,0x75,0x76,0x77,0x78,0x79,0x7a,0x82,0x83,0x84,0x85,0x86,0x87,0x88,0x89,0x8a,0x92,0x93,0x94,0x95,0x96,0x97,0x98,0x99,0x9a,0xa2,0xa3,0xa4,0xa5,0xa6,0xa7,0xa8,0xa9,0xaa,0xb2,0xb3,0xb4,0xb5,0xb6,0xb7,0xb8,0xb9,0xba,0xc2,0xc3,0xc4,0xc5,0xc6,0xc7,0xc8,0xc9,0xca,0xd2,0xd3,0xd4,0xd5,0xd6,0xd7,0xd8,0xd9,0xda,0xe2,0xe3,0xe4,0xe5,0xe6,0xe7,0xe8,0xe9,0xea,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf8,0xf9,0xfa];
function huff(nrcodes, vals){ const code=new Uint16Array(256), len=new Uint8Array(256); let c=0,k=0;
  for(let l=1;l<=16;l++){ for(let i=0;i<nrcodes[l-1];i++){ code[vals[k]]=c; len[vals[k]]=l; k++; c++; } c<<=1; } return {code,len}; }
const HDCL=huff(DC_L_N,DC_L_V), HDCC=huff(DC_C_N,DC_C_V), HACL=huff(AC_L_N,AC_L_V), HACC=huff(AC_C_N,AC_C_V);
const COS=new Float32Array(64); for(let u=0;u<8;u++)for(let x=0;x<8;x++) COS[u*8+x]=(u===0?Math.SQRT1_2:1)*0.5*Math.cos((2*x+1)*u*Math.PI/16);
function qtab(base,q){ q=Math.max(1,Math.min(100,Math.round(q))); const s=q<50?5000/q:200-2*q; return base.map(v=>Math.max(1,Math.min(255,Math.floor((v*s+50)/100)))); }

function encodeJPEG(rgba,w,h,quality,sub,exif){
  const ql=qtab(QL,quality), qc=qtab(QC,quality);
  // bytes
  let buf=new Uint8Array(Math.max(1<<16, (w*h*0.6)|0)), pos=0;
  const ensure=n=>{ if(pos+n>buf.length){ const nb=new Uint8Array(Math.max(buf.length*2,pos+n+1024)); nb.set(buf); buf=nb; } };
  const b8=v=>{ ensure(1); buf[pos++]=v; }, b16=v=>{ b8(v>>8); b8(v&255); };
  let bitBuf=0, bitCnt=0;
  const wbits=(code,len)=>{ while(len>0){ const take=Math.min(len,8-bitCnt); bitBuf=(bitBuf<<take)|((code>>>(len-take))&((1<<take)-1)); bitCnt+=take; len-=take;
      if(bitCnt===8){ ensure(2); buf[pos++]=bitBuf; if(bitBuf===255) buf[pos++]=0; bitBuf=0; bitCnt=0; } } };
  // headers
  b16(0xFFD8);
  if (exif){ ensure(exif.length); buf.set(exif,pos); pos+=exif.length; }
  else { b16(0xFFE0); b16(16); [0x4A,0x46,0x49,0x46,0,1,1,0,0,1,0,1,0,0].forEach(b8); }
  b16(0xFFDB); b16(132); b8(0); for(let k=0;k<64;k++) b8(ql[ZZ[k]]); b8(1); for(let k=0;k<64;k++) b8(qc[ZZ[k]]);
  const hs = sub==='420'?2: sub==='422'?2:1, vs = sub==='420'?2:1;
  b16(0xFFC0); b16(17); b8(8); b16(h); b16(w); b8(3); b8(1); b8((hs<<4)|vs); b8(0); b8(2); b8(0x11); b8(1); b8(3); b8(0x11); b8(1);
  b16(0xFFC4); b16(2+4*(17)+12+12+162+162);
  [[0x00,DC_L_N,DC_L_V],[0x10,AC_L_N,AC_L_V],[0x01,DC_C_N,DC_C_V],[0x11,AC_C_N,AC_C_V]].forEach(([id,n,v])=>{ b8(id); n.forEach(b8); v.forEach(b8); });
  b16(0xFFDA); b16(12); b8(3); b8(1); b8(0x00); b8(2); b8(0x11); b8(3); b8(0x11); b8(0); b8(63); b8(0);
  // planes
  // colour conversion on the fly: no full-size float planes (saves ~150 MB on a 12 MP photo)
  const blk=new Float32Array(64), tmp=new Float32Array(64), out=new Int16Array(64);
  const fetchY=(bx,by)=>{ for(let y=0;y<8;y++){ const row=Math.min(h-1,by+y)*w; for(let x=0;x<8;x++){ const j=(row+Math.min(w-1,bx+x))*4; blk[y*8+x]=0.299*rgba[j]+0.587*rgba[j+1]+0.114*rgba[j+2]-128; } } };
  const fetchC=(cr,bx,by)=>{ for(let y=0;y<8;y++)for(let x=0;x<8;x++){ let s=0,n=0;
      for(let dy=0;dy<vs;dy++)for(let dx=0;dx<hs;dx++){ const yy=Math.min(h-1,by+y*vs+dy), xx=Math.min(w-1,bx+x*hs+dx), j=(yy*w+xx)*4;
        s += cr ? 0.5*rgba[j]-0.418688*rgba[j+1]-0.081312*rgba[j+2] : -0.168736*rgba[j]-0.331264*rgba[j+1]+0.5*rgba[j+2]; n++; }
      blk[y*8+x]=s/n; } };
  const dct=q=>{ for(let u=0;u<8;u++)for(let x=0;x<8;x++){ let s=0; for(let y=0;y<8;y++) s+=COS[u*8+y]*blk[y*8+x]; tmp[u*8+x]=s; }
    for(let u=0;u<8;u++)for(let v=0;v<8;v++){ let s=0; for(let x=0;x<8;x++) s+=tmp[u*8+x]*COS[v*8+x]; out[u*8+v]=Math.round(s/q[u*8+v]); } };
  const bitsz=v=>{ v=Math.abs(v); let n=0; while(v){ n++; v>>=1; } return n; };
  const emit=(dcPrev,HD,HA)=>{ const dc=out[0], diff=dc-dcPrev, s=bitsz(diff);
    wbits(HD.code[s],HD.len[s]); if(s) wbits(diff<0?diff+(1<<s)-1:diff,s);
    let run=0;
    for(let k=1;k<64;k++){ const v=out[ZZ[k]];
      if(v===0){ run++; continue; }
      while(run>15){ wbits(HA.code[0xF0],HA.len[0xF0]); run-=16; }
      const sz=bitsz(v), sym=(run<<4)|sz; wbits(HA.code[sym],HA.len[sym]); wbits(v<0?v+(1<<sz)-1:v,sz); run=0; }
    if(run>0) wbits(HA.code[0],HA.len[0]);
    return dc; };
  let pY=0,pB=0,pR=0; const mw=8*hs, mh=8*vs;
  for(let my=0;my<h;my+=mh) for(let mx=0;mx<w;mx+=mw){
    for(let vy=0;vy<vs;vy++)for(let hx=0;hx<hs;hx++){ fetchY(mx+hx*8,my+vy*8); dct(ql); pY=emit(pY,HDCL,HACL); }
    fetchC(false,mx,my); dct(qc); pB=emit(pB,HDCC,HACC);
    fetchC(true,mx,my); dct(qc); pR=emit(pR,HDCC,HACC);
  }
  if(bitCnt>0) wbits((1<<(8-bitCnt))-1, 8-bitCnt);
  b16(0xFFD9);
  return buf.slice(0,pos);
}

/* ---------- EXIF: copy APP1 from original, reset orientation ---------- */
function extractExif(ab){
  try{
    const d=new DataView(ab); if(d.getUint16(0)!==0xFFD8) return null;
    let p=2;
    while(p+4<d.byteLength){
      const m=d.getUint16(p); if((m&0xFF00)!==0xFF00) return null;
      const len=d.getUint16(p+2);
      if(m===0xFFE1 && d.getUint32(p+4)===0x45786966){
        const seg=new Uint8Array(ab.slice(p,p+2+len));
        const t=10, dv=new DataView(seg.buffer); const le=dv.getUint16(t)===0x4949;
        const ifd=t+dv.getUint32(t+4,le); const n=dv.getUint16(ifd,le);
        for(let i=0;i<n;i++){ const e=ifd+2+i*12; if(dv.getUint16(e,le)===0x0112){ dv.setUint16(e+8,1,le); } }
        return seg;
      }
      if(m===0xFFDA) return null;
      p+=2+len;
    }
  }catch(_){}
  return null;
}

/* ---------- ZIP (store) ---------- */
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(u){let c=0xFFFFFFFF;for(let i=0;i<u.length;i++)c=CRC[(c^u[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function makeZip(files){ // [{name, data:Uint8Array}]
  const te=new TextEncoder(), parts=[], cd=[]; let off=0;
  for(const f of files){ const nm=te.encode(f.name), c=crc32(f.data), L=new DataView(new ArrayBuffer(30));
    L.setUint32(0,0x04034b50,true); L.setUint16(4,20,true); L.setUint16(8,0,true); L.setUint32(14,c,true); L.setUint32(18,f.data.length,true); L.setUint32(22,f.data.length,true); L.setUint16(26,nm.length,true);
    parts.push(new Uint8Array(L.buffer),nm,f.data);
    const C=new DataView(new ArrayBuffer(46)); C.setUint32(0,0x02014b50,true); C.setUint16(4,20,true); C.setUint16(6,20,true); C.setUint32(16,c,true); C.setUint32(20,f.data.length,true); C.setUint32(24,f.data.length,true); C.setUint16(28,nm.length,true); C.setUint32(42,off,true);
    cd.push(new Uint8Array(C.buffer),nm); off+=30+nm.length+f.data.length; }
  const cdSize=cd.reduce((s,p)=>s+p.length,0), E=new DataView(new ArrayBuffer(22));
  E.setUint32(0,0x06054b50,true); E.setUint16(8,files.length,true); E.setUint16(10,files.length,true); E.setUint32(12,cdSize,true); E.setUint32(16,off,true);
  return new Blob([...parts,...cd,new Uint8Array(E.buffer)],{type:'application/zip'});
}


return {encodeJPEG, extractExif, makeZip};
})();
