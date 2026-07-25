import { load } from './harness.mjs';
const api=load('verlegeplan.html'); const S=api.S;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y}), len=v=>Math.hypot(v.x,v.y);
const unit=v=>{const l=len(v)||1;return{x:v.x/l,y:v.y/l};}, dot=(a,b)=>a.x*b.x+a.y*b.y;
function worst(pts){ let w=null;
  for(let i=1;i<(pts||[]).length-1;i++){ const A=pts[i-1],B=pts[i],C=pts[i+1];
    if(B.arc) continue; const ab=len(sub(B,A)),bc=len(sub(C,B));
    if(ab<1e-9||bc<1e-9) continue;
    const d=Math.acos(Math.max(-1,Math.min(1,dot(unit(sub(B,A)),unit(sub(C,B))))));
    if(d<1e-6) continue;
    const r=d>=Math.PI/3?Math.min(ab,bc)/Math.max(1e-9,Math.tan(d/2)):(ab+bc)/2/d;
    if(!w||r<w.r) w={r,ab,bc,defl:d*180/Math.PI,i};
  } return w; }
const rng=(s=>()=>(s=s*1664525+1013904223>>>0)/4294967296)(12345);
const parts=['leadIn','leadOut','mid','rand','field'];
const tally={}, rows=[];
for(let run=0;run<20;run++){
  S.W=6000+rng()*6000; S.H=2400+rng()*3200;
  S.notchA=800+rng()*1500; S.notchB=600+rng()*1200; S.notchLeft=rng()<.5;
  const ring=api.lRing(0,0,S.W,S.H,S.notchA,S.notchB);
  const segs=ring.map((a,i)=>{const b=ring[(i+1)%ring.length];return{a,b,l:Math.hypot(b.x-a.x,b.y-a.y)};});
  const T=segs.reduce((s,e)=>s+e.l,0); let u=rng()*T;
  for(const e of segs){ if(u<=e.l){ S.manifold={x:e.a.x+(e.b.x-e.a.x)*(u/e.l),y:e.a.y+(e.b.y-e.a.y)*(u/e.l)}; break;} u-=e.l; }
  let plan; try{ plan=api.autofit(); }catch(e){ continue; }
  let best=null;
  for(const l of plan.loops) for(const k of parts){ const w=worst(l[k]); if(w&&(!best||w.r<best.r)) best={...w,part:k}; }
  if(!best) continue;
  tally[best.part]=(tally[best.part]||0)+1;
  if(best.r<S.bendRadius-1) rows.push(best);
}
console.log('schlimmster Punkt liegt in:',JSON.stringify(tally));
console.log('\n  r  Teil      defl   ab    bc');
rows.sort((a,b)=>a.r-b.r).forEach(w=>console.log(
  String(Math.round(w.r)).padStart(3),' '+w.part.padEnd(9),
  String(Math.round(w.defl)).padStart(4),String(Math.round(w.ab)).padStart(5),
  String(Math.round(w.bc)).padStart(5)));
