# Verlegetool-Verheiratung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Vite-App (`single-loop/raum.html`) wird das eine Verlegetool: Bedienoberfläche und Modalität des alten `verlegeplan.html`, Geometrie ausschließlich vom zertifizierten `plan_room` (Rust/WASM im Worker).

**Architecture:** Der uncommittete Thermik-Stand wird zuerst auf den Branch `thermal-port` geparkt. Danach wird `src/raum-main.ts` in fokussierte Module unter `src/verlegeplan/` zerlegt (types, survey, sheet, planner, panel, auswertung); `raum.html` bekommt das alte Panel-Layout, jedes Element ehrlich gegen `RoomPlanInput` verdrahtet. Genau eine Rust-Änderung: `circuit_count: Option<usize>` als Override der Feldaufteilung.

**Tech Stack:** Rust (wasm-pack → `src/wasm/pkg`), TypeScript strict, Vite Multi-Entry, Vitest (jsdom), Web Worker.

**Spec:** `docs/superpowers/specs/2026-08-02-verlegetool-verheiratung-design.md`

## Global Constraints

- UI-Texte deutsch, mit korrekten Umlauten; Code und Bezeichner englisch.
- Verlegeabstand bietet **nur** 75 / 150 / 225 / 300 mm an (Noppenraster).
- Rohr-Ø **16 mm** und Biegeradius **80 mm** sind Anzeige, keine Eingabe.
- Max. Kreislänge ist Anzeige, fix **100 m**.
- Keine Thermik in diesem Plan — der Stand liegt nach Task 1 auf `thermal-port`.
- Auswertungszahlen kommen aus dem Solver-Zertifikat (`RoomPlan`); keine JS-Selbstprüfungen mit ✓-Häkchen.
- Eingabeänderungen starten **keinen** Lauf; sie markieren das Blatt „veraltet". Läufe starten nur über „Neu planen" oder Verteiler-Klick; ein neuer Start bricht den laufenden ab.
- Gates nach jedem Task: `npm --prefix single-loop run typecheck` und `npm --prefix single-loop run test` grün; für Rust-Tasks zusätzlich `cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_wintergarten` und `cargo clippy --manifest-path single-loop/solver/Cargo.toml --all-targets` ohne Warnung.
- Arbeitsverzeichnis aller Pfade: Repo-Root `/Volumes/external/TobiCodetEndlichWieder/Zaene`. Im Baum liegen zwei fremde uncommittete Stände (`docs/superpowers/plans/2026-07-31-pxpipe-hinter-claude-code.md`, `wintergarten-verlegeplan.svg`) — **niemals** `git add -A` benutzen, immer Dateien einzeln stagen.

---

## Dateistruktur (Ziel)

| Datei | Verantwortung |
|---|---|
| `single-loop/raum.html` | Markup: Panelspalte links (Raum, Verlegung, Randzone, Heizkreise, Verteiler), Blatt rechts, Badge, Karten, Notes, Druckknopf |
| `single-loop/src/verlegeplan/types.ts` | Wire-Typen: `Pt`, `Frame`, `RoomCircuit`, `RoomPlan`, `RoomPlanInput`, `Survey` |
| `single-loop/src/verlegeplan/survey.ts` | `ringFromSurvey(survey): Pt[]` — Aufmaß-JSON → Ring, laute Fehler |
| `single-loop/src/verlegeplan/sheet.ts` | `render(plan, override?)`, `viewOf`, `toWorld`, `toLocal` — das SVG-Blatt |
| `single-loop/src/verlegeplan/planner.ts` | `workerPlanner(factory)` mit `plan()` **und `abort()`** |
| `single-loop/src/verlegeplan/panel.ts` | Seitenleiste → `RoomPlanInput`; `onChange`-Meldung für „veraltet" |
| `single-loop/src/verlegeplan/auswertung.ts` | `show(plan)`: Badge, Kreis-Karten, Raum-Karten, Notes |
| `single-loop/src/raum-main.ts` | Verdrahtung: Zustand, Lauf-Lebenszyklus, Klick ↔ x/y, Sekundenzähler |
| `single-loop/src/styles.css` | + Panel-, Karten-, Notes-, veraltet- und Print-CSS |
| `single-loop/solver/src/circuit/plan.rs` | + `circuit_count: Option<usize>` in `RoomPlanInput`, durchgereicht an `split_by_area` |
| `single-loop/tests/unit/verlegeplan-*.test.ts` | Unit-Tests für survey, panel, auswertung, planner |

---

### Task 1: Thermik-Stand auf `thermal-port` parken

**Files:**
- Branch: `thermal-port` (neu)
- Betroffen: `single-loop/raum.html`, `single-loop/src/raum-main.ts` (modifiziert), `single-loop/src/thermal.ts` (untracked)

**Interfaces:** keine — reine Git-Operation.

- [ ] **Step 1: Stand prüfen**

```bash
git -C /Volumes/external/TobiCodetEndlichWieder/Zaene status --short
```

Expected: `M single-loop/raum.html`, `M single-loop/src/raum-main.ts`, `?? single-loop/src/thermal.ts` — dazu die zwei fremden Stände aus den Global Constraints. Nur die drei erstgenannten gehören zu diesem Task.

- [ ] **Step 2: Branch anlegen und genau die drei Dateien committen**

```bash
cd /Volumes/external/TobiCodetEndlichWieder/Zaene
git checkout -b thermal-port
git add single-loop/raum.html single-loop/src/raum-main.ts single-loop/src/thermal.ts
git commit -m "wip(single-loop): thermal port parked before the verlegeplan marriage

Uncommitted state from a parallel session: thermal.ts (ported heat model)
plus heatmap UI in raum.html/raum-main.ts. Parked so the marriage of the
certified solver into the old tool's modality starts from a clean tree;
this comes back as its own step afterwards, on top of the new UI."
```

- [ ] **Step 3: Zurück auf main, Baum verifizieren**

```bash
git checkout main
git status --short
ls single-loop/src/thermal.ts 2>&1
```

Expected: `raum.html` und `raum-main.ts` stehen wieder auf dem committeten Stand (`fb1ad09`), `thermal.ts` existiert nicht mehr im Baum. Übrig bleiben nur die zwei fremden Stände.

- [ ] **Step 4: App läuft noch**

```bash
npm --prefix single-loop run typecheck && npm --prefix single-loop run test
```

Expected: beide grün (der committete Stand kennt keine Thermik).

---

### Task 2: Rust — `circuit_count` als Override der Feldaufteilung

**Files:**
- Modify: `single-loop/solver/src/circuit/plan.rs` (Struct `RoomPlanInput`, Funktion `plan_room`)
- Test: `single-loop/solver/tests/circuit_wintergarten.rs`

**Interfaces:**
- Consumes: `split_by_area(&RectifiedRoom, wanted: usize) -> Vec<Field>` (existiert, `src/circuit/room.rs`).
- Produces: `RoomPlanInput.circuit_count: Option<usize>` — Wire-Name `circuitCount`, optional, `null`/fehlend = auto. Task 4 (panel.ts) verlässt sich auf genau diesen Namen.

- [ ] **Step 1: Failing Test schreiben**

In `single-loop/solver/tests/circuit_wintergarten.rs` ans Dateiende:

```rust
#[test]
fn the_circuit_count_override_is_obeyed_by_the_field_split() {
    use single_loop_solver::circuit::{RoomPlanInput, plan_room};

    // Auto on this room at 150 mm gives 3 fields (see the test above).
    // Forcing 4 must yield exactly 4 attempted fields: every one either a
    // certified circuit or an honest entry in `refused` — never silently
    // fewer.
    let plan = plan_room(RoomPlanInput {
        ring: measured_ring(),
        manifold: None,
        fill_spacing_mm: 150.0,
        wall_clearance_mm: 75.0,
        edge_band_mm: 300.0,
        circuit_count: Some(4),
    })
    .expect("this room plans");
    assert_eq!(
        plan.circuits.len() + plan.refused.len(),
        4,
        "four fields were forced; got {} circuits and {} refusals",
        plan.circuits.len(),
        plan.refused.len()
    );
}
```

Zusätzlich in den **bestehenden** Test `the_whole_room_plans_around_a_manifold_in_the_notch` das neue Feld einfügen: `circuit_count: None,` (sonst kompiliert er nicht mehr — das ist der eigentliche RED-Beweis).

- [ ] **Step 2: RED verifizieren**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_wintergarten 2>&1 | grep -E "^error" | head -3
```

Expected: `error[E0560]`/`E0063` — `circuit_count` existiert im Struct noch nicht.

- [ ] **Step 3: Implementierung**

In `single-loop/solver/src/circuit/plan.rs`, Struct `RoomPlanInput`, nach dem Feld `edge_band_mm`:

```rust
    /// Forces how many fill circuits the room is cut into. `None` lets the
    /// area arithmetic decide (`area / spacing / 100 m`, rounded up). The
    /// override reaches only the field split — every field still has to
    /// certify on its own, and one that cannot lands in `refused` rather
    /// than being silently dropped or merged.
    #[serde(default)]
    pub circuit_count: Option<usize>,
```

In `plan_room`, die Zeile

```rust
    let wanted = (theoretical_mm / MAX_CIRCUIT_LENGTH_MM).ceil().max(1.0) as usize;
```

ersetzen durch:

```rust
    let wanted = input
        .circuit_count
        .unwrap_or_else(|| (theoretical_mm / MAX_CIRCUIT_LENGTH_MM).ceil().max(1.0) as usize)
        .max(1);
```

- [ ] **Step 4: GREEN verifizieren**

```bash
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_wintergarten 2>&1 | tail -3
cargo clippy --manifest-path single-loop/solver/Cargo.toml --all-targets 2>&1 | grep -cE "^(warning|error)"
```

Expected: alle Tests grün (der neue braucht ~2 min, er plant den Raum zweimal); Clippy-Zähler `0`.

- [ ] **Step 5: Commit**

```bash
git add single-loop/solver/src/circuit/plan.rs single-loop/solver/tests/circuit_wintergarten.rs
git commit -m "feat(single-loop): let the caller force the fill-circuit count

The old tool had auto/1/2/3; plan_room now honours it. The override reaches
only the field split -- every field still certifies on its own, and one that
cannot lands in refused rather than being dropped."
```

---

### Task 3: Modul-Extraktion — types, survey, sheet, planner

Reine Verschiebung plus **eine** Verhaltensänderung: `workerPlanner` bekommt `abort()`. Quelle ist der committete `src/raum-main.ts` (Stand `fb1ad09`, ohne Thermik).

**Files:**
- Create: `single-loop/src/verlegeplan/types.ts`, `single-loop/src/verlegeplan/survey.ts`, `single-loop/src/verlegeplan/sheet.ts`, `single-loop/src/verlegeplan/planner.ts`
- Modify: `single-loop/src/raum-main.ts` (importiert statt zu definieren)
- Test: `single-loop/tests/unit/verlegeplan-survey.test.ts`, `single-loop/tests/unit/verlegeplan-planner.test.ts`

**Interfaces:**
- Produces (spätere Tasks bauen exakt hierauf):
  - `types.ts`: `Pt {x,y}`, `Frame {origin,u,v: Pt}`, `RoomCircuit`, `RoomPlan`, `RoomPlanInput` (mit `circuitCount: number | null`), `Survey`
  - `survey.ts`: `ringFromSurvey(survey: Survey): Pt[]`
  - `sheet.ts`: `render(plan: RoomPlan, override?: { manifoldLocal?: Pt | null }): string`, `viewOf(plan, marginMm): View`, `toWorld(frame, local): Pt`, `toLocal(frame, world): Pt`, `INK: string[]`
  - `planner.ts`: `workerPlanner(factory: () => Worker): { plan(input: RoomPlanInput): Promise<RoomPlan>; abort(): void }`

- [ ] **Step 1: types.ts anlegen**

Inhalt: die Interfaces `Pt`, `RoomPlanInput`, `RoomCircuit`, `RoomPlan`, `Survey` **unverändert aus `raum-main.ts` ausschneiden** (Zeilen 4–61 des committeten Stands), plus zwei Ergänzungen:

```ts
export interface Frame {
  origin: Pt;
  u: Pt;
  v: Pt;
}
```

`RoomPlan.frame` wird `Frame` statt Inline-Typ, und `RoomPlanInput` bekommt:

```ts
  /** null = auto: die Flächenarithmetik entscheidet. Wire-Name des Solvers. */
  circuitCount: number | null;
```

- [ ] **Step 2: survey.ts anlegen**

`ringFromSurvey` unverändert aus `raum-main.ts` verschieben; Import `Pt`, `Survey` aus `./types`.

- [ ] **Step 3: sheet.ts anlegen**

Aus `raum-main.ts` verschieben: `NOPP_PITCH_MM`, `LARGE_NOPP_RADIUS_MM`, `SMALL_NOPP_RADIUS_MM`, `INK`, `toWorld`, `viewOf`, `polygon`, `noppen`, `render`. Zwei Änderungen:

```ts
/** world → local, exact inverse of toWorld: u and v are orthonormal. */
export function toLocal(frame: Frame, world: Pt): Pt {
  const dx = world.x - frame.origin.x;
  const dy = world.y - frame.origin.y;
  return { x: dx * frame.u.x + dy * frame.u.y, y: dx * frame.v.x + dy * frame.v.y };
}
```

und `render` bekommt den Override (für den billigen Verteiler-Marker ohne Lauf, Spec §4):

```ts
export function render(
  plan: RoomPlan,
  override: { manifoldLocal?: Pt | null } = {},
): string {
  const manifoldLocal =
    override.manifoldLocal !== undefined ? override.manifoldLocal : plan.manifoldLocal;
  // … im Funktionskörper überall `manifoldLocal` statt `plan.manifoldLocal`.
```

- [ ] **Step 4: planner.ts anlegen — mit Abbruch**

```ts
import type { RoomPlan, RoomPlanInput } from "./types";
import type { RoomWorkerRequest, RoomWorkerResponse } from "../worker/room-protocol";

export interface Planner {
  plan(input: RoomPlanInput): Promise<RoomPlan>;
  /** Kills the running worker; every pending promise rejects with AbortError. */
  abort(): void;
}

/**
 * One plan at a time, off the page's thread, abortable.
 *
 * A run takes minutes; starting a new one must not wait for the old. Abort
 * terminates the worker outright — wasm has no cancellation — and a fresh
 * worker is built for the next run. Each request carries an id, so a late
 * answer from a dead worker can never resolve a newer request.
 */
export function workerPlanner(factory: () => Worker): Planner {
  let worker: Worker | null = null;
  let next = 0;
  const pending = new Map<
    number,
    { resolve: (plan: RoomPlan) => void; reject: (why: Error) => void }
  >();

  const fail = (why: string) => {
    for (const [id, waiting] of pending) {
      pending.delete(id);
      waiting.reject(new Error(why));
    }
  };

  const attach = (target: Worker) => {
    target.onerror = (event) => fail(event.message || "Der Rechen-Worker ist abgestürzt");
    target.onmessageerror = () => fail("Der Rechen-Worker hat eine unlesbare Antwort geschickt");
    target.onmessage = (event: MessageEvent<RoomWorkerResponse>) => {
      const message = event.data;
      const waiting = pending.get(message.id);
      if (!waiting) return;
      pending.delete(message.id);
      if (message.ok) waiting.resolve(message.plan as RoomPlan);
      else waiting.reject(new Error(message.message));
    };
  };

  return {
    plan(input) {
      if (!worker) {
        worker = factory();
        attach(worker);
      }
      return new Promise<RoomPlan>((resolve, reject) => {
        const id = ++next;
        pending.set(id, { resolve, reject });
        worker!.postMessage({ id, input } satisfies RoomWorkerRequest);
      });
    },
    abort() {
      if (!worker) return;
      worker.terminate();
      worker = null;
      const aborted = [...pending.values()];
      pending.clear();
      for (const waiting of aborted) {
        waiting.reject(new DOMException("Abgebrochen", "AbortError"));
      }
    },
  };
}
```

- [ ] **Step 5: raum-main.ts auf die Module umstellen**

Alle verschobenen Definitionen löschen, stattdessen importieren. `mountRoomPage` ruft `workerPlanner(() => new Worker(new URL("./worker/room.worker.ts", import.meta.url), { type: "module" }))`. `deps.plan`-Aufrufe ergänzen `circuitCount: null`. Verhalten sonst identisch.

- [ ] **Step 6: Failing Tests schreiben**

`single-loop/tests/unit/verlegeplan-survey.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ringFromSurvey } from "../../src/verlegeplan/survey";

const square = {
  pts: [
    { id: "A", x: 0, y: 0 },
    { id: "B", x: 1000, y: 0 },
    { id: "C", x: 1000, y: 1000 },
    { id: "D", x: 0, y: 1000 },
  ],
  walls: [
    ["A", "B"],
    ["B", "C"],
    ["C", "D"],
    ["D", "A"],
  ] as [string, string][],
};

describe("ringFromSurvey", () => {
  it("walks a closed ring in wall order", () => {
    const ring = ringFromSurvey(square);
    expect(ring).toHaveLength(4);
    expect(ring[0]).toEqual({ x: 0, y: 0 });
  });

  it("rejects an open ring loudly", () => {
    const open = { ...square, walls: square.walls.slice(0, 3) };
    expect(() => ringFromSurvey(open)).toThrowError(/Ring ist offen/);
  });
});
```

`single-loop/tests/unit/verlegeplan-planner.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { workerPlanner } from "../../src/verlegeplan/planner";

function fakeWorker() {
  const worker = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    onmessageerror: null as (() => void) | null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  };
  return worker;
}

describe("workerPlanner", () => {
  it("resolves the request whose id answers", async () => {
    const worker = fakeWorker();
    const planner = workerPlanner(() => worker as unknown as Worker);
    const promise = planner.plan({} as never);
    worker.onmessage!({ data: { id: 1, ok: true, plan: { circuits: [] } } } as never);
    await expect(promise).resolves.toEqual({ circuits: [] });
  });

  it("abort terminates the worker and rejects pending runs", async () => {
    const worker = fakeWorker();
    const planner = workerPlanner(() => worker as unknown as Worker);
    const promise = planner.plan({} as never);
    planner.abort();
    expect(worker.terminate).toHaveBeenCalledOnce();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("a late answer from a dead worker resolves nothing", async () => {
    const worker = fakeWorker();
    const planner = workerPlanner(() => worker as unknown as Worker);
    const first = planner.plan({} as never);
    planner.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    // the dead worker's handler still exists; answering on it must be a no-op
    expect(() =>
      worker.onmessage!({ data: { id: 1, ok: true, plan: {} } } as never),
    ).not.toThrow();
  });
});
```

- [ ] **Step 7: RED, dann GREEN**

```bash
npm --prefix single-loop run test 2>&1 | tail -4
npm --prefix single-loop run typecheck
```

Erst laufen lassen, Fehlermeldungen beheben (Import-Pfade, vergessene Exporte), bis beide grün.

- [ ] **Step 8: Commit**

```bash
git add single-loop/src/verlegeplan single-loop/src/raum-main.ts single-loop/tests/unit/verlegeplan-survey.test.ts single-loop/tests/unit/verlegeplan-planner.test.ts
git commit -m "refactor(single-loop): split raum-main into verlegeplan modules, abortable planner

types/survey/sheet move verbatim; the one behaviour change is abort() on the
planner -- a run takes minutes and a new start must kill the old worker, not
queue behind it. A late answer from a dead worker can resolve nothing."
```

---

### Task 4: Panel und Markup — die alte Seitenleiste, ehrlich verdrahtet

**Files:**
- Rewrite: `single-loop/raum.html`
- Create: `single-loop/src/verlegeplan/panel.ts`
- Modify: `single-loop/src/styles.css` (Panel-, veraltet-, Print-CSS anhängen)
- Test: `single-loop/tests/unit/verlegeplan-panel.test.ts`

**Interfaces:**
- Consumes: `RoomPlanInput`, `Pt` aus `./types` (Task 3).
- Produces (Task 6 verdrahtet genau das):
  - `mountPanel(deps: { onChange(): void; onImport(file: File): void; onManifoldEntry(world: Pt): void }): PanelHandle`
  - `PanelHandle.readInput(ring: Pt[], manifold: Pt | null): RoomPlanInput`
  - `PanelHandle.rectRing(): Pt[]` — Rechteck aus Breite/Tiefe
  - `PanelHandle.setSurveyName(name: string | null): void` — sperrt/entsperrt Breite/Tiefe
  - `PanelHandle.setManifoldFields(world: Pt | null): void`

- [ ] **Step 1: raum.html neu schreiben**

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Verlegeplan – Noppenplatte</title>
  </head>
  <body>
    <div class="app">
      <aside class="side">
        <h1>Verlegeplan Fußbodenheizung</h1>
        <p class="eyebrow">BEKOTEC-EN 23 FI 30 · Rohr 16 mm · Noppenraster 75 mm</p>
        <button id="printBtn" class="pbtn" onclick="window.print()">Drucken / PDF</button>

        <h2>Raum</h2>
        <button id="impBtn" class="pbtn">Raum importieren …</button>
        <input id="impFile" type="file" accept="application/json,.json" hidden />
        <p class="hint" id="impName"></p>
        <label>Breite <input id="rectW" type="number" min="1500" step="75" value="3000" /> mm</label>
        <label>Tiefe <input id="rectH" type="number" min="1500" step="75" value="2400" /> mm</label>

        <h2>Verlegung</h2>
        <label>Verlegeabstand
          <select id="spacing">
            <option value="75">75 mm</option>
            <option value="150" selected>150 mm</option>
            <option value="225">225 mm</option>
            <option value="300">300 mm</option>
          </select>
        </label>
        <label>Randabstand <input id="clearance" type="number" min="75" step="25" value="75" /> mm</label>
        <p class="fixed">Rohr-Ø <strong>16 mm</strong> · Biegeradius <strong>80 mm</strong> (Profil, fix)</p>

        <h2>Randzone (Fenster)</h2>
        <label>reservierter Streifen <input id="band" type="number" min="0" step="75" value="300" /> mm</label>
        <p class="hint">Streifen wird freigehalten — das Band selbst ist noch nicht verlegbar.</p>

        <h2>Heizkreise</h2>
        <div class="seg" id="countSeg">
          <button data-n="auto" class="on">Auto</button>
          <button data-n="1">1</button>
          <button data-n="2">2</button>
          <button data-n="3">3</button>
        </div>
        <p class="fixed">max. Kreislänge <strong>100 m</strong> (fix)</p>

        <h2>Verteiler</h2>
        <label>x <input id="mfx" type="number" step="10" /> mm</label>
        <label>y <input id="mfy" type="number" step="10" /> mm</label>
        <p class="hint">Klick in den Plan setzt den Verteiler und plant neu.</p>

        <button id="plan" class="pbtn primary">Neu planen</button>
        <p class="banner" id="banner">Raum wird geladen …</p>
      </aside>

      <main>
        <div id="plot" aria-label="Verlegeplan"></div>
        <div id="badge" class="badge"></div>
        <section id="cards" class="cards"></section>
        <section id="notes" class="notes"></section>
      </main>
    </div>
    <script type="module" src="/src/raum-main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: CSS anhängen**

An `single-loop/src/styles.css` (Struktur und Ton aus dem alten `verlegeplan.html` gehoben, kondensiert):

```css
/* ---- Verlegetool: die alte Modalität ---------------------------------- */
.app { display: grid; grid-template-columns: 340px 1fr; min-height: 100vh; }
.side { padding: 1rem; border-right: 1px solid #e2ddd5; overflow-y: auto; }
.side h1 { font-size: 1.15rem; margin: 0 0 0.2rem; }
.side h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em;
  color: #6b6257; margin: 1.1rem 0 0.4rem; border-top: 1px solid #eee8df; padding-top: 0.8rem; }
.side label { display: flex; justify-content: space-between; align-items: center;
  gap: 0.5rem; margin: 0.35rem 0; font-size: 0.9rem; }
.side input[type="number"], .side select { width: 7.5rem; }
.pbtn { width: 100%; padding: 0.45rem; margin: 0.3rem 0; cursor: pointer; }
.pbtn.primary { font-weight: 650; }
.fixed, .hint { font-size: 0.8rem; color: #6b6257; margin: 0.3rem 0; }
.seg button { padding: 0.3rem 0.7rem; cursor: pointer; }
.seg button.on { background: #111; color: #fff; }
.banner { font-size: 0.85rem; min-height: 2.2em; }
main { padding: 1rem; }
.badge { font-weight: 650; margin: 0.5rem 0; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 0.6rem; }
.cards .card { border: 1px solid #e2ddd5; border-radius: 0.4rem; padding: 0.55rem 0.7rem; font-size: 0.85rem; }
.cards .card .big { font-size: 1.25rem; font-weight: 650; display: block; }
.notes { margin-top: 0.8rem; font-size: 0.85rem; color: #4b4238; }
.notes li { margin: 0.15rem 0; }
#plot svg { width: 100%; height: auto; cursor: crosshair; }
#plot.stale svg { opacity: 0.45; filter: grayscale(0.6); }
#plot.stale { position: relative; }
#plot.stale::after { content: "Plan veraltet — Neu planen"; position: absolute; inset: 0;
  display: grid; place-content: center; font-weight: 650; color: #7a1f1f; pointer-events: none; }
@media print {
  .side { display: none; }
  .app { grid-template-columns: 1fr; }
  #plot.stale::after { content: none; }
}
```

- [ ] **Step 3: Failing Test für panel.ts schreiben**

`single-loop/tests/unit/verlegeplan-panel.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountPanel } from "../../src/verlegeplan/panel";

const MARKUP = `
  <button id="impBtn"></button><input id="impFile" type="file" hidden /><p id="impName"></p>
  <input id="rectW" type="number" value="3000" /><input id="rectH" type="number" value="2400" />
  <select id="spacing"><option value="75">75</option><option value="150" selected>150</option></select>
  <input id="clearance" type="number" value="75" />
  <input id="band" type="number" value="300" />
  <div id="countSeg"><button data-n="auto" class="on"></button><button data-n="2"></button></div>
  <input id="mfx" type="number" /><input id="mfy" type="number" />
`;

describe("mountPanel", () => {
  beforeEach(() => {
    document.body.innerHTML = MARKUP;
  });

  it("maps the sidebar to RoomPlanInput", () => {
    const panel = mountPanel({ onChange: vi.fn(), onImport: vi.fn(), onManifoldEntry: vi.fn() });
    const input = panel.readInput([{ x: 0, y: 0 }], { x: 1, y: 2 });
    expect(input).toMatchObject({
      fillSpacingMm: 150,
      wallClearanceMm: 75,
      edgeBandMm: 300,
      circuitCount: null,
      manifold: { x: 1, y: 2 },
    });
  });

  it("count segment: klick auf 2 liefert circuitCount 2, Auto wieder null", () => {
    const panel = mountPanel({ onChange: vi.fn(), onImport: vi.fn(), onManifoldEntry: vi.fn() });
    document.querySelector<HTMLButtonElement>('[data-n="2"]')!.click();
    expect(panel.readInput([], null).circuitCount).toBe(2);
    document.querySelector<HTMLButtonElement>('[data-n="auto"]')!.click();
    expect(panel.readInput([], null).circuitCount).toBeNull();
  });

  it("meldet jede Eingabeänderung als onChange (veraltet)", () => {
    const onChange = vi.fn();
    mountPanel({ onChange, onImport: vi.fn(), onManifoldEntry: vi.fn() });
    const spacing = document.getElementById("spacing")!;
    spacing.dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector<HTMLButtonElement>('[data-n="2"]')!.click();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("rectRing baut das Rechteck aus Breite/Tiefe", () => {
    const panel = mountPanel({ onChange: vi.fn(), onImport: vi.fn(), onManifoldEntry: vi.fn() });
    expect(panel.rectRing()).toEqual([
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 2400 },
      { x: 0, y: 2400 },
    ]);
  });

  it("Survey-Name sperrt Breite/Tiefe, Entfernen entsperrt", () => {
    const panel = mountPanel({ onChange: vi.fn(), onImport: vi.fn(), onManifoldEntry: vi.fn() });
    panel.setSurveyName("Wintergarten");
    expect(document.getElementById("rectW")).toHaveProperty("disabled", true);
    panel.setSurveyName(null);
    expect(document.getElementById("rectW")).toHaveProperty("disabled", false);
  });

  it("x/y-Eingabe meldet onManifoldEntry mit Weltkoordinaten", () => {
    const onManifoldEntry = vi.fn();
    mountPanel({ onChange: vi.fn(), onImport: vi.fn(), onManifoldEntry });
    const mfx = document.getElementById("mfx") as HTMLInputElement;
    const mfy = document.getElementById("mfy") as HTMLInputElement;
    mfx.value = "7420";
    mfy.value = "-1850";
    mfy.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onManifoldEntry).toHaveBeenCalledWith({ x: 7420, y: -1850 });
  });
});
```

- [ ] **Step 4: RED verifizieren**

```bash
npm --prefix single-loop run test 2>&1 | tail -4
```

Expected: FAIL — `mountPanel` existiert nicht.

- [ ] **Step 5: panel.ts implementieren**

```ts
import type { Pt, RoomPlanInput } from "./types";

export interface PanelDeps {
  /** Jede Eingabeänderung — der Aufrufer markiert das Blatt „veraltet". */
  onChange(): void;
  onImport(file: File): void;
  /** x/y-Felder wurden von Hand gesetzt (Weltkoordinaten des Aufmaßes). */
  onManifoldEntry(world: Pt): void;
}

export interface PanelHandle {
  readInput(ring: Pt[], manifold: Pt | null): RoomPlanInput;
  rectRing(): Pt[];
  setSurveyName(name: string | null): void;
  setManifoldFields(world: Pt | null): void;
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing element #${id}`);
  return found as T;
}

function numberOf(id: string): number {
  return Number(element<HTMLInputElement | HTMLSelectElement>(id).value);
}

/**
 * Die Seitenleiste. Sie kennt weder Worker noch Blatt: sie liest Eingaben,
 * meldet Änderungen, und baut aus Breite/Tiefe notfalls den Rechteck-Ring.
 * Was der Solver nicht kann, steht hier gar nicht erst als Eingabe.
 */
export function mountPanel(deps: PanelDeps): PanelHandle {
  let circuitCount: number | null = null;

  const seg = element<HTMLDivElement>("countSeg");
  seg.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest("button");
    if (!button) return;
    for (const other of seg.querySelectorAll("button")) other.classList.remove("on");
    button.classList.add("on");
    const n = button.dataset.n;
    circuitCount = n === "auto" || n === undefined ? null : Number(n);
    deps.onChange();
  });

  for (const id of ["rectW", "rectH", "spacing", "clearance", "band"]) {
    element(id).addEventListener("change", () => deps.onChange());
  }

  const manifoldEntry = () => {
    const x = numberOf("mfx");
    const y = numberOf("mfy");
    if (Number.isFinite(x) && Number.isFinite(y)) deps.onManifoldEntry({ x, y });
  };
  element("mfx").addEventListener("change", manifoldEntry);
  element("mfy").addEventListener("change", manifoldEntry);

  element("impBtn").addEventListener("click", () => element<HTMLInputElement>("impFile").click());
  element<HTMLInputElement>("impFile").addEventListener("change", (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) deps.onImport(file);
  });

  return {
    readInput: (ring, manifold) => ({
      ring,
      manifold,
      fillSpacingMm: numberOf("spacing"),
      wallClearanceMm: numberOf("clearance"),
      edgeBandMm: numberOf("band"),
      circuitCount,
    }),
    rectRing: () => {
      const width = numberOf("rectW");
      const height = numberOf("rectH");
      return [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
      ];
    },
    setSurveyName: (name) => {
      element("impName").textContent = name ? `Aufmaß: ${name}` : "";
      element<HTMLInputElement>("rectW").disabled = name !== null;
      element<HTMLInputElement>("rectH").disabled = name !== null;
    },
    setManifoldFields: (world) => {
      element<HTMLInputElement>("mfx").value = world ? String(Math.round(world.x)) : "";
      element<HTMLInputElement>("mfy").value = world ? String(Math.round(world.y)) : "";
    },
  };
}
```

- [ ] **Step 6: GREEN + Typecheck**

```bash
npm --prefix single-loop run test 2>&1 | tail -4
npm --prefix single-loop run typecheck
```

Hinweis: `raum-main.ts` kompiliert in diesem Zwischenstand noch gegen das alte Markup (`#circuits`, `#facts` fehlen jetzt) — Task 6 zieht nach. Damit der Typecheck grün bleibt, in diesem Task `raum-main.ts`s `mountRoomPage`-Aufrufe der fehlenden Elemente **noch nicht** anfassen; nur wenn der Dev-Server benutzt wird, wirft die Seite bis Task 6 einen `missing element`-Fehler. Das ist in Ordnung — committet wird ein grüner Test-/Typecheck-Stand.

- [ ] **Step 7: Commit**

```bash
git add single-loop/raum.html single-loop/src/verlegeplan/panel.ts single-loop/src/styles.css single-loop/tests/unit/verlegeplan-panel.test.ts
git commit -m "feat(single-loop): the old sidebar, honestly wired

Every control maps to a RoomPlanInput field or is a fixed display: spacing
offers only the 75 mm lattice multiples, pipe diameter and bend radius are
profile facts, max loop length is the 100 m the certificate enforces. The
count segment is a real override; changes mark the sheet stale instead of
starting minute-long runs."
```

---

### Task 5: Auswertung — Badge, Karten, Notes aus dem Zertifikat

**Files:**
- Create: `single-loop/src/verlegeplan/auswertung.ts`
- Test: `single-loop/tests/unit/verlegeplan-auswertung.test.ts`

**Interfaces:**
- Consumes: `RoomPlan`, `RoomCircuit` aus `./types`, `INK` aus `./sheet`.
- Produces: `showAuswertung(plan: RoomPlan): void` — schreibt `#badge`, `#cards`, `#notes`. Task 6 ruft genau das.

- [ ] **Step 1: Failing Test schreiben**

`single-loop/tests/unit/verlegeplan-auswertung.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { showAuswertung } from "../../src/verlegeplan/auswertung";
import type { RoomPlan } from "../../src/verlegeplan/types";

const plan: RoomPlan = {
  roomLocal: [],
  measuredLocal: [],
  bandInnerLocal: [{ x: 0, y: 0 }],
  manifoldLocal: { x: 1, y: 2 },
  frame: { origin: { x: 0, y: 0 }, u: { x: 1, y: 0 }, v: { x: 0, y: 1 } },
  circuits: [
    {
      rectLocal: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } },
      pathD: "M0 0",
      pipeSpacingMm: 150,
      lanes: 7,
      totalLengthMm: 43500,
      minBendRadiusMm: 80,
      minCenterDistanceMm: 66,
      penaltySumMm: 0,
    },
  ],
  refused: ["field at (1, 2): zu lang"],
  noppCount: 6552,
  measuredAreaM2: 29.45,
  rectifiedAreaM2: 28.08,
  fillAreaM2: 21.17,
  droppedWalls: 4,
};

describe("showAuswertung", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="badge"></div><section id="cards"></section><section id="notes"></section>`;
  });

  it("Badge nennt Kreise und Gesamtlänge", () => {
    showAuswertung(plan);
    expect(document.getElementById("badge")!.textContent).toContain("1 Heizkreis");
    expect(document.getElementById("badge")!.textContent).toContain("43.5 m");
  });

  it("Kreis-Karte trägt die Zertifikatswerte", () => {
    showAuswertung(plan);
    const cards = document.getElementById("cards")!.textContent!;
    expect(cards).toContain("43.5 m");
    expect(cards).toContain("80");
    expect(cards).toContain("zertifiziert");
    expect(cards).toContain("6552");
  });

  it("Notes zeigen jede Ablehnung und den Randzonen-Hinweis", () => {
    showAuswertung(plan);
    const notes = document.getElementById("notes")!.textContent!;
    expect(notes).toContain("zu lang");
    expect(notes).toContain("Randzone");
  });

  it("keine Häkchen-Selbstprüfungen", () => {
    showAuswertung(plan);
    expect(document.body.textContent).not.toContain("✓");
  });
});
```

- [ ] **Step 2: RED verifizieren**

```bash
npm --prefix single-loop run test 2>&1 | tail -4
```

Expected: FAIL — Modul fehlt.

- [ ] **Step 3: Implementieren**

```ts
import { INK } from "./sheet";
import type { RoomPlan } from "./types";

function metres(millimetres: number): string {
  return `${(millimetres / 1000).toFixed(1)} m`;
}

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing element #${id}`);
  return found;
}

/**
 * Badge, Karten und Notes — ausschließlich aus dem RoomPlan. Hier wird nichts
 * nachgerechnet und nichts selbst geprüft: eine Zahl erscheint, weil das
 * Zertifikat des Solvers sie liefert, oder gar nicht.
 */
export function showAuswertung(plan: RoomPlan): void {
  const total = plan.circuits.reduce((sum, circuit) => sum + circuit.totalLengthMm, 0);
  element("badge").textContent =
    `${plan.circuits.length} Heizkreis${plan.circuits.length === 1 ? "" : "e"} · ${metres(total)}`;

  const circuitCards = plan.circuits.map((circuit, index) => {
    const ink = INK[index % INK.length];
    return `<div class="card" style="border-left:4px solid ${ink}">
      <span class="big">${metres(circuit.totalLengthMm)}</span>
      Kreis ${index + 1} · ${circuit.pipeSpacingMm.toFixed(0)} mm · ${circuit.lanes} Bahnen<br />
      Biegeradius ${circuit.minBendRadiusMm.toFixed(0)} mm ·
      Mindestabstand ${circuit.minCenterDistanceMm.toFixed(0)} mm<br />
      Strafe ${circuit.penaltySumMm.toFixed(0)} mm · <strong>zertifiziert</strong>
    </div>`;
  });
  const roomCards = [
    `<div class="card"><span class="big">${plan.rectifiedAreaM2.toFixed(2)} m²</span>
      begradigt (gemessen ${plan.measuredAreaM2.toFixed(2)} m²)</div>`,
    `<div class="card"><span class="big">${plan.fillAreaM2.toFixed(2)} m²</span>
      Füllfläche nach Randzone</div>`,
    `<div class="card"><span class="big">${plan.noppCount}</span>
      Noppen, ein Feld für alle Kreise</div>`,
  ];
  element("cards").innerHTML = [...circuitCards, ...roomCards].join("");

  const notes: string[] = [];
  for (const refusal of plan.refused) notes.push(`Nicht belegt: ${refusal}`);
  if (plan.bandInnerLocal.length > 0) {
    notes.push("Randzone reserviert — der Streifen ist freigehalten, das Band selbst noch nicht verlegt.");
  }
  if (plan.droppedWalls > 0) {
    notes.push(`${plan.droppedWalls} kurze Wände als Aufmaß-Artefakte verworfen.`);
  }
  element("notes").innerHTML = notes.length
    ? `<ul>${notes.map((note) => `<li>${note}</li>`).join("")}</ul>`
    : "";
}
```

- [ ] **Step 4: GREEN + Typecheck**

```bash
npm --prefix single-loop run test 2>&1 | tail -4
npm --prefix single-loop run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add single-loop/src/verlegeplan/auswertung.ts single-loop/tests/unit/verlegeplan-auswertung.test.ts
git commit -m "feat(single-loop): cards and notes read the certificate, nothing else

Badge, per-circuit cards and the notes list come straight from RoomPlan --
refusals always visible, no recomputation, and none of the old checkmark
self-praise."
```

---

### Task 6: Verdrahtung — Lauf-Lebenszyklus, veraltet, Klick ↔ x/y

**Files:**
- Rewrite: `single-loop/src/raum-main.ts`
- Test: bestehende Suiten + Browser-Verifikation (Step 4)

**Interfaces:**
- Consumes: alles aus Task 3–5: `mountPanel`, `showAuswertung`, `workerPlanner`, `render`, `toWorld`, `toLocal`, `ringFromSurvey`.
- Produces: `mountVerlegetool(deps)` — exportiert für Tests, Selbststart wie bisher.
- Test: `single-loop/tests/unit/verlegeplan-verdrahtung.test.ts` (Spec §9: veraltet-Logik, x/y-Synchronisation)

- [ ] **Step 1: raum-main.ts neu schreiben**

```ts
import "./styles.css";
import { showAuswertung } from "./verlegeplan/auswertung";
import { mountPanel } from "./verlegeplan/panel";
import { type Planner, workerPlanner } from "./verlegeplan/planner";
import { render, toLocal, toWorld } from "./verlegeplan/sheet";
import { ringFromSurvey } from "./verlegeplan/survey";
import type { Pt, RoomPlan, Survey } from "./verlegeplan/types";

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing element #${id}`);
  return found;
}

export interface VerlegetoolDeps {
  planner: Planner;
  loadSurvey: () => Promise<Survey>;
}

/**
 * Die Verdrahtung, und nur die: Panel und Auswertung kennen einander nicht.
 *
 * Lauf-Lebenszyklus (Spec §5): Eingaben markieren das Blatt „veraltet";
 * gerechnet wird nur über den Button oder den Verteiler-Klick. Ein neuer
 * Start bricht den laufenden Lauf ab (Worker-Terminate), und die Statuszeile
 * zählt die Sekunden mit — die Wartezeit wird gezeigt, nicht kaschiert.
 */
export function mountVerlegetool(deps: VerlegetoolDeps): void {
  const banner = element("banner");
  const plot = element("plot");

  let ring: Pt[] = [];
  let manifold: Pt | null = null;
  let lastPlan: RoomPlan | null = null;
  let ticker: number | undefined;

  const panel = mountPanel({
    onChange: () => plot.classList.add("stale"),
    onImport: (file) => {
      void file.text().then((text) => {
        try {
          const survey = JSON.parse(text) as Survey;
          ring = ringFromSurvey(survey);
          manifold = null;
          panel.setSurveyName(survey.name ?? file.name);
          panel.setManifoldFields(null);
          replan();
        } catch (error) {
          banner.textContent = `${error}`;
        }
      });
    },
    onManifoldEntry: (world) => {
      manifold = world;
      plot.classList.add("stale");
      if (lastPlan) {
        plot.innerHTML = render(lastPlan, { manifoldLocal: toLocal(lastPlan.frame, world) });
      }
    },
  });

  function startTicker(): void {
    const startedAt = Date.now();
    stopTicker();
    ticker = window.setInterval(() => {
      banner.textContent = `rechnet … ${Math.round((Date.now() - startedAt) / 1000)} s`;
    }, 1000);
    banner.textContent = "rechnet …";
  }
  function stopTicker(): void {
    if (ticker !== undefined) window.clearInterval(ticker);
    ticker = undefined;
  }

  function replan(): void {
    if (ring.length === 0) {
      ring = panel.rectRing();
    }
    deps.planner.abort();
    startTicker();
    deps.planner
      .plan(panel.readInput(ring, manifold))
      .then((plan) => {
        stopTicker();
        lastPlan = plan;
        plot.classList.remove("stale");
        plot.innerHTML = render(plan);
        showAuswertung(plan);
        banner.textContent = "";
        panel.setManifoldFields(
          plan.manifoldLocal ? toWorld(plan.frame, plan.manifoldLocal) : null,
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        stopTicker();
        banner.textContent = `${error}`;
      });
  }

  // Klick aufs Blatt: Verteiler dorthin, sofort neu planen (bewusste Aktion).
  plot.addEventListener("click", (event) => {
    const sheet = plot.querySelector("svg");
    if (!sheet || !lastPlan) return;
    const box = sheet.getBoundingClientRect();
    const viewBox = sheet.getAttribute("viewBox")!.split(" ").map(Number);
    if (viewBox.length !== 4 || viewBox.some(Number.isNaN)) return;
    const [minX, minY, width, height] = viewBox as [number, number, number, number];
    const localX = minX + ((event.clientX - box.left) / box.width) * width;
    const flipped = minY + ((event.clientY - box.top) / box.height) * height;
    const localY = 2 * minY + height - flipped;
    manifold = toWorld(lastPlan.frame, { x: localX, y: localY });
    panel.setManifoldFields(manifold);
    replan();
  });

  element("plan").addEventListener("click", replan);

  void (async () => {
    try {
      const survey = await deps.loadSurvey();
      ring = ringFromSurvey(survey);
      panel.setSurveyName(survey.name ?? "Aufmaß");
    } catch {
      ring = panel.rectRing();
      panel.setSurveyName(null);
    }
    replan();
  })();
}

if (typeof document !== "undefined" && document.getElementById("plot")) {
  mountVerlegetool({
    planner: workerPlanner(
      () => new Worker(new URL("./worker/room.worker.ts", import.meta.url), { type: "module" }),
    ),
    loadSurvey: async () => {
      const response = await fetch("./fixtures/rooms/wintergarten-2026-08-02.json");
      if (!response.ok) throw new Error("kein Standard-Aufmaß");
      return (await response.json()) as Survey;
    },
  });
}
```

- [ ] **Step 2: Verdrahtungs-Test schreiben und grün machen**

`single-loop/tests/unit/verlegeplan-verdrahtung.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { mountVerlegetool } from "../../src/raum-main";
import type { RoomPlan } from "../../src/verlegeplan/types";

const MARKUP = `
  <button id="impBtn"></button><input id="impFile" type="file" hidden /><p id="impName"></p>
  <input id="rectW" type="number" value="3000" /><input id="rectH" type="number" value="2400" />
  <select id="spacing"><option value="150" selected>150</option></select>
  <input id="clearance" type="number" value="75" /><input id="band" type="number" value="0" />
  <div id="countSeg"><button data-n="auto" class="on"></button></div>
  <input id="mfx" type="number" /><input id="mfy" type="number" />
  <button id="plan"></button><p id="banner"></p>
  <div id="plot"></div><div id="badge"></div><section id="cards"></section><section id="notes"></section>
`;

const rect: RoomPlan = {
  roomLocal: [
    { x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2400 }, { x: 0, y: 2400 },
  ],
  measuredLocal: [
    { x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2400 }, { x: 0, y: 2400 },
  ],
  bandInnerLocal: [],
  manifoldLocal: { x: 1500, y: 100 },
  frame: { origin: { x: 0, y: 0 }, u: { x: 1, y: 0 }, v: { x: 0, y: 1 } },
  circuits: [],
  refused: [],
  noppCount: 1,
  measuredAreaM2: 7.2,
  rectifiedAreaM2: 7.2,
  fillAreaM2: 7.2,
  droppedWalls: 0,
};

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("mountVerlegetool", () => {
  beforeEach(() => {
    document.body.innerHTML = MARKUP;
  });

  it("Lauf hebt veraltet auf; Eingabeänderung setzt es wieder", async () => {
    mountVerlegetool({
      planner: { plan: () => Promise.resolve(rect), abort: () => {} },
      loadSurvey: () => Promise.reject(new Error("kein Aufmaß")),
    });
    await flush();
    const plot = document.getElementById("plot")!;
    expect(plot.classList.contains("stale")).toBe(false);
    expect(plot.querySelector("svg")).toBeTruthy();
    document.getElementById("spacing")!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(plot.classList.contains("stale")).toBe(true);
  });

  it("nach dem Lauf stehen die Verteiler-Weltkoordinaten in x/y", async () => {
    mountVerlegetool({
      planner: { plan: () => Promise.resolve(rect), abort: () => {} },
      loadSurvey: () => Promise.reject(new Error("kein Aufmaß")),
    });
    await flush();
    expect((document.getElementById("mfx") as HTMLInputElement).value).toBe("1500");
    expect((document.getElementById("mfy") as HTMLInputElement).value).toBe("100");
  });
});
```

Danach:

```bash
npm --prefix single-loop run typecheck && npm --prefix single-loop run test 2>&1 | tail -4
```

Expected: grün.

- [ ] **Step 3: WASM bauen**

```bash
npm --prefix single-loop run wasm:build
```

(nötig, weil Task 2 den Rust-Wire-Typ geändert hat — sonst kennt das pkg `circuitCount` nicht.)

- [ ] **Step 4: Browser-Verifikation**

Dev-Server über die Preview starten (Launch-Konfiguration `verlegetool`, Port 5178), dann `http://localhost:5178/raum.html`:

1. Seite lädt → Wintergarten erscheint, Badge nach dem Lauf: „3 Heizkreise · 102.8 m".
2. Verlegeabstand auf 225 → Blatt bekommt den veraltet-Schleier, **kein** Lauf startet.
3. „Neu planen" → Sekundenzähler läuft, danach frisches Blatt ohne Schleier.
4. Klick ins Blatt → x/y-Felder füllen sich, Lauf startet sofort.
5. Heizkreise „2" → veraltet; Neu planen → Karten zeigen die erzwungene Aufteilung oder ehrliche Ablehnungen in den Notes.
6. Drucken-Vorschau (⌘P) → Panel weg, Blatt und Karten auf dem Papier.

- [ ] **Step 5: Commit**

```bash
git add single-loop/src/raum-main.ts single-loop/tests/unit/verlegeplan-verdrahtung.test.ts
git commit -m "feat(single-loop): wire the tool -- stale sheet, abortable runs, click and fields in sync

Inputs never start a minute-long run; they veil the sheet. Runs start from
the button or a manifold click, a new start kills the old worker, and the
status line counts the seconds instead of hiding them."
```

---

### Task 7: Endabnahme

**Files:** keine neuen — Verifikation und ein Abschluss-Commit falls nötig.

- [ ] **Step 1: Alle Gates**

```bash
npm --prefix single-loop run typecheck
npm --prefix single-loop run test
cargo test --manifest-path single-loop/solver/Cargo.toml --test circuit_wintergarten --test circuit_schnecke --test plate_spiral_facts
cargo clippy --manifest-path single-loop/solver/Cargo.toml --all-targets 2>&1 | grep -cE "^(warning|error)"
```

Expected: alles grün, Clippy `0`.

- [ ] **Step 2: Spec-Abgleich**

Gegen `docs/superpowers/specs/2026-08-02-verlegetool-verheiratung-design.md` Punkt für Punkt: §2 geparkt (Task 1), §3 Module (3–5), §4 Tabelle vollständig (4), §5 Recompute (6), §6 Rust (2), §7 Auswertung (5), §8 Fehlerfälle (3/6), §9 Tests (2–5). Jede Lücke wird jetzt geschlossen, nicht notiert.

- [ ] **Step 3: Screenshot als Beleg**

Browser-Verifikation aus Task 6 Step 4 wiederholen, Screenshot des fertigen Blatts mit Karten an den Nutzer.
