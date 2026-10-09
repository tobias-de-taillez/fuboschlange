import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html = readFileSync(new URL('../raumaufmass_astra.html', import.meta.url), 'utf8');
const scripts = new Map([...html.matchAll(/<script id="([^"]+)">([\s\S]*?)<\/script>/g)]
  .map(match => [match[1], match[2]]));
const tileUi = scripts.get('tiles-ui'), ui = scripts.get('ui');
const between = (source, start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Production source boundaries exist: ${start}`);
  return source.slice(a, b);
};
new Function(scripts.get('tiles'))();
const TL = globalThis.TILES;

// Actual geometry, evaluation, nesting, settings handler and report renderer;
// only the DOM, persistence and canvas boundary are replaced here.
function harness() {
  const nodes = new Map();
  const $ = id => {
    if (!nodes.has(id)) nodes.set(id, {
      innerHTML: '', textContent: '', hidden: false, disabled: false, checked: false,
      addEventListener(type, handler) { this[type] = handler; },
    });
    return nodes.get(id);
  };
  const ring = [{x:0,y:0},{x:4000,y:0},{x:4000,y:1000},{x:0,y:1000}];
  ring.holes = [];
  const K = {lay:ring};
  const T = {spec:{...TL.TILE_DEF,w:200,l:1000,angle:90,sameColor:0},joints:[],wallJoints:[],items:[
    {id:1,kind:'L',x:500,y:200,rot:0},
    {id:2,kind:'L',x:1600,y:200,rot:0},
    {id:3,kind:'R',x:2700,y:200,rot:0},
    {id:4,kind:'L',x:-700,y:500,rot:0},
    {id:5,kind:'L',x:-700,y:750,rot:0},
    {id:6,kind:'R',x:3700,y:500,rot:0},
    {id:7,kind:'L',x:1600,y:600,rot:0,cuts:[{p:{x:300,y:0},n:{x:-1,y:0}}]},
  ]};
  const TS = {sel:new Set(),cacheKey:'',cache:null,jointKey:JSON.stringify([[],[]])};
  const messages = [];
  const make = new Function('deps', `
    const {TL,T,K,TS,$,messages}=deps;
    const M={mode:'tiles'},currentRoom=null,currentRoomName='Fixture';let lastSaveOk=true;
    const document={activeElement:null,body:{classList:{toggle(){}}}};
    const tilesData=()=>T,tilesCtx=()=>K,selItems=()=>[],gapCache={val:null};
    const fmt2=v=>v.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
    const fmtMm=v=>Math.round(v).toLocaleString('de-DE'),escapeHtml=String;
    const setHint=message=>messages.push(message),snapshot=()=>{},render=()=>renderTilesPanel();
    ${between(tileUi, 'function tilesSave(){', '\n// Schnittnummern')}
    ${between(tileUi, 'const cutKey=', '\n// ---------- Zeichnen ----------')}
    ${between(tileUi, 'const SPEC_FIELDS=', '\nSPEC_FIELDS.forEach')}
    ${between(tileUi, 'function renderTilesPanel(){', '\n// ---------- Druck ----------')}
    ${between(tileUi, 'function prepareTileReport(){', '\nfunction tilesPrintHtml(){')}
    return {prepareTileReport,renderTilesPanel,tilesEval,frozenNo,cutKey};
  `);
  return {...make({TL,T,K,TS,$,messages}), $,K,T,TS,messages};
}

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`PASS ${name}`);
}

test('report computation nests actual cuts and freezes the same cut numbers used by the plan', () => {
  const h = harness(), r = h.prepareTileReport();
  assert.equal(r.s.placed, 7);
  assert.equal(r.s.pieces, 4);
  assert.equal(r.ev.cuts.find(c => c.item.id === 7).maySwap, false, 'Interior cut with different glaze stays with its kind');
  assert(r.ev.cuts.filter(c => c.item.id !== 7).every(c => c.maySwap), 'Wall cuts may change kind');
  assert(r.ev.nest.stocks.length < r.ev.cuts.length, 'Nearby 300 mm cuts share actual raw stock');
  assert.equal(h.TS.nestSnap.key, h.TS.cacheKey);
  assert.equal(h.TS.nestSnap.nest, r.ev.nest);
  assert.deepEqual([...h.TS.nestSnap.nums.values()].sort(), [1,2,3,4]);
  for (const c of r.ev.cuts) assert.equal(h.frozenNo(c), c.no);
  assert.deepEqual(h.TS.nestSnap.swap,
    new Set(r.ev.cuts.filter(c => r.ev.markSwap.has(c.no)).map(h.cutKey)));
});

test('printing preparation reuses the current report and numbering until its geometry changes', () => {
  const h = harness(), first = h.prepareTileReport(), snapshot = h.TS.nestSnap;
  const again = h.prepareTileReport();
  assert.equal(again.ev, first.ev, 'An unchanged plan must keep its evaluation cache');
  assert.equal(again.ev.nest, first.ev.nest, 'Report and print share the exact cutting layout');
  assert.equal(h.TS.nestSnap, snapshot, 'Preparing print must not replace the preview numbering');
  h.T.items[0].x += 100;
  const changed = h.prepareTileReport();
  assert.notEqual(changed.ev, first.ev);
  assert.notEqual(changed.ev.nest, first.ev.nest);
  assert.notEqual(h.TS.nestSnap, snapshot);
  assert.equal(h.TS.nestSnap.key, h.TS.cacheKey);
});

test('changed geometry suppresses stale purchase amounts while preserving previous cut numbers', () => {
  const h = harness(), r = h.prepareTileReport();
  h.renderTilesPanel();
  assert.match(h.$('tPurchase').innerHTML, /purchase-total/);
  assert.equal(h.$('tCalculate').disabled, true);
  const oldKey = h.TS.nestSnap.key, oldNo = h.frozenNo(r.ev.cuts[0]);
  h.T.items.push({id:8,kind:'R',x:500,y:500,rot:0});
  h.renderTilesPanel();
  assert.notEqual(h.TS.cacheKey, oldKey);
  assert.match(h.$('tPurchase').innerHTML, /purchase-pending/);
  assert.doesNotMatch(h.$('tPurchase').innerHTML, /purchase-total/);
  assert.match(h.$('tCalcState').textContent, /veraltet/);
  assert.equal(h.$('tCalculate').disabled, false);
  assert.equal(h.frozenNo(r.ev.cuts[0]), oldNo);
  const shoppingRows = h.$('tStats').innerHTML.match(/<tr[^>]*>[\s\S]*?<\/tr>/g)
    .filter(row => /Bedarf mit|Einkauf ·|Davon übrig/.test(row));
  assert.equal(shoppingRows.length, 3);
  for (const row of shoppingRows) assert.equal((row.match(/class="tmut"/g) || []).length, 3);
});

test('same-color setting invalidates report, then allows all cut pieces to swap without orange marks', () => {
  const h = harness();
  h.prepareTileReport();
  const key = h.TS.nestSnap.key;
  h.$('tSame').checked = true;
  h.$('tSame').change();
  assert.equal(h.T.spec.sameColor, 1);
  assert.notEqual(h.TS.cacheKey, key);
  assert.equal(h.$('tCalculate').disabled, false);
  assert.match(h.$('tPurchase').innerHTML, /purchase-pending/);
  const r = h.prepareTileReport();
  assert(r.ev.cuts.every(c => c.maySwap));
  assert.equal(r.ev.markSwap.size, 0);
  assert.equal(h.TS.nestSnap.swap.size, 0);
  h.renderTilesPanel();
  assert.equal(h.$('tCalculate').disabled, true);
});

test('mixed purchase includes equal L/R surplus, whereas waste uses only consumed raw tiles', () => {
  const h = harness();
  h.prepareTileReport();
  const ev = h.tilesEval(h.K);
  // Deliberately asymmetric, independently hand-computable report state:
  // 3 whole L + 1 L raw, 2 whole R + 1 R raw => need 7, purchase 8.
  ev.stats = {L:{whole:3,cut:2},R:{whole:2,cut:2},placed:9,pieces:4,
    covered:1_000_000,roomArea:1_200_000,waste:1-1/1.8,out:0,overlaps:0};
  h.TS.nestSnap.nest = {stocks:[{kind:'L'},{kind:'R'}],kerf:30,near:1500,swapped:0};
  h.renderTilesPanel();
  assert.match(h.$('tPurchase').innerHTML, /1,60 <small>m²<\/small>/);
  assert.match(h.$('tPurchase').innerHTML, /8 Fliesen · 4 L \+ 4 R/);
  assert.match(h.$('tStats').innerHTML, /Bedarf mit Resteverwendung<\/th><td>4<\/td><td>3<\/td><td>7<\/td>/);
  assert.match(h.$('tStats').innerHTML, /Davon übrig<\/th><td>0<\/td><td>1<\/td><td>1<\/td>/);
  assert.match(h.$('tAreas').innerHTML, /Verschnitt mit Resteverwendung<\/dt><dd>28,57 %/);
  assert.doesNotMatch(h.$('tAreas').innerHTML, /37,50 %/);
});

test('empty placement cannot generate a report or reuse a previous snapshot', () => {
  const h = harness();
  h.T.items = [];
  assert.equal(h.prepareTileReport(), null);
  assert.equal(h.TS.nestSnap, undefined);
  assert.match(h.messages[0], /Noch keine Fliesen/);
  h.renderTilesPanel();
  assert.equal(h.$('tCalculate').disabled, true);
  assert.equal(h.$('tPrint').disabled, true);
  assert.equal(h.$('tReport').disabled, true);
});

test('open report protects plan shortcuts even when disabling Calculate sends focus to body', () => {
  const code = between(ui, "// Die Hotkeys sind auf window gebunden", "\naddEventListener('resize'");
  const handlers = [];
  new Function('document','addEventListener', code)(
    {querySelector: selector => selector === 'dialog[open]' ? {} : null},
    (_, handler) => handlers.push(handler));
  assert.equal(handlers.length, 1);
  // Any action reaching the absent plan dependencies would throw. A modal
  // must stop all of them even though event.target itself is outside it.
  for (const key of ['1','2','Delete','Escape','z']) {
    handlers[0]({key,ctrlKey:key === 'z',target:{tagName:'BODY'}});
  }
});

console.log(`\n${passed} report checks passed.`);
