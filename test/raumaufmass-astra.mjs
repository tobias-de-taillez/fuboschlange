import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const source = new URL('../raumaufmass_astra.html', import.meta.url);
const html = readFileSync(source, 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
const scriptById = new Map();

for (const [index, match] of scripts.entries()) {
  const id = match[1].match(/\sid\s*=\s*(["'])(.*?)\1/i)?.[2];
  if (id) {
    assert(!scriptById.has(id), `Doppelte Script-ID: ${id}`);
    scriptById.set(id, match[2]);
  }
  new Script(match[2], {filename: `${source.pathname}#${id || index + 1}`});
}

// Only inspect actual static markup. Script templates can intentionally repeat
// IDs in separate generated documents and are not part of this document's DOM.
const markup = html.replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
const ids = [...markup.matchAll(/<[^>]+\sid\s*=\s*(["'])(.*?)\1[^>]*>/g)]
  .map(match => match[2]);
const allIds = ids.concat([...scriptById.keys()]);
assert.equal(new Set(allIds).size, allIds.length,
  `Doppelte DOM-IDs: ${allIds.filter((id, i) => allIds.indexOf(id) !== i).join(', ')}`);
console.log(`HTML: ${ids.length} eindeutige DOM-IDs; ${scripts.length} Script-Blöcke syntaktisch gültig.`);

// Preserve the same execution order and complete self-check suite as run.mjs.
// IMU is required by the walking-measurement checks but does not need a DOM
// unless its browser event handlers are invoked.
const order = ['vendor', 'core', 'tiles', 'store', 'imu', 'checks'];
for (const id of order) assert(scriptById.has(id), `Script-Block "${id}" nicht gefunden`);
new Function('"use strict";\n' + order.map(id => scriptById.get(id)).join('\n'))();
const result = globalThis.selfChecks();
console.log(result.out.join('\n'));
console.log(`\n${result.out.filter(line => line.startsWith('PASS ')).length} bestanden; ${result.out.filter(line => line.startsWith('FAIL ')).length} fehlgeschlagen.`);

// Exercise production UI helpers with a minimal DOM boundary. These checks
// cover state transitions; canvas rendering, focus, and layout still need a
// real browser. No copy of the app's implementation is executed here.
const ui = scriptById.get('ui');
const tileUi = scriptById.get('tiles-ui');
const between = (sourceText, start, end) => {
  const a = sourceText.indexOf(start);
  const b = sourceText.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `UI-Testgrenze fehlt: ${start}`);
  return sourceText.slice(a, b);
};
const element = () => {
  const classes = new Set();
  const e = {
    textContent: '', hidden: false, value: '', dataset: {}, style: {}, buttons: [], heading: {},
    options: [{}, {}, {}, {}],
    classList: {
      toggle(name, force) { if (force) classes.add(name); else classes.delete(name); },
      add(name) { classes.add(name); },
      contains(name) { return classes.has(name); },
    },
    querySelector(selector) { return selector === 'h3' ? this.heading : this.details; },
    querySelectorAll() { return this.buttons; },
  };
  Object.defineProperty(e, 'innerHTML', {
    get() { return this.markup || ''; },
    set(value) {
      this.markup = value;
      this.buttons = [...value.matchAll(/<button\b([^>]*)>/g)].map(match => ({
        setAttribute(name, value) { this[name] = value; },
        dataset: Object.fromEntries([...match[1].matchAll(/data-([\w-]+)="([^"]*)"/g)]
          .map(attr => [attr[1], attr[2]])),
      }));
      this.details = value.includes('<details') ? {open: /<details[^>]*\sopen/.test(value)} : null;
    },
  });
  return e;
};
const dom = () => {
  const nodes = new Map();
  return id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
};
{
  const $ = dom(), calls = [];
  const M = {mode: 'draw', an: null, walls: [['A', 'B']], meas: [], suspects: new Set(), narrow: [], sugg: []};
  const make = new Function('deps', `
    const {M,$,C,UI_VIEW,enterMeasurement}=deps;
    const drawCanvas=()=>{}, setMode=mode=>{M.mode=mode;};
    let entryPair=null,wpopPair=null;
    ${between(ui, 'function renderNextMeasurement(){', '\nfunction syncWorkspace(){')}
    return renderNextMeasurement;`);
  const renderNext = make({M, $, C: globalThis.CORE, UI_VIEW: {}, enterMeasurement: (...args) => calls.push(args)});
  renderNext();
  $('sugg').buttons[0].onclick();
  assert.deepEqual(calls.pop(), ['A', 'B', true]);
  assert.equal(M.mode, 'measure');

  M.an = {dof: 0};
  M.narrow = [{a: 'C', b: 'D'}];
  renderNext();
  $('sugg').buttons[0].onclick();
  assert.deepEqual(calls.pop(), ['C', 'D', false], 'Fehlereingrenzung darf keinen normalen Messablauf starten');
  assert.equal($('nextTitle').textContent, 'Kontrollmessung');

  M.narrow = [];
  M.meas = [{a: 'X', b: 'Y', on: false}, {a: 'E', b: 'F'}];
  M.suspects = new Set([0]);
  renderNext();
  $('sugg').buttons[0].onclick();
  assert.deepEqual(calls.pop(), ['E', 'F', false], 'Verdächtiger Index muss sich auf aktive Werte beziehen');

  M.suspects.clear();
  M.sugg = [{a: 'A', b: 'C'}, {a: 'B', b: 'D', repeat: true}];
  renderNext();
  $('sugg').buttons[1].onclick();
  assert.deepEqual(calls.pop(), ['B', 'D', false], 'Auch alternative Wiederholungen müssen ungeführt bleiben');
  console.log('PASS UI: erste Messung, Wiederholung und verdächtige aktive Messung korrekt geführt');
}

{
  const $ = dom(), messages = [];
  const M = {meas: [], sugg: []};
  $('entryVal').value = '4.25';
  const make = new Function('deps', `
    const {M,$,C,setHint,statusText}=deps;
    let entryPair={a:'A',b:'B'},entryGuided=true;
    const parseLen=Number,zuKurzFrage=()=>true,snapshot=()=>{},recompute=()=>{};
    const closeEntry=()=>{entryPair=null;entryGuided=false;};
    const enterMeasurement=()=>{throw new Error('Unerwartete Fortschaltung');};
    ${between(ui, 'function commitEntry(){', "\n$('entryOk').onclick")}
    return commitEntry;`);
  make({M, $, C: globalThis.CORE, setHint: text => messages.push(text),
    statusText: () => ['Messwerte weiterhin widersprüchlich.', 'bad']})();
  assert.equal(M.meas.length, 1);
  assert.equal(messages.pop(), 'Messwerte weiterhin widersprüchlich.');
  console.log('PASS UI: geführter Abschluss gibt bei widersprüchlichen Daten keine Entwarnung');
}

{
  const $ = dom(), memory = new Map(), messages = [];
  let failWrites = false;
  const storage = {
    getItem: key => memory.get(key) ?? null,
    setItem(key, value) { if (failWrites) throw new Error('QuotaExceededError'); memory.set(key, value); },
    removeItem: key => memory.delete(key),
  };
  const STORE = globalThis.STORE_FACTORY(storage);
  const room = STORE.create('Original');
  const other = STORE.create('Nachbar');
  STORE.save(room, {data: {marker: 'old'}});
  const latest = {pts: [], walls: [], meas: [], marker: 'latest'};
  const M = {pts: [], walls: [], meas: [], openings: [], opmeas: [], mode: 'draw'};
  const make = new Function('deps', `
    const {M,$,C,STORE,setHint,serialize,room}=deps;
    const document={body:{dataset:{}}},TS={cacheKey:'old'};
    let currentRoom=room,currentRoomName='Original',lastSaveOk=true,entryPair=null;
    const netFails=()=>false,polyAreaM2=()=>null,wallTabReady=()=>false;
    const loadNeighbors=()=>{},querVorschlaege=()=>{},nahWandKandidaten=()=>{};
    const render=()=>syncWorkspace();
    ${between(ui, 'function syncWorkspace(){', "\n$('navigationMode').value")}
    ${between(ui, 'function recompute(){', '\n// ================= Raumbibliothek')}
    ${between(tileUi, 'function tilesSave(){', '\n// Schnittnummern')}
    ${between(ui, 'function saveRoomName(id,name){', '\nasync function renameCurrentRoom(){')}
    return {recompute,tilesSave,saveRoomName,syncWorkspace,state:()=>({lastSaveOk,currentRoomName})};`);
  const helpers = make({M, $, C: globalThis.CORE, STORE, room,
    setHint: text => messages.push(text), serialize: () => JSON.stringify(latest)});

  failWrites = true;
  helpers.recompute();
  assert.equal(helpers.state().lastSaveOk, false);
  assert.equal($('saveState').textContent, 'Nicht gespeichert');
  assert($('saveState').classList.contains('unsaved'));
  assert.equal(STORE.load(room).data.marker, 'old');

  assert.equal(helpers.saveRoomName(room, 'Nicht gespeichert'), false);
  assert.equal(helpers.state().currentRoomName, 'Original');
  failWrites = false;
  assert.equal(helpers.saveRoomName(other, 'Nachbar neu'), true);
  assert.equal(helpers.state().lastSaveOk, false, 'Fremden Raum umbenennen darf aktuelle ungesicherte Änderungen nicht quittieren');
  assert.equal(helpers.saveRoomName(room, 'Gesichert'), true);
  helpers.syncWorkspace();
  assert.equal(STORE.load(room).name, 'Gesichert');
  assert.deepEqual(STORE.load(room).data, latest, 'Aktuelles Umbenennen muss den noch ungesicherten Geometriestand mitnehmen');
  assert.equal($('saveState').textContent, 'Lokal gespeichert');
  assert(!$('saveState').classList.contains('unsaved'));

  failWrites = true;
  helpers.tilesSave();
  assert.equal($('saveState').textContent, 'Nicht gespeichert');
  failWrites = false;
  helpers.tilesSave();
  assert.equal($('saveState').textContent, 'Lokal gespeichert');
  assert(messages.some(message => message.includes('Speichern fehlgeschlagen')));
  console.log('PASS UI: echter Storage-Ausfall, Wiederherstellung, Fliesen-Speichern und atomisches Umbenennen');
}

{
  const $ = dom(), C = globalThis.CORE;
  const sketch = [{id: 'A', x: 0, y: 0}, {id: 'B', x: 3700, y: 250},
    {id: 'C', x: 3900, y: 3400}, {id: 'D', x: 100, y: 3100}];
  const meas = [['A', 'B', 4000], ['B', 'C', 3000], ['C', 'D', 4000],
    ['D', 'A', 3000], ['A', 'C', 5000], ['B', 'D', 5000]]
    .map(([a, b, d]) => ({a, b, d}));
  const M = {pts: sketch, walls: [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A']],
    meas, fit: C.solve(sketch, meas), mode: 'measure', snapfit: false,
    suspects: new Set(), narrow: [], nbchecks: [], ring: [], nahwaende: [], quer: []};
  M.an = C.analyze(M.fit.pts, meas);
  const original = JSON.stringify(sketch);
  const make = new Function('deps', `
    const {M,$,C}=deps;
    const document={querySelector:()=>({})},UI_VIEW={search:'',wallFilter:'walls'};
    const currentRoomName='Test',undoStack=[];let wpopPair=null,entryPair=null;
    const viewPts=()=>M.pts,statusText=()=>['Geprüft','good'],wallTabReady=()=>true;
    const renderWallBar=()=>{},renderOpeningPopup=()=>{},renderOpeningMeasures=()=>{};
    const renderNextMeasurement=()=>{},syncWorkspace=()=>{},drawCanvas=()=>{},openWallPopup=()=>{};
    const fmt2=x=>x.toFixed(2).replace('.',','),fmtLenU=x=>(x/1000).toFixed(3)+' m';
    ${between(ui, 'function renderPanel(){', '\n// ================= Daten')}
    return renderPanel;`);
  make({M, $, C})();
  assert.match($('geo').innerHTML, /12,00 <small>m²<\/small>/);
  assert.match($('wl').innerHTML, /data-a="A" data-b="B"[^]*?class="wlen">4\.000 m<\/span>/);
  assert.equal(JSON.stringify(M.pts), original, 'Zahlen aus dem Fit dürfen die Handskizze nicht verändern');
  console.log('PASS UI: Fläche 12,00 m² und Wand 4,000 m kommen aus dem Fit; abweichende Skizze bleibt erhalten');
}

{
  const cv = {}, menu = {open: true, contains: () => false};
  let handler, capture;
  const code = between(ui, "addEventListener('pointerdown',e=>{\n  let dismissed=false;", "\naddEventListener('keydown',e=>{");
  new Function('document', 'cv', 'addEventListener', code)(
    {querySelectorAll: () => [menu]}, cv,
    (type, fn, useCapture) => { assert.equal(type, 'pointerdown'); handler = fn; capture = useCapture; });
  let prevented = false, stopped = false;
  handler({target: cv, preventDefault: () => { prevented = true; }, stopImmediatePropagation: () => { stopped = true; }});
  assert.equal(capture, true);
  assert.equal(menu.open, false);
  assert(prevented && stopped, 'Menüschließen über dem Plan muss vor Zeichen-Gesten konsumiert werden');
  console.log('PASS UI: Menü-Dismiss auf dem Canvas wird in Capture-Phase konsumiert');
}
console.log(result.ok ? '\nALLE CHECKS GRÜN' : '\nCHECKS ROT');
process.exitCode = result.ok ? 0 : 1;
