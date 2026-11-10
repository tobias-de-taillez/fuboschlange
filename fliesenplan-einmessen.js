// fliesenplan-einmessen.js – eine Fliese aus gemessenen Strecken einmessen
// (docs/adr/0001-familie-mit-geteilten-js-dateien.md). DOM-frei. Unverändert
// aus dem früheren Block "tilemeasure" von raumaufmass.html; legt
// globalThis.TILEMEAS an. Gehört dem Fliesenplan allein.
// Braucht: raum-kern.js (CORE).
"use strict";
// ================= Fliese einmessen =================
// Eine Fliese nur aus Strecken vermessen - Kanten, Diagonalen und die
// rechtwinklige Breite W, jede gern mehrfach. Kein Winkel wird gemessen.
// Zwei Auswertungen aus denselben Strecken:
// - Formmodell der App (Parallelogramm, Rechteck, regelmaessiges Dreieck und
//   Hexagon) per Gauss-Newton -> die Werte fuers Fliesenset, mit ±.
// - Echte Form: jede Ecke frei, Ausgleich ueber den Einmess-Kern (CORE) ->
//   Eckwinkel und die Pruefung, ob die Strecken zusammenpassen.
// Beim Viereck ist das das verstrebte Viereck der Trilateration:
// https://www.isprs.org/proceedings/XXIX/congress/part3/28_XXIX-part3.pdf
(()=>{
const R2D=180/Math.PI, S3=Math.sqrt(3);
const BAARDA_W0=3.29;
// Je Form: Ecken in Ringfolge, Parameter wie im Fliesenset, Ecken aus den
// Parametern (Fliesenrahmen wie TILES.tileShape), messbare Strecken und W
// (rechtwinklig von der Geraden line zum Punkt pt).
const SHAPES={
  chevron:{ pts:['A','B','C','D'], params:['l','k','w'],
    corners:([l,k,w])=>({A:{x:0,y:0}, B:{x:l,y:0}, C:{x:l+k,y:w}, D:{x:k,y:w}}),
    fromDef:d=>[d.l, d.w/Math.tan(d.angle/R2D), d.w],
    toDef:([l,k,w])=>{ const t=Math.atan2(Math.abs(w),k)*R2D; return {w:Math.abs(w), l, angle:t>90?180-t:t}; },
    keys:[['AB','A','B','Lange Kante'], ['DC','D','C','Lange Kante gegenüber'],
          ['AD','A','D','Kurze Kante'], ['BC','B','C','Kurze Kante gegenüber'],
          ['AC','A','C','Lange Diagonale (spitz–spitz)'], ['BD','B','D','Kurze Diagonale (stumpf–stumpf)']],
    W:{line:['A','B'], pt:'D', name:'Breite, rechtwinklig AB → DC'},
    acute:['A','C'], ends:true },
  rectangle:{ pts:['A','B','C','D'], params:['l','w'],
    corners:([l,w])=>({A:{x:0,y:0}, B:{x:l,y:0}, C:{x:l,y:w}, D:{x:0,y:w}}),
    fromDef:d=>[d.l, d.w],
    toDef:([l,w])=>({l, w:Math.abs(w)}),
    keys:[['AB','A','B','Breite'], ['DC','D','C','Breite gegenüber'],
          ['AD','A','D','Höhe'], ['BC','B','C','Höhe gegenüber'],
          ['AC','A','C','Diagonale'], ['BD','B','D','Diagonale']],
    W:{line:['A','B'], pt:'D', name:'Höhe, rechtwinklig AB → DC'}, ends:true },
  triangle:{ pts:['A','B','C'], params:['l'],
    corners:([l])=>({A:{x:0,y:l*S3/2}, B:{x:l,y:l*S3/2}, C:{x:l/2,y:0}}),
    fromDef:d=>[d.l],
    toDef:([l])=>({l}),
    keys:[['AB','A','B','Grundseite'], ['BC','B','C','Seite'], ['CA','C','A','Seite']],
    W:{line:['A','B'], pt:'C', name:'Höhe, rechtwinklig AB → C'} },
  hexagon:{ pts:['A','B','C','D','E','F'], params:['l'],
    corners:([l])=>{ const w=l*S3/2; return {A:{x:l/4,y:0}, B:{x:3*l/4,y:0}, C:{x:l,y:w/2},
                                             D:{x:3*l/4,y:w}, E:{x:l/4,y:w}, F:{x:0,y:w/2}}; },
    fromDef:d=>[d.l],
    toDef:([l])=>({l}),
    keys:[['AB','A','B','Seite'], ['BC','B','C','Seite'], ['CD','C','D','Seite'],
          ['DE','D','E','Seite'], ['EF','E','F','Seite'], ['FA','F','A','Seite'],
          ['AD','A','D','Über die Spitzen'], ['BE','B','E','Über die Spitzen'], ['CF','C','F','Über die Spitzen'],
          ['AC','A','C','Kurze Diagonale'], ['CE','C','E','Kurze Diagonale'], ['EA','E','A','Kurze Diagonale']],
    W:{line:['A','B'], pt:'D', name:'Über die Flächen, rechtwinklig AB → DE'} },
};
const shapeOf=s=>SHAPES[s]||SHAPES.chevron;
const keysOf=sh=>sh.keys.map(k=>k[0]).concat('W');

// Ein Feld, mehrere Messungen: Leerzeichen oder ; trennen, Komma ist das
// Dezimalzeichen ("850,5 851"). bad sammelt, was keine positive Zahl ist.
function parseValues(s){
  const vals=[], bad=[];
  for(const t of String(s||'').trim().split(/[\s;]+/)){
    if(!t) continue;
    const x=Number(t.replace(',','.'));
    if(Number.isFinite(x) && x>0) vals.push(x); else bad.push(t);
  }
  return {vals, bad};
}

const dist=(p,q)=>Math.hypot(q.x-p.x, q.y-p.y);
const perp=(P,[a,b],c)=>Math.abs((P[b].x-P[a].x)*(P[c].y-P[a].y)-(P[b].y-P[a].y)*(P[c].x-P[a].x))/(dist(P[a],P[b])||1e-9);
function modelD(sh, key, p){
  const P=sh.corners(p);
  if(key==='W') return perp(P, sh.W.line, sh.W.pt);
  const k=sh.keys.find(x=>x[0]===key);
  return dist(P[k[1]], P[k[2]]);
}
// Ableitung nach den Parametern, zentral und numerisch: die Formmodelle sind
// klein und glatt, eine zweite, handgeschriebene Ableitung je Form waere nur
// eine weitere Stelle fuer Vorzeichenfehler.
function gradient(f, p){
  return p.map((_,j)=>{
    const h=1e-6*Math.max(1,Math.abs(p[j])), a=p.slice(), b=p.slice();
    a[j]+=h; b[j]-=h;
    const fa=f(a), fb=f(b);
    return Array.isArray(fa) ? fa.map((x,i)=>(x-fb[i])/(2*h)) : (fa-fb)/(2*h);
  });
}
const jac=(sh,obs,p)=>{ const G=gradient(q=>obs.map(o=>modelD(sh,o.key,q)), p); return obs.map((_,i)=>G.map(g=>g[i])); };

// Welche noch nicht gemessene Strecke wuerde den Rang heben? Fuer die Meldung,
// was fehlt - je Form verschieden, deshalb aus der Rechnung statt aus einer Liste.
function missingFor(sh, obs, p){
  const rank=o=>o.length ? CORE.gramSchmidt(jac(sh,o,p), 1e-6).rank : 0;
  const r0=rank(obs), have=new Set(obs.map(o=>o.key));
  return keysOf(sh).filter(k=>!have.has(k) && rank(obs.concat([{key:k,d:1}]))>r0);
}

function fitModel(sh, obs, sigma, def){
  const n=sh.params.length;
  let p=sh.fromDef(def);
  // Auf Messgroesse bringen: alle Parameter sind Laengen.
  const sm=obs.reduce((s,o)=>s+o.d,0), sd0=obs.reduce((s,o)=>s+modelD(sh,o.key,p),0);
  if(sd0>0) p=p.map(x=>x*sm/sd0);
  const rank=CORE.gramSchmidt(jac(sh,obs,p), 1e-6).rank;
  if(rank<n) return {missing:missingFor(sh,obs,p)};
  const resid=q=>obs.map(o=>modelD(sh,o.key,q)-o.d);
  const cost=q=>resid(q).reduce((s,r)=>s+r*r,0);
  let c0=cost(p), converged=false;
  for(let it=0; it<60; it++){
    const J=jac(sh,obs,p), v=resid(p);
    const sol=CORE.luSolve(CORE.matTmat(J), CORE.matTvec(J,v).map(x=>[-x]));
    if(!sol) break;
    const d=sol.map(r=>r[0]);
    let t=1, cand=p, c1=Infinity;
    for(let h=0; h<30; h++){ cand=p.map((x,j)=>x+t*d[j]); c1=cost(cand); if(c1<=c0) break; t/=2; }
    if(!(c1<=c0)){ converged=true; break; }      // kein Abstieg mehr: am Minimum
    const step=Math.hypot(...d)*t;
    p=cand; c0=c1;
    if(step<1e-9){ converged=true; break; }
  }
  const out=sh.toDef(p);
  if(!converged || !p.every(Number.isFinite) || Object.values(out).some(x=>!(x>0)))
    return {error:'Die Strecken ergeben diese Form nicht. Stimmen die Felder und die Form?'};
  const J=jac(sh,obs,p), Q=CORE.luSolve(CORE.matTmat(J), sh.params.map((_,i)=>sh.params.map((_,j)=>i===j?1:0)));
  // ± der Fliesenset-Werte: Gradient von toDef nach den Parametern.
  const fields=Object.keys(out), G=gradient(q=>fields.map(f=>sh.toDef(q)[f]), p);
  const sd={};
  fields.forEach((f,i)=>{
    if(!Q){ sd[f]=null; return; }
    let s2=0; for(let a=0;a<n;a++) for(let b=0;b<n;b++) s2+=G[a][i]*Q[a][b]*G[b][i];
    sd[f]=sigma*Math.sqrt(Math.max(0,s2));
  });
  const v=resid(p), red=obs.length-n;
  const model={}; keysOf(sh).forEach(k=>model[k]=modelD(sh,k,p));
  return {p, def:out, sd, model, v, redundancy:red,
          sigmaHat: red>0 ? Math.sqrt(v.reduce((s,r)=>s+r*r,0)/red) : null,
          corners:sh.corners(p)};
}

function angleAt(P, a, c, b){
  const u={x:P[a].x-P[c].x, y:P[a].y-P[c].y}, w={x:P[b].x-P[c].x, y:P[b].y-P[c].y};
  return Math.abs(Math.atan2(u.x*w.y-u.y*w.x, u.x*w.x+u.y*w.y))*R2D;
}

// Echte Form ueber den Einmess-Kern. W ist keine Punkt-zu-Punkt-Strecke und
// bleibt beim Formmodell. Start ist das ausgeglichene Modell.
function fitReal(sh, obs, sigma, seed){
  const pts=sh.pts.map(id=>({id, x:seed[id].x, y:seed[id].y}));
  const at=[], meas=[];
  obs.forEach((o,i)=>{ const k=sh.keys.find(x=>x[0]===o.key); if(k){ at.push(i); meas.push({a:k[1], b:k[2], d:o.d, sigma}); } });
  if(!meas.length) return {dof:2*pts.length-3};
  const pre=CORE.analyze(pts, meas);
  if(pre.dof>0) return {dof:pre.dof};
  let f=CORE.solve(pts, meas); f=CORE.solve(f.pts, meas);
  const an=CORE.analyze(f.pts, meas);
  const P={}; f.pts.forEach(q=>P[q.id]=q);
  const N=sh.pts.length, ang={};
  sh.pts.forEach((id,i)=>ang[id]=angleAt(P, sh.pts[(i+N-1)%N], id, sh.pts[(i+1)%N]));
  const lens={}; sh.keys.forEach(([k,a,b])=>lens[k]=dist(P[a],P[b]));
  const spread=a=>{ const o=obs.map(()=>null); at.forEach((i,j)=>o[i]=a[j]); return o; };
  const tested=an.w.filter(x=>x!==null);
  const out={dof:0, P, ang, lens, redundancy:an.redundancy, sigmaHat:an.sigmaHat,
             v:spread(an.v), w:spread(an.w), maxW:tested.length ? Math.max(...tested) : null};
  if(sh.ends){ out.widthD=perp(P,['A','B'],'D'); out.widthC=perp(P,['A','B'],'C'); }
  return out;
}

// Felder -> Auswertung. def: die Fliesenvariante (Form und Nennmasse).
function measure(def, fields, sigma){
  const sh=shapeOf(def.shape), obs=[], bad=[];
  for(const key of keysOf(sh)){
    const r=parseValues(fields[key]);
    r.vals.forEach(d=>obs.push({key, d}));
    if(r.bad.length) bad.push(key);
  }
  if(bad.length) return {obs, bad, error:`Nicht lesbar: ${bad.join(', ')}. Erlaubt sind Zahlen in mm, getrennt durch Leerzeichen.`};
  if(!(sigma>0)) return {obs, error:'Die Messgenauigkeit muss größer als 0 sein.'};
  if(!obs.length) return {obs, missing:null};
  const m=fitModel(sh, obs, sigma, def);
  if(m.missing || m.error) return {obs, ...m};
  return {obs, model:m, real:fitReal(sh, obs, sigma, m.corners)};
}

globalThis.TILEMEAS={SHAPES, BAARDA_W0, shapeOf, keysOf, parseValues, modelD, measure, angleAt};
})();
