# Raumaufmaß — Bedienung nachschärfen

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sechzehn Änderungen am Arbeitsablauf von `raumaufmass.html`, von der Einheitenfalle über Undo und Autosave bis zum Ziehen innerhalb der verbliebenen Freiheitsgrade.

**Architecture:** Der Mathe-Kern kann fast alles bereits — `analyze().modes`, per-Messung `sigma`, Doppelmessungen. Neu im Kern sind nur `dragAlongModes` und Wiederholungs-Vorschläge in `suggest`. Alles Übrige ist Oberfläche und Zustandsverwaltung.

**Tech Stack:** Vanilla JavaScript, keine Dependencies. `node test/run.mjs` fährt den Kern, aktuell 113 Checks grün.

---

## Vorab am echten Kern gemessen

**Eingeschränktes Ziehen trägt.** Rechteck, nur vier Seiten gemessen, `dof = 1`. Punkt C fünfmal um je 120 mm gezogen, Projektion auf die Moden plus `solve` als Korrektor:

```
Zug 1: C=(4119,2998)  groesstes Residuum 0.0000 mm
Zug 5: C=(4590,2941)  groesstes Residuum 0.0000 mm
```

Der Punkt gleitet auf der Lösungsmannigfaltigkeit — das Rechteck schert zum Parallelogramm, genau der eine verbliebene Freiheitsgrad.

**Doppelmessungen zählen bereits.** A→B mit 4000 und B→A mit 4010: `m=6, redundancy=1`, Residuen +5,0 / −5,0, gemittelt auf 4005.

**Eine Wiederholung macht genau ihr eigenes Paar prüfbar.** Auf exakt bestimmtem Netz steigt `red` beider A–B-Zeilen auf 0,500, die übrigen vier bleiben bei 0.

**Die Einheiten widersprechen sich.** Eingabe verlangt mm, Tabelle zeigt und bearbeitet m. Getippt `4.250` → gespeichert 4,25 mm → Tabelle zeigt 0.004 m. Sind alle Maße gleich falsch, ist das Netz konsistent: `dof=0`, keine Residuen, keine Warnung. Geometrie ist maßstabsinvariant, das Werkzeug *kann* es nicht bemerken.

## Global Constraints

- Alle Längen intern in **mm**. Alle Ein- und Ausgaben in **m**.
- `raumaufmass.html` bleibt **self-contained**: kein `<script src>`, kein `<link href>`, keine externe Ressource.
- Der `core`-Block darf **kein** DOM berühren.
- Der `core`-Block endet mit `globalThis.CORE = {…}`.
- Schwellen unverändert: `TOL_RANK = 1e-8`, `TOL_RED = 0.01`, `TOL_MODE = 0.05`, `SIGMA_DEF = 5`, `SUGGEST_CHECK_MAX = 3`.
- Kommentare und UI-Texte auf Deutsch, Code-Bezeichner englisch. Assert-Funktion `chk`.
- **`verlegeplan.html` wird nicht angefasst.** Nie `git add -A`.
- Die 113 bestehenden Checks bleiben grün.
- Nicht anfassen: `autofit()`-Vorbehalt in `render()`, Übernahme der Fit-Koordinaten in `recompute()`, Markierungsregel der Messtabelle, abgeleiteter Ellipsen-Überhöhungsfaktor.

## Ausdrücklich nicht enthalten

Zoom und Pan, Punkte benennen, Skizze spiegeln — vom Nutzer abgewählt. Ebenso Druckansicht und Warnung bei deckungsgleichen Punkten.

---

### Task 1: `dragAlongModes` im Kern

**Files:** Modify `raumaufmass.html` (`core`, `checks`)

**Interfaces:**
- Consumes: `matTmat`, `matTvec`, `luSolve`
- Produces: `CORE.dragAlongModes(pts, modes, i, dx, dy) -> pts[] | null` — verschiebt alle Punkte so, dass Punkt `i` dem Zug folgt, so weit die Moden es zulassen. `null` ohne Moden. Eingabe bleibt unverändert.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

Im Block `checks` vor `return {ok, out};`:

```js
  // --- dragAlongModes ---
  {
    const rect=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const seiten=[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},{a:'D',b:'A',d:3000}];
    const pts=C.solve(rect,seiten).pts;
    const an=C.analyze(pts,seiten);
    chk('dragAlongModes: Rechteck mit 4 Seiten hat dof 1', an.dof===1 && an.modes.length===1);
    const iC=C.idx(pts)['C'];
    const moved=C.dragAlongModes(pts,an.modes,iC,120,0);
    chk('dragAlongModes: liefert gleich viele Punkte', moved && moved.length===4);
    chk('dragAlongModes: gezogener Punkt bewegt sich', moved && Math.abs(moved[iC].x-pts[iC].x)>1);
    chk('dragAlongModes: Eingabe unveraendert', Math.abs(pts[iC].x-4000)<1e-6);
    const korr=C.solve(moved,seiten).pts;
    chk('dragAlongModes: Messungen bleiben nach Korrektur erfuellt',
       C.residuals(korr,seiten).every(v=>Math.abs(v)<0.01));
    chk('dragAlongModes: der Zug ist wirksam', Math.abs(korr[iC].x-pts[iC].x)>50);
    chk('dragAlongModes: ohne Moden -> null', C.dragAlongModes(pts,[],iC,120,0)===null);
  }
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node test/run.mjs` → FAIL, `C.dragAlongModes is not a function`

- [ ] **Step 3: Implementieren**

Im Block `core`, vor `globalThis.CORE`:

```js
// Einen Zug am Punkt i auf die verbliebenen Beweglichkeiten projizieren.
// Die Moden sind die LINEARISIERTE Beweglichkeit an der aktuellen Stelle -
// ein endlicher Zug driftet also von den Messungen weg. Der Aufrufer laesst
// deshalb solve() als Korrektor nachlaufen (Praediktor-Korrektor).
function dragAlongModes(pts, modes, i, dx, dy){
  const k=modes.length;
  if(!k) return null;
  const A=[modes.map(m=>m[2*i]), modes.map(m=>m[2*i+1])];   // 2 x k
  const N=matTmat(A), g=matTvec(A,[dx,dy]);
  for(let j=0;j<k;j++) N[j][j]+=1e-9;
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

In `globalThis.CORE` aufnehmen.

- [ ] **Step 4: Grün prüfen** — `node test/run.mjs`, 113 + 7 PASS
- [ ] **Step 5: Commit** — `git add raumaufmass.html && git commit -m "feat: drag a point within the network's remaining freedoms"`

---

### Task 2: `suggest` darf Wiederholungen vorschlagen

**Files:** Modify `raumaufmass.html` (`core`, `checks`)

**Interfaces:** `suggest` liefert in der `pruefbar`-Phase auch bereits gemessene Paare; diese tragen `repeat:true`.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

```js
  // --- suggest: Wiederholungen ---
  {
    const rect=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const walls=[['A','B'],['B','C'],['C','D'],['D','A']];
    const exakt=[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},
                 {a:'D',b:'A',d:3000},{a:'A',b:'C',d:5000}];
    const s=C.suggest(rect,walls,exakt);
    chk('suggest: mehr als die eine offene Strecke', s.length>1);
    chk('suggest: mindestens eine Wiederholung dabei', s.some(x=>x.repeat===true));
    chk('suggest: Wiederholungen nur in der Pruefbarkeits-Phase',
       s.filter(x=>x.repeat).every(x=>x.why==='pruefbar'));
    chk('suggest: eine Wiederholung macht ihr Paar pruefbar', (()=>{
      const w=s.find(x=>x.repeat); if(!w) return false;
      const I=C.idx(rect);
      const mit=exakt.concat([{a:w.a,b:w.b,d:C.dist(rect[I[w.a]],rect[I[w.b]]),sigma:C.SIGMA_DEF}]);
      return C.analyze(C.solve(rect,mit).pts,mit).w.filter(x=>x!==null).length>=2;
    })());
  }
```

- [ ] **Step 2: Fehlschlag prüfen** — FAIL bei „mehr als die eine offene Strecke"

- [ ] **Step 3: Implementieren**

In `suggest` die Kandidatenbildung ersetzen. **Signatur beachten:** `pairMeasurable(pts, walls, poly, aId, bId)` — Listen und IDs, keine Punktobjekte.

```js
  const cand=[], repeats=[];
  for(let i=0;i<pts.length;i++) for(let j=i+1;j<pts.length;j++){
    const key=pairKey(pts[i].id,pts[j].id);
    if(!pairMeasurable(pts, walls, poly, pts[i].id, pts[j].id)) continue;
    const pair={a:pts[i].id, b:pts[j].id};
    // Eine Wiederholung macht genau ihr eigenes Paar pruefbar - nachgemessen:
    // red steigt fuer beide Zeilen auf 0.500, alle uebrigen bleiben 0. Zur
    // Herstellung der Bestimmtheit taugt sie deshalb nie.
    if(have.has(key)) repeats.push(pair); else cand.push(pair);
  }
```

In der `pruefbar`-Phase über beide Listen suchen. `let bestRepeat=false;` neben `let best=null, bestScore=0;` setzen, im `else`-Zweig:

```js
      for(const c of cand.concat(repeats)){
        if(taken.has(pairKey(c.a,c.b))) continue;
        const gain=base-unchecked(analyze(pts, work.concat([virt(c)])));
        if(gain>bestScore){ bestScore=gain; best=c; bestRepeat=repeats.includes(c); }
      }
```

Beim Ablegen:

```js
    out.push(bestRepeat ? {a:best.a, b:best.b, why, repeat:true} : {a:best.a, b:best.b, why});
```

- [ ] **Step 4: Grün prüfen** — `node test/run.mjs`
- [ ] **Step 5: Commit** — `git commit -m "feat: suggest repeat readings to make measurements checkable"`

---

### Task 3: Zustands-Schnappschüsse und Undo

Alles Folgende verändert Zustand. Undo muss deshalb vor den übrigen Bedienschritten stehen, damit sie sich daran hängen können.

**Files:** Modify `raumaufmass.html` (`ui`)

**Interfaces:**
- Produces: `snapshot()` legt den aktuellen Zustand auf den Stapel; `undo()` stellt den letzten wieder her; `serialize()` / `deserialize(obj)` als gemeinsame Grundlage für Undo, Autosave und Import.

- [ ] **Step 1: Serialisierung und Stapel anlegen**

Im Block `ui`, nach der `M`-Deklaration:

```js
// Ein Zustand ist genau das, was der Nutzer eingegeben hat: Punkte, Waende,
// Messungen. Fit und Analyse werden daraus jederzeit neu gerechnet und
// gehoeren deshalb nicht hinein.
const serialize=()=>JSON.stringify({
  pts:M.pts.map(p=>({id:p.id,x:p.x,y:p.y})),
  walls:M.walls.map(w=>[...w]),
  meas:M.meas.map(m=>({...m})),
  idSeq,
});
function deserialize(o){
  M.pts=o.pts.map(p=>({...p}));
  M.walls=o.walls.map(w=>[...w]);
  M.meas=o.meas.map(m=>({...m}));
  if(typeof o.idSeq==='number') idSeq=o.idSeq;
  M.sel=[]; M.drag=null; M.fit=null; M.an=null;
}

const UNDO_MAX=60;
const undoStack=[];
// Vor jeder Aenderung aufrufen, nicht danach - der Stapel haelt den Zustand
// VOR dem Schritt, sonst macht das erste Undo nichts.
function snapshot(){
  undoStack.push(serialize());
  if(undoStack.length>UNDO_MAX) undoStack.shift();
}
function undo(){
  if(!undoStack.length) return false;
  deserialize(JSON.parse(undoStack.pop()));
  recompute();
  return true;
}
```

`idSeq` ist bereits im `ui`-Block als `let idSeq=0;` deklariert und muss mitgesichert werden — sonst vergibt die Skizze nach einem Undo doppelte IDs.

- [ ] **Step 2: `snapshot()` vor jede Mutation setzen**

Vor jeder dieser Stellen ein `snapshot();` einfügen:
- Punkt anlegen (`M.pts.push` im `mousedown`-Handler)
- Punkt löschen (`contextmenu`-Handler, vor dem ersten `M.pts=…`)
- Wand anlegen oder entfernen (`M.walls.splice` / `M.walls.push`)
- Messung anlegen (`M.meas.push`)
- Messung löschen, stilllegen, reaktivieren, Wert ändern (in `renderPanel`)
- Ziehen: **einmal** beim `mousedown`, das den Zug beginnt — nicht bei jeder Mausbewegung

- [ ] **Step 3: Tastenkürzel**

Im vorhandenen `keydown`-Handler, **vor** der Modus-Umschaltung und innerhalb der bestehenden Prüfung auf Eingabefelder:

```js
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z'){
    e.preventDefault();
    if(!undo()) document.getElementById('hint').textContent='Nichts mehr rückgängig zu machen.';
    return;
  }
```

- [ ] **Step 4: Kern-Checks laufen lassen** — `node test/run.mjs`, unverändert grün

- [ ] **Step 5: Im Browser prüfen**

1. Vier Punkte anlegen, Strg+Z viermal → alle verschwinden einzeln.
2. Punkt, Wand, Messung anlegen, dann dreimal Strg+Z → jeweils der letzte Schritt zurück.
3. Punkt löschen (Rechtsklick), Strg+Z → Punkt **samt** seiner Wände und Messungen wieder da.
4. Punkt ziehen und loslassen, Strg+Z → Ausgangslage.
5. Nach Undo einen neuen Punkt anlegen → er bekommt keine bereits vergebene ID.

- [ ] **Step 6: Commit** — `git commit -m "feat: undo over a snapshot stack"`

---

### Task 4: Autosave und Import

**Files:** Modify `raumaufmass.html` (`ui`, Markup)

**Interfaces:** Consumes `serialize` / `deserialize` aus Task 3.

- [ ] **Step 1: Autosave**

Am Ende von `recompute()`:

```js
  // Ein Aufmass dauert leicht eine halbe Stunde. Ein Reload darf es nicht
  // kosten. Bewusst ohne Debounce: serialize() ist bei den hier realistischen
  // Groessen unter einer Millisekunde.
  try{ localStorage.setItem('raumaufmass', serialize()); }catch{}
```

Beim Start, vor dem abschließenden `recompute();` am Ende des `ui`-Blocks:

```js
try{
  const gespeichert=localStorage.getItem('raumaufmass');
  if(gespeichert){
    const o=JSON.parse(gespeichert);
    if(o && Array.isArray(o.pts) && o.pts.length) deserialize(o);
  }
}catch{}
```

- [ ] **Step 2: Import**

Neben dem Export-Knopf im Markup:

```html
  <button id="imp">JSON einfügen</button>
  <button id="clr">Alles verwerfen</button>
```

Im `ui`-Block:

```js
document.getElementById('imp').onclick=()=>{
  const s=prompt('JSON aus einem Export hier einfügen:');
  if(!s) return;
  let o; try{ o=JSON.parse(s); }catch{ alert('Das ist kein gültiges JSON.'); return; }
  if(!o || !Array.isArray(o.pts) || !Array.isArray(o.walls) || !Array.isArray(o.meas)){
    alert('JSON hat nicht die erwartete Form (pts, walls, meas).'); return;
  }
  snapshot();
  deserialize(o);
  // Ohne das vergibt die Skizze IDs, die im Import schon vorkommen.
  idSeq=Math.max(idSeq, o.pts.length);
  recompute();
};
document.getElementById('clr').onclick=()=>{
  if(!confirm('Alle Punkte, Wände und Messungen verwerfen?')) return;
  snapshot();
  deserialize({pts:[],walls:[],meas:[]});
  recompute();
};
```

- [ ] **Step 3: Export um die Wandlängen ergänzen**

Der Export enthält heute `pts`, `walls`, `meas`, `sigmaHat`. Damit ist er importierbar — nichts zu ändern. Prüfen, dass ein Export wieder eingelesen werden kann.

- [ ] **Step 4: Kern-Checks** — unverändert grün

- [ ] **Step 5: Im Browser prüfen**

1. Raum anlegen, Seite neu laden → Raum ist wieder da.
2. Exportieren, „Alles verwerfen", importieren → identischer Zustand, gleiche Maße in der Tabelle.
3. Unsinn ins Import-Feld → verständliche Meldung, Zustand unverändert.
4. Nach einem Import einen neuen Punkt anlegen → keine doppelte ID.
5. „Alles verwerfen", dann Strg+Z → alles wieder da.

- [ ] **Step 6: Commit** — `git commit -m "feat: autosave to localStorage, JSON import, discard-all"`

---

### Task 5: Eingabe umbauen — Meter, Wandklick, Doppelmessungen, kein Modal

Ersetzt `prompt()` durch ein Feld direkt am Ort, stellt die Einheit auf Meter um, macht Wände anklickbar und Doppelmessungen eingebbar.

**Files:** Modify `raumaufmass.html` (`ui`, Markup, `<style>`)

**Interfaces:**
- Produces: `nearestWall(wx,wy) -> {a,b} | null`, `enterMeasurement(a,b)` öffnet das Eingabefeld

- [ ] **Step 1: Eingabefeld ins Markup**

Im `#left`-Div, nach dem `<canvas>`:

```html
  <div id="entry" style="display:none;position:absolute;z-index:5;background:#fff;
       border:1px solid #333;border-radius:4px;padding:6px 8px;box-shadow:0 2px 8px #0003">
    <div id="entryLabel" style="font-size:12px;color:#444;margin-bottom:4px"></div>
    <input id="entryVal" inputmode="decimal" size="8" style="text-align:right"> m
    <button id="entryOk">✓</button>
  </div>
```

`#left` braucht `position:relative`, damit das Feld sich daran ausrichtet.

- [ ] **Step 2: Wandtreffer**

```js
// Abstand eines Punktes zu einer Strecke, plus Fusspunkt-Parameter.
function distToSeg(p,a,b){
  const vx=b.x-a.x, vy=b.y-a.y, L2=vx*vx+vy*vy;
  const t=L2? Math.max(0,Math.min(1,((p.x-a.x)*vx+(p.y-a.y)*vy)/L2)) : 0;
  return {d:Math.hypot(p.x-(a.x+vx*t), p.y-(a.y+vy*t)), t};
}
// Naechste Wand unter dem Cursor. Nur die mittleren 70 Prozent zaehlen -
// nahe den Enden soll der Eckpunkt gewinnen, sonst kaeme man nicht mehr an ihn heran.
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

- [ ] **Step 3: Eingabe am Ort statt Modal**

```js
let entryPair=null;
// Mass fuer ein Paar eintragen. Einheit ist METER - die Tabelle zeigt Meter,
// der Laser zeigt Meter, und die frueher hier verlangten Millimeter waren die
// Ursache dafuer, dass ein getipptes "4.250" einen 4,25-mm-Raum ergab, ohne
// dass eine Pruefung anschlug: sind alle Masse gleich falsch, ist das Netz
// konsistent, und Geometrie ist massstabsinvariant.
function enterMeasurement(a,b){
  const P=M.fit?M.fit.pts:M.pts, I=C.idx(P);
  if(I[a]==null||I[b]==null) return;
  entryPair={a,b};
  const mid={x:(P[I[a]].x+P[I[b]].x)/2, y:(P[I[a]].y+P[I[b]].y)/2};
  const s=toScr(mid), dpr=devicePixelRatio||1;
  const box=document.getElementById('entry');
  box.style.display='block';
  box.style.left=(s.x/dpr-60)+'px';
  box.style.top =(s.y/dpr-18)+'px';
  const vorhanden=M.meas.filter(m=>(m.a===a&&m.b===b)||(m.a===b&&m.b===a));
  document.getElementById('entryLabel').textContent = vorhanden.length
    ? `${a}–${b} — bisher ${vorhanden.map(m=>fmtM(m.d)).join(', ')} m, weiterer Wert:`
    : `${a}–${b}`;
  const inp=document.getElementById('entryVal');
  inp.value=''; inp.focus();
}
function closeEntry(){ entryPair=null; document.getElementById('entry').style.display='none'; }
function commitEntry(){
  if(!entryPair) return;
  const inp=document.getElementById('entryVal');
  const d=parseFloat(inp.value.replace(',','.'))*1000;
  if(!isFinite(d)||d<=0){ inp.style.background='#fdd'; return; }
  if(d<100 && !confirm(`${fmtM(d)} m ist sehr kurz — als Meter gemeint?\n\nOK = so übernehmen`)) return;
  snapshot();
  M.meas.push({a:entryPair.a, b:entryPair.b, d, sigma:C.SIGMA_DEF, on:true});
  closeEntry();
  recompute();
}
document.getElementById('entryOk').onclick=commitEntry;
document.getElementById('entryVal').addEventListener('keydown',e=>{
  e.stopPropagation();                       // Modus-Kuerzel duerfen hier nicht feuern
  if(e.key==='Enter') commitEntry();
  if(e.key==='Escape') closeEntry();
});
```

- [ ] **Step 4: Handler umstellen**

Im `mousedown`-Handler: im Messmodus zuerst auf eine Wand prüfen, bevor auf Punkte geprüft wird.

```js
  if(M.mode==='measure' && !h){
    const wall=nearestWall(w.x,w.y);
    if(wall){ enterMeasurement(wall.a, wall.b); return; }
  }
```

Und den bisherigen `prompt`-Zweig für das fertige Punktepaar durch `enterMeasurement(a,b);` ersetzen.

- [ ] **Step 5: Tabellen-Eingabe bleibt in Metern**

Die Bearbeitung in der Messtabelle rechnet bereits mit `*1000` und zeigt `fmtM`. Prüfen, dass sie unverändert bleibt — beide Wege sprechen jetzt Meter.

- [ ] **Step 6: Kern-Checks** — unverändert grün

- [ ] **Step 7: Im Browser prüfen**

1. Im Messmodus **auf die Mitte einer Wand** klicken → Feld erscheint an der Wand, ohne zwei Punktklicks.
2. `4.25` eintippen, Enter → Tabelle zeigt `4.250`, **nicht** `0.004`.
3. Dieselbe Wand nochmals klicken → Feld nennt den bisherigen Wert, neuer Wert wird ergänzt. Tabelle zeigt **zwei** Zeilen für das Paar, beide mit `Red.` > 0.
4. Nahe an einem Eckpunkt klicken → Punkt gewinnt, nicht die Wand.
5. Zwei Punkte ohne Wand dazwischen → Diagonale wie bisher über zwei Klicks.
6. `0.05` eintippen → Rückfrage.
7. Im Feld `1` tippen → Modus wechselt **nicht**.
8. Esc im Feld → Eingabe verworfen, nichts angelegt.

- [ ] **Step 8: Commit** — `git commit -m "feat: enter lengths in metres by clicking a wall, repeats allowed"`

---

### Task 6: Eingeschränktes Ziehen in der Oberfläche

**Files:** Modify `raumaufmass.html` (`ui`)

- [ ] **Step 1: `mousemove`-Handler ersetzen**

```js
// Ziehen kennt drei Lagen:
//  - noch keine Messung: die Skizze ist frei
//  - dof > 0: der Punkt folgt der Maus so weit, wie die Messungen es zulassen
//  - dof = 0: die Form ist bestimmt, es bleibt das Verschieben des ganzen Raums
cv.addEventListener('mousemove',e=>{
  if(!M.drag) return;
  const r=cv.getBoundingClientRect(), dpr=devicePixelRatio||1;
  const w=toWorld((e.clientX-r.left)*dpr, (e.clientY-r.top)*dpr);
  const i=M.pts.findIndex(x=>x.id===M.drag);
  if(i<0) return;
  const dx=w.x-M.pts[i].x, dy=w.y-M.pts[i].y;
  if(!M.an){
    M.dragMode='frei';
    M.pts[i].x=w.x; M.pts[i].y=w.y;
  } else if(M.an.dof>0){
    M.dragMode='moden';
    const moved=C.dragAlongModes(M.pts, M.an.modes, i, dx, dy);
    if(moved){
      const fit=C.solve(moved, M.meas);     // Korrektor: zurueck auf die Messungen
      fit.pts.forEach((p,q)=>{ M.pts[q].x=p.x; M.pts[q].y=p.y; });
    }
  } else {
    M.dragMode='starr';
    M.pts.forEach(p=>{ p.x+=dx; p.y+=dy; });
  }
  render();
});
```

`dragMode:null` in `M` ergänzen.

- [ ] **Step 2: Hinweis während des Zugs**

In `render()`, im Punkte-Block:

```js
  if(M.drag && M.dragMode){
    document.getElementById('hint').textContent =
      {frei:'Skizze frei — noch keine Messung',
       moden:'Punkt folgt den Messungen',
       starr:'Raum ist bestimmt — nur verschiebbar, Maß ändern statt ziehen'}[M.dragMode];
  }
```

- [ ] **Step 3: Kern-Checks** — unverändert grün

- [ ] **Step 4: Im Browser prüfen**

1. Vier Punkte, vier Wände, keine Messung → Punkt folgt der Maus, Hinweis „Skizze frei".
2. Vier Seiten messen (`dof=1`), Punkt C ziehen → schert zum Parallelogramm, die vier Maße in der Tabelle bleiben unverändert, Hinweis „Punkt folgt den Messungen".
3. Diagonale messen (`dof=0`), ziehen → ganzer Raum verschiebt sich, Form bleibt.
4. Nach jedem Zug Strg+Z → Ausgangslage.

- [ ] **Step 5: Commit** — `git commit -m "feat: dragging respects the constraints already measured"`

---

### Task 7: Canvas — rote Vorschlagslinien, Maße an den Linien

**Files:** Modify `raumaufmass.html` (`ui`, Markup-Legende)

- [ ] **Step 1: Vorschläge einmal je Änderung rechnen**

`renderPanel()` ruft heute `C.suggest(...)` bei jedem Bild auf — auch bei jeder Mausbewegung im Zug, bei 24 Punkten 172 ms. In `recompute()`, nach dem Setzen von `M.an`:

```js
  // Einmal je Aenderung, nicht je Bild: suggest() ruft intern analyze() je
  // Kandidat auf, im Zug waere das ein Ruckeln.
  M.sugg = (M.an && M.pts.length>=3)
    ? C.suggest(M.fit?M.fit.pts:M.pts, M.walls, M.meas) : [];
```

`sugg:[]` in `M` ergänzen, in `renderPanel()` den Aufruf durch `M.sugg` ersetzen.

- [ ] **Step 2: Zeichnen**

In `render()`, nach dem Messungen-Block, vor dem Punkte-Block:

```js
  // Noch fehlende Messungen rot gestrichelt. Anderes Strichmuster als die
  // gruenen vorhandenen - Rot gegen Gruen allein waere fuer Rotgruenblinde
  // nicht unterscheidbar.
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

- [ ] **Step 3: Maße an den Linien**

Ebenfalls in `render()`, nach dem Messungen-Block:

```js
  // Jede Messung beschriftet - sonst sieht man Striche und weiss nicht, welcher
  // 4,25 m ist. Bei mehreren Werten fuers selbe Paar die Anzahl dazu.
  ctx.font=`${11*dpr}px system-ui`; ctx.textAlign='center';
  const gezeigt=new Set();
  C.activeMeas(M.meas).forEach(m=>{
    if(I[m.a]==null||I[m.b]==null) return;
    const k=[m.a,m.b].sort().join('|');
    if(gezeigt.has(k)) return;
    gezeigt.add(k);
    const alle=C.activeMeas(M.meas).filter(x=>[x.a,x.b].sort().join('|')===k);
    const p=toScr(P[I[m.a]]), q=toScr(P[I[m.b]]);
    const txt=alle.length>1 ? `${fmtM(m.d)} (${alle.length}×)` : fmtM(m.d);
    const mx=(p.x+q.x)/2, my=(p.y+q.y)/2;
    ctx.fillStyle='#fff'; ctx.fillRect(mx-22*dpr, my-8*dpr, 44*dpr, 14*dpr);
    ctx.fillStyle='#3a7'; ctx.fillText(txt, mx, my+3*dpr);
  });
  ctx.textAlign='start';
```

- [ ] **Step 4: Legende**

In der Legenden-Zeile unter den Modusknöpfen, vor dem Ellipsen-Eintrag:

```html
      <span style="color:#3a7">– – –</span> gemessen &nbsp;
      <span style="color:#d33">· · ·</span> noch zu messen &nbsp;
```

- [ ] **Step 5: Kern-Checks** — unverändert grün

- [ ] **Step 6: Im Browser prüfen**

L-Raum, sechs Punkte, sechs Wände, sechs Wandlängen gemessen.
1. Drei rot gestrichelte Linien zwischen genau den Paaren aus *Damit der Raum bestimmt ist*.
2. Die zweite Gruppe feiner gepunktet.
3. **`C ↔ F` erscheint nirgends** — verlässt den Raum.
4. Jede grüne Linie trägt ihr Maß.
5. Eine Wand zweimal messen → Beschriftung zeigt `(2×)`.
6. Vorgeschlagenes Maß eintragen → die rote Linie wird grün.

- [ ] **Step 7: Commit** — `git commit -m "feat: draw pending measurements in red, label the measured ones"`

---

### Task 8: Escape und Wandzug in einem Klick

**Files:** Modify `raumaufmass.html` (`ui`, Markup)

- [ ] **Step 1: Escape**

Im `keydown`-Handler:

```js
  if(e.key==='Escape'){
    if(entryPair){ closeEntry(); return; }
    if(M.sel.length){ M.sel=[]; render(); return; }
  }
```

- [ ] **Step 2: Wandzug schließen**

Knopf im Markup, neben den Modusknöpfen:

```html
    <button id="ring" title="Alle Punkte in Anlegereihenfolge zu einem geschlossenen Wandzug verbinden">Wandzug schließen</button>
```

```js
document.getElementById('ring').onclick=()=>{
  if(M.pts.length<3){ alert('Mindestens 3 Punkte nötig.'); return; }
  snapshot();
  // In Anlegereihenfolge verbinden - genau so, wie der Nutzer den Raum
  // abgelaufen ist. Ersetzt den bestehenden Zug, statt ihn zu ergaenzen.
  M.walls=M.pts.map((p,i)=>[p.id, M.pts[(i+1)%M.pts.length].id]);
  recompute();
};
```

- [ ] **Step 3: Kern-Checks** — unverändert grün

- [ ] **Step 4: Im Browser prüfen**

1. Sechs Punkte im Uhrzeigersinn anlegen, „Wandzug schließen" → geschlossener Ring, Statuszeile meldet keine offene Kette mehr.
2. Halb angefangene Wandauswahl, Esc → Auswahl aufgehoben, keine Wand angelegt.
3. Eingabefeld offen, Esc → Feld zu, keine Messung angelegt.
4. Strg+Z nach „Wandzug schließen" → alter Zustand.

- [ ] **Step 5: Commit** — `git commit -m "feat: escape cancels, one click closes the wall ring"`

---

### Task 9: Panel — σ je Messung, Fläche und Umfang

**Files:** Modify `raumaufmass.html` (`ui`, Markup)

- [ ] **Step 1: σ-Spalte**

Der Kern liest `mm.sigma ?? SIGMA_DEF` und ist darauf getestet, aber die Oberfläche schreibt bei jeder Messung fest `SIGMA_DEF`. Kopfzeile der Tabelle um `<th>σ [mm]</th>` vor der Knopfspalte ergänzen, und in der Zeile:

```js
      `<td><input class="sig" value="${m.sigma??C.SIGMA_DEF}" size="3" style="text-align:right"></td>`+
```

```js
    const sig=tr.querySelector('.sig');
    sig.onchange=()=>{
      const v=parseFloat(sig.value.replace(',','.'));
      if(isFinite(v)&&v>0){ snapshot(); m.sigma=v; recompute(); }
      else { sig.value=m.sigma??C.SIGMA_DEF; alert('σ muss eine Zahl größer 0 sein.'); }
    };
```

- [ ] **Step 2: Fläche und Umfang**

Unter der Wandlängen-Liste im Markup:

```html
  <div id="geo" style="font-size:13px;margin-top:6px"></div>
```

Am Ende von `renderPanel()`:

```js
  // Flaeche nur, wenn der Wandzug geschlossen ist - sonst ist sie nicht definiert.
  const poly=C.wallPolygon(P, M.walls);
  const g=document.getElementById('geo');
  if(poly){
    let a=0, u=0;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      a+=poly[j].x*poly[i].y-poly[i].x*poly[j].y;
      u+=C.dist(poly[j],poly[i]);
    }
    g.textContent=`Fläche ${(Math.abs(a)/2/1e6).toFixed(2)} m² · Umfang ${(u/1000).toFixed(2)} m`;
  } else {
    g.textContent='Fläche erst mit geschlossenem Wandzug';
  }
```

- [ ] **Step 3: Kern-Checks** — unverändert grün

- [ ] **Step 4: Im Browser prüfen**

1. Rechteck 4 × 3 m → `Fläche 12.00 m² · Umfang 14.00 m`.
2. Eine Wand entfernen → Hinweis auf den offenen Zug.
3. σ einer Messung auf 20 setzen → `w` dieser Zeile fällt sichtbar, die Zeile rutscht in der Sortierung.
4. σ auf 0 setzen → Meldung, alter Wert bleibt.

- [ ] **Step 5: Commit** — `git commit -m "feat: per-measurement sigma, room area and perimeter"`

---

### Task 10: Panel — Verknüpfung zur Zeichnung

**Files:** Modify `raumaufmass.html` (`ui`)

- [ ] **Step 1: Hervorhebung im Zustand**

`highlight:null` in `M` ergänzen. In `render()`, im Messungen-Block, die hervorgehobene Strecke dicker und dunkler zeichnen:

```js
    const hl = M.highlight && ((M.highlight.a===m.a&&M.highlight.b===m.b)||(M.highlight.a===m.b&&M.highlight.b===m.a));
    ctx.strokeStyle = hl ? '#063' : '#3a7';
    ctx.lineWidth   = (hl?3:1)*dpr;
```

Analog im Vorschlags-Block mit `'#900'` statt `'#d33'`.

- [ ] **Step 2: Tabellenzeilen verknüpfen**

In `renderPanel()`, je Zeile:

```js
    tr.onmouseenter=()=>{ M.highlight={a:m.a,b:m.b}; render(); };
    tr.onmouseleave=()=>{ M.highlight=null; render(); };
```

- [ ] **Step 3: Vorschläge anklickbar**

Die Vorschlagsliste ist heute reiner Text. Als Knöpfe bauen:

```js
  const grp=(t,w)=>{
    const e=list.filter(s=>s.why===w);
    if(!e.length) return '';
    return `<div style="margin-bottom:6px"><b>${t}</b><br>`
      + e.map((s,i)=>`<button class="sg" data-a="${s.a}" data-b="${s.b}">${s.a} ↔ ${s.b}${s.repeat?' (nochmal)':''}</button>`).join(' ')
      + '</div>';
  };
```

Nach dem Setzen von `sg.innerHTML`:

```js
  sg.querySelectorAll('button.sg').forEach(b=>{
    b.onmouseenter=()=>{ M.highlight={a:b.dataset.a,b:b.dataset.b}; render(); };
    b.onmouseleave=()=>{ M.highlight=null; render(); };
    b.onclick=()=>{ M.highlight=null; enterMeasurement(b.dataset.a, b.dataset.b); };
  });
```

- [ ] **Step 4: Kern-Checks** — unverändert grün

- [ ] **Step 5: Im Browser prüfen**

1. Über eine Tabellenzeile fahren → genau diese Strecke wird im Plan dick hervorgehoben.
2. Über einen Vorschlag fahren → die zugehörige rote Linie wird hervorgehoben.
3. Vorschlag anklicken → Eingabefeld öffnet sich direkt für dieses Paar, ohne Punktklicks.
4. Ein Vorschlag mit `repeat` trägt „(nochmal)".

- [ ] **Step 6: Commit** — `git commit -m "feat: hover links table and suggestions to the drawing, suggestions are clickable"`

---

### Task 11: Wände dürfen sich nicht kreuzen

Klingt selbstverständlich, ist aber heute nicht geprüft — und das Fehlen ist kein Schönheitsfehler. Nachgemessen an einem gekreuzten Viereck (A–B–C–D mit vertauschten Ecken):

```
wallPolygon:                    laesst 4 Ecken als gueltig durch
pointInPoly Mitte (2000,1500):  false     <- die Raummitte gilt als aussen
segInPoly A-D:                  false     <- gueltige Diagonale verworfen
Flaeche daraus:                 0.00 m2   <- statt 12.00
```

Der Messbarkeitsfilter und die Flächenanzeige liefern stillschweigend Unsinn.

**Files:** Modify `raumaufmass.html` (`core`, `checks`, `ui`)

**Interfaces:**
- Produces: `CORE.ringSelfIntersects(poly) -> bool`. `wallPolygon` liefert `null` bei gekreuztem Zug. `CORE.wallCrossesExisting(pts, walls, a, b) -> bool` für die Prüfung vor dem Anlegen.

- [ ] **Step 1: Fehlschlagenden Test schreiben**

```js
  // --- Waende duerfen sich nicht kreuzen ---
  {
    const bow=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:0,y:3000},{id:'D',x:4000,y:3000}];
    const walls=[['A','B'],['B','C'],['C','D'],['D','A']];
    chk('ringSelfIntersects: gekreuztes Viereck erkannt',
       C.ringSelfIntersects(C.wallPolygonRaw ? C.wallPolygonRaw(bow,walls) : bow)===true);
    chk('wallPolygon: gekreuzter Zug -> null', C.wallPolygon(bow,walls)===null);
    const ok=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    chk('wallPolygon: sauberes Rechteck weiterhin gueltig',
       C.wallPolygon(ok,walls)!==null);
    chk('ringSelfIntersects: sauberes Rechteck ist frei', C.ringSelfIntersects(ok)===false);
    // L-Raum aus der Spec muss weiter durchgehen
    const L=[{id:'A',x:0,y:0},{id:'B',x:8000,y:0},{id:'C',x:8000,y:2000},
             {id:'D',x:3000,y:2000},{id:'E',x:3000,y:5000},{id:'F',x:0,y:5000}];
    chk('ringSelfIntersects: L-Raum ist frei', C.ringSelfIntersects(L)===false);
    // Vor dem Anlegen pruefen
    const drei=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    chk('wallCrossesExisting: Diagonale kreuzt nichts, wenn nur eine Wand da ist',
       C.wallCrossesExisting(drei,[['A','B']],'C','D')===false);
    chk('wallCrossesExisting: kreuzende Wand erkannt',
       C.wallCrossesExisting(drei,[['A','C']],'B','D')===true);
  }
```

- [ ] **Step 2: Fehlschlag prüfen** — FAIL, `C.ringSelfIntersects is not a function`

- [ ] **Step 3: Implementieren**

Im Block `core`, bei den Polygon-Funktionen:

```js
// Echter Schnitt zweier Strecken, gemeinsame Endpunkte zaehlen nicht.
function segCross(p1,p2,p3,p4){
  const d=(p2.x-p1.x)*(p4.y-p3.y)-(p2.y-p1.y)*(p4.x-p3.x);
  if(Math.abs(d)<1e-12) return false;
  const t=((p3.x-p1.x)*(p4.y-p3.y)-(p3.y-p1.y)*(p4.x-p3.x))/d;
  const u=((p3.x-p1.x)*(p2.y-p1.y)-(p3.y-p1.y)*(p2.x-p1.x))/d;
  const e=1e-9;
  return t>e && t<1-e && u>e && u<1-e;
}
// Ein Raum ist ein EINFACHES Polygon. Kreuzen sich zwei Waende, ist es keins -
// und dann liefern pointInPoly, segInPoly und die Flaeche stillschweigend
// Unsinn: bei einem gekreuzten Viereck gilt die Raummitte als aussen und die
// Flaeche kommt als 0 heraus.
function ringSelfIntersects(poly){
  const n=poly.length;
  for(let i=0;i<n;i++){
    const a1=poly[i], a2=poly[(i+1)%n];
    for(let j=i+1;j<n;j++){
      if(j===i || (j+1)%n===i || (i+1)%n===j) continue;   // benachbarte Kanten
      if(segCross(a1,a2,poly[j],poly[(j+1)%n])) return true;
    }
  }
  return false;
}
// Wuerde eine neue Wand a-b eine bestehende kreuzen?
function wallCrossesExisting(pts, walls, a, b){
  const I=idx(pts);
  if(I[a]==null||I[b]==null) return false;
  const p=pts[I[a]], q=pts[I[b]];
  return walls.some(([c,d])=>{
    if(c===a||c===b||d===a||d===b) return false;          // teilt einen Endpunkt
    if(I[c]==null||I[d]==null) return false;
    return segCross(p,q,pts[I[c]],pts[I[d]]);
  });
}
```

In `wallPolygon`, direkt vor dem `return order.map(...)`:

```js
  const ring=order.map(id=>pts[I[id]]);
  if(ringSelfIntersects(ring)) return null;   // kein einfaches Polygon
  return ring;
```

Alle drei in `globalThis.CORE` aufnehmen.

- [ ] **Step 4: Anlegen verhindern**

Im `mousedown`-Handler, im Wandmodus, vor `M.walls.push([a,b])`:

```js
      if(C.wallCrossesExisting(M.fit?M.fit.pts:M.pts, M.walls, a, b)){
        document.getElementById('hint').textContent =
          'Diese Wand würde eine bestehende kreuzen — nicht angelegt.';
        render(); return;
      }
```

- [ ] **Step 5: Nach einem Zug melden**

Die Statuszeile hat bereits einen Zweig für den nicht geschlossenen Wandzug. Da `wallPolygon` jetzt auch bei Überschneidung `null` liefert, muss die Meldung beide Fälle unterscheiden. In `statusText` bzw. beim Wandzug-Hinweis:

```js
  // wallPolygon liefert null aus zwei Gruenden - sie brauchen verschiedene Hinweise.
  const ring=C.wallPolygonRing ? C.wallPolygonRing(P,M.walls) : null;
  const txt = M.walls.length===0 ? ''
    : C.wallPolygon(P,M.walls) ? ''
    : (ring && C.ringSelfIntersects(ring))
      ? 'Wände kreuzen sich — Fläche und Vorschlagsfilter sind ausgesetzt.'
      : 'Wandzug ist nicht geschlossen — Vorschläge sind ungefiltert.';
```

Damit der Ring auch im ungültigen Fall zur Verfügung steht, `wallPolygon` in zwei Teile trennen: `wallPolygonRing(pts, walls)` liefert die Ecken-Reihenfolge ohne die Überschneidungsprüfung (oder `null`, wenn es gar kein geschlossener Zug ist), und `wallPolygon` ruft es auf und verwirft bei Überschneidung. Beide exportieren.

- [ ] **Step 6: Kern-Checks** — `node test/run.mjs`, 113 + neue grün

- [ ] **Step 7: Im Browser prüfen**

1. Vier Punkte, Wände A–B, B–C, C–D, D–A in Rechteck-Reihenfolge → Fläche 12,00 m².
2. Neue Wand anlegen, die eine bestehende kreuzt → wird abgelehnt, Hinweis erscheint, kein Eintrag in `M.walls`.
3. Punkte so anlegen, dass der Zug sich kreuzt, dann „Wandzug schließen" → Meldung „Wände kreuzen sich", Fläche wird nicht behauptet.
4. Kreuzung durch Ziehen auflösen → Meldung verschwindet, Fläche erscheint.

- [ ] **Step 8: Commit** — `git commit -m "feat: reject crossing walls, a room is a simple polygon"`

---

## Selbstreview des Plans

**Abdeckung**

| Anforderung / Vorschlag | Task |
|---|---|
| Punkte ziehen solange Freiheitsgrade bestehen | 1, 6 |
| Wandlänge per Klick auf die Wand | 5 |
| A→B und B→A gleichzeitig | Kern kann es; 5 macht es eingebbar, 2 vorschlagbar |
| Fehlende Messungen rot gestrichelt | 7 |
| 0 Einheiten vereinheitlichen | 5 |
| 1 `prompt()` raus | 5 |
| 2 Autosave | 4 |
| 3 Undo | 3 |
| 4 Vorschläge anklickbar | 10 |
| 5 Tabelle ↔ Zeichnung | 10 |
| 6 Wandzug in einem Klick | 8 |
| 9 Import | 4 |
| 10 σ je Messung | 9 |
| 11 Maße an den Linien | 7 |
| 12 Escape | 8 |
| 13 Fläche und Umfang | 9 |
| Wände dürfen sich nicht kreuzen | 11 |

Abgewählt: 7 Zoom/Pan, 8 Punktnamen, 14 Spiegeln.

**Task 11 ist eine Fehlerbehebung, kein Komfort.** Ein gekreuzter Wandzug geht heute als gültiges Polygon durch; die Raummitte gilt dann als außerhalb, gültige Diagonalen werden verworfen, und die Fläche kommt als 0,00 m² statt 12,00 m² heraus. Sie läuft zuletzt, weil sie die Statuszeile aus Task 9 und den Wandmodus aus Task 8 anfasst.

**Reihenfolge.** Kern zuerst (1, 2), dann die Zustandsverwaltung (3, 4) — alles Spätere mutiert Zustand und hängt sich an `snapshot()`. Danach die Eingabe (5), weil Task 10 `enterMeasurement` aufruft. Ziehen (6) nach Undo, damit Züge rücknehmbar sind.

**Nebenbefund, in Task 7 behoben:** `renderPanel()` rief `suggest()` je Bild auf, also auch bei jeder Mausbewegung im Zug — bei 24 Punkten 172 ms. Mit dem eingeschränkten Ziehen aus Task 6 wäre daraus ein Ruckeln geworden.

**Typkonsistenz geprüft.** `dragAlongModes(pts, modes, i, dx, dy)` in 1 und 6 gleich. `serialize`/`deserialize`/`snapshot` in 3 definiert, in 4, 5, 8, 9 benutzt. `enterMeasurement(a,b)` in 5 definiert, in 10 aufgerufen. `nearestWall` liefert `{a,b}`. `M.sugg` in 7 angelegt, in 7 und 10 gelesen. `M.highlight` in 10. `pairMeasurable(pts, walls, poly, aId, bId)` — Listen und IDs.

**Bekannte Grenze.** Undo sichert Punkte, Wände, Messungen und `idSeq` — nicht die Ansicht. Nach einem Undo kann die Ansicht anders stehen; das ist gewollt, `autofit` richtet sie ohnehin neu aus.
