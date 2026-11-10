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
- **Kein Node-Test lädt die Bedienung.** Die 9326 Zeilen von `ui`, `tiles-ui` und `kitchen-ui` sind nur im Browser prüfbar. Seit dem 10.11.2026 gibt es dafür `test/browser.mjs` (104 Prüfungen in acht Abläufen: Hauptweg, Eingabe, Ansicht, zwei Fenster, unvollständig geladene Seite, Selbstchecks im Browser, Fliesenplan, Küchenplaner; grün in Chromium, WebKit und Firefox).

## Messaufbau: die Fliesen-Bedienung ohne das Aufmaß

Am 10.11.2026 gebaut und gemessen, außerhalb des Repos: eine Probeseite mit der gemeinsamen Schale, den geteilten Dateien und dem Block `tiles-ui` wörtlich, aber ohne `ui`.

- **Ohne `ui` wirft die Seite beim Laden** (`render is not defined`), kein Raum, keine Handler.
- **Mit einer geschnittenen Naht läuft sie.** 43 Einträge genügen: 163 Zeilen wörtlich aus `ui`, 49 Zeilen Ersatz. Damit lädt die Probeseite einen Raum, zeichnet den Plan, setzt und verschiebt eine Fliese, nimmt zurück, stellt wieder her und speichert, ohne Konsolenfehler.
- **Beim exakten Rechteck ist sie im Vergleich mit `raumaufmass.html#fliesen` gleich:** `M.tiles`, `serialize()`, der Speicherstand, die Ansicht und die Zeichenfläche stimmen in allen sieben Schritten überein (0 von 927.360 Bildpunkten verschieden). **Mit echten Räumen gilt das nicht, siehe „Härtetest“ unten.**
- **Sichtbar fehlt nur Schale, die in `ui` verdrahtet ist:** Menü, Tooltip, Raum umbenennen, Hilfe, Melde-Knopf.

Die Naht, wie der laufende Code sie zeigt:

| gehört ins geteilte Plan-Skript | bringt das Werkzeug selbst mit | bleibt im Aufmaß |
|---|---|---|
| `render` (fünf Zeilen), Hinweiszeile (`setHint`, `setHintLive`), Zeigerführung und ihre Handler, Rad und Zoom, Tasten-Verteiler, Rückgängig, `openRoom`, Boot, der Rechenteil und das Sichern aus `recompute`, Menü, Tooltip, Hilfe, Datei/Link/QR, der Abgleich zweier Fenster | Zeichnen (`drawTilesView`), Panel, Standardtext der Hinweiszeile, Stand beim Speichern, die fünf Zeiger-Einstiege, Tasten, „bereit?“ | `sag`, `statusText`/`standInfo`, `setMode`/`setTool`, Karten, Eingabe, Wandansicht, Ausgabe |

Drei Kopplungen hat nur der laufende Code gezeigt:

1. `tiles-ui` ruft beim Laden `render()`, bevor `TS.ruler` angelegt ist. Das geht heute nur gut, weil die Seite dann noch im Schritt Skizze steht.
2. Rückgängig und Wiederherstellen speichern ausschließlich über `recompute()` (`restoreSnapshot` in `raum-modell.js`). `recompute` trägt drei Aufgaben in einer Funktion: Form rechnen, sichern, Aufmaß-Folgen.
3. `raum-modell.js` erwartet beim Laden eines Raums `opMeasSeq` und `syncSnapfitBtn` vom Werkzeug, ohne zu prüfen, ob es sie gibt.

Die Probe ist ein Messaufbau, keine Seite zum Ausliefern. Was der erste Aufbau nicht gemessen hatte, steht im Härtetest und im Messaufbau für die Küche.

Was das für den Aufwand heißt: Die Naht ist schmaler, als die Zählung über `render` vermuten ließ, aber nicht so schmal wie im ersten Aufbau (212 Zeilen); der Härtetest hat sie auf 293 Zeilen wachsen lassen. Der Aufwand liegt im Zerschneiden von sieben Funktionen (`recompute`, `render`/`renderPanel`, `drawCanvas`, die Zeiger-Handler, der Tasten-Handler, `openRoom`, Boot), nicht in der Menge.

### Härtetest: dieselbe Probeseite mit echten Räumen

Am 10.11.2026, ebenfalls außerhalb des Repos: die Probeseite gegen `raumaufmass.html#fliesen` in neun Fällen und je drei Browsern (Chromium, WebKit, Firefox), mit derselben Folge aus echten Klicks und Tasten (laden, Fliese setzen, verschieben, drehen, Rückgängig per Taste und Knopf, Wiederherstellen, neu laden, dreimal neu laden). Fälle: L-Raum mit Messfehlern, derselbe mit „Rechte Winkel annehmen“, „Maßhaltig zeichnen: aus“, Raum mit Küchenteilen, Raum mit Nachbarraum, ein Raum aus dem alten Werkzeug ohne gespeicherten Stand (zwei „roh“-Fälle), großer Raum aus einer Datei, Wintergarten mit Schräge.

- **Die 212-Zeilen-Naht ist in keinem der neun Fälle gleich, in allen drei Browsern, und sie beschädigt das gespeicherte Aufmaß.** Schon das bloße Öffnen verschiebt `data.pts` um 0,01 bis 1,33 mm, jedes Rückgängig, Wiederherstellen und Neuladen noch einmal (großer Raum: 9,3 mm nach der Folge und dreimal Neuladen). Das echte Werkzeug bleibt bei höchstens 0,0003 mm.
- **Ursache ist genau das im ersten Aufbau offen gelassene Risiko:** Ohne `lageHalten` und den Rückschrieb der Skizze speichert `serialize()` den rohen Ausgleich, `M.pts` bleibt stehen, und jeder Rechengang dreht und schiebt die Form. Dasselbe hatte das Aufmaß vor `lageHalten` selbst.
- **Mit „Rechte Winkel annehmen“ wirft die Probe schon beim Laden** (`ORTHO_TOL is not defined`): Der Messaufbau hatte die falsche Zeile (1289, leer, statt 1288).
- **Alte Räume ohne gespeicherten Stand** migriert das echte Werkzeug beim Öffnen (Maßhaltig an, Handskizze weg, Stand geschrieben). Die Probe tut das nicht und schreibt als Stand „—“.
- **Nachgeliefert in drei Stufen:** Stufe 2 (Maßhaltig von selbst, `lageHalten`, Rückschrieb, `scaleSketch`; +50 Zeilen) bringt `data.pts` auf höchstens 3e-9 mm. Stufe 3 (Öffnungen setzen, zweiter Rechengang beim Boot; +31 Zeilen) macht sieben Fälle in allen drei Browsern in allen neun Schritten bitgleich (`M.tiles`, `serialize()`, Speicher, Ansicht, Bildpunkte). Stufe 4 (`statusText` mit allem, was er braucht; +128 Zeilen) macht alle 27 Kombinationen gleich.
- **Die Naht wächst damit von 212 auf 293 Zeilen** (246 wörtlich, 47 Ersatz), mit neu bewertetem Stand auf 421 Zeilen. Chromium, WebKit und Firefox verhalten sich durchweg gleich; kein Fall ist nur in einem Browser ungleich.
- **Nebenbefund am echten Werkzeug:** Auch `raumaufmass.html` schreibt beim ersten Wiederöffnen eines frisch importierten Raums `pts` um bis zu 1,7e-5 mm und im Nachbar-Fall die Öffnungslagen neu; danach bleibt es bei 1e-12 mm. `lageHalten` hält die Lage, nicht die letzte Stelle.

Folgen für den Plan: Der **Rechenteil von `recompute` gehört als Ganzes** ins geteilte Plan-Skript (Maßhaltig von selbst, `lageHalten`, Rückschrieb, `scaleSketch`, Öffnungen setzen, zweiter Rechengang beim Boot), nicht nur der Aufruf des Ausgleichs. „Aufmaß-Folgen“ sind nur Vorschläge, Verdächtige, Nachbarlagen und offene Eingaben. Ein Folgewerkzeug darf **keinen Stand schreiben, wenn keiner gespeichert ist**. Und: Eine eigene Fliesen- oder Küchenseite, die den Raum beim Öffnen anders rechnet als das Aufmaß, verschiebt dessen Maße. Das ist Datenverlust, kein Schönheitsfehler.

### Messaufbau für die Küche

Ebenfalls am 10.11.2026: `kitchen-ui` samt 3D ohne `ui`, in Chromium, gegen `raumaufmass.html#kueche` mit derselben Folge (30 Schritte: Teile setzen, ziehen, Pfeiltasten auch gehalten, drehen, ⌘D, Entf, Rückgängig, Wandmaß im Plan, Breite im Panel, 3D aus/an, Wege, Analyse, neu laden).

- **Die Naht ist für Küche und Fliesen dieselbe.** 186 der 212 Zeilen der Fliesen-Naht sind für beide textgleich, 26 rufen das jeweilige Werkzeug. Die Küche braucht darüber hinaus sechs wörtliche Zeilen (die Geste `kdim`, ui 3989, und `distToSeg`, fünf Zeilen, nötig bei mehr als einer Tür) und 15 Zeilen Schale (Rückgängig-Knöpfe sperren, Fläche und Umfang unter dem Stand). Mit diesen ist die Küchen-Probe in allen 30 Schritten gleich dem Werkzeug (Modell, Speicher, Panel, Plan und 3D-Fläche bildgleich).
- **Ein gemeinsames Plan-Skript trägt beide Werkzeuge:** 228 Zeilen (166 wörtlich, 62 Ersatz), kein Name eines Werkzeugs im Code, Anmeldung mit 16 Einträgen für die Küche und 15 für die Fliesen. Küche 30 von 30 Schritten gleich, Fliesen 7 von 7 (einzige Abweichung: das Tastenzeichen ⌫ am Löschen-Knopf fehlt, weil `ui` Zeile 6268 es beschriftet).
- **Die Einhängepunkte `kitchenFlush`, `kitchenResetSession`, `kitchenLeave` und `KITCHEN.cornerDeleted` wurden in der Folge nie gerufen.** `KITCHEN.anchorFrame` kam 19-mal, immer aus `kitchenSave` in `kitchen-ui` selbst. Der Haken „Raum wechselt“ gehört trotzdem in die Anmeldung der Küche (zweites Fenster, Raumwechsel sind nicht gemessen).
- **Schale, die dem ersten Fliesen-Aufbau fehlte und die sein Vergleich nicht sah:** Fläche und Umfang unter dem Stand (`#geo`), Rückgängig-Knöpfe nie gesperrt, das Tastenzeichen ⌫. Dazu im Werkzeug nur: Menü, Hilfe, Tooltip, Umbenennen, Melde-Knopf; Pfeiltasten ohne gewähltes Teil verschieben dort die Ansicht (aus dem Code gelesen).
- **Grenzen:** Nur Chromium, nur das exakte Rechteck. Nach dem Härtetest gilt für die Küche dieselbe Einschränkung wie für die Fliesen: Die 30/30 sagen nichts über echte Räume, solange der Rechenteil von `recompute` fehlt. Nicht gemessen: Zweites Fenster und Raumwechsel, Touch, Eckschrank, Insel-Andocken, ⌘C/⌘V, Anschlag, Fronten offen, Küchenmaße.

Nachgerechnet: Die Gegenleser beider Messungen sind am Fable-Limit gescheitert. Ich habe die Kernzahlen selbst aus den gespeicherten Rohdaten neu berechnet, nicht neu gemessen: Der Versatz von `data.pts` je Fall und Browser (Probe gegen Werkzeug) stimmt mit den Angaben des Härtetests überein, und die Küchen-Folge mit dem gemeinsamen Plan-Skript ist in `M.kitchen`, `serialize()` und Stand in 30 von 30 Schritten gleich der des Werkzeugs. Die Messordner liegen außerhalb des Repos.

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
7. **Stand auf den Folgewerkzeugen:** weitertragen und keinen Stand schreiben, wenn keiner gespeichert ist (293 Zeilen Naht), oder wie im Aufmaß neu bewerten (421 Zeilen).
8. **Darf eine Fliesen- oder Küchenseite alte Räume migrieren** (Maßhaltig an, Handskizze weg), wie es das Aufmaß beim ersten Öffnen tut, oder sie unverändert lassen? Beides ist machbar; wer es offen lässt, bekommt je nach geöffneter Seite einen anderen gespeicherten Raum.

## Empfohlene Folge für den Rest

Getan sind die beiden Messaufbauten, der Härtetest und das Netz (`test/browser.mjs` mit Abläufen für Fliesenplan und Küchenplaner). Es bleibt:

1. Die Entscheidungen oben, vor allem 7 und 8 (Stand, Migration alter Räume).
2. **Den Härtetest als festen Test ins Repo holen.** Die neun Fälle (Raum-Datensätze aus `faelle/*.json`, Folge, Vergleich von `data.pts` im Speicher auf 1e-6 mm, `serialize()`, Bild) sind der Prüfstand für jeden Schnitt durch `recompute`. Ohne ihn fällt eine Verschiebung des Aufmaßes erst bei einem Menschen auf.
3. `recompute` zerlegen, als eigener Schritt und ohne Verhaltensänderung: **Rechnen** enthält den ganzen Rechenteil (Maßhaltig von selbst, `lageHalten`, Rückschrieb, `scaleSketch`, Öffnungen setzen), **Sichern** ist `STORE.save` mit dem Stand, **Aufmaß-Folgen** sind Vorschläge, Verdächtige, Nachbarlagen und offene Eingaben. Rückgängig speichert nur darüber.
4. `raum-modell.js` gegen ein Werkzeug ohne `opMeasSeq` und `syncSnapfitBtn` absichern; das `render()` beim Laden von `tiles-ui` hinter `TS.ruler` setzen; `ORTHO_TOL` und die übrigen Konstanten mit der Zeile benennen, nicht mit der Nummer.
5. `ui` in der einen Seite auftrennen: ein Plan-Skript, bei dem sich jedes Werkzeug anmeldet (zeichnen, Panel, Hinweis, fünf Zeiger-Einstiege, Tasten, bereit, dazu für die Küche „Gesten, die das Werkzeug selbst zu Ende führt“ und „Raum wechselt“). Der Boot gehört in die Anmeldung und läuft danach, nicht davor. Jeder Zwischenstand läuft und kann live gehen; nach jedem der Härtetest und `test/browser.mjs` in drei Browsern.
6. Erst dann die Seiten schneiden und umschalten; alte Adressen `raumaufmass.html#fliesen` und `#kueche` leiten weiter.
