// Prueft das Messpaket AP2 Teil 1 (Konzept 3.1, 3.2): (a) den Schluesselfehler k gegen v in raumskizze-karte.mjs
// (--segmente geraet), (b) die Kippquote raumskizze-kippquote.mjs und (c) den Nulltest raumskizze-nulltest.mjs, alles an
// kleinen synthetischen Eingaben. Die grossen Aufnahmen (Downloads) werden nicht gebraucht; die Pruefungen an echten
// Aufnahmen laufen nur, wenn KIPP_TAR / KIPP_PROTOKOLL gesetzt sind und die Dateien da sind, sonst "uebersprungen".
//
//   node test/raumskizze-kippquote.mjs      (KIPP_TAR=aufnahme.tar KIPP_PROTOKOLL=protokoll.json: Pruefung an einer echten Aufnahme)
import {existsSync} from 'node:fs';
import * as T1 from '../raumskizze-karte.mjs';

const out=[]; let ok=true;
const chk=(name,cond,info='')=>{ ok=ok&&!!cond; out.push((cond?'ok   ':'ROT  ')+name+(info!==''?'  ('+info+')':'')); };
const notiz=s=>out.push('     '+s);
const {G}=await T1.ladeSeite({});

// ---------------------------------------------------------------- (a) k gegen v: segmente.bin ist nach der Zustandsspalte k geschluesselt
// Aufnahme: Kamera im Kreis, 20 Hz, 10 s; jede dritte Zeile ein Bild (v = 1000 + laufende Nummer, absichtlich ausserhalb der
// Zeilenindizes, damit ein Nachschlag mit v nichts trifft); k = Zeilenindex wie im Geraet (live: Bildauftrag je Zeile).
const SP=['t', 'px', 'py', 'pz', 'qx', 'qy', 'qz', 'qw', 'Tpsi', 'Tx', 'Ty', 'Tz', 'flags', 'v', 'k'], C=Object.fromEntries(SP.map((k,i)=>[k, i]));
const rows=[], bilderK=[];
for(let i=0;i<=200;i++){ const t=i/20, a=0.15*t, yaw=a+0.4*Math.sin(0.7*t), qy=[0, Math.sin(yaw/2), 0, Math.cos(yaw/2)];
  const bild=i%3===0; rows.push([+t.toFixed(3), 1.2*Math.cos(a), 1.5, 1.2*Math.sin(a), ...qy, 0.3, 0.5, -1.4, 0.2, 0, bild ? 1000+i/3 : -1, i]);
  if(bild) bilderK.push(i); }
// segmente.bin (live 3.11): je Bild u32 k, f32 t, u16 n, u16 w, u16 h, dann n x (i16 x1, y1, x2, y2 in 1/8 px, u8 Salienz, u8 Klasse)
const segBin=Buffer.concat(bilderK.map(k=>{ const kopf=Buffer.alloc(14), segs=Buffer.alloc(20);
  kopf.writeUInt32LE(k, 0); kopf.writeFloatLE(rows[k][C.t], 4); kopf.writeUInt16LE(2, 8); kopf.writeUInt16LE(287, 10); kopf.writeUInt16LE(640, 12);
  [[40, 100, 40, 500], [200, 120, 200, 480]].forEach((s,j)=>{ s.forEach((v,m)=>segs.writeInt16LE(v*8, j*10+2*m)); segs.writeUInt8(200, j*10+8); segs.writeUInt8(0, j*10+9); });
  return Buffer.concat([kopf, segs]); }));
const proj=[3.212766170501709,0,0,0, 0,1.4398952722549438,0,0, 0,0,-1.0001999139785767,-1, 0,0,-0.2000199854373932,0];
const A={art:'aufnahme', rows, C, P:{obs:[]}, breaks:[], events:[], anker:[], ebenen:[], warnungen:[], segmenteBin:segBin, proj, w:287, h:640, M:{bild:{flipY:false}}, hLaserMm:null};
const seg=T1.segmenteLesen(segBin), posen=T1.posenAus(G, A);
chk('segmente.bin: Schluessel sind die Zeilenindizes k, ihr t ist das der Zeile k (nicht der von v)',
  seg.size===bilderK.length && bilderK.every(k=>seg.has(k) && Math.abs(seg.get(k).t-rows[k][C.t])<1e-6), `${seg.size} Bilder`);
chk('Fehlerbild: ein Nachschlag mit v trifft in keinem Bild', posen.filter(p=>p.v>=0).every(p=>!seg.has(p.v)));
const L=T1.zeitleiste(G, A, posen, [], {quelle:'segmente', ohne:[]});
const bilder=L.filter(x=>x.art==='bild');
chk('Zeitleiste: je Bild der Zeile k das Segment-Schluessel kz = Zeilenindex (k fuers Video bleibt v)',
  bilder.length===bilderK.length && bilder.every(x=>x.kz===x.i && x.k===posen[x.i].v));
chk('bildSegment: findet zu jedem Bild die Segmente seines Zeitpunkts', bilder.every(x=>{ const s=T1.bildSegment(seg, x); return s && Math.abs(s.t-posen[x.i].t)<1e-6; }));
const lauf=await T1.laufen(G, A, {...T1.DEF, quelle:'segmente', segmente:'geraet', ohne:['tiefe', 'ebenen'], metrik:'aus'});
chk('laufen --segmente geraet: alle Bilder gefunden, keines fehlt', lauf.info.bildFehlt===0 && lauf.info.bilder===bilderK.length, `${lauf.info.bilder} Bilder, ${lauf.info.bildFehlt} fehlend`);

// Alte Aufnahmen ohne Spalte k: Zeilenindex ist das k des Geraets (Zustand war eine Zeile je Bildauftrag)
const C2=Object.fromEntries(SP.slice(0, 14).map((k,i)=>[k, i])), A2={...A, C:C2, rows:rows.map(r=>r.slice(0, 14))};
chk('Zustand ohne Spalte k: kz faellt auf den Zeilenindex zurueck', T1.zeitleiste(G, A2, T1.posenAus(G, A2), [], {quelle:'segmente', ohne:[]}).filter(x=>x.art==='bild').every(x=>x.kz===x.i));

console.log(out.join('\n')); console.log(ok ? '\nALLE CHECKS GRÜN' : '\nCHECKS ROT'); process.exit(ok ? 0 : 1);
