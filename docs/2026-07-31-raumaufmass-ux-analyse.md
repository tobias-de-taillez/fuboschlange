# Raumaufmaß — UX-Analyse und Umbauplan

Stand vor dem Umbau: funktionsfähiges Desktop-Werkzeug mit ungestylter
Browser-Default-Optik, reine Maus-Bedienung, Geodäten-Vokabular im UI.
Ziel: als Web-App gehostet (v0.dev/Vercel, statisches Single-File-HTML),
auf dem Handy **auf der Baustelle** benutzbar, am PC zur Nacharbeit.

## Nutzungskontext

Eine Person steht im Raum: Laser-Entfernungsmesser in einer Hand, Handy in
der anderen. Sie läuft die Ecken ab, skizziert grob, misst dann Strecken.
Die Präzision kommt vom Solver, nicht von der Skizze — das versteht das
Tool bereits richtig. Die zwei Fragen des Nutzers sind:
**"Was muss ich noch messen?"** und **"Stimmt alles?"**
Alles andere ist Beiwerk.

## Befunde

### A — Mobile-Blocker (Tool auf dem Handy unbenutzbar)

1. **Kein `viewport`-Meta** → Handy rendert 980-px-Desktop-Layout, alles winzig.
2. **Nur Mouse-Events** → Drag auf Touch unzuverlässig; **Rechtsklick ist die
   einzige Löschfunktion** und existiert auf Touch nicht.
3. **Feste 420-px-Sidebar** → auf 375-px-Screen bleibt kein Canvas übrig.
4. **Hit-Radius 14 px, Punktmarker 5 px** → mit dem Finger nicht zu treffen
   (Plattform-Standard: 44–48 px Touch-Targets).
5. **Kein Pinch-Zoom/Pan** — nur Autofit. In L-Räumen keine Präzision möglich.
6. **Hotkeys 1/2/3, Strg+Z, Hover-Highlights** → auf Touch unerreichbar,
   damit auch **kein Undo**.
7. `alert`/`confirm`/`prompt` als Dialog-UI.

### B — Workflow-Reibung (beide Plattformen)

8. **Drei Modi, wo zwei reichen.** Ecken setzen und Wände ziehen ist EIN
   Vorgang (den Raum ablaufen). Aktuell: n Klicks Punkte, Moduswechsel,
   2n Klicks Wände — oder den „Wandzug schließen"-Knopf entdecken.
9. **Kein geführter Messfluss.** Das Tool weiß, welche Messung als Nächstes
   den größten Wert hat (Vorschlagsliste!), zwingt den Nutzer aber, nach
   jeder Eingabe neu zu zielen.
10. **Leerer Start ohne Anleitung** — Status zeigt „—".
11. **Maßeingabe-Popup** klein, ohne große Touch-Knöpfe, kann auf Mobile
    unter der Tastatur landen.

### C — Verständlichkeit

12. **Geodäten-Jargon als Primärsprache:** „Überbestimmt — σ̂ = 3.2 mm",
    „Red.", „w", „nicht prüfbar". Der Zielnutzer kennt weder Redundanzanteile
    noch Baarda-Tests. Klartext gehört nach vorn, Statistik hinter einen
    Details-Schalter (und dort vollständig erhalten — sie ist der Kern des
    Tools).
13. **Die 7-Spalten-Tabelle ist das Hauptobjekt**, dabei sind die
    Nutzerfragen „Was noch messen?" (Vorschläge) und „Stimmt was nicht?"
    (Ausreißer). **Fläche und Umfang — das eigentliche Ergebnis — stehen
    ganz unten.**

### D — Optik

14. Ungestaltet (Browser-Defaults, `#ccc`-Rahmen). Für ein gehostetes
    Produkt braucht es eine entschiedene visuelle Richtung.

## Anti-AI-Slop-Merkliste (Rechercheergebnis)

Erkennungszeichen, die konsequent vermieden werden: Lila/Blau-Gradients,
Glassmorphism + Glow, 24-px+-Radien, Cards-in-Cards, Karten mit farbigem
Akzentrand, Inter/Roboto als Reflex, Bounce/Pulse-Animationen, Emoji als
Icons, Hero-Metrik-Feature-Schema, generisches SaaS-Vokabular, überall
gleiche Abstände. Stattdessen: **eine** entschiedene Richtung mit
festgelegten Tokens, Typo-Hierarchie mit echtem Größenkontrast, Motion nur
bei Datenänderung.

**Gewählte Richtung: technisches Messwerkzeug / Bauplan.** Warmweißes
Papier, Tinte, genau ein Akzent (verbranntes Orange), semantische
Statusfarben (grün/bernstein/rot), `tabular-nums` für alle Maße,
1-px-Linien, 1-m-Raster + Maßstabsbalken im Plan, Radien ≤ 6 px, keine
Schatten außer funktional am Popover. System-Font-Stack (ehrlich, schnell,
kein Webfont-Reflex).

## Maßnahmen

- **M1 Responsive Zwei-Layout.** Desktop ≥ 880 px: Canvas + rechte
  Seitenleiste. Mobile: Canvas oben (~55 vh), Panel darunter scrollbar,
  Statuskarte sticky.
- **M2 Pointer-Events.** Pinch-Zoom, Zwei-Finger- und Leerraum-Pan,
  Wheel/Trackpad-Zoom, große Touch-Targets (24-px-Hit-Radius, 8-px-Marker),
  Undo- und Einpassen-Knopf in der Werkzeugleiste. Löschen: Long-Press
  (Touch) oder Rechtsklick (Desktop) → Bestätigungs-Popover statt
  Sofort-Löschen.
- **M3 Zwei Modi.** „Zeichnen": Tipp ins Leere = neue Ecke + Wand vom
  letzten Punkt (Kette), Tipp auf ersten Punkt = Wandzug schließen, Tipp auf
  anderen Punkt = Wand dorthin, Ziehen = verschieben. „Messen": Wand oder
  zwei Punkte antippen → Eingabe; Vorschlags-Chips direkt antippbar.
- **M4 Geführter Messfluss.** Nach Eingabe über einen Vorschlags-Chip
  springt die Eingabe automatisch zum nächsten Vorschlag; Schließen beendet
  die Führung.
- **M5 Panel neu geordnet.** 1) Statuskarte: Ampel + Klartext + **Fläche/
  Umfang groß**. 2) „Als Nächstes messen"-Chips (zwei Gruppen: „damit die
  Form eindeutig ist" / „zur Kontrolle"). 3) Messliste kompakt mit
  Status-Badges (geprüft ±x / ungeprüft / verdächtig / aus); v, Red., w, σ
  hinter „Details". 4) Wandlängen. 5) Daten (Export/Import/Verwerfen).
- **M6 Mobile Maßeingabe** als fixierte Leiste über der Tastatur
  (VisualViewport-nachgeführt), ≥ 16 px Schrift (kein iOS-Autozoom),
  große Bestätigen-Taste.
- **M7 Klartext-Status.** „Noch 2 Messungen, dann ist die Form eindeutig" /
  „Geprüft — Genauigkeit ± 3,2 mm" / „Mindestens ein Maß ist falsch —
  größte Abweichung 87 mm". Jargon nur noch im Details-Bereich.
- **M8 Design-Tokens** wie oben; Legende als einklappbares Element.

## Bewusst nicht gemacht

- **Kein React/v0-Komponenten-Umbau:** Single-File-HTML ohne Build deployt
  auf v0/Vercel als statische Seite und bleibt der Projektlinie treu
  (README: kein Server, keine Dependencies). Der `core`-Block und die
  Selbstchecks (`test/run.mjs`) bleiben unangetastet.
- **Kein Dark Mode:** Einsatzort ist die helle Baustelle; Papier-Look ist
  die Entscheidung. Nachrüstbar über die Token-Variablen.
- **Keine Datei-Persistenz über Autosave/JSON hinaus** (localStorage trägt
  die halbe Stunde Aufmaß bereits).
