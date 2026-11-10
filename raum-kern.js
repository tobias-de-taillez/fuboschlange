// raum-kern.js – Rechenkern der Werkzeugfamilie: Ausgleichung, Analyse,
// Vorschläge (docs/adr/0001-familie-mit-geteilten-js-dateien.md). DOM-frei,
// läuft in node test/run.mjs wie im Browser. Unverändert aus dem früheren
// Block "core" von raumaufmass.html; legt globalThis.CORE an.
// Braucht: nichts.
"use strict";
// ================= Konstanten =================
const TOL_RANK = 1e-8;   // Rangtoleranz, relativ zur größten Spaltennorm
const TOL_RED  = 0.01;   // darunter gilt eine Messung als nicht prüfbar
const TOL_MODE = 0.05;   // Anteil am Flex-Mode -> Pfeil statt Ellipse
const SIGMA_DEF = 5;     // angenommene Standardabweichung je Messung, mm
const SUGGEST_CHECK_MAX = 3;  // Deckel der Vorschlaege zur Pruefbarkeit

// ================= Grundlagen =================
const dist=(p,q)=>Math.hypot(p.x-q.x, p.y-q.y);
const idx=pts=>{ const m={}; pts.forEach((p,i)=>m[p.id]=i); return m; };
const activeMeas=meas=>meas.filter(m=>m.on!==false);
// Raumnamen, Öffnungs-ids usw. kommen vom Nutzer oder aus Dateien und landen
// in innerHTML - einmal richtig entschaerfen statt an jeder Stelle nur die
// spitze Klammer. Hier statt im UI-Block, damit Küche und Selbsttests es
// ohne DOM nutzen können.
const ESC={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const escapeHtml=s=>String(s==null?'':s).replace(/[&<>"']/g, c=>ESC[c]);

// Festgelegt ("exakt"): der Nutzer ist sich sicher. Statt einer harten
// Nebenbedingung ein starkes Gewicht - sigma/FIX_WT = 0,125 mm bei 5 mm.
// Dieselbe Groessenordnung wie ORTHO_WT, mit der LM hier nachweislich
// konvergiert; 1e6 o. ae. ruiniert die Kondition.
const FIX_WT=40;
// Gewicht einer Zeile, normiert auf SIGMA_DEF: eine Lasermessung (5 mm)
// zaehlt 1, eine Laufmessung (IMU, 200 mm) 1/40. Frueher ignorierte solve
// sigma ganz - die Laufmessung zog so stark an der Form wie der Laser.
// wt: Hilfsstrecken (rechte Winkel, siehe orthoFit) bringen ihr Gewicht
// selbst mit. fix: vom Nutzer als exakt festgelegt, sigma/FIX_WT.
const sigOf=m=>(Number.isFinite(m.sigma) && m.sigma>0) ? m.sigma : SIGMA_DEF;
const rowWt=m=>m.wt || SIGMA_DEF/sigOf(m)*(m.fix ? FIX_WT : 1);

// Festgelegte Winkel {a, c, b, deg}: der Winkel an Ecke c zwischen c-a und
// c-b, ungerichtet 0..180 Grad (eine einspringende 270-Grad-Ecke ist also
// ebenfalls "90"). Getrennt von meas gefuehrt - alles, was meas liest,
// erwartet eine Strecke a-b-d. Zeilen mit fehlendem Punkt fallen weg.
function angleRows(pts, angs){
  const I=idx(pts);
  return (angs||[]).filter(g=>g.on!==false && I[g.a]!=null && I[g.b]!=null && I[g.c]!=null);
}
// Residuum in Millimetern: Winkelfehler (rad) mal kuerzerem Schenkel - so
// viel verschiebt der Winkelfehler den naeheren Nachbarpunkt quer. Damit
// steht die Zeile auf derselben Skala wie eine Strecke und das Gewicht
// FIX_WT bedeutet dasselbe.
function angleGeom(pts, I, g){
  const A=pts[I[g.a]], Cc=pts[I[g.c]], B=pts[I[g.b]];
  const ux=A.x-Cc.x, uy=A.y-Cc.y, vx=B.x-Cc.x, vy=B.y-Cc.y;
  const lu2=ux*ux+uy*uy||1e-9, lv2=vx*vx+vy*vy||1e-9;
  const phi=Math.atan2(ux*vy-uy*vx, ux*vx+uy*vy);
  const s=Math.min(Math.sqrt(lu2), Math.sqrt(lv2))*FIX_WT;
  return {ux,uy,vx,vy,lu2,lv2,phi,s};
}
function angleRes(pts, I, g){
  const G=angleGeom(pts, I, g);
  return (Math.abs(G.phi)-g.deg*Math.PI/180)*G.s;
}
const angleDeg=(pts, g)=>Math.abs(angleGeom(pts, idx(pts), g).phi)*180/Math.PI;

function residuals(pts, meas, angs){
  const I=idx(pts);
  const r=activeMeas(meas).map(m=>(dist(pts[I[m.a]], pts[I[m.b]]) - m.d)*rowWt(m));
  angleRows(pts, angs).forEach(g=>r.push(angleRes(pts, I, g)));
  return r;
}

// Zeile je Messung: d|xa-xb|/dxa = +u, d/dxb = -u, alles andere 0.
// Winkel phi = arg(v) - arg(u), u=A-C, v=B-C: dphi/dA = (uy,-ux)/|u|^2,
// dphi/dB = (-vy,vx)/|v|^2, dphi/dC = -(Summe). Fuer |phi| mal Vorzeichen.
// Der Schenkelfaktor s gilt als konstant - am Ziel ist der Winkelfehler 0,
// seine Ableitung faellt dort also weg.
function jacobian(pts, meas, angs){
  const I=idx(pts), n=pts.length;
  const rows=activeMeas(meas).map(m=>{
    const a=I[m.a], b=I[m.b], pa=pts[a], pb=pts[b];
    const L=dist(pa,pb)||1e-9;   // ponytail: zwei deckungsgleiche Punkte sind
                                 // Eingabefehler, nicht Mathematik - nur kein NaN
    const ux=(pa.x-pb.x)/L, uy=(pa.y-pb.y)/L;
    const row=new Array(2*n).fill(0), w=rowWt(m);
    row[2*a]=ux*w; row[2*a+1]=uy*w; row[2*b]=-ux*w; row[2*b+1]=-uy*w;
    return row;
  });
  angleRows(pts, angs).forEach(g=>{
    const G=angleGeom(pts, I, g), sg=(G.phi>=0?1:-1)*G.s;
    const ax=G.uy/G.lu2*sg, ay=-G.ux/G.lu2*sg, bx=-G.vy/G.lv2*sg, by=G.vx/G.lv2*sg;
    const row=new Array(2*n).fill(0), a=I[g.a], b=I[g.b], c=I[g.c];
    row[2*a]+=ax; row[2*a+1]+=ay; row[2*b]+=bx; row[2*b+1]+=by;
    row[2*c]-=ax+bx; row[2*c+1]-=ay+by;
    rows.push(row);
  });
  return rows;
}

// Gauss-Jordan mit Spaltenpivotierung, mehrere rechte Seiten.
// ponytail: dicht und dumm - bei 2n <= 60 Unbekannten ist sparse reiner Aufwand.
function luSolve(A, B){
  const k=A.length; if(!k) return [];
  const p=B[0].length;
  let mx=0; for(const r of A) for(const x of r) mx=Math.max(mx,Math.abs(x));
  const eps=1e-12*(mx||1);
  const M=A.map((r,i)=>r.concat(B[i]));
  for(let c=0;c<k;c++){
    let piv=c;
    for(let r=c+1;r<k;r++) if(Math.abs(M[r][c])>Math.abs(M[piv][c])) piv=r;
    if(Math.abs(M[piv][c])<eps) return null;
    [M[c],M[piv]]=[M[piv],M[c]];
    const d=M[c][c];
    for(let j=c;j<k+p;j++) M[c][j]/=d;
    for(let r=0;r<k;r++){
      if(r===c) continue;
      const f=M[r][c]; if(f===0) continue;
      for(let j=c;j<k+p;j++) M[r][j]-=f*M[c][j];
    }
  }
  return M.map(r=>r.slice(k));
}

function matTmat(A){
  const m=A.length, k=m?A[0].length:0;
  const N=Array.from({length:k},()=>new Array(k).fill(0));
  for(let i=0;i<m;i++) for(let a=0;a<k;a++){
    const va=A[i][a]; if(!va) continue;
    for(let b=a;b<k;b++) N[a][b]+=va*A[i][b];
  }
  for(let a=0;a<k;a++) for(let b=0;b<a;b++) N[a][b]=N[b][a];
  return N;
}

function matTvec(A,v){
  const m=A.length, k=m?A[0].length:0, g=new Array(k).fill(0);
  for(let i=0;i<m;i++) for(let a=0;a<k;a++) g[a]+=A[i][a]*v[i];
  return g;
}

// Rangaufdeckendes modifiziertes Gram-Schmidt ueber die SPALTEN.
// Doppelte Orthogonalisierung: die Rangerkennung ist genau die Stelle, an der
// einfache Genauigkeit kippt, und ein falscher Rang ist eine falsche Aussage
// darueber, wieviele Messungen fehlen.
function gramSchmidt(rows, tol){
  const m=rows.length, k=m?rows[0].length:0;
  const col=j=>rows.map(r=>r[j]);
  let scale=0;
  for(let j=0;j<k;j++) scale=Math.max(scale, Math.hypot(...col(j)));
  const t=(tol??TOL_RANK)*(scale||1);
  const Q=[], R=[], piv=[];
  for(let j=0;j<k;j++){
    const v=col(j), coef=new Array(Q.length).fill(0);
    for(let pass=0;pass<2;pass++){
      for(let q=0;q<Q.length;q++){
        let d=0; for(let i=0;i<m;i++) d+=Q[q][i]*v[i];
        coef[q]+=d;
        for(let i=0;i<m;i++) v[i]-=d*Q[q][i];
      }
    }
    R.forEach((row,q)=>row[j]=coef[q]);
    const nv=Math.hypot(...v);
    if(nv>t){
      for(let i=0;i<m;i++) v[i]/=nv;
      Q.push(v); piv.push(j);
      const row=new Array(k).fill(0); row[j]=nv; R.push(row);
    }
  }
  return {Q, R, piv, rank:Q.length, m, k};
}

// Jede abhaengige Spalte liefert genau einen Nullraum-Vektor. R eingeschraenkt
// auf die Pivotspalten ist obere Dreiecksmatrix -> Rueckwaertseinsetzen.
// k kommt aus gs, nicht aus R: bei Rang 0 ist R leer, die Spaltenzahl aber
// trotzdem bekannt - und genau dann besteht der Nullraum aus allem.
function nullSpace(gs){
  const {R,piv,rank,k}=gs;
  const isPiv=new Set(piv), out=[];
  for(let j=0;j<k;j++){
    if(isPiv.has(j)) continue;
    const c=new Array(rank).fill(0);
    for(let q=rank-1;q>=0;q--){
      let s=R[q][j];
      for(let q2=q+1;q2<rank;q2++) s-=R[q][piv[q2]]*c[q2];
      c[q]=s/R[q][piv[q]];
    }
    const z=new Array(k).fill(0);
    z[j]=1; piv.forEach((p,q)=>z[p]=-c[q]);
    const nrm=Math.hypot(...z)||1;
    out.push(z.map(x=>x/nrm));
  }
  return out;
}

// h_i = Zeilennorm^2 der Orthonormalbasis der Spalten = Diagonale der Hutmatrix.
function leverage(gs){
  const h=new Array(gs.m).fill(0);
  gs.Q.forEach(q=>q.forEach((v,i)=>h[i]+=v*v));
  return h;
}

// P0.x, P0.y und eine Koordinate von P1 = genau die 3 Starrfreiheitsgrade.
// Welche Koordinate von P1: eine Drehung um P0 aendert P1.y mit der Rate
// (P1.x - P0.x). Liegt P1 senkrecht ueber P0, fixiert P1.y die Drehung gar
// nicht und das System bliebe singulaer.
// Welcher Punkt P1 ist: der am weitesten entfernte, mit P0 direkt gemessene
// Punkt. Fest pts[1] zu nehmen ging schief, sobald P1 dicht an P0 liegt
// (Dusche: A-B = 4 mm). Die Drehung des ganzen Raums hing dann an einem
// 4-mm-Hebel, 1 mm an B drehte D um eine Viertelelle, und LM kroch 30
// Schritte lang, ohne anzukommen. Nur Messpartner, damit bei unterbestimmten
// Netzen kein loser Punkt festgenagelt wird und die Moden kippen. Ohne meas
// bleibt es bei pts[1].
function gaugePartner(pts, meas){
  if(!meas) return 1;
  const p0=pts[0], I=idx(pts);
  let best=1, bd=-1;
  activeMeas(meas).forEach(m=>{
    const o = m.a===p0.id ? m.b : m.b===p0.id ? m.a : null;
    const j=o==null ? null : I[o];
    if(j==null || j===0) return;
    const d=dist(p0, pts[j]);
    if(d>bd){ bd=d; best=j; }
  });
  return best;
}
function gaugeFixed(pts, meas){
  if(pts.length<2) return [];
  const j=gaugePartner(pts, meas);
  const dx=Math.abs(pts[j].x-pts[0].x), dy=Math.abs(pts[j].y-pts[0].y);
  return [0, 1, dx>=dy ? 2*j+1 : 2*j];
}

function freeCols(pts, meas){
  const fx=new Set(gaugeFixed(pts, meas)), out=[];
  for(let c=0;c<2*pts.length;c++) if(!fx.has(c)) out.push(c);
  return out;
}

// Skizze auf Messgroesse bringen, bevor iteriert wird. Eine Zeile, rettet den
// Solver wenn jemand einen 8-Meter-Raum als 300-Pixel-Kritzelei gezeichnet hat.
function scaleSketch(pts, meas){
  const I=idx(pts), act=activeMeas(meas);
  if(!act.length) return pts.map(p=>({...p}));
  let sd=0, sm=0;
  act.forEach(m=>{ sd+=dist(pts[I[m.a]],pts[I[m.b]]); sm+=m.d; });
  if(sd<1e-9) return pts.map(p=>({...p}));
  const f=sm/sd;
  return pts.map(p=>({...p, x:p.x*f, y:p.y*f}));
}

// Levenberg-Marquardt. Die Daempfung geht gegen 0, sobald das System gut
// gestellt ist - sonst waere das Ergebnis systematisch zur Skizze hin verzogen.
// Bei unterbestimmten Netzen bleibt sie stehen und haelt die freien Richtungen
// genau dort, wo die Skizze sie hatte. Das ist gewollt.
function solve(pts0, meas, angs){
  let pts=scaleSketch(pts0, meas);
  const free=freeCols(pts, meas), nf=free.length, act=activeMeas(meas);
  if(!nf || !(act.length+angleRows(pts, angs).length)) return {pts, iters:0, converged:true};
  const cost=P=>residuals(P,meas,angs).reduce((s,r)=>s+r*r,0);
  let lambda=1e-3, c0=cost(pts), it=0, converged=false;
  for(; it<30; it++){
    const J=jacobian(pts,meas,angs).map(r=>free.map(c=>r[c]));
    const v=residuals(pts,meas,angs);
    const N=matTmat(J), g=matTvec(J,v);
    let stepNorm=0, ok=false;
    for(let tries=0; tries<8 && !ok; tries++){
      const A=N.map((row,i)=>row.map((x,j)=>i===j ? x+lambda*(1+x) : x));
      const sol=luSolve(A, g.map(x=>[-x]));
      if(!sol){ lambda*=10; continue; }
      const d=sol.map(r=>r[0]);
      const cand=pts.map(p=>({...p}));
      free.forEach((c,i)=>{ const p=cand[c>>1]; if(c&1) p.y+=d[i]; else p.x+=d[i]; });
      const c1=cost(cand);
      if(c1<=c0){ pts=cand; c0=c1; lambda=Math.max(lambda/3,1e-12); stepNorm=Math.hypot(...d); ok=true; }
      else lambda*=10;
    }
    if(!ok) break;
    if(stepNorm<0.01){ converged=true; it++; break; }
  }
  return {pts, iters:it, converged};
}

// Eine Zerlegung, drei Antworten: Rang (= fehlende Messungen), Nullraum
// (= welche Punkte noch wackeln) und Hebelwerte (= welche Messung pruefbar ist).
// angs: festgelegte Winkel. Sie zaehlen fuer Rang, Freiheitsgrade und Moden
// mit (ein fester 90-Grad-Winkel ERSETZT eine Messung), die Arrays h, red,
// v, w gelten aber nur fuer die m echten Messungen - deren Indizes laufen
// ueberall im UI ueber activeMeas(meas). Die Winkelzeilen haengen hinten an,
// ihre Residuen (gewichtet, mm) stehen in vc.
// v ist ungewichtet in mm. Festgelegte Messungen bekommen w=null: wer
// "exakt" sagt, will nicht hoeren, dass genau dieser Wert verdaechtig sei -
// der Widerspruch landet bei den uebrigen.
function analyze(pts, meas, angs){
  const act=activeMeas(meas), m=act.length, n=pts.length;
  const mc=angleRows(pts, angs).length;
  const free=freeCols(pts, meas), nf=free.length;
  const Jfull=jacobian(pts,meas,angs);
  const J=Jfull.map(r=>free.map(c=>r[c]));
  const gs=gramSchmidt(J, TOL_RANK);
  // Ohne aktive Messungen hat J null Zeilen - gramSchmidt kennt dann die Spalten-
  // zahl nicht und setzt k=0 statt nf (siehe dort). analyze kennt nf aber genau:
  // ohne jede Messung ist jede freie Koordinate ein Flex-Mode, der Nullraum also
  // die volle freie Dimension, nicht leer.
  if(m+mc===0) gs.k=nf;
  const rank=gs.rank;
  const dof=Math.max(0, nf-rank);
  const redundancy=m+mc-rank;
  const hAll=leverage(gs);
  const h=hAll.slice(0,m);
  const red=h.map(x=>Math.max(0, 1-x));
  const vw=residuals(pts,meas,angs);
  const v=act.map((mm,i)=>vw[i]/rowWt(mm));
  const vc=vw.slice(m);
  const sigmaHat = redundancy>0
    ? Math.sqrt(vw.reduce((s,r)=>s+r*r,0)/redundancy)
    : null;
  const w=act.map((mm,i)=> (mm.fix || red[i]<TOL_RED)
    ? null
    : Math.abs(v[i])/((mm.sigma??SIGMA_DEF)*Math.sqrt(red[i])));
  // Moden liegen in den freien Koordinaten - auf die vollen 2n aufblasen.
  // Starrbewegungen koennen nicht dabei sein, die hat das Pinnen entfernt.
  const modes=nullSpace(gs).map(z=>{
    const f=new Array(2*n).fill(0);
    free.forEach((c,i)=>f[c]=z[i]);
    return f;
  });
  return {rank, dof, redundancy, h, red, v, vc, w, sigmaHat, modes, free, n, m};
}

// Die drei Starrbewegungen, Drehung um den Schwerpunkt (haelt sie unabhaengig
// von der Lage des Netzes klein und numerisch gutartig).
function trivialModes(pts){
  const n=pts.length;
  const cx=pts.reduce((s,p)=>s+p.x,0)/n, cy=pts.reduce((s,p)=>s+p.y,0)/n;
  const t1=[],t2=[],t3=[];
  pts.forEach(p=>{ t1.push(1,0); t2.push(0,1); t3.push(-(p.y-cy), p.x-cx); });
  const out=[];
  for(const v0 of [t1,t2,t3]){
    const v=v0.slice();
    for(const q of out){
      let d=0; for(let i=0;i<v.length;i++) d+=q[i]*v[i];
      for(let i=0;i<v.length;i++) v[i]-=d*q[i];
    }
    const nrm=Math.hypot(...v);
    if(nrm>1e-9) out.push(v.map(x=>x/nrm));
  }
  return out;
}

// Freie Netzausgleichung mit inneren Bedingungen:
//   [ JtJ  G ] [X]   [I]
//   [ Gt   0 ] [.] = [0]
// X ist die gesuchte Pseudoinverse. Wuerde stattdessen das gepinnte System
// invertiert, waeren die Ellipsen an P0 genagelt und wuechsen mit dem Abstand
// davon - ein Artefakt der Eichung, nicht der Messqualitaet.
function covariance(pts, meas, sigmaHat, angs){
  const n=pts.length, k=2*n;
  if(n<3) return null;
  const G=trivialModes(pts);
  if(G.length<3) return null;
  // Ohne aktive Messungen hat jacobian() 0 Zeilen; matTmat() kennt die Spaltenzahl
  // dann nicht (siehe dort) und liefert [] statt einer k x k Nullmatrix. N[i][j]
  // waere darauf ein Zugriff auf undefined[j] - ausgerechnet im unterbestimmtesten
  // Fall, den es gibt, statt der vertraglich vorgesehenen null-Antwort.
  if(!activeMeas(meas).length) return null;
  const N=matTmat(jacobian(pts,meas,angs));
  const A=Array.from({length:k+3},()=>new Array(k+3).fill(0));
  for(let i=0;i<k;i++) for(let j=0;j<k;j++) A[i][j]=N[i][j];
  for(let i=0;i<k;i++) for(let g=0;g<3;g++){ A[i][k+g]=G[g][i]; A[k+g][i]=G[g][i]; }
  const B=Array.from({length:k+3},(_,i)=>{
    const r=new Array(k).fill(0); if(i<k) r[i]=1; return r;
  });
  const X=luSolve(A,B);
  if(!X) return null;                       // unterbestimmt -> Pfeile statt Ellipsen
  const s2=(sigmaHat!=null ? sigmaHat*sigmaHat : SIGMA_DEF*SIGMA_DEF);
  return pts.map((p,i)=>({
    xx:s2*X[2*i][2*i], xy:s2*X[2*i][2*i+1], yy:s2*X[2*i+1][2*i+1],
  }));
}

// Eigenwerte einer 2x2-Kovarianz in geschlossener Form.
function ellipse(c){
  const tr=c.xx+c.yy, det=c.xx*c.yy-c.xy*c.xy;
  const r=Math.sqrt(Math.max(0, tr*tr/4-det));
  return {
    a:Math.sqrt(Math.max(tr/2+r,0)),
    b:Math.sqrt(Math.max(tr/2-r,0)),
    ang:0.5*Math.atan2(2*c.xy, c.xx-c.yy),
  };
}

// Echter Schnitt zweier Strecken, gemeinsame Endpunkte zaehlen nicht.
function segCross(p1,p2,p3,p4){
  const d=(p2.x-p1.x)*(p4.y-p3.y)-(p2.y-p1.y)*(p4.x-p3.x);
  if(Math.abs(d)<1e-12) return false;
  const t=((p3.x-p1.x)*(p4.y-p3.y)-(p3.y-p1.y)*(p4.x-p3.x))/d;
  const u=((p3.x-p1.x)*(p2.y-p1.y)-(p3.y-p1.y)*(p2.x-p1.x))/d;
  const e=1e-9;
  return t>e && t<1-e && u>e && u<1-e;
}
// Ein Raum ist ein EINFACHES Polygon. Kreuzen sich zwei Waende, ist es keins -
// und dann liefern pointInPoly, segInPoly und die Flaeche stillschweigend
// Unsinn: bei einem gekreuzten Viereck gilt die Raummitte als aussen und die
// Flaeche kommt als 0 heraus.
function ringSelfIntersects(poly){
  const n=poly.length;
  for(let i=0;i<n;i++){
    const a1=poly[i], a2=poly[(i+1)%n];
    for(let j=i+1;j<n;j++){
      if(j===i || (j+1)%n===i || (i+1)%n===j) continue;   // benachbarte Kanten
      if(segCross(a1,a2,poly[j],poly[(j+1)%n])) return true;
    }
  }
  return false;
}
// Wuerde eine neue Wand a-b eine bestehende kreuzen?
function wallCrossesExisting(pts, walls, a, b){
  const I=idx(pts);
  if(I[a]==null||I[b]==null) return false;
  const p=pts[I[a]], q=pts[I[b]];
  return walls.some(([c,d])=>{
    if(c===a||c===b||d===a||d===b) return false;          // teilt einen Endpunkt
    if(I[c]==null||I[d]==null) return false;
    return segCross(p,q,pts[I[c]],pts[I[d]]);
  });
}

// Wandzug in Ecken-Reihenfolge bringen. Null, wenn es kein geschlossener
// Ring ueber alle Punkte ist - dann gibt es kein Polygon zum Filtern. Reine
// Adjazenzpruefung, unabhaengig von der Geometrie - siehe wallPolygon fuer
// die geometrische Kreuzungspruefung, die hier bewusst NICHT stattfindet.
function wallPolygonRing(pts, walls){
  const loops=wallLoops(pts, walls);
  if(!loops) return null;
  // Aussen ist der groesste Zug, nicht der erste in pts-Reihenfolge.
  let k=0; loops.forEach((L,i)=>{ if(loopArea(L)>loopArea(loops[k])) k=i; });
  const ring=loops[k];
  ring.holes=loops.filter((_,i)=>i!==k);
  return ring;
}
// Alle geschlossenen Wandzuege. Jede Ecke hat genau zwei Waende; die Waende
// zerfallen dann in disjunkte Kreise. Der Raum ist der groesste davon, jeder
// weitere ist eine INSEL darin (freistehende Wand, Pfeiler, Wandstueck neben
// einem Durchbruch) - er begrenzt den Raum von innen. wallPolygonRing haengt
// die Inseln als .holes an den Aussenring; ohne Inseln ist .holes leer und
// alles verhaelt sich wie bisher. null, solange irgendwo ein Zug offen ist.
function wallLoops(pts, walls){
  if(walls.length<3 || pts.length<3) return null;
  const adj={}; pts.forEach(p=>adj[p.id]=[]);
  for(const [a,b] of walls){
    if(!adj[a]||!adj[b]) return null;
    adj[a].push(b); adj[b].push(a);
  }
  if(pts.some(p=>adj[p.id].length!==2)) return null;
  const I=idx(pts), seen=new Set(), loops=[];
  for(const start of pts){
    if(seen.has(start.id)) continue;
    const order=[start.id]; seen.add(start.id);
    let prev=null, cur=start.id;
    for(;;){
      const nxt=adj[cur].find(x=>x!==prev);
      if(nxt==null) return null;
      if(nxt===start.id) break;
      if(seen.has(nxt)) return null;
      seen.add(nxt); order.push(nxt); prev=cur; cur=nxt;
    }
    if(order.length<3) return null;
    loops.push(order.map(id=>pts[I[id]]));
  }
  return loops;
}
function loopArea(R){
  let a=0;
  for(let i=0,j=R.length-1;i<R.length;j=i++) a+=R[j].x*R[i].y-R[i].x*R[j].y;
  return Math.abs(a)/2;
}

// Ein Raum ist ein EINFACHES Polygon: der Ring darf sich nicht selbst kreuzen.
// wallPolygonRing prueft nur die Adjazenz (ein geschlossener Zug ueber alle
// Punkte), nicht die Geometrie - ein gekreuztes Viereck besteht diese Pruefung
// anstandslos. Getrennt von wallPolygonRing, damit der rohe Ring auch im
// gekreuzten Fall zur Inspektion zur Verfuegung steht (siehe Statuszeile:
// "nicht geschlossen" und "kreuzt sich" sind verschiedene Meldungen).
function wallPolygon(pts, walls){
  const ring=wallPolygonRing(pts, walls);
  if(!ring || ringSelfIntersects(ring)) return null;
  // Inseln: je kreuzungsfrei, ganz im Aussenring, nicht ineinander und ohne
  // Kreuzung mit einem anderen Zug - sonst ist die Form so unbestimmt wie
  // ein gekreuzter Ring.
  const all=[ring, ...ring.holes];
  for(const h of ring.holes){
    if(ringSelfIntersects(h)) return null;
    if(!h.every(p=>pointInRing(p, ring))) return null;
    if(ring.holes.some(o=>o!==h && pointInRing(h[0], o))) return null;
  }
  for(let i=0;i<all.length;i++) for(let j=i+1;j<all.length;j++){
    const P=all[i], Q=all[j];
    for(let a=0;a<P.length;a++) for(let b=0;b<Q.length;b++)
      if(segCross(P[a],P[(a+1)%P.length],Q[b],Q[(b+1)%Q.length])) return null;
  }
  return ring;
}
// Flaeche eines Raums abzueglich seiner Inseln (mm2).
function roomArea(poly){
  return loopArea(poly) - (poly.holes||[]).reduce((s,h)=>s+loopArea(h),0);
}

function pointInRing(p, poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i], b=poly[j];
    if((a.y>p.y)!==(b.y>p.y) && p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}
// Paritaet ueber ALLE Ringe (even-odd): innen heisst im Aussenring und in
// keiner Insel. Wer ein wallPolygon()-Ergebnis uebergibt, bekommt die
// Inseln damit ohne eigenes Zutun beruecksichtigt (Sichtlinien, Innenseite
// einer Wand, Nachbar unter dem Zeiger).
function pointInPoly(p, poly){
  let inside=pointInRing(p, poly);
  for(const h of (poly.holes||[])) if(pointInRing(p, h)) inside=!inside;
  return inside;
}

const pairKey=(a,b)=>[a,b].sort().join('|');

// Messbarkeit eines Punktpaars fuer die Vorschlagsliste: die beiden Ecken
// muessen einander SEHEN. Zwei Fragen, in dieser Reihenfolge:
//
// 1. Steht eine Wand im Weg? Exakter Segmentschnitt (wallCrossesExisting),
//    kein Abtasten. Die alte Fassung tastete die Strecke mit 32 Stuetzpunkten
//    ab und liess dadurch Strecken durch, die eine Wand nur knapp schneiden -
//    browser-gesehen im Raum vom 23.8.2026 schlug sie A-F vor, obwohl das
//    Wand L-J quert; erst bei 200 Stuetzpunkten faellt es auf. Der Schnitt
//    braucht kein Polygon und gilt deshalb auch, solange der Zug noch offen
//    oder gekreuzt ist - genau dort, wo der Filter frueher ganz aussetzte.
// 2. Liegt die Strecke ueberhaupt drinnen? Kreuzungsfrei heisst noch nicht
//    innen: im L-Raum laeuft die Strecke zwischen den beiden Schenkelenden
//    komplett AUSSEN um die einspringende Ecke herum, ohne eine Wand zu
//    schneiden. Weil Frage 1 den Rand ausschliesst, entscheidet ein einziger
//    Punkt fuer die ganze Strecke.
//
// Eine Wand ist per Definition messbar - man steht in einer Ecke und misst
// geradeaus zur naechsten. Sie LIEGT auf dem Rand, und dort ist pointInPolys
// Paritaetstest undefiniert; deshalb wird sie vorweg beantwortet.
// ponytail: laeuft die Strecke exakt durch eine Ecke, ist der Schnitttest
// blind und der Mittelpunkt entscheidet allein - ein solcher Raum ist entartet.
function pairMeasurable(pts, walls, poly, a, b){
  const k=pairKey(a,b);
  if(walls.some(([x,y])=>pairKey(x,y)===k)) return true;
  if(wallCrossesExisting(pts, walls, a, b)) return false;
  if(!poly) return true;
  const I=idx(pts);
  if(I[a]==null||I[b]==null) return true;
  const p=pts[I[a]], q=pts[I[b]];
  return pointInPoly({x:(p.x+q.x)/2, y:(p.y+q.y)/2}, poly);
}

// Zwei Phasen in einem Durchlauf. Solange Messungen fehlen: die Messung
// waehlen, deren Rigiditaetszeile am staerksten in die noch freien Richtungen
// zeigt. Danach: die Messung waehlen, die die meisten bisher unpruefbaren
// Messungen pruefbar macht. Jeder Vorschlag traegt in `why`, aus welcher Phase
// er stammt - ohne das stuenden hier fuenf Eintraege, waehrend die Statuszeile
// "3 Messungen fehlen" meldet.
function suggest(pts, walls, meas, angs){
  const poly=wallPolygon(pts,walls), I=idx(pts);
  const have=new Set(activeMeas(meas).map(m=>pairKey(m.a,m.b)));
  const cand=[], repeats=[];
  for(let i=0;i<pts.length;i++) for(let j=i+1;j<pts.length;j++){
    const key=pairKey(pts[i].id,pts[j].id);
    if(!pairMeasurable(pts, walls, poly, pts[i].id, pts[j].id)) continue;
    const pair={a:pts[i].id, b:pts[j].id};
    // Eine Wiederholung macht genau ihr eigenes Paar pruefbar - nachgemessen:
    // red steigt fuer beide Zeilen auf 0.500, alle uebrigen bleiben 0. Zur
    // Herstellung der Bestimmtheit taugt sie deshalb nie.
    if(have.has(key)) repeats.push(pair); else cand.push(pair);
  }
  const virt=c=>({a:c.a, b:c.b, d:dist(pts[I[c.a]],pts[I[c.b]]), sigma:SIGMA_DEF});
  const out=[]; let work=activeMeas(meas).slice();
  const taken=new Set();
  let checkPhase=0;
  for(let guard=0; guard<2*pts.length; guard++){
    const an=analyze(pts, work, angs);
    let best=null, bestScore=0, why='bestimmt', bestRepeat=false;
    if(an.dof>0){
      for(const c of cand){
        if(taken.has(pairKey(c.a,c.b))) continue;
        const row=jacobian(pts,[{a:c.a,b:c.b,d:0}])[0];
        const score=an.modes.reduce((s,mo)=>{
          let d=0; for(let i=0;i<row.length;i++) d+=row[i]*mo[i];
          return s+d*d;
        },0);
        if(score>bestScore){ bestScore=score; best=c; }
      }
    } else {
      if(checkPhase>=SUGGEST_CHECK_MAX) break;
      why='pruefbar';
      // Festgelegte Werte bleiben immer ungeprueft (w=null) - zaehlen sie
      // mit, kommt base nie auf 0 und jeder Vorschlag wirkt noetig.
      // a.w kann einen Eintrag mehr haben als work (das gedachte Mass des
      // Kandidaten); bleibt es selbst unpruefbar, zaehlt es als ungeprueft.
      const unchecked=a=>a.w.filter((x,i)=>x===null && !(work[i] && work[i].fix)).length;
      const base=unchecked(an);
      if(base===0) break;
      for(const c of cand.concat(repeats)){
        if(taken.has(pairKey(c.a,c.b))) continue;
        const gain=base-unchecked(analyze(pts, work.concat([virt(c)]), angs));
        if(gain>bestScore){ bestScore=gain; best=c; bestRepeat=repeats.includes(c); }
      }
      checkPhase++;
    }
    if(!best) break;
    taken.add(pairKey(best.a,best.b));
    out.push(bestRepeat ? {a:best.a, b:best.b, why, repeat:true} : {a:best.a, b:best.b, why});
    work=work.concat([virt(best)]);
  }
  return out;
}

// Rechte Winkel annehmen. Ein Laser misst Strecken, keine Winkel - an einer
// kurzen Wand verschieben 5 mm Messfehler den Winkel um 1-2 Grad, und der
// Ausgleich landet dann bei 87,7 statt 90, obwohl nichts dagegen spricht.
// Jede Ecke, die im Ausgleich innerhalb tolDeg von 90 Grad liegt, bekommt
// als Hilfsstrecke die Diagonale ueber die Ecke (Pythagoras aus den
// Schenkeln, stark gewichtet) - aber nur, wenn die Messungen das zulassen:
// die Fehlerquadratsumme darf je Ecke um hoechstens ORTHO_CHI2 wachsen
// (chi2 mit 1 Freiheitsgrad, 95 %). Widerspricht eine Ecke, bleibt sie, wie
// sie gemessen ist. Die Schenkel aendern sich beim Ausgleich - deshalb die
// Diagonale ein paar Mal aus der neuen Lage nachfuehren.
const ORTHO_CHI2=3.84, ORTHO_WT=40, ORTHO_W=3.29;   // W = Baardas Grenze, wie BAARDA_W0 im UI
function orthoFit(pts, walls, meas, tolDeg, angs){
  const fit0=solve(pts, meas, angs);
  const loops=wallLoops(fit0.pts, walls);
  if(!loops) return {fit:fit0, ortho:[], rejected:[]};
  const act=activeMeas(meas);
  const chi=P=>{ const I=idx(P); return act.reduce((s,m)=>s+((dist(P[I[m.a]],P[I[m.b]])-m.d)/(m.sigma||SIGMA_DEF))**2,0); };
  const angleAt=(P,[a,c,b])=>{ const I=idx(P), A=P[I[a]], Cc=P[I[c]], B=P[I[b]];
    const u={x:A.x-Cc.x,y:A.y-Cc.y}, v={x:B.x-Cc.x,y:B.y-Cc.y};
    return Math.abs(Math.atan2(u.x*v.y-u.y*v.x, u.x*v.x+u.y*v.y))*180/Math.PI; };
  const pseudo=(P,list)=>{ const I=idx(P); return list.map(([a,c,b])=>({a, b, wt:ORTHO_WT,
    d:Math.hypot(dist(P[I[a]],P[I[c]]), dist(P[I[b]],P[I[c]]))})); };
  const solveWith=list=>{ let f=fit0; for(let k=0;k<3;k++) f=solve(f.pts, meas.concat(pseudo(f.pts,list)), angs); return f; };
  const corners=[];
  loops.forEach(L=>L.forEach((p,i)=>corners.push([L[(i+L.length-1)%L.length].id, p.id, L[(i+1)%L.length].id])));
  const base=chi(fit0.pts), ortho=[], rejected=[];
  // Ecken mit festgelegtem Winkel entscheidet der Nutzer, nicht die 90-Grad-Annahme.
  const fest=new Set(angleRows(fit0.pts, angs).map(g=>g.c));
  corners.forEach(k=>{
    if(fest.has(k[1])) return;
    const ang=angleAt(fit0.pts,k);
    if(Math.abs(ang-90)>tolDeg) return;
    const inc=chi(solveWith([k]).pts)-base;
    (inc<=ORTHO_CHI2 ? ortho : rejected).push(inc<=ORTHO_CHI2 ? k : {corner:k, ang, inc});
  });
  // Gemeinsam pruefen: einzeln vertraegliche Ecken koennen zusammen zu viel
  // verlangen. Dann die teuerste einzeln wieder freigeben, bis es passt.
  let fit=ortho.length ? solveWith(ortho) : fit0;
  // 95-%-Grenze fuer k Freiheitsgrade (Naeherung), und: keine Messung darf
  // durch die rechten Winkel neu ueber die Ausreissergrenze rutschen - sonst
  // meldet die Tabelle eine verdaechtige Messung, die es ohne gar nicht gibt.
  const limit=k=>k+1.645*Math.sqrt(2*k);
  const maxW=P=>{ const a=analyze(P, meas, angs); return Math.max(0, ...a.w.map(Math.abs)); };
  const w0=Math.max(ORTHO_W, maxW(fit0.pts));
  while(ortho.length && (chi(fit.pts)-base>limit(ortho.length) || maxW(fit.pts)>w0+1e-9)){
    let worst=0, wInc=-1;
    ortho.forEach((k,i)=>{ const inc=chi(solveWith(ortho.filter((_,j)=>j!==i)).pts); if(wInc<0 || inc<wInc){ wInc=inc; worst=i; } });
    const [k]=ortho.splice(worst,1);
    rejected.push({corner:k, ang:angleAt(fit0.pts,k), inc:NaN});
    fit=ortho.length ? solveWith(ortho) : fit0;
  }
  return {fit, ortho:ortho.map(k=>k[1]), rejected:rejected.map(r=>({id:r.corner[1], ang:r.ang}))};
}

// Einen Zug am Punkt i auf die verbliebenen Beweglichkeiten projizieren.
// Die Moden sind die LINEARISIERTE Beweglichkeit an der aktuellen Stelle -
// ein endlicher Zug driftet also von den Messungen weg. Der Aufrufer laesst
// deshalb solve() als Korrektor nachlaufen (Praediktor-Korrektor).
function dragAlongModes(pts, modes, i, dx, dy){
  const k=modes.length;
  if(!k) return null;
  const A=[modes.map(m=>m[2*i]), modes.map(m=>m[2*i+1])];   // 2 x k
  const N=matTmat(A), g=matTvec(A,[dx,dy]);
  for(let j=0;j<k;j++) N[j][j]+=1e-9;
  const sol=luSolve(N, g.map(x=>[x]));
  if(!sol) return null;
  const c=sol.map(r=>r[0]);
  return pts.map((p,q)=>{
    let ax=0, ay=0;
    modes.forEach((m,j)=>{ ax+=c[j]*m[2*q]; ay+=c[j]*m[2*q+1]; });
    return {...p, x:p.x+ax, y:p.y+ay};
  });
}

globalThis.CORE={ TOL_RANK, TOL_RED, TOL_MODE, SIGMA_DEF, SUGGEST_CHECK_MAX, FIX_WT, rowWt, angleRows, angleDeg,
                  dist, idx, activeMeas, residuals, jacobian, luSolve, matTmat, matTvec,
                  gramSchmidt, nullSpace, leverage, gaugeFixed, freeCols, scaleSketch, solve, analyze,
                  trivialModes, covariance, ellipse, segCross, ringSelfIntersects, wallCrossesExisting,
                  wallPolygonRing, wallPolygon, pointInPoly, wallLoops, roomArea,
                  pairMeasurable, suggest, dragAlongModes, orthoFit, ORTHO_CHI2 };

// Etiketten ohne Überlappung: belegte Rechtecke {x,y,w,h} im Bildschirm.
// Dasselbe Muster wie placed/frei (Wände) und belegt (Fliesen), hier als
// Helfer: occupy trägt ein Hindernis ein, place nimmt den ersten freien
// Kandidaten (Reihenfolge = Vorliebe) und belegt ihn, sonst null.
function labelPlacer(){
  const R=[];
  // e: Rundung – gestapelte Zeilen stoßen an (y+h), das darf nicht als Treffer zählen.
  const e=1e-3, hit=r=>R.some(o=>r.x<o.x+o.w-e && r.x+r.w>o.x+e && r.y<o.y+o.h-e && r.y+r.h>o.y+e);
  return { rects:R, free:r=>!hit(r), occupy:r=>{ if(r) R.push(r); return r; },
           place:cands=>{ for(const c of cands) if(c && !hit(c)){ R.push(c); return c; } return null; } };
}
Object.assign(globalThis.CORE, { labelPlacer });
