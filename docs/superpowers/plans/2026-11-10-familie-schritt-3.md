# Schritt 3 der Familie: Fliesenplan und Küchenplaner in eigene Dateien

Stand 10.11.2026. Schritt 3 der „Reihenfolge“ im Anforderungspapier (`docs/superpowers/specs/2026-11-09-raumaufmass-familie-design.md`) heißt: Fliesenplan und Küchenplaner ziehen unverändert in eigene Dateien. Dieses Dokument hält fest, was davon getan ist, was die Vermessung des Codes ergeben hat und was vor dem Rest zu entscheiden ist.

## Ergebnis (10.11.2026): der Rest von Schritt 3 ist getan, nicht live

Zweig `feat/familie-schritt-3` (ab `main` 237c2d1), nichts gepusht, nichts hochgeladen. Rückweg-Tags: `vor-plan` (Plan-Skript noch im Block `ui`, ein Commit vor dem Umzug), `x1-bedienung-dateien` (Bedienungen als Dateien, noch eine Seite), `vor-kerne` und `live-vor-familie-kueche` wie bisher.

**Gemacht, in der Folge des Plans:**
1. `recompute` in `rechneRaum`, `sichereRaum` und die Folgen des Aufmaßes zerlegt.
2. `raum-modell.js` läuft ohne `opMeasSeq`, `syncSnapfitBtn`, `syncOrthoBtn` (`test/raum-modell.mjs`, gegen den alten Stand rot); das erste Bild der Fliesenansicht steht hinter `TS.ruler`.
3. Anmeldung der Werkzeuge im Block `ui` (`meldeAn`): Zeichnen, Panel, Hinweis, Bereitschaft, Verlassen, Zeiger (Drücken, Bewegen, Loslassen, Verlassen, Pinch), Tasten, Entf, Rückgängig, Moduswechsel, Ansicht der Wandansicht, Raumwechsel, Boot; auch das Raumaufmaß meldet sich so an. Je Schritt ein Commit, jeder mit allen Tests, Browser-Test in drei Engines und Bildvergleich.
4. Der Plan-Anteil von `ui` (151 Anweisungen, rund 1100 Zeilen) per Skript nach `raum-plan.js`, danach `tiles-ui` und `kitchen-ui` als `fliesenplan-bedienung.js` und `kuechenplaner-bedienung.js`. Beweis: `node scripts/umzug-plan.mjs pruefen vor-plan`.
5. Der Messaufbau, wiederholt mit dem Probe-Raum `test/fixtures/raum-voll.json` (ungenau gemessen, 90°-Ausgleich, Höhe, Tür, Wasser, 2 Fliesen, 4 Küchenteile) und einer Abwandlung mit Diagonalen und Ausreißer: `scripts/bildvergleich.mjs` vergleicht den Altstand (eine Seite) mit den drei neuen Seiten, 98 Vergleiche, in Chromium, WebKit und Firefox bildgleich.
6. Seiten geschnitten: `fliesenplan.html`, `kuechenplaner.html`, Markup und CSS je Seite, gemeinsames `raum-schale.css`, `raumaufmass.html` ohne Bedienung, Markup und CSS der beiden. Alte Adressen leiten weiter, `raeume.html` und die Ausgabe verlinken die neuen Seiten, Deploy-Skript (`--probe`: 26 Dateien, per Hash geprüft), `vercel.json`, `package.json`, Selbstchecks nur mit `?test`.

**Wichtige Befunde auf dem Weg:**
- Die Zeilennummern der Wurzeln für den Umzug waren veraltet (Messung) beziehungsweise um eins verschoben (Skript): Der erste Umzug (4376f56) hat die Ausgabe in `raum-plan.js` gezogen. Die Auswahl läuft jetzt über den Text der Anweisung (`wurzeln.mjs`), der Umzug wurde wiederholt (52de613). Die Tests hatten es nicht gesehen, weil damals noch alles in einer Seite lief.
- Zwei harmlose, aber echte Unterschiede zum alten Bild: Rückgängig beginnt je Seite leer (Entscheidung 2a), und nach einem Seitenwechsel steht der Fokus nicht mehr auf dem Menü-Knopf. Der Bildvergleich gleicht beides vorher an.
- Die Tastenliste und die Hilfe zeigen je Seite nur ihr Werkzeug; im Aufmaß steht „Schritte“ (1–4) als eigene Gruppe vor „Allgemein“.

**Bewusst nicht getan oder offen:**
- Live gestellt ist nichts. Vorher zu entscheiden: ob der Dateiname `raum-plan.js` bleibt (das Glossar reserviert „Plan“ für den Fliesenplan; es ist ein Dateiname, kein Begriff der Oberfläche), und ob `package-lock.json` mit ins Repo soll (er liegt bei).
- Der Menü-Eintrag „Hilfe und Tasten“ und der Text des Abschnitts „Menü“ in der Hilfe nennen noch Punkte des Aufmaß-Menüs; auf den Folgeseiten fehlen die Punkte.
- Nicht geprüft: Touch, Drucken auf den neuen Seiten, zwei Fenster in den Folgewerkzeugen (die Logik ist die des Aufmaßes, `storage`-Ereignis in `raum-plan.js`), Safari selbst.
- `scripts/umzug-kerne.mjs pruefen vor-kerne` gilt nur noch für den Stand bis `x1-bedienung-dateien`.

## Getan: die Kerne sind geteilte Dateien

Die vier DOM-freien Skriptblöcke sind wörtlich aus `raumaufmass.html` ausgelagert:

| früherer Block | Datei | legt an |
|---|---|---|
| `tiles` | `raum-fliesen.js` | `TILES` |
| `tilemeasure` | `fliesenplan-einmessen.js` | `TILEMEAS` |
| `kitchen` | `raum-kueche.js` | `KITCHEN` |
| `checks` | `raum-checks.js` | `selfChecks` |

`raumaufmass.html` lädt sie an derselben Stelle und hat 10.594 statt 21.237 Zeilen. Der Beweis ist wiederholbar: `node scripts/umzug-kerne.mjs pruefen vor-kerne` zeigt, dass jede Datei aus Kopfkommentar und Block besteht, Byte für Byte, und dass die Seite sonst der alte Stand ist (der Block `vollstaendig` ausgenommen, der die drei Kerne jetzt als Pflichtdateien nennt). Unabhängig geprüft am 10.11.2026: Fliesenplan über 319 und Küchenplaner über 310 Bedienschritte in Chromium, WebKit und Firefox ohne Abweichung zwischen alt und neu. Die Ausgabe der 1018 Selbstchecks hat dieselbe Prüfsumme wie vor dem Umzug. Die drei Kerne gehören zur Vollständigkeitsprüfung beim Start; `test/run.mjs`, `test/raumaufmass-einmessen.mjs` und `test/raumaufmass-kanten.mjs` lesen die Dateien.

Für einen Zweig, der noch vor dem Umzug abzweigt: `node scripts/umzug-kerne.mjs aus <Stand> <Ordner>` schreibt die vier Dateien aus einem alten Stand. Basis aus `vor-kerne`, eigene Fassung aus der Zweigspitze, dann je Datei `git merge-file` gegen die Fassung auf `main`. `feat/raumskizze-kamera` trägt 169 neue Check-Zeilen, die danach in `raum-checks.js` gehören.

## Vermessen: warum der Rest kein Umzug von Zeilen ist

Gemessen am Stand `c96f1ee` mit acorn und eslint-scope (freie Bezeichner je Block gegen die Definitionen aller Blöcke).

- **Die Bedienung der beiden Werkzeuge ist nach unten sauber.** `tiles-ui` (2306 Zeilen) und `kitchen-ui` (1762 Zeilen) fassen per `$()` nur eigene Elemente an, keines der gemeinsamen Schale und keines des Aufmaßes. Umgekehrt fasst `ui` kein Fliesen- oder Küchenelement an.
- **Nach oben hängen sie an wenig Namen, aber an viel Code.** Beide benutzen aus `ui` nur sieben Namen (`render`, `redraw`, `setHint`, `setHintLive`, `gesture`, `standKurz`, `plat`, dazu `fmt2` und `distToSeg`). Über `render` sind aber 186 von 298 Deklarationen von `ui` erreichbar, knapp drei Viertel.
- **`ui` (5255 Zeilen) ist zu gut der Hälfte Aufmaß.** Rein geteilt sind 557 Zeilen, nur Aufmaß 3014, vermischt 1518 Zeilen in 27 Funktionen. Sieben Rümpfe tragen den Großteil des Vermischten: `renderPanel`, `drawCanvas`, `recompute`, die drei Zeiger-Handler und der Tasten-Handler.
- **`ui` verdrahtet beim Laden 112 Anweisungen, 54 davon an Elemente, die nur das Aufmaß hat** (47 ids). Eine Seite ohne dieses Markup wirft beim Laden.
- **Umgekehrt ruft `ui` 11 Einhängepunkte des Fliesenplans und 15 des Küchenplaners**, und das Aufmaß braucht beide Kerne weiter: `raum-modell.js` ruft `TILES.normTiles` und `KITCHEN.normKitchen`, `recompute` und `deletePoint` pflegen die Bezugsecken der Küche.
- **Markup und CSS:** Von 421 Markup-Zeilen sind 68 gemeinsame Schale, 215 Aufmaß, 94 Fliesenplan, 43 Küchenplaner. Von 629 CSS-Regeln sind 92 Schale. Ein Muster für geteiltes CSS zwischen Seiten gibt es im Repo nicht.
- **Kein Node-Test lädt die Bedienung.** Die 9326 Zeilen von `ui`, `tiles-ui` und `kitchen-ui` sind nur im Browser prüfbar. Seit dem 10.11.2026 gibt es dafür `test/browser.mjs` (104 Prüfungen in acht Abläufen: Hauptweg, Eingabe, Ansicht, zwei Fenster, unvollständig geladene Seite, Selbstchecks im Browser, Fliesenplan, Küchenplaner; grün in Chromium, WebKit und Firefox).

## Messaufbau: die Fliesen-Bedienung ohne das Aufmaß

Am 10.11.2026 gebaut und gemessen, außerhalb des Repos: eine Probeseite mit der gemeinsamen Schale, den geteilten Dateien und dem Block `tiles-ui` wörtlich, aber ohne `ui`.

- **Ohne `ui` wirft die Seite beim Laden** (`render is not defined`), kein Raum, keine Handler.
- **Mit einer geschnittenen Naht läuft sie.** 43 Einträge genügen: 163 Zeilen wörtlich aus `ui`, 49 Zeilen Ersatz. Damit lädt die Probeseite einen Raum, zeichnet den Plan, setzt und verschiebt eine Fliese, nimmt zurück, stellt wieder her und speichert, ohne Konsolenfehler.
- **Im Vergleich mit `raumaufmass.html#fliesen` ist sie gleich:** `M.tiles`, `serialize()`, der Speicherstand, die Ansicht und die Zeichenfläche stimmen in allen sieben Schritten überein (0 von 927.360 Bildpunkten verschieden). Rad, Leertaste-Ziehen, Einpassen, Lineal und Einmess-Dialog verhalten sich gleich.
- **Sichtbar fehlt nur Schale, die in `ui` verdrahtet ist:** Menü, Tooltip, Raum umbenennen, Hilfe, Melde-Knopf.

Die Naht, wie der laufende Code sie zeigt:

| gehört ins geteilte Plan-Skript | bringt das Werkzeug selbst mit | bleibt im Aufmaß |
|---|---|---|
| `render` (fünf Zeilen), Hinweiszeile (`setHint`, `setHintLive`), Zeigerführung und ihre Handler, Rad und Zoom, Tasten-Verteiler, Rückgängig, `openRoom`, Boot, der Rechenteil und das Sichern aus `recompute`, Menü, Tooltip, Hilfe, Datei/Link/QR, der Abgleich zweier Fenster | Zeichnen (`drawTilesView`), Panel, Standardtext der Hinweiszeile, Stand beim Speichern, die fünf Zeiger-Einstiege, Tasten, „bereit?“ | `sag`, `statusText`/`standInfo`, `setMode`/`setTool`, Karten, Eingabe, Wandansicht, Ausgabe |

Drei Kopplungen hat nur der laufende Code gezeigt:

1. `tiles-ui` ruft beim Laden `render()`, bevor `TS.ruler` angelegt ist. Das geht heute nur gut, weil die Seite dann noch im Schritt Skizze steht.
2. Rückgängig und Wiederherstellen speichern ausschließlich über `recompute()` (`restoreSnapshot` in `raum-modell.js`). `recompute` trägt drei Aufgaben in einer Funktion: Form rechnen, sichern, Aufmaß-Folgen.
3. `raum-modell.js` erwartet beim Laden eines Raums `opMeasSeq` und `syncSnapfitBtn` vom Werkzeug, ohne zu prüfen, ob es sie gibt.

Nicht gemessen: Räume mit ungenauen Maßen, der 90°-Ausgleich, Küche, Nachbarräume, Touch, Drucken, zweites Fenster, WebKit und Firefox. Die Probe ist ein Messaufbau, keine Seite zum Ausliefern.

Was das für den Aufwand heißt: Die Naht ist schmaler, als die Zählung über `render` vermuten ließ. Rund 210 Zeilen Plan-Skript tragen die Fliesen-Bedienung. Der Aufwand liegt im Zerschneiden von sieben Funktionen (`recompute`, `render`/`renderPanel`, `drawCanvas`, die Zeiger-Handler, der Tasten-Handler, `openRoom`, Boot), nicht in der Menge.

## Drei Entwürfe, drei Kritiken

- **Alle sechs Blöcke wörtlich als Dateien** (auch `tiles-ui` und `kitchen-ui`): mechanisch und beweisbar, erreicht das Ziel aber nicht. Die Grenzen der beiden Bedien-Blöcke sind nicht die spätere Naht (`tilesReady` braucht auch das Aufmaß, `render` kommt aus `ui`); sie zögen ein zweites Mal um. Deshalb sind nur die vier Blöcke mit endgültigen Grenzen ausgelagert.
- **Plan-Skript mit Anmeldung:** `ui` wird an seiner Verteilerschicht getrennt, ein `raum-plan.js` kennt kein Aufmaß und ruft sein Werkzeug über ein angemeldetes Objekt. Richtung richtig, Aufwand sechs bis neun Arbeitstage. Die Kritik fand vier Brüche, die aus einem Dokument drei machen und in keinem Schritt standen: Browser-Zurück holt ein Dokument mit altem Modell zurück, der Seitenwechsel braucht den Raum des Fensters, der Ort des Speicherns ist offen, und die Vollständigkeitsprüfung muss mitziehen.
- **Stufenweg:** Kerne, Werkzeugdateien, Steckplatz, Bühne, Seiten. Die erste Stufe trägt (sie ist getan), ab der dritten stimmten Annahmen am Code nicht.

Gemeinsamer Befund: Eigene Seiten kosten sechs bis zehn Arbeitstage und sind ohne einen bleibenden Browser-Test nicht zu verantworten.

## Vor dem Rest zu entscheiden

1. **Gilt „kein Fliesen- und Küchencode in `raumaufmass.html`“ für den Text der Datei oder auch für das, was sie lädt?** Das Aufmaß braucht beide Kerne, solange Fliesen- und Küchendaten am Raum bleiben.
2. **Der Werkzeugwechsel wird ein Seitenwechsel.** Rückgängig je Werkzeug oder gemeinsam, Ansicht und Auswahl nach dem Wechsel, Verhalten der Zurück-Taste, Raumübergabe bei zwei Fenstern.
3. **Geteilte Schale:** CSS als eigene Datei (Nachtrag zum ADR, Upload-Skript, `vercel.json`) oder je Seite; Hilfe und Tastenliste gemeinsam oder je Werkzeug.
4. **Der Browser-Test** `test/browser.mjs` braucht Playwright, das nicht zum Repo gehört (er sucht es im Suchpfad von Node oder über die Variable `PLAYWRIGHT`). Soll es eine feste Entwicklungs-Abhängigkeit werden? Seine Grenzen: Er liest das Modell und die Texte der Oberfläche, die Zeichenfläche nur an wenigen Stellen; ein reiner Zeichenfehler im Fliesenplan fiele ihm nicht auf.
5. **Selbstchecks:** weiter an jeder Auslieferung (418 kB) oder nur bei `?test` nachladen.
6. **Dateinamen:** `raum-*.js` lädt jedes Werkzeug, `<werkzeug>-*.js` gehört einem allein. Ein späteres Umbenennen trifft jeden offenen Zweig noch einmal.

## Entschieden am 10.11.2026 (Tobias)

1. **Geltung:** Das Ziel gilt für den Text der Datei. `raumaufmass.html` enthält weder Bedienung noch Markup noch CSS von Fliesenplan und Küchenplaner; die Rechenkerne (`raum-fliesen.js`, `raum-kueche.js`, `fliesenplan-einmessen.js`) lädt das Aufmaß weiter, weil Fliesen- und Küchendaten am Raum bleiben.
2. **Seitenwechsel:** (a) Der Rückgängig-Stapel liegt nur im Arbeitsspeicher (60 Schritte, `raum-modell.js`) und wird schon beim Raumwechsel geleert. Jede Seite beginnt deshalb mit leerem Stapel; Rückgängig gilt für die Sitzung im jeweiligen Werkzeug. Das ändert, was das Papier zum gemeinsamen Stapel sagt, und wird dort nachgeführt. (b) Nach dem Wechsel ist der Raum eingepasst, nichts ausgewählt; die Ansicht wird nicht mitgetragen. (c) Der Wechsel ersetzt den Verlaufseintrag (`location.replace`), Zurück führt wie heute zur Raumliste. Der Raum des Fensters reist über `sessionStorage` `raumaufmass.fenster` mit, zwei Fenster bleiben getrennt.
3. **Schale:** (a) Das gemeinsame CSS wird die Datei `raum-schale.css` (Nachtrag zum ADR 0001, Deploy-Skript liest `<link rel="stylesheet">`, `vercel.json`, Vollständigkeitsprüfung). (b) Der Hilfe-Dialog ist Schale, die Einträge liefert jedes Werkzeug selbst.
4. **Browser-Test:** Playwright bleibt extern (`PLAYWRIGHT=<Ordner>`), kein `package.json`.
5. **Selbstchecks:** `raum-checks.js` lädt nur bei `?test` nach. `test/browser.mjs` ruft die Seite dafür mit `?test` auf.
6. **Namen:** Bestehende Dateien bleiben. Neu: `raum-plan.js` und `raum-schale.css` (geteilt), `fliesenplan-bedienung.js` und `kuechenplaner-bedienung.js` (je einem Werkzeug); Seiten `fliesenplan.html`, `kuechenplaner.html`.

### Nachtrag (Widerspruch zweier Sitzungen, „entscheide du selbst“)

Die Hauptsession meldete abweichende Antworten (Geltung auch für geladene Dateien, Zurück zur vorigen Seite, Playwright als devDependency, dazu: Stand auf Folge-Seiten wie heute voll neu rechnen, alte Räume beim ersten Öffnen migrieren). Tobias ließ die Entscheidung offen. Es gilt: (1) nur der Text der Datei, die Rechenkerne bleiben im Aufmaß; (2) **Zurück führt zur vorigen Seite**, jede Seite lädt bei `pageshow` mit `persisted` den Raum neu aus dem Speicher; (4) **Playwright als devDependency** in einer `package.json`; (7) volle Neuberechnung, (8) Migration wie im Aufmaß. Punkt 2c oben ist damit überholt.


Getan sind der Messaufbau und das Netz (`test/browser.mjs` mit Abläufen für Fliesenplan und Küchenplaner). Es bleibt:

1. Die Entscheidungen oben. Neu dazu aus dem Messaufbau: Der Stand wird auf den Folgewerkzeugen weitergetragen, nicht neu bewertet.
2. `recompute` in Rechnen, Sichern und Aufmaß-Folgen zerlegen, als eigener Schritt und ohne Verhaltensänderung, weil Rückgängig nur darüber speichert.
3. `raum-modell.js` gegen ein Werkzeug ohne `opMeasSeq` und `syncSnapfitBtn` absichern; das `render()` beim Laden von `tiles-ui` hinter `TS.ruler` setzen.
4. `ui` in der einen Seite auftrennen: ein Plan-Skript, bei dem sich jedes Werkzeug anmeldet (zeichnen, Panel, Hinweis, fünf Zeiger-Einstiege, Tasten, bereit). Der Boot läuft danach, nicht davor. Jeder Zwischenstand läuft und kann live gehen.
5. Den Vergleich des Messaufbaus mit einem ungenau gemessenen Raum, mit 90°-Ausgleich und Küche wiederholen, auch in WebKit und Firefox.
6. Erst dann die Seiten schneiden und umschalten; alte Adressen `raumaufmass.html#fliesen` und `#kueche` leiten weiter.
