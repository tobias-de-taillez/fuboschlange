# Wo der Biegeradius bricht — gemessen, nicht geraten

**Datum:** 2026-07-26
**Anlass:** `radFails` steht seit Runden bei 19/20 und war das einzige Gate, dessen
Ursache ich nie lokalisiert hatte. Statt weiter an Glättungsparametern zu drehen:
den Ort des Minimums messen.

## Methode

Für jeden der 20 Bench-Läufe den Punkt mit dem kleinsten Krümmungsradius im
ganzen Plan suchen (exakt die Regel aus `pathCurve`), und ihn beschreiben:
Ablenkwinkel, Länge der beiden Schenkel, Abstand zur Wand, Lage entlang des
Pfades, in welchem Kreis.

Probe: `wo.mjs` / `wo2.mjs` (Scratchpad), gegen `verlegeplan.html` @ 493ed6b.

## Befund: alle 20 sind Ecken, keine Kurven

`{"Ecke":20}` — kein einziger Fehlschlag kommt aus einer glatten, zu eng
abgetasteten Kurve. Damit sind alle bisherigen Ansätze an den
Glättungsparametern (Runde 12: Dedupe-Schwelle, Glättungsziel, Resample-Weite —
alle neutral bis schlechter) im Nachhinein erklärt: sie haben an der falschen
Stelle gedreht.

Die 20 zerfallen in drei scharf getrennte Gruppen:

| Fälle | defl | kurzer Schenkel | Wandabstand | r | Deutung |
|---|---|---|---|---|---|
| 7 | 90° | **50** mm | **90** mm | 50 | Verteiler-Abgang |
| 6 | 135° | **81** mm | 250–550 | 34 | fester 81-mm-Stich |
| 5 | 175–180° | 1400–1700 mm | 590–1290 | 0,5–33 | Pfad läuft auf sich selbst zurück |

Und: `kurze Segmente (min(ab,bc)<50): 0/20` — es liegt nicht an der
Diskretisierung.

### Gruppe 1 — der Verteiler-Abgang, 7/20

Schenkel exakt 50 mm, Wandabstand exakt 90 mm. 50 mm ist `MANIFOLD_PITCH`.
Das Rohr kommt orthogonal aus der Leiste, läuft 50 mm (bis zum nächsten Port)
und biegt 90° ab: `r = 50/tan(45°) = 50`. Strukturell — solange die Kehre
zwischen zwei benachbarten Ports stattfindet, ist der Radius auf den halben
Portabstand gedeckelt.

Richtung: die 90°-Wende weiter weg von der Leiste legen, oder auf zwei 45°-Knicke
verteilen (`r = 50/tan(22,5°) = 121` — reicht).

### Gruppe 2 — der 81-mm-Stich, 6/20

Immer exakt 81 mm, immer 135°, immer `r = 34`. Ein fester Wert heißt: eine feste
Konstruktion, kein Zufall aus der Raumgeometrie. Noch nicht zurückverfolgt.

### Gruppe 3 — die entartete Kehre, 5/20

Der Fund dieser Runde. Lauf 5, unverstellt:

```
[57] (5489, 1833)
[58] (5489,  883)    950 mm hoch
[59] (6983,  883)   1494 mm nach rechts
[60] (1138,  878)   5845 mm nach links  —  y-Versatz: 5 mm
```

Das Rohr läuft 1494 mm nach rechts und auf derselben Linie zurück, seitlicher
Versatz 5 mm. Für die Kehre bräuchte es `2R = 160 mm`. Lauf 1: 35 mm Versatz,
Lauf 17: 13 mm. Das ist kein Kompromiss zwischen Deckung und Radius, das ist
Geometrie, die so nicht gebaut werden kann — und sie erzeugt zugleich eine
Überlappung, zählt also auch bei den Kreuzungen mit.

**Ursache:** `ringDone` in `doubleSpiralField` prüft die **Bounding Box** des
ganzen Rings:

```javascript
return Math.min(x1-x0,y1-y0)<2*Rb || polyLen([...c,c[0]])<=4*s;
```

Der Ring aus Lauf 5 spannt y 878…2033, seine Bounding Box ist also 1155 mm hoch
und besteht den Test. Lokal, bei y≈880, ist er ein 5-mm-Schlitz. **Eine globale
Kennzahl für eine lokale Eigenschaft.** Wenn die Zone bis zur Medialachse
erodiert ist, kollabiert der Ring dort zu einem platten Schlitz, während er
anderswo breit bleibt.

## Zwei Reaktionen gemessen, beide verworfen

Ersatz des Bounding-Box-Tests durch den lokalen Test „Abstand nicht benachbarter
Ringkanten ≥ 2R":

| | crossFails | covFails | radFails |
|---|---|---|---|
| Baseline | **18** | **10** | 19 |
| lokaler Abstandstest | 18 | 14 | **18** |
| … nur gegenläufige Kanten | 19 | 14 | 19 |

Ein Radiusfehler weniger gegen vier Deckungsfehler mehr. Den ganzen Ring
wegzuwerfen ist der falsche Hebel: er ist ja nur an einer Stelle entartet.

## Was diese Runde NICHT gemessen hat

Der dritte Ansatz — die Ausbuchtung wegschneiden statt den Ring zu opfern
(`despike`) — ist **ungemessen**. Zwei Benchläufe lieferten exakt die
Baseline-Zahlen in allen 17 Kennzahlen; ein eingebauter Aufrufzähler zeigte
dann `Aufrufe: 0`. Die Funktion war beim Laden nicht in der Datei: sie ist
zwischen 00:10 und 00:12 aus `verlegeplan.html` verschwunden (Dateigröße um
~1,1 KB gefallen), ohne dass ein Kommando von mir das ausgelöst hätte —
vermutlich ein Editor, der einen älteren Puffer gespeichert hat.

Die beiden Läufe haben also HEAD gemessen. Sie sind ungültig, nicht neutral.
`despike` bleibt offen und muss neu gemessen werden.

Nebenbefund derselben Ursache: im Arbeitsverzeichnis lag eine unbekannte,
nie gemessene Änderung (`nearOn`-Projektion als Morph-Zuordnung — genau der
„partially linear morphing"-Schritt aus der Literatur). Gesichert als
`docs/offen-nearOn-morph-projektion.diff`, damit sie nicht verloren geht.

## Nächster Schritt

Gruppe 3 lokal heilen statt den Ring zu verwerfen, dann Gruppe 1 (zwei
45°-Knicke am Verteiler), dann Gruppe 2 zurückverfolgen. Gruppe 1 und 2
zusammen sind 13 von 20 — solange die stehen, kann `radFails` nicht unter
13/20 fallen, egal was mit Gruppe 3 passiert. **Gruppe 1 ist damit der größte
Einzelposten und der nächste Angriff.**

## Quellen

- [Pocketing toolpath computation using an optimization method](https://www.sciencedirect.com/science/article/abs/pii/S0010448511001278) — B-Spline-Bahnen, Krümmung als **harte Nebenbedingung** (`|κ| < 1/r`) beim Erzeugen der Kurve, nicht als nachträgliches Ausrunden. Genau die Umkehrung unseres Vorgehens.
- [A hierarchical layout approach for underfloor heating systems](https://www.sciencedirect.com/science/article/abs/pii/S0378778822003796) — Energy & Buildings 2022, unser Problem wörtlich: Zerlegung in Routing (kürzester Pfad im Routing-Graph) + Coverage Path Planning, Tiefensuche auf Basisrechtecke. Volltext hinter Paywall (403).
- [Zugehöriges GitHub-Repo](https://github.com/Hei5enber9/HierarchicalLayoutApproachUFHsystem) — enthält nur Revit-/Ansys-Simulationsdaten, keinen Algorithmus.
- [A smooth spiral tool path for high speed machining of 2D pockets](https://www.sciencedirect.com/science/article/abs/pii/S0010448509001031)
- [Spiral toolpath generation method for pocket machining](https://www.sciencedirect.com/science/article/abs/pii/S0360835219306114)
- [MagiCAD: Machine-Learning-Routing für Fußbodenheizung](https://www.magicad.com/tools/machine-learning-algorithm-for-automatic-routing-of-underfloor-heating-circuits-2/) — kommerzieller Stand der Technik, bestätigt Zielgröße „Temperaturgradient minimieren".
