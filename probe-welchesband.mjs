// Welches Teilstueck bricht aus seinem Band aus? Gemessen wird ENTHALTENSEIN,
// nicht Abstand: bei einem L-Grundriss ist "Abstand zur naechsten Wand" ein
// Minimum konvexer Funktionen und damit nicht konvex - daran ist die Sonde aus
// Runde 19 gescheitert. Punkt-in-Polygon haelt auch bei einspringenden Ecken.
import { load } from './harness.mjs';
const api=load('verlegeplan.html'); const S=api.S;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y}), len=v=>Math.hypot(v.x,v.y);
const inPoly=(p,poly)=>{ let c=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];
    if(((a.y>p.y)!==(b.y>p.y)) && p.x<(b.x-a.x)*(p.y-a.y)/((b.y-a.y)||1e-9)+a.x) c=!c; }
  return c; };
const PARTS=['leadIn','rand','mid','field','leadOut'];
const rng=(s=>()=>(s=s*1664525+1013904223>>>0)/4294967296)(12345);
let nFR=0, inField=0, outField=0, randInField=0, fieldOutField=0, noRing=0;
for(let run=0;run<20;run++){
  S.W=6000+rng()*6000; S.H=2400+rng()*3200;
  S.notchA=800+rng()*1500; S.notchB=600+rng()*1200; S.notchLeft=rng()<.5;
  const ring=api.lRing(0,0,S.W,S.H,S.notchA,S.notchB);
  const sg=ring.map((a,i)=>{const b=ring[(i+1)%ring.length];return{a,b,l:Math.hypot(b.x-a.x,b.y-a.y)};});
  const T=sg.reduce((s,e)=>s+e.l,0); let u=rng()*T;
  for(const e of sg){ if(u<=e.l){ S.manifold={x:e.a.x+(e.b.x-e.a.x)*(u/e.l),y:e.a.y+(e.b.y-e.a.y)*(u/e.l)}; break;} u-=e.l; }
  let plan; try{ plan=api.autofit(); }catch(e){ continue; }
  const fi=api.fieldInset();
  const fring=api.insetRoomRing(fi);
  if(!fring||fring.length<3){ noRing++; continue; }
  const polys=[]; plan.loops.forEach((l,li)=>PARTS.forEach(k=>{
    const p=l[k]; if(!p||p.length<2) return; polys.push({label:k,li,pts:api.drawnPoints(p,6)}); }));
  const joints=[]; plan.loops.forEach(l=>PARTS.forEach(k=>{ const p=l[k]; if(!p||!p.length) return;
    joints.push(p[0],p[p.length-1]); }));
  const segs=[]; polys.forEach((P,pi)=>{ for(let i=0;i+1<P.pts.length;i++)
    segs.push({pi,i,a:P.pts[i],b:P.pts[i+1]}); });
  const cell=Math.max(50,S.s), grid=new Map();
  segs.forEach((s0,si)=>{ const x0=Math.floor(Math.min(s0.a.x,s0.b.x)/cell),x1=Math.floor(Math.max(s0.a.x,s0.b.x)/cell);
    const y0=Math.floor(Math.min(s0.a.y,s0.b.y)/cell),y1=Math.floor(Math.max(s0.a.y,s0.b.y)/cell);
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){ const k=x*100000+y;
      let a=grid.get(k); if(!a){a=[];grid.set(k,a);} a.push(si); } });
  const seen=new Set(), N=segs.length;
  for(const arr of grid.values())
    for(let a=0;a<arr.length;a++)for(let b=a+1;b<arr.length;b++){
      const A=segs[arr[a]],B=segs[arr[b]];
      if(A.pi===B.pi&&Math.abs(A.i-B.i)<2) continue;
      const key=Math.min(arr[a],arr[b])*N+Math.max(arr[a],arr[b]);
      if(seen.has(key)) continue; seen.add(key);
      const c=api.segCrossPt(A.a,A.b,B.a,B.b); if(!c) continue;
      if(joints.some(j=>len(sub(c,j))<40)) continue;
      const ls=[polys[A.pi].label,polys[B.pi].label].sort().join('|');
      if(ls!=='field|rand') continue;
      nFR++;
      if(inPoly(c,fring)){ inField++; randInField++; } else { outField++; fieldOutField++; }
    }
}
console.log(`field x rand Kreuzungen: ${nFR}   (Laeufe ohne Feld-Ring: ${noRing})`);
console.log(`  INNERHALB des Feld-Rings (rand ragt ins Feld):  ${inField}`);
console.log(`  AUSSERHALB (field ragt in die Randzone):        ${outField}`);
console.log(`\nfieldInset() = edgeGap + randWidth + omegaClear = ${Math.round(api.fieldInset())} mm`);
console.log(`  davon edgeGap ${S.edgeGap}, randzone ${S.randPasses*S.randSpacing}, Rest Korridor+Omega`);
