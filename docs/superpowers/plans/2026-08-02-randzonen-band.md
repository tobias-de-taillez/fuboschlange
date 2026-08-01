# Randzonen-Band: Bauplan

**Datum:** 2026-08-02
**Status:** Entwurf 1 vermessen und verworfen, Entwurf 2 steht
**Vorgabe:** `docs/superpowers/specs/2026-08-02-wintergarten-drei-heizkreise.md` §3
**Messungen:** `single-loop/solver/tests/plate_spiral_facts.rs`, Commit `ba0ac84`

Vier Bahnen à 75 mm entlang eines Wandzugs, zwei hin, zwei zurück. Für den
Wintergarten läuft der Zug über drei Wände — linke Wand, obere (die 7,85-m-
Fensterfront), rechte Wand —, also ein U mit zwei freien Enden unten.

## 1. Entwurf 1 ist unmöglich — gemessen, nicht vermutet

Der erste Entwurf ging davon aus, ein Bahnwechsel sei eine einzelne
Reverse-Kante. Die überbrückt 2 oder 3 Gassen, nie 1, und über vier Bahnen
lässt das genau einen Hamiltonpfad zu: `2 → 0 → 3 → 1`. Drei Wechsel auf zwei
Enden heißt: zwei teilen sich ein Ende, und beide überspannen eine Bahn, die
die jeweils andere läuft.

Zwei Messungen schließen das:

| gemessen | Wert |
|---|---|
| Kehre kreuzt die überspannte Gasse … | 192,4 mm unter der Endpunktlinie (Teardrop), 112,4 mm (BroadReverse180) |
| zwei Teardrops eine Gasse nebeneinander berühren sich bei | 0 und 150 mm Versatz; frei erst ab 300 mm |
| Platzierungsraster längs einer Spalte | 150 mm — dazwischen gibt es nichts |

Daraus: die gekreuzte Bahn verlangt Versatz **unter 142,4 mm** (192,4 minus
50 mm Nennabstand), die beiden Kehrenkörper verlangen **mindestens 300 mm**.
Leere Menge. Die Staffelung, die Entwurf 1 aus den Kehrenüberständen ableiten
wollte, existiert nicht. Gepinnt als
`a_four_lane_band_cannot_put_two_reverses_at_one_end`.

## 2. Entwurf 2: das Band ist ein Mäander

Die 75-mm-Kehre gibt es doch — nicht als eine Kante, sondern als **drei
verkettete**. Westwärts ist die schmalste `TeardropReverse →
BroadReverse180 → TeardropReverse` (−150, +225, −150 mm) und schlägt nur
**85 mm** über ihre beiden Spalten hinaus; ostwärts schlägt die schmalste
225 mm aus. Beide reichen 192,5 mm nach Süden und 112,5 mm nach Norden.

Damit ist die Bahnfolge die naheliegende und die Vorgabe wörtlich erfüllt:

```
Bahn 0  rechts → links     Kehre 0→1 am linken Ende
Bahn 1  links  → rechts    Kehre 1→2 am rechten Ende
Bahn 2  rechts → links     Kehre 2→3 am linken Ende
Bahn 3  links  → rechts    Ausgang rechts
```

Bahnen 0 und 2 laufen hin, 1 und 3 zurück — zwei hin, zwei zurück, überall
echte 75 mm. Ein- und Ausgang liegen beide am rechten Ende, wo der Verteiler
steht.

**Das ist der Mäander, nicht die Schnecke.** `LoopPattern::Meander` gibt es
in `types.rs` bereits.

## 3. Was am linken Ende noch zu klären ist

Dort liegen zwei Kehren: 0→1 (Spalten X, X+75) und 2→3 (X+150, X+225). Keine
überspannt eine fremde Bahn — das ist der ganze Gewinn. Aber der Ausschlag
bleibt:

- 0→1 kann nicht nach Westen ausschlagen, dort ist die Wand. Nach Osten
  reicht sie bis X+160, also 10 mm über Bahn 2s Spalte.
- 2→3 schlägt nach Osten in den freien Raum aus, bis X+310.

Also braucht es weiterhin eine Staffelung, aber eine viel kleinere und aus
einem anderen Grund: Bahn 2s Ende muss über bzw. unter dem y-Bereich von
Kehre 0→1 liegen ([A−192,5, A+112,5]). Bei 150-mm-Raster heißt das ein
Versatz von 300 mm. Das ist zu **suchen**, nicht abzuleiten — wie
`walk_core` alle vier Seiten probiert und `build_from` jede Tiefe.

## 3a. Was gebaut ist, und woran es hängt

`src/circuit/band.rs` läuft alle vier Bahnen, findet die 75-mm-Kehren im
Graphen und erreicht den Verteiler an beiden Enden. Offen ist die
**Landung**.

Die kompakte Kette erreicht ihre Zielspalte über die Spalten `c−2`, `c+1`,
`c−1` — ihr eigener Körper überquert die Zielspalte also noch einmal, bevor
er dort endet. Die Bahn läuft ab der Landung nach Norden und trifft ihn:

```
lane 1 runs into edge N, laid by an earlier lane change
```

Zwei Wege, beide messbar statt zu raten:

1. **Kette mit Nord-Ausdehnung 0 bevorzugen.** Es gibt eine —
   `BroadTurn90 → BroadTurn90 → BroadReverse180`, gemessen 0,0 mm nach
   Norden — aber sie kostet 412,5 mm nach Süden und 225 mm Ausschlag. Ob ein
   größerer Wandabstand das kauft, ist zu messen.
2. **Bahnwechsel länger als drei Kanten zulassen.** `uturn_chains` nimmt die
   Länge schon als Parameter, der Walker setzt sie fest auf
   `UTURN_CHAIN_LEN`. Vier Kanten öffnen viel mehr Landungen — zu welchem
   Verzweigungspreis, ist ebenfalls zu messen.

Die drei Abnahmetests in `tests/circuit_band.rs` stehen als `#[ignore]` da,
nicht abgeschwächt: sie sind die Abnahme und laufen unverändert, sobald die
Landung sitzt.

## 4. Der Validator braucht das Mäander-Muster

`check_ring_algebra` beschreibt die Schnecke: Hinlauf in Zweierschritten,
genau eine `Turn`-Sektion, Rücklauf auswärts in Zweierschritten. Ein Mäander
läuft 0,1,2,3 in Einerschritten und hat drei Bahnwechsel. Das ist kein
Sonderfall, sondern ein zweites Muster.

- `LoopContext` bekommt `pub pattern: LoopPattern` (11 Literale im Baum).
- Für `Meander`: die gelaufenen Bahnen sind genau `0..n` in Folge, jede
  einmal; jeder Wechsel ist ein `Hop`-Block; keine `Turn`/`Return`-Sektion.
- **Nicht** aus der Bahnfolge erraten, welches Muster vorliegt — sonst geht
  eine kaputte Schnecke als Band durch.

## 5. Reihenfolge

1. `LoopContext.pattern` + Mäander-Zweig in `check_pattern_provenance`.
2. Bahn-Geometrie: aus Wandzug + Bahnzahl + Abstand die vier offenen
   U-Züge, rein arithmetisch, ohne Graph testbar.
3. Kehren-Kette: die drei verketteten Reverses im Graphen *finden*, nicht
   konstruieren — dieselbe Disziplin wie `walk_leg`s Ecke.
4. Walker: pro Bahn drei Legs, dazwischen die Kehren; Staffelung als
   gesuchter Parameter in 150-mm-Schritten.
5. Anbindung an den Verteiler an beiden Enden derselben Seite.
6. Abnahme: `certify_loop` liefert `Ok`, vier Bahnen, genau drei
   Bahnwechsel als `Hop`-Blöcke, Länge ≈ 55 m auf dem Wintergarten. Die
   Strafsumme wird **gemessen und festgeschrieben**, nicht auf 0 gesetzt —
   drei Kehren auf zwei Enden bei 75 mm werden Unterschreitungen des
   50-mm-Nennabstands erzeugen.

## 6. Sackgassen, die nicht noch einmal gelaufen werden müssen

- „Bahn 0 → 1 → 2 → 3 der Reihe nach mit Reverse-Kanten" — es gibt keine
  75-mm-Reverse-Kante.
- „Alle Bahnenden bündig" — die beiden Kehren am selben Ende berühren sich.
- „Staffelung aus den Kehrenüberständen ableiten" — Entwurf 1, §1: die
  verlangten Fenster überschneiden sich nicht.
- „Bahnen umnummerieren, damit die Schnecken-Ringalgebra durchgeht" — das
  löscht die Prüfung und lässt das Zertifikat trotzdem
  `pattern_provenance_ok: true` melden.
