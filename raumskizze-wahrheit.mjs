// raumskizze-wahrheit.mjs — legt das Ergebnis einer Kamera-Sitzung (Protokoll von
// raumskizze-probe.html) auf die Laser-Wahrheit aus Raumaufmass (JSON-Export) und misst:
// Abstand der gehobenen Erfassungen zur naechsten echten Wand, Lage und Richtung jeder
// geschaetzten Wand, Eckenfehler, welche echten Waende ueberhaupt gesehen wurden.
//
//   node raumskizze-wahrheit.mjs protokoll.json wahrheit.json [--H=m] [--html=seite] [--svg=datei]
//
// Rahmen: Der Bezug der Kamera ist frei gedreht und verschoben und kann gegen Raumaufmass
// gespiegelt sein. Gesucht wird die starre Abbildung (Drehung, Spiegelung, Verschiebung),
// unter der die Erfassungen, die der Schaetzer Waenden zugeordnet hat, robust am besten auf
// den echten Waenden liegen (Kosten je Punkt min(d², 0,3²)). Drehkandidaten aus den
// Hauptrichtungen beider Grundrisse (je 4 Lagen, mit und ohne Spiegel), Verschiebung per
// Raster 10 cm, danach ICP. Zusaetzlich mit freiem Massstab: weicht er von 1 ab, stimmt die
// Raumhoehe nicht (die Erfassungen skalieren mit H - Kamerahoehe).
// --H setzt die Raumhoehe fuer die Nachrechnung (sonst die Laser-Hoehe des Protokolls, sonst frei).
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const argv=process.argv.slice(2), flag=n=>argv.find(a=>a.startsWith('--'+n+'='))?.split('=')[1];
const [fP, fW]=argv.filter(a=>!a.startsWith('--'));
if(!fP || !fW){ console.error('Aufruf: node raumskizze-wahrheit.mjs protokoll.json wahrheit.json [--H=m] [--html=seite] [--svg=datei]'); process.exit(1); }
const HTML=flag('html') ? resolve(flag('html')) : new URL('./raumskizze-probe.html', import.meta.url), html=readFileSync(HTML, 'utf8');
const pick=id=>html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))[1];
new Function(pick('vendor')+'\n'+pick('geo'))();
const G=globalThis.RAUMSKIZZE;
const f2=x=>Number.isFinite(x) ? x.toFixed(2) : '–', cm=x=>Number.isFinite(x) ? (100*x).toFixed(1) : '–';
const q=(a,p)=>{ if(!a.length) return NaN; const s=[...a].sort((x,y)=>x-y); return s[Math.min(s.length-1, Math.floor(p*s.length))]; };

// ---- Wahrheit: alle Waende als Strecken in Metern (Aussenring und Innenringe).
const W=JSON.parse(readFileSync(fW, 'utf8')), WP=Object.fromEntries(W.pts.map(p=>[p.id, [p.x/1000, p.y/1000]]));
const TW=W.walls.map(([a,b])=>({a:WP[a], b:WP[b], ids:a+b}));
const TC=W.pts.map(p=>WP[p.id]);
const segD=(p,s)=>{ const ex=s.b[0]-s.a[0], ey=s.b[1]-s.a[1], L2=ex*ex+ey*ey, t=Math.max(0, Math.min(1, ((p[0]-s.a[0])*ex+(p[1]-s.a[1])*ey)/L2));
  return Math.hypot(p[0]-s.a[0]-t*ex, p[1]-s.a[1]-t*ey); };
const near=p=>{ let best=Infinity, k=-1; for(let i=0;i<TW.length;i++){ const d=segD(p, TW[i]); if(d<best){ best=d; k=i; } } return {d:best, k}; };

// ---- Kamera: Nachrechnung mit dem Schaetzer der Seite.
const P=JSON.parse(readFileSync(fP, 'utf8')), obs=(P.obs||[]).filter(o=>!o.undone);
const Hset=flag('H') ? +flag('H') : P.hLaserMm ? P.hLaserMm/1000 : null;
const s=G.solveSweep(obs.map(o=>({ra:o.ra, rb:o.rb, t:o.t})), Hset ? {H:Hset} : {H0:2.55, Hsigma:0.35});
const H=s.H;
console.log(`Protokoll ${P.started} · ${obs.length} Erfassungen · H ${f2(H)} m (${Hset ? 'vorgegeben' : 'aus der Parallaxe'}) · Ergebnis ${s.corners ? s.corners.length+' Ecken, '+f2(s.area)+' m²' : 'kein Umriss'}`);
const lifted=obs.map(o=>G.liftObs(o, H));
const samp=l=>{ const n=Math.max(2, Math.ceil(Math.hypot(l[1][0]-l[0][0], l[1][1]-l[0][1])/0.1)+1), out=[];
  for(let i=0;i<n;i++){ const t=i/(n-1); out.push([l[0][0]+t*(l[1][0]-l[0][0]), l[0][1]+t*(l[1][1]-l[0][1])]); } return out; };
const isWall=i=>typeof s.labels[i]==='number';
const ptsW=[], ptsX=[];
lifted.forEach((l,i)=>{ if(!l) return; for(const p of samp(l)) (isWall(i) ? ptsW : ptsX).push({p, i}); });

// ---- Passung
const tf=(p,T)=>{ const x=T.m ? -p[0] : p[0], c=Math.cos(T.r)*T.s, sn=Math.sin(T.r)*T.s; return [c*x-sn*p[1]+T.tx, sn*x+c*p[1]+T.ty]; };
const TAU=0.3, cost=(pts,T)=>{ let c=0; for(const o of pts){ const d=near(tf(o.p,T)).d; c+=Math.min(d*d, TAU*TAU); } return c; };
// Hauptrichtung (mod 90°) aus laengengewichteten Richtungen, vierfacher Winkel.
const dirOf=segs=>{ let C=0, S=0; for(const [a,b] of segs){ const L=Math.hypot(b[0]-a[0], b[1]-a[1]), t=Math.atan2(b[1]-a[1], b[0]-a[0]); C+=L*Math.cos(4*t); S+=L*Math.sin(4*t); } return Math.atan2(S, C)/4; };
const phT=dirOf(TW.map(w=>[w.a, w.b])), phC=dirOf(lifted.filter((l,i)=>l && isWall(i)));
const ptsFit=ptsW.filter((_,j)=>j%2===0), xs=TC.map(p=>p[0]), ys=TC.map(p=>p[1]);
let best=null;
for(const m of [false, true]) for(let k=0;k<4;k++){
  // Gespiegelt (x -> -x) wird aus der Richtung t die Richtung pi - t, mod 90° also -t.
  const r=phT-(m ? -phC : phC)+k*Math.PI/2;
  const c0=ptsFit.reduce((a,o)=>{ const p=tf(o.p, {m, r, s:1, tx:0, ty:0}); return [a[0]+p[0]/ptsFit.length, a[1]+p[1]/ptsFit.length]; }, [0,0]);
  for(let gx=Math.min(...xs);gx<=Math.max(...xs);gx+=0.1) for(let gy=Math.min(...ys);gy<=Math.max(...ys);gy+=0.1){
    const T={m, r, s:1, tx:gx-c0[0], ty:gy-c0[1]}, c=cost(ptsFit, T); if(!best || c<best.c) best={T, c}; } }
// ICP: je Punkt die naechste echte Wand (innerhalb TAU), dann Punkt-zu-Linie-Ausgleich
// (Drehung, Verschiebung, mit freiS auch Massstab).
function solve(A, b){ const n=b.length, M=A.map((r,i)=>[...r, b[i]]);
  for(let i=0;i<n;i++){ let p=i; for(let k=i+1;k<n;k++) if(Math.abs(M[k][i])>Math.abs(M[p][i])) p=k; [M[i], M[p]]=[M[p], M[i]]; if(Math.abs(M[i][i])<1e-15) return null;
    for(let k=i+1;k<n;k++){ const f=M[k][i]/M[i][i]; for(let j=i;j<=n;j++) M[k][j]-=f*M[i][j]; } }
  const x=new Array(n).fill(0); for(let i=n-1;i>=0;i--){ let v=M[i][n]; for(let j=i+1;j<n;j++) v-=M[i][j]*x[j]; x[i]=v/M[i][i]; } return x; }
const icp=(T0, freeS, it=40)=>{ let T={...T0};
  for(let n=0;n<it;n++){ const nP=freeS ? 4 : 3, A=Array.from({length:nP},()=>new Array(nP).fill(0)), b=new Array(nP).fill(0);
    for(const o of ptsW){ const p=tf(o.p, T), {d, k}=near(p); if(d>TAU) continue;
      const w=TW[k], ex=w.b[0]-w.a[0], ey=w.b[1]-w.a[1], L=Math.hypot(ex,ey), nx=-ey/L, ny=ex/L, res=(p[0]-w.a[0])*nx+(p[1]-w.a[1])*ny;
      const x=T.m ? -o.p[0] : o.p[0], y=o.p[1], c=Math.cos(T.r)*T.s, sn=Math.sin(T.r)*T.s, dr=[-sn*x-c*y, c*x-sn*y], ds=[c*x-sn*y, sn*x+c*y];
      const row=[dr[0]*nx+dr[1]*ny, nx, ny, ds[0]*nx+ds[1]*ny].slice(0, nP);
      for(let i=0;i<nP;i++){ b[i]-=row[i]*res; for(let j=0;j<nP;j++) A[i][j]+=row[i]*row[j]; } }
    const x=solve(A, b); if(!x) break;
    T={...T, r:T.r+x[0], tx:T.tx+x[1], ty:T.ty+x[2], s:freeS ? T.s*Math.exp(x[3]) : T.s};
    if(Math.hypot(...x)<1e-7) break; }
  return T; };
const T1=icp(best.T, false), T2=icp(T1, true);

// ---- Bericht
const rep=(name,T)=>{ const dW=ptsW.map(o=>near(tf(o.p,T)).d), dX=ptsX.map(o=>near(tf(o.p,T)).d), pc=(a,f)=>(100*a.filter(f).length/a.length).toFixed(0)+' %';
  console.log(`\n${name}: Drehung ${(T.r*180/Math.PI).toFixed(1)}°, ${T.m ? 'gespiegelt' : 'nicht gespiegelt'}, Maßstab ${T.s.toFixed(3)}`);
  console.log(`  Erfassungen an Wänden (${ptsW.length} Punkte, alle 10 cm): Abstand zur echten Wand Median ${cm(q(dW,0.5))} cm, 90 % ${cm(q(dW,0.9))} cm · unter 5 cm ${pc(dW,d=>d<0.05)}, unter 10 cm ${pc(dW,d=>d<0.1)}, über 30 cm ${pc(dW,d=>d>0.3)}`);
  if(dX.length) console.log(`  Verworfene Erfassungen (${ptsX.length} Punkte): Median ${cm(q(dX,0.5))} cm, unter 10 cm ${pc(dX,d=>d<0.1)}, über 30 cm ${pc(dX,d=>d>0.3)}`); };
rep('Starr (Maßstab 1)', T1);
rep('Mit freiem Maßstab', T2);
const T=T1;
console.log('\nGeschätzte Wände (starr):');
(s.walls||[]).forEach((w,k)=>{ const L=w.line, a=tf([L.c[0]-L.u[0], L.c[1]-L.u[1]], T), b=tf([L.c[0]+L.u[0], L.c[1]+L.u[1]], T), u=[b[0]-a[0], b[1]-a[1]], ul=Math.hypot(...u);
  const sp=w.seen ? w.seen.map(p=>tf(p,T)) : null, mid=sp ? [(sp[0][0]+sp[1][0])/2, (sp[0][1]+sp[1][1])/2] : tf(L.c,T);
  let bk=-1, bd=Infinity, ang=0; TW.forEach((t,i)=>{ const tu=[t.b[0]-t.a[0], t.b[1]-t.a[1]], tl=Math.hypot(...tu), cs=Math.abs((u[0]*tu[0]+u[1]*tu[1])/(ul*tl)); if(cs<Math.cos(15*Math.PI/180)) return;
    const d=segD(mid, t); if(d<bd){ bd=d; bk=i; ang=Math.acos(Math.min(1,cs))*180/Math.PI; } });
  const len=sp ? Math.hypot(sp[1][0]-sp[0][0], sp[1][1]-sp[0][1]) : NaN;
  console.log(`  Wand ${k+1}: ${w.n} Erf., gesehen ${f2(len)} m → echte Wand ${bk>=0 ? TW[bk].ids : '–'}: Abstand ${cm(bd)} cm, Winkel ${ang.toFixed(1)}°`); });
if(s.corners){ const ce=s.corners.map(c=>{ const p=tf(c,T); return Math.min(...TC.map(t=>Math.hypot(p[0]-t[0], p[1]-t[1]))); });
  console.log(`Ecken (starr): Abstand zur nächsten echten Ecke ${ce.map(cm).join(' / ')} cm`); }
const hit=TW.map(()=>0); for(const o of ptsW){ const {d,k}=near(tf(o.p,T)); if(d<0.15) hit[k]++; }
console.log(`Echte Wände mit Erfassungen (≥ 3 Punkte ≤ 15 cm): ${TW.filter((_,i)=>hit[i]>=3).map(t=>t.ids).join(' ')} · ohne: ${TW.filter((_,i)=>hit[i]<3).map(t=>t.ids).join(' ')}`);

// ---- Je Bezugsabschnitt (--abschnitte): alle Erfassungen zwischen zwei Bruechen (LOG.breaks)
// einzeln auf die Wahrheit gepasst, Start bei der Gesamtpassung, Suche ±20° und ±1,5 m.
// Liegt jeder Abschnitt fuer sich gut, aber mit eigener Abbildung, sind die Bezugsbrueche das
// Problem, nicht die Kanten.
if(argv.includes('--abschnitte')){
  const cuts=[...new Set((P.breaks||[]).map(b=>+b.t.toFixed(2)))].sort((a,b)=>a-b), edges=[-Infinity, ...cuts, Infinity];
  console.log(`\nJe Bezugsabschnitt (Brüche bei ${cuts.map(f2).join(', ')} s), alle Erfassungen, gegen die Gesamtpassung:`);
  for(let j=0;j<edges.length-1;j++){
    const ids=obs.map((o,i)=>i).filter(i=>obs[i].t>=edges[j] && obs[i].t<edges[j+1] && lifted[i]); if(ids.length<12) continue;
    const pts=ids.flatMap(i=>samp(lifted[i]).map(p=>({p, i}))), fit=pts.filter((_,n)=>n%2===0);
    let bb=null;
    for(let dr=-20;dr<=20;dr+=2) for(let dx=-1.5;dx<=1.5;dx+=0.1) for(let dy=-1.5;dy<=1.5;dy+=0.1){
      const T={...T1, r:T1.r+dr*Math.PI/180, tx:T1.tx+dx, ty:T1.ty+dy}, c=cost(fit, T); if(!bb || c<bb.c) bb={T, c}; }
    const d0=pts.map(o=>near(tf(o.p,T1)).d), d1=pts.map(o=>near(tf(o.p,bb.T)).d), pc=(a,f)=>(100*a.filter(f).length/a.length).toFixed(0);
    console.log(`  ${f2(Math.max(edges[j], obs[ids[0]].t))}–${f2(Math.min(edges[j+1], obs[ids[ids.length-1]].t))} s, ${ids.length} Erf.: mit Gesamtpassung Median ${cm(q(d0,0.5))} cm (≤10 cm ${pc(d0,d=>d<0.1)} %) · eigene Passung Median ${cm(q(d1,0.5))} cm (≤10 cm ${pc(d1,d=>d<0.1)} %), Versatz ${((bb.T.r-T1.r)*180/Math.PI).toFixed(0)}° / ${cm(Math.hypot(bb.T.tx-T1.tx, bb.T.ty-T1.ty))} cm`); }
}

// ---- SVG
if(flag('svg')){
  const all=[...TC, ...ptsW.map(o=>tf(o.p,T)), ...ptsX.map(o=>tf(o.p,T))], X=all.map(p=>p[0]), Y=all.map(p=>p[1]);
  const x0=Math.min(...X)-0.5, y0=Math.min(...Y)-0.5, sc=80, Wd=(Math.max(...X)+0.5-x0)*sc, Hd=(Math.max(...Y)+0.5-y0)*sc;
  const P2=p=>[((p[0]-x0)*sc).toFixed(1), (Hd-(p[1]-y0)*sc).toFixed(1)];
  let out=`<svg xmlns="http://www.w3.org/2000/svg" width="${Wd.toFixed(0)}" height="${Hd.toFixed(0)}" style="background:#111">`;
  for(const w of TW){ const [x1,y1]=P2(w.a), [x2,y2]=P2(w.b); out+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#bbb" stroke-width="4"/>`; }
  for(const o of ptsX){ const [x,y]=P2(tf(o.p,T)); out+=`<circle cx="${x}" cy="${y}" r="1.5" fill="#f87171" opacity=".6"/>`; }
  for(const o of ptsW){ const [x,y]=P2(tf(o.p,T)); out+=`<circle cx="${x}" cy="${y}" r="1.5" fill="#22d3ee"/>`; }
  if(s.corners) out+=`<polygon points="${s.corners.map(c=>P2(tf(c,T)).join(',')).join(' ')}" fill="none" stroke="#4ade80" stroke-width="2"/>`;
  out+=`<text x="10" y="20" fill="#eee" font-family="sans-serif" font-size="14">grau: Laser-Wahrheit · grün: Kamera-Umriss · türkis: Erfassungen an Wänden · rot: verworfen</text></svg>`;
  writeFileSync(flag('svg'), out); console.log(`SVG: ${flag('svg')}`); }
