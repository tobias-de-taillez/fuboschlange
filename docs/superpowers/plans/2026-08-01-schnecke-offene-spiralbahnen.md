# Schnecke: von Ringen auf offene Spiralbahnen — Bauplan

**Datum:** 2026-08-01
**Status:** **gebaut** — `src/circuit/schnecke.rs`, zertifiziert in
`tests/circuit_schnecke.rs`
**Auslöser:** `a_four_ring_spiral_crosses_itself_and_the_validator_catches_it`
(`tests/circuit_loop_end_to_end.rs`) — der vierringige Arm kreuzt bei
(1162,5 | 487,5) die Bahn, die der Rücklauf später belegt.

> **Korrekturhinweis.** Die §§2, 2a und 6a dieses Plans waren in ihrer
> ursprünglichen Fassung sachlich falsch — beide auf abgeleiteten statt
> gemessenen Annahmen. Die Messungen stehen jetzt als Test in
> `tests/plate_spiral_facts.rs`; die Abschnitte unten sind entsprechend
> korrigiert und die verworfenen Annahmen ausdrücklich benannt, damit sie
> niemand rekonstruiert.

## 1. Warum das Ringmodell kreuzen muss

`build_lanes` liefert **geschlossene** Ringe. Ein Arm, der von Ring k auf
Ring k+2 wechselt, braucht dafür ein Querstück (Hop), und dieses Querstück
überquert Ring k+1 — die für den Rücklauf reservierte Bahn. Das ist kein
Implementierungsfehler, sondern eine Eigenschaft des Ringmodells: Solange
die Windungen geschlossen sind, muss der Einwärtsweg irgendwo über sie
hinweg.

Eine echte Schnecke hat dieses Problem nicht, weil sie keine Ringschar ist,
sondern **eine fortlaufende Spirale**. Zwei Spiralen gleicher Steigung, um
die halbe Steigung versetzt, kreuzen sich nie — wie die zwei Gänge einer
zweigängigen Schraube. So beschreibt es auch das Schlüter-Handbuch (S. 27,
siehe `docs/superpowers/research/2026-07-31-schneckenverlegung-handwerk-praxis.md`).

## 2. Was der Katalog hergibt (gemessen)

**Verworfen:** Die ursprüngliche Fassung behauptete, eine Rechteckspirale
brauche entlang einer Seite einen richtungserhaltenden Querversatz
(„S-Schlag" aus zwei `BroadTurn45`), und ein solcher Versatz sei erst ab
150 mm darstellbar.

**Beides ist falsch.** Gemessen am zertifizierten Graphen des
3000 × 2400-Fixtures:

1. **Eine Rechteckspirale braucht überhaupt keinen Querversatz.** Die
   Einrückung passiert in der Ecke: eine `BroadTurn90` verbindet *irgendeine*
   Zeilengasse mit *irgendeiner* Spaltengasse zulässiger Parität. Die Ecke
   unten links führt also von der linken Spalte der Windung j direkt auf die
   untere Zeile der Windung j+1. Kein S-Schlag, keine Diagonale.
2. **Der kleinste umkehrfreie richtungserhaltende Querversatz ist 300 mm**
   (vier Gassen), realisiert als `BroadTurn90`-Paar. 150 mm gibt es nicht,
   und über einen `BroadTurn45` läuft keine einzige erreichbare Kette.

Die Paritätsklassen der Ecken (`tests/plate_spiral_facts.rs`):

| Ecke (Heading-Paar) | Gassendifferenz |
|---|---|
| `Deg0→Deg90`, `Deg90→Deg0`, `Deg180→Deg270`, `Deg270→Deg180` | gerade |
| die übrigen vier | ungerade |

Rundherum komponiert ergibt das: **die nächste Windung liegt eine gerade
Zahl von Gassen weiter innen.** Der Einwärtsschritt ist also immer ein
Vielfaches von 150 mm — nicht weil der Katalog nichts Feineres kann,
sondern weil die Eckparitäten sich sonst nicht schließen.

## 2a. Die zwei Arme

Arm B ist Arm A, auf jeder Seite um eine Gasse nach innen versetzt. Dessen
Ecken existieren: pro Heading-Paar haben 473 von 504 Platzierungen ihren
diagonalen `(+1, +1)`-Zwilling.

Beide Arme bilden **eine** Verschachtelungsfolge, keine zwei unabhängig
belegten Ringmengen: Bahn 2k gehört dem Vorlauf, Bahn 2k+1 dem Rücklauf,
Bahn j+1 liegt echt in Bahn j. Die Reservierung ist damit strukturell
statt geprüft.

## 3. Die Kehre — der eigentlich harte Punkt

**Verworfen:** §6a behauptete, bei 75 mm überspringe die Kehre eine Spur
(`TeardropReverse`, 150 mm, Rücklauf beginnt auf Spur k−2). Das ist ein
Paritätsfehler: k−2 hat dieselbe Parität wie k, ist also wieder eine
*Vorlauf*spur. Die Kehre muss die Parität wechseln.

Die Sachlage, korrekt:

- Bahnen liegen echt ineinander. Die beiden Enden der Kehre sind deshalb
  **immer benachbart in der Verschachtelungsordnung** — man kommt an einer
  Bahn nicht vorbei, ohne sie zu kreuzen. Die Kehre überspannt also genau
  einen Verschachtelungsabstand.
- Die Reverse-Familie überbrückt **zwei Gassen (150 mm, `TeardropReverse`)
  oder drei (225 mm, `BroadReverse180`)** — nie eine. Eine 75-mm-Kehre wäre
  ein Biegeradius von 37,5 mm gegen 80 mm Minimum; physikalisch unmöglich,
  kein Katalogmangel.

Daraus folgt die Konstruktion: **der innerste Abstand allein wird
aufgeweitet**, alle übrigen behalten den gewünschten Verlegeabstand.

| Verlegeabstand | Gassen | innerster Abstand | Kehre |
|---|---|---|---|
| 75 mm | 1 (ungerade) | 3 Gassen = 225 mm | `BroadReverse180` |
| 150 mm | 2 (gerade) | 2 Gassen = 150 mm | `TeardropReverse` |
| 225 mm | 3 (ungerade) | 3 Gassen = 225 mm | `BroadReverse180` |
| 300 mm | 4 (gerade) | 2 Gassen = 150 mm | `TeardropReverse` |

Der Einwärtsschritt des Vorlaufs bleibt dabei gerade (Verlegeabstand +
Kehrenspanne), die Eckparitäten schließen sich also weiterhin. Der Preis
ist ein freier Kern in der Raummitte — genau dort, wo die Wendeschleife
läuft und wo der Boden über die Kehre ohnehin am wärmsten ist.

## 4. Gebaut

`src/circuit/schnecke.rs`, `build_schnecke(field, pipe_spacing_mm,
wall_clearance_mm, graph, view, zone, instance) -> Result<Schnecke, LoopError>`.

- Bahnnummerierung = Verschachtelungsindex, gerade = Vorlauf, ungerade =
  Rücklauf. Damit hält die Ringalgebra des Validators ohne Übersetzungsschicht.
- Ecken werden **abgefragt, nicht abgeleitet** — dieselbe Disziplin wie in
  `fields.rs`.
- Die Bahnzuordnung einer Kante entscheidet die **Geometrie**: eine Kante
  beansprucht eine Bahn nur, wenn beide Endpunkte auf deren Rechteck liegen.
  Der Rest ist `SectionKind::Hop`. Das ist ehrlich und kann nicht
  auseinanderdriften, weil es dasselbe Prädikat benutzt wie der Validator.
- Tiefste Verschachtelung zuerst; die erste, die durchläuft, gewinnt.
  Beide Paritäten des äußersten Rings werden probiert.
- Beide Port-Zuordnungen werden probiert; gewählt wird die mit der kürzeren
  Summe Port→Anker. Die andere lässt die beiden Anschlussstücke einander
  kreuzen.

### 3a. Die Kehre darf ihre eigene Bahn nicht treffen

Eine Reverse-Platzierung liegt nicht zwischen ihren Endpunkten: die
`TeardropReverse` schlingt bis zu 192 mm darüber hinaus, die
`BroadReverse180` 112 mm. Beide Enden sitzen auf einer Spalte — was der
Überstand also treffen kann, ist die untere oder obere **Zeile derselben
Bahn**. Bei 150 mm Verlegeabstand tut er das auch: die innerste Bahn ist
dort nur 225 mm hoch, die Kehre sitzt zwangsläufig direkt an ihrer
Unterkante, und der Schwanz der Tropfenschleife landet exakt darauf.

`turn_clears_its_own_lane` verwirft solche Platzierungen (Abstand < 50 mm,
Spec §5). Die Verschachtelung fällt dann um eine Windung zurück, statt eine
sich kreuzende Schleife zu liefern.

## 5. Abnahme — erreicht, aber anders als hier ursprünglich formuliert

**Klarstellung.** §4 dieses Plans forderte, den Test
`a_four_ring_spiral_crosses_itself_and_the_validator_catches_it` umzudrehen.
Das ist **nicht** passiert und soll auch nicht passieren: Die Schnecke steht
*neben* `spiral.rs` statt an dessen Stelle. Jener Test beschreibt weiterhin
korrekt, was das Ringmodell tut, und bleibt auf `SELF_INTERSECTION` stehen.
Die Abnahme der Schnecke ist `tests/circuit_schnecke.rs`.

`tests/circuit_schnecke.rs`, Raum 3000 × 2400, Verlegeabstand 75 mm,
Wandabstand 75 mm, Anschluss mittig an der Unterkante (Zone 600 × 225):

- `certify_loop` liefert `Ok`.
- **11 Bahnen**, Gesamtlänge **67 421 mm** (< 100 m).
- Strafsumme 0 mm, minimaler Biegeradius ≥ 80 mm.
- Alle Abstände außer dem innersten genau eine Gasse; der innerste drei.
- Vorlauf 0, 2, 4, 6, 8, 10; Rücklauf 9, 7, 5, 3, 1.
- Kehre: genau eine `BroadReverse180`.

Die ganze Leiter, im selben Testlauf zertifiziert:

| Verlegeabstand | Bahnen | Länge | schlechtester Deckungspunkt |
|---|---|---|---|
| 75 mm | 11 | 67 421 mm | 354,6 mm |
| 150 mm | 5 | 32 116 mm | 519 mm |
| 225 mm | 5 | 27 145 mm | 616 mm |
| 300 mm | 3 | 18 890 mm | 663 mm |

`tests/plate_spiral_facts.rs` pinnt die drei Messungen, auf denen das ruht.

## 6. Was offen bleibt

- **Seite der Kehre.** Die Kehre sitzt immer auf der linken Spalte. Bei
  75 mm kostet das nichts — dort begrenzt die *Eckenreichweite* die Tiefe,
  nicht die Kehre (Bahn 12 und 14 scheitern beide an einer fehlenden Ecke).
  Bei 150 mm dagegen ist die Kehre der Engpass: die innerste Bahn ist breit
  und flach, auf der langen Seite wäre Platz, auf der kurzen nicht — das
  kostet dort zwei Bahnen (5 statt 7). Die Kehre auf der Seite mit Platz zu
  legen ist der lohnendste nächste Schritt, kostet aber Deckung auf der
  innersten Rücklaufbahn: der Rücklauf beginnt dann mitten in seiner Windung
  und legt die vorangehenden Seiten nicht mehr.
- **Deckung bei 75 mm.** Schlechtester Punkt 354,6 mm (Raumecke). Ursache:
  die äußerste Windung ist zweifach unterbrochen — von der Anschlusszone
  *und* von der Naht in der Ecke unten links —, sodass die unterste Zeile
  nur östlich der Zone liegt. Ein mittiger Anschluss erzwingt das bei diesem
  Nahtschema. Untere Schranke bei vollständigem Außenring wären ~219 mm.
- **Wickelrichtung.** Nur gegen den Uhrzeigersinn gebaut. Bei einem
  Anschluss nahe der linken oder rechten Wand wäre die Gegenrichtung deutlich
  besser; die Spiegelung der Legs steht noch aus.
- **Zonentiefe.** Sie muss die zwei äußersten Bahnen durchtrennen, aber die
  dritte nicht — sonst kann der Arm nicht daran vorbei. Das ist
  `wall_clearance + 1,5 × Verlegeabstand`, im Test so gesetzt. Diese Kopplung
  gehört in die Eingabeprüfung, statt dem Aufrufer überlassen zu bleiben.
- **Nur Rechtecke.** `build_schnecke` nimmt ein `Field`, also ein Rechteck.
  Für verwinkelte Räume zerlegt `decompose_fields` schon in Rechtecke, aber
  die Verkettung mehrerer Felder zu *einem* Kreis fehlt.
- **`spiral.rs` bleibt unangetastet.** Der suchbasierte Pfad und seine Tests
  laufen weiter; die Schnecke steht daneben. Zusammenführen später.
