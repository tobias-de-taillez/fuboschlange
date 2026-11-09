# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Hauptanwendung im Desktop-Browser (MacBook, Windows-PC), Tablet als nächste Stufe. Der Handy-Companion ist mobiles Web (Android-Chrome mit WebXR/ARCore), keine native App.

## Users

**Messlatte:** ein fähiger Fremder. Ein Heimwerker oder Handwerker mit Laser-Entfernungsmesser, der das Werkzeug zum ersten Mal öffnet, ohne Einweisung und ohne die Hilfe zu lesen.

**Heute:** Tobias selbst, bei eigenen Bauprojekten (z. B. Wintergarten, Wohnküche Hesterkamp). Er misst mit dem Laser auf, plant am Laptop nach und verlegt danach Fliesen bzw. Fußbodenheizung. Sein Vorwissen zählt nicht als Bedienbarkeit.

**Später:** Profi-Handwerker, die Aufmaß und Planung beruflich machen.

Die Aufgabe ist in allen Fällen dieselbe: Ein realer, schiefer Raum mit verrauschten Maßen soll zu einer belastbaren Geometrie werden. Darauf baut die Baustelle auf. Die zwei Fragen des Nutzers lauten: **„Was muss ich noch messen?“** und **„Stimmt alles?“**

## Product Purpose

Das Produkt ist eine Familie kleiner Werkzeuge, die denselben Raum bearbeiten.

- Das **Raumaufmaß** rekonstruiert einen Raum aus einer groben Skizze und Lasermaßen. Die Geometrie entsteht durch eine Ausgleichung nach kleinsten Quadraten. Ergebnis sind ein geprüfter Raum und ein druckbares Aufmaßblatt.
- Die **Folgewerkzeuge** planen auf dem geprüften Raum: der Fliesenplan mit Schnittblättern und Stückliste, der Küchenplaner mit Prüfung und Stückliste.
- Der **Startbildschirm** ordnet die Räume nach Gebäude und Geschoss und öffnet sie im passenden Werkzeug.

Die Grenze lautet: Das Raumaufmaß erfasst, was da ist. Die Folgewerkzeuge planen, was hinkommt.

Der Companion soll den mühsamsten Teil abnehmen: das Zeichnen der Grundgeometrie. Die Kamera liefert die Skizze mit vollständiger und richtiger Topologie, der Laser misst sie anschließend ein.

Erfolg heißt: Ein Fremder kommt ohne Erklärung von der leeren Skizze zum geprüften Raum, und das Werkzeug sagt verlässlich, welches Maß falsch ist und welches fehlt.

## Positioning

- **Ausgleichung statt Zeichnen.** Die Skizze muss nicht präzise sein. Die Präzision kommt aus redundanten Maßen und der Ausgleichung. Das Werkzeug erkennt Ausreißer, schlägt die wertvollste nächste Strecke vor und weist unbestimmte Freiheitsgrade aus.
- **Ehrlich statt schön.** Unsicheres, Unbestimmtes und Widersprüchliches wird sichtbar gemacht und nie still geglättet: ein Geschoss, das nicht schließt, ein nicht prüfbares Maß, eine zu enge Kehre.
- **Klein statt vollständig.** Jedes Werkzeug hat eine Aufgabe und einen Hauptweg. Was nicht zum Hauptweg gehört, erscheint erst am angefassten Objekt.

## Operating Context

- **Am Desktop:** Skizzieren, Maße eintragen, Stand prüfen, Wände ausstatten, Aufmaßblatt drucken, im Folgewerkzeug weiterplanen. Bedienung mit Maus (mindestens 3 Tasten, klickbares Scrollrad), Touchpad (MacBook-Trackpad und Windows-Precision-Touchpad) und Tastatur.
- **Im Raum, mit dem Companion:** Eine Person hält das Handy etwa auf Kopfhöhe und schwenkt durch einen oft möblierten Raum. In der anderen Hand liegt oft der Laser.
- **Übergabe:** Alle Werkzeuge der Familie sehen dieselben Räume im Speicher des Browsers. Nach außen geht ein Raum als Datei, als Link oder als QR-Code. Der Companion übergibt per JSON an das Raumaufmaß.
- **Druck:** Aufmaßblatt, Fliesenplan und Schnittblätter gehen auf Papier mit auf die Baustelle.

## Capabilities and Constraints

**Raumaufmaß:**
- Drei Schritte: Skizze, Maße, Wände. Danach die Ausgabe: Drucken, Weiter planen, Für CAD.
- Ecken und Wände skizzieren, Strecken messen, mehrere Maße je Strecke, Maße abschaltbar statt löschbar
- Ausgleichung mit Redundanz- und Ausreißeranalyse, „Als Nächstes messen“, Durch-die-Tür-Messung
- Öffnungen (Türen, Fenster, Löcher) und Anschlüsse mit Höhe und Lage, Wandansicht, Geschoss aus mehreren Räumen mit Nachbarschaft
- Export für CAD als DXF und STEP

**Fliesenplan:** Material, Fugen, Drehung, Anschneiden, Gehrung, Dehnungsfuge, Fluchten, Stückliste, Schnittblätter, Fliese einmessen.

**Küchenplaner:** Schränke, Geräte, Insel und Tisch stellen, Prüfung gegen Türen, Fenster und Anschlüsse, Laufwege, Einräumen, Stückliste.

**Companion (`raumskizze-probe.html`, Experiment):** Kamera- und AR-Erfassung von Wandkanten auf Android. Ausgabe ist eine Skizze im Importformat des Raumaufmaßes, keine Maße. Ob er trägt, entscheidet eine Messung (Topologie-Treffer, Erfassungszeit), keine Annahme.

**Technische Konstanten:**
- Je Werkzeug eine HTML-Datei, dazu geteilte JS-Dateien: Vanilla JS, kein Build, keine Laufzeit-Abhängigkeiten (siehe `docs/adr/0001-familie-mit-geteilten-js-dateien.md`).
- Selbstchecks laufen bei jedem Laden und per `node test/…`.
- Alle Längen intern in mm.
- Hosting statisch auf `raumaufmass.irazari-te.ch` (Hetzner, Upload per FTPS mit Hash-Prüfung).
- Sprache der Oberfläche: Deutsch. Die Begriffe stehen in `GLOSSARY.md`.

**Bewusst offen:**
- Produktname und Marke (Arbeitstitel „Raumaufmaß“)
- Nutzer-Login und Nutzerdatenbank für den Datenaustausch zwischen Companions und Hauptanwendung. Beides kommt erst nach einem positiven Messergebnis des Companions.
- Tablet-Bedienung
- Das FBH-Verlegetool (`verlegeplan.html`, `single-loop/`) gehört zur Familie, wird aber erst nach Fliesenplan und Küchenplaner an die gemeinsame Raumliste gehängt. Bis dahin liegt es außerhalb dieses Produktrecords.

## Brand Commitments

Noch kein Name und keine Marke. Fachlich präzise, sachliche Sprache. **Klartext vorn, Statistik dahinter:** Die Nutzerfragen („Was noch messen?“, „Stimmt alles?“) und das Ergebnis (Fläche, Umfang) stehen vorne. σ̂, Redundanzanteile und Tests bleiben vollständig erhalten, aber hinter dem Stand, denn sie sind der Kern des Werkzeugs.

Der Look ist ein technisches Messwerkzeug auf Papier: warmweißer Grund, Tinte, genau ein Akzent, feine Linien, Systemschrift. Er soll leise sein.

## Evidence on Hand

- Echte Raumdaten: `wintergarten-2026-08-01.json`, `wintergarten-2026-08-02.json`, `wahrheit-hesterkamp-wohnkueche-2026-10-25.json` (Referenzmaß für den Companion)
- Companion-Aufnahmen von echten Läufen (`aufnahme-*.tar`). Das sind Messdaten, kein Werbematerial.
- Messaufbau und Bench mit Wilson-Intervallen (`raumskizze-bench.mjs`, `raumskizze-pruefstand.mjs`), Recherche und Nachtberichte unter `docs/superpowers/research/`, Paper-Sammlung unter `paper/`
- Meldungen aus dem Meldedialog der Live-Seite

Es gibt keine Kunden, Testimonials, Preise, Lizenzmodelle und keine Vergleichszahlen gegenüber Konkurrenzprodukten. Nichts davon darf erfunden werden.

## Product Principles

1. **Die Präzision kommt aus der Rechnung, nicht aus der Hand.** Erfassung darf grob sein. Belastbar wird das Ergebnis durch Maße und Ausgleichung.
2. **Unsicherheit wird gezeigt, nicht versteckt.** Jede Aussage des Werkzeugs muss sich als bestimmt, überbestimmt oder unbestimmt einordnen lassen.
3. **Die Nutzerfrage führt.** „Was noch messen?“ und „Stimmt alles?“ strukturieren den Ablauf, die Statistik liefert die Begründung.
4. **Messen, nicht ableiten.** Ob etwas geht (Companion, Erkennung), entscheidet ein Messaufbau mit echten Läufen.
5. **Ergebnis bis zur Baustelle.** Die Familie ist erst fertig, wenn aus dem Aufmaß etwas Druckbares wird: ein Aufmaßblatt, ein Plan mit Schnitten und Stückliste.
6. **Ein Bildschirm, eine Hauptsache.** Der leere Start führt von selbst zum ersten Schritt, der Hauptweg braucht keinen Erklärtext, und alles Weitere erscheint erst am angefassten Objekt.

## Accessibility & Inclusion

- **Hauptanwendung (Desktop, später Tablet):** voll bedienbar mit Maus, Touchpad und Tastatur. Plattformunterschiede (⌘ vs. Strg, Pinch- und Scroll-Events) werden abgedeckt. Jede Funktion hat einen sichtbaren Weg ohne Rechtsklick und ohne Hover, damit das Tablet später keinen zweiten Weg braucht.
- **Handy-Companion:** baustellentauglich, also lesbar bei Sonnenlicht, einhändig bedienbar (die andere Hand hält Laser oder Gerät), große Ziele, auch mit Handschuhen treffbar.
