# Verlegeplan-Revision nach CAM-Literatur — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die weggelassene Fläche zurückholen (`covFails 459/500`, `worstCoverage 4 %`) und die Kopplung zwischen Biegeradius und Deckung messbar machen. **Nicht** in diesem Plan: `radFails` auf 0 — `worstRadius 0` ist eine entartete Spitze und fällt erst mit altem Task 6 (`pathSegments`); `crossFails` fällt erst mit altem Task 2. Dieser Plan liefert Deckung plus die Kennzahl, mit der beide Folge-Tasks überhaupt bewertbar werden.

**Architecture:** Aus der Literaturrecherche ([2026-07-25-verlegemuster-literatur.md](../research/2026-07-25-verlegemuster-literatur.md)) folgt: eine bifilare Kurve hat zwei Enden und **genau eine** 180°-Kehre. Die Kehre braucht `2R = 160 mm` Platz. Heute wird dieser Platz durch Verwerfen ganzer Rücklaufringe geschaffen (`verlegeplan.html:850-854`) — das kostet Ringfläche und ist der gemeinsame Grund für Radius- *und* Deckungsfehler. Der Plan ersetzt das Verwerfen durch **Kürzen**: nur der Ringanfang an der Kehre wird abgetragen, bis die 2R erreicht sind. Vorher wird `gapMax` eingeführt, die Kennzahl, die diesen Handel überhaupt sichtbar macht.

**Tech Stack:** Eine selbst-enthaltene HTML-Datei, Vanilla JavaScript, kein Build, keine Dependencies. Verifikation über `node bench.mjs` und die Selbstchecks im Browser.

> **Zeilennummern sind Stand 2026-07-25, HEAD `3b8011e`.** Während dieses Plans hat eine parallele Sitzung `verlegeplan.html` geändert (`a7d3927`, `fa989c7`, `3b8011e`) und die Nummern innerhalb von `doubleSpiralField` um +24 verschoben. **Maßgeblich ist immer der zitierte Codeblock, nicht die Zahl** — vor jeder Änderung mit `grep -n` neu bestimmen.

## Global Constraints

- Genau **eine** Produktionsdatei: `verlegeplan.html`. Kein Server, keine externen Bibliotheken, kein Build.
- Biegeradius ist **keine Einstellung**: fix `5 × pipeDia` (bei 16 mm → 80 mm), abgeleitet über den Getter in `S` (`verlegeplan.html:232`).
- Bahnabstand nur **75–110 mm** (Vorgabe Auftraggeber, bestätigt am 2026-07-25).
- Verteiler muss **an jeder Wand** platzierbar bleiben, inklusive der Notch-Innenkanten.
- Harte Bench-Kriterien, alle vier gleichzeitig: **0 Kreuzungen**, **kein Rohr außerhalb des Raums**, **Deckung ≥ 40 %**, **Biegeradius nie unter 5 × Ø**.
- Bench variiert die Raummaße **±50 %** um 8000 × 3200 mm.
- Deutsche UI-Texte und Code-Kommentare. Commit-Messages auf Englisch.
- Jede Änderung wird **gemessen**, bevor sie behalten wird. Verschlechtert eine Änderung eine Kennzahl, wird sie zurückgenommen und der Grund im Code dokumentiert.

---

## Offene Entscheidung — vor Task 2 klären

**Die Kehre hinterlässt zwangsläufig eine Lücke von 160 mm an einer Stelle.**

Topologisch unvermeidbar: die Kurve muss an genau einem Ort um 180° umkehren, und ein Bogen mit `R = 80` braucht dort `2R = 160 mm` Abstand zwischen Ein- und Auslauf. Das ist kein Bahnabstand — es ist eine einzelne Stelle an der Ringnaht.

| Variante | Flächenverlust | Status |
|---|---|---|
| **Heute:** ganzen innersten Rücklaufring verwerfen | volle Ringfläche, bei 8000 × 3200 in der Größenordnung m² | im Code, `:850-854` |
| **Task 2:** nur den Ringanfang bis 2R kürzen | ein Streifen von ~160 mm Länge an der Naht | dieser Plan |
| Bahnabstand auf ≥ 160 mm anheben | keiner, aber Klammer 75–110 verletzt | verworfen, Vorgabe Auftraggeber |

Task 2 geht unter der Annahme vor, dass **eine** 160-mm-Lücke an der Naht fachlich in Ordnung ist — in der Baupraxis ist genau das die Kehre am Schlaufenende. Die exakte Zahl wird in Task 2, Step 6 gemessen und ausgewiesen. Widerspricht der Auftraggeber, bleibt nur das Anheben des Bahnabstands, und die Kriterien `minR ≥ 80` und `s ≤ 110` sind nicht gleichzeitig erfüllbar.

**Nebenbedingung, außerhalb des Codes:** `5 × Ø` ist die **Untergrenze** der Herstellerpraxis. Für PE-RT nennen einzelne Hersteller bis `20 × Ø` (bei 16 mm also 320 mm). Der Bench streut `pipeDia` über `[12,14,16,17,20]`, `2R` liegt damit zwischen 120 und 200 mm — immer über dem erlaubten Bahnabstand. Vor der Ausführung des Plans den konkreten Rohrtyp prüfen: bei `8 × Ø` verdoppelt sich die Kehrenlücke und die Entscheidung oben muss neu gestellt werden.

---

## Stand des Vorgänger-Plans (verifiziert am 2026-07-25)

Dieses Dokument revidiert [2026-07-25-verlegeplan-perfektionierung.md](2026-07-25-verlegeplan-perfektionierung.md). Der Umsetzungsstand wurde per `grep -c` gegen `verlegeplan.html` geprüft, nicht angenommen:

| Alter Task | Symbol | Treffer | Status | Entscheidung |
|---|---|---|---|---|
| 0 — Bench headless | `bench.mjs` | Datei existiert | **fertig** | Behalten. Der reale Runner ist besser als der Plan-Entwurf: er vergleicht **Raten** mit 0,05 Toleranz, prüft alle vier Kriterien und weist eine beschädigte oder unvollständige Baseline mit Exit 1 ab. |
| 1 — Deckung im Eikonal-Feld | `spacingAt` Rampe | `:594-615` vorhanden | **fertig** | Behalten. |
| 2 — Randzone im Feld auflösen | `randSeparat` | 0 | offen | **Behalten, unverändert gültig.** Nach Task 2 dieses Plans ausführen. |
| 3 — Verteiler als Quelle | `eikonalField(…,source)` | Signatur `:562` ohne `source` | offen | **Gated.** Erst Task 3 dieses Plans messen — Held zeigt, dass randnahe Startpunkte alle Qualitätsparameter verschlechtern. ⚠️ **Koordination:** `fa989c7` zeigt, dass eine parallele Sitzung den alten Plan sequenziell abarbeitet und dort Task 1 gerade fertig wurde. Nächster Schritt dort ist alter Task 2, dann alter Task 3 — also genau der gegatete. Die Gate-Entscheidung muss diese Sitzung erreichen, sonst wird sie überholt. |
| 4 — Kreise durch Kurvenschnitt | `splitByLength` | 0 | offen | **Zurückgestellt** bis die Kehre steht. Ein Schnitt durch eine Kurve, die in der Mitte Ringe verwirft, erbt den Fehler. |
| 5 — Anbindeleitungen als Isolinien | `fieldOnlyLeads` | 0 | offen | **Zurückgestellt**, hängt an altem Task 3. |
| 6 — Tangentenstetige Segmente | `pathSegments` | 0 | offen | **Behalten, unverändert gültig.** Einziger Fillet-Mechanismus; Helds Priority-Queue-Variante nur als Rückfallebene, falls `pathSegments` den Radius nicht hält. |
| 7 — Permalink + Debug-Layer | `configToQuery` | 0 | offen | **Behalten**, Diagnosehilfe. Reihenfolge frei. |

## Baseline (gemessen, `bench-baseline.json`, 500 Läufe)

| Kennzahl | Wert | Rate |
|---|---|---|
| crossFails | 500 | 1,000 |
| covFails | 459 | 0,918 |
| radFails | 500 | 1,000 |
| outFails | 184 | 0,368 |
| worstCoverage | 4 % | — |
| worstRadius | 0 mm | — |

## File Structure

Alles bleibt in `verlegeplan.html`; `bench.mjs` bekommt eine Kennzahl dazu.

| Abschnitt | Zeilen (aktuell) | Änderung durch diesen Plan |
|---|---|---|
| Feld & Isolinien | `eikonalField` 562, `spacingAt` 594, `isoContours` 482 | Task 3 (nur Messung) |
| Spiralerzeugung | `doubleSpiralField` 759 | **Task 2** (Kern) |
| Prüfung | `heatCoverage` 2344, `crossingBench` 2564, `selfChecks` 2174 | **Task 1** |
| Bench-Runner | `bench.mjs` 40-58 | **Task 1** |

---

### Task 1: `gapMax` als fünfte Kennzahl, Bench-Kette verifizieren

Die Deckung sagt „32 % der Fläche sind warm", aber nicht **wo** die Lücke ist und wie groß sie an der schlimmsten Stelle wird. Genau das ist die Kennzahl, die den Handel in Task 2 messbar macht. `gapMax` ist der Abstand des ungünstigsten Bodenpunkts zur nächsten Bahn, verdoppelt: bei sauberer Verlegung mit Bahnabstand `s` liegt jeder Punkt höchstens `s/2` von einer Bahn entfernt, `gapMax ≈ s`. Ein verworfener Ring treibt den Wert auf ein Vielfaches.

**Files:**
- Modify: `verlegeplan.html` — neue Funktion vor `heatCoverage` (2344), Selbstcheck in `selfChecks` (2174), Feld in `crossingBench` (2564)
- Modify: `bench.mjs` — Kennzahl in `out` (40-58)

**Interfaces:**
- Consumes: `S.W`, `S.H`, `S.notchA`, `S.notchB`, `hasNotch()`, `notchX()` — alle vorhanden
- Produces: `gapMax(loops)` → `number` (mm). `loops` ist ein Array von Objekten mit `pts: Array<{x,y}>`, identisch zum Parameter von `heatCoverage`. `crossingBench`-Fehlschläge bekommen das Feld `gap`. `bench.mjs` gibt `worstGap` aus.

- [ ] **Step 1: Selbstcheck schreiben**

In `selfChecks()` einfügen, direkt vor dem Kreuzungs-Bench:

```javascript
  // gapMax: eine einzige Bahn quer durch die Raummitte. Der ungünstigste
  // GEMESSENE Punkt liegt step/2 = 25 von der Wand, also 500-25 = 475 von der
  // Bahn entfernt -> gapMax = 950. Prüft Faktor 2, Rasterlage und Vorzeichen.
  {
    const sW=S.W,sH=S.H,sA=S.notchA,sB=S.notchB;
    S.W=1000; S.H=1000; S.notchA=0; S.notchB=0;
    const g=gapMax([{pts:[{x:0,y:500},{x:1000,y:500}]}]);
    S.W=sW; S.H=sH; S.notchA=sA; S.notchB=sB;
    A(`gapMax misst die größte Lücke (${Math.round(g)} mm)`, Math.abs(g-950)<=50);
  }
```

- [ ] **Step 2: Test ausführen und Fehlschlag sehen**

Datei im Browser laden (`verlegeplan.html?v=1`), Konsole öffnen.
Expected: `ReferenceError: gapMax is not defined` — die Selbstchecks brechen an dieser Stelle ab.

- [ ] **Step 3: `gapMax` implementieren**

Direkt **vor** `function heatCoverage(loops,reach){` (Zeile 2344) einfügen:

```javascript
// Größte unbelegte Lücke im Raum, in mm. Abstand des ungünstigsten Bodenpunkts
// zur nächsten Bahn, verdoppelt: bei Bahnabstand s liegt jeder Punkt höchstens
// s/2 entfernt, gapMax ist dann ~s. Ein weggelassener Ring treibt den Wert auf
// ein Vielfaches. Die Deckung allein zeigt das nicht — sie summiert, wo diese
// Kennzahl den schlimmsten Ort nennt.
function gapMax(loops){
  const segs=[];
  loops.forEach(l=>{ const p=l.pts||[];
    for(let i=0;i<p.length-1;i++){
      const a=p[i],b=p[i+1];
      segs.push({a,b,minx:Math.min(a.x,b.x),maxx:Math.max(a.x,b.x),
                 miny:Math.min(a.y,b.y),maxy:Math.max(a.y,b.y)});
    }});
  if(!segs.length) return Infinity;
  const step=50;                       // groesser als heatCoverage: reine Diagnose
  const inRoom=(x,y)=>!(hasNotch()&&x>notchX()&&y>S.H-S.notchB);
  let worst=0;
  for(let y=step/2;y<S.H;y+=step)for(let x=step/2;x<S.W;x+=step){
    if(!inRoom(x,y)) continue;
    let best=Infinity;
    for(const s of segs){
      // Bounding-Box-Vorpruefung: liegt die Box schon weiter weg als der bisher
      // beste Treffer, kann das Segment nicht naeher sein. Ohne diese Zeile ist
      // die Kennzahl bei 500 Bench-Laeufen zu langsam (kein early-out wie in
      // heatCoverage moeglich, dort bricht die Schleife beim ersten Treffer ab).
      const bx=x<s.minx?s.minx-x:x>s.maxx?x-s.maxx:0;
      const by=y<s.miny?s.miny-y:y>s.maxy?y-s.maxy:0;
      if(bx*bx+by*by>=best) continue;
      const dx=s.b.x-s.a.x, dy=s.b.y-s.a.y, l2=dx*dx+dy*dy||1;
      let t=((x-s.a.x)*dx+(y-s.a.y)*dy)/l2; t=t<0?0:t>1?1:t;
      const ex=s.a.x+t*dx-x, ey=s.a.y+t*dy-y;
      const d2=ex*ex+ey*ey; if(d2<best) best=d2;
    }
    if(best>worst) worst=best;
  }
  return 2*Math.sqrt(worst);
}
```

- [ ] **Step 4: Test ausführen und Erfolg bestätigen**

Datei neu laden (`verlegeplan.html?v=2`).
Expected: `PASS gapMax misst die größte Lücke (950 mm)`.

- [ ] **Step 5: Kennzahl in `crossingBench` mitschreiben**

In `crossingBench` (2564) zwei Stellen ändern. Erstens die Messzeile

```javascript
    let plan,x=0,cov=0,outside=0;
    try{ plan=autofit(); x=loopCrossings(plan); outside=loopsOutside(plan);
         cov=heatCoverage(plan.loops,25); }
```

ersetzen durch:

```javascript
    let plan,x=0,cov=0,outside=0,gap=0;
    try{ plan=autofit(); x=loopCrossings(plan); outside=loopsOutside(plan);
         cov=heatCoverage(plan.loops,25); gap=gapMax(plan.loops); }
```

Zweitens im Fehlschlag-Eintrag die Zeile

```javascript
      minR:isFinite(minR)?Math.round(minR):null, radSoll:S.bendRadius,
```

ersetzen durch:

```javascript
      minR:isFinite(minR)?Math.round(minR):null, radSoll:S.bendRadius,
      // gapMax liefert Infinity, wenn ein Kreis keine Segmente hat -> null.
      gap:isFinite(gap)?Math.round(gap):null,
```

Die Fehlschlag-**Bedingung** `if(x>0||outside>0||covFail||radFail)` bleibt unverändert: `gap` ist eine Diagnose-Kennzahl, die vier harten Kriterien bleiben vier.

- [ ] **Step 6: Kennzahl in `bench.mjs` ausgeben**

In `bench.mjs`, im `out`-Objekt nach `worstRadius` (Zeile 49):

```javascript
  // Diagnose, kein Gate: worstGap zeigt, ob Radius-Gewinne mit Flaeche bezahlt
  // werden. Bewusst NICHT in RATE_KEYS - die vier harten Kriterien bleiben vier.
  worstGap: Math.max(...fails.map(f => f.gap ?? 0), 0),
```

- [ ] **Step 7: Bench-Kette verifizieren**

Run: `node bench.mjs 60`
Expected: JSON auf stdout mit dem neuen Schlüssel `worstGap` und einem Wert deutlich über `S.s` (100) — das ist der Nachweis, dass heute Fläche fehlt. Exit-Code 0, weil die Raten sich nicht verschlechtern.

Zusätzlich prüfen, dass das Gate lebt:

Run: `node -e "const f='bench-baseline.json',fs=require('fs'),o=JSON.parse(fs.readFileSync(f,'utf8'));delete o.radFailRate;fs.writeFileSync(f,JSON.stringify(o,null,1))" && node bench.mjs 60; echo "exit=$?"`
Expected: `bench-baseline.json fehlt Schlüssel: radFailRate` auf stderr und `exit=1`. Danach mit `git checkout bench-baseline.json` wiederherstellen.

- [ ] **Step 8: Commit**

```bash
git add verlegeplan.html bench.mjs
git commit -m "test: gapMax reports the worst uncovered gap as a diagnostic metric"
```

---

### Task 2: Kehre kürzen statt Ring verwerfen

Der Kern. `doubleSpiralField` schafft die `2R` für die 180°-Kehre heute, indem es ganze innerste Rücklaufringe verwirft (`:850-854`). Der Flächenverlust ist die Ringfläche. Stattdessen wird nur der **Anfang** des innersten Rücklaufrings abgetragen, bis der Abstand zur Einlaufspitze `2R` erreicht — der Verlust schrumpft auf einen Streifen an der Naht.

**Files:**
- Modify: `verlegeplan.html` — `doubleSpiralField` (759), Block `:850-854`

**Interfaces:**
- Consumes: `S.bendRadius`, `len`, `sub` — alle vorhanden. `pts` ist der bis dahin aufgebaute Vorlauf, `back` ein Array von Ringen (Punktlisten), beides lokal in `doubleSpiralField`.
- Produces: keine neue Signatur. `doubleSpiralField(poly,insOf,s,gate)` liefert weiterhin `Array<{x,y}>`. Neu ist das Diagnosefeld `S._turnGap` → `number` (mm, `Infinity` wenn keine Kehre entsteht): der erreichte Abstand an der einen 180°-Kehre. Wird von Task 2 Step 1 geprüft und von Step 6 berichtet.

- [ ] **Step 1: Selbstcheck für die Kehre schreiben**

In `selfChecks()` nach dem `gapMax`-Check einfügen:

```javascript
  // Die 180°-Kehre braucht 2R zwischen Ein- und Auslauf, sonst kann dort kein
  // Bogen mit R=5xØ liegen. Geprüft wird GENAU diese eine Stelle über den in
  // doubleSpiralField hinterlegten Wert. Nicht über den minimalen Abstand
  // beliebiger Punktpaare des Pfades: Punkte benachbarter RINGE liegen s (75-110)
  // auseinander, ein solcher Check wäre unabhängig vom Code immer rot.
  {
    autofit();
    const g=S._turnGap;
    A(`Kehre haelt 2R Abstand (${g==null?'nicht gesetzt':Math.round(g)+' von '+2*S.bendRadius+' mm'})`,
      g!=null && g>=2*S.bendRadius-1);
  }
```

- [ ] **Step 2: Test ausführen und Fehlschlag sehen**

Datei neu laden (`verlegeplan.html?v=3`).
Expected: `FAIL Kehre haelt 2R Abstand (nicht gesetzt)` — `S._turnGap` wird erst in Step 4 geschrieben. Der Check ist damit ein echter roter Test, nicht bloß eine Dokumentation.

- [ ] **Step 3: Ist-Werte vor der Änderung festhalten**

In der Browser-Konsole:

```javascript
JSON.stringify((()=>{const p=autofit();return{
  cross:loopCrossings(p), out:loopsOutside(p),
  cov:Math.round(heatCoverage(p.loops,25)*100),
  gap:Math.round(gapMax(p.loops)),
  minR:Math.round(Math.min(...p.loops.map(l=>l.minR))),
  m:(p.loops.reduce((a,l)=>a+l.length,0)/1000).toFixed(1)};})());
```

Die vier Zahlen `cross`, `cov`, `gap`, `minR` im Commit von Step 8 wörtlich zitieren.

- [ ] **Step 4: Verwerfen durch Kürzen ersetzen**

In `doubleSpiralField` den Block

```javascript
  const R2=2*S.bendRadius;
  while(pts.length>1 && back.length>1 && back[0].length &&
        len(sub(pts[pts.length-1],back[0][0]))<R2){
    back=back.slice(1);
  }
```

ersetzen durch:

```javascript
  // Die Kehre braucht 2R zwischen Einlaufspitze und Auslaufanfang. Statt den
  // ganzen innersten Ruecklaufring zu verwerfen wird nur sein ANFANG abgetragen:
  // entlang des Rings waechst der Abstand zur Einlaufspitze, und der Verlust
  // schrumpft von der vollen Ringflaeche auf einen Streifen an der Naht.
  // Verworfen wird ein Ring nur noch, wenn er dabei aufgebraucht wird.
  const R2=2*S.bendRadius;
  while(pts.length>1 && back.length>1 && back[0].length>2 &&
        len(sub(pts[pts.length-1],back[0][0]))<R2){
    back[0]=back[0].slice(1);
    if(back[0].length<=2) back=back.slice(1);
  }
  // Erreichten Kehrenabstand hinterlegen: der Selbstcheck und die A/B-Messung
  // brauchen genau diesen einen Wert, und von aussen ist die Stelle im flachen
  // Rueckgabe-Array nicht mehr identifizierbar.
  S._turnGap = (back.length && back[0].length)
    ? len(sub(pts[pts.length-1],back[0][0])) : Infinity;
```

- [ ] **Step 5: Selbstchecks ausführen**

Datei neu laden (`verlegeplan.html?v=4`).
Expected: `PASS Kehre haelt 2R Abstand (160 von 160 mm)` — oder ein Wert darüber. Zusätzlich weiterhin `PASS gapMax misst die größte Lücke`. Keine neuen FAIL.

- [ ] **Step 6: A/B messen**

Dieselbe Konsolen-Abfrage wie Step 3 erneut ausführen, plus `S._turnGap`.
Expected: `gap` **deutlich kleiner** als in Step 3, `cov` gleich oder höher, `minR` nicht schlechter, `cross` nicht schlechter. Die verbleibende `gap` ist die Kehrenlücke aus der offenen Entscheidung oben — den Wert dort nachtragen.

Bleibt `gap` unverändert, greift die Kürzung nicht weit genug. Wahrscheinliche Ursache ist die **Punktdichte**, nicht die Ringzahl: `simplify(c,Math.max(2,step*0.15))` bei `:800` lässt etwa 5 mm Punktabstand stehen, eine 160-mm-Lücke braucht also rund 30 Durchläufe. Ein kurzer innerer Ring ist vorher aufgebraucht und fällt auf das alte Verwerfen zurück. Dann `back[0]` vor der Schleife entlang der Bogenlänge auf 2R trimmen statt punktweise, oder die `simplify`-Toleranz für innere Ringe anheben.

- [ ] **Step 7: Bench gegen Baseline**

Run: `time node bench.mjs 500`
Expected: Exit-Code 0, `covFails` und `worstGap` gesunken. Die Laufzeit mitschreiben — `gapMax` läuft auf allen 500 Läufen ohne Early-Out (anders als `heatCoverage`, das beim ersten Treffer abbricht). Steigt die Laufzeit über etwa das Doppelte, in `gapMax` `step` von 50 auf 75 anheben und im Kommentar begründen.

Bei `REGRESSION` die Änderung zurücknehmen und den gemessenen Grund als Kommentar an der Stelle festhalten — nicht überschreiben.

- [ ] **Step 8: Commit**

```bash
git add verlegeplan.html
git commit -m "fix: turnaround trims the inner ring instead of dropping it"
```

---

### Task 3: Verteiler als Quelle — messen, bevor gebaut wird

Alter Task 3 will den Verteiler zur Quellrandbedingung des Eikonal-Feldes machen. Held & Spielberger zeigen über 290 Taschen, dass ein randnaher Startpunkt Stepover-Variation, maximale Krümmung und Pfadlänge **alle** monoton verschlechtert — und der Verteiler liegt per Definition an einer Wand. Ob das auf eine Eikonal-Randbedingung überträgt, ist eine Annahme. Dieser Task macht daraus eine Messung, bevor der Umbau Aufwand kostet.

**Files:**
- Modify: `verlegeplan.html` — `eikonalField` (562), nur für die Dauer der Messung

**Interfaces:**
- Consumes: `snappedManifold()` (1394), `rotFwd`, `S.useEikonal`
- Produces: `eikonalField(poly,insOf,step,sAt,source)` — fünfter optionaler Parameter. Ist er gesetzt, gilt dort `φ = 0`. Ohne `source` verhält sich die Funktion unverändert.

- [ ] **Step 1: Selbstcheck schreiben**

```javascript
  // Mit Quelle muss das Feld am Verteiler sein Minimum haben: von dort wachsen
  // die Niveaus nach aussen. Ohne Quelle ist die Randbahn phi=0 und die Niveaus
  // wachsen nach innen. Der Check trennt die beiden Faelle.
  {
    const poly=[{x:0,y:0},{x:4000,y:0},{x:4000,y:3000},{x:0,y:3000}];
    const src={x:2000,y:0};
    const F=eikonalField(poly,()=>100,50,()=>100,src);
    const at=(x,y)=>{
      const i=Math.round((x-F.x0)/F.step), j=Math.round((y-F.y0)/F.step);
      return F.d[j*F.nx+i];
    };
    A('Feld waechst vom Verteiler weg', at(2000,200)>=0 && at(2000,2500)>at(2000,200));
  }
```

- [ ] **Step 2: Test ausführen und Fehlschlag sehen**

Datei neu laden (`verlegeplan.html?v=5`).
Expected: FAIL — `eikonalField` hat bei `:562` nur vier Parameter, `src` wird ignoriert und beide Abfragen liefern denselben Verlauf.

- [ ] **Step 3: Quellrandbedingung implementieren**

Signatur bei `:562` erweitern:

```javascript
function eikonalField(poly,insOf,step,sAt,source){
```

und die Startwert-Zeile `:569`

```javascript
  for(let k=0;k<d.length;k++) if(inside[k]&&d[k]<step) phi[k]=0;
```

ersetzen durch:

```javascript
  // Ohne Quelle: die Randbahn ist phi=0, die Niveaus wachsen nach innen
  // (konzentrisch). Mit Quelle: nur der Verteilerpunkt ist phi=0 und die Niveaus
  // wachsen von dort — die Zuleitung waere dann die erste Isolinie statt einer
  // separat gerouteten Leitung.
  if(source){
    const si=Math.round((source.x-x0)/step), sj=Math.round((source.y-y0)/step);
    const sk=sj*nx+si;
    if(sk>=0&&sk<phi.length&&inside[sk]) phi[sk]=0;
    else for(let k=0;k<d.length;k++) if(inside[k]&&d[k]<step) phi[k]=0;
  }else{
    for(let k=0;k<d.length;k++) if(inside[k]&&d[k]<step) phi[k]=0;
  }
```

- [ ] **Step 4: Test ausführen und Erfolg bestätigen**

Datei neu laden (`verlegeplan.html?v=6`).
Expected: `PASS Feld waechst vom Verteiler weg`.

- [ ] **Step 5: A/B messen — das ist der Zweck des Tasks**

In `doubleSpiralField` (759) den Aufruf bei `:785` versuchsweise mit Quelle versehen, dann in der Konsole:

```javascript
JSON.stringify((()=>{const r={}; const save=S.useEikonal; S.useEikonal=true;
  for(const v of [false,true]){ S.fieldSource=v;
    const p=autofit();
    r[v?'mitQuelle':'ohneQuelle']={cross:loopCrossings(p), out:loopsOutside(p),
      cov:Math.round(heatCoverage(p.loops,25)*100),
      gap:Math.round(gapMax(p.loops)),
      minR:Math.round(Math.min(...p.loops.map(l=>l.minR)))};
  } S.fieldSource=false; S.useEikonal=save; return r;})());
```

Dafür im State-Objekt ergänzen:

```javascript
  fieldSource:false,        // Verteiler als Quellrandbedingung (Task 3, Messung)
```

und in `doubleSpiralField` bei `:785`:

```javascript
  const F=useEik?eikonalField(poly,insOf,step,spacingAt,
                              S.fieldSource?rotFwd(snappedManifold(),S.W,S.H):null)
                :zoneField(poly,insOf,step);
```

Expected — und hier liegt die Entscheidung:
- `mitQuelle` besser oder gleich in `cross`, `gap`, `minR` → alter Task 3 ist gerechtfertigt, `fieldSource:true` setzen, alte Tasks 4 und 5 freigeben.
- `mitQuelle` schlechter → Helds Befund überträgt. `fieldSource:false` behalten, alte Tasks 3, 4 und 5 in „Verworfene Ansätze" mit den gemessenen Zahlen eintragen und stattdessen den Fermat-Weg planen (beide Enden am Rand, ohne dass der Verteiler Quelle ist).

- [ ] **Step 6: Bench**

Run: `node bench.mjs 500`
Expected: Exit-Code 0. Der Flag-Default entscheidet, welcher Zweig gemessen wird — er bleibt auf dem in Step 5 gewonnenen Wert.

- [ ] **Step 7: Commit**

```bash
git add verlegeplan.html
git commit -m "feat: optional manifold source in the eikonal field, measured A/B"
```

---

### Task 4: Nachweis und Dokumentation

**Files:**
- Modify: `bench-baseline.json`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-25-verlegeplan-perfektionierung.md`

- [ ] **Step 1: Vollen Bench fahren**

Run: `node bench.mjs 500`
Expected: `covFails` und `worstGap` unter der Baseline. `crossFails` und `radFails` bleiben voraussichtlich hoch — sie fallen erst mit altem Task 6 (`pathSegments`) und altem Task 2 (Randzone im Feld). Das ist erwartet und kein Fehlschlag dieses Plans.

- [ ] **Step 2: Baseline auf den erreichten Stand setzen**

Run: `node bench.mjs 500 --save-baseline`
Expected: `bench-baseline.json` enthält den neuen Stand einschließlich `worstGap`.

- [ ] **Step 3: Ergebnis in den Vorgänger-Plan eintragen**

In `2026-07-25-verlegeplan-perfektionierung.md`, Abschnitt „Verworfene Ansätze", die Zeile ergänzen:

```markdown
| Innersten Rücklaufring verwerfen, um 2R für die Kehre zu schaffen | ersetzt durch Kürzen des Ringanfangs; gapMax <alt> -> <neu> mm, Deckung <alt> -> <neu> % |
```

Und, falls Task 3 gegen die Quelle ausgefallen ist, zusätzlich:

```markdown
| Verteiler als Quellrandbedingung im Eikonal-Feld | gemessen: <Zahlen>. Deckt Held & Spielberger — randnahe Startpunkte verschlechtern Stepover-Variation, Krümmung und Länge monoton |
```

- [ ] **Step 4: README auf den Stand bringen**

Im Abschnitt „Stand" aufnehmen: die fünf Kennzahlen, die Zahl der Läufe, dass `node bench.mjs 500` reproduzierbar ist, und dass `gapMax` eine Diagnose- und keine Gate-Kennzahl ist.

- [ ] **Step 5: Commit**

```bash
git add bench-baseline.json README.md docs/superpowers/plans/2026-07-25-verlegeplan-perfektionierung.md
git commit -m "test: new baseline with gapMax; record the ring-drop replacement"
```

---

## Verworfene Ansätze

Ergänzt die Liste im Vorgänger-Plan. Beide Einträge stammen aus der Literaturrecherche, nicht aus einer Messung — sie sind hier festgehalten, damit sie nicht erneut geplant werden.

| Ansatz | Grund |
|---|---|
| **Spine-Seed:** `φ = 0` auf der Medialachse statt am Rand, damit die Kehre an die Wand wandert | Verlegt die Kehre tatsächlich an den Rand, aber dann liegen **beide Pfadenden** am Spine in der Raummitte und der Verteiler an der Wand ist nur über genau die Zuleitungen erreichbar, die heute die meisten Kreuzungen erzeugen. Topologisch: eine bifilare Kurve hat zwei Enden und eine Kehre; man kann die Enden an den Rand legen **oder** die Kehre, nicht beides. Fermat-Spiralen wählen die Enden — deshalb sitzt dort die Kehre in der Mitte. |
| **Voronoi-Bridge für den Notch** (Held, Abschnitt 3.3) | Setzt eine mehrfach zusammenhängende Fläche voraus, also echte Inseln. Unser L-Raum ist ein einfach zusammenhängendes Polygon — der Notch ist eine konkave Randkante, kein Loch. Die vorhandene Zerlegung in Rechtecke (`rectsFrame` 326) entspricht bereits Helds Split-Curve-Kriterium für ein L (Schnitt senkrecht zum Rand an der konkaven Ecke). |
| **Klothoiden für G²-Übergänge** | Alter Task 6 (`pathSegments`) erreicht G¹ mit Bogen und Gerade. G² ist erst begründet, wenn der Radius bei 80 mm steht und die Kennzahlen dann noch klemmen. Bis dahin YAGNI. |

## Hebel in Reserve — bewusst nicht eingeplant

Aus der Literatur, aber erst begründet, wenn Task 2 gemessen ist. Ohne Messbedarf sind es Änderungen ins Blaue.

| Hebel | Eingriff | Bedingung fürs Ziehen |
|---|---|---|
| **Stepover-Reserve `δ′ = 0,95·δ`** (Held) | `verlegeplan.html:786`, `const lvl=useEik?1:s;` → Faktor 0,95 | Nur wenn nach Task 2 `gapMax` noch über `1,1 × s` liegt. Kostet Rohrlänge; erst ziehen, wenn die Lücke nicht schon durch das Kürzen verschwindet. |
| **Pocket-Decomposition nach Zielfunktion** (Held, Gl. 3-4, `µ = 0,8`, `ν = 0,5`) | ersetzt `partition` (1143) | Nur wenn `gapMax` an der Notch-Engstelle klemmt — das ist die dokumentierte Schwachstelle der PDE-Familie (Isolinien laufen an Bottlenecks ungleichmäßig). Vorher `gapMax` je Rechteck getrennt messen, um die Stelle zu belegen. |
| **Conformal Slit Mapping** (arXiv:2309.10655) | ersetzt `eikonalField` vollständig | Nur wenn Decomposition scheitert. Größter Umbau des ganzen Projekts, dafür ohne Teilgebiets-Zerlegung. Nicht ohne Volltext-Lektüre beginnen. |

## Reihenfolge und Abhängigkeiten

Task 1 zuerst — ohne `gapMax` ist Task 2 nicht bewertbar. Dann Task 2 (der Kern). Task 3 ist eine Entscheidungsmessung und blockiert die alten Tasks 4 und 5; er kann parallel zu Task 2 laufen, weil er eine andere Funktion anfasst. Task 4 schließt ab.

Danach aus dem Vorgänger-Plan weiter: alter Task 6 (`pathSegments`, treibt `radFails`), dann alter Task 2 (Randzone im Feld, treibt `crossFails`), dann je nach Ergebnis von Task 3 die alten Tasks 4 und 5. Alter Task 7 jederzeit, sobald die Diagnose zäh wird.
