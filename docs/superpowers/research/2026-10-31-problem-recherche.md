# Raumskizze: Probleme, Wissenschaft, Best Practice, Machbarkeit (Recherche 31.10.2026)

## 1. Ziel und Methode

Ziel: Für jedes der 18 bekannten Probleme der Raumskizze (Seite Stand 26) klären, was die Wissenschaft sagt, was Best Practice in Industrie und Open Source ist und ob das auf unserem Stack machbar ist (Chrome 156, WebXR `immersive-ar` auf ARCore, JavaScript im Karten-Worker, Pixel 9 Pro). Reihenfolge der Arbeit: Wissenschaft zuerst, dann Best Practice, dann Machbarkeit. Die Abschnitte pro Problem stehen unten im Teil B (Themenblöcke 01 bis 14) (diese Datei fasst sie zusammen und leitet nichts Neues her). Ein Problem kann in mehreren Dateien vorkommen; Widersprüche dazwischen stehen in Abschnitt 4.

Legende: **[V]** = Quelle (Kernabschnitt) gelesen und geprüft, **[A]** = nur Abstract, Dokuseite oder Suchtreffer gesehen, **[Vermutung]** = nicht belegt. Aufwandsangaben sind durchgehend Schätzungen aus den Abschnitten, nicht gemessen. Wo ein Abschnitt keinen Aufwand beziffert, steht "nicht beziffert".

Hauptbefund aus der Architekturfrage (14): Die Pose ist im Web und nativ dieselbe (Chrome-WebXR läuft auf ARCore). P1, P2, P4, P5, P7, P8 (Ursache), P12 und P16 sind Auswertungs-, Bedienungs- und Prüfstandsprobleme, keine Plattformgrenzen.

## 2. Tabelle aller 18 Probleme

Reihenfolge nach Kritikalität (kritisch P1 bis P7, hoch P8 bis P13, mittel P14 bis P18).

| Nr | Problem | Kritikalität | Stand der Wissenschaft (ein Satz) | Best Practice (ein Satz) | Auf unserem Stack machbar? | Empfehlung | Aufwand Tage |
|---|---|---|---|---|---|---|---|
| P1 | Abschnitte nach ARCore-Ortungsbrüchen zusammensetzen | kritisch | Roll/Pitch sind aus der Schwerkraft bekannt, also 4-DoF-Pose-Graph mit robusten Kanten (Max-Mixture, GNC, IPC/PCM); für ARCore selbst zeigt VI-SLAM2tag, dass je Teiltrajektorie eine eigene Abbildung den Fehler von 2,80 auf 0,53 m senkt [V]. | RoomPlan verlangt eine durchgehende oder relokalisierte Sitzung und schickt den Nutzer an die letzte Stelle zurück; kein Android-Kamera-Produkt hat das öffentlich gelöst [V/A]. | Teilweise: Löser und Faktoren laufen in JS (unter 100 Unbekannte), aber Lücken von 3 bis 10 s ohne gemeinsame Wand und Verschiebung entlang einer nur einseitig gesehenen Wand sind prinzipiell nicht beobachtbar. | Zuerst messen: Kette weich statt σ ≈ 0, Brückenkante mit Max-Mixture, Gyro-/Ortsfaktor, IPC-/TACO-Annahme statt Einmal-Z13; Geometrie-Fingerabdruck als Kandidat; SE-Sync, Jigsaw, Atlas verwerfen. | 8 bis 12 (Messversuch 2 bis 3, Umbau 3 bis 5, IPC/TACO 2 bis 3, Standpunkt 1); Fingerabdruck 3 bis 5; ORB als zweite Quelle 14 bis 21 |
| P2 | Rückkehr zur Anfangswand (Ringschluss) | kritisch | Ringschluss ist ein Auswertungsthema (Hypothese-und-Prüfung, Paar-Konsistenz/PCM, Schlussfehler nach Bowditch); bildbasierte Ortserkennung braucht ein Vokabular, das wir nicht haben [A]. | RoomPlan/Matterport schließen über Tiefe, Kamera-only-Apps lassen den Nutzer abschließen (magicplan: Ecken manuell). | Ja: reine Geometrie im Worker, unter 1 ms; Bildweg (ORB gegen 10 bis 20 Start-Schlüsselbilder) nur als gemessene Option. | Messen, dann machen: Variante B (Normalenwinkel + senkrechter Abstand, Toleranz wächst je Bruch), dann dreiteiliger Abschlusstest, dann Paar-Konsistenz. Ziel 8 von 10 Treffern bei 0 Fehltreffern. | 4 bis 6; ORB-Bildweg zusätzlich 3 bis 5 |
| P3 | Kein verlässlicher Genauigkeitsmaßstab | kritisch | Benchmarks nutzen unabhängige Laser-/Tachymeter-Wahrheit (LaMAR, ADVIO); ARCore-basierte Grundrisse (GRIHA) liegen bei 3,1 bis 3,3 % Flächenfehler [V Teile]. | Hersteller messen gegen Laser-Distanzmesser (Polycam ±½ Zoll, eigene Angabe) [A]. | Ja: Prozess- und Metrikfrage (Node-Skripte); Laser-Wahrheit von Hand, Web-Bluetooth-Laser im Browser möglich, auf Android-Chrome mit unserem Laser ungeprüft. | Machen: registrierungsfreie Hauptmetriken (Eckenzahl, zyklische Editierdistanz, Wandlängen), starre Ausrichtung ohne Spiegelung als Nebenmaß, 5 bis 8 Räume mit 6 bis 10 Laserwerten. | 4 bis 6 (1 + 1 bis 2 + Messprotokoll 1 bis 1,5, plus Aufnahmen); Laser-Anbindung nicht beziffert |
| P4 | Auswertung/Topologie instabil (4 Erfassungen mehr kippen 6 gegen 17 Ecken) | kritisch | Kandidaten erzeugen, global auswählen (Cabral/Furukawa 2014, Floor-SP, PolyFit); M7 (Min-Cut) tut das schon; CROPS liefert Strafen-Suche für PELT [A/V]. | RoomPlan klassifiziert per ML, magicplan lässt Ecken bestätigen. | Ja: Problem klein (10 bis 40 Hypothesen), Mac-Zeit 10 bis 27 ms, Pixel nicht gemessen. | Kippquote als Kennzahl (Leave-one-out), dann CROPS für β (1 Tag), weiche Tore und "kein gültiger Umriss" statt kreuzendem Ring (2 Tage); Ziel ≥ 95 % unveränderte Topologie. | 3 bis 4 (mit Eckenzahl-DP bis 6) |
| P5 | Kanten als Landmarken: neue Karte nicht besser | kritisch | Linienbasierte VIO (PL-VINS, StructVIO) hilft in texturarmen Szenen, setzt aber eigene Pose-Schätzung voraus; bei ARCore-Pose kein direkter Gewinn [A]. | OpenVINS (GPL-3), Basalt, ORB-SLAM3 sind nativ/Desktop, kein gepflegter Android-Port [A]. | Teilweise: strenge Höhenklasse und σ-Gewichte laufen im Worker; Ganzbild-Kanten als Hauptquelle (20 bis 40-fache Rechenzeit, kein Grundriss in 6 Aufnahmen) nicht. | Kanten des ganzen Bilds als Hauptquelle verwerfen; Höhenklasse streng (|dH| ≤ k·sdH), σ-Gewichtung, danach Teilmenge messen; eigene VIO verwerfen. | 3,5 bis 5 (1 bis 2 + 0,5 + Teilmenge 2) |
| P6 | Falsche Kanten (Leiste, Stuck, Schiene, Schrank, Rahmen) | kritisch | Semantik für Wand/Decke ist lernbasiert (HorizonNet u. a.), Panorama-Eingabe passt nicht zu 34,6°-Ansichten; zu Stuck/Gardinenschienen fand sich kein Paper [A]. | ARCore Scene Semantics nur Außenbereich, 11 Klassen ohne Wand/Decke [V]; RoomPlan klassifiziert über LiDAR [A]. | Teilweise: Heuristiken (Kantenpolarität, Parallaxe-Höhe, Deckenabstand) ja; Segmentierungsnetz im Browser auf dem Pixel unbelegt (mobil 7,8 bis 15,8-fach langsamer als nativ [A]). | Zuerst messen: Kantenpolarität (Gegen-Sprung der Leiste, Hypothese), Parallaxe-Höhe als Prüfung der Erfassung; Segmentierung nur als Offline-Obergrenze. | 4 bis 7 (1 bis 2 + 3 bis 5); Segmentierung 5 bis 10 nur bei Bedarf |
| P7 | Raumhöhe und Maßstab ohne Laser (2,16 bis 2,61 m, Scheinminimum) | kritisch | Maßstab kommt aus der VIO (Beschleunigung); Tiefe aus Bewegung hilft nur mit Textur, weiße Decken liefern Konfidenz 0 [V Doku]. | magicplan: Höhe eintippen oder Laser; Depth API am besten 0,5 bis 5 m [V]. | Teilweise: Eintippen und Zwei-Punkte-Höhe (Wandfuß tippen, ±5 cm erwartet [Rechnung]) ja; Plane Detection/Raw Depth an der Decke nein; Web-Bluetooth-Laser nur per Gerätetest gesichert. | Drei Stufen: Eintippen/Laser zuerst, Zwei-Punkte-Höhe messen, BLE-Laser (Bosch zuerst) als Erweiterung nach Eintages-Test. Ohne Laser realistisch ±5 bis 10 cm in H. | Zwei-Punkte 2 bis 3; Parallaxe-Führung 1; Bosch-Pfad 3 bis 5 (Leica +2) |
| P8 | Ortungsverluste von ARCore (Hochformat 19 %, Quer 0,7 %) | hoch | ARCore versagt bei schneller Bewegung und schlechtem Licht, Relokalisierung ist die instabile Zeit [V Teile]; Ursache Hochformat gegen Querformat ist nicht geklärt (Hypothesen Sichtfeld, Haltung, Raum, Last). | `TrackingFailureReason` (5 Gründe) und Festfokus laut ARCore-Doku [V]; Anleitung zu langsamerer Bewegung und mehr Struktur im Bild. | Teilweise: Gründe sind per WebXR nicht abfragbar, Fokus und Bildrate nicht wählbar; Nutzerführung nach Drehrate, Laplace-Varianz, Nickwinkel im Web machbar. | Messen, dann führen: erst zählen, ob `emuliert`/`ref-reset` je auftreten (bisher 0), dann Bildmerkmale gegen Verlust auswerten, dann Live-Führung im A/B. | Messung und Merkmale 0,5; Live-Führung nicht beziffert |
| P9 | Kamerabild zu schmal (34,6° im Hochformat, Chrome beschneidet) | hoch | Großes Sichtfeld hilft Odometrie und Schleifenschluss, unsere Ablation zeigt aber keinen Effekt auf die Abschnittsverbindung (14 bis 35°). | Pixel 9 Pro hat Ultraweitwinkel 123° [A]; ARCore `CameraConfig` dokumentiert keine Ultraweitwinkel-Wahl [V]. | Im Web nein (Beschnitt nicht abschaltbar, keine Linsenwahl); nativ offen und nur am Gerät klärbar. | Messen, dann verwerfen oder Querformat als Standard: Querformat-Vergleich in der Wohnküche, `kamera-messung.html` am Pixel; nativer Companion nur bei klarem Effekt. | 0,5 + 0,5 (Messungen); nativer Companion 15 bis 25 |
| P10 | AR-Bild voller Striche, Bildschirmnutzung | hoch | UI-Thema; Belege nur aus Produkten (IntelliCap: Streifen, Apple: eine Instruktion zur Zeit). | magicplan zeigt offene Wände orange, RoomPlan eine Textinstruktion [A/V]. | Ja: reines HTML/Canvas im `dom-overlay`. | Machen, klein: Halo/Kontur oder Farbe nach Hintergrund, Abdeckung als Winkelring statt zusätzlicher Linien; A/B gegen reduziertes Overlay. | 1,5 (0,5 + 1) |
| P11 | Live nur eine Kante am Fadenkreuz, Fadenkreuz ist Pflicht | hoch | Kanten aus dem ganzen Bild brauchen robuste Zuordnung (LIMAP, DeepLSD); bei uns allein kein Grundriss. | magicplan: Nutzer fährt Wände ab; RoomPlan automatisch, LiDAR nötig. | Teilweise: breiter Fangbereich (Snap-to) ja; automatische Ganzbild-Erfassung nein (Rechenzeit, Kantenwahl hängt an P6). | Fangbereich aus vorhandenen Aufnahmen nachrechnen (2°, 5°, 10°), bauen wenn Störeranteil bei 5° unter etwa 10 %; Fadenkreuz bleibt Kern. | 1 bis 2 |
| P12 | Handhaltung zu hoch (Kamera 44 bis 60 cm unter der Decke) | hoch | Führung durch UI (IntelliCap); keine Plattformabhängigkeit. | Apple RoomPlan: kurze Einzelinstruktionen, Sitzung unter etwa 5 Minuten [V/A]. | Ja: Kamerahöhe über Boden ist aus dem Bodenanker bekannt. | Messen, dann weichen Hinweis: Kamerahöhe gegen Grundrissfehler auftragen, Schwelle nur bei erkennbarem Knick; Hinweis über Kamerahöhe statt Deckenhöhe, weil P7 unsicher. | 0,5 bis 1 |
| P13 | Gyro/IMU: Zeitbasis, Achsen, Fokus nach Berechtigungsdialog | hoch | Zeitversatz muss online geschätzt werden (VINS-Mono-Linie, Qin/Shen 2018) [A]; unser Versatz von 170 ms ist im Rahmen. | Android: Raten über 200 Hz nur mit Berechtigung [V]; Chrome Generic Sensor kappt auf 60 Hz [V]. | Ja: läuft live (Rest Median 0,09°, p90 0,30° gegen ARCore); offen die Fokus-Falle (crbug 568009418). | Machen/halten: Versatzstreuung über die Aufnahmen auslesen (Ziel unter 30 ms, Rest unter 0,3°), Fokus-Wache bis zur Bestätigung von M157. | 0,5 |
| P14 | Einstellungen nur per URL | mittel | Keine; reine UI-Regel. | Optionsregister mit Haken, Prüfoptionen versteckt. | Ja: `localStorage` mit `try/catch`, kein Server nötig. | Machen: Optionsregister, Haken für Nutzeroptionen, alte URL-Parameter nur lesend für den Prüfmodus. | 1 bis 1,5 |
| P15 | Große Aufnahmen (31 bis 44 MB) lassen sich schwer übertragen | mittel | Keine. | ARCore Recording speichert H.264 mit 640x480, Größe nicht dokumentiert [V/A]. | Ja: Tiefe nur auf Haken (spart etwa 26 %), Web-Share, niedrigere Videorate. | Machen: Tiefe auf Haken mit Byte-Mischung und gzip, Teilen-Knopf, Ratenreihe offline (0,5/0,8/1,5 Mbit/s) mit `captureEdge`-Vergleich; Ziel unter 10 MB. | 1,5 (je 0,5); Fensteraufnahme +2 bis 3 |
| P16 | Prüfwerkzeuge selbst fehlerhaft | mittel | Benchmarks nutzen unabhängige Referenz-Trajektorie (LaMAR, ADVIO). | ARCore Recording & Playback macht Sitzungen wiederholbar [V]. | Ja: Node-Tests (`node:test`); Nulltest und eingespritzte Verschiebung als Abnahme. | Machen vor jeder weiteren Prüfstand-Entscheidung: Nulltest (Schnitt ohne Lücke = Differenz 0) und Injektionstest (30 cm/10° auf ±1 cm/±0,5°). | 1 bis 1,5 (Schritt 1 und 2) |
| P17 | Rechenzeit im Browser (1920 px, Ganzbild-Kanten) | mittel | WebAssembly im Mittel 45 bis 55 % langsamer als nativ, Spitze 2,5-fach [A]; Browser-Inferenz mobil 7,8 bis 15,8-fach langsamer [A]. | Bildverarbeitung in WebXR auf WebGL2/GLSL; `XRGPUBinding` hat kein `getCameraImage`. | Ja: Verkleinern/Luma im Shader, asynchrones Lesen; WASM für ELSED erst bei Worker über 60 ms. | Messen, dann bauen: Sitzung `?ds=1920` mit Zeitstempeln (3 Minuten), nur bei `readPixels` über 8 ms GPU-Verkleinerung; Ganzbild-Kanten nicht weiter verfolgen. | Messung 1 (nicht beziffert); GPU-Verkleinerung 2 bis 3; WASM 3 bis 5 |
| P18 | Ohne Nutzen untersucht (Beschleunigungssensor, Bodenkanten, Sichtfeld) | mittel | Doppelte Integration driftet quadratisch; nur zweiseitig mit Online-Bias lohnend (6 s: 12 statt 42 cm gemessen). | Produktive Systeme fusionieren IMU im Filter (MSCKF, ARCore intern) [A]. | Ja (Verwerfen): Roh-IMU nativ ändert die Messung nicht (Rauschen 0,3 cm bei 3 s, Offset dominiert). | Verwerfen; zwei Ausnahmen messen (Beschleunigung nur zweiseitig ab 6 s, Bodenkante nur wo sichtbar); `?imu=1` und Magnetometer nur mitschreiben. | 0,5 (Magnetometer-Mitschrift) |

## 3. Roadmap (5 Schritte)

**Schritt 1: Prüfstand vertrauenswürdig machen (P16, P3).** Nulltest und Injektionstest, registrierungsfreie Metriken, danach Laser-Wahrheit in 5 bis 8 Räumen. Begründung: Abschnitt 12 stellt fest, dass alle Prüfstandzahlen seit Stand 10 (Z13, Gyro-Brücke 14,6° auf 0,8°) bis zum bestandenen Nulltest als ungeprüft gelten. Jede weitere Entscheidung in Schritt 2 bis 4 hängt daran. Aufwand etwa 1 bis 1,5 Tage für Nulltest und Maße, dazu die Aufnahmen.

**Schritt 2: Billige Messungen auf vorhandenen Aufnahmen (parallel, ohne neuen Code im Produkt).** Kippquote (P4), Kantenpolarität (P6), Rückkehr-Varianten A/B/C (P2), Zählung von `emuliert`/`ref-reset` und Bildmerkmale gegen Verlust (P8), Versatzstreuung (P13), Fangradius (P11), Kamerahöhe gegen Fehler (P12), Ratenreihe und Profil (P15, P17), Vibration gegen Posensprünge (aus 11, ARCore rät von Vibration ab). Begründung: Jeder Abschnitt nennt eine entscheidende Messung, die ohne Gerät auskommt. Abhängigkeit: Schritt 1.

**Schritt 3: Messungen am Gerät (Pixel 9 Pro).** Querformat gegen Hochformat in derselben Wohnküche (P8, P9), `kamera-messung.html` (P9), Web-Bluetooth-GATT innerhalb einer `immersive-ar`-Sitzung (P3, P7), `XRPlane`-Polygone (P5), nativer 1-bis-2-Tage-Spike mit ARCore-Beispiel, Aufzeichnung und `getSupportedCameraConfigs` (14: Entscheidungsregel Verlustanteil Hochformat nativ unter 5 % statt 19 % oder deutlich breitere Config). Begründung: Die Plattformfrage entscheidet nur der Spike; sie betrifft laut 14 nur P8, P9, P15, P17 teilweise.

**Schritt 4: Karte und Bedienung im Web bauen, in der Reihenfolge der Messergebnisse.** (a) P1: Kette weich, Brückenkante mit Max-Mixture, Gyro-/Ortsfaktor, IPC/TACO-Annahme; (b) P5: strenge Höhenklasse und σ-Gewichte vor der Karte (Abschnitt 05: zuerst Abschnittsverbindung P1, dann die Kantenteilmenge); (c) P2: Rückkehr nach Variante B/C; (d) P4: CROPS und weiche Tore; (e) kleine UI-Punkte P10, P11 (Fangbereich), P12, P14, P15. Begründung: Alles läuft in JS im Worker, keine neuen Bibliotheken. Die harte Grenze bleibt: Lücken von 3 bis 10 s ohne gemeinsame Wand und einseitig gesehene Wände löst kein Solver, dort hilft nur ehrliche Unsicherheit und Nutzerführung (zurück an die letzte Stelle).

**Schritt 5: Nativ-Entscheidung nach Spike (14: M3).** Nur wenn der Spike bessere Ortung oder breiteres Bild zeigt, ein Hybrid-Aufnehmer (Pose, Bilder, IMU, Gründe aufzeichnen, Auswertung im Web). Nicht tun (14): vollnativer Scanner, eigene VIO, Scene Semantics, Raw Depth als Maßstab. Begründung: P1 bis P7 lösen sich nativ nicht von allein; ARCore-Sprünge bleiben in beiden Welten.

Nebenbedingungen: P12 (Hinweis auf Deckenabstand) hängt an einer verlässlichen Höhe aus P7. Der Fokus-Bug der Gyro-Sensoren (P13) wird vom geplanten Chrome M157 (Stable am 3.11.2026 laut Abschnitt 08, Behebung nicht belegt) möglicherweise gelöst.

### Widersprüche zwischen den Abschnitten

1. **Bildmerkmale und Bildkanten.** 01 verwirft Atlas-Wiedererkennung ("kein Vokabular, 2 bis 3 Wochen, Bildkante lohnt erst danach"). 02 empfiehlt, nach der Geometrie ORB aus dem Video als zweite Quelle zu messen und für P2 einen Bildweg als zweiten Auslöser zu prüfen. 03 verwirft für P2 jede bildbasierte Ortserkennung. 14 nennt in Meilenstein M2 "Bildkante als Faktor". 13 rät, Ganzbild-Kanten nicht weiter zu verfolgen, 05 erlaubt nur eine Teilmenge. Offen bleibt, ob Bildinformation überhaupt in die Abschnittsverbindung gehört; die Messungen in 02 (Abdeckung 16 bis 21 % der Paare) und 05 (Teilmenge) entscheiden.
2. **Ursache Hochformat gegen Querformat.** 14 behandelt das schmale Bild als teilweise plattformbedingt und hofft nativ auf ungeschnittenes Bild (Vermutung); 09 argumentiert, ARCore tracke ohnehin auf einem eigenen 640x480-Strom, Chromes Beschnitt betreffe nur die Seite, und nennt als Hypothesen Sichtfeld in Gierrichtung, Haltung, Raum und Last. 10 erwartet nach der Ablation keinen Sichtfeld-Hebel für die Abschnittsverbindung. Die Entscheidungsregel des Spikes in 14 (Verlustanteil nativ unter 5 %) ist damit nur aussagekräftig, wenn die Ursache nicht Haltung oder Raum ist.
3. **Aufwand nativ.** 14 beziffert den Hybrid auf 2 bis 3 Wochen; 10 den nativen Companion für Ultraweitwinkel auf 15 bis 25 Tage bei hohem Risiko. 14 wiederum findet keine dokumentierte Ultraweitwinkel-Wahl in `CameraConfig`.
4. **Beschleunigungssensor (P18).** 05 empfiehlt, die zweiseitige Brücke ab 6 s Lücke noch zu messen; 08 und 14 empfehlen zu verwerfen, solange die Verlustrate im Querformat unter 1 % liegt. Beide nennen dieselbe Messung mit `?imu=1` (mindestens 5 Brüche, Versatz unter 20 cm).
5. **Reihenfolge Prüfstand.** 14 sieht P16 durch Recording und T1-Prüfstand praktisch abgedeckt und empfiehlt Laser-Wahrheit; 12 sagt, ohne bestandenen Nulltest seien alle Prüfstandzahlen ungeprüft. 01 baut seine eine Messung (Stand 26 gegen "Kette weich") auf genau diesem Prüfstand.
6. **P12 Machen oder Messen.** 14 sagt "Machen (UI)"; 11 sagt "Messen, dann einen weichen Hinweis", weil ein Hinweis auf Basis einer falschen Deckenhöhe selbst falsch wäre (P7).
7. **Laser als Maßstab.** 14 empfiehlt Web-Bluetooth-Laser als Lösung für P7; 07 reiht Eintippen zuerst und BLE als optionale Erweiterung, weil nicht belegt ist, dass `requestDevice` oder eine bestehende GATT-Verbindung in einer `immersive-ar`-Sitzung funktioniert. 14 nennt zudem, dass floorplancreator.net auf Android Bluetooth Classic nutzt (Web Bluetooth dort für Desktop genannt).
8. **Vorbild-Produkte.** 14 stützt sich auf eine magicplan-Hilfeseite (Android-Scan nicht unterstützt; widersprechende Version 9.3.0 nicht wiederzufinden); 07 verweist auf magicplan als Vorbild fürs Eintippen und für kompatible Laser; 01 und 09 fanden zu magicplan, Polycam, Matterport bei Ortungsverlust keine Quelle. Die Aussage "kein Android-Kamera-Vorbild" ist damit schwach belegt.
9. **Globale vgpu-Vorgabe.** Die in `~/.claude/CLAUDE.md` bevorzugte Bibliothek vgpu passt laut 13 nicht für den Kamerapfad: `XRGPUBinding` hat hinter dem Flag kein `getCameraImage`, Babylon.js nennt Raw Camera Access in WebGPU-XR als nicht unterstützt; die Bildverarbeitung bleibt auf WebGL2/GLSL.
10. **Stabilitätsziel Karte.** 04 (P4) und 05 (P5) gehen von zwei nebeneinander laufenden Auswertern aus (alte `solveSweepAuto`, neue Karte M7); die Entscheidung, M7 zum Hauptweg zu machen, hängt laut 04 an `minBeob 3` und vier weiteren Wohnküchen-Aufnahmen. 14 spricht in M2 nur von "mehr Aufnahmen".

## 4. Was nur nativ geht, und was wir sofort tun können

**Nur nativ (Android, Kotlin/NDK), laut 14:**
- `TrackingFailureReason` (BAD_STATE, CAMERA_UNAVAILABLE, EXCESSIVE_MOTION, INSUFFICIENT_FEATURES, INSUFFICIENT_LIGHT) als Grund statt stummer Lücke [V].
- `CameraConfig` und Shared Camera: Kamera-ID, CPU-/GPU-Bildgröße, Bildrate, Fokusmodus (Festfokus fürs Tracking); Ultraweitwinkel dort nicht dokumentiert [V].
- ARCore Recording & Playback mit Neuberechnung der Pose beim Wiederholen, also Tracking-Varianten testen [V]; im Web nicht möglich.
- Roh-IMU über 60 Hz (nativ bis 200 Hz ohne, darüber mit Berechtigung `HIGH_SAMPLING_RATE_SENSORS`); bei uns gemessen ohne Nutzen (P13, P18).
- Native Rechenleistung (C++): etwa 2-fach gegenüber WASM bis etwa 8-fach bei Netzen [A]; unsere Hürde ist laut 14 und 13 der Karten-Algorithmus, nicht die Zeit pro Bild.
- Nativ nichts bringt: Scene Semantics (nur Außenbereich), Raw Depth (Pixel 9 Pro: Tiefe aus Bewegung, Konfidenz 0 auf Weißwänden), Geospatial.

**Sofort im Web (ohne neue Abhängigkeit):**
- Nulltest, Injektionstest und registrierungsfreie Metriken (P16, P3), 1 bis 1,5 Tage.
- Kippquote messen, CROPS und weiche Tore (P4), 3 bis 4 Tage.
- Rückkehr-Varianten A/B/C auf dem Prüfstand (P2).
- Höhe eintippen als Maßstab, Zwei-Punkte-Höhe messen (P7).
- Strenge Höhenklasse und σ-Gewichte vor der Karte (P5).
- Tiefe nur auf Haken, Web-Share-Knopf, Videoratenreihe (P15).
- Optionsregister mit Haken statt URL-Parametern (P14).
- Overlay-Halo und Abdeckungsring, Fangbereich nachrechnen, Kamerahöhen-Hinweis nach Messung (P10, P11, P12).
- Querformat-Vergleich in der Wohnküche und `kamera-messung.html` am Pixel (P8, P9).
- Vibration im Scanbetrieb prüfen (11: ARCore rät davon ab, Wirkung bei uns ungemessen).

## 5. Die zehn wichtigsten Quellen

1. Qin, Li, Shen 2018, VINS-Mono (4-DoF-Pose-Graph, Zeitversatz), [V]: https://arxiv.org/abs/1708.03852
2. Laska u. a. 2022, VI-SLAM2tag (ARCore-Koordinatenwechsel als Teiltrajektorien), [V]: https://arxiv.org/abs/2207.02668
3. Cortés u. a. 2018, ADVIO (ARCore-Schleifensprünge, falsch positive), [V]: https://arxiv.org/abs/1807.09828
4. Olivastri, Pretto 2024, IPC (inkrementelle Annahme von Verbindungen), [A]: https://arxiv.org/abs/2405.08503
5. Cabral, Furukawa 2014, Piecewise Planar and Compact Floorplan Reconstruction (Kandidaten und globale Auswahl): https://openaccess.thecvf.com/content_cvpr_2014/papers/Cabral_Piecewise_Planar_and_2014_CVPR_paper.pdf
6. Google, ARCore `TrackingFailureReason` (Gründe nur nativ), [V]: https://developers.google.cn/ar/reference/java/com/google/ar/core/TrackingFailureReason
7. Google, ARCore `CameraConfig` / Camera Configs (Kamera, Fokus, Bildgröße), [V]: https://developers.google.com/ar/develop/java/camera-configs
8. MDN, `XRReferenceSpace` `reset`-Ereignis (feuert nicht bei Wiederfinden des Ursprungs), [geöffnet]: https://developer.mozilla.org/docs/Web/API/XRReferenceSpace/reset_event
9. Chrome, Web Bluetooth (Laser, nur HTTPS und Nutzergeste), [V]: https://developer.chrome.com/docs/capabilities/bluetooth
10. Google, ARCore Recording & Playback (reproduzierbares Messen, nativ), [V]: https://developers.google.com/ar/develop/recording-and-playback

Weitere tragende Quellen: Kim u. a. 2022 (vier proprietäre VIO-Systeme, https://arxiv.org/abs/2207.06780), Scargill u. a. 2021 (Hologramm-Drift, https://arxiv.org/abs/2109.14757), GRIHA (https://arxiv.org/abs/2103.08297), Google Depth API (https://developers.google.com/ar/develop/depth), Scene Semantics (https://developers.google.com/ar/develop/scene-semantics).

## 6. Offene Fragen, die Messungen am Gerät brauchen

1. Liefert ARCore auf dem Pixel 9 Pro über `CameraConfig` ein breiteres/ungeschnittenes Bild oder die Ultraweitwinkel-Kamera? (`dumpsys media.camera`, nativer Spike; Doku sagt dazu nichts.)
2. Wie hoch ist der Verlustanteil nativ gegenüber WebXR (19 % Hochformat, 0,7 % Querformat) im selben Raum? Und unterscheidet sich die Zahl der Ankerwechsel je Rundgang?
3. Funktioniert `navigator.bluetooth.requestDevice` oder eine bestehende GATT-Verbindung innerhalb einer `immersive-ar`-Sitzung in Chrome 156? Braucht der Bosch GLM 50 C Bonding, wie wird die Prüfsumme berechnet?
4. Treten `emulatedPosition` und `reset` in Chrome 156 auf dem Pixel je auf? In den zwei Aufnahmen vom 25.10. null, die Protokollierung kann jünger sein.
5. Deckt der 640x480-Tracking-Strom von ARCore das volle Sensorsichtfeld ab oder ist er beschnitten?
6. Wie schnell laufen `segmentDP`, `ringOrder`, M7 und der Löser-Schritt mit 10 bis 20 Abschnitten auf dem Pixel (bisher nur Mac-Zeiten)? Welche Zeit kostet `readPixels` bei `?ds=1920`, und läuft ein Worker auf WebGPU neben der WebGL-Sitzung ruckelfrei?
7. Sind ARCores Sprünge in unseren Aufnahmen unterm Strich echte Korrekturen oder Fehler (bestimmt das Gewicht der Max-Mixture-Komponenten)? Wie verhalten sich Anker nach einer Relokalisierung, meldet `trackedAnchors` das?
8. Wirken 8 bis 30 ms Vibration auf Gyro-Rauschen oder Posensprünge?
9. Wie groß ist der echte Gyro-Restbias des Pixel 9 Pro (unter 0,1 oder über 0,3 °/s)? Wie stabil ist der Zeitversatz (Ziel Streuung unter 30 ms), und wird die Fokus-Falle mit M157 (3.11.2026) behoben?
10. Enthalten die Aufnahmen die Polygone der senkrechten `detectedPlanes`, und meldet Chrome/ARCore Deckenebenen (Label "ceiling")?
11. Zeigt die Kompass-Mitschrift (`deviceorientationabsolute`) auf dem Pixel in unseren Räumen einen Fehler unter 45°, damit die 4-fache Drehmehrdeutigkeit beim Prüfstand lösbar wird?
12. Wie groß ist die Streuung dreimaligen Scannens derselben Wand gegen den Laser (P3), und wie groß ist der ARCore-Startfehler im Maßstab pro Sitzung?
13. Welche Kameraposition (Standpunkt) und Handgeschwindigkeit liegen je Runde vor (für Orts- und Standpunkt-Faktor in P1; aus vorhandenen Aufnahmen berechenbar)?


---

# Teil B: Recherche je Themenblock



---

<!-- 01-pose-graph.md -->

# Recherche 01: Abschnitte verbinden (Pose-Graph, Multi-Map, robuste Schätzung)

Stand der Seite: 26. Thema deckt nur P1 ab. Kennzeichnung: [V] = Kernabschnitt im PDF gelesen (lokal in `paper/`, mit `pdftotext` geprüft, Titel und Autoren auf Seite 1 stimmen), [A] = nur Abstract, Einleitung oder gezielte Stichwortsuche im Volltext, [Vermutung] = nicht belegt.

## P1 – Abschnitte nach Ortungsbrüchen zusammensetzen

**Problem:** ARCore setzt nach einer Relokalisierung oder einem Ankerwechsel den Rahmen neu: Er liegt 0,2–1 m und bis 20° neben dem vorherigen, im sauberen Abschnitt dagegen stimmt die Lage mit Median 3,6 cm. Die Karte zerfällt in 10–20 Abschnitte und 14–36 globale Wände statt ~8. 84 von 102 Schnitten in 6 Aufnahmen sind keine echten Lücken (T-Wechsel, Kamerasprung, Bezugssprung), 18 sind Ortungsverluste, davon 14 länger als 1 s. Schon bei 0,4 s Lücke liegt die Kette 23 cm daneben, obwohl sich die Kamera nur 1,9 cm bewegt hat: Die Drehung in der Lücke ist der Fehler. Mit echtem Gyro fällt der Gierfehler am Prüfstand von 14,6° auf 0,8° (31.10.), der Wandfehler im Median von 70 auf 21 cm, aber das p90 bleibt bei ~92 cm; der Rest steckt in Lücken von 1–10 s (rund 85 %) und im Ortsversatz.

**Aktueller Ansatz (Stand 26):** Jeder Tracking-Abschnitt hat eine lokale Karte (M4/M5). Verbunden wird über die Kette (ARCore-Pose als Folgekante), über Wände (Z13, die Registrierung über Wandlinien) und seit Stand 17 über die Gyro-Brücke (`imuPsi`, gedämpfte Vorhersage, `abReg.gyroMit`). Das reicht nicht, aus drei messbaren Gründen:
1. Kettenabschnitte sind bitgleich fest (`ausgleich.js:245`, `:817`, σ ≈ 0). Neue gute Daten können ihre Lage nie korrigieren, und die Karte meldet falsche Sicherheit.
2. Die Wandverbindung ist dünn: Nur etwa die Hälfte der Nachbarpaare teilt eine Wandlinie, beide Achsen fast nie. Entlang einer nur von einer Seite gesehenen Wand ist die Verschiebung nicht beobachtbar (Entartung, λmin nach Zhang 2016, schon in `paper/`).
3. Ein harter Anker als Bindung hat verschlechtert (Median 20,3 → 32,0 cm in A6), Z13 wird nur 0–3-mal je Aufnahme angenommen und läuft einmal vor dem unumkehrbaren `lmEinbinden`. Nach dem Einbinden werden Erfassungen dauerhaft verworfen (L = −1) oder spalten Wände auf.

**Wissenschaft:**
- **4-DoF-Pose-Graph (VINS-Mono, Qin/Li/Shen 2018, "VINS-Mono: A Robust and Versatile Monocular Visual-Inertial State Estimator") [V].** Roll und Pitch sind aus Schwerkraft und IMU beobachtbar, deshalb enthält jede Kante nur relative Position (3) und Gierwinkel (1), Residuum Gl. (28); Folgekanten kommen aus der Odometrie, Schleifenkanten aus der Relokalisierung. Voraussetzung: gravitationsausgerichteter Rahmen. Das trifft auf ARCores `local`-Raum zu, unser Knoten ist also (x, y, z, ψ) je Abschnitt. Die Grenze: Die Odometriekante ist dort eine Messung. Bei uns ist der ARCore-Sprung keine, also darf über Brüche keine solche Folgekante liegen.
- **ARCore-Koordinatenwechsel als Teiltrajektorien (Laska u. a. 2022, "VI-SLAM2tag") [V].** Für ARCore selbst gezeigt: Ändert ARCore seinen Rahmen, kippt eine globale Abbildung (kleinste Quadrate über die ganze Bahn). Auf allen Bahnen im Mittel 2,80 m Fehler (Maximum 20,78 m), mit je einer eigenen Ähnlichkeitsabbildung pro Teiltrajektorie 0,53 m (Maximum 0,87 m); auf störungsfreien Bahnen ist die globale Abbildung etwas besser (0,43 gegen 0,51 m). Das ist die nächste veröffentlichte Entsprechung zu "Abschnitt = Knoten mit eigenem Versatz". Grenze: Dort dienen vermessene Kontrollpunkte (Tachymeter) als Bezug, bei uns nur Wände.
- **ARCore-Sprünge sind nicht nur Drift-Korrekturen (ADVIO, Cortés u. a. 2018) [V].** ARCore nutzt Schleifenschlüsse aggressiver als ARKit; das zeigt sich in falsch positiven Sprüngen zwischen ähnlich aussehenden Bereichen; zu Beginn der Bahnen traten wilde Sprünge auf, die die Ausrichtung verfälscht hätten. Folgerung: Ein Sprung ist entweder eine echte Drift-Korrektur oder eine falsche Relokalisierung, beides kommt vor, und man erkennt es nicht an der Pose allein. Ergänzend [A]: Benchmark vierer VIO-Systeme (Kim u. a. 2022): ARCore hat den kleinsten Schlussfehler (0,12 m auf 145 m), passt aber trotzdem nicht zum Grundriss; ein kleiner Schlussfehler belegt also keine gute Zwischenlage. Hologramm-Drift (Scargill u. a. 2021): bei Verlust des Trackings (Aktion "Place down") mittlerer Drift auf ARCore 17,8 cm (Nokia 31,1 cm, Samsung 4,5 cm; ARKit 3,6 cm), Relokalisierungszeit je nach Gerät und Aktion etwa 1–7 s.
- **Mehrere Karten (Atlas, ORBSLAM-Atlas, Elvira u. a. 2019; ORB-SLAM3, Campos u. a. 2021) [A].** Bei Ortungsverlust beginnt eine neue Teilkarte, zusammengeführt wird erst nach Bestätigung durch drei aufeinanderfolgende Schlüsselbilder. Atlas gibt 2–3× genauere Mehrfachkarten als frühere Multi-Map-Ansätze an, ORB-SLAM3 3,2× genauer als VINS-Mono im Mehrfach-Sitzungsfall (EuRoC). Voraussetzung: Wiedererkennung über Bildmerkmale (DBoW2) und Überlappung. Beides haben wir nicht (Abschnitte teilen kaum Wände, Bild-Wiedererkennung offline 11/11, 6/6, 20/22 Paare, aber nur mit Wohnküchen-Vokabular). Übernehmbar ist die Regel "erst bestätigen, dann verschmelzen".
- **Relative Pose-Graphen mit Ankerknoten (Kim u. a. 2010, "Multiple Relative Pose Graphs for Robust Cooperative Mapping") [A].** Jeder Teilgraph wird relativ zu einem Ankerknoten geführt, was das Initialisierungsproblem vermeidet und die Kovarianzen der relativen Parameter für die Zuordnung liefert. Das passt zu unserer Frage, wie sicher ein Abschnitt zum nächsten liegt.
- **Robuste Kanten.** Max-Mixture (Olson/Agarwal 2012) [A]: Eine Kante hat mehrere Gauß-Komponenten, darunter eine breite Nullhypothese; Ausreißer werden ohne exponentiellen Speicher mitbestimmt. DCS (Agarwal u. a. 2013) [A] skaliert die Kovarianz dynamisch. GNC (Yang u. a. 2020) [A] hält 70–80 % Ausreißer aus und braucht keinen Startwert, setzt aber einen Löser für den ausreißerfreien Fall voraus. PCM (Mangelson u. a. 2018) [A] sucht die größte paarweise konsistente Menge (Maximum Clique), IPC (Olivastri/Pretto 2024) [A] tut das inkrementell: Eine neue Verbindung wird nur angenommen, wenn danach alle schon angenommenen Messungen im betroffenen Teilgraphen den χ²-Test bestehen. TACO (Olivastri u. a. 2026, arXiv 2606.29851) [V für §4.2.3, sonst A] ergänzt das, weil IPC angenommene Schleifen nie neu bewertet, um eine periodische Nachprüfung mit Switchable Constraints; über 90 % (2D) beziehungsweise 83 % (3D) Erfolg bei bis zu 50 % Ausreißern, mittlere Rechenzeit ~45 ms beziehungsweise ~100 ms (nativ).
- **Zertifizierbare Verfahren (SE-Sync, Rosen u. a. 2019) [A].** Liefert nachprüfbar globale Optima des Pose-Graphen, wenn das Rauschen unter einer Schwelle liegt, mehr als eine Größenordnung schneller als Gauss-Newton auf Datensätzen mit tausenden Knoten. Es braucht SDP-Relaxation, Riemann-Optimierung und dünne Cholesky-Faktorisierung und geht von ausreißerfreien Messungen aus; Ausreißer löst man davor (GNC, PCM). Für 10–20 Knoten mit bekanntem Roll und Pitch bringt es nichts: Das Gierproblem ist eindimensional je Knoten und zerfällt (LAGO, Carlone 2011 [A]: erst Gier, dann linear, dann wenige Gauss-Newton-Schritte).
- **Hypothesen und Prüfung (Tanaka 2016, arXiv 1608.02052) [A].** Mehrere Schleifenhypothesen werden erzeugt und auf Konsistenz mit den Beobachtungen an mehreren Blickpunkten entlang der Bahn geprüft, auch inkrementell. Übertragbar ist die Idee, die wenigen diskreten Verbindungsmöglichkeiten (zum Beispiel "Abschnitt B liegt an Wand 3 von A, an Wand 5 oder gar nicht") als Hypothesen auszuzählen statt eine zu raten. Das Paper selbst behandelt visuelle Ortswiedererkennung, keine Wandlinien.
- **Verbindung ohne Überlappung (Yang u. a. 2019, arXiv 1901.00063) [A].** Ein Netz ergänzt die Szene und schätzt daraus die Relativpose. Ohne Überlappung beträgt der mittlere Drehfehler 79,9°, 87,9°, 81,8° auf SUNCG, Matterport, ScanNet, bei 126,3° für eine zufällige Drehung; mit mehr als 10 % Überlappung 12,0°, 9,0°, 30,2°. Für uns unbrauchbar. **Floorplan-Jigsaw (Lin u. a. 2019, arXiv 1812.06677) [A]:** Teilaufnahmen werden über einen Manhattan-Raumquader und Schließen der Schleife ausgerichtet; das Paper nennt selbst Mehrdeutigkeiten (mehrere plausible Anordnungen). Idee für uns: Abschnitt = lokales Layout, Verbindung über Wandschluss. Grenze: setzt Punktwolken und eine Kastenform voraus.
- **Stand der Forschung und Grenze:** Mit Messungen über die Lücke ist das Problem gelöst, ohne sie nicht. Keine der Arbeiten behebt die Entartung "eine Wand von nur einer Seite" oder "Pause ohne gemeinsame Wand". Ein Paper zu Relokalisierungssprüngen von ARCore als Messfehlermodell habe ich nicht gefunden [Vermutung: gibt es nicht].

**Best Practice (Industrie/Open Source):**
- **Apple RoomPlan:** Mehrere Räume werden in einem gemeinsamen Koordinatenraum gesammelt; Voraussetzung laut Apple ist eine durchgehende oder mit `ARWorldMap` relokalisierte AR-Sitzung, danach fügt `StructureBuilder` die Räume zusammen. Bei Tracking-Problemen soll der Nutzer an die zuletzt gescannte Stelle zurückkehren. Eine empfohlene Maximalfläche nennt Apple; den Zahlenwert (~186 m²) konnte ich nicht bestätigen [Vermutung]. Es gibt also keine nachträgliche Verbindung ohne gemeinsamen Raum, nur Nutzerführung ("Quelle: Apple-Dokumentation, geöffnet").
- **ARKit/ARCore:** Verankerungen sollen über `Anchor` mit der Welt mitgeführt werden; ARCore dokumentiert, dass sich die Relativlage mehrerer Anker eines Objekts leicht anpassen kann, wenn das Weltmodell aktualisiert wird (Trackable-Dokumentation, `createAnchor`: Lage mehrerer Anker am selben Trackable kann sich im Lauf der Zeit leicht anpassen, geöffnet). Wie sich Anker nach einer Relokalisierung genau verhalten, ist nirgends offiziell beschrieben, was ich fand.
- **WebXR:** Das Ereignis `reset` des Referenzraums (Chrome ab Version 79 laut MDN-Kompatibilitätsdaten; Firefox und Safari nicht) meldet Sprünge des Ursprungs mit einer `transform`, feuert aber **nicht**, wenn das Gerät den früheren Ursprung wieder findet (MDN, geöffnet). Das deckt sich mit unserem Fall A8 (81 cm ohne Meldung). Sprungerkennung muss also weiter aus der Pose selbst kommen.
- **Forschungs-/Open-Source-Systeme:** VINS-Mono (GPL, C++), ORB-SLAM3 (GPL), Kimera-Multi (GNC + PCM für Mehrfachroboter), COVINS-G (beliebiges VIO als Front-End, zentrales Back-End mit Mehrkamera-Relativpose) nutzen alle: Teilkarten oder Schlüsselbilder als Knoten, Zusammenführen nach Bestätigung, robustes Back-End. Alle sind nativ, nichts davon läuft im Browser.
- **magicplan, Polycam, Matterport:** Zu deren Umgang mit Tracking-Verlust fand ich keine belegbare Quelle [Vermutung: gleiches Muster, Nutzer zurück an die letzte Stelle]. Veröffentlicht sind nur Flächenfehler von 3–5 % (GRIHA-Vergleich, siehe Bericht 25.10.).

**Auf unserem Stack:**
- **Größe:** 10–20 Abschnitte × 4 Freiheitsgrade plus die Wandparameter sind unter 100 Unbekannte (ohne Wände unter 100, mit allen Erfassungen nur dann mehr, wenn man sie nicht als Wandbeobachtung zusammenfasst). Der vorhandene dünne LDLᵀ-Löser im Karten-Worker rechnet das in weit unter einer Millisekunde je Gauss-Newton-Schritt [Vermutung nach Größenordnung, am Pixel nicht gemessen]. Rechenzeit ist hier kein Hindernis.
- **Was geht in reinem JS:** Max-Mixture (zwei Komponenten je Brückenkante, Auswahl je Iteration), Huber/Cauchy, GNC (Gewichte je Iteration, 30–50 Zeilen), IPC/PCM-Konsistenztest (χ² über den Teilgraphen; Maximum Clique ist bei < 30 Kanten trivial), TACO-Nachprüfung (Kanten der letzten M Verbindungen mit Schaltvariable nochmals prüfen). SE-Sync, GTSAM, g2o, Ceres: Eine WebAssembly-Fassung habe ich nicht gefunden (Suche ohne Treffer, nicht ausgeschlossen) [Vermutung]; außerdem unnötig. Ein reines JS-Cholesky-Paket (`cholesky-solve`) fand ich nur als Suchtreffer, wir haben einen eigenen Löser.
- **Neue Faktoren, die eine Messung sind:** (a) Gierfaktor über die Lücke aus dem Gyro (gemessen 0,8° Median), σ wächst mit der Lücke, Bias 0,1–0,5 °/s ergibt in 6 s 0,6–3°; (b) Ortsfaktor über die Lücke mit σ = σv·Δt (Handscan, σv ~ 0,3–0,5 m/s, [Vermutung], an den Aufnahmen messbar), Beleg dafür: Bei 0,4 s ist die Kamera nur 1,9 cm gewandert; (c) optional ein Standpunkt-Faktor "alle Kamerapositionen einer Runde liegen nahe beieinander" (Nutzer dreht sich auf der Stelle), σ ~ 0,5 m [Vermutung, an den Aufnahmen messbar]; (d) Wandfaktoren (Linienabstand und -richtung) der Erfassungen je Abschnitt. Der ARCore-Sprung selbst wird als Hypothese geführt: Komponente 1 "Sprung war echte Korrektur, Versatz ≈ 0 zur ARCore-Kette", Komponente 2 "falsch, breite Nullhypothese" (Max-Mixture). Die Kette bleibt damit weich statt σ ≈ 0, was Punkt 1 des aktuellen Ansatzes behebt.
- **Annehmen und Prüfen:** Neue Wandverbindung nach IPC-Regel annehmen (alle angenommenen Messungen im betroffenen Teilgraphen müssen weiter bestehen), danach bei jeder Runde die letzten M Verbindungen nach TACO nachprüfen. Das behebt, dass Z13 einmalig vor `lmEinbinden` entscheidet. Ohne diese Nachprüfung wiederholen wir IPCs bekannte Schwäche.
- **Harte Grenzen, kein Solver hilft:** Entartung bei Verschiebung entlang einer nur einseitig gesehenen Wand; Lücken von 3–10 s ohne gemeinsame Wand. Dort kann die Skizze nur ehrlich unsicher bleiben (Unsicherheitsband und Hinweis "Rückkehr nötig"), wie es magicplan (orange nicht geschlossene Wände) und IntelliCap (Streifen) zeigen.
- **Aufwand (grobe Schätzung, nicht gemessen):** Messversuch im Prüfstand 2–3 Tage; Umbau Kette weich + Brückenkante mit Max-Mixture im Ausgleich (M6) 3–5 Tage; IPC-/TACO-Annahmeregel statt Einmal-Z13 2–3 Tage; Standpunkt-Faktor 1 Tag. **Risiko:** mittel; der Gewinn hängt davon ab, wie oft Wände vor und nach dem Bruch gemeinsam gesehen werden (nur etwa die Hälfte der Nachbarpaare). **Abhängigkeiten/Lizenz:** keine neuen Bibliotheken, alles Eigenbau; die Algorithmen sind veröffentlicht, eine Übernahme von VINS-Mono- oder ORB-SLAM3-Code (GPL) ist weder nötig noch ratsam.

**Empfehlung:** Zuerst messen, nicht bauen. Reihenfolge: (1) Brückenkante weich statt σ ≈ 0, mit Max-Mixture aus "Sprung echt" und breiter Nullhypothese, plus Gyro-Gier- und Ortsfaktor mit σ nach Lückenlänge; (2) IPC-Annahme mit TACO-Nachprüfung statt Einmal-Z13; (3) Standpunkt-Faktor; verwerfen: SE-Sync, Verbindung ohne Überlappung (Yang u. a.), Jigsaw (setzt Kasten und Punktwolken voraus), Atlas-Wiedererkennung (kein Vokabular, 2–3 Wochen, Bildkante lohnt erst danach). **Die eine Messung:** Im vorhandenen Prüfstand mit den 20 simulierten Bruchfenstern und dem echten Gyro vom 29.10. und 31.10. den heutigen Stand 26 gegen "Kette weich + Brückenkante mit Max-Mixture + Gyro-/Ortsfaktor" vergleichen: Treffer (≤ 10 cm und ≤ 2°; heute 6–7 von 20) und p90 der Wandabstände (heute ~92 cm). Wird p90 unter 50 cm und steigen die Treffer deutlich, einbauen. Bleibt das p90 bei ~90 cm, liegt der Rest in den langen Lücken ohne gemeinsame Wand, und nur Nutzerführung (zurück an die letzte Stelle, Hinweis) hilft.

**Quellen:**
1. Qin, Li, Shen 2018, VINS-Mono: https://arxiv.org/abs/1708.03852 [V]
2. Laska u. a. 2022, VI-SLAM2tag: https://arxiv.org/abs/2207.02668 [V]
3. Cortés u. a. 2018, ADVIO: https://arxiv.org/abs/1807.09828 [V]
4. Olivastri, Pretto, Fischer 2026, TACO: https://arxiv.org/abs/2606.29851 [V §4.2.3, sonst A]
5. Olivastri, Pretto 2024, IPC: https://arxiv.org/abs/2405.08503 [A]
6. Elvira u. a. 2019, ORBSLAM-Atlas: https://arxiv.org/abs/1908.11585 [A]
7. Campos u. a. 2021, ORB-SLAM3: https://arxiv.org/abs/2007.11898 [A]
8. Rosen u. a. 2019, SE-Sync: https://arxiv.org/abs/1612.07386 [A]
9. Yang u. a. 2020, GNC: https://arxiv.org/abs/1909.08605 [A]
10. Tanaka 2016, Hypothesize-and-Verify: https://arxiv.org/abs/1608.02052 [A]
11. Yang u. a. 2019, Extreme Relative Pose: https://arxiv.org/abs/1901.00063 [A]
12. Lin, Li, Wang 2019, Floorplan-Jigsaw: https://arxiv.org/abs/1812.06677 [A]
13. Kim u. a. 2022, Vier proprietäre VIO-Systeme: https://arxiv.org/abs/2207.06780 [A]
14. Scargill, Chen, Gorlatova 2021, Hologram Stability: https://arxiv.org/abs/2109.14757 [A]
15. Patel u. a. 2023, COVINS-G: https://arxiv.org/abs/2301.07147 [A]
16. Tian u. a. 2022, Kimera-Multi: https://arxiv.org/abs/2106.14386 [A]
17. Mangelson u. a. 2018, PCM; Olson/Agarwal 2012, Max-Mixture; Agarwal u. a. 2013, DCS; Kim u. a. 2010, Multiple Relative Pose Graphs; Carlone u. a. 2011, LAGO: keine URL geöffnet, nur lokal gelesen (Abstract/Stichworte) unter `/Volumes/external/TobiCodetEndlichWieder/Zaene/paper/` (`mangelson2018_PCM_pairwise_consistency_map_merging_ICRA.pdf`, `olson2012_max_mixture_robust_mapping_RSS.pdf`, `agarwal2013_DCS_dynamic_covariance_scaling_ICRA.pdf`, `kim2010_multiple_relative_pose_graphs_anchor_nodes_ICRA.pdf`, `carlone2011_LAGO_linear_approx_graph_SLAM_RSS.pdf`)
18. MDN, XRReferenceSpace reset event: https://developer.mozilla.org/docs/Web/API/XRReferenceSpace/reset_event [geöffnet]
19. Apple, Scanning the rooms of a single structure (RoomPlan): https://developer.apple.com/documentation/roomplan/scanning-the-rooms-of-a-single-structure.md [geöffnet; Flächenangabe nicht bestätigt]
20. ARCore Trackable (Anker-Relativlage): https://developers.google.com/ar/reference/java/com/google/ar/core/Trackable [geöffnet]
21. npm `cholesky-solve` (JS-LDLᵀ): https://npmjs.com/package/cholesky-solve [nur Suchtreffer]
22. WWDC23 Session 10192 (RoomPlan, Relokalisierung): https://developer.apple.com/wwdc23/10192 [nur Suchtreffer]

**Offene Fragen:** (1) Sind ARCores Sprünge in unseren Aufnahmen unterm Strich echte Korrekturen oder Fehler? Das ist bisher nicht gemessen und entscheidet über das Gewicht der Mixture-Komponenten. (2) Wie verhalten sich ARCore-Anker nach einer Relokalisierung, und liefert Chrome diese Änderung über `trackedAnchors`? Ich fand dazu keine Quelle. (3) Wie gehen magicplan, Polycam und Matterport mit Tracking-Verlust um? Keine belegbare Quelle gefunden. (4) Streuung der Kamerapositionen je Runde und typische Handgeschwindigkeit in der Lücke (für den Orts- und den Standpunkt-Faktor) liegen nicht vor, sind aber aus den vorhandenen Aufnahmen berechenbar. (5) Rechenzeit des Löser-Schritts am Pixel mit echten 10–20 Abschnitten ist nicht gemessen. (6) Die Zahlen zu Atlas, ORB-SLAM3, GNC, SE-Sync, IPC, PCM stammen nur aus Abstracts und Stichwortsuche, nicht aus dem Volltext.

Prüfstand: 26 Quellen geprüft, 3 korrigiert, 0 entfernt.


---

<!-- 02-wiedererkennung.md -->

# Visuelle Wiedererkennung im Browser (P1, P2)

Stand der Seite: 26. Recherche vom 31.10.2026. Es wurde kein Code geändert.

**Lesart der Marken.**
- **[V]** heißt: PDF lokal in `paper/`, Identität auf Seite 1 geprüft, die genannten Abschnitte und Tabellen gelesen. Es heißt nicht: das ganze Paper durchgearbeitet.
- **[A]** heißt: nur Abstract, Seitenauszug oder Sekundärquelle gelesen.
- **[Vermutung]** heißt: nicht belegt.

Es wurde kein PDF neu heruntergeladen. Alle [V]-Quellen lagen schon in `paper/`.

**Kernbefund vorweg.** Beim Wiedererkennen liegt der Engpass bei P1 nicht im Finden von Kandidaten, sondern im Prüfen der Kandidaten.
- Die eigene Messung: ORB-Bag-of-Words findet in den Top-10 die richtigen Abschnittspaare (A6 11/11, A7 6/6, A8 20/22, aber Vokabular aus derselben Wohnküche). Nur 16–21 % der Abschnittspaare haben ein Bildpaar mit mindestens 30 E-Inliern (SIFT).
- Globale Deskriptoren (NetVLAD, MixVPR, CosPlace) verbessern nur das Finden. Sie liefern keine Lage und lösen nichts bei den 16–21 %.
- Nur Verfahren, die die Prüfung stärken (bessere lokale Merkmale und Matcher, oder Geometrie), können hier etwas ändern.

---

## P1 – Abschnitte nach Ortungsbrüchen zusammensetzen

**Problem:**
- Nach einem ARCore-Bruch (Relokalisierung, Ankerwechsel) liegt der neue Rahmen 0,2–1 m und bis 20° daneben. Im sauberen Abschnitt beträgt der Median 3,6 cm.
- Die Karte zerfällt in 10–20 Abschnitte, es entstehen 14–36 globale Wände statt etwa 8.
- Die Gyro-Brücke hat den Drehfehler am Bruch von 14,6° auf 0,8° gesenkt (Prüfstand, Gyro nachgebildet, also Obergrenze). Der Ortsversatz (0,2–1 m) ist offen.
- Ohne Bilder ist die Verschiebung in der Lücke nicht beobachtbar (Median 20–34 cm).

**Aktueller Ansatz (Stand 26):**
- Gyro-Brücke gegen den Drehfehler.
- Kette über ARCore-Anker. Die tragen über harte Brüche nicht: 13 von 15 harten Schnitten bleiben unverbunden.
- Wandgeometrie. Die Raumrichtung liefert die Gier mod 90° auf etwa 1–5°. Von 31 aufeinanderfolgenden Abschnittspaaren teilen 14–15 mindestens eine Wandlinie, beide Achsen nur 0–1. Daraus ist meist nur eine Achse der Verschiebung beobachtbar.
- Bild-Wiedererkennung ist nur offline gemessen. ORB in JS ist gebaut (11–19 ms/Bild am Mac M4 Pro, auf dem Pixel nicht gemessen) und als Faktor in M6 entworfen, aber nicht eingebaut. Der Prüfstand verwirft das Video (`bruchSimulieren` setzt `video:null`).
- Das reicht nicht, weil:
  - die Geometrie für die volle Verschiebung nicht genügt,
  - das Bild nur 16–21 % der Paare abdeckt,
  - das Orakel (T2-Passung) mehrdeutig ist und deshalb nicht als Maßstab taugt.

**Wissenschaft:**
1. **ORB + Bag-of-Binary-Words (DBoW2).**
   - Kernergebnis: 22 ms/Bild im Mittel, Spitze unter 52 ms, Vokabular mit 1 Mio. Wörtern. Auf NewCollege (5266 Bilder) 100 % Präzision bei 55,92 % Recall.
   - Voraussetzungen: Der Kandidat muss durch Zeit-Konsistenz (drei aufeinanderfolgende Treffer) und geometrische Prüfung (Fundamentalmatrix, RANSAC) bestätigt werden. Die Messungen sind auf Straßenfahrten mit ebener Kamerabewegung. Das Verfahren trennt Präzision und Recall bewusst zugunsten der Präzision.
   - Grenze: ORB-SLAM3 nennt die Zeit-Konsistenz als Ursache für zu geringen Recall und ersetzt sie durch geometrische Prüfung plus lokale Konsistenz mit drei Nachbar-Schlüsselbildern.
   - Quelle: Gálvez-López/Tardós 2012 (Nr. 1) [V]. ORB-SLAM3 (Nr. 2) [A], nur Einleitung gelesen.
2. **Linien plus Punkte für Schleifenschluss in texturarmen Szenen (LiPo-LCD).**
   - Kernergebnis: getrennte Bag-of-Words für ORB-Punkte und LSD-Linien, späte Fusion der Ranglisten, Prüfung mit gemeinsamer Fundamentalmatrix aus Punkten und Linienendpunkten. Auf dem Innenraum-Datensatz L6I Recall bei 100 % Präzision 85,24 % (Bampis 52,22 %, Garcia-Fidalgo 83,18 %). Auf L6O 97,31 %. Auf MLG schwächer (75,73 % gegen 87,56 % bei Bampis).
   - Voraussetzungen: Vorwärts-Kamera mit Bildfolge. Die Gesamtzeit beträgt 389,79 ms/Bild auf einem i7-9750H (parallel), davon Vokabular-Update rund 197 ms und Kandidatensuche rund 159 ms (Tabelle 2, Sequenz K00, parallel). Das ist weit über unserem Budget und nicht für Browser gedacht.
   - Grenze: Die Linien-Beschreiber helfen laut Autoren in texturarmen Innenräumen. Es gibt keinen Test mit Blick zur Decke.
   - Quelle: Company-Corcoles u. a. 2020 (Nr. 3) [V]: Abstract, Methode, Tabellen 2 und 3.
3. **Globale Deskriptoren für Ortserkennung (NetVLAD, CosPlace, MixVPR).**
   - Kernergebnis: Recall@1 für MixVPR 94,6 % (Pitts250k), 88,0 % (MapillarySLS), 58,4 % (Nordland). CosPlace erreicht den Stand der Technik mit 8-fach kleineren Deskriptoren.
   - Voraussetzung und Grenze: Alle Zahlen stammen von Straßenbildern (Städte, Fahrzeugkamera). Für Innenräume mit Blick nach oben fand sich kein Beleg. Early Bird (Abstract) nennt Wahrnehmungs-Aliasing und fast 180° gedrehte Blickrichtungen als Hauptproblem in Innenräumen; dass globale Deskriptoren dort versagen, steht so nicht im Abstract [Vermutung]. Ein Sekundärauszug nennt für den Innen-Datensatz NYC-Indoor-VPR NetVLAD-Recall@1 von etwa 35 % und AnyLoc schlechter als NetVLAD (Zahl nur aus Suchauszug, nicht in der Quelle bestätigt).
   - Wirkung bei uns: liefern keine Lage, nur Kandidaten, und die Kandidaten sind schon gefunden. Falsche Zuordnung durch 90°/180°-Symmetrie im rechtwinkligen Raum ist hier der Hauptfehler und wird dadurch nicht kleiner.
   - Quellen: Nr. 4 (NetVLAD), Nr. 5 (CosPlace), Nr. 6 (MixVPR), Nr. 7 (Early Bird), Nr. 8 (NYC-Indoor-VPR), alle [A].
4. **Lernbasierte lokale Merkmale und Matcher (SuperPoint, LightGlue, ALIKED, XFeat).**
   - Kernergebnis: LightGlue 150 FPS bei 1024 Merkmalen auf RTX 3080, auf i7-10700K-CPU 20 FPS bei 512 Merkmalen. XFeat: laut Autoren bis zu 5-fach schneller als andere lernbasierte Merkmale, in Echtzeit auf Laptop-CPU. Das XFeat-Repository (Nr. 13, nicht das LightGlue-Repository) nennt ein LighterGlue-Modell, laut README etwa dreimal schneller als LightGlue, ohne Latenzzahlen; auf MegaDepth-1500 liegt es leicht hinter SuperPoint+LightGlue.
   - Grenze: Es gibt keinen Test mit weißen Decken. Die Überlegenheit gegenüber SIFT/ORB ist auf Bildern mit Textur gezeigt. Es ist offen, ob dort, wo ORB/SIFT nichts finden, gelernte Merkmale mehr Korrespondenzen auf einer weißen Fläche liefern ([Vermutung]: nur geringfügig, weil auch die Netze Gradienten brauchen).
   - Quellen: Nr. 9 (SuperPoint), Nr. 10 (LightGlue), Nr. 11 (XFeat), Nr. 12 (LightGlue-Repository: FPS und Lizenzen, Seite geprüft), Nr. 13 (XFeat-Repository: Lizenz, LighterGlue, Seite geprüft), alle [A].
5. **Geometrische Ausrichtung ohne Merkmals-Zuordnung (Floorplan-Jigsaw).**
   - Kernergebnis: Teilscans mit wenig Überlappung werden über Raumgrundriss-Annahme ausgerichtet: Manhattan-Welt, ein geschlossener Pfad entlang des Grundrisses, kein Merkmalsabgleich. Richtige globale Platzierung in 85,1 % der Szenen. Ohne den Schleifenterm nur 22,8 %. Auf SUNCG-Syntheseszenen Rotationsfehler 8,79° und Translationsfehler 9,15 % der Bounding-Box-Diagonale. Die Merkmals-Methoden (3DMatch, FPFH) liegen bei 40–43° und 20–29 %.
   - Voraussetzungen: RGB-D-Teilscans mit Tiefe, Manhattan-Welt, bekannte oder geschätzte lokale Raumlayouts. Die Translationsfehler (9 % der Diagonale, bei einem Raum mit 8 m Diagonale etwa 70 cm) sind für uns zu grob.
   - Lehre: Der Schleifenterm (Anfang schließt an Ende an) ist entscheidend, der Rest ist ein Hilfsterm. Das passt zu unserer Beobachtung, dass Rückkehr (P2) und Abschnittsverbindung (P1) zusammen gelöst werden sollten.
   - Quelle: Lin/Li/Wang 2019 (Nr. 14) [V]: Abstract, Methode, Tabellen 1 und 2.
6. **Hypothese und Prüfung für Schleifenschluss.**
   - Kernergebnis: Schleifenhypothesen werden gleichzeitig mehrfach erzeugt und gegen mehrere Blickpunkte entlang des Pfades geprüft, weil selbst gute Ortserkennung viele Fehltreffer durch Aliasing erzeugt.
   - Grenze: Experiment mit Stereo-SLAM und tiefen Merkmalen, nicht Innenraum. Übertragbar ist das Muster, nicht die Zahlen.
   - Quelle: Tanaka 2016 (Nr. 15) [A]: Abstract und Einleitung der lokalen Kopie.
7. **Texturarme Decken und Blick nach oben: Literaturlage.**
   - Die gefundene Literatur zu Kameras mit Blick zur Decke betrifft fast nur Roboter, die senkrecht nach oben schauen (Rituerto u. a. 2016: Deckenkamera gilt als stabile Bildregion, Ortserkennung bleibt auf dem Niveau eines gewöhnlichen Vokabulars; Nr. 16 [A]). Für ein handgehaltenes Telefon, das schräg auf die Wand-Decke-Kante zielt, fand sich kein Beleg.
   - Zu weißen, texturarmen Flächen: Allgemein gilt, dass punktbasierte Systeme dort Merkmale verlieren (LiPo-LCD, Floorplan-Jigsaw nennt ausdrücklich Wände ohne Merkmale als Ausfallfall für ORB-SLAM). Ein belastbarer Beleg mit Zahlen für die weiße Decke fehlt. [Vermutung]: Wo ARCore die Ortung verliert, fehlen Merkmale auch für unsere eigene Wiedererkennung. Die Ausfälle sind dann korreliert, und die Wiedererkennung fällt genau dort weg, wo man sie braucht.
   - Quellen: Nr. 3 [V], Nr. 14 [V], Nr. 16 [A].

**Best Practice (Industrie/Open Source):**
- **ORB-SLAM3:** Atlas mit mehreren Karten, Wiedererkennung über DBoW2 mit geometrischer Prüfung. Karten werden erst nach Bestätigung durch drei Schlüsselbilder zusammengeführt (Nr. 2, [A]; im Projekt schon in `2026-10-29-weltrahmen-messungen.md` vermerkt).
- **Apple RoomPlan:** Mehrere Räume entstehen entweder in einer durchgehenden ARKit-Sitzung oder über gespeicherte ARWorldMaps, die ARKit per Bildmerkmalen und LiDAR-Karte wieder findet. Danach fügt `StructureBuilder` die einzelnen `CapturedRoom` zusammen. Quelle: nur Suchauszug (Apple-Seite war beim Abruf leer), also [A]. Ein Entwicklerforum-Thread berichtet, dass zusammengeführte Räume übereinander liegen können, wenn die Relokalisierung scheitert (Nr. 17, [A]). Damit ist auch die Produktlösung nicht robust gegen Relokalisierungsfehler.
- **ARCore (nativ):** Cloud Anchors lösen einen Anker über Bildmerkmale auf. Das Auflösen verlangt, dass das Gerät dieselbe Umgebung sieht, und Netzwerk (Nr. 18, [A]). Chrome/WebXR bietet das nicht ([Vermutung], keine Quelle gefunden). Der Anker-Dienst hilft uns daher nicht.
- **hloc/LaMAR-Stil (Forschung, nativ):** Bildabruf (NetVLAD), lokale Merkmale (SuperPoint) und Matcher (LightGlue) auf GPU. Das Verfahren ist für große Karten mit Merkmalen gedacht und läuft auf dem Server oder nativ (Nr. 19, [A]).
- **magicplan:** Setzt auf manuelles Ecken-Antippen im Raum statt auf Wiedererkennung. Die Quelle dazu liegt lokal (`2103.08297_GRIHA…`) und wurde hier nicht erneut gelesen. [Vermutung] für diese Aussage.

**Auf unserem Stack:**
- **Rechenbudget.** 640×287 Luma im Worker, etwa 3 Bilder/s, also etwa 330 ms je Bild, davon ELSED etwa 5 ms.
- **Option A: ORB in JS (vorhanden, ~120 Zeilen).**
  - Zeit auf dem Pixel nicht gemessen. Der Mac braucht 11–19 ms, die Schätzung für den Pixel (25–40 ms) ist unsicher. Passt in 330 ms mit großer Reserve.
  - Lizenz unkritisch (eigener Code, ORB ist freie Technik). Abhängigkeit: keine.
  - Aufwand 2–3 Wochen für den Faktor in M6 (vorhandene Schätzung). Das Risiko liegt in der Abdeckung (16–21 %), nicht in der Rechenzeit.
- **Option B: ORT-Web (WASM) mit XFeat oder SuperPoint plus LightGlue.**
  - Ohne COOP/COEP-Header gibt es kein SharedArrayBuffer, ONNX Runtime Web läuft dann einthreadig (Nr. 20, [A]: Dokumentation und Backend-Quelltext aus Suchtreffern). Ob Hetzner Webspace die Header per `.htaccess` erlaubt, ist nicht geprüft [Vermutung: unsicher]. Allgemein ist Inferenz im Browser auf Handys laut einer Messreihe im Mittel 15,8-fach langsamer (CPU) bzw. 7,8-fach langsamer (GPU) als nativ (Nr. 21, [V], nur die Gesamtwerte aus dem Abstract; die Reihe betrifft andere Modelle).
  - Mit SIMD und Threads sank die Vorhersagezeit im selben Versuch um 64,7 % (nur PC-Tabelle, Gerät bei Tabelle 2 nicht gesichert). Ein Modell wie MobileNetV2 braucht dort 89–235 ms. Die Zahlen sind kein Maß für den Pixel.
  - WebGPU läuft in Chrome auf Android ab Android 12 mit Qualcomm- und ARM-GPU (Nr. 22, [V] Blogseite geöffnet). Der Pixel 9 Pro hat nach meinem Wissen eine ARM-Mali-GPU [Vermutung, nicht geprüft]. Ob WebGPU-Rechnen im Worker neben der WebXR-WebGL-Sitzung ohne Ruckeln läuft, ist nicht belegt und muss am Gerät gemessen werden.
  - Modelle: SuperPoint hat eine **einschränkende Lizenz** für Gewichte (Nr. 12, [A]). LightGlue (Gewichte und Code) steht unter Apache-2.0, ALIKED unter BSD-3. XFeat-Code steht unter Apache-2.0, eine Gewichtslizenz ist nicht genannt, einen offiziellen ONNX-Export gibt es nicht (Nr. 13, [A]). Ein ONNX-Export von LightGlue existiert als Fremdprojekt (Nr. 23, [A]). Dass die LightGlue-Operatoren in ORT-Web laufen, ist nicht belegt.
  - Aufwand [Vermutung]: 2–4 Wochen mit hohem Risiko, bevor überhaupt klar ist, ob es mehr Paare verbindet.
- **Option C: MediaPipe-Bildeinbettung.** MobileNet-V3 mit 224×224 braucht auf einem Pixel 6 laut Doku 3,94 ms (small, CPU) bzw. 9,75 ms (large, CPU), nativ, nicht im Web (Nr. 24, [V] Seite geöffnet). Die Web-Laufzeit ist [Vermutung] mehrfach langsamer. Die Einbettung ist auf ImageNet trainiert und taugt nicht für Ortserkennung, nur als grober Versuch. Ich rate ab.
- **Option D: Geometrie (Grundriss-Fingerabdruck, Hypothese und Prüfung).**
  - Eingang: Wände eines Abschnitts (Normale, Abstand, sichtbare Länge) im Abschnittsrahmen, plus Gyro-Brücke (Gier auf etwa 1°) und Ortungs-Lücke dt.
  - Hypothesen: Gier-Zweige entfallen durch die Gyro-Brücke weitgehend (die 90°/180°-Mehrdeutigkeit war die Hauptschwäche des Orakels). Es bleibt die Verschiebung. Suchraum: nach den Messungen 0,2–1 m, anfangs begrenzt durch dt mal Gehgeschwindigkeit.
  - Prüfung: Wie viele Wandlinien beider Abschnitte stimmen überein (Normale ≤ 3°, Abstand ≤ 10 cm), plus Nullhypothese gegen zufällige Passung (Doppellinien im Abstand 15–40 cm sind der bekannte Fehlertyp).
  - Grenze: Die Verschiebung entlang paralleler Wände (0,4–7,9 m Mehrdeutigkeit im Orakel) bleibt unbeobachtbar, wenn beide Abschnitte nur die gleichen parallelen Wände sehen. Dann gibt es nur eine Achse (14–15 von 31 Paaren). Der Fingerabdruck allein löst P1 nicht, er fixiert höchstens eine Achse pro Paar. Eine vollständige Lage braucht den Schleifenterm (siehe Jigsaw, P2) oder Bildmerkmale.
  - Rechenzeit: vernachlässigbar (Zehntel Millisekunden bis wenige Millisekunden je Paar, [Vermutung]). Aufwand 3–5 Tage, weil Wandpaare, Gier-Brücke und Ausgleichung schon da sind. Keine Abhängigkeiten, keine Lizenz.
- **Vergleich für unseren Fall.**

| Kriterium | Bildmerkmale (ORB/XFeat) | Geometrie (Fingerabdruck) |
|---|---|---|
| Liefert Lage | volle Lage, wenn Merkmale da sind | meist eine Achse |
| Abdeckung | 16–21 % der Paare (SIFT, offline) | 14–15 von 31 Paaren, eine Achse |
| Weiße Decke | Merkmale fehlen genau dort | unabhängig von Textur |
| Rechenzeit | 11–40 ms/Bild (ORB), Netze unklar | vernachlässigbar |
| Aufwand | 2–3 Wochen (ORB), Netze unklar | 3–5 Tage |
| Hauptrisiko | Abdeckung, Korrelation mit Ortungsverlust | Mehrdeutigkeit entlang paralleler Wände |

  - Beide Quellen sind fast ergänzend: Geometrie bestimmt die Gier und eine Achse sicher, Bilder liefern, wo vorhanden, die zweite Achse. Das gemeinsame Problem ist, dass beide an denselben Brüchen schwach sind, an denen ARCore selbst keine Merkmale hat ([Vermutung]).

**Empfehlung: messen, vor jedem Bau; Reihenfolge Geometrie, dann ORB, Netze zuletzt.**
1. **Zuerst die Geometrie als Kandidat messen (3–5 Tage), mit Gyro-Brücke.** Auf dem Prüfstand mit bekannter Wahrheit (Identität, kein Orakel): Wie viele der 19 Fenster (A6 13, A7 20, A8 17, B1600 19, B1714 17) werden mit dem Fingerabdruck in Gier ≤ 3° und mindestens einer Achse ≤ 10 cm zusammengesetzt, und wie viele Fehltreffer entstehen?
2. **Dann ORB aus dem Video (nach Rig-Umbau) als zweite Quelle** für die zweite Achse messen. Das Rig muss dafür das Video behalten.
3. **Die eine entscheidende Messung für Netze:** SuperPoint/ALIKED + LightGlue und XFeat offline in Python auf denselben Abschnittspaaren im Prüfstand mit bekannter Wahrheit. Steigt der Anteil der Paare mit prüfbarer Relativlage deutlich über die 16–21 % von SIFT, und schlägt die Lage den heutigen Versatz am Prüfstand? Wenn nein: gelernte Merkmale verwerfen, nichts in den Browser portieren. Wenn ja: erst dann ORT-Web-Test (Header, Latenz auf dem Pixel).
4. **Globale Deskriptoren (NetVLAD/MixVPR/CosPlace) und die MediaPipe-Einbettung: verwerfen.** Sie zielen auf das Kandidaten-Finden, das nicht der Engpass ist, und sie sind auf Straßenbilder trainiert.
5. **Nativ nötig?** Nur für hloc-ähnliche Verfahren oder echte Merkmals-Netze mit voller Rate. Erst relevant, wenn Schritt 3 positiv ausfällt und ORT-Web zu langsam ist.

**Quellen:**
1. Gálvez-López, Tardós 2012, Bags of Binary Words for Fast Place Recognition in Image Sequences, lokal `paper/galvez2012_DBoW2_bags_binary_words_place_recognition_TRO.pdf` (IEEE T-RO 2012).
2. Campos u. a. 2021, ORB-SLAM3, https://arxiv.org/abs/2007.11898 (lokal `paper/2007.11898_ORB-SLAM3_multimap_fisheye_KB.pdf`).
3. Company-Corcoles, Garcia-Fidalgo, Ortiz 2020, LiPo-LCD, https://arxiv.org/abs/2009.09897 (lokal `paper/2009.09897_LiPo-LCD_lines_points_loop_closure.pdf`).
4. Arandjelović u. a. 2016, NetVLAD, https://arxiv.org/abs/1511.07247
5. Berton, Masone, Caputo 2022, CosPlace, https://arxiv.org/abs/2204.02287
6. Ali-bey, Chaib-draa, Giguère 2023, MixVPR, https://arxiv.org/abs/2303.02190
7. Tourani u. a. 2020 (arXiv; VISAPP 2021), Early Bird, https://arxiv.org/abs/2010.01421
8. Sheng u. a. 2024, NYC-Indoor-VPR, https://arxiv.org/abs/2404.00504 (die Zahl NetVLAD ~35 % nur aus Suchauszug, nicht verifiziert)
9. DeTone, Malisiewicz, Rabinovich 2018, SuperPoint, https://arxiv.org/abs/1712.07629
10. Lindenberger, Sarlin, Pollefeys 2023, LightGlue, https://arxiv.org/abs/2306.13643
11. Potje u. a. 2024, XFeat, https://arxiv.org/abs/2404.19174
12. LightGlue-Repository (Lizenzen, FPS), https://github.com/cvg/LightGlue
13. XFeat-Repository, https://github.com/verlab/accelerated_features
14. Lin, Li, Wang 2019, Floorplan-Jigsaw, https://arxiv.org/abs/1812.06677 (lokal `paper/1812.06677_floorplan_jigsaw_partial_scans.pdf`)
15. Tanaka 2016, Multi-Model Hypothesize-and-Verify for Incremental Loop Closure Verification, https://arxiv.org/abs/1608.02052 (lokal `paper/1608.02052_hypothesize_verify_incremental_loop_closure.pdf`)
16. Rituerto u. a. 2016, Building an Enhanced Vocabulary of the Robot Environment with a Ceiling Pointing Camera, Sensors 16(4):493, https://doi.org/10.3390/s16040493 (nur Suchauszug)
17. Apple Developer Forum, Issue with Merging Rooms – RoomPlan, https://developer.apple.com/forums/thread/733945 (nur Suchauszug)
18. ARCore Cloud Anchors Codelab, https://codelabs.developers.google.com/codelabs/arcore-cloud-anchors (nur Suchauszug)
19. Sarlin, Dusmanu u. a. 2022, LaMAR, https://arxiv.org/abs/2210.10770 (lokal `paper/2210.10770_LaMAR_AR_localization_benchmark_laser_GT.pdf`, [V] nur Einleitung/Datentabelle)
20. ONNX Runtime Web, Threads und crossOriginIsolated, https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html (WebGPU-Seite geöffnet; Thread-Aussage nur aus Suchauszug der Backend-Quelle)
21. Wang u. a. 2024, Anatomizing Deep Learning Inference in Web Browsers, https://arxiv.org/abs/2402.05981 (lokal `paper/2402.05981_anatomizing_DL_inference_web_browsers_mobile.pdf`)
22. Chrome-Team, WebGPU auf Android (Chrome 121), https://developer.chrome.com/blog/new-in-webgpu-121
23. LightGlue-ONNX, https://github.com/fabio-sim/LightGlue-ONNX (nur Suchauszug)
24. MediaPipe Image Embedder, https://developers.google.com/edge/mediapipe/solutions/vision/image_embedder

---

## P2 – Rückkehr zur Anfangswand (Ringschluss)

**Problem:**
- Wird die Rückkehr nicht erkannt, verdoppelt eine zweite Runde die Skizze (73 statt etwa 34 m²).
- Stand 26 erkennt die Rückkehr bei Drehung ab 300° und Lage innerhalb 10° / 40 cm zu einer Anfangserfassung. Das trifft in 6 von 10 Aufnahmen. Nicht erkannt: 26.10. 16:00 (nur 178° gedreht), 29.10. 19:23, 31.10. 11:37 (1,1 m daneben), 31.10. 08:47 (erst ab 50 cm).
- Zwischen 70° und 300° gab es im Raster bei 10° / 40 cm einen Fehltreffer (bei 10° / 50 cm sind es 10).

**Aktueller Ansatz (Stand 26):**
- Rein geometrische Rückkehr. Die kumulierte Drehung (aus den Posen, jetzt mit Gyro) wird je Bild abgewickelt. Ab 300° wird die Wand mit allen Anfangserfassungen verglichen.
- Bei Treffer: weicher Rundenbruch `opt.runde` (0,3 m / 6°) in der Ausgleichung und der feste Zustand „Runde komplett“.
- Von den vier Fehlfällen ist einer eine zu kurze Drehung (178°, wohl keine Rückkehr). Bei den anderen steht der Versatz (bis 1,1 m) nach der Messung im Zusammenhang mit Ortungsbrüchen [Vermutung für die Ursache]. Die Rückkehr-Prüfung vergleicht gegen eine Welt, die dann selbst schon verschoben ist. Weitere Lockerung der Schwelle bringt Fehltreffer (10°/50 cm: 7 Rückkehren, aber 10 Fehltreffer).

**Wissenschaft:**
1. **Erst Kandidaten, dann geometrische Prüfung (DBoW2/ORB-SLAM3).**
   - Kernergebnis: Schleifenschluss braucht Kandidaten aus Bag-of-Words und geometrische Bestätigung. ORB-SLAM3 prüft Kandidaten zuerst geometrisch und dann lokal über drei Nachbar-Schlüsselbilder, dadurch steigt der Recall gegenüber der Zeit-Konsistenz von DBoW2.
   - Voraussetzung: Bildmerkmale an beiden Stellen. Quellen Nr. 1 (V) und Nr. 2 (A), wie in P1.
2. **Hypothese und Prüfung mit mehreren Blickpunkten (Tanaka).**
   - Kernergebnis: Aliasing erzeugt auch bei gutem VPR viele Fehltreffer. Abhilfe: mehrere Schleifenhypothesen, jede wird gegen die Ortserkennung an mehreren Stellen entlang des Pfades geprüft.
   - Übertragung: Eine Rückkehr gilt erst, wenn mehrere aufeinanderfolgende Erfassungen sie stützen. Das senkt Fehltreffer und kostet Zeit, die wir ohnehin haben (die Rückkehr wird bei 359° nicht schlagartig gebraucht). Quelle Nr. 15 [A].
3. **Schleifenterm als Kern der Geometrie (Jigsaw).**
   - Kernergebnis: Ohne Schleifenterm 22,8 %, mit allen Termen 85,1 % richtiger globaler Platzierungen. Der geschlossene Pfad ist das stärkste Signal.
   - Übertragung: Statt die Rückkehr als harte Ja/Nein-Erkennung zu bauen, die Schließung als Hypothese mitführen und die Passung der geschlossenen gegen die offene Fassung bewerten. Quelle Nr. 14 [V].
4. **Innenräume mit Aliasing.**
   - Early Bird: Wahrnehmungs-Aliasing und fast 180° gedrehte Blickrichtungen sind laut Abstract das Problem in Innenräumen. Die Abhilfe, eine Draufsicht-Homographie vor den Merkmalen, setzt laut Abstract eine Bodenebene (bodengebundener Roboter) voraus und passt nicht zu einer handgehaltenen Kamera mit Blick zur Wand-Decke-Kante. Das Paper stammt von 2020 (VISAPP 2021). Quelle Nr. 7 [A].
   - NYC-Indoor-VPR: Aliasing und Verdeckung gelten als Hauptproblem innen. Quelle Nr. 8 [A].
5. **Ceiling-View-Grundriss.** DuLa-Net (lokal `paper/1811.11977_dulanet_ceiling_view_layout.pdf`) und die Ceiling-Literatur aus P1 liefern keine Rückkehr-Erkennung für handgehaltene Geräte. Nicht erneut gelesen. [Vermutung] für diese Einordnung.
6. **Grenze der Literatur.** Alle gefundenen Verfahren (Bag-of-Words, tiefe Deskriptoren) nehmen bildmerkmalsreiche Szenen an. Für eine Rückkehr zur Wand-Decke-Kante vor einer weißen Wand liefert die Literatur keinen Beleg.

**Best Practice (Industrie/Open Source):**
- **ORB-SLAM3 / DBoW2:** Der Standard in Open-Source-SLAM. Kandidaten über Vokabular, Bestätigung geometrisch. (Nr. 1, 2.)
- **Apple RoomPlan:** Der Nutzer wird angehalten, den Raum zu umrunden. Einen sichtbaren Ringschluss-Algorithmus nennt die gelesene Quelle nicht [Vermutung].
- **magicplan, Matterport, Polycam:** Dazu wurden keine Quellen gelesen. Nicht bewertet.

**Auf unserem Stack:**
- **Der Kandidatenraum ist winzig.** Nur die Erfassungen der Anfangswand kommen in Frage, etwa 10–20 Schlüsselbilder. Ein Vokabular oder ein globaler Deskriptor ist dafür Überbau.
- **Bildweg (vorgeschlagen, nicht belegt).** Nach ≥ 300° Drehung das aktuelle Bild direkt mit den etwa 10–20 Start-Schlüsselbildern abgleichen, mit dem vorhandenen JS-ORB, etwa 3 Bilder/s. Das ist [Vermutung] machbar (11–19 ms/Bild am Mac, Pixel nicht gemessen). Er liefert die Lage relativ zum Start, auch wenn die Welt verschoben ist, und hebt so die Ursache der vier Fehlfälle auf. Aufwand 3–5 Tage, Risiko: Abdeckung (die Anfangswand ist oft dieselbe weiße Fläche) und Gierfehler durch die Blickrichtung.
- **Geometrischer Weg (ausbauen).** Zusätzlich zur Position die **Wandform** vergleichen: Wenn die aktuell gesehene Wand zur Anfangswand parallel ist, Abstände zu den beiden Nachbarwänden stimmen und die Dreh-Summe ≥ 300° ist, gilt Rückkehr mit größerer Ortstoleranz (z. B. 100 cm), aber nur in Verbindung mit dem Schleifenterm (Summe aller Wandwinkel ≈ 360°). Der Aufwand beträgt 2–4 Tage, ohne neue Abhängigkeit. Risiko: Fehltreffer an der gegenüberliegenden Wand. Die liegt parallel, aber einen Raum-Durchmesser entfernt, deshalb schützt der Abstand.
- **Netze, WebGPU, globale Deskriptoren:** Für 10–20 Kandidaten unnötig. Die in P1 genannten Grenzen des Stacks (kein SharedArrayBuffer, nicht gemessene WebGPU-Latenz, Lizenzen) gelten auch hier.
- **Rechenbudget:** 3 Bilder/s Wiedererkennung gegen 10–20 Schlüsselbilder mit ORB: nach der Mac-Zeit (11–19 ms je Bild) weit unter dem Budget [Vermutung für den Pixel].

**Empfehlung: messen (billigster Weg zuerst), dann entscheiden; nichts neu bauen, was ein Vokabular braucht.**
1. **Die eine entscheidende Messung:** Auf den vier verpassten Rückkehren der 10 Aufnahmen (z. B. 31.10. 11:37 mit 1,1 m Versatz) das aktuelle Bild nach ≥ 300° gegen die Start-Schlüsselbilder mit dem vorhandenen JS-ORB abgleichen. Dazu die Fehltreffer zwischen 70° und 300° zählen.
2. **Annehmen als zweiter Auslöser**, wenn mindestens 2 der 4 Fälle gefunden werden und keine Fehltreffer entstehen. Sonst: Bildweg verwerfen und nur den geometrischen Weg (Wandform plus Schleifenterm) weiterbauen.
3. **Vorbedingung:** Das Rig muss das Video behalten, und für die Messung müssen die Aufnahmen Bilder enthalten (die Aufnahmen mit `video` sind teils 31–44 MB, P15).
4. **Verwerfen:** Vokabular/Bag-of-Words, NetVLAD/MixVPR/CosPlace, SuperPoint/LightGlue im Browser für P2. Der Gewinn rechtfertigt weder den Aufwand noch die Lizenz- und Laufzeitrisiken.

**Quellen:**
1. Gálvez-López, Tardós 2012 (siehe P1 Nr. 1).
2. Campos u. a. 2021, ORB-SLAM3, https://arxiv.org/abs/2007.11898
3. Tanaka 2016, https://arxiv.org/abs/1608.02052
4. Lin, Li, Wang 2019, Floorplan-Jigsaw, https://arxiv.org/abs/1812.06677
5. Tourani u. a. 2021, Early Bird, https://arxiv.org/abs/2010.01421
6. Sheng u. a. 2024, NYC-Indoor-VPR, https://arxiv.org/abs/2404.00504
7. Zhang u. a. (DuLa-Net), lokal `paper/1811.11977_dulanet_ceiling_view_layout.pdf` (nicht neu gelesen)

---

**Offene Fragen:**
- Läuft ORT-Web (einthreadig oder WebGPU) auf dem Pixel 9 Pro neben der WebXR-Sitzung ohne Ruckeln? Erlaubt Hetzner Webspace COOP/COEP per `.htaccess`, und stört COEP die WebXR-Sitzung? Alles ungemessen.
- ORB-Zeit auf dem Pixel 9 Pro (Schätzung 25–40 ms ist unbelegt).
- Liefern gelernte Merkmale (XFeat, ALIKED, SuperPoint) auf weißen Decken mit Blick zur Kante mehr Paare als SIFT/ORB (16–21 %)? Kein Beleg in der Literatur gefunden.
- Ist die Ortungsverlust-Zone von ARCore mit der Zone ohne Bildmerkmale gleich (Korrelation)? Nur Vermutung.
- Gewichtslizenzen: XFeat und ALIKED nicht aus den Gewichtsdateien geprüft; SuperPoint-Lizenz nur als „restriktiv“ bestätigt (Wortlaut nicht gelesen).
- Nicht lesbar: Apple-Dokumentation zu RoomPlan-Mehrraum (Seite leer), Hoshi u. a. 2024 (Springer-Anmeldeumleitung), Rituerto 2016 (PMC-Browserprüfung). Aussagen dazu stehen nur als Suchauszug.
- Nicht recherchiert: magicplan/Matterport/Polycam-Verfahren für den Ringschluss.

Prüfstand: 24 Quellen geprüft, 5 korrigiert, 0 entfernt.


---

<!-- 03-ringschluss.md -->

# Recherche 03: Ringschluss und Rückkehr-Erkennung beim Rundgang

Stand der Seite: 26. Quellenlage: lokale PDFs im Volltext geprüft ([V] = Text der relevanten Abschnitte selbst gelesen, [A] = nur Abstract, Einleitung oder Sekundärquelle). paperStash wurde nicht benötigt, alle genutzten Paper lagen schon in `/Volumes/external/TobiCodetEndlichWieder/Zaene/paper/`. Es wurde nichts neu heruntergeladen.

## P2 – Rückkehr zur Anfangswand (Ringschluss)

**Problem:** Wer nach dem Rundgang weiterschwenkt, verdoppelt die Skizze (73 statt ~34 m²), weil die zweite Runde als neue Wände landet. Unsere Regel (Blickdrehung ≥ 300°, Erfassung ≤ 10° und ≤ 40 cm neben einer Anfangserfassung) trifft in 6 von 10 Aufnahmen. Sie scheitert, wenn nach Ortungsbrüchen der Versatz größer als 40 cm ist (31.10. 11:37: 1,1 m daneben; 31.10. 08:47: erst ab 50 cm). Lockern auf 50 cm bringt 7 Treffer, aber 10 Fehltreffer an anderen Wänden. Die Drehung ist dagegen verlässlich: Die Gyro-Brücke drückt den Drehfehler an Brüchen von 14,6° auf 0,8°. Der Versatz ist also das schwache Glied, nicht die Richtung.

**Aktueller Ansatz (Stand 26):** Ein einziger harter Test auf ein einziges Wandpaar (Winkel und euklidischer Abstand) nach genug kumulierter Drehung. Treffer löst den weichen Rundenbruch (0,3 m / 6°) in der Ausgleichung und den festen Zustand „Runde komplett“ aus. Das reicht nicht, weil (a) die Entscheidung auf einer einzelnen Erfassung ruht, (b) die Positionstoleranz die Drift nicht berücksichtigt (sie ist nach einem Bruch um Größenordnungen größer als im sauberen Abschnitt mit Median 3,6 cm) und (c) ein Fehltreffer nicht von selbst auffällt. Der Selbst-Abschluss nach Ortungsbrüchen ist bewusst gesperrt, der Nutzer muss tippen.

**Wissenschaft:**
1. **Schlussfehler als Beobachtung statt als Fehler (Kim et al. 2012) [V].** Handgeführtes System mit Tiefenkamera, Manhattan-Annahme: Die Wandfolge wird als Schleife achsparalleler Ebenen geführt. Kehrt der Nutzer zur ersten Wand zurück, erscheint dieselbe Wand mit zwei Versätzen (x = a und x = c). Das System erkennt „dieselbe Wand" an der Reihenfolge (links/rechts-Beziehung der Nachbarwände), nicht am Abstand, und löst eine eindimensionale quadratische Ausgleichung mit der Bedingung c = a aus. Voraussetzung: abwechselnde Achsrichtungen und eine zuverlässige Wandreihenfolge. Grenze: Manhattan-Annahme, Zahlen zum Erkennungserfolg stehen nicht im geprüften Text.
2. **Volle Drehung erkennen und Gyro-Drift verteilen (Sankar & Seitz 2012) [V].** Smartphone-Rundumaufnahme eines Raums: Der Gyro driftet bis ±10° pro 360°; das Magnetometer wird nur benutzt, um zu erkennen, dass die volle Drehung vollendet ist, und die Lücke zwischen Anfangs- und Endorientierung wird gleichmäßig über die Drehung verteilt. Das ist die einfachste Form des Rundenschlusses und passt zu unserem 300°-Kriterium. Unser Gyro mit Live-Kalibrierung ist laut Messung deutlich besser (0,8° an Brüchen).
3. **Schlussbedingung als Zielgröße der Grundrissauswahl (Lin et al. 2018/2019, Floorplan-Jigsaw) [V].** Teilscans werden als Pfad end-to-end verkettet; ein Schlussterm misst die Manhattan-Distanz zwischen Start- und Endpunkt des Pfads. Ablation (Tabelle 1): Anteil korrekter globaler Platzierungen 22,8 % ohne Schlussterm, 85,1 % mit allen drei Termen (ohne Komplexitätsterm 67,5 %, ohne Randähnlichkeit 80,2 %). Der Schluss ist dort das wirksamste einzelne Kriterium. Voraussetzung: es gibt eine endliche Menge von Platzierungshypothesen, aus der die geschlossene Lösung gewählt wird; sie läuft offline.
4. **Mehrere Hypothesen, nur die gegenseitig konsistenten behalten (PCM, Mangelson et al. 2018) [A: Abstract und Einleitung gelesen].** Alle Kandidaten für Ringschlüsse werden paarweise auf Verträglichkeit geprüft (Mahalanobis-Abstand mit Chi-Quadrat-Schwelle, daher ohne Handabstimmung der Schwelle). Die größte untereinander verträgliche Menge ist eine maximale Clique; laut Autoren in Echtzeit lösbar und besser als DCS, SCGP und RANSAC in ihren Tests. Das ist das passende Gerüst für „Abstimmung über mehrere Wandpaare": Jedes Wandpaar (Anfangswand i, jetzige Wand j) schlägt dieselbe Verschiebung vor, nur gemeinsam verträgliche Paare zählen. Grenze: paarweise Verträglichkeit ist nicht gemeinsame Verträglichkeit (die Autoren sagen das selbst).
5. **Spätere Beweise können frühere Ringschlüsse widerrufen (RRR, Latif/Cadena/Neira 2012) [A: Abstract und Einleitung].** Ringschluss-Hypothesen werden nach Verträglichkeit untereinander und mit der Bahn über die Zeit geprüft; inkonsistente werden entfernt. Das stützt unseren Gedanken „fester Zustand, aber wieder offen, wenn die Auswertung kippt".
6. **Geometrische Prüfung mit Kandidatenliste (ORB-SLAM3, Campos et al. 2021) [V für Abschnitt VI].** Die Bag-of-Words-Anfrage liefert drei Kandidaten; die Pose wird per RANSAC aus drei 3D-3D-Treffern geschätzt, Stimmen über einem Schwellwert zählen; dann Verfeinerung und eine Prüfung in drei kovisiblen Schlüsselbildern. Die ältere DBoW2-Variante verlangt drei aufeinanderfolgende Treffer und liegt bei 100 % Präzision und 30–40 % Recall, ORB-SLAM3 tauscht die zeitliche Bestätigung gegen eine räumliche aus der bereits vorhandenen Karte. Lehre: eine Rückkehr nicht aus einem einzelnen Bild, sondern aus mehreren Beobachtungen in der Karte bestätigen. Grenze: setzt Punktmerkmale und Karte voraus, die wir nicht haben.
7. **Ringschluss-Test aus der Vermessung (Polygonzug) [A: Lehrbuchmaterial, Sekundärquelle].** Ein geschlossener n-Eck-Zug hat Innenwinkelsumme (n − 2)·180°; der Winkelschlussfehler ist Messsumme minus Soll. Der lineare Schlussfehler ist √(ΣΔx² + ΣΔy²), die Genauigkeit wird als Verhältnis Umfang : Schlussfehler (1:N) angegeben, die Bowditch-Regel verteilt die Korrektur proportional zur Streckenlänge. Das ist die belastbare Übersetzung von „Ring schließt" in Zahlen.
8. **Grenzen der Forschung [Vermutung].** Ich habe keine Arbeit gefunden, die Ringschluss speziell für einen von Hand geschwenkten Wand-Decke-Kanten-Rundgang mit Smartphone im Browser behandelt. Die Familie CrowdMap/Jigsaw (MobiCom 2014)/Walkie-Markie (NSDI 2013, 5–6 Läufe, Fehler bis ca. 3 m) löst ein anderes Problem (viele Nutzer, Gänge, WLAN-Landmarken) und liefert Meter- statt Zentimeter-Genauigkeit [A, Suchtreffer und USENIX-Seite]. Wie sie Schleifen im Einzelnen behandeln, steht in den geöffneten Seiten nicht. GRIHA (2103.08297) arbeitet aus Bildern ohne Bahn und kennt im geprüften Text keinen Ringschluss [A, nach Stichwortsuche im Volltext]. Floorplan-SLAM (2503.00397, Stereo, Punkt-Ebene, Mehrsitzungs-Karten) hat ein Ringschluss- und Kartenfusionsmodul, das Verfahren selbst wurde nicht gelesen [A].

**Best Practice (Industrie/Open Source):**
- **Apple RoomPlan:** Die WWDC23-Sitzung (10192) behandelt Mehrraum-Scans und Zusammenführung (`StructureBuilder`, eine fortlaufende ARSession oder Relokalisierung gegen eine gespeicherte `ARWorldMap`), nennt aber weder Drift noch Ringschluss. Empfohlene Bedingungen: Einfamilienhaus bis etwa 186 m², mindestens 50 lux. Wie RoomPlan intern den Raum schließt, ist dort nicht dokumentiert [V, Transkript gelesen].
- **magicplan:** Die Hilfeseite nennt keine Zahl und keine Ringschluss-Logik; Hinweise: während des Scans an einer Stelle stehen bleiben, falsche Ecken per Rückgängig löschen, für garantierte Maße Laserentfernungsmesser koppeln. Der Nutzer schließt den Umriss selbst [V, Seite gelesen]. Eine Quelle meldet, dass magicplan den AR-Scan auf Android 2024 entfernt habe, das habe ich nicht belegen können [Vermutung].
- **ORB-SLAM3:** Der Standard in der Robotik: Ortserkennung + geometrische Verifikation + Pose-Graph-Optimierung (siehe Punkt 6). Er schließt Ringe über das Aussehen, nicht über die Wandfolge.
- **ARCore/WebXR:** ARCore korrigiert intern bei Wiedererkennung. Anker-Posen dürfen sich bei jedem Session-Update ändern; WebXR meldet große Ursprungssprünge über das `reset`-Ereignis des Referenzraums, kleine oder schrittweise Korrekturen nicht (MDN; die Auslöser dort betreffen teils bounded/unbounded-Räume, für `local` nennt MDN vor allem manuelle Neukalibrierung). Daraus folgt: Sprünge im local-Raum sind nicht vorhersagbar und müssen in unserem Test als Unsicherheit eingehen [V für MDN-Beschreibung, Zusammenhang zu ARCore-Relokalisierung ist Vermutung].
- **Polycam, Matterport:** nicht untersucht.

**Auf unserem Stack:** Alle Verfahren, die wir brauchen, sind reine Geometrie auf ein paar Dutzend Wandkandidaten und laufen im Karten-Worker in JS in weit unter 1 ms (n ≤ 30 Paare, Clique per einfacher Rekursion). Kein WASM, kein OpenCV, keine Zusatzdaten nötig, Lizenz entfällt (Eigenbau). Was NICHT geht: Bildbasierte Ortserkennung mit Bag-of-Words (DBoW2/ORB-SLAM3) braucht Punktmerkmale und eine Karte, die wir nicht führen; Aufwand und Rechenzeit (Kanten im ganzen Bild haben wir bereits mit 20–40-facher Rechenzeit gemessen) sprechen dagegen [Vermutung für die Rechenzeit von Merkmalen auf dem Pixel 9 Pro in JS]. Konkreter Entwurf [Vermutung, aus den Quellen abgeleitet, nicht gemessen]:
1. **Richtung statt Ort:** Wandnormale und Drehsumme sind dank Gyro-Brücke auf < 1° genau; der Ortsversatz entlang der Wand ist für die Identität der Wand egal. Also: Identität über Normalenwinkel (≤ 10°) und kumulierte Drehung (360° ± Toleranz) entscheiden, Abstand nur senkrecht zur Wand und mit wachsender Toleranz je Ortungsbruch (Kovarianz, die an jedem Bruch um den gemessenen Sprung wächst; `reset` und Anker-Sprünge mitzählen).
2. **Mehrere Wandpaare:** Wenn die Rückkehr einsetzt, bildet jedes Paar (Anfangswand i, jetzige Wand j mit gleichem Normalenwinkel) eine Verschiebungshypothese. Zwei nicht parallele Paare bestimmen die Verschiebung ganz; PCM-Prüfung: alle Hypothesen müssen dieselbe Verschiebung (innerhalb der Kovarianz) ergeben. Die Reihenfolge der Wände im Kreis (Zahl der Ecken seit Start, Drehrichtung) dient als Zusatzbedingung wie bei Kim 2012. Das sollte Fehltreffer an anderen Wänden zwischen 120° und 300° verringern, weil diese Wände keine zweite, passende Wand mitbringen [Vermutung].
3. **Abschlusstest, dreiteilig:** (a) Winkelsumme: Summe der Außenwinkel der geschlossenen Wandfolge = 360° ± wenige Grad (n-Eck: Innenwinkel (n−2)·180°); (b) Schlussfehler: Abstand zwischen Anfangs- und Endpunkt der Wandkette im Verhältnis zum Umfang (Zielwert z. B. 1:100 bis 1:200, also 12–25 cm bei 25 m Umfang; die Zahl ist ein Ansatz, noch nicht gemessen); (c) Lückenfreiheit: jede Wand ist über ihre Länge oder zumindest an beiden Enden gesehen, größte ungesehene Strecke unter einer Schwelle (die bestehende Meldung „Wand 2, 1,4 m ungesehen" ist genau dieser Test). Bei erfülltem Schluss den Fehler nach Bowditch (proportional zur Länge) oder besser über die vorhandene Ausgleichung verteilen.
4. **Mehrere Runden:** Nach „Runde komplett" jede weitere Erfassung, deren Normale zu einer bestehenden Wand passt und deren senkrechter Abstand innerhalb der Kovarianz liegt, in diese Wand einrechnen und nie als neue Wand führen (so wie der Rundenbruch es schon im Kleinen tut). Das verhindert die Verdopplung, selbst wenn die Rückkehr erst spät erkannt wird.
5. **Widerruf:** Wird die Auswertung nach „Runde komplett" wieder offen, fällt der Zustand weg (ist schon so). Zusätzlich mit RRR-Gedanken: bei späteren Widersprüchen den Ringschluss entfernen, ohne Daten zu verlieren.
- **Aufwand:** Punkte 1 und 4: 1–2 Tage (Anpassung von `rueckkehrPruefen` und der Zuordnung). Punkt 2 (Paar-Konsistenz): 1–2 Tage. Punkt 3 (Abschlusstest): 1 Tag. Offline-Auswertung an den 10 Protokollen: 1 Tag. Gesamt etwa 4–6 Tage [Vermutung].
- **Risiko:** Fehltreffer (zwei falsche Wandpaare passen zufällig) bei rechteckigen Räumen, in denen gegenüberliegende Wände fast parallel und ähnlich lang sind; deshalb Drehsumme und Wandreihenfolge zusätzlich fordern. Räume mit nur 3–4 Wänden liefern wenige Paare, dort zählt vor allem die Drehsumme.

**Empfehlung:** **Messen, dann machen.** Zuerst am Prüfstand (Skript `rueckkehr.mjs`, 10 Protokolle) drei Varianten gegen die jetzige Regel laufen lassen: (A) Stand 26, (B) nur Normalenwinkel + senkrechter Abstand mit Toleranz, die je Ortungsbruch wächst, (C) B plus Paar-Konsistenz über mindestens zwei Wandpaare plus Wandreihenfolge. Reihenfolge der Umsetzung: B, dann der dreiteilige Abschlusstest, dann C. Verwerfen: Bildbasierte Ortserkennung (Aufwand und Rechenzeit ohne Aussicht auf Nutzen gegenüber der Geometrie). Die eine entscheidende Messung: je Variante Trefferzahl in den 10 Aufnahmen (Wahrheit: von Hand markierter Rückkehrzeitpunkt) und Fehltreffer zwischen 70° und 300° Drehung. Ziel: mindestens 8 von 10 Treffern bei null Fehltreffern; ab 50 cm lockern brachte bisher 7 Treffer mit 10 Fehltreffern, das ist die Vergleichsmarke.

**Quellen:**
1. Kim, Dolson, Sokolsky, Koltun, Thrun 2012, Interactive Acquisition of Residential Floor Plans, ICRA. Lokal: `/Volumes/external/TobiCodetEndlichWieder/Zaene/paper/kim2012_interactive_acquisition_floor_plans_ICRA.pdf` (URL im Lauf nicht geöffnet).
2. Sankar, Seitz 2012, Capturing Indoor Scenes with Smartphones, UIST. Lokal: `/Volumes/external/TobiCodetEndlichWieder/Zaene/paper/sankar2012_capturing_indoor_scenes_smartphones_UIST.pdf` (URL im Lauf nicht geöffnet).
3. Lin, Li, Wang 2019 (arXiv Dez. 2018), Floorplan-Jigsaw: Jointly Estimating Scene Layout and Aligning Partial Scans, ICCV 2019. https://arxiv.org/abs/1812.06677 (Lokal: `paper/1812.06677_floorplan_jigsaw_partial_scans.pdf`)
4. Mangelson, Dominic, Eustice, Vasudevan 2018, Pairwise Consistent Measurement Set Maximization for Robust Multi-robot Map Merging, ICRA. https://robots.engin.umich.edu/publications/jmangelson-2018a.pdf (im Suchtreffer gesehen; gelesen wurde die lokale Kopie `paper/mangelson2018_PCM_pairwise_consistency_map_merging_ICRA.pdf`)
5. Latif, Cadena, Neira 2012, Robust Loop Closing Over Time, RSS. Lokal: `paper/latif2012_RRR_robust_loop_closing_over_time_RSS.pdf` (URL nicht geöffnet).
6. Campos, Elvira, Gómez Rodríguez, Montiel, Tardós 2021, ORB-SLAM3. https://arxiv.org/abs/2007.11898 (Lokal: `paper/2007.11898_ORB-SLAM3_multimap_fisheye_KB.pdf`)
7. Tanaka 2016, Multi-Model Hypothesize-and-Verify Approach for Incremental Loop Closure Verification. https://arxiv.org/abs/1608.02052 [A]
8. Wang, Lv, Wei, Zhu, Wu 2025, Floorplan-SLAM. https://arxiv.org/abs/2503.00397 [A]
9. Goyal, Khan, Chattopadhyay, Bhatnagar 2021, GRIHA. https://arxiv.org/abs/2103.08297 [A]
10. Shen, Chen, Zhang, Moscibroda, Zhang 2013, Walkie-Markie: Indoor Pathway Mapping Made Easy, NSDI. https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/shen [A]
11. Apple, WWDC23 Session 10192, Explore enhancements to RoomPlan. https://developer.apple.com/videos/play/wwdc2023/10192/
12. magicplan Hilfe, How accurate is magicplan. https://help.magicplan.app/how-accurate-is-magicplan
13. MDN, XRReferenceSpace: reset event. https://developer.mozilla.org/en-US/docs/Web/API/XRReferenceSpace/reset_event (Seite geprüft: reset feuert bei großen Ursprungssprüngen, z. B. Neukalibrierung, Tracking-Verlust mit Wiedergewinn weit entfernt, Drift im unbounded-Raum; kleine und schrittweise Anpassungen lösen es nicht aus; Relokalisierung wird nicht erwähnt)
14. Polygonzug-Auswertung (Winkel- und Längenschlussfehler, Bowditch), Lehrmaterial Univ. Utah. https://my.civil.utah.edu/~bartlett/CVEEN%202410/homework/0133759040_Ch10_ISM-205259.pdf (nur im Suchtreffer gesehen) [A]
15. Eigene Messdokumente: `/Volumes/external/TobiCodetEndlichWieder/Zaene/docs/superpowers/research/2026-10-29-weltrahmen-messungen.md` (Abschnitt „Rückkehr zur Anfangswand"), `.../2026-10-24-kamera-raumerfassung-android.md` (Ausgleichung, Rundgang als Polygonzug).

**Offene Fragen:** (1) Wie CrowdMap/Jigsaw/Walkie-Markie und magicplan intern Schleifen schließen, steht in den geöffneten Quellen nicht; Volltexte nicht gelesen. (2) Wie Apple RoomPlan, Polycam und Matterport den Raum schließen, ist nicht dokumentiert beziehungsweise nicht untersucht. (3) Turning-Function-Verfahren (Arkin 1991) für Formvergleich von Wandfolgen: Quelle nur im Suchtreffer gesehen, DTIC-Seite gab 403; Nutzen für uns unklar. (4) Ob ARCore bei Relokalisierung ein WebXR-`reset` auslöst, ist unbelegt. (5) Welche Schlussfehlerschwelle (1:N) für Räume von 20–40 m² realistisch ist, braucht die Messung an den 10 Protokollen. (6) Für zweistufige Verfahren ohne Manhattan-Annahme (schräge Wände) fehlt eine geprüfte Quelle.

Prüfstand: 15 Quellen geprüft, 3 korrigiert, 0 entfernt.


---

<!-- 04-topologie.md -->

# Stabile Raumumriss- und Topologie-Schätzung (Thema 04: P4, P5)

Stand der Recherche: 31.10.2026, Seite Stand 26. Markierung der Quellen: **[V]** = die genannten Abschnitte im Volltext (lokales PDF, Titelseite geprüft) gelesen; **[A]** = nur Abstract, Webseite oder Sekundärquelle gelesen; **[Vermutung]** = nicht belegt. Eigene Rechnungen sind als **[Rechnung]** gekennzeichnet.

Vorweg, weil es beide Abschnitte bestimmt: Im Code laufen zwei Auswerter nebeneinander.
- **Alte Auswertung** (`raumskizze-probe.html`, `G.solveSweepAuto`): `segmentDP` (optimale Partitionierung nach PELT mit Ausreißer-Zustand), `assignWalls`, `ringOf` in Zeitfolge, bei schlechtem Ring `ringOrder` (Tiefensuche mit Schranke über Wand-zu-Wand-Übergänge) und `ringByEnds`. Hier kippt P4.
- **Neue Karte** (`raumskizze-umriss.js`, M7): Zerlegung der Ebene durch alle Wandlinien in Zellen, Freiraum-Fächer von der Kamera zum gehobenen Kantenstück, weicher Kameraweg-Term (`betaPfad`), Min-Cut (Dinic), Hysterese über `opt.vorher`. Das ist im Kern schon das Verfahren von Cabral/Furukawa 2014 und PolyFit/Floorplan-SLAM (Kandidaten erzeugen, global auswählen). Es wird deshalb unten nichts als neu vorgeschlagen, was M7 schon tut.

---

## P4 – Auswertung/Topologie instabil

**Problem:** In Aufnahme 6 ändert das Weglassen von 4 Erfassungen (73,1–75,1 s) das Ergebnis von 6 Ecken/22,9 m² auf 17 Ecken mit Kreuzungen. Im Leave-one-out kippt Aufnahme 6 in 3 von 153 Fällen (2 %), Aufnahme 5 in 44 von 308 (14 %). Das 6-gegen-17-Symptom selbst ist in Stand 26 behoben (`ringValid` ist Vorgabe, der Prototyp liefert für genau diesen Fall wieder 6 Ecken, Bericht §10.15); übrig bleiben die genannten 3 von 153 und 44 von 308. Der Ring aus den Wandenden verwirft in den Aufnahmen vom 31.10. viele Erfassungen: 24 bei 12:41 (zwei Runden, 720°-Zeitring) und 64 bei 14:10 (nach zwei Ortungssprüngen von 0,4 m/9° und 0,9 m/10°). Diese Verluste entstehen vor der Ringbildung (P1/P2); der Zustand „Runde komplett“ fängt einen Teil ab. Die Kostenlücke zwischen zwei völlig verschiedenen Ringen war nur 0,78 (32,595 gegen 33,370; Differenz **[Rechnung]** aus Bericht §10.15, dort noch ohne `ringValid`).

**Aktueller Ansatz (Stand 26):**
- `segmentDP` ist eine PELT-Partitionierung (Killick 2012) mit Geradenkosten aus Momentensummen, durch s0 geteilt, Strafe `beta = 3·ln(2·nPunkte)` und einem Ausreißer-Zustand mit Pauschalkosten `kappa = 13,8` (χ², 99,9 %). Der Ausreißer-Zustand ist ein nach oben gekappter quadratischer Verlust, also genau die Art von beschränktem Verlust, die Fearnhead und Rigaill (Biweight) fordern. Biweight wäre hier also nichts Neues.
- Danach `ringOf` in Zeitfolge. Ist der Ring schlecht (kreuzt, fehlt eine Wand, Drehsumme nicht ±360° ±45°), sucht `ringOrder` die Folge der Wände aus ihren Enden: Tiefensuche, Budget 200 000 Knoten, harte Tore `inTol` = 1,0 m und `maxGap` = 7 m, Mindestwinkel 10°, Wand auslassen kostet gesehene Länge + 0,5 m.
- **Ursache 1 aus §10.15 ist im Code (Stand 26):** `ringOrder` übernimmt nur noch Zyklen mit gültigem Ring (`validRing`, Option `ringValid`, Vorgabe an). Die Ursachen 2 und 3 sind offen: harte Tore schalten Übergänge sprunghaft ab, und scheitern beide Ringe, kommt der kreuzende Zeitring als Skizze zurück.
- Warum es nicht reicht: Jede Argmin-Entscheidung ist an Gleichständen unstetig. Hier kommen drei Dinge dazu: (a) die Strafe `beta` hängt von der Punktzahl ab (`nSeg` ging beim Weglassen von 30 auf 29), (b) die harten Tore (Überlapp 1,38 gegen 0,59 m entscheidet über eine ganze 10er-Folge), (c) Auslassen ist billig (8 ausgelassene Gruppen in der 5er-Folge), (d) der Varianzfaktor `s0` ist ein zweiter harter Schalter: Die Kosten werden durch `s0` geteilt (wirksame Strafe also β·s0), und die Wandzuordnung wird nur neu gerechnet, wenn sich `s0` um mehr als 25 % bewegt (Zeile 1642). Punkt (c) ist genau der „Schrumpf-Fehler“ (shrinking bias), den Cabral beschreibt: Ein Weg, der Belege überspringt, ist billiger als einer, der sie erklärt.
- Die neue Karte (M7) umgeht die Reihenfolge ganz (keine Ringsuche, Min-Cut über Zellen), erzwingt aber keinen einfachen Ring: Sie nimmt die größte Innen-Komponente. Bei den Messungen vom 29.10. bringen zusätzliche Einzelwände zusätzliche Ringecken (Außenring A7 33 → 41, Wahrheit 14), `minBeob 3` holt davon einen Teil zurück.

**Wissenschaft:**
- **Grundriss als kürzester geschlossener Weg um den Freiraum; Floor-SP als Erweiterung** (Cabral & Furukawa 2014 [V, Abschn. 4–5]; Chen u. a. 2019 [V, Einleitung und Abschn. 5]): Raster in der Draufsicht mit Wand-Evidenz und Freiraum-Evidenz entlang der Sichtstrahlen. Der Weg läuft von einer Start-/Endlinie aus (sonst wäre der leere Weg die billigste Lösung), Dijkstra liefert das Optimum. Das Schrumpfen löst ein zweiter Durchlauf mit „Ankerpunkten“ an Stellen mit unerklärter Wand-Evidenz (§5.3). Zusätzlich rechnet dynamische Programmierung den besten Weg für jede Eckenzahl 1…β (β = 30) aus (§5.4). Die Eckenzahl ist damit ein ausdrücklich gewählter Parameter und kein Zufallsprodukt der Suche. Floor-SP löst raumweise im Koordinatenabstieg je einen kürzesten Weg als Schleife, mit Strafe je Ecke; Testzeit etwa 5 Minuten je Wohnung (CPU-lastig), Daten aus Panorama-RGBD und Netzen. Für uns nur als Formulierung brauchbar. Grenze beider: ein Ring, Hauptrichtungen, nur Draufsicht-Evidenz.
- **Kandidaten erzeugen, global auswählen** (Floorplan-SLAM, Wang u. a. 2025 [V, Abschn. IV]): Senkrechte Ebenen werden zu 2D-Wandstücken projiziert, paarweise geschnitten (Kandidaten), und ein binäres lineares Programm (SCIP) wählt die Teilmenge. Energie = Passungsterm + **Abdeckungsterm** (wie viel der Kandidatenlänge von Stützpunkten belegt ist, Lücken über 10-facher mittlerer Punktdichte zählen nicht) + **Komplexitätsterm** (Zahl scharfer Ecken). Harte Nebenbedingungen: Eckenknoten haben 0, 2, 3 oder 4 Wände; **Kandidaten, die der Kamerapfad kreuzt, sind verboten** (Gl. 7–8). Das ist PolyFit (Nan & Wonka 2017 [A: CGAL-Seite und Suchtreffer; Energieterme dort nicht nachgelesen]) für 2D. Relevanz: Der Kameraweg ist ein harter, kostenloser Freiraumbeleg; unser M7 führt ihn als weichen Term (`betaPfad` 20).
- **Modellauswahl: Strafe statt Zufall.** PELT (Killick u. a. 2012 [A]) findet das Optimum der bestraften Kosten mit Beschneidung, erwartet linear in n, solange die Zahl der Wechsel mit n wächst. CROPS (Haynes u. a. 2014 [V, Alg. 2 und Abschnitt „Elbow“]) liefert in einem Durchlauf **alle** optimalen Segmentierungen für β in einem Bereich [βmin, βmax], wobei PELT insgesamt höchstens m(βmin) − m(βmax) + 2 Mal laufen muss (Satz 3.2; m = Zahl der Wechselpunkte); der Knick der Kosten über der Segmentzahl (Lavielle) zeigt plausible Zahlen. Fearnhead & Rigaill 2017 [A: Abstract und Verlustdefinition]: beschränkte Verluste wie Biweight sind robust gegen beliebig große Ausreißer; Konsistenz verlangt βn > C·log n. Grenze: eindimensionale Folgen. Unsere Beobachtungen sind aber eine (nach Zeit oder Gier geordnete) Folge, deshalb passt es auf Stufe 1 (Segmentierung), nicht auf die Ringbildung.
- **Kosten je Modell (MDL) und Mehrmodell-Anpassung.** Delong u. a. 2012 [A: Abstract]: α-Expansion mit Label-Kosten (Strafe auf die Menge der benutzten Modelle, Lesart als Beschreibungslänge). J-Linkage (Toldo & Fusiello 2008 [A: Abstract]) und Progressive-X (Barath u. a. 2019 [A: Abstract]) schätzen Mehrfachmodelle ohne vorgegebene Zahl; Progressive-X bricht ab, wenn die Wahrscheinlichkeit für ein neues Modell mit genug Inliern unter eine Schwelle fällt. Voraussetzung: Zufallsstichproben und viele Punkte; bei uns sind es 10–40 Wandhypothesen, die schon aus `segmentDP` kommen. Ein RANSAC-Mehrmodell würde nichts zufügen, was PELT mit Zeitordnung nicht besser kann.
- **Manhattan/Atlanta.** Atlanta-Welt = mehrere lokale Manhattan-Welten (StructVIO, Zou u. a. 2018 [A: Einleitung]); SoMaSLAM (Han u. a. 2024 [A: Abstract]) führt die Manhattan-Annahme als **weiche** Landmarken-Landmarken-Bedingung. Bei uns ist die rechtwinklige Ausrichtung schon als Test mit Toleranz 1,5° (`orthoMax`) eingebaut. Nutzen für die Topologie: Sie reduziert die Kandidatenrichtungen auf wenige und macht die Zahl der Übergänge in `ringOrder` kleiner. Grenze: Schräge Wände (Szenario „schräg“ im Messaufbau: 60 → 72 % richtig) bleiben nur über die Ausnahme erreichbar.

**Best Practice (Industrie/Open Source):**
- **Apple RoomPlan** [A: Apple-Webseite]: nur iPhone/iPad mit LiDAR, ARKit; Ausgabe parametrisch (USD/USDZ mit Maßen je Wand, Möbelart). [Vermutung] Intern wohl erst Wände aus den 3D-Daten, dann Vereinfachung zu normierten Maßen; Apple nennt das nicht öffentlich. Die Topologie kommt also aus dichter 3D-Messung, nicht aus Kantenfolgen. Das Datenformat der inneren Schritte ist nicht öffentlich.
- **Floorplan-SLAM** [V]: Ebenen aus Stereo (ORB-Punkte plus Sobel-Punkte, DBSCAN im Ebenenparameterraum), danach binäres Programm mit Kamerapfad-Bedingung; 25–45 Bilder/s ohne GPU, 9,4 Minuten statt 16 h 44 min für 1000 m² gegenüber dem Vergleichsverfahren der Arbeit.
- **Scan2Plan** (Magic Leap, Phalak u. a. 2020 [A: Abstract]): gelerntes Voting für Wände/Räume, danach kürzester Weg über Schlüsselpunkte zu einem einfachen Polygon je Raum.
- **magicplan, Matterport, Polycam**: Zur Topologie habe ich keine belastbare Quelle gefunden; GRIHA (lokal, [V, Tabelle 3]) vergleicht mit magicplan: mittlerer absoluter Flächenfehler GRIHA 3,1–5,6 %, magicplan 3,7–5,5 % (Klassenräume/Büros/Labore); bei magicplan setzt der Nutzer die Ecken von Hand. [Vermutung] Praxis für Handyaufmaß ohne LiDAR: Nutzer setzt Ecken, Software schließt den Ring.

**Auf unserem Stack:**
- Das Problem ist klein: 10–40 Wandhypothesen, 100–1000 Erfassungen. `solveSweep` braucht gemessen im Median 10,6 ms (Aufnahme 6) bzw. 26,6 ms (Aufnahme 5) auf dem Mac (Node). Auf dem Pixel nicht gemessen [Vermutung: 3–6-fach langsamer, also unter 200 ms, im Worker unkritisch].
- **CROPS** ist reines JS: Algorithmus 2 ist eine Schleife um den vorhandenen `segmentDP`. Zeit = Anzahl der PELT-Läufe (wenige bis ca. 20) mal die Zeit von `segmentDP` [Vermutung: einige 10 ms]. Aufwand 1 Tag inklusive Messung. Risiko niedrig, Lizenz entfällt (eigener Code, Algorithmus aus Paper).
- **Weiche Tore** in `ringOrder`: `inTol`, `maxGap`, Mindestwinkel durch stetige Kosten ersetzen (Kosten wächst quadratisch jenseits der Toleranz, harte Sperre nur bei physikalisch unmöglichen Fällen wie gegenläufigen Parallelen). Aufwand 1–2 Tage. Risiko: Die Tiefensuche verliert dadurch Beschneidung (mehr Knoten); das Budget von 200 000 Knoten ist heute nie erschöpft.
- **Nie einen kreuzenden Ring zurückgeben** (Ursache 3): 0,5 Tage. Stattdessen Meldung „kein gültiger Umriss“ und der letzte gültige Umriss bleibt stehen. Das Vorbild ist die M7-Hysterese. Risiko: Nutzer sieht seltener eine Skizze (ehrlich, aber im Hinweis zu erklären).
- **Eckenzahl-DP wie bei Cabral §5.4**: Für k = 4…K den besten gültigen Ring suchen, k nach Strafe wählen. Aufwand etwa 2 Tage; kostet K Tiefensuchen. Nur nötig, wenn CROPS und weiche Tore das Kippen nicht unter das Ziel drücken.
- **Binäres Programm / ILP im Browser**: nicht nötig. M7 löst das Auswahlproblem schon als Min-Cut (Dinic, JS). Ein Solver (z. B. HiGHS als WASM) hätte nur Sinn für die Eckengrad-Bedingung {0,2,3,4}; ich habe keine geprüfte Größe und Lizenz dafür und rate ab, solange die Tiefensuche reicht.
- **Kein Beweis für die Wirkung**: Der Messaufbau (200 Räume × 5 Klassen) erzeugt den Fehlerfall praktisch nie (Bericht §10.15); er taugt nur als Sicherheitsnetz, nicht als Beleg.

**Empfehlung:** **Messen, dann in dieser Reihenfolge bauen.**
1. Kippquote als Kennzahl festschreiben: T1 `--weglassen` (gibt es schon) auf alle Aufnahmen mit Ausgabe „Anteil der Läufe mit gleicher Eckenzahl und Fläche ±5 %“. Heute 98 % (Aufnahme 6) und 86 % (Aufnahme 5).
2. Je nach Zuordnung der Kippfälle: CROPS für β (stabilste Segmentzahl: die, die über die breiteste β-Spanne optimal bleibt; **das ist meine Ableitung, nicht aus dem Paper**, das nur den Knick empfiehlt), Aufwand 1 Tag.
3. Weiche Tore + „kein gültiger Umriss“ statt kreuzendem Zeitring, 2 Tage.
Zur Hysterese: Eine Standardlösung dafür habe ich nicht gefunden. Verwandt sind die Regeln aus IPC (Olivastri/Pretto 2024, laut Bericht vom 29.10. [A]: Verbindung nur annehmen, wenn alle früheren Messungen danach noch den χ²-Test bestehen) und TACO. [Vermutung] Ein neues Ergebnis sollte das alte nur ersetzen, wenn es um mehr als eine Marge besser ist; die Marge kommt aus der Kostenlücke, die das Verfahren ohnehin kennt.
4. Ist die Quote danach nicht ≥ 95 % auf allen Aufnahmen, ringOrder nur noch als Rückfall führen und M7 (mit `minBeob 3`, 4 weitere Wohnküchen-Aufnahmen vorausgesetzt) zum Hauptweg machen.
**Die entscheidende Messung:** Kippquote im Leave-one-out über alle Aufnahmen (mindestens 5 und 6 und die drei Wohnküchen A6–A8), und **für jeden gekippten Lauf protokollieren**, ob (i) `nSeg` sich geändert hat, (ii) der 25-%-Schritt von `s0` gefeuert hat (wirksame Strafe β·s0), (iii) welches Tor (`inTol`, `maxGap`) umgeschaltet hat. Diese Zuordnung entscheidet die Baureihenfolge aus Daten; CROPS über β allein hilft nicht, wenn `s0` der Schalter ist. Ziel danach ≥ 95 % unveränderte Topologie. Ohne Wahrheit ist nur Stabilität messbar, nicht Richtigkeit.

**Quellen:**
1. Cabral & Furukawa 2014, Piecewise Planar and Compact Floorplan Reconstruction from Images (CVPR). https://openaccess.thecvf.com/content_cvpr_2014/papers/Cabral_Piecewise_Planar_and_2014_CVPR_paper.pdf (lokal: `paper/cabral2014_piecewise_planar_compact_floorplan_CVPR.pdf`)
2. Chen u. a. 2019, Floor-SP. https://arxiv.org/abs/1908.06702 (lokal: `paper/1908.06702_floor-sp_floorplan_shortest_path.pdf`)
3. Wang u. a. 2025, Floorplan-SLAM. https://arxiv.org/abs/2503.00397 (lokal: `paper/2503.00397_floorplan-SLAM_point_plane_multisession.pdf`)
4. Nan & Wonka 2017, PolyFit (hier nur über die CGAL-Seite belegt). https://cgal.org/2019/08/05/Polygonal_surface_reconstruction
5. Killick, Fearnhead, Eckley 2012, PELT. https://arxiv.org/abs/1101.1438 (lokal: `paper/1101.1438_PELT_killick_optimal_changepoints.pdf`)
6. Haynes, Eckley, Fearnhead 2014, CROPS. https://arxiv.org/abs/1412.3617 (lokal: `paper/1412.3617_CROPS_penalty_search_changepoints.pdf`)
7. Fearnhead & Rigaill 2017, Changepoint Detection in the Presence of Outliers. https://arxiv.org/abs/1609.07363 (lokal: `paper/1609.07363_robust_changepoint_outliers_biweight.pdf`)
8. Delong, Osokin, Isack, Boykov 2012, Fast Approximate Energy Minimization with Label Costs (IJCV). https://www.csd.uwo.ca/~yboykov/Abstracts/ijcv10_lc-abs.shtml
9. Toldo & Fusiello 2008, Robust Multiple Structures Estimation with J-Linkage (ECCV). https://www.springerprofessional.de/en/robust-multiple-structures-estimation-with-j-linkage/3024926
10. Barath u. a. 2019, Progressive-X. https://arxiv.org/abs/1906.02290
11. Zou u. a. 2018, StructVIO (Atlanta-Welt). https://arxiv.org/abs/1810.06796 (lokal: `paper/1810.06796_StructVIO_structural_lines_atlanta.pdf`)
12. Han u. a. 2024, SoMaSLAM. https://arxiv.org/abs/2409.15736 (lokal: `paper/2409.15736_SoMaSLAM_2D_graph_soft_manhattan.pdf`)
13. Phalak, Badrinarayanan, Rabinovich 2020, Scan2Plan. https://arxiv.org/abs/2003.07356
14. Apple, Introducing RoomPlan. https://developer.apple.com/augmented-reality/roomplan
15. Goyal u. a. 2021, GRIHA (Vergleich mit magicplan). https://arxiv.org/abs/2103.08297 (lokal: `paper/2103.08297_GRIHA_smartphone_floorplan_vs_magicplan.pdf`)
16. Eigener Code und Berichte: `/Volumes/external/TobiCodetEndlichWieder/Zaene/raumskizze-probe.html` (`segmentDP`, `ringOrder`, `ringByEnds`), `/Volumes/external/TobiCodetEndlichWieder/Zaene/raumskizze-umriss.js`, `docs/superpowers/research/2026-10-24-kamera-raumerfassung-android.md` §10.15, `docs/superpowers/research/2026-10-29-weltrahmen-messungen.md`.

---

## P5 – Kanten als Landmarken in der Karte nicht besser

**Problem:** Kanten aus dem ganzen Bild (ELSED, 33–68 Segmente je Bild) allein ergeben in 6 Aufnahmen keinen Grundriss (5 von 6 ganz ohne Kern). `beide` bringt gegenüber den Erfassungen am Fadenkreuz nur gleich viele bis etwas mehr verbundene Abschnitte (5/6/8/12/4/5 gegen 4/5/7/9/4/5) bei 20–40-facher Rechenzeit. In der Karte werden neu zugeordnete Erfassungen verworfen (auf globaler Höhe gehoben 15–76 cm neben der Wand, Tor 10 cm), oder die Wände spalten (A7: 33 → 65, Doppelwände 20–27 cm auseinander im selben Abschnitt, Außenring 16 → 33 Ecken bei 14 wahren). In einer Simulation der Wohnküche ergibt dieselbe Formulierung dagegen beide Inseln in 100 % der Läufe mit richtiger Eckenzahl (Eckenfehler Median 1,2 cm). Die Formulierung trägt also, der Eingang trägt nicht.

**Aktueller Ansatz (Stand 26):**
- Vorgabe: Die Karte nutzt nur die Erfassungen am Fadenkreuz (`erfassungen`); die Kanten des ganzen Bilds gehen nur in die Anzeige. Die Landmarken (M5) sind unendliche Wandgeraden (θ, ρ) mit gemeinsamer Decken-/Bodenhöhe, Ausgleich in M6, Umriss M7, Beobachtungen werden auf die Deckenhöhe gehoben.
- Schalter vom 29.10. (nicht Vorgabe): `neu.hoeheEigen` (heben auf die Höhe des eigenen Abschnitts), größere Tore 0,15 m, `umrissEingabe.minBeob 3`. Wirkung gemischt: A6 und A8 deutlich besser (A8 Außenring 4 → 14 Ecken, Editdistanz 10 → 3), A7 und B1714 schlechter (A7 Editdistanz 18 → 24).
- **Tiefe ist ausgeschaltet und aus gutem Grund:** Die Tiefe aus ARCore ist auf weißen Wänden und Decke unbrauchbar (Median 80–139 cm daneben, 56–98 % der Deckenpunkte liegen hinter der Decke), brauchbar nur auf dem Parkett in 1–2 m (2–9 cm). Wände aus Tiefe (`G.resTiefe`) und senkrechte ARCore-Ebenen (`G.resEbene`) sind in `raumskizze-tiefe.js` als Funktionen vorhanden, haben aber Gewicht 0; nur der Boden-Freiraum geht in den Umriss.
- Warum es nicht reicht (Mechanismen, die zusammen wirken):
  1. **Heben setzt die Deckenhöhe voraus.** Liegt eine Kante in Wahrheit um dH höher als angenommen, landet der gehobene Punkt auf dem Bruchteil Δ/(Δ+dH) der Entfernung (Kommentar in `raumskizze-probe.html`; Δ = Höhe der Kante über der Kamera). **[Rechnung]** Δ = 0,5 m, dH = 0,1 m, Wand in 4 m: 4·0,5/0,6 = 3,33 m, also 0,67 m daneben. Δ = 1,2 m: 0,31 m. Für alle Kanten derselben Höhe ist das ein gemeinsamer Maßstab um die Kamera, für Kanten anderer Höhe (Leiste, Stuck, Schrankoberkante, Sturz) entstehen Doppelwände. Das passt zu den 20–27 cm in A7.
  2. **Winkelrauschen wird über die Entfernung verstärkt.** Der Code rechnet σ_R = (d²+Δ²)/Δ · σ_E (Gl. in `G.ptSigma`). **[Rechnung]** mit σ_E = 0,2° = 0,0035 rad, d = 4 m: Δ = 0,5 m gibt 11 cm, Δ = 1,2 m gibt 5 cm je Kante (nur Winkelrauschen, ohne Drift). Mit Handhaltung nahe der Decke (P12) sind also Versprünge von 10–30 cm statistisch nicht von „zwei Wänden“ zu trennen.
  3. **Kleine Basis.** Der Nutzer dreht sich fast auf der Stelle; eine Linie aus mehreren Blickpunkten zu triangulieren ist dann entartet (LIMAP §3.1.1 laut Bericht §12.2; Mehrbild-Triangulation der Deckenkante entartet bei Bewegung längs der Wand). Deshalb bleibt die Höhe global; das ist richtig, macht aber alle Fehler der Höhe (Punkt 1) systematisch.
  4. **Zuordnung unendlicher Linien und feste Abschnitte.** Nach dem Einbinden sind Ketten bitgleich fest (M6), neue gute Daten können die Lage nie mehr korrigieren; Erfassungen werden frei (L = −1).
  5. **Einzelwände werden Ringecken.** Die Höhenklasse bestätigt jede Wand als `cls 'wand'`, auch wenn sie aus einer Erfassung besteht.

**Wissenschaft:**
- **Linien allein tragen keinen Grundriss, wenn Unordnung herrscht.** Cabral & Furukawa 2014 [V, Abschnitt zur Strukturklassifikation] schreiben ausdrücklich, dass Linien in ihrem Fall wegen der Unordnung in Wohnräumen deutlich unzuverlässiger sind, und klassifizieren stattdessen jedes Pixel (Decke, Wand, Boden, feste Reihenfolge je Spalte) plus Freiraum-Evidenz aus Sichtstrahlen. Hedau 2009 und Lee 2010 [A, aus Bericht §11.2]: Verfahren ohne Modell für Störobjekte legen Wände auf Möbel.
- **Linien in Mehrbild-Systemen** (LIMAP, Liu u. a. 2023 [A, aus Bericht §11.1]; PL-VINS 2020; StructVIO 2018 [A]): Sie funktionieren, wenn viele Blickpunkte mit Basis vorliegen und die Linien dreidimensional triangulierbar sind. Strukturlinien machen die Gier beobachtbar (StructVIO: Drift 0,96 → 0,29 % des Wegs, laut Bericht §12.2, nicht im Volltext nachgeprüft). Das ist Ortung, nicht Grundriss.
- **Grundriss aus Ebenen, nicht aus Linien**: Floorplan-SLAM [V, Abschn. IV] nutzt senkrechte Ebenen als Landmarken und projiziert sie auf den Boden; die Wandkandidaten kommen aus Ebenenschnitten und die Auswahl aus dem Programm der Energie (siehe P4). Ebenen mitteln viele Punkte; eine Linie aus einem Bild mittelt nur ihre eigenen Pixel. Grenze: braucht Stereo oder Tiefe mit brauchbarer Güte (bei Floorplan-SLAM Stereo mit ORB- und Sobel-Punkten, auch bei schwacher Textur).
- **Ebenen/Punkte auf dem Handy:** ARCore-Tiefe hat nach Haenel u. a. 2022 [V, Teile] mittlere Abweichung 6–7 cm gegen eine Metashape-Referenz (ein Einzelfall etwa 8 cm; Reichweite bis 4 m; laut dem dort zitierten ARCore-Text wächst der Fehler quadratisch mit der Entfernung), laut Google beste Güte bei 0,5 bis 5 m (Schätzungen bis 65 m möglich) und „imprecise depth“ auf Flächen mit wenigen Merkmalen wie weißen Wänden [A, Google-Seite]. Das deckt sich mit unserer Messung (80–139 cm daneben).
- **Gelernte Layout-Netze** (RoomNet, HorizonNet, LaLaLoc, PixCuboid, DuLa-Net): nur auf Desktop-GPUs gemessen, für das Handy im Browser nicht belegt [A, aus Bericht §11.2].

**Best Practice (Industrie/Open Source):**
- **Apple RoomPlan** [A]: LiDAR-Geräte, also 3D-Punkte statt Kanten. Auf einem Pixel 9 Pro ohne ToF nicht erreichbar.
- **WebXR-Plane-Detection** [A: W3C-Entwurf gelesen, Google-Tabelle gelesen]: Der Entwurf beschreibt `XRPlane` mit `orientation` ("horizontal" oder "vertical", bei nicht klassifizierbaren Ebenen `null`), `polygon` (Umriss der Ebene in `planeSpace`, Browser darf aus Datenschutzgründen vergröbern oder Ebenen weglassen) und `semanticLabel` (kann leer sein). Googles ARCore-Vergleichsseite führt Plane Detection für WebXR (Chrome) als „Developer Trial“ (Tiefe, Hit-Test, Anker „Shipped“). Eure Sitzung fordert die Funktion an. [Vermutung] ARCore bildet senkrechte Ebenen aus Merkmalspunkten und liefert auf glatten weißen Wänden wenig; belegt ist das nur für die Tiefe, nicht für die Ebenen.
- **magicplan/GRIHA:** Kanten und Ecken markiert der Nutzer (magicplan 3,7–5,5 %, GRIHA 3,1–5,6 % Flächenfehler, GRIHA Tab. 3). Das ist die Rückfallebene, wenn die Automatik versagt.

**Auf unserem Stack:**
- **Formulierung beibehalten.** M7 ist als Min-Cut schon das, was die Literatur für unvollständige verrauschte Wandbelege empfiehlt; ein Wechsel auf ILP oder auf Ebenen ändert die Eingabe nicht.
- **Eingabe verbessern, billig und messbar** (Reihenfolge nach Wirkung/Kosten):
  1. **Höhenklasse streng machen, je Wandgruppe:** Die Parallaxe-Regression in `groupHeight` liefert dH und sdH je Gruppe. Eine Gruppe geht nur als Wand in die Karte, wenn |dH| ≤ k·sdH (k = 2–3, [Vermutung], an der Simulation zu eichen) und sdH selbst klein genug ist; sonst nur in die Anzeige. Eine feste ±5-cm-Grenze wäre falsch, weil die Basis klein und die Deckenhöhe zwischen 2,16 und 2,61 m gestreut ist (P7). Aufwand 1–2 Tage. Wirkt auf Mechanismus 1 und 5.
  2. **Gewichtung nach Δ:** Beobachtungen mit kleinem Δ (Handhaltung nahe an der Decke) erhalten das Gewicht 1/σ_R² (bereits in `ptSigma` gerechnet), statt gleiches Gewicht. 0,5 Tage.
  3. **`minBeob 3` plus Höhe-eigen/Tore 0,15 m als Paket**, aber erst nach einer weiteren Wohnküchen-Aufnahme als Vorgabe (so entschieden am 29.10.).
  4. **Tiefe nur als Freiraum am Boden** (läuft); Tiefe als Wandbeleg bleibt aus, solange die Messung (Parkett 2–9 cm, weiße Wand 80–139 cm daneben) gilt. Rechenzeit der Tiefe im Worker: Je Bild 160×90 = 14 400 Punkte, Rückprojektion und Binning unter 2 ms im JS-Worker [Vermutung, nicht gemessen].
  5. **Vertikale XRPlane zuerst an vorhandenen Daten auswerten:** Die Seite zählt `detectedPlanes` schon alle 30 Bilder (`LOG.planes`: waagerecht, senkrecht, pausiert) und hat `G.ebeneAusAR` samt `G.resEbene` (Gewicht 0). Ob die Aufnahmen auch die Polygone der senkrechten Ebenen enthalten, habe ich nicht geprüft. Erst vorhandene Zähler und Ebenen gegen die Wände von A7/A8 auswerten, nur bei fehlenden Polygonen das Aufzeichnungsfeld ergänzen.
- **Rechenzeit:** Kanten des ganzen Bilds bleiben aus der Karte (20–40-fach). Ein Mittelweg ist [Vermutung], nur die Segmente in die Karte zu geben, die schon die Höhenklasse bestanden haben (Dutzende statt tausende Beobachtungen). Aufwand 2 Tage.
- **Nicht nativ nötig.** Alles oben läuft in JS im Worker. Ein SLAM mit echter Linientriangulation wäre nur mit großer Basis (Gehen) sinnvoll und ist durch die Handhaltung nicht gegeben.

**Empfehlung:** **Verwerfen** (Kanten des ganzen Bilds in der Karte als Hauptquelle, Tiefe als Wandbeleg), **machen** (strenge Höhenklasse und σ-Gewichte vor der Karte), **messen** (senkrechte XRPlanes). Reihenfolge: 1. Höhenklasse streng, 2. σ-Gewichtung, 3. Ablation mit Eingangsfilter, 4. Entscheidung über das Paket `minBeob 3`/Höhe-eigen nach der nächsten Wohnküchen-Aufnahme.
**Die entscheidende Messung:** Zuerst in der Simulation der Wohnküche (dort 100 % Inseln, 1,2 cm), die ohne Wahrheitszuordnung entscheidet, **je Mechanismus einzeln** einspeisen: (a) Nicht-Decken-Kanten mit Höhenversatz 5–30 cm, (b) σ_R aus kleinem Δ (Handhöhe 0,5 m unter der Decke), (c) Einzelbeobachtungs-Wände. Zählen, welcher Mechanismus den Ring (Ecken, Editdistanz) bricht. Danach auf den 6 echten Aufnahmen M7 mit heutiger Eingabe gegen strenge Höhenklasse plus σ-Gewichte: Zahl der Exporte (heute 0 von 6 bei `segmente`), Außenring-Ecken in A7 gegen 14 wahre, Editdistanz in A6–A8. Auf eine Obergrenze mit auf die wahre Wand gefilterter Eingabe verzichte ich bewusst: Sie bräuchte die mehrdeutige T2-Zuordnung (P3).

**Quellen:**
1. Cabral & Furukawa 2014. https://openaccess.thecvf.com/content_cvpr_2014/papers/Cabral_Piecewise_Planar_and_2014_CVPR_paper.pdf
2. Wang u. a. 2025, Floorplan-SLAM. https://arxiv.org/abs/2503.00397
3. Zou u. a. 2018, StructVIO. https://arxiv.org/abs/1810.06796
4. Liu u. a. 2023, 3D Line Mapping Revisited (LIMAP). https://arxiv.org/abs/2303.17504 (lokal: `paper/2303.17504_LIMAP_3D_line_mapping_revisited.pdf`; hier nur über den Bericht §11–12 belegt)
5. Haenel u. a. 2022, Integration of depth maps from ARCore to process point clouds in real time on a smartphone (ISPRS). https://isprs-archives.copernicus.org/articles/XLIII-B2-2022/201/2022/isprs-archives-XLIII-B2-2022-201-2022.pdf (lokal: `paper/haenel2022_arcore_depthmaps_pointcloud_ISPRS.pdf`)
6. Google, ARCore Depth. https://developers.google.com/ar/develop/depth
7. Google, WebXR und ARCore im Vergleich. https://developers.google.com/ar/develop/webxr/arcore-comparison
8. W3C Immersive Web, WebXR Plane Detection Module. https://immersive-web.github.io/plane-detection
9. Apple, Introducing RoomPlan. https://developer.apple.com/augmented-reality/roomplan
10. Goyal u. a. 2021, GRIHA. https://arxiv.org/abs/2103.08297
11. Eigener Code und Berichte: `/Volumes/external/TobiCodetEndlichWieder/Zaene/raumskizze-tiefe.js`, `raumskizze-umriss.js`, `raumskizze-probe.html` (`ptSigma`), `docs/superpowers/research/2026-10-24-kamera-raumerfassung-android.md` §11–12, `docs/superpowers/research/2026-10-29-weltrahmen-messungen.md`.

---

**Offene Fragen:** (1) Wie schnell laufen `segmentDP`, `ringOrder` und M7 auf dem Pixel 9 Pro (nur Mac-Zeiten bekannt)? (2) Enthalten die Aufnahmen die Polygone der senkrechten `detectedPlanes` (Zähler stehen im Protokoll) und wie gut sind sie auf weißen Wänden? (3) PolyFit: Energieterme und Laufzeit nicht aus dem Originalpaper gelesen (PDF war nicht abrufbar), nur Floorplan-SLAM als Ableger im Volltext. (4) Gibt es eine Veröffentlichung zu Hysterese bzw. Stabilität der Modellwahl bei kleinen Datenänderungen in Grundriss-Schätzern? Ich habe keine gefunden. (5) Wie Matterport, Polycam und magicplan intern die Topologie bestimmen, ist nicht öffentlich belegt. (6) Der Anteil der Kippfälle für alle 10 Aufnahmen fehlt; nur Aufnahme 5 und 6 sind gemessen. (7) T-Linkage, Atlanta-World-Originalpaper und die HiGHS-WASM-Seite waren nicht abrufbar und sind deshalb nicht zitiert.

Prüfstand: 26 Quellen geprüft, 7 korrigiert, 0 entfernt.


---

<!-- 05-linien-landmarken.md -->

# Recherche 05: Kanten als Landmarken, Linien-SLAM und Beobachtbarkeit (P5, P11, P18)

Stand der Seite: 26. Datum der Recherche: 31.10.2026.

Lesehinweis: [V] bedeutet, das PDF liegt lokal in `paper/` und die zitierten Stellen wurden in dieser Sitzung per `pdftotext` gelesen (gezielt die genannten Abschnitte und Tabellen, nicht jede Seite). [A] bedeutet Abstract, Webseite oder Sekundärquelle. Aussagen, die nur aus der älteren internen Recherche (`docs/superpowers/research/2026-10-24-kamera-raumerfassung-android.md`, Kap. 11 und 12) stammen, sind als "intern 11.x" bzw. "intern 12.x" gekennzeichnet und hier nicht neu belegt. [Vermutung] ist nicht belegt. "Eigene Rechnung" ist eine hier ausgeführte Überschlagsrechnung mit den Annahmen im Text.

Neu in `paper/` abgelegt: `1805.05876_observability_aided_INS_points_lines_planes.pdf` (Yang und Huang, Titel und Autoren auf Seite 1 geprüft) und `woodman2007_UCAM-CL-TR-696_intro_inertial_navigation.pdf` (Titelseite geprüft).

---

## P5 – Kanten als Landmarken: neue Karte nicht besser, Kanten aus dem ganzen Bild allein ergeben keinen Grundriss

**Problem:** Die Quelle `segmente` (ELSED-Kanten aus dem ganzen Bild, 33 bis 68 Segmente je Bild) ergibt in 6 Aufnahmen (25. bis 31.10., Gyro-Brücke an) in keiner einen Export, in 5 von 6 gibt es nicht einmal einen Kern. `beide` (Fadenkreuz-Erfassungen plus Bildkanten) verbindet gleich viele oder knapp mehr Abschnitte (5/6/8/12/4/5 gegen 4/5/7/9/4/5), kostet aber 20 bis 40-fach Rechenzeit. Die T2-Passung ist in allen Läufen mehrdeutig (1,00 bis 1,11), Lage und Fläche sind nicht verwertbar. Zusätzlich fallen beim Neuzuordnen nach dem Einbinden eines Abschnitts Erfassungen dauerhaft heraus, weil sie auf der globalen Höhe 15 bis 76 cm neben der alten Wand liegen (Tor 10 cm).

**Aktueller Ansatz (Stand 26):** Die Karte (M5/M6) arbeitet in der Vorgabe nur mit den Erfassungen am Fadenkreuz als Landmarken. Die Kanten des ganzen Bildes gehen nur in die Anzeige. Wände sind 2D-Geraden (θ, ρ) im Grundriss mit gemeinsamen Höhen h_c und h_f; Fehlermaß ist der Segmentendenabstand im Bild. Das reicht nicht, weil die Kanten ohne eine zusätzliche Beobachtung (Höhenklasse, Abschnittsversatz) weder die Zuordnung noch den Bezugsrahmen stabilisieren, und weil jede zusätzliche Kante Rechenzeit kostet, ohne die Mehrdeutigkeit zu lösen.

**Wissenschaft:**
- **Beobachtbarkeit mit Linien allein ist schwächer als mit Punkten.** Yang und Huang beweisen für ein linearisiertes inertial gestütztes System: Punkte lassen 4 Richtungen unbeobachtbar (globale Gier und Position), eine einzelne Linie mindestens 5, eine Ebene mindestens 7; mehrere nicht parallele Linien wieder 4. Sind alle Linien parallel, kommt eine weitere unbeobachtbare Richtung hinzu, nämlich die Linienrichtung selbst. 2018, arXiv 1805.05876 [V] (Lemma 4.2/4.3, Text dazu um Zeile 726 der Textfassung). Folge für uns: Ein Abschnitt, der nur Wände einer einzigen Richtung sieht, kann seine Verschiebung längs dieser Wände nicht festlegen. Zum Verbinden zweier Abschnitte braucht es mindestens zwei nicht parallele Wände (eine Ecke), die in beiden gesehen werden. Das ist eine mögliche Erklärung, warum Karten in 10 bis 20 Abschnitte zerfallen [Vermutung, aus dem Beweis abgeleitet, nicht an unseren Daten geprüft].
- **Linien helfen der Gier nur mit bekannter Richtung.** Kottas und Roumeliotis zeigen, dass schon eine einzelne Linie bekannter, zur Schwerkraft senkrechter Richtung genügt, um alle Freiheitsgrade eines VINS bis auf die globale Verschiebung beobachtbar zu machen (Abstract: "up to global translations"; Punkte sind dafür nicht nötig) (RSS 2013, lokal als `kottas2013_urban_scenes_lines_known_direction_VINS_RSS.pdf` [V], nur Einleitung und Beobachtbarkeitsteil überflogen). StructVIO (Zou et al. 2018, arXiv 1810.06796) bestätigt es in Zahlen: In der Szene mit Atlanta-Struktur sinkt der mittlere Driftfehler von 0,956 % (nur Punkte) auf 0,292 % (Punkte plus strukturelle Linien); in einer Szene ohne verwertbare Struktur sind Punkte allein und Punkte plus Linien gleich (0,957 % gegen 0,956 %, Median 0,559 % gegen 0,570 %) [V]. Kernaussage: Unstrukturierte Linien bringen nichts, erst die Richtungsvorgabe (Manhattan/Atlanta) trägt.
- **Parametrisierung ist gelöst, nicht der Engpass.** Plücker-Koordinaten für die Geometrie und die orthonormale Form mit 4 Parametern für das Update; Residuum ist der Punkt-Linie-Abstand der beobachteten Segmentenden. PL-VINS nutzt Huber, 16 % weniger Fehler gegenüber VINS-Mono ohne Schleifenschluss auf EuRoC (Fu et al. 2020, arXiv 2009.07462 [V], Tab. II und IV). Laufzeit dort (Tab. IV, MH-04): Liniendetektion 20 ms (modifiziertes LSD, gegen 70 ms bei PL-VIO), Linientracking 12 ms, Desktop-C++. Mit Schwerkraft und bekannter Richtung reduziert StructVIO eine Linie auf 2 Parameter plus getrennte Ausdehnung [V, §III].
- **Alle Linien-Systeme brauchen eine Pose aus anderer Quelle.** PL-SLAM (Gomez-Ojeda et al. 2017, arXiv 1705.09479) [V] zeigt zwar eine Linien-Variante (L-SLAM), die in schwach texturierten Räumen läuft (relative RMSE 0,14 bis 0,20), aber mit Stereo, also mit gemessener Tiefe je Bild, und die Autoren sagen selbst, sie erwarteten gegenüber ORB-SLAM2 in normalen Räumen keinen Genauigkeitsgewinn. Structure-SLAM (Li et al. 2020, arXiv 2008.01963) [A, Einleitung und Abstract gelesen, Ergebnistabellen nicht] schätzt erst eine driftfreie Rotation aus Linien und Manhattan-Annahme, dann die Translation aus Punkten und Linien. Kein gefundenes Verfahren schätzt Pose und Struktur nur aus Linien eines einzelnen, auf der Stelle schwenkenden Monokular-Bilderstroms.
- **Lage der Zuordnung unter driftender Pose.** Zuordnung per Projektion mit vorhergesagter Pose, Filter nach Lage und Winkel, Prüfung im Bild (StructVIO V-A [V]); LIMAP ordnet über Vorschläge aus mehreren Bildern, bewertet sie (Überlapp, "InnerSeg"-Abstand) und fasst sie in Spuren zusammen (Liu et al. 2023, arXiv 2303.17504 [V], §3.2). Beides setzt voraus, dass die Pose innerhalb des Zuordnungstors stimmt. Bei uns liegen Rahmen nach Ortungsbrüchen 0,2 bis 1 m und bis 20° daneben, das Tor ist 10 cm: Die Zuordnung ist dann nicht mehr gültig, nicht nur ungenau.
- **Nutzen der Höhenbedingung.** Wand-Decke-Kanten liegen alle in der Ebene z = h_c. Mit bekanntem h_c ist eine Linie schon aus einer einzigen Sicht bestimmt (Schnitt der Sichtebene durch das Kamerazentrum mit der Deckenebene). Die Randbedingung wandelt damit eine 4-Parameter-Linie in eine 2-Parameter-Gerade um und macht jede einzelne Beobachtung zu einer vollständigen Messung. Allgemein behandelt die Literatur solche Strukturvorgaben als weiche Nebenbedingungen (LIMAP: Koinzidenz, Parallelität, Orthogonalität, Abschnitt 3.3 [V]).
- **Grenze: kleine Basis.** LIMAP zeigt, dass die Zwei-Sichten-Triangulation einer Linie entartet, wenn die Linie parallel zur Epipolarebene liegt, also bei Bewegung längs der Linie; die Unsicherheit explodiert, Endpunkt-Triangulation ist dort stabiler (§3.1.1, Abb. 8, Tab. 3 [V]). Bei reiner Drehung auf der Stelle (Basis null) ist es der Extremfall: Alle Sichtebenen laufen durch dasselbe Zentrum, aus Linien folgt nur das Verhältnis Höhe zu Abstand. Eigene Herleitung (nicht aus einem Paper): Für eine Wand mit Normale n gilt je Sicht k ρ − h·t_k = n·c_k − cz_k·t_k, wobei t_k die Tangente der Höhenwinkel-Steigung des Sehstrahls senkrecht zur Wand ist. Mit festem Standpunkt c ist für jede Wand ρ_i neu unbekannt und h_c bleibt frei: das ist der Maßstabsfreiheitsgrad um den Standpunkt. h_c wird erst beobachtbar, wenn sich der Abstand zur Wand ändert (Bewegung senkrecht zur Wand); Bewegung parallel zur Wand ändert t_k nicht und hilft nicht. Das passt zur Messung "Hoehe 2,16 bis 2,61 m, Scheinminimum auf Augenhöhe" (siehe P7, hier nur als Folgerung).
- **Eigene Rechnung zur Empfindlichkeit** (Annahmen: Kamera 0,5 m unter der Decke wie bei den Aufnahmen, Wand 3 m entfernt, Brennweite aus 287 px Breite bei 34,6°: f ≈ 461 px): Sehstrahl zur Kante bei α = atan(0,5/3) ≈ 9,5°. Abstand d = Δh/tan α. Ein Nickfehler von 1° verschiebt die berechnete Wandlage um etwa 0,32 m (dd/dα = Δh/sin²α). Ein Fehler von 10 cm in Δh (20 %) verschiebt d um 20 % = 60 cm. Mit 20 cm Basis senkrecht zur Wand liefert 1 px Messrauschen eine Tiefenunsicherheit von etwa d²/(b·f) = 9/(0,2·461) ≈ 10 cm. Das erklärt, warum Kanten mit Kamera nahe der Decke (kleines Δh, P12) empfindlich sind und die Tiefe nur aus Bewegung entsteht, nicht aus Schwenken.
- **Warum Kanten aus dem ganzen Bild allein nicht tragen [Vermutung, passend zur Literatur, an unseren Daten nicht geprüft]:** (a) Eine Bildkante ohne Höhenklasse (Wand-Decke, Leiste, Stuck, Gardinenschiene, Schrankoberkante) kann bei Basis null nicht von den anderen unterschieden werden, weil die Höhenklasse Parallaxe braucht; wird sie trotzdem auf die Deckenebene gehoben, bilden Störer Scheinwände. Das deckt sich mit der Messung, dass das Heben auf die globale Höhe Erfassungen 15 bis 76 cm neben die alte Wand setzt. (b) Ohne Struktur-Richtung (StructVIO-Befund: 0,957 gegen 0,956 %) bringen zusätzliche Linien keine zusätzliche Information. (c) Die Pose selbst bricht: wenn die Zuordnung der Kanten von einer Pose abhängt, die um 0,2 bis 1 m springt, fressen Fehlzuordnungen jede Gewinnchance.

**Best Practice (Industrie/Open Source):**
- **Apple RoomPlan** lernt Wände aus semantischen LiDAR-Punktwolken: zwei Pseudobilder (512×512×12 Voxel, 3 cm in x/y, 30 cm in z), ein U-Net für Ecken- und Kantenkarte, Linien-Vorschläge mit Verifikationsnetz, Heben in 3D mit geschätzter Wandhöhe; berichtet 95 % Precision und Recall für "Wand und Fenster" (IoU-Zuordnung), keine Zentimeterangabe [A]. Es nutzt weder Linien-Landmarken noch Mehrbild-Ausgleich von Kanten; die Tiefe kommt vom LiDAR.
- **magicplan** setzt auf Nutzer-Markierungen: Bodenecken anzielen (automatisch oder per Tipp), bei verdeckter Bodenecke eine Deckenecke markieren; Deckenhöhe per Gitter, manuell oder mit Laser [A]. Laut Hilfeseite (Artikel "Does magicplan Work on My Device?", unter der angegebenen URL erreichbar; die Seite nennt als Grund fehlendes LiDAR für Auto-Scan) sind die Scan-Funktionen auf Android nicht verfügbar (nur Raum anlegen, Ecken definieren, Import) [A].
- **Open Source für Linien:** PL-VINS (Python/C++, auf VINS-Mono), PL-SLAM, LIMAP (Python/C++, offline, `github.com/cvg/limap`), Line3D++ (offline Multi-View-Stereo aus bekannten Posen, MPL-2.0, OpenCV/Boost/Eigen, Ceres optional) [A, nur README gelesen]. Alle laufen nativ und offline oder mit Desktop-Rechenzeit.
- **ARCore** liefert Ebenen und Pose, aber keine Linien-Landmarken; Linien sind in produktiven Mobil-SLAMs nicht Standard.

**Auf unserem Stack:**
- Nicht übertragbar: PL-VINS, PL-SLAM, LIMAP, Line3D++ (nativ, C++/Python, Abhängigkeiten OpenCV/Ceres/Boost). Übernehmen lässt sich die Mathematik: Punkt-Linie-Abstand, Huber, Gauss-Newton, Spuren per Projektion.
- Rechenzeit: Der Ausgleich ist billig, Detektion und Zuordnung kosten. ELSED im Worker ca. 5 ms je Bild (Mac 2,4 bis 3,0 ms bei 287×640, am Pixel nur geschätzt, intern 11.6). Die gemessene 20 bis 40-fache Mehrzeit liegt daher in der Zuordnung und im Ausgleich vieler Segmente, nicht in der Erkennung [Vermutung, durch Profil am Worker zu prüfen].
- Machbar im Browser: weiche Nebenbedingungen auf Strukturrichtungen (Manhattan/Atlanta aus Gyro und Fadenkreuz-Erfassungen), ein Höhenklassen-Filter vor der Zuordnung, nur Keyframes.
- Nicht machbar: Linien-Triangulation mit echter Parallaxe beim Schwenken auf der Stelle (physikalisch ausgeschlossen), eine reine Linien-Ortung.
- Aufwand: 2 bis 3 Tage für eine Teilmenge-Messung (siehe Empfehlung), 2 bis 3 Wochen für den intern entworfenen Faktor "Bildkante als robuster Faktor in M6" (Weltrahmen-Messungen). Risiko: hoch, solange die Abschnittsverbindung nicht trägt. Lizenz unkritisch (ELSED Apache-2.0).

**Empfehlung:** Verwerfen als eigenständige Quelle, nur als Hilfsbeobachtung weiterführen. Konkret: Kanten des ganzen Bildes nicht als Landmarken, sondern nur (1) als Anzeige und (2) als Teilmenge "strukturell und höhenkonsistent" in die Karte, wenn die Teilmenge den Mehrwert bei einem Bruchteil der Kosten hält. Reihenfolge: zuerst Abschnittsverbindung und Zuordnungshöhe (P1), dann diese Teilmenge. Entscheidende Messung (Skript auf den vorhandenen 6 Aufnahmen): Je Abschnittsbruch zählen, wie viele nicht parallele Wände in beiden Abschnitten gleichzeitig gesehen wurden, und das gegen "Abschnitt erfolgreich verbunden" auflegen (prüft die Beobachtbarkeits-Erklärung); zweitens den Anteil der Segmente ausweisen, deren Höhenklasse mit ausreichendem Verhältnis Basis zu Abstand (hier mindestens etwa 0,1) entschieden wurde, gegen den Anteil, der per Vorgabe auf Deckenhöhe gehoben wurde. Ist der zweite Anteil klein, ist die Höhenklasse die Ursache.

**Quellen:**
1. Yang, Huang 2018, Observability Analysis of Aided INS with Heterogeneous Features of Points, Lines and Planes. https://arxiv.org/abs/1805.05876 [V]
2. Zou, Wu, Pei, Ling, Yu 2018, StructVIO. https://arxiv.org/abs/1810.06796 [V, Ergebnisteil]
3. Liu, Yu, Pautrat, Pollefeys, Larsson 2023, 3D Line Mapping Revisited (LIMAP). https://arxiv.org/abs/2303.17504 [V]
4. Fu et al. 2020, PL-VINS. https://arxiv.org/abs/2009.07462 [V]
5. Gomez-Ojeda et al. 2017, PL-SLAM. https://arxiv.org/abs/1705.09479 [V, Tab. III/IV]
6. Li et al. 2020, Structure-SLAM. https://arxiv.org/abs/2008.01963 [A]
7. Kottas, Roumeliotis 2013, Exploiting Urban Scenes for Vision-aided Inertial Navigation (RSS 2013). Lokal `paper/kottas2013_urban_scenes_lines_known_direction_VINS_RSS.pdf` [V, Ausschnitt]; ICRA-Fassung (Titel dort vermutlich abweichend, nicht geprüft) gefunden: https://fling.seas.upenn.edu/~afosr/wiki/uploads/Chaserepository/Repository/UMN-ST-ICRA-13-EFFICIENT.pdf [A]
8. Apple Machine Learning Research, RoomPlan. https://machinelearning.apple.com/research/roomplan [A]
9. magicplan Hilfe, Scan mit der Kamera (Android). https://help.magicplan.app/scan-a-room-with-the-camera-of-your-mobile-device-android [A]
10. Line3D++ (Hofer, Maurer, Bischof 2016, CVIU; Lizenz MPL-2.0 im README bestätigt), Fork mit README. https://github.com/TurtleZhong/Line3Dpp [A]
11. Intern: `docs/superpowers/research/2026-10-24-kamera-raumerfassung-android.md` Kap. 11/12; `2026-10-29-weltrahmen-messungen.md`.

---

## P11 – Live nur eine Kante am Fadenkreuz, Fadenkreuz ist Pflicht

**Problem:** Das Erfassen funktioniert nur, wenn der Nutzer die Wand-Decke-Kante ins Fadenkreuz legt, live wird genau eine Kante gesucht. Die Kanten des ganzen Bildes laufen bereits mit (ELSED, 33 bis 68 Segmente je Bild), gehen aber nur in die Anzeige; `beide` bringt 5/6/8/12/4/5 gegen 4/5/7/9/4/5 verbundene Abschnitte bei 20 bis 40-facher Rechenzeit.

**Aktueller Ansatz (Stand 26):** Der Nutzer zielt, die Kante am Fadenkreuz wird erfasst und gilt als zuverlässigste Beobachtung (Kern der Karte). Alle anderen Kanten werden gezeichnet (Decke hellblau, Senkrechte und Boden blass) und nicht gezählt. Das reicht nicht, weil die Erfassung vom Zielen abhängt und aus Lücken keine Wände folgen, und weil Störkanten (P6) die Erfassung beeinflussen.

**Wissenschaft:**
- **Mensch im Kreis ist ein etablierter Ansatz.** Die interne Recherche führt interaktive Verfahren auf (Kim et al. 2012, "Interactive acquisition of floor plans", lokal `kim2012_interactive_acquisition_floor_plans_ICRA.pdf`; in dieser Sitzung nicht gelesen). GRIHA misst für die Smartphone-Skizze mit Nutzermarkierung 3,7 bis 5,5 % Flächenfehler (intern 11.2, [V] laut interner Recherche; Paper `2103.08297_GRIHA_smartphone_floorplan_vs_magicplan.pdf`, hier nicht neu gelesen).
- **Automatische Kanten im ganzen Bild sind technisch lösbar:** ELSED 10,2 ms nativ bei 640×480 auf Snapdragon 855, F-Score 0,41 gegen 0,34 (LSD) auf YorkUrban (intern 11.3; Zahlen von dort, ELSED-Paper `2108.03144` lokal).
- **Aber Linien-SLAM-Systeme erkennen viele Linien und nutzen nur wenige:** PL-VINS verwirft kurze Linien (Längenfilter) und kommt dadurch auf 3-fach schnellere Detektion bei vernachlässigbarem Genauigkeitsverlust (Fu et al. 2020, §III [V]); LIMAP bewertet und filtert Vorschläge streng, um falsche Spuren zu vermeiden [V]. Es gibt also keinen Trend zu "alle Linien in die Karte".
- **Die Struktur-Richtungen ändern das Bild:** Mit Manhattan- oder Atlanta-Vorgabe lässt sich die Kantenmenge auf zwei bis drei Richtungsklassen beschränken (StructVIO, Structure-SLAM [V/A]). Das ist die billige Teilmenge, die zu messen ist.
- Keine Studie gefunden, die die Pflicht zum Zielen mit der Genauigkeit eines Raumaufmaß-Ergebnisses vergleicht [Vermutung: Lücke].

**Best Practice (Industrie/Open Source):**
- **magicplan** lässt den Nutzer Ecken zielen und bestätigen (automatisch oder per Tipp) und markiert die Bodenübergänge beim Schwenken [A]; auf Android bietet es keinen Scan [A].
- **RoomPlan** braucht kein Zielen, aber LiDAR [A].
- Fazit: Nutzer-geführte Erfassung ist der übliche Weg, wo keine Tiefe verfügbar ist. Das Fadenkreuz ist damit kein Fehler, sondern der Standard des Fachs.

**Auf unserem Stack:**
- Das Fadenkreuz kann bleiben; entschärfen lässt sich die Pflicht durch "Einrasten": Im Fadenkreuz-Umkreis (z. B. 30 px) wird die nächste Kante der Klasse "Decke" aus dem Bild-Worker-Ergebnis gewählt und angeboten. Das ist rein Anzeige und Auswahl, braucht keine neue Rechenzeit (ELSED läuft bereits).
- Teilmenge für die Karte: nur Segmente der beiden Struktur-Richtungen, in einer Höhe nahe h_c ± 15 cm (nach Hebung), nur in Keyframes (z. B. jede dritte Auswertung). Das senkt die Kosten ungefähr im Verhältnis der Teilmenge, erwartet etwa 2 bis 5-fach statt 20 bis 40-fach [Vermutung, zu messen].
- Aufwand: Einrasten 1 bis 2 Tage (UI), Teilmengen-Messung 2 bis 3 Tage auf dem Prüfstand mit den 6 Aufnahmen. Risiko niedrig (Vorgabe bleibt aus), Gewinn ungewiss. Lizenz: unkritisch.

**Empfehlung:** Machen (Einrasten als Anzeige und Auswahl), messen (Teilmenge), nicht umbauen. Die Fadenkreuz-Erfassung bleibt der Kern, die Bildkanten bleiben Hilfsbeobachtung. Entscheidende Messung: `beide` auf der Teilmenge (strukturell, höhenkonsistent, Keyframes) gegen `erfassungen` und gegen volles `beide`: hält die Teilmenge den Zuwachs an verbundenen Abschnitten (5/6/8/12/4/5 gegen 4/5/7/9/4/5) bei höchstens 5-facher Rechenzeit, dann in die Karte; sonst verwerfen.

**Quellen:**
1. Fu et al. 2020, PL-VINS. https://arxiv.org/abs/2009.07462 [V]
2. Liu et al. 2023, LIMAP. https://arxiv.org/abs/2303.17504 [V]
3. Zou et al. 2018, StructVIO. https://arxiv.org/abs/1810.06796 [V]
4. magicplan Hilfe Android. https://help.magicplan.app/scan-a-room-with-the-camera-of-your-mobile-device-android [A]
5. Apple RoomPlan. https://machinelearning.apple.com/research/roomplan [A]
6. Intern: Kap. 11.2 und 11.3 der Kamera-Recherche (Zahlen zu GRIHA, ELSED); Weltrahmen-Messungen (Quellvergleich).

---

## P18 – Untersucht ohne Nutzen: Beschleunigungssensor, Bodenkanten, Sichtfeld für die Abschnittsverbindung

**Problem:** Drei Ideen brachten in Messungen nichts: der Beschleunigungssensor (Brücke über Ortungslücken), Bodenkanten als zusätzliche Landmarken, ein anderes Sichtfeld (14 bis 35°) für die Abschnittsverbindung. Die Gyro-Brücke wirkt dagegen (Drehfehler an Brüchen 14,6° → 0,8°), aber der Ortsversatz bleibt.

**Aktueller Ansatz (Stand 26):** Die Brücke nutzt nur das Gyroskop. Bodenkanten gehen als blasse Anzeige ein, nicht in die Karte. Das Sichtfeld wird nicht verändert. Das reicht, weil jeder der drei Wege am eigentlichen Problem vorbeigeht: Der Ortsversatz entsteht durch Ankerwechsel und Relokalisierung, nicht durch Beschleunigung, Verdeckung oder Bildwinkel.

**Wissenschaft:**
- **Beschleunigungssensor:** Woodman (Cambridge TR-696, 2007) [V, Fehlerkapitel gelesen]: Ein konstanter Beschleunigungsfehler wächst doppelt integriert quadratisch mit der Zeit (t²); weißes Rauschen im Beschleunigungsmesser wächst mit t^{3/2}; Gyro-Rauschen (Lagefehler, der die Schwerkraft falsch abzieht) dominiert die Drift; im Versuch mit einer MEMS-IMU (Xsens MTx) lag der mittlere Positionsfehler nach 60 s über 150 m, mit Magnetometer bei etwa 5 m. Fazit des Autors: MEMS-Navigation liefert keine Genauigkeit unter 1 m über mehr als eine Minute. Handy-Sensoren sind nicht besser als dieses Industriemodell [Vermutung]. Eigene Messung: Beschleunigung als Brücke bringt nichts; zweiseitig mit online geschätztem Bias etwa 12 statt 42 cm bei 6 s Lücke, 35 statt 83 cm bei 10 s (Weltrahmen-Messungen); mit dem gyroSim-Bias bringt es bei 6 s nichts.
- **Beschleunigung ist in ARCore bereits verbaut:** ARCore ist ein visuell-inertiales System; die Beschleunigung steckt in der Pose. Unser Web-Zugang liefert nur 50 Hz mit Lücken bis 130 ms ohne Belichtungszeitpunkt (intern 12.2: "eigene visuell-inertiale Ortung im Browser scheidet aus"). Zeitversatz zwischen Kamera und IMU ist ein bekannter Fehler (Titel der lokalen Arbeit `1808.00692_online_temporal_calibration_time_offset_VIO.pdf`, hier nicht gelesen).
- **Beobachtbarkeit:** Auch mit perfekter Beschleunigung bleiben globale Gier und Position unbeobachtbar (4 Richtungen, Yang und Huang 2018 [V]); die Beschleunigung ersetzt keinen Bezugsrahmen.
- **Bodenkanten:** Theoretisch stark: Bei bekannter Kamerahöhe über dem Boden (Ankerpose von ARCore) liefert eine Boden-Wand-Kante in einer einzigen Sicht den metrischen Abstand d = cz / tan(Tiefenwinkel) (eigene Herleitung); Decken- und Bodenkante derselben Wand hängen über eine Homologie zusammen und legen so h_c fest (Flint et al. 2010/2011, laut interner Recherche 11.2; die Papers liegen als `flint2011_manhattan_scene_understanding_mono_stereo_3D_ICCV.pdf` lokal, hier nicht neu gelesen). Praktisch: Die Boden-Wand-Grenze ist in den meisten Räumen teils oder ganz verdeckt (Hedau 2009; im ST-PIO-Beispiel zu über 50 %; DuLa-Net weicht deshalb auf die Deckenansicht aus), laut interner Recherche 11.2, hier nicht neu geprüft. Die interne Messung 12.1 ergibt dasselbe: Bodenkanten liegen in den Aufnahmen A6 bis A8 praktisch nie auf echten Wänden (Kamera nach oben, Kartons, Küche).
- **Sichtfeld:** Größeres Sichtfeld erhöht die Überlappung aufeinanderfolgender Bilder und macht Ortungsverlust unwahrscheinlicher (CubemapSLAM, Wang et al., arXiv 1811.12633, v2 2019, RA-L 2020, Einleitung [V]; LF-PGVIO, Wang et al. 2024, arXiv 2306.06663, Abstract [A]). Das ist ein Gewinn für die Verfolgung (P8, P9), nicht für das Verbinden nach einem Bruch. Der Widerspruch zu unserer Messung "Sichtfeld 14 bis 35° beeinflusst die Abschnittsverbindung nicht" besteht deshalb nicht: Die Abschnittsverbindung scheitert an Rahmensprüngen der Relokalisierung, die das Sichtfeld nicht berührt. Die Messung betraf außerdem nur 14 bis 35°, nicht den Bereich 70°+ (Querformat), der die Verfolgung betrifft [Vermutung: bei Querformat anderes Verhalten].

**Best Practice (Industrie/Open Source):**
- Produktive Systeme (ARKit/ARCore, VINS-Mono, ORB-SLAM3) fusionieren die Beschleunigung eng im Filter oder in der Vorintegration, nie als eigenständige Brücke über Sekunden; Brücken über Lücken erfolgen über Relokalisierung oder Kartenfusion (ORB-SLAM3 Atlas, interne Recherche 12.2).
- Floor-Plan-Apps ohne LiDAR (magicplan) lassen den Nutzer Bodenecken oder Deckenecken markieren und schätzen Linien nicht automatisch über das ganze Bild; Boden und Decke gelten als sich ergänzende Marker, bei verdeckter Bodenecke weicht man auf die Decke aus [A].
- Weite Winkel: Fisheye-/Mehrkamera-Systeme (CubemapSLAM, MultiCol-SLAM) sind für Robotik üblich, bei Handy-WebXR nicht wählbar (Chrome beschneidet auf 34,6° im Hochformat, keine Linsenwahl, P9).

**Auf unserem Stack:**
- Beschleunigung: Der Generic-Sensor-Zugang (50 Hz, Lücken bis 130 ms) reicht für eine kurze, zweiseitige Brücke bei Lücken von etwa 6 bis 10 s und nur mit Bias-Schätzung (siehe oben). Als Standard zu aufwendig für den Nutzen. Aufwand: 3 bis 5 Tage für eine saubere Bias-Schätzung, Nutzen auf Lücken ≥ 6 s begrenzt.
- Bodenkanten: Anzeige belassen. Wo die Wandfuß-Linie sichtbar ist (leerer Raum, Kamera nach unten), lohnt eine optionale Abfrage "Wandfuß sichtbar?" als zusätzlicher Messwert zur Höhe; das ist eine UX-Frage und keine Algorithmusfrage [Vermutung].
- Sichtfeld: nicht änderbar außer durch Querformat (~70°). Das wirkt auf P8/P9, nicht auf die Abschnittsverbindung.
- Rechenzeit: alle drei Wege kosten wenig; der Grund für Verwerfen ist der fehlende Nutzen, nicht der Preis.

**Empfehlung:** Verwerfen, zu Recht. Zwei Ausnahmen messen: (1) Beschleunigung nur als zweiseitige Brücke ab 6 s Lücke, mit online geschätztem Bias, nicht als allgemeiner Pfad. (2) Bodenkante nur dort, wo sie sichtbar ist, als zusätzlicher Wert zu h_c, nicht als Landmarke. Die eine Messung, die die Frage zu Bodenkanten entscheidet: Anteil der Bilder mit sichtbarer, auf der echten Wand liegender Boden-Wand-Kante über alle 6 Aufnahmen, getrennt nach Hoch- und Querformat; liegt er unter etwa 20 %, ist die Frage erledigt.

**Quellen:**
1. Woodman 2007, An introduction to inertial navigation, UCAM-CL-TR-696. https://www.cl.cam.ac.uk/techreports/UCAM-CL-TR-696.pdf [V, Fehlerkapitel]
2. Yang, Huang 2018. https://arxiv.org/abs/1805.05876 [V]
3. Wang et al. 2018/2019 (arXiv v2 Feb 2019, RA-L 2020), CubemapSLAM. https://arxiv.org/abs/1811.12633 [V, Einleitung]
4. Wang et al. 2023 (arXiv), IEEE T-IV 2024, LF-PGVIO. https://arxiv.org/abs/2306.06663 [A]
5. magicplan Hilfe Android. https://help.magicplan.app/scan-a-room-with-the-camera-of-your-mobile-device-android [A]
6. Flint et al. 2011, lokal `paper/flint2011_manhattan_scene_understanding_mono_stereo_3D_ICCV.pdf` (nicht neu gelesen, siehe intern 11.2).
7. Intern: Kap. 11.2, 12.1, 12.2 der Kamera-Recherche; Weltrahmen-Messungen (Brücken-Zahlen).

---

Offene Fragen: Die Beobachtbarkeits-Erklärung für das Zerfallen in 10 bis 20 Abschnitte (nur parallele Wände je Abschnitt) ist aus dem Beweis von Yang und Huang abgeleitet, aber nicht an unseren Aufnahmen geprüft. Ob die 20 bis 40-fache Rechenzeit von `beide` in Zuordnung oder Ausgleich liegt, ist ohne Profil unbekannt. Kim 2012 (interaktive Grundrisse), Flint 2011, GRIHA, Hedau und ST-PIO wurden hier nicht neu gelesen, ihre Zahlen stammen aus der internen Recherche. Structure-SLAM (2008.01963) nur als Abstract/Einleitung (keine ATE-Tabelle gelesen), Line3D++ nur als README. Keine Quelle gefunden, die Plücker- oder orthonormale Linienparametrisierung bei reinem Schwenken (Basis null) untersucht oder die Pflicht zum Zielen mit Raumaufmaß-Genauigkeit vergleicht. Die Aussage zu magicplan auf Android stammt von einer Hilfeseite und widerspricht Suchtreffern (Deckenhöhe per Gitter auf Android); ob ein Android-Scan existiert, ist ungeklärt.

Pruefstand: 11 Quellen geprueft, 6 korrigiert, 0 entfernt.


---

<!-- 06-falsche-kanten.md -->

# Recherche 06 – Falsche Kanten: Leiste, Stuck, Gardinenschiene, Schrank, Bilderrahmen

Stand 31.10.2026. Baut auf `docs/superpowers/research/2026-10-28-semantik-bausteine.md` auf (Lizenzen, Laufzeitanker, Messaufbau Schritte 0–6 werden nicht wiederholt) und auf Kapitel 10–12 der Kamera-Doku. Kennzeichnung: **[V]** Volltext gelesen, **[A]** nur Abstract, Suchtreffer oder Stichwortsuche im lokalen PDF, **[Vermutung]** nicht belegt. Hinweis ehrlich vorab: Kein Paper wurde in dieser Runde komplett durchgelesen. Die lokalen PDFs (HorizonNet, DuLa-Net, RoomNet, M-LSD, TopFormer, SeaFormer, Anatomizing) wurden per Stichwortsuche geprüft, daher überall [A].

## P6 – Falsche Kanten werden erfasst (Leiste, Stuck, Gardinenschiene, Schrankoberkante, Bilderrahmen)

**Problem:** Das Fadenkreuz rastet auf Kanten, die keine Wand-Decke-Kante sind. Die Wand wird dann ungeprüft zur `wand` (raumskizze-landmarken.js um Z. 671). Gemessen im Prüfstand: Eine Schrankoberkante 2,2 m hoch und 0,6 m vor der Wand liegt aus 2 m Abstand nur etwa 2° (23 px) unter der Deckenkante, also im Fangradius von 46 px. Bei der Schrankwand ohne sichtbare Deckenkante werden 45–46 % der Läufe falsch geschlossen (Form stimmt, Wand 0,6 m zu weit innen). Ohne Laser ist eine Leiste hinter der Wand von einer Nische nicht unterscheidbar (Doku, Scheinnischen). Die Oberkanten-Regel nimmt am Boden zu 74 % die Leiste.

**Aktueller Ansatz (Stand 26):** Drei Schichten, alle ohne Semantik:
1. *Stufe vor Linie* (Doku 10.3): Unter parallelen Kandidaten gewinnt der Helligkeitssprung (Stufenmaß ≥ 0,5). Prüfstand mit 33 Bildern je Szene: Gardinenschiene richtig 4 → 24, falsch 29 → 8; Schattenfuge 33 → 32. Grenze: In sehr weißen Räumen (Kontrast Wand/Decke 2–6 Graustufen) gewinnt eine kräftige Schiene weiter, weil die echte Kante unter der Stärkeschwelle liegt.
2. *„Oben“-Regel und 2-von-2-Bestätigung* gegen Flackern. Eine Leiste im Fangradius gewinnt aber Bild für Bild als zusammenhängende Folge.
3. *Heben mit Parallaxe* (Doku 11.4, Schritt 3) und Leistenregel/Kreuzprobe H (S3, S6): Segmente werden über mehrere Posen auf Höhe gehoben, die fernste Kante auf Deckenhöhe gewinnt. S3 und S6 gelten in der Doku als „unsicher, erst protokollieren“. Unterzüge trennt nur `istUnterzug` (Schalter Z3).
Warum es nicht reicht: Jede Regel braucht entweder Kontrast (1), eine sichtbare Deckenkante (2) oder mehrere Blickwinkel mit sauberer Pose (3). Ortungsbrüche (P1, P8) und weiße Räume schwächen genau diese Voraussetzungen.

**Wissenschaft:**
- **Raumlayout-Netze rechnen auf Panoramen, nicht auf unserem 34,6°-Bild.** HorizonNet (Sun, Hsiao, Sun, Chen, CVPR 2019) sagt je Bildspalte Boden-Wand- und Decke-Wand-Position sowie die Existenz einer Wand-Wand-Kante voraus. Eingabe 512×1024 Panorama, Manhattan-Annahme, eine Decke und ein Boden. Laufzeit laut Paper 8 bzw. 50 ms „with and without RNN respectively“ (Wortlaut, Reihenfolge wirkt vertauscht; NVIDIA TITAN X), Nachverarbeitung 12 ms (Abstract: unter 20 ms). Das Paper nennt Mehrdeutigkeit der Wandgrenzen „vor allem in reich eingerichteten Räumen“ als Fehlerquelle. Stuck oder Leisten werden dort nicht eigens behandelt (Stichwort-Suche ohne Treffer für molding/cornice/trim). [A] Sun et al. 2019, arXiv 1901.03861 (lokal `paper/1901.03861_horizonnet_1D_layout.pdf`).
- **DuLa-Net** (Yang et al., CVPR 2019) kombiniert Panorama- und Deckenansicht, Datensatz 2573 Panoramen mit 4–12 Ecken. Auch hier Panorama-Eingabe, Okklusion durch Möbel ist ausdrücklich das Problem, Leisten kommen nicht vor. [A] arXiv 1811.11977 (lokal).
- **RoomNet** (Lee et al., ICCV 2017, Magic Leap) arbeitet als einziges der drei auf einem normalen Perspektivbild, schätzt aber nur 2D-Eckpunkte für elf feste Quader-Layoutklassen. 83 ms auf GPU bei drei Iterationen. Für Mehrwand-Grundrisse und Teilansichten ungeeignet; Hauptfehler laut Paper sind verdeckte Ecken. [A] arXiv 1703.06241 (lokal).
- **LGT-Net** (Jiang et al., CVPR 2022): Panorama, Horizont-Tiefe plus Raumhöhe als gemeinsame Ausgabe, Transformer; eine IoU-Zahl ist hier bewusst nicht genannt (Sekundärquellen widersprechen sich je nach Datensatz und Setting; die ursprünglich genannten 84,6 % stammten aus einem Aggregator und sind nicht belegt). Raumhöhe wird als *eine* Zahl je Raum geschätzt, das ist für uns der interessante Teil: Eine Leiste ändert die Höhe nur um Zentimeter, ein Schrank um Dezimeter. [A] arXiv 2203.01824.
- **Fazit zur Layout-Familie:** Alle sind auf 360°-Eingabe trainiert und lernen das Wand-Decke-Verhältnis implizit aus dem Gesamtbild. Eine explizite Behandlung von Stuckleisten oder Gardinenschienen habe ich in keinem Paper gefunden. Die Suche „molding / cornice“ lieferte nur Dekorationsartikel (nicht zitierfähig). Das ist selbst ein Befund: **Das Problem ist in der Layout-Literatur nicht gelöst, sondern durch Annahme weggeschoben** (Decke = oberste Grenze). [Vermutung, gestützt auf zwei erfolglose Suchrunden]
- **Klassische Linienklassifikation:** Zhang, Lu, Hu & Koch (IJCV 2016, Bd. 117, S. 111–130, „Vanishing Point Estimation and Line Classification in a Manhattan World with a Unifying Camera Model“) schätzen die drei orthogonalen Linienrichtungen gemeinsam im Kamerarahmen und klassifizieren Linien nach Fluchtrichtung. Das trennt waagerechte von senkrechten Kanten, aber nicht Leiste von Wand-Decke-Kante, denn beide laufen waagerecht und parallel. Bei uns liefert die Pose die Richtungen ohnehin (Doku 11.4 Schritt 2). [A] doi 10.1007/s11263-015-0854-5.
- **Mehrblick-Triangulation von Linien:** LIMAP (Liu, Yu, Pautrat, Pollefeys, Larsson, CVPR 2023) behandelt Entartungen bei der Linientriangulation (Linie in der Epipolarebene) und ergänzt Struktur-Priors wie Parallelität und Koinzidenz. Zeigt, dass Linien aus mehreren Ansichten gehoben werden können, wenn die Posen stimmen. Es gibt keine Aussage speziell zu Deckenkanten. [A] arXiv 2303.17504.
- **Mehrblick-Parallaxe in unserem Fall (eigene Messung, Doku 11–12):** Der Höhenunterschied einer Kante lässt sich nur auflösen, wenn sich der Blickwinkel ändert. Beispiel: Schrankoberkante 0,6 m vor der Wand verschiebt sich beim Gehen oder Drehen anders als die Deckenkante dahinter (Parallaxe-Höhe, Vorzeichenfehler dort bereits behoben).

**Best Practice (Industrie/Open Source):**
- **Apple RoomPlan** nutzt LiDAR plus Kamera und kombiniert laut 9to5mac LiDAR mit der Kamera und liefert ein 3D-Grundriss-Modell (USDZ-Export, einfache Objekte als Blöcke); Wände, Türen und Fenster als Kategorien nennt der Artikel nicht [Vermutung aus Apple-Doku, hier nicht belegt]. In Entwicklerforen ist offen, ob die Wandfläche die Innenseite oder Mittellinie meint; zu Leisten, Stuck oder Einbauschränken fand ich nichts. Die Lösung dort ist Hardware (Tiefensensor), nicht Bildsemantik. [A] https://developer.apple.com/forums/tags/room-plan/ und https://9to5mac.com/2022/06/15/ios-16-roomplan-api-3d-floor-plans/.
- **magicplan** empfiehlt laut Hilfeseite für die zuverlässigsten Maße einen Bluetooth-Laser, Genauigkeit hängt dort vor allem vom Licht ab. Dass Eckpunkte am Boden markiert werden (Corner Mode), eine KI verdeckte Ecken ergänzt und Möbel die Hauptschwäche sind, steht auf dieser Seite nicht [Vermutung, aus anderem Wissen, nicht belegt]. Gesichert ist nur: Mehrdeutigkeit wird mit Laser gelöst. Das entspricht unserem „Wand dahinter mit Laser messen“. [A] https://help.magicplan.app/how-accurate-is-magicplan.
- **ARCore Raw Depth:** Dokumentiert wird eine Konfidenz je Pixel; texturlose Flächen bekommen meist Konfidenz 0. Für weiße Wand und Decke liefert die Tiefe also keinen verwertbaren Sprung, das deckt sich mit unserer Messung (Median 80–139 cm daneben). [A] https://developers.google.com/ar/develop/java/depth/raw-depth.
- **MediaPipe Image Segmenter:** Das einzige mitgelieferte Allzweckmodell DeepLab-V3 (257×257, float32) hat laut Seite die Klassen „background, person, cat, dog, potted plant, and others“, also vermutlich Pascal VOC, **ohne Wand oder Decke** [Vermutung zum Datensatz, die Seite nennt ihn nicht]. Pixel 6: 124 ms CPU, 103 ms GPU je Bild. Ein eigenes Modell mit Wand/Decke/Schrank wäre selbst zu trainieren und als .tflite einzubinden. Lizenz des Modells nicht auf der Seite genannt. [A] https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter.
- **MobileSAM:** TinyViT-Encoder mit etwa 5 M Parametern, rund 10 ms je Bild auf einer einzelnen GPU laut Abstract (8 ms Encoder, 4 ms Decoder; Teile summieren sich auf 12), „über 60× kleiner“ als SAM; die Parameterzahl (~5 M) und Apache 2.0 stehen nicht im Abstract [Vermutung/nicht geprüft]. Segment-Anything liefert aber nur Masken *ohne Klassen*; eine Maske „Schrank“ gegen „Wand“ müsste man selbst klassifizieren. Trainingsdaten SA-1B sind „research only“ (Lizenzkette riskant, siehe Semantik-Doku). [A] arXiv 2306.14289 (über Ultralytics-Doku gefunden).
- **ADE20K:** Die 150 Standardklassen (Zahl nicht auf der arXiv-Seite, aus der Scene-Parsing-Benchmark) enthalten wall, ceiling, floor, aber keine Klasse für Zierleiste oder Stuck. In der Suche tauchte „cornice“ nur in einem abgeleiteten Teildatensatz auf; ob die Vollversion (über 3000 Klassen) „molding“ führt, konnte ich nicht klären. Selbst wenn ja: SegFormer/ADE20K sind laut Semantik-Doku nicht-kommerziell. [A] https://arxiv.org/abs/1608.05442.

**Auf unserem Stack:**
- *Segmentierung im Browser:* Machbar nur selten (eine Inferenz je Fadenkreuz-Erfassung, in eigenem Worker), nicht je Bild. Browser-Faktor gegenüber nativ laut Anatomizing auf Mobilgeräten 7,8× (GPU) bzw. 15,8× (CPU); auf PCs 16,9× (CPU) und GPU 4,9× (Abstract) bzw. 30,6× (Einleitung; das Paper ist hier intern widersprüchlich). WebGPU wurde dort nicht gemessen (Paper: Standard noch nicht freigegeben). Für onnxruntime-web WebGPU auf Android/Mali fand ich keine Messung (Suche ohne Treffer); ohne COOP/COEP läuft WASM nur mit einem Thread (Semantik-Doku). Hochrechnung der Semantik-Doku: SegFormer-B0 50–300 ms bei 512 px [Vermutung]. In einer WebXR-Sitzung ist die GPU-Konkurrenz mit ARCore und Compositor ungemessen.
- *Das eigentliche Problem ist nicht die Rechenzeit, sondern die Klasse:* Ein Netz mit den Klassen wall, ceiling, cabinet trennt Schrank von Wand, **aber nicht Stuckleiste von Wand-Decke-Kante**: Eine Leiste liegt in beiden Masken im Übergangsband von wenigen Pixeln, und eine Kante dort bleibt je nach Netz mal Wand, mal Decke. Bei 287×640 Pixeln und 34,6° sind 5 cm Leistenhöhe aus 2 m Abstand etwa 1,4° bzw. ~14 px. Das liegt im Rauschband der Maskenränder (Aussage zu Netzrändern ist [Vermutung]; messbar im Schritt 2 der Semantik-Doku).
- *Nutzen je Störer* (Einschätzung): Schrank, Vorhang, Bilder, Lampe → Maske hilft (große Flächen, andere Klasse). Gardinenschiene → Maske kaum (dünn, im Deckenbereich). Stuck/Leiste/Schattenfuge → Maske hilft nicht; Parallaxe und Stufenrichtung helfen.
- *Kantenpolarität* kostet nichts: Das Vorzeichen des Helligkeitssprungs (heller Decke über dunklerer Wand oder umgekehrt) ist je Segment schon im Bild-Worker verfügbar (ELSED, ca. 5 ms). Die Stufenregel nutzt den Betrag, nicht das Vorzeichen. Eine Stuckleiste hat typisch *zwei* Kanten mit gegenläufigem Vorzeichen im Abstand ihrer Ausladung (Licht oben, Schatten unten), eine Gardinenschiene ebenso. Die echte Wand-Decke-Kante hat genau einen Sprung. Das ist eine **Hypothese** [Vermutung]; nicht in der Literatur gefunden. Aufwand: 1–2 Tage, rein Prüfstand/Aufnahmedaten.
- *Parallaxe/Tiefensprung:* ARCore-Tiefe (160×90, raw) ist an weißer Wand und Decke unbrauchbar (siehe oben); als Hinweis nur für Schränke (haben Textur und stehen bis zu 0,6 m vor der Wand, Sprung ≥ 0,3 m) denkbar [Vermutung, nicht gemessen]. Die Mehrblick-Parallaxe nutzt dagegen nur Pose + Bild, kein Tiefenbild.
- *Lizenz/Abhängigkeit:* Wie Semantik-Doku: SegFormer/ADE20K nur Evaluation; DINOv2-S + eigener Kopf der saubere Weg (Training nötig: Aufwand 5–10 Tage inkl. Etikettieren [Vermutung]).

**Empfehlung:** **Zuerst messen, nicht bauen; Mehrblick-Parallaxe vor Segmentierung.**
1. *Kantenpolarität als Merkmal (1–2 Tage):* Aus den vorhandenen Aufnahmen (A6, A7, A8) je ELSED-O-Segment Vorzeichen und Betrag des Sprungs sowie das Vorhandensein eines Gegen-Sprungs im Abstand 1–8 px (skaliert) ablesen. Die Schätzung steckt im Prüfstand der Stufenregel. **Entscheidende Messung:** Präzision/Recall „echte Wand-Decke-Kante“ gegen Leiste/Schiene/Schrank mit Handetiketten (Schritt 1 der Semantik-Doku, 30–50 Bilder). Reicht +10 Punkte Präzision bei höchstens −5 Punkte Recall, einbauen.
2. *Parallaxe-Höhe als harte Prüfung der Erfassung (3–5 Tage):* Die Höhe der erfassten Kante aus zwei Posen (Standortwechsel ≥ 0,3 m oder Schwenk) mit H vergleichen; weicht sie um mehr als ~10–15 cm ab, wird die Erfassung zu „Verdacht“ mit Nutzerhinweis (Schrank: „Wand dahinter mit Laser messen“). Das nutzt vorhandenen Code (Heben, Kreuzprobe H) und braucht keine Zusatzlast. Risiko: Ortungsbrüche, Hochformat-Tracking-Verlust (P8); Parallaxe ist bei kleiner Basis (< 0,3 m, 45 % der echten Wände) nicht beobachtbar.
3. *Segmentierung nur als Offline-Obergrenze (Semantik-Doku Schritt 2):* Wenn 1 + 2 Schrankwände und Fehlrastungen nicht auf unter ~5 % falsch geschlossene Läufe drücken, erst dann Schritt 6 (Pixel 9 Pro, Worker, WebGPU gegen WASM). Vorher nicht installieren.
4. *Verwerfen:* Layout-Netze (HorizonNet, DuLa-Net, LGT-Net) – Panorama-Eingabe passt nicht zu 34,6°-Teilansichten; RoomNet – feste Quader-Klassen. MediaPipe-Standardmodelle – keine Wand/Decke. Tiefensprung aus ARCore für weiße Flächen – Konfidenz 0.

## Quellen
1. Sun, Hsiao, Sun, Chen 2019, HorizonNet: https://arxiv.org/pdf/1901.03861 (lokal geprüft per Stichwortsuche) und https://openaccess.thecvf.com/content_CVPR_2019/html/Sun_HorizonNet_Learning_Room_Layout_With_1D_Representation_and_Pano_Stretch_CVPR_2019_paper.html
2. Yang et al. 2019, DuLa-Net: https://arxiv.org/abs/1811.11977 (lokal `paper/1811.11977_dulanet_ceiling_view_layout.pdf`)
3. Lee et al. 2017, RoomNet: https://arxiv.org/abs/1703.06241 (lokal)
4. Jiang et al. 2022, LGT-Net: https://arxiv.org/pdf/2203.01824 und https://openaccess.thecvf.com/content/CVPR2022/html/Jiang_LGT-Net_Indoor_Panoramic_Room_Layout_Estimation_With_Geometry-Aware_Transformer_Network_CVPR_2022_paper.html
5. Zhang, Lu, Hu, Koch 2016, Vanishing Point Estimation and Line Classification in a Manhattan World: https://doi.org/10.1007/s11263-015-0854-5
6. Liu et al. 2023, 3D Line Mapping Revisited (LIMAP): https://arxiv.org/abs/2303.17504
7. MediaPipe Image Segmenter: https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter (geöffnet)
8. MobileSAM (Zhang et al. 2023): https://arxiv.org/abs/2306.14289; Ultralytics-Doku https://docs.ultralytics.com/de/models/mobile-sam (nur Suchtreffer)
9. ARCore Raw Depth: https://developers.google.com/ar/develop/java/depth/raw-depth
10. magicplan Genauigkeit: https://help.magicplan.app/how-accurate-is-magicplan
11. Apple RoomPlan: https://developer.apple.com/forums/tags/room-plan/ ; https://9to5mac.com/2022/06/15/ios-16-roomplan-api-3d-floor-plans/
12. ADE20K (Zhou et al.): https://arxiv.org/abs/1608.05442
13. Wang et al. 2024, Anatomizing DL Inference in Web Browsers: https://arxiv.org/abs/2402.05981 (lokal)
14. Gu et al., M-LSD (56,8 / 48,6 FPS Android/iPhone, Alternative zu ELSED, nicht nötig): https://arxiv.org/abs/2106.00186 (lokal)
15. Lokale Projekt-Docs: `docs/superpowers/research/2026-10-24-kamera-raumerfassung-android.md` (10.3, 11.4, 12), `docs/superpowers/research/2026-10-28-semantik-bausteine.md`

Offene Fragen: (1) Kein Paper gefunden, das Stuckleisten/Gardinenschienen in der Wand-Decke-Linienerkennung explizit behandelt; zwei Suchrunden ohne Treffer. (2) Führt die ADE20K-Vollversion eine Klasse „molding“? (3) onnxruntime-web/WebGPU auf Pixel 9 Pro (Mali) in einer immersive-ar-Sitzung: keine Messung gefunden. (4) Lizenz und Trainingsdaten von MediaPipes DeepLab-V3 nicht auf der Seite angegeben. (5) Hypothese Doppel-Sprung der Leiste (Gegenvorzeichen) ist ungeprüft. (6) Alle Paper nur per Abstract/Stichwortsuche, kein Volltext.

Pruefstand: 14 Quellen geprueft, 7 korrigiert, 0 entfernt.


---

<!-- 07-hoehe-massstab.md -->

# Recherche 07: Raumhöhe und Maßstab ohne Laser

Stand der Recherche: 2026-10-31. Quellenmarken: [V] Volltext gelesen, [A] nur Abstract, Webseite oder Sekundärquelle, [Vermutung] nicht belegt. Eigene Rechnungen sind als [Rechnung] markiert.

## P7 – Raumhöhe und Maßstab ohne Laser

**Problem:** Ohne Laser schwankt die geschätzte Raumhöhe zwischen 2,16 und 2,61 m, und das Verfahren kippt auf ein Scheinminimum, bei dem die Decke auf Augenhöhe liegt. Die Höhe H skaliert die ganze Skizze: Der Strahl zur Wand-Decke-Kante wird auf y=H gehoben, ein H-Fehler wirkt also auf jede Wandlage mit d/Δ (Δ = H minus Kamerahöhe). Bei Kamera 44–60 cm unter der Decke (P12) ist das Verhältnis ungünstig. Im Simulator liegt der Fehler mit Handmodell bei Median 5 cm und 90 % bei 12–15 cm, am Gerät sind es bis zu 25 cm.

**Aktueller Ansatz (Stand 26):** H ist eine Unbekannte der gemeinsamen Ausgleichung. Sie folgt aus der Parallaxe (dieselbe Kante aus zwei Abständen zur Wand) plus schwachem Vorwissen 2,55 ± 0,35 m; mit Laser wird sie auf 5 mm gesetzt. Ohne Laser gibt es maßstabsfreie Reste, den Schritt H ≤ 15 cm und die Schranke H ≥ Kamera + 0,3 m. Das reicht nicht, weil die Parallaxe nur bei Bewegung senkrecht zur Wand entsteht, sich an einer Schranke festsetzen kann und der Handkreis um den Körper (6–20 cm) kaum Basis liefert. Es gibt keine unabhängige Messung von H. Die Hit-Test-Messung auf den Boden (Kamerahöhe) liefert nur die Hälfte von Δ.

**Wissenschaft:**
- **Maßstab aus VIO ist metrisch, aber nicht fehlerfrei.** Eine Smartphone-AR-Auswertung (Hasler et al. 2019, Abschnitt Ergebnisse) kommt auf rund 1 % der zurückgelegten Strecke absolut und lokal im Subdezimeterbereich; punktuell 2 bis 5 cm im Raum (Oberflächenansatz) bzw. 4 bis 9 cm (Punktwolke). Das ist Drift, nicht Maßstabsfehler, ein globaler Maßstabsfehler ist aber ähnlich groß. Daraus folgt für Höhe 2,5 m: etwa 2,5 bis 5 cm, wenn die Kamerahöhe über dem Boden und der Deckenabstand aus derselben Ortung kommen [Rechnung]. Zahlen aus Tabelle 1 und Fazit gelesen (3D-Residuen: Punktwolke 8,8 cm, Oberflächen etwa 2 cm horizontal, 4,9 cm vertikal); dass ein globaler Maßstabsfehler ähnlich groß sei, ist [Vermutung], die Quelle misst Drift. Teilweise gelesen [V für Tabelle/Fazit], Hasler et al. 2019, Implementation and first evaluation of an indoor mapping application using smartphones and AR frameworks, Bibliothek paper/hasler2019_indoor_mapping_smartphone_AR_frameworks_ISPRS.pdf (Quelle 1).
- **ARCore gilt in Innenräumen als konsistent, mit Schwäche bei Initialisierung.** Kim et al. 2022 messen Drift von ARKit/ARCore/T265/ZED in Innenräumen; ARKit am stabilsten, ARCore innen brauchbar, bricht bei schneller Bewegung und schwachem Licht ein [A] (Quelle 2). Ling et al. 2018 (arXiv 1810.05456) vergleichen ihr VIO mit ARCore auf einem Samsung Galaxy S8; ARCore (EKF-basiert) verliert bei Bildunschärfe die Spur [V für diese Stelle] (Quelle 3). Eine frühere Fassung dieser Recherche schrieb dem Paper eine 5-%-Fehlstart-Schwelle für den Maßstab zu; sie steht dort nicht und wurde gestrichen. Ob der ARCore-Maßstab pro Sitzung um einige Prozent falsch starten kann, ist [Vermutung], keine Quelle belegt es; eine unabhängige Referenzlänge pro Sitzung bleibt trotzdem sinnvoll.
- **Monokulare Metric-Depth-Netze sind für Zentimeter zu ungenau.** Auf ARKitScenes erreicht ARKit (LiDAR-Vorwissen) RMSE 0,04 und AbsRel 0,02, die besten rein bildbasierten Modelle (ZoeDepth u. a.) liegen deutlich schlechter, selbst nach Training auf dem Datensatz ZoeDepth RMSE 0,26 und AbsRel 0,18 (Ganj et al. 2023, Tabelle/Abschnitt 3.3; ZoeDepth vortrainiert RMSE 0,61, AbsRel 0,33; nach Training RMSE 0,26, AbsRel 0,18). Mobile Kameras erzeugen Maßstabsmehrdeutigkeit durch unterschiedliche Brennweite [V für diese Abschnitte, Rest nicht gelesen] (Quelle 4, lokal paper/2310.14437_mobile_AR_metric_depth_challenges.pdf). Depth Pro liefert metrische Tiefe ohne Intrinsiken, 2,25 Megapixel in 0,3 s auf einer GPU (Bochkovskii et al. 2024) [A] (Quelle 5); Depth Anything V2 Metric-Indoor soll auf NYU AbsRel um 0,05 liegen [Vermutung, die Modellkarte nennt keinen Wert und die Zahl wurde nicht im Paper geprüft; eine Luxonis-Karte nennt 0,053 für die kleine Variante] (Quelle 6). Bei 2,5 m Deckenabstand sind 5 % AbsRel 12 cm, auf einer weißen Decke ohne Textur eher schlechter [Rechnung/Vermutung]. Fazit der Forschung: nützlich als Plausibilitätsprior, nicht als Messung.
- **Tiefe aus Bewegung (Google).** Valentin et al. 2018 schätzen Tiefe aus der Bewegung der Farbkamera mit 30 Hz auf einem CPU-Kern, sie ist die Basis der ARCore-Depth-API; Kern ist Texturabhängigkeit (Mehrblick-Stereo) [A] (Quelle 7, lokal paper/valentin2018_depth_from_motion_smartphone_AR.pdf). Dieselbe Eigenschaft gilt für unsere Parallaxe: ohne Basislinie keine Tiefe.
- **Grenze der Forschung:** Mir ist kein Paper bekannt, das die Raumhöhe mit einem Handy ohne Laser auf unter 5 cm bringt, ohne dass Boden und Wandfuß beobachtet werden. Gefunden wurde keine Studie zu Deckenhöhe aus WebXR oder ARCore [Vermutung, Suche nicht erschöpfend].

**Best Practice (Industrie/Open Source):**
- **magicplan:** Die Deckenhöhe ist eine Einstellung (Standard 2,44 m / 8 ft), die per Hand oder aus einem Bluetooth-Laser kommt, pro Geschoss oder pro Raum. Unterstützt werden Bosch, Leica DISTO, Stabila, Stanley/DeWalt, Hilti PD-I, Mileseey u. a. (PrecisionLink) (Quellen 8 bis 10). Der AR-Scan misst Maße nur als Näherung; Herstellerangaben (95 % bzw. 100 % mit Laser) wurden nicht geprüft [Vermutung]. In einem Test (Mavric Research, Sekundärquelle, Quelle 11) lag magicplan im LiDAR-Modus in einem kleinen einfachen Raum im Mittel bei etwa 5 cm, im Corner-Modus bei etwa 10 cm und in komplexen Räumen im LiDAR-Modus bei etwa 17 cm Abweichung vom Laser [A]; die Kombination mit Laser stimmte mit dem Referenzmaß überein. Die Branchenlösung für Referenzmaß ist also der Laser, nicht die Kamera.
- **Apple RoomPlan:** Hat kein Deckenobjekt; Deckenhöhe wird aus der Wandhöhe (dimension.y) abgeleitet, bei Schrägen falsch. Hohe Decken, Spiegel, Glas gelten als schwierig. Das Forum bestätigt: kein Deckenobjekt, Wandhöhe als Notlösung, bei Schrägen falsch. Rund 15 cm laut einem Forumsbeitrag ohne Quelle, anekdotisch (Quelle 12) [A]. Hohe Decken, Spiegel, Glas als schwierig: im Forum nicht gefunden [Vermutung]. Das setzt LiDAR voraus, das uns fehlt.
- **ARCore:** Depth API arbeitet 0 bis 65 m, am besten bei 0,5 bis 5 m; Flächen mit wenig Merkmalen wie weiße Wände bekommen laut Google ungenaue Tiefe; Raw Depth liefert eine Konfidenz je Pixel (Y8, 0 bis 255), texturlose Flächen ergeben meist null (Quellen 13, 14) [A]. Hit-Test trifft nur erkannte Ebenen; ARCore selbst unterscheidet Decken mit `HORIZONTAL_DOWNWARD_FACING` (Quelle 15) [A].
- **Plotlay Scan** (laut Vorrecherche): Eckpunkte antippen, eine Länge nachmessen, Plan skaliert mit. Das ist eine Einzelmaßstabs-Korrektur und entspricht dem Prinzip „eine Referenz setzt den Maßstab“.

**Auf unserem Stack:** Folgende Wege habe ich für Chrome 156 / Pixel 9 Pro bewertet:
1. **Plane Detection für die Decke: nicht tragfähig.** Die WebXR-Spezifikation kennt `orientation` = "horizontal" oder "vertical" (oder null) und ein `semanticLabel` (Quelle 16); "ceiling" steht nicht im Spezifikationstext, wohl aber im Semantic-Labels-Register des Immersive Web Group (desk, couch, floor, ceiling, wall, door, window, global mesh, other; github.com/immersive-web/semantic-labels) [A]. Ob Chrome mit ARCore das Label "ceiling" tatsächlich setzt, ist offen [Vermutung]. Oben/unten ließe sich aus der Normalen der `planeSpace` (Y-Achse) ableiten, das ist aber ungetestet [Vermutung]. Weiße Flächen werden nach Google-Doku schlecht als Ebene erkannt (Quelle 17, geöffnet und bestätigt). Aufwand zum Messen: 0,5 Tag; Erwartung: selten ein Treffer.
2. **Raw Depth gegen die Decke: nicht tragfähig.** Auflösung laut Doku nicht festgelegt (zur Laufzeit abfragen; "160x90" aus der früheren Fassung nicht belegt), auf texturlosen Flächen meist Konfidenz null; Pixel 9 Pro hat meines Wissens keinen Tiefensensor außer Laser-Autofokus [Vermutung]. Günstigstenfalls dient ein Treffer auf Möbel/Wandbild als Maßstabsprobe.
3. **Hit-Test gegen den Boden plus Wandfuß-Tipp: machbar, neu.** Vorschlag („Zwei-Punkte-Höhe“): Nutzer tippt beim Rundgang einmal auf den Wandfuß einer freien Wand (Hit-Test Boden, Entfernung d bekannt) und erfasst an derselben Wand die Wand-Decke-Kante. Beide Punkte liegen in einer senkrechten Wand; H = Kamerahöhe + d · tan(Höhenwinkel zur Kante), wobei d aus dem Bodentreffer kommt und nicht von H abhängt. Das bricht die Zirkularität, die das Scheinminimum erzeugt. Fehler [Rechnung]: d = 3 m, Kamera 1,4 m, Winkelfehler 0,5° (Gyro-Brücke liefert 0,8°) ergibt ±7 cm in d (Boden unter flachem Winkel) und etwa ±4 cm in H; schlechter bei d > 4 m. Aufwand 2 bis 3 Tage inkl. Ausgleichung als Beobachtung von H (σ ≈ 5 cm), Risiko: Wandfuß oft verdeckt, Nutzer muss tippen, Boden-Hit-Test benötigt erkannte Bodenebene (haben wir als Anker).
4. **Verbesserte Parallaxe: weiter nutzen, aber mit Führung.** Aus dem Simulator: Der Handmodell-Fehler liegt unter 5 cm nur, wenn echte Basislinie senkrecht zur Wand entsteht. Aufwand 1 Tag für eine Nutzerführung („auf die Wand zu- und wegtreten, 0,5 m“), Messung wie in Kapitel 9/12.
5. **Monokulare Tiefe im Browser: verwerfen.** Modelle 25 bis 300 MB+, in WASM/WebGPU Sekunden pro Bild auf dem Handy, Fehler im Dezimeterbereich auf weißer Decke; Mehrwert klein (so schon in 2026-10-28-semantik-bausteine.md bewertet).
6. **Referenzobjekt Tür:** Standardtürhöhen (Türblatt 1985 oder 2010 mm nach DIN 18101) könnten den Maßstab auf ±1 cm pro Meter setzen [Vermutung, Norm nicht geöffnet]. Setzt Türkanten-Erkennung oder Tipp voraus; Aufwand 3 Tage, Nutzen nur, wenn der Maßstab (nicht H) das Problem ist. Verwerfen, bis Messung zeigt, dass der Maßstab driftet.
7. **Lasermessgerät per Web Bluetooth: machbar, aber nur auf Gerätetest gesichert.**
   - **Web Bluetooth** gibt es in Chrome für Android (Android ab 6.0), nur über HTTPS, `requestDevice` braucht eine Berührung/Klick als Nutzergeste, nicht-standardisierte Dienste müssen in `optionalServices` stehen (Quelle 18) [A]. Unsere Seite läuft über HTTPS, keine Header nötig.
   - **Bosch GLM / PLR:** inoffizielles Protokoll aus Mitschnitten. Dienst `02a6c0d0-0451-4000-b000-fb3210111989`, Merkmal `02a6c0d1-0451-4000-b000-fb3210111989`. Messen: ESP32-Beispiel schreibt `C0 55 02 01 00 1A` (GLM 50 CG, Zweck im Gist nicht erklärt), Mitschnitt GLM 120 C nutzt `C0 56 01 00 1E` (Laser an, zweiter Schreibvorgang löst aus; Bytebedeutungen außer Kopf, Gültigkeitsflag und Float laut Mitschnitt spekulativ). Antwort als Indikation, Paket beginnt mit `C0 55 10 06`, Strecke als Little-Endian-Float (Meter) ab Byte 7, letzter Byte 8-Bit-Prüfsumme (nicht dokumentiert) (Quellen 19 bis 21) [A]. Python-Projekt (MIT-Lizenz, 2024 archiviert) bestätigt GLM 100 C / 50 C, Strecke in mm (Quelle 22) [A]; pymtprotocol (Quelle 21) ist ein macOS-Reimplementierung des Bosch-Stacks, kein Float-Beleg. Es ist nicht klar, ob Kopplung/Bonding nötig ist und ob Chrome die Indikationen zuverlässig liefert [Vermutung]. Bosch wirbt bei ausgeschaltetem Gerät weiter (TrackMyTools), Filterung nach Namen nötig.
   - **Leica DISTO:** Laut Leica (Quelle 24) haben D110, D510 und D810 touch Bluetooth Smart (BLE); D3a BT und D8 brauchen SPP und sind per Web Bluetooth unerreichbar [A]. Das Merkmal `3ab10101-f831-4395-b29d-570977d5bf94` (Messwert als Float) ist nur für das DISTO D2 belegt (d2relay, MIT-Lizenz, Quelle 23); ob D110, D510, D810 touch dasselbe Merkmal nutzen, ist [Vermutung].
   - **Hilti, Stabila, Mileseey:** keine Protokollquelle gefunden [Vermutung]; magicplan listet sie als kompatibel (Quelle 8).
   - **Offen:** Ob `requestDevice` innerhalb der laufenden immersive-ar Sitzung funktioniert (Auswahl-Dialog, Nutzergeste). Mein Vorschlag: Laser vor Sitzungsstart koppeln (Schaltfläche in der Seite), GATT-Verbindung offen halten, Messwerte während der Sitzung per Indikation annehmen. Dass die Verbindung eine WebXR-Sitzung überlebt, ist ungetestet [Vermutung].
   - **Aufwand:** 3 bis 5 Tage für einen Bosch-Pfad (Verbinden, Messen auslösen, Prüfsumme, Fehlerfälle, Eingabe als H-Beobachtung mit σ = 5 mm), Leica +2 Tage, jedes weitere Modell +2 Tage. Lizenz: Protokolle sind Reverse Engineering; für eine eigene Implementierung nur Fakten übernehmen, keinen Code (Gist ohne Lizenz, Python-Projekt archiviert). Kosten für den Nutzer: GLM 50 C etwa 100 Euro (Preis [Vermutung]).
   - **Genauigkeit:** Die Laserwerte liegen bei einem Bosch-Gerät im Millimeterbereich (Spezifikation nicht geöffnet [Vermutung]); die Höhe ist damit praktisch exakt, das Problem verlagert sich auf Bedienung (Laser senkrecht, Boden und Decke treffen).

**Empfehlung:** Drei Stufen, in dieser Reihenfolge. (1) **Eintippen und Laser als Referenz zuerst:** Die Höhe ist ein einziger Wert; magicplan löst es genauso. Das Eingabefeld gibt es schon; erst danach lohnt Aufwand an der Kamera. (2) **Messen: Zwei-Punkte-Höhe** (Wandfuß tippen, Kante erfassen) als erste Kamera-Lösung, Zielgenauigkeit ±5 cm, ±8 cm bei d > 4 m [Rechnung]; als Beobachtung in die Ausgleichung statt der Parallaxe-Schranke. Die entscheidende Messung: An 5 bis 10 echten Aufnahmen mit Laserhöhe die Höhe aus Wandfuß-Tipp und aus Parallaxe getrennt berechnen und gegen die Laserhöhe halten; wenn Median < 5 cm und 90 % < 10 cm, übernehmen. (3) **Web-Bluetooth-Laser als optionale Erweiterung** (Bosch zuerst) nach einem Eintages-Test, ob GATT aus Chrome auf dem Pixel 9 Pro läuft und die Verbindung die WebXR-Sitzung überlebt. **Verwerfen:** Plane Detection für die Decke, Raw Depth gegen die Decke, monokulare Tiefe, Tür als Maßstab (bis der Maßstab nachweislich das Problem ist). **Erwartung ohne Laser:** realistisch ±5 bis 10 cm in H (das entspricht etwa 2 bis 4 % Längenfehler der Wände nach der Decke-zu-Kante-Hebelwirkung [Rechnung]); mit Laser ±1 cm.

**Quellen:**
1. Hasler, Blaser, Nebiker 2019, Implementation and first evaluation of an indoor mapping application using smartphones and AR frameworks (ISPRS), lokal /Volumes/external/TobiCodetEndlichWieder/Zaene/paper/hasler2019_indoor_mapping_smartphone_AR_frameworks_ISPRS.pdf
2. Kim et al. 2022, An Empirical Evaluation of Four Off-the-Shelf Proprietary Visual-Inertial Odometry Systems, https://arxiv.org/pdf/2207.06780
3. Time-offset VIO paper mit ARCore-Maßstabsvergleich, https://arxiv.org/pdf/1810.05456
4. Ganj, Zhao, Su, Guo 2023, Mobile AR Depth Estimation: Challenges & Prospects, https://arxiv.org/abs/2310.14437
5. Bochkovskii et al. 2024, Depth Pro: Sharp Monocular Metric Depth in Less Than a Second, https://arxiv.org/abs/2410.02073
6. Yang et al. 2024, Depth Anything V2, https://arxiv.org/pdf/2406.09414
7. Valentin et al. 2018, Depth from Motion for Smartphone AR, lokal /Volumes/external/TobiCodetEndlichWieder/Zaene/paper/valentin2018_depth_from_motion_smartphone_AR.pdf
8. magicplan, Laser Distance Meters (unterstützte Marken), https://help.magicplan.app/laser-distance-meters
9. magicplan, Bosch Laser Measures Integration, https://magicplan.app/integrations/bosch-laser-measures
10. magicplan, Adjust the ceiling height of single rooms, https://help.magicplan.app/adjust-the-ceiling-height-of-single-rooms
11. Mavric Research, MagicPlan: Now with added LiDAR, https://mavricresearch.com/2020/11/10/magicplan-now-with-added-lidar-%F0%9F%A7%82/
12. Apple Developer Forums, What's the accuracy of RoomPlan scanned objects?, https://developer.apple.com/forums/thread/712500 und https://developer.apple.com/forums/thread/745735
13. Google, ARCore Depth, https://developers.google.com/ar/develop/depth
14. Google, Use Raw Depth in your Android app, https://developers.google.com/ar/develop/java/depth/raw-depth
15. Google, ARCore Plane.Type, https://developers.google.com/ar/reference/java/com/google/ar/core/Plane.Type
16. W3C Immersive Web, WebXR Plane Detection Module, https://immersive-web.github.io/plane-detection
17. Google, ARCore Fundamentals (weiße Flächen), https://developers.google.com/ar/develop/fundamentals
18. Chrome Developers, Communicating with Bluetooth devices over JavaScript, https://developer.chrome.com/docs/capabilities/bluetooth
19. Nordic DevZone, sniffing a bosch laser tape 2 (GLM 120 C), https://devzone.nordicsemi.com/f/nordic-q-a/80589/sniffing-a-bosch-laser-tape-2
20. ketan, ESP32 Bosch GLM 50CG BLE Gist, https://gist.github.com/ketan/054e9f4173aa53a04218fc545241f634
21. piannucci, pymtprotocol (Bosch-Protokoll, GLM 100 C), https://github.com/piannucci/pymtprotocol
22. philipptrenz, BOSCH-GLM-rangefinder (archiviert), https://github.com/philipptrenz/BOSCH-GLM-rangefinder
23. seichter, d2relay (Leica DISTO D2), https://github.com/seichter/d2relay/blob/main/app/__main__.py
24. Leica, DISTO Bluetooth and apps getting started on Android, https://shop.leica-geosystems.com/sites/default/files/2019-02/leica_disto_bluetooth_and_apps_getting_started_on_android_en.pdf

Hinweis zu Quelle 17: im Pruefstand geöffnet und bestätigt.

**Offene Fragen:** (a) Funktioniert `navigator.bluetooth.requestDevice` oder eine bestehende GATT-Verbindung innerhalb einer immersive-ar Sitzung in Chrome 156? (b) Verlangt der Bosch GLM 50 C Bonding vor der Indikation, und wie wird die Prüfsumme berechnet? (c) Meldet Chrome/ARCore auf dem Pixel 9 Pro Deckenebenen überhaupt (das Register kennt das Label "ceiling")? (d) Wie groß ist der echte Maßstabsfehler von ARCore pro Sitzung (Startfehler)? Keine unabhängige Zahl gefunden. (e) Türhöhe nach DIN 18101 nicht geprüft. (f) Pixel 9 Pro Tiefensensorik nicht belegt.

Pruefstand: 24 Quellen geprueft, 12 korrigiert, 0 entfernt.


---

<!-- 08-gyro-imu.md -->

# Recherche 08 – Gyro/IMU: Kalibrierung, Zeitversatz, Fusion, Web-Sensoren

Stand der Seite: 26. Gelesen wurden zuerst die Messkapitel der Projektdokumente (Weltrahmen-Messungen 29.10., Kamera-Raumerfassung Kap. 10–12). Markierung: [V] = Volltext geöffnet und gelesen, [A] = Abstract, Spezifikation oder Sekundärquelle, [Vermutung] = nicht belegt.

Neu lokal abgelegt (Identität per pdftotext, Seite 1, geprüft), in `/Volumes/external/TobiCodetEndlichWieder/Zaene/paper/`:
- `1703.00154_inertial_odometry_handheld_smartphones.pdf` (Solin, Cortes, Rahtu, Kannala)
- `1512.02363_on-manifold_preintegration_VIO.pdf` (Forster, Carlone, Dellaert, Scaramuzza)
- `1704.06053_using_inertial_sensors_position_orientation.pdf` (Kok, Hol, Schön)

Bereits lokal und hier gelesen: `1808.00692_online_temporal_calibration_time_offset_VIO.pdf` (Qin, Shen).

---

## P13 – Gyro/IMU: Zeitbasis, Achsen, Kalibrierung, Chrome-Fokus

**Problem:** Der Gyro fehlte zunächst. Die erste echte Aufnahme (29.10., Stand 15, 121 s) zeigte: `Gyroscope.timestamp` liegt am Pixel auf der Geräte­laufzeit (ca. 2,8·10⁸ ms), `devicemotion` dagegen auf dem Seitenstart; dadurch lag das `t` der Aufnahme Tage neben der Posenzeit. Dazu kamen eine Achsen-Zuordnung, die bei Ruhe falsch geschätzt wurde, und die Fokus-Falle in Chrome bis M156 (crbug 568009418; Gyro hält nach dem Berechtigungsdialog an).
**Aktueller Ansatz (Stand 26):** Zeitbasis wird auf die Posenzeit gerückt (ta − ts/1000, kleinster Versatz). Achsen-Zuordnung und Zeitversatz werden live aus den ersten 40 verfolgten Zeilenpaaren geschätzt, nur aus Paaren mit Drehung ≥ 0,4° je Zeile, Wiederholung bei 40/100/200/400/800 Paaren, Annahme nur bei Rest ≤ 25 % der Drehung und ≤ 1,1°, laufende Überwachung (Median der letzten 60 Zeilen > 1,1° → verwerfen und neu kalibrieren). Gemessen: Rest gegen ARCore Median 0,09° / p90 0,30° (566 Zeilen), Zeitversatz 0,17–0,21 s, Seite gegen Offline-Rechnung Median 0,03–0,08°. IMU-Wache meldet „Gyro liefert keine Werte“. Das trägt; Rest sind die Fragen unten (Bias, Fokus ab M157, Abtastlücken).

**Wissenschaft:**
- **Online-Zeitkalibrierung ohne Zielmuster:** Qin/Shen (IROS 2018) führen den Versatz td (IMU-Zeit = Kamerazeit + td) als zusätzliche Unbekannte in der Optimierung. Das Merkmal wird in der Bildebene mit seiner Bildgeschwindigkeit um td verschoben. In der Simulation (Versatz 5/15/30 ms, 100 Läufe, 30 s) wird td mit kleinem Fehler getroffen. An echter Hardware (Realsense ZR300) liegt das Ergebnis nah an Kalibr, die Standardabweichung ist mit 0,07–0,16 ms kleiner als bei Kalibr (0,13–0,27 ms). Der Versatz wächst etwa linear mit der Belichtungszeit (Steigung ca. 0,5: Bildzeitstempel in Belichtungsmitte). Voraussetzung: ausreichend Dreh- und Beschleunigungsbewegung, td konstant. [V] Qin, Shen 2018, Online Temporal Calibration for Monocular Visual-Inertial Systems, https://arxiv.org/abs/1808.00692
- **Wie empfindlich ist die Fusion gegen Versatz?** Im selben Paper reagiert VINS-Mono ohne Kalibrierung parabolisch auf einen Versatz; die Toleranz liegt nur bei etwa ±6 ms, OKVIS divergiert bei 30 ms in manchen Sequenzen. [V] (gleiche Quelle). Für uns heißt das: Unser Versatz von 170–210 ms ist riesig (Gyro und ARCore-Pose laufen über verschiedene Pfade), aber er ist konstant genug, um ihn über Drehraten-Korrelation einmal zu schätzen. Die gemessene Streuung 0,17 gegen 0,21 s zwischen Seite und Offline-Rechnung (40 ms) ist größer als die ±6-ms-Toleranz eines VIO. Für eine reine Drehbrücke ist das unkritisch, weil der Versatz nur die Zuordnung der Drehung zu Zeilen verschiebt, nicht die Integration (Einordnung [Vermutung], an Aufnahme 31.10. nicht getrennt gemessen).
- **Kalibr (Furgale/Rehder/Siegwart):** Offline-Batch mit Zielmuster (Aprilgrid), schätzt Kamera-IMU-Lage und Zeitversatz; benötigt Anregung aller IMU-Achsen und regelmäßige Zeitstempel (Kalibr-Wiki: Zeitstempel-Abstände prüfen, jitterarme Zeitstempel auf gleicher Uhr, alle IMU-Achsen anregen; Zeitversatz-Schätzung standardmäßig an). Furgale, Rehder, Siegwart 2013, Unified temporal and spatial calibration for multi-sensor systems, IROS, Zitat bestätigt: IROS 2013, S. 1280–1286, DOI 10.1109/IROS.2013.6696514 [A]. Rehder et al. 2016 erweitern Kalibr um weitere Parameter (Inhalt im Detail nicht geprüft; Titel dieser Folgearbeit nicht verifiziert) [Vermutung]. Grenze: braucht Zielmuster und Rechner; bei uns zu schwer, aber dieselbe Mathematik (Drehraten-Korrelation) steckt in unserer Live-Kalibrierung.
- **Achsen/Rahmen ohne Referenz:** Bei uns über die Drehraten-Zuordnung zu ARCore gelöst (Achsen [[0,0,-1],[0,1,0],[1,0,0]] am Pixel). Literatur dazu außer Kalibr-Familie habe ich nicht gesondert gefunden; unsere Lösung ist die Standardidee der Orientierungs-Korrelation [Vermutung zur Einordnung].
- **Gyro-Bias:** Gyro-Bias ist bei Stillstand direkt beobachtbar (Kok et al.: Bias der Gyros ist bei ruhendem Sensor leicht zu schätzen, der der Beschleunigungsmesser nicht). [V] Kok, Hol, Schön 2017, Using Inertial Sensors for Position and Orientation Estimation, https://arxiv.org/abs/1704.06053
- **Bias-Größenordnung:** Consumer-MEMS-Gyro-Bias-Instabilität typisch ca. 70°/h (≈ 1,2°/min) laut einer ISPRS-Arbeit, die Lee et al. 2016 zitiert [A, Sekundärzitat], https://isprs-archives.copernicus.org/articles/XLVIII-1-W1-2023/603/2023/isprs-archives-XLVIII-1-W1-2023-603-2023.pdf . Das ist der Wert nach Kompensation; ein unkalibrierter Gyro kann deutlich höhere Ausgangs-Bias haben (Kok et al.: ein ruhendes Xperia Z5 Compact driftet in der Orientierung „einige Grad in 10 s“ [V]). Die Größenordnung des Pixel-9-Pro-Rests habe ich nicht gefunden. Unsere eigene Prüfstandannahme war 0,1–0,5 °/s Restbias (Projektdokument), das entspricht 6–30 °/min und ist deutlich pessimistischer als 1,2 °/min [Vermutung, ob das für den Pixel zu hoch ist].

**Best Practice (Industrie/Open Source):**
- ARCore/VINS-Mono/OKVIS/ORB-SLAM3 schätzen Gyro-Bias und (VINS-Mono, Qin/Shen) den Zeitversatz online im Zustandsvektor; Standard in jedem VIO. [V] 1808.00692
- Chromium setzt `Gyroscope` auf Android auf `Sensor.TYPE_GYROSCOPE` (kalibrierter Typ, Bias-Kompensation durch Android) und gibt `event.timestamp` (Nanosekunden, gemäß Android-Dokumentation Zeitbasis `elapsedRealtimeNanos`, also seit Gerätestart) mal 1e‑9 als Sekunden weiter. [A] Quellcode PlatformSensor.java, https://chromium.googlesource.com/chromium/src/+/main/services/device/generic_sensor/android/java/src/org/chromium/device/sensors/PlatformSensor.java . Das passt zu unserem Befund (ts ≈ 2,8·10⁸ ms ≈ 3,2 Tage Betriebszeit). Das W3C-Generic-Sensor-Spec sagt dagegen, `timestamp` sei relativ zum Zeitursprung des Dokuments (DOMHighResTimeStamp); Chrome Android hält sich daran am Pixel offenbar nicht, devicemotion schon [Abweichung gemessen, kein Chromium-Bugreport gefunden]. [A] https://www.w3.org/TR/generic-sensor/
- Android-Doku: `TYPE_GYROSCOPE_UNCALIBRATED` liefert den Rohwert plus Bias-Schätzung des Systems; im Web nicht erreichbar [A, Android-Wissen, Doku-Seite nur teilweise gelesen].

**Auf unserem Stack:**
- Läuft bereits live (Stand 17–26). Offene Restposten:
  1. **Fokus-Falle (crbug 568009418):** Ich konnte den Bug-Eintrag nicht öffnen (Suche fand ihn nicht). Aus dem eigenen Projektdokument (Chromium-Quelle M150–M157): Gyroscope braucht Seitenfokus und sichtbaren Zustand, die Spezifikation verlangt das ebenfalls (Generic Sensor §4.2/§5.5) [A]. Ob die Behebung in M157 liegt, kann ich nicht belegen [Vermutung]; die Chrome-Plattform-Seite führt M157 am 3.11.2026 als geplanten Stable-Termin, ohne Release-Notes-Eintrag zum Gyro. Quelle: https://cr-status-staging.appspot.com/release-notes/157
  2. **Berechtigungsdialog umgehen:** Einstellung „Bewegungssensoren“ der Website vorab erlauben; im Spec ist die Berechtigung eine Vereinigung aus Accelerometer/Gyroscope/Magnetometer (W3C-Diskussion in Suchergebnis) [A]. Der „Tippen aufs Bild“-Hinweis ist heute der Notbehelf.
  3. **Zeitversatz-Fenster:** 170 ms gegen 210 ms zeigen, dass die Live-Schätzung etwa ±20 ms streut. Wenn die Brücke je Lücke nur die Drehung zwischen zwei Posen braucht, ist das egal; bei schneller Drehung (z. B. 60 °/s) wären 40 ms Versatz 2,4°. Diese Rechnung ist eigene Arithmetik, nicht gemessen.
- Aufwand: Messung der Streuung des Versatzes über alle 6 vorhandenen Aufnahmen mit Gyro: 0,5 Tage [Vermutung]. Kein Server, keine Bibliothek, keine Lizenzfrage.

**Empfehlung:** Machen/halten. Den Versatz nicht neu erfinden. Eine Messung entscheidet: Versatz und Rest (Median/p90) je Abschnitt der 4 letzten Aufnahmen aus `mess.gyLive` auslesen. Wenn die Versatz-Streuung < 30 ms und der Rest-Median < 0,3° bleibt, ist P13 abgeschlossen, und nur die Fokus-Wache bleibt bis zur Bestätigung von M157 bestehen.

**Quellen:**
1. https://arxiv.org/abs/1808.00692 [V]
2. https://arxiv.org/abs/1704.06053 [V]
3. https://chromium.googlesource.com/chromium/src/+/main/services/device/generic_sensor/android/java/src/org/chromium/device/sensors/PlatformSensor.java [A]
4. https://www.w3.org/TR/generic-sensor/ [A]
5. https://github.com/ethz-asl/kalibr/wiki/camera-imu-calibration [A]
6. https://doi.org/10.1109/IROS.2013.6696514 (Furgale/Rehder/Siegwart 2013) [A; der frühere ETH-Link ließ sich nicht öffnen und wurde ersetzt]
7. (Jen et al. 2023, MMT, zitiert Lee et al. 2016; Zitat "ca. 70°/h" im Volltext bestätigt) https://isprs-archives.copernicus.org/articles/XLVIII-1-W1-2023/603/2023/isprs-archives-XLVIII-1-W1-2023-603-2023.pdf [A]
8. https://cr-status-staging.appspot.com/release-notes/157 [A]

---

## P1 – Abschnitte nach Ortungsbrüchen zusammensetzen (Gyro-Brücke)

**Problem:** Nach Relokalisierung oder Ankerwechsel liegt der Rahmen 0,2–1 m und bis 20° daneben (im sauberen Abschnitt Median 3,6 cm). Die Karte zerfällt in 10–20 Abschnitte, 14–36 Wände statt etwa 8. Am Prüfstand mit simuliertem Bruch ohne Gyro: Gier-Fehler Median 14,6–17°, Wandfehler Median 70 cm. Gemessen ist: Gyro bringt die Drehung (14,6° → 0,8°), der Ortsversatz bleibt (p90 an den Wänden ca. 92 cm).
**Aktueller Ansatz (Stand 26):** Gyro-Brücke je Lücke (`schnitt.gyroBruecke`: Drehung zwischen den Abschnitten aus dem Gyro, `sY` = 1° + 0,5°/s · dt), gedämpfte Vorhersage der Kameraposition (v·τ·(1 − e^(−dt/τ)), τ = 1 s), Gyro nur gültig bei Lücken ≤ 50 ms zwischen Abtastwerten. Ohne Gyro-Kopplung: Gier-Raster abgelehnt (hilft nicht, bei Restbias 0,1–0,5 °/s ist Gyro allein genauer). Es fehlt die Verschiebung über die Lücke; sie ist in Lücken von 1–10 s (Anteil etwa 85 % des Restfehlers) nach Projektmessung nicht lösbar mit Gyro allein.

**Wissenschaft:**
- **Fehlerwachstum Gyro-Integration:** Konstanter Bias erzeugt linearen Winkelfehler in der Zeit, weißes Rauschen einen Random Walk mit √t. Ein ruhendes Smartphone (Xperia Z5 Compact, nur Integration) driftet in 10 s um „einige Grad“, je Achse verschieden wegen verschiedener Bias. [V] Kok, Hol, Schön 2017, https://arxiv.org/abs/1704.06053 (Beispiel 1.1). Das passt zu unserem Prüfstand-Restbias von 0,1–0,5 °/s: 1 s → 0,1–0,5°, 6 s → 0,6–3°, 10 s → 1–5°. Hebel auf die Wand: 1° Fehler bei 3 m Wandabstand sind ca. 5 cm Querversatz (eigene Rechnung).
- **Orientierung zwischen Tracking-Lücken überbrücken:** Standard in VIO: Gyro-Messungen zwischen Keyframes werden zu einer relativen Drehung vorintegriert, Bias als Korrekturterm. Forster et al. liefern die Mannigfaltigkeits-Theorie (Rotationsgruppe SO(3)) und eine Implementierung in GTSAM. [A] (nur Titelseite/Zusammenfassung gesichtet, Identität geprüft: IEEE T-RO, DOI 10.1109/TRO.2016.2597321; Details nicht ausgewertet) Forster, Carlone, Dellaert, Scaramuzza 2016, On-Manifold Preintegration for Real-Time Visual-Inertial Odometry, https://arxiv.org/abs/1512.02363 . Wir machen im Kern dasselbe, aber ohne Bias-Zustand im Ausgleich.
- **Fusion mit Visual Tracking:** Der Gyro ist kurzzeitgenau, driftet langfristig; deshalb immer mit driftfreier Information kombiniert (Kok et al.: „genau auf kurzer Zeitskala, driftet auf langer“) [V]. Bei uns driftfrei sind: ARCore-Pose (mit Sprüngen) und die Bildkanten. Ein sauberer Ansatz wäre Bias als Unbekannte im Kartenausgleich (je Abschnitt ein Biasterm). Das setzt Forster-Vorintegration um [Vermutung zur Eignung für den LDL-Löser im Worker].
- **Reine IMU-Odometrie in der Hand:** Solin et al. rechnen Inertialodometrie am iPhone mit EKF, Nullgeschwindigkeits-Updates, Pseudo-Geschwindigkeitsgrenzen und schätzen Bias online; ohne Nullgeschwindigkeits- oder Positionsstützung wird das System „schnell instabil“, Schwerkraft sickert in die Beschleunigung. [V] https://arxiv.org/abs/1703.00154
- **Grenze der Forschung:** Es gibt kein Verfahren, das nach Totalverlust die Position nur aus IMU über Sekunden hält; man braucht eine visuelle Relokalisierung (ORB-SLAM3 Atlas, VINS-Mono 4-DoF-Pose-Graph; beide lokal in `paper/`). Quellen dazu liegen in anderen Rechercheberichten.

**Best Practice (Industrie/Open Source):**
- ARCore koppelt Gyro und Kamera eng (VIO): die ARCore-Doku sagt, die Merkmalspunkte der Kamera würden mit Messungen der IMU kombiniert. Zu ARKit und zum Verhalten bei Trackingverlust (Relokalisierung) steht dort nichts [Vermutung]. [A] https://developers.google.com/ar/discover/concepts
- Unsere Gyro-Brücke entspricht sinngemäß [Vermutung, Paper nicht neu gelesen] dem Verhalten von VINS-Mono/ORB-SLAM3 bei Mehrkarten-Verbindung (Gyro für Rotation, Bild für Verschiebung); siehe die lokalen Paper 1708.03852 und 2007.11898.
- RoomPlan/Matterport/Polycam: Interna nicht öffentlich dokumentiert, nicht recherchiert [offen].

**Auf unserem Stack:**
- Gyro-Brücke ist live. Der Ortsversatz lässt sich im Web nur durch Bild-/Wandinformation lösen; das ist Thema der Berichte zu Relokalisierung/Bild-Wiedererkennung und Kanten-Landmarken, nicht des Gyros.
- Bias-Ausgleich je Abschnitt: im Karten-Worker (JS, LDL-Löser) ein zusätzlicher skalarer Winkelbias pro Lücke. Aufwand 3–5 Tage, Risiko mittel: Mehr Unbekannte, die Messdaten (Wände, Kanten) sind nach Projekterfahrung schwach (T2-Passung mehrdeutig 1,00–1,11) und können den Bias nicht sicher trennen. [Vermutung]
- Rechenzeit: ein Skalar je Lücke ist im Vergleich zu den gemessenen 20–40-fach höheren Kosten der Bildkanten vernachlässigbar [Vermutung].

**Empfehlung:** Messen, nicht bauen. Beschränke die Gyro-Brücke auf die Drehung (hat sie bereits) und lege das Konfidenzfenster dynamisch aus der Lückendauer (Bias-Wachstum 0,1–0,5 °/s ⇒ sY steigt linear, das hat die Brücke mit 0,5 °/s bereits). Die eine Messung: Aus den Stillstandsphasen der letzten Aufnahmen mit Gyro (Phasen zwischen Erfassungen) den echten Restbias des Pixel 9 Pro je Aufnahme schätzen (Mittelwert Drehrate bei ruhendem Gerät, Referenz ARCore-Pose unverändert). Liegt er unter 0,1 °/s, ist die Annahme 0,5 °/s im Prüfstand zu pessimistisch und die Drehung in 1–10 s-Lücken (bis 1° Fehler) kein Hindernis; dann bleibt der Ortsversatz das Problem und muss über Bilder gelöst werden. Liegt er über 0,3 °/s, lohnt der Bias-Term im Ausgleich.

**Quellen:**
1. https://arxiv.org/abs/1704.06053 [V]
2. https://arxiv.org/abs/1512.02363 [A, nur Titelseite]
3. https://arxiv.org/abs/1703.00154 [V]
4. https://developers.google.com/ar/discover/concepts [A]
5. Lokal: `paper/1708.03852_vins_mono_relocalization_4dof_pose_graph.pdf`, `paper/2007.11898_ORB-SLAM3_multimap_fisheye_KB.pdf` (nicht neu gelesen)

---

## P18 – Beschleunigungssensor, Magnetometer, Sensor-Raten (untersucht ohne Nutzen)

**Problem:** Der Beschleunigungssensor brachte in der nachgebildeten Messung keinen Nutzen. Rauschen ist vernachlässigbar (0,3 cm bei 3 s), es dominieren Restoffset, Fehlausrichtung IMU/Kamera und Gyro-Restbias. Zweiseitig (Start- und Endgeschwindigkeit) mit online geschätztem Bias: bei 6 s etwa 12 statt 42 cm, bei 10 s etwa 35 statt 83 cm; mit dem Gyro-Bias der Nachbildung bei 6 s nichts. Das ist nicht an echter Aufnahme geprüft (alle Zahlen nachgebildet).
**Aktueller Ansatz (Stand 26):** Nicht gebaut. `?imu=1` zeichnet `accelerationIncludingGravity` (devicemotion, 60 Hz) auf. Die Entscheidung lautet: nicht bauen, bevor die echte Aufnahme da ist.

**Wissenschaft:**
- **Doppelte Integration:** Konstanter Bias → Geschwindigkeitsfehler linear, Positionsfehler quadratisch in der Zeit; Rauschen → Varianz wächst. Nach der Gravitationsabzug zählt der Orientierungsfehler: kleine Winkelfehler lassen Schwerkraft in die Bewegung „lecken“. Beim ruhenden Xperia Z5 Compact drifteten die Positionen in 10 s um „mehrere Meter“. [V] Kok, Hol, Schön 2017, https://arxiv.org/abs/1704.06053 (Kap. 1, Beispiel 1.1 und Abb. 1.6)
- **Rechnung für uns:** Ein Winkelfehler von 0,5° lässt 9,81·sin(0,5°) ≈ 0,086 m/s² Schwerkraft in die Horizontale; nach 6 s (½·a·t²) sind das ca. 1,5 m; nach 2 s ca. 17 cm. Das ist eigene Arithmetik und erklärt, warum die Nachbildung ohne gute Orientierung und Bias nichts bringt. Die nachgebildete Verbesserung (12 statt 42 cm) setzt voraus, dass ARCore-Orientierung und Gyro nahezu perfekt sind.
- **Pedestrian Dead Reckoning (PDR) und Handy-Inertialodometrie:** Funktioniert nur mit Stützung: Nullgeschwindigkeits-Updates (ZUPT) bei Stillstand, Schrittmodell, Pseudo-Geschwindigkeitsgrenzen; ohne diese divergiert die Position. Solin et al. erreichen auf Dezimeter genaue Pfade bei Gehen mit iPhone, mit Barometer, ZUPT und Online-Bias. [V] https://arxiv.org/abs/1703.00154 Bei uns ist die Hand nicht in Gehbewegung, sondern langsam drehend: kein Schrittmuster; ZUPT gilt nur, wenn Stillstand erkennbar ist (nach unserem Protokoll: Pausen).
- **Heading-Drift:** Gyro-Bias dominiert die Richtungsabweichung bei Handy-PDR; Kalman-/Partikelfilter, Heuristic Drift Elimination als Gegenmittel [A, Suchergebnis, u. a. https://www.cambridge.org/core/journals/journal-of-navigation/article/improved-heuristic-drift-elimination-algorithm-optimisation-based-on-a-smartphone-gyroscope/9323F114A2233B8BEB95ECB256138FB5].
- **Lernbasiert (RIDI, ECCV 2018):** Regressiert Geschwindigkeit aus der IMU und korrigiert Bias vor der Integration; Ergebnisse vergleichbar zu VI-Navigation laut Autoren [A, nur Abstract-Auszug; Autoren Yan, Shan, Furukawa, ECCV 2018 S. 621–636 bestätigt], https://openaccess.thecvf.com/content_ECCV_2018/html/Hang_Yan_RIDI_Robust_IMU_ECCV_2018_paper.html . Braucht ein trainiertes Netz und Gehbewegung; für unseren Fall [Vermutung] nicht übertragbar.
- **Woodman 2007**, An introduction to inertial navigation, Cambridge UCAM-CL-TR-696: Standard-Einführung zu MEMS-Fehlerverhalten [A, Details nicht gelesen], https://www.cl.cam.ac.uk/techreports/UCAM-CL-TR-696.pdf [Titel, Jahr (2007), Report-Nr. per Suche bestätigt; dort: mittlerer Positionsfehler > 150 m nach 60 s bei einfachem MEMS-INS].

**Magnetometer / Absolute Orientation als Kompass-Prior:**
- Spezifikation: `AbsoluteOrientationSensor` fusioniert Accelerometer, Gyro, Magnetometer (x Ost, y magnetisch Nord, z oben); `RelativeOrientationSensor` nur Accelerometer + Gyro, kann driften, ist aber magnetisch ungestört. [A] https://www.w3.org/TR/orientation-sensor/
- Chromium Android: absolute → `TYPE_ROTATION_VECTOR`, relativ → `TYPE_GAME_ROTATION_VECTOR`, Gyroscope → `TYPE_GYROSCOPE`. [A] PlatformSensor.java (siehe P13)
- Indoor-Genauigkeit: In Stahlbauten fand eine MIT-Studie durchschnittlich 45° Kompassabweichung (ortsabhängig, zeitlich stabil), in einem anderen Datensatz sind Stahlträger/Armierung Hauptstörer; Höhe und Neigung des Telefons ändern die Abweichung deutlich [A, Suchergebnis], https://www.media.mit.edu/speech/papers/2011/positioning.systems.pdf [Chung, Donahoe, Schmandt et al., MobiSys 2011, Indoor Location Sensing Using Geo-Magnetism; 45° Mittelwert per Suchauszug bestätigt, PDF-Abruf scheiterte]. Kok et al.: Magnetisches Material in der Nähe ist „ein wesentliches Problem“ für die Praxis. [V] 1704.06053
- Folgerung für unseren Fall: Ein Kompass-Prior wäre als Raumrichtung nur im groben nützlich (Spiegel-/Orientierungsmehrdeutigkeit, ±45° Fehler möglich) und in Wohnungen mit Stahlbeton unzuverlässig. Als Entscheider zwischen Spiegelbildern des Grundrisses taugt er nicht [Vermutung]; ein Spiegelbild unterscheidet sich nicht durch die Nordrichtung, sondern durch den Umlaufsinn (Drehrichtung beim Scannen), die wir ohnehin kennen [Vermutung].

**Sensor-Raten im Web (Chrome Android):**
- **60 Hz Obergrenze:** Chromiums Standard-Höchstfrequenz ist 60 Hz (`kMaxAllowedFrequency = 60.0`), Magnetometer und Umgebungslicht nur 10 Hz. [A] https://chromium.googlesource.com/chromium/src/+/main/services/device/public/cpp/generic_sensor/sensor_traits.h und Design-Doc https://chromium.org/developers/design-documents/generic-sensor (Rate wird zusätzlich durch `getMinDelay()` des Geräts begrenzt, PlatformSensor.java).
- **`high-sampling-rate-sensors`:** Das ist die Android-Manifest-Berechtigung `HIGH_SAMPLING_RATE_SENSORS` für native Apps (> 200 Hz ab Android 12). [A] https://developer.android.com/develop/sensors-and-location/sensors/sensors_overview . Für Web-Seiten fand ich keine Entsprechung; die Chromium-Obergrenze 60 Hz gilt unabhängig davon. Ein Flag zum Aufheben habe ich nicht gefunden [offen].
- Unsere Messung: Gyroscope 51 Hz (Lücken < 100 ms, 19 zwischen 50 und 100 ms), devicemotion 60 Hz. Chromiums Standardfrequenz in sensor_traits.h ist 10 Hz (kDefaultFrequency), nicht 50 Hz; die gemessenen 51 Hz stammen daher vermutlich aus der von der Seite angeforderten Frequenz (bzw. der Gerätegrenze getMinDelay) [Vermutung, frühere Aussage "50 Hz = Chromium-Standard" nicht belegbar und gestrichen].
- Folge: Für Positions-Integration zu grob? Bei 50 Hz Abtastung und Handbewegungen unter 5 Hz kein Aliasing-Problem [Vermutung]; die Grenze ist Bias, nicht Rate.

**Best Practice (Industrie/Open Source):** ARCore nutzt die IMU laut Doku im Verbund mit Merkmalspunkten (VIO); dass RoomPlan/ARKit ebenso verfahren und nie allein für Position, ist nicht belegt [Vermutung]. Quelle: ARCore-Konzeptseite (Merkmalspunkte plus Trägheitssensoren), https://developers.google.com/ar/discover/concepts [A]. Handy-PDR (Solin et al.) funktioniert nur mit ZUPT, Pseudo-Updates und Barometer. [V]

**Auf unserem Stack:**
- Zugriff: `devicemotion` (60 Hz, Hauptfaden) und `Gyroscope` (50 Hz) vorhanden; Beschleunigung ist in Eigenkoordinaten, ARCore gibt die Weltpose, also lässt sich Beschleunigung über die ARCore-Orientierung drehen (Fehler nach Rechnung oben bei 0,5° ≈ 0,086 m/s²).
- Aufwand für den zweiseitigen Ansatz mit Bias-Schätzung: 5–8 Tage (EKF oder Fenster-Schätzer im Worker, Stillstandserkennung, Tests) [Vermutung]. Risiko hoch, erwarteter Nutzen nur bei Lücken zwischen 1 und ca. 6 s, wo Lücken ohnehin selten sind (Hochformat: 19 % der Bilder ohne Ortung, Querformat 0,7 %).
- Kompass-Prior: `AbsoluteOrientationSensor` bzw. `deviceorientationabsolute`; Aufwand 1 Tag, aber Fehler bis 45° möglich, daher höchstens als weicher Hinweis.

**Empfehlung:** Beschleunigung verwerfen, solange die Rate der Ortungsverluste im Querformat unter 1 % liegt (nur die Messung ändert das). Eine Messung entscheidet: In der nächsten Aufnahme mit `?imu=1` die Beschleunigung über Brüche der Länge 1–6 s gegen die ARCore-Verschiebung (vor/nach dem Bruch) vergleichen: Wenn der zweiseitig integrierte Wert bei ≥ 5 Brüchen den Versatz auf < 20 cm trifft, wiederaufnehmen; sonst endgültig streichen. Magnetometer nur zum Protokollieren mitschreiben (Aufwand 0,5 Tage), nicht in die Karte einspeisen.

**Quellen:**
1. https://arxiv.org/abs/1704.06053 [V]
2. https://arxiv.org/abs/1703.00154 [V]
3. https://www.w3.org/TR/orientation-sensor/ [A]
4. https://chromium.googlesource.com/chromium/src/+/main/services/device/public/cpp/generic_sensor/sensor_traits.h [A]
5. https://chromium.org/developers/design-documents/generic-sensor [A, nur Suchauszug]
6. https://developer.android.com/develop/sensors-and-location/sensors/sensors_overview [A]
7. https://www.w3.org/TR/orientation-event/ [A]
8. https://www.w3.org/TR/gyroscope/ [A]
9. https://openaccess.thecvf.com/content_ECCV_2018/html/Hang_Yan_RIDI_Robust_IMU_ECCV_2018_paper.html [A]
10. https://www.media.mit.edu/speech/papers/2011/positioning.systems.pdf [A, Suchauszug]
11. https://www.cambridge.org/core/journals/journal-of-navigation/article/improved-heuristic-drift-elimination-algorithm-optimisation-based-on-a-smartphone-gyroscope/9323F114A2233B8BEB95ECB256138FB5 [A]

---

**Offene Fragen:** (1) Inhalt von crbug 568009418 und ob M157 die Fokus-Falle wirklich behebt (Bug nicht auffindbar, M157-Notizen leer). (2) Echter Gyro-Restbias des Pixel 9 Pro (kein Messwert gefunden, Prüfstand nimmt 0,1–0,5 °/s an). (3) Chrome-Zeitbasis von `Gyroscope.timestamp`: Spec sagt relativ zum Zeitursprung, Pixel liefert Gerätelaufzeit; kein Chromium-Bug dazu gefunden. (4) Gibt es ein Flag oder eine Berechtigung, die Chromes 60-Hz-Grenze im Web aufhebt? Nichts gefunden. (5) Wie RoomPlan, Matterport, magicplan und Polycam Lücken in der Ortung überbrücken, nicht recherchiert (nicht öffentlich dokumentiert). (6) Wert von Forsters Vorintegration für unseren LDL-Löser nur auf Titel/Abstract-Ebene beurteilt.

Prüfstand: 17 Quellen geprüft, 8 korrigiert, 1 entfernt. (Nicht geöffnet und weiter als [A] unbestätigt: Android-Sensors-Overview, Chromium-Design-Doc, W3C orientation-event/gyroscope, Cambridge-HDE-Artikel, crbug 568009418; Zahlen aus Qin/Shen, Kok, Solin gegen die lokalen PDFs bestätigt.)


---

<!-- 09-ortungsverlust.md -->

# Recherche 09 – ARCore/WebXR: Ortungsverluste und Sprünge

Thema: P8. Stand der Seite: Stand 26. Quellenmarkierung: [V] = Volltext oder Primärseite geöffnet und gelesen, [A] = nur Abstract oder Sekundärquelle, [Vermutung] = nicht belegt.

## P8 – Ortungsverluste von ARCore (Lücken, Sprünge, Hochformat gegen Querformat)

**Problem:** Im Hochformat (Wohnküche, 10:25) hatten 19 % der Bilder keine Ortung (7 Lücken, bis 10 s), quer (11:37, anderer Raum) 0,7 % und 1 Lücke; der Raum unterscheidet sich, der Querformat-Effekt ist nicht sauber belegt. In A6–A8 dauerten 7 von 12 Lücken höchstens 1,3 s, die längste 7,8 s. Nach Lücke oder Relokalisierung liegt der Rahmen 0,2–1 m und bis 20° daneben und die Karte zerfällt in 10–20 Abschnitte (P1).

**Aktueller Ansatz (Stand 26):** Wir erkennen die Verluste selbst (Ereignis `tracking-verloren`, Bilder ohne Pose, `emulatedPosition`-Wechsel, `reset`-Listener auf dem Bezugsraum, Pose-Sprung-Detektor > 15 cm und > 1,5 m/s) und schneiden die Karte an Brüchen in Abschnitte. Gyro-Brücke (Drehfehler an Brüchen 14,6° → 0,8°), 4-DoF-Versatz je Abschnitt in der Ausgleichung, Ankernetz zum Einordnen, Haken „Querformat“. Das verhindert die Verluste nicht, es repariert sie nur nachträglich; der Ortsversatz bleibt. Eine Ursache wird nicht erfasst, weil WebXR sie nicht liefert (siehe unten). Für die Nutzerführung gibt es nur den Hinweis „Ortung neu“.

**Wissenschaft:**
- *Größenordnungen von Relokalisierung und Sprüngen.* Scargill, Chen, Gorlatova 2021 [V] (Quelle 9, Volltext gelesen) messen auf zwei Android-Handys mit ARCore 1.23: Nach einer Unterbrechung von Kamera und IMU („Pause“) dauerte die Rückkehr der Ortung im Mittel 1,2 s, nach reiner Bildunterbrechung („Hinlegen“) 6,0 s. Unsere Lücken (7 von 12 höchstens 1,3 s, längste 7,8 s) liegen im selben Bereich, wir erkennen also kein Sondergerät-Problem. Beim Weggehen und Zurückkehren verlor ARCore in 80–85 % der Szenen kurz die Ortung (0,1–11 s), korrigierte danach aber per Ringschluss die Drift besser als ARKit (4,8 cm gegen 25,1 cm). Der Hinweis, dass erfolgreiche Platzerkennung als Positionssprung von mehr als 5 cm zwischen zwei Bildern sichtbar wird, stammt aus dem ARKit-Teil (iPhone 11, Abschnitt 4.3), nicht aus dem ARCore-Vergleich. Sinngemäß gilt auch für ARCore, dass Ringschluss-Korrekturen als Sprünge sichtbar werden [Vermutung für Übertragung]. Ein Sprung ist dann meist eine Korrektur von ARCores Weltbild, kein Ausreißer zum Glätten; er kann aber auch ein Fehl-Ringschluss sein (ADVIO, unten). Unser Sprungdetektor (> 15 cm) fängt nur harte Fälle.
- *Merkmalsdichte als Vorhersager.* Dieselbe Studie (Umgebungsteil mit ARKit, nicht ARCore) [V]: Starker Einbruch bei Helligkeitsschätzung < 0,3; Platzerkennung nur bei Helligkeit ≥ 0,4 und mindestens 500 FAST-Ecken je Bild; geringe Kantenstärke (Varianz des Laplace-Bildes, Schwelle ≥ 20 je Bild) und geringe Bildentropie (über 6,9 bei allen driftarmen Szenen der Szene „unfokussierte Bewegung“) hingen mit hoher Drift zusammen. Eine weiße Tür 1,5 m seitlich des Nutzers reichte für 0,3 s Verlust und 63 cm Drift. Die Schwellen stammen von ARKit auf einem iPhone 11 und sind für ARCore auf dem Pixel nur ein Ansatz [Vermutung für Übertragbarkeit].
- *ARCore ändert sein Koordinatensystem.* Laska u. a. 2022 (VI-SLAM2tag) [V für die Methoden- und Fehlerteile, Volltext in `paper/`] (Quelle 10): ARCore passt sein lokales Koordinatensystem „gelegentlich“ an; eine einzige starre Abbildung auf das Gebäudesystem scheitert dann. Ihre Lösung sind Teilbahnen zwischen zwei Landmarken mit je eigener Ähnlichkeitstransformation (mittlerer Fehler rund 50 cm bei bis zu 15 Minuten). Das stützt unseren Weg (Versatz je Ortungsabschnitt, siehe P1), nicht eine globale Bindung. Zusätzlich: Dort fielen Bahnen aus, wenn ARCore alle Landmarken verlor oder die Pose zwischen zwei Bildern sprang.
- *Ausfälle in Benchmarks.* Kim u. a. 2022 [V für die genannte Aussage] (Quelle 11): ARCore fällt bei höherer Geschwindigkeit oder abrupten Lichtwechseln gelegentlich aus (Autofahrt), ARKit war insgesamt am robustesten. ADVIO, Cortés u. a. 2018 [V für die genannte Aussage] (Quelle 12): ARCore (und gelegentlich ARKit) zeigte „wilde Sprünge“ am Anfang der Bahnen; außerdem nutze ARCore Ringschlüsse „aggressiver“ als ARKit, erkennbar an falsch-positiven Sprüngen zwischen optisch ähnlichen Bereichen. Ein Sprung kann also auch ein Fehl-Ringschluss sein, nicht nur eine gute Korrektur. Beide Studien sind Fahr- und Gehbahnen, keine Wandabtastung; sie belegen nur, dass Sprünge und Ausfälle bei ARCore normal sind.
- *Rolling Shutter und Zeitversatz.* Guo u. a. 2014 [A, nur Abstract geprüft] (Quelle 13) zeigen für Handy-VINS: Ohne Modellierung von Rolling Shutter und Kamera-IMU-Zeitversatz verliert das Verfahren deutlich an Genauigkeit. ARCore ist geschlossen, ob und wie es das modelliert, ist nicht belegt [Vermutung: ja]. Für uns nicht beeinflussbar.
- *Grenze der Forschung.* Eine Studie, die Hochformat gegen Querformat oder Blick nach oben gegen Blick zur Wand für ARCore vergleicht, fand ich nicht. Die Haltungsfrage bleibt eine eigene Messung.

**Best Practice (Industrie/Open Source):**
- *Ursachen (Google-Doku).* ARCore verfolgt Bildmerkmale plus Trägheitsdaten; die Doku nennt drei Verlustgründe: zu wenige Merkmale (leere Wände), zu wenig Licht, zu schnelle Bewegung. Kurze Schnellbewegung überbrückt die IMU, anhaltende nicht (Quellen 1 und 3) [V]. Das deckt sich mit unserer Lage: Blick auf weiße Wand und weiße Decke ist der Standardfall für „zu wenige Merkmale“.
- *ARCore-Doku* (Quellen 1, 2, 3) [V]: Die Fehlergründe `INSUFFICIENT_FEATURES`, `INSUFFICIENT_LIGHT`, `EXCESSIVE_MOTION`, `CAMERA_UNAVAILABLE`, `BAD_STATE` gibt es nur in der nativen API. Empfohlene Nutzerführung dazu: langsamer bewegen, andere Stelle mit Textur wählen und leere Wände meiden, heller machen. Apps sollen Rückmeldung geben und zum Bewegen ermuntern, nicht vibrieren (Vibration stört die Posenschätzung). Eine Doku-Aussage zu Ringschluss oder Relokalisierung gibt es nicht; „Posen können sich ändern, wenn ARCore sein Weltverständnis verbessert“ ist die einzige Zusage (Quelle 2).
- *Anker als Gegenmittel.* Anker bleiben nach Doku an der echten Welt; ihre Zahlenpose wird bei Aktualisierungen von ARCore angepasst, nie von allein zwischen den Aktualisierungen (Quelle 4) [V]. Die Doku sagt nicht, was bei Verlust passiert. Wir haben das gemessen: Über harte Brüche tragen Anker nicht (13 von 15 harten Schnitten unverbunden), Anker als feste Bindung verschlechtern das Ergebnis (A6 20,3 → 32,0 cm). Das passt zu VI-SLAM2tag.
- *Andere Produkte.* Zu Apple ARKit/RoomPlan, Matterport, Polycam und magicplan habe ich keine geöffnete Quelle über Ortungsverluste; ich behaupte hier nichts über sie. Bei LiDAR-Geräten ersetzt der Tiefensensor einen Teil des Problems (Scargill: ToF-Tiefe beschleunigt die Ebenenerkennung auf dem Samsung, [V]), das Pixel 9 Pro hat bei uns aber nur Tiefe 160×90 über die Web-API.

**Auf unserem Stack:**
- *Was WebXR hergibt.* Chrome fragt `ArCamera_getTrackingState` ab und liefert bei jedem Zustand außer TRACKING keine Pose; `ArCamera_getTrackingFailureReason` kommt weder in `arcore_impl.cc` noch in `arcore_gl.cc` vor (0 Treffer, beide Dateien der Hauptlinie per curl geladen und durchsucht, Quelle 8) [V; Hauptlinie, nicht Chrome 156]. In `arcore_gl.cc` wird `emulated_position = true` nur für die Berührungs-Eingabequelle gesetzt (Kommentar: Controller ohne gemessene Position), nicht für die Blickpose [V]. Die Ursache (Merkmale, Licht, Bewegung) ist auf dem Web-Weg nicht erhältlich und ohne Native-Weg auch nicht beschaffbar. „Bild ohne Pose“ ist das einzige harte Signal, das wir kennen.
- *Die WebXR-Zusatzsignale sind für uns unbewiesen.* `emulatedPosition` ist laut MDN ein Marker für nicht direkt gemessene Position (3DoF-Geräte), `reset` feuert laut MDN nur bei großen Ursprungssprüngen, nicht bei kleinen Korrekturen innerhalb desselben Bereichs (Quellen 6, 7) [V]. Der Anker-Standard (Quelle 5) sagt: Das System soll Anker bei besserem Wissen nachführen; ein nicht mehr verfolgter Anker wird aus der Menge entfernt [V]. Unsere Seite protokolliert `emuliert`, `ref-reset` und `LOG.tracking.emulated`. In den beiden Aufnahmen vom 25.10. (`protokoll.json`) stehen 0 Ereignisse `emuliert` und 0 `ref-reset`, aber 5 bzw. 1 `tracking-verloren` [gemessen; die Aufnahmen können älter als die Protokollierung sein, Vorbehalt]. Zusammen mit dem Quelltext spricht alles dafür, dass die Blickpose nie `emulatedPosition` trägt und `reset` für ARCore-Korrekturen nicht feuert. Tragende Signale sind Bilder ohne Pose, Ankerverluste und unser Sprungdetektor; die Empfehlung unten stellt das mit allen späteren Aufnahmen sicher.
- *Keine dauerhaften Anker.* `requestPersistentHandle` gibt es im Standard (Quelle 5), in unserer Sitzung nutzen wir es nicht; Cloud-Anker gibt es im Web nicht. Ein Ankerwechsel nach Ortungsverlust bleibt unser eigenes Problem.
- *Hochformat gegen Querformat: Hypothesen.* ARCore trackt auf einem eigenen 640×480-Strom („Doku: immer 640×480“, aus unseren Notizen; auch Scargill beobachtet, dass das SLAM-Backend nur 640×480 nutzt, [V]). Chromes Beschnitt auf 20:9 betrifft die Seite, nicht ARCores Ortung. Der Effekt kann also nicht vom beschnittenen Bild kommen. Übrig bleiben:
  - (A) *Sichtfeld in Gierrichtung* [abgeleitet, nicht gemessen]: Der Sensor sitzt fest im Gehäuse. Im 4:3-Strom (640×480) überstreicht ein Schwenk um die Hochachse im Hochformat die kurze Bildachse (rund 55° nach unserer 69,6°-Ableitung), im Querformat die lange (rund 70°). Im Hochformat verlassen Merkmale beim Schwenken schneller das Bild. Offen ist nur, ob der 640×480-Strom das volle Sensorsichtfeld abdeckt oder beschnitten ist.
  - (B) *Haltung:* Im Hochformat wird das Handy vermutlich steiler nach oben auf die Wand-Decke-Kante gerichtet und beim Schwenken ruckeliger gehalten [Vermutung].
  - (C) *anderer Raum:* mehr Struktur im Querformat-Raum (34 m², vermutlich mehr Möbel) [Vermutung].
  - (D) *Eigene Last:* Konkurrieren ARCore und unsere Worker um Rechenzeit, wäre das im Querformat eher schlimmer (Aufnahme 11:37, Stand 22: 66 statt 32 Segmente je Bild, also mehr Arbeit) und spricht gegen die Last als Erklärung für die besseren Querwerte. Der Arm ohne Worker bleibt als Kontrolle.
- *Haltungs- und Führungsregeln, die sich belegen lassen.* (i) Langsam schwenken (Quelle 3). (ii) Das Bild so halten, dass unten Struktur mitläuft (Möbel, Türrahmen), nicht nur weiße Fläche (Quellen 1 und 9: leere Fläche im Blickfeld, auch seitlich, löst Verlust aus, auch wenn der Rest strukturreich ist). (iii) Mehr Parallaxe geben: Beim Drehen auf der Stelle gibt es wenig Verschiebung, neue Bereiche lassen sich nicht triangulieren. Dafür fand ich keine zitierbare Quelle für Handy-VIO, nur die allgemeine Lehre aus der Monokular-SLAM-Literatur [Vermutung], also an unseren Aufnahmen prüfen: Häufen sich Verluste, wenn Drehrate groß und Schritt klein ist? (iv) Nach Verlust anhalten und auf Struktur zurückblicken, bis die Ortung zurück ist (Scargill: Rückkehr 1,2 s bei Pause, 6 s bei Bildverlust, Quelle 9) [V].
- *Rechenzeit, Aufwand, Risiko.*
  - Laplace-Varianz und Entropie auf dem bereits vorhandenen 640×287-Luma-Bild: etwa 180 000 Pixel, einfacher Durchlauf. Kosten geschätzt unter 2 ms im Worker [Vermutung, messen]. Aufwand 0,5 Tage.
  - Protokollauswertung der vorhandenen Aufnahmen (Verlust gegen Nick, Gierrate, Schrittlänge, Bildkontrast): 1 Tag, kein neuer Gerätetest.
  - A/B-Aufnahmereihe quer/hoch: 0,5 Tage Gerätezeit plus 0,5 Tage Auswertung.
  - Nutzerführung (Live-Hinweis „langsamer“, „Struktur ins Bild“, „Ortung neu“ präzisieren): 1 Tag, geringes Risiko. Lizenz und Abhängigkeiten: keine.
  - Risiko: Der Hinweis „Struktur ins Bild“ passt schlecht zur Aufgabe, denn der Nutzer soll ja auf die Wand-Decke-Kante zielen, die selbst kontrastarm ist (P6).

**Empfehlung:** *Messen, dann führen.* Reihenfolge: (1) In allen neueren Protokollen zählen, ob `emuliert`/`ref-reset` je auftreten (die zwei Aufnahmen vom 25.10. zeigen 0); bleibt es bei null, ist „Bild ohne Pose“ das Verlustmaß. (2) Pro Bild Laplace-Varianz, Entropie, Nickwinkel, Gierrate, Schrittlänge mitschreiben und gegen den Verlust auswerten (gleiche Aufnahmen, kein neuer Lauf); die Schwellen aus Quelle 9 sind nur Startwerte. (3) Daraus eine Live-Führung bauen (langsamer, Nick, Struktur) und im A/B prüfen.
Die eine Messung, die den Querformat-Effekt sauber entscheidet: *derselbe Raum (die Wohnküche), Reihenfolge ABAB (quer, hoch, quer, hoch), mindestens 3 Läufe je Ausrichtung, gleiche Route und Zeit.* Je Bild Nick, Gierrate und Schrittlänge mitschreiben. Vergleich: Anteil der Bilder ohne Pose und Anzahl/Dauer der Lücken, *geschichtet* nach Nick- und Gierraten-Klasse. Bleibt die Lücke zwischen den Ausrichtungen nach der Schichtung bestehen, ist es ein Ausrichtungseffekt (A); verschwindet sie, ist es die Haltung (B). Dazu ein zusätzlicher Arm mit abgeschalteten Workern (kein Kantenfinder, keine Karte, nur Aufnahme), um Last-Konkurrenz (D) auszuschließen. Ein Raumvergleich (C) entfällt dann von selbst. Bei einem klaren Nein auf (A) ist die Antwort „Querformat bleibt ein Komfortschalter (Overlay, Kamerabild), kein Ortungshebel“. Ein natives Android bräuchte man nur, um die Ursache (`TrackingFailureReason`) zu lesen; das lohnt für diese Frage allein nicht.

**Quellen:**
1. ARCore, TrackingFailureReason (Java-Referenz): https://developers.google.com/ar/reference/java/com/google/ar/core/TrackingFailureReason [V]
2. ARCore, Grundlegende Konzepte: https://developers.google.com/ar/discover/concepts [V]
3. ARCore, Performance considerations: https://developers.google.com/ar/develop/runtime [V]
4. ARCore, Anchor (Java-Referenz): https://developers.google.com/ar/reference/java/com/google/ar/core/Anchor [V]
5. W3C Immersive Web, WebXR Anchors Module: https://immersive-web.github.io/anchors/ [V]
6. MDN, XRReferenceSpace reset event: https://developer.mozilla.org/en-US/docs/Web/API/XRReferenceSpace/reset_event [V]
7. MDN, XRPose emulatedPosition: https://developer.mozilla.org/en-US/docs/Web/API/XRPose/emulatedPosition [V]
8. Chromium, arcore_impl.cc (Hauptlinie): https://raw.githubusercontent.com/chromium/chromium/main/device/vr/android/arcore/arcore_impl.cc [V, arcore_impl.cc und arcore_gl.cc geladen und mit grep durchsucht]
9. Scargill, Chen, Gorlatova 2021, Here to Stay: Measuring Hologram Stability in Markerless Smartphone AR: https://arxiv.org/abs/2109.14757 [V, lokal `paper/2109.14757_hologram_drift_arcore_arkit.pdf`]
10. Laska, Schulz, Grottke, Blut, Blankenbach 2022, VI-SLAM2tag: https://arxiv.org/abs/2207.02668 [V, lokal `paper/2207.02668_VI-SLAM2tag_arcore_subtrajectory_correction.pdf`]
11. Kim, Song, Lee, Jung, Kim 2022, An Empirical Evaluation of Four Off-the-Shelf Proprietary VIO Systems: https://arxiv.org/abs/2207.06780 [V für genannte Aussage, lokal `paper/2207.06780_benchmark_four_proprietary_VIO_arkit_arcore_t265_zed.pdf`]
12. Cortés, Solin, Rahtu, Kannala 2018, ADVIO: https://arxiv.org/abs/1807.09828 [V für genannte Aussage, lokal `paper/1807.09828_ADVIO_arcore_arkit_tango_benchmark.pdf`]
13. Guo, Kottas, DuToit, Ahmed, Li, Roumeliotis 2014, Efficient Visual-Inertial Navigation using a Rolling-Shutter Camera with Inaccurate Timestamps (RSS): https://www.roboticsproceedings.org/rss10/p57.pdf [A, Abstract; lokal `paper/guo2014_vins_rolling_shutter_inaccurate_timestamps_RSS.pdf`]
14. Feigl u. a. 2020, Localization Limitations of ARCore, ARKit, and Hololens in Dynamic Large-scale Industry Environments (GRAPP) [A, Abstract; nur lokal `paper/feigl2020_arcore_arkit_hololens_localization_limits_GRAPP.pdf`; nennt rund 17 m Fehler je 120 m, für uns (Raum, kurze Wege) kaum relevant]

**Offene Fragen:** (1) Treten `emulatedPosition` und `reset` in Chrome 156 auf dem Pixel 9 Pro je auf? In den zwei Aufnahmen vom 25.10. null (evtl. vor der Protokollierung); neuere Protokolle auszählen. (2) Deckt der 640×480-Tracking-Strom von ARCore das volle Sensorsichtfeld ab oder ist er beschnitten? Nur messbar per `adb shell dumpsys media.camera`. (3) Gibt es eine zitierbare Studie zu Blick zur Decke gegen Blick zur Wand bei Handy-VIO oder zur Entartung beim Drehen auf der Stelle? Keine gefunden; ein Deckenkamera-Paper (MDPI), eine UAV-Studie und Li 2013 ließen sich nicht öffnen und sind nicht zitiert. (4) Verhalten von ARKit-Tracking-Gründen, RoomPlan, Matterport, Polycam und magicplan bei Ortungsverlust: keine geöffnete Quelle. (5) Ruft Chrome 156 (statt Hauptlinie) `ArCamera_getTrackingFailureReason` auf? Nur Hauptlinie geprüft.

Pruefstand: 14 Quellen geprueft, 3 korrigiert, 0 entfernt.


---

<!-- 10-kamerabild-fov.md -->

# Recherche 10 – Kamerabild: Beschnitt, Sichtfeld, Querformat, Weitwinkel

Stand der Seite: Stand 26. Abgedeckt: P9. Markierung: [V] = Volltext gelesen (lokal in `paper/`), [A] = nur Abstract, Spezifikation, Dokuseite oder Sekundärquelle, [Vermutung] = nicht belegt.

## P9 – Kamerabild zu schmal (Beschnitt, Sichtfeld, Querformat)

**Problem:** Chrome liefert das Kamerabild der Seite auf das Bildschirmformat beschnitten. Im Hochformat sind das 861×1920 Pixel mit 34,6° horizontal; die lange Achse der Hauptkamera hat 69,6°. Im Querformat misst die Seite 1920×861, also 69,6° quer (Aufnahme 11:37, Stand 22). Im Hochformat fehlten 19 % der Bilder die Ortung, im Querformat 0,7 %. Dieser Vergleich liegt auf zwei verschiedenen Räumen und ist nicht sauber. Unsere Ablation (14–35° quer, gleiche Brennweite in Pixeln) zeigt: Die Verbindung der Abschnitte hängt nicht vom Sichtfeld ab. Die Genauigkeit ließ sich dort nicht ablesen, weil die T2-Passung mehrdeutig war.

**Aktueller Ansatz (Stand 26):** Haken „Querformat“. Die Sitzung startet dann quer, weil Chrome die Ausrichtung beim Sitzungsstart festlegt. Die Kantenerkennung läuft auf 640×287 (Luma) per readPixels, ELSED im Worker. ARCore selbst sieht den Beschnitt nicht und trackt auf einem eigenen Strom. Das Hochformat bleibt wegen der Handhaltung sinnvoll. Es reicht nicht, weil 34,6° im Raum oft nur Ausschnitte einer Wand zeigen. Eine zweite Linse oder ein größeres Sichtfeld ist im Browser nicht erreichbar.

**Wissenschaft:**
- Zhang, Rebecq, Forster, Scaramuzza 2016, „Benefit of Large Field-of-View Cameras for Visual Odometry“ (ICRA). Kernergebnis: Große Sichtfelder (Fisheye, katadioptrisch) schlagen Perspektivkameras in Innenräumen, in Straßenschluchten ist es umgekehrt. Begründung im Paper: Merkmale sind gleichmäßiger verteilt und bleiben länger sichtbar; draußen verliert man Winkelauflösung. Verglichen werden 90° gegen 180° und ein Katadioptrik-Aufbau, also viel größere Sprünge als unsere 35° gegen 70°. Voraussetzung: reines visuelles VO ohne IMU, Merkmalsverfolgung. Quelle: [V] `paper/zhang2016_benefit_large_FoV_visual_odometry_ICRA.pdf` (Titel und Autoren auf Seite 1 geprüft), Projektseite https://rpg.ifi.uzh.ch/fov.html.
- Matsuki, von Stumberg, Usenko, Stückler, Cremers 2018, „Omnidirectional DSO“ (RA-L). Kernergebnis: Mit dem vollen Fisheye-Bild statt dem entzerrten Ausschnitt mehr Bildüberlappung und räumlich verteiltere Punkte, bessere Genauigkeit und Robustheit gegenüber DSO, SVO und LSD-SLAM auf Innenraum-Datensätzen. Die Zahl „−27 % ATE innen“ aus unserer früheren Notiz habe ich in dieser Sitzung nicht gegen eine Tabelle geprüft [Vermutung]. Voraussetzung: kalibriertes Fisheye, reine Sicht. Quelle: [A] Abstract und Einleitung gelesen, `paper/1808.02775_omniDSO_fisheye_direct_sparse_odometry.pdf`, https://arxiv.org/abs/1808.02775.
- Wang u. a. 2019, „CubemapSLAM“. Kernergebnis: Das System nutzt ein Cubemap-Modell für Fisheye; in der Auswertung (Fahrzeugdatensatz im Freien: Pinhole 80° gegen Fisheye 190°) ist es robuster als die Vergleichssysteme. Die Aussage "ähnliche Genauigkeit wie ORB-SLAM" ist im Abstract nicht belegt [Vermutung]. Das passt zu P8 (Ortungsverluste), nicht zu unserer Abschnittsverbindung. Quelle: [A] Abstract und Einleitung, lokal `paper/1811.12633_CubemapSLAM_fisheye_vs_pinhole_ORB.pdf`, https://arxiv.org/abs/1811.12633.
- Urban, Hinz 2016, „MultiCol-SLAM“. Mehrere starr gekoppelte Fisheye-Kameras erhöhen die Robustheit gegenüber einer einzelnen Kamera. Nicht übertragbar, weil wir nur eine Kamera haben. Quelle: [A] Abstract, https://arxiv.org/abs/1610.07336.
- Usenko, Demmel, Cremers 2018, „Double Sphere Camera Model“. Kamerabild-Modell für Linsen mit sehr großem Sichtfeld, schnell und mit geschlossener Umkehrung. Es wäre nur nötig, wenn wir Fisheye-Bilder hätten, und das haben wir im Browser nicht. Quelle: [A] Abstract, https://arxiv.org/abs/1807.08957.
- Einordnung: Die Literatur belegt, dass ein größeres Sichtfeld die Bewegungsschätzung (Merkmalsverteilung, Verfolgungsdauer, Robustheit) verbessert, vor allem in kleinen, texturarmen Innenräumen. Sie sagt nichts über die Genauigkeit gemessener Wandlinien bei gleicher Pixelzahl. Die Spanne unserer Ablation (14–35°) liegt weit unter der der Paper (90–190°); der Schluss „kein Hebel“ gilt also nur für unseren Bereich. Die Papiere gelten meist ohne IMU; ARCore ist ein VIO und hat dadurch weniger Nutzen vom Sichtfeld [Vermutung].

**Best Practice (Industrie/Open Source):**
- WebXR-Spezifikation Raw Camera Access: Das Bild muss zur Ansicht (XRView) ausgerichtet sein, die Kamera-Pyramide muss die gleiche Form wie die der Ansicht haben. Wenn die Kamera mehr sieht, darf der Browser beschneiden, aber nur so, dass die Formen exakt passen. Der Beschnitt auf Bildschirmformat ist also spezifikationskonform. Zu Intrinsik, Verzeichnung und Zeitstempel sagt die Spezifikation nichts. Quelle [A]: https://immersive-web.github.io/raw-camera-access/.
- ARCore: Der CPU-Strom für das Tracking ist immer 640×480, der GPU-Strom typisch 1920×1080. Bei einigen Geräten kann man die GPU-Auflösung über `getSupportedCameraConfigs()` und `setCameraConfig()` wählen. `CameraConfig` kennt Kamera-ID, Tiefensensor, Blickrichtung, FPS, Bildgrößen und Stereo-Multikamera, aber keine Auswahl einer Ultraweitwinkel-Linse. Quellen [A, 31.10. geprüft]: die Auflösungen 640×480 ("currently always") und typisch 1920×1080 stehen auf https://developers.google.com/ar/develop/java/camera-sharing, die Felder von `CameraConfig` auf https://developers.google.com/ar/develop/java/camera-configs (die Seite nennt keine Zahlen). Der Browser (Chrome) wählt die Konfiguration, nicht die Seite (Quellcode-Prüfung aus dem Repo-Dokument 12.7 auf Chromium 155.0.8059.87 [A, eigene Vorarbeit]).
- Android Camera2: Seit Android 9 (API 28) gibt es logische Multikameras. Man öffnet das logische Gerät und leitet Ausgabeströme per `setPhysicalCameraId` an physische Linsen. Die Garantie des Frameworks ist ein Minimum (zwei physische YUV-/RAW-Ströme anstelle eines); mehr hängt vom Hersteller ab und braucht Versuch und Irrtum. Quelle [A]: https://developer.android.com/media/camera/camera2/multi-camera. Ob das Pixel 9 Pro die Ultraweitwinkel-Linse so freigibt, ist ungeprüft [Vermutung: ja, aber im Browser nicht erreichbar].
- Pixel 9 Pro Hardware: Ultraweitwinkel mit 123° Sichtfeld, 48 MP, Autofokus, f/1.7. Quelle [A]: Google-Store-Datenblatt https://store.google.com/product/pixel_9_pro_specs und Spec Sheet (https://cdn.uc.assets.prezly.com/05fc1248-3c32-4f54-b0ce-f8752f25e6f4/-/inline/no/Pixel%209,%20Pixel%209%20Pro,%20Pixel%209%20Pro%20XL%20Spec%20Sheet.pdf), per Suche bestätigt.
- WebXR-Gemeinschaft: Dass Crop-to-fill im vollbildigen immersive-ar das Sichtfeld des Kamerabilds beschränkt, ist hier nicht belegt: der zuvor genannte WebXR-Issue #694 handelt vom Kamerazugriff allgemein (geschlossen 2019 als Duplikat) und erwähnt Crop-to-fill nicht; Quelle gestrichen [Vermutung]. Zum Bug crbug 429098666 (Zappar) konnte ich die Seite nicht lesen (Anmeldung nötig); der Inhalt stammt aus unserer Vorarbeit (Google 7/2025 sinngemäß: Rücknahme des Beschnitts wäre möglich).
- Chrome-Fehler, der die Kamerazugriffs-Funktion betraf: Auf Chrome 147/148 stürzte `camera-access` ab, wenn die Seite eine Projektionsschicht nutzt; die Korrektur steht ab M149 (crbug 507508099 laut three.js-Issue). Unser Chrome 156 ist davon nicht betroffen. Quelle [A]: https://github.com/mrdoob/three.js/issues/33404.
- Produkte: Apple RoomPlan nutzt Kamerabild plus LiDAR und blendet eine Live-Anleitung ein; zur Linsenwahl fand ich nichts [A, Sekundärquellen: https://www.channelnews.com.au/apple-showcase-ar-room-scanning-feature/]. Matterport, Polycam, magicplan habe ich in dieser Sitzung nicht gelesen [offen].

**Auf unserem Stack:**
- Beschnitt abschalten: nicht möglich, weder per Flag noch per API. Offen als Chromium-Bug. Aufwand für uns: 0 Tage. Eine Stimme beim Bug abzugeben ist möglich, hat aber keine Terminzusage.
- Querformat (69,6° × 34,6°): geht schon (Stand 22). Offene Messung: Wohnküche quer gegen die Hochformat-Aufnahme 10:25 mit gleichem Raum. Aufwand 0,5 Tage (eine Aufnahme plus Auswertung mit vorhandenen Werkzeugen). Risiko: Hochformat hat bessere Haltung für Decke-Wand; die Ausrichtung ist nach Sitzungsstart fest.
- `?ds=1920` (volle Auflösung): Der Winkelgewinn ist 3×, kostet aber Rechenzeit (P17). Würde ich nur für ein Fenster um das Fadenkreuz nutzen, nicht fürs ganze Bild. Aufwand 1 Tag [Vermutung].
- Ultraweitwinkel per getUserMedia neben immersive-ar: Laut Chromium-Entwickleraussage ist die Kamera exklusiv belegt; Chrome klemmt den Zoom auf mindestens 1,0, und physische Teilkameras einer logischen Kamera erscheinen nicht in `enumerateDevices`. Keine Intrinsik, kein gemeinsamer Zeitstempel (Vorarbeit 12.7, [A]). Die Messseite `kamera-messung.html` (Teile A–D) ist gebaut, aber auf dem Gerät noch nicht gelaufen. Aufwand 0,5 Tage am Gerät.
- Fisheye-Verfahren (OmniDSO, CubemapSLAM, Double Sphere): im Browser sinnlos, weil das Bild beschnitten und entzerrt ankommt und wir keine Kalibrierung der zweiten Linse haben. Eigenes SLAM im Browser: AlvaAR hat GPLv3 und setzt bei Verlust zurück (Vorarbeit).
- Nativer Companion (Kotlin, Camera2 plus ARCore Shared Camera): Ultraweitwinkel als Physical-Stream der logischen Kamera mit Sensor-Sync, 123° Sichtfeld. Neben ARCore lief das laut Vorarbeit nur in einem Nutzerbericht mit Verzögerungs-Workaround (ARCore-Issue #1664; ich konnte das Issue nicht öffnen). Aufwand grob 15–25 Tage (Kamera-Pipeline, ARCore-Anbindung, Datenübertragung zur Seite, Kalibrierung der Linse), Risiko hoch, weil Herstellerverhalten und Kameraexklusivität ungeprüft sind [Vermutung]. Es widerspricht dem Prinzip „reine Web-App“ und verlangt Installation.

**Empfehlung:** Messen, dann verwerfen oder Querformat als Standard setzen. Reihenfolge: (1) Querformat-Vergleich in der Wohnküche, (2) `kamera-messung.html` am Pixel, damit das Ultraweitwinkel im Browser endgültig geklärt ist, (3) nativer Companion nur, wenn (1) zeigt, dass mehr Sichtfeld Ortung und Skizze deutlich verbessert und dies nicht durch die Handhaltung erklärbar ist. Die eine entscheidende Messung: dieselbe Wohnküche, gleiche Handhaltung, einmal hoch und einmal quer, gleiche Auswertung; Kennzahlen: Bilder ohne Ortung, Anzahl der Abschnitte, Abweichung der Fläche gegen die Wahrheit (die es nur für diese Wohnküche gibt). Ein Sichtfeld-Hebel für die Abschnittsverbindung ist nach unserer Ablation nicht zu erwarten.

**Quellen:**
1. https://rpg.ifi.uzh.ch/fov.html (Zhang u. a. 2016, Projektseite)
2. `paper/zhang2016_benefit_large_FoV_visual_odometry_ICRA.pdf` (lokal gelesen)
3. https://arxiv.org/abs/1808.02775 (OmniDSO)
4. https://arxiv.org/abs/1811.12633 (CubemapSLAM)
5. https://arxiv.org/abs/1610.07336 (MultiCol-SLAM)
6. https://arxiv.org/abs/1807.08957 (Double Sphere)
7. https://immersive-web.github.io/raw-camera-access/
8. https://developers.google.com/ar/develop/java/camera-configs
9. https://developers.google.com/ar/develop/java/camera-sharing
10. https://developer.android.com/media/camera/camera2/multi-camera
11. https://github.com/mrdoob/three.js/issues/33404
12. https://www.channelnews.com.au/apple-showcase-ar-room-scanning-feature/
13. https://cdn.uc.assets.prezly.com/05fc1248-3c32-4f54-b0ce-f8752f25e6f4/-/inline/no/Pixel%209,%20Pixel%209%20Pro,%20Pixel%209%20Pro%20XL%20Spec%20Sheet.pdf
14. `docs/superpowers/research/2026-10-24-kamera-raumerfassung-android.md`, Kapitel 12.7 (eigene Vorarbeit)

**Offene Fragen:** Inhalt und Status von crbug 429098666 (Anmeldung nötig); ob das Pixel 9 Pro Ultraweitwinkel als physische Teilkamera freigibt und welche Textur (16:9 oder 4:3) ARCore im Browser liefert (`dumpsys media.camera`); ob getUserMedia neben immersive-ar auf dem Pixel läuft; ARCore-Issue #1664 nicht geöffnet; −27 % ATE von OmniDSO nicht aus der Tabelle bestätigt; Matterport, Polycam, magicplan nicht untersucht; Querformat gegen Hochformat im selben Raum fehlt.

Prüfstand: 15 Quellen geprüft, 4 korrigiert, 1 entfernt (Webxr-Issue 694).


---

<!-- 11-scan-ux.md -->

# Recherche 11 – Scan-Nutzerführung und AR-Overlay (P10, P11, P12, P14)

Stand der Recherche: 31.10.2026. Markierung: [V] = im Volltext gelesen, [A] = nur Abstract, Doku-Seite oder Sekundärquelle, [Vermutung] = nicht belegt. Ein Hinweis vorab: Zur Nutzerführung beim Raumscan gibt es kaum harte Studien mit Zahlen. Die meisten Quellen sind Herstellerdokumentation. Studien gibt es zu Objekt-/Szenenscans (IntelliCap, Pintilie, Van Brummelen), nicht zu Raumaufmaß mit Kantenfokus. Übertragung auf uns ist daher Schlussfolgerung, kein Messwert.

Gelesen im Repo: im Code von `raumskizze-probe.html` setzt `beforexrselect`-Handler auf `arBottom` und `arTop` (Zeile ~12159), ruft `navigator.vibrate` an vier Stellen auf (Zeilen ~9298, 9413, 9443, 10026) und liest ~20 Optionen per `URLSearchParams` (`imu`, `karte`, `senkdecke`, `ppx`, `hf`, `tiefe`, `quelle`, `verfolgen`, `rueckkehr`, `farben`, `ds`, …). `localStorage` wird in der Datei 20-mal erwähnt, ob für Optionen, habe ich nicht geprüft.

---

## P10 – AR-Bild voller Striche, schlechte Bildschirmnutzung

**Problem:** Die Historie der Erfassungen lag nach Drift und neuer Ortung neben der Kante und zeigte so falsche Linien. Im Querformat waren nur 42 % der Fläche frei für das Kamerabild. Mit Stand 23 zeigt der automatische Modus nur noch die Kanten des jüngsten Bild-Worker-Ergebnisses, die Skizze als dünne weiße Linie, rot gestrichelt nur das Fehlende, und die Knöpfe sind im Querformat eine Spalte rechts. Danach waren etwa 66 % frei. Offen ist, ob die Strichmenge, der Kontrast auf der weißen Decke und die Farbwahl dem Nutzer wirklich helfen. Das wurde nie mit Nutzern gemessen.

**Aktueller Ansatz (Stand 26):** Nur aktuelle Detektion (keine Historie), Decke hellblau, Senkrechte und Boden blass, Messwerte und Prüfknöpfe erst nach Antippen der Kopfzeile, Knopfspalte rechts im Querformat. Das reicht nicht als Beleg, weil (a) kein Nutzertest die Lesbarkeit auf weißer Decke prüft, (b) hellblau auf weiß wahrscheinlich unter 3:1 Kontrast liegt [Vermutung, nicht gemessen], (c) die Abdeckung („was fehlt noch") nur als rote Strichelung, nicht als Fortschritt der Runde erscheint.

**Wissenschaft:**
- IntelliCap (Yasunaga, Saito, Schmalstieg, Mori, ISMAR 2025): AR-Visualisierung zeigt am Handy, wo Ansichten fehlen (rosa-weiße Streifen für räumliche, Kugel für Winkel-Abdeckung); Nutzer löschen die Streifen durch Hinzielen. Nutzerstudie mit 12 Teilnehmern, drei Bedingungen (ohne Hilfe, nur räumliche Abdeckung, räumlich plus Winkel). Beide Hilfen senkten die gefühlte Last gegenüber „ohne" (NASA-TLX 53,4 gegen 30,5 und 39,9; beide p < 0,05). Die einfachere Variante (nur räumlich) erhielt die besseren Benutzbarkeitswerte (SUS 84,0 gegen 64,4 ohne Hilfe); die komplexere (mit Kugeln) hatte keinen signifikanten SUS-Gewinn, die Autoren vermuten mehr Denkaufwand. Kernlehre: Abdeckung als lösch-bares Muster funktioniert, mehr Zusatzgrafik kostet Bedienbarkeit. Grenze: kleine Stichprobe (die Autoren selbst warnen vor schwacher Aussagekraft), Objekt-/Szenenaufnahme, nicht Raumkanten. [V] https://arxiv.org/pdf/2508.13043 (lokal: `paper/2508.13043_IntelliCap_guidance_view_sampling.pdf`)
- Pintilie & Stuerzlinger (SFU-Eintrag März 2013; PDF nennt Computer-Aided Design & Applications, Bd. 9, 2012), „An Evaluation of Interactive and Automated Next-best View Methods in 3D Scanning": verschiedene Visualisierungshilfen schnitten ähnlich gut ab, Nutzerleistung lag nah an automatischer Ansichtsplanung. Konsequenz: Die Form der Hilfe ist weniger wichtig als dass es eine einfache Abdeckungsanzeige gibt. [A, SFU-Eintrag/Abstract per Suche bestätigt: simulierter, vereinfachter 3D-Scanner, Visualisierungen etwa gleich wirksam; Volltext nicht geöffnet] https://vvise.iat.sfu.ca/pubs/pintilie2013evaluation
- Progressive Disclosure (Nielsen Norman Group): wenige wichtige Optionen zuerst, Spezielles auf Anforderung; praktische Grenze zwei Ebenen, mehr Ebenen verwirren. Passt zu „Messwerte erst nach Antippen der Kopfzeile". [A, Praxisleitfaden, keine Studie] https://www.nngroup.com/articles/progressive-disclosure/
- WCAG 2.1 SC 1.4.11: grafische Objekte und Bedienelemente brauchen mindestens 3:1 gegen die angrenzenden Farben (bei Verlauf die schwächste Stelle). Als Prüfregel für Linien auf weißer Decke brauchbar. Gilt eigentlich für Web-UI, auf Kamerabild übertragen ist [Vermutung]. [A] https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html
- Es gibt zu „wie viel Overlay ist gut" keine Zahl, die ich belegen konnte. [Vermutung] Eine Obergrenze lässt sich nur am eigenen Gerät festlegen.

**Best Practice (Industrie/Open Source):**
- Apple RoomPlan `RoomCaptureView`: animierte Umrisse erkannter Wände/Türen/Öffnungen, Live-3D-Modell, Text-Coaching; die Umrisse zeigen den aktuellen Erkennungsstand, keine Historie als Linienwolke. [A, WWDC22 10127 Zusammenfassung] https://developer.apple.com/wwdc22/10127/
- Polycam: blaue Punkte als Abdeckungsanzeige, Fertigmeldung erst, wenn keine Punkte mehr übrig sind („Done"). Das ist Coverage-als-verschwindendes-Muster, dasselbe Prinzip wie IntelliCap. [A] https://learn.poly.cam/hc/en-us/articles/34295265957140-Improving-Scan-Accuracy-Best-Practices-for-Interior-Spaces (Seite lieferte beim Direktabruf 403; Inhalt stammt aus dem Suchergebnis)
- magicplan (iOS Manual-Scan): grüner Indikator zeigt, wo die nächste Ecke landet; es gibt Undo. [A] https://help.magicplan.app/scan-a-room-in-seconds-using-lidar
- ARKit `ARCoachingOverlayView`: vom System gezeichnete Anleitung, die sich bei schlechter Ortung selbst ein- und ausblendet (`activatesAutomatically`), mit Ziel „Tracking" oder „Horizontalebene". [A, nur Drittbindungen gelesen, Apple-Seite nicht geöffnet] https://docs.rs/objc2-ar-kit/latest/src/objc2_ar_kit/generated/ARCoachingOverlayView.rs.html
- Muster in allen vier: Anzeige = aktueller Zustand + was noch fehlt. Keine akkumulierte Historie als Linien.

**Auf unserem Stack:** Alles ist reines HTML/CSS/Canvas im `dom-overlay`; kein Zusatzaufwand durch Bibliotheken. Zur Spec: Das Overlay-Element wird vom Browser transparent gesetzt und liegt über dem Kamerabild und dem XR-Layer; Stile innerhalb sind frei. [A] https://www.w3.org/TR/webxr-dom-overlays-1/. Die Kosten einer Canvas-2D-Zeichnung von Linien über dem Bild habe ich nicht belegt gefunden [Vermutung: klein gegenüber den ~5 ms Worker-Zeit, aber unvermessen; `requestAnimationFrame` der DOM-Seite kann sich laut Spec von der XR-Framerate unterscheiden]. Aufwand für zwei Verbesserungen: (1) Kontrastprüfung per Pixelmessung der Deckenhelligkeit im Kamerabild und Linienfarbe daraus ableiten (Randhelle unter ~0,6 → dunkle Kontur um jede Linie, also Doppelstrich Halo): ~0,5 Tag. (2) Fortschrittsring „Runde" statt Strichen für die Abdeckung (Anteil der 360° mit sicherer Kante, wir kennen den Drehwinkel aus Gyro-Brücke): ~1 Tag. Risiko gering. Keine Lizenzfragen.

**Empfehlung:** Machen, klein. Reihenfolge: (a) Halo/Kontur oder Farbe nach Hintergrund (misst man in einem Durchgang an der weißen Decke), (b) Abdeckungsanzeige als Winkelring oder Kreisbogen am Bildrand, der sich füllt, statt zusätzliche Linien. Die eine Messung: 5 Testpersonen oder 5 eigene Aufnahmen in drei Räumen mit Standardoverlay gegen reduziertes Overlay (nur Fadenkreuz-Kante + Abdeckungsring), Maß = Anteil Aufnahmen, in denen die Person auf eine falsche Kante zielt oder anhält (P6). Ohne diesen Vergleich bleibt „weniger Striche ist besser" eine Annahme aus IntelliCap/Apple.

**Quellen:**
1. https://arxiv.org/pdf/2508.13043 (IntelliCap, [V])
2. https://vvise.iat.sfu.ca/pubs/pintilie2013evaluation
3. https://www.nngroup.com/articles/progressive-disclosure/
4. https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html
5. https://developer.apple.com/wwdc22/10127/
6. https://learn.poly.cam/hc/en-us/articles/34295265957140-Improving-Scan-Accuracy-Best-Practices-for-Interior-Spaces
7. https://help.magicplan.app/scan-a-room-in-seconds-using-lidar
8. https://docs.rs/objc2-ar-kit/latest/src/objc2_ar_kit/generated/ARCoachingOverlayView.rs.html
9. https://www.w3.org/TR/webxr-dom-overlays-1/

---

## P11 – Nur eine Kante am Fadenkreuz; Fadenkreuz ist Pflicht

**Problem:** Live wird nur die Kante gesucht, die am Fadenkreuz liegt, und erfasst wird nur dann. Der Nutzer muss das Fadenkreuz dauernd auf der Wand-Decke-Kante halten. Kanten aus dem ganzen Bild allein ergeben in 6 Aufnahmen keinen Grundriss; beide Quellen zusammen kosten 20–40-fach Rechenzeit (P5, P17). Die Kante am Fadenkreuz kommt in 65 % aller Bilder (77 % der sicheren). Frage hier: nur der Bedienweg, nicht die Algorithmik.

**Aktueller Ansatz (Stand 26):** Fadenkreuz-Erfassung (2 aus 2 Bilder), im automatischen Modus werden alle Kanten des jüngsten Bildes nur angezeigt. Fadenkreuz bleibt die einzige Erfassung. Das reicht nicht, weil die Bedienung Zielgenauigkeit verlangt, während man gleichzeitig das Telefon führt, Ortung hält (P8) und Tempo kontrolliert.

**Wissenschaft:**
- Für „Zielen" gegen „Automatik plus Bestätigen" fand ich keine Studie mit Zahlen zum Raumscan. Das ist eine echte Lücke. [Vermutung] Nächstliegende Evidenz: IntelliCap (siehe P10) – Nutzer, die ein Muster „abarbeiten" (Streifen löschen), erreichen hohe Abdeckung bei geringerer Last als ohne Hilfe. Das stützt das Prinzip „System markiert, Mensch räumt ab", nicht aber Kantenbestätigung konkret. [V] https://arxiv.org/pdf/2508.13043
- Van Brummelen et al. (CHI 2024), „Don't Look Now": „Don't Look Now: Audio/Haptic Guidance for 3D Scanning of Landmarks" (Van Brummelen, Urwin, Johnston, Sayed, Brostow): Audio-/Haptik-Führung statt Bildschirmanzeige beim Scannen; laut Niantic-Zusammenfassung besser als Bildschirm-Feedback für Scanqualität und Engagement, aber keine bessere Sicherheitsempfindung. Scans von Statuen/Denkmälern im Freien, nicht Raum. [A, nur Suchergebnis und UCL-Eintrag; Volltext nicht geöffnet] https://discovery-pp.ucl.ac.uk/id/eprint/10194975
- Pintilie & Stuerzlinger 2012/2013 (siehe P10): interaktive Nutzerführung erreicht nahe die Leistung automatischer Planung. [A]
- Grenze: Es gibt keine Quelle, die Bestätigungs-Tippen gegen Dauer-Zielen beim Aufnehmen von Kanten vergleicht.

**Best Practice (Industrie/Open Source):**
- magicplan AR-Scan: tippfreies Erfassen, Ecken werden automatisch gesetzt, auch hinter Möbeln; Kontrolle per Undo. Auf Android ist der AR-Scan laut einer Drittquelle seit Ende 2024 nicht mehr verfügbar, die Hilfeseite widerspricht sich; ungeklärt. [A] https://magicplan.app/blog/ar-room-scan, https://help.magicplan.app/scan-a-room-with-the-camera-of-your-mobile-device-android
- Apple RoomPlan: vollautomatisch, kein Zielen; Nutzer läuft nur durch den Raum. Nur auf LiDAR-Geräten. [A] https://developer.apple.com/wwdc22/10127/
- Magicplan Manual-Scan (iOS): Nutzer zielt auf Bodenecke, grüner Marker zeigt Ort der nächsten Ecke, Nutzer bestätigt. Das ist „Ziel + Vorschau". [A] https://help.magicplan.app/scan-a-room-in-seconds-using-lidar
- Polycam: kein Fadenkreuz; Start am Wandfuß-Eck, dann Abschwenken. [A, Suchtext]

**Auf unserem Stack:** Technisch möglich: Alle Kanten des Bildes liefert ELSED schon (~5 ms). Was fehlt, ist die Entscheidung, welche davon die Wand-Decke-Kante ist (P6) und ein Bestätigungsweg. Ein Mittelweg ohne neue Rechenlast: Das Fadenkreuz wird zum breiten „Fang-Streifen" (Fadenkreuz zieht die nächste Kante ein, wie Snap-to), Nutzer muss nur grob zielen (± ~5° statt Pixel). Aufwand ~1–2 Tage, wenn der Fang-Radius in der Erfassung parametrisiert ist [Vermutung, Code nicht geprüft]. Ein reines „alle Kanten erfassen, Nutzer bestätigt" ist an die Kantenwahl (P6) gebunden und damit nicht unabhängig lösbar. Bestätigung per Tippen ist im dom-overlay unkritisch (`beforexrselect` gesetzt, siehe P14b unten).

**Empfehlung:** Messen vor Bauen. Variante „breiter Fangbereich" probieren, weil sie bestehende Daten nutzt. Messung: Aus vorhandenen Aufnahmen (Rohkanten + Fadenkreuzlage liegen im Protokoll) nachrechnen, bei welchem Fangradius (2°, 5°, 10°) wie viele Bilder noch genau die Wand-Decke-Kante treffen und wie viele Störer (Leiste, Schrank) einfangen. Ist der Störeranteil bei 5° unter etwa 10 % [Vermutung als Schwelle], Variante bauen; sonst bleibt Fadenkreuz-Zielen. „Alle Kanten automatisch" erst nach P6.

**Quellen:**
1. https://arxiv.org/pdf/2508.13043 ([V])
2. https://discovery-pp.ucl.ac.uk/id/eprint/10194975
3. https://vvise.iat.sfu.ca/pubs/pintilie2013evaluation
4. https://magicplan.app/blog/ar-room-scan
5. https://help.magicplan.app/scan-a-room-with-the-camera-of-your-mobile-device-android
6. https://help.magicplan.app/scan-a-room-in-seconds-using-lidar
7. https://developer.apple.com/wwdc22/10127/

---

## P12 – Handhaltung zu hoch (Kamera 44–60 cm unter der Decke)

**Problem:** Hält der Nutzer das Telefon auf Augenhöhe, ist die Kamera nur 44–60 cm unter der Decke. Dann wird die Skizze ungenau (Winkel zur Kante steil, Perspektive stark, Schein-Minimum der Raumhöhe auf Augenhöhe, P7). Schulterhöhe oder Brusthöhe wäre besser für die Geometrie, aber unbequemer für den Arm.

**Aktueller Ansatz (Stand 26):** Kein erzwungener Hinweis zur Haltung; Hinweise stehen nur im Text. Es gibt keine Rückmeldung, wie hoch die Kamera ist, obwohl wir die Höhe über dem Boden aus dem Bodenanker kennen.

**Wissenschaft:**
- Zu „Handhöhe und Winkel zur Decke gegen Messgenauigkeit" fand ich keine Studie. [Vermutung] Geometrisch: Der Fehler der Kantenlage wächst mit abnehmendem Abstand zur Decke relativ zur Seitendistanz; das ist aus unseren eigenen Messungen (P7, P12) abgeleitet, nicht aus Literatur.
- Hoober (Thumb-Zone-Studie, 1.300 Beobachtungen): 49 % halten einhändig, 36 % gestützt mit zweiter Hand, 15 % zweihändig; die untere Bildschirmhälfte ist für den Daumen am besten erreichbar. Beobachtungsstudie auf der Straße, keine AR-Handhaltung. [A; Zahlen 49/36/15 % und „über 1.300 Personen" auf der A-List-Apart-Seite bestätigt, es ist Hoobers Straßenbeobachtung von 2013, Smashing-Seite nicht geprüft] https://alistapart.com/1-2-phone-grips-jpg/ und https://shop.smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users (zweite Quelle nennt teils 10 % statt 15 % zweihändig, ungeprüft)
- Zu Hoch- gegen Querformat-Ergonomie einhändig fand ich keine Daten (die Suchtreffer behandeln Querformat nicht). Offene Lücke.

**Best Practice (Industrie/Open Source):**
- Polycam: 1–2 m Abstand zu Oberflächen, nach oben und unten kippen, um Deckenecken und Boden-Wand-Fugen zu fassen; so wird Raumhöhe ermittelt. Bei Ortungsverlust anhalten und langsam schwenken. [A] https://learn.poly.cam/hc/en-us/articles/34295265957140-Improving-Scan-Accuracy-Best-Practices-for-Interior-Spaces
- Apple RoomPlan: Anleitung kommt als einzelne Textinstruktion (näher an die Wand, weiter weg, mehr Licht, langsamer, zu wenig Textur); mindestens 50 Lux; Sitzung laut WWDC-Seite besser nicht länger als 5 Minuten (Empfehlung wegen Ermüdung/Akku/Wärme, nicht erzwungen). [V für die Enum-Seite: https://developer.apple.com/documentation/roomplan/roomcapturesession/instruction.md; A für die WWDC-Angaben]
- Matterport (Kamera auf Stativ, nicht Hand): Aufnahmehöhe rund 55–60 Zoll (etwa 1,4–1,5 m) laut Foren, keine offizielle Vorgabe. [A, Forum] https://wegetaroundnetwork.com/topic/5495/10-scanning-tips-for-new-matterport-users
- Muster: Alle reden von Abstand zur Wand, keiner nennt Abstand zur Decke. Das ist unsere Besonderheit (Kantenscan) und hat keine Vorlage.

**Auf unserem Stack:** Die Kamerahöhe über dem Boden ist als Pose im `local`-Raum plus Bodenanker schon da; Raumhöhe kennen wir grob (Rand 2,16–2,61 m). Eine Live-Anzeige „Kamera 1,35 m hoch, Decke ~1,1 m darüber" und eine Farbe/Text, wenn der Abstand zur Decke unter einer Schwelle liegt, braucht nur JS im Overlay. Aufwand 0,5–1 Tag. Problem: Die Raumhöhe ist unsicher (P7); ein Hinweis auf Basis einer falschen Höhe wäre selbst falsch. Absicherung: Hinweis erst nach stabiler Höhe, oder nur über die Kamerahöhe über dem Boden (sicherer, braucht keine Deckenhöhe): „Kamera unter 1,3 m = ok; über 1,6 m = zu hoch" [Vermutung bei den Schwellen]. Risiko: Nutzer ermüden, wenn der Arm unter Brusthöhe bleiben soll; Abwägung Genauigkeit gegen Handlichkeit ist nicht gemessen.

**Empfehlung:** Messen, dann einen weichen Hinweis bauen. Messung: Aus vorhandenen Aufnahmen die Kamerahöhe über dem Boden (Medianwert je Aufnahme) gegen den Grundrissfehler (Fläche gegenüber Wahrheit, soweit vorhanden, sonst Spurstreuung) auftragen. Zeigt sich ein Knick (z. B. ab 1,5 m wird es schlechter), setzen wir die Schwelle dort. Ohne Knick kein Hinweis und keine neue Regel. Reihenfolge: nach P10 (Kontrast), weil derselbe Overlay-Platz.

**Quellen:**
1. https://learn.poly.cam/hc/en-us/articles/34295265957140-Improving-Scan-Accuracy-Best-Practices-for-Interior-Spaces
2. https://developer.apple.com/documentation/roomplan/roomcapturesession/instruction.md
3. https://developer.apple.com/wwdc22/10127/
4. https://alistapart.com/1-2-phone-grips-jpg/
5. https://shop.smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users
6. https://wegetaroundnetwork.com/topic/5495/10-scanning-tips-for-new-matterport-users

---

## P14 – Einstellungen nur per URL

**Problem:** Im Code werden etwa 20 Optionen (`imu`, `karte`, `senkdecke`, `ppx`, `hf`, `tiefe`, `quelle`, `verfolgen`, `rueckkehr`, `farben`, `ds`, …) per URL gelesen. Das verstößt gegen die Regel „keine Einstellungen als URL-Parameter für Nutzer". Die Regel gilt für Nutzer; für Entwicklungs- und Prüfzwecke ist es bequem, kostet aber im Feld (Handy-Adresszeile, Lesezeichen, Verlust beim Neustart).

**Aktueller Ansatz (Stand 26):** `URLSearchParams.get(...)` für alle Schalter. Für „Companion-Einstellungen" gilt schon die Regel Haken/Buttons.  Nicht geprüft: welche der Optionen schon zusätzlich in `localStorage` liegen (20 Treffer für das Wort in der Datei).

**Wissenschaft:** Kein Forschungsthema. Die fachliche Grundlage ist Praxisliteratur:
- Fowler (Feature Toggles): vier Arten (Release, Experiment, Ops, Permission) mit unterschiedlicher Lebensdauer; Toggles sind Inventar mit Folgekosten und sollten mit Ablaufdatum entfernt werden; „aus" soll altes Verhalten sein; Kombinationen nicht alle testen, sondern die erwartete Produktionskonfiguration (plus die geplant einzuschaltenden Schalter) und den Rückfall mit diesen Schaltern aus; optional alles an. Pro-Anfrage-Überschreibungen sind riskant, wenn Endnutzer sie setzen können. [A, Praxisaufsatz] https://martinfowler.com/articles/feature-toggles.html
- MDN Web Storage: `localStorage` ist pro Herkunft getrennt und bleibt über Neustarts erhalten; im privaten Modus kann der Speicher leer oder mit Quote 0 sein; Zugriff in `try/catch`, Werte nur als Strings (JSON). [A] https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API

**Best Practice (Industrie/Open Source):**
- Dauerhafte Nutzereinstellung: `localStorage` mit einer Schemaversion und Standardwerten im Code; Anzeige als Haken auf einer Einstellungsseite; Zustand im AR-Overlay sichtbar. [A, aus MDN + Fowler abgeleitet]
- Entwickler-/Prüfmodus getrennt: Bei Fowler sind das Ops- bzw. Release-Toggles; im Web üblich ist ein versteckter Schalter (z. B. langes Antippen des Stand-Zeigers) statt URL. [Vermutung zur üblichen Praxis; Quelle nicht gefunden]
- Remote-Konfiguration (Firebase Remote Config u. ä.): braucht Server/SDK; für uns nicht anwendbar, da nur statische Dateien. [Vermutung ohne eigene Prüfung]

**Auf unserem Stack:** Eine statische JSON-Datei (`config.json` neben der Seite, per FTPS hochgeladen) wäre Remote-Konfiguration ohne Server: einmal beim Start gelesen, mit Fallback auf Standardwerte. Aufwand für die Umstellung: ein Optionsregister (Name, Typ, Standard, Gruppe „Nutzer"/„Prüfung", Beschreibung) 0,5 Tag; Einstellungsseite mit Haken 0,5–1 Tag; die alten URL-Parameter bleiben für Prüfmodus lesend erhalten und werden im Register einmalig gelesen (nicht in `localStorage` geschrieben, damit ein alter Link keine Dauerwirkung hat). Risiko: Bei `localStorage`-Fehlern (private Fenster, Daten gelöscht) Standardwerte statt Absturz. Die Seite braucht ohnehin `try/catch` darum. Kein Lizenz- oder Header-Problem.

**Empfehlung:** Machen. Ein Optionsregister, Nutzeroptionen als Haken (`localStorage`, Schlüssel mit Version), Prüfoptionen hinter einer versteckten Geste. Erst Register und `try/catch`, dann Oberfläche. Messung ist hier nicht nötig; Prüfung: Alle Schalter, die im Protokoll als Einstellung aufgeführt werden, kommen auch beim Wiederöffnen ohne URL zurück (Abnahmetest, 10 Minuten).

**Quellen:**
1. https://martinfowler.com/articles/feature-toggles.html
2. https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API

---

## Zusatz zu P11/P12 – Haptik, Ton, Hoch- gegen Querformat, DOM-Overlay (gehört thematisch zu den obigen Problemen)

**Befund Haptik (wichtig):** Google rät in der ARCore-Performancedoku ausdrücklich davon ab, das Vibrationsmotor-Feedback zu nutzen, weil Vibration die Posenschätzung kurz stören kann. [A, Seite geöffnet; es nennt keine Zahlen] https://developers.google.com/ar/develop/runtime. Wir rufen `navigator.vibrate` in `raumskizze-probe.html` an vier Stellen (8–40 ms Muster) auf. Zusätzlich verlangt Chrome eine Nutzeraktivierung (sticky activation) für `navigator.vibrate`, laut MDN; Versionsnummer (M60) und Rückgabewert `false` ohne Aktivierung sind hier nicht belegt [Vermutung]. [A] https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate. Offen und messbar: Ob 8–30 ms Vibration bei uns Ortungssprünge oder Gyro-Störungen erzeugt. [Vermutung: ein Störeffekt ist plausibel, die Stärke unbekannt]. Messung: Gyro-Rauschen und ARCore-Posensprünge in den 2 s nach einem Vibrationsaufruf gegen die 2 s davor aus vorhandenen Protokollen (Ereigniszeitpunkte sind im Protokoll) auswerten. Wirkt es, Vibration nur bei Ruhe (kein Scannen) nutzen und im Scanbetrieb auf Ton (Web Audio) oder Bild umstellen. Aufwand 0,5 Tag.

**Befund Ton:** Ton als Rückmeldung belegt nur indirekt (Van Brummelen, CHI 2024, [A]): Audio und Haptik statt Bildschirm lieferten bessere Scanqualität. Ob Ton im lauten Baustellenumfeld taugt, ist [Vermutung, unbelegt]. Chrome verlangt auch für Audio eine Nutzeraktivierung (Autoplay-Regeln) [Vermutung aus allgemeiner Kenntnis, hier nicht geöffnet].

**Befund `beforexrselect`:** Laut Spec feuert es auf dem obersten Element unter dem Strahl, bevor `selectstart` kommt; `preventDefault()` unterdrückt `selectstart`, `selectend` und `select`; ein Handler auf einem Container sperrt XR-Eingabe nur über den interaktiven Bereichen. [A] https://www.w3.org/TR/webxr-dom-overlays-1/. Wir haben die Handler schon auf `arBottom`/`arTop` (Z. 12159/12162). Hinweis: Laut Spec sind die DOM-Ereignisse (z. B. `pointerdown`) unabhängig und feuern weiter, auch wenn `beforexrselect` abgebrochen wird. Das ist nur dann ein Problem, wenn wir Antippen im Bild für eine Auswahl nutzen und gleichzeitig Knöpfe haben. Die Spec sagt zu reinen Touch-Ereignissen wenig. Das Verhalten auf dem Pixel messen (ein Testlauf mit Konsolen-Log: kommen `select`-Ereignisse beim Antippen eines Knopfes durch?). 0,25 Tag.

**Befund Hoch/Quer und Griff:** Keine belastbaren Daten (siehe P12). Die Wahl Hochformat 34,6° horizontal gegen Querformat ~70° (P9) überwiegt die Ergonomie; Daumenreichweite im Querformat ist eher am rechten/linken Rand (Knopfspalte) [Vermutung]. Entscheidung am Gerät, nicht aus Literatur.

**Befund Statuszeile nach Antippen:** Entspricht Progressive Disclosure (siehe P10). Eine Ebene Detail genügt. [A, NN/g]

---

## Offene Fragen

- Es gibt keine Studie, die Zielen (Fadenkreuz) gegen automatische Kantenerfassung mit Bestätigung beim Raumscan vergleicht; Übertragung von IntelliCap und Apple/magicplan ist Schluss, kein Beleg.
- Kein Wert für „maximale Overlay-Strichmenge" und keine belastbare Aussage, ob Hellblau auf weißer Decke 3:1 erreicht (Pixelmessung nötig).
- Hoch- gegen Querformat-Ergonomie einhändig beim Heben des Telefons nach oben: keine Daten gefunden.
- Kosten eines Canvas-Overlays im dom-overlay auf dem Pixel 9 Pro unvermessen.
- Ob magicplan-AR auf Android noch existiert (Hilfeseite und Drittbericht widersprechen sich).
- Apple-Seite zu `ARCoachingOverlayView` und der Volltext von Pintilie 2013 und Van Brummelen 2024 nicht geöffnet (Seiten lieferten Fehler oder 403, Niantic-Weiterleitung 404); beide nur [A].
- Ob Vibration auf dem Pixel die ARCore-Pose messbar stört (Google warnt, Stärke unbekannt).

Prüfstand: 17 Quellen geprüft, 7 korrigiert, 0 entfernt.


---

<!-- 12-genauigkeit.md -->

# Genauigkeit messen und Prüfwerkzeuge absichern (P3, P16)

Stand der Recherche: 31.10.2026, Seite Stand 26. Kennzeichnung: [V] = Quelle (oder genannter Abschnitt) im Volltext gelesen, [A] = nur Abstract, Webseite, Suchergebnis oder Sekundärquelle, [Vermutung] = nicht belegt. Wo ein Paper nur teilweise gelesen wurde, steht der gelesene Abschnitt dabei.

---

## P3 – Kein verlässlicher Genauigkeitsmaßstab

**Problem:** Wahrheit gibt es nur für eine Wohnküche. Der Vergleich Skizze gegen Grundriss braucht eine Zuordnung (4 Drehungen, ggf. Spiegelung), und die ist in A6–A8 mehrdeutig: Die Gesamtpassung liegt bei 1,00–1,11 (Verhältnis Zweitbeste zu Beste), und 17 von 19 Abschnitten sind mit Orakel-Posen mehrdeutig. Die früheren „2,3 / 5,8 cm mit Orakel“ waren Selbstpassungen. Ergebnis: Unterschiede zwischen Ständen sind dort „kaum entscheidbar“, und die IoU der Gesamtkarte (0,20 → 0,21) zeigt den echten Gewinn der Gyro-Brücke gar nicht.

**Aktueller Ansatz (Stand 26):** Zwei Maße. (1) Gesamtpassung der Karte an die Wahrheit der Wohnküche (IoU, Wanddistanz, Ecken, Editierdistanz Außenring gegen 14 Wahrheitsecken). (2) Der Prüfstand mit simuliertem Bruch (siehe P16). Das reicht nicht, weil (1) von einer Registrierung abhängt, die selbst mehrdeutig ist, und nur einen Raum abdeckt; (2) misst nur die Abschnittsverbindung, nicht den Grundriss.

**Wissenschaft:**
- **Zwei Metrik-Familien in der Grundrissliteratur.** (a) Strukturmetriken auf Raum/Ecke/Winkel-Ebene mit Precision/Recall/F1, Standard auf Structured3D (Floor-SP, MonteFloor, RoomFormer, FRI-Net); die Schwellen (Raum-IoU > 0,5, Ecke innerhalb 10 Pixeln, Winkel innerhalb 5°) stammen aus einer Suchergebnis-Zusammenfassung [A], FRI-Net Abschnitt 4.1 bestätigt nur „Precision, Recall, F1 für Room, Corner, Angle“ [V, Abschnitt]. Die Pixelschwelle ist an Rasterbilder gebunden und nicht auf Zentimeter übertragbar. (b) Geometrische Qualität gegen Referenzmodell: ISPRS-Benchmark Indoor Modelling (Khoshelham et al. 2017) mit Vollständigkeit, Korrektheit (Flächenanteil innerhalb Puffer b = 10 cm) und Genauigkeit (Median des Abstands Referenz zu nächster Modellfläche, Grenze r = 10 cm), nur Wände. Über sechs Datensätze liegen die Ergebnisse bei 0,51–6,66 cm Genauigkeit, 0,29–0,94 Vollständigkeit und 0,14–0,92 Korrektheit [A, Ergebnisseite gelesen, Paper nicht]. Das ist unser „Wanddistanz Median/p90“ in anderer Schreibweise: Median ist üblich, p90 ist unsere Ergänzung.
- **Registrierungsfreie Maße als Vorbild.** GRIHA (Goyal et al. 2021) bewertet gerade ohne Registrierung: mittlerer absoluter Prozentfehler von Fläche und Seitenverhältnis je Raum gegen Handmaß, und vergleicht damit mit magicplan und drei weiteren Apps. Zahlen dort: Fläche 3,1–5,6 % (GRIHA), 3,7–5,5 % (magicplan), Seitenverhältnis 1,8–3,3 % (magicplan) [V, Abschnitt 6.4 und Tabelle 3]. Einschränkung: wenige Räume, Wahrheit per Handmessung, Räume sind Klassenzimmer, Büros und Labore; in der Tabelle liegt magicplan bei Büro-Seitenverhältnis (1,81 %) und Labor-Fläche (5,52 vs. 5,59 %) vor oder gleichauf mit GRIHA.
- **Mehrdeutigkeit ist eine Eigenschaft der Daten, nicht des Lösers.** Floorplan-Jigsaw (Lin et al. 2019) nennt es ausdrücklich: Mehrere Platzierungen erzeugen denselben oder einen ähnlich plausiblen Grundriss; ein Randähnlichkeitsterm mildert es, bleibt es, braucht es zusätzliche Bedingungen, z. B. eine vom Nutzer vorgegebene Reihenfolge der Fragmente. Dort gilt ein Layout als richtig, wenn der mittlere Eckabstand unter 5 % der Bounding-Box-Diagonale liegt [V, Abschnitte Evaluation metrics und Ambiguity]. Folgerung für uns: Eine Mehrdeutigkeit gehört als Zahl gemeldet (Verhältnis Zweitbeste/Beste), nicht wegoptimiert.
- **Zertifizierbare Registrierung löst das nicht.** SE-Sync (Rosen et al. 2019) liefert für Posegraphen ein nachträglich prüfbares Zertifikat, dass die gefundene Lösung für das Rauschmodell global optimal ist; eine zweite, symmetrisch gleich gute Lösung (Raum mit 2-facher Symmetrie) zertifiziert das nicht weg [V, Zusammenfassung und Einleitung; die Aussage zur Symmetrie ist meine Folgerung, [Vermutung]]. Der Gewinn für uns wäre klein, der Aufwand (SDP-Relaxation) hoch.
- **Zwei Schwellen berichten.** LaMAR (Sarlin et al. 2022) berichtet Recall bei fein (1°, 10 cm) und grob (5°, 1 m) und baut die Wahrheit aus Laserscans mit automatischer Ausrichtung; Posen mit Restunsicherheit über 10 cm (99,7 % Vertrauen, σ ≈ 3,3 cm) werden verworfen [V, Abschnitte 4.4 und Evaluation]. Übertragbar ist das Prinzip: fein zeigt „fast richtig“, grob zeigt „völlig daneben“ getrennt, und Wahrheit mit eigenem Unsicherheitsmaß.
- **Trajektorienmaße (ATE/RPE, evo, TUM).** Sturm et al. 2012: RPE = Fehler der Relativbewegung über Intervall Δ (Drift), ATE = Fehler nach Ausrichtung der ganzen Trajektorie; ausdrücklich warnt das Paper davor, Δ = n zu wählen (Start gegen Ende), das bestrafe frühe Drehfehler stärker als späte, besser über alle Δ mitteln [V, Abschnitt V]. ATE-Ausrichtung reagiert empfindlich auf Ausreißer [A, 2026er Suchergebnis, nicht geöffnet]. evo (Grupp) bietet APE/RPE, TUM-Format, Lizenz GPL-3.0 [A, README]. Für uns relevant: RPE über feste Zeitfenster entspricht genau dem Prüfstand (Bruch = Fenster); ATE über die Gesamttrajektorie ist wegen Ankerwechseln wenig aussagekräftig.
- **Grenze der Forschung:** Es gibt keinen öffentlichen Datensatz, der unser Szenario abdeckt (Handscan der Wand-Decke-Kante mit ARCore-Brüchen, Wahrheit Grundriss). ZInD (Zillow, CVPR 2021) hat 360°-Panoramen mit 3D-Layouts und 2D-Grundrissen, Metriken für Layout und Registrierung [A, nur Suchergebnis, Paper gab HTTP 403]; Structured3D ist synthetisch; ARKitScenes hat Laserscans (Faro) als Wahrheit, aber Objekt-Boxen statt Raumlayout [A]. Keiner enthält ARCore-Brüche. Heißt: eigene Wahrheit ist unvermeidbar.

**Best Practice (Industrie/Open Source):**
- **Angaben der Hersteller sind Eigenangaben und unabhängig kaum belegt.** Die magicplan-Blogseite (Pen vs. Laser vs. LiDAR) nennt nur „hochgenau“ bzw. „genauer als Handmaß“, in dem lesbaren Text stehen keine Prozentzahlen; die früher hier genannten „unter 1 %“ und „100 %“ konnten auf der Seite nicht belegt werden und sind gestrichen [A, Seite geöffnet]. Matterport nennt ca. 1 % [A, Forenzitat]. Polycam nennt ±½ Zoll (~1,3 cm) bei Innenräumen [A, Suchergebnis]. Apple RoomPlan: Apples Forschungsseite nennt nur Erkennungsgüte (95 % Precision/Recall Wände und Fenster, 90 % Türen, 2D-IoU-Zuordnung) und Raumgrenze 15 × 15 m, keine Zentimeterangabe [V, Seite gelesen]. Für RoomPlan fand ich keine unabhängige Studie mit Wandlängenfehler [A, Suche].
- **Unabhängige Zahlen für LiDAR-iPhone-Apps:** Treccani et al. 2024 (ISPRS): fünf Apps in Flur und Straße gegen Laserscanner, Fehler im Bereich 1 cm bis 10 cm, Schleifenschluss hilft [A, Abstract gelesen, Zahlen nicht aufgeschlüsselt]. Ein Blogtest nennt magicplan-LiDAR in komplexen Räumen im Mittel ~17 cm daneben [A, Suchergebnis, Quelle nicht geöffnet]. Brauchbare Einordnung: Konsumenten-Apps liegen bei 1–3 % Länge, in schwierigen Räumen bei Dezimetern. Das ist unser Zielbereich („Zentimeter bis wenige Dezimeter“), wir müssen also nicht besser als diese Apps sein, aber nachweislich so gut.
- **Handwerk als Maßstab (DIN 18202, [V] aus Stahlbau-Arbeitshilfe 10.1, Bauforumstahl 04/2020, die Tabellen 1–4 der Norm wiedergibt; Norm selbst nicht gelesen):** Zulässige Maßabweichung im Grundriss ±10 mm (≤ 1 m), ±12 (1–3 m), ±16 (3–6 m), ±20 (6–15 m). Winkelabweichung als Stichmaß: 3 mm (≤ 0,5 m), 6 (bis 1 m), 8 (1–3 m), 12 (3–6 m), 16 (6–15 m). Ebenheit flächenfertiger Boden/Fliesenbelag: 2 mm bei 0,1 m, 4 mm bei 1 m, 10 mm bei 4 m, 12 mm bei 10 m, 15 mm bei 15 m. Folgerung: Ein „normaler“ Rohbauraum ist selbst ±1–2 cm unrechtwinklig und ±1–2 cm lang; Kamera-Messung im Dezimeterbereich ist für die Skizze (Grundform, Wandzuordnung) in Ordnung, für die Verlegung nicht, dafür ist der Laser da. Das stützt die Produktidee aus dem Recherchedokument (Kamera zeichnet, Laser misst).
- **Profi-Workflow:** Skizze plus Laser plus Diagonalen (Leica DISTO Plan, Bosch, magicplan mit Laser). Die Diagonale als Rechtwinkligkeits- und Konsistenzprüfung ist Handwerkspraxis [A, Forenbeitrag]; eine belastbare Norm-Zahl für zulässige Rechtwinkligkeit im Fliesenlegen fand ich nicht (DIN 18352 nicht eingesehen) [Vermutung: Fugenanpassung gleicht ± 1–2 cm aus].

**Auf unserem Stack:**
- Alles ist Offline-Auswertung in Node (`node:test`, plain JS, kein Build), also unabhängig von Chrome/WebXR; läuft in Millisekunden pro Raum.
- **Empfohlene Metrik-Hierarchie (zwei Ebenen):**
  1. *Registrierungsfrei (Hauptmaß):* Eckenzahl und zyklische Editierdistanz der Kantenfolge; Wandlängen zyklisch in beiden Richtungen zugeordnet (MAE, p90); Fläche in %; Diagonalen; Raumhöhe. Diese Maße lassen sich weder durch Spiegelung noch durch die 4 Drehungen täuschen. Aufwand: 1 Tag (zyklische Zuordnung, beide Orientierungen, Minimum nehmen).
  2. *Verankert (Nebenmaß):* IoU, Wanddistanz Median/p90, Eck-Precision/Recall mit Schwellen in cm, fein (≤ 10 cm) und grob (≤ 50 cm bis 1 m). Ausrichtung nur als eigentliche starre 2D-Bewegung (Kabsch/Umeyama, Determinante +1, Spiegelung ausgeschlossen). Eine Spiegelung taucht dann als Handedness-Fehler auf (z. B. ARCore rechtshändig gegen Bildschirm-y-nach-unten im Raumaufmaß-Export) statt als gültige Lösung. Zusätzlich das Verhältnis Zweitbeste/Beste über die 4 Drehungen berichten; liegt es unter einer Schwelle (Vorschlag 1,15, [Vermutung], aus A6–A8 mit 1,00–1,11), gilt der Raum als „nicht entscheidbar“ und braucht einen asymmetrischen Anker (z. B. Türzarge am Raumaufmaß-Export). Aufwand: 1–2 Tage; Umeyama in 2D sind etwa 30 Zeilen JS, evo nicht bündeln (GPL, Python), höchstens offline zum Gegenrechnen.
- **Mehrdeutigkeit lösen:** Magnetometer: Chrome Android bietet `deviceorientationabsolute` und `AbsoluteOrientationSensor` (HTTPS, Berechtigungen accelerometer, gyroscope, magnetometer) [A, MDN-Seiten geöffnet, Kompatibilitätstabelle nicht mitgeladen; Chrome-Android-Unterstützung: eigenes Wissen, [Vermutung]]. Indoor-Genauigkeit: 12,45° mittlerer Fehler einzelner Smartphones im Flur, 8,99° nach Mittelung über drei Geräte, Pedestrian-Dead-Reckoning, 2013 [V, Abstract/Einleitung des IPIN-2013-Papers]; ein 2024er Wert von 17,4° RMSE in magnetisch gestörter Umgebung [A, Suchergebnis]. Ein Kompass mit ~10–20° Fehler löst die 4-fache Drehmehrdeutigkeit (90° Abstand, Entscheidungsgrenze 45°) in vielen Räumen, aber nie die Spiegelung. Er braucht zudem eine neue Berechtigung und neue Fehlerquellen (Stahlbeton, Heizkörper); Pixel 9 Pro: eigene Messung nötig. Aufwand: 1 Tag (Aufzeichnung mitlaufen lassen, `?imu=1` zeichnet schon Sensorwerte), Auswertung 0,5 Tag.
- **Annahmeregel für die Skizze statt DIN:** Aus dem eigenen Kameradokument (Abschnitt 4): Jede Lasermessung muss genau einer Wand zuordenbar sein. Quantifiziert: Wandlängenfehler kleiner als die Hälfte des Abstands zur nächstähnlichen Wandlänge; Topologie (Eckenzahl) richtig; Höhe auf ±5 cm. Dies, nicht die DIN-Toleranz, ist das Abnahmekriterium der Skizze.

**Empfehlung:** **Machen**, in dieser Reihenfolge: (1) registrierungsfreie Metriken als Hauptmaß einführen und alle bisherigen Aufnahmen darauf neu bewerten (1 Tag); (2) Ausrichtung ohne Spiegelung plus Mehrdeutigkeits-Verhältnis als Nebenmaß (1–2 Tage); (3) Mindest-Messprotokoll (unten) an 5–8 Räumen; (4) Kompass nur *mitschreiben*, nicht verwenden, bis die Messung vorliegt. Die eine entscheidende Messung: **In 5 laser-gemessenen Räumen müssen registrierungsfreie und verankerte Maße die Stände (z. B. 24, 25, 26) in derselben Reihenfolge ordnen.** Tun sie das nicht, ist das verankerte Maß (und damit alle bisherigen IoU-Zahlen der Wohnküche) nicht belastbar.

**Quellen:**
1. Goyal, Khan, Chattopadhyay, Bhatnagar 2021, GRIHA: https://arxiv.org/abs/2103.08297 (lokal: paper/2103.08297_GRIHA_smartphone_floorplan_vs_magicplan.pdf) [V Abschnitt 6.4]
2. Lin, Li, Wang 2019, Floorplan-Jigsaw: https://arxiv.org/abs/1812.06677 (lokal) [V Evaluation, Ambiguity]
3. Sarlin et al. 2022, LaMAR: https://arxiv.org/abs/2210.10770 (lokal) [V Abschnitt 4.4, Evaluation]
4. Sturm, Burgard, Cremers 2012, Evaluating Egomotion and SfM Approaches Using the TUM RGB-D Benchmark: https://cvg.cit.tum.de/_media/spezial/bib/sturm12iros_ws.pdf [V Abschnitt V]
5. TUM RGB-D Werkzeuge (evaluate_ate.py/evaluate_rpe.py): https://cvg.cit.tum.de/data/datasets/rgbd-dataset/tools [A]
6. evo: https://github.com/MichaelGrupp/evo [A]
7. Rosen, Carlone, Bandeira, Leonard 2019, SE-Sync: https://arxiv.org/abs/1612.07386 (lokal) [V Zusammenfassung]
8. ISPRS Indoor Modelling Benchmark, Ergebnisse: https://www.isprs.org/resources/datasets/benchmarks/IndoorModeling/results.aspx [A, Seite gelesen]
9. FRI-Net, Xu et al. 2024: https://arxiv.org/abs/2407.10687 [V nur Abschnitt 4.1]
10. Cruz et al. 2021, Zillow Indoor Dataset: https://openaccess.thecvf.com/content/CVPR2021/html/Cruz_Zillow_Indoor_Dataset_Annotated_Floor_Plans_With_360deg_Panoramas_and_CVPR_2021_paper.html [A, PDF 403]
11. Dehghan et al. 2021, ARKitScenes: https://arxiv.org/abs/2111.08897 [A]
12. Apple, 3D Parametric Room Representation with RoomPlan: https://machinelearning.apple.com/research/roomplan [V]
13. Treccani, Adami, Fregonese 2024, LiDAR-based apps on Apple devices: https://isprs-archives.copernicus.org/articles/XLVIII-2-W8-2024/431/2024/ [A, Abstract]
14. magicplan, Pen vs Laser vs LiDAR: https://magicplan.app/blog/pen-vs-laser-vs-lidar-floor-plan-comparison [A, ohne Zahlen]
15. Stahlbau Arbeitshilfe 10.1 Allgemeine Hochbautoleranzen (DIN 18202 Tab. 1–4): https://bauforumstahl.de/wp-content/uploads/2024/10/2020-06-26_SA_10.1_Allgemeine_Hochbautoleranzen.pdf [V Tabellen]
16. Abadi et al. 2013, Improving Heading Accuracy in Smartphone-based PDR (IPIN): https://cgi.cse.unsw.edu.au/~mahbub/PDF_Publications/IPIN2013_heading.pdf [V Abstract/Einleitung]
17. MDN AbsoluteOrientationSensor: https://developer.mozilla.org/en-US/docs/Web/API/AbsoluteOrientationSensor [A]
18. MDN deviceorientationabsolute: https://developer.mozilla.org/en-US/docs/Web/API/Window/deviceorientationabsolute_event [A]
19. Interne Dokumente: docs/superpowers/research/2026-10-27-nachtbericht.md, 2026-10-29-weltrahmen-messungen.md, 2026-10-24-kamera-raumerfassung-android.md (Kap. 10–12)

---

## P16 – Prüfwerkzeuge selbst fehlerhaft

**Problem:** Drei belegte Fälle, in denen das Messgerät falsch lag: (1) Der Simulator drehte das Lagerauschen je Bild um den Weltursprung statt um die Kamera, das erzeugte eine Verzerrung von ±5–10 cm, die mit dem Abstand zum Ursprung wuchs und fast zu einer falschen Entscheidung (Umschaltung nach Basislinie) geführt hätte; erst ein zweites, unabhängiges Modell (Kamera auf dem Armkreis) hat das aufgedeckt. (2) Der Prüfstand ließ A über eine Bindung an einen Kettenabschnitt hängen, dadurch sah Z13 schädlich aus und wurde abgeschaltet (Stand 10), obwohl auf sauberen Fenstern 3 von 8 angenommen wurden; die Abschaltung wurde in Stand 11 zurückgenommen. (3) Das Orakel (Lage je Abschnitt aus der Wahrheit) war in 17 von 19 Abschnitten mehrdeutig, die „2,3 / 5,8 cm“ waren Selbstpassungen. Zusätzlich: `bruchSimulieren` setzt `video:null`, daher kann der Prüfstand Bildkanten nicht prüfen.

**Aktueller Ansatz (Stand 26):** Gegenprüfung von Befunden durch einen zweiten Agenten (z. B. 106 Aussagen), zwei unabhängige Modelle bei kritischen Fragen, Prüfstand mit simuliertem Bruch (Wahrheit = Eigen-Aufnahme). Das fängt Fehler erst, nachdem eine falsche Entscheidung nahe liegt; es gibt keine automatischen Prüfungen, die das Messgerät selbst prüfen.

**Wissenschaft:**
- **Metamorphes Testen löst das Orakelproblem ohne Wahrheit.** Man prüft Beziehungen zwischen Ausgaben statt Sollwerte. MetPose/MET-POSE (Duran et al., ICST 2025, getestet an MediaPipe Holistic mit FLIC und PHOENIX) wendet das auf Posenschätzung an, mit Transformationen wie Spiegelung, Drehung, Helligkeit; Verstöße gegen die erwartete Beziehung gelten als Fehler, ohne Handlabels [V, Zusammenfassung, Abschnitt zu Relationen; Datenbasis dort sind Bilder von Personen, nicht unser Fall]. OdoTest (FSE 2026) tut es für visuell-inertiale Odometrie mit Sensorstörungen (IMU, Kamera, Kalibrierung) und odometriespezifischen Relationen auf zwölf VIO-Systemen (laut Katalogeintrag, DOI 10.1145/3808128; Konferenzseite spricht allgemein von Odometriemodellen) [A, nur Abstract, nicht gelesen]. Grenze: Die Übertragbarkeit auf einen Grundriss-Schätzer ist nicht belegt; die Relationen müssen wir selbst festlegen.
- **Maß- und Protokollfehler sind klassisch.** Sturm et al. betonen, dass die Wahl der Metrik das Ergebnis dreht: ein „Start gegen Ende“-Vergleich (Δ = n) sei irreführend, weil er frühe Drehfehler überbewertet [V]. Das trifft unsere Rückkehr-Erkennung (Vergleich Anfang/Ende der Runde) unmittelbar.
- **Wahrheit mit Unsicherheit ausweisen.** LaMAR schätzt die Unsicherheit jeder Wahrheitspose aus der Hessematrix und verwirft zu unsichere (σ > 3,33 cm) [V]; ADVIO (Cortés et al. 2018) erzeugt die Wahrheit aus Inertialdaten plus von Hand auf einem Gebäudeplan markierten Fixpunkten mit angenommenem Rauschen σ = 25 cm je Fixpunkt und gibt die Genauigkeit der Wahrheit selbst an [V, Abschnitt zur Wahrheit]. Prinzip: Die Wahrheit hat eine Fehlerangabe, sonst ist ein Vergleich im cm-Bereich sinnlos.
- **Robuste Verbindungsprüfung als Eigenschaft.** Inkrementelle Konsensprüfung (IPC), PCM (Mangelson 2018), TACO sind Beispiele, wie Schleifenschlüsse nur angenommen werden, wenn alles Bisherige konsistent bleibt (laut den internen Messungen vom 29.10 [Quellen lokal]). Als Regressionsprinzip wichtig: Jede Änderung muss zeigen, dass bereits angenommene Messungen danach weiter bestehen.
- **Property-based Testing** (QuickCheck-Familie; für JS „fast-check“): Eigenschaften werden mit zufällig erzeugten Eingaben geprüft, Fehlschläge werden auf eine kleine Gegenprobe verkleinert (Shrinking) und mit Seed reproduzierbar gemacht [A, Suchergebnis zu Spiegelseiten, offizielle Doku nicht geöffnet]. Lizenz von fast-check nicht geprüft [Vermutung: MIT].

**Best Practice (Industrie/Open Source):**
- SLAM-Benchmarks (TUM RGB-D, EuRoC, LaMAR) trennen Rohdaten, Wahrheit und Auswertungsskripte, versionieren die Skripte und veröffentlichen Referenzergebnisse; Sturm et al. veröffentlichten die Ergebnisse der Referenzsysteme gleich mit [V]. Übertragbar: Jede Aufnahme bekommt einen eingefrorenen Referenzlauf (Golden Master) je Stand.
- ORB-SLAM3/Atlas und Kimera-Multi prüfen Zusammenführungen mehrfach, bevor sie annehmen (laut internem Bericht [Quellen lokal]); Prüfsoftware dafür ist dort nicht von der Schätzung getrennt, also keine Vorlage für den Prüfstand.
- Klassische Disziplin aus dem Test: Nulltest und bekannte Verschiebung (siehe unten), Leckprüfung (Information darf nicht am Schnitt vorbeifließen), zwei unabhängige Modelle, die Erwartungswerte unabhängig voneinander herleiten.

**Auf unserem Stack:** Alles läuft in Node mit `node:test`, reines JS, kein Build, keine Server; Laufzeit pro Prüfung Sekunden. Konkret, in dieser Reihenfolge nach Nutzen je Aufwand:
1. **Nulltest (0,5 Tag):** Ein Schnitt mit Lücke 0 und unverändertem Rahmen muss das Ergebnis ohne Schnitt Bit für Bit reproduzieren. Zusätzlich eine bekannte eingespritzte Verschiebung (z. B. 30 cm / 10°): Der Prüfstand muss genau diese melden. Das ist die eine Prüfung, die einen verzerrten Prüfstand sofort entlarvt (Fall 1 und 2).
2. **Leckprüfung (0,5–1 Tag):** Im Prüfstandsgraphen darf das Fenster nach dem Schnitt das Fenster davor über keinen anderen Abschnitt erreichen (Fall 2: Bindung an einen Kettenabschnitt). Als Test: Graph aufbauen, Erreichbarkeit prüfen, sonst Abbruch mit Fehler statt Zahl.
3. **Metamorphe Relationen (1–2 Tage):** (a) starre Bewegung der ganzen Aufnahme (Drehen, Verschieben) verändert die Ausgabe um dieselbe Bewegung; (b) Spiegelung der Eingabe spiegelt die Ausgabe (fängt Handedness-Fehler); (c) zyklische Verschiebung des Startpunkts ergibt dasselbe Polygon; (d) Zeitliche Ausdünnung 10 → 5 Hz behält die Topologie; (e) Skalieren der Raumhöhe skaliert die Skizze genau mit (P7 hängt davon ab). Erwartung: Es gibt Relationen, die nach Konstruktion gelten, und solche, die nur „im Mittel“ gelten (d); letztere mit Toleranz und mehreren Aufnahmen prüfen, nicht als harte Aussage.
4. **Zwei unabhängige Modelle als feste Regel (0 Tage, Disziplin):** Jede Entscheidung, die eine Funktion abschaltet oder umschaltet, braucht eine zweite, anders aufgebaute Messung (Fall 1: Armkreis-Modell fand den Fehler).
5. **Golden-Master je Stand (1 Tag):** Ergebnisse (Zahl der Wände, Ecken, Editierdistanz, Prüfstandtreffer) pro Aufnahme in einer Datei einfrieren; jede Änderung zeigt die Differenz. Verhindert unbemerkte Rückschritte wie bei Z13.
6. **Property-based (1–2 Tage, optional):** Zufällige Rechtecke und L-Formen mit Rauschen erzeugen und Eigenschaften prüfen (Fläche gegen Wahrheit innerhalb Toleranz, Eckenzahl). Der Raumsimulator existiert bereits (`--pipe=app`); fast-check selbst ist nicht nötig, ein eigener Seed-Generator genügt (kein Build-Schritt, keine Abhängigkeit). Lizenz-/Größenprüfung entfällt dann.
- **Nicht bündeln:** evo (GPL-3.0, Python); nur offline zum Gegenrechnen.
- Bild-Pipeline: Der Prüfstand muss das Video behalten (`bruchSimulieren` setzt `video:null`), sonst bleibt P5 ungeprüft (laut internem Bericht 2–3 Wochen für die Bildkante als Faktor).

**Empfehlung:** **Machen**, Schritt 1 und 2 sofort (zusammen 1–1,5 Tage), vor jeder weiteren Entscheidung, die auf dem Prüfstand beruht. Dann Schritt 3 und 5. Property-based erst, wenn eine konkrete wiederkehrende Fehlerklasse auftritt. Die entscheidende Messung: **Läuft der Nulltest (Schnitt ohne Lücke, gleicher Rahmen) auf allen 6–10 Aufnahmen mit Differenz 0, und meldet der Prüfstand eine eingespritzte Verschiebung von 30 cm / 10° auf ±1 cm / ±0,5°?** Falls nein: alle Prüfstandzahlen seit Stand 10 (Z13, Gyro-Brücke 14,6° → 0,8°) gelten als ungeprüft, bis es stimmt. Hinweis: Die Gyro-Brücke wurde auf dem echten Gyro der Aufnahme vom 31.10. bestätigt (Gier Median 14,6° → 0,8°, laut internem Bericht), die Aussage ist also vermutlich robust, aber ungeprüft gegenüber dem Nulltest.

**Quellen:**
1. Duran, Laurent, Rushe, Ventresque 2025, Metamorphic Testing for Pose Estimation Systems (MET-POSE): https://arxiv.org/abs/2502.09460 (lokal abgelegt: paper/2502.09460_MetPose_metamorphic_testing_pose_estimation.pdf) [V Zusammenfassung, Relationen]
2. Zhou, Cheng et al. 2026, OdoTest (FSE 2026): https://conf.researchr.org/details/fse-2026/fse-2026-research-papers/51/OdoTest-An-Automated-Testing-Approach-for-Odometry-Systems [A]
3. Sturm, Burgard, Cremers 2012: https://cvg.cit.tum.de/_media/spezial/bib/sturm12iros_ws.pdf [V]
4. Sarlin et al. 2022, LaMAR: https://arxiv.org/abs/2210.10770 (lokal) [V]
5. Cortés, Solin, Rahtu, Kannala 2018, ADVIO: https://arxiv.org/abs/1807.09828 (lokal) [V Wahrheit-Abschnitt]
6. Mangelson et al. 2018, PCM: lokal paper/mangelson2018_PCM_pairwise_consistency_map_merging_ICRA.pdf (nicht neu gelesen)
7. fast-check Dokumentation: https://fast-check.dev/docs/ [A, nur über Spiegelseiten gesehen, nicht geöffnet]
8. evo: https://github.com/MichaelGrupp/evo [A]
9. Interne Berichte (siehe P3 Quelle 19)

---

## Mindest-Messprotokoll (für Raum-Wahrheit zu vertretbaren Kosten)

Lasermessgerät, z. B. Bosch GLM 50-22 oder ähnlich: Herstellerangabe ±1,5 mm [A, Händlerseiten, keine Bosch-Datenblätter geöffnet]. Das ist 10–100-fach besser als alles, was wir prüfen; mehr Genauigkeit lohnt nicht.

Je Raum, etwa 10–15 Minuten:
1. **Jede Wandlänge** (Lasermessung in Bodenhöhe oder Brusthöhe, immer gleiche Höhe notieren).
2. **Diagonalen:** n − 3 Diagonalen, damit das Polygon starr ist (Rechteck: 2 als Kreuzprobe; L-Form mit 6 Ecken: 3). Sockelleisten und Heizkörper umgehen.
3. **Raumhöhe an 2 Stellen** (Laser Boden–Decke), plus Höhe der Wand-Decke-Kante zum Fadenkreuz (P7, P12).
4. **Ein Anker:** Welche Wand ist die Startwand, Abstand Türzarge zur nächsten Ecke (bricht die Spiegelung und die 4-fache Drehmehrdeutigkeit).
5. **Foto der Startwand** und Raumskizze von Hand (Wandnummern).
6. **Polygon lösen** mit dem vorhandenen Raumaufmaß-Löser und den Export neben die Aufnahme legen (Pfad ist im Kameradokument Kapitel 10 schon vorgesehen). Die Restwidersprüche des Lösers (Diagonalen gegen Wandlängen) sind das Fehlerbudget der Wahrheit selbst; kleiner als etwa 1 cm erwarten, größer heißt falsch gemessen.

Auswahl: 5–8 Räume, darunter mindestens ein fast quadratischer (testet die Mehrdeutigkeit), ein L-förmiger oder mit Nische, einer mit Schrank bis zur Decke (P6), einer mit Fenster-Gegenlicht. Diese Mischung deckt die bekannten Fehlerklassen ab. Aufwand: 1–1,5 Tage für alle Räume plus die Aufnahmen selbst.

Nicht empfohlen: Polycam/RoomPlan-Referenzscan. Braucht ein iPhone/iPad mit LiDAR (das Pixel hat kein LiDAR; nur mit Leihgerät) und ist mit Fehlern von etwa 1–10 cm (siehe P3) selbst schlechter als der Laser.

**Entscheidende Messung für das Protokoll:** Misst man in 5 Räumen, ob das registrierungsfreie und das verankerte Maß die Stände gleich ordnen (siehe P3). Außerdem die Wiederholbarkeit: Dieselbe Aufnahme zweimal auswerten (andere Reihenfolge der Verarbeitung) sollte dieselbe Zahl geben (Nulltest, P16).

---

**Offene Fragen:** (1) Reale Indoor-Kompassabweichung auf dem Pixel 9 Pro und ob Chrome 156 `AbsoluteOrientationSensor` ohne Flag liefert, nicht gemessen. (2) Unabhängige Zentimeterzahlen für magicplan und RoomPlan, nicht gefunden (nur Herstellerangaben und Blogs). (3) ZInD-Auswertungsprotokoll im Volltext (CVPR-PDF gab 403). (4) Structured3D-Schwellen (10 Pixel, 5°) nur über Suchergebnis, nicht im Paper gelesen. (5) OdoTest und fast-check nur über Suchergebnisse. (6) DIN 18352 (Fliesenarbeiten) und DIN 18202 im Originaltext nicht eingesehen; Zahlen stammen aus einer Stahlbau-Arbeitshilfe, die die Norm wiedergibt. (7) Ob eine Rechtwinkligkeitstoleranz für Fliesenleger normativ festgelegt ist. (8) Ob Mehrdeutigkeitsschwelle 1,15 angemessen ist (nur aus drei Aufnahmen A6–A8 abgeleitet).

Prüfstand: 19 Quellen geprüft, 3 korrigiert, 0 entfernt.


---

<!-- 13-browser-performance.md -->

# Recherche 13: Browser-Rechenzeit und Aufnahmedaten (P15, P17)

Stand: 31.10.2026, Seite Stand 26. Markierung: [V] = Volltext gelesen (lokales PDF, Identität auf Seite 1 geprüft), [A] = Abstract, Sekundärquelle oder Dokumentationsseite, [Vermutung] = nicht belegt, von mir hochgerechnet. Eigene Messwerte stammen aus `2026-10-24-kamera-raumerfassung-android.md` (Kap. 10 bis 12), die Tar-Aufnahme habe ich selbst aufgelistet.

Vorab die wichtigste Lage zu P17: Der Pixel liefert maximal 861×1920 (1,65 MP). Unser Finder rechnet heute auf 287×640 (0,18 MP), also auf einem Neuntel der Pixel. Alles, was linear mit der Pixelzahl wächst, wird bei 1920 etwa 9-fach teurer. Das ist die ganze Erklärung für „zu langsam“. Der günstigste Weg ist deshalb, nicht das ganze Bild in voller Auflösung zu rechnen, sondern (a) die Verkleinerung und Luma-Umrechnung auf die GPU zu legen und (b) volle Auflösung nur dort zu lesen, wo sie gebraucht wird (Fenster um das Fadenkreuz oder längs gefundener Segmente).

---

## P17 – Rechenzeit im Browser (1920 px, Kanten des ganzen Bilds)

**Problem:** Chrome liefert im Hochformat 861×1920, bei Querformat 1920×861. Auf dem Pixel messen wir bei 640 (287×640): Verkleinern 4,3 ms (Median, p90 6,3 ms), Kante am Fadenkreuz 13,8 ms (p90 19,3), Senkrechte 10,1 ms (p90 14,8), Stufe 2 1,5 ms, Schätzer im Worker 34 ms (p90 69). Der Finder läuft auf dem Pixel 2,8-fach langsamer als am Mac. Ausgewertet wird jedes 3. XR-Bild synchron in `onFrame`, die 90-%-Werte summieren sich auf etwa 40 ms bei einem Budget von 33 ms. Bei 1920 hat niemand auf dem Pixel gemessen. Kanten des ganzen Bilds in der Karte kosten 20 bis 40-fach Rechenzeit.

**Aktueller Ansatz (Stand 26):** Alles in JS. Das Bild geht per `readPixels` aus der Kamera-Textur, wird verkleinert (Kastenmittel, 861×1920 nach 287×640) und läuft in Haupt-Thread (Finder, Senkrechte) bzw. Worker (ELSED, Schätzer, Karte). ELSED ist ein bitgleicher JS-Port: 2,4 bis 3,0 ms am Mac bei 287×640, 14,5 ms bei hochskalierten 861×1920; am Pixel nicht gemessen. Es reicht nicht, weil die Auswertung im Haupt-Thread im p90 an die Bildzeit stößt, die Vollauflösung ungemessen ist und der Weg „ganzes Bild als Kanten in die Karte“ 20 bis 40-fach kostet, ohne Grundriss zu liefern.

**Wissenschaft:**
1. Jangda, Powers, Berger, Guha 2019, „Not So Fast: Analyzing the Performance of WebAssembly vs. Native Code“, arXiv 1901.09056 [V]. SPEC CPU: WebAssembly läuft im Mittel 1,55-fach (Chrome) bzw. 1,45-fach (Firefox) langsamer als nativ, Spitze 2,5-fach, aber im Mittel 1,3-fach schneller als JavaScript. Ursachen: mehr Befehle, höherer Registerdruck, mehr Sprünge in Chromes JIT. Grenze: Desktop, x86, SPEC (große skalare Programme); für ARM-Telefone und kleine Bildkerne nicht direkt übertragbar. Für uns: Von WASM statt JS ist grob 1,3-fach zu erwarten, nicht 5-fach. Quelle 1.
2. Göttl, Gagel, Grubert 2018, „Efficient Pose Tracking from Natural Features in Standard Web Browsers“, arXiv 1804.08424 [V]. Natürliche Merkmale im Browser mit WebAssembly: Tracking bis 25 Hz auf Smartphone (Galaxy S8, Chrome 64, Kamera 320×240), 60 Hz auf Tablet. Zwei Befunde, die zu uns passen: WASM gegenüber nativem C++ auf dem Surface-Pro-Tablet +75 % (Tracking, Chrome) bzw. +100 % (Detektion, Chrome); und Kamerazugriff über Chrome (getUserMedia) kostete rund 1 ms, in Firefox bis 26 ms auf dem Smartphone. Grenze: sehr kleines Bild (320×240), 2018, kein WebXR-Kamerazugriff. Quelle 2.
3. Suárez, Buenaposada, Baumela 2021/22, „ELSED: Enhanced Line SEgment Drawing“, arXiv 2108.03144 [V, Tabelle 4 gelesen]. Mittlere Zeit je Bild bei 640×480 (C++): Intel i7 5,4 ms, Snapdragon 855 10,2 ms, Exynos (Galaxy J5) 60 ms; zum Vergleich LSD 36,5 / 58,7 / 391 ms, EDLines 7,6 / 13,8 / 65,8 ms. Das Paper schreibt im Text, ELSED sei etwa 2-fach schneller als EDLines/AG3line und 6-fach schneller als LSD; die Tabelle selbst zeigt gegenüber EDLines nur 1,4-fach (i7), 1,35-fach (Snapdragon) und 1,1-fach (Exynos), gegenüber LSD 6,8 / 5,8 / 6,5-fach. kostet dabei in etwa linear mit der Pixelzahl [Vermutung, da O(N), das Paper nennt LSD und EDLines O(N)]. Grenze: nur Geometrie, keine Semantik; Genauigkeit unter Lernverfahren. Quelle 3.
4. Wang, Jiang, Chen, Cao, Li, Li, Ma, Cao, Liu 2024, „Anatomizing Deep Learning Inference in Web Browsers“, arXiv 2402.05981 [A, nur Abstract]. Auf 20 Mobilgeräten läuft Inferenz im Browser im Mittel 15,8-fach (CPU) bzw. 7,8-fach (GPU) langsamer als nativ. Folge für uns: Ein neuronales Kantennetz im Browser ist auf dem Telefon die schlechtere Wette gegenüber klassischer Geometrie. Quelle 4.
5. Hochrechnung aus 2 und 3 und unseren Zahlen [Vermutung]: ELSED bei 861×1920 am Pixel in JS etwa 14,5 ms × 2,8 = 40 ms je Bild, im Worker also vertretbar bei jedem 3. Bild (100 ms Takt), im Haupt-Thread nicht.

**Best Practice (Industrie/Open Source):**
- Bildverarbeitung in WebXR läuft produktiv auf WebGL2/GLSL: Das Kamerabild ist eine WebGL-Textur (`XRWebGLBinding.getCameraImage`), man rendert in ein kleines Framebuffer-Objekt (Verkleinern, Luma, ggf. Gradient) und liest nur das Ergebnis. Wir haben bestätigt: `XRGPUBinding` hat hinter dem Flag kein `getCameraImage` (Kap. 3 unserer Recherche). Babylon.js nennt Raw Camera Access in WebGPU-XR als nicht unterstützt (Quelle 5, [A]). Die globale vgpu-Vorgabe passt hier nicht, siehe Empfehlung.
- Asynchrones Auslesen: `readPixels` in einen `PIXEL_PACK_BUFFER`, `fenceSync`, `flush`, nicht blockierend mit `clientWaitSync(…, 0, 0)` abfragen, erst dann `getBufferSubData`. Das empfiehlt der Babylon.js-Forumsfaden (Quelle 6, [A]); dort heißt es, Babylons eigener WebGL-Pfad sei faktisch noch synchron, und `clientWaitSync` lieferte in Firefox `WAIT_FAILED`, also browserübergreifend testen. Ein Standard in Mol* u. a. ist nicht belegt [Vermutung]; der Faden nennt keine Zahlen. Einzige gefundene Zahl: in einem WebKit-Bericht war direktes `readPixels` etwa 3-fach langsamer als der Pufferweg (Safari 15.2, eine Einzelmessung, nicht Android). Quelle 7.
- WASM im Browser: SIMD (128 Bit) ist seit Chrome 91 standardmäßig an (Quelle 8, [A]); v8.dev sagt nichts zu Android, der Register-Artikel wurde nicht geöffnet [Android-Status offen, per `WebAssembly.validate` am Pixel prüfbar]. Mehrere Threads brauchen SharedArrayBuffer, in Chrome auf Android seit 88 nur mit Cross-Origin-Isolation (COOP `same-origin` + COEP `require-corp`, Quelle 9, [A]).
- Ohne Header setzbar: Das Service-Worker-Skript `coi-serviceworker` (MIT) fügt die Header ein; Bedingungen: HTTPS, eigene Datei vom eigenen Ursprung, Neuladen beim ersten Besuch (Quelle 10, [A]). ONNX Runtime Web fällt ohne Isolation auf einen Thread zurück (Quelle 11, [A]).
- Eine Studie im Mobilgeräte-Umfeld zeigt Drosselung: Tensor G4 (Pixel 9 Pro XL, gleiche SoC-Familie) fiel in einem Stresstest bei 100 % CPU-Last nach etwa 3 Minuten ins Drosseln, schlimmstenfalls auf etwa 43 % der Spitze (Maximum nach etwa 4 Minuten), danach Dauerwert etwa 65 % (Notebookcheck, Quelle 12, [A]); es ist eine einzelne Nutzermessung per X-Post mit Drossel-App, anekdotisch, und volle Dauerlast, nicht unser Lastprofil.

**Auf unserem Stack:**
- *Warum 1920 langsam ist:* 9-fache Pixelzahl. Dazu `readPixels` von 861×1920×4 B = 6,6 MB RGBA je Bild (gegen 0,73 MB bei 287×640), Speicherbandbreite, Garbage-Collection bei neuen Arrays, und der synchrone Block in `onFrame`. Welcher Teil der 4,3 ms „Verkleinern“ GPU-Kopie und welcher Kastenmittel in JS ist, ist aus den Protokollen nicht zu trennen [Vermutung, zu messen].
- *Günstigster Weg dahin* [Vermutung, nicht gemessen, jeweils einzeln prüfbar]:
  1. Verkleinern und Luma in einem Fragment-Shader (GLSL, WebGL2) erledigen. Ausgabe 287×640 als Rot-Kanal; vier Luma-Pixel in einen RGBA-Texel gepackt senkt die Lesemenge auf ein Viertel. Aufwand 1 bis 2 Tage.
  2. Lesen über `PIXEL_PACK_BUFFER` + `fenceSync` mit ein bis zwei Bildern Verzögerung. Die Pose des Bildes wird mit dem Bild gespeichert (haben wir: Zustand je Bild), sodass die Verzögerung nichts kostet. Aufwand 1 Tag, Risiko niedrig (WebGL2-Standard).
  3. Volle Auflösung nur als Fenster: ein zweiter Shader-Durchlauf mit 256×256 bis 512×512 um das Fadenkreuz (oder ein Streifen längs des vorhergesagten Segments), `readPixels` darauf. Das ergibt dreifache Winkelauflösung genau dort, wo die Kante liegt, für etwa 0,26 MP statt 1,65 MP.
  4. ELSED/Finder in den Worker; Haupt-Thread nur Zeichnen und Fadenkreuz.
  5. WASM nur für ELSED, wenn der Worker bei 1920 nicht reicht. Zu erwarten: etwa 1,3-fach gegenüber JS (Quelle 1), mit SIMD für Gradienten vielleicht 1,5- bis 2-fach auf dem Gradiententeil; der Segmentlauf ist verzweigt und profitiert kaum [Vermutung]. Aufwand 3 bis 5 Tage inklusive Bitgleichheit gegen den C++-Stand (haben wir mit `-ffp-contract=off` für JS gelöst), Lizenz Apache-2.0 (Hinweis steht im Kopf von `raumskizze-elsed.js`).
- *Was nicht geht:* WebGPU-Compute in der XR-Sitzung (kein Kamerabild, Quelle 5 und eigene Recherche). WebGPU außerhalb der Sitzung ist keine Alternative, weil das Kamerabild nur in der Sitzung existiert; es per `readPixels` und `copyExternalImageToTexture` in WebGPU zu holen kostet genau den Auslesezeit, den man sparen will. Threads in WASM ohne Header: nur über `coi-serviceworker` oder durch echte Header; ob der Hetzner-Webspace per `.htaccess` Header setzen lässt, ist nicht geprüft [Vermutung: bei Apache-Webspace meist ja]. Achtung: Isolation (COEP `require-corp`) kann Ressourcen von Fremdursprüngen und die XR-Sitzung selbst beeinflussen; ein WebXR-Test mit gesetzten Headern fehlt [offen]. Ein Service Worker zusätzlich zur XR-Sitzung ist ein weiterer Neuladen-Schritt beim ersten Start; riskant für den Ablauf auf der Baustelle.
- *Thermik:* Eine Aufnahme dauert 3 Minuten, die gemessene Drosselung beginnt bei Volllast nach etwa 3 Minuten und ist um Minute 4 am stärksten (Quelle 12); eine 3-Minuten-Aufnahme liegt also genau am Einsatzpunkt, bei Wiederholungen hintereinander ist Drosselung wahrscheinlicher. Messen: Bildzeit `snap`/`senk` in Minute 1 gegen Minute 8 bei gleichem Raum. Ohne Videoaufnahme und mit Kamera + ARCore läuft der Pixel ohnehin warm [Vermutung].
- *Budget:* 100 ms Takt (jedes 3. Bild) bei 30 Bilder/s. Haupt-Thread höchstens 10 ms je Auswertungsbild anstreben (heute Median 25 ms, p90 40 ms). Worker mit ELSED 40 ms ist bei 100 ms Takt tragbar.

**Empfehlung:** *Messen, dann in dieser Reihenfolge bauen.* (1) Messung, die entscheidet: eine Sitzung `?ds=1920` mit Zeitstempeln um genau drei Stellen (`readPixels` allein, Kastenmittel allein, ELSED im Worker bei 861×1920), 3 Minuten, Wiederholung bei Minute 8. Bisher fehlt das (Punkt 1 aus 10.12 der Recherche ist offen). (2) Wenn `readPixels` mehr als 8 ms kostet: GPU-Verkleinerung mit gepacktem Luma + asynchrone Pufferlesung. (3) Volle Auflösung nur als Fenster am Fadenkreuz. (4) WASM-Port von ELSED erst, wenn der Worker bei 1920 über 60 ms liegt. Ganzbild-Kanten in der Karte nicht weiter verfolgen: Qualität fehlt (kein Grundriss in 6 Aufnahmen), also lohnt keine Rechenzeit-Optimierung dafür.

**Quellen:**
1. https://arxiv.org/abs/1901.09056 (PDF lokal: paper/1901.09056_wasm_vs_native_not_so_fast.pdf)
2. https://arxiv.org/abs/1804.08424 (PDF lokal: paper/1804.08424_wasm_natural_feature_tracking_browser.pdf)
3. https://arxiv.org/abs/2108.03144 (PDF lokal: paper/2108.03144_ELSED_enhanced_line_segment_drawing.pdf)
4. https://arxiv.org/abs/2402.05981
5. https://doc.babylonjs.com/setup/support/webGPU/webGPUStatus ; https://immersive-web.github.io/webxr-webgpu-binding/
6. https://forum.babylonjs.com/t/speeding-up-readpixels/12739
7. https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/getBufferSubData (und die über die Suche gefundene WebKit-Bugzilla-Meldung zum 3-fach-Faktor, selbst nicht geöffnet)
8. https://v8.dev/features/simd ; https://www.theregister.com/2021/05/26/chrome_91_release/
9. https://web.dev/articles/cross-origin-isolation-guide ; https://developer.chrome.com/blog/enabling-shared-array-buffer
10. https://github.com/gzuidhof/coi-serviceworker
11. https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html
12. https://www.notebookcheck.net/Google-Pixel-9-Pro-XL-testing-reveals-50-Tensor-G4-performance-loss-from-throttling.876871.0.html (nur in Suchergebnissen gesehen, nicht geöffnet)

---

## P15 – Große Aufnahmen (31 bis 44 MB) lassen sich schwer übertragen

**Problem:** Eine Aufnahme (3 min) wiegt 31 bis 44 MB; das Übertragen vom Telefon zum Mac ist mühsam. Ich habe die Tar `aufnahme-2026-10-25T14-17-00-513Z-lauf0-video.tar` (24,2 MB) aufgelistet: `video.h264` 17,5 MB (72 %), `tiefe.bin.gz` 6,3 MB (26 %), alles andere (Protokoll, Zustand, Anker, Manifest) zusammen 0,38 MB (1,6 %). Die ältere Tar vom 25.10. morgens hat 58,6 MB. Ohne Video und Tiefe wären es unter 0,4 MB.

**Aktueller Ansatz (Stand 26):** H.264 per WebCodecs, 10 Bilder/s, 1,5 Mbit/s, im OPFS in 10-s-Stücken, „Aufnahme sichern“ packt ein TAR ohne Kopie im Speicher; je Bild die ARCore-Tiefe (gzip). Übertragung von Hand. Nachspiel am Mac stimmt bei Stufe 2 zu 95 bis 98 %, bei `captureEdge` zu 87 bis 94 % mit dem Gerät überein (im Störer-Raum 70 bis 89 %). Es reicht nicht, weil 73 % der Größe das Bild ist und die zweite Quelle (Tiefe) praktisch unkomprimiert ankommt.

**Wissenschaft:**
1. Keine Veröffentlichung gefunden, die „Videogröße gegen Detektionsfehler von Liniensegmenten“ für unseren Fall misst [Vermutung: Lücke]. Der nächste belastbare Bezug ist die eigene Messung (Übereinstimmung 87 bis 94 % bei 1,5 Mbit/s).
2. Suárez et al. 2021, ELSED, arXiv 2108.03144 [V]: Das Verfahren arbeitet auf Gradienten (L1-Norm, vorherrschende Richtung); Kompressionsrauschen verschiebt vor allem schwache Gradienten. Für Wand-Decke-Kanten mit nur 3 Graustufen Unterschied (eigene Synthetikmessung) ist H.264 bei niedriger Rate also der kritische Punkt, nicht die Segmentzahl [Vermutung]. Quelle 3 aus P17.
3. Eine Aufnahme **als Segmente statt als Video** zu speichern ist wissenschaftlich unproblematisch (Segmente sind das Detektorergebnis). Es verliert aber alles, was man später neu auf Pixeln rechnen will (anderer Detektor, andere Schwellen, Semantik). Rechnung [Vermutung]: 33 bis 68 Segmente je Bild (eigene Messung bei 287×640) × 16 Byte × 10 Bilder/s × 180 s ≈ 1 bis 2 MB roh, deutlich weniger gezippt.

**Best Practice (Industrie/Open Source):**
- Scan-Apps (Polycam, Matterport, magicplan, Apple RoomPlan) laden nicht Rohvideo-Stunden, sondern verarbeiten das Ergebnis auf dem Gerät (RoomPlan liefert ein parametrisches Modell). Das habe ich in dieser Recherche nicht belegt [Vermutung aus allgemeinem Wissen, ohne Quelle].
- Web-Plattform: `CompressionStream` kennt laut MDN die Formate `gzip`, `deflate`, `deflate-raw`, `brotli` und `zstd`; „Baseline widely available“ gilt für das Feature seit 2023 (ursprünglich gzip/deflate), nicht belegt für brotli/zstd; aber die Tabelle für einzelne Formate und Chrome Android war nicht lesbar. Firefox-Tests behandeln `zstd` als unverbindlich (Quelle 14, [A]). Für uns: erst `isTypeSupported`-ähnliche Probe (ein Konstruktoraufruf in try/catch) am Pixel, gzip als sicherer Standard.
- WebCodecs `VideoEncoder`: `configure()` mit den Parametern `bitrate`, `bitrateMode`, `latencyMode`, `hardwareAcceleration` (Quelle 15, [A]; MDN-Tabelle für Chrome Android nicht lesbar, Versionsangabe 94 aus allgemeinem Wissen [Vermutung]). Ob der Pixel H.264 in Hardware kodiert und `latencyMode: "realtime"` annimmt, ist nicht belegt; `VideoEncoder.isConfigSupported()` am Gerät klärt es. Wir haben die Strecke bereits laufend.
- Speichern: OPFS (privater Dateispeicher, synchroner Zugriff im Worker, Chromium 108+ laut Chrome-Blog; Android nicht ausdrücklich genannt; Quelle 16, [A]) ist für große Anhängedateien richtig und schon im Einsatz.
- Teilen: Web Share API mit Dateien (`navigator.canShare({files})`, Nutzergeste nötig, erlaubte Dateiendungen begrenzt (laut web.dev: bestimmte Audio-, Bild-, PDF-, Video- und Textdateien, Liste in „Permitted File Extensions in Chromium“), kein dokumentiertes Größenlimit; Quelle 17, [A]). web.dev nennt für `canShare`/`share` Chrome 128 (vermutlich Desktop); die Android-Version habe ich nicht bestätigen können, am Pixel testen. `.tar`/`.h264` sind vermutlich nicht in der Liste erlaubter Endungen [Vermutung]; `.zip` oder `.bin` testen.

**Auf unserem Stack:**
- Was bereits gut ist: OPFS-Stücke, Tar ohne Kopie. Was fehlt: gestufte Aufnahme und ein Weg vom Telefon zum Mac ohne Kabel.
- *Verkleinerung (Optionen, alle ohne neuen Code-Stack):*
  - **Tiefe (6,3 MB):** 160×90 uint16 mit Konfidenz. Vor gzip Bytes mischen (Hi- und Lo-Bytes getrennt) und zeitlich differenzieren, 8 Bit in cm statt 16 Bit in mm quantisieren, nur jedes 3. Bild oder nur Bilder mit Erfassung. Erwartung etwa 2- bis 4-fach kleiner [Vermutung, an der vorhandenen `tiefe.bin.gz` offline testbar, Aufwand 0,5 Tage]. Da Tiefe heute nirgends ein Ergebnis trägt (Beschleunigungssensor und Boden brachten nichts, Tiefe nicht als Karte nutzbar bestätigt), ist „Tiefe nur auf Haken“ die billigste Einsparung: -26 %.
  - **Video (17,5 MB):** Rate von 1,5 auf 0,6 bis 0,8 Mbit/s senken würde auf 8 bis 9 MB gehen [Vermutung]. Entscheidend ist der Treffer beim Nachspiel. Messung: dieselbe Aufnahme offline mit libx264 auf 0,5/0,8/1,5 Mbit/s neu kodieren (`ffmpeg`), Nachspiel am Mac, Übereinstimmung `captureEdge` je Rate vergleichen (haben wir als Werkzeug). Aufwand 0,5 Tage. Auf Luma-only (Graustufen) kodieren spart etwas Bitrate, ist aber in WebCodecs nicht direkt wählbar [Vermutung].
  - **Segmente statt Video:** 1 bis 2 MB, aber der Prüfstand rechnet `captureEdge`/Finder auf Pixeln nach. Zwischenweg: Video nur um Erfassungen (Fenster ±1 s) behalten, sonst Segmente und Zustand. Das ist größte Ersparnis (unter 5 MB), kostet aber Aufnahmelogik (2 bis 3 Tage) und Prüfstandsumbau.
- *Übertragung:* (a) Teilen-Knopf per Web Share mit `File`-Objekt aus OPFS, kein Server nötig; 24 bis 40 MB sind für „Teilen an Drive/AirDrop-Ersatz“ üblich, Limit nicht dokumentiert [Vermutung, am Gerät zu probieren]. (b) `adb pull` aus dem Browser geht nicht für OPFS. (c) Chunk-Upload zum eigenen Webspace erfordert Server-Code (PHP) auf Hetzner; der Stack nennt „nur statische Dateien“ [kein Server]; also verwerfen, solange keine Notwendigkeit. (d) File System Access (`showSaveFilePicker`) gibt es in Chrome Android nicht [Vermutung, nicht geprüft].
- Aufwand: Tiefe komprimieren oder abschaltbar 0,5 Tage; Teilen-Knopf 0,5 Tage; Ratenreduktion nach Messung 0,5 Tage; Fensteraufnahme 2 bis 3 Tage.
- Risiko: niedrig bei Tiefe und Teilen; mittel bei Ratenreduktion (Detektionstreue), hoch bei Fensteraufnahme (Prüfstand und Wiederholbarkeit).

**Empfehlung:** *Machen* in dieser Reihenfolge: (1) Tiefe nur auf Haken und mit Byte-Mischung + gzip (spart 5 bis 6 MB, kein Risiko); (2) Web-Share-Knopf „Aufnahme teilen“ neben „Aufnahme sichern“; (3) Ratenreihe offline messen (0,5/0,8/1,5 Mbit/s) und die niedrigste Rate wählen, bei der `captureEdge`-Übereinstimmung höchstens 2 Punkte sinkt; (4) „Segmente statt Video“ nur als Option, wenn Aufnahmen routinemäßig entstehen. Die eine Messung, die entscheidet: dieselbe Aufnahme mit drei Raten nachspielen und die Übereinstimmung mit dem Gerät vergleichen. Nicht verfolgen: Server-Upload, solange es keinen Server gibt.

**Quellen:**
13. (eigene Messung) `tar -tvf aufnahme-2026-10-25T14-17-00-513Z-lauf0-video.tar`: video.h264 17.542.019 B, tiefe.bin.gz 6.295.190 B, protokoll.json 190.015 B, zustand.jsonl 149.687 B, anker.jsonl 30.787 B, manifest.json 5.231 B.
14. https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream/CompressionStream ; Firefox-Tests: https://arai.searchfox.org/firefox-main/source/testing/web-platform/mozilla/tests/compression/zstd/compression-constructor.tentative.any.js
15. https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder/configure
16. https://developer.chrome.com/blog/sync-methods-for-accesshandles ; https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
17. https://web.dev/articles/web-share ; https://web-platform-dx.github.io/web-features-explorer/features/share.json

---

**Offene Fragen:** (1) Rechenzeit von `readPixels` und Finder/ELSED bei 861×1920 auf dem Pixel 9 Pro ist nie gemessen. (2) Ob der Pixel H.264 in Hardware kodiert und `latencyMode: "realtime"` annimmt (nur `isConfigSupported` am Gerät klärt es). (3) Ob `CompressionStream("zstd")` in Chrome 156 auf Android funktioniert (MDN listet es, Tabelle nicht lesbar). (4) Ob der Hetzner-Webspace per `.htaccess` COOP/COEP setzen lässt und ob eine immersive-ar-Sitzung unter Cross-Origin-Isolation unverändert startet. (5) Ob Web Share `.tar`/`.h264` annimmt und ob es ein Größenlimit gibt. (6) Paper zur Detektionstreue von Liniensegmenten unter H.264-Kompression nicht gefunden. (7) Zahlen der Thermik stammen aus Sekundärquellen zum Tensor G4 (Pixel 9 Pro XL), nicht aus eigener Messung am 9 Pro. (8) Der WebKit-3x-Faktor für `PIXEL_PACK_BUFFER` ist eine Einzelmeldung, nicht geöffnet; Android/Chrome-Wert fehlt. (9) Polycam/Matterport/RoomPlan-Datenübertragung nicht belegt.

Prüfstand: 17 Quellen geprüft, 9 korrigiert, 0 entfernt.


---

<!-- 14-architektur.md -->

# Architekturfrage: Wo liegt die Decke des Web-Ansatzes, was ändert nativ?

Stand: 31.10.2026, Seite Stand 26. Recherche ohne Codeänderung. Markierungen: [V] = Quelle (Teile) gelesen, [A] = nur Abstract, Dokuseite oder Suchtreffer-Ausschnitt gesehen, [Vermutung] = nicht belegt.

## Kurzfassung (das Ergebnis vorab)

1. **Die Pose ist in beiden Welten dieselbe.** Chrome-WebXR `immersive-ar` läuft auf ARCore. Eine native App mit ARCore bekommt dieselbe Visuell-Inertial-Ortung, dieselben Relokalisierungen, dieselben Ankersprünge. P1, P2, P4, P5, P7, P8 (Ursache), P12 und P16 bleiben nativ im Kern bestehen. Sie sind Auswertungs-, Bedienungs- und Prüfstandsprobleme, keine Plattformgrenzen.
2. **Echte Plattformgrenzen des Webs** sind: kein Zugriff auf Kamerawahl/Ultraweitwinkel, auf `CameraConfig` (Kamera-ID, Bildgröße, Bildrate) und `Config.FocusMode` (Fokus), auf `TrackingFailureReason`, auf Roh-IMU über 60 Hz, auf den ARCore-Aufzeichnungsmodus (Recording & Playback) und auf Rechenleistung in nativem Code (Browser-Inferenz auf Mobilgeräten 7,8-fach (GPU) bis 15,8-fach (CPU) langsamer als nativ, [A] 2402.05981).
3. **Was davon uns wirklich trifft**, ist wenig: P9 (schmales Bild) ist teilweise plattformbedingt, P8 (Ortungsverluste) teilweise (Gründe nicht abfragbar, Fokus/Bildrate nicht wählbar), P15 (Aufnahmegröße) und P17 (Rechenzeit) teilweise. Der Rest löst sich nativ nicht von allein.
4. **Dinge, die nativ gar nichts bringen:** Scene Semantics (nur Außenbereich, 11 Klassen ohne Wand/Decke), Raw Depth (Pixel 9 Pro hat keinen ToF-Sensor, Tiefe nur aus Bewegung, auf Weißwänden Konfidenz 0), Geospatial.
5. **Empfehlung:** Web weiter optimieren, plus ein **1-Tages-Spike** mit einer nativen Wegwerf-App (ARCore-Beispiel, Recording-API, CameraConfig-Liste protokollieren). Erst wenn der Spike zeigt, dass nativ Ortungsverluste/Bildfeld deutlich besser sind, lohnt ein **Hybrid (nativer Aufnehmer, Web-Auswertung)**. Ein vollständiger nativer Scanner ist für unsere Probleme nicht begründet. Meilensteine am Ende.

---

## P1 – Abschnitte nach Ortungsbrüchen zusammensetzen
**Problem:** Nach Relokalisierung/Ankerwechsel liegt der Rahmen 0,2-1 m und bis 20° daneben (sauberer Abschnitt Median 3,6 cm). Karte zerfällt in 10-20 Abschnitte, 14-36 globale Wände statt ~8.
**Aktueller Ansatz (Stand 26):** Gyro-Brücke live (Drehfehler am Prüfstand 14,6° → 0,8°), `gyroMit`, Rückkehr-Erkennung. Der Ortsversatz bleibt; Kettenabschnitte sind fest, neue Daten verpuffen (Messung 29.10.).
**Wissenschaft:**
- ARCore selbst driftet und springt: Im Vergleich mit ARKit/T265/ZED endete eine Schleife bei ARCore mit 3,98 m Endabweichung (ARKit 0,19 m); ARCore divergiert bei schneller Bewegung und schlechtem Licht. Voraussetzung dort: 145-m-Flur, kein Raum. [V Teile] Kim u. a. 2022, "An Empirical Evaluation of Four Off-the-Shelf Proprietary VIO Systems", arXiv:2207.06780.
- ADVIO: ARCore zeigt "falsch-positive Sprünge" durch aggressive visuelle Schleifenschließung zwischen ähnlichen Bereichen und wilde Sprünge am Aufnahmeanfang. [V Teile] Cortés u. a. 2018, arXiv:1807.09828.
- Hologramm-Drift ARCore/ARKit: mittlere Drift 1,2-43,2 cm je nach Nutzeraktion (6 Aktionen, 3 Geräte), Relokalisierungsphasen sind die instabile Zeit ("relocalization time"). [V Teile] Scargill u. a. 2021, arXiv:2109.14757.
- Gegenmittel aus der Literatur (schon lokal): IPC (Annahme nur, wenn alle Messungen den χ²-Test bestehen), PCM (Mangelson 2018), GNC (1909.08605), ORB-SLAM3/Atlas (Zusammenführen nach Bestätigung). Das ist Auswertung, nicht Sensorik.
- Grenze: Ohne eigene Pose (eigene VIO) ist man an die ARCore-Brüche gebunden; selbst nativ bleibt der ARCore-Relokalisierungsversatz.
**Best Practice (Industrie/Open Source):** Produkte mit LiDAR (RoomPlan) umgehen Brüche, weil jede Sitzung Tiefe pro Bild hat. Kein Android-Produkt mit reiner Kamera hat das Problem öffentlich gelöst; magicplan bietet auf Android gar keinen Scan mehr an ([V] help.magicplan.app/supported-devices: Scan-Funktion auf Android nicht unterstützt, Grund fehlendes LiDAR).
**Auf unserem Stack:** Gleiche ARCore-Pose wie nativ, also keine Plattformgrenze. Hebel liegen im Karten-Worker (Zuordnung nach dem Einbinden, IPC-artige Annahmeprüfung, Bildkante als Faktor, 2-3 Wochen laut 29.10.). Nativ gewinnt man nur: Tracking-Failure-Reasons als Zusatzmerkmal für Brüche und Aufzeichnung zum Wiederholen.
**Empfehlung:** Machen (im Web, Auswertung). Nativ nicht nötig. Entscheidende Messung: Anteil der Brüche (Ankerwechsel) je Rundgang nativ vs. WebXR im selben Raum (Spike) - bei gleicher Zahl ist die Plattformfrage für P1 erledigt.
**Quellen:**
1. https://arxiv.org/abs/2207.06780
2. https://arxiv.org/abs/1807.09828
3. https://arxiv.org/abs/2109.14757
4. https://help.magicplan.app/supported-devices

## P2 – Rückkehr zur Anfangswand (Ringschluss)
**Problem:** Zweite Runde verdoppelte die Skizze (73 statt ~34 m²); Rückkehr ≥ 300°, ≤ 10°/40 cm in 6 von 10 Aufnahmen.
**Aktueller Ansatz (Stand 26):** `G.rueckkehr`, Rundenbruch, Zustand "Runde komplett".
**Wissenschaft:** Ringschluss ist ein Auswertungsthema (Hypothese-und-Prüfung, 1608.02052; DBoW2, galvez2012, beide lokal). Plattformbezug: ARCore führt eigene visuelle Schleifenschließung aus und kann dabei falsch-positiv springen ([V Teile] ADVIO); in Hasler 2019 erkannte das AR-Gerüst den Startpunkt und setzte das Gerät korrekt um, absolute 3D-Genauigkeit etwa 1 % der Strecke, lokal unter einem Dezimeter [A] (Hasler/Blaser/Nebiker 2019, ISPRS XLII-2/W17, S. 135-141; Treffer-Zusammenfassung bestätigt).
**Best Practice:** RoomPlan/Matterport schließen über Tiefe und Mehrfachansicht; Kamera-only-Apps lassen den Nutzer abschließen (magicplan: Ecken schließen manuell).
**Auf unserem Stack:** Läuft schon; Schwelle 10°/40 cm ist ein Prüfstandswert. Nativ nichts Neues außer der Möglichkeit, ARCore-Tracking-State/Relokalisierungsereignisse zu lesen [Vermutung, nicht belegt für ARCore-API].
**Empfehlung:** Messen/weiter: Schwellen an mehr Aufnahmen prüfen (Fehltreffer-Raster). Keine native Notwendigkeit.
**Quellen:**
1. https://arxiv.org/abs/1807.09828
2. https://isprs-archives.copernicus.org/articles/XLII-2-W17/135/2019/ (Hasler u. a. 2019)

## P3 – Kein verlässlicher Genauigkeitsmaßstab
**Problem:** Wahrheit nur für eine Wohnküche, mehrdeutige Zuordnung, Spiegelproblem.
**Aktueller Ansatz (Stand 26):** T2-Passung/IoU, beide mehrdeutig (Passung 1,00-1,11).
**Wissenschaft:** Benchmarks nutzen Laser-/Tachymeter-Wahrheit (LaMAR 2210.10770, lokal; ADVIO mit Trägheits-/Passpunkt-Wahrheit [V Teile]). GRIHA (ARCore-basiert) hat mittleren Flächenfehler 3,1-3,3 % (Klassenzimmer/Büros), magicplan 3,7-4,5 % (Tabelle 3 im PDF; Referenz laut Paper vermessene Wahrheit, Details nicht geprüft) [V Teile] (arXiv:2103.08297; Raumzahl klein, Methode des Vergleichs von den Autoren selbst gewählt).
**Best Practice:** Hersteller geben Flächen-/Kantenfehler gegenüber Laser-Distanzmesser an (Polycam ±½ Zoll im Innenraum, eigene Herstellerangabe, Genauigkeit sinkt bei größeren Räumen, LiDAR-Reichweite etwa 5 m [A]; Blogtest Mavric 2020 zu magicplan LiDAR: Mittel 50 mm im kleinen, 170 mm in komplexeren Räumen, Eckenmodus etwa 100 mm im kleinen Raum [A, Einzeltest, Raumzuordnung unklar]).
**Auf unserem Stack:** Maßstab ist rein Prozess: Laser-Distanzmesser als Wahrheit pro Raum (Kantenlängen, 4-8 Werte genügen), Wandlängen statt Polygon-IoU vergleichen. Nativ unnötig. Web-Bluetooth erlaubt, Bluetooth-Laser (Bosch GLM 120c, Leica X3/X4 u. a.) direkt in der Seite zu lesen ([A] floorplancreator.net: Web-Version nutzt Web Bluetooth, dort für Desktop-Chrome/Edge/Opera genannt; auf Android nutzt deren App Bluetooth Classic - Android-Chrome-Betrieb mit Laser bei uns ungeprüft).
**Empfehlung:** Machen: je Testraum 6-10 Laserwerte als Wahrheit (Wandlängen, Höhe) und Metrik "Kantenlänge-Fehler" einführen. Entscheidende Messung: gleiche Wand dreimal scannen, Streuung gegen Laser.
**Quellen:**
1. https://arxiv.org/abs/2103.08297
2. https://learn.poly.cam/hc/en-us/articles/27488763119892
3. https://mavricresearch.com/2020/11/10/magicplan-now-with-added-lidar-🧂
4. https://floorplancreator.net/help/bluetooth
5. https://developer.chrome.com/docs/capabilities/bluetooth

## P4 – Auswertung/Topologie instabil
**Problem:** 4 Erfassungen mehr oder weniger kippen 6 gegen 17 Ecken; Ring aus Wandenden verwirft 24-64 Erfassungen.
**Aktueller Ansatz (Stand 26):** `minBeob` 3, Höhen-/Tor-Schalter hinter Flag, gemischte Ergebnisse.
**Wissenschaft:** Reine Auswertung: Floor-SP/Cabral (lokal), Manhattan-/Atlanta-Annahmen (StructVIO, ManhattanSLAM, lokal). Nichts davon hängt an der Plattform.
**Best Practice:** RoomPlan liefert Wände als Objekte mit Klassifikation aus dem ML-Modell, magicplan lässt Ecken vom Nutzer bestätigen.
**Auf unserem Stack:** Plattformunabhängig. Native Rechenzeit würde mehr Hypothesen pro Sekunde erlauben, wird aber heute nicht limitiert (Auswertung läuft im Worker).
**Empfehlung:** Machen im Web; mehr Aufnahmen. Nativ nicht nötig.
**Quellen:**
1. https://help.magicplan.app/supported-devices
2. https://developer.apple.com/augmented-reality/roomplan/

## P5 – Neue Karte (Kanten als Landmarken) nicht besser
**Problem:** Kanten des ganzen Bilds allein ergeben keinen Grundriss; beide Quellen 20-40-fach Rechenzeit.
**Aktueller Ansatz (Stand 26):** Erfassungen am Fadenkreuz bleiben Vorgabe.
**Wissenschaft:** Linienbasierte VIO (PL-VINS 2009.07462, StructVIO, PL-SLAM, lokal) hilft in texturarmen Szenen, setzt aber Pose-Schätzung mit eigenem VIO voraus - bei uns liefert ARCore die Pose, die Linien wären nur Landmarken. Deshalb kein direkter Gewinn.
**Best Practice:** ORB-SLAM3/OpenVINS nutzen Punktmerkmale; OpenVINS ist GPL-3, monokular+IMU (MSCKF), führt Kamera-IMU-Zeitversatz und Intrinsik als Kalibrierumfang, ob online, steht auf der Repo-Seite nicht [Vermutung: online, nach Wissen] ([A] github.com/rpng/open_vins). Basalt BSD-3, ohne Mobil-Hinweis ([A]). ORB-SLAM3 hat keinen gepflegten Monokular-Inertial-Android-Port (nur Forks wie lturing/ORB_SLAM3_modified: Telefon nimmt auf, SLAM läuft auf Ubuntu) ([A]). Zu VINS-Mobile gibt es eine Portierungsanleitung für Android (Möller, Meyer, Eisemann, WSCG 2019, getestet auf Galaxy S7, Schwerpunkt Kalibrierung gerätespezifischer Parameter); ein gepflegter öffentlicher Android-Port ist nicht belegt ([A]).
**Auf unserem Stack:** Eigene VIO wäre nur nativ sinnvoll und kostet Monate (Kalibrierung, Zeitsynchronisation), um ARCores Pose zu ersetzen. Gewinn für Grundriss unbewiesen.
**Empfehlung:** Verwerfen (eigene VIO). Die Linien bleiben Anzeige und Erfassungen.
**Quellen:**
1. https://github.com/rpng/open_vins
2. https://github.com/VladyslavUsenko/basalt
3. https://github.com/lturing/ORB_SLAM3_modified
4. https://www.graphics.tu-bs.de/publications/moller2020porting
5. https://arxiv.org/abs/2009.07462

## P6 – Falsche Kanten (Leiste, Stuck, Schiene, Schrank, Rahmen)
**Problem:** Statt Wand-Decke-Kante wird anderes erfasst.
**Aktueller Ansatz (Stand 26):** Höhenklasse, Fadenkreuz; Nutzer bestätigt.
**Wissenschaft:** Semantik für Wand/Decke/Boden ist lernbasiert (HorizonNet, LaLaLoc, PixCuboid, lokal); hier kein Plattformbezug.
**Best Practice:** ARCore Scene Semantics würde Klassen liefern, ist aber **nur Außenbereich**, 11 Klassen (Himmel, Gebäude, Baum, Straße, Fahrzeug, Gehweg, Gelände, Struktur, Wasser, Objekt, Person), nicht für Querformat garantiert ([V] developers.google.com/ar/develop/scene-semantics). RoomPlan klassifiziert Wände/Türen/Fenster/Objekte über LiDAR+ML (iOS, [A]).
**Auf unserem Stack:** Native hilft hier nicht. Im Web ginge ein kleines Segmentierungsnetz per WebGPU/WASM, aber Browser-Inferenz ist auf Mobil 7,8-15,8-fach langsamer als nativ ([A] Wang u. a. 2024, arXiv:2402.05981). Praktisch: Plausibilitätsregeln (Abstand zur Deckenebene, Höhe über Boden) im Karten-Worker.
**Empfehlung:** Messen: Fehlerquote falscher Kanten gegen Höhenklasse/Deckenabstand an den vorhandenen Aufnahmen; ML erst danach.
**Quellen:**
1. https://developers.google.com/ar/develop/scene-semantics
2. https://developer.apple.com/augmented-reality/roomplan/
3. https://arxiv.org/abs/2402.05981

## P7 – Raumhöhe/Maßstab ohne Laser
**Problem:** 2,16-2,61 m, Scheinminimum Decke auf Augenhöhe.
**Aktueller Ansatz (Stand 26):** Höhe aus Kantenerfassungen/Boden.
**Wissenschaft:** Maßstab kommt aus VIO (Beschleunigungsmesser); Genauigkeit der ARCore-Entfernungsbestimmung bei wenig Licht wurde untersucht (Sokolov u. a. 2025, Radiotekhnika 223; Zahlen nicht gelesen, nur Zweck bestätigt [A]). Tiefenkarte hilft nur mit Textur.
**Best Practice:** Depth API: Genauigkeit am höchsten 0,5-5 m, Hardware-ToF wird verschmolzen, sonst Tiefe aus Bewegung ([V] developers.google.com/ar/develop/depth). Pixel 9 Pro: Gerätetabelle sagt nur "Supports Depth API", keine ToF-Angabe ([V] developers.google.com/ar/devices; kein ToF-Sensor laut Auftrag). Raw Depth: Konfidenz 0 auf texturlosen Flächen ([V] raw-depth-Seite). Decken sind meist weiß.
**Auf unserem Stack:** Web hat Tiefe schon (raw 160x90 CPU). Nativ gleiche Qualität [Vermutung: gleiche ARCore-Tiefe]. Sichere Lösung: Laser über Web Bluetooth oder eine Tippeingabe als Maßstab (Companion-Entscheid).
**Empfehlung:** Laserwert als Maßstab (Web-Bluetooth), Kamera liefert Form. Verwerfen: Tiefe als Maßstabsquelle auf Decke.
**Quellen:**
1. https://developers.google.com/ar/develop/depth
2. https://developers.google.com/ar/develop/java/depth/raw-depth
3. https://developers.google.com/ar/devices
4. https://developer.chrome.com/docs/capabilities/bluetooth

## P8 – Ortungsverluste von ARCore (Hochformat 19 %, Quer 0,7 %)
**Problem:** Lücken bis 10 s; Querformat löste es weitgehend.
**Aktueller Ansatz (Stand 26):** Querformat-Haken; Gyro-Brücke überbrückt Drehung.
**Wissenschaft:** ARCore versagt bei schneller Bewegung/schlechtem Licht ([V Teile] 2207.06780). Bei Gyro-Überbrückung bleibt der Restfehler in Lücken 1-10 s (29.10.: etwa 85 % des Restes).
**Best Practice (ARCore-API):** `TrackingFailureReason` unterscheidet BAD_STATE, CAMERA_UNAVAILABLE, EXCESSIVE_MOTION, INSUFFICIENT_FEATURES, INSUFFICIENT_LIGHT (plus NONE) ([V] Referenzseite). Fokus: ARCore empfiehlt Festfokus fürs Tracking, Autofokus erst für Aufnahme/Nahdinge ([V] camera-configs).
**Auf unserem Stack:** WebXR meldet keinen Grund, nur "Pose weg". Native Zusatz: Grund anzeigen ("langsamer", "mehr Licht") statt stummer Lücke - wirkt auf die Ursache (Nutzerverhalten). Kamera-Konfiguration (Bildrate, Auflösung, Fokus) ist im Web nicht wählbar.
**Empfehlung:** Machen im Web: Nutzerführung nach Bewegungsgeschwindigkeit (Drehrate aus Gyro, schon vorhanden) statt Grund. Nativ nötig nur für Grundmeldung. Entscheidende Messung: Spike zählt Verlustanteil nativ gegen 19 % (Hoch) / 0,7 % (Quer) im gleichen Raum.
**Quellen:**
1. https://developers.google.cn/ar/reference/java/com/google/ar/core/TrackingFailureReason
2. https://developers.google.com/ar/develop/java/camera-configs
3. https://arxiv.org/abs/2207.06780

## P9 – Kamerabild zu schmal (34,6° im Hochformat)
**Problem:** Chrome beschneidet; keine Linsenwahl; quer ~70°.
**Aktueller Ansatz (Stand 26):** Querformat-Pflicht für AR.
**Wissenschaft:** Großes Sichtfeld verbessert Odometrie und Schleifenschließung (Zhang 2016 lokal; LF-VISLAM 2209.05167; Double-Sphere 1807.08957, lokal). Bei uns zeigte sich aber: Sichtfeld 14-35° beeinflusst die Abschnittsverbindung nicht.
**Best Practice:** Das Pixel 9 Pro hat laut Google-Datenblatt eine 48-MP-Ultraweitwinkelkamera mit 123° ([A] Google-Spezifikationsseite, PetaPixel-Seite war nicht abrufbar). ARCore bietet in `CameraConfig` Kamera-ID, CPU-/GPU-Bildgröße, FPS, Tiefensensor, Stereo - aber **keine Ultraweitwinkel-Wahl dokumentiert** ([V] camera-configs). ARCore-Standard: CPU-Strom 640x480 (4:3), GPU-Strom meist 1920x1080 ([V] camera-sharing). Camera2 selbst könnte Ultraweitwinkel über logische Multikamera/physische IDs öffnen ([Vermutung] aus Wissen, Doku-Abruf misslang); dann gäbe es aber **keine ARCore-Pose** mehr zum selben Bild (Shared Camera mit Camera2 nur für ARCores Kamera).
**Auf unserem Stack:** Web: nicht lösbar (Chrome-Zuschnitt, keine Linsenwahl). Nativ: 4:3-CPU-Bild mit ARCore-Pose wahrscheinlich ungeschnitten [Vermutung], Hochformat-Sichtfeld vermutlich größer als 34,6°. Wirkung auf Grundrissqualität: nach Messung gering.
**Empfehlung:** Nativ nötig nur wenn Spike zeigt, dass CameraConfig ein deutlich breiteres Bild liefert; sonst verwerfen. Entscheidende Messung: im Spike CameraConfig-Liste (ID, CPU-Größe, FOV aus Intrinsik) protokollieren.
**Quellen:**
1. https://developers.google.com/ar/develop/java/camera-configs
2. https://developers.google.com/ar/develop/java/camera-sharing
3. https://petapixel.com/2024/08/13/the-redesigned-google-pixel-9-has-a-new-ultrawide-camera
4. https://arxiv.org/abs/2209.05167

## P10 – AR-Bild voller Striche, Bildschirmnutzung
**Problem:** Historie lag nach Drift neben der Kante; quer nur 42 % frei (jetzt ~66 %).
**Aktueller Ansatz (Stand 26):** Nur Kanten des jüngsten Worker-Ergebnisses, Spalte rechts.
**Wissenschaft/Best Practice:** UI-Thema (IntelliCap: Streifen auf fehlenden Bereichen; magicplan: orange offene Wände, aus Memo 29.10.).
**Auf unserem Stack:** Rein Web/UI, dom-overlay genügt. Plattform ohne Einfluss.
**Empfehlung:** Machen im Web (UI), nach Rückmeldung. Nativ nicht nötig.
**Quellen:**
1. https://developers.google.com/ar/develop/java/camera-sharing (nur Hintergrund Strom-Auflösungen)

## P11 – Live nur eine Kante am Fadenkreuz, Fadenkreuz Pflicht
**Problem:** Erfassung ist an das Fadenkreuz gebunden.
**Aktueller Ansatz (Stand 26):** Erfassungen am Fadenkreuz; Kanten des ganzen Bilds nur zur Anzeige.
**Wissenschaft:** Kanten aus dem ganzen Bild brauchen robuste Zuordnung (LIMAP 2303.17504, DeepLSD 2212.07766, lokal); wir messen: allein kein Grundriss.
**Best Practice:** magicplan/RoomPlan: Nutzer fährt Wände ab bzw. Modell erkennt automatisch (LiDAR nötig).
**Auf unserem Stack:** Rechenzeit 20-40-fach ist die Grenze (JS, ELSED 5 ms/Bild). Nativ (C++) wäre die Linienerkennung schneller, aber das Hindernis ist nicht ELSED, sondern die Karte.
**Empfehlung:** Verwerfen (autom. Ganzbild-Erfassung) vorerst; Fadenkreuz als Absicht des Nutzers ist auch ein Qualitätsfilter.
**Quellen:**
1. https://arxiv.org/abs/2303.17504
2. https://arxiv.org/abs/2108.03144

## P12 – Handhaltung zu hoch
**Problem:** Kamera 44-60 cm unter der Decke macht die Skizze ungenau.
**Aktueller Ansatz (Stand 26):** Hinweis in der Bedienung.
**Wissenschaft/Best Practice:** Führung durch UI (IntelliCap, 2508.13043). Plattformfrei.
**Auf unserem Stack:** Höhe über Boden ist aus Bodenanker bekannt; Warnung "Hand tiefer" ist machbar.
**Empfehlung:** Machen (UI). Nativ nicht nötig.
**Quellen:**
1. https://arxiv.org/abs/2508.13043

## P13 – Gyro/IMU (Zeitbasis, Achsen, Fokus nach Berechtigungsdialog)
**Problem:** Zeitbasis Geräte-Laufzeit, Achsen bei Ruhe, Fokusverlust.
**Aktueller Ansatz (Stand 26):** Live-Kalibrierung, Rest Median 0,09°/p90 0,30° gegen ARCore (50 Hz).
**Wissenschaft:** Zeitversatz muss online geschätzt werden (Qin/Shen 2018, VINS-Mono, [A] arXiv:1808.00692; Guo 2014 lokal); unser Versatz 170 ms ist im Rahmen.
**Best Practice (Native):** Kamera-Zeitstempel in derselben Zeitbasis wie `SensorEvent.timestamp`, wenn `SENSOR_INFO_TIMESTAMP_SOURCE = REALTIME` [Vermutung: aus Wissen, Doku-Abruf lieferte nur Navigation]. Seit Android 12 (Apps mit Ziel-API 31+) begrenzt Android Sensor-Raten auf 200 Hz (SensorDirectChannel auf RATE_NORMAL, etwa 50 Hz), darüber Berechtigung `HIGH_SAMPLING_RATE_SENSORS` ([V] developer.android.com sensors_overview). Chrome Generic Sensor kappt auf 60 Hz aus Sicherheitsgründen ([V] chromium.org Generic-Sensor-Dokument).
**Auf unserem Stack:** 50 Hz mit Lücken bis 130 ms genügt für Drehungsüberbrückung (Rest 0,1°); gemessen: Beschleunigungssensor bringt nichts. Nativ 200-500 Hz bringt nur etwas für schnelle Bewegungen/Beschleunigungsintegration, die wir gemessen verworfen haben. Zeitbasis nativ sauberer, aber bei uns gelöst.
**Empfehlung:** Verwerfen als Argument für nativ. Weiter im Web.
**Quellen:**
1. https://arxiv.org/abs/1808.00692
2. https://developer.android.com/develop/sensors-and-location/sensors/sensors_overview
3. https://chromium.org/developers/design-documents/generic-sensor

## P14 – Einstellungen nur per URL
**Problem:** Konfiguration für Nutzer.
**Aktueller Ansatz (Stand 26):** Haken/Knöpfe (Regel: nie URL-Parameter für Nutzer).
**Wissenschaft/Best Practice:** keine.
**Auf unserem Stack:** Rein UI, `localStorage`-Wahl möglich; Plattform ohne Einfluss.
**Empfehlung:** Machen (Rest der URL-Schalter in Haken überführen). Nativ nicht nötig.
**Quellen:**
1. Keine externe Quelle nötig (interne Regel).

## P15 – Große Aufnahmen (31-44 MB)
**Problem:** Übertragung schwer.
**Aktueller Ansatz (Stand 26):** `.tar` mit Video + Protokollen.
**Wissenschaft:** –
**Best Practice:** ARCore Recording speichert H.264-Video (Standard 640x480-CPU-Bild), Tiefen-Vorschau, IMU, Metadaten in einer MP4 ([V] recording-and-playback); Playback speist sie in ARCore wie Live-Kamera. Größe nicht dokumentiert (Drittseite: zig MB pro Minute, [A]).
**Auf unserem Stack:** Web kann H.264 per WebCodecs/MediaRecorder codieren [Vermutung, nicht geprüft für XR-Textur]. Größe lässt sich auch per geringere Auflösung (wir laufen intern 640x287) und Bildrate senken. Native Recording lieferte kompaktere Dateien und die Wiederholbarkeit, aber nur in der nativen App.
**Empfehlung:** Messen: Aufnahme auf 640 px Breite + H.264 im Web; Ziel unter 10 MB. Nativ nicht nötig.
**Quellen:**
1. https://developers.google.com/ar/develop/recording-and-playback
2. https://sceneview.github.io/docs/ar-recording/

## P16 – Prüfwerkzeuge selbst fehlerhaft
**Problem:** Verzerrter Prüfstand, mehrdeutiger Orakel-Vergleich.
**Aktueller Ansatz (Stand 26):** Prüfstand am simulierten Bruch, Wahrheit nur Wohnküche.
**Wissenschaft:** Benchmarks (LaMAR, ADVIO) nutzen Referenz-Trajektorie mit unabhängigem Messmittel.
**Best Practice:** ARCore Recording & Playback erlaubt, dieselbe Sitzung beliebig oft durch ARCore zu schicken und Algorithmen reproduzierbar zu vergleichen ([V] Doku). Bei uns ersetzt das schon die `.tar`-Aufnahme plus T1-Prüfstand.
**Auf unserem Stack:** Web hat eigene Wiedergabe. Nativ-Vorteil: ARCore-Pose beim Wiederholen *neu* berechnen (Tracking-Varianten testen) statt nur aufgezeichnete Pose - das ist im Web unmöglich. Nützlich zum Messen der Ortungsbrüche, nicht für den Grundriss.
**Empfehlung:** Machen: Laser-Wahrheit (P3) einführen. Native Aufzeichnung nur im Spike nutzen.
**Quellen:**
1. https://developers.google.com/ar/develop/recording-and-playback
2. https://arxiv.org/abs/2210.10770

## P17 – Rechenzeit im Browser
**Problem:** Volle Auflösung 1920 px zu langsam; Ganzbildkanten in der Karte 20-40-fach.
**Aktueller Ansatz (Stand 26):** 640x287, ELSED in JS ~5 ms, Worker.
**Wissenschaft:** WebAssembly läuft im Mittel 45 % (Firefox) bis 55 % (Chrome) langsamer als nativ, Spitze 2,5-fach ([A] Jangda u. a. 2019, arXiv:1901.09056). Browser-Inferenz mobil 15,8-fach (CPU) und 7,8-fach (GPU) langsamer als nativ, bei Speicher bis 334-fach der Modellgröße ([A] arXiv:2402.05981). WASM-Tracking in Browsern: bis 25 Hz auf Smartphones ([A] Göttl u. a. 2018, arXiv:1804.08424).
**Best Practice:** OpenCV.js hat keine `findEssentialMat` (Memo 29.10.); ORB in 120 Zeilen JS erreicht OpenCV-Qualität (Mac 11-19 ms/Bild; Pixel nicht gemessen).
**Auf unserem Stack:** Realistischer Gewinn durch Web-Arbeit: Algorithmen verbessern (Kanten nur im Fenster um Fadenkreuz, `OffscreenCanvas`), WASM-SIMD für Linien/Löser (Faktor 2-4 [Vermutung]). Native C++ bringt ~2-fach (WASM-Lücke) bis ~8-fach (Netze), aber unsere Hürde ist Karten-Algorithmus, nicht Zeit pro Bild.
**Empfehlung:** Messen: Profil auf dem Pixel (ELSED, ORB, Löser) - nur wenn ein Posten > 30 % der Rahmenzeit, dann WASM. Nativ nicht begründet.
**Quellen:**
1. https://arxiv.org/abs/1901.09056
2. https://arxiv.org/abs/2402.05981
3. https://arxiv.org/abs/1804.08424

## P18 – Ohne Nutzen untersucht (Beschleunigungssensor, Bodenkanten, Sichtfeld)
**Problem:** Drei Hebel brachten nichts.
**Aktueller Ansatz (Stand 26):** Verworfen/zurückgestellt.
**Wissenschaft:** Beschleunigungsmesser: zweifache Integration driftet quadratisch; nur zweiseitig mit Online-Bias lohnend (gemessen: 6 s → 12 statt 42 cm).
**Best Practice:** Produktive Systeme fusionieren IMU in Filter/Optimierung (MSCKF in OpenVINS, [A]); ARCore tut es intern.
**Auf unserem Stack:** Roh-IMU nativ (200 Hz+) ändert die Messung nicht: Rauschen 0,3 cm bei 3 s, Restoffset und Fehlausrichtung dominieren.
**Empfehlung:** Verwerfen; `?imu=1` nur als Datenquelle behalten.
**Quellen:**
1. https://github.com/rpng/open_vins
2. https://developer.android.com/develop/sensors-and-location/sensors/sensors_overview

---

## Architekturentscheidung: Web vs. Android-nativ vs. Hybrid

### Plattformgrenze je Problem
| Problem | Plattformbedingt? | Löst sich nativ? |
|---|---|---|
| P1, P2, P4, P5, P6, P7, P10, P11, P12, P14, P16 | nein | nein (Auswertung/Bedienung/Prüfmaß) |
| P3 | nein | nein (Laser-Wahrheit nötig) |
| P8 | teilweise | nur Gründe + Kamerakonfig; Kern bleibt |
| P9 | ja (Chrome-Zuschnitt, keine Linsenwahl) | möglich, Wirkung auf Grundriss gering |
| P13 | teilweise (60-Hz-Kappe) | ja, bei uns aber gelöst |
| P15, P17 | teilweise | teilweise |
| P18 | nein | nein |

### Wirklich neue native Fähigkeiten (geprüft)
- **Recording & Playback:** H.264-Video (Standard 640x480-CPU-Bild), Tiefen-Vorschau, Gyro+Accel, Metadaten; Wiedergabe als Live-Sitzung ([V]). Nutzen: reproduzierbares Messen der Brüche. Nicht aufgezeichnet wird das hochaufgelöste GPU-Bild.
- **Depth/Raw Depth:** auf dem Pixel nur Tiefe aus Bewegung; Konfidenz 0 auf Weißwänden ([V]). Kein LiDAR-Ersatz.
- **Scene Semantics:** Außenbereich, kein Wand/Decke ([V]). Unbrauchbar.
- **CameraConfig/Shared Camera:** Bildgröße, FPS, Fokus, zusätzliche CPU-Ströme (2x YUV auf High-End) ([V]); Ultraweitwinkel nicht dokumentiert.
- **Roh-IMU:** bis 200 Hz ohne, darüber mit Berechtigung ([V]); im Web 60 Hz Kappe ([V]).
- **Tracking-Failure-Reason:** vorhanden ([V]).

### Referenzprodukte
- Apple RoomPlan: nur LiDAR-iPhones/iPads, Swift, ARKit; Ausgabe USD/USDZ mit Maßen ([V] developer.apple.com). Genauigkeit: unabhängige Papers zu RoomPlan nicht gefunden; Rezensionen nennen 1-3 cm in normalen Räumen ([A], schwache Quelle).
- magicplan: **Android-Scan nicht unterstützt** ([V] help.magicplan.app/supported-devices; Hinweis zu einer widersprechenden Hilfeseite/Version 9.3.0 ist in dieser Prüfung nicht wiederzufinden, [Vermutung]). Polycam: Floorplan-Modus verlangt LiDAR-iPhone/iPad ([A] Hilfeseite per Suchtreffer); Android-Funktionsumfang für Grundrisse nicht belegt. Canvas: iOS/LiDAR ([A]).
- **Folge:** Es gibt kein bekanntes Android-Kamera-Only-Produkt als Vorbild. Das ist ein Marktargument für unseren Weg, aber auch ein Hinweis, dass die Aufgabe auf Android hart ist.
- Open Source: OpenVINS (GPL-3, kein Android-Hinweis), Basalt (BSD-3, Desktop), ORB-SLAM3 (Android-Forks nicht funktionsfähig/nur Aufnahme), VINS-Mobile-Android-Port (2019). Kimera: nicht geprüft.

### Aufwandsschätzung ([Vermutung] aus Erfahrungswerten, nicht belegt)
| Option | Inhalt | Aufwand | Risiko |
|---|---|---|---|
| A Web weiter | Karte (Zuordnung, Annahmeprüfung), Laser-Wahrheit, Web-Bluetooth-Laser, Aufnahme verkleinern | 3-5 Wochen | gering; Decke = ARCore-Qualität |
| B Spike nativ | ARCore-Beispiel in Kotlin, Recording, CameraConfig-Log, Verlustzählung | 1-2 Tage | sehr gering |
| C Hybrid | nativer Aufnehmer (Pose, Bilder, IMU, Gründe) + Web-Auswertung nach dem Scan | 2-3 Wochen | mittel: Live-Fadenkreuz fehlt, Übergabe App → Web |
| D Voll nativ | Kotlin/NDK-App, Linien (ELSED C++), Karte portieren (JS → Kotlin/C++), UI, Laser, Release | 8-14 Wochen | hoch; löst P1-P7 nicht von allein |

### Companion-App
Gedächtnisentscheid (Kamera liefert Rohskizze, Laser misst ein) passt zu **Web-Bluetooth** (Chrome Android unterstützt es, nur HTTPS und Nutzergeste, [V] developer.chrome.com). Eine Companion-App mit Login/Nutzer-DB braucht keinen nativen Scanner.

## Empfehlung mit Meilensteinen
1. **M0 (1-2 Tage): Spike nativ.** Kotlin-Beispiel mit ARCore, Aufzeichnung an, `getSupportedCameraConfigs` protokollieren (Kamera-ID, CPU-/GPU-Größe, FPS, Tiefensensor), drei Rundgänge im Raum der Aufnahmen. Entscheidungsregel: Verlustanteil Hochformat nativ < 5 % (statt 19 %) **oder** Config mit deutlich größerem Sichtfeld → weiter zu M3; sonst Web.
2. **M1 (1 Woche): Laser-Wahrheit** (6-10 Laserwerte je Testraum, Metrik Kantenlänge, Web-Bluetooth-Anbindung als Prototyp). Entscheidet P3, P7, P16.
3. **M2 (2-3 Wochen): Karte im Web**: Annahmeprüfung nach IPC/PCM, `hoeheEigen` + `minBeob` an mehr Aufnahmen entscheiden, Bildkante als Faktor.
4. **M3 (nur bei M0 positiv, 2-3 Wochen): Hybrid-Aufnehmer**, der Bilder/IMU/Pose/Gründe aufzeichnet; Auswertung bleibt im Web (Hochladen). Nicht als zweiter Scanner im Kern.
5. **Nicht tun:** Vollnativer Scanner, eigene VIO, Scene Semantics, Raw Depth als Maßstab.

## Offene Fragen
- Liefert ARCore auf dem Pixel 9 Pro über `CameraConfig` ein breiteres/ungeschnittenes Bild oder die Ultraweitwinkel-Kamera? (Doku sagt dazu nichts; nur am Gerät klärbar.)
- Camera2-Zeitstempelquelle (`REALTIME`) und logische Multikamera des Pixel 9 Pro: Doku-Abruf gelieferte keine Inhalte, nur Wissen, ungeprüft.
- Auflösung der ARCore-Tiefenkarte nativ vs. unsere 160x90 in WebXR: nicht dokumentiert gefunden.
- Dateigröße der ARCore-Aufzeichnung je Minute: nur Drittangabe.
- Kimera auf Mobilgeräten und aktuelle ORB-SLAM3-Android-Ports: nicht geprüft.
- Unabhängige Genauigkeitsstudie zu Apple RoomPlan nicht gefunden.
- Paper nicht neu heruntergeladen/paperStash nicht geladen; die genannten Paper liegen schon in `paper/`, ich las nur Abstracts bzw. Ergebnisabschnitte (Markierung [V Teile]/[A]).

Prüfstand: 45 Quellen geprüft, 17 korrigiert, 0 entfernt.
