// Prueft raumskizze-hsweep.mjs (AP5, H-Sweep) an kleinen synthetischen Eingaben, ohne die grossen Aufnahmen:
// H-Gitter, Aufnahme-Parser und Argumente, Nachskalierung (Wandkandidaten, Faktor, skalierter Export wie scaleSketch in
// raumaufmass.html), K1 der Kippquote, Auswertung (bestes H, Spiegelung, IoU-Verlust im Fenster) und Entscheid E1.
import * as H from '../raumskizze-hsweep.mjs';

const out=[]; let ok=true;
const chk=(name, cond, info='')=>{ ok=ok&&!!cond; out.push((cond?'ok   ':'ROT  ')+name+(info!==''?'  ('+info+')':'')); };
const nah=(a, b, e=1e-9)=>Math.abs(a-b)<=e;

// ---- H-Gitter
{ const g=H.hGitter(2.30, 2.90, 0.05);
  chk('Gitter 2,30–2,90 in 5-cm-Schritten: 13 Werte, Enden exakt', g.length===13 && g[0]===2.3 && g[12]===2.9, g.join(' '));
  chk('Gitter ohne Gleitkommarest (2.45 statt 2.4500000000000002)', g.includes(2.45) && g.every(x=>x===Math.round(x*1000)/1000));
  chk('Gitter mit einem Punkt (von = bis)', H.hGitter(2.5, 2.5, 0.05).length===1);
  let f=null; try{ H.hGitter(2.9, 2.3, 0.05); }catch(e){ f=e.message; }
  chk('Gitter von > bis ist ein Fehler', !!f, f);
  chk('hKey ist dateinamentauglich und eindeutig', H.hKey(2.45)==='H2_450' && H.hKey(2.4)!==H.hKey(2.45)); }

// ---- Parser
{ const a=H.aufnahmeAus('flur=/x/a.tar,/x/p.json,/x/w.json');
  chk('aufnahmeAus: Name, Quelle, Protokoll, Wahrheit, keine Laserhöhe', a.name==='flur' && a.src==='/x/a.tar' && a.protokoll==='/x/p.json' && a.wahrheit==='/x/w.json' && a.laser===null);
  const b=H.aufnahmeAus('wk=/x/a.tar,/x/p.json,/x/w.json,2.416');
  chk('aufnahmeAus: viertes Feld = Laserhöhe in m', b.laser===2.416);
  const c=H.aufnahmeAus('x=/x/a.tar,,/x/w.json');
  chk('aufnahmeAus: leeres Protokoll erlaubt', c.protokoll===null && c.wahrheit==='/x/w.json');
  let f=null; try{ H.aufnahmeAus('ohne-gleichheitszeichen'); }catch(e){ f=e.message; }
  chk('aufnahmeAus: ohne Name=Quelle ein Fehler', !!f);
  let g=null; try{ H.aufnahmeAus('x=/a.tar,p,w,abc'); }catch(e){ g=e.message; }
  chk('aufnahmeAus: Laserhöhe keine Zahl ein Fehler', !!g);
  const o=H.argumente(['--aufnahme', 'a=/1.tar,/1.json,/1w.json', '--aufnahme', 'b=/2.tar,/2.json,/2w.json,2.4', '--aus', '/o', '--von', '2.4', '--jobs', '2', '--wand', 'Q-R', '--still']);
  chk('argumente: mehrere --aufnahme, Zahlen, Schalter', o.aufnahmen.length===2 && o.aufnahmen[1].laser===2.4 && o.von===2.4 && o.bis===2.9 && o.jobs===2 && o.wand==='Q-R' && o.still===true && o.quelle==='erfassungen');
  const o2=H.argumente(['--aufnahme', 'a=/1.tar', '--aus', '/o', '--karte', 'aus', '--ohne', '']);
  chk('argumente: --karte aus und leeres --ohne', o2.karte===null && Array.isArray(o2.ohne) && o2.ohne.length===0);
  const A=H.auftraege({...o, aufnahmen:[o.aufnahmen[0]], von:2.5, bis:2.6, schritt:0.05, aus:'/o'});
  chk('auftraege: ein Lauf je H mit eigenem Ordner und --H im T1-Aufruf', A.length===3 && A[1].id==='a-H2_550' && A[1].dir.endsWith('laeufe/a-H2_550')
    && H.t1Argv(A[1]).join(' ').includes('--H 2.55') && H.t1Argv(A[1]).includes('--quelle'), A[1] && A[1].dir); }

// ---- Nachskalierung: Rechteck 6 x 4 m, Skizze 1,1-fach vergroessert (die Hoehe war zu gross), Lage = Identitaet
{ const wahr={ids:['a', 'b', 'c', 'd'], pts:[[0, 0], [6, 0], [6, 4], [0, 4]]}, k=1.1, T0={m:false, r:0, tx:0, ty:0, s:1};
  const exp={ids:['A', 'B', 'C', 'D'], pts:wahr.pts.map(p=>[p[0]*k, p[1]*k])};
  const kand=H.wandKandidaten(wahr, exp, T0, 1/k);
  chk('wandKandidaten (mit Vorfaktor 1/1,1): vier Wände, Faktor je Wand 1/1,1', kand.length===4 && kand.every(x=>nah(x.f, 1/k, 1e-12)), kand.map(x=>x.wand+' '+x.f.toFixed(4)).join(' '));
  chk('wandKandidaten: ohne Vorfaktor passt die 1,1-fach große Skizze nicht (Enden 0,3 m daneben)', H.wandKandidaten(wahr, exp, T0, 1).length<4);
  const nf=H.nachFaktor(kand);
  chk('nachFaktor: laengste Wahrheitswand (6 m, a-b), Median gleich', nf.wand==='a-b' && nah(nf.lWahr, 6) && nah(nf.fWand, 1/k, 1e-12) && nah(nf.fMedian, 1/k, 1e-12) && nf.n===4);
  chk('nachFaktor: --wand c-b (umgekehrt angegeben) nimmt die Kante b-c (4 m)', H.nachFaktor(kand, 'c-b').wand==='b-c' && nah(H.nachFaktor(kand, 'c-b').lWahr, 4));
  chk('nachFaktor: unbekannte Wand ergibt keinen Faktor, Median bleibt', H.nachFaktor(kand, 'x-y').fWand===null && nah(H.nachFaktor(kand, 'x-y').fMedian, 1/k, 1e-12));
  chk('nachFaktor ohne Kandidaten', H.nachFaktor([]).fWand===null && H.nachFaktor([]).n===0);
  // wie scaleSketch: die Skizzenkante mal Faktor ist genau die gemessene Wand
  const data={pts:exp.pts.map((p, i)=>({id:exp.ids[i], x:p[0]*1000, y:p[1]*1000})), walls:[['A', 'B']]}, sk=H.skaliereExport(data, nf.fWand);
  chk('skaliereExport: Kante A-B danach genau 6000 mm, Ids und Wände bleiben', nah(Math.hypot(sk.pts[1].x-sk.pts[0].x, sk.pts[1].y-sk.pts[0].y), 6000, 1e-6) && sk.pts[2].id==='C' && sk.walls===data.walls);
  chk('skaliereExport ändert das Original nicht', nah(data.pts[1].x, 6600, 1e-6));
  // Lage mit Drehung 90 Grad, Verschiebung und Spiegelung: T bildet die Skizze auf die Wahrheit ab
  const Tr={m:true, r:Math.PI/2, tx:3, ty:-2, s:1}, ep=wahr.pts.map(p=>{ // Umkehrung von tf: erst Wahrheitspunkt nach Skizze (Spiegel, Drehung), dann in Skizzenmass
    const q=[p[0]-Tr.tx, p[1]-Tr.ty], c=Math.cos(-Tr.r), s=Math.sin(-Tr.r), x=c*q[0]-s*q[1], y=s*q[0]+c*q[1]; return [-x*k, y*k]; });
  const kt=H.wandKandidaten(wahr, {ids:exp.ids, pts:ep}, Tr, 1/k);
  chk('wandKandidaten: gedrehte, verschobene und gespiegelte Lage (T2-Form) ergibt dieselben vier Faktoren', kt.length===4 && kt.every(x=>nah(x.f, 1/k, 1e-9)), kt.map(x=>x.f.toFixed(4)).join(' '));
  // Zusatzecke M auf a-b: die Teilkanten sind nur halb so lang wie die Wand und zaehlen nicht
  const exp3={ids:['A', 'M', 'B', 'C', 'D'], pts:[wahr.pts[0], [3, 0], wahr.pts[1], wahr.pts[2], wahr.pts[3]]}, kand3=H.wandKandidaten(wahr, exp3, T0, 1);
  chk('wandKandidaten: a-b ist in der Skizze zwei Kanten (Zusatzecke) und entfällt', !kand3.some(x=>x.wand==='a-b') && kand3.length===3, kand3.map(x=>x.wand).join(' '));
  // Ecke B 0,6 m neben der Wand
  const exp4={ids:['A', 'B', 'C', 'D'], pts:[[0, 0], [6, 0.6], [6, 4], [0, 4]]}, kand4=H.wandKandidaten(wahr, exp4, T0, 1);
  chk('wandKandidaten: beide Kanten an der verschobenen Ecke B entfallen (Enden im Mittel 30 cm daneben), c-d und d-a bleiben', kand4.map(x=>x.wand).sort().join()==='c-d,d-a', kand4.map(x=>x.wand).join(' '));
  // Teilkante: nur 4 von 6 m der Wand a-b gesehen (Skizzenkante von 0 bis 4)
  const exp5={ids:['A', 'B', 'C', 'D'], pts:[[0, 0], [4, 0], [6, 4], [0, 4]]};
  chk('wandKandidaten: Skizzenkante, die nur 2/3 der Wand deckt, ist keine eingegebene Wandlänge', !H.wandKandidaten(wahr, exp5, T0, 1).some(x=>x.wand==='a-b'));
  // Kanten unter 0,2 m entfallen
  const w4={ids:['a', 'b', 'c'], pts:[[0, 0], [0.1, 0], [0, 3]]};
  chk('wandKandidaten: Wahrheitswand unter 0,2 m entfällt', H.wandKandidaten(w4, {ids:['A', 'B', 'C'], pts:w4.pts}, T0, 1).every(x=>x.wand!=='a-b')); }

// ---- Kippquote: K1 und Signatur
{ const quad=[[0, 0], [5, 0], [5, 4], [0, 4]];
  const s0=H.signatur({corners:quad}), s1=H.signatur({corners:quad.map(([x, y])=>({x:x*1.02, y:y*1.02}))}), s2=H.signatur({corners:quad.map(([x, y])=>[x*1.1, y*1.1])});
  chk('signatur: Ecken und Fläche (Punkte als Paar oder {x,y})', s0.n===4 && nah(s0.A, 20) && nah(s1.A, 20*1.02*1.02, 1e-9));
  chk('signatur: weniger als 3 Ecken oder nichts ergibt null', H.signatur({corners:[[0, 0], [1, 1]]})===null && H.signatur(null)===null && H.signatur({})===null);
  chk('K1: Fläche +4 % gleich, +21 % nicht', H.gleichK1(s1, s0) && !H.gleichK1(s2, s0));
  chk('K1: andere Eckenzahl ist nie gleich', !H.gleichK1({n:5, A:20}, s0));
  chk('K1: ohne Auswertung nicht gleich', !H.gleichK1(null, s0) && !H.gleichK1(s0, null));
  // kippquote mit Platzhalter-G: die Auswertung verliert eine Ecke, wenn Beobachtung 0 fehlt
  const pool=Array.from({length:20}, (_, i)=>({t:i, ra:{}, rb:{}}));
  const G={rueckkehr:()=>null, solveSweepAuto:(obs, o)=>({corners:obs.some(x=>x.t===0) ? quad : quad.slice(0, 3)})};
  const q=H.kippquote(G, pool, 2.5, {n:40, anteil:0.05, block:3, seed:7});
  chk('kippquote: Volllauf hat 4 Ecken, 40 Ziehungen, k1 plausibel (Beobachtung 0 fehlt in rund 5 %)', q.voll.n===4 && q.zuf.N===40 && q.zuf.k1>=33 && q.zuf.k1<=40, `k1 ${q.zuf.k1}`);
  chk('kippquote: Blockfenster (3 s, Schritt 1 s, Beginn 0..17 = 18 Fenster), nur das erste verliert Beob 0', q.block.N===18 && q.block.k1===17, `N ${q.block.N} k1 ${q.block.k1}`);
  const q2=H.kippquote(G, pool, 2.5, {n:40, anteil:0.05, block:3, seed:7});
  chk('kippquote: wiederholbar bei gleichem Samen', JSON.stringify(q)===JSON.stringify(q2));
  const gesehen=[]; const Gf={rueckkehr:(obs, h)=>{ gesehen.push(h); return null; }, solveSweepAuto:(obs, o)=>{ gesehen.push(Object.keys(o).sort().join()); return {corners:quad, H:2.71}; }};
  const qf=H.kippquote(Gf, pool, null, {n:2, block:3});
  chk('kippquote: H = null rechnet mit freier Höhe (H0, Hsigma, Rückkehr mit 2,55) und meldet den eigenen Schätzwert', gesehen[0]===2.55 && gesehen[1]==='H0,Hsigma' && qf.voll.H===2.71, gesehen.slice(0, 2).join(' '));
  const qe=H.kippquote({rueckkehr:()=>null, solveSweepAuto:()=>{ throw new Error('x'); }}, pool, 2.5);
  chk('kippquote: Auswertung wirft -> keine Vollauswertung, null statt Absturz', qe.voll===null && qe.zuf===null); }

// ---- Auswertung: bestes H, Spiegelung, IoU-Verlust im Fenster, E1
{ const mk=(name, H0, iou, o={})=>({aufnahme:name, H:H0, fehler:null, ms:{gesamt:1},
    k:{gueltig:true, gespiegelt:false, rot:0.1, zentrum:[1, 1], iou, eMed:0.05+Math.abs(H0-2.6)*0.2, nZu:10, beobMed:0.04+Math.abs(H0-2.6)*0.2, verbMitWand:5, kameraMed:1.9, hLaserProtokoll:null, ...(o.k||{})},
    nach:{skaliert:{iou:iou+0.02, gespiegelt:false, rot:0.1, zentrum:[1, 1], mehr:2, ...(o.nach||{})}, eins:{iou, gespiegelt:false, rot:0.1, zentrum:[1, 1], mehr:2}}, kipp:null});
  const gitter=H.hGitter(2.3, 2.9, 0.05);
  // IoU haengt kaum von H ab (nach Skalierung): Verlust klein, bestes H bei 2,6 fuer alle Kriterien ausser verb/nach
  const Z=gitter.map(h=>mk('r1', h, 0.80-0.1*Math.abs(h-2.6)));
  const S=H.auswerten(Z, {}, H.DEF)[0];
  chk('auswerten: bestes H nach Beob-Median, IoU, Eckenfehler = 2,60', S.best.beob===2.6 && S.best.iou===2.6 && S.best.ecken===2.6 && S.hKopf===2.6, JSON.stringify(S.best));
  chk('auswerten: Δ = Href − Kamerahöhe = 0,70 m (ohne Laser Href = bestes H)', nah(S.Delta, 0.7, 1e-9) && S.laser===null);
  chk('auswerten: Fenster |δ|/Δ ≤ 0,3 heißt |δ| ≤ 0,21 m: Gitterpunkte 2,40–2,80 (9 Stück)', S.nFenster===9, `n ${S.nFenster}`);
  chk('auswerten: IoU-Verlust 0,1·0,2 = 0,02 am Fensterrand', nah(S.maxVerlust, 0.02, 1e-9), String(S.maxVerlust));
  chk('auswerten: Spiegelung konstant', S.spiegelKonstant && S.spiegelAbweichend.length===0);
  const E=H.e1Aussage([S]);
  chk('E1: eine Aufnahme, Kriterien erfüllt -> nur vorläufig, nicht abgenommen', /nur vorläufig/.test(E.urteil) && !E.genug && E.zeilen[0].status==='ok', E.urteil);
  const E3=H.e1Aussage([S, {...S, name:'r2'}, {...S, name:'r3'}]);
  chk('E1: drei Aufnahmen, Kriterien erfüllt -> H fest je Sitzung bleibt Hauptweg', /^H fest je Sitzung bleibt Hauptweg/.test(E3.urteil) && E3.genug, E3.urteil);
  // grosser Verlust -> y-Zustand
  const Zs=gitter.map(h=>mk('r4', h, 0.80-0.6*Math.abs(h-2.6))), Ss=H.auswerten(Zs, {}, H.DEF)[0];
  chk('E1: IoU-Verlust 0,13 im Fenster -> y-Zustand je Abschnitt', Ss.maxVerlust>0.05 && /^y-Zustand/.test(H.e1Aussage([Ss]).urteil), `Verlust ${Ss.maxVerlust.toFixed(3)}`);
  // Laserhoehe bekannt und weit weg vom besten H -> Streuung verfehlt
  const Sl=H.auswerten(Z, {r1:2.3}, H.DEF)[0];
  chk('E1: bestes H 0,30 m neben der Laserhöhe -> Streuung verfehlt, y-Zustand', nah(Sl.dHLaser, 0.3, 1e-9) && /^y-Zustand/.test(H.e1Aussage([Sl]).urteil), `dH ${Sl.dHLaser}`);
  // Spiegelung wechselt bei H = 2,3: Lauf verworfen und gemeldet
  const Zw=gitter.map(h=>mk('r5', h, 0.8-0.1*Math.abs(h-2.6), h===2.3 ? {k:{gespiegelt:true, iou:0.99, beobMed:0.001, eMed:0.001}} : {}));
  const Sw=H.auswerten(Zw, {}, H.DEF)[0];
  chk('auswerten: abweichende Spiegelung bei H = 2,3 wird verworfen und nicht „bestes H“', !Sw.spiegelKonstant && Sw.spiegelAbweichend.join()==='2.3' && Sw.best.beob===2.6 && Sw.nVerworfen===1, JSON.stringify(Sw.spiegelAbweichend));
  chk('E1: wechselnde Spiegelung verhindert „H fest“', /^y-Zustand/.test(H.e1Aussage([Sw]).urteil));
  // nicht eindeutige Passung zaehlt nicht
  const Zm=gitter.map(h=>mk('r6', h, 0.8, h===2.6 ? {k:{gueltig:false, beobMed:0.0001, rot:2}} : {})), Sm=H.auswerten(Zm, {}, H.DEF)[0];
  chk('auswerten: mehrdeutige Passung (gueltig=false) zählt nicht für das beste H', Sm.best.beob!==2.6 && Sm.nEindeutig===12);
  chk('E1: ohne eindeutigen Lauf nicht entscheidbar', /^nicht entscheidbar/.test(H.e1Aussage(H.auswerten(gitter.map(h=>mk('r7', h, 0.8, {k:{gueltig:false}})), {}, H.DEF)).urteil));
  // Lage der Nachskalierungs-Passung: Drehung 90 Grad daneben zaehlt nicht (Passung nur des Exports landete woanders)
  const Zr=gitter.map(h=>mk('r8', h, 0.8-0.1*Math.abs(h-2.6), h===2.4 || h===2.8 ? {nach:{rot:0.1+Math.PI/2}} : {})), Sr=H.auswerten(Zr, {}, H.DEF)[0];
  chk('auswerten: Passung mit 90° anderer Lage wird nicht als IoU nach Skalierung gewertet (2,40 und 2,80 fehlen)', Sr.verlust.find(v=>v.H===2.4).iouNach===null && Sr.verlust.find(v=>v.H===2.8).iouNach===null && Sr.nFenster===7, `n ${Sr.nFenster}`);
  // gleiche Drehung, aber 2 m verschoben (Nebenlage): zaehlt weder fuer das beste H noch als IoU nach Skalierung
  const Zv=gitter.map(h=>mk('r11', h, 0.8-0.1*Math.abs(h-2.6), h===2.4 ? {k:{zentrum:[3, 1], gueltig:false, beobMed:0.0001}, nach:{zentrum:[3, 1]}} : {})), Sv=H.auswerten(Zv, {}, H.DEF)[0];
  chk('auswerten: Nebenlage mit gleicher Drehung, 2 m verschoben, wird nicht gewertet (beste H bleibt 2,60; 2,40 ohne IoU nach)', Sv.best.beob===2.6 && Sv.verlust.find(v=>v.H===2.4).iouNach===null, JSON.stringify(Sv.best));
  // IoU nach Skalierung mit mehrdeutiger Passung (Mehrd. nach < 1,2) zaehlt nicht
  const Zn=gitter.map(h=>mk('r12', h, 0.8-0.1*Math.abs(h-2.6), h===2.5 ? {nach:{mehr:1.1}} : {})), Sn=H.auswerten(Zn, {}, H.DEF)[0];
  chk('auswerten: Mehrd. nach < 1,2 -> keine IoU nach Skalierung bei diesem H', Sn.verlust.find(v=>v.H===2.5).iouNach===null && Sn.verlust.find(v=>v.H===2.55).iouNach!==null && Sn.nFenster===8, `n ${Sn.nFenster}`);
  // zu wenige eindeutige Laeufe: Streuung und Verlust unbelegt, nicht ok
  const Zu=gitter.map(h=>mk('r9', h, 0.8, h===2.6 || h===2.55 ? {} : {k:{gueltig:false, rot:2}})), Su=H.auswerten(Zu, {}, H.DEF)[0], Eu=H.e1Aussage([Su]);
  chk('E1: nur 2 eindeutige Läufe -> Streuung unbelegt, nicht „ok“', Su.streuung===null && Eu.zeilen[0].okStreuung==='unbelegt' && /^nicht entscheidbar/.test(Eu.urteil), Eu.urteil);
  // zwei Raeume gut, ein dritter unbelegt: weiterhin nur vorlaeufig
  const E2=H.e1Aussage([S, {...S, name:'r2'}, Su]);
  chk('E1: zwei Räume ok, einer nicht auswertbar -> nur vorläufig mit Hinweis', /nur vorläufig/.test(E2.urteil) && /1 nicht auswertbar/.test(E2.urteil) && E2.nOk===2, E2.urteil);
  // mehrdeutige Laeufe in derselben Lage zaehlen fuer das beste H mit (Stufe 2), in anderer Lage nicht
  const Zl=gitter.map(h=>mk('r10', h, 0.8-0.1*Math.abs(h-2.6), h===2.6 || h===2.55 ? {} : h<=2.5 ? {k:{gueltig:false, rot:2}} : {k:{gueltig:false}})), Sl2=H.auswerten(Zl, {}, H.DEF)[0];
  chk('auswerten: 2 eindeutige Läufe + mehrdeutige in gleicher Lage (2,60–2,90 ohne 2,55/2,60: 6) -> Stufe 2 trägt die Streuung', Sl2.nEindeutig===2 && Sl2.nLage===8 && Sl2.streuung!==null, `eindeutig ${Sl2.nEindeutig} lagegleich ${Sl2.nLage}`);
  const Mf=H.tabelleMd(Z, [S], E, {text:'Test'});
  chk('tabelleMd: Überschrift, Tabelle je Aufnahme und E1-Abschnitt', /^# H-Sweep/.test(Mf) && /## r1/.test(Mf) && /## Entscheid E1/.test(Mf) && Mf.includes('| 2.60 |')); }

console.log(out.join('\n'));
console.log(ok ? '\nALLE CHECKS GRÜN' : '\nCHECKS ROT');
process.exit(ok ? 0 : 1);
