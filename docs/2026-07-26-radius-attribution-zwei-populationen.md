# Radius-Attribution: zwei Proben, zwei Populationen

**Datum:** 2026-07-26
**Anlass:** Zwei parallel laufende Sessions haben in derselben Stunde den Ort des
Radius-Minimums gemessen und kommen zu unvereinbaren Ergebnissen. Dieses Dokument
löst den Widerspruch auf, damit die nächste Runde nicht auf der falschen Zahl
aufsetzt.

## Die zwei Befunde

**A — `probe-radius.mjs` (Commit 4cd4d9f):** alle 20 schlimmsten Punkte sind
Ecken, in drei scharfen Gruppen — 7× `defl 90°, ab 50, bc 160, Wandabstand 90`
(→ r=50, als MANIFOLD_PITCH gedeutet), 6× `defl 135°, ab 81` (→ r=34), 5×
`defl 175–180°` mit Schenkeln im Meterbereich.

**B — Attribution über die Bench-Konfigurationen (Commit 4aa8d3a):** 15 von 19
im Feld, 3 im leadIn, 1 in der Randzone; 11 der 19 mit derselben Signatur
`defl 144–155°` und einem Nachbarsegment von 140–240 mm = 1,7–2,4·s.

## Warum beide recht haben

Die Krümmungsregel ist in beiden Proben Zeichen für Zeichen dieselbe (die aus
`pathCurve`), und beide nehmen den globalen argmin über `plan.loops[*].pts`.
Der Unterschied liegt **vollständig in der Parametererzeugung**:

| | `probe-radius.mjs` | Bench-Attribution |
|---|---|---|
| Konfigurationen | eigener PRNG, Seed 12345 | `crossingBench(20, 20260725)` — dieselben Sätze wie das Gate |
| `bendRadius` | fest 80 mm | 60/70/80/85/100, aus `pipeDia` abgeleitet |
| Notch | **immer** (`notchA` 800–2300) | in 8 von 20 Läufen **keiner** |
| `s`, `randPasses`, `windowEdges`, `loopMode`, `edgeGap`, `pipeDia` | nie gesetzt, bleiben auf den Projekt-Defaults | alle je Lauf gestreut |

`probe-radius.mjs` misst damit eine schmale Umgebung der Projektkonfiguration,
nicht die Population, gegen die `radFails` zählt. Die drei "scharf getrennten
Gruppen" mit exakt wiederkehrenden Werten (50, 81, 90 mm) sind genau das Symptom
dieser Enge: konstante Parameter erzeugen konstante Geometrie.

## Was daraus folgt

- Die Rechnung **"Gruppe 1 und 2 sind zusammen 13 von 20, also kann radFails
  nicht unter 13/20 fallen"** überträgt sich nicht auf den Bench. In der
  Bench-Population hat genau **ein** Lauf `defl 90°`, und kein einziger die
  81-mm-Signatur.
- Der billige Vorschlag aus 4cd4d9f (die 90-Grad-Wende am Verteiler auf zwei
  45-Grad-Knicke verteilen) adressiert damit einen Posten, der im Bench 1/19
  groß ist, nicht 7/20. Er kann trotzdem richtig sein — aber als
  leadIn-Verbesserung, nicht als größter Einzelposten.
- Der größte Einzelposten im Bench bleibt der **Ring-zu-Ring-Sprung an der
  Naht**: 11 von 19, Signatur `defl 144–155°` mit Nachbarsegment 1,7–2,4·s.

## Regel für die nächste Probe

Eine Diagnose-Probe erzeugt ihre Parameter **nicht selbst**. Sie läuft über
`crossingBench(n, seed)` und liest den `all`-Kanal, sonst misst sie eine andere
Frage als die, die das Gate stellt. Wo zusätzliche Felder gebraucht werden,
gehört ein Patch auf eine Kopie der Datei in den Scratchpad — nicht ein zweiter
Generator.

## Nebenbefund: zwei Sessions, ein Arbeitsverzeichnis

Beide Sessions haben zwischen 00:05 und 00:15 `verlegeplan.html` geschrieben.
Sichtbare Folgen: ein `git checkout` der einen Session hat der anderen mitten im
Lauf eine Funktion entfernt (deren zwei Benchläufe sind dadurch ungültig, nicht
neutral), und eine ungemessene Arbeitskopie-Änderung der einen wurde von der
anderen als „unbekannt" gesichert. Messungen aus diesem Fenster sind nur gültig,
wenn die gemessene Datei nachweislich stabil war — für beide oben zitierten
Attributionen wurde das nachträglich gegen `git show HEAD:verlegeplan.html`
geprüft (identische MD5, Probe reproduziert).
