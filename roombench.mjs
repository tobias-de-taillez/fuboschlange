// roombench.mjs — misst DEN Raum aus den Defaults, nicht 500 Zufallsräume.
//
//   node roombench.mjs [--n=48] [--file=<html>] [--map] [--worst]
//
// Alle Parameter bleiben auf den Projektwerten; variiert wird nur die
// Verteilerposition, gleichmäßig über die gesamte Raumkontur (inkl. der beiden
// Notch-Innenkanten). Das ist die Anforderung "der Verteiler muss überall
// platzierbar sein", als Messung.
//
// Läuft in ~2 s und ist damit die Rückkopplung für die Arbeit am konkreten
// Raum; bench.mjs bleibt der Regressionsschutz über die Zufallsräume.
import { load } from './harness.mjs';

const argv = process.argv.slice(2);
const flag = n => argv.find(a => a.startsWith('--' + n + '='))?.split('=')[1];
const N = Number(flag('n') || 48);
const api = load(flag('file') || 'verlegeplan.html');
const S = api.S;
// --mode=1|2|3|auto erzwingt die Kreiszahl. Trennt die Frage "kreuzt die
// Spirale?" von "kreuzen sich die Kreise untereinander?".
if (flag('mode')) S.loopMode = flag('mode');
const R = () => 5 * S.pipeDia;

// Kontur einmal mit den Default-Maßen holen und nach Bogenlänge abtasten, damit
// lange Wände proportional mehr Positionen bekommen als kurze.
const ring = api.lRing(0, 0, S.W, S.H, S.notchA, S.notchB);
const segs = ring.map((a, i) => {
  const b = ring[(i + 1) % ring.length];
  return { a, b, len: Math.hypot(b.x - a.x, b.y - a.y) };
});
const total = segs.reduce((s, e) => s + e.len, 0);
const posAt = u => {                       // u in [0,1) entlang des Umfangs
  let d = u * total;
  for (const e of segs) {
    if (d <= e.len) return { x: e.a.x + (e.b.x - e.a.x) * (d / e.len),
                             y: e.a.y + (e.b.y - e.a.y) * (d / e.len) };
    d -= e.len;
  }
  return { ...ring[0] };
};

const rows = [];
for (let i = 0; i < N; i++) {
  // Nicht exakt auf die Ecken: dort ist die Wandzuordnung mehrdeutig, und der
  // Verteiler sitzt in der Praxis nie in der Ecke.
  S.manifold = posAt((i + 0.5) / N);
  let r;
  try {
    const plan = api.autofit();
    // Ein Plan OHNE Kreise ist ein Fehlschlag, kein perfektes Ergebnis. Ohne
    // diese Zeile meldet ein Absturz in buildLoops "0 Kreuzungen, 0 Radiusfehler,
    // 0 Rohr draussen" - genau so hat ein ReferenceError einmal wie ein
    // Durchbruch ausgesehen.
    if (!plan.loops.length) throw new Error('kein Kreis erzeugt');
    const minR = Math.min(Infinity, ...plan.loops.map(l => l.minR ?? Infinity));
    r = { cross: api.loopCrossings(plan), outside: api.loopsOutside(plan),
          segOut: api.segsOutside(plan),
          cov: Math.round(api.heatCoverage(plan.loops, 25) * 100),
          gap: Math.round(api.gapMax(plan.loops)),
          minR: isFinite(minR) ? Math.round(minR) : null,
          len: Math.round(plan.loops.reduce((s, l) => s + l.length, 0) / 100) / 10,
          loops: plan.loops.length };
  } catch (e) { r = { err: String(e) }; }
  rows.push({ i, mf: S.manifold, ...r });
}

const ok = rows.filter(r => !r.err);
const med = k => { const a = ok.map(r => r[k]).filter(v => v != null).sort((x, y) => x - y);
                   return a.length ? a[a.length >> 1] : 0; };
const cnt = f => ok.filter(f).length;
console.log(JSON.stringify({
  raum: `${S.W}x${S.H}, Notch ${S.notchA}x${S.notchB}${S.notchLeft ? ' links' : ' rechts'}`,
  s: S.s, pipeDia: S.pipeDia, bendSoll: R(), edgeGap: S.edgeGap,
  fenster: S.windowEdges.join('+'),
  positionen: N,
  crossFails: cnt(r => r.cross > 0), covFails: cnt(r => r.cov < 40),
  radFails: cnt(r => r.minR != null && r.minR < R() - 1),
  outFails: cnt(r => r.outside > 0), errFails: rows.length - ok.length,
  // Harte Anforderung, gezaehlt: Schleifen ausserhalb des Raums, muss 0 sein.
  loopsOutside: ok.reduce((a, r) => a + (r.outside || 0), 0),
  worstLoopsOutside: Math.max(...ok.map(r => r.outside || 0), 0),
  segsOutside: ok.reduce((a, r) => a + (r.segOut || 0), 0),
  worstCross: Math.max(...ok.map(r => r.cross), 0),
  medianCross: med('cross'),
  worstGap: Math.max(...ok.map(r => r.gap), 0),
  worstCoverage: Math.min(...ok.map(r => r.cov), 100),
  worstRadius: Math.min(...ok.map(r => r.minR ?? 999), 999),
  medianRadius: med('minR'),
}, null, 1));

if (argv.includes('--worst')) {
  console.error('\nschlimmste 10 nach Kreuzungen:');
  ok.slice().sort((a, b) => b.cross - a.cross).slice(0, 10).forEach(r =>
    console.error(`  mf=(${Math.round(r.mf.x)},${Math.round(r.mf.y)}) cross=${r.cross}`
      + ` out=${r.outside} cov=${r.cov}% minR=${r.minR} gap=${r.gap} kreise=${r.loops}`));
  const errs = rows.filter(r => r.err);
  if (errs.length) { console.error(`\n${errs.length} Ausnahmen:`);
    errs.slice(0, 3).forEach(r => console.error('  ' + r.err)); }
}
if (argv.includes('--map')) {
  console.error('\nje Verteilerposition (Reihenfolge = gegen den Uhrzeigersinn):');
  ok.forEach(r => console.error(`  (${String(Math.round(r.mf.x)).padStart(4)},`
    + `${String(Math.round(r.mf.y)).padStart(4)}) cross=${String(r.cross).padStart(3)}`
    + ` out=${String(r.outside).padStart(2)} cov=${String(r.cov).padStart(2)}%`
    + ` minR=${String(r.minR).padStart(3)} gap=${String(r.gap).padStart(4)}`
    + ` len=${r.len}m`));
}
