// raumskizze-nulltest.mjs — Nulltest (Konzept 3.1 Punkt 1): kein Eingriff darf auf einem gesunden Raum etwas aendern.
// Vergleicht die Kennzahlen eines T1-Laufs auf dem Flur (ergebnis.json von raumskizze-karte.mjs --aus) mit
// nulltest-baseline.json. Aufruf ueber scripts/raumskizze-nulltest.sh, das T1 selbst startet:
//
//   node raumskizze-nulltest.mjs --ergebnis ordner/ergebnis.json [--baseline nulltest-baseline.json] [--baseline-schreiben]
//        [--tar t.tar --protokoll p.json --wahrheit w.json]   (Pruefsummen der Eingaben) [--befehl "..."] [--stand kurzhash]
//   Exit 0 gruen, 1 Verschlechterung ueber Toleranz oder Pflichtwert verletzt, 2 Eingabe fehlt oder hat sich geaendert.
//   import {kennzahlenAus, vergleichen, KENNZAHLEN, NOCH_NICHT} from './raumskizze-nulltest.mjs'
//
// T1 ist wiederholbar (keine Uhr, kein Zufall in Entscheidungen): zwei Laeufe mit gleicher Eingabe geben gleiche Zahlen. Die
// Toleranzen fangen also kein Rauschen ab, sondern sagen, ab wann eine Aenderung fuer den Nutzer oder die Folgeschritte zaehlt.
// Aendert sich die Eingabe (Aufnahme, Protokoll, Wahrheit), ist das keine Verschlechterung, sondern ein neuer Massstab: Exit 2.
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as K from './raumskizze-kippquote.mjs';
import * as T1 from './raumskizze-karte.mjs';

export const VERSION=1;
const cm=x=>Number.isFinite(x) ? 100*x : null;
const ringJson=e=>e && e.export && e.export.pts ? e.export.pts.map(p=>[p.x/1000, p.y/1000]) : null;
// Wahrheitswaende, die von mindestens 2 verschiedenen Landmarken getroffen werden (zwei Landmarken auf einer Wand = Doppelwand;
// n1 der Metrik ist das Gegenteil: eine Landmarke auf mehreren Wahrheitswaenden)
export function doppelwaende(m){ if(!m || !m.waende || !m.waende.treffer) return null; const c=new Map();
  for(const t of m.waende.treffer) for(const w of new Set(t.waende.map(x=>Array.isArray(x) ? x.join('-') : String(x)))) c.set(w, (c.get(w)||0)+1);
  return [...c.values()].filter(n=>n>=2).length; }

// Kennzahlen: id, Name, Einheit, Richtung (hoeher|niedriger ist besser), Auszug, Toleranz (abs: erlaubte Verschlechterung),
// optional pflicht = Pflichtwert aus Konzept 3.1 (absolut, unabhaengig von der Baseline)
export const KENNZAHLEN=[
  {id:'iou', name:'IoU Aussenring gegen Wahrheit', einheit:'', ri:'hoeher', stellen:4, tol:0.02, pflicht:{min:0.76, quelle:'Konzept 3.1: IoU >= 0,76'},
    wie:'Flaeche des Aussenrings ~17 m2; 0,02 sind ~0,3 m2, etwa eine um 5 cm verschobene 7-m-Wand. Darunter sieht es der Nutzer nicht',
    aus:(e, m)=>m.aussen && m.aussen.iou},
  {id:'eckenMedian', name:'Eckenfehler Median (zugeordnete Ecken)', einheit:'cm', ri:'niedriger', stellen:2, tol:1, pflicht:{max:4, quelle:'Konzept 3.1: Median <= 4 cm'},
    wie:'Messgenauigkeit der Karte ~3-5 cm (Beob-Median 4,7 cm); +1 cm ist die Aufloesung, ab der ein Eingriff Ecken wirklich verschiebt',
    aus:(e, m)=>cm(m.aussen && m.aussen.eMed)},
  {id:'eckenP90', name:'Eckenfehler p90 (zugeordnete Ecken)', einheit:'cm', ri:'niedriger', stellen:2, tol:2,
    wie:'p90 liegt bei nur 6 zugeordneten Ecken nahe am Maximum und schwankt staerker als der Median: doppelte Toleranz',
    aus:(e, m)=>cm(m.aussen && m.aussen.eP90)},
  {id:'mehrdeutigkeit', name:'Mehrdeutigkeit der Passung (Kostenverhaeltnis 2. zu 1.)', einheit:'', ri:'hoeher', stellen:2, tol:0.3,
    wie:'1,0 hiesse: zweitbeste Lage genauso gut (Spiegelung/Drehung offen). Fallen bis 1,66 bei 1,96 heisst noch klar eindeutig',
    aus:(e, m)=>m.passung && m.passung.verhaeltnis},
  {id:'zugeordnet', name:'Ecken der Karte, der Wahrheit zugeordnet', einheit:'', ri:'hoeher', stellen:0, tol:1,
    wie:'Zuordnung ist ganzzahlig und haengt an der 15-cm-Schwelle; eine Ecke mehr oder weniger ist die kleinste Aenderung',
    aus:(e, m)=>m.aussen && m.aussen.zugeordnet && m.aussen.zugeordnet.length},
  {id:'wandtreffer', name:'Wahrheitswaende von Landmarken getroffen', einheit:'', ri:'hoeher', stellen:0, tol:0,
    wie:'jede verlorene Wand ist ein sichtbarer Fehler im gesunden Raum; Toleranz 0 (bewusst lockern, wenn ein Schritt es begruendet)',
    aus:(e, m)=>m.waende && m.waende.gefunden},
  {id:'doppelwaende', name:'Doppelwaende (Wahrheitswand von >= 2 Landmarken getroffen)', einheit:'', ri:'niedriger', stellen:0, tol:0,
    wie:'Doppelte Landmarken auf einer Wand sind der Fehler, den Zusammenfuehren verhindern soll; im gesunden Raum 0 und soll 0 bleiben',
    aus:(e, m)=>doppelwaende(m)},
  {id:'ungueltigeRinge', name:'ungueltige Ringe (verworfen, kreuzend, Drehsumme)', einheit:'', ri:'niedriger', stellen:0, tol:0, pflicht:{max:0, quelle:'Konzept 3.1: 0 ungueltige Ringe sichtbar'},
    wie:'ein kreuzender oder verworfener Ring ist nie hinnehmbar',
    aus:(e)=>{ const P=ringJson(e), v=e.pruef && e.pruef.verworfen ? e.pruef.verworfen.length : 0; return v+(e.pruef && e.pruef.ok===false ? 1 : 0)+(P && !K.gueltig(P) ? 1 : 0); }},
  {id:'beobMedian', name:'Beobachtungen: Abstand Median (gehoben, alle)', einheit:'cm', ri:'niedriger', stellen:2, tol:1,
    wie:'Rohgenauigkeit der Erfassungen gegen die Wahrheit, vor jeder Ausgleichung; +1 cm ist ~20 % des Medians',
    aus:(e, m)=>cm(m.beob && m.beob.gehoben && m.beob.gehoben.alle && m.beob.gehoben.alle.med)},
];
// Nur zur Information (keine Pruefung): Zahlen, die der Lauf ohnehin liefert
export const INFO=[
  {id:'eckenKarte', name:'Ecken im Aussenring', aus:(e, m)=>m.aussen && m.aussen.n},
  {id:'flaeche', name:'Flaeche netto (m2)', aus:(e, m)=>m.flaechen && m.flaechen.netto && m.flaechen.netto.A},
  {id:'flaechenfehler', name:'Flaechenfehler netto', aus:(e, m)=>m.flaechen && m.flaechen.netto && m.flaechen.netto.dA},
  {id:'landmarken', name:'Landmarken (Waende)', aus:(e, m)=>m.waende && m.waende.nWand},
  {id:'n1', name:'Landmarken auf >= 2 Wahrheitswaenden (n:1)', aus:(e, m)=>m.waende && m.waende.n1 && m.waende.n1.length},
  {id:'hoeheFehler', name:'Hoehe gegen Laser (cm)', aus:(e, m)=>cm(m.hoehe && m.hoehe.dH)},
];
// Kriterien aus Konzept 3.1, die erst spaetere Funktionen messen koennen: erscheinen in der Ausgabe, nicht in der Pruefung
export const NOCH_NICHT=[
  {id:'verdachtswaende', name:'Verdachtswaende', soll:'0', braucht:'Schrank-/Stuck-Erkennung (P6, AP Verdachtswand)'},
  {id:'peilabweichung', name:'Ecken mit Peilabweichung > 3 Grad', soll:'<= 1 von 20', braucht:'Eckenpeilung (P1/P6)'},
  {id:'vertauschteEckenpaare', name:'vertauschte Eckenpaare', soll:'0', braucht:'Eckenzuordnung ueber Abschnitte (P1)'},
];

export function kennzahlenAus(e){
  const m=e && e.metrik; if(!m) throw new Error('ergebnis.json ohne metrik (T1 mit --wahrheit und ohne --metrik aus laufen lassen)');
  const k={}; for(const d of KENNZAHLEN){ const v=d.aus(e, m); k[d.id]=Number.isFinite(v) ? +v.toFixed(6) : null; }
  const info={}; for(const d of INFO){ const v=d.aus(e, m); info[d.id]=Number.isFinite(v) ? +v.toFixed(6) : null; }
  return {kennzahlen:k, info};
}
// Vergleich: je Kennzahl Wert, Basis, Abweichung (positiv = besser), Status ok | besser | schlechter | fehlt; Pflichtwerte getrennt
export function vergleichen(kenn, baseline){
  const zeilen=[]; let ok=true;
  for(const d of KENNZAHLEN){ const b=baseline.kennzahlen[d.id], t=baseline.toleranzen && baseline.toleranzen[d.id] ? baseline.toleranzen[d.id].abs : d.tol, w=kenn[d.id];
    const z={id:d.id, name:d.name, einheit:d.einheit, ri:d.ri, wert:w, basis:b, tol:t, stellen:d.stellen};
    if(w==null || b==null){ z.status=w==null && b==null ? 'fehlt' : 'schlechter'; z.delta=null; if(z.status==='schlechter') ok=false; }
    else { z.delta=+((d.ri==='hoeher' ? w-b : b-w).toFixed(6)); z.status=z.delta<-t-1e-9 ? 'schlechter' : z.delta>1e-9 ? 'besser' : 'ok'; if(z.status==='schlechter') ok=false; }
    if(d.pflicht && w!=null){ const verletzt=d.pflicht.min!=null ? w<d.pflicht.min : w>d.pflicht.max; z.pflicht={...d.pflicht, verletzt}; if(verletzt) ok=false; }
    zeilen.push(z); }
  return {zeilen, ok};
}
const fmt=(x, s)=>x==null ? '–' : x.toFixed(s);
export function bericht(v, kenn, info, baseline){
  const L=[`Nulltest Flur (Aufnahme ${baseline.aufnahme}), Baseline vom ${baseline.erzeugt}`];
  const w=Math.max(...v.zeilen.map(z=>z.name.length));
  L.push(`  ${'Kennzahl'.padEnd(w)}  ${'Wert'.padStart(9)}  ${'Baseline'.padStart(9)}  ${'Abw.*'.padStart(8)}  ${'Toleranz'.padStart(8)}  Status`);
  for(const z of v.zeilen){ const st=z.status==='schlechter' ? 'ROT' : z.status==='besser' ? 'besser' : z.status;
    L.push(`  ${z.name.padEnd(w)}  ${(fmt(z.wert, z.stellen)+(z.einheit ? ' '+z.einheit : '')).padStart(9)}  ${fmt(z.basis, z.stellen).padStart(9)}  ${fmt(z.delta, z.stellen).padStart(8)}  ${(z.tol ? '-'+z.tol : '0').padStart(8)}  ${st}${z.pflicht ? (z.pflicht.verletzt ? '  PFLICHTWERT VERLETZT ('+z.pflicht.quelle+')' : '  (Pflicht '+(z.pflicht.min!=null ? '>= '+z.pflicht.min : '<= '+z.pflicht.max)+' ok)') : ''}`); }
  L.push('  * Abweichung positiv = besser als die Baseline, negativ = schlechter; ROT ab Verschlechterung ueber die Toleranz');
  L.push('  Info (nicht geprueft): '+INFO.map(d=>`${d.name} ${info[d.id] ?? '–'}`).join('; '));
  L.push('  noch nicht verfuegbar (Konzept 3.1, nicht in der Pruefung): '+NOCH_NICHT.map(d=>`${d.name} (Soll ${d.soll}; braucht ${d.braucht})`).join('; '));
  return L.join('\n');
}
const sha=datei=>createHash('sha256').update(readFileSync(datei)).digest('hex').slice(0, 16);
function eingaben(a){ const o={}; for(const k of ['tar', 'protokoll', 'wahrheit']) if(a[k] && a[k]!==true){ const f=resolve(a[k]); if(!existsSync(f)) throw new Error(`--${k} ${f} fehlt`); o[k]={datei:basename(f), sha256:sha(f)}; } return o; }

function main(){
  const a=T1.argumente(process.argv.slice(2));
  if(!a.ergebnis){ console.error('Aufruf: node raumskizze-nulltest.mjs --ergebnis ordner/ergebnis.json [--baseline nulltest-baseline.json] [--baseline-schreiben] [--tar t --protokoll p --wahrheit w] [--befehl "..."] [--stand hash]'); process.exit(2); }
  const bf=resolve(a.baseline && a.baseline!==true ? a.baseline : fileURLToPath(new URL('./nulltest-baseline.json', import.meta.url)));
  if(!existsSync(resolve(a.ergebnis))){ console.error('ergebnis.json fehlt: '+resolve(a.ergebnis)); process.exit(2); }
  const e=JSON.parse(readFileSync(resolve(a.ergebnis), 'utf8')), {kennzahlen, info}=kennzahlenAus(e), ein=eingaben(a);
  if(a['baseline-schreiben']){
    const toleranzen=Object.fromEntries(KENNZAHLEN.map(d=>[d.id, {abs:d.tol, richtung:d.ri, einheit:d.einheit, ...(d.pflicht ? {pflicht:d.pflicht} : {}), begruendung:d.wie}]));
    const B={werkzeug:'raumskizze-nulltest.mjs', version:VERSION, erzeugt:new Date().toISOString().slice(0, 10), stand:a.stand && a.stand!==true ? String(a.stand) : null, node:process.version,
      aufnahme:e.kopf && e.kopf.quelle ? basename(String(e.kopf.quelle)) : null, eingaben:ein, befehl:a.befehl && a.befehl!==true ? String(a.befehl) : null,
      hinweis:'Aus einem echten T1-Lauf erzeugt (scripts/raumskizze-nulltest.sh --baseline-schreiben), nicht von Hand. T1 ist wiederholbar: Toleranzen sind Bedeutungsgrenzen, kein Rauschen. Neu schreiben nur mit Begruendung im Commit.',
      kennzahlen, info, toleranzen, nochNichtVerfuegbar:NOCH_NICHT};
    writeFileSync(bf, JSON.stringify(B, null, 2)+'\n'); console.log('Baseline geschrieben: '+bf); console.log(JSON.stringify({kennzahlen, info})); return process.exit(0); }
  if(!existsSync(bf)){ console.error('Baseline fehlt: '+bf+' (mit --baseline-schreiben erzeugen)'); process.exit(2); }
  const B=JSON.parse(readFileSync(bf, 'utf8'));
  const geaendert=Object.keys(B.eingaben||{}).filter(k=>ein[k] && ein[k].sha256!==B.eingaben[k].sha256);
  if(geaendert.length){ console.error(`Eingabe geaendert gegen die Baseline: ${geaendert.map(k=>`${k} ${B.eingaben[k].sha256} -> ${ein[k].sha256}`).join('; ')}. Das ist kein Vergleich; Baseline mit --baseline-schreiben neu erzeugen.`); process.exit(2); }
  const v=vergleichen(kennzahlen, B);
  console.log(bericht(v, kennzahlen, info, B));
  console.log(v.ok ? '\nNULLTEST GRÜN' : '\nNULLTEST ROT: '+v.zeilen.filter(z=>z.status==='schlechter' || (z.pflicht && z.pflicht.verletzt)).map(z=>z.id).join(', '));
  process.exit(v.ok ? 0 : 1);
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) try{ main(); }catch(e){ console.error(e.message); process.exit(2); }
