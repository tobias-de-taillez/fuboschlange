# Radius-Attribution: zwei Proben, zwei Populationen

**Datum:** 2026-07-26
**Anlass:** Zwei parallel laufende Sessions haben in derselben Stunde den Ort des
Radius-Minimums gemessen und kommen zu unvereinbaren Ergebnissen. Dieses Dokument
löst den Widerspruch auf, damit die nächste Runde nicht auf der falschen Zahl
aufsetzt.

## Die zwei Befunde

**A — `probe-radius.mjs` (Commit 4cd4d9f):** alle 20 schlimmsten Punkte sind
Ecken, in drei scharfen Gruppen — 7× `defl 90°, ab 50, bc 160, Wandabstand 90`
(→ r=50, als MANIFOLD_PITCH gedeutet), 6× `defl 135°, ab 81` (→ r=34), 5×
`defl 175–180°` mit Schenkeln im Meterbereich.

**B — Attribution über die Bench-Konfigurationen (Commit 4aa8d3a):** 15 von 19
im Feld, 3 im leadIn, 1 in der Randzone; 11 der 19 mit derselben Signatur
`defl 144–155°` und einem Nachbarsegment von 140–240 mm = 1,7–2,4·s.

## Warum beide recht haben

Die Krümmungsregel ist in beiden Proben Zeichen für Zeichen dieselbe (die aus
`pathCurve`), und beide nehmen den globalen argmin über `plan.loops[*].pts`.
Der Unterschied liegt **vollständig in der Parametererzeugung**:

| | `probe-radius.mjs` | Bench-Attribution |
|---|---|---|
| Konfigurationen | eigener PRNG, Seed 12345 | `crossingBench(20, 20260725)` — dieselben Sätze wie das Gate |
| `bendRadius` | fest 80 mm | 60/70/80/85/100, aus `pipeDia` abgeleitet |
| Notch | **immer** (`notchA` 800–2300) | in 8 von 20 Läufen **keiner** |
| `s`, `randPasses`, `windowEdges`, `loopMode`, `edgeGap`, `pipeDia` | nie gesetzt, bleiben auf den Projekt-Defaults | alle je Lauf gestreut |

`probe-radius.mjs` misst damit eine schmale Umgebung der Projektkonfiguration,
nicht die Population, gegen die `radFails` zählt. Die drei "scharf getrennten
Gruppen" mit exakt wiederkehrenden Werten (50, 81, 90 mm) sind genau das Symptom
dieser Enge: konstante Parameter erzeugen konstante Geometrie.

## Was daraus folgt

- Die Rechnung **"Gruppe 1 und 2 sind zusammen 13 von 20, also kann radFails
  nicht unter 13/20 fallen"** überträgt sich nicht auf den Bench. In der
  Bench-Population hat genau **ein** Lauf `defl 90°`, und kein einziger die
  81-mm-Signatur.
- Der billige Vorschlag aus 4cd4d9f (die 90-Grad-Wende am Verteiler auf zwei
  45-Grad-Knicke verteilen) adressiert damit einen Posten, der im Bench 1/19
  groß ist, nicht 7/20. Er kann trotzdem richtig sein — aber als
  leadIn-Verbesserung, nicht als größter Einzelposten.
- Der größte Einzelposten im Bench bleibt der **Ring-zu-Ring-Sprung an der
  Naht**: 11 von 19, Signatur `defl 144–155°` mit Nachbarsegment 1,7–2,4·s.

## Regel für die nächste Probe

Eine Diagnose-Probe erzeugt ihre Parameter **nicht selbst**. Sie läuft über
`crossingBench(n, seed)` und liest den `all`-Kanal, sonst misst sie eine andere
Frage als die, die das Gate stellt. Wo zusätzliche Felder gebraucht werden,
gehört ein Patch auf eine Kopie der Datei in den Scratchpad — nicht ein zweiter
Generator.

## Nebenbefund: zwei Sessions, ein Arbeitsverzeichnis

Beide Sessions haben zwischen 00:05 und 00:15 `verlegeplan.html` geschrieben.
Sichtbare Folgen: ein `git checkout` der einen Session hat der anderen mitten im
Lauf eine Funktion entfernt (deren zwei Benchläufe sind dadurch ungültig, nicht
neutral), und eine ungemessene Arbeitskopie-Änderung der einen wurde von der
anderen als „unbekannt" gesichert. Messungen aus diesem Fenster sind nur gültig,
wenn die gemessene Datei nachweislich stabil war — für beide oben zitierten
Attributionen wurde das nachträglich gegen `git show HEAD:verlegeplan.html`
geprüft (identische MD5, Probe reproduziert).

---

## Nachtrag: die Naht ist entfernbar, aber nicht bindend

Die Attribution sagt „Ring-zu-Ring-Sprung = 11 von 19". Die Morph-Spirale löscht
diesen Sprung vollständig — trotzdem fällt `radFails` nur von 19 auf 17, nicht
auf 8. Diese zwei Zahlen vertragen sich nicht, also je Lauf gepaart (gleicher
Seed, gleicher Index, MD5 der gemessenen Datei vor und nach dem Lauf identisch):

```
geheilt 2   bleibt 17 (davon Teil gewechselt 1)   neu 0
```

Und die Signatur der 17 wandert dabei systematisch:

| Lauf | Ringe | Morph |
|---|---|---|
| 3 | `field 147° ab230 bc173` → 52 | `field 157° ab279 bc64` → 13 |
| 5 | `field 153° ab402 bc190` → 45 | `field 110° ab1530 bc88` → 61 |
| 8 | `field 144° ab470 bc154` → 50 | `field 137° ab62 bc1325` → 25 |
| 12 | `field 145° ab380 bc140` → 44 | `field 95° ab561 bc67` → 62 |

Unter der Morphung ist die Ablenkung deutlich kleiner (95–137° statt 144–155°),
dafür ist ein Nachbarsegment **kurz** (60–130 mm statt 140–240 mm). Der Engpass
ist nicht mehr der Sprung, sondern die **Ecke des Offset-Rings selbst**, mit
~2·R Abtastung.

**Konsequenz — und sie ist die wichtigste dieser Runde:** `radFails` ist kein
Gate mit einer Ursache, sondern ein Minimum über viele Stellen, die alle knapp am
Limit liegen. Wird eine Klasse beseitigt, übernimmt die nächste. Jeder Ansatz der
Form „diese eine Stelle reparieren" kann deshalb höchstens ein paar Läufe
gewinnen — gemessen: 2 von 19. Was zählt, ist ein Verfahren, das den **Boden**
hebt.

Die Literatur hat dafür genau einen Schritt, den dieser Code noch nicht hat:
Held & Spielberger, Schritt 6 — die Polyline mit **tangentialen Kreisbögen**
glätten, Radius per Binärsuche in `[r_min, r_max]`. Nicht glätten im Sinne von
Punkte verschieben (das ist `smoothToRadius`, ausgereizt), sondern an jeder Ecke
einen **echten Bogen mit garantiertem Radius** einsetzen. `pathCurve` hat den
Kanal dafür bereits: ein Punkt mit `arc`-Eigenschaft wird mit seinem eigenen
Radius gezählt (`if(B.arc){ minR=Math.min(minR,B.arc.r); continue; }`), genau wie
die Omega-Kehren der Randzone. Ein Ring, dessen 90-Grad-Ecken als `arc`-Punkte
mit `r = bendRadius` vorliegen, kann an diesen Ecken gar nicht mehr durchfallen.

Preis: der Bogen schneidet die Ecke ab, dort bleibt Fläche unbeheizt — genau der
Grund, aus dem der Straight-Skeleton-Offset die Isolinien abgelöst hat. Das ist
aber kein Argument gegen den Bogen, sondern Physik: ein Rohr macht keine
90-Grad-Ecke. Der Plan zeichnet dort heute etwas, das nicht verlegbar ist.

## Nachtrag 2: der Deckungsverlust der Morphung ist universell

Aus demselben gepaarten Lauf, Deckung je Lauf, Ringe → Morph:

```
 0 R 25→19   1 L 41→22   2 L 47→38   3 L 42→33   5 L 32→24   6 R 42→37
 7 R 35→25   8 L 40→34   9 R 27→22  10 L 40→33  11 L 43→36  12 L 46→44
13 L 36→30  14 R 35→31  15 R 47→44  17 R 41→40  18 R 36→32  19 L 38→30
```

**18 von 20 Läufen verlieren Deckung, Rechtecke wie L-Formen.** Kein einziger
gewinnt. Damit ist der Topologiewechsel als Erklärung endgültig erledigt — er
kommt in acht dieser Läufe gar nicht vor.
