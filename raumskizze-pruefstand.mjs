// Pruefstand "simulierter Bruch" (Doku 12.8): misst, ob die Karte zwei Abschnitte nach einem harten ARCore-Bruch richtig
// zueinander legt, ohne Orakel. Die Einzelpassungen je Abschnitt (T1 orakelAus) taugen dafuer nicht (12.8: fast alle
// mehrdeutig, die Haelften desselben Abschnitts liegen 88-179 Grad auseinander). Statt dessen ein Bruch mit bekannter Wahrheit:
// mitten in einem ruhigen Abschnitt (kein Schnitt im Fenster und 4 s davor/danach) faellt das Zeitfenster [t0, t0+w) weg
// (Zeilen, Erfassungen, Anker, Ebenen), und alles danach liegt in einem neuen ARCore-Rahmen: Pose und Bezug T werden mit
// derselben starren Abbildung X (Gier, Lage) umgerechnet, so wie ARCore nach einem Ortungsverlust eine neue Karte beginnt.
// Dazu der Bruch 'pausiert' und die Ereignisse einer echten Pause (tracking-verloren/-zurueck, anker-verloren, bezug-ersatz).
// Im Bezug aendert X nichts (Kamera = T^-1 · Pose, Strahlen der Erfassungen liegen im Bezug): beide Seiten haben vorher
// denselben Bezug, die wahre Relativlage der Abschnitte vor und nach dem Fenster ist darum die Einheit (bis auf die Drift
// von ARCore im Abschnitt). Die Kette (Kamera stetig) liegt um die Bewegung im Fenster daneben, wie bei einer echten Pause.
// Gemessen am Ende des Laufs (letzter Stand): g_A, g_B der Abschnitte beiderseits; Fehler an der Kamera der ersten Zeile
// nach dem Fenster: Lage |g_A(c) - g_B(c)| im Plan, Hoehe, Gier g_B.psi - g_A.psi; dazu Stufe und Quelle von B.
//
//   node raumskizze-pruefstand.mjs --aufnahme A6=a6.tar,protokoll6.json [--aufnahme A7=...] [--H 2.416] [--w 1.3,4]
//        [--n 8] [--abstand 10] [--aus ordner] [--t1 "--quelle erfassungen --ohne tiefe,ebenen"] [--X 40,1.3,-0.8] [--gyro sim]
//
// Vorgabe der T1-Optionen wie live (KARTE_OPT, Stand 7): --quelle erfassungen --ohne tiefe,ebenen. Mit --t1 lassen sich
// Verfahren gegeneinander messen (gleiche Fenster, gleiche Aufnahme). Ein Lauf je Fenster, nacheinander (T1 ~15 s).
import {writeFileSync, mkdirSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as T1 from './raumskizze-karte.mjs';

export const VERSION=1;
const D2R=Math.PI/180, R2D=180/Math.PI;
const wrap=a=>Math.atan2(Math.sin(a), Math.cos(a));
const q=(a,p)=>{ if(!a.length) return NaN; const s=Float64Array.from(a).sort(); return s[Math.min(s.length-1, Math.floor(p*s.length))]; };
export const DEF={w:[1.3, 4], n:8, abstand:10, rand:4, minErf:6, X:{psiDeg:40, tx:1.3, tz:-0.8}, t1:['--quelle', 'erfassungen', '--ohne', 'tiefe,ebenen'],
  treffer:{p:0.10, psiDeg:2}, falsch:{p:0.30, psiDeg:5}};

// Quaternion-Produkt a ⊗ b, beide [x, y, z, w]
const qMul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1], a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
  a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3], a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];

// A nach dem Fenster [t0, t0+w) in den Rahmen X (g, ARCore-local): Pose p' = X·p (Lage und Drehung), T' = X ∘ T.
// G.gAnw dreht den Plan (x, z) mit c·x - s·z: das ist die Drehung um y mit -psi, also q_X = [0, sin(-psi/2), 0, cos(-psi/2)].
// Rueckgabe eine neue Aufnahme (A bleibt unveraendert) mit sim {t0, w, tB, X, weg}; tB = erste Zeile nach dem Fenster.
export function bruchSimulieren(G, A, t0, w, X0=DEF.X){
  const X={psi:X0.psiDeg*D2R, tx:X0.tx, ty:0, tz:X0.tz}, C=A.C, t1=t0+w, qX=[0, Math.sin(-X.psi/2), 0, Math.cos(-X.psi/2)];
  const rows=[]; let weg=0, tB=null;
  for(const r of A.rows){ const t=r[C.t]; if(t>=t0 && t<t1){ weg++; continue; }
    if(t<t0){ rows.push(r); continue; }
    if(tB==null) tB=t;
    const z=r.slice(), p=G.gAnw(X, [r[C.px], r[C.py], r[C.pz]]), qn=qMul(qX, [r[C.qx], r[C.qy], r[C.qz], r[C.qw]]);
    z[C.px]=p[0]; z[C.py]=p[1]; z[C.pz]=p[2]; z[C.qx]=qn[0]; z[C.qy]=qn[1]; z[C.qz]=qn[2]; z[C.qw]=qn[3];
    const gT=G.gKomp(X, G.gAusT([r[C.Tpsi], r[C.Tx], r[C.Ty], r[C.Tz]]));
    z[C.Tpsi]=-gT.psi; z[C.Tx]=gT.tx; z[C.Ty]=gT.ty; z[C.Tz]=gT.tz;   // G.psiAusTpsi = -Tpsi
    rows.push(z); }
  if(tB==null) throw new Error(`Fenster ${t0}+${w} s: keine Zeile danach`);
  const imFenster=t=>t>=t0 && t<t1;
  const P=A.P ? {...A.P, obs:(A.P.obs||[]).filter(x=>!imFenster(x.t))} : A.P;
  const ev=[...(A.events||[]).filter(e=>!imFenster(e.t)), {t:t0, type:'tracking-verloren', sim:true}, {t:tB, type:'tracking-zurück', luecke:+(tB-t0).toFixed(3), sim:true},
    {t:tB, type:'anker-verloren', sim:true}, {t:tB, type:'bezug-ersatz', grund:'pausiert', sim:true}].sort((a,b)=>a.t-b.t);
  const breaks=[...(A.breaks||[]).filter(b=>!imFenster(b.t)), {t:tB, grund:'pausiert', sim:true}].sort((a,b)=>a.t-b.t);
  // Anker und Ebenen nach dem Fenster liegen im alten Rahmen; der Pruefstand misst ohne sie (live ohnehin aus, KARTE_OPT)
  const tAus=z=>Array.isArray(z) ? z[0] : z && z.t;
  // imu bleibt ganz (der Gyro laeuft durch die Luecke); _imuGier (Cache von T1.posenAus) gilt fuer die alten Zeilen
  return {...A, rows, P, events:ev, breaks, anker:(A.anker||[]).filter(z=>tAus(z)<t0), ebenen:(A.ebenen||[]).filter(z=>tAus(z)<t0),
    segmenteBin:null, video:null, tiefeBuf:null, karte:[], _imuGier:undefined, sim:{t0, w, tB, X:X0, weg}};
}

// Gyro nachgebildet (--gyro sim, Doku 12.8): aus den ARCore-Posen der unveraenderten Aufnahme je Zeile die Drehrate im
// Kamerarahmen (q_{i-1}^-1 ⊗ q_i / dt), als Gyroscope-Zeile {q:'gyro', t, w} zur Zeit der Zeile, mit Rauschen sigma (rad/s je
// Achse), fester Drift bias (rad/s je Achse), Achsen-Zuordnung zu (Geraet -> Kamera: 'eins' oder 'z90', Drehung um z) und
// Zeitversatz versatz (s; der Abtastwert traegt die Zeit t - versatz, T1 imuGier soll versatz wiederfinden).
// Ein echter Gyro misst durch die Luecke; der nachgebildete auch (er entsteht vor dem Wegschneiden).
export function gyroSim(A, o0={}){
  const o={sigma:0.005, bias:[0.002, -0.0015, 0.001], zu:'z90', seed:1, versatz:0, ...o0}, C=A.C;   // versatz s: Gyro-Uhr gegen die Posen
  let s=o.seed>>>0||1; const rnd=()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }, gauss=()=>Math.sqrt(-2*Math.log(rnd()+1e-12))*Math.cos(2*Math.PI*rnd());
  const Zt=o.zu==='z90' ? [[0, 1, 0], [-1, 0, 0], [0, 0, 1]] : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];   // Kamera -> Geraet (transponiert)
  // Ueber echte Schnitte (T-Wechsel, Bruch dazwischen, Luecke > 0,25 s) gaebe q_{i-1}^-1 ⊗ q_i auch den Rahmensprung von ARCore
  // wieder, den ein echter Gyro nicht misst: dort kein Abtastwert (imuPsi fehlt, die Bruecke greift nicht).
  const tBr=(A.breaks||[]).map(x=>x.t).filter(Number.isFinite).sort((x,y)=>x-y), bruchZw=(t0,t1)=>tBr.some(t=>t>t0 && t<=t1);
  const imu=[]; for(let i=1;i<A.rows.length;i++){ const a=A.rows[i-1], b=A.rows[i], dt=b[C.t]-a[C.t]; if(!(dt>0) || dt>0.25 || bruchZw(a[C.t], b[C.t])) continue;
    if(a[C.Tpsi]!==b[C.Tpsi] || a[C.Tx]!==b[C.Tx] || a[C.Ty]!==b[C.Ty] || a[C.Tz]!==b[C.Tz]) continue;
    const qa=[a[C.qx], a[C.qy], a[C.qz], a[C.qw]], qb=[b[C.qx], b[C.qy], b[C.qz], b[C.qw]], r=qMul([-qa[0], -qa[1], -qa[2], qa[3]], qb);
    const sg=r[3]<0 ? -1 : 1, v=[sg*r[0], sg*r[1], sg*r[2]], n=Math.hypot(...v), th=2*Math.atan2(n, sg*r[3]), wc=n>1e-12 ? v.map(x=>x/n*th/dt) : [0, 0, 0];
    const wd=Zt.map(z=>z[0]*wc[0]+z[1]*wc[1]+z[2]*wc[2]).map((x,k)=>x+o.bias[k]+o.sigma*gauss());
    imu.push({q:'gyro', t:b[C.t]-o.versatz, w:wd}); }
  return {...A, imu, _imuGier:undefined};
}

// Fenster: in ruhigen Abschnitten (Schnitte der unveraenderten Aufnahme wie M4 sie setzt) mit >= minErf Erfassungen
// beiderseits im selben Abschnitt, rand s Abstand zu jedem Schnitt, Fenster mindestens abstand s auseinander, je w hoechstens n
// (gleichmaessig ueber die Kandidaten verteilt). Rueckgabe [{t0, w, ab, nA, nB}].
// o.spannen [{t0, t1}] (--nurRef): nur Fenster ganz in einer dieser Zeitspannen (je rand s Abstand), etwa die Abschnitte, die in der
// Grundlinie Kern sind oder ueber eine Bindung an ihm haengen: dann gehoert A zur Referenz, und die Wahrheit B = A gilt auch fuer
// Verfahren, die B auf die Referenz legen (Z13, Gier-Raster, Achsen, Bildkanten), nicht nur fuer solche, die B an A binden.
export function fenster(G, A, o0={}){
  const o={...DEF, ...o0}, posen=T1.posenAus(G, A), S=G.sessionCuts(posen, A.breaks, A.events, {}, null), erf=T1.erfassungenAus(A, posen, 'app');
  const tC=S.map(c=>c.t), tE=posen.length ? [posen[0].t, posen[posen.length-1].t] : [0, 0], abE=erf.map(e=>G.sectionOf(S, e.t, e.ep)), out=[];
  for(const w of o.w){ const kand=[];
    for(let t0=tE[0]+o.rand; t0+w<=tE[1]-o.rand; t0+=0.5){
      if(tC.some(t=>t>t0-o.rand && t<t0+w+o.rand)) continue;
      if(o.spannen && !o.spannen.some(sp=>t0-o.rand>=sp.t0 && t0+w+o.rand<=sp.t1)) continue;
      const i=posen.findIndex(p=>p.t>=t0); if(i<1) continue; const ab=G.sectionOf(S, posen[i-1].t, posen[i-1].ep);
      const nA=erf.filter((e,j)=>abE[j]===ab && e.t<t0).length, nB=erf.filter((e,j)=>abE[j]===ab && e.t>=t0+w).length;
      if(nA>=o.minErf && nB>=o.minErf) kand.push({t0:+t0.toFixed(2), w, ab, nA, nB}); }
    const frei=[]; for(const k of kand) if(frei.every(f=>Math.abs(f.t0-k.t0)>=o.abstand)) frei.push(k);
    const n=Math.min(o.n, frei.length); for(let j=0;j<n;j++) out.push(frei[Math.floor((j+0.5)*frei.length/n)]); }
  return out;
}

// Ein Fenster: Bruch simulieren, T1 laufen lassen, Relativlage der Abschnitte beiderseits gegen die Einheit.
export async function pruefeFenster(G, A, f, o0={}){
  const o={...DEF, ...o0}, A2=bruchSimulieren(G, A, f.t0, f.w, o.X), a=T1.argumente(['x', ...o.t1]), oT=T1.optionenAus(a);
  if(Number.isFinite(o.H)) oT.H=o.H;
  const t0=performance.now(), lauf=await T1.laufen(G, A2, oT), ms=performance.now()-t0;
  const P=lauf.posen, S=lauf.KZ.schnitte, AB=lauf.letzte.stand.abschnitte;
  const iB=P.findIndex(p=>p.t>=A2.sim.tB), za=P[iB-1], zb=P[iB];
  const abA=G.sectionOf(S, za.t, za.ep), abB=G.sectionOf(S, zb.t, zb.ep), sA=AB[abA], sB=AB[abB], cut=S.find(c=>c.t>=za.t-1e-9 && c.t<=zb.t+1e-9) || null;
  const r={t0:f.t0, w:f.w, tB:A2.sim.tB, luecke:+(zb.t-za.t).toFixed(3), weg:A2.sim.weg, abA, abB, klasse:cut ? cut.klasse : null, ms:Math.round(ms),
    stufeA:sA ? sA.stufe : null, stufeB:sB ? sB.stufe : null, quelleB:sB ? sB.quelle : null, gA:sA && sA.g, gB:sB && sB.g, bewegung:null, dP:null, dH:null, dPsiDeg:null, urteil:null};
  // Bewegung im Fenster (Kamera im Bezug, unveraendert): das ist der Fehler der Kette ohne weitere Hilfe
  if(za.cam && zb.cam) r.bewegung={p:Math.hypot(zb.cam[0]-za.cam[0], zb.cam[2]-za.cam[2]), psiDeg:wrap(zb.blick-za.blick)*R2D};
  // Nachregistrierung (19.2 Z13) und Gier-Raster (12.8) des Abschnitts B, falls gelaufen
  const KB=lauf.KZ.abschnitte[abB];
  if(KB && KB.abReg) r.abReg={angenommen:!!KB.abReg.angenommen, grund:KB.abReg.grund || null, dpsiDeg:Number.isFinite(KB.abReg.dpsi) ? KB.abReg.dpsi*R2D : null, nErf:KB.abReg.nErf};
  if(KB && KB.gierRaster){ const {delta, ...gr}=KB.gierRaster; r.gierRaster=gr; }
  if(KB && KB.achsReg) r.achsReg=KB.achsReg;
  // Raumrichtung (mod 90°) von A und B gegen den Kern im Endstand: Erfassungen je Abschnitt mit g in F0; die Richtung einer
  // gehobenen Erfassung haengt nicht von H ab (beide Enden skalieren von derselben Kamera aus). Ein Verfahren, das B auf den Kern
  // legt, kann gegen A nicht besser sein als A selbst gegen den Kern liegt.
  const kern=lauf.KZ.kern, man=ab=>{ const s=AB[ab]; if(!s || !s.g) return null; let C=0, Sn=0, L=0;
    for(const e of lauf.erf){ if(G.sectionOf(S, e.t, e.ep)!==ab) continue; const h=rr=>{ const t=(2.4-rr.o[1])/rr.d[1]; return t>0 && t<25 ? G.gPlan(s.g, [rr.o[0]+t*rr.d[0], rr.o[2]+t*rr.d[2]]) : null; };
      const a=h(e.ra), b=h(e.rb); if(!a || !b) continue; const dx=b[0]-a[0], dz=b[1]-a[1], l=Math.hypot(dx, dz), th=4*Math.atan2(dz, dx); C+=l*Math.cos(th); Sn+=l*Math.sin(th); L+=l; }
    return L>0 ? {phi:Math.atan2(Sn, C)/4, R:Math.hypot(C, Sn)/L, L} : null; };
  const w90=a=>{ const v=Math.PI/2; let d=((a%v)+v)%v; return d>v/2 ? d-v : d; };
  const mK=kern!=null ? man(kern) : null, mA=man(abA), mB=man(abB);
  r.kern=kern; r.quelleA=sA ? sA.quelle : null; r.bindungArtB=KB ? KB.bindungArt || null : null; r.kanteN=KB && KB.kanteN || null;
  r.aInRef=!!(sA && sA.stufe==='verbunden' && (sA.quelle==='kern' || sA.quelle==='bindung'));
  r.raumA=mK && mA ? w90(mA.phi-mK.phi)*R2D : null; r.raumB=mK && mB ? w90(mB.phi-mK.phi)*R2D : null;
  if(abA===abB) r.urteil='kein-schnitt';
  else if(!sA || !sB || !sA.g || !sB.g) r.urteil='ohne-lage';
  else { const c=zb.cam || [0, 0, 0], pA=G.gAnw(sA.g, c), pB=G.gAnw(sB.g, c);
    r.dP=Math.hypot(pA[0]-pB[0], pA[2]-pB[2]); r.dH=pB[1]-pA[1]; r.dPsiDeg=wrap(sB.g.psi-sA.g.psi)*R2D;
    // an den Waenden von B (gehobene Enden der Erfassungen von B, H 2,4 im Bezug): dort wirkt ein Gierfehler mit dem Hebel
    const dW=[]; for(const e of lauf.erf){ if(G.sectionOf(S, e.t, e.ep)!==abB) continue; for(const rr of [e.ra, e.rb]){ const tt=(2.4-rr.o[1])/rr.d[1]; if(!(tt>0 && tt<25)) continue;
        const p=[rr.o[0]+tt*rr.d[0], rr.o[2]+tt*rr.d[2]], a=G.gPlan(sA.g, p), b=G.gPlan(sB.g, p); dW.push(Math.hypot(a[0]-b[0], a[1]-b[1])); } }
    r.dPWand=dW.length ? q(dW, 0.5) : null;
    const ad=Math.abs(r.dPsiDeg);
    r.urteil=sB.stufe==='lose' ? 'lose' : r.dP<=o.treffer.p && ad<=o.treffer.psiDeg ? 'treffer' : r.dP>o.falsch.p || ad>o.falsch.psiDeg ? 'falsch' : 'mittel'; }
  return r;
}

export function zusammenfassung(R){
  const z={n:R.length, treffer:0, mittel:0, falsch:0, lose:0, sonst:0}, dP=[], dPsi=[], kette=[], dW=[];
  for(const r of R){ if(r.urteil in z) z[r.urteil]++; else z.sonst++;
    if(Number.isFinite(r.dP)){ dP.push(r.dP); dPsi.push(Math.abs(r.dPsiDeg)); }
    if(Number.isFinite(r.dPWand)) dW.push(r.dPWand);
    if(r.bewegung) kette.push(r.bewegung.p); }
  return {...z, dPmed:q(dP, 0.5), dPp90:q(dP, 0.9), dPsiMed:q(dPsi, 0.5), dPsiP90:q(dPsi, 0.9), bewegungMed:q(kette, 0.5), wandMed:q(dW, 0.5), wandP90:q(dW, 0.9)};
}
const cm=x=>Number.isFinite(x) ? (100*x).toFixed(1) : '–', g1=x=>Number.isFinite(x) ? x.toFixed(1) : '–';
export function tabelle(name, R){
  const L=[`## ${name}`, '', '| t0 | w | Lücke | Bewegung im Fenster | Klasse | Stufe B | Quelle B | Lage | an den Wänden | Höhe | Gier | Urteil |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for(const r of R) L.push(`| ${r.t0} | ${r.w} | ${r.luecke} | ${r.bewegung ? cm(r.bewegung.p)+' cm / '+g1(r.bewegung.psiDeg)+'°' : '–'} | ${r.klasse || '–'} | ${r.stufeB || '–'} | ${r.quelleB || '–'} | ${cm(r.dP)} cm | ${cm(r.dPWand)} cm | ${cm(r.dH)} cm | ${g1(r.dPsiDeg)}° | ${r.urteil}${r.fehler ? ' ('+r.fehler+')' : ''} |`);
  const z=zusammenfassung(R);
  L.push('', `${z.n} Fenster (A in Referenz ${R.filter(r=>r.aInRef).length}): Treffer ${z.treffer} (≤ ${DEF.treffer.p*100} cm, ≤ ${DEF.treffer.psiDeg}°), mittel ${z.mittel}, falsch ${z.falsch} (> ${DEF.falsch.p*100} cm oder > ${DEF.falsch.psiDeg}°), lose ${z.lose}, sonst ${z.sonst}; Lage Median ${cm(z.dPmed)} / p90 ${cm(z.dPp90)} cm, an den Wänden ${cm(z.wandMed)} / ${cm(z.wandP90)} cm, Gier Median ${g1(z.dPsiMed)} / p90 ${g1(z.dPsiP90)}°; Bewegung im Fenster Median ${cm(z.bewegungMed)} cm`, '');
  return L.join('\n');
}

function argumente(argv){ const a={aufnahme:[]};
  for(let i=0;i<argv.length;i++){ const k=argv[i]; if(!k.startsWith('--')) continue; if(k==='--nurRef'){ a.nurRef=true; continue; } const [n, v0]=k.slice(2).split('='), v=v0 ?? argv[++i];
    if(n==='aufnahme') a.aufnahme.push(v); else a[n]=v; }
  return a; }
async function main(){
  const a=argumente(process.argv.slice(2));
  if(!a.aufnahme.length){ console.error('Aufruf: node raumskizze-pruefstand.mjs --aufnahme Name=aufnahme.tar,protokoll.json [...] [--H 2.416] [--w 1.3,4] [--n 8] [--t1 "..."] [--aus ordner]'); process.exit(1); }
  const o={...DEF, ...(a.w ? {w:String(a.w).split(',').map(Number)} : {}), ...(a.n ? {n:+a.n} : {}), ...(a.abstand ? {abstand:+a.abstand} : {}),
    ...(a.rand ? {rand:+a.rand} : {}), ...(a.minErf ? {minErf:+a.minErf} : {}),
    ...(a.t1 ? {t1:String(a.t1).split(/\s+/).filter(Boolean)} : {}), ...(a.H ? {H:+a.H} : {}),
    ...(a.X ? {X:(([p, x, z])=>({psiDeg:+p, tx:+x, tz:+z}))(String(a.X).split(','))} : {})};
  const aus=resolve(a.aus || 'pruefstand'); mkdirSync(aus, {recursive:true});
  const {G}=await T1.ladeSeite({}), L=[`# Prüfstand simulierter Bruch (v${VERSION})`, '', `T1: ${o.t1.join(' ')} · X ${o.X.psiDeg}°, (${o.X.tx}, ${o.X.tz}) m · w ${o.w.join(', ')} s`, ''], alle={};
  for(const s of a.aufnahme){ const [name, rest]=s.split('='), [tar, prot]=rest.split(',');
    const A0=T1.ladeQuelle(resolve(tar), {protokoll:prot ? resolve(prot) : null}), A=a.gyro==='sim' ? gyroSim(A0) : A0;
    // --nurRef: Referenz-Abschnitte aus einem Lauf der Grundlinie (gleiche Fenster fuer alle Verfahren)
    let spannen=null; if(a.nurRef){ const oB=T1.optionenAus(T1.argumente(['x', ...DEF.t1])); if(Number.isFinite(o.H)) oB.H=o.H;
      const LB=await T1.laufen(G, A, oB); spannen=LB.letzte.stand.abschnitte.filter(s=>s.stufe==='verbunden' && (s.quelle==='kern' || s.quelle==='bindung')).map(s=>({t0:s.t0, t1:s.t1, ab:s.ab})); }
    const F=fenster(G, A, {...o, spannen}), R=[];
    // %a im T1-Text = Name der Aufnahme klein (z. B. --bildkanten kanten/%a.json)
    const oA={...o, t1:o.t1.map(x=>x.replace(/%a/g, name.toLowerCase()))};
    for(const f of F){ let r; try{ r=await pruefeFenster(G, A, f, oA); }catch(e){ r={...f, urteil:'fehler', fehler:String(e.message || e).slice(0, 120)}; }
      R.push(r); process.stderr.write(`${name} t0 ${f.t0} w ${f.w}: ${r.urteil} ${cm(r.dP)} cm ${g1(r.dPsiDeg)}°\n`); }
    alle[name]=R; L.push(tabelle(name, R)); }
  const Z=Object.values(alle).flat(); L.push('## Alle', '', tabelle('gesamt', Z).split('\n').slice(-2).join('\n'));
  writeFileSync(join(aus, 'pruefstand.md'), L.join('\n')+'\n'); writeFileSync(join(aus, 'pruefstand.json'), JSON.stringify({version:VERSION, o, alle}, null, 1));
  console.log(L.join('\n'));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(e=>{ console.error(e); process.exit(1); });
