# Raumaufmaß — Bedienung nachschärfen

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vier Änderungen am Arbeitsablauf von `raumaufmass.html`: Punkte innerhalb der verbliebenen Freiheitsgrade ziehen, Wandlänge durch Klick auf die Wand eingeben, Doppelmessungen desselben Paars, und noch fehlende Messungen als rot gestrichelte Linien im Plan.

**Architecture:** Alle vier stützen sich auf Funktionen, die der Kern bereits hat und die getestet sind — `analyze().modes`, `matTmat`, `luSolve`, `solve`, `suggest`. Neu im Kern ist nur `dragAlongModes`. Der Rest ist Oberfläche.

**Tech Stack:** Vanilla JavaScript, keine Dependencies. `node test/run.mjs` fährt den Kern, aktuell 113 Checks grün.

---

## Vorab verifiziert

Die tragenden Annahmen sind vor dem Schreiben dieses Plans am echten Kern gemessen, nicht angenommen:

**Eingeschränktes Ziehen funktioniert.** Rechteck mit nur vier gemessenen Seiten, `dof = 1`. Punkt C fünfmal um je 120 mm gezogen, Projektion auf die Moden plus `solve` als Korrektor:

```
Zug 1: C=(4119,2998)  groesstes Residuum 0.0000 mm
Zug 5: C=(4590,2941)  groesstes Residuum 0.0000 mm
```

Der Punkt gleitet auf der Lösungsmannigfaltigkeit — das Rechteck schert zum Parallelogramm, genau der eine verbliebene Freiheitsgrad. Alle Messungen bleiben exakt erfüllt.

**Doppelmessungen zählen bereits.** A→B mit 4000 und B→A mit 4010 ergeben `m=6, redundancy=1` und Residuen +5,0 / −5,0 — die Werte werden zu 4005 gemittelt.

**Eine Wiederholung macht genau ihr eigenes Paar prüfbar.** Auf einem exakt bestimmten Netz: nach Wiederholung von A–B haben beide A–B-Zeilen `red = 0.500`, die übrigen vier bleiben bei `red = 0` und damit unprüfbar.

## Global Constraints

- Alle Längen intern in **mm**.
- `raumaufmass.html` bleibt **self-contained**: kein `<script src>`, kein `<link href>`, keine externe Ressource.
- Der `core`-Block darf **kein** DOM berühren — sonst bricht der Node-Runner.
- Der `core`-Block endet mit `globalThis.CORE = {…}`.
- Feste Schwellen unverändert: `TOL_RANK = 1e-8`, `TOL_RED = 0.01`, `TOL_MODE = 0.05`, `SIGMA_DEF = 5`, `SUGGEST_CHECK_MAX = 3`.
- Kommentare und UI-Texte auf Deutsch, Code-Bezeichner englisch. Assert-Funktion `chk`.
- **`verlegeplan.html` wird nicht angefasst.** Nie `git add -A`.
- Die 113 bestehenden Checks bleiben grün.
- Nicht anfassen: der `autofit()`-Vorbehalt in `render()`, die Übernahme der Fit-Koordinaten in `recompute()`, die Markierungsregel der Messtabelle, der abgeleitete Ellipsen-Überhöhungsfaktor.

## File Structure

Eine Datei ändert sich: `raumaufmass.html`. Blöcke `core`, `ui`, `checks` wie gehabt.

---

### Task 1: `dragAlongModes` im Kern

**Files:** Modify `raumaufmass.html` (Blöcke `core`, `checks`)

**Interfaces:**
- Consumes: `matTmat`, `matTvec`, `luSolve`, `idx`
- Produces: `CORE.dragAlongModes(pts, modes, i, dx, dy) -> pts[] | null` — verschiebt alle Punkte so, dass Punkt `i` dem Zug `(dx,dy)` so weit folgt, wie die Moden es zulassen. `null`, wenn keine Moden vorliegen. Verändert die Eingabe nicht.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

Im Block `checks` vor `return {ok, out};`:

```js
  // --- dragAlongModes ---
  {
    const rect=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const seiten=[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},{a:'D',b:'A',d:3000}];
    let pts=C.solve(rect,seiten).pts;
    const an=C.analyze(pts,seiten);
    chk('dragAlongModes: Rechteck mit 4 Seiten hat dof 1', an.dof===1 && an.modes.length===1);
    const iC=C.idx(pts)['C'];
    const moved=C.dragAlongModes(pts,an.modes,iC,120,0);
    chk('dragAlongModes: liefert so viele Punkte wie hinein gingen', moved && moved.length===4);
    chk('dragAlongModes: gezogener Punkt bewegt sich', moved && Math.abs(moved[iC].x-pts[iC].x)>1);
    chk('dragAlongModes: Eingabe unveraendert', pts[iC].x===4000 && pts[iC].y===3000);
    // Nach dem Korrektor muessen alle gemessenen Seiten wieder exakt stimmen
    const korrigiert=C.solve(moved,seiten).pts;
    chk('dragAlongModes: Messungen bleiben nach Korrektur erfuellt',
       C.residuals(korrigiert,seiten).every(v=>Math.abs(v)<0.01));
    chk('dragAlongModes: der Zug ist wirksam, nicht nur geduldet',
       Math.abs(korrigiert[iC].x-pts[iC].x)>50);
    chk('dragAlongModes: ohne Moden -> null', C.dragAlongModes(pts,[],iC,120,0)===null);
  }
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node test/run.mjs`
Expected: FAIL, `C.dragAlongModes is not a function`

- [ ] **Step 3: Implementieren**

Im Block `core`, vor der `globalThis.CORE`-Zeile:

```js
// Einen Zug am Punkt i auf die verbliebenen Beweglichkeiten projizieren.
// Die Moden sind die LINEARISIERTE Beweglichkeit an der aktuellen Stelle -
// ein endlicher Zug driftet also von den Messungen weg. Der Aufrufer laesst
// deshalb solve() als Korrektor nachlaufen (Praediktor-Korrektor).
function dragAlongModes(pts, modes, i, dx, dy){
  const k=modes.length;
  if(!k) return null;
  // Nur die beiden Zeilen des gezogenen Punktes: A c = (dx,dy), A ist 2 x k
  const A=[modes.map(m=>m[2*i]), modes.map(m=>m[2*i+1])];
  const N=matTmat(A), g=matTvec(A,[dx,dy]);
  for(let j=0;j<k;j++) N[j][j]+=1e-9;   // gegen singulaere Faelle, aendert nichts Reales
  const sol=luSolve(N, g.map(x=>[x]));
  if(!sol) return null;
  const c=sol.map(r=>r[0]);
  return pts.map((p,q)=>{
    let ax=0, ay=0;
    modes.forEach((m,j)=>{ ax+=c[j]*m[2*q]; ay+=c[j]*m[2*q+1]; });
    return {...p, x:p.x+ax, y:p.y+ay};
  });
}
```

`dragAlongModes` in `globalThis.CORE` aufnehmen.

- [ ] **Step 4: Test laufen lassen, grün prüfen**

Run: `node test/run.mjs`
Expected: alle PASS, die 113 bestehenden plus 7 neue.

- [ ] **Step 5: Commit**

```bash
git add raumaufmass.html
git commit -m "feat: drag a point within the network's remaining freedoms"
```

---

### Task 2: Eingeschränktes Ziehen in der Oberfläche

**Files:** Modify `raumaufmass.html` (Block `ui`)

**Interfaces:**
- Consumes: `CORE.dragAlongModes`, `CORE.solve`, `CORE.analyze`, `M.an.modes`, `M.an.dof`
- Produces: geänderter `mousemove`-Handler; `M.dragMode` mit den Werten `'frei'`, `'moden'`, `'starr'`

- [ ] **Step 1: `mousemove`-Handler ersetzen**

Der heutige Handler schiebt den Punkt roh und rechnet beim Loslassen neu. Ersetze ihn:

```js
// Ziehen kennt drei Lagen:
//  - noch keine Messung: die Skizze ist frei, der Punkt folgt der Maus
//  - dof > 0: der Punkt folgt der Maus so weit, wie die Messungen es zulassen
//  - dof = 0: die Form ist bestimmt, es bleibt nur das Verschieben des ganzen
//    Raums - das ist immer frei und aendert keine Messung
cv.addEventListener('mousemove',e=>{
  if(!M.drag) return;
  const r=cv.getBoundingClientRect(), dpr=devicePixelRatio||1;
  const w=toWorld((e.clientX-r.left)*dpr, (e.clientY-r.top)*dpr);
  const i=M.pts.findIndex(x=>x.id===M.drag);
  if(i<0) return;
  const dx=w.x-M.pts[i].x, dy=w.y-M.pts[i].y;

  if(!M.an){                                  // freie Skizze
    M.dragMode='frei';
    M.pts[i].x=w.x; M.pts[i].y=w.y;
  } else if(M.an.dof>0){                      // innerhalb der Freiheitsgrade
    M.dragMode='moden';
    const moved=C.dragAlongModes(M.pts, M.an.modes, i, dx, dy);
    if(moved){
      const fit=C.solve(moved, M.meas);       // Korrektor: zurueck auf die Messungen
      fit.pts.forEach((p,q)=>{ M.pts[q].x=p.x; M.pts[q].y=p.y; });
    }
  } else {                                    // bestimmt: nur noch starr schieben
    M.dragMode='starr';
    M.pts.forEach(p=>{ p.x+=dx; p.y+=dy; });
  }
  render();
});
```

- [ ] **Step 2: `M.dragMode` im Zustand anlegen und im Hinweis anzeigen**

In der `M`-Deklaration `dragMode:null` ergänzen. In `render()`, im Punkte-Block, den Hinweistext setzen:

```js
  // Waehrend eines Zugs sagen, was gerade moeglich ist - sonst wirkt ein
  // Punkt, der der Maus nicht folgt, wie ein Fehler.
  if(M.drag && M.dragMode){
    document.getElementById('hint').textContent =
      {frei:'Skizze frei — noch keine Messung',
       moden:'Punkt folgt den Messungen',
       starr:'Raum ist bestimmt — nur noch verschiebbar, Maß ändern statt ziehen'}[M.dragMode];
  }
```

- [ ] **Step 3: Kern-Checks laufen lassen**

Run: `node test/run.mjs`
Expected: unverändert alle PASS. Der Runner lädt `ui` nicht; ändert sich die Zahl, wurde versehentlich `core` bearbeitet.

- [ ] **Step 4: Im Browser prüfen**

Zustand zwischen den Versuchen in der Seite zurücksetzen — die Vorschau lädt `file://` nicht wirklich neu.

1. Vier Punkte, vier Wände, **keine** Messung. Punkt ziehen → folgt der Maus, Hinweis „Skizze frei".
2. Die vier Seiten messen (`dof = 1`). Punkt C ziehen → er folgt eingeschränkt, das Rechteck schert zum Parallelogramm, die vier Seitenlängen in der Tabelle bleiben unverändert. Hinweis „Punkt folgt den Messungen".
3. Diagonale A–C messen (`dof = 0`). Punkt ziehen → der ganze Raum verschiebt sich, die Form bleibt. Hinweis „Raum ist bestimmt".
4. In allen drei Lagen: nach dem Loslassen stehen dieselben Maße in der Tabelle wie vorher.

- [ ] **Step 5: Commit**

```bash
git add raumaufmass.html
git commit -m "feat: dragging respects the constraints already measured"
```

---

### Task 3: `suggest` darf Wiederholungsmessungen vorschlagen

**Files:** Modify `raumaufmass.html` (Blöcke `core`, `checks`)

**Interfaces:**
- Consumes: `analyze`, `activeMeas`, `pairKey`
- Produces: `suggest` liefert in der `pruefbar`-Phase auch Paare, die bereits gemessen sind; solche Einträge tragen zusätzlich `repeat:true`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

```js
  // --- suggest: Wiederholungen ---
  {
    const rect=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const walls=[['A','B'],['B','C'],['C','D'],['D','A']];
    // Exakt bestimmt: keine Messung ist pruefbar, und es gibt nur noch eine
    // ungemessene Strecke (B-D). Ohne Wiederholungen kann suggest nach dieser
    // einen nichts mehr anbieten.
    const exakt=[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},
                 {a:'D',b:'A',d:3000},{a:'A',b:'C',d:5000}];
    const s=C.suggest(rect,walls,exakt);
    chk('suggest: schlaegt mehr als die eine offene Strecke vor', s.length>1);
    chk('suggest: mindestens ein Vorschlag ist eine Wiederholung',
       s.some(x=>x.repeat===true));
    chk('suggest: Wiederholungen nur in der Pruefbarkeits-Phase',
       s.filter(x=>x.repeat).every(x=>x.why==='pruefbar'));
    chk('suggest: eine Wiederholung macht ihr eigenes Paar pruefbar', (()=>{
      const w=s.find(x=>x.repeat); if(!w) return false;
      const I=C.idx(rect);
      const mit=exakt.concat([{a:w.a,b:w.b,d:C.dist(rect[I[w.a]],rect[I[w.b]]),sigma:C.SIGMA_DEF}]);
      const an=C.analyze(C.solve(rect,mit).pts,mit);
      return an.w.filter(x=>x!==null).length>=2;
    })());
  }
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node test/run.mjs`
Expected: FAIL bei „schlaegt mehr als die eine offene Strecke vor" — heute filtert `have` alle gemessenen Paare heraus.

- [ ] **Step 3: Implementieren**

In `suggest`, die Kandidatenbildung ergänzen. Der heutige Block überspringt gemessene Paare komplett; stattdessen werden sie als Wiederholungskandidaten geführt:

```js
  const cand=[], repeats=[];
  for(let i=0;i<pts.length;i++) for(let j=i+1;j<pts.length;j++){
    const key=pairKey(pts[i].id,pts[j].id);
    const pair={a:pts[i].id, b:pts[j].id};
    // Signatur beachten: pairMeasurable(pts, walls, poly, aId, bId) - Listen
    // und IDs, nicht Punktobjekte.
    if(!pairMeasurable(pts, walls, poly, pts[i].id, pts[j].id)) continue;
    // Eine Wiederholung macht genau ihr eigenes Paar pruefbar - nachgemessen:
    // auf einem exakt bestimmten Netz steigt red der beiden Zeilen auf 0.500,
    // alle uebrigen bleiben bei 0. Deshalb sind Wiederholungen nur in der
    // Pruefbarkeits-Phase sinnvoll, nie zur Herstellung der Bestimmtheit.
    if(have.has(key)) repeats.push(pair); else cand.push(pair);
  }
```

Und in der `pruefbar`-Phase über beide Listen suchen. Ersetze dort die Kandidatenschleife:

```js
      for(const c of cand.concat(repeats)){
        if(taken.has(pairKey(c.a,c.b))) continue;
        const gain=base-unchecked(analyze(pts, work.concat([virt(c)])));
        if(gain>bestScore){ bestScore=gain; best=c; bestRepeat=repeats.includes(c); }
      }
```

Vor der Schleife `let bestRepeat=false;` setzen, und beim Ablegen des Vorschlags mitschreiben:

```js
    out.push(bestRepeat ? {a:best.a, b:best.b, why, repeat:true}
                        : {a:best.a, b:best.b, why});
```

`taken` verhindert, dass dasselbe Paar zweimal in einem Durchlauf vorgeschlagen wird — das bleibt so, eine zweite Wiederholung derselben Strecke bringt in einem Zug nichts.

- [ ] **Step 4: Test laufen lassen, grün prüfen**

Run: `node test/run.mjs`
Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add raumaufmass.html
git commit -m "feat: suggest repeat readings to make measurements checkable"
```

---

### Task 4: Noch fehlende Messungen rot gestrichelt zeichnen

**Files:** Modify `raumaufmass.html` (Block `ui`, Markup-Legende)

**Interfaces:**
- Consumes: `CORE.suggest`, `M.walls`, `M.meas`
- Produces: `M.sugg` — die zuletzt berechnete Vorschlagsliste, damit `render()` und `renderPanel()` dieselbe verwenden

- [ ] **Step 1: Vorschlagsliste einmal je Neuberechnung ablegen**

`renderPanel()` ruft heute `C.suggest(...)` bei jedem Zeichnen auf — auch bei jeder Mausbewegung während eines Zugs. Das ist bei 24 Punkten mit 172 ms messbar zu langsam. Die Liste gehört in `recompute()`, nicht in `render()`:

In `recompute()`, nach dem Setzen von `M.an`:

```js
  // Vorschlaege einmal je Aenderung rechnen, nicht je Bild. suggest() ruft
  // intern analyze() je Kandidat auf - waehrend eines Zugs waere das spuerbar.
  M.sugg = (M.an && M.pts.length>=3)
    ? C.suggest(M.fit?M.fit.pts:M.pts, M.walls, M.meas) : [];
```

In `M` `sugg:[]` ergänzen. In `renderPanel()` den Aufruf `C.suggest(...)` durch `M.sugg` ersetzen.

- [ ] **Step 2: Zeichnen**

In `render()`, direkt **nach** dem Messungen-Block und **vor** dem Punkte-Block:

```js
  // Noch fehlende Messungen rot gestrichelt. Bewusst ein anderes Strichmuster
  // als die gruenen vorhandenen Messungen - Rot gegen Gruen allein waere fuer
  // Rotgruenblinde nicht unterscheidbar.
  if(M.sugg.length){
    ctx.strokeStyle='#d33'; ctx.lineWidth=1.5*dpr;
    M.sugg.forEach(sg=>{
      if(I[sg.a]==null||I[sg.b]==null) return;
      const p=toScr(P[I[sg.a]]), q=toScr(P[I[sg.b]]);
      ctx.setLineDash(sg.why==='bestimmt' ? [2*dpr,4*dpr] : [1*dpr,6*dpr]);
      ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.stroke();
    });
    ctx.setLineDash([]);
  }
```

- [ ] **Step 3: Legende ergänzen**

Im Markup, in der Legenden-Zeile unter den Modusknöpfen, vor dem Ellipsen-Eintrag:

```html
      <span style="color:#3a7">– – –</span> gemessen &nbsp;
      <span style="color:#d33">· · ·</span> noch zu messen &nbsp;
```

- [ ] **Step 4: Kern-Checks laufen lassen**

Run: `node test/run.mjs`
Expected: unverändert alle PASS.

- [ ] **Step 5: Im Browser prüfen**

L-Raum aus der Spec: sechs Punkte, sechs Wände, die sechs Wandlängen messen.
1. Drei rot gestrichelte Linien erscheinen zwischen genau den Paaren, die unter *Damit der Raum bestimmt ist* stehen.
2. Die Paare der zweiten Gruppe sind ebenfalls rot, aber feiner gepunktet.
3. **`C ↔ F` erscheint als Linie nirgends** — diese Diagonale verlässt den Raum und darf nicht vorgeschlagen werden.
4. Nach Eintragen einer vorgeschlagenen Messung verschwindet genau diese rote Linie und wird grün.

- [ ] **Step 6: Commit**

```bash
git add raumaufmass.html
git commit -m "feat: draw the measurements still needed as red dashed lines"
```

---

### Task 5: Wandlänge durch Klick auf die Wand

**Files:** Modify `raumaufmass.html` (Block `ui`)

**Interfaces:**
- Consumes: `M.walls`, `M.meas`, `CORE.dist`
- Produces: `nearestWall(wx, wy)` → `{a, b} | null`; Klick im Messmodus auf eine Wand trägt deren Länge ein

- [ ] **Step 1: Abstand Punkt–Strecke und Wandtreffer**

Im Block `ui`, bei den übrigen Hilfsfunktionen:

```js
// Abstand eines Punktes zu einer Strecke, plus der Fusspunkt-Parameter.
function distToSeg(p,a,b){
  const vx=b.x-a.x, vy=b.y-a.y, L2=vx*vx+vy*vy;
  const t=L2? Math.max(0,Math.min(1,((p.x-a.x)*vx+(p.y-a.y)*vy)/L2)) : 0;
  return {d:Math.hypot(p.x-(a.x+vx*t), p.y-(a.y+vy*t)), t};
}
// Naechste Wand unter dem Cursor. Nur Treffer im mittleren Teil der Wand
// zaehlen - nahe den Enden soll der Punkt gewinnen, sonst kaeme man an die
// Eckpunkte nicht mehr heran.
function nearestWall(wx,wy){
  const P=M.drag?M.pts:(M.fit?M.fit.pts:M.pts), I=C.idx(P);
  let best=null, bd=Infinity;
  M.walls.forEach(([a,b])=>{
    if(I[a]==null||I[b]==null) return;
    const r=distToSeg({x:wx,y:wy}, P[I[a]], P[I[b]]);
    if(r.t<0.15||r.t>0.85) return;
    if(r.d<bd){ bd=r.d; best={a,b}; }
  });
  return (best && bd*VIEW.s < 12) ? best : null;
}
```

- [ ] **Step 2: Im Messmodus zuerst auf eine Wand prüfen**

Im `mousedown`-Handler, im Zweig für `M.mode==='measure'`, **bevor** auf einen Punkt geprüft wird:

```js
  if(M.mode==='measure' && !h){
    const wall=nearestWall(w.x,w.y);
    if(wall){ enterMeasurement(wall.a, wall.b); return; }
  }
```

- [ ] **Step 3: Eingabe in eine Funktion ziehen, die vorhandene Werte kennt**

Die heutige Eingabe steckt inline im Handler und kennt nur „neu anlegen". Ziehe sie heraus und lass sie mit bestehenden Werten umgehen:

```js
// Mass fuer ein Paar eintragen. Gibt es schon Werte, werden sie gezeigt und
// der Nutzer entscheidet: korrigieren oder einen zweiten Wert ergaenzen.
// Beides ist legitim - korrigieren nach einem Tippfehler, ergaenzen nach dem
// zweiten Messen. Zwei Werte desselben Paars pruefen sich gegenseitig.
function enterMeasurement(a,b){
  const vorhanden=M.meas.filter(m=>(m.a===a&&m.b===b)||(m.a===b&&m.b===a));
  let frage=`Abstand ${a}–${b} in Metern:`;
  if(vorhanden.length){
    frage=`Abstand ${a}–${b} in Metern.\nBisher: ${vorhanden.map(m=>fmtM(m.d)).join(', ')}\n`
        + `Neuer Wert wird als weitere Messung ergänzt.`;
  }
  const s=prompt(frage);
  if(s===null) return;
  const d=parseFloat(s.replace(',','.'))*1000;
  if(!isFinite(d)||d<=0){ alert('Ungültig: Maß muss eine Zahl größer 0 sein.'); return; }
  M.meas.push({a,b,d,sigma:C.SIGMA_DEF,on:true});
  recompute();
}
```

Und den bisherigen Inline-Zweig im `mousedown`-Handler durch `enterMeasurement(a,b);` ersetzen.

**Achtung, Einheiten:** die Eingabe ist ab hier **Meter**, passend zur Tabelle und zum Laser. Bisher verlangte sie mm, während die Tabelle Meter zeigte — wer den Laserwert `4.250` eintippte, bekam eine Messung von 4,25 mm, und weil alle Maße gleich falsch waren, blieb das Netz konsistent und keine Prüfung schlug an. Der Text sagt jetzt „in Metern".

- [ ] **Step 4: Plausibilitätsschwelle**

Direkt vor `M.meas.push(...)`:

```js
  if(d<100 && !confirm(`${fmtM(d)} m ist sehr kurz — als Meter gemeint oder als Millimeter vertippt?\n\nOK = so übernehmen`)) return;
```

- [ ] **Step 5: Kern-Checks laufen lassen**

Run: `node test/run.mjs`
Expected: unverändert alle PASS.

- [ ] **Step 6: Im Browser prüfen**

1. Vier Punkte, vier Wände. Im Messmodus **auf die Mitte einer Wand** klicken → Eingabe erscheint für genau dieses Paar, ohne zwei Punktklicks.
2. `4.25` eintippen → Tabelle zeigt `4.250`, nicht `0.004`.
3. Auf dieselbe Wand nochmals klicken → der Dialog nennt den bisherigen Wert und ergänzt einen zweiten. Die Tabelle zeigt danach **zwei** Zeilen für dieses Paar, beide mit `Red.` größer 0 — sie prüfen sich gegenseitig.
4. Nahe an einem Eckpunkt klicken → der Punkt gewinnt, nicht die Wand.
5. Zwei Punkte ohne Wand dazwischen klicken → Diagonale wird wie bisher über zwei Klicks gemessen.
6. `0.05` eintippen → Rückfrage erscheint.

- [ ] **Step 7: Commit**

```bash
git add raumaufmass.html
git commit -m "feat: click a wall to enter its length, in metres, repeats allowed"
```

---

## Selbstreview des Plans

**Abdeckung der vier Anforderungen**

| Anforderung | Task |
|---|---|
| Punkte verschieben, solange Freiheitsgrade bestehen | 1 (Kern), 2 (Bedienung) |
| Wandlänge durch Klick auf die Wand statt Start- und Endpunkt | 5 |
| Wand A→B und B→A gleichzeitig | Kern kann es bereits; 5 macht es eingebbar, 3 macht es vorschlagbar |
| Noch zu vermessende Entfernungen rot gestrichelt | 4 |

**Mitgenommen, weil dieselbe Stelle angefasst wird:** die Einheiten-Falle in Task 5. Die Eingabe verlangte mm, die Tabelle zeigte m — ein eingetippter Laserwert ergab einen millimetergroßen Raum, ohne dass eine einzige Prüfung anschlug, weil Geometrie maßstabsinvariant ist. Getrennt zu lassen wäre gefährlich gewesen.

**Nebenbefund, in Task 4 behoben:** `renderPanel()` rief `suggest()` bei jedem Bild auf, also auch bei jeder Mausbewegung während eines Zugs — bei 24 Punkten 172 ms. Mit dem eingeschränkten Ziehen aus Task 2 wäre das erst richtig aufgefallen. Die Liste wird jetzt in `recompute()` gerechnet.

**Reihenfolge.** Task 4 hängt an Task 3 (`repeat`-Feld) und Task 5 hängt an nichts, wird aber zuletzt gebaut, weil es die Einheitenumstellung enthält und die Browser-Prüfung dann alles Übrige mitsieht.

**Typkonsistenz geprüft.** `dragAlongModes(pts, modes, i, dx, dy)` in Task 1 und 2 gleich. `M.sugg` in Task 4 angelegt und in `renderPanel` gelesen. `enterMeasurement(a,b)` in Task 5 definiert und im Handler aufgerufen. `nearestWall` liefert `{a,b}`, passend zu `enterMeasurement`.

**Nicht enthalten:** Undo, Autosave, Import, σ pro Messung, Zoom und Pan, Punktnamen, Druckansicht, Spiegeln. Alles aus der Vorschlagsliste, keines davon von den vier Anforderungen berührt.
