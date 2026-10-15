const BASE = {ev:0, temp:0, tint:0, ccd:.6, contrast:.25, blow:.3, flash:0, fsize:.5, fx:.5, fy:.45, vig:.15,
  soft:.3, sharp:.6, ca:.3, iso:.2, chroma:.2, res:2048, sat:1, ir:0, bw:0, bands:null, strength:1, gtype:0, gsize:.3, pix:0, date:0};
const PRESETS = [
  {id:'day', name:'Дневной CCD', p:{ev:.15, temp:-.25, tint:.1, ccd:.75, contrast:.25, blow:.35, vig:.15, soft:.3, sharp:.65, ca:.3, iso:.12, chroma:.12}},
  {id:'party', name:'Вечеринка', p:{ev:-.35, temp:-.15, ccd:.5, contrast:.35, blow:.45, flash:.85, fsize:.45, fx:.5, fy:.5, vig:.35, soft:.25, sharp:.7, ca:.25, iso:.38, chroma:.35}},
  {id:'winter', name:'Зимний вечер', p:{res:1600, ev:.1, temp:-.5, tint:.05, ccd:.55, contrast:.2, blow:.3, flash:.4, fsize:.6, vig:.25, soft:.5, sharp:.45, ca:.35, iso:.72, chroma:.62}},
  {id:'vga', name:'VGA, 2003', p:{res:640, ev:.1, temp:.15, tint:-.1, ccd:.45, contrast:.45, blow:.55, vig:.3, soft:.35, sharp:1, ca:.55, iso:.4, chroma:.5}},
  {id:'summer', name:'Летний пересвет', p:{res:2560, ev:.55, temp:.2, tint:-.05, ccd:.85, contrast:.15, blow:.75, vig:.1, soft:.2, sharp:.55, ca:.45, iso:.08, chroma:.08}},
  {id:'ricoh', name:'Ricoh ч/б', p:{res:3648, bw:1, gtype:1, gsize:.45, ev:.05, ccd:0, contrast:.95, blow:.4, vig:.75, soft:.1, sharp:.55, ca:0, iso:.6, chroma:0}},
  {id:'leica', name:'Leica ИК', p:{res:3936, gtype:1, gsize:.2, ir:1, ev:0, temp:.05, ccd:.3, sat:.92, contrast:.42, blow:.35, vig:.3, soft:.05, sharp:.75, ca:.12, iso:.1, chroma:.06}},
  {id:'kodak', name:'Тёплый Kodak', p:{res:2576, ev:.1, temp:.55, tint:-.08, ccd:.55, sat:1.2, contrast:.4, blow:.5, vig:.3, soft:.4, sharp:.5, ca:.5, iso:.25, chroma:.3,
     bands:[[55,22,-8,.04,0],[262,35,6,0,-.05],[29,28,0,.08,0]]}},
  {id:'olympus', name:'Синий Olympus', p:{res:2560, ev:-.15, temp:.1, ccd:.35, contrast:.4, blow:.3, vig:.2, soft:.2, sharp:.45, ca:.2, iso:.15, chroma:.12,
     bands:[[240,40,6,.35,-.08],[142,40,0,-.15,0],[55,22,0,.08,0]]}},
];
