# Handoff: Lineal und NKBA-Abstände im Küchenplaner

Stand: 10.11.2026, Commit `997e092` auf `main`, live auf raumaufmass.irazari-te.ch (25 Abrufe per Hash geprüft).
Auslöser: Meldungen M-20261109-204802-c18979 („Lineal wie im Fliesen-Tab“) und M-20261110-152601-54614b („NKBA-Abstände als Toggle, Engstellen mit Grund, lean“). Beide erledigt, vom Server gelöscht.

## Was gebaut ist

| Schalter | Taste | Wirkung |
|---|---|---|
| Lineal | L | Halbdurchsichtiges Lineal mit mm-/cm-Teilung. Körper ziehen verschiebt, Ende ziehen streckt und dreht, ⇧ nur drehen, ⌘/Strg frei. Rastet an Ecken/Kanten von Wänden und Küchenteilen (Korpus, Tresenkante) und rechtwinklig dazu. |
| Abstände | N | Maßlinien für Gang vor Zeile/Insel (engste Stelle), Arbeitsdreieck (3 Schenkel + Summe), Platz hinter Tisch und Tresen. Grün ok, gelb unter Empfehlung, rot unter Mindestmaß; bei gelb/rot steht der Grund im Schild. |

## Wo es steht

- `raum-kueche.js`: `check(E,K,L,rec)` nimmt eine optionale Liste `rec`. Ohne sie ändert sich nichts (Befunde, Tests unverändert). Mit ihr legt check je Messung `{k, ids, a, b, val, lim, lvl, why}` ab (`k`: gang, tresen, tisch, dreieck, summe). Schwellen sind dieselben wie in den Befunden (Gang 900 bad, 1200 bzw. 1219 bei 2 Personen warn; Tisch/Tresen 750/813; Schenkel 1,2–2,7 m, Summe 7,9 m).
- `kuechenplaner-bedienung.js`: `kctx()` reicht `NK` im Kontext durch. `drawGaps` (Abstände), Lineal-Block (`rulerDown/Move`, `drawRuler`, Zustand `KR`), Gesten-Typ `kruler`, Tasten N und L in `kitchenKey`, Schalter in `syncToggles`.
- `kuechenplaner.html`: Knöpfe `kAbstBtn`, `kRulerBtn`, Hilfetexte, CSS unter 1180 px.
- `test/browser.mjs` (Ablauf `kuechenplaner`): Prüfungen für N, L (Ziehen, Speicher, kein Küchenteil bewegt) und Leistenbreite bei 1180/1280/1440/1920 px.

## Entscheidungen und Fallen

- Das Lineal rechnet in Weltmillimetern, das Fliesen-Lineal im Raumrahmen. Deshalb eigener Speicher `raumaufmass-kueche-lineal` (je Raum), nicht der des Fliesenplans.
- Die Lineal-Logik ist aus `fliesenplan-bedienung.js` kopiert und angepasst, nicht geteilt. Fängt man dort einen Fehler, gilt er hier ebenso. Ein gemeinsamer Kern wäre der nächste Aufräumschritt.
- Abstände-Zustand liegt in `localStorage` (`raumaufmass.kabst`), nicht im Undo-/UI-Zustand (`kitchenUiState`).
- Die Küchenleiste war bei 1100 px mit zwei neuen Knöpfen zu breit (+97 px). Unter 1180 px: keine Lampe, gedrückt = eingefärbt, Palettensymbole 24 px (Regel `#kPalette .kpal svg`, mit höherer Spezifität, sonst schlägt die spätere Regel durch). Bei 1100 px passt es exakt (693/693). Jeder weitere Knopf in der Leiste sprengt das.
- Beim Arbeiten gilt weiter: Browsertest nur mit `PLAYWRIGHT=~/.npm/_npx/e41f203b7505f1fb/node_modules node test/browser.mjs chromium [ablauf]`; im Zaene-Ordner liegt kein `node_modules`.

## Bewusst nicht gebaut (lean)

Abstellfläche am Kochfeld (300/305/381 mm) und am Kühlschrank (380 mm), Spülmaschine–Spüle (914 mm), Arbeitsfläche Spüle–Kochfeld (900 mm). Sie haben keine Linie im Plan, nur Befundtexte im Panel. Nachrüsten: in `check` je ein `rec.push` mit Start/Ende an der Wand entlang, `drawGaps` zeichnet es ohne Änderung.

## Offen / nicht geprüft

- Das Aussehen der Abstände wurde nur an einem Testraum mit einem Wert gesehen (Screenshot). Bei vielen Teilen können Schilder einander überdecken (keine Kollisionsvermeidung).
- Nur Chromium getestet, nicht WebKit/Firefox.
- Bildvergleich (`test/vergleich-staende.mjs`) nicht gelaufen; die Leiste der Küche hat sich bewusst geändert.
