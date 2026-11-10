// Prüft, dass raum-modell.js ohne das Aufmaß läuft: ein Werkzeug wie Fliesenplan
// oder Küchenplaner hat weder opMeasSeq noch syncSnapfitBtn noch syncOrthoBtn
// und muss Räume trotzdem laden, sichern und über Rückgängig zurückholen können.
// Aufruf: node test/raum-modell.mjs
import {readFileSync} from 'node:fs';

const lies=f=>readFileSync(new URL('../'+f, import.meta.url),'utf8');
const out=[]; let ok=true;
const chk=(name,cond)=>{ if(!cond) ok=false; out.push((cond?'ok   ':'ROT  ')+name); };

// Ein Werkzeug, das nur anbietet, was raum-modell.js verlangt: recompute, render
// und die Ansicht (VIEW, userView aus raum-zeichnung.js).
const KERNE=['raum-kern.js','raum-fliesen.js','fliesenplan-einmessen.js','raum-kueche.js','raum-geometrie.js','raum-speicher.js','raum-modell.js'];
const bau=(vorspann)=>new Function('"use strict";\n'+vorspann+'\n'+KERNE.map(lies).join('\n')+`
  return {M, serialize, deserialize, snapshot, undo, redo, undoStack, calls:()=>calls};`);
const mini=`let VIEW={rot:0,s:1,ox:0,oy:0}, userView=false; const calls={recompute:0, render:0};
  function recompute(){ calls.recompute++; } function render(){ calls.render++; }`;

const raum={
  pts:[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}],
  walls:[['A','B'],['B','C'],['C','D'],['D','A']],
  meas:[{a:'A',b:'B',d:4000,sigma:5,on:true},{a:'B',b:'C',d:3000,sigma:5,on:true}],
  // doppelte und fehlende Lagemaß-ids: deserialize bereinigt sie auch ohne Zähler
  opmeas:[{id:'om1',op:'o1',edge:'l',d:500,sigma:5,on:true},{id:'om1',op:'o1',edge:'r',d:700,sigma:5,on:true}],
  openings:[{id:'o1',a:'A',b:'B',x:600,y:0,w:900,h:2100}],
  tiles:{}, kitchen:{items:[]},
};

let env;
try{ env=bau(mini)(); chk('ohne opMeasSeq, syncSnapfitBtn und syncOrthoBtn: raum-modell.js lädt', true); }
catch(e){ chk('raum-modell.js lädt ohne Aufmaß-Bedienung ('+e.message+')', false); }

if(env){
  const {M}=env;
  let w=null;
  try{ env.deserialize(JSON.parse(JSON.stringify(raum))); }catch(e){ w=e; }
  chk('deserialize wirft ohne opMeasSeq und syncSnapfitBtn nicht'+(w?' ('+w.message+')':''), !w);
  chk('Lagemaß-ids sind auch ohne Zähler bereinigt (kein doppeltes om1)', new Set(M.opmeas.map(m=>m.id)).size===2);
  chk('Raum geladen: vier Ecken, vier Wände', M.pts.length===4 && M.walls.length===4);
  // Rückgängig und Wiederherstellen laufen über restoreSnapshot -> deserialize -> recompute
  env.snapshot(); M.pts[0].x=50;
  let u=null; try{ env.undo(); }catch(e){ u=e; }
  chk('Rückgängig wirft nicht und holt die Ecke zurück'+(u?' ('+u.message+')':''), !u && M.pts[0].x===0 && env.calls().recompute>=1);
  let r=null; try{ env.redo(); }catch(e){ r=e; }
  chk('Wiederherstellen wirft nicht'+(r?' ('+r.message+')':''), !r && M.pts[0].x===50);
}

// Mit den Aufmaß-Zugaben bleibt es wie bisher: der Zähler läuft weiter, der Schalter wird gerufen.
{
  const env2=new Function('"use strict";\n'+'let VIEW={rot:0,s:1,ox:0,oy:0}, userView=false; const calls={recompute:0, render:0};'
    +'function recompute(){ calls.recompute++; } function render(){ calls.render++; } let opMeasSeq=5; let snap=0; function syncSnapfitBtn(){ snap++; } function syncOrthoBtn(){}\n'
    +KERNE.map(lies).join('\n')+'\nreturn {M, deserialize, seq:()=>opMeasSeq, snap:()=>snap};')();
  env2.deserialize(JSON.parse(JSON.stringify(raum)));
  chk('mit Aufmaß: der Lagemaß-Zähler läuft weiter (5 bleibt, doppelte om1 bekommt om5)', env2.seq()===6 && env2.M.opmeas.map(m=>m.id).join()==='om1,om5');
  chk('mit Aufmaß: syncSnapfitBtn wird nach dem Laden gerufen', env2.snap()===1);
}

console.log(out.join('\n'));
console.log(ok ? '\nraum-modell: alles grün' : '\nraum-modell: ROT');
process.exit(ok?0:1);
