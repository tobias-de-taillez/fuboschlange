# Handoff: eigene Seiten und leisere Werkzeuge, offene Punkte

Stand 10.11.2026, abends. Zwei Arbeiten liegen hintereinander: Schritt 3 der Werkzeugfamilie (Fliesenplan und Küchenplaner als eigene Seiten, **live seit 10.11.2026 mit Stand 8fe0a7a**) und der Umbau „alles ist gleich laut“ für beide Werkzeuge (Zweig `feat/werkzeuge-leise`, **noch nicht live**). Dieses Papier nennt, was offen ist, in welcher Reihenfolge, und wo die Belege liegen.

## 1. Der Zweig feat/werkzeuge-leise live stellen (Tobias hat „live stellen“ gesagt)

Stand: Zweig auf `origin/main` (7c0a2c8) rebased, Konflikte im Küchenplaner gelöst (Lineal und Abstände nach NKBA liegen als Schalter im Menü › Ansicht, nicht mehr in der Leiste). Letzter Commit `0bfd693`. Lokales `main` steht noch auf e9dcadf und ist hinter `origin/main`.

Offen, in dieser Reihenfolge, jeder Schritt erst nach dem grünen Vorgänger:
1. **Alle Tests nach dem Rebase grün** (lief zuletzt im Hintergrund): `node test/run.mjs > Datei` und die sieben weiteren Node-Tests in `test/` (Exit-Code zählt), `node test/browser.mjs` in Chromium, WebKit und Firefox, `node test/vergleich-staende.mjs <Ordner mit git archive origin/main>` (muss „ALLE 27 VERGLEICHE GLEICH“ melden). Rot: nicht live stellen, die Stelle melden.
2. **Rückweg-Tag** auf den Stand, der gerade live liegt: `git tag live-vor-leise 7c0a2c8` (der live liegende STAND-Stempel kann `997e092` sein; vorher am Server prüfen, welcher Stand ausgeliefert wird).
3. **`main` auf den Zweig vorspulen, nur Fast-Forward**: `git update-ref refs/heads/main <HEAD des Zweigs> <alter main-Stand>` (main ist in keinem Arbeitsverzeichnis ausgecheckt; nie im geteilten Ordner den Zweig wechseln).
4. **Upload** `scripts/deploy-hetzner.sh main` (Passwort liegt im macOS-Schlüsselbund, Details in `docs/handoff-hetzner-webhosting.md`), zuvor optional `--probe <leerer Ordner> main`. Das Skript vergleicht jede Datei per Hash; die Ausnahme ist der Stand-Stempel in `raum-meldung.js`.
5. **Live lesend prüfen:** `fliesenplan.html`, `kuechenplaner.html` laden und zeigen den neuen Aufbau; `?test` lesend (nicht schreibend): `…/raumaufmass.html?test`, `…/fliesenplan.html?test`. **Kein POST an `bugreport.php`, nie `localhost:8741`** (echte Daten).
6. **Pushen:** `git push origin main feat/werkzeuge-leise` und die Tags (`live-vor-leise`).

## 2. Leiser machen: was der Umbau nicht erledigt hat

Quelle: `docs/superpowers/plans/2026-11-10-werkzeuge-leiser.md` (Inventur vorher/nachher). Umgebaut sind Aufbau, Wege und Texte nach den zwei Antworten von Tobias (Fliesenplan: erst Fliesenset, dann legen; Küchenplaner: stellen und Wege sehen). Offen:
- **Aussehen nach `DESIGN.md`:** Farben, Flächen und Abstände der beiden Werkzeuge sind die alten. Das Aufmaß trägt das leisere Papier-Aussehen; die Folgewerkzeuge nicht (Chips der Leiste, Karten, Panel-Abschnitte, Akzent nur an Hauptaktion und Auswahl). Eigener Entwurf nötig, mit Bildvergleich gegen den Stand `vor-leise`.
- **Teile-Leiste der Küche:** zwölf Piktogramme in fünf Gruppen mit Beschriftung (KALT, WARM, NASS, STAURAUM, MÖBEL). Eine Auswahl nach Häufigkeit oder eine zweite Reihe wäre ein eigener Entwurf, Tobias fragen.
- **Wege-Vorschläge der Küche** („Optimal einräumen“, „Einräumen und umsortieren“, Einteilung ansehen) stehen gekürzt, aber weiter vollständig im Panel. Hauptweg-nah, daher nicht gestrichen.
- **Fliesenplan-Material:** „Fugenmörtel“, „Fugenkreuze“, „Belegt“ stehen noch vor der Stückliste; gehören hinter „Einzelheiten“.
- **Menüpunkt „Zum Raumaufmaß“** führt weiter in den Schritt Maße, nicht in die Ausgabe.
- **Hilfe-Abschnitt „Menü“** in den Hilfen der Folgeseiten nennt noch Punkte des Aufmaß-Menüs; auf den Folgeseiten fehlen sie.

## 3. Fragen an Tobias, die offen sind

- Dateiname **`raum-plan.js`**: das Glossar reserviert „Plan“ für den Fliesenplan. Es ist nur ein Dateiname, kein Begriff der Oberfläche. Umbenennen (z. B. `raum-seite.js`) trifft jeden offenen Zweig ein zweites Mal.
- **`package-lock.json`** liegt im Repo (Playwright 1.60.0 fest, passt zu den installierten Browsern). Soll er bleiben?
- Soll die **Teile-Leiste der Küche** kleiner werden (siehe oben)?

## 4. Nicht geprüft

Touch und Finger auf den neuen Seiten; Drucken (Fliesenplan, Schnittblätter) aus den neuen Seiten; zwei Fenster in den Folgewerkzeugen (die Logik ist die des Aufmaßes, `storage`-Ereignis in `raum-plan.js`, aber nicht nachgestellt); Safari selbst (nur seine Engine WebKit); die Live-Seite mit echten Räumen durchgeklickt (bisher nur Hashes und Statuscodes). Im Bildvergleich bleiben zwei Reste: ein zeitabhängiger Unterschied im Schritt Ausgabe der Skizze ohne Maße (Chromium) und „−0,00 %“ gegen „0,00 %“ im Fliesenplan nach dem Drehen (Firefox); beides ist im Plan `2026-11-10-familie-schritt-3.md` erklärt.

## 5. Aufräumen

- Arbeitsverzeichnisse unter `.claude/worktrees/`: `familie-schritt-3` (Zweig `feat/familie-schritt-3`, auf `main`), `werkzeuge-leise` (dieser Zweig). Nach dem Live-Gang entfernen: `git worktree remove`, danach die Zweige.
- Rückweg-Tags: `vor-leise` (= 8fe0a7a), `vor-plan`, `x1-bedienung-dateien`, `vor-kerne`, `live-vor-familie-kueche`. Nichts davon löschen, solange die Rückwege gebraucht werden. `scripts/umzug-kerne.mjs pruefen` gilt nur für den Stand bis `x1-bedienung-dateien`.
- Werkzeuge zum Wiederholen des Schnitts (nur nötig, wenn `main` an `raumaufmass.html` ändert, bevor ein Zweig landet): Notizordner `side-session-notes/local_8b610fbe-…/schritt-3/werkzeug/` mit `UEBERGABE.md`.
- Offene Meldungen aus dem Meldedialog: `bugreports/` (zwei Dateien, nicht gelesen).

## 6. Befehle und Regeln

- Tests: `npm install` (einmalig), `npx playwright install chromium webkit firefox`; `node test/browser.mjs [chromium|webkit|firefox]`; Selbstchecks im Browser mit `…html?test`; Bildvergleich `NEUE_SEITEN=geschnitten node scripts/bildvergleich.mjs <Altstand-Ordner> . <engine>`; Stände `node test/vergleich-staende.mjs <git archive-Ordner>`.
- Regeln des Projekts: Antworten deutsch mit Umlauten; Begriffe aus `GLOSSARY.md`; kein `confirm`/`alert`, Rückmeldung am Ort über `sag(text, anker)`; Commits ohne Attributionszeilen; die App unter `http://localhost:8741` nie öffnen, im Browser nur mit eigenem Server auf eigenem Port testen.
- Parallele Sitzungen ziehen dieselben Meldungen und ändern `main` (zuletzt `997e092`, `e9dcadf`, `7c0a2c8`: Lineal und NKBA-Abstände, Rest-Fixes der Küche, siehe `docs/handoff-kueche-lineal-nkba.md` und `docs/handoff-kueche-rest-fixes.md`). Vor jedem Landen `git fetch`, rebasen, nur Fast-Forward.
