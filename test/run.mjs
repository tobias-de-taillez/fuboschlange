import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../raumaufmass.html', import.meta.url),'utf8');
const pick=id=>{
  const m=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`));
  if(!m) throw new Error(`Script-Block "${id}" nicht gefunden`);
  return m[1];
};
// imu gehört dazu, seit die Checks die Laufmessung prüfen — ohne den Block
// wirft der allererste Check mit "IMU is undefined", und keiner der übrigen
// läuft. Der Block braucht kein DOM: alles, was ihn anfassen würde, hängt an
// Event-Handlern, die hier nie feuern.
new Function('"use strict";\n'+pick('vendor')+'\n'+pick('core')+'\n'+pick('tiles')+'\n'+pick('store')
            +'\n'+pick('imu')+'\n'+pick('checks'))();
const r=globalThis.selfChecks();
console.log(r.out.join('\n'));
console.log(r.ok?'\nALLE CHECKS GRÜN':'\nCHECKS ROT');
process.exit(r.ok?0:1);
