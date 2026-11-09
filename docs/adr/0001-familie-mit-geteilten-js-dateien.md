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

Startbildschirm (`raeume.html`) und Raumaufmaß (`raumaufmass.html`) sind getrennte Dateien auf den geteilten Skripten. Fliesenplan und Küchenplaner laufen noch in `raumaufmass.html`, umgeschaltet über `body[data-tool]` und die Adresse (`#fliesen`, `#kueche`). Das ist der Zustand „eine Datei, getrennte Ansichten“, den dieses ADR als Ziel verwirft; er gilt nur, bis beide ihr eigenes Anforderungspapier und damit ihre eigene Datei bekommen.

