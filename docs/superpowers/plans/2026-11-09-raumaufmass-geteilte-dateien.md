# Raumaufmaß-Familie, Schritt 1: geteilte Dateien

Stand 09.11.2026. Gehört zu `docs/superpowers/specs/2026-11-09-raumaufmass-familie-design.md` (Abschnitt „Reihenfolge“, Schritt 1) und `docs/adr/0001-familie-mit-geteilten-js-dateien.md`.

`raumaufmass.html` lädt Rechenkern, Speicher und Raumzeichnung jetzt aus sechs Dateien neben sich. Der Code ist nur verschoben, keine Zeile geändert. Bedienung und Aussehen sind gleich geblieben.

## Die Dateien

| Datei | kommt aus Block | Inhalt | läuft in node |
|---|---|---|---|
| `raum-fremd.js` | `vendor` (ganz) | lz-string, qrcode-generator | ja |
| `raum-kern.js` | `core` (ganz) | Ausgleichung, Analyse, Vorschläge, `globalThis.CORE` | ja |
| `raum-geometrie.js` | `store`, Mittelteil | verdächtige Maße, Kreuzungsbremse, Wandansichten und Höhen, Öffnungen, Wandaufbau, DXF und STEP, Abwicklung, Entwirren, Räume im Gebäude | ja |
| `raum-speicher.js` | `store`, Anfang und Ende | Raumliste (`STORE_FACTORY`, `STORE`), Link-Kodierung (`encodeShare`, `decodeShare`, `parseShareFragment`) | ja |
| `raum-modell.js` | `ui`, 23 Deklarationen | der offene Raum: `M`, `serialize`, `deserialize`, `importProblem`, Rückgängig-Stapel, `nextId`, `wallKey`, `viewPts`, `fitPts`, `currentRoom`, `polyAreaM2` | nein |
| `raum-zeichnung.js` | `ui`, 25 Deklarationen | `$`, `cv`, `ctx`, `VIEW`, `userView`, `toScr`, `toWorld`, `evDev`, `fitView`, `sizeCanvas`, `INK`, `CANVAS_FONT`, `drawGrid`, `drawScalebar`, `drawRoomLabel`, `drawOpeningsOnPlan`, `drawOpeningSymbol`, `drawWallMarks`, `drawBand`, `drawOrthoMarks`, `drawFixAngles` | nein |

Alle sechs sind klassische Skripte ohne `import`. Sie teilen sich den globalen Namensraum genau so wie vorher die `<script>`-Blöcke, deshalb startet die Seite weiter per Doppelklick (`file://`).

## Reihenfolge der Skripte

```
meldung-log (inline, im Kopf)
raum-fremd.js → raum-kern.js
tiles, tilemeasure, kitchen (inline)
raum-geometrie.js → raum-speicher.js → raum-modell.js → raum-zeichnung.js
ui, tiles-ui, kitchen-ui, imu, meldung, checks (inline)
```

Das ist die alte Reihenfolge der Blöcke. Nur die 48 Deklarationen aus `ui` laufen jetzt vor dem Rest von `ui`; keine davon braucht beim Laden etwas, das später kommt (maschinell geprüft).

## Was bleibt, und warum

| Block | Zeilen | bleibt, weil |
|---|---|---|
| `tiles`, `tilemeasure`, `tiles-ui` | 4.328 | Fliesenplan zieht in Schritt 3 um |
| `kitchen`, `kitchen-ui` | 4.495 | Küchenplaner zieht in Schritt 3 um |
| `ui` (Rest) | 4.874 | Bedienlogik des heutigen Raumaufmaßes; Schritt 2 baut sie neu |
| `imu`, `meldung`, `meldung-log` | 595 | hängen an Popups und Dialogen dieser Seite |
| `checks` | 3.720 | prüft Kern, Geometrie, Speicher, Fliesen, Küche und Laufmessung in einer Funktion; wird geteilt, wenn Fliesen und Küche eigene Dateien haben |

## Wer braucht was aus `ui`

Gemessen mit einem Parser über alle Blöcke, nicht geschätzt.

| Block | nimmt aus den geteilten Dateien | nimmt weiter aus `ui` |
|---|---|---|
| `tiles-ui` | `$ C M VIEW userView cv ctx DPR INK CANVAS_FONT toScr toWorld evDev fitView sizeCanvas drawGrid drawScalebar fmtGrad serialize snapshot pushSnapshot undoStack redoStack currentRoom currentRoomName polyAreaM2` | `render setHint setHintLive gesture plat fmt2` |
| `kitchen-ui` | `$ M VIEW userView cv ctx DPR INK CANVAS_FONT toScr toWorld evDev fitView sizeCanvas drawGrid drawScalebar drawOpeningsOnPlan serialize snapshot pushSnapshot undoStack currentRoom polyAreaM2` | `render redraw setHint setHintLive gesture distToSeg` |
| `imu` | `$` | `fmtLen fmtLenU wpopPair` |
| `meldung` | `$ M VIEW userView cv serialize deserialize undoStack redoStack currentRoom currentRoomName` | 18 Namen der Bedienung (`setMode`, `openRoom`, `recompute`, `render`, …) |

Die rechte Spalte ist die Naht für Schritt 3: Diese acht Namen muss ein eigenständiger Fliesenplan oder Küchenplaner selbst mitbringen oder aus einer weiteren geteilten Datei bekommen.

## Was die geteilten Dateien vom Werkzeug erwarten

`raum-modell.js` ruft beim Aufruf (nicht beim Laden) fünf Namen, die das Werkzeug stellen muss: `recompute`, `render`, `syncSnapfitBtn`, `syncOrthoBtn`, `opMeasSeq`. Außerdem braucht `deserialize` die Blöcke `tiles` und `kitchen` (`TILES.normTiles`, `KITCHEN.normKitchen`), weil Fliesen- und Küchendaten am Raum bleiben. `raum-zeichnung.js` braucht ein `<canvas id="cv">` vor dem Skript und sonst nichts vom Werkzeug.

## Prüfung

- `node test/run.mjs`: 782 Checks grün, Ausgabe byte-gleich zum Stand vorher. `test/raumaufmass-einmessen.mjs`, `test/raumaufmass-kanten.mjs`, `test/verlegeplan.mjs` ebenso.
- `test/fliese-einmessen.mjs` war vorher rot und ist es weiter: Der `core`-Block in `fliese-einmessen.html` ist eine Kopie, die schon vor dieser Änderung vom Original abgewichen ist. Der Check vergleicht jetzt gegen `raum-kern.js`.
- Browser über lokalen Server und per `file://` (Chrome): keine Konsolenfehler, `?test` 782 grün.
- Alt gegen neu aus demselben localStorage-Stand: `serialize()` byte-gleich, Fläche gleich (29,45 m², Wintergarten), Panel-HTML gleich, Canvas-Pixel in allen fünf Reitern gleich. Dasselbe für Datei-Import (`wintergarten-2026-08-02.json`), Link mit `#raum=` und Rückgängig/Wiederherstellen.

## Upload

`scripts/deploy-hetzner.sh` liest aus der HTML-Datei, welche Skripte sie lädt, holt genau diese aus demselben Stand, lädt erst sie und zuletzt `index.html` hoch und prüft jede Datei per Hash. `.htaccess` schaltet den Cache jetzt auch für `.js` ab.

## Offen

- Die Selbstchecks liegen noch in `raumaufmass.html`. Laut ADR gehören sie zu den geteilten Dateien; das geht erst sauber, wenn Fliesen und Küche ausgezogen sind.
- `fliese-einmessen.html` könnte `raum-kern.js` laden statt eine Kopie zu tragen. Dann verschwindet der rote Check.
- `fmt2`, `plat`, `distToSeg`, `setHint`, `setHintLive`, `gesture`, `render`, `redraw` sind die Reste, an denen Fliesen- und Küchen-Bedienung noch am `ui`-Block hängen.
