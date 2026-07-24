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
Parameter stehen als Konstanten oben in der Datei; ändern → Datei neu laden.
Druck/PDF über den Browser (`Strg+P`).

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

### 1. `offsetContours(poly, s, edgeGap)` → Kontur[]
`poly` ist das **Feldpolygon** = Raum, an markierten Fensterwänden um die
Randzonen-Streifenbreite (`randPasses × randSpacing`) eingerückt, an unmarkierten
Wänden um `edgeGap`. So kollidiert das Feld nicht mit der Randzone (Schritt 3/4).
Verschachtelte Konturen nach innen: erste Kontur an der Feldpolygon-Kante,
dann jeweils `s` weiter innen. Handgerollter rektilinearer Inward-Offset.
Das L bleibt beim Schrumpfen einfach zusammenhängend — genau ein
Topologie-Event, wenn der kurze Schenkel verschwindet (L wird zu Rechteck,
schrumpft weiter). Keine Insel-Aufspaltung → handgerollt bounded.

**Degenerations-Check:** ist `s` groß gegen die kurze Schenkelbreite, entstehen
nur 1–2 Konturen → Schnecke degeneriert → Warnung ausgeben.

### 2. `bifilarPath(contours)` → Punkt[]
Gegenstrom-Durchlauf. Konturen 1 (außen) … N (innen).
**Reihenfolge: ungerade aufsteigend, dann gerade absteigend.**
- N=5 → `1,3,5,4,2`
- N=4 → `1,3,4,2`

Wicklungssinn auf alternierenden Konturen umkehren, damit die Verbinder sich
nicht kreuzen. Ergebnis: radiale Richtung wechselt zwischen benachbarten
Konturen (Vor/Rücklauf verschachtelt = Gegenstrom), beide Enden landen
nebeneinander am Rand nahe dem Verteiler. Die Kontur-Sprünge (1→3, 4→2) liegen
an einem "Schnitt" nahe dem Verteiler — dieser Hals ist die eine enge Stelle
und ist Standard, nicht überoptimieren.

### 3. `randzone(windowEdges, randSpacing, randPasses)` → Punkt[]
Entlang jeder markierten Fensterkante `randPasses` dichte Parallelbahnen im
Abstand `randSpacing` (5 cm). **Vorlauf zuerst an die Scheibe** — heißestes
Wasser dort → treibt Konvektion an der Glasfläche, bricht den Kaltluftabfall.

### 4. Stitch → eine Polyline
`Verteiler → Randzone → Feld-Schnecke → zurück zum Verteiler.` Endpunkte mit
kurzen Verbindern koppeln. Das Feldpolygon ist um die Randzonen-Streifenbreite
von den markierten Wänden eingerückt, damit Randzone und Feld-Außenkontur nicht
kollidieren.

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

Non-triviale Logik → je ein `assert`-Selbstcheck (kein Framework):

- `bifilarPath`: für N=4 und N=5 die erwartete Kontur-Reihenfolge prüfen
  (`1,3,4,2` bzw. `1,3,5,4,2`) und dass beide Enden auf der äußeren Kontur/am
  Rand liegen.
- `pathLength`: bekannte Polyline (z.B. Rechteck-Umfang) → bekannte Länge.
- `offsetContours`: auf einem Rechteck erzeugt konzentrische Rechtecke im
  Abstand `s`; Anzahl Konturen = erwartet.

Selbstcheck läuft beim Laden der Seite (Konsole) oder als kleiner Sicht-Block.

## Bau-Reihenfolge (Risiko zuerst)

1. `offsetContours` + `bifilarPath` → aufs echte L rendern und **angucken**.
   Hier bricht die Geometrie. Ist visuell, also hinschauen.
2. Randzone dazu.
3. Länge, Materialliste, Maßstabsbalken, Bemaßung — fallen billig raus.
