import {Clipper, ClipperOffset, JoinType, EndType, Paths64} from './package/fesm2020/clipper2-js.mjs';
const toPts=p=>p.map(pt=>({x:Number(pt.x),y:Number(pt.y)}));
const mk=pts=>Clipper.makePath(pts.flatMap(p=>[p.x,p.y]));
const areaOf=p=>{let a=0;for(let i=0,j=p.length-1;i<p.length;j=i++)a+=(p[j].x*p[i].y-p[i].x*p[j].y);return Math.abs(a)/2;};
function offIn(ring,d){const co=new ClipperOffset(2.0,8);const ps=new Paths64();ps.push(mk(ring));
  co.addPaths(ps,JoinType.Round,EndType.Polygon);const o=new Paths64();co.execute(-d,o);
  return o.map(toPts).filter(r=>r.length>=3);}
function segX(a,b,c,d){const D=(b.x-a.x)*(d.y-c.y)-(b.y-a.y)*(d.x-c.x);if(Math.abs(D)<1e-12)return false;
  const t=((c.x-a.x)*(d.y-c.y)-(c.y-a.y)*(d.x-c.x))/D,u=((c.x-a.x)*(b.y-a.y)-(c.y-a.y)*(b.x-a.x))/D,e=1e-9;
  return t>e&&t<1-e&&u>e&&u<1-e;}
function selfCross(P){let n=0;for(let i=0;i<P.length-1;i++)for(let j=i+2;j<P.length-1;j++){
  if(i===0&&j===P.length-2)continue; if(segX(P[i],P[i+1],P[j],P[j+1]))n++;} return n;}

// Kontur gleichmaessig nach Bogenlaenge abtasten, Start am Punkt naechst `seed`
function resample(ring,N,seed){
  let bi=0,bd=Infinity; ring.forEach((p,i)=>{const d=(p.x-seed.x)**2+(p.y-seed.y)**2;if(d<bd){bd=d;bi=i;}});
  const R=ring.slice(bi).concat(ring.slice(0,bi)); R.push(R[0]);
  const seg=[],cum=[0]; let L=0;
  for(let i=1;i<R.length;i++){L+=Math.hypot(R[i].x-R[i-1].x,R[i].y-R[i-1].y);cum.push(L);}
  const out=[];
  for(let k=0;k<N;k++){
    const t=L*k/N; let i=1; while(i<cum.length-1&&cum[i]<t)i++;
    const f=(t-cum[i-1])/((cum[i]-cum[i-1])||1);
    out.push({x:R[i-1].x+(R[i].x-R[i-1].x)*f, y:R[i-1].y+(R[i].y-R[i-1].y)*f});
  }
  return out;
}
// Spiral-Morphing: von Kontur A stetig nach Kontur B ueber eine volle Umrundung
function morph(A,B,N,seed){
  const a=resample(A,N,seed), b=resample(B,N,seed), out=[];
  for(let k=0;k<N;k++){const t=k/N; out.push({x:a[k].x+(b[k].x-a[k].x)*t, y:a[k].y+(b[k].y-a[k].y)*t});}
  return out;
}
// Zwei verschraenkte Spiralen: hin ueber gerade Konturen, zurueck ueber ungerade
function bifilar(rings,N=400){
  const seed=rings[0][0];
  const even=[],odd=[];
  for(let k=0;k+2<rings.length;k+=2) even.push(...morph(rings[k],rings[k+2],N,seed));
  for(let k=1;k+2<rings.length;k+=2) odd .push(...morph(rings[k],rings[k+2],N,seed));
  return even.concat(odd.reverse());     // Kehre in der Mitte
}

const R=[{x:0,y:0},{x:6000,y:0},{x:6000,y:4000},{x:0,y:4000}];
const T=[{x:0,y:0},{x:6000,y:0},{x:4500,y:3000},{x:0,y:3000}];
const L=[{x:0,y:0},{x:8000,y:0},{x:8000,y:2000},{x:3000,y:2000},{x:3000,y:5000},{x:0,y:5000}];
for(const [name,room] of [['Rechteck 6x4',R],['Trapez schraeg',T],['L (nur Stamm)',L]]){
  const rings=[room]; let cur=room;
  for(let k=0;k<40;k++){const nx=offIn(cur,150).filter(r=>areaOf(r)>=0.15e6); if(nx.length!==1)break; rings.push(nx[0]); cur=nx[0];}
  const P=bifilar(rings);
  const len=P.reduce((s,p,i)=>i?s+Math.hypot(p.x-P[i-1].x,p.y-P[i-1].y):0,0);
  console.log(`${name.padEnd(16)} ${String(rings.length).padStart(2)} Konturen, Pfad ${(len/1000).toFixed(1)} m, Selbstkreuzungen: ${selfCross(P)}`);
}
