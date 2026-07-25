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
| Standardraum, Verteiler Außenwand unten | **9 Kreuzungen**, 0 außerhalb |
| dieselbe Lage, Selbstkreuzungen innerhalb eines Kreises | **0** |
| Verteiler Außenwand links | 9 Kreuzungen, 0 außerhalb |
| Verteiler Notch-Innenwand, senkrecht | 14 Kreuzungen, **7 Segmente außerhalb** |
| Verteiler Notch-Innenwand, waagerecht | **50 Kreuzungen**, 0 außerhalb |

Die Notiz in `285dabe` sprach von 2 Segmenten außerhalb bei Verteiler auf einer
Notch-Wand. Nachgemessen sind es 7, und auf der waagerechten Notch-Wand
verfünffacht sich zusätzlich die Kreuzungszahl. Die Notiz war zu günstig.

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

### 2b. Korrektur: Front ist zu schwach, verschachtelte Spuren sind das Richtige

Die Forderung „jede Teilfläche berührt die Verteilerwand" ist erfüllbar in einem
Rechteck und nicht erfüllbar, sobald ein Teil der Fläche hinter einer
einspringenden Ecke liegt oder der Verteiler auf einer Innenwand sitzt — was die
Messung oben mit 50 Kreuzungen und 7 Segmenten außerhalb genau trifft. Ein
Verfahren, das dort aussteigt, ist kein Verfahren.

Der allgemeine Fall ist eine **Planaritätsfrage**, und sie hat eine Antwort. Alle
Anbindeleitungen starten am selben Ort. Sie kreuzen sich genau dann nicht, wenn
ihre Reihenfolge am Verteiler dieselbe ist wie die Reihenfolge, in der ihre
Teilflächen beim Umlauf durch den Raum erreicht werden. Diese Bedingung lässt
sich **durch Konstruktion** erfüllen statt durch Prüfung:

- Die Teilflächen werden in **einer** Reihenfolge gebildet — Umlauf vom Verteiler
  aus entlang des Rands — statt beliebig zugeteilt.
- Die Anbindeleitungen laufen in einem Korridor, der dem Raumrand folgt. Spur *k*
  liegt im Abstand *k · Spurbreite* von der Wand.
- Spuren sind ineinandergeschachtelte Randversätze. Zwei Versätze desselben
  Randes schneiden sich nicht. Jeder Kreis verlässt seine Spur bei seiner eigenen
  Teilfläche.

Damit braucht keine Teilfläche eine eigene Front. Eine Fläche hinter einer
einspringenden Ecke bekommt eine weiter außen liegende Spur, und die Leitung
läuft am Rand dorthin — ohne fremdes Feld zu queren, weil der Korridor kein Feld
ist.

Das ist derselbe Mechanismus wie im Feld: Spuren **sind** Randversätze. Der
Bahnplaner bekommt dadurch nicht zwei Verfahren, sondern eines — die äußersten
Versätze sind Korridor, der Rest ist Feld.

**Warum das nicht der bereits verworfene Ring ist.** In `285dabe` wurde ein
umlaufender Ringkorridor entfernt, weil er „die Verlegefläche halbiert" hat: er
reservierte die volle Korridorbreite auf **allen** Seiten, unabhängig davon, ob
dort überhaupt eine Leitung lief. Der Fehler war die pauschale Reservierung, nicht
der Ring. Reserviert werden darf nur, was tatsächlich belegt ist: auf jedem
Randstück so viele Spuren, wie dort Leitungen vorbeikommen — das sind nahe am
Verteiler viele und am fernen Ende genau eine.

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

## Anforderungen an den Bahnplaner

Der Raum ist gegeben. Was der Planer nicht kann, ist sein Mangel — nicht der des
Raums. Die folgenden Punkte standen in einer früheren Fassung als Fragen an den
Nutzer und gehören dort nicht hin.

### Schräge Ecken sind kein Sonderfall

Eine frühere Fassung behauptete, an schrägen Ecken sei der Bahnabstand nicht
definiert und an einspringenden Ecken entstehe eine Lücke. **Beides ist falsch.**

Ein echter Randversatz hat als definierende Eigenschaft den konstanten
Normalabstand. Zwei aufeinanderfolgende Versätze liegen überall genau den
Bahnabstand auseinander — an einer 90°-Ecke wie an einer 63°-Ecke. Die
Ungleichmäßigkeit, die ich vermutet hatte, entsteht nur bei
**Gehrungs-Ecken auf einem Polygonzug**, nicht beim Versatz selbst.

An einer Ecke ist die Verrundung ohnehin die physikalisch richtige Wahl: das
Rohr hat einen Mindestbiegeradius und **kann** keine scharfe Ecke. Der Wert dafür
existiert bereits als `S.bendRadius`, und `fillet()` setzt ihn heute schon um.

Was an Ecken wirklich passiert und behandelt werden muss:

- **Spitze Ecke:** aufeinanderfolgende Versätze laufen zusammen, ab einer
  bestimmten Tiefe verschwindet die Ecke. Die dortigen Bahnen enden einfach.
  Das ist korrekt und nicht zu reparieren.
- **Einspringende Ecke:** der Versatz erzeugt einen Bogen mit dem Bahnabstand als
  Radius. Kein Loch, keine Lücke.
- **Restfläche in der Mitte:** nach dem letzten vollen Versatz bleibt ein
  Streifen entlang der Mittelachse übrig, den keine Bahn erreicht. **Das** ist
  der echte Deckungsverlust, und er sitzt in der Raummitte, nicht an den Ecken.

### Der Deckungsverlust muss beziffert werden, nicht wegdefiniert

Die Restfläche ist die einzige Stelle, an der konturparallele Bahnen
systematisch Boden unbeheizt lassen. Der Planer muss sie **ausrechnen und
anzeigen** — als Fläche in m² und als Anteil. Die Thermik-Schicht kann sie
ohnehin schon sichtbar machen.

Erst wenn die Zahl auf dem Tisch liegt, ist die Frage „reicht das thermisch"
überhaupt beantwortbar. Sie vorher zu stellen heißt, sie zu raten.

### Kreuzungsfreiheit ist eine Konstruktionsaufgabe, keine Prüfaufgabe

Siehe Abschnitt 2b. Der Planer prüft nicht nachträglich auf Kreuzungen und
repariert — er ordnet die Spuren so an, dass Kreuzungen nicht entstehen können.
Der bestehende Bench bleibt trotzdem, als Nachweis und nicht als Krücke.

### Was dem Planer abverlangt wird, in einem Satz

Beliebiges einfaches Polygon, Verteiler an beliebiger Stelle des Rands, beliebige
Kreiszahl — Ergebnis kreuzungsfrei, vollständig im Raum, mit beziffertem
Deckungsverlust.

## Offene Fragen

Übrig bleiben zwei, und beide sind wirklich deine Entscheidung, weil sie vom Bau
abhängen und nicht von Geometrie:

1. **Zweite Leitungsebene.** Falls sich in einem Extremfall doch keine planare
   Anordnung finden lässt: darf eine Anbindeleitung eine andere kreuzen, indem
   sie darunter durchgeführt wird? Real im Estrich möglich, kostet Aufbauhöhe.
   Der Planer soll das nicht brauchen — aber ob es als Notausgang erlaubt ist,
   bestimmt, ob er im Zweifel abbricht oder abtaucht.
2. **Zulässiger Deckungsverlust.** Ab welchem Anteil unbeheizter Fläche ist ein
   Plan unbrauchbar? Zu beantworten, wenn der Planer die Zahl liefert — vorher
   nicht sinnvoll.

Technisch noch zu klären, ohne dass es dich betrifft: Größe und Lizenz von
`clipper2-js` vor dem Vendoring, und die Polygon-Entsprechung der heutigen
Standardwerte in `S`, damit „liefert denselben Plan wie heute" prüfbar ist.

## Was ausdrücklich nicht Teil davon ist

- Mehrraum-Verwaltung, Verteiler für mehrere Räume
- Rohrlängen-Optimierung über die gleichmäßige Aufteilung hinaus
- 3D, Aufbauhöhen, Estrichstärken
- Der L-Parameter-Export aus `raumaufmass.html`. Er war als Zwischenlösung
  angedacht und ist mit der Entscheidung für beliebige Räume gegenstandslos —
  übergeben wird das Polygon.
