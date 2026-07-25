# Verlegeplan für beliebige Räume — Design

**Datum:** 2026-07-25
**Status:** Entwurf, zur Diskussion. Noch kein Implementierungsplan.

## Zweck

Zwei Dinge, die nach heutigem Stand dasselbe Vorhaben sind:

1. Der Verlegeplan erzeugt Rohrpfade, die sich kreuzen. Das ist kein Schönheitsfehler — zwei Rohre auf gleicher Höhe lassen sich physisch nicht kreuzen.
2. Der Verlegeplan kann nur ein achsparalleles L. Der gemessene Raum aus `raumaufmass.html` ist ein beliebiges Polygon und passt nicht hinein.

Dieses Dokument begründet, warum beides mit einem Umbau erledigt wird und nicht mit zwei.

## Gemessener Ausgangsstand

Nicht aus Commit-Notizen übernommen, sondern am jetzigen Stand (`285dabe`) nachgemessen:

| Messung | Wert |
|---|---|
| Zufalls-Bench, 60 Konfigurationen | **52 fehlerhaft** (Kreuzung oder Rohr außerhalb des Raums) |
| Standardraum 8000 × 3200 mit Notch | **9 Kreuzungen**, 0 Segmente außerhalb |
| davon Selbstkreuzungen innerhalb eines Heizkreises | **0** |
| Rohr außerhalb, Verteiler auf einer Notch-Wand | 2 Segmente |

Die dritte Zeile ist der Befund, auf dem alles Weitere steht. `loopCrossings()`
zählt Selbstkreuzungen je Kreis **plus** Kreuzungen zwischen verschiedenen
Kreisen. Die Selbstkreuzungen sind null. **Sämtliche 9 Kreuzungen liegen
zwischen verschiedenen Heizkreisen** — die Spiralen im Feld sind sauber, es sind
die Anbindeleitungen vom Verteiler zu den Kreisen.

Das deckt sich mit der eigenen Notiz in `285dabe`: *„The rigid model — rectangle
decomposition plus axis-parallel rings plus Manhattan corridors — needs a
different laying algorithm rather than more special cases."* Der dort angekündigte
nächste Commit existiert nicht.

## Entscheidungen

**Beliebige Räume heißt: auch schräge Wände.** Nicht nur rechtwinklige Polygone
mit beliebig vielen Ecken, sondern auch Dachschrägen im Grundriss, abgeschnittene
Ecken, Erker. Das ist die teure Lesart und sie wurde bewusst gewählt.

**Der Import begradigt nicht.** Das gemessene Polygon geht 1:1 in den
Verlegeplan, mit seinen 89,4°-Ecken. Das ist nur konsistent, weil schräge Wände
ohnehin getragen werden — bei einem rechtwinkligen Modell wäre Nicht-Begradigen
keine Option, sondern ein Fehler.

## Warum das eine Ablösung ist, keine Erweiterung

Die heutige Geometrie-Pipeline beruht auf einer Entscheidung, die im
ursprünglichen Design ausdrücklich begründet wurde:

> Das rohe L wird **nie** spiraliert. Es wird in Rechtecke zerlegt. Grund:
> Konturen eines L haben keine gemeinsame Mitte. Jeder Torkanal driftet dadurch
> beim Schrumpfen und die Verbinder schneiden die Spirale. Rechtecke haben eine
> gemeinsame Mitte.

Diese Begründung war richtig und ist der Grund, warum heute `rectsFrame()`,
der ROT-Frame und die Kantennamen `bottom/left/top/right` existieren. Sie
trägt aber nur, solange sich der Raum in Rechtecke zerlegen lässt. Ein Raum mit
einer schrägen Wand lässt sich das nicht.

Damit fällt nicht ein Detail weg, sondern die Grundannahme. Was daran hängt:

| Baustein | Schicksal |
|---|---|
| `S.W/H/notchA/notchB/notchLeft` | ersetzt durch eine Eckenliste |
| `notchFrame()`, `rectsFrame()` | entfällt |
| ROT-Frame (`rotFwd`, `rotBack`, `ROT`) | entfällt — er dreht die Verteilerwand zur Unterkante, was nur bei achsparallelen Wänden definiert ist |
| `edgeSpan()`, `edgeChains()`, `windowEdges` als Namen | ersetzt durch Kantenindizes am Polygon |
| `doubleSpiral(rect, …)`, `bifilarPath(rect, …)` | ersetzt durch konturparallele Bahnen |
| `insetsFor(rect)`, `passCount(field, rect, …)` | neu zu fassen |
| `fillet()`, `omegaTurn()` | **bleibt** — arbeitet auf Punktlisten, nicht auf Rechtecken |
| `fieldCrossings()`, `crossBetween()`, `parallelOverlaps()`, `crossingBench()` | **bleibt und wird zum Abnahmekriterium** |
| Thermik-Schicht | bleibt weitgehend; braucht `pointInRoom` für ein Polygon statt für Rechteck-minus-Notch |

Die Prüfschicht überlebt vollständig. Das ist der wertvollste Teil des
Bestands: der Bench sagt heute 52/60 und kann am Ende 0/60 sagen, ohne dass sich
seine Definition ändert.

## Vorgeschlagene Architektur

### 1. Konturparallele Bahnen statt achsparalleler Ringe

Die klassische Antwort auf „Fläche mit beliebigem Rand gleichmäßig füllen" ist,
den Rand wiederholt nach innen zu versetzen. Jeder Versatz um den Bahnabstand
liefert eine geschlossene Kontur; die Konturen zusammen füllen die Fläche.

Genau hier tritt das im alten Design beschriebene Problem auf: beim Schrumpfen
zerfällt eine Kontur an Engstellen in mehrere Teile. Das ist kein Sonderfall,
sondern der Normalfall bei L-, U- und T-Formen. Es ist aber ein **gelöstes**
Problem — es ist dieselbe Aufgabe wie konturparallele Fräsbahnen beim
Taschenfräsen.

Die Behandlung: die Konturen bilden keinen Stapel, sondern einen **Baum**. Ein
Versatzschritt kann einen Knoten in mehrere Kinder aufspalten. Der Rohrpfad ist
dann eine Traversierung dieses Baums, und die bifilare Reihenfolge (jede zweite
Kontur hinein, die übersprungenen heraus) wird pro Ast gebildet statt über einen
linearen Stapel. `bifilarOrder()` bleibt im Kern gültig, bekommt nur einen Baum
statt einer Liste.

**Das braucht robustes Polygon-Offsetting.** Handgerollt ist das bei schrägen
Wänden und Selbstüberschneidungen nicht seriös. Das ursprüngliche Design hatte
den Fallback schon vorgesehen: `clipper2-js` lokal vendored. Aus dem Fallback
wird jetzt eine feste Abhängigkeit — vendored, nicht per CDN, damit die Datei
self-contained bleibt.

### 2. Teilflächen mit Front zur Verteilerwand

Das ist die Antwort auf die Kreuzungen, und sie folgt direkt aus dem Befund, dass
alle Kreuzungen zwischen Kreisen liegen.

Heute wird der Raum in Rechtecke zerlegt und den Kreisen zugeteilt; welcher Kreis
wo liegt, folgt nicht daraus, wo der Verteiler steht. Ein Kreis in der hinteren
Ecke braucht zwei Leitungen quer über fremdes Gebiet — und dort kreuzen sie.

Stattdessen: **den Raum in so viele Teilflächen zerlegen, wie es Kreise gibt, und
zwar so, dass jede Teilfläche ein Stück Verteilerwand berührt.** Dann geht jeder
Kreis auf kürzestem Weg senkrecht in den Korridor, die Spuren im Korridor liegen
in derselben Reihenfolge wie die Teilflächen an der Wand, und die Leitungen
können sich nicht mehr kreuzen — nicht weil der Algorithmus es prüft, sondern
weil die Anordnung es ausschließt.

Praktisch: entlang der Verteilerwand schneiden, die Schnittpositionen so wählen,
dass die Flächen etwa gleich groß werden (gleich lange Kreise).

**Der Ausnahmefall, der offen bleibt.** Es gibt Räume, in denen ein Teil der
Fläche von der Verteilerwand aus nicht erreichbar ist, ohne fremdes Gebiet zu
queren — etwa hinter einer einspringenden Ecke, oder wenn der Verteiler auf einer
Notch-Innenwand sitzt. Dort ist „jede Teilfläche hat Front" nicht erfüllbar.
Ob diese Fälle vorkommen und wie sie behandelt werden, ist **nicht entschieden**
— siehe offene Fragen. Solange das offen ist, ist die Kreuzungsfreiheit eine
**Eigenschaft mit Ausnahmen**, keine Garantie, und das Dokument behauptet nichts
anderes.

### 3. Raumdarstellung

`S.W/H/notchA/notchB/notchLeft` weicht einer Eckenliste in mm. Die Fensterwände
werden Kantenindizes statt der Namen `bottom/left/top/right`. Der Verteiler
bleibt ein Punkt, gesnappt auf die nächste Kante.

Danach ist der Import aus `raumaufmass.html` fast keine Arbeit mehr: dessen
Export enthält `pts` und `walls` bereits in genau dieser Form. Das ist der Grund,
diese Umstellung überhaupt in einem Zug mit den Kreuzungen zu machen.

## Reihenfolge

Nicht: erst das L fertigmachen, dann verallgemeinern. Der Umbau, der die
Kreuzungen löst — Teilflächen mit Front statt beliebiger Rechteckzuteilung —
ist derselbe Umbau, der die Raumform verallgemeinert. Zweimal gebaut wäre er
doppelte Arbeit, und die erste Fassung würde ohnehin weggeworfen.

Vorschlag als **eine** Ablösung der Geometrie-Schicht, mit dem bestehenden Bench
als Tor:

| Schritt | Abnahme |
|---|---|
| Polygon-Raumdarstellung, Offsetter vendored | bestehende L-Räume liefern denselben Plan wie heute |
| Konturparallele Bahnen auf dem Konturbaum | Bench: Selbstkreuzungen bleiben 0, auch bei U/T/Z und schrägen Wänden |
| Teilflächen mit Front, Spurzuteilung | Bench: Kreuzungen zwischen Kreisen von heute 9 auf 0 im Standardraum |
| Randzone an beliebigen Kanten | Bench 0/60 statt heute 52/60 |
| Import aus `raumaufmass.html` | gemessener Raum ergibt einen Plan |

Der Bench ist bereits vorhanden, deterministisch geseedet und misst genau das,
worum es geht. Er wird nicht angepasst, damit er grün wird.

## Offene Fragen

1. **Unerreichbare Teilflächen.** Kommen Räume vor, in denen eine Teilfläche
   keine Verteilerwand-Front haben kann? Wenn ja: zweite Leitungsebene zulassen
   (im Estrich real, aber Aufbauhöhe), Kreis aufteilen, oder dem Nutzer sagen,
   dass der Verteiler woanders hin muss?
2. **Randzone an schrägen Ecken.** Die heutige Randzone ist für rechte Winkel
   gebaut: an einer 90°-Ecke ist klar, wo die dichteren Bahnen umlaufen. Sobald
   ein Winkel weder 90° noch 270° ist, sind Versatz und Bahnzahl an der Ecke
   nicht definiert. Der spitze Fall (Bahnen laufen zusammen, es bleibt kein
   Platz für die volle Bahnzahl) und der einspringende Fall (Bahnen laufen
   auseinander, es entsteht eine Lücke) sind zwei verschiedene Probleme.
   Zu klären ist beides, sonst wird es im Bau geraten.
3. **Bahnabstand bei konturparallelen Bahnen.** Beim Versetzen einer schrägen
   Ecke wird der Abstand zwischen benachbarten Bahnen an der Ecke größer als in
   der Fläche. Wie viel Ungleichmäßigkeit ist thermisch akzeptabel?
4. **Vendoring.** `clipper2-js` lokal einbetten heißt, eine fremde Bibliothek in
   die HTML-Datei zu inlinen. Größe und Lizenz sind zu prüfen, bevor das
   entschieden wird.
5. **Migration bestehender Pläne.** Es gibt keine gespeicherten Pläne, aber die
   Standardwerte in `S` sind das Arbeitsbeispiel. Deren Entsprechung als Polygon
   ist festzulegen, damit „liefert denselben Plan wie heute" prüfbar ist.

## Was ausdrücklich nicht Teil davon ist

- Mehrraum-Verwaltung, Verteiler für mehrere Räume
- Rohrlängen-Optimierung über die gleichmäßige Aufteilung hinaus
- 3D, Aufbauhöhen, Estrichstärken
- Der L-Parameter-Export aus `raumaufmass.html`. Er war als Zwischenlösung
  angedacht und ist mit der Entscheidung für beliebige Räume gegenstandslos —
  übergeben wird das Polygon.
