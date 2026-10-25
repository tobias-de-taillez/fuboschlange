// raumskizze-metrik.mjs — T2 (ARCHITEKTUR 17.10, Messregel 10.1, Zuordnung 10.2, Inselabnahme 10.5):
// misst einen Export (RoomData bzw. Teilen-Huelle {name, data}) oder einen KarteStand gegen die
// Laser-Wahrheit (Raumaufmass-JSON). Ohne Abhaengigkeiten: kein G, keine Seite.
//
//   node raumskizze-metrik.mjs export.json [wahrheit.json] [--spiegel=pruefen|ja|nein]
//        [--wahrheitGespiegelt=offen|ja|nein] [--fest] [--hFest=2.416] [--json=aus.json]
//
// Passung: starre Abbildung (Spiegel x -> -x, Drehung r, Verschiebung) wie bezug/lib.mjs fitFree:
// Drehung = Hauptrichtung (4·Winkel, laengengewichtet) + k·90° + {0, ±2, ±4}°, Verschiebung des
// Schwerpunkts im 5-cm-Raster ueber die Wahrheit ± 1 m, Kosten je Punkt min(d², τ²) mit τ 15 cm
// ueber ein Distanzfeld (1 cm), danach ICP Punkt-zu-Linie mit 15 cm und 10 cm (nur wenn besser).
// Gesucht wird je Spiegellage getrennt. Mehrdeutigkeit (verhaeltnis): die 8 besten unterscheidbaren Rasterlagen
// (Schwerpunkt > 30 cm oder Drehung > 5° auseinander) werden per ICP verfeinert; Kosten der besten davon
// unterscheidbaren / beste, innerhalb DERSELBEN Spiegellage (sonst waere jede Ecke mit 2 Waenden trivial
// mehrdeutig). < 1,2 = mehrdeutig. verhaeltnisRaster ist das Mass von bezug/lib.mjs fitFree (Rasterkosten ohne
// ICP, Bezug fuer bezug 2.4); es haengt an der Rasterlage (5 cm) und uebertreibt, wo die Reste klein sind.
// Spiegel (1.4): spiegelVerhaeltnis = Kosten mit Spiegel / Kosten ohne (nach ICP, gleiche Punkte);
// >= 1,5 heisst ungespiegelt bestanden. wahrheitGespiegelt: null (offen, Gate 0.4) meldet beide Lagen.
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const WAHRHEIT=fileURLToPath(new URL('./wahrheit-hesterkamp-wohnkueche-2026-10-25.json', import.meta.url));
export const DEF={spiegel:'pruefen', wahrheitGespiegelt:null, hFest:2.416, schwelleAussen:0.15, schwelleInsel:0.10,
  passungAus:'auto', T:null, tau:0.15, schritt:0.05, dR:[-4,-2,0,2,4], nFit:600, ambP:0.3, ambR:5,
  iouMin:0.1, kandidaten:8, durchgangMax:1.0, durchgangTol:0.05, minAbschnitt:12, abschnitte:true, exportPassung:true};
// Strecken aus 6.3 (Ecken-ids der Wahrheit), werden nur gemessen, wo die Wahrheit die ids traegt.
export const STRECKEN=[['Y','AD'], ['AA','W'], ['I','J'], ['J','AC'], ['O','P'], ['X','Y'], ['Q','A']];
const D2R=Math.PI/180, R2D=180/Math.PI;
const wrap=a=>Math.atan2(Math.sin(a), Math.cos(a));
// Quantil wie raumskizze-wahrheit.mjs / bezug/lib.mjs (sortiert, Index floor(p·n))
export const q=(a,p)=>{ if(!a.length) return NaN; const s=Float64Array.from(a).sort(); return s[Math.min(s.length-1, Math.floor(p*s.length))]; };
export const stat=d=>{ const pc=f=>100*d.filter(f).length/Math.max(1, d.length);
  return {n:d.length, med:q(d,0.5), p90:q(d,0.9), u5:pc(x=>x<0.05), u10:pc(x=>x<0.1), o30:pc(x=>x>0.3)}; };

// ---------------------------------------------------------------- Geometrie
const segD=(p,a,b)=>{ const ex=b[0]-a[0], ey=b[1]-a[1], L2=ex*ex+ey*ey, t=L2>0 ? Math.max(0, Math.min(1, ((p[0]-a[0])*ex+(p[1]-a[1])*ey)/L2)) : 0;
  return Math.hypot(p[0]-a[0]-t*ex, p[1]-a[1]-t*ey); };
export const flaecheS=P=>{ let a=0; for(let i=0,j=P.length-1;i<P.length;j=i++) a+=P[j][0]*P[i][1]-P[i][0]*P[j][1]; return a/2; };   // Shoelace mit Vorzeichen: > 0 heisst Inneres links der Laufrichtung
export const flaeche=P=>Math.abs(flaecheS(P));
export function schwerpunkt(P){ let A=0, cx=0, cy=0;
  for(let i=0,j=P.length-1;i<P.length;j=i++){ const c=P[j][0]*P[i][1]-P[i][0]*P[j][1]; A+=c; cx+=(P[j][0]+P[i][0])*c; cy+=(P[j][1]+P[i][1])*c; }
  if(Math.abs(A)<1e-12) return P.reduce((s,p)=>[s[0]+p[0]/P.length, s[1]+p[1]/P.length], [0,0]);
  return [cx/(3*A), cy/(3*A)]; }
const kreuzen=(a,b,c,d)=>{ const o=(p,q,r)=>Math.sign((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]));
  return o(a,b,c)*o(a,b,d)<0 && o(c,d,a)*o(c,d,b)<0; };
// Einfacher Ring: keine zwei nicht benachbarten Kanten kreuzen sich.
export function einfach(P){ const n=P.length;
  for(let i=0;i<n;i++) for(let j=i+2;j<n;j++){ if(i===0 && j===n-1) continue; if(kreuzen(P[i], P[(i+1)%n], P[j], P[(j+1)%n])) return false; }
  return true; }
// Hauptrichtung mod 90° (laengengewichtet, vierfacher Winkel) wie raumskizze-wahrheit.mjs
export const richtung=segs=>{ let C=0, S=0; for(const [a,b] of segs){ const L=Math.hypot(b[0]-a[0], b[1]-a[1]), t=Math.atan2(b[1]-a[1], b[0]-a[0]); C+=L*Math.cos(4*t); S+=L*Math.sin(4*t); } return Math.atan2(S, C)/4; };
const kanten=P=>P.map((p,i)=>[p, P[(i+1)%P.length]]);
// Huellmasse in der eigenen Hauptrichtung (unabhaengig von der Passung), groesseres zuerst
export function huelle(P){ const r=richtung(kanten(P)), c=Math.cos(-r), s=Math.sin(-r); let x0=Infinity, x1=-Infinity, y0=Infinity, y1=-Infinity;
  for(const p of P){ const x=c*p[0]-s*p[1], y=s*p[0]+c*p[1]; x0=Math.min(x0,x); x1=Math.max(x1,x); y0=Math.min(y0,y); y1=Math.max(y1,y); }
  return [x1-x0, y1-y0].sort((a,b)=>b-a); }
// Kleinster Abstand zweier Ringe (Ecke zu Kante, beide Richtungen; exakt fuer kreuzungsfreie Ringe)
export function abstandRinge(A, B){ let m=Infinity;
  for(const [X,Y] of [[A,B],[B,A]]) for(const p of X) for(let k=0;k<Y.length;k++) m=Math.min(m, segD(p, Y[k], Y[(k+1)%Y.length]));
  return m; }
// Flaeche von Schnitt und Vereinigung zweier Ringmengen (gerade-ungerade-Regel ueber alle Ringe einer
// Menge, damit Aussenring minus Inseln). Zeilenweise: je Zeile die Intervalle exakt in x, Zeilen h.
function zeile(R, y){ const xs=[];
  for(const P of R) for(let i=0,j=P.length-1;i<P.length;j=i++){ const a=P[j], b=P[i]; if((a[1]>y)!==(b[1]>y)) xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1])); }
  xs.sort((a,b)=>a-b); return xs; }
const laenge=xs=>{ let s=0; for(let i=0;i+1<xs.length;i+=2) s+=xs[i+1]-xs[i]; return s; };
function schnittLaenge(a, b){ let s=0, i=0, j=0;
  while(i+1<a.length && j+1<b.length){ const lo=Math.max(a[i], b[j]), hi=Math.min(a[i+1], b[j+1]); if(hi>lo) s+=hi-lo; if(a[i+1]<b[j+1]) i+=2; else j+=2; }
  return s; }
export function iou(RA, RB, h){ let y0=Infinity, y1=-Infinity; for(const P of [...RA, ...RB]) for(const p of P){ y0=Math.min(y0,p[1]); y1=Math.max(y1,p[1]); }
  if(!(y1>y0)) return {iou:0, I:0, U:0, A:0, B:0};
  h=h ?? Math.min(0.002, (y1-y0)/400); const n=Math.max(1, Math.ceil((y1-y0)/h)), dy=(y1-y0)/n; let I=0, A=0, B=0;
  for(let k=0;k<n;k++){ const y=y0+(k+0.5)*dy, a=zeile(RA,y), b=zeile(RB,y); A+=laenge(a); B+=laenge(b); I+=schnittLaenge(a,b); }
  I*=dy; A*=dy; B*=dy; const U=A+B-I; return {iou:U>0 ? I/U : 0, I, U, A, B}; }

// ---------------------------------------------------------------- Ungarisches Verfahren
// Quadratische Kostenmatrix C (Array von Zeilen) -> Spalte je Zeile, Summe minimal (Kuhn-Munkres mit Potentialen).
export function ungarisch(C){ const n=C.length, u=new Float64Array(n+1), v=new Float64Array(n+1), p=new Int32Array(n+1), way=new Int32Array(n+1);
  for(let i=1;i<=n;i++){ p[0]=i; let j0=0; const minv=new Float64Array(n+1).fill(Infinity), used=new Uint8Array(n+1);
    do{ used[j0]=1; const i0=p[j0]; let d=Infinity, j1=0;
      for(let j=1;j<=n;j++) if(!used[j]){ const cur=C[i0-1][j-1]-u[i0]-v[j]; if(cur<minv[j]){ minv[j]=cur; way[j]=j0; } if(minv[j]<d){ d=minv[j]; j1=j; } }
      for(let j=0;j<=n;j++){ if(used[j]){ u[p[j]]+=d; v[j]-=d; } else minv[j]-=d; }
      j0=j1; }while(p[j0]!==0);
    do{ const j1=way[j0]; p[j0]=p[j1]; j0=j1; }while(j0); }
  const a=new Array(n).fill(-1); for(let j=1;j<=n;j++) if(p[j]) a[p[j]-1]=j-1; return a; }
// Optimale Teilzuordnung mit Schwelle s: Platzhalter je Zeile und Spalte zu Kosten s, Paare ueber s
// gesperrt (2s+1, nie billiger als beide offen lassen). Ergebnis: Paare [i, j, d], offene Zeilen, offene Spalten.
export function zuordnen(D, s){ const nA=D.length, nB=nA ? D[0].length : 0, N=nA+nB, X=2*s+1;
  if(!nA || !nB) return {paare:[], offenA:[...Array(nA).keys()], offenB:[...Array(nB).keys()]};
  const C=Array.from({length:N}, (_,i)=>Array.from({length:N}, (_,j)=>i<nA && j<nB ? (D[i][j]<=s ? D[i][j] : X) : i<nA || j<nB ? s : 0));
  const a=ungarisch(C), paare=[], usedB=new Set();
  for(let i=0;i<nA;i++){ const j=a[i]; if(j<nB && D[i][j]<=s){ paare.push([i, j, D[i][j]]); usedB.add(j); } }
  const inA=new Set(paare.map(p=>p[0]));
  return {paare, offenA:[...Array(nA).keys()].filter(i=>!inA.has(i)), offenB:[...Array(nB).keys()].filter(j=>!usedB.has(j))}; }

// ---------------------------------------------------------------- Versatz g (1.1, 3.2.3) ohne M0
// g = {psi, tx, ty, tz}: x' = cs·x - sn·z + tx, z' = sn·x + cs·z + tz, y' = y + ty. gKomp(a, b): erst b, dann a.
const G0={psi:0, tx:0, ty:0, tz:0};
export const gKomp=(a,b)=>{ const c=Math.cos(a.psi), s=Math.sin(a.psi); return {psi:a.psi+b.psi, tx:c*b.tx-s*b.tz+a.tx, ty:a.ty+b.ty, tz:s*b.tx+c*b.tz+a.tz}; };
export const gAnw=(g,p)=>{ const c=Math.cos(g.psi), s=Math.sin(g.psi); return [c*p[0]-s*p[1]+g.tx, s*p[0]+c*p[1]+g.tz]; };
// Knoten in beiden Formen: KarteStand [{t, d:[psi,tx,ty,tz]}] oder Abschnitt {t: Float64Array, d: Float64Array(4K)}.
function knotenNorm(k){ if(!k) return null;
  if(Array.isArray(k)) return {t:k.map(x=>x.t), d:k.flatMap(x=>x.d)};
  return {t:Array.from(k.t), d:Array.from(k.d)}; }
// gBei wie 3.2.3: d(t) linear zwischen den Nachbarknoten, aussen konstant; doppelte Zeiten (Sprung)
// wie knotAt der Seite: an t gilt der spaetere Knoten.
export function gBei(A, t){ const g=A.g || G0, K=A._kn!==undefined ? A._kn : (A._kn=knotenNorm(A.knoten));
  if(!K || !K.t.length) return g;
  const n=K.t.length, dv=j=>({psi:K.d[4*j], tx:K.d[4*j+1], ty:K.d[4*j+2], tz:K.d[4*j+3]});
  if(n===1) return gKomp(g, dv(0));
  let lo=0, hi=n-2; while(lo<hi){ const m=(lo+hi+1)>>1; if(K.t[m]<=t) lo=m; else hi=m-1; }
  const sp=K.t[lo+1]-K.t[lo], a=sp>0 ? Math.max(0, Math.min(1, (t-K.t[lo])/sp)) : 1, A0=dv(lo), A1=dv(lo+1);
  return gKomp(g, {psi:(1-a)*A0.psi+a*A1.psi, tx:(1-a)*A0.tx+a*A1.tx, ty:(1-a)*A0.ty+a*A1.ty, tz:(1-a)*A0.tz+a*A1.tz}); }

// ---------------------------------------------------------------- Wahrheit
// Ringe aus den Waenden (Nachbarschaft), groesster zuerst = Aussenring.
export function ringeAusWaenden(ids, walls){ const adj={}; for(const [a,b] of walls){ (adj[a]??=[]).push(b); (adj[b]??=[]).push(a); }
  const seen=new Set(), out=[];
  for(const s of ids){ if(seen.has(s) || !adj[s]) continue; const r=[s]; seen.add(s); let prev=null, cur=s;
    for(;;){ const nx=adj[cur].find(x=>x!==prev && !seen.has(x)); if(!nx) break; r.push(nx); seen.add(nx); prev=cur; cur=nx; }
    if(r.length>=3) out.push(r); }
  return out; }
const mitWaenden=(ringe)=>{ const W=[];
  ringe.forEach((R,ri)=>{ const A=flaecheS(R.pts), aussen=ri===0;
    for(let i=0;i<R.pts.length;i++){ const p=R.pts[i], q=R.pts[(i+1)%R.pts.length], L=Math.hypot(q[0]-p[0], q[1]-p[1]); if(!(L>1e-9)) continue;
      const u=[(q[0]-p[0])/L, (q[1]-p[1])/L]; let n=[-u[1], u[0]];               // links von p->q
      let links=A>0; if(!aussen) links=!links; if(!links) n=[-n[0], -n[1]];          // n zeigt zur freien Seite
      const uu=[-n[1], n[0]], s0=uu[0]*p[0]+uu[1]*p[1], s1=uu[0]*q[0]+uu[1]*q[1];
      W.push({ids:R.ids[i]+'-'+R.ids[(i+1)%R.ids.length], ring:ri, a:p, b:q, L, n, u:uu, rho:n[0]*p[0]+n[1]*p[1], phi:(Math.atan2(n[1],n[0])+2*Math.PI)%(2*Math.PI), s0:Math.min(s0,s1), s1:Math.max(s0,s1)}); } });
  return W; };
const CACHE=new Map();
export function wahrheitLaden(w=WAHRHEIT, o={}){
  if(w && w.ringe && w.df) return w;
  const key=typeof w==='string' ? w+(o.spiegel ? '#s' : '') : null; if(key && CACHE.has(key)) return CACHE.get(key);
  const J0=typeof w==='string' ? JSON.parse(readFileSync(w,'utf8')) : w, J=J0.data && J0.data.pts ? J0.data : J0, sp=o.spiegel ? -1 : 1;
  const P=Object.fromEntries(J.pts.map(p=>[p.id, [sp*p.x/1000, p.y/1000]]));
  const ringe=ringeAusWaenden(J.pts.map(p=>p.id), J.walls).map(ids=>({ids, pts:ids.map(i=>P[i])})).sort((a,b)=>flaeche(b.pts)-flaeche(a.pts));
  ringe.forEach((r,i)=>{ r.art=i ? 'insel' : 'aussen'; r.A=flaeche(r.pts); r.name=r.ids.join('-'); });
  const waende=mitWaenden(ringe), xs=ringe.flatMap(r=>r.pts.map(p=>p[0])), ys=ringe.flatMap(r=>r.pts.map(p=>p[1]));
  const bb={x0:Math.min(...xs), x1:Math.max(...xs), y0:Math.min(...ys), y1:Math.max(...ys)};
  // Distanzfeld min(d, τ)² auf 1 cm, Rand 0,3 m; ausserhalb gilt τ² (weiter als τ von jeder Wand).
  const tau=DEF.tau, res=0.01, x0=bb.x0-0.3, y0=bb.y0-0.3, nx=Math.ceil((bb.x1-bb.x0+0.6)/res)+1, ny=Math.ceil((bb.y1-bb.y0+0.6)/res)+1, D2=new Float32Array(nx*ny).fill(tau*tau);
  for(const wd of waende){ const m=tau+2*res, ix0=Math.max(0, Math.floor((Math.min(wd.a[0],wd.b[0])-m-x0)/res)), ix1=Math.min(nx-1, Math.ceil((Math.max(wd.a[0],wd.b[0])+m-x0)/res));
    const iy0=Math.max(0, Math.floor((Math.min(wd.a[1],wd.b[1])-m-y0)/res)), iy1=Math.min(ny-1, Math.ceil((Math.max(wd.a[1],wd.b[1])+m-y0)/res));
    for(let iy=iy0;iy<=iy1;iy++) for(let ix=ix0;ix<=ix1;ix++){ const d=segD([x0+ix*res, y0+iy*res], wd.a, wd.b); if(d<tau){ const k=iy*nx+ix; if(d*d<D2[k]) D2[k]=d*d; } } }
  const durch=[]; for(let i=0;i<ringe.length;i++) for(let j=i+1;j<ringe.length;j++) durch.push({a:i, b:j, d:abstandRinge(ringe[i].pts, ringe[j].pts)});
  const W={P, ringe, waende, bb, df:{x0, y0, res, nx, ny, D2, tau}, phi4:richtung(waende.map(x=>[x.a, x.b])), spiegel:!!o.spiegel, durch};
  if(key) CACHE.set(key, W); return W; }
const naechste=(W,p)=>{ let best=Infinity, k=-1; for(let i=0;i<W.waende.length;i++){ const d=segD(p, W.waende[i].a, W.waende[i].b); if(d<best){ best=d; k=i; } } return {d:best, k}; };

// ---------------------------------------------------------------- Passung
// T = {m, r, tx, ty, s}: x -> (m ? -x : x), Drehung r, Massstab s, Verschiebung (Wahrheitsrahmen x, y).
export const tf=(p,T)=>{ const x=T.m ? -p[0] : p[0], s=T.s ?? 1, c=Math.cos(T.r)*s, sn=Math.sin(T.r)*s; return [c*x-sn*p[1]+T.tx, sn*x+c*p[1]+T.ty]; };
const kostenEx=(W, pts, T, tau)=>{ let c=0; const t2=tau*tau; for(const p of pts){ const d=naechste(W, tf(p,T)).d; c+=Math.min(d*d, t2); } return c; };
function loese(A, b){ const n=b.length, M=A.map((r,i)=>[...r, b[i]]);
  for(let i=0;i<n;i++){ let p=i; for(let k=i+1;k<n;k++) if(Math.abs(M[k][i])>Math.abs(M[p][i])) p=k; [M[i], M[p]]=[M[p], M[i]]; if(Math.abs(M[i][i])<1e-15) return null;
    for(let k=i+1;k<n;k++){ const f=M[k][i]/M[i][i]; for(let j=i;j<=n;j++) M[k][j]-=f*M[i][j]; } }
  const x=new Array(n).fill(0); for(let i=n-1;i>=0;i--){ let v=M[i][n]; for(let j=i+1;j<n;j++) v-=M[i][j]*x[j]; x[i]=v/M[i][i]; } return x; }
// ICP Punkt-zu-Linie (Drehung, Verschiebung, mit freiS auch Massstab) wie bezug/lib.mjs icpRaw
function icpRoh(W, pts, T0, it, tau, freiS){ let T={s:1, ...T0};
  for(let n=0;n<it;n++){ const nP=freiS ? 4 : 3, A=Array.from({length:nP}, ()=>new Array(nP).fill(0)), b=new Array(nP).fill(0);
    for(const p0 of pts){ const p=tf(p0,T), {d,k}=naechste(W,p); if(d>tau) continue;
      const w=W.waende[k], nx=w.n[0], ny=w.n[1], res=(p[0]-w.a[0])*nx+(p[1]-w.a[1])*ny;
      const x=T.m ? -p0[0] : p0[0], y=p0[1], c=Math.cos(T.r)*T.s, sn=Math.sin(T.r)*T.s, dr=[-sn*x-c*y, c*x-sn*y], ds=[c*x-sn*y, sn*x+c*y];
      const row=[dr[0]*nx+dr[1]*ny, nx, ny, ds[0]*nx+ds[1]*ny].slice(0, nP);
      for(let i=0;i<nP;i++){ b[i]-=row[i]*res; for(let j=0;j<nP;j++) A[i][j]+=row[i]*row[j]; } }
    const x=loese(A, b); if(!x) break;
    T={...T, r:T.r+x[0], tx:T.tx+x[1], ty:T.ty+x[2], s:freiS ? T.s*Math.exp(x[3]) : T.s};
    if(Math.hypot(...x)<1e-9) break; }
  return T; }
const icp=(W, pts, T0, it, tau, freiS=false)=>{ const T1=icpRoh(W, pts, T0, it, tau, freiS); return kostenEx(W, pts, T1, tau)<=kostenEx(W, pts, T0, tau) ? T1 : {s:1, ...T0}; };
const icp2=(W, pts, T0, tau=0.15)=>icp(W, pts, icp(W, pts, T0, 40, tau), 40, 0.1);
// Rastersuche in einer Spiegellage; liefert beste und beste deutlich andere Lage (Rasterkosten).
function raster(W, fit, segs, m, o){
  const F=W.df, k=Math.max(1, Math.round(o.schritt/F.res)), st=k*F.res, t2=F.tau*F.tau;
  const gx0=W.bb.x0-1, gy0=W.bb.y0-1, nX=Math.floor((W.bb.x1+1-gx0)/st+1e-9)+1, nY=Math.floor((W.bb.y1+1-gy0)/st+1e-9)+1, N=nX*nY;
  const phC=richtung(segs), rs=[];
  for(let j=0;j<4;j++) for(const dr of o.dR) rs.push(W.phi4-(m ? -phC : phC)+j*Math.PI/2+dr*D2R);
  let best={c:Infinity}; const C=[], c0s=[];
  rs.forEach((r,ri)=>{ const c=Math.cos(r), s=Math.sin(r), z=fit.map(p=>{ const x=m ? -p[0] : p[0]; return [c*x-s*p[1], s*x+c*p[1]]; });
    const c0=[0,0]; for(const p of z){ c0[0]+=p[0]/z.length; c0[1]+=p[1]/z.length; } c0s.push(c0);
    const Ci=new Float64Array(N);
    for(const p of z){ const bx=Math.round((p[0]-c0[0]+gx0-F.x0)/F.res), by=Math.round((p[1]-c0[1]+gy0-F.y0)/F.res);
      const ix0=Math.max(0, Math.ceil(-bx/k)), ix1=Math.min(nX-1, Math.floor((F.nx-1-bx)/k));
      for(let iy=0;iy<nY;iy++){ const row=by+iy*k, o0=iy*nX;
        if(row<0 || row>=F.ny || ix0>ix1){ for(let ix=0;ix<nX;ix++) Ci[o0+ix]+=t2; continue; }
        for(let ix=0;ix<ix0;ix++) Ci[o0+ix]+=t2;
        const rb=row*F.nx+bx; for(let ix=ix0;ix<=ix1;ix++) Ci[o0+ix]+=F.D2[rb+ix*k];
        for(let ix=ix1+1;ix<nX;ix++) Ci[o0+ix]+=t2; } }
    for(let i=0;i<N;i++) if(Ci[i]<best.c) best={c:Ci[i], ri, i};
    C.push(Ci); });
  const lage=(ri,i)=>{ const gx=gx0+(i%nX)*st, gy=gy0+Math.floor(i/nX)*st; return {m, r:rs[ri], tx:gx-c0s[ri][0], ty:gy-c0s[ri][1], s:1, gx, gy}; };
  // gleich = Drehung <= ambR und Schwerpunkt <= ambP auseinander (Rasterzellen)
  const gleich=(ri,i,rj,j)=>Math.abs(wrap(rs[ri]-rs[rj]))<=o.ambR*D2R && Math.hypot((i%nX-j%nX)*st, (Math.floor(i/nX)-Math.floor(j/nX))*st)<=o.ambP;
  // K beste unterscheidbare Rasterlagen (je Durchlauf das Minimum ausserhalb der schon gewaehlten)
  const kand=[{ri:best.ri, i:best.i, c:best.c}];
  while(kand.length<o.kandidaten){ let b={c:Infinity};
    rs.forEach((_,ri)=>{ const Ci=C[ri]; for(let i=0;i<N;i++){ if(Ci[i]>=b.c) continue; if(kand.some(k=>gleich(ri,i,k.ri,k.i))) continue; b={c:Ci[i], ri, i}; } });
    if(!Number.isFinite(b.c)) break; kand.push(b); }
  const alt=kand[1];   // wie bezug/lib.mjs fitFree: beste deutlich andere Lage im Raster
  return {kand:kand.map(k=>({T:lage(k.ri, k.i), c:k.c})), c:best.c, ambRaster:alt ? alt.c/Math.max(1e-12, best.c) : Infinity}; }
const dichte=(pts, n)=>pts.length>n ? pts.filter((_,j)=>j%Math.ceil(pts.length/n)===0) : pts;
// Passung einer Punktmenge (pts [[x,z]], segs fuer die Hauptrichtung) je Spiegellage.
export function passung(pts, segs, W, o={}){ o={...DEF, ...o};
  const lagen={}, n=pts.length;
  if(o.T){ const T={s:1, ...o.T}; lagen[T.m ? 'mit' : 'ohne']={T, kosten:kostenEx(W, pts, T, o.tau)/Math.max(1,n), verhaeltnis:null, alt:null, fest:true}; }
  else { const fit=dichte(pts, o.nFit);
    for(const m of o.spiegel==='ja' ? [true] : o.spiegel==='nein' ? [false] : [false, true]){
      // Jede Rasterlage per ICP verfeinern; beste und beste unterscheidbare danach (Schwerpunkt > ambP oder Drehung > ambR).
      const R=raster(W, fit, segs, m, o), c=mitte(pts);
      const K=R.kand.map(k=>{ const T=icp2(W, pts, k.T, o.tau); return {T, kosten:kostenEx(W, pts, T, o.tau)/Math.max(1,n), kostenRaster:k.c, z:tf(c,T)}; }).sort((a,b)=>a.kosten-b.kosten);
      const anders=(a,b)=>Math.hypot(a.z[0]-b.z[0], a.z[1]-b.z[1])>o.ambP || Math.abs(wrap(a.T.r-b.T.r))>o.ambR*D2R, Dk=[];
      for(const k of K) if(Dk.every(d=>anders(k,d))) Dk.push(k);       // unterscheidbare Deutungen nach ICP, beste zuerst
      const B=Dk[0], A=Dk[1] || null, rel=k=>({T:k.T, kosten:k.kosten, kostenRaster:k.kostenRaster, verh:k.kosten/Math.max(1e-15, B.kosten), abstand:Math.hypot(k.z[0]-B.z[0], k.z[1]-B.z[1]), dR:wrap(k.T.r-B.T.r)*R2D});
      lagen[m ? 'mit' : 'ohne']={T:B.T, kosten:B.kosten, kostenRaster:B.kostenRaster, verhaeltnis:A ? A.kosten/Math.max(1e-15, B.kosten) : Infinity, verhaeltnisRaster:R.ambRaster,
        alt:A ? rel(A) : null, deutungen:Dk.slice(1, 4).map(rel)}; } }
  const wahl=lagen.ohne && lagen.mit ? (lagen.mit.kosten<lagen.ohne.kosten ? 'mit' : 'ohne') : lagen.ohne ? 'ohne' : 'mit', L=lagen[wahl];
  const sv=lagen.ohne && lagen.mit ? lagen.mit.kosten/Math.max(1e-15, lagen.ohne.kosten) : null;
  const S=icp(W, pts, L.T, 40, 0.15, true);
  return {lagen, wahl, T:L.T, gespiegelt:!!L.T.m, kosten:L.kosten, verhaeltnis:L.verhaeltnis, verhaeltnisRaster:L.verhaeltnisRaster ?? null, alt:L.alt, deutungen:L.deutungen ?? [], n,
    kostenSpiegel:wahl==='ohne' ? lagen.mit?.kosten ?? null : lagen.ohne?.kosten ?? null, spiegelVerhaeltnis:sv,
    ungespiegelt:sv==null ? null : sv>=1.5 ? true : sv<=1/1.5 ? false : null, skala:S.s, skalaGueltig:L.verhaeltnis==null || L.verhaeltnis>=1.2}; }
const mitte=pts=>pts.reduce((a,p)=>[a[0]+p[0]/pts.length, a[1]+p[1]/pts.length], [0,0]);
const abtasten=(l, st=0.1)=>{ const n=Math.max(2, Math.ceil(Math.hypot(l[1][0]-l[0][0], l[1][1]-l[0][1])/st)+1), out=[];
  for(let i=0;i<n;i++){ const t=i/(n-1); out.push([l[0][0]+t*(l[1][0]-l[0][0]), l[0][1]+t*(l[1][1]-l[0][1])]); } return out; };

// ---------------------------------------------------------------- Eingabe
// RoomData / Teilen / KarteStand (ringe, waende, ecken, abschnitte, hoehen) / beob (Strahlen im Bezug B_ab).
export function eingabeAus(e){ const d=e && e.data && e.data.pts ? e.data : e;
  const E={ringe:[], waende:e.waende||null, ecken:e.ecken||null, beob:e.beob||null, abschnitte:e.abschnitte||null, hoehen:e.hoehen||null, name:e.name||null};
  if(d && d.pts && d.walls){ const P=Object.fromEntries(d.pts.map(p=>[p.id, [p.x/1000, p.y/1000]]));
    E.ringe=ringeAusWaenden(d.pts.map(p=>p.id), d.walls).map(ids=>({ids, pts:ids.map(i=>P[i])})); }
  else if(e && e.ringe) E.ringe=e.ringe.filter(r=>r.exportiert!==false && r.pts && r.pts.length>=3).map((r,k)=>({ids:r.pts.map((_,i)=>(r.id ?? k)+':'+i), pts:r.pts, art:r.art}));
  const ia=E.ringe.findIndex(r=>r.art==='aussen'), ja=ia>=0 ? ia : E.ringe.reduce((b,r,i)=>flaeche(r.pts)>flaeche(E.ringe[b].pts) ? i : b, 0);
  if(E.ringe.length) E.ringe=[E.ringe[ja], ...E.ringe.filter((_,i)=>i!==ja)];
  return E; }
const heben=(c, d, y)=>{ if(Math.abs(d[1])<1e-6) return null; const t=(y-c[1])/d[1]; if(!(t>0) || t>25) return null; return [c[0]+t*d[0], c[2]+t*d[2]]; };
const hoeheVon=(w, H, hFest)=>{ const hC=Number.isFinite(H.hC) ? H.hC : hFest;
  if(!w || w.h==null || w.h==='c') return hC; if(w.h==='f') return Number.isFinite(H.hF) ? H.hF : 0; if(w.h==='lokal') return w.hLokal?.h ?? hC; return +w.h; };
// Messregel 10.1: Hebung 'karte' (Hoehe der Landmarke, Decke h_c - ty_s) oder 'fest' (H ueber dem Boden
// des Bezugs), jeweils mit Versatz (G.gBei) oder ohne ('none').
export function hebeBeob(E, v, hFest){
  const ab=new Map((E.abschnitte||[]).map(a=>[a.ab, a])), wd=new Map((E.waende||[]).map(w=>[w.id, w])), H=E.hoehen||{}, out=[];
  (E.beob||[]).forEach((b,i)=>{
    if(b.seg){ out.push({i, ab:b.ab, t:b.t, seg:b.seg, L:b.L ?? -1}); return; }
    const A=ab.get(b.ab), g=v.g && A ? gBei(A, b.t) : G0;
    const h=v.h==='fest' ? hFest : hoeheVon(b.L!=null && b.L>=0 ? wd.get(b.L) : null, H, hFest)-g.ty;
    const a=heben(b.c, b.da, h), c=heben(b.c, b.db, h); if(!a || !c) return;
    out.push({i, ab:b.ab, t:b.t, seg:[gAnw(g,a), gAnw(g,c)], L:b.L ?? -1, cam:gAnw(g, [b.c[0], b.c[2]])}); });
  return out; }

// ---------------------------------------------------------------- Ringe, Ecken, Inseln
function eckenStat(TP, EP, s){ const D=TP.map(t=>EP.map(e=>Math.hypot(e[0]-t[0], e[1]-t[1]))), Z=zuordnen(D, s), d=Z.paare.map(p=>p[2]);
  const ce=TP.map((_,i)=>EP.length ? Math.min(...D[i]) : Infinity), ceR=EP.map((_,j)=>Math.min(...TP.map((_,i)=>D[i][j])));
  return {Z, eMed:q(d,0.5), eP90:q(d,0.9), eMax:d.length ? Math.max(...d) : NaN,
    naechst:{eMed:q(ce,0.5), eMax:Math.max(...ce), fehlend20:ce.filter(x=>x>0.2).length, extra20:ceR.filter(x=>x>0.2).length}}; }
export function ringMetrik(E, W, T, o={}){ o={...DEF, ...o};
  const ER=E.ringe.map(r=>({...r, pts:r.pts.map(p=>tf(p,T))})), TR=W.ringe;
  // Ringe: Ungarisch auf 1 - IoU (Mindest-IoU 0,1), jeder Ring fuer sich gefuellt
  const IO=TR.map(t=>ER.map(e=>iou([t.pts], [e.pts], t.art==='insel' ? 0.0005 : 0.002).iou));
  const RZ=zuordnen(IO.map(r=>r.map(v=>1-v)), 1-o.iouMin), zu=new Map(RZ.paare.map(([i,j])=>[i,j]));
  if(!zu.has(0) && ER.length && !RZ.paare.some(p=>p[1]===0)) zu.set(0, 0);          // Aussenring erzwungen (Hinweis unten)
  const zuerst=!RZ.paare.some(p=>p[0]===0) && zu.has(0);
  const ecken={}, ring=(ti, s)=>{ const ej=zu.get(ti); if(ej==null) return null; const e=ER[ej], t=TR[ti], S=eckenStat(t.pts, e.pts, s);
    for(const [i,j] of S.Z.paare) ecken[t.ids[i]]=e.pts[j];
    const A=flaeche(e.pts), ef=einfach(e.pts), Ag=ef ? A : iou([e.pts],[e.pts]).A;
    return {ej, e, S, out:{n:e.pts.length, nT:t.pts.length, zugeordnet:S.Z.paare.map(([i,j,d])=>({wahr:t.ids[i], exp:e.ids[j], d})),
      fehlend:S.Z.offenA.map(i=>t.ids[i]), ueberzaehlig:S.Z.offenB.map(j=>e.ids[j]), eMed:S.eMed, eP90:S.eP90, eMax:S.eMax, naechst:S.naechst,
      A, AT:t.A, dA:(A-t.A)/t.A, einfach:ef, AGerade:Ag, iou:IO[ti][ej]}}; };
  const RA=ring(0, o.schwelleAussen), aussen=RA ? {...RA.out, erzwungen:zuerst, huelle:huelle(RA.e.pts), huelleT:huelle(TR[0].pts)} : {fehlt:true};
  if(RA){ const h=aussen.huelle, hT=aussen.huelleT; aussen.dHuelle=[h[0]/hT[0]-1, h[1]/hT[1]-1]; aussen.seitenverhaeltnis=h[0]/h[1]; aussen.dSeiten=(h[0]/h[1])/(hT[0]/hT[1])-1; }
  // Durchgaenge: kleinster Abstand je Ringpaar der Wahrheit (nur Paare bis durchgangMax), Export ueber die Ringzuordnung
  const durchgaenge=W.durch.filter(x=>x.d<=o.durchgangMax).map(x=>{ const ea=zu.get(x.a), eb=zu.get(x.b), de=ea!=null && eb!=null ? abstandRinge(ER[ea].pts, ER[eb].pts) : null;
    return {a:TR[x.a].name, b:TR[x.b].name, ia:x.a, ib:x.b, wahr:x.d, exp:de, d:de==null ? null : de-x.d, ok:de!=null && Math.abs(de-x.d)<=o.durchgangTol}; });
  const inseln=TR.slice(1).map((t,k)=>{ const ti=k+1, R=ring(ti, o.schwelleInsel);
    if(!R) return {wahr:t.name, gefunden:false, nT:t.pts.length, AT:t.A, bestanden:false, kriterien:null};
    const c=schwerpunkt(R.e.pts), cT=schwerpunkt(t.pts), sp=Math.hypot(c[0]-cT[0], c[1]-cT[1]), du=durchgaenge.filter(x=>x.ia===ti || x.ib===ti);
    const kr={ecken:R.out.n===R.out.nT, partner:R.out.fehlend.length===0, iou:R.out.iou>=0.75, schwerpunkt:sp<=0.05, durchgaenge:du.every(x=>x.ok), flaeche:Math.abs(R.out.dA)<=0.20};
    return {wahr:t.name, gefunden:true, ...R.out, ecken:{zugeordnet:R.out.zugeordnet, fehlend:R.out.fehlend, ueberzaehlig:R.out.ueberzaehlig},
      schwerpunkt:sp, huelle:huelle(R.e.pts), huelleT:huelle(t.pts), kriterien:kr, bestanden:Object.values(kr).every(Boolean)}; });
  const benutzt=new Set(zu.values()), falscheInseln=ER.map((e,j)=>({j, e})).filter(x=>x.j>0 && !benutzt.has(x.j)).map(({j,e})=>({ring:j, n:e.pts.length, A:flaeche(e.pts), c:schwerpunkt(e.pts)}));
  const ATn=TR[0].A-TR.slice(1).reduce((s,r)=>s+r.A,0), An=ER.length ? flaeche(ER[0].pts)-ER.slice(1).reduce((s,r)=>s+flaeche(r.pts),0) : NaN;
  const flaechen={aussen:RA ? {A:aussen.A, AT:aussen.AT, dA:aussen.dA} : null, inseln:inseln.map(x=>({wahr:x.wahr, A:x.A ?? null, AT:x.AT, dA:x.dA ?? null})),
    netto:{A:An, AT:ATn, dA:(An-ATn)/ATn}, iouNetto:ER.length ? iou(TR.map(r=>r.pts), ER.map(r=>r.pts), 0.002).iou : 0};
  const strecken=STRECKEN.filter(([a,b])=>W.P[a] && W.P[b]).map(([a,b])=>{ const w=Math.hypot(W.P[a][0]-W.P[b][0], W.P[a][1]-W.P[b][1]), pa=ecken[a], pb=ecken[b];
    const x=pa && pb ? Math.hypot(pa[0]-pb[0], pa[1]-pb[1]) : null; return {a, b, wahr:w, exp:x, d:x==null ? null : x-w}; });
  return {aussen, inseln, falscheInseln, flaechen, durchgaenge, strecken, ringe:{paare:RZ.paare.map(([i,j,c])=>({wahr:TR[i].name, exp:j, iou:1-c})), iou:IO}}; }

// ---------------------------------------------------------------- Waende (Landmarken), Ecken der Karte
// Landmarke {id, phi, rho, cls, iv:[{s0,s1}]|[[s0,s1]]} in F0. Treffer einer Wahrheitswand: |Δφ| < 2° (voller Kreis, also
// gleiche Seite), Stueckmitte < 5 cm von der Linie, Ueberlapp > 5 cm; Landmarke trifft, wenn die Ueberlappe zusammen
// >= 50 % ihres gesehenen Intervalls decken. n:1 = mehrere Wahrheitswaende auf einer Landmarke.
export function waendeMetrik(E, W, T, o={}){ const L=(E.waende||[]).filter(w=>w.rahmen==null || w.rahmen===-1);
  if(!L.length) return null;
  const R=T.m ? -1 : 1, rot=v=>{ const x=R*v[0], c=Math.cos(T.r), s=Math.sin(T.r); return [c*x-s*v[1], s*x+c*v[1]]; };
  const gefunden=new Set(), treffer=[], n1=[]; let nW=0, nT=0, ueber=0;
  for(const w of L){ const nn=[Math.cos(w.phi), Math.sin(w.phi)], u=[-nn[1], nn[0]], n2=rot(nn), phi=Math.atan2(n2[1], n2[0]);
    const iv=(w.iv||[]).map(x=>Array.isArray(x) ? x : [x.s0, x.s1]).filter(x=>x[1]>x[0]); if(!iv.length) continue;
    const istWand=w.cls==null || w.cls==='wand'; if(istWand) nW++;
    const stuecke=iv.map(([s0,s1])=>[tf([w.rho*nn[0]+s0*u[0], w.rho*nn[1]+s0*u[1]], T), tf([w.rho*nn[0]+s1*u[0], w.rho*nn[1]+s1*u[1]], T)]);
    const gesehen=iv.reduce((s,x)=>s+x[1]-x[0], 0), auf=new Map();
    for(const [a,b] of stuecke){ const mid=[(a[0]+b[0])/2, (a[1]+b[1])/2];
      W.waende.forEach((t,k)=>{ if(Math.abs(wrap(phi-t.phi))>=2*D2R || Math.abs(t.n[0]*mid[0]+t.n[1]*mid[1]-t.rho)>=0.05) return;
        const sa=t.u[0]*a[0]+t.u[1]*a[1], sb=t.u[0]*b[0]+t.u[1]*b[1], ov=Math.min(Math.max(sa,sb), t.s1)-Math.max(Math.min(sa,sb), t.s0);
        if(ov>0.05) auf.set(k, (auf.get(k)||0)+ov); }); }
    const ov=[...auf.values()].reduce((s,x)=>s+x, 0), hit=ov>=0.5*gesehen;
    if(!hit) continue;
    if(istWand) nT++;
    const ks=[...auf.keys()]; ks.forEach(k=>gefunden.add(k));
    const ringe=[...new Set(ks.map(k=>W.waende[k].ring))]; if(ringe.length>=2) ueber++;
    treffer.push({id:w.id, waende:ks.map(k=>W.waende[k].ids), ringe, cls:w.cls ?? null});
    if(ks.length>=2){ const u0=W.waende[ks[0]].u, iv2=ks.map(k=>{ const t=W.waende[k], s=[u0[0]*t.a[0]+u0[1]*t.a[1], u0[0]*t.b[0]+u0[1]*t.b[1]]; return [Math.min(...s), Math.max(...s)]; }).sort((a,b)=>a[0]-b[0]);
      let luecke=Infinity; for(let i=0;i+1<iv2.length;i++) luecke=Math.min(luecke, iv2[i+1][0]-iv2[i][1]);
      n1.push({id:w.id, waende:ks.map(k=>W.waende[k].ids), ringe, luecke}); } }
  return {nWahr:W.waende.length, gefunden:gefunden.size, gefundenIds:[...gefunden].map(k=>W.waende[k].ids), nLandmarken:L.length, nWand:nW,
    praezision:nW ? nT/nW : null, treffer, n1, ringUebergreifend:ueber}; }
function eckenKarte(E, W, T){ if(!E.ecken || !E.ecken.length) return null; const TC=Object.values(W.P);
  const d=E.ecken.map(c=>{ const p=tf(c.p, T); return Math.min(...TC.map(t=>Math.hypot(p[0]-t[0], p[1]-t[1]))); });
  return {n:d.length, med:q(d,0.5), p90:q(d,0.9), u2:d.filter(x=>x<=0.02).length, u15:d.filter(x=>x<=0.15).length}; }

// ---------------------------------------------------------------- Beobachtungen, Abschnitte
const waendeTreffer=(W, pts, T, dMax=0.1)=>{ const h=new Array(W.waende.length).fill(0); for(const p of pts){ const {d,k}=naechste(W, tf(p,T)); if(d<dMax) h[k]++; }
  return W.waende.map((w,k)=>h[k]>=3 ? w.ids : null).filter(Boolean); };
function beobVariante(E, W, v, o){ const L=hebeBeob(E, v, o.hFest); if(L.length<3) return null;
  const P=L.flatMap(x=>abtasten(x.seg).map(p=>({p, i:x.i, L:x.L, ab:x.ab}))), pts=P.map(x=>x.p);
  const pa=passung(pts, L.map(x=>x.seg), W, o), st=T=>{ const d=pts.map(p=>naechste(W, tf(p,T)).d); return {alle:stat(d), zugeordnet:stat(d.filter((_,j)=>P[j].L>=0)), d}; };
  const lagen=Object.fromEntries(Object.entries(pa.lagen).map(([k,l])=>{ const s=st(l.T); return [k, {alle:s.alle, zugeordnet:s.zugeordnet}]; }));
  const s=st(pa.T); return {L, P, pts, passung:pa, alle:s.alle, zugeordnet:s.zugeordnet, d:s.d, lagen, nBeob:L.length}; }
function abschnittTabelle(E, W, V, o){ if(!V) return null; const T=V.passung.T, gr=new Map();
  V.L.forEach(x=>{ if(!gr.has(x.ab)) gr.set(x.ab, []); gr.get(x.ab).push(x); });
  const AB=new Map((E.abschnitte||[]).map(a=>[a.ab, a])), out=[];
  for(const [ab, xs] of [...gr].sort((a,b)=>a[0]-b[0])){ const pts=xs.flatMap(x=>abtasten(x.seg)), d0=pts.map(p=>naechste(W, tf(p,T)).d);
    const z={ab, t0:Math.min(...xs.map(x=>x.t)), t1:Math.max(...xs.map(x=>x.t)), n:xs.length, medGesamt:q(d0,0.5), stufe:AB.get(ab)?.stufe ?? null};
    if(xs.length>=o.minAbschnitt){ const pa=passung(pts, xs.map(x=>x.seg), W, {...o, spiegel:T.m ? 'ja' : 'nein', T:null}), Tk=pa.T, dk=pts.map(p=>naechste(W, tf(p,Tk)).d);
      // Versatz im Bezug F0, der den Abschnitt von der Gesamtpassung auf seine eigene bringt: T^-1 ∘ T_k am Schwerpunkt
      const c=mitte(pts), inv=p=>{ const x=p[0]-T.tx, y=p[1]-T.ty, cs=Math.cos(T.r), sn=Math.sin(T.r), a=cs*x+sn*y, b=-sn*x+cs*y; return [T.m ? -a : a, b]; };
      const c1=inv(tf(c,Tk)), e1=inv(tf([c[0]+1, c[1]],Tk));
      Object.assign(z, {medEigen:q(dk,0.5), u10Eigen:stat(dk).u10, verhaeltnis:pa.verhaeltnis, verhaeltnisRaster:pa.verhaeltnisRaster, dPsi:Math.atan2(e1[1]-c1[1], e1[0]-c1[0])*R2D, dT:Math.hypot(c1[0]-c[0], c1[1]-c[1]),
        waende:waendeTreffer(W, pts, Tk), alt:pa.alt ? {waende:waendeTreffer(W, pts, pa.alt.T), abstand:pa.alt.abstand, dR:pa.alt.dR, medAlt:q(pts.map(p=>naechste(W, tf(p,pa.alt.T)).d),0.5)} : null,
        deutungen:pa.deutungen.map(k=>({verh:k.verh, abstand:k.abstand, dR:k.dR, waende:waendeTreffer(W, pts, k.T)}))}); }
    out.push(z); }
  return out; }

// ---------------------------------------------------------------- Hauptfunktion
// metrik(export | KarteStand, wahrheit, o) -> {passung, aussen, inseln, falscheInseln, durchgaenge, laengen, flaechen, waende,
//   ringUebergreifend, abschnitte, hoehe, beob, lagen, spiegel, hinweise, ...}
export function metrik(e, wahrheit=WAHRHEIT, o={}){ o={...DEF, ...o};
  const W=wahrheitLaden(wahrheit, {spiegel:o.wahrheitGespiegelt===true}), E=eingabeAus(e), hinweise=[];
  // Beobachtungen nach der Messregel 10.1 (je Hebung eigene Passung, jeweils mit "none" im selben Lauf)
  let beob=null;
  if(E.beob && E.beob.length){ const V={gehoben:{h:'karte', g:true}, none:{h:'karte', g:false}, hFest:{h:'fest', g:true}, hFestNone:{h:'fest', g:false}};
    beob=Object.fromEntries(Object.entries(V).map(([k,v])=>[k, beobVariante(E, W, v, o)]));
    const b=(a,c)=>beob[a] && beob[c] ? beob[a].alle.med<beob[c].alle.med : null;
    beob.besserAlsNone={karte:b('gehoben','none'), fest:b('hFest','hFestNone')}; }
  // Passung des Exports (Abtastung der Ringkanten alle 10 cm)
  const ePts=E.ringe.flatMap(r=>kanten(r.pts).flatMap(k=>abtasten(k))), eSegs=E.ringe.flatMap(r=>kanten(r.pts));
  const quelle=o.T ? 'fest' : o.passungAus==='auto' ? (beob && beob.gehoben ? 'beob' : ePts.length ? 'export' : 'waende') : o.passungAus;
  let pa=null, paExport=null;
  if(ePts.length && (quelle==='export' || quelle==='fest' || o.exportPassung)) paExport=passung(ePts, eSegs, W, o);
  pa=quelle==='beob' ? beob?.gehoben?.passung ?? null : quelle==='waende' ? null : paExport;
  if(!pa){ const ws=(E.waende||[]).flatMap(w=>(w.iv||[]).map(x=>{ const [s0,s1]=Array.isArray(x) ? x : [x.s0,x.s1], n=[Math.cos(w.phi), Math.sin(w.phi)], u=[-n[1], n[0]]; return [[w.rho*n[0]+s0*u[0], w.rho*n[1]+s0*u[1]], [w.rho*n[0]+s1*u[0], w.rho*n[1]+s1*u[1]]]; }));
    if(ws.length) pa=passung(ws.flatMap(l=>abtasten(l)), ws, W, o); }
  if(!pa) return {fehler:'nichts zu passen (keine Ringe, Beobachtungen oder Waende)'};
  const P={kosten:pa.kosten, verhaeltnis:pa.verhaeltnis, verhaeltnisRaster:pa.verhaeltnisRaster, gespiegelt:pa.gespiegelt, kostenSpiegel:pa.kostenSpiegel, spiegelVerhaeltnis:pa.spiegelVerhaeltnis,
    ungespiegelt:pa.ungespiegelt, skala:pa.skalaGueltig ? pa.skala : null, skalaRoh:pa.skala, aus:quelle, n:pa.n, T:pa.T, alt:pa.alt ? {kosten:pa.alt.kosten, abstand:pa.alt.abstand, dR:pa.alt.dR, T:pa.alt.T} : null,
    wahrheitGespiegelt:o.wahrheitGespiegelt};
  if(pa.verhaeltnis!=null && pa.verhaeltnis<1.2) hinweise.push(`Passung mehrdeutig (Verhältnis ${pa.verhaeltnis.toFixed(2)} < 1,2): Wandzahlen je Abschnitt nur als Hinweis`);
  // Spiegel: beide Deutungen der Wahrheit melden, solange Gate 0.4 offen ist
  const sp=(x)=>x==null ? null : {gespiegelt:x.gespiegelt, spiegelVerhaeltnis:x.spiegelVerhaeltnis, ungespiegelt:x.ungespiegelt};
  const dreh=x=>x==null ? null : {gespiegelt:!x.gespiegelt, spiegelVerhaeltnis:x.spiegelVerhaeltnis==null ? null : 1/x.spiegelVerhaeltnis, ungespiegelt:x.ungespiegelt==null ? null : !x.ungespiegelt};
  const spiegel={wahrheitGespiegelt:o.wahrheitGespiegelt, passung:sp(pa), export:sp(paExport),
    ...(o.wahrheitGespiegelt==null ? {wennWahrheitGespiegelt:{passung:dreh(pa), export:dreh(paExport)}} : {})};
  // Ringe in beiden Spiegellagen der Hauptpassung, Hauptfelder aus der gewaehlten
  const lagen={}; for(const [k,l] of Object.entries(pa.lagen||{[pa.T.m ? 'mit' : 'ohne']:{T:pa.T}})) if(E.ringe.length) lagen[k]={T:l.T, kosten:l.kosten, ...ringMetrik(E, W, l.T, o)};
  const R=E.ringe.length ? lagen[pa.wahl ?? (pa.T.m ? 'mit' : 'ohne')] : null;
  if(R && R.aussen.erzwungen) hinweise.push('Außenring mit IoU < 0,1 – zugeordnet ohne Ungarisches Verfahren');
  if(R && R.aussen.einfach===false) hinweise.push('Außenring kreuzt sich selbst – Fläche nach Shoelace irreführend, AGerade ist die Gerade-Ungerade-Fläche');
  const WM=waendeMetrik(E, W, pa.T, o);
  const H=E.hoehen;
  const hoehe=H ? {hC:H.hC ?? null, hF:H.hF ?? null, H:Number.isFinite(H.hC) && Number.isFinite(H.hF) ? H.hC-H.hF : null, HLaser:o.hFest,
    dH:Number.isFinite(H.hC) && Number.isFinite(H.hF) ? H.hC-H.hF-o.hFest : null, sHC:H.sHC ?? null, quelle:H.quelle ?? null, q:H.q ?? null,
    ty:(E.abschnitte||[]).filter(a=>a.g).map(a=>({ab:a.ab, ty:a.g.ty, sTy:a.sig?.y ?? null}))} : null;
  const out={passung:P, spiegel, aussen:R ? R.aussen : null, inseln:R ? R.inseln : [], falscheInseln:R ? R.falscheInseln : [], durchgaenge:R ? R.durchgaenge : [],
    flaechen:R ? R.flaechen : null,
    laengen:R ? {huelle:R.aussen.huelle ?? null, huelleT:R.aussen.huelleT ?? null, inseln:R.inseln.map(x=>({wahr:x.wahr, huelle:x.huelle ?? null, huelleT:x.huelleT ?? huelle(W.ringe.find(r=>r.name===x.wahr).pts)})),
      durchgaenge:R.durchgaenge.map(x=>({a:x.a, b:x.b, wahr:x.wahr, exp:x.exp})), strecken:R.strecken, skala:P.skala} : null,
    waende:WM, ringUebergreifend:WM ? WM.ringUebergreifend : null, eckenKarte:eckenKarte(E, W, pa.T),
    abschnitte:o.abschnitte && beob && beob.gehoben ? abschnittTabelle(E, W, beob.gehoben, o) : null, hoehe,
    beob:beob ? Object.fromEntries(Object.entries(beob).map(([k,v])=>[k, v && v.passung ? {nBeob:v.nBeob, n:v.pts.length, alle:v.alle, zugeordnet:v.zugeordnet, lagen:v.lagen,
      passung:{kosten:v.passung.kosten, verhaeltnis:v.passung.verhaeltnis, verhaeltnisRaster:v.passung.verhaeltnisRaster, gespiegelt:v.passung.gespiegelt, spiegelVerhaeltnis:v.passung.spiegelVerhaeltnis, skala:v.passung.skala, T:v.passung.T}} : v])) : null,
    passungExport:paExport && quelle!=='export' ? {kosten:paExport.kosten, verhaeltnis:paExport.verhaeltnis, gespiegelt:paExport.gespiegelt, spiegelVerhaeltnis:paExport.spiegelVerhaeltnis, ungespiegelt:paExport.ungespiegelt, T:paExport.T} : null,
    lagen:Object.fromEntries(Object.entries(lagen).map(([k,l])=>[k, {kosten:l.kosten, aussen:l.aussen, inseln:l.inseln, falscheInseln:l.falscheInseln, flaechen:l.flaechen, durchgaenge:l.durchgaenge}])),
    relativ:null, bodenmarken:null, hinweise};
  return out; }

// ---------------------------------------------------------------- Bericht
const cm=x=>Number.isFinite(x) ? (100*x).toFixed(1) : '–', pct=x=>Number.isFinite(x) ? (100*x).toFixed(1)+' %' : '–', f2=x=>Number.isFinite(x) ? x.toFixed(2) : x===Infinity ? '∞' : '–';
export function bericht(m){ if(m.fehler) return 'FEHLER '+m.fehler; const L=[], p=m.passung;
  L.push(`Passung aus ${p.aus} (${p.n} Punkte): Kosten ${(1e4*p.kosten).toFixed(2)} cm² je Punkt, Mehrdeutigkeit ${f2(p.verhaeltnis)}${p.verhaeltnis!=null && p.verhaeltnis<1.2 ? ' (mehrdeutig)' : ''} (Raster ${f2(p.verhaeltnisRaster)}), ${p.gespiegelt ? 'gespiegelt' : 'nicht gespiegelt'}, Spiegelverhältnis ${f2(p.spiegelVerhaeltnis)} (mit/ohne), Maßstab ${p.skala!=null ? p.skala.toFixed(3) : 'nicht gültig ('+f2(p.skalaRoh)+')'}`);
  if(m.spiegel.wennWahrheitGespiegelt) L.push(`  Gate 0.4 offen: Wahrheit richtig → ${p.gespiegelt ? 'Export gespiegelt' : 'Export ungespiegelt'}; Wahrheit gespiegelt → ${p.gespiegelt ? 'Export ungespiegelt' : 'Export gespiegelt'}`);
  if(m.passungExport) L.push(`  Passung nur des Exports: Mehrdeutigkeit ${f2(m.passungExport.verhaeltnis)}, ${m.passungExport.gespiegelt ? 'gespiegelt' : 'nicht gespiegelt'}, Spiegelverhältnis ${f2(m.passungExport.spiegelVerhaeltnis)}`);
  const a=m.aussen;
  if(a && !a.fehlt) L.push(`Außenring: ${a.n}/${a.nT} Ecken, zugeordnet ${a.zugeordnet.length}, fehlend ${a.fehlend.length}, überzählig ${a.ueberzaehlig.length}, Fehler Median ${cm(a.eMed)} / p90 ${cm(a.eP90)} cm · nächste Ecke Median ${cm(a.naechst.eMed)} max ${cm(a.naechst.eMax)} cm · A ${f2(a.A)}/${f2(a.AT)} m² (${pct(a.dA)})${a.einfach ? '' : ' KREUZT'} · IoU ${f2(a.iou)} · Hülle ${f2(a.huelle[0])}×${f2(a.huelle[1])} m (wahr ${f2(a.huelleT[0])}×${f2(a.huelleT[1])}), Seitenverhältnis ${pct(a.dSeiten)}`);
  else L.push('Außenring: fehlt');
  for(const i of m.inseln) L.push(i.gefunden ? `Insel ${i.wahr}: ${i.n}/${i.nT} Ecken, fehlend ${i.fehlend.length}, überzählig ${i.ueberzaehlig.length}, Median ${cm(i.eMed)} cm, IoU ${f2(i.iou)}, Schwerpunkt ${cm(i.schwerpunkt)} cm, A ${i.A.toFixed(3)}/${i.AT.toFixed(3)} m² (${pct(i.dA)}) → ${i.bestanden ? 'bestanden' : 'nicht bestanden: '+Object.entries(i.kriterien).filter(([,v])=>!v).map(([k])=>k).join(', ')}`
    : `Insel ${i.wahr}: fehlt`);
  if(m.falscheInseln.length) L.push(`Falsche Inseln: ${m.falscheInseln.map(f=>f.A.toFixed(2)+' m²').join(', ')}`);
  if(m.flaechen) L.push(`Flächen: netto ${f2(m.flaechen.netto.A)}/${f2(m.flaechen.netto.AT)} m² (${pct(m.flaechen.netto.dA)}), IoU netto ${f2(m.flaechen.iouNetto)}`);
  if(m.durchgaenge.length) L.push('Durchgänge: '+m.durchgaenge.map(x=>`${x.a}|${x.b} ${x.wahr.toFixed(3)} m → ${x.exp==null ? '–' : x.exp.toFixed(3)+' m'}`).join(' · '));
  if(m.laengen && m.laengen.strecken.some(s=>s.exp!=null)) L.push('Strecken (6.3): '+m.laengen.strecken.map(s=>`${s.a}–${s.b} ${s.wahr.toFixed(3)}→${s.exp==null ? '–' : s.exp.toFixed(3)}`).join(' · '));
  if(m.waende) L.push(`Wände: gefunden ${m.waende.gefunden}/${m.waende.nWahr} (${m.waende.gefundenIds.join(' ')}), Präzision ${m.waende.praezision==null ? '–' : pct(m.waende.praezision)} von ${m.waende.nWand}, n:1 ${m.waende.n1.length}, ringübergreifend ${m.waende.ringUebergreifend}`);
  if(m.beob) for(const [k,v] of Object.entries(m.beob)) if(v && v.alle) L.push(`Beob ${k}: ${v.nBeob} gehoben, Median ${cm(v.alle.med)} cm, <10 cm ${v.alle.u10.toFixed(0)} % (zugeordnet ${cm(v.zugeordnet.med)} cm), Mehrdeutigkeit ${f2(v.passung.verhaeltnis)} (Raster ${f2(v.passung.verhaeltnisRaster)}), ${v.passung.gespiegelt ? 'gespiegelt' : 'ungespiegelt'}, Spiegelverh. ${f2(v.passung.spiegelVerhaeltnis)}, Maßstab ${f2(v.passung.skala)}`);
  if(m.beob && m.beob.besserAlsNone) L.push(`Besser als none: Landmarkenhöhe ${m.beob.besserAlsNone.karte}, H fest ${m.beob.besserAlsNone.fest}`);
  if(m.abschnitte) for(const z of m.abschnitte) L.push(`  Abschnitt ${z.ab} ${f2(z.t0)}–${f2(z.t1)} s, ${z.n} Beob: Gesamtpassung ${cm(z.medGesamt)} cm`+(z.medEigen!=null ? ` → eigene ${cm(z.medEigen)} cm, Mehrdeutigkeit ${f2(z.verhaeltnis)} (Raster ${f2(z.verhaeltnisRaster)}), Versatz ${z.dPsi.toFixed(1)}° / ${cm(z.dT)} cm, Wände ${z.waende.join(' ')}${z.alt ? ` · zweitbeste (${cm(z.alt.abstand)} cm, ${z.alt.dR.toFixed(0)}° daneben, Median ${cm(z.alt.medAlt)} cm): ${z.alt.waende.join(' ')}` : ''}` : ''));
  if(m.hoehe) L.push(`Höhe: h_c ${f2(m.hoehe.hC)} − h_f ${f2(m.hoehe.hF)} = ${f2(m.hoehe.H)} m gegen Laser ${f2(m.hoehe.HLaser)} m (${cm(m.hoehe.dH)} cm)`);
  for(const h of m.hinweise) L.push('Hinweis: '+h);
  return L.join('\n'); }
export const alsJson=m=>JSON.stringify(m, (k,v)=>v===Infinity ? 'Infinity' : v instanceof Float64Array || v instanceof Float32Array ? Array.from(v) : v, 1);

// ---------------------------------------------------------------- Aufruf
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const argv=process.argv.slice(2), fl=n=>argv.find(a=>a.startsWith('--'+n+'='))?.split('=').slice(1).join('='), [fE, fW]=argv.filter(a=>!a.startsWith('--'));
  if(!fE){ console.error('Aufruf: node raumskizze-metrik.mjs export.json [wahrheit.json] [--spiegel=pruefen|ja|nein] [--wahrheitGespiegelt=offen|ja|nein] [--fest] [--hFest=2.416] [--json=aus.json]'); process.exit(1); }
  const wg=fl('wahrheitGespiegelt'), o={spiegel:fl('spiegel') ?? 'pruefen', wahrheitGespiegelt:wg==='ja' ? true : wg==='nein' ? false : null, hFest:+(fl('hFest') ?? 2.416)};
  if(argv.includes('--fest')) o.T={m:false, r:0, tx:0, ty:0, s:1};
  const m=metrik(JSON.parse(readFileSync(fE,'utf8')), fW || WAHRHEIT, o);
  console.log(bericht(m)); if(fl('json')){ writeFileSync(fl('json'), alsJson(m)); console.log('JSON: '+fl('json')); } }
