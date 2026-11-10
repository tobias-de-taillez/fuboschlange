# Fliesenplan und Küchenplaner leiser machen („alles ist gleich laut“)

Stand 10.11.2026, Zweig `feat/werkzeuge-leise` (ab `main` 8fe0a7a, Rückweg-Tag `vor-leise`). Anlass: Grilling Q3 des Raumaufmaß-Papiers (`docs/superpowers/specs/2026-11-09-raumaufmass-familie-design.md`). Alle drei Ursachen gelten auch für die beiden Folgewerkzeuge: Hauptweg und Sonderfall sind nicht zu unterscheiden, die Oberfläche erklärt sich mit Text, Aufbau und Wörter folgen der Baugeschichte. Das Aufmaß ist umgebaut; hier die beiden Werkzeuge, nach `DESIGN.md`, `PRODUCT.md` und den drei Prüfkriterien (leerer Start führt von selbst, eine Hauptsache, Hauptweg ohne Erklärtext).

## Entschieden (Tobias, 10.11.2026)

- **Fliesenplan: erst Fliesenset, dann legen.** Der leere Start zeigt das Fliesenset; „Weiter: Fliesen legen“ ist die Hauptaktion und führt in den zweiten Schritt (Leiste mit den Fliesen, Einkauf im Panel, „Plan und Schnittblätter drucken“ als Hauptaktion). „ändern“ am Set führt zurück.
- **Küchenplaner: stellen und Wege sehen.** Plan und 3D bleiben nebeneinander, die Wege stehen vorn im Panel; die Prüfung ist eine Zeile („8 geht nicht · 2 Hinweise“, Punkt in der Farbe des Stands) mit den Meldungen dahinter.

## Inventur vorher → nachher

| | Fliesenplan vorher | nachher | Küchenplaner vorher | nachher |
|---|---|---|---|---|
| Knöpfe in der Leiste | 3 Fliesen + 4 Werkzeuge | nur die Fliesen (im Schritt Legen) | 12 Teile + 4 Schalter | 12 Teile + 2 Schalter (3D, Wege) |
| Weiteres im Menü | Weitergeben, Zum Raumaufmaß, Hilfe | + Werkzeug: Fluchten, Dehnungsfuge, Fugencheck, Lineal, Alle Fliesen entfernen | wie Fliesenplan | + Ansicht: Fronten offen, Wege-Analyse; Alle Küchenteile entfernen |
| Tooltips im Markup | 20 | 9 | 15 | 9 |
| Tooltips in JS | 9 | 9 | 46 | 46 (Teile-Knöpfe sind reine Piktogramme) |
| Dauertext der Hinweiszeile | ja (Fliesen ziehen · Q/E …) | keiner; nur das aktive Werkzeug erklärt sich | ja (Schrank ziehen · V · W · O · A) | keiner; am gewählten Teil eine kurze Zeile |
| Hilfeeinträge | 15 | 7 | 7 | 7 (mit Verweis auf das Menü) |
| Bestätigen | „Zweimal klicken“ | sofort, ⌘Z holt zurück | „Zweimal klicken“ | sofort, ⌘Z holt zurück |
| Erklärabsätze im Panel | Fugen-Hinweis „über die Leiste oben“ | gestrichen, Abschnitt nur bei Fugen | zwei Absätze zu den Wegen | gestrichen bzw. auf einen Satz |

## Was noch nicht leiser ist (offen für eine nächste Runde)

- Die Teile-Leiste der Küche trägt zwölf Piktogramme in fünf Gruppen mit Beschriftung (KALT, WARM, NASS, STAURAUM, MÖBEL); der Hauptweg „stellen“ verlangt sie, eine Auswahl nach Häufigkeit wäre ein eigener Entwurf.
- Der Küchenplaner hat im Panel weiter die langen Wege-Vorschläge („Optimal einräumen“, „Einräumen und umsortieren“) und die Küchenmaße; sie sind Hauptweg-nah und wurden nur gekürzt.
- Im Fliesenplan stehen „Fugenmörtel“, „Fugenkreuze“ und „Belegt“ noch vor der Stückliste; sie gehören hinter die Einzelheiten.
- Der Menüpunkt „Zum Raumaufmaß“ führt weiter in den Schritt Maße.

## Geprüft

Alle Node-Tests, `test/browser.mjs` in Chromium, WebKit und Firefox (253 Prüfungen je Engine, darunter `stabil` und `seiten`), `test/vergleich-staende.mjs` gegen 237c2d1 (27 gleich). Der Bildvergleich ist hier nicht anwendbar, weil sich das Aussehen gewollt ändert. Neue Prüfungen: Fliesenplan beginnt beim Fliesenset; Prüfung der Küche als Zeile mit Meldungen dahinter.
