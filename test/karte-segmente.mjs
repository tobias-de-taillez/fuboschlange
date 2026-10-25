// Prueft M3 raumskizze-segmente.js (ARCHITEKTUR v3, 17.2 / 10.8): Datei und Einbau, lumaAus (Formate, Groessen,
// Polsterspalte), lmSegmente (Strahlen bitgleich zu G.ray, Klassen, Plan-Gier, flipY), lmVerschmelzen (Doppelkante auf
// dem laengsten Rohteil, Stuecke, Gegenfaelle, Wiederholbarkeit), lmGier, lmRechtwinklig (Klasse 0/1 wie lib.mjs),
// G.bild auf einem gerenderten Raum (Ende zu Ende mit ELSED: psi0, man gegen die Wand, Senkrechte nur bei
// auftrag.senk, neue Felder, Uhr nur ueber o.uhr, Worker) und gegen T3 (Vorzeichen der Gier mit wahr.g). Mit den
// Aufnahmen im Scratchpad zusaetzlich 10.8 an den Daten: A6 ganz ohne Verschmelzen bitgleich zu F1 (seg/cls/dir, psi0,
// man), nach dem Verschmelzen Doppelkanten, senkrechter Anteil, Geraetekante (roh gegen das Soll, verschmolzen als
// Regressionsschutz, Soll offen nach 17.0), psi0 je guter Abschnitt (A6 9, A8 5/6/8) gegen die Wahrheit und gegen roh
// (Sprung der Spitze), Zeit als Notiz; die volle Abnahme an A6-A8 ist design/bau/P-B/abnahme.mjs. Laedt vendor + geo
// von raumskizze-probe.html wie raumskizze-protokoll.mjs und haengt M0, M1 (ELSED) und M3 als eigene Bloecke an, wenn
// die Seite sie nicht traegt.
//
//   node test/karte-segmente.mjs        (RAUMSKIZZE_HTML=pfad: anderer Stand der Seite; KARTE_DATEN=0: ohne Aufnahmen;
//                                        M3_DATEI=pfad: andere Fassung von M3, nur fuer Gegenproben)
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {Worker} from 'node:worker_threads';
import * as T3 from '../raumskizze-sim.mjs';

const read=f=>readFileSync(new URL('../'+f, import.meta.url), 'utf8');
const html=process.env.RAUMSKIZZE_HTML ? readFileSync(process.env.RAUMSKIZZE_HTML, 'utf8') : read('raumskizze-probe.html');
const pick=id=>{ const m=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`)); if(!m) throw new Error(`Script-Block "${id}" nicht gefunden`); return m[1]; };
const DATEI='raumskizze-segmente.js', src=process.env.M3_DATEI ? readFileSync(process.env.M3_DATEI, 'utf8') : read(DATEI), mark='globalThis.RAUMSKIZZE=G;';
let geo=pick('geo'); const traegt=geo.includes('{\n'+src+'}\n') || geo.includes('{\n'+src+'\n}\n');
new Function('"use strict";\n'+pick('vendor')+'\n'+geo)();
const G0=globalThis.RAUMSKIZZE, G0keys=new Set(Object.keys(G0)), platzhalter=!!(G0.bild && G0.bild.platzhalter);
for(const [f, test] of [['raumskizze-karte-grund.js', /G\.gBei=/], ['raumskizze-elsed.js', /G\.elsed=/], [DATEI, /G\.lmSegmente=/]]){
  if(test.test(geo)) continue; const at=geo.lastIndexOf(mark); geo=geo.slice(0, at)+'{\n'+(f===DATEI ? src : read(f))+'\n}\n'+geo.slice(at); }
const GEO='"use strict";\n'+pick('vendor')+'\n'+geo;
new Function(GEO)();
const G=globalThis.RAUMSKIZZE, S=G.KG.SEG, KL=G.KG.KL;

const out=[], mess=[]; let ok=true;
const chk=(name,cond,info='')=>{ ok=ok&&!!cond; out.push((cond?'ok   ':'ROT  ')+name+(info!==''?'  ('+info+')':'')); };
const notiz=s=>mess.push(s);
const D2R=Math.PI/180, R2D=180/Math.PI, VIERTEL=Math.PI/2, W=287, H=640, PROJ=T3.PROJ_A6;
const f2=x=>Number.isFinite(x) ? x.toFixed(2) : String(x), e1=x=>Number.isFinite(x) ? x.toExponential(1) : String(x);
const q=(a,p)=>{ if(!a.length) return NaN; const s=Float64Array.from(a).sort(); return s[Math.min(s.length-1, Math.floor(p*s.length))]; };
const d2=a=>{ let d=((a%Math.PI)+Math.PI)%Math.PI; return d>VIERTEL ? d-Math.PI : d; };          // mod 180° in [-90°, 90°)
const d4=(a,b)=>{ let d=(((a-b)%VIERTEL)+VIERTEL)%VIERTEL; return d>VIERTEL/2 ? d-VIERTEL : d; };
const wrap=a=>Math.atan2(Math.sin(a), Math.cos(a));
const same=(a,b)=>a.length===b.length && a.every((v,i)=>Object.is(v, b[i]));
const maxAbs=(a,b)=>{ let m=0; for(let i=0;i<a.length;i++) m=Math.max(m, Math.abs(a[i]-b[i])); return m; };
const kamera=(p, hc, alpha, theta)=>T3.kameraMatrix(p, hc, alpha, theta, 0);
const pix=(camTo, P, flipY=false)=>{ const n=G.project(PROJ, camTo, P); return n ? G.ndcToPix(n[0], n[1], W, H, flipY) : null; };
const rohAus=(liste, sal=20)=>liste.map(([x1,y1,x2,y2])=>({x1:Math.fround(x1), y1:Math.fround(y1), x2:Math.fround(x2), y2:Math.fround(y2), salience:sal}));
const bildAus=(r, camTo, flipY=false)=>({k:0, vi:0, t:0, ep:0, camTo:Float64Array.from(camTo), proj:Float32Array.from(PROJ), flipY, w:W, h:H, f:G.fokusPx(PROJ, H),
  n:r.n, seg:r.seg, cls:r.cls, man:new Int8Array(r.n).fill(-1), dir:r.dir, nTeile:new Uint8Array(r.n).fill(1), psi0:null, senk:null});

// ------------------------------------------------- Datei und Einbau
{
  const NAMEN=['lumaAus', 'lmSegmente', 'lmVerschmelzen', 'lmGier', 'lmRechtwinklig', 'bildNeu', 'bild'];
  const Gs={}; let fehler=null; try{ new Function('G', '"use strict";\n'+src)(Gs); }catch(x){ fehler=x.message; }
  const neu=Object.keys(Gs).sort(), soll=[...NAMEN].sort();
  chk('Datei laedt allein (new Function) und haengt genau die Namen aus 4 an G', !fehler && JSON.stringify(neu)===JSON.stringify(soll),
    fehler || neu.filter(k=>!NAMEN.includes(k)).concat(NAMEN.filter(k=>!neu.includes(k))).join(',') || neu.length+' Namen');
  // Die Seite darf den M3-Platzhalter von Stand 6 tragen (G.bild.platzhalter, Object.assign, nur ohne G.bild): ein spaeter
  // eingefuegtes Modul ueberschreibt ihn, ein frueher eingefuegtes laesst ihn nicht entstehen.
  const kollision=NAMEN.filter(k=>G0keys.has(k));
  chk('keine Kollision mit Namen, die der geo-Block schon traegt (ausser dem M3-Platzhalter von Stand 6)', traegt || !kollision.length || platzhalter,
    traegt ? 'Seite traegt das Modul' : platzhalter ? 'Seite traegt den Platzhalter, Modul ueberschreibt ihn' : kollision.join(',') || 'eingefuegt');
  chk('nach dem Einfuegen gilt das Modul, nicht der Platzhalter', !(G.bild && G.bild.platzhalter) && G.lmVerschmelzen!==G0.lmVerschmelzen);
  chk('Datei endet mit genau einem Zeilenumbruch, kein import/export/</script>', /[^\n]\n$/.test(src) && !/^\s*(import|export)\s/m.test(src) && !src.includes('</script>'));
  const code=src.replace(/\/\/.*$/gm, '');
  const verboten=[/Math\.random/, /Date\.now/, /\bwindow\b/, /\bdocument\b/, /\bself\b/].filter(r=>r.test(code)), uhrZeilen=code.split('\n').filter(l=>/performance/.test(l));
  chk('kein Math.random, kein Date.now, kein DOM/Worker-Global; performance.now nur in der Vorgabe-Uhr fuer ms (2)', !verboten.length && uhrZeilen.length===1 && /^const UHR=/.test(uhrZeilen[0]),
    verboten.map(String).join(' ') || uhrZeilen.length+' Zeile(n) mit performance');
  chk('atan2 nicht auf Matrixeintraege (1.2, Suchmuster aus test/karte-grund.mjs)', !/atan2\s*\([^)]*\b(m|camTo|pose|T|M|mat)\s*\[\s*(0|2|8|10)\s*\]/.test(code));
}

// ------------------------------------------------- lumaAus
{
  const rnd=G.KG.rnd(3), n=W*H, rgba=new Uint8Array(4*n); for(let i=0;i<rgba.length;i++) rgba[i]=Math.floor(rnd()*256);
  const g=G.lumaAus(rgba.buffer, 'rgba', W, H, null);
  let fehl=0; for(let i=0;i<n;i++) if(g[i]!==((77*rgba[4*i]+150*rgba[4*i+1]+29*rgba[4*i+2])>>8)) fehl++;
  const ws=G.lumaAus(new Uint8Array([255,255,255,0, 0,0,0,255]), 'rgba', 2, 1, null);
  chk('rgba: (77 R + 150 G + 29 B) >> 8 fuer alle Pixel, Weiss 255, Schwarz 0, Alpha ohne Wirkung', g.length===n && fehl===0 && ws[0]===255 && ws[1]===0, `${fehl} falsch`);
  const grau=new Uint8Array(n); for(let i=0;i<n;i++) grau[i]=(i*7)&255; const aus=new Uint8Array(n);
  const g8=G.lumaAus(grau, 'luma8', W, H, aus);
  const big=new Uint8Array(n+16); big.set(grau, 8); const gv=G.lumaAus(big.subarray(8, 8+n), 'luma8', W, H, null);
  chk('luma8: Kopie in aus (dasselbe Feld zurueck), auch aus einer Teilansicht mit Versatz', g8===aus && same(g8, grau) && same(gv, grau));
  let l4ok=true;
  for(const w of [287, 861, 4, 5]){ const h=w>100 ? 7 : 3, st=4*Math.ceil(w/4), buf=new Uint8Array(st*h).fill(255), want=new Uint8Array(w*h);
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const v=(x*13+y*5)%250; buf[y*st+x]=v; want[y*w+x]=v; }
    if(!same(G.lumaAus(buf.buffer, 'luma4', w, h, null), want)) l4ok=false; }
  chk('luma4: Zeile = ceil(w/4) Texel, Fuellbytes (255) am Zeilenende nie gelesen (w 287, 861, 4, 5)', l4ok);
  const wirft=f=>{ try{ f(); return false; }catch(e){ return true; } };
  const gross=new Uint8Array(4*n+4096); gross.set(rgba); gross.fill(255, 4*n);
  chk('Puffergroesse: groesserer Pool-Puffer erlaubt (nur die ersten w·h Pixel), 288er-Zeilen (Polsterspalte) fuer w 287 werfen (rgba, luma8), zu kurz wirft, unbekanntes Format wirft',
    same(G.lumaAus(gross, 'rgba', W, H, null), g) && wirft(()=>G.lumaAus(new Uint8Array(4*288*H), 'rgba', W, H, null)) && wirft(()=>G.lumaAus(new Uint8Array(288*H), 'luma8', W, H, null)) &&
    wirft(()=>G.lumaAus(new Uint8Array(4*n-1), 'rgba', W, H, null)) && wirft(()=>G.lumaAus(new Uint8Array(287*H), 'luma4', W, H, null)) && wirft(()=>G.lumaAus(new Uint8Array(n), 'grau', W, H, null)) &&
    !wirft(()=>G.lumaAus(new Uint8Array(288*H), 'luma4', W, H, null)));
}

// ------------------------------------------------- Testraum: Kasten x 0..4, z 0..3, Decke 2,4 m
const RAUM={x0:0, x1:4, z0:0, z1:3, hc:2.4};
// Wand der Ebene (Normale zur Kamera = ins Innere). man-Soll: Klasse 0/1 der Linienrichtung u = wandU(phi) mod 180°
// zu psi0 (wie lib.rechtwinklig; bei psi0 = 89,9° heisst die Achse 0° Klasse 1, nicht 0)
const WAENDE=[{name:'x0', phi:0}, {name:'x1', phi:Math.PI}, {name:'z0', phi:VIERTEL}, {name:'z1', phi:3*VIERTEL}];
const kSoll=(phi, psi0=0)=>{ const u=G.wandU(phi), a=Math.atan2(u[1], u[0]); return Math.round((((a-psi0)%Math.PI)+Math.PI)%Math.PI/VIERTEL)%2; };
// Sichtbares Stueck einer 3D-Strecke im Bild (abgetastet, innerhalb 2 px vom Rand): [x1, y1, x2, y2] oder null
const sichtbar=(camTo, A, B, flipY=false)=>{ let a=null, b=null;
  for(let i=0;i<=400;i++){ const t=i/400, P=[A[0]+t*(B[0]-A[0]), A[1]+t*(B[1]-A[1]), A[2]+t*(B[2]-A[2])], p=pix(camTo, P, flipY);
    if(!p || p[0]<2 || p[1]<2 || p[0]>W-3 || p[1]>H-3) continue; if(!a) a=p; b=p; }
  return a && b && Math.hypot(b[0]-a[0], b[1]-a[1])>=30 ? [a[0], a[1], b[0], b[1]] : null; };
const deckenKanten=R=>[[[R.x0,R.hc,R.z0],[R.x0,R.hc,R.z1],0], [[R.x1,R.hc,R.z0],[R.x1,R.hc,R.z1],1], [[R.x0,R.hc,R.z0],[R.x1,R.hc,R.z0],2], [[R.x0,R.hc,R.z1],[R.x1,R.hc,R.z1],3]];

// ------------------------------------------------- lmSegmente
{
  const camTo=kamera([1.0, 1.5], 1.4, 0, 0);          // blickt nach +x, Wand x = 4 in 3 m
  const P=(x,y,z)=>pix(camTo, [x,y,z]);
  const L=[[...P(4,0.5,1.5), ...P(4,2.2,1.5)], [...P(4,2.4,1.0), ...P(4,2.4,2.0)], [...P(4,0,1.1), ...P(4,0,1.9)], [...P(4,1.0,1.3), ...P(4,1.8,1.7)],
    [...P(3.5,2.4,1.2), ...P(3.5+0.6*Math.cos(30*D2R),2.4,1.2+0.6*Math.sin(30*D2R))], [100,300,108,305]];
  const roh=rohAus(L), r=G.lmSegmente(roh, W, H, PROJ, camTo, false);
  chk('n = Zahl der Rohsegmente (nichts faellt weg), Felder in 3.1-Form', r.n===roh.length && r.seg.length===S*r.n && r.dir.length===6*r.n && r.cls.length===r.n);
  chk('Klassen: Ecke V, Deckenkante O, Bodenkante U, ueber den Horizont X, kurz (9 px) X', [...r.cls].join()===[KL.V, KL.O, KL.U, KL.X, KL.O, KL.X].join(), [...r.cls].join(','));
  let dmax=0, rayOk=true;
  for(let i=0;i<r.n;i++) for(const [e, o] of [[0,0], [2,3]]){ const nn=G.pixToNdc(roh[i][e ? 'x2' : 'x1'], roh[i][e ? 'y2' : 'y1'], W, H, false), ry=G.ray(PROJ, camTo, nn[0], nn[1]);
    for(let c=0;c<3;c++){ if(!Object.is(Math.fround(ry.d[c]), r.dir[i*6+o+c])) rayOk=false; dmax=Math.max(dmax, Math.abs(ry.d[c]-r.dir[i*6+o+c])); } }
  chk('dir = G.ray(proj, camTo, G.pixToNdc(...)) bitgleich (float32) fuer beide Enden', rayOk, `max ${e1(dmax)}`);
  const psi1=r.seg[S+6], psi2=r.seg[2*S+6], psi5=r.seg[4*S+6];
  chk('psi = Plan-Gier der waagerechten Deutung in [0, pi): Kante laengs z 90°, unter 30° 30°; V/X NaN',
    Math.abs(psi1-VIERTEL)<1e-5 && Math.abs(psi2-VIERTEL)<1e-5 && Math.abs(psi5-30*D2R)<1e-5 && Number.isNaN(r.seg[6]) && Number.isNaN(r.seg[3*S+6]), `${f2(psi1*R2D)}° / ${f2(psi5*R2D)}°`);
  const el=r.seg[S+7], elSoll=Math.atan2(1.0, Math.hypot(3, 0.5));
  chk('el1/el2 = asin(Strahl y), sPx = 1, len = Abstand der Enden, sal aus salience bzw. sal',
    Math.abs(el-elSoll)<1e-4 && r.seg[5]===1 && Math.abs(r.seg[9]-Math.hypot(L[0][2]-L[0][0], L[0][3]-L[0][1]))<1e-3 && r.seg[4]===20 &&
    G.lmSegmente([{x1:10, y1:10, x2:60, y2:10, sal:7}], W, H, PROJ, camTo, false).seg[4]===7, `el ${f2(el*R2D)}° (soll ${f2(elSoll*R2D)}°)`);
  // flipY: Zeilen gespiegelt (y' = H-1-y) und flipY umgekehrt -> dieselben Strahlen und Klassen
  const rohM=roh.map(s=>({...s, y1:Math.fround(H-1-s.y1), y2:Math.fround(H-1-s.y2)})), rM=G.lmSegmente(rohM, W, H, PROJ, camTo, true);
  let dm=0, dp=0; for(let i=0;i<r.n;i++){ dm=Math.max(dm, maxAbs(r.dir.subarray(i*6, i*6+6), rM.dir.subarray(i*6, i*6+6)));
    for(const c of [6,7,8,9]) if(Number.isFinite(r.seg[i*S+c])) dp=Math.max(dp, Math.abs(r.seg[i*S+c]-rM.seg[i*S+c])); }
  chk('flipY (17.2): gespiegelte Zeilen mit umgekehrtem flipY geben dieselben Segmente in Weltlage (dir, psi, el, len, Klasse)', same(r.cls, rM.cls) && dm<1e-6 && dp<1e-5, `dir ${e1(dm)}, psi/el/len ${e1(dp)}`);
}

// ------------------------------------------------- lmVerschmelzen
{
  const camTo=kamera([1.0, 1.5], 1.4, 0, 0), V=(liste, sal=20, o={})=>{ const r=G.lmSegmente(rohAus(liste, sal), W, H, PROJ, camTo, false); return G.lmVerschmelzen(bildAus(r, camTo), o); };
  const z=500;
  const a=V([[60,z,160,z], [60,z+3,160,z+3]], 20), a2=V([[60,z,150,z], [55,z+3,165,z+3]], 20), a3=V([[55,z+3,165,z+3], [60,z,150,z]], 20);
  chk('Doppelkante 3 px gleich lang: eine Beobachtung auf dem Rohteil mit kleinerem Index (nicht die Mittellinie), Enden 60..160, sPx 1,5, nTeile 2, sal = Maximum',
    a.n===1 && a.nTeile[0]===2 && Math.abs(a.seg[1]-z)<1e-4 && Math.abs(a.seg[3]-z)<1e-4 && Math.abs(a.seg[0]-60)<1e-4 && Math.abs(a.seg[2]-160)<1e-4 &&
    Math.abs(a.seg[5]-1.5)<1e-6 && a.seg[4]===20 && a.cls[0]===KL.O, `n ${a.n}, y ${f2(a.seg[1])}, sPx ${f2(a.seg[5])}`);
  chk('Doppelkante ungleich lang (90 / 110 px): Gerade auf dem laengeren Rohteil (y = z+3), in beiden Reihenfolgen, Enden 55..165, sPx 1,5',
    [a2, a3].every(x=>x.n===1 && Math.abs(x.seg[1]-(z+3))<1e-4 && Math.abs(x.seg[3]-(z+3))<1e-4 && Math.abs(x.seg[0]-55)<1e-4 && Math.abs(x.seg[2]-165)<1e-4 && Math.abs(x.seg[5]-1.5)<1e-6),
    `y ${f2(a2.seg[1])} / ${f2(a3.seg[1])}`);
  const b=V([[60,z,160,z], [60,z+6,160,z+6]]), c=V([[60,z,160,z], [130,z+3,230,z+3]]), d=V([[60,z,160,z], [172,z+0.5,260,z+0.5]]), e=V([[60,z,160,z], [168,z+2,260,z+2]]);
  const f=V([[60,z,160,z], [70,z+1+5,170,z+1-5]]);
  chk('nicht verschmolzen: 6 px quer, Ueberlapp 30 %, kollinear mit Luecke 12 px, kollinear 2 px quer, 5,7° schraeg', b.n===2 && c.n===2 && d.n===2 && e.n===2 && f.n===2,
    [b, c, d, e, f].map(x=>x.n).join('/'));
  const g=V([[60,z,160,z], [168,z+0.5,260,z+0.5]], 20), h3=V([[20,z,80,z], [85,z+0.3,140,z+0.3], [145,z,200,z]], 10);
  chk('kollinear, Luecke 8 px, 0,5 px quer: ein Stueck, nTeile 2, sal = Summe, sPx bleibt 1, Ausdehnung 60..260', g.n===1 && g.nTeile[0]===2 && g.seg[4]===40 && g.seg[5]===1 &&
    Math.abs(g.seg[0]-60)<0.01 && Math.abs(g.seg[2]-260)<0.01, `sPx ${f2(g.seg[5])}, ${f2(g.seg[0])}..${f2(g.seg[2])}`);
  chk('Kette aus drei Stuecken (Luecken 5 px): eine Beobachtung, nTeile 3', h3.n===1 && h3.nTeile[0]===3 && h3.seg[4]===30);
  // Stuecke allein: Hauptachse der Momente (Mittel der Querlagen 0 / 0,3 / 0 nach Laenge 60 / 55 / 55 px)
  const yM=z+0.3*55/170;
  chk('nur Stuecke: Gerade aus den Momenten (Querlage laengengewichtet gemittelt)', Math.abs((h3.seg[1]+h3.seg[3])/2-yM)<0.01, `y ${f2((h3.seg[1]+h3.seg[3])/2)} (soll ${f2(yM)})`);
  // Erst Stuecke, dann ein paralleler Partner (110 px, laengstes Rohteil): die Gerade springt auf das laengste Rohteil
  const k3=V([[20,z,80,z], [85,z+0.3,150,z+0.3], [30,z+3,140,z+3]], 10);
  chk('Stuecke + paralleler Partner: Gerade auf dem laengsten Rohteil (y = z+3), Enden 20..150, nTeile 3, sPx 1,5', k3.n===1 && k3.nTeile[0]===3 &&
    Math.abs(k3.seg[1]-(z+3))<1e-4 && Math.abs(k3.seg[3]-(z+3))<1e-4 && Math.abs(k3.seg[0]-20)<1e-4 && Math.abs(k3.seg[2]-150)<1e-4 && Math.abs(k3.seg[5]-1.5)<1e-6,
    `n ${k3.n}, y ${f2(k3.seg[1])}, ${f2(k3.seg[0])}..${f2(k3.seg[2])}`);
  // Neu eingeteilt: Strahlen der verschmolzenen Enden wie G.ray
  const nn=G.pixToNdc(a.seg[0], a.seg[1], W, H, false), ry=G.ray(PROJ, camTo, nn[0], nn[1]);
  chk('Verschmolzene neu eingeteilt: dir = G.ray der (float32) Enden, psi und Klasse neu', [0,1,2].every(k=>Object.is(Math.fround(ry.d[k]), a.dir[k])) && Math.abs(a.seg[6]-VIERTEL)<0.02);
  // Gemischte Liste: Reihenfolge nach kleinstem Rohindex, Unberuehrte bitgleich, Eingabe unveraendert, wiederholbar
  // Gemischt: Doppelkante (Gerade auf Rohteil 1, y = z) und ein Stueck 0,5 px daneben werden eins; ein Stueck auf der
  // alten Mittellinie (z+1,5) liegt 1,5 px neben der Geraden (kollPx 1,5 ist streng) und bleibt allein.
  const liste=[[20,100,30,250], [60,z,160,z], [200,400,260,430], [60,z+3,160,z+3], [168,z+0.5,250,z+0.5], [10,600,40,601]];
  const r=G.lmSegmente(rohAus(liste), W, H, PROJ, camTo, false), bi=bildAus(r, camTo), kopie=Float32Array.from(r.seg), m1=G.lmVerschmelzen(bi), m2=G.lmVerschmelzen(bildAus(G.lmSegmente(rohAus(liste), W, H, PROJ, camTo, false), camTo));
  chk('Gemischt: Doppelkante + Stueck werden eins (nTeile 3, Gerade y = z, Enden 60..250), Unberuehrte bitgleich und in Rohreihenfolge, Eingabe unveraendert, zwei Laeufe bytegleich',
    m1.n===4 && [...m1.nTeile].join()==='1,3,1,1' && Math.abs(m1.seg[S+1]-z)<1e-4 && Math.abs(m1.seg[S+3]-z)<1e-4 && Math.abs(m1.seg[S]-60)<1e-4 && Math.abs(m1.seg[S+2]-250)<1e-4 &&
    same(m1.seg.subarray(0, S), r.seg.subarray(0, S)) && same(m1.seg.subarray(2*S, 3*S), r.seg.subarray(2*S, 3*S)) &&
    same(m1.seg.subarray(3*S), r.seg.subarray(5*S)) && same(r.seg, kopie) && same(m1.seg, m2.seg) && same(m1.dir, m2.dir) && same(m1.cls, m2.cls) && m1.man.every(x=>x===-1),
    `nTeile ${[...m1.nTeile].join(',')}`);
  const m3=V([[60,z,160,z], [60,z+3,160,z+3], [168,z+1.5,250,z+1.5]]);
  chk('Stueck auf der alten Mittellinie (1,5 px neben der Geraden der Doppelkante) bleibt allein: nTeile 2 und 1', m3.n===2 && [...m3.nTeile].join()==='2,1', `nTeile ${[...m3.nTeile].join(',')}`);
}

// ------------------------------------------------- lmGier
{
  const mach=(liste)=>{ const n=liste.length, seg=new Float32Array(n*S).fill(NaN), cls=new Int8Array(n);
    liste.forEach(([p, l, k=KL.O],i)=>{ seg[i*S+6]=p*D2R; seg[i*S+9]=l; cls[i]=k; }); return {n, seg, cls}; };
  const rnd=G.KG.rnd(11), N=(m,s)=>m+s*Math.sqrt(-2*Math.log(rnd()+1e-12))*Math.cos(2*Math.PI*rnd());
  const L1=[]; for(let i=0;i<40;i++) L1.push([N(20, 1), 50]); for(let i=0;i<40;i++) L1.push([N(110, 1), 50]); for(let i=0;i<15;i++) L1.push([45+90*rnd(), 30]); for(let i=0;i<10;i++) L1.push([20, 80, KL.V]);
  const g1=G.lmGier(mach(L1));
  chk('Raumrichtung mod 90° aus 20° und 110° (Rauschen 1°) mit Stoerern: psi0 = 20° +- 0,4°, nur O/U zaehlen', g1 && Math.abs(g1.psi*R2D-20)<0.4 && g1.n>=50 && g1.n<=95 && g1.sig>0,
    g1 ? `${f2(g1.psi*R2D)}°, sig ${f2(g1.sig*R2D)}°, n ${g1.n}` : 'null');
  const g2=G.lmGier(mach([[89.8, 50], [0.2, 50], [90.1, 50], [179.9, 50], [0.0, 50]]));
  chk('Umlauf bei 0°/90°: Werte 89,8° / 0,2° / 90,1° / 179,9° geben psi0 nahe 0° (mod 90°) in [0, 90°)', g2 && Math.abs(d4(g2.psi, 0)*R2D)<0.2 && g2.psi>=0 && g2.psi<VIERTEL, g2 ? f2(g2.psi*R2D) : 'null');
  const g3=G.lmGier(mach([[10, 200], [11, 200], [12, 200], [30, 50], [31, 50], [32, 50], [33, 50]]));
  chk('Laenge gewichtet: drei lange bei 10-12° schlagen vier kurze bei 30-33°', g3 && Math.abs(g3.psi*R2D-11)<0.5, g3 ? f2(g3.psi*R2D) : 'null');
  chk('null bei < 3 Segmenten im Fenster oder ohne O/U', G.lmGier(mach([[10, 50], [11, 50]]))===null && G.lmGier(mach([[10, 50, KL.V], [10, 50, KL.X], [10, 50, KL.V]]))===null);
}

// ------------------------------------------------- lmRechtwinklig: Klasse 0/1 (psi mod 180°) wie lib.rechtwinklig
{
  let n=0, gut=0; const kl=[0,0];
  for(const dreh of [0, 20]) for(const yaw of [0, 40, 60, 100, 135, 170, 200, 250, 290, 330]){
    const cs=Math.cos(dreh*D2R), sn=Math.sin(dreh*D2R), rot=([x,y,z])=>[cs*x-sn*z, y, sn*x+cs*z];
    const pos=rot([1.6, 0, 1.3]), camTo=kamera([pos[0], pos[2]], 1.4, (yaw+dreh)*D2R, 25*D2R), liste=[], wand=[];
    for(const [A, B, iw] of deckenKanten(RAUM)){ const s=sichtbar(camTo, rot(A), rot(B)); if(s){ liste.push(s); wand.push(iw); } }
    if(!liste.length) continue;
    const r=G.lmSegmente(rohAus(liste), W, H, PROJ, camTo, false), b=G.lmRechtwinklig(bildAus(r, camTo), {psi:dreh*D2R, sig:0, n:1});
    for(let i=0;i<r.n;i++){ if(r.cls[i]!==KL.O) continue; n++; const k=kSoll(WAENDE[wand[i]].phi); if(b.man[i]===k){ gut++; kl[k]++; } } }
  chk('man = Klasse 0/1 der Wandrichtung zu psi0: alle Deckenkanten aus 20 Blicken, Raum 0° und 20° gedreht, beide Klassen', n>=15 && gut===n && kl.every(x=>x>0),
    `${gut}/${n}, je k ${kl.join('/')}`);
  // Fenster und Umlauf: psi0 20°; psi 20 -> 0, 110 -> 1, 200 (= 20 mod 180) -> 0, 25 -> 0 (5° < 6°), 30 -> -1, 115 -> 1, 116,5 -> -1, NaN -> -1;
  // psi0 89,9°: psi 0,1° -> 1 (90,2° daneben), psi 89,0° -> 0
  const mach=liste=>{ const n=liste.length, seg=new Float32Array(n*S).fill(NaN); liste.forEach((p,i)=>{ seg[i*S+6]=p*D2R; }); return {n, seg, cls:new Int8Array(n).fill(KL.O)}; };
  const m20=G.lmRechtwinklig(mach([20, 110, 200, 25, 30, 115, 116.5, NaN]), {psi:20*D2R, sig:0, n:1}).man, m90=G.lmRechtwinklig(mach([0.1, 89]), {psi:89.9*D2R, sig:0, n:1}).man;
  chk('Fenster +-6° und Umlauf mod 180° (wortgleich lib.rechtwinklig)', [...m20].join()==='0,1,0,0,-1,1,-1,-1' && [...m90].join()==='1,0', `${[...m20].join(',')} | ${[...m90].join(',')}`);
  const r0=G.lmSegmente(rohAus([[60,500,160,500]]), W, H, PROJ, kamera([1,1.5], 1.4, 0, 0), false), b0=G.lmRechtwinklig(bildAus(r0, kamera([1,1.5], 1.4, 0, 0)), null);
  chk('ohne psi0 alle -1; neues Objekt, Eingabe unveraendert', b0.man[0]===-1 && b0!==r0);
}

// ------------------------------------------------- G.bild auf einem gerenderten Raum (Ende zu Ende mit ELSED)
// Je Pixel Strahl (G.pixToNdc, G.ray), Austritt aus dem Kasten, Grauwert je Flaeche, 2x2-Ueberabtastung; auf den
// Waenden zwei dunkle Leisten (1,85-1,95 m und 0,35-0,45 m), damit jedes Bild genug waagerechte Kanten fuer psi0 hat.
const GRAU={x0:150, x1:105, z0:175, z1:125, decke:230, boden:60}, LEISTEN=[[1.85, 1.95], [0.35, 0.45]];
function rendern(camTo, flipY=false, R=RAUM){
  const g=new Uint8Array(W*H);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){ let s=0;
    for(const [ox, oy] of [[-0.25,-0.25], [0.25,-0.25], [-0.25,0.25], [0.25,0.25]]){ const n=G.pixToNdc(x+ox, y+oy, W, H, flipY), r=G.ray(PROJ, camTo, n[0], n[1]);
      let tb=Infinity, f='decke';
      const prob=(d, o, lo, name)=>{ if(Math.abs(d)<1e-12) return; const t=(lo-o)/d; if(t>0 && t<tb){ tb=t; f=name; } };
      prob(r.d[0], r.o[0], R.x0, 'x0'); prob(r.d[0], r.o[0], R.x1, 'x1'); prob(r.d[2], r.o[2], R.z0, 'z0'); prob(r.d[2], r.o[2], R.z1, 'z1');
      prob(r.d[1], r.o[1], 0, 'boden'); prob(r.d[1], r.o[1], R.hc, 'decke');
      const yh=r.o[1]+tb*r.d[1]; s+=GRAU[f]-(f!=='decke' && f!=='boden' && LEISTEN.some(([a,b])=>yh>=a && yh<b) ? 45 : 0); }
    g[y*W+x]=Math.round(s/4); }
  return g;
}
// Wand eines O/U-Segments: Mittelstrahl bis zur ersten Wandebene innerhalb des Kastens; die Linie muss auf einer
// Kantenhoehe liegen (Decke, Boden, Leistenkanten), sonst -1.
const HOEHEN=[0, RAUM.hc, ...LEISTEN.flat()];
const wandVon=(b,i)=>{ const d=b.dir.subarray(i*6, i*6+6), m=[d[0]+d[3], d[1]+d[4], d[2]+d[5]], l=Math.hypot(...m), o=[b.camTo[12], b.camTo[13], b.camTo[14]], r=m.map(v=>v/l);
  let best=-1, tb=Infinity, yb=NaN; const E=0.02;
  [[0, RAUM.x0], [0, RAUM.x1], [2, RAUM.z0], [2, RAUM.z1]].forEach(([ax, wert], k)=>{ if(Math.abs(r[ax])<1e-9) return; const t=(wert-o[ax])/r[ax]; if(!(t>0) || t>=tb) return;
    const P=[o[0]+t*r[0], o[1]+t*r[1], o[2]+t*r[2]], an=ax===0 ? 2 : 0, lo=an===0 ? RAUM.x0 : RAUM.z0, hi=an===0 ? RAUM.x1 : RAUM.z1;
    if(P[1]<-E || P[1]>RAUM.hc+E || P[an]<lo-E || P[an]>hi+E) return; tb=t; best=k; yb=P[1]; });
  return best>=0 && HOEHEN.some(hh=>Math.abs(yb-hh)<0.03) ? best : -1; };
const BLICKE=[[1.6, 1.3, 30, 20], [2.8, 1.8, 200, 15], [1.2, 2.2, 120, 25], [3.0, 1.0, 300, 10]];
{
  const BZ=G.bildNeu(), BZu=G.bildNeu({uhr:()=>performance.now()}); let nOU=0, man=0, manGut=0, psiMax=0, psi0n=0, n=0; const kl=[0,0];
  let erste=null, flipMax=0, flipN=0, flipGut=0;
  for(const [x, z, yaw, pitch] of BLICKE){ const camTo=kamera([x, z], 1.4, yaw*D2R, pitch*D2R), g=rendern(camTo);
    const A={k:n, vi:n, t:n*0.1, ep:0, fmt:'luma8', w:W, h:H, buf:g, camTo, proj:PROJ, flipY:false, senk:false}, b=G.bild(BZ, A); n++;
    if(!erste) erste={A, b, seg:Float32Array.from(b.seg)};
    if(b.psi0){ psi0n++; psiMax=Math.max(psiMax, Math.abs(d4(b.psi0.psi, 0))*R2D); }
    for(let i=0;i<b.n;i++){ if((b.cls[i]!==KL.O && b.cls[i]!==KL.U) || b.seg[i*S+9]<30) continue; const iw=wandVon(b, i); if(iw<0) continue; nOU++;
      if(b.man[i]>=0){ man++; if(b.man[i]===kSoll(WAENDE[iw].phi, b.psi0.psi)){ manGut++; kl[kSoll(WAENDE[iw].phi)]++; } } }
    // flipY Ende zu Ende: dieselbe Szene mit umgekehrtem flipY gerendert (Zeilen gespiegelt)
    const gM=rendern(camTo, true), bM=G.bild(BZ, {...A, buf:gM, flipY:true});
    for(let i=0;i<b.n;i++){ if(b.seg[i*S+9]<30) continue; flipN++; let best=Infinity;
      for(let j=0;j<bM.n;j++){ if(bM.cls[j]!==b.cls[i]) continue; best=Math.min(best, maxAbs(b.dir.subarray(i*6, i*6+6), bM.dir.subarray(j*6, j*6+6)), maxAbs(b.dir.subarray(i*6, i*6+6), [...bM.dir.subarray(j*6+3, j*6+6), ...bM.dir.subarray(j*6, j*6+3)])); }
      if(best<3/461){ flipGut++; flipMax=Math.max(flipMax, best); } } }
  chk('gerenderter Raum: psi0 in jedem Blick, |psi0 - 0°| <= 0,3° (mod 90°)', psi0n===BLICKE.length && psiMax<=0.3, `${psi0n}/${BLICKE.length}, max ${f2(psiMax)}°`);
  chk('gerenderter Raum: O/U-Segmente >= 30 px an Waenden (Decken-, Boden-, Leistenkanten) haben man = Klasse der Wandrichtung (alle), beide Klassen kommen vor', nOU>=20 && man===nOU && manGut===nOU && kl.every(x=>x>0),
    `${manGut}/${man}/${nOU}, je k ${kl.join('/')}`);
  chk('gerenderter Raum mit umgekehrtem flipY (gespiegelte Zeilen): Segmente >= 30 px in Weltlage wiedergefunden (Enden <= 3 px) in >= 90 %', flipGut>=0.9*flipN,
    `${flipGut}/${flipN}`);
  const {A, b}=erste, b2=G.bild(BZ, A), b3=G.bild(BZ, {...A, senk:true}), bu=G.bild(BZu, A);
  chk('BildErgebnis: w = 287 aus dem Auftrag (Polsterspalte entfernt), h, f = proj[5]·h/2, camTo Float64, proj Float32, Felder in 3.1-Form',
    b.w===287 && b.h===H && Math.abs(b.f-PROJ[5]*H/2)<1e-4 && b.camTo instanceof Float64Array && b.proj instanceof Float32Array && b.seg.length===S*b.n && b.dir.length===6*b.n &&
    b.cls.length===b.n && b.man.length===b.n && b.nTeile.length===b.n && [...b.cls].every(c=>c>=0 && c<=3) && ['k','vi','t','ep','flipY','psi0','senk','ms'].every(k=>k in b));
  chk('Senkrechte nur bei auftrag.senk: sonst senk = null, sonst Liste (G.verticalEdges)', b.senk===null && b2.senk===null && Array.isArray(b3.senk), `${b3.senk.length} Funde`);
  chk('Ergebnis frei: neue Felder je Aufruf, das erste bleibt nach weiteren Aufrufen unveraendert, zwei Laeufe bytegleich, structuredClone geht',
    b2.seg!==b.seg && b2.dir!==b.dir && b2.camTo!==b.camTo && same(b.seg, erste.seg) && same(b.seg, b2.seg) && same(b.dir, b2.dir) && same(b.man, b2.man) &&
    (()=>{ try{ const c=structuredClone(b3); return same(c.seg, b3.seg); }catch(e){ return false; } })());
  const bo=G.bild(G.bildNeu({uhr:false}), A);
  chk('ms: Vorgabe-Uhr (performance.now) bzw. o.uhr misst, gesamt = Summe der Teile; uhr false gibt 0; Ergebnis unabhaengig von der Uhr',
    b.ms.gesamt>0 && bu.ms.gesamt>0 && Math.abs(bu.ms.gesamt-(bu.ms.luma+bu.ms.elsed+bu.ms.verschm+bu.ms.einteilen+bu.ms.senk))<1e-6 && Object.values(bo.ms).every(v=>v===0) &&
    same(bo.seg, b.seg) && same(bo.man, b.man));
  const rgba=new Uint8Array(4*W*H); for(let i=0;i<W*H;i++){ rgba[4*i]=rgba[4*i+1]=rgba[4*i+2]=A.buf[i]; rgba[4*i+3]=255; }
  const br=G.bild(BZ, {...A, fmt:'rgba', buf:rgba.buffer});
  chk('rgba mit R = G = B gibt dasselbe wie luma8 (77+150+29 = 256)', same(br.seg, b.seg) && same(br.dir, b.dir) && same(br.cls, b.cls));
  // Polsterspalte: 288 breite Quelle mit heller Spalte 287; ungeschnitten wirft es, geschnitten bleibt jedes Segment in x <= 286
  const pad=new Uint8Array(288*H); for(let y=0;y<H;y++){ pad.set(A.buf.subarray(y*W, y*W+W), y*288); pad[y*288+287]=255; }
  let warf=false; try{ G.bild(BZ, {...A, buf:pad}); }catch(e){ warf=true; }
  const cut=new Uint8Array(W*H); for(let y=0;y<H;y++) cut.set(pad.subarray(y*288, y*288+W), y*W);
  const bc=G.bild(BZ, {...A, buf:cut}); let xmax=0; for(let i=0;i<bc.n;i++) xmax=Math.max(xmax, bc.seg[i*S], bc.seg[i*S+2]);
  chk('Polsterspalte nie gelesen: 288er-Zeilen mit w 287 werfen; abgeschnitten gleich dem Original, alle x < 286,5 (Rand der letzten Spalte)', warf && same(bc.seg, b.seg) && xmax<286.5, `x max ${f2(xmax)}`);
  chk('BZ.luma traegt die Luma des letzten Bilds (w·h), nBilder zaehlt', BZ.luma.length===W*H && BZ.nBilder>=4);
  // Worker (worker_threads): derselbe Code in einem Faden, Auftrag per Transfer, Ergebnis bitgleich
  const wcode=`const {parentPort, workerData}=require('node:worker_threads'); new Function(workerData.geo)(); const G=globalThis.RAUMSKIZZE;
    parentPort.on('message', A=>{ const b=G.bild(G.bildNeu({uhr:()=>performance.now()}), A); parentPort.postMessage(b, [b.seg.buffer, b.dir.buffer, b.cls.buffer, b.man.buffer]); });`;
  const wk=new Worker(wcode, {eval:true, workerData:{geo:GEO}}), buf=A.buf.slice().buffer;
  const bw=await new Promise((res, rej)=>{ wk.once('message', res); wk.once('error', rej); wk.postMessage({...A, buf, camTo:Array.from(A.camTo)}, [buf]); });
  await wk.terminate();
  chk('im Worker (worker_threads, Transfer): BildErgebnis bitgleich zum Hauptfaden, ms gemessen', same(bw.seg, b.seg) && same(bw.dir, b.dir) && same(bw.man, b.man) &&
    JSON.stringify(bw.psi0)===JSON.stringify(b.psi0) && bw.ms.gesamt>0, `ms ${f2(bw.ms.gesamt)}`);
  // Hochaufloesend (861 x 1920): Schwellen wachsen mit sc = 3, psi0 bleibt
  const W3=861, H3=1920, g3=new Uint8Array(W3*H3), gk=rendern(A.camTo);
  for(let y=0;y<H3;y++) for(let x=0;x<W3;x++) g3[y*W3+x]=gk[Math.floor(y/3)*W+Math.floor(x/3)];
  const b9=G.bild(G.bildNeu(), {...A, w:W3, h:H3, buf:g3, senk:true});
  chk('861x1920: f = proj[5]·1920/2, psi0 wie bei 640 (<= 0,3°), Senkrechte auf G.lumaKlein', b9.w===W3 && Math.abs(b9.f-PROJ[5]*H3/2)<1e-3 && b9.psi0 && Math.abs(d4(b9.psi0.psi, b.psi0.psi))*R2D<=0.3 && Array.isArray(b9.senk),
    b9.psi0 ? `psi0 ${f2(b9.psi0.psi*R2D)}° gegen ${f2(b.psi0.psi*R2D)}°, n ${b9.n}` : 'null');
}

// ------------------------------------------------- T3: Vorzeichen der Gier und Wandseite gegen die Wahrheit
{
  const e=T3.sim(T3.WAHRHEIT, {G, kamerapfad:'rund', seed:1, bildJede:5, rausch:{sigPx:0, kuerzPx:0}, m3:'G'});
  let n=0, nP=0, nS=0, nM=0, nMg=0, maxP=0; const WT=e.welt.waende;
  for(const {bildErg:b, wahr:w} of e.bilder){
    for(let i=0;i<b.n;i++){ if((b.cls[i]!==KL.O && b.cls[i]!==KL.U) || w.wand[i]<0 || (w.kante[i]!==0 && w.kante[i]!==1) || b.seg[i*S+9]<20) continue; n++;
      const p=b.seg[i*S+6], Wd=WT[w.wand[i]], soll=Wd.phi+VIERTEL, dp=Math.abs(d2(p+w.g.psi-soll))*R2D; maxP=Math.max(maxP, dp); if(dp<0.05) nP++;
      const s=-Math.sin(p)*(b.dir[i*6]+b.dir[i*6+3])+Math.cos(p)*(b.dir[i*6+2]+b.dir[i*6+5]), a=(s>0 ? p : p+Math.PI)+w.g.psi;
      if(w.seite[i]>0 && Math.abs(wrap(a-soll))<0.05*D2R) nS++;
      // man aus dem Modul (psi0 des Bilds) gegen die Wahrheit: Klasse 0/1 von wandU(phi) - g.psi zu psi0 (mod 180°)
      if(b.psi0 && b.man[i]>=0){ nM++; const kW=Math.round((((soll-w.g.psi-b.psi0.psi)%Math.PI)+Math.PI)%Math.PI/VIERTEL)%2; if(kW===b.man[i]) nMg++; } } }
  const nSeite=e.bilder.reduce((s,{bildErg:b, wahr:w})=>{ for(let i=0;i<b.n;i++) if((b.cls[i]===KL.O || b.cls[i]===KL.U) && w.wand[i]>=0 && (w.kante[i]===0 || w.kante[i]===1) && b.seg[i*S+9]>=20 && w.seite[i]>0) s++; return s; }, 0);
  chk('T3 (exakt, m3 G): psi + wahr.g.psi = Richtung der Wahrheitswand mod 180° (<= 0,05°) fuer alle Decken-/Bodensegmente auf Waenden', n>=200 && nP===n, `${nP}/${n}, max ${f2(maxP)}°`);
  chk('T3: gerichtete Linienrichtung (Seite aus dir) + wahr.g.psi = wandU(phi) der Wahrheitswand (Kamera auf der freien Seite)', nSeite>=200 && nS===nSeite, `${nS}/${nSeite}`);
  chk('T3: man des Moduls = Klasse 0/1 von wandU(phi) - wahr.g.psi zu psi0 des Bilds, fuer alle Segmente mit man >= 0', nM>=150 && nMg===nM, `${nMg}/${nM}`);
}

// ------------------------------------------------- Aufnahmen A6/A8 (wenn im Scratchpad): 10.8 an den Daten
// A6 ganz, A8 die guten Abschnitte 5/6/8. Abschnitte, Rahmen und Wahrheit wie lm/messung.mjs und
// design/bau/P-B/abnahme.mjs (Grenzen an den Bruechen auf 0,01 s; truth = T.m ? T.r - phT : phT - T.r).
const SP='/private/tmp/claude-501/-Volumes-external-TobiCodetEndlichWieder-Zaene/86e1205e-9d6d-494b-b0b6-88f6e01be4b0/scratchpad';
const aufnahme=n=>{ const base=SP+'/a'+n, F=SP+`/karte/fixtures/f1-a${n}.jsonl.gz`;
  if(!existsSync(F) || !existsSync(base+'/x') || !existsSync(base+`/protokoll${n}.json`)) return null;
  const dir=base+'/x/'+readdirSync(base+'/x').find(d=>d.startsWith('aufnahme')), M=JSON.parse(readFileSync(dir+'/manifest.json', 'utf8'));
  const P=JSON.parse(readFileSync(base+`/protokoll${n}.json`, 'utf8')), C=Object.fromEntries(M.zustand.spalten.map((k,i)=>[k,i]));
  const rows=readFileSync(dir+'/zustand.jsonl', 'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
  const Z=gunzipSync(readFileSync(F)).toString('utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)).slice(1);
  const cuts=[...new Set((P.breaks||[]).map(b=>+b.t.toFixed(2)))].sort((a,b)=>a-b), edges=[-Infinity, ...cuts, Infinity];
  const secOf=t=>{ for(let j=0;j<edges.length-1;j++) if(t>=edges[j] && t<edges[j+1]) return j; return -1; };
  return {n, dir, M, C, rows, Z, secOf}; };
// Video bis Bild bis-1 dekodiert; Bild k = k-tes v >= 0, Zeilen wie gespeichert (Zeile 0 unten), Polsterspalte abgeschnitten
const video=(R, bis)=>{ const [SW]=R.M.bild.gepolstert, w=R.M.bild.breite, h=R.M.bild.hoehe, FS=SW*h;
  const dec=spawnSync('ffmpeg', ['-v','error','-r',String(R.M.video.fps||10),'-f','h264','-i','pipe:0','-vsync','0','-frames:v',String(bis),'-f','rawvideo','-pix_fmt','gray','pipe:1'],
    {input:readFileSync(R.dir+'/video.h264'), maxBuffer:2**31});
  return k=>{ const fr=dec.stdout.subarray(k*FS, (k+1)*FS); if(fr.length<FS) return null; const g=new Uint8Array(w*h); for(let y=0;y<h;y++) g.set(fr.subarray(y*SW, y*SW+w), y*w); return g; }; };
const WAHR=JSON.parse(read('wahrheit-hesterkamp-wohnkueche-2026-10-25.json')), WP=Object.fromEntries(WAHR.pts.map(p=>[p.id, [p.x/1000, p.y/1000]]));
const phT=(()=>{ let Cc=0, Sn=0; for(const [a,b] of WAHR.walls){ const A=WP[a], B=WP[b], Lw=Math.hypot(B[0]-A[0], B[1]-A[1]), t=Math.atan2(B[1]-A[1], B[0]-A[0]); Cc+=Lw*Math.cos(4*t); Sn+=Lw*Math.sin(4*t); } return Math.atan2(Sn, Cc)/4; })();
const nan=a=>a.map(v=>v===null ? NaN : v);
// Geraetekante wie karte/fixtures/erzeuge-f1.mjs: ein Segment <= 1,5° und Mitte der Geraetekante <= 1,5 px quer
const kante=(b, dv)=>{ const pa=G.ndcToPix(dv[0], dv[1], b.w, b.h, b.flipY), pb=G.ndcToPix(dv[2], dv[3], b.w, b.h, b.flipY), dx=pb[0]-pa[0], dy=pb[1]-pa[1], dl=Math.hypot(dx, dy), mid=[(pa[0]+pb[0])/2, (pa[1]+pb[1])/2];
  for(let j=0;j<b.n;j++){ const x1=b.seg[j*S], y1=b.seg[j*S+1], ex=b.seg[j*S+2]-x1, ey=b.seg[j*S+3]-y1, el=Math.hypot(ex, ey);
    if(Math.asin(Math.min(1, Math.abs(ex*dy-ey*dx)/(el*dl)))*R2D<1.5 && Math.abs((mid[0]-x1)*ey-(mid[1]-y1)*ex)/el<1.5) return true; }
  return false; };
// Segmente >= 30 px mit parallelem Nachbarn, partner() wie design/lm/doppel.mjs
const doppel=(b, st)=>{ const segs=[]; for(let i=0;i<b.n;i++) segs.push([b.seg[i*S], b.seg[i*S+1], b.seg[i*S+2], b.seg[i*S+3]]);
  for(const s of segs){ const [x1,y1,x2,y2]=s, ex=x2-x1, ey=y2-y1, el=Math.hypot(ex,ey); if(el<30) continue; st.n30++;
    if(segs.some(t=>{ if(t===s) return false; const [a1,b1,a2,b2]=t, fx=a2-a1, fy=b2-b1, fl=Math.hypot(fx,fy); if(fl<15) return false;
      if(Math.asin(Math.min(1, Math.abs(ex*fy-ey*fx)/(el*fl)))*R2D>2) return false; const dp=Math.abs(((a1+a2)/2-x1)*ey-((b1+b2)/2-y1)*ex)/el; if(dp>4 || dp<0.3) return false;
      const pr=(x,y)=>((x-x1)*ex+(y-y1)*ey)/el, I=[pr(a1,b1), pr(a2,b2)].sort((a,c)=>a-c); return Math.min(el, I[1])-Math.max(0, I[0])>=0.5*Math.min(el, fl); })) st.dop++; } };
const vereint=bilder=>{ let m=0; for(const b of bilder) m+=b.n; const seg=new Float32Array(m*S), cls=new Int8Array(m); let o=0;
  for(const b of bilder){ seg.set(b.seg.subarray(0, b.n*S), o*S); cls.set(b.cls.subarray(0, b.n), o); o+=b.n; } return {n:m, seg, cls}; };
// Ein Lauf ueber die Bilder einer Aufnahme (gute: Abschnitte, deren Bilder fuer psi0 gesammelt werden; nurGute: nur diese Bilder)
const lauf=(R, gute, nurGute)=>{
  const Zs=R.Z.filter(z=>!nurGute || gute.includes(R.secOf(z.t))), bild=video(R, Math.max(...Zs.map(z=>z.k))+1), proj=R.M.geometrie.proj;
  const BZ0=G.bildNeu({verschm:false}), BZ=G.bildNeu({uhr:()=>performance.now()}), st={nb:0, f1:0, f1psi:0, f1man:0, n30:0, dop:0, nSeg:0, nV:0, kn:0, kr:0, kv:0, ms:[], sec:new Map(gute.map(j=>[j, {roh:[], ver:[]}]))};
  for(const z of Zs){ const g=bild(z.k); if(!g) break;
    const A={k:z.k, vi:z.vi, t:z.t, ep:z.ep, fmt:'luma8', w:R.M.bild.breite, h:R.M.bild.hoehe, buf:g, camTo:z.camTo, proj, flipY:z.flipY, senk:false};
    const b0=G.bild(BZ0, A), b=G.bild(BZ, A); st.nb++; st.ms.push(b.ms.gesamt);
    if(same(b0.seg, Float32Array.from(nan(z.seg))) && same(b0.cls, Int8Array.from(z.cls)) && same(b0.dir, Float32Array.from(z.dir))) st.f1++;
    if(b0.psi0===null ? z.psi0===null : !!z.psi0 && Object.is(b0.psi0.psi, z.psi0.psi) && Object.is(b0.psi0.sig, z.psi0.sig) && b0.psi0.n===z.psi0.n) st.f1psi++;
    if(same(b0.man, Int8Array.from(z.man))) st.f1man++;
    doppel(b, st); st.nSeg+=b.n; for(let i=0;i<b.n;i++) if(b.cls[i]===KL.V) st.nV++;
    const dv=R.rows[z.zeile][R.C.live]; if(dv && dv[5]){ st.kn++; if(kante(b0, dv)) st.kr++; if(kante(b, dv)) st.kv++; }
    const X=st.sec.get(R.secOf(z.t)); if(X){ X.roh.push(b0); X.ver.push(b); } }
  return st; };
// psi0 je guter Abschnitt gegen die Wahrheit (Rahmen der Deutung) und gegen die rohe Kette (Sprung der Spitze)
const abschnitt=(st, datei, j)=>{ const T=JSON.parse(readFileSync(SP+'/design/lm/out/'+datei, 'utf8')).secs[j].T, truth=T.m ? (T.r-phT) : (phT-T.r), X=st.sec.get(j);
  const e=key=>{ const p=G.lmGier(vereint(X[key])); return p ? d4(p.psi, truth)*R2D : NaN; }; return {roh:e('roh'), ver:e('ver'), bilder:X.ver.length}; };
const daten=process.env.KARTE_DATEN!=='0' && spawnSync('ffmpeg', ['-version']).status===0;
const R6=daten ? aufnahme(6) : null, R8=daten ? aufnahme(8) : null;
if(R6){
  const st=lauf(R6, [9], false), pc=(a,b)=>100*a/Math.max(1, b);
  chk(`A6 ganz (${st.nb} Bilder): ohne Verschmelzen seg/cls/dir, psi0 {psi, sig, n} und man bitgleich zu F1 (Einteilung lm/messung.mjs, Gier und rechte Winkel lib.mjs)`,
    st.nb>=900 && st.f1===st.nb && st.f1psi===st.nb && st.f1man===st.nb, `${st.f1} / ${st.f1psi} / ${st.f1man} von ${st.nb}`);
  chk('A6: nach dem Verschmelzen < 5 % der Segmente >= 30 px mit parallelem Nachbarn (10.8, Mass doppel.mjs)', st.n30>0 && st.dop<0.05*st.n30, `${f2(pc(st.dop, st.n30))} % von ${st.n30}`);
  chk('A6: senkrechter Anteil nach dem Verschmelzen 21 % +- 3 (10.8)', Math.abs(pc(st.nV, st.nSeg)-21)<=3, `${f2(pc(st.nV, st.nSeg))} %`);
  chk('A6: Geraetekante (<= 1,5° / 1,5 px) der rohen Kette >= 67 % (10.8); verschmolzen >= 63,5 % (Regressionsschutz am Messstand 64,0 %, Mittellinie gab 63,2 %; Soll fuer die Ausgabe von M3 offen, 17.0)',
    st.kn>=700 && pc(st.kr, st.kn)>=67 && pc(st.kv, st.kn)>=63.5, `${st.kn} Bilder: roh ${f2(pc(st.kr, st.kn))} %, verschmolzen ${f2(pc(st.kv, st.kn))} %`);
  for(const [hfit, datei] of [['2.38', 'a6/rahmen-2.38.json'], ['2.22', 'a6/rahmen-2.22.json']]){ const a=abschnitt(st, datei, 9);
    chk(`A6 Abschnitt 9 (Hfit ${hfit}, ${a.bilder} Bilder): psi0 - Wahrheit <= 2° (10.8), verschmolzen - roh <= 1° (Spitze springt nicht)`, Math.abs(a.ver)<=2 && Math.abs(a.ver-a.roh)<=1,
      `verschmolzen ${f2(a.ver)}°, roh ${f2(a.roh)}°`); }
  notiz(`[M] A6 ${st.nb} Bilder: G.bild ohne Senkrechte Median ${f2(q(st.ms.slice(10), 0.5))} ms, p90 ${f2(q(st.ms.slice(10), 0.9))} ms (Mac, Node ${process.version}; Abnahme 10.8: <= 3 ms, volle Messung design/bau/P-B/abnahme.mjs)`);
} else notiz('Aufnahme A6 / F1 nicht im Scratchpad (oder KARTE_DATEN=0): Pruefungen an A6 uebersprungen');
if(R8){
  const st=lauf(R8, [5, 6, 8], true);
  chk(`A8 gute Abschnitte (${st.nb} Bilder): ohne Verschmelzen bitgleich zu F1 (seg/cls/dir, psi0, man)`, st.nb>=250 && st.f1===st.nb && st.f1psi===st.nb && st.f1man===st.nb, `${st.f1} / ${st.f1psi} / ${st.f1man} von ${st.nb}`);
  for(const j of [5, 6, 8]){ const a=abschnitt(st, 'a8/rahmen-2.416.json', j);
    chk(`A8 Abschnitt ${j} (Hfit 2,416, ${a.bilder} Bilder): psi0 - Wahrheit <= 4,1° (10.8), verschmolzen - roh <= 1° (vorher Ab 8: +1,44° -> -2,23°)`, Math.abs(a.ver)<=4.1 && Math.abs(a.ver-a.roh)<=1,
      `verschmolzen ${f2(a.ver)}°, roh ${f2(a.roh)}°`); }
} else notiz('Aufnahme A8 / F1 nicht im Scratchpad (oder KARTE_DATEN=0): Pruefungen an A8 uebersprungen');

console.log(out.join('\n'));
if(mess.length) console.log('\n'+mess.join('\n'));
console.log(ok ? '\nALLE CHECKS GRUEN' : '\nROTE CHECKS');
process.exit(ok ? 0 : 1);
