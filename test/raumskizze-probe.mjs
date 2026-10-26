// Prueft den geo-Block von raumskizze-probe.html gegen synthetische Kameras
// und gerenderte Raeume mit bekannter Wahrheit. Eine Abweichung hier liegt am
// Code, nicht am Telefon. Zum Schluss geht die Skizze durch genau die
// Import-, Vorschlags- und Ausgleichsfunktionen von raumaufmass.html.
// Stand 6 (ARCHITEKTUR v3, 17.12): Wortgleich-Pruefung von M0/M1, der M3-Platzhalter, die
// Loeser-Messung, und der app-Block am nachgebauten Geraet (Attrappen fuer DOM, WebXR, WebGL2,
// OPFS, Worker; feste Uhr): ohne Schalter muss er dasselbe tun wie Stand 5 (Commit ebe8b6f,
// per git show), mit ?karte=1 und ?mess=1 das, was 9.4 verlangt - und nicht mehr.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Blob as NodeBlob} from 'node:buffer';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {Worker} from 'node:worker_threads';

const read=f=>readFileSync(new URL('../'+f, import.meta.url),'utf8');
// RAUMSKIZZE_HTML=pfad prueft einen anderen Stand der Seite (Varianten).
const probe=process.env.RAUMSKIZZE_HTML ? readFileSync(process.env.RAUMSKIZZE_HTML,'utf8') : read('raumskizze-probe.html'), app=read('raumaufmass.html');
const pick=(src,id)=>{
  const m=src.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`));
  if(!m) throw new Error(`Script-Block "${id}" nicht gefunden`);
  return m[1];
};
new Function('"use strict";\n'+pick(probe,'vendor')+'\n'+pick(probe,'geo'))();
const G=globalThis.RAUMSKIZZE;

// Die App-Funktionen, so wie test/run.mjs sie laedt. importProblem liegt im
// ui-Block, ist aber rein - es wird einzeln herausgeloest.
const imp=app.match(/function importProblem\(o\)\{[\s\S]*?\n\}\n/);
if(!imp) throw new Error('importProblem in raumaufmass.html nicht gefunden');
new Function('"use strict";\n'+pick(app,'vendor')+'\n'+pick(app,'core')+'\n'+pick(app,'tiles')+'\n'+pick(app,'store')
  +'\n'+imp[0]+'\nglobalThis.__APP={suggest, solve, wallPolygon, roomArea, importProblem, parseShareFragment:globalThis.parseShareFragment};')();
const APP=globalThis.__APP;

const out=[]; let ok=true;
const chk=(name,cond,info='')=>{ ok=ok&&!!cond; out.push((cond?'ok   ':'ROT  ')+name+(info!==''?'  ('+info+')':'')); };
const f3=x=>Number.isFinite(x) ? x.toFixed(3) : String(x);

// Deterministischer Zufall, damit ein roter Lauf reproduzierbar bleibt.
const rng=seed=>()=>{ seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed);
  t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };

// ------------------------------------------------- synthetische Kamera
// Perspektive wie XRView.projectionMatrix (spaltenweise, Blick entlang -Z).
const perspective=(fovyDeg, aspect, near=0.05, far=50)=>{
  const f=1/Math.tan(fovyDeg*Math.PI/360);
  return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)/(near-far),-1, 0,0,2*far*near/(near-far),0];
};
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const nrm=v=>{ const n=Math.hypot(...v); return v.map(x=>x/n); };
// Kamera bei C, Blick auf T, oben = +Y. Liefert camTo (Kamera -> Welt).
const lookAt=(C,T)=>{
  const f=nrm(sub(T,C)), r=nrm(cross(f,[0,1,0])), u=cross(r,f);
  return [r[0],r[1],r[2],0, u[0],u[1],u[2],0, -f[0],-f[1],-f[2],0, C[0],C[1],C[2],1];
};
// Hochformat wie am Telefon, in der Groesse, die die App liest (ds=640).
const IW=288, IH=640, PROJ=perspective(62, IW/IH);

// 1. Matrizen und Projektion
{
  const R=rng(1);
  let worst=0;
  for(let n=0;n<20;n++){
    const m=lookAt([R()*4,R()*2,R()*4],[R()*4+5,R()*2,R()*4-3]);
    const I=G.m4mul(m, G.m4inv(m));
    for(let i=0;i<16;i++) worst=Math.max(worst, Math.abs(I[i]-(i%5===0?1:0)));
    const P=G.m4mul(PROJ, G.m4inv(m)), Pi=G.m4inv(P), I2=G.m4mul(P,Pi);
    for(let i=0;i<16;i++) worst=Math.max(worst, Math.abs(I2[i]-(i%5===0?1:0)));
  }
  chk('m4inv: M·M⁻¹ = I (starr und Projektion)', worst<1e-9, worst.toExponential(1));

  let off=0, back=0;
  const cam=lookAt([1,1.5,2],[3,2.4,-1]);
  for(let n=0;n<50;n++){
    const P=[R()*6-1, R()*2.6, R()*-5];
    const q=G.project(PROJ, cam, P); if(!q) continue;
    const r=G.ray(PROJ, cam, q[0], q[1]);
    const w=sub(P,r.o), t=w[0]*r.d[0]+w[1]*r.d[1]+w[2]*r.d[2];
    off=Math.max(off, Math.hypot(...sub(w, r.d.map(x=>x*t))));
  }
  chk('ray(project(P)) geht durch P', off<1e-9, off.toExponential(1));
  chk('project: Punkt hinter der Kamera -> null', G.project(PROJ, lookAt([0,1.5,0],[0,1.5,-1]), [0,1.5,2])===null);
  for(const [u,r] of [[0,0],[IW-1,IH-1],[17,301]]) for(const flip of [false,true]){
    const n=G.pixToNdc(u,r,IW,IH,flip), p=G.ndcToPix(n[0],n[1],IW,IH,flip);
    back=Math.max(back, Math.abs(p[0]-u)+Math.abs(p[1]-r));
  }
  chk('pixToNdc/ndcToPix Rundlauf, auch gespiegelt', back<1e-9);
  const seg=G.projectSegment(PROJ, lookAt([0,1.5,0],[0,1.5,-1]), [0,2.5,-2], [0,2.5,3]);
  chk('projectSegment kappt Punkt hinter der Kamera', !!seg && seg.every(p=>p.every(Number.isFinite)) && seg[1][1]>0.9);
  const h=G.hitY(G.ray(PROJ, lookAt([0,1.5,0],[0,2.6,-2]),0,0), 2.6);
  chk('hitY: Strahl trifft Decke im Zielpunkt', !!h && Math.hypot(h[0],h[2]+2)<1e-9, h&&h.map(f3).join(','));
  chk('hitY: Strahl nach unten trifft Decke nicht', G.hitY(G.ray(PROJ, lookAt([0,1.5,0],[0,0,-2]),0,0), 2.6)===null);
}

// ----------------------------------------------- 2D-Kantensuche allein
// Zwei weisse Flaechen mit nur 3 Graustufen Unterschied, Rauschen ±3: der
// Fall, an dem Canny laut Recherche scheitert.
const stepImage=(W,H,angDeg,rho,lo,hi,noise,seed,extra)=>{
  const R=rng(seed), g=new Float32Array(W*H);
  const a=angDeg*Math.PI/180, nx=Math.cos(a), ny=Math.sin(a), cx=(W-1)/2, cy=(H-1)/2;
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const d=(x-cx)*nx+(y-cy)*ny-rho;
    let v=d<0 ? lo : hi;
    if(extra) v=extra(x,y,v);
    g[y*W+x]=v+(R()*2-1)*noise;
  }
  return g;
};
{
  const W=160, H=160;
  const g=stepImage(W,H,20,5,200,203,3,7);
  const s=G.snapEdge(g,W,H,(W-1)/2,(H-1)/2,{radius:50});
  const ang=s ? (Math.atan2(s.ny,s.nx)*180/Math.PI+360)%180 : NaN;
  const rho=s ? (s.px-(W-1)/2)*s.nx+(s.py-(H-1)/2)*s.ny : NaN;
  chk('snapEdge: 3 Graustufen, Rauschen ±3 – Winkel', Math.abs(ang-20)<=2, ang);
  chk('snapEdge: 3 Graustufen – Lage ±1 px', Math.abs(Math.abs(rho)-5)<=1, f3(rho));
  const e=s && G.extendLine(g,W,H,s);
  const ea=e ? (Math.atan2(e.dx,-e.dy)*180/Math.PI+360)%180 : NaN;
  chk('extendLine: Richtung nach Verlaengerung ±0,5°', Math.abs(ea-20)<=0.5 || Math.abs(ea-200)<=0.5, f3(ea));

  // Staerkere Kante 45 px neben dem Fadenkreuz: die nahe gewinnt.
  const g2=stepImage(W,H,0,3,200,206,2,8,(x,y,v)=>x>(W-1)/2+45 ? v-40 : v);
  const s2=G.snapEdge(g2,W,H,(W-1)/2,(H-1)/2,{radius:60});
  const rho2=s2 ? (s2.px-(W-1)/2)*s2.nx+(s2.py-(H-1)/2)*s2.ny : NaN;
  chk('snapEdge: nahe schwache Kante schlaegt ferne starke', Math.abs(Math.abs(rho2)-3)<=1, f3(rho2));

  // Ausschluss: senkrechte Kante kontrastreicher, gesucht ist die waagerechte.
  const g3=stepImage(W,H,90,-4,200,206,2,9,(x,y,v)=>x>(W-1)/2+6 ? v+25 : v);
  const s3=G.snapEdge(g3,W,H,(W-1)/2,(H-1)/2,{radius:50, exclude:{dir:[0,1], deg:25}});
  chk('snapEdge: Senkrechte ausgeschlossen -> waagerechte Kante', !!s3 && Math.abs(s3.ny)>0.95, s3 && f3(s3.ny));
  const s4=G.snapEdge(g3,W,H,(W-1)/2,(H-1)/2,{radius:50});
  chk('snapEdge: ohne Ausschluss gewinnt die senkrechte', !!s4 && Math.abs(s4.nx)>0.95, s4 && f3(s4.nx));
}

// --------------------------------------------- gerenderter Raum, L-Form
// Wahrheit im Ankerraum (Meter): Grundriss (X,Z), Decke bei y = HT.
const HT=2.6;
const ROOM=[[0,0],[5,0],[5,3],[3,3],[3,5],[0,5]];
const NW=ROOM.length, AREA=5*3+3*2;
const inRoom=(x,z)=>{ let c=false; for(let i=0,j=NW-1;i<NW;j=i++){ const [xi,zi]=ROOM[i],[xj,zj]=ROOM[j];
  if((zi>z)!==(zj>z) && x<(xj-xi)*(z-zi)/(zj-zi)+xi) c=!c; } return c; };
// Innen-Normale einer Wand: die Seite, auf der der Raum liegt.
const inward=i=>{
  const [a,b]=[ROOM[i],ROOM[(i+1)%NW]], L=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const n=[-(b[1]-a[1])/L, (b[0]-a[0])/L], m=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  return inRoom(m[0]+0.05*n[0], m[1]+0.05*n[1]) ? n : [-n[0],-n[1]];
};
// Weisser Raum: Decke 204, Waende 198..202, Kontrast nur 2..6 Graustufen.
// Ein Regal reicht bis zur Decke und verdeckt an Wand 0 ein Stueck Kante,
// ein Bild haengt an Wand 1 mit der Oberkante 15 cm unter der Decke.
// flip: Zeile 0 ist oben statt unten - wie eine andersherum liegende
// Kameratextur, fuer den y-Spiegel der App.
// strip: Streifen an allen Waenden drop..drop+h unter der Decke, Helligkeit val oder
// Wand+dv (Leiste, Schattenfuge); ceil/wall ueberschreiben Decke bzw. Waende.
const SHELF={x0:3.4, x1:4.4, z0:0, z1:0.45, y1:HT};
const render=(cam,seed,noise=2,flip=false,band=null,strip=null)=>{
  const R=rng(seed), g=new Float32Array(IW*IH);
  for(let r=0;r<IH;r++) for(let u=0;u<IW;u++){
    const [x,y]=G.pixToNdc(u,r,IW,IH,flip);
    const ray=G.ray(PROJ,cam,x,y);
    let tBest=Infinity, val=60;
    const c=G.hitY(ray,HT,50);
    if(c && inRoom(c[0],c[2])){ tBest=Math.hypot(...sub(c,ray.o)); val=204; }
    // band: heller Streifen an der Decke vor Wand band.i (Gardinenschiene),
    // d0..d1 Meter von der Wand - eine Linie, keine Stufe.
    if(band && val===204){ const [a,b]=[ROOM[band.i],ROOM[(band.i+1)%NW]], L=Math.hypot(b[0]-a[0],b[1]-a[1]);
      const dw=Math.abs((c[0]-a[0])*(b[1]-a[1])-(c[2]-a[1])*(b[0]-a[0]))/L; if(dw>=band.d0 && dw<=band.d1) val+=band.dv; }
    if(strip && strip.ceil!=null && val===204) val=strip.ceil;
    // ao: weicher Eckschatten (Rampe) an der Decke, h Meter breit, dvCeil Stufen an der Wand.
    if(strip && strip.ao && tBest<Infinity){ let dm=Infinity; for(let i=0;i<NW;i++){ const [a,b]=[ROOM[i],ROOM[(i+1)%NW]], ex=b[0]-a[0], ez=b[1]-a[1];
      const s=Math.max(0,Math.min(1,((c[0]-a[0])*ex+(c[2]-a[1])*ez)/(ex*ex+ez*ez))); dm=Math.min(dm, Math.hypot(c[0]-a[0]-s*ex, c[2]-a[1]-s*ez)); }
      if(dm<strip.ao.h) val+=strip.ao.dvCeil*(1-dm/strip.ao.h); }
    for(let i=0;i<NW;i++){
      const [a,b]=[ROOM[i],ROOM[(i+1)%NW]];
      const ex=b[0]-a[0], ez=b[1]-a[1];
      const den=ray.d[0]*ez-ray.d[2]*ex; if(Math.abs(den)<1e-12) continue;
      const t=((a[0]-ray.o[0])*ez-(a[1]-ray.o[2])*ex)/den;
      if(!(t>0) || t>=tBest) continue;
      const px=ray.o[0]+t*ray.d[0], py=ray.o[1]+t*ray.d[1], pz=ray.o[2]+t*ray.d[2];
      const s=((px-a[0])*ex+(pz-a[1])*ez)/(ex*ex+ez*ez);
      if(s<0 || s>1 || py<0 || py>HT) continue;
      tBest=t; val=band && band.i===i && band.wall!=null ? band.wall : 198+(i%3)*2;
      if(i===1 && py>1.9 && py<2.45 && s>0.2 && s<0.55) val=150;
      if(strip){ if(strip.wall!=null && val!==150) val=strip.wall;
        if(py>HT-strip.drop-strip.h && py<=HT-strip.drop) val=strip.val ?? val+strip.dv;
        if(strip.ao && HT-py<strip.ao.h) val+=strip.ao.dvWall*(1-(HT-py)/strip.ao.h); }
    }
    // Regal als Quader (nur die dem Raum zugewandte Front und Seiten zaehlen).
    for(const [axis,pos,lo1,hi1] of [['z',SHELF.z1,SHELF.x0,SHELF.x1],['x',SHELF.x0,SHELF.z0,SHELF.z1],['x',SHELF.x1,SHELF.z0,SHELF.z1]]){
      const k=axis==='z'?2:0, d=ray.d[k]; if(Math.abs(d)<1e-12) continue;
      const t=(pos-ray.o[k])/d; if(!(t>0) || t>=tBest) continue;
      const p=ray.o.map((o,i)=>o+t*ray.d[i]), q=axis==='z'?p[0]:p[2];
      if(q>=lo1 && q<=hi1 && p[1]>=0 && p[1]<=SHELF.y1){ tBest=t; val=120; }
    }
    g[r*IW+u]=val+(R()*2-1)*noise;
  }
  // sharpen: unscharfe Maske wie in der Kamera-Pipeline (Ueberschwinger an Kanten).
  if(strip && strip.sharpen){ const b=new Float32Array(g.length);
    for(let r=1;r<IH-1;r++) for(let u=1;u<IW-1;u++){ let s=0; for(let dr=-1;dr<=1;dr++) for(let du=-1;du<=1;du++) s+=g[(r+dr)*IW+u+du]*(2-Math.abs(dr))*(2-Math.abs(du)); b[r*IW+u]=s/16; }
    for(let r=1;r<IH-1;r++) for(let u=1;u<IW-1;u++){ const i=r*IW+u; b[i]=g[i]+strip.sharpen*(g[i]-b[i]); }
    for(let r=1;r<IH-1;r++) for(let u=1;u<IW-1;u++) g[r*IW+u]=b[r*IW+u]; }
  return g;
};
// Eine Erfassung genau wie in der App: G.captureEdge mit dem ausgelieferten
// Suchradius, dann G.obsFromNdc.
const capture=(cam,g,flip=false)=>{
  const L=G.captureEdge(g,IW,IH,PROJ,cam,flip);
  if(!L) return null;
  const ob=G.obsFromNdc(PROJ,cam,L.A,L.B,HT,12);
  return ob ? {...ob, z:L.z, good:L.good} : null;
};
// Zwei Standpunkte je Wand in verschiedenem Abstand, Augenhoehe 1,45 / 1,6 m,
// Zielpunkt auf der Wand-Decke-Kante seitlich versetzt (nicht die Ecke). Der
// zweite zielt 4 cm unter die Kante - genau trifft am Telefon niemand.
const viewsFor=i=>{
  const [a,b]=[ROOM[i],ROOM[(i+1)%NW]], n=inward(i), L=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const P=s=>[a[0]+s*(b[0]-a[0]), a[1]+s*(b[1]-a[1])];
  const vs=[];
  for(const [s,d,h,ds,below] of [[0.42,1.2,1.45,0.10,0],[0.58,2.1,1.60,-0.08,0.04]]){
    const m=P(s), dd=Math.min(d, L<=2.5 ? 1.5 : d);
    const C=[m[0]+dd*n[0]+ds*(b[0]-a[0]), h, m[1]+dd*n[1]+ds*(b[1]-a[1])];
    if(!inRoom(C[0],C[2])) continue;
    vs.push(lookAt(C,[m[0],HT-below,m[1]]));
  }
  return vs;
};
const trueLine=i=>{ const [a,b]=[ROOM[i],ROOM[(i+1)%NW]], L=Math.hypot(b[0]-a[0],b[1]-a[1]);
  return {c:a, u:[(b[0]-a[0])/L,(b[1]-a[1])/L]}; };
const lineErr=(f,i)=>{ // Winkel (Grad) und Abstand der Wandmitte von der Geraden (m)
  const t=trueLine(i), [a,b]=[ROOM[i],ROOM[(i+1)%NW]], m=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  const ang=Math.acos(Math.min(1,Math.abs(f.u[0]*t.u[0]+f.u[1]*t.u[1])))*180/Math.PI;
  return {ang, off:Math.abs(-(m[0]-f.c[0])*f.u[1]+(m[1]-f.c[1])*f.u[0])};
};
const obsErr=(ob,i)=>{ const l=G.liftObs(ob,HT); const f=l && G.fitLine2D(l); return f ? lineErr(f,i) : {ang:Infinity, off:Infinity}; };
// Kamera um die Blickachse gerollt (Telefon schraeg gehalten).
const lookAtRoll=(C,T,deg)=>{
  const m=lookAt(C,T), c=Math.cos(deg*Math.PI/180), s=Math.sin(deg*Math.PI/180);
  const r=[m[0],m[1],m[2]], u=[m[4],m[5],m[6]];
  const r2=r.map((v,i)=>c*v+s*u[i]), u2=u.map((v,i)=>-s*r[i]+c*v);
  return [...r2,0, ...u2,0, m[8],m[9],m[10],0, m[12],m[13],m[14],1];
};

// Ganzer Rundgang mit mehreren Rauschfolgen: jede einzelne Erfassung muss
// die richtige Wand treffen, nicht nur der Mittelwert.
const SEEDS=[1,2,3,4];
let walls=null, worstObs=0, notGood=0, lost=0, worstCorner=0, worstLine=0, worstOff=0, warn=[], areaErr=0;
for(const seed of SEEDS){
  const W=[];
  for(let i=0;i<NW;i++){
    const obs=[];
    viewsFor(i).forEach((cam,k)=>{
      const ob=capture(cam, render(cam, 1000*seed+10*i+k));
      if(!ob){ lost++; return; }
      if(!ob.good) notGood++;
      worstObs=Math.max(worstObs, obsErr(ob,i).ang);
      obs.push(ob);
    });
    W.push(obs);
  }
  for(let i=0;i<NW;i++){ const f=G.wallLine(W[i],HT); const e=f ? lineErr(f,i) : {ang:Infinity, off:Infinity};
    worstLine=Math.max(worstLine,e.ang); worstOff=Math.max(worstOff,e.off); }
  const room=G.buildRoom(W.map(o=>G.wallLine(o,HT)));
  worstCorner=Math.max(worstCorner, room.corners ? Math.max(...room.corners.map((c,i)=>Math.hypot(c[0]-ROOM[i][0],c[1]-ROOM[i][1]))) : Infinity);
  warn.push(...room.warnings);
  areaErr=Math.max(areaErr, room.area ? Math.abs(room.area-AREA)/AREA : Infinity);
  if(seed===SEEDS[0]) walls=W;
}
const NOBS=SEEDS.length*NW*2;
chk(`gerendert 288×640: alle ${NOBS} Erfassungen gefunden`, lost===0, lost+' fehlen');
chk('gerendert: jede einzelne Erfassung ±2° zur Wand', worstObs<=2, f3(worstObs)+'°');
chk('gerendert: alle Erfassungen gelten als sicher (z ≥ 15)', notGood===0, notGood+' unsicher');
chk('gerendert: Wandlinien ±1° (weisser Raum, Regal, Bild)', worstLine<=1, f3(worstLine)+'°');
chk('gerendert: Wandlinien ±3 cm an der Wandmitte', worstOff<=0.03, f3(worstOff)+' m');
chk('gerendert: Ecken als Linienschnitt ±5 cm', worstCorner<=0.05, f3(worstCorner)+' m');
chk('gerendert: keine Warnungen', warn.length===0, warn.join(' | '));
chk('gerendert: Fläche ±2 %', areaErr<=0.02, f3(areaErr*100)+' %');
{
  const ph=G.parallaxH(walls);
  chk('gerendert: Höhe aus Parallaxe ±5 cm (nur Vergleich)', ph.H!==null && Math.abs(ph.H-HT)<=0.05, f3(ph.H)+' '+(ph.reason||''));
  // Zweimal vom selben Fleck: keine Parallaxe, also kein Wert.
  const same=walls.map(o=>[o[0],o[0]]);
  const ps=G.parallaxH(same);
  chk('parallaxH: zweimal vom selben Fleck -> unbestimmt', ps.H===null && /unbestimmt/.test(ps.reason||''), ps.reason||f3(ps.H));
}
{
  // Reines Rauschen ohne jede Kante darf nichts liefern.
  const R=rng(77), g=new Float32Array(IW*IH);
  for(let i=0;i<g.length;i++) g[i]=200+(R()*2-1)*2;
  const L=G.captureEdge(g,IW,IH,PROJ,lookAt([1,1.5,1],[1,2.6,-1]),false);
  chk('reines Rauschen: keine Kante', L===null, L ? 'z '+f3(L.z) : '');
}
{
  // Verdeckung: Bildmitte direkt neben dem Regal - die Kante laeuft durch
  // die verdeckte Stelle hindurch.
  const cam=lookAt([3.9,1.5,1.9],[3.2,HT,0]);
  const ob=capture(cam, render(cam, 555));
  const e=ob ? obsErr(ob,0) : null;
  chk('gerendert: Kante hinter Regal hindurch ±1° / ±3 cm', !!e && e.ang<=1 && e.off<=0.03, e ? f3(e.ang)+'° '+f3(e.off)+' m' : 'nichts gefunden');
}
{
  // Schraeger Blick die lange Wand entlang: Endpunkte bleiben auf der Wand
  // (nicht ueber die Ecke hinaus), und die Erfassung wird nicht abgelehnt.
  const cam=lookAt([0.6,1.6,0.9],[2.6,HT,0]);
  const ob=capture(cam, render(cam, 556));
  const l=ob && G.liftObs(ob,HT);
  const inWall=l && l.every(p=>p[0]>=-0.05 && p[0]<=5.05 && Math.abs(p[1])<=0.05);
  chk('schräger Blick: Erfassung gehoben, Endpunkte auf der Wand', !!inWall, l ? l.map(p=>p.map(f3).join(',')).join(' → ') : 'abgelehnt');
}
{
  // Andersherum liegende Kameratextur, y-Spiegel an.
  const cam=viewsFor(2)[0];
  const ob=capture(cam, render(cam, 557, 2, true), true);
  const e=ob ? obsErr(ob,2) : null;
  chk('y-Spiegel: gespiegeltes Bild mit flipY ±1° / ±3 cm', !!e && e.ang<=1 && e.off<=0.03, e ? f3(e.ang)+'° '+f3(e.off)+' m' : 'nichts gefunden');
}
{
  // Telefon um 25° gerollt: Senkrechte und "oben" kommen aus der Pose.
  const [a,b]=[ROOM[4],ROOM[5]], n=inward(4), m=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  const cam=lookAtRoll([m[0]+1.6*n[0],1.5,m[1]+1.6*n[1]],[m[0],HT,m[1]],25);
  const ob=capture(cam, render(cam, 558));
  const e=ob ? obsErr(ob,4) : null;
  chk('gerollt 25°: ±1° / ±3 cm', !!e && e.ang<=1 && e.off<=0.03, e ? f3(e.ang)+'° '+f3(e.off)+' m' : 'nichts gefunden');
}
{
  // Gardinenschiene: heller Streifen 12-15 cm vor der Wand an der Decke. Im
  // Bild liegt er ueber der Kante; die 'oben'-Regel nahm ihn (Messaufbau
  // pruef6_k4: 29 von 33 falsch). Eine Linie verdraengt die Stufe nicht mehr.
  // Wand 190: 14 Stufen unter der Decke wie im Messaufbau (glatt), Schiene +20.
  const band={i:1, d0:0.12, d1:0.15, dv:20, wall:190};
  let ok=0, n=0, worst='';
  // Haltung des Nutzers: Kamera auf Kopfhoehe 1,82 m, 2,4-3 m vor der Wand,
  // dort liegt die Schiene im Bild nur wenige Pixel ueber der Kante.
  // Wand 1 hinter dem Bilderrahmen (s > 0,6), fern vom Regal.
  const [a,b]=[ROOM[1],ROOM[2]], nn=inward(1), cams=[];
  for(const [s,d,below] of [[0.7,2.4,0],[0.8,2.7,0.03],[0.75,3.0,0],[0.85,2.9,-0.03]]){ const m=[a[0]+s*(b[0]-a[0]), a[1]+s*(b[1]-a[1])];
    cams.push(lookAt([m[0]+d*nn[0],1.82,m[1]+d*nn[1]],[m[0],HT-below,m[1]])); }
  for(const [k,cam] of cams.entries()){ const ob=capture(cam, render(cam, 560+k, 2, false, band)); const e=ob ? obsErr(ob,1) : null; n++;
    if(e && e.ang<=1 && e.off<=0.03) ok++; else worst=e ? f3(e.ang)+'° '+f3(e.off)+' m' : 'nichts gefunden'; }
  chk('Gardinenschiene an der Decke: Deckenkante, nicht die Schiene', ok===n, ok+'/'+n+' '+worst);
}
{
  // Bilderrahmen 15 cm unter der Decke, 6 cm zu tief gezielt: die Decke gewinnt.
  const [a,b]=[ROOM[1],ROOM[2]], n=inward(1), s=0.35, m=[a[0]+s*(b[0]-a[0]), a[1]+s*(b[1]-a[1])];
  const cam=lookAt([m[0]+2.1*n[0],1.6,m[1]+2.1*n[1]],[m[0],HT-0.06,m[1]]);
  const ob=capture(cam, render(cam, 559));
  const e=ob ? obsErr(ob,1) : null;
  chk('Bilderrahmen darunter, 6 cm zu tief gezielt: Deckenkante', !!e && e.ang<=1 && e.off<=0.03, e ? f3(e.ang)+'° '+f3(e.off)+' m' : 'nichts gefunden');
}

// -------------------------------------------- Geometrie ohne Bild, exakt
// Die Kante wird direkt projiziert (nur das mittlere Stueck - die Ecken
// bleiben unsichtbar), dann mit Rauschen in Bild und Pose.
const obsDirect=(cam,i,s0,s1,pxNoise=0,R=null)=>{
  const [a,b]=[ROOM[i],ROOM[(i+1)%NW]];
  const P=s=>[a[0]+s*(b[0]-a[0]), HT, a[1]+s*(b[1]-a[1])];
  const A=G.project(PROJ,cam,P(s0)), B=G.project(PROJ,cam,P(s1));
  if(!A || !B) return null;
  const jit=q=>R ? [q[0]+(R()*2-1)*pxNoise*2/IW, q[1]+(R()*2-1)*pxNoise*2/IH] : q;
  const [A2,B2]=[jit(A),jit(B)];
  return {ra:G.ray(PROJ,cam,A2[0],A2[1]), rb:G.ray(PROJ,cam,B2[0],B2[1])};
};
const synthWalls=(pxNoise,poseNoise,seed)=>{
  const R=rng(seed);
  return ROOM.map((_,i)=>viewsFor(i).map(cam=>{
    if(!poseNoise) return obsDirect(cam,i,0.35,0.65);
    // Posefehler: Position ±poseNoise m, Gier ±0,2°. Die Beobachtung entsteht
    // mit der WAHREN Kamera, gehoben wird mit der gestoerten - wie am Telefon.
    const ob=obsDirect(cam,i,0.35,0.65,pxNoise,R); if(!ob) return null;
    const yaw=(R()*2-1)*0.2*Math.PI/180, cy=Math.cos(yaw), sy=Math.sin(yaw);
    const Ry=[cy,0,-sy,0, 0,1,0,0, sy,0,cy,0, 0,0,0,1];
    const T=[1,0,0,0, 0,1,0,0, 0,0,1,0, (R()*2-1)*poseNoise,(R()*2-1)*poseNoise,(R()*2-1)*poseNoise,1];
    const bad=G.m4mul(T,G.m4mul(Ry,cam));
    const inv=G.m4inv(cam);
    const back=r=>{ const dc=G.m4vec(inv,[r.d[0],r.d[1],r.d[2],0]); const d=G.m4vec(bad,dc); return {o:[bad[12],bad[13],bad[14]], d:[d[0],d[1],d[2]]}; };
    return {ra:back(ob.ra), rb:back(ob.rb)};
  }).filter(Boolean));
};
{
  const W0=synthWalls(0,0,1);
  const room=G.buildRoom(W0.map(o=>G.wallLine(o,HT)));
  const ce=room.corners ? Math.max(...room.corners.map((c,i)=>Math.hypot(c[0]-ROOM[i][0],c[1]-ROOM[i][1]))) : Infinity;
  chk('exakt: Ecken aus Kantenmitten (Ecken nie gesehen)', ce<1e-6, ce.toExponential(1));
  const ph=G.parallaxH(W0);
  chk('exakt: Höhe aus Parallaxe ±3 mm', ph.H!==null && Math.abs(ph.H-HT)<0.003, f3(ph.H));
  chk('exakt: Parallaxe-Abstandsspreizung gemeldet', ph.spread.every(s=>s>0.2), ph.spread.map(f3).join(','));

  const W1=synthWalls(1,0.01,2);
  const r1=G.buildRoom(W1.map(o=>G.wallLine(o,HT)));
  const c1=r1.corners ? Math.max(...r1.corners.map((c,i)=>Math.hypot(c[0]-ROOM[i][0],c[1]-ROOM[i][1]))) : Infinity;
  chk('Rauschen 1 px + 1 cm + 0,2°: Ecken ±15 cm', c1<=0.15, f3(c1)+' m');

  // Eine Wand doppelt so oft gesehen darf nicht anders zaehlen als ihre Lage.
  const one=G.wallLine([W0[0][0]],HT), two=G.wallLine([W0[0][0],W0[0][0]],HT);
  chk('wallLine: Duplikat aendert die Gerade nicht', Math.abs(one.c[0]-two.c[0])+Math.abs(one.u[1]-two.u[1])<1e-12);

  // Parallele Nachbarn ergeben keine Ecke, sondern eine Warnung.
  const par=G.buildRoom([{c:[0,0],u:[1,0]},{c:[0,1],u:[1,0]},{c:[0,0],u:[0,1]}]);
  chk('buildRoom: parallele Nachbarwaende -> Warnung, keine Ecken', par.corners===null && par.warnings.length>0);
  // Falsche Reihenfolge: Wandzug kreuzt sich.
  const lines=[0,2,1,3,4,5].map(i=>trueLine(i));
  const x=G.buildRoom(lines);
  chk('buildRoom: falsche Reihenfolge wird gemeldet', x.warnings.length>0, x.warnings.join(' | '));
  chk('parallaxH: ohne zweite Beobachtung kein Wert', G.parallaxH(W0.map(o=>[o[0]])).H===null);
}

// ------------------------------------------------ Schwenk: Waende von selbst
// Erfassungen ohne Wandnummer, in der Reihenfolge eines Rundgangs - die
// Zuordnung macht clusterSweep. Eine Erfassung = projizierte 3D-Strecke,
// mit Bild- und Posefehler wie oben.
const obsSeg=(cam,P0,P1,R,px=1,pose=0.01)=>{
  const jit=q=>[q[0]+(R()*2-1)*px*2/IW, q[1]+(R()*2-1)*px*2/IH];
  const A=G.project(PROJ,cam,P0), B=G.project(PROJ,cam,P1);
  if(!A || !B) return null;
  const A2=jit(A), B2=jit(B);
  const yaw=(R()*2-1)*0.2*Math.PI/180, cy=Math.cos(yaw), sy=Math.sin(yaw);
  const bad=G.m4mul([1,0,0,0, 0,1,0,0, 0,0,1,0, (R()*2-1)*pose,(R()*2-1)*pose,(R()*2-1)*pose,1],
                    G.m4mul([cy,0,-sy,0, 0,1,0,0, sy,0,cy,0, 0,0,0,1], cam));
  return {ra:G.ray(PROJ,bad,A2[0],A2[1]), rb:G.ray(PROJ,bad,B2[0],B2[1])};
};
// Rundgang ueber einen beliebigen Raum: je Wand k Erfassungen entlang der
// Kante, Kamera 1,3-2 m vor der Wand. skip: Waende, die niemand abfaehrt.
const sweepObs=(room,seed,{k=6, skip=[], back=2}={})=>{
  const R=rng(seed), n=room.length, out=[];
  const inR=(x,z)=>{ let c=false; for(let i=0,j=n-1;i<n;j=i++){ const [xi,zi]=room[i],[xj,zj]=room[j];
    if((zi>z)!==(zj>z) && x<(xj-xi)*(z-zi)/(zj-zi)+xi) c=!c; } return c; };
  const walk=(i,ss)=>{
    const [a,b]=[room[i],room[(i+1)%n]], L=Math.hypot(b[0]-a[0],b[1]-a[1]);
    let nn=[-(b[1]-a[1])/L,(b[0]-a[0])/L]; const m=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    if(!inR(m[0]+0.05*nn[0], m[1]+0.05*nn[1])) nn=[-nn[0],-nn[1]];
    for(const s of ss){
      const P=[a[0]+s*(b[0]-a[0]), a[1]+s*(b[1]-a[1])], d=1.3+0.7*R();
      const C=[P[0]+d*nn[0], 1.4+0.2*R(), P[1]+d*nn[1]];
      if(!inR(C[0],C[2])) continue;
      const half=Math.min(0.3, 0.45*L)/L;
      const ob=obsSeg(lookAt(C,[P[0],HT,P[1]]), [a[0]+(s-half)*(b[0]-a[0]),HT,a[1]+(s-half)*(b[1]-a[1])],
                      [a[0]+(s+half)*(b[0]-a[0]),HT,a[1]+(s+half)*(b[1]-a[1])], R);
      if(ob) out.push(ob);
    }
  };
  for(let i=0;i<n;i++){ if(skip.includes(i)) continue; walk(i, Array.from({length:k},(_,j)=>0.2+0.6*j/(k-1))); }
  if(back) walk(0, [0.3,0.5].slice(0,back));
  return out;
};
const cornerErr=(C,T)=>C ? Math.max(...T.map(t=>Math.min(...C.map(c=>Math.hypot(c[0]-t[0],c[1]-t[1]))))) : Infinity;
{
  // L-Raum, dazwischen ein Tuersturz/Bilderrahmen an Wand 1 (Oberkante
  // 2,45 m, wird hinter die Wand gehoben) und ein einzelner Fehlgriff.
  const R=rng(9), base=sweepObs(ROOM,11);
  const cam=lookAt([3.0,1.5,1.5],[5,2.45,1.5]);
  const lintel=[0.9,1.3,1.7].map(z=>obsSeg(cam,[5,2.45,z-0.2],[5,2.45,z+0.2],R)).filter(Boolean);
  const stray=obsSeg(lookAt([2,1.5,1.5],[1,2.6,2.2]),[0.6,2.6,1.9],[1.4,2.6,2.5],R);
  const at=12;    // mitten in Wand 1
  const obs=[...base.slice(0,at), ...lintel, stray, ...base.slice(at)];
  const cl=G.clusterSweep(obs,HT);
  const lintelIds=lintel.map((_,j)=>at+j);
  chk('Schwenk: 6 Wände ohne Wandnummern erkannt', cl.walls.length===6, cl.walls.length);
  chk('Schwenk: Rückkehr zur ersten Wand schließt den Raum', cl.closed);
  chk('Schwenk: Türsturz-Kanten hinter der Wand verworfen', lintelIds.every(i=>cl.rejected.some(r=>r.i===i && /hinter/.test(r.why))),
      cl.rejected.map(r=>r.i+':'+r.why).join(' '));
  chk('Schwenk: einzelner Fehlgriff bildet keine Wand', cl.rejected.some(r=>r.i===at+lintel.length));
  const ring=G.ringFromClusters(cl,obs,HT);
  chk('Schwenk: Ecken ±5 cm', cornerErr(ring.corners,ROOM)<=0.05, f3(cornerErr(ring.corners,ROOM))+' m');
  chk('Schwenk: keine Warnungen', ring.warnings.length===0, ring.warnings.join(' | '));
}
{
  // Nische: 30-cm-Versprung, den niemand abfaehrt. Er wird eingefuegt.
  const NICHE=[[0,0],[2,0],[2,0.3],[4,0.3],[4,3],[0,3]];
  const obs=sweepObs(NICHE,12,{skip:[1]});
  const cl=G.clusterSweep(obs,HT);
  const ring=G.ringFromClusters(cl,obs,HT);
  chk('Nische: 5 Wände gesehen, Versprung ergänzt', cl.walls.length===5 && ring.virtual.filter(Boolean).length===1, cl.walls.length+' / '+ring.virtual.join(','));
  // Die Rueckkehr an die erste Wand liegt parallel 30 cm hinter der
  // Nischen-Rueckwand - sie darf nicht als "hinter Wand" verworfen werden.
  chk('Nische: Rückkehr zur ersten Wand schließt, nichts verworfen', cl.closed && cl.rejected.length===0, cl.rejected.map(r=>r.i+':'+r.why).join(' '));
  chk('Nische: alle 6 Ecken ±8 cm', cornerErr(ring.corners,NICHE)<=0.08, f3(cornerErr(ring.corners,NICHE))+' m');
}
{
  // Ohne Rueckkehr: nicht geschlossen, aber trotzdem ein Wandzug.
  const obs=sweepObs(ROOM,13,{back:0});
  const cl=G.clusterSweep(obs,HT);
  chk('Schwenk ohne Rückkehr: nicht geschlossen', !cl.closed && cl.walls.length===6, cl.walls.length);
}
{
  // Gerenderter Schwenk: drei Bilder je Wand, zurueck zur ersten Wand, und
  // einmal auf den Bilderrahmen gezielt. Keine Wandnummern, nur Bilder.
  const obs=[];
  let f=0;
  const shoot=(cam)=>{ const ob=capture(cam, render(cam, 7000+f++)); if(ob && ob.good) obs.push(ob); };
  for(let i=0;i<NW;i++){
    const [a,b]=[ROOM[i],ROOM[(i+1)%NW]], n=inward(i), L=Math.hypot(b[0]-a[0],b[1]-a[1]);
    for(const s of [0.3,0.5,0.7]){
      const m=[a[0]+s*(b[0]-a[0]), a[1]+s*(b[1]-a[1])], d=Math.min(1.8, L<=2.5 ? 1.4 : 1.8);
      const C=[m[0]+d*n[0], 1.5, m[1]+d*n[1]];
      if(!inRoom(C[0],C[2])) continue;
      shoot(lookAt(C,[m[0],HT-0.02,m[1]]));
    }
    if(i===1) shoot(lookAt([3.0,1.6,1.0],[5,2.45,1.0]));   // Bilderrahmen
  }
  shoot(lookAt([1.5,1.5,1.6],[1.5,HT,0]));
  const cl=G.clusterSweep(obs,HT);
  const ring=G.ringFromClusters(cl,obs,HT);
  chk('gerenderter Schwenk: 6 Wände, geschlossen', cl.walls.length===6 && cl.closed, cl.walls.length+(cl.closed?' geschlossen':' offen'));
  chk('gerenderter Schwenk: Ecken ±5 cm', cornerErr(ring.corners,ROOM)<=0.05, f3(cornerErr(ring.corners,ROOM))+' m');
}

// ---------------------------------------- Schaetzer (solveSweep): Faelle
// Die Faelle, an denen die gierige Zuordnung scheiterte (Pruefung vom
// 2026-10-24), jetzt gegen den Schaetzer. Zeitstempel je Erfassung, wie in
// der App (Drift-Modell, Zeitfolge = Reihenfolge des Rundgangs).
const stamp=obs=>obs.map((ob,i)=>({...ob, t:0.3*i}));
// Start mitten in Wand 0: die erste Haelfte der ersten Wand kommt ans Ende.
const sweepFrom=(room,seed,o={})=>{
  const obs=sweepObs(room,seed,{...o, back:0}), n=Math.floor((o.k||6)/2);
  return stamp([...obs.slice(n), ...obs.slice(0,n+1)]);
};
const solveOK=(name,room,obs,opt={H:HT},tol=0.08)=>{
  const s=G.solveSweep(obs,opt);
  const e=cornerErr(s.corners,room), nOk=s.corners && s.corners.length===room.length;
  chk(`Schätzer ${name}: ${room.length} Ecken ±${Math.round(tol*100)} cm`+(opt.H ? '' : ' (H unbekannt)'), nOk && e<=tol,
      (s.corners ? s.corners.length : 0)+' Ecken, '+f3(e)+' m '+(s.warnings||[]).join(' | '));
  return s;
};
{
  const CHIM=[[0,0],[2,0],[2,0.4],[3,0.4],[3,0],[5,0],[5,4],[0,4]];
  const s=solveOK('Kaminvorsprung, Start auf der Teilwand', CHIM, sweepFrom(CHIM,21));
  chk('Schätzer Kaminvorsprung: geschlossen, Fläche ±3 %', s.closed && Math.abs(s.area-19.6)/19.6<=0.03, f3(s.area)+' m²');
  const T=[[0,0],[6,0],[6,2],[4,2],[4,5],[2,5],[2,2],[0,2]];
  solveOK('T-Raum', T, sweepFrom(T,22));
  const Uroom=[[0,0],[6,0],[6,5],[4,5],[4,2],[2,2],[2,5],[0,5]];
  solveOK('U-Raum', Uroom, sweepFrom(Uroom,23));
  solveOK('L-Raum, Höhe nur aus der Parallaxe', ROOM, sweepFrom(ROOM,24), {H0:2.55, Hsigma:0.35}, 0.15);
  const sH=G.solveSweep(sweepFrom(ROOM,24),{H0:2.55, Hsigma:0.35});
  chk('Schätzer: Raumhöhe aus der Parallaxe ±5 cm', Math.abs(sH.H-HT)<=0.05 && sH.sH<0.1, f3(sH.H)+' ± '+f3(sH.sH));
}
{
  // Eine Streuerfassung von Wand 0 mitten in Wand 2 darf nichts schliessen.
  const R=rng(31), RECT=[[0,0],[5,0],[5,4],[0,4]];
  const base=sweepObs(RECT,32,{back:0});
  const stray=obsSeg(lookAt([2.5,1.5,2],[2.5,HT,0]),[2.2,HT,0],[2.8,HT,0],R);
  const half=sweepObs(RECT,32,{back:0}).slice(0,15);
  const s=G.solveSweep(stamp([...half, stray]),{H:HT});
  chk('Schätzer: Streuerfassung der ersten Wand schließt nichts', !s.closed, s.closed ? 'geschlossen' : 'offen');
  const full=G.solveSweep(stamp([...base.slice(0,15), stray, ...base.slice(15), ...sweepObs(RECT,33,{back:2}).slice(-2)]),{H:HT});
  chk('Schätzer: …und der ganze Rundgang bleibt richtig', full.corners && full.corners.length===4 && cornerErr(full.corners,RECT)<=0.08,
      (full.corners ? full.corners.length : 0)+' Ecken '+f3(cornerErr(full.corners,RECT)));
  // Zurueckschwenken ueber zwei Waende und wieder vor: dieselben Waende.
  const RECT2=[[0,0],[5,0],[5,4],[0,4]], all=sweepObs(RECT2,34,{back:2});
  const back=[...all.slice(12,18)].reverse();
  const pb=G.solveSweep(stamp([...all.slice(0,18), ...back, ...all.slice(18)]),{H:HT});
  chk('Schätzer: Zurückschwenken erzeugt keine Wände', pb.corners && pb.corners.length===4 && cornerErr(pb.corners,RECT2)<=0.08,
      (pb.corners ? pb.corners.length : 0)+' Ecken '+f3(cornerErr(pb.corners,RECT2)));
}
{
  // Tuersturz (2,05 m) zweimal gleich am Anfang: keine Phantomwand dahinter.
  const R=rng(41), RECT=[[0,0],[5,0],[5,4],[0,4]];
  const cam=lookAt([2.5,1.5,1.6],[2.5,2.05,0]);
  const door=[0,1].map(j=>obsSeg(cam,[2.1+0.2*j,2.05,0],[2.6+0.2*j,2.05,0],R)).filter(Boolean);
  const obs=stamp([...door, ...sweepObs(RECT,42,{back:2})]);
  const s=G.solveSweep(obs,{H:HT});
  chk('Schätzer: Türsturz am Anfang wird keine Wand', s.corners && s.corners.length===4 && cornerErr(s.corners,RECT)<=0.08,
      (s.corners ? s.corners.length : 0)+' Ecken '+f3(cornerErr(s.corners,RECT))+' '+(s.warnings||[]).join(' | '));
}

// ------------------------- Schaetzer: Faelle aus der Pruefung (Regression)
{
  // Vorzeichen der Parallaxe-Hoehe: eine Kante 2,2 m hoch, bei 2,5 m gehoben,
  // abwechselnd aus 1,2 und 2,8 m gesehen, liegt TIEFER als H. (Waechst der
  // Abstand gleichmaessig entlang der Wand, sieht die gehobene Kante nur
  // schraeg aus - dann ist dH nicht von einer schraegen Wand zu trennen.)
  const R=rng(51), obs=[];
  for(let k=0;k<8;k++){ const d=1.2+1.6*(k%2), x=0.5+0.5*k;
    const ob=obsSeg(lookAt([x,1.5,d],[x,2.2,0]),[x-0.3,2.2,0],[x+0.3,2.2,0],R,0,0); if(ob) obs.push(ob); }
  const P=G._sweep.prepSweep(stamp(obs),2.5,null,{}), h=G._sweep.groupHeight(obs,P,P.map((_,i)=>i),2.5);
  chk('Schätzer: Parallaxe-Höhe einer tieferen Kante liegt unter H', h.determined && h.h<2.5 && Math.abs(h.h-2.2)<0.05, f3(h.h)+(h.determined ? ' bestimmt' : ' unbestimmt'));
}
{
  // Wand 3 nie erfasst, dann zurueck in Wand 1: gegenueberliegende Waende,
  // kein Versprung - offen, mit Hinweis.
  const RECT=[[0,0],[5,0],[5,4],[0,4]], R=rng(60);
  const ret=[0,1,2].map(j=>obsSeg(lookAt([1+0.4*j,1.5,1.6],[1+0.4*j,HT,0]),[0.8+0.4*j,HT,0],[1.3+0.4*j,HT,0],R));
  const s=G.solveSweep(stamp([...sweepObs(RECT,61,{skip:[2], back:0}), ...ret]),{H:HT});
  chk('Schätzer: fehlende Wand schließt nicht', !s.closed && s.returned && (s.warnings||[]).some(w=>/fehlt/.test(w)),
      (s.closed ? 'geschlossen' : 'offen')+' '+(s.warnings||[]).join(' | '));
}
{
  // Rueckkehr erst ab drei Erfassungen in Wand 1 - eine einzelne, die die
  // Drift-Toleranz spaet in Wand 1 schiebt, schliesst nichts.
  const RECT=[[0,0],[5,0],[5,4],[0,4]], all=sweepObs(RECT,62,{back:0}), R=rng(63);
  const ret=j=>obsSeg(lookAt([1+0.4*j,1.5,1.6],[1+0.4*j,HT,0]),[0.8+0.4*j,HT,0],[1.3+0.4*j,HT,0],R);
  const two=G.solveSweep(stamp([...all, ret(0), ret(1)]),{H:HT}), four=G.solveSweep(stamp([...all, ret(0), ret(1), ret(2), ret(3)]),{H:HT});
  chk('Schätzer: zwei Erfassungen zurück in Wand 1 schließen noch nicht, vier schon', !two.closed && four.closed,
      `${two.closed ? 'geschlossen' : 'offen'} / ${four.closed ? 'geschlossen' : 'offen'}`);
}
{
  // Flacher Knick (8°): eine Ecke, kein erfundener Mini-Versprung.
  const BEND=[[0,0],[3,0],[6,0.42],[6,4],[0,4]];
  const s=G.solveSweep(stamp(sweepObs(BEND,64,{k:8, back:2})),{H:HT});
  chk('Schätzer: flacher Knick 8° wird eine Ecke', s.corners && s.corners.length===5 && cornerErr(s.corners,BEND)<=0.12 && !s.virtual.some(Boolean),
      (s.corners ? s.corners.length : 0)+' Ecken '+f3(cornerErr(s.corners,BEND))+' '+(s.warnings||[]).join(' | '));
}
{
  // PELT mit Mindestlaenge 2 und kleinem beta (kurze Schwenks) liefert
  // dasselbe Optimum wie die ungestutzte Rekursion.
  let worst=0;
  for(let seed=0;seed<40;seed++){
    const all=sweepObs([[0,0],[5,0],[5,4],[0,4]],70+seed,{k:3, back:0}), R=rng(seed);
    const m=4+Math.floor(R()*9), P=G._sweep.prepSweep(stamp(all.slice(0,m)),HT,null,{});
    const beta=3*Math.log(2*P.length), kap=G._sweep.SW.kappa, dp=G._sweep.segmentDP(P,1,beta,{});
    const obj=dp.segs.reduce((s,g)=>s+dp.cost(g.a,g.b)+beta,0)+dp.out.length*kap;
    const F=[0]; for(let b=1;b<=P.length;b++){ F[b]=F[b-1]+kap; for(let a=0;a+2<=b;a++) F[b]=Math.min(F[b], F[a]+dp.cost(a,b-1)+beta); }
    worst=Math.max(worst, obj-F[P.length]);
  }
  chk('Schätzer: PELT exakt auch bei kurzen Schwenks', worst<1e-9, worst.toExponential(1));
}
{
  // Kurze Zwischenstaende ohne Laser: keine Ausnahme, nie H unter Kamera.
  const obs=sweepFrom([[0,0],[4,0],[4,2],[2.5,2],[2.5,4],[0,4]],65);
  let bad=null;
  for(let m=3;m<=obs.length;m++){ try{ const s=G.solveSweep(obs.slice(0,m),{H0:2.55, Hsigma:0.35});
      if(s.corners && s.H<1.6+0.3-1e-6) bad=`m=${m}: H ${f3(s.H)}`; }catch(e){ bad=`m=${m}: ${e.message}`; break; } }
  chk('Schätzer: alle Zwischenstände ohne Laser laufen, H über Kamera + 0,3 m', !bad, bad||'ok');
}
{
  // Drehen auf der Stelle ohne Laser (keine Basislinie): H ist nicht aus
  // der Parallaxe zu holen. Frueher kippte H auf Augenhoehe (Flaeche 2 statt
  // 20 m², geschlossen). Jetzt: Vorwissen traegt, Unsicherheit ehrlich.
  const RECT=[[0,0],[5,0],[5,4],[0,4]], R=rng(66), obs=[];
  for(const [i,ss] of [[0,[0.2,0.35,0.5,0.65,0.8]],[1,[0.2,0.4,0.6,0.8]],[2,[0.2,0.35,0.5,0.65,0.8]],[3,[0.2,0.4,0.6,0.8]],[0,[0.2,0.35,0.5]]])
    for(const sv of ss){ const a=RECT[i], b=RECT[(i+1)%4], P=[a[0]+sv*(b[0]-a[0]), a[1]+sv*(b[1]-a[1])], L=Math.hypot(b[0]-a[0],b[1]-a[1]), u=[(b[0]-a[0])/L,(b[1]-a[1])/L];
      const C=[2.5+(R()*2-1)*0.01, 1.5, 2+(R()*2-1)*0.01];
      const ob=obsSeg(lookAt(C,[P[0],2.4,P[1]]),[P[0]-0.3*u[0],2.4,P[1]-0.3*u[1]],[P[0]+0.3*u[0],2.4,P[1]+0.3*u[1]],R,1,0.005); if(ob) obs.push(ob); }
  const s=G.solveSweep(stamp(obs),{H0:2.55, Hsigma:0.35});
  chk('Schätzer: Drehen auf der Stelle ohne Laser – H kippt nicht', s.H>2.2 && Math.abs(s.H-2.4)<=3*s.sH && s.area>15,
      `H ${f3(s.H)} ± ${f3(s.sH)}, Fläche ${s.area ? s.area.toFixed(1) : '–'} m²`);
  // Aus der Hand: das Telefon kreist beim Drehen 15 cm um den Koerper. Mit
  // eingefrorenen Gewichten kippte H hier um 0,5-0,7 m (Flaeche 3-6 m²).
  const arm=[];
  for(const [i,ss] of [[0,[0.2,0.35,0.5,0.65,0.8]],[1,[0.2,0.4,0.6,0.8]],[2,[0.2,0.35,0.5,0.65,0.8]],[3,[0.2,0.4,0.6,0.8]],[0,[0.2,0.35,0.5]]])
    for(const sv of ss){ const a=RECT[i], b=RECT[(i+1)%4], P=[a[0]+sv*(b[0]-a[0]), a[1]+sv*(b[1]-a[1])], L=Math.hypot(b[0]-a[0],b[1]-a[1]), u=[(b[0]-a[0])/L,(b[1]-a[1])/L];
      const d=[P[0]-2.5, P[1]-2], n=Math.hypot(d[0],d[1]), C=[2.5+0.15*d[0]/n, 1.5, 2+0.15*d[1]/n];
      const ob=obsSeg(lookAt(C,[P[0],2.6,P[1]]),[P[0]-0.3*u[0],2.6,P[1]-0.3*u[1]],[P[0]+0.3*u[0],2.6,P[1]+0.3*u[1]],R,1.5,0.003); if(ob) arm.push(ob); }
  const sa=G.solveSweep(stamp(arm),{H0:2.55, Hsigma:0.35});
  chk('Schätzer: aus der Hand gedreht ohne Laser – H kippt nicht, σ deckt den Fehler', Math.abs(sa.H-2.6)<=Math.max(0.1,3*sa.sH) && sa.H>2.2 && sa.area>12,
      `H ${f3(sa.H)} ± ${f3(sa.sH)}, Fläche ${sa.area ? sa.area.toFixed(1) : '–'} m²`);
}

// ------------------------------------ Modell im Live-Bild
if(G.modelToLive){
  // Rueckweg: modelToLive kehrt genau den Hinweg der Auswertung um (prepSweep: heben, Drift anbringen)
  // - mit kuenstlicher Drift (bis 0,36 m und 2° am Ende; geschaetzt wird davon, was der Rundgang zeigt, die
  // Umkehrung muss fuer jede geschaetzte Drift exakt sein) und einem Rahmen nach Ankersprung (-92°, 3,5 m).
  const RECT=[[0,0],[5,0],[5,4],[0,4]], base=stamp(sweepObs(RECT,41,{back:2})), T1=base[base.length-1].t;
  const rotYp=(a,x,z)=>[Math.cos(a)*x+Math.sin(a)*z, -Math.sin(a)*x+Math.cos(a)*z];
  const drift=ob=>{ const f=ob.t/T1, ps=2*Math.PI/180*f, tx=0.3*f, tz=-0.2*f, mv=r=>{ const o=rotYp(ps,r.o[0],r.o[2]), d=rotYp(ps,r.d[0],r.d[2]);
    return {o:[o[0]+tx, r.o[1], o[1]+tz], d:[d[0], r.d[1], d[1]]}; }; return {...ob, ra:mv(ob.ra), rb:mv(ob.rb)}; };
  const obs=base.map(drift), s=G.solveSweep(obs,{H:HT}), P=G._sweep.prepSweep(obs,s.H,s.drift,{});
  let e0=0; for(const p of P){ const m=G.modelToLive(s,p.t,0); for(const [x,r] of [[p.a,p.raw[0]],[p.b,p.raw[1]]]){ const y=m(x); e0=Math.max(e0,Math.hypot(y[0]-r[0],y[1]-r[1])); } }
  const X={psi:-1.6, t:[2.1,-2.8]}, sx={...s, frameXf:{n:1, ref:0, xf:[{psi:0,t:[0,0]}, X]}};
  let e1=0; for(const p of P){ const m=G.modelToLive(sx,p.t,1), q=rotYp(-X.psi,p.raw[0][0]-X.t[0],p.raw[0][1]-X.t[1]);  // Rohpunkt im Rahmen 1
    const w=rotYp(X.psi,q[0],q[1]), y=m(p.a); e1=Math.max(e1, Math.hypot(y[0]-q[0], y[1]-q[1]), Math.hypot(w[0]+X.t[0]-p.raw[0][0], w[1]+X.t[1]-p.raw[0][1])); }
  const dk=s.drift.knots[s.drift.knots.length-1];
  chk('Overlay: Modell -> Kamerarahmen kehrt Drift und Rahmen genau um', e0<1e-9 && e1<1e-9 && Math.hypot(dk[0],dk[1])>0.01,
      `${e0.toExponential(1)} / ${e1.toExponential(1)} m, Drift ${f3(Math.hypot(dk[0],dk[1]))} m`);
  chk('Overlay: ohne Anschluss des jetzigen Rahmens kein Modell', G.modelToLive(s,T1,1)===null && G.modelToLive({...sx, frameXf:{n:1, ref:0, xf:[{psi:0,t:[0,0]}, null]}},T1,1)===null
      && G.modelToLive(sx,T1,2)===null);
  // seen: auf der Wandgeraden, umfasst alle zugeordneten Endpunkte
  let es=0; s.walls.forEach(w=>{ const l=w.line; for(const p of w.seen) es=Math.max(es, Math.abs(-l.u[1]*(p[0]-l.c[0])+l.u[0]*(p[1]-l.c[1]))); });
  chk('Overlay: gesehene Ausdehnung liegt auf der Wandgeraden', es<1e-9 && s.walls.every(w=>w.seen), es.toExponential(1));
}
if(G.overlayModel){
  // Reine Geometrie: Rechteck 4 x 3, Wand 0 erst ab x = 1,2 gesehen, Wand 2 ganz.
  const C=[[0,0],[4,0],[4,3],[0,3]], lines=C.map((c,i)=>{ const d=C[(i+1)%4], L=Math.hypot(d[0]-c[0],d[1]-c[1]); return {c, u:[(d[0]-c[0])/L,(d[1]-c[1])/L], sRho:0.01*(i+1)}; });
  const walls=lines.map((l,i)=>({line:l, seen:i===0 ? [[1.2,0],[3.9,0]] : [C[i], C[(i+1)%4]]}));
  const closed=G.overlayModel({corners:C, lines, virtual:[false,false,false,false], walls, returned:true});
  const g=closed.rows[0].gaps;
  chk('Overlay: Lücke zur Ecke gemessen, je Ecke eine Senkrechte', closed.rows.length===4 && closed.verts.length===4 && g.length===2
      && Math.abs(g[0][2]-1.2)<1e-12 && Math.abs(g[1][2]-0.1)<1e-12 && closed.rows[1].gaps.length===0, g.map(x=>x[2].toFixed(2)).join(' / '));
  // Offen (nicht zurueckgekehrt), Wand 3 durch eine ergaenzte Zeile ersetzt: corners[0] ist nur ein Schnitt.
  const open=G.overlayModel({corners:C, lines, virtual:[false,false,false,true], walls:walls.slice(0,3), returned:false});
  chk('Overlay: offener Ring – keine Senkrechte an Ecke 0 und hinter der letzten Wand, Wand 1 beginnt am Gesehenen',
      open.rows.length===3 && open.verts.map(v=>v.row).join()==='1,2' && open.rows[0].span[0][0]===1.2 && open.rows[0].gaps.length===1,
      open.verts.map(v=>v.row).join());
  // Ergaenzte Zeile MITTEN im Ring (Versprung zwischen Wand 1 und 2): Wand k -> Zeile wie rowOf in computeResult.
  const N=[[0,0],[2,0],[2,0.4],[4,0.4],[4,3],[0,3]], nl=N.map((c,i)=>{ const d=N[(i+1)%6], L=Math.hypot(d[0]-c[0],d[1]-c[1]); return {c, u:[(d[0]-c[0])/L,(d[1]-c[1])/L]}; });
  const vv=[false,true,false,false,false,false], nw=[0,2,3,4,5].map((j,k)=>({line:{...nl[j], sRho:0.01*(k+1)}, seen:[N[j], N[(j+1)%6]]}));
  const mid=G.overlayModel({corners:N, lines:nl, virtual:vv, walls:nw, returned:true});
  chk('Overlay: ergänzte Zeile mitten im Ring – Wand k auf ihrer Zeile, Senkrechte daneben ergänzt',
      mid.rows.map(r=>r.k).join()==='0,-1,1,2,3,4' && mid.rows.every(r=>r.virtual || r.sRho===nw[r.k].line.sRho)
      && mid.rows[2].span[0]===N[2] && mid.verts.filter(v=>v.virtual).map(v=>v.row).join()==='1,2', mid.rows.map(r=>r.k).join());
  const c2=G.clipNdc([-2,0.5],[2,0.5]);
  chk('Overlay: Kappen aufs Bild (Liang-Barsky)', c2[0][0]===-1 && c2[1][0]===1 && G.clipNdc([1.5,0],[2,1])===null && G.clipNdc([0,0],[0.5,0.2])[1][1]===0.2);
}

// Schaetzer: Waende in beliebiger Reihenfolge (Protokoll 3: Nutzer geht durch
// den Raum). Der Zeitring kreuzt sich; der Ring aus den Wandenden nicht.
{
  const per=ROOM.map((_,i)=>sweepObs(ROOM,81+i,{skip:ROOM.map((_,k)=>k).filter(k=>k!==i), back:0}));
  const ord=[3,0,4,1,5,2], shuffled=stamp(ord.flatMap(i=>per[i]));
  const s=G.solveSweep(shuffled,{H:HT}), e=cornerErr(s.corners,ROOM);
  chk('Schätzer: Wände in beliebiger Reihenfolge – Ring aus den Wandenden, 6 Ecken ±8 cm', s.corners && s.corners.length===6 && e<=0.08 && !(s.warnings||[]).some(w=>/kreuzt/.test(w)),
      (s.corners ? s.corners.length : 0)+' Ecken '+f3(e)+' m '+(s.warnings||[]).join(' | '));
  const s0=G.solveSweep(shuffled,{H:HT, ringByEnds:false});
  chk('Schätzer: …ohne Ring aus den Wandenden kreuzt der Zeitring (Gegenprobe)', !s0.corners || (s0.warnings||[]).some(w=>/kreuzt/.test(w)) || cornerErr(s0.corners,ROOM)>0.4,
      (s0.corners ? s0.corners.length : 0)+' Ecken '+(s0.warnings||[]).join(' | '));
  // Live-Overlay mit diesem Ring: Wand k auf ihrer Zeile (wie rowOf in computeResult). Der Ring
  // aus den Wandenden ist geschlossen gewaehlt - alle Zeilen, eine Senkrechte je Ecke, obwohl
  // der Nutzer nicht zur ersten Wand zurueckkam. senk.first = erste Wand der Zeitfolge.
  if(G.overlayModel){
    const M=s.corners ? G.overlayModel(s) : {rows:[], verts:[]}, off=(l,p)=>Math.abs(-l.u[1]*(p[0]-l.c[0])+l.u[0]*(p[1]-l.c[1]));
    const onRow=!!s.corners && M.rows.length===s.lines.length && M.rows.every(r=>r.virtual ? r.k===-1 : (!!s.walls[r.k] && s.walls[r.k].line===s.lines[r.row]
      && r.sRho===s.walls[r.k].line.sRho && [...r.span, ...(r.seen||[])].every(p=>off(s.lines[r.row],p)<1e-9)));
    const t0=Math.min(...s0.walls[0].obs), sk=s.senk||{};
    chk('Overlay: Ring aus den Wandenden – Wand k auf ihrer Zeile, je Ecke eine Senkrechte, erste Wand der Zeitfolge an senk.first',
      !!sk.byEnds && onRow && M.verts.length===(s.corners||[]).length && sk.first>=0 && s.walls[sk.first].obs.includes(t0),
      `${M.rows.length} Zeilen, ${M.verts.length} Senkrechte, returned ${s.returned}, first ${sk.first}`);
  }
}
// ringOrder nimmt nur einfache Ringe, die einmal herumlaufen (Aufnahme 6: eine billigere
// Folge lief zweimal herum und kreuzte sich). Rechteck 4x4 m, dazu vier parallele Gruppen
// 0,3 m innen ueber die ganze Laenge (Regale): zweimal herum kostet weniger als sie auszulassen.
{
  const SW=G._sweep, P=[], walls=[], lines=[], cam=[2,2], d=0.3;
  const wall=(a,b)=>{ const ids=[]; for(let i=0;i<6;i++){ const t0=i/6, t1=(i+1)/6;
      P.push({a:[a[0]+(b[0]-a[0])*t0, a[1]+(b[1]-a[1])*t0], b:[a[0]+(b[0]-a[0])*t1, a[1]+(b[1]-a[1])*t1], cam}); ids.push(P.length-1); }
    const L=Math.hypot(b[0]-a[0],b[1]-a[1]); walls.push({ids}); lines.push({c:[(a[0]+b[0])/2,(a[1]+b[1])/2], u:[(b[0]-a[0])/L,(b[1]-a[1])/L]}); };
  wall([0,4],[4,4]); wall([4,4],[4,0]); wall([4,0],[0,0]); wall([0,0],[0,4]);
  wall([d,4-d],[4-d,4-d]); wall([4-d,4-d],[4-d,d]); wall([4-d,d],[d,d]); wall([d,d],[d,4-d]);
  const ring=rv=>{ const ro=SW.ringOrder(P,walls,lines,{...SW.SW, ringValid:rv}), r=ro && SW.ringOf(P,ro.order.map(k=>walls[k]),ro.order.map(k=>lines[k]),SW.SW); return {ro, r}; };
  const a=ring(true), b=ring(false);
  chk('ringOrder: nur einfache Ringe – Rechteck statt Doppelschleife (vier innere Gruppen ausgelassen)',
    !!a.ro && a.ro.order.length===4 && a.ro.order.every(k=>k<4) && !!a.r.corners && a.r.corners.length===4 && !a.r.warnings.some(w=>/kreuzt|fehlt/.test(w)),
    a.ro ? a.ro.order.join(',')+' Kosten '+f3(a.ro.cost) : 'kein Ring');
  chk('ringOrder: …ohne Prüfung (ringValid:false) gewinnt die Doppelschleife (Gegenprobe)',
    !!b.ro && b.ro.order.length===8 && !!b.r && b.r.warnings.some(w=>/kreuzt/.test(w)),
    b.ro ? b.ro.order.join(',')+' Kosten '+f3(b.ro.cost) : 'kein Ring');
}

// ------------------------- Stufe 2: Modellkanten im Bild verfolgen (nur Anzeige)
// G.trackModelEdges sucht jede Modellwand im Bild, G.trackJudge urteilt wie die App.
// Modell = wahre Waende (Ecke zu Ecke), wahlweise um dRho in den Raum (+) verschoben.
if(G.trackModelEdges){
  const modelTrue=(dRho=0, sRho=0.03)=>({H:HT, walls:ROOM.map((a,i)=>{ const b=ROOM[(i+1)%NW], n=inward(i);
    return {k:i, key:[i], A:[a[0]+dRho*n[0], a[1]+dRho*n[1]], B:[b[0]+dRho*n[0], b[1]+dRho*n[1]], nIn:n, sRho, sTheta:0.5*Math.PI/180}; })});
  // Gemessene Kante gegen die wahre Wand i (auf HT gehoben): Winkel und Abstand der Wandmitte.
  const measErr=(cam,w,i)=>{ const ob=w && w.A ? G.obsFromNdc(PROJ,cam,w.A,w.B,HT,12) : null; return ob ? obsErr(ob,i) : {ang:Infinity, off:Infinity}; };
  const fine=e=>e.ang<=1 && e.off<=0.03;
  const tally=a=>{ const t={}; a.forEach(x=>t[x]=(t[x]||0)+1); return Object.entries(t).map(([k,v])=>k+' '+v).join(', '); };
  // Je Wand die zwei Blicke des Rundgangs oben (4 cm unter die Kante gezielt der zweite).
  const views=[]; for(let i=0;i<NW;i++) viewsFor(i).forEach((cam,j)=>views.push({i, cam, seed:9100+10*i+j}));
  const run=(walls, model, strip, seed0, want)=>{ const J=[]; let wrong=0, n=0;
    for(const v of views){ if(!walls.includes(v.i)) continue; n++;
      const g=render(v.cam, seed0+v.seed, 2, false, null, strip), r=G.trackModelEdges(g,IW,IH,PROJ,v.cam,typeof model==='function' ? model(v) : model);
      const w=r.walls.find(x=>x.k===v.i), j=G.trackJudge(w); J.push(j);
      // Eine gemeldete Kante (passt / weicht ab) muss die Deckenkante sein - nie Leiste oder Fuge.
      if((j==='passt' || j==='abweichend') && !fine(measErr(v.cam,w,v.i))) wrong++; }
    return {n, J, hit:J.filter(j=>j===want).length, wrong}; };
  const ALL=[0,1,2,3,4,5], FREE=[2,3,4,5];   // FREE: ohne Regal (Wand 0) und Bild (Wand 1)

  // 1. Richtiges Modell: die Wand im Blick passt, keine Wand im Bild weicht ab.
  { const a=run(ALL, modelTrue(), null, 0, 'passt');
    let off=0; for(const v of views){ const r=G.trackModelEdges(render(v.cam, v.seed),IW,IH,PROJ,v.cam,modelTrue());
      for(const w of r.walls) if(G.trackJudge(w)==='abweichend') off++; }
    chk(`Verfolgung, richtiges Modell: Wand im Blick „passt“ (${a.n} Bilder)`, a.hit>=a.n-1 && a.wrong===0, tally(a.J)+(a.wrong ? ', '+a.wrong+' falsche Kante' : ''));
    chk('Verfolgung, richtiges Modell: keine Wand im Bild „weicht ab“', off===0, off+' abweichend'); }
  // 2. Modell 10 cm daneben (in den Raum und hinter die Wand), Unsicherheit 3 cm: weicht ab,
  //    und die gemessene Kante ist die wahre. Das Gatter allein liesse das als 'ok' durch.
  { const res=[0.10,-0.10].map(d=>run(FREE, modelTrue(d,0.03), null, 200, 'abweichend'));
    chk('Verfolgung, Modell 10 cm daneben: „weicht ab“, gemessen die wahre Kante ±1° / ±3 cm',
      res.every(a=>a.hit>=a.n-1 && a.wrong===0), res.map((a,k)=>(k ? 'hinter: ' : 'davor: ')+tally(a.J)+(a.wrong ? ', '+a.wrong+' falsch' : '')).join(' | ')); }
  // 3. Leiste 10 cm unter der Decke (3 cm hoch, deutlich dunkler). Unsicheres Modell
  //    (5 cm), damit sie im Suchstreifen liegt.
  { const L={drop:0.10, h:0.03, val:160};
    const a=run(FREE, modelTrue(0,0.05), L, 400, 'passt');
    chk('Verfolgung, Leiste darunter: Deckenkante „passt“, nie die Leiste', a.hit>=a.n-1 && a.wrong===0, tally(a.J)+(a.wrong ? ', '+a.wrong+' falsch' : ''));
    // Modell genau auf der gehobenen Leiste (als haette das Fadenkreuz sie erfasst):
    // nie „passt“; gemeldet wird hoechstens die Deckenkante darueber.
    const onLeiste=v=>{ const n=inward(v.i), [a0,b0]=[ROOM[v.i],ROOM[(v.i+1)%NW]], L0=Math.hypot(b0[0]-a0[0],b0[1]-a0[1]);
      const d=Math.abs((v.cam[12]-a0[0])*(b0[1]-a0[1])-(v.cam[14]-a0[1])*(b0[0]-a0[0]))/L0, D=HT-v.cam[13], back=d*(L.drop)/(D-L.drop);
      return modelTrue(-back,0.05); };
    const b=run(FREE, onLeiste, L, 500, 'passt');
    chk('Verfolgung, Modell auf der Leiste: nie „passt“, gemeldet höchstens die Deckenkante', b.hit===0 && b.wrong===0, tally(b.J)+(b.wrong ? ', '+b.wrong+' falsch' : ''));
    // Decke so hell wie die Wand: die Deckenkante ist nicht zu sehen, nur die Leiste.
    const c=run(FREE, modelTrue(0,0.05), {...L, ceil:200, wall:200}, 600, 'leiste');
    chk('Verfolgung, Deckenkante unsichtbar, Leiste darunter: als Leiste erkannt, nichts gemeldet', c.hit>=c.n-1 && c.wrong===0, tally(c.J)+(c.wrong ? ', '+c.wrong+' falsch' : '')); }
  // 4. Schattenfuge: 1,5 cm dunkle Fuge direkt unter der Decke. Ihre Unterkante liegt
  //    keine 2 cm unter der Deckenkante - keine Leiste, die Deckenkante gilt. Wand
  //    dunkler als die Decke: die Oberkante ist eine Stufe. (Mit der Leistenregel des
  //    Prototyps - Gegenkante ab 1,5 px - fallen hier die fernen Blicke als Leiste aus.)
  { const a=run(ALL, modelTrue(0,0.03), {drop:0, h:0.015, val:150, ceil:220, wall:185}, 700, 'passt');
    chk('Verfolgung, Schattenfuge: Deckenkante „passt“, nie als Leiste verworfen', a.hit>=a.n-1 && a.wrong===0 && !a.J.includes('leiste'), tally(a.J)+(a.wrong ? ', '+a.wrong+' falsch' : ''));
    // Decke und Wand gleich hell: die Fuge ist ein Linienprofil, keine Stufe - nichts zu
    // messen. Darunter das Bild an Wand 1 darf dann nicht als „weicht ab“ gelten.
    const b=run(ALL, modelTrue(0,0.03), {drop:0, h:0.015, dv:-45}, 800, 'passt');
    chk('Verfolgung, Schattenfuge, Decke und Wand gleich hell: keine Leiste, keine falsche Kante', b.wrong===0 && !b.J.includes('leiste') && !b.J.includes('abweichend'),
      tally(b.J)+(b.wrong ? ', '+b.wrong+' falsch' : '')); }
  // 5. Weicher Eckschatten an Decke und Wand (10 cm), Bild geschaerft wie in der
  //    Kamera-Pipeline: die Rampe ueber der Kante (Stufenmass ~2) ist keine Kante.
  //    (Ohne die Grenze Stufenmass <= 1,7 nimmt die Verfolgung aus 2,1 m die Rampe,
  //    6-8 cm daneben, oder wirft die Kante als Leiste weg.)
  { const a=run(ALL, modelTrue(0,0.05), {drop:0, h:0, dv:0, ao:{h:0.10, dvWall:-14, dvCeil:-10}, sharpen:1, ceil:212, wall:198}, 900, 'passt');
    chk('Verfolgung, weicher Eckschatten, geschärft: Deckenkante „passt“, nicht die Rampe', a.hit>=a.n-1 && a.wrong===0 && !a.J.includes('leiste'), tally(a.J)+(a.wrong ? ', '+a.wrong+' falsch' : '')); }
  // 6. Rahmen: Verfolgungsmodell aus der Auswertung mit Drift (G.modelToLive, G.overlayModel,
  //    G.trackModel). Die Vorhersage muss auf der Wandgeraden der Auswertung liegen, in den
  //    Kamerarahmen abgebildet - und nicht auf der unabgebildeten. nIn zeigt in den Raum.
  if(G.trackModel){
    const RECT=[[0,0],[5,0],[5,4],[0,4]], base=stamp(sweepObs(RECT,41,{back:2})), T1=base[base.length-1].t;
    const rotYp=(a,x,z)=>[Math.cos(a)*x+Math.sin(a)*z, -Math.sin(a)*x+Math.cos(a)*z];
    const drift=ob=>{ const f=ob.t/T1, ps=2*Math.PI/180*f, tx=0.3*f, tz=-0.2*f, mv=r=>{ const o=rotYp(ps,r.o[0],r.o[2]), d=rotYp(ps,r.d[0],r.d[2]);
      return {o:[o[0]+tx, r.o[1], o[1]+tz], d:[d[0], r.d[1], d[1]]}; }; return {...ob, ra:mv(ob.ra), rb:mv(ob.rb)}; };
    const s=G.solveSweep(base.map(drift),{H:HT}), map=G.modelToLive(s,T1,0), M=G.overlayModel(s,map);
    const cen=M.rows.reduce((q,r)=>[q[0]+r.span[0][0]/M.rows.length, q[1]+r.span[0][1]/M.rows.length],[0,0]);
    const model=G.trackModel(s,M,cen), flat=new Float32Array(IW*IH).fill(200);
    const lineDist=(cam,P,Q,pts)=>{ const sg=G.projectSegment(PROJ,cam,[P[0],s.H,P[1]],[Q[0],s.H,Q[1]]); if(!sg) return Infinity;
      const a=G.ndcToPix(sg[0][0],sg[0][1],IW,IH,false), b=G.ndcToPix(sg[1][0],sg[1][1],IW,IH,false), d=[b[0]-a[0],b[1]-a[1]], L=Math.hypot(d[0],d[1]);
      return Math.max(...pts.map(p=>{ const q=G.ndcToPix(p[0],p[1],IW,IH,false); return Math.abs((q[0]-a[0])*d[1]-(q[1]-a[1])*d[0])/L; })); };
    let worst=0, raw=0, nW=0, side=0;
    for(const w of model.walls){ const m=[(w.A[0]+w.B[0])/2,(w.A[1]+w.B[1])/2];
      if((cen[0]-m[0])*w.nIn[0]+(cen[1]-m[1])*w.nIn[1]>0) side++;
      const cam=lookAt([cen[0]+0.3*(m[0]-cen[0]),1.4,cen[1]+0.3*(m[1]-cen[1])],[m[0],HT,m[1]]);
      const x=G.trackModelEdges(flat,IW,IH,PROJ,cam,model).walls.find(q=>q.k===w.k); if(!x) continue; nW++;
      const l=s.walls[w.k].line, pts=[x.pred.A,x.pred.B];
      worst=Math.max(worst, lineDist(cam, map(l.c), map([l.c[0]+l.u[0],l.c[1]+l.u[1]]), pts));
      raw=Math.max(raw, lineDist(cam, l.c, [l.c[0]+l.u[0],l.c[1]+l.u[1]], pts)); }
    chk('Verfolgung: Vorhersage im Kamerarahmen (Drift umgekehrt) auf der Wandgeraden, nIn in den Raum',
      nW===model.walls.length && nW>=4 && worst<0.5 && raw>3 && side===nW, `${nW} Wände, ${f3(worst)} px (ohne Umkehrung ${f3(raw)} px), nIn ${side}/${model.walls.length}`);
    // 7. Ring aus den Wandenden (nur wenn die Seite ihn hat): Waende in beliebiger Reihenfolge
    //    erfasst - der Umlaufsinn des Rings ist dann nicht die Zeitfolge; nIn muss trotzdem
    //    in den Raum zeigen (L-Raum, auch an der einspringenden Ecke).
    const per=ROOM.map((_,i)=>sweepObs(ROOM,81+i,{skip:ROOM.map((_,k)=>k).filter(k=>k!==i), back:0}));
    const sr=G.solveSweep(stamp([3,0,4,1,5,2].flatMap(i=>per[i])),{H:HT});
    if(sr.senk && sr.senk.byEnds && sr.corners){
      const mr=G.trackModel(sr, G.overlayModel(sr), [1,1]);
      const inn=mr.walls.filter(w=>{ const m=[(w.A[0]+w.B[0])/2,(w.A[1]+w.B[1])/2]; return inRoom(m[0]+0.1*w.nIn[0], m[1]+0.1*w.nIn[1]) && !inRoom(m[0]-0.1*w.nIn[0], m[1]-0.1*w.nIn[1]); }).length;
      chk('Verfolgung: Ring aus den Wandenden (Wände durcheinander erfasst) – nIn zeigt in den Raum', mr.walls.length===NW && inn===NW, `${inn}/${mr.walls.length}`);
    }
  }
}

// ------------------------------------ Uebergabe an raumaufmass.html
{
  const W0=synthWalls(1,0.01,3);
  const room=G.buildRoom(W0.map(o=>G.wallLine(o,HT)));
  const data=G.toRoomData(room.corners, 2600);
  chk('Export: importProblem() der App sagt ok', APP.importProblem(data)===null, APP.importProblem(data));
  chk('Export: IDs wie nextId()', data.pts.map(p=>p.id).join('')==='ABCDEF' && G.idOf(26)==='AA' && G.idOf(27)==='AB');
  const frag=G.shareFragment('Kamera-Skizze', data);
  const back=APP.parseShareFragment(frag);
  chk('Export: #raum=-Link übersteht parseShareFragment()', !!back && back.name==='Kamera-Skizze' && JSON.stringify(back.data)===JSON.stringify(data));
  const poly=APP.wallPolygon(data.pts, data.walls);
  chk('App: wallPolygon nimmt den Wandzug an', !!poly);
  const area=poly ? APP.roomArea(poly)/1e6 : NaN;
  chk('App: Fläche der Skizze ±5 % der Wahrheit', Math.abs(area-AREA)/AREA<=0.05, f3(area)+' m²');
  const sug=APP.suggest(data.pts, data.walls, data.meas);
  const need=2*data.pts.length-3;
  chk(`App: suggest() schlaegt ${need} Messungen zur Bestimmtheit vor`, sug.filter(s=>s.why==='bestimmt').length===need, sug.length);

  // Laser-Messungen der Wahrheit fuer alle Waende und Vorschlaege: der
  // Solver muss aus der Kamera-Skizze zur Wahrheit laufen.
  const T=Object.fromEntries(data.pts.map((p,i)=>[p.id,{x:ROOM[i][0]*1000, y:ROOM[i][1]*1000}]));
  const d=(a,b)=>Math.hypot(T[a].x-T[b].x, T[a].y-T[b].y);
  const meas=[...data.walls.map(([a,b])=>({a,b})), ...sug.map(s=>({a:s.a,b:s.b}))]
    .map(m=>({...m, d:d(m.a,m.b), sigma:5, on:true}));
  const fit=APP.solve(data.pts, meas);
  const P=Object.fromEntries(fit.pts.map(p=>[p.id,p]));
  let worst=0;
  for(const a of Object.keys(T)) for(const b of Object.keys(T)) if(a<b)
    worst=Math.max(worst, Math.abs(Math.hypot(P[a].x-P[b].x,P[a].y-P[b].y)-d(a,b)));
  chk('App: solve() läuft aus der Kamera-Skizze zur Wahrheit (±1 mm)', fit.converged && worst<1, f3(worst)+' mm');
}

// Senkrechte live (nur Anzeige): der Finder steht wortgleich in der Seite, G.senkLive
// zeigt eine Senkrechte erst ab 3 von 5 Laeufen an derselben Grundriss-Peilung - ueber
// die Modellwand gehoben, damit die wandernde Kamera sie nicht zerreisst -, gruen nur an
// einer sichtbaren Modellecke, und haelt sie (Hysterese) nur, solange die Kamera nah bleibt.
{
  let sj=null; try{ sj=read('raumskizze-senkrechte.js'); }catch(e){}
  chk('Senkrechte: der geo-Block traegt raumskizze-senkrechte.js wortgleich (das Werkzeug nimmt die Seite)',
    !!sj && pick(probe,'geo').includes('{\n'+sj+'}\n') && typeof G.verticalEdges==='function' && typeof G.senkLive==='function');
  const V=[[0,0],[4,0],[4,3],[0,3]], Mrect={rows:V.map((p,i)=>({span:[p, V[(i+1)%4]]})), verts:V.map(p=>({p}))};
  const camAt=(x,z)=>[1,0,0,0, 0,1,0,0, 0,0,1,0, x,1.5,z,1];
  const fund=(cam,X,grund='unten')=>({ray:{o:[cam[12],cam[13],cam[14]], d:[X[0]-cam[12], 0, X[1]-cam[14]].map((v,_,a)=>v/Math.hypot(a[0],a[2]))}, grund});
  const azOf=(cam,X)=>Math.atan2(X[1]-cam[14], X[0]-cam[12]);
  // a) Raumecke (4,3), Kamera quer zur Blickrichtung 6 cm je Lauf: die rohe Peilung dreht je Lauf ~1,4°.
  { let st=null; const res=[], cams=[0,1,2].map(i=>camAt(2-0.06*i*0.6, 1.5+0.06*i*0.8));
    for(const c of cams){ st=G.senkLive(st, [fund(c,[4,3])], c, Mrect); res.push(st.shown); }
    const s=res[2][0], dRaw=Math.abs(azOf(cams[2],[4,3])-azOf(cams[0],[4,3]))*180/Math.PI;
    chk('senkLive: Raumecke erst im 3. Lauf gezeigt, gruen an Modellecke 3, Lot auf der Ecke (Kamera wandert, roh 2,7°)',
      !res[0].length && !res[1].length && res[2].length===1 && s.ecke===2 && s.n===3 && Math.hypot(s.P[0]-4, s.P[1]-3)<0.01 && dRaw>1.4,
      s ? `ecke ${s.ecke}, P ${s.P.map(f3).join(',')}, roh ${dRaw.toFixed(2)}°` : 'nichts'); }
  // b) Moebelkante vor der Wand (1, 2,6), ohne o.H (die App gibt H immer mit - dort zeigt g):
  //    ohne Modellecke, Lot auf der Modellwand z = 3 dahinter.
  { let st=null; const c=camAt(2,1.5); for(let i=0;i<3;i++) st=G.senkLive(st, [fund(c,[1,2.6])], c, Mrect);
    const s=st.shown[0];
    chk('senkLive ohne Raumhoehe (Deckenfilter aus): Moebelkante hell (keine Modellecke), Grundrisspunkt auf der Modellwand dahinter', st.shown.length===1 && s.ecke===-1 && Math.abs(s.P[1]-3)<1e-9
      && Math.abs(azOf(c, s.P)-azOf(c,[1,2.6]))<1e-9, s ? `P ${s.P.map(f3).join(',')}` : 'nichts'); }
  // c) Einzelfund, 2 von 5, zwei Funde je Lauf, ohne Modell: nie gezeigt.
  { const c=camAt(2,1.5); let a=null, b=null, d=null, e=null, maxA=0, maxB=0;
    for(let i=0;i<5;i++){ a=G.senkLive(a, i===0 ? [fund(c,[4,1])] : [], c, Mrect); maxA=Math.max(maxA, a.shown.length);
      b=G.senkLive(b, i===0 || i===2 ? [fund(c,[4,1])] : [], c, Mrect); maxB=Math.max(maxB, b.shown.length); }
    for(let i=0;i<2;i++) d=G.senkLive(d, [fund(c,[4,1]), fund(c,[4,1])], c, Mrect);
    for(let i=0;i<4;i++) e=G.senkLive(e, [fund(c,[4,1])], c, null);
    chk('senkLive: Einzelfund und 2 von 5 nie gezeigt, zwei Funde in einem Lauf zaehlen einmal, ohne Modell nichts',
      maxA===0 && maxB===0 && d.shown.length===0 && e.shown.length===0 && e.runs.length===4); }
  // d) Hysterese: gezeigt ab Lauf 3, haelt bis kein Lauf im Fenster mehr dafuer spricht; mit aus:3 nicht;
  //    und nicht, wenn die Kamera seit dem juengsten Fund mehr als 0,15 m gegangen ist.
  { const c=camAt(2,1.5), far=camAt(2.2,1.5), run=(o,moved)=>{ let st=null; const n=[];
      for(let i=0;i<8;i++){ const cc=moved && i>=3 ? far : c; st=G.senkLive(st, i<3 ? [fund(cc,[4,1])] : [], cc, Mrect, o); n.push(st.shown.length); } return n.join(''); };
    const h1=run({}, false), h3=run({aus:3}, false), hw=run({}, true);
    chk('senkLive: Hysterese – gezeigt bis zum 7. Lauf (1 von 5), mit aus:3 bis zum 5., nach 0,2 m Weg nur solange 3 von 5',
      h1==='00111110' && h3==='00111000' && hw==='00111000', `${h1} / ${h3} / ${hw}`); }
  // e) Modellecke hinter einer Modellwand: nicht gruen, Lot auf der Wand davor.
  { const Mz={rows:[...Mrect.rows, {span:[[3,2],[3,4]]}], verts:Mrect.verts}; let st=null; const c=camAt(2,1.5);
    for(let i=0;i<3;i++) st=G.senkLive(st, [fund(c,[4,3])], c, Mz); const s=st.shown[0];
    chk('senkLive: verdeckte Modellecke nicht gruen, Grundrisspunkt auf der Wand davor', !!s && s.ecke===-1 && Math.abs(s.P[0]-3)<1e-9, s ? `P ${s.P.map(f3).join(',')}` : 'nichts'); }
  // f) Gerendert (L-Raum, weiss, Kontrast 4 Stufen): Kamera geht 5 cm je Lauf quer, Blick in die Ecke (0,0).
  { const Mroom={rows:ROOM.map((p,i)=>({span:[p, ROOM[(i+1)%NW]]})), verts:ROOM.map(p=>({p}))};
    let st=null, sH=null, raw=[]; const n=[];
    for(let i=0;i<3;i++){ const C=[2.0+0.05*i*0.781, 1.6, 2.5-0.05*i*0.625], cam=lookAt(C,[0,2.2,0]), g=render(cam, 900+i);
      const k=G.lumaKlein(g, IW, IH), f=G.verticalEdges(k.g, k.w, k.h, PROJ, cam, false); raw.push(f.map(x=>Math.atan2(x.ray.d[2], x.ray.d[0])));
      st=G.senkLive(st, f, cam, Mroom); sH=G.senkLive(sH, f, cam, Mroom, {H:HT}); n.push(st.shown.length); }
    const s=st.shown.find(x=>x.ecke===0), sh=sH.shown.find(x=>x.ecke===0);
    chk('senkLive gerendert: Raumecke (0,0) nach 3 Laeufen gruen, Lot auf der Ecke (±5 cm)', n[0]===0 && n[1]===0 && !!s && Math.hypot(s.P[0], s.P[1])<0.05,
      `gezeigt je Lauf ${n.join('/')}, Funde ${raw.map(r=>r.length).join('/')}${s ? ', P '+s.P.map(f3).join(',') : ''}`);
    chk('senkLive gerendert, mit Raumhoehe: die Raumecke reicht bis zur Decke (Anteil 0,9-1,1) und bleibt gruen', !!sh && sh.decke>=0.9 && sh.decke<=1.1 && Math.hypot(sh.P[0], sh.P[1])<0.05,
      sh ? `Anteil ${f3(sh.decke)}, P ${sh.P.map(f3).join(',')}` : `nichts (${sH.shown.length} gezeigt)`); }
  // f2) Verkleinern fuer den Finder (?ds bis 1920): ein 3fach vergroessertes Bild (jedes Pixel
  //     3x3) ergibt nach G.lumaKlein wieder genau das Bild, und der Finder findet dieselben
  //     Senkrechten an denselben Stellen (NDC) - die Pixel-/NDC-Abbildung stimmt.
  { const cam=lookAt([2.0,1.6,2.5],[0,2.2,0]), g=render(cam, 900), W3=3*IW, H3=3*IH, g3=new Float32Array(W3*H3);
    for(let y=0;y<H3;y++) for(let x=0;x<W3;x++) g3[y*W3+x]=g[Math.floor(y/3)*IW+Math.floor(x/3)];
    const k=G.lumaKlein(g3, W3, H3), k1=G.lumaKlein(g, IW, IH), a=G.verticalEdges(g, IW, IH, PROJ, cam, false), b=G.verticalEdges(k.g, k.w, k.h, PROJ, cam, false);
    let dmax=0; for(let i=0;i<g.length;i++) dmax=Math.max(dmax, Math.abs(k.g[i]-g[i]));
    const same=a.length>0 && a.length===b.length && a.every((x,i)=>Math.hypot(x.top[0]-b[i].top[0], x.top[1]-b[i].top[1])<1e-9);
    chk('lumaKlein: 864x1920 -> 288x640 (f=3) gibt das Bild zurueck, Finder gleich; bei 640 unveraendert',
      k.f===3 && k.w===IW && k.h===IH && dmax<1e-3 && same && k1.f===1 && k1.g===g, `f ${k.f}, ${k.w}x${k.h}, max ${f3(dmax)}, Funde ${a.length}/${b.length}`); }
  // g) Nur Kanten bis zur Decke (o.H): Strahl zum oberen Ende. Raumhoehe 2,5, Kamera 1,5 m hoch.
  //    Raumecke (4,3) bis zur Decke: gruen. Schrankkante (1, 2,6) endet auf 1,9 m - am
  //    Grundrisspunkt (Wand z = 3 dahinter) erreicht sie 0,55 der Hoehe Kamera->Decke: nicht
  //    gezeigt, mit decke:0 hell wie ohne o.H. Deckenhohe Kante ohne Modellecke (4, 1): hell.
  { const fundT=(cam,X,y)=>{ const d=[X[0]-cam[12], y-cam[13], X[1]-cam[14]], l=Math.hypot(...d); return {ray:{o:[cam[12],cam[13],cam[14]], d:d.map(v=>v/l)}, grund:'unten'}; };
    const c=camAt(2,1.5), run=(o, fs)=>{ let st=null; for(let i=0;i<3;i++) st=G.senkLive(st, fs, c, Mrect, o); return st.shown; };
    const ecke=run({H:2.5}, [fundT(c,[4,3],2.5)]), schrank=run({H:2.5}, [fundT(c,[1,2.6],1.9)]), schrank0=run({H:2.5, decke:0}, [fundT(c,[1,2.6],1.9)]), frei=run({H:2.5}, [fundT(c,[4,1],2.5)]);
    chk('senkLive mit Raumhoehe: Raumecke bis zur Decke gruen, Schrankkante (endet 0,6 m darunter) nicht gezeigt, mit decke:0 doch, deckenhohe Kante ohne Modellecke hell',
      ecke.length===1 && ecke[0].ecke===2 && Math.abs(ecke[0].decke-1)<1e-9 && schrank.length===0 && schrank0.length===1 && schrank0[0].ecke===-1 && Math.abs(schrank0[0].decke-0.5455)<1e-3
      && frei.length===1 && frei[0].ecke===-1 && Math.abs(frei[0].decke-1)<1e-9,
      `Ecke ${ecke.map(s=>s.ecke+'/'+f3(s.decke))} Schrank ${schrank.length}, decke:0 ${schrank0.map(s=>s.ecke+'/'+f3(s.decke))}, frei ${frei.map(s=>s.ecke+'/'+f3(s.decke))}`); }
  // h) Zwei Gruppen an derselben Modellecke (juengste Funde 1° auseinander, beide ±1,5° an der
  //    Ecke): ein Lot.
  { const c=camAt(2,1.5), a0=Math.atan2(1.5, 2), at=da=>[2+2.5*Math.cos(a0+da*Math.PI/180), 1.5+2.5*Math.sin(a0+da*Math.PI/180)];
    let st=null; for(let i=0;i<3;i++) st=G.senkLive(st, [fund(c, at(0.5)), fund(c, at(-0.5))], c, Mrect);
    // ohne Modellecke (Wand x = 4 bei z = 1): zwei helle Gruppen 1° auseinander, die mit mehr Laeufen bleibt
    const b0=Math.atan2(-0.5, 2), bt=da=>[2+2.0616*Math.cos(b0+da*Math.PI/180), 1.5+2.0616*Math.sin(b0+da*Math.PI/180)];
    let sh=null; for(let i=0;i<4;i++) sh=G.senkLive(sh, i<3 ? [fund(c, bt(0.5)), fund(c, bt(-0.5))] : [fund(c, bt(-0.5))], c, Mrect);
    chk('senkLive: zwei Gruppen an derselben Stelle - ein Lot (an der Modellecke gruen; ohne Ecke das mit mehr Laeufen)',
      st.shown.length===1 && st.shown[0].ecke===2 && sh.shown.length===1 && sh.shown[0].ecke===-1 && sh.shown[0].n===4 && Math.abs(sh.shown[0].az-(b0-0.5*Math.PI/180))<1e-9,
      `Ecke: ${st.shown.map(s=>s.ecke+'/n'+s.n).join(' ')} · ohne: ${sh.shown.map(s=>s.ecke+'/n'+s.n).join(' ')}`);
    // Die beim Zusammenlegen weggelassene Gruppe A (+0,5°) bleibt fuer die Hysterese im Zustand:
    // Laeufe A+B, A+B, A+B, B, -, -, A - im letzten traegt A nur noch 2 Laeufe (per Hysterese) und wird gezeigt.
    const seq=[[1,1],[1,1],[1,1],[0,1],[0,0],[0,0],[1,0]]; let sz=null;
    for(const [a,b] of seq) sz=G.senkLive(sz, [...(a ? [fund(c, bt(0.5))] : []), ...(b ? [fund(c, bt(-0.5))] : [])], c, Mrect);
    chk('senkLive: zusammengelegte Gruppe haelt die Hysterese (Zustand all) - kehrt ihr Fund zurueck, steht ihr Lot wieder',
      sz.shown.length===1 && sz.shown[0].n===2 && Math.abs(sz.shown[0].az-(b0+0.5*Math.PI/180))<1e-9, `gezeigt ${sz.shown.map(s=>(s.az*180/Math.PI).toFixed(2)+'°/n'+s.n).join(' ')}`); }
}

// ======================================== Stand 6 und 7 (ARCHITEKTUR v3, Bauauftraege 17.12, 9.3)
// Wortgleich: M0-M10 stehen als eigene Bloecke im geo-Block (wie die Senkrechte), so wie raumskizze-karte.mjs (T1)
// sie zusammensetzt; T1 erkennt ein Modul nur an seinem Namen - eine veraltete Kopie in der Seite fiele dort nicht auf.
// Seit Stand 7 ist M3 das echte raumskizze-segmente.js (der Platzhalter von Stand 6 bleibt stumm, if(!G.bild)).
{
  const geo=pick(probe,'geo');
  for(const f of ['raumskizze-karte-grund.js', 'raumskizze-elsed.js', 'raumskizze-senkrechte.js', 'raumskizze-segmente.js', 'raumskizze-abschnitte.js', 'raumskizze-landmarken.js',
    'raumskizze-ausgleich.js', 'raumskizze-umriss.js', 'raumskizze-ringe.js', 'raumskizze-tiefe.js', 'raumskizze-kartenlauf.js']){
    let src=null; try{ src=read(f); }catch(e){}
    chk(`Stand 7: der geo-Block traegt ${f} wortgleich`, !!src && geo.includes('{\n'+src+'}\n'), src ? '' : 'Datei fehlt'); }
  chk('Stand 7: M3 echt (G.bild ohne platzhalter, G.bildNeu, G.lumaAus, G.lmSegmente, G.lmVerschmelzen, G.lmGier, G.lmRechtwinklig), M10 da (G.karteNeu, G.karteRechnen)',
    ['bild','bildNeu','lumaAus','lmSegmente','lmVerschmelzen','lmGier','lmRechtwinklig','karteNeu','karteRechnen'].every(k=>typeof G[k]==='function') && !G.bild.platzhalter);
  const blocks=['bildwerk','messwerk','kartenwerk'].map(id=>{ const m=probe.match(new RegExp(`<script id="${id}" type="text/plain">([\\s\\S]*?)</script>`)); return m && m[1]; });
  chk('Stand 7: Worker-Huellen "bildwerk", "messwerk" und "kartenwerk" als text/plain-Bloecke (laufen nicht im Hauptfaden)', blocks.every(Boolean));
}

// M3 (9.4 Punkt 1, 17.2): Luma 77/150/29 >> 8; ohne Verschmelzen dieselbe Kette wie F1 (ELSED, Einteilung, Gier,
// rechtwinklige Klasse; M3 rechnet mit proj als Float32Array), mit Verschmelzen hoechstens so viele Segmente; Senkrechte im
// Worker auf dem Luma des Bilds (bis 640 px lange Seite unverkleinert). Bild: Regal bis zur Decke.
{
  const cam=lookAt([3.9,1.45,2.0],[3.9,2.4,0.45]), g=render(cam, 4242, 0.5), rgba=new Uint8Array(IW*IH*4);
  for(let i=0;i<IW*IH;i++){ const v=Math.max(0, Math.min(255, Math.round(g[i]))); rgba[4*i]=v; rgba[4*i+1]=Math.max(0, v-7); rgba[4*i+2]=Math.min(255, v+5); rgba[4*i+3]=255; }
  const L=G.lumaAus(rgba.buffer, 'rgba', IW, IH, null);
  let lumaOk=true; for(let i=0;i<IW*IH;i++) if(L[i]!==((77*rgba[4*i]+150*rgba[4*i+1]+29*rgba[4*i+2])>>8)) lumaOk=false;
  const L8=G.lumaAus(L.buffer, 'luma8', IW, IH, null);
  chk('M3: lumaAus rgba = (77R + 150G + 29B) >> 8, luma8 als Kopie', lumaOk && L8!==L && L8.every((v,i)=>v===L[i]));
  const a={k:5, vi:2, t:12.5, ep:1, fmt:'rgba', w:IW, h:IH, buf:rgba.buffer.slice(0), camTo:cam, proj:PROJ, flipY:false, senk:true};
  const B0=G.bildNeu({skala:1, verschm:false}), b0=G.bild(B0, {...a, buf:rgba.buffer.slice(0)}), b=G.bild(G.bildNeu({}), a);
  const roh=G.elsed(L, IW, IH), e=G.lmSegmente(roh, IW, IH, Float32Array.from(PROJ), Float64Array.from(cam), false, B0.o.segmente), psi0=G.lmGier(e, B0.o.gier), er=G.lmRechtwinklig(e, psi0, B0.o.recht);
  const gleich=(x,y)=>x.length===y.length && x.every((v,i)=>Object.is(v, y[i]));
  chk('M3: G.bild ohne Verschmelzen (skala 1) = Kette elsed -> lmSegmente -> lmGier -> lmRechtwinklig (seg, cls, man, dir, psi0), Kopf k, vi, ep, t, f',
    b0.n===roh.length && gleich(b0.seg, e.seg) && gleich(b0.cls, e.cls) && gleich(b0.man, er.man) && gleich(b0.dir, e.dir) && JSON.stringify(b0.psi0)===JSON.stringify(psi0)
    && b0.nTeile.every(x=>x===1) && b0.k===5 && b0.vi===2 && b0.ep===1 && b0.t===12.5 && Math.abs(b0.f-Math.fround(PROJ[5])*IH/2)<1e-9, `${b0.n} Segmente`);
  chk('M3: mit Verschmelzen (Vorgabe) hoechstens so viele Segmente, nTeile >= 1', b.n<=roh.length && b.n>0 && b.nTeile.every(x=>x>=1), `${roh.length} roh -> ${b.n}`);
  const senk=G.verticalEdges(L, IW, IH, Float32Array.from(PROJ), Float64Array.from(cam), false, {});
  chk('M3: Senkrechte im Worker = G.verticalEdges auf dem Luma des Bilds', Array.isArray(b.senk) && JSON.stringify(b.senk)===JSON.stringify(senk), `${senk.length} Funde`);
  const S10=G.KG.SEG, KL=G.KG.KL, idx=[...Array(b.n).keys()];
  const V=idx.filter(i=>b.cls[i]===KL.V).length, O0=idx.filter(i=>b.cls[i]===KL.O && Math.min(b.seg[i*S10+6], Math.PI-b.seg[i*S10+6])<2*Math.PI/180).length;
  chk('M3: Regal bis zur Decke - Seitenkanten senkrecht (V), Deckenkante waagerecht oben (O) mit Plan-Gier 0 (±2°)', V>=1 && O0>=1, `V ${V}, O mit psi≈0 ${O0}`);
  // Gier und rechtwinklige Klasse an einem gebauten Bild: 10 Segmente bei 0,3 rad, 8 rechtwinklig dazu, 2 schraege
  const nn=20, sb={n:nn, seg:new Float32Array(nn*S10), cls:new Int8Array(nn).fill(KL.O)}, R=rng(5);
  for(let i=0;i<nn;i++){ sb.seg[i*S10+6]=i<10 ? 0.3+(R()-0.5)*0.004 : i<18 ? 0.3+Math.PI/2+(R()-0.5)*0.004 : 0.9; sb.seg[i*S10+9]=50; }
  const gp=G.lmGier(sb), sr=G.lmRechtwinklig(sb, gp);
  chk('M3: lmGier findet die Raumrichtung mod 90° (±0,1°), lmRechtwinklig teilt 0 / 1 / -1 zu', !!gp && Math.abs(gp.psi-0.3)<0.1*Math.PI/180 && gp.n===18
    && [...sr.man].every((m,i)=>m===(i<10 ? 0 : i<18 ? 1 : -1)), gp ? `psi0 ${f3(gp.psi*180/Math.PI)}°, n ${gp.n}` : 'null');
  const b287=G.bild(G.bildNeu({}), {...a, w:287, buf:new Uint8Array(287*IH*4).fill(200).buffer, senk:false});
  chk('M3: ungerade Breite 287 (Pixel-Geraet) laeuft, senk nur auf Wunsch', b287.w===287 && b287.senk===null);
}

// Messmodus 7e: Rest-Formel von G.resSegment (f·asin) mit analytischer Jacobi gegen Differenzen; das
// synthetische Problem (R13) loest mit der LDL^T aus M0; Mac-Zeiten [M] fuer den Faktor Pixel/Mac.
{
  const R=G.KG.rnd(77), J=new Float64Array(7); let worst=0, n=0;
  for(let k=0;k<200;k++){
    const x=[R()*6.283, 1+3*R(), 2.2+0.4*R(), R()-0.5, R()-0.5, 0.1*(R()-0.5), R()-0.5], cB=[R()-0.5, 1.2+0.5*R(), R()-0.5];
    let d=[R()-0.5, 0.3+0.5*R(), R()-0.5]; const l=Math.hypot(...d); d=d.map(z=>z/l);
    const f=v=>G.messRest(v[0], v[1], v[2], {psi:v[3], tx:v[4], ty:v[5], tz:v[6]}, cB, d, 461, null);
    G.messRest(x[0], x[1], x[2], {psi:x[3], tx:x[4], ty:x[5], tz:x[6]}, cB, d, 461, J);
    for(let j=0;j<7;j++){ const h=1e-6, p=x.slice(), m=x.slice(); p[j]+=h; m[j]-=h; const num=(f(p)-f(m))/(2*h);
      worst=Math.max(worst, Math.abs(num-J[j])/Math.max(1, Math.abs(num))); n++; } }
  chk('Messmodus: G.messRest - analytische Jacobi (phi, rho, h, psi, tx, ty, tz) = Differenzen (rel. 1e-6)', worst<1e-6, `${n} Ableitungen, max ${worst.toExponential(1)}`);
  G.messLoeser({wdh:1});   // aufwaermen
  const z=G.messLoeser({wdh:5}), by=Object.fromEntries(z.map(r=>[r.fall, r]));
  chk('Messmodus: G.messLoeser - n 520/1000/1750 und Stufe 2 (240), loest (|Ax-b|/|b| < 1e-9), Ordnung wie R13 (520 Waende zuerst, 1750 Knoten zuerst)',
    by.n520 && by.n520.n===520 && by.n1000.n===1000 && by.n1750.n===1750 && by['stufe2-n240'].n===240 && z.every(r=>r.ok && r.relRest<1e-9)
    && by.n520.ordnung==='waendeZuerst' && by.n1750.ordnung==='knotenZuerst',
    z.map(r=>`${r.fall} [M] ${f3(r.msAufbau+r.msSymb+r.msNum+r.msLoes)} ms (nnzL ${r.nnzL}, ${r.ordnung})`).join(' · ')+` · 1000 Reste [M] ${f3(by.n520.msRes1000)} ms`);
}

// ---------------------------------------- App am nachgebauten Geraet
// Der app-Block laeuft in Node gegen Attrappen von DOM, WebXR (Posen, Anker, Hit-Test, Ebenen, Tiefe),
// WebGL2 (readPixels liefert das gerenderte Kamerabild), OPFS und Worker, mit fester Uhr und festem
// Szenario: Boden, Rundum-Schwenk an der Wand-Decke-Kante des L-Raums, Weg, zwei Ankerspruenge, Verlust,
// emulatedPosition, ref-reset, Tiefe aus/fehlerhaft, Ebenen, Blick auf den Boden. Stand 5 (Commit
// ebe8b6f) laeuft genauso; ohne Schalter muss die neue Seite dasselbe tun (17.12).
{
const NW=ROOM.length;
const geraetBau=()=>{
  const NW=ROOM.length;
  // Wand im Grundriss vom Punkt c in Richtung d (naechster Treffer)
  const wandTreffer=(c,d)=>{ let tb=Infinity, p=null;
    for(let i=0;i<NW;i++){ const a=ROOM[i], b=ROOM[(i+1)%NW], ex=b[0]-a[0], ez=b[1]-a[1], den=d[0]*ez-d[1]*ex; if(Math.abs(den)<1e-12) continue;
      const t=((a[0]-c[0])*ez-(a[1]-c[1])*ex)/den, u=((a[0]-c[0])*d[1]-(a[1]-c[1])*d[0])/den;
      if(t>1e-6 && u>=0 && u<=1 && t<tb){ tb=t; p=[c[0]+t*d[0], c[1]+t*d[1]]; } }
    return p; };
  // Raum -> local: p_l = R(ALPHA)·(p_r - O); local ist die ARCore-Welt (Start der Kamera, Boden y = -1,45)
  const ALPHA=0.35, O=[1.5, 1.45, 1.5], ca=Math.cos(ALPHA), sa=Math.sin(ALPHA);
  const R4=[ca,0,-sa,0, 0,1,0,0, sa,0,ca,0, 0,0,0,1], T4=[1,0,0,0, 0,1,0,0, 0,0,1,0, -O[0],-O[1],-O[2],1], M_RL=G.m4mul(R4, T4);
  const quat=m=>{ const t=m[0]+m[5]+m[10]; let x, y, z, w;
    if(t>0){ const s=0.5/Math.sqrt(t+1); w=0.25/s; x=(m[6]-m[9])*s; y=(m[8]-m[2])*s; z=(m[1]-m[4])*s; }
    else if(m[0]>m[5] && m[0]>m[10]){ const s=2*Math.sqrt(1+m[0]-m[5]-m[10]); w=(m[6]-m[9])/s; x=0.25*s; y=(m[4]+m[1])/s; z=(m[8]+m[2])/s; }
    else if(m[5]>m[10]){ const s=2*Math.sqrt(1+m[5]-m[0]-m[10]); w=(m[8]-m[2])/s; x=(m[4]+m[1])/s; y=0.25*s; z=(m[9]+m[6])/s; }
    else { const s=2*Math.sqrt(1+m[10]-m[0]-m[5]); w=(m[1]-m[4])/s; x=(m[8]+m[2])/s; y=(m[9]+m[6])/s; z=0.25*s; }
    return {x, y, z, w}; };
  const tf=M=>({matrix:Float32Array.from(M), position:{x:M[12], y:M[13], z:M[14], w:1}, orientation:quat(M)});
  // Szenario (Sekunden ab Sitzungsstart): Boden bis 1,5 s, dann 25°/s rundum an der Wand-Decke-Kante,
  // 12-17 s ein Weg nach C1; Ankerspruenge, Verlust, emuliert, ref-reset, Tiefe aus/fehlerhaft, Ebenen.
  const SZ={boden2:[20.5, 21.5], verlust:[19.0, 19.8], emuliert:[15.0, 15.5], tiefeNull:[5, 6], tiefeFehler:[7, 7.3], kleinSprung:8.0, grossSprung:10.5, reset:17.0, wandEbene:4};
  const C0=[1.5, 1.45, 1.5], C1=[1.5, 1.45, 3.6];
  const kamera=s=>{
    const C=s<12 ? C0 : s<17 ? [C0[0], C0[1], C0[2]+(s-12)/5*(C1[2]-C0[2])] : C1;
    let T; if(s<1.5 || (s>=SZ.boden2[0] && s<SZ.boden2[1])) T=[C[0]+0.8, 0, C[2]+0.3];
    else { const th=-0.4+25*Math.PI/180*(s-1.5), h=wandTreffer([C[0], C[2]], [Math.cos(th), Math.sin(th)]); T=[h[0], HT, h[1]]; }
    const Cr=lookAt(C, T); return {Cr, Cl:G.m4mul(M_RL, Cr)}; };
  // Schneller Renderer derselben Welt wie render() des Selbsttests (L-Raum, Decke 204, Waende 198..202,
  // Bild an Wand 1, Regal bis zur Decke), ohne Speicher je Pixel: Strahlen je Pixel einmal im Kamerarahmen.
  const SH={x0:3.4, x1:4.4, z0:0, z1:0.45}, RNG=seed=>()=>{ seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed);
    t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
  const DX=new Float64Array(IW*IH), DY=new Float64Array(IW*IH);
  for(let r=0;r<IH;r++) for(let u=0;u<IW;u++){ const n=G.pixToNdc(u, r, IW, IH, false); DX[r*IW+u]=n[0]/PROJ[0]; DY[r*IW+u]=n[1]/PROJ[5]; }
  const drin=(x,z)=>x>=0 && z>=0 && ((x<=5 && z<=3) || (x<=3 && z<=5));
  const bildRaum=(M, seed, rausch=2)=>{
    const R=RNG(seed), out=new Uint8Array(IW*IH), ox=M[12], oy=M[13], oz=M[14];
    for(let i=0;i<IW*IH;i++){
      const cx=DX[i], cy=DY[i], dx=M[0]*cx+M[4]*cy-M[8], dy=M[1]*cx+M[5]*cy-M[9], dz=M[2]*cx+M[6]*cy-M[10];
      let tB=Infinity, v=60;
      if(dy>0){ const t=(HT-oy)/dy, x=ox+t*dx, z=oz+t*dz; if(drin(x, z)){ tB=t; v=204; } }
      for(let k=0;k<NW;k++){ const a=ROOM[k], b=ROOM[(k+1)%NW], ex=b[0]-a[0], ez=b[1]-a[1], den=dx*ez-dz*ex; if(Math.abs(den)<1e-12) continue;
        const t=((a[0]-ox)*ez-(a[1]-oz)*ex)/den; if(!(t>0) || t>=tB) continue;
        const px=ox+t*dx, py=oy+t*dy, pz=oz+t*dz, sw=((px-a[0])*ex+(pz-a[1])*ez)/(ex*ex+ez*ez);
        if(sw<0 || sw>1 || py<0 || py>HT) continue;
        tB=t; v=198+(k%3)*2; if(k===1 && py>1.9 && py<2.45 && sw>0.2 && sw<0.55) v=150; }
      for(const [ax, pos, lo, hi] of [[2, SH.z1, SH.x0, SH.x1], [0, SH.x0, SH.z0, SH.z1], [0, SH.x1, SH.z0, SH.z1]]){
        const d=ax===2 ? dz : dx, o0=ax===2 ? oz : ox; if(Math.abs(d)<1e-12) continue;
        const t=(pos-o0)/d; if(!(t>0) || t>=tB) continue;
        const q=ax===2 ? ox+t*dx : oz+t*dz, py=oy+t*dy; if(q>=lo && q<=hi && py>=0 && py<=HT){ tB=t; v=120; } }
      const g=Math.round(v+(R()*2-1)*rausch); out[i]=g<0 ? 0 : g>255 ? 255 : g; }
    return out; };
  const SZENARIO=SZ;

  return async function geraet(html, o={}){
    const query='?debug'+(o.query ? '&'+o.query : ''), D=o.dauer ?? 26, FPS=30, dtF=1000/FPS;
    const scripts={}; for(const m of html.matchAll(/<script id="([^"]+)"[^>]*>([\s\S]*?)<\/script>/g)) scripts[m[1]]=m[2];
    let uhr=1000; const aufg=[]; let seq=0;
    const plane=(due, fn, wk=null, kosten=0)=>aufg.push({due, seq:seq++, fn, wk, kosten});
    const leer=()=>new Promise(r=>setImmediate(r));
    const stat={readPixels:[], createAnchor:[], worker:[], hoerer:{}, gyro:0, anfrage:null, solver:[], bildAn:[], bildVon:[], messVon:[], karteAn:[], karteVon:[], fehler:[], getBufferSubData:0, segZeichnen:0};
    const lauf=async bis=>{
      for(;;){ let best=null, be=Infinity;
        for(const a of aufg){ const e=a.wk ? Math.max(a.due, a.wk.frei) : a.due; if(e<be || (e===be && best && a.seq<best.seq)){ be=e; best=a; } }
        if(!best || be>bis) break;
        aufg.splice(aufg.indexOf(best), 1);
        if(best.wk && best.wk.weg) continue;
        uhr=Math.max(uhr, be);
        if(best.wk){ best.wk.ende=uhr+best.kosten; best.wk.frei=uhr+best.kosten; }
        try{ best.fn(); }catch(e){ stat.fehler.push(String(e && e.stack || e)); }
        if(best.wk) best.wk.ende=null;
        await leer(); }
      uhr=Math.max(uhr, bis); };
    // ---- Worker
    const urls=new Map(); let nUrl=0;
    class MBlob extends NodeBlob{ constructor(p=[], op){ super(p, op); this.teile=p; } }
    class Werk{
      constructor(url){
        const src=urls.get(url), w=this;
        this.art=src.includes('RAUMSKIZZE.solveSweepAuto(obs,opt)') ? 'schaetzer' : src.includes('// Bild-Worker (Stand 6') ? 'bild' : src.includes('// Mess-Worker (Stand 6') ? 'mess' : src.includes('// Karten-Worker (Stand 7') ? 'karte' : 'anders';
        stat.worker.push(this.art); this.frei=0; this.weg=false; this.ende=null; this.onmessage=null; this.onerror=null;
        const zuMain=(m, tr)=>{ const c=structuredClone(m, {transfer:tr || []}); if(w.art==='bild') stat.bildVon.push(c); if(w.art==='mess') stat.messVon.push(c); if(w.art==='karte') stat.karteVon.push({t:uhr, ...c});
          plane(w.ende ?? uhr, ()=>{ if(!w.weg && w.onmessage) w.onmessage({data:c}); }); };
        const ctx=this.ctx=vm.createContext({console, performance:{now:()=>uhr}, postMessage:zuMain,
          setTimeout:(f, d=0)=>{ plane(uhr+(+d || 0), f, w, w.art==='bild' ? (o.bildMs ?? 40) : 0); return 1; }, clearTimeout:()=>{}});
        vm.runInContext(src, ctx);
        if(this.art==='bild' && o.bild==='wirftInnen') ctx.RAUMSKIZZE.bild=Object.assign(()=>{ throw new Error('Platzhalter wirft'); }, {platzhalter:'wirft'});
        if(this.art==='karte' && o.karte==='wirftInnen') ctx.RAUMSKIZZE.karteRechnen=()=>{ throw new Error('Platzhalter wirft'); };
      }
      postMessage(m, tr){
        if(this.weg) return;
        const c=structuredClone(m, {transfer:tr || []}), w=this;
        if(w.art==='schaetzer') stat.solver.push({t:uhr, obs:JSON.stringify(c.obs), opt:JSON.stringify(c.opt)});
        if(w.art==='bild' && c.typ==='bild') stat.bildAn.push({t:uhr, ta:c.t, k:c.k, ep:c.ep, vi:c.vi, w:c.w, h:c.h, an:c.an, senk:c.senk, bytes:c.buf.byteLength});
        if(w.art==='karte') stat.karteAn.push({t:uhr, typ:c.typ, ...(c.typ==='rechne' ? {id:c.id, schluss:c.schluss} : c.typ==='pose' ? {zt:c.zeile.t, ep:c.zeile.ep} : c.typ==='erfassung' ? {et:c.erf.t, id:c.erf.id} : c.typ==='ereignis' ? {ev:c.ev.typ} : {})});
        if(w.art==='karte' && o.karte==='schweigt') return;
        if(w.art==='karte' && o.karte==='wirftAussen'){ plane(uhr, ()=>{ if(!w.weg && w.onerror) w.onerror({message:'Platzhalter wirft'}); }); return; }
        if(w.art==='bild' && o.bild==='schweigt') return;
        if(w.art==='bild' && o.bild==='wirftAussen'){ plane(uhr, ()=>{ if(!w.weg && w.onerror) w.onerror({message:'Platzhalter wirft'}); }); return; }
        plane(uhr, ()=>{ if(w.ctx.onmessage) w.ctx.onmessage({data:c}); }, w, w.art==='schaetzer' ? 250 : w.art==='mess' ? 100 : 0);
      }
      terminate(){ this.weg=true; }
    }
    // ---- WebGL2
    const KAMTEX={kamera:true, w:864, h:1920};
    const glMock=()=>{
      const K={}; let kn=0x9000; const konst=n=>K[n] ?? (K[n]=++kn);
      const st={fb:null, tex:null, pack:null};
      const basis={
        getShaderParameter:()=>true, getProgramParameter:()=>true, getShaderInfoLog:()=>'', getProgramInfoLog:()=>'',
        createShader:()=>({}), createProgram:()=>({}), createBuffer:()=>({puffer:true}), createFramebuffer:()=>({fb:true, tex:null}), createTexture:()=>({w:0, h:0}),
        bindFramebuffer:(t, fb)=>{ st.fb=fb; }, bindTexture:(t, tx)=>{ st.tex=tx; },
        texImage2D:(t, l, i, w, h)=>{ if(st.tex){ st.tex.w=w; st.tex.h=h; } },
        framebufferTexture2D:(t, a, tt, tx)=>{ if(st.fb && st.fb.fb) st.fb.tex=tx; },
        checkFramebufferStatus:()=>konst('FRAMEBUFFER_COMPLETE'),
        bindBuffer:(t, b)=>{ if(t===konst('PIXEL_PACK_BUFFER')) st.pack=b; },
        getParameter:()=>'Nachbau', makeXRCompatible:async()=>{},
        readPixels:(x, y, w, h, f, ty, dst)=>{ const tex=st.fb && st.fb.fb ? st.fb.tex : null;
          stat.readPixels.push({t:uhr, w, h, pbo:typeof dst==='number' || !!st.pack, ziel:tex ? (tex.kamera ? 'kamera' : 'textur') : 'schicht'});
          if(typeof dst!=='number') fuellen(dst, w, h, tex); },
        fenceSync:()=>({zaun:true}), clientWaitSync:()=>konst('ALREADY_SIGNALED'), getBufferSubData:()=>{ stat.getBufferSubData++; }, deleteSync:()=>{}, flush:()=>{}};
      return new Proxy(basis, {get:(ob, k)=>k in ob ? ob[k] : typeof k==='string' && /^[A-Z0-9_]+$/.test(k) ? konst(k) : typeof k==='string' ? ()=>{} : undefined});
    };
    const gl=glMock();
    // Kamerabild: das gerenderte Bild dieses XR-Bilds (IW×IH, Zeile 0 unten), sonst grau
    let bildJetzt=null;
    const fuellen=(dst, w, h, tex)=>{ if(tex && !tex.kamera && w===IW && h===IH && bildJetzt){ const g=bildJetzt();
        for(let i=0;i<w*h;i++){ const v=g[i]; dst[4*i]=dst[4*i+1]=dst[4*i+2]=v; dst[4*i+3]=255; } }
      else dst.fill(128); };
    // ---- DOM
    const ctx2d=cv=>new Proxy({canvas:cv, createImageData:(w, h)=>({data:new Uint8ClampedArray(w*h*4), width:w, height:h}), measureText:()=>({width:0}),
      drawImage:()=>{ if(cv.id==='arCanvas') stat.segZeichnen++; }}, {get:(ob, k)=>k in ob ? ob[k] : typeof k==='string' ? ()=>{} : undefined});
    const els=new Map();
    const mkEl=id=>{ const e={id, textContent:id && scripts[id]!=null ? scripts[id] : '', className:'', disabled:false, checked:id==='auto', value:'', style:{}, width:300, height:150, children:[],
      classList:{s:new Set(), add(...c){ c.forEach(x=>this.s.add(x)); }, remove(...c){ c.forEach(x=>this.s.delete(x)); }, toggle(c, an){ if(an===undefined) an=!this.s.has(c); if(an) this.s.add(c); else this.s.delete(c); }, contains(c){ return this.s.has(c); }},
      appendChild(c){ this.children.push(c); return c; }, append(...c){ this.children.push(...c); }, replaceChildren(...c){ this.children=c; },
      addEventListener(t, f){ (this.h || (this.h={}))[t]=f; }, removeEventListener(){}, scrollIntoView(){}, click(){ if(this.onclick) this.onclick(); }, remove(){},
      getContext(k){ return k==='2d' ? (this.c2 || (this.c2=ctx2d(this))) : k==='webgl2' ? gl : null; }}; return e; };
    const document={getElementById:id=>{ if(!els.has(id)) els.set(id, mkEl(id)); return els.get(id); }, createElement:()=>mkEl(null), body:mkEl('body')};
    // ---- OPFS
    class Datei{ constructor(n){ this.kind='file'; this.name=n; this.teile=[]; }
      async createWritable(){ const neu=[]; return {write:async x=>{ neu.push(x); }, close:async()=>{ this.teile=neu; }}; }
      async getFile(){ return new NodeBlob(this.teile.map(x=>typeof x==='string' || x instanceof NodeBlob ? x : ArrayBuffer.isView(x) ? new Uint8Array(x.buffer, x.byteOffset, x.byteLength) : new Uint8Array(x))); }
      bytes(){ return Buffer.concat(this.teile.map(x=>typeof x==='string' ? Buffer.from(x) : ArrayBuffer.isView(x) ? Buffer.from(x.buffer, x.byteOffset, x.byteLength) : Buffer.from(x))); } }
    class Ordner{ constructor(n){ this.kind='directory'; this.name=n; this.k=new Map(); }
      async getDirectoryHandle(n, op={}){ let d=this.k.get(n); if(!d){ if(!op.create) throw new Error('NotFoundError'); d=new Ordner(n); this.k.set(n, d); } return d; }
      async getFileHandle(n, op={}){ let f=this.k.get(n); if(!f){ if(!op.create) throw new Error('NotFoundError'); f=new Datei(n); this.k.set(n, f); } return f; }
      async removeEntry(n){ this.k.delete(n); }
      async *entries(){ for(const e of [...this.k]) yield e; } }
    const opfs=new Ordner('');
    // ---- WebXR
    const anker=[]; let tiefeArt=null, rafCb=null, ende=false;
    const neuerAnker=rt=>{ const p=rt.position, q=rt.orientation, a={p:[p.x, p.y, p.z], psi:2*Math.atan2(q.y, q.w), weg:false};
      a.anchorSpace={anker:a}; a.delete=()=>{ a.weg=true; }; anker.push(a); return a; };
    const ankerPose=a=>({transform:{position:{x:a.p[0], y:a.p[1], z:a.p[2]}, orientation:{x:0, y:Math.sin(a.psi/2), z:0, w:Math.cos(a.psi/2)}}});
    class XRRigidTransform{ constructor(p={}, q={}){ this.position={x:p.x||0, y:p.y||0, z:p.z||0, w:1}; this.orientation={x:q.x||0, y:q.y||0, z:q.z||0, w:q.w ?? 1}; } }
    class XRWebGLLayer{ constructor(){ this.framebuffer={schicht:true}; } getViewport(){ return {x:0, y:0, width:1080, height:2400}; } }
    class XRWebGLBinding{ getCameraImage(){ return KAMTEX; } }
    let gyroObj=null;
    // VideoEncoder/VideoFrame (o.video): ein Stueck je Bild aus Stichproben des Bilds, synchron ausgegeben
    class VideoFrame{ constructor(d, op){ this.probe=Uint8Array.from({length:61}, (_, j)=>d[(j*7919)%d.length]); this.ts=op.timestamp; } close(){} }
    class VideoEncoder{ constructor({output}){ this.output=output; this.state='unconfigured'; this.encodeQueueSize=0; stat.videoEnc=(stat.videoEnc||0)+1; }
      static async isConfigSupported(c){ return {supported:true, config:c}; }
      configure(c){ this.state='configured'; this.cfg=c; }
      encode(vf, op){ if(o.encMs) uhr+=o.encMs; const b=new Uint8Array(66); b[0]=op && op.keyFrame ? 1 : 0; b.set(vf.probe, 1); new DataView(b.buffer).setUint32(62, vf.ts>>>0, true);
        this.output({byteLength:b.length, copyTo:dst=>dst.set(b)}); }
      async flush(){} close(){ this.state='closed'; } }
    class Gyroscope{ constructor(o2){ stat.gyro++; gyroObj=this; this.h={}; this.x=0; this.y=0; this.z=0; this.timestamp=null; } addEventListener(t, f){ this.h[t]=f; } start(){} stop(){} }
    const refH={}, refLocal={addEventListener:(t, f)=>{ refH[t]=f; }}, refViewer={};
    const sitzungH={};
    const sitzung={renderState:{baseLayer:null}, enabledFeatures:['local','hit-test','anchors','dom-overlay','camera-access','plane-detection','depth-sensing'],
      domOverlayState:{type:'screen'}, depthUsage:'cpu-optimized', depthDataFormat:'luminance-alpha', get depthType(){ return tiefeArt; }, depthActive:true, environmentBlendMode:'additive',
      updateRenderState(s){ Object.assign(this.renderState, s); }, requestReferenceSpace:async art=>art==='local' ? refLocal : refViewer,
      requestHitTestSource:async()=>({quelle:true}), requestAnimationFrame(cb){ rafCb=cb; return 1; },
      addEventListener(t, f){ (sitzungH[t]=sitzungH[t] || []).push(f); },
      end(){ if(!ende){ ende=true; plane(uhr, ()=>{ for(const f of sitzungH.end || []) f({}); }); } return Promise.resolve(); }};
    const navigator={userAgent:'Geraet-Nachbau', vibrate(){}, storage:{getDirectory:async()=>opfs},
      xr:{isSessionSupported:async()=>true, requestSession:async(art, init)=>{ stat.anfrage=JSON.parse(JSON.stringify(init));
        const w=init.depthSensing && init.depthSensing.depthTypeRequest; tiefeArt=w ? w[0] : 'smooth'; return sitzung; }}};
    const ls=new Map(), localStorage={getItem:k=>ls.has(k) ? ls.get(k) : null, setItem:(k, v)=>{ ls.set(k, String(v)); }};
    const ab=new Set(); let tid=0;
    const fenster={document, navigator, localStorage, console, location:{href:'https://geraet.test/raumskizze-probe.html'+query, search:query},
      performance:{now:()=>uhr}, setTimeout:(f, d=0)=>{ const id=++tid; plane(uhr+(+d || 0), ()=>{ if(!ab.has(id)) f(); }); return id; }, clearTimeout:id=>{ ab.add(id); },
      innerWidth:412, innerHeight:915, devicePixelRatio:2.625, isSecureContext:true,
      addEventListener:(t, f)=>{ (stat.hoerer[t]=stat.hoerer[t] || []).push(f);
        // o.imuVorStart: ein Sensor-Ereignis gleich beim Anhaengen, also vor recStart (messStart laeuft vor der
        // Vorbereitung; Abnahme Stand 6: REC.imu fehlte beim ersten Lauf je Seitenaufruf).
        if(t==='devicemotion' && o.imuVorStart && !stat.imuVor){ stat.imuVor=true;
          try{ f({timeStamp:0, interval:16, rotationRate:{alpha:1, beta:2, gamma:3}, accelerationIncludingGravity:{x:0, y:9.8, z:0}}); }
          catch(e){ stat.fehler.push('devicemotion vor recStart: '+String(e && e.stack || e)); } } }, removeEventListener:(t, f)=>{ const a=stat.hoerer[t]; if(a){ const i=a.indexOf(f); if(i>=0) a.splice(i, 1); } },
      Worker:Werk, Blob:MBlob, URL:{createObjectURL:b=>{ const u='blob:'+(++nUrl); urls.set(u, (b.teile || []).join('')); return u; }, revokeObjectURL(){}},
      URLSearchParams, TextEncoder, Response, CompressionStream, XRRigidTransform, XRWebGLLayer, XRWebGLBinding, ...(o.gyro ? {Gyroscope} : {}), ...(o.video ? {VideoEncoder, VideoFrame} : {})};
    if(o.video) ls.set('raumskizze-probe.video', '1');
    fenster.window=fenster;
    const ctx=vm.createContext(fenster);
    // feste Wanduhr: LOG.started, Name der Aufnahme und der Skizze gleich in jedem Lauf
    vm.runInContext(`(()=>{ const D=Date, T=Date.UTC(2026, 9, 25, 12, 0, 0); globalThis.Date=class extends D{ constructor(...a){ super(...(a.length ? a : [T])); } static now(){ return T; } }; })();`, ctx);
    vm.runInContext(scripts.vendor+'\n'+scripts.geo, ctx);
    vm.runInContext(scripts.app, ctx);
    for(let i=0;i<5;i++) await leer();
    // ---- Sitzung
    const P=()=>ctx.PROBE, doc=document;
    if(o.vorlauf) await lauf(uhr+o.vorlauf);   // Seite schon so lange offen (now() zaehlt ab dem Laden)
    doc.getElementById('start').onclick();
    for(let i=0;i<20;i++) await leer();
    const t0=uhr, NF=Math.round(D*FPS), ebenen=new Set(), boden={orientation:'horizontal', planeSpace:{ebene:'boden'}, polygon:[{x:-2,y:0,z:-2},{x:2,y:0,z:-2},{x:2,y:0,z:2},{x:-2,y:0,z:2}], lastChangedTime:0};
    const wandE={orientation:'vertical', planeSpace:{ebene:'wand'}, polygon:[{x:-1,y:0,z:-0.5},{x:1,y:0,z:-0.5},{x:1,y:0,z:0.5},{x:-1,y:0,z:0.5}], lastChangedTime:0};
    ebenen.add(boden);
    const ebenePose={boden:{transform:{position:{x:0, y:-1.45, z:0}, orientation:{x:0, y:0, z:0, w:1}}}, wand:{transform:{position:{x:1, y:-0.5, z:-1.8}, orientation:{x:0.7071068, y:0, z:0, w:0.7071068}}}};
    const cache=o.cache || new Map(); let sprungKlein=false, sprungGross=false, resetGesendet=false, klicks=0;
    for(let i=0;i<NF && !ende;i++){
      const tI=t0+i*dtF, s=i/FPS;
      await lauf(tI);
      // Szenario-Ereignisse
      if(!sprungKlein && s>=SZ.kleinSprung){ sprungKlein=true; for(const a of anker){ a.p[0]+=0.04; a.p[2]+=0.02; a.psi+=0.8*Math.PI/180; } }
      if(!sprungGross && s>=SZ.grossSprung && anker.length){ sprungGross=true; const a=anker[0]; a.p[0]+=0.35; a.p[2]-=0.15; a.psi+=6*Math.PI/180; }
      if(!resetGesendet && s>=SZ.reset && refH.reset){ resetGesendet=true; refH.reset({transform:{position:{x:0.01, y:0, z:0}, orientation:{x:0, y:0, z:0, w:1}}}); }
      if(s>=SZ.wandEbene) ebenen.add(wandE);
      boden.lastChangedTime=1000*3*Math.floor(s/3); wandE.lastChangedTime=1000*2*Math.floor(s/2);
      while(o.klicks && klicks<o.klicks.length && s>=o.klicks[klicks][0]){ const e=doc.getElementById(o.klicks[klicks++][1]); if(e.onclick) e.onclick(); }
      if(o.gyro && gyroObj) for(const dt of [0, dtF/2]){ Object.assign(gyroObj, {x:0.01, y:0.02, z:0.03, timestamp:tI+dt}); if(gyroObj.h.reading) gyroObj.h.reading(); }
      if(o.imu && stat.hoerer.devicemotion) for(const f of stat.hoerer.devicemotion) for(const dt of [0, dtF/2]) f({timeStamp:tI+dt, interval:16, rotationRate:{alpha:1, beta:2, gamma:3}, accelerationIncludingGravity:{x:0, y:9.81, z:0}});
      const k=kamera(s), verloren=s>=SZ.verlust[0] && s<SZ.verlust[1], emul=s>=SZ.emuliert[0] && s<SZ.emuliert[1];
      bildJetzt=()=>{ let b=cache.get(i); if(!b){ b=bildRaum(k.Cr, 7000+i, o.rausch ?? 2); cache.set(i, b); } return b; };
      const view={transform:tf(k.Cl), projectionMatrix:Float32Array.from(PROJ), camera:{width:864, height:1920}};
      const pose=verloren ? null : {transform:tf(k.Cl), views:[view], emulatedPosition:emul};
      const frame={session:sitzung,
        getViewerPose:()=>pose,
        getHitTestResults:()=>{ const m=k.Cl, d=[-m[8], -m[9], -m[10]]; if(d[1]>-0.05) return []; const t=(-O[1]-m[13])/d[1];
          return [{getPose:()=>({transform:{position:{x:m[12]+t*d[0], y:-O[1], z:m[14]+t*d[2]}, orientation:{x:0, y:0, z:0, w:1}}})}]; },
        createAnchor:rt=>{ stat.createAnchor.push(+(s).toFixed(3)); return Promise.resolve(neuerAnker(rt)); },
        get trackedAnchors(){ return new Set(anker.filter(a=>!a.weg)); },
        getPose:(sp)=>sp && sp.anker ? (sp.anker.weg ? null : ankerPose(sp.anker)) : sp && sp.ebene ? ebenePose[sp.ebene] : null,
        detectedPlanes:o.ebenen===false ? new Set() : ebenen,   // o.ebenen false: das Geraet meldet keine Ebenen
        getDepthInformation:()=>{ stat.tiefeAbfragen=(stat.tiefeAbfragen||0)+1; if(o.tiefeMs) uhr+=o.tiefeMs; if(s>=SZ.tiefeNull[0] && s<SZ.tiefeNull[1]) return null; if(s>=SZ.tiefeFehler[0] && s<SZ.tiefeFehler[1]) throw new Error('Tiefe nicht bereit');
          return {width:160, height:90, data:new ArrayBuffer(160*90*2), rawValueToMeters:0.001, normDepthBufferFromNormView:{matrix:Float32Array.from([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])}}; }};
      uhr=tI;
      if(rafCb){ const cb=rafCb; rafCb=null; try{ cb(tI, frame); }catch(e){ stat.fehler.push('onFrame: '+String(e && e.stack || e)); } }
      await leer();
    }
    // Ende: wie „Beenden“ - onEnd, computeResult, recStop (async, Messmodus wartet auf den Loeser danach)
    if(P() && P().S.session) P().S.session.end();
    await lauf(uhr+1); for(let i=0;i<10;i++) await leer();
    // recStop schreibt asynchron (gzip im Thread-Pool): auf das Ende warten, in Uhr der Attrappe und echter Zeit
    let fertig=false; Promise.resolve(P() && P().REC.stopping).then(()=>{ fertig=true; });
    for(let i=0;i<2000 && !fertig;i++){ await lauf(uhr+50); await new Promise(r=>setTimeout(r, i<50 ? 0 : 2)); }
    stat.endeFertig=fertig;
    const top=opfs.k.get('aufnahmen'), dirs=top ? [...top.k.values()] : [], rec=dirs.length ? dirs[dirs.length-1] : null;
    const dateien={}; if(rec) for(const [n, f] of rec.k) dateien[n]=f.bytes();
    return {P:P(), ctx, stat, dateien, ls, anker, tiefeArt, szenario:SZ, doc};
  };
};
const geraet=geraetBau();
let alt=null; try{ alt=execFileSync('git', ['-C', new URL('..', import.meta.url).pathname, 'show', 'ebe8b6f:raumskizze-probe.html'], {encoding:'utf8', maxBuffer:1<<27, stdio:['ignore','pipe','ignore']}); }catch(e){}
chk('Geraet: Stand 5 als Referenz (git show ebe8b6f:raumskizze-probe.html)', !!alt);
if(alt){
  const cache=new Map(), DAUER=22, ANSICHT=[[3,'btnAnsicht'],[3.1,'btnAnsicht'],[3.2,'btnAnsicht']];
  const basis={cache, dauer:DAUER, klicks:ANSICHT, imu:true, gyro:true, rausch:0.5, video:true};
  const tG=performance.now();
  const r5=await geraet(alt, basis), r6=await geraet(probe, basis), rk=await geraet(probe, {...basis, query:'karte=1'});
  const rm=await geraet(probe, {...basis, query:'mess=1', klicks:[...ANSICHT, [6,'btnMarke'], [21,'btnMarke']]});
  const kurz={cache, dauer:8, klicks:ANSICHT, rausch:0.5, query:'karte=1', video:true};
  const rf1=await geraet(probe, {...kurz, bild:'wirftAussen'}), rf2=await geraet(probe, {...kurz, bild:'schweigt'}), rf3=await geraet(probe, {...kurz, bild:'wirftInnen'}), rl=await geraet(probe, {...kurz, bildMs:400});
  const kb=await geraet(probe, {...kurz, query:'karte=1&quelle=beide'});
  const kf1=await geraet(probe, {...kurz, karte:'wirftAussen'}), kf2=await geraet(probe, {...kurz, karte:'schweigt'}), kf3=await geraet(probe, {...kurz, karte:'wirftInnen'});
  // Nachbesserung: rz - Video und Tiefe kosten Zeit (die Uhr laeuft in encode und getDepthInformation weiter, wie am
  // Pixel); rg - die Seite ist schon 50 s offen, die Sitzung laeuft ueber die Minutengrenze (zwei volle Lesungen),
  // mit tiefe=raw ausdruecklich (mess=1 allein fordert seit der Korrektur ebenfalls raw an, geprueft an rm).
  // rd - mess=1 ohne devicemotion-Ereignisse, ohne Gyroscope und ohne Ebenen (manifest.dateien nur mit Inhalt).
  const rz=await geraet(probe, {...kurz, tiefeMs:3, encMs:2});
  const rg=await geraet(probe, {...basis, query:'mess=1&tiefe=raw', vorlauf:50000, dauer:13});
  const rd=await geraet(probe, {...kurz, query:'mess=1', ebenen:false, imuVorStart:true});
  const msG=performance.now()-tG;
  const J=x=>JSON.stringify(x), ohne=(o,k)=>{ const c={...o}; for(const x of k) delete c[x]; return c; };
  const obsJ=(r, an=false)=>J(r.P.LOG.obs.map(o=>an ? ohne(o, ['an']) : o));
  // Ereignisse ohne die neuen Typen; sitzung-start nur mit den Feldern von Stand 5
  const NEU=new Set(['ref-reset', 'emuliert', 'tiefe']), SITZ6=['depthType', 'depthActive', 'depthTypeRequest', 'karte', 'mess'];
  // aufnahme-ende ohne t: recStop endet nach echtem asynchronem Schreiben (gzip im Thread-Pool), nicht nach der Uhr der Attrappe
  const evJ=(r, weg=NEU)=>J(r.P.LOG.events.filter(e=>!weg.has(e.type)).map(e=>e.type==='sitzung-start' ? ohne(e, SITZ6) : e.type==='aufnahme-ende' ? ohne(e, ['t']) : e));
  const rpJ=(r, nurAlt=false)=>J(r.stat.readPixels.filter(x=>!nurAlt || (x.w===IW && x.h===IH) || (x.w===256 && x.h===256)));
  const zeilen=r=>Object.keys(r.dateien).filter(n=>/^zustand-\d+\.jsonl$/.test(n)).sort().flatMap(n=>r.dateien[n].toString().split('\n').filter(Boolean).map(l=>JSON.parse(l)));
  const jsonl=(r, art)=>Object.keys(r.dateien).filter(n=>new RegExp(`^${art}-\\d+\\.jsonl$`).test(n)).sort().flatMap(n=>r.dateien[n].toString().split('\n').filter(Boolean).map(l=>JSON.parse(l)));
  const bin=(r, art)=>Buffer.concat(Object.keys(r.dateien).filter(n=>new RegExp(`^${art}-\\d+\\.bin$`).test(n)).sort().map(n=>r.dateien[n]));
  const man=r=>r.dateien['manifest.json'] ? JSON.parse(r.dateien['manifest.json'].toString()) : null;
  const typen=r=>r.P.LOG.events.reduce((m,e)=>(m[e.type]=(m[e.type]||0)+1, m), {});
  const z5=zeilen(r5), z6=zeilen(r6), zk=zeilen(rk), zm=zeilen(rm), T6=typen(r6);
  const alle=[r5,r6,rk,rm,rf1,rf2,rf3,rl,rz,rg,rd];
  chk('Geraet: alle Laeufe ohne Ausnahme, Aufnahme regulaer beendet', alle.every(r=>!r.stat.fehler.length && r.stat.endeFertig),
    alle.flatMap(r=>r.stat.fehler).slice(0,2).join(' | ') || `${alle.length} Laeufe, ${(msG/1000).toFixed(1)} s, beendet ${alle.map(r=>r.stat.endeFertig ? 1 : 0).join('')}`);
  chk('Geraet: das Szenario erfasst wirklich (Erfassungen, Schaetzer, Brueche, Anker, Verlust)', r5.P.LOG.obs.length>=30 && r5.stat.solver.length>=20
    && J(r5.P.LOG.breaks.map(b=>b.grund))===J(['anker-sprung','bezug-sprung','sprung']) && r5.stat.createAnchor.length>=3 && (typen(r5)['tracking-verloren']||0)===1,
    `${r5.P.LOG.obs.length} Erfassungen, ${r5.stat.solver.length} Auswertungen, Brueche ${r5.P.LOG.breaks.map(b=>b.grund).join('/')}, ${r5.stat.createAnchor.length} Anker`);
  // --- ohne Schalter wie Stand 5
  chk('Ohne Schalter wie Stand 5: dieselben Erfassungen (LOG.obs bytegleich)', obsJ(r6)===obsJ(r5), `${r6.P.LOG.obs.length} / ${r5.P.LOG.obs.length}`);
  chk('Ohne Schalter wie Stand 5: dieselben Auftraege an den Schaetzer (Zeit, Erfassungen, Optionen)', J(r6.stat.solver)===J(r5.stat.solver), `${r6.stat.solver.length}`);
  chk('Ohne Schalter wie Stand 5: kein zusaetzliches readPixels (Folge, Groesse, Ziel gleich)', rpJ(r6)===rpJ(r5), `${r6.stat.readPixels.length} / ${r5.stat.readPixels.length}`);
  chk('Ohne Schalter wie Stand 5: keine neuen Anker (createAnchor zu denselben Zeiten)', J(r6.stat.createAnchor)===J(r5.stat.createAnchor), r6.stat.createAnchor.join(', '));
  chk('Ohne Schalter wie Stand 5: kein neuer Worker, kein Mess-Worker, kein devicemotion-Hoerer, kein Gyroscope', J(r6.stat.worker)===J(['schaetzer']) && !(r6.stat.hoerer.devicemotion||[]).length && r6.stat.gyro===0,
    r6.stat.worker.join(','));
  chk('Ohne Schalter wie Stand 5: Sitzungsanfrage gleich (keine depthTypeRequest)', J(r6.stat.anfrage)===J(r5.stat.anfrage) && !r6.stat.anfrage.depthSensing.depthTypeRequest);
  chk('Ohne Schalter wie Stand 5: Ereignisse und Brueche gleich (ohne die neuen ref-reset, emuliert, tiefe)', evJ(r6)===evJ(r5) && J(r6.P.LOG.breaks)===J(r5.P.LOG.breaks),
    `${r6.P.LOG.events.length} Ereignisse, neu: ref-reset ${T6['ref-reset']||0}, emuliert ${T6.emuliert||0}, tiefe ${T6.tiefe||0}`);
  chk('Ohne Schalter wie Stand 5: Ergebnis gleich (computeResult)', J(r6.P.LOG.result)===J(r5.P.LOG.result), r5.P.LOG.result && r5.P.LOG.result.room ? `${(r5.P.LOG.result.room.corners||[]).length} Ecken` : '');
  chk('Ohne Schalter wie Stand 5: Zustandszeilen in den 17 Spalten von Stand 5 gleich', z6.length===z5.length && z6.every((r,i)=>J(r.slice(0,17))===J(z5[i])), `${z6.length} Zeilen`);
  const gz=(r, art)=>Buffer.concat(Object.keys(r.dateien).filter(n=>new RegExp(`^${art}-\\d+\\.bin\\.gz$`).test(n)).sort().map(n=>gunzipSync(r.dateien[n])));
  const roh=(r, art)=>Buffer.concat(Object.keys(r.dateien).filter(n=>new RegExp(`^${art}-\\d+\\.h264$`).test(n)).sort().map(n=>r.dateien[n]));
  const t5=gz(r5, 'tiefe'), t6=gz(r6, 'tiefe'), v5=roh(r5, 'video'), v6=roh(r6, 'video');
  chk('Ohne Schalter wie Stand 5: Video und Tiefe der Aufnahme bytegleich (Tiefe Satz Version 1, 80 Byte), gleich viele Tiefe-Abfragen',
    v5.length>0 && v5.equals(v6) && t5.length>0 && t5.equals(t6) && r6.stat.tiefeAbfragen===r5.stat.tiefeAbfragen && man(r6).tiefe.kopf===80 && man(r6).tiefe.satzVersion===1,
    `Video ${v6.length} B, Tiefe ${t6.length} B, ${r6.stat.tiefeAbfragen} Abfragen`);
  const M6=man(r6);
  chk('Ohne Schalter: Aufnahme Version 2 mit mess false, Spalten ab ep k ms xr tq, ebenen.jsonl, keine Mess- und Bilddateien',
    M6 && M6.version===2 && M6.mess===false && J(M6.zustand.spalten.slice(17))===J(['ab','ep','k','ms','xr','tq']) && jsonl(r6, 'ebenen').length>0
    && !Object.keys(r6.dateien).some(n=>/^(imu|messung|segmente|bild)-/.test(n)) && z6.every(r=>r[19]===-1),
    M6 ? `${jsonl(r6, 'ebenen').length} Ebenenzeilen` : 'kein Manifest');
  chk('Ohne Schalter: ref-reset (mit transform) und jeder Wechsel von emulatedPosition als Ereignis (9.4 Punkt 7f)',
    T6['ref-reset']===1 && T6.emuliert===2 && r6.P.LOG.events.find(e=>e.type==='ref-reset').transform.length===7 && J(r6.P.LOG.events.filter(e=>e.type==='emuliert').map(e=>e.an))===J([true,false]));
  // --- Epoche und Abschnittszaehler (3.2): live = Rekonstruktion offline (karte/fixtures/lib.mjs epochen)
  const epOffline=(rows, breaks)=>{ const br=breaks.map(b=>b.t).sort((a,b)=>a-b), ep=[0]; let e=0, j=0; while(j<br.length && br[j]<=rows[0][0]) j++;
    for(let i=1;i<rows.length;i++){ const a=rows[i-1], b=rows[i]; let neu=[8,9,10,11].some(c=>a[c]!==b[c]);
      while(j<br.length && br[j]<=b[0]){ if(br[j]>a[0]) neu=true; j++; } if(neu) e++; ep.push(e); } return ep; };
  for(const [name, r, z] of [['ohne Schalter', r6, z6], ['karte=1', rk, zk]]){
    const soll=epOffline(z, r.P.LOG.breaks), ist=z.map(x=>x[18]), ab=z.map(x=>x[17]);
    chk(`Epoche (${name}): ep der Zeilen = Rekonstruktion offline aus T und LOG.breaks (+1 je T-Wechsel bzw. Bruch, hoechstens +1 je Zeile)`,
      J(ist)===J(soll) && Math.max(...ist)>=2 && ab.every((v,i)=>!i || v>=ab[i-1]) && ab[ab.length-1]===r.P.LOG.breaks.length+(typen(r)['pose-sprung']||0),
      `Epochen 0..${Math.max(...ist)}, ab bis ${ab[ab.length-1]}`); }
  chk('Zustand: xr zaehlt die XR-Bilder seit der vorigen Zeile, ms steht in jeder Zeile', z6.slice(1).every(r=>r[21]>=1) && z6.reduce((s,r)=>s+r[21], 0)<=Math.round(DAUER*30) && z6.every(r=>Number.isFinite(r[20])),
    `xr Summe ${z6.reduce((s,r)=>s+r[21], 0)}`);
  // --- ?karte=1: Bild-Worker, Pool, Segmente, Tiefe je Auftrag, alte Pipeline unveraendert
  const B=rk.P.LOG.bild, Tk=typen(rk), kz=zk.filter(r=>r[19]>=0);
  chk('karte=1: alte Pipeline unveraendert (Erfassungen, Schaetzer-Auftraege, readPixels, Anker gleich Stand 5)',
    obsJ(rk)===obsJ(r5) && J(rk.stat.solver)===J(r5.stat.solver) && rpJ(rk)===rpJ(r5) && J(rk.stat.createAnchor)===J(r5.stat.createAnchor));
  chk('karte=1: Bild-Worker (geo + bildwerk), Karten-Worker (geo + kartenwerk) und Schaetzer, kein Mess-Worker, kein devicemotion; depthTypeRequest raw', J(rk.stat.worker)===J(['schaetzer','bild','karte']) && !(rk.stat.hoerer.devicemotion||[]).length
    && J(rk.stat.anfrage.depthSensing.depthTypeRequest)===J(['raw']) && rk.P.LOG.tiefe.erhalten==='raw');
  chk('karte=1: jedes ausgewertete Bild mit Bezug ist Auftrag k = 0, 1, 2 ... (Spalte k), Pool nie leer, nichts verdraengt',
    B.gesendet===kz.length && kz.every((r,i)=>r[19]===i) && B.poolLeer===0 && B.verdraengt===0 && B.gesendet>100, `${B.gesendet} Auftraege, ${B.ergebnisse} Ergebnisse`);
  chk('karte=1: jeder Auftrag ist beantwortet (Ergebnisse + verdraengt + Fehler + hoechstens 3 offen (Pool) = gesendet)', B.ergebnisse+B.verdraengt+B.fehler<=B.gesendet && B.gesendet-(B.ergebnisse+B.verdraengt+B.fehler)<=3 && B.m3==='raumskizze-segmente.js');
  const anK=new Map(rk.stat.bildAn.map(a=>[a.k, a]));
  chk('karte=1: Auftrag traegt t, ep und vi seiner Zeile, RGBA 288×640 im Pool-Puffer, senk jedes 2. Bild', kz.every(r=>{ const a=anK.get(r[19]); return a && a.ta===r[0] && a.ep===r[18] && a.vi===r[15] && a.bytes===IW*IH*4 && a.senk===(a.k%2===0); }));
  // segmente.bin (live 3.11): je Ergebnis ein Satz, Lage in 1/8 px, Klasse und rechtwinklige Klasse
  const SB=bin(rk, 'segmente'), erg=new Map(rk.stat.bildVon.filter(m=>m.typ==='ergebnis').map(m=>[m.k, m])); let o=0, saetze=0, segN=0, abw=0, klOk=true;
  while(o+14<=SB.length){ const k=SB.readUInt32LE(o), n=SB.readUInt16LE(o+8), w=SB.readUInt16LE(o+10), h=SB.readUInt16LE(o+12), m=erg.get(k);
    if(!m || m.n!==n || w!==IW || h!==IH) klOk=false;
    for(let i=0;i<n && m;i++){ const p=o+14+10*i; for(let c=0;c<4;c++) abw=Math.max(abw, Math.abs(SB.readInt16LE(p+2*c)/8-m.seg[i*G.KG.SEG+c]));
      const kb=SB.readUInt8(p+9); if((kb&3)!==m.cls[i] || (kb>>2)-1!==m.man[i] || SB.readUInt8(p+8)!==Math.min(255, Math.round(m.seg[i*G.KG.SEG+4]/4))) klOk=false; }
    o+=14+10*n; saetze++; segN+=n; }
  chk('karte=1: segmente.bin - ein Satz je Ergebnis, Enden auf 1/16 px, Klasse, man und Salienz wie vom Worker', o===SB.length && saetze===B.ergebnisse && segN===B.segmente && klOk && abw<=1/16+1e-9,
    `${saetze} Saetze, ${segN} Segmente, ${SB.length} B, groesste Abweichung ${f3(abw)} px`);
  chk('karte=1: bild.jsonl mit Antwortzeit und Worker-Zeiten je Ergebnis', jsonl(rk, 'bild').length===B.ergebnisse && jsonl(rk, 'bild').every(x=>Number.isFinite(x.antwort) && x.ms && 'elsed' in x.ms));
  const TB=Buffer.concat(Object.keys(rk.dateien).filter(n=>/^tiefe-\d+\.bin\.gz$/.test(n)).sort().map(n=>gunzipSync(rk.dateien[n])));
  let to=0, tn=0, tOk=true; const kVonZeile=new Map(zk.map(r=>[r[19], r]));
  while(to+96<=TB.length){ const w=TB.readUInt16LE(to+8), h=TB.readUInt16LE(to+10), k=TB.readInt32LE(to+84), z=kVonZeile.get(k);
    if(TB.readUInt8(to+80)!==1 || TB.readUInt16LE(to+82)!==1 || !z || z[22]!==1 || TB.readUInt32LE(to)!==(z[15]>>>0)) tOk=false; to+=96+w*h*2; tn++; }
  const tq=new Set(zk.map(r=>r[22])), tEv=rk.P.LOG.events.filter(e=>e.type==='tiefe');
  chk('karte=1: Tiefe je Auftrag (auch ohne Video), Satzkopf v2 (96 Byte: Art raw, Grundcode, k), tq 1/0/-1 und Ereignis tiefe mit Grund',
    to===TB.length && tOk && tn===zk.filter(r=>r[22]===1).length && [1, 0, -1].every(c=>tq.has(c)) && tEv.some(e=>!e.an && e.grund==='null') && tEv.some(e=>!e.an && e.grund==='fehler'),
    `${tn} Saetze, tq ${[...tq].join('/')}, Ereignisse ${tEv.map(e=>e.an ? 'an' : e.grund).join(',')}`);
  const mitLuma=rk.stat.bildVon.filter(m=>m.typ==='ergebnis' && m.luma).length, ansK=rk.P.LOG.events.filter(e=>e.type==='ansicht').map(e=>e.modus);
  chk('karte=1: Ansicht „Segmente“ (4. Ansicht) - der Worker liefert dann das Luma desselben Bilds, gezeichnet ohne Fehler', J(ansK)===J(['luma','gradient','segmente']) && mitLuma>50 && rk.stat.segZeichnen>50,
    `${mitLuma} Bilder mit Luma, ${rk.stat.segZeichnen} gezeichnet`);
  const Mk=man(rk);
  chk('karte=1: Manifest v2 nennt segmente.bin, bild.jsonl, Tiefe (Anforderung raw, Kopf 96) und schalter', Mk && Mk.schalter.karte && Mk.segmente && Mk.segmente.bilder>0 && Mk.tiefe.kopf===96 && Mk.tiefe.anforderung==='raw' && Mk.dateien.includes('segmente.bin'));
  // --- Bild-Worker faellt aus, schweigt, wirft, ist langsam: die alte Pipeline merkt nichts (Erfassungen bis 5,5 s = Stand 5)
  const vor=(r, t=5.5)=>J(r.P.LOG.obs.filter(x=>x.t<t).map(x=>ohne(x, ['final'])));
  const Bv=r=>r.P.LOG.bild, nk=r=>zeilen(r).filter(x=>x[19]>=0).length;
  chk('Ausfall Bild-Worker (onerror): Ereignis, keine weiteren Auftraege, alte Pipeline gleich Stand 5', vor(rf1)===vor(r5) && (typen(rf1)['bild-worker-fehler']||0)===1 && Bv(rf1).gesendet===1,
    `${Bv(rf1).gesendet} gesendet; verglichen ${r5.P.LOG.obs.filter(x=>x.t<5.5).length} Erfassungen bis 5,5 s`);
  chk('Ausfall Bild-Worker (schweigt): Pool nach 3 Bildern leer, poolLeer zaehlt, alte Pipeline gleich Stand 5', vor(rf2)===vor(r5) && Bv(rf2).gesendet===3 && Bv(rf2).ergebnisse===0 && Bv(rf2).poolLeer>10,
    `${Bv(rf2).poolLeer} ohne Puffer`);
  chk('Bild-Worker wirft je Bild: Fehler gezaehlt, Puffer kommen zurueck (Pool nie leer), alte Pipeline gleich Stand 5', vor(rf3)===vor(r5) && Bv(rf3).fehler>=Bv(rf3).gesendet-2 && Bv(rf3).poolLeer===0 && Bv(rf3).ergebnisse===0,
    `${Bv(rf3).fehler} Fehler`);
  chk('Bild-Worker langsam (400 ms je Bild): latest-wins verdraengt, Auftraege bilanziert, alte Pipeline gleich Stand 5',
    vor(rl)===vor(r5) && Bv(rl).verdraengt>5 && Bv(rl).ergebnisse>3 && Bv(rl).gesendet-(Bv(rl).ergebnisse+Bv(rl).verdraengt)<=3 && Bv(rl).gesendet===nk(rl),
    `gesendet ${Bv(rl).gesendet}, Ergebnisse ${Bv(rl).ergebnisse}, verdraengt ${Bv(rl).verdraengt}, ohne Puffer ${Bv(rl).poolLeer}`);
  // --- Stand 7, ?karte=1: Karten-Worker (9.3) - Eingaenge wie T1, Takt, karte.jsonl, Nachspiel (10.9), Ausfall (5.2)
  {
    const KA=rk.stat.karteAn, KV=rk.stat.karteVon, Lk=rk.P.LOG.karte, zk7=jsonl(rk, 'zustand'), kj=jsonl(rk, 'karte'), Mk7=man(rk);
    const posK=KA.filter(m=>m.typ==='pose'), reK=KA.filter(m=>m.typ==='rechne'), ruK=KV.filter(m=>m.typ==='runde'), erK=KA.filter(m=>m.typ==='erfassung');
    chk('karte=1: Karten-Worker startet einmal mit dem ersten Bild; je Zustandszeile genau eine PoseZeile (t und ep der Zeile)',
      KA.filter(m=>m.typ==='start').length===1 && posK.length===zk7.length && posK.every((p,i)=>p.zt===zk7[i][0] && p.ep===zk7[i][18]), `${posK.length} Zeilen`);
    const tObs=new Set(rk.P.LOG.obs.map(x=>x.t));
    chk('karte=1: jede Erfassung geht mit id 0, 1, 2 ... und ihrem t an die Karte', erK.length>=10 && erK.length===rk.P.LOG.obs.filter(x=>x.ra && x.rb && !x.undone && x.suspect!==true).length
      && erK.every((e,i)=>e.id===i && tObs.has(e.et)), `${erK.length} Erfassungen`);
    const t0=posK.length ? posK[0].zt : 0, t1=posK.length ? posK[posK.length-1].zt : 0, soll=Math.max(0, Math.ceil((t1-t0)/0.5)-1);
    const kjR=kj.filter(z=>z.runde), aus=kjR.reduce((n,z)=>n+(z.ausgefallen|0), 0);
    chk('karte=1: Takt je 0,5 s Sitzungszeit (Runden + ausgefallene = Takte), Schlussrunde zuletzt, jede Runde beantwortet',
      reK.length>=10 && Math.abs(reK.length-1+aus-soll)<=1 && reK[reK.length-1].schluss===true && ruK.length===reK.length && ruK[ruK.length-1].schluss===true,
      `${reK.length-1} Runden + ${aus} ausgefallen, ${soll} Takte`);
    chk('karte=1: karte.jsonl - RundeKopf je Runde (kopf-Pruefsumme), KarteStand alle 2 s und nach der Schlussrunde; Manifest nennt Datei und Quelle',
      kjR.length===ruK.length && kjR.every(z=>typeof z.runde.kopf==='string') && kjR[kjR.length-1].schluss===true && kj.filter(z=>z.stand).length>=2 && !!kj[kj.length-1].stand
      && Mk7.dateien.includes('karte.jsonl') && Mk7.karte && Mk7.karte.quelle==='erfassungen' && Mk7.karte.zeilen===kj.length, `${kjR.length} Runden, ${kj.filter(z=>z.stand).length} Staende`);
    chk('karte=1: KarteStand serialisierbar (structuredClone und JSON), kein Ausfall, kein Fehler im Lauf',
      ruK.every(m=>JSON.parse(JSON.stringify(m.stand)).runde===m.stand.runde) && Lk.runden===ruK.length && !Lk.aus.length && Lk.fehler===0 && !(typen(rk)['karte-fehler']), JSON.stringify(Lk.letzte));
    const Tk=rk.P.LOG.timings;
    chk('karte=1: gemessen werden Runde im Worker, Antwort und drawKarte (Protokoll timings.karte, karteAntwort, karteDraw)', Tk.karte.length===ruK.length && Tk.karteAntwort.length>=ruK.length-1
      && Array.isArray(Tk.karteDraw), `drawKarte ${Tk.karteDraw.length} Bilder, Median ${f3(Tk.karteDraw.slice().sort((x,y)=>x-y)[Tk.karteDraw.length>>1] ?? NaN)} ms [M, Node]`);
    chk('ohne Schalter und mit mess=1: kein Karten-Worker, kein karte.jsonl, kein LOG.karte', !r6.stat.karteAn.length && !rm.stat.karteAn.length && !jsonl(r6, 'karte').length
      && r6.P.LOG.karte===undefined && !man(r6).dateien.includes('karte.jsonl'));
    // Nachspiel (10.9): dieselbe Aufnahme durch raumskizze-karte.mjs mit --runden karte.jsonl - gleiche kopf-Pruefsumme je Runde
    const {mkdtempSync, writeFileSync, rmSync}=await import('node:fs'), {tmpdir}=await import('node:os'), {join}=await import('node:path');
    const dir=mkdtempSync(join(tmpdir(), 'raumskizze-stand7-'));
    try{
      for(const [name, re] of [['manifest.json', /^manifest\.json$/], ['zustand.jsonl', /^zustand-\d+\.jsonl$/], ['anker.jsonl', /^anker-\d+\.jsonl$/], ['ebenen.jsonl', /^ebenen-\d+\.jsonl$/],
        ['karte.jsonl', /^karte-\d+\.jsonl$/]]){ const teile=Object.keys(rk.dateien).filter(n=>re.test(n)).sort().map(n=>rk.dateien[n]); if(teile.length) writeFileSync(join(dir, name), Buffer.concat(teile.map(x=>Buffer.from(x)))); }
      writeFileSync(join(dir, 'protokoll.json'), JSON.stringify(rk.P.LOG));
      const T1=await import('../raumskizze-karte.mjs'), {G:G1, quellen}=await T1.ladeSeite(process.env.RAUMSKIZZE_HTML ? {html:process.env.RAUMSKIZZE_HTML} : {});
      const A=T1.ladeAufnahme(dir), lauf=await T1.laufen(G1, A, {quelle:'erfassungen', ohne:['tiefe', 'ebenen'], runden:A.karte.filter(z=>z.runde)});
      const K1=lauf.runden.map(r=>r.kopf.kopf), K0=kjR.map(z=>z.runde.kopf), gleich=K0.filter((k,i)=>k===K1[i]).length;
      chk('karte=1: Nachspiel mit raumskizze-karte.mjs --runden karte.jsonl: alle Module aus der Seite, gleiche Rundenzahl, kopf gleich in >= 99 % der Runden (10.9)',
        Object.values(quellen).every(q=>q==='Seite') && K1.length===K0.length && gleich>=0.99*K0.length, `${gleich}/${K0.length} gleich, ${K1.length} nachgespielt`
        +(()=>{ const i=K0.findIndex((k,j)=>k!==K1[j]); if(i<0) return ''; const r=kjR[i].runde, q=lauf.runden[i] && lauf.runden[i].kopf, k=x=>x ? `${x.runde}@${f3(x.t)} tPose ${f3(x.tPose)} ep ${x.epoche}` : '–';
          return ` · erste Abweichung Runde ${i+1}: Geraet ${k(r)}, Nachspiel ${k(q)}, danach ${k(lauf.runden[i+1] && lauf.runden[i+1].kopf)}`; })());
    } finally { rmSync(dir, {recursive:true, force:true}); }
    // ?quelle=beide: jedes Bild-Ergebnis geht als volles BildErgebnis (camTo, proj, dir, ep) an die Karte, Erfassungen ebenso
    const bK=kb.stat.karteAn.filter(m=>m.typ==='bild'), bE=kb.stat.bildVon.filter(m=>m.typ==='ergebnis');
    chk('karte=1&quelle=beide: jedes Bild-Ergebnis (mit camTo, proj, dir, ep) und jede Erfassung an die Karte, Runden ohne Fehler, alte Pipeline gleich Stand 5',
      vor(kb)===vor(r5) && bE.length>5 && bK.length===bE.length && bE.every(m=>m.camTo && m.proj && m.dir && Number.isFinite(m.ep)) && kb.stat.karteAn.some(m=>m.typ==='erfassung')
      && kb.P.LOG.karte.runden>=10 && kb.P.LOG.karte.fehler===0 && !kb.P.LOG.karte.aus.length && man(kb).karte.quelle==='beide', `${bK.length} Bilder, ${kb.P.LOG.karte.runden} Runden`);
    // Ausfall (5.2): wirft aussen (onerror), schweigt, wirft in jeder Runde - Hinweis „Karte ausgefallen“, alte Pipeline gleich Stand 5
    const hinweisAus=r=>r.P.LOG.events.some(e=>e.type==='hinweis' && /Karte ausgefallen/.test(e.text));
    const ausG=r=>r.P.LOG.karte.aus.map(a=>a.grund);
    chk('Ausfall Karten-Worker (onerror): Ereignis, Worker weg, Hinweis „Karte ausgefallen“, alte Pipeline gleich Stand 5', vor(kf1)===vor(r5) && (typen(kf1)['karte-worker-fehler']||0)===1
      && J(ausG(kf1))===J(['worker']) && hinweisAus(kf1) && kf1.stat.karteVon.filter(m=>m.typ==='runde').length===0, J(ausG(kf1)));
    chk('Ausfall Karten-Worker (schweigt): nach 2 s ohne Runde ausgefallen, Takte fallen aus statt sich zu stauen, alte Pipeline gleich Stand 5', vor(kf2)===vor(r5) && ausG(kf2)[0]==='still'
      && hinweisAus(kf2) && kf2.stat.karteAn.filter(m=>m.typ==='rechne').length<=2 && kf2.P.LOG.karte.ausgefallen>=5, `${kf2.P.LOG.karte.ausgefallen} ausgefallen`);
    chk('Karten-Worker wirft in jeder Runde: Fehler gefangen, Hinweis, keine Runde in karte.jsonl, weitere Takte, alte Pipeline gleich Stand 5', vor(kf3)===vor(r5) && ausG(kf3)[0]==='fehler'
      && hinweisAus(kf3) && kf3.P.LOG.karte.fehler>=5 && !jsonl(kf3, 'karte').filter(z=>z.runde).length, `${kf3.P.LOG.karte.fehler} Fehler`);
  }
  // --- ?mess=1 (S6-M): Anker nach Weg, Aenderungen, an, IMU, readPixels, Loeser, Marken
  const Lm=rm.P.LOG, Tm=typen(rm), mg=jsonl(rm, 'messung'), imu=jsonl(rm, 'imu'), anz=jsonl(rm, 'anker'), Mm=man(rm);
  const obsAn=Lm.obs.filter(x=>Array.isArray(x.an));
  chk('mess=1: alte Pipeline unveraendert (Erfassungen ohne das Feld an, Schaetzer, readPixels von Stand 5)', obsJ(rm, true)===obsJ(r5, true) && J(rm.stat.solver)===J(r5.stat.solver) && rpJ(rm, true)===rpJ(r5));
  chk('mess=1: Erfassungen und Zeilen tragen an = [id, x, y, z, psi] zum naechsten Messanker', obsAn.length>=10 && obsAn.every(x=>x.an.length===5) && zm.filter(r=>Array.isArray(r[23])).length>50 && Mm.zustand.spalten[23]==='an',
    `${obsAn.length} von ${Lm.obs.length} Erfassungen`);
  const rpM=rm.stat.readPixels.filter(x=>!((x.w===IW && x.h===IH) || (x.w===256 && x.h===256))), rpZ=mg.filter(x=>x.typ==='readPixels');
  chk('mess=1: readPixels alle 2 s abwechselnd synchron/PBO in 480×1080, einmal je Minute die volle Kameratextur; PBO ueber Zaun und getBufferSubData',
    rpM.length===rpZ.length && rpZ.some(x=>x.art==='sync' && x.w===480) && rpZ.some(x=>x.art==='pbo' && x.w===480 && x.bilder>=1) && rpZ.filter(x=>x.w===864 && x.h===1920).length===1
    && rm.stat.getBufferSubData===rpZ.filter(x=>x.art==='pbo' && !x.fehler).length && rpZ.length>=9,
    `${rpZ.length} Lesungen (${rpZ.filter(x=>x.art==='sync').length} sync, ${rpZ.filter(x=>x.art==='pbo').length} pbo)`);
  const loe=mg.filter(x=>x.typ==='loeser');
  chk('mess=1: Mess-Worker mit G.ldl* - Loeserzeit waehrend (bei 10 s) und einmal danach, je 4 Faelle', J(rm.stat.worker)===J(['schaetzer','mess']) && loe.filter(x=>x.phase==='waehrend').length===4
    && loe.filter(x=>x.phase==='danach').length===4 && loe.every(x=>x.ok), loe.map(x=>x.fall+'/'+x.phase).join(' '));
  chk('mess=1: Takt je 10 s (XR-Rate, ms-Verteilung)', mg.filter(x=>x.typ==='takt').length===2 && mg.filter(x=>x.typ==='takt').every(x=>x.xrHz>29 && x.n>=290));
  const dm=imu.filter(x=>!x.q), gy=imu.filter(x=>x.q==='gyro');
  chk('mess=1: devicemotion und Gyroscope in imu.jsonl, t in der Zeitbasis des Zustands; Hoerer nach dem Ende entfernt',
    dm.length>=1000 && gy.length>=1000 && dm.every(x=>Math.abs(x.t-(x.ts-1000)/1000)<1e-3 && x.rr.length===3 && x.ag.length===3) && !(rm.stat.hoerer.devicemotion||[]).length && rm.stat.gyro===1,
    `${dm.length} devicemotion, ${gy.length} Gyroscope`);
  const anl=anz.reduce((m,r)=>{ const a=String(r[1]).split(':')[0]; m[a]=(m[a]||0)+1; return m; }, {});
  chk('mess=1: anker.jsonl mit Aenderungen (> 1 mm / 0,05°), Vorlauf 1 s und Nachlauf 2 s um Spruenge/Luecke/ref-reset; Messanker nach Weg (≤ 16)',
    anl.aenderung>=1 && anl.vor>=10 && anl.nach>=30 && Lm.netz.gesetzt>=2 && Lm.netz.max<=16+2, `Anlaesse ${J(anl)}, ${Lm.netz.gesetzt} Messanker`);
  const mk=Lm.events.filter(e=>e.type==='marke');
  chk('mess=1: Knopf Marke - ohne Bodentreffer Hinweis, sonst Ereignis marke {id, p (local, Boden), an, pAn}', (Tm['marke-ohne-treffer']||0)===1 && mk.length===1 && Math.abs(mk[0].p[1]+1.45)<1e-3
    && Array.isArray(mk[0].an) && Array.isArray(mk[0].pAn) && mk[0].pAn.length===4, mk.length ? J(mk[0]) : '');
  chk('mess=1: Manifest v2 mit mess true, imu.jsonl und messung.jsonl; kein Bild-Worker', Mm && Mm.mess===true && Mm.dateien.includes('imu.jsonl') && Mm.dateien.includes('messung.jsonl') && !rm.stat.worker.includes('bild'));
  // --- Nachbesserung 1: Auftrag, bild.jsonl und segmente.bin tragen das t der Zeile, nicht die Zeit beim Senden
  // (die Uhr der Attrappe steht in rz nicht still: je Tiefe-Abfrage 3 ms, je Videobild 2 ms).
  const zz=zeilen(rz), zzK=new Map(zz.filter(r=>r[19]>=0).map(r=>[r[19], r])), anZ=rz.stat.bildAn, bjz=jsonl(rz, 'bild'), SBz=bin(rz, 'segmente');
  let oz=0, nSz=0, tSz=true;
  while(oz+14<=SBz.length){ const k=SBz.readUInt32LE(oz), n=SBz.readUInt16LE(oz+8), z=zzK.get(k); if(!z || SBz.readFloatLE(oz+4)!==Math.fround(z[0])) tSz=false; oz+=14+10*n; nSz++; }
  const spaet=anZ.filter(a=>zzK.has(a.k) && (a.t-1000)/1000-zzK.get(a.k)[0]>=0.0025).length;
  chk('Auftrag.t = t seiner Zeile, auch wenn Video und Tiefe davor Zeit kosten; bild.jsonl t und segmente.bin f32 t ebenso',
    anZ.length>=60 && anZ.every(a=>zzK.has(a.k) && a.ta===zzK.get(a.k)[0]) && bjz.length>=50 && bjz.every(x=>zzK.has(x.k) && x.t===zzK.get(x.k)[0])
    && oz===SBz.length && nSz===bjz.length && tSz && spaet===anZ.length,
    `${anZ.length} Auftraege, ${bjz.length} Ergebnisse; gesendet ≥ 2,5 ms nach t der Zeile: ${spaet}`);
  // --- Nachbesserung 2: die volle Lesung wechselt fest sync/pbo (eigener Zaehler), unabhaengig von der Zahl kleiner Lesungen
  const rpG=jsonl(rg, 'messung').filter(x=>x.typ==='readPixels'), vollG=rpG.filter(x=>x.w===864 && x.h===1920), kleinG=rpG.filter(x=>x.w===480 && x.h===1080);
  chk('mess=1: ueber die Minutengrenze zwei volle Lesungen, erst sync, dann pbo (Zaun, getBufferSubData); kleine Lesungen ebenso beide Arten',
    J(vollG.map(x=>x.art))===J(['sync','pbo']) && vollG.every(x=>!x.fehler && Number.isFinite(x.ms)) && Number.isFinite(vollG[1].msWarte) && vollG[1].bilder>=1
    && Math.floor(vollG[1].t/60)===Math.floor(vollG[0].t/60)+1 && kleinG.some(x=>x.art==='sync') && kleinG.some(x=>x.art==='pbo')
    && rg.stat.getBufferSubData===rpG.filter(x=>x.art==='pbo' && !x.fehler).length,
    `voll ${vollG.map(x=>x.art+' bei '+x.t.toFixed(2)+' s').join(', ')}; klein ${kleinG.filter(x=>x.art==='sync').length} sync / ${kleinG.filter(x=>x.art==='pbo').length} pbo`);
  // --- mess=1&tiefe=raw: raw-Anforderung und depthType je Satz auch ohne karte (Schalter ausdruecklich; mess=1 allein siehe unten)
  const TBg=gz(rg, 'tiefe'), Mg=man(rg); let og=0, nTg=0, okTg=true;
  while(og+96<=TBg.length){ const w=TBg.readUInt16LE(og+8), h=TBg.readUInt16LE(og+10); if(TBg.readUInt8(og+80)!==1 || TBg.readUInt16LE(og+82)!==1 || TBg.readInt32LE(og+84)!==-1) okTg=false; og+=96+w*h*2; nTg++; }
  chk('mess=1&tiefe=raw: depthTypeRequest raw, Tiefe je Videobild als Satz v2 (96 Byte, Art raw, k = -1), Manifest raw angefordert und erhalten',
    J(rg.stat.anfrage.depthSensing.depthTypeRequest)===J(['raw']) && nTg>0 && og===TBg.length && okTg && Mg && Mg.tiefe.kopf===96 && Mg.tiefe.satzVersion===2
    && Mg.tiefe.anforderung==='raw' && Mg.tiefe.erhalten==='raw' && J(rg.stat.worker)===J(['schaetzer','mess']), `${nTg} Saetze`);
  // --- Korrektur 1: mess=1 OHNE tiefe=raw fordert raw an (die Attrappe liefert raw nur auf depthTypeRequest);
  // ohne Schalter bleibt es bei Stand 5 (Satz v1, 80 Byte, oben).
  const TBm=gz(rm, 'tiefe'), ssM=rm.P.LOG.events.find(e=>e.type==='sitzung-start'); let om=0, nTm=0, okTm=true;
  while(om+96<=TBm.length){ const w=TBm.readUInt16LE(om+8), h=TBm.readUInt16LE(om+10); if(TBm.readUInt8(om+80)!==1 || TBm.readUInt16LE(om+82)!==1 || TBm.readInt32LE(om+84)!==-1) okTm=false; om+=96+w*h*2; nTm++; }
  chk('mess=1 ohne tiefe=raw: depthTypeRequest raw, Tiefe je Videobild als Satz v2 (96 Byte, Art raw, k = -1), Manifest tiefe.anforderung raw (Kopf 96), erhalten raw',
    J(rm.stat.anfrage.depthSensing.depthTypeRequest)===J(['raw']) && rm.tiefeArt==='raw' && nTm>0 && om===TBm.length && okTm && Mm.tiefe.kopf===96 && Mm.tiefe.satzVersion===2
    && Mm.tiefe.anforderung==='raw' && Mm.tiefe.erhalten==='raw' && Mm.schalter.tiefe==='raw' && !!ssM && ssM.depthTypeRequest==='raw',
    `${nTm} Saetze, Anfrage ${J(rm.stat.anfrage.depthSensing.depthTypeRequest)}, Kopf ${Mm.tiefe.kopf}`);
  // --- Korrektur 2: manifest.dateien nennt nur Dateien mit Inhalt (die recTar auch packt). Familie = OPFS-Teildateien
  // mit mehr als 0 Byte, Teilnummer entfernt (zustand-0.jsonl -> zustand.jsonl).
  const fam=r=>[...new Set(Object.keys(r.dateien).filter(n=>r.dateien[n].length>0).map(n=>n.replace(/-\d+(?=\.)/, '')))].sort();
  const Md=man(rd), famD=fam(rd), leerD=Md ? Md.dateien.filter(n=>!famD.includes(n)) : [];
  chk('mess=1 ohne devicemotion (und ohne Gyroscope, ohne Ebenen): manifest.dateien ohne imu.jsonl und ebenen.jsonl, keine Datei ohne Inhalt; messung.jsonl da',
    Md && Md.mess===true && !Md.dateien.includes('imu.jsonl') && !Md.dateien.includes('ebenen.jsonl') && !leerD.length && Md.dateien.includes('messung.jsonl') && famD.includes('messung.jsonl')
    && Md.imu.zeilen===0 && Md.ebenen.zeilen===0 && rd.stat.gyro===0 && J(rd.stat.worker)===J(['schaetzer','mess']),
    Md ? `dateien ${J(Md.dateien)}${leerD.length ? ', ohne Inhalt '+J(leerD) : ''}` : 'kein Manifest');
  const abwD=Object.entries({r6,rk,rm,rf1,rf2,rf3,rl,rz,rg,rd}).map(([i, r])=>{ const M=man(r), ist=fam(r); if(!M) return `Lauf ${i}: kein Manifest`;
    const soll=[...M.dateien].sort(); return J(soll)===J(ist) ? '' : `Lauf ${i}: genannt ohne Inhalt ${J(soll.filter(n=>!ist.includes(n)))}, mit Inhalt ungenannt ${J(ist.filter(n=>!soll.includes(n)))}`; });
  chk('Manifest (alle Laeufe ab Stand 6): dateien = genau die Dateien mit Inhalt (auch segmente.bin/bild.jsonl bei stummem Bild-Worker)', abwD.every(x=>!x),
    abwD.filter(Boolean)[0] || `10 Laeufe; ohne segmente.bin: ${[rf1,rf2,rf3].filter(r=>!man(r).dateien.includes('segmente.bin')).length} von 3 Ausfaellen`);
}
}

// Bild-Worker echt (worker_threads): die Huelle laeuft ohne DOM, Puffer gehen per Transfer hin und zurueck,
// latest-wins verdraengt bei Stau; Mac-Zeit je Bild [M].
{
  const src=pick(probe,'geo')+'\n'+probe.match(/<script id="bildwerk" type="text\/plain">([\s\S]*?)<\/script>/)[1];
  const code=`const {parentPort}=require('node:worker_threads'); globalThis.postMessage=(m,t)=>parentPort.postMessage(m,t);\n${src}\nparentPort.on('message', d=>onmessage({data:d}));`;
  const w=new Worker(code, {eval:true}), msgs=[];
  const warte=f=>new Promise(res=>{ const h=m=>{ msgs.push(m); if(f(msgs)){ w.off('message', h); res(); } }; w.on('message', h); });
  const bereit=warte(m=>m.some(x=>x.typ==='bereit'));
  await bereit;
  const cam=lookAt([3.9,1.45,2.0],[3.9,2.4,0.45]), g=render(cam, 4243, 0.5), auftrag=k=>{ const px=new Uint8Array(IW*IH*4); for(let i=0;i<IW*IH;i++){ const v=Math.max(0, Math.min(255, Math.round(g[i]))); px[4*i]=px[4*i+1]=px[4*i+2]=v; px[4*i+3]=255; }
    return {typ:'bild', k, vi:-1, t:k, ep:0, fmt:'rgba', w:IW, h:IH, buf:px.buffer, voll:null, camTo:cam, proj:PROJ, flipY:false, senk:k%2===0}; };
  const a0=auftrag(0); w.postMessage(a0, [a0.buf]);
  const weg=a0.buf.byteLength===0;
  await warte(m=>m.some(x=>x.typ==='ergebnis' && x.k===0));
  const e0=msgs.find(x=>x.typ==='ergebnis' && x.k===0), soll=G.bild(G.bildNeu({}), auftrag(0));
  // Stau: 6 Auftraege auf einmal - einer rechnet, die uebrigen verdraengen sich bis auf den letzten
  for(let k=1;k<=6;k++){ const a=auftrag(k); w.postMessage(a, [a.buf]); }
  await warte(m=>m.filter(x=>(x.typ==='ergebnis' || x.typ==='verdraengt') && x.k>=1).length>=6);
  const n1=msgs.filter(x=>x.k>=1), ms=[];
  for(let k=7;k<27;k++){ const a=auftrag(k); w.postMessage(a, [a.buf]); await warte(m=>m.some(x=>x.typ==='ergebnis' && x.k===k)); ms.push(msgs.find(x=>x.typ==='ergebnis' && x.k===k).ms.gesamt); }
  await w.terminate();
  ms.sort((a,b)=>a-b);
  chk('Bild-Worker echt (worker_threads): Huelle startet ohne DOM, Transfer leert den Puffer, Ergebnis = G.bild im Hauptfaden, Puffer kommt zurueck',
    weg && !!e0 && e0.n===soll.n && e0.buf.byteLength===IW*IH*4 && e0.seg.length===soll.seg.length && e0.seg.every((v,i)=>Object.is(v, soll.seg[i])) && JSON.stringify(e0.senk)===JSON.stringify(soll.senk),
    `${e0 ? e0.n : '–'} Segmente`);
  chk('Bild-Worker echt: Stau von 6 Auftraegen - jeder kommt als Ergebnis oder verdraengt zurueck, mit Puffer', n1.length===6 && n1.every(x=>x.buf && x.buf.byteLength===IW*IH*4) && n1.filter(x=>x.typ==='verdraengt').length>=1,
    `${n1.filter(x=>x.typ==='ergebnis').length} Ergebnisse, ${n1.filter(x=>x.typ==='verdraengt').length} verdraengt`);
  chk('Bild-Worker echt: Rechenzeit je Bild 288×640 [M, Mac, Node]', ms.length===20, `Median ${f3(ms[10])} ms, 90 % ${f3(ms[18])} ms (Luma, ELSED, Einteilung, Gier, jedes 2. Bild Senkrechte)`);
}

// Die lz-string-Zeile muss byte-gleich zur App bleiben.
{
  const line=s=>s.split('\n').find(l=>l.startsWith('var LZString=function()'));
  chk('vendor: lz-string byte-gleich zu raumaufmass.html', !!line(probe) && line(probe)===line(app));
}

console.log(out.join('\n'));
console.log(ok ? '\nALLE CHECKS GRÜN' : '\nCHECKS ROT');
process.exit(ok ? 0 : 1);
