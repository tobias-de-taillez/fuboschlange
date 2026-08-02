# Verlegetool: die alte Modalität, der zertifizierte Solver

**Datum:** 2026-08-02
**Status:** Design vom Nutzer freigegeben, Umsetzung offen
**Vorgeschichte:** `raum.html` (Vite-App) zeichnet die zertifizierte Geometrie
aus `plan_room`, ist aber karg; `verlegeplan.html` (Repo-Root) hat die gewollte
Bedienoberfläche — Seitenleiste, Karten, Notes, Drucken — aber einen
ungeprüften JS-Planer dahinter (60-mm-Radius, Kreuzungen als „Baupraxis"
abmoderiert). Der Nutzer will **ein** Tool: die Modalität des alten, die
Wahrheit des neuen.

## 1. Ziel

Die Vite-App wird das eine Verlegetool. Optik und Bedienlogik des alten
`verlegeplan.html`, Geometrie ausschließlich vom zertifizierten `plan_room`
(Rust/WASM, im Worker). Thermik bleibt in diesem Schritt draußen.

## 2. Vorarbeit: Thermik parken

Im Arbeitsbaum liegt uncommitted eine Thermik-Portierung
(`single-loop/src/thermal.ts`, Heatmap-UI in `raum.html` und
`src/raum-main.ts`). Sie wird **vor** allem anderen auf den Branch
`thermal-port` committet; `main`s Arbeitsbaum ist danach sauber. Nichts wird
gelöscht — die Thermik kommt nach der Verheiratung als eigener Schritt zurück
und legt sich dann auf die zertifizierten Pfade.

## 3. Architektur

Vier Module statt einer Monsterdatei. Jedes hat eine Aufgabe, eine
Schnittstelle, und ist ohne die anderen testbar:

| Modul | Aufgabe | Schnittstelle |
|---|---|---|
| `src/verlegeplan/sheet.ts` | das SVG-Blatt: Noppenfeld, gemessener und begradigter Umriss, Randzonen-Streifen, Kreise, Verteiler | `render(plan: RoomPlan): string` — aus `raum-main.ts` extrahiert, unverändert |
| `src/verlegeplan/panel.ts` | Seitenleiste → Eingaben; meldet jede Änderung als „veraltet" | `readInput(): RoomPlanInput`, `onChange(cb)`, `setManifold(pt)` |
| `src/verlegeplan/auswertung.ts` | Badge, Kreis-Karten, Raum-Karten, Notes, Druckknopf | `show(plan: RoomPlan): void` — liest nur `RoomPlan`, rechnet nichts |
| `src/raum-main.ts` | Verdrahtung: Worker-Client, veraltet-Zustand, Klick-Verteiler, Lauf-Lebenszyklus | — |

CSS und Panelstruktur werden gezielt aus `verlegeplan.html` gehoben
(Panelspalte links, Blatt rechts, Karten darunter, Print-CSS). Kein
1:1-Import des alten Markups: jedes Element kommt einzeln und nur, wenn es
gegen den Solver verdrahtet ist. Der Worker (`room.worker.ts` +
`room-protocol.ts`) bleibt wie er ist; nur der Client in `raum-main.ts`
bekommt den Abbruch aus §5.

## 4. Bedienelemente, ehrlich verdrahtet

| Gruppe | Element | dahinter |
|---|---|---|
| Raum | „Raum importieren …" | Aufmaß-JSON (raumaufmass-Export) → Ring; Fehler im Banner |
| | Breite / Tiefe (mm) | Rechteck-Ring, wenn kein Import geladen ist; ein Import überschreibt sie sichtbar |
| Verlegung | Verlegeabstand | Auswahl **75 / 150 / 225 / 300 mm** — das Noppenraster kennt nichts anderes. 100 und 110 mm existieren nicht mehr; die heutige Auswahl in `raum.html` bietet 100/200 an und ist damit eine stille Lüge, die hier verschwindet |
| | Randabstand (mm) | `wallClearanceMm` |
| | Rohr-Ø 16 mm · Biegeradius 80 mm | **Anzeige, fix** — folgt dem BEKOTEC-EN-23-FI-30-Profil, keine Eingabe |
| Randzone | reservierter Streifen (mm, 0 = aus) | `edgeBandMm`; daneben dauerhaft sichtbar: „Streifen wird freigehalten — das Band selbst ist noch nicht verlegbar" |
| Heizkreise | auto / 1 / 2 / 3 | `circuitCount` (neu, §6): überstimmt die Flächenarithmetik der Feldaufteilung. Ein erzwungener Kreis, der über 100 m käme, wird nicht stumm gekürzt: sein Feld erscheint unter „Nicht belegt" mit Grund |
| | max. Kreislänge | Anzeige, fix 100 m |
| Verteiler | x / y (mm) ↔ Klick in den Plan | beides synchron; Koordinaten im Aufmaß-System (`toWorld` über `plan.frame`); Klick setzt Felder, Feldeingabe setzt Marker |

Grundsatz: was der Solver nicht kann, wird nicht angeboten oder ist
ausgegraut mit Grund — niemals stumm ignoriert.

## 5. Recompute-Modell („gemischt")

- Jede Eingabeänderung markiert das Blatt sichtbar als **veraltet**
  (Schleier über dem SVG + Hinweis im Badge). Kein automatischer Lauf.
- Ein Lauf startet über **„Neu planen"** oder den **Verteiler-Klick** (eine
  bewusste Aktion).
- Ein neuer Start bricht den laufenden Lauf ab: Worker-Terminate, frischer
  Worker, nur der neueste Lauf zählt. (Der bestehende `workerPlanner` wird
  um Abbruch erweitert; die Nur-der-Neueste-Logik existiert.)
- Die Statuszeile zählt die Sekunden des laufenden Laufs mit — die Wartezeit
  (Minuten für den Wintergarten) wird angezeigt, nicht kaschiert.
- Künftige billige Regler (z. B. Thermik-Deckkraft) wirken sofort ohne Lauf;
  in diesem Schritt gibt es noch keine.

## 6. Rust-Änderung (genau eine)

`RoomPlanInput` bekommt `circuit_count: Option<usize>` (Serde: optional,
`camelCase` wie der Rest). `plan_room` reicht es an die Feldaufteilung durch:
`Some(n)` ersetzt das arithmetisch bestimmte `wanted` in `split_by_area`.
Alles Weitere bleibt unangetastet; `certify_loop` erzwingt die 100 m
weiterhin pro Kreis, ein unerfüllbarer Zwang landet in `refused`.

## 7. Auswertung

- **Badge:** „n Heizkreise · x m" — wie früher, Werte aus dem Plan.
- **Je Kreis eine Karte:** Länge, Verlegeabstand, Bahnen, Biegeradius,
  Mindestabstand, Strafsumme, Status „zertifiziert". Alle Zahlen aus dem
  `LoopCertificate` des Solvers.
- **Raumkarten:** gemessene / begradigte / Füllfläche, verworfene kurze
  Wände, Noppenzahl.
- **Notes:** die `refused`-Liste (jedes Feld ohne Kreis, mit dem Grund des
  Solvers), Hinweis auf reservierte Randzone, Hinweis wenn der
  Verteiler-Wunschort nicht bedient werden konnte (Zone in die Mitte
  zurückgefallen). **Keine** JS-Selbstprüfungen mit ✓-Häkchen: eine Zahl
  erscheint, weil das Zertifikat sie liefert, oder gar nicht.
- **Drucken:** `window.print()` + Print-CSS aus der alten Datei (Panel
  ausblenden, Blatt und Karten aufs Papier).

## 8. Fehlerfälle

- Importfehler (offener Ring, Punkt mit ≠ 2 Wänden, mehrere Ringe) → Banner
  mit dem Klartext aus `ringFromSurvey`; das alte Blatt bleibt stehen.
- Solver lehnt ab (`plan_room`-Fehler) → Banner mit Code + Meldung; das
  alte Blatt bleibt stehen, veraltet-Markierung bleibt.
- Worker stirbt → vorhandene `onerror`-Meldung („Der Rechen-Worker ist
  abgestürzt").
- Abgelehnte Felder erscheinen immer in den Notes, nie nur in der Konsole.

## 9. Tests

- **Vitest:** Panel→`RoomPlanInput`-Abbildung (jede Gruppe), veraltet-Logik
  (Änderung markiert, Lauf hebt auf), Auswertung rendert die
  Zertifikatswerte eines fixen `RoomPlan`, Verteiler-Synchronisation
  x/y ↔ lokal.
- **Rust:** ein Test in `circuit_wintergarten.rs`: `circuit_count: Some(2)`
  auf dem Wintergarten — zwei Felder, und was nicht in 100 m passt, steht in
  `refused`.
- **Bestehende Suiten** bleiben grün (`npm run check`, `cargo test`).

## 10. Ausdrücklich nicht in diesem Schritt

- Thermik (geparkt auf `thermal-port`, kommt als eigener Schritt zurück).
- Verlegung des Randzonen-Bands (Walker offen, siehe
  `docs/superpowers/plans/2026-08-02-randzonen-band.md`).
- Stilllegung des Root-`verlegeplan.html` — bleibt unangetastet, bis das
  neue Tool Parität erreicht hat.
- Solver-Beschleunigung (der Minuten-Lauf wird angezeigt, nicht optimiert).
