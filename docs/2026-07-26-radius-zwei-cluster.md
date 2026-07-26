# Das Radius-Gate hat zwei Cluster, und einer ist ein Messmodell-Effekt

**Datum:** 2026-07-26 (Runde 24)
**Stand:** crossFails 12/20, covFails 7/20, radFails 17/20, outFails 0/20

## Die Attribution auf dem aktuellen Stand

Nach Ausgangsschlitz, Korridor 0,3 und dem `omegaOn`-Fix neu attribuiert.
17 radFails, je Teilstück: **field 14, rand 2, leadOut 1**. Nach Ablenkwinkel
zerfallen sie sauber in zwei Gruppen:

**Cluster A — 180°-Nadeln (8 von 17), Radius 0 bis 20 mm**

```
soll ist Teil     defl  ab    bc    Wand  Lage%  Punkt          Raum
 100   1  field    180   508   519    60    18%  (2176,2590)    6650x2650
  85   1  field    180   495   525   143    21%  (5848,143)     7550x3550
  80   0  rand     180   423   426   110     2%  (10690,341)    10800x3900
  60   0  rand     180   311   308   245    16%  (245,4319)     4100x4600
  80   5  field    178   390   422   170    50%  (484,2330)     4550x2500
  80   6  field    178  2210   368   190     2%  (190,2329)     11250x2550
  85   9  field    178   435   401   265    28%  (6636,935)     7100x1700
  60  20  leadOut  173   341   327   200    97%  (4150,3095)    4700x3650
```

Beide Schenkel 300 bis 530 mm, seitlicher Versatz praktisch 0 — das Rohr läuft
hinaus und auf demselben Weg zurück. **Alle acht liegen an einer Wand**
(Abstand 60 bis 265 mm, `edgeGap` ist im Bench 90 bis 200 mm), und die Mehrheit
früh im Pfad.

`pathCurve` liefert an einer 180°-Ecke `r = min(ab,bc)/tan(90°) = 0`,
unabhängig von den Schenkellängen. Diese acht sind damit nicht "knapp zu eng",
sondern **nicht baubare Geometrie**: eine wandparallele Kehre zwischen zwei
Bahnen im Abstand `d < 2R`.

**Cluster B — 144° bis 164° (8 von 17), Radius 43 bis 57 mm**

Ein Nachbarsegment 150 bis 190 mm, also 1,7 bis 2,4·s. Das ist die
Ring-zu-Ring-Naht aus Runde 16, unverändert.

Der Rest ist ein Einzelfall (164°, beide Schenkel > 400).

## Was daraus folgt

Für Cluster A existiert die Lösung im Code bereits: die **Omega-Kehre**
(`omegaTurn`) baut genau diese Wende als drei tangentiale Bögen, wenn
`d < 2R`. Sie bekommt aber nur die Randzone, und auch dort nur unter
`omegaOn() = randPasses>1 && randSpacing/2 < bendRadius`. Das Feld und die
Anbindung haben keine.

Der nächste Schritt ist damit benannt: **jede wandparallele 180°-Wende mit
`d < 2R` muss eine Omega-Kehre bekommen, nicht nur die der Randzone.**

## Verworfen in dieser Runde

**Biarc-Zeichnung, endgültig.** Der Preis ist abgesteckt, ohne die asymmetrische
Variante zu bauen: selbst mit einer Toleranz von 0,85·s — mehr als die
Eckgeometrie überhaupt hergibt — bleibt der Biarc schlechter als Catmull-Rom.

```
tol            cross  cov  rad  out  medianRadius
0,35*s           13     7   20    0       31
0,45*s           13     7   20    0       33
0,50*s           15     7   20    0       36
0,60*s           14     7   20    0       39
0,70*s           14     7   19    0       46
0,85*s           15     7   18    1       59
Catmull-Rom      12     7   17    0       50
```

Am konvexen Eck eines rektilinearen Offsets liegt die innere Nachbarecke
`s·√2 ≈ 1,41·s` entfernt statt `s` — dort wäre also eine Toleranz von rund
`0,7·s` zulässig statt `0,45·s`. Genau diese Zeile ist gemessen: `rad 19`,
`cross 14`. Ein asymmetrischer Biarc, der diese Freiheit ausschöpft, könnte die
Zeile bestenfalls erreichen — und sie ist schlechter als der Default. Die
Implementierung ist damit gespart.

**Lobe-Schwelle im `rectiOffsetter`.** Vermutung: ein L-Ring läuft durch einen
beliebig dünnen Hals, weil die Lobe erst bei `eps` als geschlossen gilt.
Schwelle auf `1·R` und `2·R` gesetzt — beide Male exakt `12/7/17`, nur
`medianRadius` 50 → 52 bei 2·R. Kein Gewinn, verworfen.
