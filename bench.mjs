// bench.mjs — headless Bench-Runner. Node >= 18, keine Dependencies.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('verlegeplan.html', 'utf8');
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
const api = new Function(js + `
  return { crossingBench, autofit, loopCrossings, loopsOutside, heatCoverage,
           snappedManifold, S };
`)();

const RUNS = Number(process.argv[2] || 500);
const fails = api.crossingBench(RUNS, 20260725);
const out = {
  runs: RUNS,
  crossFails: fails.filter(f => f.cross > 0).length,
  covFails: fails.filter(f => f.cov < 40).length,
  radFails: fails.filter(f => f.minR != null && f.minR < f.radSoll - 1).length,
  // `cross` zählt im Bench nur die Kreuzungen, `outside` zählt getrennt das
  // Rohr außerhalb des Raums (seit der Trennung in crossingBench, Step 1a).
  outFails: fails.filter(f => f.outside > 0).length,
  worstCoverage: Math.min(...fails.map(f => f.cov), 100),
  worstRadius: Math.min(...fails.map(f => f.minR ?? 999), 999),
};
console.log(JSON.stringify(out, null, 1));

if (process.argv.includes('--save-baseline')) {
  writeFileSync('bench-baseline.json', JSON.stringify(out, null, 1));
  process.exit(0);
}
// Alle vier harten Kriterien gehören in den Regressionsvergleich — `outFails`
// fehlte hier bisher, wodurch "kein Rohr außerhalb des Raums" nie geprüft wurde.
const KEYS = ['crossFails', 'covFails', 'radFails', 'outFails'];

// Fehlende Baseline-Datei ist ein legitimer Erstlauf: still bleiben, Exit 0.
let baseRaw;
try {
  baseRaw = readFileSync('bench-baseline.json', 'utf8');
} catch {
  baseRaw = null;
}

if (baseRaw !== null) {
  // Eine vorhandene, aber kaputte Baseline-Datei ist dagegen ein Defekt und
  // darf nicht wie eine fehlende Datei still durchgewunken werden.
  let base;
  try {
    base = JSON.parse(baseRaw);
  } catch (e) {
    console.error('bench-baseline.json ist beschädigt (kein gültiges JSON): ' + e.message);
    process.exit(1);
  }

  // Fehlt ein Schlüssel in der Baseline, würde `out[k] > base[k]` zu
  // `x > undefined` und damit immer `false` — diese Kennzahl könnte nie mehr
  // anschlagen. Das wäre eine veraltete Baseline, die eine Kennzahl still
  // außer Kraft setzt, also ein Fehler statt eines stillen Durchwinkens.
  const missing = KEYS.filter(k => !(k in base));
  if (missing.length) {
    console.error('bench-baseline.json fehlt Schlüssel: ' + missing.join(', '));
    process.exit(1);
  }

  const worse = KEYS.filter(k => out[k] > base[k]);
  if (worse.length) {
    console.error('REGRESSION in: ' + worse.join(', '));
    process.exit(1);
  }
}
