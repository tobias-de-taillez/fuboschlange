import {Clipper, ClipperOffset, JoinType, EndType, Paths64} from './package/fesm2020/clipper2-js.mjs';
const toPts=p=>p.map(pt=>({x:Number(pt.x),y:Number(pt.y)}));
const mk=pts=>Clipper.makePath(pts.flatMap(p=>[p.x,p.y]));
const areaOf=pts=>{let a=0;for(let i=0,j=pts.length-1;i<pts.length;j=i++)a+=(pts[j].x*pts[i].y-pts[i].x*pts[j].y);return Math.abs(a)/2;};
function offsetInward(ring,d){const co=new ClipperOffset(2.0,8);const ps=new Paths64();ps.push(mk(ring));
  co.addPaths(ps,JoinType.Round,EndType.Polygon);const out=new Paths64();co.execute(-d,out);
  return out.map(toPts).filter(r=>r.length>=3);}

// --- Segmentschnitt, echte Kreuzung (keine gemeinsamen Endpunkte)
function segX(p1,p2,p3,p4){
  const d=(p2.x-p1.x)*(p4.y-p3.y)-(p2.y-p1.y)*(p4.x-p3.x);
  if(Math.abs(d)<1e-12) return false;
  const t=((p3.x-p1.x)*(p4.y-p3.y)-(p3.y-p1.y)*(p4.x-p3.x))/d;
  const u=((p3.x-p1.x)*(p2.y-p1.y)-(p3.y-p1.y)*(p2.x-p1.x))/d;
  const e=1e-9;
  return t>e&&t<1-e&&u>e&&u<1-e;
}
function selfCross(path){let n=0;
  for(let i=0;i<path.length-1;i++)for(let j=i+2;j<path.length-1;j++){
    if(i===0&&j===path.length-2)continue;
    if(segX(path[i],path[i+1],path[j],path[j+1]))n++;
  } return n;}

// --- Kontur an dem Punkt aufschneiden, der `anchor` am naechsten liegt, und als offene Kette liefern
function cutAt(ring,anchor){
  let bi=0,bd=Infinity;
  ring.forEach((p,i)=>{const d=(p.x-anchor.x)**2+(p.y-anchor.y)**2; if(d<bd){bd=d;bi=i;}});
  return ring.slice(bi).concat(ring.slice(0,bi));
}
const bifilarOrder=n=>{const ev=[],od=[];for(let i=0;i<n;i++)(i%2===0?ev:od).push(i);od.reverse();return ev.concat(od);};

// --- eine lineare Kette von Konturen bifilaer verbinden
function chainPath(rings){
  const ord=bifilarOrder(rings.length);
  let out=[], anchor=rings[0][0];
  for(const k of ord){
    const c=cutAt(rings[k],anchor);
    out=out.concat(c);
    anchor=c[c.length-1];
  }
  return out;
}

const L=[{x:0,y:0},{x:8000,y:0},{x:8000,y:2000},{x:3000,y:2000},{x:3000,y:5000},{x:0,y:5000}];
const R=[{x:0,y:0},{x:6000,y:0},{x:6000,y:4000},{x:0,y:4000}];
const T=[{x:0,y:0},{x:6000,y:0},{x:4500,y:3000},{x:0,y:3000}];        // schraege Wand
for(const [name,room] of [['Rechteck 6x4',R],['Trapez (schraege Wand)',T],['L-Raum',L]]){
  // nur den Stamm nehmen, solange die Kontur nicht aufspaltet
  const rings=[room]; let cur=room;
  for(let k=0;k<40;k++){ const nx=offsetInward(cur,150).filter(r=>areaOf(r)>=0.15e6);
    if(nx.length!==1) break; rings.push(nx[0]); cur=nx[0]; }
  const path=chainPath(rings);
  const len=path.reduce((s,p,i)=>i?s+Math.hypot(p.x-path[i-1].x,p.y-path[i-1].y):0,0);
  console.log(`${name.padEnd(24)} ${String(rings.length).padStart(2)} Konturen im Stamm, Pfad ${(len/1000).toFixed(1)} m, Selbstkreuzungen: ${selfCross(path)}`);
}
