# Verlegeplan: Polygon-Raum und Import — Implementierungsplan

**Ziel:** `verlegeplan.html` plant für ein beliebiges einfaches Polygon (konkav
erlaubt, keine Löcher) und importiert den Raum aus `raumaufmass.html`.

**Spec:** [`2026-07-25-verlegeplan-beliebige-raeume-design.md`](../specs/2026-07-25-verlegeplan-beliebige-raeume-design.md)
**Vorgänger-Plan:** [`2026-07-25-verlegeplan-beliebige-raeume.md`](2026-07-25-verlegeplan-beliebige-raeume.md) — dessen Phase 0 ist erledigt.

## Was gegenüber dem alten Plan anders entschieden ist

| Punkt | Alter Plan | Jetzt | Grund |
|---|---|---|---|
| Polygon-Versatz | `clipper2-js` vendored, 190 KB | Abstandsfeld + Marching Squares | keine Abhängigkeit, Datei bleibt self-contained, Konturaufspaltung fällt automatisch an |
| Bahnabstand | aus dem Längenbudget gelöst (Phase 2) | bleibt Eingabe | vom Nutzer aus dem Umfang genommen |
| Anbindeleitungen | verschachtelte Randspuren, Bench 0/60 (Phase 3) | bleiben in heutiger Qualität | vom Nutzer aus dem Umfang genommen |
| Abnahme | Bench 0/60 | Bench nicht Ziel; Feldgeometrie kreuzungsfrei | folgt aus den beiden Zeilen darüber |

## Ausgangsstand nach Phase 0

`docs/superpowers/prototypes/proto4.mjs`, 7 Räume × 3 Bahnabstände:

- Räume ohne Konturaufspaltung (Rechteck, Trapez, L, T, Fünfeck mit zwei
  schrägen Wänden): **15 von 15 kreuzungsfrei**, Deckung ≤ s, Gegenstrom 78–96 %.
- Räume mit Aufspaltung (U, Hantel): 3 von 6 Fällen mit je 2 Kreuzungen, alle an
  der Übergabe in einen Unterbaum.

## Randbedingungen

- Alles intern in mm, Anzeige in m.
- `verlegeplan.html` bleibt self-contained: kein `<script src>`, kein CDN.
- Der Mathe-Kern fasst kein DOM an, damit `test/verlegeplan.mjs` ihn laden kann.
- Kommentare und UI auf Deutsch, Bezeichner englisch.
- `raumaufmass.html` wird nicht angefasst.
- Ein Plan mit Kreuzungen wird nicht still gezeichnet, sondern ausgewiesen —
  wie heute schon bei Überlappungen und zu engen Kehren.

## Schritte

### 1. Blockstruktur und Testläufer

`<script id="geo">` (DOM-frei: Feld, Konturen, Baum, Spirale, Polygon-Helfer),
`<script id="ui">` (Rest), `<script id="checks">`. Neu: `test/verlegeplan.mjs`,
schneidet `geo`+`checks` aus der HTML und führt sie in Node aus.

**Abnahme:** `node test/verlegeplan.mjs` läuft und meldet grün.

### 2. Geometrie-Kern aus proto4 übernehmen

`signedDistanceField`, `isoContours`, `contourTree`, `chainFrom`,
`linkRingsFor`, `spiralParts`, `spiralNode`, `spiralRoom` plus Ring-Helfer.

**Abnahme:** Die 21 Fälle aus proto4 laufen als Selbstcheck mit denselben Zahlen.

### 3. Raumdarstellung auf ein Polygon umstellen

`S.poly` (Eckenliste mm, CCW) ersetzt `S.W/H/notchA/notchB/notchLeft`.
Es entfallen: `notchFrame`, `rectsFrame`, `lRing`, `hasNotch`, `notchX`,
`mirX`, der ROT-Frame (`ROT`, `rotFwd`, `rotBack`, `rotOdd`, `frameW`,
`frameH`, `edgeFwd`, `rotForManifold`), `insetsFor`, `doubleSpiral`,
`bifilarPath`, `passCount`, `edgeSpan`, `edgeChains`, `wEdges`, `routeVia`,
`laneY`, `partition` in heutiger Form.
Es bleiben: `fillet`, `omegaTurn`, alle Kreuzungs- und Überlappungsprüfer,
die Thermik-Schicht, `draw` in Teilen.

`pointInRoom`, `roomAreaM2`, `snappedManifold` arbeiten auf dem Polygon.

**Abnahme:** Der heutige L-Standardraum als Polygon liefert für 10 000
Rasterpunkte dasselbe `pointInRoom` wie die alte Notch-Formel.

### 4. Heizkreise

`partition(N)` schneidet das Polygon entlang seiner längeren Achse in N
flächengleiche Teile (Halbebenen-Clip). Die Schnittkante wird je Teil um
`edgeGap − s/2` in den Nachbarn verlängert, damit an der Naht kein doppelter
Wandabstand als kalter Streifen stehen bleibt.

Anbindung: die Naht jedes Teils wird am Verteiler ausgerichtet, die Zuleitung
läuft auf Iso-Linien unterhalb der ersten Feldbahn. Bei N = 1 fällt sie fast
weg, weil Ein- und Austritt der Spirale dann am Verteiler liegen. Für N > 1
werden `2·(N−1)` Spuren à `LANE()` reserviert und die erste Feldkontur um
diesen Betrag nach innen gelegt — nur dann, nicht pauschal.

**Abnahme:** Bei N = 1 ist die Zuleitung kürzer als 2·`edgeGap` + Bahnabstand.
Der Feldanteil bleibt bei N = 1 mindestens so hoch wie heute (68 %).

### 5. Randzone an Fensterwänden

`S.windowEdges` wird von den Namen `bottom/left/top/right` auf Kantenindizes
des Polygons umgestellt. Die Randzonenbahnen sind die Teile der Iso-Linien auf
den Niveaus `edgeGap + j·randSpacing`, deren nächstliegende Polygonkante
ausgewählt ist; zusammenhängende Stücke ergeben von selbst eine Kette um die
Ecken. Die erste Feldkontur rückt dort um `randPasses·randSpacing` nach innen —
umgesetzt als Zuschlag je Kante im Abstandsfeld, nicht als Sonderfall im Planer.
`omegaTurn` bleibt unverändert und wird an den Kettenenden angesetzt.

**Abnahme:** An einer spitzen Ecke enden die Bahnen, statt sich zu überlagern;
an einer einspringenden Ecke entsteht ein Bogen ohne Lücke.

### 6. Oberfläche

Die Felder W, H, Notch Breite, Notch Höhe und der Spiegel-Schalter verschwinden.
An ihre Stelle treten:
- **Importieren**: Datei-Auswahl für ein `raumaufmass.html`-JSON. Gelesen werden
  `pts` und `walls`; daraus wird der geschlossene Wandring gebildet. Das Polygon
  wird **nicht** begradigt.
- **Rechteck**: zwei Zahlenfelder Breite/Tiefe für einen Schnellstart ohne Aufmaß.
- Fensterwände werden am Plan angeklickt statt über Namens-Chips gewählt.

**Abnahme:** Ein aus `raumaufmass.html` exportiertes JSON ergibt ohne Nacharbeit
einen Plan.

### 7. Thermik und Zeichnung

Heatmap-Clip und `roomAreaM2` auf das Polygon. `draw` zeichnet das Polygon statt
`lRing`. Der Maßstabsbalken bleibt.

**Abnahme:** Die Heatmap deckt das Polygon ab, nicht sein Hüllrechteck.

### 8. Warnung bei verzweigten Räumen

Spaltet der Konturbaum auf, wird das im Plan ausgewiesen: der Plan entsteht,
aber die Übergabe zwischen den Ästen ist nicht als kreuzungsfrei nachgewiesen.
Wie die bestehenden Warnungen für Überlappung und zu enge Kehre.

**Abnahme:** U-Raum liefert einen Plan **und** die Warnung. Rechteck, L und
schrägwandige Räume liefern einen Plan ohne Warnung.

## Nicht Teil davon

- Bahnabstand aus dem Längenbudget lösen (Spec-Phase 2).
- Verschachtelte Randspuren, Bench 0/60 (Spec-Phase 3).
- Kreuzungsfreiheit bei aufspaltenden Konturen.
- Mehrraum-Verwaltung, Aufbauhöhen, 3D.
