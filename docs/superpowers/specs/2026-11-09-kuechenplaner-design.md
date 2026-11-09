# Küchenplaner (Modus 5) – Entwurf und Quellen

Stand 2026-11-09. Der Code liegt in `raumaufmass.html`: Block `kitchen` (Logik, DOM-frei, Selbstchecks in `checks`) und Block `kitchen-ui` (Bedienung, Plan, 3D).

## Leitlinie

Für den Standardfall soll es einfach sein, komplex wird es nur bei Sonderwünschen.

- Teile kommen aus der Palette: Unterschrank, Spüle, Spülmaschine, Herd, Hängeschrank, Hochschrank, Kühlschrank, Backofen hoch, Insel, Tisch.
- Ein Klick setzt das Teil neben das gewählte. Ziehen legt es an die nächste Wand.
- Die Arbeitsplatte entsteht automatisch je Zeile.
- Im Panel stellt man für das gewählte Teil Breite (im Raster), Front, Anschlag, Gerät und Inhalt ein.
- „Maße frei“ (Tiefe, Höhe, Unterkante, Drehung) ist zugeklappt.
- Das Vorbild ist der Fliesenmodus: Palette, Plan, Auswahl, Panel.

## Modell

- `M.kitchen = {spec, items, seq}`. `normKitchen` liest tolerant: kaputte Teile fallen einzeln weg, IDs werden eindeutig.
- **Teile an Wänden** sind wie Öffnungen verankert, über Wandecken `a,b` und `x` (mm ab `a`). Der Rahmen ist kanonisch, die kleinere Ecken-ID steht zuerst. So überstehen die Teile jedes Nachmessen.
- **Tisch und Insel** liegen im Raumrahmen (`TILES.frameOf`).
- Die Küche gibt es nur bei eindeutigem Grundriss (`dof===0`), wie die Wandansichten.

### Standardmaße

Quellen: nobilia Typenliste 2026, Neff.

| Maß | mm |
|---|---|
| Sockel | 150 |
| Korpus | 720 |
| Platte | 40 |
| Tiefe mit Front | 580 |
| Plattentiefe | 600 |
| Arbeitshöhe | 910 |
| Hängeschrank | 720 × 370 |
| Hochschrank-Korpus | 2016 |
| Armatur über der Platte | 250 |

- Hängeschränke schließen oben bündig mit den Hochschränken ab, daraus ergibt sich die Unterkante 1446.
- Breitenraster: 150/200/300/400/450/500/600/800/900/1000/1200.

## Prüfungen

**bad (rot)** heißt „geht so nicht“:
- Überlappung im selben Höhenband
- Teil ragt aus dem Raum (0,5 mm Toleranz)
- Decke zu niedrig
- Teil vor Tür, Durchgang oder Fenster, auch auf der Nachbarwand
- Fensterflügel (Dreh, Drehkipp, Stulp, nach innen) schlägt an die Armatur oder an Schränke
- Zimmertür schlägt an
- Gerätetür, Auszug oder Drehtür stößt an
- Auszüge in der Ecke hinter der Querzeile
- Kochfeld unter einem Fenster, das sich öffnen lässt

**warn (gelb)** heißt „Richtwert verfehlt“:
- Gang unter 1200 (Fehler unter 900)
- Stuhlraum unter 813 (Fehler unter 750)
- Halbeckschrank
- Fronten über Eck oder gegenüber
- Kühlschrank-Angel an der Wand (< 50 mm)
- Abstellfläche am Kochfeld < 300, am Kühlschrank < 380
- Spülmaschine > 914 von der Spüle
- Zwischen Spüle und Kochfeld < 900
- Hängeschrank über dem Kochfeld
- Arbeitsdreieck: Summe ≤ 7,9 m, je Schenkel 1,2 bis 2,7 m

## Wege

### Abläufe

Die Häufigkeiten sind eine **Annahme für 4 Personen**. Eine Primärquelle gibt es nicht. Plausibilitätsband laut Mobiliar: 75 bis 189 km/Jahr für die ganze Küchenarbeit.

| Ablauf | Kette | f/Woche |
|---|---|---|
| Einkauf einräumen | Eingang → Kühlschrank → Vorräte | 6 |
| Müll rausbringen | Müll → Eingang | 3 |
| Kochen | Kühlschrank → Arbeitsfläche → Spüle → Arbeitsfläche → Herd; Vorräte, Messer → Arbeitsfläche; Töpfe, Gewürze → Herd | 7 |
| Servieren | Herd → Tisch | 14 |
| Tisch decken | Teller, Besteck, Gläser → Tisch | 14 |
| Abräumen | Tisch → Müll → Spülmaschine | 21 |
| Spülmaschine ausräumen | Spülmaschine ↔ Teller, Besteck, Gläser, Tassen, Töpfe | 5 |
| Getränke | Tassen → Tisch; Gläser → Kühlschrank → Tisch | 14 |

### Berechnung

- **Stationen** liegen 350 mm vor der Frontmitte (NKBA misst ab Frontmitte).
- **Wege:** Hindernisse und Raum werden um 300 mm aufgeweitet (halbe Körperbreite). Auf dieser Fläche läuft ein Sichtbarkeitsgraph mit Dijkstra (Lozano-Pérez & Wesley 1979).
- Start und Ziel werden in die begehbare Fläche gezogen. Gesperrte Wege werden rot gestrichelt angezeigt und zählen nicht zu den km.
- Je Kette wählt eine DP die günstigsten Stationen.
- **Umsortieren:** gierig, ein Umzug oder Tausch je Schritt.
  - Kosten = Meter × Greifhöhen-Faktor nach Blum (1,0 bei 75–145 cm, 1,3 bei 40–75 bzw. 145–175 cm, sonst 2,0; Auszug unten × 0,8).
  - Müll und Putzmittel bleiben an der Spüle.

## 3D

Die 3D-Ansicht nutzt rohes WebGL2. Die globale Vorgabe vgpu wurde geprüft und bewusst nicht übernommen:
- vgpu ist ein reines ES-Modul mit 169 Dateien, gebündelt etwa 219 KB.
- Es hat keinen WebGL-Rückfall. Auf macOS vor Tahoe und auf Firefox mit Intel-Mac rendert es gar nicht.
- Die Szene braucht nur Prismen, flache Schattierung und eine Orbit-Kamera.

Die Wände sind einseitig (Culling), deshalb verschwinden sie, wenn man von außen schaut (Puppenhaus). „Fronten offen“ zeigt dieselben Hüllen, die die Prüfung verwendet.

## Bekannte Lücken

- An stumpfen Ecken bleibt in der Arbeitsplatte eine kleine Dreieckslücke (keine Gehrung).
- Die Abstellfläche an einer Innenecke zählt nur die eigene Platte.
- Ein Halbeckschrank wird als Blende plus Tür bewertet. In 3D erscheinen trotzdem zwei Türen.
- Insel und Tisch rasten nicht ein.
- Es gibt keinen Druck und keine Auswahl direkt in 3D.

## Quellen

Die PDFs liegen in `paper/`.

- NKBA Kitchen Planning Guidelines with Access Standards (2022): https://kb.nkba.org/uploads/2022/05/Kitchen-Planning-Guidelines.pdf
- Blum, Dynamic Space: https://www.ldlonline.co.uk/media/wysiwyg/others/media/dynamic-space.pdf
- nobilia Typenübersicht/Kurztypenliste: https://www.nobilia.de/fileadmin/assets/downloads/nobilia_typenuebersicht_kurztypenliste_DE.pdf
- Neff Korpushöhe und Rastermaße: https://www.neff-home.com/de/neff-entdecken/kuechenplanung/schritte/korpushoehe-und-rastermasse
- Neff Ergonomie: https://www.neff-home.com/de/neff-entdecken/kuechenplanung/schritte/ergonomie
- Neff Höhe der Dunstabzugshaube: https://www.neff-home.com/de/produkte/dunstabzugshauben/hoehe-dunstabzugshaube
- BSH-Maßblatt Geschirrspüler 45 cm (offen 1150 ab Rückwand): https://media3.bsh-group.com/Documents/specsheet/de-DE/SPD6EL802E.pdf
- Siemens Küchenplanung, Geschirrspüler und Kühlen: https://www.siemens-home.bsh-group.com/ch/de/kuechenplanung/geschirrspueler und https://www.siemens-home.bsh-group.com/ch/de/kuechenplanung/kuehlen
- Konsument, „Küchen planen“ (Gang 1200, Hängeschrank 500/650): https://konsument.at/system/files/2022-02/Leseprobe_K%C3%BCchen%20planen%20und%20einrichten.pdf
- Mobiliar, Laufkilometer: https://www.mobiliar.ch/ratgeber/neue-kueche
- UC Berkeley Dining Design Guidelines (Fluss, Gangbreiten): https://uhs.berkeley.edu/sites/default/files/diningdesignguidelines.pdf
- WKO Hygiene-Leitlinie Großküchen (rein/unrein): https://wko.at/ktn/handel/maschinen-technologie/hygiene-leitlinie-fuer-grosskuechen.pdf
- vgpu: https://vgpu.sh/ und web.dev zur WebGPU-Unterstützung: https://web.dev/blog/webgpu-supported-major-browsers
