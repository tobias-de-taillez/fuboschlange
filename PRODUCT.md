# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Hauptanwendung im Desktop-Browser (MacBook, Windows-PC), Tablet als nächste Stufe. Der Handy-Companion ist mobiles Web (Android-Chrome mit WebXR/ARCore), keine native App.

## Users

**Heute:** Tobias selbst, bei eigenen Bauprojekten (z. B. Wintergarten, Wohnküche Hesterkamp). Er misst mit Laser-Entfernungsmesser auf, plant am Laptop nach und verlegt danach Fliesen bzw. Fußbodenheizung.

**Später:** Profi-Handwerker, die Aufmaß und Verlegeplanung beruflich machen. Sie sind ausdrücklich Ziel, aber noch nicht Nutzer. Zuerst muss das Werkzeug für den Eigenbedarf tragen.

Die Aufgabe ist in beiden Fällen dieselbe: Ein realer, schiefer Raum mit verrauschten Maßen soll zu einer belastbaren Geometrie werden. Darauf baut die Baustelle auf. Die zwei Fragen des Nutzers lauten: **„Was muss ich noch messen?“** und **„Stimmt alles?“**

## Product Purpose

Das Produkt rekonstruiert Räume aus einer groben Skizze und Laser-Distanzmessungen. Die Geometrie entsteht durch eine Ausgleichung nach kleinsten Quadraten. Daraus folgen Fläche, Umfang, Wandansichten und ein Fliesenplan mit Schnittblättern und Stückliste.

Der Companion soll den mühsamsten Teil abnehmen: das Zeichnen der Grundgeometrie (Wände, Ecken, Durchbrüche, Inseln, Türen, Fenster). Die Kamera liefert die Rohskizze mit vollständiger und richtiger Topologie, zentimetergenau. Der Laser misst sie anschließend ein.

Erfolg heißt: Die Topologie stimmt, die Erfassung ist schneller als Handzeichnen, und das Tool sagt verlässlich, welche Messung falsch ist und welche fehlt.

## Positioning

- **Ausgleichung statt Zeichnen.** Die Skizze muss nicht präzise sein. Die Präzision kommt aus redundanten Messungen und der Ausgleichung. Das Tool erkennt Ausreißer, schlägt die wertvollste nächste Messung vor und weist unbestimmte Freiheitsgrade aus.
- **Ehrlich statt schön.** Unsicheres, Unbestimmtes und Widersprüchliches wird sichtbar gemacht und nie still geglättet: ein Gebäude, das nicht schließt, eine nicht prüfbare Messung, eine zu enge Kehre.

## Operating Context

- **Am Desktop:** Skizzieren, Messwerte eintragen, Ausgleichung prüfen, Fliesenplan anschneiden, Pläne und Schnittblätter drucken. Bedienung mit Maus (mindestens 3 Tasten, klickbares Scrollrad), Touchpad (MacBook-Trackpad und Windows-Precision-Touchpad) und Tastatur.
- **Im Raum, mit dem Companion:** Eine Person hält das Handy etwa auf Kopfhöhe und schwenkt durch einen oft möblierten Raum. Die Decke ist meist besser sichtbar als der Boden, deshalb kommen die Wände aus der Wand-Decke-Kante. In der anderen Hand liegt oft der Laser.
- **Übergabe:** Der Companion übergibt per JSON an die Hauptanwendung („An Raumaufmaß“). Räume liegen im `localStorage` und lassen sich als Datei, als JSON-Text, per Link oder QR-Code austauschen.
- **Druck:** Pläne und Schnittblätter gehen auf Papier mit auf die Baustelle.

## Capabilities and Constraints

**Hauptanwendung (`raumaufmass.html`):**
- Punkte und Wandzug skizzieren, Strecken und Diagonalen messen, Duplikate erlaubt, Messungen abschaltbar statt löschbar
- Ausgleichung mit Redundanz- und Ausreißeranalyse, „Als Nächstes messen“, Laufmessung, Durch-die-Tür-Messung
- Öffnungen (Türen, Fenster) mit Höhe und Lage, Wandansicht, Gebäude aus mehreren Räumen mit Nachbarschaft
- Fliesenplan: Material, Fugen, Drehung, Anschneiden, Gehrung, Dehnungsfuge, Fluchten, Stückliste, Schnittblätter, Fliese einmessen
- Raumverwaltung, Rückgängig, Tastenkürzel-Hilfe

**Companion (`raumskizze-probe.html`, Experiment):** Kamera- und AR-Erfassung von Wandkanten auf Android. Ausgabe ist eine Skizze im Importformat der Hauptanwendung, keine Messwerte. Ob er trägt, entscheidet eine Messung (Topologie-Treffer, Erfassungszeit), keine Annahme.

**Technische Konstanten:**
- Jede Oberfläche ist eine einzelne, selbst-enthaltene HTML-Datei: Vanilla JS, kein Build, keine Laufzeit-Abhängigkeiten.
- Selbstchecks laufen bei jedem Laden und per `node test/…`.
- Alle Längen intern in mm.
- Hosting statisch auf `raumaufmass.irazari-te.ch` (Hetzner, Upload per FTPS mit Hash-Prüfung).
- Sprache der Oberfläche: Deutsch.

**Begriffe:** Randfuge ist eine Spielfuge für Wandungenauigkeit, kein hartes Dehnmaß. Toleranzfugen bleiben voll.

**Bewusst offen:**
- Produktname und Marke (Arbeitstitel „Raumaufmaß“)
- Nutzer-Login und Nutzerdatenbank für den Datenaustausch zwischen Companions und Hauptanwendung. Beides kommt erst nach einem positiven Messergebnis des Companions.
- Tablet-Bedienung der Hauptanwendung
- Das FBH-Verlegetool (`verlegeplan.html`, `single-loop/`) liegt außerhalb dieses Produktrecords.

## Brand Commitments

Noch kein Name und keine Marke. Fachlich präzise, sachliche Sprache. **Klartext vorn, Statistik dahinter:** Die Nutzerfragen („Was noch messen?“, „Stimmt alles?“) und das Ergebnis (Fläche, Umfang) stehen vorne. σ̂, Redundanzanteile und Tests bleiben vollständig erhalten, aber hinter einem Detailschalter, denn sie sind der Kern des Werkzeugs.

## Evidence on Hand

- Echte Raumdaten: `wintergarten-2026-08-01.json`, `wintergarten-2026-08-02.json`, `wahrheit-hesterkamp-wohnkueche-2026-10-25.json` (Referenzmaß für den Companion)
- Companion-Aufnahmen von echten Läufen (`aufnahme-*.tar`). Das sind Messdaten, kein Werbematerial.
- Messaufbau und Bench mit Wilson-Intervallen (`raumskizze-bench.mjs`, `raumskizze-pruefstand.mjs`), Recherche und Nachtberichte unter `docs/superpowers/research/`, Paper-Sammlung unter `paper/`

Es gibt keine Kunden, Testimonials, Preise, Lizenzmodelle und keine Vergleichszahlen gegenüber Konkurrenzprodukten. Nichts davon darf erfunden werden.

## Product Principles

1. **Die Präzision kommt aus der Rechnung, nicht aus der Hand.** Erfassung darf grob sein. Belastbar wird das Ergebnis durch Messung und Ausgleichung.
2. **Unsicherheit wird gezeigt, nicht versteckt.** Jede Aussage des Tools muss sich als bestimmt, überbestimmt oder unbestimmt einordnen lassen.
3. **Die Nutzerfrage führt.** „Was noch messen?“ und „Stimmt alles?“ strukturieren den Ablauf, die Statistik liefert die Begründung.
4. **Messen, nicht ableiten.** Ob etwas geht (Companion, Erkennung), entscheidet ein Messaufbau mit echten Läufen.
5. **Ergebnis bis zur Baustelle.** Ein Aufmaß ist erst fertig, wenn daraus ein druckbarer Plan mit Schnitten und Stückliste wird.

## Accessibility & Inclusion

- **Hauptanwendung (Desktop, später Tablet):** voll bedienbar mit Maus, Touchpad und Tastatur. Plattformunterschiede (⌘ vs. Strg, Pinch- und Scroll-Events, Rechtsklick-Varianten) werden abgedeckt. Dichtes Desktop-Layout und Hover sind erlaubt. Kommt das Tablet, braucht jede Funktion einen Touch-Weg ohne Rechtsklick oder Hover.
- **Handy-Companion:** baustellentauglich, also lesbar bei Sonnenlicht, einhändig bedienbar (die andere Hand hält Laser oder Gerät), große Ziele, auch mit Handschuhen treffbar.
