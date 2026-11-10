# Schritt 3 der Familie: Fliesenplan und Küchenplaner in eigene Dateien

Stand 10.11.2026. Schritt 3 der „Reihenfolge“ im Anforderungspapier (`docs/superpowers/specs/2026-11-09-raumaufmass-familie-design.md`) heißt: Fliesenplan und Küchenplaner ziehen unverändert in eigene Dateien. Dieses Dokument hält fest, was davon getan ist, was die Vermessung des Codes ergeben hat und was vor dem Rest zu entscheiden ist.

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
- **Kein Node-Test lädt die Bedienung.** Die 9326 Zeilen von `ui`, `tiles-ui` und `kitchen-ui` sind nur im Browser prüfbar. Seit dem 10.11.2026 gibt es dafür `test/browser.mjs` (45 Prüfungen: Hauptweg, Eingabe, Ansicht, zwei Fenster, unvollständig geladene Seite, Selbstchecks im Browser; grün in Chromium, WebKit und Firefox). Er deckt das Raumaufmaß, von Fliesenplan und Küchenplaner nur das Öffnen.

## Drei Entwürfe, drei Kritiken

- **Alle sechs Blöcke wörtlich als Dateien** (auch `tiles-ui` und `kitchen-ui`): mechanisch und beweisbar, erreicht das Ziel aber nicht. Die Grenzen der beiden Bedien-Blöcke sind nicht die spätere Naht (`tilesReady` braucht auch das Aufmaß, `render` kommt aus `ui`); sie zögen ein zweites Mal um. Deshalb sind nur die vier Blöcke mit endgültigen Grenzen ausgelagert.
- **Plan-Skript mit Anmeldung:** `ui` wird an seiner Verteilerschicht getrennt, ein `raum-plan.js` kennt kein Aufmaß und ruft sein Werkzeug über ein angemeldetes Objekt. Richtung richtig, Aufwand sechs bis neun Arbeitstage. Die Kritik fand vier Brüche, die aus einem Dokument drei machen und in keinem Schritt standen: Browser-Zurück holt ein Dokument mit altem Modell zurück, der Seitenwechsel braucht den Raum des Fensters, der Ort des Speicherns ist offen, und die Vollständigkeitsprüfung muss mitziehen.
- **Stufenweg:** Kerne, Werkzeugdateien, Steckplatz, Bühne, Seiten. Die erste Stufe trägt (sie ist getan), ab der dritten stimmten Annahmen am Code nicht.

Gemeinsamer Befund: Eigene Seiten kosten sechs bis zehn Arbeitstage und sind ohne einen bleibenden Browser-Test nicht zu verantworten.

## Vor dem Rest zu entscheiden

1. **Gilt „kein Fliesen- und Küchencode in `raumaufmass.html`“ für den Text der Datei oder auch für das, was sie lädt?** Das Aufmaß braucht beide Kerne, solange Fliesen- und Küchendaten am Raum bleiben.
2. **Der Werkzeugwechsel wird ein Seitenwechsel.** Rückgängig je Werkzeug oder gemeinsam, Ansicht und Auswahl nach dem Wechsel, Verhalten der Zurück-Taste, Raumübergabe bei zwei Fenstern.
3. **Geteilte Schale:** CSS als eigene Datei (Nachtrag zum ADR, Upload-Skript, `vercel.json`) oder je Seite; Hilfe und Tastenliste gemeinsam oder je Werkzeug.
4. **Der Browser-Test** `test/browser.mjs` braucht Playwright, das nicht zum Repo gehört (er sucht es im Suchpfad von Node oder über die Variable `PLAYWRIGHT`). Soll es eine feste Entwicklungs-Abhängigkeit werden? Vor dem Schnitt durch `ui` braucht der Test außerdem Abläufe für Fliesenplan und Küchenplaner (Vorlagen: die Vergleichsläufe alt gegen neu vom 10.11.2026 mit 319 und 310 Schritten liegen nicht im Repo).
5. **Selbstchecks:** weiter an jeder Auslieferung (418 kB) oder nur bei `?test` nachladen.
6. **Dateinamen:** `raum-*.js` lädt jedes Werkzeug, `<werkzeug>-*.js` gehört einem allein. Ein späteres Umbenennen trifft jeden offenen Zweig noch einmal.

## Empfohlene Folge für den Rest

1. Die Entscheidungen oben.
2. Messaufbau „Fliesen-Bedienung ohne Aufmaß“: Schale, geteilte Dateien und `tiles-ui` auf einer Probeseite, um die Naht von `ui` am laufenden Code zu finden statt am Reißbrett.
3. `test/browser.mjs` um Fliesenplan und Küchenplaner erweitern, als Netz für den Schnitt.
4. `ui` in der einen Seite auftrennen (Plan-Skript, drei Anmeldungen), jeder Zwischenstand live.
5. Erst dann die Seiten schneiden und umschalten; alte Adressen `raumaufmass.html#fliesen` und `#kueche` leiten weiter.
