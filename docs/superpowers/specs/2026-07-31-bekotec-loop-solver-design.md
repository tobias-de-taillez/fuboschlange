# BEKOTEC Loop-Solver (B+) — Design

**Datum:** 2026-07-31
**Status:** Vom Nutzer freigegebener Solver-Kern (B+); Spec zur Review
**Baut auf:** `2026-07-28-bekotec-noppenplatte-routing-model-design.md` (zertifizierter Pose-Graph)
**Handwerksgrundlage:** `docs/superpowers/research/2026-07-31-schneckenverlegung-handwerk-praxis.md`

## 1. Zweck

Dieses Projekt erzeugt genau einen Fußbodenheizkreis auf dem zertifizierten
BEKOTEC-Pose-Graph. Der Solver arbeitet iterativ: Er baut den Pfad Baustein für
Baustein aus zertifizierten Graphkanten auf, erkennt Sackgassen über lokal
prüfbare Invarianten und geht mit dokumentiertem Backtracking zurück. Er
erzeugt niemals einen Plan, den der unabhängige Validator nicht bestätigt hat.

Der Nutzer wählt das Verlegemuster; jedes Muster ist ein eigener Solver-Weg
auf demselben Framework:

- `spiral` — Schnecke (bifilare Doppelspirale), Handwerks-Standard;
- `meander` — Mäander (Serpentine) mit randnaher Rückführung;
- `free` — freie kreuzungsfreie Schlange, nur Constraint-getrieben.

## 2. Geltungsbereich

### 2.1 Unterstützt

- Beliebiges einfaches Polygon ohne Löcher (4, 6, 8, … Ecken, konkav erlaubt).
- Genau ein Heizkreis, genau ein Anschluss mit Vor- und Rücklaufport.
- Profil `BEKOTEC_EN_23_FI_30_16` (75-mm-Raster, Rohr 16 mm, Radius ≥ 80 mm).
- Verlegeabstände exakt aus `{75, 150, 225, 300}` mm.
- Noppenfreie Anschlusszone mit Freiform-Verlegung.
- Statischer Rust/WASM-Solver, Ausgabe als kanonische `Line | Arc`-Primitive.

### 2.2 Nicht unterstützt (deferred)

- Mehrere Heizkreise und automatische Kreisteilung (Anschlussmodell darf
  künftige Mehrkreis-Ausleitung nicht verbauen, plant sie aber nicht).
- Randzonen-Verdichtung (vorgeschalteter Mäander) — V2.
- Optimierung der Plattenphase (Phase bleibt Eingabe).
- Bewegungsfugen als Barrieren (Eingabe kennt keine Fugen; Regel dokumentiert
  für später).
- Thermik/Hydraulik, Plattenzuschnitt, Integration in `verlegeplan.html`.

## 3. Eingabe

```ts
interface SolveLoopInput {
  polygon: Point[];
  connection: {
    edgeIndex: number;
    centerOffsetMm: number;        // Portmitte entlang der Kante
    zoneWidthMm: number;           // Default 450, entlang der Kante
    zoneDepthMm: number;           // Default 225, in den Raum
  };
  requestedSpacingMm: 75 | 150 | 225 | 300;
  wallClearanceMm: number;         // ≥ 8
  phaseUMm: number;                // [0, 75)
  phaseVMm: number;                // [0, 75)
  pattern: "spiral" | "meander" | "free";
  profile: "BEKOTEC_EN_23_FI_30_16";
}
```

Validierungsfehler übernehmen die bestehenden Codes des Plate-Milestones und
ergänzen `INVALID_CONNECTION`, `INVALID_PATTERN`, `INVALID_REQUESTED_SPACING`.

## 4. Anschlussmodell

Die Anschlusszone ist ein achsparalleles Rechteck im Plattenrahmen: zentriert
auf die Portmitte, `zoneWidthMm` entlang der Anschlusskante, `zoneDepthMm`
senkrecht in den Raum. Innerhalb der Zone gibt es keine Noppen; es gelten nur
Polygon-/Wandabstands-, Radius-, Kreuzungs- und Berührungsregeln
(Freiform-Verlegung mit `Line | Arc`). Außerhalb der Zone besteht der Pfad
ausschließlich aus zertifizierten Kanten des eingebetteten Pose-Graphen.

- Beide Ports liegen auf der Anschlusskante, symmetrisch zur Portmitte,
  50 mm Mitte–Mitte, Tangente wandorthogonal einwärts.
- Die Zone muss beide Ports enthalten und vollständig im Polygon liegen,
  sonst `INVALID_CONNECTION`.
- Übergänge Zone ↔ Graph nur an Pose-Ankern auf dem Zonenrand: Der Solver
  wählt Eintritts- und Austrittsanker, die Freiformstücke Port→Anker werden
  konstruiert (tangential, Radius ≥ 80 mm) und wie alles andere validiert.
- Rohrabstand in der Zone: Berührung verboten (hart, Abstand Mitte–Mitte
  > 16 mm + Zertifizierungsreserve); Unterschreitung von 50 mm ist erlaubt,
  wird aber bestraft (§ 10) und darf nur auftreten, wenn ohne sie keine
  Lösung existiert.

## 5. Harte Regeln (Auszug, vollständig im Validator § 11)

| Regel | Festlegung |
|---|---|
| Topologie | ein offener Pfad Port → … → Port |
| Geometrie außerhalb Zone | nur zertifizierte Graphkanten |
| Biegeradius | ≥ 80 mm überall, auch in der Zone |
| Kreuzung/Berührung | keine Selbstkreuzung, keine Berührung nichtbenachbarter Teile |
| Mindestabstand | > 16 mm Mitte–Mitte überall (physische Nichtberührung) |
| Polygon | Pfad vollständig im Polygon, Wandabstand außerhalb der Zone |
| Länge | ≤ 100.000 mm inklusive Zone |
| Noppen | keine Kollision mit expandierten Noppenkörpern (via Graphkanten) |

Der nominale Verlegeabstand ist ein Muster-Sollwert, keine harte lokale
Gleichheit; lokale Abweichungen an Kehre, Feldübergängen und in der Zone sind
zulässig und werden gemessen.

## 6. B+-Suche (Solver-Kern)

Quelle jeder Regel: Research-Dokument, dort mit Primärbeleg.

### 6.1 Bahnenmodell

Vor der Suche wird der wall-safe Bereich pro Teilfeld (§ 6.2) in **Bahnen**
zerlegt: konturparallele Rasterkorridore im Abstand `VA` (spiral) bzw.
parallele Lanes (meander). Eine Bahn ist eine geordnete Folge benachbarter
Graphkanten. Bahnen sind die Sucheinheit — nicht Einzelkanten.

### 6.2 Feld-Zerlegung (konkave Räume)

Eine Spirale um eine konkave Ecke ist kein dokumentiertes Handwerksmuster.
Konkave Polygone werden deterministisch in gedrungene, rechteckartige
Teilfelder zerlegt (Ziel: Seitenverhältnis ≤ 1:2; Schnitte entlang
Rasterlinien an konkaven Ecken; kleinste Anzahl Felder, Gleichstand →
lexikographisch stabil). Die eine Schlange füllt die Felder sequenziell:
Muster in Feld 1, Überleitungskorridor, Muster in Feld 2, …; die
Feldreihenfolge und die Korridorlage sind Suchentscheidungen mit Backtracking.
Konvexe Räume sind der Spezialfall mit genau einem Feld.

### 6.3 Zustand und Aktionen

```text
Zustand  = (Pose, aktives Feld, Schalen-/Lane-Index,
            belegte Bahnsegmente, reservierte Bahnsegmente,
            Restlängenbudget, Journal)
Aktion   = nächste Graphkante entlang der aktuellen Bahn
         | regelkonformer Wechsel auf die nächste Bahn (Template)
         | Feldübergang über gewählten Korridor
         | Einsetzen der Kehre (nur spiral, nur im innersten Freiraum)
```

Aktionen werden in fester deterministischer Reihenfolge expandiert
(Bahn fortsetzen vor Wechsel, Wechsel-Templates nach stabiler ID).

### 6.4 Harte Invarianten = sofortige Dead-Ends (spiral)

1. **Doppelabstand:** Der Einwärtsarm belegt Bahnen im Abstand `2×VA`; die
   Zwischenbahn wird bei Belegung einer Bahn sofort als Rücklauf
   **reserviert**. Jede Aktion, die ein reserviertes Segment belegt →
   Dead-End.
2. **Terminal:** Die reservierten Bahnen müssen als zusammenhängender
   Korridor die Anschlusszone erreichen. Nach jeder Aktion inkrementeller
   Abschnür-Check; Korridor getrennt → Dead-End.
3. **Kehren-Budget:** Vor jedem Schalenabstieg wird geprüft, ob der
   verbleibende innere Freiraum die S-Wendeschleife trägt (beide Bögen
   ≥ 80 mm, Umlenkung über ≥ 2 Noppen, Platz = der `2×VA`-Freiraum). Nicht
   tragfähig → kein Abstieg; die Kehre wird niemals verkleinert.
4. **Alternanz:** Außerhalb der Kehre dürfen keine zwei benachbarten Bahnen
   demselben Arm gehören.

### 6.5 Rücklauf-Konstruktion statt -Suche

Ist der Einwärtsarm komplett und die Kehre eingesetzt, wird der Rücklauf
**konstruiert**: mittig im reservierten Freiraum, auf die Rasterkanäle
gesnappt, als Kantenfolge im Graph nachvollzogen. Existiert eine benötigte
Kante nicht (z. B. weggeschnitten am Rand), ist das ein Dead-End des
Einwärtsarms — Backtracking, nicht Reparatur. Der Rücklauf ist keine
Suchdimension.

### 6.6 Muster-Invarianten meander

- Lanes werden in fester Reihenfolge gefüllt; **Paritätsregel:** Die Parität
  der Lane-Anzahl muss die Rückführung zur Anschlusszone erlauben; Verstoß
  ist vor Suchbeginn erkennbar → Lane-Layout anpassen statt suchen.
- Rückführung läuft randnah in einer dafür freigehaltenen Bahn; deren
  Reservierung und Erreichbarkeit sind dieselben Invarianten 1–2 wie bei
  spiral (mit `1×VA`-Belegung statt `2×VA`).

### 6.7 free

`free` nutzt das Framework ohne Muster-Invarianten: Coverage-Greedy-Ordnung
(nächste Aktion = größter Zugewinn an noch unversorgter Fläche), plus alle
harten Regeln aus § 5, plus Terminal-Invariante (Rückweg der zweiten
Pfadhälfte zur Zone bleibt erreichbar). Erwartbar langsamer; Limits § 12.

### 6.8 Backtracking und Journal

Chronologisches Backtracking über einen expliziten Entscheidungsstapel. Jeder
Eintrag: Entscheidung, Alternativen-Rest, bei Verwurf die verletzte
Invariante samt Zeugengeometrie. Das Journal ist Teil der Diagnose-Ausgabe
(letzte N Einträge, N konfigurierbar, Default 200) — „dokumentiert
zurückgehen" ist Produktverhalten, nicht nur Log.

### 6.9 Längen-Pre-Prune

Vor jeder Suche: `L̂ = Feldfläche/VA + Zonen- und Korridorzuschlag`.
`L̂ > 100.000 mm` → Suche wird gar nicht gestartet, Eskalation § 8 greift.
Während der Suche führt jede Aktion Restbudget; Unterschreitung → Dead-End.

## 7. Kehre (spiral)

S-förmige Wendeschleife am inneren Spiralende aus zertifizierten
Kehren-Templates (Teardrop/BroadReverse-Familie). Beide Bögen ≥ 80 mm.
Platzbedarf ist konstruktiv im Kehren-Budget (§ 6.4.3) hinterlegt. Lokale
Abstandsunterschreitung bis zur physischen Nichtberührung ist innerhalb der
Kehre zulässig und wird ausgewiesen.

## 8. Spacing-Eskalation und Längenregel

1. Start exakt bei `requestedSpacingMm`.
2. Existiert ein zertifizierter Kandidat ≤ 100.000 mm → kein größerer
   Abstand wird untersucht.
3. Scheitern alle Kandidaten **ausschließlich an der Länge** (Pre-Prune oder
   Budget-Dead-Ends), wird auf den nächsten Wert der Liste
   `75 → 150 → 225 → 300` eskaliert; Warnung `SPACING_INCREASED`,
   bei 300 mm zusätzlich `SPACING_EXCEEDS_250_MM`.
4. Scheitert die Geometrie (Invarianten, Kehre, Zerlegung), wird **nicht**
   eskaliert → `NO_SOLUTION_GEOMETRY` mit Journal-Auszug.
5. Scheitert auch 300 mm an der Länge → `NO_SOLUTION_LENGTH`.
6. Volle Deckung mit gewähltem Abstand unter 100 m ist das Ziel; der Solver
   streckt niemals künstlich Richtung 100 m.

## 9. Coverage

Zielfunktion wie bisher: maximaler Abstand eines Polygonpunkts zum Rohrpfad,
zertifiziert per Branch-and-Bound mit 1-Lipschitz-Schranken auf 0,1 mm
Intervall (Übernahme aus der alten Spec § 17, unverändert). Anschlusszone
und Wandzonen zählen zur Fläche.

## 10. Ranking

Kandidaten desselben Abstands, vollständig zertifiziert und ≤ 100 m:

1. kleinste zertifizierte Coverage-Obergrenze;
2. geringste Strafsumme: Unterschreitungen von 50 mm Mitte–Mitte
   (Summe über `max(0, 50 − d)` an den gemessenen Minima, Zone und Kehre
   eingeschlossen);
3. kleinste Spannweite der gemessenen Bahnabstände im Musterbereich;
4. kürzere Gesamtlänge;
5. lexikographisch kleinster stabiler Kandidatenschlüssel.

Über Abstände hinweg gewinnt immer der kleinste nach § 8 nötige Abstand.

## 11. Unabhängiger Validator

Erweiterung des bestehenden Validators, teilt mit dem Generator nur
Primitivtypen. Bestätigt zusätzlich zu § 5:

- Provenienz: außerhalb der Zone entspricht jedes Pfadstück exakt einer
  zertifizierten Graphkante (ID-Abgleich + Geometrievergleich);
- Zonen-Phasenautomat: Zone → Graph → Zone genau je einmal pro Pfadende,
  kein Wiedereintritt;
- Muster-Provenienz (spiral): Alternanz der Arme, genau eine Kehre;
- Berührungs- und 50-mm-Messung: analytische Paarabstände mit
  Pfadbogenlängen-Lokalitätsbegriff (`localArcLength = 80π mm`, Übernahme);
- Längen-, Radius-, G1-, Polygon- und Coverage-Zertifikat wie gehabt.

`ok: true` nur nach vollständiger Zertifizierung; Zertifikatswiderspruch →
`INTERNAL_VALIDATION_FAILURE`, ein solcher Plan wird nie ausgegeben.

## 12. Determinismus und Limits

- Identische Eingabe + Solverversion → byte-identisches Ergebnis; keine
  Zufälle, stabile Ordnungen überall, `requestHash` in der Ausgabe.
- Arbeitslimits (typisierte `SOLVER_LIMIT_EXCEEDED`-Fehler, nie Timeouts):
  höchstens 100.000 Suchaktionen inkl. Backtracks pro Abstand,
  höchstens 500 Feld-Zerlegungsvarianten,
  Coverage-Zellbudget wie bisher (2.000.000).

## 13. Ausgabe

```ts
interface LoopPlan {
  solverVersion: string;
  requestHash: string;
  pattern: "spiral" | "meander" | "free";
  path: PathPrimitive[];              // geordnet Port → Port
  actualSpacingMm: 75 | 150 | 225 | 300;
  totalLengthMm: number;
  connection: { startPort: Point; endPort: Point; zone: RectMm };
  coverage: CoverageCertificate;      // wie bisher
  spacingPenalty: {
    sumMm: number;
    worst: LocatedSpacing | null;     // schlimmste 50-mm-Unterschreitung
  };
  fields: FieldDiagnostics[];         // Zerlegung, je Feld Muster + Bahnen
  searchJournalTail: JournalEntry[];  // letzte Entscheidungen, Diagnose
  warnings: SolverWarning[];          // Reihenfolge fest
  constraintCertificate: LoopConstraintCertificate;
}
```

`SolveResult = { ok: true, plan } | { ok: false, error }` mit Journal-Auszug
in `error.details` bei `NO_SOLUTION_*`.

## 14. UI

Erweiterung der bestehenden Seiten (eigene Loop-Seite oder Integration in
`index.html` entscheidet der Implementierungsplan):

- Musterwahl spiral / meander / free;
- Abstandswahl 75/150/225/300, Anschlusszonen-Parameter;
- Darstellung: Pfad mit Arm-Färbung (VL/RL), Kehre, Zone, Felder,
  Coverage-Worst-Point, Strafstellen < 50 mm;
- Journal-Ansicht der letzten Entscheidungen bei Fehlschlag;
- Import/Export JSON wie gehabt.

## 15. Tests

- **Unit (Rust):** Bahnenzerlegung; Reservierungs-Invariante; Abschnür-Check;
  Kehren-Budget (Grenzfall exakt passend / 1 mm zu klein); Paritätsregel
  meander; Feld-Zerlegung für L/U/C inkl. Determinismus; Pre-Prune-Formel;
  Rücklauf-Konstruktion (fehlende Kante → Backtrack).
- **Golden:** Rechteck 3×2,4 m mit VA 150 → Schnecke, Handbuch-konform
  (2×VA-Einwärtsarm, mittiger Rücklauf, eine S-Kehre); dieselbe Eingabe als
  meander; ein Raum, der erst bei VA 225 unter 100 m fällt (Eskalation);
  ein Raum ohne Kehrenplatz bei VA 75 → `NO_SOLUTION_GEOMETRY`.
- **Property/Metamorph:** Translation/Rotation/Spiegelung der Eingabe ändert
  Zertifikate nur im numerischen Budget; kein Generator-Erfolg, den der
  Validator ablehnt (Fuzz über Polygone 4–10 Ecken).
- **Abnahme je `ok: true`:** ein Pfad Port→Port, Muster-Provenienz korrekt,
  alle harten Regeln zertifiziert, deterministisch reproduzierbar.

## 16. Bewusste Grenzen

Konstruktion erzeugt Kandidaten; nur der unabhängige Validator erzeugt
Pläne. Kein Suchtrick (Reservierung, Konstruktion des Rücklaufs, Zerlegung)
gilt als Korrektheitsbeweis — alles wird am Ende geometrisch geprüft.
