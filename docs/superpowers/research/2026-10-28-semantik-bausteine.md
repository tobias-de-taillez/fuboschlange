# Semantische Segmentierung für die Raumskizze: Prüfung der Bausteine


Stand 28.10.2026. Grundlage sind vier Recherchen und zwei Gegenprüfungen. Wo sich beide widersprechen, gilt die Gegenprüfung. Kennzeichnung: **belegt** heißt, die Aussage steht in einer Primärquelle oder einer Projektmessung. **Abgeleitet** heißt, es ist eine Folgerung oder Hochrechnung. **Unklar** heißt, die Quellen reichen nicht aus. Die Lizenzangaben sind keine Rechtsberatung.

### 1 Kurzfazit

- **Die Pipeline aus dem anderen Chat ist kein Nachbau des Papers** (belegt). SegFormer-B0, ADE20K, Transformers.js, ONNX Runtime Web, enva-xr und Bayes-Fusion kommen im Paper nicht vor. WebGPU steht nur im Ausblick. Tatsächlich nutzt das Paper:
  - TensorFlow.js 4.10 auf WebGL,
  - ein eigenes Encoder-Decoder-Netz mit 56k bis 265k Parametern auf 160×90 Pixeln,
  - 14 Klassen aus S3DIS,
  - als Fusion eine Zählung je Voxel mit Argmax.
- **Die Voxelkarte lohnt sich für die Raumskizze nicht** (abgeleitet). Gründe:
  - Sie hängt die Etiketten an die ARCore-Tiefe. Die liegt an Wand und Decke im Median 80–139 cm daneben, und 56–98 % der Deckenpunkte liegen hinter der Decke (Doku 12.1).
  - Sie setzt einen durchgehenden Weltrahmen voraus. Den gibt es nach ARCore-Brüchen nicht, und genau das ist das Hauptproblem (12.5, 12.8).
  - 10-cm-Voxel sind für Zentimetergenauigkeit zu grob.
  - Ebenen, Kanten oder Ecken liefert sie nicht.
- **Ein enger Messaufbau könnte sich lohnen** (abgeleitet, ungemessen): ein 2D-Segmentierungsnetz, das selten läuft, nicht für jedes Bild.
  - **(a) Fadenkreuz-Erfassungen prüfen.** Heute wird eine Wand mit Nutzer-Erfassung ungeprüft zur `wand` (raumskizze-landmarken.js um Z. 671). Das ist die stärkste Stelle.
  - **(b) ELSED-O-Segmente vorsortieren** in Wand/Decke, Schrank, Tür/Fenster.
  - **(c) Schrank-Verdacht automatisch auslösen.**
- **Monokulare Tiefe oder Normalen bringen hier wenig.** Als Geometriequelle sind sie in der Doku schon verworfen (Abschnitte 2 und 4). Die Verschiebung während der Ortungslücke können sie nicht beobachten, denn in der Lücke gibt es keine Bilder. Für die Deckenhöhe in A8 gibt es einfachere Wege (12.8).
- **Kommerziell gibt es kein fertiges sauberes Segmentierungsgewicht** (belegt bzw. abgeleitet):
  - SegFormer und ADE20K sind nur nicht-kommerziell nutzbar.
  - Der sauberste Weg: DINOv2-S (Apache 2.0) eingefroren, dazu ein eigener Kopf, trainiert auf eigenen Pixel-Aufnahmen oder selbst gerenderten Infinigen-Szenen.
  - Hypersim ist wegen der TurboSquid-ML-Klausel riskant.
- **Die Laufzeit am Pixel 9 Pro mit WebGPU in der XR-Sitzung ist nirgends gemessen.** Eine Inferenz pro Bild bei 30 Bildern/s ist unrealistisch, in Frage kommt nur eine je Erfassung oder je Schlüsselbild (abgeleitet).

### 2 Das Paper

Yang, Yeh & Tsai: „WebXR-based mobile point cloud rendering and semantic segmentation using depth data and voxel fusion“, Sci. Rep. 16:33709 (2026), DOI 10.1038/s41598-026-74609-x. Lokal: `paper/yang2026_webxr_point_cloud_semantic_segmentation_voxel_fusion_SciRep.pdf`. Das Supplement liegt nur im Scratchpad (DOCX).

1. **Gerät und Software** (belegt):
   - Pixel 6 Pro (Tensor, Mali-G78 MP20, Android 14), Chrome 118.
   - Three.js r155 mit WebGL, ShaderMaterial und BufferGeometry.
   - TensorFlow.js 4.10.0, trainiert mit TensorFlow 2.10.0 auf einer RTX 2080.
   - Code ist nicht veröffentlicht, Daten gibt es auf Anfrage.
   - Der Artikel steht unter CC BY-NC-ND 4.0.
2. **Eingaben** (belegt):
   - WebXR-Tiefe mit 160×90 Pixeln als `Uint8Array(28800)`, umgedeutet zu Uint16 mit Skala etwa 0,001 (mm).
   - Pixel ohne Tiefe bekommen die Klasse „None“.
   - Das Kamerabild wird per WebGL als RGBA gelesen. Laut Text wird nur der R-Kanal per Nearest Neighbour auf das Tiefenraster abgetastet.
   - Die Modelle erhalten RGB, RGBD oder RGBXYZ mit 160×90.
3. **2D-Modell** (belegt):
   - Eigener Encoder-Decoder mit U-Net-Symmetrie und EDANet-Upsampling.
   - Etwa 265k Parameter, in der Thin-Variante etwa 56k.
   - Training: 50 Epochen, Adam, Lernrate 0,001, Batch 8.
   - Klassen: ceiling, floor, wall, beam, column, window, door, table, chair, sofa, bookcase, board, clutter, none. Die Legende in Abb. 7a nennt zusätzlich „blind“.
4. **Fusion** (belegt):
   - Voxelpuffer mit 128³ Voxeln zu je 0,1 m, also ein Würfel von etwa 12,8 m.
   - Der Hash wird im Shader berechnet.
   - Je Voxel werden Anzahl, Positionssumme und Wahrscheinlichkeitssumme aufaddiert, das Label ist das Argmax.
   - Das ist keine rekursive Bayes-Fusion wie bei SemanticFusion.
   - PointNet dient nur offline als 3D-Vergleich: 256 Punkte je 1-m³-Block.
5. **Ergebnisse auf S3DIS** (belegt, Supplement):
   - Trainiert auf Area 1–5, getestet auf Area 6.
   - Tiefe und Labels sind per Shader aus den Punktwolken gerendert, also ideale Tiefe.

   | Auswertung | Genauigkeit | mIoU | Quelle |
   |---|---|---|---|
   | Einzelansicht | 70,7–77,0 % | 44,9–53,8 % | Tab. S6 |
   | vor der Fusion | 68,1–77,0 % | 37,4–49,3 % | Tab. S7 |
   | nach der Fusion, alle Modelle | 73,4–80,5 % | 47,9–55,6 % | Tab. S7 |
   | Voxelebene | 62,9–70,2 % | – | Tab. S8 |
   | PointNet-Global, Voxelebene | 71,65 % | – | Tab. S8 |
   | PointNet einzeln, Global | 77,9 % | 52,1 % | Tab. S4 |
   | PointNet einzeln, Local | 79,6 % | 48,5 % | Tab. S4 |

6. **Echter Raum** (Tab. S10, Encoder-Decoder-Thin):

   | Eingabe | Genauigkeit | mIoU |
   |---|---|---|
   | RGB | 88,97 % | 74,23 % |
   | RGBD | 89,83 % | 76,08 % |
   | RGBXYZ | 89,81 % | 78,54 % |

   - Belegt: Die 168 Bilder sind der augmentierte Satz (Drehung, Weißabgleich), aufgeteilt 80/20 in Training und Validierung. Getestet wurde auf den Originalbildern.
   - Abgeleitet: Die Werte sind vermutlich aufgebläht, weil die Augmentierungen der Testbilder im Training waren. Alle Szenen A–H stammen offenbar aus einem einzigen Büro.
   - Belegt: Werte je Klasse gibt es nirgends.
7. **Leistung** (belegt):
   - Durchgehende Erkennung je WebXR-Puffer schafft etwa 10 FPS, deshalb wird sie per Knopfdruck ausgelöst.
   - Laut Autoren ist das ausdrücklich kein Latenz-Benchmark. Es gilt für ein 56k-Netz auf 160×90 Pixeln.
   - Latenz, Speicher, Wärme und Energie sind nicht gemessen.
8. **Tiefenqualität** (belegt):
   - Die Güte der realen WebXR- bzw. ARCore-Tiefe wird nicht gemessen. Weiße Wände und Decke kommen nicht vor.
   - Es gibt nur zwei allgemeine Hinweise: Material, Licht und Gerät beeinflussen die Tiefe (Z. 389–395), und eine Kalibrierung der Tiefe ist künftige Arbeit (Z. 371–372).
   - Abgeleitet: Das Paper stützt die Messung in 12.1 weder, noch widerlegt es sie. Die Abbildungen 6b und 7 sind nur qualitativ. Woher die dichte „Scene“-Punktwolke in Abb. 6 stammt, sagt das Paper nicht.
9. **Für einen Grundriss** (abgeleitet):
   - Es gibt keine Extraktion von Ebenen, Kanten oder Ecken und keine Bewertung der Geometrie.
   - Tracking-Brüche und Relokalisierung werden nicht behandelt, die Pose kommt ungeprüft aus WebXR.
10. **Bildfeld** (unklar): Tab. S2 nennt 70,95° FOV und Seitenverhältnis 2,165.
    - Bezieht sich das FOV auf die lange Achse, ergeben sich 36,4° quer, nahe an den 34,6° des Projekts.
    - Bezieht es sich auf die kurze Achse, ergäben sich unplausible 114°.
    - Die Achse ist nicht angegeben, und das Gerät ist ein anderes. Eine Stütze für die Projektmessung ist das also nicht.

### 3 Lizenzlage

Abgerufen am 28.10.2026 aus LICENSE-Dateien, READMEs, HF-API-Tags und Datensatzseiten. Die Einstufung „kommerziell“ ist abgeleitet. „Riskant“ heißt: Die Lizenz ist permissiv, aber die Kette der Trainingsdaten ist nicht-kommerziell, unklar oder umstritten.

**Laufzeit und Code**

| Baustein | Code | Gewichte | Trainingsdaten | kommerziell | Quelle |
|---|---|---|---|---|---|
| three.js | MIT | – | – | sauber | github.com/mrdoob/three.js LICENSE |
| enva-xr | MIT, inaktiv seit 04.09.2023 | – | – | sauber | github.com/tentone/enva-xr LICENSE.md |
| Transformers.js | Apache 2.0 | – | – | sauber | github.com/huggingface/transformers.js LICENSE |
| ONNX Runtime (Web) | MIT | – | – | sauber | github.com/microsoft/onnxruntime LICENSE |
| EMSANet als Gerüst | Apache 2.0, ONNX/TensorRT-Export | keine Lizenz angegeben | ImageNet-Init, NYUv2, SUN RGB-D, teils Hypersim | Code sauber, Gewichte riskant, eigenes Training nötig | github.com/TUI-NICR/EMSANet README |
| Infinigen | BSD-3 | – | selbst generiert, Assets ungeprüft | sauber, sofern die Assets frei sind | GitHub-API princeton-vl/infinigen |
| ARCore über Chrome-WebXR | SDK-Quellen Apache 2.0, Binärdateien mit eigenen AGB | – | – | unklar, ob die AGB für eine reine WebXR-Seite gelten | arcore-android-sdk LICENSE; developers.google.com/ar/develop/terms |

**Segmentierung und Backbones**

| Baustein | Code | Gewichte | Trainingsdaten | kommerziell | Quelle |
|---|---|---|---|---|---|
| SegFormer-B0 ADE20K (auch Xenova-ONNX) | NVIDIA Source Code License | NVIDIA, §3.3 „research or evaluation purposes only“ | ADE20K | nein | NVlabs/SegFormer LICENSE; HF-Tag license:other |
| DINOv2 ViT-S/14 | Apache 2.0 seit Commit 81b2b641 vom 31.08.2023, davor CC-BY-NC | Apache 2.0 (HF-Tag) | LVD-142M, darin ImageNet-22k „as is“ (Tab. 15); ADE20K, NYUv2 und SUN RGB-D nur als Retrieval-Seeds | riskant, geringstes Risiko unter den Backbones | facebookresearch/dinov2 README und LICENSE-Historie; paper/2304.07193 |
| DINOv2 Segmentierungsköpfe (ADE20K, VOC) | Apache 2.0 | Repo-Lizenz | ADE20K, VOC | nein (abgeleitet) | DINOv2 README; ade20k.csail.mit.edu/terms |
| XRay-DINO, Cell-DINO | Cell-DINO CC BY-NC | FAIR Noncommercial | – | nein | DINOv2 README |
| DINOv3 | DINOv3 License | DINOv3 License, Download zugangsbeschränkt (gated) | LVD-1689M | riskant: Lizenzkopie bei Weitergabe, kein Reverse Engineering, kein Militär oder ITAR, Meta darf einseitig ändern, kalifornisches Recht | facebookresearch/dinov3 LICENSE.md; HF gated:manual |
| Mask2Former Model Zoo | überwiegend MIT | CC BY-NC 4.0 | ADE20K, COCO | nein | Mask2Former MODEL_ZOO.md |
| OneFormer, EoMT | MIT | MIT (HF-Tag) | ADE20K, COCO, Cityscapes | riskant | OneFormer LICENSE; HF-Tags |
| SAM, SAM2, MobileSAM, EfficientViT-SAM | Apache 2.0 | Apache 2.0 | SA-1B („Research purposes only“) | riskant | sam2 und segment-anything README; Meta-Datensatzseite |

**Tiefe und Normalen**

| Baustein | Code | Gewichte | Trainingsdaten | kommerziell | Quelle |
|---|---|---|---|---|---|
| Depth Anything V2 Small | Apache 2.0 | Apache 2.0 (auch onnx-community) | Pseudo-Labels auf 62 Mio. realen Bildern, darunter SA-1B, ImageNet-21K, LSUN, Places365; Lehrer DINOv2-G, nur synthetisch trainiert | riskant | Depth-Anything-V2 README Z. 180; paper/2406.09414 |
| DA-V2 Metric-Hypersim-Small | Apache 2.0 | Apache 2.0 (HF-Tag) | wie Small, zusätzlich feinabgestimmt auf Hypersim | riskant (SA-1B und Hypersim) | metric_depth/README Z. 5 |
| DA-V2 Metric-Indoor-Small/Base-hf | – | kein Lizenz-Tag | Hypersim | unklar | HF-API |
| DA-V2 Base/Large/Giant | – | CC BY-NC 4.0 | – | nein | README; HF-Tags |
| DA3-Small/Base, METRIC-Large, MONO-Large | Apache 2.0 | Apache 2.0 | nicht geprüft | riskant oder unklar | ByteDance-Seed/Depth-Anything-3 README |
| DA3-Large/Giant/Nested | Apache 2.0 | CC BY-NC 4.0 | – | nein | ebenda |
| MoGe-2 (vits/vitl-normal) | MIT | MIT (HF-Tag) | nicht geprüft | riskant oder unklar | microsoft/MoGe README; HF-API |
| Metric3D | BSD-2 | keine Lizenz, Autoren für kommerzielle Nutzung anfragen | – | riskant (Quelle nur von der Erstprüfung abgerufen) | YvanYin/Metric3D README |
| DSINE (Normalen) | Imperial-Lizenz, nur nicht-kommerziell | ebenso | – | nein | baegwangbin/DSINE LICENSE |
| Apple Depth Pro | apple-amlr | apple-amlr | – | nein | Erstrecherche |

**Datensätze**

| Baustein | Code | Gewichte | Trainingsdaten | kommerziell | Quelle |
|---|---|---|---|---|---|
| Hypersim | Apple-Softwarelizenz (LICENSE.txt) | – | Bilder und Labels CC-BY-SA 3.0 Unported; Szenen aus Evermotion-Assets (TurboSquid) | riskant: Ob ShareAlike auf trainierte Gewichte durchschlägt, ist offen. TurboSquid §6.d verbietet seit 16.03.2023 ML-Nutzung von Bildern aus den Modellen ohne Zustimmung, Hypersim ist von 2020 | apple/ml-hypersim README Z. 7, 37, 344; blog.turbosquid.com/turbosquid-3d-model-license |
| ADE20K | Annotationen und Software BSD-3 | – | Bilder nur für nicht-kommerzielle Forschung und Lehre | nein | ade20k.csail.mit.edu/terms |
| S3DIS (Yang) | – | – | Lizenzformular, Text nicht öffentlich | unklar | github.com/alexsax/2D-3D-Semantics |
| NYU Depth V2, SUN RGB-D | – | – | keine Lizenz, nur Zitierpflicht | riskant (keine Lizenz heißt nicht permissiv) | Datensatzseiten |
| ScanNet | – | – | nur nicht-kommerziell | nein | ScanNet TOS §1 |
| Structured3D | MIT | – | eigene Nutzungsbedingungen, nur per Formular | unklar | Structured3D README |
| ARKitScenes | Apple-Lizenz | – | Basis nicht-kommerziell; kommerziell, wenn die Nutzer in jedem Monat vor 08/2024 unter 700 Mio. MAU lagen; keine 2D-Semantik | riskant (Eigenlizenz), für ein neues Produkt erfüllt | apple/ARKitScenes LICENSE, README Z. 73 |
| COCO-Stuff | CC BY 4.0 | – | Annotationen CC BY 4.0 (wall-, floor-, ceiling-Klassen), Bilder unter Flickr-Bedingungen | riskant | nightrome/cocostuff README |
| Eigene Pixel-Aufnahmen mit eigenen Labels | – | – | eigen | sauber | – |
| Yang-Artikel selbst | kein Code | – | – | Text und Abbildungen nein (CC BY-NC-ND 4.0), die Idee darf man nachbauen | PDF, Open-Access-Hinweis |

Allgemein (abgeleitet): Eine Web-App liefert die Gewichte an jeden Browser aus und verbreitet sie damit. Deshalb greifen die Weitergabepflichten: Apache NOTICE (§4), DINOv3-Lizenzkopie (§1.b.i), CC-BY-SA-Attribution und gegebenenfalls ShareAlike.

### 4 Laufzeit im Browser auf dem Pixel 9 Pro

**Gemessen bzw. belegt**

- **WebGPU** (Projektmessung chrome://gpu vom 24.10., Doku Abschnitt 1):
  - Chrome 155 ohne Flags, WebGPU aktiv über Vulkan, mit shader-f16, subgroups und timestamp-query. WebNN ist aus.
  - XRGPUBinding gibt es nur hinter einem Flag, und auch dann fehlt `getCameraImage`.
  - Der Weg zum Netz führt also immer über WebGL-`readPixels`, eine CPU-Kopie und einen Upload auf das GPUDevice.
- **Kamerabild:** Heute wird RGBA mit 287×640 per `gl.readPixels` gelesen (`readSmall`, raumskizze-probe.html Z. 9142) und mit `fmt:'rgba'` an den Bild-Worker geschickt (Z. 9400). Luma entsteht erst im Worker (Z. 3671).
  - `LOG.timings.small` misst Render-to-FBO plus `readPixels`: Median 4,3 ms, 90 % 6,3 ms, max 15,5 ms (Doku 10.13, Stand 3).
  - Die Aussage der Erstrecherche, es werde nur Luma gelesen, ist widerlegt.
- **Header:** Die Seite sendet keine COOP/COEP-Header (vercel.json setzt nur Cache-Control) und ist damit nicht crossOriginIsolated. ORT-WASM liefe deshalb nur mit einem Thread.
- **Versionen** (npm, 28.10.):
  - Transformers.js 4.3.2 vom 27.10.2026; unterstützt dinov2, dinov3_vit, depth_anything, dpt und segformer.
  - onnxruntime-web 1.31.1 vom 26.10.2026.
- **Download-Größen** (HF-API):

  | Modell | fp32 | fp16 | int8 | q4f16 |
  |---|---|---|---|---|
  | dinov2-small | 88,5 MB | 44,4 MB | 24,4 MB | 13,9 MB |
  | depth-anything-v2-small | 99,1 MB | 49,6 MB | 27,3 MB | 19,1 MB |
  | segformer-b0-ade-512 | 15,3 MB | 7,9 MB | 4,4 MB | – |

- **Nativ und am Desktop gemessene Anker** (keine davon gilt für Browser plus Android):
  - **DINOv2 ViT-S/14, 448², fp16** (LiteRT-Karte, Angabe der Ersteller):
    - Pixel 8a CPU mit 4 Threads: 1093 ms.
    - Galaxy S26 Adreno-GPU: 54,7–55,2 ms; NPU: 41,9–85,9 ms.
    - Browser WebGPU auf M4 Max: 29,9 ms p50, die Ausgabe weicht von der CPU ab (max. rel. Abweichung 2,1).
    - Pixel 8a GPU „~8 ms“ ist unklar: Der Wert liegt etwa 7-mal unter Adreno und stammt von einem anderen Messwerkzeug.
  - **Depth Anything V2 Small, 518², fp32:** NPU S25 40,6–47,5 ms, S24 56,7 ms, S23 ~84 ms (Qualcomm AI Hub, nicht nachgeprüft). Eine GPU-Zahl für ein Handy gibt es nicht.
  - **SegFormer-B0, 512²:** 770 ms auf einem einzelnen ARM-Kern des Snapdragon 865 (TopFormer Tab. 1).
  - **Anatomizing** (20 Android-Geräte, Chrome): Der Browser ist auf der GPU 7,8× und auf der CPU 15,8× langsamer als nativ. Gemessen wurde nur WebGL, kein WebGPU.
- **Bekannte Fehlberechnungen** mit WebGPU bzw. f16 auf Android-ARM-GPUs: transformers.js #1320 und #1205, onnxruntime #27414 (nicht nachgeprüft).

**Abgeleitet**

- **Hochrechnung** für Browser mit WebGPU am Pixel 9 Pro, ohne XR: DINOv2-S 30–200 ms (224–448 px), DA-V2-S 100–400 ms (518 px), SegFormer-B0 50–300 ms (512 px). Der Browser-Faktor dabei stammt von WebGL.
- **WASM als Ausweichweg:** einige hundert Millisekunden bis Sekunden je Bild, in der XR-Sitzung unbrauchbar.
- **Folgerung:** Eine ViT-Inferenz pro Bild passt nicht in den 33-ms-Takt. In Frage kommt nur eine je Fadenkreuz-Erfassung oder je Schlüsselbild, in einem eigenen Worker.
- **Hauptfaden:** Die 25 ms Median und 40 ms bei 90 % sind historisch (Stand 3, A6, vor dem Bild-Worker). Den obigen Schluss tragen sie allein nicht.

**Offen (ungemessen)**

- Ob `navigator.gpu` im Worker auf dem Gerät tatsächlich verfügbar ist (bisher nur laut MDN-BCD ab Chrome 121).
- Latenz, Ladezeit, Aufwärmzeit, Speicher und Wärmedrift eines Modells am Pixel 9 Pro.
- Abweichung der f16-Ausgabe auf Mali gegen WASM.
- GPU-Konkurrenz zwischen WebGPU-Compute, ARCore und dem XR-Compositor, und ob Chrome WebGPU in der XR-Sitzung drosselt. Dazu wurde keine einzige Quelle gefunden.
- `readPixels` bei 861×1920 (`?ds=1920`).
- Die heutige Last im Hauptfaden (`ms` p99 ≤ 33 ms steht in 12.6 als offen).

### 5 Passung zum Projekt

**Wo Segmentierung helfen kann** (alles abgeleitet, nach erwartetem Nutzen geordnet)

1. **Fadenkreuz-Erfassungen absichern.**
   - Heute gilt: `if(nutzerKlasse(K, W, DEF.erfassung)) return klasseVon(W)` (raumskizze-landmarken.js um Z. 671). Rastet das Fadenkreuz auf einer Schrankoberkante, einem Bilderrahmen oder einer Leuchte ein, wird daraus ungeprüft eine Wand.
   - Vorschlag: eine Inferenz je Erfassung. Angenommen wird nur, wenn die Kante oben an Decke und unten an Wand grenzt.
   - Die Latenz spielt dort kaum eine Rolle, und RGBA liegt im Bild-Worker schon vor (belegt).
2. **ELSED-O-Segmente vorsortieren.**
   - In M3 (`G.lmSegmente`, raumskizze-segmente.js) bekommt jedes Segment ein Etikett für die Pixel oberhalb und unterhalb, z. B. Decke/Wand oder Schrank/Decke.
   - Schrank, Vorhang oder Bild ließen sich so früh als `stoer` vorbelegen.
   - Einschränkung aus der Gegenprüfung: Die Sperre bei Basis < 0,3 m (45 % der echten Wände, 12.5) umgeht eine Maske nur, indem sie die Kante auf die Laser-Höhe H festlegt. Beobachtbar wird die Höhe dadurch nicht. Bei Unterzügen entstünden falsche Höhen.
3. **Schrank-Verdacht.** `schrank` setzt heute nur der Nutzer (raumskizze-landmarken.js Z. 34, `G.lmSchrankVerdacht` Z. 695). Eine Schrankmaske über die volle Höhe könnte den Hinweis „Wand dahinter mit Laser messen“ automatisch auslösen.
4. **Türen und Fenster als Öffnungen** (Doku Abschnitt 3, „Ausbau später“). Die Klassen door und windowpane gibt es in ADE20K, NYU40 und S3DIS. Die Geometrie käme weiter aus der Projektion auf die Wandlinie.
5. **Mehrbild-Mittelung,** wenn überhaupt, auf den Landmarken: ein Klassenhistogramm je Wandlinie in M5, nicht in Voxeln.

**Wo Segmentierung kaum oder nicht hilft**

- **Unterzug gegen Wand-Decke-Kante** (belegt): ADE20K-150 hat keine Klasse für Balken oder Sturz, nur column; NYU40 (Hypersim) ebenso.
  - Die Stirnseite eines Unterzugs liest das Netz als Wand, die Unterseite als Decke.
  - Entscheiden muss weiter `istUnterzug` (raumskizze-landmarken.js Z. 462, Schalter Z3).
- **Boden-Wand-Kante:** In A6–A8 liegen Bodenkanten praktisch nie auf echten Wänden (12.1, belegt). Eine Maske behebt die Verdeckung nicht.
- **Voxelkarte oder RGBD-Eingang des Papers:** Wand- und Deckenetiketten landeten in falschen Voxeln, weil die Tiefe dort 80–139 cm daneben liegt (12.1, belegt). Gut ist die Tiefe nur am Parkett mit 2–9 cm, und den Boden nutzt M9 schon (`G.depthFloorFree`).
- **Brüche:** Ohne gemeinsamen Weltrahmen nach ARCore-Brüchen (12.5, 12.8) würden Voxel doppelt oder versetzt angelegt. Die Karte kann das nicht korrigieren.
- **Bildgröße:** Das Paper rechnet auf 160×90. Die Raumskizze arbeitet mit 287×640 hochkant, beschnitten auf 34,6° quer, und mit Linien-Landmarken (Gier, Höhe), die 12.2 als wichtigste Messung des SLAM ausweist.

**Monokulare Tiefe und Normalen**

- **Als Geometriequelle:** in der Doku schon verworfen (belegt). Abschnitt 2 nennt 8–40 % Relativfehler und rund 19° Fehler bei der Wandorientierung, Abschnitt 4 Fehler ≥ 20 cm.
- **Deckenhöhe je Bild** (Hypothese): DA-V2-S relativ, skaliert mit den ARCore-Bodenpunkten, dann gegen H = 2,416 m prüfen. Der erwartete Mehrwert ist klein (abgeleitet):
  - In A8 lag die Kamera 0,20–0,48 m unter der Decke.
  - Mit `bodenKette:false` steigt der Maßstab schon von 0,49 auf 0,96–0,97.
  - Die Doku empfiehlt ohnehin die höchste waagerechte ARCore-Ebene (Z. 945–949).
  - Bilder, die Boden und Decke zugleich zeigen, sind selten.
- **Normalensprung an schwachen Wand-Decke-Kanten** (Luma-Sprung etwa 3 Graustufen): DSINE erreicht auf NYUv2 im Mittel 16,4° und im Median 8,4° Fehler (belegt), ist aber nur nicht-kommerziell nutzbar. MoGe-2 (MIT) wäre die Alternative, ist aber ungeprüft.
- **Abschnitte nach Brüchen verbinden:** nicht direkt. Die Verschiebung in der Lücke (Median 20–34 cm) ist ohne Bilder nicht beobachtbar. Indirekt ginge es über die Bild-Wiedererkennung mit Tiefenprior (MP-SfM). Die Abdeckung liegt aber nur bei 16–21 % der Abschnittspaare, und auf weißen Flächen fehlen die Korrespondenzen. Der Gewinn ist klein und unbelegt.

### 6 Empfohlener kleinster Messaufbau

Die Erfolgskriterien unten sind Vorschläge für Schwellen und nicht aus Quellen abgeleitet. Tobias legt sie vor dem Lauf fest.

**Schritt 0: Daten** (belegt)

- Die Video-TARs enthalten Farbvideo: H.264, 288×640, yuvj420p, 10 fps, 1,5 Mbit/s.
- Bild k gehört zur Zustandszeile mit `v = k`. Zeile 0 ist unten, für die Anzeige also vflip.
- `aufnahme-2026-10-25T14-17-00-513Z-lauf0-video.tar` ist A6 (Stand 3, Doku 10.13).
- Die Zuordnung A7/B1600/B1714 der TARs in ~/Downloads ist nur aus Zeitstempeln abgeleitet. Welche TAR zu A8 gehört, ist offen.
- Vorbehalt: H.264 mit 1,5 Mbit/s ist schlechter als das Live-RGBA.

**Schritt 1: Wahrheit von Hand**

- 30–50 Bilder aus A6, dazu A7, auswählen.
- Die ELSED-O-Segmente etikettieren: echte Wand-Decke-Kante, Schrankoberkante, Tür- oder Fensterrahmen, Unterzug/Sturz, Sonstiges.
- Die Erfassungen in diesen Aufnahmen markieren: richtig oder Fehlrastung.
- Nicht über Orakel-Posen etikettieren: 17 von 19 Abschnitten sind mehrdeutig (12.8).
- Dafür braucht es Tobias' Hand-Etikettierung oder seine Freigabe.

**Schritt 2: Offline auf dem Mac** (ONNX Runtime oder PyTorch, noch nicht installiert)

- Segmentierung, als Obergrenze: SegFormer-B0 ADE20K. Das ist nur als Evaluation zulässig und darf nicht ins Produkt.
- Kommerziell tragfähige Variante: DINOv2-S eingefroren plus linearer Kopf. Der Kopf wird auf eigenen Labels trainiert, eventuell ergänzt um COCO-Stuff (Bilder-Vorbehalt). Hypersim nur mit dem TurboSquid-Vorbehalt.
- Je Segment die Klasse oberhalb und unterhalb der Mitte als Merkmal ablesen.

**Schritt 3: Metrik und Kriterien** (Vorschlag)

- **O-Segmente:** Präzision und Recall für „echte Wand-Decke-Kante“, mit und ohne Maskenfilter. Erfolg: Präzision mindestens +10 Prozentpunkte, Recall höchstens −5 Prozentpunkte.
- **Erfassungen:** Erfolg, wenn mindestens 80 % der Fehlrastungen erkannt werden und höchstens 5 % der richtigen Erfassungen fälschlich verworfen werden.
- **Unterzüge:** getrennt ausweisen. Erwartet wird, dass die Maske sie nicht trennt.
- Die T2-Passung (raumskizze-metrik.mjs) ist kein Kriterium, sie ist mehrdeutig (1,00–1,11).

**Schritt 4: Nur bei Erfolg in Schritt 3**

- Einen Schalter in M3/M5 einbauen (z. B. `klasse.maske`).
- Nachspiel mit raumskizze-karte.mjs (T1) und dem Prüfstand raumskizze-pruefstand.mjs.
- Erfolg: mehr bestätigte Landmarken ohne zusätzliche Fehlwände.

**Schritt 5: Höhenhypothese, optional**

- Für Bilder mit Boden und Decke: die skalierte DA-V2-S-Tiefe zur Decke gegen H = 2,416 m vergleichen, getrennt für A6 13/14 und A8.
- Erfolg: genauer als die höchste waagerechte ARCore-Ebene.

**Schritt 6: Am Pixel 9 Pro**

Eine eigene Testseite, keine Repo-Datei. Transformers.js 4.3.2 in einem Worker, `device:'webgpu'` und zum Vergleich `'wasm'`, mit einem Modell aus Schritt 2 in fp16 und q4f16 bei 287×640.

- **(a) Ohne XR:**
  - `navigator.gpu` im Worker vorhanden.
  - Latenz Median und p90 nach dem Aufwärmen.
  - Ladezeit und Aufwärmzeit.
  - Speicher.
  - Drift über 5 Minuten.
  - Argmax-Übereinstimmung WebGPU gegen WASM, Erfolg bei mindestens 99 %.
- **(b) In immersive-ar mit laufender raumskizze-probe**, eine Inferenz je Erfassung bzw. je Schlüsselbild.
  - Erfolg: p90 je Erfassung höchstens 500 ms (Vorschlag).
  - Gelieferte XR-Bildrate im Median mindestens 29 Bilder/s gegen die Grundlinie 29,9.
  - `ms` p99 im Hauptfaden höchstens 33 ms (12.6).
  - Keine zusätzlichen ARCore-Brüche gegenüber einer Kontrollaufnahme.
  - Dazu `readPixels` bei 861×1920 messen.

Ein Abbruch ist ebenfalls ein Ergebnis: Scheitert (a) oder (b), bleibt die Segmentierung ein reines Offline-Werkzeug zur Auswertung von Aufnahmen.

### 7 Quellen

**Lokale PDFs (paper/)**

- `yang2026_webxr_point_cloud_semantic_segmentation_voxel_fusion_SciRep.pdf`: Yang, Yeh & Tsai, Sci. Rep. 16:33709 (2026), DOI 10.1038/s41598-026-74609-x. Das Supplement (DOCX) liegt nur im Scratchpad.
- `2207.04526_EMSANet_multitask_rgbd_indoor.pdf`
- `2304.07193_DINOv2_robust_visual_features.pdf`
- `2508.10104_DINOv3.pdf`
- `2406.09414_depth_anything_v2.pdf`
- `2403.00712_DSINE_surface_normals_inductive_biases.pdf`
- `2504.20040_MP-SfM_monocular_surface_priors_SfM.pdf`
- `2204.05525_TopFormer_mobile_segmentation_latency_SD865.pdf`
- `2301.13156_SeaFormer_mobile_segmentation_SegFormerB0_latency.pdf`
- `2402.05981_anatomizing_DL_inference_web_browsers_mobile.pdf`
- `2605.20706_LlamaWeb_WebGPU_16_devices_incl_mobile.pdf`

Nicht abgelegt sind SemanticFusion (arXiv 1609.05130), SegFormer (arXiv 2105.15203) und arXiv 2510.25166 (nur als HTML gelesen).

**Lizenzen und Repos**

- github.com/facebookresearch/dinov2 (README, LICENSE, Commit 81b2b641)
- github.com/facebookresearch/dinov3 (LICENSE.md)
- github.com/NVlabs/SegFormer (LICENSE)
- github.com/TUI-NICR/EMSANet
- github.com/apple/ml-hypersim
- blog.turbosquid.com/turbosquid-3d-model-license (§6.d)
- ade20k.csail.mit.edu/terms
- github.com/DepthAnything/Depth-Anything-V2 (README, metric_depth/README)
- github.com/ByteDance-Seed/Depth-Anything-3
- github.com/microsoft/MoGe
- github.com/YvanYin/Metric3D
- github.com/baegwangbin/DSINE
- github.com/facebookresearch/sam2, segment-anything; ai.meta.com/datasets/segment-anything
- Mask2Former MODEL_ZOO.md
- OneFormer LICENSE
- github.com/apple/ARKitScenes
- github.com/nightrome/cocostuff
- princeton-vl/infinigen
- ScanNet TOS
- cs.nyu.edu/~fergus/datasets/nyu_depth_v2.html
- rgbd.cs.princeton.edu
- github.com/alexsax/2D-3D-Semantics
- github.com/tentone/enva-xr
- github.com/mrdoob/three.js
- github.com/huggingface/transformers.js
- github.com/microsoft/onnxruntime
- github.com/google-ar/arcore-android-sdk
- developers.google.com/ar/develop/terms
- HF-API-Lizenz-Tags der genannten Modelle

**Laufzeit**

- huggingface.co/litert-community/DINOv2-ViT-S14-LiteRT
- huggingface.co/qualcomm/Depth-Anything-V2
- developer.chrome.com/blog/new-in-webgpu-121
- mdn/browser-compat-data `api/WorkerNavigator.json`
- registry.npmjs.org (@huggingface/transformers, onnxruntime-web)
- huggingface.co/api/models/…/tree/main/onnx
- developers.googleblog.com (LiteRT.js)
- Fehlberichte: transformers.js #1320 und #1205, onnxruntime #27414, Dawn chromium/7559

**Projekt**

- docs/superpowers/research/2026-10-24-kamera-raumerfassung-android.md, Abschnitte 1–4, 10.13 und 12.1–12.8
- raumskizze-probe.html (Z. 3671, 9142, 9400, 10585 f.)
- raumskizze-landmarken.js (Z. 34, 462, 671, 695)
- raumskizze-segmente.js
- vercel.json
