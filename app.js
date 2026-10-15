(() => {
'use strict';
const $ = s => document.querySelector(s);
const toast = t => { $('#toast').textContent = t || ''; };
const tick = () => new Promise(r => setTimeout(r, 0));
const frame = () => new Promise(r => requestAnimationFrame(() => r()));
const fmt1 = v => v.toFixed(1).replace('.', ',');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ================= storage (IndexedDB album) ================= */
const DB = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('mylnitsa', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos', {keyPath:'id'});
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('photos', mode); const st = t.objectStore('photos'); const out = fn(st); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); }); };
  return {
    all: () => tx('readonly', st => st.getAll()),
    put: rec => tx('readwrite', st => st.put(rec)),
    del: id => tx('readwrite', st => st.delete(id)),
  };
})();
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch(_) {}

/* ================= engine ================= */
const view = $('#view');
let E;
try { E = GLE.Engine(view); }
catch (e) { $('#photo').innerHTML = '<p style="padding:24px;color:#fff;font-size:15px;line-height:1.4">Этому браузеру не хватает WebGL 2. Откройте приложение в Safari на iPhone (iOS 15 или новее).</p>'; throw e; }
const MAX_SRC = Math.min(E.maxTex, 8192);

/* ================= state ================= */
const newCrop = () => ({rot:0, angle:0, aspect:null, zoom:1, ox:0, oy:0});
let samplePDefault = {...BASE, ...PRESETS[0].p, preset:PRESETS[0].id};
let photos = [], cur = -1;
let sample = {P:{...samplePDefault}, crop:newCrop()};
let camState = {P:{...samplePDefault}, crop:newCrop()};
let mode = 'edit', tab = 'pre', compare = false, loadedImg = null;
const item = () => mode === 'cam' ? camState : (cur >= 0 ? photos[cur] : sample);
const P = () => item().P;
const crop = () => item().crop;

/* ================= settings UI ================= */
const pct = v => Math.round(v*100)+'%';
const sgn = v => (v>0?'+':v<0?'−':'')+Math.round(Math.abs(v)*100);
const GROUPS = [
  {title:'Свет и цвет', rows:[
    {k:'ev', label:'Экспозиция', min:-1, max:1, center:true, fmt:v=>(v>0?'+':v<0?'−':'')+fmt1(Math.abs(v))+' EV'},
    {k:'temp', label:'Тепло', min:-1, max:1, center:true, fmt:sgn},
    {k:'tint', label:'Оттенок', min:-1, max:1, center:true, fmt:sgn},
    {k:'ccd', label:'Цвет CCD', min:0, max:1, fmt:pct},
    {k:'contrast', label:'Контраст', min:0, max:1, fmt:pct},
    {k:'blow', label:'Пересвет', min:0, max:1, fmt:pct}]},
  {title:'Вспышка', foot:'Коснитесь фото, чтобы навести вспышку.', rows:[
    {k:'flash', label:'Сила', min:0, max:1, fmt:v=>v<.02?'Выкл.':pct(v)},
    {k:'fsize', label:'Пятно света', min:0, max:1, fmt:pct},
    {k:'vig', label:'Виньетка', min:0, max:1, fmt:pct}]},
  {title:'Матрица и оптика', foot:'Файл всегда сохраняется в полном разрешении. «Матрица» задаёт характер: размер зерна, мыла и ореолов.', rows:[
    {k:'res', label:'Матрица', seg:[[640,'VGA'],[1600,'2 Мп'],[2048,'3 Мп'],[2560,'5 Мп'],[3648,'10 Мп']]},
    {k:'soft', label:'Мыло', min:0, max:1, fmt:pct},
    {k:'sharp', label:'Резкость', min:0, max:1.5, fmt:pct},
    {k:'ca', label:'Цветная кайма', min:0, max:1, fmt:pct}]},
  {title:'Шум', rows:[
    {k:'iso', label:'Зерно', min:0, max:1, fmt:v=>'ISO '+[100,200,400,800,1600][Math.round(v*4)]},
    {k:'chroma', label:'Цветной шум', min:0, max:1, fmt:pct}]},
  {title:'Общее', rows:[
    {k:'strength', label:'Сила эффекта', min:0, max:1, fmt:pct}]},
];
const syncers = [];
const adj = $('#p-adj');
for (const g of GROUPS){
  const grp = document.createElement('div'); grp.className = 'group';
  grp.innerHTML = `<h3 class="gh">${g.title}</h3><div class="card"></div>${g.foot?`<p class="gf">${g.foot}</p>`:''}`;
  const card = grp.querySelector('.card');
  for (const r of g.rows){
    const row = document.createElement('div'); row.className = 'row';
    if (r.seg){
      row.innerHTML = `<div class="rh"><span>${r.label}</span></div><div class="seg" role="group" aria-label="${r.label}"></div>`;
      const seg = row.querySelector('.seg');
      r.seg.forEach(([v,t]) => { const b = document.createElement('button'); b.type='button'; b.textContent=t; b.id='s-'+r.k+'-'+v; b.onclick=()=>{ P()[r.k]=v; changed(); }; seg.appendChild(b); });
      syncers.push(() => seg.querySelectorAll('button').forEach((b,i) => b.setAttribute('aria-pressed', r.seg[i][0]===P()[r.k])));
    } else {
      row.innerHTML = `<div class="rh"><label for="a-${r.k}">${r.label}</label><span class="rv"></span></div><input type="range" id="a-${r.k}" min="${r.min}" max="${r.max}" step="0.01"${r.center?' class="center"':''}>`;
      const el = row.querySelector('input'), out = row.querySelector('.rv');
      const paint = () => { const v=P()[r.k]; el.style.setProperty('--p', ((v-r.min)/(r.max-r.min)*100)+'%'); out.textContent = r.fmt(v); };
      el.oninput = () => { P()[r.k] = parseFloat(el.value); paint(); changed(); };
      el.ondblclick = () => { const pr = PRESETS.find(x=>x.id===P().preset); const base = {...BASE, ...(pr?pr.p:{})}; P()[r.k]=base[r.k]; el.value=P()[r.k]; paint(); changed(); };
      syncers.push(() => { el.value = P()[r.k]; paint(); });
    }
    card.appendChild(row);
  }
  adj.appendChild(grp);
}
{ const grp = document.createElement('div'); grp.className = 'group';
  grp.innerHTML = `<div class="card">
    <div class="row"><button type="button" class="rowbtn" id="toPreset">Вернуть настройки пресета</button></div>
    <div class="row" data-edit><button type="button" class="rowbtn" id="applyAll">Применить ко всем фото в альбоме</button></div>
    <div class="row" data-edit><button type="button" class="rowbtn red" id="delPhoto">Удалить фото из альбома</button></div></div>
    <p class="gf">Двойное касание ползунка возвращает его значение из пресета. Оригиналы хранятся в приложении, поэтому любой кадр можно переобработать.</p>`;
  adj.appendChild(grp);
  grp.querySelector('#toPreset').onclick = () => { const pr = PRESETS.find(x=>x.id===P().preset) || PRESETS[0]; applyPreset(pr.p, pr.id); };
  grp.querySelector('#applyAll').onclick = () => { if (photos.length<2){ toast('В альбоме одно фото.'); return; } const src = {...P()}; delete src.fx; delete src.fy;
    photos.forEach(p => { if (p!==item()) { Object.assign(p.P, src); persist(p); } }); toast('Настройки применены ко всем фото ('+photos.length+').'); };
  grp.querySelector('#delPhoto').onclick = () => { if (cur<0) return; sheet({title:'Удалить это фото из альбома?', text:'В «Фото» на iPhone ничего не удалится.', actions:[{label:'Удалить', red:true, run:deleteCurrent}]}); };
}
function syncUI(){
  syncers.forEach(f => f());
  $('#presets').querySelectorAll('.pt').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === P().preset));
  adj.querySelectorAll('[data-edit]').forEach(r => r.hidden = mode==='cam' || cur<0);
  updateMarker();
}
let persistT = 0;
function persist(p){ if (!p || !p.id) return; clearTimeout(p._t); p._t = setTimeout(() => DB.put(rec(p)).catch(()=>{}), 400); }
const rec = p => ({id:p.id, name:p.name, date:p.date, blob:p.blob, exif:p.exif, crop:p.crop, P:p.P, thumb:p.thumb});
function changed(){ P().preset = null; syncUI(); persist(item()); requestRender(); }
function applyPreset(p, id){ const cur = P(); const keep = {fx:cur.fx, fy:cur.fy}; const np = {...BASE, ...p, preset:id||null}; if (!('fx' in p)) Object.assign(np, keep);
  item().P = np; syncUI(); persist(item()); requestRender(); }

/* ================= tabs ================= */
['pre','adj','crop'].forEach(t => $('#t-'+t).onclick = () => { tab = t;
  ['pre','adj','crop'].forEach(o => { $('#t-'+o).setAttribute('aria-selected', o===t); $('#p-'+o).hidden = o!==t; });
  $('#grid').hidden = t!=='crop' || mode==='cam'; updateMarker(); });

/* ================= presets ================= */
const presetsEl = $('#presets'), thumbC = {};
PRESETS.forEach(pr => { const b = document.createElement('button'); b.type='button'; b.className='pt'; b.dataset.id=pr.id; b.id='p-'+pr.id;
  b.innerHTML = `<canvas width="160" height="160"></canvas><span>${pr.name}</span>`; b.onclick = () => applyPreset(pr.p, pr.id);
  thumbC[pr.id] = b.querySelector('canvas'); presetsEl.appendChild(b); });
const loadMine = () => { try { return JSON.parse(localStorage.getItem('myl_presets')||'[]'); } catch(_) { return []; } };
const saveMine = l => { try { localStorage.setItem('myl_presets', JSON.stringify(l)); return true; } catch(_) { return false; } };
let armed = -1;
function renderMine(){
  const list = loadMine(), el = $('#mine'); el.innerHTML = '';
  list.forEach((m,i) => { const row = document.createElement('div'); row.className='row';
    row.innerHTML = `<div class="rowlink"><button type="button" class="rowbtn" style="color:var(--label)">${esc(m.name)}</button><button type="button" class="mine-del">${armed===i?'Удалить?':'Удалить'}</button></div>`;
    row.querySelector('.rowbtn').onclick = () => { applyPreset(m.p, null); toast('Применён пресет «'+m.name+'»'); };
    row.querySelector('.mine-del').onclick = () => { if (armed===i){ list.splice(i,1); saveMine(list); armed=-1; } else armed=i; renderMine(); };
    el.appendChild(row); });
  const add = document.createElement('div'); add.className='row';
  add.innerHTML = '<div class="rowlink"><input type="text" id="mname" placeholder="Название, например «Горы»" aria-label="Название пресета"><button type="button" class="rowbtn" id="madd" style="width:auto">Сохранить</button></div>';
  add.querySelector('#madd').onclick = () => { const n = add.querySelector('#mname').value.trim() || ('Мой пресет '+(list.length+1)); const p = {...P()}; delete p.fx; delete p.fy; delete p.preset;
    list.push({name:n, p}); toast(saveMine(list)?'Пресет сохранён':'Не удалось сохранить пресет.'); renderMine(); };
  el.appendChild(add);
}

/* ================= crop ================= */
const ASPECTS = [[null,'Оригинал'],[4/3,'4:3'],[3/2,'3:2'],[1,'1:1'],[16/9,'16:9']];
const aspEl = $('#aspects');
ASPECTS.forEach(([a,t],i) => { const b = document.createElement('button'); b.type='button'; b.textContent=t; b.id='asp-'+i;
  b.onclick = () => { const c=crop(); c.aspect=a; c.ox=0; c.oy=0; syncCrop(); persist(item()); requestRender(); }; aspEl.appendChild(b); });
function syncCrop(){ const c = crop();
  aspEl.querySelectorAll('button').forEach((b,i) => b.setAttribute('aria-pressed', ASPECTS[i][0]===c.aspect));
  const a=$('#c-angle'), z=$('#c-zoom'); a.value=c.angle; z.value=c.zoom;
  a.style.setProperty('--p', ((c.angle+15)/30*100)+'%'); z.style.setProperty('--p', ((c.zoom-1)/2*100)+'%');
  $('#v-angle').textContent = (c.angle>0?'+':c.angle<0?'−':'')+fmt1(Math.abs(c.angle)).replace(',0','')+'°'; $('#v-zoom').textContent = fmt1(c.zoom)+'×'; }
$('#c-angle').oninput = e => { crop().angle = parseFloat(e.target.value); syncCrop(); persist(item()); requestRender(); };
$('#c-zoom').oninput = e => { crop().zoom = parseFloat(e.target.value); syncCrop(); persist(item()); requestRender(); };
$('#c-rot').onclick = () => { const c=crop(); c.rot=(c.rot+1)%4; c.ox=0; c.oy=0; syncCrop(); persist(item()); requestRender(); };
$('#c-reset').onclick = () => { Object.assign(crop(), newCrop()); syncCrop(); persist(item()); requestRender(); };

/* ================= decoding ================= */
function capImage(bm){ const L = Math.max(bm.width, bm.height); if (L <= MAX_SRC) return bm;
  const s = MAX_SRC/L, c = document.createElement('canvas'); c.width=Math.round(bm.width*s); c.height=Math.round(bm.height*s);
  const g = c.getContext('2d'); g.imageSmoothingQuality='high'; g.drawImage(bm,0,0,c.width,c.height); bm.close && bm.close(); return c; }
let heicReady = null;
function loadHeic(){ if (window.heic2any) return Promise.resolve(); if (heicReady) return heicReady;
  heicReady = new Promise((res, rej) => { const s=document.createElement('script'); s.src='heic2any.min.js'; s.onload=res; s.onerror=()=>{ heicReady=null; rej(new Error('heic-lib')); }; document.head.appendChild(s); });
  return heicReady; }
const isHeic = f => /hei[cf]/i.test(f.type||'') || /\.hei[cf]$/i.test(f.name||'');
async function decode(blob){
  try { return capImage(await createImageBitmap(blob, {imageOrientation:'from-image'})); } catch(_) {}
  try { const url=URL.createObjectURL(blob); const im=await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=url; });
    const c=document.createElement('canvas'); c.width=im.naturalWidth; c.height=im.naturalHeight; c.getContext('2d').drawImage(im,0,0); URL.revokeObjectURL(url); return capImage(c); } catch(_) {}
  if (isHeic(blob)) { await loadHeic(); const out = await window.heic2any({blob, toType:'image/png'}); return capImage(await createImageBitmap(Array.isArray(out)?out[0]:out)); }
  throw new Error('decode');
}
async function makeThumb(img){ const S=144, c=document.createElement('canvas'); c.width=S; c.height=S; const g=c.getContext('2d');
  const w=img.width, h=img.height, m=Math.min(w,h); g.imageSmoothingQuality='high'; g.drawImage(img,(w-m)/2,(h-m)/2,m,m,0,0,S,S);
  return new Promise(r => c.toBlob(b => r(b), 'image/jpeg', .8)); }

/* ================= album ================= */
const stamp = d => { const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
function renderAlbum(){
  const el = $('#album'); el.innerHTML = '';
  const add = document.createElement('button'); add.type='button'; add.className='add'; add.setAttribute('aria-label','Добавить фото из галереи'); add.textContent='+'; add.onclick=()=>$('#file').click(); el.appendChild(add);
  photos.forEach((p,i) => { const b=document.createElement('button'); b.type='button'; b.className='ph'; b.setAttribute('aria-pressed', i===cur); b.setAttribute('aria-label','Фото '+(i+1));
    const im=document.createElement('img'); im.alt=''; if(!p.thumbURL && p.thumb) p.thumbURL=URL.createObjectURL(p.thumb); im.src=p.thumbURL||''; b.appendChild(im);
    b.onclick=()=>select(i); el.appendChild(b); });
  $('#sampleTag').hidden = photos.length>0;
  if (cur>=0) requestAnimationFrame(()=>{ const s=el.children[cur+1]; s && s.scrollIntoView({inline:'nearest',block:'nearest'}); });
}
async function addItem({blob, name, exif, P:ip, crop:ic, img}){
  const date = Date.now();
  const it = {id:'p'+date+Math.random().toString(36).slice(2,7), name, date, blob, exif, crop: ic||newCrop(), P: ip||{...P()}, thumb: img?await makeThumb(img):null};
  photos.unshift(it); if (cur>=0) cur++; try { await DB.put(rec(it)); } catch(e){ toast('Не хватает места для альбома: фото не сохранено в приложении.'); }
  return it;
}
async function addFiles(fl, {P:ip}={}){
  const files = [...fl].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|hei[cf]|tiff?)$/i.test(f.name));
  if (!files.length){ toast('Это не фото. Подойдут JPG, PNG и HEIC.'); return null; }
  let firstImg = null, first = null;
  for (let i=files.length-1;i>=0;i--){ const f=files[i]; toast(`Открываю ${files.length-i} из ${files.length}…`);
    try { const img = await decode(f); let exif=null; try{ exif = RC.extractExif(await f.arrayBuffer()); }catch(_){}
      const it = await addItem({blob:f, name:f.name||('IMG_'+stamp(new Date())+'.jpg'), exif, img, P: ip?{...ip}:{...P()}, crop:newCrop()});
      if (i===0){ firstImg=img; first=it; } else img.close && img.close();
    } catch(e){ toast('Не удалось открыть '+(f.name||'фото')+'.'); await new Promise(r=>setTimeout(r,1200)); }
    await tick(); }
  toast('');
  if (first){ cur = photos.indexOf(first); renderAlbum(); syncUI(); syncCrop(); useImage(firstImg); }
  return first;
}
async function select(i){ if (mode==='cam') await closeCam(); cur=i; renderAlbum(); syncUI(); syncCrop();
  try { useImage(await decode(photos[i].blob)); } catch(e){ toast('Не удалось открыть фото.'); } }
async function deleteCurrent(){ const p = photos[cur]; if(!p) return; await DB.del(p.id).catch(()=>{}); if(p.thumbURL) URL.revokeObjectURL(p.thumbURL);
  photos.splice(cur,1); if (!photos.length){ cur=-1; renderAlbum(); syncUI(); syncCrop(); useImage(sampleImg); } else select(Math.min(cur, photos.length-1)); }
$('#file').addEventListener('change', e => { addFiles(e.target.files); e.target.value=''; });
const photoEl = $('#photo');
['dragenter','dragover'].forEach(t=>photoEl.addEventListener(t,e=>{ e.preventDefault(); photoEl.classList.add('drag'); }));
['dragleave','drop'].forEach(t=>photoEl.addEventListener(t,()=>photoEl.classList.remove('drag')));
photoEl.addEventListener('drop', e => { e.preventDefault(); addFiles(e.dataTransfer.files); });

/* ================= rendering ================= */
let raf = 0, thumbsDirty = true, lastGeom = null, liveFrame = 0;
function useImage(img){ E.setSource(img); loadedImg = img; thumbsDirty = true; requestRender(); }
function requestRender(){ if (raf || mode==='cam') return; raf = requestAnimationFrame(() => { raf = 0; draw(); }); }
function previewSize(g){
  const dpr = Math.min(3, window.devicePixelRatio||1), fs = document.body.classList.contains('fs');
  const aw = photoEl.clientWidth*dpr, ah = (fs ? photoEl.clientHeight : Math.min(window.innerHeight*.62, 900))*dpr;
  const cap = mode==='cam' ? 1600 : 2400;
  const s = Math.min(aw/g.cw, ah/g.ch, cap/Math.max(g.cw,g.ch), 1);
  return {w:Math.max(2,Math.round(g.cw*s)), h:Math.max(2,Math.round(g.ch*s)), dpr};
}
function draw(){
  if (!loadedImg && mode!=='cam') return;
  const g = GLE.cropGeom(E.srcW, E.srcH, crop()); lastGeom = g;
  const sz = previewSize(g);
  if (view.width!==sz.w || view.height!==sz.h){ view.width=sz.w; view.height=sz.h; }
  view.style.width = (sz.w/sz.dpr)+'px'; view.style.height = (sz.h/sz.dpr)+'px';
  E.render(g, {...P(), seed: mode==='cam' ? (liveFrame*7919)>>>0 : 11}, {w:sz.w, h:sz.h, toScreen:true, bypass:compare});
  E.trim([sz.w+'x'+sz.h, '160x160']);
  if (mode!=='cam'){ const W=Math.round(g.cw), H=Math.round(g.ch); $('#meta').textContent = `${W} × ${H} · ${fmt1(W*H/1e6)} Мп · удерживайте фото, чтобы увидеть оригинал`; }
  updateMarker();
  if (thumbsDirty){ thumbsDirty=false; setTimeout(drawThumbs, mode==='cam'?400:30); }
}
function drawThumbs(){
  const c = crop(), g = GLE.cropGeom(E.srcW, E.srcH, {rot:c.rot, angle:0, aspect:1, zoom:1, ox:0, oy:0});
  for (const pr of PRESETS){
    const p = {...BASE, ...pr.p, seed:11}; if (!('fx' in pr.p)){ p.fx=.5; p.fy=.5; }
    const t = E.render(g, p, {w:160, h:160, toScreen:false, flip:true}); const px = E.read(t);
    thumbC[pr.id].getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.buffer),160,160),0,0);
  }
  requestRender();
}
new ResizeObserver(() => requestRender()).observe(photoEl);
function updateMarker(){ const m=$('#marker'); const on = P().flash>.02 && tab!=='crop' && !compare; m.hidden=!on; if (on){ m.style.left=(P().fx*100)+'%'; m.style.top=(P().fy*100)+'%'; } }

/* touch: hold = original, tap = aim flash, drag = move crop */
let down = null, holdT = 0;
view.addEventListener('pointerdown', e => { view.setPointerCapture(e.pointerId); down = {x:e.clientX, y:e.clientY, moved:false, held:false};
  if (tab!=='crop') holdT = setTimeout(() => { if (down && !down.moved){ down.held=true; compare=true; $('#badge').hidden=false; updateMarker(); if(mode!=='cam') requestRender(); } }, 180); });
view.addEventListener('pointermove', e => { if (!down) return; const dx=e.clientX-down.x, dy=e.clientY-down.y;
  if (Math.hypot(dx,dy)>6) down.moved = true;
  if (tab==='crop' && mode!=='cam' && down.moved && lastGeom){ const r=view.getBoundingClientRect(), c=crop();
    const fx=dx*lastGeom.cw/r.width, fy=dy*lastGeom.ch/r.height, co=Math.cos(lastGeom.th), si=Math.sin(lastGeom.th);
    c.ox -= (co*fx-si*fy)/lastGeom.Sw; c.oy -= (si*fx+co*fy)/lastGeom.Sh; down.x=e.clientX; down.y=e.clientY; persist(item()); requestRender(); } });
function endPointer(e){ clearTimeout(holdT); if (!down) return;
  if (down.held){ compare=false; $('#badge').hidden=true; updateMarker(); requestRender(); }
  else if (!down.moved && tab!=='crop' && P().flash>.02 && e.type==='pointerup'){ const r=view.getBoundingClientRect(); let x=(e.clientX-r.left)/r.width; if(view.classList.contains('mirror')) x=1-x;
    P().fx=Math.min(1,Math.max(0,x)); P().fy=Math.min(1,Math.max(0,(e.clientY-r.top)/r.height)); persist(item()); updateMarker(); requestRender(); }
  down = null; }
['pointerup','pointercancel','lostpointercapture'].forEach(t => view.addEventListener(t, endPointer));
view.addEventListener('contextmenu', e => e.preventDefault());

/* ================= fullscreen editor ================= */
function setFs(on){ document.body.classList.toggle('fs', on); refreshNav(); requestRender(); }
function refreshNav(){ const fs=document.body.classList.contains('fs');
  $('#openCam').hidden = fs; $('#done').hidden = !fs || mode==='cam'; $('#closeCam').hidden = mode!=='cam'; $('#flipCam').hidden = mode!=='cam' || !multiCam; $('#save').hidden = mode==='cam';
  $('#navTitle').textContent = mode==='cam' ? camLabel : 'Мыльница'; }
$('#fsbtn').onclick = () => setFs(true);
$('#done').onclick = () => setFs(false);
document.addEventListener('keydown', e => { if (e.key==='Escape' && document.body.classList.contains('fs')) { mode==='cam' ? closeCam() : setFs(false); } });

/* ================= camera ================= */
const video = document.createElement('video'); video.playsInline = true; video.muted = true; video.setAttribute('playsinline',''); video.setAttribute('muted','');
let stream = null, camRaf = 0, facing = 'environment', camLabel = 'Камера', multiCam = false, lensList = [], lensId = null, camPaused = false;
function stopStream(){ if (stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } }
async function startStream(){
  stopStream();
  const size = {width:{ideal:4032}, height:{ideal:3024}};
  const v = lensId ? {deviceId:{exact:lensId}, ...size} : {facingMode:facing, ...size};
  stream = await navigator.mediaDevices.getUserMedia({audio:false, video:v});
  video.srcObject = stream; await video.play();
  const s = stream.getVideoTracks()[0].getSettings();
  camLabel = (s.width&&s.height) ? `${Math.max(s.width,s.height)}×${Math.min(s.width,s.height)}` : 'Камера';
  view.classList.toggle('mirror', facing==='user' || /front|фронт|передн/i.test(stream.getVideoTracks()[0].label||''));
}
async function listLenses(){
  try { const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');
    multiCam = devs.length>1;
    const back = devs.filter(d=>!/front|фронт|передн/i.test(d.label));
    const pick = (re) => back.find(d=>re.test(d.label) && !/dual|triple|двойн|тройн/i.test(d.label));
    const uw = pick(/ultra|сверхширок/i), tele = pick(/tele|теле/i), wide = back.find(d=>!/ultra|сверхширок|tele|теле|dual|triple|двойн|тройн/i.test(d.label));
    lensList = [uw&&{id:uw.deviceId,t:'.5'}, wide&&{id:wide.deviceId,t:'1×'}, tele&&{id:tele.deviceId,t:(/13|15|16/.test(navigator.userAgent)?'3':'2')}].filter(Boolean);
  } catch(_) { lensList = []; }
  const el = $('#lenses'); el.innerHTML='';
  if (facing==='environment' && lensList.length>1){ lensList.forEach(l=>{ const b=document.createElement('button'); b.type='button'; b.textContent=l.t; b.setAttribute('aria-pressed', l.id===lensId || (!lensId && l.t==='1×'));
      b.onclick=async()=>{ lensId=l.id; try{ await startStream(); thumbsDirty=true; }catch(e){ toast('Не удалось переключить объектив.'); } listLenses(); }; el.appendChild(b); }); el.hidden=false; }
  else el.hidden = true;
}
const hasRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
function camLoop(){ if (mode!=='cam') return;
  if (video.readyState>=2 && !camPaused){ E.setSource(video,{live:true}); liveFrame++; draw(); }
  if (hasRVFC) video.requestVideoFrameCallback(()=>setTimeout(camLoop,0)); else camRaf = requestAnimationFrame(camLoop); }
async function openCam(){
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ toast('Камера недоступна в этом браузере. Используйте кнопку HQ или добавьте фото из галереи.'); return; }
  mode='cam'; document.body.classList.add('fs','cam'); camState.P = {...P()}; camState.crop = {...newCrop(), aspect: crop().aspect};
  if (tab==='crop') $('#t-pre').click();
  refreshNav(); syncUI(); syncCrop(); $('#grid').hidden=true;
  try { await startStream(); await listLenses(); refreshNav(); thumbsDirty=true; camLoop(); }
  catch(e){ toast(e && e.name==='NotAllowedError' ? 'Нет доступа к камере. Разрешите его в Настройках iPhone → Safari → Камера.' : 'Не удалось включить камеру.'); closeCam(); }
}
async function closeCam(){
  cancelAnimationFrame(camRaf); stopStream(); mode='edit'; document.body.classList.remove('cam','fs'); view.classList.remove('mirror'); $('#lenses').hidden=true; $('#shotmsg').hidden=true;
  refreshNav(); syncUI(); syncCrop();
  if (cur>=0){ try{ useImage(await decode(photos[cur].blob)); }catch(_){ } } else useImage(sampleImg);
}
$('#openCam').onclick = openCam;
$('#closeCam').onclick = closeCam;
$('#flipCam').onclick = async () => { facing = facing==='environment' ? 'user' : 'environment'; lensId=null; try{ await startStream(); await listLenses(); thumbsDirty=true; }catch(e){ toast('Не удалось сменить камеру.'); } };
document.addEventListener('visibilitychange', () => { if (mode!=='cam') return; if (document.hidden) stopStream(); else startStream().catch(()=>{}); });

let lastShot = null;
$('#shutter').onclick = async () => {
  if (video.readyState<2) return;
  const fx=$('#flashfx'); fx.classList.add('on'); setTimeout(()=>fx.classList.remove('on'),60);
  const w=video.videoWidth, h=video.videoHeight, c=document.createElement('canvas'); c.width=w; c.height=h;
  const g=c.getContext('2d'); if (view.classList.contains('mirror')){ g.translate(w,0); g.scale(-1,1); } g.drawImage(video,0,0);
  camPaused = true;
  try {
    const blob = await new Promise(r => c.toBlob(r,'image/jpeg',.96));
    const name = 'MYL_'+stamp(new Date())+'.jpg';
    const it = await addItem({blob, name, exif:null, img:c, P:{...camState.P}, crop:{...newCrop(), aspect:camState.crop.aspect}});
    E.setSource(c); const r = exportWith(it); lastShot = {name: outName(it), bytes:r.bytes};
    $('#lastShot').innerHTML=''; const im=document.createElement('img'); im.alt=''; it.thumbURL=URL.createObjectURL(it.thumb); im.src=it.thumbURL; $('#lastShot').appendChild(im);
    $('#shottext').textContent = 'Снято · '+r.W+'×'+r.H; $('#shotmsg').hidden=false; clearTimeout(shotT); shotT=setTimeout(()=>$('#shotmsg').hidden=true, 6000);
    cur = 0; renderAlbum();
  } catch(e){ toast('Не удалось сохранить кадр.'); }
  camPaused = false;
};
let shotT = 0;
$('#shotSave').onclick = () => { if (lastShot) shareFiles([lastShot]); };
$('#lastShot').onclick = () => { if (photos.length){ closeCam().then(()=>select(0)); } };
$('#nativeCam').addEventListener('change', async e => { const f=e.target.files[0]; e.target.value=''; if(!f) return;
  const ip = {...camState.P}; if (mode==='cam') await closeCam();
  const it = await addFiles([f], {P:ip}); if (it) toast('Снято камерой iPhone в полном качестве. Нажмите «Сохранить», чтобы отправить в «Фото».'); });

/* ================= export & save ================= */
const outName = p => (p&&p.name ? p.name.replace(/\.[^.]+$/,'') : 'mylnitsa')+'_retro.jpg';
function exportWith(it){
  const g = GLE.cropGeom(E.srcW, E.srcH, it.crop); let W=Math.round(g.cw), H=Math.round(g.ch);
  const L=Math.max(W,H); if (L>MAX_SRC){ const s=MAX_SRC/L; W=Math.round(W*s); H=Math.round(H*s); }
  const t = E.render(g, {...it.P, seed:11}, {w:W, h:H, toScreen:false, flip:true}); const px = E.read(t); E.dropSet(W,H);
  return {bytes: RC.encodeJPEG(px, W, H, 95, '444', it.exif||null), W, H};
}
let downloads = null;
(async()=>{ try{ downloads = window.claude?.use ? await window.claude.use('downloads') : null; }catch(_){ downloads=null; } })();
async function shareFiles(files){
  const fl = files.map(f => new File([f.bytes], f.name, {type:'image/jpeg'}));
  try {
    if (navigator.canShare && navigator.canShare({files:fl})){ await navigator.share({files:fl}); return true; }
  } catch(e){ if (e && e.name==='AbortError') return false; }
  if (downloads){ for (const f of files) await downloads.save({filename:f.name, data:new Blob([f.bytes],{type:'image/jpeg'})}); return true; }
  for (const f of fl){ const a=document.createElement('a'); a.href=URL.createObjectURL(f); a.download=f.name; document.body.appendChild(a); a.click(); a.remove(); await new Promise(r=>setTimeout(r,300)); }
  return true;
}
/* iOS-style action sheet */
function sheet({title, text, actions, progress}){
  const m=$('#sheetMain'); m.innerHTML = `<div class="msg">${title?`<b>${esc(title)}</b>`:''}${text?esc(text):''}</div>${progress?'<div class="progress"><i id="prog"></i></div>':''}`;
  (actions||[]).forEach(a => { const b=document.createElement('button'); b.type='button'; b.className='act'+(a.red?' red':'')+(a.bold?' bold':''); b.textContent=a.label; b.onclick=()=>{ if(!a.keep) closeSheet(); a.run(); }; m.appendChild(b); });
  $('#sheet').hidden=false; $('#sheetCancel').hidden = !!progress;
}
function closeSheet(){ $('#sheet').hidden=true; }
$('#sheetCancel').onclick = closeSheet;
$('#sheet').addEventListener('click', e => { if (e.target.id==='sheet' && !$('#sheetCancel').hidden) closeSheet(); });

async function processAndOffer(list){
  sheet({title:'Обрабатываю в полном размере…', text:'', progress:true});
  const out=[]; const keepImg = loadedImg;
  for (let i=0;i<list.length;i++){ const it=list[i];
    $('#sheetMain .msg').innerHTML = `<b>Обрабатываю в полном размере…</b>${i+1} из ${list.length}`; const pg=$('#prog'); if(pg) pg.style.width=(i/list.length*100)+'%';
    await frame(); await tick();
    try { const img = it===sample ? sampleImg : (it===photos[cur] && loadedImg) ? loadedImg : await decode(it.blob); E.setSource(img);
      const r = exportWith(it); out.push({name:outName(it), bytes:r.bytes, W:r.W, H:r.H}); if (img!==loadedImg && img!==sampleImg) img.close && img.close(); }
    catch(e){ toast('Не удалось обработать '+it.name); }
  }
  if (keepImg){ E.setSource(keepImg); requestRender(); }
  if (!out.length){ closeSheet(); return; }
  const mb = out.reduce((s,f)=>s+f.bytes.length,0)/1048576;
  const one = out.length===1 ? `${out[0].W}×${out[0].H}, ` : '';
  sheet({title: out.length===1 ? 'Фото готово' : `Готово: ${out.length} фото`, text: `${one}${fmt1(mb)} МБ, JPEG 95%. В меню выберите «Сохранить изображение».`,
    actions:[{label: out.length===1 ? 'Сохранить в Фото' : `Сохранить ${out.length} фото`, bold:true, run:()=>shareFiles(out)}]});
}
$('#save').onclick = () => {
  if (!photos.length){ processAndOffer([sample]); return; }
  if (photos.length>1) sheet({title:'Что сохранить?', actions:[
    {label:'Это фото', bold:true, run:()=>processAndOffer([photos[cur]])},
    {label:`Все фото в альбоме (${photos.length})`, run:()=>processAndOffer(photos.slice())}]});
  else processAndOffer([photos[cur]]);
};

/* ================= start ================= */
let sampleImg = null;
(async () => {
  sampleImg = makeSample();
  try { const recs = await DB.all(); photos = recs.sort((a,b)=>b.date-a.date).map(r=>({...r})); } catch(_) { photos = []; }
  renderMine();
  if (photos.length){ cur=0; renderAlbum(); syncUI(); syncCrop(); try{ useImage(await decode(photos[0].blob)); }catch(_){ useImage(sampleImg); } }
  else { renderAlbum(); syncUI(); syncCrop(); useImage(sampleImg); }
  refreshNav();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
window.__myl = {E, get photos(){return photos;}, exportWith, get mode(){return mode;}};
})();
