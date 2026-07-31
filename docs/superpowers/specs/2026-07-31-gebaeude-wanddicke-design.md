# Vom Raum zum Gebäude — Nachbarräume und Wanddicke (Design)

## Ziel

Hinter einer Tür liegt ein weiterer Raum. Aus der losen Raumbibliothek
wird ein zusammenhängender Gebäudegrundriss: Nachbarräume werden durch
eine Tür angelegt, erben die gemeinsame Wand als bereits vermessene
Kante, und man wechselt zwischen ihnen durch Antippen im Plan. Dazu die
Wanddicke — die Größe, die ein Bauherr für Türzargen und Fensterbänke
wirklich braucht.

## 1. Die tragende Entscheidung: das gemessene Polygon ist die INNENkontur

Der Nutzer steht **im** Raum und misst von Innenecke zu Innenecke. Alles,
was er sieht und messen kann, ist die Innenschale — inklusive Putz. Also
ist das bisherige Punkt-Polygon genau das: die Innenkontur eines Raums,
nicht die Mittellinie einer Wand.

Daraus folgt alles Weitere:

- **Eine Wand hat eine Dicke, die nach AUSSEN aufgetragen wird.** Die
  Außenkante einer Wand entsteht durch Parallelversatz der Innenkante um
  die Wanddicke, nach außen.
- **Zwei Räume teilen sich eine Wand, wenn ihre Innenkonturen sich
  gegenüberliegen.** Die Wanddicke ist dann der Abstand zwischen beiden
  Innenkanten — messbar, ableitbar, und für beide Räume dieselbe Zahl.
- **Ecken lösen sich von selbst.** Wo zwei Innenkanten sich in einer Ecke
  treffen, schneiden sich auch ihre nach außen versetzten Parallelen: der
  Schnittpunkt ist die Außenecke (Gehrung / Miter-Join). Kein Sonderfall,
  keine Steine.

### Warum nicht die Mittellinie

Das übliche CAD-Modell führt die Wand als Mittellinie und trägt die Dicke
beidseitig auf. Es passt hier nicht: Die Mittellinie ist nicht messbar.
Man müsste aus einer Innenmessung plus halber Dicke zurückrechnen, und
jede Dickenänderung würde die gemessene Geometrie verschieben — die
Messwerte wären dann nicht mehr das, was sie sind. Mit der Innenkontur
als Wahrheit bleibt jede Messung für immer gültig, und die Dicke ist eine
reine Ergänzung nach außen.

## 2. Das Y-Problem

Drei Wände laufen in einem Punkt zusammen; der Nutzer hat in jedem der
drei Räume die Innenecke gemessen. Die Wandflächen dazwischen sind dann
**keine Vierecke**, sondern haben eine dreieckige Spitze.

Im Innenkontur-Modell ist das kein Sonderfall, sondern das Ergebnis:

- Jeder Raum liefert seine Innenecke.
- Die Wandfläche zwischen zwei Räumen ist der Bereich zwischen ihren
  einander zugewandten Innenkanten.
- Wo drei solcher Bereiche aufeinandertreffen, bleibt in der Mitte ein
  Restpolygon — genau die Dreiecksspitze. Sie wird als Wandfläche
  gezeichnet und braucht keine eigene Beschreibung.

Der Nutzer misst also weiterhin nur, was er sieht. Die Spitze entsteht
rechnerisch, nicht durch Eingabe.

**Ehrliche Grenze:** Sind alle drei Räume unabhängig vermessen, können
sich die abgeleiteten Wandflächen um die Messgenauigkeit widersprechen —
Lücken oder Überlappungen von wenigen Millimetern. Die werden **nicht**
stillschweigend geglättet: kleine Abweichungen bleiben sichtbar, große
melden, dass die Räume nicht zueinander passen. Das ist dieselbe
Ehrlichkeit wie beim Ausgleich im Grundriss.

## 3. Wanddicke erfassen

Eigenschaft der **Wand**, nicht des Raums. Standardwerte (mm), als
Auswahl mit freier Eingabe:

- 100, 115 (Leichtbau, halber Stein)
- 125 (Ständerwand)
- 175, 240 (tragendes Mauerwerk)
- 300, 365 (Außenwand)

Abgefragt wird sie dort, wo sie zum ersten Mal gebraucht wird: beim
Anlegen eines Nachbarraums durch eine Tür. Solange keine Dicke bekannt
ist, gilt ein angenommener Wert, sichtbar als „angenommen" wie bei der
Raumhöhe. Sind beide angrenzenden Räume vermessen, lässt sich die Dicke
aus dem Abstand der Innenkonturen ableiten und der angenommene Wert durch
den gemessenen ersetzen.

## 4. Nachbarraum durch eine Tür anlegen

- Im Grundriss erscheint außerhalb jeder Tür ein **Plus**, sobald dort
  noch kein Raum liegt.
- Antippen fragt die Wanddicke ab (Vorschlag aus dem Katalog) und legt
  intern einen neuen Raum an. Kein Default-Rechteck: Der neue Raum
  besteht zunächst nur aus **zwei Punkten** — den beiden Enden der
  geerbten Wand, um die Wanddicke nach außen versetzt.
- Diese Wand ist damit bereits vermessen (Länge aus dem Nachbarraum), und
  die Tür gehört beiden Räumen. Ihre Position wird nicht doppelt erfasst.
- Ab da läuft der bekannte Ablauf weiter: Ecken antippen, Wandzug
  schließen, Strecken messen.

## 5. Zwischen Räumen wechseln

- Nachbarräume werden im Plan blass mitgezeichnet, der aktive Raum
  vollflächig.
- Zeigt der Mauszeiger auf einen Nachbarraum, schimmert er grün
  (auf Touch: Antippen genügt, kein Hover-Zustand nötig).
- Ein Klick **schwimmt** hinüber: Ansicht animiert in etwa 300 ms auf den
  Mittelpunkt des Zielraums, dieser wird geladen und aktiv. Kein Sprung —
  die Bewegung erhält die Orientierung.
- **Die Abwicklung gilt nur für den aktiven Raum.** Nachbarräume zeigen
  ihre Wände als Linien, sonst würde der Plan unlesbar.

## 6. Datenmodell

Räume bleiben eigenständige Einheiten (wie bisher in der Bibliothek),
bekommen aber eine gemeinsame Lage:

```
room: { id, name, data:{pts, walls, meas, …}, origin:{x,y,rot} }
wall: { …, thickness, sharedWith:{room, wall} }
```

`origin` verankert die Innenkontur eines Raums im Gebäudekoordinaten-
system; `sharedWith` verbindet zwei Wände zu einer gemeinsamen. Räume
ohne `origin` sind freistehend — die bestehende Bibliothek bleibt damit
gültig, und alte Räume laden unverändert.

Der Raumname wird im Plan an der Raummitte angezeigt und ist dort
antippbar zum Umbenennen (zusätzlich zur Statuskarte).

## Etappen

1. `origin` und Mehrraum-Darstellung: Nachbarräume blass zeichnen,
   Hover-Schimmer, Klick-Wechsel mit weicher Fahrt, Name im Plan.
2. Nachbarraum durch eine Tür anlegen, inklusive Dickenabfrage und
   geerbter Wand.
3. Wanddicke zeichnen: Wände als Flächen zwischen den Innenkonturen,
   Ecken per Gehrung, Y-Spitzen als Restpolygon.
4. Dicke aus zwei vermessenen Räumen ableiten und Widersprüche melden.

Nach jeder Etappe bleibt die App vollständig lauffähig, und
Einzelraum-Aufmaße funktionieren unverändert.

## Bewusst nicht

- Keine Geschosse. Ein Gebäude ist hier eine Ebene.
- Keine Wandschichten (Putz, Dämmung, Mauerwerk getrennt) — eine Dicke
  je Wand, das ist die Zahl, die man für eine Zarge braucht.
- Keine automatische Korrektur widersprüchlicher Nachbarräume.
