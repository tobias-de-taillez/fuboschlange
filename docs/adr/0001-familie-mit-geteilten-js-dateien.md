---
status: accepted
---

# Familie kleiner Werkzeuge mit geteilten JS-Dateien statt einer einzigen HTML-Datei

Bis November 2026 galt: Jede Oberfläche ist eine einzelne, selbst-enthaltene HTML-Datei ohne Build. `raumaufmass.html` ist darunter auf 24.600 Zeilen mit fünf Reitern gewachsen, weil jede neue Aufgabe (Fliesen, Küche) im selben Fenster landete. Wir teilen das Werkzeug in eine Familie auf: Startbildschirm, Raumaufmaß, Fliesenplan und Küchenplaner sind je eine HTML-Datei und laden Rechenkern, Speicher und Raumzeichnung aus gemeinsamen `.js`-Dateien per `<script>`. „Kein Build, keine Laufzeit-Abhängigkeiten“ bleibt, „eine einzige Datei“ fällt.

## Considered Options

- **Eine Datei, getrennte Ansichten.** Nichts muss geteilt werden, aber die Datei wächst weiter, und jede Änderung an einem Werkzeug berührt alle. Verworfen, weil genau dieses Wachstum der Anlass war.
- **Einzeldateien per Bauskript.** Jedes Werkzeug bliebe eine selbst-enthaltene Datei, zusammengesetzt aus Quellteilen. Verworfen, weil „kein Build“ mehr wert ist als „eine Datei“: Was im Editor steht, läuft im Browser, ohne Zwischenschritt.
- **Geteilte JS-Dateien ohne Build.** Gewählt. Der Companion arbeitet mit `raumskizze-*.js` schon so.

## Consequences

- Ein Werkzeug lässt sich nicht mehr als eine einzelne Datei weitergeben. Ein Raum als Datei oder Link weiterhin.
- Der Upload muss alle Dateien eines Stands gemeinsam ausliefern, sonst passen HTML und geteilte Dateien nicht zusammen.
- Alle Werkzeuge müssen unter derselben Adresse liegen, weil sie die Räume über den Speicher des Browsers teilen.
- Die Selbstchecks, die heute beim Laden der einen Datei laufen, gehören künftig zu den geteilten Dateien und laufen in jedem Werkzeug, das sie lädt.

## Zwischenstand (10.11.2026)

Startbildschirm (`raeume.html`) und Raumaufmaß (`raumaufmass.html`) sind getrennte Dateien auf den geteilten Skripten. Fliesenplan und Küchenplaner laufen noch in `raumaufmass.html`, umgeschaltet über `body[data-tool]` und die Adresse (`#fliesen`, `#kueche`). Ihre Rechenkerne und die Selbstchecks sind seit dem 10.11.2026 geteilte Dateien (`raum-fliesen.js`, `fliesenplan-einmessen.js`, `raum-kueche.js`, `raum-checks.js`; wörtlich ausgelagert, Beweis mit `node scripts/umzug-kerne.mjs pruefen vor-kerne`); Bedienung, Markup und CSS beider Werkzeuge stehen weiter in der Seite. Für sie gilt noch der Zustand „eine Datei, getrennte Ansichten“, den dieses ADR als Ziel verwirft. Was eigene Seiten kosten und was vorher zu entscheiden ist, steht in `docs/superpowers/plans/2026-11-10-familie-schritt-3.md`.

Namensregel: `raum-*.js` lädt jedes Werkzeug der Familie, `<werkzeug>-*.js` gehört einem Werkzeug allein.

Zwei Folgen der ausgelagerten Kerne, beide oben schon genannt und jetzt auch für Fliesen und Küche wahr: Bei einem Upload lädt die alte Seite für Sekunden schon den neuen Kern. Und beim Start per Doppelklick (`file://`) meldet der Browser Fehler aus geteilten Dateien ohne Datei und Zeile.

## Nachtrag: Fliesenplan und Küchenplaner als eigene Seiten (10.11.2026)

Schritt 3 der Reihenfolge ist getan. Jedes Werkzeug ist eine eigene HTML-Seite auf denselben geteilten Dateien: `raumaufmass.html`, `fliesenplan.html`, `kuechenplaner.html`, dazu `raeume.html`.

- **Gemeinsam:** `raum-plan.js` (Plan-Skript: Anmeldung der Werkzeuge, Zeigerführung, Tasten, Rückgängig, Hinweiszeile, Rückmeldung, Raum öffnen und sichern, Menü, Datei, Link und QR, Abgleich zweier Fenster, Boot `starteSeite(werkzeug)`) und **`raum-schale.css`** (die Regeln, die jede Seite braucht). Beide sind geteilt, weil jede Seite sonst eine eigene Kopie von rund 1500 Zeilen Schale oder 300 Zeilen CSS trüge. Das CSS ist die erste geteilte Datei, die kein Skript ist: Das Deploy-Skript liest sie aus `<link rel="stylesheet">`, `vercel.json` und `.htaccess` führen `css` neben `html` und `js` unter „immer frisch laden“.
- **Je Werkzeug allein:** `fliesenplan-bedienung.js`, `kuechenplaner-bedienung.js` und der Block `ui` von `raumaufmass.html`. Jedes meldet sich mit `meldeAn(modi, {…})` beim Plan-Skript an. Der Plan ruft das Werkzeug des gerade aktiven Modus (`zeichne`, `panel`, `hinweis`, `down`, `key`, …) und kennt keines mit Namen. Fehlt eine Funktion, wird das Werkzeug dort übergangen.
- **Namensregel bleibt:** `raum-*.js` lädt jede Seite, `<werkzeug>-*.js` gehört einer. Die Rechenkerne behielten ihre Namen (`raum-fliesen.js`, `raum-kueche.js`, `fliesenplan-einmessen.js`).
- **Das Aufmaß lädt die Kerne von Fliesen und Küche weiter**, aber keinen Code ihrer Bedienung und kein Markup oder CSS von ihnen: Fliesen- und Küchendaten bleiben am Raum, und das Modell normiert sie beim Laden (`TILES.normTiles`, `KITCHEN.normKitchen`).
- **Werkzeugwechsel ist Seitenwechsel.** Der Raum reist über `sessionStorage` (`raumaufmass.uebergabe`), Zurück führt zur vorigen Seite (bei Wiederherstellung aus dem Seitencache lädt sie neu). Rückgängig, Ansicht und Auswahl beginnen je Seite neu.
- **Die Selbstchecks (`raum-checks.js`, 418 kB) laden nur mit `?test`**, per Skript-Element zur Laufzeit; das Deploy-Skript findet sie über `.src='…'`.
- **Folge für den Upload:** Das Paket umfasst jetzt 26 Dateien. `scripts/deploy-hetzner.sh --probe <Ordner>` zeigt es.
- **Beweis des Umzugs:** `node scripts/umzug-plan.mjs pruefen vor-plan` zeigt, dass jede Zeile des früheren Blocks `ui` genau einmal im neuen `ui` oder in `raum-plan.js` steht. Die Bedienungen sind wörtlich verschoben (Tag `x1-bedienung-dateien`).
