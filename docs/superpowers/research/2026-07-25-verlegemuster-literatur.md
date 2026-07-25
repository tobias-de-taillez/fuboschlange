# Literaturrecherche: Verlegemuster kreuzungsfrei berechnen

**Datum:** 2026-07-25
**Anlass:** Der Verlegeplaner erreicht die vier harten Bench-Kriterien nicht. Frage: gibt es Literatur, die das Problem „eine Fläche mit einer Kurve füllen, ohne Kreuzungen" gelöst hat?
**Antwort:** Ja, aber nicht in der Heizungsliteratur. Sie ist gelöst — mit Beweis — im CAM-Pocket-Machining.

## 0. Der Split, der die Suche entscheidet

Zwei getrennte Literaturen benutzen die Wörter „Fußbodenheizung berechnen":

| | **A — thermisch/normativ** | **B — geometrisch/algorithmisch** |
|---|---|---|
| Quellen | EN 1264, DIN EN ISO 11855, Herstellerunterlagen | CAM Pocket-Machining, 3D-Druck-Infill, Coverage Path Planning |
| Antwortet | W/m² bei Abstand X, Oberflächentemperatur-Limits, Zonen | eine durchgehende Kurve, kreuzungsfrei, konstanter Abstand, beschränkte Krümmung, beide Enden an einem Punkt |
| Relevanz für unsere Bench-Kriterien | 0 % | **100 %** |

Nicht suchen: Queries, die „underfloor heating" mit „optimization/algorithm" mischen. Sie landen in einem dritten Haufen (CFD-Studien zu thermischer Gleichmäßigkeit), der nichts zur Geometrie sagt.

Ebenfalls nicht suchen: Topologieoptimierung von Kanälen, Constructal Design, konforme Kühlkanäle, Hilbert-/Peano-Infill. Keins hält *konstanter Abstand + beschränkte Krümmung + zwei Enden an einem Ort* gleichzeitig. Hilbert verletzt den Biegeradius überall.

---

## 1. Literatur A — was die Norm tatsächlich vorgibt

### Leistungsrechnung
`q = K_H · (ΔΘ_H)^n` mit `K_H ≈ 6,7 W/(m²·K)`, `n ≈ 1,1`. ΔΘ_H = mittlere logarithmische Übertemperatur.

### Zonen und Temperaturgrenzen (EN 1264)
| Zone | max. Oberflächentemperatur | Bemerkung |
|---|---|---|
| Aufenthaltszone | 29 °C | ≈ 100 W/m² Obergrenze |
| Bad | 33 °C | |
| Randzone | 35 °C | max. **1 m breit** entlang der Außenwand, nicht für dauernden Aufenthalt |

### Verlegeabstand in der Praxis
100 mm (hoher Bedarf, Bad, Altbau) · 150 mm (Standard Neubau bei 25–40 W/m²) · 200 mm (gut gedämmt) · Randzone dichter.

**Norm-Toleranz:** Der ausgeführte Verlegeabstand darf nach EN 1264 höchstens **1 cm** vom geplanten Wert abweichen.

→ Das ist die brauchbarste Zahl der ganzen Norm-Recherche: sie quantifiziert, wie ungleichmäßig unser Feld sein darf. Als Bench-Kennzahl ist `max|s_ist − s_soll| ≤ 10 mm` schärfer und fachlich begründeter als „Deckung ≥ 40 %".

### Verlegemuster: Schnecke/bifilar vs. Mäander
- **Mäander:** Leistung am Vorlaufende am größten, Temperaturabfall von einer Raumseite zur anderen.
- **Schnecke/bifilar:** Vor- und Rücklauf liegen benachbart → gleichmäßige Oberflächentemperatur, keine kalten Stellen, tendenziell effizienter.
- CFD-Vergleichsstudien: die Unterschiede sind **klein** (Größenordnung 0,5–1 % in der Gleichmäßigkeit, Vorteil je nach Vorlauftemperatur wechselnd).

→ Konsequenz: thermische Feinoptimierung des Musters ist verschwendete Mühe. Der Gewinn liegt in **Verlegbarkeit** — genau dort, wo unser Bench misst.

### Biegeradius
5 × Außendurchmesser ist der verbreitete Wert (16 mm → 80 mm) und damit das **untere Ende** der Praxis. Einzelne Hersteller fordern deutlich mehr (Pipelife PE-RT: 20 × AD → 320 mm). Der Plan liegt also nicht konservativ, sondern am Limit.

---

## 2. Literatur B — die vier Ansätze, die das Problem lösen

### 2.1 Wellenfront auf dem Voronoi-Diagramm (Held & Spielberger)

Der reifste Ansatz. Kern: nicht Konturen offsetten und danach verketten, sondern eine **Welle** von einer Wurzel aus laufen lassen und die Wellenfronten zu diskreten Zeiten als Bahnen nehmen.

Konstruktion:
1. Modifiziertes Voronoi-Diagramm der Kontur ∂S berechnen (konvexe Faces).
2. Wurzel `r` wählen (siehe height-balanced root unten).
3. Zeitwerte und Geschwindigkeiten pro Voronoi-Knoten setzen.
4. Wellenfronten zu Zeiten `{0, Δ, 2Δ, …, rΔ}` mit `r = ⌈Hgt[Root]/δ′⌉`, `δ′ = 0,95·δ`.
5. Zwischen aufeinanderfolgenden Wellenfronten interpolieren („Konvexifizierung" über die obere konvexe Hülle).
6. Polyline mit tangentialen Kreisbögen glätten → G¹; Radius per Binärsuche in `[r_min, r_max]`, Reihenfolge über Priority-Queue.

**Garantien, nicht Testergebnisse:**
- *Kreuzungsfreiheit*: benachbarte Wellenfronten schneiden sich nicht, weil die Welle monoton nach außen läuft und die Faces konvex sind.
- *Bahnabstand*: „distance from each point on wavefront i to each of the wavefronts i−1 and i+1 is at most δ" — per Konstruktion, mit 5 % Sicherheitsreserve über `δ′`.

**Der Startpunkt ist nicht frei — er ist berechenbar.** Held definiert die *height-balanced root* des Medial-Axis-Baums und beweist ihre Eindeutigkeit; berechenbar in O(n). Experiment über 290 Pockets: wird der Start von `r*` weg zur Kontur verschoben, verschlechtern sich **alle** Qualitätsparameter monoton — Stepover-Variation, max. Krümmung, max. Eingriffswinkel und Pfadlänge.

**Langgestreckte Flächen brauchen ein Skelett, keinen Punkt.** Für ein Rechteck `l × w` mit `l ≫ w` ist die Zahl der Umläufe `⌈max(x/s*, (l−x)/s*)⌉`, minimal bei `x = l/2`. Für stark gestreckte oder verzweigte Flächen führt Held ein „Island" mit Fläche 0 ein — ein Skelett-Spine — und spiralt darum statt um einen Punkt. Kriterium für die Aufnahme einer Kante: `ℓ[e] + Hgt[m] ≥ 1,5·D`, überspannte Randlänge `> 2·D`, `Hgt[m] ≥ D`.

**Löcher/Notches werden per Bridge eliminiert.** Bridge-Point = Punkt auf dem Voronoi-Diagramm mit lokal minimaler Clearance, dessen zwei Clearance-Linien auf *verschiedenen* Konturen enden. Minimaler Spannbaum (Prim) über die Bridges verbindet alle Inselkonturen mit der Außenkontur; zweimaliges Durchlaufen jeder Bridge macht aus einer mehrfach zusammenhängenden Fläche **eine** Kurve — in O(n log n).

**Flächenzerlegung als Optimierungsproblem** (falls doch nötig), Zielfunktion:

```
o(D) := max SOV(S') + µ·(|D|−1) + ν/(|D|−1) · Σ |π/β − 1|
```

`SOV` = Stepover-Variation `s_max/s_min`, `β` = Schnittwinkel. Empfohlene Startwerte `µ = 0,8`, `ν = 0,5`; `µ = 2` wenn weniger Teilflächen gewünscht sind. Ergebnis über >1000 Pockets: Zerlegung senkt Stepover-Variation, max. Krümmung und Pfadlänge deutlich.

### 2.2 PDE-/Skalarfeld-Ansätze — mit dokumentierter Schwachstelle

Bieterman & Sandstrom lösen ein elliptisches Randwertproblem; die Niveaulinien *sind* der Pfad, per Radialinterpolation um den Mittelpunkt zur Spirale verkettet. Chuang & Yang nutzen eine Laplace-Reparametrisierung.

Held nennt zwei Grenzen dieser Familie explizit:
- Bieterman „works nicely for simple *nearly convex* pockets" — für allgemeinere Formen schwer anwendbar.
- „Since the isoparametrics obtained via the Laplace PDE tend to be **unevenly distributed if the pocket has bottlenecks**, fairly non-steady tool loads may occur along their paths."

→ Das ist die Warnung für unseren Eikonal-Weg: der Notch-Hals **ist** ein Bottleneck. Ungleichmäßige Isolinienabstände dort sind ein bekanntes Verhalten des Ansatzes, kein Implementierungsfehler.

### 2.3 Connected Fermat Spirals (Zhao et al., ACM TOG / SIGGRAPH 2016)

Löst genau die Eigenschaft, die wir für den Verteiler brauchen: „it is always possible to **start and end** a Fermat spiral fill at approximately the **same location on the outer boundary**".

Ablauf: Isokonturen mit festem Abstand erzeugen → *spiral connected graph* → *spiral connected tree* → Teilmenge der Isokonturen entsprechend dem Baum verbinden → eine Fermat-Spirale. Mehrere Teilgebiete werden über eine Graph-Traversierung (in Folgeimplementierungen Euler-Zug + DFS) zu einer global durchgehenden Kurve verkettet. Anders als Hilbert/Peano besteht das Ergebnis überwiegend aus **langen Bahnen niedriger Krümmung**.

### 2.4 Conformal Slit Mapping (2023) und Topology-Preserving Scalar Field (2025)

Neueste Linie: mehrfach zusammenhängendes Gebiet konform auf Kreis/Kreisring abbilden, Iso-Parameter offsetten. Vermeidet die Teilgebiets-Zerlegung ganz. Bahnabstand wird über den **maximalen Inkreisradius zwischen benachbarten Iso-Parametern** gesteuert. Gegenüber PDE-Verfahren: −12,34 % Bearbeitungszeit, −22,78 % Steering. Die 2025er Arbeit setzt darauf ein topologieerhaltendes Mesh-Deformationsproblem und gewinnt weitere +5,70 % Scallop-Gleichmäßigkeit; Nicht-Selbstschnitt wird als Mesh-Nebenbedingung geführt.

### 2.5 Wende-Geometrie: Ω-Kehre ist erzwungen

Aus der Coverage-Path-Planning-Literatur (Headland Turning), mit Reihenabstand `d` und Mindestwenderadius `R`:

```
d > 2R   →  U-Turn (Halbkreis) möglich
d < 2R   →  Ω-Turn (Bulb) oder Switch-Back Pflicht
```

Unser Fall: `2R = 160 mm`, `d ≤ 110 mm`. **`d < 2R` immer.** Ein Halbkreis-U-Turn ist bei keinem zulässigen Bahnabstand konstruierbar — auch nicht beim Spec-Default 150 mm. Die Ω-Kehre ist keine Notlösung, sondern die einzige Lösung.

Das deckt sich exakt mit der Zeile „U-Turn als expliziter Halbkreis-Bogen: Kreuzungen 40 → 52, Radius unverändert" in den verworfenen Ansätzen — der Versuch war geometrisch unmöglich, nicht schlecht implementiert.

Zweiter Befund derselben Literatur: Dubins- und Reeds-Shepp-Pfade haben an den Segmentgrenzen **unstetige Krümmung**. Gegenmittel sind Continuous-Curvature-Pfade mit Klothoiden-Übergängen.

---

## 3. Konsequenzen für den Implementierungsplan

| # | Befund | Konsequenz |
|---|---|---|
| 1 | Held: Start nahe der Kontur verschlechtert *alle* Qualitätsparameter monoton (290 Pockets) | **Konflikt mit Task 3.** Der Verteiler liegt per Definition an einer Wand — als Feldquelle ist er der schlechteste mögliche Startpunkt. Feld an der height-balanced root starten; die Verteiler-Eigenschaft „beide Enden am selben Randort" über den Fermat-Trick (2.3) holen, nicht über die Quellrandbedingung. |
| 2 | Langgestreckte Fläche braucht Spine, nicht Punkt | Raum ist 8000 × 3200 (Verhältnis 2,5). Medialachse als Startkurve → bifilare Arme laufen längs, Kehren nur an den Schmalseiten. Ersetzt die Ecken-Treppe. |
| 3 | Notch = Island → Bridge + MST bricht den Zyklus | Ersetzt `partition`-Zonen und die Notch-Sonderbehandlung. Aus mehrfach zusammenhängend wird **eine** Kurve, in O(n log n). |
| 4 | `d < 2R` ⇒ Ω-Kehre erzwungen | Bench-Kriterium minR ≥ 80 bei s ≤ 110 ist **nur** mit Ω-/Bulb-Kehren erfüllbar. Als Konstruktionsregel festschreiben, nicht als Glättungsergebnis erhoffen. |
| 5 | Laplace/PDE-Isolinien laufen an Bottlenecks ungleichmäßig | Der Notch-Hals ist ein Bottleneck. Gegenmittel: Zerlegung nach Zielfunktion (2.1) **oder** Conformal Slit Mapping (2.4), das ohne Zerlegung arbeitet. |
| 6 | Held rechnet mit `δ′ = 0,95·δ` | 5 % Reserve auf das Ziel-Spacing einbauen, statt den Sollwert exakt anzustreben. |
| 7 | EN 1264: Verlegeabstand darf max. 1 cm abweichen | Neue, normbasierte Bench-Kennzahl: `max|s_ist − s_soll| ≤ 10 mm`, bzw. Stepover-Variation `s_max/s_min` wie in der CAM-Literatur. Fachlich schärfer als „Deckung ≥ 40 %". |
| 8 | Krümmungssprung an Segmentgrenzen ist die bekannte Schwäche von Bogen/Gerade-Pfaden | Task 6 (tangentenstetige Segmente) erreicht G¹. Für ruhige Kehren zusätzlich Klothoiden-Übergänge erwägen (G²). |
| 9 | Schnecke vs. Mäander thermisch nur 0,5–1 % Unterschied | Keine Energie in thermische Musteroptimierung stecken. Verlegbarkeit ist der Hebel. |
| 10 | Biegeradius 5 × AD ist Praxis-Untergrenze, manche Hersteller 20 × AD | Vor der Ausführung den konkreten Rohrtyp prüfen. Bei 8 × AD (128 mm) verschärft sich Befund 4 dramatisch. |

## 4. Quellen

**Literatur B — Geometrie/Algorithmik**
- Held, M.; Spielberger, C.: *Improved Spiral High-Speed Machining of Multiply-Connected Pockets*, Computer-Aided Design & Applications 11(3), 2013, 346–357. doi:10.1080/16864360.2014.863508 — **Hauptquelle**, vollständig gelesen
- Held, M.; Spielberger, C.: *A Smooth Spiral Tool Path for High Speed Machining of 2D Pockets*, Computer-Aided Design 41(7), 2009, 539–550. doi:10.1016/j.cad.2009.04.002
- Bieterman, M. B.; Sandstrom, D. R.: *A Curvilinear Tool-Path Method for Pocket Machining*, ASME J. Manuf. Sci. Eng. 125(4), 2003, 709–715. doi:10.1115/1.1596579
- Chuang, J.-J.; Yang, D. C. H.: *A Laplace-Based Spiral Contouring Method for General Pocket Machining*, Int. J. Adv. Manuf. Tech. 34(7-8), 2007, 714–723
- Zhao, H. et al.: *Connected Fermat Spirals for Layered Fabrication*, ACM TOG (SIGGRAPH) 2016. doi:10.1145/2897824.2925958 — https://haisenzhao.github.io/CFS/
- *Spiral tool paths for high-speed machining of 2D pockets with or without islands*, J. Computational Design & Engineering 6(1), 2019, 105 — Wellenfront-/Voronoi-Konstruktion im Detail
- *Spiral Complete Coverage Path Planning Based on Conformal Slit Mapping in Multi-connected Domains*, arXiv:2309.10655
- *Topology-Preserving Scalar Field Optimization for Boundary-Conforming Spiral Toolpaths*, arXiv:2512.22502
- Höffmann, M. et al.: *Optimal guidance track generation for precision agriculture: A review of coverage path planning techniques*, J. Field Robotics 2024. doi:10.1002/rob.22286 — Review, Zitations-Hub für Wendegeometrie
- *Optimization-Based Motion Planning for Autonomous Agricultural Vehicles Turning in Constrained Headlands*, arXiv:2308.01117 — `d ≷ 2R`-Kriterium
- *Optimal Coverage Path Planning for Agricultural Vehicles with Curvature Constraints*, Agriculture 13(11), 2112. doi:10.3390/agriculture13112112

**Literatur A — Norm/Thermik**
- DIN EN 1264-1…-5 (Wasserdurchströmte Flächenheizungen), DIN EN ISO 11855
- *Comparative Numerical Study of Radiant Heating Floor by Spiral Pipe and Its Alternative to Serpentine Pipe*, IJHT 43(2). doi:10.18280/ijht.430224
- *Comparative numerical study of floor heating systems using parallel and spiral coil*, ScienceDirect S2468227624001339
- SBZ Monteur: *Fußbodenheizung mäandernd oder bifilar*
