// Prueft den geo-Block von raumskizze-probe.html gegen synthetische Kameras
// und gerenderte Raeume mit bekannter Wahrheit. Eine Abweichung hier liegt am
// Code, nicht am Telefon. Zum Schluss geht die Skizze durch genau die
// Import-, Vorschlags- und Ausgleichsfunktionen von raumaufmass.html.
import {readFileSync} from 'node:fs';

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

// Die lz-string-Zeile muss byte-gleich zur App bleiben.
{
  const line=s=>s.split('\n').find(l=>l.startsWith('var LZString=function()'));
  chk('vendor: lz-string byte-gleich zu raumaufmass.html', !!line(probe) && line(probe)===line(app));
}

console.log(out.join('\n'));
console.log(ok ? '\nALLE CHECKS GRÜN' : '\nCHECKS ROT');
process.exit(ok ? 0 : 1);
