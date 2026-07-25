# Raumaufmaß-Scratchpad — Design

**Datum:** 2026-07-25
**Status:** Freigegeben, bereit für Implementierungsplan

## Zweck

Einen Raum aus verrauschten Distanzmessungen rekonstruieren. Der Nutzer skizziert
die Eckpunkte grob per Klick, wählt aus, welche Punktpaare eine Wand bilden, und
trägt gemessene Abstände ein. Das Werkzeug gleicht die Punkte nach kleinsten
Quadraten aus und beantwortet drei Fragen, die beim Aufmaß tatsächlich anfallen:

1. Wie sieht der Raum aus, wenn man alle Messungen bestmöglich erfüllt?
2. Welche Messung ist wahrscheinlich falsch und sollte nachgemessen werden?
3. Welche Messungen fehlen noch, damit der Raum vollständig bestimmt ist?

## Scope

- **Eigenständiges Werkzeug.** Neue Datei `raumaufmass.html`. `verlegeplan.html`
  bleibt unverändert. Übergabe erfolgt über JSON-Export, nicht über gemeinsamen Code.
- **Reine Distanzgeometrie.** Keine Winkelbedingungen, keine "diese Ecke ist
  rechtwinklig"-Constraints. Ein Raum mit n Ecken braucht damit 2n−3 unabhängige
  Distanzen.
- **Desktop.** Maus und Tastatur. Keine Touch-Optimierung, kein responsives
  Mobil-Layout.
- **Beliebige Polygone.** Keine Beschränkung auf achsparallele oder L-förmige Räume.

Ausdrücklich nicht im Scope: Mehrraum-Verwaltung, Import aus CAD, Höhen/3D,
Automatik-Layout ohne Skizze.

## Stack

Eine einzige self-contained HTML-Datei. Vanilla JS, kein Server, keine
Dependencies, kein Build — identisch zum Vorgehen bei `verlegeplan.html`. Öffnen
im Browser genügt.

Alle Längen intern in **mm**, Anzeige in **m** bzw. **mm** je nach Größenordnung.

## Datenmodell

```js
const M = {
  pts:  [{id:'A', x:0, y:0}, …],                    // x,y = aktuelle Schätzung (mm)
  walls:[['A','B'], ['B','C'], …],                  // Wandzug
  meas: [{a:'A', b:'C', d:4230, sigma:5, on:true}], // Messungen, Duplikate erlaubt
};
```

Drei Eigenschaften dieses Modells sind tragend:

**Wände und Messungen sind getrennte Kantenmengen.** Eine Wand darf ungemessen
bleiben, wenn Diagonalen ihre Endpunkte bereits festnageln. Eine Messung darf
zwei nicht benachbarte Punkte verbinden. Werden beide Mengen vermischt, sind
gleichzeitig das gezeichnete Polygon und die Rigiditätsrechnung falsch.

**Duplikate sind erlaubt.** Zwei Messungen desselben Paars ergeben zwei Zeilen im
Gleichungssystem. Genau daraus entsteht die Fehlermittelung, die zusätzliche
Messungen wertvoll macht.

**`on:false` deaktiviert eine Messung, ohne sie zu löschen.** Nötig, um einen
Verdacht zu prüfen: Messung abschalten, Fit ansehen, wieder einschalten.

`sigma` ist die angenommene Standardabweichung der Einzelmessung, Vorgabe 5 mm.
Der Fehler eines Laser-Distanzmessers ist näherungsweise konstant und nicht
längenproportional; gleiche Gewichte für alle Messungen sind daher korrekt.
`sigma` bleibt pro Messung überschreibbar, damit ein per Zollstock genommenes
Maß herabgewichtet werden kann.

## Rechen-Units

Jede Unit ist eine reine Funktion und einzeln testbar.

| Unit | rein → raus |
|---|---|
| `residuals(pts, meas)` | `v_i = ‖x_a − x_b‖ − d_i` |
| `jacobian(pts, meas)` | m×2n-Matrix, Zeile i besetzt an 4 Stellen mit `±u_ab` |
| `solve(pts, meas)` | ausgeglichene Koordinaten |
| `analyze(pts, meas)` | `{rank, dof, h[], red[], w[], nullModes, sigmaHat, cov}` |
| `suggest(pts, walls, meas)` | Rangliste messbarer Kandidatenpaare |

### `jacobian`

Zeile i einer Distanzmessung zwischen a und b, mit `u = (x_a − x_b)/‖x_a − x_b‖`:

```
∂r_i/∂x_a =  u_x    ∂r_i/∂y_a =  u_y
∂r_i/∂x_b = −u_x    ∂r_i/∂y_b = −u_y
```

Alle übrigen Einträge der Zeile sind 0. Der Aufbau ist eine Schleife über
`meas`, die pro Messung eine Zeile erzeugt.

### `solve`

Gauß-Newton mit Levenberg-Marquardt-Dämpfung, dichte Cholesky-Zerlegung der
Normalgleichungen, Abbruch bei `‖δ‖ < 0.01 mm` oder nach 30 Iterationen. Bei
2n ≤ 60 Unbekannten ist das in Millisekunden erledigt; sparse oder iterativ zu
rechnen wäre reiner Aufwand ohne Nutzen.

Zwei Vorbereitungen entscheiden über Erfolg oder Blödsinn:

**Eichung durch Pinnen.** Die Zielfunktion ist invariant gegen Verschiebung und
Drehung, `JᵀJ` ist also um genau 3 Ränge defekt. Fixiert werden `P0.x`, `P0.y`
und eine Koordinate von `P1` — exakt drei Freiheitsgrade. Das macht die
Normalgleichungen gut konditioniert und sorgt dafür, dass die Punkte nicht
zwischen zwei Fits wandern. Residuen, Redundanzzahlen und normierte Residuen
sind eichinvariant; die Wahl kostet also nichts. Die LM-Dämpfung bleibt trotzdem
drin, denn bei unterbestimmten Netzen ist das System auch nach dem Pinnen
singulär.

Welche Koordinate von `P1` gepinnt wird, darf nicht fest verdrahtet werden. Eine
Drehung um `P0` ändert `P1.y` mit der Rate `(P1.x − P0.x)`; liegt `P1` genau über
`P0`, fixiert `P1.y` die Drehung überhaupt nicht und das System bleibt singulär.
Regel: ist `|P1.x − P0.x| ≥ |P1.y − P0.y|`, wird `P1.y` gepinnt, sonst `P1.x`.

**Skizze skalieren.** Vor der ersten Iteration werden die Skizzenkoordinaten mit
`mittel(d_gemessen) / mittel(d_skizze)` multipliziert. Eine Zeile, aber sie
rettet den Solver, wenn jemand einen 8-Meter-Raum als 300-Pixel-Kritzelei
gezeichnet hat.

### `analyze`

**Eine** Gram-Schmidt-Orthogonalisierung der Jacobian-Spalten, mit
Rangtoleranz relativ zur größten Spaltennorm. Daraus fallen gemeinsam an:

- **Rang** → fehlende Messungen: `dof = (2n − 3) − rank`
- **Nullraum** → welche Punkte sich noch bewegen können
- **Hebelwerte** `h_i` der Hutmatrix `H = J(JᵀJ)⁺Jᵀ` → Redundanzzahlen

Drei getrennte Rechnungen für diese drei Antworten wären Verschwendung. Ein
kombinatorischer Rigiditätstest (Pebble-Game nach Laman) ist ebenfalls nicht
nötig: er beantwortet nur die Rigiditätsfrage, die der Jacobian ohnehin
mitliefert, und er beantwortet sie über *generische* Konfigurationen statt über
die tatsächliche.

Abgeleitete Größen:

- Redundanzzahl `red_i = 1 − h_i`, Wertebereich 0…1
- Normiertes Residuum `w_i = |v_i| / (sigma_i · √red_i)` — Baardas Data Snooping.
  Undefiniert für `red_i < 0.01`.
- Varianzfaktor `sigmaHat² = Σv² / (m − rank)`, nur definiert wenn `m > rank`.
- Kovarianz `cov = sigmaHat² · (JᵀJ)⁺`

Feste Schwellen, damit die Anzeige reproduzierbar ist:

| Schwelle | Wert | wofür |
|---|---|---|
| Rangtoleranz | `1e-8 · größte Spaltennorm` | Rangbestimmung in Gram-Schmidt |
| `red_i` "nicht prüfbar" | `< 0.01` | Badge in der Messtabelle |
| Nullraum-Anteil eines Punkts | `> 0.05 · ‖Mode‖` | Pfeil statt Ellipse |

Die Kovarianz wird aus der **Pseudoinversen der vollen** `JᵀJ` gebildet, nicht aus
der Inversen des gepinnten Systems. Sonst wären die Ellipsen an `P0` genagelt und
wüchsen mit dem Abstand davon — ein Artefakt der Eichung, nicht der Messqualität.
Die Pseudoinverse verteilt die Unsicherheit über das Netz und ist das, was der
Nutzer sehen will.

**Die 3 Starrbewegungen müssen vor der Interpretation des Nullraums
herausprojiziert werden**, sonst sieht jedes Netz beweglich aus. Die drei
Basisvektoren sind `(1,0,1,0,…)`, `(0,1,0,1,…)` und `(−y₁,x₁,−y₂,x₂,…)`,
orthonormalisiert.

### `suggest`

Kandidaten sind alle Punktpaare ohne Messung. Zwei Filter, dann Greedy:

1. **Messbarkeit.** Die Strecke muss innerhalb des aktuellen Polygons liegen.
   In einem L-Raum verlässt die Diagonale zwischen den äußeren Ecken den Raum —
   sie lässt sich nicht messen und darf nicht vorgeschlagen werden. Eine
   Vorschlagsliste voller unmöglicher Messungen ist der Unterschied zwischen
   einem benutzten und einem ignorierten Feature.
2. **Wirksamkeit.** Bewertung nach `‖Projektion der Rigiditätszeile auf den
   nicht-trivialen Nullraum‖`. Ein Paar, dessen Zeile ganz im Zeilenraum liegt,
   fügt keinen Rang hinzu und bringt für die Bestimmtheit nichts.

Der beste Kandidat wird virtuell hinzugefügt, Rang neu gerechnet, wiederholen bis
`dof = 0`. Ergebnis ist eine konkrete Liste: *"Miss noch A↔D, C↔F, B↔E."*

Ist das Netz bereits bestimmt (`dof = 0`), wechselt die Liste die Bedeutung: dann
werden Messungen vorgeschlagen, die die *Prüfbarkeit* erhöhen — bevorzugt Paare,
die an Messungen mit `red_i ≈ 0` angrenzen.

## UI

Zweispaltig: Canvas links, Panel rechts.

**Drei Modi** über Buttons oder Tasten `1`/`2`/`3`:

- **Punkt** — Klick legt an, Ziehen verschiebt. Verschieben korrigiert die
  Skizze, nicht das Ergebnis; nach dem Ziehen läuft der Fit neu. IDs werden
  automatisch vergeben: `A`…`Z`, danach `AA`, `AB`, …
- **Wand** — zwei Punkte nacheinander klicken.
- **Messung** — zwei Punkte klicken, dann Zahl eintippen.

Jede Änderung an Punkten, Wänden oder Messungen löst `solve` + `analyze` neu aus.
Bei ≤ 30 Punkten ist das schnell genug für Live-Aktualisierung; ein
"Berechnen"-Knopf ist unnötig.

**Statuszeile** über dem Canvas, immer ein Satz zum Netzzustand:

```
Unterbestimmt — 3 Messungen fehlen
Bestimmt, aber keine Messung überprüfbar
Überbestimmt — σ̂ = 6.2 mm
```

**Messtabelle** rechts, Spalten `von · nach · d · v · Redundanz · w`, absteigend
nach `w` sortiert. Die oberste Zeile ist der wahrscheinlichste Ausreißer. Zeilen
mit `red_i ≈ 0` zeigen das Badge **nicht prüfbar** statt eines Residuums. Je
Zeile ein Schalter für `on` und ein Feld zum Überschreiben von `d`.

**Vorschlagsliste** unter der Tabelle.

**Unsicherheits-Ellipsen** im Canvas, eine je Punkt, aus `cov`. Drei Fälle,
die verschieden dargestellt werden müssen:

- Netz überbestimmt → Ellipse aus `sigmaHat`, echte empirische Genauigkeit.
- Netz bestimmt, aber `sigmaHat` undefiniert → Ellipse aus dem angenommenen
  `sigma`, beschriftet als *angenommen*.
- Punkt liegt in einer Nullraum-Richtung → keine Ellipse, sondern ein Pfeil
  entlang der Bewegungsrichtung. Eine Ellipse wäre hier unendlich groß und die
  Zeichnung eine Lüge.

Die Ellipsen fallen aus der bereits berechneten Zerlegung ab und beantworten
direkt, welche Raumecke am schlechtesten bestimmt ist.

**Export**: JSON mit Punkten und Wänden, dazu eine Wandlängen-Liste zum
Abschreiben.

## Fehlerfälle

**Unterbestimmtes Netz ist der Normalzustand am Anfang, kein Fehler.** Wer sechs
Punkte anlegt und drei Distanzen einträgt, bekommt den besten zur Skizze passenden
Fit gezeichnet, plus die Meldung "N Messungen fehlen". Nie NaN, nie ein
kollabierter Klumpen, nie eine leere Zeichnung.

| Fall | Verhalten |
|---|---|
| < 3 Punkte | nur Skizze, kein Fit, Panel ausgegraut |
| Wandzug nicht geschlossen oder Knotengrad ≠ 2 | Warnung; Polygonfilter für Vorschläge aus, Fit läuft weiter |
| Isolierter Punkt / unverbundene Komponente | als eigene Komponente melden, nicht still mitschleifen |
| `d ≤ 0` oder Messung eines Punkts auf sich selbst | abgelehnt, Eingabefeld rot |
| Solver konvergiert nicht in 30 Iterationen | letzten Stand zeichnen, Warnung, Fit nicht als gültig markieren |

## Test

Selbstcheck mit `assert` in derselben Datei, ausgelöst über `?test` in der URL.
Kein Framework, keine Fixtures. Er läuft gegen ein synthetisches L mit bekannten
Koordinaten:

1. **Ausreißer-Erkennung** — exakte Distanzen auf einem überbestimmten Netz, eine
   Messung um 20 mm verfälscht. Erwartung: diese Messung hat das größte `w`, die
   übrigen Punkte werden auf ~2 mm genau rekonstruiert.
2. **Fehlende Messungen** — Rechteck mit nur 4 Seiten meldet "1 Messung fehlt";
   nach Hinzufügen einer Diagonale meldet es 0.
3. **Der Lügner-Fall** — exakt bestimmtes Netz (`m = 2n−3`). Erwartung: alle
   Residuen ≈ 0 **und** Meldung "nicht überprüfbar". Ein Tool, das hier "alles
   gut" anzeigt, ist aktiv falsch — dies ist der wichtigste der drei Tests.
4. **Vorschlagsfilter** — im L-Raum darf keine Diagonale vorgeschlagen werden,
   die den einspringenden Bereich überspannt und damit außerhalb des Polygons
   verläuft. Konkret am Test-L mit den Ecken
   `(0,0) (8000,0) (8000,2000) (3000,2000) (3000,5000) (0,5000)`:
   das Paar `(8000,2000)↔(0,5000)` muss gefiltert sein, das Paar
   `(0,0)↔(3000,5000)` muss zulässig bleiben.
