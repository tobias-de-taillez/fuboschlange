# fuboschlange

Verlegeplaner für Fußbodenheizung — eine einzelne, selbst-enthaltene HTML-Datei.
Kein Server, keine Dependencies, kein Build: `verlegeplan.html` im Browser öffnen.

## Was es macht

- **Beliebiger Grundriss**: eine Eckenliste, konkav und mit schrägen Wänden,
  ohne Löcher. Import aus `raumaufmass.html`, oder ein Rechteck zum Schnellstart.
- **Konturparallele Doppelspirale** (Gegenstrom): die Konturen kommen aus einem
  Abstandsfeld, jede bekommt an einer gemeinsamen Naht eine Lücke, und alle
  Ring-zu-Ring-Sprünge laufen durch diese Lücken. Zerfällt der Raum beim
  Schrumpfen (U-, T-, H-Form), entsteht ein Konturbaum.
- **Randzone an Fensterfronten** mit dichteren Bahnen. Fensterwände werden im
  Plan angeklickt. Omega-Kehren an den Bahnenden halten den Biegeradius ein.
- **Verteiler frei platzierbar** (Klick auf den Plan oder x/y-Felder). Die
  gesamte Verlegung wird darauf ausgerichtet: der Anbindekorridor liegt immer
  an der Verteilerwand.
- **Autofit** auf bis zu 3 Heizkreise: kleinste Kreiszahl, bei der jeder Kreis
  unter der maximalen Kreislänge bleibt.
- **Thermische Heatmap**: Flächenleistung, Oberflächentemperatur und wirksame
  Rohrtemperatur, auf eine Ziel-Gesamtleistung normiert, mit Leistung und
  Volumenstrom je Heizkreis.
- **Druck/PDF** mit Maßstabsbalken auf dem Plan.

## Prüfungen

Die Datei prüft sich bei jedem Laden selbst (Ausgabe in der Browser-Konsole):
Bogenlängen, Spiral-Kreuzungsfreiheit, Randzonen-Ketten, Frame-Rotation,
Thermik-Invarianten (Längengewichtung, Normierung, keine Temperaturaddition).

Dazu ein **Kreuzungs-Bench**: zufällige Parametersets (Raum, Notch, Spiegelung,
Abstände, Fensterwände, Kreiszahl, Verteilerposition irgendwo auf der Kontur)
gegen die harte Regel — keine Schlaufe darf sich selbst oder eine andere
kreuzen, und kein Rohr darf den Raum verlassen. Tiefer prüfen in der Konsole:

```js
crossingBench(500)   // liefert die fehlschlagenden Parametersets
```

Zusätzlich prüfbar auf der Kommandozeile:

```bash
node test/verlegeplan.mjs
```

## Stand

Die Feldgeometrie ist kreuzungsfrei, solange die Konturen beim Schrumpfen nicht
zerfallen — nachgemessen an Rechteck, Trapez, L und einem Fünfeck mit zwei
schrägen Wänden, je bei 100, 150 und 200 mm Bahnabstand. Zerfallende Grundrisse
(U, T, H) werden vollständig verlegt, aber die Übergabe zwischen den Ästen ist
noch nicht als kreuzungsfrei nachgewiesen; das Werkzeug weist das im Plan aus.

**Die Anbindeleitungen sind noch nicht kreuzungsfrei** — der Bench schlägt fehl:
von 40 Zufallssets 35 mit einer Kreuzung, 3 mit einem Rohr außerhalb des Raums.
Sie laufen inzwischen im Randkorridor statt quer durchs Feld, aber die
Spurzuteilung ist noch nicht verschachtelt (siehe `docs/superpowers/specs/`).
Der Bahnabstand ist weiterhin eine Eingabe und wird nicht aus dem Längenbudget
gelöst; bei knapper Kreislänge kann deshalb ein Streifen in der Raummitte
unbelegt bleiben.

Das Tool weist Überlappungen, zu enge Kehren und unplausible Eingaben im Plan
und als Warnung aus, statt sie still zu zeichnen.
