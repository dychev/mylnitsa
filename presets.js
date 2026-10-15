const BASE = {ev:0, temp:0, tint:0, ccd:.5, contrast:.12, blow:.12, flash:0, fsize:.5, fx:.5, fy:.45, vig:.12,
  soft:.25, sharp:.35, ca:.2, iso:.15, chroma:.12, res:2048, sat:1, ir:0, bw:0, bands:null, strength:1, gtype:0, gsize:.3, pix:0, date:0};
/* v4: everything 2–3× gentler on highlights, contrast and sharpening so bright daylight does not blow out */
const PRESETS = [
  {id:'leica', name:'Leica ИК', p:{res:3936, gtype:1, gsize:.2, ir:1, ev:0, temp:.05, ccd:.3, sat:.92, contrast:.22, blow:.15, vig:.28, soft:.05, sharp:.4, ca:.1, iso:.1, chroma:.05}},
  {id:'canon', name:'Canon IXUS', p:{res:3072, ev:0, temp:-.15, tint:.05, ccd:.7, sat:1.12, contrast:.22, blow:.2, vig:.1, soft:.15, sharp:.5, ca:.3, iso:.12, chroma:.1,
     bands:[[235,40,0,.18,-.03],[55,22,-5,.05,0]]}},
  {id:'sony', name:'Sony Cyber-shot', p:{res:3072, ev:0, temp:-.05, tint:.12, ccd:.55, sat:1.15, contrast:.25, blow:.18, vig:.12, soft:.3, sharp:.45, ca:.25, iso:.1, chroma:.08,
     bands:[[250,40,4,.25,-.04],[142,40,6,.05,0]]}},
  {id:'nikon', name:'Nikon Coolpix', p:{res:2560, ev:0, temp:.3, tint:-.1, ccd:.4, sat:1, contrast:.12, blow:.15, vig:.15, soft:.4, sharp:.3, ca:.3, iso:.3, chroma:.3,
     bands:[[100,30,-4,.1,0],[142,40,-6,0,0]]}},
  {id:'ricoh', name:'Ricoh ч/б', p:{res:3648, bw:1, gtype:1, gsize:.45, ev:0, ccd:0, contrast:.6, blow:.2, vig:.6, soft:.1, sharp:.35, ca:0, iso:.55, chroma:0}},
  {id:'kodak', name:'Тёплый Kodak', p:{res:2576, ev:0, temp:.45, tint:-.06, ccd:.5, sat:1.12, contrast:.2, blow:.22, vig:.25, soft:.35, sharp:.3, ca:.4, iso:.22, chroma:.25,
     bands:[[55,22,-8,.04,0],[262,35,6,0,-.05],[29,28,0,.08,0]]}},
  {id:'olympus', name:'Синий Olympus', p:{res:2560, ev:-.1, temp:.08, ccd:.35, contrast:.2, blow:.12, vig:.18, soft:.2, sharp:.3, ca:.15, iso:.12, chroma:.1,
     bands:[[240,40,6,.35,-.08],[142,40,0,-.15,0],[55,22,0,.08,0]]}},
  {id:'summer', name:'Летний пересвет', p:{res:2560, ev:.2, temp:.18, tint:-.04, ccd:.75, contrast:.08, blow:.35, vig:.1, soft:.2, sharp:.3, ca:.35, iso:.08, chroma:.06}},
  {id:'day', name:'Дневной CCD', p:{ev:0, temp:-.2, tint:.08, ccd:.6, contrast:.12, blow:.12, vig:.12, soft:.25, sharp:.35, ca:.2, iso:.1, chroma:.1}},
  {id:'party', name:'Вечеринка', p:{ev:-.3, temp:-.12, ccd:.45, contrast:.18, blow:.2, flash:.75, fsize:.45, fx:.5, fy:.5, vig:.3, soft:.22, sharp:.4, ca:.2, iso:.3, chroma:.25}},
  {id:'winter', name:'Зимний вечер', p:{res:1600, ev:0, temp:-.45, tint:.05, ccd:.5, contrast:.1, blow:.12, flash:.35, fsize:.6, vig:.22, soft:.4, sharp:.3, ca:.28, iso:.6, chroma:.5}},
  {id:'vga', name:'VGA, 2003', p:{res:640, ev:0, temp:.12, tint:-.08, ccd:.4, contrast:.2, blow:.22, vig:.25, soft:.35, sharp:.55, ca:.4, iso:.35, chroma:.4}},
];
