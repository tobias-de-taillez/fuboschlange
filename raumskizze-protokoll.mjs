// raumskizze-protokoll.mjs — wertet ein Protokoll von raumskizze-probe.html
// („Protokoll sichern“) aus: Zeitlinie, Tracking- und Ankerausfaelle,
// Kamerahoehe und Abstand zur Decke, Nachrechnung mit dem aktuellen Schaetzer
// (mit und ohne Laser-Hoehe), dazu ein Grundriss als SVG.
//
//   node raumskizze-protokoll.mjs protokoll.json [--html=pfad] [--svg=grundriss.svg] [--lauf=n]
//
// --html rechnet mit einem anderen Stand der Seite nach (z. B. dem, der im
// Test lief). --lauf waehlt einen frueheren Durchlauf aus LOG.runs (0 = erster);
// ohne ist es der letzte.
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const argv=process.argv.slice(2);
const flag=n=>argv.find(a=>a.startsWith('--'+n+'='))?.split('=')[1];
const file=argv.find(a=>!a.startsWith('--'));
if(!file){ console.error('Aufruf: node raumskizze-protokoll.mjs protokoll.json [--html=pfad] [--svg=grundriss.svg] [--lauf=n]'); process.exit(1); }
const HTML=flag('html') ? resolve(flag('html')) : new URL('./raumskizze-probe.html', import.meta.url);
const html=readFileSync(HTML,'utf8');
const pick=id=>{ const m=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`)); if(!m) throw new Error(id); return m[1]; };
new Function(pick('vendor')+'\n'+pick('geo'))();
const G=globalThis.RAUMSKIZZE;

const P=JSON.parse(readFileSync(file,'utf8'));
const lauf=flag('lauf');
const R=lauf!=null ? P.runs[+lauf] : P;
if(!R) throw new Error('Durchlauf '+lauf+' fehlt');
const f2=x=>Number.isFinite(x) ? x.toFixed(2) : '–', f3=x=>Number.isFinite(x) ? x.toFixed(3) : '–';
const q=(a,p)=>{ if(!a.length) return NaN; const s=[...a].sort((x,y)=>x-y); return s[Math.min(s.length-1,Math.floor(p*s.length))]; };

console.log(`Protokoll ${P.started}  ${P.caps && P.caps.Browser || ''}`);
console.log(`Durchlauf ${lauf!=null ? lauf : 'letzter'}: Modus ${R.mode || '–'}, Laser-Höhe ${R.hLaserMm ? R.hLaserMm+' mm' : 'keine'}, frühere Durchläufe ${P.runs.length}`);
const S=R.session||{};
console.log(`Sitzung ${f2(S.start)}–${f2(S.end)} s, Funktionen: ${(S.enabledFeatures||[]).join(', ')}`);
if(R.floor) console.log(`Boden: Kamera ${f3(R.floor.camHeight)} m darüber, Normale ${R.floor.normalDeg}°, ${R.floor.anchor ? 'Anker' : 'ohne Anker'}, bei ${f2(R.floor.t)} s`);
const T=R.tracking||{};
console.log(`Tracking-Bilder: ok ${T.ok}, geschätzt ${T.emulated}, verloren ${T.lost}, Anker ohne Pose ${T.anchorLost}`);

// Zeitlinie: Ausfaelle als Intervalle.
const ev=R.events||[];
const spans=(on,off)=>{ const out=[]; let a=null; for(const e of ev){ if(e.type===on && a==null) a=e.t; else if(e.type===off && a!=null){ out.push([a,e.t]); a=null; } }
  if(a!=null) out.push([a, S.end ?? Infinity]); return out; };
const tl=spans('tracking-verloren','tracking-zurück'), al=spans('anker-verloren','anker-zurück');
console.log(`Tracking-Ausfälle: ${tl.map(([a,b])=>`${f2(a)}–${f2(b)} s (${f2(b-a)} s)`).join(', ') || 'keine'}`);
console.log(`Anker ohne Pose:   ${al.map(([a,b])=>`${f2(a)}–${f2(b)} s (${f2(b-a)} s)`).join(', ') || 'keiner'}`);
const other=ev.filter(e=>!/^(tracking-|anker-verloren|anker-zurück)/.test(e.type));
const cnt={}; other.forEach(e=>cnt[e.type]=(cnt[e.type]||0)+1);
console.log('Ereignisse: '+Object.entries(cnt).map(([k,v])=>v>1 ? `${k}×${v}` : k).join(', '));

// Erfassungen.
const all=R.obs||[], obs=all.filter(o=>!o.undone);
console.log(`Erfassungen: ${all.length}, zurückgenommen ${all.length-obs.length}` + (obs.length ? `, Zeit ${f2(obs[0].t)}–${f2(obs[obs.length-1].t)} s` : ''));
if(obs.length){
  const lastObs=obs[obs.length-1].t, end=S.end ?? lastObs;
  if(end-lastObs>10) console.log(`  Nach der letzten Erfassung noch ${f2(end-lastObs)} s ohne Erfassung.`);
  const camY=obs.map(o=>o.cam ? o.cam[1] : o.ra.o[1]);
  console.log(`  Kamerahöhe über Boden: Median ${f2(q(camY,0.5))} m, ${f2(Math.min(...camY))}–${f2(Math.max(...camY))} m`);
  const H=R.hLaserMm ? R.hLaserMm/1000 : null;
  if(H) console.log(`  Abstand zur Decke Δ = H − h: Median ${f2(H-q(camY,0.5))} m, kleinster ${f2(H-Math.max(...camY))} m` +
    (H-q(camY,0.5)<0.7 ? '  → klein: Kanten knapp unter der Decke landen weit hinter der Wand (Versatz ≈ d·dH/(Δ−dH))' : ''));
  const z=obs.map(o=>o.z).filter(Number.isFinite), dist=obs.map(o=>o.dist).filter(Number.isFinite);
  console.log(`  Kantenstärke z: Median ${f2(q(z,0.5))}, 10 % ${f2(q(z,0.1))} · Entfernung Median ${f2(q(dist,0.5))} m`);
  const lab={}; obs.forEach(o=>{ const k=o.final||'–'; lab[k]=(lab[k]||0)+1; });
  console.log('  Zuordnung im Gerät: '+Object.entries(lab).map(([k,v])=>`${k} ${v}`).join(', '));
}

// Nachrechnen mit dem Schaetzer dieser Seite.
const slim=obs.map(o=>({ra:o.ra, rb:o.rb, t:o.t}));
const runs=[];
if(R.hLaserMm) runs.push(['mit Laser', {H:R.hLaserMm/1000}]);
runs.push(['ohne Laser', {H0:2.55, Hsigma:0.35}]);
let shown=null;
for(const [name,opt] of runs){
  let s; try{ s=G.solveSweep(slim,opt); }catch(e){ console.log(`${name}: Ausnahme ${e.message}`); continue; }
  if(!shown) shown=s;
  console.log(`\nNachgerechnet ${name}: ${s.corners ? s.corners.length+' Ecken, '+f2(s.area)+' m²' : 'kein Umriss'}, ${s.closed ? 'geschlossen' : 'offen'}, H ${f3(s.H)} ± ${f3(s.sH)} m, Wände ${(s.walls||[]).map(w=>w.n).join('/')}`);
  (s.warnings||[]).forEach(w=>console.log('  · '+w));
  const lab={}; (s.labels||[]).forEach(l=>{ const k=typeof l==='number' ? 'Wand' : String(l); lab[k]=(lab[k]||0)+1; });
  console.log('  Zuordnung: '+Object.entries(lab).map(([k,v])=>`${k} ${v}`).join(', '));
}

// Grundriss als SVG: gehobene Erfassungen nach Wand gefaerbt, verworfene
// grau gestrichelt, Kameras, Ergebnis orange.
const svg=flag('svg');
if(svg && shown){
  const H=R.hLaserMm ? R.hLaserMm/1000 : shown.H;
  const segs=obs.map((o,i)=>({i, s:G.liftObs(o,H), c:[o.ra.o[0], o.ra.o[2]], lab:shown.labels ? shown.labels[i] : null}));
  const pts=[]; segs.forEach(x=>{ if(x.s) pts.push(...x.s); pts.push(x.c); }); if(shown.corners) pts.push(...shown.corners);
  const xs=pts.map(p=>p[0]), zs=pts.map(p=>p[1]);
  const x0=q(xs,0.02)-0.5, x1=q(xs,0.98)+0.5, z0=q(zs,0.02)-0.5, z1=q(zs,0.98)+0.5;
  const W=900, sc=W/(x1-x0), Hh=Math.round((z1-z0)*sc), Pp=p=>[((p[0]-x0)*sc).toFixed(1), ((p[1]-z0)*sc).toFixed(1)];
  const col=['#2563eb','#16a34a','#dc2626','#9333ea','#ea580c','#0891b2','#ca8a04','#db2777'];
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh+30}" style="background:#fff;font:11px sans-serif">`;
  for(let g=Math.ceil(x0); g<=x1; g++){ const a=Pp([g,z0]), b=Pp([g,z1]); s+=`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#eee"/>`; }
  for(let g=Math.ceil(z0); g<=z1; g++){ const a=Pp([x0,g]), b=Pp([x1,g]); s+=`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#eee"/>`; }
  if(shown.corners) s+=`<polygon points="${shown.corners.map(p=>Pp(p).join(',')).join(' ')}" fill="none" stroke="#f97316" stroke-width="2" stroke-dasharray="6,3"/>`;
  for(const x of segs){ const c=Pp(x.c); s+=`<circle cx="${c[0]}" cy="${c[1]}" r="2.5" fill="#111"/>`;
    if(!x.s) continue; const a=Pp(x.s[0]), b=Pp(x.s[1]), wall=typeof x.lab==='number', k=wall ? col[x.lab%col.length] : '#9ca3af';
    s+=`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${k}" stroke-width="${wall ? 3 : 2}"${wall ? '' : ' stroke-dasharray="3,2"'}/>`;
    s+=`<text x="${(+a[0]+ +b[0])/2+3}" y="${(+a[1]+ +b[1])/2-3}" fill="${k}">${wall ? "W"+(x.lab+1) : x.i}</text>`; }
  s+=`<text x="8" y="${Hh+20}">H=${f3(H)} m · Raster 1 m · farbig = Wand, grau gestrichelt = verworfen/offen · Punkte = Kamera · orange = Ergebnis</text></svg>`;
  writeFileSync(svg, s);
  console.log(`\nGrundriss: ${svg}`);
}
