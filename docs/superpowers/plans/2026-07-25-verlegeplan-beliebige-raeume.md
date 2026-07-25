# Verlegeplan für beliebige Räume — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Verlegeplan erzeugt für ein beliebiges einfaches Polygon einen kreuzungsfreien Rohrplan, der den ganzen Boden gleichmäßig belegt.

**Architecture:** Konturparallele Bahnen auf einem Konturbaum ersetzen die Zerlegung in Rechtecke. Anbindeleitungen laufen in ineinandergeschachtelten Randversätzen, wodurch Kreuzungen konstruktiv ausgeschlossen sind. Der Bahnabstand wird aus dem Rohrlängen-Budget gelöst statt vorgegeben.

**Tech Stack:** Vanilla JavaScript, `clipper2-js` (Boost-Lizenz, 190 KB) lokal eingebettet für Polygon-Offsetting, Node als Test-Runner.

**Spec:** [`docs/superpowers/specs/2026-07-25-verlegeplan-beliebige-raeume-design.md`](../specs/2026-07-25-verlegeplan-beliebige-raeume-design.md)

---

## ⚠️ Dieser Plan ist zweigeteilt, und der Grund steht hier

**Phase 0 ist ein Spike, kein Task.** Für sie gibt es in diesem Plan bewusst
keinen fertigen Code, weil ich keinen habe, der funktioniert.

Vor dem Schreiben dieses Plans habe ich das Herzstück prototypisiert — die
Erzeugung eines kreuzungsfreien bifilaren Pfads aus konturparallelen Versätzen.
**Zwei naheliegende Konstruktionen, beide krachend gescheitert**, gemessen mit
einem echten Selbstkreuzungs-Test:

| Konstruktion | Rechteck 6×4 m | Trapez (schräge Wand) | L-Raum (Stamm) |
|---|---|---|---|
| Konturen aufschneiden und aneinanderhängen | **770** | 293 | 158 |
| Spiral-Morphing über Bogenlängen-Parametrisierung | **642** | 332 | 76 |

Zum Vergleich: erlaubt sind **0**.

Die Prototypen liegen unter `docs/superpowers/prototypes/` und sind lauffähig.
Sie sind Teil dieses Plans, damit der Spike nicht dieselben Sackgassen noch
einmal läuft.

**Was ausgeschlossen wurde:** Die Umlaufrichtung ist es nicht — alle Versätze
kommen bereits gleichsinnig aus Clipper (geprüft, alle `+`), und das Normalisieren
ändert die Zahlen um exakt null.

**Was vermutlich die Ursache ist:** Bogenlänge ist keine brauchbare
Entsprechung zwischen zwei Versätzen. Auf einem Rechteck hat die äußere Kontur
scharfe Ecken, die innere verrundete; der Anteil der Bogenlänge, der auf eine
Ecke entfällt, ist bei beiden verschieden. Punkt `k/N` auf C₀ und Punkt `k/N` auf
C₂ liegen deshalb an verschiedenen Stellen, das Morphing pendelt, und das Pendeln
sind die Kreuzungen.

Genau an dieser Wand steht auch die Notiz im ursprünglichen Design
(*„Konturen eines L haben keine gemeinsame Mitte"*) — und sie ist der Grund,
warum das heutige Werkzeug überhaupt in Rechtecke zerlegt.

**Konsequenz für die Reihenfolge:** Phase 1 bis 4 sind erst dann sinnvoll
detailliert zu planen, wenn Phase 0 ein verifiziertes Verfahren geliefert hat.
Sie stehen hier als Auftrag mit Abnahmekriterium, nicht als Schritt-für-Schritt-
Code. Alles andere wäre Code, von dem ich weiß, dass er nicht läuft.

---

## Global Constraints

- Alle Längen intern in **mm**, Anzeige in m.
- `verlegeplan.html` bleibt **self-contained**: kein `<script src>`, kein CDN, keine externe Ressource. `clipper2-js` wird inline eingebettet, mitsamt Boost-Lizenztext.
- **Kreuzungen sind absolut ausgeschlossen.** Kein Unterführen, keine zweite Ebene. Ein Plan mit einer Kreuzung ist verworfen, nicht nachgebessert.
- **Kahle Flächen sind ausgeschlossen.** Reicht die Rohrlänge nicht, wird der Bahnabstand überall gleichmäßig vergrößert.
- Der Zielbahnabstand ist eine **Untergrenze**, nie eine Sollvorgabe.
- Der Planer gibt immer den gewählten Bahnabstand **und** die erreichte Flächenleistung aus, und meldet, wenn sie unter der Auslegung liegt.
- Der Mathe-Kern darf **kein** DOM berühren, damit der Node-Runner ihn laden kann.
- Kommentare und UI-Texte auf Deutsch, Code-Bezeichner englisch.
- **`raumaufmass.html` wird nicht angefasst.** Es ist fertig, 113 Checks grün.
- Der bestehende `crossingBench` wird **nicht** aufgeweicht, damit er grün wird.

## Gemessener Ausgangsstand

Woran der Fortschritt gemessen wird, nachgemessen am Stand `285dabe`:

| Konfiguration | Kreuzungen | Rohr außerhalb |
|---|---|---|
| Verteiler Außenwand unten | 9 | 0 |
| Verteiler Außenwand links | 9 | 0 |
| Verteiler Notch-Innenwand senkrecht | 14 | 7 |
| Verteiler Notch-Innenwand waagerecht | 50 | 0 |
| Zufalls-Bench, 60 Sets | 52 fehlerhaft | |

Ziel in allen Zeilen: **0**.

## File Structure

| Datei | Verantwortung |
|---|---|
| `verlegeplan.html` (ändern) | Ziel des Umbaus; erhält `<script id="clipper">`, `<script id="geo">`, `<script id="checks">` analog zu `raumaufmass.html` |
| `test/verlegeplan.mjs` (neu) | Node-Runner, schneidet `clipper`+`geo`+`checks` aus der HTML und führt sie aus |
| `docs/superpowers/prototypes/*.mjs` (vorhanden) | die gescheiterten Konstruktionen, als Ausgangspunkt und Warnung für den Spike |

Die Blockstruktur folgt `raumaufmass.html`, weil sie sich dort bewährt hat: der
Kern ist DOM-frei und damit auf der Kommandozeile in Millisekunden prüfbar.

---

## Phase 0 — Spike: kreuzungsfreie Spirale auf einem einfachen Polygon

**Das ist der einzige Teil, der das Projekt kippen kann.** Alles Übrige ist
Handwerk auf bekanntem Grund.

**Auftrag.** Eine Funktion, die aus einem einfachen Polygon und einem
Bahnabstand einen einzelnen zusammenhängenden Pfad erzeugt, der die Fläche
konturparallel und bifilar füllt und sich **nirgends selbst kreuzt**.

**Hartes Abnahmekriterium.** `selfCross(path) === 0` für alle drei Testräume aus
den Prototypen — Rechteck 6×4 m, Trapez mit schräger Wand, L-Raum-Stamm — bei
Bahnabständen 100, 150 und 200 mm. Neun Fälle, alle null. Der
Selbstkreuzungs-Test aus `docs/superpowers/prototypes/proto3.mjs` wird
unverändert übernommen.

**Zusätzlich zu belegen:**
- Gegenstrom: benachbarte Bahnen führen entgegengesetzte Fließrichtung. Prüfen über das Vorzeichen des Skalarprodukts der Laufrichtungen benachbarter Bahnen.
- Deckung: kein Punkt des Raums weiter als der Bahnabstand vom nächsten Rohr entfernt. Prüfen über ein Raster.
- Biegeradius: keine Richtungsänderung enger als `S.bendRadius`.

**Verfahren, die es zu untersuchen lohnt** (aus der Werkzeugbahn-Planung im
Taschenfräsen, wo dasselbe Problem gelöst ist):

1. **Abstandsfeld statt Bogenlänge.** Ein Raster über den Raum, je Zelle der Abstand zum Rand. Die Spirale ist eine Iso-Linie einer Funktion wie `d − (s/2π)·θ`. Die Entsprechung zwischen Konturen ergibt sich aus dem Feld statt aus einer Parametrisierung, was der vermuteten Fehlerursache genau ausweicht.
2. **Nächster-Punkt-Entsprechung.** Statt Bogenlänge jeden Punkt von Cₖ auf Cₖ₊₂ projizieren. Billiger als Variante 1, behebt die Eckenverzerrung aber nur teilweise.
3. **Zwei getrennte Spiralen statt Morphing.** Vorlauf und Rücklauf als zwei unabhängige Versatzfolgen mit Ganghöhe 2s erzeugen, die um s gegeneinander versetzt sind, und nur an der Kehre verbinden.

**Erlaubtes Ergebnis des Spikes: „geht so nicht".** Wenn keines der drei
Verfahren die neun Fälle auf null bringt, ist das ein Befund und kein
Fehlschlag — dann steht die Entscheidung an, ob die Zerlegung in konvexe
Teilflächen (jede für sich ein lösbares Problem) der richtigere Weg ist. Diese
Entscheidung gehört dann wieder an dich, nicht in den Spike.

**Zeitliche Begrenzung.** Der Spike ist beendet, wenn die neun Fälle null zeigen
oder wenn alle drei Verfahren versucht und gemessen sind. Nicht, wenn er sich
„fast" anfühlt.

---

## Phase 1 — Fundament (planbar, sobald Phase 0 steht)

**Auftrag.** `clipper2-js` einbetten, Node-Runner aufsetzen, Raumdarstellung von
`W/H/notchA/notchB/notchLeft` auf eine Eckenliste umstellen.

**Abnahme:**
- `node test/verlegeplan.mjs` läuft und meldet grün.
- `pointInRoom` arbeitet auf einem Polygon; der heutige L-Standardraum als Polygon ausgedrückt liefert für 10 000 Rasterpunkte dasselbe Ergebnis wie die heutige Notch-Formel.
- Der eingebettete Offsetter reproduziert die im Design gemessenen Zahlen: L-Raum bei 150 mm ergibt 22 Konturen und Tiefe 15, die Hantelform spaltet bei 250 mm auf.

**Wichtige Nebenbedingung.** Die vier heutigen Zahlenfelder für W, H, notchA,
notchB verschwinden aus der Oberfläche. Was an ihre Stelle tritt — Polygon
zeichnen, Import, oder beides — ist in Phase 4 geregelt. Bis dahin genügt ein
fest verdrahtetes Polygon, damit die Geometrie prüfbar bleibt.

## Phase 2 — Bahnabstand aus dem Längenbudget

**Auftrag.** Der Bahnabstand wird gelöst, nicht eingegeben. Die Gesamtlänge der
konturparallelen Bahnen fällt monoton mit dem Abstand; gesucht ist das `s`, das
das Budget `maxLoop × Kreiszahl` ausschöpft, mit dem Zielabstand als Untergrenze.

**Abnahme:**
- Bisektion findet `s` in ≤ 20 Schritten, Toleranz 1 mm.
- Bei knappem Budget ist der Raum vollständig belegt und `s` größer als das Ziel — nicht der Raum halb belegt und `s` am Ziel.
- Die erreichte Flächenleistung wird ausgegeben und als zu gering gemeldet, wenn sie unter `thermal.targetPowerW / roomAreaM2` liegt.
- Monotonie ist geprüft, nicht angenommen: Länge bei 100 mm > Länge bei 150 mm > Länge bei 200 mm für alle drei Testräume.

## Phase 3 — Kreise, Spuren, Kreuzungsfreiheit

**Auftrag.** Den Raum in so viele Teilflächen zerlegen, wie es Kreise gibt, in
einer Reihenfolge, die einem Umlauf vom Verteiler aus entspricht. Anbindeleitungen
in ineinandergeschachtelten Randversätzen führen, Spur *k* im Abstand
*k · Spurbreite* vom Rand, Spurnummer nach derselben Reihenfolge vergeben.

**Abnahme — das ist das Tor des ganzen Projekts:**
- Kreuzungen **0** in allen vier gemessenen Verteilerlagen (heute 9 / 9 / 14 / 50).
- Rohr außerhalb des Raums **0**, auch bei Verteiler auf einer Innenwand (heute 7).
- Zufalls-Bench **0 von 60** (heute 52).
- Auf jedem Randstück werden nur so viele Spuren reserviert, wie dort tatsächlich Leitungen laufen. Nachweis: der Feldanteil bleibt bei ≥ 68 %, dem heutigen Wert — der in `285dabe` entfernte Ringkorridor hatte ihn auf 49 % gedrückt.

**Der Bench ist ein Tor, kein Fortschrittsmaß.** „Von 52 auf 6 verbessert" ist
kein Ergebnis.

## Phase 4 — Randzone, Thermik, Import

**Auftrag.** Randzone entlang beliebig gewählter Polygonkanten statt der Namen
`bottom/left/top/right`. Thermik auf die Polygon-Raumdarstellung ziehen. Import
des Polygons aus `raumaufmass.html`.

**Abnahme:**
- Fensterkanten werden am Plan angeklickt, nicht über Namens-Chips gewählt.
- Randzone an einer spitzen Ecke: Bahnen enden dort sauber, statt sich zu überlagern. An einer einspringenden Ecke: Bogen mit dem Bahnabstand als Radius, keine Lücke.
- Die Thermik-Karte deckt das Polygon ab, nicht dessen Hüllrechteck.
- Ein aus `raumaufmass.html` exportiertes JSON ergibt ohne Nacharbeit einen Plan. Das Polygon wird **nicht** begradigt.
- Der Bench bleibt bei 0.

---

## Selbstreview des Plans

**Spec-Abdeckung**

| Spec-Abschnitt | Phase |
|---|---|
| Konturparallele Bahnen auf dem Konturbaum | 0 (Spike), 1 |
| Verschachtelte Randspuren statt Leitungen durchs Feld | 3 |
| Bahnabstand als Ergebnis, Längenbudget als Vorgabe | 2 |
| Flächenleistung ausweisen | 2 |
| Kreuzungsfreiheit absolut | 3 (Tor) |
| Polygon-Raumdarstellung | 1 |
| Schräge Ecken ohne Sonderbehandlung | 0 (Abnahme: Trapez), 4 (Randzone) |
| Randzone an beliebigen Kanten | 4 |
| Thermik auf Polygon | 4 |
| Import aus `raumaufmass.html` | 4 |
| `clipper2-js` vendored, Lizenz | 1 |
| Bench nicht aufweichen | Global Constraints |

Vollständig abgedeckt.

**Platzhalter-Prüfung.** Dieser Plan enthält bewusst keinen Code für Phase 0
bis 4. Das verstößt gegen die Regel „vollständiger Code in jedem Schritt" — und
zwar mit Absicht und offen deklariert, nicht durch ein verstecktes „TODO".
Der Grund steht ganz oben und ist gemessen: die naheliegenden Konstruktionen
erzeugen 642 bis 770 Kreuzungen. Fertigen Code zu schreiben, von dem ich weiß,
dass er falsch ist, wäre die schlechtere Regelverletzung.

Sobald Phase 0 ein verifiziertes Verfahren liefert, werden Phase 1 bis 4 als
regulärer Plan mit Code und Schritten nachgezogen. Dann ist er ehrlich
schreibbar.

**Typkonsistenz.** Noch keine Signaturen festgelegt — sie hängen am Ergebnis des
Spikes. Festgelegt sind bislang nur die Blocknamen `clipper`, `geo`, `checks`
und der Runner-Pfad `test/verlegeplan.mjs`.

**Was dieser Plan nicht ist.** Kein Umbau von `raumaufmass.html`. Keine
Mehrraum-Verwaltung. Keine Rohrlängen-Optimierung über die gleichmäßige
Aufteilung hinaus.

---

## Offener Punkt vor Phase 1

In der Hauptarbeitskopie liegen **32 nicht committete Zeilen in
`verlegeplan.html`**. Dieser Plan ändert dieselbe Datei grundlegend. Vor Beginn
ist zu klären, ob diese Änderungen committet, übernommen oder verworfen werden —
sonst entsteht ein Merge-Konflikt in einer Datei, die zu diesem Zeitpunkt in
beiden Fassungen stark abweicht.
