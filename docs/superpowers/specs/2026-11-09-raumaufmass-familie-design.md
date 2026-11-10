# Raumaufmaß als Familie kleiner Werkzeuge (Anforderungen)

Stand 09.11.2026. Dieses Papier legt fest, was die Oberfläche können und zeigen soll. Es ersetzt keinen Entwurf der einzelnen Bildschirme; der folgt danach und wird an diesem Papier gemessen. Die Begriffe stehen in [GLOSSARY.md](../../../GLOSSARY.md), die Entscheidung zur Dateiaufteilung in [ADR 0001](../../adr/0001-familie-mit-geteilten-js-dateien.md).

## Anlass

`raumaufmass.html` ist seit Juli in rund 180 Commits von einem Aufmaßwerkzeug zu einer Datei mit 24.600 Zeilen und fünf Reitern gewachsen: Zeichnen, Messen, Wände, Fliesen, Küche. Jede Erweiterung war für sich begründet, zusammen ergeben sie drei Schwächen:

1. Alles je Gebaute ist gleich sichtbar. Hauptweg und Sonderfall lassen sich nicht unterscheiden.
2. Die Bedienung wird mit Text erklärt: 136 Stellen schreiben Hinweise in die Statuszeile, dazu kommen 70 Tooltips und eine Hilfe mit 25 Einträgen.
3. Aufbau und Wörter folgen der Baugeschichte. Die Reiter mischen Tätigkeiten mit Dingen, für ein Maß gibt es sechs Wörter, gelöscht wird auf vier Wegen.

Der Hauptweg selbst ist kurz: Ein rechteckiger Raum braucht bis zum CAD-Export etwa zwölf Aktionen. Der Umbau legt diesen Weg frei, statt ihn neu zu erfinden.

## Für wen

Messlatte ist ein fähiger Fremder: ein Heimwerker oder Handwerker mit Laser-Entfernungsmesser, der das Werkzeug zum ersten Mal öffnet, ohne Einweisung und ohne die Hilfe zu lesen. Tobias bleibt der erste Nutzer, sein Vorwissen zählt aber nicht als Bedienbarkeit.

Das Gerät ist ein Laptop oder PC mit Maus oder Touchpad und Tastatur.

## Prüfkriterium

Jeder Bildschirm wird an drei Eigenschaften gemessen:

1. Der leere Start führt von selbst zum ersten Schritt.
2. Es gibt eine Hauptsache. Alles Weitere erscheint erst am angefassten Objekt.
3. Der Hauptweg braucht keinen Erklärtext.

## Die Familie

Aus einem Werkzeug werden mehrere kleine, die denselben Raum bearbeiten:

| Werkzeug | Aufgabe | Ergebnis |
|---|---|---|
| Startbildschirm | Räume wiederfinden, ordnen, öffnen | der richtige Raum im richtigen Werkzeug |
| Raumaufmaß | einen Raum erfassen und prüfen | geprüfter Raum, Aufmaßblatt |
| Fliesenplan | einen Belag auf den geprüften Raum legen | Plan, Schnittblätter, Stückliste |
| Küchenplaner | eine Küche in den geprüften Raum stellen | geprüfte Aufstellung, Stückliste |
| Fußbodenheizung (später) | Heizkreise in den geprüften Raum legen | Verlegeplan |

Die Grenze zwischen ihnen folgt einer Regel: **Das Raumaufmaß erfasst, was da ist. Die Folgewerkzeuge planen, was hinkommt.** Zum Raum gehören deshalb Ecken, Maße, Höhen, Türen, Fenster, Löcher, Wanddicken und Anschlüsse wie Wasser. Fliesen, Fugen, Schränke und Laufwege gehören den Folgewerkzeugen.

Dieses Papier beschreibt Startbildschirm und Raumaufmaß. Fliesenplan und Küchenplaner ziehen zunächst unverändert um und bekommen später je ein eigenes Papier.

## User Stories

Jede beginnt mit „Als jemand, der mit dem Laser im Raum steht, will ich …“

1. **Skizze**: … die Form des Raums grob hinklicken, ohne dass sie stimmen muss.
2. **Maße**: … gesagt bekommen, welche Strecke ich als Nächstes messe, und nur die Zahl eintippen.
3. **Stand**: … jederzeit sehen, ob alles stimmt, und wenn nicht, welches Maß falsch ist.
4. **Wände**: … Höhen, Türen, Fenster und Anschlüsse an der Wand eintragen, an der sie sind.
5. **Ausgabe**: … am Ende ein Blatt in der Hand haben oder mit dem Raum weiterarbeiten.
6. **Wiederkommen**: … meinen Raum später wiederfinden, auch als Teil eines Hauses mit mehreren Geschossen.

Was in keiner Story vorkommt, ist zweite Reihe: Es bleibt erreichbar, steht aber nicht im Weg.

## Userflow

### Erster Start

Wer die Adresse zum ersten Mal öffnet, hat keinen Raum und landet deshalb sofort in einem neuen, leeren Raum im Schritt Skizze. Der Plan zeigt blass, was der erste Klick tut. Einen Einleitungstext und den Verweis auf die Hilfe gibt es nicht mehr.

### Schritt 1: Skizze

- Jeder Klick setzt eine Ecke und zieht die Wand von der vorigen dorthin.
- Ab der dritten Ecke ist die erste Ecke sichtbar das Ziel. Ein Klick darauf schließt den Raum.
- Ecken lassen sich ziehen.
- Eine angefasste Wand zeigt ihre Karte. Türen, Fenster, Löcher und Anschlüsse lassen sich dort setzen, sobald die Form eindeutig ist; vorher läge ihre Lage auf Skizzenmaßen.
- Ist der Raum geschlossen, rückt die App von selbst in den Schritt Maße.

### Schritt 2: Maße

- Die App schlägt eine Strecke vor, hebt sie im Plan hervor und öffnet die Eingabe. Der Nutzer tippt die Zahl und drückt Enter, die Eingabe springt zur nächsten Strecke.
- Der Stand sagt in einem Satz, wo man ist: „Noch 2 Maße, dann ist die Form eindeutig“, „Form eindeutig, aber ungeprüft“, „Geprüft ± 5,6 mm“, „Ein Maß passt nicht: Strecke A–B“.
- Solange die Form nicht eindeutig ist, bleibt jede Ecke, wo sie skizziert wurde, damit man sich beim Messen nicht verliert. Sobald die Form eindeutig ist, gleitet der Plan von selbst in die gemessene Form.
- Passt ein Maß nicht, zeigt der Plan die Strecke, und ihre Karte bietet an, das Maß abzuschalten oder neu zu messen.
- Im Panel stehen der Stand und „Als Nächstes messen“ vorn. Die Liste aller Strecken liegt darunter, die Statistik (Verbesserung, Redundanz, Test) hinter dem Stand.

### Schritt 3: Wände

- Der Schritt ist erst sinnvoll, wenn die Form eindeutig ist. Vorher sagt er, was fehlt.
- Je Wand gibt es die Ansicht von innen. Dort trägt man die Höhe ein und setzt Türen, Fenster, Löcher und Anschlüsse.
- Eine angefasste Öffnung zeigt ihre Karte: Größe, Art, Band, Öffnungsrichtung, Lage einmessen.

### Ausgabe

Die Ausgabe steht sichtbar am Ende der drei Schritte und fragt nach der Absicht:

- **Drucken**: das Aufmaßblatt.
- **Weiter planen**: denselben Raum im Fliesenplan oder Küchenplaner öffnen, später auch in der Fußbodenheizung.
- **Für CAD**: DXF (Grundriss) oder STEP (Wände als Körper).

Fehlt für eine Absicht noch etwas, sagt die Ausgabe, was fehlt, statt den Knopf stumm zu sperren. Ein ungeprüfter Raum lässt sich drucken, das Blatt weist den Stand dann aus.

Das Aufmaßblatt enthält:

- auf der ersten Seite den Grundriss mit den Längen aller Wände, Fläche, Umfang, den Stand mit Genauigkeit, Raumname und Datum,
- danach je Wand die Ansicht mit Höhen, Öffnungen und Anschlüssen, soweit sie erfasst sind,
- auf Wunsch die Liste aller Maße mit ihren Abweichungen. Das ist ein Haken beim Drucken und steht anfangs auf aus.

### Wiederkommen: der Startbildschirm

- Der Startbildschirm erscheint, sobald es mindestens einen Raum gibt, zu dem man zurückkehren kann.
- Er listet Räume. Je Raum zeigt er den Stand und was es dazu schon gibt: Aufmaß, Fliesenplan, Küche.
- Mehrere Räume eines Hauses stehen als **Gebäude** zusammen, darin gegliedert nach **Geschoss**. Die Zugehörigkeit legt der Nutzer fest. Ein einzelner Raum steht ohne beide Ebenen in der Liste.
- Hier entstehen neue Räume, hier werden Dateien geöffnet, und hier landet ein Raum, der per Link ankommt.
- Der Hinweis, dass Räume nur in diesem Browser liegen, bleibt als ruhige Zeile stehen. Er ist keine Bedienhilfe, sondern eine ehrliche Auskunft.

## Aufbau des Raumaufmaßes

| Bereich | Inhalt |
|---|---|
| Leiste | Zurück zum Startbildschirm, Raumname, die drei Schritte, Ausgabe, Rückgängig und Wiederherstellen, Menü |
| Plan | der Raum; am Rand Maßstab und Einpassen |
| Panel | oben immer der Stand mit Fläche und Umfang, darunter der Inhalt des Schritts |
| Karte am Objekt | erscheint an der angefassten Ecke, Strecke, Wand oder Öffnung |
| Menü | alles, was den ganzen Raum betrifft |

Die Statuszeile entfällt. Was als Nächstes zu tun ist, sagen der Stand und der Plan. Rückmeldungen auf eine Aktion erscheinen kurz dort, wo sie passiert ist.

## Regeln der Bedienung

- **Ein Weg plus Taste.** Jede Funktion hat genau einen sichtbaren Weg und höchstens ein Tastenkürzel.
- **Sofort und umkehrbar.** Eine Aktion passiert sofort, „Rückgängig“ holt sie zurück. Nachgefragt wird nur, wo Rückgängig nicht reicht: beim Löschen eines Raums aus der Liste.
- **Am Objekt, sonst im Menü.** Was eine Ecke, Strecke, Wand oder Öffnung betrifft, steht auf ihrer Karte. Was den ganzen Raum betrifft, steht im Menü. Einen Expertenmodus gibt es nicht.
- **Klartext vorn, Statistik dahinter.** Die Statistik bleibt vollständig, liegt aber hinter dem Stand.
- **Der Look bleibt und wird leiser.** Warmweißes Papier, Tinte, ein Akzent, feine Linien, Systemschrift. Neu sind klare Größenstufen, einheitliche Abstände und dieselben Bedienelemente in der ganzen Familie.

## Verbleib der heutigen Funktionen

### Hauptweg

| Funktion | Heute | Künftig |
|---|---|---|
| Ecke setzen, Wand ziehen | Reiter Zeichnen | Schritt Skizze |
| Raum schließen | Klick auf erste Ecke oder Knopf „Wandzug schließen“ | Klick auf die erste Ecke; der Knopf entfällt |
| Maß eintragen | Vorschlags-Chip, Vorschlagslinie im Plan oder Wand-Popup | Vorschlag im Schritt Maße; jede andere Strecke über ihre Karte |
| Als Nächstes messen | Panel-Abschnitt | Panel im Schritt Maße, vorn |
| Stand, Fläche, Umfang | Panel oben | Panel oben, in jedem Schritt |
| Liste aller Strecken | Panel-Abschnitt „Wände und Strecken“ | Panel im Schritt Maße, unter den Vorschlägen |
| Geschoss schließt nicht | Panel-Abschnitt „Gebäude schließt nicht“ | Teil des Stands |
| Wand wählen | ‹ ›, Auswahlliste, Lageplan, Tasten ← → | Lageplan in der Wandansicht, Tasten ← → |
| Höhe, Knickpunkt | Reiter Wände | Schritt Wände, an der Wand |
| Tür, Fenster, Loch setzen | Leistenknöpfe im Grundriss und im Reiter Wände | Karte der Wand, sobald die Form eindeutig ist; die Leistenknöpfe entfallen |
| Wasseranschluss | „+ Wasser“ im Reiter Wände | Karte der Wand, als Anschluss |
| Öffnung einstellen und einmessen | Kärtchen im Plan, Formular im Panel | Karte der Öffnung |
| Rückgängig, Wiederherstellen | Leiste | Leiste |

### Zweite Reihe am Objekt

| Funktion | Heute | Künftig |
|---|---|---|
| Winkel einer Ecke festlegen | Ecken-Popup im Messen | Karte der Ecke |
| Mehrere Maße je Strecke, Maß abschalten | Wand-Popup („+ Wert“) | Karte der Strecke („+ Maß“) |
| Einheit m, cm, mm | Knopf an der Eingabe | Knopf an der Eingabe |
| Einnorden | Wand-Popup | Karte der Wand |
| Wanddicke | Wand-Popup, natives Eingabefenster | Karte der Wand, als Feld |
| Wand mit Nachbarraum teilen oder lösen | Wand-Popup, Abschnitt „Grenzt an Nachbarn“ | Karte der Wand |
| Nachbarraum anlegen | „+“ hinter der Tür | „+“ hinter der Tür |
| Durch die Tür messen | eigener Panel-Abschnitt | Teil von „Als Nächstes messen“ |
| Genauigkeit je Ecke (Ellipsen) | Leistenschalter | Einzelheiten hinter dem Stand |
| Statistik je Maß | Liste mit Info-Kästchen | Einzelheiten hinter dem Stand |
| Löschen | Entf, Rechtsklick, langes Drücken, × | „Löschen“ auf der Karte, Taste Entf; Rechtsklick und langes Drücken entfallen |
| Ansicht einpassen | Statuszeile, Taste 0, Doppelklick mit dem Mausrad | Knopf am Plan, Taste 0 |

### Zweite Reihe im Menü

| Funktion | Heute | Künftig |
|---|---|---|
| Rechte Winkel annehmen (90°) | Leistenschalter | Menü › Raum |
| Maßhaltig zeichnen | Leistenschalter, anfangs aus | geschieht von selbst, sobald die Form eindeutig ist; abschaltbar unter Menü › Ansicht |
| Abwicklung | Leistenschalter | Menü › Ansicht |
| Ansicht drehen | Statuszeile | Menü › Ansicht |
| Raum spiegeln | Menü | Menü › Raum |
| Raum leeren | Menü, zweimal klicken | Menü › Raum, sofort und umkehrbar |
| Raum umbenennen | Kopfzeile, Name im Plan, Raumliste | Raumname in der Leiste |
| Als Datei sichern | Menü, ⌘S, Raumliste | Menü › Weitergeben, ⌘S |
| Link kopieren, QR-Code | Menü | Menü › Weitergeben |
| Hilfe und Tastenkürzel | zwei Dialoge in der Statuszeile | ein Nachschlage-Dialog im Menü, Taste ? |

### Zieht auf den Startbildschirm

| Funktion | Heute | Künftig |
|---|---|---|
| Raumliste | Dialog „Räume …“ | der Startbildschirm selbst |
| Neuer Raum | Menü, Raumliste | Startbildschirm |
| Datei öffnen | Menü, ⌘O | Startbildschirm, ⌘O |
| Raum aus Link übernehmen | beim Öffnen des Links | landet auf dem Startbildschirm |
| Raum löschen | Raumliste, zweimal klicken | Startbildschirm, mit Nachfrage |
| Gebäude und Geschoss ordnen | gibt es nicht | Startbildschirm |

### Zieht in die Ausgabe

| Funktion | Heute | Künftig |
|---|---|---|
| DXF, STEP | Menü | Ausgabe › Für CAD |
| Aufmaßblatt drucken | gibt es nicht | Ausgabe › Drucken |
| Fliesen, Küche | Reiter 4 und 5 | Ausgabe › Weiter planen, eigene Werkzeuge |

### Bleibt wie es ist

- Der schwebende Knopf „Fehler / Wunsch melden“. Er ist der einzige Weg zum Meldedialog und sitzt in jedem Werkzeug der Familie an derselben Stelle. Der Menüeintrag entfällt.
- Automatisches Speichern bei jeder Änderung.
- Verschieben und Zoomen des Plans mit Maus, Touchpad und Tastatur.
- Der Klick auf einen Nachbarraum im Plan wechselt dorthin.
- Selbstchecks beim Laden und das Nachstellen einer Meldung für die Entwicklung, beides ohne Oberfläche.

## Streichliste

Diese Funktionen verschwinden ganz:

- **Laufmessung** (Schätzung aus dem Beschleunigungssensor, nur auf Touch).
- **JSON kopieren und einfügen.** Datei und Link leisten dasselbe.
- **Scroll-Einstellung.** „Automatisch“ gilt fest.
- **Entwirren.**
- **Der unerreichbare Code** für eine mobile Eingabeleiste.

## Wörter

Es gelten die Begriffe aus dem Glossar. Für die Oberfläche heißt das:

- „Punkt“ wird „Ecke“.
- „Messung“, „Messwert“ und „Wert“ werden „Maß“. Das Rechenergebnis heißt „Länge“.
- Die Schritte heißen „Skizze · Maße · Wände“.
- „Gebäude schließt nicht“ wird „Geschoss schließt nicht“.
- „Plan“ bleibt dem Fliesenplan vorbehalten. Das Ergebnis des Raumaufmaßes heißt „Aufmaßblatt“.

## Daten

- Räume, die heute gespeichert sind, laden weiter: aus dem Browser, aus Dateien und aus Links.
- Das Format darf wachsen. Neu ist die Zugehörigkeit eines Raums zu Geschoss und Gebäude. Räume, die heute über Wände verbunden sind, werden beim ersten Laden zu einem Geschoss in einem Gebäude. Alle anderen bleiben einzeln.
- Ältere Programmstände müssen neue Dateien nicht lesen können.
- Fliesen- und Küchendaten bleiben am Raum, auch wenn eigene Werkzeuge sie bearbeiten.
- Rechenkern und Selbstchecks bleiben, wie sie sind.

## Reihenfolge

1. Die gemeinsamen Teile (Rechenkern, Speicher, Raumzeichnung) wandern in geteilte Dateien. Die Selbstchecks laufen dabei weiter grün.
2. Startbildschirm und Raumaufmaß entstehen neu, unter eigener Adresse neben der Live-Seite.
3. Fliesenplan und Küchenplaner ziehen unverändert in eigene Dateien.
4. Umgeschaltet wird, wenn der Hauptweg samt Aufmaßblatt steht, alle bisherigen Räume laden und jede Zeile aus „Verbleib“ ihren neuen Ort hat.
5. Danach bekommen Fliesenplan und Küchenplaner je ein eigenes Anforderungspapier.
6. Zuletzt wird die Fußbodenheizung (`verlegeplan.html`) an die gemeinsame Raumliste gehängt.

## Abnahme

Abgenommen wird gegen die drei Prüfkriterien, Bildschirm für Bildschirm. Einen Test mit fremden Personen gibt es vor dem Umschalten nicht. Ob das Werkzeug einen Fremden trägt, zeigen danach die Meldungen aus dem Meldedialog.

## Nicht in diesem Papier

- Die Bildschirme von Fliesenplan und Küchenplaner. Beide bekommen ein eigenes Papier.
- Die Fußbodenheizung. Sie gehört zur Familie, wird aber erst nach Fliesen und Küche angebunden.
- Tablet-Bedienung, Login und Nutzerdatenbank.

## Stand der Umsetzung (10.11.2026)

Umgesetzt in `raeume.html` (Startbildschirm), `raumaufmass.html` (Werkzeug) und den geteilten Dateien `raum-*.js`. Wo die Umsetzung vom Papier abweicht, steht es hier:

- **Fliesenplan und Küchenplaner wohnen noch in `raumaufmass.html`.** Sie sind eigene Werkzeuge mit eigener Leiste und eigener Adresse (`#fliesen`, `#kueche`), sehen aber aus wie bisher und haben weiter ihre Hinweiszeile. Ihre Rechenkerne und die Selbstchecks sind geteilte Dateien (`raum-fliesen.js`, `fliesenplan-einmessen.js`, `raum-kueche.js`, `raum-checks.js`); Bedienung, Markup und CSS beider Werkzeuge stehen weiter in `raumaufmass.html`.
- **Die Karte der Öffnung liegt im Schritt Wände im Panel**, direkt unter der Wand, nicht schwebend im Bild. Die Wandansicht bleibt so frei.
- **In der Skizze gibt es keine Karte der Ecke.** Ein Klick auf eine Ecke setzt dort den Zug fort. Gelöscht wird mit Entf unter dem Zeiger oder mit Rückgängig; die Karte der Ecke gibt es ab dem Schritt Maße.
- **„Geschoss schließt nicht“ und „Grenzt an Nachbarn“** sind eigene Abschnitte im Panel geblieben und nicht im Stand-Satz aufgegangen. Sie erscheinen nur, wenn es etwas zu melden gibt.
- **Datei öffnen** geht zusätzlich im Werkzeug über die Taste (⌘O bzw. Strg+O); sichtbar steht es nur auf dem Startbildschirm.
- **Plausibilitätsfragen** (sehr kurzes Maß, Höhe 0) fragen nicht mehr nach. Das Maß gilt sofort, eine Rückmeldung am Ort nennt den Verdacht.
- **Rückmeldungen** der früheren Statuszeile erscheinen kurz am Ort der Aktion. Reine Bedienhinweise sind gestrichen.
- **Die alte Raumliste im Werkzeug** ist entfernt. Räume wechselt man über den Startbildschirm oder per Klick in einen Nachbarraum.
- **Ein Maß abschalten** geht über den Knopf „aus“ an der Maßzeile der Karte, nicht über einen Schiebeschalter. In „Alle Strecken“ steht dann „n aus“.
- **Eine Rückmeldung ohne Ort** (Tastenkürzel, Menü) steht unten mittig im Plan. Startmeldungen und die Warnung „Speichern fehlgeschlagen“ bleiben stehen, bis die nächste Aktion etwas meldet.
- **Maßeingabe.** Der ganze Text muss eine Zahl sein. Eine angehängte Einheit (m, cm, mm) gilt für diese eine Eingabe; in Millimetern ist ein einzelner Punkt oder ein Komma vor genau drei Ziffern ein Tausendertrenner. Über 100 m Länge oder 20 m Höhe nennt eine Rückmeldung den Verdacht.
- **Der Raum bleibt liegen.** Ändert sich die Form nicht, behält der Raum seine Lage im Plan und im Speicher; nur ein Maß, das die Form ändert, bewegt ihn.
- **Fehlt eine der acht Kerndateien** (Kern, Fliesen-Geometrie, Einmessen, Küchen-Kern, Geometrie, Speicher, Modell, Zeichnung), startet das Werkzeug nicht und sagt es („Die Seite ist unvollständig geladen.“), statt mit einem leeren Raum zu beginnen. Fehlt eine der Zugaben (Blatt, Gebäude, Link und QR, Meldung, Selbstchecks), läuft es weiter; die Ausgabe sagt dann, dass das Aufmaßblatt nicht geladen ist.

### Abnahme vor dem Live-Gang

Der Stand ist zweimal im Browser abgenommen worden: einmal der Hauptweg, einmal aus sieben Blickwinkeln (Hauptweg, Zusammenspiel der Korrekturen, alte Daten und Rückweg, Fliesenplan und Küchenplaner, Diff, Upload-Paket, Tastatur). Jeder ernste Befund wurde unabhängig nachgestellt, bevor er behoben wurde; die Korrekturen sind danach noch einmal gegengeprüft.

Nach der Abnahme der Live-Seite geschlossen:

- **Öffnung an einer Wand, die nachträglich kürzer wird:** Eine seitlich nur geschätzte Öffnung rückt in die Wand zurück (an den Rand, sonst an die nächste freie Kante). Eine seitlich eingemessene bleibt liegen, ihr Stand nennt den Widerspruch.
- **Nachbarn im Plan** sind nur noch die Räume, die mit dem offenen Raum über Wände zusammenhängen.
- **Derselbe Raum in zwei Fenstern:** Das Fenster im Hintergrund lädt den Raum neu, sobald das andere ihn ändert, und schreibt dabei nichts; wird er dort gelöscht, geht es zum Startbildschirm. Ein Neuladen bleibt beim Raum des Fensters.
- **Tastatur:** Die Zeilen in „Alle Strecken“ und die Öffnungen einer Wand sind mit Tab erreichbar, Enter öffnet die Karte, nach dem Schließen steht der Fokus wieder auf der Zeile. Hilfe, QR-Code und Meldedialog halten den Fokus.
- **Druck, andere Browser, Finger:** Der Druckweg ist nachgestellt (ein Druckauftrag, das Papierbild als PDF angesehen: drei Blätter A4). Der Hauptweg läuft in WebKit (der Engine von Safari) und Firefox und mit emulierten Fingertipps.

Bekannt und offen geblieben, jeweils mit Umweg und ohne Datenverlust:

- **Schritt 3 der Reihenfolge ist nur zur ersten Stufe getan:** Die Rechenkerne von Fliesen und Küche und die Selbstchecks sind geteilte Dateien; eigene Seiten `fliesenplan.html` und `kuechenplaner.html` gibt es nicht. Vermessen am 10.11.2026: Die Bedienung beider Werkzeuge hängt nur an sieben Namen des Bedien-Skripts `ui`, über `render` aber an knapp drei Vierteln davon; `ui` verdrahtet beim Laden 48 Elemente, die nur das Aufmaß hat. Eigene Seiten verlangen, `ui` in ein Plan-Skript und die Aufmaß-Bedienung zu zerlegen, dazu Entscheidungen zum Seitenwechsel (Rückgängig je Werkzeug, Zurück-Taste, Raumübergabe). Geschätzt sechs bis zehn Arbeitstage. Messung, Entwürfe und offene Entscheidungen: `docs/superpowers/plans/2026-11-10-familie-schritt-3.md`.
- **Tastatur:** Die Karte der Ecke (Winkel festlegen) öffnet nur die Maus. Die Leertaste löst keine Knöpfe aus (sie verschiebt die Ansicht); Enter löst aus.
- **Rückgängig über Werkzeuggrenzen:** Raumaufmaß, Fliesenplan und Küchenplaner teilen sich einen Stapel. Rückgängig im Raumaufmaß kann einen Schritt aus einem der beiden anderen zurücknehmen, ohne dass man es dort sieht; Wiederherstellen holt ihn zurück.
- **Übernommener Raum ohne Stand:** Ein Raum aus Datei oder Link zeigt auf dem Startbildschirm Ecken und Maße statt Stand und Fläche, bis er einmal geöffnet wurde.
- **Tippziele** sind für die Maus bemessen (22 bis 30 px); für Finger ist das knapp. Das Raumaufmaß ist für den Schreibtisch gebaut.
- **Nach einem Zurückrollen** auf das alte Werkzeug bleibt `raeume.html` erreichbar und zeigt veraltete Stände; seine Knöpfe „Fliesenplan“ und „Küche“ führen dann in den Reiter Zeichnen. Die Einstellung „Maßhaltig zeichnen: aus“ überlebt den Rückweg nicht, und das alte Werkzeug verschiebt die gespeicherte Lage beim Öffnen wieder um Hundertstel Millimeter.
- **Stand „Geprüft“** steht, sobald die Form eindeutig ist, mindestens ein Kontrollmaß vorliegt und nichts auffällt. Einzelne Maße können dann noch ohne Kontrolle sein; sie stehen in „Alle Strecken“ und in der Maßliste als ungeprüft, und die Vorschläge bieten weitere Kontrollmaße an.
- **„Zum Raumaufmaß“** aus Fliesenplan oder Küchenplaner führt in den Schritt Maße, nicht zurück in die Ausgabe.
- **Die Seite antwortet auch ohne https.** Umgeleitet wird nicht, weil der Browser-Speicher je Adresse gilt: Räume, die jemand unter http angelegt hat, wären nach einer Umleitung nicht mehr zu sehen.
- **Nicht geprüft:** der Druckdialog des Betriebssystems mit einem echten Drucker, Safari selbst (nur seine Engine), echte Touch-Geräte, Zwei-Finger-Zoom.

