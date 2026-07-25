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

---

# Nachtrag Runde 17 — die Randzonen-Kehre war falsch konstruiert

Die Vermutung aus dem Hauptteil ("Gruppe 1 ist der Verteiler-Abgang") war
**falsch**. `probe-teil.mjs` misst, in welchem Teilstueck der schaerfste Punkt
liegt, und antwortet eindeutig:

    schlimmster Punkt liegt in: {"rand":10,"leadOut":5,"field":5}

Die Signatur `defl 90°, ab=50, bc=160` ist `randSpacing` gegen `2*bendRadius`
— also die **Omega-Kehre der Randzone**, nicht der Verteiler.

## Der Defekt

`omegaTurn` war Bogen – **Gerade** – Bogen:

    A  = Pe + u*R + n*R        (arc)
    B  = Pe + u*R + n*(R+d)    <- kein arc
    C2 = Pe - u*R + n*(R+d)    (arc)

`A→B = n*d = 50`, `B→C2 = -u*2R = 160`, dazwischen 90°. Erste Vermutung: `B→C2`
ist eine Sehne von 2R bei r=R, also ein 180°-Bogen, dessen Anfangstangente
senkrecht auf der Sehne steht — dann waere die Ecke nur ein Messartefakt.

`probe-omega.mjs` misst den Umkreis dreier benachbarter Punkte des
**gezeichneten** Pfades und widerlegt das:

    kleinster Radius laut pathCurve (Polygon): 50.0 mm
    kleinster Radius am GEZEICHNETEN Pfad:     43.0 mm
    davon wirklich unter 80 mm: 33 von 63

Die Ecke ist echt, und gezeichnet sogar enger als geschaetzt. Gut, dass die
Kennzahl nicht auf die Vermutung hin gelockert wurde.

## Die Konstruktion

Zwei parallele Bahnen im Abstand `d < 2R` mit Boegen vom Radius R zu verbinden
geht nur als Ausschwung: erst um θ **vom** Ziel weg, dann ein Gegenbogen ueber
`180+2θ`, dann um θ zurueck. Netto 180°. Der seitliche Versatz ist die Summe
der drei n-Anteile:

    d = R(cos θ − 1) + 2R cos θ + R(cos θ − 1) = R(4 cos θ − 2)
    →   cos θ = (d + 2R) / (4R)

θ=0 ist die gewoehnliche Kehre mit `d = 2R`; je enger die Teilung, desto weiter
schwingt die Schlaufe aus. Fuer `d=50, R=80`: θ = 49,0°.

Der grosse Bogen liegt laengs bei `2R sin θ`, sein Rand also `R` weiter — die
noetige Ausschwungweite ist `R(2 sin θ + 1)`, fuer unsere Werte 201 mm statt der
frueher pauschal angesetzten 80 mm. Als `omegaReach()` an `endGap` und
`omegaClear()` gehaengt.

## Gemessen

| | crossFails | covFails | radFails | outFails | medianRadius | medianGap |
|---|---|---|---|---|---|---|
| vorher | 18 | 10 | 19 | 0 | 46 | 1083 |
| Drei-Bogen-Kehre | 18 | 10 | 19 | 0 | **50** | **1048** |

Die Gates bewegen sich nicht, weil andere Gruppen binden (`field` mit Schenkeln
von 3–13 mm, `leadOut` mit 25 mm). Der Beleg ist trotzdem hart:

    an den Omega-Stellen, gezeichnet:  43.0 mm  ->  319.5 mm
    davon unter 80 mm:                 33       ->  0
    Teilstueck-Verteilung "rand":      10/20    ->  2/20

## Was der Fix freilegt

Dieselbe Probe zeigt jetzt das umgekehrte Vorzeichen:

    kleinster Radius laut pathCurve (Polygon): 14.2 mm
    kleinster Radius am GEZEICHNETEN Pfad:     319.5 mm

`pathCurve` ueberspringt die Kruemmungsrechnung nur, wenn der Punkt SELBST eine
Bogenstuetze ist — nicht, wenn der FOLGEPUNKT eine ist. An den drei dicht
beieinander liegenden Omega-Stuetzpunkten liest es deshalb Sehnen als Ecken.
`radFails` ist an diesen Stellen **zu hoch gemeldet**. Naechster Schritt, und
diesmal mit dem gezeichneten Pfad als Referenz statt mit einer Vermutung.

## Quellen

- [LiDAR 2.0: Hierarchical Curvy Waveguide Detailed Routing, arXiv:2505.17239](https://arxiv.org/html/2505.17239) — "Congested Port Spreading": *"We add 5 units of extension length for each grid shift, ensuring they occupy distinct routing tracks and satisfying the minimum bend radius."* Auslauflaenge proportional zum Portindex. PDF in `paper/2505.17239_LiDAR2.pdf`.
- [Luceda ManhattanFanout](https://academy.lucedaphotonics.com/ipkiss/reference/connectors/ref/ipkiss3.all.ManhattanFanout) / [FanoutPorts](https://academy.lucedaphotonics.com/ipkiss/picazzo/containers/fanout_ports/ref/picazzo3.container.fanout_ports.FanoutPorts) — gestaffelter Auslauf als Standard-Primitive.
- [Bend radius, Wikipedia](https://en.wikipedia.org/wiki/Bend_radius)
- [Serpentine Routing, sfcircuits](https://www.sfcircuits.com/pcb-school/serpentine-routing) — engere U-Kehren erhoehen die Diskontinuitaet; dieselbe Geometrie, andere Domaene.

---

# Nachtrag Runde 19 — wogegen kreuzt es, und zwei Korrekturen

## Korrektur zu Runde 18

Dort stand: "randPasses=2 (Omega AN) 847 Kreuzungen gegen randPasses=1 (AUS) 272,
also ist das Omega die Quelle." Das ist **keine saubere Isolierung**. `randPasses=1`
schaltet ueber `omegaOn()` auch `omegaClear()` ab, und damit schrumpft
`fieldInset()` um `omegaReach()+LANE()/2` = 237 mm — das Feld rueckt 237 mm naeher
an die Wand, die ganze Aufteilung aendert sich. Der Vergleich misst zwei Dinge
gleichzeitig.

## Was gemessen wurde

`probe-kreuzpaare.mjs` behaelt fuer jedes Segment seine Herkunft (Kreis +
Teilstueck) und zaehlt, welche Teilstuecke sich kreuzen. 20 Laeufe:

| Anzahl | Paar |
|---|---|
| 426 | `field x rand` |
| 148 | `rand x rand` |
| 138 | `field x rand` (verschiedene Kreise) |
| 23 | `leadOut x rand` |
| 13 | `field x leadIn` |
| 10 | `field x field` |

Beteiligung je Teilstueck: `rand` 895, `field` 602, `leadOut` 48, `leadIn` 35,
`mid` 2. **Die Randzone ist an rund 57 % aller Kreuzungsenden beteiligt** und
`field x rand` ist mit Abstand das haeufigste Paar. Das ist das Ziel.

## Korrektur zur eigenen Sonde

Die Sonde sollte zusaetzlich sagen, WO diese Kreuzungen liegen, und meldete
Wandabstaende von 82 bis 2653 mm bei einem Randzonenband von nur 100 mm Tiefe.
`probe-randlage.mjs` widerspricht dem direkt: das `rand`-Polygon liegt ueber alle
20 Laeufe zwischen 168 und 391 mm von einer Wand.

Die Sonde hat unrecht, nicht das Programm. Der Beleg kam aus ihr selbst:

    Punkt 542 mm von Wand | rand(max 300) x field(max 2035)

Ein Kreuzungspunkt auf einer rand-Strecke kann nicht weiter von der Wand liegen
als der entfernteste Stuetzpunkt dieser Strecke — es sei denn, das Mass ist nicht
konvex. Genau das ist der Fall: "Abstand zur naechsten Wand" ist ein MINIMUM
konvexer Funktionen. Ueber einer Strecke, die eine einspringende Ecke ueberspannt,
kann der Wert in der Mitte ueber beide Endwerte steigen.

Die Wandabstands-Ausgabe ist deshalb abgeschaltet und der Grund im Code
vermerkt, damit niemand sie wieder einschaltet. Die Paar-Statistik haengt nicht
an dieser Rechnung und bleibt gueltig.

## Stand

Keine Codeaenderung an `verlegeplan.html` diese Runde — es gab nichts zu
verwerfen und nichts zu behalten. Bench unveraendert: crossFails 18/20,
covFails 10/20, radFails 19/20, outFails 0/20.

Naechster Schritt: `field x rand` sauber lokalisieren, mit einem Mass, das
haelt — Abstand zur ZUGEHOERIGEN Wand der Randzonenkette statt zur naechsten
beliebigen, oder direkt die Bogenlaenge entlang der Kette.

## Quellen

- [Continuous Curvature Path Planning for Headland Coverage With Agricultural Robots, J. Field Robotics 2025](https://onlinelibrary.wiley.com/doi/full/10.1002/rob.22489) — Kopfland-Planung als eigenes Problem, stetige Kruemmung fuer konvexe und konkave Ecken.
- [Smooth turning path generation for agricultural vehicles in headlands](https://www.researchgate.net/publication/282409353_Smooth_turning_path_generation_for_agricultural_vehicles_in_headlands) — Typ U, Typ Ω und Typ T als die drei klassischen Wendeformen.
- [Dynamic path planning method for headland turning of unmanned agricultural vehicles](https://www.sciencedirect.com/science/article/abs/pii/S016816992300087X) — omega-turn, U-turn, gap-turn und fishtail-turn im Vergleich; ausdruecklich auch Uebergaenge zwischen NICHT benachbarten Reihen.
