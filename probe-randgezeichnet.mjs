import { load } from './harness.mjs';
const api=load('verlegeplan.html'); const S=api.S;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y}), len=v=>Math.hypot(v.x,v.y);
const rng=(s=>()=>(s=s*1664525+1013904223>>>0)/4294967296)(12345);
let ctlMax=0, drwMax=0, worst=null;
for(let run=0;run<20;run++){
  S.W=6000+rng()*6000; S.H=2400+rng()*3200;
  S.notchA=800+rng()*1500; S.notchB=600+rng()*1200; S.notchLeft=rng()<.5;
  const ring=api.lRing(0,0,S.W,S.H,S.notchA,S.notchB);
  const sg=ring.map((a,i)=>{const b=ring[(i+1)%ring.length];return{a,b,l:Math.hypot(b.x-a.x,b.y-a.y)};});
  const T=sg.reduce((s,e)=>s+e.l,0); let u=rng()*T;
  for(const e of sg){ if(u<=e.l){ S.manifold={x:e.a.x+(e.b.x-e.a.x)*(u/e.l),y:e.a.y+(e.b.y-e.a.y)*(u/e.l)}; break;} u-=e.l; }
  let plan; try{ plan=api.autofit(); }catch(e){ continue; }
  const dw=p=>Math.min(...ring.map((q,i)=>{const r=ring[(i+1)%ring.length];
    const ab={x:r.x-q.x,y:r.y-q.y};
    const t=Math.max(0,Math.min(1,((p.x-q.x)*ab.x+(p.y-q.y)*ab.y)/((ab.x*ab.x+ab.y*ab.y)||1)));
    return len(sub(p,{x:q.x+ab.x*t,y:q.y+ab.y*t}));}));
  for(const l of plan.loops){ const p=l.rand; if(!p||p.length<2) continue;
    const c=Math.max(...p.map(dw));
    const d=api.drawnPoints(p,6), dm=Math.max(...d.map(dw));
    ctlMax=Math.max(ctlMax,c);
    if(dm>drwMax){ drwMax=dm;
      const k=d.map(dw).indexOf(dm);
      worst={run,dm,c,k,n:d.length,ctx:d.slice(Math.max(0,k-2),k+3).map(q=>({...q,d:Math.round(dw(q))}))}; }
  }
}
console.log(`groesster Wandabstand ueber alle Randzonen:`);
console.log(`  STUETZPUNKTE:        ${Math.round(ctlMax)} mm`);
console.log(`  GEZEICHNETE Kurve:   ${Math.round(drwMax)} mm`);
console.log(`\nschlimmste Stelle, Lauf ${worst.run}, gezeichneter Punkt ${worst.k}/${worst.n}:`);
worst.ctx.forEach(p=>console.log(`   (${p.x.toFixed(0).padStart(6)},${p.y.toFixed(0).padStart(6)})  Wandabstand ${String(p.d).padStart(5)}`));
