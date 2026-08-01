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

## 3. Zu bauen

1. **`build_spiral_lanes`** ersetzt `build_lanes` für das Spiralmuster:
   statt geschlossener Ringe eine offene, fortlaufende Bahnfolge. Jede
   Umrundung rückt an zwei gegenüberliegenden Seiten um je 150 mm ein
   (S-Schlag aus zwei `BroadTurn45`); die beiden anderen Seiten laufen auf
   konstantem Inset.
2. **Seitenwahl festlegen und begründen:** an welchen zwei Seiten eingerückt
   wird, entscheidet, ob Vor- und Rücklauf sich vertragen. Vor der
   Implementierung an einem Fixture durchrechnen: Der Einwärtsarm überstreicht
   beim S-Schlag das Intervall [r, r+150]; die Rücklaufbahn darf in diesem
   Intervall an dieser Seite nicht liegen. Ergibt sich ein Konflikt, ist die
   Rücklaufbahn um eine halbe Steigung zu versetzen (Rücklauf rückt an den
   *anderen* beiden Seiten ein).
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
