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
