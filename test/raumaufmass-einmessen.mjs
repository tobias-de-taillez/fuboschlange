// Prueft den Block "tilemeasure" der Raumaufmass-App gegen synthetische
// Fliesen mit bekannter Wahrheit - fuer jede Form des Fliesensets.
import {readFileSync, existsSync} from 'node:fs';

const file=['raumaufmass.html','raumaufmass_opus.html'].find(f=>existsSync(new URL('../'+f, import.meta.url)));
const html=readFileSync(new URL('../'+file, import.meta.url),'utf8');
const pick=id=>{
  const m=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`));
  if(!m) throw new Error(`Script-Block "${id}" nicht gefunden`);
  return m[1];
};
new Function('"use strict";\n'+pick('core')+'\n'+pick('tiles')+'\n'+pick('tilemeasure'))();
const M=globalThis.TILEMEAS, TL=globalThis.TILES;

const out=[]; let ok=true;
const chk=(name,cond,info='')=>{ ok=ok&&!!cond; out.push((cond?'ok   ':'ROT  ')+name+(info!==''?'  ('+info+')':'')); };
const near=(a,b,tol)=>Number.isFinite(a) && Math.abs(a-b)<=tol;

// Felder aus einer Wahrheit; perKey liefert je Strecke die Fehler der Wiederholungen.
const fieldsFor=(def, truth, perKey=()=>[0])=>{
  const sh=M.shapeOf(def.shape), p=sh.fromDef(truth);
  return Object.fromEntries(M.keysOf(sh).map(k=>[k, perKey(k).map(e=>String(M.modelD(sh,k,p)+e)).join(' ')]));
};
// Nennmasse absichtlich daneben: der Ausgleich muss von dort hinfinden.
const NOMINAL={chevron:{shape:'chevron',l:600,w:200,angle:45}, rectangle:{shape:'rectangle',l:300,w:300},
               triangle:{shape:'triangle',l:300}, hexagon:{shape:'hexagon',l:300}};

// 1. Exakte Strecken -> exakte Werte, fuer jede Form.
const TRUTH={chevron:{l:850,w:150,angle:45}, rectangle:{l:600,w:300}, triangle:{l:250}, hexagon:{l:346.4}};
for(const shape of Object.keys(TRUTH)){
  const def=NOMINAL[shape], t={...def,...TRUTH[shape]};
  const r=M.measure(def, fieldsFor(def,t), 0.5);
  for(const [k,v] of Object.entries(TRUTH[shape]))
    chk(`${shape}: ${k} exakt`, near(r.model?.def[k], v, 1e-6), r.model?.def[k] ?? r.error ?? JSON.stringify(r.missing));
  chk(`${shape}: echte Form bestimmt und widerspruchsfrei`, r.real?.dof===0 && (r.real.sigmaHat==null || r.real.sigmaHat<1e-3), r.real?.sigmaHat);
  // Die Ecken im Modell muessen TILES.tileShape entsprechen (gleicher Fliesenrahmen).
  const sh=M.shapeOf(shape), P=sh.corners(r.model.p);
  const id=shape==='chevron'?'legacy':'x', kind=shape==='chevron'?'L':'x';
  const spec={set:[TL.regularTileDef({...def,...r.model.def,thick:10,id})]};
  const S=TL.tileShape(spec, kind);
  // Gleiche Eckmenge; die Beschriftung darf anders anfangen (Dreieck: Grundseite AB).
  const same=sh.pts.length===S.length && sh.pts.every(p=>S.some(q=>Math.hypot(P[p].x-q.x, P[p].y-q.y)<1e-6));
  chk(`${shape}: Ecken wie TILES.tileShape`, same, JSON.stringify(S.map(q=>[+q.x.toFixed(1),+q.y.toFixed(1)])));
}

// 2. Chevron von 45 Grad Nennwinkel aus auf andere Winkel.
for(const deg of [30, 60, 75, 90]){
  const def=NOMINAL.chevron, r=M.measure(def, fieldsFor(def,{...def,l:600,w:100,angle:deg}), 0.5);
  chk(`chevron ${deg} Grad`, near(r.model?.def.angle,deg,1e-6) && near(r.model.def.w,100,1e-6), r.model?.def.angle);
}

// 3. Was fehlt, sagt die Rechnung - je Form.
{
  const c=M.measure(NOMINAL.chevron, {AB:'850', AD:'212', BC:'212'}, 0.5);
  chk('chevron ohne Diagonale/W: nennt AC, BD, W', ['AC','BD','W'].every(k=>c.missing?.includes(k)), JSON.stringify(c.missing));
  const w=M.measure(NOMINAL.chevron, {AB:'850', AD:'212,13', W:'150'}, 0.5);
  chk('chevron mit W statt Diagonale', near(w.model?.def.angle,45,0.01), w.model?.def.angle);
  const t=M.measure(NOMINAL.triangle, {W:'216,5'}, 0.5);
  chk('dreieck: Höhe allein reicht', near(t.model?.def.l,250,0.05), t.model?.def.l);
  const h=M.measure(NOMINAL.hexagon, {AB:'173,2'}, 0.5);
  chk('hexagon: eine Seite reicht', near(h.model?.def.l,346.4,1e-9) && h.real?.dof>0);
  const rc=M.measure(NOMINAL.rectangle, {AB:'600'}, 0.5);
  chk('rechteck nur Breite: Höhe fehlt', ['AD','BC','W'].every(k=>rc.missing?.includes(k)), JSON.stringify(rc.missing));
}

// 4. Unrunde Fliese: Rechteck mit 0,5 mm Schiefe. Echte Form zeigt den Winkel.
{
  const sh=M.shapeOf('rectangle');
  const P={A:{x:0,y:0}, B:{x:600,y:0}, C:{x:600.5,y:300}, D:{x:0.5,y:300}};
  const f=Object.fromEntries(sh.keys.map(([k,a,b])=>[k, String(Math.hypot(P[b].x-P[a].x, P[b].y-P[a].y))]));
  const r=M.measure(NOMINAL.rectangle, f, 0.5);
  chk('schiefes Rechteck: Ecke A ≠ 90°', near(r.real?.ang.A, 90-Math.atan2(0.5,300)*180/Math.PI, 1e-4), r.real?.ang.A);
}

// 5. Ausreisser mit Wiederholung wird gefunden (Chevron).
{
  const def=NOMINAL.chevron, t={...def,l:850,w:150,angle:45};
  const r=M.measure(def, fieldsFor(def,t,k=>k==='AC'?[0,5]:[0,0]), 0.5), q=r.real;
  const top=q.w.reduce((b,x,i)=>(x??-1)>(q.w[b]??-1)?i:b, 0);
  chk('Ausreisser erkannt und benannt', q.maxW>M.BAARDA_W0 && r.obs[top].key==='AC' && r.obs[top].d>1000, `${r.obs[top].key} ${q.maxW.toFixed(2)}`);
}

// 6. Unmoeglich und Tippfehler.
{
  const imp=M.measure(NOMINAL.chevron, {AB:'850', AD:'212', AC:'1200', BD:'100'}, 0.5);
  chk('unmoeglich: Meldung oder Widerspruch', typeof imp.error==='string' || imp.model?.sigmaHat>5, imp.error||imp.model?.sigmaHat);
  const typo=M.measure(NOMINAL.hexagon, {AB:'17x'}, 0.5);
  chk('Tippfehler: Feld benannt', typo.bad?.includes('AB'));
}

console.log(out.join('\n'));
console.log(ok ? '\nALLE CHECKS GRÜN' : '\nCHECKS ROT');
process.exit(ok ? 0 : 1);
