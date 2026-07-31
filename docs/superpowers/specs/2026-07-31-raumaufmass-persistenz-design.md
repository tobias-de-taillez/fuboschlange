# Raumaufmaß — Persistenz ohne Server (Design)

## Ziel

Nutzer kommen wieder: Räume erneut anschauen, weiterbearbeiten, sichern,
teilen. Alles ohne Server, ohne Konten, ohne Bezahlmodell — die App bleibt
eine einzelne statische HTML-Datei (Hosting via v0.dev/Vercel als statische
Seite). Drei Bausteine: **Raumbibliothek** (localStorage), **Datei-Export/
Import**, **Raum-als-Link mit QR**. Bewusst kein PWA-Manifest, kein Service
Worker, kein Cloud-Sync (Entscheidung vom 2026-07-31).

## Nicht-Ziele

- Kein Backend, keine Nutzerverwaltung, keine geräteübergreifende
  Synchronisation. Der Weg über Datei/Link ersetzt das manuell.
- Kein IndexedDB: Räume sind 1–3 KB JSON, localStorage reicht um
  Größenordnungen.
- Keine File System Access API („Speichern unter"): nur Chromium-Desktop,
  iOS kann es nicht. Download/Share-Sheet decken alle Geräte ab.
- Cookies sind keine Option (4 KB, Server-Konzept, kein Vorteil).

## Bekannte Grenzen (bewusst akzeptiert)

- localStorage klebt an Gerät + Browser + **Origin**. Vor Release eine
  stabile Domain festlegen — ein späterer Domainwechsel heißt für Nutzer
  „alle Räume weg".
- iOS Safari löscht Script-Storage nach 7 Tagen Nichtbenutzung (ITP).
  Gegenmittel im Produkt: Export/Link prominent als Backup-Pfad; die
  Bibliothek zeigt einen dezenten Hinweis „Räume liegen nur auf diesem
  Gerät — als Datei oder Link sichern".

## 1. Datenmodell & Storage

Zwei localStorage-Schlüssel:

- `raumaufmass.rooms`: Array von
  `{id, name, updated, area, data}` —
  `id` = `crypto.randomUUID()`, `updated` = ISO-Zeitstempel,
  `area` = m² oder null (beim Speichern mitgerechnet, damit die Liste ohne
  Solver-Läufe rendert), `data` = das bestehende Serialize-Format
  (`{pts, walls, meas, idSeq}`), unverändert.
- `raumaufmass.current`: `id` des offenen Raums.

Autosave-Verhalten unverändert (jede Änderung, ohne Debounce), schreibt in
den aktiven Eintrag von `rooms`.

**Migration:** Existiert der Alt-Schlüssel `raumaufmass` und noch kein
`raumaufmass.rooms`, wird er still als Raum „Unbenannt" übernommen und der
Alt-Schlüssel entfernt. Niemand verliert ein laufendes Aufmaß.

**Quota-Fehler** (voll, Private-Mode): try/catch wie bisher, zusätzlich
einmaliger Hinweis in der Hint-Zeile statt stillen Schluckens.

## 2. Raumbibliothek (UI)

- Neuer Toolbar-Button (Bücher-Symbol) öffnet ein Overlay „Meine Räume" im
  bestehenden Popover-/Overlay-Stil der Datei. Kein Routing, kein zweiter
  Screen.
- Einstieg beim App-Start: **zuletzt bearbeiteter Raum öffnet direkt**
  (wie bisher); die Bibliothek ist einen Tipp entfernt.
- Zeile je Raum: Name, „zuletzt <Datum>", Fläche (falls berechnet). Tipp
  auf Zeile = Raum öffnen (aktiver Raum wird vorher gespeichert — er ist
  durch Autosave ohnehin aktuell).
- Aktionen je Zeile: **Umbenennen** (Inline-Input), **Exportieren**
  (gleicher Pfad wie Abschnitt 3), **Löschen** (mit Rückfrage; löscht nur
  den Bibliothekseintrag).
- Kopfzeile: „+ Neuer Raum" (legt leeren Raum an, öffnet ihn im
  Zeichnen-Modus), darunter der Backup-Hinweis (siehe Grenzen).
- Der Raumname erscheint in der Statuskarte des offenen Raums; Tipp darauf
  = Umbenennen.

## 3. Datei-Export/Import

Die „Daten"-Sektion wird zu:

- **Als Datei sichern:** JSON-Blob, Dateiname
  `<raumname-slug>-<YYYY-MM-DD>.json`. Auf Geräten mit
  `navigator.canShare({files})` stattdessen Share-Sheet
  (iCloud/Drive/Mail/Messenger); Fallback ist der Download-Anker. Export-
  Format = `data` + `name` + bestehende Zusatzfelder (`sigmaHat`).
- **Datei öffnen:** unsichtbares `<input type="file" accept=".json">`.
  Import läuft durch die bestehende `importProblem()`-Validierung und legt
  einen **neuen** Raum in der Bibliothek an (überschreibt nie den
  aktuellen), Name aus Datei oder Dateiname.
- Die Clipboard-Buttons (JSON kopieren/einfügen) bleiben als Nische
  erhalten.

## 4. Raum-als-Link + QR

- **Link teilen:** Zustand → JSON → lz-string
  (`compressToEncodedURIComponent`) → `https://<domain>/#raum=<blob>`.
  In Zwischenablage bzw. Share-Sheet. Fragmente verlassen den Browser
  nicht — kein Server sieht Raumdaten.
- **Empfang:** App-Start mit `#raum=...` → dekomprimieren → validieren
  (`importProblem`) → als neuen Raum importieren, öffnen, Fragment per
  `history.replaceState` aus der Adresszeile entfernen (verhindert
  Doppel-Import beim Reload). Ungültiges Fragment: Hinweis, App startet
  normal.
- **QR:** Dialog zeichnet den Link als QR auf ein Canvas. Bei 1–3 KB JSON
  komprimiert ~1 KB URL — QR-tauglich. Wird der Link länger als
  ~2,5 KB, zeigt der Dialog statt QR den Hinweis „zu groß für QR — Link
  oder Datei nutzen".
- **Bibliotheken:** lz-string (~4 KB min, MIT) und qrcode-generator
  (~15 KB min, MIT) werden **inline eingebettet** (eigene Script-Blöcke
  mit Lizenzkommentar). Kein Build, kein CDN — Single-File-Philosophie
  gewahrt; ein CDN-Load wäre zudem auf der Baustelle ohne Netz ein
  Ausfallpunkt.

## Fehlerfälle

- Import (Datei/Link/Clipboard) ungültig → Meldung mit `importProblem`-
  Text, Zustand unangetastet (Validierung vollständig vor deserialize —
  bestehendes Muster).
- localStorage nicht verfügbar (Private Mode) → App läuft, Hinweis
  „Speichern auf diesem Gerät nicht möglich — als Datei/Link sichern".
- `navigator.share` abgebrochen → kein Fehler, kein Toast.

## Tests (Node-Selbstchecks, bestehendes Muster)

- Migration Alt-Schlüssel → Bibliothek (Inhalt identisch, Alt weg).
- Datei-/Link-Roundtrip: serialize → encode → decode → deserialize →
  gleicher Zustand.
- Link-Import legt neuen Raum an, überschreibt aktuellen nicht.
- Ungültiges Fragment/Datei → abgelehnt, Zustand unverändert.
- lz-string-Roundtrip mit Umlauten/IDs > Z (AA, AB).

Storage-/UI-Verhalten (Overlay, Share-Sheet) wird im Browser verifiziert,
nicht in Node — `localStorage` existiert dort nicht.
