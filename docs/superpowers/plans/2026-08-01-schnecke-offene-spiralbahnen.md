# Schnecke: von Ringen auf offene Spiralbahnen — Bauplan

**Datum:** 2026-08-01
**Status:** Konstruktion vermessen, Umbau offen
**Auslöser:** `a_four_ring_spiral_crosses_itself_and_the_validator_catches_it`
(`tests/circuit_loop_end_to_end.rs`) — der vierringige Arm kreuzt bei
(1162,5 | 487,5) die Bahn, die der Rücklauf später belegt.

## 1. Warum das aktuelle Modell kreuzen muss

`build_lanes` liefert **geschlossene** Ringe. Ein Arm, der von Ring k auf
Ring k+2 wechselt, braucht dafür ein Querstück (Hop), und dieses Querstück
überquert Ring k+1 — die für den Rücklauf reservierte Bahn. Das ist kein
Implementierungsfehler, sondern eine Eigenschaft des Ringmodells: Solange
die Windungen geschlossen sind, muss der Einwärtsweg irgendwo über sie
hinweg.

Eine echte Schnecke hat dieses Problem nicht, weil sie keine Ringschar ist:
Sie ist **eine fortlaufende Spirale**, deren Steigung über die Umrundung
verteilt ist. Zwei Spiralen gleicher Steigung, um die halbe Steigung
versetzt, kreuzen sich nie — wie die zwei Gänge einer zweigängigen Schraube.
Genau so beschreibt es auch das Schlüter-Handbuch (S. 27, siehe
`docs/superpowers/research/2026-07-31-schneckenverlegung-handwerk-praxis.md`):
Vorlauf im doppelten Verlegeabstand bis zur Wendeschleife, Rücklauf mittig
im verbliebenen Freiraum.

## 2. Was der Katalog hergibt (gemessen, nicht geschätzt)

Aus `PlateProfile::bekotec_en_23_fi_30_16().templates()`, lokale
Start-/Endposen:

| Template | Δ (längs, quer) | Heading |
|---|---|---|
| `Straight0` | (150, 0) | Deg0 → Deg0 |
| `Straight45` | (150, 150) | Deg45 → Deg45 |
| `BroadTurn45` | (150, **75**) | Deg0 → Deg45 |
| `BroadTurn90` | (187,5 , 112,5) | Deg0 → Deg90 |
| `BroadTurn135` | (150, 150) | Deg0 → Deg135 |
| `BroadReverse180` | (0, 225) | Deg0 → Deg180 |
| `TeardropReverse` | (0, **150**) | Deg0 → Deg180 |

Daraus folgt die entscheidende Einschränkung:

- Ein einzelner `BroadTurn45` versetzt **75 mm quer**, ändert aber das
  Heading. Um wieder längs zu laufen, braucht es einen zweiten — Summe
  **150 mm**.
- Ein richtungserhaltender Querversatz von 75 mm existiert nicht, auch
  nicht als Kette (bestätigt durch Graph-Sweep: die einzigen
  headinggleichen Kanten mit Querversatz sind die Diagonalen 150/150).

**Konsequenz:** Die Steigung von 2×VA = 300 mm pro Umrundung lässt sich
nicht auf vier Seiten à 75 mm verteilen, sondern nur auf **zwei
gegenüberliegende Seiten à 150 mm**.

## 2a. Die Seitenzuweisung, durchgerechnet

Zwei Schritte, beide zwingend:

**Erstens: alle vier Seiten, nicht zwei.** Rückt eine Rechteckspirale nur an
Nord und Süd ein, bleiben Ost- und West-Inset über alle Umrundungen
konstant — die Spirale zieht sich nur vertikal zusammen, und alle Windungen
liegen auf Ost und West übereinander. Das ist keine Spirale, sondern ein
Streifen, und es kollidiert sofort. Also rückt **jede** Seite pro Umrundung
ein.

Damit ist der Betrag festgelegt: Auf einer Seite ist der Abstand zweier
aufeinanderfolgender Windungen genau die Einrückung pro Umrundung. Für den
Vorlauf muss dieser Abstand 2×VA = **300 mm** sein — als zwei 150-mm-S-Schläge
darstellbar (§2), 75 mm ist nicht darstellbar und 150 mm wäre zu dicht.

**Zweitens: beide Arme rücken gemeinsam ein.** Der S-Schlag des Vorlaufs
überstreicht quer das Intervall `[r, r+300]`. Die Rücklaufbahn liegt bei
`r+150` — mitten darin. Läuft der Rücklauf dort gerade durch, ist die
Kreuzung unvermeidlich; **das ist exakt der Treffer bei (1162,5 | 487,5)**.

Die einzige konfliktfreie Anordnung: Der Rücklauf rückt an derselben Ecke
gleichzeitig ein, um VA versetzt.

```text
Vorlauf:   r      → r+300
Rücklauf:  r+150  → r+450
```

Zwei parallele S-Schläge im festen Abstand 150 mm — sie können sich nicht
schneiden, weil sie überall denselben Versatz halten. Genau das ist die
bifilare Doppelspirale: zwei Arme, die *gemeinsam* nach innen laufen und
überall im Verlegeabstand nebeneinander liegen, nicht zwei unabhängig
belegte Ringmengen.

Daraus folgt für die Konstruktion: Vor- und Rücklauf sind **eine** Bahnfolge
mit zwei Spuren, keine getrennten Bahnlisten. Die Reservierung wird damit
strukturell statt geprüft — die zweite Spur ist per Konstruktion frei und
liegt immer VA neben der ersten.

## 3. Zu bauen

1. **`build_spiral_lanes`** ersetzt `build_lanes` für das Spiralmuster:
   statt geschlossener Ringe eine offene, fortlaufende Bahnfolge. Jede
   Umrundung rückt an zwei gegenüberliegenden Seiten um je 150 mm ein
   (S-Schlag aus zwei `BroadTurn45`); die beiden anderen Seiten laufen auf
   konstantem Inset.
2. **Seitenwahl — gelöst, siehe §2a.** Eingerückt wird an *allen vier*
   Seiten um je 300 mm pro Umrundung, und beide Arme rücken an derselben
   Ecke gleichzeitig ein.
3. **`plan_inward_arm` / `complete_spiral`** folgen der Bahnfolge, statt
   Ringe zu belegen und zu hoppen. Die Reservierungs-Invariante bleibt: die
   Zwischenbahn gehört dem Rücklauf.
4. **`walk_ring_backward`'s Geschlossen-Guard** entfällt für Spiralbahnen —
   er war die richtige Regel für Ringe und ist die falsche für Spiralen.
5. **`SectionKind::Hop`** bleibt: der Übergang zwischen zwei Windungen ist
   weiterhin eine Sektion ohne Bahnzugehörigkeit. Was entfällt, ist das
   *Queren* einer fremden Bahn.

## 4. Abnahme

Der Test `a_four_ring_spiral_crosses_itself_and_the_validator_catches_it`
wird umgedreht: dieselbe Geometrie, dieselbe Pipeline, aber `certify_loop`
liefert `Ok`. Zusätzlich pinnen: Deckung (die Spirale muss die Fläche
belegen, nicht nur den Rand), Länge unter 100 m, und dass kein Hop eine
belegte oder reservierte Bahn überquert.

## 5. Was bis dahin gilt

Der Zwei-Windungen-Kreis (`the_generator_produces_a_loop_the_validator_certifies`)
ist zertifiziert und verlegbar, deckt aber nur den Randbereich. Für einen
vollflächigen Heizkreis ist dieser Umbau die verbleibende Arbeit.

## 6. Nutzerwunsch 75 mm Rohrabstand — Folgen

Der Nutzer plant 75 mm zwischen hin- und rücklaufender Schlange. Das ist der
Kanalabstand selbst, also die dichteste auf dieser Platte mögliche Verlegung:
jeder Kanal belegt.

Was dadurch **passt**:

- Windungsabstand des Vorlaufs allein = 2 × 75 = **150 mm**, und 150 mm ist
  exakt der kleinste darstellbare richtungserhaltende Querversatz (§2, zwei
  `BroadTurn45`). Die Einrückung pro Umrundung ist damit genau ein S-Schlag —
  einfacher als die 300-mm-Variante aus §2a.
- Die Zwei-Spuren-Konstruktion aus §2a bleibt unverändert gültig, nur mit
  Versatz 75 statt 150.

Was dadurch **bricht**:

- Die Mittelkehre muss zwei Bahnen im Abstand 75 mm verbinden, also mit
  Radius 37,5 mm. Der Mindestbiegeradius ist 80 mm (5 × 16 mm Rohr). Das ist
  **physikalisch unmöglich**, kein Katalogmangel — genau diese Wende ist im
  Handbuch als unzulässig abgebildet und liegt als Golden Fixture
  `handbook-rejected-tight-u.json` vor.
- Der Katalog hat folgerichtig keine Reverse-Familie unter 150 mm Span
  (`TeardropReverse` 150, `BroadReverse180` 225); Task 10 hat das gemessen.

Zu klären, bevor bei 75 mm gebaut wird: Die Kehre muss den inneren Freiraum
nutzen, statt die beiden innersten Bahnen direkt zu verbinden — die Spirale
endet vor der Mitte und wendet dort großzügig. Ob der Katalog eine solche
Wende auf dem 75-mm-Raster hergibt, ist zu prüfen (Sweep über
`TeardropReverse`-Platzierungen im inneren Freiraum), bevor 75 mm als
unterstützter Wert gilt.

Thermisch ist 75 mm zudem sehr dicht; übliche Wohnraumwerte liegen bei
100–150 mm, 75 mm ist ein Randzonen- oder Niedertemperaturmaß. Das ist eine
Auslegungsfrage des Nutzers, keine Solverfrage — der Solver meldet Geometrie,
keine thermische Eignung (Spec §23.3).

### 6a. Kehren-Sweep bei 75 mm — Ergebnis und Konstruktion

Gemessen am Graph des 3000×2400-Fixtures: Reverse-Familien-Kanten überbrücken
quer zur Startrichtung **ausschließlich 150 mm** (4032 Platzierungen) oder
**225 mm** (2016). Eine 75-mm-Wende gibt es nicht — bestätigt, wie §6
vorhergesagt hat.

Das schließt 75 mm aber **nicht** aus, es legt die Wende fest. Bei 75 mm
Rohrabstand belegt der Vorlauf jede zweite Spur (0, 2, 4, …), der Rücklauf
die dazwischen (1, 3, 5, …). Verbände die Kehre die beiden innersten
Nachbarspuren, wäre sie 75 mm — unmöglich. Sie muss stattdessen **eine Spur
überspringen**:

```text
Vorlauf endet auf Spur k
Kehre über 150 mm (TeardropReverse)
Rücklauf beginnt auf Spur k-2
Spur k-1 bleibt frei — der Wendekern
```

Damit ist die Kehre eine reguläre 150-mm-`TeardropReverse`, und in der
Raummitte bleibt genau eine Spur unbelegt. Das ist auch handwerklich die
übliche Lösung: Die Wendeschleife braucht Platz, und die Mitte ist über die
Kehre ohnehin am wärmsten. Die Deckungsprüfung muss diese eine freie
Mittelspur folglich als zulässig behandeln, nicht als Fehlstelle.

**Damit ist 75 mm baubar.** Zu implementieren nach §3, mit:

- Einrückung pro Umrundung = 150 mm (ein S-Schlag aus zwei `BroadTurn45`),
- Spurversatz beider Arme = 75 mm,
- Kehre = `TeardropReverse` über 150 mm mit freier Mittelspur,
- Abnahme wie §4, zusätzlich: die freie Mittelspur ist genau eine, und die
  Deckung bleibt trotzdem unter der geforderten Schranke.
