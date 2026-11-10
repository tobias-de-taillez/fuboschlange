import {readFileSync} from 'node:fs';

const lies=f=>readFileSync(new URL('../'+f, import.meta.url),'utf8');
// Rechenkern, Fliesen-Geometrie, Küchen-Kern, Geometrie, Speicher und die
// Checks selbst liegen als geteilte Dateien neben der HTML-Datei (docs/adr/0001).
// Die Reihenfolge ist die der <script>-Tags im Browser.
new Function('"use strict";\n'+lies('raum-fremd.js')+'\n'+lies('raum-kern.js')+'\n'+lies('raum-fliesen.js')+'\n'+lies('raum-kueche.js')
            +'\n'+lies('raum-geometrie.js')+'\n'+lies('raum-speicher.js')
            +'\n'+lies('raum-checks.js'))();
const r=globalThis.selfChecks();
console.log(r.out.join('\n'));
console.log(r.ok?'\nALLE CHECKS GRÜN':'\nCHECKS ROT');
process.exit(r.ok?0:1);
