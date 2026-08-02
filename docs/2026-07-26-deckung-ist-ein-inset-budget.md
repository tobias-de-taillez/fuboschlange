# Deckung ist ein Inset-Budget, kein Verlegefehler

**Datum:** 2026-07-26 (Runde 18)
**Frage:** `covFails` steht seit vielen Runden bei 10/20. Woran liegt es?
**Antwort:** An den reservierten Randstreifen, nicht am Verlegemuster.

## Die Zerlegung

Deckung lässt sich exakt in drei Faktoren zerlegen, und alle drei sind messbar:

```
Deckung  ≈  (netto / Raum)  ×  (2·reach / s)  ×  Quote
             Inset-Budget      Dichte-Grenze     Füllgüte
```

- **netto/Raum** — wie viel der Raumfläche nach allen Insets (`edgeGap`,
  `randW`, `omegaClear`, `fieldInset`) überhaupt für Feldbahnen übrig ist.
- **2·reach/s** — was ein Bahnabstand `s` bei Wirkzone ±25 mm maximal deckt.
- **Quote** — verlegte Rohrlänge geteilt durch die Länge, die die Netto-Fläche
  bei Abstand `s` aufnimmt. Misst, ob das Muster seine Fläche wirklich füllt.

Über die 20 Bench-Läufe gemessen:

| Faktor | Median | Spanne |
|---|---|---|
| netto/Raum | **0,71** | 0,55 – 0,84 |
| 2·reach/s | 0,53 | 0,45 – 0,67 |
| Quote | **1,00** | 0,85 – 1,16 (ein Ausreißer 0,49) |

`0,71 × 0,53 × 1,00 = 0,38` — und der gemessene Median der Deckung ist 40 %.
Die Zerlegung trägt also.

## Was das ausschließt

**Die Füllgüte ist nicht das Problem.** Quote liegt bei 18 von 20 Läufen
zwischen 0,85 und 1,16: das Feld verlegt in seiner Netto-Fläche mit dem
Soll-Bahnabstand. Jede Idee der Form „das Muster füllt schlecht, wir brauchen
ein besseres Muster" ist damit gegen die Messung.

**Es gibt keine Lücken-Hotspots.** Alle erreichbaren, aber ungedeckten Zellen
nach Wandabstand gebucketed, über alle 20 Läufe:

```
randzone    57,4 % ungedeckt   (24,4 % aller Lücken)
uebergang   57,7 %             (16,7 %)
feld        57,1 %             (15,4 %)
mitte       54,3 %             (43,5 %)
```

Der ungedeckte Anteil ist in JEDEM Band gleich. Es gibt keine Stelle, an der
Fläche verloren geht — der Verlust ist gleichmäßig, also ein Dichte- und kein
Geometrieproblem. Das erledigt auch die naheliegende Vermutung, die Raummitte
oder die Notch-Ecke bleibe unbeheizt.

**Das Ziel ist fast immer erreichbar.** Eine harte Erreichbarkeits-Schranke
(Rohrmittelpunkt ≥ `edgeGap` von jeder Wand, Wirkzone 25 mm, gleiches Raster wie
`heatCoverage`) liegt bei 78–92 % der Raumfläche. Nur **ein** Lauf von 20 ist
beweisbar unerfüllbar: Lauf 9 mit `s=100`, `edgeGap=190` hat eine
Gesamtschranke von 39,8 % gegen ein Ziel von 40 %. Die übrigen neun `covFails`
sind echte Defizite, keine unmöglichen Eingaben.

## Korrektur einer Zwischenmessung dieser Runde

Ein erster Durchgang hat „Rohrlänge gegen erreichbare Fläche" gerechnet und
daraus einen effektiven Bahnabstand von 1,38·s abgeleitet, mit scheinbarer
Abhängigkeit von der Kreiszahl (1 Kreis 1,16, mehrere ~1,5). Das ist falsch: die
Rechnung teilt durch die ERREICHBARE Fläche, das Feld verlegt aber nur in der
NETTO-Fläche, und bei L-Räumen wurde zusätzlich `W·H` statt der echten
L-Fläche verwendet. Beide Fehler zusammen erzeugen genau die Scheinabhängigkeit
von der Kreiszahl, weil mehr Kreise mit größeren und häufiger L-förmigen Räumen
korrelieren. Gegen die Netto-Fläche gerechnet ist die Quote 1,00 — kein
Unterfüllen.

## Der Hebel

`insetsFor` reserviert je Rechteck:

```js
b: fieldInset(),                                        // Verteilerwand
t: S.edgeGap + (topIsOuter ? randW('top')+omegaClear('top') : 0),
l: atL ? S.edgeGap+randW('left')+omegaClear('left') : S.s/2,
r: atR ? S.edgeGap+randW('right')+omegaClear('right') : S.s/2,
```

Innere Zonenkanten bekommen `S.s/2` — korrekt, das ist genau ein halber
Bahnabstand zur Nachbarzone. Der Verlust sitzt an den AUSSENkanten, und dort in
drei Posten: `edgeGap` (90–200 mm, physikalisch nötig), `randW` (die Randzone,
die das Band selbst belegt) und `omegaClear` (Platz für die Omega-Kehren).
`fieldInset()` ist mit `omegaReach()+LANE()/2 = 237 mm` der größte Einzelposten
und liegt an der Verteilerwand.

Zwei Fragen für die nächste Runde, beide messbar:

1. **Zahlt die Randzone ihre Reservierung zurück?** `randW` wird abgezogen, damit
   die Randzone dort liegt — aber bei `randPasses = 0` liegt dort nichts. In vier
   der 20 Läufe ist `randPasses = 0`. Deckt die Randzone ihr Band tatsächlich
   dichter ab als das Feld es täte, oder ist sie netto ein Verlust?
2. **Ist `omegaClear` überall nötig?** Es reserviert Platz für Kehren, die nur an
   den Bahnenden auftreten, wird aber über die volle Kantenlänge abgezogen.

---

## Nachtrag: beide Fragen gemessen und beantwortet

**Frage 1 — zahlt die Randzone ihre Reservierung zurück?** Ja, und der Code
garantiert es schon: `randOn()` (`verlegeplan.html:419`) fordert
`S.randSpacing < S.s`. Eine Randzone, die dünner läge als das Feld, wird gar
nicht erst gebaut, und dann ist auch `randW = 0`. Das reservierte Band wird also
nur bezahlt, wenn dort tatsächlich dichter verlegt wird — Deckung im Band
`50/randSpacing > 50/s`. Netto ein Gewinn, kein Verlust. Die Frage ist erledigt.

**Frage 2 — ist `omegaClear` über die volle Kantenlänge nötig?** Konstruktiv
nein: die Omega-Kehren sitzen an den Enden der Randzonen-Ketten, `omegaClear`
wird aber als gleichmäßiges Inset über die ganze Kante abgezogen. Statt die
positionsabhängige Reservierung zu bauen, erst den Preis gemessen — `omegaClear`
pauschal skaliert:

```
Faktor        cross  cov  rad  out  medCov  medR
1,0 (jetzt)     18    10   18    0     40     42
0,5             18     9   19    0     40     42
0,0             18     9   19    0     41     42
```

Der ganze Posten ist **einen covFail wert** und kostet dabei einen radFail. Damit
lohnt die Maschinerie für eine positionsabhängige Reservierung nicht, und die
Idee ist verworfen — nicht weil sie falsch wäre, sondern weil der Preis feststeht
und zu klein ist.

## Was daraus für die Deckung folgt

Von den drei Faktoren ist damit jeder einzeln abgeklopft:

- **Füllgüte** (Quote 1,00): kein Spielraum, das Feld füllt korrekt.
- **Dichtegrenze** (2·reach/s): eine Eigenschaft der Eingabe `s`, nicht des Plans.
- **Inset-Budget** (0,71): `edgeGap` ist physikalisch, `randW` zahlt sich zurück,
  `omegaClear` ist einen covFail wert, `corridorW` ist noch nicht vermessen.

Der einzige ungemessene Posten ist damit der **Verteilerkorridor** `corridorW()`
in `fieldInset()`. Er ist der nächste und letzte Kandidat in dieser Zerlegung.
Fällt er ebenso klein aus, ist `covFails` durch Insets nicht mehr zu bewegen und
die verbleibende Stellschraube ist der Bahnabstand selbst — der aber eine
Eingabe ist, keine Entscheidung des Plans.
