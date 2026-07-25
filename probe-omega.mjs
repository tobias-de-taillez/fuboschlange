// Ist die Omega-Kehre am Punkt B wirklich eckig, oder zaehlt nur die Kennzahl
// eine Ecke, die nicht gezeichnet wird? Gemessen wird am GEZEICHNETEN Pfad.
import { load } from './harness.mjs';
const api=load('verlegeplan.html'); const S=api.S;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y}), len=v=>Math.hypot(v.x,v.y);
const unit=v=>{const l=len(v)||1;return{x:v.x/l,y:v.y/l};}, dot=(a,b)=>a.x*b.x+a.y*b.y;
// Kruemmungsradius aus DREI dicht beieinander liegenden Punkten des gezeichneten
// Pfades: Umkreis. Bei feiner Abtastung ist das der echte Radius.
const circum=(A,B,C)=>{
  const a=len(sub(B,C)), b=len(sub(A,C)), c=len(sub(A,B));
  const ar=Math.abs((B.x-A.x)*(C.y-A.y)-(C.x-A.x)*(B.y-A.y))/2;
  return ar<1e-12 ? Infinity : a*b*c/(4*ar);
};
const rng=(s=>()=>(s=s*1664525+1013904223>>>0)/4294967296)(12345);
let checked=0, bad=0, worstDrawn=Infinity, worstPoly=Infinity;
for(let run=0;run<20;run++){
  S.W=6000+rng()*6000; S.H=2400+rng()*3200;
  S.notchA=800+rng()*1500; S.notchB=600+rng()*1200; S.notchLeft=rng()<.5;
  const ring=api.lRing(0,0,S.W,S.H,S.notchA,S.notchB);
  const segs=ring.map((a,i)=>{const b=ring[(i+1)%ring.length];return{a,b,l:Math.hypot(b.x-a.x,b.y-a.y)};});
  const T=segs.reduce((s,e)=>s+e.l,0); let u=rng()*T;
  for(const e of segs){ if(u<=e.l){ S.manifold={x:e.a.x+(e.b.x-e.a.x)*(u/e.l),y:e.a.y+(e.b.y-e.a.y)*(u/e.l)}; break;} u-=e.l; }
  let plan; try{ plan=api.autofit(); }catch(e){ continue; }
  for(const l of plan.loops){
    const pts=l.pts, dr=l.drawn; if(!pts||!dr) continue;
    for(let i=1;i<pts.length-1;i++){
      const A=pts[i-1],B=pts[i],C=pts[i+1];
      if(B.arc||!C.arc) continue;               // genau der fragliche Fall
      const ab=len(sub(B,A)), bc=len(sub(C,B)); if(ab<1e-9||bc<1e-9) continue;
      const d=Math.acos(Math.max(-1,Math.min(1,dot(unit(sub(B,A)),unit(sub(C,B))))));
      if(d<Math.PI/3) continue;
      const rPoly=Math.min(ab,bc)/Math.max(1e-9,Math.tan(d/2));   // was pathCurve zaehlt
      // Den gezeichneten Punkt suchen, der B am naechsten liegt, und dort den
      // Umkreis dreier benachbarter gezeichneter Punkte nehmen.
      let k=-1,bd=Infinity;
      for(let j=0;j<dr.length;j++){ const q=len(sub(dr[j],B)); if(q<bd){bd=q;k=j;} }
      if(k<2||k>dr.length-3||bd>30) continue;
      let rDraw=Infinity;
      for(let j=k-1;j<=k+1;j++) rDraw=Math.min(rDraw,circum(dr[j-1],dr[j],dr[j+1]));
      checked++; worstPoly=Math.min(worstPoly,rPoly); worstDrawn=Math.min(worstDrawn,rDraw);
      if(rDraw<S.bendRadius-1) bad++;
    }
  }
}
console.log(`geprueft: ${checked} Stellen "B ist keine Bogenstuetze, C aber schon"`);
console.log(`  kleinster Radius laut pathCurve (Polygon): ${worstPoly.toFixed(1)} mm`);
console.log(`  kleinster Radius am GEZEICHNETEN Pfad:     ${worstDrawn.toFixed(1)} mm`);
console.log(`  davon wirklich unter ${S.bendRadius} mm: ${bad}`);
