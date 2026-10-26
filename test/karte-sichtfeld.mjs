// Prueft --sichtfeld in T1 raumskizze-karte.mjs (Doku 12.7, Hebel (d): Ablation "Sichtfeld beschneiden") und das Werkzeug
// raumskizze-ablation.mjs mit synthetischen Daten bekannter Wahrheit: (a) Faktor 1 ist wortgleich zum Lauf ohne Option
// (kopf-Pruefsummen, Export), (b) ein 3D-Punkt landet im beschnittenen Bild mit proj' auf derselben Zeile und der um x0
// verschobenen Spalte (auch ungerade Breite 287), Strahlen gleich, (c) Beschneiden von Segmenten gegen das Fenster,
// (d) ndc der Erfassungen, (e) kurze Laeufe mit f = 0.6 auf einer T3-Sitzung und einer Attrappen-Aufnahme mit segmente.bin,
// dazu Video-Ausschnitt, M3-Skala, Kennzahlen, Steigung und ein kleiner Lauf des Werkzeugs (2 Prozesse, eine kaputte Aufnahme).
// Laedt die Seite ueber T1.ladeSeite (alle Module aus dem geo-Block) und T3 fuer die Sitzung.
// Nach der Gegenpruefung dazu: (a) gegen Goldwerte aus HEAD e02f8cc (nicht nur ohne Option gegen sichtfeld 1, das ist derselbe
// Pfad), Beilage wahr mit pp = [0, 0] bei 2 Segmenten, --sichtfeld-erf schneiden (Strahl am Rand gegen G.ray), Kennzahlen
// Anteil/je 1000/nachregistriert, Passungsfilter fuer IoU, Ecken und Waende gefunden, Hinweise in ablation.md, Infinity in
// den JSON-Dateien, Zeitgrenze (SIGKILL), --weiter/--nur-tabelle nur bei gleichen Argumenten, --ohneH und H aus dem Protokoll.
//
//   node test/karte-sichtfeld.mjs
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import * as T1 from '../raumskizze-karte.mjs';
import * as T3 from '../raumskizze-sim.mjs';
import * as AB from '../raumskizze-ablation.mjs';

const out=[]; let ok=true, nOffen=0;
const chk=(name,cond,info='')=>{ ok=ok&&!!cond; out.push((cond?'ok   ':'ROT  ')+name+(info!==''?'  ('+info+')':'')); };
// offen: Pruefung ohne passende Grundlage (Goldwert zu anderen Modulen), sichtbar, nicht im Ergebnis
const offen=(name,info='')=>{ nOffen++; out.push('OFFEN '+name+(info!==''?'  ('+info+')':'')); };
const sha=s=>createHash('sha256').update(s).digest('hex').slice(0, 12), WURZEL=fileURLToPath(new URL('..', import.meta.url));
const D2R=Math.PI/180, R2D=180/Math.PI, PROJ=T3.PROJ_A6, W=287, HH=640;
const e1=x=>Number.isFinite(x) ? x.toExponential(1) : String(x);
const {G, pruef}=await T1.ladeSeite({});
// Goldwerte (a): kopf-Folge und Export mit dem T1 aus HEAD e02f8cc (vor --sichtfeld) gerechnet, Skript wie unten (sitz, Attrappe).
// Sie gelten nur fuer dieselben Eingaben: Module (pruef), Seite und T3; sonst OFFEN und mit HEAD neu setzen.
const GOLD={fp:'5caa95a2b44d', t3:{runden:60, kopf:'4cd8e1ea8b7f', teilen:'de3f2f241b64'}, attrappe:{runden:60, kopf:'4c16309ad0d7', teilen:'b7980f065ef2'}};
const FP=sha(JSON.stringify([Object.entries(pruef).sort(), sha(readFileSync(join(WURZEL, 'raumskizze-probe.html'))), sha(readFileSync(join(WURZEL, 'raumskizze-sim.mjs')))]));
const golden=(name, L, g)=>{ const h={runden:L.runden.length, kopf:sha(kopfFolge(L)), teilen:sha(JSON.stringify(L.teilen))};
  if(FP!==GOLD.fp) offen(`(a) ${name}: Goldwert aus HEAD`, `Eingaben geaendert (fp ${FP} statt ${GOLD.fp}), gerechnet ${JSON.stringify(h)}`);
  else chk(`(a) ${name}: kopf-Folge und Export wie mit dem T1 aus HEAD (Goldwert, vor --sichtfeld)`, h.runden===g.runden && h.kopf===g.kopf && h.teilen===g.teilen, `kopf ${h.kopf}, Export ${h.teilen}`); };
const kopfFolge=L=>L.runden.map(r=>r.kopf.kopf).join(',');
const m4q=(p,[x,y,z,w])=>[1-2*(y*y+z*z), 2*(x*y+z*w), 2*(x*z-y*w), 0,  2*(x*y-z*w), 1-2*(x*x+z*z), 2*(y*z+x*w), 0,
  2*(x*z+y*w), 2*(y*z-x*w), 1-2*(x*x+y*y), 0,  p[0], p[1], p[2], 1];
const kamera=(yaw, pitch, c)=>{ const q1=[0, Math.sin(yaw/2), 0, Math.cos(yaw/2)], q2=[Math.sin(pitch/2), 0, 0, Math.cos(pitch/2)];
  const q=[q1[3]*q2[0]+q1[0]*q2[3]+q1[1]*q2[2]-q1[2]*q2[1], q1[3]*q2[1]-q1[0]*q2[2]+q1[1]*q2[3]+q1[2]*q2[0], q1[3]*q2[2]+q1[0]*q2[1]-q1[1]*q2[0]+q1[2]*q2[3], q1[3]*q2[3]-q1[0]*q2[0]-q1[1]*q2[1]-q1[2]*q2[2]];
  return m4q(c, q); };

// ------------------------------------------------- Fenster und Optionen
{
  const F=[0.8, 0.6, 0.4].map(f=>T1.sichtfeldFenster(W, f, PROJ));
  chk('Fenster 287: symmetrisch, w\' = 229/173/115 ab Spalte 29/57/86, |w\' - round(f·w)| <= 1', F.map(x=>x.w2).join()==='229,173,115' && F.map(x=>x.x0).join()==='29,57,86'
    && F.every((x,i)=>x.w2===W-2*x.x0 && Math.abs(x.w2-Math.round([0.8, 0.6, 0.4][i]*W))<=1), F.map(x=>`${x.w2}@${x.x0}`).join(' '));
  const hv=2*Math.atan(1/PROJ[0])*R2D, soll=F.map(x=>2*Math.atan(Math.tan(hv/2*D2R)*x.w2/W)*R2D);
  chk('Fenster: hFOV voll 34,6°, beschnitten 2·atan(tan(hFOV/2)·w\'/w), Brennweite in px gleich (proj[0]·w/2), proj[5] und proj[8] = 0 unveraendert',
    Math.abs(hv-34.58)<0.01 && F.every((x,i)=>Math.abs(x.hfov[1]-soll[i])<1e-9 && Math.abs(x.proj[0]*x.w2/2-PROJ[0]*W/2)<1e-9 && x.proj[5]===PROJ[5] && x.proj[8]===0
      && x.proj.every((v,j)=>[0, 4, 8, 12].includes(j) || v===PROJ[j])), `${hv.toFixed(2)}° -> ${F.map(x=>x.hfov[1].toFixed(1)).join('/')}°`);
  chk('Fenster: f = 1 und f nahe 1 (x0 = 0) geben null; f <= 0, f > 1, NaN werfen', T1.sichtfeldFenster(W, 1, PROJ)===null && T1.sichtfeldFenster(W, 0.999, PROJ)===null
    && [0, -0.5, 1.2, NaN].every(f=>{ try{ T1.sichtfeldFenster(W, f, PROJ); return false; }catch(e){ return true; } }));
  const o0=T1.optionenAus(T1.argumente(['x.tar'])), o6=T1.optionenAus(T1.argumente(['x.tar', '--sichtfeld', '0.6'])), o4=T1.optionenAus(T1.argumente(['x.tar', '--sichtfeld=0.4']));
  chk('T1 --sichtfeld: Vorgabe 1 (DEF), 0.6 und =0.4 gelesen', T1.DEF.sichtfeld===1 && o0.sichtfeld===1 && o6.sichtfeld===0.6 && o4.sichtfeld===0.4);
}

// ------------------------------------------------- (b) Projektion: gleiche Zeile, um x0 verschobene Spalte, gleiche Strahlen
{
  let dPx=0, dZeile=0, dStrahl=0, dF32=0, n=0, hinten=0;
  for(const w of [287, 288, 231]) for(const f of [0.8, 0.6, 0.4]) for(const fy of [false, true]){
    const fen=T1.sichtfeldFenster(w, f, PROJ), r=G.KG.rnd(w*100+Math.round(f*10)+(fy ? 7 : 0)), P32=Float32Array.from(fen.proj), V32=Float32Array.from(PROJ);
    for(let i=0;i<60;i++){
      const camTo=kamera(2*Math.PI*r(), (r()-0.5)*1.2, [r()*4, 1+r(), r()*4]), d=0.5+4*r(), ndc=[(r()*2-1)*0.95, (r()*2-1)*0.95];
      const ray=G.ray(PROJ, camTo, ndc[0], ndc[1]); if(!ray){ hinten++; continue; }
      const X=[ray.o[0]+d*ray.d[0], ray.o[1]+d*ray.d[1], ray.o[2]+d*ray.d[2]];
      const pv=G.project(PROJ, camTo, X), pb=G.project(fen.proj, camTo, X); if(!pv || !pb){ hinten++; continue; }
      const uv=G.ndcToPix(pv[0], pv[1], w, HH, fy), ub=G.ndcToPix(pb[0], pb[1], fen.w2, HH, fy);
      dPx=Math.max(dPx, Math.abs(ub[0]-(uv[0]-fen.x0))); dZeile=Math.max(dZeile, Math.abs(ub[1]-uv[1]));
      const rv=G.ray(PROJ, camTo, ...G.pixToNdc(uv[0], uv[1], w, HH, fy)), rb=G.ray(fen.proj, camTo, ...G.pixToNdc(uv[0]-fen.x0, uv[1], fen.w2, HH, fy));
      dStrahl=Math.max(dStrahl, Math.hypot(rv.d[0]-rb.d[0], rv.d[1]-rb.d[1], rv.d[2]-rb.d[2]));
      // wie im BildErgebnis (proj als Float32): Abweichung nur durch die Rundung
      const p32=G.project(P32, camTo, X), v32=G.project(V32, camTo, X), u32=G.ndcToPix(p32[0], p32[1], fen.w2, HH, fy), w32=G.ndcToPix(v32[0], v32[1], w, HH, fy);
      dF32=Math.max(dF32, Math.abs(u32[0]-(w32[0]-fen.x0)), Math.abs(u32[1]-w32[1])); n++; } }
  chk('(b) 3D-Punkt im beschnittenen Bild (proj\', w\'): Spalte = Spalte voll - x0, Zeile gleich (w 287/288/231, f 0.8/0.6/0.4, mit und ohne flipY)', n>=1000 && dPx<1e-9 && dZeile<1e-9,
    `${n} Punkte, Spalte ${e1(dPx)} px, Zeile ${e1(dZeile)} px`);
  chk('(b) Strahl durch dasselbe Pixel (G.pixToNdc, G.ray) im vollen und im beschnittenen Bild gleich', dStrahl<1e-12, e1(dStrahl));
  chk('(b) mit proj als Float32 (BildErgebnis): Abweichung < 1e-3 px', dF32<1e-3, e1(dF32)+' px');
}

// ------------------------------------------------- (c) Segmente gegen das Fenster (287, f 0.6: x0 57, w' 173, Fenster [56,5; 229,5])
{
  const fen=T1.sichtfeldFenster(W, 0.6, PROJ), z={drin:0, geschnitten:0, weg:0}, S=s=>T1.segmentBeschneiden({salience:0.5, kl:3, ...s}, fen, z);
  const gleich=(a,b)=>a && b && ['x1', 'y1', 'x2', 'y2'].every(k=>Math.abs(a[k]-b[k])<1e-12);
  const F=[
    ['ganz drin', {x1:100, y1:10, x2:200, y2:300}, {x1:43, y1:10, x2:143, y2:300}],
    ['ganz draussen links', {x1:0, y1:0, x2:50, y2:100}, null],
    ['ganz draussen rechts', {x1:240, y1:5, x2:286, y2:600}, null],
    ['ein Ende links draussen', {x1:30, y1:100, x2:130, y2:200}, {x1:-0.5, y1:126.5, x2:73, y2:200}],
    ['beide draussen, quer ueber das Fenster', {x1:0, y1:0, x2:286, y2:286}, {x1:-0.5, y1:56.5, x2:172.5, y2:229.5}],
    ['rueckwaerts, rechtes Ende draussen', {x1:250, y1:0, x2:150, y2:100}, {x1:172.5, y1:20.5, x2:93, y2:100}],
    ['senkrecht drin', {x1:100, y1:0, x2:100, y2:600}, {x1:43, y1:0, x2:43, y2:600}],
    ['senkrecht draussen', {x1:40, y1:0, x2:40, y2:600}, null],
    ['beruehrt nur den Rand', {x1:10, y1:0, x2:56.5, y2:50}, null]];
  for(const [name, s, soll] of F){ const r=S(s); chk(`(c) Segment ${name}`, soll===null ? r===null : gleich(r, soll) && r.salience===0.5 && r.kl===3,
    r ? [r.x1, r.y1, r.x2, r.y2].map(v=>+v.toFixed(3)).join(',') : 'weg'); }
  chk('(c) Zaehler drin/geschnitten/weg', z.drin===2 && z.geschnitten===3 && z.weg===4, `${z.drin}/${z.geschnitten}/${z.weg}`);
  const rq=S({x1:0, y1:0, x2:286, y2:286}), na=G.pixToNdc(rq.x1, rq.y1, fen.w2, HH, false), nb=G.pixToNdc(rq.x2, rq.y2, fen.w2, HH, false);
  chk('(c) geschnittene Enden liegen im neuen Bild genau auf x_ndc = -1 bzw. +1', Math.abs(na[0]+1)<1e-12 && Math.abs(nb[0]-1)<1e-12);
  // BildErgebnis (T3-Form) beschneiden: neu eingeteilt wie M3; Strahlen der ganz inneren Segmente wie im vollen Bild
  const camTo=kamera(0.3, 0.35, [1, 1.5, 2]), roh=[{x1:100, y1:500, x2:200, y2:520, sal:0.7}, {x1:10, y1:400, x2:80, y2:420, sal:0.6}, {x1:20, y1:300, x2:270, y2:330, sal:0.5},
    {x1:150, y1:100, x2:152, y2:400, sal:0.4}, {x1:260, y1:200, x2:280, y2:260, sal:0.3}];
  const bi=G.lmSegmente(roh, W, HH, Float32Array.from(PROJ), camTo, false), SG=G.KG.SEG;
  for(let i=0;i<bi.n;i++) bi.seg[i*SG+5]=1+i;                              // sPx kenntlich machen
  const b0={k:3, vi:3, t:1.2, ep:0, camTo:Float64Array.from(camTo), proj:Float32Array.from(PROJ), flipY:false, w:W, h:HH, f:G.fokusPx(PROJ, HH), ...bi, man:new Int8Array(bi.n).fill(-1),
    nTeile:Uint8Array.from([1, 2, 3, 4, 5]), psi0:null, senk:[{top:[0.1, 0.5], bottom:[0.1, -0.5], z:20}, {top:[0.9, 0.5], bottom:[0.9, -0.5], z:20}], ms:{}};
  const wahr={wand:Int16Array.from([10, 11, 12, 13, 14]), kid:Int32Array.from([0, 1, 2, 3, 4]), ab:0, senkKid:[7, 8]}, zb={drin:0, geschnitten:0, weg:0};
  const {b, wahr:w2}=T1.bildErgBeschneiden(G, b0, fen, wahr, zb);
  let dDir=0; for(const [j, i] of [[0, 0], [3, 3]]) for(let c=0;c<6;c++) dDir=Math.max(dDir, Math.abs(b.dir[j*6+c]-bi.dir[i*6+c]));
  chk('(c) BildErgebnis beschneiden: 4 von 5 bleiben (eins ganz rechts weg), w\' 173, proj\', Enden verschoben, nTeile/sPx/wahr/Senkrechte mitgefuehrt',
    b.n===4 && b.w===173 && b.proj[0]===Math.fround(fen.proj[0]) && b.seg[0]===43 && b.seg[SG+0]===-0.5 && Array.from(b.nTeile).join()==='1,2,3,4'
    && [0, 1, 2, 3].map(j=>b.seg[j*SG+5]).join()==='1,2,3,4' && w2.wand.join()==='10,11,12,13' && w2.ab===0 && b.senk.length===1 && Math.abs(b.senk[0].top[0]-0.1*W/173)<1e-12
    && w2.senkKid.join()==='7' && zb.drin===2 && zb.geschnitten===2 && zb.weg===1, `n ${b.n}, drin/geschnitten/weg ${zb.drin}/${zb.geschnitten}/${zb.weg}`);
  chk('(c) BildErgebnis beschneiden: Strahlen und Klasse der ganz inneren Segmente wie im vollen Bild (Float32-Rundung)', dDir<1e-6 && b.cls[0]===bi.cls[0] && b.cls[3]===bi.cls[3], e1(dDir));
  // Beilage wahr wie T3 (pp = [0, 0] hat Laenge 2): bei genau 2 Segmenten darf pp nicht wie ein Segmentfeld ausgewaehlt werden
  const bi2=G.lmSegmente([roh[0], roh[4]], W, HH, Float32Array.from(PROJ), camTo, false), b2={...b0, ...bi2, man:new Int8Array(2).fill(-1), nTeile:Uint8Array.from([1, 1]), senk:null};
  const w3={wand:Int16Array.from([10, 11]), seite:Int8Array.from([1, -1]), ring:Int8Array.from([0, 0]), ecke:Int16Array.from([-1, 3]), kante:Int8Array.from([0, 1]), kid:Int32Array.from([5, 6]),
    ab:0, g:{psi:0}, pp:[0, 0], senkKid:null, senkEcke:null};
  const r2=T1.bildErgBeschneiden(G, b2, fen, w3);
  chk('(c) Beilage wahr: Segmentfelder ausdruecklich (WAHR_SEG), pp = [0, 0] bei 2 Segmenten unveraendert, ab/g/senk* bleiben', r2.b.n===1 && Array.from(r2.wahr.wand).join()==='10'
    && Array.from(r2.wahr.kid).join()==='5' && Array.from(r2.wahr.seite).join()==='1' && r2.wahr.pp.length===2 && r2.wahr.pp.join()==='0,0' && r2.wahr.ab===0 && r2.wahr.g.psi===0
    && r2.wahr.senkKid===null && T1.WAHR_SEG.join()==='wand,seite,ring,ecke,kante,kid', `n ${r2.b.n}, pp ${JSON.stringify(r2.wahr.pp)}`);
}

// ------------------------------------------------- Erfassungen beschneiden (--sichtfeld-erf schneiden)
{
  const fen=T1.sichtfeldFenster(W, 0.6, PROJ), g=fen.w2/W, z={drin:0, geschnitten:0, weg:0}, camTo=kamera(0.7, 0.4, [1.2, 1.4, 2.1]);
  const erf=(a, b)=>({t:1, id:3, ra:G.ray(PROJ, camTo, a[0], a[1]), rb:G.ray(PROJ, camTo, b[0], b[1]), ndc:[a, b], flipY:false});
  const norm=v=>{ const l=Math.hypot(...v); return v.map(x=>x/l); }, dd=(u,v)=>{ const a=norm(u), b=norm(v); return Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]); };
  // erwartet: Schnitt der Bildstrecke mit x = +-g im vollen Bild, y mit demselben Parameter; Strahl wie G.ray im beschnittenen Bild
  const F=[['drin', [-0.3, 0.1], [0.4, 0.2], 'drin'], ['links draussen', [-0.9, 0.05], [0.2, 0.3], 'a'], ['rechts draussen', [0.1, -0.2], [0.95, 0.4], 'b'],
    ['quer, beide draussen', [-0.98, 0.3], [0.97, -0.1], 'ab'], ['beide links draussen', [-0.95, 0], [-0.7, 0.2], null], ['senkrecht draussen', [0.8, -0.5], [0.8, 0.5], null]];
  let dStrahl=0, dNdc=0, alleOk=true;
  for(const [name, a, b, soll] of F){ const e=erf(a, b), r=T1.erfassungBeschneiden(e, fen, PROJ, z);
    if(soll===null){ alleOk=alleOk && r===null; continue; }
    if(!r){ alleOk=false; continue; }
    const rand=(p, q)=>{ const x=Math.sign(p[0])*g, s=(x-p[0])/(q[0]-p[0]); return [x, p[1]+s*(q[1]-p[1])]; };
    const ea=soll.includes('a') ? rand(a, b) : a, eb=soll.includes('b') ? rand(b, a) : b;
    for(const [ist, voll, strahl, orig] of [[r.ndc[0], ea, r.ra, e.ra], [r.ndc[1], eb, r.rb, e.rb]]){
      dNdc=Math.max(dNdc, Math.abs(ist[0]-T1.ndcBeschnitten(voll[0], fen)), Math.abs(ist[1]-voll[1]));
      dStrahl=Math.max(dStrahl, dd(strahl.d, G.ray(fen.proj, camTo, ist[0], ist[1]).d), dd(strahl.d, G.ray(PROJ, camTo, voll[0], voll[1]).d), Math.hypot(...strahl.o.map((v,i)=>v-orig.o[i]))); }
    alleOk=alleOk && r.ndc.every(p=>Math.abs(p[0])<=1) && (soll!=='drin' || (r.ra===e.ra && r.rb===e.rb && !r.beschnitten)) && (soll==='drin' || !!r.beschnitten)
      && (!soll.includes('a') || Math.abs(Math.abs(r.ndc[0][0])-1)<1e-12) && (!soll.includes('b') || Math.abs(Math.abs(r.ndc[1][0])-1)<1e-12); }
  chk('(d) Erfassung beschneiden: Enden auf der Bildstrecke bei |x\'| = 1, Strahl = G.ray(proj\', camTo, ndc\') = G.ray(proj, camTo, ndc), Ursprung gleich; drin unveraendert, ganz draussen null',
    alleOk && dStrahl<1e-9 && dNdc<1e-12 && z.drin===1 && z.geschnitten===3 && z.weg===2, `Strahl ${e1(dStrahl)}, ndc ${e1(dNdc)}, drin/geschnitten/weg ${z.drin}/${z.geschnitten}/${z.weg}`);
}

// ------------------------------------------------- (d) ndc der Erfassungen
{
  let d=0; const fen=T1.sichtfeldFenster(W, 0.6, PROJ);
  for(const x of [-1, -0.7, -0.3, 0, 0.25, 0.6, 0.99]){ const u=G.ndcToPix(x, 0, W, HH, false)[0], u2=G.ndcToPix(T1.ndcBeschnitten(x, fen), 0, fen.w2, HH, false)[0]; d=Math.max(d, Math.abs(u2-(u-fen.x0))); }
  chk('(d) ndc der Erfassung: x\' = x·w/w\' trifft dasselbe Pixel (Spalte - x0); Rand des Ausschnitts bei |x| = w\'/w', d<1e-9 && Math.abs(T1.ndcBeschnitten(fen.w2/W, fen)-1)<1e-15
    && T1.ndcBeschnitten(0, fen)===0, e1(d)+' px');
}

// ------------------------------------------------- Sitzung (T3) und Attrappen-Aufnahme
const erg=T3.sim(T3.WAHRHEIT, {G, ...T3.SITZUNGEN.rund});
const sitz=()=>({art:'sitzung', posen:erg.posen, breaks:erg.breaks, ereignisse:erg.ereignisse, bilder:erg.bilder, erfassungen:erg.erfassungen.map(x=>({...x.erf, wahr:x.wahr})),
  proj:PROJ, w:W, h:HH, hLaserMm:2416, warnungen:[]});
// Attrappen-Aufnahme aus derselben Sitzung (Ordner wie ein ausgepacktes TAR): zustand.jsonl aus den PoseZeilen, segmente.bin aus
// den Segmenten der Bilder (1/8 px), Protokoll mit den Erfassungen und ihren ndc (Projektion eines Punkts auf jedem Strahl).
const tmp=mkdtempSync(join(tmpdir(), 'karte-sichtfeld-')), ordner=join(tmp, 'aufnahme');
const NDC_SOLL={n:0, aussen:0, mit:0};
{
  mkdirSync(ordner);
  const spalten=['t', 'px', 'py', 'pz', 'qx', 'qy', 'qz', 'qw', 'Tpsi', 'Tx', 'Ty', 'Tz', 'flags', 'tempo', 'live', 'v', 'tiefe'];
  writeFileSync(join(ordner, 'manifest.json'), JSON.stringify({format:'raumskizze-aufnahme', version:1, name:'attrappe', geometrie:{proj:PROJ},
    bild:{breite:W, hoehe:HH, gepolstert:[288, HH], flipY:false}, zustand:{datei:'zustand.jsonl', spalten}}));
  writeFileSync(join(ordner, 'zustand.jsonl'), erg.posen.map(p=>JSON.stringify([p.t, ...p.pose, ...p.T, p.flags|0, 0, 0, p.v ?? -1, -1])).join('\n')+'\n');
  const teile=[];
  for(const {bildErg:b} of erg.bilder){ const S=G.KG.SEG, segs=[];
    for(let i=0;i<b.n;i++){ const j=i*S, s=[b.seg[j], b.seg[j+1], b.seg[j+2], b.seg[j+3]]; if(s.every(Number.isFinite)) segs.push(s); }
    const k=Buffer.alloc(14+10*segs.length); k.writeUInt32LE(b.k, 0); k.writeFloatLE(b.t, 4); k.writeUInt16LE(segs.length, 8); k.writeUInt16LE(W, 10); k.writeUInt16LE(HH, 12);
    segs.forEach((s,i)=>{ const o=14+10*i; s.forEach((v,c)=>k.writeInt16LE(Math.round(v*8), o+2*c)); k.writeUInt8(200, o+8); k.writeUInt8(0, o+9); });
    teile.push(k); }
  writeFileSync(join(ordner, 'segmente.bin'), Buffer.concat(teile));
  const fen=T1.sichtfeldFenster(W, 0.6, PROJ), posen=T1.posenAus(G, {rows:erg.posen.map(p=>[p.t, ...p.pose, ...p.T, p.flags|0, 0, 0, p.v ?? -1, -1]), C:Object.fromEntries(spalten.map((k,i)=>[k, i])), breaks:[]});
  const obs=erg.erfassungen.map(x=>{ const e=x.erf, z=posen.reduce((b,p)=>Math.abs(p.t-e.t)<Math.abs(b.t-e.t) ? p : b, posen[0]);
    const camTo=G.m4mul(G.m4inv(G.gMat(G.gAusT(z.T))), m4q(z.pose.slice(0, 3), z.pose.slice(3)));
    // T3 erfasst nur +-7° um die Mitte; jede zweite Erfassung reicht hier wie in A8 bis fast an den Bildrand (|x| bis 0,99)
    const ndc=[e.ra, e.rb].map((r,c)=>{ const p=G.project(PROJ, camTo, [r.o[0]+3*r.d[0], r.o[1]+3*r.d[1], r.o[2]+3*r.d[2]]); const n=p ? [p[0], p[1]] : [0, 0];
      return e.id%2 ? [(c ? 1 : -1)*(0.5+0.49*((e.id*37)%100)/100), n[1]] : n; });
    NDC_SOLL.mit++; NDC_SOLL.n+=2; NDC_SOLL.aussen+=ndc.filter(p=>Math.abs(p[0]*W/fen.w2)>1).length;
    return {t:e.t, ra:e.ra, rb:e.rb, ndc, flipY:false}; });
  writeFileSync(join(ordner, 'protokoll.json'), JSON.stringify({obs, breaks:[], events:[], hLaserMm:2416}));
  mkdirSync(join(tmp, 'kaputt')); writeFileSync(join(tmp, 'kaputt', 'zustand.jsonl'), '');
}

// ------------------------------------------------- (a) Faktor 1 wortgleich
{
  const o={quelle:'beide', bis:30};
  const L0=await T1.laufen(G, sitz(), o), L1=await T1.laufen(G, sitz(), {...o, sichtfeld:1}), L9=await T1.laufen(G, sitz(), {...o, sichtfeld:0.999});
  chk('(a) T3-Sitzung: --sichtfeld 1 (und 0.999, x0 = 0) gibt dieselbe kopf-Folge und denselben Export wie ohne Option', L0.runden.length>=50 && kopfFolge(L0)===kopfFolge(L1)
    && kopfFolge(L0)===kopfFolge(L9) && JSON.stringify(L0.teilen)===JSON.stringify(L1.teilen) && !L1.info.sichtfeld && !L1.fen, `${L0.runden.length} Runden, ${L0.KZ.beob.length} Beob`);
  golden('T3-Sitzung', L0, GOLD.t3);
  // --sichtfeld-erf schneiden ohne Fenster (f = 1) aendert nichts
  const LS=await T1.laufen(G, sitz(), {...o, sichtfeld:1, sichtfeldErf:'schneiden'});
  chk('(a) --sichtfeld-erf schneiden bei f = 1: dieselbe kopf-Folge (kein Fenster, nichts beschnitten); falscher Wert wirft', kopfFolge(LS)===kopfFolge(L0)
    && await (async()=>{ try{ await T1.laufen(G, sitz(), {...o, bis:1, sichtfeldErf:'kappen'}); return false; }catch(e){ return /sichtfeld-erf/.test(e.message); } })());
  const A=()=>T1.ladeQuelle(ordner), og={quelle:'beide', segmente:'geraet', bis:30};
  const G0=await T1.laufen(G, A(), og), G1=await T1.laufen(G, A(), {...og, sichtfeld:1});
  chk('(a) Attrappen-Aufnahme (segmente.bin, Erfassungen mit ndc): --sichtfeld 1 gibt dieselbe kopf-Folge und denselben Export', G0.runden.length>=50 && G0.info.bilder>100
    && kopfFolge(G0)===kopfFolge(G1) && JSON.stringify(G0.teilen)===JSON.stringify(G1.teilen) && JSON.stringify(G0.erf)===JSON.stringify(G1.erf), `${G0.runden.length} Runden, ${G0.info.bilder} Bilder`);
  golden('Attrappen-Aufnahme', G0, GOLD.attrappe);
  // Bericht ohne die Zeile mit den gemessenen Rundenzeiten (ms, Uhr)
  const ohneUhr=t=>t.split('\n').filter(l=>!l.startsWith('Runden ')).join('\n'), B0=ohneUhr(T1.bericht(G0, null, null, {}, {})), B1=ohneUhr(T1.bericht(G1, null, null, {}, {}));
  chk('(a) Bericht bei Faktor 1 ohne Sichtfeld-Zeile und sonst gleich (ohne Rundenzeiten)', B0===B1 && !B1.includes('Sichtfeld'));
}

// ------------------------------------------------- (e) kurze Laeufe mit f = 0.6
{
  const seen=[]; const Gs={...G, karteBild:(KZ, b)=>{ seen.push(b); return G.karteBild(KZ, b); }}, bz=[]; Gs.bildNeu=o=>{ bz.push(o); return G.bildNeu(o); };
  let fehler=null, L=null; try{ L=await T1.laufen(Gs, sitz(), {quelle:'beide', bis:30, sichtfeld:0.6}); }catch(e){ fehler=e.stack; }
  const xs=seen.flatMap(b=>{ const r=[]; for(let i=0;i<b.n;i++) r.push(b.seg[i*G.KG.SEG], b.seg[i*G.KG.SEG+2]); return r; });
  chk('(e) T3-Sitzung f = 0.6 (Quelle beide, 30 s): laeuft ohne Ausnahme, Runden, Bilder 173 breit mit proj\', Segment-Enden im Fenster [-0,5; 172,5]', !fehler && L.runden.length>=50
    && seen.length>100 && seen.every(b=>b.w===173 && Math.abs(b.proj[0]-5.32985)<1e-4) && xs.every(x=>x>=-0.5-1e-4 && x<=172.5+1e-4) && L.info.sichtfeld.seg.weg>0,
    fehler ? fehler.split('\n')[0] : `${L.runden.length} Runden, ${seen.length} Bilder, Segmente drin/geschnitten/weg ${L.info.sichtfeld.seg.drin}/${L.info.sichtfeld.seg.geschnitten}/${L.info.sichtfeld.seg.weg}`);
  chk('(e) M3-Skala: beschnitten bildNeu({skala: 1}) wie das volle Bild (nicht auto = 173/287), bei Faktor 1 bildNeu({})', bz.length===1 && JSON.stringify(bz[0])==='{"skala":1}'
    && (await (async()=>{ const b2=[]; await T1.laufen({...G, bildNeu:o=>{ b2.push(o); return G.bildNeu(o); }}, sitz(), {quelle:'erfassungen', bis:2}); return JSON.stringify(b2)==='[{}]'; })()));
  chk('(e) KZ bekommt proj\' und w\' (Sichtbarkeit in M4/M5 im beschnittenen Bild)', L.KZ.opt.w===173 && Math.abs(L.KZ.opt.proj[0]-5.32985)<1e-4 && L.KZ.opt.h===HH);
  seen.length=0; let fg=null, LG=null; try{ LG=await T1.laufen(Gs, T1.ladeQuelle(ordner), {quelle:'beide', segmente:'geraet', bis:30, sichtfeld:0.6}); }catch(e){ fg=e.stack; }
  const SF=LG && LG.info.sichtfeld;
  chk('(e) Attrappen-Aufnahme f = 0.6 (segmente.bin): laeuft, Bilder 173 breit, Segmente gezaehlt', !fg && LG.runden.length>=50 && seen.length>100 && seen.every(b=>b.w===173)
    && SF.seg.drin+SF.seg.geschnitten+SF.seg.weg>1000 && SF.seg.weg>0, fg ? fg.split('\n')[0] : `drin/geschnitten/weg ${SF.seg.drin}/${SF.seg.geschnitten}/${SF.seg.weg}`);
  chk('(d) Erfassungen im Lauf: alle bleiben drin, ndc umgerechnet, Enden ausserhalb |x\'| > 1 gezaehlt wie unabhaengig nachgerechnet', SF && SF.erfNdc===NDC_SOLL.mit
    && SF.erfEnden===NDC_SOLL.n && SF.erfEndenAussen===NDC_SOLL.aussen && NDC_SOLL.aussen>0 && LG.erf.length===NDC_SOLL.mit, SF ? `${SF.erfEndenAussen} von ${SF.erfEnden} Enden` : '');
  const B=T1.bericht(LG, null, null, {}, {});
  chk('(e) Bericht nennt Faktor, Breite und hFOV', B.includes('Sichtfeld') && B.includes('Faktor 0.6') && B.includes('287 -> 173') && B.includes('21.3°'));
  // --sichtfeld-erf schneiden: dieselben Erfassungen beschnitten, die ganz draussen fallen weg, alle ndc im Fenster
  let fs=null, LS=null; try{ LS=await T1.laufen(G, T1.ladeQuelle(ordner), {quelle:'beide', segmente:'geraet', bis:30, sichtfeld:0.6, sichtfeldErf:'schneiden'}); }catch(e){ fs=e.stack; }
  const SS=LS && LS.info.sichtfeld, ES=SS && SS.erfSchnitt;
  chk('(e) Attrappe f = 0.6 mit --sichtfeld-erf schneiden: laeuft, drin+geschnitten+weg = Erfassungen mit ndc, uebrige |x\'| <= 1, Bericht nennt es', !fs && LS.runden.length>=50
    && ES && ES.drin+ES.geschnitten+ES.weg===SS.erfNdc && ES.geschnitten>0 && LS.erf.length===SS.erfNdc-ES.weg && LS.erf.every(e=>e.ndc.every(p=>Math.abs(p[0])<=1))
    && T1.bericht(LS, null, null, {}, {}).includes('beschnitten: drin/geschnitten/weg'), fs ? fs.split('\n')[0] : `drin/geschnitten/weg ${ES.drin}/${ES.geschnitten}/${ES.weg}`);
  chk('(e) T1 --sichtfeld-erf: Vorgabe lassen, schneiden gelesen', T1.DEF.sichtfeldErf==='lassen' && T1.optionenAus(T1.argumente(['x.tar'])).sichtfeldErf==='lassen'
    && T1.optionenAus(T1.argumente(['x.tar', '--sichtfeld-erf', 'schneiden'])).sichtfeldErf==='schneiden');
}

// ------------------------------------------------- Video-Ausschnitt (bildAusVideo) und Tiefe
{
  const SW=288, fr=new Uint8Array(SW*HH); for(let y=0;y<HH;y++) for(let x=0;x<SW;x++) fr[y*SW+x]=x===287 ? 255 : (x*7+y*3)%250;
  const A={w:W, h:HH, proj:PROJ}, p={t:1, ep:0, T:[0, 0, 0, 0], pose:[1, 1.5, 2, 0, 0, 0, 1]}, fen=T1.sichtfeldFenster(W, 0.6, PROJ), auf=[];
  const Gv={...G, bild:(BZ, a)=>{ auf.push(a); return a; }};
  T1.bildAusVideo(Gv, {}, A, p, {fr, SW}, 4, false, false, fen); T1.bildAusVideo(Gv, {}, A, p, {fr, SW}, 4, false, false);
  const [b, v]=auf, g=new Uint8Array(b.buf), g0=new Uint8Array(v.buf); let falsch=0, falsch0=0;
  for(let y=0;y<HH;y++){ for(let x=0;x<173;x++) if(g[y*173+x]!==fr[y*SW+57+x]) falsch++; for(let x=0;x<W;x++) if(g0[y*W+x]!==fr[y*SW+x]) falsch0++; }
  chk('Video: Ausschnitt = Spalten 57..229 jeder Zeile (Polsterspalte 287 nie), w 173, proj\'; ohne Fenster wie vorher 287 Spalten', falsch===0 && falsch0===0 && b.w===173 && g.length===173*HH
    && !g.includes(255) && b.proj[0]===fen.proj[0] && v.w===W && v.proj[0]===PROJ[0], `${falsch}/${falsch0} falsch`);
  const A2={...T1.ladeQuelle(ordner), tiefeBuf:Buffer.alloc(0)};
  const L=await T1.laufen(G, A2, {quelle:'erfassungen', bis:3, sichtfeld:0.6});
  chk('Tiefe: bei f < 1 erzwungen aus (Warnung, tiefeAus), ohne dass tiefe.bin gelesen wird', L.info.sichtfeld.tiefeAus && L.info.tiefe===0 && !A2.tiefe && L.KZ.opt.ohne.includes('tiefe')
    && L.info.warnungen.some(w=>w.includes('Tiefe ausgelassen')));
}

// ------------------------------------------------- Werkzeug: Kennzahlen, Steigung, Tabelle
{
  const beob=[{id:0, ab:0, L:'w1', nutzer:false, art:'decke'}, {id:1, ab:1, L:'w1', nutzer:false, art:'decke'}, {id:2, ab:0, L:'w2', nutzer:false, art:'boden'},
    {id:3, ab:2, L:'w2', nutzer:true, art:'decke'}, {id:4, ab:1, L:'w3', nutzer:false, art:'decke'}, {id:5, ab:1, L:'w3', nutzer:false, art:'decke'},
    {id:6, ab:3, L:'w4', nutzer:false, art:'decke'}, {id:7, ab:4, L:'w4', nutzer:false, art:'decke'}, {id:8, ab:0, L:'w5', nutzer:false, art:'decke'},
    {id:9, ab:2, L:'w1', nutzer:false, art:'decke'}, {id:10, ab:5, L:'e1', nutzer:false, art:'ecke'}, {id:11, ab:1, L:-1, nutzer:'stoer', art:'decke'}];
  const waende=new Map([['w1', {id:'w1', rahmen:-1, beob:[0, 1]}], ['w2', {id:'w2', rahmen:-1, beob:[2, 3]}], ['w3', {id:'w3', rahmen:-1, beob:[4, 5]}],
    ['w4', {id:'w4', rahmen:3, beob:[6, 7]}], ['w5', {id:'w5', rahmen:-1, beob:[8, 9]}]]);
  const lauf={KZ:{beob, waende, kern:0}, info:{bilder:12, warnungen:[], sichtfeld:null}, A:{proj:PROJ, w:W}, runden:[{}, {}], export:null, hLaser:2.416,
    letzte:{stand:{abschnitte:[{stufe:'verbunden', quelle:'kern'}, {stufe:'verbunden', quelle:'kette'}, {stufe:'lose', quelle:'kette'}, {stufe:'lokal'}], waende:[1, 2, 3, 4], ringe:[],
      hinweise:[{code:'abschnitt-registriert', ab:1}, {code:'abschnitt-kette', ab:1}, {code:'abschnitt-kette', ab:2}, {code:'abschnitte-kette', n:2}]}}};
  const k=AB.kennzahlen(lauf, null);
  chk('Kennzahlen: geteilte Waende (global, Beob mit L = Wand aus >= 2 Abschnitten) alle 2 / nur Segmente 1; lokale Wand und umgehaengte Beob zaehlen nicht',
    k.geteilt===2 && k.geteiltSeg===1 && k.waendeGlobal===4 && k.waendeLokal===1 && k.anteilGeteilt===0.5, `${k.geteilt}/${k.geteiltSeg}`);
  chk('Kennzahlen: Beob nach Art (Segment 9, Ecke 1, Erfassung 2 inkl. stoer), Stufen, hFOV 34,6° ohne Sichtfeld, kein Export, ohne T2 keine gueltige Passung', k.segBeob===9 && k.eckBeob===1 && k.erfBeob===2 && k.passungGueltig===false
    && k.stufen.verbunden===2 && k.stufen.lose===1 && k.stufen.lokal===1 && Math.abs(k.hfov-34.578)<0.01 && k.export===false && k.iou===null && k.fEff===1);
  chk('Kennzahlen (Gegenpruefung): Anteil geteilt nur Seg 1/4, geteilt Seg je 1000 Seg-Beob 1000/9, nachregistriert 1, Kette 2, Quelle je Abschnitt, H, Erf lassen',
    k.anteilGeteiltSeg===0.25 && Math.abs(k.geteiltSegJe1000-1000/9)<1e-9 && k.registriert===1 && k.kette===2 && JSON.stringify(k.abQuelle)==='{"kern":1,"kette":2,"–":1}' && k.hLaser===2.416
    && k.erfModus==='lassen' && k.erfSchnitt===null, `${k.anteilGeteiltSeg} / ${k.geteiltSegJe1000.toFixed(1)} / ${k.registriert} / ${k.kette}`);
  const xs=[34.58, 27.9, 21.25, 14.22], s=AB.steigung(xs, xs.map(x=>3+0.5*x));
  chk('Steigung: y = 3 + 0,5 x exakt (b, a, r2 = 1); null-Werte uebersprungen; < 2 Paare oder ohne Streuung null', Math.abs(s.b-0.5)<1e-12 && Math.abs(s.a-3)<1e-12 && Math.abs(s.r2-1)<1e-12
    && AB.steigung([1, 2, 3], [2, null, 6]).n===2 && Math.abs(AB.steigung([1, 2, 3], [2, null, 6]).b-2)<1e-12 && AB.steigung([1], [1])===null && AB.steigung([2, 2], [1, 3])===null);
  const F4=[1, 0.8, 0.6, 0.4], zeilen=xs.map((x,i)=>({id:'S-beide-f'+F4[i], aufnahme:'S', quelle:'beide', faktor:F4[i], ms:1000, fehler:null,
    k:{...k, hfov:x, fEff:F4[i], iou:0.1+0.02*x, eckenMed:0.3-0.005*x, waendeGefunden:10+0.1*x, geteilt:Math.round(x/5), export:i<2}}));
  // ungueltige Passung (Zeile 1) mit Ausreissern in allem, was an der Lage haengt: darf in keine dieser Steigungen
  zeilen.forEach((z,i)=>{ z.k.beobMed=0.1+0.01*z.k.hfov; z.k.passungGueltig=i!==1; z.k.mehrdeutig=i===1 ? 1.01 : 2.5; if(i===1) Object.assign(z.k, {beobMed:5, iou:5, eckenMed:9, waendeGefunden:99}); });
  zeilen.push({id:'S-beide-f0.2', aufnahme:'S', quelle:'beide', faktor:0.2, ms:10, fehler:'Error: kaputt\n  at x', k:null});
  // Erf schneiden: eigene Gruppe, der volle Lauf (f = 1) kommt aus 'lassen'
  for(const [i, f] of [[2, 0.6], [3, 0.4]]) zeilen.push({id:`S-beide-f${f}-erfS`, aufnahme:'S', quelle:'beide', erf:'schneiden', faktor:f, ms:1000, fehler:null,
    k:{...zeilen[i].k, erfModus:'schneiden', erfSchnitt:{drin:3, geschnitten:4, weg:1}, iou:0.1+0.02*xs[0]+0.03*(xs[i]-xs[0]), erfEnden:16, erfEndenAussen:9}});
  // Gruppe T: Passung nirgends eindeutig, ohne Laser-H, Stufen verschieden
  for(const [i, f] of [[0, 1], [3, 0.4]]) zeilen.push({id:'T-segmente-f'+f, aufnahme:'T', quelle:'segmente', faktor:f, ms:500, fehler:null,
    k:{...k, hfov:xs[i], fEff:f, passungGueltig:false, mehrdeutig:1.01, iou:0.12, hLaser:null, stufen:{verbunden:i, locker:0, lose:0, lokal:4-i}}});
  const st=AB.steigungen(zeilen), md=AB.tabelleMd(zeilen, st), sL=st.find(g=>g.aufnahme==='S' && g.erf==='lassen'), sS=st.find(g=>g.erf==='schneiden'), sT=st.find(g=>g.aufnahme==='T');
  chk('Steigungen je Aufnahme und Quelle je 10°: IoU 0,2 (y = 0,1 + 0,02 x), Fehlerzeile ignoriert; Beob Median nur mit gueltiger Passung (0,1)', st.length===3 && sL.n===4 && Math.abs(sL.je10Grad.iou-0.2)<1e-9
    && sL.je10Grad.exportZahl>0 && Math.abs(sL.je10Grad.beobMed-0.1)<1e-9 && md.includes('(500.0)'), `${sL.je10Grad.iou} / ${sL.je10Grad.beobMed}`);
  chk('Steigungen (Gegenpruefung): IoU, Ecken, Waende gefunden nur mit gueltiger Passung (Ausreisser ohne Wirkung, n 3 von 4), Anteil geteilt in der Steigung',
    Math.abs(sL.je10Grad.eckenMed+0.05)<1e-9 && Math.abs(sL.je10Grad.waendeGefunden-1)<1e-9 && sL.nJe.iou===3 && sL.nJe.waendeGefunden===3 && sL.nJe.geteilt===4 && sL.nGueltig===3
    && Math.abs(sL.je10Grad.anteilGeteilt)<1e-12 && ['anteilGeteilt', 'anteilGeteiltSeg', 'geteiltSegJe1000', 'registriert'].every(x=>AB.STEIGUNG.some(([y])=>y===x))
    && sT.je10Grad.iou===null && sT.nJe.iou===0, `Ecken ${sL.je10Grad.eckenMed}, Waende ${sL.je10Grad.waendeGefunden}, n ${sL.nJe.iou}`);
  chk('Steigungen: Gruppe Erf schneiden nimmt den vollen Lauf aus lassen (f = 1), IoU 0,3 je 10°', sS && sS.n===3 && sS.ids.join()==='S-beide-f1,S-beide-f0.6-erfS,S-beide-f0.4-erfS'
    && Math.abs(sS.je10Grad.iou-0.3)<1e-9 && sS.erf==='schneiden', sS ? sS.ids.join(' ') : 'keine Gruppe');
  const zl=md.split('\n');
  chk('Tabelle: eine Zeile je Lauf, Fehlerzeile mit erster Zeile der Meldung, Steigungstabelle', zl.filter(l=>l.startsWith('| S |')).length===9 && md.includes('Error: kaputt |')
    && !md.includes('at x') && md.includes('## Steigung'));
  chk('Tabelle (Gegenpruefung): an der Passung in Klammern (IoU, Ecken, Waende gef.), (n 3) in der Steigung, Vorab-Hinweise: Stufen gleich, Passung nirgends eindeutig, ohne Laser-H, Absolutzahlen-Lesart',
    zl.some(l=>l.startsWith('| S | beide | lassen | 0.8 |') && l.includes('| (5.00) | (900.0) | (99) |') && l.includes('| 1.01 |')) && zl.some(l=>l.startsWith('| S | beide | lassen | 4 |') && l.includes('(n 3)'))
    && md.includes('S/beide/lassen: Stufen bei allen Faktoren gleich (2/0/1/1)') && md.includes('T/segmente/lassen: Passung in keinem Lauf eindeutig') && !md.includes('S/beide/lassen: Passung in keinem')
    && !md.includes('T/segmente/lassen: Stufen') && md.includes('ohne Laser-H: T (') && md.includes('Absolutzahlen') && zl.some(l=>l.includes('| schneiden |') && l.includes('9/16 (geschnitten 4, weg 1)')));
  const a=AB.argumente(['--aufnahme', 'A6=/x/a6.tar,/x/p6.json', '--aufnahme=A7=/x/a7', '--faktoren', '1,0.5', '--jobs', '2', '--aus', '/tmp/x', '--t1', '--bis 20 --metrik export', '--weiter']);
  chk('Werkzeug: Argumente (mehrfach --aufnahme, Protokoll optional, Faktoren, Quellen-Vorgabe, --t1 durchgereicht, --ohne tiefe,ebenen als Vorgabe)', a.aufnahmen.length===2
    && a.aufnahmen[0].protokoll==='/x/p6.json' && a.aufnahmen[1].src==='/x/a7' && a.aufnahmen[1].protokoll===null && a.faktoren.join()==='1,0.5' && a.jobs===2 && a.weiter
    && a.quellen.join()==='segmente,beide,erfassungen' && a.ohne.join()==='tiefe,ebenen' && a.t1.join(' ')==='--bis 20 --metrik export');
  const argSicher=v=>{ try{ return AB.argumente(v); }catch(e){ return {fehler:e.message}; } };   // vorher schluckte --ohneH das naechste Argument und warf
  const b1=argSicher(['--aufnahme', 'A8=/x.tar', '--aus', '/tmp/y', '--ohneH']), b2=argSicher(['--aufnahme', 'A8=/x.tar', '--ohneH', '--jobs', '2', '--aus', '/tmp/y']);
  const b3=AB.argumente(['--aufnahme', 'A8=/x.tar', '--aus', '/tmp/y', '--erf', 'lassen,schneiden', '--zeitgrenze', '60', '--H', '2.5']);
  chk('Werkzeug: --ohneH am Ende und in der Mitte (H null, nichts geschluckt), Vorgabe H aus dem Protokoll (undefined), --erf, --zeitgrenze, --H', b1.H===null && b2.H===null && b2.jobs===2
    && b2.aus==='/tmp/y' && a.H===undefined && AB.DEF.H===undefined && b3.erf.join()==='lassen,schneiden' && b3.zeitgrenze===60 && b3.H===2.5 && a.erf.join()==='lassen' && a.zeitgrenze===1800,
    `H ${b1.H} / ${b2.H ?? b2.fehler}`);
  const au={src:'/x.tar', protokoll:'/p.json', quelle:'beide', faktor:0.6, erf:'lassen', ohne:['tiefe']};
  chk('Werkzeug: T1-Argumente (H null -> --ohneH, H fehlt -> nichts, H -> --H, schneiden -> --sichtfeld-erf schneiden)', AB.t1Argv({...au, H:null}).includes('--ohneH')
    && !AB.t1Argv(au).some(x=>x==='--H' || x==='--ohneH') && AB.t1Argv({...au, H:2.416}).join(' ').includes('--H 2.416') && AB.t1Argv({...au, erf:'schneiden'}).join(' ').includes('--sichtfeld-erf schneiden')
    && T1.optionenAus(T1.argumente(AB.t1Argv({...au, H:null}))).H===null && T1.optionenAus(T1.argumente(AB.t1Argv({...au, H:null}))).quelle==='beide');
  const A=AB.auftraege({...AB.DEF, aufnahmen:[{name:'S', src:'/x.tar'}], aus:'/tmp/y', faktoren:[1, 0.6], quellen:['segmente', 'beide'], erf:['lassen', 'schneiden']});
  chk('Werkzeug: Auftraege mit --erf lassen,schneiden: schneiden nur fuer Quellen mit Erfassungen und f < 1', A.map(x=>x.id).join()==='S-segmente-f1,S-segmente-f0.6,S-beide-f1,S-beide-f0.6,S-beide-f0.6-erfS',
    A.map(x=>x.id).join(' '));
  const jd=join(tmp, 'rund.json'); AB.schreibeJson(jd, {a:{b:Infinity, c:-Infinity, d:null, e:1.5}}); const jr=AB.leseJson(jd);
  chk('Werkzeug: JSON mit Infinity hin und zurueck (T2-Mehrdeutigkeit ohne zweite Lage), sonst unveraendert', readFileSync(jd, 'utf8').includes('"Infinity"') && jr.a.b===Infinity && jr.a.c===-Infinity
    && jr.a.d===null && jr.a.e===1.5);
}

// ------------------------------------------------- Werkzeug: kleiner Lauf in Kindprozessen (2 Faktoren x 2 Quellen x Erf + kaputte Aufnahme)
{
  const aus=join(tmp, 'ablation'), t0=performance.now(), T1A=['--segmente', 'geraet', '--bis', '25', '--metrik', 'export'];
  const opt={aufnahmen:[{name:'S', src:ordner, protokoll:null}], aus, faktoren:[1, 0.6], quellen:['segmente', 'erfassungen'], erf:['lassen', 'schneiden'], jobs:3, t1:T1A, still:true, H:2.416, wahrheit:T1.WAHRHEIT};
  const r=await AB.ablation({...opt, aufnahmen:[...opt.aufnahmen, {name:'K', src:join(tmp, 'kaputt'), protokoll:null}]});
  const ms=performance.now()-t0, S=r.zeilen.filter(z=>z.aufnahme==='S'), K=r.zeilen.filter(z=>z.aufnahme==='K');
  chk('Werkzeug: 10 Laeufe in Kindprozessen, die 5 der Attrappe ohne Fehler mit Kennzahlen, die 5 der kaputten Aufnahme als Fehlerzeile (kein Abbruch)', r.zeilen.length===10
    && S.length===5 && S.every(z=>!z.fehler && z.k && z.k.runden>0) && K.every(z=>z.fehler && /manifest\.json fehlt/.test(z.fehler)), `${(ms/1000).toFixed(1)} s, `+r.zeilen.map(z=>z.id+(z.fehler ? ' FEHLER' : '')).join(' '));
  const s6=S.find(z=>z.quelle==='segmente' && z.faktor===0.6), s1=S.find(z=>z.quelle==='segmente' && z.faktor===1), eS=S.find(z=>z.erf==='schneiden');
  chk('Werkzeug: Faktor und Sichtfeld je Zeile (f 0.6 -> w\' 173, 21,3°; f 1 -> 287, 34,6°), Ausgaben je Lauf und Tabelle geschrieben', s6 && s6.k.w2===173 && Math.abs(s6.k.hfov-21.25)<0.01
    && s1.k.w2===287 && Math.abs(s1.k.hfov-34.58)<0.01 && ['kennzahlen.json', 'bericht.txt', 'export.json', 'plan.svg', 'log.txt'].every(f=>existsSync(join(aus, 'laeufe', 'S-segmente-f0.6', f)))
    && existsSync(join(aus, 'ablation.md')) && AB.leseJson(join(aus, 'ablation.json')).zeilen.length===10
    && readFileSync(join(aus, 'laeufe', 'S-segmente-f0.6', 'bericht.txt'), 'utf8').includes('Faktor 0.6'));
  const gS=r.steigungen.find(g=>g.aufnahme==='S' && g.erf==='schneiden');
  chk('Werkzeug: Lauf mit Erf schneiden (T1 --sichtfeld-erf schneiden) beschneidet die Erfassungen, seine Gruppe nimmt f = 1 aus lassen', eS && eS.id==='S-erfassungen-f0.6-erfS'
    && eS.k.erfModus==='schneiden' && eS.k.erfSchnitt && eS.k.erfSchnitt.geschnitten>0 && eS.argv.join(' ').includes('--sichtfeld-erf schneiden') && gS && gS.n===2
    && gS.ids.join()==='S-erfassungen-f1,S-erfassungen-f0.6-erfS', eS && eS.k.erfSchnitt ? JSON.stringify(eS.k.erfSchnitt) : '');
  // gleiche Eingaben im Kindprozess und hier: gleiche kopf-Folge bei f = 0.6 (Wiederholbarkeit ueber Prozesse)
  const Lh=await T1.laufen(G, T1.ladeQuelle(ordner), {...T1.optionenAus(T1.argumente([ordner, '--H', '2.416', '--quelle', 'segmente', '--sichtfeld', '0.6', '--ohne', 'tiefe,ebenen', '--segmente', 'geraet', '--bis', '25']))});
  chk('Werkzeug: Kindprozess rechnet dasselbe wie T1 hier (Runden, globale Waende, Segment-Beob)', s6.k.runden===Lh.runden.length && s6.k.waendeGlobal===Lh.letzte.stand.waende.length
    && s6.k.segBeob===AB.kennzahlen(Lh, null).segBeob, `${s6.k.runden} Runden, ${s6.k.segBeob} Segment-Beob`);
  const r2=await AB.ablation({...opt, jobs:2, nurTabelle:true});
  chk('Werkzeug --nur-tabelle: liest die fertigen kennzahlen.json, rechnet nichts neu', r2.zeilen.length===5 && r2.zeilen.every(z=>!z.fehler && z.k) && r2.msGesamt<2000, `${r2.msGesamt.toFixed(0)} ms`);
  const r3=await AB.ablation({...opt, t1:[...T1A.slice(0, 3), '24', ...T1A.slice(4)], nurTabelle:true});
  chk('Werkzeug --nur-tabelle mit anderen T1-Argumenten: keine alten Zeilen untergemischt, je Lauf Fehlerzeile "veraltet (andere T1-Argumente)"', r3.zeilen.length===5
    && r3.zeilen.every(z=>!z.k && /veraltet \(andere T1-Argumente\)/.test(z.fehler)), r3.zeilen[0].fehler);
  // Infinity (T2 ohne zweite Lage) ueberlebt kennzahlen.json; alte Version wird mit --weiter neu gerechnet
  const kz1=join(aus, 'laeufe', 'S-segmente-f1', 'kennzahlen.json'), kzE=join(aus, 'laeufe', 'S-erfassungen-f1', 'kennzahlen.json');
  const z1=AB.leseJson(kz1); z1.k.mehrdeutig=Infinity; AB.schreibeJson(kz1, z1); const zE=AB.leseJson(kzE); zE.version=1; AB.schreibeJson(kzE, zE);
  const r4=await AB.ablation({...opt, nurTabelle:true}), y1=r4.zeilen.find(z=>z.id==='S-segmente-f1'), yE=r4.zeilen.find(z=>z.id==='S-erfassungen-f1');
  chk('Werkzeug: Mehrdeutigkeit Infinity bleibt Infinity (Tabelle ∞, nicht –); kennzahlen.json einer anderen Version gilt als veraltet', y1.k && y1.k.mehrdeutig===Infinity
    && r4.md.split('\n').some(l=>l.startsWith('| S | segmente | lassen | 1 |') && l.includes('| ∞ |')) && !yE.k && /Version 1 statt 2/.test(yE.fehler), yE.fehler);
  const r5=await AB.ablation({...opt, weiter:true}), x1=r5.zeilen.find(z=>z.id==='S-segmente-f1'), xE=r5.zeilen.find(z=>z.id==='S-erfassungen-f1');
  chk('Werkzeug --weiter: gleiche Laeufe uebernommen (Infinity von oben), veralteter neu gerechnet (Version 2)', x1.k.mehrdeutig===Infinity && xE.k && !xE.fehler && AB.leseJson(kzE).version===2);
  // Zeitgrenze: Kindprozess nach 0,05 s mit SIGKILL beendet; die alte kennzahlen.json desselben Ordners darf nicht als Ergebnis gelten
  const t5=performance.now(), r6=await AB.ablation({...opt, quellen:['segmente'], faktoren:[0.6], erf:['lassen'], zeitgrenze:0.05}), z6=r6.zeilen[0];
  chk('Werkzeug --zeitgrenze: haengender bzw. zu langer Lauf wird beendet und zur Fehlerzeile, kein Rest vom letzten Lauf', r6.zeilen.length===1 && !z6.k && /Zeitgrenze 0.05 s/.test(z6.fehler)
    && !existsSync(join(aus, 'laeufe', 'S-segmente-f0.6', 'kennzahlen.json')) && performance.now()-t5<5000, `${z6.fehler}, ${(performance.now()-t5).toFixed(0)} ms`);
}
rmSync(tmp, {recursive:true, force:true});

console.log(out.join('\n'));
if(nOffen) console.log(`\n${nOffen} offen (nicht im Ergebnis)`);
console.log(ok ? '\nALLE CHECKS GRUEN' : '\nCHECKS ROT');
process.exit(ok ? 0 : 1);
