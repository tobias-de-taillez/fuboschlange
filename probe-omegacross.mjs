import { load } from './harness.mjs';
const api=load('verlegeplan.html'); const S=api.S;
for(const rp of [2,1]){
  const rng=(s=>()=>(s=s*1664525+1013904223>>>0)/4294967296)(12345);
  let worst=0, tot=0, n=0;
  for(let run=0;run<20;run++){
    S.W=6000+rng()*6000; S.H=2400+rng()*3200;
    S.notchA=800+rng()*1500; S.notchB=600+rng()*1200; S.notchLeft=rng()<.5;
    S.randPasses=rp;
    const ring=api.lRing(0,0,S.W,S.H,S.notchA,S.notchB);
    const segs=ring.map((a,i)=>{const b=ring[(i+1)%ring.length];return{a,b,l:Math.hypot(b.x-a.x,b.y-a.y)};});
    const T=segs.reduce((s,e)=>s+e.l,0); let u=rng()*T;
    for(const e of segs){ if(u<=e.l){ S.manifold={x:e.a.x+(e.b.x-e.a.x)*(u/e.l),y:e.a.y+(e.b.y-e.a.y)*(u/e.l)}; break;} u-=e.l; }
    let plan; try{ plan=api.autofit(); }catch(e){ continue; }
    const c=api.loopCrossings(plan); worst=Math.max(worst,c); tot+=c; n++;
  }
  console.log(`randPasses=${rp} (Omega ${rp>1?'AN':'AUS'}): worstCross=${worst}  Summe=${tot}  Laeufe=${n}`);
}
