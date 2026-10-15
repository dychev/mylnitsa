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
const sample = {P:defP(), crop:newCrop(), name:'ph-y.jpg'};
const camState = {P:defP(), crop:{...newCrop(), aspect:4/3}};
let mode = 'view', tab = 'flt', compare = false, loadedImg = null, adjOpen = false, sampleImg = null;
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
  {k:'date', label:'Дата в углу', short:'Дата', opts:[[0,'Выкл'],[1,"'26 10 15"],[2,"15 10 '26"],[3,'2026.10.15']]},
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
  $('#grid').hidden = mode==='cam' ? !gridOn : !(t==='crop' && mode==='edit');
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
  const p = {ev:rr(-.2,.25), temp:rr(-.5,.45), tint:rr(-.15,.15), ccd:rr(.2,.85), sat:bw?1:rr(.85,1.25), contrast:rr(.05,.3)+(bw?.35:0), blow:rr(.06,.35),
    flash:fl?rr(.4,.9):0, fsize:rr(.3,.7), fx:.5, fy:.48, vig:rr(.08,.45), soft:rr(.05,.5), sharp:rr(.2,.6), ca:rr(.05,.45),
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
async function makeThumb(img, rot){ const S=240, c=document.createElement('canvas'); c.width=S; c.height=S; const g=c.getContext('2d');
  const w=img.width, h=img.height, m=Math.min(w,h); g.imageSmoothingQuality='high';
  if (rot){ g.translate(S/2,S/2); g.rotate(rot*Math.PI/2); g.translate(-S/2,-S/2); }
  g.drawImage(img,(w-m)/2,(h-m)/2,m,m,0,0,S,S);
  return new Promise(r => c.toBlob(b => r(b), 'image/jpeg', .82)); }
function exifDate(seg){ try{ if(!seg) return null; const dv=new DataView(seg.buffer,seg.byteOffset,seg.byteLength), t=10, le=dv.getUint16(t)===0x4949;
  const u16=o=>dv.getUint16(t+o,le), u32=o=>dv.getUint32(t+o,le);
  const read=(ifd,tag)=>{ const n=u16(ifd); for(let i=0;i<n;i++){ const e=ifd+2+i*12; if(u16(e)===tag) return e; } return -1; };
  const str=e=>{ const cnt=u32(e+4), off=cnt>4?u32(e+8):e+8; let s=''; for(let i=0;i<Math.min(cnt,19);i++) s+=String.fromCharCode(dv.getUint8(t+off+i)); return s; };
  const ifd0=u32(4); let e=-1; const ex=read(ifd0,0x8769); if(ex>=0) e=read(u32(ex+8),0x9003); if(e<0) e=read(ifd0,0x0132); if(e<0) return null;
  const m=str(e).match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/); return m? new Date(+m[1],m[2]-1,+m[3],+m[4],+m[5]).getTime() : null; }catch(_){ return null; } }
function stampText(it, fmt){ const d = new Date((it&&(it.taken||it.date))||Date.now()); fmt = fmt || 1;
  const yy=String(d.getFullYear()).slice(2), m=d.getMonth()+1, dd=String(d.getDate()).padStart(2,'0');
  return fmt===2 ? `${dd} ${m} '${yy}` : fmt===3 ? `${d.getFullYear()}.${String(m).padStart(2,'0')}.${dd}` : `'${yy} ${m} ${dd}`; }

/* ================= album ================= */
const stamp = d => { const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
function updateCount(){ $('#albumCount').textContent = photos.length ? 'Альбом · '+photos.length : 'Альбом'; $('#sampleTag').hidden = true; }
async function addItem({blob, name, exif, P:ip, crop:ic, img, taken}){
  const date = Date.now();
  const it = {id:'p'+date+Math.random().toString(36).slice(2,7), name, date, taken: taken||null, blob, exif, crop: ic||newCrop(), P: ip||{...P()}, thumb: img?await makeThumb(img, (ic&&ic.rot)||0):null};
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
  if (first){ cur = photos.indexOf(first); setMode('view'); useImage(firstImg); renderAlbum(); }
  return first;
}
let loadSeq = 0;
async function select(i, toMode){ if (mode==='cam') pauseCam(); cur=i; setMode(toMode||'view');
  const seq = ++loadSeq;
  try { const img = await decode(photos[i].blob); if (seq!==loadSeq){ img.close&&img.close(); return; } useImage(img); } catch(e){ toast('Не удалось открыть фото.'); } }
$('#file').addEventListener('change', e => { addFiles(e.target.files); e.target.value=''; });

let selecting = false, selected = new Set();
function renderAlbum(){
  const g=$('#agrid'); g.innerHTML='';
  const add=document.createElement('button'); add.type='button'; add.className='cell add'; add.innerHTML='<div><b>+</b>Из галереи</div>'; add.onclick=()=>$('#file').click(); g.appendChild(add);
  photos.forEach((p,i) => { const b=document.createElement('button'); b.type='button'; b.className='cell'+(i===cur?' cur':''); b.setAttribute('aria-label','Фото '+(i+1));
    if (selecting) b.setAttribute('aria-pressed', selected.has(p.id));
    const im=document.createElement('img'); im.alt=''; im.loading='lazy'; if(!p.thumbURL && p.thumb) p.thumbURL=URL.createObjectURL(p.thumb); if (p.thumbURL) im.src=p.thumbURL; b.appendChild(im);
    if (selecting){ const t=document.createElement('i'); t.className='tick'; b.appendChild(t); }
    b.onclick=()=>{ if (selecting){ selected.has(p.id)?selected.delete(p.id):selected.add(p.id); renderAlbum(); } else { closeAlbum(); select(i,'view'); } };
    g.appendChild(b); });
  if (!photos.length){ const e=document.createElement('p'); e.className='aempty'; e.textContent='Здесь будут ваши снимки. Снимайте камерой или добавьте фото из галереи.'; g.appendChild(e); }
  $('#abar').hidden = !selecting; $('#albumSelect').textContent = selecting ? 'Отмена' : 'Выбрать';
  ['#aDelete','#aApply','#aSave'].forEach(s => $(s).disabled = !selected.size);
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
$('#aSave').onclick = () => { const list = photos.filter(p=>selected.has(p.id)); selecting=false; selected.clear(); renderAlbum(); closeAlbum(); processAndOffer(list); };
$('#aDelete').onclick = () => { const ids=new Set(selected); if(!ids.size) return;
  sheet({title:`Удалить ${ids.size} фото из альбома?`, text:'В «Фото» на iPhone ничего не удалится.', actions:[{label:'Удалить', red:true, run:()=>deleteIds(ids)}]}); };
async function deleteIds(ids){
  const curId = cur>=0&&photos[cur]?photos[cur].id:null, oldCur=cur;
  for (const id of ids){ await DB.del(id).catch(()=>{}); const p=photos.find(x=>x.id===id); if(p&&p.thumbURL) URL.revokeObjectURL(p.thumbURL); }
  photos = photos.filter(p=>!ids.has(p.id)); selected.clear(); selecting=false; updateCount();
  const ni = photos.findIndex(p=>p.id===curId);
  if (ni>=0) cur=ni; else if (photos.length) await select(Math.min(Math.max(0,oldCur), photos.length-1), 'view'); else { cur=-1; useImage(sampleImg); setMode('view'); }
  renderAlbum(); }

/* ================= viewer / editor modes ================= */
let editBackup = null;
function setMode(m){
  mode = m; const b=document.body; b.classList.toggle('cam', m==='cam'); b.classList.toggle('view', m==='view'); b.classList.toggle('edit', m==='edit');
  const cam=m==='cam', view=m==='view', edit=m==='edit';
  $('#openCam').hidden = !view; $('#closeCam').hidden = !cam; $('#cancelEdit').hidden = !edit;
  $('#openAlbum').hidden = !view; $('#camToggles').hidden = !cam;
  $('#editBtn').hidden = !view; $('#doneEdit').hidden = !edit; $('#flipCam').hidden = !cam || !multiCam;
  $('#tgAdj').setAttribute('aria-pressed', adjOpen); $('#tgDate').setAttribute('aria-pressed', !!P().date); $('#tgFlash').setAttribute('aria-pressed', P().flash>.02);
  $('#tgTap').setAttribute('aria-pressed', tapShoot); $('#tgTimer').setAttribute('aria-pressed', timerSec>0); $('#timerVal').textContent = timerSec?timerSec:'';
  $('#lenses').hidden = !cam || !zoomChips.length;
  $('#tgGrid').setAttribute('aria-pressed', gridOn); $('#tgOrient').setAttribute('aria-pressed', orientRot!==0); if (cam) $('#grid').hidden = !gridOn;
  updateCount(); updateViewerInfo(); builtTab=null; refreshBottom(); requestRender();
}
function updateViewerInfo(){ if (mode!=='view') return; const it = cur>=0?photos[cur]:null;
  if (!it){ $('#vDate').textContent='Пример'; $('#vMeta').textContent='Снимите или добавьте фото'; return; }
  const d=new Date(it.taken||it.date); $('#vDate').textContent = d.toLocaleDateString('ru-RU',{day:'numeric',month:'long'})+', '+d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
  const pr = PRESETS.find(x=>x.id===it.P.preset); $('#vMeta').textContent = `${cur+1} из ${photos.length}` + (pr?' · '+pr.name:''); }
$('#editBtn').onclick = () => { editBackup = {P:JSON.parse(JSON.stringify(P())), crop:{...crop()}}; setMode('edit'); };
$('#doneEdit').onclick = () => { persist(item()); editBackup=null; setMode('view'); };
$('#cancelEdit').onclick = () => { if (editBackup){ item().P = editBackup.P; item().crop = editBackup.crop; persist(item()); } editBackup=null; setMode('view'); };
$('#vDel').onclick = () => { if (cur<0) return; const id=photos[cur].id; sheet({title:'Удалить это фото?', text:'Из альбома приложения. В «Фото» на iPhone ничего не удалится.', actions:[{label:'Удалить фото', red:true, run:()=>deleteIds(new Set([id]))}]}); };
$('#vShare').onclick = () => processAndOffer([item()]);
$('#vRot').onclick = async () => { if (cur<0) return; const it=photos[cur]; it.crop.rot=(it.crop.rot+1)%4; it.crop.ox=0; it.crop.oy=0; persist(it); requestRender();
  if (loadedImg){ it.thumb = await makeThumb(loadedImg, it.crop.rot); if (it.thumbURL) URL.revokeObjectURL(it.thumbURL); it.thumbURL=null; persist(it); } };
function stepPhoto(dir){ if (photos.length<2) return; const n = cur+dir; if (n<0||n>=photos.length){ toast(dir>0?'Это последнее фото':'Это первое фото',1000); return; } select(n,'view'); }

/* ================= rendering ================= */
let raf = 0, lastGeom = null, liveFrame = 0;
const stageEl = $('#stage');
function useImage(img){ E.setSource(img); if (loadedImg && loadedImg!==img && loadedImg!==sampleImg) { loadedImg.close && loadedImg.close(); } loadedImg = img; requestRender(); }
function requestRender(){ if (raf || mode==='cam') return; raf = requestAnimationFrame(() => { raf = 0; draw(); }); }
function previewSize(g){
  const dpr = Math.min(mode==='cam'?2:3, window.devicePixelRatio||1), aw = stageEl.clientWidth*dpr, ah = stageEl.clientHeight*dpr;
  const s = Math.min(aw/g.cw, ah/g.ch, (mode==='cam'?1100:2000)/Math.max(g.cw,g.ch), 1);
  return {w:Math.max(2,Math.round(g.cw*s)), h:Math.max(2,Math.round(g.ch*s)), cssW:g.cw*Math.min(aw/g.cw, ah/g.ch)/dpr, cssH:g.ch*Math.min(aw/g.cw, ah/g.ch)/dpr};
}
function draw(){
  if ((!loadedImg && mode!=='cam') || ctxLost) return;
  const c = mode==='cam' ? {...crop(), zoom: crop().zoom*digitalZoom} : crop();
  const g = GLE.cropGeom(E.srcW, E.srcH, c); lastGeom = g;
  const sz = previewSize(g);
  if (view.width!==sz.w || view.height!==sz.h){ view.width=sz.w; view.height=sz.h; }
  view.style.width = sz.cssW+'px'; view.style.height = sz.cssH+'px';
  E.setStamp(P().date ? stampText(mode==='cam'?null:item(), P().date) : null);
  E.render(g, {...P(), ev:(P().ev||0)+(mode==='cam'&&!hwExpo?camExpo:0), seed: mode==='cam' ? (liveFrame*7919)>>>0 : 11}, {w:sz.w, h:sz.h, toScreen:true, bypass:compare});
  E.trim([sz.w+'x'+sz.h]);
  updateMarker();
}
new ResizeObserver(() => { requestRender(); drawDial(); }).observe(stageEl);
function updateMarker(){ const m=$('#marker'); const on = P().flash>.02 && mode!=='view' && !(tab==='crop'&&mode==='edit') && !compare && !(mode==='cam'&&tapShoot); m.hidden=!on;
  if (on){ const x = view.classList.contains('mirror') ? 1-P().fx : P().fx; m.style.left=(x*100)+'%'; m.style.top=(P().fy*100)+'%'; } }

/* gestures: hold = original · swipe = next photo (viewer) / next filter (editor, camera) · tap = aim flash or shoot · pinch = zoom (camera) · drag in crop */
const ptrs = new Map(); let down = null, holdT = 0, pinch = null;
stageEl.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; stageEl.setPointerCapture(e.pointerId); ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if (ptrs.size===2 && mode==='cam'){ clearTimeout(holdT); const [a,b]=[...ptrs.values()]; pinch={d:Math.hypot(a.x-b.x,a.y-b.y), z:zoomLevel}; down=null; return; }
  if (ptrs.size>1) return;
  askMotion();
  down = {x:e.clientX, y:e.clientY, x0:e.clientX, y0:e.clientY, t:Date.now(), moved:false, held:false, ev0:camExpo, evDrag:false};
  const cropMode = tab==='crop' && mode==='edit';
  if (!cropMode && mode!=='cam') holdT = setTimeout(() => { if (down && !down.moved){ down.held=true; compare=true; $('#badge').hidden=false; updateMarker(); requestRender(); } }, 220); });
stageEl.addEventListener('pointermove', e => { if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if (pinch && ptrs.size>=2){ const [a,b]=[...ptrs.values()]; const d=Math.hypot(a.x-b.x,a.y-b.y); setZoom(pinch.z*d/pinch.d, false); return; }
  if (!down) return; const dx=e.clientX-down.x, dy=e.clientY-down.y;
  if (Math.hypot(e.clientX-down.x0, e.clientY-down.y0)>8) { down.moved = true; clearTimeout(holdT); }
  if (mode==='cam' && !tapShoot && down.moved && (down.evDrag || Math.abs(e.clientY-down.y0)>Math.abs(e.clientX-down.x0)*1.3)){
    down.evDrag = true; setExpo(down.ev0 - (e.clientY-down.y0)/170, expoAt||{x:down.x0,y:down.y0}); return; }
  if (tab==='crop' && mode==='edit' && down.moved && lastGeom){ const r=view.getBoundingClientRect(), c=crop();
    const fx=dx*lastGeom.cw/r.width, fy=dy*lastGeom.ch/r.height, co=Math.cos(lastGeom.th), si=Math.sin(lastGeom.th);
    c.ox -= (co*fx-si*fy)/lastGeom.Sw; c.oy -= (si*fx+co*fy)/lastGeom.Sh; down.x=e.clientX; down.y=e.clientY; persist(item()); requestRender(); } });
function endPointer(e){ ptrs.delete(e.pointerId);
  if (pinch){ if (ptrs.size<2){ pinch=null; setZoom(zoomLevel, true); } return; }
  clearTimeout(holdT); if (!down) return; const d=down; down=null;
  if (d.held){ compare=false; $('#badge').hidden=true; updateMarker(); requestRender(); return; }
  if (e.type!=='pointerup' || d.evDrag) return;
  const dx=e.clientX-d.x0, dy=e.clientY-d.y0, cropMode = tab==='crop' && mode==='edit';
  if (!cropMode && Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)*1.5 && Date.now()-d.t<700){ if (mode==='view') stepPhoto(dx<0?1:-1); else stepFilter(dx<0?1:-1); return; }
  if (d.moved || cropMode) return;
  if (mode==='cam' && tapShoot){ shoot(); return; }
  if (mode==='cam'){ const sr=stageEl.getBoundingClientRect(); expoAt={x:e.clientX,y:e.clientY}; setExpo(0, expoAt); }
  if (mode!=='view' && P().flash>.02){ const r=view.getBoundingClientRect(); let x=(e.clientX-r.left)/r.width; if(view.classList.contains('mirror')) x=1-x;
    if (x>=0&&x<=1){ P().fx=x; P().fy=Math.min(1,Math.max(0,(e.clientY-r.top)/r.height)); persist(item()); updateMarker(); requestRender(); } } }
['pointerup','pointercancel','lostpointercapture'].forEach(t => stageEl.addEventListener(t, endPointer));
stageEl.addEventListener('contextmenu', e => e.preventDefault());
function stepFilter(dir){ const i = PRESETS.findIndex(p=>p.id===P().preset); const n = PRESETS[(i<0?0:(i+dir+PRESETS.length)%PRESETS.length)];
  applyPreset(n.p, n.id, n.name); const b = document.getElementById('f-'+n.id); b && b.scrollIntoView({inline:'center',block:'nearest',behavior:'smooth'}); }

/* ================= camera ================= */
const video = document.createElement('video'); video.playsInline = true; video.muted = true; video.setAttribute('playsinline',''); video.setAttribute('muted','');
let stream = null, camRaf = 0, facing = 'environment', multiCam = false, camPaused = false, tapShoot = false, timerSec = 0;
let camExpo = 0, expoAt = null, hwExpo = null, gridOn = false, lastFrameT = 0, lastVT = -1;
let hwZoom = null, zoomLevel = 1, digitalZoom = 1, lensList = [], lensId = null, zoomChips = [];
try { const s = JSON.parse(localStorage.getItem('myl_cam')||'{}'); tapShoot=!!s.tap; timerSec=s.timer|0; gridOn=!!s.grid; } catch(_){}
const saveCamPrefs = () => { try { localStorage.setItem('myl_cam', JSON.stringify({tap:tapShoot, timer:timerSec, grid:gridOn, orient:orientRot})); } catch(_){} };
/* exposure: tap a point, drag up/down — like the sun slider in the iPhone camera */
function setExpo(v, at){
  camExpo = Math.max(-2, Math.min(2, Math.round(v*20)/20));
  if (hwExpo){ const hv=Math.max(hwExpo.min, Math.min(hwExpo.max, camExpo)); track().applyConstraints({advanced:[{exposureCompensation:hv}]}).catch(()=>{}); }
  const el=$('#expo'); if (at){ const sr=stageEl.getBoundingClientRect(); el.style.left=(at.x-sr.left)+'px'; el.style.top=(at.y-sr.top)+'px'; }
  $('#expoV').textContent = (camExpo>0?'+':camExpo<0?'−':'')+Math.abs(camExpo).toFixed(1).replace('.',',');
  el.hidden=false; el.classList.toggle('set', camExpo!==0); clearTimeout(setExpo.t); setExpo.t=setTimeout(()=>{ el.hidden = true; }, 2500);
  if (P().flash>.02 && at){ const r=view.getBoundingClientRect(); let x=(at.x-r.left)/r.width; if(view.classList.contains('mirror')) x=1-x; if(x>=0&&x<=1){ P().fx=x; P().fy=Math.min(1,Math.max(0,(at.y-r.top)/r.height)); } }
}
/* orientation from the motion sensor: horizontal shots get rotated like in the iPhone camera */
/* orientation without motion sensors (no permission prompts): a button picks how the phone is held */
let orientRot = 0;
try { orientRot = (JSON.parse(localStorage.getItem('myl_cam')||'{}').orient)|0; } catch(_){}
function askMotion(){}
function rotFromGravity(){ return orientRot; }
const ORIENT_LABEL = {0:'Вертикально', 3:'Горизонтально, верх слева', 1:'Горизонтально, верх справа'};

const track = () => stream && stream.getVideoTracks()[0];
function streamAlive(){ const t=track(); return t && t.readyState==='live'; }
async function startStream(){
  if (stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; }
  const size = {width:{ideal:4032}, height:{ideal:3024}};
  stream = await navigator.mediaDevices.getUserMedia({audio:false, video: lensId ? {deviceId:{exact:lensId}, ...size} : {facingMode:facing, ...size}});
  video.srcObject = stream; await video.play();
  view.classList.toggle('mirror', facing==='user');
  const t = track(), caps = t.getCapabilities ? t.getCapabilities() : {};
  hwExpo = caps && caps.exposureCompensation && caps.exposureCompensation.max>caps.exposureCompensation.min ? caps.exposureCompensation : null;
  lastFrameT = performance.now();
  hwZoom = caps && caps.zoom && caps.zoom.max>caps.zoom.min ? {min:caps.zoom.min, max:caps.zoom.max, f: /ultra|triple|dual wide|сверхшир|тройн/i.test(t.label)?.5:1} : null;
}
async function findLenses(){
  try { const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput'); multiCam = devs.length>1;
    const back = devs.filter(d=>!/front|фронт|передн/i.test(d.label)), virt=/dual|triple|двойн|тройн/i;
    const uw = back.find(d=>/ultra|сверхширок/i.test(d.label)&&!virt.test(d.label)), tele = back.find(d=>/tele|теле/i.test(d.label)&&!virt.test(d.label));
    const wide = back.find(d=>!/ultra|сверхширок|tele|теле/i.test(d.label)&&!virt.test(d.label));
    lensList = [uw&&{id:uw.deviceId,f:.5}, wide&&{id:wide.deviceId,f:1}, tele&&{id:tele.deviceId,f:3}].filter(Boolean);
  } catch(_) { lensList = []; }
}
function buildZoomChips(){
  const minZ = hwZoom ? hwZoom.min*hwZoom.f : (facing==='environment' && lensList.some(l=>l.f===.5) ? .5 : 1);
  const maxZ = hwZoom ? Math.min(15, hwZoom.max*hwZoom.f) : 5*(lensList.some(l=>l.f===3)?3:1);
  zoomChips = [.5,1,2,3,5].filter(z=>z>=minZ-1e-3 && z<=maxZ+1e-3);
  if (facing==='user') zoomChips = [];
  const el=$('#lenses'); el.innerHTML=''; el.style.bottom='12px';
  zoomChips.forEach(z => { const b=document.createElement('button'); b.type='button'; b.dataset.z=z; b.onclick=()=>setZoom(z,true); el.appendChild(b); });
  zoomRange = [minZ, maxZ]; paintZoom(); el.hidden = mode!=='cam' || !zoomChips.length;
}
let zoomRange = [1,5];
function fmtZ(z){ return (z<1? String(Math.round(z*10)/10).replace('0.','.') : (Math.round(z*10)/10).toString().replace('.',','))+'×'; }
function paintZoom(){ $('#lenses').querySelectorAll('button').forEach((b,i) => { const z=+b.dataset.z, next=zoomChips[i+1]||99;
  const active = zoomLevel>=z-1e-3 && zoomLevel<next-1e-3; b.classList.toggle('on', active); b.setAttribute('aria-pressed', active); b.textContent = active ? fmtZ(zoomLevel) : (z<1?'.5':String(z)); }); }
let zoomBusy = false;
async function setZoom(z, commit){
  z = Math.min(zoomRange[1], Math.max(zoomRange[0], z)); zoomLevel = z; paintZoom();
  const zv=$('#zoomv'); zv.textContent=fmtZ(z); zv.hidden=false; clearTimeout(setZoom.t); setZoom.t=setTimeout(()=>zv.hidden=true, 900);
  if (hwZoom){ digitalZoom = 1; const v = Math.min(hwZoom.max, Math.max(hwZoom.min, z/hwZoom.f)); try { await track().applyConstraints({advanced:[{zoom:v}]}); } catch(_){} return; }
  // no hardware zoom: pick the physical lens on release, crop digitally in between
  const lens = lensList.length>1 ? lensList.filter(l=>l.f<=z+1e-3).sort((a,b)=>b.f-a.f)[0] || lensList[0] : null;
  const f = lens ? lens.f : 1; digitalZoom = Math.max(1, z/f);
  if (commit && lens && lens.id!==lensId && !zoomBusy){ zoomBusy=true; lensId=lens.id; try { await startStream(); } catch(_){ toast('Не удалось переключить объектив.'); } zoomBusy=false; }
}
const hasRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype; let slowMs = 0;
function camLoop(){ if (mode!=='cam' || camPaused) { camRaf=0; return; }
  let dt = 0;
  if (video.currentTime!==lastVT){ lastVT=video.currentTime; lastFrameT=performance.now(); }
  if (video.readyState>=2 && !ctxLost){ const t0=performance.now(); E.setSource(video,{live:true}); liveFrame++; draw(); if (liveFrame%10===0){ E.gl.finish(); slowMs=performance.now()-t0; } dt=Math.max(performance.now()-t0, slowMs); }
  const wait = Math.max(dt>24 ? Math.min(400, dt*1.4) : 0, 1000/30 - dt);   // cap at ~30 fps to keep the phone cool
  const next = () => setTimeout(camLoop, Math.max(0,wait));
  camRaf = 1; if (hasRVFC) video.requestVideoFrameCallback(next); else requestAnimationFrame(next); }
function pauseCam(){ camPaused = true; const t=track(); if (t) t.enabled = false; }
/* watchdog: if the camera stops delivering frames, wake it up, then restart it */
setInterval(async () => { if (mode!=='cam' || camPaused || document.hidden || !stream) return;
  const idle = performance.now()-lastFrameT;
  if (idle>2500 && idle<6000){ try { await video.play(); } catch(_){} }
  else if (idle>=6000){ lastFrameT=performance.now(); try { await startStream(); buildZoomChips(); if(!camRaf) camLoop(); } catch(_){ } }
}, 1500);
async function openCam(){
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ toast('Камера недоступна в этом браузере. Используйте HQ или добавьте фото из альбома.'); return; }
  camState.P = {...P(), preset:P().preset}; adjOpen=false; camPaused=false; camExpo=0; lastFrameT=performance.now(); setMode('cam');
  try {
    if (streamAlive()){ track().enabled = true; try { await video.play(); } catch(_){} }   // reuse the stream: no new permission prompt
    else { await startStream(); await findLenses(); }
    buildZoomChips(); setMode('cam'); if (!camRaf) camLoop();
  } catch(e){ toast(e && e.name==='NotAllowedError' ? 'Нет доступа к камере. Разрешите: Настройки → Safari → Камера → Разрешить.' : 'Не удалось включить камеру.', 4500); closeCam(); }
}
async function closeCam(){
  pauseCam(); view.classList.remove('mirror'); $('#shotmsg').hidden=true; $('#zoomv').hidden=true; setMode('view');
  if (cur>=0){ try{ useImage(await decode(photos[cur].blob)); }catch(_){ } } else useImage(sampleImg);
}
$('#openCam').onclick = openCam;
$('#closeCam').onclick = () => closeCam();
$('#flipCam').onclick = async () => { facing = facing==='environment' ? 'user' : 'environment'; lensId=null; zoomLevel=1; digitalZoom=1; try{ await startStream(); buildZoomChips(); }catch(e){ toast('Не удалось сменить камеру.'); } };
$('#tgAdj').onclick = () => { adjOpen=!adjOpen; setMode('cam'); };
$('#tgDate').onclick = () => { P().date = P().date?0:1; setMode('cam'); toast(P().date?'Дата в углу включена':'Дата выключена', 1200); };
$('#tgFlash').onclick = () => { P().flash = P().flash>.02 ? 0 : .75; if (P().flash){ P().fx=.5; P().fy=.48; } P().preset=null; setMode('cam'); toast(P().flash?'Вспышка включена':'Вспышка выключена', 1200); };
$('#tgTap').onclick = () => { tapShoot=!tapShoot; saveCamPrefs(); setMode('cam'); toast(tapShoot?'Снимок по касанию кадра':'Касание кадра наводит вспышку', 1500); };
$('#tgTimer').onclick = () => { timerSec = timerSec===0?3:timerSec===3?10:0; saveCamPrefs(); setMode('cam'); toast(timerSec?'Таймер '+timerSec+' с':'Таймер выключен', 1200); };
document.addEventListener('visibilitychange', () => { if (mode!=='cam' || document.hidden) return; lastFrameT=performance.now();
  if (!streamAlive()) startStream().then(()=>{ buildZoomChips(); if(!camRaf) camLoop(); }).catch(()=>{}); else { video.play().catch(()=>{}); if(!camRaf) camLoop(); } });
$('#tgGrid').onclick = () => { gridOn=!gridOn; saveCamPrefs(); setMode('cam'); };
$('#tgOrient').onclick = () => { orientRot = orientRot===0 ? 3 : orientRot===3 ? 1 : 0; saveCamPrefs(); document.body.dataset.rot = orientRot; setMode('cam'); toast(ORIENT_LABEL[orientRot], 1300); };
document.body.dataset.rot = orientRot;

let lastShot = null, shotT = 0, counting = false;
async function shoot(){
  if (video.readyState<2 || counting) return;
  if (timerSec){ counting=true; const cd=$('#countdown'); for (let s=timerSec;s>0;s--){ cd.textContent=s; cd.hidden=false; await new Promise(r=>setTimeout(r,1000)); } cd.hidden=true; counting=false; }
  const fx=$('#flashfx'); fx.classList.add('on'); setTimeout(()=>fx.classList.remove('on'),60);
  const w=video.videoWidth, h=video.videoHeight; if (!w || !h){ toast('Камера ещё не готова.'); return; }
  const c = capCanvas || (capCanvas = document.createElement('canvas')); if (c.width!==w || c.height!==h){ c.width=w; c.height=h; }
  const g=c.getContext('2d'); let ok=false;
  for (let attempt=0; attempt<4 && !ok; attempt++){
    g.setTransform(1,0,0,1,0,0); if (view.classList.contains('mirror')){ g.translate(w,0); g.scale(-1,1); } g.drawImage(video,0,0); g.setTransform(1,0,0,1,0,0);
    ok = !isBlack(c); if (!ok) await new Promise(r=>setTimeout(r,120)); }
  if (!ok){ toast('Камера не отдала кадр. Попробуйте ещё раз.', 2500); lastFrameT = 0; return; }
  try {
    const blob = await new Promise(r => c.toBlob(r,'image/jpeg',.95));
    const rot = facing==='user' ? 0 : rotFromGravity();
    const ip = {...camState.P, ev:(camState.P.ev||0) + (hwExpo?0:camExpo)};
    const it = await addItem({blob, name:'PHY_'+stamp(new Date())+'.jpg', exif:null, img:c, P:ip, crop:{...camState.crop, rot, zoom:camState.crop.zoom*digitalZoom}, taken:Date.now()});
    unsaved.push(it);
    $('#lastShot').innerHTML=''; const im=document.createElement('img'); im.alt=''; it.thumbURL=URL.createObjectURL(it.thumb); im.src=it.thumbURL; $('#lastShot').appendChild(im);
    $('#shottext').textContent = unsaved.length>1 ? `${unsaved.length} не в Фото` : 'Снято';
    $('#shotSave').textContent = unsaved.length>1 ? `В Фото (${unsaved.length})` : 'В Фото';
    $('#shotmsg').hidden=false; clearTimeout(shotT); shotT=setTimeout(()=>$('#shotmsg').hidden=true, 7000);
    cur = 0;
  } catch(e){ toast('Не удалось сохранить кадр.'); }
}
let unsaved = [], capCanvas = null;
const probe = document.createElement('canvas'); probe.width = probe.height = 12;
function isBlack(c){ try { const g=probe.getContext('2d',{willReadFrequently:true}); g.drawImage(c,0,0,12,12); const d=g.getImageData(0,0,12,12).data; let m=0; for(let i=0;i<d.length;i+=4) m=Math.max(m,d[i],d[i+1],d[i+2]); return m<6; } catch(_){ return false; } }
$('#shutter').onclick = shoot;
$('#shotSave').onclick = async () => { if (!unsaved.length) return; const list=unsaved.filter(p=>photos.includes(p)); unsaved=[]; $('#shotmsg').hidden=true; await processAndOffer(list); };
$('#lastShot').onclick = async () => { if (!photos.length) return; pauseCam(); view.classList.remove('mirror'); await select(0,'view'); };
$('#nativeCam').addEventListener('change', async e => { const f=e.target.files[0]; e.target.value=''; if(!f) return;
  const ip = {...camState.P}; if (mode==='cam'){ pauseCam(); view.classList.remove('mirror'); }
  const it = await addFiles([f], {P:ip}); if (it) toast('Снято камерой iPhone в полном качестве', 2500); });

/* ================= export & save ================= */
const outName = p => (p&&p.name ? p.name.replace(/\.[^.]+$/,'') : 'ph-y')+'_ph-y.jpg';
function exportWith(it){
  const g = GLE.cropGeom(E.srcW, E.srcH, it.crop); let W=Math.round(g.cw), H=Math.round(g.ch);
  const L=Math.max(W,H); if (L>MAX_SRC){ const s=MAX_SRC/L; W=Math.round(W*s); H=Math.round(H*s); }
  E.setStamp(it.P.date ? stampText(it, it.P.date) : null);
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
  const m=$('#sheetMain'); m.innerHTML = `${title||text?`<div class="msg">${title?`<b>${esc(title)}</b>`:''}${text?esc(text):''}</div>`:''}${progress?'<div class="progress"><i id="prog"></i></div>':''}`;
  (actions||[]).forEach(a => { const b=document.createElement('button'); b.type='button'; b.className='act'+(a.red?' red':'')+(a.bold?' bold':''); b.textContent=a.label; b.onclick=()=>{ closeSheet(); a.run(); }; m.appendChild(b); });
  $('#sheet').hidden=false; $('#sheetCancel').hidden = !!progress;
}
function closeSheet(){ $('#sheet').hidden=true; }
$('#sheetCancel').onclick = closeSheet;
$('#sheet').addEventListener('click', e => { if (e.target.id==='sheet' && !$('#sheetCancel').hidden) closeSheet(); });
async function processAndOffer(list){
  if (!list.length) return;
  sheet({title:'Обрабатываю в полном размере…', progress:true});
  const out=[]; const keepImg = mode==='cam' ? null : loadedImg; const wasCam = mode==='cam' && !camPaused; if (wasCam) camPaused = true;
  for (let i=0;i<list.length;i++){ const it=list[i];
    const msg=$('#sheetMain .msg'); if (msg) msg.innerHTML = `<b>Обрабатываю в полном размере…</b>${i+1} из ${list.length}`; const pg=$('#prog'); if(pg) pg.style.width=(i/list.length*100)+'%';
    await frame(); await tick();
    try { const img = it===sample ? sampleImg : (mode!=='cam' && it===photos[cur] && loadedImg) ? loadedImg : await decode(it.blob); E.setSource(img);
      const r = exportWith(it); out.push({name:outName(it), bytes:r.bytes, W:r.W, H:r.H}); if (img!==loadedImg && img!==sampleImg) img.close && img.close(); }
    catch(e){ toast('Не удалось обработать '+it.name); } }
  if (keepImg){ E.setSource(keepImg); requestRender(); }
  if (wasCam){ camPaused = false; if (!camRaf) camLoop(); }
  if (!out.length){ closeSheet(); return; }
  const mb = out.reduce((s,f)=>s+f.bytes.length,0)/1048576, one = out.length===1 ? `${out[0].W}×${out[0].H}, ` : '';
  sheet({title: out.length===1 ? 'Фото готово' : `Готово: ${out.length} фото`, text: `${one}${fmt1(mb)} МБ, JPEG 95%. Затем в меню нажмите «Сохранить изображение».`,
    actions:[{label: out.length===1 ? 'Сохранить в Фото' : `Сохранить ${out.length} фото`, bold:true, run:()=>shareFiles(out)},
             {label:'Запомнить настройки как пресет', run:savePresetFromCurrent}]});
}
function savePresetFromCurrent(){ const list=loadMine(); const p={...P()}; delete p.fx; delete p.fy; delete p.preset; delete p.date;
  const name='Мой '+(list.length+1); list.push({name, p}); saveMine(list); builtTab=null; refreshBottom(); toast('Пресет «'+name+'» добавлен в фильтры'); }

/* ================= GPU context loss (iOS under memory pressure) ================= */
let ctxLost = false, ctxT = 0;
view.addEventListener('webglcontextlost', e => { e.preventDefault(); ctxLost = true; clearTimeout(ctxT); ctxT = setTimeout(() => location.reload(), 4000); });
view.addEventListener('webglcontextrestored', () => { clearTimeout(ctxT);
  try { E = GLE.Engine(view); } catch(_){ location.reload(); return; }
  ctxLost = false; if (mode!=='cam' && loadedImg) E.setSource(loadedImg); requestRender(); if (mode==='cam' && !camRaf) camLoop(); });

/* ================= start ================= */
(async () => {
  sampleImg = makeSample();
  try { const recs = await DB.all(); photos = recs.sort((a,b)=>b.date-a.date).map(r=>({...r})); } catch(_) { photos = []; }
  if (photos.length){ cur=0; setMode('view'); try{ useImage(await decode(photos[0].blob)); }catch(_){ useImage(sampleImg); } }
  else { setMode('view'); useImage(sampleImg); }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(()=>{});
  openCam();   // ph-y starts in the camera
})();
window.__myl = {E, get photos(){return photos;}, exportWith, get mode(){return mode;}, get P(){return P();}, render:()=>requestRender(), setZoom};
})();
