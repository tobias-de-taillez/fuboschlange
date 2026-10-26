# Kamera-Raumerfassung im Browser auf Android — geht das?

**Datum:** 2026-10-24 (alle Links an diesem Tag abgerufen)
**Anlass:** Experiment „Companion Mobile". Frage von Tobias: Kann die browserbasierte Raumaufmaß-App auf einem Android-Handy per Kamera und Kantenerkennung die Grundgeometrie eines Raums erfassen? Gemeint sind Wände, Ecken, Boden, Türen, Fenster, Durchbrüche, Inseln und Höhen.
**Präzisierungen (Tobias):**
1. Nicht das Längenmessen ist lästig, sondern das Zeichnen der Grundgeometrie. Steht die Rohversion, ist sie mit dem Laser schnell eingemessen. Die Kamera muss also **zeichnen, nicht messen**.
2. Die **Decke** ist meist viel besser zu sehen als der Boden und kaum zugestellt. Das Ganze muss auch im **möblierten Raum** funktionieren, also mit Kanten, die durch Verdeckungen hindurch projiziert werden.

**Testgerät:** Pixel 9 Pro, Android 17, Chrome 155.0.8059.87, Mali-G715, keine Chrome-Flags gesetzt (`chrome://gpu` vom 2026-10-24).

**Antwort:** Ja, als **geführte Erfassung**. Chrome auf Android liefert ohne Flags alles, was eine Rohskizze braucht: ARCore-Pose in Metern, das Kamerabild zum jeweiligen Frame und daraus die Brennweite. Die Kamera-Genauigkeit (Zentimeter, 2–6 % der Länge) reicht für eine Skizze. Die vollautomatische Variante („Raum abfilmen, Plan bekommen") hat dagegen keinen Beleg, weder im Browser noch nativ auf Android.

Der tragfähige Weg arbeitet mit **Linien statt Flächen**. Die Schwerkraft ist bekannt, also ist jede Wand eine Linie im Grundriss. Die Kamera muss davon nur irgendein Stück sehen, am besten die Wand-Decke-Kante über den Möbeln. Ecken entstehen als Schnittpunkte benachbarter Wandlinien, auch wenn sie hinter einem Schrank liegen. Öffnungen und Höhen werden auf die so gewonnenen Wandflächen projiziert. Dabei muss ARCore weder Wände noch Decke erkennen, und genau das kann es bei weißen Flächen nicht. Das Ergebnis ist exakt das Importformat von `raumaufmass.html`.

---

## 1. Was Chrome auf Android heute kann

Alles im Auslieferungszustand. Quellen sind chromestatus, die Chrome-Release-Notes und der Chromium-Quellcode (`device/vr/android/arcore/`).

| Baustein | Seit | Was es liefert | Für uns |
|---|---|---|---|
| WebXR `immersive-ar` (ARCore) | M81 | metrische Pose (VIO), nur HTTPS oder localhost | Grundlage |
| `hit-test` | M81 | Treffer **nur auf erkannten Ebenen**; Feature-Punkte nur hinter Flag | Bodenpunkt, Kamerahöhe |
| `anchors` | M79 | weltfeste Bezugspunkte | Messungen über mehrere Frames |
| `dom-overlay` | M83 | HTML-UI über dem Kamerabild | Fadenkreuz, Knöpfe |
| `depth-sensing` | M90 | nur geglättete Tiefe, ca. 160×120, mm, `cpu-optimized`; **keine** Rohdaten, **kein** Konfidenzbild | höchstens grobe Hilfe |
| `camera-access` | M107 | Kamerabild als WebGL-Textur, nur im XR-Frame gültig; Brennweite aus `projectionMatrix` | **Kern**: Kanten plus Pose |
| `plane-detection` | **M147** (2026-04-07) | Ebenen horizontal/vertikal, konvexe Polygone, **keine** Labels (Wand/Boden) | Boden; Wände nur, wenn sie Struktur haben |
| Mesh, Image-Tracking, XR→WebGPU | — | nur hinter Flags bzw. nicht auf Handys | nicht nutzbar |

Wichtige Einzelheiten:

- **Brennweite und Hauptpunkt** lassen sich aus `XRView.projectionMatrix` plus Viewport berechnen. Chromium nimmt einen zentrierten Hauptpunkt an (Abweichung „a few pixels") und gibt keine Verzeichnung heraus. Für eine Skizze egal.
- **Schwerkraft:** Die +Y-Achse der WebXR-Welt zeigt nach oben, gegen die Schwerkraft (Hit-Test-Spec, ARCore C API). Senkrechte und waagerechte Kanten haben damit vorhersagbare Bildrichtungen.
- **Kamerabild nach WebGPU:** `XRGPUBinding` steht hinter dem Flag „WebXR/WebGPU Binding", und selbst damit fehlt `getCameraImage`. In der XR-Sitzung geht Bildverarbeitung deshalb nur über WebGL2/GLSL oder über `readPixels` auf die CPU. **vgpu ist in der XR-Sitzung nicht einsetzbar**, das widerspricht der globalen vgpu-Präferenz. Für den ersten Aufbau ist es egal, weil die Kantensuche (Abschnitt 3) in JS auf einem kleinen Bildausschnitt läuft.
- **Bekannter Fehler:** `getCameraImage` stürzte in Chrome 147–148 mit Projection Layers ab. Behoben in M149, das Pixel hat 155.
- **`local-floor`** ist auf ARCore eine Schätzung (fest 1,2 m). Die Bodenhöhe kommt aus Hit-Test oder Bodenebene.
- **Pixel 9 Pro:** Die ARCore-Liste führt „Supports Depth API", es gibt keinen ToF-Sensor, Tiefe also nur aus Bewegung. WebGPU läuft (Vulkan, `shader-f16`, `subgroups`, `timestamp-query`), WebNN ist aus. WebNN rechnet auf Android laut blink-dev (2026-02-13) ohnehin nur auf der CPU und wurde aus dem Origin Trial genommen.

## 2. Was nicht geht

- **Weiße Wände und Decken als Flächen.** Google selbst: „flat surfaces without texture, such as a white wall, may not be detected properly" (ARCore Fundamentals). Tiefe auf weißen Wänden ist „imprecise" (ARCore Depth, 2026-09-04). Weil Hit-Test nur auf erkannten Ebenen trifft, liefert **Zielen auf eine weiße Wand oder Decke gar keinen Treffer**. Ein Praxisfall (sceneview PR #3863, 2026-09-25): Die vertikale Suche war korrekt eingeschaltet, und trotzdem wurde keine Wand gefunden. Die App rät seitdem, auf die Wand-Boden-Kante zu zielen.
- **Keine Semantik.** WebXR auf ARCore liefert keine Labels (Wand, Boden, Tür, Fenster). ARCore Scene Semantics funktioniert nur draußen. Öffnungen müssen wir selbst erkennen.
- **Vollautomatik.** magicplan hat das Kamera-Scannen auf Android 2024 entfernt („technical limitations"). Selbst vorher hieß es auf Android: Ecken antippen, Öffnungen von Hand. Automatische Tür- und Fenstererkennung gab es nur auf iOS mit LiDAR. Google hat seine Measure-App 2021 eingestellt, das WebXR-Experiment „Measure Up" ist inaktiv. Kein gefundenes Produkt leitet auf Android aus Kanten Wände, Türen und Fenster ab, weder nativ noch im Browser. ToF-Sensoren hatten nur Android-Modelle von 2019–2020.
- **Einraum-Layout-Netze** (RoomNet, ST-RoomNet, LSUN) liefern nur eine Quader-Form im Bild, ohne Maßstab. Die Repos haben keine Lizenz. HorizonNet und LGT-Net brauchen 360°-Panoramen.
- **Monokulare Tiefennetze** (Depth Anything V2, Metric3D v2, UniDepth) erreichen außerhalb ihrer Testdaten 8–40 % Relativfehler und rund 19° Fehler bei der Wandorientierung. Als Geometriequelle ungeeignet.
- **opencv.js** enthält in den offiziellen Builds keinen LSD-Liniendetektor (die Klasse ist nicht gebunden). Es ist skalar, single-threaded und 3,5 MB gzip groß. Canny und Hough sind enthalten, werden für den Kern aber nicht gebraucht.

## 3. Der Ansatz: Linien statt Flächen, Decke zuerst

**Grundidee.** Die Schwerkraft ist bekannt, die Räume sind fast immer lotrecht gebaut. Damit gibt es drei Linienfamilien, die alle eine vorhersagbare Bildrichtung haben:

| Linie | im Raum | im Grundriss | meist sichtbar? |
|---|---|---|---|
| Wand-Decke-Kante | waagerecht, Höhe H | Wandlinie | **ja**, über den Möbeln |
| Wand-Boden-Kante | waagerecht, Höhe 0 | Wandlinie | oft verdeckt |
| Wand-Wand-Ecke | senkrecht | Punkt | oberer Teil meist ja |

Eine Wand ist im Grundriss eine **unendliche Linie**. Um sie festzulegen, genügt irgendein sichtbares Stück, gleich welches. Verdeckte Abschnitte fallen einfach weg. Die Ecke entsteht als Schnitt zweier benachbarter Wandlinien und muss selbst nie sichtbar sein. Das ist die „Projektion durch Verdeckungen hindurch".

**Die Decke** ist selten zugestellt, so begründen es auch Bieri et al. (HouseLayout3D, arXiv 2512.02450, Abschnitt 4.4): „since ceilings are rarely occluded by objects". ARCore erkennt die weiße Decke zwar nicht als Fläche, das brauchen wir aber auch nicht:

- Eine Wand-Decke-Kante im Bild ergibt mit der Kameraposition eine Ebene durch die Kamera.
- Deren Schnitt mit der waagerechten Ebene in Deckenhöhe H ist die Wandlinie im Grundriss.
- **H ist eine einzige Unbekannte für den ganzen Raum** (flache Decke). Sie folgt aus der Parallaxe: Dieselbe Kante, gesehen aus zwei Abständen zur Wand, muss im Grundriss auf dieselbe Linie fallen. ARCore liefert die Kamerapositionen in Metern. Wer auf die Wand zugeht oder von ihr weg, erzeugt Parallaxe. Wer parallel zur Wand läuft, erzeugt keine.
- Alternativ setzt eine einzige Laser-Höhenmessung H. Die braucht `raumaufmass.html` ohnehin.
- Alle Beobachtungen einer Wand aus allen Standpunkten ergeben eine kleine Ausgleichung pro Linie, plus die gemeinsame Höhe H. Ausreißer wie Schrankkanten oder Bilderrahmen fallen über einen robusten Fit heraus.

**Der Boden** ist optional. Ein Hit-Test auf irgendein freies Bodenstück zwischen den Möbeln liefert die Kamerahöhe und damit die Raumhöhe. Sichtbare Wand-Boden-Kanten gehen als zusätzliche Beobachtungen derselben Wandlinien ein.

**Senkrechte Ecken** (auch an Pfeilern und freistehenden Wänden): Aus jedem Standpunkt ergibt die Ecke im Grundriss einen Peilstrahl. Zwei Standpunkte mit 1–2 m Abstand schneiden sich im Eckpunkt. Das ist eine Gegenprobe zu den Linienschnitten, und bei Inseln oft die Hauptquelle.

**Öffnungen und Höhen** werden auf die senkrechte Wandfläche über der Wandlinie projiziert. Daraus ergeben sich x, y, w und h in Wandkoordinaten, also das bestehende Öffnungsmodell. Halb verdeckte Fenster (Vorhang, Schreibtisch) liefern ihre sichtbaren Kanten; der Rest kommt per Tipp oder als Vorbelegung. Reicht eine Öffnung bis zum Boden, ist sie Tür oder Durchbruch, sonst Fenster. Typ und Aufschlag legt ein Tipp fest.

**Dachschrägen:** Drempel- und Kehlbalkenkanten sind ebenfalls waagerecht, jede mit eigener Höhe, also dasselbe Verfahren. Schräge Giebelkanten sind keine waagerechten Linien. Sie brauchen die allgemeine Linien-Triangulation aus zwei Ansichten (Plücker-Koordinaten, Hartley & Zisserman) und kommen später.

**Geführte Erfassung:** Der Nutzer läuft den Raum ab und hält auf jede Wand-Decke-Kante, die Kante rastet ein. Dasselbe für jede Öffnung. Die Reihenfolge der Wände liefert die Topologie. Inseln bekommen einen eigenen Ring. Zeichnen muss niemand.

**Einrasten statt Canny.** Weil die Bildrichtung jeder Kante vorhergesagt ist, wird die Suche eindimensional: Helligkeit entlang der vorhergesagten Richtung über einige hundert Pixel aufsummieren und quer dazu das Maximum suchen. Der Synthetiktest des CV-Strangs verglich zwei weiße Flächen mit nur 3 Graustufen Unterschied. Dort liegt das Signal-Rausch-Verhältnis pro Pixel bei etwa 1, und Canny findet die Kante nur in einem schmalen Schwellfenster. Die aufsummierte Suche findet sie auf ±1–2 px, ohne Schwellen, in unter 1 ms (Desktop, JS). **Annahme, unbelegt:** Eine Wand-Decke-Kante hat einen deutlicheren Helligkeitssprung als eine Wand-Wand-Kante, weil beide Flächen anders zum Licht stehen. Darauf baut der Decke-zuerst-Ansatz. Die Probe muss das messen (siehe offene Fragen). Vorbild ist VideoTrace (SIGGRAPH 2007): grob gezogene Linien, die an starke Bildgrenzen einrasten.

**Rechenaufwand:** Pro Einrasten genügt ein Bildausschnitt um das Fadenkreuz per `readPixels`, danach JS. Kein Vollbild, kein neuronales Netz, kein opencv.js, keine COOP/COEP-Header. Wie schnell `readPixels` auf dem Pixel ist, hat niemand gemessen; das misst die Probe.

**Risiko Tracking:** ARCore verfolgt die Position über Bildmerkmale. Sieht die Kamera nur weiße Wand und Decke, kann das Tracking abreißen. Die Bewegungssensoren überbrücken nur kurz. Die Probe muss den Tracking-Zustand beim Blick nach oben mitschreiben. Abhilfe: das Bild so halten, dass unten noch etwas mit Struktur zu sehen ist, etwa Möbel, Türrahmen oder Bilder.

**Ausbau später, optional:** Öffnungen vorschlagen statt anzielen. Dafür gibt es kein lizenzsauberes fertiges Modell: COCO hat keine Tür- oder Fensterklasse, das Ultralytics-OIV7-Modell steht unter AGPL. Man müsste einen permissiv lizenzierten Detektor auf den Open-Images-Klassen Door und Window nachtrainieren. Im Handy-Browser kostet das geschätzt 0,1–1 s pro Bild. Erst angehen, wenn die geführte Erfassung steht.

## 4. Genauigkeit — reicht für eine Skizze

| Situation (ARCore, Kamera ohne ToF) | typischer Fehler | Quelle |
|---|---|---|
| Nahbereich, ein Standpunkt | 2–8 cm | Scargill 2021; Maneli & Isafiade 2023 |
| Standpunktwechsel, Raumlängen | 6–23 cm bzw. 2–6 % | Scargill 2021 („Unfocused move" 10–15 cm); GRIHA 2021 |
| Tiefenkarte bis 4 m | 6–8 cm | Haenel 2022 |
| monokulare Netze | ≥ 20 cm | Depth Anything V2, UniDepthV2, Depth Pro |

Eine Skizze braucht das nicht besser. Der Solver konvergiert heute schon aus Handskizzen, die nur ungefähr stimmen. Wichtig ist, dass jede Laser-Messung eindeutig einer Ecke oder Öffnung zugeordnet werden kann. Kamera-Werte gehen deshalb **als Skizze** ein (`pts`, `openings`), nicht als `meas`. Kamera-Fehler innerhalb einer Sitzung hängen zusammen (Maßstab, Drift). Als unabhängige Messungen mit großem `sigma` bekämen sie zu viel Gewicht. Sauber wäre das erst mit Maßstabs- und Lageparametern pro Sitzung, und für das Ziel ist es unnötig.

## 5. Markt und Praxis

- **Profis skizzieren und messen per Bluetooth-Laser nach:** Leica DISTO Plan (Sketch Plan, Auto-Scale, seit 03/2026 Diagonalen), Bosch MeasureOn, magicplan mit Laser. Wie widersprüchliche oder überzählige Maße verrechnet werden, dokumentiert keiner. Einen Ausgleich mit Redundanzanalyse und Ausreißertest wie in `raumaufmass.html` habe ich nirgends gefunden.
- **Am nächsten am Konzept** ist Plotlay Scan (Android, 2026-10, praktisch ohne Nutzer). Dort tippt man Ecken mit ARCore an, misst eine Länge nach, und der ganze Plan skaliert mit; die Übergabe an die Web-App läuft per QR-Code. Das ist eine Einzelmaßstabs-Korrektur, keine Ausgleichung.
- **Cloud-Lösungen** (CubiCasa, DocuSketch, Hosta/Elara, Matterport) rechnen aus Video oder Fotos auf dem Server, mit Stunden Wartezeit.

**Nebenbefund:** Web Bluetooth läuft auf Chrome Android seit M56. Das BLE-Profil der Leica DISTO ist mehrfach unabhängig entschlüsselt (Service `3ab10100-f831-4395-b29d-570977d5bf94`, Distanz als float32 LE, Neigung in rad). Laserwerte könnten so ohne App direkt in die Browser-App fließen. Ältere Bosch-GLM nutzen klassisches Bluetooth (SPP), das Web Bluetooth nicht erreicht.

## 6. Ausgabe = bestehendes Importformat

Die Probe erzeugt genau das, was `deserialize()`/`importProblem()` schon annehmen:

```js
{ pts:[{id,x,y}],                     // mm, Grundriss
  walls:[[a,b], …],                   // Außenring + Inselringe
  meas:[],                            // leer: Laser kommt danach
  openings:[{id,kind:'door'|'window'|'hole',a,b,x,y,w,h,swing}],
  hmeas:[{kind:'h',at,d,sigma,on:true}] }
```

Die Übergabe läuft über den vorhandenen `#raum=`-Link (lz-string, QR) oder eine JSON-Datei. Danach misst der Nutzer am Laptop wie gewohnt mit dem Laser ein, und `suggest()` sagt, was noch fehlt.

## 7. Messaufbau (Vorschlag)

Eine eigenständige Mobile-Seite nach dem Muster von `imu-messung.html`. Sie läuft über HTTPS (Deploy-Skript erweitern) oder über localhost per `chrome://inspect`-Portweiterleitung. Ein Node-Selbsttest wie bei `probe-imu.mjs` prüft die Mathematik an synthetischen Kameras mit bekannter Wahrheit: Rückprojektion, Höhe H aus Parallaxe, Linienschnitte. Eine Abweichung am Gerät liegt dann am Sensor, nicht am Code.

**Stufe 0 — Fähigkeiten (Minuten):**
- Welche Features gewährt die Sitzung (`enabledFeatures`)?
- Wie groß ist das Kamerabild, und was kostet `readPixels` für einen Ausschnitt?
- Liegt die Bodennormale auf +Y?
- Hält das Tracking beim Blick auf die Wand-Decke-Kante?

**Stufe 1 — Decke und Wände:**
- Wand-Decke-Kanten einrasten.
- H im ersten Test **nicht** aus der Parallaxe nehmen, sondern aus einer Laser-Höhe plus Hit-Test auf ein freies Bodenstück. Die Parallaxe-Schätzung läuft nur zum Vergleich mit. So lässt sich ein falscher Plan eindeutig zuordnen: Einrasten oder Höhe.
- Jede Beobachtung relativ zu einem `XRAnchor` speichern, nie in Weltkoordinaten. ARCore warnt, dass jeder Frame ein eigenes Weltkoordinatensystem haben kann. Ein Relokalisierungssprung mitten im Rundgang würde sonst Linien-Fit und H verfälschen.
- Wandlinien ausgleichen, Ecken als Schnittpunkte bilden, Ring schließen.
- Export als `#raum=`-Link.

**Stufe 2 — Öffnungen, Inseln, Höhen:**
- Rahmenkanten auf die Wandflächen projizieren, Typ per Tipp.
- Pfeiler über senkrechte Peilungen erfassen.

**Erfolgskriterien** (keine Millimeter):
1. **Topologie:** gefundene Ecken, Öffnungen und Inseln im Vergleich zur Wirklichkeit; jede Öffnung an der richtigen Wand. Im **möblierten** Raum, nicht nur im leeren.
2. **Zeit:** Erfassung am Handy gegen das Zeichnen desselben Raums am Laptop.
3. **Zuordnung:** Jede Laser-Messung lässt sich eindeutig zuordnen, und der Solver konvergiert aus der Kamera-Skizze.
4. **Robustheit:** Tracking beim Blick nach oben, Kontrast der Wand-Decke-Kante bei Tageslicht und bei Kunstlicht.
5. **Chrome-Version:** pro Messung exakt notieren. Chrome erscheint seit M153 alle zwei Wochen.

## Offene Fragen (nur am Gerät klärbar)

- Hält ARCore das Tracking, wenn das Bild überwiegend weiße Wand und Decke zeigt?
- Wie stark ist der Helligkeitssprung an echten Wand-Decke- und Wand-Wand-Kanten? Wie viele Fehltreffer erzeugen Raufaser, Stuck, Schatten und Leuchten?
- Wie gut ist H aus Parallaxe bestimmt, also wie viel Abstandsänderung zur Wand braucht es?
- Kosten und Formatfehler von `readPixels` auf der Kamera-Textur: Ein Galaxy A52S lieferte Nullen (Babylon.js-Forum, 2024), bei Samsung gibt es Absturzberichte mit `camera-access` (Needle-Forum, 2026-06).
- Kommen senkrechte Ebenen im Browser überhaupt an? Sie wären ein Zusatz für Wände mit Struktur.
- Läuft `getUserMedia` parallel zur AR-Sitzung, etwa für Fotos in hoher Auflösung? Laut einem Chromium-Entwickler ist die Kamera exklusiv belegt.

## 8. Schwenk-Auswertung als Schätzer (Nachtrag, 2026-10-24 abends)

**Auftrag (Tobias):** Automatisierung und Komfort maximieren, dabei Zuverlässigkeit und Selbstkorrektur verbessern – „als Signalverarbeitungs-Doktorarbeit, alles rausholen“.

**Bedienung:** Kurz auf den Boden halten (Anker setzt sich selbst), dann mit dem Fadenkreuz einmal rundum an der Wand-Decke-Kante entlang. Jede sichere Kante wird erfasst, sobald sie in zwei verarbeiteten Bildern hintereinander dieselbe Linie ergibt (2 aus 2). Die Raumhöhe ist **optional**: Ohne sie schätzt der Schätzer sie aus der Parallaxe, mit Laser-Wert wird sie zur Kreuzprobe.

**Messmodell.** Jede Erfassung liefert zwei Strahlen im Ankerraum, gehoben auf y=H. Für einen gehobenen Punkt in Entfernung d und Höhenabstand Δ=H−h gilt ∂d/∂e = (d²+Δ²)/Δ, seitlich wirkt der Winkelfehler über √(d²+Δ²). Projiziert auf die Wandnormale ergibt das je Endpunkt ein Gewicht 1/σ². Flache Blicke auf ferne Kanten wiegen wenig (`ptSigma`).

**Pipeline (`G.solveSweep`):**
1. **Segmentierung der Zeitfolge** durch optimale Partitionierung (Jackson et al. 2005) mit PELT-Pruning (Killick et al. 2012). Kosten je Abschnitt sind die gewichteten Restfehlerquadrate der Geradenanpassung aus Präfixsummen in O(1). Dazu kommen eine Strafe β = 3·ln(2n) je Abschnitt und κ = 13,8 (χ²₂, 99,9 %) je Ausreißer. Der Varianzfaktor wird geschätzt (Varianzkomponentenschätzung) und teilt die Kosten.
2. **Zusammenführen** per χ²-Test auf die Geradenparameter. Die Kovarianz enthält die Fit-Unsicherheit beider Gruppen und die Drift, die zwischen ihren Zeiten aufläuft (q_T·Δt, Gier mal Hebelarm), dazu eine Untergrenze für Sprünge. Ohne den Driftanteil schloss der Rundgang fast nie.
3. **Parallele, überlappende Gruppen** können nicht beide Deckenkante sein. Die Entscheidung läuft in dieser Reihenfolge:
   - dieselbe Wand mit Drift (Test aus Schritt 2),
   - Höhe aus der Parallaxe je Gruppe, als Regression: Verschiebung g·dH mit g = (ρ−n·c)/Δ; die Kante gilt als unter der Decke, wenn dH < −max(10 cm, 3,29σ),
   - „durch die Wand gesehen“: eine Kante unter der Decke landet hinter ihrer Wand und wurde von Kameras auf deren Seite gesehen,
   - sonst als Doppel gemeldet.
4. **Wiederkehr nur bei echter Überlappung** entlang der Wand (≥ 10 cm). Kollineare, aber getrennte Stücke bleiben getrennte Wände, sonst verschwindet die Nische. **Geschlossen** heißt: Wand 1 kommt wieder, nachdem alle anderen gesehen waren, und der Umriss dreht sich einmal (Summe der Außenwinkel ±360°).
5. **Gemeinsame Ausgleichung** (Gauss-Newton, robust nach Huber). Unbekannte sind alle Wände in Normalform, die Drift als Zufallsweg (Verschiebung und Gier an Stützstellen alle 8 s; die erste legt den Bezug fest) und die Raumhöhe H mit Laser- (5 mm) oder schwachem Vorwissen (2,55 ± 0,35 m). Rechte Winkel kommen nur hinein, wo ein Test über die Hauptrichtung aus vierfachen Winkeln (Kreisstatistik) sie trägt. Der Rundgang ist ein geschlossener Polygonzug: Mit der Rückkehr zur ersten Wand wird die Drift beobachtbar, wie der Schlussfehler im Polygonzug.
6. **Zwei Durchläufe:** Segmentierung und Ausgleichung wechseln sich ab, Fehlzuordnungen aus dem ersten Durchlauf werden mit korrigierter Drift und Höhe neu entschieden.
7. Zwischen fast parallelen Nachbarwänden wird ein **Versprung** an der Grenze der gesehenen Stücke ergänzt.

**App-Seite:**
- Die Auswertung läuft im Web Worker, aus demselben Quelltext wie der Selbsttest, und wird nach jeder Erfassung neu angestoßen (nie zwei Auswertungen zugleich).
- Der Abschluss-Countdown dauert 5 s, wird bei Tracking-Verlust unterbrochen und vor dem Ende noch einmal geprüft.
- Nach Tracking-Rückkehr gilt eine Beruhigung von 0,6 s.
- Der Boden setzt sich nur bei einer Kamerahöhe ≥ 1,15 m automatisch, damit ein Couchtisch nicht zum Boden wird. „Boden neu“ geht bis zur ersten Erfassung.
- Der Bodenbezug hat 4 Freiheitsgrade: Lage und Gier des Ankers, Roll und Nick verworfen.
- Der Mini-Grundriss färbt Wände nach σ_ρ, zeigt ergänzte Versprünge gestrichelt und verworfene Erfassungen grau.

**Messaufbau `raumskizze-bench.mjs`** (Monte-Carlo, je Klasse 200 zufällige Räume):
- **Räume:** Rechteck, L, Nische, Kaminvorsprung, schräge Wand; zufällig gedreht.
- **Schwenk:** 1–3 Standpunkte mit Sichtprüfung, Start mitten in einer Wand, Rückkehr zur ersten Wand, Schritte wie die Automatik (eine Erfassung je 3° Drehung).
- **Fehlermodell:**
  - Pixelrauschen 1 px
  - Posefehler je Bild (0,5 cm, 0,12°)
  - Drift als Zufallsweg (1,2 cm/√m, Gier 0,4°/min)
  - Relokalisierungssprung (20 %, 3–6 cm)
  - Verwechslung an Ecken
  - Gardinenleiste/Türsturz, Schrankoberkante, Leuchtenkanten
- **Kennzahlen:** Topologie (gleiche Eckenzahl, zyklische Zuordnung < 40 cm), maßstabsfreie Topologie, Eckenfehler, Abschluss. Läufe, in denen eine Wand weniger als 2 Erfassungen hat, gelten als unbeobachtbar und zählen getrennt.

| Klasse | gierig | Schätzer | Schätzer ohne Höhe (maßstabsfrei) | geschlossen |
|---|---|---|---|---|
| Rechteck | 85 % | **93 %** | 93 % | 92 % |
| L-Raum | 77 % | **87 %** | 90 % | 94 % |
| Nische | 31 % | **86 %** | 88 % | 71 % |
| Kaminvorsprung | 28 % | **78 %** | 89 % | 78 % |
| schräge Wand | 77 % | **93 %** | 94 % | 91 % |

Weitere Kennzahlen:
- **Eckenfehler** (Median, Topologie richtig): 12–16 cm. Das ist Drift, nicht Auswertung; die Präzision bringt danach der Laser.
- **Höhe ohne Laser:** Fehler Median 5 cm, 90 % 12–15 cm.
- **Rechenzeit:** 4–5 ms je Auswertung bei 150–200 Erfassungen (Desktop, Node).
- **Hartes Rauschen** (2,5 cm/√m Drift, halbe Läufe mit Sprung bis 10 cm, mehr Fehlgriffe): Schätzer 20–47 %, gierig 10–30 %.

**Ablation** (Rechteck/L-Raum, normales Rauschen):
- **Drift-Modell:** das wichtigste Bauteil. Ohne schließt sich der Raum in 75 statt 92 % der Fälle.
- **Zweiter Durchlauf:** L-Raum 80 → 87 %.
- **90°-Test:** Eckenfehler 13,5 → 12,1 cm, bei hartem Rauschen 24,5 → 20,8 cm.

**Grenzen:**
- **Nicht beobachtbar:** Eine Wand mit weniger als zwei Erfassungen kann kein Verfahren finden. Kurze Rücksprünge muss man deshalb kurz anschauen.
- **Phantome neben der Wand:** Eine Kante unter der Decke, die außerhalb des gesehenen Stücks ihrer Wand liegt, sieht aus wie eine Nische (laut Segmentierungs-Strang der Recherche bei beiden Verfahren 0–38 % richtig). Unterscheiden lässt sie nur die Höhen-Parallaxe, also Abstand wechseln.
- **Am Gerät zu kalibrieren:** q_T, q_ψ, σ_e, Strafe β und die Gates. Werkzeug dafür sind die Protokolle mit Laser-Wahrheit.
- **Mehrere Anker entlang des Schwenks** (Drift-Strang, Stufe 1) erst nach Messung am Gerät.

> **Hinweis:** Die Tabelle oben ist geschönt. Eine unabhängige Prüfung hat das gezeigt (Abschnitt 9): Sie zählt nur „beobachtbare“ Läufe (beim Kaminvorsprung 18 von 200), kennt keine falschen Abschlüsse und lässt Fehlgriffe im Wechsel mit der echten Kante kommen, wo sie leicht zu verwerfen sind. Es gelten die Zahlen aus Abschnitt 9.

**Literatur der Recherche** (PDFs in `paper/`): Killick et al. 2012, PELT (`1101.1438_PELT_killick_optimal_changepoints.pdf`) · Haynes et al., CROPS (`1412.3617_CROPS_penalty_search_changepoints.pdf`) · Fearnhead & Rigaill 2019, robuste Änderungspunkte (`1609.07363_robust_changepoint_outliers_biweight.pdf`) · Torr & Zisserman 2000, MLESAC (`torr2000_MLESAC_robust_estimator.pdf`) · Yang et al., GNC (`1909.08605_GNC_graduated_nonconvexity_robust_estimation.pdf`) · Pfister 2003, gewichtete Geradenanpassung (`pfister2003_weighted_line_fitting_ICRA.pdf`) · Meidow et al. 2009, Tests mit unsicheren Punkten und Geraden (`meidow2009_reasoning_uncertain_points_lines_2D_tests.pdf`) · Zhang 1997, Parameterschätzung (`zhang1997_parameter_estimation_tutorial_RR2676.pdf`) · Qin et al., VINS-Mono 4-DoF-Posegraph (`1708.03852_vins_mono_relocalization_4dof_pose_graph.pdf`) · Whelan et al. 2015, ElasticFusion (`whelan2015_elasticfusion_deformation_graph_RSS.pdf`) · Chen et al., Floor-SP (`1908.06702_floor-sp_floorplan_shortest_path.pdf`) · US 11600049 (Umfang aus Video).

## 9. Unabhängige Prüfung und ehrlicher Messaufbau (Nachtrag, 2026-10-24 spät)

Drei Prüfer haben Schätzer, App-Einbindung und Messaufbau unabhängig geprüft. Jeder Befund wurde von einem zweiten Prüfer nachgerechnet, der ihn zu widerlegen versuchte. Bestätigt wurden 9 Befunde am Schätzer, 8 an der App und 11 am Messaufbau. Werkzeuge und Einzelversuche liegen im Scratchpad der Sitzung.

### 9.1 Was am Schätzer falsch war und was jetzt gilt

| Befund | Wirkung | Korrektur |
|---|---|---|
| Vorzeichen der Parallaxe-Höhe vertauscht | Eine Leiste galt als *höher* als die Decke, echte Wände flogen als „unter der Decke“ raus (ohne Laser 23 von 80 Räumen falsch) | dH = −Steigung; σ mit Varianzfaktor. Dazu g je Punkt aus dem gehobenen Punkt selbst: n·q = ρ − g·dH gilt dann exakt, auch für dH = 0,5 m (vorher 2,45 statt 2,20 m) |
| Parallele Gruppen nach Bruchstückgröße entschieden | Eine Phantomfolge mit 15 Erfassungen verdrängte die echte Wand, die um sie herum in 3 Stücke zerfiel | Stütze der ganzen Linie (alle kollinearen Stücke). Weiter als 1,5 m hinter A gilt eine Gruppe nur dann als Phantom, wenn ihre Strahlen A innerhalb seiner gesehenen Ausdehnung kreuzen (sonst echte Wand, U-Raum, Raumteiler) |
| Abschluss mit fehlender Wand | Zwei gegenüberliegende Wände wurden als Versprung verbunden: halber Raum, geschlossen, Sitzung endet | Liegt jede Wand auf der Kameraseite der anderen, fehlt eine Wand dazwischen: nicht geschlossen, Hinweis „dort weiter schwenken“ |
| Höhe kippt ohne Laser auf Augenhöhe | Gauss-Newton mit eingefrorenen Gewichten: kleineres H macht jeden Rest billiger. Ein Standpunkt: H 1,87 statt 2,6 m, 2 statt 20 m², „geschlossen“. Aus der Hand gedreht (Telefon kreist 6–20 cm um den Körper): H −55 bis −68 cm, 3–6 m², „geschlossen“ | Ohne Laser immer maßstabsfreie Reste (Rest·Δ₀/Δ mit passender Ableitung nach H): H kommt nur aus Parallaxe und Vorwissen. Handmodell 0–30 cm: H-Fehler ≤ 5 cm, z ≈ 0, Fläche 18–21 m². Dazu Schritt in H ≤ 15 cm und H ≥ Kamera + 0,3 m; hängt H an der Schranke, wird das Vorwissen festgehalten und gewarnt |
| Abgebrochener zweiter Durchlauf mischte Stände | Ausnahme im Worker und beim Sitzungsende | Jeder Durchlauf rechnet lokal und wird erst nach Erfolg übernommen |
| Eine Erfassung schloss den Raum | Drift-Toleranz schob eine Nischen-Erfassung früh in Wand 1 | Rückkehr erst ab 3 Erfassungen in Wand 1 nach allen anderen |
| Rechter-Winkel-Test 7,5σ statt 2,5σ, bis 4° | 2–3° schiefe Wände wurden gerade gezogen | Toleranzregel ausdrücklich: < 1,5° und < 7,5σ |
| Flacher Knick (170–180°) | Erfundener Mini-Versprung, falsche Eckenzahl | Schneiden sich die Geraden an der Stoßstelle der gesehenen Stücke, ist der Schnitt die Ecke |
| PELT nicht exakt bei kurzen Schwenks | 12 von 29 152 Teilständen suboptimal | Zuschlag (mn−1)·κ−β beim Stutzen; jetzt exakt (Selbsttest gegen ungestutzte Rekursion) |

**Ein Fehler im Messaufbau hätte fast falsch entschieden.** Zunächst zeigte der Messaufbau maßstabsfreie Reste mit +10 cm Verzerrung, eingefrorene mit −5 cm, und eine Umschaltung nach Basislinie (< 5 cm) sah richtig aus. Ein zweites, unabhängiges Modell mit Kamera auf dem Armkreis hat das widerlegt. Der Simulator drehte das Lagerauschen je Bild um den *Weltursprung* statt um die Kamera. Daraus wurde ein Lagefehler von ~1 cm, der mit dem Abstand zum Ursprung wächst und nicht mit dem Maßstab skaliert, und genau der verzerrte die maßstabsfreie Form. Nach der Korrektur (Drehung um die Kamera) sind die Verzerrungen symmetrisch: eingefroren −4,5 cm, maßstabsfrei +4,9 cm; mit Armkreis 0,3 m −7,7 gegen +6,9 cm, Topologie Rechteck 53 gegen 61 %. Weil die eingefrorene Form zusätzlich kippen kann, gilt ohne Laser jetzt immer die maßstabsfreie. Die Rest-Verzerrung kommt von Posefehlern, die fest in Metern liegen. Eine Ausgleichung, die die Lage je Erfassung als Unbekannte führt, würde beide Richtungen beseitigen (offen).

### 9.2 App

- **Live-Höhe:** Ohne Laser nie unter Kamera + 0,3 m. Sonst trifft kein Strahl die Decke, nichts wird erfasst, keine neue Schätzung (4,4 % der Schwenks blieben bei hartem Rauschen hängen; jetzt 0 von 300).
- **Countdown:** eine Regel für alle Stellen (Phase Wände, keine Pause, nicht abgebrochen). Tracking-Verlust lässt ihn *warten* statt neu zu starten. „Noch nicht fertig“ gilt auch in der Lücke, „Rückgängig“ im Countdown bricht ab. Hat der Raum ergänzte Versprünge, dauert er 10 s und sagt es.
- **Selbstkorrektur:** Fehlt eine Wand nach der Rückkehr, kommt ein Hinweis mit den Wandnummern. Ist die Höhe ohne Laser nicht bestimmbar, kommt der Hinweis „ein paar Schritte weitergehen“.
- **Anker verloren/gestoppt:** Die Live-Kante wird gelöscht, statt grün stehen zu bleiben, und ein Hinweis erscheint.
- **Sitzungsende:** Die Auswertung kann das Ende nicht mehr abbrechen; das Protokoll wird immer gesichert.
- **Kreuzprobe Laser/Kamera:** gegen die *eingetippte* Höhe, Grenze max(15 cm, 3σ). Fehlalarme bei richtiger Höhe sanken in der Prüfung von 14 auf 2 % (normales Rauschen; bei hartem Rauschen bleiben sie hoch, siehe 9.4 zur Verzerrung von H).
- **Alte Worker-Antworten** aus dem vorigen Durchlauf werden verworfen.

### 9.3 Der Messaufbau zählt jetzt ehrlich

- **Jeder Lauf zählt**, mit 95-%-Wilson-Intervall. „Beobachtbar“ ist nur noch eine Aufschlüsselung.
- **Sicherheitszahl P(falsch | geschlossen):** Ein falscher Abschluss beendet die Sitzung von selbst, er ist der teuerste Fehler. Ausgewiesen wird die 2×2-Tafel geschlossen/offen × richtig/falsch, mit einer Abschlussdefinition für alle Verfahren.
- **Fehlgriffe als zusammenhängende Folge**, die die Deckenkante ersetzt. Die 2-von-2-Bestätigung lässt einzelnes Flackern nicht durch, eine Leiste im Fangradius gewinnt dagegen Bild für Bild. Das alte Wechselmodell bleibt als Ablation (`verschachtelt`).
- **Szenarien:** `verdeckt` (eine Wand ohne Deckenkante), `schrankwand` (Schrankoberkante über die ganze Wand), `pause` (45 s, Drift läuft weiter), `eckstart` (Start in der Ecke, schwenken bis zum Abschluss).
- **`--pipe=app`** spielt das Auto-Schließen nach: jeder Zwischenstand, Ende beim ersten „geschlossen“.
- **Getrennte Drift-Stellschrauben** (waagerecht, senkrecht, Gier, Fehlgriffe) und `--kurve`.
- **Maßstabsfrei** aus einer simulierten Laserstrecke statt aus der wahren Fläche.
- **Genauigkeit über alle Läufe:** max. Eckfehler je Lauf, Fehlschlag = ∞.
- **`--html=`** misst einen älteren Stand der Seite (Vorher/Nachher auf denselben Räumen).

### 9.4 Zahlen (je 200 Räume, vorher → nachher auf denselben Räumen)

Alle Werte stammen aus dem korrigierten Simulator (Lagerauschen dreht um die Kamera, siehe 9.1). Fehlgriffe kommen als Folge. Die Spalten in eckigen Klammern sind das 95-%-Intervall des neuen Stands.

**Mit Laser-Höhe** (dp), normales Rauschen:

| Klasse | Topologie | geschlossen & falsch | P(falsch \| geschl.) |
|---|---|---|---|
| Rechteck | 68 → **70 %** [63–76] | 18 → 17 % | 22 → 20 % |
| L-Raum | 53 → 50 % [43–57] | 22 → 19 % | 34 → 32 % |
| Nische | 34 → 34 % [28–41] | 28 → 26 % | 57 → 54 % |
| Kaminvorsprung | 28 → 32 % [26–39] | 28 → 24 % | 68 → 59 % |
| schräge Wand | 60 → 61 % [54–67] | 16 → 16 % | 24 → 23 % |

Mit dem alten Wechselmodell der Fehlgriffe (`verschachtelt`) kommt der neue Stand auf 95/83/78/69/94 %, P(falsch | geschl.) 3/14/21/28/4 %. Der Unterschied zwischen den Modellen ist die größte offene Frage, und nur das Gerät kann sie beantworten. Ein Beispiel: Eine Schrankoberkante 2,2 m hoch und 0,6 m vor der Wand liegt aus 2 m Abstand nur ~2° (~23 px) unter der Deckenkante, also im Fangradius (46 px). Die „oben“-Regel nimmt dann die Deckenkante, sobald sie zu sehen ist (ab ~1,65 m Abstand). Ob Fehlgriffe als Folgen kommen, zeigt erst das Protokoll.

**Aus der Hand gedreht** (`--arm=0.3`: das Telefon kreist 0,3 m um den Standpunkt), mit Laser: Rechteck 67 → 70 %, P(falsch | geschl.) 26 → 19 %; L 53 → 52 % / 38 → 33 %; Nische 33 → 35 % / 62 → 53 %; schräge Wand 57 → 60 % / 31 → 24 %.

**Ohne Laser** (dpH):
- **Handmodell:** Rechteck 53 → **62 %**, falsch geschlossen 36 → 24 %; L 37 → 38 %, 43 → 34 %. H-Fehler im Mittel −8 → +7 cm. Die angegebene Unsicherheit ist rund 4-mal zu klein (|Fehler|/σ Median ~2,8 statt 0,67).
- **Grundmodell** (Wackeln ±5 cm): Rechteck 62 → 65 %, L 45 → 45 %, schräge Wand 56 → 52 %.
- **Wechselmodell, schräge Wand:** 90 → 81 %. Das ist der Preis der +5-cm-Verzerrung der maßstabsfreien Form, bewusst bezahlt, weil die eingefrorene Form im Handmodell kippen kann (9.1).

**Szenarien** (Laser, geschlossen & falsch):
- **verdeckte Wand:** Rechteck 87 → **0 %**, L 60 → **13 %**, Nische 41 → 24 %, Kamin 40 → 20 %, schräge Wand 72 → 50 %. Die schräge Wand bleibt offen: Eine fehlende Wand zwischen *nicht* parallelen Nachbarn erkennt der Gegenüber-Test nicht. Dafür bräuchte es eine Lücke in der Azimut-Abdeckung.
- **Schrankwand:** 45–46 % falsch geschlossen, praktisch unverändert. Ohne sichtbare Deckenkante ist die Schrankfront die Kante; die Form stimmt dann, liegt aber 0,6 m zu weit innen. Das kann nur das Bild (Deckenkante über dem Schrank) oder der Laser auflösen.
- **45 s Pause:** L 31 → 24 %, schräge Wand 20 → 16 %, Rechteck 21 → 22 %.

**Hartes Rauschen** (Drift 2,5 cm/√m, Sprünge bis 10 cm, mehr Fehlgriffe): Rechteck 41 → 44 %, schräge Wand 26 → 34 %; P(falsch | geschl.) bleibt bei 40–87 %.

**Drift-Kurve** (Rechteck, Topologie bei 0,5/1/2/3/4-facher Drift, neu): senkrechte Drift 71/67/55/41/33 %, waagerechte 65/67/67/63/54 %. Die Auswertung kippt bei *senkrechter* Drift. Sie modelliert nur Verschiebung und Gier (4 Freiheitsgrade minus Höhe), eine Höhenabweichung der Kamera wirkt wie ein falsches H. Kalibriert ist das Driftmodell nicht. Messen statt ableiten: `LOG.anchorPath` aus echten Sitzungen gibt die senkrechte Drift. Ist sie nicht klein, bekommt die Ausgleichung je Stützstelle eine Höhenverschiebung.

**App nachgespielt** (`--pipe=app`, je 60 Räume, Ende beim ersten „geschlossen“, Laser): Rechteck 63 → 67 %, P(falsch | geschl.) 30 → 28 %; schräge Wand 58 → 62 %, 28 → 29 %. Bis zum Abschluss braucht es nach Beginn der Rückkehr im Median 7–12 Erfassungen (2–4 s). Vor der Rückkehr schließt höchstens 1 von 60. Ohne Laser (appH) liegt das Rechteck bei 58 → 55 %, falsch geschlossen 30 → 37 %. Bei n = 60 ist ±12 Punkte Rauschen (Intervall [42–67]); die Richtung ist nicht gesichert. Beim Start in der Ecke (der Nutzer schwenkt weiter, bis es schließt) braucht es nach der Rückkehr 4–10 Erfassungen. Mit Laser sinken die falschen Abschlüsse beim Rechteck von 22 auf 18 %, beim L-Raum von 40 auf 32 %, bei der Nische von 37 auf 27 %; beim Kaminvorsprung steigen sie von 38 auf 40 % (n = 60, innerhalb des Rauschens).

### 9.5 Offen, nach Wirkung geordnet

1. **Protokolle vom Pixel 9 Pro:** Fehlgriffmodell (Folge oder Flackern), senkrechte Drift, Lagerauschen. Ohne sie bleiben die Absolutzahlen Modellannahmen.
2. **Scheinnischen aus Fehlgriff-Folgen:** Aus der Deckenkante allein ist eine Leiste hinter der Wand nicht von einer Nische ohne erfasste Seitenwände zu unterscheiden. Jetzt hilft der verlängerte Countdown mit Hinweis: noch einmal hinschwenken, die echte Kante deckt das Phantom ab. Besser wäre ein Prior aus der Bildhöhe (Abstand der Kante zur oberen Parallelen im Bild).
3. **Lagerauschen je Erfassung als Unbekannte** in der Ausgleichung: Das beseitigt die H-Verzerrung in beiden Richtungen und macht σ_H ehrlich.
4. **Fehlende Wand zwischen nicht parallelen Nachbarn:** über eine Lücke in der Azimut-Abdeckung des Rundgangs.

## 10. Nachtschicht 24./25.10.: Prüfstränge, Protokoll 4, Aufnahme

### 10.1 Was die fünf Prüfstränge ergaben (je Strang ein Prototyp und eine unabhängige Gegenprüfung)

| Strang | Ergebnis der Gegenprüfung | Übernommen |
|---|---|---|
| Overlay (Modell im AR-Bild) | Rahmenfehler des alten Overlays bestätigt (Median 112 → 14 px in Protokoll 3) | ja, vor der Nacht (ee3ffec) |
| Kantensuche im ganzen Bild (Stufe 2) | Zahlen stimmen, Verallgemeinerung nicht. Nachprüfung der Fadenkreuz-Kante bricht bei schmalem Deckenprofil und Schattenfuge ein. Einspeisen in die Auswertung bringt ≈ 0. | Nur der Teil „Stufe vor Linie“ in snapLine (K4-Gegenvorschlag). Die Verfolgung zunächst nur als Anzeige, sobald echte Bilder vorliegen. |
| Senkrechte Raumecken | Ring aus den Wandenden (S1) bestätigt. Peilungen (S2) wirken nur über vClose, Leistenregel (S3) und Kreuzprobe H (S6) unsicher, das Overlay der Lote (S5) war im falschen Rahmen. | S1 wird auf den aktuellen Stand gesetzt (eigener Workflow). S2–S6 erst protokollieren, dann mit Geräteprotokollen entscheiden. |
| Bodenkanten | Heutige Haltung sieht den Boden kaum (beide Kanten in einem Bild erst ab 1,65 m Abstand und 12–16° nach unten). Die Oberkanten-Regel nimmt am Boden zu 74 % die Leiste. Bodenerfassungen dürfen nicht in die Segmentierung. Ein Nutzen zeigt sich nur bei senkrechter Drift ≳ 5 cm. | Noch nichts. Erst messen (Ablage-Test für die senkrechte Drift, Leistenrate an echten Böden). |
| Literatur (RAPiD, Drummond/Cipolla, Comport, Vacchetti, Smith 2006, MonoSLAM) | Quellen stimmen, Live-Passung als Vorschlag widerlegt. Bodenkante und Senkrechte an Störern gerendert bis 43 % falsch. Ecke 0 bei offenem Ring bestätigt, im Overlay schon behoben. | Smith et al. 2006 als Vorbild für Stufe 2: je Linie eine zusammengefasste Messung, 2/3-Regel, Gatter aus der Kovarianz |

Gemeinsamer Befund aller Stränge: Sämtliche Bildzahlen stammen aus gerenderten Räumen. Jeder Strang verlangt echte Bilder vom Gerät, bevor eine Bildregel scharf geschaltet wird.

### 10.2 Protokoll 4 (Pixel 9 Pro, 23:43, Fassung 55aa0a6c)

- Die Haltung hat gewirkt: Kamera im Median 1,31 m statt 1,8 m, Δ ≈ 1,2 m.
- Bei 152,8 s springt der Bodenbezug um 0,54 m / 1,6°. jumpHold hält den alten Bezug, der Anker pausiert sofort, der neue Anker wandert in den ersten 3 s um 5–8 cm. Die Erfassungen der nächsten 25 s fallen fast alle als „hinter Wand“ heraus.
- 171–177 s: 6 s ohne Tracking, kurz davor ein leeres Kamerabild. Danach liegen die Wände 2,5–4,7° verdreht und bis 0,4 m versetzt. Eine einzige starre Transformation erklärt das nicht (Rest 0,136 m gegen 0,031 m vor dem Bruch). Ein nachträglicher Anschluss hätte also nicht geholfen.
- Die Brüche als lose Stützstellen in die Ausgleichung zu geben, ist nicht stabil. Je nach angenommenem σ springen Fläche (4,5–13,5 m²) und H (2,24–2,74 m). Der Bruch bei 177 s wird zu 14–18° „erklärt“. Darum bleiben die Brüche weiter aus der Auswertung.
- Hinweis-Flattern: 53 Hinweise, „Langsamer schwenken“ und „Gut so“ im Wechsel alle 0,2–1 s. Behoben: Warnung erst nach 0,4 s zu schnell, Rücknahme erst nach 1 s ruhig und ohne Lob.

### 10.3 Stufe vor Linie am Fadenkreuz

Unter parallelen Kandidaten gewinnen jetzt Stufen (Stufenmaß G.stepAlong ≥ 0,5, also Helligkeitssprung statt Linienprofil). Gibt es keine Stufe, bleibt alles wählbar.

Messaufbau des Prüfers (33 gezielte Bilder je Szene): Gardinenschiene richtig 4 → 24, falsch 29 → 8; Schattenfuge 33 → 32 richtig; alle anderen Szenen gleich. Rechenzeit unverändert (Verhältnis 0,99).

Selbsttest mit Schiene trennt alt und neu (0/4 → 4/4). Grenze: In einem sehr weißen Raum (Kontrast Wand/Decke 2–6 Stufen) gewinnt eine kräftige Schiene weiter, weil die echte Kante unter der Stärkeschwelle liegt.

### 10.4 Aufnahme: Zustand je Bild und Video (Idee von Tobias)

**Zustand je ausgewertetem Bild (immer):** Pose in local, Bodenbezug T, Flags (geschätzt, Anker verloren, Ersatz, Sprung-Halt, Pause, ohne Bezug, erfasst), Tempo und das Detektorergebnis am Fadenkreuz. Das schließt die Lücke aus Protokoll 4: Die 5-s-Stichproben reichten nicht, um die Bezugssprünge nachzuvollziehen.

**Video (Haken „Video mitschneiden“):**
- genau das Bild von captureEdge (RGBA 287×640, auf 288 gepolstert)
- H.264 per WebCodecs mit 10 Bildern/s und 1,5 Mbit/s, dazu je Bild die ARCore-Tiefe
- im OPFS in 10-s-Stücken
- „Aufnahme sichern“ packt ein TAR, ohne Kopie im Speicher

`raumskizze-aufnahme.mjs` spielt captureEdge auf den dekodierten Bildern nach und vergleicht Bild für Bild mit dem Gerät. Die Pose-Kette prüft es an obs.cam.

Ende-zu-Ende ohne Telefon:
- gerenderter Raum, Bezug gedreht und verschoben, libx264: 60/60 gleich, Median 0,03 px
- falsches Tpsi fällt nur in der Pose-Kette auf (0 → 900 mm), weil captureEdge aus der Pose nur „oben“ braucht
- Desktop-Chromium (WebCodecs H.264): 6-Graustufen-Kante und Mittelwerte bleiben exakt erhalten

Am Telefon ist das noch nicht geprüft. Die erste Aufnahme muss zeigen, dass Gerät und Nachspiel übereinstimmen. Erst dann taugt das Video als Prüfstand für die Bildregeln aus 10.1.

**Weg zur Trainingsdatenbank:** Jede Aufnahme braucht die Laser-Wahrheit des Raums (Raumaufmaß-Export) und ein Manifest (Format v1: Gerät, Intrinsik, Sitzung, Einwilligung). Gespeichert wird später auf dem eigenen Server, erst nach Freigabe. Bis dahin bleibt alles auf dem Telefon.

### 10.5 Ring aus den Wandenden (Stufe 1 der Senkrechten, ohne Bild)

Kreuzt der Ring aus der Zeitfolge oder fehlt eine Ecke, setzt `ringByEnds` die Reihenfolge der Wände aus ihren Enden zusammen. Das ist eine Suche mit Kosten für ungesehene Längen und Stufen, Gruppen dürfen ausgelassen werden. Ein Abschluss aus diesem Ring beendet die Sitzung nie von selbst. Der Nutzer bekommt einen Hinweis und schließt von Hand.

Gepaart gemessen (gleiche Seeds, node 24, n = 100):

| Szenario | Rechteck | L | Nische | Kamin | schräg |
|---|---|---|---|---|---|
| basis | 68 → 77 | 46 → 63 | 34 → 47 | 31 → 38 | 60 → 72 |
| eckstart | 67 → 78 | 46 → 63 | 29 → 46 | 35 → 44 | 58 → 74 |
| Wände außer der Reihe | 30 → 90 | 0 → 78 | 0 → 31 | 0 → 30 | 7 → 74 |

Werte: Topologie richtig in %.

- Selbst beendete Sitzungen ändern sich in allen 20 Klassen nicht (+0/−0).
- Mit `ringByEnds:false` rechnet alles bitgleich zu vorher (111 210 Aufrufe).
- Verluste: je −1 Lauf in basis Nische, eckstart Kamin und pause Nische, dazu verdeckt Nische 30 → 25 % (n = 40).
- Protokoll 4: 6 Ecken ohne Kreuzung statt 8 mit drei Kreuzungen.
- Protokoll 3 bleibt kreuzend, weil dort zwei Bezugsrahmen gemischt sind.

Ausgelassene Gruppen mit mindestens 3 Erfassungen werden genannt. Sie können echte Wände sein, in Protokoll 4 eine Gruppe mit 11 Erfassungen.

### 10.6 Messanleitung für die nächsten Sitzungen am Telefon

1. **Mit Video:** Haken „Video mitschneiden“ setzen, normaler Rundgang an der Deckenkante, danach „Aufnahme sichern“. Die erste Aufnahme klärt, ob das Nachspiel am Mac mit dem Gerät übereinstimmt (`node raumskizze-aufnahme.mjs <tar>`).
2. **Bodendurchgang (Prüfstrang Boden):**
   - erst nach dem Deckenrundgang;
   - aus 2–4 m Abstand, Telefon deutlich nach unten (mehr als 10°);
   - Fadenkreuz auf die Fuge zwischen Boden und Sockelleiste;
   - langsam die Wand entlang, Möbelfronten auslassen.

   Am Video wird ausgezählt, wie oft die Kontaktlinie kommt statt Leistenoberkante oder Fuge (gerendert: 83 / 13 / 4 %).
3. **Ablage-Test für die senkrechte Drift:** Das Telefon zu Beginn und am Ende je mindestens 10 s an dieselbe feste Stelle legen, aufrecht angelehnt, Kamera frei. Die Differenz der beiden Ruhephasen im Zustand je Bild (Pose gegen Bezug) ist die senkrechte Drift der Sitzung. Lohnt der Boden in der Auswertung? Das hängt genau davon ab: bei ≳ 5 cm ja, bei 2–3 cm nicht.
4. **Wahrheit:** Den Raum danach in Raumaufmaß mit dem Laser aufnehmen und den Export zur Aufnahme legen. Erst damit werden Aufnahmen zu Trainings- und Prüfdaten.

### 10.7 Stufe 2: jede Modellwand live im Bild gemessen (nur Anzeige)

`G.trackModelEdges` sucht jede Modellwand quer zur Vorhersage im 288×640-Bild:
- Grundlage ist dasselbe liveModel wie für die Modelllinie.
- Gesucht werden 1D-Stufen, dazu eine Hough-Suche über Versatz und Neigung.
- Verworfen werden Linienprofile und Leistenoberkanten.

Das Vorbild ist RAPiD mit vertauschten Rollen: Die Pose kommt von ARCore, gesucht sind die Wände (Harris & Stennett 1990; Drummond & Cipolla 1999; je Linie eine zusammengefasste Messung nach Smith et al. 2006).

`G.trackJudge` liefert passt, weicht ab, schwach, Leiste oder keine. „Passt“ heißt höchstens 3 cm oder 2 px bei z ≥ 15. „Weicht ab“ gilt nur, wenn es eindeutig ist: keine sichere Linie darüber und keine andere tragende Gerade auf der Vorhersage.

Angezeigt wird je Wand eine kurze grüne oder orange Marke, mit Hysterese 3 von 4. Die Auswertung bleibt unberührt (Schätzer-Hash, Protokolle, Messaufbau gleich). Die Rechenzeit liegt bei 0,04–0,13 × captureEdge.

Die Gegenprüfung fand ein Orange auf einer Gardinenschiene bei richtigem Modell. Die Korrektur senkt das von 9 auf 0, insgesamt fällt „orange auf falscher Kante“ von 131 auf 89.

Grenzen (synthetisch):
- Grün bestätigt auch eine Regalfront oder Leiste, wenn das Modell dort liegt.
- Der Anteil Orange hängt am Posenrauschen: 18/76 bei 1 cm/0,2°, 0 bei 3 mm/0,1°. `tolM` am Gerät mit `LOG.trk` abstimmen.

**Farbsprache:** In der Vorgabe tragen Grün, Gelb und Orange je zwei Bedeutungen. `?farben=klar` färbt nur Urteile: grün passt, orange weicht ab, rot fehlt. Das Modell ist weiß und gestrichelt nach Unsicherheit, die Live-Kante türkis. Vergleichsbild: `2026-10-25-farben-vergleich.png` (oben passt, unten weicht ab; links Vorgabe, rechts klar). Die Entscheidung fällt am Gerät.

**Ergebnisansicht:** Fläche, Ecken und Höhe stehen jetzt zuerst, danach nur die Hinweise, Technik aufklappbar. Die Wandtabelle trägt die Eckbuchstaben des Plans, alle Zahlen haben Dezimalkomma.

### 10.8 Prüfstand für Aufnahmen (offline)

`node raumskizze-aufnahme.mjs <aufnahme.tar> --bericht=<ordner>` spielt die Sitzung am Mac nach:
- den Schätzer wie der Worker (Pool, Takt aus den Laufzeiten);
- je Bild das Live-Modell mit der Pose des Bildes;
- Stufe 2, `captureEdge` und den Senkrechten-Finder (Prototyp, nur im Werkzeug) auf den dekodierten Bildern.

Er vergleicht mit dem, was das Gerät fand, und schreibt alles Unstimmige unter „Auffällig“: Pose-Kette, Bildzahl, Stromgröße, Luma-Pegel, Zuordnung Bild ↔ Zustand und fremdes Protokoll.

Synthetisch belegt mit 5-min-Aufnahmen, die der App-Code selbst im Harness erzeugt:
- Verlustfrei kodiert ist das Nachspiel exakt (`captureEdge` 480/480, Stufe 2 218/218).
- Mit H.264 1,5 Mbit/s stimmen Stufe 2 zu 95–98 % und `captureEdge` zu 87–94 % mit dem Gerät überein, im Störer-Raum nur zu etwa 70–89 %.
- Ob die Videoqualität für Detektor-Tests reicht, zeigt die erste echte Aufnahme. Sonst Bitrate erhöhen (`?vbr=`) oder verlustfreie Luma-Bilder bei Erfassungen mitschreiben.

Der Senkrechten-Finder liegt im Störer-Raum bei 195 von 219 „ecke“-Urteilen falsch. Er bleibt vorerst im Werkzeug.

### 10.9 Anker-Netz: Bezugssprünge messen statt raten

Offene Frage aus den Protokollen 3 und 4: Ist ein Sprung des Bodenankers eine Kartenkorrektur von ARCore oder ein Ausreißer dieses einen Ankers?
- Bei einer Kartenkorrektur bewegen sich alle Anker gemeinsam gegenüber local. Der Versatz ist dann gemessen, und die Erfassungen davor ließen sich exakt umrechnen.
- Bei einem Ausreißer muss man halten (jumpHold).

Ein Anschluss über Wände drehte im Messaufbau 41 von 53 Mal falsch. Messen ist darum besser als Raten.

Das Netz setzt alle 12 s einen Messanker unter der Kamera, höchstens 8. Es protokolliert die Lagen aller Anker 2-mal je Sekunde und bei jedem Anlass. Daraus ordnet es ein: gemeinsam, nur Bezugsanker, nur Netz, gemischt, alle pausiert oder wieder gemeinsam, mit Nachprüfung nach 1 s.

Bezug, Erfassung und Auswertung bleiben unverändert. Das zeigt ein A/B-Vergleich gegen den Stand davor, Bild für Bild in 28 Szenarien. Auswertung mit `node raumskizze-anker.mjs <tar|protokoll.json>`. Erst wenn echte Sitzungen den Fall klären, ändert sich die Steuerung, also folgen oder halten und Umrechnen mit dem gemessenen Versatz.

### 10.10 Senkrechten-Finder (nur im Werkzeug)

Der Prototyp lag im Störer-Raum bei 71 % Fehlpeilungen. Die Überarbeitung hat vier Teile:
- Deckenprobe je Grundrissrichtung.
- Schwelle aus der Nullverteilung.
- „ecke“ nur mit zwei Seiten und konkavem Keil.
- Stütze auf gleitendem Mittel.

Gemessen gepaart an der Renderer-Wahrheit, mit getrennten Übungs- und Prüfmengen und eigenen Stressräumen der Gegenprüfung (Kamin, Nische, Erker, Hängeschränke, Altbau, Seitenlicht):

| Menge | Fehlpeilungen |
|---|---|
| Prüfmenge | 59 → 12 % |
| Stressräume | 65 → 19 % und 70 → 32 % (gepoolt 26 %) |
| 5-min-Aufnahme | 71 → 20 % |

Die Treffer an konkaven Ecken verallgemeinern nicht (gepoolt −4 Prozentpunkte). Ecken an Wandstücken ≤ 0,5 m werden nie „ecke“, Außenecken absichtlich nie. Für eine spätere Eckenstütze zählen wenige Fehlpeilungen mehr, und sie muss einseitige Peilungen über mehrere Bilder zulassen. Ans Gerät erst nach echten Aufnahmen.

### 10.11 Gesamtreview der Nacht

Jeder Baustein der Nacht war einzeln gegengeprüft, ihr Zusammenspiel nicht. Ein Review in drei Richtungen (Bildschleife, Daten und Speicher, Bedienung) fand 22 Fehler. Jeder wurde unabhängig nachgestellt, alle waren echt.

Die Korrekturen sind zu einem Patch zusammengeführt (6d9afb8) und doppelt gegengeprüft, auf Regression und auf Behebung je Fund. Die zweite Prüfung fand dabei eine neue, blockierende Regression: Ein einmal geworfenes recStop sperrte jeden Neustart. Sie ist behoben.

Die wichtigsten Korrekturen:
- vorläufiges Manifest je 10-s-Stück, damit Absturz und Neuladen auswertbar bleiben;
- „Aufnahme sichern“ ist an den eigenen Durchlauf gebunden;
- Zustandszeilen werden auch ohne Bezug geschrieben;
- der Sprung-Hinweis wird nicht mehr überschrieben;
- keine Tempo-Hinweise in der Pause;
- der Abschluss aus den Wandenden ist im Balken sichtbar;
- Textreste bereinigt.

Der Schätzer ist unverändert, der Messaufbau bitgleich. Ende-zu-Ende geprüft mit einer synthetischen 2-Runden-Aufnahme aus dem App-Code: Stufe 2 stimmt zu 95 % mit dem Gerät überein, die Pose-Kette ist exakt, nichts auffällig.

### 10.12 Vormittag 25.10.: Stand-Marker, volle Auflösung, alle Kanten live (Stand 3)

Anlass war Tobias' Rückmeldung zur Aufnahme 5. Er wollte nicht nur die Kante am Fadenkreuz sehen, sondern alle erkannten Kanten auf einmal, auch die Senkrechten zwischen Boden und Decke. Dazu „lieber weniger fps, dafür bessere Erkennung“.

**Stand-Marker.** Die Seite zeigt „Stand N · Datum, Uhrzeit“ unter dem Titel und in der AR-Statuszeile. Derselbe Wert steht im Protokoll (`LOG.stand`) und im Aufnahme-Manifest. `scripts/raumskizze-deploy.sh` zählt N hoch, prüft vorher den Selbsttest, committet, lädt per FTPS hoch und vergleicht den Hash dreifach (lokal, FTP-Rücklesen, HTTPS).
- Stand 1: 10:42
- Stand 2: 11:45, mit ?ds bis 1920 und Kopfzeile unter der Statusleiste
- Stand 3: 12:35, alle Kanten live

**Volle Auflösung.** Chrome liefert in der AR-Sitzung höchstens 861×1920. Das ist der ARCore-Kamerastrom (1920×1080), beschnitten aufs Bildschirmformat; 4K ist in WebXR nicht zugänglich. Mit `?ds=1920` arbeitet die Kantenerfassung am Fadenkreuz auf dem vollen Bild.
- Die Fenster der Stufen-Regel wachsen mit (`sc = kurze Seite / 288`). Ohne das brach die Gardinenschiene bei 3× Auflösung in 3 von 4 Fällen.
- Die Vorgabe bleibt 640, bis die Rechenzeit auf dem Pixel gemessen ist.

**Alle Kanten live (Stand 3).**
- *Stufe 2:* Jede gemessene Wand-Decke-Kante wird als Band unter der Modelllinie gezeichnet, grün wenn sie passt, orange wenn sie abweicht.
- *Senkrechte:* `senkFrame` lässt den Finder aus 10.10 auf jedem 2. Bild laufen. `G.senkLive` zeigt eine Senkrechte erst, wenn sie in 3 von 5 Läufen an derselben Grundriss-Peilung auftaucht, und nur, wenn sie bis zur Decke reicht (mindestens 0,75 der Raumhöhe des Modells).
- *Anzeige der Senkrechten:* grün an einer Modellecke, sonst hell gepunktet. Zurückgesetzt wird bei Ortungslücken und nach mehr als 1 s ohne Lauf.
- *Schalter:* `?senk=0` schaltet ab. `?senkdecke=0` zeigt zum Vergleich auch Kanten, die unter der Decke enden.
- *Verkleinern:* Bei `?ds` > 640 rechnet der Finder auf dem verkleinerten Bild (`G.lumaKlein`, Kastenmittel mit ganzem Faktor, 861×1920 → 287×640). Seine Pixelmaße sind auf 640 abgestimmt, und die Rechenzeit bleibt so wie bei 640. Die volle Auflösung hilft also dem Fadenkreuz und Stufe 2, den Senkrechten noch nicht.

**Warum der Deckenfilter.** Ohne ihn lagen auf Aufnahme 5 rund 95 % der gezeigten Senkrechten auf Möbeln, und sie wurden von Boden bis Decke gezeichnet. Das war irreführend.

| Messung | ohne Filter | mit Filter |
|---|---|---|
| Aufnahme 5: gezeigte Senkrechte je Bild | 2,99 | 0,10 |

Was mit Filter bleibt, ist ehrlich, aber spärlich:
- In 92 % der Bilder steht keine Senkrechte.
- Von den gezeigten sind 87 % hell, also ohne Modellecke.
- Gegen den Endstand sind 9 % (±1,5°) bzw. 36 % (±3°) der grünen an einer echten Ecke.
- Finder und Filter brauchen am Mac im Median 3,5 ms je Lauf.

Smoke-Test der ganzen Bildschleife, DOM-frei mit gerenderten Bildern, alle Läufe ohne Ausnahme:

| Szene | gezeigt je Bild | grün | davon an wahrer Ecke | hell | davon an wahrer Ecke |
|---|---|---|---|---|---|
| Nische | 0,45 | 304 | 304 | 84 | 84 |
| Nische, Wand 10 cm versetzt | 0,58 | 570 | 570 | 84 | 84 |
| Wohnraum | 0,28 | 18 | 0 | 216 | 138 |

- Im Wohnraum ist Grün an einer Modellecke, die keine echte Ecke ist; das Modell ist dort noch offen. Grün heißt also „liegt an einer Ecke des aktuellen Modells“, nicht „echte Ecke“.
- In der versetzten Szene erkennt Stufe 2 die Abweichung: 288 Bilder „abweichend“, alle Marken ≤ 1 px neben der wahren Kante.

Gegenprüfungen:
- Messaufbau bitgleich bis auf die Zeitspalte.
- Selbsttest grün, mit Check der Abbildung durch `lumaKlein`.
- Selbsttest bei 3× Renderauflösung grün bis auf zwei Aufbau-Artefakte der Kopie. Die gerenderte Raumecke wird dort über f=3 gefunden (Anteil Deckenhöhe 1,00).

**Offen, nach Wirkung:**
1. Rechenzeit von Finder und Stufe 2 bei `?ds=1920` auf dem Pixel messen (`LOG.timings`). Danach entscheiden, ob 1920 die Vorgabe wird.
2. Finder für die volle Auflösung abstimmen, statt zu verkleinern.
3. ARCore-Vertikalebenen (bis 9 erkannt, ungenutzt) als Wandmessung.
4. Fliesenspiegel an Wand und Boden: Fluchtpunkte und Ebenen-Homographie aus dem Fugengitter, als Offline-Prototyp an einer Küchenaufnahme.
5. Erfassungen an den nächsten Anker binden, weil die ARCore-Korrekturen örtlich sind.
6. Luma-Bereich im Werkzeug angleichen (Video gegen Gerät, Steigung 1,16).

### 10.13 Aufnahme 6 (Pixel 9 Pro, 15:17, Stand 3)

Die Sitzung lief ohne Parameter, also mit `ds=640`. Punkt 1 aus 10.12 (Rechenzeit bei 1920) ist damit **nicht** beantwortet.

Die Aufnahme im Überblick:
- Raum im Ausbau: graue Putzwände, Kabel hängen von der Decke.
- 118 s, 153 Erfassungen.
- 5 Wände, nicht geschlossen; von Hand trotzdem abgeschlossen (22,5 m²).
- Laser-Höhe 2416 mm.

**Rechenzeit am Gerät bei 640.** Das ist die erste Messung auf dem Pixel und die Messlatte für 1920.

| Stufe (`LOG.timings`) | Median | 90 % | max |
|---|---|---|---|
| Verkleinern (`small`) | 4,3 ms | 6,3 ms | 15,5 ms |
| Kante am Fadenkreuz (`snap`) | 13,8 ms | 19,3 ms | 59,4 ms |
| Stufe 2 (`track`) | 1,5 ms | 2,8 ms | 12,3 ms |
| Senkrechte, Finder und Filter (`senk`) | 10,1 ms | 14,8 ms | 53,9 ms |
| Schätzer im Worker (`solve`) | 34 ms | 69 ms | 113 ms |

- Ausgewertet wird jedes 3. XR-Bild (alle 100 ms), und zwar synchron in `onFrame`. Bei 30 Bildern/s hat dieses Bild 33 ms.
- Im Median braucht es zusammen etwa 25 ms (Senkrechte nur jedes 2. Mal). Die 90-%-Werte summieren sich aber schon auf rund 40 ms.
- Direkt vergleichbare Kennzahl für 1920 ist die gelieferte Bildrate: (3289 ok + 241 verloren) / 118 s = 29,9 Bilder/s.
- Der Finder ist auf dem Pixel 2,8× langsamer als am Mac (3,6 ms).

**Senkrechte live.**
- 0,73 gezeigt je Bild, davon 94 % hell; Flackern 0,86 Wechsel/s.
- Aufnahme 5 hatte 0,10 je Bild, war aber ein anderer Raum ohne hängende Kabel. Ein Rückschritt des Deckenfilters lässt sich daraus nicht ablesen.

Was unter den hellen Senkrechten liegt: 24 zufällig gezogene Bilder mit hellen Senkrechten, 44 Linien, von Hand im Prüfstand eingeordnet.

| Was darunter liegt | Linien |
|---|---|
| hängendes Kabel | 16 Linien (36 %) an 2–3 Kabeln |
| echte Raumecke oder Pfeilerkante, im Live-Modell fehlend oder versetzt | 15 Linien (34 %) an 4–5 Ecken und 1 Pfeilerkante |
| im 288×640-Bild keine Kante zu sehen, meist neben einem Kabel oder einer Ecke | 13 Linien (30 %) |

Die Bilder liegen oft dicht beieinander und zeigen dieselben Gegenstände. Die Anteile zählen Linien, nicht Gegenstände, und sind darum grob.

Folgerungen:
- *Hell heißt hier nicht Möbel.* Ein Drittel der Linien liegt an echten Ecken, die dem offenen Modell fehlen (5 Wände, 2 Ecken ergänzt) oder einige Pixel neben der Modellecke liegen. Die Kennzahl „hell an einer Ecke des Endstands“ (15 % / 32 %) ist nur eine Untergrenze, weil der Endstand selbst offen ist.
- *Kabel sind eine eigene Fehlerklasse.* Ein Kabel ist eine dünne dunkle Linie mit zwei Gegenkanten dicht nebeneinander, leicht gewellt. Es reicht bis zur Decke und kommt so durch den Deckenfilter.
- *Linien neben dem Kabel sind wahrscheinlich das Kabel selbst.* `G.senkLive` setzt jede Senkrechte auf die erste Modellwand entlang des Strahls. Ein Kabel vor der Wand landet so an der falschen Stelle und erscheint aus einem anderen Blickwinkel versetzt. Ein Teil der Linien ohne sichtbare Kante gehört also vermutlich auch zu den Kabeln.
- *Für eine Kabel-Regel reicht 10.3 nicht.* Das Stufenmaß dort (`G.stepAlong`) zieht Stufen nur vor; gibt es keine Stufe, bleibt eine Linie wählbar. Für Senkrechte müsste ein Linienprofil verworfen werden.
- *Grün ohne Ecke:* Zweimal stand Grün auf glatter Wand oder neben der echten Ecke. Das Modell hat dort eine Ecke, die Wand nicht.

**Bezugssprünge.**
- Zwei große Sprünge: 75,1 s mit 98 cm / 17,5° und 121,9 s mit 96 cm / 6,9°.
- Das Netz konnte beide nicht einordnen (Messanker zu jung).
- Beide kamen 2,8 s bzw. 2,5 s nach dem Setzen eines Ersatzankers, also im Einschwing-Fenster (3 s). Die App ist ihnen gefolgt (nur Protokoll).
- *Das Folgen war richtig.* Es war eine Relokalisierung von ARCore: Die Kamera drehte sich in local im selben Bild um −17,5° bzw. +8,3°. Ihre Blickrichtung im Bezug blieb stetig (76,1° → 76,0°; bei 122 s 1,5° in 0,1 s wie davor). Die Halte-Regel ab 3 s hätte hier einen Gierfehler von 17,5° eingebaut.
- Übrig bleibt ein Lagesprung der Kamera im Bezug: 38,7 cm in 0,1 s bei 75,1 s (sonst etwa 5 cm), 10,2 cm bei 121,9 s. Die Korrektur von ARCore ist dort also nicht starr.
- Den Lagesprung bei 75,1 s hätte der Pose-Sprung-Detektor gefunden (> 15 cm und > 1,5 m/s). Er prüft aber nach jedem Ankersprung nicht, weil der Zweig `S.prevCam` zurücksetzt.
- *Fix gemessen und verworfen.* Der Detektor hätte die 4 Erfassungen der 2 s davor verworfen. Ohne sie rechnet der Schätzer 17 statt 6 Ecken und 14,8 statt 22,9 m². Das ist eher schlechter, vor allem aber kippt das Ergebnis schon, wenn 4 von 153 Erfassungen fehlen. Darum nicht in Stand 4.
- Kriterium für später: Nicht das Alter des Ankers trennt Folgen von Halten, sondern ob die Kamera im neuen Bezug stetig bleibt (Gier und Lage). Hier war Folgen richtig, in Protokoll 3 Halten (dort sprang der Anker, die Kamera nicht).
- Den Abstand in Stufe 2 erklären sie nicht. Der Abstand Kante–Modell (sichere Stichproben am Gerät) liegt in den drei Abschnitten bei 9,2 / 9,5 / 7,9 cm (Median, n = 8 / 6 / 20), also schon vor dem ersten Sprung so hoch. Bei n = 8 ist das ein Hinweis, kein Beleg.
- Die Kamerahöhe über dem Bezug läuft über die Sprünge fast stetig weiter. Die Stufen sind klein: höchstens 5 cm bei 75 s, 2,4 cm beim Höhensprung des Bezugs bei 103 s (Ty −1,283 → −1,387), keine bei 122 s.
- Stufe 2 insgesamt: Abstand Median 8,5 cm, 90 % 23,6 cm, bei tolM = 3 cm. Daher kaum „passt“: 11 von 607 Wandurteilen im Nachspiel, 2 von 384 Bildern am Gerät.

**Höhe.**
- Laser 2,416 m, Parallaxe 2,288 ± 0,016 m, Unterschied 12,8 cm.
- Das liegt unter der Schwelle der Kreuzprobe (15 cm), darum kam in der App kein Hinweis.

Tobias hat bestätigt, dass die 2416 mm in genau diesem Raum gemessen sind. Der Fehler liegt also auf der Seite der Kamera. Zwei Erklärungen sind möglich, die Daten trennen sie noch nicht:
- Die Parallaxe ist verzerrt. Der Messaufbau zeigt ohne Laser 90 % der Fehler unter 12–15 cm; 12,8 cm liegt am Rand. Mit Laser bleibt der Schätzer bei 2,377 m, 3,9 cm neben einer Vorgabe von 5 mm. Die Erfassungen widersprechen der Höhe also deutlich.
- Der Bodenbezug sitzt falsch: Die erste ARCore-Bodenebene lag 14 cm unter dem Anker (38,0 s: −1,395 gegen −1,254). Bei 44–50 s stimmen Ebene und Anker aber überein (−1,26); danach meldet ARCore kaum noch eine Bodenebene. Weil die Bezugsstufen klein sind (siehe oben), müsste ein solcher Versatz von Anfang an bestehen.

**Gerät gegen Nachspiel.**
- Stufe-2-Urteil gleich in 94 % (304 Stichproben im selben Bild).
- Kante am Fadenkreuz gleich in 65 % aller Bilder, 77 % der sicheren.
- Luma-Steigung wieder 1,17 (Punkt 6).

**Offen, nach Wirkung (ersetzt die Liste in 10.12):**
1. Sitzung mit `?ds=1920` aufnehmen (`https://raumaufmass.irazari-te.ch/raumskizze-probe.html?ds=1920`). Messlatte sind die Tabelle oben und die 29,9 Bilder/s.
2. Kabel-Regel für Senkrechte (ein Linienprofil mit zwei Gegenkanten verwerfen), am Prüfstand dieser Aufnahme messen.
3. Prüfen, ob helle Senkrechte an echten Ecken dem Schätzer als Eckenhinweis dienen können (heute nur Anzeige).
4. Finder für die volle Auflösung abstimmen, statt zu verkleinern.
5. ARCore-Vertikalebenen als Wandmessung.
6. Fliesenspiegel als Offline-Prototyp an einer Küchenaufnahme.
7. Erfassungen an den nächsten Anker binden. Diese Aufnahme hat einen Lagesprung von 39 cm nach einer Relokalisierung, die die App sonst richtig übernommen hat.
8. Luma-Bereich im Werkzeug angleichen.

### 10.14 Stand 4 (25.10., 16:21)

**Inhalt:** Helle Senkrechte werden standardmäßig nicht mehr gezeichnet, nur noch grüne an einer Modellecke. Mit `?senkhell=1` erscheinen sie wieder.
- Gerechnet wird unverändert: `senkFrame`, `G.senkLive` und `LOG.timings.senk` laufen wie in Stand 3. So bleiben die Zeiten am Pixel und das Nachspiel mit `--live` vergleichbar mit Aufnahme 6.
- Auf Aufnahme 6 heißt das: statt 0,73 Senkrechten je Bild noch etwa 0,04 (nur die 6 % grünen).
- Der Hilfetext auf der Startseite nennt nur noch die grünen.

**Nicht enthalten:** der Sprung-Fix. Der zuerst geplante Fix (große Sprünge im Einschwing-Fenster halten statt folgen) beruhte auf einem Vorzeichenfehler in der Auswertung. Er hätte bei 75 s 17,5° Gierfehler eingebaut. Der engere Fix (Pose-Sprung-Prüfung nach einem übernommenen Sprung) ist gemessen und verworfen, siehe 10.13.

**Prüfungen:**
- Selbsttest grün.
- Nachspiel von Aufnahme 6 unverändert.
- Seite lokal ohne Konsolenfehler.
- Live per Deploy-Skript: Hash dreifach gleich (sha256 0527ab90), Stand 4 auf der Seite.

**Neuer Befund aus der Prüfung:** Das Ergebnis des Schätzers kippt bei kleinen Änderungen am Pool. Fehlen in Aufnahme 6 nur 4 von 153 Erfassungen, werden aus 6 Ecken (22,9 m²) 17 Ecken (14,8 m²). Das gehört nach oben auf die Liste: Eine Skizze, die an 4 Erfassungen hängt, ist nicht verlässlich.

### 10.15 Warum der Schätzer kippt (Aufnahme 6, 4 Erfassungen weniger)

**Ablauf in `solveSweep`:** Zuerst entsteht der Ring in Zeitfolge. Ist er schlecht (Wände kreuzen sich, eine Wand fehlt, oder die Winkel summieren sich nicht auf ±360° ±45°), sucht `ringOrder` die Reihenfolge aus den Wandenden. Ist auch deren Ring schlecht, bleibt der Zeitring.

**Was in Aufnahme 6 passiert:**
- Der Zeitring ist in beiden Fällen schlecht: 15 bzw. 17 Ecken, mehrere Kreuzungen.
- Mit allen Erfassungen findet `ringOrder` eine Folge aus 5 Wänden (Kosten 32,595, 8 Gruppen ausgelassen). Ihr Ring ist gut: 6 Ecken, 360°.
- Ohne die 4 Erfassungen gewinnt eine Folge aus 10 Wänden (Kosten 32,588) gegen die 5er-Folge (jetzt 33,370). Ihr Ring läuft zweimal herum (720°) und kreuzt sich. Er wird verworfen, und zurück kommt der ebenfalls kreuzende Zeitring mit 17 Ecken.
- Dass beide Male rund 32,59 herauskommt, ist Zufall, kein Gleichstand. Mit allen Erfassungen ist die 10er-Folge gar nicht zulässig.

**Das gekippte Tor:** Der Übergang Gruppe 3 → 5 verbindet zwei parallele Wände gleicher Richtung (Versprung). Erlaubt ist er nur, solange sich ihre gesehenen Stücke um höchstens `inTol` = 1,0 m überlappen.
- Mit allen Erfassungen überlappen sie sich um 1,38 m, der Übergang ist gesperrt.
- Die 4 Erfassungen lagen am Anfang von Gruppe 5. Ohne sie schrumpft der Überlapp auf 0,59 m, der Übergang wird zulässig (Kosten 1,72), und damit die ganze 10er-Folge.
- Dazu kommt: Die Segmentierung hängt am ganzen Pool. `nSeg` geht von 30 auf 29, und bei 150 s entsteht eine neue Gruppe mit 3 Erfassungen, die die 5er-Folge um 1,62 verteuert. Vermutlich wirken `beta` (hängt von der Zahl der Punkte ab) und `s0`; nicht weiter verfolgt.

**Drei Ursachen:**
1. `ringOrder` sucht nur nach Kosten. Ob der Ring geometrisch geht (einfach, einmal herum), prüft erst `ringByEnds` danach. Gewinnt eine ungültige Folge, wird die nächstbeste gültige nicht mehr versucht.
2. Harte Tore (`inTol`, `maxGap`) schalten Übergänge sprunghaft zu oder ab. Kleine Änderungen am Pool kippen so die ganze Reihenfolge.
3. Scheitern beide Ringe, gibt `solveSweep` den bekannt schlechten Zeitring als Skizze zurück, mit Kreuzungen.

**Literatur:** Cabral & Furukawa (2014) erzwingen, dass der Grundriss genau einmal um den freien Raum läuft (Start-/Endlinie, kürzester Weg). Floor-SP (1908.06702) setzt die Raumtopologie als einfache Schleife an. MonteFloor (2103.11161) verlangt nicht kreuzende Polygone und nennt kreuzende Grundrisse als Fehlerbild von Floor-SP.

**Prototyp (nur Kopie der Seite, nicht im Repo):** `ringOrder` übernimmt einen Zyklus nur noch dann als besten, wenn sein Ring nach `ringOf` gut ist (kein „kreuzt“, kein „fehlt“, Drehsumme ±360° ±45°). Die Schranke der Suche bleibt gültig, `bad()` danach bleibt als Absicherung. Abschaltbar mit der Option `ringValid:false`.

| Prüfung | heute | Prototyp |
|---|---|---|
| Aufnahme 6, alle Erfassungen | 6 Ecken, 22,9 m² | gleich |
| Aufnahme 6, ohne 73,1–75,1 s | 17 Ecken, kreuzend | 6 Ecken, 22,9 m² |
| Aufnahme 6, je eine Erfassung weglassen (153×) | 149 gleich, 1× 16 Ecken (Zeitring), 3× 4 Ecken | 150 gleich, 3× 4 Ecken |
| Aufnahme 5, je eine weglassen (308×, ohne Laser, Vorwissen 2,5 ± 0,3 m) | Basis 14 Ecken (Zeitring), 255 gleich (83 %) | Basis 10 Ecken (Wandenden), 264 gleich (86 %), alle Varianten aus den Wandenden |
| Protokoll 3 (ohne Laser) | 19 Ecken, 40,5 m², kreuzend | 10 Ecken, 29,3 m², nicht kreuzend, 6 Gruppen außerhalb |
| Protokolle 1, 2, 4 und Aufnahme 5 im Protokoll-Werkzeug (Vorwissen 2,55 ± 0,35 m) | – | unverändert |
| Messaufbau: 200 Räume × 5 Klassen × 6 Szenarien, Seed 7 | – | mit Laser (dp) 1 von 6 000 Läufen geändert (Schrankwand, einmal weniger falsch geschlossen); ohne Laser (dpH) alle Tabellenwerte gleich bis auf die Rechenzeit |
| Suchbudget (200 000 Knoten) und Rechenzeit je `solveSweep`, alle Weglass-Läufe von Aufnahme 6 und 5 | nie erschöpft; Median 10,6 / 26,6 ms | nie erschöpft; Median 10,4 / 25,7 ms |

Der Messaufbau erzeugt diesen Fehlerfall praktisch nie. Er zeigt also nur, dass nichts schlechter wird, nicht dass der Fix hilft. Die Wirkung zeigt sich nur an echten Aufnahmen, und dort gibt es keine Wahrheit.
- Belegt ist: In allen gemessenen Fällen kam mit dem Prototyp ein Ring aus den Wandenden heraus, keiner kreuzte sich. Ursache 3 bleibt aber bestehen: Findet `ringOrder` keinen gültigen Zyklus oder ist der Ring nach der Neuausgleichung schlecht, kommt weiter der kreuzende Zeitring zurück.
- Richtig sind die Ergebnisse damit nicht automatisch; für Protokoll 3 und Aufnahme 5 fehlt die Wahrheit.
- Der Prototyp behebt eine von drei Ursachen. Beim Weglassen einzelner Erfassungen kippt Aufnahme 6 weiter in 3 von 153 Fällen, Aufnahme 5 in 44 von 308 (14 %). Diese übrige Instabilität kommt aus den harten Toren und der Segmentierung.
- Der Selbsttest lief mit der Kopie nicht; für Stand 5 ist er Pflicht.

**Offen:**
- Prototyp als Stand 5 übernehmen, Selbsttest um einen Fall mit Doppelschleife ergänzen.
- Den Messaufbau um Szenarien mit Rückwegen und wiederholten Wänden erweitern. Aus solchen Schwenks entstehen die vielen Gruppen und die Doppelschleife.
- Harte Tore durch stetige Kosten ersetzen (Ursache 2).
- Ursache 3: Statt eines kreuzenden Zeitrings „kein gültiger Umriss“ melden.

### 10.16 Ansichten im AR-Modus (gebaut, noch nicht live)

Knopf „Ansicht“ in der Wandphase. Er schaltet durch: Kamera, Luma (das verkleinerte Graustufenbild, das `captureEdge` und die Senkrechten bekommen, unverschmiert in echter Auflösung) und Gradient (Sobel-Betrag auf dem ganzen Bild, Wurzel-Skala). Die Overlay-Linien bleiben darüber. Jeder Wechsel steht als Ereignis `ansicht` im Protokoll. Gerechnet wird nur bei aktiver Ansicht und neuem Bild.

### 10.17 Aufnahme 7: Wohnküche mit Laser-Wahrheit (Stand 5, 17:00)

**Wahrheit:** Raumaufmaß „Hesterkamp Wohnküche“, 81 Lasermaße, σ̂ 5,6 mm. Außenring mit 14 Ecken, 65,9 m², 9,35 × 7,86 m, dazu ein Pfeiler (0,15 m²) und ein Wandvorsprung (0,40 m²). Keine Raumhöhe in der Datei. Abgelegt als `wahrheit-hesterkamp-wohnkueche-2026-10-25.json` (nicht eingecheckt).

**Sitzung:**
- Wieder `ds=640`, keine Laser-Höhe, Ansichten nicht benutzt.
- 215 s, 283 Erfassungen. Tracking 3-mal weg (bis 7,8 s), 2 Bezugssprünge, 10 Brüche.
- Rechenzeiten wie in Aufnahme 6: Kante 13,9 ms, Senkrechte 11,3 ms, Schätzer 53 ms (Median).

**Ergebnis ohne Laser:** 7 Ecken, 42,7 m², H 2,44 m.

**Raumhöhe laut Laser: 2,416 m** (Tobias). Das ist dieselbe Wohnküche wie in Aufnahme 6, die Wahrheit gilt also für beide Aufnahmen. Die Parallaxe in Aufnahme 7 (2,44 m) lag nur 2,6 cm daneben. Ein erstes Durchprobieren der Höhe hatte 2,65 m als besten Wert gezeigt; das war ein Scheintreffer einer mehrdeutigen Passung.

**Vergleich** mit dem neuen Werkzeug `raumskizze-wahrheit.mjs`. Es passt die Erfassungen robust auf die Wahrheit (Drehung, Spiegelung, Verschiebung, optional Maßstab) und misst den Abstand jedes Punkts zur nächsten echten Wand. Mit `--abschnitte` passt es jeden Bezugsabschnitt zwischen zwei Brüchen einzeln (Suche ±20°, ±1,5 m um die Gesamtpassung). Alle Werte mit H = 2,416 m:

| | Aufnahme 6 | Aufnahme 7 |
|---|---|---|
| Ergebnis des Schätzers | 6 Ecken, 22,9 m² | 21 Ecken, 25,2 m² (mit Parallaxe: 7 Ecken, 42,7 m²) |
| Erfassungen an Wänden, Gesamtpassung | Median 5,6 cm, 63 % unter 10 cm | Median 45,6 cm, 20 % unter 10 cm |
| Bester Abschnitt, eigene Passung | 122–146 s, 52 Erf.: Median 3,6 cm, 86 % unter 10 cm | 10–16 s, 19 Erf.: Median 7,2 cm, 62 % unter 10 cm |
| Übrige Abschnitte, eigene Passung | Median 14–68 cm | Median 16–44 cm |
| Versatz der Abschnitte gegen die Gesamtpassung | 40–170 cm, 6–20° | 40–185 cm, 4–20° |

Geschätzte Wände in Aufnahme 6: LM 8,2 cm / 0,3°, MN 5,3 und 3,2 cm, GZ 5,6 cm / 3,4°, eine Wand 85 cm daneben (NO). Zwei Ecken 7 und 12 cm neben der echten.

**Folgerung:**
- Innerhalb eines sauberen Bezugsabschnitts ist die Erfassung brauchbar genau: Median 3,6 cm.
- Die großen Fehler kommen aus den Brüchen zwischen den Abschnitten. Nach Relokalisierung oder Ankerwechsel liegt der Rahmen bis über 1 m und bis 20° daneben.
- Ein Versatz am Suchrand (±20°, ±1,5 m) kann größer sein. In einem Abschnitt, der nur eine Wandrichtung sieht, ist die Verschiebung längs der Wand unbestimmt, und die Versatzzahl kann dadurch zu groß erscheinen. Der Median nach eigener Passung ist davon unberührt.
- In Aufnahme 7 sind auch die Abschnitte selbst schlechter: großer Raum, Küchenzeile, lange Abschnitte mit möglicher Drift. Das ist noch nicht getrennt.
- Wichtigster Hebel ist damit Punkt 7 (Erfassungen an den nächsten Anker binden) bzw. in 11.4 der 4-DoF-Versatz je Tracking-Abschnitt in der Ausgleichung, noch vor besseren Kanten.
- Mit Laser-Höhe springt der Schätzer in Aufnahme 7 auf 21 Ecken; auch das ist die Instabilität aus 10.15.

## 11. Umbau: Kanten als Landmarken (Recherche 25.10. nachmittags)

Anlass war Tobias' Vorgabe:
- Kanten im ganzen Bild erkennen, nicht nur am Fadenkreuz.
- Bodenkanten mitnutzen, wenn sie sichtbar sind.
- Jede Kante ist zunächst unendlich lang. Neue Beobachtungen werden ihr zugeordnet, der Fehler wird über alle neu ausgeglichen, die Länge ergibt sich an den Ecken.

Drei Recherchen, Paper liegen in `paper/`. [V] heißt im Volltext gelesen; der Rest stammt aus Abstract oder Sekundärquelle.

**11.1 Linien über viele Bilder (SLAM/SfM)**
- Allgemeine 3D-Linien führt man in Plücker-Koordinaten bzw. der orthonormalen Form mit 4 Freiheitsgraden (LIMAP Supp. A.2, PL-VINS III-C [V]).
- Bei bekannter Schwerkraft und Richtung bleiben 2 Parameter je Linie, die Ausdehnung wird getrennt geführt (StructVIO §III [V]). Waagerechte Linien bekannter Richtung machen die Gier beobachtbar (Kottas & Roumeliotis 2013 [V]).
- Für die unendliche Landmarke ist das passende Fehlermaß der Abstand der beobachteten Segmentenden zur projizierten Linie (StructVIO Gl. 18, LIMAP Gl. 8 [V]). Robust mit Huber (PL-VINS) oder Cauchy (LIMAP).
- Ausgleich je Linie mit Gauss-Newton über alle Sichten, alte Messungen als Prior verdichtet (StructVIO Gl. 32–33 [V]). Zuordnung durch Projektion mit der vorhergesagten Pose, Filter nach Lage und Winkel, Prüfung im Bild (StructVIO V-A [V]). Doppelte Landmarken werden über einen Graphen oder einen χ²-Test zusammengeführt (LIMAP 3.2, Pfister Gl. 30 [V]).
- Endpunkte: alle Beobachtungsenden auf die Linie projizieren, je Seite den drittäußersten (LIMAP Supp. [V]).
- Teuer ist die Detektion, nicht der Ausgleich: PL-VINS LSD 62–70 ms, Tracking 12–15 ms, Desktop-C++ (Tab. IV [V]).
- Folgerung für uns: Eine Wand ist eine 2D-Gerade (θ, ρ) im Grundriss, dazu kommen die gemeinsamen Höhen h_c (Decke) und h_f (Boden). Decken- und Bodenkante derselben Wand teilen sich (θ, ρ). Beim Verlängern wächst das Fehlerband linear mit dem Abstand vom Schwerpunkt der Beobachtungen; das ist genau der Fall „nur 23 % der Wand gesehen“.

**11.2 Raumlayout aus Decken- und Bodenkanten**
- Jede Bildspalte trifft genau eine Wand. Decken- und Bodenlinie hängen über eine Homologie zusammen. Eine Unbekannte je Spalte genügt, und die Bodenlinie folgt auch dort, wo sie verdeckt ist (Flint 2010 §3.2, Flint 2011 §3 [V]). Feste Reihenfolge Decke/Wand/Boden je Spalte (Cabral 2014 §6 [V]).
- Die Boden-Wand-Grenze ist in den meisten Räumen teils oder ganz verdeckt (Hedau 2009 [V]), im ST-PIO-Beispiel zu über 50 %. DuLa-Net nutzt deshalb die Deckenansicht [V].
- Möbel: Verfahren ohne Modell für Störobjekte legen Wände gern auf Möbelflächen (Lee 2010 §1.1 [V]). Störobjekte als Quader im Raum schieben die Wand nach hinten (Lee 2010 §4.3, Pixelfehler 18,6 → 16,2 %).
- Fusion über viele Bilder: Cabral 2014 rechnet ein Raster in der Draufsicht mit Wand-Evidenz und Freiraum-Evidenz entlang der Sichtstrahlen. Der Grundriss ist der kürzeste geschlossene Weg um den Kern-Freiraum, mit Kosten je Kante (§4–5 [V]). Das erzwingt einen einfachen Ring, der einmal herumläuft; genau das fehlt heute (10.15). Flints dynamische Programmierung läuft über die Spalten **eines** Bilds, nicht über die Wandfolge.
- Lernverfahren (RoomNet, HorizonNet, Layout Anything, PixCuboid) sind nur auf Desktop-GPUs gemessen. Brauchbar sind ihre Ideen, nicht die Netze.
- RoomPlan (nur Webseite): Draufsicht-Pseudobilder aus LiDAR, ein Netz für Ecken und Kanten, Heben mit geschätzter Wandhöhe. magicplan: Ecken markiert der Nutzer; GRIHA misst dafür 3,7–5,5 % Flächenfehler [V].

**11.3 Kanten im ganzen Bild**
- Laufzeit nativ C++, 640×480, Snapdragon 855 (ELSED Tab. 4 [V]): LSD 58,7 ms, EDLines 13,8 ms, ELSED 10,2 ms.
- Genauigkeit (F-Score YorkUrban): LSD 0,34, EDLines 0,36, ELSED 0,41. Lagefehler quer zur Linie: LSD 0,79 px, ELSED 0,85, DeepLSD 0,82 (DeepLSD Tab. 1 [V]). Gelernte Detektoren sind nicht lagegenauer, aber viel langsamer.
- Unser Ansatz für die Senkrechten (1D-Hough über den Fluchtpunkt aus der Pose) ist Flints Verfahren (Flint 2010 [V]). Er bleibt.
- Browser: opencv.js 4.13 enthält Canny, Hough, Sobel, CLAHE, aber keinen nutzbaren LineSegmentDetector. Lizenzen: ELSED Apache-2.0, ED_Lib MIT, IPOL-LSD AGPL (meiden).
- Vorverarbeitung: Kein Paper misst einen Nutzen von CLAHE oder Gamma für Liniendetektoren. Die Paper glätten mit Gauß (σ = 1).
- Subpixel: LSD und ELSED sind schon subpixelgenau. Feinlage längs gefundener Segmente in voller Auflösung mit Devernay-Parabel (0,04–0,15 px [V]).

**11.4 Vorschlag: Ablauf je ausgewertetem Bild**
1. *Erkennen:* ELSED auf dem ganzen Bild (287×640) als WASM im Worker. Erwartet 4–10 ms am Pixel (hochgerechnet, nicht gemessen). Bei 861×1920 eher 30–60 ms, darum Feinlage in voller Auflösung nur längs der Segmente.
2. *Einteilen:* Segmente über die Fluchtpunkte aus der Pose in senkrecht und waagerecht einteilen. Die waagerechten Fluchtpunkte liegen auf dem Horizont; die Raumrichtung ist eine 1D-Suche über die Gier.
3. *Heben:* Waagerechte Segmente auf Decken- und Bodenhöhe heben. Über mindestens zwei Posen die Höhe einordnen: Decke, Boden, Leiste oder Störer. Je Richtung gewinnt die fernste Kante auf Deckenhöhe, am Boden die unterste.
4. *Zuordnen:* Bekannte Wandgeraden mit der aktuellen Pose ins Bild projizieren. Zuordnen bei passendem Winkel, χ²-Abstand und Überlapp mit dem Stützintervall; mehrdeutige Treffer nicht zuordnen. Sonst entsteht eine neue unendliche Gerade.
5. *Ausgleichen:* Gauss-Newton mit Huber über alle Beobachtungen. Unbekannte sind (θ, ρ) je Wand, h_c, h_f, später ein 4-DoF-Versatz je Tracking-Abschnitt gegen Lagesprünge. Fehlermaß sind die Segmentenden gegen die projizierte Linie im Bild.
6. *Umriss:* Draufsicht-Raster mit Wand- und Freiraum-Evidenz; der Umriss ist der kürzeste geschlossene Weg um den Freiraum mit Strafe je Ecke (Cabral 2014). Das ersetzt Zeitring und `ringOrder`.
7. *Anzeige:* Jede Wandgerade läuft über das ganze Bild. Ihr Fehlerband wächst mit dem Abstand vom gesehenen Stück und zieht sich mit jeder neuen Beobachtung zusammen. Weitere Ansichten: Segmente nach Fluchtpunkt-Klasse gefärbt, Kantenketten, Fluchtpunkt-Zuordnung je Pixel.

**11.5 Reihenfolge (jeder Schritt zuerst am Prüfstand mit Aufnahme 5 und 6, dann am Gerät)**
- A: ELSED-Port mit Laufzeit bei 640/960/1920 px auf den Aufnahmen und am Pixel, dazu die Ansicht „Segmente“.
- B: Landmarken-Schicht (Schritte 4–5) offline gegen die heutige Auswertung.
- C: Bodenkanten über die gemeinsame Gerade und h_f.
- D: Umriss nach Cabral.
- Wahrheit: den Raum von Aufnahme 6 in Raumaufmaß mit dem Laser aufnehmen. Ohne Wahrheit lässt sich nur Stabilität messen, nicht Richtigkeit.

**11.6 Nachtrag 25.10. abends: ELSED-Port fertig.** `raumskizze-elsed.js` (720 Zeilen, Apache-2.0-Hinweis im Kopf) ist bitgleich zum C++-Original (mit `-ffp-contract=off` gebaut), geprüft auf 118 Bildern: Demo, synthetisch, 30 echte Kamerabilder, Hochskalierungen bis 861×1920. Laufzeit am Mac (Node) über alle Bilder von A6–A8 bei 287×640: Median 2,4–3,0 ms, 33–68 Segmente je Bild; bei 861×1920 hochskaliert 14,5 ms. Am Pixel nicht gemessen. `raumskizze-aufnahme.mjs --elsed` zeichnet die Segmente im Prüfstand.

## 12. Vier große Projekte und SLAM (25.10. abends)

Tobias hat alle vier Vorschläge beauftragt (ein Bezugsrahmen, Kanten als Landmarken, Umriss global, Tiefe), mit der Pflicht, **Inseln** (Pfeiler, freistehende Wandteile bis zur Decke) als eigene Ringe zu erfassen und zu exportieren. Seine Leitidee: „Wenn SLAM sauber gelöst ist, ist das Wände-Auslesen der leichte Teil.“

**12.1 Entwurfs-Workflow** (fünf Teilentwürfe mit Messungen an A6–A8 gegen die Wahrheit, Synthese, zwei Kritiker, Überarbeitung). Entwürfe und Skripte im Scratchpad unter `design/`. Die wichtigsten Messungen:
- *Bezugsrahmen:* Versatz je Tracking-Abschnitt plus Registrierung über Wände und Kamerastetigkeit senkt den Median aller Erfassungen zur echten Wand von 58,6 / 48,6 / 15,7 cm auf 20,3 / 34,7 / 8,3 cm (A6 / A7 / A8). Nur über Wände: A8 5,8 cm. Es gibt mehr Rahmenwechsel als gemeldete Brüche (A8: 81 cm ohne Meldung, als ein Anker zurückkam). Anker als feste Bindung verschlechtern (A6 20,3 → 32,0 cm).
- *Landmarken:* Bodenkanten liegen in diesen Aufnahmen praktisch nie auf echten Wänden (Kamera nach oben, Kartons, Küche). Gier je Segment auf echter Wand: Median 2–3°.
- *Umriss mit Inseln:* In der Simulation der Wohnküche mit Kanten aus dem ganzen Bild kommen beide Inseln in 100 % der Läufe mit richtiger Eckenzahl heraus (Eckenfehler außen Median 1,2 cm). Mit Erfassung nur am Fadenkreuz in keinem Lauf exakt.
- *Tiefe:* Die aufgezeichnete ARCore-Tiefe ist auf weißen Wänden und an der Decke unbrauchbar (Median 80–139 cm daneben; 56–98 % der Deckenpunkte liegen hinter der Decke), brauchbar nur auf dem Parkett in 1–2 m (2–9 cm). Vorerst nur Freiraum am Boden.

**12.2 SLAM-Recherche** (fünf Suchrichtungen, 30 Kernaussagen im PDF gegengeprüft: 12 bestätigt, 18 teilweise, keine falsch; Bericht `slam/BERICHT.md`, 21 neue Paper in `paper/`):
- ARCore bleibt Ortung und Relokalisierung. Eine eigene visuell-inertiale Ortung im Browser scheidet aus (IMU nur 60 Hz im Hauptfaden, kein Belichtungszeitpunkt).
- Darüber ein eigener 4-DoF-Faktorgraph im Worker: Abschnittsposen (mit Stützstellen gegen Drift), Wandlinien, Decken- und Bodenhöhe, Laserpunkte. Brüche sind Abschnittsgrenzen mit Max-Mixture-Brückenkante (Olson 2012), Folgekanten aus ARCore ohne Robustkern (VINS-Mono, COVINS-G), Wand-Zuordnung robust mit GNC.
- Löser in Stufen wie LAGO: erst Gier, dann linear, dann wenige Gauss-Newton-Schritte; eigener dünnbesetzter LDLᵀ-Löser in JS (für GTSAM/g2o gibt es keinen WASM-Build).
- Die Wände sind nicht der leichte Teil nach dem SLAM, sondern seine wichtigste Messung: Strukturlinien machen die Gier beobachtbar (StructVIO: Drift 0,96 → 0,29 % des Wegs) und verbinden die Abschnitte.
- Mehrbild-Triangulation einer Deckenkante entartet bei Bewegung längs der Wand (LIMAP §3.1.1); die Höhe bleibt deshalb global.
- Veröffentlichte Grundrisse vom Handy ohne LiDAR: 3–5 % Flächenfehler (GRIHA, magicplan), kein Paper mit Eckenfehlern im einstelligen Zentimeterbereich.

**12.3 Architektur „Karte“** (Scratchpad `design/ARCHITEKTUR.md`, Version 3): Module M0 Grundlagen, M3 Segmente (Bild-Worker), M4 Abschnitte, M5 Landmarken (Atlas mit lokalen Karten je Abschnitt), M6 Ausgleich (einziger gemeinsamer Ausgleich im Bild-Fehlermaß), M7 Umriss (Min-Cut mit Inselhypothesen), M8 Ringe und Export, M9 Tiefe, M10 Kartenlauf (live und offline gleich), dazu T1 Offline-Treiber `raumskizze-karte.mjs`, T2 Metrik `raumskizze-metrik.mjs`, T3 Simulation `raumskizze-sim.mjs` und die App als Stand 6 mit Messmodus `?mess=1`. Neu gemessen in v3: Chrome liefert senkrechte ARCore-Ebenen.

**Von Tobias bestätigte Festlegungen (25.10.):**
1. Anker nur zum Einordnen eines Bruchs, keine Rahmenbindung (gemessen schlechter).
2. Umriss per Zerlegung und Min-Cut mit Inselhypothesen statt Cabrals kürzestem Weg (Cabral kann keine Löcher).
3. Deckenhohe Schrankzeile: Außenring auf der Front, Hinweis „Wand dahinter mit Laser messen“.
4. `raumaufmass.html` bleibt unverändert; ungesehene Wände stehen im Raumnamen und in der Ergebnisliste.

Offen: Spiegelprobe. Alle drei Aufnahmen passen nur gespiegelt auf die Raumaufmaß-Datei; ein Foto von Ecke A auf Nische N-O-P-Q und Pfeiler klärt, ob der Plan die Draufsicht oder ihr Spiegelbild ist.

**12.4 Umsetzung (Nacht 25./26.10.):** Phase 0 (M0, T2, T3) und alle neun Module gebaut, je mit unabhängiger Abnahme. Abgenommen wurden nur M8 Ringe und M3 Segmente (nach Entscheid zur Gerätekante); die übrigen sind mit offenen Befunden committet (`27d610d`). Stand 6 (Bild-Worker, Messmodus `?mess=1`, Links für die Messsitzungen) ist live.

**12.5 Zusammenführen und Reparatur (26.10.):** Auf A6–A8 trug die neue Pipeline zunächst gar nicht (kein Kern, kein Export, A7 ein falscher 0,6-m²-Splitter). Diagnose, gemessen:
- M5 bestätigte nur ~5 Landmarken je Aufnahme. Häufigste Sperre (45 % der echten Wände): Bei einer Basis quer zur Linie unter 0,3 m bleibt die Höhe einer Kante unbeobachtbar (Schwenken auf der Stelle, LIMAP §3.1.1). Zweithäufigste: die ungemessene Unterzug-Regel.
- Die Fadenkreuz-Erfassungen hatten keinen eigenen Weg und verfielen zu 40–57 % in zu kurzen Spuren.
- Die lokale Deckenhöhe je Abschnitt lief frei (1,95–3,61 m); der einzige Kern in A7 hing an 3,01 m.
- Für den Außenring gab es keine Plausibilitätsregel.

Reparatur in drei Runden: Erfassungsweg in M5, Höhe an Laser-H und Boden gebunden, Außenring-Tor (Kamerabahn, Freiraum, Fläche), Rückfall auf die alte Pipeline im Offline-Treiber, Verbindung über die Kette. Ergebnis Runde 3 gegen die Wahrheit (Grundlinie = alte Pipeline):

| | neu (Quelle Erfassungen) | alt |
|---|---|---|
| A6 | Export, 12 Ecken, IoU 0,62, 42,1 m², Median 33,1 cm | 4 Ecken, IoU 0,35, 23,7 m², Median 33–37 cm |
| A7 | Export, 33 Ecken, IoU 0,43, 76,7 m², Median 47,5 cm | 7 Ecken, IoU 0,77, 65,7 m², Median 47–49 cm |
| A8 | Export, 4 Ecken, IoU 0,10, 6,8 m², Median 6,6 cm (Passung mehrdeutig, 1,11) | 8 Ecken, IoU 0,09, 6,1 m², Median 14–18 cm |

- Inseln: 0 von 2 in allen Läufen; falsche Inseln 0. Kein falscher Export mehr (Tor).
- Erfolgskriterium (besser als die alte Pipeline auf 2 von 3, kein falscher Export) verfehlt. Die Gegenprüfung hat alle Zahlen reproduziert.
- Hauptrestproblem: die Lage der Abschnitte zueinander. Mit Lage und Höhe je Abschnitt aus der Wahrheit (Orakel) läge der Median bei 2,3 cm (A6) bzw. 5,8 cm (A7). Die Kanten selbst sind also gut; es fehlt die Verbindung der Abschnitte nach ARCore-Brüchen. Die Abschnitte teilen in diesen Aufnahmen kaum Wände (0–8 %), darum ist die Verbindung über Wände kaum beobachtbar.
- Modultests: alle 11 grün (der Segmente-Test vergleicht jetzt gegen F1 ohne Verschmelzen).

## Quellen

Plattform:
- [chromestatus WebXR AR Module](https://chromestatus.com/feature/5450241148977152) · [Hit-test](https://chromestatus.com/feature/4755348300759040) · [Depth API](https://chromestatus.com/feature/5742647199137792) · [Raw Camera Access](https://chromestatus.com/feature/5759984304390144) · [WebXR/WebGPU](https://chromestatus.com/feature/5077077997649920)
- [Chrome 147 Release Notes (Plane Detection)](https://developer.chrome.com/release-notes/147) · [Commit 910b1ea](https://github.com/chromium/chromium/commit/910b1ea4183f7d7488db0c5802c5b9e9794208e1)
- [Chromium arcore_impl.cc](https://github.com/chromium/chromium/blob/main/device/vr/android/arcore/arcore_impl.cc) · [arcore_device.cc](https://github.com/chromium/chromium/blob/main/device/vr/android/arcore/arcore_device.cc) · [features.cc](https://github.com/chromium/chromium/blob/main/device/vr/public/cpp/features.cc)
- [Raw Camera Access Explainer](https://github.com/immersive-web/raw-camera-access/blob/main/explainer.md) · [Spec](https://immersive-web.github.io/raw-camera-access/) · [Hit-Test-Spec (+Y gegen Schwerkraft)](https://immersive-web.github.io/hit-test/) · [three.js #33404 (Absturz M147/148)](https://github.com/mrdoob/three.js/issues/33404)
- [WebXR-Anforderungen (Google)](https://developers.google.com/ar/develop/webxr/requirements) · [ARCore-Geräteliste](https://developers.google.com/ar/devices) · [ARCore Depth](https://developers.google.com/ar/develop/depth) · [ARCore Fundamentals](https://developers.google.com/ar/develop/fundamentals) · [ARCore 1.2.0 Release Notes](https://github.com/google-ar/arcore-android-sdk/releases/tag/v1.2.0)
- [Chrome 121: WebGPU auf Android](https://developer.chrome.com/blog/new-in-webgpu-121) · [blink-dev: WebNN ohne Android](https://groups.google.com/a/chromium.org/g/blink-dev/c/5CWKSChYo98) · [vgpu llms-full.txt](https://vgpu.sh/llms-full.txt)
- [sceneview PR #3863 (weiße Wand)](https://github.com/sceneview/sceneview/pull/3863) · [ARCore Issue #1257](https://github.com/google-ar/arcore-android-sdk/issues/1257) · [ARCore Issue #1772 (kein RoomPlan)](https://github.com/google-ar/arcore-android-sdk/issues/1772)
- [Leica-DISTO-BLE (CaveSurvey)](https://github.com/lz1asl/CaveSurvey/blob/master/src/main/java/com/astoev/cave/survey/service/bluetooth/device/ble/LeicaDistoBluetoothLEDevice.java) · [d2relay](https://github.com/seichter/d2relay/blob/master/doc/notes.md) · [chromestatus Web Bluetooth](https://chromestatus.com/feature/5264933985976320)

Verdeckung und Decke:
- [Bieri et al. 2025, HouseLayout3D (Abschnitt 4.4)](https://arxiv.org/html/2512.02450) · [U2RLE (Fehlerfall: verdeckte Bodenkante)](https://arxiv.org/pdf/2304.08580) · [Hirzer et al., WACV 2020](https://openaccess.thecvf.com/content_WACV_2020/papers/Hirzer_Smart_Hypothesis_Generation_for_Efficient_and_Robust_Room_Layout_Estimation_WACV_2020_paper.pdf) · [Bao et al., WACV 2014 (SfM-Punkte gegen Verdeckung)](https://ira.disco.unimib.it/wp-content/uploads/sites/22/bao_wacv2014.pdf)
- [VideoTrace, SIGGRAPH 2007](https://www.informatik.uni-marburg.de/~thormae/paper/Siggraph07_videotrace.pdf)

Markt:
- [magicplan: Android ohne Scan](https://help.magicplan.app/does-magicplan-work-on-my-device) · [The new magicplan](https://help.magicplan.app/the-new-magicplan) · [Archiv: Android-Manual-Scan](http://web.archive.org/web/20240915194442/https://help.magicplan.app/scan-a-room-with-the-camera-of-your-mobile-device-android)
- [Leica DISTO Plan](https://play.google.com/store/apps/details?id=com.leica.distoplan) · [Bosch MeasureOn](https://play.google.com/store/apps/details?id=com.bosch.ptmt.na.measrOn) · [Plotlay Scan](https://play.google.com/store/apps/details?id=io.plotlay.scan) · [9to5Google: Measure eingestellt](https://9to5google.com/2021/06/08/google-measure-ar-app-sunset/)

Paper (PDFs in `paper/`):
- Scargill, Chen, Gorlatova 2021, Hologram-Drift ARCore/ARKit — `2109.14757_hologram_drift_arcore_arkit.pdf`
- Goyal et al. 2021, GRIHA (Grundriss-Apps gegen Handmaß) — `2103.08297_GRIHA_smartphone_floorplan_vs_magicplan.pdf`
- Valentin et al. 2018, Depth from Motion for Smartphone AR — `valentin2018_depth_from_motion_smartphone_AR.pdf`
- Du et al. 2020, DepthLab — `du2020_depthlab_arcore_depth.pdf`
- Haenel et al. 2022, ARCore-Tiefenkarten als Punktwolke — `haenel2022_arcore_depthmaps_pointcloud_ISPRS.pdf`
- Sokolov et al. 2025, ARCore-Distanz bei wenig Licht — `sokolov2025_arcore_distance_low_light.pdf`
- Ganj et al. 2023, Mobile AR Depth Estimation — `2310.14437_mobile_AR_metric_depth_challenges.pdf`
- Monokulare Tiefe: `2406.09414_depth_anything_v2.pdf`, `2404.15506_metric3d_v2.pdf`, `2403.18913_unidepth.pdf`, `2502.20110_unidepthv2.pdf`, `2302.12288_zoedepth.pdf`, `2410.02073_depth_pro.pdf`
- Raum-Layout: `1703.06241_roomnet_layout.pdf`, `1707.00383_ST-PIO_room_layout.pdf`, `2512.02952_layout_anything_LSUN.pdf`
- Gelesen, aber nicht als PDF abgelegt: Kim et al. 2022 (VIO-Benchmark, [PMC9785098](https://pmc.ncbi.nlm.nih.gov/articles/PMC9785098/)), Maneli & Isafiade 2023 ([IEEE Access](https://ieeexplore.ieee.org/stamp/stamp.jsp?arnumber=10035996)), Wang et al. 2024 (DL-Inferenz im Browser, [arXiv 2402.05981](https://arxiv.org/abs/2402.05981)), Gu et al. 2022 (M-LSD, [arXiv 2106.00186](https://arxiv.org/abs/2106.00186))
