import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../raumaufmass.html', import.meta.url),'utf8');
const pick=id=>{
  const m=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`));
  if(!m) throw new Error(`Script-Block "${id}" nicht gefunden`);
  return m[1];
};
new Function('"use strict";\n'+pick('vendor')+'\n'+pick('core')+'\n'+pick('checks'))();
const r=globalThis.selfChecks();
console.log(r.out.join('\n'));
console.log(r.ok?'\nALLE CHECKS GRÜN':'\nCHECKS ROT');
process.exit(r.ok?0:1);
