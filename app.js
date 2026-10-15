(() => {
'use strict';
const $ = s => document.querySelector(s);
const tick = () => new Promise(r => setTimeout(r, 0));
const frame = () => new Promise(r => requestAnimationFrame(() => r()));
const fmt1 = v => v.toFixed(1).replace('.', ',');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastT = 0;
function toast(t, ms){ const el=$('#toast'); if(!t){ el.hidden=true; return; } el.textContent=t; el.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>el.hidden=true, ms||2600); }

/* ================= storage ================= */
const DB = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('mylnitsa', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos', {keyPath:'id'}); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('photos', mode); const out = fn(t.objectStore('photos')); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); }); };
  return { all: () => tx('readonly', st => st.getAll()), put: rec => tx('readwrite', st => st.put(rec)), del: id => tx('readwrite', st => st.delete(id)) };
})();
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch(_) {}

/* ================= engine ================= */
const view = $('#view');
let E;
try { E = GLE.Engine(view); }
catch (e) { $('#stage').innerHTML = '<p style="padding:24px;color:#fff;font-size:15px;line-height:1.4">Этому браузеру не хватает WebGL 2. Откройте приложение в Safari на iPhone (iOS 15 или новее).</p>'; throw e; }
const MAX_SRC = Math.min(E.maxTex, 8192);

/* ================= state ================= */
const newCrop = () => ({rot:0, angle:0, aspect:null, zoom:1, ox:0, oy:0});
const defP = () => ({...BASE, ...PRESETS[0].p, preset:PRESETS[0].id});
let photos = [], cur = -1;
const sample = {P:defP(), crop:newCrop(), name:'mylnitsa.jpg'};
const camState = {P:defP(), crop:{...newCrop(), aspect:4/3}};
let mode = 'edit', tab = 'flt', compare = false, loadedImg = null, adjOpen = false, sampleImg = null;
const item = () => mode==='cam' ? camState : (cur>=0 ? photos[cur] : sample);
const P = () => item().P;
const crop = () => item().crop;

/* ================= icons ================= */
const I = (d, extra='') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
const ICON = {
  ev: I('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>'),
  blow: I('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>'),
  contrast: I('<circle cx="12" cy="12" r="8"/><path d="M12 4v16M12 8h6M12 12h8M12 16h6"/>'),
  sat: I('<circle cx="9" cy="10" r="5"/><circle cx="15" cy="10" r="5"/><circle cx="12" cy="15" r="5"/>'),
  temp: I('<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9v7"/>'),
  tint: I('<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z"/>'),
  ccd: I('<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 2.5v2.5M15 2.5v2.5M9 19v2.5M15 19v2.5M2.5 9H5M2.5 15H5M19 9h2.5M19 15h2.5"/><rect x="9" y="9" width="6" height="6" rx="1"/>'),
  flash: I('<path d="M13 2.5 5.5 13H11l-1 8.5L17.5 11H12z"/>'),
  fsize: I('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" stroke-dasharray="2 2.6"/>'),
  vig: I('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><ellipse cx="12" cy="12" rx="5.5" ry="4"/>'),
  soft: I('<circle cx="12" cy="12" r="7" stroke-dasharray="1.2 2.4"/><circle cx="12" cy="12" r="3"/>'),
  sharp: I('<path d="M12 3.5 20 19H4z"/><path d="M12 9v5"/>'),
  ca: I('<circle cx="10" cy="12" r="5.5" stroke="#ff5a5a"/><circle cx="14" cy="12" r="5.5" stroke="#5ab4ff"/>'),
  gtype: I('<circle cx="7" cy="8" r="1.4" fill="currentColor"/><circle cx="13" cy="6" r="1" fill="currentColor"/><circle cx="17" cy="11" r="1.6" fill="currentColor"/><circle cx="9" cy="14" r="1.1" fill="currentColor"/><circle cx="15" cy="17" r="1.3" fill="currentColor"/><path d="M4 4h16v16H4z" stroke-dasharray="2 2"/>'),
  iso: I('<circle cx="7" cy="7" r="1.2" fill="currentColor"/><circle cx="12" cy="9" r="1.2" fill="currentColor"/><circle cx="17" cy="6" r="1.2" fill="currentColor"/><circle cx="6" cy="13" r="1.2" fill="currentColor"/><circle cx="11" cy="15" r="1.2" fill="currentColor"/><circle cx="17" cy="13" r="1.2" fill="currentColor"/><circle cx="8" cy="18.5" r="1.2" fill="currentColor"/><circle cx="15" cy="18.5" r="1.2" fill="currentColor"/>'),
  gsize: I('<circle cx="7" cy="12" r="1.5" fill="currentColor"/><circle cx="12.5" cy="12" r="2.5" fill="currentColor"/><circle cx="18.5" cy="12" r="3.3" fill="currentColor"/>'),
  chroma: I('<circle cx="7" cy="8" r="2" fill="#ff5a5a" stroke="none"/><circle cx="15" cy="7" r="2" fill="#5ab4ff" stroke="none"/><circle cx="11" cy="14" r="2" fill="#7ee07e" stroke="none"/><circle cx="18" cy="15" r="2" fill="#ff5ad6" stroke="none"/><circle cx="6" cy="17" r="2" fill="#ffd25a" stroke="none"/>'),
  pix: I('<path d="M4 4h5v5H4zM9 9h5v5H9zM14 4h5v5h-5zM4 14h5v5H4zM14 14h5v5h-5z"/>'),
  res: I('<rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="M7 15V9l2.5 3L12 9v6M15 15V9h2a1.5 1.5 0 0 1 0 3h-2"/>'),
  date: I('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  strength: I('<path d="M12 4 3 9l9 5 9-5z"/><path d="M3 14l9 5 9-5"/>'),
  angle: I('<path d="M4 18h16"/><path d="M6 16 18 8" /><path d="M14 18a6 6 0 0 0-1.6-4.1"/>'),
  zoom: I('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5M11 8v6M8 11h6"/>'),
  rot: I('<path d="M5 9h9a4 4 0 0 1 4 4v6"/><path d="M8 6 5 9l3 3"/><rect x="5" y="13" width="9" height="7" rx="1.5"/>'),
  reset: I('<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/>'),
  dice: I('<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.1" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.1" fill="currentColor"/>'),
};

/* ================= parameters ================= */
const pct = v => Math.round(v*100);
const sgn = v => (v>0?'+':v<0?'−':'')+Math.round(Math.abs(v)*100);
const PARAMS = [
  {k:'ev', label:'Экспозиция', short:'Экспоз.', min:-1, max:1, center:true, fmt:v=>(v>0?'+':v<0?'−':'')+fmt1(Math.abs(v))},
  {k:'blow', label:'Пересвет', short:'Пересвет', min:0, max:1, fmt:pct},
  {k:'contrast', label:'Контраст', short:'Контраст', min:0, max:1, fmt:pct},
  {k:'sat', label:'Насыщенность', short:'Насыщ.', min:0, max:2, fmt:v=>sgn(v-1), ring:v=>(v-1), centerAt:1},
  {k:'temp', label:'Тепло', short:'Тепло', min:-1, max:1, center:true, fmt:sgn},
  {k:'tint', label:'Оттенок', short:'Оттенок', min:-1, max:1, center:true, fmt:sgn},
  {k:'ccd', label:'Цвет CCD', short:'CCD', min:0, max:1, fmt:pct},
  {k:'flash', label:'Вспышка', short:'Вспышка', min:0, max:1, fmt:v=>v<.02?'выкл':pct(v), hint:'Коснитесь фото, чтобы навести вспышку'},
  {k:'fsize', label:'Пятно вспышки', short:'Пятно', min:0, max:1, fmt:pct},
  {k:'vig', label:'Виньетка', short:'Виньетка', min:0, max:1, fmt:pct},
  {k:'soft', label:'Мыло', short:'Мыло', min:0, max:1, fmt:pct},
  {k:'sharp', label:'Резкость', short:'Резкость', min:0, max:1.5, fmt:pct},
  {k:'ca', label:'Цветная кайма', short:'Кайма', min:0, max:1, fmt:pct},
  {k:'gtype', label:'Тип зерна', short:'Тип зерна', opts:[[0,'Цифровой CCD'],[1,'Плёночное'],[2,'Сетка матрицы']]},
  {k:'iso', label:'Зерно', short:'Зерно', min:0, max:1, fmt:pct},
  {k:'gsize', label:'Размер зерна', short:'Размер', min:0, max:1, fmt:pct},
  {k:'chroma', label:'Цветной шум', short:'Цв. шум', min:0, max:1, fmt:pct},
  {k:'pix', label:'Пиксели', short:'Пиксели', opts:[[0,'Выкл'],[1024,'1024'],[640,'VGA 640'],[320,'320']]},
  {k:'res', label:'Матрица', short:'Матрица', opts:[[640,'VGA'],[1600,'2 Мп'],[2048,'3 Мп'],[2560,'5 Мп'],[3648,'10 Мп']]},
  {k:'date', label:'Дата в углу', short:'Дата', opts:[[0,'Выкл'],[1,'Вкл']]},
  {k:'strength', label:'Сила эффекта', short:'Сила', min:0, max:1, fmt:pct},
];
let selParam = 'ev', cropParam = 'angle';
const presetBase = () => { const pr = PRESETS.find(x=>x.id===P().preset); return {...BASE, ...(pr?pr.p:{})}; };

/* ================= dial ================= */
const dialC = $('#dialC'), dctx = dialC.getContext('2d');
let dialT = null; // {label, get, set, min, max, center, fmt, reset}
function drawDial(){
  const dpr = Math.min(3, devicePixelRatio||1), W = dialC.clientWidth*dpr, H = dialC.clientHeight*dpr;
  if (!W) return;
  if (dialC.width!==W || dialC.height!==H){ dialC.width=W; dialC.height=H; }
  dctx.clearRect(0,0,W,H); if (!dialT) return;
  const sp = 9*dpr, N = 60, span = sp*N, fr = (dialT.get()-dialT.min)/(dialT.max-dialT.min), off = fr*span, cx = W/2;
  const zeroI = dialT.zero!=null ? Math.round((dialT.zero-dialT.min)/(dialT.max-dialT.min)*N) : -1;
  for (let i=0;i<=N;i++){ const x = cx + i*sp - off; if (x<-sp||x>W+sp) continue;
    const major = i%5===0, z = i===zeroI, edge = Math.min(1, Math.min(x, W-x)/(W*.25));
    dctx.globalAlpha = (major?.75:.4)*Math.max(0,edge); dctx.fillStyle = z ? '#ffd60a' : '#fff';
    const h = z ? H*.55 : major ? H*.38 : H*.24; dctx.fillRect(Math.round(x-dpr*.5), (H-h)/2, Math.max(1,dpr*(z?1.6:1)), h); }
  dctx.globalAlpha = 1; dctx.fillStyle = '#ffd60a'; dctx.fillRect(Math.round(cx-dpr), H*.12, 2*dpr, H*.76);
  $('#rLabel').textContent = dialT.label; $('#rVal').textContent = dialT.fmt(dialT.get());
}
(() => { let st=null, lastTap=0;
  const d = $('#dial');
  d.addEventListener('pointerdown', e => { if(!dialT) return; d.setPointerCapture(e.pointerId); st = {x:e.clientX, v:dialT.get()};
    const now=Date.now(); if (now-lastTap<300 && dialT.reset){ dialT.reset(); st=null; } lastTap=now; });
  d.addEventListener('pointermove', e => { if(!st||!dialT) return; const span = 9*60;
    let v = st.v - (e.clientX-st.x)/span*(dialT.max-dialT.min); v = Math.min(dialT.max, Math.max(dialT.min, v));
    if (dialT.zero!=null && Math.abs(v-dialT.zero) < (dialT.max-dialT.min)*.012) v = dialT.zero;
    dialT.set(v); });
  ['pointerup','pointercancel'].forEach(t => d.addEventListener(t, () => st=null));
})();
new ResizeObserver(drawDial).observe(dialC);

/* ================= bottom content ================= */
const itemsEl = $('#items'), optsEl = $('#opts'), camF = $('#camFilters');
function ringVal(p){ const v = P()[p.k];
  if (p.opts){ const i = p.opts.findIndex(o=>o[0]===v); return {v: i<=0?0:i/(p.opts.length-1), neg:false}; }
  if (p.centerAt!=null){ const d=(v-p.centerAt)/(p.max-p.centerAt); return {v:Math.abs(d), neg:d<0}; }
  if (p.center) return {v:Math.abs(v)/p.max, neg:v<0};
  return {v:(v-p.min)/(p.max-p.min), neg:false}; }
function buildAdjItems(container){
  container.innerHTML='';
  PARAMS.forEach(p => { const b=document.createElement('button'); b.type='button'; b.className='it'; b.dataset.k=p.k; b.id='prm-'+p.k;
    b.innerHTML = `<div class="ring">${ICON[p.k]||''}</div><span>${p.short}</span>`;
    b.onclick = () => { selParam=p.k; refreshBottom(); if (p.hint && P().flash<.02 && p.k==='flash') toast(p.hint); }; container.appendChild(b); });
}
function paintAdjItems(){ itemsEl.querySelectorAll('.it[data-k]').forEach(b => { const p = PARAMS.find(x=>x.k===b.dataset.k); const r = ringVal(p);
  const ring=b.firstElementChild; ring.style.setProperty('--v', Math.min(1,r.v).toFixed(3)); ring.classList.toggle('neg', r.neg); b.setAttribute('aria-pressed', p.k===selParam); }); }
function filterChips(container, onPick){
  container.innerHTML='';
  const mk = (id, name, fn, icon) => { const b=document.createElement('button'); b.type='button'; b.className='chip'; b.dataset.id=id; b.id='f-'+id; b.innerHTML=(icon||'')+esc(name); b.onclick=()=>{ fn(); onPick&&onPick(); }; container.appendChild(b); };
  PRESETS.forEach(pr => mk(pr.id, pr.name, () => applyPreset(pr.p, pr.id, pr.name)));
  loadMine().forEach((m,i) => mk('mine'+i, m.name, () => applyPreset(m.p, 'mine'+i, m.name)));
  mk('random', 'Случайный', randomPreset, ICON.dice);
}
function paintChips(container){ container.querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', b.dataset.id===P().preset)); }
function setOpts(p){ optsEl.innerHTML=''; p.opts.forEach(([v,t]) => { const b=document.createElement('button'); b.type='button'; b.textContent=t; b.setAttribute('aria-pressed', P()[p.k]===v);
  b.onclick=()=>{ P()[p.k]=v; changed(); }; optsEl.appendChild(b); }); }

function paramDial(p){ return {label:p.label, min:p.min, max:p.max, zero: p.centerAt!=null?p.centerAt : p.center?0:null, fmt:p.fmt,
  get:()=>P()[p.k], set:v=>{ P()[p.k]=v; changed(true); }, reset:()=>{ P()[p.k]=presetBase()[p.k]; changed(); } }; }
let builtTab = null;
function refreshBottom(){
  const inCam = mode==='cam';
  $('#adjust').hidden = inCam && !adjOpen;
  camF.hidden = !inCam;
  const t = inCam ? 'adj' : tab;
  if (builtTab !== t+mode){ builtTab = t+mode;
    if (t==='adj') buildAdjItems(itemsEl);
    else if (t==='flt') filterChips(itemsEl);
    else buildCropItems();
    if (inCam) filterChips(camF);
  }
  optsEl.hidden = true; $('#dial').hidden = false;
  if (t==='adj'){ const p = PARAMS.find(x=>x.k===selParam);
    if (p.opts){ dialT = {label:p.label, get:()=>P()[p.k], fmt:v=>(p.opts.find(o=>o[0]===v)||['',''])[1], min:0, max:1};
      $('#dial').hidden = true; optsEl.hidden = false; setOpts(p); $('#rLabel').textContent=p.label; $('#rVal').textContent=''; }
    else dialT = paramDial(p);
    paintAdjItems();
  } else if (t==='flt'){
    dialT = {label:'Интенсивность', min:0, max:1, fmt:pct, get:()=>P().strength, set:v=>{ P().strength=v; changed(true,true); }, reset:()=>{ P().strength=1; changed(true,true); }};
    paintChips(itemsEl);
  } else {
    const c = crop();
    dialT = cropParam==='angle'
      ? {label:'Выпрямить', min:-15, max:15, zero:0, fmt:v=>(v>0?'+':v<0?'−':'')+fmt1(Math.abs(v)).replace(',0','')+'°', get:()=>crop().angle, set:v=>{ crop().angle=v; cropChanged(); }, reset:()=>{ crop().angle=0; cropChanged(); }}
      : {label:'Масштаб', min:1, max:3, zero:1, fmt:v=>fmt1(v)+'×', get:()=>crop().zoom, set:v=>{ crop().zoom=v; cropChanged(); }, reset:()=>{ crop().zoom=1; cropChanged(); }};
    itemsEl.querySelectorAll('[data-crop]').forEach(b => b.setAttribute('aria-pressed', b.dataset.crop===cropParam));
    itemsEl.querySelectorAll('[data-asp]').forEach(b => b.setAttribute('aria-pressed', String(c.aspect)===b.dataset.asp));
  }
  if (inCam) paintChips(camF);
  if (!$('#dial').hidden) drawDial();
  $('#grid').hidden = !(t==='crop' && !inCam);
  updateMarker();
}
const ASPECTS = [[null,'Ориг.'],[4/3,'4:3'],[3/2,'3:2'],[1,'1:1'],[16/9,'16:9']];
function buildCropItems(){
  itemsEl.innerHTML='';
  const it = (id, label, icon, fn, data) => { const b=document.createElement('button'); b.type='button'; b.className='it'; b.id='crop-'+id; if(data) b.dataset.crop=data;
    b.innerHTML=`<div class="ring" style="--v:0">${icon}</div><span>${label}</span>`; b.onclick=fn; itemsEl.appendChild(b); };
  it('angle','Выпрямить',ICON.angle,()=>{ cropParam='angle'; refreshBottom(); },'angle');
  it('zoom','Масштаб',ICON.zoom,()=>{ cropParam='zoom'; refreshBottom(); },'zoom');
  it('rot','Повернуть',ICON.rot,()=>{ const c=crop(); c.rot=(c.rot+1)%4; c.ox=0; c.oy=0; cropChanged(); });
  it('reset','Сбросить',ICON.reset,()=>{ Object.assign(crop(),newCrop()); cropChanged(); refreshBottom(); });
  ASPECTS.forEach(([a,t],i) => { const b=document.createElement('button'); b.type='button'; b.className='chip'; b.style.alignSelf='center'; b.dataset.asp=String(a); b.id='asp-'+i; b.textContent=t;
    b.onclick=()=>{ const c=crop(); c.aspect=a; c.ox=0; c.oy=0; cropChanged(); refreshBottom(); }; itemsEl.appendChild(b); });
}

/* ================= state changes ================= */
const rec = p => ({id:p.id, name:p.name, date:p.date, taken:p.taken, blob:p.blob, exif:p.exif, crop:p.crop, P:p.P, thumb:p.thumb});
function persist(p){ if (!p || !p.id) return; clearTimeout(p._t); p._t = setTimeout(() => DB.put(rec(p)).catch(()=>{}), 400); }
function changed(fromDial, keepPreset){
  if (!keepPreset) P().preset = null;
  persist(item()); requestRender();
  if (fromDial){ drawDial(); paintAdjItems(); paintChips(itemsEl); if (mode==='cam') paintChips(camF); }
  else refreshBottom();
}
function cropChanged(){ persist(item()); requestRender(); drawDial(); }
function applyPreset(p, id, name){ const old = P(); const np = {...BASE, ...p, preset:id||null}; np.date = old.date; if (!('fx' in p)){ np.fx=old.fx; np.fy=old.fy; }
  if (mode==='cam') camState.P = np; else item().P = np; persist(item()); requestRender(); refreshBottom(); if (name) showName(name); }
const rr = (a,b) => a + Math.random()*(b-a), pick = a => a[Math.floor(Math.random()*a.length)];
function randomPreset(){
  const bw = Math.random()<.12, ir = !bw && Math.random()<.08, fl = Math.random()<.25;
  const p = {ev:rr(-.3,.4), temp:rr(-.6,.5), tint:rr(-.2,.2), ccd:rr(.2,.9), sat:bw?1:rr(.85,1.3), contrast:rr(.1,.55)+(bw?.4:0), blow:rr(.2,.7),
    flash:fl?rr(.4,.9):0, fsize:rr(.3,.7), fx:.5, fy:.48, vig:rr(.1,.55), soft:rr(.05,.6), sharp:rr(.35,1.1), ca:rr(.05,.6),
    iso:rr(.08,.65), gtype:pick([0,0,1,2]), gsize:rr(.1,.7), chroma:bw?0:rr(.05,.5), res:pick([640,1600,2048,2048,2560,3648]), bw:bw?1:0, ir:ir?1:0};
  applyPreset(p, 'random', 'Случайный');
}
function showName(n){ const el=$('#fname'); el.textContent=n; el.classList.add('on'); clearTimeout(showName.t); showName.t=setTimeout(()=>el.classList.remove('on'), 650); }

/* tabs */
['flt','adj','crop'].forEach(t => $('#t-'+t).onclick = () => { tab=t; ['flt','adj','crop'].forEach(o => $('#t-'+o).setAttribute('aria-selected', o===t)); refreshBottom(); });

/* my presets (saved from album/save sheet) */
const loadMine = () => { try { return JSON.parse(localStorage.getItem('myl_presets')||'[]'); } catch(_) { return []; } };
const saveMine = l => { try { localStorage.setItem('myl_presets', JSON.stringify(l)); return true; } catch(_) { return false; } };

/* ================= decoding ================= */
function capImage(bm){ const L = Math.max(bm.width, bm.height); if (L <= MAX_SRC) return bm;
  const s = MAX_SRC/L, c = document.createElement('canvas'); c.width=Math.round(bm.width*s); c.height=Math.round(bm.height*s);
  const g = c.getContext('2d'); g.imageSmoothingQuality='high'; g.drawImage(bm,0,0,c.width,c.height); bm.close && bm.close(); return c; }
let heicReady = null;
function loadHeic(){ if (window.heic2any) return Promise.resolve(); if (heicReady) return heicReady;
  heicReady = new Promise((res, rej) => { const s=document.createElement('script'); s.src='heic2any.min.js'; s.onload=res; s.onerror=()=>{ heicReady=null; rej(new Error('heic-lib')); }; document.head.appendChild(s); }); return heicReady; }
const isHeic = f => /hei[cf]/i.test(f.type||'') || /\.hei[cf]$/i.test(f.name||'');
async function decode(blob){
  try { return capImage(await createImageBitmap(blob, {imageOrientation:'from-image'})); } catch(_) {}
  try { const url=URL.createObjectURL(blob); const im=await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=url; });
    const c=document.createElement('canvas'); c.width=im.naturalWidth; c.height=im.naturalHeight; c.getContext('2d').drawImage(im,0,0); URL.revokeObjectURL(url); return capImage(c); } catch(_) {}
  if (isHeic(blob)) { await loadHeic(); const out = await window.heic2any({blob, toType:'image/png'}); return capImage(await createImageBitmap(Array.isArray(out)?out[0]:out)); }
  throw new Error('decode');
}
async function makeThumb(img){ const S=240, c=document.createElement('canvas'); c.width=S; c.height=S; const g=c.getContext('2d');
  const w=img.width, h=img.height, m=Math.min(w,h); g.imageSmoothingQuality='high'; g.drawImage(img,(w-m)/2,(h-m)/2,m,m,0,0,S,S);
  return new Promise(r => c.toBlob(b => r(b), 'image/jpeg', .82)); }
function exifDate(seg){ try{ if(!seg) return null; const dv=new DataView(seg.buffer,seg.byteOffset,seg.byteLength), t=10, le=dv.getUint16(t)===0x4949;
  const u16=o=>dv.getUint16(t+o,le), u32=o=>dv.getUint32(t+o,le);
  const read=(ifd,tag)=>{ const n=u16(ifd); for(let i=0;i<n;i++){ const e=ifd+2+i*12; if(u16(e)===tag) return e; } return -1; };
  const str=e=>{ const cnt=u32(e+4), off=cnt>4?u32(e+8):e+8; let s=''; for(let i=0;i<Math.min(cnt,19);i++) s+=String.fromCharCode(dv.getUint8(t+off+i)); return s; };
  const ifd0=u32(4); let e=-1; const ex=read(ifd0,0x8769); if(ex>=0) e=read(u32(ex+8),0x9003); if(e<0) e=read(ifd0,0x0132); if(e<0) return null;
  const m=str(e).match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/); return m? new Date(+m[1],m[2]-1,+m[3],+m[4],+m[5]).getTime() : null; }catch(_){ return null; } }
const stampText = it => { const d = new Date((it&&(it.taken||it.date))||Date.now()); return "'"+String(d.getFullYear()).slice(2)+' '+(d.getMonth()+1)+' '+String(d.getDate()).padStart(2,'0'); };

/* ================= album ================= */
const stamp = d => { const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
function updateCount(){ $('#albumCount').textContent = photos.length ? 'Альбом · '+photos.length : 'Альбом'; $('#sampleTag').hidden = photos.length>0 || mode==='cam'; }
async function addItem({blob, name, exif, P:ip, crop:ic, img, taken}){
  const date = Date.now();
  const it = {id:'p'+date+Math.random().toString(36).slice(2,7), name, date, taken: taken||null, blob, exif, crop: ic||newCrop(), P: ip||{...P()}, thumb: img?await makeThumb(img):null};
  photos.unshift(it); if (cur>=0) cur++;
  try { await DB.put(rec(it)); } catch(e){ toast('Не хватает места: фото не сохранено в альбоме приложения.'); }
  updateCount(); return it;
}
async function addFiles(fl, {P:ip}={}){
  const files = [...fl].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|hei[cf]|tiff?)$/i.test(f.name));
  if (!files.length){ toast('Это не фото. Подойдут JPG, PNG и HEIC.'); return null; }
  let firstImg = null, first = null;
  for (let i=files.length-1;i>=0;i--){ const f=files[i]; toast(`Открываю ${files.length-i} из ${files.length}…`, 60000);
    try { const img = await decode(f); let exif=null; try{ exif = RC.extractExif(await f.arrayBuffer()); }catch(_){}
      const it = await addItem({blob:f, name:f.name||('IMG_'+stamp(new Date())+'.jpg'), exif, taken: exifDate(exif)||f.lastModified||null, img, P: ip?{...ip}:{...P(), preset:P().preset}, crop:newCrop()});
      if (i===0){ firstImg=img; first=it; } else img.close && img.close();
    } catch(e){ toast('Не удалось открыть '+(f.name||'фото')+'.'); await new Promise(r=>setTimeout(r,1200)); }
    await tick(); }
  toast('');
  if (first){ cur = photos.indexOf(first); useImage(firstImg); refreshBottom(); renderAlbum(); }
  return first;
}
async function select(i){ if (mode==='cam') await closeCam(true); cur=i; refreshBottom();
  try { useImage(await decode(photos[i].blob)); } catch(e){ toast('Не удалось открыть фото.'); } }
$('#file').addEventListener('change', e => { addFiles(e.target.files); e.target.value=''; });

let selecting = false, selected = new Set();
function renderAlbum(){
  const g=$('#agrid'); g.innerHTML='';
  const add=document.createElement('button'); add.type='button'; add.className='cell add'; add.innerHTML='<div><b>+</b><br>Из галереи</div>'; add.onclick=()=>$('#file').click(); g.appendChild(add);
  photos.forEach((p,i) => { const b=document.createElement('button'); b.type='button'; b.className='cell'+(i===cur?' cur':''); b.setAttribute('aria-label','Фото '+(i+1));
    if (selecting) b.setAttribute('aria-pressed', selected.has(p.id));
    const im=document.createElement('img'); im.alt=''; if(!p.thumbURL && p.thumb) p.thumbURL=URL.createObjectURL(p.thumb); im.src=p.thumbURL||''; b.appendChild(im);
    if (selecting){ const t=document.createElement('i'); t.className='tick'; b.appendChild(t); }
    b.onclick=()=>{ if (selecting){ selected.has(p.id)?selected.delete(p.id):selected.add(p.id); renderAlbum(); } else { closeAlbum(); select(i); } };
    g.appendChild(b); });
  if (!photos.length){ const e=document.createElement('p'); e.className='aempty'; e.textContent='Здесь будут ваши снимки. Снимайте камерой или добавьте фото из галереи.'; g.appendChild(e); }
  $('#abar').hidden = !selecting; $('#albumSelect').textContent = selecting ? 'Отмена' : 'Выбрать';
  $('#aDelete').disabled = !selected.size; $('#aApply').disabled = !selected.size;
  $('#aDelete').textContent = selected.size ? `Удалить (${selected.size})` : 'Удалить';
}
function openAlbum(){ selecting=false; selected.clear(); renderAlbum(); $('#album').hidden=false; }
function closeAlbum(){ $('#album').hidden=true; }
$('#openAlbum').onclick = openAlbum;
$('#albumDone').onclick = closeAlbum;
$('#albumSelect').onclick = () => { selecting=!selecting; selected.clear(); renderAlbum(); };
$('#aApply').onclick = () => { const src={...P()}; delete src.fx; delete src.fy; let n=0;
  photos.forEach(p => { if (selected.has(p.id) && p!==item()){ p.P={...p.P, ...src}; persist(p); n++; } });
  toast(`Текущие настройки применены к ${n} фото`); selecting=false; selected.clear(); renderAlbum(); };
$('#aDelete').onclick = () => { const n=selected.size; if(!n) return;
  sheet({title:`Удалить ${n} фото из альбома?`, text:'В «Фото» на iPhone ничего не удалится.', actions:[{label:'Удалить', red:true, run:async()=>{
    const curId = cur>=0?photos[cur].id:null;
    for (const id of selected){ await DB.del(id).catch(()=>{}); const p=photos.find(x=>x.id===id); if(p&&p.thumbURL) URL.revokeObjectURL(p.thumbURL); }
    photos = photos.filter(p=>!selected.has(p.id)); selected.clear(); selecting=false; updateCount();
    const ni = photos.findIndex(p=>p.id===curId);
    if (ni>=0) cur=ni; else if (photos.length){ await select(0); } else { cur=-1; useImage(sampleImg); refreshBottom(); }
    renderAlbum(); }}]}); };

/* ================= rendering ================= */
let raf = 0, lastGeom = null, liveFrame = 0;
const stageEl = $('#stage');
function useImage(img){ E.setSource(img); loadedImg = img; requestRender(); }
function requestRender(){ if (raf || mode==='cam') return; raf = requestAnimationFrame(() => { raf = 0; draw(); }); }
function previewSize(g){
  const dpr = Math.min(3, window.devicePixelRatio||1), aw = stageEl.clientWidth*dpr, ah = stageEl.clientHeight*dpr;
  const s = Math.min(aw/g.cw, ah/g.ch, (mode==='cam'?1500:2600)/Math.max(g.cw,g.ch), 1);
  return {w:Math.max(2,Math.round(g.cw*s)), h:Math.max(2,Math.round(g.ch*s)), dpr};
}
function draw(){
  if (!loadedImg && mode!=='cam') return;
  const g = GLE.cropGeom(E.srcW, E.srcH, crop()); lastGeom = g;
  const sz = previewSize(g);
  if (view.width!==sz.w || view.height!==sz.h){ view.width=sz.w; view.height=sz.h; }
  view.style.width = (sz.w/sz.dpr)+'px'; view.style.height = (sz.h/sz.dpr)+'px';
  E.setStamp(P().date ? stampText(mode==='cam'?null:item()) : null);
  E.render(g, {...P(), seed: mode==='cam' ? (liveFrame*7919)>>>0 : 11}, {w:sz.w, h:sz.h, toScreen:true, bypass:compare});
  E.trim([sz.w+'x'+sz.h]);
  updateMarker();
}
new ResizeObserver(() => { requestRender(); drawDial(); }).observe(stageEl);
function updateMarker(){ const m=$('#marker'); const on = P().flash>.02 && !(tab==='crop'&&mode!=='cam') && !compare; m.hidden=!on;
  if (on){ const x = view.classList.contains('mirror') ? 1-P().fx : P().fx; m.style.left=(x*100)+'%'; m.style.top=(P().fy*100)+'%'; } }

/* gestures on the photo: hold = original, swipe = next filter, tap = aim flash, drag in crop = move frame */
let down = null, holdT = 0;
stageEl.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; stageEl.setPointerCapture(e.pointerId); down = {x:e.clientX, y:e.clientY, x0:e.clientX, y0:e.clientY, t:Date.now(), moved:false, held:false};
  const cropMode = tab==='crop' && mode!=='cam';
  if (!cropMode) holdT = setTimeout(() => { if (down && !down.moved){ down.held=true; compare=true; $('#badge').hidden=false; updateMarker(); requestRender(); } }, 220); });
stageEl.addEventListener('pointermove', e => { if (!down) return; const dx=e.clientX-down.x, dy=e.clientY-down.y;
  if (Math.hypot(e.clientX-down.x0, e.clientY-down.y0)>8) { down.moved = true; clearTimeout(holdT); }
  if (tab==='crop' && mode!=='cam' && down.moved && lastGeom){ const r=view.getBoundingClientRect(), c=crop();
    const fx=dx*lastGeom.cw/r.width, fy=dy*lastGeom.ch/r.height, co=Math.cos(lastGeom.th), si=Math.sin(lastGeom.th);
    c.ox -= (co*fx-si*fy)/lastGeom.Sw; c.oy -= (si*fx+co*fy)/lastGeom.Sh; down.x=e.clientX; down.y=e.clientY; persist(item()); requestRender(); } });
function endPointer(e){ clearTimeout(holdT); if (!down) return; const d=down; down=null;
  if (d.held){ compare=false; $('#badge').hidden=true; updateMarker(); requestRender(); return; }
  if (e.type!=='pointerup') return;
  const dx=e.clientX-d.x0, dy=e.clientY-d.y0, cropMode = tab==='crop' && mode!=='cam';
  if (!cropMode && Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)*1.5 && Date.now()-d.t<700){ stepFilter(dx<0?1:-1); return; }
  if (!d.moved && !cropMode && P().flash>.02){ const r=view.getBoundingClientRect(); let x=(e.clientX-r.left)/r.width; if(view.classList.contains('mirror')) x=1-x;
    if (x>=0&&x<=1){ P().fx=x; P().fy=Math.min(1,Math.max(0,(e.clientY-r.top)/r.height)); persist(item()); updateMarker(); requestRender(); } } }
['pointerup','pointercancel','lostpointercapture'].forEach(t => stageEl.addEventListener(t, endPointer));
stageEl.addEventListener('contextmenu', e => e.preventDefault());
function stepFilter(dir){ const i = PRESETS.findIndex(p=>p.id===P().preset); const n = PRESETS[(i<0?0:(i+dir+PRESETS.length)%PRESETS.length)];
  applyPreset(n.p, n.id, n.name); const b = document.getElementById('f-'+n.id); b && b.scrollIntoView({inline:'center',block:'nearest',behavior:'smooth'}); }

/* ================= camera ================= */
const video = document.createElement('video'); video.playsInline = true; video.muted = true; video.setAttribute('playsinline',''); video.setAttribute('muted','');
let stream = null, camRaf = 0, facing = 'environment', multiCam = false, lensList = [], lensId = null, camPaused = false;
function stopStream(){ if (stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } }
async function startStream(){
  stopStream();
  const size = {width:{ideal:4032}, height:{ideal:3024}};
  stream = await navigator.mediaDevices.getUserMedia({audio:false, video: lensId ? {deviceId:{exact:lensId}, ...size} : {facingMode:facing, ...size}});
  video.srcObject = stream; await video.play();
  view.classList.toggle('mirror', facing==='user');
}
async function listLenses(){
  try { const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput'); multiCam = devs.length>1;
    const back = devs.filter(d=>!/front|фронт|передн/i.test(d.label)), virt = /dual|triple|двойн|тройн/i;
    const uw = back.find(d=>/ultra|сверхширок/i.test(d.label)&&!virt.test(d.label)), tele = back.find(d=>/tele|теле/i.test(d.label)&&!virt.test(d.label));
    const wide = back.find(d=>!/ultra|сверхширок|tele|теле/i.test(d.label)&&!virt.test(d.label));
    lensList = [uw&&{id:uw.deviceId,t:'.5'}, wide&&{id:wide.deviceId,t:'1×'}, tele&&{id:tele.deviceId,t:'3'}].filter(Boolean);
  } catch(_) { lensList = []; }
  const el = $('#lenses'); el.innerHTML=''; el.style.bottom='12px';
  if (facing==='environment' && lensList.length>1){ lensList.forEach(l=>{ const b=document.createElement('button'); b.type='button'; b.textContent=l.t; b.setAttribute('aria-pressed', l.id===lensId || (!lensId && l.t==='1×'));
      b.onclick=async()=>{ lensId=l.id; try{ await startStream(); }catch(e){ toast('Не удалось переключить объектив.'); } listLenses(); }; el.appendChild(b); }); el.hidden=false; }
  else el.hidden = true;
  $('#flipCam').hidden = !multiCam;
}
const hasRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype; let slowMs = 0;
function camLoop(){ if (mode!=='cam') return;
  let dt = 0;
  if (video.readyState>=2 && !camPaused){ const t0=performance.now(); E.setSource(video,{live:true}); liveFrame++; draw(); if (liveFrame%10===0){ E.gl.finish(); slowMs=performance.now()-t0; } dt=Math.max(performance.now()-t0, slowMs); }
  const wait = dt>28 ? Math.min(400, dt*1.5) : 0;   // slow GPU: leave room for touches and UI
  const next = () => setTimeout(camLoop, wait);
  if (hasRVFC) video.requestVideoFrameCallback(next); else camRaf = requestAnimationFrame(next); }
function setModeUI(){ const cam = mode==='cam'; document.body.classList.toggle('cam', cam);
  $('#openCam').hidden = cam; $('#closeCam').hidden = !cam; $('#openAlbum').hidden = cam; $('#camToggles').hidden = !cam; $('#save').hidden = cam; $('#flipCam').hidden = !cam || !multiCam;
  $('#tgAdj').setAttribute('aria-pressed', adjOpen); $('#tgDate').setAttribute('aria-pressed', !!P().date); $('#tgFlash').setAttribute('aria-pressed', P().flash>.02);
  updateCount(); builtTab=null; refreshBottom(); }
async function openCam(){
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ toast('Камера недоступна в этом браузере. Используйте HQ или добавьте фото из альбома.'); return; }
  const keep = {...P()}; mode='cam'; camState.P = keep; adjOpen=false; setModeUI();
  try { await startStream(); await listLenses(); setModeUI(); camLoop(); }
  catch(e){ toast(e && e.name==='NotAllowedError' ? 'Нет доступа к камере. Разрешите его: Настройки → Safari → Камера.' : 'Не удалось включить камеру.', 4000); closeCam(); }
}
async function closeCam(skipReload){
  cancelAnimationFrame(camRaf); stopStream(); mode='edit'; view.classList.remove('mirror'); $('#lenses').hidden=true; $('#shotmsg').hidden=true; setModeUI();
  if (!skipReload){ if (cur>=0){ try{ useImage(await decode(photos[cur].blob)); }catch(_){ } } else useImage(sampleImg); }
}
$('#openCam').onclick = openCam;
$('#closeCam').onclick = () => closeCam();
$('#flipCam').onclick = async () => { facing = facing==='environment' ? 'user' : 'environment'; lensId=null; try{ await startStream(); await listLenses(); }catch(e){ toast('Не удалось сменить камеру.'); } };
$('#tgAdj').onclick = () => { adjOpen=!adjOpen; setModeUI(); };
$('#tgDate').onclick = () => { P().date = P().date?0:1; setModeUI(); toast(P().date?'Дата в углу включена':'Дата выключена', 1200); };
$('#tgFlash').onclick = () => { P().flash = P().flash>.02 ? 0 : .8; if (P().flash){ P().fx=.5; P().fy=.48; } P().preset=null; setModeUI(); toast(P().flash?'Вспышка: коснитесь кадра, чтобы навести':'Вспышка выключена', 1500); };
document.addEventListener('visibilitychange', () => { if (mode!=='cam') return; if (document.hidden) stopStream(); else startStream().catch(()=>{}); });

let lastShot = null, shotT = 0;
$('#shutter').onclick = async () => {
  if (video.readyState<2) return;
  const fx=$('#flashfx'); fx.classList.add('on'); setTimeout(()=>fx.classList.remove('on'),60);
  const w=video.videoWidth, h=video.videoHeight, c=document.createElement('canvas'); c.width=w; c.height=h;
  const g=c.getContext('2d'); if (view.classList.contains('mirror')){ g.translate(w,0); g.scale(-1,1); } g.drawImage(video,0,0);
  camPaused = true;
  try {
    const blob = await new Promise(r => c.toBlob(r,'image/jpeg',.96));
    const it = await addItem({blob, name:'MYL_'+stamp(new Date())+'.jpg', exif:null, img:c, P:{...camState.P}, crop:{...camState.crop}, taken:Date.now()});
    E.setSource(c); const r = exportWith(it); lastShot = {name: outName(it), bytes:r.bytes};
    $('#lastShot').innerHTML=''; const im=document.createElement('img'); im.alt=''; it.thumbURL=URL.createObjectURL(it.thumb); im.src=it.thumbURL; $('#lastShot').appendChild(im);
    $('#shottext').textContent = 'Снято · '+r.W+'×'+r.H; $('#shotmsg').hidden=false; clearTimeout(shotT); shotT=setTimeout(()=>$('#shotmsg').hidden=true, 6000);
    cur = 0;
  } catch(e){ toast('Не удалось сохранить кадр.'); }
  camPaused = false;
};
$('#shotSave').onclick = () => { if (lastShot) shareFiles([lastShot]); };
$('#lastShot').onclick = async () => { if (!photos.length) return; await closeCam(true); await select(0); };
$('#nativeCam').addEventListener('change', async e => { const f=e.target.files[0]; e.target.value=''; if(!f) return;
  const ip = {...camState.P}; if (mode==='cam') await closeCam(true);
  const it = await addFiles([f], {P:ip}); if (it) toast('Снято камерой iPhone в полном качестве', 2500); });

/* ================= export & save ================= */
const outName = p => (p&&p.name ? p.name.replace(/\.[^.]+$/,'') : 'mylnitsa')+'_retro.jpg';
function exportWith(it){
  const g = GLE.cropGeom(E.srcW, E.srcH, it.crop); let W=Math.round(g.cw), H=Math.round(g.ch);
  const L=Math.max(W,H); if (L>MAX_SRC){ const s=MAX_SRC/L; W=Math.round(W*s); H=Math.round(H*s); }
  E.setStamp(it.P.date ? stampText(it) : null);
  const t = E.render(g, {...it.P, seed:11}, {w:W, h:H, toScreen:false, flip:true}); const px = E.read(t); E.dropSet(W,H);
  return {bytes: RC.encodeJPEG(px, W, H, 95, '444', it.exif||null), W, H};
}
let downloads = null;
(async()=>{ try{ downloads = window.claude?.use ? await window.claude.use('downloads') : null; }catch(_){ downloads=null; } })();
async function shareFiles(files){
  const fl = files.map(f => new File([f.bytes], f.name, {type:'image/jpeg'}));
  try { if (navigator.canShare && navigator.canShare({files:fl})){ await navigator.share({files:fl}); return true; } }
  catch(e){ if (e && e.name==='AbortError') return false; }
  if (downloads){ for (const f of files) await downloads.save({filename:f.name, data:new Blob([f.bytes],{type:'image/jpeg'})}); return true; }
  for (const f of fl){ const a=document.createElement('a'); a.href=URL.createObjectURL(f); a.download=f.name; document.body.appendChild(a); a.click(); a.remove(); await new Promise(r=>setTimeout(r,300)); }
  return true;
}
function sheet({title, text, actions, progress}){
  const m=$('#sheetMain'); m.innerHTML = `<div class="msg">${title?`<b>${esc(title)}</b>`:''}${text?esc(text):''}</div>${progress?'<div class="progress"><i id="prog"></i></div>':''}`;
  (actions||[]).forEach(a => { const b=document.createElement('button'); b.type='button'; b.className='act'+(a.red?' red':'')+(a.bold?' bold':''); b.textContent=a.label; b.onclick=()=>{ closeSheet(); a.run(); }; m.appendChild(b); });
  $('#sheet').hidden=false; $('#sheetCancel').hidden = !!progress;
}
function closeSheet(){ $('#sheet').hidden=true; }
$('#sheetCancel').onclick = closeSheet;
$('#sheet').addEventListener('click', e => { if (e.target.id==='sheet' && !$('#sheetCancel').hidden) closeSheet(); });
async function processAndOffer(list){
  sheet({title:'Обрабатываю в полном размере…', progress:true});
  const out=[]; const keepImg = loadedImg;
  for (let i=0;i<list.length;i++){ const it=list[i];
    $('#sheetMain .msg').innerHTML = `<b>Обрабатываю в полном размере…</b>${i+1} из ${list.length}`; const pg=$('#prog'); if(pg) pg.style.width=(i/list.length*100)+'%';
    await frame(); await tick();
    try { const img = it===sample ? sampleImg : (it===photos[cur] && loadedImg) ? loadedImg : await decode(it.blob); E.setSource(img);
      const r = exportWith(it); out.push({name:outName(it), bytes:r.bytes, W:r.W, H:r.H}); if (img!==loadedImg && img!==sampleImg) img.close && img.close(); }
    catch(e){ toast('Не удалось обработать '+it.name); } }
  if (keepImg){ E.setSource(keepImg); requestRender(); }
  if (!out.length){ closeSheet(); return; }
  const mb = out.reduce((s,f)=>s+f.bytes.length,0)/1048576, one = out.length===1 ? `${out[0].W}×${out[0].H}, ` : '';
  sheet({title: out.length===1 ? 'Фото готово' : `Готово: ${out.length} фото`, text: `${one}${fmt1(mb)} МБ, JPEG 95%. В меню выберите «Сохранить изображение».`,
    actions:[{label: out.length===1 ? 'Сохранить в Фото' : `Сохранить ${out.length} фото`, bold:true, run:()=>shareFiles(out)}]});
}
$('#save').onclick = () => {
  const acts = [{label:'Сохранить это фото', bold:true, run:()=>processAndOffer([item()])}];
  if (photos.length>1) acts.push({label:`Сохранить весь альбом (${photos.length})`, run:()=>processAndOffer(photos.slice())});
  acts.push({label:'Запомнить настройки как пресет', run:()=>{ const list=loadMine(); const p={...P()}; delete p.fx; delete p.fy; delete p.preset; delete p.date;
    const name='Мой '+(list.length+1); list.push({name, p}); saveMine(list); builtTab=null; refreshBottom(); toast('Пресет «'+name+'» добавлен в фильтры'); }});
  sheet({actions:acts});
};

/* ================= start ================= */
(async () => {
  sampleImg = makeSample();
  try { const recs = await DB.all(); photos = recs.sort((a,b)=>b.date-a.date).map(r=>({...r})); } catch(_) { photos = []; }
  setModeUI();
  if (photos.length){ cur=0; refreshBottom(); try{ useImage(await decode(photos[0].blob)); }catch(_){ useImage(sampleImg); } }
  else useImage(sampleImg);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
window.__myl = {E, get photos(){return photos;}, exportWith, get mode(){return mode;}, get P(){return P();}, render:()=>requestRender()};
})();
