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

### 2. `doubleSpiral(rect, d0, s)` → Punkt[]
Echte bifilare Doppelspirale, **keine aufgeschnittenen Ringe**:
- Vorlauf-Arm spiralt nach innen, Bahnen bei `d0, d0+2s, d0+4s, …`
- Rücklauf-Arm spiralt nach außen, Bahnen bei `d0+s, d0+3s, …`
- Beide Arme innen per U-Turn verbunden, beide Enden liegen außen.

Jeder Arm ist eine rechteckige archimedische Spirale: der Wandabstand wächst pro
Vierteldrehung um `step/4`. Es wird nichts aufgeschnitten und es gibt keinen
radialen Sprung → **ein Arm kann sich per Konstruktion nicht selbst kreuzen**,
und die Arme liegen konstant `s` auseinander → sie kreuzen einander nie.

Beide Arme laufen gleich tief (`min` der Schrittzahlen), sonst entartet der
U-Turn zu einer langen Diagonale quer durch die Raummitte.

**Verworfen (war der Bug):** Ringe einzeln aufschneiden und radial verbinden.
Alle Ring-Öffnungen liegen auf derselben x-Linie, dadurch läuft der Sprung von
Ring k zu k+2 exakt durch den Endpunkt von Ring k+1. Der Fehler war latent und
schlug nur bei bestimmten Raumgrößen zu.

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
