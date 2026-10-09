import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
const html=readFileSync(new URL('../raumaufmass_opus.html',import.meta.url),'utf8');
const pick=id=>html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))[1];
for(const m of html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g))new Function(m[1]);
new Function(pick('vendor')+pick('core')+pick('tiles')+pick('store')+pick('imu')+pick('checks'))();
assert(selfChecks().ok,'Existing self-checks');
const T=globalThis.TILES;
const legacy=T.normTiles({spec:{w:150,l:850,thick:12},items:[{id:1,kind:'R',x:0,y:0,rot:0}]});
assert.equal(legacy.spec.set[0].thick,12);assert.equal(legacy.items.length,1);
const defs=['hexagon','chevron','rectangle','triangle'].map((shape,i)=>({id:'tile-'+i,shape,name:shape,w:300,l:400,angle:45,thick:8+i*2}));
const room=T.normTiles({spec:{set:defs},items:defs.flatMap((d,i)=>T.tileKinds(d).map((kind,j)=>({id:10+i*2+j,kind,x:i*1000+j*450,y:0,rot:0})))});
assert.equal(room.items.length,5);
assert.deepEqual(room.items.map(it=>T.tileShape(room.spec,it.kind).length),[6,4,4,4,3]);
assert.deepEqual(room.items.map(it=>T.tileStatus(room.spec,it,null,[]).status),Array(5).fill('whole'));
assert(Math.abs(T.tileArea(room.spec,'tile-0')-60000*Math.sqrt(3))<1e-8);assert(Math.abs(T.tileArea(room.spec,'tile-3')-40000*Math.sqrt(3))<1e-8);
const stats=T.tileStats(room.spec,room.items,null,[]);assert.equal(stats.placed,5);assert(Math.abs(stats.tileArea-(360000+100000*Math.sqrt(3)))<1e-8);
const restored=T.normTiles(JSON.parse(JSON.stringify(room)));assert.deepEqual(restored,room);
assert.equal(T.normTiles({spec:{set:[]}}).spec.set.length,0);
for(const it of room.items){
 const shape=T.tileShape(room.spec,it.kind), dims=T.pieceDims(room.spec,it.kind,shape,[]);
 assert(dims.edges.every(e=>!e.cut));
 const cut=T.cutList(room.spec,[{...it,cuts:[{p:{x:200,y:0},n:{x:-1,y:0}}]}],null,[]);
 assert(cut.length);const nest=T.nestCuts(room.spec,cut);assert.equal(nest.stocks[0].kind,it.kind);
 assert(T.cutPlan(room.spec,it.kind,nest.stocks[0].pieces).ok);
}
const rect=defs[2], spec={...room.spec,set:[rect,{...rect,id:'tile-thin',thick:4}]};
const grout=T.groutAmount(spec,[{kind:rect.id,x:0,y:0,rot:0},{kind:'tile-thin',x:402,y:0,rot:0}]);
assert(Math.abs(grout.litre-300*2*4/1e6)<1e-8);
// Exercise actual set/palette event handlers in a DOM harness, independent of room solving.
class El{constructor(){this.children=[];this.value='';this.listeners={};}replaceChildren(){this.children=[];}append(x){this.children.push(x);}setAttribute(k,v){this[k]=v;}addEventListener(k,v){this.listeners[k]=v;}closest(){return this;}querySelector(){return this;} }
const elements=new Map(), $=id=>{if(!elements.has(id))elements.set(id,new El());return elements.get(id);};
let saved=0;const context=createContext({TL:T,tilesData:()=>room,currentRoom:'room-a',$,document:{activeElement:null,createElement:()=>new El()},escapeHtml:s=>s,snapshot(){},tilesSave(){saved++;},bindTilePalette(b,kind){b.kind=kind;},tilesAddPair(){},renderTilesPanel(){},Date});
const ui=pick('tiles-ui'), start=ui.indexOf('let activeTileId=null'), end=ui.indexOf('const SPEC_FIELDS=',start);
runInContext(ui.slice(start,end)+'\nrenderTileSet();',context);
assert.equal($('tPalette').children.length,6);assert.equal($('tSetList').children.length,4);
$('tNewShape').value='triangle';$('tSetAdd').onclick();assert.equal(room.spec.set.length,5);assert.equal(saved,1);
runInContext('renderTileSet();',context);$('tName').value='Kleine Dreiecke';$('tName').onchange();assert.equal(room.spec.set.at(-1).name,'Kleine Dreiecke');
assert.equal($('tSetList').children[0].children[1].disabled,true,'Used variant cannot be deleted');
console.log('495 self-checks and mixed tile geometry, persistence, recycling, thickness and palette checks passed.');
// Generate the real print document for cut pieces of all four forms.
const ring=[{x:-1000,y:-1000,id:'A'},{x:8000,y:-1000,id:'B'},{x:8000,y:3000,id:'C'},{x:-1000,y:3000,id:'D'}];ring.holes=[];
const printRoom=T.normTiles(JSON.parse(JSON.stringify(room)));
printRoom.items=printRoom.items.map(it=>({...it,cuts:[{p:{x:200,y:0},n:{x:-1,y:0}}]}));
const els=new Map(),get=id=>{if(!els.has(id)){const e=new El();e.classList={toggle(){}};e.replaceChildren=()=>{e.children=[];};els.set(id,e);}return els.get(id);};
const printCtx=createContext({console,globalThis:{TILES:T},M:{tiles:printRoom,mode:'tiles'},document:{activeElement:null,body:{classList:{toggle(){}}},createElement:()=>new El()},$:get,currentRoom:'test-room',currentRoomName:'Test',render(){},snapshot(){},setHint(){},plat:s=>s,fmt2:n=>n.toFixed(2),f1:n=>n.toFixed(1),escapeHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;'),setTimeout,clearTimeout});
runInContext(pick('tiles-ui'),printCtx);
printCtx.K={ring,lay:ring,layCut:ring};
runInContext('tilesCtx=()=>K; renderTileSet(); globalThis.result=tilesPrintHtml();',printCtx);
assert(printCtx.globalThis.result.includes('triangle'));
assert(!printCtx.globalThis.result.includes('undefined'));
assert(!printCtx.globalThis.result.includes('NaN'));
console.log('Mixed-format print document generated without undefined or NaN.');

// The hexagon stays regular even for previously saved independent dimensions.
for(const width of [50,300,850]){
 const d={...defs[0],l:width,w:width}, spec={set:[d]};
 const P=T.tileShape(spec,d.id), edges=T.edgesOf(P).map(e=>Math.hypot(e.b.x-e.a.x,e.b.y-e.a.y));
 assert(edges.every(n=>Math.abs(n-width/2)<1e-8));
 const normalized=T.normTiles({spec}).spec.set[0];
 assert.equal(normalized.w,width*Math.sqrt(3)/2);
}
// Changing either dimension updates its partner through the actual UI handler.
runInContext("activeTileId='tile-0'; tilesSave=()=>{};",printCtx);
get('tL').value='600';get('tL').listeners.change();
assert.equal(printRoom.spec.set[0].w,300*Math.sqrt(3));
get('tW').value='300';get('tW').listeners.change();
assert(Math.abs(printRoom.spec.set[0].l-600/Math.sqrt(3))<1e-8);
console.log('Regular hexagon edge lengths, saved-data correction and coupled dimensions passed.');

// Equilateral triangles remain regular in old files and after either dimension is edited.
for(const width of [50,300,850]){
 const d={...defs[3],l:width,w:width}, spec={set:[d]};
 const P=T.tileShape(spec,d.id), edges=T.edgesOf(P).map(e=>Math.hypot(e.b.x-e.a.x,e.b.y-e.a.y));
 assert(edges.every(n=>Math.abs(n-width)<1e-8));
 assert.equal(T.normTiles({spec}).spec.set[0].w,width*Math.sqrt(3)/2);
}
runInContext("activeTileId='tile-3';",printCtx);
get('tL').value='600';get('tL').listeners.change();
assert.equal(printRoom.spec.set.find(d=>d.id==='tile-3').w,300*Math.sqrt(3));
get('tW').value='300';get('tW').listeners.change();
assert(Math.abs(printRoom.spec.set.find(d=>d.id==='tile-3').l-600/Math.sqrt(3))<1e-8);
console.log('Equilateral triangle edge lengths, saved-data correction and coupled dimensions passed.');
