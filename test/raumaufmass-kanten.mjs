// Kante einer angeschnittenen Fliese herausziehen: ein frueherer, verdeckter
// Schnitt darf sie nicht aufhalten.
import {readFileSync, existsSync} from 'node:fs';
const file=['raumaufmass.html','raumaufmass_opus.html'].find(f=>existsSync(new URL('../'+f, import.meta.url)));
const h=readFileSync(new URL('../'+file, import.meta.url),'utf8');
const pick=id=>h.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))[1];
new Function(pick('core')+'\n'+pick('tiles'))(); const T=globalThis.TILES;
const b={w:150,l:850,angle:45,joint:2,edgeGap:10,expWidth:8,sameColor:0,thick:10}, S={...b,set:[{id:'legacy',name:'C',shape:'chevron',...b}]};
let ok=true; const chk=(n,c,i='')=>{ ok=ok&&!!c; console.log((c?'ok   ':'ROT  ')+n+(i!==''?'  ('+i+')':'')); };
const it={id:1,kind:'L',x:0,y:0,rot:0,cuts:[{p:{x:500,y:0},n:{x:-1,y:0}},{p:{x:300,y:0},n:{x:-1,y:0}}]};
const Q=T.tileCorners(S,it), e=Q.map((a,i)=>[a,Q[(i+1)%Q.length]]).find(([a,c])=>Math.abs(a.x-300)<1e-6&&Math.abs(c.x-300)<1e-6);
const xmax=r=>Math.max(...T.tileCorners(S,r.item).map(p=>p.x));
chk('verdeckter Schnitt haelt die Kante nicht auf', Math.abs(xmax(T.moveTileEdge(S,it,e[0],e[1],400))-700)<1e-6, xmax(T.moveTileEdge(S,it,e[0],e[1],400)));
const fin=T.moveTileEdge(S,it,e[0],e[1],5000);
chk('bis zur Grundfliese, dann Maximum', fin.atMax && !(fin.item.cuts||[]).length);
chk('nach innen weiter moeglich', Math.abs(xmax(T.moveTileEdge(S,it,e[0],e[1],-100))-200)<1e-6);
console.log(ok?'\nALLE CHECKS GRÜN':'\nCHECKS ROT'); process.exit(ok?0:1);
