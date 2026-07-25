# fuboschlange

Verlegeplaner für Fußbodenheizung — eine einzelne, selbst-enthaltene HTML-Datei.
Kein Server, keine Dependencies, kein Build: `verlegeplan.html` im Browser öffnen.

## Was es macht

- **Bifilare Doppelspirale** (Gegenstrom) als Verlegemuster, wandparallel mit
  Ecken-Treppe. Vorlauf spiralt rein, Rücklauf um einen Bahnabstand versetzt raus.
- **L-förmige Räume** über einen Ausschnitt (Notch), links oder rechts spiegelbar.
- **Randzone an Fensterfronten** mit dichteren Bahnen; zusammenhängende
  Fensterwände laufen als eine durchgehende U-Form um die Ecken.
  Omega-Kehren an den Bahnenden halten den vollen Biegeradius ein.
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

## Stand

Feldgeometrie und Randzone sind kreuzungsfrei; **die Anbindeleitungen sind es
noch nicht** — der Bench schlägt fehl. Das Spurmodell für die Zuleitungen ist
zu starr und braucht einen anderen Ansatz (siehe `docs/superpowers/specs/`).
Das Tool weist Überlappungen, zu enge Kehren und unplausible Eingaben im Plan
und als Warnung aus, statt sie still zu zeichnen.
