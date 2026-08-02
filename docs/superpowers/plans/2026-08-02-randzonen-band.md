# Randzonen-Band: Bauplan

**Datum:** 2026-08-02
**Status:** Entwurf 2 gebaut bis auf den letzten Bahnwechsel (§3a)
**Vorgabe:** `docs/superpowers/specs/2026-08-02-wintergarten-drei-heizkreise.md` §3
**Messungen:** `single-loop/solver/tests/plate_spiral_facts.rs` (9 Fakten)

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

Die 75-mm-Kehre gibt es doch — nicht als eine Kante, sondern als **Kette**.
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

## 3. Was eine Kehrenkette wirklich kostet

Der Ausschlag ist beidseitig, und die erste Notiz hier hat das unterschätzt:
gemessen wurde nur der *größere* der beiden Überstände. Die kompakte
Drei-Kanten-Kette `TeardropReverse → BroadReverse180 → TeardropReverse` steht
85 mm über die eine und 75 mm über die andere ihrer beiden Spalten hinaus —
**235 mm Gesamtbreite**, nicht 85. Jede Aussage der Form „diese Kehre passt
neben die Wand, weil sie nur 85 mm ausschlägt" ist damit hinfällig.

Und die maßgebliche Bedingung ist ohnehin eine andere, siehe §3a: nicht die
Breite, sondern wie weit der Körper **nach Norden** auf die eigenen beiden
Spalten zurückkommt.

## 3a. Was gebaut ist, und woran es hängt

`src/circuit/band.rs` läuft die Bahnen 0, 1 und 2, findet die 75-mm-Kehren im
Graphen und landet sie sauber. Offen ist der **letzte** Bahnwechsel — genau
der harte Punkt aus §3: am linken Ende liegen zwei Kehren, und der Ausschlag
der äußeren kreuzt die Spalten, die die inneren beiden Bahnen herunterlaufen.

```
the lane change from lane 2 onto channel 5 at (337.5, 300.0)
runs into edge N, already laid
```

**Was gemessen ausgeschlossen ist:**

- *Nicht die Landung.* Die eigentliche Bedingung ist nicht der Gesamtausschlag,
  sondern eine pro Spalte: Bahn `k` kommt südwärts herunter, Bahn `k+1` läuft
  nordwärts hinauf — beide Spalten sind also **nördlich** der Kehre belegt.
  Drei-Kanten-Ketten landen sauber nur auf **einer** Spaltenparität je
  Richtung (westwärts ungerade, ostwärts gerade), und die Ecken erzwingen
  `links ≢ rechts`. Drei Kanten konnten beide Enden nie bedienen. Vier Kanten
  brechen die Sperre; der Walker probiert sie jetzt, und Bahn 1 — die vorher
  sofort auflief — läuft durch. Gepinnt als
  `a_three_edge_lane_change_lands_cleanly_on_only_one_parity_per_direction`
  und `a_four_edge_lane_change_lands_cleanly_on_either_parity`.
- *Nicht der Wandabstand.* Bei 150 mm scheitert der Lauf an derselben Stelle.

**Was als Nächstes zu prüfen ist, in dieser Reihenfolge:**

1. `MAX_TURN_ROWS` begrenzt jeden Bahnwechsel auf die zwölf tiefsten Zeilen.
   Die beiden Kehren am selben Ende brauchen die innere weit oben — ob zwölf
   Zeilen dort hinreichen, ist Arithmetik, die noch niemand gemacht hat.
2. Kehren-Kandidaten nach Ausschlagrichtung ordnen, damit eine Kehre neben der
   Wand ihren Ausschlag zuerst nach innen angeboten bekommt. Heute kommen sie
   in Graphreihenfolge.

Die drei Abnahmetests in `tests/circuit_band.rs` stehen als `#[ignore]` da,
nicht abgeschwächt: sie sind die Abnahme und laufen unverändert, sobald der
letzte Bahnwechsel sitzt.

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
