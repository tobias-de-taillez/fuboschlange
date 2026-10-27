# Nachtbericht 26./27.10.2026: Abschnitte nach ARCore-Brüchen verbinden

Auftrag: „Continue bis morgen 10 Uhr früh. Immer weiter verbessern!“ Ziel war das Hauptproblem aus Doku 12.5: Nach einem ARCore-Bruch liegen die Abschnitte der Karte falsch zueinander. Die Einzelheiten mit allen Zahlen stehen in `2026-10-24-kamera-raumerfassung-android.md`, Abschnitt 12.8. Dort ist alles in zwei Gegenprüfungen (106 und 128 Aussagen) gegen die Rohdaten nachgerechnet; die Recherche zum Gyro hatte eine eigene.

## Kurz

- **Das bisherige Maß war falsch.** Das Orakel (Lage je Abschnitt aus der Wahrheit) ist in der Wohnküche mehrdeutig. Die „2,3 / 5,8 cm mit Orakel“ aus 12.5 waren Selbstpassungen, das ist dort korrigiert. Neues Maß ist ein **Prüfstand**: Mitten in einem Abschnitt wird ein Stück weggeschnitten, danach beginnt ein neuer ARCore-Rahmen. Die Wahrheit ist damit bekannt (`raumskizze-pruefstand.mjs`).
- **Heute** liegt ein Abschnitt nach einem harten Bruch an den Wänden im Median 0,7–1,7 m daneben (Wohnküche; im zweiten Raum 0,2–0,5 m). Ursache ist vor allem die Drehung in der Lücke (7–20° im Median je Aufnahme).
- **Größter gemessener Hebel: die Gyro-Brücke.** Die Drehung in der Lücke kommt dabei aus dem Gyro, dazu eine gedämpfte Vorhersage der Kamerabewegung. An den Wänden liegt der Median dann bei 19 / 34 / 21 cm (A6 / A7 / A8) und 3 / 22 cm (B1600 / B1714), statt 154 / 168 / 70 bzw. 19 / 49 cm. **Das gilt nur mit einem idealisierten, aus ARCore nachgebildeten Gyro**, also als Obergrenze. Einen echten Gyro hat bisher keine Aufnahme.
- **Live ist nur die Aufzeichnung**, die Brücke selbst nicht: Mit `?imu=1` zeichnet die Seite Gyroscope und devicemotion auf. Ob die Brücke trägt, zeigt erst die nächste Aufnahme. Die Auswertung dafür geht in einem Befehl.
- **Recherche:** Chrome schaltet die Sensoren in AR nicht ab. Zeigt Chrome bis M156 (also auch das 155 auf dem Pixel) beim Start aber einen eigenen Berechtigungsdialog, verliert die Seite den Fokus, und der Gyro liefert stumm nichts (crbug 568009418; laut Code ab M157 behoben, ungeprüft). Ein Tippen aufs Kamerabild hilft vermutlich. Die Seite warnt jetzt in diesem Fall.

## Live (https://raumaufmass.irazari-te.ch/raumskizze-probe.html)

| Stand | Inhalt |
|---|---|
| 8 | `?imu=1`: Gyroscope (60 Hz) und devicemotion in `imu.jsonl`, ohne Messmodus; Statuszeile „IMU“ |
| 9 | Startseite: „Karte aus den Erfassungen, mit Gyro“ (`?karte=1&imu=1`) und „ohne Gyro“ (`?karte=1`); neue Kartenschalter, alle aus |
| 10 | AR-Statistik mit IMU-Zählern, Warnung in der Zusammenfassung; **Z13 per Vorgabe aus** (zurückgenommen in 11) |
| 11 | **Z13 wieder an**: Die Abschaltung stützte sich auf einen verzerrten Prüfstand (siehe unten) |
| 12 | IMU-Wache: Fokus und Sichtbarkeit im Protokoll; nach 1,5 s ohne Gyro-Wert der Hinweis „bitte einmal aufs Kamerabild tippen“ |
| 13 | Die Wache unterscheidet einen Gyroscope-Fehler (Sensoren blockiert): dann Hinweis auf die Website-Einstellung „Bewegungssensoren“ |

Ohne `?imu=1` verhält sich die Seite wie vor dieser Nacht. Alle neuen Kartenverfahren sind Schalter und stehen aus.

## Was gemessen ist, und wie belastbar

**Prüfstand, nachgebildeter Gyro (Obergrenze):** Gyro-Brücke plus Vorhersage siehe oben, Treffer (≤ 10 cm und ≤ 2°) 13 von 50 bzw. 19 von 36 Fenstern statt 1 bzw. 2. Die Brücke bindet B direkt an A; für sie misst der Prüfstand unverzerrt.

**Geprüft und ausgeschaltet gelassen:**
- **Gier-Raster** (Abschnitt auf die Raumrichtung drehen): Bei Drehungen über etwa 45° wählt es die falsche Vierteldrehung. In B1714 versagt es (154 cm), in B1600 aus demselben Raum ist es das beste Verfahren ohne Gyro (9 cm).
- **Bildkanten** (Wiedererkennung im Video, offline mit OpenCV): Sie binden 13 von 50 Fenstern, davon 8 auf 2–13 cm und unter 4°. Sie wirken nur, wenn M6 den Abschnitt festhält. Live wären es Tage Arbeit (ORB im Worker).
- **Achsen-Registrierung:** trägt nicht; in B1600 nimmt sie falsche Versätze an.
- **`bodenKette:false`:** Der A8-Maßstab steigt von 0,49 auf 0,96, aber A6 verliert seinen Außenring, solange Z13 an ist.

**Zurückgenommen, Z13:** Am Prüfstand sah die Nachregistrierung Z13 schädlich aus, darum war sie in Stand 10 aus. Eine unabhängige Gegenprüfung von 106 Aussagen hat gezeigt, dass der Test dafür verzerrt war: A hing über eine Bindung an einem Kettenabschnitt, und Z13 legte den Block reproduzierbar auf den Kern. Auf den wirklich sauberen Fenstern nimmt Z13 bei 3 von 8 an (an den Wänden einmal besser, zweimal schlechter), mit dem Bruch im Kern bei 1 von 23. Für ein Urteil sind das zu wenige Fälle. Darum ist Z13 seit Stand 11 wieder an, wie vorher.

**Echte Aufnahmen Ende zu Ende:** Die Gesamtpassung an die Wahrheit ist in A6–A8 mehrdeutig (1,00–1,11). Unterschiede dort sind kaum entscheidbar. Die gedämpfte Vorhersage allein verbessert A6 (Fläche −23 % statt −36 %) und verschlechtert A7 leicht; sie bleibt aus.

## Für die nächste Aufnahme

1. Vorher `chrome://version` notieren. Die Aufnahmen vom 26.10. liefen mit Chrome 155; bis M156 gilt die Fokus-Falle, ab M157 vermutlich nicht mehr (aus dem Code abgeleitet). Für die Seite **AR und Kamera dauerhaft erlauben**, damit kein Dialog kommt. Kein DevTools und kein `chrome://inspect` verbinden.
2. „Karte aus den Erfassungen, mit Gyro“, Laser-H eingeben, Wohnküche mindestens 8 min. In der AR-Statistik muss „IMU … Gyro“ hochzählen. Kommt „Gyro liefert keine Werte“, einmal aufs Kamerabild tippen.
3. Einmal die Kamera zuhalten und sich dabei um mehr als 45° drehen. Einmal 10–30 s still warten und dann zur letzten Ecke zurück.
4. Mit dem Laser die Stürze zum Wintergarten und die Decke an einer zweiten Stelle messen.
5. Auswertung in einem Befehl (für eine Aufnahme von 2,5 min etwa 100 s, für 8 min einige Minuten):

```bash
scripts/raumskizze-gyro-pruefen.sh aufnahme.tar protokoll.json
```

Das zeigt die Chrome-Version und die IMU-Ereignisse der App, die IMU-Zeile (Rate, Lückenverteilung, wie viele Pausen- und reloc-Schnitte ein Gyro-Wert abdeckt, Achsen-Zuordnung, Zeitversatz, Rest gegen ARCore) und T1 ohne und mit Gyro-Brücke. Mit T1 `--imu-luecke` lässt sich die Lückengrenze (Vorgabe 50 ms) ändern. Dazu kommt der Prüfstand mit dem **echten** Gyro. Trägt die Brücke dort, ist der nächste Schritt, sie live zu schalten (imuPsi im Hauptfaden an den Karten-Worker).

## Offen

- Ob der echte Gyro während AR auf dem Pixel kommt, mit welcher Rate und Lückenquote.
- Die Verschiebung über Pausen bleibt der Rest (Median 20–34 cm in der Wohnküche, 3–22 cm im zweiten Raum): Bild-Wiedererkennung live, ein Faktor für Bildkanten in M6, eventuell der Beschleunigungssensor für kurze Lücken.
- Z13 braucht einen Test im absoluten Rahmen.
- Deckenhöhe je Abschnitt aus ARCore-Ebenen statt aus der Kette (A8).

## Commits und Daten

Alles ist auf `feat/raumskizze-kamera` committet, ohne `git push`. Daten (Aufnahmen, Wahrheit, Bildkanten, Prüfstand-Läufe) sind nicht im Repo getrackt: Die Wahrheit und zwei ältere Aufnahmen liegen ungetrackt im Arbeitsverzeichnis, die übrigen in ~/Downloads und in den Scratchpads.
