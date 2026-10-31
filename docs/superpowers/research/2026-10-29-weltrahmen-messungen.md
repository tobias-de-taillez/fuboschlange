# Weltrahmen nach ARCore-Brüchen: Messungen vom 29.10.2026

Auftrag von Tobias: Gyro mit Gier-Raster, „unklare Bereiche“ mit Rückkehr (mehr Daten müssen die Karte verbessern, nicht durcheinanderbringen), Bild-Wiedererkennung live, Beschleunigungssensor. Sieben Agenten haben gemessen, jeder Befund wurde von einem zweiten gegengeprüft. Nichts davon ist im Code umgesetzt. Alle Gyro- und Beschleunigungszahlen sind nachgebildet (keine Aufnahme hat `imu.jsonl`). Unten stehen die Aussagen, die die Gegenprüfung bestätigt hat, und die Einschränkungen, die sie ergeben hat.

## Lücken (102 Schnitte in 6 echten Aufnahmen)
- 84 von 102 Schnitten haben keine Lücke (10-Hz-Zeilentakt): T-Wechsel, Kamerasprünge, Bezugssprünge. 18 sind echte Ortungsverluste: 1 unter 0,3 s, 3 von 0,3–1 s, 6 von 1–3 s, 7 von 3–10 s, 1 über 10 s.
- Schon bei 0,4 s Lücke liegt die Kette an den Wänden 23 cm daneben, bei nur 1,9 cm Lagebewegung: Die Drehung in der Lücke macht den Fehler. Mit simuliertem Gyro bleiben 1,6 / 2,6 / 6,3 cm bei 0,4 / 0,7 / 1,1 s.
- Der Restfehler mit Gyro liegt in Lücken von 1–10 s (Anteil etwa 85 %). Das ist eine Obergrenze des Anteils kurzer Lücken (über 4,1 s ist der Fehler konstant gehalten).

## Beschleunigungssensor
- Rauschen ist vernachlässigbar (0,3 cm bei 3 s). Es dominieren Restoffset, Fehlausrichtung IMU/Kamera und Gyro-Restbias. Der Chip ist ein TDK ICM-45631 (iFixit, für das 9 Pro XL; fürs 9 Pro Annahme).
- Nur zweiseitig (Startgeschwindigkeit und Geschwindigkeit nach der Lücke) und nur mit online geschätztem Bias lohnt es sich: bei 6 s etwa 12 statt 42 cm, bei 10 s etwa 35 statt 83 cm. Mit dem gyroSim-Bias bringt es bei 6 s nichts.
- Bei kurzen Lücken unter 1 s holt er höchstens wenige cm. **Entscheidung: nicht bauen, bevor die echte Aufnahme da ist.** `?imu=1` zeichnet `accelerationIncludingGravity` mit 60 Hz bereits auf (devicemotion); damit lässt sich Bias und Stillstand in der Lücke messen.

## Gyro und Gier-Raster
- Im Repo greift das Raster hinter einem Gyro-Schnitt nie (Sperren in `mlAbReg`, kartenlauf.js:518, und `mlGierRaster` bei sY ≤ 5°, :490).
- In einer Kopie gebaut mit Gyro-Fenster: Es blockt fast alles, weil die Raumrichtung der Referenz selbst 6–39° neben A liegt. Wo es greift, wird die Gier meist schlechter (B1714 0,38 → 0,96°). Bei Restbias 0,1–0,5 °/s ist der Gyro allein genauer als das Raster. **Entscheidung: Raster nicht mit dem Gyro koppeln.**
- Gefunden: Z13 dreht den Vorgänger-Block (A6: Abschnitte 12–14 um 14°), der Abschnitt hinter dem Gyro-Schnitt bleibt liegen, und die Gyro-Relation bricht. Die Korrektur `gyroMit` (Gyro-Nachfolger bei einer Z13-Annahme mitnehmen) senkte in A6 den p90 an den Wänden von 93,5 auf 62,6 cm (`--nurRef` 62,6 auf 53,8). Sie liegt nur in der Kopie unter `scratchpad/wr/gyro-raster/`.

## Mehr Daten: Was heute passiert (T1 `--bis` auf Präfixen 30–100 %, 40 Läufe)
- Mehr Daten machen die Karte heute nicht besser: schlechter (A7, A8), stagniert (B1714), gemischt (A6, B1600). Alte Wände werden dabei kaum verzogen; neue Daten **verpuffen oder zerfallen**.
- **Verwerfen:** Erfassungen werden beim ersten `lmNeuZuordnen` nach dem Einbinden des lokalen Abschnitts dauerhaft frei (L = −1), im Median 28–36 s später. Ursache ist die Höhe: Auf Erfassungshöhe passen sie zur alten Wand (2–8 cm), neu auf die globale Höhe gehoben 15–76 cm daneben, über dem 10-cm-Tor (landmarken.js:968, :981–987).
- **Aufspalten (A7):** Wände 33 → 65, Außenring 16 → 33 Ecken (Wahrheit 14). Eine neue Wand entsteht ab 10 cm Abstand, zusammengeführt wird erst ab 5 cm (landmarken.js:66).
- Der einfache Eingriff, auf Erfassungshöhe zu heben, senkt „frei“ stark (61 → 9, 51 → 24, 157 → 39, 41 → 8, 147 → 36), macht die Karte aber nicht besser: die zusätzlichen Erfassungen landen im Aufspalten (A6 Doppelwände 5 → 28, Außenring fehlt danach).
- Kettenabschnitte sind in M6 bitgleich fest (ausgleich.js:245, :817). Neue gute Daten können ihre Lage nie korrigieren, und sie melden falsche Sicherheit (σ ≈ 0).
- Z13 läuft genau einmal vor dem unumkehrbaren `lmEinbinden` und wird nur 0–3-mal je Aufnahme angenommen.

## Regeln aus der Literatur (Quellen in paper/)
- IPC (Olivastri/Pretto 2024): eine neue Verbindung nur annehmen, wenn danach alle schon angenommenen Messungen im betroffenen Teilgraphen den χ²-Test bestehen; sonst zurücksetzen.
- ORB-SLAM3/Atlas: Zusammenführen erst nach Bestätigung (drei Schlüsselbilder). TACO prüft nur die jeweils letzten M Schleifen nach (die erste Fassung dieses Berichts hatte das falsch als dauernde Revision beschrieben).
- Unklare Bereiche lassen sich aus vorhandenen Größen ableiten: W.band, Wand von nur einem Abschnitt gesehen, Stufe lokal/lose/Kette, M4-Verhältnis (Annahmeschwelle 1,25), Degeneracy-Faktor λmin (Zhang 2016). Vorbilder zur Anzeige: magicplan (orange nicht geschlossene Wände), IntelliCap (Streifen auf fehlenden Bereichen).
- Heute zeigt der Worker die Karte nur als AR-Overlay mit ±2σ-Band; der 2D-Plan zeigt die alte Pipeline.

## Wiedererkennung live
- Die heutigen Bildkanten sind eine Momentaufnahme (`mlKanteMit` setzt g einmal, danach `A.fest`). Mit Gyro plus Bildkanten gegen Gyro allein: 50 Fenster, 4 besser, 9 schlechter, 37 gleich. Die schlechteren Fälle stammen vor allem aus A8 (die Aussage „alle in A8“ hielt der Gegenprüfung nicht stand), bis 170 cm.
- ORB in reinem JS (~120 Zeilen) erreicht die Passungsqualität von OpenCV (median 54 gegen 60 E-Inlier). Zeit auf dem Mac M4 Pro 11–19 ms je Bild; auf dem Pixel 9 Pro nicht gemessen (die Schätzung 25–40 ms ist unsicher, die frühere Angabe 0,3–0,8 s nirgends belegt).
- Kandidatensuche mit ORB-Bag-of-Words in Python: A6 11/11, A7 6/6, A8 20/22 Abschnittspaare mit Treffer in den Top-10. Einschränkung: Das Vokabular stammt aus derselben Wohnküche.
- Entwurf: Bildkante als robuster Faktor in M6 statt `A.fest`, mit Nullhypothese. Aufwand etwa 2–3 Wochen. Der Prüfstand muss dafür das Video behalten (`bruchSimulieren` setzt `video:null`).
- opencv.js hat keine `findEssentialMat`; eigener ORB wird empfohlen.

## Folge
Der wirksamste Hebel für „mehr Daten müssen verbessern“ sitzt in der Zuordnung nach dem Einbinden (Höhe, Tor 10 gegen 5 cm, feste Kettenabschnitte), nicht in einem neuen Sensor. Er lässt sich an den Präfixläufen messen.

## Zuordnung nach dem Einbinden: Schalter und Messung (29.10., nachmittags)
Gebaut hinter Schaltern, Vorgabe unverändert (aus): `karte.lm = {neu, erfassung, zusammen}` überschreibt die M5-Vorgaben je Lauf (`lmO` in raumskizze-landmarken.js, Option `lm` in M10). Neu ist `neu.hoeheEigen`: Erfassungen werden beim Neuzuordnen auf der Deckenhöhe des eigenen Abschnitts (`hLok.hC + ty`) gehoben statt auf der globalen `hC`. Die Schwellen `zusammen.drhoMax` (Vorgabe 0,05) und `erfassung.drho` (0,10) lassen sich ebenfalls je Lauf setzen. Messung: T1 auf 50/70/100 % der Aufnahme, 5 Aufnahmen, Skript `scratchpad/wr/zu/lauf.sh` und `sum.mjs`. Zahlen am Ende (100 %), Vorgabe → Variante:

| | frei (von Beob) | Doppelwände | Wände | Außenring-Ecken (Wahrheit 14) | Editdistanz |
|---|---|---|---|---|---|
| A6, hoehe + drhoMax 0,15 | 61 → 5 (138) | 5 → 8 | 16 → 23 | 12 → 14 | 3 → 3 |
| A7 | 51 → 32 (275) | 52 → 19 | 65 → 59 | 33 → 41 | 18 → 25 |
| A8 | 157 → 42 (192) | 1 → 4 | 8 → 22 | 4 → 14 | 10 → 3 |
| B1600 | 41 → 3 (161) | 6 → 7 | 23 → 26 | 14 → 23 | – |
| B1714 | 147 → 60 (195) | 0 → 4 | 9 → 32 | 13 → 23 | – |

- Die Höhe allein bringt die verlorenen Erfassungen zurück (frei sinkt auf ein Fünftel bis ein Zehntel), erzeugt aber Doppelwände (A6 5 → 28, B1714 0 → 12). Erst mit größerem Zusammenführ-Tor (0,15 m) und Zuordnungs-Tor sinken sie wieder.
- **Gemischtes Ergebnis, daher nicht eingeschaltet:** A6 und vor allem A8 (Außenring 4 → 14 Ecken, Editdistanz 10 → 3, monoton über 50/70/100 %) werden besser. A7 (Editdistanz 18 → 25) und B1600/B1714 (Ecken des Außenrings 13–14 → 23) werden schlechter. Die übrigen Doppelwände in A7 liegen 20–27 cm auseinander im selben Abschnitt, also keine Frage der Schwelle.
- `erfassung.minNutzer` ändert nichts am Ring: Die Ringbildung (M7 `umriss`) nimmt die zusätzlichen einzelnen Wände mit. Der nächste Hebel liegt dort (Wände mit einer einzigen Erfassung nicht zu Ringecken machen), nicht in M5.
- Die T2-Werte (Passung, IoU, „Beob gehoben“) sind hier nicht entscheidbar (Mehrdeutigkeit, A7 „Maßstab nicht gültig“) und wurden nicht verwertet.

### Ringbildung (M7): Einzelwände ausschließen
Schalter `umrissEingabe.minBeob` (M7, Vorgabe 0 = aus; M10-Option `umrissEingabe`): Wände mit weniger Beob als `minBeob` gehen nicht in den Umriss ein, weil die Höhenklasse jede Wand mit `cls 'wand'` bestätigt, auch wenn sie nur aus einer Erfassung besteht. Außenring-Ecken / Editdistanz bei 100 % (Wahrheit 14 Ecken), Vorgabe, dann Höhe + Tore 0,15 m (`hz15`) und `hz15` mit `minBeob 3`:

| | Vorgabe | hz15 | hz15 + minBeob 3 |
|---|---|---|---|
| A6 | 12 / 3 | 14 / 3 | 14 / 2 |
| A7 | 33 / 18 | 41 / 25 | 38 / 24 |
| A8 | 4 / 10 | 14 / 3 | 14 / 3 |
| B1600 | 14 / – | 23 / – | 15 / – |
| B1714 | 13 / – | 23 / – | 19 / – |

- `minBeob 3` holt von den Zusatzecken von `hz15` den größten Teil zurück (B1600 23 → 15, B1714 23 → 19, A7 41 → 38), ohne die Gewinne in A6 und A8 anzutasten. Allein, ohne `hz15`, bringt es wenig und schadet in A6 (`minBeob 3`: Editdistanz 3 → 6, nur 9 Ecken).
- Gegenüber der Vorgabe bleiben A7 (Editdistanz 18 → 24) und B1714 (13 → 19 Ecken) schlechter. In A7 wird die Karte auch in der Vorgabe mit mehr Daten schlechter (Editdistanz 6 → 11 → 18); das ist kein Fehler der neuen Schalter, sondern der Abschnittsdrift dort.
- **Entscheidung:** nicht als Vorgabe eingeschaltet. Es gewinnen A6 und A8 deutlich, es verlieren A7 und B1714 moderat; für eine Vorgabe fehlt eine Aufnahme mehr, auf der die Kombination bestätigt wird. Die nächste Wohnküchen-Aufnahme mit `?karte=1` entscheidet das.

## Erste Aufnahme mit echtem Gyro (29.10., Stand 15, Chrome 156, Pixel 9 Pro, 121 s)
- **Der Gyro kommt in AR an:** `imu-start` mit Fokus, kein `imu-steht`. 6194 Gyroscope-Werte (51 Hz, keine Lücke über 100 ms, 19 zwischen 50 und 100 ms) und 6812 devicemotion-Werte (60 Hz). Die Fokus-Falle (crbug 568009418) trat bei dieser Aufnahme nicht auf.
- **Fund:** `Gyroscope.timestamp` bezieht sich am Pixel auf die Gerätelaufzeit (ts ≈ 2,8·10⁸ ms), nicht auf den Seitenstart wie bei devicemotion. Das `t` der Aufnahme lag deshalb Tage neben der Posenzeit, T1 meldete „ohne verwertbaren Gyro“. Behoben in T1 (`imuGier`: t = ts/1000 + kleinster Versatz ta − ts/1000, wenn t nicht zu ta passt) und in der Seite (Stand 16, gleiche Regel).
- **Gyro gegen ARCore:** Rest je Zeile Median 0,09° / p90 0,30° (566 Zeilen), Achsen-Zuordnung [[0,0,-1],[0,1,0],[1,0,0]], Zeitversatz 170 ms. Die Drehung stimmt also über 100 ms mit ARCore überein.
- **Prüfstand mit dem echten Gyro** (simulierter Bruch, Wahrheit = Einheit; Gyro-Brücke + gedämpfte Vorhersage gegen heute):

| | Treffer (≤ 10 cm, ≤ 2°) | Gier Median | Wände Median / p90 |
|---|---|---|---|
| alle 20 Fenster, heute | 1 | 16,9° | 49,6 / 163,6 cm |
| alle 20 Fenster, Gyro | 7 | 2,9° | 30,3 / 91,5 cm |
| sauber 12 Fenster, heute | 3 | 16,9° | 51,7 / 123,0 cm |
| sauber 12 Fenster, Gyro | 7 | 1,2° | 6,4 / 91,5 cm |

- Die Gyro-Brücke trägt am echten Gerät: Der Gierfehler fällt von 17° auf 1–3°, der Wandfehler im Median auf 6–30 cm. Das bestätigt die nachgebildeten Zahlen der Nacht vom 27.10. (19–34 cm) und ist keine Obergrenze mehr. Offen bleibt das p90 (92 cm).
- **Die Brücke ist offline, nicht live.** Der Karten-Worker nutzt `imuPsi` noch nicht (nur T1). Nächster Schritt: `imuPsi` im Hauptfaden berechnen und an den Worker geben.
- Diese Aufnahme enthielt wenig echte Brüche (zwei `tracking-verloren`, sechs Schnitte, alle mit Gyro abgedeckt, davon fünf ohne Lücke), die Karte selbst ändert sich kaum (IoU 0,20 → 0,21). Der Gewinn zeigt sich am Prüfstand, nicht an der Gesamtkarte.

## Gyro-Brücke live (Stand 17)
- Die Seite rechnet `imuPsi` je Zeile im Hauptfaden (Gyro-Abtastwerte in `GYL`, Port von `imuGier`): Achsen-Zuordnung und Zeitversatz werden einmal aus den ersten 40 verfolgten Zeilenpaaren geschätzt (Wiederholung bei 150 und 300 Paaren, wenn der Rest über 1,1° liegt; Ereignis `imu-kalib` im Protokoll), danach je neue Zeile. Der Karten-Worker bekommt `schnitt:{gyroBruecke:true, vorhersage:'gedaempft'}`, wenn der Gyro an ist. Voraussetzung ist `?karte=1` (ohne Karte läuft kein Worker); die Aufnahme enthält den Gyro weiter in `imu.jsonl`.
- Gegen die echte Aufnahme vom 29.10. nachgerechnet (Seite gegen T1 `imuGier`, gleiche Zuordnung, Versatz 0,21 gegen 0,17 s): Unterschied je Zeile Median 0,10°, p90 0,31°. 61 Zeilen hat nur T1 (die ersten 40 Paare vor der Kalibrierung).
- `abReg.gyroMit` (Vorgabe an): Kettenabschnitte hinter Gyro-Schnitten gehen mit, wenn Z13 den Block davor dreht. Prüfstand A6 mit nachgebildetem Gyro: falsch 5 → 4, p90 an den Wänden 93,2 → 91,6 cm; auf der echten Aufnahme vom 29.10. unverändert.

## Zweite echte Gyro-Aufnahme (31.10., Stand 17, 175 s) und Korrektur der Live-Kalibrierung (Stand 19)
- Live-Kalibrierung hatte aus 37 fast ruhigen Paaren eine falsche Zuordnung gewählt (Rest 0,04°, weil bei Ruhe alle 24 Zuordnungen passen); T1 über die ganze Aufnahme fand die Einheitsmatrix. Die Brücke hätte mit falscher Achse gebunden.
- Korrektur: Kalibrierung nur aus Paaren mit Drehung (≥ 0,4° je Zeile), Wiederholung bei 40/100/200/400/800 Paaren, Annahme nur, wenn der Rest klein gegen die Drehung ist (Median ≤ 25 % des Median der Drehung und ≤ 1,1°), dazu laufende Überwachung (Median der letzten 60 Zeilen > 1,1° gegen ARCore → Zuordnung verwerfen, neu kalibrieren, Ereignis `imu-kalib-verworfen`). Gegen beide echten Aufnahmen nachgerechnet: Zuordnung wie T1, Unterschied je Zeile Median 0,03–0,08°.
- Prüfstand mit dem echten Gyro der Aufnahme vom 31.10. (Wohnküche): Gier Median 14,6° → 0,8°, Wände Median 70 → 21 cm (alle 20 Fenster), Treffer 1 → 6; sauber 8 Fenster: 70 → 35 cm. Zweite Bestätigung der Brücke.
- Die Gesamtkarte bleibt schlecht (IoU 0,27, Fläche −72 %, Abschnitte meist „locker“); das liegt an den fehlenden Verbindungen über die Pausen und an der Zuordnung, nicht an der Drehung.

## Querformat und Overlay (31.10., Stand 21-23)
- Stand 21: Das Protokoll trägt die Live-Kalibrierung (`mess.gyLive`) und je Abschnitt, ob der Gyro ihn gebunden hat (`karte.letzte.gyro`); die Aufnahme ist für diese Frage nicht mehr nötig.
- Stand 22: Haken „Querformat“; AR startet nur quer (Chrome legt die Ausrichtung beim Sitzungsstart fest). Erste Aufnahme quer (11:37, anderer Raum, 34 m², H 2,61): Kamerabild 1920×861, also die 69,6° der langen Achse quer. Gegen die Hochformat-Aufnahme 10:25 (Wohnküche): Bilder ohne Ortung 19 % → 0,7 %, Ortungslücken 7 → 1, Segmente je Bild 32 → 66, Raum nach 97 s selbst geschlossen. Raum verschieden, darum kein sauberer Vergleich; die Wohnküche quer steht aus.
- Quellenvergleich (6 Aufnahmen 25.-31.10., Gyro-Brücke an, f = 1, `raumskizze-ablation.mjs`): Kanten aus dem ganzen Bild allein (`segmente`) ergeben in keiner Aufnahme einen Export (5 von 6 ganz ohne Kern). `beide` gegen `erfassungen`: verbundene Abschnitte gleich oder knapp mehr (5/6/8/12/4/5 gegen 4/5/7/9/4/5), Rechenzeit 20-40-fach. Lage- und Flächenwerte nicht verwertbar, die T2-Passung ist in allen Läufen mehrdeutig (1,00-1,11). Folgerung: Die Karte bleibt in der Vorgabe bei den Erfassungen am Fadenkreuz; die Kanten des ganzen Bilds gehen vorerst nur in die Anzeige.
- Stand 23 (Rückmeldung zu Screenshots quer): Im automatischen Modus zeigt das AR-Bild keine Historie der Erfassungen mehr (sie lag nach Drift und neuer Ortung neben der Kante), sondern alle Kanten des jüngsten Bild-Worker-Ergebnisses (Decke hellblau, Senkrechte und Boden blass), drehungskompensiert mit der Pose des Quellbilds. Skizze eine dünne weiße Linie, rot gestrichelt nur, was fehlt (Karte: zwischen gesehenem Ende und Ecke ab 0,3 m). Querformat: Knöpfe als Spalte rechts, Messwerte und Prüfknöpfe erst nach Antippen der Kopfzeile; frei fürs Kamerabild statt 42 % jetzt etwa 66 % der Fläche.
