// raumskizze-aufnahme.mjs — wertet eine Aufnahme von raumskizze-probe.html
// („Aufnahme sichern“, TAR) aus: Überblick, Bezugszustand über die Zeit und
// Nachspiel des Kantendetektors auf den dekodierten Bildern gegen das, was
// das Telefon im selben Bild fand. Stimmen beide überein, taugt das Video
// als Prüfstand für Änderungen an captureEdge (und als Trainingsmaterial).
//
//   node raumskizze-aufnahme.mjs aufnahme.tar|ordner [--html=seite] [--png=ordner] [--bericht=ordner] [--jede=n]
//
// --html rechnet mit einem anderen Stand der Seite nach. --png legt die Bilder
// aufrecht (Zeile 0 = oben) als PNG ab, --jede=n nur jedes n-te. --bericht
// schreibt einen Pruefstand zum Durchblaettern (index.html): Bild, Kante am
// Geraet, nachgerechnete Kante, Zustand. Braucht ffmpeg.
import {readFileSync, writeFileSync, statSync, readdirSync, mkdirSync} from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import {resolve, join} from 'node:path';
import {gunzipSync} from 'node:zlib';

const argv=process.argv.slice(2);
const flag=n=>argv.find(a=>a.startsWith('--'+n+'='))?.split('=')[1];
const src=argv.find(a=>!a.startsWith('--'));
if(!src){ console.error('Aufruf: node raumskizze-aufnahme.mjs aufnahme.tar|ordner [--html=seite] [--png=ordner] [--bericht=ordner] [--jede=n]'); process.exit(1); }
const HTML=flag('html') ? resolve(flag('html')) : new URL('./raumskizze-probe.html', import.meta.url);
const html=readFileSync(HTML, 'utf8');
const pick=id=>{ const m=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`)); if(!m) throw new Error(id); return m[1]; };
new Function(pick('vendor')+'\n'+pick('geo'))();
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
const C=Object.fromEntries(M.zustand.spalten.map((k,i)=>[k,i]));
const f2=x=>Number.isFinite(x) ? x.toFixed(2) : '–';
const q=(a,p)=>{ if(!a.length) return NaN; const s=[...a].sort((x,y)=>x-y); return s[Math.min(s.length-1, Math.floor(p*s.length))]; };

console.log(`Aufnahme ${M.name} · ${M.geraet||'–'} · Format ${M.format} v${M.version}`);
if(M.fehler) console.log(`  Fehler am Gerät: ${M.fehler}`);
const t0=rows.length ? rows[0][C.t] : NaN, t1=rows.length ? rows[rows.length-1][C.t] : NaN;
console.log(`Zustand: ${rows.length} Zeilen, ${f2(t0)}–${f2(t1)} s`);
if(M.video) console.log(`Video: ${M.video.codec} ${M.video.width}×${M.video.height}, ${M.video.bilder} Bilder (${M.video.ausgelassen} ausgelassen), ${(M.video.bytes/1e6).toFixed(1)} MB, ${M.video.bitrate/1e6} Mbit/s`);
if(M.tiefe) console.log(`Tiefe: ${M.tiefe.bilder} Bilder, Format ${M.tiefe.format||'–'}`);
// Zustand ueber die Zeit: Flags als Intervalle, Luecken im Takt.
const gaps=[]; for(let i=1;i<rows.length;i++){ const d=rows[i][C.t]-rows[i-1][C.t]; if(d>0.5) gaps.push([rows[i-1][C.t], d]); }
// Takt: ausgewertet wird jedes 3. XR-Bild (S.frame%3), der Abstand der Zeilen
// zeigt also die Bildrate am Geraet.
{ const dt=[]; for(let i=1;i<rows.length;i++){ const d=rows[i][C.t]-rows[i-1][C.t]; if(d>0 && d<0.5) dt.push(d*1000); }
  if(dt.length) console.log(`Takt: ausgewertete Bilder alle ${f2(q(dt,0.5))} ms (Median), 90 % ${f2(q(dt,0.9))} ms → etwa ${(3000/q(dt,0.5)).toFixed(0)} XR-Bilder/s`); }
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
const proj=M.geometrie && M.geometrie.proj || P && P.session && P.session.geometry && P.session.geometry.proj;
const [w, h]=[M.bild.breite, M.bild.hoehe], [W2, H2]=M.bild.gepolstert, flipY=!!M.bild.flipY;
if(spawnSync('ffmpeg', ['-version']).status!==0){ console.log('ffmpeg fehlt – kein Nachspiel.'); process.exit(0); }
const byV=new Map(); rows.forEach(r=>{ if(r[C.v]>=0) byV.set(r[C.v], r); });

const png=flag('png'), bericht=flag('bericht'), every=Math.max(1, Number(flag('jede'))||1);
// Aufrecht (Zeile 0 = oben): ohne flipY liegt Zeile 0 unten (readPixels) -> vflip;
// die gepolsterte Spalte faellt weg.
const upright=`crop=${w}:${h}:0:0${flipY ? '' : ',vflip'},select=not(mod(n\\,${every}))`;
const exportFrames=(dir, pattern, extra=[])=>{ mkdirSync(dir, {recursive:true});
  const r=spawnSync('ffmpeg', ['-v','error','-y','-f','h264','-i','pipe:0','-vf',upright,'-vsync','0', ...extra, join(dir, pattern)], {input:files['video.h264'], maxBuffer:1<<26});
  return r.status===0 ? null : String(r.stderr); };
if(png){ const e=exportFrames(png, 'bild-%05d.png'); console.log(e ? 'PNG fehlgeschlagen: '+e : `PNG: ${png}`); }

// Dekodieren als Graustufen und Bild fuer Bild nachspielen.
const stat={n:0, gleichKeine:0, gleich:0, abweichend:0, nurGeraet:0, nurNach:0, dPx:[], ms:[]}, nach=new Map();
const lineAt0=(A,B)=>Math.abs(B[0]-A[0])<1e-9 ? NaN : A[1]+(B[1]-A[1])*(0-A[0])/(B[0]-A[0]);
const angOf=(A,B)=>Math.atan2((B[1]-A[1])*h, (B[0]-A[0])*w)*180/Math.PI;
await new Promise((res, rej)=>{
  const ff=spawn('ffmpeg', ['-v','error','-f','h264','-i','pipe:0','-f','rawvideo','-pix_fmt','gray','pipe:1']);
  let buf=Buffer.alloc(0), k=0; const FS=W2*H2;
  ff.stdout.on('data', d=>{ buf=Buffer.concat([buf, d]);
    while(buf.length>=FS){ const fr=buf.subarray(0, FS); buf=buf.subarray(FS); const r=byV.get(k++);
      if(!r || !proj) continue;
      const camTo=camToOf(r); if(!camTo) continue;
      const g=new Float32Array(w*h); for(let y=0;y<h;y++) for(let x=0;x<w;x++) g[y*w+x]=fr[y*W2+x];
      const ta=performance.now(), L=G.captureEdge(g, w, h, proj, camTo, flipY); stat.ms.push(performance.now()-ta);
      nach.set(k-1, L ? [L.A[0], L.A[1], L.B[0], L.B[1], +L.z.toFixed(1)] : 0);
      const dev=r[C.live]; stat.n++;
      if(!L && !dev){ stat.gleichKeine++; continue; }
      if(!L){ stat.nurGeraet++; continue; }
      if(!dev){ stat.nurNach++; continue; }
      const DA=[dev[0],dev[1]], DB=[dev[2],dev[3]];
      const dPx=Math.abs(lineAt0(L.A,L.B)-lineAt0(DA,DB))*h/2;
      const dA=Math.abs(((angOf(L.A,L.B)-angOf(DA,DB))%180+270)%180-90);
      stat.dPx.push(Number.isFinite(dPx) ? dPx : 1e9);
      if(dPx<=1.5 && dA<=1) stat.gleich++; else stat.abweichend++;
    } });
  ff.on('error', rej); ff.on('close', res);
  ff.stdin.end(files['video.h264']);
});
if(!proj) console.log('Keine Projektion im Manifest/Protokoll – kein Nachspiel des Detektors.');
else {
  const pc=x=>stat.n ? (100*x/stat.n).toFixed(0)+' %' : '–';
  console.log(`\nNachspiel captureEdge auf ${stat.n} dekodierten Bildern (Gerät gegen Rechner):`);
  console.log(`  gleich (≤1,5 px, ≤1°): ${stat.gleich} (${pc(stat.gleich)}), beide keine Kante: ${stat.gleichKeine} (${pc(stat.gleichKeine)})`);
  console.log(`  abweichend: ${stat.abweichend}, nur Gerät: ${stat.nurGeraet}, nur Rechner: ${stat.nurNach}`);
  if(stat.dPx.length) console.log(`  Versatz an der Bildmitte: Median ${f2(q(stat.dPx,0.5))} px, 90 % ${f2(q(stat.dPx,0.9))} px · Rechenzeit Median ${f2(q(stat.ms,0.5))} ms`);
}
// Pose-Kette: Kamera im Bezug aus dem Zustand gegen obs.cam der Erfassungen
// (gleiches Bild, Flag „erfasst“). Prueft T - captureEdge selbst braucht aus
// der Pose nur „oben“ und merkt einen falschen Bezug nicht.
const obs=P && (P.obs || []);
if(obs && obs.length){
  const cap=rows.filter(r=>r[C.flags]&128), d=[];
  for(const o of obs){ if(!o.cam) continue; let best=null;
    for(const r of cap){ const dt=Math.abs(r[C.t]-o.t); if(dt<0.05 && (!best || dt<best.dt)) best={r, dt}; }
    const ct=best && camToOf(best.r); if(ct) d.push(Math.hypot(ct[12]-o.cam[0], ct[13]-o.cam[1], ct[14]-o.cam[2])); }
  console.log(d.length ? `Pose-Kette: ${d.length} Erfassungen, Kamera im Bezug gegen obs.cam Median ${(q(d,0.5)*1000).toFixed(1)} mm, max ${(Math.max(...d)*1000).toFixed(1)} mm`
    : `Pose-Kette: keine Erfassung einem Zustand zuzuordnen (${obs.length} Erfassungen, ${cap.length} Zeilen „erfasst“).`);
}
if(M.tiefe && files['tiefe.bin.gz']){
  const d=gunzipSync(files['tiefe.bin.gz']); let o=0, n=0; const med=[];
  while(o+80<=d.length){ const ww=d.readUInt16LE(o+8), hh=d.readUInt16LE(o+10), sc=d.readFloatLE(o+12), len=ww*hh*2;
    if(n%10===0){ const v=[]; for(let i=0;i<ww*hh;i+=7){ const raw=d.readUInt16LE(o+80+2*i); if(raw) v.push(raw*sc); } med.push(q(v,0.5)); }
    o+=80+len; n++; }
  console.log(`Tiefe: ${n} Bilder, Median-Abstand je 10. Bild: ${med.map(f2).join(' ')} m`);
}

// Ansicht des Pruefstands: eine Datei, liest daten.js und bilder/.
const BERICHT_HTML=`<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Aufnahme-Prüfstand</title>
<style>
  :root { color-scheme: dark; --bg:#0f1115; --fg:#e6e8eb; --mute:#9aa2ad; --geraet:#4ade80; --nach:#e879f9; }
  body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.4 system-ui,sans-serif; }
  header { padding:10px 16px; display:flex; flex-wrap:wrap; gap:8px 16px; align-items:center; border-bottom:1px solid #222; }
  header b { font-size:15px; }
  .chip { padding:2px 8px; border-radius:10px; font-size:12px; background:#2a2e36; }
  .chip.rot { background:#b91c1c; } .chip.gelb { background:#a16207; } .chip.gruen { background:#166534; }
  main { display:flex; justify-content:center; padding:12px 16px; }
  #wrap { position:relative; height:min(78vh, 1280px); aspect-ratio: var(--ar); }
  #wrap img, #wrap canvas { position:absolute; inset:0; width:100%; height:100%; }
  nav { display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:center; padding:0 16px 16px; }
  button { background:#2a2e36; color:var(--fg); border:0; border-radius:6px; padding:8px 12px; font:inherit; cursor:pointer; }
  input[type=range] { width:min(600px, 90vw); }
  .leg span { margin-right:14px; } .leg i { display:inline-block; width:18px; height:3px; vertical-align:middle; margin-right:6px; }
</style></head><body>
<header><b id="name"></b><span id="pos"></span><span id="zeit"></span><span id="chips"></span>
  <span class="leg"><span><i style="background:var(--geraet)"></i>Kante am Telefon</span><span><i style="background:repeating-linear-gradient(90deg,var(--nach) 0 5px,transparent 5px 9px)"></i>nachgerechnet</span></span></header>
<main><div id="wrap"><img id="img" alt=""><canvas id="cv"></canvas></div></main>
<nav><button id="zur">◀</button><button id="spiel">▶ Abspielen</button><button id="vor">▶</button>
  <input id="sl" type="range" min="0" value="0"><button id="erf">nächste Erfassung</button><button id="abw">nächste Abweichung</button></nav>
<script src="daten.js"></script>
<script>
const D=DATEN, F=D.frames, $=id=>document.getElementById(id);
document.documentElement.style.setProperty('--ar', D.w+'/'+D.h);
$('name').textContent=D.name; $('sl').max=F.length-1;
let i=0, timer=null;
const abw=f=>(f.geraet?1:0)!==(f.nach?1:0) || (f.geraet && f.nach && Math.abs((f.geraet[1]+f.geraet[3])/2-(f.nach[1]+f.nach[3])/2)>1.5);
function zeige(n){ i=Math.max(0, Math.min(F.length-1, n)); const f=F[i];
  $('img').src='bilder/b-'+String(f.i).padStart(5,'0')+'.jpg'; $('sl').value=i;
  $('pos').textContent=\`Bild \${i+1}/\${F.length}\`; $('zeit').textContent=\`\${f.t.toFixed(2)} s · \${f.tempo}°/s\`;
  const c=[]; const fl=D.flags;
  if(f.f&fl.ankerVerloren) c.push(['Ortung weg','rot']); if(f.f&fl.ersatz) c.push(['Ersatz','gelb']); if(f.f&fl.ersatzSchlecht) c.push(['Ersatz passt nicht','rot']);
  if(f.f&fl.sprungHalt) c.push(['Sprung gehalten','gelb']); if(f.f&fl.geschaetzt) c.push(['Pose geschätzt','gelb']); if(f.f&fl.pause) c.push(['Pause','']);
  if(f.f&fl.ohneBezug) c.push(['ohne Bezug','rot']); if(f.f&fl.erfasst) c.push(['erfasst','gruen']); if(abw(f)) c.push(['Telefon ≠ nachgerechnet','gelb']);
  $('chips').innerHTML=c.map(([t,k])=>\`<span class="chip \${k}">\${t}</span>\`).join(' ');
  const cv=$('cv'), r=cv.getBoundingClientRect(), dpr=devicePixelRatio||1; cv.width=r.width*dpr; cv.height=r.height*dpr;
  const g=cv.getContext('2d'), sx=cv.width/D.w, sy=cv.height/D.h;
  g.strokeStyle='rgba(255,255,255,.7)'; g.lineWidth=1*dpr; g.beginPath(); g.moveTo(cv.width/2-12*dpr, cv.height/2); g.lineTo(cv.width/2+12*dpr, cv.height/2);
  g.moveTo(cv.width/2, cv.height/2-12*dpr); g.lineTo(cv.width/2, cv.height/2+12*dpr); g.stroke();
  const ln=(a,col,dash)=>{ if(!a) return; g.setLineDash(dash.map(x=>x*dpr)); g.strokeStyle=col; g.lineWidth=2.5*dpr; g.beginPath(); g.moveTo(a[0]*sx,a[1]*sy); g.lineTo(a[2]*sx,a[3]*sy); g.stroke(); g.setLineDash([]); };
  const css=getComputedStyle(document.documentElement);
  ln(f.geraet, css.getPropertyValue('--geraet'), []); ln(f.nach, css.getPropertyValue('--nach'), [6,4]);
}
const such=(pred)=>{ for(let n=i+1;n<F.length;n++) if(pred(F[n])) return zeige(n); };
$('zur').onclick=()=>zeige(i-1); $('vor').onclick=()=>zeige(i+1); $('sl').oninput=e=>zeige(+e.target.value);
$('erf').onclick=()=>such(f=>f.f&D.flags.erfasst); $('abw').onclick=()=>such(abw);
$('spiel').onclick=()=>{ if(timer){ clearInterval(timer); timer=null; $('spiel').textContent='▶ Abspielen'; } else { timer=setInterval(()=>{ if(i>=F.length-1){ $('spiel').click(); return; } zeige(i+1); }, 100); $('spiel').textContent='❚❚ Halt'; } };
addEventListener('keydown', e=>{ if(e.key==='ArrowLeft') zeige(i-1); else if(e.key==='ArrowRight') zeige(i+1); else if(e.key===' '){ e.preventDefault(); $('spiel').click(); } });
addEventListener('resize', ()=>zeige(i)); $('img').onload=()=>zeige(i);
zeige(0);
</script></body></html>
`;

// Pruefstand: Bilder als JPEG plus Daten je Bild, Ansicht in index.html.
if(bericht){
  const e=exportFrames(join(bericht, 'bilder'), 'b-%05d.jpg', ['-q:v','3']);
  if(e){ console.log('Bericht fehlgeschlagen: '+e); }
  else {
    const px=a=>a ? [+((a[0]+1)/2*w).toFixed(1), +((1-a[1])/2*h).toFixed(1), +((a[2]+1)/2*w).toFixed(1), +((1-a[3])/2*h).toFixed(1), a[4]] : 0;
    const frames=[];
    for(let k=0, i=1; byV.size && k<=Math.max(...byV.keys()); k+=every, i++){ const r=byV.get(k); if(!r) continue;
      frames.push({i, k, t:r[C.t], f:r[C.flags], tempo:r[C.tempo], geraet:px(r[C.live]), nach:px(nach.get(k) ?? 0)}); }
    writeFileSync(join(bericht, 'daten.js'), 'const DATEN='+JSON.stringify({name:M.name, w, h, flags:M.zustand.flags, frames})+';\n');
    writeFileSync(join(bericht, 'index.html'), BERICHT_HTML);
    console.log(`Prüfstand: ${join(bericht, 'index.html')} (${frames.length} Bilder)`);
  }
}
