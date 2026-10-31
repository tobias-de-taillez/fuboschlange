// raumskizze-kippquote.mjs — Messkern AP2 (Konzept P4, Abschnitt 3.1 Punkt 3): Kippquote = wie oft aendert sich die Topologie
// des Raumumrisses, wenn ein paar Erfassungen mehr oder weniger da sind. Leave-p-out ueber die Erfassungen der Aufnahme
// (obs ohne undone/suspect), jede Teilmenge wird ausgewertet mit
//   alt   G.solveSweepAuto (die Auswertung der Seite, mit G.rueckkehr als Rundenbruch, H wie live) und
//   karte T1 raumskizze-karte.mjs laufen() auf derselben Teilmenge (--quelle erfassungen, Gyro-Bruecke wie live),
//         Umriss = Export der Karte; Hauptumriss siehe haupt().
// Beide Auswertungen sehen dieselbe Teilmenge: ein Zug je Lauf aus G.KG.rnd(seed), NICHT T1 --weglassen (anderer Zufallsstrom,
// laesst zudem Bilder weg). Kennzahlen je Aufnahme und Auswertung gegen den Volllauf derselben Auswertung:
//   K1  gleiche Eckenzahl und Flaeche +-5 %          K3  gleiche zyklische Links-/Rechts-Folge der Ecken
//   KH  Hauptecken-Quote: gleiche Eckenzahl des Hauptumrisses (Ecken, deren Waende beide >= 0,6 m lang sind)
//   IoU Lauf gegen Volllauf (exakte Scanline-Flaeche aus T2, nicht das 10-cm-Raster des Prototyps); Median und Anteil >= 0,9
//   ungueltig  Anteil der Ringe, die sich kreuzen oder deren Drehsumme nicht ~ +-360 Grad ist; ohne Ergebnis getrennt
//   Online  Wechsel der sichtbaren Eckenzahl im Nachspiel: ungefiltert, nur gueltige zeigen, 3er-Regel (neuer Wert erst nach 3 Runden)
// Jede Quote mit Wilson-Intervall (95 %): bei 16 Laeufen trennen 75 % und 90 % nicht, bei 30 knapp. Gueltigkeit des Volllaufs steht
// daneben: ein hohes K1 bei kreuzendem Volllauf heisst nur "bleibt gleich falsch". Mit --wahrheit zusaetzlich Richtigkeit,
// getrennt davon: Anteil der Laeufe mit der Eckenzahl der Wahrheit (roh und Hauptumriss).
//
//   node raumskizze-kippquote.mjs <aufnahme.tar|ordner|protokoll.json> [--protokoll p.json] [--wahrheit w.json] [--weglassen 0.05]
//        [--laeufe 30] [--seed 1] [--H m | --hfest | --hfrei] [--auswertung alt|karte|beide] [--karte '{json}'] [--online-takt 2]
//        [--aus ordner] [--json]
//   H: ohne Angabe wie live (Laserhoehe aus dem Protokoll, sonst frei: H0 2,55 m, Sigma 0,35 m); --H m fest m; --hfest Laser
//   (Abbruch ohne Laser); --hfrei Laser ignorieren. Ohne Aufnahme (nur das Protokoll als erstes Argument) rechnet nur "alt".
//   Wiederholbar: gleiche Eingabe und --seed geben gleiche JSON-Bytes (keine Uhr im Ergebnis).
//   import {kippquote, kennzahlen, haupt, ...} from './raumskizze-kippquote.mjs'
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {resolve, join, basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as T1 from './raumskizze-karte.mjs';
import * as T2 from './raumskizze-metrik.mjs';

export const VERSION=1;
export const DEF={laeufe:30, weglassen:0.05, seed:1, wand:0.6, flaecheTol:0.05, drehTol:45, iouSchwelle:0.9, onlineStart:8, onlineSchritt:4, onlineTakt:2};
const D2R=Math.PI/180, R2D=180/Math.PI;
const median=a=>{ if(!a.length) return null; const s=[...a].sort((x,y)=>x-y), m=s.length>>1; return s.length%2 ? s[m] : (s[m-1]+s[m])/2; };
const r2=x=>x==null || !Number.isFinite(x) ? null : Math.round(x*100)/100;
const r4=x=>x==null || !Number.isFinite(x) ? null : Math.round(x*1e4)/1e4;

// ------------------------------------------------ Geometrie des Rings (Meter, [[x, y], ...])
// Drehsumme in Grad: +-360 fuer einen einfachen Ring, 0 fuer eine Acht (kreuzender Ring).
export function drehsumme(P){ const n=P.length; let t=0;
  for(let i=0;i<n;i++){ const a=P[i], b=P[(i+1)%n], c=P[(i+2)%n];
    t+=Math.atan2((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]), (b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1])); }
  return t*R2D; }
// Gueltig: einfach (keine Kreuzung) und Drehsumme nahe +-360 Grad (T2.einfach allein laesst Ringe mit Windung 2 durch).
export const gueltig=(P, tol=DEF.drehTol)=>P.length>=3 && T2.einfach(P) && Math.abs(Math.abs(drehsumme(P))-360)<=tol;
// Links-/Rechts-Folge der Ecken (L = konvex bei Umlauf gegen den Uhrzeiger), unabhaengig vom Umlaufsinn: ein im Uhrzeigersinn
// gegebener Ring wird umgedreht.
export function linksRechts(P){ const Q=T2.flaecheS(P)<0 ? [...P].reverse() : P, n=Q.length; let s='';
  for(let i=0;i<n;i++){ const a=Q[i], b=Q[(i+1)%n], c=Q[(i+2)%n]; s+=((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]))>0 ? 'L' : 'R'; }
  return s; }
export const gleicheFolge=(a, b)=>a.length===b.length && (a+a).includes(b);
// Hauptumriss: Ecken, an denen eine Nachbarwand kuerzer als thr ist (Nischen, Pfeiler, Schraegen), werden nacheinander entfernt,
// zuerst die mit dem kleinsten Dreieck zu den Nachbarn (Port p4_haupt.mjs); mindestens 4 Ecken bleiben.
export function haupt(P, thr=DEF.wand){ const Q=P.slice();
  for(;;){ const n=Q.length; let best=-1, bA=Infinity;
    for(let i=0;i<n;i++){ const a=Q[(i+n-1)%n], b=Q[i], c=Q[(i+1)%n];
      if(Math.min(Math.hypot(b[0]-a[0], b[1]-a[1]), Math.hypot(c[0]-b[0], c[1]-b[1]))>=thr) continue;
      const t=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2; if(t<bA){ bA=t; best=i; } }
    if(best<0 || n<=4) break; Q.splice(best, 1); }
  return Q; }
// Ring -> Kennwerte {n, A, P, einf, ts, gueltig, haupt:{n, A}, folge}; null/zu klein -> null
export function ring(P, extra={}){
  if(!P || P.length<3) return null;
  const H=haupt(P);
  return {n:P.length, A:T2.flaeche(P), P, einf:T2.einfach(P), ts:drehsumme(P), gueltig:gueltig(P), haupt:{n:H.length, A:T2.flaeche(H), P:H}, folge:linksRechts(P), ...extra}; }

// ------------------------------------------------ Statistik
// Wilson-Intervall (95 %) fuer k von n
export function wilson(k, n, z=1.96){ if(!n) return {k, n, p:null, lo:null, hi:null};
  const p=k/n, d=1+z*z/n, m=(p+z*z/(2*n))/d, h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
  return {k, n, p:r4(p), lo:r4(Math.max(0, m-h)), hi:r4(Math.min(1, m+h))}; }
// Anzeige-Regeln fuer die Eckenzahl-Folge {n, gueltig} je Runde (Port p4_ecken.mjs):
//   roh        ungefiltert (0 = kein Ring)
//   gueltig    nur gueltige Ringe zeigen, sonst den letzten gueltigen halten
//   dreier     wie gueltig, ein neuer Wert erst, wenn er 3 gueltige Runden in Folge da war (der erste sofort)
export function anzeigeFolge(seq, regel){
  if(regel==='roh') return seq.map(s=>s && s.n || 0);
  if(regel==='gueltig'){ let last=0; return seq.map(s=>{ if(s && s.gueltig) last=s.n; return last; }); }
  if(regel==='dreier'){ let shown=0, cand=null, k=0;
    return seq.map(s=>{ const v=s && s.gueltig ? s.n : null; if(v==null) return shown;
      if(v===shown){ cand=null; k=0; return shown; }
      if(v===cand) k++; else { cand=v; k=1; }
      if(k>=3 || shown===0){ shown=v; cand=null; k=0; }
      return shown; }); }
  throw new Error('Regel roh|gueltig|dreier, nicht '+regel);
}
export const wechsel=a=>a.slice(1).filter((x, i)=>x!==a[i]).length;
export function onlineKennzahlen(seq){
  const roh=anzeigeFolge(seq, 'roh'), g=anzeigeFolge(seq, 'gueltig'), d=anzeigeFolge(seq, 'dreier');
  return {runden:seq.length, wechselRoh:wechsel(roh), wechselNurGueltig:wechsel(g), wechselMit3:wechsel(d), ungueltigAnteil:r2(seq.filter(s=>!(s && s.gueltig)).length/Math.max(1, seq.length)),
    letzteRoh:roh.slice(-6).join(',')}; }

// ------------------------------------------------ Zuege
// Lauf i: Erfassung j bleibt mit Wahrscheinlichkeit 1 - p; ein eigener Strom je Lauf aus G.KG.rnd(seed), die Maske ist
// unabhaengig von der Auswertung und von der Reihenfolge der Laeufe.
export function zugMaske(G, seed, i, n, p){ const r=G.KG.rnd(((seed|0)*1000003+i*7919+17)>>>0), m=new Array(n); for(let j=0;j<n;j++) m[j]=!(r()<p); return m; }

// ------------------------------------------------ Auswerter: obs[] -> ring | null
// Alte Auswertung wie die Seite (solveOpt): H fest = Laser, sonst H0/Hsigma; G.rueckkehr setzt die Rundengrenze. H: {laser: m|null}
export function rechnerAlt(G, h){
  const L=h && h.laser>0 ? h.laser : null;
  return async obs=>{ const o=obs.map(x=>({ra:x.ra, rb:x.rb, t:x.t}));
    let lap=null; try{ lap=G.rueckkehr(o, L || 2.55); }catch(e){}
    let r; try{ r=G.solveSweepAuto(o, {...(L ? {H:L} : {H0:2.55, Hsigma:0.35}), ...(lap ? {runde:{t:lap.t-0.01}} : {})}); }catch(e){ return null; }
    if(!r || !r.corners || r.corners.length<3) return null;
    return ring(r.corners.map(c=>Array.isArray(c) ? c : [c.x ?? c[0], c.y ?? c[1]]), {H:r.H, rueckkehr:!!lap}); };
}
// Karte: T1 laufen() auf A mit den Erfassungen obs; Umriss = Export (mm -> m). folge: Eckenzahl je Runde (Aussenring) fuers Online-Nachspiel.
export function rechnerKarte(G, A, o){
  return async (obs, opt={})=>{ const lauf=await T1.laufen(G, {...A, P:{...A.P, obs}}, o);
    const ex=lauf.export && lauf.export.pts ? lauf.export.pts.map(p=>[p.x/1000, p.y/1000]) : null, R=ring(ex, {H:lauf.hLaser ?? null});
    const aus=r=>{ const R0=r.stand && r.stand.ringe && r.stand.ringe.find(x=>x.art==='aussen'); return R0 && R0.pts && R0.pts.length>=3 ? R0.pts : null; };
    if(opt.folge) return {...(R || {n:0, gueltig:false}), runden:lauf.runden.map(r=>({t:r.stand.t, P:aus(r)}))};
    return R; };
}
// Folge fuers Online-Nachspiel der Karte: der letzte Stand bis t = t0 + k * takt
export function rundenFolge(runden, takt=DEF.onlineTakt){
  if(!runden || !runden.length) return []; const t0=runden[0].t, out=[]; let j=0;
  for(let t=t0+takt;t<=runden[runden.length-1].t+1e-9;t+=takt){ while(j+1<runden.length && runden[j+1].t<=t) j++;
    const P=runden[j].P; out.push(P ? {n:P.length, gueltig:gueltig(P)} : {n:0, gueltig:false}); }
  return out; }
// Folge der Alt-Auswertung: wachsendes Praefix der Erfassungen, ab onlineStart in Schritten von onlineSchritt (Port p4_ecken.mjs)
export async function onlineAlt(rechne, obs, o={}){ const a=o.onlineStart ?? DEF.onlineStart, s=o.onlineSchritt ?? DEF.onlineSchritt, seq=[];
  if(!obs.length) return seq;
  for(let n=Math.min(a, obs.length); ; n=Math.min(n+s, obs.length)){ const r=await rechne(obs.slice(0, n)); seq.push(r ? {n:r.n, gueltig:r.gueltig} : {n:0, gueltig:false}); if(n>=obs.length) break; }
  return seq; }

// ------------------------------------------------ Kennzahlen
// voll: ring | null, laeufe: (ring | null)[]; wahr: {n, nHaupt} | null
export function kennzahlen(voll, laeufe, wahr=null, o={}){
  const N=laeufe.length, tolA=o.flaecheTol ?? DEF.flaecheTol, sw=o.iouSchwelle ?? DEF.iouSchwelle, mit=laeufe.filter(Boolean);
  const k={N, ohneErgebnis:mit.length===N ? 0 : N-mit.length,
    voll:voll ? {n:voll.n, A:r2(voll.A), gueltig:voll.gueltig, einfach:voll.einf, drehsumme:Math.round(voll.ts), hauptN:voll.haupt.n, hauptA:r2(voll.haupt.A)} : null,
    ungueltig:wilson(mit.filter(r=>!r.gueltig).length, N),
    eckenzahlen:Object.entries(laeufe.reduce((c, r)=>{ const e=r ? r.n : 0; c[e]=(c[e]||0)+1; return c; }, {})).sort((a,b)=>b[1]-a[1]||a[0]-b[0]).map(([e, c])=>e+'x'+c).join(' '),
    hauptEckenzahlen:Object.entries(mit.reduce((c, r)=>{ c[r.haupt.n]=(c[r.haupt.n]||0)+1; return c; }, {})).sort((a,b)=>b[1]-a[1]||a[0]-b[0]).map(([e, c])=>e+'x'+c).join(' ')};
  if(voll){
    k.k1=wilson(laeufe.filter(r=>r && r.n===voll.n && Math.abs(r.A-voll.A)<=tolA*voll.A).length, N);
    k.k3=wilson(laeufe.filter(r=>r && gleicheFolge(r.folge, voll.folge)).length, N);
    k.kh=wilson(laeufe.filter(r=>r && r.haupt.n===voll.haupt.n).length, N);
    const iou=laeufe.map(r=>r ? T2.iou([r.P], [voll.P]).iou : 0), iouH=laeufe.map(r=>r ? T2.iou([r.haupt.P], [voll.haupt.P]).iou : 0);
    k.iou={median:r4(median(iou)), anteil:wilson(iou.filter(x=>x>=sw).length, N)};
    k.iouHaupt={median:r4(median(iouH)), anteil:wilson(iouH.filter(x=>x>=sw).length, N)};
    k.iouLaeufe=iou.map(r4);
  }
  if(wahr){ k.richtigkeit={nWahr:wahr.n, nWahrHaupt:wahr.nHaupt, voll:voll ? {n:voll.n, dn:voll.n-wahr.n, hauptN:voll.haupt.n, dnHaupt:voll.haupt.n-wahr.nHaupt} : null,
      eckenzahl:wilson(mit.filter(r=>r.n===wahr.n).length, N), hauptEckenzahl:wilson(mit.filter(r=>r.haupt.n===wahr.nHaupt).length, N),
      gueltigUndRichtig:wilson(mit.filter(r=>r.gueltig && r.n===wahr.n).length, N), medianAbweichung:median(mit.map(r=>Math.abs(r.n-wahr.n))) }; }
  return k;
}
// Eckenzahl der Wahrheit (Aussenring) roh und als Hauptumriss
export function wahrheitEcken(datei){ const W=T2.wahrheitLaden(datei), P=W.ringe[0].pts; return {n:P.length, nHaupt:haupt(P).length, A:r2(W.ringe[0].A)}; }

// ------------------------------------------------ Lauf
// rechne: async obs -> ring | null; obs: Erfassungen; o: {laeufe, weglassen, seed, G, wahr, online}
export async function kippquote(rechne, obs, o={}){
  const L=o.laeufe ?? DEF.laeufe, p=o.weglassen ?? DEF.weglassen, seed=o.seed ?? DEF.seed, G=o.G;
  const voll=await rechne(obs, {folge:true}), laeufe=[], gestrichen=[];
  for(let i=0;i<L;i++){ const m=zugMaske(G, seed, i, obs.length, p), sub=obs.filter((x, j)=>m[j]); gestrichen.push(obs.length-sub.length); laeufe.push(await rechne(sub)); }
  const K=kennzahlen(voll, laeufe, o.wahr || null, o);
  K.gestrichen={min:Math.min(...gestrichen), max:Math.max(...gestrichen), median:median(gestrichen)};
  // Online-Nachspiel: Alt rechnet Praefixe (o.online), Karte nimmt die Runden des Volllaufs
  const seq=o.online ? await o.online(rechne, obs, voll) : null;
  if(seq) K.online=onlineKennzahlen(seq);
  return {voll, laeufe, kennzahlen:K};
}

// ------------------------------------------------ Eingabe
// Erfassungen wie T1 'app' und die Alt-Auswertung der Seite: ohne undone und suspect, mit beiden Strahlen
export const erfassungenSauber=obs=>(obs||[]).filter(x=>!x.undone && x.suspect!==true && x.ra && x.rb);
// Protokoll ohne Aufnahme: der letzte Durchlauf, wie die Prototypen
export function protokollLaden(datei){ const j=JSON.parse(readFileSync(datei, 'utf8')), R=j.runs && j.runs.length ? {...j, ...j.runs[j.runs.length-1]} : j;
  return {art:'protokoll', P:R, hLaserMm:R.hLaserMm || null}; }
export function hWahl(a, hLaserMm){
  if(a.H!=null && a.H!==true){ const v=+a.H; if(!(v>0)) throw new Error('--H braucht Meter > 0'); return {modus:'fest', laser:v, text:`fest ${v.toFixed(3)} m (--H)`}; }
  if(a.hfrei) return {modus:'frei', laser:null, text:'frei (H0 2,55 m, Sigma 0,35 m; --hfrei)'};
  if(a.hfest){ if(!hLaserMm) throw new Error('--hfest: das Protokoll hat keine Laserhoehe (hLaserMm)'); return {modus:'fest', laser:hLaserMm/1000, text:`fest ${(hLaserMm/1000).toFixed(3)} m (Laser)`}; }
  return hLaserMm ? {modus:'laser', laser:hLaserMm/1000, text:`fest ${(hLaserMm/1000).toFixed(3)} m (Laser aus dem Protokoll, wie live)`} : {modus:'frei', laser:null, text:'frei (kein Laser im Protokoll; H0 2,55 m, Sigma 0,35 m)'}; }

// ------------------------------------------------ Ausgabe
const pc=q=>q.p==null ? '–' : `${Math.round(100*q.p)} % (${q.k}/${q.n}; ${Math.round(100*q.lo)}–${Math.round(100*q.hi)})`;
export function tabelle(R){
  const L=[], k=R.kopf;
  L.push(`Kippquote ${k.quelle} · ${k.nObs} Erfassungen, ${k.weglassen*100} % weg, ${k.laeufe} Läufe, Seed ${k.seed} · H ${k.h}`);
  for(const nm of ['alt', 'karte']){ const E=R[nm]; if(!E) continue; const K=E.kennzahlen, v=K.voll;
    L.push(`\n${nm==='alt' ? 'Alte Auswertung (G.solveSweepAuto)' : 'Karte (T1, Export)'}`);
    L.push(`  Volllauf: ${v ? `${v.n} Ecken, ${v.A} m², Hauptumriss ${v.hauptN} Ecken ${v.hauptA} m², ${v.gueltig ? 'gültig' : 'UNGÜLTIG (Drehsumme '+v.drehsumme+'°, '+(v.einfach ? 'einfach' : 'kreuzend')+')'}` : 'kein Ring'}`);
    if(v){ L.push(`  K1 (Ecken + Fläche ±5 %)      ${pc(K.k1)}${v.gueltig ? '' : '   Achtung: Referenz ungültig, "stabil" heißt hier "gleich falsch"'}`);
      L.push(`  K3 (Links-/Rechts-Folge)      ${pc(K.k3)}`);
      L.push(`  KH (Hauptecken gleich)        ${pc(K.kh)}`);
      L.push(`  IoU gegen Volllauf            Median ${K.iou.median}, ≥ 0,9: ${pc(K.iou.anteil)}; Hauptumriss Median ${K.iouHaupt.median}, ≥ 0,9: ${pc(K.iouHaupt.anteil)}`); }
    L.push(`  ungültige Ringe               ${pc(K.ungueltig)}${K.ohneErgebnis ? `; ohne Ergebnis ${K.ohneErgebnis}` : ''}`);
    L.push(`  Eckenzahlen (Läufe)           ${K.eckenzahlen} · Hauptecken ${K.hauptEckenzahlen}${K.gestrichen ? ` · gestrichen ${K.gestrichen.min}–${K.gestrichen.max} je Lauf` : ''}`);
    if(K.online) L.push(`  Online-Nachspiel (${K.online.runden} Runden): Wechsel der sichtbaren Eckenzahl roh ${K.online.wechselRoh}, nur gültige ${K.online.wechselNurGueltig}, mit 3er-Regel ${K.online.wechselMit3}; ungültig ${Math.round(100*K.online.ungueltigAnteil)} % der Runden`);
    if(K.richtigkeit){ const w=K.richtigkeit;
      L.push(`  Richtigkeit (Wahrheit ${w.nWahr} Ecken, Hauptumriss ${w.nWahrHaupt}; getrennt von der Stabilität): Volllauf ${w.voll ? `${w.voll.n} (${w.voll.dn>=0 ? '+' : ''}${w.voll.dn}), Haupt ${w.voll.hauptN} (${w.voll.dnHaupt>=0 ? '+' : ''}${w.voll.dnHaupt})` : '–'}; Läufe mit Eckenzahl = Wahrheit ${pc(w.eckenzahl)}, Haupt = Wahrheit ${pc(w.hauptEckenzahl)}, gültig und richtig ${pc(w.gueltigUndRichtig)}`); } }
  return L.join('\n');
}

async function main(){
  const a=T1.argumente(process.argv.slice(2)), src=a._[0];
  if(!src){ console.error("Aufruf: node raumskizze-kippquote.mjs <aufnahme.tar|ordner|protokoll.json> [--protokoll p.json] [--wahrheit w.json] [--weglassen 0.05] [--laeufe 30] [--seed 1] [--H m|--hfest|--hfrei] [--auswertung alt|karte|beide] [--karte '{json}'] [--online-takt 2] [--aus ordner] [--json]"); process.exit(1); }
  const nurProt=/\.json$/.test(src) && !a.protokoll, A=nurProt ? protokollLaden(resolve(src)) : T1.ladeAufnahme(resolve(src), {protokoll:a.protokoll ? resolve(a.protokoll) : null});
  const was=a.auswertung || (nurProt ? 'alt' : 'beide'); if(!['alt', 'karte', 'beide'].includes(was)) throw new Error('--auswertung alt|karte|beide');
  if(nurProt && was!=='alt') throw new Error('--auswertung '+was+' braucht die Aufnahme (tar), nicht nur das Protokoll');
  const obs=erfassungenSauber(A.P && A.P.obs); if(!obs.length) throw new Error('keine Erfassungen im Protokoll');
  const h=hWahl(a, A.hLaserMm), o={laeufe:a.laeufe ? +a.laeufe : DEF.laeufe, weglassen:a.weglassen!=null ? +a.weglassen : DEF.weglassen, seed:a.seed!=null ? +a.seed : DEF.seed};
  const wahrheit=a.wahrheit ? resolve(a.wahrheit) : null; if(wahrheit) o.wahr=wahrheitEcken(wahrheit);
  const {G}=await T1.ladeSeite({}); o.G=G;
  const R={kopf:{werkzeug:'raumskizze-kippquote.mjs', version:VERSION, quelle:basename(src), nObs:obs.length, laeufe:o.laeufe, weglassen:o.weglassen, seed:o.seed, h:h.text, hModus:h.modus, wahrheit:o.wahr ? {...o.wahr} : null}};
  const t0=performance.now();
  if(was!=='karte'){ const alt=rechnerAlt(G, h), r=await kippquote(alt, obs, {...o, online:(re, ob)=>onlineAlt(re, ob)}); R.alt={voll:vollJson(r.voll), laeufe:r.laeufe.map(laufJson), kennzahlen:r.kennzahlen}; }
  if(was!=='alt'){
    // Karte: Optionen wie T1 main; Gyro-Bruecke wie live. A wird einmal vorgerechnet (IMU-Cache), dann je Lauf kopiert.
    const karteOpt=a.karte && a.karte!==true ? JSON.parse(String(a.karte)) : {schnitt:{gyroBruecke:true, vorhersage:'gedaempft'}};
    const oK=T1.optionenAus({quelle:'erfassungen', ohne:'tiefe,ebenen', metrik:'aus', karte:JSON.stringify(karteOpt), ...(h.modus==='frei' ? {ohneH:true} : h.modus==='fest' ? {H:h.laser} : {})});
    const re=rechnerKarte(G, A, oK), on=async (r0, ob, voll)=>rundenFolge(voll && voll.runden, a['online-takt'] ? +a['online-takt'] : DEF.onlineTakt);
    const r=await kippquote(re, obs, {...o, online:on}); R.karte={voll:vollJson(r.voll), laeufe:r.laeufe.map(laufJson), kennzahlen:r.kennzahlen, karteOptionen:karteOpt}; }
  const txt=tabelle(R)+`\nZeit: ${((performance.now()-t0)/1000).toFixed(1)} s (Node ${process.version})`;
  console.log(txt);
  if(a.json) console.log(JSON.stringify(R));
  if(a.aus){ const d=resolve(a.aus); mkdirSync(d, {recursive:true}); writeFileSync(join(d, 'kippquote.json'), JSON.stringify(R, null, 1)); writeFileSync(join(d, 'kippquote.txt'), txt+'\n'); console.log(`Ausgabe: ${d}/{kippquote.json, kippquote.txt}`); }
}
const vollJson=r=>r ? {n:r.n, A:r2(r.A), gueltig:r.gueltig, einfach:r.einf, drehsumme:Math.round(r.ts), hauptN:r.haupt.n, pts:r.P.map(p=>[r4(p[0]), r4(p[1])])} : null;
const laufJson=r=>r ? {n:r.n, A:r2(r.A), gueltig:r.gueltig, hauptN:r.haupt.n} : null;
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) main().catch(e=>{ console.error(e.stack || e.message); process.exit(1); });
