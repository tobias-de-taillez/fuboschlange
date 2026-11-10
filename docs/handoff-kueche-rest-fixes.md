# Handoff: Küchenplaner (Modus 5) nach den Rest-Fixes

Stand: 10.11.2026, Commit `402f883` auf `main` (zuletzt gegen `e9dcadf` geprüft), live auf raumaufmass.irazari-te.ch.
Auslöser: Code-Review des Küchenplaners vom 09.11.2026; nach den Top-10-Fixes blieben 61 bestätigte Befunde und Hinweise.
Eine Fassung mit gezeichnetem Ablauf liegt in Claude Docs: https://claude.ai/artifact/Bk2PCnp7HmVkWhQxVyemS9

## Stand in einem Blick

Die Küchen-Rest-Fixes sind live und stecken in `main`; die Arbeit ist abgeschlossen, offen sind nur die unter „Bewusst offen“ genannten Punkte.

- **Mein Stand:** `402f883`, 44 Commits auf `510d02f`, in der Nacht auf den 10.11.2026 deployt. Die Familie-Session hat ihn danach in `main` aufgenommen (zuletzt geprüft: `e9dcadf`, 66 Commits weiter). Live läuft `main` bis `997e092` (Lineal und NKBA-Abstände); `raum-kueche.js` liegt live bytegleich zu `main`.
- **Umfang:** 61 bestätigte Review-Befunde der Küche (52 behoben, 2 schon behoben, 7 bewusst übersprungen) plus 52 bestätigte, kleine Funde aus drei Gesamtprüfungen. Selbsttests der Küche: 782 vorher, 1013 beim Deploy.
- **Rückweg:** Tag `live-vor-familie-kueche` zeigt auf `402f883` (`scripts/deploy-hetzner.sh live-vor-familie-kueche`). Der ältere Tag `live-vor-familie` zeigt auf `5d6d409`, also VOR den Fixes: nicht dorthin zurückrollen.
- **Wichtig für die Weiterarbeit:** Der Küchencode liegt seit der Familie in eigenen Dateien (`raum-kueche.js`, `raum-checks.js`, `kuechenplaner-bedienung.js`), nicht mehr als Blöcke in `raumaufmass.html`. Alte Fundstellen in Commit-Nachrichten und Review-Berichten nennen noch die Blocknamen `kitchen`, `kitchen-ui` und `checks`; die Zuordnung steht unter „Wo was liegt“.

## Was gemacht wurde

Nach den Top-10-Fixes und zwei Folgerunden blieben 61 bestätigte Befunde und Hinweise des Küchenplaner-Reviews; sie wurden in 11 Gruppen abgearbeitet, 52 davon sind behoben.

| Gruppe | Was sich für die Planung ändert | Befunde | behoben | schon behoben | übersprungen |
| --- | --- | --- | --- | --- | --- |
| decke | Giebel- und Kehl-Decken zählen in Höhenprüfung und 3D; ein Hängeschrank beginnt nie unter dem Boden | 4 | 3 | 1 | 0 |
| eck | Zimmertür schwenkt nicht durch den zweiten Schenkel; Kopie, Ziehen, Schrumpfen und Frontwechsel bei Eckschränken | 5 | 5 | 0 | 0 |
| masskette | Wandabstände nur noch, wo sie wirklich passen (Eckschrank-Block, Hochschrank, Querzeile, Tür, spitze Ecke); Maßfeld-Treffer bleibt derselbe | 7 | 7 | 0 | 0 |
| platte | Platte endet am Hochschrank in der Lücke; an stumpfen Ecken läuft sie als Fünfeck bis zur Nachbarwand; Tisch 90 × 160 hat sechs Plätze | 3 | 3 | 0 | 0 |
| pruef | Gang von Plattenkante zu Plattenkante; mehrere Geräte je Art; Arbeitsfläche Spüle–Kochfeld nur über die Platte; Tresen über die ganze Hockerkante; Dreieck-Meldung nennt jeden Schenkel | 6 | 5 | 0 | 1 |
| wege | Wege laufen nicht mehr durch Schränke, Tisch und Kind; Stand der Arbeitsfläche an der Front | 3 | 3 | 0 | 0 |
| inhalte | Fächer der hohen Geräteschränke aus allen Inhalten; defekte Schlüssel in Altdaten werfen nicht; Küchenmaße zurücksetzen lässt Personen stehen | 4 | 3 | 1 | 0 |
| 3d | Fronten offen nur für zu öffnende Fronten; flache Lade oben; Ofenhöhe aus einer Quelle; WebGL-Kontextverlust; earcut mit Doppelpunkten | 6 | 6 | 0 | 0 |
| zustand | Gehaltene Taste speichert einmal; Panel-Schlüssel mit ids, Abhilfe und Ansichtsdrehung; Raumwechsel setzt Wand und Referenz zurück | 6 | 5 | 0 | 1 |
| bedienung | Duplizieren im Raum; Kurve ohne falsche Lücken; Meldung mit Küchenzustand; Einheiten und Texte; doppelte Öffnungs-ids | 10 | 8 | 0 | 2 |
| etiketten | Plan-Etiketten weichen Linien und Zahlen aus, Inhalt als Block mit Kopfzeile, Eingangs-Pille | 7 | 4 | 0 | 3 |
| **Summe** | | **61** | **52** | **2** | **7** |

**Schon behoben (2):** der Hochschrank-zu-niedrig-Befund (decke A4, in `5580aec` und `b9bdb4d`) und das Aufräumen der Fächer nach einer Maßänderung (inhalte G2, in `5580aec`).

**Bewusst übersprungen (7), mit Grund:**

- **bedienung I24:** Die Normalisierung des Layouts hängt von der Öffnungsreihenfolge ab, aber nur bei nicht-kanonischen Altdaten (a größer als b), die die App seit `34e5f84` nicht mehr schreibt.
- **bedienung I25:** Die vier Integrationspunkte (deserialize, recompute, kitchenEnv, kitchenSave) sind Einzeiler in UI-Funktionen und ohne DOM-Testaufbau nicht testbar; die testbaren Lücken sind geschlossen.
- **pruef E4:** Abstellfläche am Kochfeld: Der Code folgt der Spezifikation (300 mm je Seite), NKBA Guideline 17 verlangt 305 und 381. Keine stille Verschärfung; nur der Meldetext nennt NKBA jetzt richtig.
- **zustand I11:** `kctx` baut den JSON-Schlüssel vor jeder Cache-Prüfung. Das ist real, kostet aber gemessen 3,8 µs je Schlüssel.
- **etiketten J-H3:** Führungslinien kreuzen lieber eine Linie, als weit abgerückt zu stehen. Das ist eine Produktabwägung; eine Gewichtung würde „Linie durch Zahl“ wieder verschlechtern (128 statt 36 Fälle).
- **etiketten J-H4:** „DA“ (Dunstabzug) fehlt in schrägen Ansichten: rund 80 % sind geometrisch unmöglich, identisch zu vorher.
- **etiketten J-Messung:** Kein Defekt, sondern die unabhängige Messung des Zeilenumbruch-Commits `760a05e` (Überlappungen 0, vorher 0).

## Funde der drei Gesamtprüfungen

Drei unabhängige Gesamtprüfungen des zusammengeführten Stands meldeten 57 Funde, 52 davon bestätigt und keiner ein Blocker. Jede Welle fand auch Fehler in den Korrekturen der vorigen Runde, vor allem am Drehregler.

| Welle | Prüfer (Linsen) | Agenten | gemeldet | bestätigt | Blocker |
| --- | --- | --- | --- | --- | --- |
| 1 | 7: Wechselwirkung, Speicherstände, Zufallstest, UI live, Leistung, Code-Ordnung, Nutzersicht | 33 | 26 | 22 | 0 |
| 2 | 5: Hängezeile, Gang und Kopie, UI Endstand, Zufallstest Endstand, Ordnung Endstand | 30 | 25 | 24 | 0 |
| 3 | 2: UI live am Drehregler, Diff-Review | 8 | 6 | 6 | 0 |
| **Summe** | | **71** | **57** | **52** | **0** |

Jeder gemeldete Fund bekam eine eigene Gegenprobe, die ihn zuerst zu widerlegen versuchte; fünf „major“-Einschätzungen wurden dabei auf „minor“ gesenkt, fünf der 57 Funde waren keine. Dazu kamen Zufallstests über etwa 81.000 Küchen je Stand (Ausnahmen, NaN, Invarianten, Unterschiede gegen den alten Stand).

**Daraufhin behoben:**

- **Gang:** Der Strahl begann 1 mm vor der Plattenkante, ein Gang von genau 1200 mm stand als 1199 (gelb), 900 als 899 (rot). Jetzt exakt.
- **Gehaltene Taste und Drehregler:** Raumwechsel (auch derselbe Raum noch einmal) verliert die vorgemerkten Schritte nicht mehr; ⌥ und andere Tasten spalten oder verschmelzen keine Rückgängig-Schritte; Fokusverlust und Strg/Cmd+Z mitten im Halten lassen Panel und Verlauf stimmen.
- **Duplizieren (Strg/Cmd+D):** Ein Eckschrank über Eck oder diagonal geht in die andere Ecke der Wand (mit Platz für den zweiten Schenkel) oder es gibt „Keine freie Ecke an dieser Wand für eine Kopie“; die Kopie einer Insel meidet Türzonen. Zufallstest: 0 rote Eckschrank-Kopien in 4.000 Fällen, vorher 705.
- **Maßkette in der Hängezeile:** Der Hochschrank ist dort Anker wie das Wandende. Vorher verschob das Feld am Wandende bei gewähltem Dunstabzug den Kühlschrank und erzeugte drei rote Befunde; jetzt hat die Lücke am Hochschrank ein Feld, das nur den Hängeschrank verstellt. In allen anderen Zeilen rechnet die Maßkette exakt wie vorher (27.062 Ketten, 0 Unterschiede).
- **Inselabstand:** Er misst bis zur Plattenkante wie der Gang; 1200 eingetragen ergibt 1200 statt 1180.
- **Robustheit:** Öffnungen ohne gültige Lage lassen Wege, Vorschlag und Einräumen nicht mehr werfen; `blockReach` hängt bei Wänden über 3e14 mm nicht mehr (höchstens 64 Halbierungen).
- **Leistung:** `check()` bei 40 Teilen von 2,35 auf 1,6 ms (`inPolyTol` ohne Zwischenobjekte).
- **Ordnung:** Ein wirkungslos gewordener Etiketten-Test unterscheidet wieder, ein Hilfscode ist durch `CORE.segCross` ersetzt, vier Kommentare und die Spezifikation stimmen wieder.

## Wo was liegt

Der Küchencode liegt seit der Familie in drei Dateien plus eigener Seite; die alten Blocknamen aus Commits und Berichten lassen sich so zuordnen.

| Teil | Datei auf `main` | früher |
| --- | --- | --- |
| Rechenkern: `layout`, `check`, `worktops`, `planner`, `flows`, `chainDims`, `dupOnWall`, `copySpot`, `planLabels` | `raum-kueche.js` (3594 Zeilen) | Block `kitchen` |
| Selbsttests der Küche und der Etiketten, Abschnitte „Review-Fix …“ und „Review-Fix Rest: …“ | `raum-checks.js` (5054 Zeilen) | Block `checks` |
| Bedienung: Plan zeichnen, 3D, Panel, Maßfeld, Drehregler, Duplizieren | `kuechenplaner-bedienung.js` (2003 Zeilen) | Block `kitchen-ui` |
| Seite der Küche | `kuechenplaner.html` | Tab „Küche“ in `raumaufmass.html` |
| Decke (`wallShape`, `ceilingAt`, `ceilingMin`), Öffnungs-ids (`normOpeningIds`) | `raum-geometrie.js` | Block `store` |
| Speichern, Laden, Rückgängig | `raum-speicher.js`, `raum-modell.js` | `store`, `ui` |
| Geometrie-Kern (`CORE`, zum Beispiel `segCross`) | `raum-kern.js` | Block `core` |
| Plan-Skript: `meldeAn` und der Aufruf der Hooks `vorRaumwechsel` und `neuerStand`; die Küche setzt beide in `kuechenplaner-bedienung.js` um | `raum-plan.js` | Block `ui` |
| Küchenzustand in der Fehlermeldung | `raum-meldung.js` | Block `meldung` |
| Spezifikation mit Quellen, Regelwerten und „Bekannte Lücken“ | `docs/superpowers/specs/2026-11-09-kuechenplaner-design.md` | unverändert |
| Lineal und NKBA-Abstände (andere Session) | `docs/handoff-kueche-lineal-nkba.md` | neu |

`test/run.mjs` lädt die Dateien in der Reihenfolge der `<script>`-Tags: `raum-fremd`, `raum-kern`, `raum-fliesen`, `raum-kueche`, `raum-geometrie`, `raum-speicher`, zuletzt `raum-checks` (im Browser lädt `raum-checks.js` nur mit `?test`). Die Namensregel der Familie dazu steht in `docs/adr/0001-familie-mit-geteilten-js-dateien.md`: `raum-*.js` lädt jedes Werkzeug, `<werkzeug>-*.js` gehört einem allein.

Nicht im Repo liegen die Prüfskripte der Sitzung (Vergleich der echten Küche, Zufallsgeneratoren, Live-Skripte, Mutationsprobe). Was sie taten, steht unter „So prüft man“ und „Vorgehen als Muster“; sie lassen sich in wenigen Zeilen neu schreiben.

## So prüft man

Vier Wege tragen: Selbsttests, Vergleich der echten Küche, Selbsttests auf der ausgelieferten Seite und Deploy mit Hash-Prüfung. Die ersten drei wurden für dieses Dokument auf `e9dcadf` frisch durchlaufen, alle grün; der Deploy lief zuletzt für `402f883`.

**1. Selbsttests in Node.** Die Ausgabe immer in eine Datei umleiten: `test/run.mjs` ruft `process.exit` direkt nach dem letzten `console.log`, und bei einer Pipe (`| tail`) bricht die Ausgabe mitten in einer Zeile ab, obwohl alles grün ist. Der Exit-Code zählt.

```bash
node test/run.mjs > /tmp/run.txt 2>&1; echo "exit=$?"; tail -1 /tmp/run.txt; grep -c '^PASS' /tmp/run.txt
```

Erwartet: `exit=0`, „ALLE CHECKS GRÜN“, 1018 PASS (1013 beim Deploy von `402f883`). Ebenfalls grün sind `test/raumaufmass-einmessen.mjs`, `raumaufmass-kanten.mjs`, `verlegeplan.mjs`, `fliese-einmessen.mjs`, `raum-modell.mjs`, `raum-blatt.mjs` und `raum-haus.mjs`. Die Bedienung im Browser prüft `PLAYWRIGHT=~/.npm/_npx/<hash>/node_modules node test/browser.mjs chromium` (Playwright gehört nicht zum Repo; Testseiten nur auf eigenen Ports, nie auf 8741).

**2. Echte Küche alt gegen neu.** Die Raumdatei liegt nicht im Repo (Hesterkamp: `hesterkamp-wohnkueche-2026-11-09 (1).json` in den Downloads). Jeden Stand per `git archive <Stand> | tar -x -C <Ordner>` auspacken und in einem eigenen Node-Prozess rechnen, weil die Module an `globalThis` hängen; dann die beiden JSON-Ausgaben vergleichen.

```js
// node vergleich.mjs <Stand-Ordner> <raum.json>
import {readFileSync} from 'node:fs'; import {join} from 'node:path';
const [,, wurzel, raum]=process.argv, lies=f=>readFileSync(join(wurzel,f),'utf8');
new Function('"use strict";\n'+['raum-fremd','raum-kern','raum-fliesen','raum-kueche','raum-geometrie','raum-speicher'].map(n=>lies(n+'.js')).join('\n'))();
const C=globalThis.CORE, KX=globalThis.KITCHEN, R=JSON.parse(readFileSync(raum,'utf8'));
const K=KX.normKitchen(R.kitchen); KX.anchorFrame(K,R.pts,R.walls);
const pts=R.ortho ? C.orthoFit(R.pts,R.walls,R.meas,3,R.angs||[]).fit.pts : C.solve(R.pts,R.meas,R.angs||[]).pts;
const E=KX.makeEnv(pts,R.walls,R.openings,R.hmeas,R.water,K.frame), L=KX.layout(E,K);
console.log(JSON.stringify({befunde:KX.check(E,K,L).map(f=>f.lvl+' '+f.txt), stueckliste:KX.stock(K,L), km:KX.flows(E,K,L,{}).kmYear, optimum:KX.optimalStore(E,K,L)},null,1));
```

Hesterkamp heute: 8 Befunde (4 gelb, 4 Info), 31,76 km im Jahr. Gegen `510d02f` (vor allen Fixes) unterscheidet sich nur: Arbeitsdreieck nennt die Schenkel, der Gang vor der hohen Spülmaschine steht als 1143 statt 1142 mm, neu „Tresen: hinter den Hockern 804 mm“. Stückliste, Wege und Optimum sind gleich, auch bei allen vier Wandrotationen (Rotation = Wandliste zyklisch verschoben).

**3. Selbsttests live.** Die ausgelieferte Seite mit `?test` laden; die Konsole meldet „Selbstchecks“ (log = grün, error = rot). Das deckt Ladereihenfolge, Cache und die wirklich ausgelieferten Dateien ab, was die Hash-Prüfung nicht sieht. Immer ein eigener headless Chromium, nie die Browser-Werkzeuge der App.

```js
// node live-test.mjs [seite]   (Playwright-Pfad in PLAYWRIGHT_CORE)
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE);
const b=await chromium.launch(), p=await (await b.newContext()).newPage(), fehler=[]; let selbst=null;
p.on('pageerror',e=>fehler.push(e.message));
p.on('console',m=>{ const t=m.text(); if(t.startsWith('Selbstchecks')) selbst={ok:m.type()==='log', pass:t.split('\n').filter(l=>l.startsWith('PASS')).length}; else if(m.type()==='error') fehler.push(t.slice(0,200)); });
await p.goto('https://raumaufmass.irazari-te.ch/'+(process.argv[2]||'kuechenplaner.html')+'?test&nc='+Date.now()); await p.waitForTimeout(8000);
console.log(JSON.stringify({selbst, fehler})); await b.close();
```

Erwartet auf `kuechenplaner.html` und `raumaufmass.html`: `ok: true`, 1018 PASS, keine Fehler.

**4. Deploy und Rückweg.** Erst `main` nach origin pushen (schlägt der Push fehl, nicht deployen und nicht erzwingen), dann `scripts/deploy-hetzner.sh`; es lädt alles aus demselben Stand, `index.html` zuletzt, und prüft jede Datei per Hash gegen die ausgelieferte Fassung. Danach Punkt 3.

```bash
scripts/deploy-hetzner.sh                          # Stand von main
scripts/deploy-hetzner.sh <Tag|Commit>             # genau diesen Stand
scripts/deploy-hetzner.sh --probe <Ordner> [<Stand>]   # Probelauf ohne Server und Passwort
scripts/deploy-hetzner.sh live-vor-familie-kueche  # Rückweg auf 402f883 (Rest-Fixes drin, altes Aussehen)
```

Das FTP-Passwort kommt aus dem macOS-Schlüsselbund (`hetzner-irazari-ftp`, Benutzer `ebrh7y`); die Einrichtung steht im Kopf des Skripts.

## Entscheidungen und warum

Diese Entscheidungen tragen das Verhalten, das man heute sieht; wer eine ändert, ändert Prüfung, Spezifikation und Tests zusammen.

| Entscheidung | Warum | Wo |
| --- | --- | --- |
| Der Gang wird von Plattenkante zu Plattenkante gemessen und in ganzen mm verglichen; genau 1200 oder 900 mm lösen nichts aus | NKBA Guideline 6 misst an der „counter frontage“; der Strahl begann 1 mm zu früh | `check()`, Abschnitt Gänge; `topOf`, `frontage` |
| Der Inselabstand der Maßkette misst bis zur selben Plattenkante; steckt die Kante schon in der Platte, ist er 0 | Eintrag und Gangmeldung sollen dieselbe Zahl nennen | `freeDims` |
| Der Hochschrank ist in der Hängezeile Anker, kein Teil eines Blocks; nur dort beginnt `block()` an der Lücke | Sonst verschob das Feld am Wandende den Kühlschrank, und die Sperren der unteren Zeile (Eckschrank im Block) galten oben nicht | `chainDims`, `dimKey` (mit Anker) |
| Abstellfläche am Kochfeld bleibt 300 mm je Seite; NKBA 305 und 381 stehen nur im Meldetext | Spezifikation vor Gewohnheit: keine stille Verschärfung einer Regel | `check()`, Abschnitt Kochfeld |
| Tresen: hinter den Hockern rot unter 750, gelb unter 813, über die ganze Hockerkante gemessen; der Tisch misst nur den Mittelstrahl | NKBA 813; vorher zählte nur die Mitte | `check()`, Tresen und Tisch |
| Mehrere Spülen, Kochfelder oder Kühlschränke: jedes Gerät einzeln; Abstandsregeln gelten als erfüllt, wenn ein Paar passt | Ein zweites Gerät darf das erste nicht schlechtreden | `check()` |
| Decke: die niedrigste Stelle über der ganzen Teilbreite zählt (Knickpunkte); die Unterkante eines Hängeschranks liegt nie unter 0 | Giebel und Kehle wurden als gerades Trapez gerechnet | `makeEnv`, `ceilShape`, `derived` |
| Duplizieren ist wie Einfügen; ein Eckschrank über Eck oder diagonal geht nur mit zweitem Schenkel in die andere Ecke, sonst „Keine freie Ecke an dieser Wand für eine Kopie“ | Mitten an der Wand oder in einer schiefen Ecke stand die Kopie sofort rot | `dupOnWall`, `copySpot` |
| Gehaltene Taste: ein Rückgängig-Schritt und einmal speichern (beim Loslassen oder nach 400 ms Ruhe); der Raumwechsel schreibt Vorgemerktes noch in den alten Raum | Je Wiederholung zu speichern schrieb rund 270 KB und baute das Panel neu | `deferSave`, `vorRaumwechsel`, `neuerStand` |
| Etiketten: Führungslinien dürfen eine Linie kreuzen, statt weit abgesetzt zu stehen | Messung: „Linie durch Zahl“ von 128 auf 36 Fälle; Produktabwägung | `stationLabel`, `planLabels` |

## Bewusst offen

Offen sind dreizehn kleine Punkte, jeder bestätigt und keiner mit Datenverlust im Normalfall; die ersten drei wirken sich am ehesten auf Planungsergebnisse aus. „Schon auf main“ heißt: auch auf `510d02f`, vor allen Fixes.

| Thema | Zustand | Seit | Vorschlag |
| --- | --- | --- | --- |
| Stuhlraum am Tisch | Misst nur den Mittelstrahl; in Hesterkamp liegt die Tisch-Langseite über die letzten etwa 440 mm nur 804 mm vor der Insel, ohne Befund (der Tresen meldet es) | schon auf main | In `check()` wie beim Tresen über die ganze Seite messen. Wirkt auf echte Küchen (neue Meldung), also Produktentscheidung |
| Platte und Hochschrank | In rund 0,2 % der Zufallsküchen (19 von 9115 sauberen) reicht die Platte in einen Hochschrank; die Stückliste führt dann eine Phantom-Passblende | schon auf main | In `worktops()` die Hochschrank-Anschläge vor dem Eckschnitt rechnen |
| Wege neben Schränken | Endet ein Weg weniger als etwa 100 mm neben einem Schrank, läuft er in 1,2 % der Fälle durch den Schrankkern (vorher 14 %) | schon auf main, stark verbessert | Station in der Wandfuge auf den nächsten freien Ringpunkt ziehen (`snapIn`, `relaxOf`) |
| Halbeck-Kopie | Prüft weder Deckenhöhe noch Fensterflügel (wie das Einfügen): 17 von 2528 Kopien stehen rot | schon auf main | Decke und Flügel in `fitsAt` aufnehmen, dann profitieren Einfügen und Ziehen mit |
| Leistung | `check()` bei 40 Teilen 1,6 statt 1,06 ms; `renderWays` und die Analyse blockieren in großen Küchen (100 ms und mehr bei 40 Teilen) | `check()` neu, Rest schon auf main | `renderWays` entprellen, die Analyse erst beim Einblenden rechnen |
| Doppelte Öffnungs-ids | Gültige doppelte Text-ids aus Importen bleiben doppelt (Löschen entfernt beide) | schon auf main | `seen`-Menge in `normOpeningIds` (liegt in der geteilten `raum-geometrie.js`) |
| Riesige Koordinaten | Ab etwa 1e100 lassen `flows`, `suggest` und `optimalStore` werfen (NaN im Viterbi-Weg) | schon auf main | Koordinaten in `normItem` klemmen oder den Rückweg NaN-sicher machen |
| Randlagen der Maßkette | Hängezeile ohne Hochschrank bei 0,6 bis 1,2 mm Überlappung: ein anderer Nachbar wird mitgezogen (15 von 4925 Ketten, immer rot); Inselabstand bei Plattendurchdringung: im Plan kein Feld, im Skriptpfad ein Gang um die Eindringtiefe zu klein | neu, Randfall | Hinnehmen oder die Teil-zu-Segment-Zuordnung auf 1 mm Toleranz legen |
| Drehregler | Eine Pfeiltaste mitten in einer Mausdrehung bricht die Geste ab; gehalten ergibt das zwei Rückgängig-Schritte | schon auf main | `preventDefault` bei laufender Mausgeste, aber nur mit Prüfung auf hängenden `rotPtr` |
| Etiketten | „DA“ fehlt in schrägen Ansichten (geometrisch meist unmöglich); die klickbare Zahl kann in sehr kleinen Fenstern über der Türpille stehen (`dimLabel` nimmt den ersten Kandidaten statt den am wenigsten überdeckten); der Maßstabsbalken steht nicht in der Belegt-Liste | schon auf main | `dimLabel`: Kandidat mit der geringsten Überdeckung wählen |
| Meldetext | „Hängeschrank nur −910 mm über der Arbeitsplatte“ bei einem Hängeschrank auf dem Boden | schon auf main | Text bei Abstand 0 oder weniger anpassen |
| Kochfeld am Fenster | Ein Kochfeld, das bündig an der Fensterkante endet, wird in gedrehten Räumen durch Gleitkommarauschen rot („Kochfeld unter einem Fenster“) | schon auf main | Wie bei den Grenzwerten des Gangs in ganzen mm oder mit 0,01 mm Toleranz vergleichen (Vorbild: `inPolyTol`) |
| Letzter Fix ohne Test | `c47ea3e` (Regler-Fokus, Strg/Cmd+Z mitten im Halten) ist nur live per Skript bestätigt, ohne Selbsttest und ohne unabhängige Prüfwelle | neu | Ablauf in `test/browser.mjs` aufnehmen |

Zur Klarstellung, was nicht mehr offen ist: `test/fliese-einmessen.mjs` ist grün (nach der Aufteilung war es rot; die Familie-Session hat die Kernkopie per Prüfsumme festgehalten). Die übrigen, fachlichen Lücken (Griffe an Flügeltüren, Side-by-Side-Luft, Gefrierteil links, Über-Eck-Türen, Halbeck-Passleiste, gestufte Inselplatte, kein Druck) stehen unter „Bekannte Lücken“ in der Spezifikation.

## Fallstricke

Acht Dinge haben in dieser Arbeit Zeit gekostet; jedes lässt sich mit einer Gewohnheit vermeiden.

| Falle | Folge | Umgehen |
| --- | --- | --- |
| `node test/run.mjs \| tail` | Die Ausgabe bricht mitten in einer Zeile ab (`process.exit` bei einer Pipe), es sieht nach einem Absturz aus | Ausgabe in eine Datei umleiten, Exit-Code lesen; auch in Prompts für Unteragenten sagen |
| `main` bewegt sich unter einem | Mitten in der Arbeit zog eine andere Session Rechenkern, Speicher und Modell in Dateien (später auch Fliesen, Küche, Checks); Zeilennummern und Blocknamen in Berichten wurden falsch | Vor jedem Merge `git fetch` und die Dateistruktur ansehen; erst `main` in den Integrationszweig mergen, dann die Gruppen; Stellen immer über Funktionsnamen finden |
| Verweis von Prüfern auf einen Zweig, der sich ändert | Ein Prüfer, der gegen einen Zweig vergleicht, sieht plötzlich fremde Änderungen | Prüfstände als eingefrorene Kopie (`git worktree add --detach <Ordner> <Commit>`) vergeben und den Arbeitszweig weiter bewegen |
| Rückweg-Tag `live-vor-familie` | Er zeigt auf `5d6d409`, vor den Rest-Fixes; ein Rückweg dorthin nimmt sie mit zurück | Den Tag `live-vor-familie-kueche` (`402f883`) nehmen |
| Deploy vor dem Push | Live läuft dann auf einem Stand, den origin nicht hat | Erst `git push origin main`; schlägt er fehl, nicht deployen und nicht erzwingen |
| Browser-Werkzeuge der App in Agenten | Ein früherer Agent löschte damit den `localStorage` einer fremden Testkopie | Nur ein eigener headless Chromium über Playwright, eigener Kontext, nie Port 8741 (echte Daten); in jedem Prompt verbieten |
| Test, der ohne seinen Fix grün bleibt | Er gibt Sicherheit vor: ein späterer Commit hatte den Etiketten-Test unbemerkt wirkungslos gemacht | Mutationsprobe: Fix zurücknehmen, Testlauf muss rot werden; bei Endlosschleifen mit `timeout` laufen lassen |
| Gleitkommarauschen in gedrehten Räumen | Ein Gang von genau 900 mm stand mal gelb, mal rot (behoben); ein Kochfeld bündig an der Fensterkante wird in gedrehten Räumen weiterhin rot (offen) | In ganzen mm vergleichen; neue Regeln auch in Räumen um 17°, 133° und 0,5° prüfen, denn echte Räume haben nie glatte Koordinaten |

## Vorgehen als Muster

Die 61 Befunde wurden in Gruppen mit eigenem Worktree abgearbeitet und danach in Wellen gegengeprüft, bis nur noch Kleinkram kam. Jede Korrektur wird erneut geprüft, bis eine Welle nur Kleinkram findet:

1. **61 Befunde** aus dem Review des Küchenplaners.
2. **11 Gruppen**, je ein eigener Worktree und Zweig.
3. **Fix je Gruppe** mit einem Selbsttest, der ohne den Fix rot ist.
4. **Gegenprüfer:** prüft unabhängig und stimmt zu oder nicht.
5. **Zusammenführen** auf den neuen `main`, Test nach jedem Merge.
6. **Gesamtprüfung** in Wellen (7, 5, dann 2 Linsen), je Fund eine Gegenprobe.
7. **Korrektur:** kleinste Änderung, Mutationsprobe, Live-Lauf; danach zurück zu Schritt 6, bis eine Welle nur noch Kleinkram findet.
8. **Endkontrolle:** Tests, echte Küche, Deploy, Live-Test.

**Regeln, die sich bewährt haben:**

- **Jede Gruppe hat Anker gegen Merge-Konflikte.** Pro Gruppe ein eigener Testabschnitt und eine eigene Exportzeile (`Object.assign(globalThis.KITCHEN, { /* rest-<gruppe> */ })`), getrennt durch unveränderte Zeilen und nach dem Zusammenführen entfernt. Ergebnis: zehn von elf Gruppen mergten ohne Konflikt; der eine Konflikt kam vom Umbau von main, nicht von den Gruppen.
- **Jeder Befund wird zuerst auf dem aktuellen Stand nachgestellt.** Zeilennummern des Review-Stands gelten nicht. Ergebnis je Befund: `fixed`, `already_fixed`, `not_reproducible` oder `skipped`, mit Beleg; ein sauberes `skipped` ist besser als ein riskanter Eingriff.
- **Gegenprüfer bekommen nur die Behauptung** und versuchen zuerst, sie zu widerlegen; sie prüfen live in einem eigenen headless Chromium und stimmen je Befund zu oder nicht.
- **Die Gesamtprüfung läuft auf einer eingefrorenen Kopie** mit verschiedenen Linsen (Wechselwirkung, Speicherstände, Zufallstest gegen den alten Stand, UI live, Leistung, Ordnung, Nutzersicht). Jede Korrektur kommt in die nächste Welle: Jede Welle fand Fehler der vorigen.
- **Jede Korrektur hat einen Test, der ohne sie rot ist** (Mutationsprobe), und wo möglich einen Differenztest gegen den alten Stand (Zufallsküchen, Ketten, Etiketten), damit „ändert sich sonst nichts“ gemessen statt behauptet wird.
- **Berichten, was war:** Zahlen je Ergebnis, auch Übersprungenes und Offenes; eine Zusammenfassung ersetzt keine Messung.

## Nächste Schritte

Zuerst die eine Entscheidung, die echte Küchen betrifft, dann die zwei Prüflücken, danach Aufräumen; nichts davon ist dringend.

1. **Tisch-Stuhlraum entscheiden.** Soll der Tisch wie der Tresen über die ganze Seite messen? In Hesterkamp käme eine neue Meldung dazu, also eine Produktentscheidung mit Anpassung der Spezifikation.
2. **`fitsAt` um Deckenhöhe und Fensterflügel erweitern.** Das schließt die Halbeck-Kopie (17 von 2528 rot) und hilft Einfügen und Ziehen; Differenztest gegen diese Fälle.
3. **`worktops()`: Hochschrank-Anschläge vor dem Eckschnitt rechnen.** Beseitigt die überlappende Platte und die Phantom-Passblende (19 von 9115 Zufallsküchen).
4. **Drehregler-Ablauf in `test/browser.mjs` aufnehmen.** `c47ea3e` hat nur einen Livelauf als Beleg.
5. **Prüfskripte ins Repo legen** (zum Beispiel unter `scripts/`): Vergleich der echten Küche, Zufallsgenerator, Mutationsprobe, Live-Test. Sonst beginnt die nächste Prüfwelle bei null; oben stehen nur die zwei kurzen.
6. **Wege in der Wandfuge** (`snapIn`): rund 1,2 % der Wege laufen durch einen Schrankkern.
7. **Leistung nur bei Bedarf:** `renderWays` entprellen und die Analyse erst beim Einblenden rechnen, falls Küchen mit 40 oder mehr Teilen wirklich vorkommen.
8. **Kleinkram bündeln:** Meldetext „−910 mm“, `dimLabel`, Fensterrauschen, Pfeiltaste in der Mausgeste, doppelte Öffnungs-ids, riesige Koordinaten.

Wer an `check()` arbeitet, liest zuerst `docs/handoff-kueche-lineal-nkba.md`: Lineal und NKBA-Abstände hängen über die optionale Liste `rec` an `check`; ohne sie ändert sich nichts.
