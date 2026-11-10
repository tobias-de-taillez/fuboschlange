# Küchenplaner (Modus 5) – Entwurf und Quellen

Stand 2026-11-09. Der Code liegt in `raumaufmass.html`: Block `kitchen` (Logik, DOM-frei, Selbstchecks in `checks`) und Block `kitchen-ui` (Bedienung, Plan, 3D).

## Leitlinie

Für den Standardfall soll es einfach sein, komplex wird es nur bei Sonderwünschen.

- Teile kommen aus der Palette: Unterschrank, Spüle, Spülmaschine, Herd, Hängeschrank, Hochschrank, Kühlschrank (Einbau), French Door, Side by Side, Backofen hoch, Insel, Tisch.
- Ein Klick setzt das Teil neben das gewählte. Ziehen legt es an die nächste Wand.
- Die Arbeitsplatte entsteht automatisch je Zeile.
- Im Panel stellt man für das gewählte Teil Breite (im Raster), Front, Anschlag, Gerät und Inhalt ein.
- „Maße frei“ (Tiefe, Höhe, Unterkante, Drehung) ist zugeklappt.
- Das Vorbild ist der Fliesenmodus: Palette, Plan, Auswahl, Panel.

## Modell

- `M.kitchen = {spec, items, seq}`. `normKitchen` liest tolerant: kaputte Teile fallen einzeln weg, IDs werden eindeutig.
- **Teile an Wänden** sind wie Öffnungen verankert, über Wandecken `a,b` und `x` (mm ab `a`). Der Rahmen ist kanonisch, die kleinere Ecken-ID steht zuerst. So überstehen die Teile jedes Nachmessen.
- **Tisch und Insel** liegen im Raumrahmen (`TILES.frameOf`).
- Die Unterkante eines Hängeschranks liegt nie unter dem Boden: sie wird bei 0 geklemmt, auch wenn Hochschrank und Hängeschrank zusammen höher wären.
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

### Frei stehende Kühlschränke (French Door, Side by Side)

Wunsch aus der Meldung M-20261109-133140-d316bb: French-Door- und Side-by-Side-Geräte. Die Türdicke soll einstellbar sein, damit man sieht, wie weit die Flügel ausschlagen.

- **Modell:** `dev:'fridge'` mit Bauform `fz:'fd'|'sbs'` und `doorT` (Türdicke, 30–150 mm). Ohne `fz` bleibt es der Einbau-Kühlschrank wie bisher, alte Räume laden unverändert. `d` ist die Tiefe mit Tür wie im Datenblatt, der Korpus ist `d − doorT`. Frei stehende Geräte haben keinen Sockel.
- **Bedienung:** Am Kühlschrank wählt man die Bauform als Knöpfe (Einbau / French Door / Side by Side). Die Türdicke ist ein Eingabefeld. Daneben stehen der seitliche Überstand bei 90° und der bei ganz geöffneter Tür.

| | French Door | Side by Side |
|---|---|---|
| Breiten | 70 / 83 / 90 / 100 cm (Haier) | 90 / 91 cm |
| Tiefe mit Tür | 706 | 708 |
| Höhe | 1830 | 1787 |
| Türdicke (Vorgabe) | 96 | 79 |
| Flügel | 2 × ½, Schubladen darunter bis ≈ 700 | Gefrierteil links 43 %, Kühlteil rechts 57 % |
| ganz offen | 118° | 130° (Bosch: 130°/135°) |

Quellen: Bosch-Maßblätter KFF96PIEP und KAN93VIFP. Die KFF96-Zeichnung misst ab Wand mit 25 mm Abstandshaltern: 635/731 ab Wand entsprechen 610/706 am Gerät, die Tür ist also 96 mm dick.

**Flügelgeometrie:**
- Jeder Flügel ist ein Blatt W × t.
- Die Drehachse sitzt an der Gerätekante, in der Mitte der Türdicke (Korpusfront + t/2).
- Offen um θ ragt das Blatt seitlich `max(0, −W·cos θ) + t/2·sin θ` über die Gerätekante, bei 90° also t/2.

Abgleich mit den Maßblättern:

| Fall | Modell | Bosch |
|---|---|---|
| KFF96PIEP, 90° | 48 | 45 |
| KFF96PIEP, 118° | 254 | 268 |
| KFF96PIEP, Tiefe bei 118° ab Wand | 1105 | 1102 |
| KAN93VIFP Gefrierteil (W 387), 130° | 279 | 277 |
| KAN93VIFP Kühlteil (W 515), 135° | 392 | 418 |

- Bosch-Tabellen zur Nachbartiefe: Beim French Door trifft das Modell sie. Neben Möbeln oder Platten ≤ 600 tief reichen wenige Millimeter (Bosch: 3 mm), über 700 zählt es wie eine Wand. Beim Side by Side verlangt Bosch auch neben ≤ 600 tiefen Möbeln 50 mm Luft, das Modell kommt dort ohne aus (siehe Bekannte Lücken).
- Ein erster Ansatz mit der Achse an der Korpus-Ecke (Überstand bei 90° = t) war zu streng. Er meldete beim Side by Side mit 50 mm Luft neben einer 600er Platte nur 112°. Bosch erlaubt dort die volle Öffnung.

**Prüfung (`leafReach`):**
- Jeder Flügel schwenkt in 2°-Schritten auf, bis er auf eines dieser Hindernisse trifft:
  - Wand (`polyInRoom`)
  - Nachbarteil im selben Höhenband
  - Arbeitsplatte
  - Schwenkbereich einer Zimmertür
  - Fensterflügel nach innen
- Unter 90° ist es **bad**: Die Schubladen lassen sich nicht ausziehen.
- Unter dem vollen Winkel ist es **warn**: Fächer und Schubladen lassen sich nicht herausnehmen. Bosch: „ausziehbar bei 90° geöffneter Tür, herausnehmbar bei vollständig geöffneter Tür“.
- Die Meldung nennt den erreichten Winkel, das Hindernis und den seitlichen Platzbedarf für 90° und für „ganz offen“.
- Die Angel-Prüfung des Einbau-Kühlschranks und der Anschlag (Taste F) gelten für Flügeltüren nicht.
- Die Abstellfläche zählt auf beiden Seiten (NKBA: „on either side of a side-by-side refrigerator“).

**Plan und 3D:**
- Im Plan erscheinen die Hülle 0–90°, das Blatt bei 90° und der Bogen der Außenecke bis „ganz offen“. Beim gewählten Gerät kommt das Blatt bei „ganz offen“ gestrichelt dazu.
- In 3D stehen die Flügel geschlossen und offen („Fronten offen“) in Türdicke.

### Eckschrank-Konfigurator (Halbeck, unten und oben)

Wunsch aus der Meldung M-20261109-134919-c2a193: Konfigurator für Eck-Unter- und Eck-Hängeschränke.

- **Modell:** `corner:true` gilt jetzt für `base` und `wall`. Neu sind `door` (Türbreite; ohne Angabe „passend“), `cEnd` (0/1: Ecke bei a oder b, wird beim Umdrehen des Wandrahmens mitgedreht) und `inner` (`schub`, `schwenk`, sonst Einlegeboden; nur unten). Blende = Korpus − Tür. „Passend“ nimmt die tatsächliche Tiefe der Querzeile plus 50 mm Passblende (`g.cross` aus `layout`).
- **Lage:** `cornerPlace` setzt die Blende hinter die Querzeile und die Tür davor frei. Ist die Blende kürzer als Querzeile + Passblende, rückt der Schrank von der Ecke ab, so wie nobilia es plant: UE100-50 steht 130 mm vor der Ecke, Planmaß längs 1150. Ohne Querzeile sitzt er bündig in der Ecke. Die Stelle ist auch eine Rastkante beim Ziehen.
- **Bedienung:** Ein eigener Kasten über den Feldern des gewählten Teils mit Ecke, Korpus, Tür (nobilia-Maße oder „passend“), Innenleben, „An die Ecke setzen“ und „Normaler Schrank“. Jede Änderung setzt den Schrank neu an die Ecke. An einem normalen Unter- oder Hängeschrank direkt an der Querzeile steht „Als Eckschrank“. In der Leiste gibt es neu den Eckhängeschrank (WE80-35).
- **Prüfung:** Die Abhilfe „Als Eckschrank“ gibt es auch oben („Als Eckhängeschrank“). In der Stückliste stehen Typ und Innenleben, z. B. „UE100-50 · Schubkasten + Tür“.

| | Unten (Halbeck) | Oben (Wand-Eckschrank) |
|---|---|---|
| Korpus | 900 / 1000 | 600 / 782 / 882 (Typ 60/80/90) |
| Tür | 900: 400/450 · 1000: 500/600 | 200 / 350 / 450 |
| Planmaß quer | 650 (630–750) | 450 (390–500) |
| Innen | UED Einlegeboden · UE Schubkasten + Tür · UEDSA Schwenkauszug | Einlegeboden(e) |

**Über Eck und Diagonal** (Bauart im Konfigurator, Feld `ctype:'L'|'diag'`, `w` = Schenkellänge an beiden Wänden):

- Unten: über Eck 80/90 mit zwei Türen (UE) oder Karussell (UEK), diagonal 80/90 mit einer Tür auf der Schräge (UED). Oben: über Eck 60/65/80/90 (WE, 2 Türen), diagonal 65 (WED65, Tür 394).
- Das Teil hängt an seiner Wand und steht bündig in einer rechtwinkligen Innenecke. Der zweite Schenkel an der Nachbarwand ist ein eigener Eintrag in `L.G` (`wing:true`, gleiches `it`). Dadurch stimmen Platte, Kollision, Maßkette und Rastkanten dort ohne Sonderfälle. Stationen, Stauraum, Stückliste, Beschriftung und Auswahl zählen nur das Hauptteil (`byId` ohne wing).
- Diagonal hat ein Fünfeck als Grundfläche (`foot`). Die Platte bekommt vor dem Eckfeld ein dreieckiges Eckstück (`patch`, nicht in der Stückliste).
- Steht so ein Teil nicht bündig in einer passenden Ecke, gibt es einen roten Befund mit der Abhilfe „In die Ecke“. Nach dem Ziehen rastet es in die nähere Ecke der Wand.

Quelle: nobilia Kurztypenliste (Halbeckschränke UED/UE/UEDSA, Wand-Eckschränke WE60-20/WE80-35/WE90-45). Planmaß längs = Planmaß quer + Tür (UE90-40: 1050, UE100-60: 1250).

## Prüfungen

**bad (rot)** heißt „geht so nicht“:
- Überlappung im selben Höhenband
- Teil ragt aus dem Raum (0,5 mm Toleranz)
- Decke zu niedrig (die niedrigste Stelle über dem Teil zählt; Giebel und Kehle über die Knickpunkte der Wand)
- Teil vor Tür, Durchgang oder Fenster, auch auf der Nachbarwand
- Fensterflügel (Dreh, Drehkipp, Stulp, nach innen) schlägt an die Armatur oder an Schränke
- Zimmertür schlägt an
- Flügel eines French-Door- oder Side-by-Side-Geräts geht keine 90° auf (Wand, Nachbar, Platte, Zimmertür, Fensterflügel)
- Gerätetür, Auszug oder Drehtür stößt an
- Auszüge in der Ecke hinter der Querzeile
- Kochfeld unter einem Fenster, das sich öffnen lässt

**warn (gelb)** heißt „Richtwert verfehlt“:
- Gang unter 1200 (Fehler unter 900), von Plattenkante zu Plattenkante gemessen (NKBA Guideline 6) und in ganzen mm verglichen: genau 1200 oder 900 mm lösen nichts aus. Zu zweit kochen: 1219. Steht die Kante einer Insel oder eines Tischs schon in der Plattenkante der Zeile, zählt der Gang als 0 mm (rot), auch bei schräger oder querer Stellung. Der Inselabstand der Maßkette misst bis zur selben Plattenkante.
- Stuhlraum unter 813 (Fehler unter 750), gemessen vom Mittelstrahl jeder Tischseite
- Tresen: Platz hinter den Hockern unter 813 (Fehler unter 750), entlang der ganzen Hockerkante
- Halbeckschrank
- Fronten über Eck oder gegenüber
- Kühlschrank-Angel an der Wand (< 50 mm, nur Einbau)
- Flügel geht 90°, aber nicht ganz auf (French Door 118°, Side by Side 130°)
- Abstellfläche am Kochfeld < 300, am Kühlschrank < 380
- Spülmaschine > 914 von der Spüle
- Zwischen Spüle und Kochfeld < 900 durchgehende Arbeitsfläche: nur die Platte zählt, leere Wand und Hochschränke unterbrechen, um eine rechtwinklige Innenecke läuft sie weiter
- Hängeschrank über dem Kochfeld
- Arbeitsdreieck: Summe ≤ 7,9 m, je Schenkel 1,2 bis 2,7 m (die Meldung nennt jede Strecke und sagt, welche zu lang oder zu kurz ist)

Gibt es mehrere Spülen, Kochfelder oder Kühlschränke, wird jedes Gerät einzeln geprüft. Abstandsregeln gelten als erfüllt, wenn ein Paar passt.

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

- **Stationen** liegen 350 mm vor der Front: bei einem Eckschrank über Eck oder diagonal vor dem Eckpunkt der Front, bei einem Halbeck mit Blende vor dem nutzbaren Teil, sonst vor der Frontmitte (NKBA misst ab Frontmitte). Auch die Arbeitsfläche steht an diesem Stand.
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

## Verbesserungslauf (gleicher Tag)

- **Einrasten:** Hängeschrank bündig über der Unterzeile, an Tür und Fenster, Spüle mittig unters Fenster. An Innenecken mit 50 mm Passblende. Nicht über das Wandende.
- **Lage und Bedienung:** Die Lage steht als Zahl im Panel, im Plan gibt es eine Maßkette. Pfeiltasten wirken an jeder Wand in Bildrichtung. Nach dem Ziehen wird auf 10 mm gerundet.
- **Eckschrank als Typ** (Halbeck: Blende plus eine Tür). Die Platte schließt an U- und L-Ecken ohne Loch. Die Abstellfläche zählt die Querplatte mit.
- **Dunstabzug als Gerät** (Neff: Elektro ab 430, Gas 650 mm). Hängeschränke brauchen Kopffreiheit über der Platte, mindestens 500 mm.
- **Passleisten:** Lücken und Restmaße bis 150 mm werden zu Passleisten. Die Platte läuft darüber durch, außer in der Lücke steht ein Hochschrank: dort endet die Platte (zwei Platten), und ein Rest neben dem Hochschrank wird Passleiste am Plattenende. Die Leiste steht in der Stückliste.
- **Abhilfe-Knöpfe** an Befunden: Vorfensterarmatur, Anschlag tauschen, Als Eckschrank, Als Dunstabzug. Ein Knopf erscheint nur, wenn die Abhilfe auch wirkt.
- **Wege ehrlich:** Ein Ablauf zählt nur vollständig.
- **Duplizieren (Strg/Cmd+D):** Wandteile kommen wie beim Einfügen neben das Original. Ein Eckschrank über Eck oder diagonal geht in die andere Ecke der Wand (mit Platz für den zweiten Schenkel), sonst gibt es keinen Platz. Inseln und Tische kommen daneben in ihrer Achse, nicht in eine Tür- oder Fensterzone.
- **Maßkette in der Hängezeile:** Der Hochschrank steht in der Kette, ist dort aber Anker wie das Wandende und wird nur in seiner eigenen Zeile verstellt. Die Lücke zwischen Hochschrank und Hängeschrank hat ein Feld, das die Hängeschränke daneben verstellt (bündig bis 0 mm).
- **Gehaltene Taste:** Pfeile und Q/E speichern einmal beim Loslassen (oder nach 400 ms Ruhe), ein Rückgängig nimmt die ganze Bewegung zurück. Beim Raumwechsel wird das Vorgemerkte noch gespeichert. Am Drehregler gilt dasselbe für die Pfeiltasten.
- **Einräumen:** Fehlende Inhalte räumt das Programm selbst ein. Danach wird netto umsortiert:
  - Zusammenhängende Umzüge werden nur gemeinsam übernommen.
  - Besteck und Messer kommen nur in Schubladen.
  - Müll und Putzmittel bleiben an der Spüle.

## Bekannte Lücken

- Bei Flügeltüren fehlen die Griffe. Ganz offen liegt der seitliche Bedarf deshalb bis 26 mm unter dem Maßblatt (KAN93VIFP Kühlteil: 392 statt 418).
- Die Flügelachse sitzt in der Mitte der Türdicke. Echte Scharniere weichen je Hersteller ab: Liebherr nennt laut Suchergebnis 13 mm Wandabstand mit Griffmulde und 57 mm mit Hebelgriff. Das PDF ließ sich nicht laden.
- Side by Side neben Möbeln: Bosch KAN93VIFP verlangt 50 mm Luft bei Möbeltiefe ≤ 650 und 53/96 mm bei 650–700. Das Modell braucht bei ≤ 600 keine Luft und liegt bei 650–700 etwa 15–20 mm darunter. Ein Side by Side bündig zwischen 58er Hochschränken bleibt deshalb ohne Befund.
- Side by Side: Das Gefrierteil liegt immer links.
- An stumpfen Ecken (über 90°) läuft die durchlaufende Platte als Fünfeck bis an die Nachbarwand, ab 10 mm Lücke; darunter bleibt sie ein Rechteck. Eine Gehrung gibt es nicht.
- Über Eck: Die beiden Türen schwenken im Modell je 90° um ihr äußeres Ende. Die echten 165°-Falttüren brauchen etwas anderen Platz im Eckfeld.
- Über Eck und Diagonal gehen nur in rechtwinkligen Innenecken (±3°) und mit gleich langen Schenkeln.
- Rückt ein Halbeckschrank von der Ecke ab, meldet die Platte den toten Winkel dahinter als „Passleiste“. Bei nobilia deckt das der Winkelpassstück-Bereich hinter der Querzeile ab, ein Bauteil ist es nicht.
- Inseln rasten beim Ziehen ein: die Stirnseite dockt bündig an eine Wand, wenn die Insel höchstens 35° von der Senkrechten zur Wand abweicht (also mindestens 55° zur Wand steht), die Seite an eine andere Insel (längs, Seite an Seite oder quer, die Drehung wird übernommen, Platte an Platte; bei gleicher Höhe läuft die Arbeitsplatte durch). ⌥ schaltet das Einrasten ab. Der Tisch rastet nicht ein.
- Bei gestufter Inselplatte rechnet die Stückliste Gesamtlänge mal größte Tiefe, und bei vier oder mehr Inseln im Ring füllt der Plan die Lücke in der Mitte mit Platte.
- Die Stuhlraum-Warnung am Tisch prüft die ganze Tischkante; die Zahl der Plätze nutzt weiterhin den Freiraum in der Mitte jeder Seite. Ein Hindernis an einem Ende vermindert die Platzzahl daher nicht anteilig.
- Es gibt keinen Druck, keine Wandansicht von vorn und keine Auswahl in 3D.

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
- Bosch KFF96PIEP, French Door, Maßblatt mit Türöffnung 90°/118° und Wandabstand je Nachbartiefe (lokal `paper/BSH_KFF96PIEP_frenchdoor_specsheet.pdf`): https://media3.bsh-group.com/Documents/specsheet/de-DE/KFF96PIEP.pdf
- Bosch KAN93VIFP, Side by Side, Maßblatt mit Türen 387/515, Öffnung 130°/135° und Wandabstand (lokal `paper/BSH_KAN93VIFP_sidebyside_specsheet.pdf`): https://media3.bsh-group.com/Documents/specsheet/de-DE/KAN93VIFP.pdf
- Samsung RF28R6222WW „Will it fit“, French Door: 3,75″ an der Wand für 90°, Tiefe offen, Türen bis 125° (lokal `paper/Samsung_RF28R6222WW_WillItFit_frenchdoor.pdf`): https://image-us.samsung.com/SamsungUS/home/home-appliances/refrigerators/pdp/02022021/gallery/WillitFit_RF28R6222WW_V2.pdf
- Bertazzoni RFD36, French Door: Gerät muss 4″ (102 mm) plus Griff vor den Seitenschränken stehen, Schubladen ziehen bei 90° aus, herausnehmen erst bei 160° (lokal `paper/Bertazzoni_RFD36_frenchdoor_install.pdf`): https://content.abt.com/documents/179515/bertazzoni-french-door-refrigerator-RFD36FZNX-install.pdf
- Haier French-Door-Breiten 70/83/90/100 cm (Suchergebnis Herstellerseiten): https://www.haier-europe.com/de_DE/web/de/french-door-produktreihe
- vgpu: https://vgpu.sh/ und web.dev zur WebGPU-Unterstützung: https://web.dev/blog/webgpu-supported-major-browsers
