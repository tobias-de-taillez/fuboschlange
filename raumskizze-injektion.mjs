// Injektionstest (Konzepte P1/P6/P7, Abschnitt 3.1 Punkt 2): eine bekannte Stoerung in eine echte Aufnahme einspritzen und
// messen, was T1/T2 darauf antworten. So wird der Pruefmittel-Fall selbst belegt, bevor er etwas beweist: stimmt die
// Antwort mit dem ueberein, was die Geometrie verlangt (P6: Versatz d*s/(Delta-s); P7: Skizzenmassstab folgt H nur mit etwa
// 0,6 des Einzelstrahl-Werts), dann misst der Fall das, was er zu messen vorgibt.
//
//   node raumskizze-injektion.mjs <art> <aufnahme.tar> --protokoll p.json --wahrheit w.json [--H 2.416] [--aus ordner]
//        [--t1 "--quelle erfassungen --ohne tiefe,ebenen --karte {...}"] [--seeds 5] [--sigma 5,10] [--e 0.1,0.2]
//        [--s 5,10,15,20] [--delta 0.64,0.96] [--stuck 10] [--ausladung 8] [--wand W-V] [--n 10] [--w 1.3,4]
//
//   art: null  Nulltest (Einspritzung 0 ergibt Differenz 0, bitgleich)
//        d     senkrechter Rahmenversatz N(0, sigma cm) je 10 Erfassungen (P7 t11)
//        e     Hoehenfehler +-e m: die Erfassungsstrahlen werden mit falschem H gehoben (P7)
//        c     Rundum-Stuck: alle Erfassungen s unter der Decke, festes und freies H (P6 H1)
//        b     lokale Leiste s an einer Wand bei Delta = 0,64 und 0,96 m (P6 Kernbefund)
//        a     simulierte Bruchfenster mit dem echten Gyro der Aufnahme (ruft raumskizze-pruefstand.mjs auf)
//        alle  null, d, e, c, b (a nur mit --mit-a)
//
// Wie eingespritzt wird (alles rechnerisch auf den Strahlen der Erfassungen, die T1 mit --quelle erfassungen allein nutzt):
//  - Stuck/Leiste der Tiefe s: P = Treffpunkt des Strahls auf der Hoehe H0 (der wahren Deckenkante, hier die Hoehe der Basis);
//    der Strahl wird auf P - s*y gerichtet. Das ist dieselbe Wandebene, nur die Kante liegt s tiefer, und T1 hebt sie auf H0.
//    P6 1.1: dasselbe wie ein Hoehenfehler -s fuer diese Wand, Versatz d*s/(Delta-s) hinter die Wand.
//  - Delta (Kamerahoehe): der Ursprung jedes Strahls wird um dy gehoben und der Strahl wieder auf denselben Treffpunkt P
//    gerichtet (gleicher Raum, andere Kamerahoehe). Das ist die Naeherung "Kameras versetzen" ohne neue Aufnahme; die Zeilen
//    der Aufnahme (Posen) bleiben unveraendert, ob T1 darauf reagiert, zeigt die Kontrolle "Delta ohne Leiste" in Art b.
//  - Rahmenversatz: o[1] beider Strahlen +dy, Richtung unveraendert (der ARCore-Rahmen steht in der Hoehe daneben).
// Zufall nur ueber den eigenen Strom (seed), nichts anderes.
import {writeFileSync, mkdirSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as T1 from './raumskizze-karte.mjs';
import * as T2 from './raumskizze-metrik.mjs';
import * as PS from './raumskizze-pruefstand.mjs';

export const VERSION=1;
// T1-Optionen wie im Auftrag (live: KARTE_OPT plus Gyro-Bruecke und gedaempfte Vorhersage)
export const DEF={t1:['--quelle', 'erfassungen', '--ohne', 'tiefe,ebenen', '--karte', '{"schnitt":{"gyroBruecke":true,"vorhersage":"gedaempft"}}'],
  hFest:2.416, block:10, seeds:5, sigmaCm:[5, 10], eM:[0.10, 0.20], sCm:[5, 10, 15, 20], delta:[0.64, 0.96], stuckCm:10, ausladungCm:8, n:10, w:[1.3, 4],
  // Urteilsbaender: Messung/Erwartung. Eigene Festlegung dieses Werkzeugs, nicht aus den Konzepten (die geben nur die Groessenordnung).
  band:{lokal:[0.6, 1.4], faktor:[0.45, 0.75], hFaktor:[0.5, 2]}};

const q=(a, p)=>{ const s=a.filter(Number.isFinite).sort((x, y)=>x-y); return s.length ? s[Math.min(s.length-1, Math.floor(p*s.length))] : NaN; };
const med=a=>q(a, 0.5), cm=x=>Number.isFinite(x) ? (100*x).toFixed(1) : '–', f2=x=>Number.isFinite(x) ? x.toFixed(2) : '–', f3=x=>Number.isFinite(x) ? x.toFixed(3) : '–';

// ------------------------------------------------ Zufall (mulberry32, eigener Strom je Aufruf)
export function rng(seed){ let s=seed>>>0; const u=()=>{ s=(s+0x6D2B79F5)>>>0; let t=Math.imul(s^s>>>15, 1|s); t=(t+Math.imul(t^t>>>7, 61|t))^t; return ((t^t>>>14)>>>0)/4294967296; };
  const gauss=()=>{ let a=0; while(!a) a=u(); return Math.sqrt(-2*Math.log(a))*Math.cos(2*Math.PI*u()); }; return {u, gauss}; }

// ------------------------------------------------ Strahlen
// Treffpunkt eines Strahls auf der Ebene y = H (wie G.hitY), sonst null
export const trifft=(r, H)=>{ if(!r || !r.o || !r.d || Math.abs(r.d[1])<1e-6) return null; const t=(H-r.o[1])/r.d[1]; return t>0 && t<25 ? [r.o[0]+t*r.d[0], H, r.o[2]+t*r.d[2]] : null; };
// Strahl durch denselben Treffpunkt: Ursprung um dy gehoben, Ziel s unter der Kante (s > 0) oder, mit innen = [x, z]-Schritt,
// die obere Stuckkante (Ausladung p nach innen, horizontal gegen die Blickrichtung des Strahls; exakt nur fuer senkrechten Blick auf die Wand).
export function strahlNeu(r, H0, {dy=0, s=0, p=0}={}){
  if(!dy && !s && !p) return r;                                    // Einspritzung 0: dieselben Zahlen, bitgleich
  const P=trifft(r, H0); if(!P) return r;
  const o=[r.o[0], r.o[1]+dy, r.o[2]]; let Z=[P[0], H0-s, P[2]];
  if(p){ const h=Math.hypot(r.d[0], r.d[2]); if(h>1e-9){ Z=[Z[0]-p*r.d[0]/h, Z[1], Z[2]-p*r.d[2]/h]; } }
  const v=[Z[0]-o[0], Z[1]-o[1], Z[2]-o[2]], L=Math.hypot(...v), n0=Math.hypot(...r.d);
  return {...r, o, d:v.map(x=>x/L*n0)};
}
// Ursprung senkrecht verschieben, Richtung unveraendert (Rahmenversatz)
export const strahlVersatz=(r, dy)=>!dy ? r : {...r, o:[r.o[0], r.o[1]+dy, r.o[2]]};

// ------------------------------------------------ Aufnahme: Erfassungen lesen und ersetzen
// Die Erfassungen, die T1 nutzt (ohne undone), nach t sortiert; die Eintraege sind die Objekte der Aufnahme selbst.
export function gueltige(A){
  const L=A.art==='sitzung' ? (A.erfassungen||[]).filter(e=>e.ra && e.rb) : ((A.P && A.P.obs) || []).filter(x=>!x.undone && x.ra && x.rb);
  return [...L].sort((a, b)=>a.t-b.t);
}
// Kopie der Aufnahme mit ersetzten Strahlen; map: Erfassung (Objekt aus gueltige) -> {ra, rb}. Alles andere bleibt dasselbe Objekt.
export function ersetzen(A, map){
  const neu=x=>{ const r=map.get(x); return r ? {...x, ra:r.ra, rb:r.rb} : x; };
  if(A.art==='sitzung') return {...A, erfassungen:A.erfassungen.map(neu)};
  return {...A, P:{...A.P, obs:(A.P.obs||[]).map(neu)}};
}
// Einspritzungen als Abbildungen Erfassung -> {ra, rb}
export function injRahmenVersatz(L, sigma, seed, n=DEF.block){
  const R=rng(seed), map=new Map(), dys=[];
  for(let k=0;k<L.length;k+=n){ const dy=sigma*R.gauss(); dys.push(dy); for(const ob of L.slice(k, k+n)) map.set(ob, {ra:strahlVersatz(ob.ra, dy), rb:strahlVersatz(ob.rb, dy)}); }
  return {map, dys};
}
export function injStuck(L, H0, o, auswahl=null){          // o: {s, p, dy}
  const map=new Map(); for(const ob of L){ const sel=!auswahl || auswahl.has(ob);
    map.set(ob, {ra:strahlNeu(ob.ra, H0, sel ? o : {dy:o.dy}), rb:strahlNeu(ob.rb, H0, sel ? o : {dy:o.dy})}); }
  return map;
}
export const medianUrsprungY=L=>med(L.flatMap(ob=>[ob.ra.o[1], ob.rb.o[1]]));
// dy, das die Kamerahoehe so verschiebt, dass der Median von Delta = H0 - o_y den Zielwert hat
export const dyFuerDelta=(L, H0, delta)=>(H0-delta)-medianUrsprungY(L);
// Delta und Wandabstand je Strahl (Basis), fuer die Erwartung d*s/(Delta-s)
export function deltaAbstand(L, H0, dy=0){
  const D=[], d=[];
  for(const ob of L) for(const r of [ob.ra, ob.rb]){ const P=trifft(r, H0); if(!P) continue; D.push(H0-(r.o[1]+dy)); d.push(Math.hypot(P[0]-r.o[0], P[2]-r.o[2])); }
  return {delta:D, abstand:d};
}
// Erwartung aus P6 1.1 je Strahl, Median; s in m. Mit s >= Delta undefiniert.
export function erwartungVersatz(L, H0, s, dy=0, auswahl=null){
  const v=[], d=[], D=[];
  for(const ob of L){ if(auswahl && !auswahl.has(ob)) continue; for(const r of [ob.ra, ob.rb]){ const P=trifft(r, H0); if(!P) continue;
    const De=H0-(r.o[1]+dy), dd=Math.hypot(P[0]-r.o[0], P[2]-r.o[2]); if(De-s>0.05){ v.push(dd*s/(De-s)); d.push(dd); D.push(De); } } }
  return {versatz:med(v), abstand:med(d), delta:med(D), n:v.length};
}
// Selbstpruefung der Einspritzung vor jeder Antwort: Heben der Original- und der eingespritzten Strahlen auf H0 und Vergleich der
// Planverschiebung je Strahl mit d*s/(Delta-s) (Delta der neuen Kamera, d = Abstand des Originals). Rueckgabe groesster Fehler in m.
export function selbstpruefung(L, map, H0, {s=0, dy=0, auswahl=null}={}){
  let maxF=0, n=0;
  for(const ob of L){ const m=map.get(ob); if(!m || (auswahl && !auswahl.has(ob))) continue;
    for(const [r0, r1] of [[ob.ra, m.ra], [ob.rb, m.rb]]){ const P0=trifft(r0, H0), P1=trifft(r1, H0); if(!P0 || !P1) continue;
      const d=Math.hypot(P0[0]-r1.o[0], P0[2]-r1.o[2]), De=H0-r1.o[1], soll=s ? d*s/(De-s) : 0, ist=Math.hypot(P1[0]-P0[0], P1[2]-P0[2]);
      maxF=Math.max(maxF, Math.abs(ist-soll)); n++; } }
  return {maxFehler:maxF, n};
}

// ------------------------------------------------ Wahrheit, starre Passung, Wandzuordnung
export const abstandWand=(W, p)=>{ let best=Infinity, k=-1; for(let i=0;i<W.waende.length;i++){ const w=W.waende[i], ex=w.b[0]-w.a[0], ey=w.b[1]-w.a[1], L2=ex*ex+ey*ey,
    t=Math.max(0, Math.min(1, ((p[0]-w.a[0])*ex+(p[1]-w.a[1])*ey)/L2)), d=Math.hypot(p[0]-w.a[0]-t*ex, p[1]-w.a[1]-t*ey); if(d<best){ best=d; k=i; } } return {d:best, k}; };
export const abtasten=(l, st=0.1)=>{ const n=Math.max(2, Math.ceil(Math.hypot(l[1][0]-l[0][0], l[1][1]-l[0][1])/st)+1), o=[];
  for(let i=0;i<n;i++){ const t=i/(n-1); o.push([l[0][0]+t*(l[1][0]-l[0][0]), l[0][1]+t*(l[1][1]-l[0][1])]); } return o; };
// Alle Erfassungen in EINEM Rahmen gehoben (Naeherung: ein ARCore-Rahmen; im Flur 16:25 starr fast gueltig, P1) an die Wahrheit gepasst.
// Rueckgabe {pa, T, pts, segs, d}: d = Abstand jedes Abtastpunkts zur Wahrheitswand unter T.
export function starrePassung(G, L, H0, W, o={}){
  const segs=[], pts=[], idx=[];
  L.forEach((ob, i)=>{ const s=G.liftObs(ob, H0); if(!s) return; segs.push(s); for(const p of abtasten(s)){ pts.push(p); idx.push(i); } });
  if(pts.length<8) return null;
  const pa=T2.passung(pts, segs, W, o);
  return {pa, T:pa.T, pts, segs, idx, d:pts.map(p=>abstandWand(W, T2.tf(p, pa.T)).d)};
}
// Wand der Wahrheit je Erfassung (nahe genug, Mittelpunkt der gehobenen Strecke)
export function wandJeErfassung(G, L, H0, W, T, maxD=0.3){
  const out=new Map();
  for(const ob of L){ const s=G.liftObs(ob, H0); if(!s) continue; const m=[(s[0][0]+s[1][0])/2, (s[0][1]+s[1][1])/2], r=abstandWand(W, T2.tf(m, T)); if(r.d<=maxD) out.set(ob, r.k); }
  return out;
}
// Karte -> Wahrheit ist T2.tf; die Umkehrung fuer Punkte (Wahrheit -> Karte) und Richtungen
export function tfUmkehr(p, T){ const s=T.s ?? 1, c=Math.cos(T.r)*s, sn=Math.sin(T.r)*s, dx=p[0]-T.tx, dy=p[1]-T.ty, x=(c*dx+sn*dy)/(s*s), y=(-sn*dx+c*dy)/(s*s); return [T.m ? -x : x, y]; }
export const richtungUmkehr=(v, T)=>{ const a=tfUmkehr(v, {...T, tx:0, ty:0, s:1}), L=Math.hypot(a[0], a[1]); return [a[0]/L, a[1]/L]; };

// ------------------------------------------------ Ringe: Topologie und Vergleich
export const flaeche=P=>T2.flaeche(P);
export function drehfolge(P){ const n=P.length; if(n<3) return ''; let A=0; for(let i=0, j=n-1;i<n;j=i++) A+=P[j][0]*P[i][1]-P[i][0]*P[j][1]; const sg=A>=0 ? 1 : -1; let s='';
  for(let i=0;i<n;i++){ const a=P[(i+n-1)%n], b=P[i], c=P[(i+1)%n], cr=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]); s+=cr*sg>=0 ? 'L' : 'R'; } return s; }
// gleiche zyklische Links-/Rechts-Folge (auch rueckwaerts durchlaufen)
export const gleicheFolge=(a, b)=>a.length>0 && a.length===b.length && ((a+a).includes(b) || (a+a).includes([...b].reverse().join('')));
const naechsterPunkt=(P, p)=>{ let best={d:Infinity, q:null}; for(let i=0;i<P.length;i++){ const a=P[i], b=P[(i+1)%P.length], ex=b[0]-a[0], ey=b[1]-a[1], L2=ex*ex+ey*ey,
    t=L2>0 ? Math.max(0, Math.min(1, ((p[0]-a[0])*ex+(p[1]-a[1])*ey)/L2)) : 0, qx=a[0]+t*ex, qy=a[1]+t*ey, d=Math.hypot(p[0]-qx, p[1]-qy); if(d<best.d) best={d, q:[qx, qy]}; } return best; };
const umfang=P=>P.reduce((s, p, i)=>s+Math.hypot(P[(i+1)%P.length][0]-p[0], P[(i+1)%P.length][1]-p[1]), 0);
const randPunkte=P=>P.flatMap((a, i)=>abtasten([a, P[(i+1)%P.length]]));
// Ring der Einspritzung gegen den ungestoerten Ring (gleicher Rahmen: beide Laeufe derselben Aufnahme)
export function ringVergleich(P0, P1){
  if(!P0 || !P1) return null;
  const A0=flaeche(P0), A1=flaeche(P1), e=P0.map(p=>Math.min(...P1.map(c=>Math.hypot(c[0]-p[0], c[1]-p[1])))), k=randPunkte(P0).map(p=>naechsterPunkt(P1, p).d);
  return {n0:P0.length, n1:P1.length, A0, A1, flaecheRatio:A1/A0, skala:Math.sqrt(A1/A0), aussen:(A1-A0)/umfang(P0), eckeMed:med(e), eckeMax:Math.max(...e), kanteMed:med(k), kanteP90:q(k, 0.9),
    folge0:drehfolge(P0), folge1:drehfolge(P1), topologieGleich:gleicheFolge(drehfolge(P0), drehfolge(P1))};
}
// Lage einer Wahrheitswand (in der Karte) im Ring der Einspritzung gegen den Basisring: Mittel der Verschiebung der Basisrandpunkte
// nahe der Wand, gemessen entlang der Wandnormalen nach aussen (positiv = hinter die Wand). null, wenn keine Randpunkte in der Naehe.
export function wandVerschiebung(P0, P1, wand, T, maxD=0.4){
  const a=tfUmkehr(wand.a, T), b=tfUmkehr(wand.b, T), nIn=richtungUmkehr(wand.n, T), nAus=[-nIn[0], -nIn[1]], v=[];
  for(const p of abtasten([a, b])){ const bp=naechsterPunkt(P0, p); if(!(bp.d<maxD)) continue; const ip=naechsterPunkt(P1, bp.q).q; v.push((ip[0]-bp.q[0])*nAus[0]+(ip[1]-bp.q[1])*nAus[1]); }
  return v.length>=3 ? {median:med(v), p10:q(v, 0.1), p90:q(v, 0.9), n:v.length} : null;
}

// ------------------------------------------------ Messen: T1 + T2 auf einer (eingespritzten) Aufnahme
const kennzahlen=mm=>{ if(!mm || mm.fehler || !mm.aussen || mm.aussen.fehlt) return null; const a=mm.aussen;
  return {ecken:a.n, eckenWahr:a.nT, zugeordnet:a.zugeordnet.length, fehlend:a.fehlend.length, ueberzaehlig:a.ueberzaehlig.length, eMed:a.eMed, eP90:a.eP90, A:a.A, AT:a.AT, dA:a.dA, iou:a.iou, einfach:a.einfach,
    skala:mm.passung.skala, skalaRoh:mm.passung.skalaRoh, verhaeltnis:mm.passung.verhaeltnis, gespiegelt:mm.passung.gespiegelt, T:mm.passung.T}; };
// Kennzahlen des Exports mit festgehaltener Lage T (Rahmen der Basis): Fehler gegen die Wahrheit im selben Rahmen
export const fixiert=(r, W, T)=>kennzahlen(T2.metrik(r.E, W, {hFest:r.hF, T}));
// o: {t1, H (undefined = Aufnahme/Vorgabe, null = frei, Zahl = fest), hFest, T (Basis-Passung fuer die festgehaltene Messung)}
export async function messen(G, A, W, o){
  const a=T1.argumente(['x', ...(o.t1 || DEF.t1)]), oT=T1.optionenAus(a); if(o.H!==undefined) oT.H=o.H;
  const lauf=await T1.laufen(G, A, oT), E=T1.metrikEingabe(lauf); delete E.beob;           // Export allein (schnell), die Beob-Messregel 10.1 ist hier nicht gefragt
  const hF=lauf.hLaser || o.hFest || DEF.hFest, m=T2.metrik(E, W, {hFest:hF}), pin=o.T ? T2.metrik(E, W, {hFest:hF, T:o.T}) : null;
  const ring=E.data ? T2.eingabeAus(E).ringe[0]?.pts ?? null : null, S=lauf.letzte.stand, H=S.hoehen || {};
  return {lauf, m, E, hF, ring, frei:kennzahlen(m), fest:pin ? kennzahlen(pin) : null, hC:H.hC ?? null, hF:H.hF ?? null, H:Number.isFinite(H.hC) && Number.isFinite(H.hF) ? H.hC-H.hF : null,
    hQuelle:H.quelle ?? null, hLaser:lauf.hLaser, exportJson:lauf.export ? JSON.stringify(lauf.export) : null, waende:S.waende.length, ecken:S.ecken.length};
}
const kurz=r=>({ecken:r.frei && r.frei.ecken, eMed:r.frei && r.frei.eMed, A:r.frei && r.frei.A, iou:r.frei && r.frei.iou, H:r.H, hQuelle:r.hQuelle});

function urteilBand(mess, erw, band){ if(!Number.isFinite(mess) || !Number.isFinite(erw) || !erw) return {urteil:'nicht bewertbar', verhaeltnis:NaN};
  const v=mess/erw; return {verhaeltnis:v, urteil:v>=band[0] && v<=band[1] ? 'bestaetigt' : 'abweichend'}; }

// ------------------------------------------------ Ausgangslage einer Aufnahme
export async function ausgang(G, A, W, o={}){
  const L=gueltige(A), H0=Number.isFinite(o.H) ? o.H : A.hLaserMm ? A.hLaserMm/1000 : DEF.hFest;
  const frei=await messen(G, A, W, {...o, H:null}), fest=await messen(G, A, W, {...o, H:H0});
  const starr=starrePassung(G, L, H0, W), da=deltaAbstand(L, H0);
  fest.T=fest.frei ? fest.frei.T : null;                      // Lage des ungestoerten Exports (fester H) in der Wahrheit: der festgehaltene Rahmen
  fest.fest=fest.T ? fixiert(fest, W, fest.T) : null;
  return {L, H0, frei, fest, starr, deltaMed:med(da.delta), abstandMed:med(da.abstand), n:L.length};
}

// ------------------------------------------------ Art null: Einspritzung 0
export async function artNull(G, A, W, o, base){
  const sets=[['d sigma 0', injRahmenVersatz(base.L, 0, 1).map], ['c s 0', injStuck(base.L, base.H0, {s:0, dy:0})], ['b s 0, Delta unveraendert', injStuck(base.L, base.H0, {s:0, dy:0}, new Set(base.L.slice(0, 20)))]];
  const rows=[];
  for(const [name, map] of sets){
    const A2=ersetzen(A, map), gleichStrahlen=base.L.every(ob=>{ const m=map.get(ob); return m && JSON.stringify(m.ra)===JSON.stringify(ob.ra) && JSON.stringify(m.rb)===JSON.stringify(ob.rb); });
    const r=await messen(G, A2, W, {...o, H:base.H0}), gleich=r.exportJson===base.fest.exportJson;
    rows.push({name, strahlenBitgleich:gleichStrahlen, exportBitgleich:gleich, urteil:gleichStrahlen && gleich ? 'bestaetigt' : 'ROT'}); }
  return {art:'null', erwartung:'Einspritzung 0: Strahlen und Export bitgleich zum ungestoerten Lauf (fester H)', rows};
}

// ------------------------------------------------ Art d: senkrechter Rahmenversatz
export async function artD(G, A, W, o, base){
  const rows=[], erw={5:0.04, 10:0.10};
  for(const sg of o.sigmaCm){ const frei=[], fest=[];
    for(let seed=1;seed<=o.seeds;seed++){
      const {map, dys}=injRahmenVersatz(base.L, sg/100, seed), A2=ersetzen(A, map), chk=selbstpruefung(base.L, map, base.H0, {});
      const rf=await messen(G, A2, W, {...o, H:null}), rx=await messen(G, A2, W, {...o, H:base.H0, T:base.fest.T});
      frei.push({seed, dH:rf.H!=null && base.frei.H!=null ? rf.H-base.frei.H : NaN, kurz:kurz(rf), cmp:ringVergleich(base.frei.ring, rf.ring), dys:dys.length, rms:Math.sqrt(dys.reduce((s, x)=>s+x*x, 0)/dys.length)});
      fest.push({seed, eMed:rx.fest && rx.fest.eMed, cmp:ringVergleich(base.fest.ring, rx.ring), top:ringVergleich(base.fest.ring, rx.ring)?.topologieGleich}); }
    const dH=frei.map(x=>x.dH), E=erw[sg], mD=med(dH), ud0=urteilBand(mD, E, o.band.hFaktor), ud=ud0.urteil==='abweichend' && E>=q(dH, 0.1) && E<=q(dH, 0.9) ? {...ud0, urteil:'vertraeglich (Streuung)'} : ud0;
    const da=deltaAbstand(base.L, base.H0), leverRms=med(da.abstand)/med(da.delta)*sg/100;
    rows.push({sigmaCm:sg, seeds:o.seeds, freiesH:{dHMedian:mD, dHp10:q(dH, 0.1), dHp90:q(dH, 0.9), dHproSeed:dH, erwartung:E ?? null, ...ud},
      festesH:{eMedMedian:med(fest.map(x=>x.eMed)), eMedBasis:base.fest.fest ? base.fest.fest.eMed : null, wandHebelErwartungM:leverRms, topologieGleich:fest.filter(x=>x.top).length+'/'+fest.length,
        flaecheRatioMedian:med(fest.map(x=>x.cmp && x.cmp.flaecheRatio))}, topologieFrei:frei.filter(x=>x.cmp && x.cmp.topologieGleich).length+'/'+frei.length,
      }); }
  return {art:'d', erwartung:'freies H: H_hat steigt um etwa +4 cm (sigma 5) und +10 cm (sigma 10) [p7 t11, Simulation]; festes H: Wandversatz je Block d*dy/Delta', basis:{H:base.frei.H, hQuelle:base.frei.hQuelle}, rows};
}

// ------------------------------------------------ Art e: Hoehenfehler
export async function artE(G, A, W, o, base){
  const rows=[], da=deltaAbstand(base.L, base.H0), De=med(da.delta);
  for(const e of o.eM.flatMap(x=>[x, -x])){
    const r=await messen(G, A, W, {...o, H:base.H0+e}), cmp=ringVergleich(base.fest.ring, r.ring);
    // Einzelstrahl-Faktor direkt aus den Strahlen: Median des Abstands bei H0+e gegen H0
    const f=[]; for(const ob of base.L) for(const rr of [ob.ra, ob.rb]){ const P0=trifft(rr, base.H0), P1=trifft(rr, base.H0+e); if(P0 && P1) f.push(Math.hypot(P1[0]-rr.o[0], P1[2]-rr.o[2])/Math.hypot(P0[0]-rr.o[0], P0[2]-rr.o[2])); }
    const einzel=med(f), wirk=cmp ? (cmp.skala-1)/(einzel-1) : NaN, ud=urteilBand(wirk, 0.6, [o.band.faktor[0]/0.6, o.band.faktor[1]/0.6]);
    rows.push({e, einzelstrahlFaktor:einzel, einzelstrahlErwartung:1+e/De, skizzenSkala:cmp && cmp.skala, wirkfaktor:wirk, erwartungWirkfaktor:0.6, ...ud, deltaMed:De, hEff:r.H, topologieGleich:cmp && cmp.topologieGleich, ecken:r.frei && r.frei.ecken, eMed:r.frei && r.frei.eMed, flaecheRatio:cmp && cmp.flaecheRatio}); }
  return {art:'e', erwartung:'Einzelstrahl (Delta+e)/Delta; Skizzenmassstab folgt dem nur mit etwa 0,6 [p7 S2]; Form haelt |e|/Delta bis etwa 0,3', H0:base.H0, rows};
}

// ------------------------------------------------ Art c: Rundum-Stuck
export async function artC(G, A, W, o, base){
  const s=o.stuckCm/100, p=o.ausladungCm/100, rows=[];
  const erw=erwartungVersatz(base.L, base.H0, s, 0);
  // untere Kante, festes H
  { const map=injStuck(base.L, base.H0, {s}), sp=selbstpruefung(base.L, map, base.H0, {s}), r=await messen(G, ersetzen(A, map), W, {...o, H:base.H0, T:base.fest.T}), cmp=ringVergleich(base.fest.ring, r.ring);
    rows.push({variante:'untere Kante, festes H', s, selbstpruefungMaxFehlerM:sp.maxFehler, erwartetAussenM:erw.versatz, gemessenAussenM:cmp && cmp.aussen, ...urteilBand(cmp && cmp.aussen, erw.versatz, o.band.lokal),
      topologieGleich:cmp && cmp.topologieGleich, ecken:r.frei && r.frei.ecken, eMedFest:r.fest && r.fest.eMed, eMedBasis:base.fest.fest && base.fest.fest.eMed, flaecheRatio:cmp && cmp.flaecheRatio, hEff:r.H}); }
  // untere Kante, freies H: H_hat sinkt um s, die Waende bleiben
  { const map=injStuck(base.L, base.H0, {s}), r=await messen(G, ersetzen(A, map), W, {...o, H:null}), cmp=ringVergleich(base.frei.ring, r.ring), dH=r.H-base.frei.H;
    rows.push({variante:'untere Kante, freies H', s, erwartetDH:-s, gemessenDH:dH, ...urteilBand(dH, -s, o.band.hFaktor), erwartetAussenM:0, gemessenAussenM:cmp && cmp.aussen,
      topologieGleich:cmp && cmp.topologieGleich, ecken:r.frei && r.frei.ecken, eMedFrei:r.frei && r.frei.eMed, eMedBasis:base.frei.frei && base.frei.frei.eMed, flaecheRatio:cmp && cmp.flaecheRatio, hEff:r.H, hBasis:base.frei.H}); }
  // obere Kante (Ausladung p), festes H: Fehler p nach innen
  { const map=injStuck(base.L, base.H0, {p}), r=await messen(G, ersetzen(A, map), W, {...o, H:base.H0}), cmp=ringVergleich(base.fest.ring, r.ring);
    rows.push({variante:'obere Kante (Ausladung p), festes H', p, erwartetAussenM:-p, gemessenAussenM:cmp && cmp.aussen, ...urteilBand(cmp && cmp.aussen, -p, [0.5, 1.5]), topologieGleich:cmp && cmp.topologieGleich, ecken:r.frei && r.frei.ecken, flaecheRatio:cmp && cmp.flaecheRatio,
      hinweis:'Ausladung horizontal gegen die Blickrichtung des Strahls, nicht gegen die Wandnormale (Naeherung)'}); }
  return {art:'c', erwartung:'festes H: alle Waende um d*s/(Delta-s) nach aussen; freies H: H_hat = H - s, Waende bleiben; obere Kante: p nach innen [P6 1.3]', s, p, delta:erw.delta, abstand:erw.abstand, rows};
}

// ------------------------------------------------ Art b: lokale Leiste an einer Wand
export async function artB(G, A, W, o, base){
  const starr=base.starr; if(!starr) return {art:'b', fehler:'keine starre Passung der Basis'};
  const zu=wandJeErfassung(G, base.L, base.H0, W, starr.T), zaehl=new Map(); for(const k of zu.values()) zaehl.set(k, (zaehl.get(k)||0)+1);
  let k=o.wand ? W.waende.findIndex(w=>w.ids===o.wand) : [...zaehl.entries()].filter(([i])=>W.waende[i].L>=1.0).sort((x, y)=>y[1]-x[1])[0]?.[0];
  if(k==null || k<0) return {art:'b', fehler:'keine Wand mit Erfassungen'};
  const wand=W.waende[k], auswahl=new Set(base.L.filter(ob=>zu.get(ob)===k)), rows=[];
  for(const delta of o.delta){
    const dy=dyFuerDelta(base.L, base.H0, delta), mapK=injStuck(base.L, base.H0, {s:0, dy}), kontrolle=await messen(G, ersetzen(A, mapK), W, {...o, H:base.H0}), cK=ringVergleich(base.fest.ring, kontrolle.ring);
    const wandK=(r)=>r.ring && kontrolle.ring ? wandVerschiebung(kontrolle.ring, r.ring, wand, base.fest.T) : null;
    rows.push({delta, wand:wand.ids, nErfassungenWand:auswahl.size, kontrolle:{name:'Delta ohne Leiste gegen Original', dy, topologieGleich:cK && cK.topologieGleich, eckeMedM:cK && cK.eckeMed, kanteMedM:cK && cK.kanteMed, flaecheRatio:cK && cK.flaecheRatio}});
    // sCm 0,1 = Rauschboden: schon eine Leiste von 1 mm zeigt, wie stabil die Topologie des Basislaufs unter einer Mini-Stoerung ist
    for(const sc of [0.1, ...o.sCm]){ const s=sc/100, map=injStuck(base.L, base.H0, {s, dy}, auswahl), sp=selbstpruefung(base.L, map, base.H0, {s, dy, auswahl}),
        r=await messen(G, ersetzen(A, map), W, {...o, H:base.H0}), cmp=ringVergleich(kontrolle.ring, r.ring), v=wandK(r), erw=erwartungVersatz(base.L, base.H0, s, dy, auswahl);
      rows.push({delta, sCm:sc, wand:wand.ids, selbstpruefungMaxFehlerM:sp.maxFehler, erwartetM:erw.versatz, abstandM:erw.abstand, deltaMed:erw.delta, gemessenM:v && v.median, p10:v && v.p10, p90:v && v.p90,
        ...urteilBand(v && v.median, erw.versatz, o.band.lokal), topologieGleich:cmp && cmp.topologieGleich, ecken:r.frei && r.frei.ecken, eckenBasis:kontrolle.frei && kontrolle.frei.ecken, eckeMaxM:cmp && cmp.eckeMax}); } }
  return {art:'b', erwartung:'Wand um d*s/(Delta-s) nach hinten [P6 1.2]; Topologie bricht, sobald der Versatz die Nischentiefe (Flur 0,15-0,6 m) uebersteigt', wand:wand.ids, rows};
}

// ------------------------------------------------ Art a: Pruefstand (simulierte Brueche mit echtem Gyro)
export async function artA(G, A, o, name='A'){
  const oP={...PS.DEF, w:o.w, n:o.n, t1:o.t1 || DEF.t1}; if(Number.isFinite(o.H)) oP.H=o.H;
  const F=PS.fenster(G, A, oP), R=[];
  for(const f of F){ try{ R.push(await PS.pruefeFenster(G, A, f, oP)); }catch(e){ R.push({...f, urteil:'fehler', fehler:String(e.message || e).slice(0, 120)}); } }
  const z=PS.zusammenfassung(R);
  return {art:'a', name, erwartung:'Grundlinie des Pruefstands (kein Sollwert im Konzept; P1 H6 vergleicht Verfahren gegeneinander): Anteil Treffer/falsch, Lage Median/p90',
    gyro:{zeilen:(A.imu||[]).length, imuGier:A._imuGier ? {quelle:A._imuGier.quelle, rate:A._imuGier.rate} : null}, fenster:F.length, zusammenfassung:z, rows:R.map(r=>({t0:r.t0, w:r.w, urteil:r.urteil, dP:r.dP, dPsiDeg:r.dPsiDeg, klasse:r.klasse, stufeB:r.stufeB, fehler:r.fehler}))};
}

// ------------------------------------------------ Bericht
export function markdown(erg){
  const L=[`# Injektionstest (v${VERSION}) – Art ${erg.art}`, '', `Erwartung: ${erg.erwartung}`, ''];
  if(erg.fehler){ L.push('FEHLER '+erg.fehler); return L.join('\n'); }
  if(erg.art==='null'){ L.push('| Fall | Strahlen bitgleich | Export bitgleich | Urteil |', '|---|---|---|---|'); for(const r of erg.rows) L.push(`| ${r.name} | ${r.strahlenBitgleich} | ${r.exportBitgleich} | ${r.urteil} |`); }
  else if(erg.art==='d'){ L.push('| sigma | freies H: dH Median [p10, p90] cm | Erwartung cm | Urteil | festes H: Ecken-Fehler Median cm (Basis) | Wandhebel d*sigma/Delta cm | Topologie gleich fest / frei |', '|---|---|---|---|---|---|---|');
    for(const r of erg.rows) L.push(`| ${r.sigmaCm} cm | ${cm(r.freiesH.dHMedian)} [${cm(r.freiesH.dHp10)}, ${cm(r.freiesH.dHp90)}] | ${cm(r.freiesH.erwartung)} | ${r.freiesH.urteil} (${f2(r.freiesH.verhaeltnis)}x) | ${cm(r.festesH.eMedMedian)} (${cm(r.festesH.eMedBasis)}) | ${cm(r.festesH.wandHebelErwartungM)} | ${r.festesH.topologieGleich} / ${r.topologieFrei} |`); }
  else if(erg.art==='e'){ L.push(`H0 ${erg.H0} m`, '', '| e | Einzelstrahl-Faktor (Erwartung) | Skizzenmassstab | Wirkfaktor (soll 0,6) | Urteil | Topologie gleich | Ecken | Ecken-Fehler cm |', '|---|---|---|---|---|---|---|---|');
    for(const r of erg.rows) L.push(`| ${r.e>0 ? '+' : ''}${cm(r.e)} cm | ${f3(r.einzelstrahlFaktor)} (${f3(r.einzelstrahlErwartung)}) | ${f3(r.skizzenSkala)} | ${f2(r.wirkfaktor)} | ${r.urteil} | ${r.topologieGleich} | ${r.ecken} | ${cm(r.eMed)} |`); }
  else if(erg.art==='c'){ L.push('| Variante | Erwartung | gemessen | Urteil | Topologie gleich | weiteres |', '|---|---|---|---|---|---|');
    for(const r of erg.rows) L.push(`| ${r.variante} | ${r.erwartetDH!=null ? 'dH '+cm(r.erwartetDH)+' cm' : cm(r.erwartetAussenM)+' cm aussen'} | ${r.gemessenDH!=null ? 'dH '+cm(r.gemessenDH)+' cm; ' : ''}${cm(r.gemessenAussenM)} cm aussen | ${r.urteil} (${f2(r.verhaeltnis)}x) | ${r.topologieGleich} | Ecken ${r.ecken}, Flaeche x${f3(r.flaecheRatio)}${r.selbstpruefungMaxFehlerM!=null ? ', Selbstpruefung max '+cm(r.selbstpruefungMaxFehlerM)+' cm' : ''} |`); }
  else if(erg.art==='b'){ L.push(`Wand ${erg.wand}`, '', '| Delta | s | erwartet cm (d, Delta) | gemessen Median [p10, p90] cm | Urteil | Topologie gleich | Ecken (Kontrolle) | Selbstpruefung cm |', '|---|---|---|---|---|---|---|---|');
    for(const r of erg.rows){ if(r.kontrolle){ L.push(`| ${r.delta} | Kontrolle: Delta ohne Leiste | – | Ecken-Versatz Median ${cm(r.kontrolle.eckeMedM)} / Kante ${cm(r.kontrolle.kanteMedM)} cm | – | ${r.kontrolle.topologieGleich} | – | – |`); continue; }
      L.push(`| ${r.delta} | ${r.sCm} cm | ${cm(r.erwartetM)} (${f2(r.abstandM)} m, ${f2(r.deltaMed)} m) | ${cm(r.gemessenM)} [${cm(r.p10)}, ${cm(r.p90)}] | ${r.urteil} (${f2(r.verhaeltnis)}x) | ${r.topologieGleich} | ${r.ecken} (${r.eckenBasis}) | ${cm(r.selbstpruefungMaxFehlerM)} |`); } }
  else if(erg.art==='a'){ const z=erg.zusammenfassung; L.push(`${erg.fenster} Fenster, Gyro ${erg.gyro.zeilen} Zeilen (${erg.gyro.imuGier ? erg.gyro.imuGier.quelle : 'kein imuGier'}): Treffer ${z.treffer}, mittel ${z.mittel}, falsch ${z.falsch}, lose ${z.lose}, sonst ${z.sonst}; Lage Median ${cm(z.dPmed)} / p90 ${cm(z.dPp90)} cm; Gier Median ${f2(z.dPsiMed)} / p90 ${f2(z.dPsiP90)} Grad; an den Waenden ${cm(z.wandMed)} / ${cm(z.wandP90)} cm`); }
  return L.join('\n');
}

// ------------------------------------------------ Kommandozeile
const ZAHLEN=v=>String(v).split(',').map(Number).filter(Number.isFinite);
export function optionen(a){
  const o={t1:a.t1 ? String(a.t1).split(/\s+/).filter(Boolean) : DEF.t1, hFest:DEF.hFest, seeds:a.seeds ? +a.seeds : DEF.seeds, sigmaCm:a.sigma ? ZAHLEN(a.sigma) : DEF.sigmaCm, eM:a.e ? ZAHLEN(a.e) : DEF.eM,
    sCm:a.s ? ZAHLEN(a.s) : DEF.sCm, delta:a.delta ? ZAHLEN(a.delta) : DEF.delta, stuckCm:a.stuck ? +a.stuck : DEF.stuckCm, ausladungCm:a.ausladung ? +a.ausladung : DEF.ausladungCm,
    n:a.n ? +a.n : DEF.n, w:a.w ? ZAHLEN(a.w) : DEF.w, wand:a.wand || null, band:DEF.band};
  if(a.H!=null && a.H!==true) o.H=+a.H;
  // Der Wert nach --karte ist JSON mit Leerzeichen-freiem Aufbau; --t1 trennt an Leerzeichen
  return o;
}
async function main(){
  const a=T1.argumente(process.argv.slice(2)), art=a._[0], src=a._[1];
  if(!art || !src){ console.error('Aufruf: node raumskizze-injektion.mjs <null|d|e|c|b|a|alle> <aufnahme.tar> --protokoll p.json --wahrheit w.json [--H 2.416] [--aus ordner] ...'); process.exit(1); }
  const o=optionen(a), {G}=await T1.ladeSeite({}), A=T1.ladeQuelle(resolve(src), {protokoll:a.protokoll ? resolve(a.protokoll) : null});
  const wp=a.wahrheit ? resolve(a.wahrheit) : T2.WAHRHEIT, W=T2.wahrheitLaden(wp);
  const arten=art==='alle' ? ['null', 'd', 'e', 'c', 'b', ...(a['mit-a'] ? ['a'] : [])] : [art], erg=[];
  let base=null; const brauchtBasis=arten.some(x=>x!=='a');
  if(brauchtBasis){ base=await ausgang(G, A, W, o);
    console.log(`Basis: ${base.n} Erfassungen, H0 ${base.H0} m (fest), Delta Median ${f2(base.deltaMed)} m, Wandabstand Median ${f2(base.abstandMed)} m · frei: ${JSON.stringify(kurz(base.frei))} · fest: ${JSON.stringify(kurz(base.fest))}`); }
  for(const x of arten){ const t0=performance.now();
    const r=x==='null' ? await artNull(G, A, W, o, base) : x==='d' ? await artD(G, A, W, o, base) : x==='e' ? await artE(G, A, W, o, base) : x==='c' ? await artC(G, A, W, o, base)
      : x==='b' ? await artB(G, A, W, o, base) : x==='a' ? await artA(G, A, o, a.name || 'A') : (()=>{ throw new Error('Art '+x); })();
    r.sekunden=Math.round((performance.now()-t0)/100)/10; erg.push(r); console.log('\n'+markdown(r)); }
  if(a.aus){ const d=resolve(a.aus); mkdirSync(d, {recursive:true});
    writeFileSync(join(d, `injektion-${art}.json`), JSON.stringify({version:VERSION, quelle:src, optionen:o, basis:base ? {n:base.n, H0:base.H0, deltaMed:base.deltaMed, abstandMed:base.abstandMed, frei:kurz(base.frei), fest:kurz(base.fest)} : null, ergebnisse:erg}, (k, v)=>typeof v==='number' && !Number.isFinite(v) ? null : v, 1));
    writeFileSync(join(d, `injektion-${art}.md`), erg.map(markdown).join('\n\n')+'\n'); console.log(`\nAusgabe: ${d}/injektion-${art}.{json,md}`); }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(e=>{ console.error(e.stack || e.message); process.exit(1); });
