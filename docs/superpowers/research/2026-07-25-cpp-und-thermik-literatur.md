# Coverage Path Planning + Fußbodenheizungs-Thermik — was aus 9 Papern für dieses Tool folgt

**Datum:** 2026-07-25
**Anlass:** Gemessen (siehe Commits d447424..388e280): Mehrkreis-Aufteilung senkt die
Deckung von 44 % auf 31 %, Kreuzungen bleiben, Biegeradius bleibt 100 % rot.
Frage an die Literatur: liegt das an der Umsetzung oder am Ansatz?

Gelesen: Bähnemann 2019 (arXiv:1907.09224), Shahid 2024 (arXiv:2411.07053),
Manzini & Murphy 2024 (arXiv:2309.09882), Zaidan & Jasim 2025 (IJHT 43.02.24),
Ding 2020 (Appl. Therm. Eng.), Chae/Lee/Park 2011 (JZUS-A), Meng 2011 (IEEE),
Yang 2022 (Energy & Buildings), lee2010.

---

## Befund 1 — Unsere Deckungs-Kennzahl misst nicht Physik (Ding 2020, Meng 2011)

`heatCoverage` zählt den Flächenanteil im Umkreis von ±25 mm um ein Rohr. Das ist ein
geometrischer Stellvertreter, keine Wärmegröße. Ding 2020 löst dasselbe Problem
analytisch (Gl. 5): das Temperaturfeld über der Rohrebene ist eine Fourier-Reihe, deren
Welligkeit mit `exp(-2πs·y/L)` abklingt — `L` = Bahnabstand, `y` = Höhe über der
Rohrebene. Die Ungleichmäßigkeit an der Oberfläche hängt also von `L/y` ab, nicht von
einem Radius um das Rohr.

Meng 2011 misst genau das an realen Aufbauten (Fig. 2, Fig. 4):

| Bahnabstand | Oberflächen-Temperaturhub |
|---|---|
| 100 mm | ~0,4 K |
| 150 mm | ~1,2 K |
| 300 mm | **2,6 K**, Mittel fällt unter 24 °C |

Konsequenz für uns: das Kriterium „Deckung >= 40 %" hat eine harte Obergrenze von
`2·25/s` (gemessen: min 45,5 %, median 52,6 % über die Bench-Parametersätze) und sagt
dabei nichts über Komfort. Die physikalisch richtige Zielgröße ist der
**Oberflächen-Temperaturhub**, den unser Thermik-Modul bereits rechnet. Der Umstieg
ersetzt ein knappes, unphysikalisches Gate durch ein aussagekräftiges.

Ding liefert nebenbei die Bestätigung eines Werts, den wir schon benutzen: der
Gesamt-Wärmeübergangskoeffizient Boden→Raum wird als 10,8 W/(m²·°C) angesetzt.

## Befund 2 — Die Mehrkreis-Aufteilung ist die falsche Zerlegung (Bähnemann §3.2, Shahid)

Gemessen an unserem Raum, 48 Verteilerpositionen:

| Kreise | covFails | schlechteste Deckung | medianCross |
|---|---|---|---|
| 1 | **0/48** | 44 % | 18 |
| 2 | 9/48 | 37 % | 15 |
| 3 (nötig, ~205 m) | 30/48 | 31 % | 28 |

`partition()` halbiert das größere Rechteck — ein willkürlicher geometrischer Schnitt.
Jede Teilfläche bekommt dadurch eigenen Wandabstand und eigenen Korridor, der
Rand-Overhead vervielfacht sich.

Beide CPP-Paper machen es umgekehrt herum:

- **Shahid** zerlegt am Sweep-Line-Verfahren in konvexe Teilpolygone, baut einen
  Adjazenzgraphen und **führt die Teile über Zusammenhangskomponenten (DFS) wieder
  zusammen**, ausdrücklich um *längere durchgehende* Boustrophedon-Pfade zu bekommen.
  Zerlegen ist Mittel zum Zweck, nicht Ziel.
- **Bähnemann** wählt die Zerlegungsrichtung nach der kleinsten Höhensumme
  `w = Σ(y_max,i − y_min,i)` (Gl. 1) — das minimiert die Zahl der Bahnen — und ordnet
  die Zellen als E-GTSP über 4 Sweep-Permutationen je Zelle und Richtung, mit
  Übergängen über den reduzierten Sichtbarkeitsgraphen. 14 % kürzer als reines TSP.

Für unseren Fall folgt daraus etwas Einfacheres als ein GTSP: **Füllung und
Kreisaufteilung sind getrennte Probleme.** Den Raum als EINE durchgehende Spirale
füllen, diese Kurve danach in 3 Stücke gleicher Bogenlänge schneiden. Gleiche Länge
heißt gleicher Druckverlust, also hydraulisch balanciert — was der Kontext-Text
ebenfalls fordert (Aufteilung nach Leistung/Δp statt nach Fläche).

Die Schnittpunkte gehören an die Naht, wo der Pfad ohnehin am Verteilerkorridor
vorbeiläuft. Dann liegen alle 6 Rohrenden im Korridor und keine Anbindeleitung quert
das Feld — dieselbe Mechanik, die heute schon 25 Kreuzungen beseitigt hat (5a4af1d).

## Befund 3 — Straight-Skeleton-Offset statt Distanzfeld-Isolinien (Shahid)

Wörtlich: das Straight-Skeleton-Verfahren erzeugt Offsets durch Wellenfront-Propagation
und **erhält scharfe Ecken**, außerdem vermeidet es selbstschneidende Geometrie per
Konstruktion.

Unsere Isolinien tun beides nicht: sie runden konvexe Ecken mit dem Radius des
jeweiligen Niveaus ab. Genau dort lag die früher gemessene tote Zone von 807 mm in der
konvexen Ecke des L. Und „vermeidet Selbstschnitte per Konstruktion" ist wörtlich
unser offenes Kreuzungsproblem.

Das ist der am direktesten übertragbare Befund der ganzen Sammlung.

## Befund 4 — Spirale bleibt richtig (Zaidan & Jasim 2025)

Direkter CFD-Vergleich Spirale vs. Doppelmäander, 50/55/60 °C, 3–12 l/min:

- Spirale: gleichmäßigere Oberflächentemperatur über alle Eintrittstemperaturen,
  „surpasses the serpentine design in terms of uniform heat distribution".
- Mäander: ~15 % mehr Wärmeeintrag bei 55 °C, aber sichtbare Streifenbildung
  („banding effect"), weil die lineare Rohrführung den seitlichen Wärmetransport begrenzt.
- **Beide** zeigen kalte Zonen an der Peripherie („restricted lateral heat transport").

Damit ist unsere Architektur bestätigt: bifilare Gegenstromschnecke im Feld **plus**
verdichtete Randzone an den Fensterfronten. Kein Musterwechsel nötig.

## Befund 5 — Wasserabkühlung ist exponentiell, nicht linear (Chae/Lee/Park 2011)

Gl. 19–21: `T_out = T_in − ε·(T_in − T_air)`, `ε = 1 − exp(−NTU)`,
`NTU = U_total/(ṁ·c_p)`.

Unser `thermalPipeTemp` fällt linear von Vorlauf auf Rücklauf. Der Kontext-Text nennt
dieselbe Form (`T_W(s) = T_R + (T_V − T_R)·e^(−Cs)`). Kleiner Eingriff, macht die
Heatmap physikalisch richtig — und verschiebt die Gewichtung: der Vorlaufanfang ist
heißer als bisher gezeichnet, das Ende flacher.

## Befund 6 — Kein kontinuierlicher Optimierer (Manzini & Murphy 2024)

Sie bauen eine differenzierbare Darstellung von Boustrophedon-Pfaden und stellen fest,
dass die Zielfunktion „intensely non-convex" ist: Gradientenabstieg scheitert, eine
simple Rastersuche war im Mittel um 0,136 besser. Zwei Ursachen benennen sie —
kleiner Bahnabstand und hohes Seitenverhältnis des Polygons. Beides trifft auf uns zu
(s = 75..110 mm, Raum 8000×3200 = 2,5).

Das deckt sich mit unserer eigenen Messung: das Kraftmodell (`relaxLoops`) ist ein
lokaler Gradientenverfahren-Verwandter und hat alle vier Kriterien verschlechtert
(22e18a5). Konsequenz: keine kontinuierliche Nachoptimierung, sondern **diskrete
Kandidaten erzeugen und den besten messen** — also `autofit` erweitern (mehrere
Nahtpositionen, Sweep-Richtungen), statt eine fertige Verlegung nachzuschieben.

## Befund 7 — Bahnabstand nicht blind minimieren (Meng 2011, Yang 2022)

Yang 2022 findet für ein sehr gut gedämmtes NZEB mit Niedertemperatur-Fernwärme
**300 mm** als optimalen Bahnabstand. Meng 2011 misst bei direktverdampfendem System
sogar *höheren* Wärmestrom bei 150 mm (47,3 W/m²) als bei 100 mm (41,35 W/m²), weil das
treibende Temperaturgefälle im Estrich sinkt.

Beides ist nicht direkt übertragbar (anderes Medium, andere Dämmung), aber es begrenzt
die Aussage „enger ist besser". Für diesen Raum bleibt eng richtig: drei Fensterwände,
hohe Verlustlast. Der Befund gehört trotzdem notiert, falls der Bahnabstand später zur
freien Variablen wird.

---

## Was daraus als Arbeitsreihenfolge folgt

1. **Eine Spirale, danach in 3 Kreise schneiden** statt den Raum in 3 Zonen zu
   partitionieren. Gemessenes Ziel: Deckung 31 % -> 44 %, covFails 30/48 -> 0/48.
   Schnitte an der Naht, damit alle Enden im Korridor liegen.
2. **Straight-Skeleton-Offset** statt Distanzfeld-Isolinien: scharfe Ecken, keine
   Selbstschnitte per Konstruktion. Zielt auf die verbliebenen Kreuzungen und die
   Eckenlücke.
3. **Deckungs-Gate auf Oberflächen-Temperaturhub umstellen.** Physikalisch richtig und
   nicht künstlich gedeckelt.
4. Exponentielle Abkühlung in `thermalPipeTemp`.

Nicht verfolgen: E-GTSP-Zellordnung (unser Raum hat nach dem Verschmelzen genau eine
Zelle), differenzierbare Pfaddarstellung (nicht-konvex, die Autoren raten selbst ab),
Musterwechsel zum Mäander (thermisch schlechter).
