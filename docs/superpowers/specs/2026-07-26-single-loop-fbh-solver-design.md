# Einzelkreis-FBH-Solver für beliebige einfache Polygone — Design

**Datum:** 2026-07-26  
**Status:** Vom Nutzer in drei Designabschnitten freigegeben

## 1. Zweck

Dieses Projekt ersetzt die bisherige, auf Rechtecke und L-Formen spezialisierte
Geometrie durch einen neuen Solver für genau einen Fußbodenheizkreis in einem
beliebigen einfachen Polygon. Der Solver erzeugt ausschließlich eine
kontinuierliche bifilare Doppelspirale und gibt den verlegbaren Rohrmittelpfad
als tangentiale Linien- und Kreisbogenprimitive aus.

Die Neuentwicklung entsteht zunächst vollständig getrennt von
`verlegeplan.html`. Eine spätere Integration ist möglich, gehört aber nicht zu
diesem Projekt.

## 2. Fachliche Begriffe und Maße

- Alle Koordinaten und Längen werden in Millimetern angegeben.
- Alle Abstände beziehen sich auf die **Rohrmittellinie**.
- Das Rohr hat 16 mm Außendurchmesser und damit 8 mm Außenradius.
- Das Eingabepolygon beschreibt die gesamte Bodenfläche inklusive Wandzonen.
- Eine **Windung** ist ein zur Flächenbelegung gehörender Abschnitt eines der
  beiden ineinanderliegenden Spiralarme. Anschlussleitungen und innerer Turn
  sind keine nominalen Windungen.
- Der geordnete Ausgabepfad beginnt an einem Port, läuft in die Spirale hinein,
  durch den inneren Turn und auf dem zweiten Arm zum anderen Port zurück.
- Ein **Kandidat** ist ein vollständiger Pfad inklusive beider
  Anschlussleitungen und innerem Turn. Teilpfade werden nie als Lösung
  zurückgegeben.

## 3. Geltungsbereich

### 3.1 Unterstützt

- Ein einfaches Polygon aus geraden Kanten.
- Beliebig konkave Formen ohne Löcher.
- Genau ein Heizkreis.
- Genau eine bifilare Doppelspirale als Verlegemuster.
- Ein Anschluss an einer ausgewählten Polygonkante.
- Statische Ausführung im Browser über Rust/WASM und Web Worker.
- Exakte Vektorausgabe aus tangentialen `Line | Arc`-Primitiven.

### 3.2 Nicht unterstützt

- Löcher, Säulen oder innere Ausschlussflächen in der Eingabe.
- Mehrere Räume oder mehrere Kreise.
- Serpentinen-, Boustrophedon- oder gemischte Verlegemuster.
- Automatische Kreisteilung.
- Gebogene Eingabekanten.
- Randzonen mit abweichender Solltemperatur oder gesondertem Verlegeabstand.
- Hydraulische Druckverlust-, Durchfluss- oder Vorlauftemperaturberechnung.
- CFD- oder thermische Komfortsimulation.
- Direkte Änderung oder Integration von `verlegeplan.html`.

## 4. Harte Anforderungen

| Anforderung | Festlegung |
|---|---|
| Rohrdurchmesser | 16 mm |
| Referenz aller Abstände | Rohrmittellinie |
| Mindestbiegeradius | 80 mm |
| Nichtlokaler Rohrabstand | mindestens 50 mm |
| Wandabstand | Eingabe, mindestens 8 mm |
| Angeforderter Abstand | 50 bis 250 mm einschließlich |
| Maximale Gesamtlänge | 100.000 mm einschließlich |
| Topologie | genau eine kontinuierliche bifilare Doppelspirale |
| Polygon | einfach, gerade Kanten, keine Löcher |
| Ausgabegeometrie | geordnete tangentiale `Line | Arc`-Primitive |
| Kreuzungen | keine Selbstkreuzung oder nichtbenachbarte Berührung |
| Polygonverlassen | kein Teil des Rohrmittelpfads außerhalb des Polygons |

Der angeforderte Abstand ist ein nominaler Zielwert und keine harte lokale
Gleichheitsbedingung. Lokale Abweichungen sind insbesondere am inneren
80-mm-Turn, an konkaven Bereichen und an den Anschlussleitungen zulässig. Sie
werden gemessen und ausgegeben. Die harte untere Grenze von 50 mm bleibt für
alle nichtlokalen Rohrteile bestehen.

## 5. Anschlussmodell

Die Eingabe legt den Anschluss durch einen Kantenindex und einen Abstand des
Anschlussmittelpunkts vom Anfang dieser Eingabekante fest:

```ts
interface ConnectionInput {
  edgeIndex: number;
  centerOffsetMm: number;
}
```

Die Orientierung und Nummerierung beziehen sich immer auf das unveränderte
Eingabepolygon. Internes Drehen der Polygonorientierung darf die Bedeutung des
Kantenindex nicht verändern.

Die beiden Ports liegen jeweils 25 mm entlang der Kante vor und hinter dem
Anschlussmittelpunkt. Der Mittelpunkt muss deshalb mindestens 58 mm von beiden
Kantenendpunkten entfernt sein:

```text
25 mm Portversatz + 8 mm Rohrradius + 25 mm Eckreserve = 58 mm
```

Damit gelten folgende Regeln:

1. Eine Kante unter 116 mm liefert `NO_VALID_CONNECTION_ON_EDGE`.
2. Bei exakt 116 mm existiert genau eine gültige Mittelpunktposition.
3. Ein Mittelpunkt außerhalb des gültigen Intervalls wird auf den nächsten
   gültigen Punkt derselben Kante verschoben.
4. Diese Verschiebung ist die einzige erlaubte automatische Korrektur einer
   fachlichen Eingabe und erzeugt `CONNECTION_SHIFTED`.
5. Beide Pfadenden liegen exakt auf den normalisierten Ports.
6. Die geometrische Tangente ist an beiden Ports orthogonal zur Wand. In
   Pfadrichtung zeigt die Starttangente nach innen und die Endtangente nach
   außen.

### 5.1 Wandabstandszone der Anschlüsse

Die Wandabstandszone ist der Teil des Originalpolygons, dessen Abstand zur
Polygonbegrenzung kleiner als `wallClearanceMm` ist. Nur der vom jeweiligen
Port aus betrachtete Anschlussast darf diese Zone benutzen.

- Der Anschluss darf bereits innerhalb dieser Zone zu kurven beginnen.
- Sobald ein Anschlussast die Zone in Richtung Innenraum verlassen hat, darf
  er sie nicht wieder betreten.
- Für den Endanschluss wird dieselbe Regel vom Endport rückwärts in Richtung
  Innenraum geprüft.
- Auch innerhalb der Ausnahmezone muss der Rohrmittelpfad vollständig im
  Originalpolygon liegen und kreuzungsfrei bleiben.
- Außerhalb der Ausnahmezone gilt der normale Wandabstand.

## 6. Öffentliche TypeScript-Schnittstelle

### 6.1 Eingabe

```ts
interface Point {
  x: number;
  y: number;
}

interface SolveSingleLoopInput {
  polygon: Point[];
  connection: {
    edgeIndex: number;
    centerOffsetMm: number;
  };
  requestedSpacingMm: number;
  wallClearanceMm: number;
}
```

Der direkte WASM-Aufruf ist synchron:

```ts
solveSingleLoop(input: SolveSingleLoopInput): SolveResult
```

Die Webanwendung stellt zusätzlich einen asynchronen Worker-Wrapper bereit.
Ein Abbruch beendet den Worker und erzeugt keinen unvollständigen Plan.

### 6.2 Kanonische Pfadprimitive

```ts
interface LinePrimitive {
  kind: "line";
  start: Point;
  end: Point;
}

interface ArcPrimitive {
  kind: "arc";
  start: Point;
  end: Point;
  center: Point;
  radiusMm: number;
  sweepRad: number; // positiv gegen den, negativ im Uhrzeigersinn; 0 < |sweep| < 2π
}

type PathPrimitive = LinePrimitive | ArcPrimitive;
```

`start`, `end`, `center`, `radiusMm` und `sweepRad` müssen geometrisch
konsistent sein. Ein Vollkreis, ein Nullbogen und ein Nullsegment sind nicht
zulässig. Aufeinanderfolgende Primitive teilen denselben Endpunkt und sind
G1-stetig. Kollineare benachbarte Linien und kompatible ko-zirkulare Bögen
werden vor der Ausgabe zusammengeführt.

### 6.3 Erfolgreiche Ausgabe

```ts
interface LocatedSpacing {
  distanceMm: number;
  firstPoint: Point;
  secondPoint: Point;
  firstPathOffsetMm: number;
  secondPathOffsetMm: number;
}

interface SingleLoopPlan {
  solverVersion: string;
  requestHash: string;
  path: PathPrimitive[];

  normalizedConnection: {
    edgeIndex: number;
    requestedCenterOffsetMm: number;
    actualCenterOffsetMm: number;
    shiftedByMm: number;
    center: Point;
    firstPort: Point;
    secondPort: Point;
    startPort: Point;
    endPort: Point;
  };

  requestedSpacingMm: number;
  actualSpacingMm: number;
  totalLengthMm: number;

  coverage: {
    maxDistanceMm: number;
    lowerBoundMm: number;
    upperBoundMm: number;
    errorBoundMm: number;
    worstPoint: Point;
  };

  spacingDeviations: {
    min: LocatedSpacing;
    max: LocatedSpacing;
  };

  warnings: SolverWarning[];
  constraintCertificate: ConstraintCertificate;
}

type SolveResult =
  | { ok: true; plan: SingleLoopPlan }
  | { ok: false; error: SolverError };
```

`actualSpacingMm` ist der nominale Abstand, mit dem die erfolgreiche
Kandidatenfamilie erzeugt wurde. Er ist nicht das gemessene lokale Minimum oder
Maximum. Bleibt die Lösung unter 100 m, ist er exakt gleich dem angeforderten
Wert.

### 6.4 Warnungen

```ts
type SolverWarningCode =
  | "CONNECTION_SHIFTED"
  | "SPACING_INCREASED"
  | "SPACING_EXCEEDS_250_MM";

interface SolverWarning {
  code: SolverWarningCode;
  details: Record<string, number | string>;
}
```

Warnungen werden immer in der oben aufgeführten Reihenfolge ausgegeben. Werte
über 250 mm sind erlaubt, aber keine allgemeine thermische Freigabe. Die
thermischen Studien rechtfertigen eine solche Freigabe nicht unabhängig von
Gebäude, Aufbau und Vorlauftemperatur.

### 6.5 Fehler

```ts
type SolverErrorCode =
  | "INVALID_POLYGON"
  | "INVALID_REQUESTED_SPACING"
  | "INVALID_WALL_CLEARANCE"
  | "INVALID_CONNECTION_EDGE"
  | "NO_VALID_CONNECTION_ON_EDGE"
  | "NO_SOLUTION_GEOMETRY"
  | "NO_SOLUTION_LENGTH"
  | "SOLVER_LIMIT_EXCEEDED"
  | "INTERNAL_VALIDATION_FAILURE";

interface SolverError {
  code: SolverErrorCode;
  message: string;
  details: Record<string, number | string | boolean>;
}
```

`INVALID_POLYGON` umfasst weniger als drei wirksame Eckpunkte, nicht endliche
Koordinaten, Nullkanten, Nullfläche, Selbstschnitte, Überlappungen und
nichtbenachbarte Selbstberührungen. Aufeinanderfolgende kollineare Kanten sind
zulässig und dürfen nur intern unter Erhalt der ursprünglichen Kantenabbildung
zusammengefasst werden. `INVALID_REQUESTED_SPACING` und
`INVALID_WALL_CLEARANCE` umfassen auch nicht endliche Werte.
`INVALID_CONNECTION_EDGE` umfasst einen nicht ganzzahligen oder außerhalb des
Polygons liegenden Kantenindex sowie einen nicht endlichen
`centerOffsetMm`-Wert.

Ein vom Validator verworfener normaler Suchkandidat wird lediglich aus der
Kandidatenmenge entfernt. `INTERNAL_VALIDATION_FAILURE` entsteht ausschließlich,
wenn ein bereits zertifizierter Gewinner nach Kanonisierung oder
Serialisierung die abschließende zweite Validierung nicht mehr besteht oder
sein Zertifikat seinen Metriken widerspricht. Ein solcher Plan wird niemals
zurückgegeben.

## 7. Architektur

```text
single-loop/
├── package.json
├── vite.config.ts
├── src/
│   ├── api/          TypeScript-Typen und WASM-Fassade
│   ├── worker/       Worker-Protokoll, Fortschritt und Abbruch
│   ├── ui/           Eingabe und Diagnostik
│   └── render/       reine SVG-Darstellung der kanonischen Primitive
├── solver/
│   ├── Cargo.toml
│   └── src/
│       ├── input.rs
│       ├── geometry/
│       ├── medial_axis/
│       ├── wavefront/
│       ├── spiral/
│       ├── routing/
│       ├── validation/
│       └── lib.rs
├── fixtures/
└── tests/
```

### 7.1 Verantwortungsgrenzen

- `input`: reine Eingabeprüfung, Anschlussnormalisierung und Abbildung zwischen
  ursprünglicher und interner Polygonorientierung.
- `geometry`: Punkte, Vektoren, Linien, Bögen, robuste Prädikate, Abstände,
  Schnitte, Offsets und kanonische Pfade.
- `medial_axis`: segmentbasiertes Voronoi-Diagramm, Filterung, planarer
  Medialgraph und bekannte Degenerationsbehandlung.
- `wavefront`: Wavefront-Zeitmodell, Parent-Beziehungen, Punkt- und
  Skeleton-Kandidaten.
- `spiral`: bifilare Connected-Fermat-Topologie, Windungszuordnungen und
  innerer Turn.
- `routing`: gemeinsames richtungsabhängiges Routing der beiden Anschlüsse.
- `validation`: vom Generator unabhängige Zertifizierung aller harten Regeln
  und Coverage-Schranken.
- TypeScript verändert niemals die Solvergeometrie; es serialisiert, rendert
  und zeigt Diagnosen an.

### 7.2 Technologiewahl

- Rust und `wasm-bindgen` für den Solver.
- `cavalier_contours` für Linien-/Bogen-Offsets und boolesche Konturoperationen.
- `boostvoronoi` für ein segmentbasiertes Voronoi-Diagramm in reinem Rust.
- TypeScript, Vite, Vitest und Playwright für Webanwendung und Integration.
- SVG für die maßstäbliche Vektordarstellung.

Der ausgelieferte Solver erhält keine GPL-/AGPL- oder nur
nichtkommerziell nutzbare Abhängigkeit. Die GPL-/AGPL-Implementierungen der
DPS- und Boustrophedon-Projekte werden nicht kopiert. Veröffentlichte
geometrische Verfahren werden eigenständig implementiert.

## 8. Datenfluss des Solvers

```text
Eingabe
  → Eingabe- und Polygonprüfung
  → Anschlussnormalisierung
  → zulässige Rohrmittellinienfläche
  → Medialgraph
  → Punkt-/Skeleton-Wavefronts
  → bifilare Kandidaten
  → 80-mm-Turn und G1-Rundung
  → gemeinsames Anschlussrouting
  → kanonischer Line|Arc-Pfad
  → unabhängiger Validator
  → Coverage- und Spacing-Diagnostik
  → Kandidatenranking
  → optional Abstandssuche wegen 100-m-Grenze
  → Ergebnis oder fachlicher Fehler
```

## 9. Eingabe- und Geometrienormalisierung

1. Die f64-Eingabe bleibt für Metrik und Abschlussvalidierung unverändert.
2. Für robuste topologische Operationen wird eine lokale, auf 0,001 mm
   quantisierte i64-Kopie verwendet. Die maximale Quantisierungsabweichung von
   0,0005 mm fließt in das numerische Fehlerbudget ein.
3. Rechts- und linksorientierte Polygone werden akzeptiert. Eine interne
   Orientierungsumkehr bewahrt die Abbildung auf die ursprünglichen Kanten.
4. Ein explizit wiederholter Endpunkt und jede sonstige Nullkante sind keine
   stillschweigende Normalisierung, sondern `INVALID_POLYGON`.
5. Die Eingabekante des Anschlusses wird vor jeder internen Vereinfachung
   validiert und normalisiert.
6. Der reguläre Spiralbereich liegt in der Erosion des Originalpolygons um
   `wallClearanceMm`. Zerfällt diese Fläche in mehrere getrennte Komponenten,
   kann ein einzelner Pfad ohne Wandabstandsverletzung nicht alle Komponenten
   verbinden; der Solver liefert `NO_SOLUTION_GEOMETRY`.

Kurven, die beim Erodieren an konkaven Ecken entstehen, bleiben in der
maßgeblichen Geometrie exakte Bögen. Nur die Voronoi-Hilfsgeometrie darf sie
mit einer garantierten Hausdorff-Abweichung von höchstens 0,05 mm
segmentieren. Der Abschlussvalidator prüft gegen die exakte Kontur und das
unveränderte Originalpolygon.

## 10. Medial-Axis- und Wavefront-Verfahren

### 10.1 Medialgraph

Aus der Begrenzung der zulässigen Rohrmittellinienfläche wird ein segmentiertes
Voronoi-Diagramm erzeugt. Es dient ausschließlich als topologisches Gerüst.

Der Solver:

1. entfernt unendliche und außerhalb liegende Voronoi-Kanten,
2. diskretisiert parabolische Hilfskanten mit kontrolliertem Fehler,
3. verwirft Spikes und numerische Doppeläste nur anhand expliziter
   geometrischer Kriterien,
4. erhält die planare Einbettung und zyklische Kantenreihenfolge,
5. prüft den resultierenden Graphen unabhängig auf Lage und Topologie,
6. reichert lange Randbereiche mit senkrechten Ästen an, wenn der Abstand
   benachbarter Randblätter größer als der nominale Abstand ist,
7. ersetzt Doppeläste an konkaven Ecken nur dann durch einen Winkelhalbierer,
   wenn alle dadurch entstehenden Diagrammflächen konvex bleiben.

Bekannte Fehler oder Degenerationen von `boostvoronoi` dürfen nur zum Verwerfen
einer Kandidatenfamilie führen, niemals zur Ausgabe ungeprüfter Geometrie.

### 10.2 Zwei Gerüstfamilien

Für jeden nominalen Abstand werden mindestens zwei Familien betrachtet:

1. **Punktzentrum:** Die Welle startet im Zentrum des Medialgraphen, das den
   maximalen Graphabstand zu einem Blatt minimiert.
2. **Skeleton Island:** Für langgestreckte oder verzweigte Polygone wird ein
   zentraler, zusammenhängender Teil des Medialgraphen als nullflächige Insel
   verwendet. Er wird vor der konkreten Rohrkonstruktion zu einem ausreichend
   breiten Turn-Kern erweitert.

Eine degenerierte Skeleton-Familie darf entfallen. Ansonsten entscheidet nicht
eine Formheuristik, sondern ausschließlich das spätere Ranking zwischen beiden
Familien.

### 10.3 Verschachtelte Wavefronts

Die Wavefront-Zeit wächst auf jedem Weg vom Zentrum beziehungsweise Skeleton
zur Begrenzung monoton. Benachbarte Wavefronts erhalten explizite
Parent-Beziehungen. Die Konstruktion bewahrt:

- die zyklische Reihenfolge der Wavefrontpunkte,
- Verschachtelung ohne Schnitt,
- höchstens einen Parent pro Punkt der äußeren Wavefront,
- eine definierte Nachbarschaft zwischen späteren Spiralwindungen.

Für die Rundung werden deterministisch die Guide-Faktoren `1,0`, `0,975` und
`0,95` betrachtet. Der jeweilige rohe Guide-Abstand ist

```text
max(50 mm + Zertifizierungsreserve, guideFactor × actualSpacingMm)
```

Der Faktor `1,0` verhindert, dass die 5-%-Rundungsreserve allein eine unnötige
Abstandserhöhung wegen der 100-m-Grenze erzwingt. Die kleineren Faktoren
stellen Kandidaten mit zusätzlichem Rundungsspielraum bereit. Der tatsächliche
Abstand darf nach der Rundung lokal vom Nominalwert abweichen. Die Formel ist
keine harte obere Abstandsgrenze: Bei `actualSpacingMm = 50` hat die
50-mm-Sicherheitsanforderung Vorrang. Sämtliche tatsächlichen Abstände werden
anschließend gemessen und zertifiziert.

## 11. Konstruktion der bifilaren Doppelspirale

Die Connected-Fermat-Idee wird auf die Wavefrontfamilie übertragen:

1. Die einwärts laufende Bahn benutzt abwechselnde Wavefrontphasen.
2. Die auswärts laufende Bahn benutzt die dazwischenliegenden Phasen.
3. Beide Arme werden nicht nachträglich gegeneinander offsettet, sondern aus
   derselben Parent-Struktur erzeugt.
4. Innerhalb einer Windung wird kontinuierlich von einer Wavefront zur
   nächsten interpoliert; separate geschlossene Ringe mit nachträglichen
   Sprüngen entstehen nicht.
5. Die beiden inneren Enden werden durch genau einen G1-stetigen Turn
   verbunden.
6. Die beiden äußeren Enden bilden geordnete Seam-Posen für das
   Anschlussrouting.

Der innere Bereich darf sich gegenüber dem Nominalabstand aufweiten. Ein
halbkreisförmiger 180°-Turn mit 80 mm Radius benötigt beispielsweise 160 mm
zwischen seinen parallelen Tangenten. Der Punkt- oder Skeleton-Kern reserviert
diesen Platz konstruktiv. Ein zu enger Kern darf nicht durch einen kleineren
Radius repariert werden.

Die Kandidatenerzeugung umfasst deterministisch:

- beide Umlaufrichtungen,
- beide Portzuordnungen,
- Punkt- und Skeleton-Familie, soweit vorhanden,
- die Guide-Faktoren `1,0`, `0,975` und `0,95`,
- Seam-Anker an allen relevanten Wavefront-/Medialgraphereignissen,
- 16 gleichmäßig über den äußeren Umfang verteilte zusätzliche Seam-Anker,
- vier feste lokale Halbierungsschritte um die acht nach grober Bewertung
  besten Seam-Anker,
- zulässige Einbogen- und Biarc-Varianten des inneren Turns.

Jeder Kandidat bleibt dieselbe Doppelspiraltopologie. Es werden keine
Boustrophedon- oder Mehrzellenschleifen als Alternative erzeugt.

## 12. G1-Stetigkeit und Mindestbiegeradius

Bögen werden konstruktiv und nicht durch nachträgliche optische Glättung
erzeugt. Für zwei aufeinanderfolgende Polygonecken gilt die globale
Existenzbedingung des festen Radius `R = 80 mm`:

```text
|p_j p_k| ≥ R / tan(α_j / 2) + R / tan(α_k / 2)
```

Reicht ein Segment nicht aus, wird in dieser Reihenfolge versucht:

1. redundante oder zu nahe Guidepunkte zusammenzufassen,
2. einen Bogen über mehrere Guideecken zu legen,
3. eine robuste Biarc-Verbindung zwischen den angrenzenden Posen zu erzeugen,
4. eine andere Seam-, Turn- oder Gerüstvariante zu benutzen.

Jeder Einzelbogen und beide Bögen eines Biarcs müssen Radius mindestens 80 mm
haben. Biarcs sind ausschließlich lokale Fallbacks für Pose-Verbindungen. Eine
globale Biarc-, Bézier-, Catmull-Rom- oder Kardinalspline-Glättung ist
verboten.

## 13. Richtungsabhängiges Anschlussrouting

Das Routing arbeitet mit Zuständen `(Position, Tangentenrichtung)` und
Transitionen, die bereits exakte Linien-/Bogenfolgen mit Radius mindestens
80 mm sind. Es glättet keine kollidierende Polyline nachträglich.

Für jeden Spiralkandidaten werden die beiden Anschlussäste gemeinsam geplant:

1. Beide möglichen Portzuordnungen werden betrachtet.
2. Vom Anschluss aus wird ein geordneter Fan-out-Korridor reserviert.
3. Zustandsknoten entstehen an Ports, Seam-Posen, Tangentialpunkten,
   Sichtbarkeitsereignissen und deterministisch gesampelten Korridorpositionen.
4. Ungültige Transitionen werden vor Aufnahme in den Pose-Graphen anhand von
   Polygonlage, Radius, Wandzonenphase und bereits reserviertem Rohr verworfen.
5. Die Kosten ordnen zuerst harte Gültigkeit, dann Länge, Anzahl der Bögen und
   Clearance-Reserve.
6. Führt die erste Reihenfolge zu keiner gemeinsamen Lösung, werden die Äste in
   umgekehrter Reihenfolge mit Rip-up-and-reroute neu berechnet.
7. Jede gefundene Paarung wird anschließend zusammen mit der gesamten Spirale
   unabhängig validiert.

Nach Verlassen der Wandabstandszone enthalten die Graphzustände eine irreversible
Phase `inside`; dadurch kann ein Anschluss nicht in die Ausnahmezone
zurückkehren.

## 14. Abstandssuche und Längenregel

Der Solver arbeitet zuerst ausschließlich mit
`requestedSpacingMm`.

1. Existiert bei diesem Wert mindestens ein vollständig gültiger Kandidat mit
   höchstens 100.000 mm, wird kein größerer Abstand untersucht.
2. Unter diesen Kandidaten gewinnt die beste Coverage, auch wenn ein anderer
   Kandidat kürzer wäre.
3. Existieren geometrisch gültige Kandidaten, die ausschließlich an der
   Längengrenze scheitern, darf der nominale Abstand erhöht werden.
4. Scheitern alle Kandidaten bereits an Geometrie, Radius, Abstand oder
   Topologie, wird der Abstand nicht als Reparatur verändert;
   Ergebnis ist `NO_SOLUTION_GEOMETRY`.
5. Die Suche nach oben erfolgt deterministisch über Wavefront-Topologieereignisse
   und wird innerhalb des ersten erfolgreichen Intervalls auf 0,1 mm
   verfeinert. Erhöhte Werte liegen auf dem absoluten 0,1-mm-Raster; der erste
   strikt größere Rasterwert ist
   `(floor(requestedSpacingMm × 10) + 1) / 10`.
6. Der zurückgegebene Wert ist der kleinste auf diesem Raster zertifizierte
   Wert der untersuchten Ereignisintervalle, bei dem ein gültiger Kandidat
   höchstens 100.000 mm lang ist.
7. Es gibt keine harte Obergrenze von 250 mm. Größere Werte erzeugen
   `SPACING_INCREASED` und `SPACING_EXCEEDS_250_MM`.
8. Sobald die minimale mögliche Wavefronttopologie erreicht ist und selbst der
   kürzeste geometrisch gültige Kandidat länger als 100.000 mm bleibt, folgt
   `NO_SOLUTION_LENGTH`.

Die Länge wird analytisch als Summe aus Linienlängen und
`radiusMm × |sweepRad|` berechnet. Für die Zertifizierung wird eine konservative
numerische Obergrenze verwendet.

## 15. Kandidatenranking

Bei einem festen nominalen Abstand werden nur vollständig zertifizierte und
höchstens 100.000 mm lange Kandidaten gerankt:

1. kleinste zertifizierte Coverage-Obergrenze,
2. kleinste Spanne zwischen lokalem maximalem und minimalem Windungsabstand,
3. kürzere Gesamtlänge,
4. lexikographisch kleiner stabiler Kandidatenschlüssel.

Überlappen die Coverage-Fehlerintervalle zweier führender Kandidaten, wird die
Coverage beider Kandidaten weiter verfeinert. Erst bei einer verbleibenden
Differenz innerhalb 0,1 mm greifen die Tie-Breaker.

Über verschiedene nominale Abstände gewinnt immer der kleinste nach Abschnitt
14 erforderliche Abstand; eine bessere Coverage bei einem unnötig größeren
Abstand rechtfertigt keine Erhöhung.

## 16. Unabhängiger Validator

Generator und Validator teilen nur grundlegende primitive Datentypen. Der
Validator verwendet keine Generatorannahme als Beweis. Ein Kandidat wird erst
nach erfolgreicher Zertifizierung zu einem Plan.

### 16.1 Kanonische Geometrie

Vor der Prüfung wird der Pfad kanonisiert:

- Nullprimitive verwerfen den Kandidaten.
- Benachbarte kollineare Linien werden zusammengeführt.
- Benachbarte Bögen mit identischem Zentrum, Radius und Drehsinn werden
  zusammengeführt, wenn die resultierende Sweep-Bedingung erfüllt bleibt.
- Positionsstetigkeit muss innerhalb 0,000001 mm liegen.
- Die Tangentendifferenz an jedem Übergang darf höchstens 0,0000001 rad
  betragen.

### 16.2 Polygonlage und Wandabstand

- Linien werden an allen Schnittparametern mit Polygonkanten in Intervalle
  zerlegt und intervallweise klassifiziert.
- Bögen werden analytisch mit jeder Polygonkante geschnitten und ebenfalls
  intervallweise klassifiziert.
- Eine Berührung der Originalpolygonbegrenzung ist nur an den beiden Ports
  erlaubt.
- Außerhalb der beiden Anschlusspräfixe/-suffixe wird der minimale Abstand
  jedes Linien- oder Bogenprimitivs zu jeder Polygonkante analytisch geprüft.
- Die Anschlussäste werden zusätzlich mit dem in Abschnitt 5.1 beschriebenen
  Phasenautomaten geprüft.

### 16.3 Kreuzungen

Der Validator berechnet analytisch:

- Linie–Linie-Schnitte,
- Linie–Bogen-Schnitte,
- Bogen–Bogen-Schnitte,
- kollineare beziehungsweise ko-zirkulare Überlappungen.

Erlaubt ist nur der gemeinsame Endpunkt direkt aufeinanderfolgender
Primitive. Nichtbenachbarte Berührung, Überlappung und Kreuzung sind ungültig.
Das gilt unabhängig von der Definition des nichtlokalen Abstands.

### 16.4 Nichtlokaler Rohrabstand

Die lokale Nachbarschaft wird darstellungsunabhängig über die Bogenlänge des
gesamten offenen Pfads definiert:

```text
localArcLength = 80π mm ≈ 251,32741228718345 mm
```

Zwei Rohrpunkte sind lokal, wenn ihre eindeutige Pfadbogenlängendifferenz
kleiner als `localArcLength` ist. Nur Punktpaare mit mindestens dieser
Pfaddifferenz unterliegen der 50-mm-Regel. Alle primitiven Paarabstände werden
mit den dazugehörigen gültigen Pfadparameterintervallen minimiert. Dadurch
führt eine andere Unterteilung derselben Kurve nicht zu einem anderen
Ergebnis.

Die beiden vorgeschriebenen Ports liegen exakt 50 mm auseinander und sind bei
einem ausreichend langen Pfad selbst ein nichtlokales Punktepaar. Diese
mandatierte Gleichheit wird über ihre gemeinsamen parametrischen
Kantenkoordinaten zertifiziert und durch eine unabhängige f64-Residualprüfung
bestätigt. Sie darf nicht durch einen pauschalen numerischen Sicherheitsabzug
unter 50 mm gerechnet werden. Alle nicht parametrisch beweisbaren
Abstandspaare werden mit konservativen Fehlerintervallen geprüft.

Selbstkreuzungen bleiben auch innerhalb der lokalen Bogenlänge verboten.

### 16.5 Biegeradius und G1

- Linien besitzen keine endliche Krümmung.
- Jeder ausgegebene Bogen muss einen zertifizierten Radius von mindestens
  80 mm besitzen.
- Die Geometrie des Bogens muss mit Zentrum, Start, Ende, Radius und Sweep
  konsistent sein.
- Alle primitiven Übergänge müssen die G1-Toleranz erfüllen.

### 16.6 Bifilare Topologie

Der Generator liefert zusätzlich interne, nicht öffentliche Provenienz für
Windungen, Parent-Paare, Seam, inneren Turn und beide Anschlussäste. Der
Validator bestätigt:

- einen einzigen geordneten offenen Pfad,
- genau zwei verschiedene Ports als Enden,
- genau einen Wechsel vom einwärts zum auswärts laufenden Arm,
- alternierende verschachtelte Windungsphasen,
- genau einen inneren Turn,
- keine abgetrennte oder zusätzlich geschlossene Teilkurve.

Die Provenienz ersetzt keine geometrische Prüfung; sie macht die fachliche
Doppelspiraltopologie überprüfbar.

## 17. Coverage-Zertifizierung

Die Zielfunktion ist

```text
maximaler Abstand jedes Punkts des gesamten Originalpolygons
zum nächstgelegenen Punkt des vollständigen Rohrpfads.
```

Sie umfasst ausdrücklich Wandzonen und Anschlussbereiche.

Der Solver trianguliert das Polygon und verwendet adaptives Branch-and-Bound:

1. Für eine Teilzelle werden repräsentative Punkte exakt gegen alle Linien und
   Bögen gemessen.
2. Der größte gefundene Wert ist eine globale untere Schranke und liefert den
   aktuellen `worstPoint`.
3. Weil die Distanz zu einer abgeschlossenen Menge 1-Lipschitz ist, ergibt der
   Messwert plus maximaler Zellradius eine sichere obere Zellschranke.
4. Zellen, deren obere Schranke nicht mehr gewinnen kann, werden verworfen.
5. Die übrigen Zellen werden deterministisch unterteilt.
6. Die Berechnung endet, wenn globale obere und untere Schranke höchstens
   0,1 mm auseinanderliegen.

`coverage.maxDistanceMm` ist die konservative obere Schranke. Der ausgegebene
`worstPoint` erreicht die untere Schranke. Das Zertifikat enthält beide Werte
und ihre Differenz.

## 18. Spacing-Diagnostik

Es werden zwei unterschiedliche Messungen verwendet:

1. `constraintCertificate.minNonlocalSpacingMm` ist das analytische globale
   Minimum aller nichtlokalen Rohrteile und zertifiziert die 50-mm-Regel.
2. `spacingDeviations` misst anhand der Wavefront-Parent-Zuordnung den lokalen
   Abstand benachbarter nominaler Windungen im eigentlichen Spiralbereich.

Für die zweite Messung werden die zugeordneten Windungspaare adaptiv entlang
ihrer exakten Linien-/Bogenprimitive untersucht. Minimum und Maximum enthalten
jeweils beide Punkte und ihre Pfadbogenlängenpositionen. Anschlussäste und der
innere Turn sind von dieser nominalen Statistik ausgenommen, bleiben aber Teil
der globalen Mindestabstands- und Coverage-Prüfung.

## 19. Constraint-Zertifikat

```ts
interface ConstraintCertificate {
  insidePolygon: true;
  g1Continuous: true;
  selfIntersectionCount: 0;
  connectionZoneCompliant: true;
  bifilarTopology: true;

  minBendRadiusMm: {
    lowerBoundMm: number;
    primitiveIndex: number;
    point: Point;
  };

  minWallClearanceMm: {
    lowerBoundMm: number; // regulärer Pfad ohne zulässige Anschluss-Wandzone
    pointOnPipe: Point;
    pointOnWall: Point;
  };

  minNonlocalSpacingMm: {
    lowerBoundMm: number;
    firstPoint: Point;
    secondPoint: Point;
  };

  totalLengthMm: {
    upperBoundMm: number;
    limitMm: 100000;
  };

  coverageMm: {
    lowerBoundMm: number;
    upperBoundMm: number;
    errorBoundMm: number;
    worstPoint: Point;
  };

  numericToleranceMm: number;
}
```

Der Generator zielt bei frei wählbaren metrischen Untergrenzen auf eine
interne Reserve von mindestens 0,01 mm. Vorgeschriebene exakte Gleichheiten,
insbesondere der 50-mm-Portabstand, sind davon ausgenommen und werden über
ihre parametrische Konstruktion zertifiziert. Der Validator akzeptiert keine
bloßen Zielwerte, sondern nur konservative Schranken oder solche explizit
nachgewiesenen Identitäten. Die Coverage-Toleranz von 0,1 mm und das
topologische Quantisierungsbudget werden separat ausgewiesen.

## 20. Determinismus und Ressourcen

Identische Eingabewerte und dieselbe Solverversion erzeugen byte-stabil dieselbe
kanonische Ergebnisstruktur:

- keine ungesetzten Zufallszahlen,
- stabile Sortierschlüssel für geometrische Gleichstände,
- feste Reihenfolge der Gerüst-, Port-, Richtungs-, Seam- und Turnvarianten,
- keine vom Thread-Timing abhängige Gewinnerauswahl,
- feste Warning-Reihenfolge,
- kanonische Fließkommaserialisierung,
- `requestHash` aus der kanonischen Eingabe und `solverVersion` im Ergebnis.

Ein Worker-Abbruch ist eine UI-Operation und kein Solverresultat. Interne
Ressourcengrenzen basieren nicht auf verstrichener Zeit, sondern auf
reproduzierbaren Arbeitseinheiten:

- höchstens 20.000 vollständige Kandidatenvalidierungen pro Anfrage,
- höchstens 2.000.000 aktive oder abgeschlossene Coverage-Zellen pro Kandidat,
- höchstens 5.000.000 Pose-Graph-Expansionen pro Anfrage.

Das Überschreiten liefert `SOLVER_LIMIT_EXCEEDED` mit Name, Grenzwert und
verbrauchter Arbeitseinheit. Es wird niemals der bis dahin beste ungeprüfte
Kandidat zurückgegeben.

## 21. Statische Webanwendung

Die getrennte Vite-Anwendung bietet:

- Polygon zeichnen und Eckpunkte bearbeiten,
- Anschlusskante auswählen,
- Mittelpunkt entlang der Kante setzen,
- angeforderten Abstand und Wandabstand eingeben,
- Berechnung im Web Worker starten und abbrechen,
- exakte SVG-Darstellung der Linien und Bögen,
- optionales Einblenden von Wall-Inset, Ports und diagnostischen Extrempunkten,
- Ausgabe von Gesamtlänge, tatsächlichem Abstand, Coverage, lokalen
  Spacing-Extrema, Warnungen und Constraint-Zertifikat,
- sichtbare Darstellung einer Anschlussverschiebung,
- Import der Eingabe als JSON,
- Export von Eingabe und Ergebnis als JSON,
- Export des kanonischen Pfads als SVG.

Die Darstellung liest ausschließlich den kanonischen Ausgabepfad. Sie darf
keine Kurven glätten, Punkte verschieben oder den für Länge und Zertifikat
verwendeten Pfad ersetzen.

## 22. Teststrategie

### 22.1 Rust-Unit-Tests

- Linien- und Bogenlänge.
- G1-Tangenten und Kanonisierung.
- Linie–Linie-, Linie–Bogen- und Bogen–Bogen-Schnitt.
- Alle zugehörigen Minimaldistanzkombinationen.
- Punkt- und Primitivabstand zum Polygon.
- Polygonvalidierung und Orientierungsabbildung.
- Anschlussintervall einschließlich 116-mm-Grenze.
- Inset und getrennte erodierte Komponenten.
- Voronoi-Filterung und Medialgraphdegenerationen.
- Wavefront-Parent-Beziehungen.
- DPS-Existenzbedingung.
- Robuste Biarc-Fälle mit parallelen, nahezu parallelen und
  entgegengesetzten Tangenten.
- Wandzonen-Phasenautomat.
- Coverage-Unter- und Obergrenzen.
- Nichtlokaler Abstand unabhängig von Primitivunterteilung.

### 22.2 Property- und Metamorphose-Tests

- Translation, Rotation und Spiegelung ändern Gültigkeit und metrische Werte
  nur innerhalb des ausgewiesenen numerischen Budgets.
- Umgekehrte Polygonorientierung mit korrekt abgebildetem Anschluss liefert
  geometrisch äquivalente Resultate.
- Unterteilung oder kanonische Zusammenfassung eines Pfads ändert Schnitt- und
  Abstandsergebnis nicht.
- Kein vom Generator als erfolgreich gemeldeter Fuzz-Kandidat darf den
  unabhängigen Validator verletzen.
- Dichte Stichproben dienen im Test als Gegenkontrolle analytischer Distanzen,
  nicht als Produktionszertifikat.

### 22.3 Fixture-Korpus

Mindestens folgende Formen und Situationen werden versioniert:

- Rechteck und allgemeine konvexe Polygone,
- L-, U- und C-Form,
- stark gestreckter Raum,
- verzweigte beziehungsweise dumbbell-förmige Fläche,
- tiefe konkave Einschnitte,
- schmale Korridore,
- kammartige Polygone,
- nahezu kollineare aufeinanderfolgende Kanten,
- Anschluss nahe beiden Enden einer Kante,
- Kante unter, gleich und über 116 mm,
- Wandabstand unter und gleich 8 mm,
- angeforderter Abstand bei 50 und 250 mm,
- notwendige Erhöhung über 250 mm,
- geometrisch möglicher, aber auch minimal zu langer Kreis,
- unlösbarer Radius- oder Abstandskonflikt,
- bekannte Radius-, Randlagen- und Anschlusskreuzungsregressionen aus den
  bestehenden Diagnose-Dokumenten.

### 22.4 TypeScript- und Browsertests

- Vitest prüft TypeScript-Typen, WASM-Fassade, Warning-/Error-Abbildung und
  Worker-Protokoll.
- Playwright prüft Zeichnen, Anschlusswahl, Lösen, Abbruch, Warnungen,
  Diagnostik sowie JSON- und SVG-Export.
- Der Produktionsbuild muss statisch funktionieren und darf keinen Backend-
  oder Netzwerkzugriff benötigen.

### 22.5 Harte Abnahme

Jedes `ok: true` muss:

1. genau einen kontinuierlichen offenen Pfad zwischen den beiden Ports
   enthalten,
2. eine bifilare Doppelspirale bilden,
3. ausschließlich kanonische tangentiale `Line | Arc`-Primitive enthalten,
4. vollständig im Originalpolygon liegen,
5. die Wandzonenregel erfüllen,
6. einen Bogenradius von mindestens 80 mm besitzen,
7. mindestens 50 mm nichtlokalen Rohrabstand besitzen,
8. keine Selbstkreuzung oder nichtbenachbarte Berührung besitzen,
9. höchstens 100.000 mm lang sein,
10. eine Coverage-Schranke mit höchstens 0,1 mm Fehlerintervall besitzen,
11. ein vollständig erfolgreiches unabhängiges Zertifikat enthalten,
12. für identische Eingabe und Solverversion deterministisch identisch sein.

## 23. Erkenntnisse aus den wissenschaftlichen Arbeiten

### 23.1 Direkt übernommen

- **Abrahamsen, `1412.5034`:** medial-axis-gesteuerte Wavefronts,
  Parent-Beziehungen, Anreicherung langer Kanten, Behandlung konkaver Ecken,
  Punktzentrum und nullflächiges Skeleton für langgestreckte oder verzweigte
  Flächen.
- **Pastorelli et al., `2409.09816`:** feste Radiuskonstruktion,
  G1-Existenzbedingung und konservative Kollisionsbetrachtung statt
  nachträglicher freier Glättung.
- **Bertolazzi/Frego, `1711.00935`, und Biarc-Spline-Paper:** numerisch robuste
  lokale Biarc-Berechnung; globale unbeschränkte Biarc-Splines werden nicht
  übernommen.
- **LiDAR 2.0, `2505.17239`:** richtungsabhängige Pose-Zustände,
  design-rule-konforme Transitionen, geordnete Ports und
  Rip-up-and-reroute für Anschlusswege.
- **Lee et al., `lee2010`:** gezielte Suche nach residualen
  Coverage-Schwachstellen; die dortige Kardinalspline-Glättung wird verworfen.

### 23.2 Als Such- und Validierungslehre übernommen

- **Bähnemann et al., `1907.09224`:** exakte Geometrie und Verbindungswege
  müssen Teil der Optimierung sein; das Boustrophedon-Muster selbst ist nicht
  zulässig.
- **Manzini/Murphy, `2309.09882`:** Coverage-Zielflächen sind stark
  nichtkonvex; deshalb deterministischer Multi-Start statt reiner
  Gradientenoptimierung.
- **Shahid et al., `2411.07053`:** sicherheitsbewusste Polygon-Offsets und
  explizite Behandlung komplexer konkaver Regionen; Zellzerlegung wird nicht
  als alternatives Muster verwendet.
- **Scarparo, `1311.5881`:** Erhalt echter Ecken und Linien-/Bogenapproximation
  für Hilfsgeometrien statt blinder Splineglättung.

### 23.3 Nur für Bewertung und Diagnose

Die Arbeiten von Chae, Ding, Meng, Yang und die IJHT-Vergleichsstudie stützen
qualitativ:

- kleinere Abstände erhöhen im Allgemeinen Wärmeabgabe und Gleichmäßigkeit,
- die Doppelspirale verbessert die Temperaturgleichmäßigkeit durch
  gegenläufige Vor- und Rückläufe,
- große Abstände hängen stark von Gebäude, Schichten und Versorgungstemperatur
  ab.

Daraus folgt keine universelle thermische Freigabe oberhalb 250 mm. Das System
meldet geometrische Coverage und Abstände, behauptet aber keine thermische
Eignung. Widersprüchliche Aussagen der IJHT-Studie werden nicht als harte
Auslegungsgrundlage verwendet.

## 24. Bewusste Sicherheitsgrenzen

Die Beweise der zitierten Arbeiten gelten jeweils für deren eigenes Modell.
Die Kombination aus Wavefront-Doppelspirale, 80-mm-Rundung und
Anschlussrouting erbt diese Beweise nicht automatisch. Deshalb gilt im
Projekt immer:

```text
Konstruktion erzeugt Kandidaten; nur der unabhängige Validator erzeugt Pläne.
```

Kein Fehler in Voronoi, Wavefront, Biarc, Pose-Graph oder numerischer
Approximation darf zu einer stillen Verletzung der fachlichen Regeln führen.
