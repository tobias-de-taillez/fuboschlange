import {Clipper, ClipperOffset, JoinType, EndType, Paths64} from './package/fesm2020/clipper2-js.mjs';
const mk = pts => Clipper.makePath(pts.flat());
const off = (pts, delta) => {
  const co = new ClipperOffset();
  const ps = new Paths64(); ps.push(mk(pts));
  co.addPaths(ps, JoinType.Round, EndType.Polygon);
  const out = new Paths64(); co.execute(delta, out);
  return out;
};
const m2 = p => Math.abs(Number(Clipper.area(p)))/1e6;

const L = [[0,0],[8000,0],[8000,2000],[3000,2000],[3000,5000],[0,5000]];
console.log('L-Raum (8x5 m mit Aussparung), Bahnabstand 150 mm:');
for(let k=1;k<=16;k++){
  const r = off(L, -150*k);
  if(!r.length){ console.log(`  Versatz ${k}: leer -> Flaeche nach ${k-1} Konturen erschoepft`); break; }
  console.log(`  Versatz ${String(k).padStart(2)} (${String(150*k).padStart(4)} mm): ${r.length} Kontur(en), Flaeche ${r.map(p=>m2(p).toFixed(2)).join(' + ')} m2`);
}
console.log('\nHantelform (zwei Bereiche, Gang 400 mm breit):');
const H = [[0,0],[3000,0],[3000,1300],[5000,1300],[5000,0],[8000,0],[8000,3000],[5000,3000],[5000,1700],[3000,1700],[3000,3000],[0,3000]];
for(const d of [100,150,200,250,300]){
  const r = off(H,-d);
  console.log(`  Versatz ${String(d).padStart(3)} mm: ${r.length} Kontur(en) ${r.length>1?'  <- aufgespalten':''}`);
}
console.log('\nSchraege Wand (Trapez), Versatz 150 mm:');
const T = [[0,0],[6000,0],[4500,3000],[0,3000]];
for(let k=1;k<=4;k++){ const r=off(T,-150*k); console.log(`  Versatz ${k}: ${r.length} Kontur(en), ${r.length?m2(r[0]).toFixed(2)+' m2':'leer'}`); }
