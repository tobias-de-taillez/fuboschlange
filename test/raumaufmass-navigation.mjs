import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext, runInContext} from 'node:vm';

// Execute the application's navigation code in a small browser harness. This
// checks actual event handling without copying its gesture or zoom algorithms.
const source = new URL('../raumaufmass_astra.html', import.meta.url);
const html = readFileSync(source, 'utf8');
const ui = html.match(/<script id="ui">([\s\S]*?)<\/script>/)?.[1];
assert(ui, 'UI script block is present');

function section(from, until) {
  const start = ui.indexOf(from);
  assert(start >= 0, `Navigation source start exists: ${from}`);
  const end = ui.indexOf(until, start + from.length);
  assert(end > start, `Navigation source end exists: ${until}`);
  return ui.slice(start, end);
}

function harness() {
  const canvasListeners = new Map();
  const windowListeners = new Map();
  const elements = new Map();
  const calls = new Map();
  const count = name => (...args) => {
    calls.set(name, (calls.get(name) || 0) + 1);
    return args;
  };
  const listen = collection => (name, handler, options) => {
    if (!collection.has(name)) collection.set(name, []);
    collection.get(name).push({handler, capture: options === true || options?.capture});
  };
  const classList = {add() {}, remove() {}, toggle() {}};
  const body = {tagName: 'BODY', isContentEditable: false, closest: () => null, classList};
  const cv = {
    width: 1600, height: 1000, clientWidth: 800, clientHeight: 500, style: {}, classList,
    addEventListener: listen(canvasListeners),
    getBoundingClientRect: () => ({left: 20, top: 40, width: 800, height: 500}),
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => true,
    focus() {}, contains: element => element === cv,
  };
  const context = createContext({
    console, cv,
    document: {body, activeElement: body, querySelector: () => null,
      querySelectorAll: () => [], addEventListener: listen(windowListeners)},
    addEventListener: listen(windowListeners),
    localStorage: {getItem: () => null, setItem() {}},
    devicePixelRatio: 2,
    innerHeight: 900,
    performance: {now: () => 1000},
    setTimeout: () => 1, clearTimeout() {},
    $: id => {
      if (!elements.has(id)) elements.set(id, {hidden: true, style: {}, classList,
        addEventListener() {}, closest: () => null});
      return elements.get(id);
    },
    render: count('render'), drawCanvas: count('drawCanvas'), recompute: count('recompute'),
    tapPointDraw: count('tapPointDraw'), tapPointMeasure: count('tapPointMeasure'),
    tilesTap: count('tilesTap'), tilesUp: count('tilesUp'), tilesMove: count('tilesMove'), tilesSave: count('tilesSave'),
    tilesHover() {}, tilesDown: () => false,
    addPoint: count('addPoint'), setHint() {}, hidePop() {}, showPop() {},
    hit: () => null, nearestWall: () => null, nearestMeas: () => null,
    neighborAt: () => null, serialize: () => '{}', pushSnapshot: count('pushSnapshot'),
    openWallPopup: count('openWallPopup'), closeEntry() {}, closeWallPopup() {},
    createNeighborRoom: count('createNeighborRoom'), renameCurrentRoom: count('renameCurrentRoom'),
    openingAt: () => null, currentShape: () => null, wallOpenings: () => [],
    enterHeight: count('enterHeight'), slideOpening: () => null,
  });
  context.window = context;
  runInContext(`
    let VIEW={s:2,ox:100,oy:200,rot:0.3};
    let WV={s:3,ox:300,oy:400};
    let userView=false, wallUserView=false, wallDrag=null;
    const DPR=()=>devicePixelRatio;
    const M={mode:'draw',pts:[],walls:[],meas:[],openings:[],drag:null,dragMode:null,nearPairs:[],chain:null,sel:[]};
    const TAP_SLOP=8, LONGPRESS_MS=550, SOFT_PX=26;
    let neighbors=[], hoverRoom=null, swim=null, unfoldOn=false;
    let doorPluses=[], ownLabelRect=null, entryPair=null, wpopPair=null;
    const TS={drag:null,ptr:null};
    const toWorld=(x,y)=>({x:(x-VIEW.ox)/VIEW.s,y:(y-VIEW.oy)/VIEW.s});
    const toScr=p=>({x:p.x*VIEW.s+VIEW.ox,y:p.y*VIEW.s+VIEW.oy});
    const wToWall=(x,y)=>({x:(x-WV.ox)/WV.s,y:(WV.oy-y)/WV.s});
  `, context);
  const run = code => runInContext(code, context, {filename: source.pathname});
  run(section('function evDev(e)', '// Ansicht, die eine Punktmenge'));
  run(section('// BEGIN NAVIGATION HELPERS', '// END NAVIGATION HELPERS'));
  run(section('// ================= Gesten =================', '// ================= Tipp-Aktionen ================='));
  run(section('// Mittelklick: kein Auto-Scroll', 'const MODE_HINTS='));
  const read = expression => JSON.parse(JSON.stringify(run(expression)));
  const event = values => ({type: 'pointerup', pointerId: 1, pointerType: 'mouse',
    button: 0, buttons: 1, clientX: 120, clientY: 140, deltaX: 0, deltaY: 0,
    deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
    target: cv, code: '', key: '', repeat: false, defaultPrevented: false, cancelable: true,
    preventDefault() {this.defaultPrevented = true;}, stopPropagation() {},
    stopImmediatePropagation() {}, ...values});
  function dispatch(collection, type, values) {
    const e = event({type, ...values});
    for (const {handler} of [...(collection.get(type) || [])].sort((a,b) => Number(b.capture)-Number(a.capture))) handler(e);
    return e;
  }
  return {run, read, cv, context, calls, event,
    count: name => calls.get(name) || 0,
    canvas: (type, values) => dispatch(canvasListeners, type, values),
    global: (type, values) => dispatch(windowListeners, type, values)};
}

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`PASS ${name}`);
}

function near(actual, expected, message, tolerance = 1e-9) {
  assert(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${message}: expected ${expected}, got ${actual}`);
}

// Navigation contracts are checked below against the current implementation.
test('automatic wheel classification respects physical wheel, trackpad scroll and pinch', () => {
  const h = harness();
  for (const deltaY of [40, 50, 80, 100, 120, 240, -120]) {
    assert.equal(h.run(`wheelAction({deltaMode:0,deltaX:0,deltaY:${deltaY}},'auto')`), 'zoom');
  }
  for (const e of [{deltaX:0,deltaY:2.25}, {deltaX:12,deltaY:35}, {deltaX:9,deltaY:0}]) {
    h.context.wheelSample = {deltaMode: 0, ...e};
    assert.equal(h.run("wheelAction(wheelSample,'auto')"), 'pan');
  }
  assert.equal(h.run("wheelAction({deltaMode:1,deltaX:0,deltaY:3},'auto')"), 'zoom');
  assert.equal(h.run("wheelAction({deltaMode:2,deltaX:0,deltaY:1},'auto')"), 'zoom');
  assert.equal(h.run("wheelAction({deltaMode:0,deltaX:0,deltaY:120,shiftKey:true},'auto')"), 'pan');
  assert.equal(h.run("wheelAction({deltaMode:0,deltaX:0,deltaY:0.7,ctrlKey:true},'trackpad')"), 'zoom');
  assert.equal(h.run("wheelAction({deltaMode:0,deltaX:0,deltaY:120},'trackpad')"), 'pan');
  assert.equal(h.run("wheelAction({deltaMode:0,deltaX:0,deltaY:2},'mouse')"), 'zoom');
});

test('line wheel deltas normalize to pixel units on both axes', () => {
  const h = harness();
  assert.deepEqual(h.read('normalizeWheel({deltaMode:0,deltaX:3.25,deltaY:-7.5})'), {x:3.25,y:-7.5});
  assert.deepEqual(h.read('normalizeWheel({deltaMode:1,deltaX:2,deltaY:-3})'), {x:32,y:-48});
  assert.deepEqual(h.read('normalizeWheel({deltaMode:2,deltaX:1,deltaY:-2})'), {x:500,y:-1000});
});

test('zoom preserves the world point under the cursor, including at both scale bounds', () => {
  const h = harness();
  const anchor = {x:440,y:360};
  const before = h.read('VIEW');
  const world = {x:(anchor.x-before.ox)/before.s,y:(anchor.y-before.oy)/before.s};
  for (const factor of [1.6, 1e100, 1e-100]) {
    h.run(`zoomAt(${anchor.x},${anchor.y},${factor})`);
    const view = h.read('VIEW');
    assert(view.s >= 0.004 && view.s <= 128, 'zoom stays in documented DPR-adjusted bounds');
    near((anchor.x-view.ox)/view.s, world.x, 'cursor world x stays fixed');
    near((anchor.y-view.oy)/view.s, world.y, 'cursor world y stays fixed');
    assert.equal(view.rot, before.rot);
  }
});

test('invalid zoom factors cannot corrupt the view', () => {
  const h = harness();
  const before = h.read('VIEW');
  for (const factor of ['NaN', 'Infinity', '-Infinity', '0', '-1']) {
    h.run(`zoomAt(440,360,${factor})`);
    assert.deepEqual(h.read('VIEW'), before, `invalid factor ${factor} leaves view unchanged`);
  }
});

test('pan and zoom target only the active plan or wall view', () => {
  const h = harness();
  const originalWall = h.read('WV');
  h.run('panView(23,-41)');
  assert.deepEqual(h.read('VIEW'), {s:2,ox:123,oy:159,rot:0.3});
  assert.deepEqual(h.read('WV'), originalWall);
  const originalPlan = h.read('VIEW');
  h.run("M.mode='wall'; panView(-17,29); zoomAt(440,360,2)");
  assert.deepEqual(h.read('VIEW'), originalPlan);
  const wall = h.read('WV');
  assert.equal(wall.s, 6);
  near(wall.ox, 440 + (283-440)*2, 'wall zoom anchor x');
  near(wall.oy, 360 + (429-360)*2, 'wall zoom anchor y');
});

test('trackpad wheel event pans with device pixel scaling and does not zoom', () => {
  const h = harness();
  h.run("navMode='trackpad'");
  const event = h.canvas('wheel', {deltaX:12,deltaY:-8});
  assert(event.defaultPrevented, 'canvas consumes wheel gesture');
  assert.deepEqual(h.read('VIEW'), {s:2,ox:76,oy:216,rot:0.3});
  assert.equal(h.count('render'), 1);
});

test('Shift plus a line-based mouse wheel pans horizontally without changing zoom', () => {
  const h = harness();
  h.run("navMode='mouse'");
  h.canvas('wheel', {shiftKey:true,deltaMode:1,deltaY:3});
  assert.deepEqual(h.read('VIEW'), {s:2,ox:4,oy:200,rot:0.3});
});

test('browser trackpad pinch zooms around the canvas-relative cursor', () => {
  const h = harness();
  h.run("navMode='trackpad'");
  const before = h.read('VIEW');
  h.canvas('wheel', {ctrlKey:true,deltaY:-12,clientX:200,clientY:200});
  const after = h.read('VIEW');
  assert(after.s > before.s, 'pinch-out increases scale');
  near((360-after.ox)/after.s, (360-before.ox)/before.s, 'cursor world x');
  near((320-after.oy)/after.s, (320-before.oy)/before.s, 'cursor world y');
});

test('middle-button drag pans the wall view without editing the room', () => {
  const h = harness();
  h.run("M.mode='wall'");
  const plan = h.read('VIEW');
  h.canvas('pointerdown', {button:1,buttons:4,clientX:120,clientY:140});
  h.canvas('pointermove', {button:1,buttons:4,clientX:135,clientY:151});
  h.canvas('pointerup', {button:1,buttons:0,clientX:135,clientY:151});
  assert.deepEqual(h.read('VIEW'), plan);
  assert.deepEqual(h.read('WV'), {s:3,ox:330,oy:422});
  assert.equal(h.count('addPoint')+h.count('tapPointDraw')+h.count('tapPointMeasure'), 0);
});

test('Space with primary-button drag pans and never inserts a point', () => {
  const h = harness();
  const down = h.global('keydown', {code:'Space',key:' ',target:h.context.document.body});
  assert(down.defaultPrevented, 'Space does not scroll page during canvas navigation');
  h.canvas('pointerdown', {clientX:120,clientY:140});
  h.canvas('pointermove', {clientX:135,clientY:151});
  h.canvas('pointerup', {buttons:0,clientX:135,clientY:151});
  h.global('keyup', {code:'Space',key:' '});
  assert.deepEqual(h.read('VIEW'), {s:2,ox:130,oy:222,rot:0.3});
  assert.equal(h.count('addPoint')+h.count('tapPointDraw'), 0);
  assert.equal(h.run('spaceHeld'), false);
});

test('Space inside an editable field keeps its native text-entry behavior', () => {
  const h = harness();
  const input = {tagName:'INPUT',isContentEditable:false,closest:()=>input};
  h.context.document.activeElement = input;
  const event = h.global('keydown', {code:'Space',key:' ',target:input});
  assert.equal(event.defaultPrevented, false);
  assert.equal(h.run('spaceHeld'), false);
});

test('Space dragging over an opening pans the wall without selecting or moving it', () => {
  const h = harness();
  h.run("M.mode='wall'; M.openSel='existing'");
  h.context.openingAt = () => ({id:'door',x:0,y:0,w:900,h:2100});
  h.global('keydown', {code:'Space',key:' ',target:h.context.document.body});
  h.canvas('pointerdown', {clientX:120,clientY:140});
  h.canvas('pointermove', {clientX:132,clientY:145});
  h.canvas('pointerup', {buttons:0,clientX:132,clientY:145});
  assert.deepEqual(h.read('WV'), {s:3,ox:324,oy:410});
  assert.equal(h.run('M.openSel'), 'existing');
  assert.equal(h.run('wallDrag'), null);
  assert.equal(h.count('pushSnapshot'), 0);
});

test('pointercancel never becomes a drawing, selection or tile tap', () => {
  for (const [type, mode] of [['point','draw'], ['selpt','measure'], ['bg','draw'], ['bg','tiles'], ['tiles','tiles'], ['wall','wall'], ['wallbg','wall']]) {
    const h = harness();
    h.run(`M.mode='${mode}'; pointers.set(1,{x:120,y:140}); gesture={t:'${type}',pointerId:1,id:'A',moved:false,popOpen:false};`);
    h.canvas('pointercancel', {buttons:0});
    assert.equal(h.count('addPoint')+h.count('tapPointDraw')+h.count('tapPointMeasure')+h.count('tilesTap'), 0,
      `${type}/${mode} cancellation does not activate a tap`);
    assert.equal(h.run('gesture'), null);
  }
});

test('lost pointer capture cancels point selection while an unrelated release is ignored', () => {
  const h = harness();
  h.run("M.mode='measure'; pointers.set(1,{x:120,y:140}); gesture={t:'selpt',id:'A',moved:false,popOpen:false}");
  h.canvas('pointerup', {pointerId:2,buttons:0});
  assert(h.run('gesture'), 'unrelated pointer release leaves the gesture intact');
  h.canvas('lostpointercapture', {pointerId:1,buttons:0});
  assert.equal(h.run('gesture'), null);
  assert.equal(h.count('tapPointMeasure'), 0);
});

test('an ordinary primary click still creates one point in drawing mode', () => {
  const h = harness();
  h.canvas('pointerdown', {});
  h.canvas('pointerup', {buttons:0});
  assert.equal(h.count('addPoint'), 1);
  assert.equal(h.count('tapPointDraw'), 0);
});

test('pinch release cannot turn the remaining finger into a tap', () => {
  const h = harness();
  h.canvas('pointerdown', {pointerId:1,pointerType:'touch',clientX:120,clientY:140});
  h.canvas('pointerdown', {pointerId:2,pointerType:'touch',clientX:220,clientY:140});
  h.canvas('pointermove', {pointerId:2,pointerType:'touch',clientX:260,clientY:140});
  assert(h.read('VIEW').s > 2, 'two-finger spread zooms');
  h.canvas('pointerup', {pointerId:2,pointerType:'touch',buttons:0});
  h.canvas('pointerup', {pointerId:1,pointerType:'touch',buttons:0});
  assert.equal(h.count('addPoint')+h.count('tapPointDraw')+h.count('tapPointMeasure'), 0);
});

test('window blur clears navigation modifiers and active gestures without a tap', () => {
  const h = harness();
  h.global('keydown', {code:'Space',key:' ',target:h.context.document.body});
  h.canvas('pointerdown', {});
  h.global('blur', {target:h.context});
  assert.equal(h.run('spaceHeld'), false);
  assert.equal(h.run('gesture'), null);
  assert.equal(h.count('addPoint')+h.count('tapPointDraw'), 0);
});

test('an open native dialog blocks Space navigation even after focus falls back to body', () => {
  const h = harness();
  h.context.document.querySelector = selector => selector === 'dialog[open]' ? {} : null;
  const event = h.global('keydown', {code:'Space',key:' ',target:h.context.document.body});
  assert.equal(h.run('spaceHeld'), false);
  assert.equal(event.defaultPrevented, false, 'The modal keeps the native Space behavior');
});

console.log(`\n${passed} navigation checks passed.`);
