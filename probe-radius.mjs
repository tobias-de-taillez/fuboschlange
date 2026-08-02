// Wo bricht der Radius? Kein Rateverfahren: den argmin der Kruemmung suchen und
// beschreiben, wo er liegt.
import { load } from './harness.mjs';
const api=load('verlegeplan.html'); const S=api.S;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y}), len=v=>Math.hypot(v.x,v.y);
const unit=v=>{const l=len(v)||1;return{x:v.x/l,y:v.y/l};}, dot=(a,b)=>a.x*b.x+a.y*b.y;
function radii(pts){                       // exakt die Regel aus pathCurve
  const out=[];
  for(let i=1;i<pts.length-1;i++){
    const A=pts[i-1],B=pts[i],C=pts[i+1];
    if(B.arc){ out.push({i,r:B.arc.r,p:B,kind:'arc'}); continue; }
    const ab=len(sub(B,A)), bc=len(sub(C,B));
    if(ab<1e-9||bc<1e-9) continue;
    const defl=Math.acos(Math.max(-1,Math.min(1,dot(unit(sub(B,A)),unit(sub(C,B))))));
    if(defl<1e-6) continue;
    const r = defl>=Math.PI/3 ? Math.min(ab,bc)/Math.max(1e-9,Math.tan(defl/2)) : (ab+bc)/2/defl;
    out.push({i,r,p:B,kind:defl>=Math.PI/3?'Ecke':'Kurve',defl:defl*180/Math.PI,ab,bc});
  }
  return out;
}
const rng=(s=>()=>(s=s*1664525+1013904223>>>0)/4294967296)(12345);
const tally={}, add=k=>tally[k]=(tally[k]||0)+1;
const worst=[];
for(let run=0;run<20;run++){
  S.W=6000+rng()*6000; S.H=2400+rng()*3200;
  S.notchA=800+rng()*1500; S.notchB=600+rng()*1200; S.notchLeft=rng()<.5;
  const ring=api.lRing(0,0,S.W,S.H,S.notchA,S.notchB);
  let d=rng()*1; { const segs=ring.map((a,i)=>{const b=ring[(i+1)%ring.length];return{a,b,l:Math.hypot(b.x-a.x,b.y-a.y)};});
    const T=segs.reduce((s,e)=>s+e.l,0); let u=d*T;
    for(const e of segs){ if(u<=e.l){ S.manifold={x:e.a.x+(e.b.x-e.a.x)*(u/e.l),y:e.a.y+(e.b.y-e.a.y)*(u/e.l)}; break;} u-=e.l; } }
  let plan; try{ plan=api.autofit(); }catch(e){ continue; }
  if(!plan.loops.length) continue;
  let best=null;
  plan.loops.forEach((l,li)=>{ for(const c of radii(l.pts)) if(!best||c.r<best.r) best={...c,li,n:l.pts.length}; });
  if(!best) continue;
  if(best.r>=S.bendRadius-1){ add('OK'); continue; }
  // Wo liegt der Punkt? Abstand zur Wand, und Lage entlang des Pfades.
  const dw=Math.min(...ring.map((a,i)=>{const b=ring[(i+1)%ring.length];
    const ab=sub(b,a), t=Math.max(0,Math.min(1,dot(sub(best.p,a),ab)/(dot(ab,ab)||1)));
    return len(sub(best.p,{x:a.x+ab.x*t,y:a.y+ab.y*t}));}));
  const frac=best.i/best.n;
  add(best.kind);
  worst.push({r:Math.round(best.r),kind:best.kind,defl:Math.round(best.defl||0),
    ab:Math.round(best.ab||0),bc:Math.round(best.bc||0),
    wand:Math.round(dw), frac:Math.round(frac*100)/100, kreis:best.li, von:plan.loops.length});
}
console.log('Soll R =',S.bendRadius,'mm');
console.log('Art des schlimmsten Punktes:',JSON.stringify(tally));
console.log('\n r  Art    defl  ab   bc   Wandabst  Lage  Kreis');
worst.sort((a,b)=>a.r-b.r).forEach(w=>console.log(
  String(w.r).padStart(3),w.kind.padEnd(6),String(w.defl).padStart(4),
  String(w.ab).padStart(4),String(w.bc).padStart(4),String(w.wand).padStart(8),
  String(w.frac).padStart(6),' '+w.kreis+'/'+w.von));
const near=worst.filter(w=>w.wand<200).length;
console.log(`\nnah an der Wand (<200mm): ${near}/${worst.length}`);
console.log(`kurze Segmente (min(ab,bc)<50): ${worst.filter(w=>Math.min(w.ab,w.bc)<50).length}/${worst.length}`);
