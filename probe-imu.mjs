// probe-imu.mjs — Strapdown-Integration: aus 6 IMU-Zeitreihen (3x Beschleunigung,
// 3x Drehrate) Lage, Geschwindigkeit und Position im Raum.
//
// Zweck: das Fehlerbudget einer Wand-zu-Wand-Messung EMPIRISCH bestimmen statt
// es aus Papern zu schaetzen. Der Selbsttest unten reproduziert die analytischen
// Fehlerterme in Code — wenn echte Daten davon abweichen, liegt es am Sensor
// und nicht am Integrator.
//
// Konventionen (identisch zu Android):
//   Body-Frame:  Sensorachsen des Telefons.
//   Nav-Frame:   z zeigt nach oben, x/y horizontal, Heading beliebig.
//   Das Accelerometer misst die spezifische Kraft f, nicht die Beschleunigung.
//   Telefon flach auf dem Tisch liest f = [0, 0, +g].
//   Daraus:  a_nav = R(q) * f_body - [0, 0, g]
//
// Aufruf:  node probe-imu.mjs

const G_DEFAULT = 9.81;

// ---------------------------------------------------------------- Quaternionen
// q = [w, x, y, z], dreht vom Body- ins Nav-Frame: v_nav = q * v_body * q^-1

const qmul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];

const qnorm = (q) => {
  const n = Math.hypot(...q);
  return q.map((c) => c / n);
};

// Rotationsvektor -> Quaternion (Exponentialabbildung).
// Exakt fuer konstante Drehrate ueber das Intervall — kein Kleinwinkelfehler,
// auch bei den 200-300 grad/s, die beim Gehen kurzzeitig auftreten.
const expq = (rv) => {
  const th = Math.hypot(...rv);
  if (th < 1e-12) return [1, rv[0] / 2, rv[1] / 2, rv[2] / 2];
  const s = Math.sin(th / 2) / th;
  return [Math.cos(th / 2), rv[0] * s, rv[1] * s, rv[2] * s];
};

const rot = (q, v) => {
  const [w, x, y, z] = q;
  // v + 2 * cross(qv, cross(qv, v) + w*v)
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
};

// Kuerzeste Drehung, die u auf v legt (beide normiert).
const qBetween = (u, v) => {
  const d = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  if (d > 1 - 1e-12) return [1, 0, 0, 0];
  const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return qnorm([1 + d, ...c]);
};

// ------------------------------------------------------------------ Integrator
//
// samples: [{ t (s), f: [fx,fy,fz] (m/s^2), w: [wx,wy,wz] (rad/s) }]
//          Erste `staticSec` Sekunden muss das Telefon ruhig liegen.
//
// segment: [tA, tB] — die beiden Wandtipps. Die Lage laeuft ab Ende der
//          Ruhephase durch (das Aufnehmen des Telefons muss mitgedreht werden),
//          Geschwindigkeit und Position starten aber erst bei tA auf null.
//          Ohne Angabe wird alles nach der Ruhephase integriert.
//
// zupt: Zwei-Punkt-Randbedingung. Beide Tipps sind echte v=0-Ereignisse, also
//       ist der Geschwindigkeitsrest am Ende reiner Fehler. Wir ziehen ihn
//       linear ueber die Strecke ab und integrieren die Position neu.
//
// coning: Korrektur zweiter Ordnung fuer die Lagefortschreibung. Bei 400 Hz
//         vernachlaessigbar, bei den 50-100 Hz eines Browsers nicht mehr.
//
export function integrate(samples, opts = {}) {
  const {
    staticSec = 2, zupt = true, segment = null, coning = true,
    injectTiltDeg = 0, injectTiltAxis = [0, 1, 0],
  } = opts;

  const t0 = samples[0].t;
  const stat = samples.filter((s) => s.t - t0 < staticSec);
  if (stat.length < 10) throw new Error(`Ruhephase zu kurz: ${stat.length} Samples`);

  const mean = (get) =>
    [0, 1, 2].map((i) => stat.reduce((a, s) => a + get(s)[i], 0) / stat.length);

  // Gyro-Bias: im Stillstand ist die wahre Drehrate null, der Mittelwert ist der Bias.
  const bg = mean((s) => s.w);

  // Lokales g aus dem Stillstand — absorbiert Skalenfehler des Accelerometers mit.
  const fs = mean((s) => s.f);
  const g = Math.hypot(...fs);

  // Initiale Ausrichtung: die gemittelte spezifische Kraft zeigt im Stillstand
  // nach oben. Heading bleibt frei (0) — pro Messsegment brauchen wir nur den
  // RELATIVEN Verschiebungsvektor, nicht die absolute Nordrichtung.
  let q = qBetween(fs.map((c) => c / g), [0, 0, 1]);

  if (injectTiltDeg !== 0) {
    const a = Math.hypot(...injectTiltAxis);
    const rv = injectTiltAxis.map((c) => (c / a) * (injectTiltDeg * Math.PI) / 180);
    q = qmul(q, expq(rv));
  }

  const traj = [];
  let v = [0, 0, 0];
  let p = [0, 0, 0];
  let prev = null;

  const tA = segment ? segment[0] : t0 + staticSec;
  const tB = segment ? segment[1] : Infinity;

  for (const s of samples) {
    if (s.t - t0 < staticSec) continue;
    if (s.t > tB) break;

    if (prev) {
      const dt = s.t - prev.t;
      if (!(dt > 0)) continue;

      // Lage: Trapez auf der Drehrate, dann exakte Exponentialabbildung.
      const w1 = [0, 1, 2].map((i) => prev.w[i] - bg[i]);
      const w2 = [0, 1, 2].map((i) => s.w[i] - bg[i]);
      const rv = [0, 1, 2].map((i) => ((w1[i] + w2[i]) / 2) * dt);
      if (coning) {
        // theta += (1/12) * (w_{k-1} x w_k) * dt^2
        const c = [
          w1[1] * w2[2] - w1[2] * w2[1],
          w1[2] * w2[0] - w1[0] * w2[2],
          w1[0] * w2[1] - w1[1] * w2[0],
        ];
        for (let i = 0; i < 3; i++) rv[i] += (c[i] * dt * dt) / 12;
      }
      q = qnorm(qmul(q, expq(rv)));
    }

    // Spezifische Kraft ins Nav-Frame, Schwerkraft raus.
    const fNav = rot(q, s.f);
    const aNav = [fNav[0], fNav[1], fNav[2] - g];

    // Vor dem ersten Tipp nur die Lage mitfuehren — das Aufnehmen des Telefons
    // dreht das Geraet, darf aber nicht in die Strecke eingehen.
    if (s.t < tA) {
      prev = { ...s, aNav };
      continue;
    }
    if (!traj.length) {
      // Start des Messsegments: v und p auf null, aNav aus der aktuellen Lage.
      prev = { ...s, aNav };
      traj.push({ t: s.t, v: [...v], p: [...p] });
      continue;
    }

    const dt = s.t - prev.t;
    // Trapez statt Euler — kostet nichts und halbiert den Diskretisierungsfehler.
    const vNew = [0, 1, 2].map((i) => v[i] + ((aNav[i] + prev.aNav[i]) / 2) * dt);
    p = [0, 1, 2].map((i) => p[i] + ((vNew[i] + v[i]) / 2) * dt);
    v = vNew;

    prev = { ...s, aNav };
    traj.push({ t: s.t, v: [...v], p: [...p] });
  }
  if (traj.length < 2) throw new Error(`Messsegment zu kurz: ${traj.length} Samples`);

  const raw = { p: [...p], v: [...v], q, g, bg, traj };
  if (!zupt) return raw;

  // Zwei-Punkt-ZUPT: v(T) ist bekannt null, also ist der Restwert der
  // akkumulierte Geschwindigkeitsfehler. Linear ueber die Segmentdauer abziehen.
  const T = traj[traj.length - 1].t - traj[0].t;
  const vT = traj[traj.length - 1].v;
  let pc = [0, 0, 0];
  const vCorr = (k) => {
    const f = (traj[k].t - traj[0].t) / T;
    return [0, 1, 2].map((i) => traj[k].v[i] - f * vT[i]);
  };
  for (let k = 1; k < traj.length; k++) {
    const dt = traj[k].t - traj[k - 1].t;
    const v1 = vCorr(k - 1);
    const v2 = vCorr(k);
    pc = [0, 1, 2].map((i) => pc[i] + ((v1[i] + v2[i]) / 2) * dt);
  }
  return { ...raw, p: pc, pRaw: raw.p };
}

// ------------------------------------------------------- Synthetische Testdaten
//
// Erzeugt eine bekannte Bewegung und rechnet rueckwaerts, was die Sensoren dabei
// messen wuerden. Damit ist der Integrator gegen die Wahrheit pruefbar.
//
// Bahn: D Meter entlang nav-x, Kosinusprofil (v=0 an beiden Enden — genau die
// Situation zwischen zwei Wandtipps). Dazu eine konstante Koerperdrehung, damit
// die Lageberechnung wirklich gefordert wird.
//
function genSynthetic({
  T = 5, D = 4, dt = 1 / 400, staticSec = 2,
  wBody = [0.3, -0.2, 0.5], gyroBiasDegS = 0, gyroBiasAxis = [0, 1, 0],
}) {
  const g = G_DEFAULT;
  const out = [];

  for (let t = 0; t < staticSec; t += dt) out.push({ t, f: [0, 0, g], w: [0, 0, 0] });

  const an = Math.hypot(...gyroBiasAxis);
  const bias = gyroBiasAxis.map((c) => ((c / an) * gyroBiasDegS * Math.PI) / 180);
  for (let k = 0; ; k++) {
    const t = k * dt;
    if (t > T) break;
    // p = D/2 * (1 - cos(pi t/T))  ->  a = D pi^2/(2T^2) * cos(pi t/T)
    const aNav = [(D * Math.PI ** 2) / (2 * T ** 2) * Math.cos((Math.PI * t) / T), 0, 0];
    const fNav = [aNav[0], aNav[1], aNav[2] + g];
    const q = expq(wBody.map((c) => c * t)); // konstante Achse im Body -> geschlossene Form
    const qi = [q[0], -q[1], -q[2], -q[3]];
    out.push({
      t: staticSec + t,
      f: rot(qi, fNav),
      w: wBody.map((c, i) => c + bias[i]), // Bias erst nach der Ruhephase -> nicht wegkalibrierbar
    });
  }
  return out;
}

// ------------------------------------------------------------------ Selbsttest

function demo() {
  const ok = (name, got, want, tol) => {
    const pass = Math.abs(got - want) <= tol;
    console.log(`${pass ? "ok  " : "FAIL"}  ${name.padEnd(46)} ${got.toFixed(4)} m  (erwartet ${want.toFixed(4)} +-${tol})`);
    if (!pass) process.exitCode = 1;
  };

  const T = 5, D = 4, g = G_DEFAULT;
  // Die Ruhephase richtet das Nav-Frame identisch zur Wahrheit aus, also ist
  // die wahre Endposition [D,0,0] und der Fehler der Betrag der Differenz.
  const err = (r) => Math.hypot(r.p[0] - D, r.p[1], r.p[2]);

  // 1. Perfekte Sensoren: der Integrator muss die Strecke exakt zurueckgeben.
  //    Faellt das durch, ist die Mechanisierung falsch und jede Messung wertlos.
  ok("perfekt, ohne ZUPT", err(integrate(genSynthetic({ T, D }), { zupt: false })), 0, 1e-3);

  // 2. 1 grad Lagefehler bei der Initialausrichtung, roh integriert.
  //    Schwerkraft leckt mit g*sin(d) in die Horizontale -> p_err = 0.5*g*sin(d)*T^2
  const tilt = 1;
  const errTilt = 0.5 * g * Math.sin((tilt * Math.PI) / 180) * T ** 2;
  const r2 = integrate(genSynthetic({ T, D }), { zupt: false, injectTiltDeg: tilt });
  ok(`Lagefehler ${tilt} grad, ohne ZUPT`, err(r2), errTilt, 0.02);

  // 3. Derselbe Lagefehler MIT Zwei-Punkt-ZUPT.
  //    Ein konstanter Beschleunigungsfehler erzeugt einen LINEAREN
  //    Geschwindigkeitsfehler — und genau den zieht die Randbedingung exakt ab.
  //    Der Schwerkraft-Leck-Term verschwindet vollstaendig, nicht nur teilweise.
  //    Was bleibt, ist rein geometrisch: der Verschiebungsvektor ist um denselben
  //    Winkel verdreht, D*sin(d).
  const r3 = integrate(genSynthetic({ T, D }), { zupt: true, injectTiltDeg: tilt });
  ok(`Lagefehler ${tilt} grad, mit ZUPT`, err(r3), D * Math.sin((tilt * Math.PI) / 180), 1e-3);

  // 3b. Und das ist der Punkt: die LAENGE ueberlebt exakt. Ein konstanter
  //     Lagefehler dreht das Ergebnis, er verkuerzt es nicht. Fuer eine
  //     Wandlaenge ist genau die Laenge die gesuchte Groesse.
  ok(`Lagefehler ${tilt} grad, mit ZUPT — nur Laenge`, Math.hypot(...r3.p) - D, 0, 1e-3);

  // 4. Gyro-Restbias nach der Kalibrierung (Bias-Instabilitaet).
  //    Lagefehler waechst linear -> Beschleunigungsfehler linear ->
  //    p_err = (1/6) * g * b * T^3.  Das ist der Term, den ZUPT NICHT toetet.
  //    Ohne Koerperdrehung, Bias um eine Achse: reiner Term, analytisch pruefbar.
  const b = 0.1; // grad/s
  const gb = { T, D, wBody: [0, 0, 0], gyroBiasDegS: b, gyroBiasAxis: [0, 1, 0] };
  const errGyroRaw = (g * ((b * Math.PI) / 180) * T ** 3) / 6;
  ok(`Gyro-Restbias ${b} grad/s, ohne ZUPT`, err(integrate(genSynthetic(gb), { zupt: false })), errGyroRaw, 0.01);

  // 5. Derselbe Gyro-Restbias mit ZUPT: quadratischer Geschwindigkeitsfehler,
  //    linear korrigiert -> bleibt (1/12)*g*b*T^3, also Faktor 2 besser.
  ok(`Gyro-Restbias ${b} grad/s, mit ZUPT`, err(integrate(genSynthetic(gb), { zupt: true })), errGyroRaw / 2, 0.01);

  // 6. Segment-Grenzen: explizit gesetzte Tipp-Zeitpunkte muessen dasselbe
  //    liefern wie die Vorgabe "alles nach der Ruhephase".
  //    (Die Coning-Korrektur bleibt hier ohne Wirkung: die synthetische Drehung
  //    laeuft um eine feste Koerperachse, also ist w_{k-1} x w_k identisch null.
  //    Sie ist an, weil sie korrekt ist, nicht weil ein Test sie fordert.)
  const seg = integrate(genSynthetic({ T, D }), { zupt: false, segment: [2, 2 + T] });
  ok("Segment [tA,tB] explizit", err(seg), 0, 1e-3);

  console.log("\nFehlerbudget bei T=5 s, ZUPT an, dominanter Restterm (1/12)*g*b*T^3:");
  for (const bb of [0.003, 0.01, 0.03, 0.1, 0.3]) {
    const e = (g * ((bb * Math.PI) / 180) * T ** 3) / 12;
    console.log(`  Gyro-Restbias ${String(bb).padStart(5)} grad/s  ->  ${(e * 100).toFixed(1)} cm`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) demo();
