// WOGEGEN kreuzt was? crossHits liefert nur Punkte. Hier dieselbe Rasterlogik,
// aber die Segmente behalten ihre Herkunft (Kreis + Teilstueck), damit die
// Paarung sichtbar wird.
import { load } from './harness.mjs';
const api=load('verlegeplan.html'); const S=api.S;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y}), len=v=>Math.hypot(v.x,v.y);
const PARTS=['leadIn','rand','mid','field','leadOut'];
const rng=(s=>()=>(s=s*1664525+1013904223>>>0)/4294967296)(12345);
const RP=Number(process.argv[2]||0);
const pair={}, tot={}, wall=[], far=[];
for(let run=0;run<20;run++){
  S.W=6000+rng()*6000; S.H=2400+rng()*3200;
  S.notchA=800+rng()*1500; S.notchB=600+rng()*1200; S.notchLeft=rng()<.5;
  if(RP) S.randPasses=RP;
  const ring=api.lRing(0,0,S.W,S.H,S.notchA,S.notchB);
  const segs0=ring.map((a,i)=>{const b=ring[(i+1)%ring.length];return{a,b,l:Math.hypot(b.x-a.x,b.y-a.y)};});
  const T=segs0.reduce((s,e)=>s+e.l,0); let u=rng()*T;
  for(const e of segs0){ if(u<=e.l){ S.manifold={x:e.a.x+(e.b.x-e.a.x)*(u/e.l),y:e.a.y+(e.b.y-e.a.y)*(u/e.l)}; break;} u-=e.l; }
  let plan; try{ plan=api.autofit(); }catch(e){ continue; }
  // beschriftete Polylinien
  const polys=[];
  plan.loops.forEach((l,li)=>PARTS.forEach(k=>{
    const p=l[k]; if(!p||p.length<2) return;
    polys.push({label:k, li, pts:api.drawnPoints(p,6)});
  }));
  // Uebergangspunkte zwischen Teilstuecken: dort beruehren sie sich zu Recht
  const joints=[];
  plan.loops.forEach(l=>PARTS.forEach(k=>{ const p=l[k]; if(!p||!p.length) return;
    joints.push(p[0],p[p.length-1]); }));
  const segs=[];
  polys.forEach((P,pi)=>{ for(let i=0;i+1<P.pts.length;i++)
    segs.push({pi,i,a:P.pts[i],b:P.pts[i+1]}); });
  const cell=Math.max(50,S.s), grid=new Map();
  segs.forEach((sg,si)=>{
    const x0=Math.floor(Math.min(sg.a.x,sg.b.x)/cell), x1=Math.floor(Math.max(sg.a.x,sg.b.x)/cell);
    const y0=Math.floor(Math.min(sg.a.y,sg.b.y)/cell), y1=Math.floor(Math.max(sg.a.y,sg.b.y)/cell);
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){
      const k=x*100000+y; let a=grid.get(k); if(!a){a=[];grid.set(k,a);} a.push(si); }
  });
  const seen=new Set(), N=segs.length;
  for(const arr of grid.values())
    for(let a=0;a<arr.length;a++)for(let b=a+1;b<arr.length;b++){
      const A=segs[arr[a]], B=segs[arr[b]];
      if(A.pi===B.pi&&Math.abs(A.i-B.i)<2) continue;
      const key=Math.min(arr[a],arr[b])*N+Math.max(arr[a],arr[b]);
      if(seen.has(key)) continue; seen.add(key);
      const c=api.segCrossPt(A.a,A.b,B.a,B.b); if(!c) continue;
      // Naht zwischen zwei Teilstuecken desselben Kreises ist keine Kreuzung
      if(joints.some(j=>len(sub(c,j))<40)) continue;
      const la=polys[A.pi], lb=polys[B.pi];
      const k=[la.label,lb.label].sort().join(' x ')+(la.li===lb.li?'':'  (versch. Kreise)');
      pair[k]=(pair[k]||0)+1; tot[la.label]=(tot[la.label]||0)+1; tot[lb.label]=(tot[lb.label]||0)+1;
      if(k.startsWith('field x rand')){
        const dw=Math.min(...ring.map((q,i)=>{const r=ring[(i+1)%ring.length];
          const ab={x:r.x-q.x,y:r.y-q.y};
          const t=Math.max(0,Math.min(1,((c.x-q.x)*ab.x+(c.y-q.y)*ab.y)/((ab.x*ab.x+ab.y*ab.y)||1)));
          return len(sub(c,{x:q.x+ab.x*t,y:q.y+ab.y*t}));}));
        wall.push(dw);
        if(dw>500){ const mw=P=>Math.max(...P.pts.map(z=>Math.min(...ring.map((q,i)=>{
            const r=ring[(i+1)%ring.length], ab={x:r.x-q.x,y:r.y-q.y};
            const t=Math.max(0,Math.min(1,((z.x-q.x)*ab.x+(z.y-q.y)*ab.y)/((ab.x*ab.x+ab.y*ab.y)||1)));
            return len(sub(z,{x:q.x+ab.x*t,y:q.y+ab.y*t}));}))));
          if(far.length<5) far.push(`  Punkt ${Math.round(dw)} mm von Wand | ${la.label}(max ${Math.round(mw(la))}) x ${lb.label}(max ${Math.round(mw(lb))})`); }
      }
    }
}
console.log('Kreuzungspaare, 20 Laeufe, absteigend:\n');
Object.entries(pair).sort((a,b)=>b[1]-a[1]).slice(0,14)
  .forEach(([k,v])=>console.log(String(v).padStart(5)+'  '+k));
console.log('\nje Teilstueck beteiligt:', JSON.stringify(tot));
far.forEach(t=>console.log(t));
// UNBRAUCHBAR, absichtlich stehen gelassen: "Abstand zur naechsten Wand" ist ein
// Minimum konvexer Funktionen und damit selbst NICHT konvex. Ueber einer langen
// Strecke, die eine einspringende Ecke ueberspannt, liegt der Wert in der Mitte
// ueber beiden Endwerten - gemessen "Punkt 542 mm von Wand | rand(max 300)",
// also ein Kreuzungspunkt angeblich weiter draussen als der entfernteste
// Stuetzpunkt der beteiligten Polylinie. Die PAAR-Statistik haengt nicht daran
// und bleibt gueltig; diese Zahlen sind es nicht.
if(0&&wall.length){ wall.sort((a,b)=>a-b);
  const q=f=>Math.round(wall[Math.floor(f*(wall.length-1))]);
  console.log(`\nfield x rand: Wandabstand der Kreuzungspunkte, n=${wall.length}`);
  console.log(`  min ${q(0)}  p25 ${q(.25)}  median ${q(.5)}  p75 ${q(.75)}  max ${q(1)} mm`);
  console.log(`  Randzonenband = randPasses*randSpacing = ${S.randPasses*S.randSpacing} mm, edgeGap = ${S.edgeGap}`);
}
