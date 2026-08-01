// Node-Läufer für verlegeplan.html.
//
// Die Datei ist self-contained und fasst am Ende das DOM an. Statt sie dafür in
// Skriptblöcke zu zerlegen, wird hier ein winziges DOM gestellt und der
// Boot-Aufruf abgeschnitten - der Mathe-Kern läuft dann unverändert.
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../verlegeplan.html',import.meta.url),'utf8');
const m=html.match(/<script>\n([\s\S]*?)<\/script>/);
if(!m) throw new Error('Skriptblock nicht gefunden');
// Alles ab dem Boot (selfChecks/initUI/recompute) abschneiden: initUI braucht
// echte Eingabefelder, und die will dieser Läufer nicht nachbauen.
const src=m[1].replace(/\nselfChecks\(\);[\s\S]*$/,'\n');

const el=()=>({value:'',textContent:'',innerHTML:'',checked:false,min:'',max:'',
  style:{},dataset:{},classList:{add(){},remove(){},toggle(){}},
  addEventListener(){},querySelectorAll:()=>[],closest:()=>el(),click(){}});
globalThis.document={getElementById:()=>el(),querySelectorAll:()=>[],
  createElement:()=>({getContext:()=>null,width:0,height:0,toDataURL:()=>''})};
globalThis.window=globalThis;

const api=new Function('"use strict";\n'+src+'\nreturn {selfChecks,crossingBench,autofit,S};')();

const ok=api.selfChecks();
// Der Bench ist kein Tor: Anbindeleitungen sind bewusst noch nicht
// kreuzungsfrei (siehe Plan). Er wird gemessen und gemeldet, nicht bewertet.
const bench=api.crossingBench(40);
console.log(`\nKreuzungs-Bench: ${bench.length} von 40 Sets mit Befund`);
if(bench.length) console.log('  erster Befund:',JSON.stringify(bench[0]));
console.log(ok?'\nALLE CHECKS GRÜN':'\nCHECKS ROT');
process.exit(ok?0:1);
