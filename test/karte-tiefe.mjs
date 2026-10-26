// Prueft M9 raumskizze-tiefe.js (ARCHITEKTUR v3, 3.5, 4, 17.8): Einbau, Strahlen und Heben (gegen G.ray und
// gegen den Prototyp tiefe/tiefe-lib.mjs unproject an echten Saetzen), Merkmale, Guetepforte mit Typ und
// Freigaben, Boden-Freiraum (gegen die Wahrheit, Wachsen, Stempel, Abschnitt, Moebel), Wandebenen, Zuordnung,
// Kantenpruefung und senkrechte ARCore-Ebenen (G.ebeneAusAR), dazu Wiederholbarkeit und Mac-Zeit A + B.
// Boden-Freiraum mit genau der T-M4-Regel aus 10.7 (Zellmitte ausserhalb des Raums, Inseln aussen, < 1 %) wie tm4.mjs.
// Verbund mit M10 (G.karteTiefe, fremdes Paket P-H): als "OFFEN" gemeldet, nicht im Gesamtergebnis; uebersprungene
// Pruefungen (ohne Scratchpad-Daten) zaehlt die Zusammenfassung. Die 10.7-Reproduktion (Decke/Verfuegbarkeit/Boden an
// A6-A8) und T-M4 an A7/A8 liegen nur in design/bau/P-G/repro.mjs und tm4.mjs (Scratchpad), nicht in diesem Test.
// Synthetische Tiefe: eigener Strahlwurf durch die Wahrheit (T3 welt), unabhaengig vom Modul ueber G.ray und
// die Puffer-Abbildung aus tiefe.md 2.1 (Pufferspalte = v, Pufferzeile = 0,8984 - 0,7968·u).
// Laedt vendor + geo von raumskizze-probe.html wie raumskizze-protokoll.mjs und fuegt M0 und M9 als eigene
// Bloecke vor globalThis.RAUMSKIZZE=G; ein, wenn die Seite sie nicht wortgleich traegt.
//
//   node test/karte-tiefe.mjs     (RAUMSKIZZE_HTML=pfad: anderer Stand der Seite; TIEFE_A7=ordner, TIEFE_LIB=datei:
//                                  echte Aufnahme und Prototyp fuer den Vergleich, sonst uebersprungen)
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import * as T3 from '../raumskizze-sim.mjs';

const read=f=>readFileSync(new URL('../'+f, import.meta.url), 'utf8');
const html=process.env.RAUMSKIZZE_HTML ? readFileSync(process.env.RAUMSKIZZE_HTML, 'utf8') : read('raumskizze-probe.html');
const pick=id=>{ const m=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`)); if(!m) throw new Error(`Script-Block "${id}" nicht gefunden`); return m[1]; };
const DATEI='raumskizze-tiefe.js', src=read(DATEI), mark='globalThis.RAUMSKIZZE=G;';
let geo=pick('geo'); if(geo.lastIndexOf(mark)<0) throw new Error('geo-Block ohne '+mark);
const traegt=geo.includes('{\n'+src+'}\n') || geo.includes('{\n'+src+'\n}\n');
new Function('"use strict";\n'+pick('vendor')+'\n'+geo)();
const G0keys=new Set(Object.keys(globalThis.RAUMSKIZZE));
const einfuegen=q=>{ const at=geo.lastIndexOf(mark); geo=geo.slice(0, at)+'{\n'+q+'\n}\n'+geo.slice(at); };
if(!/G\.gBei=/.test(geo)) einfuegen(read('raumskizze-karte-grund.js'));
if(!traegt) einfuegen(src);
new Function('"use strict";\n'+pick('vendor')+'\n'+geo)();
const G=globalThis.RAUMSKIZZE;

const out=[]; let ok=true, nChk=0, nUeber=0, nOffen=0; const mess=[];
const chk=(name,cond,info='')=>{ nChk++; ok=ok&&!!cond; out.push((cond?'ok   ':'ROT  ')+name+(info!==''?'  ('+info+')':'')); };
const notiz=s=>mess.push(s);
// uebersprungen: Pruefung ohne Daten (zaehlt sichtbar in der Zusammenfassung); offen: Verbund mit fremdem Modul, nicht im Ergebnis
const ueber=s=>{ nUeber++; out.push('SKIP '+s); };
const offen=(name,cond,info='')=>{ if(!cond) nOffen++; out.push((cond?'ok   ':'OFFEN')+' [Verbund] '+name+(info!==''?'  ('+info+')':'')); };
const D2R=Math.PI/180, R2D=180/Math.PI, f2=x=>Number.isFinite(x) ? x.toFixed(2) : String(x), f3=x=>Number.isFinite(x) ? x.toFixed(3) : String(x);
const e1=x=>Number.isFinite(x) ? x.toExponential(1) : String(x), pc=(a,b)=>b ? (100*a/b).toFixed(1)+' %' : '–';
const wrapPi=a=>Math.atan2(Math.sin(a), Math.cos(a));
const q=(a,p)=>{ if(!a.length) return NaN; const s=Float64Array.from(a).sort(); return s[Math.min(s.length-1, Math.floor(p*s.length))]; };
const zeitMs=f=>{ const t0=process.hrtime.bigint(), r=f(); return [r, Number(process.hrtime.bigint()-t0)/1e6]; };
const NAMEN=['depthRays','depthFlags','depthLift','depthQuality','depthFloorFree','depthWallPlanes','depthAssoc','depthEdgeCheck','ebeneAusAR'];

// ------------------------------------------------- Szene und unabhaengiger Strahlwurf
const WELT=T3.welt(T3.WAHRHEIT, {G}), H=WELT.H, RINGE=WELT.ringe;
const imPoly=(p,P)=>{ let c=false; for(let i=0,j=P.length-1;i<P.length;j=i++){ const a=P[i], b=P[j]; if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) c=!c; } return c; };
const imRaum=p=>imPoly(p, RINGE[0].pts) && !RINGE.slice(1).some(r=>imPoly(p, r.pts));
const segAbst=(p,a,b)=>{ const vx=b[0]-a[0], vy=b[1]-a[1]; let t=((p[0]-a[0])*vx+(p[1]-a[1])*vy)/(vx*vx+vy*vy); t=Math.max(0, Math.min(1, t)); return Math.hypot(a[0]+t*vx-p[0], a[1]+t*vy-p[1]); };
const wandAbst=p=>Math.min(...WELT.waende.map(w=>segAbst(p, w.A, w.B)));
const MD=[0,-0.7968,0,0, 1,0,0,0, 0,0,1,0, 0,0.8984,0,1], DW=160, DH=90, SC=0.001, PROJ=T3.PROJ_A6;
// Szene: senkrechte Flaechen (Strecke A-B im Plan, y0..y1), Kisten (Plan-Vieleck, y0..y1, mit Deckel), Boden y = 0, Decke y = H.
const SZENE={waende:WELT.waende.map(w=>({A:w.A, B:w.B, y0:0, y1:H})), kisten:[], H};
const kiste=(poly,y0,y1)=>({poly, y0, y1, seiten:poly.map((p,i)=>({A:p, B:poly[(i+1)%poly.length], y0, y1}))});
function treffer(sz,o,d){
  let t=Infinity, art=null;
  if(d[1]<0){ const tt=-o[1]/d[1]; if(tt<t){ t=tt; art='boden'; } }
  if(d[1]>0){ const tt=(sz.H-o[1])/d[1]; if(tt<t){ t=tt; art='decke'; } }
  const flaeche=(F,a)=>{ const ex=F.B[0]-F.A[0], ez=F.B[1]-F.A[1], den=d[0]*ez-d[2]*ex; if(Math.abs(den)<1e-12) return;
    const dx=F.A[0]-o[0], dz=F.A[1]-o[2], tt=(dx*ez-dz*ex)/den, u=(dx*d[2]-dz*d[0])/den; if(!(tt>1e-6 && u>=0 && u<=1 && tt<t)) return;
    const y=o[1]+tt*d[1]; if(y>=F.y0 && y<=F.y1){ t=tt; art=a; } };
  for(const F of sz.waende) flaeche(F, 'wand');
  for(const K of sz.kisten){ for(const F of K.seiten) flaeche(F, 'kiste');
    if(d[1]<0){ const tt=(K.y1-o[1])/d[1]; if(tt>1e-6 && tt<t && imPoly([o[0]+tt*d[0], o[2]+tt*d[2]], K.poly)){ t=tt; art='kiste'; } } }
  return {t, art};
}
// Puffer (u16, mm) fuer camTo in der Szene; o.deckeFaktor: Deckenwerte so viel zu tief (geglaettete Tiefe, tiefe.md 2.3).
function rendern(camTo,sz=SZENE,o={}){
  const raw=new Uint16Array(DW*DH), c=[camTo[12], camTo[13], camTo[14]], f=[-camTo[8], -camTo[9], -camTo[10]];
  for(let j=0;j<DH;j++) for(let i=0;i<DW;i++){
    const v=(i+0.5)/DW, u=(MD[13]-(j+0.5)/DH)/(-MD[1]), r=G.ray(PROJ, camTo, 2*u-1, 1-2*v), T=treffer(sz, c, r.d);
    if(!Number.isFinite(T.t)) continue;
    let s=T.t*(r.d[0]*f[0]+r.d[1]*f[1]+r.d[2]*f[2]); if(T.art==='decke' && o.deckeFaktor) s*=o.deckeFaktor;
    raw[j*DW+i]=Math.min(65535, Math.round(s/SC)); }
  return raw;
}
// Abstand eines Punkts zur naechsten Flaeche der Szene (Boden, Decke, Waende, Kisten).
function szenenAbst(P,sz=SZENE){
  let d=Math.min(Math.abs(P[1]), Math.abs(sz.H-P[1]));
  const fl=F=>{ const yd=P[1]<F.y0 ? F.y0-P[1] : P[1]>F.y1 ? P[1]-F.y1 : 0; d=Math.min(d, Math.hypot(segAbst([P[0], P[2]], F.A, F.B), yd)); };
  sz.waende.forEach(fl); for(const K of sz.kisten){ K.seiten.forEach(fl); if(imPoly([P[0], P[2]], K.poly)) d=Math.min(d, Math.abs(P[1]-K.y1)); }
  return d;
}
// Kamerabilder auf dem Weg 'rund': alle 0,3 m, Gier pendelt um die Wegrichtung, Neigung im Wechsel.
function bilderAufWeg(neigungen, schritt=0.3, gierAmp=50){
  const W=T3.PFADE.rund, out=[]; let k=0;
  for(let i=0;i+1<W.length;i++){ const a=W[i], b=W[i+1], L=Math.hypot(b[0]-a[0], b[1]-a[1]), al=Math.atan2(b[1]-a[1], b[0]-a[0]);
    for(let s=0;s<L;s+=schritt){ const p=[a[0]+(b[0]-a[0])*s/L, a[1]+(b[1]-a[1])*s/L], th=neigungen[k%neigungen.length]*D2R;
      out.push({k, camTo:T3.kameraMatrix(p, 1.45, al+gierAmp*D2R*Math.sin(0.9*k), th)}); k++; } }
  return out;
}

// ------------------------------------------------- Datei und Einbau
{
  const Gs={}; let fehler=null; try{ new Function('G', '"use strict";\n'+src)(Gs); }catch(x){ fehler=x.message; }
  const neu=Object.keys(Gs).sort(), soll=[...NAMEN].sort();
  chk('Datei laedt allein (new Function, ohne geo-Kern) und haengt genau die 9 Namen aus 2/4 an G', !fehler && JSON.stringify(neu)===JSON.stringify(soll),
    fehler || neu.filter(k=>!NAMEN.includes(k)).concat(NAMEN.filter(k=>!neu.includes(k))).join(',') || neu.length+' Namen');
  const kollision=NAMEN.filter(k=>G0keys.has(k));
  chk('keine Kollision mit Namen, die der geo-Block schon traegt', !kollision.length, kollision.join(',') || (traegt ? 'Seite traegt das Modul' : 'eingefuegt'));
  chk('Datei endet mit genau einem Zeilenumbruch, kein import/export/</script>', /[^\n]\n$/.test(src) && !/^\s*(import|export)\s/m.test(src) && !src.includes('</script>'));
  const code=src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const verboten=[/Math\.random/, /Date\.now/, /performance\.now/, /\bwindow\b/, /\bdocument\b/, /\bself\b/, /\bpostMessage\b/].filter(r=>r.test(code));
  chk('kein Math.random, keine Uhr, kein DOM/Worker-Global im Code (2)', !verboten.length, verboten.map(String).join(' '));
  chk('kein atan2 auf Matrixeintraege (1.2, Suchmuster wie test/karte-grund.mjs)', !/atan2\s*\([^)]*\b(m|camTo|pose|T|M|mat)\s*\[\s*(0|2|8|10)\s*\]/.test(code));
  chk('kein G.*-Aufruf beim Laden (nur Zuweisungen an G auf oberster Ebene)', !/^(?!G\.\w+=)[^\n]*\bG\.\w+\(/m.test(code.split('\n').filter(l=>!/^\s/.test(l)).join('\n')));
  chk('Versatz nach F0 wird in M9 nie angewandt (kein gBei/gMat/gKomp im Code)', !/G\.(gBei|gMat|gKomp)\b/.test(code));
}

// ------------------------------------------------- A. Strahlen und Heben
const RAYS=G.depthRays(MD, PROJ, DW, DH);
{
  let zOk=true; for(let p=0;p<DW*DH;p++) if(RAYS.dir[3*p+2]!==-1) zOk=false;
  const nIn=RAYS.inView.reduce((a,b)=>a+b, 0);
  chk('depthRays: dir mit z = -1 (z-Abstand, nicht Laenge 1), w/h/key gesetzt', zOk && RAYS.w===DW && RAYS.h===DH && typeof RAYS.key==='string' && RAYS.key.length>10);
  chk('depthRays: Ansicht deckt ~79,7 % der Pufferzeilen (tiefe.md 2.1)', Math.abs(nIn/(DW*DH)-0.7968)<0.02, pc(nIn, DW*DH));
  const camTo=T3.kameraMatrix([3, 3], 1.4, 0.7, -0.3), rnd=G.KG.rnd(11); let mx=0;
  for(let k=0;k<300;k++){ const i=Math.floor(rnd()*DW), j=Math.floor(rnd()*DH), p=j*DW+i;
    const v=(i+0.5)/DW, u=(MD[13]-(j+0.5)/DH)/(-MD[1]), r=G.ray(PROJ, camTo, 2*u-1, 1-2*v);
    const d=[RAYS.dir[3*p], RAYS.dir[3*p+1], RAYS.dir[3*p+2]], w=[camTo[0]*d[0]+camTo[4]*d[1]+camTo[8]*d[2], camTo[1]*d[0]+camTo[5]*d[1]+camTo[9]*d[2], camTo[2]*d[0]+camTo[6]*d[1]+camTo[10]*d[2]];
    const L=Math.hypot(...w); mx=Math.max(mx, Math.acos(Math.min(1, (w[0]*r.d[0]+w[1]*r.d[1]+w[2]*r.d[2])/L))); }
  chk('depthRays gegen G.ray (Puffer-Abbildung aus tiefe.md 2.1, 300 Pixel): Winkel <= 1e-5 rad', mx<=1e-5, e1(mx)+' rad');
  chk('depthRays: singulaere M -> null', G.depthRays(new Array(16).fill(0), PROJ, DW, DH)===null);
}
{
  // Heben auf der Szene: jeder gehobene Punkt liegt auf einer Flaeche (Quantisierung 1 mm).
  const B=bilderAufWeg([-35, -10, 20], 1.2); let mx=0, n=0;
  for(const b of B.slice(0, 12)){ const raw=rendern(b.camTo), L=G.depthLift(raw, SC, RAYS, b.camTo, {sMax:Infinity});
    for(let k=0;k<L.n;k+=7){ mx=Math.max(mx, szenenAbst([L.P[3*k], L.P[3*k+1], L.P[3*k+2]])); n++; } }
  chk('depthLift auf gerenderter Wahrheit: Punkte auf der Flaeche <= 3 mm (12 Bilder)', mx<=0.003, `${n} Punkte, max ${(1000*mx).toFixed(2)} mm`);
  const camTo=B[0].camTo, raw=rendern(camTo), L1=G.depthLift(raw, SC, RAYS, camTo), L2=G.depthLift(raw, SC, RAYS, camTo, {step:2}),
    L3=G.depthLift(raw, SC, RAYS, camTo, {ansicht:false}), L4=G.depthLift(raw, SC, RAYS, camTo, {sMax:1.5});
  const nIn=RAYS.inView.reduce((a,b)=>a+b, 0);
  chk('depthLift: nPix/nNull/cam, step 2 ~ 1/4, ansicht:false alle Pixel, sMax schneidet', L1.nPix===nIn && L3.nPix===DW*DH && Math.abs(L2.nPix/L1.nPix-0.25)<0.02 &&
    L4.n<L1.n && Array.from(L4.s).every(s=>s<=1.5) && L1.cam[0]===camTo[12] && L1.cam[2]===camTo[14], `${L1.n}/${L2.n}/${L3.n}/${L4.n}`);
}
// Prototyp-Vergleich an echten Saetzen (tiefe/tiefe-lib.mjs unproject, Variante u0v0, z-Abstand)
{
  const SP='/private/tmp/claude-501/-Volumes-external-TobiCodetEndlichWieder-Zaene/86e1205e-9d6d-494b-b0b6-88f6e01be4b0/scratchpad';
  const LIB=process.env.TIEFE_LIB || SP+'/design/tiefe/tiefe-lib.mjs';
  let A7=process.env.TIEFE_A7 || null;
  if(!A7 && existsSync(SP+'/a7/x')){ const d=readdirSync(SP+'/a7/x').find(n=>!n.startsWith('.')); if(d) A7=SP+'/a7/x/'+d; }
  if(A7 && existsSync(A7+'/tiefe.bin.gz') && existsSync(LIB)){
    const TL=await import(LIB), R=TL.loadRec(A7); let n=0, mx=0, gleich=true, nPkt=0, rays=null;
    for(const rec of R.depth){ if(n>=25) break; const r=R.byV.get(rec.vi); if(!r) continue; const ct=R.camToOf(r); if(!ct) continue;
      if(!rec.raw.some(x=>x)) continue; n++;
      rays=rays && rays.key===G.depthRays(rec.M, R.proj, rec.w, rec.h).key ? rays : G.depthRays(rec.M, R.proj, rec.w, rec.h);
      const ref=TL.unproject(rec, R.proj, ct, {step:1, inViewOnly:true}), L=G.depthLift(rec.raw, rec.sc, rays, ct, {sMax:Infinity});
      if(ref.length/TL.STRIDE!==L.n){ gleich=false; continue; }
      for(let k=0;k<L.n;k++){ const o=k*TL.STRIDE; if(L.idx[k]!==ref[o+5]*rec.w+ref[o+4]) gleich=false;
        mx=Math.max(mx, Math.abs(L.P[3*k]-ref[o]), Math.abs(L.P[3*k+1]-ref[o+1]), Math.abs(L.P[3*k+2]-ref[o+2]), Math.abs(L.s[k]-ref[o+3])); nPkt++; } }
    chk('depthLift = tiefe-lib unproject (u0v0, z-Abstand) an 25 echten A7-Saetzen: gleiche Pixel, |dP| <= 1e-5 m', gleich && n===25 && mx<=1e-5, `${nPkt} Punkte, max ${e1(mx)} m`);
  } else ueber('depthLift = tiefe-lib unproject an echten A7-Saetzen: A7 oder tiefe-lib.mjs nicht gefunden (TIEFE_A7, TIEFE_LIB)');
}

// ------------------------------------------------- A. Merkmale
{
  const rnd=G.KG.rnd(5); let gleich=true;
  for(let k=0;k<60;k++){ const n=2000+Math.floor(rnd()*14400), raw=new Uint16Array(n), z0=rnd()*0.5, sp=rnd()<0.3 ? 0.03 : 3*rnd();
    for(let i=0;i<n;i++) raw[i]=rnd()<z0 ? 0 : Math.max(1, Math.round((0.3+sp*rnd()+(rnd()<0.01 ? 60*rnd() : 0))*1000));
    const v=Array.from(raw).filter(x=>x).sort((a,b)=>a-b), soll=v.length>0 && (v[Math.floor(v.length*0.98)]-v[Math.floor(v.length*0.02)])*0.001<0.05;
    const F=G.depthFlags(raw, null, 0.001); if(F.flat!==soll || Math.abs(F.validFrac-v.length/n)>1e-12) gleich=false; }
  chk('depthFlags.flat = sortierte 2-98-%-Spanne < 5 cm (wie tiefe/strahl2.mjs), 60 Zufallspuffer', gleich);
  const a=rendern(T3.kameraMatrix([3, 3], 1.4, 0.7, -0.3)), b=Uint16Array.from(a); b[100]^=1;
  const leer=new Uint16Array(DW*DH), fast=new Uint16Array(DW*DH); for(let i=0;i<100;i++) fast[i*7]=2000;
  const konst=new Uint16Array(DW*DH).fill(2000); for(let i=0;i<DW*DH;i+=3) konst[i]=2030;
  const F1=G.depthFlags(a, a, SC), F2=G.depthFlags(a, b, SC), F3=G.depthFlags(leer, null, SC), F4=G.depthFlags(fast, null, SC), F5=G.depthFlags(konst, null, SC);
  chk('depthFlags: stale (bytegleich), nicht stale bei 1 Bit, empty (0 und < 1 %), flat (3 cm Spanne), normal alles false',
    F1.stale && !F2.stale && !F2.flat && !F2.empty && F3.empty && F3.validFrac===0 && !F3.flat && F4.empty && F4.validFrac<0.01 && F5.flat && !F5.empty,
    `normal validFrac ${f3(F2.validFrac)}`);
}

// ------------------------------------------------- A. Guetepforte
{
  const runter=T3.kameraMatrix([1.5, 3.0], 1.45, 0.3, -35*D2R), hoch=T3.kameraMatrix([4.5, 3.3], 1.45, 0, 40*D2R);   // freier Blick zur Decke (keine Wand vor dem Deckentreffer <= 2,5 m)
  const L=(c,o)=>G.depthLift(rendern(c, SZENE, o), SC, RAYS, c);
  const Qr=G.depthQuality(L(runter), RAYS, runter, H), Qh=G.depthQuality(L(hoch), RAYS, hoch, H);
  const Qhr=G.depthQuality(L(hoch), RAYS, hoch, H, {typ:'raw'}), Qhs=G.depthQuality(L(hoch), RAYS, hoch, H, {typ:'smooth', freigabe:{kanten:true}}), Qhf=G.depthQuality(L(hoch), RAYS, hoch, H, {freigabe:{waende:true, kanten:true}});
  const Qhk=G.depthQuality(L(hoch), RAYS, hoch, H, {typ:'raw', freigabe:{kanten:true}});
  const Lg=L(hoch, {deckeFaktor:1.3}), Qg=G.depthQuality(Lg, RAYS, hoch, H, {typ:'raw'}), Qn=G.depthQuality(L(runter), RAYS, runter, null, {typ:'raw'});
  const Qst=G.depthQuality(L(runter), RAYS, runter, H, {typ:'raw', flags:{stale:true, flat:false, empty:false}});
  chk('Pforte am Boden (Blick nach unten): floorOk >= 99 %, pass.floorFree', Qr.floorN>=200 && Qr.floorOk>=0.99*Qr.floorN && Qr.pass.floorFree, `${Qr.floorOk}/${Qr.floorN}`);
  chk('Pforte an der Decke (Blick nach oben): ceilBeyond 0, ceilOk >= 99 %', Qh.ceilN>=200 && Qh.ceilBeyond===0 && Qh.ceilOk>=0.99*Qh.ceilN, `${Qh.ceilOk}/${Qh.ceilN}`);
  chk('pass.walls nur mit typ raw oder freigabe.waende; edges nur mit raw UND freigabe.kanten (T-M1, 8.6); typ wird berichtet',
    !Qh.pass.walls && !Qhs.pass.walls && Qhr.pass.walls && !Qhr.pass.edges && Qhk.pass.walls && Qhk.pass.edges && Qhf.pass.walls && !Qhf.pass.edges && !Qhs.pass.edges &&
    Qhr.typ==='raw' && Qh.typ===null);
  // DepthFrame als o.frame (Schnittstelle zum Aufrufer M10/T1): typ und flags daraus, o.typ/o.flags gehen vor
  const Lh=L(hoch), Lu=L(runter), fr=(type,flags)=>({vi:1, t:1, w:DW, h:DH, scale:SC, raw:null, M:MD, camTo:hoch, ab:0, type, flags});
  const Qf1=G.depthQuality(Lh, RAYS, hoch, H, {frame:fr('raw', {stale:false, flat:false, empty:false}), freigabe:{kanten:true}});
  const Qf2=G.depthQuality(Lh, RAYS, hoch, H, {frame:fr('unbekannt', null)}), Qf3=G.depthQuality(Lh, RAYS, hoch, H, {frame:fr('raw', null), typ:'smooth'});
  const Qf4=G.depthQuality(Lu, RAYS, runter, H, {frame:fr('raw', {stale:true, flat:false, empty:false})});
  chk('depthQuality o.frame: typ = frame.type (raw), sonst null (auch "unbekannt" aus T1), o.typ geht vor, frame.flags sperren',
    Qf1.typ==='raw' && Qf1.pass.walls && Qf1.pass.edges && Qf2.typ===null && !Qf2.pass.walls && Qf3.typ==='smooth' && !Qf3.pass.walls && !Qf4.pass.floorFree,
    [Qf1.typ, Qf2.typ, Qf3.typ].join('/'));
  const leerL=G.depthLift(new Uint16Array(DW*DH), SC, RAYS, runter), fastL={...Lu, nNull:Lu.nPix-Math.floor(0.005*Lu.nPix)};
  const Qe1=G.depthQuality(leerL, RAYS, runter, H, {typ:'raw'}), Qe2=G.depthQuality(fastL, RAYS, runter, H, {typ:'raw'});
  chk('ohne flags sperrt validFrac < 1 % aus dem Heben (empty-Ersatz), auch wenn die Bodenpunkte reichen', !Qe1.pass.floorFree && !Qe2.pass.floorFree && Qe2.floorN>=200 && Qe2.validFrac<0.01,
    `validFrac ${f3(Qe2.validFrac)}, floorN ${Qe2.floorN}`);
  chk('geglaettete Decke (x1,3 wie tiefe.md 2.3): ceilBeyond ~ 100 %, walls false trotz raw', Qg.ceilBeyond>=0.99*Qg.ceilN && !Qg.pass.walls, pc(Qg.ceilBeyond, Qg.ceilN));
  chk('ohne H: kein Deckenteil, walls false, Bodenteil gleich', Qn.ceilN===0 && !Qn.pass.walls && Qn.floorN===Qr.floorN && Qn.pass.floorFree);
  chk('flags stale/flat/empty sperren alle Freigaben', !Qst.pass.floorFree && !Qst.pass.walls && !Qst.pass.edges);
  const Lr=L(runter); chk('validFrac der Pforte = Anteil Werte != 0 in der Ansicht', Math.abs(Qr.validFrac-(Lr.nPix-Lr.nNull)/Lr.nPix)<1e-12 && Qr.validFrac>0.99, f3(Qr.validFrac));
}

// ------------------------------------------------- B. Boden-Freiraum
const BILDER=bilderAufWeg([-35, -50, -20], 0.3);
function freiraum(bilder, grid, o={}, sz=SZENE, abVon=()=>0){
  let nBild=0; const ms=[];
  for(const b of bilder){ const raw=rendern(b.camTo, sz);
    const [r, t]=zeitMs(()=>{ const F=G.depthFlags(raw, null, SC), L=G.depthLift(raw, SC, RAYS, b.camTo), Q=G.depthQuality(L, RAYS, b.camTo, H, {flags:F});
      return Q.pass.floorFree ? G.depthFloorFree(L, b.camTo, grid, abVon(b), o) : null; });
    ms.push(t); if(r) nBild++; }
  return {nBild, ms};
}
let ZEIT_AB=null;
{
  const grid={cell:0.05}, R1=freiraum(BILDER, grid);
  // Wiederholung warm fuer die Zeit (A + B je Tiefenbild, ohne Rendern)
  const g2={cell:0.05}, R2=freiraum(BILDER, g2); ZEIT_AB=R2.ms;
  // Zaehlregel T-M4 (10.7) wie design/bau/P-G/tm4.mjs (wahr-lib inRoom ohne Toleranz): eine frei markierte Zelle
  // ist "ausserhalb", wenn ihre Mitte nicht im Raum liegt; Mitten in Pfeiler und Wandstueck (Inseln) zaehlen aussen.
  const zaehlen=g=>{ let nF=0, nAus=0, mxAus=0, nInsel=0; const c=g.cell, I0=Math.round(g.x0/c), J0=Math.round(g.z0/c), innen=new Set();
    for(let j=0;j<g.nz;j++) for(let i=0;i<g.nx;i++){ const k=j*g.nx+i; if(!g.free[k]) continue; nF++;
      const p=[g.x0+(i+0.5)*c, g.z0+(j+0.5)*c]; if(imRaum(p)){ innen.add((I0+i)+','+(J0+j)); continue; }
      nAus++; mxAus=Math.max(mxAus, wandAbst(p)); if(RINGE.slice(1).some(r=>imPoly(p, r.pts))) nInsel++; }
    return {nF, nAus, mxAus, nInsel, innen}; };
  const Z=zaehlen(grid), {nF, nAus}=Z, c=grid.cell;
  chk('T-M4-Regel (10.7) auf der Wahrheit: frei markierte Zellen mit Mitte ausserhalb des Raums (Inseln aussen) < 1 %',
    nF>1000 && nAus<0.01*nF, `${R1.nBild}/${BILDER.length} Bilder frei, ${nF} Zellen, aussen ${nAus} (${pc(nAus, nF)}), davon in Inseln ${Z.nInsel}, max ${(100*Z.mxAus).toFixed(1)} cm vor der Wand`);
  // Gegenprobe Entwurf (vorBoden 0, Bodenpunkt zaehlt mit): verfehlt 10.7; die Kuerzung darf die Abdeckung im Raum kaum kosten
  const g0={cell:0.05}, R0=freiraum(BILDER, g0, {vorBoden:0}), Z0=zaehlen(g0);
  let nGem=0; for(const key of Z.innen) if(Z0.innen.has(key)) nGem++;
  chk('vorBoden (halbe Zelldiagonale): >= 95 % der freien Zellen im Raum von vorBoden 0 bleiben frei, keine neue Zelle',
    nGem>=0.95*Z0.innen.size && nGem===Z.innen.size && R0.nBild===R1.nBild, `${Z.innen.size}/${Z0.innen.size} = ${pc(Z.innen.size, Z0.innen.size)}`);
  notiz(`[M] synthetisch (T-M4-Regel): vorBoden ${(100*c*Math.SQRT1_2).toFixed(2)} cm ${nAus}/${nF} = ${pc(nAus, nF)} aussen; vorBoden 0 (tiefe.md 3.3 B) ${Z0.nAus}/${Z0.nF} = ${pc(Z0.nAus, Z0.nF)} aussen (max ${(100*Z0.mxAus).toFixed(1)} cm), Abdeckung im Raum ${pc(Z.innen.size, Z0.innen.size)}`);
  let gleich=grid.nx===g2.nx && grid.nz===g2.nz && grid.x0===g2.x0 && grid.z0===g2.z0;
  for(const f of ['free','occ','ab','occ2']) for(let k=0;k<grid.free.length && gleich;k++) if(grid[f][k]!==g2[f][k]) gleich=false;
  chk('Boden-Freiraum wiederholbar: zwei Laeufe bitgleich (Raster, Zaehler, Abschnitt)', gleich);
  let mxF=0; for(const v of grid.free) mxF=Math.max(mxF, v);
  chk('Stempel: eine Zelle zaehlt hoechstens einmal je Bild (free <= Zahl der Bilder)', mxF<=grid.n && grid.n===R1.nBild, `max ${mxF}, Bilder ${grid.n}`);
  // Vorgegebenes Raster nur mit den Feldern aus 3.5 gegen wachsendes Raster
  const N=240*240, fest={cell:0.05, x0:-1, z0:0.5, nx:240, nz:240, free:new Uint16Array(N), occ:new Uint16Array(N), ab:new Int16Array(N).fill(-1)};
  freiraum(BILDER, fest); let gl=true, nVgl=0;
  for(let j=0;j<grid.nz;j++) for(let i=0;i<grid.nx;i++){ const k=j*grid.nx+i, ii=Math.round((grid.x0-fest.x0)/c)+i, jj=Math.round((grid.z0-fest.z0)/c)+j;
    const v=ii>=0 && jj>=0 && ii<240 && jj<240 ? fest.free[jj*240+ii] : 0; if(v!==grid.free[k]) gl=false; if(v) nVgl++; }
  let sFest=0, sGrid=0; for(const v of fest.free) sFest+=v; for(const v of grid.free) sGrid+=v;
  chk('wachsendes Raster = vorgegebenes Raster (nur Felder aus 3.5, Zusatzfelder ergaenzt) an jeder Zelle', gl && sFest===sGrid && nVgl===nF, `${nVgl} Zellen`);
  // Abschnitt je Zelle
  const ga={cell:0.05}; freiraum(BILDER, ga, {}, SZENE, b=>b.k<BILDER.length/2 ? 3 : 7);
  let n3=0, n7=0, nM=0, nLeer=0; for(let k=0;k<ga.free.length;k++){ if(!ga.free[k]){ if(ga.ab[k]!==-1 && !ga.occ[k]) nLeer++; continue; } if(ga.ab[k]===3) n3++; else if(ga.ab[k]===7) n7++; else if(ga.ab[k]===-2) nM++; else nLeer++; }
  chk('FloorGrid.ab: Abschnitt des Schreibers, -2 gemischt, -1 leer', n3>0 && n7>0 && nM>0 && nLeer===0, `ab 3: ${n3}, ab 7: ${n7}, gemischt ${nM}`);
  // ab null (Vorgabe in depthWallPlanes/ebeneAusAR) und ausserhalb Int16: grid.ab bleibt unberuehrt; erst 5, dann null
  const abZahl=(abVon)=>{ const g={cell:0.05}; freiraum(BILDER.slice(0, 40), g, {}, SZENE, abVon); const z={}; for(let k=0;k<g.free.length;k++) if(g.free[k]) z[g.ab[k]]=(z[g.ab[k]]||0)+1; return z; };
  const zN=abZahl(()=>null), zG=abZahl(()=>40000), zF=abZahl(()=>-3), z0=abZahl(()=>0), z5=abZahl(()=>5), zM=abZahl(b=>b.k<20 ? 5 : null);
  const nur=(z,v)=>Object.keys(z).length===1 && z[v]>0;
  chk('FloorGrid.ab: ab null, 40000, -3 schreiben nichts (-1), ab 0 und 5 richtig, 5 dann null bleibt 5/-1 ohne -2',
    nur(zN, -1) && nur(zG, -1) && nur(zF, -1) && nur(z0, 0) && nur(z5, 5) && zM[5]>0 && zM[-1]>0 && !zM[-2], JSON.stringify({null:zN, '5/null':zM}));
  // jede: jeder k-te Bodenpunkt
  const gj={cell:0.05}; freiraum(BILDER, gj, {jede:4}); let nJ=0; for(const v of gj.free) if(v) nJ++;
  notiz(`[M] jede 4: ${nJ} freie Zellen gegen ${nF} mit jede 1 (${pc(nJ, nF)})`);
  chk('jede 4 deckt >= 95 % der Zellen von jede 1', nJ>=0.95*nF, pc(nJ, nF));
}
{
  // Moebelhinweis: Kiste 0,8 x 0,5 x 0,75 m, aus mehreren Richtungen gesehen.
  const K=kiste([[1.2,3.2],[2.0,3.2],[2.0,3.7],[1.2,3.7]], 0, 0.75), sz={...SZENE, kisten:[K]};
  const vorab=K.poly.every(p=>imRaum(p) && wandAbst(p)>0.3);
  const bl=[]; for(const [p, al] of [[[1.6,2.4], 90], [[0.6,3.4], 0], [[2.7,4.3], 220], [[1.0,4.4], 300], [[2.6,2.6], 140]])
    for(const th of [-40, -50]) for(const da of [-10, 0, 10]) bl.push({k:bl.length, camTo:T3.kameraMatrix(p, 1.45, (al+da)*D2R, th*D2R)});
  const g={cell:0.05}; freiraum(bl, g, {}, sz);
  let nGut=0, nKiste=0, nWand=0, nSonst=0; const c=g.cell;
  for(let j=0;j<g.nz;j++) for(let i=0;i<g.nx;i++){ const k=j*g.nx+i; if(!g.occ[k]) continue; const p=[g.x0+(i+0.5)*c, g.z0+(j+0.5)*c];
    const beiKiste=imPoly(p, K.poly) || K.seiten.some(F=>segAbst(p, F.A, F.B)<=c); if(beiKiste){ nKiste++; if(g.occ[k]>=3 && g.occ2[k]) nGut++; }
    else if(wandAbst(p)<=0.1) nWand++; else nSonst++; }
  let nFreiKiste=0; for(let j=0;j<g.nz;j++) for(let i=0;i<g.nx;i++){ const k=j*g.nx+i, p=[g.x0+(i+0.5)*c, g.z0+(j+0.5)*c];
    if(g.free[k] && imPoly(p, K.poly) && K.seiten.every(F=>segAbst(p, F.A, F.B)>c)) nFreiKiste++; }
  chk('Moebelhinweis: occ an der Kiste (>= 3 Bilder, zweite Richtung >= 20°), sonst nur an Wandfuessen',
    vorab && nGut>=10 && nSonst===0, `Kiste ${nKiste} Zellen, davon gueltig ${nGut}; an Waenden ${nWand}; sonst ${nSonst}; frei unter der Kiste ${nFreiKiste}`);
  notiz(`[M] Moebelhinweis synthetisch: ${nWand} occ-Zellen an Wandfuessen (Bodenstrahl trifft die Wand unter 1,2 m); ${nFreiKiste} freie Zellen unter der Kiste: "frei" heisst "der Strahl ging durch diese Saeule" (keine raumhohe Wand), nicht "Boden frei" (tiefe.md 3.3 B)`);
}

// ------------------------------------------------- C. Wandebenen und Zuordnung
const MARKEN=WELT.waende.map(w=>({id:w.id, phi:((w.phi%(2*Math.PI))+2*Math.PI)%(2*Math.PI), rho:w.rho, cov:[(0.3*D2R)**2, 0, 0.01**2], iv:[{s0:w.iv[0], s1:w.iv[1]}]}));
{
  const bl=bilderAufWeg([0, 5, -5], 0.6, 70); let nE=0, nOk=0, mxPhi=0, mxKurz=0, mxRho=0, seite=true, form=true, nZu=0, nFalsch=0, nNull=0; const msC=[];
  const alle=[];
  for(const b of bl){ const L=G.depthLift(rendern(b.camTo), SC, RAYS, b.camTo);
    const [E, t]=zeitMs(()=>G.depthWallPlanes(L, {bild:b.k, ab:0, seed:b.k+1})); msC.push(t); alle.push([b, E]);
    for(const e of E){ nE++;
      const sd=Math.cos(e.theta)*b.camTo[12]+Math.sin(e.theta)*b.camTo[14]-e.rho; if(!(sd>0)) seite=false;
      const cv=e.cov; if(!(cv[0][0]>0 && cv[1][1]>0 && cv[0][0]*cv[1][1]-cv[0][1]**2>0 && cv[0][1]===cv[1][0])) form=false;
      if(!(e.nInl>=300 && e.extent[1]-e.extent[0]>=0.5 && e.frame===b.k && e.ab===0 && e.wallId===null && e.zMed>0 && e.rms>=0)) form=false;
      // naechste Wahrheitswand gleicher Seite (Abstand an der Mitte des gesehenen Stuecks)
      const sm=(e.extent[0]+e.extent[1])/2, n=[Math.cos(e.theta), Math.sin(e.theta)], pm=[e.rho*n[0]-sm*n[1], e.rho*n[1]+sm*n[0]];
      let best=null; for(const w of WELT.waende){ const dphi=Math.abs(wrapPi(e.theta-w.phi)); if(dphi>2*D2R) continue; const dr=Math.abs(w.n[0]*pm[0]+w.n[1]*pm[1]-w.rho);
        if(!best || dr<best.dr) best={dphi, dr, id:w.id}; }
      const lang=e.extent[1]-e.extent[0]>=1.5;
      if(best && best.dr<=0.02 && best.dphi<=(lang ? 0.5 : 2)*D2R){ nOk++; mxRho=Math.max(mxRho, best.dr); if(lang) mxPhi=Math.max(mxPhi, best.dphi); else mxKurz=Math.max(mxKurz, best.dphi); }
      const [z]=G.depthAssoc([e], MARKEN); if(z.wallId===null) nNull++; else if(best && z.wallId===best.id) nZu++; else nFalsch++; } }
  chk('depthWallPlanes: jede Ebene liegt auf einer Wahrheitswand (|drho| <= 2 cm an der Mitte; |dphi| <= 0,5° ab 1,5 m Stueck, sonst <= 2°)', nE>=30 && nOk===nE,
    `${nE} Ebenen in ${bl.length} Bildern, auf Wand ${nOk}, max ${(mxPhi*R2D).toFixed(3)}° (>= 1,5 m) / ${(mxKurz*R2D).toFixed(3)}° (kuerzer) / ${(100*mxRho).toFixed(2)} cm`);
  chk('depthWallPlanes: n zur Kamera (freie Seite), theta in [0, 2pi), cov 2x2 positiv definit, Felder aus 3.5', seite && form && alle.every(([,E])=>E.every(e=>e.theta>=0 && e.theta<2*Math.PI)));
  chk('depthAssoc auf den Ebenen gegen die Wahrheitswaende als Landmarken: 0 falsch, >= 80 % zugeordnet', nFalsch===0 && nZu>=0.8*nE, `richtig ${nZu}, mehrdeutig/keine ${nNull}, falsch ${nFalsch}`);
  notiz(`[M] RANSAC (C, nur mit pass.walls): Median ${f2(q(msC, 0.5))} ms, 90 % ${f2(q(msC, 0.9))} ms je Bild (${msC.length} Bilder, Mac)`);
  const b=bl[3], L=G.depthLift(rendern(b.camTo), SC, RAYS, b.camTo), E1=G.depthWallPlanes(L, {seed:7}), E2=G.depthWallPlanes(L, {seed:7});
  chk('depthWallPlanes wiederholbar: gleicher Samen bitgleich', JSON.stringify(E1)===JSON.stringify(E2) && E1.length>0, `${E1.length} Ebenen`);
  chk('depthWallPlanes: hoechstens maxPlanes, maxPlanes 1 gibt 1', alle.every(([,E])=>E.length<=3) && G.depthWallPlanes(L, {seed:7, maxPlanes:1}).length===1);
}
{
  const W=MARKEN.find(m=>m.id==='LM') || MARKEN[9], n=[Math.cos(W.phi), Math.sin(W.phi)], sm=(W.iv[0].s0+W.iv[0].s1)/2;
  const ob=(dphi,drho,s0,s1)=>({frame:1, ab:0, theta:W.phi+dphi, rho:W.rho+drho, cov:[[(0.5*D2R)**2, 0], [0, 0.02**2]], extent:[s0, s1], zMed:2, nInl:500, rms:0.01, wallId:null});
  const [a, b, c, d, e, f]=G.depthAssoc([ob(0.01, 0.01, sm-0.5, sm+0.5), ob(Math.PI, 0, sm-0.5, sm+0.5), ob(0, 0, W.iv[0].s1+1, W.iv[0].s1+2),
    ob(6*D2R, 0, sm-0.5, sm+0.5), ob(0, 0.2, sm-0.5, sm+0.5), ob(0, 0, sm-0.5, sm+0.5)], MARKEN);
  const [g]=G.depthAssoc([ob(0, 0, sm-0.5, sm+0.5)], [...MARKEN, {...W, id:'doppelt'}]);
  const [h]=G.depthAssoc([ob(0, 0, sm-0.5, sm+0.5)], [{id:'x', theta:W.phi, rho:W.rho, cov:[[1e-4, 0], [0, 1e-4]]}]);
  chk('depthAssoc: richtig, Gegenseite (phi+pi) nein, ohne Ueberlapp nein, > maxDeg nein, chi2 zu gross nein, mehrdeutig null, theta/2x2/ohne iv',
    a.wallId===W.id && b.wallId===null && c.wallId===null && d.wallId===null && e.wallId===null && f.wallId===W.id && g.wallId===null && h.wallId==='x' && a!==ob && a.nInl===500,
    [a, b, c, d, e, f, g, h].map(x=>x.wallId).join(','));
}

// ------------------------------------------------- D. Kantenpruefung
{
  const kam=T3.kameraMatrix([0, 0], 1.4, -90*D2R, 0), proj=(X)=>{ const inv=G.m4inv(kam), c=G.m4vec(PROJ, G.m4vec(inv, [X[0], X[1], X[2], 1])); return [c[0]/c[3], c[1]/c[3]]; };
  const seg=(p)=>[proj([p[0], 0.9, p[1]]), proj([p[0], 1.7, p[1]])];
  const ecke={waende:[{A:[-3, 1], B:[0, -2], y0:0, y1:3}, {A:[0, -2], B:[3, 1], y0:0, y1:3}], kisten:[], H:3};
  const stufe={waende:[{A:[-4, -3], B:[4, -3], y0:0, y1:3}], kisten:[kiste([[-3,-1.6],[0,-1.6],[0,-1.5],[-3,-1.5]], 0, 3)], H:3};
  const glatt={waende:[{A:[-4, -2], B:[4, -2], y0:0, y1:3}], kisten:[], H:3};
  const K1=G.depthEdgeCheck(rendern(kam, ecke), SC, MD, seg([0, -2]), {segId:1});
  const K2=G.depthEdgeCheck(rendern(kam, stufe), SC, MD, seg([0, -1.5]), {segId:2});
  const K3=G.depthEdgeCheck(rendern(kam, glatt), SC, MD, seg([0.1, -2]), {segId:3});
  const K4=G.depthEdgeCheck(new Uint16Array(DW*DH), SC, MD, seg([0, -2]), {segId:4});
  chk('depthEdgeCheck: Innenecke knick, verdeckende Kante sprung (1,5 m), Textur auf glatter Wand glatt, leer unbekannt',
    K1.kind==='knick' && K2.kind==='sprung' && K3.kind==='glatt' && K4.kind==='unbekannt' && K1.segId===1 && K4.n===0,
    `knick ${f2(K1.angleDeg)}° dz ${f3(K1.dz)}; sprung dz ${f3(K2.dz)}; glatt ${f2(K3.angleDeg)}° dz ${f3(K3.dz)}; n ${K1.n}/${K2.n}/${K3.n}`);
}

// ------------------------------------------------- G. ARCore-Ebenen
{
  const quat=(ax,ay,az)=>{ const m=[ax[0],ax[1],ax[2],0, ay[0],ay[1],ay[2],0, az[0],az[1],az[2],0, 0,0,0,1], r00=m[0], r11=m[5], r22=m[10], tr=r00+r11+r22;
    let x, y, z, w; if(tr>0){ const s=Math.sqrt(tr+1)*2; w=0.25*s; x=(m[6]-m[9])/s; y=(m[8]-m[2])/s; z=(m[1]-m[4])/s; }
    else if(r00>r11 && r00>r22){ const s=Math.sqrt(1+r00-r11-r22)*2; w=(m[6]-m[9])/s; x=0.25*s; y=(m[4]+m[1])/s; z=(m[8]+m[2])/s; }
    else if(r11>r22){ const s=Math.sqrt(1+r11-r00-r22)*2; w=(m[8]-m[2])/s; x=(m[4]+m[1])/s; y=0.25*s; z=(m[9]+m[6])/s; }
    else { const s=Math.sqrt(1+r22-r00-r11)*2; w=(m[1]-m[4])/s; x=(m[8]+m[2])/s; y=(m[9]+m[6])/s; z=0.25*s; } return [x, y, z, w]; };
  const kreuz=(a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  // Ebene auf Wand w: Mitte bei s = sm, Hoehe 1,2 m; Normale n (vorz = +1 zur freien Seite), Polygon 1,2 x 1,0 m in x/z.
  const ebene=(w,vorz,kipp=0,breite=1.2)=>{ const sm=(w.iv[0]+w.iv[1])/2, c=[w.rho*w.n[0]+sm*w.u[0], 1.2, w.rho*w.n[1]+sm*w.u[1]];
    const ay0=[vorz*w.n[0], 0, vorz*w.n[1]], ax=[w.u[0], 0, w.u[1]], ay=[ay0[0]*Math.cos(kipp), Math.sin(kipp), ay0[2]*Math.cos(kipp)], az=kreuz(ax, ay);
    return {t:12.5, id:4, orient:'vertical', pose:[...c, ...quat(ax, ay, az)], poly:Float32Array.from([-breite/2,-0.5, breite/2,-0.5, breite/2,0.5, -breite/2,0.5]), changed:12.4, sm}; };
  let mx=0, mxE=0, nT=0; const Tm=(Tpsi,Tx,Ty,Tz)=>{ const c=Math.cos(Tpsi), s=Math.sin(Tpsi); return [c,0,-s,0, 0,1,0,0, s,0,c,0, Tx,Ty,Tz,1]; };
  const T=Tm(10*D2R, 0.3, -1.25, -0.2), Ti=G.m4inv(T);
  for(const w of WELT.waende.filter(w=>w.L>=0.5)){ for(const vorz of [1, -1]){ const pr=ebene(w, vorz), kam=[w.rho*w.n[0]+pr.sm*w.u[0]+1.0*w.n[0], 1.4, w.rho*w.n[1]+pr.sm*w.u[1]+1.0*w.n[1]];
    const E=G.ebeneAusAR(pr, null, {kamera:kam, ab:5}), phiW=((w.phi%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
    // dieselbe Ebene in ARCore-local (Pose_local = T·Pose_B), bezug = T^-1
    const Pm=G.m4mul(T, [...(()=>{ const [x,y,z,ww]=pr.pose.slice(3); return [1-2*(y*y+z*z),2*(x*y+z*ww),2*(x*z-y*ww),0, 2*(x*y-z*ww),1-2*(x*x+z*z),2*(y*z+x*ww),0, 2*(x*z+y*ww),2*(y*z-x*ww),1-2*(x*x+y*y),0]; })(), ...pr.pose.slice(0, 3), 1]);
    const prL={...pr, pose:[Pm[12], Pm[13], Pm[14], ...quat(Pm.slice(0,3), Pm.slice(4,7), Pm.slice(8,11))]}, EL=G.ebeneAusAR(prL, Ti, {kamera:kam, ab:5});
    if(!E || !EL){ mx=Infinity; continue; } nT++;
    mx=Math.max(mx, Math.abs(wrapPi(E.phi-phiW)), Math.abs(E.rho-w.rho), Math.abs(wrapPi(EL.phi-E.phi)), Math.abs(EL.rho-E.rho), Math.abs(EL.extent[0]-E.extent[0]));
    mxE=Math.max(mxE, Math.abs(E.extent[0]-(pr.sm-0.6)), Math.abs(E.extent[1]-(pr.sm+0.6))); } }
  chk('ebeneAusAR: senkrechte Ebene auf jeder Wahrheitswand gibt deren phi/rho (n zur Kamera, beide Normalenrichtungen), auch aus local mit bezug = T^-1 (T = +10°)',
    nT===2*WELT.waende.filter(w=>w.L>=0.5).length && mx<=1e-9 && mxE<=1e-6, `${nT} Ebenen, max ${e1(mx)}, extent ${e1(mxE)} m`);
  const w=WELT.waende.find(x=>x.id==='LM') || WELT.waende[9], pr=ebene(w, 1), E=G.ebeneAusAR(pr, null, {ab:2});
  const sm=pr.sm, cv=E.cov, okCov=Math.abs(cv[0]-(2*D2R)**2)<1e-15 && Math.abs(cv[1]-sm*cv[0])<1e-12 && Math.abs(cv[2]-(sm*sm*cv[0]+0.05**2))<1e-12;
  chk('ebeneAusAR: Felder aus 3.5 (t, id, ab, quelle ar, wallId null), cov [sφφ, sφρ, sρρ] um den Ursprung (Platzhalter 2° / 5 cm), ohne Kamera Normale',
    E.t===12.5 && E.id===4 && E.ab===2 && E.quelle==='ar' && E.wallId===null && okCov && Math.abs(wrapPi(E.phi-w.phi))<1e-9);
  const nein=[G.ebeneAusAR({...pr, orient:'horizontal'}, null), G.ebeneAusAR({...pr, orient:null}, null), G.ebeneAusAR(ebene(w, 1, 10*D2R), null),
    G.ebeneAusAR(ebene(w, 1, 0, 0.2), null), G.ebeneAusAR({...pr, poly:new Float32Array(2)}, null)];
  const ja=G.ebeneAusAR(ebene(w, 1, 4*D2R), null);
  chk('ebeneAusAR: waagerecht/pausiert/10° gekippt/zu klein (0,2 m)/ohne Polygon -> null; 4° gekippt -> angenommen', nein.every(x=>x===null) && ja!==null);
  // Zeile aus ebenen.jsonl der App (Stand 6): {t, id, o: 'v', pose, poly: [[x, z]], lct}
  const app={t:pr.t, id:pr.id, o:'v', pose:pr.pose, poly:[[-0.6,-0.5], [0.6,-0.5], [0.6,0.5], [-0.6,0.5]], lct:12345}, Ea=G.ebeneAusAR(app, null, {ab:2});
  chk('ebeneAusAR nimmt die Zeile der App (o v/h, poly [[x, z]]) wie PlaneRec', Ea && Math.abs(Ea.phi-E.phi)<1e-12 && Math.abs(Ea.rho-E.rho)<1e-12 &&
    Math.abs(Ea.extent[0]-E.extent[0])<1e-6 && G.ebeneAusAR({...app, o:'h'}, null)===null && G.ebeneAusAR({...app, o:null}, null)===null);
}

// ------------------------------------------------- Verbund mit M10 (G.karteTiefe, raumskizze-kartenlauf.js, Paket P-H)
// Prueft die Schnittstelle von M9 aus Sicht des Aufrufers: typ/flags des DepthFrame kommen in depthQuality an, B nur bei
// pass.floorFree, C nur bei pass.walls. Fremder Code: Ergebnis "offen", nicht im Gesamtergebnis dieses Tests.
if(existsSync(new URL('../raumskizze-kartenlauf.js', import.meta.url))){
  const GV=Object.create(G), auf={q:[], b:0, c:0};
  GV.depthQuality=(L,r,c,h,o={})=>{ const Q=G.depthQuality(L, r, c, h, o); auf.q.push({typ:o.typ ?? (o.frame ? o.frame.type : undefined), flags:o.flags || (o.frame && o.frame.flags) || null, Q}); return Q; };
  GV.depthFloorFree=(...a)=>{ auf.b++; return G.depthFloorFree(...a); };
  GV.depthWallPlanes=(...a)=>{ auf.c++; return G.depthWallPlanes(...a); };
  let fehler=null;
  try{
    new Function('G', '"use strict";\n'+read('raumskizze-kartenlauf.js'))(GV);
    const KZ=GV.karteNeu({proj:PROJ, H:{laser:H, sigma:0.002}, uhr:()=>0}); KZ.abschnitte.push({ab:0, t0:0, t1:Infinity});
    if(!KZ.tiefe.boden) KZ.tiefe.boden={cell:0.05};   // M10 legt das Raster heute nicht an (boden: null) -> fuer den Test vorgeben
    const hoch=T3.kameraMatrix([4.5, 3.3], 1.45, 0, 40*D2R), raw=rendern(hoch);
    // Bild 1: Blick zur Decke, smooth, stale -> weder B noch C
    GV.karteTiefe(KZ, {vi:1, t:1, w:DW, h:DH, scale:SC, raw, M:MD, camTo:hoch, ab:0, type:'smooth', flags:{stale:true, flat:false, empty:false}});
    const q1=auf.q[0] || {};
    offen('karteTiefe reicht DepthFrame.type an depthQuality weiter (raw/smooth getrennt)', q1.typ==='smooth', `typ ${String(q1.typ)}`);
    offen('karteTiefe reicht DepthFrame.flags (bzw. G.depthFlags) an depthQuality weiter', !!q1.flags, q1.flags ? 'flags da' : 'keine flags');
    offen('karteTiefe ruft depthFloorFree nur bei pass.floorFree (Bild stale)', auf.b===0, `${auf.b} Aufrufe`);
    offen('karteTiefe ruft depthWallPlanes nur bei pass.walls (smooth, stale)', auf.c===0, `${auf.c} Aufrufe`);
  }catch(x){ fehler=x.message; }
  if(fehler) offen('karteTiefe laeuft im Verbundtest', false, fehler);
} else ueber('Verbund mit M10: raumskizze-kartenlauf.js fehlt');

// ------------------------------------------------- Mac-Zeit A + B
{
  const m=q(ZEIT_AB, 0.5), p9=q(ZEIT_AB, 0.9);
  chk('Mac: A + B (Merkmale, Heben, Pforte, Boden-Freiraum) je Tiefenbild Median <= 2,5 ms (synthetisch, warm)', m<=2.5, `Median ${f2(m)} ms, 90 % ${f2(p9)} ms, ${ZEIT_AB.length} Bilder`);
  const [, tR]=zeitMs(()=>{ for(let i=0;i<20;i++) G.depthRays(MD, PROJ, DW, DH); });
  notiz(`[M] depthRays einmal je (M, proj): ${f2(tR/20)} ms`);
}

console.log(out.join('\n'));
if(mess.length) console.log('\n'+mess.join('\n'));
const zusatz=[nUeber ? nUeber+' übersprungen' : '', nOffen ? nOffen+' offen im Verbund (fremdes Modul, nicht im Ergebnis)' : ''].filter(Boolean).join(', ');
console.log('\n'+(ok ? 'ALLE CHECKS GRÜN' : 'ES GIBT ROTE CHECKS')+` (${nChk} Checks${zusatz ? ', '+zusatz : ''})`);
process.exit(ok ? 0 : 1);
