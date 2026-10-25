// raumskizze-anker.mjs — liest das Anker-Netz aus einer Aufnahme von raumskizze-probe.html
// (TAR von „Aufnahme sichern“, ausgepackter Ordner) oder aus „Protokoll (JSON)“ und
// zeigt je Befund (Ereignis 'netz') die Einordnung und die Verlaeufe aller Anker um
// den Anlass: Versatz jedes Ankers gegen seine letzte Lage vor dem Anlass (cm / °),
// P = pausiert, S = gestoppt. Dazu die Spruenge, wie sie die Zeilen selbst zeigen.
//
//   node raumskizze-anker.mjs aufnahme.tar|ordner|protokoll.json [--vor=3] [--nach=5] [--alle]
//
// --alle zeigt die Verlaeufe auch fuer Befunde ohne Bewegung (stetig, ohne-netz).
import {readFileSync, statSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

const argv=process.argv.slice(2);
const flag=(n,d)=>{ const a=argv.find(x=>x.startsWith('--'+n+'=')); return a ? Number(a.split('=')[1]) : d; };
const src=argv.find(a=>!a.startsWith('--'));
if(!src){ console.error('Aufruf: node raumskizze-anker.mjs aufnahme.tar|ordner|protokoll.json [--vor=3] [--nach=5] [--alle]'); process.exit(1); }
const VOR=flag('vor', 3), NACH=flag('nach', 5), ALLE=argv.includes('--alle');

// --- Quelle lesen: {name: Buffer}
const files={};
if(statSync(src).isDirectory()){
  const walk=d=>readdirSync(d, {withFileTypes:true}).forEach(e=>{ const p=join(d, e.name); if(e.isDirectory()) walk(p); else files[e.name]=readFileSync(p); });
  walk(src);
} else if(/\.json$/i.test(src)) files['protokoll.json']=readFileSync(src);
else {
  const b=readFileSync(src);
  for(let o=0; o+512<=b.length;){
    const name=b.subarray(o, o+100).toString('utf8').replace(/\0.*$/s, '');
    if(!name) break;
    const size=parseInt(b.subarray(o+124, o+136).toString('utf8').replace(/\0.*$/s, '').trim(), 8);
    files[name.split('/').pop()]=b.subarray(o+512, o+512+size);
    o+=512+Math.ceil(size/512)*512;
  }
}
const M=files['manifest.json'] ? JSON.parse(files['manifest.json']) : null;
const P=files['protokoll.json'] ? JSON.parse(files['protokoll.json']) : null;
let rows=[], cols=null, meta=[];
if(files['anker.jsonl']){ rows=files['anker.jsonl'].toString('utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)); cols=M && M.anker ? M.anker.spalten : null; meta=M && M.anker ? M.anker.netz || [] : []; }
else if(P && P.anker){ rows=P.anker.zeilen; cols=P.anker.spalten; meta=P.anker.netz || []; }
cols=cols || ['t','anlass','kx','ky','kz','kpsi','bezug','vorher','anker'];
const C=Object.fromEntries(cols.map((k,i)=>[k,i]));
const events=P ? (P.events||[]) : [];
const befunde=events.filter(e=>e.type==='netz');
if(!rows.length && !befunde.length){ console.log('Kein Anker-Netz in dieser Quelle (Seite vor dem Anker-Netz oder ?netz=0).'); process.exit(0); }

const f1=x=>x==null || !Number.isFinite(x) ? '–' : x.toFixed(1);
const wrap=a=>Math.atan2(Math.sin(a), Math.cos(a));
const rolle=new Map(meta.map(m=>[m.id, m.rolle]));
// je Zeile: id -> [x,y,z,psi] | 0 | -1
const entries=r=>new Map(r[C.anker].map(e=>[e[0], e.length>2 ? e.slice(1) : e[1]]));
const R=rows.map(r=>({t:r[C.t], anlass:r[C.anlass], cam:[r[C.kx], r[C.ky], r[C.kz], r[C.kpsi]], B:r[C.bezug], V:r[C.vorher], A:entries(r)}));

// --- Ueberblick
const t0=R.length ? R[0].t : NaN, t1=R.length ? R[R.length-1].t : NaN;
console.log(`Anker-Netz: ${R.length} Zeilen, ${f1(t0)}–${f1(t1)} s${M ? ` · Aufnahme ${M.name}` : ''}${P && P.started ? ` · Sitzung ${P.started}` : ''}`);
const Z=(M && M.anker && M.anker.zahlen) || (P && P.netz) || null;
if(Z) console.log(`Zähler: Messanker gesetzt ${Z.gesetzt}, gelöscht ${Z.geloescht}, fehlgeschlagen ${Z.fehl}, höchstens ${Z.max} Anker gleichzeitig, ${Z.takte} Aufnahmen, getPose ${Z.getPose} (je Aufnahme höchstens ${Z.getPoseMax}), Befunde ${JSON.stringify(Z.befunde)}${Z.unterdrueckt ? `, ${Z.unterdrueckt} unterdrückt` : ''}`);
if(P && P.timings && P.timings.netz && P.timings.netz.length){ const s=[...P.timings.netz].sort((a,b)=>a-b); console.log(`Rechenzeit je Aufnahme am Gerät: Median ${s[s.length>>1]} ms, 90 % ${s[Math.floor(0.9*s.length)]} ms, max ${s[s.length-1]} ms (${s.length} Werte)`); }
if(meta.length) console.log('Anker: '+meta.map(m=>`${m.id}${m.rolle==='bezug' ? 'B' : ''}@${f1(m.t)}${m.weg!=null ? '–'+f1(m.weg) : ''}`).join(' '));
// Zustandswechsel je Anker (verfolgt/pausiert/gestoppt) aus den Zeilen
{ const st=new Map(), out=[];
  for(const r of R) for(const [id,P_] of r.A){ const z=Array.isArray(P_) ? 'v' : P_===0 ? 'P' : 'S'; if(st.get(id)!==z){ if(st.has(id)) out.push(`${f1(r.t)} ${id}:${st.get(id)}→${z}`); st.set(id, z); } }
  if(out.length) console.log('Wechsel (v = verfolgt, P = pausiert, S = gestoppt): '+out.join(' · ')); }

// --- Verlauf um einen Zeitpunkt: Versatz gegen die letzte verfolgte Lage vor tA
function verlauf(tA, ids){
  const vorher=new Map();
  for(const r of R){ if(r.t>=tA) break; for(const [id,P_] of r.A) if(Array.isArray(P_)) vorher.set(id, P_); }
  const win=R.filter(r=>r.t>=tA-VOR && r.t<=tA+NACH);
  if(!ids) ids=[...new Set(win.flatMap(r=>[...r.A.keys()]))];
  const head=['t'.padStart(7), 'Anlass'.padEnd(26), ...ids.map(id=>`${id}${rolle.get(id)==='bezug' ? 'B' : ''}`.padStart(12))].join(' ');
  console.log('    '+head);
  for(const r of win){
    const cells=ids.map(id=>{ const P_=r.A.get(id), b=vorher.get(id);
      if(P_===undefined) return '.'.padStart(12);
      if(P_===0) return 'P'.padStart(12);
      if(P_===-1) return 'S'.padStart(12);
      if(!b) return 'neu'.padStart(12);
      const d=Math.hypot(P_[0]-b[0], P_[1]-b[1], P_[2]-b[2])*100, p=wrap(P_[3]-b[3])*180/Math.PI;
      return `${f1(d)}/${f1(p)}°`.padStart(12); });
    console.log('    '+[r.t.toFixed(2).padStart(7), String(r.anlass||'').slice(0,26).padEnd(26), ...cells].join(' ')+(r.t>=tA && r.t<tA+0.02 ? '  ←' : ''));
  }
}

// --- Befunde
if(befunde.length){
  console.log(`\nBefunde (${befunde.length}):`);
  for(const e of befunde){
    console.log(`\n  ${e.t.toFixed(2)} s  [${e.anlass}${e.ereignis ? ' ← '+e.ereignis : ''}${e.nachpruefung!=null ? `, Nachprüfung +${e.nachpruefung} s, vorher ${e.vorher}` : ''}]  ${e.befund}`);
    console.log(`    ${e.text}`);
    if(e.bezug && e.bezug.C) console.log(`    Bezugsanker ${e.bezug.id}: Sprung im eigenen Rahmen (T_vorher⁻¹ · T_nachher) dx ${f1(e.bezug.C[0]*100)} dy ${f1(e.bezug.C[1]*100)} dz ${f1(e.bezug.C[2]*100)} cm, dψ ${e.bezug.C[3]}°`);
    if(e.je && e.je.length) console.log('    je Messanker [id, Versatz m, dψ °, Lage zum Bezug geändert m]: '+e.je.map(j=>JSON.stringify(j)).join(' '));
    const ruhig=/^(stetig|ohne-netz)$/.test(e.befund);
    if(R.length && (ALLE || !ruhig) && e.nachpruefung==null) verlauf(e.anlass==='wieder' ? e.t : e.t);
  }
} else if(P) console.log('\nKeine Befunde im Protokoll.');
else console.log('\n(Kein Protokoll in der Quelle - Befunde stehen als Ereignisse netz im Protokoll; hier nur die Zeilen.)');

// --- Spruenge, wie die Zeilen selbst sie zeigen (unabhaengig von den Befunden)
const J=[];
for(let i=1;i<R.length;i++){ const a=R[i-1], b=R[i], mv=[];
  for(const [id,P_] of b.A){ const o=a.A.get(id); if(!Array.isArray(P_) || !Array.isArray(o)) continue;
    const d=Math.hypot(P_[0]-o[0], P_[1]-o[1], P_[2]-o[2]), p=Math.abs(wrap(P_[3]-o[3]));
    if(d>0.03 || p>0.5*Math.PI/180) mv.push(`${id}${rolle.get(id)==='bezug' ? 'B' : ''} ${f1(d*100)} cm/${f1(p*180/Math.PI)}°`); }
  if(mv.length) J.push(`${b.t.toFixed(2)} s (${mv.length} von ${[...b.A.values()].filter(Array.isArray).length} verfolgten): ${mv.join(', ')}`); }
console.log(`\nSprünge zwischen zwei Zeilen (> 3 cm oder > 0,5°), aus den Lagen selbst: ${J.length ? '\n  '+J.join('\n  ') : 'keine'}`);
