// Prueft das Messpaket AP2 Teil 1 (Konzept 3.1, 3.2): (a) den Schluesselfehler k gegen v in raumskizze-karte.mjs
// (--segmente geraet), (b) die Kippquote raumskizze-kippquote.mjs und (c) den Nulltest raumskizze-nulltest.mjs, alles an
// kleinen synthetischen Eingaben. Die grossen Aufnahmen (Downloads) werden nicht gebraucht; die Pruefungen an echten
// Aufnahmen laufen nur, wenn KIPP_TAR / KIPP_PROTOKOLL gesetzt sind und die Dateien da sind, sonst "uebersprungen".
//
//   node test/raumskizze-kippquote.mjs      (KIPP_TAR=aufnahme.tar KIPP_PROTOKOLL=protokoll.json: Pruefung an einer echten Aufnahme)
import {existsSync, readFileSync} from 'node:fs';
import * as T1 from '../raumskizze-karte.mjs';
import * as K from '../raumskizze-kippquote.mjs';
import * as N from '../raumskizze-nulltest.mjs';

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

// ---------------------------------------------------------------- (b) Kippquote: Bausteine
const rechteck=(w, h)=>[[0, 0], [w, 0], [w, h], [0, h]];
const acht=[[0, 0], [4, 3], [4, 0], [0, 3]];
const mitNische=[[0, 0], [3, 0], [3, -0.3], [3.3, -0.3], [3.3, 0], [6, 0], [6, 4], [0, 4]];   // 0,3 m tiefe Nische in der unteren Wand
const mitFase=[[0.3, 0], [6, 0], [6, 4], [0, 4], [0, 0.3]];   // abgeschraegte Ecke (0,42 m): 5 statt 4 Ecken, Flaeche -0,2 %
chk('drehsumme: Rechteck +-360, Acht 0', Math.abs(K.drehsumme(rechteck(6, 4))-360)<1e-9 && Math.abs(K.drehsumme([...rechteck(6, 4)].reverse())+360)<1e-9 && Math.abs(K.drehsumme(acht))<1e-9);
chk('gueltig: Rechteck ja, Acht (kreuzend) nein, 2 Punkte nein', K.gueltig(rechteck(6, 4)) && !K.gueltig(acht) && !K.gueltig([[0, 0], [1, 0]]));
const Lraum=[[0, 0], [6, 0], [6, 3], [3, 3], [3, 5], [0, 5]];
chk('linksRechts: L-Raum hat genau eine konkave Ecke; Umlaufsinn und Startecke aendern die Folge nicht',
  (K.linksRechts(Lraum).match(/R/g)||[]).length===1 && K.gleicheFolge(K.linksRechts(Lraum), K.linksRechts([...Lraum].reverse())) && K.gleicheFolge(K.linksRechts(Lraum), K.linksRechts([...Lraum.slice(2), ...Lraum.slice(0, 2)])), K.linksRechts(Lraum));
chk('gleicheFolge: Rechteck gegen Nischenraum und gegen Fase verschieden', !K.gleicheFolge(K.linksRechts(rechteck(6, 4)), K.linksRechts(mitNische)) && !K.gleicheFolge(K.linksRechts(rechteck(6, 4)), K.linksRechts(mitFase)));
// Prototyp-Verhalten: ein auf der geraden Wand uebrig bleibender Nischenpunkt (beide Nachbarwaende lang) bleibt als 5. Ecke
chk('haupt: Nische schrumpft von 8 auf <= 5 Ecken, die Fase faellt ganz weg (5 -> 4), grosse Raeume bleiben', K.haupt(mitNische).length<=5 && K.haupt(mitFase).length===4 && K.haupt(Lraum).length===6 && K.haupt(rechteck(6, 4)).length===4, `Nische ${K.haupt(mitNische).length}`);
const w15=K.wilson(15, 30), w0=K.wilson(0, 12), w12=K.wilson(12, 12);
chk('wilson: 15/30 -> 0,33..0,67 (Tabellenwert); 0/12 oben 0,24; 12/12 unten 0,76', Math.abs(w15.lo-0.3315)<5e-4 && Math.abs(w15.hi-0.6685)<5e-4 && Math.abs(w0.hi-0.2425)<5e-4 && w0.lo===0 && Math.abs(w12.lo-0.7575)<5e-4 && w12.hi===1, `${w15.lo}-${w15.hi}`);
const q16=K.wilson(12, 16), q30=K.wilson(27, 30), r16=K.wilson(14, 16), r30=K.wilson(15, 30);
chk('wilson: 16 Laeufe trennen 75 % und 90 % nicht (Intervalle ueberlappen), 30 Laeufe mit 5 Abstand auch kaum', q16.hi>r16.lo && K.wilson(22, 30).hi>q30.lo, `75 %: ${q16.lo}-${q16.hi}, 87,5 %: ${r16.lo}-${r16.hi}`);
const fl=[4, 4, 4, 6, 4, 6, 4, 6, 6, 6].map(n=>({n, gueltig:true}));
chk('anzeigeFolge: Flackern 4/6 roh 5 Wechsel, 3er-Regel 1 (nur der dauerhafte Sprung)', K.wechsel(K.anzeigeFolge(fl, 'roh'))===5 && K.wechsel(K.anzeigeFolge(fl, 'dreier'))===1 && K.anzeigeFolge(fl, 'dreier').join('')==='4444444446');
const mitUng=[{n:4, gueltig:true}, {n:9, gueltig:false}, {n:4, gueltig:true}, null, {n:4, gueltig:true}];
chk('anzeigeFolge: ungueltige Ringe werden nicht gezeigt (letzter gueltiger bleibt), null zeigt roh 0', K.anzeigeFolge(mitUng, 'gueltig').join('')==='44444' && K.anzeigeFolge(mitUng, 'roh').join(',')==='4,9,4,0,4');
const ok3=K.onlineKennzahlen(fl);
chk('onlineKennzahlen: Zaehler wie anzeigeFolge', ok3.wechselRoh===5 && ok3.wechselNurGueltig===5 && ok3.wechselMit3===1 && ok3.ungueltigAnteil===0 && ok3.runden===10);
const m1=K.zugMaske(G, 7, 3, 2000, 0.05), m2=K.zugMaske(G, 7, 3, 2000, 0.05), m3=K.zugMaske(G, 7, 4, 2000, 0.05), m4=K.zugMaske(G, 8, 3, 2000, 0.05);
const weg=m=>m.filter(x=>!x).length;
chk('zugMaske: gleiche (seed, Lauf) gleich; anderer Lauf und anderer Seed anders; Anteil ~ p', m1.join()===m2.join() && m1.join()!==m3.join() && m1.join()!==m4.join() && Math.abs(weg(m1)/2000-0.05)<0.02, `${weg(m1)} von 2000 weg`);
// kennzahlen an gebastelten Ringen: Volllauf Rechteck 6 x 4
const R=(P)=>K.ring(P), voll=R(rechteck(6, 4)), lau=[R(rechteck(6, 4)), R(mitFase), R(acht), null];
const kz=K.kennzahlen(voll, lau, {n:4, nHaupt:4});
chk('kennzahlen: K1 nur der identische Lauf (Fase hat 5 Ecken, Acht 4 Ecken aber Flaeche 0)', kz.k1.k===1 && kz.k1.n===4, JSON.stringify(kz.k1));
chk('kennzahlen: K3 nur der identische Lauf', kz.k3.k===1);
chk('kennzahlen: KH zaehlt auch Fase und Acht (Hauptumriss 4 Ecken), nicht den fehlenden Lauf', kz.kh.k===3);
chk('kennzahlen: ungueltig = Acht (1 von 4), ohneErgebnis 1', kz.ungueltig.k===1 && kz.ohneErgebnis===1);
chk('kennzahlen: IoU identisch 1, Fase ~0,99, Median ueber alle Laeufe (null zaehlt 0)', Math.abs(kz.iouLaeufe[0]-1)<1e-9 && kz.iouLaeufe[1]>0.98 && kz.iouLaeufe[3]===0, kz.iouLaeufe.join(' '));
chk('kennzahlen: Richtigkeit getrennt (Eckenzahl = Wahrheit 4: identischer Lauf und Acht, nicht die Fase), Volllauf ohne Abweichung', kz.richtigkeit.eckenzahl.k===2 && kz.richtigkeit.voll.dn===0 && kz.richtigkeit.hauptEckenzahl.k===3);
const kzE=K.kennzahlen(R(rechteck(6, 4)), [K.ring(rechteck(6, 4), {ohneExport:true}), K.ring(acht, {ohneExport:true}), R(rechteck(6, 4))]);
chk('kennzahlen: Laeufe ohne Export (Ring von M8 verworfen, Stand-Ring gezaehlt) werden mitgezaehlt, kreuzender Stand-Ring ist ungueltig', kzE.ohneExport===2 && kzE.ungueltig.k===1 && kzE.ohneErgebnis===0);
const kzUng=K.kennzahlen(R(acht), [R(acht), R(acht)]);
chk('kennzahlen: ungueltiger Volllauf wird gemeldet (K1 = 100 % und trotzdem voll.gueltig false)', kzUng.k1.k===2 && kzUng.voll.gueltig===false && kzUng.voll.drehsumme===0);
chk('tabelle: nennt K1/K3/KH, warnt bei ungueltigem Volllauf und zeigt die Richtigkeit',
  (t=>/K1/.test(t) && /UNGÜLTIG/.test(t) && /Referenz ungültig/.test(t) && /Richtigkeit/.test(t))(K.tabelle({kopf:{quelle:'x', nObs:10, weglassen:0.05, laeufe:2, seed:1, h:'frei'}, alt:{kennzahlen:{...kzUng, richtigkeit:kz.richtigkeit}}})));
const rf=K.rundenFolge(Array.from({length:21}, (_, i)=>({t:i*0.5, P:i<6 ? null : i<12 ? rechteck(3, 2) : Lraum})), 2);
chk('rundenFolge: ein Eintrag je 2 s (Sitzungszeit 0..10 s -> 5), erst ohne Ring, dann 4, dann 6 Ecken', rf.length===5 && rf.map(s=>s.n).join()==='0,4,6,6,6', rf.map(s=>s.n).join());
chk('hWahl: Laser aus dem Protokoll ist die Vorgabe, --H/--hfrei/--hfest wirken, --hfest ohne Laser bricht ab',
  K.hWahl({}, 2416).laser===2.416 && K.hWahl({}, null).modus==='frei' && K.hWahl({H:'2.4'}, 2416).laser===2.4 && K.hWahl({hfrei:true}, 2416).laser===null && K.hWahl({hfest:true}, 2416).modus==='fest'
  && (()=>{ try{ K.hWahl({hfest:true}, null); return false; }catch(e){ return true; } })());
chk('erfassungenSauber: ohne undone, suspect und ohne Strahlen', K.erfassungenSauber([{ra:1, rb:1}, {ra:1, rb:1, undone:true}, {ra:1, rb:1, suspect:true}, {ra:1}, {rb:1}, {ra:1, rb:1, suspect:false}]).length===2);

// ---------------------------------------------------------------- (b2) Kippquote an einem synthetischen L-Raum (6 Ecken, 24 m2, Decke 2,5 m)
// Der Raum wird wandweise abgelaufen (je Wandbesuch ein Standpunkt, der Blick wandert an der Wand entlang), die Strahlen gehen
// von der Kamera zur Deckenkante; kleines Rauschen. Die Erfassungen sind ra/rb wie im Protokoll.
const H_DECKE=2.5, H_KAM=1.5;
const innen=(P, x, y)=>{ let c=false; for(let i=0, j=P.length-1;i<P.length;j=i++) if((P[i][1]>y)!==(P[j][1]>y) && x<(P[j][0]-P[i][0])*(y-P[i][1])/(P[j][1]-P[i][1])+P[i][0]) c=!c; return c; };
function rauminhalt(seed, runden=2, sig=0.004, je=10){
  const r=G.KG.rnd(seed), gauss=()=>{ let s=0; for(let i=0;i<6;i++) s+=r(); return (s-3)/Math.sqrt(0.5); }, obs=[], stand=[]; let t=1;
  for(let pass=0;pass<runden;pass++) for(let w=0;w<Lraum.length;w++){
    const a=Lraum[w], b=Lraum[(w+1)%Lraum.length], L=Math.hypot(b[0]-a[0], b[1]-a[1]); let cx, cz;
    for(let v=0;v<500;v++){ cx=0.4+5.2*r(); cz=0.4+4.2*r(); if(!innen(Lraum, cx, cz)) continue;
      let frei=true; for(let k=0;k<=10 && frei;k++){ const q=[a[0]+(b[0]-a[0])*k/10, a[1]+(b[1]-a[1])*k/10]; for(let m=1;m<20;m++){ const f=m/20*0.97; if(!innen(Lraum, cx+(q[0]-cx)*f, cz+(q[1]-cz)*f)){ frei=false; break; } } }
      if(frei) break; }
    for(let j=0;j<je;j++){ const s0=(L-1.0)*(j/(je-1)), p=s=>[a[0]+(b[0]-a[0])*s/L, a[1]+(b[1]-a[1])*s/L];
      const ray=q=>{ const d=[q[0]-cx+sig*gauss(), H_DECKE-H_KAM+sig*gauss(), q[1]-cz+sig*gauss()], l=Math.hypot(...d); return {o:[cx, H_KAM, cz], d:d.map(x=>x/l)}; };
      obs.push({t:+t.toFixed(3), ra:ray(p(s0)), rb:ray(p(s0+1.0))}); t+=0.5; }
    t+=4.5; }   // Gehzeit zum naechsten Standpunkt (die Kamera bewegt sich stetig, siehe Zeilen unten)
  return obs;
}
const obsRaum=rauminhalt(7), alt=K.rechnerAlt(G, {laser:H_DECKE}), vRaum=await alt(obsRaum);
chk('Raum: alte Auswertung findet 6 Ecken, ~24 m2, gueltig', vRaum && vRaum.n===6 && Math.abs(vRaum.A-24)<0.5 && vRaum.gueltig, vRaum && `${vRaum.n} Ecken, ${vRaum.A.toFixed(2)} m2`);
chk('Raum: H frei (H0 2,55) liefert dieselbe Topologie', (v=>v && v.n===6 && v.gueltig)(await K.rechnerAlt(G, {laser:null})(obsRaum)));
const kq=await K.kippquote(alt, obsRaum, {G, laeufe:12, weglassen:0.05, seed:1, online:(re, ob)=>K.onlineAlt(re, ob)});
chk('Kippquote ohne Rauschen in der Topologie: K1, K3, KH >= 11 von 12, keine ungueltigen Ringe, IoU Median > 0,99', kq.kennzahlen.k1.k>=11 && kq.kennzahlen.k3.k>=11 && kq.kennzahlen.kh.k>=11 && kq.kennzahlen.ungueltig.k===0 && kq.kennzahlen.iou.median>0.99, `K1 ${kq.kennzahlen.k1.k}/12, IoU ${kq.kennzahlen.iou.median}`);
chk('Kippquote: 12 Laeufe, je 5 % der 120 Erfassungen weg (2..11 gestrichen)', kq.laeufe.length===12 && kq.kennzahlen.gestrichen.min>=1 && kq.kennzahlen.gestrichen.max<=14, JSON.stringify(kq.kennzahlen.gestrichen));
chk('Online-Nachspiel: waechst von 0 auf 6 Ecken, 3er-Regel nicht mehr Wechsel als roh', kq.kennzahlen.online.wechselMit3<=kq.kennzahlen.online.wechselRoh && kq.kennzahlen.online.letzteRoh.endsWith('6'), JSON.stringify(kq.kennzahlen.online));
const kq2=await K.kippquote(alt, obsRaum, {G, laeufe:12, weglassen:0.05, seed:1, online:(re, ob)=>K.onlineAlt(re, ob)}), kq3=await K.kippquote(alt, obsRaum, {G, laeufe:12, weglassen:0.05, seed:2});
chk('Wiederholbar: gleicher Seed -> gleiche Kennzahlen und gleiche Ringe; anderer Seed -> andere Zuege', JSON.stringify(kq.kennzahlen)===JSON.stringify(kq2.kennzahlen) && JSON.stringify(kq.laeufe.map(r=>r && r.P))===JSON.stringify(kq2.laeufe.map(r=>r && r.P))
  && JSON.stringify(kq.kennzahlen.iouLaeufe)!==JSON.stringify(kq3.kennzahlen.iouLaeufe));
// starkes Weglassen kippt: 60 % weg -> weniger stabil und messbar schlechter als 5 %
const kqHart=await K.kippquote(alt, obsRaum, {G, laeufe:12, weglassen:0.92, seed:1});
chk('Kippquote ist empfindlich: 92 % weg gibt weniger K1 oder mehr Laeufe ohne Ergebnis als 5 % weg', kqHart.kennzahlen.k1.k+0<kq.kennzahlen.k1.k || kqHart.kennzahlen.ohneErgebnis>0, `K1 ${kqHart.kennzahlen.k1.k}/12, ohne Ergebnis ${kqHart.kennzahlen.ohneErgebnis}`);
// Gegenprobe Richtigkeit/Stabilitaet getrennt: Wahrheit mit 8 Ecken -> stabil (K1 hoch), aber nicht richtig
const kqW=K.kennzahlen(kq.voll, kq.laeufe, {n:8, nHaupt:8});
chk('Richtigkeit getrennt von Stabilitaet: stabil (K1 >= 11/12) und doch 0 Laeufe mit der (falschen) Wahrheits-Eckenzahl 8', kqW.k1.k>=11 && kqW.richtigkeit.eckenzahl.k===0 && kqW.richtigkeit.voll.dn===-2);

// Auswerter ohne Ring (Karte ohne Export): kein Absturz, Volllauf null, nur die Runden fuers Online-Nachspiel bleiben
{ const leer=await K.kippquote(async (ob, opt={})=>opt.folge ? {n:0, gueltig:false, runden:[{t:0, P:null}, {t:3, P:rechteck(3, 2)}]} : null, obsRaum, {G, laeufe:3, weglassen:0.05, seed:1, wahr:{n:6, nHaupt:6},
    online:async (r0, ob, v)=>K.rundenFolge(v && v.runden, 1)});
  chk('Auswerter ohne Ring: Volllauf null, 3 Laeufe ohne Ergebnis, Online-Folge aus den Runden, Richtigkeit 0', leer.voll===null && leer.kennzahlen.voll===null && leer.kennzahlen.ohneErgebnis===3 && leer.kennzahlen.online.runden===3 && leer.kennzahlen.richtigkeit.eckenzahl.k===0); }

// ---------------------------------------------------------------- (b3) Karte-Auswertung an derselben Aufnahme (Zeilen: Kamera folgt den Erfassungen)
{ const SP2=['t', 'px', 'py', 'pz', 'qx', 'qy', 'qz', 'qw', 'Tpsi', 'Tx', 'Ty', 'Tz', 'flags', 'v', 'k'], C2=Object.fromEntries(SP2.map((k, i)=>[k, i])), rows2=[];
  const tEnde=obsRaum[obsRaum.length-1].t+1, gier=o=>Math.atan2(-(o.ra.d[0]+o.rb.d[0]), -(o.ra.d[2]+o.rb.d[2])); let oi=0;
  for(let i=0;i*0.05<=tEnde;i++){ const t=+(i*0.05).toFixed(3); while(oi+1<obsRaum.length && obsRaum[oi+1].t<=t) oi++;
    const o0=obsRaum[oi], o1=obsRaum[Math.min(oi+1, obsRaum.length-1)], f=o1.t-o0.t>1 ? Math.min(1, Math.max(0, (t-o0.t-0.5)/(o1.t-o0.t-0.5))) : 0;   // zwischen den Wandbesuchen stetig gehen
    const dy=Math.atan2(Math.sin(gier(o1)-gier(o0)), Math.cos(gier(o1)-gier(o0))), yaw=gier(o0)+f*dy, c0=o0.ra.o, c1=o1.ra.o, cam=[0, 1, 2].map(k=>c0[k]+f*(c1[k]-c0[k]));
    rows2.push([t, cam[0], cam[1], cam[2], 0, Math.sin(yaw/2), 0, Math.cos(yaw/2), 0, 0, 0, 0, 0, -1, i]); }
  const A3={art:'aufnahme', rows:rows2, C:C2, P:{obs:obsRaum}, breaks:[], events:[], anker:[], ebenen:[], warnungen:[], proj, w:287, h:640, M:{bild:{flipY:false}}, hLaserMm:H_DECKE*1000};
  const oK=T1.optionenAus({quelle:'erfassungen', ohne:'tiefe,ebenen', metrik:'aus', karte:'{"schnitt":{"gyroBruecke":true,"vorhersage":"gedaempft"}}'}), rk=K.rechnerKarte(G, A3, oK);
  const vk=await rk(obsRaum, {folge:true});
  chk('Karte: Volllauf liefert einen gueltigen Umriss mit Runden fuers Online-Nachspiel', vk && vk.n>=4 && vk.gueltig && vk.runden.length>10, vk && `${vk.n} Ecken, ${vk.A.toFixed(2)} m2, ${vk.runden.length} Runden`);
  if(vk){ const kk=await K.kippquote(rk, obsRaum, {G, laeufe:3, weglassen:0.05, seed:1, online:async (r0, ob, v)=>K.rundenFolge(v && v.runden, 2)});
    chk('Karte: Kippquote laeuft durch (3 Laeufe, gleiche Zuege wie Alt: gleiche Anzahl gestrichen), Online-Folge vorhanden',
      kk.laeufe.length===3 && JSON.stringify(kk.kennzahlen.gestrichen)===JSON.stringify((await K.kippquote(alt, obsRaum, {G, laeufe:3, weglassen:0.05, seed:1})).kennzahlen.gestrichen) && kk.kennzahlen.online && kk.kennzahlen.online.runden>0, JSON.stringify(kk.kennzahlen.k1)); } }

// ---------------------------------------------------------------- (c) Nulltest
const metrikAttrappe={aussen:{iou:0.76, eMed:0.038, eP90:0.078, zugeordnet:[1, 2, 3, 4, 5, 6].map(i=>({wahr:'a'+i, exp:'b'+i, d:0.03})), n:17},
  passung:{verhaeltnis:1.96}, waende:{gefunden:4, nLandmarken:18, nWand:18, n1:[], treffer:[{id:3, waende:[['S', 'R']]}, {id:5, waende:[['T', 'S']]}, {id:6, waende:[['U', 'T']]}, {id:8, waende:[['V', 'U']]}]},
  beob:{gehoben:{alle:{med:0.047}}}, flaechen:{netto:{A:14.1, dA:-0.15}}, hoehe:{dH:0.19}};
const ergAttrappe={metrik:metrikAttrappe, pruef:{ok:true, verworfen:[], ringe:[]}, export:{pts:rechteck(6, 4).map(p=>({x:p[0]*1000, y:p[1]*1000}))}};
const kn=N.kennzahlenAus(ergAttrappe).kennzahlen;
chk('Nulltest: Kennzahlen aus ergebnis.json (cm, Zaehler, Ringgueltigkeit)', Math.abs(kn.eckenMedian-3.8)<1e-9 && kn.zugeordnet===6 && kn.wandtreffer===4 && kn.doppelwaende===0 && kn.ungueltigeRinge===0 && Math.abs(kn.beobMedian-4.7)<1e-9 && kn.iou===0.76, JSON.stringify(kn));
const mitDoppelt=JSON.parse(JSON.stringify(ergAttrappe)); mitDoppelt.metrik.waende.treffer.push({id:9, waende:[['S', 'R']]}); mitDoppelt.pruef.verworfen=[{id:'x'}]; mitDoppelt.export.pts=acht.map(p=>({x:p[0]*1000, y:p[1]*1000}));
const kd=N.kennzahlenAus(mitDoppelt).kennzahlen;
chk('Nulltest: Doppelwand = Wahrheitswand von 2 Landmarken (1), ungueltige Ringe = verworfen + kreuzender Export (2)', kd.doppelwaende===1 && kd.ungueltigeRinge===2, JSON.stringify(kd));
const basis={kennzahlen:kn};
chk('Nulltest: gleiche Zahlen -> gruen', N.vergleichen(kn, basis).ok && N.vergleichen(kn, basis).zeilen.every(z=>z.status==='ok'));
const tol=id=>N.KENNZAHLEN.find(d=>d.id===id).tol;
chk('Nulltest: IoU -0,015 innerhalb der Toleranz (gruen), -0,03 darueber (rot)', N.vergleichen({...kn, iou:0.785}, {kennzahlen:{...kn, iou:0.80}}).zeilen.find(z=>z.id==='iou').status==='ok'
  && N.vergleichen({...kn, iou:0.77}, {kennzahlen:{...kn, iou:0.80}}).ok===false, `Toleranz ${tol('iou')}`);
chk('Nulltest: Eckenfehler Median +0,9 cm gruen, +1,5 cm rot (niedriger ist besser)', N.vergleichen({...kn, eckenMedian:3.9}, {kennzahlen:{...kn, eckenMedian:3.0}}).zeilen.find(z=>z.id==='eckenMedian').status==='ok'
  && N.vergleichen({...kn, eckenMedian:3.9}, {kennzahlen:{...kn, eckenMedian:2.4}}).zeilen.find(z=>z.id==='eckenMedian').status==='schlechter');
chk('Nulltest: Verbesserung ist "besser", nicht rot; eine Wand weniger ist rot (Toleranz 0); eine Ecke weniger zugeordnet noch gruen, zwei rot',
  N.vergleichen({...kn, iou:0.9}, basis).zeilen.find(z=>z.id==='iou').status==='besser' && N.vergleichen({...kn, wandtreffer:3}, basis).ok===false
  && N.vergleichen({...kn, zugeordnet:5}, basis).ok && !N.vergleichen({...kn, zugeordnet:4}, basis).ok);
chk('Nulltest: Pflichtwert (IoU >= 0,76) verletzt -> rot, auch wenn die Baseline gleich schlecht ist', (v=>!v.ok && v.zeilen.find(z=>z.id==='iou').pflicht.verletzt)(N.vergleichen({...kn, iou:0.75}, {kennzahlen:{...kn, iou:0.75}})));
chk('Nulltest: fehlende Kennzahl im Lauf (null) ist rot, Doppelwand neu ist rot', !N.vergleichen({...kn, iou:null}, basis).ok && !N.vergleichen({...kn, doppelwaende:1}, basis).ok);
chk('Nulltest: Toleranz aus der Baseline hat Vorrang', N.vergleichen({...kn, iou:0.77}, {kennzahlen:{...kn, iou:0.80}, toleranzen:{iou:{abs:0.1}}}).ok && !N.vergleichen({...kn, iou:0.77}, {kennzahlen:{...kn, iou:0.80}}).ok);
const bericht=N.bericht(N.vergleichen(kn, basis), kn, N.kennzahlenAus(ergAttrappe).info, {aufnahme:'x', erzeugt:'2026-10-31'});
chk('Nulltest: Ausgabe nennt "noch nicht verfuegbar" fuer Verdachtswaende, Peilung und Eckenpaare, ohne sie zu pruefen', /Verdachtswaende/.test(bericht) && /Peilabweichung/.test(bericht) && /vertauschte Eckenpaare/.test(bericht)
  && !N.KENNZAHLEN.some(d=>/verdacht|peil|paare/i.test(d.id)));
{ const B=JSON.parse(readFileSync(new URL('../nulltest-baseline.json', import.meta.url), 'utf8'));
  chk('Baseline-Datei: alle Kennzahlen da, Toleranzen mit Begruendung, "noch nicht verfuegbar" gelistet, Pflichtwerte erfuellt, Eingaben mit Pruefsumme',
    N.KENNZAHLEN.every(d=>Number.isFinite(B.kennzahlen[d.id]) && B.toleranzen[d.id].abs===d.tol && B.toleranzen[d.id].begruendung.length>20) && B.nochNichtVerfuegbar.length>=3 && B.eingaben.tar.sha256.length===16
    && N.vergleichen(B.kennzahlen, B).ok, `IoU ${B.kennzahlen.iou}, Eckenfehler Median ${B.kennzahlen.eckenMedian} cm`); }

// ---------------------------------------------------------------- (d) echte Aufnahmen (nur wenn vorhanden)
const DL=process.env.RAUMSKIZZE_DATEN || (process.env.HOME||'')+'/Downloads', STEMPEL='2026-10-31T16-25-49-246Z';
const TAR=process.env.KIPP_TAR || `${DL}/aufnahme-${STEMPEL}-lauf0-video.tar`, PROT=process.env.KIPP_PROTOKOLL || `${DL}/raumskizze-protokoll-${STEMPEL}.json`;
if(existsSync(TAR) && existsSync(PROT)){
  const AR=T1.ladeAufnahme(TAR, {protokoll:PROT}), obsR=K.erfassungenSauber(AR.P.obs);
  const h=K.hWahl({}, AR.hLaserMm), rr=await K.kippquote(K.rechnerAlt(G, h), obsR, {G, laeufe:4, weglassen:0.05, seed:1});
  chk('echte Aufnahme: Kippquote (alt, 4 Laeufe) liefert Volllauf und Kennzahlen', rr.voll && rr.voll.n>=3 && rr.kennzahlen.k1.n===4, `${obsR.length} Erfassungen, Volllauf ${rr.voll && rr.voll.n} Ecken, ${rr.voll && rr.voll.gueltig ? 'gueltig' : 'ungueltig'}`);
  if(AR.segmenteBin){
    const seg=T1.segmenteLesen(AR.segmenteBin), posenR=T1.posenAus(G, AR), bi=T1.zeitleiste(G, AR, posenR, [], {quelle:'segmente', ohne:[]}).filter(x=>x.art==='bild');
    const treffer=bi.filter(x=>{ const s=T1.bildSegment(seg, x); return s && Math.abs(s.t-posenR[x.i].t)<1e-3; }).length;
    chk('echte Aufnahme: --segmente geraet findet zu jedem Bild das Segment seines Zeitpunkts (kz), mit v nur zufaellig', treffer===bi.length && bi.filter(x=>seg.has(x.k) && Math.abs(seg.get(x.k).t-posenR[x.i].t)<1e-3).length<bi.length/50, `${treffer}/${bi.length}`); }
  else notiz('uebersprungen: Aufnahme ohne segmente.bin'); }
else notiz(`uebersprungen: echte Aufnahme nicht da (${TAR}); KIPP_TAR/KIPP_PROTOKOLL oder RAUMSKIZZE_DATEN setzen`);

console.log(out.join('\n')); console.log(ok ? '\nALLE CHECKS GRÜN' : '\nCHECKS ROT'); process.exit(ok ? 0 : 1);
