// raumskizze-sim.mjs — T3 (ARCHITEKTUR v3, 17.11, Phase 0.6): synthetische Sitzungen aus einer
// Wahrheit (Raumaufmass-JSON), ohne Video. Liefert je Videobild ein BildErgebnis (3.1) mit der Beilage
// wahr, dazu PoseZeilen (3.2), Brueche, Ereignisse und Fadenkreuz-Erfassungen: die Eingaenge, die T1
// aus einer Aufnahme gewinnt. Vorlagen: design/umriss/sim.mjs (Wege, Moebel), karte/fixtures/
// erzeuge-f4.mjs (F4: Abschnitte, Epochen, Kamera, Einteilung), pruef-kr/insel-halb.mjs und
// rev/insel-hyp.mjs (Pfeilerseiten, kappa, Geister).
//
//   node raumskizze-sim.mjs --fall=rund|unten|sprung|twechsel|hoehe|pfeiler2|pfeiler2g|pfeiler3|tuer|...
//        [--opt='{"seed":3,...}'] [--wahrheit=w.json] [--aus=sitzung.jsonl.gz]
//   import {sim, welt, ladeG} from './raumskizze-sim.mjs'
//
// Welt in 3D (F0 = Rahmen der Wahrheit, [x, z] = Wahrheit/1000, ungespiegelt wie F3/F4, y oben):
// Waende der Ringe (aussen, Inseln) raumhoch von y = 0 bis H, Decke und Boden ohne Verdeckung. Dazu die
// Objekte der Faelle (Tuer mit Flur, Durchgang mit Nachbarraum, Vorhangschiene, Schrank mit Sockel,
// Unterzug, Moebel, Geist). Kanten sind 3D-Strecken mit Herkunft (welt.kanten); verdeckt wird durch
// Flaechen (senkrechte Vierecke mit y-Bereich, waagerechte konvexe Vielecke). Eine Kante ist von einer
// Kamera aus nur dann ueberhaupt sichtbar, wenn ihre anliegenden Flaechen zur Kamera zeigen (konkav: alle,
// konvex: eine); die sichtbaren Stuecke kommen aus einer Abtastung je probePx und Raendern per Bisektion.
//
// Kamera wie A6 (proj, 287 x 640, Zeile 0 unten), Weg mit gerundeten Ecken (stetige Geschwindigkeit),
// Gier, Neigung und Hoehe wie F4. Abschnitte: camTo = gMat(g_wahr(t))^-1 · C_F0, Pose = T · camTo
// (camTo = T^-1 · Pose wie 1.1), g_wahr(t) = gKomp(g_ab, d(t)) mit Drift und verschmierter Korrektur in d.
// Bildpunkte mit Hauptpunkt-Versatz pp = [cx, cy] in px des Erkennungsbilds, im Sinn von NDC: +x rechts, +y oben
// (NDC += [2cx/w, 2cy/h]; bei flipY = false heisst +cy Zeilenindex hoeher, bei flipY = true niedriger). BildErgebnis.proj
// bleibt nominal, dir kommt aus der nominalen Projektion (wie M3 es rechnet). Segmente: Enden je 0..kuerzPx eingekuerzt, quer sigPx verrauscht.
// Einteilung: eigene Kopie der vorlaeufigen M3-Einteilung aus lm/messung.mjs (wie F1/F4); mit
// o.m3 = 'G' die echten G.lmSegmente/lmGier/lmRechtwinklig (ohne Verschmelzen, damit wahr passt).
//
// Zufall nur ueber G.KG.rnd mit Samen; eigene Folgen je Zweck (Weg, Abschnitt, Bild), damit eine Option
// das Rauschen anderer Bilder nicht verschiebt. sim() ist rein: keine Uhr, kein Datum im Ergebnis.
import {readFileSync, writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';

export const WAHRHEIT=fileURLToPath(new URL('./wahrheit-hesterkamp-wohnkueche-2026-10-25.json', import.meta.url));
export const VERSION=1;
export const H_LASER=2.416;
const D2R=Math.PI/180, R2D=180/Math.PI, ZWEIPI=2*Math.PI;
const wrap=a=>Math.atan2(Math.sin(a), Math.cos(a)), wrap2pi=a=>{ a%=ZWEIPI; return a<0 ? a+ZWEIPI : a; };

// ------------------------------------------------ Seite laden (vendor + geo, M0 einfuegen)
// Wie karte/fixtures/lib.mjs: M0 wird als eigener Block vor globalThis.RAUMSKIZZE=G; eingefuegt, wenn die
// Seite es (noch) nicht traegt. Ein schon gesetztes globalThis.RAUMSKIZZE des Aufrufers bleibt erhalten.
let G_=null, quellen_=null;
export function ladeG(o={}){
  if(G_ && !o.html) return G_;
  const html=readFileSync(o.html || new URL('./raumskizze-probe.html', import.meta.url), 'utf8');
  const pick=id=>{ const m=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`)); if(!m) throw new Error('Script-Block '+id+' fehlt'); return m[1]; };
  let geo=pick('geo'); const mark='globalThis.RAUMSKIZZE=G;', q={};
  for(const [name, test] of [['raumskizze-karte-grund.js', /G\.gBei=/]]){
    if(test.test(geo)){ q[name]='Seite'; continue; }
    const at=geo.lastIndexOf(mark); if(at<0) throw new Error('geo-Block ohne '+mark);
    geo=geo.slice(0, at)+'{\n'+readFileSync(new URL('./'+name, import.meta.url), 'utf8')+'\n}\n'+geo.slice(at); q[name]='Datei'; }
  const hatte=Object.prototype.hasOwnProperty.call(globalThis, 'RAUMSKIZZE'), vorher=globalThis.RAUMSKIZZE;
  new Function('"use strict";\n'+pick('vendor')+'\n'+geo)();
  const G=globalThis.RAUMSKIZZE;
  if(hatte) globalThis.RAUMSKIZZE=vorher; else delete globalThis.RAUMSKIZZE;
  if(!o.html){ G_=G; quellen_=q; }
  return G;
}
export const modulQuellen=()=>quellen_;

// ------------------------------------------------ Vorgaben
export const PROJ_A6=[3.212766170501709,0,0,0, 0,1.4398952722549438,0,0, 0,0,-1.0001999139785767,-1, 0,0,-0.2000199854373932,0];
// Kamera wie F4 (erzeuge-f4.mjs KAM); eckRadius rundet die Wegecken, aQuer/aLaengs (m/s²) begrenzen die
// Beschleunigung in Boegen und Kehren (Rest gegen konstante Geschwindigkeit je Zeile um a·dt² = 3 mm statt 5 cm am Knick).
export const KAMERA={w:287, h:640, proj:PROJ_A6, speed:0.35, dt:0.1, hCam:1.5, hAmp:0.05, yawRateDeg:45, yawAmp:0.6,
  pitchDeg:15, pitchAmpDeg:8, rollAmpDeg:0, eckRadius:0.4, aQuer:0.3, aLaengs:0.3, zNear:0.05};
export const RAUSCH={sigPx:1, kuerzPx:3, minLen:15, probePx:3};
export const ERFASSUNG={jede:8, fensterDeg:7, minLaenge:0.1};
// Wege (Plan [x, z] in der Wohnkueche): rund und unten aus design/umriss/sim.mjs, aber der suedliche Teil liegt bei
// z 2,5-2,6 statt 2,2-2,5: sonst ginge die erste Strecke in rund 20 cm, in unten 3 cm an der Wand O-P des
// Vorsprungs N-O-P-Q (z bis 2,30) vorbei. sw = nur suedwestlich des Pfeilers (sieht seine Seiten
// S und W, Kameras einseitig wie 'Kameras nur SW' in pruef-kr/insel-halb.mjs).
export const PFADE={
  rund:[[1.0,2.6],[4.5,2.6],[7.8,2.5],[7.8,4.4],[6.35,4.6],[6.35,6.5],[6.0,8.0],[3.4,8.0],[3.4,6.3],[3.4,4.5],[1.5,4.5],[1.0,6.5],[0.8,8.2],[0.6,3.0],[1.0,2.6]],
  unten:[[0.5,2.6],[4.0,2.6],[8.0,2.5],[8.0,4.5],[4.5,4.6],[1.0,4.6],[0.5,2.6]],
  sw:[[0.4,2.2],[2.0,2.2],[2.0,4.4],[0.4,4.4],[0.4,2.2]],
};
// Moebel aus design/umriss/sim.mjs; das freistehende Regal liegt 40 cm weiter noerdlich (z 3,0-3,4 statt
// 2,6-3,0), damit der Weg 'rund' (z = 2,5) 0,5 m Abstand hat.
export const MOEBEL={
  hoch:[{poly:[[8.26,2.0],[8.86,2.0],[8.86,3.8],[8.26,3.8]], h:2.1}, {poly:[[4.5,3.0],[5.7,3.0],[5.7,3.4],[4.5,3.4]], h:2.0}],
  deckenhoch:[{poly:[[8.26,2.0],[8.86,2.0],[8.86,3.8],[8.26,3.8]], h:2.1}, {poly:[[4.5,3.0],[5.7,3.0],[5.7,3.4],[4.5,3.4]], h:2.38}],
};
// Faelle (17.11) mit Vorgaben; Lagen an Waenden in m laengs der Wand ab ihrem ersten Punkt (von, bis) bzw.
// als Anteil (mitte). Waende heissen wie in F3 (Punkt-ids hintereinander, z. B. 'MN' von M nach N).
export const FAELLE={
  tuer:{wand:'MN', mitte:0.5, breite:0.9, sturz:2.0, tiefe:1.2, laenge:3.0},          // offene Tuer in den Flur (8.1)
  durchgang:{wand:'DE', mitte:0.5, breite:0.9, tiefe:2.0, laenge:3.0},               // Durchgang ohne Sturz (8.1)
  vorhang:{wand:'AB', von:0.8, bis:3.5, abstand:0.10, dicke:0.02, oben:0.05, hoehe:0.02},   // Schiene 10 cm vor der Wand, 5 cm unter der Decke (8.4)
  schrank:{wand:'LM', von:1.47, bis:3.27, tiefe:0.6, sockel:0.10, zurueck:0.05},     // deckenhohe Schrankzeile an L-M (8.2), z 2,0-3,8
  unterzug:{linie:'AAX', breite:0.30, tiefe:0.25, stuecke:[['ACAD','XY'], ['ZAA','VW']]},  // ueber beiden Durchgaengen der Inselflucht (8.3)
  geist:{pos:[6.4, 3.4], groesse:[0.40, 0.37], drehDeg:0, seiten:'SWNE', kappa:1, boden:true},   // Linien ohne Koerper (R4)
  pfeilerSeiten:{seiten:'SW', kappa:1, insel:null},                                  // nur diese Seiten geben Kanten; der Koerper verdeckt weiter
  pfeilerAbstand:{abstand:0.08, wand:'AB', insel:null},                              // F3: gedreht bis parallel zu A-B, dann verschoben (7.6)
  inselGedreht:{grad:30, insel:null},                                                 // um den Eckmittelpunkt gedreht (7.7)
};
export const DEF={seed:1, kamerapfad:'rund', spruenge:[], tWechsel:[], hoehe:null, moebel:[], faelle:[], drift:null, verschmiert:[], pp:[0, 0],
  H:H_LASER, T0:[0.35, 0.8, -1.25, 1.9], g0:{psi:0, tx:0, ty:0, tz:0}, wiederholen:1, kamera:{}, rausch:{}, erfassung:{},
  boden:true, senk:true, erfassungen:true, stoer:null, zerstueckeln:null, imu:null, flipY:false, m3:'eigen', bildJede:1, ereignisse:[]};
// Sprung (Relokalisierung): g_B = g_A ∘ K. K dreht um psiDeg um die Kamera (Bezug A) und verschiebt so, dass die
// Kamera im Bezug um genau d springt (wie F4 'sprung'); dy hebt. luecke > 0: so lange keine Zeilen (Tracking
// aus), Schnitt an der ersten Zeile danach. dT: Aenderung des Bodenbezugs (psiDeg von Tpsi, x/y/z von Tx/Ty/Tz).
// lokal: der local-Rahmen springt (Pose springt), der Bezugsanker springt mit (T folgt, camTo bleibt): wie A6 75,11 s.
const SPRUNG={t:0, d:0, richtDeg:0, psiDeg:0, dy:0, luecke:0, dT:null, lokal:null};
// T-Wechsel: T aendert sich (psiDeg von Tpsi, d/richtDeg in Tx/Tz, dy in Ty), Pose in local stetig.
const TWECHSEL={t:0, d:0, richtDeg:0, psiDeg:0, dy:0, ereignis:null};
// Verschmierte Korrektur: wie ein Sprung, aber ueber dauer s mit Kosinus-Rampe, ohne Bruch, ohne T-Aenderung.
const VERSCHMIERT={t:0, d:0, richtDeg:0, psiDeg:0, dy:0, dauer:2};
// Drift im Abschnitt (3.2.3): Staerken wie G.KG.KNOTEN mal faktor. zufallsweg: Knoten je dS m Weg oder dT s,
// Zuwachs je Kante N(0, sigma²) mit sigma = faktor·sqrt(s0² + (k·Δs)²) (Form des Priors, Lage an der Kamera
// ausgewertet wie r_P), d linear in t dazwischen. linear: Rate je Abschnitt N(0, (faktor·k)²) je m (oder
// rate), Zuwachs Rate·Δs je Zeile. brown: je Zeile N(0, (faktor·k)²·Δs) (sigma waechst mit sqrt(Δs)).
const DRIFT={modell:'zufallsweg', faktor:1, kP:null, kPsiDeg:null, kH:null, sP0:null, sPsi0Deg:null, sH0:null, dS:null, dT:null, rate:null};

// ------------------------------------------------ Zufall
const mische=(a,b,c)=>(Math.imul(a|0, 0x9E3779B1)^Math.imul((b|0)+0x7F4A7C15, 0x85EBCA77)^Math.imul((c|0)+0x165667B1, 0xC2B2AE3D))|0;
const gauss=r=>()=>{ let u=0; while(!u) u=r(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*r()); };

// ------------------------------------------------ Wahrheit als Ringe (wie F3: karte/fixtures/lib.mjs wahrheit)
const flaecheS=R=>{ let A=0; for(let i=0;i<R.length;i++){ const p=R[i], q=R[(i+1)%R.length]; A+=p[0]*q[1]-q[0]*p[1]; } return A/2; };
const imPoly=(p,R)=>{ let c=false; for(let i=0,j=R.length-1;i<R.length;j=i++){ const a=R[i], b=R[j];
  if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) c=!c; } return c; };
const segAbst=(p,a,b)=>{ const vx=b[0]-a[0], vy=b[1]-a[1], L2=vx*vx+vy*vy; let t=L2>0 ? ((p[0]-a[0])*vx+(p[1]-a[1])*vy)/L2 : 0; t=Math.max(0, Math.min(1, t));
  return Math.hypot(a[0]+t*vx-p[0], a[1]+t*vy-p[1]); };
export function wahrheitLesen(w=WAHRHEIT){
  const J0=typeof w==='string' ? JSON.parse(readFileSync(w, 'utf8')) : w, J=J0 && J0.data && J0.data.pts ? J0.data : J0;
  if(!J || !Array.isArray(J.pts) || !Array.isArray(J.walls)) throw new Error('Wahrheit ohne pts/walls');
  return J;
}
// Ringe aus der Nachbarschaft, Startecke und Richtung wie die Wandliste (A-B..., X-Y..., I-J...), groesster zuerst.
function ringeAus(J){
  const P=Object.fromEntries(J.pts.map(p=>[p.id, [p.x/1000, p.y/1000]])), adj={};
  for(const [a,b] of J.walls){ (adj[a]=adj[a]||[]).push(b); (adj[b]=adj[b]||[]).push(a); }
  const seen=new Set(), ringe=[];
  for(const [a0,b0] of J.walls){ if(seen.has(a0)) continue; const R=[a0]; seen.add(a0); let prev=a0, cur=b0;
    while(cur!==a0){ R.push(cur); seen.add(cur); const nx=adj[cur].find(x=>x!==prev); prev=cur; cur=nx; }
    ringe.push(R); }
  ringe.sort((a,b)=>Math.abs(flaecheS(b.map(i=>P[i])))-Math.abs(flaecheS(a.map(i=>P[i]))));
  const NAME=ringe.length===3 ? ['aussen', 'wandstueck', 'pfeiler'] : [];
  return ringe.map((ids,ri)=>({id:'R'+ri, name:NAME[ri] || (ri ? 'insel'+ri : 'aussen'), art:ri ? 'insel' : 'aussen', ids, pts:ids.map(i=>P[i])}));
}
// Wand k laeuft von pts[k] nach pts[k+1]; n zeigt zur freien Seite (Aussenring: innen, Insel: aussen), phi in [0, 2pi).
function waendeAusRing(G, pts, ids, ri, art){
  const A=flaecheS(pts), out=[];
  for(let k=0;k<pts.length;k++){ const p=pts[k], q=pts[(k+1)%pts.length], L=Math.hypot(q[0]-p[0], q[1]-p[1]);
    let n=[-(q[1]-p[1])/L, (q[0]-p[0])/L]; if((art==='aussen')!==(A>0)) n=[-n[0], -n[1]];
    const phi=wrap2pi(Math.atan2(n[1], n[0])), nn=G.wandN(phi), u=G.wandU(phi), rho=nn[0]*p[0]+nn[1]*p[1];
    const s=[u[0]*p[0]+u[1]*p[1], u[0]*q[0]+u[1]*q[1]].sort((x,y)=>x-y);
    out.push({id:ids[k]+ids[(k+1)%ids.length], a:ids[k], b:ids[(k+1)%ids.length], ring:ri, insel:art!=='aussen', A:p, B:q, L, phi, rho, iv:s, n:nn, u}); }
  return out;
}

// ------------------------------------------------ Faelle
// faelle: ['tuer', {unterzug:{...}}, {pfeilerAbstand:0.03}, {inselGedreht:30}, {pfeilerSeiten:'SW', kappa:0.8}, 'geist', ...]
export function faelleNorm(liste=[]){
  const F={};
  for(const x of liste){
    if(typeof x==='string'){ if(!FAELLE[x]) throw new Error('Fall '+x); F[x]={...FAELLE[x]}; continue; }
    // ein Fall je Objekt; die uebrigen Schluessel (kappa, insel, wand) ergaenzen ihn
    const k=Object.keys(x).filter(k=>FAELLE[k]), rest=Object.fromEntries(Object.entries(x).filter(([k])=>!FAELLE[k]));
    if(k.length!==1) throw new Error('Fall: genau ein Name je Eintrag ('+Object.keys(x).join(',')+')');
    const v=x[k[0]], z=v && typeof v==='object' && !Array.isArray(v) ? v
      : k[0]==='pfeilerAbstand' ? {abstand:v} : k[0]==='inselGedreht' ? {grad:v} : k[0]==='pfeilerSeiten' ? {seiten:v} : {};
    F[k[0]]={...FAELLE[k[0]], ...z, ...rest}; }
  if(F.pfeilerAbstand && F.inselGedreht) throw new Error('pfeilerAbstand und inselGedreht nicht zusammen');
  return F;
}
const inselIndex=(R, wahl)=>{ if(wahl==null) return R.length-1; const i=R.findIndex(r=>r.id===wahl || r.name===wahl); if(i<1) throw new Error('Insel '+wahl); return i; };
const mittel=P=>P.reduce((s,p)=>[s[0]+p[0]/P.length, s[1]+p[1]/P.length], [0,0]);
const drehePunkt=(p,c,a)=>{ const cs=Math.cos(a), sn=Math.sin(a), x=p[0]-c[0], z=p[1]-c[1]; return [c[0]+cs*x-sn*z, c[1]+sn*x+cs*z]; };
// Seite S/N/W/E einer Wand: Normale (frei) am naechsten an -z / +z / -x / +x.
const himmel=n=>{ const L=[['S',[0,-1]],['N',[0,1]],['W',[-1,0]],['E',[1,0]]]; let b=null, bd=-2; for(const [k,v] of L){ const d=n[0]*v[0]+n[1]*v[1]; if(d>bd){ bd=d; b=k; } } return b; };

// ------------------------------------------------ Welt
// welt(wahrheit, o) -> {H, ringe, waende, ecken, kanten, flaechen, objekte, wahrheit, faelle, pfad, warnungen}
//   kanten[i] = {id, A, B (3D, F0), art: 'wand'|'ecke'|'laibung'|'sturz'|'flur'|'nachbar'|'schiene'|'schrank'|'unterzug'|'moebel'|'geist',
//                kante: 0 Decke | 1 Boden | 2 senkrecht | 3 sonst waagerecht | 4 auf einer Wahrheitswand unter der Decke (Sturz, Unterzug),
//                wand (Index in waende oder -1), ecke (Index in ecken oder -1), ring, objekt, konkav, ebenen}
//   wahrheit = wirksamer Raum als Raumaufmass-JSON (mm, ungerundet) fuer T2 (Pfeiler verschoben/gedreht).
export function welt(wahrheit=WAHRHEIT, o={}){
  const G=o.G || ladeG(), H=o.H ?? H_LASER, J=wahrheitLesen(wahrheit), F=o.faelleNorm || faelleNorm(o.faelle || []), warn=[];
  const R=ringeAus(J);
  // ---- Faelle, die die Wahrheit aendern (Insel verschieben/drehen)
  if(F.pfeilerAbstand){ const f=F.pfeilerAbstand, ii=inselIndex(R, f.insel), Pf=R[ii];
    const W0=waendeAusRing(G, R[0].pts, R[0].ids, 0, 'aussen'), wRef=W0.find(w=>w.id===f.wand); if(!wRef) throw new Error('Wand '+f.wand);
    const WP=waendeAusRing(G, Pf.pts, Pf.ids, ii, 'insel');
    let k=0; for(let j=1;j<WP.length;j++) if(WP[j].n[0]*wRef.n[0]+WP[j].n[1]*wRef.n[1]<WP[k].n[0]*wRef.n[0]+WP[k].n[1]*wRef.n[1]) k=j;
    const sp=mittel(Pf.pts), dreh=wrap((wRef.phi+Math.PI)-WP[k].phi), p0=Pf.pts.map(p=>drehePunkt(p, sp, dreh));
    const abst=Math.min(G.wandSeite(wRef, p0[k]), G.wandSeite(wRef, p0[(k+1)%p0.length])), dx=-(abst-f.abstand);
    Pf.pts=p0.map(p=>[p[0]+dx*wRef.n[0], p[1]+dx*wRef.n[1]]); f.drehungDeg=dreh*R2D; f.flaeche=WP[k].id; }
  if(F.inselGedreht){ const f=F.inselGedreht, ii=inselIndex(R, f.insel), Pf=R[ii], sp=mittel(Pf.pts);
    Pf.pts=Pf.pts.map(p=>drehePunkt(p, sp, f.grad*D2R)); }
  const waende=R.flatMap((r,ri)=>waendeAusRing(G, r.pts, r.ids, ri, r.art)), wid=new Map(waende.map((w,i)=>[w.id, i]));
  const pos=new Map(R.flatMap(r=>r.ids.map((id,k)=>[id, r.pts[k]])));
  const ecken=J.pts.map(p=>({id:p.id, p:pos.get(p.id) || [p.x/1000, p.y/1000]})), eid=new Map(ecken.map((e,i)=>[e.id, i]));
  const wand=id=>{ const i=wid.get(id); if(i==null) throw new Error('Wand '+id); return i; };
  // ---- Bausteine
  const flaechen=[], kanten=[], objekte=[];
  const DECKE={n:[0,-1,0], d:-H}, BODEN={n:[0,1,0], d:0};
  const ebW=(n,p)=>({n:[n[0], 0, n[1]], d:n[0]*p[0]+n[1]*p[1]});
  const quad=(a,b,y0,y1,herk)=>flaechen.push({h:false, ax:a[0], az:a[1], bx:b[0], bz:b[1], y0, y1,
    x0:Math.min(a[0],b[0]), x1:Math.max(a[0],b[0]), z0:Math.min(a[1],b[1]), z1:Math.max(a[1],b[1]), herk});
  const waag=(pts,y,herk)=>flaechen.push({h:true, y, pts, x0:Math.min(...pts.map(p=>p[0])), x1:Math.max(...pts.map(p=>p[0])),
    z0:Math.min(...pts.map(p=>p[1])), z1:Math.max(...pts.map(p=>p[1])), herk});
  const kante=(A,B,k)=>kanten.push({A, B, art:'wand', kante:3, wand:-1, ecke:-1, ring:-1, objekt:null, konkav:false, ebenen:[], ...k});
  const p3=(p,y)=>[p[0], y, p[1]];
  // Senkrechtes Prisma ueber einem KONVEXEN Vieleck (alle Senkrechten konvex): Seiten verdecken, Boden-/Deckflaeche nur,
  // wenn nicht auf Boden/Decke. Unter- und Oberkanten an Boden/Decke sind konkav (sichtbar, wenn die Seite zur Kamera zeigt).
  const koerper=(pts, y0, y1, herk, mitKanten=true)=>{
    const A=flaecheS(pts), n=pts.length, S=[];
    for(let i=0;i<n;i++){ const p=pts[i], q=pts[(i+1)%n], L=Math.hypot(q[0]-p[0], q[1]-p[1]); let nn=[(q[1]-p[1])/L, -(q[0]-p[0])/L];
      if(A<0) nn=[-nn[0], -nn[1]]; S.push({p, q, eb:ebW(nn, p)}); quad(p, q, y0, y1, herk); }
    const unten=y0>1e-9 ? {n:[0,-1,0], d:-y0} : null, oben=y1<H-1e-9 ? {n:[0,1,0], d:y1} : null;
    if(unten) waag(pts, y0, herk); if(oben) waag(pts, y1, herk);
    if(!mitKanten) return;
    for(let i=0;i<n;i++){ const s=S[i], v=S[(i+n-1)%n];
      kante(p3(s.p, y0), p3(s.p, y1), {...herk, kante:2, konkav:false, ebenen:[v.eb, s.eb]});
      kante(p3(s.p, y0), p3(s.q, y0), {...herk, kante:y0<1e-9 ? 1 : 3, konkav:!unten, ebenen:[s.eb, unten || BODEN]});
      kante(p3(s.p, y1), p3(s.q, y1), {...herk, kante:y1>H-1e-9 ? 0 : 3, konkav:!oben, ebenen:[s.eb, oben || DECKE]}); }
  };
  const lokal=w=>{ const e=[(w.B[0]-w.A[0])/w.L, (w.B[1]-w.A[1])/w.L]; return (s,o)=>[w.A[0]+s*e[0]+o*w.n[0], w.A[1]+s*e[1]+o*w.n[1]]; };
  // Nebenraum hinter einer Oeffnung (Flur/Nachbarraum): drei raumhohe Waende, freie Seite innen, Ecken hinten konkav.
  const nebenraum=(w, sm, tiefe, laenge, art)=>{ const P=lokal(w), e=[(w.B[0]-w.A[0])/w.L, (w.B[1]-w.A[1])/w.L], herk={art, objekt:art};
    const c=[P(sm-laenge/2, 0), P(sm-laenge/2, -tiefe), P(sm+laenge/2, -tiefe), P(sm+laenge/2, 0)], nn=[e, w.n, [-e[0], -e[1]]], eb=[];
    for(let i=0;i<3;i++){ const a=c[i], b=c[i+1]; eb.push(ebW(nn[i], a)); quad(a, b, 0, H, herk);
      kante(p3(a, H), p3(b, H), {...herk, kante:0, konkav:true, ebenen:[eb[i], DECKE]});
      kante(p3(a, 0), p3(b, 0), {...herk, kante:1, konkav:true, ebenen:[eb[i], BODEN]}); }
    for(let i=1;i<3;i++) kante(p3(c[i], 0), p3(c[i], H), {...herk, kante:2, konkav:true, ebenen:[eb[i-1], eb[i]]});
    objekte.push({art, wand:w.id, poly:c, tiefe, laenge});
  };
  // ---- Belegung der Wahrheitswaende: Verdecker-Stuecke [s0, s1, y0, y1], Decken- und Bodenkante als Stuecke laengs s
  const bel=waende.map(w=>({quads:[[0, w.L, 0, H]], decke:[[0, w.L]], boden:o.boden===false ? [] : [[0, w.L]]}));
  const zeigt=new Set(waende.map((_,i)=>i));   // Waende, deren Ecken Senkrechte geben (Pfeilerseiten, kappa)
  if(F.pfeilerSeiten){ const f=F.pfeilerSeiten, ii=inselIndex(R, f.insel), ws=waende.map((w,i)=>[w,i]).filter(([w])=>w.ring===ii), kap=f.kappa ?? 1;
    for(const [w,i] of ws){ const an=f.seiten.includes(himmel(w.n));
      if(!an){ bel[i].decke=[]; bel[i].boden=[]; zeigt.delete(i); continue; }
      if(kap<1){ const m=w.L*(1-kap)/2; bel[i].decke=[[m, w.L-m]]; bel[i].boden=o.boden===false ? [] : [[m, w.L-m]]; } }
    f.gesehen=ws.filter(([,i])=>zeigt.has(i)).map(([w])=>w.id); f.himmel=Object.fromEntries(ws.map(([w])=>[w.id, himmel(w.n)]));
    if(kap<1) ws.forEach(([,i])=>zeigt.delete(i)); }   // kappa < 1: keine Senkrechten an den Pfeilerecken
  for(const [art, f] of [['tuer', F.tuer], ['durchgang', F.durchgang]]){ if(!f) continue;
    const i=wand(f.wand), w=waende[i], P=lokal(w), sm=f.mitte*w.L, s0=sm-f.breite/2, s1=sm+f.breite/2, oben=art==='tuer' ? f.sturz : H;
    if(s0<0.05 || s1>w.L-0.05) throw new Error(art+': Oeffnung passt nicht in '+w.id);
    bel[i].quads=[[0, s0, 0, H], [s1, w.L, 0, H]].concat(art==='tuer' ? [[s0, s1, f.sturz, H]] : []);
    if(art==='durchgang') bel[i].decke=[[0, s0], [s1, w.L]];
    bel[i].boden=o.boden===false ? [] : [[0, s0], [s1, w.L]];
    const eb=ebW(w.n, w.A), herk={art:'laibung', objekt:art};
    for(const s of [s0, s1]) kante(p3(P(s, 0), 0), p3(P(s, 0), oben), {...herk, kante:2, konkav:false, ebenen:[eb]});
    if(art==='tuer') kante(p3(P(s0, 0), f.sturz), p3(P(s1, 0), f.sturz), {art:'sturz', objekt:art, kante:3, konkav:false, ebenen:[eb, {n:[0,-1,0], d:-f.sturz}]});
    nebenraum(w, sm, f.tiefe, f.laenge, art==='tuer' ? 'flur' : 'nachbar');
    objekte.push({art, wand:w.id, s0, s1, oben}); }
  // ---- Wahrheitswaende und Ecken
  waende.forEach((w,i)=>{ const P=lokal(w), herk={art:'wand', wand:i, ring:w.ring}, eb=ebW(w.n, w.A);
    for(const [s0,s1,y0,y1] of bel[i].quads) quad(P(s0, 0), P(s1, 0), y0, y1, herk);
    for(const [s0,s1] of bel[i].decke) kante(p3(P(s0, 0), H), p3(P(s1, 0), H), {...herk, kante:0, konkav:true, ebenen:[eb, DECKE]});
    for(const [s0,s1] of bel[i].boden) kante(p3(P(s0, 0), 0), p3(P(s1, 0), 0), {...herk, kante:1, konkav:true, ebenen:[eb, BODEN]}); });
  R.forEach((r,ri)=>{ const ws=waende.map((w,i)=>[w,i]).filter(([w])=>w.ring===ri), n=ws.length;
    for(let k=0;k<n;k++){ const [wv, iv]=ws[(k+n-1)%n], [wn, ix]=ws[k], p=wn.A;
      if(F.pfeilerSeiten && ri===inselIndex(R, F.pfeilerSeiten.insel) && !(zeigt.has(iv) && zeigt.has(ix))) continue;
      const dn=[(wn.B[0]-wn.A[0])/wn.L, (wn.B[1]-wn.A[1])/wn.L], k2=wv.n[0]*dn[0]+wv.n[1]*dn[1];
      if(Math.abs(k2)<1e-9) continue;                               // gestreckter Winkel: keine Kante
      kante(p3(p, 0), p3(p, H), {art:'ecke', kante:2, ecke:eid.get(wn.a) ?? -1, ring:ri, konkav:k2>0, ebenen:[ebW(wv.n, wv.A), ebW(wn.n, wn.A)]}); } });
  // ---- Objekte
  if(F.vorhang){ const f=F.vorhang, w=waende[wand(f.wand)], P=lokal(w);
    koerper([P(f.von, f.abstand-f.dicke), P(f.bis, f.abstand-f.dicke), P(f.bis, f.abstand), P(f.von, f.abstand)], H-f.oben-f.hoehe, H-f.oben, {art:'schiene', objekt:'vorhang'});
    objekte.push({art:'schiene', wand:w.id, von:f.von, bis:f.bis, abstand:f.abstand, y:[H-f.oben-f.hoehe, H-f.oben]}); }
  if(F.schrank){ const f=F.schrank, w=waende[wand(f.wand)], P=lokal(w);
    const koerperPts=[P(f.von, 0), P(f.bis, 0), P(f.bis, f.tiefe), P(f.von, f.tiefe)], sockelPts=[P(f.von, 0), P(f.bis, 0), P(f.bis, f.tiefe-f.zurueck), P(f.von, f.tiefe-f.zurueck)];
    koerper(koerperPts, f.sockel, H, {art:'schrank', objekt:'schrank'}); koerper(sockelPts, 0, f.sockel, {art:'schrank', objekt:'sockel'});
    objekte.push({art:'schrank', wand:w.id, poly:koerperPts, sockel:sockelPts, front:[P(f.von, f.tiefe), P(f.bis, f.tiefe)], frontUnten:[P(f.von, f.tiefe-f.zurueck), P(f.bis, f.tiefe-f.zurueck)]}); }
  if(F.unterzug){ const f=F.unterzug, wS=waende[wand(f.linie)], S={phi:wS.phi, rho:wS.rho}, N={phi:wS.phi, rho:wS.rho-f.breite};
    f.stuecke.forEach(([e1, e2], j)=>{ const a=waende[wand(e1)], b=waende[wand(e2)], pts=[G.wandSchnitt(S, a), G.wandSchnitt(S, b), G.wandSchnitt(N, b), G.wandSchnitt(N, a)];
      if(pts.some(p=>!p)) throw new Error('unterzug: Linien parallel');
      koerper(pts, H-f.tiefe, H, {art:'unterzug', objekt:'unterzug'+j}); objekte.push({art:'unterzug', poly:pts, y:[H-f.tiefe, H], zwischen:[e1, e2]}); }); }
  const moebel=(typeof o.moebel==='string' ? MOEBEL[o.moebel] : o.moebel) || [];
  moebel.forEach((m,j)=>{ koerper(m.poly, m.y0 ?? 0, Math.min(m.h, H), {art:'moebel', objekt:'moebel'+j}); objekte.push({art:'moebel', poly:m.poly, y:[m.y0 ?? 0, Math.min(m.h, H)]}); });
  if(F.geist){ const f=F.geist, hx=f.groesse[0]/2, hz=f.groesse[1]/2, a=(f.drehDeg||0)*D2R;
    const pts=[[-hx,-hz],[hx,-hz],[hx,hz],[-hx,hz]].map(p=>drehePunkt([f.pos[0]+p[0], f.pos[1]+p[1]], f.pos, a)), S=[], herk={art:'geist', objekt:'geist'};
    for(let i=0;i<4;i++){ const p=pts[i], q=pts[(i+1)%4], L=Math.hypot(q[0]-p[0], q[1]-p[1]), nn=[(q[1]-p[1])/L, -(q[0]-p[0])/L];   // CCW: rechts = aussen
      const an=f.seiten.includes(himmel(nn)), m=L*(1-(f.kappa ?? 1))/2, e=[(q[0]-p[0])/L, (q[1]-p[1])/L], pa=[p[0]+m*e[0], p[1]+m*e[1]], pb=[q[0]-m*e[0], q[1]-m*e[1]];
      S.push({an, eb:ebW(nn, p), p});
      if(!an) continue;
      kante(p3(pa, H), p3(pb, H), {...herk, kante:0, konkav:true, ebenen:[S[i].eb, DECKE]});
      if(f.boden) kante(p3(pa, 0), p3(pb, 0), {...herk, kante:1, konkav:true, ebenen:[S[i].eb, BODEN]}); }
    if((f.kappa ?? 1)>=1) for(let i=0;i<4;i++){ const v=S[(i+3)%4], s=S[i]; if(v.an && s.an) kante(p3(s.p, 0), p3(s.p, H), {...herk, kante:2, konkav:false, ebenen:[v.eb, s.eb]}); }
    objekte.push({art:'geist', poly:pts, seiten:f.seiten, kappa:f.kappa ?? 1}); }
  // ---- Objektkanten auf Wahrheitswaenden: waagerechte Stuecke auf der Linie einer Wand innerhalb ihrer Ausdehnung
  // fallen bei y = H oder 0 weg (die Wandkante liegt dort schon), sonst tragen sie die Wand (kante 4: Sturz, Unterzug).
  const alle=kanten.splice(0), teil=(E,u0,u1,z)=>({...E, A:E.A.map((v,c)=>v+u0*(E.B[c]-v)), B:E.A.map((v,c)=>v+u1*(E.B[c]-v)), ...z});
  for(const E of alle){
    if(E.art==='wand' || E.art==='ecke' || Math.abs(E.A[1]-E.B[1])>1e-9){ kanten.push(E); continue; }
    let rest=[[0,1]]; const neu=[];
    waende.forEach((w,i)=>{ if(!rest.length) return;
      const dA=w.n[0]*E.A[0]+w.n[1]*E.A[2]-w.rho, dB=w.n[0]*E.B[0]+w.n[1]*E.B[2]-w.rho; if(Math.abs(dA)>1e-3 || Math.abs(dB)>1e-3) return;
      const sA=w.u[0]*E.A[0]+w.u[1]*E.A[2], sB=w.u[0]*E.B[0]+w.u[1]*E.B[2]; if(Math.abs(sB-sA)<1e-12) return;
      const ua=(w.iv[0]-sA)/(sB-sA), ub=(w.iv[1]-sA)/(sB-sA), lo=Math.max(0, Math.min(ua, ub)), hi=Math.min(1, Math.max(ua, ub)); if(hi-lo<1e-9) return;
      const y=E.A[1]; if(Math.abs(y-H)>1e-6 && Math.abs(y)>1e-6) neu.push(teil(E, lo, hi, {wand:i, ring:w.ring, kante:4}));
      rest=rest.flatMap(([a,b])=>[[a, Math.min(b, lo)], [Math.max(a, hi), b]]).filter(([a,b])=>b-a>1e-9); });
    for(const [a,b] of rest) kanten.push(a===0 && b===1 ? E : teil(E, a, b, {}));
    kanten.push(...neu); }
  kanten.forEach((E,i)=>{ E.id=i; });
  // ---- Weg und Abstaende
  const pfad=Array.isArray(o.kamerapfad) ? o.kamerapfad : PFADE[o.kamerapfad ?? 'rund']; if(!pfad) throw new Error('Weg '+o.kamerapfad);
  const wahrheitJ={pts:R.flatMap(r=>r.ids.map((id,k)=>({id, x:1000*r.pts[k][0], y:1000*r.pts[k][1]}))),
    walls:R.flatMap(r=>r.ids.map((id,k)=>[id, r.ids[(k+1)%r.ids.length]])), name:(J.name || 'Wahrheit')+(F.pfeilerAbstand || F.inselGedreht ? ' (T3 veraendert)' : '')};
  return {H, ringe:R, waende, ecken, kanten, flaechen, objekte, wahrheit:wahrheitJ, faelle:F, pfad, warnungen:warn};
}
// Abstand eines Wegpunkts zu allem, woran man nicht vorbeigehen kann (Verdecker, die unter 2 m reichen), und Lage im Raum.
export function wegPruefen(W, punkte, minAbst=0.25){
  const Fz=W.flaechen.filter(f=>!f.h && f.y0<2.0), schlecht=[]; let dmin=Infinity;
  for(const p of punkte){ let d=Infinity; for(const f of Fz) d=Math.min(d, segAbst(p, [f.ax, f.az], [f.bx, f.bz]));
    const drin=imPoly(p, W.ringe[0].pts) && W.ringe.slice(1).every(r=>!imPoly(p, r.pts)) && W.objekte.filter(x=>x.poly && x.art!=='geist' && x.art!=='unterzug').every(x=>!imPoly(p, x.poly));
    dmin=Math.min(dmin, d); if(d<minAbst || !drin) schlecht.push({p, d, drin}); }
  return {dmin, schlecht};
}

// ------------------------------------------------ Sichtbarkeit
// Strecke Kamera -> Q frei? Treffer zaehlen nur, wenn sie mehr als 1 mm vor Q liegen (Kanten auf Flaechen).
function frei(C, Q, F){
  const dx=Q[0]-C[0], dy=Q[1]-C[1], dz=Q[2]-C[2], L=Math.hypot(dx, dy, dz), sMax=1-1e-3/L;
  const bx0=Math.min(C[0], Q[0]), bx1=Math.max(C[0], Q[0]), bz0=Math.min(C[2], Q[2]), bz1=Math.max(C[2], Q[2]);
  for(let i=0;i<F.length;i++){ const f=F[i]; if(f.x1<bx0 || f.x0>bx1 || f.z1<bz0 || f.z0>bz1) continue;
    if(!f.h){ const ex=f.bx-f.ax, ez=f.bz-f.az, den=dx*ez-dz*ex; if(Math.abs(den)<1e-14) continue;
      const wx=f.ax-C[0], wz=f.az-C[2], s=(wx*ez-wz*ex)/den; if(!(s>1e-9 && s<sMax)) continue;
      const t=(wx*dz-wz*dx)/den; if(t<0 || t>1) continue;
      const y=C[1]+s*dy; if(y<f.y0 || y>f.y1) continue; return false; }
    else { if(Math.abs(dy)<1e-14) continue; const s=(f.y-C[1])/dy; if(!(s>1e-9 && s<sMax)) continue;
      const x=C[0]+s*dx, z=C[2]+s*dz, P=f.pts; let pos=0, neg=0;
      for(let k=0;k<P.length;k++){ const a=P[k], b=P[(k+1)%P.length], c=(b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0]); if(c>1e-12) pos++; else if(c<-1e-12) neg++; }
      if(!(pos && neg)) return false; } }
  return true;
}
// Kamera (Spalten rechts r, oben u, -Blick, Ort) -> Abbildung Raum -> Clip (proj) mit Hauptpunkt-Versatz in NDC.
function kameraSicht(Cm, proj, pp, w, h, flipY, zNear){
  const r=[Cm[0],Cm[1],Cm[2]], u=[Cm[4],Cm[5],Cm[6]], b=[Cm[8],Cm[9],Cm[10]], o=[Cm[12],Cm[13],Cm[14]], P=proj;
  const clip=X=>{ const d0=X[0]-o[0], d1=X[1]-o[1], d2=X[2]-o[2], x=r[0]*d0+r[1]*d1+r[2]*d2, y=u[0]*d0+u[1]*d1+u[2]*d2, z=b[0]*d0+b[1]*d1+b[2]*d2;
    return [P[0]*x+P[4]*y+P[8]*z+P[12], P[1]*x+P[5]*y+P[9]*z+P[13], P[2]*x+P[6]*y+P[10]*z+P[14], P[3]*x+P[7]*y+P[11]*z+P[15]]; };
  const dx=2*pp[0]/w, dy=2*pp[1]/h;
  const ndc=c=>[c[0]/c[3]+dx, c[1]/c[3]+dy];
  return {o, clip, ndc, dx, dy, zNear, w, h, flipY};
}
// u-Bereich einer Strecke A->B im Bild (homogenes Kappen an Nahebene und Bildrand, mit Versatz)
function imBild(K, ca, cb){
  let u0=0, u1=1;
  const lim=(f0,f1)=>{ if(f0<0 && f1<0) return false; if(f0>=0 && f1>=0) return true; const u=f0/(f0-f1); if(f0<0) u0=Math.max(u0, u); else u1=Math.min(u1, u); return true; };
  if(!lim(ca[3]-K.zNear, cb[3]-K.zNear)) return null;
  if(!lim(ca[0]+(1+K.dx)*ca[3], cb[0]+(1+K.dx)*cb[3]) || !lim((1-K.dx)*ca[3]-ca[0], (1-K.dx)*cb[3]-cb[0])) return null;
  if(!lim(ca[1]+(1+K.dy)*ca[3], cb[1]+(1+K.dy)*cb[3]) || !lim((1-K.dy)*ca[3]-ca[1], (1-K.dy)*cb[3]-cb[1])) return null;
  return u1-u0>1e-12 ? [u0, u1] : null;
}
const vorn=(e,C)=>e.n[0]*C[0]+e.n[1]*C[1]+e.n[2]*C[2]-e.d>1e-3;
export function kanteZeigt(E, C){ return E.konkav ? E.ebenen.every(e=>vorn(e, C)) : E.ebenen.some(e=>vorn(e, C)); }
// sichtbare Stuecke [ua, ub] einer Kante von der Kamera K aus (Abtastung je probePx, Raender per Bisektion)
function stuecke(E, K, F, probePx){
  const ca=K.clip(E.A), cb=K.clip(E.B), iv=imBild(K, ca, cb); if(!iv) return [];
  const at=u=>[E.A[0]+u*(E.B[0]-E.A[0]), E.A[1]+u*(E.B[1]-E.A[1]), E.A[2]+u*(E.B[2]-E.A[2])];
  const cl=u=>[ca[0]+u*(cb[0]-ca[0]), ca[1]+u*(cb[1]-ca[1]), 0, ca[3]+u*(cb[3]-ca[3])];
  const na=K.ndc(cl(iv[0])), nb=K.ndc(cl(iv[1])), Lpx=Math.hypot((nb[0]-na[0])*K.w/2, (nb[1]-na[1])*K.h/2);
  const N=Math.max(2, Math.min(400, Math.ceil(Lpx/probePx)+1)), us=[], vis=[];
  for(let i=0;i<N;i++){ const u=iv[0]+(iv[1]-iv[0])*i/(N-1); us.push(u); vis.push(frei(K.o, at(u), F)); }
  const rand=(a,b)=>{ for(let k=0;k<40;k++){ const m=(a+b)/2; if(frei(K.o, at(m), F)) a=m; else b=m; } return a; };   // a sichtbar, b nicht
  const out=[]; let i=0;
  while(i<N){ if(!vis[i]){ i++; continue; } let j=i; while(j+1<N && vis[j+1]) j++;
    const ua=i>0 ? rand(us[i], us[i-1]) : us[i], ub=j<N-1 ? rand(us[j], us[j+1]) : us[j];
    if(ub>ua) out.push([ua, ub]); i=j+1; }
  return out;
}

// ------------------------------------------------ Weg, Kamera
// Weg mit gerundeten Ecken (Kreisboegen mit eckRadius, hoechstens 45 % der Nachbarstrecken), geschlossen, wenn
// Anfang = Ende; wiederholen > 1 laeuft die Schleife mehrmals. Geschwindigkeit speed, in Boegen hoechstens
// sqrt(aQuer·r) und mit hoechstens aLaengs gebremst/beschleunigt (Kehren wie [0,8; 8,2] in rund), damit der Rest gegen
// konstante Geschwindigkeit je Zeile unter (aQuer, aLaengs)·dt² bleibt. Abtastung je dt.
function wegAbtasten(P0, K, wiederholen=1){
  const zu=Math.hypot(P0[0][0]-P0[P0.length-1][0], P0[0][1]-P0[P0.length-1][1])<1e-9;
  let P=zu ? P0.slice(0, -1) : P0.slice(); if(zu && wiederholen>1){ const Q=[]; for(let k=0;k<wiederholen;k++) Q.push(...P); P=Q; }
  const n=P.length, dicht=[], rad=[];
  const gerade=(a,b)=>{ const L=Math.hypot(b[0]-a[0], b[1]-a[1]), m=Math.max(1, Math.ceil(L/0.05)); for(let k=1;k<=m;k++){ dicht.push([a[0]+(b[0]-a[0])*k/m, a[1]+(b[1]-a[1])*k/m]); rad.push(Infinity); } };
  const ecke=(a,v,b)=>{ const d1=[v[0]-a[0], v[1]-a[1]], d2=[b[0]-v[0], b[1]-v[1]], l1=Math.hypot(...d1), l2=Math.hypot(...d2), e1=[d1[0]/l1, d1[1]/l1], e2=[d2[0]/l2, d2[1]/l2];
    const th=Math.acos(Math.max(-1, Math.min(1, e1[0]*e2[0]+e1[1]*e2[1]))); if(th<1e-6) return {p:v, q:v, bogen:[], r:Infinity};
    const l=Math.min(K.eckRadius*Math.tan(th/2), 0.45*Math.min(l1, l2)), p=[v[0]-e1[0]*l, v[1]-e1[1]*l], q=[v[0]+e2[0]*l, v[1]+e2[1]*l], r=l/Math.tan(th/2);
    const sg=Math.sign(e1[0]*e2[1]-e1[1]*e2[0]), m=[p[0]-sg*e1[1]*r, p[1]+sg*e1[0]*r], a0=Math.atan2(p[1]-m[1], p[0]-m[0]), nB=Math.max(4, Math.ceil(th*r/0.01)), bogen=[];
    for(let k=1;k<=nB;k++){ const a=a0+sg*th*k/nB; bogen.push([m[0]+r*Math.cos(a), m[1]+r*Math.sin(a)]); } return {p, q, bogen, r}; };
  const E=zu ? Array.from({length:n}, (_,k)=>ecke(P[(k+n-1)%n], P[k], P[(k+1)%n])) : P.map((v,k)=>k>0 && k<n-1 ? ecke(P[k-1], v, P[k+1]) : {p:v, q:v, bogen:[], r:Infinity});
  const start=zu ? [(P[0][0]+P[1%n][0])/2, (P[0][1]+P[1%n][1])/2] : P[0];
  dicht.push(start); rad.push(Infinity);
  const ende=zu ? n+1 : n;
  for(let k=1;k<ende;k++){ const e=E[k%n]; gerade(dicht[dicht.length-1], e.p); for(const b of e.bogen){ dicht.push(b); rad.push(e.r); } }
  if(zu) gerade(dicht[dicht.length-1], start);
  const s=[0]; for(let k=1;k<dicht.length;k++) s.push(s[k-1]+Math.hypot(dicht[k][0]-dicht[k-1][0], dicht[k][1]-dicht[k-1][1]));
  const aQ=K.aQuer ?? 0.4, aL=K.aLaengs ?? 0.5, v=rad.map(r=>Math.min(K.speed, Math.sqrt(aQ*r)));
  for(let k=1;k<v.length;k++) v[k]=Math.min(v[k], Math.sqrt(v[k-1]*v[k-1]+2*aL*(s[k]-s[k-1])));
  for(let k=v.length-2;k>=0;k--) v[k]=Math.min(v[k], Math.sqrt(v[k+1]*v[k+1]+2*aL*(s[k+1]-s[k])));
  const tt=[0]; for(let k=1;k<s.length;k++) tt.push(tt[k-1]+2*(s[k]-s[k-1])/Math.max(1e-9, v[k-1]+v[k]));
  const N=Math.floor(tt[tt.length-1]/K.dt+1e-9)+1, out=[]; let j=0;
  for(let i=0;i<N;i++){ const ti=i*K.dt; while(j+1<tt.length-1 && tt[j+1]<ti) j++; const f=tt[j+1]>tt[j] ? Math.min(1, (ti-tt[j])/(tt[j+1]-tt[j])) : 0;
    out.push({t:Math.round(ti*1e6)/1e6, p:[dicht[j][0]+f*(dicht[j+1][0]-dicht[j][0]), dicht[j][1]+f*(dicht[j+1][1]-dicht[j][1])], s:s[j]+f*(s[j+1]-s[j])}); }
  return {proben:out, dicht};
}
// Kameramatrix in F0 (Spalten r, u, -f, Ort): Blick Plan-Gier alpha, Neigung theta nach oben, Rollen um den Blick.
export function kameraMatrix(p, h, alpha, theta, roll=0){
  const f=[Math.cos(theta)*Math.cos(alpha), Math.sin(theta), Math.cos(theta)*Math.sin(alpha)];
  const rl=Math.hypot(f[2], f[0]); let r=[-f[2]/rl, 0, f[0]/rl], u=[r[1]*f[2]-r[2]*f[1], r[2]*f[0]-r[0]*f[2], r[0]*f[1]-r[1]*f[0]];
  if(roll){ const c=Math.cos(roll), s=Math.sin(roll), r2=r.map((v,i)=>c*v+s*u[i]), u2=u.map((v,i)=>-s*r[i]+c*v); r=r2; u=u2; }
  return [r[0],r[1],r[2],0, u[0],u[1],u[2],0, -f[0],-f[1],-f[2],0, p[0],h,p[1],1];
}
const quatAus=m=>{ const r00=m[0], r01=m[4], r02=m[8], r10=m[1], r11=m[5], r12=m[9], r20=m[2], r21=m[6], r22=m[10], tr=r00+r11+r22; let x,y,z,w;
  if(tr>0){ const s=Math.sqrt(tr+1)*2; w=0.25*s; x=(r21-r12)/s; y=(r02-r20)/s; z=(r10-r01)/s; }
  else if(r00>r11 && r00>r22){ const s=Math.sqrt(1+r00-r11-r22)*2; w=(r21-r12)/s; x=0.25*s; y=(r01+r10)/s; z=(r02+r20)/s; }
  else if(r11>r22){ const s=Math.sqrt(1+r11-r00-r22)*2; w=(r02-r20)/s; x=(r01+r10)/s; y=0.25*s; z=(r12+r21)/s; }
  else { const s=Math.sqrt(1+r22-r00-r11)*2; w=(r10-r01)/s; x=(r02+r20)/s; y=(r12+r21)/s; z=0.25*s; }
  return [x,y,z,w]; };
const T4=g=>[-g.psi, g.tx, g.ty, g.tz];                    // Zustandsspalten [Tpsi, Tx, Ty, Tz] aus der Planwirkung (1.2)
// Versatz, der um den Punkt c (Plan) um psi dreht und c um dvec verschiebt (dazu dy): K(x) = R(x - c) + c + dvec
const umPunkt=(c, psi, dvec, dy)=>{ const cs=Math.cos(psi), sn=Math.sin(psi); return {psi, tx:c[0]+dvec[0]-(cs*c[0]-sn*c[1]), ty:dy, tz:c[1]+dvec[1]-(sn*c[0]+cs*c[1])}; };
const rampe=(t,t0,dauer)=>t<=t0 ? 0 : t>=t0+dauer ? 1 : (1-Math.cos(Math.PI*(t-t0)/dauer))/2;

// ------------------------------------------------ Einteilung (vorlaeufiges M3, Kopie aus karte/fixtures/lib.mjs = lm/messung.mjs)
// VORLAEUFIG bis P-B: je Segment Strahlen durch die Enden (G.pixToNdc, G.ray) im Bezug des Bilds; senkrecht (V), wenn
// der Winkel zum senkrechten Fluchtpunkt (G.vertVanish) < vDeg; sonst waagerecht oben (O) bzw. unten (U), wenn beide
// Enden ueber +elDeg bzw. unter -elDeg liegen; sonst verworfen (X). psi = Plan-Gier der waagerechten Deutung in [0, pi).
// sPx = 1, nTeile = 1. Unter minLen bleiben Segmente mit Klasse X im Feld.
export const EINTEILUNG={vDeg:2, elDeg:4, minLen:15};
export function einteilen(G, roh, w, h, proj, camTo, flipY, o={}){
  o={...EINTEILUNG, ...o};
  const V=G.vertVanish(proj, camTo, w, h, flipY), EL=Math.sin(o.elDeg*D2R), KL=G.KG.KL, n=roh.length;
  const seg=new Float32Array(n*G.KG.SEG), cls=new Int8Array(n), dir=new Float32Array(n*6);
  for(let i=0;i<n;i++){ const s=roh[i], L=Math.hypot(s.x2-s.x1, s.y2-s.y1), mx=(s.x1+s.x2)/2, my=(s.y1+s.y2)/2;
    const A=G.pixToNdc(s.x1, s.y1, w, h, flipY), B=G.pixToNdc(s.x2, s.y2, w, h, flipY), ra=G.ray(proj, camTo, A[0], A[1]), rb=G.ray(proj, camTo, B[0], B[1]);
    const vx=V ? V[0]-mx*V[2] : 0, vy=V ? V[1]-my*V[2] : 1, aV=Math.asin(Math.min(1, Math.abs((s.x2-s.x1)*vy-(s.y2-s.y1)*vx)/(L*Math.hypot(vx, vy))))*R2D;
    const ea=ra.d[1], eb=rb.d[1]; let k, psi=NaN;
    if(L<o.minLen) k=KL.X; else if(aV<o.vDeg) k=KL.V; else if(ea>EL && eb>EL) k=KL.O; else if(ea<-EL && eb<-EL) k=KL.U; else k=KL.X;
    if(k===KL.O || k===KL.U){ const d=ra.d, e=rb.d, nn=[d[1]*e[2]-d[2]*e[1], d[2]*e[0]-d[0]*e[2], d[0]*e[1]-d[1]*e[0]];
      psi=Math.atan2(-nn[0], nn[2]); psi=((psi%Math.PI)+Math.PI)%Math.PI; }
    seg.set([s.x1, s.y1, s.x2, s.y2, s.salience, 1, psi, Math.asin(Math.max(-1, Math.min(1, ea))), Math.asin(Math.max(-1, Math.min(1, eb))), L], i*G.KG.SEG);
    cls[i]=k; dir.set([...ra.d, ...rb.d], i*6); }
  return {n, seg, cls, dir, nTeile:new Uint8Array(n).fill(1)};
}
export const GIER={fachDeg:0.25, glattDeg:0.75, fensterDeg:3, minN:3};
const d4=(a,b)=>{ const q=Math.PI/2; let d=((a-b)%q+q)%q; return d>q/2 ? d-q : d; };
export function gier(G, b, o={}){
  o={...GIER, ...o};
  const S=G.KG.SEG, q=Math.PI/2, NB=Math.round(90/o.fachDeg), hst=new Float64Array(NB), idx=[];
  for(let i=0;i<b.n;i++) if(b.cls[i]===G.KG.KL.O || b.cls[i]===G.KG.KL.U){ const p=b.seg[i*S+6], wl=b.seg[i*S+9]; idx.push(i); hst[Math.floor(((p%q+q)%q)/q*NB)%NB]+=wl; }
  if(idx.length<o.minN) return null;
  const sg=o.glattDeg/o.fachDeg, R=Math.ceil(3*sg), gl=new Float64Array(NB);
  for(let j=0;j<NB;j++){ let s=0; for(let r=-R;r<=R;r++) s+=hst[(j+r+NB)%NB]*Math.exp(-r*r/(2*sg*sg)); gl[j]=s; }
  let jb=0; for(let j=1;j<NB;j++) if(gl[j]>gl[jb]) jb=j;
  const c0=(jb+0.5)/NB*q, win=o.fensterDeg*D2R; let sw=0, sr=0, n=0;
  for(const i of idx){ const r=d4(b.seg[i*S+6], c0); if(Math.abs(r)<win){ const wl=b.seg[i*S+9]; sw+=wl; sr+=wl*r; n++; } }
  if(n<o.minN) return null;
  const psi=((c0+sr/sw)%q+q)%q; let s2=0;
  for(const i of idx){ const r=d4(b.seg[i*S+6], psi); if(Math.abs(r)<win) s2+=b.seg[i*S+9]*r*r; }
  return {psi, sig:Math.sqrt(s2/sw)/Math.sqrt(n), n};
}
export function rechtwinklig(G, b, psi0, fensterDeg=6){
  const man=new Int8Array(b.n).fill(-1), S=G.KG.SEG; if(!psi0) return man;
  for(let i=0;i<b.n;i++){ const p=b.seg[i*S+6]; if(!Number.isFinite(p)) continue;
    let d=((p-psi0.psi)%Math.PI+Math.PI)%Math.PI, k=Math.round(d/(Math.PI/2)); const r=d-k*Math.PI/2; k%=2;
    if(Math.abs(r)<fensterDeg*D2R) man[i]=k; }
  return man;
}

// ------------------------------------------------ Sitzung
// sim(wahrheit, o) -> {posen: PoseZeile[], breaks, ereignisse, bilder: [{bildErg, wahr}], erfassungen: [{t, erf, wahr}],
//                      welt, abschnitte (wahr), schnitteWahr, opt, statistik}
//   wahr je Bild: {wand: Int16Array(n), seite: Int8Array(n), ring: Int8Array(n), ab, g (wahrer Versatz zur Bildzeit),
//                  ecke: Int16Array(n), kante: Int8Array(n), kid: Int32Array(n) (Index in welt.kanten, -1 Stoerkante), pp,
//                  senkKid, senkEcke (je senk-Eintrag)}
//   abschnitte[ab] = {ab, t0, t1, g (am Anfang, d = 0), T, knoten: [{t, d: [psi, tx, ty, tz]}] je Zeile (G.gBei gibt g_wahr),
//                     drift: Knoten des Erzeugers [{t, s, d, c}], start: Ereignisse}
export function sim(wahrheit=WAHRHEIT, o0={}){
  const G=o0.G || ladeG(), o={...DEF, ...o0, G:undefined};
  const KAM={...KAMERA, ...o.kamera}, RA={...RAUSCH, ...o.rausch}, ER={...ERFASSUNG, ...o.erfassung}, H=o.H, W=KAM.w, HH=KAM.h, PROJ=KAM.proj;
  const Fn=faelleNorm(o.faelle), WT=welt(wahrheit, {...o, G, faelleNorm:Fn}), Fl=WT.flaechen, KN=G.KG.KNOTEN;
  const seed=o.seed|0, rWeg=G.KG.rnd(mische(seed, 1, 0)), alpha0=rWeg()*ZWEIPI;
  const {proben, dicht}=wegAbtasten(WT.pfad, KAM, o.wiederholen), wp=wegPruefen(WT, dicht);
  if(wp.schlecht.length) WT.warnungen.push(`Weg: ${wp.schlecht.length} Punkte naeher als 0,25 m an einer Flaeche oder ausserhalb (min ${wp.dmin.toFixed(3)} m)`);
  const CAM=pr=>{ const t=pr.t, a=alpha0+KAM.yawRateDeg*D2R*t+KAM.yawAmp*Math.sin(t/3.1), th=(KAM.pitchDeg+KAM.pitchAmpDeg*Math.sin(t/1.7))*D2R;
    return kameraMatrix(pr.p, KAM.hCam+KAM.hAmp*Math.sin(t/2.3), a, th, KAM.rollAmpDeg*D2R*Math.sin(t/2.9)); };
  // ---- 1 Gliederung: Zeilen und Abschnitte (nur Zeiten, noch ohne Versatz)
  const evs=[...o.spruenge.map((x,i)=>({...SPRUNG, ...x, typ:'sprung', i})), ...o.tWechsel.map((x,i)=>({...TWECHSEL, ...x, typ:'twechsel', i}))].sort((a,b)=>a.t-b.t || (a.typ<b.typ ? -1 : 1));
  const secs=[{ab:0, start:[], rows:[]}], rows=[]; let ie=0, lueckeBis=-Infinity, warte=null;
  const neu=(e, tVerloren)=>{ const S=secs[secs.length-1]; if(S.rows.length) secs.push({ab:secs.length, start:[{...e, tVerloren}], rows:[]}); else S.start.push({...e, tVerloren}); };
  for(const pr of proben){
    while(ie<evs.length && evs[ie].t<=pr.t+1e-9){ const e=evs[ie++];
      if(e.luecke>0){ lueckeBis=Math.max(lueckeBis, e.t+e.luecke); warte=warte ? [...warte, e] : [e]; } else neu(e, null); }
    if(pr.t<lueckeBis-1e-9) continue;
    if(warte){ for(const e of warte) neu(e, e.t); warte=null; }
    const S=secs[secs.length-1], z={...pr, ab:S.ab, k:rows.length}; S.rows.push(z); rows.push(z); }
  if(warte) throw new Error('Luecke bis zum Ende der Sitzung');
  if(secs[0].start.length || rows.length && evs.some(e=>e.t<=rows[0].t+1e-9)) throw new Error('Ereignis vor oder an der ersten Zeile');
  if(ie<evs.length) WT.warnungen.push(`${evs.length-ie} Ereignis(se) nach der letzten Zeile (t > ${rows[rows.length-1].t} s) nicht angewandt`);
  // ---- 2 Versatz je Abschnitt: Anfang, Drift-Knoten, verschmierte Korrekturen; je Zeile g_wahr, camTo, Pose
  const DR=o.drift ? {...DRIFT, ...o.drift} : null;
  const dPar=DR && {f:DR.faktor, kP:DR.kP ?? KN.kP, kY:(DR.kPsiDeg ?? KN.kYDeg)*D2R, kH:DR.kH ?? KN.kH, sP0:DR.sP0 ?? KN.sP0, sY0:(DR.sPsi0Deg ?? KN.sY0Deg)*D2R,
    sH0:DR.sH0 ?? KN.sH0, dS:DR.dS ?? KN.dS, dT:DR.dT ?? KN.dT};
  const NULL={psi:0, tx:0, ty:0, tz:0}, interp=(K,t)=>{ if(!K || !K.length) return NULL; if(t<=K[0].t) return K[0].d; if(t>=K[K.length-1].t) return K[K.length-1].d;
    let lo=0, hi=K.length-1; while(hi-lo>1){ const m=(lo+hi)>>1; if(K[m].t<=t) lo=m; else hi=m; }
    const a=K[lo], b=K[hi], u=b.t>a.t ? (t-a.t)/(b.t-a.t) : 1; return {psi:a.d.psi+u*(b.d.psi-a.d.psi), tx:a.d.tx+u*(b.d.tx-a.d.tx), ty:a.d.ty+u*(b.d.ty-a.d.ty), tz:a.d.tz+u*(b.d.tz-a.d.tz)}; };
  const dGes=(S,t)=>{ let d=interp(S.drift, t); for(const v of S.schmier) d=G.gKomp(d, umPunkt(v.c, rampe(t, v.t, v.dauer)*v.psiDeg*D2R, [rampe(t, v.t, v.dauer)*v.dvec[0], rampe(t, v.t, v.dauer)*v.dvec[1]], rampe(t, v.t, v.dauer)*v.dy)); return d; };
  const gWahr=(S,t)=>G.gKomp(S.g, dGes(S, t));
  const breaks=[], ereignisse=[], schnitte=[], posen=[], abschnitte=[];
  for(const S of secs){
    const r0=S.rows[0]; if(!r0) throw new Error('leerer Abschnitt');
    const rAb=G.KG.rnd(mische(seed, 2, S.ab)), nAb=gauss(rAb);
    if(S.ab===0){ S.g={...o.g0}; S.T=[...o.T0]; }
    else { const P=secs[S.ab-1], C=CAM(r0); let g=gWahr(P, r0.t), T=[...P.T]; const gA=g, TA=T;
      for(const e of S.start){
        const cA3=G.gAnw(G.gInv(g), [C[12], C[13], C[14]]), cA=[cA3[0], cA3[2]];
        if(e.typ==='twechsel'){ const TB=[T[0]+e.psiDeg*D2R, T[1]+e.d*Math.cos(e.richtDeg*D2R), T[2]+e.dy, T[3]+e.d*Math.sin(e.richtDeg*D2R)];
          g=G.gKomp(g, G.gKomp(G.gInv(G.gAusT(T)), G.gAusT(TB))); T=TB; continue; }
        const K=umPunkt(cA, e.psiDeg*D2R, [e.d*Math.cos(e.richtDeg*D2R), e.d*Math.sin(e.richtDeg*D2R)], e.dy);
        if(o.hoehe && o.hoehe.sigma){ const z=o.hoehe.sigma*nAb(); K.ty+=o.hoehe.modell==='relativ' ? z : z-(g.ty+K.ty); }
        g=G.gKomp(g, K);
        if(e.dT) T=[T[0]+(e.dT.psiDeg||0)*D2R, T[1]+(e.dT.x||0), T[2]+(e.dT.y||0), T[3]+(e.dT.z||0)];
        if(e.lokal){ const pL3=G.gAnw(G.gAusT(T), G.gAnw(G.gInv(g), [C[12], C[13], C[14]])), l=e.lokal;
          T=T4(G.gKomp(umPunkt([pL3[0], pL3[2]], (l.psiDeg||0)*D2R, [(l.d||0)*Math.cos((l.richtDeg||0)*D2R), (l.d||0)*Math.sin((l.richtDeg||0)*D2R)], 0), G.gAusT(T))); } }
      S.g=g; S.T=T; S.dg=G.gKomp(G.gInv(gA), g); S.dT=T.map((v,i)=>v-TA[i]); }
    // Drift-Knoten des Erzeugers (Lage an der Kamera wie r_P der Folgekante, 3.2.3)
    S.drift=[{t:r0.t, s:r0.s, d:{...NULL}, c:null}];
    if(DR){ const rD=G.KG.rnd(mische(seed, 3, S.ab)), nD=gauss(rD), m=S.rows.length, gi=G.gInv(S.g);
      const rate=DR.modell==='linear' ? (DR.rate ? {p:DR.rate.p, psi:(DR.rate.psiDeg||0)*D2R, h:DR.rate.h||0} : {p:[dPar.f*dPar.kP*nD(), dPar.f*dPar.kP*nD()], psi:dPar.f*dPar.kY*nD(), h:dPar.f*dPar.kH*nD()}) : null;
      S.driftRate=rate;
      let last=S.drift[0];
      for(let i=1;i<m;i++){ const z=S.rows[i], ds=z.s-last.s, dtt=z.t-last.t;
        if(DR.modell==='zufallsweg' && !(ds>=dPar.dS-1e-9 || dtt>=dPar.dT-1e-9 || i===m-1)) continue;
        let dp, dpsi, dh;
        if(DR.modell==='zufallsweg'){ const sP=dPar.f*Math.hypot(dPar.sP0, dPar.kP*ds), sY=dPar.f*Math.hypot(dPar.sY0, dPar.kY*ds), sH=dPar.f*Math.hypot(dPar.sH0, dPar.kH*ds);
          dp=[sP*nD(), sP*nD()]; dpsi=sY*nD(); dh=sH*nD(); }
        else if(DR.modell==='linear'){ dp=[rate.p[0]*ds, rate.p[1]*ds]; dpsi=rate.psi*ds; dh=rate.h*ds; }
        else if(DR.modell==='brown'){ const w=Math.sqrt(Math.max(0, ds)); dp=[dPar.f*dPar.kP*w*nD(), dPar.f*dPar.kP*w*nD()]; dpsi=dPar.f*dPar.kY*w*nD(); dh=dPar.f*dPar.kH*w*nD(); }
        else throw new Error('Drift-Modell '+DR.modell);
        const Cz=CAM(z), q=G.gPlan(gi, [Cz[12], Cz[14]]), c=G.gPlan(G.gInv(last.d), [q[0]-dp[0], q[1]-dp[1]]), psi=last.d.psi+dpsi, cs=Math.cos(psi), sn=Math.sin(psi);
        last={t:z.t, s:z.s, d:{psi, tx:q[0]-(cs*c[0]-sn*c[1]), ty:last.d.ty+dh, tz:q[1]-(sn*c[0]+cs*c[1])}, c, r:{p:dp, psi:dpsi, h:dh, ds}};
        S.drift.push(last); } }
    // verschmierte Korrekturen in diesem Abschnitt (wirken nur bis zu seinem Ende)
    S.schmier=[];
    for(const v0 of o.verschmiert){ const v={...VERSCHMIERT, ...v0}; if(!(v.t>=r0.t-1e-9 && v.t<=S.rows[S.rows.length-1].t)) continue;
      const z=S.rows.find(x=>x.t>=v.t-1e-9), Cz=CAM(z), g=gWahr(S, v.t), c3=G.gAnw(G.gInv(g), [Cz[12], Cz[13], Cz[14]]);
      S.schmier.push({t:v.t, dauer:v.dauer, psiDeg:v.psiDeg, dvec:[v.d*Math.cos(v.richtDeg*D2R), v.d*Math.sin(v.richtDeg*D2R)], dy:v.dy, c:[c3[0], c3[2]]}); }
    // je Zeile
    for(const z of S.rows){ const C=CAM(z), d=dGes(S, z.t), g=G.gKomp(S.g, d), camTo=G.m4mul(G.gMat(G.gInv(g)), C), Pose=G.m4mul(G.gMat(G.gAusT(S.T)), camTo);
      z.C=C; z.g=g; z.d=d; z.camTo=camTo; z.Pose=Pose; z.T=S.T; }
    abschnitte.push({ab:S.ab, t0:r0.t, t1:S.rows[S.rows.length-1].t, g:S.g, T:S.T, knoten:S.rows.map(z=>({t:z.t, d:[z.d.psi, z.d.tx, z.d.ty, z.d.tz]})),
      drift:S.drift.map(k=>({t:k.t, s:k.s, d:[k.d.psi, k.d.tx, k.d.ty, k.d.tz], c:k.c, r:k.r})), driftRate:S.driftRate || null, schmier:S.schmier, start:S.start.map(e=>({...e})), nZeilen:S.rows.length}); }
  // Brueche, Ereignisse, Schnitte (wahr)
  for(const S of secs.slice(1)){ const r0=S.rows[0], rv=rows[r0.k-1], tMitte=Math.round((rv.t+r0.t)/2*1e6)/1e6;
    const lu=S.start.find(e=>e.luecke>0), tw=S.start.every(e=>e.typ==='twechsel'), dT=S.dT, dTxz=Math.hypot(dT[1], dT[3]), Tneu=dT.some(v=>Math.abs(v)>0);
    if(lu){ ereignisse.push({t:lu.tVerloren, type:'tracking-verloren'}, {t:r0.t, type:'tracking-zurück', luecke:Math.round((r0.t-lu.tVerloren)*1e6)/1e6});
      breaks.push({t:r0.t, grund:'pausiert'}); }
    else if(!tw && Tneu){ breaks.push({t:tMitte, grund:'anker-sprung', d:dTxz, dpsiDeg:dT[0]*R2D, nurProtokoll:true});
      ereignisse.push({t:tMitte, type:'anker-sprung', grund:'anker-sprung', d:dTxz, dpsiDeg:dT[0]*R2D, nurProtokoll:true}); }
    else if(!tw){ const a=rv.camTo, b=r0.camTo; ereignisse.push({t:r0.t, type:'pose-sprung', d:Math.hypot(b[12]-a[12], b[14]-a[14]), sim:true}); }
    for(const e of S.start) if(e.typ==='twechsel' && e.ereignis) ereignisse.push({t:r0.t, type:e.ereignis, grund:'t-wechsel', sim:true});
    schnitte.push({t:r0.t, tVor:rv.t, ab:S.ab, art:lu ? 'luecke' : tw ? 't-wechsel' : 'sprung', dg:S.dg, dT, start:S.start.map(e=>e.typ+'#'+e.i)}); }
  for(const e of o.ereignisse) ereignisse.push({...e});
  ereignisse.sort((a,b)=>a.t-b.t); breaks.sort((a,b)=>a.t-b.t);
  // Epochen (F2-Regel, karte/fixtures/lib.mjs epochen): +1 je Zeile mit geaendertem T oder Bruch seit der vorigen Zeile
  { const br=breaks.map(b=>b.t); let e=0, j=0; while(j<br.length && br[j]<=rows[0].t) j++;
    rows.forEach((z,i)=>{ if(i){ const a=rows[i-1]; let n=a.T.some((v,c)=>v!==z.T[c]); while(j<br.length && br[j]<=z.t){ if(br[j]>a.t) n=true; j++; } if(n) e++; } z.ep=e; }); }
  // PoseZeilen
  const rI=o.imu ? G.KG.rnd(mische(seed, 4, 0)) : null, nI=rI ? gauss(rI) : null;
  rows.forEach((z,i)=>{ const P=z.Pose, q=quatAus(P), zeile={t:z.t, ep:z.ep, pose:[P[12], P[13], P[14], ...q], T:[...z.T], cam:[z.camTo[12], z.camTo[13], z.camTo[14]], blick:G.blickPlan(z.camTo), flags:0, v:i};
    if(o.imu && i) zeile.imuPsi=wrap(G.blickPlan(z.C)-G.blickPlan(rows[i-1].C))+(o.imu.sigmaDeg||0)*D2R*nI();
    posen.push(zeile); });
  // Schnitt-Klasse nach der Regel 3.2.1 (Rest gegen konstante Geschwindigkeit aus den 2 vorigen Zeilen, Pose in local)
  for(const s of schnitte){ const i=rows.findIndex(z=>z.t===s.t), a=rows[i-2], b=rows[i-1], c=rows[i];
    if(a && b && c){ const f=(c.t-b.t)/(b.t-a.t), pr=[0,1,2].map(k=>b.Pose[12+k]+(b.Pose[12+k]-a.Pose[12+k])*f), yb=G.blickPlan(b.Pose), ya=G.blickPlan(a.Pose), yc=G.blickPlan(c.Pose);
      s.dt=c.t-b.t; s.rPose=Math.hypot(c.Pose[12]-pr[0], c.Pose[13]-pr[1], c.Pose[14]-pr[2]); s.rPsi=Math.abs(wrap(yc-(yb+wrap(yb-ya)*f)));
      s.tNeu=s.dT.some(v=>Math.abs(v)>0); s.klasse=s.dt>0.5 ? 'pause' : s.rPose<=0.02 && s.rPsi<=1*D2R ? 'nurT' : 'reloc'; } }
  // ---- 3 Bilder
  const pp=o.pp || [0, 0], bilder=[], erfassungen=[], KL=G.KG.KL;
  const st={segmente:0, klassen:[0,0,0,0], waendeGesehen:new Set(), eckenGesehen:new Set(), arten:{}, senk:0, erfassungen:0, kanteGesehen:new Set()};
  rows.forEach((z,v)=>{ if(v%o.bildJede) return;
    const C=z.C, camTo=z.camTo, Cp=[C[12], C[13], C[14]], K=kameraSicht(C, PROJ, pp, W, HH, o.flipY, KAM.zNear), rB=G.KG.rnd(mische(seed, 5, v)), nB=gauss(rB);
    const pix=X=>{ const c=K.clip(X), n=K.ndc(c); return {n, p:G.ndcToPix(n[0], n[1], W, HH, o.flipY)}; };
    const sicht=[];   // {E, ua, ub}
    for(const E of WT.kanten){ if(!kanteZeigt(E, Cp)) continue; for(const [ua,ub] of stuecke(E, K, Fl, RA.probePx)) sicht.push({E, ua, ub}); }
    const roh=[], wahr={wand:[], seite:[], ring:[], ecke:[], kante:[], kid:[]}, minL=RA.minLen+2*RA.kuerzPx, at=(E,u)=>E.A.map((x,c)=>x+u*(E.B[c]-x));
    const neuSeg=(a, b, E)=>{ const ex=b[0]-a[0], ey=b[1]-a[1], l=Math.hypot(ex, ey); if(l<minL) return; const ux=ex/l, uy=ey/l;
      const k1=RA.kuerzPx*rB(), k2=RA.kuerzPx*rB(), n1=RA.sigPx*nB(), n2=RA.sigPx*nB();
      roh.push({x1:a[0]+k1*ux-uy*n1, y1:a[1]+k1*uy+ux*n1, x2:b[0]-k2*ux-uy*n2, y2:b[1]-k2*uy+ux*n2, salience:l});
      const wd=E ? E.wand : -1, Wd=wd>=0 ? WT.waende[wd] : null;
      wahr.wand.push(wd); wahr.ring.push(E ? E.ring : -1); wahr.ecke.push(E ? E.ecke : -1); wahr.kante.push(E ? E.kante : 3); wahr.kid.push(E ? E.id : -1);
      wahr.seite.push(Wd ? (Wd.n[0]*Cp[0]+Wd.n[1]*Cp[2]-Wd.rho>0 ? 1 : -1) : 0); };
    for(const s of sicht){ let a=pix(at(s.E, s.ua)).p, b=pix(at(s.E, s.ub)).p;
      const zs=o.zerstueckeln; if(zs && rB()<zs.p){ const l=Math.hypot(b[0]-a[0], b[1]-a[1]), f=0.3+0.4*rB(), lu=(zs.luecke||[2,6]), gpx=lu[0]+(lu[1]-lu[0])*rB();
        if(f*l-gpx/2>=minL && (1-f)*l-gpx/2>=minL){ const ux=(b[0]-a[0])/l, uy=(b[1]-a[1])/l, m1=[a[0]+(f*l-gpx/2)*ux, a[1]+(f*l-gpx/2)*uy], m2=[a[0]+(f*l+gpx/2)*ux, a[1]+(f*l+gpx/2)*uy];
          neuSeg(a, m1, s.E); neuSeg(m2, b, s.E); continue; } }
      neuSeg(a, b, s.E); }
    if(o.stoer && o.stoer.n>0){ const L0=Math.exp(-o.stoer.n); let k=0, p=rB(); while(p>L0 && k<200){ k++; p*=rB(); }
      const lr=o.stoer.lenPx || [15, 60];
      for(let j=0;j<k;j++){ const c=[rB()*W, rB()*HH], an=rB()*Math.PI, l=lr[0]+(lr[1]-lr[0])*rB(), e=[Math.cos(an)*l/2, Math.sin(an)*l/2];
        const a=[Math.max(0, Math.min(W-1, c[0]-e[0])), Math.max(0, Math.min(HH-1, c[1]-e[1]))], b=[Math.max(0, Math.min(W-1, c[0]+e[0])), Math.max(0, Math.min(HH-1, c[1]+e[1]))];
        neuSeg(a, b, null); } }
    let b, psi0, man;
    if(o.m3==='G'){ const r=G.lmSegmente(roh, W, HH, PROJ, camTo, o.flipY); b={n:r.n, seg:r.seg, cls:r.cls, dir:r.dir, nTeile:new Uint8Array(r.n).fill(1), man:new Int8Array(r.n).fill(-1)};
      if(b.n!==roh.length) throw new Error('lmSegmente aendert die Zahl der Segmente');
      psi0=G.lmGier(b); man=(G.lmRechtwinklig(b, psi0) || b).man; }
    else { b=einteilen(G, roh, W, HH, PROJ, camTo, o.flipY); psi0=gier(G, b); man=rechtwinklig(G, b, psi0); }
    // Senkrechte (synthetisch, jedes 2. Bild wie live): sichtbare senkrechte Kanten mit oberem Ende im Bild
    let senk=null, senkKid=null, senkEcke=null;
    if(o.senk && v%2===0){ senk=[]; senkKid=[]; senkEcke=[];
      for(const s of sicht){ const E=s.E; if(E.kante!==2) continue; const oben=E.B[1]>=E.A[1] ? 1 : 0, uO=oben ? 1 : 0;
        if(Math.abs((oben ? s.ub : s.ua)-uO)>1e-9) continue;
        const T=pix(at(E, uO)), B=pix(at(E, oben ? s.ua : s.ub)), r=G.ray(PROJ, camTo, T.n[0], T.n[1]), nS=E.ebenen.filter(e=>vorn(e, Cp)).length;
        senk.push({top:T.n, bottom:B.n, z:20, len:Math.hypot(T.p[0]-B.p[0], T.p[1]-B.p[1]), kind:E.konkav ? 'ecke' : 'unten', grund:E.konkav ? 'konkav' : 'konvex', konkav:E.konkav,
          nSeiten:nS, seiten:[], rays:[], side:[], xr:null, sign:1, extra:{synthetisch:true, kid:E.id, ecke:E.ecke>=0 ? WT.ecken[E.ecke].id : null, art:E.art, top3:Math.max(E.A[1], E.B[1])}, ray:r});
        senkKid.push(E.id); senkEcke.push(E.ecke); }
      st.senk+=senk.length; }
    const bildErg={k:v, vi:v, t:z.t, ep:z.ep, camTo:Float64Array.from(camTo), proj:Float32Array.from(PROJ), flipY:!!o.flipY, w:W, h:HH, f:G.fokusPx(PROJ, HH), n:b.n,
      seg:b.seg, cls:b.cls, man, dir:b.dir, nTeile:b.nTeile, psi0, senk, ms:{luma:0, elsed:0, verschm:0, einteilen:0, senk:0, gesamt:0}};
    const w={wand:Int16Array.from(wahr.wand), seite:Int8Array.from(wahr.seite), ring:Int8Array.from(wahr.ring), ab:z.ab, g:{...z.g},
      ecke:Int16Array.from(wahr.ecke), kante:Int8Array.from(wahr.kante), kid:Int32Array.from(wahr.kid), pp:[...pp], senkKid, senkEcke};
    bilder.push({bildErg, wahr:w});
    for(let j=0;j<b.n;j++){ st.segmente++; st.klassen[b.cls[j]]++; const kid=wahr.kid[j]; if(kid<0) continue; const E=WT.kanten[kid]; st.kanteGesehen.add(kid);
      st.arten[E.art]=(st.arten[E.art]||0)+1; if(E.wand>=0 && E.kante<2) st.waendeGesehen.add(WT.waende[E.wand].id); if(E.ecke>=0) st.eckenGesehen.add(WT.ecken[E.ecke].id); }
    // Fadenkreuz-Erfassung: Deckenkante, die die Bildmitte (senkrechte Mittellinie) quert, Fenster +-fensterDeg in der Gier
    if(o.erfassungen && v%ER.jede===0){ let best=null;
      for(const s of sicht){ const E=s.E; if(E.kante!==0 || E.art==='geist') continue;
        const ca=K.clip(E.A), cb=K.clip(E.B), fa=ca[0]+K.dx*ca[3], fb=cb[0]+K.dx*cb[3]; if(fa===fb) continue; const um=fa/(fa-fb); if(!(um>=s.ua && um<=s.ub)) continue;
        const M=at(E, um), nM=pix(M).n; if(Math.abs(nM[1])>=0.9) continue; const dist=Math.hypot(M[0]-Cp[0], M[2]-Cp[2]); if(best && best.dist<=dist) continue;
        // Fenster: Plan-Strahlen unter alpha +- fensterDeg auf die Linie der Kante (u, falls vorn getroffen), im sichtbaren Stueck
        const al=G.blickPlan(C), fw=ER.fensterDeg*D2R, ex=E.B[0]-E.A[0], ez=E.B[2]-E.A[2];
        const uAuf=a=>{ const d=[Math.cos(a), Math.sin(a)], den=d[0]*ez-d[1]*ex; if(Math.abs(den)<1e-12) return null;
          const wx=E.A[0]-Cp[0], wz=E.A[2]-Cp[2]; return (wx*ez-wz*ex)/den>0 ? (wx*d[1]-wz*d[0])/den : null; };
        const u1=uAuf(al-fw), u2=uAuf(al+fw);
        let ua=s.ua, ub=s.ub; if(u1!=null && u2!=null){ ua=Math.max(ua, Math.min(u1, u2)); ub=Math.min(ub, Math.max(u1, u2)); }
        if(!(ua<um && um<ub)) continue;
        const A=at(E, ua), B=at(E, ub); if(Math.hypot(B[0]-A[0], B[2]-A[2])<ER.minLaenge) continue;
        best={dist, E, A, B}; }
      if(best){ const ray=X=>{ const n=pix(X).n; return G.ray(PROJ, camTo, n[0], n[1]); }, ra=ray(best.A), rb=ray(best.B);
        erfassungen.push({t:z.t, erf:{t:z.t, ep:z.ep, ra, rb, id:erfassungen.length}, wahr:{wand:best.E.wand, kid:best.E.id, art:best.E.art, ab:z.ab, g:{...z.g}}}); } } });
  st.erfassungen=erfassungen.length;
  const statistik={zeilen:rows.length, bilder:bilder.length, abschnitte:secs.length, epochen:rows.length ? rows[rows.length-1].ep+1 : 0, segmente:st.segmente, klassen:st.klassen,
    waendeGesehen:[...st.waendeGesehen].sort(), eckenGesehen:[...st.eckenGesehen].sort(), arten:st.arten, senk:st.senk, erfassungen:st.erfassungen,
    kantenGesehen:st.kanteGesehen.size, dauer:rows.length ? rows[rows.length-1].t : 0, weg:proben.length ? proben[proben.length-1].s : 0, wegAbstandMin:wp.dmin};
  const opt={...o, G:undefined}; delete opt.G;
  return {posen, breaks, ereignisse, bilder, erfassungen, welt:WT, abschnitte, schnitteWahr:schnitte, opt, statistik, warnungen:WT.warnungen};
}

// ------------------------------------------------ Ausgabe (JSONL wie F4)
// Zeilen in Zeitfolge: {typ:'pose', zeile}, {typ:'bruch', bruch}, {typ:'ereignis', ev}, {typ:'bild', bildErg, wahr}, {typ:'erfassung', erf, wahr}.
// Typed Arrays als Zahlenfelder; Float32-Werte mit 9 signifikanten Stellen (verlustfrei).
const f32=a=>Array.from(a, v=>Number.isFinite(v) ? Number(v.toPrecision(9)) : null);
const feld=a=>a==null ? a : Array.from(a);
export function alsZeilen(erg){
  const z=[];
  for(const p of erg.posen) z.push({t:p.t, o:0, x:{typ:'pose', zeile:p}});
  for(const b of erg.breaks) z.push({t:b.t, o:1, x:{typ:'bruch', bruch:b}});
  for(const e of erg.ereignisse) z.push({t:e.t, o:1, x:{typ:'ereignis', ev:e}});
  for(const {bildErg:B, wahr:w} of erg.bilder) z.push({t:B.t, o:2, x:{typ:'bild', bildErg:{...B, camTo:feld(B.camTo), proj:f32(B.proj), seg:f32(B.seg), cls:feld(B.cls), man:feld(B.man), dir:f32(B.dir), nTeile:feld(B.nTeile)},
    wahr:{...w, wand:feld(w.wand), seite:feld(w.seite), ring:feld(w.ring), ecke:feld(w.ecke), kante:feld(w.kante), kid:feld(w.kid)}}});
  for(const e of erg.erfassungen) z.push({t:e.t, o:3, x:{typ:'erfassung', erf:e.erf, wahr:e.wahr}});
  z.sort((a,b)=>a.t-b.t || a.o-b.o);
  return z.map(x=>x.x);
}
export function kopfAus(erg, extra={}){
  const W=erg.welt;
  return {erzeuger:'raumskizze-sim.mjs', version:VERSION, datum:new Date().toISOString(), node:process.version, module:modulQuellen(),
    architektur:'ARCHITEKTUR v3, 17.11 (T3)', opt:erg.opt, H:W.H, proj:KAMERA.proj, w:KAMERA.w, h:KAMERA.h,
    welt:{ringe:W.ringe, waende:W.waende.map(w=>w.id), ecken:W.ecken.map(e=>e.id), objekte:W.objekte, faelle:W.faelle, wahrheit:W.wahrheit,
      kanten:W.kanten.map(E=>({id:E.id, art:E.art, kante:E.kante, wand:E.wand, ecke:E.ecke, ring:E.ring, objekt:E.objekt, konkav:E.konkav, A:E.A, B:E.B}))},
    abschnitte:erg.abschnitte, schnitteWahr:erg.schnitteWahr, statistik:erg.statistik, warnungen:erg.warnungen,
    zeilenformat:'JSONL in Zeitfolge: {typ:pose, zeile: PoseZeile (+v)}, {typ:bruch, bruch}, {typ:ereignis, ev}, {typ:bild, bildErg (3.1), wahr}, {typ:erfassung, erf:{t, ep, ra, rb, id}, wahr}',
    ...extra};
}
export function schreibeJSONL(erg, datei, extra={}){
  const zeilen=[{kopf:kopfAus(erg, extra)}, ...alsZeilen(erg)];
  writeFileSync(datei, gzipSync(Buffer.from(zeilen.map(z=>JSON.stringify(z)).join('\n')+'\n'), {level:9}));
  return zeilen.length;
}

// ------------------------------------------------ Faelle fuer die Kommandozeile (F4 aus T3 und die Sonderfaelle)
export const SITZUNGEN={
  rund:{kamerapfad:'rund', seed:1}, unten:{kamerapfad:'unten', seed:2},
  sprung:{kamerapfad:'rund', seed:3, spruenge:[{t:35, d:0.40, richtDeg:30, psiDeg:10, dT:{psiDeg:5, x:0.30}}]},
  twechsel:{kamerapfad:'rund', seed:4, tWechsel:[{t:30, d:0.03, richtDeg:60}]},
  hoehe:{kamerapfad:'rund', seed:5, spruenge:[18, 36, 54, 72].map(t=>({t, luecke:0.7})), hoehe:{sigma:0.02}},
  pfeiler2:{kamerapfad:'unten', seed:6, faelle:[{pfeilerSeiten:'SW'}]}, pfeiler2g:{kamerapfad:'rund', seed:7, faelle:[{pfeilerSeiten:'WE'}]},
  pfeiler3:{kamerapfad:'unten', seed:8},
  tuer:{kamerapfad:'rund', seed:11, faelle:['tuer']}, durchgang:{kamerapfad:'rund', seed:12, faelle:['durchgang']},
  vorhang:{kamerapfad:'rund', seed:13, faelle:['vorhang']}, schrank:{kamerapfad:'rund', seed:14, faelle:['schrank']},
  unterzug:{kamerapfad:'rund', seed:15, faelle:['unterzug']}, unterzugEinseitig:{kamerapfad:'unten', seed:16, faelle:['unterzug']},
  pfeiler0:{kamerapfad:'rund', seed:17, faelle:[{pfeilerAbstand:0}]}, pfeiler3cm:{kamerapfad:'rund', seed:18, faelle:[{pfeilerAbstand:0.03}]},
  pfeiler8:{kamerapfad:'rund', seed:19, faelle:[{pfeilerAbstand:0.08}]}, gedreht:{kamerapfad:'rund', seed:20, faelle:[{inselGedreht:30}]},
  geist:{kamerapfad:'rund', seed:21, faelle:['geist']}, sw:{kamerapfad:'sw', seed:22},
  drift:{kamerapfad:'rund', seed:23, wiederholen:2, drift:{modell:'zufallsweg', faktor:1}}, drift2:{kamerapfad:'rund', seed:24, wiederholen:2, drift:{modell:'zufallsweg', faktor:2}},
  verschmiert:{kamerapfad:'rund', seed:25, verschmiert:[{t:40, d:0.20, richtDeg:0, dauer:2}]}, pp:{kamerapfad:'rund', seed:26, pp:[1, 1]},
  moebel:{kamerapfad:'rund', seed:27, moebel:'hoch'},
};
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]){
  const arg=k=>process.argv.slice(2).find(a=>a.startsWith('--'+k+'='))?.split('=').slice(1).join('=');
  const fall=arg('fall') || 'rund'; if(!SITZUNGEN[fall]) throw new Error('Fall '+fall+' (bekannt: '+Object.keys(SITZUNGEN).join(', ')+')');
  const o={...SITZUNGEN[fall], ...(arg('opt') ? JSON.parse(arg('opt')) : {})}, erg=sim(arg('wahrheit') || WAHRHEIT, o), S=erg.statistik;
  console.log(`T3 ${fall}: ${S.zeilen} Zeilen, ${S.bilder} Bilder, ${S.abschnitte} Abschnitte, ${S.epochen} Epochen, ${erg.breaks.length} Brueche, ${S.erfassungen} Erfassungen, `+
    `${S.segmente} Segmente (X/V/O/U ${S.klassen.join('/')}), Waende gesehen ${S.waendeGesehen.length}, Wegabstand min ${S.wegAbstandMin.toFixed(2)} m`);
  for(const w of erg.warnungen) console.log('  Warnung: '+w);
  if(arg('aus')) console.log(`  geschrieben: ${arg('aus')} (${schreibeJSONL(erg, arg('aus'), {fall})} Zeilen)`);
}
