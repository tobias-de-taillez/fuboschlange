// raumskizze-karte.mjs — T1 (ARCHITEKTUR v3, 5.1, 17.9): Offline-Treiber der Karte. Spielt eine Aufnahme
// (TAR oder ausgepackter Ordner) oder eine synthetische Sitzung (T3/F4, .jsonl.gz) in Zeitfolge durch die
// neue Pipeline, genau wie der Hauptfaden live: je Zustandszeile G.kartePose, je Bruch und Ereignis
// G.karteEreignis, je Erfassung G.karteErfassung, je Videobild G.bild -> G.karteBild, je Tiefensatz
// G.karteTiefe, je Ebene G.karteEbenen; G.karteRechnen je --takt Sitzungszeit (oder genau die Runden aus
// --runden karte.jsonl), am Ende die Schlussrunde mit iter 20, Export ueber M8, Vergleich mit der alten
// Pipeline (G.solveSweepAuto) und Messung gegen die Wahrheit mit T2 (raumskizze-metrik.mjs).
//
//   node raumskizze-karte.mjs <aufnahme-ordner|.tar|sitzung.jsonl.gz> [--protokoll p.json] [--wahrheit w.json] [--H 2.416|--ohneH]
//        [--quelle segmente|erfassungen|beide] [--skala fest|frei] [--reg voll|aus] [--ohne boden,senk,tiefe,ebenen,fein,umriss,hyp]
//        [--orakel-rahmen] [--segmente geraet|nachspiel] [--inseln ja|nein|protokoll] [--runden karte.jsonl] [--takt 0.5]
//        [--arbeit iter=3,relin=20000,reg=2000,hyp=4,lin=2] [--weglassen 0.05 --block 1.0 --seed n] [--ohneAb 0,2] [--bis t]
//        [--umriss mincut|cabral] [--aus ordner] [--knoten] [--lago auto|aus|immer] [--pp fest|frei] [--anker gefroren|rel]
//        [--orakel-landmarken] [--platzhalter datei.mjs] [--erfassungen app|alle] [--metrik voll|export|aus] [--html seite]
//        [--spiegel nein|ja] [--uhr versatz] [--module M0,M1,M2,M10] [--platzhalter-vor] [--stand ordner] [--datei M10=pfad,M5=pfad]
//        [--sichtfeld 0.6] [--sichtfeld-erf lassen|schneiden]
//   import {ladeSeite, ladeQuelle, laufen, ...} from './raumskizze-karte.mjs'
//
// Module: vendor + geo der Seite; jede Moduldatei M0-M10, die die Seite (noch) nicht traegt, wird als eigener
// Block vor globalThis.RAUMSKIZZE=G; eingefuegt (Muster raumskizze-aufnahme.mjs). Fehlende Funktionen kommen
// bis J1 aus --platzhalter (ESM mit einsetzen(G, o)) und zuletzt aus den traegen Platzhaltern unten (feste
// Signatur aus 4, leere Ergebnisse). Der Bericht nennt je Name die Herkunft und je Moduldatei die Pruefsumme (sha256,
// 12 Zeichen); --stand ordner nimmt die Moduldateien aus einem festgehaltenen Stand (z. B. Kopie fuer J1), --datei M10=pfad
// einzelne Dateien (Vergleich alt gegen neu).
// Epochen offline wie F2 (karte/fixtures/erzeuge-f2.mjs): +1 je Zeile mit geaendertem T oder mit einem Bruch
// seit der vorigen Zeile, hoechstens +1 je Zeile. Bild k = k-tes v >= 0, Breite 287 (Polsterspalte weg),
// flipY je Zeit aus den Ereignissen y-spiegel, proj aus dem Manifest. Erfassungen ohne undone (und mit
// --erfassungen app ohne suspect, wie der Pool der App), ep der naechsten Zeile.
// Wiederholbarkeit (10.9): keine Uhr und kein Zufall in Entscheidungen; Zufall nur ueber G.KG.rnd(--seed).
// --uhr versatz verstellt die Messuhr (Pruefung, dass ms nichts entscheidet).
// --sichtfeld f (Doku 12.7, Hebel (d)): Ablation, das Bild offline mittig auf etwa f der Breite beschneiden, bei gleicher
// Winkelaufloesung (siehe sichtfeldFenster); f = 1 ist das heutige Verhalten, wortgleich. raumskizze-ablation.mjs rechnet damit
// die Tabelle Faktor x Quelle. --sichtfeld-erf schneiden beschneidet dazu die Fadenkreuz-Erfassungen wie die engere Kamera
// (erfassungBeschneiden); Vorgabe lassen: alle bleiben unveraendert drin, nur ihre ndc gehen ins beschnittene Bild.
import {readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync} from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolve, join, basename} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import * as T2 from './raumskizze-metrik.mjs';

export const VERSION=1;
export const WAHRHEIT=fileURLToPath(new URL('./wahrheit-hesterkamp-wohnkueche-2026-10-25.json', import.meta.url));
const D2R=Math.PI/180, R2D=180/Math.PI;
const wrap=a=>Math.atan2(Math.sin(a), Math.cos(a));
const q=(a,p)=>{ if(!a.length) return NaN; const s=Float64Array.from(a).sort(); return s[Math.min(s.length-1, Math.floor(p*s.length))]; };
const f2=x=>Number.isFinite(x) ? x.toFixed(2) : '–', cm=x=>Number.isFinite(x) ? (100*x).toFixed(1) : '–';

export const DEF={quelle:'segmente', skala:'fest', reg:'voll', ohne:[], segmente:'nachspiel', inseln:'nein', takt:0.5,
  arbeit:{iter:3, relin:20000, reg:2000, hyp:4, lin:2}, schluss:{iter:20}, weglassen:0, block:0, seed:1, ohneAb:[], bis:Infinity, umriss:'mincut',
  knoten:false, lago:'aus', pp:'fest', anker:'gefroren', orakelRahmen:false, orakelLandmarken:false, erfassungen:'app', metrik:'voll',
  spiegel:'nein', standJe:2, H:undefined, sichtfeld:1, sichtfeldErf:'lassen'};

// ------------------------------------------------ Seite und Module
export const MODULE=[
  ['M0', 'raumskizze-karte-grund.js', /G\.gBei=/], ['M1', 'raumskizze-elsed.js', /G\.elsed=/], ['M2', 'raumskizze-senkrechte.js', /G\.verticalEdges=/],
  ['M3', 'raumskizze-segmente.js', /G\.bild=/], ['M4', 'raumskizze-abschnitte.js', /G\.sessionCuts=/], ['M5', 'raumskizze-landmarken.js', /G\.lmAufnehmen=/],
  ['M6', 'raumskizze-ausgleich.js', /G\.lmAusgleich=/], ['M7', 'raumskizze-umriss.js', /G\.umriss=/], ['M8', 'raumskizze-ringe.js', /G\.ringePruefen=/],
  ['M9', 'raumskizze-tiefe.js', /G\.depthRays=/], ['M10', 'raumskizze-kartenlauf.js', /G\.karteRechnen=/]];
// Namen je Modul (4), die T1 und M10 brauchen
export const NAMEN={
  M3:['lumaAus', 'lmSegmente', 'lmVerschmelzen', 'lmGier', 'lmRechtwinklig', 'bildNeu', 'bild'],
  M4:['sessionCuts', 'schnittKlasse', 'sectionOf', 'ketteStart', 'registriere', 'ankerEinordnen', 'resKette', 'resAnker', 'abschnittSigma', 'abschnittGewicht', 'knotenSetzen', 'resKnoten'],
  M5:['lmVorhersage', 'lmZuordnen', 'lmAufnehmen', 'lmSchluessel', 'lmSpuren', 'lmHoehe', 'lmDurchblick', 'lmZusammenfuehren', 'lmTrennen', 'lmIntervalle', 'lmHoehenklasse',
    'lmEcken', 'lmEinbinden', 'lmNeuZuordnen'],
  M6:['resSegment', 'resSenk', 'resTiefe', 'resEbene', 'lmBloecke', 'lmAusgleich', 'covBlock', 'fehlerband'],
  M7:['UM_DEF', 'umrissEingabe', 'umriss', 'inselHypothesen', 'inselBewerten'],
  M8:['ringePruefen', 'toRoomDataRinge', 'ringeHinweise'],
  M9:['depthRays', 'depthFlags', 'depthLift', 'depthQuality', 'depthFloorFree', 'depthWallPlanes', 'depthAssoc', 'depthEdgeCheck', 'ebeneAusAR'],
  M10:['karteNeu', 'kartePose', 'karteBild', 'karteEreignis', 'karteErfassung', 'karteTiefe', 'karteEbenen', 'karteEntscheid', 'karteRechnen', 'karteAbschluss', 'karteRundeKopf']};

// Traege Platzhalter (bis J1): genau die Signaturen aus 4, leere Ergebnisse. Sie lassen jede Aufnahme
// durchlaufen, liefern aber keine Karte; Funktion bringt erst --platzhalter bzw. das echte Modul.
export function traege(G){
  const KL=G.KG.KL, leerBild=a=>({k:a.k, vi:a.vi, t:a.t, ep:a.ep, camTo:Float64Array.from(a.camTo), proj:Float32Array.from(a.proj), flipY:!!a.flipY, w:a.w, h:a.h,
    f:G.fokusPx(a.proj, a.h), n:0, seg:new Float32Array(0), cls:new Int8Array(0), man:new Int8Array(0), dir:new Float32Array(0), nTeile:new Uint8Array(0), psi0:null, senk:null,
    ms:{luma:0, elsed:0, verschm:0, einteilen:0, senk:0, gesamt:0}});
  const sig0={psi:0, max:0, min:0, ang:0, y:0}, rest4={r:[0,0,0,0], sigma:[1,1,1,1]};
  return {
    lumaAus:(buf,fmt,w,h,aus)=>{ const o=aus || new Uint8Array(w*h); if(fmt==='luma8') o.set(new Uint8Array(buf).subarray(0, w*h)); return o; },
    lmSegmente:()=>({seg:new Float32Array(0), cls:new Int8Array(0), dir:new Float32Array(0), n:0}), lmVerschmelzen:b=>b, lmGier:()=>null, lmRechtwinklig:b=>b,
    bildNeu:()=>({}), bild:(BZ,a)=>leerBild(a),
    sessionCuts:()=>[], schnittKlasse:()=>({klasse:'pause', rPose:NaN, rPsi:NaN, bindung:{art:'keine', sP:Infinity, sY:Infinity, sH:Infinity, kern:'mm', mm:[], k:null}}),
    sectionOf:(S,t,e)=>S.filter(c=>c.epA!==c.epB ? e>=c.epB : (e>c.epA || (e===c.epA && t>=c.t))).length,
    ketteStart:(S,A)=>{ for(const a of A) if(!a.g0) a.g0={psi:0, tx:0, ty:0, tz:0}; return A; },
    registriere:()=>({hyp:[], gewaehlt:-1, verhaeltnis:null}), ankerEinordnen:()=>'unbekannt', resKette:()=>({r:[0,0,0,0], komp:[], kern:'mm'}), resAnker:()=>rest4,
    abschnittSigma:()=>sig0, abschnittGewicht:A=>A && (A.stufe==='verbunden' || A.stufe==='locker') ? 1 : 0, knotenSetzen:A=>A.knoten, resKnoten:()=>rest4,
    lmVorhersage:()=>({A:null, B:null, sigPx:Infinity, sichtbar:false, iv:[]}), lmZuordnen:()=>({paare:[], neu:[], mehrdeutig:[]}),
    lmAufnehmen:()=>({zugeordnet:0, neu:0, befoerdert:0}), lmSchluessel:()=>false, lmSpuren:st=>({st, befoerdert:[]}), lmHoehe:()=>null,
    lmDurchblick:()=>({durchblick:[], unterzug:false}), lmZusammenfuehren:()=>({paare:[]}), lmTrennen:()=>({getrennt:[]}), lmIntervalle:W=>W.iv,
    lmHoehenklasse:W=>W.cls, lmEcken:()=>({zugeordnet:0, neu:0}), lmEinbinden:()=>({neu:[], zusammen:[]}), lmNeuZuordnen:()=>({geaendert:0}),
    resSegment:()=>[0, 0], resSenk:()=>[0], resTiefe:()=>new Float32Array(0), resEbene:()=>[0, 0], lmBloecke:()=>({neu:0, behalten:0}),
    lmAusgleich:()=>({chi2:0, iter:0, lin:0, relin:0, abgehaengt:0, cov:null, ok:true, stufen:{gier:false, lin:0, gn:0}, ldl:{n:0, nnzL:0, ordnung:null}, mm:[], rest:[]}),
    covBlock:()=>new Float64Array(0), fehlerband:()=>NaN,
    UM_DEF:{}, umrissEingabe:()=>({lines:[], fans:[], path:[], bodenFrei:null, wBoden:0, inselFest:[], ausschluss:[]}),
    umriss:()=>({ringe:[], kandidaten:[], hypothesen:[], aufgefuellt:0, verworfen:0, innenVerworfen:[], nLinien:0, nZellen:0, arbeit:{schnitte:1, zellen:0}, ms:0, warn:['traeger Platzhalter']}),
    inselHypothesen:()=>[], inselBewerten:(inp,h)=>({id:h.id, dE:0, dEn:0, phi:1, pfad:false, supRing:0, seiten:0, stufe:'nein', runden:0}),
    ringePruefen:ringe=>({ok:true, ringe:ringe.filter(r=>r.pts && r.pts.length>=3), verworfen:[], fehler:null}),
    toRoomDataRinge:(ringe, hLaserMm, o={})=>{ const pts=[], walls=[]; let k=0;
      for(const R of ringe){ const ids=R.pts.map(c=>{ const id=G.idOf(k++); pts.push({id, x:Math.round(c[0]*1000), y:(o.spiegel ? -1 : 1)*Math.round(c[1]*1000)}); return id; });
        ids.forEach((id,i)=>walls.push([id, ids[(i+1)%ids.length]])); }
      const hmeas=Number.isFinite(hLaserMm) && hLaserMm>0 && pts.length ? [{kind:'h', at:pts[0].id, d:Math.round(hLaserMm), sigma:5, on:true}] : [];
      return {pts, walls, meas:[], openings:[], hmeas, idSeq:pts.length, openSeq:1}; },
    ringeHinweise:()=>({name:'Raumskizze', liste:[]}),
    depthRays:()=>null, depthFlags:()=>({stale:false, flat:false, empty:true, validFrac:0}), depthLift:()=>null, depthQuality:()=>null, depthFloorFree:()=>({nFree:0, nOcc:0}),
    depthWallPlanes:()=>[], depthAssoc:o=>o, depthEdgeCheck:()=>null, ebeneAusAR:()=>null};
}

// Laedt die Seite (vendor + geo), fuegt fehlende Moduldateien ein und setzt Platzhalter fuer fehlende Namen.
// Rueckgabe {G, quellen: {M0: 'Seite'|'Datei'|'fehlt', ...}, herkunft: {name: 'Modul'|'Platzhalter'|'traege'}, pruef: {M5: sha256/12}, pfade}.
// o.stand: Ordner mit Moduldateien (sonst Projektordner); o.dateien: {M10: pfad} fuer einzelne Dateien.
export async function ladeSeite(o={}){
  const html=readFileSync(o.html ? resolve(o.html) : new URL('./raumskizze-probe.html', import.meta.url), 'utf8');
  const pick=id=>{ const m=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`)); if(!m) throw new Error('Script-Block '+id+' fehlt'); return m[1]; };
  // Traegt die Seite das Modul? Gesucht wird die Zuweisung im Code ohne Kommentare (die Seite von Stand 6 nennt
  // G.bild= in einem Kommentar zu ihrem M3-Platzhalter). o.module: nur diese Moduldateien einfuegen (z. B. M0,M10).
  let geo=pick('geo'); const mark='globalThis.RAUMSKIZZE=G;', quellen={}, auswahl=o.module ? new Set(o.module) : null, pruef={}, pfade={};
  for(const [m, datei, test] of MODULE){
    if(test.test(geo.replace(/\/\/.*$/gm, ''))){ quellen[m]='Seite'; continue; }
    const eigen=o.dateien && o.dateien[m] ? resolve(o.dateien[m]) : o.stand && existsSync(join(resolve(o.stand), datei)) ? join(resolve(o.stand), datei) : null;
    const pf=eigen ? pathToFileURL(eigen) : new URL('./'+datei, import.meta.url); if(!existsSync(pf)){ quellen[m]='fehlt'; continue; }
    if(auswahl && !auswahl.has(m)){ quellen[m]='nicht gewaehlt'; continue; }
    const at=geo.lastIndexOf(mark); if(at<0) throw new Error('geo-Block ohne '+mark);
    const txt=readFileSync(pf, 'utf8'); pruef[m]=createHash('sha256').update(txt).digest('hex').slice(0, 12); pfade[m]=fileURLToPath(pf);
    geo=geo.slice(0, at)+'{\n'+txt+'\n}\n'+geo.slice(at); quellen[m]='Datei'; }
  const hatte=Object.prototype.hasOwnProperty.call(globalThis, 'RAUMSKIZZE'), vorher=globalThis.RAUMSKIZZE;
  new Function('"use strict";\n'+pick('vendor')+'\n'+geo)();
  const G=globalThis.RAUMSKIZZE;
  if(hatte) globalThis.RAUMSKIZZE=vorher; else delete globalThis.RAUMSKIZZE;
  const fehlt=n=>n==='UM_DEF' ? G.UM_DEF==null : typeof G[n]!=='function', herkunft={};
  for(const ns of Object.values(NAMEN)) for(const n of ns) herkunft[n]=fehlt(n) ? null : 'Modul';
  if(o.platzhalter){ const P=await import(pathToFileURL(resolve(o.platzhalter)).href);
    const gesetzt=P.einsetzen(G, {fehlend:Object.keys(herkunft).filter(n=>!herkunft[n] || o.platzhalterVor), ...(o.platzhalterOpt||{})}) || [];
    for(const n of gesetzt) herkunft[n]='Platzhalter'; }
  const T=traege(G);
  for(const n of Object.keys(herkunft)) if(!herkunft[n] && fehlt(n)){ G[n]=T[n]; herkunft[n]='traege'; } else if(!herkunft[n]) herkunft[n]='Platzhalter';
  if(typeof G.karteRechnen!=='function') throw new Error('M10 fehlt (raumskizze-kartenlauf.js)');
  return {G, quellen, herkunft, pruef, pfade};
}

// ------------------------------------------------ Dateien
const zeilenJSON=b=>b ? b.toString('utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)) : [];
function dateienAus(src){
  const files={};
  if(statSync(src).isDirectory()){ const walk=d=>readdirSync(d, {withFileTypes:true}).forEach(e=>{ const p=join(d, e.name); if(e.isDirectory()) walk(p); else files[e.name]=readFileSync(p); }); walk(src); }
  else { const b=readFileSync(src);
    for(let o=0; o+512<=b.length;){ const name=b.subarray(o, o+100).toString('utf8').replace(/\0.*$/s, ''); if(!name) break;
      const size=parseInt(b.subarray(o+124, o+136).toString('utf8').replace(/\0.*$/s, '').trim(), 8);
      files[name.split('/').pop()]=b.subarray(o+512, o+512+size); o+=512+Math.ceil(size/512)*512; } }
  return files;
}
// Durchlauf der Aufnahme im Protokoll (wie raumskizze-aufnahme.mjs): fremde oder aeltere Protokolle nicht verwenden.
function durchlauf(P, M){
  if(!P) return {R:null, warn:'kein Protokoll'};
  if(M.sitzung && P.started && P.started!==M.sitzung) return {R:null, warn:`Protokoll aus anderer Seitensitzung (${P.started})`};
  if(Array.isArray(P.runs) && M.lauf!=null && P.runs.length<M.lauf) return {R:null, warn:'Protokoll aelter als die Aufnahme'};
  return {R:Array.isArray(P.runs) && M.lauf!=null && P.runs.length>M.lauf ? {...P, ...P.runs[M.lauf]} : P, warn:null};
}
// Tiefe (tiefe.bin.gz): Satz v1 80 Byte Kopf (u32 Videobild, f32 t, u16 w, u16 h, f32 rawValueToMeters, 16 f32 M), dann w·h u16;
// v2 (Stand 6, tiefe.md 4) 96 Byte mit u8 type, u8 active, u16 Grundcode ab Byte 80 [Annahme bis zur ersten v2-Aufnahme].
export function tiefeLesen(buf, M){
  if(!buf) return [];
  const d=gunzipSync(buf), kopf=M && M.tiefe && (M.tiefe.kopf===96 || M.tiefe.version===2) ? 96 : 80, out=[]; let o=0;
  while(o+kopf<=d.length){ const vi=d.readUInt32LE(o), t=d.readFloatLE(o+4), w=d.readUInt16LE(o+8), h=d.readUInt16LE(o+10), scale=d.readFloatLE(o+12);
    const Mx=new Float32Array(16); for(let k=0;k<16;k++) Mx[k]=d.readFloatLE(o+16+4*k);
    const type=kopf===96 ? ['unbekannt', 'raw', 'smooth'][d.readUInt8(o+80)] || 'unbekannt' : 'unbekannt';
    if(o+kopf+2*w*h>d.length) break;
    const raw=new Uint16Array(w*h); for(let i=0;i<w*h;i++) raw[i]=d.readUInt16LE(o+kopf+2*i);
    out.push({vi, t, w, h, scale, M:Mx, raw, type}); o+=kopf+2*w*h; }
  return out;
}
// segmente.bin (live 3.11): je Bild u32 k, f32 t, u16 n, u16 w, u16 h, dann n × (i16 x1, y1, x2, y2 in 1/8 px, u8 Salienz, u8 Klasse).
export function segmenteLesen(buf){
  const m=new Map(); if(!buf) return m; let o=0;
  while(o+14<=buf.length){ const k=buf.readUInt32LE(o), t=buf.readFloatLE(o+4), n=buf.readUInt16LE(o+8), w=buf.readUInt16LE(o+10), h=buf.readUInt16LE(o+12); o+=14;
    const roh=[]; for(let i=0;i<n && o+10<=buf.length;i++, o+=10) roh.push({x1:buf.readInt16LE(o)/8, y1:buf.readInt16LE(o+2)/8, x2:buf.readInt16LE(o+4)/8, y2:buf.readInt16LE(o+6)/8,
      salience:buf.readUInt8(o+8)/255, kl:buf.readUInt8(o+9)});
    m.set(k, {k, t, w, h, roh}); }
  return m;
}

// ------------------------------------------------ Aufnahme -> Eingaenge
const m4q=(p,[x,y,z,w])=>[1-2*(y*y+z*z), 2*(x*y+z*w), 2*(x*z-y*w), 0,  2*(x*y-z*w), 1-2*(x*x+z*z), 2*(y*z+x*w), 0,
  2*(x*z+y*w), 2*(y*z-x*w), 1-2*(x*x+y*y), 0,  p[0], p[1], p[2], 1];
// Epochen wie F2 (lib.epochen): +1 je Zeile mit geaendertem T oder Bruch seit der vorigen Zeile, hoechstens +1 je Zeile.
export function epochen(rows, C, breaks){
  const br=(breaks||[]).map(b=>b.t).filter(Number.isFinite).sort((a,b)=>a-b), ep=new Int32Array(rows.length);
  if(!rows.length) return ep;
  let e=0, j=0; while(j<br.length && br[j]<=rows[0][C.t]) j++;
  for(let i=1;i<rows.length;i++){ const a=rows[i-1], b=rows[i]; let neu=[C.Tpsi, C.Tx, C.Ty, C.Tz].some(c=>a[c]!==b[c]);
    while(j<br.length && br[j]<=b[C.t]){ if(br[j]>a[C.t]) neu=true; j++; }
    if(neu) e++; ep[i]=e; }
  return ep;
}
export function posenAus(G, A){
  const {rows, C}=A, ep=epochen(rows, C, A.breaks);
  return rows.map((r,i)=>{ const pose=[r[C.px], r[C.py], r[C.pz], r[C.qx], r[C.qy], r[C.qz], r[C.qw]], T=[r[C.Tpsi], r[C.Tx], r[C.Ty], r[C.Tz]];
    const camTo=(r[C.flags]&64) ? null : G.m4mul(G.m4inv(G.gMat(G.gAusT(T))), m4q(pose.slice(0, 3), pose.slice(3)));
    const z={t:r[C.t], ep:ep[i], pose, T, cam:camTo ? [camTo[12], camTo[13], camTo[14]] : null, blick:camTo ? G.blickPlan(camTo) : null, flags:r[C.flags], v:r[C.v]};
    if(C.imuPsi!=null && Number.isFinite(r[C.imuPsi])) z.imuPsi=r[C.imuPsi];
    if(C.an!=null && Array.isArray(r[C.an])) z.an=r[C.an];
    return z; });
}
// Aufnahme laden: Manifest, Zustand, Protokoll (Durchlauf), Anker, Tiefe, Ebenen, IMU, Messung, karte.jsonl, segmente.bin, Video.
export function ladeAufnahme(src, o={}){
  const files=dateienAus(src), M=files['manifest.json'] ? JSON.parse(files['manifest.json']) : null;
  if(!M) throw new Error('manifest.json fehlt in '+src);
  const rows=zeilenJSON(files['zustand.jsonl']), C=Object.fromEntries(M.zustand.spalten.map((k,i)=>[k,i]));
  const P0=o.protokoll ? JSON.parse(readFileSync(o.protokoll, 'utf8')) : files['protokoll.json'] ? JSON.parse(files['protokoll.json']) : null;
  const {R, warn}=durchlauf(P0, M), warnungen=warn ? [warn] : [];
  const A={art:'aufnahme', src, M, rows, C, P:R, breaks:R ? (R.breaks||[]).filter(b=>Number.isFinite(b.t)) : [], events:R ? R.events||[] : [],
    anker:zeilenJSON(files['anker.jsonl']), ebenen:zeilenJSON(files['ebenen.jsonl']), imu:zeilenJSON(files['imu.jsonl']), messung:zeilenJSON(files['messung.jsonl']),
    karte:zeilenJSON(files['karte.jsonl']), segmenteBin:files['segmente.bin'] || null, tiefeBuf:files['tiefe.bin.gz'] || null, video:files['video.h264'] || null,
    proj:M.geometrie && M.geometrie.proj || R && R.session && R.session.geometry && R.session.geometry.proj, w:M.bild.breite, h:M.bild.hoehe,
    hLaserMm:R && R.hLaserMm || null, warnungen};
  if(M.video && !A.video) warnungen.push('Manifest nennt Video, video.h264 fehlt');
  return A;
}
// Synthetische Sitzung (T3 sim() bzw. F4/T3-JSONL): {kopf, posen, breaks, ereignisse, bilder:[{bildErg, wahr}], erfassungen}
export function ladeSitzung(src){
  const Z=gunzipSync(readFileSync(src)).toString('utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)), kopf=Z[0].kopf || {}, out={art:'sitzung', src, kopf, posen:[], breaks:[], ereignisse:[], bilder:[], erfassungen:[]};
  const nan=a=>a.map(v=>v===null ? NaN : v);
  for(const z of Z.slice(1)){
    if(z.typ==='pose') out.posen.push(z.zeile);
    else if(z.typ==='bruch') out.breaks.push(z.bruch);
    else if(z.typ==='ereignis') out.ereignisse.push(z.ev);
    else if(z.typ==='bild'){ const b=z.bildErg; out.bilder.push({bildErg:{...b, camTo:Float64Array.from(b.camTo), proj:Float32Array.from(b.proj), seg:Float32Array.from(nan(b.seg)), cls:Int8Array.from(b.cls),
      man:Int8Array.from(b.man), dir:Float32Array.from(b.dir), nTeile:Uint8Array.from(b.nTeile)}, wahr:z.wahr}); }
    else if(z.typ==='erfassung') out.erfassungen.push({...z.erf, wahr:z.wahr}); }
  out.proj=kopf.proj || (out.bilder[0] && Array.from(out.bilder[0].bildErg.proj)); out.w=kopf.w || 287; out.h=kopf.h || 640;
  out.hLaserMm=kopf.H ? Math.round(kopf.H*1000) : null; out.warnungen=[];
  return out;
}
export function ladeQuelle(src, o={}){ return /\.jsonl(\.gz)?$/.test(src) ? ladeSitzung(src) : ladeAufnahme(src, o); }

// Erfassungen der Aufnahme: ohne undone (app: auch ohne suspect), Zeile = naechste der beiden umliegenden (F2).
export function erfassungenAus(A, posen, art='app', G=null){
  if(A.art==='sitzung') return A.erfassungen.map(e=>({t:e.t, ep:e.ep, ra:e.ra, rb:e.rb, id:e.id}));
  const obs=((A.P && A.P.obs) || []).filter(x=>!x.undone && x.ra && x.rb && (art!=='app' || x.suspect!==true)), N=posen.length;
  const zeileVon=t=>{ let lo=0, hi=N-1; while(lo<hi){ const m=(lo+hi+1)>>1; if(posen[m].t<=t+1e-9) lo=m; else hi=m-1; } return lo; };
  return obs.map((x,j)=>{ const i=zeileVon(x.t), k=Math.min(N-1, i+1), z=Math.abs(posen[k].t-x.t)<Math.abs(posen[i].t-x.t) ? k : i, p=posen[z];
    const camTo=G && p.cam ? Array.from(G.m4mul(G.m4inv(G.gMat(G.gAusT(p.T))), m4q(p.pose.slice(0, 3), p.pose.slice(3)))) : null;
    return {t:x.t, ep:p.ep, ra:x.ra, rb:x.rb, id:j, zeile:z, an:x.an, camTo, ndc:x.ndc || null, flipY:x.flipY ?? null}; });
}
// y-spiegel je Zeit wie flipAt in raumskizze-aufnahme.mjs
export const flipAtAus=A=>{ const ev=(A.events||[]).filter(e=>e.type==='y-spiegel').map(e=>[e.t, !!e.an]), f0=!!(A.M && A.M.bild && A.M.bild.flipY);
  return t=>{ let v=ev.length ? !ev[0][1] : f0; for(const [te,a] of ev){ if(te<=t) v=a; else break; } return v; }; };

// Ankerrelativ (--anker rel, 9.4 Punkt 7a): Korrektur C = A_neu ∘ A_t^-1 des naechsten verfolgten Messankers (id aus an),
// A_t = Lage bis t, A_neu = neueste Lage in anker.jsonl; im Bezug der Zeile: T^-1 · C · T. Rueckgabe g im Bezug oder null.
export function ankerKorrektur(G, A, id, t, T){
  const C=A.M && A.M.anker && A.M.anker.spalten ? Object.fromEntries(A.M.anker.spalten.map((k,i)=>[k,i])) : {t:0, anker:8};
  let vor=null, neu=null;
  for(const z of A.anker){ const a=(z[C.anker]||[]).find(e=>e[0]===id && e.length>=5); if(!a) continue; if(z[C.t]<=t) vor=a; neu=a; }
  if(!vor || !neu) return null;
  const gA=a=>({psi:G.ankerPlan(a[4]), tx:a[1], ty:a[2], tz:a[3]}), Cl=G.gKomp(gA(neu), G.gInv(gA(vor))), gT=G.gAusT(T);
  return G.gKomp(G.gInv(gT), G.gKomp(Cl, gT));
}
// Auftrag aus einem dekodierten Bild (Polsterspalte weg, w = bild.breite) und G.bild -> BildErgebnis (3.1).
// fen (--sichtfeld < 1): nur die Spalten x0 .. x0+w'-1 der echten Breite (die Polsterspalte rechts liegt ausserhalb).
export function bildAusVideo(G, BZ, A, p, v, k, fy, senk, fen=null){
  const camTo=G.m4mul(G.m4inv(G.gMat(G.gAusT(p.T))), m4q(p.pose.slice(0, 3), p.pose.slice(3)));
  const x0=fen ? fen.x0 : 0, w=fen ? fen.w2 : A.w, proj=fen ? fen.proj : A.proj;
  const buf=new Uint8Array(w*A.h); for(let y=0;y<A.h;y++) buf.set(v.fr.subarray(y*v.SW+x0, y*v.SW+x0+w), y*w);
  return G.bild(BZ, {k, vi:k, t:p.t, ep:p.ep, fmt:'luma8', w, h:A.h, buf:buf.buffer, voll:null, camTo:Array.from(camTo), proj:Array.from(proj), flipY:fy, senk});
}

// ------------------------------------------------ Sichtfeld (Doku 12.7, Hebel (d): Ablation)
// Mittiger Ausschnitt der Breite w' = w - 2·x0, x0 = round(w·(1-f)/2), Zeilen unberuehrt (Zeile 0 unten, flipY gilt weiter).
// Gleiche Winkelaufloesung heisst gleiche Brennweite in px: die x-Zeile der Projektion (proj[0], [4], [8], [12],
// spaltenweise) waechst mit w/w'. Dann gilt fuer jeden Punkt x_ndc' = x_ndc·w/w' (G.pixToNdc: Pixelmitte u+0.5,
// Spalte u' = u - x0), und der Hauptpunkt bleibt, wo er war (heute proj[8] = 0: mittig). Symmetrisch statt
// w' = round(f·w), weil sonst bei ungerader Breite (287) ein halbes Pixel Rand uebrig bliebe; w' weicht davon um
// hoechstens 1 px ab, darum nennt der Bericht das wirksame w'/w. x0 = 0 (f = 1) gibt null: T1 laeuft dann wortgleich.
export function sichtfeldFenster(w, f, proj){
  if(!(f>0 && f<=1)) throw new Error('--sichtfeld: Faktor 0 < f <= 1 erwartet, nicht '+f);
  const x0=Math.round(w*(1-f)/2), w2=w-2*x0;
  if(!x0) return null;
  if(w2<16) throw new Error(`--sichtfeld ${f}: nur ${w2} px Breite`);
  const p=Array.from(proj); for(const i of [0, 4, 8, 12]) p[i]=proj[i]*w/w2;
  const hfov=P=>2*Math.atan(1/Math.abs(P[0]))*R2D;
  return {f, fEff:w2/w, w, w2, x0, proj:p, hfov:[hfov(proj), hfov(p)]};
}
export const ndcBeschnitten=(x, fen)=>x*fen.w/fen.w2;
// Ein Segment (Pixel wie G.pixToNdc, Rohsegment {x1, y1, x2, y2, ...}) auf das Fenster [x0-0.5, x0+w'-0.5] beschneiden,
// Liang-Barsky nur in x, dann um x0 verschieben; null, wenn nichts im Fenster liegt. z zaehlt drin/geschnitten/weg.
export function segmentBeschneiden(s, fen, z=null){
  const lo=fen.x0-0.5, hi=fen.x0+fen.w2-0.5, dx=s.x2-s.x1, dy=s.y2-s.y1; let t0=0, t1=1;
  for(const [p, d] of [[-dx, s.x1-lo], [dx, hi-s.x1]]){
    if(p===0){ if(d<0){ t1=-1; break; } continue; }
    const r=d/p; if(p<0){ if(r>t0) t0=r; } else if(r<t1) t1=r; }
  if(!(t1>t0)){ if(z) z.weg++; return null; }
  if(z) z[t0>0 || t1<1 ? 'geschnitten' : 'drin']++;
  return {...s, x1:s.x1+t0*dx-fen.x0, y1:s.y1+t0*dy, x2:s.x1+t1*dx-fen.x0, y2:s.y1+t1*dy};
}
// --sichtfeld-erf schneiden: eine Fadenkreuz-Erfassung, wie die engere Kamera sie gesehen haette. Das Stueck zwischen den
// Enden (e.ndc im vollen Bild) wird auf |x| <= w'/w beschnitten (Liang-Barsky in x, y mit demselben Parameter s), dann ins
// beschnittene Bild umgerechnet. Strahl eines geschnittenen Endes ohne camTo (die Zeile traegt es nicht immer): Lochkamera,
// die Richtung im Kamerarahmen c = [(x+P8)/P0, (y+P9)/P5, -1] ist affin in ndc, also d(s) ~ (1-s)·|c_a|·ra.d + s·|c_b|·rb.d
// (ra.d, rb.d normiert; auf A8 stimmen Strahlen und ndc so auf 3e-6° ueberein). Der Ursprung (Kameralage) bleibt.
// proj ist die volle Projektion. null, wenn nichts im Fenster liegt; z zaehlt drin/geschnitten/weg.
export function erfassungBeschneiden(e, fen, proj, z=null){
  const [a, b]=e.ndc, g=fen.w2/fen.w, dx=b[0]-a[0], dy=b[1]-a[1]; let t0=0, t1=1;
  for(const [p, d] of [[-dx, a[0]+g], [dx, g-a[0]]]){
    if(p===0){ if(d<0){ t1=-1; break; } continue; }
    const r=d/p; if(p<0){ if(r>t0) t0=r; } else if(r<t1) t1=r; }
  if(!(t1>t0)){ if(z) z.weg++; return null; }
  // auf +-1 geklemmt: der Schnittpunkt liegt rechnerisch genau auf dem Rand, die Rundung soll ihn nicht hinausschieben
  const ndc=s=>[Math.max(-1, Math.min(1, ndcBeschnitten(a[0]+s*dx, fen))), a[1]+s*dy];
  if(t0===0 && t1===1){ if(z) z.drin++; return {...e, ndc:[ndc(0), ndc(1)]}; }
  if(z) z.geschnitten++;
  const c=([x, y])=>Math.hypot((x+proj[8])/proj[0], (y+proj[9])/proj[5], 1), na=c(a), nb=c(b);
  const strahl=(s, r)=>{ const v=[0, 1, 2].map(i=>(1-s)*na*e.ra.d[i]+s*nb*e.rb.d[i]), l=Math.hypot(...v); return {...r, o:[...r.o], d:v.map(x=>x/l)}; };
  return {...e, ndc:[ndc(t0), ndc(t1)], ra:t0>0 ? strahl(t0, e.ra) : e.ra, rb:t1<1 ? strahl(t1, e.rb) : e.rb, beschnitten:[t0, t1]};
}
// BildErgebnis einer synthetischen Sitzung (T3, Segmente schon in px) beschneiden: Enden wie oben, dann neu einteilen mit
// G.lmSegmente/lmGier/lmRechtwinklig auf w', proj' wie M3 (ohne Verschmelzen: T3 verschmilzt nicht, damit wahr passt), sPx
// und nTeile wie vorher. Senkrechte (top/bottom in NDC) nur, wenn beide Enden im Fenster liegen. Beilage wahr: dieselbe
// Auswahl je Segment (WAHR_SEG) bzw. je Senkrechte (WAHR_SENK), die Felder ausdruecklich genannt wie in T3 (raumskizze-sim.mjs,
// w = {wand, seite, ring, ecke, kante, kid, senkKid, senkEcke, ab, g, pp}); nach der Laenge zu raten hielte pp = [0, 0] bei
// genau 2 Segmenten fuer ein Segmentfeld. Fuer ehrliche Simulationen eines engeren Sichtfelds ist T3 mit eigener Kamera besser.
export const WAHR_SEG=['wand', 'seite', 'ring', 'ecke', 'kante', 'kid'], WAHR_SENK=['senkKid', 'senkEcke'];
export function bildErgBeschneiden(G, b, fen, wahr=null, z=null){
  const S=G.KG.SEG, roh=[], idx=[];
  for(let i=0;i<b.n;i++){ const j=i*S, r=segmentBeschneiden({x1:b.seg[j], y1:b.seg[j+1], x2:b.seg[j+2], y2:b.seg[j+3], sal:b.seg[j+4]}, fen, z);
    if(r){ roh.push(r); idx.push(i); } }
  const proj=Float32Array.from(fen.proj), bi=G.lmSegmente(roh, fen.w2, b.h, proj, b.camTo, b.flipY);
  idx.forEach((i,n)=>{ bi.seg[n*S+5]=b.seg[i*S+5]; });
  const sx=x=>ndcBeschnitten(x, fen), senkIdx=[], senk=b.senk ? b.senk.filter((s,i)=>{ const ok=Math.abs(sx(s.top[0]))<=1 && Math.abs(sx(s.bottom[0]))<=1; if(ok) senkIdx.push(i); return ok; })
    .map(s=>({...s, top:[sx(s.top[0]), s.top[1]], bottom:[sx(s.bottom[0]), s.bottom[1]]})) : null;
  const kopfB={k:b.k, vi:b.vi, t:b.t, ep:b.ep, camTo:Float64Array.from(b.camTo), proj, flipY:!!b.flipY, w:fen.w2, h:b.h, f:G.fokusPx(proj, b.h),
    man:new Int8Array(bi.n).fill(-1), nTeile:Uint8Array.from(idx.map(i=>b.nTeile ? b.nTeile[i] : 1)), psi0:null, senk:null, ms:{}};
  const psi0=G.lmGier({...kopfB, ...bi}), bv=G.lmRechtwinklig({...kopfB, ...bi}, psi0);
  let w2=null;
  if(wahr){ w2={};
    for(const [k,v] of Object.entries(wahr)){ const feld=v && (Array.isArray(v) || ArrayBuffer.isView(v));
      w2[k]=feld && WAHR_SENK.includes(k) ? senkIdx.map(i=>v[i]) : feld && WAHR_SEG.includes(k) ? idx.map(i=>v[i]) : v; } }
  return {b:{...kopfB, ...bv, psi0, senk, ms:{}}, wahr:w2};
}
// Bodenmarken (9.4 Punkt 7a, S6-M): je Ereignis marke {t, id, p (Treffer am Boden, local), an} die Lage in F0 gefroren
// (Bezug der Zeile, G.gBei des Abschnitts) und ankerrelativ (Korrektur des Messankers an[0], neueste Lage), dazu die
// Wahrheit, wenn die Wahrheitsdatei marken [{id, x, y}] (mm, Rahmen der Wahrheit) traegt; T = Passung F0 -> Wahrheit (T2).
export function bodenmarken(G, lauf, wahrheit=null, T=null){
  const KZ=lauf.KZ, S=lauf.letzte.stand, A=lauf.A || {anker:[]}, AB=new Map(S.abschnitte.map(a=>[a.ab, a]));
  const W=wahrheit && wahrheit.marken ? new Map(wahrheit.marken.map(m=>[m.id, [m.x/1000, m.y/1000]])) : new Map();
  return (KZ.lauf.marken||[]).map(ev=>{ let z=lauf.posen[0]; for(const p of lauf.posen){ if(p.t<=ev.t) z=p; else break; }
    const ab=G.sectionOf(KZ.schnitte, ev.t, z.ep), a=AB.get(ab), g=a && a.g ? G.gBei(a, ev.t) : null, pb=G.gAnw(G.gInv(G.gAusT(z.T)), ev.p);
    const C=ev.an ? ankerKorrektur(G, A, ev.an[0], ev.t, z.T) : null, f=q=>g ? G.gPlan(g, [q[0], q[2]]) : null;
    const gefroren=f(pb), rel=C ? f(G.gAnw(C, pb)) : null, wahr=W.get(ev.id) || null, inW=p=>p && T ? T2.tf(p, T) : null;
    const d=(p)=>p && wahr && T ? Math.hypot(inW(p)[0]-wahr[0], inW(p)[1]-wahr[1]) : null;
    return {id:ev.id, t:ev.t, ab, gefroren, rel, wahr, dGefroren:d(gefroren), dRel:d(rel), anker:ev.an ? ev.an[0] : null}; });
}
const strahlMit=(G, g, r)=>{ const o=G.gAnw(g, r.o), e=G.gAnw({...g, tx:0, ty:0, tz:0}, r.d); return {o, d:e}; };

// ------------------------------------------------ Video
// Dekodierte Bilder in Reihenfolge k (ffmpeg -r fps -f h264 ... -vsync 0 -pix_fmt gray), Zeile 0 wie gespeichert.
export async function* videoBilder(A){
  const [SW, SH]=A.M.bild.gepolstert || [A.w, A.h], FS=SW*SH;
  const ff=spawn('ffmpeg', ['-v','error','-r',String(A.M.video.fps||10),'-f','h264','-i','pipe:0','-vsync','0','-f','rawvideo','-pix_fmt','gray','pipe:1']);
  ff.stdin.on('error', ()=>{}); ff.stdin.end(A.video);
  let rest=Buffer.alloc(0), k=0;
  for await(const d of ff.stdout){ rest=rest.length ? Buffer.concat([rest, d]) : d;
    while(rest.length>=FS){ yield {k:k++, fr:rest.subarray(0, FS), SW}; rest=rest.subarray(FS); } }
}

// ------------------------------------------------ Lauf
// Zufall fuer --weglassen/--block (10.10): eigener Strom je Zweck, nur G.KG.rnd.
function weglassenPlan(G, o, t0, t1){
  if(!(o.weglassen>0) && !(o.block>0)) return ()=>false;
  const r=G.KG.rnd((o.seed|0)*7919+17), rb=G.KG.rnd((o.seed|0)*104729+3), b0=t0+rb()*Math.max(0, t1-t0-o.block), wegK=new Map();
  return (art, id, t)=>{ if(o.block>0 && t>=b0 && t<b0+o.block) return true; if(!(o.weglassen>0)) return false;
    const key=art+':'+id; if(!wegK.has(key)) wegK.set(key, r()<o.weglassen); return wegK.get(key); };
}
const uhrMit=v=>{ if(v==null) return null; const p=globalThis.performance; let n=0; return ()=>p.now()*(1+v)+1000*v+(n++)*v; };
// Zeitleiste: Eingaenge in Sitzungszeit; bei gleichem t erst Ereignisse/Brueche, dann Pose, Bild, Erfassung.
function zeitleiste(G, A, posen, erf, o){
  const L=[]; let s=0; const add=(t, ord, x)=>L.push({t, ord, s:s++, ...x});
  for(const b of A.breaks||[]) add(b.t, 0, {art:'ereignis', ev:{...b, typ:'bruch'}});
  if(A.art==='sitzung') for(const e of A.ereignisse) add(e.t, 0, {art:'ereignis', ev:{...e, typ:e.typ || e.type}});
  else for(const e of A.events||[]){ if(!Number.isFinite(e.t) || e.type==='y-spiegel') continue;
    if(e.type==='insel-entscheid' && o.inseln!=='protokoll') continue;
    add(e.t, 0, {art:'ereignis', ev:{...e, typ:e.type, quelle:'protokoll'}}); }
  posen.forEach((p,i)=>add(p.t, 1, {art:'pose', i}));
  if(o.quelle!=='erfassungen'){
    if(A.art==='sitzung') A.bilder.forEach((x,i)=>add(x.bildErg.t, 2, {art:'bild', i, k:x.bildErg.k}));
    else posen.forEach((p,i)=>{ if(p.v>=0) add(p.t, 2, {art:'bild', i, k:p.v}); }); }
  if(o.quelle!=='segmente') erf.forEach((e,i)=>add(e.t, 3, {art:'erf', i}));
  if(A.art!=='sitzung' && !o.ohne.includes('tiefe')) (A.tiefe||[]).forEach((d,i)=>add(d.t, 2, {art:'tiefe', i}));
  if(A.art!=='sitzung' && !o.ohne.includes('ebenen')) (A.ebenen||[]).forEach((e,i)=>{ const t=Array.isArray(e) ? e[0] : e.t; if(Number.isFinite(t)) add(t, 2, {art:'ebene', i}); });
  L.sort((a,b)=>a.t-b.t || a.ord-b.ord || a.s-b.s);
  return L;
}
// Bildkanten (--bildkanten): {kanten:[{ki, kj, ti, tj, regel, g}], kantenSift?} wie scratchpad/bildkanten (Bild-Teil 12.8) -> M10 opt.kanten
export function kantenLaden(b){ const J=JSON.parse(readFileSync(b.datei, 'utf8'));
  return {liste:[...(J.kanten||[]), ...(b.sift ? J.kantenSift||[] : [])], min:b.min ?? 2, datei:b.datei}; }
// Ein ganzer Lauf. Rueckgabe {KZ, runden: [{stand, kopf}], letzter, export, teilen, hinweise, alt, info}.
export async function laufen(G, A, o0={}){
  const o={...DEF, ...o0, arbeit:{...DEF.arbeit, ...(o0.arbeit||{})}}, info={warnungen:[...(A.warnungen||[])], bilder:0, bildFehlt:0, weg:{bild:0, erf:0}, ereignisse:0, tiefe:0, ebenen:0};
  const posen=A.art==='sitzung' ? A.posen.map(p=>({...p})) : posenAus(G, A);
  let erf=erfassungenAus(A, posen, o.erfassungen, G);
  // --sichtfeld < 1 (12.7 (d)): kam ist das beschnittene Bild (w', proj'), sonst genau A. Die Tiefe faellt dann weg: ihre
  // Strahlen (G.depthRays aus d.M und proj) muessten mitbeschnitten werden, und sie traegt live ohnehin nicht (12.6, Stand 9).
  // Vorgabe --sichtfeld-erf lassen: Erfassungen bleiben alle drin (Strahlen ra/rb unveraendert, sie entstehen am Fadenkreuz);
  // nur ihre ndc gehen ins beschnittene Bild. Enden mit |x'| > 1 laegen ausserhalb und werden gezaehlt: die Referenz
  // 'erfassungen' ist darum optimistisch, und in 'beide' bestimmen sie die Stufen der Abschnitte unabhaengig vom Faktor.
  // schneiden: jede Erfassung wie die engere Kamera sie saehe (erfassungBeschneiden), ganz draussen faellt sie weg.
  // Erfassungen ohne ndc (T3-Sitzungen, alte Protokolle) bleiben in beiden Faellen unveraendert (erfOhneNdc).
  if(!['lassen', 'schneiden'].includes(o.sichtfeldErf)) throw new Error('--sichtfeld-erf lassen|schneiden, nicht '+o.sichtfeldErf);
  const fen=o.sichtfeld==null || o.sichtfeld===1 ? null : sichtfeldFenster(A.w, o.sichtfeld, A.proj), kam=fen ? {w:fen.w2, h:A.h, proj:fen.proj} : {w:A.w, h:A.h, proj:A.proj};
  if(fen){ const SF={f:fen.f, fEff:fen.fEff, w:fen.w, w2:fen.w2, x0:fen.x0, proj0:[A.proj[0], fen.proj[0]], hfov:fen.hfov, tiefeAus:false, erfNdc:0, erfEnden:0, erfEndenAussen:0,
      erfAussen:0, erfOhneNdc:0, erfModus:o.sichtfeldErf, erfSchnitt:o.sichtfeldErf==='schneiden' ? {drin:0, geschnitten:0, weg:0} : null, seg:{drin:0, geschnitten:0, weg:0}};
    if(!o.ohne.includes('tiefe')){ o.ohne=[...o.ohne, 'tiefe'];
      if(A.art!=='sitzung' && A.tiefeBuf){ SF.tiefeAus=true; info.warnungen.push('--sichtfeld < 1: Tiefe ausgelassen (--ohne tiefe erzwungen)'); } }
    erf=erf.map(e=>{ if(!e.ndc){ SF.erfOhneNdc++; return e; } const ndc=e.ndc.map(p=>[ndcBeschnitten(p[0], fen), p[1]]), aus=ndc.filter(p=>Math.abs(p[0])>1).length;
      SF.erfNdc++; SF.erfEnden+=ndc.length; SF.erfEndenAussen+=aus; if(aus) SF.erfAussen++;
      return SF.erfSchnitt ? erfassungBeschneiden(e, fen, A.proj, SF.erfSchnitt) : {...e, ndc}; }).filter(Boolean);
    info.sichtfeld=SF; }
  if(A.art!=='sitzung' && A.tiefeBuf && !o.ohne.includes('tiefe')) A.tiefe=tiefeLesen(A.tiefeBuf, A.M);
  const hLaser=o.H===null ? null : Number.isFinite(o.H) ? o.H : A.hLaserMm ? A.hLaserMm/1000 : null;
  // --anker rel: Erfassungen ueber den Messanker (obs.an) mit dessen neuester Lage umrechnen
  if(o.anker==='rel'){ let n=0; erf=erf.map(e=>{ if(!e.an) return e; const p=posen[e.zeile], g=p ? ankerKorrektur(G, A, e.an[0], e.t, p.T) : null; if(!g) return e; n++;
      return {...e, ra:strahlMit(G, g, e.ra), rb:strahlMit(G, g, e.rb), anker:'rel'}; });
    info.ankerRel=n; if(!n) info.warnungen.push('--anker rel: keine Erfassung mit obs.an (Aufnahme vor Stand 6 bzw. ohne ?mess=1) - gefroren gerechnet'); }
  const orakel=o.orakel || null;
  const KZ=G.karteNeu({H:hLaser ? {laser:hLaser, sigma:0.015} : null, quelle:o.quelle, arbeit:o.arbeit, knoten:o.knoten, lago:o.lago, pp:o.pp, skala:o.skala,
    reg:o.reg!=='aus', ohne:o.ohne, ohneAb:o.ohneAb, proj:kam.proj, w:kam.w, h:kam.h, umriss:!o.ohne.includes('umriss'), umrissOpt:o.umriss==='cabral' ? {art:'cabral'} : {},
    orakel, uhr:uhrMit(o.uhr), ...(o.karte||{}), ...(o.bildkanten ? {kanten:kantenLaden(o.bildkanten)} : {})});
  // M3 skaliert seine px-Schwellen mit skala 'auto' = min(w, h)/287; beschnitten muss die Skala des vollen Bilds bleiben,
  // sonst saenken sich minLineLen, minLen und die Verschmelz-Schwellen mit der Breite (andere Kanten statt weniger Sichtfeld).
  const BZ=G.bildNeu(fen ? {skala:Math.min(A.w, A.h)/287} : {}), flipAt=A.art==='sitzung' ? (()=>false) : flipAtAus(A), seg=o.segmente==='geraet' ? segmenteLesen(A.segmenteBin) : null;
  if(o.segmente==='geraet' && !A.segmenteBin) throw new Error('--segmente geraet: segmente.bin fehlt (Aufnahmen vor Stand 6)');
  const L=zeitleiste(G, A, posen, erf, o), t0=posen.length ? posen[0].t : 0, t1=posen.length ? posen[posen.length-1].t : 0;
  const weg=weglassenPlan(G, o, t0, t1), runden=[], verdraengt=new Set();
  // Runden: Takt nach Sitzungszeit oder genau die Runden des Geraets (--runden)
  // Zeilen von karte.jsonl ({runde: RundeKopf, schluss?}) oder RundeKoepfe; schluss markiert die Schlussrunde des Geraets (Stand 7)
  const RK=o.runden ? o.runden.map(z=>z && typeof z.runde==='object' ? {...z.runde, ...(z.schluss===true ? {schluss:true} : {})} : z).filter(k=>k && Number.isFinite(k.runde)) : null;
  if(RK) for(const k of RK) for(const v of k.verdraengt||[]) verdraengt.add(v);
  let iR=0, tNaechste=t0+o.takt;
  const runde=(extra={})=>{ const r=G.karteRechnen(KZ, {arbeit:o.arbeit, ...extra}); runden.push(r); return r; };
  // --runden: die letzte Runde der Datei ist die Schlussrunde (live: computeResult schreibt sie zuletzt, 5.1 Schritt 6).
  // Traegt sie schluss (karte.jsonl ab Stand 7), nimmt der Karten-Worker live danach nichts mehr an (KW.zu): Eingaenge,
  // die erst nach ihr faellig waeren (etwa 'aufnahme-ende'), entfallen (false), statt sie als gewoehnliche Runde auszuloesen.
  const vorEingang=(x)=>{
    if(RK){ while(iR<RK.length){ const k=RK[iR]; const faellig=x==null || (x.art==='pose' ? posen[x.i].t>k.tPose : x.art==='bild' ? x.k>k.kBis : x.t>k.t);
        if(!faellig) break;
        if(iR===RK.length-1){ if(k.schluss) return false; if(x==null) break; }
        runde({arbeit:{...o.arbeit, ...(o.rundenArbeit ? k.arbeit : {})}}); iR++; } }
    else if(x) while(x.t>tNaechste){ runde(); tNaechste+=o.takt; }
    return true; };
  let vid=null, vk=null;
  if(o.quelle!=='erfassungen' && A.art!=='sitzung' && o.segmente!=='geraet'){ if(!A.video) info.warnungen.push('kein Video - keine Segmente'); else vid=videoBilder(A); }
  const naechstesVideo=async k=>{ while(vid && (!vk || vk.k<k)){ const n=await vid.next(); if(n.done){ vid=null; vk=null; break; } vk=n.value; } return vk && vk.k===k ? vk : null; };
  const bezugBis=(t)=>{ let lo=0, hi=posen.length-1, b=0; while(lo<=hi){ const m=(lo+hi)>>1; if(posen[m].t<=t){ b=m; lo=m+1; } else hi=m-1; } return posen[b]; };
  // Was nicht eingespeist wird (verdraengt, ohne Bezug, weggelassen), entscheidet vor dem Rundentakt: sonst loeste ein
  // nie eingespeistes Bild beim Nachspiel (--runden, kBis) eine Runde zu frueh aus.
  const poseV=new Map(posen.filter(p=>p.v>=0).map(p=>[p.v, p]));
  const nimmt=x=>{
    if(x.art==='bild'){ if(verdraengt.has(x.k)) return false; if(A.art!=='sitzung' && !posen[x.i].cam){ info.bildFehlt++; return false; }
      if(weg('bild', x.k, x.t)){ info.weg.bild++; return false; } }
    else if(x.art==='erf' && weg('erf', erf[x.i].id, erf[x.i].t)){ info.weg.erf++; return false; }
    else if(x.art==='tiefe'){ const p=poseV.get(A.tiefe[x.i].vi); if(!p || !p.cam) return false; }
    return true; };
  for(const x of L){
    if(x.t>o.bis) break;
    if(!nimmt(x)) continue;
    if(!vorEingang(x)) continue;
    if(x.art==='pose') G.kartePose(KZ, posen[x.i]);
    else if(x.art==='ereignis'){ G.karteEreignis(KZ, x.ev); info.ereignisse++; }
    else if(x.art==='erf') G.karteErfassung(KZ, erf[x.i]);
    else if(x.art==='bild'){
      let b=null;
      if(A.art==='sitzung'){ const s=A.bilder[x.i];
        if(fen){ const r=bildErgBeschneiden(G, s.bildErg, fen, o.mitWahr ? s.wahr : null, info.sichtfeld.seg); b=r.b; if(o.mitWahr) b.wahr=r.wahr; }
        else { b=s.bildErg; if(o.mitWahr) b.wahr=s.wahr; } }
      else { const p=posen[x.i];
        const camTo=G.m4mul(G.m4inv(G.gMat(G.gAusT(p.T))), m4q(p.pose.slice(0, 3), p.pose.slice(3))), fy=flipAt(p.t);
        if(seg){ const s=seg.get(x.k); if(!s){ info.bildFehlt++; continue; }
          // --sichtfeld < 1: Geraete-Segmente (px des vollen Bilds) aufs Fenster beschneiden, dann wie bisher
          const roh=fen ? s.roh.map(r=>segmentBeschneiden(r, fen, info.sichtfeld.seg)).filter(Boolean) : s.roh;
          // lmVerschmelzen braucht ein volles BildErgebnis (camTo, proj, w, h, flipY; P-B Befund 6), nicht die Ausgabe von lmSegmente
          const bi=G.lmSegmente(roh, kam.w, A.h, kam.proj, camTo, fy), kopfB={k:x.k, vi:x.k, t:p.t, ep:p.ep, camTo:Float64Array.from(camTo), proj:Float32Array.from(kam.proj), flipY:fy, w:kam.w, h:A.h,
            f:G.fokusPx(kam.proj, A.h), man:new Int8Array(bi.n).fill(-1), nTeile:new Uint8Array(bi.n).fill(1), psi0:null, senk:null, ms:{}};
          let bv=G.lmVerschmelzen({...kopfB, ...bi}); const psi0=G.lmGier(bv); bv=G.lmRechtwinklig(bv, psi0);
          b={...kopfB, ...bv, psi0, senk:null, ms:{}}; }
        else { const v=await naechstesVideo(x.k); if(!v){ info.bildFehlt++; continue; }
          b=bildAusVideo(G, BZ, A, p, v, x.k, fy, x.k%2===0 && !o.ohne.includes('senk'), fen); } }
      info.bilder++; G.karteBild(KZ, b); }
    else if(x.art==='tiefe'){ const d=A.tiefe[x.i], p=poseV.get(d.vi);
      const camTo=G.m4mul(G.m4inv(G.gMat(G.gAusT(p.T))), m4q(p.pose.slice(0, 3), p.pose.slice(3)));
      G.karteTiefe(KZ, {...d, camTo:Float64Array.from(camTo), ep:p.ep}); info.tiefe++; }
    else if(x.art==='ebene'){ const e=A.ebenen[x.i], rec=Array.isArray(e) ? {t:e[0], id:e[1], o:e[2], pose:e.slice(3, 10), poly:e[10], lct:e[11]} : e; G.karteEbenen(KZ, [rec]); info.ebenen++; }
  }
  vorEingang(null);
  while(vid){ const n=await vid.next(); if(n.done) break; }
  // Schluss (5.1 Schritt 6; bei --runden die letzte Runde der Datei) und Inselentscheide (7.4)
  let letzte=runde({arbeit:{...o.arbeit, ...o.schluss}, schluss:true});
  if(o.inseln==='ja'){ const offen=letzte.stand.ringe.filter(R=>R.art==='insel' && R.entscheid==='offen');
    if(offen.length){ for(const R of offen) G.karteEntscheid(KZ, {ring:R.id, wahl:'ja', t:KZ.lauf.tMax}); letzte=runde({arbeit:{...o.arbeit, ...o.schluss}, schluss:true}); } }
  const ex=exportieren(G, letzte.stand, hLaser, o);
  return {G, A, KZ, posen, erf, runden, letzte, ...ex, hLaser, info, flipAt, fen};
}
// Export ueber M8: exportierte Ringe, Aussenring zuerst.
export function exportieren(G, stand, hLaser, o={}){
  const ringe=stand.ringe.filter(R=>R.exportiert!==false).sort((a,b)=>(a.art==='aussen' ? 0 : 1)-(b.art==='aussen' ? 0 : 1));
  if(!ringe.length || ringe[0].art!=='aussen') return {pruef:null, export:null, teilen:null, hinweise:null};
  const pruef=G.ringePruefen(ringe);
  if(!pruef || !pruef.ringe || !pruef.ringe.length || pruef.ringe[0].art!=='aussen') return {pruef, export:null, teilen:null, hinweise:null};
  const data=G.toRoomDataRinge(pruef.ringe, hLaser ? Math.round(hLaser*1000) : null, {kamera:true, spiegel:o.spiegelExport===true});
  const hinweise=G.ringeHinweise(pruef.ringe, data);
  return {pruef, export:data, teilen:{name:hinweise && hinweise.name || 'Raumskizze', data}, hinweise};
}
// Alte Pipeline zum Vergleich (5.1 Schritt 6): G.solveSweepAuto auf dem Pool der App, H wie die Karte.
export function altPipeline(G, A, H){
  if(A.art==='sitzung' || !A.P) return null;
  const pool=(A.P.obs||[]).filter(x=>!x.undone && x.suspect!==true && x.ra && x.rb).map(x=>({ra:x.ra, rb:x.rb, t:x.t}));
  const s=G.solveSweepAuto(pool, H ? {H} : {H0:2.55, Hsigma:0.35});
  return {n:pool.length, ecken:s.corners ? s.corners.length : 0, A:s.area ?? null, H:s.H, waende:s.walls ? s.walls.length : 0, corners:s.corners || null,
    export:s.corners ? G.toRoomData(s.corners, H ? Math.round(H*1000) : null) : null};
}
// Eingabe fuer T2 aus dem letzten Stand: Export, globale Waende, Ecken, Abschnitte, Hoehen und Beob (Strahlen im Bezug B_ab).
export function metrikEingabe(lauf){
  const S=lauf.letzte.stand, KZ=lauf.KZ;
  return {name:lauf.teilen ? lauf.teilen.name : null, data:lauf.export || undefined, waende:S.waende, ecken:S.ecken, abschnitte:S.abschnitte, hoehen:S.hoehen,
    beob:KZ.beob.filter(b=>b.c && b.da && b.db).map(b=>({ab:b.ab, t:b.t, c:b.c, da:b.da, db:b.db, L:b.L ?? -1, art:b.art}))};
}

// ------------------------------------------------ Ausgabe
export function bericht(lauf, m, alt, herkunft, quellen, pruef={}){
  const S=lauf.letzte.stand, K=lauf.runden.map(r=>r.kopf), L=[], ms=K.map(k=>k.ms.gesamt).filter(Number.isFinite);
  L.push(`Quelle ${lauf.quelleName} · ${lauf.posen.length} Posen, ${lauf.info.bilder} Bilder (fehlend ${lauf.info.bildFehlt}, weggelassen ${lauf.info.weg.bild}), ${lauf.erf.length} Erfassungen, ${lauf.info.ereignisse} Ereignisse, ${lauf.info.tiefe} Tiefe`);
  const SF=lauf.info.sichtfeld;
  if(SF) L.push(`Sichtfeld (12.7 (d)): Faktor ${SF.f} (wirksam ${SF.fEff.toFixed(3)}), Breite ${SF.w} -> ${SF.w2} px ab Spalte ${SF.x0}, horizontal ${SF.hfov[0].toFixed(1)}° -> ${SF.hfov[1].toFixed(1)}°`
    +` (proj[0] ${SF.proj0[0].toFixed(3)} -> ${SF.proj0[1].toFixed(3)}, Brennweite in px gleich)${SF.tiefeAus ? ', Tiefe erzwungen aus' : ''} · Erfassungen mit ndc ${SF.erfNdc}, davon ${SF.erfAussen} mit Enden`
    +` ausserhalb (${SF.erfEndenAussen} von ${SF.erfEnden} Enden |x'| > 1, `+(SF.erfSchnitt ? `beschnitten: drin/geschnitten/weg ${SF.erfSchnitt.drin}/${SF.erfSchnitt.geschnitten}/${SF.erfSchnitt.weg}` : 'bleiben drin')
    +`${SF.erfOhneNdc ? `; ${SF.erfOhneNdc} ohne ndc unveraendert` : ''}${lauf.KZ.opt.quelle==='segmente' ? '; Quelle segmente: nicht eingespeist' : ''})`
    +` · Segmente drin/geschnitten/weg ${SF.seg.drin}/${SF.seg.geschnitten}/${SF.seg.weg}${SF.seg.drin+SF.seg.geschnitten+SF.seg.weg ? '' : ' (Video: Kanten im Ausschnitt neu gesucht)'}`);
  L.push('Module: '+Object.entries(quellen).map(([k,v])=>`${k} ${v}${pruef[k] ? ' '+pruef[k] : ''}`).join(', '));
  const hk={}; for(const [n,v] of Object.entries(herkunft)) (hk[v]=hk[v]||[]).push(n);
  for(const [v,ns] of Object.entries(hk)) if(v!=='Modul') L.push(`  ${v}: ${ns.join(' ')}`);
  L.push(`Runden ${K.length}: ms Median ${f2(q(ms,0.5))}, p90 ${f2(q(ms,0.9))}, max ${f2(Math.max(...ms))} (Mac, nur gemessen) · Arbeit Summe iter ${K.reduce((s,k)=>s+k.arbeit.iter,0)}, relin ${K.reduce((s,k)=>s+k.arbeit.relin,0)}, reg ${K.reduce((s,k)=>s+k.arbeit.reg,0)} (${K.filter(k=>k.arbeit.reg>0).length} Runden), umriss ${K.reduce((s,k)=>s+k.arbeit.umriss,0)}, hyp ${K.reduce((s,k)=>s+k.arbeit.hyp,0)}, knoten ${K.reduce((s,k)=>s+k.arbeit.knoten,0)}, lm ${K.reduce((s,k)=>s+(k.arbeit.lm||0),0)}, lago ${K.filter(k=>k.lago).length}`);
  const fe=lauf.runden.filter(r=>r.stand.fehler); if(fe.length) L.push(`Runden mit fehler: ${fe.length} (erste ${fe[0].kopf.runde}: ${fe[0].stand.fehler})`);
  L.push(`Kern ${lauf.KZ.kern ?? '–'} · Abschnitte ${S.abschnitte.length}: `+S.abschnitte.map(a=>`${a.ab} ${f2(a.t0)}–${f2(a.t1)} ${a.stufe}${a.mitWand ? '' : ' (ohne Wand)'}`).join(' · '));
  const cls={}; for(const W of S.waende) cls[W.cls]=(cls[W.cls]||0)+1;
  L.push(`Wände global ${S.waende.length} (${Object.entries(cls).map(([k,v])=>`${k} ${v}`).join(', ')}), Ecken ${S.ecken.length}, Beob ${lauf.KZ.beob.length} (Schlüssel ${lauf.KZ.beob.filter(b=>b.schluessel).length})`);
  L.push(`Ringe ${S.ringe.length}: `+S.ringe.map(R=>`${R.art} ${R.pts.length} Ecken${R.exportiert===false ? ' (nicht exportiert, '+R.entscheid+')' : ''}`).join(' · ')+` · Hypothesen ${S.hypothesen.length}`);
  L.push(`Export: ${lauf.export ? lauf.export.pts.length+' Punkte, Name „'+lauf.teilen.name+'“' : 'keiner'} · Abschluss ${S.abschluss.bereit ? 'bereit' : 'nicht bereit: '+S.abschluss.fehlt.join(', ')}`);
  L.push('Hinweise: '+(S.hinweise.map(h=>h.code+(h.ab!=null ? ' '+h.ab : '')).join(', ') || 'keine'));
  if(alt) L.push(`Alt (G.solveSweepAuto, ${alt.n} Erfassungen): ${alt.ecken} Ecken, ${f2(alt.A)} m², H ${alt.H!=null ? alt.H.toFixed(3) : '–'}, ${alt.waende} Wände`);
  for(const w of lauf.info.warnungen) L.push('Warnung: '+w);
  if(m) L.push('T2:\n'+T2.bericht(m).split('\n').map(l=>'  '+l).join('\n'));
  return L.join('\n');
}
export function planSvg(lauf, m, wahrheit){
  const S=lauf.letzte.stand, T=m && m.passung ? m.passung.T : null, tf=p=>T ? T2.tf(p, T) : p, W=wahrheit && T ? T2.wahrheitLaden(wahrheit) : null;
  const pts=[]; S.ringe.forEach(R=>R.pts.forEach(p=>pts.push(tf(p)))); if(W) W.ringe.forEach(R=>R.pts.forEach(p=>pts.push(p)));
  const KZ=lauf.KZ, AB=new Map(S.abschnitte.map(a=>[a.ab, a])), weg=[];
  for(const p of lauf.posen){ if(!p.cam) continue; const ab=KZ.schnitte ? lauf.G.sectionOf(KZ.schnitte, p.t, p.ep) : 0, a=AB.get(ab); if(!a || !a.g) continue;
    const g=lauf.G.gBei(a, p.t), c=tf(lauf.G.gPlan(g, [p.cam[0], p.cam[2]])); weg.push({c, stufe:a.stufe}); pts.push(c); }
  if(!pts.length) return '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40"><text x="8" y="24">keine Karte</text></svg>';
  const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]), x0=Math.min(...xs)-0.5, x1=Math.max(...xs)+0.5, y0=Math.min(...ys)-0.5, y1=Math.max(...ys)+0.5;
  const B=900, sc=B/(x1-x0), H=Math.round((y1-y0)*sc), P=p=>`${((p[0]-x0)*sc).toFixed(1)},${((p[1]-y0)*sc).toFixed(1)}`;
  const farbe={verbunden:'#16a34a', locker:'#ca8a04', lose:'#dc2626', lokal:'#9ca3af'};
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${B}" height="${H+30}" style="background:#fff;font:11px sans-serif">`;
  if(W) for(const R of W.ringe) s+=`<polygon points="${R.pts.map(P).join(' ')}" fill="#f3f4f6" stroke="#9ca3af" stroke-width="3"/>`;
  for(let i=1;i<weg.length;i++) s+=`<line x1="${P(weg[i-1].c).split(',')[0]}" y1="${P(weg[i-1].c).split(',')[1]}" x2="${P(weg[i].c).split(',')[0]}" y2="${P(weg[i].c).split(',')[1]}" stroke="${farbe[weg[i].stufe]||'#999'}" stroke-width="1"/>`;
  for(const R of S.ringe) s+=`<polygon points="${R.pts.map(p=>P(tf(p))).join(' ')}" fill="none" stroke="${R.art==='aussen' ? '#111' : '#2563eb'}" stroke-width="2"${R.exportiert===false ? ' stroke-dasharray="6,3"' : ''}/>`;
  for(const b of S.hypothesen||[]) if(b.poly) s+=`<polygon points="${b.poly.map(p=>P(tf(p))).join(' ')}" fill="none" stroke="#7c3aed" stroke-dasharray="3,3"/>`;
  s+=`<text x="8" y="${H+20}">grau: Wahrheit${T ? ' (Passung T2)' : ''} · schwarz/blau: Ringe (gestrichelt: nicht exportiert) · Weg nach Stufe: grün verbunden, gelb locker, rot lose</text></svg>`;
  return s;
}

// ------------------------------------------------ Kommandozeile
const BOOL=new Set(['ohneH', 'orakel-rahmen', 'knoten', 'orakel-landmarken', 'runden-arbeit', 'mit-wahr', 'platzhalter-vor', 'bildkanten-sift']);
export function argumente(argv){
  const a={_:[]};
  for(let i=0;i<argv.length;i++){ const x=argv[i]; if(!x.startsWith('--')){ a._.push(x); continue; }
    const [k, v]=x.slice(2).split(/=(.*)/s); if(v!==undefined){ a[k]=v; continue; }
    if(BOOL.has(k) || i+1>=argv.length || argv[i+1].startsWith('--')){ a[k]=true; continue; } a[k]=argv[++i]; }
  return a;
}
export function optionenAus(a){
  const liste=v=>v==null || v===true ? [] : String(v).split(',').filter(Boolean), zahlen=v=>liste(v).map(Number).filter(Number.isFinite);
  const arbeit={...DEF.arbeit}; for(const kv of liste(a.arbeit)){ const [k,v]=kv.split('='); if(k && Number.isFinite(+v)) arbeit[k]=+v; }
  return {quelle:a.quelle || DEF.quelle, skala:a.skala || DEF.skala, reg:a.reg || DEF.reg, ohne:liste(a.ohne), segmente:a.segmente || DEF.segmente, inseln:a.inseln || DEF.inseln,
    takt:a.takt ? +a.takt : DEF.takt, arbeit, weglassen:a.weglassen ? +a.weglassen : 0, block:a.block ? +a.block : 0, seed:a.seed ? +a.seed : 1, ohneAb:zahlen(a.ohneAb),
    bis:a.bis ? +a.bis : Infinity, umriss:a.umriss || DEF.umriss, knoten:!!a.knoten, lago:a.lago || DEF.lago, pp:a.pp || DEF.pp, anker:a.anker || DEF.anker,
    orakelRahmen:!!a['orakel-rahmen'] || !!a['orakel-landmarken'], orakelLandmarken:!!a['orakel-landmarken'], erfassungen:a.erfassungen || DEF.erfassungen,
    metrik:a.metrik || DEF.metrik, spiegel:a.spiegel || DEF.spiegel, H:a.ohneH ? null : a.H!=null ? +a.H : undefined, uhr:a.uhr!=null ? +a.uhr : null,
    rundenArbeit:!!a['runden-arbeit'], mitWahr:!!a['mit-wahr'] || !!a['orakel-rahmen'] || !!a['orakel-landmarken'],
    sichtfeld:a.sichtfeld!=null ? +a.sichtfeld : DEF.sichtfeld, sichtfeldErf:a['sichtfeld-erf'] || DEF.sichtfeldErf,
    // --karte '{"abReg":{"gierRaster":true}}': Optionen fuer G.karteNeu (M10), z. B. fuer den Pruefstand
    ...(a.karte!=null && a.karte!==true ? {karte:JSON.parse(String(a.karte))} : {}),
    // --bildkanten kanten.json [--bildkanten-min 2] [--bildkanten-sift]: Relativlagen aus der Bild-Wiedererkennung (12.8) an M10 opt.kanten
    ...(a.bildkanten && a.bildkanten!==true ? {bildkanten:{datei:String(a.bildkanten), min:a['bildkanten-min'] ? +a['bildkanten-min'] : 2, sift:!!a['bildkanten-sift']}} : {})};
}
// Orakel (5.1): --orakel-rahmen setzt g je Abschnitt aus der Wahrheit (Sitzung: wahr.g zur Bildzeit) und legt
// F0 in den Rahmen der Wahrheit; --orakel-landmarken setzt zusaetzlich die Wahrheitswaende als feste Landmarken.
// Fuer Aufnahmen ohne Beilage: je Abschnitt (Brueche wie F2) eine Einzelpassung der gehobenen Erfassungen (T2);
// Abschnitte mit < 12 Erfassungen bleiben ohne Orakel. --spiegel ja passt gegen die gespiegelt geladene Wahrheit
// ohne Spiegel (g kann nicht spiegeln; frueher fiel T.m weg, die Relativlage war dann in der Gier um 2(r_a - r_b)
// falsch), F0 und --orakel-landmarken liegen dann im gespiegelten Rahmen. out.verh = Mehrdeutigkeit je Abschnitt.
// Vorsicht (12.8): Die Einzelpassungen sind in der Wohnkueche fast alle mehrdeutig (verh 1,00-1,14, Haelften desselben
// Abschnitts 88-179 Grad auseinander) und taugen nicht als Wahrheit fuer die Relativlage zweier Abschnitte.
export function orakelAus(G, A, o, wahrheit){
  const out={}, sp=o.spiegel==='ja';
  if(A.art==='sitzung'){ const gs=A.bilder.map(x=>({t:x.bildErg.t, g:x.wahr && x.wahr.g})).filter(x=>x.g);
    out.gAt=t=>{ let b=gs[0]; for(const x of gs){ if(x.t<=t) b=x; else break; } return b ? {...b.g} : null; }; }
  else { const posen=posenAus(G, A), erf=erfassungenAus(A, posen, o.erfassungen), H=Number.isFinite(o.H) ? o.H : A.hLaserMm ? A.hLaserMm/1000 : 2.416;
    const S=G.sessionCuts(posen, A.breaks, A.events, {}, null), ab=(t,e)=>G.sectionOf(S, t, e), W=T2.wahrheitLaden(wahrheit, {spiegel:sp}), proS=new Map();
    for(const e of erf){ const k=ab(e.t, e.ep); if(!proS.has(k)) proS.set(k, []); const h=(r,y)=>{ const t=(y-r.o[1])/r.d[1]; return t>0 && t<25 ? [r.o[0]+t*r.d[0], r.o[2]+t*r.d[2]] : null; };
      const a=h(e.ra, H), b=h(e.rb, H); if(a && b) proS.get(k).push([a, b]); }
    const tab={}, verh={}; for(const [k, segs] of proS){ if(segs.length<12) continue; const pts=segs.flatMap(s=>[s[0], s[1], [(s[0][0]+s[1][0])/2, (s[0][1]+s[1][1])/2]]);
      const pa=T2.passung(pts, segs, W, {spiegel:'nein'}); tab[k]={psi:pa.T.r, tx:pa.T.tx, ty:0, tz:pa.T.ty}; verh[k]=pa.verhaeltnis; }
    out.g=tab; out.verh=verh; }
  if(o.orakelLandmarken){ const W=T2.wahrheitLaden(wahrheit, {spiegel:sp}); out.waende=W.waende.map(w=>({id:'T:'+w.ids, phi:w.phi, rho:w.rho, iv:[{s0:w.s0, s1:w.s1, n:0, bilder:0, t0:0, t1:0, beidseits:false, ring:w.ring}]})); }
  return out;
}
async function main(){
  const a=argumente(process.argv.slice(2)), src=a._[0];
  if(!src){ console.error('Aufruf: node raumskizze-karte.mjs <aufnahme-ordner|.tar|sitzung.jsonl.gz> [--protokoll p.json] [--wahrheit w.json] [--H 2.416|--ohneH] [--quelle segmente|erfassungen|beide] [--platzhalter datei.mjs] [--aus ordner] ...'); process.exit(1); }
  const dateien=a.datei ? Object.fromEntries(String(a.datei).split(',').map(kv=>kv.split('=')).filter(x=>x.length===2)) : null;
  const o=optionenAus(a), {G, quellen, herkunft, pruef}=await ladeSeite({html:a.html, platzhalter:a.platzhalter, platzhalterOpt:{orakel:o.orakelRahmen},
    module:a.module ? String(a.module).split(',') : null, platzhalterVor:!!a['platzhalter-vor'], stand:a.stand || null, dateien});
  const A=ladeQuelle(resolve(src), {protokoll:a.protokoll ? resolve(a.protokoll) : null});
  const wahrheit=a.wahrheit ? resolve(a.wahrheit) : existsSync(WAHRHEIT) ? WAHRHEIT : null;
  if(o.orakelRahmen){ if(!wahrheit && A.art!=='sitzung') throw new Error('--orakel-rahmen braucht --wahrheit'); o.orakel=orakelAus(G, A, o, wahrheit); }
  if(a.runden===true){ if(!A.karte || !A.karte.length) throw new Error('--runden ohne Datei: die Aufnahme hat keine karte.jsonl (vor Stand 7)'); o.runden=A.karte.filter(z=>z.runde); }
  else if(a.runden) o.runden=zeilenJSON(readFileSync(resolve(a.runden))).filter(z=>z.runde);
  const tS=performance.now(), lauf=await laufen(G, A, o); lauf.quelleName=basename(src);
  const msLauf=performance.now()-tS, alt=A.art==='aufnahme' ? altPipeline(G, A, lauf.hLaser) : null;
  let m=null, msM=0;
  if(wahrheit && o.metrik!=='aus'){ const t=performance.now(), E=metrikEingabe(lauf); if(o.metrik==='export'){ delete E.beob; }
    m=T2.metrik(E, wahrheit, {hFest:lauf.hLaser || 2.416, wahrheitGespiegelt:o.spiegel==='ja' ? true : null}); msM=performance.now()-t; }
  const BM=lauf.KZ.lauf.marken.length ? bodenmarken(G, lauf, wahrheit ? JSON.parse(readFileSync(wahrheit, 'utf8')) : null, m && m.passung ? m.passung.T : null) : [];
  const txtBM=BM.length ? '\nBodenmarken (gefroren | ankerrelativ | Abstand zur Wahrheit): '+BM.map(b=>`${b.id} @${f2(b.t)} s Abschnitt ${b.ab}: ${b.gefroren ? b.gefroren.map(f2).join('/') : '–'} | ${b.rel ? b.rel.map(f2).join('/') : '–'} | ${cm(b.dGefroren)} / ${cm(b.dRel)} cm`).join(' · ') : '';
  const txt=bericht(lauf, m, alt, herkunft, quellen, pruef)+txtBM+`\nZeit: Lauf ${(msLauf/1000).toFixed(1)} s, T2 ${(msM/1000).toFixed(1)} s (Mac, Node ${process.version})`;
  console.log(txt);
  if(a.aus){ const d=resolve(a.aus); mkdirSync(d, {recursive:true});
    const karte=[], tStand={t:-Infinity};
    // wie die Seite (Stand 7): die letzte Runde ist die Schlussrunde und traegt schluss (Nachspiel mit --runden)
    for(const r of lauf.runden){ const letzte=r===lauf.runden[lauf.runden.length-1]; karte.push(JSON.stringify({runde:r.kopf, ...(letzte ? {schluss:true} : {})}));
      if(r.stand.t-tStand.t>=o.standJe || letzte){ tStand.t=r.stand.t; karte.push(JSON.stringify({stand:r.stand})); } }
    writeFileSync(join(d, 'karte.jsonl'), karte.join('\n')+'\n');
    writeFileSync(join(d, 'export.json'), JSON.stringify(lauf.teilen));
    writeFileSync(join(d, 'bericht.txt'), txt+'\n');
    writeFileSync(join(d, 'plan.svg'), planSvg(lauf, m, wahrheit));
    writeFileSync(join(d, 'ergebnis.json'), JSON.stringify({kopf:{werkzeug:'raumskizze-karte.mjs', version:VERSION, quelle:src, optionen:{...o, orakel:o.orakel ? Object.keys(o.orakel) : null, runden:o.runden ? o.runden.length : null},
      module:quellen, pruef, herkunft, node:process.version, sichtfeld:lauf.info.sichtfeld || {f:o.sichtfeld}}, runden:lauf.runden.map(r=>r.kopf), letzterStand:lauf.letzte.stand, export:lauf.export, teilen:lauf.teilen, hinweise:lauf.hinweise,
      pruef:lauf.pruef, alt, metrik:m, bodenmarken:BM, info:lauf.info, ms:{lauf:msLauf, metrik:msM}}, (k,v)=>v===Infinity ? 'Infinity' : v instanceof Float64Array || v instanceof Float32Array ? Array.from(v) : v));
    console.log(`Ausgabe: ${d}/{ergebnis.json, export.json, bericht.txt, plan.svg, karte.jsonl}`); }
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) main().catch(e=>{ console.error(e.stack || e.message); process.exit(1); });
