// Prueft M5 raumskizze-landmarken.js (ARCHITEKTUR v3, 17.4; Abnahme 10.4 synthetisch): Datei und Einbau,
// Fehlermass gegen den Platzhalter von G.resSegment (Formel lm/hoehe.mjs), Vorhersage gegen die exakte
// Projektion, Zuordnung gegen Orakel-Landmarken, dann der ganze Weg von der leeren Karte auf F4 (Fixtures)
// und den T3-Sonderfaellen (Vorhang, Schrank, Unterzug, Tuer, Moebel) mit einem kleinen M10 (Stufen, Kern,
// Registrierung = wahres g) und einem kleinen M6 (Platzhalter G.lmAusgleich: g aus der Beilage wahr.g,
// Hoehen geschaetzt, je Wand (phi, rho) im Bild-Fehlermass, Ecken aus den Peilungen). Laedt vendor + geo
// von raumskizze-probe.html wie raumskizze-protokoll.mjs und fuegt M0 und M5 als eigene Bloecke ein.
// Nach der Abnahme dazu: Ergebnis nur aus KarteZustand (voller Lauf ohne Merklisten byte-gleich, Klon gegen Original),
// Vorfilter = volle Paarung, Strahlen-Verzeichnis = volle Rechnung, Hysterese ab 'kandidat', R3 an Orakel-Landmarken,
// Laufzeit 11.1 auf F1 A7; mit --m6 statt des Platzhalter-M6 das echte raumskizze-ausgleich.js (mit M4 zur Laufzeit).
//
//   node test/karte-landmarken.mjs [--schnell] [--m6]      (F4=ordner: Fixtures, T3=ordner: Sitzungen, RAUMSKIZZE_HTML=pfad)
//   import {laden, lauf, auswerten} from './karte-landmarken.mjs'   (Messskripte in design/bau/P-C)
import {readFileSync, existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import * as T2 from '../raumskizze-metrik.mjs';

const SP='/private/tmp/claude-501/-Volumes-external-TobiCodetEndlichWieder-Zaene/86e1205e-9d6d-494b-b0b6-88f6e01be4b0/scratchpad';
export const FIX=process.env.F4 || SP+'/karte/fixtures', T3DIR=process.env.T3 || SP+'/design/bau/T3/sitzungen';
const read=f=>readFileSync(new URL('../'+f, import.meta.url), 'utf8');
const D2R=Math.PI/180, R2D=180/Math.PI, H_LASER=2.416;
const wrap=a=>Math.atan2(Math.sin(a), Math.cos(a)), wrap2pi=a=>{ a%=2*Math.PI; return a<0 ? a+2*Math.PI : a; };
const q=(a,p)=>{ if(!a.length) return NaN; const s=[...a].sort((x,y)=>x-y); return s[Math.min(s.length-1, Math.floor(p*s.length))]; };
const median=a=>q(a, 0.5), cm=x=>Number.isFinite(x) ? (100*x).toFixed(1) : String(x), f2=x=>Number.isFinite(x) ? x.toFixed(2) : String(x);

// ------------------------------------------------- Laden
const MODULE=[['raumskizze-karte-grund.js', /G\.gBei=/], ['raumskizze-landmarken.js', /G\.lmVorhersage=/]];
// mit o.m6: dazu M4 (G.abschnittSigma zur Laufzeit von M6) und das echte M6 (G.resSegment, G.lmAusgleich) statt der Platzhalter
const MODULE_M6=[['raumskizze-abschnitte.js', /G\.abschnittSigma=/], ['raumskizze-ausgleich.js', /G\.lmAusgleich=/]];
export const DATEI='raumskizze-landmarken.js';
export function laden(o={}){
  const html=process.env.RAUMSKIZZE_HTML ? readFileSync(process.env.RAUMSKIZZE_HTML, 'utf8') : read('raumskizze-probe.html');
  const pick=id=>{ const m=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`)); if(!m) throw new Error(`Script-Block "${id}" nicht gefunden`); return m[1]; };
  const mark='globalThis.RAUMSKIZZE=G;'; let geo=pick('geo'); const quellen={};
  new Function('"use strict";\n'+pick('vendor')+'\n'+geo)(); const G0keys=new Set(Object.keys(globalThis.RAUMSKIZZE));
  for(const [f, re] of o.m6 ? [...MODULE, ...MODULE_M6] : MODULE){ const src=read(f); if(geo.includes('{\n'+src+'}\n') || re.test(geo)){ quellen[f]='Seite'; continue; }
    const at=geo.lastIndexOf(mark); geo=geo.slice(0, at)+'{\n'+src+'\n}\n'+geo.slice(at); quellen[f]='Datei'; }
  new Function('"use strict";\n'+pick('vendor')+'\n'+geo)();
  const G=globalThis.RAUMSKIZZE; delete globalThis.RAUMSKIZZE; if(!o.m6) G.resSegment=resSegmentMock(G);
  return {G, quellen, G0keys}; }
// Hoehe der Wand nach der Klasse von M5 (stoer -> eigene Zahl, hFrei.lokal -> 'lokal', zurueck auf 'c'): das echte M6 tut
// das nicht (offene Naht M5/M6, Bericht); der Test setzt es vor jedem Ausgleich, mit Platzhalter wie mit echtem M6.
export function hoehenUebergang(K, r){ const A=r>=0 ? K.abschnitte[r] : null, hR=r===-1 ? K.hC : A && A.hLok ? A.hLok.hC : null;
  for(const W of K.waende.values()){ if(W.rahmen!==r) continue;
    if(W.cls==='stoer' && W.hFrei && typeof W.h!=='number') W.h=W.hFrei.h;
    else if(W.hFrei && W.hFrei.lokal){ W.h='lokal'; W.hLokal={h:W.hFrei.h, lo:W.hFrei.lo, hi:W.hFrei.hi}; }
    else if(W.cls!=='stoer' && W.cls!=='unterzug' && typeof W.h==='number' && Number.isFinite(hR) && W.hFrei && Math.abs(W.hFrei.h-hR)<0.05){ W.h='c'; }
    else if(W.h==='lokal' && !(W.hFrei && W.hFrei.lokal)){ W.h='c'; W.hLokal=null; } } }
// echtes M6 im Lauf: Hoehenuebergang, dann G.lmAusgleich ohne Ketten (F4/T3 ohne Schnitte); Rueckgabe wie 4
export function ausgleichEcht(G, M6, K, o={}){ const r=o.nurAb==null ? -1 : o.nurAb; hoehenUebergang(K, r);
  return M6(K, {nurAb:o.nurAb ?? null, kette:false, laserH:K.H ? K.H.laser : null, iter:3}); }

// ------------------------------------------------- Platzhalter M6: G.resSegment nach lm/hoehe.mjs
// Ebene durch die Kamera, die die Linie L0 + s·u (Hoehe h) enthaelt: m = u × (L0 - c) / |.|, Rest f·asin(m·d).
const kreuz=(a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const hObenMock=(W,K)=>{ if(typeof W.h==='number') return W.h; if(W.h==='lokal' && W.hLokal) return W.hLokal.h;
  const A=W.rahmen>=0 ? K.abschnitte[W.rahmen] : null, r=W.rahmen===-1 ? K.hC : A && A.hLok ? A.hLok.hC : null;
  return Number.isFinite(r) ? r : W.hFrei ? W.hFrei.h : (K.H && K.H.laser) || 2.4; };
const hBeobMock=(b,W,K)=>b.art==='boden' ? (W.rahmen===-1 && Number.isFinite(K.hF) ? K.hF : 0) : hObenMock(W, K);
function resSegmentMock(G){ return (b,W,K)=>{ const A=K.abschnitte[b.ab], g=W.rahmen===-1 ? (A && G.gBei(A, b.t)) : W.rahmen===b.ab ? {psi:0, tx:0, ty:0, tz:0} : null; if(!g) return null;
  const cs=Math.cos(g.psi), sn=Math.sin(g.psi), rot=d=>[cs*d[0]-sn*d[2], d[1], sn*d[0]+cs*d[2]], c=G.gAnw(g, b.c), h=hBeobMock(b, W, K);
  const n=G.wandN(W.phi), u=G.wandU(W.phi), L0=[W.rho*n[0], h, W.rho*n[1]];
  let m=kreuz([u[0], 0, u[1]], [L0[0]-c[0], L0[1]-c[1], L0[2]-c[2]]); const l=Math.hypot(...m); m=m.map(x=>x/l);
  return [rot(b.da), rot(b.db)].map(d=>b.f*Math.asin(Math.max(-1, Math.min(1, m[0]*d[0]+m[1]*d[1]+m[2]*d[2])))); }; }

// ------------------------------------------------- Daten
const jsonl=f=>gunzipSync(readFileSync(f)).toString('utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
const nan=a=>a.map(v=>v===null ? NaN : v);
// Sitzung im Format F4/T3: {kopf, posen, breaks, ereignisse, bilder:[{bildErg, wahr}], erfassungen}
export function sitzungLaden(datei){ const Z=jsonl(datei), out={kopf:Z[0].kopf, posen:[], breaks:[], ereignisse:[], bilder:[], erfassungen:[]};
  for(const z of Z.slice(1)){ if(z.typ==='pose') out.posen.push(z.zeile); else if(z.typ==='bruch') out.breaks.push(z.bruch); else if(z.typ==='ereignis') out.ereignisse.push(z.ev);
    else if(z.typ==='bild'){ const b=z.bildErg; out.bilder.push({bildErg:{...b, camTo:Float64Array.from(b.camTo), proj:Float32Array.from(b.proj), seg:Float32Array.from(nan(b.seg)), cls:Int8Array.from(b.cls),
      man:Int8Array.from(b.man), dir:Float32Array.from(b.dir), nTeile:Uint8Array.from(b.nTeile)}, wahr:z.wahr}); }
    else if(z.typ==='erfassung') out.erfassungen.push(z); }
  return out; }
export const F4=f=>FIX+'/f4-'+f+'.jsonl.gz', T3=f=>T3DIR+'/t3-'+f+'.jsonl.gz';
// Wahrheitswaende der Sitzung (kopf.waende: F4 ids; T3: kopf.welt.waende) -> T2-Waende
export function wahrheitVon(S){ const TW=T2.wahrheitLaden(S.kopf.welt && S.kopf.welt.wahrheit ? S.kopf.welt.wahrheit : T2.WAHRHEIT), ids=(S.kopf.welt ? S.kopf.welt.waende : S.kopf.waende);
  const nach=new Map(TW.waende.map(w=>[w.ids.replace(/-/g, ''), w])); return {TW, wand:ids.map(id=>nach.get(id))}; }

// ------------------------------------------------- kleines M10 und M6 (Platzhalter)
const EINS={psi:0, tx:0, ty:0, tz:0};
const abschnittNeu=a=>({ab:a.ab, t0:a.t0, t1:a.t1, ep0:0, ep1:0, g0:{...a.g}, g:null, cov:null, knoten:null, hLok:null, sig:null, reg:null, stufe:'lokal', w:0,
  nBilder:0, nSchluessel:0, nBeob:0, mitWand:false, richtungen:null, psi0:null});
export function karteNeu(o={}){ return {opt:o, skala:1, hC:null, hF:0, sHC:null, sHF:null,   // Startwerte wie M10 (karteNeu)
   H:o.H ? {laser:o.H, sigma:0.015} : null, hoehen:{quelle:'parallaxe', q:0},
  posen:[], epoche:0, schnitte:[], abschnitte:[], kern:null, bilder:new Map(), warte:[], beob:[], waende:new Map(), ecken:new Map(), spuren:null,
  bloecke:new Map(), pp:{cx:0, cy:0, sig:1, frei:false}, ldl:null, tiefe:null, inselEntscheide:new Map(), umriss:null, runde:0, version:0, ms:{}}; }
// Anpassung (phi, rho[, h]) einer Wand im Bild-Fehlermass mit numerischer Jacobi ueber G.resSegment (Platzhalter)
function passeWand(G, K, W, B, frei){ let x=[W.phi, W.rho, typeof W.h==='number' ? W.h : null];
  const setz=y=>({...W, phi:y[0], rho:y[1], h:frei ? y[2] : W.h}), res=y=>{ const Wy=setz(y), r=[]; for(const b of B){ const v=G.resSegment(b, Wy, K); if(v) r.push(v[0]/b.sPx, v[1]/b.sPx); } return r; };
  const np=frei ? 3 : 2; let r0=res(x), c0=r0.reduce((s,v)=>s+v*v, 0);
  for(let it=0;it<6;it++){ const J=[]; for(let a=0;a<np;a++){ const y=[...x], e=a===0 ? 1e-6 : 1e-6; y[a]+=e; const ra=res(y); J.push(ra.map((v,i)=>(v-r0[i])/e)); }
    const N=Array.from({length:np}, ()=>new Array(np).fill(0)), g=new Array(np).fill(0);
    for(let i=0;i<r0.length;i++) for(let a=0;a<np;a++){ g[a]+=J[a][i]*r0[i]; for(let b=0;b<np;b++) N[a][b]+=J[a][i]*J[b][i]; }
    const dx=loeseN(N, g.map(v=>-v)); if(!dx) break; const y=x.map((v,i)=>i<np ? v+dx[i] : v), ry=res(y), cy=ry.reduce((s,v)=>s+v*v, 0);
    if(!(cy<=c0)) break; x=y; r0=ry; const st=Math.abs(dx[0])+Math.abs(dx[1]); c0=cy; if(st<1e-9) break; }
  // Kovarianz aus der Normalmatrix (phi, rho), Varianzfaktor >= 1
  const J=[]; for(let a=0;a<2;a++){ const y=[...x]; y[a]+=1e-6; J.push(res(y).map((v,i)=>(v-r0[i])/1e-6)); }
  let a=0, b=0, d=0; for(let i=0;i<r0.length;i++){ a+=J[0][i]*J[0][i]; b+=J[0][i]*J[1][i]; d+=J[1][i]*J[1][i]; }
  const s2=Math.max(1, c0/Math.max(1, r0.length-np)), det=a*d-b*b;
  return {x, cov:det>0 ? [d/det*s2, -b/det*s2, a/det*s2] : null}; }
function loeseN(N,b){ const n=b.length, A=N.map((r,i)=>[...r, b[i]]);
  for(let i=0;i<n;i++){ let p=i; for(let k=i+1;k<n;k++) if(Math.abs(A[k][i])>Math.abs(A[p][i])) p=k; if(!(Math.abs(A[p][i])>1e-300)) return null; [A[i], A[p]]=[A[p], A[i]];
    for(let k=i+1;k<n;k++){ const f=A[k][i]/A[i][i]; for(let j=i;j<=n;j++) A[k][j]-=f*A[i][j]; } }
  const x=new Array(n); for(let i=n-1;i>=0;i--){ let s=A[i][n]; for(let j=i+1;j<n;j++) s-=A[i][j]*x[j]; x[i]=s/A[i][i]; } return x; }
const FITN=new WeakMap();
// G.lmAusgleich-Platzhalter (4, M6): Hoehen (median der entschiedenen hFrei), h nach der Klasse von M5,
// (phi, rho) je Wand und Ecken-p je Ecke einzeln; g bleibt (aus der Wahrheit). Rueckgabe in der Form aus 4.
export function ausgleichMock(G, K, o={}){ const r=o.nurAb==null ? -1 : o.nurAb, A=r>=0 ? K.abschnitte[r] : null;
  if(o.hoehen==='fest'){ /* Hoehen bleiben, wie der Aufrufer sie gesetzt hat */ }
  else if(o.hoehen==='wahr'){ if(r===-1){ K.hC=H_LASER; K.hF=0; K.sHC=0.002; } else A.hLok={hC:H_LASER-(o.tyWahr ? o.tyWahr(r) : 0), sHC:0.002}; }
  else { const hs=[]; for(const W of K.waende.values()) if(W.rahmen===r && typeof W.h!=='number' && W.cls!=='stoer' && W.hFrei && (W.hFrei.hi-W.hFrei.lo)/2<0.03 && W.basis>=0.3 && !W.hFrei.rand) hs.push(W.hFrei.h);
    if(hs.length>=2){ const hm=median(hs.filter(h=>h>=Math.max(...hs)-0.15)); if(r===-1){ K.hC=hm; K.sHC=0.005; if(!Number.isFinite(K.hF)) K.hF=0; } else A.hLok={hC:hm, sHC:0.005}; } }
  // Boden h_f (nur global): Median der freien Bodenhoehe der Waende mit >= 10 Schluessel-Beob am Boden
  if(r===-1 && o.hoehen!=='wahr' && o.hoehen!=='fest'){ const hf=[]; for(const W of K.waende.values()){ if(W.rahmen!==-1 || W.cls!=='wand') continue; const Bf=W.beob.map(i=>K.beob[i]).filter(b=>b.schluessel && b.art==='boden');
      if(Bf.length<10) continue; const H=G.lmHoehe(Bf, K, {rahmen:-1, start:{phi:W.phi, rho:W.rho, h:Number.isFinite(K.hF) ? K.hF : 0}}); if(H && (H.hi-H.lo)/2<0.03 && !H.rand) hf.push(H.h); }
    if(hf.length>=2) K.hF=median(hf); }
  const hR=r===-1 ? K.hC : A && A.hLok ? A.hLok.hC : null; hoehenUebergang(K, r);
  for(const W of K.waende.values()){ if(W.rahmen!==r) continue;
    const B=W.beob.map(i=>K.beob[i]).filter(b=>b.schluessel && b.db), alt=FITN.get(W);
    if(B.length<3 || alt && alt.n===B.length && alt.hR===hR && alt.h===W.h && !o.alle) continue;
    const Bs=B.length>80 ? Array.from({length:80}, (_,j)=>B[Math.floor(j*B.length/80)]) : B;
    const F=passeWand(G, K, W, Bs, false); W.phi=wrap2pi(F.x[0]); W.rho=F.x[1]; W.cov=F.cov; FITN.set(W, {n:B.length, hR, h:W.h}); }
  // kurze Waende (< 1 m) zwischen zwei Ecken, die sie in E.waende fuehren: Linie durch beide Eckpunkte (wie M6 mit
  // p = X(La, Lb) und den Senkrechten als Beobachtung beider Waende, 4 M6/landmarken 3.4 (10)); Platzhalter.
  for(const W of K.waende.values()){ if(W.rahmen!==r || !W.iv || !W.iv.length) continue; const H=[Math.min(...W.iv.map(x=>x.s0)), Math.max(...W.iv.map(x=>x.s1))]; if(H[1]-H[0]>=1) continue;
    const Es=[...K.ecken.values()].filter(E=>E.rahmen===r && E.waende && E.waende.includes(W.id)); if(Es.length<2) continue;
    let best=null; for(let i=0;i<Es.length;i++) for(let j=i+1;j<Es.length;j++){ const d=Math.hypot(Es[i].p[0]-Es[j].p[0], Es[i].p[1]-Es[j].p[1]); if(d>=0.1 && (!best || d>best.d)) best={d, a:Es[i], b:Es[j]}; }
    if(!best) continue; const dir=Math.atan2(best.b.p[1]-best.a.p[1], best.b.p[0]-best.a.p[0]), k=[dir-Math.PI/2, dir+Math.PI/2].map(wrap2pi).sort((x,y)=>Math.abs(wrap(x-W.phi))-Math.abs(wrap(y-W.phi)))[0];
    if(Math.abs(wrap(k-W.phi))>10*D2R) continue; W.phi=k; W.rho=Math.cos(k)*(best.a.p[0]+best.b.p[0])/2+Math.sin(k)*(best.a.p[1]+best.b.p[1])/2; }
  for(const E of K.ecken.values()){ if(E.rahmen!==r) continue; let a=0, b=0, d=0, e=0, f=0, n=0;
    for(const id of E.beob){ const x=K.beob[id], g=r===-1 ? G.gBei(K.abschnitte[x.ab], x.t) : EINS; if(!g) continue; const c=G.gAnw(g, x.c), al=Math.atan2(x.da[2], x.da[0])+g.psi;
      const nx=-Math.sin(al), nz=Math.cos(al), rr=nx*c[0]+nz*c[2], dist=Math.hypot(E.p[0]-c[0], E.p[1]-c[2]), w=1/Math.pow(1.5/x.f*Math.max(0.3, dist), 2);
      a+=w*nx*nx; b+=w*nx*nz; d+=w*nz*nz; e+=w*nx*rr; f+=w*nz*rr; n++; }
    const det=a*d-b*b; if(n>=2 && det>1e-12){ E.p=[(d*e-b*f)/det, (a*f-b*e)/det]; E.cov=[d/det, -b/det, a/det]; } }
  return {chi2:0, iter:1, lin:0, relin:0, abgehaengt:0, cov:null, ok:true, stufen:{gier:false, lin:0, gn:1}, ldl:{n:0, nnzL:0, ordnung:'platzhalter'}, mm:[], rest:[]}; }
// Lokale Wand B_ab -> F0 (1.1): phi' = phi + psi, rho' = rho + n'·t, s' = s + u'·t (unabhaengig von M5 nachgerechnet)
function umgerechnet(G, W, g){ const phi=wrap2pi(W.phi+g.psi), n=G.wandN(phi), u=G.wandU(phi), b=u[0]*g.tx+u[1]*g.tz;
  return {id:W.id, phi, rho:W.rho+n[0]*g.tx+n[1]*g.tz, cls:W.cls, iv:(W.iv||[]).map(x=>[x.s0+b, x.s1+b]), rahmen:-1, nSchluessel:W.nSchluessel}; }
// Kern-Regel 1.3: >= 8 Schluesselbilder mit Beob an bestaetigten Landmarken auf >= 2 Wandrichtungen (>= 60°)
function kernBereit(K, ab){ const ks=new Set(), ph=[];
  for(const W of K.waende.values()){ if(W.rahmen!==ab || W.zustand!=='bestaetigt') continue; ph.push(W.phi); for(const i of W.beob){ const b=K.beob[i]; if(b.schluessel) ks.add(b.k); } }
  const zwei=ph.some(a=>ph.some(b=>Math.abs(Math.sin(a-b))>=Math.sin(60*D2R))); return ks.size>=8 && zwei; }
// Lauf durch eine Sitzung. o: {takt:0.5, regNach:3 (s lokal bis zur Registrierung), hoehen:'schaetzen'|'wahr', bis, protokoll,
// ohneMerk (lmHoehenklasse ohne Merkliste, lmDurchblick ohne Verzeichnis, lmEcken ohne Vorpruefung), pruefVoll (je Runde lmZusammenfuehren gegen die volle Paarung an einem Klon)}
export function lauf(G, S, o={}){ o={takt:0.5, regNach:3, regSpaet:8, regMinSchl:20, hoehen:'schaetzen', immerJe:4, ...o};
  const K=karteNeu({H:o.H ?? null}), KA=S.kopf.abschnitte, SW=S.kopf.schnitteWahr || [], gW=new Map(), tyW=new Map(), log={lokalGlobal:0, einbinden:[], kernT:null, ms:{zuordnen:[], aufnehmen:[], ecken:[], runde:[]}, wahr:new Map(), voll:{n:0, paare:0, anders:[], nD:0, dAnders:0}};
  K.abschnitte=KA.map(abschnittNeu);
  for(const a of KA){ gW.set(a.ab, a.g); tyW.set(a.ab, a.g.ty); }
  const klasse=ab=>{ if(!ab) return 'kern'; const s=SW.find(x=>x.ab===ab) || SW[ab-1]; return s ? (s.klasse || (s.art==='t-wechsel' ? 'nurT' : s.art==='luecke' ? 'pause' : 'reloc')) : 'reloc'; };
  // wahres g relativ zum Kern (F0 = B_kern); in F4/T3 hat der Kern hoechstens ty gegen den Wahrheitsrahmen
  const gRel=ab=>G.gKomp(G.gInv(gW.get(K.kern)), gW.get(ab));
  // Einbinden: vorher die lokalen Waende abbilden (Formel 1.1 im Test nachgerechnet), danach gegen M5 und die Wahrheit
  const verbinde=(ab,t)=>{ const A=K.abschnitte[ab]; A.g=gRel(ab); A.stufe='verbunden';
    const vor=[...K.waende.values()].filter(W=>W.rahmen===ab).map(W=>umgerechnet(G, W, A.g));
    const e=G.lmEinbinden(K, ab); G.lmNeuZuordnen(K, ab);
    let dM=0; for(const id of e.neu){ const W=K.waende.get(id), v=vor.find(x=>x.id===id); if(W && v) dM=Math.max(dM, Math.abs(wrap(W.phi-v.phi)), Math.abs(W.rho-v.rho)); }
    log.einbinden.push({ab, t, ...e, tyWahr:gW.get(ab).ty-gW.get(K.kern).ty, vor, dM}); };
  const aufAb=new Map(); let tR=o.takt, nR=0;
  const runde=t=>{ const t0=performance.now(); let tv=0; nR++;
    // 3 Kern
    if(K.kern==null){ for(const A of K.abschnitte) if(A.t0<=t && kernBereit(K, A.ab)){ K.kern=A.ab; A.g={...EINS}; A.stufe='verbunden'; G.lmAusgleich(K, {nurAb:A.ab, hoehen:o.hoehen, tyWahr:ab=>tyW.get(ab)});
        K.hC=A.hLok ? A.hLok.hC : NaN; K.hF=0; G.lmEinbinden(K, A.ab); G.lmNeuZuordnen(K, A.ab); log.kernT=t; break; } }
    // 4 Registrierung (Platzhalter): nurT an verbundenen Vorgaenger sofort, sonst nach regNach s und regMinSchl Schluessel-Beob
    if(K.kern!=null) for(const A of K.abschnitte){ if(A.stufe!=='lokal' || A.t0>t) continue; const vor=K.abschnitte[A.ab-1], kl=klasse(A.ab);
      const nS=aufAb.get(A.ab) || 0;
      if(kl==='nurT' && vor && vor.stufe==='verbunden') verbinde(A.ab, t);
      else if(A.ab!==K.kern && nS>=o.regMinSchl && (t-A.t0>=o.regNach && A.hLok || t-A.t0>=o.regSpaet)) verbinde(A.ab, t); }
    // 5 Ausgleich global und lokal
    G.lmAusgleich(K, {hoehen:o.hoehen, tyWahr:ab=>tyW.get(ab)-(K.kern!=null ? tyW.get(K.kern) : 0)});
    for(const A of K.abschnitte) if(A.stufe==='lokal' && A.t0<=t) G.lmAusgleich(K, {nurAb:A.ab, hoehen:o.hoehen, tyWahr:ab=>tyW.get(ab)});
    // 6 Neu-Zuordnen
    for(const A of K.abschnitte) if(A.t0<=t) G.lmNeuZuordnen(K, A.ab, {immer:nR%o.immerJe===0});
    // 7 Durchblick, Zusammenfuehren, Trennen, Intervalle, Hoehenklasse
    if(o.pruefVoll){ const v0=performance.now(); for(const W of [...K.waende.values()]){ const a=JSON.stringify(G.lmDurchblick(W, K, {voll:true})); log.voll.nD++; if(JSON.stringify(G.lmDurchblick(W, K))!==a) log.voll.dAnders++; } tv+=performance.now()-v0; }
    else for(const W of [...K.waende.values()]) G.lmDurchblick(W, K, o.ohneMerk ? {voll:true} : {});
    if(o.pruefVoll){ const v0=performance.now(), K2=structuredClone(K), b=G.lmZusammenfuehren(K2, {voll:true}).paare; tv+=performance.now()-v0; const a=G.lmZusammenfuehren(K).paare;
      const v1=performance.now(), wb=X=>JSON.stringify([...X.waende.values()].map(W=>[W.id, W.beob, W.iv])); log.voll.n++; log.voll.paare+=a.length;
      if(JSON.stringify(a)!==JSON.stringify(b) || wb(K)!==wb(K2)) log.voll.anders.push({t, a, b}); tv+=performance.now()-v1; }
    else G.lmZusammenfuehren(K);
    G.lmTrennen(K);
    for(const W of [...K.waende.values()]) G.lmIntervalle(W, K);
    for(const W of [...K.waende.values()]) G.lmHoehenklasse(W, K, o.ohneMerk ? {immer:true} : {});
    log.ms.runde.push(performance.now()-t0-tv); };
  for(const {bildErg:b, wahr:w} of S.bilder){ if(o.bis && b.t>o.bis) break;
    while(b.t>=tR){ runde(tR); tR+=o.takt; }
    const ab=w.ab, A=K.abschnitte[ab]; log.wahr.set(b.k, w);
    K.bilder.set(b.k, {t:b.t, ab, ep:b.ep, c:[b.camTo[12], b.camTo[13], b.camTo[14]], camTo:Array.from(b.camTo), f:b.f, schluessel:false});
    const nb=K.beob.length, t0=performance.now(), z=G.lmAufnehmen(K, b, {ab}), t1=performance.now(); G.lmEcken(b, K, o.ohneMerk ? {ab, voll:true} : {ab}); const t2=performance.now();
    log.ms.aufnehmen.push(t1-t0); log.ms.ecken.push(t2-t1);
    let nS=0; for(let i=nb;i<K.beob.length;i++) if(K.beob[i].schluessel && K.beob[i].art!=='ecke') nS++; aufAb.set(ab, (aufAb.get(ab)||0)+nS);
    // Atlas: solange der Abschnitt lokal ist, keine globale Landmarke mit seinen Beob
    if(A.stufe==='lokal') for(let i=nb;i<K.beob.length;i++){ const x=K.beob[i]; if(x.art==='ecke' ? (K.ecken.get(x.L)||{}).rahmen===-1 : (K.waende.get(x.L)||{}).rahmen===-1) log.lokalGlobal++; } }
  for(let i=0;i<4;i++){ runde(tR); tR+=o.takt; }
  return {K, log}; }

// ------------------------------------------------- Auswertung gegen die Wahrheit (F0 = Wahrheitsrahmen, ungespiegelt)
const T_EINS={m:false, r:0, tx:0, ty:0, s:1};
// F0 ist der Bezug des Kerns (1.3); liegt der Kern selbst gegen den Wahrheitsrahmen versetzt (twechsel: Kern Abschnitt 1,
// 3 cm), werden Waende und Ecken mit dessen wahrem g in den Wahrheitsrahmen gebracht (nur Auswertung).
export function auswerten(G, S, R){ const K0=R.K, {TW, wand:WW}=wahrheitVon(S), ivA=W=>(W.iv||[]).map(x=>[x.s0, x.s1]);
  const gk=K0.kern!=null && S.kopf.abschnitte[K0.kern] ? S.kopf.abschnitte[K0.kern].g : null, tr=!!(gk && (gk.psi || gk.tx || gk.tz));
  const umW=W=>{ if(!tr || W.rahmen!==-1) return W; const phi=wrap2pi(W.phi+gk.psi), n=G.wandN(phi), u=G.wandU(phi), b=u[0]*gk.tx+u[1]*gk.tz;
    return {...W, phi, rho:W.rho+n[0]*gk.tx+n[1]*gk.tz, iv:(W.iv||[]).map(x=>({...x, s0:x.s0+b, s1:x.s1+b}))}; };
  const K={...K0, waende:new Map([...K0.waende].map(([id,W])=>[id, umW(W)])), ecken:new Map([...K0.ecken].map(([id,E])=>[id, tr && E.rahmen===-1 ? {...E, p:G.gPlan(gk, E.p)} : E]))};
  const glob=[...K.waende.values()].filter(W=>W.rahmen===-1), E={waende:glob.map(W=>({id:W.id, phi:W.phi, rho:W.rho, cls:W.cls, iv:ivA(W), rahmen:-1}))};
  const M=T2.waendeMetrik(E, TW, T_EINS);
  // je Wahrheitswand: Landmarken 'wand', die sie treffen (Treffer wie T2), Lagefehler
  const jeWahr=new Map(TW.waende.map(w=>[w.ids, []]));
  for(const t of M ? M.treffer : []) for(const id of t.waende) jeWahr.get(id).push(t.id);
  const lage=[]; for(const t of M ? M.treffer : []){ if(t.waende.length!==1) continue; const W=K.waende.get(t.id), w=TW.waende.find(x=>x.ids===t.waende[0]);
    const H=(W.iv||[]).length ? [Math.min(...W.iv.map(x=>x.s0)), Math.max(...W.iv.map(x=>x.s1))] : [0, 0], sm=(H[0]+H[1])/2, n=G.wandN(W.phi), u=G.wandU(W.phi), p=[W.rho*n[0]+sm*u[0], W.rho*n[1]+sm*u[1]];
    lage.push({id:t.id, wahr:t.waende[0], cls:W.cls, dphi:wrap(W.phi-w.phi)*R2D, drho:w.n[0]*p[0]+w.n[1]*p[1]-w.rho, ring:w.ring}); }
  const wandL=glob.filter(W=>W.cls==='wand'), wandIds=new Set(wandL.map(W=>W.id));
  const einsEins=TW.waende.map(w=>({w:w.ids, ring:w.ring, n:jeWahr.get(w.ids).filter(id=>wandIds.has(id)).length, alle:jeWahr.get(w.ids).length}));
  const geister=glob.filter(W=>W.cls==='wand' && !(M ? M.treffer : []).some(t=>t.id===W.id)).map(W=>W.id);
  // Seiten: Beob einer Landmarke von Wahrheitswaenden mit entgegengesetzter Normale
  let seitenMisch=0; for(const W of glob){ const ns=new Set(); for(const i of W.beob){ const b=K.beob[i], w=R.log.wahr.get(b.k); if(!w || b.i<0) continue; const wd=w.wand[b.i]; if(wd>=0 && WW[wd]) ns.add(Math.round(WW[wd].phi*R2D/10)); }
    const L=[...ns]; if(L.some(a=>L.some(c=>Math.abs(wrap((a-c)*10*D2R))>90*D2R))) seitenMisch++; }
  // Ecken gegen Wahrheitsecken
  const P=Object.entries(TW.P), ecken=[...K.ecken.values()].filter(E=>E.rahmen===-1).map(E=>{ let b=null; for(const [id,p] of P){ const d=Math.hypot(E.p[0]-p[0], E.p[1]-p[1]); if(!b || d<b.d) b={id, d}; }
    return {id:E.id, wahr:b.id, d:b.d, senk:E.senk, top:E.top, nPeil:E.nPeil, art:E.art, waende:E.waende}; });
  return {M, jeWahr, lage, einsEins, geister, seitenMisch, ecken, hC:K.hC, nWand:wandL.length, nGlobal:glob.length}; }

// ================================================= Pruefungen
// chk: Selbsttest (muss gruen sein, bestimmt den Rueckgabewert); abn: Abnahme 10.4 synthetisch, gemessen und ehrlich
// gemeldet (ROT heisst: Kriterium nicht erreicht), bestimmt den Rueckgabewert nicht.
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]){
const SCHNELL=process.argv.includes('--schnell'), M6ECHT=process.argv.includes('--m6');
const {G, quellen, G0keys}=laden({m6:M6ECHT}); if(M6ECHT){ const M6=G.lmAusgleich; G.lmAusgleich=(K,o)=>ausgleichEcht(G, M6, K, o); } else G.lmAusgleich=(K,o)=>ausgleichMock(G, K, o);
if(M6ECHT) console.log('     (mit echtem M6: raumskizze-ausgleich.js, M4 zur Laufzeit; Platzhalter-Tests am Orakel bleiben auf G.resSegment von M6)');
let ok=true; const abnahme=[];
const zeile=(t)=>console.log(t);
const chk=(name,cond,info='')=>{ ok=ok&&!!cond; zeile((cond?'ok   ':'ROT  ')+name+(info!==''?'  ('+info+')':'')); };
const abn=(name,cond,info='')=>{ abnahme.push(!!cond); zeile((cond?'ok   ':'ROT  ')+'[Abnahme] '+name+(info!==''?'  ('+info+')':'')); };
const KL=G.KG.KL, SEG=G.KG.SEG;

// ------------------------------------------------- Datei und Einbau
{ const src=read(DATEI), NAMEN=['lmVorhersage','lmZuordnen','lmAufnehmen','lmSchluessel','lmSpuren','lmHoehe','lmDurchblick','lmZusammenfuehren','lmTrennen',
    'lmIntervalle','lmHoehenklasse','lmEcken','lmEinbinden','lmNeuZuordnen'], EXTRA=['lmBodenguete','lmSchrankVerdacht'];
  const Gs={}; let fehler=null; try{ new Function('G', '"use strict";\n'+src)(Gs); }catch(x){ fehler=x.message; }
  const neu=Object.keys(Gs).sort(), soll=[...NAMEN, ...EXTRA].sort();
  chk('Datei laedt allein (new Function, ohne geo-Kern und M0, also ohne Zugriff beim Laden) und haengt genau die 14 Namen aus 4 plus lmBodenguete, lmSchrankVerdacht an G',
    !fehler && JSON.stringify(neu)===JSON.stringify(soll), fehler || neu.length+' Namen');
  chk('keine Kollision mit Namen, die der geo-Block schon traegt', !soll.some(k=>G0keys.has(k)), JSON.stringify(quellen));
  chk('Datei endet mit genau einem Zeilenumbruch, kein import/export/</script>, keine aeusseren Klammern', /[^\n]\n$/.test(src) && !/^\s*(import|export)\s/m.test(src) && !src.includes('</script>') && !src.startsWith('{'));
  const ohne=src.replace(/\/\/.*$/gm, ''), verboten=[/Math\.random/, /Date\.now/, /performance\.now/, /\bwindow\b/, /\bdocument\b/, /\bself\b/].filter(r=>r.test(ohne));
  chk('kein Math.random, keine Uhr, kein DOM/Worker-Global im Code (2)', !verboten.length, verboten.map(String).join(' '));
  chk('atan2 nicht auf Matrixeintraege (1.2, Suche wie test/karte-grund.mjs)', !/atan2\s*\([^)]*\b(m|camTo|pose|T|M|mat)\s*\[\s*(0|2|8|10)\s*\]/.test(ohne)); }

// ------------------------------------------------- Orakel: Vorhersage, Fehlermass, Zuordnung (F4 rund, 24 Wahrheitswaende)
const orakelKarte=S=>{ const {wand:WW}=wahrheitVon(S), K=karteNeu({}); K.abschnitte=S.kopf.abschnitte.map(a=>({...abschnittNeu(a), g:{...a.g}, stufe:'verbunden'})); K.hC=H_LASER; K.hF=0;
  WW.forEach((w,i)=>K.waende.set(i, {id:i, rahmen:-1, phi:w.phi, rho:w.rho, cov:null, h:'c', hLokal:null, cls:'wand', beob:[], iv:[{s0:w.s0, s1:w.s1, n:1}], boden:[], durchblick:[], ecken:[], teile:[], abschnitte:[]}));
  return {K, WW}; };
if(!existsSync(F4('rund'))) chk('F4 vorhanden ('+FIX+')', false);
else {
  const S=sitzungLaden(F4('rund')), {K, WW}=orakelKarte(S);
  // Vorhersage gegen die exakte Projektion der wahren Kante (Bild 200, Waende mit Kamera auf der freien Seite)
  { let dmax=0, dpp=0, n=0, hinten=0, hintenOk=0; for(const nb of [100, 200, 300, 400, 500]){ const {bildErg:b, wahr:w}=S.bilder[nb], kam={k:b.k, t:b.t, ab:w.ab, camTo:b.camTo, proj:b.proj, w:b.w, h:b.h, flipY:b.flipY, f:b.f};
    const zuPix=(P,camTo)=>{ const q=G.project(b.proj, camTo, P); return q ? G.ndcToPix(q[0], q[1], b.w, b.h, b.flipY) : null; };
    const abst=(p,A,B)=>Math.abs((B[0]-A[0])*(p[1]-A[1])-(B[1]-A[1])*(p[0]-A[0]))/Math.hypot(B[0]-A[0], B[1]-A[1]);
    for(const W of K.waende.values()){ const V=G.lmVorhersage(W, kam, K); const c=[b.camTo[12], b.camTo[14]], wt=WW[W.id], g=w.g, gi=G.gInv(g);
      const sd=G.wandSeite(W, G.gPlan(g, c)); if(sd<=0.1){ hinten++; if(!V.sichtbar) hintenOk++; continue; } if(!V.sichtbar) continue;
      for(let j=0;j<=20;j++){ const s=wt.s0+j*(wt.s1-wt.s0)/20, p=[wt.rho*Math.cos(wt.phi)-s*Math.sin(wt.phi), wt.rho*Math.sin(wt.phi)+s*Math.cos(wt.phi)], P=G.gAnw(gi, [p[0], H_LASER, p[1]]), q=zuPix(P, b.camTo);
        const Pc=G.m4vec(G.m4inv(b.camTo), [...P, 1]); if(q && Pc[2]<-0.3 && q[0]>-300 && q[0]<600 && q[1]>-300 && q[1]<950){ dmax=Math.max(dmax, abst(q, V.A, V.B)); n++; } } }
    if(nb!==200) continue;
    K.pp={cx:1.5, cy:-2, sig:1, frei:false};
    for(const W of K.waende.values()){ const V=G.lmVorhersage(W, kam, K); if(!V.sichtbar) continue; const V0=(K.pp={cx:0, cy:0}, G.lmVorhersage(W, kam, K)); K.pp={cx:1.5, cy:-2};
      dpp=Math.max(dpp, abst([V0.A[0]+1.5, V0.A[1]-2], V.A, V.B), abst([V0.B[0]+1.5, V0.B[1]-2], V.A, V.B)); }
    K.pp={cx:0, cy:0, sig:1, frei:false}; }
    chk('lmVorhersage: Bildlinie trifft die Projektion der wahren Kante (exakte Pose, 5 Bilder)', n>=20 && dmax<1e-6, `${n} Punkte vor der Kamera, max ${dmax.toExponential(1)} px`);
    chk('lmVorhersage: Kamera auf der Rueckseite -> nicht sichtbar (Raumseite hart, 1.1)', hinten>0 && hintenOk===hinten, `${hintenOk}/${hinten}`);
    chk('lmVorhersage: Hauptpunkt karte.pp verschiebt die vorhergesagten Pixel um (cx, cy) im NDC-Sinn (flipY false)', dpp<1e-6, dpp.toExponential(1)+' px'); }
  // psi des Segments gegen phi der Wahrheitswand im Bildbezug, Fehlermass gegen den Platzhalter G.resSegment, Zuordnung
  let n=0, rich=0, falsch=0, gegen=0, frei=0, mehr=0, dchi=0, nchi=0; const psiF=[], conf=new Map(); const t0=performance.now();
  for(const {bildErg:b, wahr:w} of S.bilder){ K.bilder.set(b.k, {t:b.t, ab:w.ab, ep:b.ep, c:[b.camTo[12], b.camTo[13], b.camTo[14]], camTo:Array.from(b.camTo), f:b.f});
    const Z=G.lmZuordnen(b, K, {ab:w.ab}), zu=new Map(Z.paare.map(p=>[p.i, p]));
    for(let i=0;i<b.n;i++){ if(b.cls[i]!==KL.O && b.cls[i]!==KL.U) continue; const wd=w.wand[i]; if(wd<0) continue; n++;
      const phiB=WW[wd].phi-w.g.psi, d=((b.seg[i*SEG+6]-(phiB+Math.PI/2))%Math.PI+1.5*Math.PI)%Math.PI-Math.PI/2; psiF.push(d*R2D);
      const p=zu.get(i); if(!p){ if(Z.mehrdeutig.includes(i)) mehr++; else frei++; continue; }
      if(p.L===wd) rich++; else { falsch++; const k=S.kopf.waende[wd]+'->'+S.kopf.waende[p.L]; conf.set(k, (conf.get(k)||0)+1); if(Math.cos(WW[p.L].phi-WW[wd].phi)<0) gegen++; }
      const D=b.dir, bb={k:b.k, t:b.t, ab:w.ab, c:[b.camTo[12], b.camTo[13], b.camTo[14]], da:[D[6*i], D[6*i+1], D[6*i+2]], db:[D[6*i+3], D[6*i+4], D[6*i+5]], f:b.f, art:p.art, sPx:Math.max(1, b.seg[i*SEG+5])};
      const r=G.resSegment(bb, K.waende.get(p.L), K), chi=(r[0]*r[0]+r[1]*r[1])/(bb.sPx*bb.sPx); dchi=Math.max(dchi, Math.abs(chi-p.chi2)/Math.max(1, chi)); nchi++; } }
  const ms=(performance.now()-t0)/S.bilder.length, nurMQ=[...conf.keys()].every(k=>k==='M-N->Q-A' || k==='Q-A->M-N' || k==='MN->QA' || k==='QA->MN');
  chk('psi (M3) - (phi_B + 90°) im Bildbezug: |Median| < 0,1° (Gier-Konvention 1.2 zwischen M3 und M5)', Math.abs(median(psiF))<0.1, `Median ${median(psiF).toFixed(3)}°, |.| 90 % ${q(psiF.map(Math.abs), 0.9).toFixed(2)}°`);
  chk('Fehlermass M5 = G.resSegment-Platzhalter (lm/hoehe.mjs): χ² der Paare gleich (ohne Band: cov null, sig null)', nchi>1000 && dchi<1e-9, `${nchi} Paare, rel. max ${dchi.toExponential(1)}`);
  chk('Orakel-Zuordnung F4 rund: >= 97 % richtig, 0 Gegenflaechen, Verwechslungen nur M-N <-> Q-A (Luecke 0,31 m < gapZu)', rich/n>=0.97 && gegen===0 && nurMQ,
    `${n} Wandsegmente: richtig ${(100*rich/n).toFixed(1)} %, falsch ${falsch} (${[...conf].map(([k,v])=>k+' '+v).join(', ')}), frei ${frei}, mehrdeutig ${mehr}`);
  abn('Zuordnen <= 2 ms je Bild (Mac, 10.4)', ms<=2, `${ms.toFixed(3)} ms je Bild bei 24 Landmarken (F4 rund)`);
  // Hoehe einer Linie: lmHoehe auf den Beob einer Wahrheitswand
  { const W=K.waende.get(S.kopf.waende.indexOf('LM')); const B=[]; for(const {bildErg:b, wahr:w} of S.bilder) for(let i=0;i<b.n;i++) if(w.wand[i]===W.id && w.kante[i]===0 && b.cls[i]===KL.O){ const D=b.dir;
      B.push({k:b.k, t:b.t, ab:w.ab, c:[b.camTo[12], b.camTo[13], b.camTo[14]], da:[D[6*i], D[6*i+1], D[6*i+2]], db:[D[6*i+3], D[6*i+4], D[6*i+5]], f:b.f, sPx:1, len:b.seg[i*SEG+9], art:'decke', L:W.id}); }
    const H=G.lmHoehe(B, K, {rahmen:-1}), d=H ? Math.hypot(Math.cos(H.phi)-Math.cos(W.phi), Math.sin(H.phi)-Math.sin(W.phi)) : 1;
    chk('lmHoehe (Profil wie lm/hoehe.mjs) auf L-M (alle Deckensegmente, σ 1 px): h auf 1 cm, Halbbreite <= 1 cm, Linie auf 1 cm / 0,1°', H && Math.abs(H.h-H_LASER)<0.01 && (H.hi-H.lo)/2<=0.01 && Math.abs(H.rho-W.rho)<0.01 && d<0.1*D2R,
      H ? `${B.length} Beob, h ${H.h.toFixed(4)} [${H.lo.toFixed(4)}, ${H.hi.toFixed(4)}], rho ${H.rho.toFixed(4)} (wahr ${W.rho.toFixed(4)}), rms ${H.rms.toFixed(2)} px` : 'null'); }
}

// ------------------------------------------------- Stuetzstellen (v3, 3.2.3): Vorhersage ueber G.gBei, Neu-Zuordnen bei Knotenaenderung
if(existsSync(T3('drift'))){ const S=sitzungLaden(T3('drift')), zaehle=mitKnoten=>{ const {K}=orakelKarte(S); for(const A of K.abschnitte) A.knoten=mitKnoten ? S.kopf.abschnitte[A.ab].knoten : null;
    let n=0, r=0; for(const {bildErg:b, wahr:w} of S.bilder){ K.bilder.set(b.k, {t:b.t, ab:w.ab, ep:b.ep, c:[b.camTo[12], b.camTo[13], b.camTo[14]], camTo:Array.from(b.camTo), f:b.f});
      const zu=new Map(G.lmZuordnen(b, K, {ab:w.ab}).paare.map(p=>[p.i, p.L])); for(let i=0;i<b.n;i++){ if((b.cls[i]!==KL.O && b.cls[i]!==KL.U) || w.wand[i]<0) continue; n++; if(zu.get(i)===w.wand[i]) r++; } }
    return {n, r, K}; };
  const mit=zaehle(true), ohne=zaehle(false);
  chk('Knoten: Vorhersage geht ueber G.gBei (t3-drift, Zufallsweg-Drift, Knoten je Zeile in KarteStand-Form): mit Knoten >= 97 % richtig, ohne deutlich weniger',
    mit.r/mit.n>=0.97 && ohne.r/ohne.n<mit.r/mit.n-0.05, `mit ${(100*mit.r/mit.n).toFixed(1)} %, ohne ${(100*ohne.r/ohne.n).toFixed(1)} % (${mit.n} Wandsegmente)`);
  // Ausloeser: Abschnitt-Form {t, s, d: Float64Array}; Knoten 5 cm bzw. 1 cm verschieben
  const {K}=orakelKarte(S), A=K.abschnitte[0], kn=S.kopf.abschnitte[0].knoten.filter((_,j)=>j%150===0);
  A.knoten={t:Float64Array.from(kn.map(x=>x.t)), s:new Float64Array(kn.length), d:Float64Array.from(kn.flatMap(x=>x.d)), cov:null};
  for(const {bildErg:b, wahr:w} of S.bilder.slice(0, 300)){ K.bilder.set(b.k, {t:b.t, ab:w.ab, ep:b.ep, c:[b.camTo[12], b.camTo[13], b.camTo[14]], camTo:Array.from(b.camTo), f:b.f}); G.lmAufnehmen(K, b, {ab:w.ab}); }
  const lauft=()=>{ const vor=K.spuren.zuord[0]; G.lmNeuZuordnen(K, 0); return K.spuren.zuord[0]!==vor; };
  const r0=lauft(); A.knoten.d[4*2+1]+=0.01; const r1=lauft(); A.knoten.d[4*2+1]+=0.04; const r2=lauft(); const r3=lauft(); A.knoten.d[4*3]+=0.5*D2R; const r4=lauft();
  chk('lmNeuZuordnen: ohne Aenderung kein Neu-Zuordnen, Knoten +1 cm nicht, +5 cm ja, danach Ruhe, Knoten-Gier +0,5° ja (dP 2 cm, dPsi 0,3°)', !r0 && !r1 && r2 && !r3 && r4,
    `${[r0, r1, r2, r3, r4].map(x=>x ? 'ja' : 'nein').join(', ')}; ${kn.length} Knoten`); }

// ------------------------------------------------- ganzer Weg auf F4 (leere Karte, kleines M10/M6)
const FAELLE=SCHNELL ? ['rund', 'sprung'] : ['rund', 'unten', 'sprung', 'twechsel', 'hoehe', 'pfeiler2', 'pfeiler2g', 'pfeiler3'];
const ERG={};
for(const fall of FAELLE){ if(!existsSync(F4(fall))) continue; const S=sitzungLaden(F4(fall)), R=lauf(G, S, {pruefVoll:true}), A=auswerten(G, S, R); ERG[fall]={S, R, A}; }
const zf=A=>`${A.einsEins.filter(x=>x.n===1).length}/24 1:1 als wand, T2 gefunden ${A.M ? A.M.gefunden : 0}, Praezision ${A.M && A.M.praezision!=null ? A.M.praezision.toFixed(2) : '-'}`;
for(const [fall, {S, R, A}] of Object.entries(ERG)){ const K=R.K;
  chk(`${fall}: Kern gebildet (1.3), keine Ausnahme, Beob ${K.beob.length}`, K.kern!=null, `Kern ${K.kern} bei ${R.log.kernT} s, ${A.nGlobal} globale Landmarken, ${A.ecken.length} Ecken`);
  chk(`${fall}: 0 Zusammenfuehrungen ueber Ringe (T2 ringUebergreifend) und 0 ueber Raumseiten (Beob einer Landmarke von Gegenflaechen)`, A.M && A.M.ringUebergreifend===0 && A.seitenMisch===0,
    `n:1 ${JSON.stringify(A.M ? A.M.n1.map(x=>x.waende) : [])}`);
  chk(`${fall}: Atlas - solange ein Abschnitt lokal ist, landet keine seiner Beob an einer globalen Landmarke`, R.log.lokalGlobal===0, R.log.lokalGlobal);
  chk(`${fall}: lmZusammenfuehren mit Vorfilter = volle Paarung (o.voll) in jeder Runde (Regel 3.3 ohne Luecke)`, R.log.voll.n>0 && !R.log.voll.anders.length,
    `${R.log.voll.n} Runden, ${R.log.voll.paare} Paare; verschieden ${R.log.voll.anders.length}${R.log.voll.anders.length ? ' ab t '+R.log.voll.anders[0].t : ''}`);
  chk(`${fall}: lmDurchblick mit Strahlen-Verzeichnis = volle Rechnung (o.voll) fuer jede Landmarke in jeder Runde`, R.log.voll.nD>0 && !R.log.voll.dAnders, `${R.log.voll.nD} Aufrufe, verschieden ${R.log.voll.dAnders}`); }
// 10.4 synthetisch auf rund
if(ERG.rund){ const {A}=ERG.rund, Lw=A.lage.filter(x=>x.cls==='wand'), fehl=A.einsEins.filter(x=>x.n!==1);
  abn('rund: 24 von 24 echten Waenden als wand, 1:1, richtige Seite', fehl.length===0, zf(A)+'; nicht 1:1: '+fehl.map(x=>x.w+' '+x.n+'/'+x.alle).join(', '));
  const sR=Lw.filter(x=>Math.abs(x.drho)>0.01), sP=Lw.filter(x=>Math.abs(x.dphi)>0.5);
  abn(`rund: |Δrho| <= 1 cm und |Δphi| <= 0,5° je 1:1-Landmarke (mit ${M6ECHT ? 'echtem M6' : 'Platzhalter-M6'})`, !sR.length && !sP.length,
    `${Lw.length} Landmarken: |Δrho| Median ${cm(median(Lw.map(x=>Math.abs(x.drho))))} cm, max ${cm(Math.max(...Lw.map(x=>Math.abs(x.drho))))} cm; |Δphi| Median ${median(Lw.map(x=>Math.abs(x.dphi))).toFixed(2)}°, max ${Math.max(...Lw.map(x=>Math.abs(x.dphi))).toFixed(2)}° (${sP.map(x=>x.wahr+' '+x.dphi.toFixed(2)+'°').join(', ')})`);
  const insel=A.einsEins.filter(x=>x.ring>0), inselOk=insel.filter(x=>x.n===1);
  abn('rund: alle 10 Inselwaende als wand', inselOk.length===10, `${inselOk.length}/10; fehlen ${insel.filter(x=>x.n!==1).map(x=>x.w).join(', ')}`);
  const kurz=['Z','AA','G','H','X','Y'].map(id=>({id, e:A.ecken.find(e=>e.wahr===id && e.d<=0.05 && e.senk && Math.abs(e.top-H_LASER)<=0.05)}));
  abn('rund: Z-AA, H-G, X-Y je als zwei Ecken mit senk, top auf Deckenhoehe ±5 cm', kurz.every(x=>x.e), kurz.map(x=>x.id+(x.e ? ` ${cm(x.e.d)} cm top ${x.e.top.toFixed(3)} waende ${JSON.stringify(x.e.waende)}` : ' fehlt')).join('; '));
  const gut=A.ecken.filter(e=>e.d<=0.10), geist=A.ecken.filter(e=>e.d>0.10);
  abn('rund: Ecken <= 2 cm (an einer wahren Ecke <= 10 cm zugeordnet), 0 falsche Ecken', gut.every(e=>e.d<=0.02) && !geist.length,
    `${gut.length} Ecken, Median ${cm(median(gut.map(e=>e.d)))} cm, max ${cm(Math.max(...gut.map(e=>e.d)))} cm; falsch ${geist.length}; wahre Ecken gefunden ${new Set(gut.map(e=>e.wahr)).size}/30`);
  abn('rund: Geisterwaende (wand ohne Wahrheit) 0', !A.geister.length, A.geister.join(',')); }
// Atlas (sprung 40 cm / 10°)
if(ERG.sprung){ const {S, R, A}=ERG.sprung, {TW}=wahrheitVon(S), E=R.log.einbinden.find(e=>e.ab===1);
  if(!E) abn('sprung: Abschnitt 1 eingebunden', false);
  else { const M=T2.waendeMetrik({waende:E.vor.filter(v=>v.iv.length)}, TW, T_EINS), res=[];
    for(const t of M ? M.treffer : []){ if(t.waende.length!==1) continue; const v=E.vor.find(x=>x.id===t.id), w=TW.waende.find(x=>x.ids===t.waende[0]), H=[Math.min(...v.iv.map(x=>x[0])), Math.max(...v.iv.map(x=>x[1]))], sm=(H[0]+H[1])/2;
      const p=[v.rho*Math.cos(v.phi)-sm*Math.sin(v.phi), v.rho*Math.sin(v.phi)+sm*Math.cos(v.phi)]; res.push({w:t.waende[0], drho:w.n[0]*p[0]+w.n[1]*p[1]-w.rho, dphi:wrap(v.phi-w.phi)*R2D}); }
    chk('sprung: lmEinbinden rechnet lokale Waende wie 1.1 nach F0 (gegen die Formel im Test)', E.dM<1e-9, E.dM.toExponential(1));
    abn('sprung: nach dem Einbinden Rest <= 2 cm / 0,3° (lokale Landmarken mit g nach F0 gegen die Wahrheit)', res.length>0 && res.every(x=>Math.abs(x.drho)<=0.02 && Math.abs(x.dphi)<=0.3),
      `${E.vor.length} lokale Landmarken, ${res.length} mit Wahrheitswand: ${res.map(x=>`${x.w} ${cm(x.drho)} cm ${x.dphi.toFixed(2)}°`).join(', ')}; zusammengefuehrt ${E.zusammen.length}`);
    abn('sprung: 0 Geisterwaende am Ende', !A.geister.length, A.geister.join(',')); } }
// Hoehe je Abschnitt (hoehe: ty ~ N(0, 2 cm)): Deckenhoehe je Abschnitt im eigenen Bezug aus lmHoehe ueber die gut gesehenen Waende
if(ERG.hoehe){ const {S, R}=ERG.hoehe, K=R.K, tyW=S.kopf.abschnitte.map(a=>a.g.ty), kern=K.kern, out=[];
  for(const A of K.abschnitte){ const hs=[];
    for(const W of K.waende.values()){ if(W.rahmen!==-1 || W.cls!=='wand') continue; const B=W.beob.map(i=>K.beob[i]).filter(b=>b.ab===A.ab && b.schluessel && b.art==='decke'); if(B.length<8) continue;
      const H=G.lmHoehe(B, K, {rahmen:A.ab}); if(H && (H.hi-H.lo)/2<=0.02 && !H.rand) hs.push(H.h); }
    if(hs.length) out.push({ab:A.ab, n:hs.length, d:(K.hC-median(hs))-(A.g ? A.g.ty : NaN), wahr:tyW[A.ab]-tyW[kern], g:A.g ? A.g.ty : NaN, hB:median(hs)}); }
  abn('hoehe: |ty - ty_wahr| <= 1 cm je Abschnitt (ty = h_c - Deckenhoehe im Bezug aus lmHoehe; σ 2 cm Hoehenversatz)', out.length===K.abschnitte.length && out.every(x=>Math.abs(x.d)<=0.01),
    out.map(x=>`ab ${x.ab}: ty ${cm(K.hC-x.hB)} cm, wahr ${cm(x.wahr)} cm, Fehler ${cm(x.d)} cm (${x.n} Waende)`).join('; ')+` | ty0 aus lmEinbinden: ${R.log.einbinden.map(e=>`ab ${e.ab} ${e.ty0==null ? '-' : cm(e.ty0-e.tyWahr)+' cm'}`).join(', ')}`); }
// alle Faelle, Tabelle
for(const [fall, {A}] of Object.entries(ERG)) zeile(`     ${fall.padEnd(9)} ${zf(A)}, Geister ${A.geister.length}, Ecken ${A.ecken.filter(e=>e.d<=0.02).length}/${A.ecken.length} <= 2 cm, nicht 1:1: ${A.einsEins.filter(x=>x.n!==1).map(x=>x.w).join(' ')}`);
for(const fall of ['pfeiler2', 'pfeiler2g', 'pfeiler3']){ if(!ERG[fall]) continue; const {S, A}=ERG[fall], ps=(S.kopf.fall && S.kopf.fall.text) || '', soll=S.kopf.statistik ? S.kopf.statistik.pfeilerSeiten : [];
  const ist=soll.filter(id=>{ const w=A.einsEins.find(x=>x.w.replace(/-/g, '')===id); return w && w.n===1; });
  abn(`${fall}: gesehene Pfeilerseiten als wand (${soll.join(', ')})`, ist.length===soll.length, `${ist.length}/${soll.length}`); }

// ------------------------------------------------- Wiederholbarkeit
if(ERG.rund){ const S=ERG.rund.S, R2=lauf(G, S), bild=K=>JSON.stringify({w:[...K.waende.values()], e:[...K.ecken.values()], b:K.beob.map(b=>[b.L, b.schluessel, b.art, b.nSeg])});
  chk('zwei frische Laeufe mit gleicher Eingabe: Waende, Ecken, Beob byte-gleich (5.3)', bild(R2.K)===bild(ERG.rund.R.K)); }

// ------------------------------------------------- Ergebnis nur aus KarteZustand (Abnahme-Befund: Merklisten neben der Karte)
// voller Lauf ohne Merkliste byte-gleich; Klon (structuredClone) nach dem Lauf gegen das Original in 3 Runden Schritt 7;
// ausstehende Klasse der Hysterese liegt in der Karte (karte.spuren.naechste) und geht mit dem Klon.
{ const bildK=K=>JSON.stringify({w:[...K.waende.values()], e:[...K.ecken.values()], b:K.beob.map(b=>[b.L, b.schluessel, b.art, b.nSeg, b.sPx]), n:K.spuren.naechste});
  const schritt7=K=>{ for(const W of [...K.waende.values()]) G.lmDurchblick(W, K); G.lmZusammenfuehren(K); G.lmTrennen(K);
    for(const W of [...K.waende.values()]) G.lmIntervalle(W, K); for(const W of [...K.waende.values()]) G.lmHoehenklasse(W, K); };
  for(const fall of SCHNELL ? ['rund'] : ['rund', 'twechsel']){ if(!ERG[fall]) continue; const {S, R}=ERG[fall], R0=lauf(G, S, {ohneMerk:true});
    chk(`${fall}: voller Lauf ohne Merklisten und Vorpruefungen (lmHoehenklasse o.immer, lmDurchblick und lmEcken o.voll) byte-gleich zum Lauf mit`, bildK(R0.K)===bildK(R.K));
    const K0=lauf(G, S).K, K1=structuredClone(K0); let anders=0, nW=0;
    for(let i=0;i<3;i++){ schritt7(K0); schritt7(K1); nW=K0.waende.size; if(bildK(K0)!==bildK(K1)) anders++; }
    chk(`${fall}: Klon gegen Original nach dem Lauf, 3 Runden Schritt 7 (Durchblick, Zusammenfuehren, Trennen, Intervalle, Hoehenklasse): gleich`, anders===0, `${anders} von 3 Runden verschieden, ${nW} Landmarken`);
    if(fall!=='rund') continue;
    // Hysterese ab 'kandidat' (6.5): erst die zweite gleiche Rohklasse setzt, auch ueber einen Klon dazwischen
    const W=[...K0.waende.values()].find(W=>W.cls==='wand' && W.rahmen===-1 && W.nSchluessel>=20); W.cls='kandidat'; W.zustand='kandidat'; W.clsZaehler=0; delete K0.spuren.naechste[W.id];
    const k1=G.lmHoehenklasse(W, K0), z1=K0.spuren.naechste[W.id], K2=structuredClone(K0), W2=K2.waende.get(W.id), k2=G.lmHoehenklasse(W2, K2);
    chk('lmHoehenklasse: ab kandidat erst nach 2 gleichen Rohklassen (6.5), ausstehende Klasse in karte.spuren (geht mit dem Klon)', k1==='kandidat' && z1==='wand' && k2==='wand' && W2.zustand==='bestaetigt',
      `Runde 1 ${k1} (ausstehend ${z1}), Runde 2 am Klon ${k2}, zustand ${W2.zustand}`); } }

// ------------------------------------------------- Vorfilter und R3 (3.3) an Orakel-Landmarken
{ const orakelW=(id,phi,rho,s0,s1,cov)=>({id, rahmen:-1, phi, rho, cov:cov || null, h:'c', hLokal:null, cls:'wand', beob:[], iv:[{s0:Math.min(s0, s1), s1:Math.max(s0, s1), n:1}], boden:[], durchblick:[], ecken:[], teile:[], abschnitte:[]});
  // zwei Stuecke derselben Linie, Δphi 3°, Luecke 0,2 m, cov null: weit vom Ursprung (rho 1,000 gegen 1,627) wie nahe daran
  const paar=P=>{ const K=karteNeu({}); K.hC=H_LASER; K.hF=0; const pb=3*D2R, rb=Math.cos(pb)*P[0]+Math.sin(pb)*P[1], sb=-Math.sin(pb)*P[0]+Math.cos(pb)*P[1];
    K.waende.set(0, orakelW(0, 0, 1, P[1]-1.0, P[1]-0.2)); K.waende.set(1, orakelW(1, pb, rb, sb, sb+0.8)); return {n:G.lmZusammenfuehren(K).paare.length, rb}; };
  const weit=paar([1, 12.0]), nah=paar([1, 0.5]);
  chk('lmZusammenfuehren: Vorfilter laesst kein Paar der Regel aus (Δphi 3°, 12 m vom Ursprung, Luecke 0,2 m, wie nahe am Ursprung)', weit.n===1 && nah.n===1, `weit ${weit.n} Paar (rho 1,000 / ${weit.rb.toFixed(3)}), nah ${nah.n}`);
  // R3: alle Wahrheitswaende als Landmarken, ohne und mit kleiner cov: genau M-N + Q-A, kein ringuebergreifendes Paar
  const TW=T2.wahrheitLaden(T2.WAHRHEIT), erg=[];
  for(const cov of [null, [Math.pow(0.1*D2R, 2), 0, 1e-6]]){ const K=karteNeu({}); K.hC=H_LASER; K.hF=0; TW.waende.forEach((w,i)=>K.waende.set(i, orakelW(i, w.phi, w.rho, w.s0, w.s1, cov)));
    erg.push(G.lmZusammenfuehren(K).paare.map(p=>p.map(i=>TW.waende[i].ids).sort().join('+'))); }
  chk('R3 (3.3): Orakel-Landmarken aller 24 Wahrheitswaende, lmZusammenfuehren ohne/mit cov fuehrt genau M-N+Q-A zusammen (die 8 ringuebergreifenden Paare nie)',
    erg.every(e=>e.length===1 && e[0]==='M-N+Q-A'), erg.map(e=>JSON.stringify(e)).join(' / '));
  const MN=TW.waende.find(w=>w.ids==='M-N'), seite=id=>Math.cos(MN.phi)*TW.P[id][0]+Math.sin(MN.phi)*TW.P[id][1]-MN.rho;
  zeile(`n.p. [Abnahme] MN~QA getrennt, wenn F4 in die Nische blickt: nicht pruefbar - N-O-P-Q ist ein Vorsprung (O ${cm(seite('O'))} cm, P ${cm(seite('P'))} cm auf der freien Seite von M-N), hineinblicken geht nicht; den Mechanismus prueft der Selbsttest lmTrennen unten`); }

// ------------------------------------------------- Zusammenfuehren/Trennen am Beispiel M-N+Q-A (rund)
if(ERG.rund){ const K=ERG.rund.R.K, W=[...K.waende.values()].find(W=>W.rahmen===-1 && (W.iv||[]).length>=2 && Math.abs(W.rho-1.32)<0.03);
  if(!W) chk('Trennen: Landmarke M-N+Q-A mit zwei Intervallen vorhanden', false);
  else { const n0=K.waende.size, iv=[...W.iv].sort((a,b)=>a.s0-b.s0), g0=iv[0].s1, g1=iv[1].s0;
    chk('Zusammenfuehren 3.3: M-N und Q-A (Luecke 0,31 m hinter dem Vorsprung N-O-P-Q, kein Durchblick moeglich) sind eine Landmarke mit zwei Intervallen', g1-g0>0.25 && g1-g0<0.4,
      `Luecke ${cm(g1-g0)} cm`);
    W.durchblick=[[g0+0.05, g1-0.05]]; const T=G.lmTrennen(K), N=K.waende.get(T.getrennt[0]);
    chk('lmTrennen: Durchblick in der Luecke trennt die Landmarke an der Luecke (umkehrbar, 3.3)', T.getrennt.length===1 && K.waende.size===n0+1 && N && W.iv.length===1 && N.iv.length===1,
      N ? `getrennt ${T.getrennt}: [${W.iv[0].s0.toFixed(2)}, ${W.iv[0].s1.toFixed(2)}] und [${N.iv[0].s0.toFixed(2)}, ${N.iv[0].s1.toFixed(2)}]` : '-');
    W.durchblick=[]; N.durchblick=[[g0+0.05, g1-0.05]]; const Z=G.lmZusammenfuehren(K);
    chk('lmZusammenfuehren: mit Durchblick in der Luecke kein Zusammenfuehren', !Z.paare.some(p=>p.includes(W.id) && p.includes(N.id)));
    N.durchblick=[]; const Z2=G.lmZusammenfuehren(K);
    chk('lmZusammenfuehren: ohne Durchblick wieder eine Landmarke', Z2.paare.some(p=>p.includes(W.id) && p.includes(N.id)), JSON.stringify(Z2.paare)); } }

// ------------------------------------------------- Laufzeit (Mac) aus dem Lauf rund: nur Auskunft (der leichte Fall, 24 Landmarken);
// das Kriterium 11.1 rechnet unten auf F1 A7 (Befund der Abnahme)
if(ERG.rund){ const ms=ERG.rund.R.log.ms; zeile(`     Laufzeit rund (Mac, Auskunft): Aufnehmen Median ${median(ms.aufnehmen).toFixed(3)} ms, p90 ${q(ms.aufnehmen, 0.9).toFixed(3)} ms; Ecken Median ${median(ms.ecken).toFixed(3)} ms; Runde M5+Platzhalter Median ${median(ms.runde).toFixed(1)} ms, p90 ${q(ms.runde, 0.9).toFixed(1)} ms`); }

// ------------------------------------------------- Laufzeit auf F1 A7 (echte Segmente, 1821 Bilder, alle Abschnitte lokal wie
// design/bau/P-C/zeit-a7.mjs, Platzhalter-M6 mit nurAb je Runde): Aufnehmen + Ecken je Bild gegen 11.1 (<= 5 ms am Pixel, Faktor
// Pixel/Mac 2,8 x 2 fuer den Worker = 5,6 [S]); Schritt 7 je Runde zur Auskunft. Nur ohne --schnell und mit Fixture.
{ const F1A7=SP+'/karte/fixtures/f1-a7.jsonl.gz', F2A7=SP+'/karte/fixtures/f2-a7.json';
  if(SCHNELL || !existsSync(F1A7) || !existsSync(F2A7)) zeile('     (Laufzeit A7 uebersprungen'+(SCHNELL ? ', --schnell' : ', Fixture fehlt')+')');
  else { const {ladeF1, ladeF2}=await import(SP+'/karte/fixtures/laden.mjs'), F1=ladeF1(7), F2=ladeF2(7), K=karteNeu({}), M6=(KK,o)=>ausgleichMock(G, KK, o);
    K.abschnitte=F2.abschnitte.map(a=>({ab:a.ab, t0:a.t0, t1:a.t1, ep0:a.ep0, ep1:a.ep1, g:null, stufe:'lokal', knoten:null, hLok:null, sig:null}));
    const abV=b=>{ const A=F2.abschnitte.filter(a=>a.ep0<=b.ep && b.ep<=a.ep1); if(A.length===1) return A[0].ab; const x=A.find(a=>b.t>=a.t0-1e-6 && b.t<=a.t1+1e-6) || A[0]; return x ? x.ab : 0; };
    const ae=[], m7=[]; let tR=0.5;
    for(const b of F1.bilder){ while(b.t>=tR){ M6(K, {nurAb:abV(b), hoehen:'schaetzen'}); const t0=performance.now();
        for(const W of [...K.waende.values()]) G.lmDurchblick(W, K); G.lmZusammenfuehren(K); G.lmTrennen(K);
        for(const W of [...K.waende.values()]) G.lmIntervalle(W, K); for(const W of [...K.waende.values()]) G.lmHoehenklasse(W, K); m7.push(performance.now()-t0); tR+=0.5; }
      const ab=abV(b); K.bilder.set(b.k, {t:b.t, ab, ep:b.ep, c:[b.camTo[12], b.camTo[13], b.camTo[14]], camTo:Array.from(b.camTo), f:b.f});
      const t=performance.now(); G.lmAufnehmen(K, b, {ab}); G.lmEcken(b, K, {ab}); ae.push(performance.now()-t); }
    const p90=q(ae, 0.9);
    abn('A7 (F1, echte Segmente): Aufnehmen + Ecken <= 5 ms je Bild am Pixel (11.1; Mac p90 x 5,6 [S])', p90*5.6<=5,
      `Mac Median ${median(ae).toFixed(3)} ms, p90 ${p90.toFixed(3)} ms, max ${Math.max(...ae).toFixed(1)} ms -> Pixel p90 ≈ ${(p90*5.6).toFixed(1)} ms [S]; ${K.waende.size} Landmarken am Ende; Schritt 7 je Runde Median ${median(m7).toFixed(1)} ms, p90 ${q(m7, 0.9).toFixed(1)} ms (Mac)`); } }

// ------------------------------------------------- Bodenguete (6.2)
if(ERG.rund){ const K=ERG.rund.R.K, sv=[...K.waende.values()].filter(W=>W.rahmen===-1 && W.cls==='wand' && G.lmSchrankVerdacht(W, K).verdacht);
  chk('lmSchrankVerdacht: auf F4 rund (keine Schraenke) an keiner wand-Landmarke', !sv.length, sv.map(W=>W.id).join(',')); }
if(ERG.rund){ const B=G.lmBodenguete(ERG.rund.R.K); chk('lmBodenguete: q in [0, 1], b > 0 auf rund (Bodenkanten gesehen)', B.q>=0 && B.q<=1 && B.b>0, `q ${B.q.toFixed(2)}, b ${B.b.toFixed(2)} m, p ${B.p.toFixed(2)}, Δχ² ${B.dchi.toFixed(1)}, Wand ${B.wand}, h frei ${B.h.toFixed(3)}`); }

// ------------------------------------------------- T3-Sonderfaelle (8.1-8.4)
const T3F=SCHNELL ? [] : ['vorhang', 'schrank', 'unterzug', 'unterzugEinseitig', 'tuer', 'moebel'];
for(const fall of T3F){ if(!existsSync(T3(fall))){ zeile('     (T3 '+fall+' fehlt)'); continue; }
  const S=sitzungLaden(T3(fall)), R=lauf(G, S), K=R.K, KA=S.kopf.welt.kanten, WA=S.kopf.welt.waende, herk=W=>{ const c={}; for(const i of W.beob){ const b=K.beob[i], w=R.log.wahr.get(b.k); if(!w || b.i<0) continue; const kid=w.kid[b.i]; const a=kid>=0 ? KA[kid].art : 'stoer'; c[a]=(c[a]||0)+1; }
    let best=null; for(const [a,n] of Object.entries(c)) if(!best || n>best[1]) best=[a, n]; return best ? best[0] : '-'; };
  const glob=[...K.waende.values()].filter(W=>W.rahmen===-1), A=auswerten(G, S, R);
  if(fall==='vorhang'){ const sch=glob.filter(W=>herk(W)==='schiene'), AB=A.lage.find(x=>x.wahr==='A-B');
    abn('vorhang (8.4): keine Landmarke der Schiene als wand; A-B als wand <= 3 cm', sch.length>0 && sch.every(W=>W.cls!=='wand') && AB && AB.cls==='wand' && Math.abs(AB.drho)<=0.03,
      `Schiene: ${sch.map(W=>W.cls+' h '+(W.hFrei ? W.hFrei.h.toFixed(3) : '-')).join(', ')}; A-B ${AB ? cm(AB.drho)+' cm '+AB.cls : 'fehlt'}`); }
  if(fall==='schrank'){ const fr=glob.filter(W=>herk(W)==='schrank' && W.cls==='wand' && Math.cos(W.phi-Math.PI)>0.99), front=fr.find(W=>Math.abs(W.rho+8.257)<=0.05), sv=glob.filter(W=>G.lmSchrankVerdacht(W, K).verdacht);
    abn('schrank (8.2): Front als wand <= 5 cm, Schrank-Verdacht genau an der Front', front && sv.length===1 && sv[0]===front,
      `Front ${front ? 'rho '+front.rho.toFixed(3)+' (wahr -8,257)' : 'fehlt'}; Verdacht an ${sv.map(W=>W.id+':'+herk(W)).join(', ') || 'keiner'}${front ? '; Front: '+G.lmSchrankVerdacht(front, K).grund.join(',') : ''}`); }
  if(fall.startsWith('unterzug')){ const uz=glob.filter(W=>herk(W)==='unterzug');
    abn(`${fall} (8.3): keine Unterzug-Kante als wand, Unterzug-Kanten als unterzug/stoer/unklar`, uz.length>0 && uz.every(W=>W.cls!=='wand'),
      `${uz.length} Landmarken: ${Object.entries(uz.reduce((s,W)=>(s[W.cls]=(s[W.cls]||0)+1, s), {})).map(([k,v])=>k+' '+v).join(', ')}; wand: ${uz.filter(W=>W.cls==='wand').map(W=>W.id).join(',')}`); }
  if(fall==='tuer'){ const ob=S.kopf.welt.objekte.find(o=>o.art==='tuer'), MN=glob.find(W=>Math.abs(W.rho-1.313)<0.03 && Math.cos(W.phi-Math.PI/2)>0.99 && W.cls==='wand');
    const tu=MN && ob ? (()=>{ const w=TWof(S).waende.find(x=>x.ids==='M-N'), sa=w.u[0]*w.a[0]+w.u[1]*w.a[1], dir=Math.sign(w.u[0]*(w.b[0]-w.a[0])+w.u[1]*(w.b[1]-w.a[1])); return [sa+dir*ob.s0, sa+dir*ob.s1].sort((x,y)=>x-y); })() : null;
    const im=MN && tu ? (MN.durchblick||[]).filter(([a,b])=>b>tu[0] && a<tu[1]) : [];
    abn('tuer (8.1): M-N wand, Durchblick in der Tuer (unter dem Sturz), nicht als Unterzug', MN && im.length>0, MN ? `Tuer s [${tu[0].toFixed(2)}, ${tu[1].toFixed(2)}], Durchblick ${JSON.stringify((MN.durchblick||[]).map(x=>x.map(v=>+v.toFixed(2))))}` : 'M-N fehlt'); }
  if(fall==='moebel'){ const mb=glob.filter(W=>herk(W)==='moebel');
    abn('moebel: keine Moebelkante als wand', mb.every(W=>W.cls!=='wand'), `${mb.length} Landmarken: ${mb.map(W=>W.cls).join(', ')}`); }
  zeile(`     T3 ${fall}: ${zf(A)}, Geister ${A.geister.length}`); }
function TWof(S){ return wahrheitVon(S).TW; }

const nA=abnahme.length, nOk=abnahme.filter(Boolean).length;
console.log(`\nAbnahme 10.4 (synthetisch): ${nOk} von ${nA} Kriterien erreicht`);
console.log(ok ? 'ALLE CHECKS GRÜN' : 'CHECKS ROT'); process.exit(ok ? 0 : 1);
}
