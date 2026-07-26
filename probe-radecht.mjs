// Wie viele Laeufe scheitern am ECHTEN Radius der gezeichneten Kurve, gegenueber
// der Polygonschaetzung? curveMinR rechnet die Bezier-Kruemmung analytisch.
import { load } from './harness.mjs';
const api=load('verlegeplan.html'); const S=api.S;
const rng=(s=>()=>(s=s*1664525+1013904223>>>0)/4294967296)(12345);
let nPoly=0,nDraw=0,n=0; const pol=[],dra=[];
for(let run=0;run<20;run++){
  S.W=6000+rng()*6000; S.H=2400+rng()*3200;
  S.notchA=800+rng()*1500; S.notchB=600+rng()*1200; S.notchLeft=rng()<.5;
  const ring=api.lRing(0,0,S.W,S.H,S.notchA,S.notchB);
  const sg=ring.map((a,i)=>{const b=ring[(i+1)%ring.length];return{a,b,l:Math.hypot(b.x-a.x,b.y-a.y)};});
  const T=sg.reduce((s,e)=>s+e.l,0); let u=rng()*T;
  for(const e of sg){ if(u<=e.l){ S.manifold={x:e.a.x+(e.b.x-e.a.x)*(u/e.l),y:e.a.y+(e.b.y-e.a.y)*(u/e.l)}; break;} u-=e.l; }
  let plan; try{ plan=api.autofit(); }catch(e){ continue; }
  if(!plan.loops.length) continue;
  const mp=Math.min(...plan.loops.map(l=>l.minR??Infinity));
  const md=Math.min(...plan.loops.map(l=>l.minRDrawn??Infinity));
  n++; pol.push(mp); dra.push(md);
  if(mp<S.bendRadius-1) nPoly++;
  if(md<S.bendRadius-1) nDraw++;
}
const med=a=>{const b=a.slice().sort((x,y)=>x-y);return b[b.length>>1];};
console.log(`Laeufe: ${n}`);
console.log(`  radFails nach POLYGONSCHAETZUNG: ${nPoly}/${n}   Median ${med(pol).toFixed(0)} mm`);
console.log(`  radFails nach GEZEICHNETER Kurve: ${nDraw}/${n}   Median ${med(dra).toFixed(0)} mm`);
console.log(`\nje Lauf  Polygon / gezeichnet:`);
pol.forEach((v,i)=>console.log(`  ${String(Math.round(v)).padStart(5)} / ${String(Math.round(dra[i])).padStart(5)}`));
