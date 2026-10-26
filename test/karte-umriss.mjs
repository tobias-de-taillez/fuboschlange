// Prueft M7 raumskizze-umriss.js (ARCHITEKTUR v3, 17.6): Datei und Einbau, UM_DEF wie 4, Determinismus,
// Weg a (Min-Cut-Loecher mit phi-Tor und Hysterese), Weg b (Inselhypothesen, Stufen ueber Runden),
// Exportregel 7.3, inselFest/ausschluss, Einschmelzen (7.6), Versprung 3σ und kollineare Nachbarkanten,
// tuerTiefe und Durchblick (8.1), Linienarten (decke/boden/ecken/lokal) und umrissEingabe mit G.gBei
// (Pflicht 8) an T3-Sitzungen. Laedt vendor + geo von raumskizze-probe.html wie raumskizze-protokoll.mjs;
// fehlt M0 oder M7 (wortgleich), wird die Datei als eigener Block vor globalThis.RAUMSKIZZE=G; eingefuegt.
//
// Platzhalter fuer M5/M6 (17.6 "Mocks: Landmarken aus F4/T3"): karteAusSim(e, o) baut aus einer T3-Sitzung
// eine KarteZustand-Form (Abschnitte mit wahrem g und Knoten, Bilder, Beob je Segment, Waende je Kante der
// Welt, Ecken aus Senkrechten). ORAKEL, nicht M5: Gruppen nach wahr.kid, Klassen aus der Art der Kante
// (Schiene/Moebel/Sturz 'stoer', Schrankfront 'schrank'), Durchblick nachgebildet nach der Regel von
// G.lmDurchblick (Strahlen anderer Landmarken unter der Linie, >= 3 Strahlen aus >= 2 Standpunkten; in
// Luecken zu kollinearen Nachbarn bis tuerBreite 1,2 m; Strahlen nur zu Nicht-Stoerern, Ziel >= 10 cm hinter der Linie),
// 'unterzug' ab 80 % Durchblick und >= 0,5 m Beleg (wie M5 unterzugMinL). Mit
// {klasse:false, durchblick:false} entfallen die Orakel. kante4: 'stoer' (Vorgabe: waagerechte Kante unter der Decke auf
// einer Wand, Sturz/Unterzug-Unterkante, eigene Landmarke 'stoer') | 'wand' (gehoert zur Wand derselben Ebene).
// durchblickWinkel (Grad, Vorgabe 0 wie M5): streifende Strahlen unter diesem Winkel zur Linie zaehlen nicht (Variante,
// Empfehlung an M5, Bericht P-E). hFehler (m): Decken-Beob mit falscher Deckenhoehe gehoben, hC entsprechend (H ± 1 cm).
//
// Abnahme 10.5 (eigener Exit-Code): node test/karte-umriss.mjs --abnahme [--n=20] [--samen=5]
//
//   node test/karte-umriss.mjs            (RAUMSKIZZE_HTML=pfad: anderer Stand der Seite)
//   import {G, karteAusSim, runden, ringMass, ...} from './test/karte-umriss.mjs'   (Messskripte, design/bau/P-E)
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as T3 from '../raumskizze-sim.mjs';
import * as T2 from '../raumskizze-metrik.mjs';

const read=f=>readFileSync(new URL('../'+f, import.meta.url), 'utf8');
const html=process.env.RAUMSKIZZE_HTML ? readFileSync(process.env.RAUMSKIZZE_HTML, 'utf8') : read('raumskizze-probe.html');
const pick=id=>{ const m=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`)); if(!m) throw new Error(`Script-Block "${id}" nicht gefunden`); return m[1]; };
const DATEI='raumskizze-umriss.js', src=read(DATEI), mark='globalThis.RAUMSKIZZE=G;';
let geo=pick('geo');
const traegt=geo.includes('{\n'+src+'}\n') || geo.includes('{\n'+src+'\n}\n');
const vorKeys=(()=>{ const hatte=Object.prototype.hasOwnProperty.call(globalThis, 'RAUMSKIZZE'), v=globalThis.RAUMSKIZZE; new Function('"use strict";\n'+pick('vendor')+'\n'+geo)();
  const k=new Set(Object.keys(globalThis.RAUMSKIZZE)); if(hatte) globalThis.RAUMSKIZZE=v; else delete globalThis.RAUMSKIZZE; return k; })();
if(!/G\.gBei=/.test(geo)){ const at=geo.lastIndexOf(mark); geo=geo.slice(0, at)+'{\n'+read('raumskizze-karte-grund.js')+'\n}\n'+geo.slice(at); }
if(!traegt){ const at=geo.lastIndexOf(mark); geo=geo.slice(0, at)+'{\n'+src+'\n}\n'+geo.slice(at); }
// M10 fuer den Integrationstest (Kartenlauf mit echtem M7); nur eingefuegt, wenn die Seite ihn nicht traegt
const ML='raumskizze-kartenlauf.js', mlSrc=read(ML), traegtML=geo.includes('{\n'+mlSrc+'}\n') || geo.includes('{\n'+mlSrc+'\n}\n') || /G\.karteRechnen=/.test(geo);
if(!traegtML){ const at=geo.lastIndexOf(mark); geo=geo.slice(0, at)+'{\n'+mlSrc+'\n}\n'+geo.slice(at); }
new Function('"use strict";\n'+pick('vendor')+'\n'+geo)();
export const G=globalThis.RAUMSKIZZE;
const D2R=Math.PI/180, R2D=180/Math.PI, H=T3.H_LASER;
const q=(a,p)=>{ if(!a.length) return NaN; const s=Float64Array.from(a).sort(); return s[Math.min(s.length-1, Math.floor(p*s.length))]; };
const f2=x=>Number.isFinite(x) ? x.toFixed(2) : String(x), f3=x=>Number.isFinite(x) ? x.toFixed(3) : String(x), cm=x=>Number.isFinite(x) ? (100*x).toFixed(1) : String(x);
const pip=(p,P)=>{ let c=false; for(let i=0,j=P.length-1;i<P.length;j=i++){ const a=P[i], b=P[j]; if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) c=!c; } return c; };
const flaeche=P=>{ let a=0; for(let i=0,j=P.length-1;i<P.length;j=i++) a+=P[j][0]*P[i][1]-P[i][0]*P[j][1]; return Math.abs(a)/2; };
const mitte=P=>P.reduce((s,p)=>[s[0]+p[0]/P.length, s[1]+p[1]/P.length], [0,0]);
const segD=(p,a,b)=>{ const ex=b[0]-a[0], ey=b[1]-a[1], L2=ex*ex+ey*ey, t=L2>0 ? Math.max(0, Math.min(1, ((p[0]-a[0])*ex+(p[1]-a[1])*ey)/L2)) : 0; return Math.hypot(p[0]-a[0]-t*ex, p[1]-a[1]-t*ey); };
const wrap2pi=a=>{ a%=2*Math.PI; return a<0 ? a+2*Math.PI : a; };

// ------------------------------------------------- Platzhalter M5/M6 aus T3 (Orakel, siehe Kopf)
// e: Ergebnis von T3.sim (oder F4 ueber f4AlsSim). o.bis: nur Bilder bis t (Runden als wachsende Zeitschnitte).
export function karteAusSim(e, o={}){
  const O={bis:Infinity, klasse:true, durchblick:true, erfassungen:false, gepasst:false, sigRho:0, sigPhiDeg:0, secT:0, secR:0, secH:0, seed:1, knoten:true,
    tuerBreite:1.2, schluessel:{dP:0.10, dW:5}, mitte:[4.2, 5.2], kante4:'stoer', durchblickWinkel:0, hFehler:0, ...o};
  const W=e.welt, K=W.kanten, KL=G.KG.KL, rS=G.KG.rnd((O.seed|0)*7919+11), gs=()=>{ let u=0; while(!u) u=rS(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rS()); };
  // Abschnitte: wahres g, Knoten d je Zeile (T3), optional Restversatz um die Raummitte (nicht Abschnitt 0)
  const abschnitte=e.abschnitte.map(a=>{ let g={...a.g};
    if(a.ab>0 && (O.secT || O.secR || O.secH)){ const r=O.secR*D2R*gs(), c=O.mitte, cs=Math.cos(r), sn=Math.sin(r);
      g=G.gKomp({psi:r, tx:c[0]-(cs*c[0]-sn*c[1])+O.secT*gs(), ty:O.secH*gs(), tz:c[1]-(sn*c[0]+cs*c[1])+O.secT*gs()}, g); }
    const kn=O.knoten && a.knoten && a.knoten.length>1 && a.knoten.some(k=>k.d.some(v=>v!==0))
      ? {t:Float64Array.from(a.knoten.map(k=>k.t)), s:new Float64Array(a.knoten.length), d:Float64Array.from(a.knoten.flatMap(k=>k.d)), cov:null} : null;
    return {ab:a.ab, t0:a.t0, t1:a.t1, ep0:0, ep1:0, g0:{...g}, g, cov:null, knoten:kn, hLok:null, sig:null, reg:null, stufe:'verbunden', w:1, nBilder:0, nSchluessel:0, nBeob:0, mitWand:true}; });
  const AB=new Map(abschnitte.map(a=>[a.ab, a]));
  const bilder=new Map(), beob=[], gruppen=new Map(), ecken=new Map(), letzte=new Map();
  const ebV=E=>E.ebenen.find(x=>Math.abs(x.n[1])<1e-9);
  const schl=(L, ab, c, blick)=>{ const k=L+'|'+ab, z=letzte.get(k); if(z && Math.hypot(c[0]-z.c[0], c[2]-z.c[2])<O.schluessel.dP && Math.abs(Math.atan2(Math.sin(blick-z.b), Math.cos(blick-z.b)))<O.schluessel.dW*D2R) return false;
    letzte.set(k, {c, b:blick}); return true; };
  for(const {bildErg:B, wahr:w} of e.bilder){ if(B.t>O.bis) continue;
    const ab=w.ab, c=[B.camTo[12], B.camTo[13], B.camTo[14]], blick=G.blickPlan(B.camTo);
    bilder.set(B.k, {t:B.t, ab, ep:B.ep, c, camTo:B.camTo, f:B.f, schluessel:false});
    for(let j=0;j<B.n;j++){ const kid=w.kid[j]; if(kid<0 || B.cls[j]===KL.X) continue; const E=K[kid];
      const da=[B.dir[6*j], B.dir[6*j+1], B.dir[6*j+2]], db=[B.dir[6*j+3], B.dir[6*j+4], B.dir[6*j+5]];
      if(E.kante===2){ if(E.ecke<0) continue; const id='E'+E.ecke; let Ec=ecken.get(id);
        if(!Ec){ const ee=W.ecken[E.ecke]; Ec={id, rahmen:-1, p:[...ee.p], cov:[1e-4, 0, 1e-4], art:E.konkav ? 'konkav' : 'konvex',
          waende:W.waende.map((x,i)=>x.a===ee.id || x.b===ee.id ? 'W'+i : null).filter(Boolean), beob:[], frei:[], senk:true, top:Math.max(E.A[1], E.B[1]), nPeil:0, _k:new Set()}; ecken.set(id, Ec); }
        const bi=beob.length; beob.push({id:bi, k:B.k, t:B.t, ab, ep:B.ep, i:j, art:'ecke', L:id, c, da, db, sPx:1, f:B.f, len:B.seg[10*j+9], nSeg:1, schluessel:true, nutzer:false, w:1, chi2:0, mu:1});
        Ec.beob.push(bi); if(!Ec._k.has(B.k)){ Ec._k.add(B.k); Ec.nPeil++; } continue; }
      const y=E.A[1], v=ebV(E); if(!v) continue;
      const key=E.wand>=0 && (E.kante===0 || E.kante===1 || (E.kante===4 && O.kante4==='wand')) ? 'W'+E.wand : E.kante===4 ? 'K'+E.wand+':'+Math.round(1e3*y)
        : E.art+':'+(E.objekt || '')+':'+Math.round(1e3*Math.atan2(v.n[2], v.n[0]))+':'+Math.round(1e3*v.d);
      let gr=gruppen.get(key);
      if(!gr){ const nn=E.wand>=0 ? W.waende[E.wand].n : [v.n[0], v.n[2]], d=E.wand>=0 ? W.waende[E.wand].rho : v.d;
        gr={key, n:nn, d, art:E.wand>=0 && (E.kante!==4 || key[0]==='W') ? 'wand' : E.art, objekt:E.objekt, kante4:E.kante===4 && key[0]!=='W', ys:new Set(), beob:[], kids:new Set()}; gruppen.set(key, gr); }
      gr.ys.add(Math.round(1e3*y)/1e3); gr.kids.add(kid);
      const bi=beob.length, art=Math.abs(y-H)<0.01 ? 'decke' : y<0.01 ? 'boden' : 'stoer';
      beob.push({id:bi, k:B.k, t:B.t, ab, ep:B.ep, i:j, art, L:key, c, da, db, sPx:B.seg[10*j+5], f:B.f, len:B.seg[10*j+9], nSeg:1, schluessel:schl(key, ab, c, blick), nutzer:false, w:1, chi2:0, mu:1, _y:y});
      gr.beob.push(bi); } }
  if(O.erfassungen) for(const x of e.erfassungen){ if(x.t>O.bis) continue; const E=K[x.wahr.kid]; if(!E || E.wand<0) continue; const key='W'+E.wand, gr=gruppen.get(key); if(!gr) continue;
    const bi=beob.length; beob.push({id:bi, k:-1, t:x.t, ab:x.wahr.ab, ep:x.erf.ep, i:-1, art:'erfassung', L:key, c:x.erf.ra.o, da:x.erf.ra.d, db:x.erf.rb.d, sPx:1, f:461, len:0, nSeg:1, schluessel:true, nutzer:true, w:1, chi2:0, mu:1, _y:H}); gr.beob.push(bi); }
  // Heben mit wahrem g (Knoten) auf die wahre Hoehe der Kante: Punkte in F0
  const heb=(b, d)=>{ const A=AB.get(b.ab), g=G.gBei(A, b.t); if(!(d[1]>1e-6 || d[1]<-1e-6)) return null; const s=(b._y+(b.art==='decke' ? O.hFehler : 0)-g.ty-b.c[1])/d[1]; if(!(s>0) || s>30) return null;
    return G.gPlan(g, [b.c[0]+s*d[0], b.c[2]+s*d[2]]); };
  const kam3=b=>{ const g=G.gBei(AB.get(b.ab), b.t), p=G.gAnw(g, b.c); return p; };
  const waende=new Map();
  for(const gr of [...gruppen.values()]){
    const pts=[], cams=[], ivs=[], bod=[], bildSet=new Set(), abSet=new Set();
    for(const bi of gr.beob){ const b=beob[bi], pa=heb(b, b.da), pb=heb(b, b.db); if(!pa || !pb) continue; b._pa=pa; b._pb=pb; pts.push(pa, pb); const c3=kam3(b); cams.push([c3[0], c3[2]]); bildSet.add(b.k); abSet.add(b.ab); }
    if(pts.length<2) continue;
    let n=gr.n, d=gr.d, rms=0;
    if(O.gepasst){ const m=mitte(pts); let sxx=0, sxy=0, syy=0; for(const p of pts){ const dx=p[0]-m[0], dy=p[1]-m[1]; sxx+=dx*dx; sxy+=dx*dy; syy+=dy*dy; }
      const th=0.5*Math.atan2(2*sxy, sxx-syy); n=[-Math.sin(th), Math.cos(th)]; d=n[0]*m[0]+n[1]*m[1];
      const cm0=mitte(cams); if(n[0]*cm0[0]+n[1]*cm0[1]-d<0){ n=[-n[0], -n[1]]; d=-d; } }
    for(const p of pts) rms+=(n[0]*p[0]+n[1]*p[1]-d)**2; rms=Math.sqrt(rms/pts.length);
    let phi=wrap2pi(Math.atan2(n[1], n[0])), rho=d;
    // Stoerung (Rest des Ausgleichs M6) erst nach dem Durchblick anwenden: der Durchblick haengt an der echten Geometrie
    const stoer=O.sigPhiDeg || O.sigRho ? {dp:O.sigPhiDeg*D2R*gs(), dr:O.sigRho*gs(), m:mitte(pts)} : null;
    const nn=G.wandN(phi), u=G.wandU(phi), sOf=p=>u[0]*p[0]+u[1]*p[1];
    for(const bi of gr.beob){ const b=beob[bi]; if(!b._pa) continue; const a=sOf(b._pa), c=sOf(b._pb), x=[Math.min(a,c), Math.max(a,c), b]; (b.art==='boden' ? bod : ivs).push(x); if(b.art==='boden') ivs.push(x); }
    // Stuetzintervalle (wie G.lmIntervalle, robust): nur wo >= 2 Beob ueberdecken, danach Luecken <= 5 cm geschlossen
    const vereint=L=>{ const ev=[]; for(const x of L){ ev.push([x[0], 1, x], [x[1], -1, x]); } ev.sort((a,b)=>a[0]-b[0] || b[1]-a[1]);
      const roh=[]; let n=0, s0=null; for(const [s,d] of ev){ const vor=n; n+=d; if(vor<2 && n>=2) s0=s; else if(vor>=2 && n<2 && s>s0) roh.push([s0, s]); }
      const out=[]; for(const [a,b] of roh){ const z=out[out.length-1]; if(z && a<=z.s1+0.05) z.s1=Math.max(z.s1, b); else out.push({s0:a, s1:b}); }
      return out.map(z=>{ const in_=L.filter(x=>x[1]>z.s0 && x[0]<z.s1); return {s0:z.s0, s1:z.s1, n:in_.length, bilder:new Set(in_.map(x=>x[2].k)).size, t0:Math.min(...in_.map(x=>x[2].t)), t1:Math.max(...in_.map(x=>x[2].t)), beidseits:false, ring:-1}; }); };
    const iv=vereint(ivs), boden=vereint(bod).map(z=>({s0:z.s0, s1:z.s1, n:z.n})); if(!iv.length) continue;
    const decke=[...gr.ys].some(y=>Math.abs(y-H)<0.01), nurBoden=[...gr.ys].every(y=>y<0.01), hl=Math.max(...[...gr.ys].filter(y=>y>=0.01));
    const h=decke ? 'c' : nurBoden ? 'f' : 'lokal';
    let cls='wand';
    if(O.klasse){ const art=gr.art;
      if(gr.kante4 || art==='schiene' || art==='moebel' || art==='sturz' || art==='laibung' || (art==='schrank' && (gr.objekt==='sockel' || !decke))) cls='stoer';
      else if(art==='schrank'){ const ob=W.objekte.find(x=>x.art==='schrank'), fr=ob && ob.front; if(fr && fr.every(p=>Math.abs(nn[0]*p[0]+nn[1]*p[1]-rho)<0.02)) cls='schrank'; } }
    else if(h==='lokal') cls='unklar';
    const L=iv.reduce((s,z)=>s+z.s1-z.s0, 0), nP=pts.length, Lx=Math.max(0.05, Math.max(...iv.map(z=>z.s1))-Math.min(...iv.map(z=>z.s0)));
    const sRho=Math.max(0.002, rms/Math.sqrt(nP)), sPhi=Math.max(0.1*D2R, rms/(Lx*Math.sqrt(nP/12)));
    waende.set(gr.key, {id:gr.key, rahmen:-1, phi, rho, cov:[sPhi*sPhi, 0, sRho*sRho], h, hLokal:h==='lokal' ? {h:hl, lo:hl-0.01, hi:hl+0.01} : null, cls, clsZaehler:0, hFrei:null, dChiC:0, dChiF:0,
      beob:gr.beob.filter(bi=>beob[bi]._pa), nBilder:bildSet.size, nSchluessel:gr.beob.filter(bi=>beob[bi].schluessel).length, nStandpunkte:bildSet.size, basis:0, abschnitte:[...abSet].sort((a,b)=>a-b),
      iv, durchblick:[], boden, ecken:[], sSchwer:0, zustand:bildSet.size>=5 && L>=0.10 ? 'bestaetigt' : 'kandidat', teile:[], ringe:[], insel:'nein', inselRunden:0, _rms:rms, _stoer:stoer}); }
  // Durchblick (Regel G.lmDurchblick, nachgebildet): Strahl einer anderen Landmarke quert die Linie und laeuft dort tiefer
  if(O.durchblick){ const WL=[...waende.values()], hoeheV=w=>w.h==='c' ? H : w.h==='lokal' ? w.hLokal.h : null;
    const stoerL=new Set([...waende.values()].filter(w=>w.cls==='stoer').map(w=>w.id));
    const strahlen=beob.filter(b=>b._pa && (b.art==='decke' || b.art==='boden') && !stoerL.has(b.L)).flatMap(b=>{ const c3=kam3(b); return [[b, c3, b._pa], [b, c3, b._pb]]; });
    for(const w of WL){ const hW=hoeheV(w); if(hW==null) continue; const n=G.wandN(w.phi), u=G.wandU(w.phi), lo=Math.min(...w.iv.map(z=>z.s0)), hi=Math.max(...w.iv.map(z=>z.s1));
      const partner=WL.filter(x=>x!==w && Math.cos(x.phi-w.phi)>Math.cos(5*D2R) && Math.abs(x.rho-w.rho)<0.05);
      const bereich=[[lo, hi]];
      for(const x of partner){ const ux=G.wandU(x.phi), proj=x.iv.flatMap(z=>{ const P=[x.rho*Math.cos(x.phi)+z.s0*ux[0], x.rho*Math.sin(x.phi)+z.s0*ux[1]], Q=[x.rho*Math.cos(x.phi)+z.s1*ux[0], x.rho*Math.sin(x.phi)+z.s1*ux[1]]; return [u[0]*P[0]+u[1]*P[1], u[0]*Q[0]+u[1]*Q[1]]; });
        const a=Math.min(...proj), b=Math.max(...proj); if(a>hi && a-hi<=O.tuerBreite) bereich.push([hi, a]); if(b<lo && lo-b<=O.tuerBreite) bereich.push([b, lo]); }
      const ev=[];
      for(const [b, c3, X] of strahlen){ if(b.L===w.id) continue; const c=[c3[0], c3[2]], dc=n[0]*c[0]+n[1]*c[1]-w.rho, dx=n[0]*X[0]+n[1]*X[1]-w.rho; if(dc*dx>=0) continue;
        const s=dc/(dc-dx), p=[c[0]+s*(X[0]-c[0]), c[1]+s*(X[1]-c[1])]; if(Math.hypot(X[0]-p[0], X[1]-p[1])<0.10) continue;   // Ziel mind. 10 cm dahinter (Sockel 5 cm zaehlt nicht)
        if(O.durchblickWinkel>0 && Math.abs(dc-dx)<Math.sin(O.durchblickWinkel*D2R)*Math.hypot(X[0]-c[0], X[1]-c[1])) continue;   // streifende Strahlen (Variante, M5 hat kein Winkeltor)
        const t=u[0]*p[0]+u[1]*p[1]; if(!bereich.some(([a,z])=>t>=a && t<=z)) continue;
        const yS=c3[1]+s*(b._y-c3[1]); if(yS<hW-0.05) ev.push({t, c}); }
      ev.sort((a,b)=>a.t-b.t); const st=[]; for(const x of ev){ const z=st[st.length-1]; if(z && x.t-z.t1<=0.15){ z.t1=x.t; z.ev.push(x); } else st.push({t0:x.t, t1:x.t, ev:[x]}); }
      w.durchblick=st.filter(z=>{ if(z.ev.length<3) return false; const sp=[]; for(const x of z.ev) if(!sp.some(p=>Math.hypot(p[0]-x.c[0], p[1]-x.c[1])<0.10)) sp.push(x.c); return sp.length>=2; }).map(z=>[z.t0, z.t1]);
      const belegt=w.iv.reduce((s,z)=>s+z.s1-z.s0, 0), imDb=w.iv.reduce((s,z)=>s+w.durchblick.reduce((s2,[a,b])=>s2+Math.max(0, Math.min(b, z.s1)-Math.max(a, z.s0)), 0), 0);
      if(O.klasse && belegt>=0.5 && imDb>=0.8*belegt && w.cls!=='stoer') w.cls='unterzug'; } }   // wie M5: unterzugMinL 0,5 m
  // Stoerung anwenden: phi um dp um den Schwerpunkt m drehen, rho um dr verschieben; Stuecke im neuen u neu ausdruecken
  for(const w of waende.values()){ const z=w._stoer; delete w._stoer; if(!z) continue;
    const n0=G.wandN(w.phi), u0=G.wandU(w.phi), P=t=>[w.rho*n0[0]+t*u0[0], w.rho*n0[1]+t*u0[1]], phi=wrap2pi(w.phi+z.dp), n1=G.wandN(phi), u1=G.wandU(phi);
    const rho=n1[0]*z.m[0]+n1[1]*z.m[1]+(w.rho-(n0[0]*z.m[0]+n0[1]*z.m[1]))+z.dr, s1=t=>{ const q=P(t); return u1[0]*q[0]+u1[1]*q[1]; };
    const um=x=>{ const a=s1(x.s0 ?? x[0]), b=s1(x.s1 ?? x[1]); return [Math.min(a,b), Math.max(a,b)]; };
    w.iv=w.iv.map(x=>{ const [a,b]=um(x); return {...x, s0:a, s1:b}; }); w.boden=w.boden.map(x=>{ const [a,b]=um(x); return {...x, s0:a, s1:b}; }); w.durchblick=w.durchblick.map(um);
    w.phi=phi; w.rho=rho; }
  for(const Ec of ecken.values()) delete Ec._k;
  for(const b of beob){ delete b._pa; delete b._pb; }
  return {opt:{}, skala:1, hC:H+O.hFehler, hF:0, sHC:0.01, sHF:0.01, H:{laser:H, sigma:0.01}, hoehen:{quelle:'laser', q:1}, posen:[], epoche:0, schnitte:[], abschnitte, kern:0,
    bilder, warte:[], beob, waende, ecken, spuren:null, bloecke:new Map(), pp:{cx:0, cy:0, sig:1, frei:false}, ldl:null, tiefe:{boden:null, ebenen:[], ebenenAR:[]},
    inselEntscheide:new Map(), umriss:null, runde:0, version:0, ms:{}};
}
// F4-Sitzung (karte/fixtures) in die Form von T3.sim (Kanten-ids aus T3.welt ohne Faelle; gleiche Wand- und Eckenfolge)
export function f4AlsSim(F){
  const W=T3.welt(T3.WAHRHEIT, {G}), K=W.kanten, kw=new Map(), ke=new Map();
  for(const E of K){ if(E.art==='wand' && (E.kante===0 || E.kante===1)) kw.set(E.wand+':'+E.kante, E.id); if(E.art==='ecke') ke.set(E.ecke, E.id); }
  const bilder=F.bilder.map(({bildErg, wahr})=>({bildErg, wahr:{...wahr, kid:Int32Array.from(wahr.wand, (wd,j)=>wahr.kante[j]===2 ? (ke.get(wahr.ecke[j]) ?? -1) : wd>=0 ? (kw.get(wd+':'+wahr.kante[j]) ?? -1) : -1)}}));
  return {posen:F.posen, bilder, erfassungen:[], welt:W, abschnitte:F.kopf.abschnitte.map(a=>({ab:a.ab, t0:a.t0, t1:a.t1, g:a.g, knoten:null}))};
}
// Runden als wachsende Zeitschnitte: je Schnitt Karte, umrissEingabe, umriss mit vorher; Entscheide optional.
export function runden(e, anteile, o={}, oK={}){
  const tEnd=e.bilder[e.bilder.length-1].bildErg.t; let vorher=null, K=null, inp=null, erg=null; const verlauf=[];
  for(const a of anteile){ K=karteAusSim(e, {...oK, bis:a*tEnd+1e-9}); K.umriss=vorher; if(o.entscheide) K.inselEntscheide=new Map(Object.entries(o.entscheide(vorher) || {}));
    inp=G.umrissEingabe(K, o.eingabe || {}); erg=G.umriss(inp, {hyp:true, ...o.umriss, vorher}); verlauf.push(erg); vorher=erg; }
  return {K, inp, erg, verlauf};
}
// T2 gegen die (von T3 ggf. veraenderte) Wahrheit im Rahmen F0 = Wahrheit (keine Passung), ringe wie exportiert
// (alle: true zaehlt auch nicht exportierte Inseln, wie --inseln ja)
export function ringMass(erg, wahrheit, alle=false){
  const ringe=erg.ringe.filter(r=>alle || r.exportiert).map(r=>({...r, exportiert:true}));
  const W=T2.wahrheitLaden(wahrheit), E=T2.eingabeAus({ringe});
  if(!E.ringe.length) return null;
  return T2.ringMetrik(E, W, {r:0, tx:0, ty:0, m:false, s:1}); }
// Gueltigkeit nach raumaufmass.html (wallLoops/wallPolygon), Export wie der Prototyp toRoomDataRings (nur fuer den Test, M8 fehlt)
let CORE=null;
export function wallPolygonOk(ringe){
  if(!CORE){ const h=read('raumaufmass.html'), js=h.match(/<script id="core">([\s\S]*?)<\/script>/)[1]; new Function(js)(); CORE=globalThis.CORE; }
  const idOf=i=>{ let s=''; do{ s=String.fromCharCode(65+i%26)+s; i=Math.floor(i/26)-1; }while(i>=0); return s; };
  const pts=[], walls=[]; let k=0;
  for(const r of ringe){ const ids=r.pts.map(c=>{ const id=idOf(k++); pts.push({id, x:Math.round(c[0]*1000), y:Math.round(c[1]*1000)}); return id; }); ids.forEach((id,i)=>walls.push([id, ids[(i+1)%ids.length]])); }
  const poly=CORE.wallPolygon(pts, walls); return {ok:!!poly, inseln:poly ? poly.holes.length : null, flaeche:poly ? CORE.roomArea(poly)/1e6 : null};
}

// ------------------------------------------------- Pruefungen
const out=[]; let ok=true;
const chk=(name,cond,info='')=>{ ok=ok&&!!cond; out.push((cond?'ok   ':'ROT  ')+name+(info!==''?'  ('+info+')':'')); };
const mess=[]; const notiz=s=>mess.push(s);
// kleiner Raum 6 x 5 m mit Pfeiler 0,40 x 0,37 m (wie rev/insel-hyp.mjs, R4); Linien mit n zur freien Seite
const P0=[2.3,2.3], P1=[2.7,2.67];
const AUSSEN=[{id:'S0', n:[1,0], d:0, a:[0,0], b:[0,5]}, {id:'S1', n:[-1,0], d:-6, a:[6,0], b:[6,5]}, {id:'S2', n:[0,1], d:0, a:[0,0], b:[6,0]}, {id:'S3', n:[0,-1], d:-5, a:[0,5], b:[6,5]}];
const FAC={S:{id:'PS', n:[0,-1], d:-P0[1], a:[P0[0],P0[1]], b:[P1[0],P0[1]]}, W:{id:'PW', n:[-1,0], d:-P0[0], a:[P0[0],P0[1]], b:[P0[0],P1[1]]},
           N:{id:'PN', n:[0,1], d:P1[1], a:[P0[0],P1[1]], b:[P1[0],P1[1]]}, E:{id:'PE', n:[1,0], d:P1[0], a:[P1[0],P0[1]], b:[P1[0],P1[1]]}};
const tOf=(l,p)=>-l.n[1]*p[0]+l.n[0]*p[1];
const linie=(w,k=1,z={})=>{ const t0=tOf(w,w.a), t1=tOf(w,w.b), lo=Math.min(t0,t1), hi=Math.max(t0,t1), m=(hi-lo)*(1-k)/2;
  return {id:w.id, n:w.n, d:w.d, iv:[[lo+m, hi-m]], side:1, w:1, sd:0.005, sth:0.002, hOk:true, kind:'decke', kap:[1], wAb:1, vert:[], durchblick:[], ...z}; };
const imPf=p=>p[0]>P0[0] && p[0]<P1[0] && p[1]>P0[1] && p[1]<P1[1];
const trifft=(a,b)=>{ for(let k=1;k<40;k++){ const t=k/40; if(imPf([a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1])])) return true; } return false; };
function raum(cams, seiten, k, geist, z={}){
  const lines=AUSSEN.map(w=>linie(w)).concat(seiten.map(s=>linie(FAC[s], k))), fans=[];
  for(const c of cams) for(const w of [...AUSSEN, ...seiten.map(s=>FAC[s])]) for(let i=0;i<20;i++){ const a=[w.a[0]+(w.b[0]-w.a[0])*i/20, w.a[1]+(w.b[1]-w.a[1])*i/20], b=[w.a[0]+(w.b[0]-w.a[0])*(i+1)/20, w.a[1]+(w.b[1]-w.a[1])*(i+1)/20];
    const m=[(a[0]+b[0])/2, (a[1]+b[1])/2]; if(w.n[0]*c[0]+w.n[1]*c[1]-w.d<=0.1) continue; if(!geist && trifft(c, m)) continue; fans.push({c, a, b, line:w.id, ab:0, w:1}); }
  return {lines, fans, path:cams.map(p=>({p, w:1})), bodenFrei:null, wBoden:0, inselFest:[], ausschluss:[], ...z};
}
const camsSW=[]; for(let x=0.6;x<=2.0;x+=0.35) for(let y=0.6;y<=2.0;y+=0.35) camsSW.push([x,y]);
const camsAll=[...camsSW]; for(let x=0.6;x<=5.4;x+=0.6) for(const y of [0.6,4.4]) camsAll.push([x,y]); for(let y=0.6;y<=4.4;y+=0.6) for(const x of [0.6,5.4]) camsAll.push([x,y]);
const inseln=e=>e.ringe.filter(r=>r.art==='insel');

// ------------------------------------------------- Abnahme 10.5 (node test/karte-umriss.mjs --abnahme [--n=20] [--samen=5])
// Kernkriterien mit Schwelle, BESTANDEN/ROT je Kriterium, eigener Exit-Code. Ersatz im Repo fuer die Skripte unter
// design/bau/P-E (mc-Simulation, F4-Serien und A6-A8 liegen nicht im Repo): T3 mit dem Platzhalter karteAusSim.
// 'Ganzbild rund' = T3 rund, gepasst + gestoert (σρ 1 cm, σφ 0,3°); H ± 1 cm ueber hFehler; Hypothesen T3 pfeilerSeiten
// κ 0,8 und T3 'geist'; Sonderfaelle wie design/bau/P-E/sonder.mjs; Inselabnahme Punkte 1-6 im Modus Export.
function abnahme(){
  const arg=k=>process.argv.find(a=>a.startsWith('--'+k+'='))?.split('=')[1], N=+(arg('n') || 20), NS=+(arg('samen') || 5), Z=[];
  const zeile=(krit, ok, mess)=>{ Z.push({krit, ok:!!ok, mess}); console.log(`${ok ? 'BESTANDEN' : 'ROT      '}  ${krit}  (${mess})`); };
  const ENDE=e=>{ const t=e.bilder[e.bilder.length-1].bildErg.t; return [2, 1.5, 1, 0.5, 0].map(d=>(t-d)/t); };
  const lauf=(so, oK={}, oU={})=>{ const e=T3.sim(T3.WAHRHEIT, {G, ...so}), R=runden(e, ENDE(e), oU, oK), W=e.welt;
    return {e, W, R, erg:R.erg, M:ringMass(R.erg, W.wahrheit), MJ:ringMass(R.erg, W.wahrheit, true), wp:wallPolygonOk(R.erg.ringe.filter(r=>r.exportiert))}; };
  const pc=(n, m)=>`${n}/${m}`, med=a=>q(a, 0.5), ab=(a,b)=>Math.hypot(a[0]-b[0], a[1]-b[1]);
  console.log(`Abnahme 10.5 M7 (T3, Platzhalter karteAusSim), ${N} Samen, Sonderfaelle ${NS} Samen\n`);
  // 1 Ganzbild rund (Ersatz mc): Topologie, beide Inseln (ja), falsche Inseln, Eckenfehler aussen. Linien aus den gehobenen
  // Punkten angepasst (T3-Pixelrauschen); zusaetzlich gestoert (σρ 1 cm, σφ 0,3° je Linie) nur als Angabe
  for(const [vn, oK] of [['', {gepasst:true}], [' (gestoert σρ 1 cm, σφ 0,3°, nur Angabe)', {gepasst:true, sigRho:0.01, sigPhiDeg:0.3}]]){ let topo=0, ins=0, falsch=0; const eMed=[], eMax=[];
    for(let s=1;s<=N;s++){ const x=lauf({kamerapfad:'rund', seed:500+s}, {...oK, seed:s}), A=x.M.aussen;
      if(A.n===A.nT && !A.fehlend.length && !A.ueberzaehlig.length) topo++; if(x.MJ.inseln.every(i=>i.gefunden)) ins++; if(x.M.falscheInseln.length || x.MJ.falscheInseln.length) falsch++; eMed.push(A.eMed); eMax.push(A.eMax); }
    const t=`Topologie ${pc(topo, N)}, beide Inseln (ja) ${pc(ins, N)}, falsche Inseln ${pc(falsch, N)}, Eckenfehler aussen Median ${cm(med(eMed))} / Max ${cm(med(eMax))} cm`;
    if(vn){ console.log('   (Ganzbild rund'+vn+': '+t+')'); continue; }
    zeile('Ganzbild rund: Topologie >= 95 %', topo>=0.95*N, pc(topo, N)); zeile('Ganzbild rund: beide Inseln 100 % (ja)', ins===N, pc(ins, N));
    zeile('Ganzbild rund: falsche Inseln 0 %', falsch===0, pc(falsch, N));
    zeile('Ganzbild rund: Eckenfehler aussen Median <= 1,5 cm, Max <= 4 cm (Median ueber Laeufe)', med(eMed)<=0.015 && med(eMax)<=0.04, `${cm(med(eMed))} / ${cm(med(eMax))} cm`); }
  // 2 Kontrolle unten; 3 H ± 1 cm; 4 hohe Moebel
  { let f=0; for(let s=1;s<=N;s++){ const x=lauf({kamerapfad:'unten', seed:600+s}); if(x.M.falscheInseln.length) f++; } zeile('Kontrolle nur unten: falsche Inseln 0 % (Export)', f===0, pc(f, N)); }
  for(const dH of [0.01, -0.01]) for(const dbw of [0, 15]){ let ins=0; for(let s=1;s<=N;s++){ const x=lauf({kamerapfad:'rund', seed:620+s}, {gepasst:true, hFehler:dH, seed:s, durchblickWinkel:dbw}); if(x.MJ.inseln.every(i=>i.gefunden)) ins++; }
    if(dbw) console.log(`   (H ${dH>0 ? '+' : '-'}1 cm, Variante Winkeltor 15° im Durchblick: Inseln ${pc(ins, N)})`); else zeile(`H ${dH>0 ? '+' : '-'}1 cm: Inseln 100 % (ja)`, ins===N, pc(ins, N)); }
  { let topo=0; for(let s=1;s<=N;s++){ const x=lauf({...T3.SITZUNGEN.moebel, seed:640+s}, {gepasst:true, sigRho:0.01, sigPhiDeg:0.3, seed:s}), A=x.M.aussen; if(A.n===A.nT && !A.fehlend.length && !A.ueberzaehlig.length) topo++; }
    zeile('Hohe Moebel, gefiltert (Klasse stoer): Topologie >= 90 %', topo>=0.9*N, pc(topo, N)); }
  // 5 Hypothesen (κ 0,8) und Geister
  const urteil=(x, Z0)=>{ const r=x.erg.ringe.find(y=>y.art==='insel' && ab(mitte(y.pts), Z0)<=0.3); return r ? {stufe:r.teil ? 'teil' : 'voll', exp:r.exportiert} : {stufe:'nein', exp:false}; };
  for(const [name, so, soll] of [['2 Seiten benachbart (SW, unten)', {kamerapfad:'unten', faelle:[{pfeilerSeiten:'SW', kappa:0.8}]}, 'teil'], ['2 Seiten gegenueber (WE, rund)', {kamerapfad:'rund', faelle:[{pfeilerSeiten:'WE', kappa:0.8}]}, 'teil'],
    ['3 Seiten (SWE, unten)', {kamerapfad:'unten', faelle:[{pfeilerSeiten:'SWE', kappa:0.8}]}, 'teil|voll']]){
    let n=0, exp=0; for(let s=1;s<=N;s++){ const x=lauf({...so, seed:100+s}), u=urteil(x, mitte(x.W.ringe[x.W.ringe.length-1].pts)); if(soll.split('|').includes(u.stufe)) n++; if(u.exp && soll==='teil') exp++; }
    zeile(`Hypothese ${name}, κ 0,8: ${soll} ${soll==='teil' ? '>= 95 %, 0 exportiert' : '100 %'}`, soll==='teil' ? n>=0.95*N && exp===0 : n===N, `${pc(n, N)}${soll==='teil' ? ', exportiert '+exp : ''}`); }
  { let tv=0, exp=0, M=0; for(const seiten of ['SW', 'SN', 'SWN', 'SWNE']) for(const kappa of [1, 0.8]) for(let s=1;s<=N;s++){ M++;
      const x=lauf({kamerapfad:'rund', seed:400+s, faelle:[{geist:{...T3.FAELLE.geist, seiten, kappa}}]}), u=urteil(x, [6.4, 3.4]); if(u.stufe!=='nein') tv++; if(u.exp) exp++; }
    zeile('Geister SW/SN/SWN/SWNE × κ 1/0,8: 0 % teil oder voll, 0 % exportiert', tv===0 && exp===0, `${tv}/${M} teil|voll, ${exp} exportiert`); }
  // 6 Sonderfaelle (7.6, 7.7, 8.1-8.4)
  const ausserhalb=x=>{ const A=x.erg.ringe.find(r=>r.art==='aussen'), I=T2.iou([A.pts], [x.W.ringe[0].pts], 0.002); return I.A-I.I; };
  const aufLinie=(x, p, qq, nahe=0.3)=>{ const R=x.erg.ringe[0], e=[qq[0]-p[0], qq[1]-p[1]], L=Math.hypot(...e), u=[e[0]/L, e[1]/L], n=[-u[1], u[0]], d=y=>n[0]*(y[0]-p[0])+n[1]*(y[1]-p[1]), sl=y=>u[0]*(y[0]-p[0])+u[1]*(y[1]-p[1]); let m=-1, nk=0;
    for(let i=0;i<R.pts.length;i++){ const a=R.pts[i], b=R.pts[(i+1)%R.pts.length], v=[b[0]-a[0], b[1]-a[1]], lv=Math.hypot(...v); if(lv<0.05 || Math.abs(u[0]*v[0]/lv+u[1]*v[1]/lv)<Math.cos(5*D2R) || Math.abs(d(a))>nahe || Math.abs(d(b))>nahe) continue;
      if(Math.min(Math.max(sl(a), sl(b)), L)-Math.max(Math.min(sl(a), sl(b)), 0)<0.1) continue; nk++; m=Math.max(m, Math.abs(d(a)), Math.abs(d(b))); } return {max:m, n:nk}; };
  const SF=[['tuer', 'Tuer in den Flur (8.1): 0 falsche Inseln, ausserhalb < 0,1 m²', x=>ausserhalb(x)<0.1 && !x.M.falscheInseln.length],
    ['durchgang', 'Durchgang ohne Sturz (8.1): 0 falsche Inseln, ausserhalb < 0,1 m²', x=>ausserhalb(x)<0.1 && !x.M.falscheInseln.length],
    ['vorhang', 'Vorhangschiene (8.4): Aussenring auf A-B <= 3 cm', x=>{ const w=x.W.waende.find(w=>w.id==='AB'), r=aufLinie(x, w.A, w.B); return r.n>0 && r.max<=0.03; }],
    ['schrank', 'deckenhoher Schrank an L-M (8.2): Aussenring auf der Front <= 5 cm, keine Insel', x=>{ const ob=x.W.objekte.find(o=>o.art==='schrank'), r=aufLinie(x, ob.front[0], ob.front[1]);
      return r.n>0 && r.max<=0.05 && !x.erg.ringe.some(y=>y.art==='insel' && ab(mitte(y.pts), mitte(ob.poly))<1); }],
    ['unterzug', 'Unterzug, Kameras rundum (8.3): 0 falsche Inseln, Durchgaenge ±5 cm, Inseln gefunden', x=>!x.M.falscheInseln.length && x.M.durchgaenge.every(d=>d.ok) && x.MJ.inseln.every(i=>i.gefunden)],
    ['unterzugEinseitig', 'Unterzug, Kameras einseitig (8.3, R10): 0 falsche Inseln (auch nicht exportierte)', x=>!x.M.falscheInseln.length && !x.MJ.falscheInseln.length],
    ['pfeiler0', 'Pfeiler 0 cm vor A-B (7.6): gueltig, Netto ±0,02 m², Aussenring 18 Ecken', x=>x.wp.ok && Math.abs(x.wp.flaeche-65.395)<=0.02 && x.erg.ringe[0].pts.length===18],
    ['pfeiler3cm', 'Pfeiler 3 cm vor A-B (7.6): gueltig, Netto ±0,02 m², Aussenring 18 Ecken', x=>x.wp.ok && Math.abs(x.wp.flaeche-65.384)<=0.02 && x.erg.ringe[0].pts.length===18],
    ['pfeiler8', 'Pfeiler 8 cm vor A-B (7.6): eigene Insel mit 4 Ecken, Netto ±0,02 m²', x=>x.wp.ok && Math.abs(x.wp.flaeche-65.395)<=0.02 && x.erg.ringe.some(r=>r.art==='insel' && r.pts.length===4 && r.exportiert)],
    ['gedreht', 'Pfeiler 30° gedreht, rundum (7.7): kein Export ohne Bestaetigung', x=>{ const c=mitte(x.W.ringe[2].pts); return !x.erg.ringe.some(r=>r.art==='insel' && r.exportiert && ab(mitte(r.pts), c)<0.4); }]];
  for(const [fall, text, pruef] of SF){ let n=0; const S0=T3.SITZUNGEN[fall]; for(let s=0;s<NS;s++) if(pruef(lauf({...S0, seed:S0.seed+100*s}))) n++; zeile(text, n===NS, pc(n, NS)); }
  // Einschmelzen greift (7.6, T3): Pfeiler um 30° gedreht, Ecke 3 cm vor A-B (Keil); eingeschmolzen, gueltig, Netto ±0,02 m²
  { const J=JSON.parse(readFileSync(T3.WAHRHEIT, 'utf8')), D=J.data && J.data.pts ? J.data : J, P=['I','J','AC','AD'].map(id=>D.pts.find(p=>p.id===id)), c=[P.reduce((a,p)=>a+p.x,0)/4, P.reduce((a,p)=>a+p.y,0)/4], w=30*D2R;
    for(const p of P){ const x=p.x-c[0], y=p.y-c[1]; p.x=c[0]+Math.cos(w)*x-Math.sin(w)*y; p.y=c[1]+Math.sin(w)*x+Math.cos(w)*y; }
    const xAB=Math.min(...['A','B'].map(id=>D.pts.find(p=>p.id===id).x)), dx=xAB+30-Math.min(...P.map(p=>p.x)), dy=5370-c[1]; for(const p of P){ p.x+=dx; p.y+=dy; }
    let n=0; const info=[]; for(let s=0;s<NS;s++){ const e=T3.sim(J, {G, kamerapfad:'rund', seed:30+100*s}), R=runden(e, ENDE(e)), wp=wallPolygonOk(R.erg.ringe.filter(r=>r.exportiert));
      const AW=flaeche(e.welt.ringe[0].pts)-e.welt.ringe.slice(1).reduce((a,r)=>a+flaeche(r.pts), 0), ein=R.erg.verworfen.some(v=>v.grund==='einschmelzen');
      if(ein && wp.ok && Math.abs(wp.flaeche-AW)<=0.02 && R.erg.ringe.filter(r=>r.art==='insel' && r.exportiert).length===1) n++; info.push(`${ein ? 'ein' : 'nicht'} ${f3(wp.flaeche-AW)}`); }
    zeile('Einschmelzen (7.6, T3 Keil 3 cm): eingeschmolzen, gueltig, Netto ±0,02 m², nur das Wandstueck als Insel', n===NS, `${pc(n, NS)}; ${info.join(', ')}`); }
  // 7 Inselabnahme Punkte 1-6 (Modus Export und ja), T3 rund exakt / gestoert / Sprung
  for(const [name, so, oK] of [['exakt', {kamerapfad:'rund'}, {}], ['gestoert σρ 1 cm σφ 0,3°', {kamerapfad:'rund'}, {gepasst:true, sigRho:0.01, sigPhiDeg:0.3}],
    ['Sprung, Restversatz 2 cm / 0,5°', {kamerapfad:'rund', spruenge:[{t:35, d:0.40, richtDeg:30, psiDeg:10, dT:{psiDeg:5, x:0.30}}]}, {secT:0.02, secR:0.5, secH:0.01}]])
    for(const dbw of [0, 15]){ const z={}; for(let s=1;s<=N;s++){ const x=lauf({...so, seed:500+s}, {...oK, seed:s, durchblickWinkel:dbw});
        for(const [k, M] of [['ex', x.M], ['ja', x.MJ]]) for(const i of M.inseln){ const key=k+' '+i.wahr; z[key]=(z[key]||0)+(i.bestanden ? 1 : 0); } }
      const ex=Object.entries(z).filter(([k])=>k.startsWith('ex')), ja=Object.entries(z).filter(([k])=>k.startsWith('ja'));
      const txt=`Export ${ex.map(([k,v])=>k.slice(3)+' '+v).join(', ')}; ja ${ja.map(([k,v])=>k.slice(3)+' '+v).join(', ')} (von ${N})`;
      if(dbw===0) zeile(`Inselabnahme 1-6 (Export), ${name}: beide Inseln ${N}/${N}`, ex.length===2 && ex.every(([,v])=>v===N), txt);
      else console.log(`   (Variante Platzhalter mit Winkeltor 15° im Durchblick, Empfehlung an M5: ${txt})`); }
  // 8 Arbeit (nur T3-Eingaben im Repo; die Messung bis 144 Kandidatenlinien steht im Bericht P-E)
  { const T=[], nL=[]; for(let s=1;s<=Math.min(N, 10);s++){ const e=T3.sim(T3.WAHRHEIT, {G, kamerapfad:'rund', seed:700+s}), inp=G.umrissEingabe(karteAusSim(e)); let v=null; for(let r=0;r<2;r++) v=G.umriss(inp, {vorher:v});
      for(let k=0;k<5;k++){ const t0=performance.now(), r=G.umriss(inp, {vorher:v}); T.push(performance.now()-t0); nL.push(r.nLinien); } }
    zeile('Arbeit: G.umriss (ohne Weg b) <= 20 ms (T3 rund, Mac)', med(T)<=20 && Math.max(...T)<=20, `${Math.min(...nL)}-${Math.max(...nL)} Kandidatenlinien, Median ${f2(med(T))} ms, max ${f2(Math.max(...T))} ms`); }
  const rot=Z.filter(z=>!z.ok);
  console.log(`\n${Z.length-rot.length}/${Z.length} BESTANDEN`+(rot.length ? `; ROT: ${rot.map(z=>z.krit.split(':')[0]).join(' | ')}` : ''));
  console.log('Nicht im Repo pruefbar (Skripte unter design/bau/P-E): mc-Simulation, F4-Serien, Echt A6-A8; Pixel-Zeit.');
  process.exit(rot.length ? 1 : 0);
}
function main(){
const U=(inp, o={})=>G.umriss(inp, {hyp:true, ...o});   // Weg b im selben Aufruf (ohne M10)
// ---- Datei und Einbau
{
  const NAMEN=['UM_DEF','umrissEingabe','umriss','inselHypothesen','inselBewerten'];
  const Gs={}; let fehler=null; try{ new Function('G', '"use strict";\n'+src)(Gs); }catch(x){ fehler=x.message; }
  const neu=Object.keys(Gs).sort();
  chk('Datei laedt allein (new Function, nur G) und haengt genau die Namen aus 4 an G', !fehler && JSON.stringify(neu)===JSON.stringify([...NAMEN].sort()), fehler || neu.join(','));
  chk('keine Kollision mit Namen, die der geo-Block ohne M7 traegt', traegt || !NAMEN.some(k=>vorKeys.has(k)), traegt ? 'Seite traegt M7 wortgleich' : 'eingefuegt');
  chk('Datei endet mit genau einem Zeilenumbruch, kein import/export/</script>', /[^\n]\n$/.test(src) && !/^\s*(import|export)\s/m.test(src) && !src.includes('</script>'));
  const code=src.replace(/\/\/.*$/gm, '');
  const verboten=[/Math\.random/, /Date\.now/, /\bwindow\b/, /\bdocument\b/, /\bself\b/].filter(r=>r.test(code));
  chk('kein Math.random, kein Date.now, kein DOM/Worker-Global (2)', !verboten.length, verboten.map(String).join(' '));
  const uhr=(code.match(/performance/g) || []).length, uhrZeilen=src.split('\n').filter(l=>/performance/.test(l.replace(/\/\/.*$/, '')));
  chk('Uhr nur in der Messfunktion uhr() (ms wird protokolliert, nie entschieden)', uhr===1 && uhrZeilen.length===1 && /const uhr=/.test(uhrZeilen[0]), uhrZeilen.join(' | '));
  chk('atan2 nicht auf Matrixeintraege (1.2)', !/atan2\s*\([^)]*\b(m|camTo|pose|T|M|mat)\s*\[\s*(0|2|8|10)\s*\]/.test(code));
  chk('Umlaute nur in Zeichenketten, nicht in Code-Kommentaren', !/\/\/.*[äöüÄÖÜß]/.test(src));
  chk('G.UM_DEF genau wie ARCHITEKTUR 4', JSON.stringify(G.UM_DEF)===JSON.stringify({tau:0.05, back:0.12, margin:0.6, fMin:1, pathR:0.10, betaPfad:20, lam:1, eps:0.05, rWall:1, betaF:4, betaU:0.2,
    hypEnds:true, hypEndTol:0.08, hypThick:0, mergeDeg:1, mergeD:0.02, lueckeMax:0.5, tuerTiefe:0.3,
    islandMinA:0.01, islandMaxA:12, islandMinSup:0.5, islandFullSup:0.85, islandMinThick:0.08, inselPhiSetzen:0.45, inselPhiLoesen:0.55,
    hypMax:4, hypMinSeite:0.10, hypEckeTol:0.15, hypDEnSetzen:0.30, hypDEnLoesen:0.40, hypRunden:3,
    aussenEinschmelzen:0.05, jogMin:0.04, jogSigma:3, clip:true, clipMinSup:0.8, wBoden:0}));
}
// ---- Weg a: Pfeiler rundum, Geist, phi-Tor mit Hysterese, Strukturen 3.4
{
  const e=U(raum(camsAll, ['S','W','N','E'], 1, false)), I=inseln(e);
  chk('Pfeiler 4 Seiten: Aussenring 4 Ecken + Insel 4 Ecken, voll, auto, exportiert', e.ringe.length===2 && e.ringe[0].art==='aussen' && e.ringe[0].pts.length===4 && I.length===1 && I[0].pts.length===4 && !I[0].teil && I[0].entscheid==='auto' && I[0].exportiert,
    `Insel ${I[0] && I[0].pts.length} Ecken, sup ${I[0] && f2(I[0].supRing)}, phi ${I[0] && f2(I[0].phi)}`);
  const lageF=I[0] ? Math.max(...I[0].pts.map(p=>Math.min(...[[2.3,2.3],[2.7,2.3],[2.7,2.67],[2.3,2.67]].map(t=>Math.hypot(p[0]-t[0], p[1]-t[1]))))) : NaN;
  chk('Inselecken exakt (Schnitt der Linien)', lageF<1e-9, lageF.toExponential(1));
  // plaus nur am Aussenring (19.2 Z10, Vertrag 19.3 M7 -> M10)
  const R=e.ringe[0], felder=['id','art','pts','waende','sup','hyp','flaeche','teil','supRing','phi','dicke','quelle','entscheid','exportiert','plaus'];
  const EF=['ringe','kandidaten','hypothesen','aufgefuellt','verworfen','innenVerworfen','nLinien','nZellen','arbeit','ms','warn'];
  chk('Ring und UmrissErgebnis haben genau die Felder aus 3.4; intern nicht aufzaehlbar', JSON.stringify(Object.keys(R))===JSON.stringify(felder) && JSON.stringify(Object.keys(e))===JSON.stringify(EF) && e.intern && !Object.keys(e).includes('intern'),
    Object.keys(e).join(','));
  // 19.2 Z10: Kameraweg und gesehener Freiraum liegen im Raum, Flaeche gegen Freiraum endlich; Insel ohne plaus
  const pl=R.plaus || {}, ctx=e.intern; let frG=0; for(const f of ctx.faces) frG+=f.A*(f.phi || 0);
  chk('Aussenring plaus (19.2 Z10): pfadIn 1, freiIn >= 0,95, aRel endlich, aFrei = Summe A·phi aller Zellen; Insel ohne plaus',
    pl.pfadIn===1 && pl.freiIn>=0.95 && Number.isFinite(pl.aRel) && pl.aRel>0.5 && Math.abs(pl.aFrei-frG)<1e-9 && !('plaus' in I[0]), JSON.stringify(pl));
  chk('Ring.waende: Wand-ids, null fuer Hypothesenlinien; Ecke k = Schnitt von Wand k-1 und k', I[0] && I[0].waende.every(w=>['PS','PW','PN','PE'].includes(w)) && R.waende.every(w=>/^S\d$/.test(w)),
    I[0] && I[0].waende.join(','));
  const g=U(raum(camsAll, ['S','W','N','E'], 1, true));
  chk('Geist 4 Seiten (Strahlen laufen durch, R4): phi-Tor verwirft das Loch (Prototyp: falsche Insel)', inseln(g).length===0 && g.aufgefuellt.some(x=>x.grund==='phi' && x.phi>0.9),
    g.aufgefuellt.map(x=>x.grund+' phi '+f2(x.phi)).join('; '));
  const gs=U(raum(camsSW, ['S','W','N','E'], 1, true)), gk=U(raum(camsSW, ['S','W','N'], 1, true));
  chk('Geist 4/3 Seiten, Kameras SW: keine Insel', inseln(gs).length===0 && inseln(gk).length===0);
  // Hysterese phi: setzen <= 0,45, loesen > 0,55 (vorher als Insel, gleiche id)
  const base=raum(camsAll, ['S','W','N','E'], 1, false), e1=U(base, {inselPhiSetzen:0.30, inselPhiLoesen:0.55}), phi0=inseln(U(base))[0].phi;
  const e2=U(base, {inselPhiSetzen:0.30, inselPhiLoesen:0.55, vorher:U(base)});
  chk(`phi-Tor mit Hysterese: phi ${f2(phi0)} > setzen 0,30 -> keine Insel; mit vorher (Insel) und loesen 0,55 -> Insel`, inseln(e1).length===0 && inseln(e2).length===1);
  const a=U(base), b=U(base);
  chk('zwei Aufrufe mit gleicher Eingabe: Ringe, Kandidaten, Hypothesen bitgleich', JSON.stringify([a.ringe, a.kandidaten, a.hypothesen])===JSON.stringify([b.ringe, b.kandidaten, b.hypothesen]));
}
// ---- Weg b: Hypothesen (R4-Faelle), Stufen ueber Runden, Exportregel
{
  const tab=[];
  for(const [cn, cams] of [['SW', camsSW], ['rundum', camsAll]]) for(const geist of [false, true]) for(const seiten of [['S','W'], ['S','N'], ['S','W','N']]) for(const k of [1, 0.8]){
    const inp=raum(cams, seiten, k, geist); let v=null; for(let r=0;r<3;r++) v=U(inp, {vorher:v});
    const I=inseln(v), st=v.hypothesen.map(h=>h.stufe), best=v.hypothesen.find(h=>h.stufe==='teil' || h.stufe==='voll') || v.hypothesen[0];
    tab.push({cn, geist, s:seiten.join(''), k, insel:I.map(r=>r.quelle+'/'+r.entscheid+(r.exportiert ? '/exp' : '')).join(',') || '-', st:st.join(','), phi:best ? best.phi : NaN, dEn:best ? best.dEn : NaN}); }
  for(const z of tab) notiz(`[M] R4 Weg b ${z.cn.padEnd(6)} ${z.geist ? 'geist' : 'echt '} ${z.s.padEnd(3)} k ${z.k}: Insel ${z.insel}; Stufen ${z.st || '-'}; phi ${f2(z.phi)} dEn ${f2(z.dEn)}`);
  const echt2=tab.filter(z=>!z.geist && z.s.length===2), echt3=tab.filter(z=>!z.geist && z.s.length===3), geist=tab.filter(z=>z.geist);
  chk('R4 echt, 2 Seiten (benachbart und gegenueber, k 1/0,8, SW/rundum): nach 3 Runden Insel aus Hypothese (teil, offen, nicht exportiert) oder voll',
    echt2.every(z=>/hypothese\/(offen|auto)|schnitt\//.test(z.insel)), echt2.filter(z=>!/hypothese|schnitt/.test(z.insel)).map(z=>z.cn+' '+z.s+' k'+z.k).join('; ') || `${echt2.length} Faelle`);
  chk('R4 echt, 3 Seiten: Insel (Weg a oder b) in allen Faellen', echt3.every(z=>z.insel!=='-'), echt3.map(z=>z.insel).join(' | '));
  chk('R4 Geist 2-3 Seiten: keine Insel, keine Hypothese ueber kandidat (phi 1,0)', geist.every(z=>z.insel==='-' && !/teil|voll/.test(z.st)), geist.filter(z=>z.insel!=='-').map(z=>z.cn+' '+z.s).join('; '));
  const inp=raum(camsAll, ['S','W'], 1, false), v1=U(inp), v2=U(inp, {vorher:v1}), v3=U(inp, {vorher:v2});
  const h=id=>x=>x.hypothesen.find(y=>y.id===id), id=v1.hypothesen[0] && v1.hypothesen[0].id;
  chk('Stufen: Runde 1 kandidat, 2 kandidat, 3 teil (hypRunden 3); runden zaehlt', id && h(id)(v1).stufe==='kandidat' && h(id)(v2).stufe==='kandidat' && h(id)(v3).stufe==='teil' && h(id)(v3).runden===3,
    [v1,v2,v3].map(x=>h(id)(x) && h(id)(x).stufe).join(' -> '));
  chk('teil-Insel: Ring mit id der Hypothese, quelle hypothese, entscheid offen, exportiert false; Kandidat in Runde 1', inseln(v3).some(r=>r.id===id && r.quelle==='hypothese' && r.entscheid==='offen' && !r.exportiert && r.teil) &&
    v1.kandidaten.some(k=>k.id===id && k.grund==='hypothese'));
  // Hypothesen-Schnitt setzt den Fluss des freien Schnitts fort: dE gleich dem Unterschied zweier voller Schnitte
  { const H=G.inselHypothesen(inp, v1, {}), d=H.map(h=>{ const b=G.inselBewerten(inp, h, v1, {}), voll=U({...inp, inselFest:[{id:h.id, poly:h.poly}]}, {hyp:false}); return Math.abs(b.dE-(voll.intern.flow-v1.intern.flow)); });
    chk('inselBewerten (Restnetz fortgesetzt) = voller Schnitt mit dem Rechteck fest aussen (|ΔdE| < 1e-9)', d.length && Math.max(...d)<1e-9, `${d.length} Hypothesen, max ${Math.max(...d).toExponential(1)}`); }
  chk('arbeit.schnitte = 1 + Zahl der bewerteten Hypothesen (<= hypMax)', v3.arbeit.schnitte===1+v3.hypothesen.filter(x=>!x.pfad).length && v3.hypothesen.length<=G.UM_DEF.hypMax, JSON.stringify(v3.arbeit));
  // Aufruf wie M10 (4, Schritt 8): G.umriss ohne Weg b, dann G.inselHypothesen und G.inselBewerten mit der vorigen Bewertung
  { let vb=null; const st=[]; let ohne=null;
    for(let r=0;r<3;r++){ const e=G.umriss(inp, G.UM_DEF); ohne=ohne || e; const H=G.inselHypothesen(inp, e, G.UM_DEF), h=H.find(x=>x.id===id);
      const b=h ? G.inselBewerten(inp, h, e, {...G.UM_DEF, vorher:vb}) : null; st.push(b ? b.stufe+b.runden : '-'); vb=b; }
    chk('Aufruf wie M10: G.umriss ohne Weg b (keine Hypothesen, nur ein Schnitt), Stufen ueber die vorige InselBewertung: kandidat1, kandidat2, teil3',
      ohne.hypothesen.length===0 && ohne.arbeit.schnitte===1 && st.join(',')==='kandidat1,kandidat2,teil3', st.join(' -> ')); }
  // volle Hypothese (islandFullSup fuer den Test 0,5): endgueltiger Schnitt = ihr erzwungener Schnitt, kein weiterer (Pflicht 7);
  // Ring gleich dem eines vollen Schnitts mit dem Rechteck als inselFest
  { const oV={islandFullSup:0.5}; let w=null; for(let r=0;r<3;r++) w=U(inp, {...oV, vorher:w});
    const hv=w.hypothesen.find(x=>x.stufe==='voll'), rv=hv && inseln(w).find(x=>x.id===hv.id), H=G.inselHypothesen(inp, U(inp, {...oV, hyp:false}), oV).find(x=>hv && x.id===hv.id);
    const ref=H && inseln(U({...inp, inselFest:[{id:H.id, poly:H.poly}]}, {...oV, hyp:false})).find(x=>x.id===H.id);
    chk('volle Hypothese: Ring aus ihrem erzwungenen Schnitt (gleich vollem Schnitt mit inselFest), auto, arbeit.schnitte = 1 + Bewertungen', rv && ref && JSON.stringify(rv.pts)===JSON.stringify(ref.pts) && rv.entscheid==='auto' && rv.quelle==='hypothese' && w.arbeit.schnitte===1+w.hypothesen.filter(x=>!x.pfad).length,
      rv ? `${rv.id} ${rv.entscheid}, Schnitte ${w.arbeit.schnitte}` : 'keine volle Hypothese'); }
  // Kameraweg im Rechteck: sofort verworfen, ohne Schnitt
  const inpP=raum(camsAll, ['S','W'], 1, false); inpP.path=[...inpP.path, {p:[2.5, 2.48], w:1}];
  const vp=U(inpP), hp=vp.hypothesen.find(x=>x.id===id);
  chk('Hypothese mit Kameraweg im Rechteck: pfad, stufe nein, kein Schnitt', hp && hp.pfad && hp.stufe==='nein' && hp.dE===null, hp && JSON.stringify(hp));
  // Nutzer: ja -> inselFest (nutzer-ja, exportiert), nein -> ausschluss (nutzer-nein), schrank
  const r=inseln(v3).find(x=>x.id===id), fest=U({...inp, inselFest:[{id, poly:r.pts}]}, {vorher:v3}), aus=U({...inp, ausschluss:[{id, poly:r.pts, wahl:'schrank'}]}, {vorher:v3});
  const rf=inseln(fest).find(x=>x.id===id);
  chk('inselFest: Insel aus dem endgueltigen Schnitt mit derselben id, nutzer-ja, exportiert; keine Hypothese mehr dafuer', rf && rf.entscheid==='nutzer-ja' && rf.exportiert && rf.quelle==='schnitt' && !fest.hypothesen.some(x=>x.id===id),
    rf && `${rf.pts.length} Ecken, sup ${f2(rf.supRing)}`);
  chk('ausschluss (schrank): keine Hypothese, Kandidat mit grund schrank, nichts exportiert', !aus.hypothesen.some(x=>x.id===id) && !inseln(aus).some(x=>x.exportiert) && aus.kandidaten.some(k=>k.id===id && k.grund==='schrank'));
}
// ---- Beleg fuer 'voll' (Befund 1): Loch zwischen zwei gegenlaeufigen Linien ohne gesehene Ecke (Echt A6-A8: 1,48 x 0,10 m,
// Enden nur Hypothesenlinien) -> offen statt auto; derselbe Streifen mit einer gesehenen Stirnseite -> auto
{
  const platte=(stirn)=>{ const y0=2.4, y1=2.5, x0=2.0, x1=3.5, fl=[{id:'PS', n:[0,-1], d:-y0, a:[x0,y0], b:[x1,y0]}, {id:'PN', n:[0,1], d:y1, a:[x0,y1], b:[x1,y1]}, ...(stirn ? [{id:'PE', n:[1,0], d:x1, a:[x1,y0], b:[x1,y1]}] : [])];
    const lines=AUSSEN.map(w=>linie(w)).concat(fl.map(w=>linie(w))), fans=[], im=p=>p[0]>x0 && p[0]<x1 && p[1]>y0 && p[1]<y1;
    const tr=(a,b)=>{ for(let k=1;k<40;k++){ const t=k/40; if(im([a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1])])) return true; } return false; };
    for(const c of camsAll) for(const w of [...AUSSEN, ...fl]) for(let i=0;i<20;i++){ const a=[w.a[0]+(w.b[0]-w.a[0])*i/20, w.a[1]+(w.b[1]-w.a[1])*i/20], b=[w.a[0]+(w.b[0]-w.a[0])*(i+1)/20, w.a[1]+(w.b[1]-w.a[1])*(i+1)/20];
      const m=[(a[0]+b[0])/2, (a[1]+b[1])/2]; if(w.n[0]*c[0]+w.n[1]*c[1]-w.d<=0.1 || tr(c, m) || tr(c, a) || tr(c, b)) continue; fans.push({c, a, b, w:1}); }
    return {lines, fans, path:camsAll.map(p=>({p, w:1})), bodenFrei:null, wBoden:0, inselFest:[], ausschluss:[]}; };
  const e0=U(platte(false), {hyp:false}), e1=U(platte(true), {hyp:false}), i0=inseln(e0)[0], i1=inseln(e1)[0];
  chk("Platte 1,5 x 0,1 m nur mit zwei gegenlaeufigen Seiten (supRing >= 0,85): offen, nicht exportiert, Warnung 'keine gesehene Ecke'", i0 && i0.supRing>=0.85 && i0.entscheid==='offen' && !i0.exportiert && e0.warn.some(w=>/keine gesehene Ecke/.test(w)),
    i0 && `sup ${f2(i0.supRing)} ${i0.entscheid}`);
  chk('dieselbe Platte mit gesehener Stirnseite (Ecke): auto, exportiert', i1 && i1.entscheid==='auto' && i1.exportiert, i1 && `sup ${f2(i1.supRing)} ${i1.entscheid}`);
}
// ---- Hypothese ueberlappt eine Insel des freien Schnitts (Befund 2, Gegenmassnahme einseitig): kein zweiter Ring fuer dasselbe Objekt
{
  const S0=T3.SITZUNGEN.unterzugEinseitig, e=T3.sim(T3.WAHRHEIT, {G, ...S0, seed:S0.seed+300}), R=runden(e, [2, 1.5, 1, 0.5, 0].map(d=>1-d/e.bilder[e.bilder.length-1].bildErg.t), {eingabe:{lokalOben:'bis'}}, {kante4:'wand'});
  const I=inseln(R.erg), MJ=ringMass(R.erg, e.welt.wahrheit, true); let ue=0; for(let i=0;i<I.length;i++) for(let j=i+1;j<I.length;j++){ const P=I[i].pts, Q=I[j].pts; if(P.some(p=>pip(p, Q)) || Q.some(p=>pip(p, P))) ue++; }
  chk("Unterzug einseitig, kante4 'wand', lokalOben 'bis' (s3): keine ueberlappenden Inselringe, 0 falsche Inseln (auch offene)", ue===0 && MJ.falscheInseln.length===0, `${I.length} Inselringe, ueberlappend ${ue}, falsch ${MJ.falscheInseln.length}`);
}
// ---- Einschmelzen greift in T3 (Befund 6): Pfeiler um 30° gedreht, Ecke 3 cm vor A-B (Keil)
{
  const J=JSON.parse(readFileSync(T3.WAHRHEIT, 'utf8')), D=J.data && J.data.pts ? J.data : J, P=['I','J','AC','AD'].map(id=>D.pts.find(p=>p.id===id)), c=[P.reduce((a,p)=>a+p.x,0)/4, P.reduce((a,p)=>a+p.y,0)/4], w=30*D2R;
  for(const p of P){ const x=p.x-c[0], y=p.y-c[1]; p.x=c[0]+Math.cos(w)*x-Math.sin(w)*y; p.y=c[1]+Math.sin(w)*x+Math.cos(w)*y; }
  const xAB=Math.min(...['A','B'].map(id=>D.pts.find(p=>p.id===id).x)), dx=xAB+30-Math.min(...P.map(p=>p.x)), dy=5370-c[1]; for(const p of P){ p.x+=dx; p.y+=dy; }
  const e=T3.sim(J, {G, kamerapfad:'rund', seed:30}), R=runden(e, [2, 1.5, 1, 0.5, 0].map(d=>1-d/e.bilder[e.bilder.length-1].bildErg.t)), wp=wallPolygonOk(R.erg.ringe.filter(r=>r.exportiert));
  const AW=flaeche(e.welt.ringe[0].pts)-e.welt.ringe.slice(1).reduce((a,r)=>a+flaeche(r.pts), 0);
  chk('T3 Keil 3 cm (Pfeiler 30° gedreht vor A-B): eingeschmolzen, wallPolygon gueltig, Netto ±0,02 m², nur das Wandstueck als Insel', R.erg.verworfen.some(v=>v.grund==='einschmelzen') && wp.ok && Math.abs(wp.flaeche-AW)<=0.02 && inseln(R.erg).filter(r=>r.exportiert).length===1,
    `Aussenring ${R.erg.ringe[0].pts.length} Ecken, Netto ${f3(wp.flaeche)} / ${f3(AW)} m²`);
}
// ---- Einschmelzen (7.6): Pfeiler 3 cm / 8 cm vor der Wand
{
  const pf=(gap)=>{ const x0=gap, x1=gap+0.40, y0=2.3, y1=2.67, fac=[{id:'Q1', n:[0,-1], d:-y0, a:[x0,y0], b:[x1,y0]}, {id:'Q2', n:[1,0], d:x1, a:[x1,y0], b:[x1,y1]}, {id:'Q3', n:[0,1], d:y1, a:[x0,y1], b:[x1,y1]}, {id:'Q4', n:[-1,0], d:-x0, a:[x0,y0], b:[x0,y1]}];
    const lines=AUSSEN.map(w=>linie(w)).concat(fac.map(w=>linie(w))), fans=[], im=p=>p[0]>x0 && p[0]<x1 && p[1]>y0 && p[1]<y1;
    const tr=(a,b)=>{ for(let k=1;k<40;k++){ const t=k/40; if(im([a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1])])) return true; } return false; };
    for(const c of camsAll) for(const w of [...AUSSEN, ...fac]) for(let i=0;i<20;i++){ const a=[w.a[0]+(w.b[0]-w.a[0])*i/20, w.a[1]+(w.b[1]-w.a[1])*i/20], b=[w.a[0]+(w.b[0]-w.a[0])*(i+1)/20, w.a[1]+(w.b[1]-w.a[1])*(i+1)/20];
      const m=[(a[0]+b[0])/2, (a[1]+b[1])/2]; if(w.n[0]*c[0]+w.n[1]*c[1]-w.d<=0.1) continue; if(tr(c, m)) continue; fans.push({c, a, b, w:1}); }
    // Zusatz: Blick in die Luecke (schraeg), damit der Spalt teils frei ist
    for(let y=0.6;y<=4.4;y+=0.2) fans.push({c:[gap/2, y<2.3 ? 1.0 : 4.0], a:[gap/2, 2.2], b:[gap/2, 2.77], w:0});
    return {lines, fans, path:camsAll.map(p=>({p, w:1})), bodenFrei:null, wBoden:0, inselFest:[], ausschluss:[]}; };
  const e3=U(pf(0.03), {hyp:false}), e8=U(pf(0.08), {hyp:false}), e3o=U(pf(0.03), {hyp:false, aussenEinschmelzen:0});
  notiz(`[M] Einschmelzen: 3 cm -> ${e3.ringe.map(r=>r.pts.length).join('/')} (verworfen ${JSON.stringify(e3.verworfen)}); ohne Einschmelzen ${e3o.ringe.map(r=>r.pts.length).join('/')}; 8 cm -> ${e8.ringe.map(r=>r.pts.length).join('/')}`);
  chk('Pfeiler 3 cm vor der Wand (rundum gesehen): eingeschmolzen, Aussenring 8 Ecken, keine Insel', inseln(e3).length===0 && e3.ringe[0].pts.length===8 && e3.verworfen.some(v=>v.grund==='einschmelzen') && inseln(e3o).length===1,
    `${e3.ringe.map(r=>r.pts.length).join('/')} (ohne Regel ${e3o.ringe.map(r=>r.pts.length).join('/')})`);
  chk('Pfeiler 8 cm vor der Wand: eigene Insel mit 4 Ecken', inseln(e8).length===1 && inseln(e8)[0].pts.length===4 && e8.ringe[0].pts.length===4);
  const w3=wallPolygonOk(e3.ringe.filter(r=>r.exportiert)), w8=wallPolygonOk(e8.ringe.filter(r=>r.exportiert)), w3o=wallPolygonOk(e3o.ringe.filter(r=>r.exportiert));
  chk('wallPolygon: 3 cm eingeschmolzen gueltig, 8 cm gueltig mit 1 Insel (ohne Einschmelzen 3 cm: Insel 3 cm vor der Wand)', w3.ok && w8.ok && w8.inseln===1, `3 cm ${w3.ok}, 8 cm ${w8.ok}/${w8.inseln}, ohne Regel ${w3o.ok}/${w3o.inseln}`);
}
// ---- Versprung 3σ und kollineare Nachbarkanten (7.6)
{
  // Wand S2 in zwei Landmarken 3 cm (bzw. 6 cm) versetzt: Versprung bleibt nur, wenn > max(jogMin, 3·sqrt(sd1²+sd2²))
  const mk=(dy, sd)=>{ const inp=raum(camsAll, [], 1, false), L=inp.lines.filter(l=>l.id!=='S2');
    L.push({...linie({id:'S2a', n:[0,1], d:0, a:[0,0], b:[3,0]}), sd}, {...linie({id:'S2b', n:[0,1], d:dy, a:[3,dy], b:[6,dy]}), sd});
    inp.fans=inp.fans.map(f=>({...f})); return {...inp, lines:L}; };
  const z=(dy,sd,o={})=>U(mk(dy,sd), {hyp:false, ...o}).ringe[0].pts.length;
  const a=z(0.03, 0.005), b=z(0.06, 0.005), c=z(0.06, 0.02), d=z(0.06, 0.02, {jogSigma:0});
  chk('Versprung 3 cm < jogMin: geglaettet (4 Ecken); 6 cm bei sd 0,5 cm: bleibt (6 Ecken); 6 cm bei sd 2 cm (3σ = 8,5 cm): geglaettet; ohne 3σ bleibt er', a===4 && b===6 && c===4 && d===6, `${a}/${b}/${c}/${d}`);
  // zwei Landmarken derselben Wand, 0,5° gegeneinander, Schnitt bei x = 3, getrennt durch eine Luecke > lueckeMax:
  // der Rand wechselt bei x = 3 die Linie; die Regel macht daraus eine Kante (keine Ecke aus fast parallelen Linien)
  const inp=raum(camsAll, [], 1, false), L=inp.lines.filter(l=>l.id!=='S2'), t=0.5*D2R, zb=x=>(x-3)*Math.tan(t);
  L.push(linie({id:'S2a', n:[0,1], d:0, a:[0,0], b:[2.5,0]}), linie({id:'S2b', n:[-Math.sin(t), Math.cos(t)], d:-3*Math.sin(t), a:[3.5,zb(3.5)], b:[6,zb(6)]}));
  const ek=U({...inp, lines:L}, {hyp:false}), ek0=U({...inp, lines:L}, {hyp:false, mergeDeg:0.01});
  chk('kollineare Nachbarkanten (|Δφ| 0,5°, Abstand an den Laufmitten 1,3 cm): eine Kante, Aussenring 4 Ecken; ohne Regel 5', ek.ringe[0].pts.length===4 && ek0.ringe[0].pts.length===5,
    `${ek.ringe[0].pts.length} (ohne Regel ${ek0.ringe[0].pts.length}), Kante auf ${ek.ringe[0].waende.join(',')}`);
}
// ---- Lueckenregel beim Zusammenlegen (W13) und Durchblick (8.1)
{
  // zwei fast gleiche Linien mit 1 m Luecke: getrennt; mit 0,3 m: zusammengelegt; mit 0,3 m und Durchblick in der Luecke: getrennt
  const L0=(gap, db=[])=>[linie({id:'A', n:[0,1], d:0, a:[0,0], b:[2,0]}), {...linie({id:'B', n:[0,1], d:0.005, a:[2+gap,0.005], b:[6,0.005]}), durchblick:db}];
  const zahl=(gap, db)=>{ const inp=raum(camsAll, [], 1, false); inp.lines=[...inp.lines.filter(l=>l.id!=='S2'), ...L0(gap, db)]; return U(inp, {hyp:false}).intern.L.filter(l=>!l.hyp).length; };
  const n1=zahl(1.0), n2=zahl(0.3), n3=zahl(0.3, [[-2.3, -2.0]]);   // s = u·p = -x fuer n = [0, 1]
  chk('Lueckenregel: Luecke 1 m getrennt, 0,3 m zusammengelegt, 0,3 m mit Durchblick getrennt', n1===n3 && n2===n1-1, `echte Linien ${n1}/${n2}/${n3}`);
  // Durchgang: Wand S3 (z = 5) mit Luecke [2.6, 3.4] und Durchblick darin, dahinter ein Nachbarraum 3 x 2 m, dessen
  // Waende nur durch den Durchgang gesehen werden. tuerTiefe 0,3 m und Beleg nur fuer nicht ganz dahinter gesehene Waende
  // halten ihn draussen; ohne tuerTiefe laeuft der Raum aus. Tuer mit Sturz (S3 ueber der Oeffnung belegt): ebenso.
  const nebenraum=(tt, sturz)=>{ const inp=raum(camsAll, [], 1, false), S3=inp.lines.find(l=>l.id==='S3'); S3.durchblick=[[2.6, 3.4]];   // n = [0, -1]: s = x
    if(!sturz) S3.iv=[[0, 2.6], [3.4, 6]];
    const wl=(id, n, d, iv)=>({id, n, d, iv, side:1, w:1, sd:0.005, sth:0.002, hOk:true, kind:'decke', kap:iv.map(()=>1), wAb:1, vert:[], durchblick:[]});
    inp.lines.push(wl('NF', [0,-1], -7, [[1.6, 4.4]]), wl('NW', [1,0], 1.5, [[-6.9, -5.1]]), wl('NO', [-1,0], -4.5, [[5.1, 6.9]]));
    for(const c of camsAll) if(c[1]>3) for(let x=1.6;x<4.4;x+=0.1){ const a=[x, 7], b=[x+0.1, 7], m=[(a[0]+b[0])/2, 7], s=(5-c[1])/(7-c[1]), xs=c[0]+s*(m[0]-c[0]); if(xs>2.6 && xs<3.4) inp.fans.push({c, a, b, line:'NF', w:1}); }
    return U(inp, {hyp:false, tuerTiefe:tt}); };
  const aus=r=>flaeche(r.pts)-30, d1=nebenraum(0.3, false), d2=nebenraum(Infinity, false), t1=nebenraum(0.3, true), t2=nebenraum(Infinity, true);
  chk('Durchgang mit Nachbarraum: mit tuerTiefe Flaeche ausserhalb < 0,1 m², ohne tuerTiefe laeuft der Raum aus (> 0,5 m²)', aus(d1.ringe[0])<0.1 && aus(d2.ringe[0])>0.5,
    `ausserhalb ${f3(aus(d1.ringe[0]))} / ${f3(aus(d2.ringe[0]))} m², Beleg NF ${f2(1-(d1.intern.L.find(l=>l.id==='NF').durch || 0))}`);
  chk('Tuer mit Sturz (S3 ueber der Oeffnung belegt, Durchblick darunter): mit tuerTiefe bleibt der Nachbarraum draussen; ohne laeuft er aus (Durchblick nimmt die Sichtpruefung)',
    aus(t1.ringe[0])<0.1 && aus(t2.ringe[0])>0.5 && t1.ringe[0].pts.length===4, `${f3(aus(t1.ringe[0]))} / ${f3(aus(t2.ringe[0]))} m², Aussenring ${t1.ringe[0].pts.length} Ecken`);
  const hl=U((()=>{ const inp=raum(camsAll, [], 1, false); inp.lines.find(l=>l.id==='S3').durchblick=[[2.6, 3.4]]; return inp; })(), {hyp:false});
  const hl0=U((()=>{ const inp=raum(camsAll, [], 1, false); inp.lines.find(l=>l.id==='S3').iv=[[0, 2.6], [3.4, 6]]; return inp; })(), {hyp:false});
  chk('keine Hypothesenlinien an den Enden einer Durchblick-Luecke (S3 mit Durchblick wie ohne Luecke; gleiche Luecke ohne Durchblick: +2 Linien)', hl.nLinien===U(raum(camsAll, [], 1, false), {hyp:false}).nLinien && hl0.nLinien===hl.nLinien+2,
    `Linien ${hl.nLinien} / ohne Durchblick ${hl0.nLinien}`);
}
// ---- Linienarten in umrissEingabe: ecken, lokal, unklar, stoer/unterzug, Gewicht, gBei
{
  const A={ab:0, g:{psi:0, tx:0, ty:0, tz:0}, knoten:null, stufe:'verbunden', w:1};
  const wand=(id, phi, rho, iv, z={})=>({id, rahmen:-1, phi, rho, cov:[1e-6,0,1e-4], h:'c', hLokal:null, cls:'wand', iv:iv.map(([s0,s1])=>({s0, s1, n:5, bilder:5})), durchblick:[], beob:[], abschnitte:[0], zustand:'bestaetigt', ...z});
  const K={hC:H, hF:0, abschnitte:[A], bilder:new Map(), beob:[], waende:new Map(), ecken:new Map(), inselEntscheide:new Map(), umriss:null, tiefe:{boden:null}};
  for(const w of [wand('a', 0, 0, [[0,1]]), wand('b', 0, 1, [[0,1]], {cls:'unklar'}), wand('c', 0, 2, [[0,1]], {cls:'stoer'}), wand('d', 0, 3, [[0,1]], {cls:'unterzug'}),
    wand('e', 0, 4, [[0,1]], {h:'lokal', hLokal:{h:2.2}}), wand('f', 0, 5, [[0,1]], {h:'lokal', hLokal:{h:2.2}}), wand('g', 0, 6, [], {h:null}), wand('j', 0, 9, [], {cls:'kandidat', zustand:'kandidat', h:null}), wand('k', 0, 10, [], {zustand:'kandidat', h:null}), wand('m', 0, 11, [], {cls:'unklar', h:null}),
    wand('h', 0, 7, [[0,1]], {h:'f'}), wand('i', 0, 8, [[0,1]], {rahmen:3})]) K.waende.set(w.id, w);
  const E=(id, p, top, art, waende, nPeil=8)=>K.ecken.set(id, {id, rahmen:-1, p, cov:[0,0,0], art, waende, beob:[], frei:[], senk:true, top, nPeil});
  E('e1', [5, 0], 2.2, 'konvex', ['f']); E('e2', [5, 1], 2.2, 'konvex', ['f']); E('g1', [6, 0.2], H, 'konvex', ['g'], 5); E('g2', [6, 0.5], H, 'konvex', ['g'], 20);
  for(const [id, x] of [['j', 9], ['k', 10], ['m', 11]]){ E(id+'1', [x, 0.2], H, 'konvex', [id], 20); E(id+'2', [x, 0.5], H, 'konvex', [id], 20); }
  const inp=G.umrissEingabe(K), by=Object.fromEntries(inp.lines.map(l=>[l.id, l]));
  chk('umrissEingabe Linienarten: wand->decke/hOk, unklar->w/2 ohne hOk, stoer/unterzug/fremder Rahmen weg, boden->kind boden',
    by.a && by.a.kind==='decke' && by.a.hOk && by.b && by.b.w===0.5 && !by.b.hOk && !by.c && !by.d && !by.i && by.h && by.h.kind==='boden' && !by.h.hOk, Object.keys(by).join(','));
  chk('lokal: hOk nur mit Senkrechten bis zur eigenen Oberkante an beiden Enden (f), sonst w/2 (e)', by.e && by.e.kind==='lokal' && !by.e.hOk && by.e.w===0.5 && by.f && by.f.hOk && by.f.w===1);
  { E('n1', [12, 0], H, 'konvex', ['n']); E('n2', [12, 1], H, 'konvex', ['n']); K.waende.set('n', wand('n', 0, 12, [[0,1]], {h:'lokal', hLokal:{h:2.2}}));
    const g=G.umrissEingabe(K).lines.find(l=>l.id==='n'), b=G.umrissEingabe(K, {lokalOben:'bis'}).lines.find(l=>l.id==='n'); K.waende.delete('n');
    chk("lokalOben (8.3, Lesart offen): Senkrechte bis zur Decke an einer lokal-Wand (Unterkante Unterzug auf der Inselseite) -> 'gleich' ohne hOk, 'bis' mit hOk", g && !g.hOk && b && b.hOk); }
  chk('ecken: Wand zwischen zwei Senkrechten bis zur Decke, Intervall zwischen den Eckpunkten, kap = min(1, nPeil/10)', by.g && by.g.kind==='ecken' && by.g.hOk && Math.abs(by.g.iv[0][0]-0.2)<1e-9 && Math.abs(by.g.iv[0][1]-0.5)<1e-9 && by.g.kap[0]===0.5,
    by.g && JSON.stringify({iv:by.g.iv, kap:by.g.kap}));
  chk('ecken nur fuer feste Waende (4): cls kandidat bzw. zustand kandidat mit zwei Senkrechten fallen weg; unklar -> ecken mit w/2 ohne hOk',
    !by.j && !by.k && by.m && by.m.kind==='ecken' && !by.m.hOk && by.m.w===0.5, ['j','k','m'].map(id=>id+':'+(by[id] ? by[id].kind+'/'+by[id].hOk+'/'+by[id].w : '-')).join(' '));
  A.w=0.04; chk('Abschnittsgewicht < minW: alle Linien fallen weg', G.umrissEingabe(K).lines.length===0); A.w=1;
}
// ---- umrissEingabe mit G.gBei (Pflicht 8) an T3 drift2 und verschmiert
for(const fall of ['drift2', 'verschmiert']){
  const e=T3.sim(T3.WAHRHEIT, {G, ...T3.SITZUNGEN[fall], rausch:{sigPx:0, kuerzPx:0}}), K=karteAusSim(e), W=e.welt;   // ohne Pixelrauschen: 1 px sind bei 5 m ~6 cm laengs
  const ab=(K2)=>{ const inp=G.umrissEingabe(K2, {faecher:'alle'}), d=[];
    for(const f of inp.fans){ const w=W.waende[+String(f.line).slice(1)]; if(!w || !String(f.line).startsWith('W')) continue; for(const p of [f.a, f.b]) d.push(Math.abs(w.n[0]*p[0]+w.n[1]*p[1]-w.rho)); } return d; };
  const d1=ab(K), K0=karteAusSim(e, {knoten:false}), d0=ab(K0);
  notiz(`[M] ${fall}: Faecher-Enden gegen die Wahrheitswand mit gBei Median ${cm(q(d1,0.5))} / p99 ${cm(q(d1,0.99))} cm, nur abschnitt.g ${cm(q(d0,0.5))} / ${cm(q(d0,0.99))} cm (n ${d1.length})`);
  chk(`${fall}: Faecher mit G.gBei liegen auf der Wahrheit (p99 < 0,5 cm), nur mit abschnitt.g nicht (p99 > 1 cm)`, q(d1, 0.99)<0.005 && q(d0, 0.99)>0.01, `${cm(q(d1,0.99))} / ${cm(q(d0,0.99))} cm`);
}
// ---- Ablauf wie M10 (raumskizze-kartenlauf.js mlUmriss nachgebildet): freier Schnitt, Hypothesen mit der vorigen
// Bewertung, zweiter Schnitt mit teil/voll als inselFest, Exportregel durch M10; T3 pfeiler2 (2 Seiten), 5 Runden am Ende
{
  const e=T3.sim(T3.WAHRHEIT, {G, ...T3.SITZUNGEN.pfeiler2}), tE=e.bilder[e.bilder.length-1].bildErg.t, PF=mitte(e.welt.ringe[2].pts);
  const ent=w=>w==='ja' ? 'nutzer-ja' : w==='nein' ? 'nutzer-nein' : w==='schrank' ? 'schrank' : null;
  let KZu=null, hypVorher=new Map(), entscheide=new Map(); const ids=[], exp=[];
  const runde=(t)=>{ const K=karteAusSim(e, {bis:t}); K.umriss=KZu; K.inselEntscheide=entscheide; const inp=G.umrissEingabe(K, {nurGlobal:true, minW:0.05}), opt={...G.UM_DEF};
    let erg=G.umriss(inp, opt); const bew=[];
    for(const h of G.inselHypothesen(inp, erg, opt).sort((a,b)=>a.id<b.id ? -1 : 1).slice(0, 4)){ const vorher=hypVorher.get(h.id) || null, b=G.inselBewerten(inp, h, erg, {...opt, vorher});
      const kand=['kandidat','teil','voll'].includes(b.stufe); b.runden=kand ? (vorher && vorher.runden ? vorher.runden : 0)+1 : 0; if(b.stufe==='kandidat' && b.runden>=opt.hypRunden) b.stufe='teil'; bew.push({...b, poly:h.poly}); }
    const fest=bew.filter(b=>b.stufe==='teil' || b.stufe==='voll');
    if(fest.length) erg=G.umriss({...inp, inselFest:[...(inp.inselFest || []), ...fest.map(b=>({id:b.id, poly:b.poly}))]}, opt) || erg;
    hypVorher=new Map(bew.map(b=>[b.id, b])); erg.hypothesen=bew.map(({poly, ...b})=>b);
    for(const R of erg.ringe){ if(R.art==='aussen'){ R.entscheid='auto'; R.exportiert=true; continue; } const z=ent(entscheide.get(R.id)); if(z){ R.entscheid=z; R.exportiert=z==='nutzer-ja'; } else if(R.teil){ R.entscheid='offen'; R.exportiert=false; } else { R.entscheid='auto'; R.exportiert=true; } }
    KZu=erg; const P=erg.ringe.find(R=>R.art==='insel' && Math.hypot(mitte(R.pts)[0]-PF[0], mitte(R.pts)[1]-PF[1])<0.3); ids.push(P ? P.id+'/'+P.entscheid : '-'); exp.push(erg.ringe.filter(R=>R.art==='insel' && R.exportiert && R.teil && !entscheide.has(R.id)).length); return P; };
  let P=null; for(const d of [2, 1.5, 1, 0.5, 0]) P=runde(tE-d);
  chk('Ablauf wie M10 (pfeiler2): Pfeiler nach 3 Runden als teil-Ring mit stabiler Hypothesen-id, offen, kein unbestaetigtes teil exportiert', P && P.id[0]==='I' && P.entscheid==='offen' && !P.exportiert &&
    ids.slice(2).every(x=>x===ids[4]) && exp.every(n=>n===0), ids.join(' | '));
  entscheide=new Map([[P.id, 'ja']]); const P2=runde(tE);
  chk('Ablauf wie M10: nach "Uebernehmen" (inselEntscheide ja) dieselbe id, nutzer-ja, exportiert', P2 && P2.id===P.id && P2.entscheid==='nutzer-ja' && P2.exportiert, P2 && P2.id+'/'+P2.entscheid);
}
// ---- Integration M10 + M7 (Befund 5): echter Kartenlauf (raumskizze-kartenlauf.js) mit echtem M7, T3 pfeiler2 ueber 5 Runden
// und eine Runde nach "Uebernehmen". M4-M6 ruhen waehrend des Tests (lmAusgleich: leerer Erfolg, die uebrigen fehlen, M10 laesst
// sie aus); den Kartenzustand jeder Runde liefert karteAusSim (Orakel). Vorhandene G-Funktionen werden danach wiederhergestellt.
{
  const RUHE=['sessionCuts','ketteStart','lmEinbinden','registriere','lmBloecke','lmAusgleich','knotenSetzen','lmNeuZuordnen','lmDurchblick','lmZusammenfuehren','lmTrennen','lmIntervalle','lmHoehenklasse','abschnittGewicht'];
  const alt=Object.fromEntries(RUHE.map(k=>[k, G[k]])), umAlt=G.umriss, rufe=[];
  for(const k of RUHE) G[k]=undefined; G.lmAusgleich=()=>({ok:true, iter:0, lin:0, relin:0, rest:[]});
  G.umriss=(inp, opt)=>{ const r=umAlt(inp, opt); rufe.push({vorher:!!(opt && opt.vorher), fest:(inp.inselFest || []).map(f=>f.id), runde:KZ.runde}); return r; };
  const e=T3.sim(T3.WAHRHEIT, {G, ...T3.SITZUNGEN.pfeiler2}), tE=e.bilder[e.bilder.length-1].bildErg.t, PF=mitte(e.welt.ringe[2].pts);
  const KZ=G.karteNeu({reg:false, umrissJede:1});
  const speise=t=>{ const K=karteAusSim(e, {bis:t}); for(const f of ['abschnitte','bilder','beob','waende','ecken','hC','hF','sHC','sHF','H','hoehen','tiefe']) KZ[f]=K[f]; KZ.kern=0; };
  const pf=st=>(st.ringe || []).find(R=>R.art==='insel' && Math.hypot(mitte(R.pts)[0]-PF[0], mitte(R.pts)[1]-PF[1])<0.3);
  const verlauf=[]; let fehler=null, unbestExp=0, festTeil=0;
  try{ for(const d of [2, 1.5, 1, 0.5, 0]){ speise(tE-d); const {stand}=G.karteRechnen(KZ); if(stand.fehler) fehler=stand.fehler; const P=pf(stand);
      verlauf.push(P ? P.id+'/'+P.entscheid+(P.exportiert ? '/exp' : '') : '-');
      unbestExp+=(stand.ringe || []).filter(R=>R.art==='insel' && R.exportiert && R.teil && !KZ.inselEntscheide.has(R.id)).length;
      const teilIds=new Set((stand.hypothesen || []).filter(h=>h.stufe==='teil').map(h=>h.id)); festTeil+=rufe.filter(r=>r.runde===KZ.runde && r.fest.some(id=>teilIds.has(id) && !KZ.inselEntscheide.has(id))).length; }
  }catch(x){ fehler=String(x && x.message || x); }
  const P=pf(KZ.umriss || {}), vorherAb2=rufe.filter(r=>r.runde>=2).every(r=>r.vorher), proRunde=Math.max(...[1,2,3,4,5].map(r=>rufe.filter(x=>x.runde===r).length));
  chk('Integration M10+M7 (pfeiler2, 5 Runden): kein Fehler, Pfeiler als teil-Ring mit stabiler Hypothesen-id, offen, nie unbestaetigt exportiert',
    !fehler && P && P.id[0]==='I' && P.entscheid==='offen' && !P.exportiert && verlauf.slice(2).every(x=>x===verlauf[4]) && unbestExp===0, fehler || verlauf.join(' | '));
  chk('Integration: M10 gibt ab Runde 2 opt.vorher (Umriss der vorigen Runde) an G.umriss; unbestaetigte teil-Hypothesen nie als inselFest', vorherAb2 && festTeil===0,
    `vorher ${vorherAb2}, teil als inselFest ${festTeil}, G.umriss-Aufrufe je Runde hoechstens ${proRunde}`);
  if(P){ G.karteEntscheid(KZ, {ring:P.id, wahl:'ja', t:tE}); speise(tE); const {stand}=G.karteRechnen(KZ), Q=pf(stand), r6=rufe.filter(r=>r.runde===KZ.runde);
    chk('Integration: nach "Uebernehmen" (karteEntscheid ja) dieselbe id, nutzer-ja, exportiert; inselFest traegt sie', Q && Q.id===P.id && Q.entscheid==='nutzer-ja' && Q.exportiert && r6.some(r=>r.fest.includes(P.id)),
      Q ? Q.id+'/'+Q.entscheid+(Q.exportiert ? '/exp' : '') : '-'); }
  for(const k of RUHE) G[k]=alt[k]; G.umriss=umAlt;
}
// ---- T3 rund (Ganzbild, Orakel-Landmarken): beide Inseln, Aussenring 14, gueltig, Laufzeit
{
  const e=T3.sim(T3.WAHRHEIT, {G, ...T3.SITZUNGEN.rund}), R=runden(e, [0.8, 0.9, 1.0]), erg=R.erg, M=ringMass(erg, e.welt.wahrheit), MJ=ringMass(erg, e.welt.wahrheit, true);
  const wp=wallPolygonOk(erg.ringe.filter(r=>r.exportiert));
  notiz(`[M] T3 rund: ${R.inp.lines.length} Linien, ${R.inp.fans.length} Faecher, ${erg.nLinien} Kandidatenlinien, ${erg.nZellen} Zellen, ms ${f2(erg.ms.gesamt)} (${Object.entries(erg.ms).map(([k,v])=>k+' '+f2(v)).join(', ')})`);
  notiz(`[M] T3 rund: Ringe ${erg.ringe.map(r=>`${r.art}/${r.id}/${r.pts.length}/${r.entscheid}${r.exportiert ? '/exp' : ''}`).join(' ')}; Aussen ${M && M.aussen.n}/${M && M.aussen.nT} Ecken, Median ${M && cm(M.aussen.eMed)} cm, Max ${M && cm(M.aussen.eMax)} cm; Inseln ${MJ && MJ.inseln.map(x=>x.wahr+':'+(x.gefunden ? x.n+'/'+x.nT+' IoU '+f2(x.iou)+(x.bestanden ? ' bestanden' : ' nicht') : 'fehlt')).join(', ')}; falsche ${M && M.falscheInseln.length}`);
  chk('T3 rund: Aussenring 14 Ecken, 0 fehlend, 0 ueberzaehlig (15 cm)', M && M.aussen.n===14 && !M.aussen.fehlend.length && !M.aussen.ueberzaehlig.length, M && `${M.aussen.n} Ecken`);
  chk('T3 rund: beide Inseln exportiert, 0 falsche, wallPolygon gueltig mit 2 Inseln', M && M.inseln.every(x=>x.gefunden) && !M.falscheInseln.length && wp.ok && wp.inseln===2, `wallPolygon ${wp.ok}/${wp.inseln}, Netto ${f3(wp.flaeche)} m²`);
  chk('T3 rund: Inselabnahme 10.5 Punkte 1-6 fuer beide Inseln', M && M.inseln.every(x=>x.bestanden), M && M.inseln.map(x=>x.wahr+' '+JSON.stringify(x.kriterien)).join(' | '));
}
console.log(out.join('\n'));
console.log('\nMessungen:\n'+mess.map(s=>'  '+s).join('\n'));
console.log(ok ? '\nALLE CHECKS GRÜN' : '\nCHECKS ROT');
process.exit(ok ? 0 : 1);
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]){ if(process.argv.includes('--abnahme')) abnahme(); else main(); }
