# Raumskizze-Probe – Messregister und Raumzuordnung (AP1)

Stand 31.10.2026. Zweck: Die Raumzuordnung der 11 Aufnahmen war in den Konzeptdokumenten widersprüchlich (`2026-10-31-konzepte-p1-p4-p5-p6-p7.md`, Abschnitt 3.3). Hier steht, was sich aus den Daten belegen lässt, was nur aus Doku und Nutzerangaben stammt, und was der Nutzer bestätigen muss. Der Referenzlauf Flur 16:25 ist auf eine einzige reproduzierbare Zahl festgeschrieben.

**Lesehilfe.** *sicher (Daten)* = aus T1/T2 reproduzierbar. *sicher (Doku/Nutzer)* = aus einer Nutzerangabe in einem Dokument, die Daten widersprechen nicht. *vermutet* = Indizien, kein Beleg. *offen* = Nutzer muss entscheiden. Alle Stempel sind **UTC** (so heißen die Dateien); Ortszeit ist am 25.–31.10. MEZ = Stempel + 1 h.

Rechenbasis: Hauptrepo `/Volumes/external/TobiCodetEndlichWieder/Zaene` (Branch `feat/raumskizze-kamera`), Node v26.12.1. Alle Läufe mit dem Hilfsskript `scripts/raumskizze-zuordnung.sh` (ruft nur T1 auf) oder direkt mit den im Text genannten Befehlen.

---

## 1. Ergebnis in vier Sätzen

1. **Nur die Aufnahme 31.10. 16:25 ist durch die Daten einem Raum zugeordnet (Flur).** Dort ist die Passung eindeutig (Mehrdeutigkeit 1,96, 70 % der Beobachtungen unter 10 cm, nicht gespiegelt); gegen die Wohnküche ist sie mehrdeutig (1,03), gespiegelt und IoU 0,21.
2. **Bei allen anderen 10 Aufnahmen ist die T1-Passung gegen beide Wahrheiten mehrdeutig (1,00–1,11, Gate „eindeutig“ erst ab ≈ 1,5).** Die Passung sagt dort nichts; die Zuordnung steht auf Nutzerangaben in den Dokumenten und auf Größen, die nicht von der Passung abhängen (Skizzenfläche, Selbst-Abschluss, Höhenschätzung).
3. **Sicher (Doku/Nutzer) ist nur die Wohnküche am 25.10. 16:00.** Für 26.10. (zweiter Raum) und 31.10. 11:37–14:10 (Raum B) gibt es Nutzerangaben und passende Größen, aber keinen Beleg gegen den Flur beziehungsweise die Wohnküche in den Daten. Für 29.10. 18:34 spricht mehr für die Wohnküche; 29.10. 19:23 und 31.10. 08:47 sind **offen**.
4. **Die Spanne „6–8 von 20 Ecken, 3–4 von 20 Wänden“ im Flur kommt von einem Schalter**: ohne `--karte` (ohne Gyro-Brücke) 8 Ecken / 3 Wände, mit Gyro-Brücke und gedämpfter Vorhersage (Live-Konfiguration, Stand 17) 6 Ecken / 4 Wände. Referenz ist die zweite (Abschnitt 4).

Wichtigste Einschränkung: Weder die Flur- noch die Wohnküchen-Wahrheit enthält eine Raumhöhe (`hmeas = []`), und in allen 12 Protokollen ist `hLaserMm = null`. Die „Laserhöhe 2,416 m“ der Wohnküche ist eine Nutzerangabe in der Doku (`2026-10-24-kamera-raumerfassung-android.md`, 10.17, „Tobias“), sie steht in keiner Datei. Die T2-Zeile „Höhe … gegen Laser 2.42 m“ vergleicht mit dem Vorgabewert `hFest = 2.416` (`raumskizze-metrik.mjs:24`), nicht mit einer Messung; sie taucht in keiner Tabelle unten auf, und das Hilfsskript gibt sie nicht aus.

---

## 2. Zuordnungstabelle

| # | Aufnahme (UTC) | Raum | Konfidenz | Begründung |
|---|---|---|---|---|
| 1 | 25.10. 16:00 (A7) | **Wohnküche** | **sicher (Doku/Nutzer)** | Android-Doku 10.17: „Aufnahme 7: Wohnküche mit Laser-Wahrheit … dieselbe Wohnküche wie Aufnahme 6“ (Nutzerangabe). Wahrheit-Datei gespeichert 25.10. 16:57 Ortszeit, Aufnahme 17:00–17:03. Daten stützen es nicht, widersprechen aber nicht: Skizze (alte Pipeline, vom Nutzer geschlossen) 70,6 m², 11,1 × 9,9 m gegen Wahrheit 65,9 m², 9,35 × 7,86 m; T1-Passung mehrdeutig (1,00 / 1,00), mit H = 2,416 m IoU 0,58 gegen 0,22 (Flur). |
| 2 | 26.10. 16:00 (B1600) | weder Flur noch Wohnküche („zweiter Raum“, Raum C) | **vermutet**, Flur nicht ausgeschlossen | Doku/Nutzer: Nachtbericht 27.10. („im zweiten Raum“, B1600 und B1714 „aus demselben Raum“), Android-Doku Z. 884 („ein anderer Raum, H ≈ 2,97 m angenommen“). Daten: Höhenschätzung der Seite 2,967 m (die einzige Gruppe mit ~2,97 m, alle anderen ≤ 2,62 m); Kamerahöhe p90 2,31 m, passt zu einer Decke um 3 m und nicht zu 2,416 m. Mit H = 2,97 m T1-Fläche 18,4 m² (Flur 16,6 m²), IoU Flur 0,33, Passung mehrdeutig (1,03 / 1,01). Skizze nur 5 Wände. |
| 3 | 26.10. 17:14 (B1714) | wie 2 (Raum C) | **vermutet** | Wie 2; H-Schätzung 2,975 m (2,967 und 2,975 liegen 8 mm auseinander); Skizze 34,7 m², 9,5 × 5,2 m gegen Flur 16,6 m², 7,65 × 3,60 m. Passung 1,02 / 1,03. |
| 4 | 29.10. 18:34 | **Wohnküche** | **vermutet** (mittel) | P1/P7 benutzen sie als Wohnküche, P4: „geht aus den Dokumenten nicht eindeutig hervor“. Daten: Hülle 8,79 × 7,53 m gegen 9,36 × 7,86 (Seitenverhältnis −2,0 % gegen −37,0 % beim Flur); IoU 0,49 / 0,58 (H Protokoll / H 2,416) gegen 0,31 / 0,24 (Flur). Passung mehrdeutig (1,04), Eckenzuordnung 1. |
| 5 | 29.10. 19:23 | **offen** | unsicher | Flur-IoU kippt mit H (0,56 bei H aus Protokoll, 0,24 bei 2,416), Wohnküche gespiegelt mit IoU 0,18; Passung beider 1,05 / 1,01. Skizze 26,8 m², 7,0 × 6,2 m (weder Flur noch Wohnküche). P4: „vermutlich anderer Raum“. Aufnahme nur 121 s. |
| 6 | 31.10. 08:47 | **offen (Widerspruch)** | unsicher | Weltrahmen-Doku (Stand 17) und P7 nennen sie Wohnküche; P4 zählt sie zu „anderer Raum ohne Wahrheit“. Daten tragen keine von beiden: IoU 0,45 (Flur) / 0,31 (Wohnküche), Passung 1,04 / 1,04, Skizze 36,1 m², 10,1 × 6,1 m (Wahrheit Wohnküche 65,9 m²). Das fehlende Protokoll-Gegenstück 10:25 (Hochformat, ohne Aufnahme) wird in der Doku ebenfalls „Wohnküche“ genannt. |
| 7 | 31.10. 11:37 | weder Flur noch Wohnküche („Raum B“) | vermutet (mittel) | Weltrahmen: „anderer Raum, 34 m²“. Daten: Raum schloss sich nach 97 s von selbst (`raum-geschlossen-auto`) bei 34,2 m², 7,2 × 7,1 m. Das ist 2,1× der Flur und 0,52× die Wohnküche, quadratisch statt 2,1 : 1. T1-Passung 1,02 / 1,04. |
| 8 | 31.10. 12:41 | Raum B | vermutet | Nutzer: „höchstens ~36 m²“ (Weltrahmen, Rückkehr-Abschnitt). Live 73 m² ist ein Zwei-Runden-Artefakt (643° Drehung); mit Rundenbruch 34 m². Die Ringfläche 36,6 m² (H Protokoll) / Hülle 8,7 × 7,8 m (H 2,416, IoU Wohnküche 0,64) darf deshalb nicht als Hinweis auf die Wohnküche gelesen werden. |
| 9 | 31.10. 13:30 | Raum B | vermutet | Rückkehr nach 76 s im Nachbau, 35 m² (Weltrahmen); Skizze 38,3 m², 9,9 × 5,9 m. **Hinweis offen:** zwei Abschnitte passen eindeutig (Mehrdeutigkeit 2,0 und 3,9) auf die Flur-Schmalseite (Wände T-S, S-R, U-T), keiner auf die Wohnküche (siehe Abschnitt 3.2). |
| 10 | 31.10. 14:10 | Raum B | vermutet | Rückkehr live bei 62 s, geschlossen 31,4 m² (Weltrahmen), Skizze 36,1 m², 7,2 × 7,0 m. Ein Abschnitt (Mehrdeutigkeit 4,1) passt auf die Flur-Schmalseite, wie bei 13:30. |
| 11 | 31.10. 16:25 | **Flur** | **sicher (Daten)** | Passung eindeutig (1,96, Raster 1,71), nicht gespiegelt, Beobachtungen unter 10 cm: 70 %, Median 4,7 cm; Hülle 7,00 × 3,78 m gegen Wahrheitspunkte 7,65 × 3,60 m; IoU 0,76; gegen Wohnküche 1,03, gespiegelt, IoU 0,21. Alt-Skizze 12,96 m² (Wahrheit 16,63 m²). |

„Raum B“ ist ein Arbeitsname für „der Raum der vier Querformat-Aufnahmen 11:37–14:10“. Dass die vier **derselben** Raum sind, ist **nicht** bewiesen (11:37 und 14:10 haben fast gleiche Skizzenmaße 7,2 × 7,1 / 7,2 × 7,0 m, 13:30 mit 9,9 × 5,9 m nicht).

### 2.1 Was der Nutzer bestätigen muss

1. **Raum der Aufnahme 08:47 und des Protokolls 10:25** (Wohnküche laut Weltrahmen-Doku, „anderer Raum“ laut P4; die Daten tragen keine Wohnküche).
2. **Raum der Aufnahme 29.10. 19:23** (Wohnküche, Flur, Raum B oder weiterer Raum).
3. **29.10. 18:34 = Wohnküche?** (vermutet).
4. **26.10. 16:00 und 17:14 = ein Raum mit Decke ≈ 3 m, nicht der Flur?** Der Flur ist für 16:00 nicht auszuschließen (T1 bei H = 2,97 m: 18,4 m²).
5. **31.10. 11:37, 12:41, 13:30, 14:10 = derselbe Raum (B)?** Und: lief der Weg bei 13:30 oder 14:10 auch durch den Flur (die Flur-Abschnitte in 3.2)?
6. **25.10. 08:41 (Aufnahme ohne Protokoll) und das Protokoll 31.10. 10:25 (ohne Aufnahme)**: gehören zu keiner der 11, bleiben ungeprüft (T1 braucht beides).

---

## 3. Messdaten zur Zuordnung

Befehl je Aufnahme (Standardkonfiguration des Referenzlaufs, H aus dem Protokoll, Spalten „@2,416“ mit `HOEHE=2.416`):

```
scripts/raumskizze-zuordnung.sh ~/Downloads/aufnahme-<stempel>-lauf0-video.tar ~/Downloads/raumskizze-protokoll-<stempel>.json [ausgabeordner]
```

### 3.1 T1 gegen beide Wahrheiten

Je Zelle: Mehrdeutigkeit der Passung (Gate „eindeutig“ ab ≈ 1,5), Spiegelung, Anteil der Beobachtungen unter 10 cm nach dem Heben, IoU des Exportrings, Seitenverhältnis-Abweichung der Hülle. „Ring“ ohne Wert: kein Außenring (die Karte hat nicht geschlossen). Spiegelung „g“ = gespiegelt.

| Aufnahme | Flur: Md. / <10 cm / IoU / SV | Wohnküche: Md. / <10 cm / IoU / SV | Hülle Export (m) | IoU Flur / Wohnk. @2,416 |
|---|---|---|---|---|
| 25.10. 16:00 | 1,00 g / 10 % / – / – | 1,00 / 14 % / – / – | kein Ring (11,4 × 10,6 @2,416) | 0,22 / 0,58 |
| 26.10. 16:00 | – / – / – / – | – / – / – / – | Karte divergiert (h_c 602,79 m) | 0,20 / 0,09 |
| 26.10. 17:14 | 1,02 / 21 % / 0,34 / −24 % | 1,03 / 30 % / 0,44 / +19 % | 9,04 × 6,41 | 0,25 / 0,23 |
| 29.10. 18:34 | 1,03 / 27 % / 0,31 / −37 % | 1,04 / 38 % / 0,49 / −2 % | 8,79 × 7,53 | 0,24 / 0,58 |
| 29.10. 19:23 | 1,05 g / 40 % / 0,56 / +8 % | 1,01 g / 39 % / 0,18 / +68 % | 5,71 × 2,85 | 0,24 / 0,21 |
| 31.10. 08:47 | 1,04 g / 24 % / 0,45 / −32 % | 1,04 / 24 % / 0,31 / +6 % | 7,18 × 5,71 | 0,23 / 0,27 |
| 31.10. 11:37 | 1,02 / 26 % / 0,17 / −45 % | 1,04 / 35 % / 0,30 / −14 % | 5,91 × 5,80 | 0,27 / 0,23 |
| 31.10. 12:41 | 1,00 / 17 % / 0,38 / −41 % | 1,04 g / 28 % / 0,53 / −8 % | 7,50 × 6,84 | 0,10 / 0,64 |
| 31.10. 13:30 | 1,04 g / 23 % / 0,34 / −40 % | 1,03 / 30 % / 0,25 / −6 % | 6,45 × 5,76 | 0,26 / 0,44 |
| 31.10. 14:10 | 1,04 / 25 % / 0,30 / −41 % | 1,10 / 37 % / 0,28 / −8 % | 7,60 × 6,91 | 0,45 / 0,31 |
| **31.10. 16:25** | **1,96** / **70 %** / **0,76** / 0 % | 1,03 g / 35 % / 0,21 / +56 % | 7,00 × 3,78 | 0,53 / 0,11 |

Wahrheitsmaße: Flur 7,65 × 3,60 m (aus den Wahrheitspunkten nachgerechnet, minimales umschließendes Rechteck; T2 druckt „7.69×4.15“, nach einer Definition, die ich nicht nachvollzogen habe; der Unterschied ändert keine Zuordnung), Wohnküche 9,35 × 7,86 m (T2: 9,36 × 7,86).

Lesen:
- Die einzige Zeile mit eindeutiger Passung ist 16:25 gegen den Flur. Jede andere Zahl in der Tabelle ist Zufall der Passung (Spiegelung wechselt mit H und Wahrheit). Hülle und IoU hängen an H (Fläche ∝ H²) und an der Ringgröße: ein großer, unvollständiger Ring (36–73 m²) überdeckt die 66 m² der Wohnküche leichter. Darum wurde IoU nur als Hinweis herangezogen und nie allein.
- Mit festem H = 2,416 m (Wohnküchen-Annahme) wird die Flur-Passung der Aufnahme 16:25 schlechter (Mehrdeutigkeit 1,12 statt 1,96, IoU 0,53 statt 0,76): ein Hinweis, dass die Flurdecke nicht bei 2,42 m liegt. Bewiesen ist das nicht, der Flur hat keine Laserhöhe.
- Auch H = 2,416 macht keine einzige der 10 anderen Passungen eindeutig (Mehrdeutigkeit 1,00–1,11).

### 3.2 Passung je Abschnitt (zusätzlicher Test)

Der T1-Bericht nennt je Abschnitt (zwischen zwei Ortungsbrüchen) eine eigene Passung. Zählung der Abschnitte mit Mehrdeutigkeit ≥ 2 (`out-*/{flur,wohnkueche}/bericht.txt`):

| Aufnahme | gegen Flur | gegen Wohnküche |
|---|---|---|
| 16:25 | 2 von 5 (Abschnitt 3: 26,1; Abschnitt 5: 2,4) | 0 |
| 13:30 | 2 von 6 (Abschnitt 2: 2,0; Abschnitt 4: 3,9) | 0 |
| 14:10 | 1 von 5 (Abschnitt 4: 4,1) | 0 |
| alle übrigen 8 | 0 | 0 |

Das trennt **nicht**: Ein kurzer Abschnitt aus zwei bis drei rechtwinkligen Wänden passt in jedem rechtwinkligen Raum auf einige Wandstücke (Mediane 1–5 cm auch gegen die Wohnküche), und es gibt keine Nullverteilung. Auffällig bleibt nur, dass 13:30 und 14:10 als einzige außer 16:25 Flur-Abschnitte mit Mehrdeutigkeit ≥ 2 haben, jeweils auf den Wänden T-S, S-R, U-T. Das ist eine Frage an den Nutzer (2.1, Punkt 5), kein Befund.

### 3.3 Größen unabhängig von der Passung

Aus den Protokollen (`result.room`, vom Nutzer per „Raum schließen“ geschlossene Alt-Skizze) und `result.auto.H`:

| Aufnahme | Skizze (m²) | Skizze-Hülle (m) | Wände | H-Schätzung der Seite (m) | Selbst-Abschluss |
|---|---|---|---|---|---|
| 25.10. 16:00 | 70,6 | 11,1 × 9,9 | 16 | 2,344 | nein |
| 26.10. 16:00 | 30,3 | 10,2 × 5,2 | 5 | 2,967 | nein |
| 26.10. 17:14 | 34,7 | 9,5 × 5,2 | 16 | 2,975 | nein |
| 29.10. 18:34 | 42,4 | 9,8 × 6,6 | 10 | 2,416 (geschätzt, kein Laser) | nein |
| 29.10. 19:23 | 26,8 | 7,0 × 6,2 | 9 | 2,560 | nein |
| 31.10. 08:47 | 36,1 | 10,1 × 6,1 | 10 | 2,621 | nein |
| (31.10. 10:25) | 4,5 | 4,7 × 1,1 | 6 | 2,500 | nein |
| 31.10. 11:37 | 34,2 | 7,2 × 7,1 | 10 | 2,611 | ja (`raum-geschlossen-auto`, 97 s) |
| 31.10. 12:41 | 73,2 (2 Runden) | 10,7 × 10,1 | 8 | 2,509 | Rundenbruch 34 m² (Nachbau) |
| 31.10. 13:30 | 38,3 | 9,9 × 5,9 | 8 | 2,369 | Rückkehr 76 s (Nachbau) |
| 31.10. 14:10 | 36,1 | 7,2 × 7,0 | 9 | 2,446 | Rückkehr live (`rueckkehr`, `geschlossen-nach-bruch`) |
| 31.10. 16:25 | 13,0 | 10,1 × 3,5 | 16 | 2,596 (`Hfixed`, Parallaxe nicht bestimmbar) | nein |

Wahrheit: Flur 16,63 m² (7,65 × 3,60 m), Wohnküche 65,94 m² (9,35 × 7,86 m). Nur 25.10. 16:00 liegt in der Größenordnung der Wohnküche; die vier Aufnahmen 11:37–14:10 und beide vom 26.10. liegen bei 30–38 m², also weder bei 16,6 noch bei 65,9 m². Die Alt-Skizzen sind nicht genau (Höhe aus der Kamera, fehlende Wände), aber ein Faktor 2 ist mehr als ihr Fehler. Die H-Schätzung der Seite streut ±0,3 m und ist nur als Gruppenmerkmal zu lesen (26.10. ≈ 2,97 m gegen ≤ 2,62 m sonst).

**Folgerung für P7.** P7 behandelt 26.10. 16:00 als Ausreißer („Telefon praktisch an der Decke, Raumhöhe 2,416 m, Karte divergierte mit hC 602 m“). Das setzt voraus, dass dieser Raum die Wohnküche ist. Nach 2./3. ist er es vermutlich nicht; eine Kamerahöhe p90 von 2,31 m passt zu einer Decke um 3 m. Der „Ausreißer“ ist dann kein Ausreißer, sondern ein anderer Raum mit höherer Decke.

---

## 4. Referenzlauf Flur 16:25

**Befehl** (aus dem Hauptrepo; `~/Downloads/hesterkamp-flur-2026-10-31.json` ist byteidentisch zur bisherigen Scratchpad-Kopie `wahrheit-flur.json`, md5 `67d161e38a21cbdb8866d9c07d184e66`):

```
node raumskizze-karte.mjs ~/Downloads/aufnahme-2026-10-31T16-25-49-246Z-lauf0-video.tar \
  --protokoll ~/Downloads/raumskizze-protokoll-2026-10-31T16-25-49-246Z.json \
  --wahrheit ~/Downloads/hesterkamp-flur-2026-10-31.json \
  --quelle erfassungen --ohne tiefe,ebenen \
  --karte '{"schnitt":{"gyroBruecke":true,"vorhersage":"gedaempft"}}'
```

oder `scripts/raumskizze-zuordnung.sh` (gleicher Aufruf plus die Wohnküchen-Wahrheit). Konfiguration: Erfassungen am Fadenkreuz, Gyro-Brücke an, gedämpfte Vorhersage (das ist die Live-Konfiguration ab Stand 17), kein `--H` (Höhe 2,60 m aus dem Protokoll, `result.H` = 2,596 m, eine Schätzung mit `Hfixed`, **kein** Laserwert), Seed 1, Ausrichtung quer. Lauf 1,4 s plus T2 4,0 s auf dem Mac.

**Zahlen** (T1-Bericht, Zeilen „Außenring“, „Wände“, „Passung“):

| Kennzahl | Wert |
|---|---|
| Ringpunkte (Export) | 17 (Konzept: „17 von 20“, zählt nur die Punkte des Rings) |
| **zugeordnete Wahrheits-Ecken** | **6 von 20** (fehlend 14, überzählig 11) |
| **Wandtreffer** | **4 von 20** (S-R, T-S, U-T, V-U), Präzision 22,2 % von 18 globalen Wänden, 7 Wände im Export „ungesehen“ |
| Ecken-Fehler (nur die 6 zugeordneten) | Median 3,8 cm, p90 7,8 cm |
| IoU / Fläche | 0,76 / 14,11 gegen 16,63 m² (−15,1 %) |
| Passung | Mehrdeutigkeit 1,96 (Raster 1,71), nicht gespiegelt, Maßstab 0,991 |
| Beobachtungen unter 10 cm | 70 % (144 gehoben, Median 4,7 cm) |
| Abschnitte | 16, davon verbunden 7, verbunden mit Wand 5 (`5/16` im Konzept) |

**Reproduzierbar**: Der Lauf ergab dieselben Zahlen in vier unabhängigen Aufrufen (direkter Befehl, Hilfsskript mit `--aus`, Varianten-Lauf `v0`, Hilfsskript mit relativen Pfaden); T1 benutzt weder Uhr noch Zufall in Entscheidungen. Dasselbe liefert der Aufruf ohne `--ohne tiefe,ebenen`, weil die Aufnahme keine Tiefe enthält („0 Tiefe“).

**Abnahmewerte des Konzepts (Abschnitt 1)** bleiben unverändert: Die Referenz (6 Ecken, 4 Wände) liegt in der Spanne 6–8 / 3–4. Eine Neufestsetzung nach AP1 ist nicht nötig.

### 4.1 Woher die Spanne 6–8 / 3–4 kam

Ich habe die Konfigurationen einzeln durchgerechnet (gleiche Aufnahme, gleiche Wahrheit, sonst nur der genannte Unterschied):

| Variante | Ringpunkte | zugeordnet | Wandtreffer | Präzision | Eckenfehler Median | Mehrdeutigkeit | IoU |
|---|---|---|---|---|---|---|---|
| **Referenz** (Gyro-Brücke, gedämpft) | 17 | **6** | **4** | 22,2 % | 3,8 cm | 1,96 | 0,76 |
| ohne `--karte` (keine Gyro-Brücke) | 17 | **8** | **3** | 15,8 % | 6,4 cm | 1,92 | 0,76 |
| Gyro-Brücke ohne Dämpfung | 22 | 9 | 5 | 26,3 % | 2,3 cm | 2,02 | 0,78 |
| Referenz mit `--H 2.60` | 23 | 7 | 4 | 19,0 % | 3,7 cm | 1,92 | 0,74 |
| Referenz mit `--H 2.55` | 25 | 7 | 2 | 8,0 % | 8,7 cm | 1,63 | 0,71 |
| Referenz mit `--H 2.42` | 21 | 3 | 0 | 0,0 % | 6,1 cm | 1,13 (mehrdeutig) | 0,54 |
| Referenz mit `--erfassungen alle` | 10 | 4 | 4 | 22,2 % | 3,8 cm | 1,98 | 0,67 |
| `--quelle segmente` | kein Ring | – | 2 | 6,3 % | – | 1,04 | – |
| `--quelle beide` | 19 | 6 | 4 | 8,6 % | 9,8 cm | 1,09 | 0,71 |

Ergebnis:
- **8 Ecken / 3 Wände / Präzision 15,8 % / Median 6,4 cm sind genau die Werte von P1 und P4.** Der Befehl in P1 (Konzeptdokument, Zeile „Heutige Karte auf dem Flur, so wie live“) hat kein `--karte`, also keine Gyro-Brücke; mein Lauf ohne `--karte` reproduziert dort jede genannte Zahl (8 zugeordnet, 12 fehlend, 9 überzählig, 3 Wände, Präzision 15,8 %, Median 6,4 / p90 13,5 cm, IoU 0,76, „6 Wände ungesehen“, Mehrdeutigkeit 1,92).
- **6 Ecken / 4 Wände / 22,2 % / 7 Wände ungesehen sind die Werte von P5** und stimmen in jeder genannten Zahl mit der Referenz (Gyro-Brücke an) überein. Den Befehl von P5 habe ich nicht gelesen; die Übereinstimmung aller Zahlen reicht für die Zuordnung.
- Die Gyro-Brücke (Stand 17, live seit 29.10.) verschiebt die Zuordnung also von 8 auf 6 Ecken, nicht weil die Karte schlechter wird (Eckenfehler besser, 3,8 gegen 6,4 cm, Wandtreffer besser, 4 gegen 3), sondern weil das Zuordnungsverfahren der T2-Metrik bei gleichem Ring andere Ecken innerhalb der Toleranz trifft.
- **Die Kennzahl „zugeordnete Ecken“ ist nicht robust.** 4 mm Unterschied in H (2,596 aus dem Protokoll gegen `--H 2.60`) ändern den Ring von 17 auf 23 Punkte und die Zuordnung von 6 auf 7; `--H 2.42` bricht die Passung (3 Ecken, 0 Wände). Wer gegen die Referenz misst, muss `--H` weglassen (Höhe aus dem Protokoll) oder den Wert festschreiben.
- Eine Ausnahme von der Reihenfolge der Konzeptdokumente: „17 von 20“ (Auftragswert) zählt die Ringpunkte, nicht die zugeordneten Ecken.

---

## 5. Messregister: alle Aufnahmen

Alle 11 Aufnahmen plus das Protokoll 10:25 (ohne Aufnahme). „Wahrheit“ heißt: eine Wahrheit-Datei für den Raum nach Abschnitt 2 existiert.

| # | Stempel (UTC) | Ausrichtung | Dauer | Raum (Abschnitt 2) | Wahrheit | Laserhöhe | Stuck | Haltung: Kamerahöhe Median [p10–p90] (m) | Ortungsverluste nach Start (Anzahl, Summe s) | Besonderheiten |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2026-10-25T16-00-03-803Z | Hochformat | 215 s | Wohnküche (sicher, Nutzer) | ja (Wohnküche) | 2,416 m nur als Nutzerangabe in der Doku, nicht in der Datei | unbekannt (Wohnküche „Stuck/Leisten“ nur Auftraggeber-Aussage, in keiner Datei) | 1,54 [1,27–1,68] | 2 (10,6 s) | A7; 283 Erfassungen (T1: 275 im Pool); 355 Bilder ohne Ortung |
| 2 | 2026-10-26T16-00-11-704Z | Hochformat | 170 s | zweiter Raum (vermutet) | nein | nein | unbekannt | 2,18 [1,49–2,31] | 3 (24,8 s, längster 16,0 s) | B1600; Karte divergiert mit H aus dem Protokoll (h_c 602,79 m); 782 Bilder ohne Ortung |
| 3 | 2026-10-26T17-14-12-416Z | Hochformat | 200 s | zweiter Raum (vermutet) | nein | nein | unbekannt | 1,85 [1,64–2,03] | 6 (18,0 s, je ≈ 2,4 s) | B1714 |
| 4 | 2026-10-29T18-34-22-168Z | Hochformat | 207 s | Wohnküche (vermutet) | ja, falls Wohnküche | nein | unbekannt | 1,69 [1,62–1,88] | 0 | 15 Brüche; 26 Bilder ohne Ortung |
| 5 | 2026-10-29T19-23-48-930Z | Hochformat | 121 s | offen | ? | nein | unbekannt | 1,81 [1,72–2,21] | 1 (< 0,1 s) | erste Aufnahme mit echtem Gyro; Ereignis `höhe-unbestimmt` |
| 6 | 2026-10-31T08-47-57-216Z | Hochformat | 175 s | offen (Wohnküche laut Doku) | ? | nein | unbekannt | 1,99 [1,90–2,10] | 0 | zweite Gyro-Aufnahme; `?karte=1` |
| – | 2026-10-31T10-25-18-087Z (nur Protokoll) | Hochformat | 187 s | Wohnküche laut Doku, offen | ? | nein | unbekannt | 1,76 [1,64–1,93] | 7 (31,8 s) | Aufnahme fehlt; 1070 Bilder ohne Ortung |
| 7 | 2026-10-31T11-37-44-705Z | quer | 97 s | Raum B (vermutet) | nein | nein | unbekannt | 1,97 [1,85–2,04] | 0 | schloss selbst nach 97 s |
| 8 | 2026-10-31T12-41-46-343Z | quer | 136 s | Raum B (vermutet) | nein | nein | unbekannt | 1,58 [1,47–1,63] | 0 | zwei Runden (643°), live 73 m², Rundenbruch erst in Stand 24 |
| 9 | 2026-10-31T13-30-23-531Z | quer | 112 s | Raum B (vermutet) | nein | nein | unbekannt | 1,62 [1,52–1,71] | 0 | Rückkehr knapp verfehlt (8,0° / 36 cm) |
| 10 | 2026-10-31T14-10-31-507Z | quer | 116 s | Raum B (vermutet) | nein | nein | unbekannt | 1,88 [1,79–1,97] | 1 (< 0,1 s) | Rückkehr live bei 62 s |
| 11 | 2026-10-31T16-25-49-246Z | quer | 192 s | Flur (sicher, Daten) | ja (Flur) | nein (`hmeas` leer) | unbekannt (Annahme des Auftrags: Rohbau ohne Stuck, nicht belegt) | 1,93 [1,79–2,20] | 5 (20,3 s, längster 12,0 s, letzter am Ende) | Referenzlauf; 659 Bilder ohne Ortung |

Spalte „Ortungsverluste“: Ereignisse `tracking-verloren` ab 1 s nach Sitzungsstart bis zum nächsten `tracking-zurück` (die Verluste im Start gehören zum Anlauf). Die Anzahl der Bilder ohne Ortung steht in `tracking.lost`. Die Ausrichtung quer steht in `session.quer` (fehlt vor Stand 22 = Hochformat).

**Kamerahöhe** = `py` der Zustandszeile minus Bodenhöhe `floor.pos[1]` aus dem Protokoll (der Boden-Anker). Median und p10/p90 über „saubere“ Zeilen: ohne die Flags `geschaetzt` (1), `ersatz` (4), `ersatzSchlecht` (8), `sprungHalt` (16), `pause` (32), `ohneBezug` (64); `ankerVerloren` (2) und `erfasst` (128) bleiben drin. Die Rechnung steht unten, damit sie ohne Scratchpad-Skript wiederholbar ist. Einschränkungen: (a) `floor.camHeight` (1,0–1,43 m) ist die Höhe beim Boden-Setzen, nicht die Haltung; (b) bei Bezugssprüngen verschiebt sich die Höhenebene (`dh` bis 0,39 m an 10 von 38 Brüchen laut P1), p10/p90 sind deshalb breiter als die echte Haltung; die Variante `py − Ty` (Bezugsverschiebung je Zeile) weicht im Median um 0,02–0,11 m ab (12:41: 1,48 statt 1,58; 19:23 hat bei `py − Ty` ein p10 von 0,48 m wegen eines Rahmensprungs); (c) „1,9 m“ gilt nur für 08:47, 11:37, 14:10 und 16:25; 12:41 und 13:30 liegen bei etwa 1,6 m, 25.10. bei 1,5 m.

```python
import json
p = json.load(open('raumskizze-protokoll-<stempel>.json'))
sp, z = p['zustand']['spalten'], p['zustand']['zeilen']
i = {k: n for n, k in enumerate(sp)}
floor_y = p['floor']['pos'][1]
h = sorted(r[i['py']] - floor_y for r in z if (r[i['flags']] & (1 | 4 | 8 | 16 | 32 | 64)) == 0)
q = lambda a, f: a[min(len(a) - 1, int(f * len(a)))]
print(round(q(h, .5), 3), round(q(h, .1), 3), round(q(h, .9), 3))   # Median, p10, p90
```

(Median über die sortierte Liste als `q(h, .5)`; Unterschied zum echten Median bei gerader Zeilenzahl unter 1 mm.)

---

## 6. Wahrheiten und Datenstand

| Datei | Ort | Stand | Inhalt | Anmerkung |
|---|---|---|---|---|
| `hesterkamp-flur-2026-10-31.json` | `~/Downloads/`, Kopie als `wahrheit-flur.json` im Scratchpad | 31.10.2026, gespeichert 18:06 Ortszeit (nach der Aufnahme 16:25 UTC) | 20 Ecken, 20 Wände, 50 Laserstrecken, σ̂ 6,51 mm, 16,63 m², 7,65 × 3,60 m, `hmeas` leer, md5 `67d161e3…` | Raum der Aufnahme 16:25; keine Raumhöhe; Stuck unbekannt |
| `wahrheit-hesterkamp-wohnkueche-2026-10-25.json` | Hauptrepo (ungetrackt); gleicher Inhalt wie `~/Downloads/hesterkamp-wohnkueche-2026-10-25.json` (md5 `6ce77d28…`) | 25.10.2026, 16:57–16:59 Ortszeit (vor Aufnahme 25.10. 16:00 UTC) | 24 Punkte, 14 Ecken Außenring, 81 Laserstrecken, σ̂ 5,60 mm, 65,94 m², 9,35 × 7,86 m, `hmeas` leer; dazu ein Pfeiler (0,15 m²) und ein Wandvorsprung (0,40 m²) laut Android-Doku 10.17 | Raumhöhe 2,416 m nur als Nutzerangabe in der Doku; Stuck/Leisten nur Auftraggeber-Aussage |
| `hesterkamp-wohnkueche-2026-10-25 (1).json` | `~/Downloads/` | 25.10.2026, 20:48 Ortszeit | wie oben (24 Punkte, 81 Strecken, σ̂ 5,60 mm) | andere md5 (`d3352887…`), sonst nicht verglichen |
| `hesterkamp-wohnkueche-2026-10-05.json` | `~/Downloads/` | 05.10.2026 | wie oben (24 Punkte, 81 Strecken, σ̂ 5,60 mm) | älterer Stand, nicht verwendet |

Alle Wahrheiten sind Raumaufmaß-Dateien (Datei → „Als Datei sichern“); keine ist im Repo getrackt. Eine Raumhöhe fehlt in allen.

---

## 7. Offene Punkte

- **Branch.** Der Worktree-Branch `worktree-wf_ea865b73-dfe-5` basiert auf `d147f4b` (main) und ist kein Vorfahre von `feat/raumskizze-kamera` (`git merge-base --is-ancestor HEAD feat/raumskizze-kamera` liefert 1). Er enthält deshalb weder die Raumskizze-Module noch die Konzeptdokumente. Dieses Paket besteht aus drei neuen Dateien; sie sollten auf `feat/raumskizze-kamera` per `git cherry-pick` übernommen werden, nicht per Merge.
- **Tests** liegen nur im Hauptrepo; sie laufen dort grün (`karte-pruefstand` „ALLE CHECKS GRÜN (2 offen)“, `karte-metrik`, `raumskizze-probe`: „ALLE CHECKS GRÜN“). Dieses Paket ändert keinen Code.
- **Nutzerbestätigung** der Zuordnungen laut 2.1.
- **Flur-Laserhöhe (R1)** fehlt weiter; solange sie fehlt, bleibt H im Flur geschätzt (2,596 m, `Hfixed`).
- **T2-Kennzahl** `Höhe … gegen Laser`: sollte in T2 künftig als „Vorgabewert“ statt „Laser“ ausgegeben werden (nicht Teil dieses Pakets, wegen der Verwechslung in P1/P7).
- **Fehlende Gegenstücke:** `aufnahme-2026-10-25T08-41-11-681Z-lauf0-video.tar` (ohne Protokoll) und Protokoll 10:25 (ohne Aufnahme).
