#!/usr/bin/env node
// (Historisch: „pruefen vor-kerne“ gilt nur für den Stand bis zum Tag x1-bedienung-dateien; danach hat sich raumaufmass.html weiter verändert, siehe scripts/umzug-plan.mjs.)
// Auslagern der vier DOM-freien Skriptblöcke aus raumaufmass.html in geteilte
// Dateien (docs/adr/0001-familie-mit-geteilten-js-dateien.md), wörtlich und
// per Prüfsumme beweisbar:
//   tiles       -> raum-fliesen.js           Fliesen-Geometrie (globalThis.TILES)
//   tilemeasure -> fliesenplan-einmessen.js  Fliese aus Strecken einmessen (globalThis.TILEMEAS)
//   kitchen     -> raum-kueche.js            Küchen-Rechenkern (globalThis.KITCHEN)
//   checks      -> raum-checks.js            Selbstchecks (globalThis.selfChecks)
//
//   node scripts/umzug-kerne.mjs umziehen            schreibt die vier Dateien, setzt <script src> an dieselbe Stelle
//   node scripts/umzug-kerne.mjs pruefen <Stand>     Beweis gegen einen alten Stand (Tag vor-kerne)
//   node scripts/umzug-kerne.mjs aus <Stand> <Ordner> schreibt die vier Dateien aus einem alten Stand in einen Ordner
//
// „aus“ ist für Zweige, die noch vor dem Umzug abzweigen: Basis aus vor-kerne,
// eigene Fassung aus der Zweigspitze, dann je Datei git merge-file gegen die
// Fassung auf main. Das Skript kann weg, sobald kein solcher Zweig mehr lebt.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const WURZEL=new URL('..', import.meta.url);
const pfad=f=>new URL(f, WURZEL);
const PLAN=[
  ['tiles', 'raum-fliesen.js',
`// raum-fliesen.js – Fliesen-Geometrie der Werkzeugfamilie: Formen, Rahmen,
// Schnitte, Fugen, Raum und Inseln (docs/adr/0001-familie-mit-geteilten-js-dateien.md).
// DOM-frei, läuft in node test/run.mjs wie im Browser. Unverändert aus dem
// früheren Block "tiles" von raumaufmass.html; legt globalThis.TILES an.
// Braucht: raum-kern.js (pointInPoly). Der Küchen-Kern rechnet mit dieser Geometrie.
`],
  ['tilemeasure', 'fliesenplan-einmessen.js',
`// fliesenplan-einmessen.js – eine Fliese aus gemessenen Strecken einmessen
// (docs/adr/0001-familie-mit-geteilten-js-dateien.md). DOM-frei. Unverändert
// aus dem früheren Block "tilemeasure" von raumaufmass.html; legt
// globalThis.TILEMEAS an. Gehört dem Fliesenplan allein.
// Braucht: raum-kern.js (CORE).
`],
  ['kitchen', 'raum-kueche.js',
`// raum-kueche.js – Rechenkern des Küchenplaners: Teile, Lage an der Wand,
// Prüfungen, Wege, Stückliste, Szene für 3D (docs/adr/0001-familie-mit-geteilten-js-dateien.md).
// DOM-frei, läuft in node test/run.mjs wie im Browser. Unverändert aus dem
// früheren Block "kitchen" von raumaufmass.html; legt globalThis.KITCHEN an.
// Braucht: raum-kern.js (CORE, escapeHtml), raum-fliesen.js (TILES) und, erst
// beim Aufruf, raum-geometrie.js (wallShape, ceilingAt, ceilingMin, doorSwing).
// Auch das Raumaufmaß lädt sie: Küchendaten bleiben am Raum (raum-modell.js).
`],
  ['checks', 'raum-checks.js',
`// raum-checks.js – Selbstchecks der Werkzeugfamilie (Raumaufmaß, Fliesen,
// Küche). Unverändert aus dem früheren Block "checks" von raumaufmass.html;
// legt globalThis.selfChecks an. node test/run.mjs führt sie aus, im Browser
// laufen sie mit raumaufmass.html?test.
// Braucht: raum-fremd.js, raum-kern.js, raum-fliesen.js, raum-kueche.js,
// raum-geometrie.js, raum-speicher.js. Lädt als letztes Skript der Seite.
`],
];
const block=id=>new RegExp(`<script id="${id}">\\n([\\s\\S]*?)</script>`);
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const ausGit=(stand, datei)=>execFileSync('git', ['show', `${stand}:${datei}`], {cwd:pfad('.'), maxBuffer:64*1024*1024}).toString('utf8');

// Zerlegt eine alte raumaufmass.html: neue HTML-Datei und die vier Dateiinhalte.
function zerlege(html){
  const dateien={};
  for(const [id, datei, kopf] of PLAN){
    const m=html.match(block(id));
    if(!m) throw new Error(`Block "${id}" fehlt in raumaufmass.html`);
    if(!m[1].startsWith('"use strict";')) throw new Error(`Block "${id}" beginnt nicht mit "use strict";`);
    dateien[datei]=kopf+m[1];
    html=html.replace(block(id), ()=>`<script src="${datei}"></script>`);
  }
  return {html, dateien};
}

const [was, a, b]=process.argv.slice(2);
if(was==='umziehen'){
  const {html, dateien}=zerlege(readFileSync(pfad('raumaufmass.html'),'utf8'));
  for(const [datei, text] of Object.entries(dateien)) writeFileSync(pfad(datei), text);
  writeFileSync(pfad('raumaufmass.html'), html);
  console.log('umgezogen:', Object.keys(dateien).join(', '), '| raumaufmass.html', html.split('\n').length, 'Zeilen');
} else if(was==='aus' && a && b){
  const {dateien}=zerlege(ausGit(a, 'raumaufmass.html'));
  mkdirSync(b, {recursive:true});
  for(const [datei, text] of Object.entries(dateien)) writeFileSync(b.replace(/\/$/,'')+'/'+datei, text);
  console.log('geschrieben nach', b+':', Object.keys(dateien).join(', '));
} else if(was==='pruefen' && a){
  // Beweis: jede Datei ist Kopf (nur Kommentar) + Blockinhalt Byte für Byte, und
  // die HTML-Datei ist die alte mit genau den vier ersetzten Blöcken. Der Block
  // "vollstaendig" bleibt beim Vergleich außen vor: er nennt seit dem Umzug die
  // drei Kerne als Pflichtdateien. Weicht die Seite sonst ab (sie wurde seither
  // weiterbearbeitet), sagt die letzte Zeile das, ohne den Beweis der Blöcke zu kippen.
  const alt=ausGit(a, 'raumaufmass.html');
  let ok=true;
  for(const [id, datei] of PLAN){
    const m=alt.match(block(id));
    const f=readFileSync(pfad(datei),'utf8'), i=f.indexOf('"use strict";');
    const kopf=f.slice(0,i), gleich=!!m && f.slice(i)===m[1];
    const nurKommentar=kopf.split('\n').every(z=>z==='' || z.startsWith('//'));
    const weg=!new RegExp(`<script id="${id}"`).test(readFileSync(pfad('raumaufmass.html'),'utf8'));
    ok=ok && gleich && nurKommentar && weg;
    console.log((gleich && nurKommentar && weg ? 'ok   ' : 'ROT  ')+datei.padEnd(26)+'Block '+id.padEnd(12)+(m ? sha(m[1]).slice(0,16) : 'fehlt im alten Stand')
      +'  Kopf '+(kopf.split('\n').length-1)+' Zeilen'+(weg ? '' : '  (Block steht noch in der HTML-Datei)'));
  }
  const ohne=s=>s.replace(block('vollstaendig'), '<script id="vollstaendig"></script>');
  const erwartet=ohne(zerlege(alt).html), ist=ohne(readFileSync(pfad('raumaufmass.html'),'utf8'));
  const g=erwartet===ist;
  console.log((g ? 'ok   ' : 'anders ')+'raumaufmass.html '+(g ? 'ist der alte Stand mit genau vier ersetzten Blöcken, sonst Byte für Byte gleich (Block "vollstaendig" ausgenommen)' : 'weicht außerhalb der vier Blöcke und des Blocks "vollstaendig" vom alten Stand ab (seither weiterbearbeitet)'));
  process.exit(ok ? 0 : 1);
} else {
  console.error('Aufruf: node scripts/umzug-kerne.mjs umziehen | pruefen <Stand> | aus <Stand> <Ordner>');
  process.exit(2);
}
