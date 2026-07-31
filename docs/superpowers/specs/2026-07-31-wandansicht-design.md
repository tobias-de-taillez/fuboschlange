# Wandansichten mit Öffnungen — Design

## Ziel

Nicht nur der Grundriss, sondern jede Wand als Frontalansicht mit ihren
Öffnungen: Tür, Fenster, Wandloch (Durchreiche). Öffnungen werden wie im
Grundriss über Messungen positioniert, dürfen die Wand nie verlassen, und
erscheinen im Grundriss mit Aufschwingradien. Zusätzlich eine Abwicklung:
die Wände klappen im Grundriss nach außen weg, je nach Abstand zum
Fokuspunkt.

## 1. Höhe gehört zur ECKE, nicht zur Wand

Die tragende Entscheidung dieses Designs.

Jeder Grundrisspunkt bekommt eine Deckenhöhe `h`. Die Wand zwischen A und
B ist damit das Viereck

    (0, 0) — (L, 0) — (L, h_B) — (0, h_A)      L = Wandlänge aus dem Fit

also ein Rechteck bei gleichen Höhen, ein Trapez bei ungleichen, ein
Dreieck wenn eine Höhe 0 ist.

**Warum so:** Zwei im Grundriss benachbarte Wände müssen sich in der
Wandansicht eine Kante und deren beide Eckpunkte teilen. Liegt die Höhe
an der Ecke, ist das per Konstruktion erfüllt — Wand A–B und Wand B–C
lesen beide dasselbe `h_B`. Es gibt keinen Zustand, in dem die Wände
einander widersprechen; die wandübergreifende Konsistenzprüfung entfällt
ersatzlos, ebenso das Übernehmen der Kante beim Wechsel zur Nachbarwand:
die Nachbarwand hat sie bereits.

Läge die Höhe dagegen an der Wand (je zwei Werte pro Wand), gäbe es zu
jeder Ecke zwei konkurrierende Zahlen, die per Zwangsbedingung
zusammengehalten werden müssten — mehr Code, mehr Fehlerquellen, und ein
Widerspruch wäre jederzeit darstellbar.

**Bewusste Grenze:** Ein Deckenversprung genau an einer Ecke oder mitten
in einer Wand ist so nicht abbildbar. Nachrüstbar über Zwischenpunkte im
Höhenprofil einer Wand; bis dahin YAGNI.

Der Boden liegt überall auf 0. Schiefe Böden wären die analoge Erweiterung
(`b` je Ecke), bleiben vorerst draußen.

### Höhen messen

Höhe ist eine gewöhnliche Messung wie jede andere: `{kind:'h', at:'B',
d, sigma}`. Solange nur eine einzige Höhe gemessen ist, gilt sie für alle
Ecken (der Normalfall: rechteckiger Raum, eine Deckenhöhe). Sobald eine
zweite, abweichende Höhe eingetragen wird, zählt jede Ecke für sich, und
ungemessene Ecken erben den Mittelwert der gemessenen — sichtbar als
„angenommen", nicht als Messwert.

## 2. Öffnungen

```
{ id, wall:[a,b], kind:'door'|'window'|'hole',
  w, h,                    // Rohbaumaße in mm
  x, y,                    // linke untere Ecke in Wandkoordinaten
  fixed:{w,h},             // aus dem Katalog gewählt oder frei
  swing:{...}              // je nach kind, siehe unten
}
```

Wandkoordinaten: x von der Ecke `a` nach `b`, y vom Boden. Die Öffnung
ist immer achsparallel — Türen und Fenster stehen senkrecht, auch in
trapezförmigen Wänden.

### Standardmaße

Türen (Rohbau, Breite × Höhe in mm), aus den gängigen Baurichtmaßen:
- Breiten 610, 735, 860, 985, 1110 (entspricht Türblatt 60/70/80/90/100)
- Höhen 1885, 1985, 2110 (Türblatt 1800/1900/2000 zzgl. Zarge)
- dazu freie Eingabe

Fenster haben keine vergleichbar feste Normreihe — verbreitet sind
Breiten 600/800/1000/1200/1400 und Höhen 600/800/1000/1200/1400, jeweils
frei überschreibbar. Beim Einsetzen ohne Auswahl gilt die Vorbelegung aus
Abschnitt 4.

### Öffnungsarten (Recherche 2026-07-31)

Tür: Dreh links / Dreh rechts, jeweils nach innen oder außen aufschlagend
(DIN-links/DIN-rechts). Zusätzlich Schiebetür (kein Radius) und
Öffnung ohne Tür.

Fenster, mitteleuropäische Typen:
- **Fest** verglast (kein Flügel)
- **Dreh** links/rechts (Achse seitlich)
- **Kipp** (Achse unten, öffnet oben nach innen)
- **Dreh-Kipp** links/rechts — der De-facto-Standard in Deutschland
- **Klapp** (Achse oben)
- **Schwing** (Achse waagerecht in der Mitte)
- **Stulp** (zweiflügelig ohne Mittelpfosten), je Flügel eine Art

Aufrisssymbolik: Dreieck, dessen Spitze auf die Bandseite zeigt
(Dreh = seitlich, Kipp = unten, Klapp = oben, Schwing = beidseitig).
Durchgezogen für nach innen öffnend, gestrichelt für nach außen.

Wandloch hat keine Öffnungsart.

## 3. Positionieren über Messungen

Bei fester Größe hat eine Öffnung genau zwei Unbekannte: `x` und `y`.
Zwei unabhängige Messungen bestimmen sie, jede weitere kontrolliert.

Messtypen (jeweils von einer Öffnungsecke oder -kante):
- **orthogonal zur Wandkante**: Abstand einer Öffnungskante zur linken
  oder rechten Wandkante, zum Boden oder zur Decke — der Normalfall auf
  der Baustelle (Zollstock an die Laibung).
- **Ecke zu Ecke**: euklidischer Abstand zwischen einer Öffnungsecke und
  einer Wandecke — für schräge Fälle.

Gelöst wird mit demselben Verfahren wie der Grundriss (Gauss-Newton auf
den Residuen, danach Redundanzanteile und normierte Residuen), nur über
zwei statt 2n−3 Unbekannten. Damit gelten dieselben Aussagen: was fehlt
noch, welche Messung ist verdächtig, wie genau steht das Ergebnis.

Ist die Größe nicht aus dem Katalog gewählt, sondern frei, kommen `w`
und `h` als Unbekannte dazu (dann vier), und es braucht entsprechend mehr
Messungen.

## 4. Einsetzen ohne Messung: sinnvolle Vorbelegung

Damit nichts an einer absurden Stelle erscheint:

- **Fenster**: Breite ⅔ der Wandbreite, Höhe ⅓ der Wandhöhe, waagerecht
  mittig, Brüstung so, dass das Fenster im oberen Bereich sitzt (Unterkante
  auf ⅖ der Wandhöhe).
- **Wandloch**: identisch zum Fenster.
- **Tür**: Breite 985, Höhe 1985, waagerecht mittig, auf dem Boden.

Der Nutzer positioniert danach ohnehin per Messung; die Vorbelegung
sorgt nur dafür, dass von Anfang an etwas Plausibles dasteht.

## 5. Randbegrenzung

Eine Öffnung darf die Wand nie verlassen. Beim Ziehen greift dieselbe
Mechanik wie die Kreuzungsbremse im Grundriss: der Schritt wird gedämpft,
je näher die Öffnung an den Rand kommt — hier allerdings **hart** an der
Grenze, weil eine Tür halb außerhalb der Wand keine sinnvolle Zwischenlage
ist (anders als eine Wandkreuzung, die man beim Skizzieren durchlaufen
können muss). In trapezförmigen Wänden ist die Grenze die schräge Kante,
nicht ein Rechteck.

Wird die Öffnung größer als die Wand, meldet die Wandansicht das im
Klartext, statt sie stumm zu beschneiden.

## 6. Grundriss: Aufschwingradien

Jede Öffnung erscheint im Grundriss als Unterbrechung der Wandlinie.
Drehflügel bekommen zusätzlich den Radius:

- Der Bogen läuft **nicht** pauschal bis 90°, sondern bis kurz vor das
  nächste Hindernis (Wand oder andere Öffnungskante) — abzüglich weniger
  Grad, damit sichtbar bleibt, dass es ein Radius ist und nicht der
  Winkel zwischen zwei Wänden.
- Gedeckelt bei 180°, weiter schwingt kein Blatt.
- Nach innen öffnend wird in den Raum gezeichnet, nach außen entsprechend
  hinaus.

Damit ist im Grundriss sichtbar, welchen Platz eine Tür beansprucht — die
Grundlage dafür, später Möbel einzuzeichnen.

## 7. Abwicklung im Grundriss

Wände, für die eine Ansicht existiert, werden im Grundriss nach außen
weggeklappt gezeichnet: die Wandansicht erscheint als Fläche außerhalb der
Wandlinie, mit ihren Öffnungen darin.

Der Klappgrad hängt vom Abstand zum **Fokuspunkt** ab (Bildschirmmitte in
Weltkoordinaten):

    unfold = clamp(dist(Wandmitte, Fokus) / refDist, 0, 1)

`refDist` ist die halbe Diagonale der Grundriss-Bounding-Box. Wirkung:

- Fokus über der Raummitte → alle Wände gleich weit aufgeklappt,
  symmetrische Übersicht.
- Fokus zu einer Wand hin verschoben → diese Wand legt sich flach (stark
  gestaucht, fast nur Linie), die gegenüberliegende stellt sich auf und
  zeigt ihren Inhalt deutlich.

Das erzeugt den Eindruck einer Schrägsicht von oben, ohne dass eine
3D-Ansicht existiert: gezeichnet wird weiterhin nur in die Ebene, die
Wandansicht wird lediglich um den Faktor `unfold` in Richtung der
Außennormalen gestreckt. Beschriftungen bleiben waagerecht.

## Etappen

1. Höhe je Ecke (Messung, Vorbelegung, Anzeige), Wandansicht-Tab,
   Öffnungen einsetzen mit Katalogmaßen und Randbegrenzung.
2. Positionieren über Messungen mit dem Zwei-Parameter-Solver, samt
   Verdachts- und Vollständigkeitsanzeige wie im Grundriss.
3. Grundriss-Symbolik: Öffnungen in der Wandlinie, Aufschwingradien bis
   kurz vors Hindernis.
4. Abwicklung mit fokusabhängigem Klappgrad.

Nach jeder Etappe ist die App vollständig lauffähig.

## Bewusst nicht

- Kein 3D. Die Abwicklung ist eine Projektionsregel, kein Raummodell.
- Keine Wandstärke. Wände sind Linien; Laibungstiefe wäre ein eigenes
  Thema.
- Keine Deckenversprünge innerhalb einer Wand (siehe Abschnitt 1).
- Keine Möbel — die Radien schaffen nur die Voraussetzung dafür.
