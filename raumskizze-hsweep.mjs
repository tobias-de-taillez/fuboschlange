// raumskizze-hsweep.mjs — AP5 (Konzepte P1/P4/P5/P6/P7, Stufe A): gemeinsamer H-Sweep. Je Aufnahme und Hoehe H ein Lauf von T1
// (raumskizze-karte.mjs mit --H) gegen die Wahrheit (T2). Ein Lauf beantwortet vier Fragen:
//   P1-H4  bestes H je Aufnahme; die Spiegelung muss ueber alle H gleich bleiben (sonst Lauf verworfen)
//   P7-H2/M3  IoU nach Nachskalierung (die Raumaufmass-App skaliert die Skizze um eine eingegebene Wandlaenge, scaleSketch)
//   P6-H1  Dosis-Wirkung: Eckenfehler gegen H, Lage des Minimums, Abstand zur Laserhoehe
//   P4-H2  Kippquote der alten Auswertung (G.solveSweepAuto) bei festem H
// und fuehrt zu Entscheid E1 (H fest je Sitzung oder y-Zustand je Abschnitt).
//
//   node raumskizze-hsweep.mjs --aufnahme name=aufnahme.tar,protokoll.json,wahrheit.json[,laserhoehe_m] [--aufnahme ...] --aus ordner
//        [--von 2.30 --bis 2.90 --schritt 0.05] [--jobs 4] [--quelle erfassungen] [--ohne tiefe,ebenen] [--karte '{"schnitt":{...}}']
//        [--wand Q-R] [--kipp 40] [--kipp-anteil 0.05] [--zeitgrenze 1800] [--weiter] [--nur-tabelle] [--still]
//   node raumskizze-hsweep.mjs --lauf auftrag.json      (ein Lauf; so startet das Werkzeug seine Kindprozesse)
//   import {hGitter, wandKandidaten, nachFaktor, kippquote, auswerten, e1Aussage, ...} from './raumskizze-hsweep.mjs'
//
// Ergebnis im --aus-Ordner: hsweep.md und hsweep.json, je Lauf laeufe/<name>-H<h>/{kennzahlen.json, bericht.txt, export.json, log.txt}.
// Struktur der Prozesse wie raumskizze-ablation.mjs (ein Node-Prozess je Lauf, --jobs parallel, Zeitgrenze mit SIGKILL).
//
// Nachskalierung (wie scaleSketch in raumaufmass.html: f = gemessene Strecke / Skizzenstrecke, alle Punkte mal f): eine Wand der
// Wahrheit, deren beide Ecken in der Zuordnung von T2 stehen und im Export genau eine Skizzenkante sind. Vorgabe: die laengste
// solche Wand (--wand Q-R erzwingt eine). Zusaetzlich der Median der Faktoren aller solchen Waende als obere Schranke. Die IoU
// nach Skalierung kommt aus einer Passung nur des Exports (T2 ohne Beob); die Vergleichsgroesse ist dieselbe Passung ohne
// Skalierung (iouExport), nicht die IoU des Hauptlaufs (der passt ueber die Beob).
// Hebel: delta = H - Href (Href = Laserhoehe, sonst bestes H), Delta = Href - Kamerahoehe (Median der Strahlursprung-y);
// E1 wertet den IoU-Verlust nur fuer |delta|/Delta <= 0,3.
// Bestes H (Kriterien): beob = kleinster Beob-Median (P7), iou = groesste IoU, ecken = kleinster Eckenfehler-Median (P6, nur mit
// genug zugeordneten Ecken), verb = meiste verbundene Abschnitte mit Wand (P1), nach = groesste IoU nach Nachskalierung. Nur
// Laeufe mit eindeutiger Passung (Mehrdeutigkeit >= 1,2, gueltiger Massstab) und der haeufigsten Spiegelung zaehlen; gleichwertige
// H (Gleichstand) ergeben deren Median.
import {readFileSync, writeFileSync, existsSync, mkdirSync, openSync, closeSync, rmSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {availableParallelism} from 'node:os';
import {resolve, join, basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as T1 from './raumskizze-karte.mjs';
import * as T2 from './raumskizze-metrik.mjs';

export const VERSION=1;
export const DEF={von:2.30, bis:2.90, schritt:0.05, quelle:'erfassungen', ohne:['tiefe', 'ebenen'], wand:null, kipp:40, kippAnteil:0.05, kippBlock:3,
  karte:'{"schnitt":{"gyroBruecke":true,"vorhersage":"gedaempft"}}', jobs:Math.max(1, Math.min(4, Math.floor(availableParallelism()/2))), zeitgrenze:1800,
  // E1 (Konzepte, Abschnitt 4): Streuung des besten H <= +-0,15 m, IoU-Verlust <= 0,05 bei |delta|/Delta <= 0,3; M3 verlangt >= 3 Raeume
  e1:{streuung:0.15, verlust:0.05, hebel:0.3, raeume:3, mindestPunkte:3, lageGrad:20, lageM:0.75}};
const f1=x=>Number.isFinite(x) ? x.toFixed(1) : '–', f2=x=>Number.isFinite(x) ? x.toFixed(2) : x===Infinity ? '∞' : '–', f3=x=>Number.isFinite(x) ? x.toFixed(3) : '–';
const cm=x=>Number.isFinite(x) ? (100*x).toFixed(1) : '–', pct=x=>Number.isFinite(x) ? (100*x).toFixed(0)+' %' : '–';
export const schreibeJson=(datei, x)=>writeFileSync(datei, JSON.stringify(x, (k,v)=>v===Infinity ? 'Infinity' : v===-Infinity ? '-Infinity' : v, 1));
export const leseJson=datei=>JSON.parse(readFileSync(datei, 'utf8'), (k,v)=>v==='Infinity' ? Infinity : v==='-Infinity' ? -Infinity : v);
export const hKey=h=>'H'+h.toFixed(3).replace('.', '_');
const wrap=x=>{ x%=2*Math.PI; return x>Math.PI ? x-2*Math.PI : x<-Math.PI ? x+2*Math.PI : x; };
const median=a=>{ const s=a.filter(Number.isFinite).sort((p,q)=>p-q); return s.length ? (s.length%2 ? s[s.length>>1] : (s[s.length/2-1]+s[s.length/2])/2) : null; };

// Gitter von..bis in Schritten; auf 1 mm gerundet (sonst steht 2.4500000000000002 in den Dateinamen)
export function hGitter(von, bis, schritt){
  if(!(schritt>0) || !(bis>=von)) throw new Error(`H-Gitter: von ${von}, bis ${bis}, schritt ${schritt}`);
  const n=Math.floor((bis-von)/schritt+1e-9); return Array.from({length:n+1}, (_, i)=>Math.round((von+i*schritt)*1000)/1000);
}

// ------------------------------------------------ Nachskalierung
// W: {ids, pts} Aussenring der Wahrheit (m), E: {ids, pts} Ring des Exports (m, wie exportiert), T: Lage der Passung (T2-Form), vor:
// Vorfaktor, mit dem der Export zur Passung vorskaliert wurde. Kandidat = Wahrheitswand, der genau eine Skizzenkante entspricht:
// nach vor und T parallel (<= o.winkel Grad), Laenge zwischen o.lMin und o.lMax mal der Wandlaenge und beide Enden im Mittel
// <= o.ende m von den Wandenden (eine Teilkante, etwa weil nur ein Stueck der Wand gesehen wurde, oder eine Wand mit Zusatzecke
// ist keine eingegebene Wandlaenge). Die Zuordnung der Ecken durch T2 (15 cm) taugt dafuer nicht: sie bricht schon bei wenigen
// Prozent Massstabsfehler ein.
export function wandKandidaten(W, E, T, vor=1, o={}){
  o={winkel:10, ende:0.25, lMin:0.8, lMax:1.25, ...o};
  const nW=W.ids.length, nE=E.ids.length, out=[]; if(nW<3 || nE<3) return out;
  const P=E.pts.map(p=>T2.tf([p[0]*vor, p[1]*vor], T)), cosW=Math.cos(o.winkel*Math.PI/180), dist=(p, q)=>Math.hypot(p[0]-q[0], p[1]-q[1]);
  for(let i=0;i<nW;i++){ const a=W.pts[i], b=W.pts[(i+1)%nW], lW=dist(a, b); if(!(lW>0.2)) continue;
    const u=[(b[0]-a[0])/lW, (b[1]-a[1])/lW]; let best=null;
    for(let j=0;j<nE;j++){ const c=P[j], d=P[(j+1)%nE], lP=dist(c, d); if(!(lP>1e-9) || lP<o.lMin*lW || lP>o.lMax*lW) continue;
      if(Math.abs((d[0]-c[0])*u[0]+(d[1]-c[1])*u[1])/lP<cosW) continue;
      const de=Math.min(dist(c, a)+dist(d, b), dist(c, b)+dist(d, a))/2;
      if(de<=o.ende && (!best || de<best.de)) best={j, de}; }
    if(!best) continue;
    const lE=dist(E.pts[best.j], E.pts[(best.j+1)%nE]);
    out.push({wand:W.ids[i]+'-'+W.ids[(i+1)%nW], exp:E.ids[best.j]+'-'+E.ids[(best.j+1)%nE], lWahr:lW, lExp:lE, f:lW/lE, abstand:best.de}); }
  return out;
}
// Faktor der Nachskalierung: wand = null -> laengste Wahrheitswand unter den Kandidaten, 'Q-R' (auch 'R-Q') -> genau diese
export function nachFaktor(kand, wand=null){
  if(!kand.length) return {fWand:null, wand:null, fMedian:null, n:0};
  const k=wand ? kand.find(x=>x.wand===wand || x.wand===wand.split('-').reverse().join('-')) : kand.reduce((b, x)=>x.lWahr>b.lWahr ? x : b);
  return {fWand:k ? k.f : null, wand:k ? k.wand : null, lWahr:k ? k.lWahr : null, lExp:k ? k.lExp : null, fMedian:median(kand.map(x=>x.f)), n:kand.length};
}
// Export (RoomData in mm) um f skalieren, wie scaleSketch: alle Punkte mal f
export const skaliereExport=(data, f)=>({...data, pts:data.pts.map(p=>({...p, x:p.x*f, y:p.y*f}))});

// ------------------------------------------------ Kippquote der alten Auswertung (P4-H2)
const flaecheAbs=P=>{ let a=0; for(let i=0,j=P.length-1;i<P.length;j=i++) a+=P[j][0]*P[i][1]-P[i][0]*P[j][1]; return Math.abs(a/2); };
// Ergebnis von G.solveSweepAuto auf n und Flaeche der Ecken; null, wenn es keine Ecken gibt
export function signatur(s){ if(!s || !s.corners || s.corners.length<3) return null;
  const P=s.corners.map(c=>Array.isArray(c) ? c : [c.x ?? c[0], c.y ?? c[1]]); return {n:P.length, A:flaecheAbs(P), H:Number.isFinite(s.H) ? s.H : null}; }
// K1 (Konzepte P4 1.2): gleiche Eckenzahl und Flaeche +-5 % gegenueber der Vollauswertung
export const gleichK1=(s, s0, tol=0.05)=>!!(s && s0 && s.n===s0.n && Math.abs(s.A-s0.A)<=tol*s0.A);
const lcg=seed=>{ let x=seed>>>0; return ()=>{ x=(Math.imul(x, 1664525)+1013904223)>>>0; return x/4294967296; }; };
const hist=a=>{ const h={}; for(const x of a) h[x]=(h[x]||0)+1; return Object.entries(h).sort((p, q)=>p[0]-q[0]).map(([k, v])=>k+'x'+v).join(' '); };
// Alte Auswertung wie altPipeline mit festem H und Rueckkehrrunde wie in p4_kipp; rechne(obs) -> Signatur
export function kippquote(G, pool, H, o={}){
  o={n:DEF.kipp, anteil:DEF.kippAnteil, block:DEF.kippBlock, seed:12345, ...o};
  // H = null: freie Hoehe mit Vorwissen 2,55 +- 0,35 wie die App ohne Laser (p4_kipp: Rueckkehr mit 2,55)
  const basis=H==null ? {H0:2.55, Hsigma:0.35} : {H}, rechne=obs=>{ if(obs.length<3) return null; try{ let lap=null; try{ lap=G.rueckkehr(obs, H ?? 2.55); }catch(e){}
    return signatur(G.solveSweepAuto(obs, lap ? {...basis, runde:{t:lap.t-0.01}} : basis)); }catch(e){ return null; } };
  const s0=rechne(pool); if(!s0 || !pool.length) return {voll:null, zuf:null, block:null};
  const stat=runs=>({N:runs.length, k1:runs.filter(s=>gleichK1(s, s0)).length, ecken:hist(runs.map(s=>s ? s.n : 0))});
  const rnd=lcg(o.seed), Z=[]; for(let d=0;d<o.n;d++) Z.push(rechne(pool.filter(()=>rnd()>=o.anteil)));
  // Block: ein Fenster der Laenge o.block s faellt weg, Schritt 1 s (p4_kipp: b von t0 bis t1 - w/2)
  const t0=Math.min(...pool.map(x=>x.t)), t1=Math.max(...pool.map(x=>x.t)), B=[];
  for(let b=t0;b<t1-o.block*0.5;b+=1) B.push(rechne(pool.filter(x=>!(x.t>=b && x.t<b+o.block))));
  return {voll:s0, zuf:stat(Z), block:stat(B)};
}

// ------------------------------------------------ ein Lauf (Kindprozess)
export function t1Argv(a){
  return [a.src, ...(a.protokoll ? ['--protokoll', a.protokoll] : []), ...(a.wahrheit ? ['--wahrheit', a.wahrheit] : []), '--H', String(a.H), '--quelle', a.quelle,
    ...(a.ohne && a.ohne.length ? ['--ohne', a.ohne.join(',')] : []), ...(a.karte ? ['--karte', a.karte] : [])];
}
const ringVon=(data)=>{ const E=T2.eingabeAus({data}); return E.ringe; };
// Schwerpunkt des Exportrings im Rahmen der Wahrheit (Lage der Passung): trennt verschobene Nebenlagen, die dieselbe Drehung haben
const zentrumVon=(data, T)=>{ const R=data ? ringVon(data) : []; return R.length && T ? T2.tf(T2.schwerpunkt(R[0].pts), T) : null; };
// Kennzahlen aus T2-Ergebnis m und Lauf (ohne Nachskalierung und Kippquote)
export function kennzahlen(lauf, m){
  const S=lauf.letzte.stand, a=m && !m.fehler && m.aussen && !m.aussen.fehlt ? m.aussen : null, p=m && m.passung ? m.passung : null;
  const gu=!!(p && p.verhaeltnis!=null && p.verhaeltnis>=1.2 && p.skala!=null), ab=S.abschnitte, g=m && m.beob && m.beob.gehoben && m.beob.gehoben.alle ? m.beob.gehoben.alle : null;
  return {iou:a ? a.iou : null, eMed:a ? a.eMed : null, eP90:a ? a.eP90 : null, flaeche:a ? a.A : null, flaecheWahr:a ? a.AT : null, nExp:a ? a.n : (lauf.export ? lauf.export.pts.length : 0),
    nT:a ? a.nT : null, nZu:a ? a.zugeordnet.length : null, beobMed:g ? g.med : null, mehr:p ? p.verhaeltnis ?? null : null, gueltig:gu, gespiegelt:p ? !!p.gespiegelt : null, rot:p && p.T ? p.T.r : null, zentrum:zentrumVon(lauf.export, p && p.T),
    spiegelVh:p ? p.spiegelVerhaeltnis ?? null : null, abschnitte:ab.length, verbunden:ab.filter(x=>x.stufe==='verbunden').length, verbMitWand:ab.filter(x=>x.stufe==='verbunden' && x.mitWand).length,
    waendeGef:m && m.waende ? m.waende.gefunden : null, waendeWahr:m && m.waende ? m.waende.nWahr : null, export:!!lauf.export, hLaser:lauf.hLaser ?? null,
    hC:S.hoehen ? S.hoehen.hC ?? null : null, metrikFehler:m && m.fehler ? m.fehler : null};
}
// Nachskalierung eines Exports (RoomData in mm) gegen die Wahrheit. Die Wand wird an der Lage eines vorskalierten Exports gesucht
// (Vorfaktor = freier ICP-Massstab der Hauptpassung, nur fuer die Zuordnung); der Faktor selbst kommt aus der Laenge der
// Skizzenkante im echten Export: f = Wandlaenge / Kantenlaenge. Die IoU nach Skalierung kommt aus einer
// Passung nur des Exports; eins = derselbe Weg ohne Skalierung (Vergleich), rot = Drehung der Lage (Lagepruefung in auswerten).
export function nachLauf(data, m, wahrheit, opt, wand=null){
  const W=T2.wahrheitLaden(wahrheit, {spiegel:false}), sRoh=m && m.passung ? m.passung.skalaRoh : null, vor=Number.isFinite(sRoh) && sRoh>0.5 && sRoh<2 ? sRoh : 1;
  const messen=f=>{ const mm=T2.metrik({name:'nach', data:f===1 ? data : skaliereExport(data, f)}, wahrheit, opt); return mm && !mm.fehler && mm.aussen && !mm.aussen.fehlt ? mm : null; };
  const mp=vor===1 ? (m && !m.fehler && m.aussen && !m.aussen.fehlt ? m : null) : messen(vor);
  const Er=mp ? ringVon(data)[0] : null, kand=Er && mp.passung.T ? wandKandidaten(W.ringe[0], Er, mp.passung.T, vor) : [], nf=nachFaktor(kand, wand);
  const mit=f=>{ if(!(f>0)) return null; const mm=messen(f); return mm ? {iou:mm.aussen.iou, eMed:mm.aussen.eMed, nZu:mm.aussen.zugeordnet.length, flaeche:mm.aussen.A, mehr:mm.passung.verhaeltnis ?? null,
    gespiegelt:!!mm.passung.gespiegelt, rot:mm.passung.T.r, zentrum:zentrumVon(f===1 ? data : skaliereExport(data, f), mm.passung.T)} : null; };
  return {...nf, vorskala:vor, kandidaten:kand, eins:mit(1), skaliert:mit(nf.fWand), median:mit(nf.fMedian)};
}
// auftrag: {id, aufnahme, src, protokoll, wahrheit, H, quelle, ohne, karte, wand, kipp, kippAnteil, kippBlock, dir}
export async function einzelLauf(auftrag){
  const t0=performance.now(), d=resolve(auftrag.dir); mkdirSync(d, {recursive:true});
  const argv=t1Argv(auftrag), kopf={id:auftrag.id, aufnahme:auftrag.aufnahme, H:auftrag.H, version:VERSION, wahrheit:auftrag.wahrheit || null, argv, wand:auftrag.wand || null,
    kippOpt:[auftrag.kipp, auftrag.kippAnteil, auftrag.kippBlock, !!auftrag.kippVergleich]};
  try{
    const a=T1.argumente(argv), o=T1.optionenAus(a), {G, quellen, herkunft, pruef}=await T1.ladeSeite({});
    const A=T1.ladeQuelle(resolve(auftrag.src), {protokoll:auftrag.protokoll ? resolve(auftrag.protokoll) : null}), wahrheit=auftrag.wahrheit ? resolve(auftrag.wahrheit) : null;
    const tL=performance.now(), lauf=await T1.laufen(G, A, o), msLauf=performance.now()-tL; lauf.quelleName=basename(auftrag.src);
    const tM=performance.now(), opt={hFest:lauf.hLaser || 2.416, wahrheitGespiegelt:null};
    const m=wahrheit ? T2.metrik(T1.metrikEingabe(lauf), wahrheit, opt) : null, k=kennzahlen(lauf, m);
    // Kamerahoehe und Pool der alten Auswertung
    const pool=((A.P && A.P.obs) || []).filter(x=>!x.undone && x.suspect!==true && x.ra && x.rb).map(x=>({ra:x.ra, rb:x.rb, t:x.t}));
    k.kameraMed=median(pool.map(x=>x.ra.o && x.ra.o[1])); k.hLaserProtokoll=A.hLaserMm ? A.hLaserMm/1000 : null; k.nPool=pool.length;
    // Nachskalierung; die Passung der skalierten Variante nur ueber den Export (iouExport = Faktor 1 als Vergleich)
    const nach=wahrheit && lauf.export ? nachLauf(lauf.export, m, wahrheit, opt, auftrag.wand) : null;
    const tK=performance.now(), ko={n:auftrag.kipp, anteil:auftrag.kippAnteil, block:auftrag.kippBlock}, kipp=auftrag.kipp>0 && pool.length ? kippquote(G, pool, auftrag.H, ko) : null;
    // Vergleich zu festem H (P4-H2: hebt festes H die Quote?): freie Hoehe, und H auf den eigenen Schaetzwert festgehalten; gleicher Samen
    let kippVergleich=null;
    if(auftrag.kippVergleich && kipp){ const frei=kippquote(G, pool, null, ko), hEigen=frei.voll ? frei.voll.H : null;
      kippVergleich={frei, hEigen, eigen:Number.isFinite(hEigen) ? kippquote(G, pool, hEigen, ko) : null}; }
    const msK=performance.now()-tK, msM=tK-tM;
    writeFileSync(join(d, 'bericht.txt'), T1.bericht(lauf, m, null, herkunft, quellen, pruef)+`\nZeit: Lauf ${(msLauf/1000).toFixed(1)} s, T2+Nachskalierung ${(msM/1000).toFixed(1)} s, Kipp ${(msK/1000).toFixed(1)} s (Node ${process.version})\n`);
    writeFileSync(join(d, 'export.json'), JSON.stringify(lauf.teilen));
    const z={...kopf, k, nach, kipp, kippVergleich, ms:{lauf:msLauf, metrik:msM, kipp:msK, gesamt:performance.now()-t0}, fehler:null};
    schreibeJson(join(d, 'kennzahlen.json'), z); return z;
  }catch(e){ const z={...kopf, k:null, nach:null, kipp:null, kippVergleich:null, ms:{gesamt:performance.now()-t0}, fehler:e.stack || String(e)}; schreibeJson(join(d, 'kennzahlen.json'), z); return z; }
}

// ------------------------------------------------ Auswertung
// zeilen: Ergebnisse von einzelLauf (mit .aufnahme, .H, .k, .nach, .kipp). Je Aufnahme eine Zusammenfassung.
const gut=z=>!!(z.k && !z.fehler && z.k.gueltig);
const argExtrem=(Z, wert, richtung)=>{ // Median der H mit dem besten Wert (Gleichstand 1e-9); null ohne Werte
  const P=Z.map(z=>[z.H, wert(z)]).filter(p=>Number.isFinite(p[1])); if(!P.length) return null;
  const b=richtung>0 ? Math.max(...P.map(p=>p[1])) : Math.min(...P.map(p=>p[1])); return median(P.filter(p=>Math.abs(p[1]-b)<=1e-9).map(p=>p[0])); };
export const KRITERIEN=[['beob', 'Beob-Median min', z=>z.k.beobMed, -1], ['iou', 'IoU max', z=>z.k.iou, 1],
  ['ecken', 'Eckenfehler-Median min', null, -1], ['verb', 'verbunden mit Wand max', z=>z.k.verbMitWand+1e-3*(z.k.nZu ?? 0), 1],
  ['nach', 'IoU nach Nachskalierung max', z=>z.nach && z.nach.skaliert ? z.nach.skaliert.iou : null, 1]];
export function auswerten(zeilen, laser={}, o=DEF){
  const namen=[...new Set(zeilen.map(z=>z.aufnahme))], out=[];
  for(const name of namen){
    const Z=zeilen.filter(z=>z.aufnahme===name).sort((a, b)=>a.H-b.H), ok=Z.filter(gut);
    // haeufigste Spiegelung unter den eindeutigen Laeufen; abweichende werden verworfen (P1-H4)
    const cnt=new Map(); for(const z of ok) cnt.set(z.k.gespiegelt, (cnt.get(z.k.gespiegelt)||0)+1);
    const modal=[...cnt].sort((a, b)=>b[1]-a[1])[0]?.[0] ?? null, zul=ok.filter(z=>z.k.gespiegelt===modal), abw=ok.filter(z=>z.k.gespiegelt!==modal).map(z=>z.H);
    // Stufe 1 (Konvention der Konzepte): nur eindeutige Laeufe. Stufe 2: dazu mehrdeutige Laeufe, die in derselben Lage landen
    // (gleiche Spiegelung, Drehung innerhalb o.e1.lageGrad der Lage des besten H aus Stufe 1) - bei falschem H wird die
    // Passung mehrdeutig, ohne dass sie in eine andere Lage kippen muss.
    const bestVon=Q=>{ const zuMax=Math.max(0, ...Q.map(z=>z.k.nZu ?? 0)), b={};
      for(const [key, , wert, dir] of KRITERIEN)
        b[key]=key==='ecken' ? argExtrem(Q.filter(z=>(z.k.nZu ?? 0)>=Math.max(3, 0.5*zuMax)), z=>z.k.eMed, dir) : argExtrem(Q, wert, dir);
      return b; };
    const best1=bestVon(zul), h1=best1.beob ?? best1.iou, z1=Number.isFinite(h1) ? zul.reduce((b, z)=>Math.abs(z.H-h1)<Math.abs(b.H-h1) ? z : b, zul[0]) : null, rRef=z1 ? z1.k.rot : null;
    const zRefZ=z1 ? z1.k.zentrum : null, lageOk=x=>x && x.gespiegelt===modal && Number.isFinite(rRef) && Number.isFinite(x.rot) && Math.abs(wrap(x.rot-rRef))<=o.e1.lageGrad*Math.PI/180
      && !!zRefZ && !!x.zentrum && Math.hypot(x.zentrum[0]-zRefZ[0], x.zentrum[1]-zRefZ[1])<=o.e1.lageM;
    const zul2=Z.filter(z=>z.k && !z.fehler && lageOk(z.k)), best=zul2.length>=o.e1.mindestPunkte ? bestVon(zul2) : best1;
    const hKopf=best.beob ?? best.iou, werte=Object.values(best).filter(Number.isFinite), streuung=werte.length && zul2.length>=o.e1.mindestPunkte ? (Math.max(...werte)-Math.min(...werte))/2 : null;
    const lz=laser[name] ?? Z.map(z=>z.k && z.k.hLaserProtokoll).find(Number.isFinite) ?? null, Href=lz ?? hKopf;
    const cam=median(Z.map(z=>z.k && z.k.kameraMed)), Delta=Number.isFinite(Href) && Number.isFinite(cam) ? Href-cam : null;
    // IoU-Verlust nach Nachskalierung gegen den Gitterpunkt nahe Href. Die Passung nur des Exports kann bei falschem H in einer
    // anderen Lage landen; sie zaehlt nur mit gleicher Spiegelung und Drehung innerhalb o.e1.lageGrad der Lage des besten H.
    const nachIou=z=>z.nach && lageOk(z.nach.skaliert) && z.nach.skaliert.mehr>=1.2 ? z.nach.skaliert.iou : null, nachIouOhne=z=>z.nach && lageOk(z.nach.eins) ? z.nach.eins.iou : null;
    const mitIou=Z.filter(z=>Number.isFinite(nachIou(z))), refZ=Number.isFinite(Href) && mitIou.length ? mitIou.reduce((b, z)=>Math.abs(z.H-Href)<Math.abs(b.H-Href) ? z : b) : null, ref=refZ ? nachIou(refZ) : null;
    const verlust=Z.map(z=>{ const rel=Number.isFinite(Delta) ? (z.H-Href)/Delta : null, i=nachIou(z);
      return {H:z.H, rel, iouNach:i, iouOhne:nachIouOhne(z), verlust:Number.isFinite(ref) && Number.isFinite(i) ? ref-i : null, imFenster:Number.isFinite(rel) && Math.abs(rel)<=o.e1.hebel+1e-9}; });
    const fv=verlust.filter(v=>v.imFenster && Number.isFinite(v.verlust)), maxVerlust=fv.length ? Math.max(...fv.map(v=>v.verlust)) : null;
    out.push({name, nLaeufe:Z.length, nFehler:Z.filter(z=>z.fehler).length, nEindeutig:ok.length, nVerworfen:ok.length-zul.length, nLage:zul2.length, rRef, spiegelModal:modal, spiegelKonstant:abw.length===0 && ok.length>0, spiegelAbweichend:abw,
      best, hKopf, streuung, laser:lz, Href, kamera:cam, Delta, refH:refZ ? refZ.H : null, refIouNach:ref, verlust, maxVerlust, nFenster:fv.length,
      dHLaser:Number.isFinite(lz) && Number.isFinite(hKopf) ? hKopf-lz : null}); }
  return out;
}
// E1 (Konzepte 4, Entscheidungspunkte): Streuung des besten H <= +-0,15 m und IoU-Verlust <= 0,05 bei |delta|/Delta <= 0,3.
// Streuung: je Aufnahme die halbe Spanne der besten H ueber die Kriterien, und |bestes H - Laserhoehe| wo bekannt.
export function e1Aussage(S, o=DEF){
  const e=o.e1, zeilen=[];
  // je Aufnahme drei Zustaende: ok, verfehlt, unbelegt (zu wenige Gitterpunkte mit eindeutiger Passung bzw. Lage)
  for(const s of S){ const abstand=Number.isFinite(s.dHLaser) ? Math.abs(s.dHLaser) : null;
    const str=abstand!=null && abstand>e.streuung || s.streuung!=null && s.streuung>e.streuung ? 'verfehlt' : s.streuung==null ? 'unbelegt' : 'ok';
    const ver=s.maxVerlust!=null && s.nFenster>=e.mindestPunkte ? (s.maxVerlust<=e.verlust ? 'ok' : 'verfehlt') : s.maxVerlust!=null && s.maxVerlust>e.verlust ? 'verfehlt' : 'unbelegt';
    const spg=s.nEindeutig===0 ? 'unbelegt' : s.spiegelKonstant ? 'ok' : 'verfehlt', st=[str, ver, spg], status=st.includes('verfehlt') ? 'verfehlt' : st.every(x=>x==='ok') ? 'ok' : 'unbelegt';
    zeilen.push({name:s.name, streuung:s.streuung, abstandLaser:abstand, maxVerlust:s.maxVerlust, nFenster:s.nFenster, nEindeutig:s.nEindeutig, nLage:s.nLage, okStreuung:str, okVerlust:ver, spiegel:spg, status}); }
  const nOk=zeilen.filter(z=>z.status==='ok').length, nV=zeilen.filter(z=>z.status==='verfehlt').length, nU=zeilen.filter(z=>z.status==='unbelegt').length, genug=nOk>=e.raeume;
  let urteil;
  if(nV) urteil=`y-Zustand je Abschnitt vorziehen (AP14): ${zeilen.filter(z=>z.status==='verfehlt').map(z=>z.name).join(', ')} verfehlt Streuung, IoU-Verlust oder Spiegelkonstanz`;
  else if(!nOk) urteil=`nicht entscheidbar: ${nU} von ${zeilen.length} Aufnahmen ohne genug eindeutige Läufe (je mindestens ${e.mindestPunkte} nötig)`;
  else urteil=genug ? 'H fest je Sitzung bleibt Hauptweg (AP8)' : `H fest je Sitzung, nur vorläufig: ${nOk} Aufnahme${nOk>1 ? 'n erfüllen' : ' erfüllt'} beide Kriterien, M3 verlangt ≥ ${e.raeume} Räume${nU ? `; ${nU} nicht auswertbar` : ''}`;
  return {urteil, zeilen, genug, nOk, nVerfehlt:nV, nUnbelegt:nU};
}

// ------------------------------------------------ Tabelle
const zl=c=>'| '+c.join(' | ')+' |';
export function tabelleMd(zeilen, S, E, kopf={}){
  const L=['# H-Sweep (AP5, Entscheid E1)', ''];
  if(kopf.text) L.push(kopf.text, '');
  for(const s of S){
    const Z=zeilen.filter(z=>z.aufnahme===s.name).sort((a, b)=>a.H-b.H), v=new Map(s.verlust.map(x=>[x.H, x]));
    L.push(`## ${s.name}`, '', `Laserhöhe ${s.laser!=null ? f3(s.laser)+' m' : 'unbekannt'}, Kamerahöhe (Median Strahlursprung) ${f2(s.kamera)} m, Δ = Href − Kamera = ${f2(s.Delta)} m (Href = ${s.laser!=null ? 'Laser' : 'bestes H nach Beob-Median'} ${f3(s.Href)} m).`,
      `Eindeutig (Mehrd. ≥ 1,2): ${s.nEindeutig} von ${s.nLaeufe} Läufen${s.nFehler ? `, ${s.nFehler} Fehler` : ''}; in derselben Lage wie das eindeutige beste H (Spiegelung gleich, Drehung ≤ 20°, Schwerpunkt ≤ 0,75 m): ${s.nLage}. Spiegelung: ${s.spiegelModal==null ? '–' : s.spiegelModal ? 'gespiegelt' : 'nicht gespiegelt'}${s.spiegelKonstant ? ', bleibt über alle eindeutigen H gleich' : s.nEindeutig ? `, WECHSELT bei H = ${s.spiegelAbweichend.join(', ')} (diese Läufe verworfen)` : ''}.`, '');
    const K=['H m', 'Mehrd.', 'gesp.', 'Fläche m²', 'Ecken zu/Soll', 'IoU', 'Ecken Med cm', 'p90 cm', 'Beob Med cm', 'verb. mit Wand', 'Wände gef.', 'IoU Export', 'Faktor Wand', 'IoU nach (Wand)', 'Mehrd. nach', 'IoU nach (Median)',
      'δ/Δ', 'Verlust nach', 'Kipp zuf %', 'Kipp Block %', 'Lauf s', 'Fehler'];
    L.push(zl(K), '|'+'---|'.repeat(K.length));
    for(const z of Z){ const k=z.k, n=z.nach, x=v.get(z.H);
      if(!k || z.fehler){ L.push(zl([f2(z.H), ...Array(K.length-3).fill(''), f1((z.ms.gesamt||0)/1000), String(z.fehler || 'keine Kennzahlen').split('\n')[0].replace(/\|/g, '/').slice(0, 120)])); continue; }
      const kl=t=>k.gueltig ? t : '('+t+')', kp=q=>q && q.N ? (100*q.k1/q.N).toFixed(0) : '–';
      L.push(zl([f2(z.H), f2(k.mehr), k.gespiegelt==null ? '–' : k.gespiegelt ? 'ja' : 'nein', f1(k.flaeche), k.nZu!=null ? `${k.nZu}/${k.nT}` : '–', kl(f2(k.iou)), kl(cm(k.eMed)), kl(cm(k.eP90)), kl(cm(k.beobMed)),
        `${k.verbMitWand}/${k.abschnitte}`, k.waendeGef!=null ? `${k.waendeGef}/${k.waendeWahr}` : '–', n && n.eins ? f2(n.eins.iou) : '–', n && n.fWand ? f3(n.fWand)+(n.wand ? ' '+n.wand : '') : '–',
        n && n.skaliert ? f2(n.skaliert.iou) : '–', n && n.skaliert ? f2(n.skaliert.mehr) : '–', n && n.median ? f2(n.median.iou) : '–', x && Number.isFinite(x.rel) ? (x.rel>=0 ? '+' : '')+x.rel.toFixed(2)+(x.imFenster ? '' : '*') : '–',
        x && Number.isFinite(x.verlust) ? f2(x.verlust) : '–', z.kipp ? kp(z.kipp.zuf) : '–', z.kipp ? kp(z.kipp.block) : '–', f1((z.ms.gesamt||0)/1000), k.metrikFehler ? 'T2: '+k.metrikFehler : ''])); }
    const kv=Z.map(z=>z.kippVergleich).find(Boolean), kq=q=>q && q.zuf ? `${(100*q.zuf.k1/q.zuf.N).toFixed(0)} % zufällig / ${(100*q.block.k1/q.block.N).toFixed(0)} % Block (Vollauswertung ${q.voll.n} Ecken, ${f1(q.voll.A)} m²)` : '–';
    L.push('', 'Eingeklammert: Passung nicht eindeutig (Mehrd. < 1,2). δ/Δ mit * liegt außerhalb des E1-Fensters (|δ|/Δ > 0,3). IoU nach Skalierung zählt in der Auswertung nur mit Mehrd. nach ≥ 1,2 und in der Lage des besten H.', '',
      kv ? `Kippquote K1 zum Vergleich (gleicher Samen): freie Höhe (Vorwissen 2,55 ± 0,35) ${kq(kv.frei)}; H auf den eigenen Schätzwert ${f2(kv.hEigen)} m festgehalten ${kq(kv.eigen)}.` : '',
      'Bestes H nach Kriterium: '+KRITERIEN.map(([key, text])=>`${text} ${s.best[key]!=null ? f2(s.best[key]) : '–'}`).join(' · ')+`. Streuung (halbe Spanne über die Kriterien) ±${f3(s.streuung)} m.`,
      `Bestes H (Beob-Median) − Laserhöhe: ${Number.isFinite(s.dHLaser) ? cm(s.dHLaser)+' cm' : 'n. b.'}. Größter IoU-Verlust nach Nachskalierung im Fenster |δ|/Δ ≤ 0,3: ${s.maxVerlust!=null ? f3(s.maxVerlust) : '–'} (${s.nFenster} Gitterpunkte, Bezug IoU nach bei H = ${f2(s.refH)}: ${f3(s.refIouNach)}).`, ''); }
  L.push('## Entscheid E1', '', `**${E.urteil}**`, '', zl(['Aufnahme', 'eindeutig / lagegleich', 'Streuung ±m', '|bestes H − Laser| m', 'max. IoU-Verlust', 'Gitterpunkte im Fenster', 'Streuung', 'IoU-Verlust', 'Spiegelung', 'Ergebnis']), '|'+'---|'.repeat(10));
  for(const r of E.zeilen) L.push(zl([r.name, `${r.nEindeutig} / ${r.nLage}`, f3(r.streuung), f3(r.abstandLaser), f3(r.maxVerlust), r.nFenster, r.okStreuung, r.okVerlust, r.spiegel, r.status]));
  L.push('');
  return L.join('\n');
}

// ------------------------------------------------ alle Laeufe
export function auftraege(o){
  const L=[], gitter=hGitter(o.von, o.bis, o.schritt);
  for(const au of o.aufnahmen) for(const H of gitter){ const id=`${au.name}-${hKey(H)}`, erster=H===gitter[0];
    L.push({id, aufnahme:au.name, src:resolve(au.src), protokoll:au.protokoll ? resolve(au.protokoll) : null, wahrheit:au.wahrheit ? resolve(au.wahrheit) : (existsSync(T1.WAHRHEIT) ? T1.WAHRHEIT : null), H,
      quelle:o.quelle, ohne:o.ohne, karte:o.karte, wand:o.wand, kipp:o.kipp, kippAnteil:o.kippAnteil, kippBlock:o.kippBlock, kippVergleich:erster && o.kipp>0, dir:join(resolve(o.aus), 'laeufe', id)}); }
  return L;
}
export function kind(auftrag, zeitgrenzeS=DEF.zeitgrenze){
  return new Promise(res=>{ const t0=performance.now(); mkdirSync(auftrag.dir, {recursive:true});
    const datei=join(auftrag.dir, 'auftrag.json'), kz=join(auftrag.dir, 'kennzahlen.json'); writeFileSync(datei, JSON.stringify(auftrag, null, 1)); rmSync(kz, {force:true});
    const log=openSync(join(auftrag.dir, 'log.txt'), 'w'), p=spawn(process.execPath, [fileURLToPath(import.meta.url), '--lauf', datei], {stdio:['ignore', log, log]});
    let schon=false, zeitUm=false;
    const uhr=zeitgrenzeS>0 && Number.isFinite(zeitgrenzeS) ? setTimeout(()=>{ zeitUm=true; p.kill('SIGKILL'); }, zeitgrenzeS*1000) : null;
    const fertig=(code, fehlerStart)=>{ if(schon) return; schon=true; if(uhr) clearTimeout(uhr); closeSync(log);
      let z=null; try{ z=existsSync(kz) ? leseJson(kz) : null; }catch(e){ z=null; }
      if(!z){ let rest=''; try{ rest=readFileSync(join(auftrag.dir, 'log.txt'), 'utf8').trim().split('\n').slice(-3).join(' / '); }catch(e){}
        z={id:auftrag.id, aufnahme:auftrag.aufnahme, H:auftrag.H, k:null, nach:null, kipp:null, ms:{gesamt:performance.now()-t0},
          fehler:zeitUm ? `Zeitgrenze ${zeitgrenzeS} s überschritten, Kindprozess mit SIGKILL beendet` : fehlerStart || `Kindprozess Code ${code}, keine kennzahlen.json: ${rest}`}; }
      res(z); };
    p.on('error', e=>fertig(-1, 'Start: '+e.message)); p.on('exit', code=>fertig(code, null)); });
}
export async function hsweep(o0){
  const o={...DEF, ...o0}, aus=resolve(o.aus); mkdirSync(join(aus, 'laeufe'), {recursive:true});
  const A=auftraege(o), zeilen=new Array(A.length), tA=performance.now();
  const alt=a=>{ const kz=join(a.dir, 'kennzahlen.json'); if(!existsSync(kz)) return null; let z; try{ z=leseJson(kz); }catch(e){ return null; }
    return !z.fehler && z.version===VERSION && JSON.stringify(z.argv)===JSON.stringify(t1Argv(a)) && (z.wahrheit ?? null)===(a.wahrheit ?? null) && (z.wand ?? null)===(a.wand ?? null)
      && JSON.stringify(z.kippOpt)===JSON.stringify([a.kipp, a.kippAnteil, a.kippBlock, !!a.kippVergleich]) ? z : null; };
  let next=0, n=0;
  const arbeiter=async()=>{ while(next<A.length){ const i=next++, a=A[i], vorher=o.weiter || o.nurTabelle ? alt(a) : null;
    zeilen[i]=vorher || (o.nurTabelle ? {id:a.id, aufnahme:a.aufnahme, H:a.H, k:null, nach:null, kipp:null, ms:{gesamt:0}, fehler:'nicht gerechnet'} : await kind(a, o.zeitgrenze));
    n++; if(!o.still) console.log(`[${n}/${A.length}] ${a.id}: ${zeilen[i].fehler ? 'FEHLER '+String(zeilen[i].fehler).split('\n')[0] : 'ok'} (${f1((zeilen[i].ms.gesamt||0)/1000)} s${vorher ? ', aus --weiter' : ''})`); } };
  await Promise.all(Array.from({length:Math.max(1, Math.min(o.jobs|0 || 1, A.length))}, arbeiter));
  const laser=Object.fromEntries(o.aufnahmen.filter(a=>Number.isFinite(a.laser)).map(a=>[a.name, a.laser])), S=auswerten(zeilen, laser, o), E=e1Aussage(S, o), msGesamt=performance.now()-tA;
  const text=`Werkzeug raumskizze-hsweep.mjs v${VERSION}, T1 v${T1.VERSION}, Node ${process.version}; ${A.length} Läufe, --jobs ${o.jobs}, gesamt ${f1(msGesamt/1000)} s. H ${o.von}–${o.bis} in ${o.schritt}-m-Schritten, `
    +`Quelle ${o.quelle}, --ohne ${(o.ohne||[]).join(',') || '–'}, --karte ${o.karte || '–'}, Nachskalierung ${o.wand ? 'Wand '+o.wand : 'längste zugeordnete Einzelkante'}, Kipp ${o.kipp} Ziehungen (${100*o.kippAnteil} % weg) und Blockfenster ${o.kippBlock} s. `
    +`Aufnahmen: ${o.aufnahmen.map(a=>a.name+' = '+basename(a.src)).join(', ')}.`;
  const md=tabelleMd(zeilen, S, E, {text});
  writeFileSync(join(aus, 'hsweep.md'), md); schreibeJson(join(aus, 'hsweep.json'), {kopf:{werkzeug:'raumskizze-hsweep.mjs', version:VERSION, t1:T1.VERSION, node:process.version, optionen:{...o, aus}, msGesamt}, zeilen, auswertung:S, e1:E});
  return {zeilen, auswertung:S, e1:E, md, msGesamt};
}

// ------------------------------------------------ Kommandozeile
const BOOL=new Set(['weiter', 'nur-tabelle', 'still']);
// --aufnahme name=tar,protokoll,wahrheit[,laserhoehe m]: leere Felder erlaubt (name=tar,,wahrheit.json)
export function aufnahmeAus(v){
  const m=String(v).match(/^([^=]+)=(.+)$/); if(!m) throw new Error('--aufnahme name=quelle[,protokoll[,wahrheit[,laserhoehe m]]], nicht '+v);
  const [src, protokoll, wahrheit, laser]=m[2].split(','); const L=laser ? +laser : null;
  if(laser && !(L>0)) throw new Error('Laserhöhe in m, nicht '+laser);
  return {name:m[1], src, protokoll:protokoll || null, wahrheit:wahrheit || null, laser:L};
}
export function argumente(argv){
  const a={aufnahmen:[]};
  for(let i=0;i<argv.length;i++){ const x=argv[i]; if(!x.startsWith('--')) throw new Error('unerwartetes Argument '+x);
    let [k, v]=x.slice(2).split(/=(.*)/s); if(v===undefined && !BOOL.has(k)) v=argv[++i]; if(BOOL.has(k) && v===undefined) v=true;
    if(k==='aufnahme') a.aufnahmen.push(aufnahmeAus(v)); else a[k]=v; }
  const liste=v=>v==null ? null : String(v).split(',').map(s=>s.trim()).filter(Boolean), num=(v, d)=>v!=null ? +v : d;
  return {aufnahmen:a.aufnahmen, aus:a.aus, von:num(a.von, DEF.von), bis:num(a.bis, DEF.bis), schritt:num(a.schritt, DEF.schritt), quelle:a.quelle || DEF.quelle, ohne:a.ohne!=null ? liste(a.ohne) : DEF.ohne,
    karte:a.karte!=null ? (a.karte==='aus' ? null : String(a.karte)) : DEF.karte, wand:a.wand || null, kipp:num(a.kipp, DEF.kipp), kippAnteil:num(a['kipp-anteil'], DEF.kippAnteil), kippBlock:num(a['kipp-block'], DEF.kippBlock),
    jobs:num(a.jobs, DEF.jobs), zeitgrenze:num(a.zeitgrenze, DEF.zeitgrenze), weiter:!!a.weiter, nurTabelle:!!a['nur-tabelle'], still:!!a.still, lauf:a.lauf || null};
}
async function main(){
  const o=argumente(process.argv.slice(2));
  if(o.lauf){ const z=await einzelLauf(leseJson(resolve(o.lauf))); if(z.fehler){ console.error(z.fehler); process.exitCode=1; } else console.log(`${z.id}: ok, ${(z.ms.gesamt/1000).toFixed(1)} s`); return; }
  if(!o.aufnahmen.length || !o.aus){ console.error('Aufruf: node raumskizze-hsweep.mjs --aufnahme name=aufnahme.tar,protokoll.json,wahrheit.json[,laserhoehe m] [--aufnahme ...] --aus ordner [--von 2.30 --bis 2.90 --schritt 0.05] [--jobs 4] [--wand Q-R] [--kipp 40]'); process.exit(1); }
  for(const au of o.aufnahmen) if(!existsSync(au.src)) throw new Error(`${au.name}: ${au.src} fehlt`);
  const r=await hsweep(o);
  console.log('\n'+r.md);
  console.log(`Ausgabe: ${resolve(o.aus)}/{hsweep.md, hsweep.json, laeufe/}`);
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) main().catch(e=>{ console.error(e.stack || e.message); process.exit(1); });
