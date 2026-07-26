# Kreuzungen: es sind die Anbindeleitungen, nicht die Randzone

**Datum:** 2026-07-26 (Runde 19)
**Frage:** `crossFails` steht bei 18/20 und ist das größte Gate. Wogegen kreuzt was?

## Attribution über die Bench-Konfigurationen

Dieselbe Paarungs-Frage wie in `11a7455`, aber über `crossingBench(20, 20260725)`
statt über einen eigenen Parametergenerator — also über exakt die Sätze, gegen
die `crossFails` zählt (Regel aus `a42b82f`).

Häufigste Paare:

```
  32  field x rand
  28  field x leadOut
  24  field x leadIn
  21  leadIn x leadOut        (im SELBEN Kreis)
  10  field x leadOut (versch. Kreise)
  10  leadIn x rand
```

Beteiligung je Teilstück:

```
  100  field      70  leadOut      67  leadIn      50  rand      1  mid
```

**Die Anbindeleitungen zusammen tragen 137 von 274 Kreuzungsenden — 50 %.** Die
Randzone liegt mit 50 auf Platz drei.

Das widerspricht `11a7455` („rand 895, field 602, leadOut 48, leadIn 35, die
Randzone hängt an 57 % aller Kreuzungsenden"). Die Ursache ist dieselbe wie bei
den zwei Radius-Attributionen: `probe-kreuzpaare.mjs` erzeugt seine Parameter
selbst (eigener PRNG, immer ein Notch, `s`/`randSpacing`/`randPasses`/
`windowEdges`/`loopMode` nie gesetzt) statt `crossingBench` zu benutzen. Das ist
jetzt der dritte Fall — die Regel steht in `a42b82f` und gilt weiter.

Nebenbefund derselben Sonde: **alle 32 `field x rand`-Kreuzungen liegen auf der
Bahn, keine einzige an einer Omega-Kehre** (Schwelle `omegaReach`). Die Kehren
sind also nicht die Kollisionsquelle, für die sie gehalten wurden.

## Der Korridor reserviert zu wenig — ist aber nicht die Ursache

Rechnerisch gefunden: `laneY(i) = base + (i+0,5)·LANE`, aber
`corridorW = laneCount·LANE·0,6 + LANE/2`. Damit liegt Spur `i` außerhalb des
reservierten Korridors, sobald

```
(n − 0,5)·LANE  >  0,6·n·LANE + 0,5·LANE   ⇔   0,4·n > 1   ⇔   n > 2,5
```

`laneCount() = 2·Kreise + 1`, also ab **einem** Kreis (n = 3) grenzwertig und bei
drei Kreisen (n = 7) klar verletzt: Spur 5 sitzt `0,8·LANE ≈ 61 mm` im Feld.

Der Faktor 0,6 kam aus `c49ab5b` („schmalerer Verteilerkorridor — covFails
12 → 11") und ist dort als Deckungsgewinn dokumentiert, ohne dass die
Containment-Bedingung nachgerechnet wurde.

Trotzdem gemessen und verworfen — den Korridor die Spuren wirklich enthalten zu
lassen macht die Kreuzungen **schlechter**:

```
corridorW                                    cross  cov  rad  out  medX  medCov
laneCount·LANE·0,6 + LANE/2  (jetzt)           18    10   18    0     3     40
laneCount·LANE·0,8 + LANE/2                    19    10   18    0     4     40
laneCount·LANE·1,0 + LANE/2                    19    11   18    0     3     39
2·Kreise·LANE + LANE/2  (genau die Spuren)     19    11   18    0     3     39
```

Deckt sich mit dem alten Befund „jede Verschmälerung kostet genau einen
crossFail", nur andersherum gelesen: der breitere Korridor schiebt das Feld
weiter von der Verteilerwand weg, die Zuleitungen werden länger und queren mehr.
Der Geometriefehler ist real, der Hebel liegt woanders.

## Wo die Zuleitungen wirklich kreuzen

Die 21 `leadIn × leadOut`-Kreuzungen im selben Kreis nach Ort im Frame:

```
  12  im FELD (oberhalb fieldInset)
   8  im Korridor
   1  unterhalb
```

Die Spurhöhen der Kreuzungspunkte reichen bis **103 und 115 Vielfache von
`LANE`** — also mehrere Meter über der Korridorbasis. Die Zuleitungen bleiben
nicht im Korridor, sie laufen quer durch das fertige Feld.

## Der Router ist nicht schuld, die Zielpunkte sind es

74 Zuleitungen vermessen, Luftlinie gegen tatsächliche Weglänge:

```
  Luftlinie    Median   861 mm    max 10 513 mm
  Weglaenge    Median  1083 mm    max 13 356 mm
  Umwegfaktor  Median  1,16       max 4,34
  Anteil mit Umweg > 2:    11 %
  Anteil Luftlinie > 2 m:  16 %
```

Ein Umwegfaktor von 1,16 im Median heißt: der Manhattan-Router über die Spuren
arbeitet für den Normalfall gut. Das Problem sind die **16 % der Zuleitungen mit
einem Ziel über 2 m Entfernung** — die müssen zwangsläufig Ringe queren, egal wie
gut geroutet wird. Bei mehreren Kreisen liegt der Feldanfang jeder Zone in ihrer
eigenen Zone, und die kann weit vom Verteiler entfernt sein.

Damit ist die Aussage der README („das Spurmodell für die Zuleitungen ist zu
starr") zu präzisieren: **nicht das Spurmodell ist zu starr, sondern die
Zielpunkte liegen falsch.**

## Was die Literatur dazu sagt

Hinduja et al., *Offset tool-path linking for pocket machining* (CAD 2001) und
die Voronoi-Variante (Proc. IMechE B, 2010) lösen genau diese Frage für
konturparallele Bahnen: ein **TPE-Netz** über die Eltern-Kind-Beziehung der
Offsetkurven, und die Verbindung wird durch dieses Netz geroutet statt frei durch
die Fläche. Das garantiert null Rückzüge und, weil nur entlang der
Verschachtelung verbunden wird, keine Querung.

Übertragen: eine Zuleitung darf das Feld **nur am äußersten Ring betreten**. Dann
kreuzt sie per Konstruktion keinen Ring. Der nächste Schritt ist damit nicht ein
besserer Router, sondern die Forderung, dass Anfang und Ende jedes Feldpfades auf
dem äußersten Ring liegen, und zwar an der verteilernächsten Stelle — für jede
Zone einzeln.

## Quellen

- Hinduja, S. et al.: *Offset tool-path linking for pocket machining*,
  Computer-Aided Design 33(2), 2001. doi:10.1016/S0010-4485(01)00088-4
- Hinduja, S.; Mansor, M. S. A.; Owodunni, O. O.: *Voronoi-diagram-based linking
  of contour-parallel tool paths for 2½D closed-pocket machining*, Proc. IMechE
  Part B 224(2), 2010. doi:10.1243/09544054JEM1596
- River Routing (Einlagen-Verdrahtung): eine kreuzungsfreie Verdrahtung zwischen
  zwei Anschlussreihen existiert genau dann, wenn die Reihenfolge auf beiden
  Seiten übereinstimmt. `verlegeplan.html:2293` wendet diese Bedingung am
  Verteilerbalken bereits an (`inLeft = r.head.x <= r.tail.x`) — sie reicht
  nicht, weil die Kreuzungen nicht am Balken entstehen, sondern im Feld.

---

## Nachtrag: das ferne Ziel ist der Randzonen-Anfang

Der Pfad eines Kreises ist `leadIn → rand → mid → field → leadOut`. `leadIn`
zielt also nicht auf das Feld, sondern auf den **Anfang der Randzonen-Kette** —
und die liegt an den Fensterwänden, die dem Verteiler gegenüberliegen können.

Gemessen, Abstand des `leadIn`-Ziels zum Verteiler:

```
  mit Randzone    n= 5   Median  3001 mm   max 10 535 mm
  ohne Randzone   n=32   Median   808 mm   max  3 874 mm
```

Ein Faktor **3,7 im Median**. Damit sind die 16 % weiten Zuleitungen aus der
Messung oben identifiziert: es sind genau die Kreise mit Randzone. Der Feldanfang
liegt dagegen im Median 808 mm vom Verteiler — der ist nicht das Problem.

Zwei Ansätze für die nächste Runde, beide klein genug für ein A/B:

1. **Die Randzonen-Kette am verteilernahen Ende beginnen.** Rein eine
   Orientierungsentscheidung. Kostet dafür Länge beim `mid`-Verbinder, der dann
   vom fernen Kettenende zum Feldanfang muss — der Tausch ist zu messen, nicht
   herzuleiten.
2. **Die Zuleitung an der Wand entlang führen statt durch das Feld.**
   `contourRoute` existiert bereits, wird aber nur als Notausgang benutzt, wenn
   eine Leitung aus dem Raum läuft (`verlegeplan.html:2238`). Für weite Ziele
   wäre sie der Normalweg: entlang der Kontur liegt per Konstruktion kein Feld.
