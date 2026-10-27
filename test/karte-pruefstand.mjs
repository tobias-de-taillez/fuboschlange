// Prueft den Pruefstand raumskizze-pruefstand.mjs (Doku 12.8) und zwei Aenderungen an T1 aus derselben Nacht:
// (a) bruchSimulieren an einer synthetischen Aufnahme: Fenster weg, danach Pose und T im Rahmen X, Kamera und Blick im Bezug
//     unveraendert (die Wahrheit der Relativlage bleibt die Einheit), Bruch 'pausiert' und Ereignisse, Erfassungen gefiltert,
//     M4 setzt dort einen Schnitt der Klasse 'pause'; (b) fenster: ruhige Stellen, Abstand zu Schnitten; (c) T1 --karte (JSON
//     an G.karteNeu); (d) T1 orakelAus mit --spiegel ja: die g je Abschnitt legen die gehobenen Erfassungen auf die gespiegelte
//     Wahrheit (vorher fiel T.m weg: Median Meter statt cm), nur mit A6 (sonst OFFEN).
//
//   node test/karte-pruefstand.mjs        (A6=pfad/aufnahme6.tar,protokoll6.json fuer (d))
import {existsSync} from 'node:fs';
import * as T1 from '../raumskizze-karte.mjs';
import * as T2 from '../raumskizze-metrik.mjs';
import * as PS from '../raumskizze-pruefstand.mjs';

const out=[]; let ok=true, nOffen=0;
const chk=(name,cond,info='')=>{ ok=ok&&!!cond; out.push((cond?'ok   ':'ROT  ')+name+(info!==''?'  ('+info+')':'')); };
const offen=(name,info='')=>{ nOffen++; out.push('OFFEN '+name+(info!==''?'  ('+info+')':'')); };
const D2R=Math.PI/180, wrap=a=>Math.atan2(Math.sin(a), Math.cos(a));
const {G}=await T1.ladeSeite({});

// ---- synthetische Aufnahme: Kamera geht im Kreis, Bezug fest (ein Abschnitt), 20 Hz, 40 s
const SP=['t', 'px', 'py', 'pz', 'qx', 'qy', 'qz', 'qw', 'Tpsi', 'Tx', 'Ty', 'Tz', 'flags', 'v'], C=Object.fromEntries(SP.map((k,i)=>[k, i]));
const T0=[0.3, 0.5, -1.4, 0.2], rows=[];
for(let i=0;i<=800;i++){ const t=i/20, a=0.15*t, r=1.2, x=r*Math.cos(a), z=r*Math.sin(a), yaw=a+0.4*Math.sin(0.7*t);
  // Pose: Gier um y plus etwas Neigung (x), Quaternion [x, y, z, w]
  const qy=[0, Math.sin(yaw/2), 0, Math.cos(yaw/2)], th=0.2, qx=[Math.sin(th/2), 0, 0, Math.cos(th/2)];
  const q=[qy[3]*qx[0], qy[1]*qx[3], -qy[1]*qx[0], qy[3]*qx[3]];
  rows.push([+t.toFixed(3), x, 1.5, z, ...q, ...T0, 0, i%3===0 ? i/3 : -1]); }
const obs=[]; for(let t=1;t<40;t+=0.7) obs.push({t:+t.toFixed(2), ra:{o:[0, 1.5, 0], d:[0.6, 0.8, 0]}, rb:{o:[0, 1.5, 0], d:[0.5, 0.8, 0.33]}});
const A={art:'aufnahme', rows, C, P:{obs}, breaks:[], events:[], anker:[[5, 'x', 0, 0, 0, 0, 0, 0, [[1, 0, 0, 0, 0]]], [30, 'x', 0, 0, 0, 0, 0, 0, []]], ebenen:[], warnungen:[]};
const X={psiDeg:40, tx:1.3, tz:-0.8}, t0=20, w=1.3, A2=PS.bruchSimulieren(G, A, t0, w, X);
const P0=T1.posenAus(G, A), P1=T1.posenAus(G, A2), alt=new Map(P0.map(p=>[p.t, p]));
let dc=0, db=0, n=0, nDanach=0, dT=0;
for(const p of P1){ const o=alt.get(p.t); if(!o) continue; n++; dc=Math.max(dc, Math.hypot(...o.cam.map((v,i)=>v-p.cam[i]))); db=Math.max(db, Math.abs(wrap(o.blick-p.blick)));
  if(p.t>=t0+w){ nDanach++; const gT=G.gKomp({psi:X.psiDeg*D2R, tx:X.tx, ty:0, tz:X.tz}, G.gAusT(o.T)), gN=G.gAusT(p.T); dT=Math.max(dT, Math.abs(wrap(gT.psi-gN.psi))+Math.hypot(gT.tx-gN.tx, gT.tz-gN.tz)); } }
chk('(a) Fenster [t0, t0+w) faellt weg', P1.length===P0.length-A2.sim.weg && A2.sim.weg===26 && !P1.some(p=>p.t>=t0 && p.t<t0+w), `weg ${A2.sim.weg}, Zeilen ${P0.length} -> ${P1.length}`);
chk('(a) Kamera und Blick im Bezug unveraendert (Wahrheit der Relativlage = Einheit)', dc<1e-9 && db<1e-6, `cam ${dc.toExponential(1)} m, Blick ${db.toExponential(1)} rad, ${n} Zeilen`);
chk('(a) danach: T = X ∘ T_alt, Pose im neuen Rahmen (Kamera in local springt)', nDanach>300 && dT<1e-9 && Math.hypot(P1.find(p=>p.t>=t0+w).pose[0]-alt.get(A2.sim.tB).pose[0], P1.find(p=>p.t>=t0+w).pose[2]-alt.get(A2.sim.tB).pose[2])>0.5, `dT ${dT.toExponential(1)}`);
chk('(a) Bruch pausiert und Ereignisse einer echten Pause bei tB, A unveraendert', A2.breaks.length===1 && A2.breaks[0].grund==='pausiert' && A2.breaks[0].t===A2.sim.tB && A2.sim.tB===21.3
  && ['tracking-verloren', 'tracking-zurück', 'anker-verloren', 'bezug-ersatz'].every(ty=>A2.events.some(e=>e.type===ty)) && A.breaks.length===0 && A.rows.length===801, `tB ${A2.sim.tB}`);
chk('(a) Erfassungen im Fenster weg, Anker nur vor t0', A2.P.obs.length===obs.filter(x=>x.t<t0 || x.t>=t0+w).length && A2.P.obs.length<obs.length && A2.anker.length===1);
const S1=G.sessionCuts(P1, A2.breaks, A2.events, {}, null), cut=S1.find(c=>Math.abs(c.t-A2.sim.tB)<1e-6);
chk('(a) M4 schneidet bei tB mit Klasse pause (Luecke ' + (cut ? cut.dt.toFixed(2) : '–') + ' s)', S1.length===1 && cut && cut.klasse==='pause' && cut.epA!==cut.epB, JSON.stringify(S1.map(c=>[c.t, c.art, c.klasse])));

// ---- (b) Fenster: ohne Schnitt in der Naehe, je w hoechstens n, Abstand
const F=PS.fenster(G, A, {w:[1.3, 4], n:3, abstand:5, rand:2, minErf:4});
chk('(b) fenster: je w hoechstens n, im Abstand, weg von den Raendern', F.length===6 && [1.3, 4].every(w=>F.filter(f=>f.w===w).length===3)
  && F.every(f=>f.t0>=2 && f.t0+f.w<=38) && [1.3, 4].every(w=>{ const t=F.filter(f=>f.w===w).map(f=>f.t0).sort((a,b)=>a-b); return t.every((x,i)=>!i || x-t[i-1]>=5); }), JSON.stringify(F.map(f=>[f.t0, f.w])));
const Ab=PS.bruchSimulieren(G, A, 10, 1.3, X), Fb=PS.fenster(G, Ab, {w:[1.3], n:50, abstand:0.5, rand:2, minErf:1});
chk('(b) fenster meidet Schnitte (rand)', Fb.length>0 && Fb.every(f=>f.t0+f.w<=Ab.sim.tB-2 || f.t0>=Ab.sim.tB+2), `${Fb.length} Fenster`);

const Fs=PS.fenster(G, A, {w:[1.3], n:50, abstand:0.5, rand:2, minErf:1, spannen:[{t0:10, t1:20}, {t0:30, t1:34}]});
chk('(b) fenster mit spannen (--nurRef): nur Fenster ganz in einer Spanne (mit rand)', Fs.length>0 && Fs.every(f=>(f.t0-2>=10 && f.t0+f.w+2<=20) || (f.t0-2>=30 && f.t0+f.w+2<=34)), `${Fs.length} Fenster`);

// ---- (c) T1 --karte
const oK=T1.optionenAus(T1.argumente(['x', '--karte', '{"abReg":{"gierRaster":true}}']));
chk('(c) T1 --karte: JSON an G.karteNeu, abReg.gierRaster vorgegeben aus', oK.karte && oK.karte.abReg.gierRaster===true && !('karte' in T1.optionenAus(T1.argumente(['x'])))
  && G.karteNeu({}).opt.abReg.gierRaster===false && G.karteNeu(oK.karte).opt.abReg.gierRaster===true && G.karteNeu(oK.karte).opt.abReg.minErf===4);

// ---- (f) Gyro (Doku 12.8): gyroSim an der synthetischen Aufnahme (Achsen um z gedreht, Rauschen, Drift); T1 imuGier findet
// die Zuordnung, imuPsi folgt dem Blick; ueber das weggeschnittene Fenster die Drehung in der Luecke. M4 gyroBruecke bindet
// die Pause mit dPsi = imuPsi und engem sY; vorhersage 'gedaempft' schiebt die Kamera (vCam); ohne Schalter wie bisher.
{ const Ag=PS.gyroSim(A, {zu:'z90'}), Pg=T1.posenAus(G, Ag), I=Ag._imuGier;
  // Die Kreisbewegung dreht fast nur um die Senkrechte: mehrere Zuordnungen geben dann denselben Blick (z90 oder z90 mit
  // Drehung um y um 180°), geprueft wird die Wirkung (imuPsi), nicht die Matrix; die Zuordnung der Eins waere falsch.
  const ok90=I && !(I.zuordnung[0][0]===1 && I.zuordnung[1][1]===1 && I.zuordnung[2][2]===1);
  // ohne imuPsi duerfen nur Zeilen am Rand sein (Zeitversatz: das Gyro reicht dort nicht bis zur Zeile)
  let fmax=0, nNaN=0; for(let i=1;i<Pg.length;i++){ if(!Number.isFinite(Pg[i].imuPsi)){ nNaN++; continue; } const d=wrap(Pg[i].blick-Pg[i-1].blick); fmax=Math.max(fmax, Math.abs(wrap(Pg[i].imuPsi-d))); }
  if(nNaN>2) fmax=NaN;
  chk('(f) gyroSim + imuGier: Zuordnung nicht die Eins, imuPsi je Zeile wie der Blick (<= 0,1°, Rauschen 0,005 rad/s)', I && I.quelle==='gyro' && ok90 && fmax<0.1*D2R, `rest ${(I.rest/D2R).toFixed(4)}°, max ${(fmax/D2R).toFixed(4)}°`);
  const Av=PS.gyroSim(A, {zu:'z90', versatz:0.08}), Pv=T1.posenAus(G, Av), Iv=Av._imuGier;
  // auf +-20 ms: verrauschte Raten bevorzugen leicht ein verschobenes Fenster, das zwei Abtastwerte mittelt (gemessen +10 ms)
  chk('(f) imuGier findet den Zeitversatz zwischen Gyro und Posen (80 ms auf +-20 ms), Rate und Rest gemeldet', Math.abs(I.versatz)<=0.0201 && Math.abs(Iv.versatz-0.08)<=0.0201 && Iv.rest<0.05*D2R && Math.abs(I.rate-60)<4 && I.abtast>2000 && I.luecken===0,
    `versatz ${(1000*Iv.versatz).toFixed(0)} ms (ohne ${(1000*I.versatz).toFixed(0)} ms), Rest ${(Iv.rest/D2R).toFixed(3)}°, ${I.rate.toFixed(1)} Hz`);
  // Code-Pruefung 12.8: ein Gyro-Aussetzer darf keine Drehung erfinden (vorher: 2 s Luecke -> 115° Scheindrehung)
  const Aa={...Ag, imu:Ag.imu.filter(x=>!(x.t>10 && x.t<12)).map(x=>x.t>=12 && x.t<12.02 ? {...x, w:[1, 1, 1]} : x), _imuGier:undefined}, Pa=T1.posenAus(G, Aa), Ia=Aa._imuGier;
  const inL=Pa.filter(p=>p.t>10.05 && p.t<=11.95), aussen=Pa.filter((p,i)=>i>0 && i<Pa.length-1 && (p.t<=9.9 || p.t>=12.1));
  chk('(f) Gyro-Aussetzer 2 s: Zeilen darin ohne imuPsi (keine Scheindrehung), ausserhalb weiter, Bericht zaehlt die Luecke', Ia && inL.length>30 && inL.every(p=>!Number.isFinite(p.imuPsi))
    && aussen.every(p=>Number.isFinite(p.imuPsi)) && Ia.luecken===1 && Math.abs(Ia.groessteLuecke-2)<0.05 && Ia.ohnePsi>=inL.length,
    `${inL.length} Zeilen in der Luecke, ohne imuPsi ${Ia && Ia.ohnePsi}, groesste Luecke ${Ia && Ia.groessteLuecke.toFixed(2)} s`);
  // nachgebildeter Gyro ueber einen echten Schnitt (hier der simulierte Bruch als Teil der Aufnahme): dort kein Wert, keine Bruecke
  const Ae=PS.gyroSim(PS.bruchSimulieren(G, A, 20, 1.3, X)), Pe=T1.posenAus(G, Ae), ie=Pe.findIndex(p=>p.t>=21.3), Se=G.sessionCuts(Pe, Ae.breaks, Ae.events, {gyroBruecke:true}, null);
  chk('(f) gyroSim ueber einen echten Schnitt: kein Gyro-Wert, imuPsi NaN, Schnitt ohne Gyro-Bindung', !Number.isFinite(Pe[ie].imuPsi) && Se.length===1 && !Se[0].bindung.gyro && Se[0].bindung.dPsi===undefined,
    `Schnitt ${Se.map(c=>c.t+' '+c.klasse).join(', ')}`);
  const Ag2=PS.bruchSimulieren(G, Ag, t0, 4, X), P2=T1.posenAus(G, Ag2), iB=P2.findIndex(p=>p.t>=Ag2.sim.tB), wahr=wrap(P2[iB].blick-P2[iB-1].blick);
  chk('(f) ueber die Luecke (4 s weggeschnitten): imuPsi = Drehung in der Luecke (<= 0,6°: Drift 0,1°/s · 4 s)', Math.abs(wrap(P2[iB].imuPsi-wahr))<0.6*D2R && Math.abs(wahr)>5*D2R, `wahr ${(wahr/D2R).toFixed(2)}°, Gyro ${(P2[iB].imuPsi/D2R).toFixed(2)}°`);
  const S0=G.sessionCuts(P2, Ag2.breaks, Ag2.events, {}, null), Sg=G.sessionCuts(P2, Ag2.breaks, Ag2.events, {gyroBruecke:true}, null), Sv=G.sessionCuts(P2, Ag2.breaks, Ag2.events, {vorhersage:'gedaempft'}, null);
  const c0=S0[0], cg=Sg[0], cv=Sv[0];
  chk('(f) M4 gyroBruecke: Pause mit dPsi = imuPsi, sY = 1° + 0,5°/s · dt, Kette dreht B um dPsi; ohne Schalter unveraendert', c0.klasse==='pause' && c0.bindung.dPsi===undefined && !c0.vCam
    && cg.bindung.gyro===true && Math.abs(cg.bindung.dPsi-wrap(P2[iB].imuPsi))<1e-12 && Math.abs(cg.bindung.sY-(1+0.5*cg.dt)*D2R)<1e-12 && cg.bindung.sY<c0.bindung.sY
    && (()=>{ const B0=[{g0:null}, {g0:null}], Bg=[{g0:null}, {g0:null}]; G.ketteStart(S0, B0); G.ketteStart(Sg, Bg); return Math.abs(wrap(Bg[1].g0.psi-B0[1].g0.psi-cg.bindung.dPsi))<1e-9; })(),
    `dPsi ${(cg.bindung.dPsi/D2R).toFixed(2)}°, sY ${(cg.bindung.sY/D2R).toFixed(2)}° statt ${(c0.bindung.sY/D2R).toFixed(1)}°`);
  chk('(f) M4 vorhersage gedaempft: vCam = v · (1 - e^-dt) im Plan, Rest der Kette dort null', cv.vCam && cv.vCam[1]===0 && Math.hypot(cv.vCam[0], cv.vCam[2])>0.05
    && (()=>{ const B=[{g0:null}, {g0:null}]; G.ketteStart(Sv, B); B[0].g=B[0].g0; B[1].g=B[1].g0; const r=G.resKette(cv, B[0].g0, B[1].g0).r; return Math.hypot(r[0], r[1])<1e-9; })(),
    `|vCam| ${(100*Math.hypot(cv.vCam[0], cv.vCam[2])).toFixed(1)} cm`); }

// ---- (d) orakelAus --spiegel ja (A6)
const SPAD='/private/tmp/claude-501/-Volumes-external-TobiCodetEndlichWieder-Zaene/86e1205e-9d6d-494b-b0b6-88f6e01be4b0/scratchpad';
const [tar, prot]=(process.env.A6 || `${SPAD}/a6/aufnahme6.tar,${SPAD}/a6/protokoll6.json`).split(',');
if(existsSync(tar) && existsSync(prot) && existsSync(T1.WAHRHEIT)){
  const A6=T1.ladeQuelle(tar, {protokoll:prot}), posen=T1.posenAus(G, A6), erf=T1.erfassungenAus(A6, posen, 'app'), S=G.sessionCuts(posen, A6.breaks, A6.events, {}, null), H=A6.hLaserMm/1000;
  const segD=(p,a,b)=>{ const dx=b[0]-a[0], dy=b[1]-a[1], l2=dx*dx+dy*dy, t=l2>0 ? Math.max(0, Math.min(1, ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2)) : 0; return Math.hypot(p[0]-a[0]-t*dx, p[1]-a[1]-t*dy); };
  const hebe=(r)=>{ const t=(H-r.o[1])/r.d[1]; return t>0 && t<25 ? [r.o[0]+t*r.d[0], r.o[2]+t*r.d[2]] : null; };
  const med=sp=>{ const O=T1.orakelAus(G, A6, {spiegel:sp, erfassungen:'app', H}, T1.WAHRHEIT), W=T2.wahrheitLaden(T1.WAHRHEIT, {spiegel:sp==='ja'}), m=[];
    for(const [k, g] of Object.entries(O.g)){ const d=[]; for(const e of erf){ if(G.sectionOf(S, e.t, e.ep)!==+k) continue; for(const r of [e.ra, e.rb]){ const p=hebe(r); if(!p) continue;
        const q=G.gPlan(g, p); d.push(Math.min(...W.waende.map(x=>segD(q, x.a, x.b)))); } }
      d.sort((a,b)=>a-b); m.push(d[d.length>>1]); }
    return {m, n:Object.keys(O.g).length, verh:O.verh}; };
  const ja=med('ja'), nein=med('nein');
  chk('(d) orakelAus --spiegel ja: g legt jeden Orakel-Abschnitt auf die gespiegelte Wahrheit (Median je Abschnitt < 25 cm)', ja.n>=3 && ja.m.every(x=>x<0.25), ja.m.map(x=>(100*x).toFixed(1)).join(' / ')+' cm');
  chk('(d) orakelAus --spiegel nein unveraendert gut, verh je Abschnitt dabei', nein.n===ja.n && nein.m.every(x=>x<0.25) && Object.values(nein.verh).every(Number.isFinite), nein.m.map(x=>(100*x).toFixed(1)).join(' / ')+' cm');
} else offen('(d) orakelAus --spiegel ja an A6', 'A6 oder Wahrheit fehlt (A6=tar,prot)');

// ---- (e) Bildkanten (T1 --bildkanten, M10 opt.kanten): Fenster A6 133,71 s + 1,3 s, Kanten des Bild-Teils (scratchpad).
// Ohne Kanten haengt B nur an der Kette (22,7 cm / 7,6° Pruefstand); mit Kanten (Konsens >= 2, Partner verbunden, Plan fest)
// verbunden ueber 'bild' und deutlich naeher. Ohne die Kantendatei OFFEN.
const KANTEN=process.env.KANTEN_A6 || '/private/tmp/claude-501/-Volumes-external-TobiCodetEndlichWieder-Zaene/15a5833a-eb10-4375-9448-54f0729a9a0f/scratchpad/bildkanten/a6.json';
if(existsSync(tar) && existsSync(prot) && existsSync(KANTEN)){
  const A6=T1.ladeQuelle(tar, {protokoll:prot}), f={t0:133.71, w:1.3};
  const ohneK=await PS.pruefeFenster(G, A6, f, {}), mitK=await PS.pruefeFenster(G, A6, f, {t1:[...PS.DEF.t1, '--bildkanten', KANTEN, '--bildkanten-sift']});
  chk('(e) Bildkanten: B ueber Bild verbunden (Konsens >= 2), naeher als die Kette', mitK.bindungArtB==='bild' && mitK.kanteN>=2 && mitK.stufeB==='verbunden' && mitK.dP<ohneK.dP && Math.abs(mitK.dPsiDeg)<Math.abs(ohneK.dPsiDeg) && mitK.dP<0.12,
    `ohne ${(100*ohneK.dP).toFixed(1)} cm / ${ohneK.dPsiDeg.toFixed(1)}° (${ohneK.quelleB}), mit ${(100*mitK.dP).toFixed(1)} cm / ${mitK.dPsiDeg.toFixed(1)}° (${mitK.bindungArtB}, n ${mitK.kanteN})`);
  chk('(e) ohne --bildkanten: M10 opt.kanten null, keine Bildbindung', ohneK.bindungArtB!=='bild' && G.karteNeu({}).opt.kanten===null);
} else offen('(e) Bildkanten an A6', 'A6 oder Kantendatei fehlt (KANTEN_A6=...)');

console.log(out.join('\n'));
console.log(ok ? `\nALLE CHECKS GRÜN${nOffen ? ` (${nOffen} offen)` : ''}` : '\nROT');
process.exit(ok ? 0 : 1);
