# Schneckenverlegung in der Handwerkspraxis — wie Vor-/Rücklauf-Spiralen geplant und verlegt werden (insb. auf Noppenplatten)

**Datum:** 2026-07-31 (alle Links an diesem Tag abgerufen)
**Anlass:** Der Single-Loop-Solver soll Verlegepläne suchen, wie ein Handwerker sie legen würde. Frage: Welche Ordnungsregeln benutzt das Handwerk tatsächlich — und welche davon taugen als Invarianten/Heuristiken, die dem Backtracking sinnlose Zweige ersparen?
**Antwort:** Die Kernregel („Vorlauf mit doppeltem Verlegeabstand von außen nach innen, Kehre in der Raummitte, Rücklauf mittig in den Lücken zurück") ist **wörtlich primär belegt** — u. a. im Schlüter-BEKOTEC-THERM-Handbuch. Dazu kommen harte, zitierfähige Nebenregeln: S-förmige Wendeschleife, Biegeradius 5×d<sub>a</sub>, Umlenkung über ≥ 2 Noppen, Randzone als *vorgeschalteter* Abschnitt statt in der Spirale, Zerlegung nichtrechteckiger Räume in rechteckige Teilfelder, Längen-/Flächenbudgets pro Heizkreis und Sonderbehandlung des Verteilervorfelds. Nicht primär belegbar sind „Bahnen-Zählregeln" (gerade/ungerade Windungszahl) — die Schnecke braucht sie konstruktionsbedingt nicht.

---

## 0. Terminologie — Vorsicht, „bifilar" ist nicht eindeutig

Herstellerunterlagen (Schlüter, Purmo, Fördetherm) verwenden **Schneckenform = spiralförmig = bifilar** für dasselbe Muster: Vorlauf spiralt mit **2×VA** einwärts, Rücklauf füllt die Lücken → Endabstand VA, Vor- und Rücklaufbahnen wechseln sich ab.

**Widerspruch:** Das SHK-Wiki [SHKwissen „Bifilare Verlegung"](https://www.haustechnikdialog.de/SHKwissen/678/Bifilare-Verlegung) definiert „bifilar" enger: Vorlauf spiralt im *regulären* Abstand zur Mitte, die Wendeschleife führt den Rücklauf **unmittelbar neben dem bereits verlegten Rohrstrang** zurück (Rohrpaar, effektiv doppelte Rohrmenge). Diese Sonderform kommt in keiner der gesichteten Verlegeanleitungen der Hersteller vor. Für den Solver gilt die Hersteller-Lesart (2×VA-Verschränkung); die SHKwissen-Sonderform ist als abweichende Begriffsverwendung zu kennen, mehr nicht.

---

## 1. Das Grundverfahren — wörtlich belegt

**Schlüter-BEKOTEC-THERM, Technisches Handbuch, S. 27** (Kapitel „Verlegung und Anschluss der Schlüter-BEKOTEC-HR Heizrohre", [PDF](https://www.heinze.de/m2/19/61919/etc/93/43197693.pdf)):

> „Das Heizrohr wird bei der schneckenförmigen Verlegung im doppelten Verlegeabstand bis zur Wendeschleife verlegt. Nach der Wende wird der Rücklauf im verbliebenen Freiraum **mittig** eingebracht und ergibt somit den gewünschten Verlegeabstand."

> „Bevorzugt ist die abgebildete schneckenförmige Verlegevariante zu wählen, um eine möglichst gleichmäßige Oberbodentemperatur zu erzielen."

**Fördetherm, „Allgemeine Verlegearten der Fußbodenheizung"** ([PDF](https://www.baudochselbst.de/pdf_dokumente/fussbodenheizung_foerdetherm_allgemein_verlegearten.pdf), S. 1, mit Schema):

> „Bei der schneckenförmigen Verlegung wird das Heizrohr **vom Rand der Verlegefläche her** gleichmäßig in spiralförmigen Kreisen zur Mitte des Raumes geführt. Dabei wird der doppelte Verlegeabstand eingehalten. Nach Erreichen der Raummitte wird das Heizrohr in einer **S-förmigen Wendeschleife** in gleicher Form innerhalb der verlegten Heizrohre zurückgeführt. Dadurch liegen Vor- und Rücklaufleitung in der Fläche nebeneinander und gewähren eine gleichmäßige Beheizung der gesamten Noppenplatte."

**Warum die Schnecke bevorzugt wird** — [Purmo, Technische Spezifikation Flächenheizung 1-2015](https://www.purmo.com/docs/P_TEC_FBH_1-2015_DE_150325_web.pdf), S. 63 („Verlegeformen"):

> „Bei einer spiralförmigen Verlegung herrscht an fast jeder Stelle der Verlegefläche eine ausgeglichene Temperatur. **Diese Verlegung ist zu bevorzugen, weil die Verlegeradien der Rohre an den Umlenkpunkten frei gewählt werden können.** Somit kann das Rohr auch noch bei Verlegetemperaturen von 0 °C einwandfrei verlegt werden."

Der handwerkliche Grund ist also nicht primär thermisch, sondern **geometrisch**: die Schnecke besteht (außer der einen Wendeschleife) nur aus 90°-Bögen, deren Radius frei wählbar ist — der Mäander erzwingt 180°-Kehren im Bahnabstand.

### Schrittfolge auf der Baustelle (Noppenplatte)

Aus [Purmo S. 72–74 (Verlegeanleitungen rolljet/noppjet)](https://www.purmo.com/docs/P_TEC_FBH_1-2015_DE_150325_web.pdf), [Viega Fonterra Base, Anwendungstechnik, S. 88 „Montageschritte"](https://www.viega.de/content/dam/viegadm/en/temp/content_assets/eu/products/applications_and_topics/applications/awt_fonterra_2017_04_fonterra_base.pdf), [Selfio Noppensystem-Anleitung](https://www.selfio.de/blog/fussbodenheizung-noppensystem-verlegen-anleitung) (Händler-Anleitung, sekundär) und [heima24-Wiki](https://www.heima24.de/wiki/fussbodenheizung-selbst-verlegen/) (sekundär):

1. Randdämmstreifen an allen aufgehenden Bauteilen (Wände, Türzargen, Säulen) — Bewegungsraum ≥ 5 mm (Viega S. 82; DIN 18560).
2. Noppenplatten **in einer Raumecke beginnend** verlegen (Purmo noppjet: „in der linken Raumecke beginnend", S. 73), Reihen im Verband, Zuschnitt am Rand.
3. Fugen-/Übergangsprofile in Türdurchgängen und an geplanten Bewegungsfugen **vor** der Rohrverlegung setzen (Purmo S. 72/74).
4. Rohrverlegung „**beginnend und endend am Heizkreisverteiler**" ([heima24](https://www.heima24.de/wiki/fussbodenheizung-selbst-verlegen/), sekundär, deckungsgleich mit allen Verlegeschemata): Vorlauf vom Verteiler ins Feld führen, Schnecke legen, Rücklauf zum Verteiler zurück. Rohr drallfrei abrollen (Purmo clickjet S. 76: „Heizrohr drallfrei abrollen"; Schlüter S. 27: Drall-Spannungen „durch Gegendrehungen des zu verlegenden Rohrbundes" minimieren, Rohrbund „in Richtung der Umlenkung niederlegen").
5. Druckprobe vor dem Estrich, Druck während des Estricheinbaus halten (Schlüter S. 27/108; Selfio: 24 h mit 1,3-fachem Betriebsdruck).

### Die äußerste Bahn: erst Raumumrundung — aus den Schemata, nicht als Satz

Kein gesichtetes Handbuch formuliert „zuerst den Raum einmal umrunden" als Satz. Die Verlegeschemata zeigen es aber einheitlich: die erste Windung läuft als **geschlossene Umrundung entlang aller Wände** (Wandabstand einhalten), erst danach beginnt das Einwärtsspiralen mit 2×VA; beide Rohrenden liegen nebeneinander an der Verteilerkante (Fördetherm-PDF S. 1, Schema „Schneckenverlegung"; Purmo Abb. 127 „Spiralförmig", S. 63; Uponor Klett TI, S. 28, Bild 4 „Installation der Rohre", [PDF](https://brandportal.uponor.com/m/426b0b9dc9c1321/original/TI-Klett-UFH-C-DE-1143092-v3.pdf)). Kennzeichnung: **bildlich primär belegt, textlich nicht.**

Mindestabstände der äußersten Bahn (Schlüter S. 27, inhaltsgleich mit DIN EN 1264-4): Heizrohre „mind. 50 mm von senkrechten Bauwerksteilen und 200 mm von Schornsteinen, offenen Kaminen und Schächten".

---

## 2. Randzonen bei Schneckenverlegung

Normrahmen (DIN EN 1264-2, sekundär über [Viega Fonterra Base S. 63](https://www.viega.de/content/dam/viegadm/en/temp/content_assets/eu/products/applications_and_topics/applications/awt_fonterra_2017_04_fonterra_base.pdf) und Schlüter S. 105): max. Oberflächentemperatur **29 °C Aufenthaltszone, 33 °C Bad, 35 °C Randzone**. Randzonen liegen vor Außenwänden/bodentiefen Fenstern und „ragen in der Regel **1 m** in den Raum hinein" (Schlüter S. 81, Erläuterung „Grenzkurve 15 K (für Randzonen)"). *(Widerspruch am Rande: die Purmo-Leistungstabelle S. 78 druckt „Randzone t_f,max = 29 °C" — vermutlich Druckfehler, alle übrigen Quellen sagen 35 °C.)*

Wie die Randzone praktisch mit der Schnecke kombiniert wird:

- **Vorgeschaltet, nicht integriert.** Die gängigen Kombinationen heißen „mäanderförmige/bifilare Verlegeart **mit vorgeschalteter, verdichteter Randzone**": der Vorlauf durchläuft zuerst die dichte Randzone (als kurzer Mäander parallel zur Außenwand), erst danach beginnt die eigentliche Schnecke der Restfläche ([Fördetherm-ABC „V wie Verlegearten"](https://www.fussbodenheizung-foerdetherm.de/kleines-fussbodenheizungs-abc-v-wie/); [heizgeiz.de Verlegearten](https://heizgeiz.de/fussbodenheizung-verlegearten): „Durch vorgeschaltete Randzonen kann der Temperaturausgleich erfolgen"). In der Spirale selbst wird der Abstand **nicht** lokal verdichtet.
- **Oder eigener Heizkreis:** Randzonen **über ca. 3 m²** sollten „als separater Heizkreis ausgebildet werden" ([SHKwissen „Randzonen / Einbauten"](https://www.haustechnikdialog.de/SHKwissen/859/Randzonen-Einbauten); dort auch die Praxis-Abstände: VA 75 mm bei > 70 W/m² Bedarf, sonst VA 100 mm).
- **Übergang weich:** „allmählicher Übergang vom engen auf einen weiten Verlegeabstand" statt abruptem Wechsel — wegen Rissbildung im Estrich (SHKwissen, ebd.).
- **Einordnung:** „Randzonen sind bei heutiger Bauweise eher unüblich … Bei älteren Gebäuden mit schlechten U-Werten … kann jedoch eine Randzone weiterhin sinnvoll sein" (Purmo S. 64). Fördetherm-PDF S. 1: bei heutiger Heizlastberechnung „kann in der Regel darauf verzichtet werden".

---

## 3. Verwinkelte Räume (L-/T-/U-Form)

Der harte, zitierfähige Mechanismus läuft über die **Estrichfugen**, nicht über die Heizungshydraulik:

- [Viega Fonterra Base, Anwendungstechnik S. 87](https://www.viega.de/content/dam/viegadm/en/temp/content_assets/eu/products/applications_and_topics/applications/awt_fonterra_2017_04_fonterra_base.pdf): „Estrichfeldgrößen ab **40 m²** sind durch Bewegungsfugen aufzuteilen, ebenso wie Seitenlängen von mehr als **8 m**. In jedem Fall ist ein Seitenverhältnis **a/b < 1/2** nicht zu überschreiten. Jegliche unregelmäßig ausgeführten Bereiche müssen gem. DIN EN 1264-4 Fugen haben; das Ziel besteht darin, dass **ausschließlich rechteckige Bereiche** … vorhanden sind. Wenn es sich um **T- oder L-förmige Räume** handelt, empfiehlt Viega, rechteckige oder quadratische Estrichfelder anzulegen." Zusätzlich S. 86: Fugen „so anzuordnen, dass möglichst **gedrungene Felder** entstehen"; Fugenplan kommt vom Bauwerksplaner.
- **Heizkreise dürfen Bewegungsfugen nicht kreuzen — nur Anbindeleitungen, und die im Schutzrohr:** „Kreuzen Anbindeleitungen eine Bewegungsfuge, so sind diese mit einem … Fugenschutzrohr von **300 mm Länge** an der Kreuzungsstelle zu schützen" (Viega S. 86; gleiches Zubehör bei Purmo S. 72/74 und als Normbezug DIN EN 1264-4 z. B. beim [IVT-Fugenschutzrohr](https://shop.ivt-group.com/de-de/prineto-schutzrohr-f%C3%BCr-dehnfugen-878386103); Überblick: [SBZ „Schnittstellenkoordination"](https://www.sbz-online.de/sbz-schwerpunkt/schnittstellenkoordination-ist-eine-wichtige-aufgabe-widerspruechliche-normen-bei)).
- **Konsequenz für die Praxis:** Ein L-/U-Raum wird in rechteckige Teilfelder zerlegt; **je Teilfeld eine eigene Schnecke** (oder ein Mäander), verbunden höchstens über Anbindeleitungen durch die Fuge. Eine einzige Spirale „um die Ecke" eines konkaven Raums herum ist in den gesichteten Anleitungen nirgends vorgesehen.
- **Noppenplatten-Spezifik:** Schlüter-BEKOTEC ist die dokumentierte Ausnahme beim Estrich — „der Estrich [kann] fugenlos erstellt werden", weil Schwindspannungen im Noppenraster abgebaut werden (Handbuch S. 24); Bauwerksfugen bleiben trotzdem tabu („dürfen nicht von Heizelementen überdeckt werden", S. 20), und Türdurchgänge werden als Schallschutzfugen/Estricheinschnürungen getrennt (S. 7–8) → ein Heizkreis endet praktisch an der Raumgrenze. Uponor bewirbt Klett ausdrücklich mit „Einfache Installation in **verwinkelten Räumen**" ([TI Klett S. 3](https://brandportal.uponor.com/m/426b0b9dc9c1321/original/TI-Klett-UFH-C-DE-1143092-v3.pdf)) — freie Rohrfixierung statt Raster; bei stark verwinkelten Grundrissen weicht die Praxis also eher aufs Tacker-/Klettsystem aus, statt die Noppen-Schnecke zu verrenken.

---

## 4. Die 180°-Kehre in der Feldmitte

- **Form:** eine **S-förmige Wendeschleife** — nicht ein einzelner 180°-Halbkreis. „Nach Erreichen der Raummitte wird das Heizrohr in einer S-förmigen Wendeschleife … zurückgeführt" (Fördetherm-PDF S. 1; gleichlautend [heizgeiz](https://heizgeiz.de/fussbodenheizung-verlegearten): „über eine s-förmige Wendeschleife spiralförmig entlang des Vorlaufrohres zurückgeführt"). Das S teilt die Richtungsumkehr in zwei gegensinnige Bögen und versetzt das Rohr dabei um eine halbe Lücke — der Rücklauf landet „mittig" im 2×VA-Freiraum (Schlüter S. 27).
- **Radius:** Es gibt keine eigene Kehren-Radius-Zahl; es gilt der allgemeine **Mindestbiegeradius 5 × d<sub>a</sub>** („Der kleinste zulässige Biegeradius ‚r' entspricht dem 5-fachen des Rohraußendurchmessers (bei Ø 16 mm: kleinster Biegeradius = 80 mm)", Schlüter S. 27; „Mindestbiegeradius von 5 x d nicht unterschritten", Purmo S. 72/74).
- **Auf der Noppenplatte:** „Die Umlenkung des Heizrohres ist grundsätzlich um **mindestens zwei Noppen** zu führen" (Schlüter S. 27, mit zulässig/nicht-zulässig-Abbildungen) — beim 75-mm-Raster also ≥ 150 mm Schleifenbreite. Das ist konsistent mit 2R = 160 mm ≈ 2 Rasterfelder.
- **Ort:** „Raummitte" heißt in allen Schemata: das innere Ende der Spirale, im Zentrum des (rechteckigen) Feldes. Eine Regel zur exakten Position (z. B. auf der Längsachse gestreckter Räume) ist **nicht primär belegt** — die Schemata zeigen sie dort, wo der 2×VA-Freiraum endet.
- Randbedingung Verlegetechnik: vor und nach Rohrbögen zusätzliche Fixierung (Purmo clickjet S. 76: „Vor und nach den Rohrbögen und im Umlenkbereich … je zwei Clips im Abstand von ca. 10 cm") — auf Noppenplatten übernimmt das die Noppenklemmung (Purmo S. 63: beim noppjet wird die Befestigungsanforderung der DIN EN 1264-4 „durch die Noppenstruktur erfüllt").

---

## 5. Typische Fehler und die Abzählregeln vorab

**Primär belegte Planungs-/Ausführungsregeln, die Sackgassen verhindern:**

| Regel | Quelle |
|---|---|
| Max. Heizkreislänge: **100 m** (14×2), **120 m** (17×2), **140 m** (20×2); max. **250 mbar** Druckverlust pro Kreis; Strömungsgeschwindigkeit ≤ 0,5 m/s | Purmo S. 66–67 („Diese Vorgaben haben sich in der Praxis bewährt") |
| BEKOTEC 16×2: max. **100 m** Heizkreislänge; max. Heizfläche je Kreis **7 / 15 / 22 / 30 m²** bei VA 75/150/225/300 | Schlüter S. 67 (Tabelle) |
| Rohrbedarf: **13,33 / 6,66 / 4,44 / 3,33 m/m²** bei VA 75/150/225/300 → Kreislänge ≈ Fläche × Bedarf + 2 × Anbindeleitung, vorab prüfen, sonst Fläche teilen | Schlüter S. 12/81 (Leistungsdiagramme, „L = Heizrohrbedarf"); [heima24-Wiki Heizkreise](https://www.heima24.de/wiki/fussbodenheizung-heizkreise-berechnen/) (sekundär: „max. 100 m inkl. Anbindeleitung") |
| Verlegeabstände nur im **Noppenraster**: BEKOTEC 75er-Raster → VA 75/150/225/300; 45°-Diagonalverlegung nur partiell/mit Zusatzhaltern | Schlüter S. 27 (RH-75-Halter „noppenübergreifend" bei „partieller 45° Verlegung"); Viega Base S. 57 („rechtwinklig oder diagonal", Diagonalhalter); Purmo S. 74 (Diagonalverlegung > 1,5 m nur mit Diagonalhalter) |
| Mindestabstände: 50 mm zu Wänden, 200 mm zu Schornsteinen/Kaminen/Schächten | Schlüter S. 27 (≙ DIN EN 1264-4) |
| Keine Heizrohre unter Einbauten (Einbauschränke, Wannen, Duschen): Fläche vorher abziehen; Wärmestau/„tote" Leistung | Purmo S. 63 („Stellflächen"); SHKwissen Randzonen/Einbauten |
| Knicke = Ausschuss; Drall vermeiden (Rohrbund gegendrehen/niederlegen, drallfrei abrollen) | heima24 (sekundär); Schlüter S. 27; Purmo S. 76 |
| Bewegungs-/Bauwerksfugen nie mit dem Heizkreis kreuzen (nur Anbindeleitungen im Schutzrohr) | Viega S. 86–87; Schlüter S. 20 |
| Ausgeführter Verlegeabstand darf max. **±1 cm** vom Plan abweichen | DIN EN 1264-4 (paywalled, [Übersicht](https://www.baunormenlexikon.de/norm/din-en-1264-4/fe4296d9-7a24-4c24-8b5e-8a880d4df6e2); sekundär auch in `2026-07-25-verlegemuster-literatur.md`) |

**„Bahnen zählen" / gerade-ungerade Windungszahl: nicht primär belegt.** Keine der gesichteten Hersteller- oder Verbandsunterlagen enthält eine Paritätsregel für die Schnecke. Geometrische Erklärung (eigene Folgerung, so zu kennzeichnen): die 2×VA-Spirale ist **selbstkorrigierend** — der Rücklauf füllt jede Lücke genau einmal, egal wie viele Windungen entstehen; eine Paritätsfalle existiert nur beim **Mäander**, wo die Bahnenzahl bestimmt, auf welcher Raumseite das Rohr endet (und ob es zum Verteiler zurückfindet). Das erklärt, warum das Handwerk beim Mäander „zählt", bei der Schnecke aber nicht — und warum die Schnecke als die narrensichere Variante gilt (Purmo S. 63: „zu bevorzugen").

---

## 6. Anbindeleitungen und Verteilervorfeld

Maßgeblich: **Technisches Merkblatt „Lage des Verteilers und Verlegung von Anbindeleitungen bei Fußbodenheizungen"** (ZVSHK/BDH/BVF, Nov. 2021; [PDF-Mirror](https://hpv-vertriebsgmbh.com/_daten/pdf/429.TM_Anbindeleitungen_BDH.BVF-ZVSHK%202021.pdf), [BVF-Meldung](https://www.flaechenheizung.de/verbaendeuebergreifendes-technisches-merkblatt-lage-des-verteilers-und-verlegung-von-anbindeleitungen-bei-fussbodenheizungen-erschienen/)):

- **Verteiler möglichst zentral** (S. 2, Abschn. 2; ebenso DIN EN 1264-4 via Viega S. 82: Verteiler so anordnen, „dass die Zuleitungsrohre so kurz wie möglich sind"). Ungünstiger Standort in Flur/Abstellkammer → „nicht regulierbare Wärmeabgabe … Überwärmung dieser Räume".
- **Leitungsführung** (S. 2, Abschn. 3): Erwärmung einzelner Räume durch geeignete Führung klein halten; Optionen: sinnvoller Standort, zweiter Verteiler, Verteiler unterhalb des Fußbodens, „Anschluss benachbarter Räume **durch die Wand**", „rückseitige Ausfädelmöglichkeit aus dem Verteilerschrank".
- **30-%-Regel** (S. 1, Abschn. 1.3): Anteil der nicht regelbaren Wärmeabgabe der Anbindeleitungen an der Raumheizlast bei ca. 30 % halten, sonst dämmen; Auslegung mit Gleichzeitigkeitsfaktor 0,5 (Abschn. 1.2). Dämmung: keine generelle GEG-Pflicht (Anlage 8), aber gegen Überwärmung (Abschn. 4); „Schon die Verlegung der Anbindeleitungen in einem Well- oder Schutzrohr verringert die Wärmeabgabe um bis zu 40 Prozent" (Purmo S. 65).
- **6-m²-Regel** (S. 4, Abschn. 5): eigener geregelter Heizkreis ab 6 m² für bestimmungsgemäß beheizte Räume (GEG § 63 (1)); bei Heizlast ≤ 150 W darf nach DIN/TS 12831 Abschn. 6.6 in Absprache auf einen eigenen Kreis verzichtet werden.
- **Türdurchgänge:** Anbindeleitungen wechseln dort „von der Dämmebene in die Ebene des Heizestrichs" (S. 3, Abschn. 4.2) — der Ebenenwechsel ist der normale Weg durch die Engstelle.
- **Größenordnung der Rohranhäufung** (Purmo S. 64): „Eine durchschnittliche Wohnung verfügt über etwa sieben Heizkreise und somit verlaufen also **14 Anbindeleitungen** durch einen Flur … Bei dieser Leitungsdichte, einem effektiven Verlegeabstand von 100 mm … ergibt sich eine Heizleistung von circa 40 bis 50 W/m²" — gegen 10–20 W/m² Heizlast: Überheizung.
- **Verteilervorfeld auf der Noppenplatte:** Vor dem Verteiler ist das Noppenraster zu eng für die Rohrkonzentration; die Systeme sehen dafür **Übergangselemente** vor: Purmo noppjet-Übergangselement „kann darüber hinaus **vor Heizkreisverteilern** eingesetzt werden, um den Übergang **großer Rohrkonzentrationen** auf die Verlegefläche zu erleichtern" (S. 74); Viega führt ein eigenes „Fonterra Base-**Verteiler-/Türset**" als Systemkomponente (S. 59). Schlüter löst die Einführung in den Verteiler mit „BEKOTEC-THERM-ZW-Winkelspangen zur definierten 90°-Umlenkung" (S. 27). Da sich vor den Verteilern „diverse Sammel- bzw. Anbindeleitungen treffen und diese auch Wärme abgeben", sind sie dort ggf. zu dämmen, um „ein Überheizen des Oberbodens gemäß DIN EN 1264-2 zu vermeiden" (Viega S. 82).

---

## 7. Abgeleitete Ordnungsregeln für einen Backtracking-Solver

Jede Regel als Invariante (I) = harte Bedingung, Verletzung ⇒ Zweig tot, oder Heuristik (H) = Ordnungs-/Pruning-Regel. VA = Ziel-Verlegeabstand, R = 5×d<sub>a</sub>, Raster = Noppenraster.

1. **(I) Doppelabstands-Invariante:** Der Einwärtsarm belegt Bahnen im Abstand 2×VA; zwischen zwei benachbarten Einwärtsbahnen bleibt genau eine Bahn frei und ist für den Rücklauf **reserviert**. Belegt der Einwärtsarm eine Reservebahn oder lässt er > 2×VA Lücke, ist der Zweig sofort tot. *(Schlüter S. 27; Fördetherm S. 1.)*
2. **(I) Alternanz-Prüfung:** Im fertigen Plan wechseln sich Vor- und Rücklaufbahnen strikt ab („Vor- und Rücklaufleitung liegen in der Fläche nebeneinander"). Zwei benachbarte Bahnen desselben Arms (außerhalb der Wendeschleife) ⇒ ungültig. *(Fördetherm S. 1; Schlüter S. 27.)*
3. **(I) Terminal-Invariante:** Die Kurve beginnt **und** endet an der Verteiler-Anschlusskante; beide Enden nebeneinander. Jeder Zustand, von dem aus der Rücklauf die Anschlusskante nicht mehr über die reservierten Bahnen erreichen kann, ist tot. *(heima24 „beginnend und endend am Heizkreisverteiler"; alle Verlegeschemata.)*
4. **(H) Außenring zuerst:** Erste Aktion ist die geschlossene Umrundung des Feldrands im Wandabstand (≥ 50 mm zu Wänden, ≥ 200 mm zu Schornsteinen/Schächten); erst danach einwärts spiralen. Das fixiert die Suchreihenfolge: außen → innen für den Vorlauf, innen → außen für den Rücklauf. *(Bildlich: Fördetherm/Purmo/Uponor-Schemata; Abstände: Schlüter S. 27.)*
5. **(I) Kehren-Geometrie:** Die Umkehr ist eine S-Schleife am inneren Spiralende; jeder Bogen ≥ R; auf Noppenplatte jede Umlenkung über ≥ 2 Noppen (≥ 2 Rasterfelder Breite). Der Platzbedarf der S-Schleife ist genau der 2×VA-Freiraum des Einwärtsarms — reicht er nicht (2×VA < 2R), ist **dieser VA für eine mittige Kehre unzulässig**, nicht die Kehre „irgendwie" zu verkleinern. *(Fördetherm S. 1; Schlüter S. 27; Purmo S. 72/74.)*
6. **(I) Raster-Quantisierung:** Auf Noppenplatten existieren nur Positionen im Raster; VA ∈ {k·Raster}; Richtungen 0°/90°, 45° nur als dokumentierte Ausnahme mit Zusatzhaltern. Zwischenpositionen sind keine Suchzustände. *(Schlüter S. 27; Viega S. 57; Purmo S. 74.)*
7. **(I) Fugen sind Barrieren:** Heizkreisbahnen dürfen Bewegungs-/Bauwerksfugen nie kreuzen; nur Anbindeleitungen dürfen es, orthogonal und gedanklich „im Schutzrohr" (300 mm). *(Viega S. 86; Schlüter S. 20.)*
8. **(H) Rechteck-Zerlegung vor der Suche:** Nichtrechteckige (konkave) Felder vor dem Spiralen in rechteckige Teilfelder zerlegen — Ziel „ausschließlich rechteckige Bereiche", gedrungen, Seitenverhältnis ≤ 1:2, Seite ≤ 8 m, Fläche ≤ 40 m²; je Teilfeld eine eigene Schnecke, Verbindung nur per Anbindeleitung. Eine Spirale um eine konkave Ecke ist kein dokumentiertes Handwerksmuster — der Solver sollte sie gar nicht erst versuchen. *(Viega S. 87; Fugenlogik ebd. — bei BEKOTEC estrichseitig entschärft [S. 24], als Suchraum-Heuristik trotzdem gültig.)*
9. **(H) Randzone vorschalten statt integrieren:** Verdichteter Abstand an Außenwänden wird als vorgeschalteter Mäander-Abschnitt vor der Schnecke gelegt oder als eigener Kreis (> 3 m²); innerhalb der Spirale bleibt VA konstant; Übergänge eng→weit allmählich. Lokale VA-Modulation innerhalb der Schnecke ist kein Handwerksmuster. *(Fördetherm-ABC; heizgeiz; SHKwissen Randzonen.)*
10. **(H) Längen-/Flächenbudget als Pre-Prune:** Vor der Suche L ≈ A·(1/VA) + 2·L_Anbindung gegen die Systemgrenzen prüfen (BEKOTEC 16×2: 100 m bzw. 7/15/22/30 m² je VA; Purmo: 100/120/140 m, 250 mbar). Budget überschritten ⇒ Fläche teilen, nicht weitersuchen. *(Schlüter S. 67; Purmo S. 67.)*
11. **(H) Verteilervorfeld als Sonderzone:** Im Streifen vor dem Verteiler gelten Rasterregeln nicht (Übergangselemente, Rohrkonzentration erlaubt), dafür zählt die Fläche nicht als beheizt/gedeckt und Anbindeleitungen laufen gebündelt und möglichst kurz (30-%-Deckungsregel als Obergrenze der ungeregelten Abgabe). *(Purmo S. 74; Viega S. 82; TM Anbindeleitungen 2021, Abschn. 1.3/2/3.)*
12. **(H) Sperrflächen als Löcher:** Einbauten (Einbauschränke, Wannen), Bauwerksfugen und Kamin-Bannmeilen vorab aus der Belegfläche ausstanzen und wie Inseln behandeln — nicht während der Suche entdecken. *(Purmo S. 63; SHKwissen Einbauten; Schlüter S. 20/27.)*
13. **(Kein Constraint) Keine Paritätsregel für die Schnecke:** Die 2×VA-Spirale ist für jede Windungszahl schließbar; Paritäts-Checks sind nur beim Mäander nötig (Endseite des Rohrs). Ein Solver, der Windungs-Parität als Constraint führt, verschwendet Zustände. *(Eigene geometrische Folgerung — als solche gekennzeichnet; Abwesenheit der Regel in allen gesichteten Primärquellen.)*

---

## 8. Quellen

Alle abgerufen am 2026-07-31. PDFs nur verlinkt, nicht ins Repo übernommen.

**Hersteller (primär):**
- Schlüter-Systems: *BEKOTEC-THERM — Der Keramik-Klimaboden, Technisches Handbuch* — [PDF (Mirror heinze.de)](https://www.heinze.de/m2/19/61919/etc/93/43197693.pdf), [Produktseite](https://eu.schluter.com/de-DE/bekotec-therm-6810.html). Zitierte Seiten: 7–8 (Fugen-Checkliste), 12 (Grenzkurven 9 K/15 K, Rohrbedarf je VA), 20 (Bauwerksfugen), 24 (fugenloser Estrich), 27 (Verlegung/Schneckenform/Biegeradius/2-Noppen-Regel/ZW-Winkelspangen), 67 (max. Heizkreislängen/-flächen), 81 (Leistungsdiagramm-Erläuterung, Randzone 1 m), 105 (max. Oberbodentemperaturen 29/33/35 °C).
- Purmo: *Flächenheizung — Technische Spezifikation 1-2015* — [PDF](https://www.purmo.com/docs/P_TEC_FBH_1-2015_DE_150325_web.pdf). Zitierte Seiten: 63 (Verlegeformen, Stellflächen), 64 (Randzonen, Anbindeleitungen im Flur), 65 (Schutzrohr −40 %), 66–67 (Heizkreisgröße, 100/120/140 m, 250 mbar), 72–74 (Verlegeanleitungen rolljet/noppjet, 5×d, Übergangselement vor Verteilern), 76 (clickjet, drallfrei, Clips an Bögen), 78 (Leistungstabellen; dortige Randzonen-Angabe 29 °C vermutlich Druckfehler).
- Viega: *Anwendungstechnik Fonterra — Fonterra Base (Planung/Montage)* — [PDF](https://www.viega.de/content/dam/viegadm/en/temp/content_assets/eu/products/applications_and_topics/applications/awt_fonterra_2017_04_fonterra_base.pdf). Zitierte Seiten: 57 (Noppenplatte, diagonal), 59 (Verteiler-/Türset), 63 (DIN EN 1264-2: 29/35/33 °C), 82 (Anschluss an den Verteiler, Dämmung der Anhäufung), 86–87 (Fugen, Schutzrohr 300 mm, Estrichfeld-Regeln, T-/L-Räume), 88 (Montageschritte).
- Uponor: *Klett Fußbodenheizung/-kühlung — Technische Informationen* — [PDF](https://brandportal.uponor.com/m/426b0b9dc9c1321/original/TI-Klett-UFH-C-DE-1143092-v3.pdf). S. 3 („verwinkelte Räume", Verlegeraster), S. 28 (Installationsablauf, Bild der bifilaren Spirale).

**Verbände/Norm (primär bzw. norm-sekundär):**
- ZVSHK/BDH/BVF: *Technisches Merkblatt „Lage des Verteilers und Verlegung von Anbindeleitungen bei Fußbodenheizungen"*, Nov. 2021 — [PDF-Mirror](https://hpv-vertriebsgmbh.com/_daten/pdf/429.TM_Anbindeleitungen_BDH.BVF-ZVSHK%202021.pdf), [BVF-Meldung](https://www.flaechenheizung.de/verbaendeuebergreifendes-technisches-merkblatt-lage-des-verteilers-und-verlegung-von-anbindeleitungen-bei-fussbodenheizungen-erschienen/), [BVF-Downloads](https://www.flaechenheizung.de/downloads/). Abschnitte 1.2–1.3 (Auslegungssoftware, 30 %-Regel), 2 (Verteilerposition), 3 (Leitungsführung), 4 (Dämmung, Türdurchführung), 5 (6-m²-Regel, 150-W-Grenze), 10 (Begriffe, Schema mit Spiral-Heizkreisen).
- DIN EN 1264-4 (Installation): paywalled; [Inhaltsübersicht baunormenlexikon](https://www.baunormenlexikon.de/norm/din-en-1264-4/fe4296d9-7a24-4c24-8b5e-8a880d4df6e2); inhaltliche Wiedergaben über Schlüter S. 27 (Abstände), Viega S. 82/86 (Verteilernähe, Fugen), Purmo S. 63 (Befestigungsabstände). Verlegeabstands-Toleranz ±1 cm: siehe auch `2026-07-25-verlegemuster-literatur.md`.
- SBZ (Gentner Verlag): [„Schnittstellenkoordination ist eine wichtige Aufgabe — widersprüchliche Normen bei Fußbodenheizungen"](https://www.sbz-online.de/sbz-schwerpunkt/schnittstellenkoordination-ist-eine-wichtige-aufgabe-widerspruechliche-normen-bei) (Fugenplan, Kreuzungsverbot).

**SHK-Lehr-/Praxismaterial (sekundär, als solches gekennzeichnet):**
- SHKwissen/HaustechnikDialog (Bosy): [Bifilare Verlegung](https://www.haustechnikdialog.de/SHKwissen/678/Bifilare-Verlegung) (abweichende Begriffsverwendung!), [Randzonen/Einbauten](https://www.haustechnikdialog.de/SHKwissen/859/Randzonen-Einbauten) (VA 75/100, 3-m²-Regel, allmählicher Übergang).
- Fördetherm (Höhne Wärme- und Energiesysteme): [PDF „Allgemeine Verlegearten"](https://www.baudochselbst.de/pdf_dokumente/fussbodenheizung_foerdetherm_allgemein_verlegearten.pdf) (Mäander/Doppelmäander/Schnecke wörtlich + Schemata), [ABC „V wie Verlegearten"](https://www.fussbodenheizung-foerdetherm.de/kleines-fussbodenheizungs-abc-v-wie/), [„Welche Heizrohrverlegung gibt es"](https://www.fussbodenheizung-foerdetherm.de/welche-heizrohrverlegung-gibt-es/) (vorgeschaltete verdichtete Randzone).
- heima24-Wiki: [Heizkreise berechnen](https://www.heima24.de/wiki/fussbodenheizung-heizkreise-berechnen/), [Selbst verlegen](https://www.heima24.de/wiki/fussbodenheizung-selbst-verlegen/) („beginnend und endend am Heizkreisverteiler").
- Selfio: [Noppensystem verlegen — Anleitung](https://www.selfio.de/blog/fussbodenheizung-noppensystem-verlegen-anleitung) (Baustellen-Schrittfolge, Druckprobe).
- heizgeiz.de: [Verlegearten](https://heizgeiz.de/fussbodenheizung-verlegearten) (S-Wendeschleife, vorgeschaltete Randzonen).
- Schramm: [Bifilare Fußbodenheizung](https://www.schramm.de/684-622-bifilar-fussbodenheizung/) (allgemein, ohne Zusatzsubstanz).

**Nicht auswertbar (nur verlinkt):** BDH-Infoblatt Nr. 51 „Fußbodenheizung/-kühlung" ([PDF](https://www.bdh-industrie.de/fileadmin/user_upload/Downloads/Infoblaetter/Infoblatt_Nr_51_1_Fussbodenheizung_-kuehlung.pdf)) — Textextraktion fehlgeschlagen, keine Behauptung daraus übernommen. SBZ-Monteur-Artikel („Fußbodenheizung mäandernd oder bifilar") — Redirect-Schleife beim Abruf; Inhalte stattdessen über Fördetherm/SHKwissen abgedeckt.
