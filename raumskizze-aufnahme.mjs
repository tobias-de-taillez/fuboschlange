// raumskizze-aufnahme.mjs — wertet eine Aufnahme von raumskizze-probe.html
// („Aufnahme sichern“, TAR) aus: Überblick, Bezugszustand über die Zeit und
// Nachspiel des Kantendetektors auf den dekodierten Bildern gegen das, was
// das Telefon im selben Bild fand. Stimmen beide überein, taugt das Video
// als Prüfstand für Änderungen an captureEdge (und als Trainingsmaterial).
// Dazu Stufe 2 und die Senkrechten offline:
//  - Stufe 2: der Schätzer läuft über die Zeit nach wie der Worker (Pool aus
//    dem Protokoll, Laufzeiten aus LOG.timings.solve), je Bild das Live-Modell
//    mit der Pose des Bildes, G.trackModelEdges + G.trackJudge auf dem
//    dekodierten Bild; Vergleich mit den Stichproben des Geräts (LOG.trk) und
//    die Verteilung des Abstands Kante–Modell gegen tolM.
//  - Senkrechte: G.verticalEdges (Strang „senkrechte“, raumskizze-senkrechte.js,
//    solange die Seite sie nicht hat) auf jedes n-te Bild, Peilung gegen die
//    Ecken des nachgespielten Modells.
//
//   node raumskizze-aufnahme.mjs aufnahme.tar|ordner [--html=seite] [--png=ordner] [--bericht=ordner] [--jede=n]
//        [--senk=n] [--stufe2=0] [--senk-js=datei] [--senk-tol=grad] [--takt=s] [--json=datei] [--spiegeln=1]
//
// --html rechnet mit einem anderen Stand der Seite nach. --png legt die Bilder
// aufrecht (Zeile 0 = oben) als PNG ab, --jede=n nur jedes n-te. --bericht
// schreibt einen Pruefstand zum Durchblaettern (index.html): Bild, Kante am
// Geraet, nachgerechnete Kante, Zustand, Modelllinien, Stufe-2-Marken und
// Senkrechte (je Ebene ein Schalter). Braucht ffmpeg.
// --senk=n Senkrechte auf jedes n-te Bild (Vorgabe 3, 0 = aus), --stufe2=0 ohne
// Stufe 2, --senk-tol Fenster der Peilung gegen eine Modellecke (Vorgabe 1,5°),
// --takt=s Auswertungen hoechstens alle s Sekunden (schneller, weicht dann vom
// Geraet ab; Vorgabe 0 = wie der Worker), --json schreibt die Ergebnisse je Bild,
// --spiegeln=1 prueft den flipY-Weg (Zeilen gespiegelt, Ergebnisse muessen gleich bleiben).
import {readFileSync, writeFileSync, statSync, readdirSync, mkdirSync, existsSync} from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import {resolve, join} from 'node:path';
import {gunzipSync} from 'node:zlib';

const tStart=performance.now();
const argv=process.argv.slice(2);
const flag=n=>argv.find(a=>a.startsWith('--'+n+'='))?.split('=')[1];
const src=argv.find(a=>!a.startsWith('--'));
if(!src){ console.error('Aufruf: node raumskizze-aufnahme.mjs aufnahme.tar|ordner [--html=seite] [--png=ordner] [--bericht=ordner] [--jede=n] [--senk=n] [--stufe2=0] [--senk-js=datei] [--senk-tol=grad] [--takt=s] [--json=datei] [--spiegeln=1]'); process.exit(1); }
const HTML=flag('html') ? resolve(flag('html')) : new URL('./raumskizze-probe.html', import.meta.url);
const html=readFileSync(HTML, 'utf8');
const pick=id=>{ const m=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`)); if(!m) throw new Error(id); return m[1]; };
// Senkrechte: G.verticalEdges braucht Helfer aus dem Inneren des geo-Blocks
// (sobel) - darum wird raumskizze-senkrechte.js in den geo-Block eingefuegt,
// nur hier im Werkzeug und nur, solange die Seite die Funktion nicht selbst hat.
let geo=pick('geo'), senkQuelle='Seite';
if(!/G\.verticalEdges=/.test(geo)){
  const sj=flag('senk-js') ? resolve(flag('senk-js')) : new URL('./raumskizze-senkrechte.js', import.meta.url), mark='globalThis.RAUMSKIZZE=G;', at=geo.lastIndexOf(mark);
  if(existsSync(sj) && at>=0){ geo=geo.slice(0, at)+readFileSync(sj, 'utf8')+'\n'+geo.slice(at); senkQuelle=String(sj).replace(/^file:\/\//, ''); }
  else senkQuelle=null;
}
new Function(pick('vendor')+'\n'+geo)();
const G=globalThis.RAUMSKIZZE;

// TAR (ustar) oder ausgepackter Ordner -> {name: Buffer}
const files={};
if(statSync(src).isDirectory()){
  const walk=d=>readdirSync(d, {withFileTypes:true}).forEach(e=>{ const p=join(d, e.name); if(e.isDirectory()) walk(p); else files[e.name]=readFileSync(p); });
  walk(src);
} else {
  const b=readFileSync(src);
  for(let o=0; o+512<=b.length;){
    const name=b.subarray(o, o+100).toString('utf8').replace(/\0.*$/s, '');
    if(!name) break;
    const size=parseInt(b.subarray(o+124, o+136).toString('utf8').replace(/\0.*$/s, '').trim(), 8);
    files[name.split('/').pop()]=b.subarray(o+512, o+512+size);
    o+=512+Math.ceil(size/512)*512;
  }
}
const M=files['manifest.json'] ? JSON.parse(files['manifest.json']) : null;
if(!M) throw new Error('manifest.json fehlt');
const rows=(files['zustand.jsonl']||Buffer.alloc(0)).toString('utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
const P=files['protokoll.json'] ? JSON.parse(files['protokoll.json']) : null;
// Der Durchlauf der Aufnahme: das Protokoll sammelt alle Durchlaeufe der
// Seitensitzung, fruehere stehen in P.runs (RUN_KEYS), der laufende oben.
// „Letzte Aufnahme sichern“ nimmt das Protokoll aus dem localStorage - darin
// koennen schon spaetere Durchlaeufe stehen.
// Protokoll einer anderen Seitensitzung (obs.t, LOG.trk und Ereignisse zaehlen ab
// einem anderen Seitenstart): gar nicht verwenden - das Nachspiel waere Unsinn.
const fremd=!!(P && M.sitzung && P.started && P.started!==M.sitzung);
const R=P && !fremd && (Array.isArray(P.runs) && M.lauf!=null && P.runs.length>M.lauf ? {...P, ...P.runs[M.lauf]} : P);
const C=Object.fromEntries(M.zustand.spalten.map((k,i)=>[k,i]));
const f2=x=>Number.isFinite(x) ? x.toFixed(2) : '–';
const q=(a,p)=>{ if(!a.length) return NaN; const s=[...a].sort((x,y)=>x-y); return s[Math.min(s.length-1, Math.floor(p*s.length))]; };
const deg=x=>x*180/Math.PI, wrap=a=>Math.atan2(Math.sin(a), Math.cos(a));
const auff=[];   // Auffaelliges fuer die Zusammenfassung am Ende

console.log(`Aufnahme ${M.name} · ${M.geraet||'–'} · Format ${M.format} v${M.version}`);
if(M.fehler) console.log(`  Fehler am Gerät: ${M.fehler}`);
if(fremd){ console.log(`  Protokoll aus einer anderen Seitensitzung (${P.started}, Aufnahme ${M.sitzung}) – Erfassungen und Stichproben passen nicht zur Aufnahme, Protokoll nicht verwendet.`); auff.push('Protokoll gehört zu einer anderen Seitensitzung – ohne Protokoll ausgewertet (kein Stufe-2-Nachspiel)'); }
if(R && R!==P) console.log(`  Protokoll: Durchlauf ${M.lauf} aus runs (das Protokoll hat ${P.runs.length+1} Durchläufe)`);
const t0=rows.length ? rows[0][C.t] : NaN, t1=rows.length ? rows[rows.length-1][C.t] : NaN;
console.log(`Zustand: ${rows.length} Zeilen, ${f2(t0)}–${f2(t1)} s`);
if(M.video) console.log(`Video: ${M.video.codec} ${M.video.width}×${M.video.height}, ${M.video.bilder} Bilder (${M.video.ausgelassen} ausgelassen), ${(M.video.bytes/1e6).toFixed(1)} MB, ${M.video.bitrate/1e6} Mbit/s`);
if(M.tiefe) console.log(`Tiefe: ${M.tiefe.bilder} Bilder, Format ${M.tiefe.format||'–'}`);
// Zustand ueber die Zeit: Flags als Intervalle, Luecken im Takt.
const gaps=[]; for(let i=1;i<rows.length;i++){ const d=rows[i][C.t]-rows[i-1][C.t]; if(d>0.5) gaps.push([rows[i-1][C.t], d]); }
// Takt: ausgewertet wird jedes 3. XR-Bild (S.frame%3), der Abstand der Zeilen
// zeigt also die Bildrate am Geraet.
const dtRow=[]; for(let i=1;i<rows.length;i++){ const d=rows[i][C.t]-rows[i-1][C.t]; if(d>0 && d<0.5) dtRow.push(d*1000); }
if(dtRow.length) console.log(`Takt: ausgewertete Bilder alle ${f2(q(dtRow,0.5))} ms (Median), 90 % ${f2(q(dtRow,0.9))} ms → etwa ${(3000/q(dtRow,0.5)).toFixed(0)} XR-Bilder/s`);
if(gaps.length) console.log(`Lücken > 0,5 s: ${gaps.map(([t,d])=>`${f2(t)} s (+${f2(d)})`).join(', ')}`);
for(const [k,bit] of Object.entries(M.zustand.flags)){
  const sp=[]; let a=null;
  rows.forEach(r=>{ const on=(r[C.flags]&bit)!==0; if(on && a==null) a=r[C.t]; if(!on && a!=null){ sp.push([a,r[C.t]]); a=null; } });
  if(a!=null) sp.push([a, t1]);
  if(sp.length) console.log(`  ${k}: ${bit===128 ? sp.length+'×' : sp.map(([x,y])=>`${f2(x)}–${f2(y)}`).join(', ')}`);
}
// Bezugsspruenge: T aendert sich.
const jumps=[]; for(let i=1;i<rows.length;i++){ const a=rows[i-1], b=rows[i];
  const d=Math.hypot(b[C.Tx]-a[C.Tx], b[C.Ty]-a[C.Ty], b[C.Tz]-a[C.Tz]), dp=Math.abs(b[C.Tpsi]-a[C.Tpsi])*180/Math.PI;
  if(d>0.01 || dp>0.2) jumps.push(`${f2(b[C.t])} s: ${(d*100).toFixed(1)} cm, ${dp.toFixed(1)}°`); }
if(jumps.length) console.log(`Bezug geändert: ${jumps.join(' · ')}`);

// Kamera im Bezug: camTo = T^-1 · Pose (wie onFrame).
const m4=(p,qq)=>{ const [x,y,z,w]=qq;
  return [1-2*(y*y+z*z), 2*(x*y+z*w), 2*(x*z-y*w), 0,  2*(x*y-z*w), 1-2*(x*x+z*z), 2*(y*z+x*w), 0,
          2*(x*z+y*w), 2*(y*z-x*w), 1-2*(x*x+y*y), 0,  p[0], p[1], p[2], 1]; };
const camToOf=r=>{ if(r[C.flags]&64) return null;
  const V=m4([r[C.px], r[C.py], r[C.pz]], [r[C.qx], r[C.qy], r[C.qz], r[C.qw]]);
  const c=Math.cos(r[C.Tpsi]), s=Math.sin(r[C.Tpsi]), T=[c,0,-s,0, 0,1,0,0, s,0,c,0, r[C.Tx], r[C.Ty], r[C.Tz], 1];
  return G.m4mul(G.m4inv(T), V); };

if(!M.video || !files['video.h264']){ console.log('Kein Video in der Aufnahme.'); process.exit(0); }
const proj=M.geometrie && M.geometrie.proj || R && R.session && R.session.geometry && R.session.geometry.proj;
const [w, h]=[M.bild.breite, M.bild.hoehe], [W2, H2]=M.bild.gepolstert, flipY=!!M.bild.flipY;
if(spawnSync('ffmpeg', ['-version']).status!==0){ console.log('ffmpeg fehlt – kein Nachspiel.'); process.exit(0); }
const byV=new Map(); rows.forEach(r=>{ if(r[C.v]>=0) byV.set(r[C.v], r); });
// Videostrom: Groesse und Farbkennung (ffprobe auf dem Anfang des Stroms). Die
// Zuordnung Bild k <-> Zustand setzt die Groesse und lueckenlose Bilder voraus.
// Ein Kodierer, der auf 16 auffuellt, liefert ein breiteres Bild: die Zeilen
// beginnen trotzdem oben links (Zeile 0 wie im Puffer) - dann mit dessen Breite
// als Zeilenabstand lesen. ffmpeg streckt Y bei Kennung 'tv' (oder ohne) auf
// 0-255 und laesst es bei 'pc' - stimmt die Kennung nicht, zeigt es die Luma-Probe.
let SW=W2, SH=H2;
{ const r=spawnSync('ffprobe', ['-v','error','-f','h264','-i','pipe:0','-show_entries','stream=width,height,pix_fmt,color_range,color_space','-of','json'],
    {input:files['video.h264'].subarray(0, 4<<20), maxBuffer:1<<22});
  let s=null; try{ s=JSON.parse(String(r.stdout)).streams[0]||null; }catch(e){}
  if(!s) console.log('Videostrom: ffprobe ohne Ergebnis – Größe aus dem Manifest angenommen.');
  else {
    console.log(`Videostrom: ${s.width}×${s.height}, ${s.pix_fmt}, Bereich ${s.color_range||'?'}, Matrix ${s.color_space||'?'} (Y ${s.color_range==='pc' ? 'unverändert' : 'auf 0–255 gestreckt'})`);
    if(s.width!==W2 || s.height!==H2){
      if(s.width>=w && s.height>=h){ SW=s.width; SH=s.height; auff.push(`Video: Strom ${s.width}×${s.height} statt ${W2}×${H2} (Manifest) – oben links auf ${w}×${h} beschnitten; stimmt captureEdge nicht, ist das Bild anders angeordnet`); }
      else { auff.push(`Video: Strom ${s.width}×${s.height} kleiner als das Bild ${w}×${h} – kein Nachspiel`); console.log('Videostrom kleiner als das Bild im Manifest – kein Nachspiel.'); process.exit(0); }
    }
  }
}
// flipY je Bild: der y-Spiegel laesst sich in der Sitzung umschalten (Ereignis
// 'y-spiegel'), das Manifest kennt nur den Endstand. Die Detektoren rechnen je Bild
// mit dem Stand der App; der Export (aufrecht) nimmt den Endstand.
// --spiegeln=1 (Pruefung): Zeilen spiegeln und flipY umkehren - alle Ergebnisse
// muessen gleich bleiben.
const flipEv=(R && R.events || []).filter(e=>e.type==='y-spiegel').map(e=>[e.t, !!e.an]), SPIEGELN=flag('spiegeln')==='1';
const flipAt=t=>{ let v=flipEv.length ? !flipEv[0][1] : flipY; for(const [te,a] of flipEv){ if(te<=t) v=a; else break; } return v; };
if(flipEv.length){ console.log(`y-Spiegel umgeschaltet: ${flipEv.map(([t,a])=>`${f2(t)} s ${a ? 'an' : 'aus'}`).join(', ')} (Manifest: ${flipY ? 'an' : 'aus'})`);
  if(flipEv[flipEv.length-1][1]!==flipY) auff.push('y-Spiegel: letzter Stand im Protokoll ≠ Manifest'); }
{ const bad=(R && R.obs || []).filter(o=>o.flipY!=null && !!o.flipY!==flipAt(o.t)); if(bad.length) auff.push(`y-Spiegel: ${bad.length} Erfassungen mit anderem flipY als nach den Ereignissen erwartet`); }

const png=flag('png'), bericht=flag('bericht'), every=Math.max(1, Number(flag('jede'))||1);
// Aufrecht (Zeile 0 = oben): ohne flipY liegt Zeile 0 unten (readPixels) -> vflip;
// die gepolsterte Spalte faellt weg.
const upright=`crop=${w}:${h}:0:0${flipY ? '' : ',vflip'},select=not(mod(n\\,${every}))`;
// Roher H.264-Strom ohne Zeitstempel: ffmpeg nimmt die Bildrate aus der VUI des
// Kodierers - meldet die eine hohe Rate (synthetisch ab ~300/s), verwirft ffmpeg
// Bilder (dekodiert 51 statt 980, JPEG-Export bricht ab). '-r' vor '-i' setzt
// gleichmaessige Zeitstempel, '-vsync 0' gibt jedes Bild genau einmal aus.
const FFIN=['-r', String(M.video.fps||10), '-f','h264','-i','pipe:0'];
const exportFrames=(dir, pattern, extra=[])=>{ mkdirSync(dir, {recursive:true});
  const r=spawnSync('ffmpeg', ['-v','error','-y', ...FFIN,'-vf',upright,'-vsync','0', ...extra, join(dir, pattern)], {input:files['video.h264'], maxBuffer:1<<26});
  return r.status===0 ? null : String(r.stderr); };
if(png){ const e=exportFrames(png, 'bild-%05d.png'); console.log(e ? 'PNG fehlgeschlagen: '+e : `PNG: ${png}`); }

// ------------------------------------------------------------------------
// Nachspiel des Schaetzers ueber die Zeit, wie der Worker der App: requestSolve
// bei jeder neuen Erfassung (und bei Rueckgaengig / Pose-Sprung), nie zwei
// zugleich, nach dem Ende einmal neu, wenn inzwischen etwas dazukam. Die Dauer
// jeder Auswertung nimmt das Nachspiel aus LOG.timings.solve (dieselbe
// Reihenfolge; danach der Median), --takt=s setzt eine Mindestdauer.
// Pool: nur Erfassungen im Schwenk-Modus (ob.auto, wie S.pool); heraus beim
// Ereignis 'rückgängig' (die letzte) und 'pose-sprung' (die der 2 s davor und
// alle, die ein 'tracking-verloren' mit gleiten vorher markiert hat).
// Optionen wie solveOpt: Laser-Hoehe oder H0 2,55 ± 0,35 (S.frames bleibt leer,
// die Seite schickt keine Rahmen mit).
const S2ON=flag('stufe2')!=='0', SENK_N=flag('senk')!=null ? Math.max(0, Number(flag('senk'))||0) : 3, SENK_TOL=(Number(flag('senk-tol'))||1.5)*Math.PI/180;
const TAKT=Math.max(0, Number(flag('takt'))||0);
const slim=ob=>({ra:ob.ra, rb:ob.rb, t:ob.t});
const Rp=(()=>{
  const obs=R && (R.obs||[]).filter(o=>o.auto && o.ra && o.rb) || [];
  if(!obs.length || !G.solveSweepAuto) return null;
  // Wie startAR: S.H aus der Eingabe (hLaserMm ist gerundet).
  const hE=R.hEingabe!=null ? parseFloat(String(R.hEingabe).replace(',', '.')) : NaN;
  const opt=R.hLaserMm ? {H:hE>=1500 && hE<=6000 ? hE/1000 : R.hLaserMm/1000} : {H0:2.55, Hsigma:0.35};
  const evs=obs.map(o=>({t:o.t, o}));
  // Gleiten vor einem Tracking-Verlust markiert die letzten n Erfassungen im Pool
  // (suspect='gleiten?', sie bleiben drin); ein spaeterer Pose-Sprung mit
  // Verdaechtigen nimmt ALLE markierten heraus (S.pool.filter(o=>!o.suspect)).
  for(const e of R.events||[]){ if(e.type==='rückgängig') evs.push({t:e.t, undo:true}); if(e.type==='pose-sprung' && e.verdaechtig>0) evs.push({t:e.t, sus:e.t-2});
    if(e.type==='tracking-verloren' && e.gleiten>0) evs.push({t:e.t, gleiten:e.gleiten}); }
  evs.sort((a,b)=>a.t-b.t || (a.o ? 0 : 1)-(b.o ? 0 : 1));
  // LOG.timings.solve haelt nur die letzten 2000 (shift): dann passt dur[n] nicht
  // mehr zur n-ten Auswertung - alle mit dem Median.
  const dur0=R.timings && Array.isArray(R.timings.solve) ? R.timings.solve : [], durMed=q(dur0,0.5)||50, dur=dur0.length>=2000 ? [] : dur0;
  if(dur0.length>=2000) console.log(`  Worker-Laufzeiten gekappt (${dur0.length} im Protokoll) – Nachspiel mit dem Median ${f2(durMed)} ms je Auswertung.`);
  const st={opt, pool:[], i:0, busy:false, dirty:false, pend:null, sol:null, solT:null, solN:0, n:0, ms:[], solves:[], evs, dur, durN:dur0.length,
    live:null, liveFor:null, nObs:obs.length, err:0, mark:new Set()};
  // Dauer: die naechste protokollierte Laufzeit. Die App misst nur Auswertungen mit
  // Ergebnis (onSolved: if(r)) - eine ohne Ergebnis verbraucht keine.
  const start=t=>{ st.busy=true; st.dirty=false; const d=(st.n<dur.length ? dur[st.n] : durMed)/1000;
    st.pend={t0:t, t1:t+Math.max(d, TAKT), obs:st.pool.map(slim)}; };
  const request=t=>{ if(st.busy) st.dirty=true; else start(t); };
  const finish=()=>{ const p=st.pend; st.pend=null; st.busy=false; let r=null; const ta=performance.now();
    try{ r=G.solveSweepAuto(p.obs, opt); }catch(e){ r=null; }
    st.ms.push(performance.now()-ta);
    if(r){ st.sol=r; st.solT=p.t1; st.solN++; st.n++; } else st.err++;
    st.solves.push({t0:+p.t0.toFixed(3), t1:+p.t1.toFixed(3), n:p.obs.length, H:r && Number.isFinite(r.H) ? +r.H.toFixed(4) : null, walls:r && r.walls ? r.walls.length : 0});
    if(st.dirty) start(p.t1); };
  // Bis Zeit t: Ereignisse und Ergebnisse in zeitlicher Folge.
  st.advance=t=>{ for(;;){
      const te=st.i<evs.length ? evs[st.i].t : Infinity, tf=st.pend ? st.pend.t1 : Infinity;
      if(Math.min(te, tf)>t || (te===Infinity && tf===Infinity)) return;
      if(tf<=te){ finish(); continue; }
      const e=evs[st.i++];
      if(e.o) st.pool.push(e.o);
      else if(e.undo){ if(!st.pool.length) continue; st.pool.pop(); }
      else if(e.gleiten){ st.pool.slice(-e.gleiten).forEach(o=>st.mark.add(o)); continue; }
      else { const n0=st.pool.length; st.pool=st.pool.filter(o=>o.t<e.sus && !st.mark.has(o)); if(st.pool.length===n0) continue; }
      request(e.t);
    } };
  // Live-Modell wie liveModel(): je Ergebnis einmal, Rahmen k = 0 (die Seite
  // fuehrt keine Rahmen), Drift zur Ankunftszeit (nach der letzten Erfassung
  // bleibt sie stehen).
  st.liveModel=()=>{ const sol=st.sol; if(!sol || !sol.walls || !sol.walls.length || !sol.drift) return null;
    if(st.liveFor!==sol){ const map=G.modelToLive(sol, st.solT, 0); st.live=map ? G.overlayModel(sol, map) : null; st.liveFor=sol; }
    return st.live; };
  return st;
})();
const AUTO=!!(R && (R.mode==='automatisch' || (R.obs||[]).some(o=>o.auto)));

// Senkrechte einer Modellecke im Bild: ihr Bild schneidet das Suchband von
// verticalEdges (Bildmitte ± 0,32 Bildhoehe, |x| < 0,98) und die Ecke liegt
// nicht hinter einer Modellwand (Grundriss). top: Deckenpunkt im Bild (die
// Probe 'ecke' braucht ihn).
const segX=(p1,p2,p3,p4)=>{ const d=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const d1=d(p3,p4,p1), d2=d(p3,p4,p2), d3=d(p1,p2,p3), d4=d(p1,p2,p4);
  return ((d1>0&&d2<0)||(d1<0&&d2>0)) && ((d3>0&&d4<0)||(d3<0&&d4>0)); };
const cornerView=(p, H, camTo, live)=>{
  const cam=[camTo[12], camTo[14]], dx=p[0]-cam[0], dz=p[1]-cam[1], d=Math.hypot(dx, dz); if(d<0.4) return null;
  const s=G.projectSegment(proj, camTo, [p[0],0,p[1]], [p[0],H,p[1]]); if(!s) return null;
  if(!G.clipNdc([s[0][0]/0.98, s[0][1]/0.64], [s[1][0]/0.98, s[1][1]/0.64], 1)) return null;
  const qn=[p[0]-0.03*dx/d, p[1]-0.03*dz/d];
  for(const r of live.rows){ const [a,b]=r.span; if(segX(cam, qn, a, b)) return null; }
  const tp=G.project(proj, camTo, [p[0],H,p[1]]);
  return {az:Math.atan2(dz, dx), top:!!tp && Math.abs(tp[0])<=1 && Math.abs(tp[1])<=1, d};
};
const toPx=a=>[+((a[0]+1)/2*w).toFixed(1), +((1-a[1])/2*h).toFixed(1)];
const segPx=(A,B)=>{ const s=G.projectSegment(proj, camTo_, A, B), c=s && G.clipNdc(s[0], s[1], 1); return c ? [...toPx(c[0]), ...toPx(c[1])] : null; };
let camTo_=null;
const VCODE={passt:'p', abweichend:'a', schwach:'s', leiste:'l', keine:'k'}, KCODE={ecke:'e', durch:'d', unten:'u', weiter:'w'};

// Dekodieren als Graustufen und Bild fuer Bild nachspielen.
const stat={n:0, gleichKeine:0, gleich:0, abweichend:0, nurGeraet:0, nurNach:0, dPx:[], ms:[]}, nach=new Map();
const s2=new Map(), senk=new Map(), ov=new Map(), tm={s2:[], senk:[], dec:0};
const lineAt0=(A,B)=>Math.abs(B[0]-A[0])<1e-9 ? NaN : A[1]+(B[1]-A[1])*(0-A[0])/(B[0]-A[0]);
const angOf=(A,B)=>Math.atan2((B[1]-A[1])*h, (B[0]-A[0])*w)*180/Math.PI;
const tDec=performance.now();
// Je Bild mit sicherer Kante am Geraet: fand der Rechner dieselbe? (Zeit, 0/1)
// - das Mass dafuer, dass Bild k wirklich das Bild des Zustands k ist.
const agree=[];
// Luma-Probe: LOG.roiLuma (alle 30 XR-Bilder Mittel einer 256²-Mitte der vollen
// Kameratextur, 0,299 R + 0,587 G + 0,114 B) gegen das Mittel derselben Mitte im
// dekodierten Bild desselben XR-Bilds (Zeile kommt im selben Bild nach readRoi).
const camWH=M.geometrie && M.geometrie.camera || R && R.session && R.session.geometry && R.session.geometry.camera;
// Flache Mitte (max = Mittel: Objektiv zu, oder der Harness ohne Kamerabild) traegt nichts.
const roiL=(R && R.roiLuma || []).filter(x=>Number.isFinite(x.mean) && x.max-x.mean>=1), lumaP=[];
const roiBox=camWH ? (()=>{ const [CW,CH]=camWH, s=Math.min(256, CW, CH), x0=Math.floor((CW-s)/2), y0=Math.floor((CH-s)/2);
  return [Math.round(x0*w/CW), Math.round((x0+s)*w/CW), Math.round(y0*h/CH), Math.round((y0+s)*h/CH)]; })() : null;
const rowIdx=new Map(rows.map((r,i)=>[r, i]));
const roiOf=r=>{ const i=rowIdx.get(r), t=r[C.t], tp=i>0 ? rows[i-1][C.t] : -Infinity;
  let lo=0, hi=roiL.length-1, b=-1; while(lo<=hi){ const m=(lo+hi)>>1; if(roiL[m].t<=t+1e-4){ b=m; lo=m+1; } else hi=m-1; }
  return b>=0 && roiL[b].t>tp+1e-4 && t-roiL[b].t<0.08 ? roiL[b] : null; };
let nDec=0, rest=0;
await new Promise((res, rej)=>{
  const ff=spawn('ffmpeg', ['-v','error', ...FFIN, '-vsync','0','-f','rawvideo','-pix_fmt','gray','pipe:1']);
  let buf=Buffer.alloc(0), k=0; const FS=SW*SH;
  ff.stdout.on('data', d=>{ buf=Buffer.concat([buf, d]);
    while(buf.length>=FS){ const fr=buf.subarray(0, FS); buf=buf.subarray(FS); const r=byV.get(k++); nDec=k;
      if(!r || !proj) continue;
      const camTo=camToOf(r); if(!camTo) continue;
      const g=new Float32Array(w*h), fy=SPIEGELN ? !flipAt(r[C.t]) : flipAt(r[C.t]);
      for(let y=0;y<h;y++){ const yy=SPIEGELN ? h-1-y : y; for(let x=0;x<w;x++) g[yy*w+x]=fr[y*SW+x]; }
      if(roiBox && roiL.length){ const ro=roiOf(r); if(ro){ const [xa,xb,ya,yb]=roiBox; let sm=0, n=0;
        for(let y=ya;y<yb;y++) for(let x=xa;x<xb;x++){ sm+=fr[y*SW+x]; n++; } if(n) lumaP.push([ro.mean, sm/n, r[C.t]]); } }
      const ta=performance.now(), L=G.captureEdge(g, w, h, proj, camTo, fy); stat.ms.push(performance.now()-ta);
      nach.set(k-1, L ? [L.A[0], L.A[1], L.B[0], L.B[1], +L.z.toFixed(1)] : 0);
      extra(k-1, r, g, camTo, fy);
      const dev=r[C.live]; stat.n++;
      if(!L && !dev){ stat.gleichKeine++; continue; }
      if(!L){ stat.nurGeraet++; if(dev[5]) agree.push([r[C.t], 0]); continue; }
      if(!dev){ stat.nurNach++; continue; }
      const DA=[dev[0],dev[1]], DB=[dev[2],dev[3]];
      const dPx=Math.abs(lineAt0(L.A,L.B)-lineAt0(DA,DB))*h/2;
      const dA=Math.abs(((angOf(L.A,L.B)-angOf(DA,DB))%180+270)%180-90);
      stat.dPx.push(Number.isFinite(dPx) ? dPx : 1e9);
      const same=dPx<=1.5 && dA<=1; if(same) stat.gleich++; else stat.abweichend++;
      if(dev[5]) agree.push([r[C.t], same ? 1 : 0]);
    } });
  ff.on('error', rej); ff.on('close', ()=>{ rest=buf.length; res(); });
  ff.stdin.end(files['video.h264']);
});
tm.dec=performance.now()-tDec;
// Bilder: das Geraet zaehlt kodierte (bilder) und vom Kodierer zurueckgegebene
// (ausgegeben). Fehlt eins im Strom, ist ab dort jedes Bild einem falschen Zustand
// zugeordnet - captureEdge zeigt dann, ab wann.
if(nDec!==M.video.bilder || rest){ console.log(`Video: ${nDec} Bilder dekodiert, Gerät: ${M.video.bilder} kodiert, ${M.video.ausgegeben ?? '–'} ausgegeben${rest ? `, ${rest} Byte Rest (Bildgröße?)` : ''}`);
  auff.push(`Video: ${nDec} Bilder dekodiert statt ${M.video.bilder}${M.video.ausgegeben!=null && M.video.ausgegeben!==M.video.bilder ? ` (Kodierer gab ${M.video.ausgegeben} aus)` : ''}${rest ? `, ${rest} Byte Rest` : ''} – ab dem ersten fehlenden Bild gehört Bild k nicht mehr zum Zustand k, alle Bildvergleiche danach sind wertlos`); }
// Je Videobild k: Stufe 2 und Senkrechte (Ergebnisse in s2/senk), fuer den
// Pruefstand die Zeichnung (ov).
function extra(k, r, g, camTo, fy){
  const t=r[C.t], gated=(r[C.flags]&(2|4|8|32|64))!==0, keep=bericht && k%every===0;
  if(Rp) Rp.advance(t);
  const live=Rp && AUTO ? Rp.liveModel() : null, sol=live && Rp.sol, H=sol && sol.H;
  camTo_=camTo;
  const o=keep ? {m:[], s2:[], sk:null} : null;
  if(o && live && H>0){
    const Y=(p,y)=>[p[0],y,p[1]];
    for(const rw of live.rows){
      if(rw.virtual){ const s=segPx(Y(rw.span[0],H), Y(rw.span[1],H)); if(s) o.m.push([...s, 2]); continue; }
      if(rw.seen){ const s=segPx(Y(rw.seen[0],H), Y(rw.seen[1],H)); if(s) o.m.push([...s, 0]); }
      for(const [a,b] of rw.gaps){ const s=segPx(Y(a,H), Y(b,H)); if(s) o.m.push([...s, 1]); }
    }
    for(const v of live.verts){ const s=segPx(Y(v.p,0), Y(v.p,H)); if(s) o.m.push([...s, v.virtual ? 2 : 3]); }
  }
  // Stufe 2 wie trackFrame: nur im Schwenk-Modus, nicht in Pause, Ersatzbezug,
  // ohne Anker; je Bild (das Geraet nur jedes 2. ausgewertete Bild).
  if(S2ON && live && H>0 && !gated){
    const model=G.trackModel(sol, live, [camTo[12], camTo[14]]);
    if(model && model.walls.length){
      const ta=performance.now(), res=G.trackModelEdges(g, w, h, proj, camTo, model, {flipY:fy}); tm.s2.push(performance.now()-ta);
      const ws=res.walls.map(x=>{ const mw=model.walls.find(y=>y.k===x.k), W=sol.walls[x.k];
        return {k:x.k, v:G.trackJudge(x), s:x.status, status:x.status, z:x.z, A:x.A, B:x.B, pA:x.pred.A, pB:x.pred.B, dRho:x.dRho, dev:x.dev,
          band:x.band, lineAbove:x.lineAbove, rival:x.rival, other:x.other, sRho:mw && mw.sRho, span:mw && [mw.A, mw.B], line:W && W.line, seen:W && W.seen}; });
      s2.set(k, {t, solN:Rp.solN, H, cam:[camTo[12], camTo[13], camTo[14]], ws});
      if(o) for(const x of ws) if(x.A) o.s2.push([...toPx(x.A), ...toPx(x.B), VCODE[x.v]]);
    }
  }
  // Senkrechte auf jedes n-te Bild; die Peilung gegen die Modellecken kommt
  // nach dem Durchlauf (gegen den Endstand des Modells, s. u.).
  if(SENK_N && G.verticalEdges && k%SENK_N===0 && !(r[C.flags]&64)){
    const ta=performance.now(), vs=G.verticalEdges(g, w, h, proj, camTo, fy); tm.senk.push(performance.now()-ta);
    // grund/konkav (neuer Finder): 'unten' mit grund 'konvex' oder 'eine-seite' ist eine Peilung auf eine
    // moegliche Ecke, die erst ueber mehrere Bilder und eine Modellecke zaehlen darf - mitgeben, nicht verwerfen.
    const found=vs.map(x=>({az:Math.atan2(x.ray.d[2], x.ray.d[0]), kind:x.kind, grund:x.grund, konkav:x.konkav, z:x.z, top:x.top, bottom:x.bottom, fehl:false}));
    senk.set(k, {t, camTo, found, live:live && H>0 ? live : null, H});
    if(o) o.sk=found;
  }
  if(o) ov.set(k, o);
}
if(!proj) console.log('Keine Projektion im Manifest/Protokoll – kein Nachspiel des Detektors.');
else {
  const pc=x=>stat.n ? (100*x/stat.n).toFixed(0)+' %' : '–';
  console.log(`\nNachspiel captureEdge auf ${stat.n} dekodierten Bildern (Gerät gegen Rechner):`);
  console.log(`  gleich (≤1,5 px, ≤1°): ${stat.gleich} (${pc(stat.gleich)}), beide keine Kante: ${stat.gleichKeine} (${pc(stat.gleichKeine)})`);
  console.log(`  abweichend: ${stat.abweichend}, nur Gerät: ${stat.nurGeraet}, nur Rechner: ${stat.nurNach}`);
  if(stat.dPx.length) console.log(`  Versatz an der Bildmitte: Median ${f2(q(stat.dPx,0.5))} px, 90 % ${f2(q(stat.dPx,0.9))} px · Rechenzeit Median ${f2(q(stat.ms,0.5))} ms`);
  // Sichere Kanten des Geraets, je Zehntel der Aufnahme: ein verschobenes Bild
  // (fehlendes Bild im Strom), vertauschte Zeilen oder eine falsche Bildgroesse
  // druecken das unter 1/3 (synthetisch: verlustfrei 100 %; H.264 1,5 Mbit/s 87-94 %,
  // je Zehntel ab 15 Kanten 49-99 %; ein Bild verschluckt: 55 %, danach je Zehntel
  // 18-53 %; Zeilen vertauscht 0 %; Strom breiter, ohne Zeilenabstand gelesen, 1 %).
  if(agree.length>=20){
    const tw=(t1-t0)/10, win=Array.from({length:10},(_,i)=>agree.filter(([t])=>t>=t0+i*tw && (t<t0+(i+1)*tw || i===9)));
    const rate=a=>a.reduce((s,x)=>s+x[1],0)/a.length, all=rate(agree), low=win.map((a,i)=>[i,a]).filter(([,a])=>a.length>=15 && rate(a)<1/3);
    console.log(`  sichere Kanten am Gerät (${agree.length}): Rechner gleich ${(100*all).toFixed(0)} % · je Zehntel (${tw.toFixed(0)} s): ${win.map(a=>a.length>=5 ? (100*rate(a)).toFixed(0) : '–').join(' ')} %`);
    if(all<0.5 || low.length) auff.push(`captureEdge: der Rechner findet die sichere Kante des Geräts nur in ${(100*all).toFixed(0)} %${low.length ? ` (ab ${f2(t0+low[0][0]*tw)} s: ${low.map(([,a])=>(100*rate(a)).toFixed(0)).join('/')} %)` : ''} – gehört Bild k nicht zum Zustand k (Bild fehlt/verschoben, Zeilen vertauscht, Bildgröße)? Über die Zeit gleichmäßig niedrig eher Kompression (?vbr=). Die Bildvergleiche unten sind so nicht belastbar`);
  }
}
// Luma-Probe auswerten: Mittel Video gegen Geraet. Erwartet Unterschied ~0; Y im
// tv-Bereich ohne Streckung (Kennung 'pc') gaebe ≈ 16 + 0,86·L, volle Y mit Kennung
// 'tv' ≈ 1,16·(L−16) und Abschneiden ab 235 (helle Decken verlieren die Kante).
if(lumaP.length>=8){
  const d=lumaP.map(([a,b])=>b-a), md=q(d,0.5), xs=lumaP.map(p=>p[0]), sp=q(xs,0.9)-q(xs,0.1);
  let sl=NaN; if(sp>=30){ const mx=xs.reduce((s,x)=>s+x,0)/xs.length, my=lumaP.reduce((s,p)=>s+p[1],0)/xs.length;
    let sxy=0, sxx=0; for(const [a,b] of lumaP){ sxy+=(a-mx)*(b-my); sxx+=(a-mx)**2; } sl=sxy/sxx; }
  console.log(`Luma-Probe (LOG.roiLuma, Bildmitte, ${lumaP.length} Bilder): Video − Gerät Median ${md.toFixed(1)}, 10–90 % ${q(d,0.1).toFixed(1)}…${q(d,0.9).toFixed(1)} Stufen bei Gerät ${q(xs,0.1).toFixed(0)}–${q(xs,0.9).toFixed(0)}${Number.isFinite(sl) ? `, Steigung ${sl.toFixed(3)}` : ''}`);
  if(Math.abs(md)>6 || (Number.isFinite(sl) && Math.abs(sl-1)>0.08)) auff.push(`Luma: das dekodierte Bild ist ${md>0 ? 'heller' : 'dunkler'} als am Gerät (Median ${md.toFixed(1)} Stufen${Number.isFinite(sl) ? `, Steigung ${sl.toFixed(2)}` : ''}) – Bereichskennung des Stroms (tv/pc) passt nicht zu den Daten? Kanten in hellen Flächen können abgeschnitten sein`);
} else if(roiL.length) console.log(`Luma-Probe: nur ${lumaP.length} Bilder mit LOG.roiLuma im selben XR-Bild.`);
// Pose-Kette: Kamera im Bezug aus dem Zustand gegen obs.cam der Erfassungen
// (gleiches Bild, Flag „erfasst“). Prueft T - captureEdge selbst braucht aus
// der Pose nur „oben“ und merkt einen falschen Bezug nicht.
const obs=R && (R.obs || []);
if(obs && obs.length){
  const cap=rows.filter(r=>r[C.flags]&128), d=[], dT=[];
  for(const o of obs){ if(!o.cam) continue; let best=null;
    for(const r of cap){ const dt=Math.abs(r[C.t]-o.t); if(dt<0.05 && (!best || dt<best.dt)) best={r, dt}; }
    const ct=best && camToOf(best.r); if(ct){ const e=Math.hypot(ct[12]-o.cam[0], ct[13]-o.cam[1], ct[14]-o.cam[2]); d.push(e); if(e>0.02) dT.push(o.t); } }
  console.log(d.length ? `Pose-Kette: ${d.length} Erfassungen, Kamera im Bezug gegen obs.cam Median ${(q(d,0.5)*1000).toFixed(1)} mm, max ${(Math.max(...d)*1000).toFixed(1)} mm`
    : `Pose-Kette: keine Erfassung einem Zustand zuzuordnen (${obs.length} Erfassungen, ${cap.length} Zeilen „erfasst“).`);
  if(d.length && Math.max(...d)>0.02) auff.push(`Pose-Kette: Kamera im Bezug weicht von obs.cam ab (max ${(Math.max(...d)*1000).toFixed(0)} mm, ${d.filter(x=>x>0.02).length} von ${d.length} über 2 cm${dT.length ? ', zuerst bei '+f2(dT[0])+' s' : ''}) – Bezug T im Zustand passt nicht zu den Erfassungen`);
}
if(M.tiefe && files['tiefe.bin.gz']){
  const d=gunzipSync(files['tiefe.bin.gz']); let o=0, n=0; const med=[];
  while(o+80<=d.length){ const ww=d.readUInt16LE(o+8), hh=d.readUInt16LE(o+10), sc=d.readFloatLE(o+12), len=ww*hh*2;
    if(n%10===0){ const v=[]; for(let i=0;i<ww*hh;i+=7){ const raw=d.readUInt16LE(o+80+2*i); if(raw) v.push(raw*sc); } med.push(q(v,0.5)); }
    o+=80+len; n++; }
  console.log(`Tiefe: ${n} Bilder, Median-Abstand je 10. Bild: ${med.map(f2).join(' ')} m`);
}

// Bis zum Ende nachspielen: Endstand des Modells (Wandnummern der Ausgabe).
if(Rp) Rp.advance(Infinity);
const finalSol=Rp && Rp.sol, finalLive=Rp && AUTO ? Rp.liveModel() : null;
// Wand eines frueheren Ergebnisses -> Wand des Endstands (wie trkSame: Gerade
// < 10°, < 0,2 m, gesehene Stuecke ueberlappen). 0: keine.
const wallId=(l, seen)=>{ if(!finalSol || !l) return 0; let best=0, bd=Infinity;
  finalSol.walls.forEach((W,j)=>{ const hh=W.line; if(!hh) return;
    if(!(Math.abs(l.u[0]*hh.u[0]+l.u[1]*hh.u[1])>Math.cos(10*Math.PI/180))) return;
    const off=Math.abs(-hh.u[1]*(l.c[0]-hh.c[0])+hh.u[0]*(l.c[1]-hh.c[1])); if(off>=0.2) return;
    if(seen && W.seen){ const iv=sg=>{ const a=sg[0][0]*hh.u[0]+sg[0][1]*hh.u[1], b=sg[1][0]*hh.u[0]+sg[1][1]*hh.u[1]; return a<b ? [a,b] : [b,a]; };
      const [a0,a1]=iv(W.seen), [b0,b1]=iv(seen); if(Math.min(a1,b1)-Math.max(a0,b0)<=-0.1) return; }
    if(off<bd){ bd=off; best=j+1; } });
  return best; };

// ------------------------------------------------------------- Stufe 2
const s2sum={};
if(!S2ON) console.log('\nStufe 2: abgeschaltet (--stufe2=0).');
else if(!Rp || !AUTO) console.log(`\nStufe 2: kein Nachspiel (${!R ? 'kein Protokoll' : !AUTO ? 'nicht im Schwenk-Modus aufgenommen' : 'keine Erfassungen mit Strahlen im Protokoll'}).`);
else {
  const all=[...s2.values()], nW=all.reduce((a,x)=>a+x.ws.length, 0), cnt={};
  all.forEach(x=>x.ws.forEach(y=>{ cnt[y.v]=(cnt[y.v]||0)+1; }));
  const solMs=Rp.ms, nSol=Rp.solves.length;
  console.log(`\nStufe 2 offline auf ${all.length} Bildern (${nW} Wände · ${['passt','abweichend','schwach','leiste','keine'].map(v=>`${v} ${cnt[v]||0}`).join(', ')}):`);
  console.log(`  Schätzer nachgespielt: ${nSol} Auswertungen${Rp.err ? ` (${Rp.err} ohne Ergebnis)` : ''} (Gerät: ${Rp.durN} Laufzeiten im Protokoll${Rp.dur.length && Rp.dur.length!==Rp.solN ? ' – Takt weicht ab' : ''}), Pool am Ende ${Rp.pool.length} von ${Rp.nObs} Erfassungen, ${R.hLaserMm ? 'Laser '+(R.hLaserMm/1000).toFixed(3)+' m' : 'ohne Laser'}${TAKT ? `, höchstens alle ${TAKT} s` : ''}; Rechenzeit Median ${f2(q(solMs,0.5))} ms, Summe ${(solMs.reduce((a,b)=>a+b,0)/1000).toFixed(1)} s`);
  if(Rp.dur.length && Rp.dur.length!==Rp.solN && !TAKT && !(Rp.dur.length===2000 && Rp.solN>2000)) auff.push(`Worker-Takt: ${Rp.solN} Auswertungen mit Ergebnis nachgespielt, ${Rp.dur.length} am Gerät (Pool-Ereignisse fehlen?)`);
  // Je Wand des Endstands ueber die Zeit: ein Zeichen je Zeitfenster.
  const dur=Math.max(1, t1-t0), bin=Math.max(1, Math.ceil(dur/90)), nb=Math.ceil(dur/bin)+1;
  const per=new Map(), ch={passt:'P', abweichend:'A', schwach:'s', leiste:'l', keine:'·'};
  all.forEach(x=>x.ws.forEach(y=>{ const id=wallId(y.line, y.seen); y.id=id; if(!per.has(id)) per.set(id, {bins:Array.from({length:nb},()=>({})), n:{}, dRho:[]});
    const e=per.get(id), b=Math.floor((x.t-t0)/bin); e.bins[b][y.v]=(e.bins[b][y.v]||0)+1; e.n[y.v]=(e.n[y.v]||0)+1;
    if(y.A && y.dRho!=null && y.z>=15) e.dRho.push(y.dRho); }));
  console.log(`  je Wand (Endstand ${finalSol ? finalSol.walls.length+' Wände, H '+finalSol.H.toFixed(3)+' m' : '–'}), 1 Zeichen = ${bin} s: P passt, A weicht ab, s schwach, l Leiste, · keine, Leer = nicht verfolgt`);
  for(const [id,e] of [...per].sort((a,b)=>a[0]-b[0])){
    const line=e.bins.map(b=>{ const ks=Object.keys(b); if(!ks.length) return ' '; ks.sort((x,y)=>b[y]-b[x]); return ch[ks[0]]; }).join('');
    const sd=e.dRho.length ? ` · dRho (sicher) Median ${(100*q(e.dRho,0.5)).toFixed(1)} cm (n ${e.dRho.length})` : '';
    console.log(`  ${id ? 'Wand '+String(id).padStart(2) : 'andere '} |${line}| ${Object.entries(e.n).map(([v,n])=>`${v} ${n}`).join(', ')}${sd}`);
  }
  // Verteilung des Abstands Kante–Modell (an Enden und Mitte, das Mass von
  // trackJudge) und die Urteile bei anderem tolM.
  const withEdge=all.flatMap(x=>x.ws.filter(y=>y.A && y.dev && y.dev.every(d=>d.m!=null)));
  const dmax=y=>Math.max(...y.dev.map(d=>Math.abs(d.m))), sure=withEdge.filter(y=>y.z>=15);
  const hist=a=>{ const B=[0.01,0.02,0.03,0.04,0.06,0.10,Infinity], c=B.map(()=>0); a.forEach(v=>{ c[B.findIndex(b=>v<b)]++; });
    return ['<1','1-2','2-3','3-4','4-6','6-10','>10'].map((l,i)=>`${l} ${a.length ? (100*c[i]/a.length).toFixed(0) : 0} %`).join(' · '); };
  const dS=sure.map(dmax), dD=(R.trk||[]).filter(x=>x.A && x.z>=15 && x.dev!=null).map(x=>x.dev);
  console.log(`  Abstand Kante–Modell (max. über Enden und Mitte), sichere Kanten z ≥ 15: Median ${(100*q(dS,0.5)).toFixed(1)} cm, 90 % ${(100*q(dS,0.9)).toFixed(1)} cm (n ${dS.length})`);
  console.log(`    Nachspiel [cm]: ${hist(dS)}`);
  if(dD.length) console.log(`    Gerät (LOG.trk) [cm]: ${hist(dD)} (n ${dD.length})`);
  const tolRow=tol=>{ const c={}; all.forEach(x=>x.ws.forEach(y=>{ const v=G.trackJudge(y, {tolM:tol}); c[v]=(c[v]||0)+1; }));
    return `${(tol*100).toFixed(0)} cm: passt ${c.passt||0}, abweichend ${c.abweichend||0}, schwach ${c.schwach||0}`; };
  console.log(`  Urteile bei anderem tolM (heute 3 cm): ${[0.01,0.02,0.03,0.04,0.05,0.08].map(tolRow).join(' · ')}`);
  // Raumhoehe des Modells aus Stufe 2: liegt die Modelldecke um dH zu hoch, passt
  // das Modell nur aus dem Abstand, aus dem erfasst wurde - aus jedem anderen misst
  // Stufe 2 dRho = e_Wand - dH·d/Δ (d Abstand Kamera–Modellwand, Δ Modellhoehe ueber
  // der Kamera). Steigung ueber alle sicheren Kanten, je Wand eigener Achsenabschnitt,
  // robust (3 × MAD). Braucht Abstaende, die sich unterscheiden.
  { const pts=[];
    for(const x of all) for(const y of x.ws){ if(!y.A || !(y.z>=15) || y.dRho==null || Math.abs(y.dRho)>0.3 || !y.span || !y.id) continue;
      const Dl=x.H-x.cam[1]; if(!(Dl>0.2)) continue;
      const v=[y.span[1][0]-y.span[0][0], y.span[1][1]-y.span[0][1]], L=Math.hypot(v[0],v[1]); if(!(L>0)) continue;
      const d=Math.abs((x.cam[0]-y.span[0][0])*v[1]-(x.cam[2]-y.span[0][1])*v[0])/L; pts.push({w:y.id, x:d/Dl, y:y.dRho}); }
    let use=pts, b=NaN, se=NaN, xr=[NaN,NaN];
    for(let it=0; it<4 && use.length>=10; it++){
      const g=new Map(); use.forEach(p=>{ if(!g.has(p.w)) g.set(p.w, []); g.get(p.w).push(p); });
      let sxy=0, sxx=0; const mu=new Map(); for(const [w,a] of g){ const mx=a.reduce((s,p)=>s+p.x,0)/a.length, my=a.reduce((s,p)=>s+p.y,0)/a.length; mu.set(w,[mx,my]);
        for(const p of a){ sxy+=(p.x-mx)*(p.y-my); sxx+=(p.x-mx)**2; } }
      if(!(sxx>0)) break; b=sxy/sxx;
      const res=pts.map(p=>{ const m=mu.get(p.w); return m ? p.y-m[1]-b*(p.x-m[0]) : Infinity; }), ar=res.filter(Number.isFinite).map(Math.abs), mad=Math.max(0.01, 1.4826*q(ar,0.5));
      const nu=pts.filter((p,i)=>Math.abs(res[i])<=3*mad); const ss=use.reduce((s,p)=>{ const m=mu.get(p.w); return s+(p.y-m[1]-b*(p.x-m[0]))**2; },0);
      se=Math.sqrt(ss/Math.max(1, use.length-g.size-1)/sxx); xr=[q(use.map(p=>p.x),0.1), q(use.map(p=>p.x),0.9)]; use=nu; }
    if(Number.isFinite(b)){ const dH=-b;
      console.log(`  Raumhöhe aus Stufe 2 (dRho gegen Abstand/Höhe über der Kamera, je Wand): Modelldecke ${dH>=0 ? '+' : ''}${(100*dH).toFixed(1)} ± ${(100*se).toFixed(1)} cm gegen die Kanten im Bild (n ${use.length} von ${pts.length}, d/Δ ${f2(xr[0])}…${f2(xr[1])}; Untergrenze – das Modell gleicht einen Teil über die Wandlage aus)`);
      // Untergrenze: der Schaetzer gleicht einen Teil ueber Wandlage und Drift aus
      // (synthetisch: wahr -3,4 / +5,1 cm, hier gesehen -2,0 / +1,0 cm).
      if(Math.abs(dH)>0.015 && Math.abs(dH)>3*se) auff.push(`Raumhöhe: Stufe 2 sieht die Modelldecke ${dH>0 ? 'zu hoch' : 'zu tief'} (mindestens ${dH>=0 ? '+' : ''}${(100*dH).toFixed(1)} ± ${(100*se).toFixed(1)} cm, Modell H ${finalSol ? finalSol.H.toFixed(3) : '–'} m)`); }
    else console.log(`  Raumhöhe aus Stufe 2: zu wenig sichere Kanten (${pts.length}).`); }
  Object.assign(s2sum, {dS, all});
  // Gegen die Stichproben des Geraets: je Stichprobe die Zeile ihres Bildes
  // (letzte Zeile mit t <= trk.t: recFrame kommt vor trackFrame), ist sie im
  // Video -> gleiches Bild, sonst das Videobild davor oder danach (±1 Bild).
  // Wand: die Nachspiel-Wand mit der naechsten Vorhersage (pA, pB); liegt die
  // Vorhersage mehr als 1 px / 0,3° daneben, war das Modell ein anderes.
  const trk=R.trk||[];
  if(!trk.length) console.log('  Gerät: keine Stichproben (LOG.trk leer).');
  else {
    const rowT=rows.map(r=>r[C.t]), vOf=new Map(rows.map((r,i)=>[i, r[C.v]]));
    const rowAt=t=>{ let lo=0, hi=rowT.length-1, b=-1; while(lo<=hi){ const m=(lo+hi)>>1; if(rowT[m]<=t+1e-4){ b=m; lo=m+1; } else hi=m-1; } return b; };
    const P2=a=>[a[0]*w/2, a[1]*h/2], perp=(p,a,b)=>{ const d=[b[0]-a[0], b[1]-a[1]], L=Math.hypot(d[0],d[1])||1; return Math.abs((p[0]-a[0])*d[1]-(p[1]-a[1])*d[0])/L; };
    const angPx=(a,b)=>Math.atan2(b[1]-a[1], b[0]-a[0]);
    const B={gleich:{n:0,m:0,vEq:0,eEq:0,eN:0,conf:{},dd:[],off:[]}, nachbar:{n:0,m:0,vEq:0,eEq:0,eN:0,conf:{},dd:[],off:[]}}, predOff=[], predT=[];
    let ohne=0, ohneN=0, nS=0;
    const match=[];
    trk.forEach((x,ti)=>{ nS++;
      const j=rowAt(x.t); let k=-1, kind=null;
      if(j>=0 && vOf.get(j)>=0){ k=vOf.get(j); kind='gleich'; }
      else for(const jj of [j-1, j+1]) if(jj>=0 && jj<rows.length && vOf.get(jj)>=0){ k=vOf.get(jj); kind='nachbar'; break; }
      if(k<0){ ohne++; return; }
      if(!s2.has(k)){ ohneN++; return; }
      const res=s2.get(k).ws, dA=P2(x.pA), dB=P2(x.pB);
      let best=null, bd=Infinity; for(const y of res){ const oA=P2(y.pA), oB=P2(y.pB), c=Math.max(Math.hypot(dA[0]-oA[0],dA[1]-oA[1]), Math.hypot(dB[0]-oB[0],dB[1]-oB[1])); if(c<bd){ bd=c; best=y; } }
      const b=B[kind]; b.n++;
      if(!best){ match.push({ti, t:x.t, k, kind, v:x.v}); return; }
      const oA=P2(best.pA), oB=P2(best.pB), po=Math.max(perp(dA,oA,oB), perp(dB,oA,oB)), pa=Math.abs(deg(wrap(2*(angPx(dA,dB)-angPx(oA,oB)))/2));
      const same=po<=1 && pa<=0.3; if(kind==='gleich'){ predOff.push(po); predT.push([x.t, po]); }
      match.push({ti, t:x.t, k, kind, wall:best.k, id:best.id, v:x.v, vNach:best.v, same, predPx:+po.toFixed(2)});
      if(!same) return;
      b.m++; if(best.v===x.v) b.vEq++; const key=x.v+'→'+best.v; b.conf[key]=(b.conf[key]||0)+1;
      if(x.A && best.A){ b.eN++; const a1=P2(x.A), b1=P2(x.B), a2=P2(best.A), b2=P2(best.B), mid=[(a1[0]+b1[0])/2,(a1[1]+b1[1])/2];
        const off=perp(mid,a2,b2), da=Math.abs(deg(wrap(2*(angPx(a1,b1)-angPx(a2,b2)))/2)); b.off.push(off); if(off<=1.5 && da<=1) b.eEq++;
        if(x.dRho!=null && best.dRho!=null) b.dd.push(Math.abs(x.dRho-best.dRho)); }
    });
    console.log(`  Gerät gegen Nachspiel: ${nS} Stichproben (LOG.trk), ${B.gleich.n} im selben Videobild, ${B.nachbar.n} im Nachbarbild (±1), ${ohne} ohne Videobild, ${ohneN} ohne Nachspiel-Modell`);
    if(predOff.length) console.log(`    Modell: Vorhersage im selben Bild Median ${f2(q(predOff,0.5))} px, 90 % ${f2(q(predOff,0.9))} px daneben; gleich (≤1 px, ≤0,3°): ${predOff.filter(x=>x<=1).length}/${predOff.length}`);
    for(const [kk,b] of Object.entries(B)){ if(!b.n) continue;
      const conf=Object.entries(b.conf).filter(([k])=>k.split('→')[0]!==k.split('→')[1]).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,n])=>`${k} ${n}`).join(', ');
      console.log(`    ${kk==='gleich' ? 'selbes Bild' : 'Nachbarbild'}, gleiches Modell (${b.m}): Urteil gleich ${b.vEq} (${b.m ? (100*b.vEq/b.m).toFixed(0) : '–'} %)${conf ? ' · verschieden: '+conf : ''}`);
      if(b.eN) console.log(`      Kante gleich (≤1,5 px, ≤1°): ${b.eEq}/${b.eN} · Versatz Median ${f2(q(b.off,0.5))} px, 90 % ${f2(q(b.off,0.9))} px · |ΔdRho| Median ${(100*q(b.dd,0.5)).toFixed(1)} cm`); }
    { const badT=predT.filter(([,po])=>po>2); if(badT.length>=5 && badT.length>=0.1*predT.length && !(q(predOff,0.5)>2))
        auff.push(`Modell nachgespielt ≠ Gerät in ${badT.length} von ${predT.length} Stichproben (ab ${f2(badT[0][0])} s, Median dort ${f2(q(badT.map(x=>x[1]),0.5))} px)`); }
    if(predOff.length>=10 && q(predOff,0.5)>2) auff.push(`Modell nachgespielt ≠ Gerät: Vorhersage im selben Bild im Median ${f2(q(predOff,0.5))} px daneben (Protokoll, Laser-Höhe oder Bezug T passen nicht zur Aufnahme – oder das Pool-Nachspiel: Rückgängig/Pose-Sprung/Gleiten)`);
    if(B.gleich.m>=10 && B.gleich.vEq/B.gleich.m<0.9) auff.push(`Stufe 2: Urteil Gerät ≠ Nachspiel in ${(100-100*B.gleich.vEq/B.gleich.m).toFixed(0)} % (selbes Bild, gleiches Modell) – H.264 oder Rechenweg?`);
    Object.assign(s2sum, {match, B, predOff});
  }
  if(finalSol){ const sys=[...per].filter(([id])=>id).map(([,e])=>q(e.dRho,0.5)).filter(Number.isFinite);
    if(sys.length>=2 && sys.every(x=>x>0.03) || sys.length>=2 && sys.every(x=>x<-0.03)) auff.push(`Stufe 2: alle Wände systematisch ${sys[0]>0 ? 'näher' : 'ferner'} als das Modell (dRho ${sys.map(x=>(100*x).toFixed(0)).join('/')} cm) – Raumhöhe oder Bezug?`); }
}

// ---------------------------------------------------------- Senkrechte
// Peilung gegen die Ecken des Modells: je Bild der Endstand des Schaetzers im
// Rahmen der Kamera zu diesem Zeitpunkt (modelToLive mit der Drift an t) -
// vollstaendiger und genauer als der Stand, den die App gerade hatte (der fehlt
// vor dem Rundgang noch Ecken); zum Vergleich auch gegen jenen Stand.
const sksum={};
if(!SENK_N) console.log('\nSenkrechte: abgeschaltet (--senk=0).');
else if(!G.verticalEdges) console.log(`\nSenkrechte: G.verticalEdges fehlt (weder in der Seite noch ${flag('senk-js')||'raumskizze-senkrechte.js'}).`);
else if(!senk.size) console.log(`\nSenkrechte: kein Bild ausgewertet${proj ? '' : ' (keine Projektion)'}.`);
else {
  const all=[...senk.values()], fs=all.flatMap(x=>x.found), byK={};
  fs.forEach(f=>{ byK[f.kind]=(byK[f.kind]||0)+1; });
  const byG={}; fs.forEach(f=>{ if(f.grund) byG[f.kind+'/'+f.grund]=(byG[f.kind+'/'+f.grund]||0)+1; });
  console.log(`\nSenkrechte (G.verticalEdges aus ${senkQuelle==='Seite' ? 'der Seite' : senkQuelle.split('/').pop()}) auf ${all.length} Bildern (jedes ${SENK_N}.): ${fs.length} gefunden (${Object.entries(byK).map(([k,n])=>`${k} ${n}`).join(', ')}) · Zeit je Bild Median ${f2(q(tm.senk,0.5))} ms, 90 % ${f2(q(tm.senk,0.9))} ms, max ${f2(Math.max(...tm.senk))} ms`);
  if(Object.keys(byG).length) console.log(`  nach Grund: ${Object.entries(byG).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`${k} ${n}`).join(', ')}`);
  if(!finalSol || !finalSol.drift || !(finalSol.H>0)) console.log('  ohne Modell (keine Auswertung im Nachspiel) – keine Peilung gegen Ecken.');
  else {
    const per=new Map(), dAz=[], fehl=[], bias=[]; let eck=0, liveHit=0, liveN=0, liveFehl=0, liveEck=0;
    const nearest=(found, az)=>{ let best=null, bd=Infinity; for(const f of found){ const d=Math.abs(wrap(f.az-az)); if(d<bd){ bd=d; best=f; } } return bd<=SENK_TOL ? best : null; };
    for(const x of all){
      const map=G.modelToLive(finalSol, x.t, 0), L=map && G.overlayModel(finalSol, map); if(!L) continue;
      const cam=[x.camTo[12], x.camTo[14]], azOf=p=>Math.atan2(p[1]-cam[1], p[0]-cam[0]);
      L.verts.forEach((v,j)=>{ const cv=cornerView(v.p, finalSol.H, x.camTo, L); if(!cv) return;
        if(!per.has(j)) per.set(j, {n:0, top:0, hit:0, ecke:0, kinds:{}, d:[], virt:v.virtual});
        const c=per.get(j); c.n++; if(cv.top) c.top++;
        const f=nearest(x.found, cv.az); if(f){ c.hit++; c.kinds[f.kind]=(c.kinds[f.kind]||0)+1; if(f.kind==='ecke') c.ecke++; const sd=deg(wrap(f.az-cv.az)); c.d.push(sd); dAz.push(sd); }
        // fuer den systematischen Versatz (Bezug gedreht): naechste Senkrechte ±5°
        let b5=null, d5=5*Math.PI/180; for(const g of x.found){ const d=Math.abs(wrap(g.az-cv.az)); if(d<d5){ d5=d; b5=g; } }
        if(b5) bias.push([x.t, deg(wrap(b5.az-cv.az))]); });
      for(const f of x.found){ if(f.kind!=='ecke') continue; eck++;
        if(!L.verts.some(v=>Math.abs(wrap(azOf(v.p)-f.az))<=SENK_TOL)){ f.fehl=true; fehl.push({t:x.t, az:deg(f.az), z:f.z}); } }
      // gegen den Stand der App zu diesem Zeitpunkt
      if(x.live){ x.live.verts.forEach(v=>{ const cv=cornerView(v.p, x.H, x.camTo, x.live); if(!cv) return; liveN++; if(nearest(x.found, cv.az)) liveHit++; });
        for(const f of x.found) if(f.kind==='ecke'){ liveEck++; if(!x.live.verts.some(v=>Math.abs(wrap(azOf(v.p)-f.az))<=SENK_TOL)) liveFehl++; } }
    }
    console.log(`  Ecken des Endstands (${finalSol.walls.length} Wände) im Bild – Senkrechte im Suchband, nicht verdeckt; Treffer = Senkrechte innerhalb ±${deg(SENK_TOL).toFixed(1)}°:`);
    for(const [j,c] of [...per].sort((a,b)=>a[0]-b[0]))
      console.log(`    Ecke ${String(j+1).padStart(2)}${c.virt ? ' (ergänzt)' : ''}: im Bild ${c.n}× (Decke ${c.top}×), getroffen ${c.hit} (${(100*c.hit/c.n).toFixed(0)} %), als 'ecke' ${c.ecke} · ${Object.entries(c.kinds).map(([k,n])=>`${k} ${n}`).join(', ')||'–'}${c.d.length ? ` · Δaz Median ${q(c.d,0.5).toFixed(2)}°` : ''}`);
    console.log(`  Fehlpeilungen ('ecke' ohne Ecke des Endstands ±${deg(SENK_TOL).toFixed(1)}°): ${fehl.length} von ${eck}${fehl.length ? ' · z. B. '+fehl.slice(0,4).map(f=>`${f2(f.t)} s ${f.az.toFixed(1)}°`).join(', ') : ''}`);
    if(liveN || liveEck) console.log(`  gegen den Stand der App im Bild: Ecken im Bild ${liveN}×, getroffen ${liveHit} (${liveN ? (100*liveHit/liveN).toFixed(0) : '–'} %); 'ecke' ohne Ecke im damaligen Modell ${liveFehl} von ${liveEck}`);
    if(dAz.length) console.log(`  Δaz Senkrechte – Modellecke über alle Treffer: Median ${q(dAz,0.5).toFixed(2)}°, 10–90 % ${q(dAz,0.1).toFixed(2)}…${q(dAz,0.9).toFixed(2)}° (n ${dAz.length})`);
    // Ueber die Zeit (je Zehntel der Aufnahme): Median der naechsten Senkrechten
    // (±5°) je Modellecke - ein gedrehter Bezug verschiebt ab dann alle gleich.
    const tw=(t1-t0)/10, win=Array.from({length:10},(_,i)=>bias.filter(([t])=>t>=t0+i*tw && (t<t0+(i+1)*tw || i===9)).map(([,d])=>d));
    console.log(`  Versatz nächste Senkrechte (±5°) je Modellecke über die Zeit (je ${tw.toFixed(0)} s, Median °): ${win.map(a=>a.length>=3 ? q(a,0.5).toFixed(1) : '–').join(' ')} (Hinweis: Bezug gedreht → alle Fenster ab dann gleich versetzt; Modellfehler versetzen einzelne Ecken)`);
    // Nur Hinweis: ein Fehler des Modells verschiebt einzelne Ecken genauso (synthetisch,
    // Modell bis 24 cm daneben: bis 3,4° ohne jeden Fehler im Bezug) - den Bezug pruefen
    // die Pose-Kette und die Vorhersage gegen das Geraet.
    Object.assign(sksum, {per, fehl, dAz});
  }
}
// Hoehe: mit welcher Hoehe hob die App die Erfassungen (ob.Hlive), gegen
// Laser bzw. Nachspiel; Endergebnis des Geraets gegen den Endstand.
if(obs && obs.length){
  const hl=obs.filter(o=>o.auto && Number.isFinite(o.Hlive)).map(o=>o.Hlive);
  // Kreuzprobe wie computeResult: der Pool am Ende ohne Laser ausgewertet (Hoehe aus
  // der Parallaxe). Eine falsch eingetippte Laser-Hoehe passt das Modell im Bild
  // weitgehend an (Waende mitskaliert) - auffaellig wird sie hier.
  if(R.hLaserMm && Rp && Rp.pool.length>=3){ let fr=null; try{ fr=G.solveSweepAuto(Rp.pool.map(slim), {H0:2.55, Hsigma:0.35}); }catch(e){}
    const a=R.result && R.result.auto, HL=R.hLaserMm/1000;
    if(fr && !fr.Hfixed && Number.isFinite(fr.H)){ const d=HL-fr.H, sg=fr.sH||0;
      console.log(`Kreuzprobe ohne Laser (nachgerechnet): H ${fr.H.toFixed(3)} ± ${(sg).toFixed(3)} m${a && Number.isFinite(a.Hfree) ? ` (Gerät ${a.Hfree.toFixed(3)} m)` : ''} – Laser ${HL.toFixed(3)} m, Unterschied ${(100*d).toFixed(1)} cm`);
      if(Math.abs(d)>Math.max(0.03, 3*sg)) auff.push(`Raumhöhe: Laser ${HL.toFixed(3)} m, aus der Parallaxe ${fr.H.toFixed(3)} ± ${sg.toFixed(3)} m (${(100*d).toFixed(1)} cm) – Laser-Höhe falsch eingetippt?`); }
    else console.log('Kreuzprobe ohne Laser: Höhe aus der Parallaxe nicht bestimmt.'); }
  if(hl.length && R.hLaserMm){ const dH=hl.map(x=>Math.abs(x-R.hLaserMm/1000)), m=q(dH,0.5);
    console.log(`Höhe: Laser im Protokoll ${(R.hLaserMm/1000).toFixed(3)} m, Erfassungen gehoben mit ${q(hl,0.5).toFixed(3)} m (Median)${R.result && R.result.auto && Number.isFinite(R.result.auto.H) ? `, Ergebnis Gerät ${R.result.auto.H.toFixed(3)} m` : ''}${finalSol ? `, Nachspiel ${finalSol.H.toFixed(3)} m` : ''}`);
    if(m>0.005) auff.push(`Höhe: Laser im Protokoll ${(R.hLaserMm/1000).toFixed(3)} m, die App hob die Erfassungen mit ${q(hl,0.5).toFixed(3)} m – Protokoll und Aufnahme passen nicht`); }
  else if(hl.length && finalSol){ const rH=R.result && R.result.auto && Number.isFinite(R.result.auto.H) ? R.result.auto.H : null;
    console.log(`Höhe (ohne Laser): Erfassungen gehoben mit ${q(hl,0.5).toFixed(3)} m (Median), Ergebnis Gerät ${rH!=null ? rH.toFixed(3)+' m' : '–'}, Nachspiel ${finalSol.H.toFixed(3)} m`);
    if(rH!=null && Math.abs(rH-finalSol.H)>0.02) auff.push(`Höhe: Ergebnis Gerät ${rH.toFixed(3)} m, Nachspiel ${finalSol.H.toFixed(3)} m`); }
}

// Ansicht des Pruefstands: eine Datei, liest daten.js und bilder/.
const BERICHT_HTML=`<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Aufnahme-Prüfstand</title>
<style>
  :root { color-scheme: dark; --bg:#0f1115; --fg:#e6e8eb; --mute:#9aa2ad; --geraet:#4ade80; --nach:#e879f9;
    --modell:#ffffff; --luecke:#cbd5e1; --ergaenzt:#f87171; --passt:#22c55e; --weicht:#fb923c; --schwach:#94a3b8;
    --s-ecke:#22d3ee; --s-durch:#facc15; --s-unten:#a3a3a3; --s-weiter:#c084fc; --fehl:#ef4444; }
  body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.4 system-ui,sans-serif; }
  header { padding:10px 16px; display:flex; flex-wrap:wrap; gap:8px 16px; align-items:center; border-bottom:1px solid #222; }
  header b { font-size:15px; }
  .chip { padding:2px 8px; border-radius:10px; font-size:12px; background:#2a2e36; }
  .chip.rot { background:#b91c1c; } .chip.gelb { background:#a16207; } .chip.gruen { background:#166534; }
  main { display:flex; justify-content:center; padding:12px 16px; }
  #wrap { position:relative; height:min(78vh, 1280px); aspect-ratio: var(--ar); max-width:calc(100vw - 32px); }
  #wrap img, #wrap canvas { position:absolute; inset:0; width:100%; height:100%; }
  nav { display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:center; padding:0 16px 16px; }
  button { background:#2a2e36; color:var(--fg); border:0; border-radius:6px; padding:8px 12px; font:inherit; cursor:pointer; }
  input[type=range] { width:min(600px, 90vw); }
  .leg { display:flex; flex-wrap:wrap; gap:6px 14px; padding:0 16px 8px; justify-content:center; font-size:13px; }
  .leg label { cursor:pointer; user-select:none; } .leg i { display:inline-block; width:18px; height:3px; vertical-align:middle; margin:0 4px 0 2px; }
  #info { padding:0 16px 16px; text-align:center; color:var(--mute); font-size:13px; }
</style></head><body>
<header><b id="name"></b><span id="pos"></span><span id="zeit"></span><span id="chips"></span></header>
<div class="leg">
  <label><input type="checkbox" data-l="geraet" checked><i style="background:var(--geraet)"></i>Kante am Telefon</label>
  <label><input type="checkbox" data-l="nach" checked><i style="background:repeating-linear-gradient(90deg,var(--nach) 0 5px,transparent 5px 9px)"></i>nachgerechnet</label>
  <label><input type="checkbox" data-l="modell" checked><i style="background:var(--modell)"></i>Modell (gesehen</label><span><i style="background:repeating-linear-gradient(90deg,var(--luecke) 0 4px,transparent 4px 8px)"></i>ungesehen, <i style="background:repeating-linear-gradient(90deg,var(--ergaenzt) 0 4px,transparent 4px 8px)"></i>ergänzt, Ecken als Lote)</span>
  <label><input type="checkbox" data-l="s2" checked><i style="background:var(--passt);height:5px"></i>Stufe 2 passt <i style="background:var(--weicht);height:5px"></i>weicht ab <i style="background:var(--schwach)"></i>schwach/Leiste (je Bild, ohne die 3-aus-4-Glättung der App)</label>
  <label><input type="checkbox" data-l="s2g" checked><i style="background:repeating-linear-gradient(90deg,#fff 0 2px,transparent 2px 5px)"></i>Stufe 2 am Telefon (LOG.trk, Farbe = Urteil)</label>
  <label><input type="checkbox" data-l="senk" checked><i style="background:var(--s-ecke)"></i>Senkrechte ecke <i style="background:var(--s-durch)"></i>durch <i style="background:var(--s-unten)"></i>unten <i style="background:var(--s-weiter)"></i>weiter, <i style="background:var(--fehl)"></i>Fehlpeilung</label>
</div>
<main><div id="wrap"><img id="img" alt=""><canvas id="cv"></canvas></div></main>
<nav><button id="zur">◀</button><button id="spiel">▶ Abspielen</button><button id="vor">▶</button>
  <input id="sl" type="range" min="0" value="0"><button id="erf">nächste Erfassung</button><button id="abw">nächste Abweichung</button>
  <button id="nA">nächstes „weicht ab“</button><button id="nG">nächstes Telefon ≠ Nachspiel</button><button id="nF">nächste Fehlpeilung</button></nav>
<div id="info"></div>
<script src="daten.js"></script>
<script>
const D=DATEN, F=D.frames, $=id=>document.getElementById(id);
document.documentElement.style.setProperty('--ar', D.w+'/'+D.h);
$('name').textContent=D.name; $('sl').max=F.length-1;
let i=0, timer=null;
const on={}; document.querySelectorAll('[data-l]').forEach(c=>{ let v=null; try{ v=localStorage.getItem('pruefstand.'+c.dataset.l); }catch(e){}
  if(v!=null) c.checked=v==='1'; on[c.dataset.l]=c.checked;
  c.onchange=()=>{ on[c.dataset.l]=c.checked; try{ localStorage.setItem('pruefstand.'+c.dataset.l, c.checked ? '1' : '0'); }catch(e){} zeige(i); }; });
const abw=f=>(f.geraet?1:0)!==(f.nach?1:0) || (f.geraet && f.nach && Math.abs((f.geraet[1]+f.geraet[3])/2-(f.nach[1]+f.nach[3])/2)>1.5);
const KN={e:'ecke', d:'durch', u:'unten', w:'weiter'};
const gUneins=f=>(f.g||[]).some(x=>x[5]);
function zeige(n){ i=Math.max(0, Math.min(F.length-1, n)); const f=F[i];
  $('img').src='bilder/b-'+String(f.i).padStart(5,'0')+'.jpg'; $('sl').value=i;
  $('pos').textContent=\`Bild \${i+1}/\${F.length}\`; $('zeit').textContent=\`\${f.t.toFixed(2)} s · \${f.tempo}°/s\`;
  const c=[]; const fl=D.flags;
  if(f.f&fl.ankerVerloren) c.push(['Ortung weg','rot']); if(f.f&fl.ersatz) c.push(['Ersatz','gelb']); if(f.f&fl.ersatzSchlecht) c.push(['Ersatz passt nicht','rot']);
  if(f.f&fl.sprungHalt) c.push(['Sprung gehalten','gelb']); if(f.f&fl.geschaetzt) c.push(['Pose geschätzt','gelb']); if(f.f&fl.pause) c.push(['Pause','']);
  if(f.f&fl.ohneBezug) c.push(['ohne Bezug','rot']); if(f.f&fl.erfasst) c.push(['erfasst','gruen']); if(abw(f)) c.push(['Telefon ≠ nachgerechnet','gelb']);
  if(gUneins(f)) c.push(['Stufe 2: Telefon ≠ Nachspiel','gelb']); if((f.sk||[]).some(x=>x[6])) c.push(['Fehlpeilung','rot']);
  $('chips').innerHTML=c.map(([t,k])=>\`<span class="chip \${k}">\${t}</span>\`).join(' ');
  const cv=$('cv'), r=cv.getBoundingClientRect(), dpr=devicePixelRatio||1; cv.width=r.width*dpr; cv.height=r.height*dpr;
  const g=cv.getContext('2d'), sx=cv.width/D.w, sy=cv.height/D.h, css=getComputedStyle(document.documentElement), col=k=>css.getPropertyValue(k);
  g.lineCap='round';
  g.strokeStyle='rgba(255,255,255,.7)'; g.lineWidth=1*dpr; g.beginPath(); g.moveTo(cv.width/2-12*dpr, cv.height/2); g.lineTo(cv.width/2+12*dpr, cv.height/2);
  g.moveTo(cv.width/2, cv.height/2-12*dpr); g.lineTo(cv.width/2, cv.height/2+12*dpr); g.stroke();
  const ln=(a,color,wd,dash=[],halo=0)=>{ if(!a) return; if(halo){ g.setLineDash([]); g.strokeStyle='rgba(0,0,0,.6)'; g.lineWidth=(wd+halo)*dpr; g.beginPath(); g.moveTo(a[0]*sx,a[1]*sy); g.lineTo(a[2]*sx,a[3]*sy); g.stroke(); }
    g.setLineDash(dash.map(x=>x*dpr)); g.strokeStyle=color; g.lineWidth=wd*dpr; g.beginPath(); g.moveTo(a[0]*sx,a[1]*sy); g.lineTo(a[2]*sx,a[3]*sy); g.stroke(); g.setLineDash([]); };
  if(on.modell) for(const m of f.m||[]) ln(m, [col('--modell'), col('--luecke'), col('--ergaenzt'), 'rgba(255,255,255,.6)'][m[4]], m[4]===3 ? 1.2 : 1.8, m[4]===1 ? [6,5] : m[4]===2 ? [8,6] : []);
  if(on.senk) for(const s of f.sk||[]){ const k={e:'--s-ecke', d:'--s-durch', u:'--s-unten', w:'--s-weiter'}[s[4]]||'--s-unten';
    ln(s, s[6] ? col('--fehl') : col(k), 2, [], 2); g.fillStyle=s[6] ? col('--fehl') : col(k); g.font=\`\${11*dpr}px system-ui\`; g.fillText((KN[s[4]]||'?')+' z'+s[5], s[0]*sx+4*dpr, s[1]*sy-4*dpr); }
  if(on.s2) for(const s of f.s2||[]) ln(s, s[4]==='p' ? col('--passt') : s[4]==='a' ? col('--weicht') : col('--schwach'), s[4]==='p'||s[4]==='a' ? 4 : 2, [], 2);
  if(on.s2g) for(const s of f.g||[]) ln(s, s[4]==='p' ? col('--passt') : s[4]==='a' ? col('--weicht') : col('--schwach'), 1.5, [2,3]);
  if(on.geraet) ln(f.geraet, col('--geraet'), 2.5); if(on.nach) ln(f.nach, col('--nach'), 2.5, [6,4]);
  const inf=[];
  if(f.s2v) inf.push('Stufe 2: '+f.s2v); if(f.gv) inf.push('Telefon: '+f.gv); if(f.sk && f.sk.length) inf.push('Senkrechte: '+f.sk.map(s=>(KN[s[4]]||'?')+(s[6]?' (Fehlpeilung)':'')).join(', '));
  $('info').textContent=inf.join(' · ');
}
const such=(pred)=>{ for(let n=i+1;n<F.length;n++) if(pred(F[n])) return zeige(n); };
$('zur').onclick=()=>zeige(i-1); $('vor').onclick=()=>zeige(i+1); $('sl').oninput=e=>zeige(+e.target.value);
$('erf').onclick=()=>such(f=>f.f&D.flags.erfasst); $('abw').onclick=()=>such(abw);
$('nA').onclick=()=>such(f=>(f.s2||[]).some(s=>s[4]==='a')); $('nG').onclick=()=>such(gUneins); $('nF').onclick=()=>such(f=>(f.sk||[]).some(s=>s[6]));
$('spiel').onclick=()=>{ if(timer){ clearInterval(timer); timer=null; $('spiel').textContent='▶ Abspielen'; } else { timer=setInterval(()=>{ if(i>=F.length-1){ $('spiel').click(); return; } zeige(i+1); }, 100); $('spiel').textContent='❚❚ Halt'; } };
addEventListener('keydown', e=>{ if(e.key==='ArrowLeft') zeige(i-1); else if(e.key==='ArrowRight') zeige(i+1); else if(e.key===' '){ e.preventDefault(); $('spiel').click(); } });
addEventListener('resize', ()=>zeige(i)); $('img').onload=()=>zeige(i);
zeige(0);
</script></body></html>
`;

// Pruefstand: Bilder als JPEG plus Daten je Bild, Ansicht in index.html.
const tB=performance.now();
if(bericht){
  const e=exportFrames(join(bericht, 'bilder'), 'b-%05d.jpg', ['-q:v','3']);
  if(e){ console.log('Bericht fehlgeschlagen: '+e); }
  else {
    const px=a=>a ? [+((a[0]+1)/2*w).toFixed(1), +((1-a[1])/2*h).toFixed(1), +((a[2]+1)/2*w).toFixed(1), +((1-a[3])/2*h).toFixed(1), a[4]] : 0;
    // Stufe 2 des Geraets je Videobild (selbes Bild oder Nachbarbild).
    const gOf=new Map(); for(const x of s2sum.match||[]){ if(!gOf.has(x.k)) gOf.set(x.k, []); gOf.get(x.k).push(x); }
    const frames=[];
    for(let k=0, i=1; byV.size && k<=Math.max(...byV.keys()); k+=every, i++){ const r=byV.get(k); if(!r) continue;
      const fr={i, k, t:r[C.t], f:r[C.flags], tempo:r[C.tempo], geraet:px(r[C.live]), nach:px(nach.get(k) ?? 0)}, o=ov.get(k);
      if(o){ if(o.m.length) fr.m=o.m; if(o.s2.length) fr.s2=o.s2; if(o.sk && o.sk.length) fr.sk=o.sk.map(f=>[...toPx(f.top), ...toPx(f.bottom), KCODE[f.kind]||'?', Math.round(f.z), f.fehl ? 1 : 0]); }
      const r2=s2.get(k); if(r2 && r2.ws.length) fr.s2v=r2.ws.map(x=>`W${x.id||'?'} ${x.v}${x.A && x.dev ? ' '+(100*Math.max(...x.dev.map(d=>Math.abs(d.m??0)))).toFixed(1)+' cm' : ''}`).join(', ');
      const gm=gOf.get(k); if(gm){ fr.g=[];
        for(const x of gm){ const y=R.trk[x.ti]; if(y.A) fr.g.push([...toPx(y.A), ...toPx(y.B), VCODE[y.v]||'k', x.same && x.vNach!==y.v ? 1 : 0]);
          else if(x.same && x.vNach!==y.v) fr.g.push([0,0,0,0,VCODE[y.v]||'k',1]); }
        fr.gv=gm.map(x=>`W${x.id||'?'} ${x.v}${x.same ? (x.vNach===x.v ? ' (=)' : ' ≠ '+x.vNach) : ' (anderes Modell)'}${x.kind==='nachbar' ? ' (Nachbarbild)' : ''}`).join(', '); }
      frames.push(fr); }
    writeFileSync(join(bericht, 'daten.js'), 'const DATEN='+JSON.stringify({name:M.name, w, h, flags:M.zustand.flags, frames})+';\n');
    writeFileSync(join(bericht, 'index.html'), BERICHT_HTML);
    console.log(`Prüfstand: ${join(bericht, 'index.html')} (${frames.length} Bilder)`);
  }
}
// Ergebnisse je Bild als JSON (fuer Gegenpruefungen gegen eine Wahrheit).
if(flag('json')){
  const r5=x=>x==null ? null : +(+x).toFixed(5), nd=a=>a ? a.map(r5) : null;
  const out={name:M.name, w, h, proj, flipY, tolM:0.03, senkTol:deg(SENK_TOL),
    final:finalSol ? {H:finalSol.H, walls:finalSol.walls.map(W=>({line:W.line, seen:W.seen})), verts:finalLive ? finalLive.verts : null} : null,
    solves:Rp ? Rp.solves : [], match:s2sum.match||[],
    frames:[...byV.keys()].sort((a,b)=>a-b).filter(k=>s2.has(k) || senk.has(k)).map(k=>{ const r=byV.get(k), ct=camToOf(r), a=s2.get(k), b=senk.get(k);
      return {k, t:r[C.t], cam:ct && ct.map(r5), H:a ? a.H : null,
        s2:a ? a.ws.map(x=>({k:x.k, id:x.id, v:x.v, s:x.s, z:x.z!=null ? +x.z.toFixed(1) : null, A:nd(x.A), B:nd(x.B), pA:nd(x.pA), pB:nd(x.pB), dRho:r5(x.dRho),
          dev:x.dev ? x.dev.map(d=>({px:+d.px.toFixed(2), m:r5(d.m)})) : null, span:x.span && x.span.map(nd), sRho:r5(x.sRho)})) : null,
        senk:b ? {found:b.found.map(f=>({az:r5(f.az), kind:f.kind, grund:f.grund, konkav:f.konkav, z:+f.z.toFixed(1), fehl:f.fehl, top:nd(f.top), bottom:nd(f.bottom)}))} : null}; })};
  writeFileSync(flag('json'), JSON.stringify(out));
  console.log(`JSON: ${flag('json')}`);
}
console.log(auff.length ? `\nAuffällig:\n${auff.map(x=>'  - '+x).join('\n')}` : '\nAuffällig: nichts.');
const sum=a=>a.reduce((x,y)=>x+y, 0)/1000;
console.log(`Laufzeit: ${((performance.now()-tStart)/1000).toFixed(1)} s (Dekodieren und Nachspiel ${(tm.dec/1000).toFixed(1)} s: captureEdge ${sum(stat.ms).toFixed(1)} s, Schätzer ${Rp ? sum(Rp.ms).toFixed(1) : 0} s in ${Rp ? Rp.ms.length : 0} Läufen, Stufe 2 ${sum(tm.s2).toFixed(1)} s, Senkrechte ${sum(tm.senk).toFixed(1)} s${bericht ? `; Prüfstand ${((performance.now()-tB)/1000).toFixed(1)} s` : ''})`);
