// raum-fliesen.js – Fliesen-Geometrie der Werkzeugfamilie: Formen, Rahmen,
// Schnitte, Fugen, Raum und Inseln (docs/adr/0001-familie-mit-geteilten-js-dateien.md).
// DOM-frei, läuft in node test/run.mjs wie im Browser. Unverändert aus dem
// früheren Block "tiles" von raumaufmass.html; legt globalThis.TILES an.
// Braucht: raum-kern.js (pointInPoly). Der Küchen-Kern rechnet mit dieser Geometrie.
"use strict";
// ================= Fliesen: Geometrie =================
// Reine Geometrie ohne DOM - laeuft in test/run.mjs genauso wie im Browser.
//
// Alle Fliesenlagen leben im RAUMRAHMEN: Ursprung in der ersten Ecke der
// ersten Wand, x-Achse entlang dieser Wand (ausgeglichene Form). Der Solver
// darf den Grundriss bei jeder neuen Messung frei verschieben und drehen -
// Weltkoordinaten waeren danach verrutscht, Rahmenkoordinaten nicht.
//
// Eine Chevron-Fliese ist ein Parallelogramm: zwei lange Kanten der Laenge l
// im Abstand w, die kurzen Kanten stehen unter dem Winkel angle (Grad) zur
// langen. 'L' und 'R' sind Spiegelbilder - ein Chevron braucht beide.
(()=>{
const D2R=Math.PI/180;
const TILE_DEF={w:150, l:850, angle:45, joint:2, edgeGap:0, expWidth:8, sameColor:0, thick:10};

const rotP=(p,c,s)=>({x:p.x*c-p.y*s, y:p.x*s+p.y*c});
const sub=(a,b)=>({x:a.x-b.x, y:a.y-b.y});
const dot=(a,b)=>a.x*b.x+a.y*b.y;
const crs=(a,b)=>a.x*b.y-a.y*b.x;
const len=a=>Math.hypot(a.x,a.y);
const unit=a=>{ const L=len(a)||1; return {x:a.x/L, y:a.y/L}; };
const normDeg=a=>{ a%=360; return a<0?a+360:a; };
// Der Raum ist der Aussenring; Inseln haengen als ring.holes daran (wie bei
// CORE.wallPolygon). Alle Ringe zusammen begrenzen die Flaeche.
const ringsOf=r=>r ? [r, ...(r.holes||[])] : [];

// Ecken im Fliesenrahmen (y wie im Raum nach unten, also auf dem Bildschirm im Uhrzeigersinn):
// p0-p1 lange Unterkante, p1-p2 kurze Schraegkante, p2-p3 lange Oberkante.
function tileKinds(d){ return d.shape==='chevron' ? (d.id==='legacy' ? ['L','R'] : [d.id+':L',d.id+':R']) : [d.id]; }
// Regelmäßige Formen: Höhe = √3/2 × Breite (Hexagon über Spitzen, Dreieck über Grundseite).
function regularTileDef(d){ return (d.shape==='hexagon'||d.shape==='triangle') ? {...d,w:d.l*Math.sqrt(3)/2} : d; }
function tileDef(spec,kind){ return regularTileDef((spec.set||[]).find(d=>tileKinds(d).includes(kind)) || {...spec,shape:'chevron'}); }
function tileOther(spec,kind){ if(kind==='L')return 'R'; if(kind==='R')return 'L'; const d=tileDef(spec,kind), ks=tileKinds(d); return ks.length===2 ? ks.find(k=>k!==kind) : kind; }
function tileArea(spec,kind){ return Math.abs(polyArea(tileShape(spec,kind))); }
function tileShape(spec, kind){
  const d=tileDef(spec,kind), w=d.w, l=d.l, k=w/Math.tan(d.angle*D2R);
  if(d.shape==='rectangle') return [{x:0,y:0},{x:l,y:0},{x:l,y:w},{x:0,y:w}];
  if(d.shape==='triangle') return [{x:0,y:w},{x:l/2,y:0},{x:l,y:w}];
  if(d.shape==='hexagon') return [{x:l/4,y:0},{x:3*l/4,y:0},{x:l,y:w/2},{x:3*l/4,y:w},{x:l/4,y:w},{x:0,y:w/2}];
  return (kind==='R'||kind.endsWith(':R'))
    ? [{x:0,y:0},{x:l,y:0},{x:l-k,y:w},{x:-k,y:w}]
    : [{x:0,y:0},{x:l,y:0},{x:l+k,y:w},{x:k,y:w}];
}
// Die Form, wie die Fliese liegt: volles Parallelogramm, dann an jedem
// eigenen Schnitt (Gehrung) beschnitten. Schnitte stehen im Fliesenrahmen
// ({p, n}: behalten wird die Seite, in die n zeigt) und wandern deshalb beim
// Verschieben, Drehen, Duplizieren und Weiterstrecken mit. Bleibt konvex.
// Ausklinkungen (konvexe Vielecke im Fliesenrahmen, z.B. wo die Ecke einer
// Nachbarfliese hineinragt) - die Fliese bleibt EIN Stueck, nur ohne diese
// Flaechen. tileCorners bleibt die konvexe Aussenform.
function tileNotches(spec, it){
  if(!it.notches || !it.notches.length) return [];
  const c=Math.cos(it.rot*D2R), s=Math.sin(it.rot*D2R);
  return it.notches.map(nt=>nt.pts.map(p=>{ const r=rotP(p,c,s); return {x:r.x+it.x, y:r.y+it.y}; }));
}
// Flaeche der VEREINIGUNG konvexer Vielecke (Einschluss-Ausschluss bis zu
// Dreierschnitten). Ausklinkungen und Aussparungen duerfen sich
// ueberlappen - einfach aufsummiert zaehlte die Ueberlappung doppelt.
function unionArea(polys){
  const ar=Q=>Q.length>=3 ? Math.abs(polyArea(Q)) : 0, P=polys.filter(q=>q.length>=3);
  let s=P.reduce((t,q)=>t+ar(q),0);
  for(let i=0;i<P.length;i++) for(let j=i+1;j<P.length;j++){
    const ij=clipConvex(P[i],P[j]); if(ij.length<3) continue;
    s-=ar(ij);
    for(let k=j+1;k<P.length;k++) s+=ar(clipConvex(ij,P[k]));
  }
  return Math.max(0,s);
}
// Schmalste Stelle eines konvexen Vielecks (min. Abstand zwischen einer Kante
// und dem gegenueberliegenden Punkt). Ein Rest, der schmaler als ein paar mm
// ist, laesst sich weder schneiden noch verlegen.
const MIN_PIECE_W=10;
function minWidth(P){
  if(P.length<3) return 0;
  let w=Infinity;
  edgesOf(P).forEach(e=>{ let m=0; P.forEach(q=>{ m=Math.max(m, Math.abs(crs(e.d,sub(q,e.a)))); }); w=Math.min(w,m); });
  return w;
}
// Ueberlappungsflaeche zweier Fliesen, Ausklinkungen herausgerechnet.
function tileOverlapArea(spec, a, b){
  const A=tileCorners(spec,a), B=tileCorners(spec,b);
  if(!convexOverlap(A,B)) return 0;
  const ar=Q=>Q.length>=3 ? Math.abs(polyArea(Q)) : 0;
  const AB=clipConvex(A,B);
  const holes=tileNotches(spec,a).concat(tileNotches(spec,b)).map(n=>clipConvex(n,AB));
  return Math.max(0, ar(AB)-unionArea(holes));
}
function tileCorners(spec, it){
  const c=Math.cos(it.rot*D2R), s=Math.sin(it.rot*D2R);
  let P=tileShape(spec, it.kind);
  (it.cuts||[]).forEach(k=>{ P=dedupe(clipHalf(P, k.p, k.n)); });
  return P.map(p=>{ const r=rotP(p,c,s); return {x:r.x+it.x, y:r.y+it.y}; });
}
// Rahmen -> Fliesenrahmen (Umkehrung von tileCorners)
function toTile(it, p){
  const c=Math.cos(-it.rot*D2R), s=Math.sin(-it.rot*D2R);
  return rotP(sub(p,it), c, s);
}
function polyArea(P){
  let a=0;
  for(let i=0,j=P.length-1;i<P.length;j=i++) a+=P[j].x*P[i].y-P[i].x*P[j].y;
  return a/2;
}
// Kanten mit Aussennormale. Die Normale haengt vom Umlaufsinn ab - einmal
// ueber die Flaeche bestimmt, dann stimmt sie fuer jedes Polygon.
function edgesOf(P){
  const ccw=polyArea(P)>0, out=[];
  for(let i=0;i<P.length;i++){
    const a=P[i], b=P[(i+1)%P.length], d=unit(sub(b,a));
    out.push({a, b, d, n: ccw ? {x:d.y, y:-d.x} : {x:-d.y, y:d.x}});
  }
  return out;
}

// Raumrahmen aus Punkten und erster Wand. null, solange es keine Wand gibt.
// anchor {a,b} (optional): Rahmen an diesen beiden Ecken statt an walls[0] -
// die Küche merkt sich so ihre Bezugsecken, damit freie Teile nicht mit der
// Wandreihenfolge springen. Fehlt eine der Ecken, gilt wieder walls[0].
function frameOf(pts, walls, anchor){
  const ends = anchor && pts.some(p=>p.id===anchor.a) && pts.some(p=>p.id===anchor.b) ? [anchor.a, anchor.b]
             : (walls && walls.length) ? walls[0] : null;
  if(!ends) return null;
  const A=pts.find(p=>p.id===ends[0]), B=pts.find(p=>p.id===ends[1]);
  if(!A||!B) return null;
  const u=unit(sub(B,A));
  return {o:{x:A.x,y:A.y}, u, v:{x:-u.y, y:u.x}};
}
const toLocal=(F,p)=>{ const q=sub(p,F.o); return {x:dot(q,F.u), y:dot(q,F.v)}; };
const toWorldF=(F,p)=>({x:F.o.x+F.u.x*p.x+F.v.x*p.y, y:F.o.y+F.u.y*p.x+F.v.y*p.y});

// Sutherland-Hodgman: beliebiges (auch konkaves) Subjekt gegen ein KONVEXES
// Clip-Polygon. Die Fliese ist immer konvex, der Raum nicht - also wird der
// Raum an der Fliese beschnitten, nie umgekehrt. Bei konkaven Subjekten
// entstehen evtl. Nullbreiten-Stege, die Flaeche stimmt trotzdem.
function clipConvex(subject, clip){
  const ccw=polyArea(clip)>0;
  let out=subject;
  for(let i=0;i<clip.length && out.length;i++){
    const a=clip[i], b=clip[(i+1)%clip.length], e=sub(b,a);
    const n=ccw ? {x:-e.y, y:e.x} : {x:e.y, y:-e.x};   // zeigt nach innen
    out=clipHalf(out, a, n);
  }
  return dedupe(out);
}
// Halbebene dot(p-a, n) >= 0 behalten.
function clipHalf(poly, a, n){
  const out=[], side=p=>dot(sub(p,a),n);
  for(let j=0;j<poly.length;j++){
    const P=poly[j], Q=poly[(j+1)%poly.length], sp=side(P), sq=side(Q);
    if(sp>=-1e-9) out.push(P);
    if((sp>=-1e-9)!==(sq>=-1e-9)){
      const t=sp/(sp-sq);
      out.push({x:P.x+(Q.x-P.x)*t, y:P.y+(Q.y-P.y)*t});
    }
  }
  return out;
}
function dedupe(P){
  const out=[];
  P.forEach(p=>{ const q=out[out.length-1]; if(!q || len(sub(p,q))>1e-6) out.push(p); });
  if(out.length>1 && len(sub(out[0],out[out.length-1]))<=1e-6) out.pop();
  return out;
}
// Trennende Achse fuer zwei konvexe Polygone. Beruehrung (Fuge 0) zaehlt
// nicht als Ueberlappung - dafuer die kleine Toleranz.
function convexOverlap(A, B, tol=0.5){
  for(const P of [A,B]) for(const e of edgesOf(P)){
    let aMin=Infinity,aMax=-Infinity,bMin=Infinity,bMax=-Infinity;
    for(const p of A){ const t=dot(p,e.n); aMin=Math.min(aMin,t); aMax=Math.max(aMax,t); }
    for(const p of B){ const t=dot(p,e.n); bMin=Math.min(bMin,t); bMax=Math.max(bMax,t); }
    if(aMax<=bMin+tol || bMax<=aMin+tol) return false;
  }
  return true;
}

// Gehrung zweier ueberlappender Fliesen. Standard: die Schnittlinie
// verbindet zwei Ecken der Ueberlappungsflaeche und trennt die beiden
// Fliesen - bei zwei Friesen an einer Raumecke die Diagonale von der Innen-
// zur Aussenecke. Unter allen Eckpaaren gewinnt das, bei dem beide
// Schwerpunkte am deutlichsten auf verschiedenen Seiten liegen; Drehpunkt ist
// die Ecke naeher an beiden Fliesen (die Innenecke). Den Winkel stellt danach
// miterAt ein. m ist die gemeinsame Kennung der Gehrung in beiden Fliesen.
const cenOf=P=>({x:P.reduce((s,p)=>s+p.x,0)/P.length, y:P.reduce((s,p)=>s+p.y,0)/P.length});
const withoutMiter=(it,m)=>{ const cuts=(it.cuts||[]).filter(k=>k.m!==m); const o={...it}; if(cuts.length) o.cuts=cuts; else delete o.cuts; return o; };
function miterPair(spec, A, B, m=1, ring=null){
  const PA=tileCorners(spec,A), PB=tileCorners(spec,B);
  if(!convexOverlap(PA,PB)) return null;
  const O=clipConvex(PA,PB);
  if(O.length<3) return null;
  const ca=cenOf(PA), cb=cenOf(PB), mid={x:(ca.x+cb.x)/2, y:(ca.y+cb.y)/2};
  let best=null;
  for(let i=0;i<O.length;i++) for(let j=i+1;j<O.length;j++){
    const d=sub(O[j],O[i]); if(len(d)<1) continue;
    const n=unit({x:-d.y, y:d.x});
    const sa=dot(sub(ca,O[i]),n), sb=dot(sub(cb,O[i]),n);
    if(sa*sb>=0) continue;
    const score=Math.min(Math.abs(sa),Math.abs(sb));
    if(!best || score>best.score) best={score, i, j};
  }
  if(!best) return null;
  let pv=O[best.i], q=O[best.j];
  if(len(sub(q,mid))<len(sub(pv,mid))) [pv,q]=[q,pv];
  return miterAt(spec, A, B, pv, sub(q,pv), m, ring);
}
// Gehrung mit gegebenem Drehpunkt pv und Richtung dir (Rahmenkoordinaten).
// Ersetzt eine vorhandene Gehrung m in beiden Fliesen. Welche Fliese welche
// Seite behaelt, entscheidet das LOCH, das der Schnitt reissen wuerde: was
// eine Fliese abgibt, muss die andere bedecken. Flaeche ausserhalb des Raums
// zaehlt nicht (ring optional) - eine Fliese, die ueber die Ecke hinausragt,
// darf dort beliebig verlieren. Der Schwerpunkt taugt dafuer nicht: ragt
// eine Fliese weit ueber die Ecke, kippt er schon bei maessig flachen
// Winkeln auf die falsche Seite. null, wenn jede Seitenwahl ein Loch ueber
// 2 % einer Fliese liesse (die Fuge selbst liegt weit darunter).
// cover: Ecken weiterer Fliesen (konvex), die abgegebene Flaeche ebenfalls
// decken duerfen - an einer Kreuzung liegt oft eine dritte Fliese darunter.
function miterAt(spec, A, B, pv, dir, m, ring, pe, cover){
  const A0=withoutMiter(A,m), B0=withoutMiter(B,m);
  const d=unit(dir), n0={x:-d.y, y:d.x};
  const PA=tileCorners(spec,A0), PB=tileCorners(spec,B0);
  const ar=P=>P.length>=3 ? Math.abs(polyArea(P)) : 0;
  // Flaeche eines KONVEXEN Stuecks, die im Raum liegt: im Aussenring, aber
  // nicht in einer Insel (Wandstueck, Pfeiler). Fruehere Fassung zog die
  // Inseln nicht ab - eine Fliese, die in eine Insel ragt, "verlor" dort
  // Raumflaeche, und jede Gehrung wurde als Loch abgelehnt.
  const inRoomArea=P=>{ if(P.length<3) return 0; if(!ring) return ar(P);
    return Math.max(0, ar(clipConvex(ring,P)) - (ring.holes||[]).reduce((s,h)=>s+ar(clipConvex(h,P)),0)); };
  // Loch, wenn P die Seite gegen nn abgibt und Q sie nicht bedeckt
  // Gedeckt ist, was die andere Gehrungsfliese ODER eine weitere Fliese
  // bedeckt. Verlegte Fliesen ueberlappen sich kaum, die Summe der
  // Einzeldeckungen ist deshalb eine gute Naeherung der Vereinigung.
  const hole=(P,Q,nn)=>{ const lost=dedupe(clipHalf(P,pv,{x:-nn.x,y:-nn.y}));
    if(lost.length<3) return 0;
    const need=inRoomArea(lost);
    const got=[Q,...(cover||[])].reduce((s,C)=>s+inRoomArea(clipConvex(lost,C)),0);
    return Math.max(0, need-Math.min(need,got)); };
  const cost=nn=>hole(PA,PB,nn)+hole(PB,PA,{x:-nn.x,y:-nn.y});
  const nn=[n0,{x:-n0.x,y:-n0.y}], c=nn.map(cost);
  const n=c[0]<=c[1] ? nn[0] : nn[1];                            // n zeigt zu A
  miterAt.lastHole=Math.min(...c);                               // fuer die Warnung im UI
  // Das Loch entscheidet NUR die Seitenwahl. Ablehnen nur, wenn eine Fliese
  // dabei fast ganz verschwaende - eine bewusst gesetzte Gehrung, die eine
  // Luecke laesst (wird spaeter angeschnitten/ergaenzt), ist erlaubt.
  const keepA=ar(dedupe(clipHalf(PA,pv,n))), keepB=ar(dedupe(clipHalf(PB,pv,{x:-n.x,y:-n.y})));
  if(keepA<0.1*ar(PA) || keepB<0.1*ar(PB)) return null;
  const h=spec.joint/2;
  const cutFor=(it,nn)=>{
    const c=Math.cos(-it.rot*D2R), s=Math.sin(-it.rot*D2R);
    const p={x:pv.x+nn.x*h, y:pv.y+nn.y*h};                      // halbe Fuge zur eigenen Seite
    const k={p:rotP(sub(p,it),c,s), n:rotP(nn,c,s), m, pv:rotP(sub(pv,it),c,s)};
    if(pe) k.pe=rotP(sub(pe,it),c,s);                             // gesetzter zweiter Endpunkt
    return k;
  };
  const nB={x:-n.x, y:-n.y};
  return [{...A0, cuts:[...(A0.cuts||[]), cutFor(A0,n)]}, {...B0, cuts:[...(B0.cuts||[]), cutFor(B0,nB)]}];
}
// Lage einer Gehrung fuer den Griff: Drehpunkt, Richtung (vom Drehpunkt
// weg, durch die Ueberlappung) und Endpunkt der Linie in den ungeschnittenen
// Fliesen. Winkel = zwischen Linie und Laengskante von A, in Grad.
function miterInfo(spec, A, B, m){
  const k=(A.cuts||[]).find(c=>c.m===m); if(!k || !k.pv) return null;
  const c=Math.cos(A.rot*D2R), s=Math.sin(A.rot*D2R);
  const pv={x:rotP(k.pv,c,s).x+A.x, y:rotP(k.pv,c,s).y+A.y};
  const nW=rotP(k.n,c,s);
  let d={x:nW.y, y:-nW.x};
  const O=clipConvex(tileCorners(spec,withoutMiter(A,m)), tileCorners(spec,withoutMiter(B,m)));
  // weitester Punkt der Ueberlappung entlang +-d bestimmt die Richtung
  const far=sg=>Math.max(0,...O.map(p=>sg*dot(sub(p,pv),d)));
  if(far(-1)>far(1)) d={x:-d.x, y:-d.y};
  const L=Math.max(far(1),far(-1), 50);
  // Vom Nutzer gesetzter Endpunkt hat Vorrang vor der Ueberlappungs-Ausdehnung.
  if(k.pe){ const r=rotP(k.pe,c,s), pe={x:r.x+A.x, y:r.y+A.y}, v=sub(pe,pv);
    if(len(v)>1){ d=unit(v); return {pv, d, end:pe, ang:normDeg(Math.atan2(d.y,d.x)/D2R - A.rot)}; } }
  const ang=normDeg(Math.atan2(d.y,d.x)/D2R - A.rot);
  return {pv, d, end:{x:pv.x+d.x*L, y:pv.y+d.y*L}, ang};
}

// Fangpunkte fuer die Gehrungslinie: Schnittpunkte der Fluchten (verlaengerte
// Kanten) beider Fliesen - ohne die Gehrung m selbst. Nur Punkte in der Naehe
// der beiden Fliesen (Bounding-Box + margin), doppelte zusammengefasst.
function miterSnapPoints(spec, A, B, m, margin=300){
  const P=[tileCorners(spec,withoutMiter(A,m)), tileCorners(spec,withoutMiter(B,m))];
  const L=P.flatMap(Q=>Q.map((a,i)=>({a, d:unit(sub(Q[(i+1)%Q.length],a))})));
  const all=P.flat(), x0=Math.min(...all.map(p=>p.x))-margin, x1=Math.max(...all.map(p=>p.x))+margin;
  const y0=Math.min(...all.map(p=>p.y))-margin, y1=Math.max(...all.map(p=>p.y))+margin;
  const out=[];
  for(let i=0;i<L.length;i++) for(let j=i+1;j<L.length;j++){
    const den=crs(L[i].d,L[j].d); if(Math.abs(den)<1e-6) continue;
    const t=crs(sub(L[j].a,L[i].a),L[j].d)/den, q={x:L[i].a.x+L[i].d.x*t, y:L[i].a.y+L[i].d.y*t};
    if(q.x<x0||q.x>x1||q.y<y0||q.y>y1) continue;
    if(!out.some(o=>len(sub(o,q))<0.5)) out.push(q);
  }
  return out;
}

// Dehnungsfuge als Streifen (konvexes Viereck) der Breite width um a-b.
function jointStrip(j){
  const d=unit(sub(j.b,j.a)), h=j.width/2, n={x:-d.y*h, y:d.x*h};
  return [{x:j.a.x+n.x,y:j.a.y+n.y},{x:j.b.x+n.x,y:j.b.y+n.y},
          {x:j.b.x-n.x,y:j.b.y-n.y},{x:j.a.x-n.x,y:j.a.y-n.y}];
}

// Snap-Ziele: Strecken mit einer Normalen, die in den Bereich zeigt, in dem
// die Fliese liegen darf, und dem Abstand, den sie dort halten muss.
//  - andere Fliesen: Aussennormale, Abstand = Fuge
//  - Waende: Normale ins Rauminnere, Abstand = Randfuge
//  - Dehnungsfugen: beide Streifenkanten nach aussen, Abstand = 0 (die Fuge
//    selbst IST der Abstand)
function snapTargets(spec, others, ring, joints){
  const T=[];
  others.forEach(P=>edgesOf(P).forEach(e=>T.push({a:e.a,b:e.b,d:e.d,n:e.n,gap:spec.joint,kind:'tile'})));
  if(ring && ring.length>=3){
    // edgesOf liefert die AUSSENnormale des Raums - die Fliese liegt innen.
    edgesOf(ring).forEach(e=>T.push({a:e.a,b:e.b,d:e.d,n:{x:-e.n.x,y:-e.n.y},gap:spec.edgeGap,kind:'wall'}));
    // Inseln: ihre Aussennormale zeigt bereits in den Raum.
    (ring.holes||[]).forEach(h=>edgesOf(h).forEach(e=>T.push({a:e.a,b:e.b,d:e.d,n:e.n,gap:spec.edgeGap,kind:'wall'})));
  }
  (joints||[]).forEach(j=>edgesOf(jointStrip(j)).forEach((e,i)=>{
    if(i%2===0) T.push({a:e.a,b:e.b,d:e.d,n:e.n,gap:0,kind:'joint'});
  }));
  return T;
}

// Starre Bewegung {dth (Grad), px, py (Drehpunkt), dx, dy} auf Punkte/Lagen.
function movePt(p, m){
  const c=Math.cos(m.dth*D2R), s=Math.sin(m.dth*D2R);
  const r=rotP(sub(p,{x:m.px,y:m.py}),c,s);
  return {x:r.x+m.px+m.dx, y:r.y+m.py+m.dy};
}
function moveItem(it, m){
  const p=movePt(it,m);
  return {...it, x:p.x, y:p.y, rot:normDeg(it.rot+m.dth)};
}

// Kern des Einrastens. polys: die bewegten Fliesen (bereits an der
// Zielstelle, ohne Snap). Sucht eine Kante, die einem Ziel fast
// gegenueberliegt (Normalen antiparallel innerhalb tolDeg, Abstand zur
// Soll-Lage innerhalb tolMm, Strecken ueberlappen laengs). Dreht exakt
// parallel und schiebt auf den Sollabstand. Danach ein zweiter, laengs
// wirkender Snap: entweder eine andere, nicht parallele Kante an ein zweites
// Ziel (Raumecke, Fliese quer) oder Ecke-auf-Ecke entlang der ersten Kante.
function snapGroup(polys, targets, tolMm, tolDeg=8){
  const E=[]; polys.forEach(P=>edgesOf(P).forEach(e=>E.push(e)));
  let best=null;
  for(const e of E) for(const t of targets){
    const want={x:-t.n.x, y:-t.n.y};
    if(dot(e.n,want)<Math.cos(tolDeg*D2R)) continue;
    const dth=Math.atan2(crs(e.n,want), dot(e.n,want))/D2R;
    const mid={x:(e.a.x+e.b.x)/2, y:(e.a.y+e.b.y)/2};
    const m0={dth, px:mid.x, py:mid.y, dx:0, dy:0};
    const a=movePt(e.a,m0), b=movePt(e.b,m0);
    const off=t.gap-dot(sub(a,t.a),t.n);
    if(Math.abs(off)>tolMm) continue;
    const ta1=dot(sub(t.b,t.a),t.d);
    const s0=dot(sub(a,t.a),t.d), s1=dot(sub(b,t.a),t.d);
    const lo=Math.max(Math.min(s0,s1),Math.min(0,ta1)), hi=Math.min(Math.max(s0,s1),Math.max(0,ta1));
    if(hi-lo<=Math.min(tolMm*0.5, 5)) continue;
    const cost=Math.abs(off)+Math.abs(dth)*20;
    if(!best || cost<best.cost) best={cost, e, t, m:{...m0, dx:t.n.x*off, dy:t.n.y*off}};
  }
  if(!best) return null;
  const m=best.m, t=best.t, lines=[t];
  // Zweiter Snap laengs t.d.
  let slide=null;
  const moved=polys.map(P=>P.map(p=>movePt(p,m)));
  const E2=[]; moved.forEach(P=>edgesOf(P).forEach(e=>E2.push(e)));
  for(const e of E2) for(const t2 of targets){
    if(t2===t) continue;
    if(-dot(e.n,t2.n)<Math.cos(1*D2R)) continue;       // nur schon parallele
    const along=dot(t.d,t2.n);
    if(Math.abs(along)<0.2) continue;                   // parallel zu t: schiebt nicht
    const s=(t2.gap-dot(sub(e.a,t2.a),t2.n))/along;
    if(Math.abs(s)>tolMm) continue;
    const ta1=dot(sub(t2.b,t2.a),t2.d);
    const ea={x:e.a.x+t.d.x*s,y:e.a.y+t.d.y*s}, eb={x:e.b.x+t.d.x*s,y:e.b.y+t.d.y*s};
    const s0=dot(sub(ea,t2.a),t2.d), s1=dot(sub(eb,t2.a),t2.d);
    const lo=Math.max(Math.min(s0,s1),Math.min(0,ta1)), hi=Math.min(Math.max(s0,s1),Math.max(0,ta1));
    if(hi-lo<=0) continue;
    if(!slide || Math.abs(s)<Math.abs(slide.s)) slide={s, t2};
  }
  if(!slide){
    // Ecke-auf-Ecke: NUR die Enden der eingerasteten Kante auf die Enden des
    // Ziels. Nimmt man jede Ecke der Gruppe, faengt in einer Chevron-Spalte
    // die Ecke der Nachbarreihe - die liegt nur eine Fuge daneben, und die
    // Spalten stuenden um genau diese Fuge versetzt.
    const corners=[best.e.a, best.e.b].map(p=>movePt(p,m));
    for(const p of corners) for(const q of [t.a,t.b]){
      if(Math.abs(dot(sub(p,q),t.n)-t.gap)>0.5) continue;
      const s=dot(sub(q,p),t.d);
      if(Math.abs(s)<=tolMm && (!slide || Math.abs(s)<Math.abs(slide.s))) slide={s, corner:q};
    }
  }
  if(slide){
    m.dx+=t.d.x*slide.s; m.dy+=t.d.y*slide.s;
    if(slide.t2) lines.push(slide.t2);
  }
  return {m, lines};
}

// Rotation auf Raster (step Grad), step 0 = frei.
const snapAngle=(a,step)=>step>0 ? normDeg(Math.round(a/step)*step) : normDeg(a);

// Die tatsaechlich verlegten Stuecke EINER Fliese (Rahmenkoordinaten):
// Raum geschnitten mit der Fliese, dann an jeder Dehnungsfuge, die sie
// kreuzt, in die beiden Seiten geteilt - eine Fliese ueber einer Fuge ergibt
// zwei getrennte Schnittstuecke. Inseln im Raum werden nicht boolesch
// abgezogen, sondern als AUSSPARUNGEN (Insel ∩ Fliese, exakt, weil die
// Fliese konvex ist) am Stueck gefuehrt - so zeichnet und bemasst sie das
// Schnittblatt auch. Liefert [{poly, cutouts, area}], Splitter < 1 mm2 weg.
function tilePieces(spec, it, ring, joints){
  const P=tileCorners(spec,it);
  let pieces=[{poly: ring ? clipConvex(ring,P) : P, planes:[]}];
  for(const j of (joints||[])){
    const S=jointStrip(j);
    if(!convexOverlap(P,S,0.01)) continue;
    const d=unit(sub(j.b,j.a)), n={x:-d.y, y:d.x}, h=j.width/2, m={x:-n.x, y:-n.y};
    const a1={x:j.a.x+n.x*h, y:j.a.y+n.y*h}, a2={x:j.a.x-n.x*h, y:j.a.y-n.y*h};
    pieces=pieces.flatMap(q=>[{poly:dedupe(clipHalf(q.poly,a1,n)), planes:[...q.planes,[a1,n]]},
                              {poly:dedupe(clipHalf(q.poly,a2,m)), planes:[...q.planes,[a2,m]]}]);
  }
  const holes=((ring && ring.holes)||[]).map(h=>clipConvex(h,P))
    // Kerben nur, soweit sie in DIESER Form liegen (nach Fugenschnitt
    // gehoert eine Kerbe oft nur noch zu einem der beiden Teile)
    .concat(tileNotches(spec,it).map(n=>clipConvex(n,P)).map(n=>ring && n.length>=3 ? clipConvex(ring,n) : n))
    .filter(c=>c.length>=3 && Math.abs(polyArea(c))>=1);
  return pieces.map(q=>{
    const cutouts=holes.map(c=>q.planes.reduce((acc,[a,n])=>dedupe(clipHalf(acc,a,n)), c))
                       .filter(c=>c.length>=3 && Math.abs(polyArea(c))>=1);
    const area=Math.abs(polyArea(q.poly)) - unionArea(cutouts);
    return {poly:q.poly, cutouts, area};
  }).filter(q=>q.poly.length>=3 && q.area>=1);
}

// Status gegen Raum und Fugen.
//  whole: genau ein Stueck, deckungsgleich mit der Fliese
//  cut:   Stuecke kleiner als die Fliese (Rand, Fuge)
//  out:   gar nicht im Raum
function tileStatus(spec, it, ring, joints){
  const A=tileArea(spec,it.kind), pieces=tilePieces(spec,it,ring,joints);
  const inA=pieces.reduce((s,q)=>s+q.area,0);
  const st = !pieces.length ? 'out'
    : (pieces.length===1 && !pieces[0].cutouts.length && inA>=A*(1-1e-6)) ? 'whole' : 'cut';
  return {status:st, area:A, inArea:inA, pieces};
}

// Nummerierung der Schnittstuecke: stabil nach Lage (Zeilen quer zur
// ersten Wand, dann laengs), damit dieselbe Verlegung dieselben Nummern
// bekommt. Liefert je Stueck {no, item, poly (Rahmen), tilePoly (Fliese)}.
function cutList(spec, items, ring, joints){
  const cuts=[];
  items.forEach(it=>{
    const s=tileStatus(spec,it,ring,joints);
    if(s.status!=='cut') return;
    s.pieces.forEach(q=>{
      let cx=0, cy=0; q.poly.forEach(p=>{ cx+=p.x; cy+=p.y; });
      cuts.push({item:it, poly:q.poly, cutouts:q.cutouts, area:q.area, c:{x:cx/q.poly.length, y:cy/q.poly.length}});
    });
  });
  const row=Math.max(spec.w,100);
  cuts.sort((a,b)=>Math.round(a.c.y/row)-Math.round(b.c.y/row) || a.c.x-b.c.x);
  cuts.forEach((c,i)=>{
    c.no=i+1; c.tilePoly=c.poly.map(p=>toTile(c.item,p));
    c.tileCutouts=c.cutouts.map(C=>C.map(p=>toTile(c.item,p)));
  });
  return cuts;
}

// Recycling: Schnittstuecke auf moeglichst wenige Rohfliesen verteilen.
// Je Typ (L/R - die Glasur verbietet Spiegeln) wird jedes Stueck in eine
// schon angebrochene Rohfliese gelegt, wenn es dort hineinpasst: gleiche
// Lage oder um 180 Grad gedreht (das Parallelogramm ist punktsymmetrisch),
// beliebig laengs/quer verschoben, mit mindestens kerf mm Abstand zu jedem
// anderen Stueck (Saegeschnitt, Bruchkante). Stuecke, die durch Anschneiden
// aus EINER Fliese entstanden sind (gleiches from), liegen schon gemeinsam
// in ihrer Rohfliese - an ihrer Originalstelle.
// cuts: Eintraege aus cutList (tilePoly im Fliesenrahmen). Liefert
// {stocks:[{kind, pieces:[{no, poly, rot180, dx, dy}]}], byNo:Map(no->stock-Index)}.
// Kombiniert wird nur, was im Raum nah beieinander liegt (Mitten hoechstens
// near mm auseinander, Standard 1,5 m) - sonst weiss beim Verlegen keiner mehr, wohin der
// Rest gehoert.
function nestCuts(spec, cuts, kerf, near, opts){
  kerf=kerf??30; near=near??1500; opts=opts||{};
  const stocks=[], byNo=new Map(), ar=Q=>Math.abs(polyArea(Q));
  const kinds=[...new Set(['L','R',...cuts.map(c=>c.item.kind),...(spec.set||[]).flatMap(tileKinds)])];
  const T=Object.fromEntries(kinds.map(k=>[k,tileShape(spec,k)]));
  const C={}; kinds.forEach(k=>{ C[k]={x:T[k].reduce((a,p)=>a+p.x,0)/T[k].length, y:T[k].reduce((a,p)=>a+p.y,0)/T[k].length}; });
  const inside=(k,Q)=>edgesOf(T[k]).every(e=>Q.every(p=>dot(sub(p,e.a),e.n)<=0.5));
  const free=(st,Q)=>st.pieces.every(o=>!convexOverlap(o.poly,Q,-(kerf-0.01)));
  // nur Lagen, die sich mit geraden Durchschnitten trennen lassen (cutPlan)
  const guill=(k,st,Q)=>cutPlan(spec,k,st.pieces.map(o=>({poly:o.poly})).concat([{poly:Q}])).ok;
  // 1) Gruppen, die schon gemeinsam aus einer Fliese kommen
  const groups=new Map();
  cuts.forEach(c=>{ const k=c.item.from!=null ? 'f'+c.item.from : 'i'+c.item.id;
    if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(c); });
  const single=[];
  groups.forEach(g=>{
    if(g.length>1){
      const st={kind:g[0].item.kind, pieces:g.map(c=>({no:c.no, poly:hull(c.tilePoly), rot180:false, dx:0, dy:0, at:c.c}))};
      g.forEach(c=>byNo.set(c.no, stocks.length)); stocks.push(st);
    } else single.push(g[0]);
  });
  // 2) Einzelstuecke, groesste zuerst. Erst die an ihre Sorte gebundenen,
  // dann die tauschbaren (c.maySwap: Aufrufer erlaubt es, und das Stueck
  // passt ungespiegelt auch in die andere Fliesenform) - die gleichen L/R
  // aus: angebrochene Rohfliesen beider Sorten, sonst eine neue der Sorte,
  // von der bisher weniger gebraucht wird (opts.base = ganze Fliesen je Sorte).
  const used=st=>st.pieces.reduce((s2,o)=>s2+ar(o.poly),0);
  const placeIn=(k, st, c, base)=>{
    const sk=c.item.kind;
    const poses=[{rot180:false, Q:base}, {rot180:true, Q:base.map(p=>({x:2*C[sk].x-p.x, y:2*C[sk].y-p.y}))}];
    for(const ps of poses){
      const xs=ps.Q.map(p=>p.x), ys=ps.Q.map(p=>p.y);
      const x0=Math.min(...T[k].map(p=>p.x))-Math.min(...xs), x1=Math.max(...T[k].map(p=>p.x))-Math.max(...xs);
      const y0=-Math.min(...ys), y1=Math.max(...T[k].map(p=>p.y))-Math.max(...ys);
      for(let dy=y0; dy<=y1+1e-9; dy+=Math.max(5,(y1-y0)/6||5)){
        for(let dx=x0; dx<=x1+1e-9; dx+=10){
          const Q=ps.Q.map(p=>({x:p.x+dx, y:p.y+dy}));
          if(inside(k,Q) && (!st || (free(st,Q) && guill(k,st,Q)))) return {no:c.no, poly:Q, rot180:ps.rot180, dx, dy, at:c.c, from:sk};
        }
        if(y1-y0<1e-6) break;
      }
    }
    return null;
  };
  const count=Object.fromEntries(kinds.map(k=>[k,(opts.base&&opts.base[k])||0]));
  stocks.forEach(st=>count[st.kind]++);
  const other=k=>tileOther(spec,k);
  const put=(c, swappable)=>{
    const sk=c.item.kind, base=hull(c.tilePoly), kinds=swappable ? [sk, other(sk)] : [sk];
    const order=stocks.map((st,i)=>i).filter(i=>kinds.includes(stocks[i].kind))
      .filter(i=>used(stocks[i])+ar(base)<=tileArea(spec,stocks[i].kind))
      .filter(i=>!c.c || !stocks[i].pieces.some(o=>o.at && len(sub(o.at,c.c))>near))
      .sort((a,b)=>used(stocks[b])-used(stocks[a]));
    for(const si of order){
      const pc=placeIn(stocks[si].kind, stocks[si], c, base);
      if(pc){ stocks[si].pieces.push(pc); byNo.set(c.no, si); return; }
    }
    // neue Rohfliese: tauschbar -> die knappere Sorte, wenn es dort hineinpasst
    let k=sk, pc=null;
    if(swappable && count[other(sk)]<count[sk]){ pc=placeIn(other(sk), null, c, base); if(pc) k=other(sk); }
    if(!pc) pc={no:c.no, poly:base, rot180:false, dx:0, dy:0, at:c.c, from:sk};
    byNo.set(c.no, stocks.length); stocks.push({kind:k, pieces:[pc]}); count[k]++;
  };
  single.sort((a,b)=>b.area-a.area);
  const canSwap=c=>other(c.item.kind)!==c.item.kind && !!c.maySwap && !!placeIn(other(c.item.kind), null, c, hull(c.tilePoly));
  const sw=single.filter(canSwap), bound=single.filter(c=>!sw.includes(c));
  bound.forEach(c=>put(c,false));
  sw.forEach(c=>put(c,true));
  stocks.forEach(st=>st.pieces.forEach(q=>{ q.swapped = q.from!=null && q.from!==st.kind; }));
  stocks.forEach((st,i)=>{ st.no=i+1; st.pieces.sort((a,b)=>a.no-b.no); });
  const swapped=stocks.reduce((n,st)=>n+st.pieces.filter(q=>q.swapped).length,0);
  return {stocks, byNo, kerf, near, swapped};
}

// Schnittplan einer Rohfliese: nur gerade Durchschnitte. Jeder Schnitt ist
// eine Linie quer durch die GANZE Fliese mit zwei Anrisspunkten auf den
// Fliesenkanten (Ecke + Abstand). Alle Linien werden auf der heilen Fliese
// angerissen, dann in Reihenfolge geschnitten - jeder Schnitt laeuft durch
// das Reststueck, in dem er liegt, und trifft dabei kein anderes Stueck.
// Erst werden Stuecke voneinander getrennt, dann besaeumt. Was nicht konvex
// ist (Ausklinkung: Huelle minus Stueck), wird als Einschnitt bis zu einem
// Innenpunkt angegeben - ebenfalls ueber Linien von Kante zu Kante.
// pieces: [{poly}] im Fliesenrahmen. Liefert {lines, notches, ok, err}.
// lines[i]: {p, d, n, ends:[mark,mark], seg:[a,b], waste}
// mark: {edge, corner, dist, p} - corner/dist wie in pieceDims.
function cutPlan(spec, kind, pieces){
  const T=tileShape(spec,kind), H=pieces.map(P=>hull(P.poly));
  const EPS=0.5, ar=Q=>Q.length>=3 ? Math.abs(polyArea(Q)) : 0;
  const clipLine=(Q,p,d)=>{
    let t0=-Infinity, t1=Infinity;
    edgesOf(Q).forEach(e=>{ const a=dot(sub(p,e.a),e.n), b=dot(d,e.n);
      if(Math.abs(b)<1e-12){ if(a>1e-9) t0=Infinity; return; }
      const t=-a/b; if(b>0) t1=Math.min(t1,t); else t0=Math.max(t0,t); });
    return t1-t0>1e-6 ? [{x:p.x+d.x*t0,y:p.y+d.y*t0},{x:p.x+d.x*t1,y:p.y+d.y*t1}] : null;
  };
  const tileMarks=(p,d)=>{ const s=clipLine(T,p,d); return s && s.map(q=>markOn(T,q)); };
  const side=(Q,p,n)=>{ let lo=Infinity, hi=-Infinity; Q.forEach(q=>{ const s=dot(sub(q,p),n); lo=Math.min(lo,s); hi=Math.max(hi,s); }); return {lo,hi}; };
  const lines=[]; let err=null;
  // Kandidaten: Huellkanten (Schnitt buendig am Stueck), sonst Mitte einer
  // Luecke zwischen den Stuecken (nur zum Trennen).
  const split=(blank, idx)=>{
    if(!idx.length || err) return;
    const cands=[];
    idx.forEach(i=>edgesOf(H[i]).forEach(e=>cands.push({p:e.a, n:e.n, own:i})));
    const pick=cands.map(c=>{
      const b=side(blank,c.p,c.n);
      if(b.hi<=EPS || b.lo>=-EPS) return null;                // Reststueck reicht nicht drueber
      let out=0;
      for(const j of idx){ if(j===c.own) continue;
        const s=side(H[j],c.p,c.n);
        if(s.lo>=EPS) out++; else if(s.hi>-EPS) return null;    // Schnitt traefe Stueck j
      }
      return {...c, out, gain:b.hi};
    }).filter(Boolean);
    let best=null;
    if(idx.length>1){
      best=pick.filter(c=>c.out>0).sort((a,b)=>b.out-a.out||b.gain-a.gain)[0];
      for(const c of best ? [] : cands){                      // Luecke auf einer Kantennormale
        const iv=idx.map(j=>side(H[j],{x:0,y:0},c.n)).sort((a,b)=>a.lo-b.lo);
        let hi=iv[0].hi;
        for(let k=1;k<iv.length && !best;k++){
          if(iv[k].lo-hi>2*EPS){ const m=(iv[k].lo+hi)/2; best={p:{x:c.n.x*m, y:c.n.y*m}, n:c.n}; }
          hi=Math.max(hi,iv[k].hi);
        }
        if(best) break;
      }
      if(!best){ err='Stücke lassen sich nicht mit geraden Durchschnitten trennen.'; return; }
    } else {
      best=pick.sort((a,b)=>b.gain-a.gain)[0];
      if(!best) return;                                       // Reststueck = Stueck
    }
    const d={x:-best.n.y, y:best.n.x};
    const inner=dedupe(clipHalf(blank,best.p,{x:-best.n.x,y:-best.n.y}));
    const outer=dedupe(clipHalf(blank,best.p,best.n));
    const inI=idx.filter(j=>side(H[j],best.p,best.n).hi<=EPS), outI=idx.filter(j=>!inI.includes(j));
    lines.push({p:best.p, d, n:best.n, ends:tileMarks(best.p,d), seg:clipLine(blank,best.p,d),
      waste:outI.length ? null : {poly:outer, w:minWidth(outer)}});
    split(inner,inI); split(outer,outI);
  };
  split(T, pieces.map((_,i)=>i));
  // Dieselbe Linie (z.B. gemeinsame Kante zweier Stuecke nach dem Trennen)
  // wird nur einmal angerissen; die Schritte verweisen auf ihre Anrisslinie.
  const marks=[];
  lines.forEach(l=>{
    let k=marks.findIndex(m=>Math.abs(Math.abs(dot(m.n,l.n))-1)<1e-6 && Math.abs(dot(sub(l.p,m.p),m.n))<0.05);
    if(k<0){ k=marks.length; marks.push({p:l.p, n:l.n, d:l.d, ends:l.ends}); }
    l.mark=k;
  });
  // Ausklinkungen: Huellkante, die nicht Stueckkante ist -> Kette der
  // Stueckpunkte dazwischen. Jede Kettenkante als Linie von Fliesenkante zu
  // Fliesenkante angerissen, geschnitten nur bis zu den Innenpunkten.
  const notches=[];
  pieces.forEach((P,i)=>{
    const Q=P.poly, on=q=>H[i].some(h=>len(sub(h,q))<1e-6);
    if(Q.length<4 || ar(H[i])-ar(Q)<1) return;
    const n=Q.length;
    for(let a=0;a<n;a++){
      if(!on(Q[a]) || on(Q[(a+1)%n])) continue;
      const chain=[Q[a]]; let b=(a+1)%n;
      while(!on(Q[b]) && chain.length<=n){ chain.push(Q[b]); b=(b+1)%n; }
      chain.push(Q[b]);
      const nl=chain.slice(0,-1).map((p,m)=>{ const d=unit(sub(chain[m+1],p)); return {p, d, ends:tileMarks(p,d), seg:[p,chain[m+1]]}; });
      notches.push({piece:i, chain, lines:nl, inner:chain.slice(1,-1)});
    }
  });
  return {lines, marks, notches, ok:!err, err};
}
// Punkt auf dem Rand einer (konvexen) Fliese als Marke ab naechster Ecke
// Pruefung: Stuecke allein aus den gerundeten Anrissmassen nachbauen
// (round: so, wie sie auf dem Blatt stehen) und mit der Sollform vergleichen.
// Liefert je Stueck {dArea, dMax} in mm² / mm.
function replayPlan(spec, kind, pieces, plan, round){
  const T=tileShape(spec,kind), rd=round||(v=>v);
  const pt=m=>markPoint(T,{...m, dist:rd(m.dist)});
  const ln=l=>{ const a=pt(l.ends[0]), b=pt(l.ends[1]); return {a, d:unit(sub(b,a))}; };
  const X=(l1,l2)=>{ const den=crs(l1.d,l2.d); if(Math.abs(den)<1e-12) return l1.a; const t=crs(sub(l2.a,l1.a),l2.d)/den; return {x:l1.a.x+l1.d.x*t, y:l1.a.y+l1.d.y*t}; };
  const ar=Q=>Q.length>=3 ? Math.abs(polyArea(Q)) : 0;
  return pieces.map((P,i)=>{
    const H=hull(P.poly), c={x:H.reduce((s,q)=>s+q.x,0)/H.length, y:H.reduce((s,q)=>s+q.y,0)/H.length};
    let R=T;
    plan.marks.forEach(m=>{
      const s=H.map(q=>dot(sub(q,m.p),m.n));
      if(Math.min(...s)<-0.5 && Math.max(...s)>0.5) return;  // Linie laeuft nicht an diesem Stueck vorbei
      const L=ln(m), n={x:-L.d.y, y:L.d.x}, sg=dot(sub(c,L.a),n)>=0 ? n : {x:-n.x,y:-n.y};
      R=dedupe(clipHalf(R,L.a,sg));
    });
    let notchA=0;
    plan.notches.filter(nt=>nt.piece===i).forEach(nt=>{
      const Ls=nt.lines.map(ln), ch=[nt.chain[0]];
      for(let k=0;k<Ls.length-1;k++) ch.push(X(Ls[k],Ls[k+1]));
      ch.push(nt.chain[nt.chain.length-1]);
      notchA+=ar(ch);
    });
    // Abstand Punkt -> Kontur (nicht Ecke -> Ecke: ein Knick unter 0,5 mm
    // wird bewusst als EIN gerader Schnitt geplant)
    const dSeg=(p,Q)=>Math.min(...Q.map((a,k)=>{ const b=Q[(k+1)%Q.length], d=sub(b,a), L2=dot(d,d)||1, t=Math.max(0,Math.min(1,dot(sub(p,a),d)/L2));
      return len(sub(p,{x:a.x+d.x*t, y:a.y+d.y*t})); }));
    const dMax=Math.max(...H.map(h=>dSeg(h,R)), ...R.map(q=>dSeg(q,H)));
    return {dArea:Math.abs(ar(R)-notchA-ar(P.poly)), dMax};
  });
}
function markOn(T, p){
  let best=null;
  for(let i=0;i<T.length;i++){
    const a=T[i], b=T[(i+1)%T.length], d=sub(b,a), L=len(d), t=Math.max(0,Math.min(1,dot(sub(p,a),d)/(L*L)));
    const off=len(sub(p,{x:a.x+d.x*t, y:a.y+d.y*t}));
    if(!best || off<best.off) best={off, i, t, L};
  }
  const fromA=best.t*best.L, fromB=(1-best.t)*best.L;
  return fromA<=fromB ? {p, edge:best.i, corner:best.i, dist:fromA}
                      : {p, edge:best.i, corner:(best.i+1)%T.length, dist:fromB};
}
// Marke zurueck in den Punkt - so, wie der Fliesenleger sie abtraegt.
function markPoint(T, m){
  const c=T[m.corner], o=T[m.corner===m.edge ? (m.edge+1)%T.length : m.edge], d=unit(sub(o,c));
  return {x:c.x+d.x*m.dist, y:c.y+d.y*m.dist};
}

// Bemassung eines Schnittstuecks im Fliesenrahmen - so, wie der
// Fliesenleger die Fliese vor sich liegen hat. Fuer jede Schnittkante:
// wo sie die Fliesenkanten trifft, gemessen von der naechsten Fliesenecke
// entlang dieser Kante. Dazu die Laengen aller Stueckkanten.
function pieceDims(spec, kind, tilePoly, tileCutouts){
  const T=tileShape(spec,kind), marks=[], edges=[];
  // Toleranz laengs wie quer: 0,5 mm absolut. Relativ (1e-6 = 0,001 mm)
  // fiel eine um Hundertstel versetzte Ecke schon aus der Kante - und die
  // ganze Originalkante bekam ein Schnittzeichen.
  const onEdge=p=>{
    for(let i=0;i<T.length;i++){
      const a=T[i], b=T[(i+1)%T.length], d=sub(b,a), L=len(d);
      const t=dot(sub(p,a),d)/(L*L);
      if(t*L<-0.5||t*L>L+0.5) continue;
      const q={x:a.x+d.x*t, y:a.y+d.y*t};
      if(len(sub(p,q))<0.5) return {i, t:Math.min(1,Math.max(0,t)), L};
    }
    return null;
  };
  const isCorner=p=>T.some(c=>len(sub(p,c))<0.5);
  tilePoly.forEach(p=>{
    if(isCorner(p)) return;
    const e=onEdge(p);
    if(!e) return;
    const fromA=e.t*e.L, fromB=(1-e.t)*e.L;
    marks.push(fromA<=fromB ? {p, edge:e.i, corner:e.i, dist:fromA}
                            : {p, edge:e.i, corner:(e.i+1)%T.length, dist:fromB});
  });
  for(let i=0;i<tilePoly.length;i++){
    const a=tilePoly[i], b=tilePoly[(i+1)%tilePoly.length];
    // Liegt die Stueckkante auf EINER Fliesenkante? Eine Fliesenecke liegt
    // auf zwei Kanten - deshalb gegen jede Kante pruefen, nicht nur gegen
    // die erste, die onEdge findet.
    const alongTile=T.some((_,i)=>{
      const u=T[i], v=T[(i+1)%T.length], d=sub(v,u), L=len(d);
      const off=p=>Math.abs(crs(d,sub(p,u)))/L, t=p=>dot(sub(p,u),d)/L;
      return off(a)<0.5 && off(b)<0.5 && t(a)>-0.5 && t(a)<L+0.5 && t(b)>-0.5 && t(b)<L+0.5;
    });
    edges.push({a, b, len:len(sub(b,a)), cut:!alongTile});
  }
  // Aussparungen (Inseln): Punkte auf einer Fliesenkante wie oben ab Ecke,
  // Punkte im Inneren als Koordinate - laengs A-B ab Ecke A und quer ab
  // Kante A-B. Die Fliese liegt im Fliesenrahmen genau so: A=(0,0), A-B = x.
  const inner=[];
  (tileCutouts||[]).forEach((cu,k)=>cu.forEach(p=>{
    if(isCorner(p)) return;
    const e=onEdge(p);
    if(e){
      const fromA=e.t*e.L, fromB=(1-e.t)*e.L;
      marks.push(fromA<=fromB ? {p, edge:e.i, corner:e.i, dist:fromA, cutout:k}
                              : {p, edge:e.i, corner:(e.i+1)%T.length, dist:fromB, cutout:k});
    } else inner.push({p, cutout:k, along:p.x, off:p.y});
  }));
  const area=Math.abs(polyArea(tilePoly)) - unionArea(tileCutouts||[]);
  return {shape:T, marks, inner, edges, area};
}

// Stueckliste. Ueberlappungen werden gezaehlt, nicht verhindert - ein
// Fliesenleger soll sehen, dass zwei Steine auf demselben Platz liegen.
// ring: Schnittkante (ganz/geschnitten, Belegung). areaRing: Verlegekante
// fuer die Raumflaeche, falls die Schnittkante in der Randfuge liegt.
function tileStats(spec, items, ring, joints, areaRing){
  const r={L:{whole:0,cut:0}, R:{whole:0,cut:0}, out:0, placed:0, pieces:0, covered:0, tileArea:0, overlaps:0, roomArea:0};
  // Reste, die durch Anschneiden aus EINER Fliese entstanden sind (gleiches
  // from), sind auch nur eine Fliese im Einkauf.
  const groups=new Map();
  items.forEach(it=>{ const k=it.from!=null ? 'f'+it.from : 'i'+it.id; if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(it); });
  groups.forEach(g=>{
    const st=g.map(it=>tileStatus(spec,it,ring,joints)), live=st.filter(s=>s.status!=='out');
    if(!live.length){ r.out++; return; }
    const whole = g.length===1 && live[0].status==='whole';
    if(!r[g[0].kind]) r[g[0].kind]={whole:0,cut:0};
    r[g[0].kind][whole?'whole':'cut']++; r.placed++;
    live.forEach(s=>{ if(s.status==='cut') r.pieces+=s.pieces.length; r.covered+=s.inArea; });
    r.tileArea+=tileArea(spec,g[0].kind);
  });
  const P=items.map(it=>tileCorners(spec,it));
  for(let i=0;i<P.length;i++) for(let j=i+1;j<P.length;j++)
    if(convexOverlap(P[i],P[j]) && tileOverlapArea(spec,items[i],items[j])>1) r.overlaps++;
  const aR=areaRing||ring;
  if(aR){
    r.roomArea=ringsOf(aR).reduce((s,R,i)=>s+(i?-1:1)*Math.abs(polyArea(R)),0);
    (joints||[]).forEach(j=>{ r.roomArea-=Math.abs(polyArea(clipConvex(aR,jointStrip(j)))); });
  }
  r.waste = r.tileArea>0 ? 1-r.covered/r.tileArea : 0;
  return r;
}

// Weiterstrecken: Kopien der Gruppe um k*vec, vorwaerts und rueckwaerts,
// solange eine Kopie das umschliessende Rechteck des Raums noch schneidet.
// Bewusst NICHT "solange sie den Raum beruehrt": in einem L- oder
// Stufenraum ist eine Spalte aus dem niedrigen Teil zu kurz, seitlich
// kopiert erreicht sie den hohen Teil nie, und das Weiterstrecken hoerte an
// der ersten Luecke auf. Ganz aussen liegende Einzelfliesen sortiert der
// Aufrufer aus. Liefert NUR die neuen Lagen; max gegen winzige Vektoren.
function extendItems(spec, group, vec, ring, max=400, both=true){
  if(len(vec)<1 || !group.length) return [];
  const out=[];
  const bx0=Math.min(...ring.map(p=>p.x)), bx1=Math.max(...ring.map(p=>p.x));
  const by0=Math.min(...ring.map(p=>p.y)), by1=Math.max(...ring.map(p=>p.y));
  const touches=items=>items.some(it=>tileCorners(spec,it).some(p=>p.x>bx0&&p.x<bx1&&p.y>by0&&p.y<by1)
    || Math.abs(polyArea(clipConvex(ring,tileCorners(spec,it))))>1);
  for(const sgn of both?[1,-1]:[1]){
    for(let k=1;k<=max;k++){
      const copy=group.map(it=>({...it, x:it.x+vec.x*k*sgn, y:it.y+vec.y*k*sgn}));
      if(!touches(copy)) break;
      out.push(...copy);
    }
  }
  return out;
}

// Naechster Punkt auf dem Ring zu p: {q, i (Kante), t, dist}
// Ueber alle Ringe (Aussenwand und Inseln); r ist der getroffene Ring.
function nearestOnRing(ring, p){
  let best=null;
  for(const R of ringsOf(ring)) for(let i=0;i<R.length;i++){
    const a=R[i], b=R[(i+1)%R.length], d=sub(b,a), L2=dot(d,d)||1;
    const t=Math.max(0,Math.min(1,dot(sub(p,a),d)/L2));
    const q={x:a.x+d.x*t, y:a.y+d.y*t}, dist=len(sub(p,q));
    if(!best || dist<best.dist) best={q,i,t,dist,r:R};
  }
  return best;
}
// Endpunkt einer Dehnungsfuge. mode 'corner': nur Raumecken. Sonst Ecke
// bevorzugt (innerhalb tol), dann Lotfusspunkt auf der naechsten Wand.
function jointEndSnap(ring, p, tol, mode){
  let bc=null;
  ringsOf(ring).forEach(R=>R.forEach((c,i)=>{ const d=len(sub(p,c)); if(!bc || d<bc.d) bc={d,i,R,q:{x:c.x,y:c.y}}; }));
  // wd: Richtung der Wand am Punkt - Bezug fuers Winkelraster der Fuge
  const wdOf=(R,i)=>unit(sub(R[(i+1)%R.length],R[i]));
  if(mode==='corner') return bc && bc.d<=tol*3 ? {q:bc.q, corner:bc.i, wd:wdOf(bc.R,bc.i)} : null;
  // 'nocorner' (⌥): Ecken rasten nicht ein - man kann direkt neben einer Ecke landen
  if(mode!=='nocorner' && bc && bc.d<=tol) return {q:bc.q, corner:bc.i, wd:wdOf(bc.R,bc.i)};
  const n=nearestOnRing(ring,p);
  return n && n.dist<=tol ? {q:n.q, edge:n.i, t:n.t, wd:wdOf(n.r,n.i)} : null;
}
function pointInRing(p, poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i], b=poly[j];
    if((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}
function pointInRoom(p, ring){
  let inside=pointInRing(p, ring);
  for(const h of (ring.holes||[])) if(pointInRing(p,h)) inside=!inside;
  return inside;
}
// Erster Auftreffpunkt eines Strahls von p in Richtung d auf eine Wand
// (Aussenwand oder Insel), mindestens tmin (Standard 1 mm) entfernt. null
// ohne Treffer. Die Küche ruft es mit 1e-6 für einzelne Teile auf (rayPoly).
function rayToRing(ring, p, d, tmin=1){
  let best=null;
  for(const R of ringsOf(ring)) for(let i=0;i<R.length;i++){
    const a=R[i], e=sub(R[(i+1)%R.length],a), den=crs(d,e);
    if(Math.abs(den)<1e-12) continue;
    const t=crs(sub(a,p),e)/den, u=crs(sub(a,p),d)/den;
    if(t>tmin && u>=-1e-9 && u<=1+1e-9 && (!best || t<best.t)) best={t, q:{x:p.x+d.x*t, y:p.y+d.y*t}};
  }
  return best;
}
// Endpunkt einer Dehnungsfuge im Winkelraster: Richtung vom Start zum Zeiger
// auf stepDeg-Vielfache gegen die Wand am Start (wd) runden, dann bis zur
// naechsten Wand verlaengern.
function jointRayEnd(ring, start, wd, pointer, stepDeg){
  const v=sub(pointer,start); if(len(v)<1) return null;
  const a0=Math.atan2(wd.y,wd.x), a=Math.atan2(v.y,v.x);
  const snapped=a0+Math.round((a-a0)/(stepDeg*D2R))*stepDeg*D2R;
  const hit=rayToRing(ring, start, {x:Math.cos(snapped), y:Math.sin(snapped)});
  return hit ? {q:hit.q, deg:normDeg((snapped-a0)/D2R)} : null;
}

// Anschneiden: Fliese it an der Fliese cutter abschneiden, mit Fuge. Anders
// als die Gehrung bleibt cutter unveraendert. Von den Kanten des cutters
// gewinnt die, jenseits derer it am meisten Flaeche behaelt - laeuft der
// cutter mitten durch, bleibt die groessere Seite. Der Schnitt steht im
// Fliesenrahmen wie ein Gehrungsschnitt (ohne Kennung m). null, wenn nichts
// zu schneiden ist oder nichts uebrig bliebe.
// Neue Kerbe zu vorhandenen: ueberlappt sie eine und kostet die gemeinsame
// konvexe Huelle kaum mehr Flaeche als beide zusammen, werden sie EINE Kerbe
// (sonst liegen Kerbenraender in der anderen Kerbe - Spitzen, Doppellinien).
// Liegt sie ganz in einer vorhandenen, aendert sich nichts.
function mergeNotch(list, N){
  const ar=Q=>Q.length>=3 ? Math.abs(polyArea(Q)) : 0;
  for(let i=0;i<list.length;i++){
    const E=list[i], I=ar(clipConvex(E.pts,N.pts));
    if(I<0.5) continue;
    const aE=ar(E.pts), aN=ar(N.pts), U=aE+aN-I;
    if(I>=aN-0.5) return list;
    const H=hull([...E.pts, ...N.pts]);
    if(ar(H)-U <= Math.max(100, 0.1*U)){
      const out=list.slice(); out[i]={pts:H, by:E.by};
      return out;
    }
  }
  return [...list, N];
}
function trimBy(spec, cutter, it, cover){
  const PC=tileCorners(spec,cutter), P=tileCorners(spec,it);
  // Auch ohne echte Ueberlappung: wer naeher als eine Fuge heranrueckt, wird
  // ebenfalls geschnitten (negative Toleranz = Mindestabstand Fuge).
  if(!convexOverlap(PC,P,-(spec.joint-0.01))) return null;
  // Ausklinkungen des cutters sind Luecken: liegt die Ueberlappung (um die
  // Fuge vergroessert) praktisch ganz darin, wird nichts geschnitten.
  if((cutter.notches||[]).length){
    const ar0=Q=>Q.length>=3 ? Math.abs(polyArea(Q)) : 0;
    const cr=Math.cos(cutter.rot*D2R), sr=Math.sin(cutter.rot*D2R);
    const NW=cutter.notches.map(n=>n.pts.map(p=>{ const w=rotP(p,cr,sr); return {x:w.x+cutter.x, y:w.y+cutter.y}; }));
    const g0=insetRoom(PC.map((p,i)=>({...p,id:'c'+i})), ()=>-spec.joint);
    const restOf=O=>ar0(O)-NW.reduce((s2,H)=>s2+ar0(clipConvex(O.length>=3?O:[],H)),0);
    // echte Ueberlappung ausserhalb der Kerben: muss praktisch null sein;
    // der Fugensaum am Kerbenrand (vergroesserter cutter) darf bleiben
    const real=restOf(clipConvex(PC,P)), grown=restOf(clipConvex(g0,P));
    if(real<1 && grown < 2*spec.joint*Math.max(spec.w,1)) return null;
  }
  // Je Kante des cutters das Stueck jenseits davon. Laeuft der cutter mitten
  // durch, gibt es mehrere - ALLE bleiben, als eigene Fliesen. Stuecke an
  // benachbarten Kanten ueberlappen sich an der Ecke; dann gewinnt das
  // groessere, das kleinere faellt weg.
  const cand=[];
  for(const e of edgesOf(PC)){
    const p={x:e.a.x+e.n.x*spec.joint, y:e.a.y+e.n.y*spec.joint};
    const k=dedupe(clipHalf(P,p,e.n)), a=k.length>=3 ? Math.abs(polyArea(k)) : 0;
    if(a>=1) cand.push({a, p, n:e.n, k});
  }
  if(!cand.length) return null;
  cand.sort((x,y)=>y.a-x.a);
  if(cand[0].a>=Math.abs(polyArea(P))-0.01) return null;          // liegt schon mit Fuge daneben
  // Ragt der cutter nur mit einer Ecke hinein, waere ein gerader Schnitt
  // verschwenderisch: dann AUSKLINKEN - nur die Ueberlappung (um die Fuge
  // vergroessert) faellt weg, die Fliese bleibt ein Stueck. Kriterium: kein
  // zweites, getrenntes Reststueck (sonst laeuft der cutter quer durch) und
  // spuerbar weniger Verlust als beim besten geraden Schnitt.
  const grown=insetRoom(PC.map((p,i)=>({...p,id:'c'+i})), ()=>-spec.joint);
  const notch=clipConvex(grown,P), A=Math.abs(polyArea(P)), na=notch.length>=3 ? Math.abs(polyArea(notch)) : 0;
  // Quer durch heisst: die Ueberlappung beruehrt zwei NICHT benachbarte
  // Kanten der Fliese (dann zerfaellt sie in Reste). Eine hineinragende Ecke
  // beruehrt nur eine Kante oder zwei benachbarte.
  const touched=[];
  edgesOf(P).forEach((e,i)=>{ const L=len(sub(e.b,e.a));
    if(notch.some(q=>{ const t=dot(sub(q,e.a),e.d); return t>=-0.5 && t<=L+0.5 && Math.abs(crs(e.d,sub(q,e.a)))<0.5; })) touched.push(i); });
  const nP=P.length;
  let split=touched.some(i=>touched.some(j=>{ const d=Math.abs(i-j); return d>1 && d<nP-1; }));
  // "Quer durch" nur, wenn danach wirklich ZWEI brauchbare, getrennte Reste
  // bleiben. Laeuft der Streifen an einem Fliesenende entlang, bleibt nur
  // einer - dann ist es eine Ausklinkung, kein Teilen.
  if(split){
    const mA=0.01*tileArea(spec,it.kind), real=[];
    cand.forEach(c=>{ if(c.a>=mA && minWidth(c.k)>=MIN_PIECE_W && !real.some(k=>convexOverlap(k.k,c.k,0.01))) real.push(c); });
    if(real.length<2) split=false;
  }
  if(!split){
    // Ausklinken, wenn es hoechstens 70 % dessen wegnimmt, was der beste
    // gerade Schnitt wegnaehme.
    // Was der gerade Schnitt ZUSAETZLICH zur Kerbe wegnimmt: liegen dort
    // ohnehin andere Fliesen (Nachbarreihe), ist das kein echter Verlust -
    // dann lieber gerade schneiden als eine Kerbe nach der anderen.
    const ar=Q=>Q.length>=3 ? Math.abs(polyArea(Q)) : 0;
    const lostStraight=A-cand[0].a;
    const removed=dedupe(clipHalf(P,cand[0].p,{x:-cand[0].n.x,y:-cand[0].n.y}));
    const extra=lostStraight-na;
    const covered=(cover||[]).reduce((s,C)=>s+ar(clipConvex(removed,C)),0) - (cover||[]).reduce((s,C)=>s+ar(clipConvex(notch.length>=3?notch:[],C)),0);
    const straightBetter = extra>1 && covered>=0.8*extra;
    // Ausklinken, sobald es spuerbar weniger wegnimmt als der gerade Schnitt
    // (mind. 1 % der Fliese oder 30 % des geraden Verlusts)
    const saves=lostStraight-na;
    if(na>=1 && (saves>=0.01*tileArea(spec,it.kind) || na<=0.7*lostStraight) && !straightBetter){
      const cs=Math.cos(-it.rot*D2R), sn=Math.sin(-it.rot*D2R);
      const N={pts:notch.map(q=>rotP(sub(q,it),cs,sn)), by:cutter.id};
      return [{...it, notches:mergeNotch(it.notches||[], N)}];
    }
  }
  // Splitter (unter 1 % der Fliese) sind kein Rest, den man verlegt.
  const keep=[], minA=0.01*tileArea(spec,it.kind);
  cand.forEach(c=>{ if(c.a>=minA && minWidth(c.k)>=MIN_PIECE_W && !keep.some(k=>convexOverlap(k.k,c.k,0.01))) keep.push(c); });
  if(!keep.length) return null;
  const cs=Math.cos(-it.rot*D2R), sn=Math.sin(-it.rot*D2R);
  // by: welche Fliese den Schnitt verursacht hat - eine spaetere Gehrung
  // zwischen genau diesen beiden hebt ihn wieder auf.
  return keep.map(c=>({...it, cuts:[...(it.cuts||[]), {p:rotP(sub(c.p,it),cs,sn), n:rotP(c.n,cs,sn), by:cutter.id}]}));
}

// Bemassung zwischen zwei Fliesen (Umrisse PA, PB, Rahmen-mm):
//  gap   - parallele, einander zugewandte Kanten: Normalabstand auf der
//          kuerzesten Strecke (Mitte des gemeinsamen Bereichs, sonst vom
//          naechsten Endpunkt senkrecht auf die Nachbarkante)
//  flucht- gleich gerichtete Kanten nahe einer Linie: Versatz der Fluchten
//  angle - nicht parallele Kanten, die aufeinander stossen (Abstand
//          hoechstens reach): Winkel zwischen ihnen am naechsten Punkt
// Je Kante von A nur der naechste Partner, damit es lesbar bleibt.
function pairDims(PA, PB, reach){
  reach=reach??30;
  const EA=edgesOf(PA), EB=edgesOf(PB), out=[], PAR=Math.sin(0.5*D2R);
  const segDist=(p,e)=>{ const L=len(sub(e.b,e.a)), t=Math.max(0,Math.min(L,dot(sub(p,e.a),e.d)));
    const q={x:e.a.x+e.d.x*t, y:e.a.y+e.d.y*t}; return {q, d:len(sub(p,q))}; };
  EA.forEach(ea=>{
    let best=null;
    EB.forEach(eb=>{
      const La=len(sub(ea.b,ea.a)), cr=Math.abs(crs(ea.d,eb.d));
      if(cr<PAR){
        const anti=dot(ea.n,eb.n)<0, off=dot(sub(eb.a,ea.a),ea.n);  // Abstand Linie B von Linie A
        if(anti && off<-0.01) return;                                // B liegt hinter A
        if(!anti && Math.abs(off)>reach) return;
        // gemeinsamer Bereich laengs ea
        const tb=[dot(sub(eb.a,ea.a),ea.d), dot(sub(eb.b,ea.a),ea.d)];
        const lo=Math.max(0,Math.min(...tb)), hi=Math.min(La,Math.max(...tb));
        let t;
        if(anti) t= lo<=hi ? (lo+hi)/2 : (hi<lo && Math.min(...tb)>La ? La : 0);
        else t= lo<=hi ? (lo+hi)/2 : (Math.min(...tb)>La ? La : 0);
        const a={x:ea.a.x+ea.d.x*t, y:ea.a.y+ea.d.y*t}, b={x:a.x+ea.n.x*off, y:a.y+ea.n.y*off};
        const gapLen=Math.max(0, lo>hi ? lo-hi : 0);                 // laengs versetzt
        const c={kind:anti?'gap':'flucht', a, b, d:Math.abs(off), score:Math.abs(off)+gapLen,
          ov:Math.max(0,hi-lo), s0:{x:ea.a.x+ea.d.x*lo, y:ea.a.y+ea.d.y*lo}, s1:{x:ea.a.x+ea.d.x*hi, y:ea.a.y+ea.d.y*hi}, n:ea.n};
        if(anti && gapLen>reach) return;
        if(!best || c.score<best.score) best=c;
      } else {
        // stossende Kanten: kuerzester Abstand der Segmente
        const cands=[segDist(ea.a,eb),segDist(ea.b,eb)].map(r=>({p:r.q,d:r.d}))
          .concat([segDist(eb.a,ea),segDist(eb.b,ea)].map(r=>({p:r.q,d:r.d})));
        const m=cands.sort((x,y)=>x.d-y.d)[0];
        if(m.d>reach) return;
        const deg=Math.acos(Math.min(1,Math.abs(dot(ea.d,eb.d))))/D2R;
        const c={kind:'angle', at:m.p, deg, da:ea.d, db:eb.d, score:m.d+1000};
        if(!best || (best.kind==='angle' && c.score<best.score)) best=c;
      }
    });
    if(best) out.push(best);
  });
  // doppelte (gleiche Stelle) entfernen
  return out.filter((c,i)=>!out.some((o,j)=>j<i && o.kind===c.kind &&
    len(sub(o.a||o.at, c.a||c.at))<1 && Math.abs((o.d??o.deg)-(c.d??c.deg))<0.01));
}

// Fugencheck: alle Fugen zwischen Fliesen (parallele, zugewandte Kanten
// mit gemeinsamem Stueck), deren Breite von der Soll-Fuge abweicht. Als
// Fuge zaehlt, was hoechstens doppelt so breit wie Soll (mind. Soll+3 mm)
// ist - weiter auseinander ist keine Fuge, sondern Luecke.
function jointGaps(spec, polys){
  const J=spec.joint, maxD=Math.max(2*J, J+3), P=polys;
  const bb=P.map(Q=>({x0:Math.min(...Q.map(p=>p.x)), x1:Math.max(...Q.map(p=>p.x)), y0:Math.min(...Q.map(p=>p.y)), y1:Math.max(...Q.map(p=>p.y))}));
  const out=[], NEAR=Math.sin(5*D2R);
  for(let i=0;i<P.length;i++) for(let j=i+1;j<P.length;j++){
    const A=bb[i], B=bb[j];
    if(A.x0>B.x1+maxD || B.x0>A.x1+maxD || A.y0>B.y1+maxD || B.y0>A.y1+maxD) continue;
    const EB=edgesOf(P[j]);
    edgesOf(P[i]).forEach(ea=>EB.forEach(eb=>{
      // zugewandt und (beinahe) parallel - auch leicht verdreht = Keilfuge
      if(dot(ea.n,eb.n)>-Math.cos(5*D2R) || Math.abs(crs(ea.d,eb.d))>NEAR) return;
      const La=len(sub(ea.b,ea.a)), tb=[dot(sub(eb.a,ea.a),ea.d), dot(sub(eb.b,ea.a),ea.d)];
      const lo=Math.max(0,Math.min(...tb)), hi=Math.min(La,Math.max(...tb));
      if(hi-lo<1) return;
      // Breite an beiden Enden des gemeinsamen Stuecks: Abstand von ea
      // senkrecht bis zur Linie von eb
      const at=t=>{ const p={x:ea.a.x+ea.d.x*t, y:ea.a.y+ea.d.y*t};
        const den=dot(ea.n,eb.n); return -dot(sub(p,eb.a),eb.n)/den; };
      const d0=at(lo), d1=at(hi);
      if(Math.min(d0,d1)>maxD || Math.max(d0,d1)< -maxD) return;
      out.push({i, j, d:(d0+d1)/2, d0, d1, dmin:Math.min(d0,d1), dmax:Math.max(d0,d1), u:ea.d,
        s0:{x:ea.a.x+ea.d.x*lo, y:ea.a.y+ea.d.y*lo}, s1:{x:ea.a.x+ea.d.x*hi, y:ea.a.y+ea.d.y*hi}, n:ea.n});
    }));
  }
  return out;
}
// Fugenmoertel: Flaeche aller Fugen zwischen Fliesen (gemeinsame Laenge x
// mittlere Breite, Keilfugen anteilig), Volumen = Flaeche x Fliesenstaerke.
// Dehnungsfugen und markierte Wandfugen nicht - die werden elastisch
// (Silikon) gefuellt. Die Randfuge (Band Wand -> Verlegekante an Waenden
// ohne Wandfuge) wird mit Fugenmoertel gefuellt: room = Raumring,
// edge = Raumring nach innen versetzt (nur Randfuge).
function groutAmount(spec, items, room, edge){
  const G=jointGaps(spec, items.map(it=>tileCorners(spec,it))).filter(g=>g.dmin>=0);
  const length=G.reduce((s,g)=>s+len(sub(g.s1,g.s0)),0);
  const area=G.reduce((s,g)=>s+len(sub(g.s1,g.s0))*Math.max(0,(g.d0+g.d1)/2),0);
  let litre=G.reduce((s,g)=>s+len(sub(g.s1,g.s0))*Math.max(0,(g.d0+g.d1)/2)*Math.min(tileDef(spec,items[g.i].kind).thick||0,tileDef(spec,items[g.j].kind).thick||0)/1e6,0);
  const A=R=>ringsOf(R).reduce((s,P,i)=>s+(i?-1:1)*Math.abs(polyArea(P)),0);
  const edgeArea=room && edge ? Math.max(0, A(room)-A(edge)) : 0;
  litre+=edgeArea*(spec.thick||0)/1e6;
  return {length, area, edgeArea, litre};
}
// Fugenkreuze (3D-Druck) zaehlen. Knoten = Punkte, an denen Fugenmitten
// enden. Arme zaehlen nur, wenn sie in der Verlegeflaeche (region, z. B.
// layCut) liegen und nicht in einer Dehnungsfuge.
//  - Mittelstueck: durchlaufende Fuge (Arm D und Gegenarm U) plus zwei Arme
//    bei +-45 Grad zu D (Chevron-Spitze).
//  - Halbfaecher: D und die +-45-Arme, U fehlt, und der Knoten liegt an einer
//    geraden Querfuge (Wand-/Randfuge oder Dehnungsfuge) quer zu D.
function spacerCount(spec, items, region, joints){
  const res={mid:0, fan:0, sideA:0, sideB:0, midAt:[], fanAt:[], sideAAt:[], sideBAt:[]};
  if(!items.length || !region) return res;
  const R=Math.max(spec.joint,1)+2, ANG=Math.cos(5*D2R), SIN5=Math.sin(5*D2R), c45=Math.cos(45*D2R), s45=Math.sin(45*D2R);
  // Fugenmitten als Strecken
  const segs=jointGaps(spec, items.map(it=>tileCorners(spec,it))).filter(g=>g.dmin>=0).map(g=>{
    const p0={x:g.s0.x+g.n.x*g.d0/2, y:g.s0.y+g.n.y*g.d0/2}, p1={x:g.s1.x+g.n.x*g.d1/2, y:g.s1.y+g.n.y*g.d1/2};
    return {p0, p1, u:unit(sub(p1,p0)), L:len(sub(p1,p0))};
  });
  const ends=[]; segs.forEach(g=>ends.push({p:g.p0, d:g.u}, {p:g.p1, d:{x:-g.u.x, y:-g.u.y}}));
  // Querlinien ohne Fliese dahinter: Raender der Verlegeflaeche, Dehnungsfugen
  const lines=[];
  ringsOf(region).forEach(Q=>Q.forEach((a,i)=>lines.push({a, b:Q[(i+1)%Q.length]})));
  (joints||[]).forEach(j=>lines.push({a:j.a, b:j.b}));
  const segD=(p,a,b)=>{ const ab=sub(b,a), L2=dot(ab,ab)||1, t=Math.max(0,Math.min(1,dot(sub(p,a),ab)/L2));
    return len(sub(p,{x:a.x+ab.x*t, y:a.y+ab.y*t})); };
  const inJoint=p=>(joints||[]).some(j=>pointInRing(p, jointStrip(j)));
  const inside=(P,d)=>{ const q={x:P.x+d.x*(R+3), y:P.y+d.y*(R+3)}; return pointInPoly(q, region) && !inJoint(q); };
  const rot=(d,c,s)=>({x:d.x*c-d.y*s, y:d.x*s+d.y*c});
  const seen=[];
  const side=(P,a,b)=>{ const bb=dot(a,b)>0 ? b : {x:-b.x,y:-b.y}; seen.push(P);
    if(crs(bb,a)>0){ res.sideA++; res.sideAAt.push(P); } else { res.sideB++; res.sideBAt.push(P); } };
  // Knoten: Fugenenden, die nah beieinander liegen (auch einzeln: T-Stoss)
  const used=new Array(ends.length).fill(false);
  for(let i=0;i<ends.length;i++){
    if(used[i]) continue;
    const C=[]; for(let k=i;k<ends.length;k++) if(!used[k] && len(sub(ends[k].p,ends[i].p))<=R){ used[k]=true; C.push(ends[k]); }
    const P={x:C.reduce((s,e)=>s+e.p.x,0)/C.length, y:C.reduce((s,e)=>s+e.p.y,0)/C.length};
    const arms=[], add=d=>{ if(!arms.some(a=>dot(a,d)>ANG) && inside(P,d)) arms.push(d); };
    C.forEach(e=>add(e.d));
    // durchlaufende Fuge, an der dieser Knoten mitten anliegt (T-Stoss)
    segs.forEach(g=>{ const t=dot(sub(P,g.p0),g.u);
      if(t>R && t<g.L-R && Math.abs(crs(g.u,sub(P,g.p0)))<=R){ add(g.u); add({x:-g.u.x,y:-g.u.y}); } });
    if(arms.length<2) continue;
    const has=v=>arms.some(a=>dot(a,v)>ANG);
    const D=arms.find(d=>has(rot(d,c45,s45)) && has(rot(d,c45,-s45)));
    if(D){
      const perp=has(rot(D,0,1)) && has(rot(D,0,-1));
      const tol=(spec.edgeGap||0)/2+spec.joint+R;
      if(perp || (!has({x:-D.x,y:-D.y}) && lines.some(l=>segD(P,l.a,l.b)<=tol && Math.abs(dot(unit(sub(l.b,l.a)),D))<SIN5))){
        if(!perp || !has({x:-D.x,y:-D.y})){ res.fan++; res.fanAt.push(P); seen.push(P); } continue; }
      if(has({x:-D.x,y:-D.y}) && pointInPoly(P, region)){ res.mid++; res.midAt.push(P); seen.push(P); }
      continue;
    }
    // 45°-Stueck: durchlaufende Fuge (b, -b) plus genau ein Arm unter 45°
    if(arms.length===3){
      const b=arms.find(x=>has({x:-x.x,y:-x.y}));
      const a=b && arms.find(x=>Math.abs(Math.abs(dot(x,b))-c45)<0.06);
      if(b && a && pointInPoly(P, region)) side(P,a,b);
    }
  }
  // schraege Fuge endet an Wand/Randfuge oder Dehnungsfuge (keine Fliese dahinter)
  segs.forEach(g=>lines.forEach(l=>{
    const b=unit(sub(l.b,l.a)), den=crs(g.u,b);
    if(Math.abs(Math.abs(dot(g.u,b))-c45)>0.06) return;
    const w=sub(l.a,g.p0), t=crs(w,b)/den, s2=crs(w,g.u)/den, Lb=len(sub(l.b,l.a));
    if(t< -R || t>g.L+R || s2< -R || s2>Lb+R) return;
    const X={x:g.p0.x+g.u.x*t, y:g.p0.y+g.u.y*t};
    if(seen.some(q=>len(sub(q,X))<=2*R+spec.joint)) return;
    const ins=[g.u,{x:-g.u.x,y:-g.u.y}].filter(d=>inside(X,d));
    if(ins.length===1) side(X,ins[0],b);
  }));
  return res;
}
function jointCheck(spec, items, tol){
  tol=tol??0.2;
  const J=spec.joint;
  return jointGaps(spec, items.map(it=>tileCorners(spec,it)))
    .filter(g=>!(Math.abs(g.d0-J)<=tol && Math.abs(g.d1-J)<=tol))
    .map(g=>({...g, a:items[g.i].id, b:items[g.j].id}));
}
// Fugenversatz: zwei schraege Fugen, die von BEIDEN Seiten auf dieselbe
// durchlaufende Fuge treffen (Chevron-Spitze, Fugenkreuz), sollen sich dort
// in einem Punkt treffen. Liegen ihre Treffpunkte knapp nebeneinander
// (mehr als tol, hoechstens 4 Fugenbreiten + 2 mm), ist das Muster
// versetzt gelegt.
// Fugen an Stuecken, die an der Wand angeschnitten sind (skip[i]), zaehlen
// nicht: dort endet das Muster, der Versatz ist Folge des Wandverlaufs und
// laesst sich nicht korrigieren.
function jointOffsets(spec, polys, tol, skip){
  tol=tol??0.5;
  const G=jointGaps(spec, polys).filter(g=>!(skip && (skip[g.i] || skip[g.j]))).map(g=>{
    const c0={x:g.s0.x+g.n.x*g.d0/2, y:g.s0.y+g.n.y*g.d0/2}, c1={x:g.s1.x+g.n.x*g.d1/2, y:g.s1.y+g.n.y*g.d1/2};
    return {c0, c1, u:g.u, n:g.n};
  });
  const near=2*spec.joint+2, rec=[];
  G.forEach((X,xi)=>G.forEach((Y,yi)=>{
    const cr=crs(X.u,Y.u);
    if(xi===yi || Math.abs(cr)<Math.sin(10*D2R)) return;
    const LX=len(sub(X.c1,X.c0));
    [Y.c0,Y.c1].forEach(e=>{
      const off=dot(sub(e,X.c0),X.n);
      if(Math.abs(off)>near) return;
      // Treffpunkt der Fugenmitte von Y auf der Fugenmitte von X
      const t=dot(sub(X.c0,e),X.n)/dot(Y.u,X.n), H={x:e.x+Y.u.x*t, y:e.y+Y.u.y*t};
      const s=dot(sub(H,X.c0),X.u);
      if(s<-near || s>LX+near) return;
      if(len(sub(e,H))>2*near) return;          // Fuge endet nicht an der Kreuzung
      rec.push({X, H, e, yi});
    });
  }));
  const out=[];
  for(let a=0;a<rec.length;a++) for(let b=a+1;b<rec.length;b++){
    const r=rec[a], q=rec[b];
    if(r.yi===q.yi) continue;
    // dieselbe Fugenlinie?
    if(Math.abs(crs(r.X.u,q.X.u))>Math.sin(1*D2R) || Math.abs(dot(sub(q.H,r.X.c0),r.X.n))>0.5) continue;
    // von gegenueberliegenden Seiten?
    if(dot(sub(r.e,r.X.c0),r.X.n)*dot(sub(q.e,r.X.c0),r.X.n)>=0) continue;
    const d=len(sub(r.H,q.H));
    if(d>tol && d<Math.min(spec.w/2, 4*spec.joint+2) && !out.some(o=>len(sub(o.p,r.H))+len(sub(o.q,q.H))<0.1 || len(sub(o.p,q.H))+len(sub(o.q,r.H))<0.1))
      out.push({p:r.H, q:q.H, d});
  }
  // Ein Versatz zeigt sich an mehreren Fugenpaaren derselben Kreuzung
  // (auch quer gesehen) - je Kreuzung nur den groessten melden.
  const mid=o=>({x:(o.p.x+o.q.x)/2, y:(o.p.y+o.q.y)/2});
  return out.sort((a,b)=>b.d-a.d).filter((o,i,A)=>!A.slice(0,i).some(k=>len(sub(mid(k),mid(o)))<k.d+2*near));
}

// Unbelegte Flaechen: Raster (cell mm) ueber der Verlegeflaeche. Ein Punkt
// gilt als belegt, wenn er in einer Fliese liegt (nicht in einer Kerbe) oder
// hoechstens eine Fuge (+tol) von ihr entfernt ist - normale Fugen sind
// keine Luecke. Dehnungsfugen zaehlen als belegt. Liefert Zellen, Flaeche
// und zusammenhaengende Luecken {area, c, cells}.
// inc (optional): {prev, rects} - prev ist ein frueheres Ergebnis auf
// demselben Raster, rects die Rahmenrechtecke [x0,y0,x1,y1], in denen sich
// seither etwas geaendert hat. Nur deren Zellen werden neu bewertet, der Rest
// kommt aus prev.base. Beim Ziehen einer Fliese spart das fast das ganze Raster.
function uncovered(spec, items, lay, joints, cell, tol, inc){
  cell=cell||15; tol=tol??1;
  if(!lay) return {cells:[], area:0, comps:[]};
  const reach=spec.joint+tol, polys=items.map(it=>tileCorners(spec,it)), notch=items.map(it=>tileNotches(spec,it));
  const E=polys.map(edgesOf), NE=notch.map(L=>L.map(edgesOf));
  const xs=lay.map(p=>p.x), ys=lay.map(p=>p.y), x0=Math.min(...xs), y0=Math.min(...ys);
  const nx=Math.ceil((Math.max(...xs)-x0)/cell), ny=Math.ceil((Math.max(...ys)-y0)/cell);
  // Raster-Buckets fuer die Fliesen (grob, 300 mm)
  const B=300, bk=new Map(), key=(i,j)=>i+','+j;
  polys.forEach((P,k)=>{ const px=P.map(p=>p.x), py=P.map(p=>p.y);
    for(let i=Math.floor((Math.min(...px)-reach-x0)/B); i<=Math.floor((Math.max(...px)+reach-x0)/B); i++)
      for(let j=Math.floor((Math.min(...py)-reach-y0)/B); j<=Math.floor((Math.max(...py)+reach-y0)/B); j++){
        const q=key(i,j); if(!bk.has(q)) bk.set(q,[]); bk.get(q).push(k); } });
  // Kanten flach (ax,ay,dx,dy,nx,ny,L) - das Raster ruft das sehr oft
  const flat=Es=>Es.map(e=>[e.a.x,e.a.y,e.d.x,e.d.y,e.n.x,e.n.y,len(sub(e.b,e.a))]);
  E.forEach((Es,k)=>{ E[k]=flat(Es); }); NE.forEach((L,k)=>{ NE[k]=L.map(flat); });
  // vorzeichenbehafteter Abstand zum konvexen Vieleck: <=0 innen
  const sd=(px,py,Es)=>{
    let mx=-Infinity;
    for(const e of Es){ const v=(px-e[0])*e[4]+(py-e[1])*e[5]; if(v>mx) mx=v; }
    if(mx<=0) return mx;
    let mn=Infinity;
    for(const e of Es){ let t=(px-e[0])*e[2]+(py-e[1])*e[3]; t=t<0?0:t>e[6]?e[6]:t;
      const dx=px-e[0]-e[2]*t, dy=py-e[1]-e[3]*t, d=Math.sqrt(dx*dx+dy*dy); if(d<mn) mn=d; }
    return mn;
  };
  const strips=(joints||[]).map(j=>flat(edgesOf(jointStrip(j))));
  const covered=p=>{
    for(const Es of strips) if(sd(p.x,p.y,Es)<=tol) return true;
    const L=bk.get(key(Math.floor((p.x-x0)/B), Math.floor((p.y-y0)/B)));
    if(!L) return false;
    for(const k of L){ if(sd(p.x,p.y,E[k])>reach) continue;
      // in einer Kerbe: nur belegt, wenn nah am Kerbenrand (Fuge zur Nachbarfliese)
      let inN=false; for(const Es of NE[k]) if(sd(p.x,p.y,Es) < -reach){ inN=true; break; }
      if(!inN) return true; }
    return false;
  };
  const pv=inc && inc.prev, same=pv && pv.base && pv.nx===nx && pv.ny===ny && pv.x0===x0 && pv.y0===y0 && pv.cell===cell;
  const base=same ? pv.base.slice() : new Uint8Array(nx*ny);
  const evalCell=(i,j)=>{ const p={x:x0+(i+0.5)*cell, y:y0+(j+0.5)*cell};
    base[j*nx+i]=(!pointInRoom(p,lay) || covered(p)) ? 0 : 1; };
  if(same){
    for(const [rx0,ry0,rx1,ry1] of inc.rects){
      const i0=Math.max(0,Math.floor((rx0-x0)/cell)), i1=Math.min(nx-1,Math.ceil((rx1-x0)/cell));
      const j0=Math.max(0,Math.floor((ry0-y0)/cell)), j1=Math.min(ny-1,Math.ceil((ry1-y0)/cell));
      for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++) evalCell(i,j);
    }
  } else for(let j=0;j<ny;j++) for(let i=0;i<nx;i++) evalCell(i,j);
  const grid=base.slice(), cells=[];
  for(let k=0;k<grid.length;k++) if(grid[k]){ const i=k%nx, j=(k-i)/nx; cells.push({x:x0+(i+0.5)*cell, y:y0+(j+0.5)*cell}); }
  const comps=[];
  for(let k=0;k<grid.length;k++){ if(grid[k]!==1) continue;
    const st=[k], C=[]; grid[k]=2;
    while(st.length){ const m=st.pop(), i=m%nx, j=(m-i)/nx; C.push({x:x0+(i+0.5)*cell, y:y0+(j+0.5)*cell});
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(([a,b])=>{ const u=i+a, v=j+b; if(u>=0&&v>=0&&u<nx&&v<ny&&grid[v*nx+u]===1){ grid[v*nx+u]=2; st.push(v*nx+u); } }); }
    comps.push({area:C.length*cell*cell, c:{x:C.reduce((a,p)=>a+p.x,0)/C.length, y:C.reduce((a,p)=>a+p.y,0)/C.length}, cells:C});
  }
  comps.sort((a,b)=>b.area-a.area);
  return {cells, area:cells.length*cell*cell, comps, cell, base, nx, ny, x0, y0};
}

// An Wand anschneiden: die Fliese bekommt fuer jede Kante der Verlegekante
// (Aussenwand oder Insel), ueber die sie hinausragt, einen gespeicherten
// Schnitt - aber nur, wenn jenseits dieser Kante innerhalb der Fliese
// wirklich kein Raum mehr liegt. An einer Raumecke greifen so beide Waende,
// an einer einspringenden Ecke keine (dahinter ist noch Raum). Danach hat
// die Fliese ihre Wandform auch fuer Gehrung, Snap und Anschneiden.
function trimToRoom(spec, it, lay, joints){
  if(!lay) return null;
  const ar=P=>P.length>=3 ? Math.abs(polyArea(P)) : 0;
  const roomPart=P=>{ if(P.length<3) return 0;
    return ar(clipConvex(lay,P)) - (lay.holes||[]).reduce((s,h)=>s+ar(clipConvex(h,P)),0); };
  // Halbebene im Fliesenrahmen eines Stuecks als Schnitt anhaengen
  const withCut=(q,a,keep,extra)=>{ const c=Math.cos(-q.rot*D2R), s=Math.sin(-q.rot*D2R);
    return {...q, cuts:[...(q.cuts||[]), {p:rotP(sub(a,q),c,s), n:rotP(keep,c,s), ...extra}]}; };
  // Grenzen: Kanten der Verlegekante (Aussenwand nach aussen, Inseln nach
  // innen) - jeweils mit der Richtung "aus dem Raum hinaus".
  const bounds=[];
  ringsOf(lay).forEach(R=>{ const isHole=R!==lay;
    edgesOf(R).forEach(e=>bounds.push({a:e.a, out:isHole ? {x:-e.n.x,y:-e.n.y} : e.n})); });
  let pieces=[it], changed=false;
  // Insel QUER durch die Fliese (Wandstueck, Durchbruch): die Fliese in die
  // Stuecke beiderseits der Insel teilen. Erkannt daran, dass die
  // Ueberlappung mit der Insel zwei NICHT benachbarte Fliesenkanten
  // beruehrt. Ragt nur eine Inselecke hinein, bleibt die Fliese ganz (die
  // Aussparung macht das Schnittblatt).
  (lay.holes||[]).forEach(h=>{
    pieces=pieces.flatMap(q=>{
      const P=tileCorners(spec,q), I=clipConvex(h,P);
      if(ar(I)<1) return [q];
      const E=edgesOf(P), touched=[];
      E.forEach((e,i)=>{ const L=len(sub(e.b,e.a));
        if(I.some(v=>{ const t=dot(sub(v,e.a),e.d); return t>=-0.5 && t<=L+0.5 && Math.abs(crs(e.d,sub(v,e.a)))<0.5; })) touched.push(i); });
      const n=P.length, across=touched.some(i=>touched.some(j=>{ const d=Math.abs(i-j); return d>1 && d<n-1; }));
      if(!across) return [q];
      // Stuecke jenseits jeder Inselkante; disjunkte, brauchbare behalten
      const cand=edgesOf(h).map(e=>{ const out={x:e.n.x,y:e.n.y};       // aus der Insel hinaus = in den Raum
        const k=dedupe(clipHalf(P,e.a,out)); return {a:e.a, n:out, k, A:ar(k)}; })
        .filter(c=>c.A>=0.01*tileArea(spec,it.kind) && minWidth(c.k)>=MIN_PIECE_W).sort((x,y)=>y.A-x.A);
      const keep=[]; cand.forEach(c=>{ if(!keep.some(k=>convexOverlap(k.k,c.k,0.01))) keep.push(c); });
      if(keep.length<2) return [q];
      changed=true;
      return keep.map(c=>withCut(q,c.a,c.n,{wall:true}));
    });
  });
  // Allgemein: zerfaellt der Raumanteil der Fliese in getrennte Flaechen
  // (Wandvorsprung, Raumzunge, Insel), wird sie geteilt - je Flaeche ein
  // Stueck. Raster im 5-mm-Takt, Zusammenhang per Flutfuellung.
  pieces=pieces.flatMap(q=>{
    const P=tileCorners(spec,q), G=5;
    const xs=P.map(p=>p.x), ys=P.map(p=>p.y), x0=Math.min(...xs), y0=Math.min(...ys);
    const nx=Math.ceil((Math.max(...xs)-x0)/G), ny=Math.ceil((Math.max(...ys)-y0)/G);
    const inP=c=>edgesOf(P).every(e=>dot(sub(c,e.a),e.n)<=0);
    const cell=new Int32Array(nx*ny).fill(-1), pts=[];
    for(let j=0;j<ny;j++) for(let i=0;i<nx;i++){
      const c={x:x0+(i+0.5)*G, y:y0+(j+0.5)*G};
      if(inP(c) && pointInPoly(c,lay) && !(lay.holes||[]).some(h=>pointInPoly(c,h))) cell[j*nx+i]=0;
    }
    const comps=[];
    for(let k=0;k<cell.length;k++){ if(cell[k]!==0) continue;
      const id=comps.length+1, st=[k], C=[]; cell[k]=id;
      while(st.length){ const m=st.pop(), i=m%nx, j=(m-i)/nx; C.push({x:x0+(i+0.5)*G, y:y0+(j+0.5)*G});
        [[1,0],[-1,0],[0,1],[0,-1]].forEach(([di,dj])=>{ const a=i+di, b=j+dj;
          if(a>=0&&b>=0&&a<nx&&b<ny&&cell[b*nx+a]===0){ cell[b*nx+a]=id; st.push(b*nx+a); } }); }
      if(C.length*G*G>=0.01*tileArea(spec,it.kind)) comps.push(C);
    }
    if(comps.length<2) return [q];
    // je Flaeche die groesste Halbebene (Raumseite einer Grenze), die sie
    // ganz enthaelt und keine andere Flaeche beruehrt
    const sides=bounds.map(bd=>{ const inn={x:-bd.out.x,y:-bd.out.y};
      return {bd, inn, k:dedupe(clipHalf(P,bd.a,inn))}; }).filter(c=>ar(c.k)>=1);
    const inside=(c,p)=>dot(sub(p,c.bd.a),c.inn)>=-G;
    const outside=(c,p)=>dot(sub(p,c.bd.a),c.inn)<0;
    const pick=comps.map((C,ci)=>sides.filter(c=>C.every(p=>inside(c,p)) &&
      comps.every((D,di)=>di===ci || D.every(p=>outside(c,p)))).sort((a,b)=>ar(b.k)-ar(a.k))[0]);
    // Umgreift eine Flaeche eine Wandecke (L-foermig), trennt sie keine
    // einzelne Kante. Fehlt genau EINER Flaeche die Kante, bekommt sie den
    // Rest jenseits der Kanten aller anderen; die Wandecke darin wird
    // anschliessend ausgeklinkt.
    const miss=pick.filter(c=>!c).length;
    if(miss>1) return [q];
    const got=pick.filter(Boolean);
    if(got.some((a,i)=>got.some((b,j)=>j>i && convexOverlap(a.k,b.k,0.01)))) return [q];
    const out=got.filter(c=>minWidth(c.k)>=MIN_PIECE_W).map(c=>withCut(q,c.bd.a,c.inn,{wall:true}));
    if(miss===1){
      let r=q, R=P;
      got.forEach(c=>{ r=withCut(r,c.bd.a,c.bd.out,{wall:true}); R=dedupe(clipHalf(R,c.bd.a,c.bd.out)); });
      if(roomPart(R)>=0.01*tileArea(spec,it.kind) && minWidth(R)>=MIN_PIECE_W) out.push(r);
    }
    if(out.length<2) return [q];
    changed=true;
    return out;
  });
  for(let pass=0; pass<3; pass++){
    let again=false;
    for(const bd of bounds){
      const next=[];
      for(const q of pieces){
        const P=tileCorners(spec,q), beyond=dedupe(clipHalf(P,bd.a,bd.out));
        if(ar(beyond)<1){ next.push(q); continue; }
        const keep={x:-bd.out.x, y:-bd.out.y}, inside=dedupe(clipHalf(P,bd.a,keep));
        const rp=roomPart(beyond);
        if(rp<=1){                                               // dahinter kein Raum: abschneiden
          if(ar(inside)>=1){ next.push(withCut(q,bd.a,keep,{wall:true})); changed=again=true; }
          else { changed=again=true; }                           // ganz draussen: faellt weg
          continue;
        }
        // Dahinter Raum UND Nicht-Raum (einspringende Ecke, Inselecke): NICHT
        // zerteilen. Die Fliese bleibt ein Stueck mit ausgeklinkter Ecke -
        // Darstellung, Stueckliste und Schnittblatt ziehen Insel bzw.
        // Aussenbereich ohnehin ab (Aussparung mit Massen ab Fliesenecke).
        next.push(q);
      }
      pieces=next;
    }
    if(!again) break;
  }
  // Dehnungsfugen schneiden wie eine Wand (Abstand 0 - die Fuge ist der Abstand)
  (joints||[]).forEach(j=>{
    const S=jointStrip(j);
    pieces=pieces.flatMap(q=>{
      const P=tileCorners(spec,q);
      if(!convexOverlap(P,S,0.01)) return [q];
      const out=[];
      edgesOf(S).forEach(e=>{ const k=dedupe(clipHalf(P,e.a,e.n));
        // Nur echte Reste behalten: was knapp ueber die Fuge ragt (unter 10 %
        // der Fliese, ~15 mm), ist Ueberstand, kein zweites Stueck.
        if(ar(k)>=0.1*tileArea(spec,it.kind) && minWidth(k)>=MIN_PIECE_W && !out.some(o=>convexOverlap(tileCorners(spec,o),k,0.01))) out.push(withCut(q,e.a,e.n,{wall:true})); });
      changed=true;
      return out;
    });
  });
  // Stuecke ohne nennenswerte Raumflaeche fallen weg
  pieces=pieces.filter(q=>roomPart(tileCorners(spec,q))>=0.01*tileArea(spec,it.kind));
  // Wandecke ragt in die Fliese (einspringende Raumecke, Inselecke): der
  // Keil jenseits BEIDER Wandkanten an dieser Ecke liegt ganz in der Wand
  // -> als Ausklinkung abschneiden. Gerade geht hier nicht, dahinter ist
  // noch Raum.
  pieces=pieces.map(q=>{
    const P=tileCorners(spec,q), c=Math.cos(-q.rot*D2R), sn=Math.sin(-q.rot*D2R), add=[];
    const have=(q.notches||[]).map(n=>n.pts.map(p=>{ const w=rotP(p,Math.cos(q.rot*D2R),Math.sin(q.rot*D2R)); return {x:w.x+q.x, y:w.y+q.y}; }));
    ringsOf(lay).forEach(R=>{ const isHole=R!==lay, E=edgesOf(R), n=E.length;
      E.forEach((e,i)=>{ const f=E[(i+1)%n];
        const o1=isHole?{x:-e.n.x,y:-e.n.y}:e.n, o2=isHole?{x:-f.n.x,y:-f.n.y}:f.n;
        const W=dedupe(clipHalf(clipHalf(P,f.a,o1),f.a,o2));
        if(ar(W)<1 || ar(W)>=ar(P)-1 || roomPart(W)>0.5) return;
        // schon ausgeklinkt?
        if(have.reduce((s2,H)=>s2+ar(clipConvex(H,W)),0)>=ar(W)-1) return;
        add.push({pts:W.map(p=>rotP(sub(p,q),c,sn)), by:'wall'});
      }); });
    if(!add.length) return q;
    changed=true;
    return {...q, notches:[...(q.notches||[]), ...add]};
  });
  // Liegt jenseits EINER Wandkante nur Wand oder bereits Ausgeklinktes,
  // wird gerade geschnitten statt ausgeklinkt (die Kerben dort entfallen).
  pieces=pieces.map(q=>{
    if(!(q.notches||[]).length) return q;
    const cr=Math.cos(q.rot*D2R), sr=Math.sin(q.rot*D2R);
    const NW=q.notches.map(n=>n.pts.map(p=>{ const w=rotP(p,cr,sr); return {x:w.x+q.x, y:w.y+q.y}; }));
    let r=q;
    bounds.forEach(bd=>{
      const P=tileCorners(spec,r), B=dedupe(clipHalf(P,bd.a,bd.out));
      if(ar(B)<1 || ar(B)>=ar(P)-1) return;
      const free=roomPart(B)-NW.reduce((s2,H)=>s2+roomPart(dedupe(clipConvex(B,H))),0);   // nur Raum, den Kerben schon wegnehmen
      if(free>0.01*tileArea(spec,it.kind)) return;          // Splitter bis 1 % der Fliese opfern
      r=withCut(r,bd.a,{x:-bd.out.x,y:-bd.out.y},{wall:true}); changed=true;
    });
    if(r!==q){ const Pn=tileCorners(spec,r);
      r={...r, notches:r.notches.filter((n,i)=>ar(clipConvex(Pn,NW[i]))>=1)};
      if(!r.notches.length) delete r.notches; }
    return r;
  });
  return changed ? pieces : null;
}

// Dehnungsfuge durch eine Fliese: an beiden Streifenkanten teilen. Jeder
// Rest ab 1 % der Fliese bleibt (auch ein schmaler Streifen muss verlegt
// werden); die Schnitte tragen die Fugen-ID bj, damit Aendern/Loeschen der
// Fuge die Fliese wiederherstellen kann. null, wenn die Fuge sie nicht trifft.
function cutByJoint(spec, it, j){
  const S=jointStrip(j), P=tileCorners(spec,it);
  if(!convexOverlap(P,S,0.01)) return null;
  const ar=Q=>Q.length>=3 ? Math.abs(polyArea(Q)) : 0, out=[];
  const c=Math.cos(-it.rot*D2R), s=Math.sin(-it.rot*D2R);
  // Nur die beiden LAENGSkanten des Streifens teilen. Die kurzen Enden
  // (Fuge endet an Wand- oder Inselecke) schnitten sonst ein drittes Stueck
  // "hinter dem Fugenende" ab - das ueberlappte den Rest auf einer Seite,
  // und der fiel dann weg.
  const dj=unit(sub(j.b,j.a));
  edgesOf(S).filter(e=>Math.abs(dot(e.n,dj))<0.5).forEach(e=>{
    const k=dedupe(clipHalf(P,e.a,e.n));
    if(ar(k)>=0.01*tileArea(spec,it.kind) && minWidth(k)>=MIN_PIECE_W && !out.some(o=>convexOverlap(tileCorners(spec,o),k,0.01)))
      out.push({...it, cuts:[...(it.cuts||[]), {p:rotP(sub(e.a,it),c,s), n:rotP(e.n,c,s), bj:j.id}]});
  });
  return out;
}

// Kante einer Fliese parallel verschieben. a,b: die Kante (Rahmen), t: Weg
// nach aussen in mm (negativ = nach innen). Liegt auf der Kante ein Schnitt,
// wandert er; reicht er dann ueber die ganze Fliese hinaus, faellt er weg -
// die Grundfliese ist die Grenze. Eine Originalkante kann nur nach innen
// (dann neuer Schnitt). Nach innen bleibt mindestens 1 % der Fliese.
// Liefert {item, t (tatsaechlich), atMax} oder null.
function moveTileEdge(spec, it, a, b, t){
  const c=Math.cos(-it.rot*D2R), s=Math.sin(-it.rot*D2R), L=q=>rotP(sub(q,it),c,s);
  const la=L(a), lb=L(b), d=unit(sub(lb,la));
  const base=tileShape(spec,it.kind), ar=Q=>Q.length>=3 ? Math.abs(polyArea(Q)) : 0;
  // Nur Schnitte, die die Form gerade wirklich begrenzen. Ein frueherer Schnitt,
  // den ein spaeterer, tieferer verdeckt, bleibt sonst gespeichert - und die
  // Kante bliebe beim Herausziehen an ihm haengen, obwohl die Fliese laenger
  // sein koennte. Die Form aendert sich durch das Weglassen nicht.
  let cur=base; (it.cuts||[]).forEach(k=>{ cur=dedupe(clipHalf(cur,k.p,k.n)); });
  const onLine=k=>cur.some((v,i)=>{ const w=cur[(i+1)%cur.length];
    return Math.abs(dot(sub(v,k.p),k.n))<0.5 && Math.abs(dot(sub(w,k.p),k.n))<0.5 && len(sub(w,v))>0.5; });
  const cuts=(it.cuts||[]).filter(onLine);
  if(cuts.length!==(it.cuts||[]).length){ it={...it}; if(cuts.length) it.cuts=cuts; else delete it.cuts; }
  const ki=cuts.findIndex(k=>Math.abs(dot(sub(la,k.p),k.n))<0.5 && Math.abs(dot(sub(lb,k.p),k.n))<0.5);
  // innen-Normale der Kante: zur Fliesenmitte
  const cen=cenOf(base); let nIn={x:-d.y, y:d.x}; if(dot(sub(cen,la),nIn)<0) nIn={x:-nIn.x,y:-nIn.y};
  const minA=0.01*tileArea(spec,it.kind);
  const shapeWith=cs=>{ let P=base; cs.forEach(k=>{ P=dedupe(clipHalf(P,k.p,k.n)); }); return P; };
  const others=ki>=0 ? cuts.filter((_,i)=>i!==ki) : cuts;
  // Weg nach innen begrenzen: Reststueck >= 1 %
  const at=tt=>{ const p0=ki>=0 ? cuts[ki].p : la, nk=ki>=0 ? cuts[ki].n : nIn;
    return {p:{x:p0.x-nk.x*tt, y:p0.y-nk.y*tt}, n:nk}; };
  if(ki<0 && t>=0) return {item:it, t:0, atMax:true};           // Originalkante: groesser geht nicht
  let tt=t;
  if(tt<0){ let lo=tt, hi=0;
    if(ar(shapeWith([...others, {...(ki>=0?cuts[ki]:{}), ...at(lo)}]))<minA){
      for(let i=0;i<40;i++){ const m=(lo+hi)/2; if(ar(shapeWith([...others, {...(ki>=0?cuts[ki]:{}), ...at(m)}]))<minA) lo=m; else hi=m; }
      tt=hi; } }
  if(ki<0){ const k=at(tt); return {item:{...it, cuts:[...cuts, {p:k.p, n:k.n}]}, t:tt, atMax:false}; }
  const k={...cuts[ki], ...at(tt)};
  // Schnitt laeuft ueber die Grundfliese hinaus -> entfaellt (Maximum erreicht)
  const free=base.every(v=>dot(sub(v,k.p),k.n)>=-1e-6);
  const nc=free ? others : cuts.map((x,i)=>i===ki ? k : x);
  const out={...it}; if(nc.length) out.cuts=nc; else delete out.cuts;
  const tmax=-Math.min(...base.map(v=>dot(sub(v,cuts[ki].p),cuts[ki].n)));
  return {item:out, t:free ? tmax : tt, atMax:free};
}

// Konvexe Huelle (Andrew's Monotone Chain), gegen den Uhrzeigersinn.
function hull(points){
  const P=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y), lo=[], up=[];
  for(const p of P){ while(lo.length>=2 && crs(sub(lo[lo.length-1],lo[lo.length-2]),sub(p,lo[lo.length-2]))<=1e-9) lo.pop(); lo.push(p); }
  for(const p of P.slice().reverse()){ while(up.length>=2 && crs(sub(up[up.length-1],up[up.length-2]),sub(p,up[up.length-2]))<=1e-9) up.pop(); up.push(p); }
  return dedupe(lo.slice(0,-1).concat(up.slice(0,-1)));
}
// Verbinden: mehrere Stuecke zu EINER Fliese zusammenfassen. Die Huelle der
// Stuecke darf gegenueber ihrer Summe nur um die Fugen zwischen ihnen
// wachsen (sonst bilden sie keine zusammenhaengende Form), und sie muss aus
// einer ganzen Fliese geschnitten werden koennen: probiert werden die Sorten
// und Drehungen der Stuecke (je auch um 180°). Im Fliesenrahmen ist eine
// L-Fliese 0<=y<=w, 0<=x-k*y<=l; eine Verschiebung existiert genau dann,
// wenn die Huelle in beiden Richtungen hineinpasst. Liefert {item} oder
// {reason}.
function mergeTiles(spec, items, ring){
  if(items.length<2) return {reason:'Mindestens zwei Stücke auswählen.'};
  const polys=items.map(it=>tileCorners(spec,it));
  const H=hull(polys.flat()), ar=Q=>Q.length>=3 ? Math.abs(polyArea(Q)) : 0;
  // Gemessen im Raum: was die Huelle ausserhalb des Raums oder in einer
  // Insel zusaetzlich abdeckt, ist eine Ausklinkung, keine Luecke.
  const inRoom=Q=>!ring ? ar(Q) : Math.max(0, ar(clipConvex(ring,Q)) - (ring.holes||[]).reduce((s,h)=>s+ar(clipConvex(h,Q)),0));
  const sum=polys.reduce((s,Q)=>s+inRoom(Q),0), extra=inRoom(H)-sum;
  // Erlaubt: Fugen zwischen den Stuecken (Fuge+1 mm entlang der laengsten Ausdehnung je Paar)
  const allow=(items.length-1)*(spec.joint+1)*Math.hypot(spec.l+spec.w/Math.tan(spec.angle*D2R), spec.w);
  if(extra>allow) return {reason:`Die Stücke bilden keine zusammenhängende Form (Lücke ${Math.round(extra/100)} cm²).`};
  const kinds=[...new Set(items.map(it=>it.kind))], rots=[];
  items.forEach(it=>[it.rot, normDeg(it.rot+180)].forEach(r=>{ if(!rots.some(x=>Math.abs(normDeg(x-r+180)-180)<1e-6)) rots.push(r); }));
  for(const kind of kinds) for(const rot of rots){
    const def=tileDef(spec,kind), k=def.shape==='chevron'?(kind==='R'||kind.endsWith(':R')?-1:1)/Math.tan(def.angle*D2R):0;            // x-Versatz je mm y
    const c=Math.cos(-rot*D2R), s=Math.sin(-rot*D2R);
    const Hl=H.map(p=>rotP(p,c,s));                                  // im Fliesenrahmen, unverschoben
    const ys=Hl.map(p=>p.y), us=Hl.map(p=>p.x-k*p.y), tol=0.5;
    if(Math.max(...ys)-Math.min(...ys)>def.w+tol) continue;
    if(Math.max(...us)-Math.min(...us)>def.l+tol) continue;
    const ty=-Math.min(...ys), tx=-Math.min(...us)-k*Math.min(...ys)+k*(Math.min(...ys)+ty);
    const Ht=Hl.map(p=>({x:p.x+tx, y:p.y+ty}));
    const shape=tileShape(spec,kind), onShape=(a,b)=>edgesOf(shape).some(e=>{
      const off=q=>Math.abs(crs(e.d,sub(q,e.a)));
      return off(a)<0.5 && off(b)<0.5; });
    if(!edgesOf(shape).every(e=>Ht.every(p=>dot(sub(p,e.a),e.n)<=0.5))) continue;
    const cuts=[];
    edgesOf(Ht).forEach(e=>{ if(!onShape(e.a,e.b)) cuts.push({p:{x:e.a.x,y:e.a.y}, n:{x:-e.n.x,y:-e.n.y}}); });
    const cr=Math.cos(rot*D2R), sr=Math.sin(rot*D2R), pos=rotP({x:-tx,y:-ty},cr,sr);
    const it={id:items[0].id, kind, x:pos.x, y:pos.y, rot:normDeg(rot)};
    if(cuts.length) it.cuts=cuts;
    return {item:it};
  }
  return {reason:'Passt nicht aus einer ganzen Fliese — die verbundene Form ist größer als eine Fliese oder liegt quer zu ihr.'};
}

// Ecke an Kreuzung: die Ecke vi der Fliese movIt (mit ihrer Gruppe) soll an
// den Punkt X, an dem sich Ecken anderer Fliesen treffen, und dort die
// Luecke sinnvoll fuellen. Kandidaten-Drehungen: jede der beiden Kanten an
// der Ecke parallel (beide Richtungen) zu einer Fliesenkante, die an X
// endet. Je Kandidat: um die Ecke drehen, Ecke auf X, Fugen einrasten
// (snapGroup gegen die Nachbarn an X). Verworfen wird, was eine Fliese
// ueberlappt oder die Ecke weiter als reach von X entfernt. Gewinner:
// kleinste Drehung, dann kleinste Restbewegung. Liefert die neuen Lagen der
// Gruppe oder null.
function matchCorner(spec, group, movIt, vi, X, others, reach){
  const P0=tileCorners(spec,movIt), V=P0[vi];
  const d1=unit(sub(P0[(vi+1)%P0.length],V)), d2=unit(sub(P0[(vi+P0.length-1)%P0.length],V));
  const near=spec.joint*3+(reach||20);
  const oP=others.map(it=>tileCorners(spec,it));
  const atX=oP.filter(Q=>Q.some(q=>len(sub(q,X))<=near));
  const dirs=[];
  atX.forEach(Q=>Q.forEach((q,i)=>{ const r=Q[(i+1)%Q.length];
    if(len(sub(q,X))<=near || len(sub(r,X))<=near){ const d=unit(sub(r,q)); dirs.push(d, {x:-d.x,y:-d.y}); } }));
  if(!dirs.length) return null;
  const targets=snapTargets(spec, atX, null, []);
  const ang=(u,v)=>Math.atan2(crs(u,v),dot(u,v))/D2R;
  const ths=[];
  [d1,d2].forEach(d=>dirs.forEach(t=>{ const th=ang(d,t); if(!ths.some(x=>Math.abs(x-th)<0.01)) ths.push(th); }));
  let best=null;
  for(const th of ths){
    const m0={dth:th, px:V.x, py:V.y, dx:X.x-V.x, dy:X.y-V.y};
    let g=group.map(it=>moveItem(it,m0));
    const r=snapGroup(g.map(it=>tileCorners(spec,it)), targets, near, 3);
    if(r) g=g.map(it=>moveItem(it,r.m));
    const gp=g.map(it=>tileCorners(spec,it));
    if(gp.some(Q=>oP.some(O=>convexOverlap(Q,O,0.05)))) continue;
    const mv=g.find(it=>it.id===movIt.id), Vn=tileCorners(spec,mv)[vi];
    const off=len(sub(Vn,X));
    if(off>near) continue;
    const score=Math.abs(th)+off*0.05;
    if(!best || score<best.score) best={score, items:g, th, off};
  }
  return best;
}

// Verlegekante: der Raum, nach innen versetzt um die Fuge an jeder Wand.
// gapOf(idA, idB) liefert die Fuge der Wand zwischen zwei Ecken (globale
// Randfuge oder eine markierte Wandfuge). Aussenring nach innen, Inseln nach
// aussen - beides "in den Raum". Jede Kante wird parallel verschoben, die
// Ecken sind die Schnittpunkte benachbarter Kanten; die Ecken-IDs bleiben.
function insetRoom(ring, gapOf){
  const one=(R, sg)=>{
    const E=edgesOf(R);
    const L=E.map((e,i)=>{ const g=gapOf(R[i].id, R[(i+1)%R.length].id)||0, n={x:sg*e.n.x*g, y:sg*e.n.y*g};
      return {p:{x:e.a.x+n.x, y:e.a.y+n.y}, d:e.d}; });
    return R.map((pt,i)=>{
      const A=L[(i+L.length-1)%L.length], B=L[i], den=crs(A.d,B.d);
      if(Math.abs(den)<1e-9) return {x:B.p.x, y:B.p.y, id:pt.id};
      const t=crs(sub(B.p,A.p),B.d)/den;
      return {x:A.p.x+A.d.x*t, y:A.p.y+A.d.y*t, id:pt.id};
    });
  };
  const out=one(ring,-1); out.holes=(ring.holes||[]).map(h=>one(h,1));
  return out;
}

// Fluchten: Kante e der bewegten Fliese auf die Gerade der Bezugskante ref
// ({a,b}) legen. Kleinste Drehung, die beide parallel macht (Richtung egal),
// um die Kantenmitte, dann quer auf die Gerade schieben. Laengs bleibt die
// Lage. Liefert die starre Bewegung m (fuer die ganze Auswahl nutzbar).
function alignMove(ref, e){
  const dr=unit(sub(ref.b,ref.a)), de=unit(sub(e.b,e.a));
  let dth=Math.atan2(crs(de,dr), dot(de,dr))/D2R;
  if(dth>90) dth-=180; if(dth<-90) dth+=180;
  const mid={x:(e.a.x+e.b.x)/2, y:(e.a.y+e.b.y)/2};
  const nr={x:-dr.y, y:dr.x}, off=dot(sub(ref.a,mid),nr);
  return {dth, px:mid.x, py:mid.y, dx:nr.x*off, dy:nr.y*off};
}
// Rechter Winkel: Kante e um ihre Mitte so drehen, dass sie senkrecht auf
// ref steht (kleinste Drehung), ohne Verschiebung.
function squareMove(ref, e){
  const d=unit(sub(ref.b,ref.a)), dr={x:-d.y, y:d.x}, de=unit(sub(e.b,e.a));
  let dth=Math.atan2(crs(de,dr), dot(de,dr))/D2R;
  if(dth>90) dth-=180; if(dth<-90) dth+=180;
  return {dth, px:(e.a.x+e.b.x)/2, py:(e.a.y+e.b.y)/2, dx:0, dy:0};
}
// Fluchten mit Fuge. Bezug: Kante ri der Fliese refIt, bewegt wird die
// Kante mi von movIt (die Bewegung gilt dann fuer die ganze Gruppe).
//  - Kanten zeigen nach dem Drehen in DIESELBE Richtung: fluchten, also
//    Abstand 0 zur Bezugsgeraden. Danach laengs nachruecken, bis die beiden
//    Fliesen genau eine Fuge Abstand haben - gemessen quer zu den Kanten,
//    an denen sie sich wirklich gegenueberstehen (bei Chevron die
//    Schraegkanten). Nur wenn das Nachruecken kurz ist (<= reach).
//  - Kanten stehen sich GEGENUEBER: parallel mit genau einer Fuge Abstand.
function alignTiles(spec, refIt, ri, movIt, mi, reach=150){
  const Er=edgesOf(tileCorners(spec,refIt))[ri], Em=edgesOf(tileCorners(spec,movIt))[mi];
  const m=alignMove({a:Er.a,b:Er.b}, {a:Em.a,b:Em.b});
  const c=Math.cos(m.dth*D2R), s=Math.sin(m.dth*D2R), nm=rotP(Em.n,c,s);
  const facing=dot(nm,Er.n)<0;
  // alignMove legt auf die Gerade (Abstand 0); gegenueber: um die Fuge raus
  if(facing){ m.dx+=Er.n.x*spec.joint; m.dy+=Er.n.y*spec.joint; return {m, facing}; }
  const moved=tileCorners(spec, moveItem(movIt,m));
  const dr=Er.d; let best=null;
  for(const e of edgesOf(tileCorners(spec,refIt))) for(const f of edgesOf(moved)){
    if(-dot(e.n,f.n)<Math.cos(2*D2R)) continue;
    const k=dot(dr,e.n); if(Math.abs(k)<0.2) continue;             // parallel zur Flucht: schiebt nicht
    const d0=dot(sub(f.a,e.a),e.n), sl=(spec.joint-d0)/k;
    if(Math.abs(sl)>reach) continue;
    if(!best || Math.abs(sl)<Math.abs(best)) best=sl;
  }
  if(best!=null){ m.dx+=dr.x*best; m.dy+=dr.y*best; }
  return {m, facing, slid:best};
}
// Naechste Fliesenkante zu p innerhalb tol: {item, i, a, b, dist}
function edgeAt(spec, items, p, tol){
  let best=null;
  items.forEach(it=>{ const P=tileCorners(spec,it);
    P.forEach((a,i)=>{ const b=P[(i+1)%P.length], d=sub(b,a), L2=dot(d,d)||1;
      const t=Math.max(0,Math.min(1,dot(sub(p,a),d)/L2)), q={x:a.x+d.x*t, y:a.y+d.y*t}, dist=len(sub(p,q));
      if(dist<=tol && (!best || dist<best.dist)) best={item:it, i, a, b, dist}; }); });
  return best;
}

// Kanten von Ausklinkungen, die IM Inneren der Fliese liegen (nicht auf
// ihrem Rand) - die kann man greifen und parallel ziehen.
function notchEdgeAt(spec, items, p, tol){
  let best=null;
  items.forEach(it=>{
    const P=tileCorners(spec,it), onRim=(a,b)=>edgesOf(P).some(e=>Math.abs(crs(e.d,sub(a,e.a)))<0.5 && Math.abs(crs(e.d,sub(b,e.a)))<0.5);
    tileNotches(spec,it).forEach((N,ni)=>N.forEach((a,ei)=>{
      const b=N[(ei+1)%N.length]; if(onRim(a,b)) return;
      const d=sub(b,a), L2=dot(d,d)||1, t=Math.max(0,Math.min(1,dot(sub(p,a),d)/L2)), q={x:a.x+d.x*t, y:a.y+d.y*t}, dist=len(sub(p,q));
      if(dist<=tol && (!best || dist<best.dist)) best={item:it, ni, ei, a, b, dist}; })); });
  return best;
}
// Kante ei der Ausklinkung ni um t verschieben: t>0 = in die Kerbe hinein
// (Kerbe schrumpft, Fliese waechst), t<0 = Kerbe waechst (nie ueber die
// Grundfliese hinaus). Schrumpft die Kerbe auf nichts, faellt sie weg.
function moveNotchEdge(spec, it, ni, ei, t){
  const nt=it.notches[ni], R=nt.pts.map((q,i)=>({...q, id:'n'+i}));
  const ccw=polyArea(R)>0, ring=ccw ? R : R.slice().reverse();
  const eid=ccw ? ei : (R.length-2-ei+R.length)%R.length;          // Kante in der gedrehten Reihenfolge
  const mv=insetRoom(ring, (a)=>a===ring[eid].id ? t : 0);
  const pts=clipConvex(mv, tileShape(spec,it.kind));
  // Wie tief ist die Kerbe senkrecht zu dieser Kante? Wird die Kante so weit
  // (oder weiter) hineingezogen, ist die Kerbe weg.
  const e=edgesOf(ring)[eid], depth=Math.max(...ring.map(q=>dot(sub(q,e.a),{x:-e.n.x,y:-e.n.y})));
  const notches=it.notches.slice();
  if(t>=depth-0.5 || pts.length<3 || Math.abs(polyArea(pts))<1) notches.splice(ni,1);
  else notches[ni]={...nt, pts:pts.map(q=>({x:q.x,y:q.y}))};
  const out={...it}; if(notches.length) out.notches=notches; else delete out.notches;
  return {item:out, removed:notches.length<it.notches.length};
}


// Liegt die Fuge im Raum? Stichproben innen und keine Wand echt gekreuzt
// (die Endpunkte liegen AUF Waenden - Beruehrung dort zaehlt nicht).
function jointValid(ring, a, b){
  if(len(sub(b,a))<50) return false;
  // Eine "Fuge" auf der Wand entlang ist keine - die Stichproben laegen dort
  // auf dem Rand, und pointInRing entscheidet am Rand willkuerlich.
  for(const f of [0.25,0.5,0.75]){
    const n=nearestOnRing(ring,{x:a.x+(b.x-a.x)*f, y:a.y+(b.y-a.y)*f});
    if(n && n.dist<1) return false;
  }
  for(const f of [0.25,0.5,0.75])
    if(!pointInRoom({x:a.x+(b.x-a.x)*f, y:a.y+(b.y-a.y)*f}, ring)) return false;
  const d=sub(b,a);
  for(const R of ringsOf(ring)) for(let i=0;i<R.length;i++){
    const c=R[i], e=sub(R[(i+1)%R.length],c);
    const den=crs(d,e); if(Math.abs(den)<1e-9) continue;
    const t=crs(sub(c,a),e)/den, u=crs(sub(c,a),d)/den;
    if(t>1e-3 && t<1-1e-3 && u>1e-3 && u<1-1e-3) return false;
  }
  return true;
}
// Lage eines Fugenendpunkts fuer die Bemassung: Abstand zur naechsten
// Raumecke auf derselben Wand.
// Liefert den Eckpunkt selbst (mit id, falls der Aufrufer sie mitgibt).
function endDim(ring, p){
  const n=nearestOnRing(ring,p);
  if(!n) return null;
  const R=n.r, a=R[n.i], b=R[(n.i+1)%R.length], L=len(sub(b,a));
  const da=n.t*L, db=(1-n.t)*L;
  if(da<0.5) return {corner:a, dist:0};
  if(db<0.5) return {corner:b, dist:0};
  return da<=db ? {corner:a, dist:da} : {corner:b, dist:db};
}

// Druckbild: Drehung und Massstab, damit der Raum das Blatt fuellt.
// Kandidaten sind die Wandrichtungen (Raum liegt dann achsparallel), je
// Blattbox (Hoch-/Querformat haben verschieden viel Platz neben der
// Fusszeile). boxes: [{w,h,landscape}] in Blatt-mm. Liefert die Kombination
// mit dem groessten Massstab: {rot (Grad), scale (Blatt-mm je Raum-mm),
// box, w, h, x0, y0 (gedrehte Raum-Box)}.
function printLayout(ring, boxes){
  let best=null;
  const cand=new Set([0]);
  edgesOf(ring).forEach(e=>cand.add(Math.round(-Math.atan2(e.d.y,e.d.x)/D2R*1e4)/1e4));
  for(const deg of cand){
    const c=Math.cos(deg*D2R), s=Math.sin(deg*D2R);
    const R=ring.map(p=>rotP(p,c,s));
    const x0=Math.min(...R.map(p=>p.x)), y0=Math.min(...R.map(p=>p.y));
    const w=Math.max(...R.map(p=>p.x))-x0, h=Math.max(...R.map(p=>p.y))-y0;
    for(const box of boxes){
      const scale=Math.min(box.w/w, box.h/h);
      if(!best || scale>best.scale*1.0001) best={rot:deg, scale, box, w, h, x0, y0};
    }
  }
  return best;
}
// Rahmen-Punkt -> Blatt-mm fuer ein Layout (Ursprung links oben der Box).
function printPt(L, p){
  const c=Math.cos(L.rot*D2R), s=Math.sin(L.rot*D2R), r=rotP(p,c,s);
  return {x:(r.x-L.x0)*L.scale, y:(r.y-L.y0)*L.scale};
}

// Gespeicherte Fliesen einlesen - tolerant: fehlt das Feld (aeltere Raeume,
// Fremdimporte), gibt es eine leere Verlegung mit Standardmassen. Kaputte
// Eintraege fallen einzeln weg statt den Raum unlesbar zu machen.
function normTiles(o){
  const spec={...TILE_DEF};
  if(o && o.spec) for(const k in TILE_DEF) if(Number.isFinite(o.spec[k]) && o.spec[k]>=0) spec[k]=o.spec[k];
  if(!(spec.w>0)) spec.w=TILE_DEF.w;
  if(!(spec.l>0)) spec.l=TILE_DEF.l;
  spec.angle=Math.min(90, Math.max(5, spec.angle||TILE_DEF.angle));
  const shapes=['hexagon','chevron','rectangle','triangle'], seenDefs=new Set();
  spec.set=(o && o.spec && Array.isArray(o.spec.set) ? o.spec.set : [{id:'legacy',name:'Chevron',shape:'chevron',...spec}]).filter(d=>d && typeof d.id==='string' && /^(legacy|tile-[a-z0-9-]+)$/.test(d.id) && !seenDefs.has(d.id) && seenDefs.add(d.id) && shapes.includes(d.shape)).map(d=>({id:d.id,name:typeof d.name==='string'?d.name.slice(0,60):d.shape,shape:d.shape,w:Number.isFinite(d.w)&&d.w>0?d.w:300,l:Number.isFinite(d.l)&&d.l>0?d.l:300,thick:Number.isFinite(d.thick)&&d.thick>0?d.thick:10,angle:Number.isFinite(d.angle)?Math.max(5,Math.min(90,d.angle)):45})).map(regularTileDef);
  const validKinds=new Set(spec.set.flatMap(tileKinds));
  const fin=(...v)=>v.every(Number.isFinite);
  const items=(o && Array.isArray(o.items) ? o.items : [])
    .filter(it=>it && validKinds.has(it.kind) && fin(it.x,it.y,it.rot))
    .map(it=>{
      const out={id:it.id, kind:it.kind, x:it.x, y:it.y, rot:normDeg(it.rot)};
      if(Number.isInteger(it.from)) out.from=it.from;
      const cuts=(Array.isArray(it.cuts)?it.cuts:[]).filter(k=>k && k.p && k.n
        && fin(k.p.x,k.p.y,k.n.x,k.n.y) && Math.hypot(k.n.x,k.n.y)>0.5)
        .map(k=>{ const c={p:{x:k.p.x,y:k.p.y}, n:{x:k.n.x,y:k.n.y}};
          if(Number.isInteger(k.m)) c.m=k.m;
          if(k.pv && fin(k.pv.x,k.pv.y)) c.pv={x:k.pv.x,y:k.pv.y};
          if(k.pe && fin(k.pe.x,k.pe.y)) c.pe={x:k.pe.x,y:k.pe.y};
          if(k.wall===true) c.wall=true;
          if(Number.isInteger(k.by)) c.by=k.by;
          if(Number.isInteger(k.bj)) c.bj=k.bj;
          if(Number.isInteger(k.src)) c.src=k.src;
          return c; });
      if(cuts.length) out.cuts=cuts;
      const notches=(Array.isArray(it.notches)?it.notches:[]).filter(nt=>nt && Array.isArray(nt.pts) && nt.pts.length>=3
        && nt.pts.every(q=>q && fin(q.x,q.y))).map(nt=>({pts:nt.pts.map(q=>({x:q.x,y:q.y})), ...(Number.isInteger(nt.by)?{by:nt.by}:{})}));
      if(notches.length) out.notches=notches;
      return out;
    });
  const joints=(o && Array.isArray(o.joints) ? o.joints : [])
    .filter(j=>j && j.a && j.b && fin(j.a.x,j.a.y,j.b.x,j.b.y) && Number.isFinite(j.width) && j.width>0)
    .map(j=>({id:j.id, a:{x:j.a.x,y:j.a.y}, b:{x:j.b.x,y:j.b.y}, width:j.width}));
  // Wandfugen (Toleranz-/Dehnungsfuge an einer Wand): an den Ecken-IDs der
  // Wand festgemacht, nicht an Koordinaten - die aendern sich mit dem Aufmass.
  const wallJoints=(o && Array.isArray(o.wallJoints) ? o.wallJoints : [])
    .filter(w=>w && typeof w.a==='string' && typeof w.b==='string' && Number.isFinite(w.width) && w.width>=0)
    .map(w=>({a:w.a, b:w.b, width:w.width, tol:Number.isFinite(w.tol)&&w.tol>=0 ? w.tol : 0}));
  let seq=1;
  items.concat(joints).forEach(x=>{ if(Number.isInteger(x.id) && x.id>=seq) seq=x.id+1; });
  items.concat(joints).forEach(x=>{ if(!Number.isInteger(x.id)) x.id=seq++; });
  // Doppelte IDs (Handimport) entzerren - Auswahl haengt an der ID.
  const seen=new Set();
  items.concat(joints).forEach(x=>{ if(seen.has(x.id)) x.id=seq++; seen.add(x.id); });
  return {spec, items, joints, wallJoints, seq};
}

globalThis.TILES={ regularTileDef, tileDef, tileKinds, tileOther, tileArea, TILE_DEF, tileShape, tileCorners, toTile, polyArea, edgesOf, frameOf, toLocal, toWorldF,
  clipConvex, clipHalf, convexOverlap, jointStrip, snapTargets, snapGroup, movePt, moveItem, snapAngle, normDeg,
  tilePieces, tileStatus, cutList, pieceDims, tileStats, extendItems, nearestOnRing, jointEndSnap, jointValid,
  pointInRing, pointInRoom, ringsOf, endDim, printLayout, printPt, normTiles, miterPair, miterAt, miterInfo, miterSnapPoints, tileNotches, tileOverlapArea, unionArea, minWidth,
  rayToRing, jointRayEnd, alignMove, squareMove, alignTiles, edgeAt, notchEdgeAt, moveNotchEdge, insetRoom, trimBy, matchCorner, trimToRoom, cutByJoint, mergeTiles, hull, moveTileEdge, pairDims, jointCheck, jointOffsets, mergeNotch, nestCuts, cutPlan, replayPlan, markOn, markPoint, uncovered, groutAmount, spacerCount };
})();
