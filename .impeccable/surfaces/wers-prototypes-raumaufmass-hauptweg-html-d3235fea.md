---
version: 1
slug: "wers-prototypes-raumaufmass-hauptweg-html-d3235fea"
primary_target: "docs/superpowers/prototypes/raumaufmass-hauptweg.html"
related_targets: []
---

# Prototyp Hauptweg Raumaufmaß

Scope: klickbarer Prototyp von Startbildschirm und Raumaufmaß (Skizze, Maße, Wände, Ausgabe). Mode: Operate. Desktop, Maus/Touchpad/Tastatur.

Audience and job: ein fähiger Fremder mit Laser misst einen Raum auf. Fragen: „Was muss ich noch messen?“ und „Stimmt alles?“. Content: der echte Raum Wohnküche (24 Ecken, 24 Wände, 81 Maße, geprüft ± 5,6 mm). Constraints: Anforderungen in docs/superpowers/specs/2026-11-09-raumaufmass-familie-design.md, Begriffe aus GLOSSARY.md, kein Rechenkern, eine HTML-Datei.

Unresolved: Platz der Menüpunkte im Einzelnen; Verhalten bei sehr kleinen Fenstern.

## Direction contract

THESIS: Die Oberfläche zeigt nur den Stand und den nächsten Schritt; alles andere liegt an dem Ding, das man anfasst. Verweigert wird die Werkzeugleiste voller Schalter über einer Tabelle.

OWN-WORLD: Messwerkzeug auf Papier, geerbt aus raumaufmass.html: warmweiße Flächen, Tinte, ein Akzent (verbranntes Orange), 1-px-Linien, Systemschrift, tabellarische Ziffern, Radien bis 6 px. Leiser als der Bestand: im Plan Tinte für Gemessenes, dünner gestrichelter Bleistiftstrich für nur Skizziertes, Akzent allein für die nächste Strecke und die Auswahl.

STORY: Der Besucher versteht in jedem Moment, was fehlt, tippt nur Zahlen, sieht „Geprüft“ und hält am Ende ein Blatt in der Hand.

FIRST VIEWPORT: Leiste 44 px (Räume, Raumname, drei Schritte, Ausgabe, Rückgängig, Menü). Darunter links der Plan über die volle Höhe, rechts ein 320-px-Panel, das oben den Stand als einen Satz mit Fläche und Umfang zeigt und darunter den Inhalt des Schritts. Im Schritt Maße sitzt die Eingabe an der hervorgehobenen Strecke im Plan.

FORM: Aufbau direkt aus dem vom Nutzer bestätigten Anforderungspapier (Leiste, Plan, Panel, Karte am Objekt, Menü). Es wurde kein Konzept-Wurf ausgeführt, weil der Aufbau dort schon festgelegt war. Am 09.11.2026 gefragt „Taugt dieser Prototyp als Vorlage für den Umbau?“, mit der Alternative „Erst Varianten“, antwortete der Nutzer: „Ja, weiter so“. Signatur: Bleistift wird Tinte, sobald eine Strecke ein Maß hat; in der Ausgabe liegt das Aufmaßblatt als Blatt auf der Fläche.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
