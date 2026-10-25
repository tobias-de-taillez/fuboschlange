// Prueft T3 raumskizze-sim.mjs (ARCHITEKTUR v3, 17.11): Wiederholbarkeit, Beilage wahr gegen die Geometrie
// (woertlich <= 1 px, unabhaengig nachgerechnet ueber camTo, wahr.g und wahr.pp), Hebung, Epochen, Abschnitte
// (Spruenge, T-Wechsel, Luecken, lokal), Drift (gBei, Staerke), verschmierte Korrektur, Hauptpunkt, die Sonderfaelle
// und die Selbstkonsistenz mit T2 (Orakel-Rahmen nachgebildet, T1 fehlt noch). Laedt vendor + geo von
// raumskizze-probe.html wie raumskizze-protokoll.mjs und fuegt M0 als eigenen Block ein, wenn die Seite es nicht traegt.
//
//   node test/karte-sim.mjs            (RAUMSKIZZE_HTML=pfad: anderer Stand der Seite; F4=ordner: Fixtures fuer den Vergleich)
import {readFileSync, existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import * as T3 from '../raumskizze-sim.mjs';
import * as T2 from '../raumskizze-metrik.mjs';

const read=f=>readFileSync(new URL('../'+f, import.meta.url), 'utf8');
const html=process.env.RAUMSKIZZE_HTML ? readFileSync(process.env.RAUMSKIZZE_HTML, 'utf8') : read('raumskizze-probe.html');
const pick=id=>{ const m=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`)); if(!m) throw new Error(`Script-Block "${id}" nicht gefunden`); return m[1]; };
const mark='globalThis.RAUMSKIZZE=G;'; let geo=pick('geo');
if(!/G\.gBei=/.test(geo)){ const at=geo.lastIndexOf(mark); geo=geo.slice(0, at)+'{\n'+read('raumskizze-karte-grund.js')+'\n}\n'+geo.slice(at); }
new Function('"use strict";\n'+pick('vendor')+'\n'+geo)();
const G=globalThis.RAUMSKIZZE;

const out=[]; let ok=true;
const chk=(name,cond,info='')=>{ ok=ok&&!!cond; out.push((cond?'ok   ':'ROT  ')+name+(info!==''?'  ('+info+')':'')); };
const mess=[]; const notiz=s=>mess.push(s);
const D2R=Math.PI/180, R2D=180/Math.PI, H=T3.H_LASER, PROJ=T3.PROJ_A6, W=287, HH=640;
const wrap=a=>Math.atan2(Math.sin(a), Math.cos(a));
const e1=x=>Number.isFinite(x) ? x.toExponential(1) : String(x), f2=x=>Number.isFinite(x) ? x.toFixed(2) : String(x), f3=x=>Number.isFinite(x) ? x.toFixed(3) : String(x);
const q=(a,p)=>{ if(!a.length) return NaN; const s=Float64Array.from(a).sort(); return s[Math.min(s.length-1, Math.floor(p*s.length))]; };
const zeit=f=>{ const t0=process.hrtime.bigint(), r=f(); return [r, Number(process.hrtime.bigint()-t0)/1e6]; };
const lauf=(o, name)=>{ const [e, ms]=zeit(()=>T3.sim(T3.WAHRHEIT, {G, ...o})); if(name) notiz(`[M] Laufzeit ${name}: ${(ms/1000).toFixed(2)} s fuer ${e.statistik.bilder} Bilder (${(ms/e.statistik.bilder).toFixed(2)} ms je Bild), ${e.statistik.segmente} Segmente`); return e; };
const EXAKT={sigPx:0, kuerzPx:0};
const m4q=(p,[x,y,z,w])=>[1-2*(y*y+z*z), 2*(x*y+z*w), 2*(x*z-y*w), 0,  2*(x*y-z*w), 1-2*(x*x+z*z), 2*(y*z+x*w), 0,
  2*(x*z+y*w), 2*(y*z-x*w), 1-2*(x*x+y*y), 0,  p[0], p[1], p[2], 1];
const maxAbs=(a,b)=>{ let m=0; for(let i=0;i<a.length;i++) m=Math.max(m, Math.abs(a[i]-b[i])); return m; };
const segAbst=(p,a,b)=>{ const vx=b[0]-a[0], vy=b[1]-a[1]; let t=((p[0]-a[0])*vx+(p[1]-a[1])*vy)/(vx*vx+vy*vy); t=Math.max(0, Math.min(1, t)); return Math.hypot(a[0]+t*vx-p[0], a[1]+t*vy-p[1]); };
const kreuzt=(a,b,c,d)=>{ const o=(p,q,r)=>Math.sign((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])); return o(a,b,c)*o(a,b,d)<0 && o(c,d,a)*o(c,d,b)<0; };
const quertPoly=(a,b,P)=>P.some((p,i)=>kreuzt(a, b, p, P[(i+1)%P.length]));

// ------------------------------------------------- unabhaengige Nachrechnung
// Wahre 3D-Gerade eines Segments aus der Beilage: Wahrheitswand (Decke/Boden) bzw. Wahrheitsecke aus welt.waende/ecken,
// sonst die Kante aus welt.kanten. Kamera in F0 = gMat(wahr.g)·camTo; Strahl durch das Pixel mit der nominalen proj,
// vorher um wahr.pp zurueckgeschoben; naechster Punkt Q der Geraden zum Strahl, Q mit pp projiziert; Abstand des Pixels
// zur Bildgeraden durch Q (Richtung aus Q und Q + Schritt laengs der Geraden).
function gerade(Wt, w, j){
  const k=w.kante[j], wd=w.wand[j], ec=w.ecke[j];
  if(wd>=0 && (k===0 || k===1)){ const Wd=Wt.waende[wd], y=k===0 ? H : 0; return [[Wd.A[0], y, Wd.A[1]], [Wd.B[0], y, Wd.B[1]]]; }
  if(ec>=0 && k===2){ const p=Wt.ecken[ec].p; return [[p[0], 0, p[1]], [p[0], H, p[1]]]; }
  const E=Wt.kanten[w.kid[j]]; return [E.A, E.B];
}
function pixAbstand(B, w, A3, B3, px){
  const Cw=G.m4mul(G.gMat(w.g), Array.from(B.camTo)), inv=G.m4inv(Cw), dx=2*w.pp[0]/W, dy=2*w.pp[1]/HH;
  const proj=X=>{ const c=G.m4vec(B.proj, G.m4vec(inv, [X[0], X[1], X[2], 1])); return G.ndcToPix(c[0]/c[3]+dx, c[1]/c[3]+dy, W, HH, B.flipY); };
  const n=G.pixToNdc(px[0], px[1], W, HH, B.flipY), r=G.ray(B.proj, Cw, n[0]-dx, n[1]-dy);
  const u=[B3[0]-A3[0], B3[1]-A3[1], B3[2]-A3[2]], w0=[A3[0]-r.o[0], A3[1]-r.o[1], A3[2]-r.o[2]];
  const a=u[0]*u[0]+u[1]*u[1]+u[2]*u[2], b=u[0]*r.d[0]+u[1]*r.d[1]+u[2]*r.d[2], c=1, d=u[0]*w0[0]+u[1]*w0[1]+u[2]*w0[2], e=r.d[0]*w0[0]+r.d[1]*w0[1]+r.d[2]*w0[2];
  const den=a*c-b*b, s=Math.abs(den)>1e-15 ? (b*e-c*d)/den : 0, Q=[A3[0]+s*u[0], A3[1]+s*u[1], A3[2]+s*u[2]], L=Math.sqrt(a), h=0.01/L, Q2=[Q[0]+h*u[0], Q[1]+h*u[1], Q[2]+h*u[2]];
  const p1=proj(Q), p2=proj(Q2), ex=p2[0]-p1[0], ey=p2[1]-p1[1], l=Math.hypot(ex, ey);
  return Math.abs(ex*(px[1]-p1[1])-ey*(px[0]-p1[0]))/l;
}
function wahrPruefen(e, nStich, seed){
  const r=G.KG.rnd(seed), alle=[]; e.bilder.forEach((b,i)=>{ for(let j=0;j<b.bildErg.n;j++) if(b.wahr.kid[j]>=0) alle.push([i,j]); });
  const d=[], dStich=[];
  for(const [i,j] of alle){ const {bildErg:B, wahr:w}=e.bilder[i], [A3,B3]=gerade(e.welt, w, j), s=B.seg;
    d.push(Math.max(pixAbstand(B, w, A3, B3, [s[j*10], s[j*10+1]]), pixAbstand(B, w, A3, B3, [s[j*10+2], s[j*10+3]]))); }
  for(let k=0;k<nStich && alle.length;k++) dStich.push(d[Math.floor(r()*alle.length)]);
  return {n:alle.length, d, dStich};
}

// ------------------------------------------------- 1. Datei, Laden, Wiederholbarkeit
{
  const src=read('raumskizze-sim.mjs'), code=src.replace(/\/\/.*$/gm, ''), ohneKopf=code.replace(/export function kopfAus[\s\S]*?\n}\n/, '');
  chk('kein Math.random, keine Uhr im Code (Datum nur im Dateikopf kopfAus)', !/Math\.random|Date\.now|performance\.now/.test(code) && !/new Date/.test(ohneKopf));
  const vorher=globalThis.RAUMSKIZZE, G2=T3.ladeG();
  chk('ladeG: eigene Seite mit M0, globalThis.RAUMSKIZZE des Aufrufers bleibt', globalThis.RAUMSKIZZE===vorher && G2!==G && typeof G2.gBei==='function' && typeof G2.vertVanish==='function',
    JSON.stringify(T3.modulQuellen()));
  const o={kamerapfad:'rund', seed:7, spruenge:[{t:20, d:0.3, psiDeg:5}], drift:{faktor:1}, pp:[0.5,-0.3], stoer:{n:3}, zerstueckeln:{p:0.3}};
  const a=JSON.stringify(T3.alsZeilen(T3.sim(T3.WAHRHEIT, {G, ...o}))), b=JSON.stringify(T3.alsZeilen(T3.sim(T3.WAHRHEIT, {...o}))), c=JSON.stringify(T3.alsZeilen(T3.sim(T3.WAHRHEIT, {G, ...o, seed:8})));
  chk('zwei Laeufe gleicher Eingabe bytegleich (auch mit eigener Seite statt uebergebenem G), anderer Samen anders', a===b && a!==c, `${a.length} Zeichen`);
  const e=T3.sim(T3.WAHRHEIT, {G, ...o});
  chk('Ergebnis ohne Datum und ohne G (rein)', !JSON.stringify(e.opt).includes('datum') && e.opt.G===undefined && !('G' in e.opt));
  const B=e.bilder[100].bildErg, w=e.bilder[100].wahr;
  chk('BildErgebnis-Typen wie 3.1 (camTo Float64, proj/seg/dir Float32, cls/man Int8, nTeile Uint8), wahr-Typen wie 3.1',
    B.camTo instanceof Float64Array && B.proj instanceof Float32Array && B.seg instanceof Float32Array && B.seg.length===10*B.n && B.dir instanceof Float32Array && B.dir.length===6*B.n &&
    B.cls instanceof Int8Array && B.man instanceof Int8Array && B.nTeile instanceof Uint8Array && w.wand instanceof Int16Array && w.seite instanceof Int8Array && w.ring instanceof Int8Array &&
    w.wand.length===B.n && Number.isInteger(w.ab) && Number.isFinite(w.g.psi) && Math.abs(B.f-G.fokusPx(PROJ, HH))<1e-12 && B.w===287 && B.h===640);
  chk('bildErg.proj bleibt nominal (Hauptpunkt nur in den Pixeln)', maxAbs(Array.from(B.proj), Float32Array.from(PROJ))===0);
}

// ------------------------------------------------- 2. Welt
{
  const Wt=T3.welt(T3.WAHRHEIT, {G});
  const A=Wt.ringe.map(r=>{ let a=0; for(let i=0;i<r.pts.length;i++){ const p=r.pts[i], s=r.pts[(i+1)%r.pts.length]; a+=p[0]*s[1]-s[0]*p[1]; } return Math.abs(a)/2; });
  chk('Welt der Wahrheit: 3 Ringe 14/6/4, 24 Waende, Flaechen wie F3 (65,9414 / 0,3989 / 0,1474 m²)', Wt.ringe.map(r=>r.pts.length).join()==='14,6,4' && Wt.waende.length===24 &&
    Math.abs(A[0]-65.9414)<1e-4 && Math.abs(A[1]-0.3989)<1e-4 && Math.abs(A[2]-0.1474)<1e-4, A.map(x=>x.toFixed(4)).join(' / '));
  const zahl=a=>Wt.kanten.filter(k=>k.art===a).length;
  chk('Kanten: je Wand Decke + Boden, je Ecke eine Senkrechte (24 + 24 + 24), 24 Verdecker', zahl('wand')===48 && zahl('ecke')===24 && Wt.flaechen.length===24, `${Wt.kanten.length} Kanten`);
  const kk=Wt.kanten.filter(k=>k.art==='ecke'), konk=kk.filter(k=>k.konkav).map(k=>Wt.ecken[k.ecke].id).sort();
  chk('Ecken konkav/konvex aus der Geometrie (konkav: Raumecken innen; konvex: D, O, P, V, W und alle Inselecken ausser G)',
    konk.join()===['A','B','C','E','F','L','M','N','Q','G'].sort().join(), konk.join(','));
  const Wa=T3.welt(T3.WAHRHEIT, {G, faelle:['tuer', 'durchgang', 'vorhang', 'schrank', 'unterzug', 'geist']});
  const dopp=Wa.kanten.filter(E=>E.art!=='wand' && E.art!=='ecke' && Math.abs(E.A[1]-E.B[1])<1e-9 && (Math.abs(E.A[1]-H)<1e-6 || Math.abs(E.A[1])<1e-6) &&
    Wa.waende.some(w=>[E.A, E.B].every(P=>Math.abs(w.n[0]*P[0]+w.n[1]*P[2]-w.rho)<1e-3 && w.u[0]*P[0]+w.u[1]*P[2]>=w.iv[0]-1e-6 && w.u[0]*P[0]+w.u[1]*P[2]<=w.iv[1]+1e-6)));
  const k4=Wa.kanten.filter(E=>E.kante===4).map(E=>`${E.art}@${Wa.waende[E.wand].id}`);
  chk('Objektkanten auf Wahrheitswaenden: keine doppelte Decken-/Bodenkante, Sturz und Unterzug-Enden tragen die Wand (kante 4)', !dopp.length &&
    k4.includes('sturz@MN') && ['ACAD','XY','ZAA','VW'].every(id=>k4.includes('unterzug@'+id)), k4.join(' '));
}

// ------------------------------------------------- 3. wahr gegen die Geometrie (17.11: Stichprobe 100 Segmente, <= 1 px)
// Ein Lauf mit allem, was g, Drift, pp und Objekte beruehrt; exakt (ohne Rauschen) und mit sigma 1 px.
const ALLES={kamerapfad:'rund', seed:31, spruenge:[{t:12, d:0.4, richtDeg:30, psiDeg:10, dT:{psiDeg:5, x:0.3}}, {t:30, luecke:0.7}, {t:58, d:0.6, richtDeg:-40, psiDeg:-25, dy:0.05},
  {t:66, lokal:{d:0.8, richtDeg:20, psiDeg:17}}], tWechsel:[{t:22, d:0.05, richtDeg:60, psiDeg:2}], verschmiert:[{t:40, d:0.2, richtDeg:45, psiDeg:1, dauer:2}],
  drift:{modell:'zufallsweg', faktor:2}, pp:[1.3, -0.8], hoehe:{sigma:0.02}, faelle:['tuer', 'schrank', 'unterzug', 'vorhang', 'geist'], stoer:{n:2}, g0:{psi:0.3, tx:0.5, ty:0.02, tz:-0.4}};
{
  const ex=lauf({...ALLES, rausch:EXAKT}, 'alles exakt'), r=wahrPruefen(ex, 100, 4711);
  chk('wahr stimmt mit der Geometrie, woertlich: 100 Zufalls-Segmente (unverrauscht) <= 1 px, unabhaengig ueber camTo, wahr.g, wahr.pp', r.dStich.length===100 && Math.max(...r.dStich)<=1,
    `max ${e1(Math.max(...r.dStich))} px; alle ${r.n} Segmente max ${e1(Math.max(...r.d))} px`);
  chk('alle Segmente mit Beilage <= 1e-4 px (unverrauscht; seg ist Float32), 6 Abschnitte, Drift, pp, Objekte', Math.max(...r.d)<=1e-4 && ex.abschnitte.length===6, `${ex.abschnitte.length} Abschnitte, max ${e1(Math.max(...r.d))} px`);
  const st=lauf({...ALLES}, 'alles sigma 1 px'), rs=wahrPruefen(st, 100, 4712);
  // senkrechter Rest eines Endes ist N(0, 1 px): RMS ~ 1 (Kuerzen laengs aendert ihn nicht)
  const qdr=[]; st.bilder.forEach(b=>{ for(let j=0;j<b.bildErg.n;j++) if(b.wahr.kid[j]>=0){ const [A3,B3]=gerade(st.welt, b.wahr, j), s=b.bildErg.seg;
    qdr.push(pixAbstand(b.bildErg, b.wahr, A3, B3, [s[j*10], s[j*10+1]])**2, pixAbstand(b.bildErg, b.wahr, A3, B3, [s[j*10+2], s[j*10+3]])**2); } });
  const rms=Math.sqrt(qdr.reduce((a,b)=>a+b, 0)/qdr.length);
  chk('mit sigma 1 px: Querrest je Ende RMS 1 px +-5 % (Stichprobe 100: Median, 99 %)', Math.abs(rms-1)<0.05,
    `RMS ${f3(rms)} px aus ${qdr.length} Enden; Stichprobe max je Segment Median ${f2(q(rs.dStich,0.5))}, 99 % ${f2(q(rs.dStich,0.99))} px`);
  // Sichtbarkeit unabhaengig: Innenpunkte der unverrauschten Segmente (10 je Segment, 500 Segmente) auf die wahre Kante gehoben und
  // gegen welt.flaechen geschnitten (eigene Rechnung: Strahl gegen Ebene, Punkt im Vieleck; Treffer nur > 1 mm vor dem Punkt).
  { const Wt=ex.welt, rr=G.KG.rnd(77), alle=[]; ex.bilder.forEach((b,i)=>{ for(let j=0;j<b.bildErg.n;j++) if(b.wahr.kid[j]>=0) alle.push([i,j]); });
    const imVieleck=(x,z,P)=>{ let c=false; for(let i=0,k=P.length-1;i<P.length;k=i++){ const a=P[i], b=P[k]; if((a[1]>z)!==(b[1]>z) && x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]) c=!c; } return c; };
    const verdeckt=(C,Q)=>{ const d=[Q[0]-C[0], Q[1]-C[1], Q[2]-C[2]], L=Math.hypot(...d);
      for(const f of Wt.flaechen){ if(!f.h){ const n=[f.bz-f.az, 0, -(f.bx-f.ax)], den=n[0]*d[0]+n[2]*d[2]; if(Math.abs(den)<1e-12) continue;
          const s=(n[0]*(f.ax-C[0])+n[2]*(f.az-C[2]))/den; if(!(s>1e-9) || s*L>=L-1e-3) continue; const P=[C[0]+s*d[0], C[1]+s*d[1], C[2]+s*d[2]];
          const t=((P[0]-f.ax)*(f.bx-f.ax)+(P[2]-f.az)*(f.bz-f.az))/((f.bx-f.ax)**2+(f.bz-f.az)**2); if(t<0 || t>1 || P[1]<f.y0 || P[1]>f.y1) continue; return true; }
        else { if(Math.abs(d[1])<1e-12) continue; const s=(f.y-C[1])/d[1]; if(!(s>1e-9) || s*L>=L-1e-3) continue; if(imVieleck(C[0]+s*d[0], C[2]+s*d[2], f.pts)) return true; } }
      return false; };
    let n=0, zu=0; const wo={};
    for(let k=0;k<500;k++){ const [i,j]=alle[Math.floor(rr()*alle.length)], {bildErg:B, wahr:w}=ex.bilder[i], [A3,B3]=gerade(Wt, w, j), sg=B.seg;
      const Cw=G.m4mul(G.gMat(w.g), Array.from(B.camTo)), C=[Cw[12], Cw[13], Cw[14]], dx=2*w.pp[0]/W, dy=2*w.pp[1]/HH;
      for(let q=0;q<10;q++){ const f=0.05+0.1*q, px=[sg[j*10]+f*(sg[j*10+2]-sg[j*10]), sg[j*10+1]+f*(sg[j*10+3]-sg[j*10+1])], nd=G.pixToNdc(px[0], px[1], W, HH, B.flipY), r=G.ray(B.proj, Cw, nd[0]-dx, nd[1]-dy);
        const u=[B3[0]-A3[0], B3[1]-A3[1], B3[2]-A3[2]], w0=[A3[0]-r.o[0], A3[1]-r.o[1], A3[2]-r.o[2]], a=u[0]*u[0]+u[1]*u[1]+u[2]*u[2], bb=u[0]*r.d[0]+u[1]*r.d[1]+u[2]*r.d[2];
        const dd=u[0]*w0[0]+u[1]*w0[1]+u[2]*w0[2], ee=r.d[0]*w0[0]+r.d[1]*w0[1]+r.d[2]*w0[2], s=(bb*ee-dd)/(a-bb*bb), Q=[A3[0]+s*u[0], A3[1]+s*u[1], A3[2]+s*u[2]];
        n++; if(verdeckt(C, Q)){ zu++; const art=Wt.kanten[w.kid[j]].art; wo[art]=(wo[art]||0)+1; } } }
    // Gegenprobe der eigenen Rechnung: Mitte einer Inselwand auf Deckenhoehe, deren freie Seite von der Kamera weg zeigt, ist verdeckt
    let gp=0, gv=0; for(let k=0;k<200;k++){ const b=ex.bilder[Math.floor(rr()*ex.bilder.length)], Cw=G.m4mul(G.gMat(b.wahr.g), Array.from(b.bildErg.camTo)), C=[Cw[12], Cw[13], Cw[14]];
      const ws=Wt.waende.filter(w=>w.insel && G.wandSeite(w, [C[0], C[2]])<-0.05); if(!ws.length) continue; const w=ws[Math.floor(rr()*ws.length)];
      gp++; if(verdeckt(C, [(w.A[0]+w.B[0])/2, H, (w.A[1]+w.B[1])/2])) gv++; }
    chk('Gegenprobe der unabhaengigen Sichtrechnung: abgewandte Inselwaende (Mitte, Deckenhoehe) sind verdeckt', gp>100 && gv===gp, `${gv} von ${gp}`);
    chk('Sichtbarkeit unabhaengig nachgerechnet: Innenpunkte von 500 Zufalls-Segmenten (alle Faelle) unverdeckt (Anteil verdeckt < 0,5 %)', zu/n<0.005,
      `${zu} von ${n} Punkten verdeckt${zu ? ' ('+Object.entries(wo).map(([k,v])=>k+' '+v).join(', ')+')' : ''}`);
    notiz(`[M] Sichtbarkeit unabhaengig (500 Segmente x 10 Innenpunkte, Lauf mit Tuer, Schrank, Unterzug, Schiene, Geist): ${zu} von ${n} verdeckt`); }
  notiz(`[M] wahr verrauscht (sigma 1 px): Querrest RMS ${f3(rms)} px; Stichprobe 100 (max beider Enden) Median ${f2(q(rs.dStich,0.5))} px, 99 % ${f2(q(rs.dStich,0.99))} px, max ${f2(Math.max(...rs.dStich))} px`);
  // Hebung: Enden der Decken-/Bodensegmente ueber dir (Bezug) und wahr.g auf y = H bzw. 0 liegen auf der Wahrheitswand
  let dmax=0, smax=0, n=0;
  for(const {bildErg:B, wahr:w} of ex.bilder){ if(w.pp[0]||w.pp[1]) break; }
  const ex0=lauf({...ALLES, pp:[0,0], rausch:EXAKT});
  for(const {bildErg:B, wahr:w} of ex0.bilder) for(let j=0;j<B.n;j++){ const k=w.kante[j]; if(w.wand[j]<0 || k>1) continue; const Wd=ex0.welt.waende[w.wand[j]], y=k===0 ? H : 0;
    for(const e of [0,1]){ const d=[B.dir[j*6+3*e], B.dir[j*6+3*e+1], B.dir[j*6+3*e+2]], c=[B.camTo[12], B.camTo[13], B.camTo[14]], yb=y-w.g.ty, s=(yb-c[1])/d[1];
      const P=G.gPlan(w.g, [c[0]+s*d[0], c[2]+s*d[2]]); dmax=Math.max(dmax, Math.abs(Wd.n[0]*P[0]+Wd.n[1]*P[1]-Wd.rho)); const sp=Wd.u[0]*P[0]+Wd.u[1]*P[1];
      smax=Math.max(smax, Wd.iv[0]-sp, sp-Wd.iv[1]); n++; } }
  chk('Hebung: Decken-/Bodenenden ueber dir, camTo und wahr.g (y = H - ty bzw. -ty) liegen auf der Wahrheitswand (<= 1 mm) und in ihrer Ausdehnung', dmax<=1e-3 && smax<=1e-3,
    `${n} Enden, quer max ${e1(dmax)} m, laengs ausserhalb max ${e1(Math.max(0,smax))} m`);
  // Erfassungen: Strahlen auf y = H gehoben liegen auf der Wahrheitswand
  let em=0, ne=0; for(const x of ex0.erfassungen){ if(x.wahr.wand<0) continue; const Wd=ex0.welt.waende[x.wahr.wand], g=x.wahr.g;
    for(const r of [x.erf.ra, x.erf.rb]){ const s=(H-g.ty-r.o[1])/r.d[1], P=G.gPlan(g, [r.o[0]+s*r.d[0], r.o[2]+s*r.d[2]]); em=Math.max(em, Math.abs(Wd.n[0]*P[0]+Wd.n[1]*P[1]-Wd.rho)); ne++; } }
  chk('Erfassungen: Strahlen auf Deckenhoehe gehoben treffen die Wahrheitswand (<= 1 mm)', ne>50 && em<=1e-3, `${ne/2} Erfassungen auf Wahrheitswaenden, max ${e1(em)} m`);
  // PoseZeile: camTo = T^-1·Pose, cam, blick, Epochen
  let pm=0; for(const p of ex.posen){ const T=G.gMat(G.gAusT(p.T)), Po=m4q(p.pose.slice(0,3), p.pose.slice(3)), c=G.m4mul(G.m4inv(T), Po), B=ex.bilder[p.v].bildErg;
    pm=Math.max(pm, maxAbs(c, B.camTo), Math.abs(c[12]-p.cam[0]), Math.abs(c[14]-p.cam[2]), Math.abs(wrap(G.blickPlan(c)-p.blick))); }
  chk('PoseZeile: camTo = T^-1 · Pose (Quaternion), cam und blick passen zum BildErgebnis', pm<1e-9, e1(pm));
  const br=ex.breaks.map(b=>b.t).sort((a,b)=>a-b); let ep=0, jb=0, epOk=true; while(jb<br.length && br[jb]<=ex.posen[0].t) jb++;
  ex.posen.forEach((p,i)=>{ if(i){ const a=ex.posen[i-1]; let n=a.T.some((v,c)=>v!==p.T[c]); while(jb<br.length && br[jb]<=p.t){ if(br[jb]>a.t) n=true; jb++; } if(n) ep++; } if(p.ep!==ep) epOk=false; });
  chk('Epochen nach der F2-Regel (+1 je Zeile mit geaendertem T oder Bruch seit der vorigen Zeile)', epOk, `${ep+1} Epochen, ${ex.breaks.length} Brueche (${ex.breaks.map(b=>b.grund).join(', ')})`);
  chk('jedes Bild traegt ep und t seiner PoseZeile, wahr.ab = Abschnitt der Zeile', ex.bilder.every(b=>b.bildErg.ep===ex.posen[b.bildErg.k].ep && b.bildErg.t===ex.posen[b.bildErg.k].t));
}

// ------------------------------------------------- 4. Abschnitte: Spruenge, T-Wechsel, Luecken, lokal (3.2.1)
{
  const e=lauf({kamerapfad:'rund', seed:41, rausch:EXAKT, spruenge:[{t:15, d:0.40, richtDeg:30, psiDeg:10}, {t:25, d:0.25, psiDeg:-3, dT:{psiDeg:4, x:0.1}}, {t:35, luecke:0.7},
    {t:45, luecke:0.2}, {t:55, luecke:8}, {t:70, lokal:{d:0.98, richtDeg:10, psiDeg:-17.5}}, {t:78, d:2.0, richtDeg:-70, psiDeg:-40}], tWechsel:[{t:20, d:0.03, richtDeg:60}, {t:30, d:0.15, richtDeg:-20, psiDeg:0.5}]});
  const S=e.schnitteWahr, A=e.abschnitte, by=t=>S.find(s=>Math.abs(s.t-t)<0.11);
  const s15=by(15), s20=by(20), s25=by(25), s30=by(30), s35=by(35.7), s45=by(45.2), s55=by(63), s70=by(70);
  const zeile=t=>e.posen.findIndex(p=>p.t>=t-1e-9);
  const s78=by(78), i78=zeile(78);
  chk('Sprung 2 m / -40°: Δψ = -40,000°, Kamera im Bezug springt um 2,00 m, reloc, Ereignis pose-sprung', s78 && Math.abs(s78.dg.psi*R2D+40)<1e-9 && s78.klasse==='reloc' &&
    Math.abs(Math.hypot(e.posen[i78].cam[0]-e.posen[i78-1].cam[0], e.posen[i78].cam[2]-e.posen[i78-1].cam[2])-2.0)<0.05 && e.ereignisse.some(x=>x.type==='pose-sprung' && Math.abs(x.t-s78.t)<1e-9),
    s78 && `Δψ ${(s78.dg.psi*R2D).toFixed(6)}°, rPose ${f3(s78.rPose)} m`);
  chk('Sprung 40 cm / 10°: g_B = g_A ∘ K mit Δψ = +10,000°, Kamera im Bezug springt um 0,400 m, Klasse reloc, Ereignis pose-sprung ohne Bruch', s15 && Math.abs(s15.dg.psi*R2D-10)<1e-9 && s15.klasse==='reloc' &&
    e.ereignisse.some(x=>x.type==='pose-sprung' && Math.abs(x.t-s15.t)<1e-9) && !e.breaks.some(b=>Math.abs(b.t-s15.t)<0.11) &&
    Math.abs(Math.hypot(e.posen[zeile(15)].cam[0]-e.posen[zeile(15)-1].cam[0], e.posen[zeile(15)].cam[2]-e.posen[zeile(15)-1].cam[2])-0.40)<0.05,
    s15 && `Δψ ${(s15.dg.psi*R2D).toFixed(6)}°, rPose ${f3(s15.rPose)} m, Ereignis ${e.ereignisse.find(x=>Math.abs(x.t-s15.t)<0.06)?.type}`);
  chk('T-Wechsel 3 cm und 15 cm: Pose in local stetig (nurT: rPose <= 2 cm, rPsi <= 1°), camTo springt, kein Bruch', s20 && s30 && s20.klasse==='nurT' && s30.klasse==='nurT' &&
    !e.breaks.some(b=>Math.abs(b.t-20)<0.2 || Math.abs(b.t-30)<0.2), s20 && `rPose ${(100*s20.rPose).toFixed(2)} / ${(100*s30.rPose).toFixed(2)} cm, rPsi ${(s20.rPsi*R2D).toFixed(3)}° / ${(s30.rPsi*R2D).toFixed(3)}°`);
  chk('Sprung mit T-Aenderung: Bruch anker-sprung zwischen den Zeilen, Epoche +1, reloc', s25 && s25.klasse==='reloc' && e.breaks.some(b=>b.grund==='anker-sprung' && b.t>s25.tVor && b.t<s25.t));
  chk('Luecken 0,7 s und 8 s: pause (dt > 0,5 s), Zeilen fehlen, Ereignisse tracking-verloren/-zurueck, Bruch pausiert', s35 && s55 && s35.klasse==='pause' && s55.klasse==='pause' &&
    Math.abs(s55.dt-8)<0.11 && e.ereignisse.filter(x=>x.type==='tracking-verloren').length===3 && e.breaks.filter(b=>b.grund==='pausiert').length===3, s35 && `dt ${f2(s35.dt)} / ${f2(s55.dt)} s`);
  chk('Luecke 0,2 s: dt <= 0,5 s (keine pause), Klasse aus dem Rest', s45 && s45.dt<=0.5 && s45.klasse!=='pause', s45 && `dt ${f2(s45.dt)} s, ${s45.klasse}`);
  const zA=e.posen[zeile(70)-1], zB=e.posen[zeile(70)];
  chk('lokal (wie A6 75,11 s): Pose springt ~1 m / -17,5° (Plan), T folgt (ΔTpsi +17,5°), camTo stetig, g unveraendert', s70 && s70.klasse==='reloc' && Math.abs(s70.dg.psi)<1e-12 &&
    Math.hypot(s70.dg.tx, s70.dg.tz)<1e-12 && Math.abs(s70.dT[0]*R2D-17.5)<1e-9 && Math.hypot(zB.cam[0]-zA.cam[0], zB.cam[2]-zA.cam[2])<0.05,
    s70 && `rPose ${f3(s70.rPose)} m, rPsi ${(s70.rPsi*R2D).toFixed(2)}°, ΔTpsi ${(s70.dT[0]*R2D).toFixed(2)}°`);
  // Gehen ohne Ereignis: Rest gegen konstante Geschwindigkeit ueberall klein (Weg mit gerundeten Ecken)
  let rmax=0, ymax=0; const sch=new Set(S.map(s=>s.t));
  for(let i=2;i<e.posen.length;i++){ const a=e.posen[i-2], b=e.posen[i-1], c=e.posen[i]; if(sch.has(c.t) || sch.has(b.t) || c.ep!==a.ep) continue;
    const f=(c.t-b.t)/(b.t-a.t); rmax=Math.max(rmax, Math.hypot(...[0,1,2].map(k=>c.pose[k]-(b.pose[k]+(b.pose[k]-a.pose[k])*f)))); }
  chk('ohne Ereignis: Rest gegen konstante Geschwindigkeit <= 1 cm (Gehen erzeugt keine Schnitte)', rmax<=0.01, `max ${(100*rmax).toFixed(2)} cm`);
  notiz(`[M] Schnitte: ${S.map(s=>`${s.t}s ${s.art} ${s.klasse} (rPose ${(100*s.rPose).toFixed(1)} cm, rPsi ${(s.rPsi*R2D).toFixed(2)}°, dt ${f2(s.dt)})`).join('; ')}`);
  const eH=lauf({...T3.SITZUNGEN.hoehe, rausch:EXAKT}), ty=eH.abschnitte.map(a=>a.g.ty);
  chk('Hoehe sigma 2 cm (F4-Fall hoehe): ty je Abschnitt nach Luecken N(0, 2 cm) absolut, Abschnitt 0 bei 0', ty[0]===0 && ty.slice(1).every(v=>Math.abs(v)<0.08) && ty.slice(1).some(v=>Math.abs(v)>1e-4),
    ty.map(v=>(100*v).toFixed(2)).join(' / ')+' cm');
}

// ------------------------------------------------- 5. Drift (3.2.3), verschmierte Korrektur, Hauptpunkt
{
  // gBei mit den ausgegebenen Knoten gibt g_wahr je Bild
  const e=lauf({kamerapfad:'rund', seed:51, wiederholen:2, drift:{modell:'zufallsweg', faktor:2}, spruenge:[{t:90, d:0.3, psiDeg:4}], rausch:EXAKT}, 'Drift 2x, 2 Runden');
  let gm=0; for(const {bildErg:B, wahr:w} of e.bilder){ const A=e.abschnitte[w.ab], g=G.gBei(A, B.t); gm=Math.max(gm, Math.abs(wrap(g.psi-w.g.psi)), Math.abs(g.tx-w.g.tx), Math.abs(g.ty-w.g.ty), Math.abs(g.tz-w.g.tz)); }
  chk('Drift: G.gBei(abschnitt, t) mit den ausgegebenen Knoten = wahr.g je Bild (<= 1e-12), d(t0) = 0', gm<=1e-12 && e.abschnitte.every(a=>a.knoten[0].d.every(v=>v===0)), e1(gm));
  const wr=wahrPruefen(e, 100, 5); chk('Drift: wahr <= 1e-4 px (alle Segmente, unverrauscht)', Math.max(...wr.d)<=1e-4, e1(Math.max(...wr.d)));
  // Staerke: Zuwachs je Erzeuger-Kante an der Kamera (r_P wie resKnoten, aus Knoten und camTo nachgerechnet) / sigma des Priors
  const KN=G.KG.KNOTEN, chi=(faktor, modell, n)=>{ const z={x:[], z:[], psi:[], y:[]}, ds=[];
    for(let sd=1;sd<=n;sd++){ const r=T3.sim(T3.WAHRHEIT, {G, kamerapfad:'rund', seed:600+sd, drift:{modell, faktor}, rausch:EXAKT, erfassungen:false, senk:false, bildJede:1000});
      for(const A of r.abschnitte){ const K=A.drift; for(let j=0;j+1<K.length;j++){ const a=K[j], b=K[j+1], dS=b.s-a.s, row=r.posen.find(p=>p.t===b.t);
        const c=[row.cam[0], row.cam[2]], da={psi:a.d[0], tx:a.d[1], ty:a.d[2], tz:a.d[3]}, db={psi:b.d[0], tx:b.d[1], ty:b.d[2], tz:b.d[3]};
        const P1=G.gPlan(db, c), P0=G.gPlan(da, c), sP=Math.hypot(KN.sP0, KN.kP*dS), sY=Math.hypot(KN.sY0Deg, KN.kYDeg*dS)*D2R, sH=Math.hypot(KN.sH0, KN.kH*dS);   // Prior-Staerke 1
        if(modell==='zufallsweg'){ z.x.push(((P1[0]-P0[0])/sP)**2); z.z.push(((P1[1]-P0[1])/sP)**2); z.psi.push(((db.psi-da.psi)/sY)**2); z.y.push(((db.ty-da.ty)/sH)**2); }
        else { z.x.push((P1[0]-P0[0])/Math.max(1e-9, dS)); z.psi.push((db.psi-da.psi)/Math.max(1e-9, dS)); }
        ds.push(dS); } } }
    const m=a=>a.reduce((s,v)=>s+v, 0)/a.length; return {x:m(z.x), z:m(z.z), psi:m(z.psi), y:m(z.y), n:z.x.length, dsMed:q(ds,0.5), roh:z}; };
  const c1=chi(1, 'zufallsweg', 100);
  chk('Drift zufallsweg, Staerke 1: mittleres (r/sigma_Prior)² je Kante 1 +-15 % in x, z, psi, ty (Form des Priors, Lage an der Kamera)', ['x','z','psi','y'].every(k=>Math.abs(c1[k]-1)<0.15),
    `${c1.n} Kanten (Δs Median ${f2(c1.dsMed)} m): ${['x','z','psi','y'].map(k=>k+' '+f3(c1[k])).join(', ')}`);
  const c2=chi(2, 'zufallsweg', 100);
  chk('Drift Staerke 2 gegen Prior 1: (r/sigma_Prior)² ~ 4 (Faktor 2 in sigma, +-15 %)', ['x','z','psi','y'].every(k=>Math.abs(c2[k]/4-1)<0.15), ['x','z','psi','y'].map(k=>k+' '+f3(c2[k])).join(', ')+' (relativ zum Prior 1)');
  notiz(`[M] Drift zufallsweg: Staerke 1 ${['x','z','psi','y'].map(k=>k+' '+f3(c1[k])).join(', ')} (${c1.n} Kanten); Staerke 2 ${['x','z','psi','y'].map(k=>k+' '+f3(c2[k])).join(', ')} (${c2.n} Kanten)`);
  const eL=T3.sim(T3.WAHRHEIT, {G, kamerapfad:'rund', seed:61, drift:{modell:'linear', rate:{p:[0.01, -0.005], psiDeg:0.1, h:0.002}}, rausch:EXAKT, erfassungen:false, senk:false});
  const KL=eL.abschnitte[0].drift, kEnd=KL[KL.length-1], sEnd=kEnd.s-KL[0].s;
  // linear: Lage an der Kamera waechst wie Rate·s (Summe der Zuwaechse), Gier wie Rate·s
  const sumP=KL.slice(1).reduce((a,k)=>[a[0]+k.r.p[0], a[1]+k.r.p[1]], [0,0]);
  chk('Drift linear: Zuwachs = Rate·Δs je Zeile, am Ende Gier Rate·s (0,1 °/m)', Math.abs(kEnd.d[0]-0.1*D2R*sEnd)<1e-9 && Math.abs(sumP[0]-0.01*sEnd)<1e-9 && Math.abs(kEnd.d[2]-0.002*sEnd)<1e-9,
    `s ${f2(sEnd)} m, psi ${(kEnd.d[0]*R2D).toFixed(4)}°, Lage x ${(100*sumP[0]).toFixed(2)} cm`);
  // verschmierte Korrektur: kein Bruch, kein Ereignis, T fest, Pose-Rest klein, Kamera im Bezug am Ende um d versetzt
  const oV={kamerapfad:'rund', seed:71, rausch:EXAKT, erfassungen:false}, eV=T3.sim(T3.WAHRHEIT, {G, ...oV, verschmiert:[{t:40, d:0.20, richtDeg:0, dauer:2}]}), e0=T3.sim(T3.WAHRHEIT, {G, ...oV});
  let rv=0, cj=0; for(let i=2;i<eV.posen.length;i++){ const a=eV.posen[i-2], b=eV.posen[i-1], c=eV.posen[i], f=(c.t-b.t)/(b.t-a.t);
    rv=Math.max(rv, Math.hypot(...[0,1,2].map(k=>c.pose[k]-(b.pose[k]+(b.pose[k]-a.pose[k])*f)))); cj=Math.max(cj, Math.hypot(c.cam[0]-b.cam[0], c.cam[2]-b.cam[2])); }
  const iEnd=eV.posen.findIndex(p=>p.t>=43), dEnd=Math.hypot(eV.posen[iEnd].cam[0]-e0.posen[iEnd].cam[0], eV.posen[iEnd].cam[2]-e0.posen[iEnd].cam[2]);
  chk('verschmiert 20 cm / 2 s: kein Bruch, kein Ereignis, T fest, Pose-Rest gegen konstante Geschwindigkeit < 2 cm, Schritt je Bild < camJump 10 cm, danach 20 cm versetzt',
    !eV.breaks.length && !eV.ereignisse.length && eV.posen.every(p=>p.T.every((v,c)=>v===eV.posen[0].T[c])) && rv<0.02 && cj<0.10 && Math.abs(dEnd-0.20)<1e-9 && eV.abschnitte.length===1,
    `Rest max ${(100*rv).toFixed(2)} cm, Schritt max ${(100*cj).toFixed(1)} cm, Versatz danach ${(100*dEnd).toFixed(4)} cm`);
  const wv=wahrPruefen(eV, 0, 1); chk('verschmiert: wahr <= 1e-4 px (alle Segmente)', Math.max(...wv.d)<=1e-4, e1(Math.max(...wv.d)));
  // Hauptpunkt: gleiche Sitzung mit pp = (1,5; -0,7) px: jedes Segment um genau pp verschoben (wo nicht am Bildrand gekappt), dir aus nominaler proj
  const oP={kamerapfad:'unten', seed:81, rausch:EXAKT, erfassungen:false, stoer:null}, eP=T3.sim(T3.WAHRHEIT, {G, ...oP, pp:[1.5, -0.7]}), eN=T3.sim(T3.WAHRHEIT, {G, ...oP});
  let pmx=0, nPaar=0, dirFehler=0;
  eP.bilder.forEach((b,i)=>{ const a=eN.bilder[i]; for(let j=0;j<b.bildErg.n;j++){ const k=b.wahr.kid[j], s=b.bildErg.seg, r=a.bildErg.seg; let jj=-1, bd=Infinity;
    for(let m=0;m<a.bildErg.n;m++) if(a.wahr.kid[m]===k){ const dd=Math.hypot(s[j*10]-1.5-r[m*10], s[j*10+1]+0.7-r[m*10+1])+Math.hypot(s[j*10+2]-1.5-r[m*10+2], s[j*10+3]+0.7-r[m*10+3]); if(dd<bd){ bd=dd; jj=m; } }
    if(jj<0) continue;
    const innen=[s[j*10],s[j*10+2],r[jj*10],r[jj*10+2]].every(x=>x>2 && x<W-3) && [s[j*10+1],s[j*10+3],r[jj*10+1],r[jj*10+3]].every(y=>y>2 && y<HH-3); if(!innen) continue;
    pmx=Math.max(pmx, Math.abs(s[j*10]-r[jj*10]-1.5), Math.abs(s[j*10+1]-r[jj*10+1]+0.7), Math.abs(s[j*10+2]-r[jj*10+2]-1.5), Math.abs(s[j*10+3]-r[jj*10+3]+0.7)); nPaar++;
    const B=b.bildErg, n=G.pixToNdc(s[j*10], s[j*10+1], W, HH, false), ry=G.ray(PROJ, B.camTo, n[0], n[1]); dirFehler=Math.max(dirFehler, Math.abs(ry.d[0]-B.dir[j*6]), Math.abs(ry.d[1]-B.dir[j*6+1])); } });
  chk('Hauptpunkt pp = (1,5; -0,7) px: Pixel = nominal + pp (unverrauscht, ohne Randkappung), dir aus nominaler proj', nPaar>300 && pmx<1e-3 && dirFehler<1e-6, `${nPaar} Segmente, max ${e1(pmx)} px (Float32), dir ${e1(dirFehler)}`);
  // flipY: gleiche Strahlen, Zeilen gespiegelt
  const eF=T3.sim(T3.WAHRHEIT, {G, ...oP, flipY:true}); let fd=0, fn=0;
  eF.bilder.forEach((b,i)=>{ const a=eN.bilder[i]; if(b.bildErg.n!==a.bildErg.n) return; fn++; for(let j=0;j<6*b.bildErg.n;j++) fd=Math.max(fd, Math.abs(b.bildErg.dir[j]-a.bildErg.dir[j])); });
  chk('flipY: Strahlen dir gleich wie ohne Spiegelung (Bild gespiegelt erzeugt und gelesen)', fn===eN.bilder.length && fd<1e-5, e1(fd));
  // imuPsi: wahre Gier-Aenderung je Zeile; an einem lokal-Sprung weicht die Pose-Gier ab, die IMU nicht
  const eI=T3.sim(T3.WAHRHEIT, {G, kamerapfad:'rund', seed:91, imu:{sigmaDeg:0}, spruenge:[{t:30, lokal:{psiDeg:-10}}], rausch:EXAKT, erfassungen:false}), i30=eI.posen.findIndex(p=>p.t>=30);
  const dPose=wrap(G.blickPlan(m4q(eI.posen[i30].pose.slice(0,3), eI.posen[i30].pose.slice(3)))-G.blickPlan(m4q(eI.posen[i30-1].pose.slice(0,3), eI.posen[i30-1].pose.slice(3))));
  chk('imu: imuPsi = wahre Gier-Aenderung; am lokal-Sprung -10° weicht die Pose-Gier um -10° davon ab', eI.posen[0].imuPsi===undefined && Math.abs((dPose-eI.posen[i30].imuPsi)*R2D+10)<1e-6,
    `${((dPose-eI.posen[i30].imuPsi)*R2D).toFixed(6)}°`);
}

// ------------------------------------------------- 6. Sonderfaelle (8.1-8.4, 7.6, 7.7, R4)
const gesehenArt=(e,art)=>{ let n=0; for(const b of e.bilder) for(let j=0;j<b.bildErg.n;j++) if(b.wahr.kid[j]>=0 && e.welt.kanten[b.wahr.kid[j]].art===art) n++; return n; };
// Segment j heben (exakt): Enden auf der Hoehe ihrer wahren Kante (F0) -> Planpunkte
const hebe=(b, j, y)=>[0,1].map(e=>{ const B=b.bildErg, w=b.wahr, d=[B.dir[j*6+3*e], B.dir[j*6+3*e+1], B.dir[j*6+3*e+2]], c=[B.camTo[12], B.camTo[13], B.camTo[14]], s=(y-w.g.ty-c[1])/d[1]; return G.gPlan(w.g, [c[0]+s*d[0], c[2]+s*d[2]]); });
const segsVon=(e, f)=>{ const r=[]; e.bilder.forEach(b=>{ for(let j=0;j<b.bildErg.n;j++){ const k=b.wahr.kid[j]; if(k>=0 && f(e.welt.kanten[k], b, j)) r.push([b, j, e.welt.kanten[k]]); } }); return r; };
const sVon=(w,p)=>w.u[0]*p[0]+w.u[1]*p[1];
{
  // Tuer: Deckenkante laeuft ueber die Tuer, Bodenkante nicht; Sturz (kante 4) und Laibungen bis 2,0 m; Flur durch die Tuer
  const e=lauf({...T3.SITZUNGEN.tuer, rausch:EXAKT}, 'tuer'), Wt=e.welt, tu=Wt.objekte.find(x=>x.art==='tuer'), iMN=Wt.waende.findIndex(w=>w.id==='MN'), wMN=Wt.waende[iMN];
  const P=s=>[wMN.A[0]+s*(wMN.B[0]-wMN.A[0])/wMN.L, wMN.A[1]+s*(wMN.B[1]-wMN.A[1])/wMN.L], u0=Math.min(sVon(wMN, P(tu.s0)), sVon(wMN, P(tu.s1))), u1=Math.max(sVon(wMN, P(tu.s0)), sVon(wMN, P(tu.s1)));
  const decke=segsVon(e, E=>E.wand===iMN && E.kante===0), ueber=decke.filter(([b,j])=>{ const [a,c]=hebe(b, j, H).map(p=>sVon(wMN, p)); return Math.min(a,c)<u0+0.1 && Math.max(a,c)>u1-0.1; }).length;
  const boden=segsVon(e, E=>E.wand===iMN && E.kante===1), inTuer=boden.filter(([b,j])=>hebe(b, j, 0).some(p=>sVon(wMN, p)>u0+1e-3 && sVon(wMN, p)<u1-1e-3)).length;
  const sturz=segsVon(e, E=>E.art==='sturz'), laib=[]; e.bilder.forEach(b=>(b.bildErg.senk||[]).forEach(v=>{ if(v.extra.art==='laibung') laib.push(v.extra.top3); }));
  chk('Tuer 0,9 m / Sturz 2,0 m in M-N: Deckenkante durchgehend ueber der Tuer gesehen, Bodenkante nie in der Tuer, Sturz als kante 4 von M-N, Laibungen enden bei 2,0 m, Flur gesehen',
    ueber>0 && inTuer===0 && sturz.length>0 && sturz.every(([,,E])=>E.wand===iMN && E.kante===4) && laib.length>0 && laib.every(x=>Math.abs(x-2.0)<1e-9) && gesehenArt(e,'flur')>0,
    `Decke ueber der Tuer ${ueber}, Boden in der Tuer ${inTuer}, Sturz ${sturz.length}, Laibung senk ${laib.length}, Flur ${gesehenArt(e,'flur')} Segmente`);
  // Durchgang: Decken- und Bodenkante unterbrochen, Laibungen bis zur Decke, Nachbarraum gesehen
  const d=lauf({...T3.SITZUNGEN.durchgang, rausch:EXAKT}, 'durchgang'), Wd=d.welt, du=Wd.objekte.find(x=>x.art==='durchgang'), iDE=Wd.waende.findIndex(w=>w.id==='DE'), wDE=Wd.waende[iDE];
  const PD=s=>[wDE.A[0]+s*(wDE.B[0]-wDE.A[0])/wDE.L, wDE.A[1]+s*(wDE.B[1]-wDE.A[1])/wDE.L], g0=Math.min(sVon(wDE, PD(du.s0)), sVon(wDE, PD(du.s1))), g1=Math.max(sVon(wDE, PD(du.s0)), sVon(wDE, PD(du.s1)));
  const inLuecke=segsVon(d, E=>E.wand===iDE && E.kante<2).filter(([b,j,E])=>hebe(b, j, E.kante===0 ? H : 0).some(p=>sVon(wDE, p)>g0+1e-3 && sVon(wDE, p)<g1-1e-3)).length;
  const laibD=[]; d.bilder.forEach(b=>(b.bildErg.senk||[]).forEach(v=>{ if(v.extra.art==='laibung') laibD.push(v.extra.top3); }));
  chk('Durchgang 0,9 m in D-E: Decken- und Bodenkante nie in der Luecke, Laibungen bis zur Decke, Nachbarraum gesehen', inLuecke===0 && laibD.length>0 && laibD.every(x=>Math.abs(x-H)<1e-9) && gesehenArt(d,'nachbar')>0,
    `in der Luecke ${inLuecke}, Laibung senk ${laibD.length}, Nachbarraum ${gesehenArt(d,'nachbar')} Segmente`);
  // Vorhangschiene: Schiene gesehen, 10 cm vor A-B und 5 cm unter der Decke; Wandkante dahinter weiter gesehen
  const v=lauf({...T3.SITZUNGEN.vorhang, rausch:EXAKT}, 'vorhang'), Wv=v.welt, iAB=Wv.waende.findIndex(w=>w.id==='AB'), wAB=Wv.waende[iAB], sch=segsVon(v, E=>E.art==='schiene');
  const lagen=sch.map(([b,j,E])=>hebe(b, j, E.A[1]).map(p=>wAB.n[0]*p[0]+wAB.n[1]*p[1]-wAB.rho)).flat(), hinter=segsVon(v, E=>E.wand===iAB && E.kante===0).length;
  chk('Vorhangschiene: Kanten 8-10 cm vor A-B auf H - 5/7 cm gesehen, Deckenkante von A-B weiter gesehen', sch.length>0 && lagen.every(x=>x>0.08-1e-6 && x<0.10+1e-6) && hinter>0 &&
    sch.every(([,,E])=>Math.abs(E.A[1]-(H-0.05))<1e-9 || Math.abs(E.A[1]-(H-0.07))<1e-9 || E.kante===2), `${sch.length} Schienen-Segmente, Abstand ${f3(Math.min(...lagen))}-${f3(Math.max(...lagen))} m, A-B Decke ${hinter}`);
  // Schrank: L-M-Deckenkante hinter dem Schrank nie gesehen; Front-Decke auf 0,6 m, Sockel-Boden auf 0,55 m; Senkrechte an den Enden bis zur Decke
  const s=lauf({...T3.SITZUNGEN.schrank, rausch:EXAKT}, 'schrank'), Ws=s.welt, iLM=Ws.waende.findIndex(w=>w.id==='LM'), wLM=Ws.waende[iLM], fs=T3.FAELLE.schrank;
  const PL=x=>[wLM.A[0]+x*(wLM.B[0]-wLM.A[0])/wLM.L, wLM.A[1]+x*(wLM.B[1]-wLM.A[1])/wLM.L], c0=Math.min(sVon(wLM, PL(fs.von)), sVon(wLM, PL(fs.bis))), c1=Math.max(sVon(wLM, PL(fs.von)), sVon(wLM, PL(fs.bis)));
  const hinterS=segsVon(s, E=>E.wand===iLM && E.kante===0).filter(([b,j])=>hebe(b, j, H).some(p=>sVon(wLM, p)>c0+0.02 && sVon(wLM, p)<c1-0.02)).length;
  const abW=P=>wLM.n[0]*P[0]+wLM.n[1]*P[2]-wLM.rho, parallel=(E,d)=>Math.abs(abW(E.A)-d)<1e-6 && Math.abs(abW(E.B)-d)<1e-6;
  const front=segsVon(s, E=>E.art==='schrank' && E.kante===0 && parallel(E, fs.tiefe)).map(([b,j])=>hebe(b, j, H).map(p=>wLM.n[0]*p[0]+wLM.n[1]*p[1]-wLM.rho)).flat();
  const sockel=segsVon(s, E=>E.art==='schrank' && E.objekt==='sockel' && E.kante===1 && parallel(E, fs.tiefe-fs.zurueck)).map(([b,j])=>hebe(b, j, 0).map(p=>wLM.n[0]*p[0]+wLM.n[1]*p[1]-wLM.rho)).flat();
  const endS=[]; s.bilder.forEach(b=>(b.bildErg.senk||[]).forEach(x=>{ if(x.extra.art==='schrank') endS.push(x.extra.top3); }));
  chk('Schrank 0,6 m an L-M: L-M-Deckenkante hinter dem Schrank nie gesehen, Front-Decke bei 0,60 m, Sockel-Boden bei 0,55 m, Senkrechte bis H', hinterS===0 && front.length>0 &&
    front.every(x=>Math.abs(x-0.6)<1e-3) && sockel.length>0 && sockel.every(x=>Math.abs(x-0.55)<1e-3) && endS.some(x=>Math.abs(x-H)<1e-9),
    `hinter ${hinterS}, Front ${front.length} Enden ${f3(Math.min(...front))}-${f3(Math.max(...front))} m, Sockel ${sockel.length} Enden, senk an Schrank ${endS.length}`);
  // Unterzug: Kanten gesehen (rund und einseitig), lokal-Kanten der Inselseiten, Durchblick unter dem Unterzug
  for(const [name, oU] of [['rund', T3.SITZUNGEN.unterzug], ['einseitig (unten)', T3.SITZUNGEN.unterzugEinseitig]]){
    const u=lauf({...oU, rausch:EXAKT}, 'unterzug '+name), Wu=u.welt, uz=Wu.objekte.filter(x=>x.art==='unterzug');
    const unten=segsVon(u, E=>E.art==='unterzug' && E.kante===3).length, k4=new Set(segsVon(u, E=>E.kante===4).map(([,,E])=>Wu.waende[E.wand].id));
    // Durchblick: Segmente einer Wahrheitswand-Deckenkante, deren Sichtstrahl (Plan) unter einem Unterzug hindurch laeuft
    let durch=0; for(const [b,j] of segsVon(u, E=>E.art==='wand' && E.kante===0)){ const C=G.gPlan(b.wahr.g, [b.bildErg.camTo[12], b.bildErg.camTo[14]]), P=hebe(b, j, H);
      if(P.some(p=>uz.some(z=>quertPoly(C, p, z.poly)))) durch++; }
    chk(`Unterzug 0,30 x 0,25 m ueber beiden Durchgaengen, Weg ${name}: Unterkanten gesehen, Inselseiten mit kante 4 (lokal), Wanddeckenkanten unter dem Unterzug hindurch gesehen`,
      unten>0 && k4.size>=1 && durch>0, `Unterkanten ${unten}, kante 4 an ${[...k4].join(',')}, Durchblick ${durch} Segmente`); }
  // Pfeiler 0 / 3 / 8 cm vor A-B: Geometrie wie F3 (gleiche Drehung und Verschiebung), Abstand exakt
  const F3=process.env.F3 || '/private/tmp/claude-501/-Volumes-external-TobiCodetEndlichWieder-Zaene/86e1205e-9d6d-494b-b0b6-88f6e01be4b0/scratchpad/karte/fixtures/f3-wahrheit-ringe.json';
  const f3fix=existsSync(F3) ? JSON.parse(readFileSync(F3, 'utf8')) : null;
  for(const a of [0, 0.03, 0.08]){ const Wp=T3.welt(T3.WAHRHEIT, {G, faelle:[{pfeilerAbstand:a}]}), pf=Wp.ringe[2], wAB2=Wp.waende.find(w=>w.id==='AB'), dmin=Math.min(...pf.pts.map(p=>G.wandSeite(wAB2, p)));
    const ref=f3fix ? (f3fix.inselFaelle || []).find(x=>Math.abs(x.abstand-a)<1e-12) : null, rp=ref ? ref.szene.find(r=>r.name==='pfeiler' || r.id==='R2') : null;
    const dF3=rp ? Math.max(...rp.pts.map((p,k)=>Math.hypot(p[0]-pf.pts[k][0], p[1]-pf.pts[k][1]))) : null;
    const e=lauf({kamerapfad:'rund', seed:100+Math.round(100*a), faelle:[{pfeilerAbstand:a}], rausch:EXAKT}, `pfeiler ${Math.round(100*a)} cm`), wr=wahrPruefen(e, 0, 1);
    const gesehen=e.statistik.waendeGesehen.filter(id=>['IJ','JAC','ACAD','ADI'].includes(id));
    chk(`Pfeiler ${Math.round(100*a)} cm vor A-B: Abstand exakt, Pfeiler gleich F3 (<= 1e-12 m), Weg frei, wahr <= 1e-4 px`, Math.abs(dmin-a)<1e-12 && (dF3==null || dF3<=1e-12) && !e.warnungen.length && Math.max(...wr.d)<=1e-4,
      `Abstand ${(100*dmin).toFixed(6)} cm, F3 ${dF3==null ? 'nicht vorhanden' : e1(dF3)+' m'}, wahr max ${e1(Math.max(...wr.d))} px, Seiten gesehen ${gesehen.join(',')}${e.warnungen.length ? ', '+e.warnungen.join('; ') : ''}`); }
  // Insel 30° gedreht: Pfeilerwaende um 30° gedreht, ihre Segmente haben die gedrehte Richtung
  const gd=lauf({...T3.SITZUNGEN.gedreht, rausch:EXAKT}, 'gedreht 30°'), W0=T3.welt(T3.WAHRHEIT, {G});
  const dphi=gd.welt.waende.filter(w=>w.ring===2).map((w,k)=>wrap(w.phi-W0.waende.filter(x=>x.ring===2)[k].phi)*R2D);
  let psiMax=0, nP=0; for(const [b,j,E] of segsVon(gd, E=>E.ring===2 && E.kante===0)){ const B=b.bildErg, p=B.seg[j*10+6]; if(!Number.isFinite(p)) continue;
    const w=gd.welt.waende[E.wand], dirW=Math.atan2(w.B[1]-w.A[1], w.B[0]-w.A[0])-b.wahr.g.psi; psiMax=Math.max(psiMax, Math.abs(wrap(2*(p-dirW))/2)*R2D); nP++; }
  chk('Insel 30° gedreht: Pfeilerwaende um +30° gedreht, Deckensegmente mit psi = Wandrichtung (mod 180°, Bezug)', dphi.every(x=>Math.abs(x-30)<1e-9) && nP>0 && psiMax<0.01 && !gd.warnungen.length,
    `${nP} Segmente, psi max ${psiMax.toExponential(1)}°`);
  // Pfeilerseiten SW / SN / SWN, kappa 1 und 0,8: genau diese Seiten geben Segmente; kappa 0,8 nur das mittlere Stueck, keine Senkrechten
  for(const [seiten, kap, pfad] of [['SW', 1, 'unten'], ['SN', 1, 'rund'], ['SWN', 1, 'rund'], ['SW', 0.8, 'unten'], ['SWN', 0.8, 'rund']]){
    const e=lauf({kamerapfad:pfad, seed:120, faelle:[{pfeilerSeiten:seiten, kappa:kap}], rausch:EXAKT}), Wt=e.welt, f=Wt.faelle.pfeilerSeiten;
    const soll=Wt.waende.filter(w=>w.ring===2 && seiten.includes(f.himmel[w.id])).map(w=>w.id).sort(), ist=e.statistik.waendeGesehen.filter(id=>soll.includes(id) || ['IJ','JAC','ACAD','ADI'].includes(id)).sort();
    let raus=0; for(const [b,j,E] of segsVon(e, E=>E.ring===2 && E.kante<2)){ const w=Wt.waende[E.wand], m=w.L*(1-kap)/2; for(const p of hebe(b, j, E.kante===0 ? H : 0)){ const s=sVon(w, p);
      raus=Math.max(raus, w.iv[0]+m-s, s-(w.iv[1]-m)); } }
    const senkP=segsVon(e, E=>E.art==='ecke' && E.ring===2).length;
    chk(`Pfeilerseiten ${seiten} kappa ${kap} (Weg ${pfad}): gesehen genau ${soll.join(',')}, Stuecke im mittleren Anteil, Senkrechte am Pfeiler ${kap<1 ? 'keine' : 'nur zwischen gezeigten Seiten'}`,
      ist.join()===soll.join() && raus<=1e-6 && (kap<1 ? senkP===0 : true), `gesehen ${ist.join(',')}, ausserhalb ${e1(Math.max(0,raus))} m, Pfeiler-Senkrechte ${senkP}`); }
  // Geist: Linien ohne Koerper - Kanten gesehen, Wahrheitswaende durch das Geister-Rechteck hindurch gesehen
  const gi=lauf({...T3.SITZUNGEN.geist, rausch:EXAKT}, 'geist'), poly=gi.welt.objekte.find(x=>x.art==='geist').poly;
  let durchG=0; for(const [b,j] of segsVon(gi, E=>E.art==='wand' && E.kante===0)){ const C=G.gPlan(b.wahr.g, [b.bildErg.camTo[12], b.bildErg.camTo[14]]); if(hebe(b, j, H).some(p=>quertPoly(C, p, poly))) durchG++; }
  const gSeiten=new Set(segsVon(gi, E=>E.art==='geist' && E.kante===0).map(([b,j,E])=>E.id));
  chk('Geist (Pfeilergroesse, Seiten SWNE): Geisterkanten gesehen (wand -1), Wahrheitswaende durch das Rechteck hindurch gesehen (verdeckt nicht)', gSeiten.size===4 && durchG>0 &&
    segsVon(gi, E=>E.art==='geist').every(([b,j])=>b.wahr.wand[j]===-1), `${gesehenArt(gi,'geist')} Geister-Segmente an ${gSeiten.size} Seiten, Durchblick ${durchG}`);
  const mo=lauf({...T3.SITZUNGEN.moebel, rausch:EXAKT}, 'moebel hoch');
  chk('Moebel (hoch): Oberkanten als Stoerer (wand -1, kante 3), Weg frei', gesehenArt(mo,'moebel')>0 && segsVon(mo, E=>E.art==='moebel').every(([b,j])=>b.wahr.wand[j]===-1) && !mo.warnungen.length,
    `${gesehenArt(mo,'moebel')} Segmente`);
  // Wege: in allen Faellen frei (>= 0,25 m von allem unter 2 m, im Raum, nicht in Inseln/Objekten)
  const wegF=Object.entries(T3.SITZUNGEN).map(([n,o])=>{ const r=T3.sim(T3.WAHRHEIT, {G, ...o, bildJede:100000, erfassungen:false}); return [n, r.warnungen, r.statistik.wegAbstandMin]; });
  chk('Weg (dicht, mit Boegen) in allen Sitzungen im Raum, ausserhalb von Inseln und Objekten, >= 0,25 m frei; keine Warnung', wegF.every(([,w])=>!w.length),
    wegF.filter(([,w])=>w.length).map(([n,w])=>n+': '+w.join('; ')).join(' | ') || `${wegF.length} Sitzungen, kleinster Abstand ${f3(Math.min(...wegF.map(x=>x[2])))} m`);
  // Geist liegt nicht auf dem Weg (sonst verwirft M7 die Hypothese schon am Kameraweg)
  const wegG=gi.bilder.map(b=>G.gPlan(b.wahr.g, [b.bildErg.camTo[12], b.bildErg.camTo[14]])), dG=Math.min(...wegG.map(p=>Math.min(...poly.map((a,i)=>segAbst(p, a, poly[(i+1)%4])))));
  chk('Geist: Weg mindestens 0,5 m vom Geister-Rechteck entfernt', dG>=0.5, `${f2(dG)} m`);
  // Vorhangschiene: verdeckt die Wandkante aus 1,3-1,8 m Abstand (Strahl auf Schienenhoehe); Zahl der Bilder mit Luecke in der A-B-Deckenkante
  { const iAB2=v.welt.waende.findIndex(w=>w.id==='AB'); let n=0; for(const b of v.bilder){ const k=[...b.wahr.kid].filter((x,j)=>b.wahr.wand[j]===iAB2 && b.wahr.kante[j]===0); if(k.length>=2) n++; }
    notiz(`[M] Vorhangschiene (Weg rund): ${n} Bilder mit zwei oder mehr Stuecken der A-B-Deckenkante (Luecke durch die Schiene oder Bildrand)`); }
}

// ------------------------------------------------- 7. Selbstkonsistenz mit T2 (17.11: Orakel-Rahmen, exakte Daten -> Waende 0 cm, Ecken 0 cm)
// T1 --orakel-rahmen gibt es noch nicht. Nachgebildet: KarteStand aus den exakten Daten mit den wahren Abschnitten (g und
// Knoten = Orakel-Rahmen), Beob je Decken-/Bodensegment einer Wahrheitswand (c, da, db aus camTo und dir), Landmarken je
// (Wand, Decke/Boden) aus den gehobenen Enden ausgeglichen, Ecken als Schnitt benachbarter Landmarken, Ringe daraus.
{
  const e=lauf({kamerapfad:'rund', seed:2, rausch:EXAKT, spruenge:[{t:20, d:0.4, richtDeg:30, psiDeg:10}, {t:40, luecke:0.7}, {t:60, lokal:{d:0.5, psiDeg:8}}],
    tWechsel:[{t:30, d:0.05, richtDeg:60}], drift:{faktor:2}, hoehe:{sigma:0.02}, bildJede:3}, 'T2-Selbstkonsistenz (jedes 3. Bild, T2 rechnet lange)'), Wt=e.welt;
  const beob=[], pts=new Map();
  e.bilder.forEach(b=>{ const B=b.bildErg, w=b.wahr; for(let j=0;j<B.n;j++){ if(w.wand[j]<0 || w.kante[j]>1) continue; const id=Wt.waende[w.wand[j]].id+(w.kante[j] ? ':f' : ':c');
    beob.push({ab:w.ab, t:B.t, c:[B.camTo[12], B.camTo[13], B.camTo[14]], da:Array.from(B.dir.slice(j*6, j*6+3)), db:Array.from(B.dir.slice(j*6+3, j*6+6)), art:w.kante[j] ? 'boden' : 'decke', L:id});
    if(!pts.has(id)) pts.set(id, []); pts.get(id).push(...hebe(b, j, w.kante[j] ? 0 : H)); } });
  // Landmarke: Gerade durch die gehobenen Punkte (Hauptachse), Normale zur Kameraseite der Wahrheitswand, Intervall der Punkte
  const lm=[...pts].map(([id, P])=>{ const m=P.reduce((s,p)=>[s[0]+p[0]/P.length, s[1]+p[1]/P.length], [0,0]); let sxx=0, sxz=0, szz=0;
    for(const p of P){ const x=p[0]-m[0], z=p[1]-m[1]; sxx+=x*x; sxz+=x*z; szz+=z*z; }
    const a=0.5*Math.atan2(2*sxz, sxx-szz), u=[Math.cos(a), Math.sin(a)], wd=Wt.waende.find(w=>w.id===id.slice(0,-2)); let n=[-u[1], u[0]]; if(n[0]*wd.n[0]+n[1]*wd.n[1]<0) n=[-n[0], -n[1]];
    const phi=(Math.atan2(n[1], n[0])+2*Math.PI)%(2*Math.PI), uu=[-n[1], n[0]], rho=n[0]*m[0]+n[1]*m[1], s=P.map(p=>uu[0]*p[0]+uu[1]*p[1]);
    return {id, phi, rho, cls:'wand', h:id.endsWith(':f') ? 'f' : 'c', iv:[{s0:Math.min(...s), s1:Math.max(...s)}], wand:wd}; });
  const decke=lm.filter(l=>l.h==='c'), nach=new Map(decke.map(l=>[l.wand.id, l]));
  const ecken=[], ringe=[];
  for(const R of Wt.ringe){ const ws=Wt.waende.filter(w=>w.ring===Wt.ringe.indexOf(R)), P=[];
    for(let k=0;k<ws.length;k++){ const a=nach.get(ws[(k+ws.length-1)%ws.length].id), b=nach.get(ws[k].id); if(!a || !b) continue; const x=G.wandSchnitt(a, b); if(x){ ecken.push({id:ws[k].a, p:x}); P.push(x); } }
    if(P.length===R.pts.length) ringe.push({id:R.id, art:R.art, pts:P, exportiert:true}); }
  const stand={beob, waende:lm.map(({wand, ...l})=>l), ecken, ringe, abschnitte:e.abschnitte.map(a=>({ab:a.ab, t0:a.t0, t1:a.t1, g:a.g, knoten:a.knoten, stufe:'verbunden'})),
    hoehen:{hC:H, hF:0, sHC:0, quelle:'orakel'}};
  const m=T2.metrik(stand, Wt.wahrheit, {abschnitte:true, minAbschnitt:12});
  const zug=m.aussen && m.aussen.zugeordnet ? m.aussen.zugeordnet.map(x=>x.d) : [], inselD=m.inseln.flatMap(x=>(x.zugeordnet||[]).map(z=>z.d));
  chk('T2 auf exakten T3-Daten mit Orakel-Rahmen: Beob gehoben Median und p90 <= 1 mm, besser als none', m.beob.gehoben.alle.med<=1e-3 && m.beob.gehoben.alle.p90<=1e-3 && m.beob.besserAlsNone.karte===true,
    `${m.beob.gehoben.nBeob} Beob, Median ${e1(m.beob.gehoben.alle.med)} m, p90 ${e1(m.beob.gehoben.alle.p90)} m; none Median ${(100*m.beob.none.alle.med).toFixed(1)} cm`);
  chk('T2: Waende gefunden = gesehene Wahrheitswaende, Praezision 100 %, kein n:1, nichts ringuebergreifend (Waende 0 cm)', m.waende.gefunden===e.statistik.waendeGesehen.length && m.waende.praezision===1 &&
    m.waende.n1.length===0 && m.ringUebergreifend===0, `${m.waende.gefunden}/${m.waende.nWahr} gefunden (gesehen ${e.statistik.waendeGesehen.length}), Landmarken ${m.waende.nLandmarken}`);
  chk('T2: Ecken der Karte Median <= 1 mm; Aussenring und Inseln: alle Ecken zugeordnet, max <= 1 mm, IoU 1 (Ecken 0 cm)', m.eckenKarte && m.eckenKarte.med<=1e-3 && zug.length===14 && Math.max(...zug, ...inselD)<=1e-3 &&
    m.aussen.fehlend.length===0 && m.inseln.every(x=>x.bestanden) && m.aussen.iou>0.999, m.eckenKarte && `Ecken ${m.eckenKarte.n}, Median ${e1(m.eckenKarte.med)} m, max zugeordnet ${e1(Math.max(...zug, ...inselD))} m, IoU ${f3(m.aussen.iou)}, Inseln ${m.inseln.map(x=>x.bestanden).join('/')}`);
  // Einzelpassung je Abschnitt gegen die Wahrheit (so definiert 5.1 --orakel-rahmen): Versatz zur Gesamtpassung und Mehrdeutigkeit
  const tab=(m.abschnitte||[]).filter(z=>z.n>=12);
  chk('T2-Abschnittstabelle: jeder Abschnitt einzeln gegen die Wahrheit gepasst ist eindeutig (Verhaeltnis >= 1,2) und liegt auf der Gesamtpassung (<= 1 mm, <= 0,01°)',
    tab.length===e.abschnitte.length && tab.every(z=>z.verhaeltnis>=1.2 && z.dT<=1e-3 && Math.abs(z.dPsi)<=0.01),
    tab.map(z=>`${z.ab}: n ${z.n}, ${e1(z.dT)} m / ${e1(z.dPsi)}°, Verh. ${e1(z.verhaeltnis)}`).join(' · '));
  notiz(`[M] T2-Selbstkonsistenz (Orakel-Rahmen nachgebildet): ${m.beob.gehoben.nBeob} Beob, gehoben Median ${e1(m.beob.gehoben.alle.med)} m, p90 ${e1(m.beob.gehoben.alle.p90)} m (none ${(100*m.beob.none.alle.med).toFixed(1)} cm); `+
    `Waende ${m.waende.gefunden}/24, Praezision ${m.waende.praezision}; Ecken Median ${e1(m.eckenKarte.med)} m; Aussenring max ${e1(Math.max(...zug))} m; Passung Kosten ${e1(m.passung.kosten)}, Mehrdeutigkeit ${f2(m.passung.verhaeltnis)}`);
}

// ------------------------------------------------- 8. F4 aus T3: gleiche Faelle, gleiche gesehenen Waende und Pfeilerseiten
{
  const FIX=process.env.F4 || '/private/tmp/claude-501/-Volumes-external-TobiCodetEndlichWieder-Zaene/86e1205e-9d6d-494b-b0b6-88f6e01be4b0/scratchpad/karte/fixtures';
  if(!existsSync(FIX+'/f4-index.json')) notiz('F4 nicht vorhanden: Vergleich uebersprungen');
  else { const idx=JSON.parse(readFileSync(FIX+'/f4-index.json', 'utf8')), zeilen=[];
    for(const f of idx.faelle){ const kopf=JSON.parse(gunzipSync(readFileSync(FIX+'/'+f.datei)).toString('utf8').split('\n')[0]).kopf, st=kopf.statistik;
      const e=lauf({...T3.SITZUNGEN[f.fall]}, 'F4-Fall '+f.fall), w4=new Set(st.waendeGesehen), w3=new Set(e.statistik.waendeGesehen);
      const nur4=[...w4].filter(x=>!w3.has(x)), nur3=[...w3].filter(x=>!w4.has(x)), pf3=e.statistik.waendeGesehen.filter(x=>['IJ','JAC','ACAD','ADI'].includes(x)).sort().join(',');
      const kurz=new Set(e.welt.waende.filter(w=>w.L<0.5).map(w=>w.id));
      zeilen.push({fall:f.fall, gleich:!nur4.length && !nur3.length, nurKurz:[...nur4, ...nur3].every(x=>kurz.has(x)), pf:pf3===[...st.pfeilerSeiten].sort().join(','), txt:`${f.fall}: F4 ${w4.size} / T3 ${w3.size} Waende${nur4.length ? ', nur F4 '+nur4.join(',') : ''}${nur3.length ? ', nur T3 '+nur3.join(',') : ''}; Pfeiler F4 ${st.pfeilerSeiten.join(',')} / T3 ${pf3}; Segmente je Bild F4 ${(st.segmente/st.zeilen).toFixed(1)} / T3 ${(e.statistik.segmente/e.statistik.bilder).toFixed(1)}`}); }
    chk('F4-Faelle mit T3 nachgestellt: gleiche Pfeilerseiten in allen 8 Faellen', zeilen.every(z=>z.pf), zeilen.filter(z=>!z.pf).map(z=>z.fall).join(',') || '8 von 8');
    chk('F4-Faelle mit T3: gesehene Waende gleich bis auf Waende unter 0,5 m (haengen von Samen und Blickfolge ab)', zeilen.every(z=>z.nurKurz),
      zeilen.filter(z=>!z.gleich).map(z=>z.fall).join(',') ? 'abweichend nur kurze Waende in '+zeilen.filter(z=>!z.gleich).map(z=>z.fall).join(',') : 'alle gleich');
    for(const z of zeilen) notiz('[M] F4/T3 '+z.txt); }
}

// Reihenfolge der Waende und Ecken wie F3/F4 (wahr.wand und wahr.ecke sind Indizes in diese Listen)
{ const FIX=process.env.F4 || '/private/tmp/claude-501/-Volumes-external-TobiCodetEndlichWieder-Zaene/86e1205e-9d6d-494b-b0b6-88f6e01be4b0/scratchpad/karte/fixtures';
  if(existsSync(FIX+'/f4-rund.jsonl.gz') && existsSync(FIX+'/f3-wahrheit-ringe.json')){ const Wt=T3.welt(T3.WAHRHEIT, {G}), k4=JSON.parse(gunzipSync(readFileSync(FIX+'/f4-rund.jsonl.gz')).toString('utf8').split('\n')[0]).kopf;
    const f3=JSON.parse(readFileSync(FIX+'/f3-wahrheit-ringe.json', 'utf8')), ids=JSON.stringify(Wt.waende.map(w=>w.id));
    chk('Index-Reihenfolge: welt.waende wie F3.waende und F4 kopf.waende, welt.ecken wie F4 kopf.ecken', ids===JSON.stringify(k4.waende) && ids===JSON.stringify(f3.waende.map(w=>w.id)) &&
      JSON.stringify(Wt.ecken.map(e=>e.id))===JSON.stringify(k4.ecken), `${Wt.waende.length} Waende, ${Wt.ecken.length} Ecken`); } }

// ------------------------------------------------- 9. Datei wie F4 (JSONL gz, Kopf zuerst, Zeilen in Zeitfolge)
{
  const {mkdtempSync, rmSync}=await import('node:fs'), {tmpdir}=await import('node:os'), {join}=await import('node:path');
  const dir=mkdtempSync(join(tmpdir(), 'karte-sim-')), f=join(dir, 'sitzung.jsonl.gz'), e=T3.sim(T3.WAHRHEIT, {G, ...T3.SITZUNGEN.sprung});
  const n=T3.schreibeJSONL(e, f, {fall:'sprung'}), z=gunzipSync(readFileSync(f)).toString('utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)); rmSync(dir, {recursive:true});
  const typ=t=>z.filter(x=>x.typ===t).length, k=z[0].kopf, zeiten=z.slice(1).map(x=>x.zeile?.t ?? x.bruch?.t ?? x.ev?.t ?? x.bildErg?.t ?? x.erf?.t);
  chk('Datei wie F4: Kopf (Erzeuger, Version, Datum, Optionen, Welt, Abschnitte), dann pose/bruch/ereignis/bild/erfassung in Zeitfolge', n===z.length && k.erzeuger==='raumskizze-sim.mjs' && k.version===T3.VERSION &&
    typeof k.datum==='string' && typ('pose')===e.posen.length && typ('bild')===e.bilder.length && typ('bruch')===e.breaks.length && typ('ereignis')===e.ereignisse.length && typ('erfassung')===e.erfassungen.length &&
    zeiten.every((t,i)=>!i || t>=zeiten[i-1]) && Array.isArray(z.find(x=>x.typ==='bild').bildErg.seg), `${z.length} Zeilen`); }

// ------------------------------------------------- 10. Einteilung ueber G (M3-Platzhalter) gleich der eigenen
{
  const Gm=Object.create(G); Gm.lmSegmente=(roh, w, h, proj, camTo, flipY)=>T3.einteilen(G, roh, w, h, proj, camTo, flipY); Gm.lmGier=b=>T3.gier(G, b);
  Gm.lmRechtwinklig=(b, psi0)=>{ b.man=T3.rechtwinklig(G, b, psi0); return b; };
  const o={kamerapfad:'unten', seed:3, bildJede:5}, a=JSON.stringify(T3.alsZeilen(T3.sim(T3.WAHRHEIT, {G, ...o}))), b=JSON.stringify(T3.alsZeilen(T3.sim(T3.WAHRHEIT, {G:Gm, ...o, m3:'G'})));
  chk('m3 = G: mit G.lmSegmente/lmGier/lmRechtwinklig (hier Platzhalter = eigene Einteilung) bytegleich', a===b);
}

console.log(out.join('\n'));
console.log('\nMessungen:\n'+mess.map(s=>'  '+s).join('\n'));
console.log(ok ? '\nALLE CHECKS GRÜN' : '\nCHECKS ROT');
process.exit(ok ? 0 : 1);
