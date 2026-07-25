// bench.mjs — headless Bench-Runner. Node >= 18, keine Dependencies.
//
//   node bench.mjs [läufe] [--jobs=N] [--checks] [--why] [--save-baseline]
//   node bench.mjs 500 --shard=3/14        # ein einzelner Shard (intern)
//
// --file=<html> misst eine ANDERE Fassung der Datei. Damit ist ein A/B gegen
// einen früheren Stand ein Zweizeiler und braucht kein Hin-und-Her im
// Arbeitsbaum:
//   git show HEAD~1:verlegeplan.html > /tmp/vorher.html
//   node bench.mjs 500 --file=/tmp/vorher.html
//
// Die Läufe werden auf N Prozesse aufgeteilt. Jeder Shard erzeugt ALLE
// Parametersätze (der PRNG läuft identisch weiter) und wertet nur seine eigenen
// aus — die Konfigurationen sind dadurch dieselben wie in einem sequentiellen
// Lauf und bleiben mit der Baseline vergleichbar.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { load } from './harness.mjs';

const argv = process.argv.slice(2);
const flag = name => argv.find(a => a.startsWith('--' + name + '='))?.split('=')[1];
const RUNS = Number(argv.find(a => /^\d+$/.test(a)) || 500);
const SEED = Number(flag('seed') || 20260725);
const shardArg = flag('shard');
const FILE = flag('file') || 'verlegeplan.html';

// ---------- Shard-Modus: ein Teil der Läufe, Ergebnis als JSON auf stdout -----
if (shardArg) {
  const [sh, ns] = shardArg.split('/').map(Number);
  const api = load(FILE);
  const fails = api.crossingBench(RUNS, SEED, sh, ns);
  process.stdout.write(JSON.stringify({ fails: [...fails], all: fails.all }));
  process.exit(0);
}

// ---------- Hauptprozess ------------------------------------------------------
// Zwei Kerne für das System freilassen; unter ~32 Läufen kostet das Starten der
// Prozesse mehr als es einspart, dann in-process rechnen.
const JOBS = Math.max(1, Math.min(Number(flag('jobs') || availableParallelism() - 2), RUNS));
const t0 = Date.now();

let fails, all;
if (RUNS < 32 || JOBS === 1) {
  const api = load(FILE, { checks: argv.includes('--checks') });
  const f = api.crossingBench(RUNS, SEED);
  fails = [...f]; all = f.all;
} else {
  if (argv.includes('--checks')) load(FILE, { checks: true });
  // Eigener Pfad, nicht 'bench.mjs': relativ aufgelöst bricht der Shard-Start,
  // sobald der Aufruf aus einem anderen Arbeitsverzeichnis kommt.
  const self = import.meta.filename;
  const run = i => new Promise((res, rej) =>
    execFile(process.execPath, [self, String(RUNS), `--seed=${SEED}`,
      `--file=${FILE}`, `--shard=${i}/${JOBS}`], { maxBuffer: 1 << 28 },
      (err, out, errOut) => err ? rej(new Error(`Shard ${i}: ${err.message}\n${errOut}`))
                                : res(JSON.parse(out))));
  const parts = await Promise.all(Array.from({ length: JOBS }, (_, i) => run(i)));
  // Eine Fassung ohne den `all`-Kanal (--file auf einen älteren Stand) liefert
  // hier undefined. Ohne diese Prüfung zählt flatMap das als einen Eintrag pro
  // Shard und die Fehlerquoten wären still durch 500 statt durch 12 geteilt.
  const bad = parts.findIndex(p => !Array.isArray(p.all));
  if (bad >= 0) {
    console.error(`Shard ${bad} liefert keinen all-Kanal — `
      + `hat ${FILE} noch die alte crossingBench-Rückgabe (fails.allGaps)?`);
    process.exit(1);
  }
  fails = parts.flatMap(p => p.fails);
  all = parts.flatMap(p => p.all);
  // Jeder Lauf muss genau einmal ausgewertet worden sein. Ohne diese Prüfung
  // würde ein Shard, der still weniger liefert (z. B. wegen eines Fehlers im
  // Aufteilungs-Index), die Fehlerraten kleiner rechnen als sie sind.
  if (all.length !== RUNS) {
    console.error(`Shards haben ${all.length} von ${RUNS} Läufen ausgewertet.`);
    process.exit(1);
  }
}

// Die harten Kriterien gegen ALLE Läufe zählen, nicht gegen die Fehlschlagliste:
// sonst hängt jede Kennzahl daran, dass ein Lauf schon aus einem ANDEREN Grund
// in `fails` gelandet ist.
const ok = all.filter(f => !f.err);
const med = key => {
  const a = ok.map(f => f[key]).filter(v => v != null).sort((x, y) => x - y);
  return a.length ? a[a.length >> 1] : 0;
};
const out = {
  runs: RUNS,
  crossFails: ok.filter(f => f.cross > 0).length,
  covFails: ok.filter(f => f.cov < 40).length,
  radFails: ok.filter(f => f.minR != null && f.minR < f.radSoll - 1).length,
  // `cross` zählt im Bench nur die Kreuzungen, `outside` zählt getrennt das
  // Rohr außerhalb des Raums (seit der Trennung in crossingBench, Step 1a).
  outFails: ok.filter(f => f.outside > 0).length,
  errFails: all.filter(f => f.err).length,
  worstCoverage: Math.min(...ok.map(f => f.cov), 100),
  worstRadius: Math.min(...ok.map(f => f.minR ?? 999), 999),
  // Diagnose, kein Gate: worstGap zeigt, ob Radius-Gewinne mit Flaeche bezahlt
  // werden. Bewusst NICHT in RATE_KEYS - die vier harten Kriterien bleiben vier.
  worstGap: Math.max(...ok.map(f => f.gap ?? 0), 0),
  // BETRÄGE, nicht nur Quoten. Die vier harten Kriterien sind binär: sinken die
  // Kreuzungen eines Laufs von 58 auf 20, bleibt er ein Fehlschlag und
  // crossFailRate rührt sich nicht. Ohne diese Zeilen ist Fortschritt erst
  // sichtbar, wenn er exakt 0 erreicht — also nie während der Arbeit daran.
  worstCross: Math.max(...ok.map(f => f.cross ?? 0), 0),
  medianCross: med('cross'),
  medianGap: med('gap'),
  medianCoverage: med('cov'),
  medianRadius: med('minR'),
  seconds: +((Date.now() - t0) / 1000).toFixed(1),
  jobs: JOBS,
};
// Raten (Anteil an `runs`) zusätzlich zu den Absolutzahlen: Läufe mit
// unterschiedlicher Laufzahl sind nur über die Rate vergleichbar (siehe
// Regressionsvergleich weiter unten). Die Absolutzahlen bleiben erhalten,
// sie sind für die Diagnose nützlich.
out.crossFailRate = out.crossFails / RUNS;
out.covFailRate = out.covFails / RUNS;
out.radFailRate = out.radFails / RUNS;
out.outFailRate = out.outFails / RUNS;
console.log(JSON.stringify(out, null, 1));

// Die häufigsten Fehlerursachen benennen, statt nur zu zählen: ohne das ist der
// nächste Schritt nach einem roten Lauf immer erst eine eigene Probe.
if (argv.includes('--why')) {
  const worst = fails.filter(f => !f.err).sort((a, b) => a.cov - b.cov).slice(0, 5);
  console.error('\nschlimmste 5 nach Deckung:');
  worst.forEach(f => console.error('  ' + JSON.stringify({ cov: f.cov, cross: f.cross,
    outside: f.outside, minR: f.minR, radSoll: f.radSoll, gap: f.gap, ...f.cfg })));
  const errs = fails.filter(f => f.err);
  if (errs.length) {
    console.error(`\n${errs.length} Ausnahmen, erste 3:`);
    errs.slice(0, 3).forEach(f => console.error('  ' + f.err + ' ' + JSON.stringify(f.cfg)));
  }
}

if (argv.includes('--save-baseline')) {
  // Laufzeit und Prozesszahl sind Eigenschaften der Maschine, nicht des Codes —
  // in der Baseline würden sie bei jedem Speichern einen Diff erzeugen, der
  // nichts über die Verlegequalität sagt.
  const { seconds, jobs, ...keep } = out;
  writeFileSync('bench-baseline.json', JSON.stringify(keep, null, 1));
  process.exit(0);
}
// Alle vier harten Kriterien gehören in den Regressionsvergleich — `outFails`
// fehlte hier bisher, wodurch "kein Rohr außerhalb des Raums" nie geprüft wurde.
// Verglichen werden die RATEN, nicht die Absolutzahlen: die Baseline wurde mit
// 500 Läufen geschrieben. Ein Vergleichslauf mit anderer Laufzahl hat andere
// Absolutzahlen selbst bei unveränderter Fehlerquote — nachgewiesen mit
// `node bench.mjs 600`, das gegen die 500er-Baseline in allen vier
// Absolutzahlen "schlechter" meldet, obwohl sich am Code nichts geändert hat.
// Umgekehrt kaschiert ein Lauf mit weniger Läufen (z. B. 60) eine echte
// Verschlechterung. Raten sind laufzahl-unabhängig vergleichbar.
const RATE_KEYS = ['crossFailRate', 'covFailRate', 'radFailRate', 'outFailRate'];
// Toleranz gegen das Rauschen unterschiedlicher Laufzahlen: bei festem Seed
// ist jeder Lauf deterministisch, aber verschieden lange Präfixe derselben
// Zufallsfolge liefern leicht unterschiedliche Raten. Gemessen (gleicher
// Code, n=60/500/600) war die größte Abweichung von der 500er-Rate ein Anstieg
// von +0.0153 bei `outFailRate` (600 Läufe: 0.3833 vs. 500 Läufe: 0.368) — alle
// anderen Abweichungen lagen bei 0 oder darunter. 0.05 (5 Prozentpunkte) deckt
// das mit knapp 3x Sicherheitsabstand ab, bleibt aber klein genug, um echte
// Regressionen zu erkennen: die bisherigen Verschlechterungen in diesem
// Projekt (siehe Task-Brief: z. B. Kreuzungen 57->103) verschieben die Rate um
// ein Vielfaches, nicht um einzelne Prozentpunkte.
const RATE_TOLERANCE = 0.05;

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
    // JSON erlaubt auch `null`, Zahlen oder Strings als Dokument-Wurzel — das
    // ist gültiges JSON, aber kein Objekt. Der `in`-Check weiter unten
    // verlangt ein Objekt und würde sonst mit einem ungefangenen TypeError
    // abbrechen. Hier wie einen Parse-Fehler behandeln: eine Baseline ohne
    // Objektstruktur ist genauso unbrauchbar wie eine mit Syntaxfehler.
    if (base === null || typeof base !== 'object') {
      throw new TypeError(`kein Objekt, sondern ${base === null ? 'null' : typeof base}`);
    }
  } catch (e) {
    console.error('bench-baseline.json ist beschädigt (kein gültiges JSON): ' + e.message);
    process.exit(1);
  }

  // Fehlt ein Schlüssel in der Baseline, würde `out[k] > base[k]` zu
  // `x > undefined` und damit immer `false` — diese Kennzahl könnte nie mehr
  // anschlagen. Das wäre eine veraltete Baseline, die eine Kennzahl still
  // außer Kraft setzt, also ein Fehler statt eines stillen Durchwinkens.
  const missing = RATE_KEYS.filter(k => !(k in base));
  if (missing.length) {
    console.error('bench-baseline.json fehlt Schlüssel: ' + missing.join(', '));
    process.exit(1);
  }

  const worse = RATE_KEYS.filter(k => out[k] > base[k] + RATE_TOLERANCE);
  if (worse.length) {
    console.error('REGRESSION in: ' + worse.join(', '));
    process.exit(1);
  }
}
