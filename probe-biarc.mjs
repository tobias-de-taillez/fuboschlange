import { load } from './harness.mjs';
const api=load('verlegeplan.html'); const S=api.S;
const rng=(s=>()=>(s=s*1664525+1013904223>>>0)/4294967296)(12345);
const cr=[],ba=[]; let nCr=0,nBa=0,n=0;
for(let run=0;run<20;run++){
  S.W=6000+rng()*6000; S.H=2400+rng()*3200;
  S.notchA=800+rng()*1500; S.notchB=600+rng()*1200; S.notchLeft=rng()<.5;
  const ring=api.lRing(0,0,S.W,S.H,S.notchA,S.notchB);
  const sg=ring.map((a,i)=>{const b=ring[(i+1)%ring.length];return{a,b,l:Math.hypot(b.x-a.x,b.y-a.y)};});
  const T=sg.reduce((s,e)=>s+e.l,0); let u=rng()*T;
  for(const e of sg){ if(u<=e.l){ S.manifold={x:e.a.x+(e.b.x-e.a.x)*(u/e.l),y:e.a.y+(e.b.y-e.a.y)*(u/e.l)}; break;} u-=e.l; }
  let plan; try{ plan=api.autofit(); }catch(e){ continue; }
  if(!plan.loops.length) continue;
  const c=Math.min(...plan.loops.map(l=>l.minRDrawn??Infinity));
  const b=Math.min(...plan.loops.map(l=>api.biarcMinR(l.pts)));
  n++; cr.push(c); ba.push(b);
  if(c<S.bendRadius-1) nCr++;
  if(b<S.bendRadius-1) nBa++;
}
const med=a=>{const x=a.slice().sort((p,q)=>p-q);return x[x.length>>1];};
console.log(`Laeufe ${n}`);
console.log(`  Catmull-Rom  unter 80mm: ${nCr}/${n}   Median ${med(cr).toFixed(1)} mm`);
console.log(`  Biarc-Spline unter 80mm: ${nBa}/${n}   Median ${med(ba).toFixed(1)} mm`);
console.log('\nje Lauf  CR / Biarc:');
cr.forEach((v,i)=>console.log(`  ${v.toFixed(1).padStart(7)} / ${ba[i].toFixed(1).padStart(7)}`));
