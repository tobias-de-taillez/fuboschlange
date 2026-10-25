// Prueft T2 raumskizze-metrik.mjs (ARCHITEKTUR 10.13) an der Wahrheit selbst und an synthetischen
// Faellen mit bekannter Antwort: Wahrheit gegen Wahrheit = 0, starr bewegt und gespiegelt, Gegenproben
// aus R7 (IoU), Flaeche gegen raumaufmass.html, Ungarisches Verfahren, KarteStand mit Knoten (Messregel
// 10.1) und Mehrdeutigkeit einer einzelnen Ecke. Laeuft nur mit der Wahrheitsdatei im Repo.
import {readFileSync, existsSync} from 'node:fs';
import * as T2 from '../raumskizze-metrik.mjs';

const read=f=>readFileSync(new URL('../'+f, import.meta.url),'utf8');
const pick=(src,id)=>{ const m=src.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`)); if(!m) throw new Error(`Script-Block "${id}" nicht gefunden`); return m[1]; };
const probe=read('raumskizze-probe.html'), app=read('raumaufmass.html');
new Function('"use strict";\n'+pick(probe,'vendor')+'\n'+pick(probe,'geo'))();
const G=globalThis.RAUMSKIZZE;
new Function('"use strict";\n'+pick(app,'vendor')+'\n'+pick(app,'core')+'\n'+pick(app,'tiles')+'\n'+pick(app,'store')+'\nglobalThis.__APP={wallPolygon, roomArea};')();
const APP=globalThis.__APP;

const out=[]; let ok=true;
const chk=(name,cond,info='')=>{ ok=ok&&!!cond; out.push((cond?'ok   ':'ROT  ')+name+(info!==''?'  ('+info+')':'')); };
const f4=x=>Number.isFinite(x) ? x.toFixed(4) : String(x);
if(!existsSync(T2.WAHRHEIT)){ console.log('Wahrheitsdatei fehlt – übersprungen'); process.exit(0); }
const WJ=JSON.parse(readFileSync(T2.WAHRHEIT,'utf8')), W=T2.wahrheitLaden();
const alleEcken=m=>[m.aussen, ...m.inseln].flatMap(r=>r.zugeordnet || []);
const maxD=m=>Math.max(...alleEcken(m).map(z=>z.d));
const offen=m=>[m.aussen, ...m.inseln].reduce((s,r)=>s+(r.fehlend?.length ?? 99)+(r.ueberzaehlig?.length ?? 99), 0);

// ---- 0. Raumseite (1.1): n jeder Wahrheitswand zeigt zur freien Seite, unabhaengig geprueft (5 cm daneben im Raum,
// gerade-ungerade ueber alle Ringe). Die synthetischen Faelle unten leiten sich aus denselben Normalen ab und koennten
// einen Vorzeichenfehler nicht sehen.
{ const drin=p=>{ let c=false; for(const R of W.ringe) for(let i=0,j=R.pts.length-1;i<R.pts.length;j=i++){ const a=R.pts[i], b=R.pts[j]; if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) c=!c; } return c; };
  const falsch=W.waende.filter(w=>{ const m=[(w.a[0]+w.b[0])/2, (w.a[1]+w.b[1])/2]; return !drin([m[0]+0.05*w.n[0], m[1]+0.05*w.n[1]]) || drin([m[0]-0.05*w.n[0], m[1]-0.05*w.n[1]]); });
  chk('Wahrheit: Normale jeder Wand zur freien Seite (24 von 24)', W.waende.length===24 && !falsch.length, falsch.map(w=>w.ids).join(' '));
  const Wg=T2.wahrheitLaden(T2.WAHRHEIT, {spiegel:true}), falschG=Wg.waende.filter(w=>{ const m=[(w.a[0]+w.b[0])/2+0.05*w.n[0], (w.a[1]+w.b[1])/2+0.05*w.n[1]]; let c=false;
    for(const R of Wg.ringe) for(let i=0,j=R.pts.length-1;i<R.pts.length;j=i++){ const a=R.pts[i], b=R.pts[j]; if((a[1]>m[1])!==(b[1]>m[1]) && m[0]<(b[0]-a[0])*(m[1]-a[1])/(b[1]-a[1])+a[0]) c=!c; } return !c; });
  chk('gespiegelte Wahrheit: Normalen ebenso zur freien Seite', !falschG.length); }

// ---- 1. Wahrheit gegen Wahrheit (mit Suche, nicht fest)
{ const m=T2.metrik(WJ);
  chk('Wahrheit/Wahrheit: Passungskosten 0', m.passung.kosten<1e-12, m.passung.kosten.toExponential(1));
  chk('Wahrheit/Wahrheit: alle 24 Ecken zugeordnet, 0 fehlend, 0 überzählig', alleEcken(m).length===24 && offen(m)===0);
  chk('Wahrheit/Wahrheit: Eckenfehler 0', maxD(m)<1e-6, f4(maxD(m)));
  chk('Wahrheit/Wahrheit: IoU Außenring, Inseln, netto = 1', [m.aussen.iou, ...m.inseln.map(i=>i.iou), m.flaechen.iouNetto].every(v=>Math.abs(v-1)<1e-9));
  chk('Wahrheit/Wahrheit: beide Inseln bestanden', m.inseln.length===2 && m.inseln.every(i=>i.bestanden));
  chk('Wahrheit/Wahrheit: keine falsche Insel', m.falscheInseln.length===0);
  const du=Object.fromEntries(m.durchgaenge.map(x=>[x.ia+'-'+x.ib, x]));
  chk('Durchgänge aus der Datei: Wandstück–Pfeiler 0,831 m, Wandstück–Außenring 0,967 m', Math.abs(du['1-2'].wahr-0.831)<0.0005 && Math.abs(du['0-1'].wahr-0.967)<0.0005 && m.durchgaenge.every(x=>Math.abs(x.d)<1e-9),
    m.durchgaenge.map(x=>f4(x.wahr)).join(' / '));
  chk('Strecken 6.3 gleich (7 Strecken, Abweichung 0)', m.laengen.strecken.length===7 && m.laengen.strecken.every(s=>Math.abs(s.d)<1e-9));
  chk('Flächen: brutto 65,94, Inseln 0,147 / 0,399, netto 65,395 m²', Math.abs(m.flaechen.aussen.AT-65.94)<0.005 && Math.abs(m.flaechen.netto.AT-65.395)<0.001,
    `${f4(m.flaechen.aussen.AT)} / ${m.flaechen.inseln.map(i=>f4(i.AT)).join(' / ')} / ${f4(m.flaechen.netto.AT)}`);
  const poly=APP.wallPolygon(WJ.pts, WJ.walls), A=poly ? APP.roomArea(poly)/1e6 : NaN;
  chk('Netto-Fläche gleich roomArea(wallPolygon) aus raumaufmass.html (± 1 cm²)', Math.abs(A-m.flaechen.netto.AT)<1e-4, `${f4(A)} m²`);
  chk('Spiegel: ungespiegelt, Verhältnis ≥ 1,5', m.passung.gespiegelt===false && m.passung.spiegelVerhaeltnis>=1.5 && m.passung.ungespiegelt===true);
  chk('Spiegel offen: beide Deutungen gemeldet', m.spiegel.wahrheitGespiegelt===null && m.spiegel.wennWahrheitGespiegelt.export.gespiegelt===true);
  chk('Mehrdeutigkeit der ganzen Wahrheit eindeutig (≥ 1,2)', m.passung.verhaeltnis>=1.2, m.passung.verhaeltnis.toFixed(1));
  chk('Maßstab 1', Math.abs(m.passung.skala-1)<1e-9);
  chk('beide Lagen gemeldet (ohne/mit Spiegel)', m.lagen.ohne && m.lagen.mit && m.lagen.mit.aussen.zugeordnet.length<14, `mit Spiegel: ${m.lagen.mit.aussen.zugeordnet.length} von 14 Ecken`); }

// ---- 2. Starr bewegt (37°, verschoben, auf mm gerundet wie G.toRoomData) und gespiegelt
const bewegt=(spiegel, r=37*Math.PI/180, t=[3.1,-2.2])=>{ const c=Math.cos(r), s=Math.sin(r);
  return {...WJ, pts:WJ.pts.map(p=>{ const x=(spiegel ? -1 : 1)*p.x/1000, y=p.y/1000; return {id:p.id, x:Math.round(1000*(c*x-s*y+t[0])), y:Math.round(1000*(s*x+c*y+t[1]))}; })}; };
{ const m=T2.metrik(bewegt(false));
  chk('bewegt: alle Ecken zugeordnet, Fehler ≤ 1 mm', alleEcken(m).length===24 && offen(m)===0 && maxD(m)<=0.001, f4(maxD(m)));
  chk('bewegt: ungespiegelt, IoU netto ≥ 0,999', m.passung.gespiegelt===false && m.flaechen.iouNetto>=0.999, f4(m.flaechen.iouNetto));
  const g=T2.metrik(bewegt(true));
  chk('gespiegelt bewegt: als gespiegelt erkannt, Ecken ≤ 1 mm', g.passung.gespiegelt===true && g.passung.ungespiegelt===false && maxD(g)<=0.001 && offen(g)===0, `Verhältnis ${g.passung.spiegelVerhaeltnis.toExponential(1)}`);
  const h=T2.metrik(bewegt(true), T2.WAHRHEIT, {wahrheitGespiegelt:true});
  chk('wahrheitGespiegelt = ja: derselbe Export gilt als ungespiegelt', h.passung.gespiegelt===false && h.passung.ungespiegelt===true && maxD(h)<=0.001);
  const n=T2.metrik(bewegt(true), T2.WAHRHEIT, {spiegel:'nein'});
  chk('spiegel = nein erzwingt die ungespiegelte Lage (schlecht)', n.passung.gespiegelt===false && n.aussen.zugeordnet.length<14, `${n.aussen.zugeordnet.length} Ecken`); }

// ---- 3. Gegenproben R7 (fest, ohne Passung): IoU ±0,01 und Abnahme 10.5
const P=Object.fromEntries(WJ.pts.map(p=>[p.id, [p.x/1000, p.y/1000]]));
const ausRingen=ringe=>{ const pts=[], walls=[]; let k=0; for(const R of ringe){ const ids=R.map(()=>'P'+(k++)); R.forEach((p,i)=>{ pts.push({id:ids[i], x:1000*p[0], y:1000*p[1]}); walls.push([ids[i], ids[(i+1)%ids.length]]); }); } return {pts, walls}; };
const OUT=W.ringe[0].ids.map(i=>P[i]), WS=['X','Y','H','G','Z','AA'].map(i=>P[i]), PF=['I','J','AC','AD'].map(i=>P[i]);
const fest={T:{m:false, r:0, tx:0, ty:0}};
const insel=(m,name)=>m.inseln.find(i=>i.wahr.split('-').includes(name));
{ const xs=WS.map(p=>p[0]), ys=WS.map(p=>p[1]), bb=[[Math.min(...xs),Math.min(...ys)],[Math.max(...xs),Math.min(...ys)],[Math.max(...xs),Math.max(...ys)],[Math.min(...xs),Math.max(...ys)]];
  const a=insel(T2.metrik(ausRingen([OUT, bb, PF]), WJ, fest), 'X');
  // R7 rasterte mit 5 mm ab der linken unteren Ecke (pruef-vollst/iou.mjs, ungerundet 0,5615); exakt ist A(Wandstueck)/A(Huellrechteck).
  const exakt=T2.flaeche(WS)/T2.flaeche(bb);
  chk('R7: Wandstück gegen Hüllrechteck IoU 0,5615 ± 0,01 (exakt A_L/A_bb ± 0,001), scheitert an Punkt 1', Math.abs(a.iou-0.5615)<=0.01 && Math.abs(a.iou-exakt)<=0.001 && !a.kriterien.ecken && !a.bestanden,
    `IoU ${a.iou.toFixed(4)}, exakt ${exakt.toFixed(4)}, scheitert an ${Object.entries(a.kriterien).filter(([,v])=>!v).map(([k])=>k).join(',')}`);
  const thin=[P.X, [P.X[0], P.G[1]], P.Z, P.AA], b=insel(T2.metrik(ausRingen([OUT, thin, PF]), WJ, fest), 'X');
  chk('R7: dünnes Rechteck ohne Stufe IoU 0,8402 ± 0,01, scheitert an Punkt 1', Math.abs(b.iou-0.8402)<=0.01 && !b.kriterien.ecken && !b.bestanden, `IoU ${b.iou.toFixed(3)}, scheitert an ${Object.entries(b.kriterien).filter(([,v])=>!v).map(([k])=>k).join(',')}`);
  for(const [s, soll] of [[0.05,0.7735], [0.08,0.6612], [0.10,0.5944], [0.15,0.4489]]){ const c=insel(T2.metrik(ausRingen([OUT, WS, PF.map(p=>[p[0]+s, p[1]])]), WJ, fest), 'I');
    const fail=Object.entries(c.kriterien).filter(([,v])=>!v).map(([k])=>k);
    chk(`R7: Pfeiler um ${100*s} cm verschoben IoU ${soll} ± 0,01`+(s===0.10 ? ', scheitert an Punkt 2–4' : ''), Math.abs(c.iou-soll)<=0.01 && !c.bestanden && (s!==0.10 || ['partner','iou','schwerpunkt'].every(k=>fail.includes(k))),
      `IoU ${c.iou.toFixed(3)}, scheitert an ${fail.join(',')}`); } }

// ---- 4. Ungarisches Verfahren
{ const a=T2.ungarisch([[4,1,3],[2,0,5],[3,2,2]]), s=a.reduce((x,j,i)=>x+[[4,1,3],[2,0,5],[3,2,2]][i][j], 0);
  chk('Ungarisch: Optimum 5 der Lehrbuchmatrix', s===5, a.join(','));
  const Z=T2.zuordnen([[0.01, 0.30], [0.12, 0.02], [0.40, 0.50]], 0.15);
  chk('Teilzuordnung mit Schwelle: 2 Paare, Zeile 2 offen, keine Spalte offen', Z.paare.length===2 && Z.offenA.join()==='2' && Z.offenB.length===0 && Z.paare.every(([i,j])=>i===j));
  const Y=T2.zuordnen([[0.14, 0.05], [0.06, 0.40]], 0.15);
  chk('Teilzuordnung: Summe minimal statt gierig', Y.paare.map(p=>p[0]+':'+p[1]).sort().join()==='0:1,1:0'); }

// ---- 5. KarteStand mit zwei Abschnitten, Knoten und Hoehenversatz (Messregel 10.1)
const gInv=g=>{ const c=Math.cos(-g.psi), s=Math.sin(-g.psi); return {psi:-g.psi, tx:-(c*g.tx-s*g.tz), ty:-g.ty, tz:-(s*g.tx+c*g.tz)}; };
const F0={r:0.4, t:[-1.5, 2.0]};   // Wahrheit -> F0 (die Passung muss das finden); sp = -1: F0 zusaetzlich gespiegelt (x -> -x zuerst)
const hC=2.30, AB=[{ab:0, t0:0, t1:10, g:{psi:0.08, tx:0.4, ty:0.03, tz:-0.25}, stufe:'verbunden', knoten:[{t:0, d:[0,0,0,0]}, {t:10, d:[0.02, 0.06, 0.01, -0.04]}]},
  {ab:1, t0:10, t1:20, g:{psi:-0.15, tx:-0.6, ty:-0.05, tz:0.3}, stufe:'verbunden', knoten:null}];
const nachB=(A,t,p,y)=>{ const g=gInv(T2.gBei(A,t)), q=T2.gAnw(g,p); return [q[0], y+g.ty, q[1]]; };   // F0 -> B_ab
function baueStand(sp){ const c=Math.cos(F0.r), s=Math.sin(F0.r), dreh=v=>[c*sp*v[0]-s*v[1], s*sp*v[0]+c*v[1]], zuF0=p=>{ const q=dreh(p); return [q[0]+F0.t[0], q[1]+F0.t[1]]; };
  const beob=[], landmarken=[];
  W.waende.forEach((w,k)=>{ const nF=dreh(w.n), a=zuF0(w.a), b=zuF0(w.b), u=[-nF[1], nF[0]];
    const phi=(Math.atan2(nF[1], nF[0])+2*Math.PI)%(2*Math.PI), rho=nF[0]*a[0]+nF[1]*a[1], sa=u[0]*a[0]+u[1]*a[1], sb=u[0]*b[0]+u[1]*b[1];
    landmarken.push({id:k, phi, rho, cls:'wand', h:'c', iv:[{s0:Math.min(sa,sb), s1:Math.max(sa,sb)}]});
    const m=[(a[0]+b[0])/2, (a[1]+b[1])/2], cam=[m[0]+1.2*nF[0], m[1]+1.2*nF[1]];
    for(const [f0,f1] of [[0.15,0.45], [0.55,0.85]]){ const A=AB[k%2], t=A.t0+(beob.length%24)*10/24;   // Abschnitte abwechselnd je Wand
      const p0=[a[0]+f0*(b[0]-a[0]), a[1]+f0*(b[1]-a[1])], p1=[a[0]+f1*(b[0]-a[0]), a[1]+f1*(b[1]-a[1])];
      const c=nachB(A,t,cam,1.5), q0=nachB(A,t,p0,hC), q1=nachB(A,t,p1,hC), d=q=>{ const v=[q[0]-c[0], q[1]-c[1], q[2]-c[2]], L=Math.hypot(...v); return v.map(x=>x/L); };
      beob.push({ab:A.ab, t, c, da:d(q0), db:d(q1), art:'decke', L:k}); } });
  return {ringe:W.ringe.map((r,i)=>({id:i, art:r.art, pts:r.pts.map(zuF0), exportiert:true})), waende:landmarken, beob, abschnitte:AB, hoehen:{hC, hF:0, sHC:0.01, quelle:'parallaxe'}}; }
const stand=baueStand(1), landmarken=stand.waende;
{ const m=T2.metrik(stand, T2.WAHRHEIT, {minAbschnitt:12});
  chk('KarteStand: Passung aus den Beobachtungen, ungespiegelt', m.passung.aus==='beob' && m.passung.gespiegelt===false);
  chk('KarteStand: gehoben mit gBei und h_c − ty exakt (Median ≤ 1 mm)', m.beob.gehoben.alle.med<=0.001 && m.beob.gehoben.alle.p90<=0.001, `${(1000*m.beob.gehoben.alle.med).toFixed(2)} mm`);
  chk('KarteStand: none deutlich schlechter, besser als none', m.beob.none.alle.med>0.05 && m.beob.besserAlsNone.karte===true, `none ${(100*m.beob.none.alle.med).toFixed(1)} cm, p90 ${(100*m.beob.none.alle.p90).toFixed(1)} cm`);
  chk('KarteStand: festes H (2,416 statt 2,30) verschiebt', m.beob.hFest.alle.med>0.01, `${(100*m.beob.hFest.alle.med).toFixed(1)} cm`);
  chk('KarteStand: Ringe exakt (24 Ecken ≤ 1 mm)', alleEcken(m).length===24 && maxD(m)<=0.001 && offen(m)===0, f4(maxD(m)));
  chk('KarteStand: Wände 24/24 gefunden, Präzision 100 %, kein n:1, nichts ringübergreifend', m.waende.gefunden===24 && m.waende.praezision===1 && m.waende.n1.length===0 && m.ringUebergreifend===0);
  chk('KarteStand: Abschnittstabelle 2 Abschnitte, Versatz zur Gesamtpassung 0', m.abschnitte.length===2 && m.abschnitte.every(z=>z.dT<0.002 && Math.abs(z.dPsi)<0.05),
    m.abschnitte.map(z=>`${(100*z.dT).toFixed(2)} cm/${z.dPsi.toFixed(2)}°`).join(' · '));
  chk('KarteStand: Höhe gemeldet (h_c − h_f gegen Laser)', Math.abs(m.hoehe.dH-(hC-2.416))<1e-12); }
// Derselbe Stand mit gespiegeltem F0: Waende, Abschnitte und Ringe muessen ueber den Spiegelzweig genauso aufgehen
{ const m=T2.metrik(baueStand(-1), T2.WAHRHEIT, {minAbschnitt:12});
  chk('KarteStand gespiegelt: als gespiegelt erkannt, Beob exakt', m.passung.gespiegelt===true && m.passung.ungespiegelt===false && m.beob.gehoben.alle.p90<=0.001, `Spiegelverhältnis ${m.passung.spiegelVerhaeltnis.toExponential(1)}`);
  chk('KarteStand gespiegelt: Ringe exakt, Wände 24/24, Präzision 100 %', alleEcken(m).length===24 && maxD(m)<=0.001 && offen(m)===0 && m.waende.gefunden===24 && m.waende.praezision===1 && m.waende.n1.length===0);
  chk('KarteStand gespiegelt: Abschnitte Versatz 0', m.abschnitte.length===2 && m.abschnitte.every(z=>z.dT<0.002 && Math.abs(z.dPsi)<0.05), m.abschnitte.map(z=>`${(100*z.dT).toFixed(2)} cm/${z.dPsi.toFixed(2)}°`).join(' · ')); }
// n:1 und ringuebergreifend: eine Landmarke ueber zwei kollineare Waende verschiedener Ringe (R3: Luecke >= 0,831 m)
{ const paar=[]; for(let i=0;i<W.waende.length;i++) for(let j=i+1;j<W.waende.length;j++){ const a=W.waende[i], b=W.waende[j];
    if(a.ring===b.ring || Math.abs(Math.atan2(Math.sin(a.phi-b.phi), Math.cos(a.phi-b.phi)))>0.5*Math.PI/180) continue;
    const mb=[(b.a[0]+b.b[0])/2, (b.a[1]+b.b[1])/2]; if(Math.abs(a.n[0]*mb[0]+a.n[1]*mb[1]-a.rho)<0.01) paar.push([a,b]); }
  const [a,b]=paar[0], s=[a.s0, a.s1, b.u[0]*b.a[0]+b.u[1]*b.a[1], b.u[0]*b.b[0]+b.u[1]*b.b[1]];
  const lm={id:'z', phi:a.phi, rho:a.rho, cls:'wand', iv:[{s0:a.s0, s1:a.s1}, {s0:Math.min(s[2],s[3]), s1:Math.max(s[2],s[3])}]};
  const m=T2.metrik({...WJ, waende:[lm]}, T2.WAHRHEIT, fest);
  chk('n:1 über zwei Ringe erkannt, Lücke gemeldet', m.waende.n1.length===1 && m.ringUebergreifend===1 && m.waende.n1[0].luecke>0.5, `${a.ids}~${b.ids}, Lücke ${f4(m.waende.n1[0]?.luecke)} m`); }

// ---- 6. Mehrdeutigkeit: nur die Ecke L (Waende W-L und L-M) gesehen, mit Rauschen (ohne Rauschen misst das
// Verhaeltnis nur die Rasterlage der Suche: beste und zweitbeste Kosten liegen beide nahe 0).
let sd=12345; const rnd=()=>{ sd=(1103515245*sd+12345)%2147483648; return sd/2147483648-0.5; };
const rausch=b=>{ const d=v=>{ const w=[v[0]+0.02*rnd(), v[1]+0.02*rnd(), v[2]+0.02*rnd()], L=Math.hypot(...w); return w.map(x=>x/L); }; return {...b, da:d(b.da), db:d(b.db)}; };
{ const nur=stand.beob.filter(b=>['W-L','L-M'].includes(W.waende[b.L].ids)).flatMap(b=>[rausch(b), rausch(b), rausch(b)]), E1={beob:nur, abschnitte:AB, hoehen:stand.hoehen, waende:landmarken};
  const m=T2.metrik(E1, T2.WAHRHEIT, {abschnitte:false, spiegel:'nein'});
  // welche Ecke: Schwerpunkt der Punkte in der Wahrheit naeher an L oder an E
  const L1=T2.hebeBeob(E1, {h:'karte', g:true}, 2.416).flatMap(x=>x.seg), c=L1.reduce((a,p)=>[a[0]+p[0]/L1.length, a[1]+p[1]/L1.length], [0,0]);
  const wo=T=>{ const z=T2.tf(c,T); return Math.hypot(z[0]-P.L[0], z[1]-P.L[1])<Math.hypot(z[0]-P.E[0], z[1]-P.E[1]) ? 'L' : 'E'; };
  const deut=[wo(m.passung.T), m.passung.alt ? wo(m.passung.alt.T) : '–'];
  chk('nur Ecke L (Spiegel fest): mehrdeutig (< 1,2), Deutungen Ecke L und Ecke E', m.passung.verhaeltnis<1.2 && [...deut].sort().join()==='E,L',
    `Verhältnis ${m.passung.verhaeltnis.toFixed(2)} (Raster ${m.passung.verhaeltnisRaster.toFixed(2)}), beste bei Ecke ${deut[0]}, zweitbeste bei Ecke ${deut[1]}, ${(100*m.passung.alt.abstand).toFixed(0)} cm / ${m.passung.alt.dR.toFixed(0)}° daneben`);
  const f=T2.metrik(E1, T2.WAHRHEIT, {abschnitte:false});
  chk('nur Ecke L (Spiegel frei): Spiegel unentschieden (ungespiegelt = null)', f.passung.ungespiegelt===null, `Spiegelverhältnis ${f.passung.spiegelVerhaeltnis.toFixed(2)}`); }

console.log(out.join('\n'));
console.log(ok ? '\nALLE CHECKS GRÜN' : '\nCHECKS ROT');
process.exit(ok ? 0 : 1);
