// Prueft M6 raumskizze-ausgleich.js (ARCHITEKTUR v3, 17.5): Datei und Einbau, Jacobi der Bildreste gegen zentrale
// Differenzen, Ausgleich auf F4 (Sprung 40 cm / 10°, T-Wechsel 3 cm, Hoehe sigma 2 cm), Gier-Vorzeichen, Max-Mixture,
// Wiederholbarkeit (andere Uhr), Takahashi gegen Spaltenloesungen, Fehlerband (Monte Carlo), Rueckfallweg ohne Knoten
// und Stufen (werfende Platzhalter), Knoten auf T3 (ohne Drift gleich knoten:false), lokaler Ausgleich nurAb.
// Laedt vendor + geo von raumskizze-probe.html wie raumskizze-protokoll.mjs und fuegt M0 und M6 als eigene Bloecke
// vor globalThis.RAUMSKIZZE=G; ein, wenn die Seite sie (noch) nicht traegt.
//
//   node test/karte-ausgleich.mjs [--schnell]      (RAUMSKIZZE_HTML=pfad: anderer Stand der Seite)
//
// Exportiert die Testumgebung fuer die Messskripte in design/bau/P-D/: ladeG, platzhalterM4, sitzungF4, sitzungSim,
// karteBauen, fehler, wahrWand. Platzhalter fuer M4 (resKette, resKnoten, abschnittSigma, knotenSetzen) mit genau den
// Signaturen aus 4; Zuordnung aus der Beilage wahr (Bauauftrag 17.5, Mocks).
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {sim, welt as simWelt, WAHRHEIT, SITZUNGEN} from '../raumskizze-sim.mjs';

const read=f=>readFileSync(new URL('../'+f, import.meta.url), 'utf8');
export const DATEI='raumskizze-ausgleich.js';
export const FIX='/private/tmp/claude-501/-Volumes-external-TobiCodetEndlichWieder-Zaene/86e1205e-9d6d-494b-b0b6-88f6e01be4b0/scratchpad/karte/fixtures';
const D2R=Math.PI/180, R2D=180/Math.PI, wrap=a=>Math.atan2(Math.sin(a), Math.cos(a));

// ------------------------------------------------ Seite laden
// o.src: anderer Quelltext fuer M6 (werfende Stufen); o.platzhalter: M4-Platzhalter (Vorgabe true).
export function ladeG(o={}){
  const html=process.env.RAUMSKIZZE_HTML ? readFileSync(process.env.RAUMSKIZZE_HTML, 'utf8') : read('raumskizze-probe.html');
  const pick=id=>{ const m=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`)); if(!m) throw new Error(`Script-Block "${id}" nicht gefunden`); return m[1]; };
  const mark='globalThis.RAUMSKIZZE=G;';
  let geo=pick('geo');
  const quellen={};
  for(const [name, src] of [['raumskizze-karte-grund.js', read('raumskizze-karte-grund.js')], [DATEI, o.src || read(DATEI)]]){
    if(geo.includes('{\n'+src+'}\n') || geo.includes('{\n'+src+'\n}\n')){ quellen[name]='Seite'; continue; }
    const at=geo.lastIndexOf(mark); if(at<0) throw new Error('geo-Block ohne '+mark);
    geo=geo.slice(0, at)+'{\n'+src+'\n}\n'+geo.slice(at); quellen[name]='Datei'; }
  const hatte=Object.prototype.hasOwnProperty.call(globalThis, 'RAUMSKIZZE'), vorher=globalThis.RAUMSKIZZE;
  new Function('"use strict";\n'+pick('vendor')+'\n'+geo)();
  const G=globalThis.RAUMSKIZZE;
  if(hatte) globalThis.RAUMSKIZZE=vorher; else delete globalThis.RAUMSKIZZE;
  G.__quellen=quellen;
  if(o.platzhalter!==false) platzhalterM4(G);
  return G;
}

// ------------------------------------------------ Platzhalter M4 (Signaturen wie 4)
// resKette nach 3.2.1: 'pose' g_B = g_A ∘ dT mit dT = gAusT(T_A)^-1 ∘ gAusT(T_B), ausgewertet an der Kamera ca
// (Lage x, z; Gier; Hoehe); 'kamera' Kamera in F0 stetig. Komponenten stetig (sigma der Klasse), sprung (1 m, 20°,
// 0,3 m; w so, dass sprung bei chi2_stetig = 16 gleich teuer ist) und anker (w = 0).
export function platzhalterM4(G){
  G.resKette=(s, gA, gB)=>{ const b=s.bindung; let r;
    if(b.art==='pose'){ const dT=G.gKomp(G.gInv(G.gAusT(s.TA)), G.gAusT(s.TB)), g1=G.gKomp(gA, dT), p=G.gAnw(gB, s.ca), q=G.gAnw(g1, s.ca);
      r=[p[0]-q[0], p[2]-q[2], wrap(gB.psi-g1.psi), gB.ty-g1.ty]; }
    else { const p=G.gAnw(gB, s.ca), q=G.gAnw(gA, s.cb); r=[p[0]-q[0], p[2]-q[2], wrap(gB.psi+s.pa[3]-gA.psi-s.pb[3]), p[1]-q[1]]; }
    const st=[b.sP, b.sP, b.sY, b.sH], sp=[1.0, 1.0, 20*D2R, 0.3], lnS=a=>a.reduce((x,y)=>x+Math.log(y), 0);
    return {r, komp:[{name:'stetig', w:1, sigma:st}, {name:'sprung', w:Math.exp(lnS(sp)-lnS(st)-8), sigma:sp}, {name:'anker', w:0, sigma:sp}], kern:'mm'}; };
  G.resAnker=(s, gA, gB)=>({r:[0, 0, 0, 0], sigma:[1, 1, 1, 1]});
  // Folgekante 3.2.3: r_P = d_j+1(c_j+1) - d_j(c_j+1), r_psi, r_y; sigma aus G.KG.KNOTEN mit dem Weg ds.
  G.resKnoten=(A, j, dj, dj1)=>{ const K=A.knoten, KN=G.KG.KNOTEN, c=K.c[j+1], a=G.gPlan(dj1, c), b=G.gPlan(dj, c), ds=K.s[j+1]-K.s[j];
    return {r:[a[0]-b[0], a[1]-b[1], dj1.psi-dj.psi, dj1.ty-dj.ty],
      sigma:[Math.hypot(KN.sP0, KN.kP*ds), Math.hypot(KN.sP0, KN.kP*ds), Math.hypot(KN.sY0Deg, KN.kYDeg*ds)*D2R, Math.hypot(KN.sH0, KN.kH*ds)]}; };
  G.abschnittSigma=cov=>{ const eins=C=>{ const a=C[5], b=C[7], d=C[15], tr=(a+d)/2, dis=Math.sqrt(Math.max(0, (a-d)*(a-d)/4+b*b)), l1=tr+dis, l2=Math.max(0, tr-dis);
      return {psi:Math.sqrt(Math.max(0, C[0])), max:Math.sqrt(Math.max(0, l1)), min:Math.sqrt(l2), ang:0.5*Math.atan2(2*b, a-d), y:Math.sqrt(Math.max(0, C[10]))}; };
    if(!cov) return null; if(cov.length<=16) return eins(cov);
    let best=null; for(let j=0;j*16<cov.length;j++){ const s=eins(cov.subarray(16*j, 16*j+16)); if(!best || s.max>best.max) best=s; } return best; };
  // Knoten 3.2.3 (vereinfacht): neuer Knoten bei dT oder dS, wenn seit dem letzten >= minBeob Schluessel-Beob an >= 2
  // Wandrichtungen (>= richtDeg) liegen; haengt nur an (t, s, dazu c fuer resKnoten).
  G.knotenSetzen=(A, posen, beob, o=G.KG.KNOTEN)=>{ if(A.stufe!=='verbunden' && A.stufe!=='locker') return A.knoten;
    const Z=posen.filter(p=>p.t>=A.t0-1e-9 && p.t<=A.t1+1e-9); if(Z.length<2) return A.knoten;
    let s=0; const S=[0]; for(let i=1;i<Z.length;i++){ s+=Math.hypot(Z[i].cam[0]-Z[i-1].cam[0], Z[i].cam[2]-Z[i-1].cam[2]); S.push(s); }
    const K=A.knoten ? {t:[...A.knoten.t], s:[...A.knoten.s], c:[...A.knoten.c], d:A.knoten.d, cov:A.knoten.cov} : {t:[Z[0].t], s:[0], c:[[Z[0].cam[0], Z[0].cam[2]]], d:null, cov:null};
    const B=beob.filter(b=>b.ab===A.ab && b.schluessel && b.art!=='ecke' && b.phiL!=null);
    for(let i=1;i<Z.length;i++){ const tl=K.t[K.t.length-1], sl=K.s[K.s.length-1]; if(Z[i].t<=tl) continue;
      if(!(Z[i].t-tl>=o.dT || S[i]-sl>=o.dS)) continue;
      const im=B.filter(b=>b.t>tl && b.t<=Z[i].t); if(im.length<o.minBeob) continue;
      const r=[...new Set(im.map(b=>Math.round(((b.phiL%Math.PI)+Math.PI)%Math.PI*R2D/o.richtDeg)))];
      if(r.length<o.minRicht) continue;
      K.t.push(Z[i].t); K.s.push(S[i]); K.c.push([Z[i].cam[0], Z[i].cam[2]]); }
    A.knoten={t:Float64Array.from(K.t), s:Float64Array.from(K.s), c:K.c, d:K.d, cov:K.cov};
    return A.knoten; };
}

// ------------------------------------------------ Sitzungen (gemeinsame Form aus T3 bzw. F4)
const m4q=(p,[x,y,z,w])=>[1-2*(y*y+z*z), 2*(x*y+z*w), 2*(x*z-y*w), 0,  2*(x*y-z*w), 1-2*(x*x+z*z), 2*(y*z+x*w), 0,
  2*(x*z+y*w), 2*(y*z-x*w), 1-2*(x*x+y*y), 0,  p[0], p[1], p[2], 1];
let WELT=null;
const welt0=()=>WELT || (WELT=simWelt(WAHRHEIT));
export function sitzungSim(erg){
  return {posen:erg.posen, bilder:erg.bilder, waende:erg.welt.waende, ecken:erg.welt.ecken, welt:erg.welt,
    abWahr:erg.abschnitte.map(a=>({ab:a.ab, t0:a.t0, t1:a.t1, g:a.g, knoten:a.knoten})), schnitteWahr:erg.schnitteWahr, statistik:erg.statistik};
}
// F4 aus design/fixtures (Phase 0.2); fehlt die Datei (Scratchpad weg), derselbe Fall aus T3 (SITZUNGEN, gleiche Faelle).
export function sitzungF4(fall){
  if(!existsSync(FIX+'/f4-'+fall+'.jsonl.gz')){ if(!SITZUNGEN[fall]) throw new Error('F4 '+fall+' fehlt'); return {...sitzungSim(sim(WAHRHEIT, SITZUNGEN[fall])), quelle:'T3'}; }
  const Z=gunzipSync(readFileSync(FIX+'/f4-'+fall+'.jsonl.gz')).toString('utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
  const kopf=Z[0].kopf, posen=[], bilder=[];
  for(const z of Z.slice(1)){ if(z.typ==='pose') posen.push(z.zeile);
    else if(z.typ==='bild'){ const B=z.bildErg, n=a=>a.map(v=>v===null ? NaN : v);
      bilder.push({bildErg:{...B, camTo:Float64Array.from(B.camTo), proj:Float32Array.from(B.proj), seg:Float32Array.from(n(B.seg)), cls:Int8Array.from(B.cls), dir:Float32Array.from(B.dir)},
        wahr:{...z.wahr, wand:Int16Array.from(z.wahr.wand), kante:Int8Array.from(z.wahr.kante), senkEcke:z.wahr.senkEcke || []}}); } }
  const W=welt0(), wi=new Map(W.waende.map((w,i)=>[w.id, i])), ei=new Map(W.ecken.map((e,i)=>[e.id, i]));
  // wahr.wand ist Index in kopf.waende, senkEcke Index in kopf.ecken: auf die Welt umschluesseln
  const mw=kopf.waende.map(id=>wi.get(id)), me=kopf.ecken.map(id=>ei.get(id));
  for(const x of bilder){ x.wahr.wand=Int16Array.from(x.wahr.wand, v=>v>=0 ? mw[v] : -1); x.wahr.senkEcke=(x.wahr.senkEcke || []).map(v=>v>=0 ? me[v] : -1); }
  return {posen, bilder, waende:W.waende, ecken:W.ecken, welt:W, abWahr:kopf.abschnitte.map(a=>({ab:a.ab, t0:a.t0, t1:a.t1, g:a.g, knoten:null})),
    schnitteWahr:kopf.schnitteWahr, statistik:kopf.statistik, kopf};
}
export const gWahr=(G,S,ab,t)=>{ const a=S.abWahr[ab]; return a.knoten ? G.gBei({g:a.g, knoten:a.knoten}, t) : {...a.g}; };

// ------------------------------------------------ KarteZustand aus einer Sitzung
// o.start: 'wahr' | 'kette' | {ab: g} | (G, S, ab, gWahr, gKette) => g  (Start je Abschnitt ausser dem Kern)
// o.waende: Startfehler der Waende aus dem Startfehler des ersten Abschnitts, der sie sieht, dazu Rauschen
//   o.wandRausch = [m, rad]. o.jede: jedes n-te Bild Schluessel. o.senk: Senkrechte als Ecken-Beob ('x' Schnitt zweier
//   Waende, 'frei', false). o.H: Laser-Hoehe oder null. o.rausch: eigenes Strahlrauschen [sigma px, Samen] (Monte Carlo).
export function karteBauen(G, S, o={}){
  const O={start:'wahr', jede:1, senk:'x', H:2.416, hC:2.40, wandRausch:[0.01, 0.2*D2R], seed:1, boden:true, rausch:null, ...o};
  const rnd=G.KG.rnd(O.seed), gauss=()=>{ let u=0; while(!u) u=rnd(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rnd()); };
  const posen=S.posen, tIdx=t=>{ let lo=0, hi=posen.length-1; while(lo<hi){ const m=(lo+hi)>>1; if(posen[m].t<t-1e-9) lo=m+1; else hi=m; } return lo; };
  // Schnitte wie karte/fixtures/erzeuge-f2.mjs (Klasse am Rest gegen konstante Geschwindigkeit, Bindung 3.2.1)
  const pose=posen.map(p=>m4q(p.pose.slice(0, 3), p.pose.slice(3)));
  const schnitte=S.abWahr.slice(1).map(a=>{ const ib=tIdx(a.t0), ia=ib-1, ip=ia-1;
    const ta=posen[ia].t, tb=ip>=0 ? posen[ip].t : ta-0.1, k=(posen[ib].t-ta)/(ta-tb);
    const pr=[0, 1, 2].map(j=>pose[ia][12+j]+(pose[ia][12+j]-(ip>=0 ? pose[ip][12+j] : pose[ia][12+j]))*k);
    const ga=G.blickPlan(pose[ia]), gb=ip>=0 ? G.blickPlan(pose[ip]) : ga, gp=ga+wrap(ga-gb)*k;
    const rPose=Math.hypot(pose[ib][12]-pr[0], pose[ib][13]-pr[1], pose[ib][14]-pr[2]), rPsi=Math.abs(wrap(G.blickPlan(pose[ib])-gp)), dt=posen[ib].t-ta;
    const TA=posen[ia].T, TB=posen[ib].T, dT={psi:G.psiAusTpsi(wrap(TB[0]-TA[0])), tx:TB[1]-TA[1], ty:TB[2]-TA[2], tz:TB[3]-TA[3]}, dxz=Math.hypot(dT.tx, dT.tz);
    const klasse=dt>0.5 ? 'pause' : (rPose<=0.02 && rPsi<=1*D2R ? 'nurT' : 'reloc');
    let bindung;
    if(klasse==='nurT') bindung={art:'pose', sP:Math.max(0.01, 0.3*dxz), sY:Math.max(0.2*D2R, 0.3*Math.abs(dT.psi)), sH:Math.max(0.01, 0.3*Math.abs(dT.ty))};
    else if(klasse==='reloc') bindung={art:'kamera', sP:0.03+0.7*dt+0.5*rPose, sY:(1+45*dt)*D2R+0.5*rPsi, sH:0.01+0.3*dt};
    else bindung={art:'kamera', sP:0.03+0.7*dt, sY:(1+45*dt)*D2R, sH:0.01+0.3*dt};
    Object.assign(bindung, {kern:'mm', mm:null, k:null});
    const cb=posen[ia].cam, ca=posen[ib].cam;
    return {t:posen[ib].t, epA:posen[ia].ep, epB:posen[ib].ep, art:'bruch', klasse, grund:null, dt, cb, ca, pb:[...cb, posen[ia].blick], pa:[...ca, posen[ib].blick],
      rPose, rPsi, dCam:Math.hypot(ca[0]-cb[0], ca[1]-cb[1], ca[2]-cb[2]), dT, bindung, anker:[], zurueckZu:null, TA, TB}; });
  // Kettenstart (ketteStart wie erzeuge-f2.mjs)
  const kette=[{psi:0, tx:0, ty:0, tz:0}];
  for(const s of schnitte){ const gA=kette[kette.length-1]; let gB;
    if(s.bindung.art==='pose') gB=G.gKomp(gA, G.gKomp(G.gInv(G.gAusT(s.TA)), G.gAusT(s.TB)));
    else { const psi=gA.psi+s.pb[3]-s.pa[3], w=G.gAnw(gA, s.cb), c=Math.cos(psi), sn=Math.sin(psi);
      gB={psi, tx:w[0]-(c*s.ca[0]-sn*s.ca[2]), ty:w[1]-s.ca[1], tz:w[2]-(sn*s.ca[0]+c*s.ca[2])}; }
    kette.push(gB); }
  const abschnitte=S.abWahr.map((a,i)=>{ const i0=tIdx(a.t0), gw=gWahr(G, S, a.ab, a.t0);
    let g=gw;
    if(a.ab>0){ if(O.start==='kette') g=kette[i]; else if(typeof O.start==='function') g=O.start(G, S, a.ab, gw, kette[i]); else if(O.start && typeof O.start==='object' && O.start[a.ab]) g=O.start[a.ab]; }
    else g={psi:0, tx:0, ty:0, tz:0};
    return {ab:a.ab, t0:a.t0, t1:a.t1, ep0:posen[i0].ep, ep1:posen[tIdx(a.t1)].ep, g0:{...kette[i]}, g:{...g}, cov:null, knoten:null, hLok:null, sig:null,
      reg:{hyp:[], gewaehlt:0, verhaeltnis:2, versuche:1}, stufe:'verbunden', w:1, nBilder:0, nSchluessel:0, nBeob:0, mitWand:true, richtungen:2, psi0:null}; });
  // Beob aus den Bildern (Zuordnung = wahr), Senkrechte als Ecken-Beob
  const beob=[], bilder=new Map(), Wd=S.waende, sichtAb=new Map();
  const rausch=O.rausch ? G.KG.rnd(O.rausch[1]) : null, ng=rausch ? ()=>{ let u=0; while(!u) u=rausch(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rausch()); } : null;
  const stoer=(d,f)=>{ if(!ng) return d; const s=O.rausch[0]/f, a=[d[0]+s*ng(), d[1]+s*ng(), d[2]+s*ng()], n=Math.hypot(...a); return a.map(x=>x/n); };
  S.bilder.forEach(({bildErg:B, wahr:w}, v)=>{
    const key=v%O.jede===0, c=[B.camTo[12], B.camTo[13], B.camTo[14]];
    bilder.set(B.k, {t:B.t, ab:w.ab, ep:B.ep, c, camTo:B.camTo, f:B.f, schluessel:key});
    for(let j=0;j<B.n;j++){ const L=w.wand[j], ka=w.kante[j], cl=B.cls[j]; if(L<0 || !(ka===0 && cl===2 || ka===1 && cl===3 && O.boden)) continue;
      if(!sichtAb.has(L)) sichtAb.set(L, w.ab);
      beob.push({id:beob.length, k:B.k, t:B.t, ab:w.ab, ep:B.ep, i:j, art:ka===0 ? 'decke' : 'boden', L, c, da:stoer(Array.from(B.dir.subarray(6*j, 6*j+3)), B.f),
        db:stoer(Array.from(B.dir.subarray(6*j+3, 6*j+6)), B.f), sPx:1, f:B.f, len:B.seg[10*j+9], nSeg:1, schluessel:key, nutzer:false, w:1, chi2:0, mu:16, phiL:Wd[L].phi}); }
    if(O.senk && B.senk) B.senk.forEach((s,q)=>{ const e=(w.senkEcke || [])[q]; if(e==null || e<0 || !s.ray) return;
      beob.push({id:beob.length, k:B.k, t:B.t, ab:w.ab, ep:B.ep, i:-1, art:'ecke', L:1000+e, c, da:stoer(s.ray.d, B.f), db:null, sPx:1, f:B.f, len:s.len, nSeg:1,
        schluessel:key, nutzer:false, w:1, chi2:0, mu:16}); }); });
  // Waende: Wahrheit unter dem Startfehler des ersten Abschnitts, der sie sieht, plus Rauschen
  const fehlerVon=ab=>{ const A=abschnitte[ab], gw=gWahr(G, S, ab, A.t0); return G.gKomp(A.g, G.gInv(gw)); };
  const waende=new Map();
  for(const [L, ab] of [...sichtAb.entries()].sort((a,b)=>a[0]-b[0])){ const w=Wd[L], E=fehlerVon(ab), n=[Math.cos(w.phi), Math.sin(w.phi)], p0=[w.rho*n[0], w.rho*n[1]];
    const q=G.gPlan(E, p0), phi=((w.phi+E.psi+O.wandRausch[1]*gauss())%(2*Math.PI)+2*Math.PI)%(2*Math.PI), rho=Math.cos(phi)*q[0]+Math.sin(phi)*q[1]+O.wandRausch[0]*gauss();
    waende.set(L, {id:L, rahmen:-1, phi, rho, cov:[0, 0, 0], h:'c', hLokal:null, cls:'wand', clsZaehler:0, beob:[], nBilder:0, nSchluessel:0, nStandpunkte:0, abschnitte:[],
      iv:[], durchblick:[], boden:[], ecken:[], zustand:'bestaetigt', teile:[], ringe:[w.ring], insel:'nein', inselRunden:0}); }
  // Ecken: Schnitt der beiden anliegenden Waende ('x') oder frei mit Startrauschen
  const ecken=new Map();
  for(const b of beob) if(b.art==='ecke' && !ecken.has(b.L)){ const e=S.ecken[b.L-1000];
    const ein=Wd.findIndex(w=>w.b===e.id), aus=Wd.findIndex(w=>w.a===e.id);
    const x=O.senk==='x' && ein>=0 && aus>=0 && waende.has(ein) && waende.has(aus);
    ecken.set(b.L, {id:b.L, rahmen:-1, p:[e.p[0]+0.02*gauss(), e.p[1]+0.02*gauss()], cov:[0, 0, 0], art:'unklar', waende:x ? [ein, aus] : null, beob:[], frei:[], senk:true, top:null, nPeil:0}); }
  return {opt:{}, skala:1, hC:O.hC, hF:0, sHC:0, sHF:0, H:O.H!=null ? {laser:O.H, sigma:0.005} : null, hoehen:{quelle:O.H!=null ? 'laser-weich' : 'parallaxe', q:0},
    posen, epoche:posen[posen.length-1].ep, schnitte, abschnitte, kern:0, bilder, warte:[], beob, waende, ecken, spuren:null, bloecke:new Map(),
    pp:{cx:0, cy:0, sig:0, frei:false}, ldl:null, tiefe:{boden:null, ebenen:[], ebenenAR:[]}, inselEntscheide:new Map(), umriss:null, runde:0, version:0, ms:{}, kette};
}

// ------------------------------------------------ Fehler gegen die Wahrheit
// Abschnitte: Kameralage je Bild |gBei_est(t)(c) - g_wahr(t)(c)| (Plan), Gier und ty; Waende: d rho, d phi.
export function fehler(G, karte, S){
  const ab=new Map();
  for(const {bildErg:B, wahr:w} of S.bilder){ const A=karte.abschnitte[w.ab]; if(!A.g) continue; const ge=G.gBei(A, B.t), gw=w.g, c=[B.camTo[12], B.camTo[13], B.camTo[14]];
    const p=G.gAnw(ge, c), q=G.gAnw(gw, c), e=ab.get(w.ab) || {lage:[], psi:[], ty:[]};
    e.lage.push(Math.hypot(p[0]-q[0], p[2]-q[2])); e.psi.push(Math.abs(wrap(ge.psi-gw.psi))); e.ty.push(ge.ty-gw.ty); ab.set(w.ab, e); }
  const med=a=>{ const s=[...a].sort((x,y)=>x-y); return s.length ? s[s.length>>1] : NaN; }, mx=a=>a.reduce((m,x)=>Math.max(m, Math.abs(x)), 0);
  const abschnitte=[...ab.entries()].map(([k, e])=>({ab:k, lageMed:med(e.lage), lageMax:mx(e.lage), psiMax:mx(e.psi), tyMax:mx(e.ty), tyMed:med(e.ty)}));
  // dq: Querfehler am Mittelpunkt der wahren Wand (Abstand zur geschaetzten Linie); drho am Ursprung von F0
  const waende=[...karte.waende.values()].filter(W=>W.rahmen===-1).map(W=>{ const w=S.waende[W.id], m=[(w.A[0]+w.B[0])/2, (w.A[1]+w.B[1])/2];
    return {id:W.id, name:w.id, drho:W.rho-w.rho, dphi:wrap(W.phi-w.phi), dq:Math.cos(W.phi)*m[0]+Math.sin(W.phi)*m[1]-W.rho, sq:Math.sqrt(Math.max(0, W.cov[2]))}; });
  return {abschnitte, waende, hC:karte.hC};
}

// ------------------------------------------------ Pruefungen
const istHaupt=process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1];
if(istHaupt){
  const SCHNELL=process.argv.includes('--schnell');
  const out=[]; let ok=true;
  const chk=(name,cond,info='')=>{ ok=ok&&!!cond; out.push((cond?'ok   ':'ROT  ')+name+(info!==''?'  ('+info+')':'')); console.log(out[out.length-1]); };
  // Hinweis: gemessen und berichtet, kein Pruefkriterium dieses Moduls (z. B. Freigabe-Gates wie 10.3a)
  const hinweis=(name,cond,info='')=>{ out.push((cond?'ok   ':'HINW ')+name+(info!==''?'  ('+info+')':'')); console.log(out[out.length-1]); };
  const f1=x=>Number.isFinite(x) ? x.toFixed(1) : String(x), f2=x=>Number.isFinite(x) ? x.toFixed(2) : String(x), f3=x=>Number.isFinite(x) ? x.toFixed(3) : String(x), e1=x=>Number.isFinite(x) ? x.toExponential(1) : String(x);
  const src=read(DATEI), G=ladeG();

  // ---------------------------------------------- Datei und Einbau
  { const NAMEN=['resSegment', 'resSenk', 'resTiefe', 'resEbene', 'lmBloecke', 'lmAusgleich', 'covBlock', 'fehlerband'];
    const Gs={}; let fehler=null; try{ new Function('G', '"use strict";\n'+src)(Gs); }catch(x){ fehler=x.message; }
    const neu=Object.keys(Gs).sort(), soll=[...NAMEN].sort();
    chk('Datei laedt allein (new Function) und haengt genau die Namen aus 4 an G', !fehler && JSON.stringify(neu)===JSON.stringify(soll), fehler || neu.join(','));
    const G0=ladeG({platzhalter:false}), vorher=new Set(Object.keys(G0));
    chk('Datei endet mit genau einem Zeilenumbruch, kein import/export/</script>', /[^\n]\n$/.test(src) && !/^\s*(import|export)\s/m.test(src) && !src.includes('</script>'));
    chk('Kommentare ohne Umlaute (ae/oe/ue)', !/[äöüÄÖÜß]/.test(src));
    const verboten=[/Math\.random/, /Date\.now/, /performance\.now/, /\bwindow\b/, /\bdocument\b/, /\bself\b/, /new Date/].filter(r=>r.test(src.replace(/\/\/.*$/gm, '')));
    chk('kein Math.random, keine Uhr, kein DOM/Worker-Global im Code (2)', !verboten.length, verboten.map(String).join(' '));
    chk('keine function-Deklarationen im Block (geo-Block ohne use strict: Annex B machte sie global)', !/^\s*function\s/m.test(src.replace(/\/\/.*$/gm, '')));
    chk('atan2 nicht auf Matrixeintraegen (1.2)', !/atan2\s*\([^)]*\b(m|camTo|pose|T|M|mat|R)\s*\[\s*(0|2|8|10)\s*\]/.test(src.replace(/\/\/.*$/gm, '')));
    chk('im geo-Block eingefuegt bzw. von der Seite getragen', G.__quellen[DATEI]==='Datei' || G.__quellen[DATEI]==='Seite', G.__quellen[DATEI]);
    chk('M6 nutzt nur Namen aus M0/M4 und eigene (keine fremden G.*-Aufrufe)', (()=>{ const ruf=[...new Set([...src.replace(/\/\/.*$/gm, '').matchAll(/G\.([A-Za-z0-9_]+)/g)].map(m=>m[1]))];
      const erlaubt=new Set([...NAMEN, 'KG', 'gKomp', 'gInv', 'gBei', 'gmGewicht', 'hyst', 'wandSchnitt', 'ldlOrdnung', 'ldlSymb', 'ldlNum', 'ldlLoes', 'resKette', 'resKnoten', 'abschnittSigma']);
      return ruf.every(n=>erlaubt.has(n)); })(), [...new Set([...src.replace(/\/\/.*$/gm, '').matchAll(/G\.([A-Za-z0-9_]+)/g)].map(m=>m[1]))].join(','));
  }

  // ---------------------------------------------- Jacobi gegen zentrale Differenzen (ueber lmBloecke)
  // Eine Beob je Fall; Block (H, g) analytisch gegen J aus G.resSegment/G.resSenk mit zentralen Differenzen am
  // Zustand der Karte; Gewicht w aus G.gmGewicht wie in M6.
  { const S=sitzungF4('sprung'), basis=karteBauen(G, S, {start:'wahr', senk:'x'});
    const A1=basis.abschnitte[1];
    const fall=(name, wahl, mod)=>{
      const k=JSON.parse(JSON.stringify({x:0})); // Platzhalter
      const b0=basis.beob.find(wahl); if(!b0) return chk('Jacobi '+name, false, 'keine Beob');
      const karte={...basis, beob:[{...b0, mu:1}], bloecke:new Map(), waende:new Map([...basis.waende].map(([i,w])=>[i, {...w}])), ecken:new Map([...basis.ecken].map(([i,e])=>[i, {...e, p:[...e.p]}])),
        abschnitte:basis.abschnitte.map(a=>({...a, g:{...a.g}})), pp:{...basis.pp}};
      karte.abschnitte[1].g={psi:A1.g.psi+0.01, tx:A1.g.tx+0.03, ty:0.02, tz:A1.g.tz-0.02};   // weg vom Optimum, damit r != 0
      if(mod) mod(karte, karte.beob[0]);
      G.lmBloecke(karte, {pp:karte.pp.frei ? 'frei' : 'fest'});
      const B=[...karte.bloecke.values()][0], b=karte.beob[0];
      const W=b.art==='ecke' ? null : karte.waende.get(b.L), E=b.art==='ecke' ? karte.ecken.get(b.L) : null;
      const res=()=>b.art==='ecke' ? G.resSenk(b, E.waende ? [karte.waende.get(E.waende[0]), karte.waende.get(E.waende[1])] : E, karte) : G.resSegment(b, W, karte);
      const zug=k=>{ // Getter/Setter je Schluessel
        if(k[0]==='G'){ const ab=+k.slice(1, 6), c=+k.slice(-1), f=['psi', 'tx', 'ty', 'tz'][c], A=karte.abschnitte[ab]; return [()=>A.g[f], v=>{ A.g[f]=v; }]; }
        if(k[0]==='W'){ const id=+k.slice(1, 10), c=k.slice(-1), w=karte.waende.get(id); return c==='p' ? [()=>w.phi, v=>{ w.phi=v; }] : c==='r' ? [()=>w.rho, v=>{ w.rho=v; }] : w.h==='lokal' ? [()=>w.hLokal.h, v=>{ w.hLokal.h=v; }] : [()=>w.h, v=>{ w.h=v; }]; }
        if(k[0]==='E'){ const id=+k.slice(1, 10), c=k.slice(-1), e=karte.ecken.get(id); return [()=>e.p[c==='x' ? 0 : 1], v=>{ e.p[c==='x' ? 0 : 1]=v; }]; }
        if(k==='hc') return [()=>karte.hC, v=>{ karte.hC=v; }]; if(k==='hf') return [()=>karte.hF, v=>{ karte.hF=v; }];
        if(k==='ppx') return [()=>karte.pp.cx, v=>{ karte.pp.cx=v; }]; if(k==='ppy') return [()=>karte.pp.cy, v=>{ karte.pp.cy=v; }];
        throw new Error('Schluessel '+k); };
      const r0=res(), m=B.keys.length, J=[], h=1e-6;
      for(const k of B.keys){ const [get, set]=zug(k), v=get(); set(v+h); const rp=res(); set(v-h); const rm=res(); set(v); J.push(rp.map((x,i)=>(x-rm[i])/(2*h))); }
      const chi2=r0.reduce((s,x)=>s+x*x, 0), w=G.gmGewicht(Math.sqrt(chi2/r0.length), 3, 1);
      let eH=0, sH=0, eg=0, sg=0;
      for(let a=0;a<m;a++){ const gn=w*r0.reduce((s,x,i)=>s+J[a][i]*x, 0); eg=Math.max(eg, Math.abs(gn-B.g[a])); sg=Math.max(sg, Math.abs(gn));
        for(let c=a;c<m;c++){ const hn=w*r0.reduce((s,x,i)=>s+J[a][i]*J[c][i], 0); eH=Math.max(eH, Math.abs(hn-B.H[a*m+c])); sH=Math.max(sH, Math.abs(hn)); } }
      chk('Jacobi '+name+': Block H, g analytisch = zentrale Differenzen (rel. 1e-6)', eH<=1e-6*sH && eg<=1e-6*sg, `rel ${e1(eH/sH)} / ${e1(eg/sg)}, ${m} Spalten, r ${r0.map(f2).join('/')} px`);
    };
    fall('Decke (h_c)', b=>b.art==='decke' && b.ab===1);
    fall('Boden (h_f)', b=>b.art==='boden' && b.ab===1);
    fall('eigene Hoehe (Stoerer h = Zahl)', b=>b.art==='decke' && b.ab===1, (k,b)=>{ k.waende.get(b.L).h=2.3; });
    fall('eigene Hoehe (lokal)', b=>b.art==='decke' && b.ab===1, (k,b)=>{ const w=k.waende.get(b.L); w.h='lokal'; w.hLokal={h:2.2, lo:2.1, hi:2.3}; });
    fall('Erfassung (Fadenkreuz, wie Decke)', b=>b.art==='decke' && b.ab===1, (k,b)=>{ b.art='erfassung'; b.nutzer=true; });
    fall('Senkrechte, Schnitt zweier Waende', b=>b.art==='ecke' && b.ab===1);
    fall('Senkrechte, freie Ecke', b=>b.art==='ecke' && b.ab===1, (k,b)=>{ k.ecken.get(b.L).waende=null; });
    fall('Decke mit Hauptpunkt frei (cx, cy)', b=>b.art==='decke' && b.ab===1, k=>{ k.pp={cx:0.7, cy:-0.4, sig:0, frei:true}; });
    fall('Senkrechte mit Hauptpunkt frei', b=>b.art==='ecke' && b.ab===1, k=>{ k.pp={cx:-0.5, cy:0.9, sig:0, frei:true}; });
  }

  // ---------------------------------------------- F4: Sprung, Gier-Vorzeichen, T-Wechsel, Hoehe
  const lauf=(karte, o, runden=1)=>{ let r; for(let i=0;i<runden;i++){ G.lmBloecke(karte); r=G.lmAusgleich(karte, o); karte.runde++; } return r; };
  // Registrierungsstart: Raster 10 cm / 2° (registriere, 4) als Startfehler an der ersten Kamera des Abschnitts
  const umKamera=(G, g, c, d, richtDeg, psiDeg)=>{ const cs=Math.cos(psiDeg*D2R), sn=Math.sin(psiDeg*D2R), dv=[d*Math.cos(richtDeg*D2R), d*Math.sin(richtDeg*D2R)];
    return G.gKomp(g, {psi:psiDeg*D2R, tx:c[0]+dv[0]-(cs*c[0]-sn*c[2]), ty:0, tz:c[2]+dv[1]-(sn*c[0]+cs*c[2])}); };
  const startReg=(d, richt, psi)=>(G2, S, ab, gw)=>{ const B=S.bilder.find(x=>x.wahr.ab===ab).bildErg; return umKamera(G2, gw, [B.camTo[12], B.camTo[13], B.camTo[14]], d, richt, psi); };
  { const S=sitzungF4('sprung');
    for(const [name, start, o, runden] of [['Registrierungsstart 10 cm / 2°', startReg(0.10, 30, 2), {}, 6],
                                            ['Start 40 cm / 10° daneben, nur Stufe 3', startReg(0.40, 210, -10), {}, 6],
                                            ['Start 40 cm / 10° daneben, lago immer (Stufe 1+2+3)', startReg(0.40, 210, -10), {lago:'immer'}, 6],
                                            ['Kettenstart, nur Stufe 3', 'kette', {}, 6],
                                            ['Kettenstart, lago immer (Stufe 1+2+3)', 'kette', {lago:'immer'}, 6]]){
      const karte=karteBauen(G, S, {start}), F0=fehler(G, karte, S).abschnitte.find(a=>a.ab===1);
      const r=lauf(karte, o, runden), Fe=fehler(G, karte, S), a1=Fe.abschnitte.find(a=>a.ab===1);
      const wm=Fe.waende.reduce((m,w)=>Math.max(m, Math.abs(w.dq)), 0), zm=Fe.waende.reduce((m,w)=>Math.max(m, Math.abs(w.dq)/G.fehlerband(karte.waende.get(w.id), 0, 0, 0, karte)), 0);
      chk(`F4 sprung, ${name}: Rest <= 2 cm / 0,3° (17.5)`, r.ok && a1.lageMax<=0.02 && a1.psiMax<=0.3*D2R,
        `Start ${f1(100*F0.lageMed)} cm / ${f2(F0.psiMax*R2D)}°; Ende Lage Median ${f2(100*a1.lageMed)} cm, max ${f2(100*a1.lageMax)} cm, Gier ${f3(a1.psiMax*R2D)}°; Waende Querfehler (Mitte) <= ${f2(100*wm)} cm, |dq|/sigma <= ${f2(zm)}; ${runden} Runden; mm ${r.mm.map(x=>x.k+' '+f1(x.chi2)).join(',')}`);
      if(name.startsWith('Reg')){
        const g1=karte.abschnitte[1].g;
        chk('Gier-Vorzeichen: wahres dpsi = +10° wird +10° ± 0,3° (10.3)', Math.abs(g1.psi*R2D-10)<=0.3, `${f3(g1.psi*R2D)}°`); } }
  }
  { // 10.4 synthetisch (F4 rund, Posen exakt, sigma 1 px, Zuordnung wahr): |drho| <= 1 cm, |dphi| <= 0,5° je echter Wand
    const S=sitzungF4('rund'), karte=karteBauen(G, S, {start:'wahr'}); lauf(karte, {}, 8);
    const Fe=fehler(G, karte, S), zaehl=new Map(); for(const b of karte.beob) if(b.art!=='ecke') zaehl.set(b.L, (zaehl.get(b.L) || 0)+1);
    const gut=Fe.waende.filter(w=>Math.abs(w.dq)<=0.01 && Math.abs(w.dphi)<=0.5*D2R), schlecht=Fe.waende.filter(w=>!gut.includes(w));
    const z=Fe.waende.map(w=>Math.abs(w.dq)/G.fehlerband(karte.waende.get(w.id), (()=>{ const t=S.waende[w.id]; return (t.iv[0]+t.iv[1])/2; })(), 0, 0, karte));
    chk(`F4 rund: Waende Querfehler (Mitte) <= 1 cm und |dphi| <= 0,5° (10.4, nur M6 mit wahr-Zuordnung)`, schlecht.length===0,
      `${gut.length} von ${Fe.waende.length}; daneben ${schlecht.map(w=>`${w.name} ${f1(100*w.dq)} cm/${f2(w.dphi*R2D)}° (${zaehl.get(w.id)} Beob)`).join(', ') || '-'}; |dq|/sigma max ${f2(Math.max(...z))}`);
  }
  { const S=sitzungF4('twechsel'), karte=karteBauen(G, S, {start:'kette'}), s0=karte.schnitte[0];
    const r=lauf(karte, {}, 4), a1=fehler(G, karte, S).abschnitte.find(a=>a.ab===1);
    chk('F4 T-Wechsel 3 cm: Klasse nurT, Bindung pose, Komponente stetig, Rest <= 1 cm / 0,1° (17.5)', s0.klasse==='nurT' && s0.bindung.art==='pose' && s0.bindung.k==='stetig' && a1.lageMax<=0.01 && a1.psiMax<=0.1*D2R,
      `rPose ${f2(100*s0.rPose)} cm, k ${s0.bindung.k}, chi2 ${f2(r.mm[0].chi2)}, Lage max ${f2(100*a1.lageMax)} cm, Gier ${f3(a1.psiMax*R2D)}°`);
  }
  { // Max-Mixture-Mechanik (3.2.1, 6.5): Sprung 40 cm / 10° als reiner T-Wechsel fehleingeordnet (pose, sigma 1 cm / 0,2°):
    // Start aus der Kette erfuellt die Bindung (chi2 0), die Waende ziehen weg -> sprung, danach Rest wie ohne Bindung.
    const S=sitzungF4('sprung'), karte=karteBauen(G, S, {start:'wahr'}), s0=karte.schnitte[0];
    s0.klasse='nurT'; s0.bindung={art:'pose', sP:0.01, sY:0.2*D2R, sH:0.01, kern:'mm', mm:null, k:null};
    const dT=G.gKomp(G.gInv(G.gAusT(s0.TA)), G.gAusT(s0.TB)); karte.abschnitte[1].g=G.gKomp(karte.abschnitte[0].g, dT);
    const ks=[]; for(let i=0;i<20;i++){ G.lmBloecke(karte); const r=G.lmAusgleich(karte, {}); ks.push(r.mm[0].k+':'+f1(r.mm[0].chi2)); karte.runde++; }
    const a1=fehler(G, karte, S).abschnitte.find(a=>a.ab===1), wechsel=ks.slice(10).filter((k,i,a)=>i && k.split(':')[0]!==a[i-1].split(':')[0]).length;
    chk('Max-Mixture: fehlgeordneter Sprung (pose 1 cm) -> sprung, Rest <= 2 cm / 0,3°, <= 1 Wechsel in den letzten 10 Runden (10.3)', s0.bindung.k==='sprung' && a1.lageMax<=0.02 && a1.psiMax<=0.3*D2R && wechsel<=1,
      `Folge ${ks.slice(0, 4).join(' ')} ... ${ks[19]}; Lage max ${f2(100*a1.lageMax)} cm, Gier ${f3(a1.psiMax*R2D)}°; Wechsel ${wechsel}`);
  }
  { // Start je Abschnitt wie nach der Registrierung (10 cm / 2° an der ersten Kamera, Richtung je Abschnitt verschieden):
    // nach den Pausen (0,7 s) liegt der Kettenstart 44-159° daneben (Kamera dreht 45°/s), das loest erst registriere (4).
    const S=sitzungF4('hoehe'), stA=(G2, S2, ab, gw)=>{ const B=S2.bilder.find(x=>x.wahr.ab===ab).bildErg; return umKamera(G2, gw, [B.camTo[12], B.camTo[13], B.camTo[14]], 0.10, 30+60*ab, ab%2 ? 2 : -2); };
    const karte=karteBauen(G, S, {start:stA}), kk=karteBauen(G, S, {start:'kette'}), Fk=fehler(G, kk, S).abschnitte;
    const r=lauf(karte, {}, 8), Fe=fehler(G, karte, S), ty=Fe.abschnitte.map(a=>Math.abs(a.tyMax)), lage=Math.max(...Fe.abschnitte.map(a=>a.lageMax)), psi=Math.max(...Fe.abschnitte.map(a=>a.psiMax));
    const tyW=S.abWahr.map(a=>a.g.ty);
    chk('F4 Hoehe (sigma 2 cm je Abschnitt, Registrierungsstart): |ty - ty_wahr| <= 1 cm je Abschnitt, Lage <= 2 cm / 0,3° (10.4, 6.6 c)', r.ok && Math.max(...ty)<=0.01 && lage<=0.02 && psi<=0.3*D2R,
      `ty wahr ${tyW.map(x=>f1(100*x)).join('/')} cm; Fehler ${ty.map(x=>f2(100*x)).join('/')} cm (sigma ${karte.abschnitte.map(a=>f2(100*a.sig.y)).join('/')}); Lage max ${f2(100*lage)} cm, Gier ${f3(psi*R2D)}°; h_c ${f3(karte.hC)} m (sigma ${f1(1000*karte.sHC)} mm), q ${f2(karte.hoehen.q)}; Kettenstart waere ${Fk.map(a=>f1(a.psiMax*R2D)+'°').join('/')}`);
  }

  // ---------------------------------------------- Wiederholbarkeit, Uhr
  { const S=sitzungF4('sprung'), lauf2=uhr=>{ const dn=Date.now, pn=performance.now; Date.now=()=>uhr; performance.now=()=>uhr;
      try{ const karte=karteBauen(G, S, {start:startReg(0.10, 30, 2)}), r=[]; for(let i=0;i<3;i++){ G.lmBloecke(karte); r.push(G.lmAusgleich(karte, {lago:'auto'})); }
        const k={abschnitte:karte.abschnitte, waende:[...karte.waende.values()], ecken:[...karte.ecken.values()], hC:karte.hC, hF:karte.hF, sHC:karte.sHC, ldl:karte.ldl, beob:karte.beob.map(b=>[b.w, b.chi2, b.mu]),
          schnitte:karte.schnitte.map(s=>s.bindung.k), bloecke:[...karte.bloecke.keys()]};
        return JSON.stringify([k, r], (key, v)=>v instanceof Float64Array || v instanceof Int32Array ? Array.from(v) : v); }
      finally{ Date.now=dn; performance.now=pn; } };
    const a=lauf2(1e12), b=lauf2(42);
    chk('Wiederholbarkeit: zwei Laeufe gleicher Eingabe bitgleich, andere Uhr (17.5, 10.9)', a===b, `${a.length} Zeichen`);
  }

  // ---------------------------------------------- Takahashi gegen Spaltenloesungen, covBlock
  { const S=sitzungF4('sprung'), karte=karteBauen(G, S, {start:'wahr'}); lauf(karte, {}, 2);
    let m=0, s=0;
    for(const W of karte.waende.values()){ const C=G.covBlock(karte, [{L:W.id}]); m=Math.max(m, Math.abs(C[0]-W.cov[0]), Math.abs(C[1]-W.cov[1]), Math.abs(C[3]-W.cov[2])); s=Math.max(s, C[0], C[3]); }
    const A=karte.abschnitte[1], C=G.covBlock(karte, [{ab:1}]); for(let i=0;i<16;i++){ m=Math.max(m, Math.abs(C[i]-A.cov[i])); s=Math.max(s, Math.abs(A.cov[i])); }
    chk('Kovarianz: Takahashi (gespeichert) = Spaltenloesungen (covBlock), rel. 1e-9', m<=1e-9*s, `max ${e1(m)} bei ${e1(s)}; sig ${f2(100*A.sig.max)} cm / ${f3(A.sig.psi*R2D)}°`);
    const K0=karte.abschnitte[0].cov; chk('Kern: Kovarianz 0 (Eichung g = Einheit fest)', K0 && K0.every(x=>x===0));
  }

  // ---------------------------------------------- Fehlerband (Monte Carlo, gleiche Geometrie)
  { const N=SCHNELL ? 8 : 20, erg=sim(WAHRHEIT, {...SITZUNGEN.sprung, rausch:{sigPx:0}}), S=sitzungSim(erg), wahr=new Map(), est=[];
    const proben=[];
    for(let n=0;n<N;n++){ const karte=karteBauen(G, S, {start:'wahr', rausch:[1, 100+n], seed:200+n}); lauf(karte, {}, 3);
      const A=karte.abschnitte[1], gw=gWahr(G, S, 1, A.t0);
      for(const W of karte.waende.values()){ if(!W.beob) continue; const w=S.waende[W.id];
        for(const s of [w.iv[0], (w.iv[0]+w.iv[1])/2, w.iv[1]]){
          // Querlage im Bezug von Abschnitt 1: geschaetzt gegen wahr, an derselben Laengskoordinate (F0, Wahrheit)
          const q=(W2, g)=>{ const gi=G.gInv(g), phi=W2.phi+gi.psi, n=[Math.cos(phi), Math.sin(phi)], rho=W2.rho+n[0]*gi.tx+n[1]*gi.tz; return {phi, rho, n}; };
          const pB=G.gPlan(G.gInv(gw), [w.rho*Math.cos(w.phi)+s*-Math.sin(w.phi), w.rho*Math.sin(w.phi)+s*Math.cos(w.phi)]);
          const Le=q(W, A.g), Lw=q(w, gw), dq=(Le.n[0]*pB[0]+Le.n[1]*pB[1]-Le.rho);
          proben.push({id:W.id+':'+s.toFixed(2), dq, sig:G.fehlerband(W, s, 1, 3, karte)}); } } }
    const je=new Map(); for(const p of proben){ const e=je.get(p.id) || []; e.push(p); je.set(p.id, e); }
    let innen=0, alle=0, verh=[];
    for(const [id, e] of je){ if(e.length<N) continue; const m=e.reduce((s,x)=>s+x.dq, 0)/e.length, sd=Math.sqrt(e.reduce((s,x)=>s+x.dq*x.dq, 0)/e.length), sb=e.reduce((s,x)=>s+x.sig, 0)/e.length;
      for(const x of e){ alle++; if(Math.abs(x.dq)<=2*x.sig) innen++; } if(sd>0) verh.push({v:sb/sd, id}); }
    verh.sort((a,b)=>a.v-b.v);
    const anteil=innen/alle, vMed=verh[verh.length>>1].v, v90=verh[Math.floor(0.9*verh.length)].v, vMax=verh[verh.length-1];
    const wo=(()=>{ const [w, sx]=vMax.id.split(':'), t=S.waende[+w], s=+sx; return `${t.id} bei s = ${f2(s)} m (${Math.abs(s-t.iv[0])<1e-6 ? 'Anfang' : Math.abs(s-t.iv[1])<1e-6 ? 'Ende' : 'Mitte'}, ${f2(Math.abs(t.iv[1]-t.iv[0]))} m lang)`; })();
    // p90 nur mit 20 Laeufen: die Streuung aus 8 Laeufen (--schnell) schwankt je Stelle um etwa 25 %
    chk(`Fehlerband (${N} Rauschlaeufe, 1 px): wahrer Querfehler in >= 90 % innerhalb 2 sigma; Band/Streuung je Stelle im Median <= 1,5${SCHNELL ? '' : ' und p90 <= 1,5'} (17.5, Auslegung)`, anteil>=0.9 && vMed<=1.5 && (SCHNELL || v90<=1.5),
      `${f1(100*anteil)} % von ${alle}; Band/Streuung Median ${f2(vMed)}, p90 ${f2(v90)}, max ${f2(vMax.v)} an ${wo}`);
  }

  // ---------------------------------------------- Fehlerband und covBlock ohne Faktorisierung (Befund P-D 1, Kritik 35)
  // M6 schreibt W.band (Querblock Wand × G am letzten Knoten des laufenden Abschnitts, Koeffizienten des Bands). Geprueft:
  // Band aus W.band = Band aus der Faktorisierung; auf structuredClone und auf einer KarteStand-Form (3.6: Felder, JSON,
  // ohne A.cov/knoten.cov) dasselbe Band; nie 0 fuer Groessen ausserhalb der Faktorisierung (neue Wand, neuer Knoten).
  { const S=sitzungF4('sprung'), karte=karteBauen(G, S, {start:'wahr'}); lauf(karte, {}, 3);
    const stellen=W=>{ const t=S.waende[W.id]; return [t.iv[0], (t.iv[0]+t.iv[1])/2, t.iv[1]]; };
    let eB=0, eC=0, eJ=0, nB=0; const q0=new Set(), qC=new Set(), qJ=new Set();
    const klon=structuredClone(karte);
    const stand=JSON.parse(JSON.stringify({kern:karte.kern, waende:[...karte.waende.values()].map(w=>({id:w.id, rahmen:w.rahmen, phi:w.phi, rho:w.rho, cov:w.cov, band:w.band})),
      abschnitte:karte.abschnitte.map(a=>({ab:a.ab, t0:a.t0, t1:a.t1, g:a.g, sig:a.sig, stufe:a.stufe, w:a.w, mitWand:a.mitWand, knoten:null}))}));
    for(const W of karte.waende.values()) for(const sx of stellen(W)) for(const ab of [0, 1]){
      const a0={}, aC={}, aJ={}, f0=G.fehlerband(W, sx, ab, 3, karte, a0), fC=G.fehlerband(klon.waende.get(W.id), sx, ab, 3, klon, aC), fJ=G.fehlerband(stand.waende.find(w=>w.id===W.id), sx, ab, 3, stand, aJ);
      q0.add(a0.quelle); qC.add(aC.quelle); qJ.add(aJ.quelle);
      if(ab===1){ const B=W.band, fB=Math.sqrt(B.k[0]+2*B.k[1]*sx+B.k[2]*sx*sx); eB=Math.max(eB, Math.abs(fB-f0)/f0); nB++; }
      eC=Math.max(eC, Math.abs(fC-f0)/f0); eJ=Math.max(eJ, Math.abs(fJ-f0)/f0); }
    chk('Fehlerband: W.band = Faktorisierung (rel. 1e-9); structuredClone und KarteStand-Form (JSON, ohne A.cov) gleich (rel. 1e-9)', eB<=1e-9 && eC<=1e-9 && eJ<=1e-9 && [...q0].every(q=>q==='faktor') && [...qC].every(q=>q==='band' || q==='fest') && [...qJ].every(q=>q==='band' || q==='fest'),
      `${nB} Stellen ab 1, dazu ab 0 (Kern); rel. ${e1(eB)} / ${e1(eC)} / ${e1(eJ)}; Quellen ${[...q0].join(',')} / ${[...qC].join(',')} / ${[...qJ].join(',')}`);
    // ohne W.band und ohne A.cov (KarteStand ohne Feld band): NaN statt still 0
    const ohne=JSON.parse(JSON.stringify(stand)); for(const w of ohne.waende) delete w.band;
    const aO={}, fO=G.fehlerband(ohne.waende[3], 1.0, 1, 3, ohne, aO);
    chk('Fehlerband ohne band und ohne Abschnitts-cov: NaN mit Quelle fehlt (nie 0)', Number.isNaN(fO) && aO.quelle==='fehlt', `${fO} (${aO.quelle})`);
    // neue Wand nach dem Ausgleich mit eigener cov (sigma rho 2 cm): covBlock gibt ihre cov, Querterm NaN; Band >= 2 cm
    const W0=[...karte.waende.values()][3], Wn={...W0, id:999, cov:[(0.5*D2R)**2, 0, 0.02**2], band:null}; karte.waende.set(999, Wn);
    const C=G.covBlock(karte, [{L:999}, {ab:1}]), aN={}, fN=G.fehlerband(Wn, 1.0, 1, 3, karte, aN), fW=Math.sqrt(0.02**2-2*1.0*0+1.0*(0.5*D2R)**2);
    chk('neue Wand (sigma rho 2 cm, nicht in der Faktorisierung): covBlock = ihre cov, Querterm NaN, Band Schranke >= Wandanteil (nie 0)',
      C[0]===Wn.cov[0] && C[6*1+1]===Wn.cov[2] && Number.isNaN(C[2]) && !C.voll && C.quelle.join()==='gespeichert,faktor' && aN.quelle==='schranke' && fN>=fW,
      `C rho ${f2(100*Math.sqrt(C[7]))} cm, quer ${C[2]}, Quellen ${C.quelle.join(',')}; Band ${f2(100*fN)} cm (${aN.quelle}), Wandanteil ${f2(100*fW)} cm`);
    karte.waende.delete(999);
    const Cx=G.covBlock(karte, [{ab:1, j:4}]);
    chk('covBlock: Knoten ohne Faktorisierung und ohne knoten.cov -> gespeicherte cov des hoechsten Knotens darunter (nicht 0)', Cx.quelle[0]==='gespeichert-alt' && [0, 5, 10, 15].every(i=>Cx[i]>0), `${Cx.quelle[0]}, Diagonale ${[0, 5, 10, 15].map(i=>e1(Cx[i])).join('/')}`);
  }
  { // neuer letzter Knoten (von M4 nach dem Ausgleich angehaengt): Band aus W.band (knotenAlt), G-Anteil nicht 0
    const erg=sim(WAHRHEIT, {...SITZUNGEN.drift, wiederholen:1}), S=sitzungSim(erg), k=karteBauen(G, S, {start:'wahr'}), A=k.abschnitte[0];
    G.knotenSetzen(A, k.posen, k.beob); lauf(k, {knoten:true}, 3);
    const W=[...k.waende.values()].find(w=>w.band && w.band.j===A.knoten.t.length-1), s0=0.5, a1={}, f1v=G.fehlerband(W, s0, 0, 3, k, a1);
    const n=A.knoten.t.length, tN=A.knoten.t[n-1]+0.5;
    A.knoten={...A.knoten, t:Float64Array.from([...A.knoten.t, tN]), s:Float64Array.from([...A.knoten.s, A.knoten.s[n-1]+0.1]), c:[...A.knoten.c, A.knoten.c[n-1]]};
    const a2={}, f2v=G.fehlerband(W, s0, 0, 3, k, a2), C=G.covBlock(k, [{L:W.id}, {ab:0, j:n}]), fWand=Math.sqrt(Math.max(0, W.cov[2]-2*s0*W.cov[1]+s0*s0*W.cov[0]));
    // vorher (G am neuen Knoten = 0) kam der reine Wandanteil heraus; die Korrelation Wand × G macht das Band hier schmaler
    chk('neuer letzter Knoten (nach dem Ausgleich angehaengt): Band aus W.band (knotenAlt) = Band vor dem Anhaengen, nicht der reine Wandanteil; covBlock G = hoechster gespeicherter Knoten',
      a1.quelle==='faktor' && a2.quelle==='band' && a2.knotenAlt && Math.abs(f2v-f1v)<=1e-9*f1v && Math.abs(f2v-fWand)>0.01*fWand && C.quelle[1]==='gespeichert-alt' && C[2*6+2]>0,
      `vorher ${f2(1000*f1v)} mm (${a1.quelle}), nachher ${f2(1000*f2v)} mm (${a2.quelle}, knotenAlt ${a2.knotenAlt}), reiner Wandanteil ${f2(1000*fWand)} mm; covBlock ${C.quelle.join(',')}, sigma psi ${e1(Math.sqrt(C[14]))}`);
  }

  // ---------------------------------------------- Rueckfallweg: knoten false, lago aus, werfende Platzhalter
  { const S=sitzungF4('sprung'), werf=()=>{ throw new Error('Platzhalter wirft'); };
    let s2=src.replace(/const stufeGier=\(K, wahl\)=>\{/, 'const stufeGier=(K, wahl)=>{ throw new Error("Stufe 1 wirft");')
              .replace(/const stufeLinear=\(K, wahl\)=>\{/, 'const stufeLinear=(K, wahl)=>{ throw new Error("Stufe 2 wirft");');
    const ersetzt=s2!==src && (s2.match(/wirft/g) || []).length===2;
    const G2=ladeG({src:s2}); G2.knotenSetzen=werf; G2.resKnoten=werf;
    const R=(GG)=>{ const k=karteBauen(GG, S, {start:startReg(0.10, 30, 2)}), r=[]; for(let i=0;i<3;i++){ GG.lmBloecke(k); r.push(GG.lmAusgleich(k, {knoten:false, lago:'aus'})); }
      return JSON.stringify([k.abschnitte.map(a=>[a.g, Array.from(a.cov)]), [...k.waende.values()].map(w=>[w.phi, w.rho, w.cov]), r]); };
    let a, b, fehl=null; try{ a=R(G); b=R(G2); }catch(x){ fehl=x.message; }
    chk('knoten:false + lago:aus = Lauf mit werfenden Stufen 1/2 und werfendem knotenSetzen/resKnoten (17.5)', ersetzt && !fehl && a===b, fehl || (ersetzt ? `${a.length} Zeichen gleich` : 'Ersetzung fehlgeschlagen'));
  }

  // ---------------------------------------------- Knoten (T3 ohne Drift): Ergebnis gleich knoten:false
  // Ohne Rauschen muss das Ergebnis gleich sein (<= 1 mm); mit 1 px Rauschen nehmen die Knoten Rauschen auf: berichtet
  // als Unterschied der Waende (Querfehler an der Wandmitte) gegen ihr sigma.
  for(const sp of [0, 1]){ const erg=sim(WAHRHEIT, {...SITZUNGEN.rund, seed:31, wiederholen:SCHNELL ? 1 : 2, rausch:{sigPx:sp}}), S=sitzungSim(erg);
    const k0=karteBauen(G, S, {start:'wahr', seed:5}), k1=karteBauen(G, S, {start:'wahr', seed:5});
    G.knotenSetzen(k1.abschnitte[0], k1.posen, k1.beob);
    const nK=k1.abschnitte[0].knoten.t.length;
    lauf(k0, {}, 6); lauf(k1, {knoten:true}, 6);
    let dw=0, zw=0, de=0; const F0=fehler(G, k0, S), F1=fehler(G, k1, S);
    for(const w of F0.waende){ const v=F1.waende.find(x=>x.id===w.id); dw=Math.max(dw, Math.abs(w.dq-v.dq)); zw=Math.max(zw, Math.abs(w.dq-v.dq)/Math.max(1e-9, w.sq)); }
    for(const E of k0.ecken.values()){ const V=k1.ecken.get(E.id); de=Math.max(de, Math.hypot(E.p[0]-V.p[0], E.p[1]-V.p[1])); }
    const d=k1.abschnitte[0].knoten.d; let dmax=0; for(let j=0;j<d.length;j+=4) dmax=Math.max(dmax, Math.hypot(d[j+1], d[j+3]));
    if(sp===0) chk('Knoten ohne Drift, ohne Rauschen (T3): Waende und Ecken gleich knoten:false (<= 1 mm, 10.3a Punkt 2)', dw<=0.001 && de<=0.001,
      `${nK} Knoten, Waende max ${f2(1000*dw)} mm, Ecken max ${f2(1000*de)} mm, |d_j| <= ${f2(1000*dmax)} mm`);
    else hinweis('Knoten ohne Drift, 1 px Rauschen (T3): Unterschied der Waende <= 1 sigma (10.3a Punkt 2 mit Rauschen)', zw<=1,
      `${nK} Knoten, Waende max ${f2(1000*dw)} mm (${f2(zw)} sigma), Ecken max ${f2(1000*de)} mm, |d_j| <= ${f2(1000*dmax)} mm`); }

  // ---------------------------------------------- Runde wie M10 Schritt 5: global, dann lokal (nurAb) im Wechsel
  // Abschnitt 4 von F4 hoehe wird lokal (eigene Waende rahmen = 4 im Bezug, Beob umgehaengt). Geprueft: die lokalen
  // Aufrufe loeschen die globalen Bloecke nicht (und umgekehrt), covBlock/fehlerband global unveraendert nach nurAb,
  // eingeschwungen keine Neulinearisierung; frische Karte mit relinMax 500: keine Kovarianz 0 ausser dem Kern.
  const lokalMachen=(karte, S, ab)=>{ const A=karte.abschnitte[ab], gi=G.gInv(A.g), lok=new Map(); A.stufe='lokal';
    for(const b of karte.beob){ if(b.ab!==ab || b.art==='ecke') continue; const id=5000+b.L;
      if(!lok.has(id)){ const w=S.waende[b.L], phi=w.phi+gi.psi, n=[Math.cos(phi), Math.sin(phi)];
        lok.set(id, {...karte.waende.get(b.L), id, rahmen:ab, phi:((phi%(2*Math.PI))+2*Math.PI)%(2*Math.PI), rho:w.rho+n[0]*gi.tx+n[1]*gi.tz+0.02, cov:null}); }
      b.L=id; }
    for(const [id, w] of lok) karte.waende.set(id, w); return lok; };
  { const S=sitzungF4('hoehe'), stA=(G2, S2, ab, gw)=>{ const B=S2.bilder.find(x=>x.wahr.ab===ab).bildErg; return umKamera(G2, gw, [B.camTo[12], B.camTo[13], B.camTo[14]], 0.10, 30+60*ab, ab%2 ? 2 : -2); };
    const karte=karteBauen(G, S, {start:stA}); lokalMachen(karte, S, 4);
    const W0=karte.waende.get(0), vgl=[]; let rl=[];
    for(let r=0;r<13;r++){ const nb=G.lmBloecke(karte), rg=G.lmAusgleich(karte, {}), c1=Array.from(G.covBlock(karte, [{L:0}, {ab:2}])), f1=G.fehlerband(W0, 1.0, 2, 3, karte);
      const rlok=G.lmAusgleich(karte, {nurAb:4}), c2=Array.from(G.covBlock(karte, [{L:0}, {ab:2}])), f2=G.fehlerband(W0, 1.0, 2, 3, karte);
      vgl.push(c1.every((x,i)=>x===c2[i]) && f1===f2); rl.push([nb.neu, rg.relin, rlok.relin]); karte.runde++; }
    const [nbL, rgL, rlL]=rl[rl.length-1], F=fehler(G, karte, S);
    chk('M10-Runde global + nurAb: Bloecke bleiben je Bereich, covBlock/fehlerband global unveraendert nach nurAb, eingeschwungen 0 neu linearisiert', vgl.every(Boolean) && nbL===0 && rgL===0 && rlL===0 && karte.abschnitte[4].hLok,
      `Runde 1 lmBloecke ${rl[0][0]} neu, global ${rl[0][1]}, lokal ${rl[0][2]} Reste; Runde 13: ${nbL} / ${rgL} / ${rlL}; Bloecke ${karte.bloecke.size}; Abschnitte 0-3 Lage max ${f2(100*Math.max(...F.abschnitte.filter(a=>a.ab<4).map(a=>a.lageMax)))} cm, hLok(4) ${f3(karte.abschnitte[4].hLok.hC)}`);
    const k2=karteBauen(G, S, {start:stA}); for(const w of k2.waende.values()) w.cov=null; for(const a of k2.abschnitte) a.cov=null;
    const r2=G.lmAusgleich(k2, {relinMax:500});
    const null0=c=>c && c.length && (c.length===3 ? !(c[0]>0 && c[2]>0) : !([0, 5, 10, 15].every(i=>c[i]>0)));   // eine Varianz 0 genuegt
    const wNull=[...k2.waende.values()].filter(w=>null0(w.cov)).length, aNull=k2.abschnitte.filter(a=>a.ab!==k2.kern && null0(a.cov)).length;
    const wOhne=[...k2.waende.values()].filter(w=>!w.cov).length, aOhne=k2.abschnitte.filter(a=>!a.cov).length;
    chk('relinMax 500 auf frischer Karte: keine Varianz 0 ausser am Kern (ohne Block: alter Stand bleibt)', r2.ok && wNull===0 && aNull===0,
      `${r2.relin} Reste, ${r2.offen} Bloecke offen; Waende ohne neue cov ${wOhne}, Abschnitte ohne ${aOhne}; mit cov 0: ${wNull} Waende, ${aNull} Abschnitte`);
  }

  // ---------------------------------------------- Hauptpunkt frei (T3 pp = [1, 1] px), Prior sigma 1 px
  { const erg=sim(WAHRHEIT, {...SITZUNGEN.pp}), S=sitzungSim(erg), kF=karteBauen(G, S, {start:'wahr'}), k0=karteBauen(G, S, {start:'wahr'});
    lauf(kF, {pp:'frei'}, 8); lauf(k0, {}, 8);
    const F=fehler(G, kF, S), F0=fehler(G, k0, S), rms=k=>{ const r=k.beob.filter(b=>b.art!=='ecke').map(b=>G.resSegment(b, k.waende.get(b.L), k)).flat(); return Math.sqrt(r.reduce((a,x)=>a+x*x, 0)/r.length); };
    const mw=Fe=>Math.max(...Fe.waende.map(w=>Math.abs(w.dq)));
    chk('pp frei (T3 pp = 1/1 px): Schaetzung cx, cy je ±0,3 px, Bildrest nicht schlechter (14, 6.7)', Math.abs(kF.pp.cx-1)<=0.3 && Math.abs(kF.pp.cy-1)<=0.3 && rms(kF)<=rms(k0),
      `cx ${f2(kF.pp.cx)}, cy ${f2(kF.pp.cy)} px (sigma ${f2(kF.pp.sig)}); Rest ${f3(rms(kF))} gegen ${f3(rms(k0))} px fest; Waende |dq| max ${f2(100*mw(F))} gegen ${f2(100*mw(F0))} cm; h_c ${f3(kF.hC)} / ${f3(k0.hC)}`);
    const cx0=kF.pp.cx, cy0=kF.pp.cy; lauf(kF, {pp:'fest'}, 2);
    chk('pp: ausdruecklich fest nach frei haelt cx, cy fest (frei false, Werte bleiben)', kF.pp.cx===cx0 && kF.pp.cy===cy0 && kF.pp.frei===false, `cx ${cx0} -> ${kF.pp.cx}, frei ${kF.pp.frei}`);
  }
  // ---------------------------------------------- lago 'auto' ohne falschen Strukturwechsel; Arbeitsbudget hart
  { const S=sitzungF4('sprung'), k=karteBauen(G, S, {start:'wahr'}), gr=[]; for(let i=0;i<4;i++){ G.lmBloecke(k); gr.push(G.lmAusgleich(k, {lago:'auto'}).stufen.grund || '-'); }
    chk("lago 'auto': Stufe 1/2 nur in Runde 1 (Kern), danach kein Strukturwechsel (ungewaehlte Bindung = stetig)", gr[0]==='kern' && gr.slice(1).every(x=>x==='-'), gr.join(' '));
    const k2=karteBauen(G, S, {start:'wahr'}), r0=G.lmAusgleich(k2, {relinMax:0}), b0=G.lmBloecke(k2, {max:0}), b1=G.lmBloecke(k2, {relinMax:3000}), r1=G.lmAusgleich(k2, {relinMax:3000, iter:3});
    const gross=Math.max(...[...k2.bloecke.values()].map(B=>B.nRes));
    chk('Budget: relinMax 0 bzw. max 0 -> 0 Reste; lmBloecke ohne max nimmt relinMax; Ueberschreitung hoechstens ein Block je Aufruf', r0.relin===0 && b0.relin===0 && b1.relin<=3000+gross && r1.relin<=3000+gross,
      `${r0.relin} / ${b0.relin} / lmBloecke ${b1.relin} / lmAusgleich ${r1.relin} (groesster Block ${gross} Reste)`); }

  // ---------------------------------------------- resEbene, resTiefe (Gewicht 0), transaktional, Wiederholbarkeit mit Knoten
  { const W={phi:0.7, rho:2.3}, g={psi:0.3, tx:0.4, ty:0.1, tz:-0.8}, gi=G.gInv(g), phiB=W.phi+gi.psi, nB=[Math.cos(phiB), Math.sin(phiB)], rhoB=W.rho+nB[0]*gi.tx+nB[1]*gi.tz;
    const e=G.resEbene({phi:phiB, rho:rhoB}, W, g), uB=[-nB[1], nB[0]], P=[rhoB*nB[0]+0.5*uB[0], rhoB*nB[1]+0.5*uB[1], rhoB*nB[0]-1.2*uB[0], rhoB*nB[1]-1.2*uB[1]];
    const t=G.resTiefe({pts:P}, W, g), t2=G.resTiefe({theta:phiB, rho:rhoB+0.05, extent:[-1, 1]}, W, g);
    chk('resEbene/resTiefe: Ebene auf der Wand -> 0, 5 cm davor -> 0,05 m (Gewicht 0, nicht im Ausgleich)', Math.abs(e[0])<1e-12 && Math.abs(e[1])<1e-12 && t.every(x=>Math.abs(x)<1e-6) && t2.every(x=>Math.abs(x-0.05)<1e-6),
      `${e.map(e1).join('/')}, ${Array.from(t).map(e1).join('/')}, ${Array.from(t2).map(f3).join('/')}`); }
  { const S=sitzungF4('sprung'), karte=karteBauen(G, S, {start:'wahr'}); lauf(karte, {}, 1);
    const vor=JSON.stringify([karte.abschnitte, [...karte.waende.values()], karte.hC, karte.beob.map(b=>[b.w, b.mu]), [...karte.bloecke.keys()]], (k,v)=>v instanceof Float64Array ? Array.from(v) : v);
    const n0=G.ldlNum; G.ldlNum=()=>null; let r; try{ r=G.lmAusgleich(karte, {}); } finally{ G.ldlNum=n0; }
    const nach=JSON.stringify([karte.abschnitte, [...karte.waende.values()], karte.hC, karte.beob.map(b=>[b.w, b.mu]), [...karte.bloecke.keys()]], (k,v)=>v instanceof Float64Array ? Array.from(v) : v);
    chk('transaktional: ldlNum singulaer -> ok = false, Karte unveraendert (14.1)', r.ok===false && vor===nach, r.grund); }
  { const erg=sim(WAHRHEIT, {...SITZUNGEN.drift, wiederholen:1}), S=sitzungSim(erg);
    const R=()=>{ const k=karteBauen(G, S, {start:'wahr'}); G.knotenSetzen(k.abschnitte[0], k.posen, k.beob); const r=[]; for(let i=0;i<3;i++){ G.lmBloecke(k); r.push(G.lmAusgleich(k, {knoten:true, lago:'immer'})); }
      return JSON.stringify([k.abschnitte, [...k.waende.values()], r], (key,v)=>v instanceof Float64Array || v instanceof Int32Array ? Array.from(v) : v); };
    const a=R(), b=R(); chk('Wiederholbarkeit mit Knoten und lago immer (bitgleich)', a===b, `${a.length} Zeichen`); }

  // ---------------------------------------------- lokaler Ausgleich (nurAb)
  { const S=sitzungF4('sprung'), karte=karteBauen(G, S, {start:'wahr'});
    // Abschnitt 1 lokal: Waende mit rahmen = 1 im eigenen Bezug, Start aus der Wahrheit unter g_1^-1
    const A=karte.abschnitte[1], gi=G.gInv(A.g); A.stufe='lokal';
    const lok=new Map();
    for(const b of karte.beob){ if(b.ab!==1 || b.art==='ecke') continue; const id=5000+b.L; if(!lok.has(id)){ const w=S.waende[b.L], phi=w.phi+gi.psi, n=[Math.cos(phi), Math.sin(phi)];
        lok.set(id, {...karte.waende.get(b.L), id, rahmen:1, phi:((phi%(2*Math.PI))+2*Math.PI)%(2*Math.PI), rho:w.rho+n[0]*gi.tx+n[1]*gi.tz+0.02}); } b.L=id; }
    for(const [id, w] of lok) karte.waende.set(id, w);
    karte.beob=karte.beob.filter(b=>b.ab===1 && b.art!=='ecke');
    let r; for(let i=0;i<4;i++) r=G.lmAusgleich(karte, {nurAb:1});
    let m=0, z=0; for(const [id, w] of lok){ const t=S.waende[id-5000], c=G.gPlan(gi, [(t.A[0]+t.B[0])/2, (t.A[1]+t.B[1])/2]), dq=Math.cos(w.phi)*c[0]+Math.sin(w.phi)*c[1]-w.rho;
      m=Math.max(m, Math.abs(dq)); const s=Math.sqrt(w.cov[2]); z=Math.max(z, Math.abs(dq)/G.fehlerband(w, -Math.sin(w.phi)*c[0]+Math.cos(w.phi)*c[1], 1, 0, {...karte, abschnitte:karte.abschnitte.map((a,i)=>i===1 ? {...a, g:{psi:0, tx:0, ty:0, tz:0}, cov:null} : a)})); }
    chk('nurAb: lokale Karte im eigenen Bezug (g fest), hLok.hC <= 1 cm, Waende |dq| <= 3 sigma', r.ok && A.hLok && Math.abs(A.hLok.hC-(2.416-A.g.ty))<=0.01 && z<=3,
      `hLok.hC ${f3(A.hLok && A.hLok.hC)} (wahr ${f3(2.416-A.g.ty)}), Waende Querfehler (Mitte) max ${f2(100*m)} cm, max ${f2(z)} sigma, ${lok.size} lokale Waende`);
  }

  console.log(ok ? '\nALLE CHECKS GRÜN' : '\nCHECKS ROT'); process.exit(ok ? 0 : 1);
}
