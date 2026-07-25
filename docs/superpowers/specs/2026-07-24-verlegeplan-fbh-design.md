# Verlegeplan Fußbodenheizung — Design (MVP)

**Datum:** 2026-07-24
**Status:** Freigegeben, bereit für Implementierungsplan

## Zweck

Erzeuge einen maßstabsgetreuen Verlegeplan für die Fußbodenheizung EINES
L-förmigen Raums. Ausgabe: Zeichnung + Rohrlänge + Materialliste. Lokal,
einmalig, kein Server, kein Online-Service.

## Scope

- **Ein Raum, einmal.** Kein Multi-Raum, keine Projektverwaltung.
- **Geometrie:** L-Form, alle Ecken rechtwinklig (rektilineares Polygon).
- **Muster:** bifilare Schnecke (Gegenstrom) im Feld.
- **Randzone:** an markierten Fensterwänden dichtere Bahnen (Konvektion an der Scheibe).

## Stack

Eine einzige selbst-enthaltene HTML-Datei (`verlegeplan.html`). Kein Server,
keine Dependencies, kein Build. Öffnen im Browser → Plan wird gerendert.

Bedienung über ein Control-Panel mit Live-Render (Raummaße, Bahnabstand,
Biegeradius, Randzone, Fensterwände, Kreiszahl/Autofit, Verteiler). Der
Verteiler wird per Klick auf den Plan gesetzt und auf die nächste Wand
gesnappt. Druck/PDF über den Button bzw. `Strg+P`.

Verworfen: Python+matplotlib (mehr Setup, kein Live-Angucken). Fallback nur bei
Bedarf: `clipper2-js` lokal vendored für Polygon-Offset, falls der handgerollte
rektilineare Offset auf dem konkreten L Artefakte erzeugt.

## Inputs (Konstanten oben in der Datei)

Alle Maße intern in **mm**, Anzeige in **m**.

- `room` — L-Form als rektilineares Polygon (Eckpunkte) oder zwei Rechtecke.
- `s` — Bahnabstand im Feld (Default 150 mm), einstellbar.
- `edgeGap` — Randabstand erste Bahn zur Wand (Default 75 mm).
- `manifold` — Verteiler-Position (Wand + Punkt). Beide Rohrenden enden hier.
- `pipeDia` — Rohr-Außendurchmesser (Default 16 mm).
- `maxLoop` — max. Kreislänge (Default 100 m für 16 mm), Parameter nicht Konstante.
- `windowEdges` — Liste markierter Kanten (Fensterfronten).
- `randSpacing` — Randzone-Bahnabstand (Default 50 mm), einstellbar.
- `randPasses` — Anzahl Randzone-Bahnen (Default 2), einstellbar.

## Geometrie-Pipeline (die Bau-Units)

Reihenfolge = auch die empfohlene Bau-Reihenfolge. Der Rohrpfad ist am Ende
EINE Polyline (Punktliste in mm). Länge, Materialliste und Zeichnung fallen
danach billig raus.

### 1. Zerlegung in Rechtecke — `rectsOfL()` / `partition(N)`
Das rohe L wird **nie** spiraliert. Es wird in Rechtecke zerlegt (linker hoher
Teil + rechter niedriger Teil); jeder Heizkreis ist eine Liste von Rechtecken,
die in Serie verlegt werden.

Grund (aus der Implementierung gelernt): Konturen eines L haben keine gemeinsame
Mitte. Jeder Torkanal driftet dadurch beim Schrumpfen und die Verbinder
schneiden die Spirale. Rechtecke haben eine gemeinsame Mitte — Problem
verschwindet per Konstruktion.

Zonenbreiten von der Wand nach innen: **Randzone → Leitungskorridor → Feld**.
`fieldInset = edgeGap + randPasses×randSpacing + korridorBreite`.

### 2. `doubleSpiral(rect, ins, s, gate)` → Punkt[]
Bifilare Doppelspirale aus **wandparallelen konzentrischen Ringen** mit
**Ecken-Treppe** (Praxis-Standard):
- Rücklauf = gerade Tiefen (0, 2s, …) im Uhrzeigersinn, Vorlauf = ungerade
  Tiefen (s, 3s, …) gegen den Uhrzeigersinn → Gegenstrom, Abstand s überall.
- Jeder Ring hat in der Unterkante nahe der **verteilerzugewandten Ecke** eine
  Lücke der Breite `g = 2s`; alle Ring-zu-Ring-Sprünge laufen als parallele
  Diagonalen in dieser 45°-Ecken-Zone. Ein Sprung quert das Kanten-Niveau des
  fremden Zwischenrings exakt in dessen Lücken-Mitte → kreuzungsfrei per
  Konstruktion.
- Eintritt in der Lücken-Mitte des äußersten Rings (`x0+g/2`), Austritt am
  Lückenrand (`x0+g`) → beide Steigleitungen fallen frei in den Korridor,
  Abstand s. Die Schlaufe beginnt und endet damit an der Verteiler-Seite.
- `ins` = per-Seite-Insets (`insetsFor`): Randzonenbreite nur an echten
  Fensterwänden, Korridor nur unten, innere Nähte s/2.

**Verworfen:**
- Aufgeschnittene Ringe mit gemeinsamer Tor-x-Linie (Sprung k→k+2 durch den
  Endpunkt von Ring k+1; latenter Bug).
- Archimedische Arme (Wandabstand wächst pro Vierteldrehung): funktionell
  kreuzungsfrei, aber alle Bahnen leicht schräg — Nutzeranforderung ist
  wandparallel.
- Feste vertikale Tor-Spalte bei Verteiler-Projektion: bricht, sobald das Tor
  randnah geklemmt wird und innere Ringe die Spalte nicht mehr erreichen.

### 2b. Spiegelung & Heizdeckung
- `notchLeft` (Default): Grundriss mit Ausschnitt oben links. Intern wird immer
  Notch-rechts gerechnet; nur Rendering, Klick und Verteiler-Felder spiegeln
  (`mirX`), Fensterkanten-Angaben werden beim Übergang getauscht (`wEdges`).
- `heatCoverage`: Raster-Sampling (Schritt 25 mm) — Anteil der Bodenfläche im
  Abstand ≤ 25 mm um irgendein Rohr. Als Karte „Heizdeckung" ausgewiesen.

### 3. `randzone(windowEdges, randSpacing, randPasses)` → Punkt[]
Entlang jeder markierten Fensterkante `randPasses` dichte Parallelbahnen im
Abstand `randSpacing` (5 cm). **Vorlauf zuerst an die Scheibe** — heißestes
Wasser dort → treibt Konvektion an der Glasfläche, bricht den Kaltluftabfall.

### 4. Stitch + Leitungsführung → eine Polyline
`Verteiler → Randzone → Feld-Schnecke → zurück zum Verteiler.`

Anbindeleitungen laufen **nicht** diagonal durchs Feld, sondern Manhattan-artig
durch einen reservierten **Randkorridor**, jede auf einer eigenen Spur
(`routeVia`). Spurvergabe nach Distanz: der Anschluss, der dem Verteiler am
nächsten liegt, bekommt die **innerste** Spur. Dadurch muss keine Stichleitung
über eine fremde Spur steigen. Liegt der Verteiler nicht an der unteren Wand,
führt der Weg zuerst an der Seitenwand entlang, sonst zerschneidet die
Vertikale das Feld.

Rechteck-zu-Rechteck-Übergänge innerhalb eines Kreises laufen im wandnahen
Kanal unter allem.

### 5. `pathLength(path, maxLoop)` → { meter, warn }
Summe der Segmentlängen. Warnung wenn `meter > maxLoop`.
`// ponytail: nur Warnung, Kreis-Split erst wenn ein Raum das Maximum reißt.`

### 6. `renderSVG(...)` → SVG
- Raumumriss, Fensterwände farblich hervorgehoben.
- Rohrpfad, Randzone vs. Feld farblich getrennt.
- Verteiler-Marker.
- Bemaßung.
- **Maßstabsbalken auf dem Plan gezeichnet** — der Balken skaliert mit der
  Zeichnung. Nicht auf Druck-bei-100% verlassen; Browser-"fit to page"
  skaliert sonst und zerstört den echten Maßstab still.

### 7. Materialliste
Gesamt-Rohrmeter, Anzahl Heizkreise, Randzonen-Meter separat,
Verteiler-Abgänge.

## Bewusst weggelassen (YAGNI)

Add-when: der Nutzer fragt danach.

- Maus-Zeichnen / Canvas-Editor für Raumformen — Konstanten reichen für einen Raum.
- Grundriss-Upload / Bild-Tracing.
- Mehrere Räume, Projektverwaltung, Speichern.
- Server, DB, Login, alles Online.
- Auto-Split zu langer Kreise — nur Warnung.
- Schrägen / Rundungen — nur rechtwinklige L-Form.

## Testing

Non-triviale Logik → je ein `assert`-Selbstcheck (kein Framework), läuft beim
Laden der Seite und loggt in die Konsole:

- `fillet`: 90°-Ecke mit r=100 → Länge exakt `1800 + 100·π/2` (analytische
  Bogenlänge, nicht Polyline-Näherung). Gerade Punktfolge → reine Streckenlänge.
- `bifilarOrder`: N=4 → `[0,2,3,1]`, N=5 → `[0,2,4,3,1]`.
- **Kreuzungsfreiheit**: Spiralen über mehrere Raumgrößen × Bahnabstände →
  0 Selbstschnitte. Das ist die harte Anforderung des Tools.
- `doubleSpiral` liefert beide Arme.

### Laufender E2E-Check in der UI
Bei **jedem** Render wird geprüft und im Plan/Status ausgewiesen:
- **Spiralen-Überlappungen** → harter Fehler, rote Marker im Plan. Muss 0 sein.
- **Anbindeleitungs-Kreuzungen** → getrennt gezählt, kein Fehler: dort werden
  Rohre am Verteiler übereinander geführt (Baupraxis).

Verifiziert: 0 Spiralen-Kreuzungen über 168 Raumgrößen und alle 672
Parameter-Kombinationen (Bahnabstand × Kreis-Modus × Verteiler-Position ×
Notch-Form).

## Bau-Reihenfolge (Risiko zuerst)

1. `partition` + `doubleSpiral` → aufs echte L rendern und **angucken**.
   Hier bricht die Geometrie. Ist visuell, also hinschauen.
2. Randzone dazu.
3. Länge, Materialliste, Maßstabsbalken, Bemaßung — fallen billig raus.
