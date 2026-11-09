---
name: Raumaufmaß (Werkzeugfamilie)
description: Messwerkzeug auf Papier. Warmweiße Flächen, Tinte, ein Akzent, feine Linien, Systemschrift.
colors:
  paper: "#ebe8e0"
  surface: "#faf9f6"
  canvas: "#f5f3ed"
  floor: "#fbfaf7"
  ink: "#24221d"
  ink2: "#4b473e"
  muted: "#6f6a5e"
  pencil: "#a39d90"
  line: "#d8d3c6"
  line2: "#e8e4da"
  hover: "#eeeae0"
  press: "#e4dfd3"
  accent: "#c2410c"
  accent-hover: "#a8380a"
  accent-bg: "#f9e7dc"
  accent-line: "#ebbda2"
  good: "#1a6b34"
  bad: "#b3261e"
  white: "#ffffff"
  sheet-ink: "#1c1b18"
  sheet-muted: "#6b665b"
  sheet-line: "#e5e2da"
  sheet-floor: "#f4f2ec"
typography:
  ergebnis:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
    fontFeature: "tabular-nums"
  titel:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.4
    fontFeature: "tabular-nums"
  text:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tabular-nums"
  nebentext:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tabular-nums"
  beschriftung:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tabular-nums"
rounded:
  control: "4px"
  flaeche: "6px"
  schalter: "8px"
spacing:
  eng: "4px"
  control-gap: "6px"
  gruppe: "8px"
  karte-inset: "12px"
  panel-inset: "16px"
  blatt-gap: "24px"
  control-height: "28px"
  icon-button: "30px"
  listenzeile: "32px"
  leiste: "44px"
  karte: "292px"
  panel: "320px"
  start-spalte: "760px"
  min-breite: "860px"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.text}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "{spacing.control-height}"
  button-hover:
    backgroundColor: "{colors.hover}"
  button-active:
    backgroundColor: "{colors.press}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.white}"
    typography: "{typography.titel}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "{spacing.control-height}"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-quiet:
    textColor: "{colors.ink2}"
    rounded: "{rounded.control}"
  button-quiet-hover:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.ink}"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.bad}"
  icon-button:
    textColor: "{colors.ink2}"
    rounded: "{rounded.control}"
    size: "{spacing.icon-button}"
  icon-button-hover:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.ink}"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.text}"
    rounded: "{rounded.control}"
    padding: "0 7px"
    height: "{spacing.control-height}"
  leiste:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    height: "{spacing.leiste}"
    padding: "0 8px 0 6px"
  schritt:
    textColor: "{colors.ink2}"
    typography: "{typography.text}"
    padding: "0 12px"
  schritt-aktiv:
    textColor: "{colors.ink}"
    typography: "{typography.titel}"
  panel:
    backgroundColor: "{colors.surface}"
    width: "{spacing.panel}"
  stand:
    textColor: "{colors.ink}"
    typography: "{typography.titel}"
    padding: "14px 16px"
  stand-hover:
    backgroundColor: "{colors.hover}"
  stand-falsch:
    textColor: "{colors.bad}"
  panel-abschnitt:
    padding: "14px 16px 6px"
  karte-am-objekt:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.flaeche}"
    padding: "10px 12px 12px"
    width: "{spacing.karte}"
  eingabe-an-der-strecke:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.flaeche}"
    padding: "6px 6px 6px 10px"
  segment-aktiv:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
  schalter:
    backgroundColor: "{colors.press}"
    rounded: "{rounded.schalter}"
    width: "28px"
    height: "16px"
  schalter-an:
    backgroundColor: "{colors.ink}"
  menu:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.flaeche}"
    padding: "4px"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.flaeche}"
    width: "520px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    typography: "{typography.nebentext}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
  raumliste:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.flaeche}"
  raumzeile:
    textColor: "{colors.ink}"
    padding: "10px 8px 10px 12px"
  raumzeile-hover:
    backgroundColor: "{colors.hover}"
  blatt:
    backgroundColor: "{colors.white}"
    textColor: "{colors.sheet-ink}"
    width: "560px"
    padding: "6.5% 7%"
---

# Design System: Raumaufmaß (Werkzeugfamilie)

Quelle dieses Dokuments ist der vom Nutzer am 09.11.2026 freigegebene Prototyp `docs/superpowers/prototypes/raumaufmass-hauptweg.html`. Er hat seine Welt aus `raumaufmass.html` geerbt und leiser gemacht. Wo beide Dateien voneinander abweichen, gilt der Prototyp. Alle Werte unten stehen so in dieser Datei; wo sie in sich uneinheitlich ist, steht das am Ende unter „Uneinheitlich im Prototyp“ und wird hier nicht geglättet.

Das System gilt für alle Werkzeuge auf demselben Origin: Startbildschirm, Raumaufmaß, später Fliesenplan und Küchenplaner. Begriffe nach `GLOSSARY.md`.

Nicht Teil des Systems: die gestrichelte Prototyp-Leiste am unteren Rand (`#proto`, `#demo`) ist Gerüst des Prototyps. Mobile ist nicht Teil des Systems; die Oberfläche ist für den Schreibtisch gebaut (Mindestbreite 860 px, Maus, Touchpad, Tastatur).

## Overview

**Creative North Star: "Messwerkzeug auf Papier"**

Die Oberfläche zeigt nur den Stand und den nächsten Schritt. Alles andere liegt an dem Ding, das man anfasst: an der Ecke, der Strecke, der Wand, der Öffnung. Der Plan ist ein Blatt, auf dem mit Bleistift skizziert und mit Tinte festgehalten wird. Eine Wand ohne Maß ist ein dünner gestrichelter Bleistiftstrich, eine Wand mit Maß ein Tintenstrich. Dieser Wechsel ist die Signatur der Familie.

Die Flächen sind warmweiß und flach, getrennt durch 1-px-Linien. Es gibt eine Schrift (die des Systems), zwei Schriftstärken, vier Schriftgrößen und genau einen Akzent, ein verbranntes Orange. Der Akzent ist selten: im Plan zeigt er, welche Strecke als Nächstes dran ist und was angefasst ist; in der Bedienung trägt er die eine Hauptaktion und den Fokus. Zustände haben je eine Farbe mit einer Aufgabe. Was offen ist, bekommt keine Warnfarbe, sondern einen hohlen Ring.

Gegenüber dem Bestand entfallen die Statuszeile, die Schalter in der Leiste, Grün und Rot als Linienfarben für „gemessen“ und „fehlt“ sowie Bernstein für „offen“. Was als Nächstes zu tun ist, sagen der Stand und der Plan.

**Key Characteristics:**
- Bleistift wird Tinte, sobald eine Strecke ein Maß hat.
- Ein Akzent, im Plan nur für die nächste Strecke und die Auswahl.
- Diagonalen sind unsichtbar, außer sie sind dran, angefasst oder falsch.
- Der Stand ist ein Satz mit einem Punkt davor; Statistik liegt dahinter.
- Bedienung liegt am Objekt (Karte, Eingabe), nicht in der Leiste.
- Flach, 1-px-Linien, Radien 4 und 6 px, Systemschrift, tabellarische Ziffern.
- Am Ende liegt ein Blatt: das Aufmaßblatt als weißes Papier auf der Fläche.

## Colors

Warmes Papier in drei Helligkeiten, eine Tinte in drei Stufen, ein Bleistiftgrau, ein Akzent, zwei Zustandsfarben. Die Werte stehen im Frontmatter; im Quelltext sind sie Custom Properties gleichen Namens (`--paper`, `--ink`, …).

### Primary
- **Verbranntes Orange** (`accent`): die nächste Strecke im Plan, die Auswahl (angefasste Ecke oder Strecke, gewählte Öffnung, aktuelle Wand im Lageplan), der Ring, der den Raum schließt, die eine Hauptaktion je Ansicht (`button.primary`), der Fokusring, die Schreibmarke.
- **Orange gedrückt** (`accent-hover`): Hover der Hauptaktion. Im Quelltext ein Literal ohne Custom Property.
- **Orange-Papier** (`accent-bg`): Textmarkierung (`::selection`) und Füllung der Genauigkeits-Ellipsen je Ecke.
- **Orange-Linie** (`accent-line`): Rand der Genauigkeits-Ellipsen und Tastaturfokus auf einer Strecke im Plan (als 14 px breites Band).

### Secondary
- **Geprüft-Grün** (`good`): ausschließlich der Punkt vor dem Stand „Geprüft“, im Panel und in der Raumzeile. Keine Linie, kein Text, keine Fläche.
- **Fehler-Rot** (`bad`): ein Maß, das nicht passt. Punkt und Satz des Stands, Strich der Strecke im Plan, Abweichung als Zahl, außerdem die Schrift löschender Knöpfe.

### Neutral
- **Tischfläche** (`paper`): Grund hinter allem, Startbildschirm, Fläche unter den Blättern der Ausgabe.
- **Blatt** (`surface`): Leiste, Panel, Karte am Objekt, Eingabe, Menü, Dialog, Raumliste.
- **Zeichenfläche** (`canvas`): Grund des Plans und der Wandansicht, aufgeklappte Statistik unter dem Stand; auch die Farbe, mit der eine Öffnung die Wand unterbricht und die den Lichthof um Planbeschriftung bildet.
- **Raumfläche** (`floor`): Füllung des geschlossenen Raums, der Wand in der Wandansicht und der Miniatur in der Raumzeile.
- **Tinte** (`ink`): Text, gemessene Wände, Ecken, Marke des aktiven Schritts, eingeschaltete Schalter und Segmente, Toast.
- **Tinte hell** (`ink2`): Nebentext, Beschriftung von Feldern, Längen im Plan, ruhende Icons, der hohle Ring für „offen“.
- **Gedämpft** (`muted`): Gruppenbeschriftungen, Einheiten, Hinweise, Platzhalter, Tastenkürzel, Eckbuchstaben, Maßstab. Dunkler als im Bestand (#7c766a), damit kleine Schrift auf Blatt und Zeichenfläche trägt.
- **Bleistift** (`pencil`): alles nur Skizzierte oder Angenommene: Wand ohne Maß, Gummiband beim Zeichnen, angenommene Raumhöhe, Lageplan, Miniatur einer Skizze, Punkt eines Raums ohne Stand. Nie für Text.
- **Linie** (`line`): Ränder von Flächen und Bedienelementen.
- **Haarlinie** (`line2`): Trenner innerhalb einer Fläche (Listenzeilen, Kartenabschnitte, Menügruppen) und das 1-m-Raster des Plans.
- **Hover** (`hover`) und **Gedrückt** (`press`): Rückmeldung auf Zeiger; `press` ist auch die Spur des ausgeschalteten Schalters.
- **Weiß** (`white`): Grund von Eingabefeldern, Schrift auf Akzent und Tinte, Knopf des Schalters, das Blatt. Literal `#fff` im Quelltext.

### Blatt (Druck)
Das Aufmaßblatt hat eine eigene kleine Palette, weil es Papier im Druck ist und nicht Oberfläche: **Drucktinte** (`sheet-ink`), **Druck gedämpft** (`sheet-muted`) für Eckbuchstaben und Feldnamen, **Drucklinie** (`sheet-line`) für Tabellenlinien, **Druck-Raumfläche** (`sheet-floor`). Im Quelltext Literale ohne Custom Property.

### Zustände und ihre eine Aufgabe

| Zustand | Zeichen | Wo |
|---|---|---|
| Skizze, noch kein Stand | gefüllter Punkt in `pencil` | Stand, Raumzeile |
| Offen (Maße fehlen, oder eindeutig, aber ungeprüft) | hohler Ring, 1,5 px in `ink2` | Stand, Raumzeile |
| Geprüft | gefüllter Punkt in `good` | Stand, Raumzeile |
| Ein Maß passt nicht | gefüllter Punkt in `bad`, Satz in `bad` | Stand; im Plan die Strecke in `bad` |
| Als Nächstes dran | `accent` | Strecke im Plan, Name des ersten Vorschlags im Panel |
| Angefasst | `accent` | Ecke, Strecke, Öffnung, Wand im Lageplan |
| Nur skizziert oder angenommen | `pencil`, gestrichelt | Wand ohne Maß, Höhe ohne Maß |
| Eingeschaltet | `ink` | Schalter, Segment |

### Named Rules
**Die Bleistift-wird-Tinte-Regel.** Eine Strecke ohne Maß ist Bleistift (gestrichelt, dünn), eine Strecke mit Maß ist Tinte (durchgezogen, 2 px). „Gemessen“ hat keine eigene Farbe.

**Die Ein-Akzent-Regel.** Orange zeigt im Plan nur zwei Dinge: was als Nächstes dran ist und was angefasst ist. In der Bedienung trägt es die eine Hauptaktion je Ansicht und den Fokus. Es färbt keine Flächen, keine Überschriften, keine Zustände.

**Die Hohler-Ring-Regel.** „Offen“ ist kein Alarm. Ein fehlendes Maß bekommt einen hohlen Ring in Tinte, kein Bernstein. Rot erscheint erst, wenn ein Maß den anderen widerspricht.

**Die Grün-ist-ein-Punkt-Regel.** Grün gibt es nur als Punkt vor „Geprüft“.

**Die Auf-Papier-Regel.** Text direkt auf `paper` steht in `ink2`. `muted` erreicht dort nur etwa 4,4 : 1 und bleibt den helleren Flächen `surface` und `canvas` vorbehalten.

## Typography

**Schrift:** die Systemschrift (`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`) für alles, auch für die 20-px-Zahlen. Keine Webfonts, keine zweite Familie, keine Monospace.

**Character:** sachlich wie die Beschriftung eines Messgeräts. Zahlen stehen überall in tabellarischen Ziffern (`font-variant-numeric:tabular-nums` am `body`), damit Längen untereinander fluchten.

### Hierarchy
- **Ergebnis** (600, 20 px, Laufweite −0,01em): Fläche und Umfang unter dem Stand; Name des Gebäudes auf dem Startbildschirm. Die Einheit hinter der Zahl steht in Nebentext (12 px, 400, `muted`).
- **Titel** (600, 13 px): der Satz des Stands, Raumname in der Leiste, aktiver Schritt, Kopf einer Karte („Wand A–B“), Dialogtitel, Hauptaktion, Raumname in der Raumzeile, Abschnittstitel der Ausgabe.
- **Text** (400, 13 px, Zeilenhöhe 1,4): Grundgröße für Knöpfe, Felder, Zeilen, Menüpunkte.
- **Nebentext** (400, 12 px): Begründungen und Hinweise („zur Kontrolle“, „angenommen“), Stand in der Raumzeile, Abweichungen in der Karte, Toast, Geschossname, der Hinweis zum Speicherort. 600 nur für eine falsche Abweichung.
- **Beschriftung** (11 px): Gruppenbeschriftungen in Panel und Menü (600, `muted`), Längen im Plan und in der Wandansicht (400, `ink2`), Maßstab, Schrittziffern, Tastenkürzel, Feldnamen über den Ergebniszahlen (400, `muted`).

Schreibweise der Zahlen: Längen in Metern mit drei Nachkommastellen und Komma (`3,046`), im Plan ohne Einheit, in Karte und Panel mit ` m`; Umfang und Fläche mit zwei Stellen; Abweichungen in mm mit Vorzeichen und echtem Minus (`−2,1 mm`); Genauigkeit als `± 5,6 mm`; Strecken mit Halbgeviertstrich (`A–B`).

Das Aufmaßblatt setzt eigene, kleinere Größen (Kopf 15 px, Fußzahlen 14 px, Text 11 px, Planschrift 9 px, Wandliste 8,5 px bei 560 px Blattbreite; die Schrift im Grundriss skaliert mit dem Raum). Sie gelten nur auf dem Blatt.

### Named Rules
**Die Vier-Größen-Regel.** 20, 13, 12, 11 px. Eine fünfte Größe braucht einen Grund, der hier eingetragen wird.

**Die Zwei-Stärken-Regel.** 400 und 600. Kein Kursiv außer im Platzhalter eines Felds, keine Versalien, keine gesperrte Schrift.

## Layout

Die Seite füllt das Fenster und scrollt nicht (`body` mit `overflow:hidden`); gescrollt wird nur im Panel, auf dem Startbildschirm und unter den Blättern der Ausgabe. Mindestbreite 860 px, keine Umbrüche darunter.

- **Raster des Werkzeugs:** Leiste 44 px hoch über die volle Breite; darunter links der Plan über die volle Höhe, rechts das Panel mit 320 px.
- **Leiste, von links:** zurück zu den Räumen, Raumname, nach einer Haarlinie die Schritte 1 Skizze, 2 Maße, 3 Wände, ein Pfeil, Ausgabe; rechts Rückgängig, Wiederherstellen, Menü. Auf dem Startbildschirm steht links nur der Name des Werkzeugs, rechts „Datei öffnen“ und die Hauptaktion „Neuer Raum“.
- **Plan:** oben links der Maßstab, oben rechts „Ansicht einpassen“, unten links „Fehler / Wunsch melden“. Sonst liegt nichts fest auf dem Plan; Karte, Eingabe und Rückmeldung erscheinen am Objekt.
- **Panel:** oben immer der Stand, darunter der Inhalt des Schritts, zuletzt die Hauptaktion „Weiter: …“.
- **Startbildschirm:** eine Spalte, höchstens 760 px, mittig auf `paper`; Gebäude als Überschrift, Geschoss als Zwischenzeile, darunter je eine Raumliste.
- **Ausgabe:** die Blätter mittig untereinander auf `paper`, 560 px breit (höchstens Fensterbreite minus 64 px), Seitenverhältnis A4, 24 px Abstand.

**Abstände.** Es gibt keine Abstands-Token im Quelltext; die Werte sind Literale. Wiederkehrend und damit verbindlich: 4 px zwischen Segmenten und Icon-Knöpfen, 6 px zwischen Feld, Einheit und Knopf einer Zeile, 8 px zwischen Gruppen, 12 px Innenrand der Karte, 16 px Innenrand des Panels (seitlich immer 16), 14 px über einem Panel-Abschnitt. Höhen: Bedienelement 28 px, Icon-Knopf 30 px, Zeile in der Karte 28 bis 30 px, Listenzeile im Panel 32 px, Zeile der Ausgabe 36 px, Leiste 44 px.

**Ebenen:** Karte und Eingabe 20, Menü 30, Toast 40.

**Druck:** Im Druck bleibt nur das Blatt; Leiste, Panel, Plan und alle schwebenden Teile sind ausgeblendet, jedes Blatt füllt eine Seite ohne Schatten.

## Elevation & Depth

Flach. Flächen liegen nebeneinander und werden durch 1-px-Linien in `line` getrennt, innerhalb einer Fläche durch Haarlinien in `line2`. Tiefe entsteht durch drei Papiertöne (`paper` unter `canvas` unter `surface`), nicht durch Schatten.

Einen Schatten hat nur, was über dem Plan schwebt oder Papier ist. Alle Schatten sind weich und in Tinte getönt (`rgba(36,34,29,…)`).

### Shadow Vocabulary
- **Am Objekt** (`0 4px 16px rgba(36,34,29,.14)`): Karte am Objekt und Eingabe an der Strecke.
- **Menü** (`0 6px 20px rgba(36,34,29,.14)`): das Menü unter der Leiste.
- **Dialog** (`0 12px 40px rgba(36,34,29,.2)`), Hintergrund `rgba(36,34,29,.28)`: Hilfe und QR-Code.
- **Blatt** (`0 1px 2px rgba(36,34,29,.12), 0 8px 24px rgba(36,34,29,.10)`): das Aufmaßblatt auf der Fläche. Im Druck entfällt er.

### Named Rules
**Die Schwebt-oder-Papier-Regel.** Schatten nur an Karte, Eingabe, Menü, Dialog und Blatt. Leiste, Panel, Raumliste, Knöpfe und Felder sind flach, auch bei Hover und Fokus.

## Shapes

Kleine Radien, feine Linien. Bedienelemente (Knopf, Feld, Auswahl, Icon-Knopf, Menüpunkt, Toast) haben 4 px; Flächen, die schweben oder eine Liste fassen (Karte, Eingabe, Menü, Dialog, Raumliste, Lageplan), haben 6 px. Größer wird es nie. Voll rund sind nur Punkte: der Punkt vor dem Stand (8 px, in der Raumzeile 7 px), die Marke eines eingeschalteten Menüpunkts (6 px), der Schalter (16 px hoch, Radius 8 px) und die Ecken im Plan. Das Blatt hat keine Radien. Die Schritte in der Leiste und die Listenzeilen im Panel haben keine Radien und keinen Rand; der aktive Schritt trägt einen 2-px-Strich in Tinte auf der Unterkante der Leiste.

Ränder sind 1 px in `line`. Icons sind Inline-SVG, 16 px, nur Kontur in `currentColor`, Strichstärke 1,6, runde Enden und Ecken.

### Zeichenkonventionen im Plan

| Element | Darstellung |
|---|---|
| Raster | Quadrate von 1 m, 1 px in `line2` |
| Raum | geschlossen: Füllung `floor`, Inseln ausgespart |
| Wand mit Maß | `ink`, 2 px, runde Enden |
| Wand ohne Maß | `pencil`, 1,25 px, gestrichelt 5 4 |
| Diagonale | unsichtbar. Sichtbar nur: als nächste Strecke, angefasst oder überfahren (aus der Liste), falsch, oder dünn (`ink2`, 1 px, 55 % Deckkraft) an einer angefassten Ecke |
| Nächste Strecke | `accent`, 2,5 px, durchgezogen, auch wenn darunter Bleistift liegt; ihre beiden Ecken in `accent` |
| Angefasste Strecke | Strich in `accent`, auch wenn darunter Bleistift liegt; eine Wand behält ihre Stärke, eine Diagonale wird 2 px und deckend; ihre beiden Ecken in `accent` |
| Falsches Maß | `bad`, 2,5 px, gestrichelt 9 4; daneben die Abweichung (`+87 mm`, 11 px, 600, `bad`) |
| Ecke | Punkt in `ink`, Radius 3,5; angefasst oder an der aktiven Strecke: `accent`, Radius 4,5 |
| Eckbuchstabe | `muted`, 13 px vom Punkt nach außen (vom Schwerpunkt weg); an Wänden unter 40 px nur, wenn die Ecke aktiv ist |
| Länge an der Wand | 11 px, `ink2`, tabellarisch, mit 3 px Lichthof in `canvas`; außen an der Wandmitte, sonst innen, sonst gar nicht. Längste Wände zuerst, Wände unter 48 px ohne Zahl. Keine Zahl schneidet eine andere Wand oder Zahl |
| Tür | Wand mit 5 px `canvas` unterbrochen, Flügel und Bogen 1 px `ink` zur Raumseite |
| Fenster | Unterbrechung, darin zwei Linien 1 px `ink` im Abstand 3 px |
| Anschluss | Kreis Radius 4, Füllung `canvas`, Rand 1 px `ink` |
| Gummiband beim Skizzieren | `pencil`, 1,25 px, gestrichelt 5 4, Punkt am Zeiger; Zeiger als Fadenkreuz |
| Raum schließen | Ring in `accent`, 1,5 px, um die erste Ecke (Radius 8, unter dem Zeiger 11) |
| Leerer Start | eine Ecke mit dem Ansatz der ersten Wand in `muted`, 1,5 px, gestrichelt 6 5; Ziel als gestrichelter Ring 3 3 |
| Genauigkeit je Ecke | Ellipse, Füllung `accent-bg`, Rand `accent-line` (nur auf Wunsch, hinter dem Stand) |
| Maßstab | Klammer 5 px hoch mit Beschriftung in `muted`, 11 px; Stufen 50 cm, 1, 2, 5, 10 m, mindestens 64 px breit |
| Trefferfläche | Strecke 14 px breit, Ecke Radius 11, beide unsichtbar |
| Tastaturfokus | Strecke: 14-px-Band in `accent-line`; Ecke: Ring 2 px in `accent` mit Radius 11 |

Wandansicht: Wand als Rechteck in `floor` mit 2 px `ink`; eine nur angenommene Höhe macht die Oberkante zum Bleistiftstrich und die Höhenzahl `muted`. Öffnung: Füllung `canvas`, Rand 1,25 px `ink`, gewählt 2 px `accent`; Symbol (Türanschlag, Fensterflügel) 1 px `ink2`. Lageplan oben rechts (168 × 128 px, `surface`, Rand `line`, Radius 6): Wände `pencil` 1,5 px, die aktuelle `accent` 3 px.

Miniatur in der Raumzeile (64 × 44 px): Umriss 1,5 px `ink` mit Füllung `floor`; eine Skizze ohne eindeutige Form als Bleistift gestrichelt 3 3 ohne Füllung.

Aufmaßblatt: Wände in Drucktinte mit runden Enden, Öffnungen als weiße Unterbrechung, Länge außen an jeder Wand, die lang genug ist, Eckbuchstabe in der freiesten von 16 Richtungen, Maßstabsklammer „1 m“ unten links. Kopf und Fuß sind durch 1-px-Linien in Drucktinte abgesetzt; im Fuß stehen Fläche, Umfang und Stand.

### Named Rules
**Die Diagonalen-Regel.** Eine Diagonale ist nur sichtbar, wenn sie dran, angefasst oder falsch ist. Der Plan zeigt den Raum, nicht das Messnetz.

**Die Platz-Regel für Zahlen.** Eine Länge steht nur dort, wo sie nichts schneidet. Fehlt der Platz, fehlt die Zahl; sie steht dann in der Karte und in der Liste.

## Components

Dieselben Bedienelemente in der ganzen Familie. Zustände wechseln sofort; Knöpfe, Zeilen und Felder haben keine Übergänge.

### Schaltflächen
- **Form:** 28 px hoch, 4 px Radius, 1 px Rand in `line`, Grund `surface`, Innenrand 0 10 px, Schrift Text.
- **Hover / Gedrückt / Aus:** Grund `hover`, `press`; deaktiviert 40 % Deckkraft.
- **Hauptaktion (`primary`):** Grund und Rand `accent`, Schrift weiß in 600; Hover `accent-hover`. Eine je Ansicht: „Neuer Raum“, „OK“ an der Eingabe, „Weiter: …“ am Fuß des Panels, „Aufmaßblatt drucken“, „Neu messen“ am falschen Maß.
- **Still (`quiet`):** ohne Rand und Grund, Schrift `ink2`; Hover `hover` und `ink`. Für Verweise auf Folgewerkzeuge in der Raumzeile.
- **Löschend (`danger`):** wie die normale Schaltfläche, Schrift in `bad`. Nie mit rotem Grund.
- **Icon-Knopf:** 30 × 30 px, ohne Rand und Grund, Icon in `ink2`; Hover `hover` und `ink`; deaktiviert 30 %. Jeder Icon-Knopf hat einen Titel oder ein `aria-label`.
- **Fokus:** überall 2 px Umriss in `accent` mit 1 px Abstand (`:focus-visible`).

### Eingabefelder
- **Feld:** 28 px hoch, 4 px Radius, Rand `line`, Grund weiß, Zahlen rechtsbündig, die Einheit als Text dahinter (`m`, `mm`, `°`). Platzhalter kursiv in `muted`; er zeigt den angenommenen oder berechneten Wert.
- **Fokus:** kein Umriss, der Rand wird `accent`.
- **Zeile:** Beschriftung links (`ink2`, mindestens 74 px), Feld, Einheit; mindestens 30 px hoch.
- **Auswahl und Haken:** native `select` und `checkbox`, Haken in `accent`.

### Leiste mit Schritten
44 px, `surface`, unten 1 px `line`. Die Schritte sind randlose Knöpfe über die volle Höhe mit einer Ziffer in Beschriftung davor; die Ausgabe steht ohne Ziffer hinter einem Pfeil in `pencil`. Der aktive Schritt ist Tinte in 600 mit einem 2-px-Strich in `ink` auf der Unterkante. Kein Akzent in der Leiste. Die Schritte sind immer wählbar; ist ein Schritt noch nicht möglich, steht im Plan ein Satz mit einer Hauptaktion, die zurückführt („Maße gibt es, sobald der Raum geschlossen ist.“ / „Zur Skizze“).

### Stand
Die oberste Zeile des Panels und ein Knopf über die ganze Breite: ein Punkt (8 px, siehe Zustände), dahinter ein Satz in 600. Sobald die Form eindeutig ist, erscheinen darunter Fläche und Umfang als Ergebniszahlen in zwei Spalten, eingerückt auf die Textkante. Ein Klick klappt die Statistik darunter auf (Grund `canvas`, Wertepaare links Name in `ink2`, rechts Zahl); im Fehlerfall führt er stattdessen zur falschen Strecke.

### Panel-Abschnitte
Abschnitte haben 14 16 6 px Innenrand und keine Rahmen. Eine Gruppenbeschriftung (11 px, 600, `muted`) steht über einer Liste; ein Abschnitt, der ein Objekt benennt, hat einen Titel (13 px, 600) mit der Länge in `muted` dahinter. Listenzeilen sind 32 px hoch, durch Haarlinien getrennt, links der Name der Strecke, rechts Nebentext; die erste Zeile unter „Als Nächstes messen“ ist 600 mit dem Namen in `accent`. Lange Listen liegen hinter einer Aufklappzeile mit Winkel rechts. Die Ausgabe gliedert sich in Absichten (Drucken, Weiter planen, Für CAD) mit je einem Titel und Zeilen von 36 px: links Name und Nebentext, rechts ein Knopf.

### Karte am Objekt
Die eine Stelle für alles, was eine Ecke, Strecke, Wand oder Öffnung betrifft; dieselbe Karte in allen Schritten. 292 px breit, `surface`, Rand `line`, Radius 6, Schatten „Am Objekt“. Kopf: Name in 600 („Wand A–B“), die Länge in `muted`, rechts ein Icon-Knopf zum Schließen. Darunter Zeilen und, durch Haarlinien abgesetzt, weitere Gruppen mit einer Zeile Nebentext als Beschriftung („An dieser Wand“). Eine Karte enthält nie eine weitere Karte.

Lage: quer zur Strecke neben ihr, 30 px Abstand, auf der Seite, die weniger verschoben werden muss, immer 10 px vom Rand des Plans; die Strecke bleibt mit ihrer Länge sichtbar. An einer Ecke 16 px Abstand. Die Karte der Öffnung liegt 18 px rechts neben ihr, sonst links. Im Schritt Wände liegt der Inhalt der Wandkarte im Panel, weil die Wand dort immer angefasst ist.

Maßzeile in der Karte: Maß, Abweichung in Nebentext, Schalter. Ein abgeschaltetes Maß ist `muted` und durchgestrichen. Ein falsches Maß zeigt die Abweichung in `bad` und 600, darunter einen Satz, was zu den anderen Maßen passen würde, und zwei Knöpfe: „Neu messen“ (Hauptaktion) und „Maß abschalten“.

### Eingabe an der Strecke
Im Schritt Maße sitzt die Eingabe im Plan neben der nächsten Strecke, gelegt wie die Karte: Name der Strecke in 600, ein 86 px breites Feld, `m`, „OK“ als Hauptaktion. Das Feld hat sofort den Fokus; Enter trägt ein und springt zur nächsten Strecke, Esc legt die Eingabe weg. Ist etwas angefasst, weicht die Eingabe der Karte.

### Segmente
Eine Reihe normaler Schaltflächen mit 4 px Abstand, die umbrechen darf. Als Auswahl (Band links/rechts) ist das gewählte Segment Tinte mit weißer Schrift; als Reihe von Aktionen (Tür, Fenster, Loch, Anschluss) bleibt jedes Segment eine normale Schaltfläche.

### Schalter
28 × 16 px, Spur `press` mit Rand `line`, weißer Knopf 12 px; eingeschaltet Spur und Rand `ink`, der Knopf gleitet 12 px in 150 ms. Nur an einem Maß in der Karte („Maß verwenden“). In der Leiste gibt es keinen Schalter.

### Menü
Alles, was den ganzen Raum betrifft, hinter einem Icon-Knopf rechts in der Leiste. Mindestens 232 px breit, `surface`, Radius 6, 4 px Innenrand, Schatten „Menü“, 4 px unter der Leiste. Gruppen (Raum, Ansicht, Weitergeben) mit Gruppenbeschriftung und Haarlinie dazwischen; Punkte 28 px hoch, Hover `hover`, Tastenkürzel rechts in Beschriftung. Ein eingeschalteter Punkt trägt rechts einen 6-px-Punkt in `accent`. Löschende Punkte in `bad`.

### Dialog
Nur für Nachschlagen und Zeigen (Hilfe und Tasten, QR-Code), nie für eine Aufgabe des Hauptwegs. Höchstens 520 px, `surface`, Radius 6, Schatten „Dialog“; Kopf mit Titel in 600 und Schließen-Knopf, darunter Haarlinie. Die Hilfe ist eine zweispaltige Liste: Taste in `muted`, Wirkung in Tinte.

### Rückmeldung am Objekt (Toast)
Eine Zeile in Nebentext, weiß auf Tinte, Radius 4, Innenrand 7 12 px. Sie erscheint dort, wo geklickt wurde (14 px über dem Zeiger), bei einer Aktion aus Karte oder Eingabe mittig 8 px über deren Oberkante und nie über der Karte selbst; ohne Zeiger oben in der Mitte. Sie blendet in 200 ms ein und nach 2,2 s aus und fängt keine Klicks.

### Raumzeile (Startbildschirm)
Eine Raumliste ist eine Fläche in `surface` mit Rand `line` und Radius 6; die Zeilen darin sind durch Haarlinien getrennt und keine eigenen Karten. Zeile: Miniatur 64 × 44 px, Name in 600 über dem Stand (Punkt 7 px und Nebentext), rechts stille Knöpfe für begonnene Folgewerkzeuge, ganz rechts der Icon-Knopf „Raum löschen“ in `pencil` (bei Hover und Fokus `ink2`). Die ganze Zeile öffnet den Raum; Hover `hover`. Löschen fragt in der Zeile selbst nach („… löschen? Das lässt sich nicht zurückholen.“ mit „Abbrechen“ und „Löschen“), ohne Dialog. Unter den Listen steht der Hinweis zum Speicherort als ruhige Zeile in Nebentext.

### Blatt
Das Aufmaßblatt liegt als weißes A4-Blatt mit Schatten „Blatt“ auf `paper`. Innenrand 6,5 % und 7 %. Kopf: Raumname in 600 links, Art des Blatts und Datum rechts, darunter eine Linie in Drucktinte. Mitte: der Grundriss. Darunter die Wandliste in sechs Spalten und der Fuß mit Fläche, Umfang, Stand. Weitere Blätter (Wandansichten in zwei Spalten, Maße als zweispaltige Tabelle) folgen demselben Kopf.

### Bewegung
Bewegung zeigt, dass ein Maß angekommen ist. Sonst steht alles still.

| Was | Dauer | Verlauf |
|---|---|---|
| Wand bekommt ein Maß: der Strich blitzt in `accent` mit 4 px auf und wird Tinte | 600 ms | `--ease` |
| Diagonale bekommt ein Maß: `accent` 3 px, dann Tinte, dann unsichtbar | 1200 ms | `--ease` |
| Form wird eindeutig: die Skizze gleitet in die gemessene Form | 420 ms | Auslauf vierter Ordnung (im Skript) |
| Fläche und Umfang erscheinen: einblenden, 5 px von unten | 400 ms | `--ease` |
| Schalter | 150 ms | `--ease` |
| Winkel der Aufklappzeile | 150 ms | Standard |
| Toast ein und aus | 200 ms | Standard |

`--ease` ist `cubic-bezier(.16,1,.3,1)`: schnell los, lang auslaufend. Ein Sprung zwischen ganzen Zuständen (Raum laden) gleitet nicht. Bei `prefers-reduced-motion: reduce` entfallen alle Animationen und Übergänge, und die Skizze springt in die gemessene Form.

### Tasten und ihre Beschriftung
Tastenkürzel stehen als schlichte Schrift in Beschriftung (11 px, `muted`) ohne Kasten: rechts im Menüpunkt, hinter dem Knopftext („Löschen ⌫“), in Klammern am Titel eines Icon-Knopfs. Die Beschriftung richtet sich nach der Plattform und kommt aus einer Tabelle, nie aus festem Text:

| | macOS | Windows und andere |
|---|---|---|
| Rückgängig | ⌘Z | Strg+Z |
| Wiederherstellen | ⇧⌘Z | Strg+Y |
| Sichern | ⌘S | Strg+S |
| Öffnen | ⌘O | Strg+O |
| Löschen | ⌫ | Entf |
| Zoom mit Rad | ⌘ | Strg |

macOS-Symbole stehen ohne Pluszeichen, Windows-Namen deutsch mit Pluszeichen. Beide Belegungen wirken auf jeder Plattform (⌘ oder Strg; Entf oder Rücktaste). Plattformneutrale Tasten (1 bis 4 für die Schritte, 0 Einpassen, ? Hilfe, Enter, Esc, ← →) stehen überall gleich. Jede Funktion hat genau einen sichtbaren Weg und höchstens ein Kürzel; nichts hängt an Rechtsklick oder Hover.

### Named Rules
**Die Am-Objekt-Regel.** Was eine Ecke, Strecke, Wand oder Öffnung betrifft, steht auf ihrer Karte. Was den ganzen Raum betrifft, steht im Menü. In der Leiste stehen nur Ort, Schritte, Rückgängig und Menü.

**Die Eine-Hauptaktion-Regel.** Je Ansicht höchstens ein Knopf in Akzent.

**Die Sofort-und-umkehrbar-Regel.** Eine Aktion passiert sofort und ohne Rückfrage; Rückgängig holt sie zurück. Nachgefragt wird nur beim Löschen eines Raums aus der Liste, und zwar in der Zeile.

## Do's and Don'ts

### Do:
- **Do** Wände mit Maß in Tinte (2 px) und Wände ohne Maß als Bleistift (1,25 px, gestrichelt 5 4) zeichnen. Dieselbe Unterscheidung gilt für alles Angenommene, etwa eine Raumhöhe ohne Maß.
- **Do** den Akzent im Plan für genau zwei Dinge verwenden: die nächste Strecke und die Auswahl.
- **Do** „offen“ als hohlen Ring in Tinte zeigen und „geprüft“ als grünen Punkt; Rot erst, wenn ein Maß nicht passt.
- **Do** den Stand als einen Satz schreiben und Statistik dahinter legen.
- **Do** Karte, Eingabe und Rückmeldung an das Objekt legen, quer zur Strecke, sodass sie mit ihrer Länge sichtbar bleibt.
- **Do** bei den vier Größen 20, 13, 12, 11 px und den Stärken 400 und 600 bleiben; Zahlen tabellarisch, Dezimalkomma, echtes Minus, Halbgeviertstrich zwischen Ecken.
- **Do** Radien 4 px für Bedienelemente und 6 px für Flächen verwenden, Ränder 1 px.
- **Do** Tastenkürzel nach Plattform beschriften (⌘Z oder Strg+Z) und aus der gemeinsamen Tabelle holen.
- **Do** jede Bewegung bei `prefers-reduced-motion` abschalten.
- **Do** die Begriffe aus `GLOSSARY.md` verwenden: Ecke, Strecke, Wand, Diagonale, Maß, Länge, Stand, Öffnung, Anschluss, Skizze, Aufmaßblatt, Folgewerkzeug, Raum, Geschoss, Gebäude.

### Don't:
- **Don't** eine Statuszeile bauen. Was zu tun ist, sagen der Stand und der Plan; Rückmeldungen erscheinen kurz am Ort der Aktion.
- **Don't** Schalter, Modi oder Werkzeugknöpfe in die Leiste legen. Kein Expertenmodus.
- **Don't** Karten in Karten setzen. Gruppen in einer Karte und Zeilen in einer Liste trennt eine Haarlinie.
- **Don't** Verläufe, Glas, Unschärfe oder Glühen verwenden. Flächen sind einfarbig.
- **Don't** Webfonts laden oder eine zweite Schriftfamilie einführen.
- **Don't** einen Dialog für eine Aufgabe öffnen, die am Objekt oder in der Zeile Platz hat. Dialoge sind für Hilfe und QR-Code.
- **Don't** Schatten an Leiste, Panel, Knöpfe oder Felder geben; Schatten haben nur Karte, Eingabe, Menü, Dialog und Blatt.
- **Don't** Grün oder Rot als Linienfarbe für „gemessen“ und „fehlt“ verwenden und kein Bernstein für „offen“; das war der Bestand.
- **Don't** Diagonalen dauerhaft einblenden.
- **Don't** eine Länge in den Plan schreiben, wenn sie eine Wand oder eine andere Zahl schneidet.
- **Don't** Akzent als Fläche, Überschriftenfarbe oder Zustandsfarbe einsetzen und keinen zweiten Akzent einführen.
- **Don't** Versalien, gesperrte Schrift, Etiketten-Pillen oder farbige Zustandsflächen verwenden.
- **Don't** einen Radius über 6 px setzen (außer am Schalter und an Punkten).
- **Don't** für schmale Fenster oder Mobile umbauen; unter 860 px ist die Oberfläche nicht vorgesehen.

## Uneinheitlich im Prototyp

Stellen, an denen die freigegebene Datei sich selbst widerspricht. Sie sind oben nicht zur Regel erhoben und beim Umbau zu entscheiden.

- **Fünfte Schriftgröße.** Eckbuchstaben im Plan stehen in 10 px (`#plan text.lbl`), unter der kleinsten Stufe von 11 px.
- **Drei Stile für dieselbe Gruppenbeschriftung.** 11 px/600/`muted` (Panel, Menü, Statistik), 12 px/400/`muted` (Gruppen in der Karte, Geschoss auf dem Startbildschirm), 13 px/600/`ink` (Absichten der Ausgabe).
- **„Eingeschaltet“ auf drei Arten.** Schalter und Segment in Tinte, Menüpunkt mit Punkt in Akzent, Haken in Akzent.
- **Literale statt Token.** `#fff`, `#a8380a` und die vier Farben des Blatts haben keine Custom Property; Abstände, Radien und Schatten ebenfalls nicht.
- **Zwei Verläufe und zwei Standardübergänge.** Das Gleiten in die gemessene Form rechnet im Skript mit einem eigenen Auslauf statt `--ease`; Toast und Aufklappwinkel laufen ohne `--ease`.
- **Schatten und Radius schwebender Teile.** Karte (`0 4px 16px`) und Menü (`0 6px 20px`) unterscheiden sich kaum; der Toast hat 4 px Radius, alle anderen schwebenden Teile 6 px.
- **Höhen.** Normale Knöpfe 28 px, Icon-Knöpfe 30 px, stille Knöpfe in der Raumzeile 26 px.
- **Größen auf dem Blatt.** 15 px im Kopf und 14 px im Fuß für dieselbe Rolle.
- **Planschrift in der Wandansicht** hat keinen Lichthof, die im Plan schon.
- **Tastatur.** Öffnungen in der Wandansicht und die Wände im Lageplan sind nicht fokussierbar (Wände nur über ← →); die Raumzeile ist ein fokussierbares `div` ohne Rolle; der Stand ist ein `button`, der Blockelemente enthält.
- **Inline-Stile** an einzelnen Elementen im Markup und in den Vorlagen des Skripts (Feldbreiten, Einheit, Name auf dem Startbildschirm).
