# Randzonen-Band: Bauplan

**Datum:** 2026-08-02
**Status:** durchgerechnet, nicht gebaut
**Vorgabe:** `docs/superpowers/specs/2026-08-02-wintergarten-drei-heizkreise.md` §3

Vier Bahnen à 75 mm entlang eines Wandzugs, zwei hin, zwei zurück. Für den
Wintergarten läuft der Zug über drei Wände — linke Wand, obere (die 7,85-m-
Fensterfront), rechte Wand —, also ein U mit zwei freien Enden unten.

## 1. Die Bahnfolge ist erzwungen, nicht gewählt

Bahnen 0…3 von der Wand nach innen. Ein Kreis ist **ein** Rohr, also muss er
alle vier nacheinander durchlaufen, und jeder Wechsel ist eine Kehre. Die
Reverse-Familie überbrückt **2 oder 3 Gassen, nie 1** (gemessen,
`tests/plate_spiral_facts.rs`) — bei 75 mm Bahnabstand heißt das: Schritte von
±2 oder ±3 Bahnen, niemals ±1.

Hamiltonpfade über {0,1,2,3} mit Schritten aus {±2, ±3}:

```
1 → 3 → 0 → 2     (+2, −3, +2)
2 → 0 → 3 → 1     (−2, +3, −2)
```

Mehr gibt es nicht. Beide erfüllen die Vorgabe „zwei hin, zwei zurück"
(Bahn 1 und 0 führen weg, 3 und 2 zurück) und beide lassen Ein- und Ausgang
am **selben** Ende des Zuges liegen — was nötig ist, weil beide zum selben
Verteiler müssen.

Kehrenspannen: 2 Gassen = 150 mm = `TeardropReverse`, 3 Gassen = 225 mm =
`BroadReverse180`. Beide existieren.

## 2. Der harte Punkt: die Kehren liegen übereinander

Bei `1 → 3 → 0 → 2` liegen die Kehren abwechselnd an den Enden:

| Kehre | Ende | überspannt Bahnen |
|---|---|---|
| 1 → 3 | rechts | 1, 2, 3 |
| 3 → 0 | links | 0, 1, 2, 3 |
| 0 → 2 | rechts | 0, 1, 2 |

Am rechten Ende liegen **zwei** Kehren, und ihre Spannen überlappen sich in
den Bahnen 1 und 2. Eine Kehre ist radial — sie kreuzt jede Bahn zwischen
ihren Enden. Also gilt dasselbe wie in der Mitte der Schnecke: **eine Kehre
darf nur dort liegen, wo die gekreuzten Bahnen noch nicht bzw. nicht mehr
existieren.**

Daraus folgt zwingend: **die Bahnenden sind gestaffelt**, nicht bündig. Jede
Bahn endet ein Stück weiter vom Ende entfernt als die, die von einer späteren
Kehre gekreuzt wird. Handwerklich ist das genau das aufgefächerte Bild, das
man an einer Randzone sieht.

Die Staffelung ist zu vermessen, nicht zu schätzen: der Körper einer
`TeardropReverse` reicht 192 mm über ihre Endpunkte hinaus, eine
`BroadReverse180` 112 mm (gemessen, siehe `circuit::schnecke`). Die Prüfung
dafür existiert schon — `turn_clears_its_own_lane`, achsenrichtig — und muss
hier gegen die *Nachbarbahn* statt gegen die eigene laufen.

## 3. Was wiederverwendet wird

Der Walker ist nah an dem der Schnecke, nur auf einem offenen Zug statt einem
geschlossenen Rechteck:

- `walk_leg(index, pose, leg, claim)` — läuft Geraden auf einer Gasse und
  nimmt die Ecke auf die nächste. Für jede Bahn dreimal: hoch die linke
  Spalte, quer die obere Zeile, runter die rechte Spalte.
- `walk_turn(index, pose, leg, landing, claim)` — findet die Reverse-Kante
  auf die Zielgasse. Für die drei Bahnwechsel.
- `Claim` / `point_on_rect_boundary` — die Bahnzuordnung entscheidet weiter
  die Geometrie, nicht die Position im Ablauf.

Alle drei sind heute privat in `src/circuit/schnecke.rs`. Das Band gehört
entweder in dieses Modul oder die Helfer werden `pub(crate)`.

## 4. Reihenfolge

1. Bahnfolge und Gassen aus Wandzug + Bahnzahl + Abstand berechnen (rein
   arithmetisch, testbar ohne Graph).
2. Staffelung der Bahnenden aus den gemessenen Kehrenüberständen ableiten.
3. Walker: pro Bahn drei Legs, dazwischen die Kehren.
4. Anbindung an den Verteiler an beiden Enden derselben Seite.
5. Abnahme: `certify_loop` liefert `Ok`, vier Bahnen, genau drei Kehren,
   Länge ≈ 55 m auf dem Wintergarten, Strafsumme 0.

## 5. Warum das hier steht statt im Code

Die Analyse in §1 und §2 ist das eigentlich Schwierige und war ohne
Messungen nicht zu haben. Sie hier abzulegen kostet nichts und spart der
nächsten Sitzung, dieselbe Sackgasse noch einmal zu durchlaufen — insbesondere
den naheliegenden, aber falschen Ansatz „Bahn 0 → 1 → 2 → 3 der Reihe nach",
der an der 75-mm-Kehre scheitert, und den zweiten, „alle Bahnen bündig
enden lassen", der an §2 scheitert.
