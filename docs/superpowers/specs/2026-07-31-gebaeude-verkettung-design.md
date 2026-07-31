# Räume verketten: Tür als Anker, Messung durch die Tür (Design)

## Ziel

Aus nebeneinandergelegten Räumen wird ein zusammenhängendes Geschoss. Die
Lage eines Raums im Gebäude ist nicht mehr eingefroren, sondern folgt aus
dem, was gemessen wurde — und wo das Gebäude sich nicht schließt, sagt die
App, wo nachzumessen ist.

## 1. Die Lage eines Raums wird ABGELEITET, nicht gespeichert

Bisher bekommt ein Nachbarraum beim Anlegen ein `origin` und behält es.
Misst man ihn danach nach, verschiebt sein Solver die Wände — die
gespeicherte Lage stimmt dann nicht mehr.

Neu: `buildingOrigins()` rechnet die Lage **aller** Räume aus den
Verbindungen aus. Ein Raum ist die Wurzel (er liegt bei {0,0,0}), jeder
andere hängt über eine geteilte Wand an einem Vorgänger. Aus dieser Wand
folgt die Lage vollständig:

- **Drehung**: die beiden Innenkanten liegen sich gegenüber, laufen also
  antiparallel. Damit ist die Verdrehung des Nachbarn bestimmt.
- **Quer zur Wand**: der Abstand ist die Wanddicke.
- **Längs der Wand**: die **Tür** ist der Anker — nicht die Wandecke.

Damit vererbt sich die Parallelität der Innenkanten durch die ganze Kette.
Verschiebt der Solver in einem Raum eine Wand, wandern alle daran
hängenden Räume mit.

`origin` bleibt im Speicher, aber nur noch als Startwert der Wurzel und
für freistehende Räume. Wer keine Verbindung hat, verhält sich wie bisher.

## 2. Warum die Tür der Anker ist

Die Länge einer geteilten Wand kann in beiden Räumen verschieden gemessen
werden — die Wand reicht ja nicht zwingend in beiden Räumen gleich weit.
Was physisch dasselbe Ding ist, ist die **Tür**. Also wird längs der Wand
über die Tür ausgerichtet, nicht über eine Ecke.

Das kehrt eine Entscheidung aus der vorigen Runde um. Dort galt: die Tür
wird nicht in den Nachbarraum kopiert, weil ihre Lage sonst doppelt
erfasst wäre. Das war richtig, solange die Tür nur ein Symbol war. Als
Anker ist sie ein **gemeinsames Objekt mit zwei Ablesungen**: ihre Lage in
der Wand von Raum A und ihre Lage in der Wand von Raum B. Das sind zwei
verschiedene Messgrößen desselben Dings, keine Doppelerfassung.

Die Ablesung im neuen Raum ist zunächst **angenommen** (aus der Lage beim
Anlegen) und wird als solche markiert — wie die Wanddicke und die
Raumhöhe. Sobald der Nutzer im neuen Raum den Abstand Ecke–Tür misst
(dafür gibt es die Öffnungsmessung bereits), wird aus der Annahme ein
Messwert, und der Raum rückt an seine gemessene Stelle.

## 3. Messung durch die Tür

Durch eine offene Tür sieht man von einer Ecke des einen Raums eine Ecke
des anderen. Genau diese Strecke lässt sich mit dem Laser messen, und aus
ihr folgen Wanddicke und Längsversatz.

- Die App **schlägt vor**, welche Eckenpaare so messbar sind: die
  Verbindungslinie muss die Türöffnung schneiden, und zwar mit Abstand zu
  beiden Laibungen — ein Strahl, der die Zarge streift, ist geometrisch
  „durch", mit dem Laser aber nicht zu treffen. Der Sicherheitsabstand
  richtet sich nach der Türbreite, nicht nach einem festen Millimeterwert.
- Sie darf außerdem keine Wand kreuzen.
- Die Messung gehört zu **einem** Raum und nennt den anderen. Wird dieser
  Raum allein exportiert oder geteilt, muss er trotzdem laden — der
  Verweis ins Leere wird still übergangen, nicht als Fehler behandelt.
- Ausgewertet wird sie über den bestehenden Solver: die Punkte beider
  Räume kommen mit vorangestelltem Raumkürzel in EINE Punktmenge, die
  Strecken beider Räume plus die Querstrecken in EINE Messliste. Das ist
  ein echtes Netz aus zwei Räumen — mit Redundanz, Residuen und
  Verdachtsmarkierung, wie sie der Einzelraum schon hat.

Nicht das ganze Geschoss auf einmal: ein Paar ist ein Netz, das Geschoss
wäre der globale Ausgleich, den wir bewusst nicht bauen.

## 4. Gemeinsame Wand ohne Tür

Geht man im Ring durch die Wohnung, grenzt der neue Raum irgendwann auch
an einen Raum, zu dem es keine Tür gibt. Dann muss man sagen können: diese
beiden Wände sind eine.

- Die App erkennt Kandidaten: zwei Wände aus zwei Räumen, die nah
  beieinander und fast parallel liegen.
- Ein Klick erklärt sie zur gemeinsamen Wand. Damit ist die Parallelität
  ihrer Innenkanten gesetzt, und der Abstand ist die Wanddicke.
- Ohne Tür fehlt der Längsanker. Die Verbindung bestimmt dann Drehung und
  Querabstand, aber nicht die Verschiebung längs der Wand — die kommt aus
  einer Messung durch eine andere Tür oder bleibt offen und wird als
  solche gezeigt.

## 5. Der Ring schließt sich — und was dann passiert

Sobald ein Raum an zwei bereits liegende Räume grenzt, ist seine Lage
**überbestimmt**. Die Verbindungen bilden dann keinen Baum mehr.

- Die Ableitung folgt weiter dem Baum. Jede Verbindung, die keine
  Baumkante ist, ist eine **Schlusskante**.
- An einer Schlusskante wird gemessen, wie weit die beiden Innenkanten
  auseinanderliegen und wie schief sie zueinander stehen. Das ist der
  Schlussfehler des Rings.
- Er wird **gemeldet, nicht verteilt**. Und er wird zugeordnet: die App
  nennt die Räume auf dem Ring und schlägt vor, wo eine Wand oder eine
  Diagonale nachzumessen ist, um den Winkelfehler einzugrenzen — dieselbe
  Logik wie die bestehenden Messvorschläge, nur eine Ebene höher.

## 6. Datenmodell

```
shared: { 'A|B': { room, wall:[a,b], tuer:{ op, x, angenommen } } }
meas:   [ …, { a:'C', raum:<id>, b:'A', d, quer:true } ]
```

- `tuer.op` benennt die Öffnung, über die verankert wird; `tuer.x` ist
  ihre Lage in der Wand DIESES Raums, `angenommen` sagt, ob sie gemessen
  ist.
- Eine Querstrecke steht in `meas` wie jede andere, trägt aber `raum` und
  `quer:true`. Der Grundriss-Solver eines Einzelraums überspringt sie.

## Etappen

1. Abgeleitete Lage: `buildingOrigins()` als einzige Quelle, Tür als
   Anker, Zyklen erkannt und Schlusskanten gesammelt.
2. Messung durch die Tür: Vorschlag, Erfassung, Auswertung im Zwei-Raum-
   Netz.
3. Gemeinsame Wand ohne Tür erklären.
4. Schlussfehler des Rings melden und zuordnen.

## Bewusst nicht

- Kein globaler Ausgleich über alle Räume. Die Ableitung folgt einem Baum,
  Widersprüche werden benannt statt weggerechnet.
- Keine Geschosse.
- Keine automatische Korrektur: die App sagt, wo etwas nicht passt, und
  überlässt das Nachmessen dem Menschen.
