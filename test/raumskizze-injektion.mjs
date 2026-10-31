// Prueft Injektionstest (raumskizze-injektion.mjs) und Sprung-Test (raumskizze-sprung.mjs). Der Kern laeuft synthetisch, ohne
// grosse Aufnahmen: (a) die Einspritzungen als Rechnung auf Strahlen (Stuck: genau d*s/(Delta-s), Rahmenversatz: reproduzierbar
// und je 10 Erfassungen konstant, Einspritzung 0: dieselben Objekte), (b) Ring-Vergleich/Topologie, (c) ein Rechteckraum aus T3
// durch T1: Einspritzung 0 ergibt bitgleiche Waende (Nulltest), Stuck bei freiem H senkt H um genau s und laesst die Waende stehen,
// (d) die Ankerkorrektur des Sprung-Tests (Vorzeichen: C bildet die alte Ankerlage auf die neue ab; eine bekannte starre
// Verschiebung der alten Erfassungen wird durch +C aufgehoben, -C verdoppelt sie). Mit den echten Aufnahmen (Flur 16:25) zusaetzlich
// Nulltest, Hoehenfehler und Sprungliste; fehlen sie, steht "uebersprungen" (OFFEN) da.
//
//   node test/raumskizze-injektion.mjs        (INJ_TAR=aufnahme.tar INJ_PROT=protokoll.json INJ_WAHRHEIT=wahrheit.json INJ_H=2.6)
import {existsSync} from 'node:fs';
import * as T1 from '../raumskizze-karte.mjs';
import * as T2 from '../raumskizze-metrik.mjs';
import * as T3 from '../raumskizze-sim.mjs';
import * as IN from '../raumskizze-injektion.mjs';
import * as SP from '../raumskizze-sprung.mjs';

const out=[]; let ok=true, nOffen=0;
const chk=(name, cond, info='')=>{ ok=ok&&!!cond; out.push((cond ? 'ok   ' : 'ROT  ')+name+(info!=='' ? '  ('+info+')' : '')); };
const offen=(name, info='')=>{ nOffen++; out.push('OFFEN '+name+(info!=='' ? '  ('+info+')' : '')); };
const e1=x=>Number.isFinite(x) ? x.toExponential(1) : String(x), f3=x=>Number.isFinite(x) ? x.toFixed(3) : String(x);
const {G}=await T1.ladeSeite({});

// ---------------------------------------------------------------- (a) Strahlen
{
  const o=[0, 1.9, 0], H0=2.6, ray=(dx, dz, dy=0.5)=>{ const n=Math.hypot(dx, dy, dz); return {o, d:[dx/n, dy/n, dz/n]}; };
  const r=ray(0.8, 0.3);
  chk('(a) Einspritzung 0: strahlNeu und strahlVersatz geben dasselbe Objekt zurueck (bitgleich)', IN.strahlNeu(r, H0, {})===r && IN.strahlNeu(r, H0, {s:0, dy:0, p:0})===r && IN.strahlVersatz(r, 0)===r);
  let maxF=0, maxT=0;
  for(const [dx, dz, dy] of [[1, 0, 0.5], [0.8, 0.3, 0.4], [-0.6, 0.9, 0.7], [0.2, -1, 0.3]]) for(const s of [0.05, 0.1, 0.2]) for(const De of [0.64, 0.96]){
    const o2=[0, H0-De, 0], rr={o:o2, d:(()=>{ const n=Math.hypot(dx, dy, dz); return [dx/n, dy/n, dz/n]; })()}, P=IN.trifft(rr, H0), r2=IN.strahlNeu(rr, H0, {s}), P2=IN.trifft(r2, H0);
    const d=Math.hypot(P[0], P[2]), soll=d*s/(De-s), ist=Math.hypot(P2[0]-P[0], P2[2]-P[2]);
    maxF=Math.max(maxF, Math.abs(ist-soll)); maxT=Math.max(maxT, Math.abs(r2.o[1]-rr.o[1]), Math.abs(Math.hypot(...r2.d)-1)); }
  chk('(a) Stuck/Leiste der Tiefe s: Versatz beim Heben auf H0 = d*s/(Delta-s) (P6 1.1), Ursprung bleibt, Richtung normiert', maxF<1e-12 && maxT<1e-12, 'max Abweichung '+e1(maxF)+' m');
  // Kamerahoehe: Ursprung um dy, gleicher Treffpunkt auf H0
  const r3=IN.strahlNeu(r, H0, {dy:0.2}), P=IN.trifft(r, H0), P3=IN.trifft(r3, H0);
  chk('(a) Delta-Versatz (dy): Ursprung +dy, Treffpunkt auf H0 unveraendert', Math.abs(r3.o[1]-r.o[1]-0.2)<1e-15 && Math.hypot(P[0]-P3[0], P[2]-P3[2])<1e-12, e1(Math.hypot(P[0]-P3[0], P[2]-P3[2])));
  // obere Kante: p nach innen (gegen die Blickrichtung)
  const r4=IN.strahlNeu(r, H0, {p:0.08}), P4=IN.trifft(r4, H0), dp=Math.hypot(P4[0]-P[0], P4[2]-P[2]), nach=(P4[0]-P[0])*r.d[0]+(P4[2]-P[2])*r.d[2];
  chk('(a) obere Kante: Ausladung p horizontal gegen die Blickrichtung', Math.abs(dp-0.08)<1e-12 && nach<0, f3(dp));
  chk('(a) strahlNeu ohne Treffer (Strahl nach unten) gibt das Original zurueck', IN.strahlNeu({o, d:[1, -0.5, 0]}, H0, {s:0.1})!==null && IN.strahlNeu({o, d:[1, -0.5, 0]}, H0, {s:0.1}).d[1]===-0.5);
}
{ // Rahmenversatz und Aufnahme-Kopie
  const mk=n=>Array.from({length:n}, (_, i)=>({t:i, ra:{o:[0, 1.9, 0], d:[1, 0.2, 0]}, rb:{o:[0, 1.9, 0], d:[0, 0.2, 1]}}));
  const L=mk(4000), a=IN.injRahmenVersatz(L, 0.05, 7), b=IN.injRahmenVersatz(L, 0.05, 7), c=IN.injRahmenVersatz(L, 0.05, 8);
  const dy=ob=>a.map.get(ob).ra.o[1]-1.9, konst=Array.from({length:L.length/10}, (_, k)=>L.slice(10*k, 10*k+10).every(ob=>Math.abs(dy(ob)-dy(L[10*k]))<1e-15 && Math.abs(a.map.get(ob).rb.o[1]-1.9-dy(ob))<1e-15)).every(Boolean);
  const rms=Math.sqrt(a.dys.reduce((s, x)=>s+x*x, 0)/a.dys.length), mittel=a.dys.reduce((s, x)=>s+x, 0)/a.dys.length;
  chk('(a) Rahmenversatz: je 10 Erfassungen derselbe Versatz (beide Strahlen), Richtung unveraendert', konst && L.every(ob=>a.map.get(ob).ra.d===ob.ra.d));
  chk('(a) Rahmenversatz: Seed wiederholbar, anderer Seed anders, Streuung ~ sigma (400 Bloecke)', JSON.stringify(a.dys)===JSON.stringify(b.dys) && JSON.stringify(a.dys)!==JSON.stringify(c.dys) && Math.abs(rms-0.05)<0.005 && Math.abs(mittel)<0.01, `rms ${f3(rms)}, Mittel ${f3(mittel)}`);
  const z=IN.injRahmenVersatz(L, 0, 1);
  chk('(a) Rahmenversatz sigma 0: alle Strahlen dasselbe Objekt', L.every(ob=>z.map.get(ob).ra===ob.ra && z.map.get(ob).rb===ob.rb));
  const A={art:'aufnahme', rows:[1], P:{obs:[...L.slice(0, 3), {t:99, undone:true, ra:L[0].ra, rb:L[0].rb}], extra:1}}, G2=IN.gueltige(A), A2=IN.ersetzen(A, IN.injStuck(G2, 2.6, {s:0.1}));
  chk('(a) gueltige: ohne undone, nach t; ersetzen: Kopie, Original unberuehrt, uebrige Felder und Objekte geteilt', G2.length===3 && A2!==A && A.P.obs[0].ra===L[0].ra && A2.rows===A.rows && A2.P.extra===1 && A2.P.obs[3]===A.P.obs[3] && A2.P.obs[0].ra!==A.P.obs[0].ra);
  const S={art:'sitzung', erfassungen:L.slice(0, 5)}, S2=IN.ersetzen(S, IN.injStuck(IN.gueltige(S), 2.6, {s:0.1}));
  chk('(a) Sitzung: Erfassungen werden ersetzt', S2.erfassungen.length===5 && S2.erfassungen[0].ra!==S.erfassungen[0].ra && S.erfassungen[0].ra===L[0].ra);
  const M=IN.injStuck(L.slice(0, 20), 2.6, {s:0.1, dy:0.1}), sp=IN.selbstpruefung(L.slice(0, 20), M, 2.6, {s:0.1, dy:0.1});
  chk('(a) Selbstpruefung: Planverschiebung je Strahl = d*s/(Delta-s) mit Delta der neuen Kamera', sp.n===40 && sp.maxFehler<1e-12, e1(sp.maxFehler));
  const dd=IN.dyFuerDelta(L, 2.6, 0.64), D=IN.deltaAbstand(L, 2.6, dd);
  chk('(a) dyFuerDelta: Median von Delta = Ziel', Math.abs(IN.medianUrsprungY(L)+dd-(2.6-0.64))<1e-12 && Math.abs(D.delta[0]-0.64)<1e-12);
}

{ // wirksame Hoehe und Eichung an P7 t11
  const o=[0, 1.9, 0], mk=n=>Array.from({length:n}, (_, i)=>({t:i, ra:{o, d:[0.8, 0.4+0.01*i, 0.3]}, rb:{o, d:[0.2, 0.45, 0.9]}})), L=mk(30), M0=IN.injStuck(L, 2.6, {s:0}), M1=IN.injStuck(L, 2.6, {s:0.1});
  chk('(a) erwartungHEff: ohne Einspritzung und gleiches H 0; Stuck s bei hInj = H0 gleich d*s/(Delta-s); ein tieferes hInj senkt den Versatz', IN.erwartungHEff(L, M0, 2.6, 2.6)===0 && Math.abs(IN.erwartungHEff(L, M1, 2.6, 2.6)-IN.erwartungVersatz(L, 2.6, 0.1).versatz)<1e-12 && IN.erwartungHEff(L, M1, 2.6, 2.55)<IN.erwartungHEff(L, M1, 2.6, 2.6));
  const S=IN.injStuckStreu(L, 2.6, 0.1, 0.08, 5), S2=IN.injStuckStreu(L, 2.6, 0.1, 0.08, 5), s0=IN.injStuckStreu(L, 2.6, 0.1, 0, 5);
  chk('(a) injStuckStreu: Seed wiederholbar, streut; Streuung 0 = fester Stuck', JSON.stringify([...S.values()])===JSON.stringify([...S2.values()]) && new Set([...S.values()].map(m=>m.ra.d[0])).size>20 && JSON.stringify([...s0.values()])===JSON.stringify([...M1.values()]));
  const r=IN.artDsim(G, {}, 8), bei=n=>r.rows.find(x=>x.name.startsWith(n));
  chk('(a) Eichung an P7 t11 (gleicher Schaetzer solveSweepAuto): ideal ~ 0, Rahmenversatz hebt H (5 cm < 10 cm), sigma 10 cm Bloecke zu 20 liegt bei +5 bis +20 cm',
    Math.abs(bei('ideal').medianCm)<3 && bei('sigma 5 cm, Bloecke zu 20').medianCm>bei('ideal').medianCm+1 && bei('sigma 10 cm, Bloecke zu 20').medianCm>bei('sigma 5 cm, Bloecke zu 20').medianCm
    && bei('sigma 10 cm, Bloecke zu 20').medianCm>5 && bei('sigma 10 cm, Bloecke zu 20').medianCm<20, r.rows.map(x=>x.name.slice(0, 14)+' '+x.medianCm.toFixed(1)).join(' | '));
}

// ---------------------------------------------------------------- (b) Ringe, Topologie, Umkehrung
{
  const P=[[0, 0], [4, 0], [4, 3], [2, 3], [2, 1.5], [0, 1.5]], Pdreh=[...P.slice(2), ...P.slice(0, 2)], Prueck=[...P].reverse(), Ppos=P.map(p=>[p[0]*1.1, p[1]*1.1]);
  const rect=[[0, 0], [4, 0], [4, 3], [0, 3]];
  chk('(b) drehfolge: L-Raum 5 Links- und 1 Rechtsecke, unabhaengig von Start und Richtung', IN.gleicheFolge(IN.drehfolge(P), IN.drehfolge(Pdreh)) && IN.gleicheFolge(IN.drehfolge(P), IN.drehfolge(Prueck)) && (IN.drehfolge(P).match(/R/g)||[]).length===1, IN.drehfolge(P));
  chk('(b) drehfolge: Rechteck und L-Raum sind verschieden', !IN.gleicheFolge(IN.drehfolge(rect), IN.drehfolge(P)));
  const v=IN.ringVergleich(P, Ppos);
  chk('(b) ringVergleich: Massstab 1,1 -> Skala 1,1, Flaeche 1,21; gleicher Ring -> alle Differenzen 0', Math.abs(v.skala-1.1)<1e-12 && v.topologieGleich && IN.ringVergleich(P, P).kanteMed===0 && IN.ringVergleich(P, P).aussen===0, f3(v.skala));
  const T={m:true, r:0.7, tx:2, ty:-1, s:1.1}, p=[1.3, 0.4], q=T2.tf(p, T), b=IN.tfUmkehr(q, T);
  chk('(b) tfUmkehr kehrt T2.tf um (Spiegelung, Drehung, Massstab)', Math.hypot(b[0]-p[0], b[1]-p[1])<1e-12, e1(Math.hypot(b[0]-p[0], b[1]-p[1])));
  const W=T2.wahrheitLaden({pts:[{id:'A', x:0, y:0}, {id:'B', x:4000, y:0}, {id:'C', x:4000, y:3000}, {id:'D', x:0, y:3000}], walls:[['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A']]});
  const T0={m:false, r:0, tx:0, ty:0, s:1}, aussen=rect.map(p=>[p[0]+(p[0]>2 ? 0.2 : 0), p[1]]);   // rechte Wand 20 cm nach aussen
  const wR=W.waende.find(w=>Math.abs(w.a[0]-4)<1e-9 && Math.abs(w.b[0]-4)<1e-9), wL=W.waende.find(w=>Math.abs(w.a[0])<1e-9 && Math.abs(w.b[0])<1e-9);
  const sR=IN.wandVerschiebung(rect, aussen, wR, T0), sL=IN.wandVerschiebung(rect, aussen, wL, T0);
  chk('(b) wandVerschiebung: rechte Wand +20 cm nach aussen (positiv), linke Wand 0', sR && Math.abs(sR.median-0.2)<1e-9 && sL && Math.abs(sL.median)<1e-9, `${f3(sR && sR.median)} / ${f3(sL && sL.median)}`);
  chk('(b) starrePassung: ohne Erfassungen null statt eines Fehlers', IN.starrePassung(G, [], 2.6, W)===null);
}

// ---------------------------------------------------------------- (c) Rechteckraum aus T3 durch T1
let sitzOk=false;
{
  const Wr={pts:[{id:'A', x:0, y:0}, {id:'B', x:5000, y:0}, {id:'C', x:5000, y:4000}, {id:'D', x:0, y:4000}], walls:[['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A']]};
  const erg=T3.sim(Wr, {G, ...T3.SITZUNGEN.rund, bildJede:2, rausch:{sigPx:0, kuerzPx:0}, erfassung:{jede:2}});
  const A={art:'sitzung', posen:erg.posen, breaks:erg.breaks, ereignisse:erg.ereignisse, bilder:[], erfassungen:erg.erfassungen.map(x=>({...x.erf, wahr:x.wahr})), proj:T3.PROJ_A6, w:287, h:640, hLaserMm:2416, warnungen:[]};
  const oT=T1.optionenAus(T1.argumente(['x', '--quelle', 'erfassungen', '--ohne', 'tiefe,ebenen'])), oF={...oT, H:null}, L=IN.gueltige(A), H0=2.416;
  const breiten=lauf=>{ const w=lauf.letzte.stand.waende, o=[]; for(let i=0;i<w.length;i++) for(let j=i+1;j<w.length;j++){ const d=Math.abs(Math.atan2(Math.sin(w[i].phi-w[j].phi), Math.cos(w[i].phi-w[j].phi))); if(Math.abs(d-Math.PI)<0.1) o.push(Math.abs(w[i].rho+w[j].rho)); } return o.sort((a, b)=>a-b); };
  const basis=await T1.laufen(G, A, oT), basisF=await T1.laufen(G, A, oF), bb=breiten(basis);
  sitzOk=A.erfassungen.length>=40 && basis.letzte.stand.waende.length===4 && bb.length===2 && Math.abs(bb[0]-4)<0.01 && Math.abs(bb[1]-5)<0.01;
  chk('(c) Rechteckraum 5 x 4 m aus T3 (rauschfrei): 4 Waende, Breiten 4 und 5 m aus Erfassungen allein', sitzOk, `${A.erfassungen.length} Erfassungen, ${bb.map(f3).join(' / ')}`);
  // Nulltest durch die ganze Pipeline
  const null0=await T1.laufen(G, IN.ersetzen(A, IN.injStuck(L, H0, {s:0, dy:0})), oT), nullV=await T1.laufen(G, IN.ersetzen(A, IN.injRahmenVersatz(L, 0, 3).map), oT);
  const w0=JSON.stringify(basis.letzte.stand.waende);
  chk('(c) Nulltest: Einspritzung 0 (Stuck s 0 / Rahmenversatz sigma 0) ergibt Waende und Hoehe bitgleich zum ungestoerten Lauf',
    JSON.stringify(null0.letzte.stand.waende)===w0 && JSON.stringify(nullV.letzte.stand.waende)===w0 && JSON.stringify(null0.letzte.stand.hoehen)===JSON.stringify(basis.letzte.stand.hoehen));
  // Stuck 10 cm, freies H: H sinkt um s, Waende stehen (P6 1.3)
  const s=0.1, mapS=IN.injStuck(L, H0, {s}), fS=await T1.laufen(G, IN.ersetzen(A, mapS), oF), bs=breiten(fS), dH=fS.letzte.stand.hoehen.hC-basisF.letzte.stand.hoehen.hC;
  chk('(c) Rundum-Stuck s = 10 cm, freies H: H_hat sinkt um s (+-1 cm), Raumbreiten unveraendert (+-1 cm)', Math.abs(dH+s)<0.01 && Math.abs(bs[0]-4)<0.01 && Math.abs(bs[1]-5)<0.01, `dH ${f3(dH)} m, Breiten ${bs.map(f3).join(' / ')}`);
  // Stuck 10 cm, festes H: die Waende wandern nach aussen (Raum wird groesser), Selbstpruefung der Einspritzung stimmt
  const fF=await T1.laufen(G, IN.ersetzen(A, mapS), oT), bf=breiten(fF), sp=IN.selbstpruefung(L, mapS, H0, {s}), erw=IN.erwartungVersatz(L, H0, s);
  chk('(c) Rundum-Stuck, festes H: Raum wird groesser (Waende nach aussen), Erwartung d*s/(Delta-s) > 0, Selbstpruefung stimmt', bf.length>=2 && bf.slice(-2).every(x=>x>5-0.01) && bf[bf.length-1]>5.2 && erw.versatz>0.1 && sp.maxFehler<1e-9,
    `Breiten ${bf.map(f3).join(' / ')}, Erwartung je Wand ${f3(erw.versatz)} m bei d ${f3(erw.abstand)} m, Delta ${f3(erw.delta)} m`);
}

// ---------------------------------------------------------------- (d) Sprung-Test: Ankerkorrektur
{
  const sp=['t', 'anlass', 'kx', 'ky', 'kz', 'kpsi', 'bezug', 'vorher', 'anker'];
  const rowsA=[[10, 0, 0, 0, 0, 0, 3, 1, [[3, 1.0, 0.0, 2.0, 0.3], [4, -1.0, 0, 0.5, 0.1], [5, 0]]], [10.5, 0, 0, 0, 0, 0, 3, 1, [[3, 1.0, 0.0, 2.0, 0.3], [4, -1.0, 0, 0.5, 0.1], [5, 0]]],
    [11, 'anker-sprung', 0, 0, 0, 0, 3, 1, [[3, 1.2, 0.0, 2.1, 0.45], [4, -0.9, 0, 0.7, 0.2], [5, 0]]], [11.5, 0, 0, 0, 0, 0, 3, 1, [[3, 1.2, 0.0, 2.1, 0.45], [4, -0.9, 0, 0.7, 0.2], [5, 0]]]];
  const A={M:{anker:{spalten:sp}}, anker:rowsA, breaks:[{t:11, grund:'anker-sprung', d:0.2, dpsiDeg:8.6}, {t:11.2, grund:'sprung'}, {t:30, grund:'bezug-sprung'}, {t:50, grund:'pausiert'}],
    events:[{t:11.0, type:'netz', anlass:'sprung', befund:'gemischt', bezug:{id:3, z:'verfolgt'}}, {t:30.2, type:'netz', anlass:'sprung', befund:'stetig', bezug:{id:3}}, {t:60, type:'netz', anlass:'wieder', befund:'wieder-einzeln'},
      {t:45, type:'netz', anlass:'luecke', befund:'alle-pausiert'}, {t:70, type:'hinweis'}]};
  const S=SP.spruenge(A);
  chk('(d) spruenge: Bruch + netz-Ereignis < 0,5 s zusammengefasst, "sprung"/"pausiert" und "luecke" zaehlen nicht, "wieder" ja', S.length===3 && S[0].t===11 && S[0].quellen.length===2 && S[0].befund==='gemischt' && S[0].bezugId===3 && S[1].t===30 && S[2].anlass==='wieder', S.map(s=>s.t).join(', '));
  chk('(d) vorGrenze: bei "wieder" vor der letzten Luecke, sonst die Sprungzeit', SP.vorGrenze(A, S[2])===45 && SP.vorGrenze(A, S[0])===11);
  const v=SP.ankerLage(A, 3, 11, 'vor', 60), n=SP.ankerLage(A, 3, 11, 'nach', 3), p=SP.ankerLage(A, 5, 11, 'vor', 60);
  chk('(d) ankerLage: vor = letzte verfolgte Zeile vor dem Sprung, nach = erste ab dem Sprung, pausierter Anker nie', v.t===10.5 && n.t===11 && p===null);
  const C=SP.korrektur(G, v.e, n.e), pv=G.gAnw(C, [v.e[1], v.e[2], v.e[3]]);
  chk('(d) Vorzeichen: C = A_neu o A_alt^-1 bildet die alte Ankerlage auf die neue ab (1e-9 m)', Math.hypot(pv[0]-n.e[1], pv[1]-n.e[2], pv[2]-n.e[3])<1e-9 && Math.abs(Math.abs(C.psi)-0.15)<1e-12, e1(Math.hypot(pv[0]-n.e[1], pv[1]-n.e[2], pv[2]-n.e[3])));
  const Ks=SP.korrekturen(G, A, S[0]);
  chk('(d) korrekturen: Bezugsanker 3 und Netz [4] getrennt, Ankerweg gemeldet', Ks.length===2 && Ks[0].name==='bezug' && Ks[1].name==='netz' && Ks[1].ids.join()==='4' && Math.abs(Ks[0].bewegt-Math.hypot(0.2, 0.1))<1e-9, Ks.map(k=>k.name+' '+(100*k.bewegt).toFixed(1)+' cm').join(', '));
  // bekannte starre Verschiebung der alten Erfassungen wird durch +C aufgehoben
  const Wr=T2.wahrheitLaden({pts:[{id:'A', x:0, y:0}, {id:'B', x:5000, y:0}, {id:'C', x:5000, y:4000}, {id:'D', x:0, y:4000}], walls:[['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A']]});
  const erg=T3.sim({pts:[{id:'A', x:0, y:0}, {id:'B', x:5000, y:0}, {id:'C', x:5000, y:4000}, {id:'D', x:0, y:4000}], walls:[['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A']]}, {G, ...T3.SITZUNGEN.rund, bildJede:2, rausch:{sigPx:0, kuerzPx:0}, erfassung:{jede:2}});
  const erf=erg.erfassungen.map(x=>({...x.erf, zeile:0})), posen=[{T:[0, 0, 0, 0]}], half=erf.length>>1, neu=erf.slice(half), altOk=erf.slice(0, half);
  const g0={psi:0.2, tx:0.3, ty:0, tz:-0.2}, gn={...g0, tx:0, ty:0, tz:0};
  const alt=altOk.map(e=>({...e, ra:{...e.ra, o:G.gAnw(g0, e.ra.o), d:G.gAnw(gn, e.ra.d)}, rb:{...e.rb, o:G.gAnw(g0, e.rb.o), d:G.gAnw(gn, e.rb.d)}}));   // die alten Erfassungen liegen im verschobenen Rahmen
  const Ctrue=G.gInv(g0);
  const r0=SP.messen(G, Wr, 2.416, altOk, neu, null, posen), rVer=SP.messen(G, Wr, 2.416, alt, neu, null, posen), rPlus=SP.messen(G, Wr, 2.416, alt, neu, Ctrue, posen), rMinus=SP.messen(G, Wr, 2.416, alt, neu, g0, posen);
  chk('(d) Sprung-Messung: unverschobener Rahmen ~0 cm; verschoben schlechter; +C (Umkehrung der Verschiebung) stellt wieder her; die falsche Richtung bleibt schlecht',
    r0 && rVer && rPlus && rMinus && r0.med<0.005 && rVer.p90>5*r0.p90+0.01 && rPlus.med<0.005 && rPlus.p90<rVer.p90/3 && rMinus.p90>rPlus.p90*3, `Median/p90 cm: heil ${(100*r0.med).toFixed(1)}/${(100*r0.p90).toFixed(1)}, verschoben ${(100*rVer.med).toFixed(1)}/${(100*rVer.p90).toFixed(1)}, +C ${(100*rPlus.med).toFixed(1)}/${(100*rPlus.p90).toFixed(1)}, falsch ${(100*rMinus.med).toFixed(1)}/${(100*rMinus.p90).toFixed(1)}`);
  // Bezug-Umrechnung: mit T gleich Identitaet ist g = C; mit gedrehtem T ist g = T^-1 C T
  const gI=SP.imBezug(G, C, [0, 0, 0, 0]), Tr=[0.7, 0.4, 0, -0.3], gT=SP.imBezug(G, C, Tr), gt=G.gAusT(Tr), chkG=G.gKomp(gt, gT), chkC=G.gKomp(C, gt);
  chk('(d) imBezug: T=0 gibt C; sonst g = T^-1 C T (T o g = C o T)', Math.abs(gI.psi-C.psi)<1e-12 && Math.abs(chkG.psi-chkC.psi)<1e-12 && Math.hypot(chkG.tx-chkC.tx, chkG.tz-chkC.tz)<1e-12);
  const Z=SP.zusammenfassen([{t:1, mengen:{nachbar:{ok:true, varianten:{roh:{}, '+bezug':{dMedCm:-0.5, lageGleich:true}, '-bezug':{dMedCm:0.8, lageGleich:true}}}}}, {t:2, mengen:{nachbar:{ok:true, varianten:{roh:{}, '+bezug':{dMedCm:-1.0, lageGleich:true}}}}}]);
  chk('(d) zusammenfassen: zaehlt besser/schlechter, H3 nur erfuellt bei genug Spruengen, belastbar erst ab 12', Z.auswertbar.nachbar.varianten['+bezug'].besser===2 && Z.auswertbar.nachbar.varianten['+bezug'].h3.erfuellt===true && !Z.belastbar && /12/.test(Z.hinweis));
}

// ---------------------------------------------------------------- (e) echte Aufnahme (Flur 16:25), falls vorhanden
{
  const HOME=process.env.HOME, st='2026-10-31T16-25-49-246Z';
  const tar=process.env.INJ_TAR || `${HOME}/Downloads/aufnahme-${st}-lauf0-video.tar`, prot=process.env.INJ_PROT || `${HOME}/Downloads/raumskizze-protokoll-${st}.json`, wahr=process.env.INJ_WAHRHEIT || null, H0=process.env.INJ_H ? +process.env.INJ_H : 2.6;
  if(!existsSync(tar) || !existsSync(prot)) offen('(e) echte Aufnahme: Nulltest, Hoehenfehler, Sprungliste', 'uebersprungen: Aufnahme oder Protokoll fehlt (INJ_TAR/INJ_PROT)');
  else {
    const A=T1.ladeQuelle(tar, {protokoll:prot}), L=IN.gueltige(A), S=SP.spruenge(A);
    chk('(e) Sprungliste des Flurs 16:25: 412,56 / 466,85 / 501,68 (anker-sprung), 545,4 (wieder), 557,78 (netz)', S.length===5 && [412.56, 466.848, 501.681, 545.4, 557.782].every((t, i)=>Math.abs(S[i].t-t)<0.01), S.map(s=>s.t).join(', '));
    if(!wahr || !existsSync(wahr)) offen('(e) Nulltest/Hoehenfehler auf der echten Aufnahme', 'uebersprungen: Wahrheit fehlt (INJ_WAHRHEIT=wahrheit-flur.json)');
    else {
      const W=T2.wahrheitLaden(wahr), basis=await IN.messen(G, A, W, {H:H0}), nul=await IN.messen(G, IN.ersetzen(A, IN.injStuck(L, H0, {s:0, dy:0})), W, {H:H0});
      chk('(e) Nulltest Flur: Einspritzung 0 ergibt einen bitgleichen Export', basis.exportJson && nul.exportJson===basis.exportJson, basis.frei ? basis.frei.ecken+' Ecken' : '');
      const da=IN.deltaAbstand(L, H0), De=IN.medianUrsprungY(L), up=await IN.messen(G, A, W, {H:H0+0.10}), cmp=IN.ringVergleich(basis.ring, up.ring), einzel=1+0.10/(H0-De), wirk=(cmp.skala-1)/(einzel-1);
      chk('(e) Hoehenfehler +10 cm: Skizzenmassstab folgt H mit etwa 0,6 des Einzelstrahl-Werts (0,45 bis 0,75, P7 S2)', wirk>0.45 && wirk<0.75, `Wirkfaktor ${wirk.toFixed(2)}, Delta ${(H0-De).toFixed(2)} m, Skala ${cmp.skala.toFixed(3)}`); void da;
    }
  }
}

console.log(out.join('\n'));
console.log(ok ? `\nALLE CHECKS GRÜN${nOffen ? ` (${nOffen} offen)` : ''}` : '\nROT');
process.exit(ok ? 0 : 1);
