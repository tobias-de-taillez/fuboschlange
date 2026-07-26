// harness.mjs — lädt das Skript aus verlegeplan.html headless. Node >= 18, keine
// Dependencies. Gemeinsam genutzt von bench.mjs und den Diagnose-Proben, damit
// eine neue Messung eine Datei mit drei Zeilen ist und nicht ein neuer DOM-Stub.
import { readFileSync } from 'node:fs';

// Alles, was headless interessant ist. Eine Liste statt pro Aufrufer eine
// eigene: `new Function` kann nur zurückgeben, was zur Bauzeit im Quelltext
// steht, also lieber einmal breit als bei jeder Probe nachziehen.
export const EXPORTS = [
  'crossingBench', 'autofit', 'buildLoops', 'partition', 'bifilarPath',
  'loopCrossings', 'loopsOutside', 'segsOutside', 'crossHits', 'drawnPoints', 'heatCoverage', 'gapMax',
  'zonePolyOf', 'zoneField', 'eikonalField', 'isoContours', 'insetsFor',
  'polyLen', 'simplify', 'fieldInset', 'spacingAt', 'lRing', 'chainSegs',
  'rectiOffsetter', 'randW', 'omegaClear', 'randWidth', 'notchFrame', 'doubleSpiralField',
  'snappedManifold', 'rotFwd', 'rotBack', 'rotForManifold', 'frameW', 'frameH',
  'parallelOverlaps', 'fieldCrossings', 'crossBetween', 'segCrossPt', 'fillet', 'smoothToRadius', 'resampleArc', 'relaxLoops', 'pointInRoom', 'contourRoute', 'insetRoomRing',
  'omegaTurn', 'pathCurve', 'curveMinR', 'S',
];

// opts.checks: die Selbstchecks der Datei mitlaufen lassen (Default: nein).
// Sie kosten ~1,5 s pro Prozess, weil sie einen eigenen 12-Lauf-Bench enthalten.
export function load(file = 'verlegeplan.html', opts = {}) {
  globalThis.SKIP_SELFCHECKS = !opts.checks;
  const html = readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const js = scripts.reduce((a, b) => (a.length > b.length ? a : b));

  // Minimaler DOM-Stub: die Datei ruft beim Laden initUI() und recompute().
  const el = () => ({
    value: '', textContent: '', innerHTML: '', checked: false, style: {}, dataset: {},
    classList: { add(){}, remove(){}, toggle(){} },
    addEventListener(){}, removeEventListener(){}, appendChild(){},
    querySelector: () => el(), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ x:0, y:0, width:800, height:600 }),
    // computeThermal() ruft ueber thermalImageURL() cv.getContext('2d') auf
    // (document.createElement('canvas')). Ohne diese Methode wirft es dort mit
    // "cv.getContext is not a function", statt in den vorgesehenen
    // `if(!ctx) return '';`-Fallback zu laufen. null liefert exakt diesen Fallback.
    getContext: () => null,
  });
  globalThis.document = {
    getElementById: () => el(), querySelector: () => el(), querySelectorAll: () => [],
    createElement: () => el(), addEventListener(){},
    body: el(), documentElement: el(),
  };
  globalThis.window = globalThis;
  globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
  globalThis.performance = { now: () => Number(process.hrtime.bigint() / 1000000n) };

  // Kein `with` — das Skript beginnt mit "use strict", dort ist es verboten.
  // Stattdessen den Skriptinhalt als Funktionsrumpf ausführen und die benötigten
  // Symbole am Ende explizit zurückgeben.
  return new Function(js + `\n  return { ${EXPORTS.join(', ')} };`)();
}
