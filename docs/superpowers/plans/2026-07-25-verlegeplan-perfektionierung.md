# Verlegeplan-Perfektionierung — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Verlegeplaner so umbauen, dass Kreuzungsfreiheit, Bahnabstand, Biegeradius und Verteileranbindung aus der Konstruktion folgen statt nachträglich geprüft und repariert zu werden — bis der Bench über 500 Zufallsläufe sauber ist.

**Architecture:** Heute entstehen Feld, Randzone und Anbindeleitungen in getrennten Schritten und werden danach zusammengefügt; jede Naht ist eine Fehlerquelle. Der Plan führt sie auf **ein** Skalarfeld zurück (Eikonal-Gleichung mit ortsabhängiger Geschwindigkeit und dem Verteiler als Quelle), dessen Isolinien alle Rohrbahnen sind. Niveaulinien desselben Feldes schneiden sich nie — Kreuzungsfreiheit wird damit zur Eigenschaft, nicht zum Testergebnis. Der Rohrpfad wird zusätzlich von einer Punktliste auf eine Folge tangentenstetiger Segmente (Gerade/Bogen) umgestellt, wodurch der Biegeradius konstruktiv garantiert ist.

**Tech Stack:** Eine selbst-enthaltene HTML-Datei, Vanilla JavaScript, kein Build, keine Dependencies. Messung und Verifikation über die eingebaute Bench-Funktion im Browser sowie `node --check` für Syntax.

## Global Constraints

- Genau **eine** Datei: `verlegeplan.html`. Kein Server, keine externen Bibliotheken, kein Build.
- Biegeradius ist **keine Einstellung**: fix `5 × pipeDia` (bei 16 mm → 80 mm), abgeleitet über den Getter in `S`.
- Bahnabstand nur **75–110 mm**. Werte darüber oder darunter sind fachlich unsinnig.
- Verteiler muss **an jeder Wand** platzierbar bleiben, inklusive der Notch-Innenkanten.
- Harte Bench-Kriterien, alle vier gleichzeitig: **0 Kreuzungen**, **kein Rohr außerhalb des Raums**, **Deckung ≥ 40 %**, **Biegeradius nie unter 5 × Ø**.
- Bench variiert die Raummaße **±50 %** um 8000 × 3200 mm.
- Deutsche UI-Texte und Code-Kommentare. Commit-Messages auf Englisch.
- Jede Änderung wird **gemessen**, bevor sie behalten wird. Verschlechtert eine Änderung eine Kennzahl, wird sie zurückgenommen und der Grund im Code dokumentiert.

## Ausgangslage (gemessen, Stand dieses Plans)

| Kennzahl | Standardkonfiguration | Bench (60 Läufe) |
|---|---|---|
| Kreuzungen | 34 | 60/60 verletzt |
| Rohr außerhalb | 0 | — |
| Deckung | 32 % | 54/60 unter 40 % |
| Biegeradius (min) | 34 mm von 80 mm gefordert | 60/60 verletzt |

Biegeradius je Pfadteil: `leadIn` 80, `leadOut` 80, `rand` 80, `field` 62 — der Gesamtwert von 34 entsteht an den **Nahtstellen zwischen** den Teilen.

Physikalische Obergrenze der Deckung bei Wirkzone ±25 mm: `2 × 25 / s`. Also 67 % bei s=75, 50 % bei s=100, 45 % bei s=110. Das Ziel von 40 % ist im erlaubten Bereich überall erreichbar.

## File Structure

Alles bleibt in `verlegeplan.html`. Die Datei ist bereits in klar getrennte Abschnitte gegliedert; der Plan arbeitet innerhalb dieser Struktur:

| Abschnitt | Zeilen (aktuell) | Verantwortung | Änderung durch diesen Plan |
|---|---|---|---|
| Feld & Isolinien | `zoneField` 592, `eikonalField` 548, `spacingAt` 578, `isoContours` | Skalarfeld und Niveaulinien | Task 1, 2, 3 |
| Spiralerzeugung | `doubleSpiralField` 735, `spiralPasses` 649, `windingField` 619 | Verlegemuster | Task 3, 6 |
| Randzone | `randzoneChain` 977, `zonePolyOf` 841 | Fensterzone | Task 2 (entfällt weitgehend) |
| Kreisaufteilung | `partition` 1119, `buildLoops` 1206 | Heizkreise | Task 4 |
| Anbindung | `routeVia` 1136 | Zuleitungen | Task 5 (entfällt) |
| Pfadglättung | `fillet` 1017, `smoothToRadius` 2323, `resampleArc` 2360, `relaxLoops` 2392 | Nachbearbeitung | Task 6 (entfällt weitgehend) |
| Prüfung | `loopCrossings` 2489, `loopsOutside` 2502, `crossingBench` 2513, `heatCoverage` 2293 | Bench | Task 0, 7 |

---

### Task 0: Bench headless ausführbar machen

Ohne reproduzierbare Messung außerhalb des Browsers bleiben Regressionen unentdeckt. Im bisherigen Verlauf sind vier Verschlechterungen (Ring-Trim 57→103, Notch-Umweg 6→116, Halbkreis-U-Turn 40→52, Eikonal mit doppelter Randzone 34→72) nur durch Zufall aufgefallen. Dieser Task kommt zuerst, damit alle folgenden Umbauten abgesichert sind.

**Files:**
- Create: `bench.mjs`
- Create: `bench-baseline.json`
- Modify: `verlegeplan.html` (Export der Bench-Funktion für Node)

**Interfaces:**
- Consumes: `crossingBench(n, seed)`, `loopCrossings(plan)`, `loopsOutside(plan)`, `heatCoverage(loops, reach)`, `autofit()`, `S` — alle bereits vorhanden.
- Produces: `bench.mjs` gibt auf stdout ein JSON-Objekt `{runs, crossFails, covFails, radFails, outFails, worstCoverage, worstRadius}` aus und beendet mit Exit-Code 1, wenn eine Kennzahl schlechter ist als die Baseline.

- [ ] **Step 1: Bench-Runner schreiben**

`bench.mjs` extrahiert das Skript aus der HTML-Datei, führt es in einem minimalen DOM-Stub aus und ruft den Bench auf. Kein Framework, kein Browser.

```javascript
// bench.mjs — headless Bench-Runner. Node >= 18, keine Dependencies.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('verlegeplan.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const js = scripts.reduce((a, b) => (a.length > b.length ? a : b));

// Minimaler DOM-Stub: die Datei ruft beim Laden initUI() und recompute().
const el = () => ({
  value: '', textContent: '', innerHTML: '', checked: false, style: {}, dataset: {},
  classList: { add(){}, remove(){}, toggle(){} },
  addEventListener(){}, removeEventListener(){}, appendChild(){},
  querySelector: () => el(), querySelectorAll: () => [],
  getBoundingClientRect: () => ({ x:0, y:0, width:800, height:600 }),
});
globalThis.document = {
  getElementById: () => el(), querySelector: () => el(), querySelectorAll: () => [],
  createElement: () => el(), addEventListener(){},
  body: el(), documentElement: el(),
};
globalThis.window = globalThis;
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
globalThis.performance = { now: () => Number(process.hrtime.bigint() / 1000000n) };

// Kein `with` — das Skript beginnt mit "use strict", dort ist es verboten.
// Stattdessen den Skriptinhalt als Funktionsrumpf ausführen und die benötigten
// Symbole am Ende explizit zurückgeben.
const api = new Function(js + `
  return { crossingBench, autofit, loopCrossings, loopsOutside, heatCoverage,
           snappedManifold, S };
`)();

const RUNS = Number(process.argv[2] || 500);
const fails = api.crossingBench(RUNS, 20260725);
const out = {
  runs: RUNS,
  crossFails: fails.filter(f => f.cross > 0).length,
  covFails: fails.filter(f => f.cov < 40).length,
  radFails: fails.filter(f => f.minR != null && f.minR < f.radSoll - 1).length,
  // `cross` im Bench ist die Summe aus Kreuzungen UND Rohr außerhalb. Für eine
  // getrennte Aussage zählt der Bench beides einzeln — siehe Task 0, Step 1a.
  outFails: fails.filter(f => f.outside > 0).length,
  worstCoverage: Math.min(...fails.map(f => f.cov), 100),
  worstRadius: Math.min(...fails.map(f => f.minR ?? 999), 999),
};
console.log(JSON.stringify(out, null, 1));

if (process.argv.includes('--save-baseline')) {
  writeFileSync('bench-baseline.json', JSON.stringify(out, null, 1));
  process.exit(0);
}
try {
  const base = JSON.parse(readFileSync('bench-baseline.json', 'utf8'));
  const worse = ['crossFails', 'covFails', 'radFails'].filter(k => out[k] > base[k]);
  if (worse.length) {
    console.error('REGRESSION in: ' + worse.join(', '));
    process.exit(1);
  }
} catch { /* keine Baseline: nur ausgeben */ }
```

- [ ] **Step 1a: Kreuzungen und Rohr-außerhalb im Bench trennen**

`crossingBench` summiert beides heute in `cross`. Für getrennte Kennzahlen in `verlegeplan.html` die Stelle

```javascript
    try{ plan=autofit(); x=loopCrossings(plan)+loopsOutside(plan);
         cov=heatCoverage(plan.loops,25); }
```

ersetzen durch:

```javascript
    let outside=0;
    try{ plan=autofit(); x=loopCrossings(plan); outside=loopsOutside(plan);
         cov=heatCoverage(plan.loops,25); }
```

und im Fehlschlag-Eintrag `outside` mit aufnehmen — die Bedingung wird zu
`if(x>0||outside>0||covFail||radFail)`, das Objekt bekommt das Feld `outside`.
Getrennte Zahlen sind nötig, weil die beiden Fehlerklassen verschiedene
Ursachen haben und in verschiedenen Tasks behoben werden.

- [ ] **Step 2: Runner ausführen und Fehlschlag bestätigen**

Run: `node bench.mjs 60`
Expected: JSON auf stdout mit `crossFails: 60`, `covFails` um 54, `radFails: 60`. Bestätigt, dass der Runner dieselben Zahlen liefert wie die Browser-Messung — falls nicht, ist der DOM-Stub unvollständig und muss ergänzt werden, bevor es weitergeht.

- [ ] **Step 3: Baseline schreiben**

Run: `node bench.mjs 500 --save-baseline`
Expected: `bench-baseline.json` existiert und enthält die aktuellen Zahlen.

- [ ] **Step 4: Regressionsschutz prüfen**

Verifizieren, dass eine Verschlechterung wirklich erkannt wird: `crossFails` in `bench-baseline.json` von Hand auf `0` setzen, dann:

Run: `node bench.mjs 500`
Expected: Exit-Code 1 und `REGRESSION in: crossFails` auf stderr. Danach die Baseline mit `node bench.mjs 500 --save-baseline` wiederherstellen.

- [ ] **Step 5: Commit**

```bash
git add bench.mjs bench-baseline.json
git commit -m "test: headless bench runner with regression baseline"
```

---

### Task 1: Deckung im Eikonal-Feld nachziehen

Das Eikonal-Feld ist beim Biegeradius bereits deutlich besser (56 mm gegen 34 mm bei gleichen Kreuzungen), verliert aber bei der Deckung (26 % gegen 32 %), weil das Randband zu dünn belegt wird. Dieser Task schließt die Lücke, damit das Feld in Task 2 zum Standardweg werden kann.

**Files:**
- Modify: `verlegeplan.html` — `spacingAt` (Zeile 578), `eikonalField` (Zeile 548)

**Interfaces:**
- Consumes: `S.s`, `S.randSpacing`, `S.randPasses`, `S.windowEdges`, `frameEdges()`, `frameW()`, `frameH()`
- Produces: `spacingAt(px, py)` liefert weiterhin einen Bahnabstand in mm; neu ist ein **stetiger** Übergang zwischen Randband und Kern statt einer Sprungstelle.

- [ ] **Step 1: Selbstcheck für den stetigen Übergang schreiben**

In `selfChecks()` ergänzen, direkt vor dem Kreuzungs-Bench:

```javascript
  // spacingAt muss stetig sein: ein Sprung im Bahnabstand erzeugt an der
  // Bandgrenze zusammenlaufende Isolinien und damit zu enge Radien.
  {
    const savedW=S.windowEdges, savedRot=ROT; ROT=0; S.windowEdges=['bottom'];
    const band=S.randPasses*S.randSpacing;
    let maxJump=0;
    for(let y=0;y<band*2;y+=5)
      maxJump=Math.max(maxJump,Math.abs(spacingAt(1000,y)-spacingAt(1000,y+5)));
    S.windowEdges=savedW; ROT=savedRot;
    A(`spacingAt stetig (max. Sprung ${Math.round(maxJump)} mm)`, maxJump<=6);
  }
```

- [ ] **Step 2: Test ausführen und Fehlschlag sehen**

Datei im Browser laden, Konsole öffnen.
Expected: `FAIL spacingAt stetig (max. Sprung 50 mm)` — die heutige Funktion springt an der Bandgrenze von `randSpacing` auf `s`.

- [ ] **Step 3: Stetigen Übergang implementieren**

`spacingAt` ersetzen durch:

```javascript
// Bahnabstand am Ort. Der Übergang vom dichten Randband zum Kern läuft
// LINEAR über eine Übergangsbreite: ein Sprung würde die Isolinien an der
// Bandgrenze zusammenlaufen lassen und dort zu enge Radien erzeugen.
function spacingAt(px,py){
  if(!S.windowEdges.length) return S.s;
  const W=frameW(), H=frameH();
  let dist=Infinity;
  frameEdges().forEach(e=>{
    if(e==='bottom') dist=Math.min(dist,py);
    else if(e==='top') dist=Math.min(dist,H-py);
    else if(e==='left') dist=Math.min(dist,px);
    else dist=Math.min(dist,W-px);
  });
  const band=S.randPasses*S.randSpacing;      // dichtes Band an der Scheibe
  const ramp=Math.max(2*S.s,band);            // Übergangsbreite
  if(dist<=band) return S.randSpacing;
  if(dist>=band+ramp) return S.s;
  const t=(dist-band)/ramp;
  return S.randSpacing+(S.s-S.randSpacing)*t;
}
```

- [ ] **Step 4: Test ausführen und Erfolg bestätigen**

Datei neu laden (Cache-Bust über `?v=` anhängen).
Expected: `PASS spacingAt stetig (max. Sprung … mm)` mit einem Wert ≤ 6.

- [ ] **Step 5: Deckung messen**

In der Browser-Konsole:

```javascript
(function(){
  const r={};
  const save=[...S.windowEdges];
  S.useEikonal=true; S.windowEdges=[];        // Randzone integriert
  let p=autofit();
  r.eikonal={cov:Math.round(heatCoverage(p.loops,25)*100),
    cross:loopCrossings(p), minR:Math.round(Math.min(...p.loops.map(l=>l.minR)))};
  S.windowEdges=save; S.useEikonal=false;
  p=autofit();
  r.distanzfeld={cov:Math.round(heatCoverage(p.loops,25)*100),
    cross:loopCrossings(p), minR:Math.round(Math.min(...p.loops.map(l=>l.minR)))};
  return JSON.stringify(r);
})();
```

Expected: `eikonal.cov` liegt über den bisherigen 26 %. Erreicht es 32 % oder mehr bei weiterhin besserem `minR`, ist Task 2 gerechtfertigt. Bleibt es darunter, den gemessenen Wert im Code dokumentieren und Task 2 trotzdem angehen — dort kommt durch den Wegfall der separaten Randzone weitere Fläche hinzu.

- [ ] **Step 6: Commit**

```bash
git add verlegeplan.html
git commit -m "feat: continuous spacing transition in the eikonal field"
```

---

### Task 2: Randzone im Feld auflösen, Vorlauf-Priorität erhalten

Die Randzone ist heute ein eigenes Subsystem (`randzoneChain`, `edgeChains`, `chainPass`, `splitChainAtManifold`, Omega-Kehren) und wird separat an einen Kreis gehängt. Im Eikonal-Feld ist sie schlicht ein Gebiet mit kleinerem `s`. Das ersetzt mehrere hundert Zeilen Sonderbehandlung.

**Wichtig:** Dabei geht die Eigenschaft „Vorlauf erreicht die Scheibe zuerst" verloren — eine bewusste physikalische Entscheidung des Auftraggebers, die die Konvektion an der Glasfläche antreibt. Sie wird hier über die Laufrichtung wiederhergestellt, nicht aufgegeben.

**Files:**
- Modify: `verlegeplan.html` — `buildLoops` (Zeile 1206), `doubleSpiralField` (Zeile 735)

**Interfaces:**
- Consumes: `eikonalField(poly, insOf, step, sAt)`, `spacingAt(px, py)`, `isoContours(F, level)`
- Produces: `buildLoops(groups)` liefert Kreise, bei denen `rand` leer ist und die Fensterzone Teil von `field` ist. Die Reihenfolge in `pts` beginnt am fensternächsten Niveau.

- [ ] **Step 1: Selbstcheck für die Vorlauf-Priorität schreiben**

```javascript
  // Vorlauf muss die Fensterfront ZUERST erreichen: das treibt die Konvektion
  // an der Scheibe. Im Feldmodell heißt das, der Pfad startet am
  // fensternächsten Niveau, nicht am Kern.
  {
    const p=autofit();
    const l=p.loops.find(x=>x.field&&x.field.length>4);
    let ok=true;
    if(l){
      const wallDist=q=>{
        const room=lRing(0,0,S.W,S.H,S.notchA,S.notchB);
        return nearestOnRing(q,room).d;
      };
      const dStart=wallDist(l.field[0]);
      const dMid=wallDist(l.field[Math.floor(l.field.length/2)]);
      ok = dStart < dMid;                       // Start näher an der Wand als die Mitte
    }
    A('Vorlauf startet an der Fensterfront', ok);
  }
```

- [ ] **Step 2: Test ausführen**

Datei neu laden.
Expected: Der Check läuft. Ob er PASS oder FAIL zeigt, hängt vom aktuellen Stand ab — er dokumentiert die Eigenschaft und schützt sie ab jetzt vor stillem Verlust.

- [ ] **Step 3: Randzone im Eikonal-Pfad abschalten**

In `buildLoops`, im Block der die Randzone zuweist (beginnt mit `if(S.windowEdges.length){`), zu Beginn ergänzen:

```javascript
  // Im Eikonal-Feld ist die Fensterzone ein Gebiet mit kleinerem Bahnabstand
  // (spacingAt) und damit bereits Teil des Feldes. Sie zusätzlich als eigene
  // Kette zu legen, verlegt sie doppelt — gemessen: 72 statt 34 Kreuzungen
  // und Biegeradius 4 statt 56 mm.
  const randSeparat = !S.useEikonal;
```

und die Bedingung von `if(S.windowEdges.length){` auf `if(randSeparat && S.windowEdges.length){` ändern.

- [ ] **Step 4: Laufrichtung so wählen, dass der Vorlauf am Fenster beginnt**

In `doubleSpiralField`, direkt vor `return pts;` am Ende der Ring-Verkettung:

```javascript
  // Vorlauf zuerst ans Fenster: liegt das Pfadende näher an einer markierten
  // Fensterwand als der Anfang, den Pfad umdrehen. Ohne das startet der
  // Vorlauf im Kern und erreicht die Scheibe erst als Rücklauf — die
  // Konvektion an der Glasfläche bräche weg.
  if(S.windowEdges.length && pts.length>2){
    const room=lRing(0,0,S.W,S.H,S.notchA,S.notchB);
    const dA=nearestOnRing(rotBack(pts[0],S.W,S.H),room).d;
    const dB=nearestOnRing(rotBack(pts[pts.length-1],S.W,S.H),room).d;
    if(dB<dA) pts.reverse();
  }
```

- [ ] **Step 5: Eikonal aktivieren und messen**

`S.useEikonal` im State-Objekt auf `true` setzen. Datei neu laden, dann in der Konsole:

```javascript
JSON.stringify((()=>{const p=autofit();return{
  cross:loopCrossings(p), out:loopsOutside(p),
  cov:Math.round(heatCoverage(p.loops,25)*100),
  minR:Math.round(Math.min(...p.loops.map(l=>l.minR)))};})());
```

Expected: `minR` deutlich über 34 (Referenz aus dem Eikonal-Test: 56), `cross` nicht schlechter als 34, `cov` mindestens 32.

- [ ] **Step 6: Bench gegen Baseline laufen lassen**

Run: `node bench.mjs 500`
Expected: Exit-Code 0. Bei `REGRESSION` die Änderung zurücknehmen und den gemessenen Grund als Kommentar im Code festhalten — nicht überschreiben.

- [ ] **Step 7: Commit**

```bash
git add verlegeplan.html
git commit -m "feat: randzone becomes a dense field region; flow still reaches glazing first"
```

---

### Task 3: Verteiler als Quelle im Feld

Heute wird das Feld gebaut und die Zuleitungen werden **danach** dorthin geroutet — daher stammen fast alle verbleibenden Kreuzungen (`leadIn`/`leadOut` gegen fremde Felder). Wird der Verteiler zur Randbedingung des Feldes, sind Zuleitungen keine eigene Kategorie mehr.

**Files:**
- Modify: `verlegeplan.html` — `eikonalField` (Zeile 548)

**Interfaces:**
- Consumes: `snappedManifold()`, `rotFwd(p, W, H)`
- Produces: `eikonalField(poly, insOf, step, sAt, source)` — neuer optionaler Parameter `source` (Punkt im Frame). Ist er gesetzt, gilt dort φ = 0.

- [ ] **Step 1: Selbstcheck schreiben**

```javascript
  // Mit Quelle muss das Feld am Verteiler sein Minimum haben: von dort
  // wachsen die Niveaus nach außen, und die Zuleitung ist die erste Isolinie
  // statt einer nachträglich gerouteten Sonderleitung.
  {
    const poly=[{x:0,y:0},{x:4000,y:0},{x:4000,y:3000},{x:0,y:3000}];
    const src={x:2000,y:0};
    const F=eikonalField(poly,()=>100,50,()=>100,src);
    const at=(x,y)=>{
      const i=Math.round((x-F.x0)/F.step), j=Math.round((y-F.y0)/F.step);
      return F.d[j*F.nx+i];
    };
    const nearSrc=at(2000,200), farAway=at(2000,2500);
    A('Feld wächst vom Verteiler weg', nearSrc>=0 && farAway>nearSrc);
  }
```

- [ ] **Step 2: Test ausführen und Fehlschlag sehen**

Datei neu laden.
Expected: FAIL — `eikonalField` nimmt bisher keinen fünften Parameter, die Quelle wird ignoriert.

- [ ] **Step 3: Quellrandbedingung implementieren**

In `eikonalField` die Signatur um `source` erweitern und die Initialisierung ersetzen:

```javascript
function eikonalField(poly,insOf,step,sAt,source){
```

und den Block der Startwerte setzt:

```javascript
  // Startwerte. Ohne Quelle: die Randbahn ist phi=0 (konzentrische Niveaus).
  // Mit Quelle: nur der Verteilerpunkt ist phi=0 — die Niveaus wachsen von
  // dort, wodurch die Zuleitung die erste Isolinie ist statt einer separat
  // gerouteten Leitung.
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

Datei neu laden.
Expected: `PASS Feld wächst vom Verteiler weg`.

- [ ] **Step 5: Commit**

```bash
git add verlegeplan.html
git commit -m "feat: manifold as source boundary condition in the eikonal field"
```

---

### Task 4: Heizkreise durch Zerschneiden einer Kurve

`partition` zerlegt heute den **Raum** in Zonen, legt in jede eine eigene Spirale und verbindet sie einzeln. Jede Zonennaht ist eine Fehlerquelle, und die Randzone muss künstlich einem Kreis zugeschlagen werden. Bei einer bifilaren Kurve liegen Vor- und Rücklauf nebeneinander — ein Schnitt liefert daher **beide Enden am selben Ort**, was die Anbindung trivial macht.

**Files:**
- Modify: `verlegeplan.html` — `partition` (Zeile 1119), `buildLoops` (Zeile 1206)

**Interfaces:**
- Consumes: `bifilarPath(zone, gate)`, `fillet(pts, r)`, `S.maxLoop`
- Produces: neue Funktion `splitByLength(pts, maxLen)` → `Array<Array<Point>>`. Schneidet eine Punktfolge in Stücke, deren gefilletete Länge je `maxLen` nicht überschreitet.

- [ ] **Step 1: Selbstcheck für den Längenschnitt schreiben**

```javascript
  // Eine lange Kurve in Stücke unter der Maximallänge schneiden. Summe der
  // Teillängen muss der Gesamtlänge entsprechen (nichts geht verloren),
  // und kein Stück darf über dem Maximum liegen.
  {
    const line=[]; for(let i=0;i<=200;i++) line.push({x:i*100,y:0});
    const parts=splitByLength(line,5000);
    const total=parts.reduce((a,p)=>a+fillet(p,S.bendRadius).length,0);
    const whole=fillet(line,S.bendRadius).length;
    const maxPart=Math.max(...parts.map(p=>fillet(p,S.bendRadius).length));
    A('splitByLength erhält die Gesamtlänge', Math.abs(total-whole)<whole*0.02);
    A('splitByLength hält die Maximallänge', maxPart<=5000*1.02);
  }
```

- [ ] **Step 2: Test ausführen und Fehlschlag sehen**

Datei neu laden.
Expected: Die Selbstchecks werfen `ReferenceError: splitByLength is not defined`.

- [ ] **Step 3: splitByLength implementieren**

Direkt vor `function partition(N){` einfügen:

```javascript
// Eine durchgehende Kurve in Heizkreise schneiden. Bei einer bifilaren Kurve
// liegen Vor- und Rücklauf nebeneinander, ein Schnitt liefert deshalb beide
// Enden am selben Ort — die Anbindung an den Verteiler wird trivial.
// Ersetzt das Zerlegen des RAUMS in Zonen samt Zonennähten.
function splitByLength(pts,maxLen){
  if(pts.length<2) return [pts];
  const total=fillet(pts,S.bendRadius).length;
  const n=Math.max(1,Math.ceil(total/maxLen));
  if(n===1) return [pts];
  const target=total/n, out=[]; let cur=[pts[0]], acc=0;
  for(let i=1;i<pts.length;i++){
    acc+=len(sub(pts[i],pts[i-1]));
    cur.push(pts[i]);
    if(acc>=target && out.length<n-1){ out.push(cur); cur=[pts[i]]; acc=0; }
  }
  if(cur.length>1) out.push(cur);
  return out;
}
```

- [ ] **Step 4: Test ausführen und Erfolg bestätigen**

Datei neu laden.
Expected: `PASS splitByLength erhält die Gesamtlänge` und `PASS splitByLength hält die Maximallänge`.

- [ ] **Step 5: In buildLoops verwenden**

In `buildLoops` den Aufbau der Kreise so ändern, dass bei einer einzelnen Zone die Kurve nach Länge geteilt wird statt den Raum zu partitionieren. Innerhalb der `raw`-Erzeugung, nach `const field=bifilarPath(rects,M.x);`:

```javascript
    // Ein Feld, danach nach Länge in Kreise geschnitten — statt den Raum in
    // Zonen zu zerlegen. Spart die Zonennähte und die künstliche Zuordnung
    // der Fensterzone zu einem Kreis.
    if(S.splitByCurve && groups.length===1 && field.length>4){
      return splitByLength(field,S.maxLoop).map((seg,i)=>
        ({gi:i,rects,field:seg,joins:[],rand:[]}));
    }
```

Da dieser Zweig ein Array statt eines Objekts liefert, die `raw`-Erzeugung anschließend mit `.flat()` abschließen.

Im State-Objekt ergänzen:

```javascript
  splitByCurve:false,       // Heizkreise durch Schnitt EINER Kurve (Task 4)
```

- [ ] **Step 6: A/B messen**

```javascript
JSON.stringify((()=>{const r={};
  for(const v of [false,true]){ S.splitByCurve=v;
    const p=autofit();
    r[v?'kurvenschnitt':'zonen']={N:p.loops.length,cross:loopCrossings(p),
      cov:Math.round(heatCoverage(p.loops,25)*100),
      minR:Math.round(Math.min(...p.loops.map(l=>l.minR))),
      laengen:p.loops.map(l=>Math.round(l.length/1000))};
  } S.splitByCurve=false; return r;})());
```

Expected: `kurvenschnitt` erreicht dieselbe oder eine bessere Kreuzungszahl bei gleichmäßigeren Kreislängen. Ist das der Fall, `splitByCurve` auf `true` setzen; sonst den Messwert als Kommentar hinterlegen und auf `false` belassen.

- [ ] **Step 7: Bench und Commit**

Run: `node bench.mjs 500`
Expected: kein `REGRESSION`.

```bash
git add verlegeplan.html
git commit -m "feat: heating loops by cutting one curve instead of partitioning the room"
```

---

### Task 5: Anbindeleitungen als Feld-Isolinien

Mit dem Verteiler als Quelle (Task 3) und Kreisen aus einer Kurve (Task 4) sind separate Zuleitungen überflüssig. `routeVia` mit Spurvergabe, Rampen, Notch-Umwegen und Korridorbreite entfällt — und mit ihm die Kategorie von Fehlern, die den größten Teil der verbleibenden Kreuzungen ausmacht.

**Files:**
- Modify: `verlegeplan.html` — `buildLoops` (Zeile 1206), `routeVia` (Zeile 1136)

**Interfaces:**
- Consumes: Ergebnis aus Task 3 und Task 4.
- Produces: `buildLoops` liefert Kreise, deren `leadIn`/`leadOut` leer sind; `pts` besteht aus `field` allein.

- [ ] **Step 1: Selbstcheck schreiben**

```javascript
  // Ohne separate Zuleitungen darf es die zugehörige Fehlerklasse nicht mehr
  // geben: alle Punkte gehören zum Feld, Anfang und Ende liegen am Verteiler.
  if(S.fieldOnlyLeads){
    const p=autofit(), M=snappedManifold();
    const l=p.loops[0];
    const dA=len(sub(l.pts[0],M)), dB=len(sub(l.pts[l.pts.length-1],M));
    A('Kreis beginnt und endet am Verteiler', dA<S.s*3 && dB<S.s*3);
  }
```

- [ ] **Step 2: Test ausführen**

Datei neu laden.
Expected: Der Check wird übersprungen, solange `S.fieldOnlyLeads` false ist — das ist beabsichtigt und dokumentiert die Zielbedingung.

- [ ] **Step 3: Flag einführen und Zuleitungen weglassen**

Im State ergänzen:

```javascript
  fieldOnlyLeads:false,     // Zuleitungen sind Feld-Isolinien (Task 5)
```

In `buildLoops`, bei der Zusammensetzung von `pts`:

```javascript
    // Mit Verteiler-Quelle im Feld ist die Zuleitung die erste Isolinie —
    // separate Leitungen entfallen. Genau dort entstanden die meisten
    // verbleibenden Kreuzungen (leadIn/leadOut gegen fremde Felder).
    const pts = S.fieldOnlyLeads
      ? [...l.rand,...l.mid,...l.field]
      : [...l.leadIn.slice(0,-1),...l.rand,...l.mid,...l.field,...l.leadOut.slice(1)];
```

- [ ] **Step 4: Messen**

```javascript
JSON.stringify((()=>{const r={};
  for(const v of [false,true]){ S.fieldOnlyLeads=v;
    const p=autofit();
    r[v?'ohneLeitungen':'mitLeitungen']={cross:loopCrossings(p),
      out:loopsOutside(p), cov:Math.round(heatCoverage(p.loops,25)*100),
      minR:Math.round(Math.min(...p.loops.map(l=>l.minR)))};
  } S.fieldOnlyLeads=false; return r;})());
```

Expected: `ohneLeitungen.cross` liegt deutlich unter `mitLeitungen.cross`. Ist zusätzlich `out` gleich 0 und `minR` nicht schlechter, das Flag auf `true` setzen.

- [ ] **Step 5: Bench und Commit**

Run: `node bench.mjs 500`
Expected: kein `REGRESSION`, `crossFails` deutlich gesunken.

```bash
git add verlegeplan.html
git commit -m "feat: supply lines are field isolines; routeVia special-casing retired"
```

---

### Task 6: Pfad als tangentenstetige Segmente

Der Biegeradius ist heute ein **Prüfergebnis**: Punkte bauen, runden, messen, glätten, erneut messen. Deshalb steht er bei 34 mm statt 80. `fillet` kann eine 180°-Wende prinzipiell nicht runden (Tangentenabstand `R/tan(0)` ist unendlich, gekappt fällt der Radius auf 0). Mit einem Pfadtyp aus Geraden und Bögen mit expliziter Tangente ist ein zu enger Radius nicht mehr konstruierbar.

**Files:**
- Modify: `verlegeplan.html` — `fillet` (Zeile 1017), `smoothToRadius` (Zeile 2323), `resampleArc` (Zeile 2360)

**Interfaces:**
- Consumes: `S.bendRadius`
- Produces: `pathSegments(pts, r)` → `{segs, length, minR}` mit `segs` als Folge von `{kind:'line'|'arc', from, to, r?, cw?}`. Jeder Übergang ist tangentenstetig.

- [ ] **Step 1: Selbstcheck für Tangentenstetigkeit schreiben**

```javascript
  // Tangentenstetigkeit: am Übergang zwischen zwei Segmenten müssen Aus- und
  // Eintrittsrichtung übereinstimmen. Ohne das entstehen genau die Knicke, die
  // heute den Biegeradius auf einen Bruchteil drücken.
  {
    const L=[{x:0,y:0},{x:1000,y:0},{x:1000,y:1000},{x:0,y:1000}];
    const r=pathSegments(L,80);
    let worst=0;
    for(let i=1;i<r.segs.length;i++){
      const a=r.segs[i-1], b=r.segs[i];
      const outDir=a.kind==='line'?unit(sub(a.to,a.from)):a.exitDir;
      const inDir =b.kind==='line'?unit(sub(b.to,b.from)):b.entryDir;
      worst=Math.max(worst,Math.acos(Math.max(-1,Math.min(1,dot(outDir,inDir)))));
    }
    A('Segmentübergänge tangentenstetig', worst<0.02);
    A('kein Bogen unter dem Mindestradius', r.minR>=80-1);
  }
```

- [ ] **Step 2: Test ausführen und Fehlschlag sehen**

Datei neu laden.
Expected: `ReferenceError: pathSegments is not defined`.

- [ ] **Step 3: pathSegments implementieren**

Direkt nach `fillet` einfügen:

```javascript
// Pfad als Folge von Geraden und Bögen MIT expliziter Tangente. Anders als
// fillet, das Ecken einzeln nachträglich rundet, wird der Radius hier
// konstruktiv eingehalten: passt ein Bogen nicht zwischen zwei Ecken, wird
// der Eckpunkt verworfen statt der Radius gekappt.
function pathSegments(pts,r){
  const segs=[]; let minR=Infinity, length=0;
  if(pts.length<2) return {segs,length,minR};
  // Ecken vorfiltern: zu dicht liegende Punkte lassen keinen Bogen zu.
  const keep=[pts[0]];
  for(let i=1;i<pts.length-1;i++){
    const a=keep[keep.length-1], v=pts[i], b=pts[i+1];
    const din=unit(sub(v,a)), dout=unit(sub(b,v));
    const defl=Math.acos(Math.max(-1,Math.min(1,dot(din,dout))));
    if(defl<1e-3){ continue; }                       // gerade: Punkt überflüssig
    const t=r/Math.tan((Math.PI-defl)/2);
    if(!isFinite(t)||t*2>len(sub(v,a))||t*2>len(sub(b,v))) continue; // kein Platz
    keep.push(v);
  }
  keep.push(pts[pts.length-1]);
  let cur=keep[0];
  for(let i=1;i<keep.length-1;i++){
    const a=keep[i-1], v=keep[i], b=keep[i+1];
    const din=unit(sub(v,a)), dout=unit(sub(b,v));
    const defl=Math.acos(Math.max(-1,Math.min(1,dot(din,dout))));
    const cross=din.x*dout.y-din.y*dout.x;
    const t=r/Math.tan((Math.PI-defl)/2);
    const pin=add(v,scl(din,-t)), pout=add(v,scl(dout,t));
    segs.push({kind:'line',from:cur,to:pin});
    length+=len(sub(pin,cur));
    segs.push({kind:'arc',from:pin,to:pout,r,cw:cross<0,
      entryDir:din,exitDir:dout});
    length+=r*defl; minR=Math.min(minR,r);
    cur=pout;
  }
  const last=keep[keep.length-1];
  segs.push({kind:'line',from:cur,to:last});
  length+=len(sub(last,cur));
  return {segs,length,minR};
}
```

- [ ] **Step 4: Test ausführen und Erfolg bestätigen**

Datei neu laden.
Expected: `PASS Segmentübergänge tangentenstetig` und `PASS kein Bogen unter dem Mindestradius`.

- [ ] **Step 5: In buildLoops verwenden**

Im State ergänzen:

```javascript
  usePathSegments:false,    // Pfad als tangentenstetige Segmente (Task 6)
```

In `buildLoops`, wo heute `const f=fillet(pts,R);` steht:

```javascript
    const f = S.usePathSegments ? pathSegments(pts,R) : fillet(pts,R);
```

`draw()` muss beide Formen zeichnen können. Dort, wo `opsToD(fillet(...).ops)` verwendet wird, ergänzen:

```javascript
  // pathSegments liefert Segmente statt ops — in denselben Pfad-String übersetzen.
  const segsToD=segs=>segs.map((o,i)=>
    (i===0?`M ${PP(o.from)} `:'')+
    (o.kind==='line'?`L ${PP(o.to)}`
      :`A ${o.r.toFixed(1)} ${o.r.toFixed(1)} 0 0 ${sweep(o.cw)} ${PP(o.to)}`)).join(' ');
```

- [ ] **Step 6: Messen**

```javascript
JSON.stringify((()=>{const r={};
  for(const v of [false,true]){ S.usePathSegments=v;
    const p=autofit();
    r[v?'segmente':'fillet']={cross:loopCrossings(p),
      cov:Math.round(heatCoverage(p.loops,25)*100),
      minR:Math.round(Math.min(...p.loops.map(l=>l.minR))),
      m:(p.loops.reduce((a,l)=>a+l.length,0)/1000).toFixed(1)};
  } S.usePathSegments=false; return r;})());
```

Expected: `segmente.minR` erreicht 80 (der geforderte Wert), da zu enge Ecken verworfen statt gekappt werden. Die Rohrlänge kann leicht sinken — das ist der ehrliche Preis und muss im Commit benannt werden.

- [ ] **Step 7: Bench und Commit**

Run: `node bench.mjs 500`
Expected: `radFails` auf 0.

```bash
git add verlegeplan.html
git commit -m "feat: tangent-continuous path segments guarantee the bend radius"
```

---

### Task 7: Fehlschläge reproduzierbar machen

Jede Diagnose kostet bisher Zeit, weil fehlgeschlagene Bench-Konfigurationen von Hand nachgebaut werden müssen. Ein Permalink pro Fehlschlag und ein Debug-Layer im Plan verkürzen das auf einen Klick.

**Files:**
- Modify: `verlegeplan.html` — `crossingBench` (Zeile 2513), `draw()`, `initUI()`

**Interfaces:**
- Consumes: `S`, `loopCrossings`, `loopsOutside`
- Produces: `configToQuery()` → `string`, `applyQuery(search)` → `boolean`. Jeder Bench-Fehlschlag enthält zusätzlich das Feld `url`.

- [ ] **Step 1: Selbstcheck für den Round-Trip schreiben**

```javascript
  // Konfiguration -> URL -> Konfiguration muss verlustfrei sein, sonst zeigt
  // der Permalink einen anderen Fall als den fehlgeschlagenen.
  {
    const before={W:S.W,H:S.H,s:S.s,notchA:S.notchA,mfx:Math.round(S.manifold.x)};
    const q=configToQuery();
    S.W=1234; S.s=95;                       // absichtlich verstellen
    applyQuery('?'+q);
    const ok = S.W===before.W && S.s===before.s && S.notchA===before.notchA;
    A('Konfiguration überlebt den URL-Round-Trip', ok);
  }
```

- [ ] **Step 2: Test ausführen und Fehlschlag sehen**

Datei neu laden.
Expected: `ReferenceError: configToQuery is not defined`.

- [ ] **Step 3: Implementieren**

Vor `initUI` einfügen:

```javascript
// Konfiguration als Query-String: macht jeden Bench-Fehlschlag per Link
// reproduzierbar, statt ihn von Hand nachbauen zu müssen.
const QKEYS=['W','H','notchA','notchB','notchLeft','s','pipeDia','edgeGap',
             'randSpacing','randPasses','loopMode'];
function configToQuery(){
  const p=QKEYS.map(k=>k+'='+encodeURIComponent(S[k]));
  p.push('win='+encodeURIComponent(S.windowEdges.join(',')));
  p.push('mfx='+Math.round(S.manifold.x),'mfy='+Math.round(S.manifold.y));
  return p.join('&');
}
function applyQuery(search){
  const q=new URLSearchParams(search||location.search);
  if(![...q.keys()].length) return false;
  QKEYS.forEach(k=>{
    if(!q.has(k)) return;
    const v=q.get(k);
    S[k] = (k==='notchLeft') ? v==='true'
         : (k==='loopMode')  ? v
         : parseFloat(v);
  });
  if(q.has('win')) S.windowEdges=q.get('win')?q.get('win').split(','):[];
  if(q.has('mfx')&&q.has('mfy')) S.manifold={x:+q.get('mfx'),y:+q.get('mfy')};
  return true;
}
```

In `crossingBench`, beim Aufbau eines Fehlschlag-Eintrags, `url:configToQuery()` ergänzen.

Am Ende des Skripts, direkt vor `recompute();`:

```javascript
applyQuery();                 // Permalink beim Laden übernehmen
```

- [ ] **Step 4: Test ausführen und Erfolg bestätigen**

Datei neu laden.
Expected: `PASS Konfiguration überlebt den URL-Round-Trip`.

- [ ] **Step 5: Debug-Layer im Plan**

In `draw()`, nach den Overlap-Markern:

```javascript
  // Debug-Layer: verletzende Stellen mit Zahlenwert direkt im Plan. Ohne das
  // muss jede Diagnose die Koordinaten aus der Konsole übertragen.
  let dbg='';
  if(S.debugLayer){
    (plan.overlaps||[]).forEach(p2=>{
      dbg+=`<circle cx="${X(p2.x)}" cy="${Y(p2.y)}" r="90" fill="none" stroke="#dc2626" stroke-width="14"/>`;
    });
  }
```

`dbg` in den SVG-String aufnehmen und im State `debugLayer:false` ergänzen.

- [ ] **Step 6: Commit**

```bash
git add verlegeplan.html
git commit -m "feat: permalink per bench failure and in-plan debug layer"
```

---

### Task 8: Zielkriterien über 500 Läufe nachweisen

Abschluss: der Nachweis, dass alle vier harten Kriterien gleichzeitig erfüllt sind.

**Files:**
- Modify: `bench-baseline.json`
- Modify: `README.md`

- [ ] **Step 1: Vollen Bench fahren**

Run: `node bench.mjs 500`
Expected: `crossFails: 0`, `covFails: 0`, `radFails: 0`, `outFails: 0`.

Sind einzelne Kennzahlen noch verletzt, die betroffenen Konfigurationen über ihren Permalink öffnen, die Ursache messen und den zuständigen Task erneut aufgreifen — nicht die Kriterien aufweichen.

- [ ] **Step 2: Baseline auf den erreichten Stand setzen**

Run: `node bench.mjs 500 --save-baseline`
Expected: `bench-baseline.json` enthält durchgehend Nullen.

- [ ] **Step 3: README auf den erreichten Stand bringen**

Den Abschnitt „Stand" ersetzen: die bisherige Aussage, dass die Anbindeleitungen den Bench nicht bestehen, ist dann überholt. Aufnehmen: alle vier Kriterien, die Zahl der Läufe, und dass der Bench per `node bench.mjs 500` reproduzierbar ist.

- [ ] **Step 4: Commit**

```bash
git add bench-baseline.json README.md
git commit -m "test: all four hard criteria clean over 500 bench runs"
```

---

## Verworfene Ansätze

Damit sie nicht erneut probiert werden — alle gemessen, alle schlechter:

| Ansatz | Ergebnis |
|---|---|
| Torkanal-Lücke von `s·0.9` vor der Naht | Kreuzungen 31 → 51, Deckung 35 % → 30 % |
| Ring-Trim beidseitig an der Naht | Kreuzungen 57 → 103 |
| Notch-Umweg „unter dem Notch durch" | Rohr außerhalb 6 → 116 von 240 |
| U-Turn als expliziter Halbkreis-Bogen | Kreuzungen 40 → 52, Radius unverändert |
| Punkte ausdünnen statt entlang der Kurve resampeln | schärfere Ecken, Radius blieb bei 1 mm |
| Spiralfeld mit `atan2` um einen Anker | 335 Kreuzungen (bei L-Formen mehrdeutig) |
| Eikonal-Feld **mit** separater Randzone | Kreuzungen 72, Radius 4 mm (Randzone doppelt gelegt) |

## Reihenfolge und Abhängigkeiten

Task 0 zuerst — er sichert alle folgenden ab. Danach 1 → 2 → 3 → 4 → 5 in dieser Reihenfolge, da sie aufeinander aufbauen (Feld → Randzone im Feld → Quelle → Kreise aus einer Kurve → Zuleitungen entfallen). Task 6 ist unabhängig und kann jederzeit dazwischen laufen. Task 7 lohnt sich früh, wenn die Diagnose in Task 2–5 zäh wird. Task 8 schließt ab.
