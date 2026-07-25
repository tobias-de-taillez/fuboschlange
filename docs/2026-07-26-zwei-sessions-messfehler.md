# Zwei Sessions, ein Arbeitsverzeichnis: zwei konkrete Messfehler

**Datum:** 2026-07-26
**Anlass:** In Runde 17 hätte ich fast einen korrekten Fix zurückgenommen, weil
zwei Messungen falsch waren. Beide Fehler sind reproduzierbar und beide kommen
aus derselben Ursache. Hier stehen sie, damit die nächste Runde sie nicht
wiederholt.

## Fehler 1: A/B gegen den falschen Vorher-Stand

`worstCross` sprang von 38 auf 570, und ich habe das meinem eigenen Commit
zugeschrieben. Falsch. Der Ablauf:

1. Ich baue `head17.html` aus `git show HEAD:verlegeplan.html`, als HEAD noch
   `aba90f3` ist.
2. Die parallele Session committet `1f80b92` — und sammelt dabei mit `git add -A`
   meine unversionierte, in Arbeit befindliche `resampleArc`-Änderung mit ein.
3. Ich committe `d75fb3e` obendrauf und vergleiche gegen `head17.html`.

Der Vergleich läuft damit über **zwei** Änderungen statt über meine eine. Und
die 570 stammen aus `1f80b92`: dort tastet `drawnPoints` konstruierte Bögen zum
ersten Mal als BÖGEN ab statt als Sehnen. Die Kreuzungen waren vorher da und
unsichtbar — sie sind aufgedeckt, nicht erzeugt. Die Commit-Nachricht von
`1f80b92` sagt das auch, ich hatte sie beim Messen nur nicht gelesen.

Sauber gemessen:

```
1f80b92 (ihr Commit, enthält meinen Resampler)   cross 19  cov 10  rad 18  worst 570
d75fb3e (meine Dedupe-Schwelle obendrauf)        cross 18  cov 10  rad 18  worst 570
```

**Regel:** der Vorher-Stand eines A/B ist `HEAD^` zum Zeitpunkt des EIGENEN
Commits, nicht eine früher gezogene Kopie. In einem Repo mit zwei Schreibern ist
eine 20 Minuten alte Kopie kein Vorher-Stand.

## Fehler 2: zwei `load()` in einem Prozess

`cmp-pair.mjs` lud beide Fassungen im selben Node-Prozess:

```js
const A = load(a).crossingBench(20, SEED).all;
const B = load(b).crossingBench(20, SEED).all;
```

Ergebnis: kein einziger Lauf unterschied sich um mehr als 5 Kreuzungen, Summe
787 gegen 784. Dieselbe Frage über zwei getrennte Prozesse: Lauf 15 geht von
38 auf 570. Der In-Prozess-Vergleich war also blind.

Ursache: `load()` setzt `globalThis.document`, `globalThis.window` und die
`requestAnimationFrame`-Brücke neu. Der zweite Aufruf überschreibt, was der erste
aufgebaut hat, und die beiden Skript-Instanzen teilen sich diesen Zustand.

**Regel:** ein Prozess, eine Datei. `bench.mjs --file=<html>` macht das richtig
(eigener Prozess je Fassung) — Diagnose-Proben müssen es genauso machen.

## Ursache beider Fehler

Zwei Claude-Sessions schreiben `verlegeplan.html` im selben Arbeitsverzeichnis.
Bisherige Kosten, alle belegt:

- eine Funktion verschwand der anderen Session mitten im Lauf aus der Datei
  (mein `git checkout`) — zwei ihrer Benchläufe waren dadurch ungültig, nicht
  neutral
- eine ungemessene Arbeitskopie von mir wurde von ihr als „unbekannte Änderung"
  gesichert, später mit `git add -A` mitcommittet und erschien damit als ihre
- zwei Attributionen aus unterschiedlichen Populationen mussten in einem eigenen
  Commit gegeneinander gestellt werden (`a42b82f`)
- der Beinahe-Rückbau eines korrekten Fixes, siehe oben

Das ist kein Werkzeugproblem, sondern eines der Arbeitsteilung: eine der beiden
Sessions sollte aufhören, oder beide brauchen getrennte Worktrees.
