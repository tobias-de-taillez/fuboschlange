import {readFileSync} from 'node:fs';

const lies=f=>readFileSync(new URL('../'+f, import.meta.url),'utf8');
const html=lies('raumaufmass.html');
const pick=id=>{
  const m=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`));
  if(!m) throw new Error(`Script-Block "${id}" nicht gefunden`);
  return m[1];
};
// imu gehört dazu, seit die Checks die Laufmessung prüfen — ohne den Block
// wirft der allererste Check mit "IMU is undefined", und keiner der übrigen
// läuft. Der Block braucht kein DOM: alles, was ihn anfassen würde, hängt an
// Event-Handlern, die hier nie feuern.
// Rechenkern, Geometrie und Speicher liegen seit der Aufteilung in die
// Werkzeugfamilie (docs/adr/0001) in geteilten Dateien neben der HTML-Datei;
// Fliesen, Küche, Laufmessung und die Checks selbst stehen noch als Blöcke
// darin. Die Reihenfolge ist die der <script>-Tags im Browser.
new Function('"use strict";\n'+lies('raum-fremd.js')+'\n'+lies('raum-kern.js')+'\n'+pick('tiles')+'\n'+pick('kitchen')
            +'\n'+lies('raum-geometrie.js')+'\n'+lies('raum-speicher.js')
            +'\n'+pick('imu')+'\n'+pick('checks'))();
const r=globalThis.selfChecks();
console.log(r.out.join('\n'));
console.log(r.ok?'\nALLE CHECKS GRÜN':'\nCHECKS ROT');
process.exit(r.ok?0:1);
