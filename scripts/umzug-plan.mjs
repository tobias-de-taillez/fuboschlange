#!/usr/bin/env node
// Beweis zum Umzug des Plan-Anteils aus dem Block "ui" von raumaufmass.html nach raum-plan.js
// (docs/adr/0001-familie-mit-geteilten-js-dateien.md, Plan docs/superpowers/plans/2026-11-10-familie-schritt-3.md).
// Der Umzug selbst lief mit einem Skript, das die Anweisungen von ui mit acorn zerlegt, den Plan-Anteil als
// Rückwärtshülle der Anmeldung und der Seitenfunktionen bestimmt und wörtlich verschiebt (Kommentar und Anweisung
// zusammen). Dieses Skript braucht kein acorn und beweist das Ergebnis:
//
//   node scripts/umzug-plan.mjs pruefen <Stand vor dem Umzug>     z. B. Tag vor-plan (Commit a0c2d38)
//
// Gezählt wird je Zeile, ohne Einrückung: jede Zeile des alten Blocks "ui" steht im Ergebnis genau einmal,
// entweder im neuen Block "ui" oder in raum-plan.js. Hinzugekommen sein dürfen nur die Kopfzeilen von
// raum-plan.js, der Rumpf der Funktion starteSeite und deren Aufruf am Ende von ui; verschwinden darf nichts.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const WURZEL=new URL('..', import.meta.url);
const lies=f=>readFileSync(new URL(f, WURZEL),'utf8');
const ausGit=(stand, f)=>execFileSync('git',['show', stand+':'+f],{cwd:WURZEL, encoding:'utf8', maxBuffer:1<<28});
const block=(html, id)=>{ const m=html.match(new RegExp(`<script id="${id}">\\n([\\s\\S]*?)</script>`)); if(!m) throw new Error(`Block "${id}" fehlt`); return m[1]; };
const zeilen=t=>t.split('\n').map(z=>z.trim()).filter(z=>z!=='');
const zaehle=l=>{ const m=new Map(); for(const z of l) m.set(z,(m.get(z)||0)+1); return m; };

const [, , modus, stand]=process.argv;
if(modus!=='pruefen' || !stand){ console.error('Aufruf: node scripts/umzug-plan.mjs pruefen <Stand vor dem Umzug>'); process.exit(2); }
const alt=zeilen(block(ausGit(stand,'raumaufmass.html'),'ui'));
const neuUi=zeilen(block(lies('raumaufmass.html'),'ui'));
const plan=zeilen(lies('raum-plan.js'));
const erwartetZuviel=new Set(['"use strict";','function starteSeite(){','}','starteSeite();']);   // Rahmen, nicht Inhalt
const rest=zaehle(alt);
const zuViel=[];
for(const z of [...neuUi, ...plan]){
  const n=rest.get(z)||0;
  if(n>0) rest.set(z,n-1); else zuViel.push(z);
}
const fehlt=[...rest].filter(([,n])=>n>0).flatMap(([z,n])=>Array(n).fill(z));
const fremd=zuViel.filter(z=>!erwartetZuviel.has(z) && !z.startsWith('//'));
const kopfKommentar=zuViel.filter(z=>z.startsWith('//')).length;
console.log(`alt: ${alt.length} Zeilen in ui | neu: ${neuUi.length} in ui + ${plan.length} in raum-plan.js`);
console.log(`ohne Gegenstück im alten ui: ${zuViel.length} Zeilen (davon Kopfkommentar ${kopfKommentar}, Rahmen ${zuViel.length-fremd.length-kopfKommentar})`);
if(fehlt.length) console.log(`VERSCHWUNDEN (${fehlt.length}):\n  `+fehlt.slice(0,20).join('\n  '));
if(fremd.length) console.log(`NEU, nicht im alten ui (${fremd.length}):\n  `+fremd.slice(0,20).join('\n  '));
const g=!fehlt.length && !fremd.length;
console.log(g ? 'ok   jede Zeile des alten ui steht genau einmal im neuen ui oder in raum-plan.js' : 'anders: siehe oben');
process.exit(g ? 0 : 1);
