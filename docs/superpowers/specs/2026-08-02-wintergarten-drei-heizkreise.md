# Wintergarten: drei Heizkreise, wie der Nutzer sie verlegen will

**Datum:** 2026-08-02
**Status:** Vorgabe festgehalten, noch nicht gebaut
**Raum:** `single-loop/fixtures/rooms/wintergarten.json` (Export aus `raumaufmass`)

## 1. Die Vorgabe

Wörtlich vom Nutzer, am 2026-08-02:

> wir machen 3 heizkreise in dem raum. 1 geht an den fensterfronten lang. mit
> 4 bahnen (zwei hin, zwei zurück, 75mm abstand voneinander). die heizkreise 2
> und 3 füllen dann den restlichen raum. der verteiler steht in der kleinen
> aussparung an der wand. die fensterfronten sind rechts und links der 7.5m
> langen fensterfront

## 2. Auf den gemessenen Raum abgebildet

Die drei Fensterfronten sind eindeutig identifizierbar — sie sind dieselben
drei Wände, die im `verlegeplan.html`-Screenshot als Randzone markiert waren
(Wand 9 · 3,05 m, Wand 10 · 7,85 m, Wand 11 · 3,08 m):

| Wand | gemessen | begradigt | Rolle |
|---|---|---|---|
| I→J | 7851 mm | 7608 mm | die lange Fensterfront |
| H→I | 3050 mm | 3026 mm | rechts davon |
| J→A | 3080 mm | 3026 mm | links davon |

Sie bilden ein U um den Hauptraum: linke Wand, obere Wand, rechte Wand.

**Der Verteiler steht in der kleinen Aussparung** — das ist M-O-N-F, die
357-mm-Nische unten rechts. Damit ist auch geklärt, wozu sie da ist.

> **Achtung, offener Konflikt mit dem Gebauten.** `rectify` *verwirft* diese
> Nische (Wände unter 500 mm gelten als Aufmaß-Artefakt). Für die Heizfläche
> ist das weiterhin richtig — 207 mm nutzbare Breite tragen kein Bahnpaar —,
> aber ihre **Position muss erhalten bleiben**, weil dort der Verteiler steht
> und alle Anbindeleitungen dorthin laufen. `RectifiedRoom` braucht ein
> zusätzliches Feld für verworfene Merkmale, statt sie spurlos zu schlucken.

## 3. Kreis 1: die Randzone

Kein Schnecke, sondern ein **Band**: 4 Bahnen à 75 mm, zwei hin, zwei zurück.

- Bandbreite: 4 × 75 = **300 mm**
- Wandlauf über die drei Fronten: 3026 + 7608 + 3026 = **13 660 mm**
- Rohr: 13 660 × 4 ≈ **54,6 m** plus Kehren und Anbindung — unter 100 m ✓
- belegte Fläche: **4,10 m²**

Das ist eine neue Verlegeart neben der Schnecke, kein Sonderfall von ihr: ein
offenes Band entlang eines Wandzugs mit einer Kehre am fernen Ende.

## 4. Kreise 2 und 3: der Rest — und warum 75 mm dort nicht geht

Restfläche nach Abzug des Randbands: **23,96 m²**. Für zwei Kreise à höchstens
100 m:

| Verlegeabstand | theoretisch | je Kreis | |
|---|---|---|---|
| 75 mm | 319 m | 160 m | **zu lang** |
| 100 mm | 240 m | 120 m | **zu lang** |
| 150 mm | 160 m | 80 m | passt |
| 200 mm | 120 m | 60 m | passt |

**Drei Kreise decken diesen Raum bei 75 mm nicht ab.** Zwei Kreise à 100 m
sind 200 m Rohr; bei 75 mm reicht das für 15 m², nicht für 23,96 m². Das ist
Arithmetik, keine Schwäche des Solvers.

Der übliche und hier passende Aufbau ist deshalb **gemischt**:

- **Kreis 1 (Randzone) bei 75 mm** — dicht, wo der Wärmeverlust sitzt.
- **Kreise 2 und 3 bei 150 mm** — je ~80 m theoretisch, mit dem gemessenen
  Verlegegrad von ~68 % real eher ~54 m. Es bleibt Luft, notfalls auch für
  125 mm.

Das ist eine Auslegungsentscheidung des Nutzers, keine des Solvers (Spec
§23.3). Der Solver meldet Geometrie und Länge, nicht thermische Eignung.

## 5. Was gebaut werden muss

1. **Randzonen-Band** als eigene Verlegeart: `n` Bahnen entlang eines
   Wandzugs, Kehre am fernen Ende, Anbindung an den Verteiler. Auf demselben
   Noppengitter und durch denselben `certify_loop` wie die Schnecke.
2. **Verteilerposition erhalten.** `rectify` muss verworfene Merkmale
   melden, damit die Nische als Verteilerort verfügbar bleibt.
3. **Randzone zuerst, Rest danach.** Das Band belegt seine 300 mm; die
   Felder für Kreis 2 und 3 werden aus dem *verbleibenden* Polygon
   geschnitten, nicht aus dem ganzen Raum.
4. **Anbindeleitungen zum Verteiler.** Drei Kreise heißt sechs Leitungen
   durch eine Zone. Die Kreuzungsprüfung `connectors_clear_the_loop`
   behandelt heute zwei.
5. **Pro Kreis ein eigener Verlegeabstand.** `plan_multi` nimmt heute einen
   für alle.

## 6. Was schon steht

- Ein Noppenfeld für alle Kreise (`plan_multi`, Commit `70dc433`) — die
  Voraussetzung dafür, dass Randzone und Füllkreise überhaupt zusammenpassen.
- Begradigung des gemessenen Rings, Zerlegung in Felder (`rectify`,
  `slab_fields`, Commit `db9b300`).
- Die Schnecke selbst, zertifiziert, bei 75/150/225/300 mm.
