# Raumaufmaß-Scratchpad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein eigenständiges Werkzeug `raumaufmass.html`, das aus grob geklickten Punkten und verrauschten Distanzmessungen einen Raum ausgleicht, den wahrscheinlichsten Ausreißer benennt und sagt, welche Messungen noch fehlen.

**Architecture:** Eine self-contained HTML-Datei mit drei getrennten `<script>`-Blöcken: `core` (reine Mathematik, kein DOM), `ui` (DOM-Anbindung) und `checks` (Selbsttests). Der Core-Block hängt sein API an `globalThis.CORE`. Ein winziger Node-Runner schneidet `core` und `checks` aus der HTML-Datei und führt sie aus — dadurch bleibt die Datei self-contained und die Tests laufen trotzdem in Millisekunden auf der Kommandozeile.

**Tech Stack:** Vanilla JavaScript, keine Dependencies, kein Build. Node ≥ 20 nur als Test-Runner (vorhanden: v26). Canvas 2D für die Zeichnung.

**Spec:** [`docs/superpowers/specs/2026-07-25-raumaufmass-design.md`](../specs/2026-07-25-raumaufmass-design.md)

## Global Constraints

- Alle Längen intern in **mm**. Anzeige in m oder mm, nie gemischt in einer Spalte.
- `raumaufmass.html` bleibt **self-contained**: kein `<script src>`, kein `<link href>`, keine externe Ressource. Alles inline.
- **`verlegeplan.html` wird nicht angefasst.** Kein gemeinsamer Code, keine Imports.
- Der `core`-Block darf **kein** `document`, `window`, `canvas` oder sonstiges DOM berühren — sonst bricht der Node-Runner.
- Der `core`-Block endet mit `globalThis.CORE = {…}`. Nur so kommen `ui` und `checks` an die Funktionen.
- Feste Schwellen aus der Spec, wörtlich: `TOL_RANK = 1e-8` (relativ zur größten Spaltennorm), `TOL_RED = 0.01`, `TOL_MODE = 0.05`, `SIGMA_DEF = 5` (mm), `SUGGEST_CHECK_MAX = 3`.
- **Koordinaten sind eichabhängig, Abstände nicht.** Die Lage und Drehung des Ergebnisses hängt an der Skizze — ein Test, der absolute Koordinaten mit einer Wunschlösung vergleicht, schlägt fehl, obwohl die Form stimmt. Jede Prüfung der Rekonstruktion vergleicht deshalb **Abstände**, nie `x`/`y`.
- Alle Zahlenwerte in den Tests dieses Plans sind vorab durchgerechnet und treffen zu. Weicht ein Ergebnis ab, liegt der Fehler in der Implementierung, nicht im Sollwert.
- Kommentare und UI-Texte auf Deutsch, Code-Bezeichner englisch — wie in `verlegeplan.html`.
- Jede Task endet mit einem grünen `node test/run.mjs`.

## File Structure

| Datei | Verantwortung |
|---|---|
| `raumaufmass.html` (neu) | alles: Style, Markup, `core`, `ui`, `checks` |
| `test/run.mjs` (neu) | schneidet `core`+`checks` aus der HTML, führt aus, Exit-Code |

Die Ein-Datei-Struktur folgt dem etablierten Muster des Repos (`verlegeplan.html`) und ist in der Spec festgelegt. Die Trennung in drei `<script>`-Blöcke ist die Grenze, die den Mathe-Kern testbar hält.

---

### Task 1: Gerüst, Test-Runner und `residuals`

**Files:**
- Create: `raumaufmass.html`
- Create: `test/run.mjs`

**Interfaces:**
- Consumes: nichts
- Produces: `CORE.dist(p,q) -> number`, `CORE.idx(pts) -> {id:index}`, `CORE.activeMeas(meas) -> meas[]`, `CORE.residuals(pts, meas) -> number[]`. Punkt: `{id, x, y}`. Messung: `{a, b, d, sigma, on}`.

- [ ] **Step 1: Gerüst anlegen**

Erstelle `raumaufmass.html`:

```html
<!doctype html>
<meta charset="utf-8">
<title>Raumaufmaß</title>
<style>
  body{font:14px/1.4 system-ui,sans-serif;margin:0;padding:16px}
</style>
<div id="app"></div>

<script id="core">
"use strict";
// ================= Konstanten =================
const TOL_RANK = 1e-8;   // Rangtoleranz, relativ zur größten Spaltennorm
const TOL_RED  = 0.01;   // darunter gilt eine Messung als nicht prüfbar
const TOL_MODE = 0.05;   // Anteil am Flex-Mode -> Pfeil statt Ellipse
const SIGMA_DEF = 5;     // angenommene Standardabweichung je Messung, mm
const SUGGEST_CHECK_MAX = 3;  // Deckel der Vorschlaege zur Pruefbarkeit

// ================= Grundlagen =================
const dist=(p,q)=>Math.hypot(p.x-q.x, p.y-q.y);
const idx=pts=>{ const m={}; pts.forEach((p,i)=>m[p.id]=i); return m; };
const activeMeas=meas=>meas.filter(m=>m.on!==false);

globalThis.CORE={ TOL_RANK, TOL_RED, TOL_MODE, SIGMA_DEF, SUGGEST_CHECK_MAX,
                  dist, idx, activeMeas };
</script>

<script id="checks">
"use strict";
globalThis.selfChecks=function(){
  const C=globalThis.CORE, out=[]; let ok=true;
  const A=(n,c)=>{ ok=ok&&!!c; out.push((c?'PASS ':'FAIL ')+n); };
  const near=(a,b,t)=>Math.abs(a-b)<=t;
  return {ok, out};
};
</script>
```

- [ ] **Step 2: Test-Runner anlegen**

Erstelle `test/run.mjs`:

```js
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../raumaufmass.html', import.meta.url),'utf8');
const pick=id=>{
  const m=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`));
  if(!m) throw new Error(`Script-Block "${id}" nicht gefunden`);
  return m[1];
};
new Function(pick('core')+'\n'+pick('checks'))();
const r=globalThis.selfChecks();
console.log(r.out.join('\n'));
console.log(r.ok?'\nALLE CHECKS GRÜN':'\nCHECKS ROT');
process.exit(r.ok?0:1);
```

- [ ] **Step 3: Runner laufen lassen (muss grün sein, noch ohne Checks)**

Run: `node test/run.mjs`
Expected: `ALLE CHECKS GRÜN`, Exit 0. Wenn "Script-Block nicht gefunden" kommt, stimmen die `<script id="…">`-Tags nicht exakt.

- [ ] **Step 4: Fehlschlagenden Test für `residuals` schreiben**

In `raumaufmass.html`, Block `checks`, direkt vor `return {ok, out};` einfügen:

```js
  // --- residuals ---
  {
    const pts=[{id:'A',x:0,y:0},{id:'B',x:3000,y:4000}];
    const meas=[{a:'A',b:'B',d:5000},{a:'A',b:'B',d:4980}];
    const v=C.residuals(pts,meas);
    A('residuals: exakte Messung -> 0', near(v[0],0,1e-9));
    A('residuals: 20mm zu kurz gemessen -> +20', near(v[1],20,1e-9));
  }
  {
    const pts=[{id:'A',x:0,y:0},{id:'B',x:1000,y:0}];
    const meas=[{a:'A',b:'B',d:900},{a:'A',b:'B',d:800,on:false}];
    A('residuals: on:false wird ignoriert', C.residuals(pts,meas).length===1);
  }
```

- [ ] **Step 5: Test laufen lassen, Fehlschlag prüfen**

Run: `node test/run.mjs`
Expected: FAIL, Fehlermeldung `C.residuals is not a function`, Exit-Code ungleich 0.

- [ ] **Step 6: `residuals` implementieren**

Im Block `core`, vor der `globalThis.CORE`-Zeile:

```js
function residuals(pts, meas){
  const I=idx(pts);
  return activeMeas(meas).map(m=>dist(pts[I[m.a]], pts[I[m.b]]) - m.d);
}
```

Und `residuals` in das `globalThis.CORE`-Objekt aufnehmen.

- [ ] **Step 7: Test laufen lassen, grün prüfen**

Run: `node test/run.mjs`
Expected: drei `PASS`-Zeilen, `ALLE CHECKS GRÜN`, Exit 0.

- [ ] **Step 8: Commit**

```bash
git add raumaufmass.html test/run.mjs
git commit -m "feat: raumaufmass skeleton, node test runner, residuals"
```

---

### Task 2: `jacobian`

**Files:**
- Modify: `raumaufmass.html` (Blöcke `core` und `checks`)

**Interfaces:**
- Consumes: `dist`, `idx`, `activeMeas` aus Task 1
- Produces: `CORE.jacobian(pts, meas) -> number[][]` — m Zeilen à 2n Spalten. Zeile i gehört zur i-ten *aktiven* Messung; Spaltenreihenfolge ist `[x0,y0,x1,y1,…]`.

- [ ] **Step 1: Fehlschlagende Tests schreiben**

Im Block `checks` vor `return {ok, out};`:

```js
  // --- jacobian ---
  {
    const pts=[{id:'A',x:0,y:0},{id:'B',x:1000,y:0}];
    const J=C.jacobian(pts,[{a:'A',b:'B',d:900}]);
    A('jacobian: Form 1x4', J.length===1 && J[0].length===4);
    A('jacobian: waagerechte Kante -> [-1,0,1,0]',
      near(J[0][0],-1,1e-9)&&near(J[0][1],0,1e-9)&&near(J[0][2],1,1e-9)&&near(J[0][3],0,1e-9));
  }
  {
    // Starrbewegungen liegen im Nullraum: J*t = 0 fuer Translation und Drehung
    const pts=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:1500,y:2500}];
    const meas=[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:1},{a:'C',b:'A',d:1}];
    const J=C.jacobian(pts,meas);
    const tx=[],ty=[],rot=[];
    pts.forEach(p=>{ tx.push(1,0); ty.push(0,1); rot.push(-p.y,p.x); });
    const mul=(row,t)=>row.reduce((s,x,i)=>s+x*t[i],0);
    A('jacobian: Translation x im Nullraum', J.every(r=>near(mul(r,tx),0,1e-9)));
    A('jacobian: Translation y im Nullraum', J.every(r=>near(mul(r,ty),0,1e-9)));
    A('jacobian: Drehung im Nullraum',       J.every(r=>near(mul(r,rot),0,1e-9)));
  }
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node test/run.mjs`
Expected: FAIL, `C.jacobian is not a function`.

- [ ] **Step 3: Implementieren**

Im Block `core`:

```js
// Zeile je Messung: d|xa-xb|/dxa = +u, d/dxb = -u, alles andere 0.
function jacobian(pts, meas){
  const I=idx(pts), n=pts.length;
  return activeMeas(meas).map(m=>{
    const a=I[m.a], b=I[m.b], pa=pts[a], pb=pts[b];
    const L=dist(pa,pb)||1e-9;   // ponytail: zwei deckungsgleiche Punkte sind
                                 // Eingabefehler, nicht Mathematik - nur kein NaN
    const ux=(pa.x-pb.x)/L, uy=(pa.y-pb.y)/L;
    const row=new Array(2*n).fill(0);
    row[2*a]=ux; row[2*a+1]=uy; row[2*b]=-ux; row[2*b+1]=-uy;
    return row;
  });
}
```

Wieder in `globalThis.CORE` aufnehmen.

- [ ] **Step 4: Test laufen lassen, grün prüfen**

Run: `node test/run.mjs`
Expected: alle PASS, Exit 0.

- [ ] **Step 5: Commit**

```bash
git add raumaufmass.html
git commit -m "feat: rigidity jacobian"
```

---

### Task 3: Dichter Gleichungslöser `luSolve`

**Files:**
- Modify: `raumaufmass.html` (Blöcke `core` und `checks`)

**Interfaces:**
- Consumes: nichts
- Produces: `CORE.luSolve(A, B) -> number[][] | null` — löst `A·X = B`. `A` ist k×k als Array von Zeilen, `B` ist k×p. Rückgabe ist k×p, oder `null` wenn `A` singulär ist. `CORE.matTmat(A) -> AᵀA`, `CORE.matTvec(A, v) -> Aᵀv`.

- [ ] **Step 1: Fehlschlagende Tests schreiben**

```js
  // --- luSolve / matTmat / matTvec ---
  {
    const A=[[2,1],[1,3]], B=[[3],[5]];        // Loesung x=(0.8, 1.4)
    const X=C.luSolve(A,B);
    A2('luSolve: 2x2 korrekt', near(X[0][0],0.8,1e-9)&&near(X[1][0],1.4,1e-9));
    A2('luSolve: singulaer -> null', C.luSolve([[1,2],[2,4]],[[1],[2]])===null);
    A2('luSolve: mehrere rechte Seiten', (()=>{
      const Y=C.luSolve([[2,0],[0,4]],[[2,4],[4,8]]);
      return near(Y[0][0],1,1e-9)&&near(Y[0][1],2,1e-9)&&near(Y[1][0],1,1e-9)&&near(Y[1][1],2,1e-9);
    })());
    A2('luSolve: Pivotierung noetig (Null auf der Diagonalen)', (()=>{
      const Y=C.luSolve([[0,1],[1,0]],[[3],[5]]);
      return Y && near(Y[0][0],5,1e-9) && near(Y[1][0],3,1e-9);
    })());
  }
  {
    const M=[[1,2],[3,4]];
    const N=C.matTmat(M);                      // [[10,14],[14,20]]
    A2('matTmat korrekt', N[0][0]===10&&N[0][1]===14&&N[1][0]===14&&N[1][1]===20);
    const g=C.matTvec(M,[1,1]);                // [4,6]
    A2('matTvec korrekt', g[0]===4&&g[1]===6);
  }
```

Achtung: die Assert-Funktion heißt `A`, aber `A` ist in diesem Block schon als Matrixname vergeben. Benenne im gesamten `checks`-Block die Assert-Funktion in `A2` um und passe die bestehenden Aufrufe aus Task 1 und 2 mit an — also `const A2=(n,c)=>{ ok=ok&&!!c; out.push((c?'PASS ':'FAIL ')+n); };` und überall `A(` → `A2(`.

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node test/run.mjs`
Expected: FAIL, `C.luSolve is not a function`.

- [ ] **Step 3: Implementieren**

```js
// Gauss-Jordan mit Spaltenpivotierung, mehrere rechte Seiten.
// ponytail: dicht und dumm - bei 2n <= 60 Unbekannten ist sparse reiner Aufwand.
function luSolve(A, B){
  const k=A.length; if(!k) return [];
  const p=B[0].length;
  let mx=0; for(const r of A) for(const x of r) mx=Math.max(mx,Math.abs(x));
  const eps=1e-12*(mx||1);
  const M=A.map((r,i)=>r.concat(B[i]));
  for(let c=0;c<k;c++){
    let piv=c;
    for(let r=c+1;r<k;r++) if(Math.abs(M[r][c])>Math.abs(M[piv][c])) piv=r;
    if(Math.abs(M[piv][c])<eps) return null;
    [M[c],M[piv]]=[M[piv],M[c]];
    const d=M[c][c];
    for(let j=c;j<k+p;j++) M[c][j]/=d;
    for(let r=0;r<k;r++){
      if(r===c) continue;
      const f=M[r][c]; if(f===0) continue;
      for(let j=c;j<k+p;j++) M[r][j]-=f*M[c][j];
    }
  }
  return M.map(r=>r.slice(k));
}

function matTmat(A){
  const m=A.length, k=m?A[0].length:0;
  const N=Array.from({length:k},()=>new Array(k).fill(0));
  for(let i=0;i<m;i++) for(let a=0;a<k;a++){
    const va=A[i][a]; if(!va) continue;
    for(let b=a;b<k;b++) N[a][b]+=va*A[i][b];
  }
  for(let a=0;a<k;a++) for(let b=0;b<a;b++) N[a][b]=N[b][a];
  return N;
}

function matTvec(A,v){
  const m=A.length, k=m?A[0].length:0, g=new Array(k).fill(0);
  for(let i=0;i<m;i++) for(let a=0;a<k;a++) g[a]+=A[i][a]*v[i];
  return g;
}
```

- [ ] **Step 4: Test laufen lassen, grün prüfen**

Run: `node test/run.mjs`
Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add raumaufmass.html
git commit -m "feat: dense linear solver"
```

---

### Task 4: Rangbestimmung `gramSchmidt`, `nullSpace`, `leverage`

Das ist die zentrale Rechnung: **eine** Zerlegung liefert Rang, Nullraum und Hebelwerte. Ein kombinatorischer Rigiditätstest wäre eine zweite Antwort auf dieselbe Frage.

**Files:**
- Modify: `raumaufmass.html` (Blöcke `core` und `checks`)

**Interfaces:**
- Consumes: nichts
- Produces:
  - `CORE.gramSchmidt(rows, tol) -> {Q, R, piv, rank, m}` — `rows` ist m×k. `Q` ist ein Array von `rank` orthonormalen **Spalten** (je m lang). `R` ist `rank`×k mit `R[q][j]` = Anteil von `Q[q]` an Spalte j. `piv` sind die Indizes der angenommenen Spalten. `m` ist die Zeilenzahl.
  - `CORE.nullSpace(gs) -> number[][]` — Basis des Rechts-Nullraums, jeder Vektor k lang, normiert.
  - `CORE.leverage(gs) -> number[]` — `h_i` der Länge m.

- [ ] **Step 1: Fehlschlagende Tests schreiben**

```js
  // --- gramSchmidt / nullSpace / leverage ---
  {
    const M=[[1,0,1],[0,1,1],[0,0,0]];         // Spalte 3 = Spalte 1 + Spalte 2
    const gs=C.gramSchmidt(M);
    A2('gramSchmidt: Rang 2 erkannt', gs.rank===2);
    A2('gramSchmidt: Pivotspalten 0 und 1', gs.piv[0]===0&&gs.piv[1]===1);
    A2('gramSchmidt: Q orthonormal', (()=>{
      const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
      return near(dot(gs.Q[0],gs.Q[0]),1,1e-9)&&near(dot(gs.Q[1],gs.Q[1]),1,1e-9)
          && near(dot(gs.Q[0],gs.Q[1]),0,1e-9);
    })());
    const ns=C.nullSpace(gs);
    A2('nullSpace: eine Dimension', ns.length===1);
    A2('nullSpace: M*z = 0', (()=>{
      const z=ns[0];
      return M.every(r=>near(r.reduce((s,x,i)=>s+x*z[i],0),0,1e-9));
    })());
  }
  {
    const I3=[[1,0,0],[0,1,0],[0,0,1]];        // voller Rang -> h_i = 1
    const h=C.leverage(C.gramSchmidt(I3));
    A2('leverage: voller Rang -> h=1', h.every(x=>near(x,1,1e-9)));
    // eine Spalte, drei gleiche Zeilen -> h_i = 1/3
    const h2=C.leverage(C.gramSchmidt([[1],[1],[1]]));
    A2('leverage: 3 gleiche Zeilen -> h=1/3', h2.every(x=>near(x,1/3,1e-9)));
    A2('leverage: Summe h = Rang', near(h2.reduce((s,x)=>s+x,0),1,1e-9));
  }
  {
    const gs=C.gramSchmidt([[0,0],[0,0]]);     // Nullmatrix
    A2('gramSchmidt: Nullmatrix -> Rang 0', gs.rank===0);
    A2('nullSpace: Nullmatrix -> volle Dimension', C.nullSpace(gs).length===2);
    A2('leverage: Rang 0 -> h=0', C.leverage(gs).every(x=>x===0));
  }
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node test/run.mjs`
Expected: FAIL, `C.gramSchmidt is not a function`.

- [ ] **Step 3: Implementieren**

```js
// Rangaufdeckendes modifiziertes Gram-Schmidt ueber die SPALTEN.
// Doppelte Orthogonalisierung: die Rangerkennung ist genau die Stelle, an der
// einfache Genauigkeit kippt, und ein falscher Rang ist eine falsche Aussage
// darueber, wieviele Messungen fehlen.
function gramSchmidt(rows, tol){
  const m=rows.length, k=m?rows[0].length:0;
  const col=j=>rows.map(r=>r[j]);
  let scale=0;
  for(let j=0;j<k;j++) scale=Math.max(scale, Math.hypot(...col(j)));
  const t=(tol??TOL_RANK)*(scale||1);
  const Q=[], R=[], piv=[];
  for(let j=0;j<k;j++){
    const v=col(j), coef=new Array(Q.length).fill(0);
    for(let pass=0;pass<2;pass++){
      for(let q=0;q<Q.length;q++){
        let d=0; for(let i=0;i<m;i++) d+=Q[q][i]*v[i];
        coef[q]+=d;
        for(let i=0;i<m;i++) v[i]-=d*Q[q][i];
      }
    }
    R.forEach((row,q)=>row[j]=coef[q]);
    const nv=Math.hypot(...v);
    if(nv>t){
      for(let i=0;i<m;i++) v[i]/=nv;
      Q.push(v); piv.push(j);
      const row=new Array(k).fill(0); row[j]=nv; R.push(row);
    }
  }
  return {Q, R, piv, rank:Q.length, m};
}

// Jede abhaengige Spalte liefert genau einen Nullraum-Vektor. R eingeschraenkt
// auf die Pivotspalten ist obere Dreiecksmatrix -> Rueckwaertseinsetzen.
function nullSpace(gs){
  const {R,piv,rank}=gs;
  const k=R.length?R[0].length:(gs.k??0);
  const kk=rank?R[0].length:k;
  const isPiv=new Set(piv), out=[];
  for(let j=0;j<kk;j++){
    if(isPiv.has(j)) continue;
    const c=new Array(rank).fill(0);
    for(let q=rank-1;q>=0;q--){
      let s=R[q][j];
      for(let q2=q+1;q2<rank;q2++) s-=R[q][piv[q2]]*c[q2];
      c[q]=s/R[q][piv[q]];
    }
    const z=new Array(kk).fill(0);
    z[j]=1; piv.forEach((p,q)=>z[p]=-c[q]);
    const nrm=Math.hypot(...z)||1;
    out.push(z.map(x=>x/nrm));
  }
  return out;
}

// h_i = Zeilennorm^2 der Orthonormalbasis der Spalten = Diagonale der Hutmatrix.
function leverage(gs){
  const h=new Array(gs.m).fill(0);
  gs.Q.forEach(q=>q.forEach((v,i)=>h[i]+=v*v));
  return h;
}
```

Damit `nullSpace` auch bei Rang 0 die Spaltenzahl kennt, muss `gramSchmidt` sie mitgeben. Ergänze in `gramSchmidt` die Rückgabe um `k` und ersetze in `nullSpace` die ersten drei Zeilen durch:

```js
  const {R,piv,rank,k}=gs;
  const isPiv=new Set(piv), out=[];
  for(let j=0;j<k;j++){
```

- [ ] **Step 4: Test laufen lassen, grün prüfen**

Run: `node test/run.mjs`
Expected: alle PASS. Falls "nullSpace: Nullmatrix" fehlschlägt, fehlt das `k` in der Rückgabe von `gramSchmidt`.

- [ ] **Step 5: Commit**

```bash
git add raumaufmass.html
git commit -m "feat: rank-revealing decomposition, null space, leverage"
```

---

### Task 5: Eichung `gaugeFixed` / `freeCols`

Drei Koordinaten festnageln entfernt genau die drei Starrbewegungen. Nebeneffekt: der Nullraum der reduzierten Matrix enthält danach nur noch echte Beweglichkeiten — ein separater Projektionsschritt entfällt.

**Files:**
- Modify: `raumaufmass.html` (Blöcke `core` und `checks`)

**Interfaces:**
- Consumes: nichts
- Produces: `CORE.gaugeFixed(pts) -> number[]` (Spaltenindizes der gepinnten Koordinaten), `CORE.freeCols(pts) -> number[]` (aufsteigende Liste der übrigen Spaltenindizes, Länge `2n-3` für `n ≥ 2`).

- [ ] **Step 1: Fehlschlagende Tests schreiben**

```js
  // --- Eichung ---
  {
    // P1 liegt weit rechts von P0 -> P1.y (Spalte 3) pinnen
    const waag=[{id:'A',x:0,y:0},{id:'B',x:5000,y:10},{id:'C',x:0,y:3000}];
    A2('gauge: waagerechtes Paar pinnt P1.y',
       JSON.stringify(C.gaugeFixed(waag))===JSON.stringify([0,1,3]));
    // P1 liegt senkrecht ueber P0 -> P1.y taugt nicht, P1.x (Spalte 2) pinnen
    const senk=[{id:'A',x:0,y:0},{id:'B',x:0,y:5000},{id:'C',x:3000,y:0}];
    A2('gauge: senkrechtes Paar pinnt P1.x',
       JSON.stringify(C.gaugeFixed(senk))===JSON.stringify([0,1,2]));
    A2('freeCols: 2n-3 freie Spalten', C.freeCols(waag).length===2*3-3);
    A2('freeCols: enthaelt keine gepinnte Spalte',
       C.freeCols(waag).every(c=>![0,1,3].includes(c)));
    A2('gauge: unter 2 Punkten nichts zu pinnen', C.gaugeFixed([{id:'A',x:0,y:0}]).length===0);
  }
  {
    // Die entscheidende Eigenschaft: keine Starrbewegung ueberlebt das Pinnen.
    // Waere sie noch da, saehe jedes Netz beweglich aus.
    const pts=[{id:'A',x:0,y:0},{id:'B',x:0,y:5000},{id:'C',x:3000,y:0}];
    const fx=C.gaugeFixed(pts);
    const tx=[],ty=[],rot=[];
    pts.forEach(p=>{ tx.push(1,0); ty.push(0,1); rot.push(-p.y,p.x); });
    A2('gauge: jede Starrbewegung bewegt mindestens eine gepinnte Koordinate',
       [tx,ty,rot].every(t=>fx.some(c=>Math.abs(t[c])>1e-9)));
  }
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node test/run.mjs`
Expected: FAIL, `C.gaugeFixed is not a function`.

- [ ] **Step 3: Implementieren**

```js
// P0.x, P0.y und eine Koordinate von P1 = genau die 3 Starrfreiheitsgrade.
// Welche Koordinate von P1: eine Drehung um P0 aendert P1.y mit der Rate
// (P1.x - P0.x). Liegt P1 senkrecht ueber P0, fixiert P1.y die Drehung gar
// nicht und das System bliebe singulaer.
function gaugeFixed(pts){
  if(pts.length<2) return [];
  const dx=Math.abs(pts[1].x-pts[0].x), dy=Math.abs(pts[1].y-pts[0].y);
  return [0, 1, dx>=dy ? 3 : 2];
}

function freeCols(pts){
  const fx=new Set(gaugeFixed(pts)), out=[];
  for(let c=0;c<2*pts.length;c++) if(!fx.has(c)) out.push(c);
  return out;
}
```

- [ ] **Step 4: Test laufen lassen, grün prüfen**

Run: `node test/run.mjs`
Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add raumaufmass.html
git commit -m "feat: gauge fixing with non-degenerate second pin"
```

---

### Task 6: Ausgleichung `solve`

**Files:**
- Modify: `raumaufmass.html` (Blöcke `core` und `checks`)

**Interfaces:**
- Consumes: `residuals`, `jacobian`, `luSolve`, `matTmat`, `matTvec`, `freeCols`
- Produces: `CORE.scaleSketch(pts, meas) -> pts[]`, `CORE.solve(pts, meas) -> {pts, iters, converged}`. `solve` verändert die Eingabe nicht.

- [ ] **Step 1: Fehlschlagende Tests schreiben**

```js
  // --- solve ---
  {
    // Rechteck 4000 x 3000, Skizze grob und viel zu klein, exakte Messungen.
    const truth=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const sketch=[{id:'A',x:0,y:0},{id:'B',x:40,y:3},{id:'C',x:38,y:33},{id:'D',x:-2,y:29}];
    const meas=[
      {a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},{a:'D',b:'A',d:3000},
      {a:'A',b:'C',d:5000},
    ];
    const r=C.solve(sketch,meas);
    A2('solve: konvergiert', r.converged);
    A2('solve: exakte Messungen -> Residuen ~0',
       C.residuals(r.pts,meas).every(v=>Math.abs(v)<0.01));
    // Eichfrei pruefen. Lage und Drehung erbt das Ergebnis von der Skizze -
    // ein Vergleich absoluter Koordinaten wuerde fehlschlagen, obwohl die
    // Form exakt stimmt. Verglichen werden deshalb Abstaende.
    const IR=C.idx(r.pts), IT=C.idx(truth);
    let worst=0;
    for(let i=0;i<4;i++) for(let j=i+1;j<4;j++){
      const a=truth[i].id, b=truth[j].id;
      worst=Math.max(worst,
        Math.abs(C.dist(r.pts[IR[a]],r.pts[IR[b]]) - C.dist(truth[IT[a]],truth[IT[b]])));
    }
    A2('solve: Form exakt getroffen (alle Abstaende <0.01mm)', worst<0.01);
    A2('solve: ungemessene Diagonale B-D kommt auf 5000 heraus',
       near(C.dist(r.pts[IR['B']],r.pts[IR['D']]),5000,0.01));
    A2('solve: Eingabe unveraendert', sketch[1].x===40);
  }
  {
    // Unterbestimmt: 4 Punkte, nur 2 Messungen. Muss zeichenbar bleiben.
    const sketch=[{id:'A',x:0,y:0},{id:'B',x:100,y:0},{id:'C',x:100,y:80},{id:'D',x:0,y:80}];
    const r=C.solve(sketch,[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000}]);
    A2('solve: unterbestimmt liefert endliche Koordinaten',
       r.pts.every(p=>isFinite(p.x)&&isFinite(p.y)));
    A2('solve: unterbestimmt erfuellt die vorhandenen Messungen',
       C.residuals(r.pts,[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000}]).every(v=>Math.abs(v)<0.5));
  }
  {
    A2('solve: ohne Messungen kein Absturz',
       C.solve([{id:'A',x:0,y:0},{id:'B',x:10,y:0}],[]).pts.length===2);
    const s=C.scaleSketch([{id:'A',x:0,y:0},{id:'B',x:10,y:0}],[{a:'A',b:'B',d:5000}]);
    A2('scaleSketch: auf Messgroesse gestreckt', near(s[1].x,5000,1e-6));
  }
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node test/run.mjs`
Expected: FAIL, `C.solve is not a function`.

- [ ] **Step 3: Implementieren**

```js
// Skizze auf Messgroesse bringen, bevor iteriert wird. Eine Zeile, rettet den
// Solver wenn jemand einen 8-Meter-Raum als 300-Pixel-Kritzelei gezeichnet hat.
function scaleSketch(pts, meas){
  const I=idx(pts), act=activeMeas(meas);
  if(!act.length) return pts.map(p=>({...p}));
  let sd=0, sm=0;
  act.forEach(m=>{ sd+=dist(pts[I[m.a]],pts[I[m.b]]); sm+=m.d; });
  if(sd<1e-9) return pts.map(p=>({...p}));
  const f=sm/sd;
  return pts.map(p=>({...p, x:p.x*f, y:p.y*f}));
}

// Levenberg-Marquardt. Die Daempfung geht gegen 0, sobald das System gut
// gestellt ist - sonst waere das Ergebnis systematisch zur Skizze hin verzogen.
// Bei unterbestimmten Netzen bleibt sie stehen und haelt die freien Richtungen
// genau dort, wo die Skizze sie hatte. Das ist gewollt.
function solve(pts0, meas){
  let pts=scaleSketch(pts0, meas);
  const free=freeCols(pts), nf=free.length, act=activeMeas(meas);
  if(!nf || !act.length) return {pts, iters:0, converged:true};
  const cost=P=>residuals(P,meas).reduce((s,r)=>s+r*r,0);
  let lambda=1e-3, c0=cost(pts), it=0, converged=false;
  for(; it<30; it++){
    const J=jacobian(pts,meas).map(r=>free.map(c=>r[c]));
    const v=residuals(pts,meas);
    const N=matTmat(J), g=matTvec(J,v);
    let stepNorm=0, ok=false;
    for(let tries=0; tries<8 && !ok; tries++){
      const A=N.map((row,i)=>row.map((x,j)=>i===j ? x+lambda*(1+x) : x));
      const sol=luSolve(A, g.map(x=>[-x]));
      if(!sol){ lambda*=10; continue; }
      const d=sol.map(r=>r[0]);
      const cand=pts.map(p=>({...p}));
      free.forEach((c,i)=>{ const p=cand[c>>1]; if(c&1) p.y+=d[i]; else p.x+=d[i]; });
      const c1=cost(cand);
      if(c1<=c0){ pts=cand; c0=c1; lambda=Math.max(lambda/3,1e-12); stepNorm=Math.hypot(...d); ok=true; }
      else lambda*=10;
    }
    if(!ok) break;
    if(stepNorm<0.01){ converged=true; it++; break; }
  }
  return {pts, iters:it, converged};
}
```

- [ ] **Step 4: Test laufen lassen, grün prüfen**

Run: `node test/run.mjs`
Expected: alle PASS. Bleibt "Koordinaten getroffen" rot, prüfe zuerst die Eichung: `gaugeFixed` muss für das Rechteck `[0,1,3]` liefern.

- [ ] **Step 5: Commit**

```bash
git add raumaufmass.html
git commit -m "feat: levenberg-marquardt adjustment with sketch prescaling"
```

---

### Task 7: Netzanalyse `analyze`

Hier entsteht die Aussage, die das Werkzeug ehrlich macht. Test 3 ist der wichtigste des ganzen Plans: bei exakt bestimmtem Netz sind alle Residuen strukturell null, und ein Werkzeug, das dann "alles gut" meldet, lügt.

**Files:**
- Modify: `raumaufmass.html` (Blöcke `core` und `checks`)

**Interfaces:**
- Consumes: `jacobian`, `residuals`, `gramSchmidt`, `nullSpace`, `leverage`, `freeCols`, `activeMeas`
- Produces: `CORE.analyze(pts, meas) -> {rank, dof, redundancy, h, red, v, w, sigmaHat, modes, free, n, m}`
  - `dof` = fehlende Messungen, `redundancy` = `m - rank`
  - `red[i]` = Redundanzzahl der i-ten aktiven Messung, `w[i]` = normiertes Residuum oder `null` wenn nicht prüfbar
  - `sigmaHat` = empirische Standardabweichung oder `null`
  - `modes` = Flex-Moden, je ein Vektor der Länge `2n` (an gepinnten Koordinaten 0)

- [ ] **Step 1: Fehlschlagende Tests schreiben**

```js
  // --- analyze: fehlende Messungen (Spec-Test 2) ---
  {
    const rect=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const seiten=[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},{a:'D',b:'A',d:3000}];
    A2('analyze: Rechteck mit 4 Seiten -> 1 Messung fehlt', C.analyze(rect,seiten).dof===1);
    A2('analyze: mit Diagonale -> 0 Messungen fehlen',
       C.analyze(rect,seiten.concat([{a:'A',b:'C',d:5000}])).dof===0);
    A2('analyze: 4 Seiten -> genau ein Flex-Mode', C.analyze(rect,seiten).modes.length===1);
  }
  // --- analyze: der Luegner-Fall (Spec-Test 3) ---
  {
    const rect=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const exakt=[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},
                 {a:'D',b:'A',d:3000},{a:'A',b:'C',d:5000}];        // m = 2n-3 = 5
    const an=C.analyze(rect,exakt);
    A2('analyze: exakt bestimmt -> alle Residuen ~0', an.v.every(x=>Math.abs(x)<1e-6));
    A2('analyze: exakt bestimmt -> Redundanz 0', an.redundancy===0);
    A2('analyze: exakt bestimmt -> KEINE Messung pruefbar', an.w.every(x=>x===null));
    A2('analyze: exakt bestimmt -> sigmaHat undefiniert', an.sigmaHat===null);
  }
  // --- analyze: Ausreisser (Spec-Test 1) ---
  {
    const L=[{id:'A',x:0,y:0},{id:'B',x:8000,y:0},{id:'C',x:8000,y:2000},
             {id:'D',x:3000,y:2000},{id:'E',x:3000,y:5000},{id:'F',x:0,y:5000}];
    const paare=[['A','B'],['B','C'],['C','D'],['D','E'],['E','F'],['F','A'],
                 ['A','C'],['A','D'],['A','E'],['B','D'],['D','F'],['C','F']];
    const I=C.idx(L);
    const exakt=paare.map(([a,b])=>({a,b,d:C.dist(L[I[a]],L[I[b]]),sigma:5}));
    const mit=exakt.map((m,i)=>i===7 ? {...m, d:m.d+20} : {...m});   // A-D um 20mm falsch
    const fit=C.solve(L.map(p=>({...p})), mit);
    const an=C.analyze(fit.pts, mit);
    const wmax=an.w.reduce((bi,x,i,arr)=>(x??-1)>(arr[bi]??-1)?i:bi,0);
    A2('analyze: der verfaelschte Wert hat das groesste w', wmax===7);
    A2('analyze: rank 9', an.rank===9);
    A2('analyze: ueberbestimmt -> sigmaHat vorhanden', an.sigmaHat!==null && an.sigmaHat>0);
    A2('analyze: ueberbestimmt -> jede Messung pruefbar', an.w.every(x=>x!==null));

    // Formfehler eichfrei ueber alle Punktabstaende
    const formErr=P=>{
      const IP=C.idx(P); let w=0;
      for(let i=0;i<6;i++) for(let j=i+1;j<6;j++){
        const a=L[i].id, b=L[j].id;
        w=Math.max(w, Math.abs(C.dist(P[IP[a]],P[IP[b]]) - C.dist(L[I[a]],L[I[b]])));
      }
      return w;
    };
    // Bei nur 3 redundanten Messungen verteilt die Ausgleichung den 20mm-Fehler
    // ueber das ganze Netz: Abstaende sind um bis zu 13mm verzogen. Der Fehler
    // versteckt sich also - genau deshalb muss das Werkzeug ihn benennen.
    A2('analyze: der Ausreisser verzerrt die Form spuerbar (>5mm)', formErr(fit.pts)>5);
    // Und das ist der Arbeitsablauf, um den es geht: markierte Messung
    // stilllegen -> Form erholt sich vollstaendig, Netz bleibt bestimmt.
    const ohne=mit.map((m,i)=>i===7 ? {...m, on:false} : {...m});
    const fit2=C.solve(L.map(p=>({...p})), ohne);
    A2('analyze: nach Stilllegen stimmt die Form wieder (<0.01mm)', formErr(fit2.pts)<0.01);
    A2('analyze: nach Stilllegen ist das Netz noch bestimmt', C.analyze(fit2.pts,ohne).dof===0);
  }
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node test/run.mjs`
Expected: FAIL, `C.analyze is not a function`.

- [ ] **Step 3: Implementieren**

```js
// Eine Zerlegung, drei Antworten: Rang (= fehlende Messungen), Nullraum
// (= welche Punkte noch wackeln) und Hebelwerte (= welche Messung pruefbar ist).
function analyze(pts, meas){
  const act=activeMeas(meas), m=act.length, n=pts.length;
  const free=freeCols(pts), nf=free.length;
  const Jfull=jacobian(pts,meas);
  const J=Jfull.map(r=>free.map(c=>r[c]));
  const gs=gramSchmidt(J, TOL_RANK);
  const rank=gs.rank;
  const dof=Math.max(0, nf-rank);
  const redundancy=m-rank;
  const h=leverage(gs);
  const red=h.map(x=>Math.max(0, 1-x));
  const v=residuals(pts,meas);
  const sigmaHat = redundancy>0
    ? Math.sqrt(v.reduce((s,r)=>s+r*r,0)/redundancy)
    : null;
  const w=act.map((mm,i)=> red[i]<TOL_RED
    ? null
    : Math.abs(v[i])/((mm.sigma??SIGMA_DEF)*Math.sqrt(red[i])));
  // Moden liegen in den freien Koordinaten - auf die vollen 2n aufblasen.
  // Starrbewegungen koennen nicht dabei sein, die hat das Pinnen entfernt.
  const modes=nullSpace(gs).map(z=>{
    const f=new Array(2*n).fill(0);
    free.forEach((c,i)=>f[c]=z[i]);
    return f;
  });
  return {rank, dof, redundancy, h, red, v, w, sigmaHat, modes, free, n, m};
}
```

- [ ] **Step 4: Test laufen lassen, grün prüfen**

Run: `node test/run.mjs`
Expected: alle PASS, besonders `analyze: exakt bestimmt -> KEINE Messung pruefbar`.

- [ ] **Step 5: Commit**

```bash
git add raumaufmass.html
git commit -m "feat: network analysis with redundancy numbers"
```

---

### Task 8: Kovarianz und Ellipsen

**Files:**
- Modify: `raumaufmass.html` (Blöcke `core` und `checks`)

**Interfaces:**
- Consumes: `jacobian`, `matTmat`, `luSolve`
- Produces: `CORE.trivialModes(pts) -> number[][]` (3 orthonormale Vektoren der Länge 2n), `CORE.covariance(pts, meas, sigmaHat) -> {xx,xy,yy}[] | null`, `CORE.ellipse(c) -> {a, b, ang}` (Halbachsen in mm, Winkel in rad).

- [ ] **Step 1: Fehlschlagende Tests schreiben**

```js
  // --- Kovarianz ---
  {
    const rect=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const G=C.trivialModes(rect);
    const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
    A2('trivialModes: drei Stueck', G.length===3);
    A2('trivialModes: orthonormal',
       G.every(g=>near(dot(g,g),1,1e-9)) && near(dot(G[0],G[1]),0,1e-9)
       && near(dot(G[0],G[2]),0,1e-9) && near(dot(G[1],G[2]),0,1e-9));
    A2('trivialModes: liegen im Nullraum von J', (()=>{
      const J=C.jacobian(rect,[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000}]);
      return G.every(g=>J.every(r=>near(dot(r,g),0,1e-6)));
    })());
  }
  {
    const rect=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const voll=[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},
                {a:'D',b:'A',d:3000},{a:'A',b:'C',d:5000},{a:'B',b:'D',d:5000}];
    const cov=C.covariance(rect,voll,6);
    A2('covariance: ein Block je Punkt', cov && cov.length===4);
    A2('covariance: endlich und positiv',
       cov.every(c=>isFinite(c.xx)&&isFinite(c.yy)&&c.xx>0&&c.yy>0));
    A2('covariance: keine Punkt-Bevorzugung durch die Eichung', (()=>{
      // Symmetrisches Netz -> alle vier Ecken muessen aehnlich unsicher sein.
      // Waere an P0 gepinnt worden, waere P0 exakt 0 und der Rest wuechse.
      const sp=cov.map(c=>c.xx+c.yy);
      return Math.max(...sp)/Math.min(...sp) < 1.5;
    })());
    A2('covariance: unterbestimmt -> null',
       C.covariance(rect,[{a:'A',b:'B',d:4000}],null)===null);
  }
  {
    const e=C.ellipse({xx:400,xy:0,yy:100});
    A2('ellipse: Halbachsen 20 und 10', near(e.a,20,1e-9)&&near(e.b,10,1e-9));
    A2('ellipse: grosse Achse waagerecht', near(e.ang,0,1e-9));
    const e2=C.ellipse({xx:100,xy:0,yy:400});
    A2('ellipse: grosse Achse senkrecht', near(Math.abs(e2.ang),Math.PI/2,1e-9));
  }
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node test/run.mjs`
Expected: FAIL, `C.trivialModes is not a function`.

- [ ] **Step 3: Implementieren**

```js
// Die drei Starrbewegungen, Drehung um den Schwerpunkt (haelt sie unabhaengig
// von der Lage des Netzes klein und numerisch gutartig).
function trivialModes(pts){
  const n=pts.length;
  const cx=pts.reduce((s,p)=>s+p.x,0)/n, cy=pts.reduce((s,p)=>s+p.y,0)/n;
  const t1=[],t2=[],t3=[];
  pts.forEach(p=>{ t1.push(1,0); t2.push(0,1); t3.push(-(p.y-cy), p.x-cx); });
  const out=[];
  for(const v0 of [t1,t2,t3]){
    const v=v0.slice();
    for(const q of out){
      let d=0; for(let i=0;i<v.length;i++) d+=q[i]*v[i];
      for(let i=0;i<v.length;i++) v[i]-=d*q[i];
    }
    const nrm=Math.hypot(...v);
    if(nrm>1e-9) out.push(v.map(x=>x/nrm));
  }
  return out;
}

// Freie Netzausgleichung mit inneren Bedingungen:
//   [ JtJ  G ] [X]   [I]
//   [ Gt   0 ] [.] = [0]
// X ist die gesuchte Pseudoinverse. Wuerde stattdessen das gepinnte System
// invertiert, waeren die Ellipsen an P0 genagelt und wuechsen mit dem Abstand
// davon - ein Artefakt der Eichung, nicht der Messqualitaet.
function covariance(pts, meas, sigmaHat){
  const n=pts.length, k=2*n;
  if(n<3) return null;
  const G=trivialModes(pts);
  if(G.length<3) return null;
  const N=matTmat(jacobian(pts,meas));
  const A=Array.from({length:k+3},()=>new Array(k+3).fill(0));
  for(let i=0;i<k;i++) for(let j=0;j<k;j++) A[i][j]=N[i][j];
  for(let i=0;i<k;i++) for(let g=0;g<3;g++){ A[i][k+g]=G[g][i]; A[k+g][i]=G[g][i]; }
  const B=Array.from({length:k+3},(_,i)=>{
    const r=new Array(k).fill(0); if(i<k) r[i]=1; return r;
  });
  const X=luSolve(A,B);
  if(!X) return null;                       // unterbestimmt -> Pfeile statt Ellipsen
  const s2=(sigmaHat!=null ? sigmaHat*sigmaHat : SIGMA_DEF*SIGMA_DEF);
  return pts.map((p,i)=>({
    xx:s2*X[2*i][2*i], xy:s2*X[2*i][2*i+1], yy:s2*X[2*i+1][2*i+1],
  }));
}

// Eigenwerte einer 2x2-Kovarianz in geschlossener Form.
function ellipse(c){
  const tr=c.xx+c.yy, det=c.xx*c.yy-c.xy*c.xy;
  const r=Math.sqrt(Math.max(0, tr*tr/4-det));
  return {
    a:Math.sqrt(Math.max(tr/2+r,0)),
    b:Math.sqrt(Math.max(tr/2-r,0)),
    ang:0.5*Math.atan2(2*c.xy, c.xx-c.yy),
  };
}
```

- [ ] **Step 4: Test laufen lassen, grün prüfen**

Run: `node test/run.mjs`
Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add raumaufmass.html
git commit -m "feat: free-network covariance and error ellipses"
```

---

### Task 9: Polygon, Messbarkeit und `suggest`

**Files:**
- Modify: `raumaufmass.html` (Blöcke `core` und `checks`)

**Interfaces:**
- Consumes: `analyze`, `jacobian`, `dist`, `idx`, `activeMeas`
- Produces: `CORE.wallPolygon(pts, walls) -> pts[] | null`, `CORE.pointInPoly(p, poly) -> bool`, `CORE.segInPoly(p, q, poly) -> bool`, `CORE.suggest(pts, walls, meas) -> {a, b, why}[]` mit `why ∈ {'bestimmt', 'pruefbar'}`.

- [ ] **Step 1: Fehlschlagende Tests schreiben**

```js
  // --- Polygon und Messbarkeit (Spec-Test 4) ---
  {
    const L=[{id:'A',x:0,y:0},{id:'B',x:8000,y:0},{id:'C',x:8000,y:2000},
             {id:'D',x:3000,y:2000},{id:'E',x:3000,y:5000},{id:'F',x:0,y:5000}];
    const walls=[['A','B'],['B','C'],['C','D'],['D','E'],['E','F'],['F','A']];
    const poly=C.wallPolygon(L,walls);
    A2('wallPolygon: geschlossener Zug -> 6 Ecken', poly && poly.length===6);
    A2('pointInPoly: Punkt im schmalen Schenkel', C.pointInPoly({x:6000,y:1000},poly));
    A2('pointInPoly: Punkt im ausgesparten Bereich', !C.pointInPoly({x:6000,y:4000},poly));
    A2('segInPoly: C-F verlaesst den Raum -> unzulaessig',
       !C.segInPoly({x:8000,y:2000},{x:0,y:5000},poly));
    A2('segInPoly: A-E bleibt im Raum -> zulaessig',
       C.segInPoly({x:0,y:0},{x:3000,y:5000},poly));
    A2('wallPolygon: offener Zug -> null',
       C.wallPolygon(L,[['A','B'],['B','C'],['C','D']])===null);
    A2('wallPolygon: Knotengrad ungleich 2 -> null',
       C.wallPolygon(L,walls.concat([['A','D']]))===null);
  }
  // --- suggest ---
  {
    const rect=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const walls=[['A','B'],['B','C'],['C','D'],['D','A']];
    const seiten=[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},{a:'D',b:'A',d:3000}];
    const s=C.suggest(rect,walls,seiten);
    const best=s.filter(x=>x.why==='bestimmt');
    A2('suggest: genau ein Vorschlag fuer Bestimmtheit', best.length===1);
    A2('suggest: es ist eine Diagonale',
       ['AC','BD'].includes([best[0].a,best[0].b].sort().join('')));
    A2('suggest: Vorschlag macht das Netz bestimmt', (()=>{
      const I=C.idx(rect);
      const d=C.dist(rect[I[best[0].a]],rect[I[best[0].b]]);
      return C.analyze(rect, seiten.concat([{a:best[0].a,b:best[0].b,d}])).dof===0;
    })());
    // Danach laeuft die Suche weiter, jetzt fuer die Pruefbarkeit: mit nur
    // 5 Messungen ist keine einzige ueberpruefbar.
    A2('suggest: schlaegt danach Messungen zur Pruefbarkeit vor',
       s.some(x=>x.why==='pruefbar'));
  }
  {
    const L=[{id:'A',x:0,y:0},{id:'B',x:8000,y:0},{id:'C',x:8000,y:2000},
             {id:'D',x:3000,y:2000},{id:'E',x:3000,y:5000},{id:'F',x:0,y:5000}];
    const walls=[['A','B'],['B','C'],['C','D'],['D','E'],['E','F'],['F','A']];
    const I=C.idx(L);
    const seiten=walls.map(([a,b])=>({a,b,d:C.dist(L[I[a]],L[I[b]])}));
    A2('analyze: L mit 6 Waenden -> 3 Messungen fehlen', C.analyze(L,seiten).dof===3);
    const s=C.suggest(L,walls,seiten);
    A2('suggest: genau 3 Vorschlaege fuer Bestimmtheit',
       s.filter(x=>x.why==='bestimmt').length===3);
    A2('suggest: kein Vorschlag verlaesst den Raum',
       s.every(x=>C.segInPoly(L[I[x.a]],L[I[x.b]],C.wallPolygon(L,walls))));
    A2('suggest: C-F wird nie vorgeschlagen',
       !s.some(x=>[x.a,x.b].sort().join('')==='CF'));
    A2('suggest: Pruefbarkeitsphase ist gedeckelt',
       s.filter(x=>x.why==='pruefbar').length<=C.SUGGEST_CHECK_MAX);
  }
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node test/run.mjs`
Expected: FAIL, `C.wallPolygon is not a function`.

- [ ] **Step 3: Implementieren**

```js
// Wandzug in Ecken-Reihenfolge bringen. Null, wenn es kein geschlossener
// Ring ueber alle Punkte ist - dann gibt es kein Polygon zum Filtern.
function wallPolygon(pts, walls){
  if(walls.length<3 || pts.length<3) return null;
  const adj={}; pts.forEach(p=>adj[p.id]=[]);
  for(const [a,b] of walls){
    if(!adj[a]||!adj[b]) return null;
    adj[a].push(b); adj[b].push(a);
  }
  if(pts.some(p=>adj[p.id].length!==2)) return null;
  const I=idx(pts), order=[pts[0].id];
  let prev=null, cur=pts[0].id;
  for(let i=1;i<pts.length;i++){
    const nxt=adj[cur].find(x=>x!==prev);
    if(nxt==null || order.includes(nxt)) return null;
    prev=cur; cur=nxt; order.push(cur);
  }
  if(adj[cur].find(x=>x!==prev)!==pts[0].id) return null;
  return order.map(id=>pts[I[id]]);
}

function pointInPoly(p, poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i], b=poly[j];
    if((a.y>p.y)!==(b.y>p.y) && p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}

// Messbar heisst: die Strecke bleibt im Raum. Abtasten statt Kantenschnitte -
// faengt auch den Fall ab, dass die Strecke genau durch eine einspringende Ecke
// laeuft. ponytail: bei drei kollinearen Ecken liegen die Abtastpunkte auf dem
// Rand und das Ergebnis ist willkuerlich - ein solcher Raum ist entartet.
function segInPoly(p, q, poly, steps=32){
  for(let i=1;i<steps;i++){
    const t=i/steps;
    if(!pointInPoly({x:p.x+(q.x-p.x)*t, y:p.y+(q.y-p.y)*t}, poly)) return false;
  }
  return true;
}

const pairKey=(a,b)=>[a,b].sort().join('|');

// Zwei Phasen in einem Durchlauf. Solange Messungen fehlen: die Messung
// waehlen, deren Rigiditaetszeile am staerksten in die noch freien Richtungen
// zeigt. Danach: die Messung waehlen, die die meisten bisher unpruefbaren
// Messungen pruefbar macht. Jeder Vorschlag traegt in `why`, aus welcher Phase
// er stammt - ohne das stuenden hier fuenf Eintraege, waehrend die Statuszeile
// "3 Messungen fehlen" meldet.
function suggest(pts, walls, meas){
  const poly=wallPolygon(pts,walls), I=idx(pts);
  const have=new Set(activeMeas(meas).map(m=>pairKey(m.a,m.b)));
  const cand=[];
  for(let i=0;i<pts.length;i++) for(let j=i+1;j<pts.length;j++){
    if(have.has(pairKey(pts[i].id,pts[j].id))) continue;
    if(poly && !segInPoly(pts[i],pts[j],poly)) continue;
    cand.push({a:pts[i].id, b:pts[j].id});
  }
  const virt=c=>({a:c.a, b:c.b, d:dist(pts[I[c.a]],pts[I[c.b]]), sigma:SIGMA_DEF});
  const out=[]; let work=activeMeas(meas).slice();
  const taken=new Set();
  let checkPhase=0;
  for(let guard=0; guard<2*pts.length; guard++){
    const an=analyze(pts, work);
    let best=null, bestScore=0, why='bestimmt';
    if(an.dof>0){
      for(const c of cand){
        if(taken.has(pairKey(c.a,c.b))) continue;
        const row=jacobian(pts,[{a:c.a,b:c.b,d:0}])[0];
        const score=an.modes.reduce((s,mo)=>{
          let d=0; for(let i=0;i<row.length;i++) d+=row[i]*mo[i];
          return s+d*d;
        },0);
        if(score>bestScore){ bestScore=score; best=c; }
      }
    } else {
      if(checkPhase>=SUGGEST_CHECK_MAX) break;
      why='pruefbar';
      const unchecked=a=>a.w.filter(x=>x===null).length;
      const base=unchecked(an);
      if(base===0) break;
      for(const c of cand){
        if(taken.has(pairKey(c.a,c.b))) continue;
        const gain=base-unchecked(analyze(pts, work.concat([virt(c)])));
        if(gain>bestScore){ bestScore=gain; best=c; }
      }
      checkPhase++;
    }
    if(!best) break;
    taken.add(pairKey(best.a,best.b));
    out.push({a:best.a, b:best.b, why});
    work=work.concat([virt(best)]);
  }
  return out;
}
```

- [ ] **Step 4: Test laufen lassen, grün prüfen**

Run: `node test/run.mjs`
Expected: alle PASS. Schlägt "L braucht 3 weitere Messungen" fehl, prüfe zuerst `analyze(L, seiten).dof` — für 6 Ecken und 6 Wände muss das 3 sein (`2·6−3−6`).

- [ ] **Step 5: Commit**

```bash
git add raumaufmass.html
git commit -m "feat: wall polygon, measurability filter, greedy suggestions"
```

---

### Task 10: Zustand, Canvas und die drei Modi

Ab hier gibt es keine automatisierten Tests mehr — die UI wird im Browser geprüft. Die Core-Checks müssen bei jedem Schritt grün bleiben.

**Files:**
- Modify: `raumaufmass.html` (Markup, `<style>`, Block `ui`)

**Interfaces:**
- Consumes: `CORE.solve`, `CORE.analyze`, `CORE.dist`
- Produces: globaler Zustand `M = {pts, walls, meas, mode, sel, fit, an}`, `render()`, `recompute()`

- [ ] **Step 1: Markup und Style ersetzen**

Ersetze in `raumaufmass.html` den Body-Teil (alles zwischen `<title>` und `<script id="core">`) durch:

```html
<style>
  *{box-sizing:border-box}
  body{font:14px/1.45 system-ui,sans-serif;margin:0;display:flex;height:100vh}
  #left{flex:1;display:flex;flex-direction:column;min-width:0}
  #right{width:420px;border-left:1px solid #ccc;overflow:auto;padding:12px}
  #status{padding:10px 12px;border-bottom:1px solid #ccc;font-weight:600}
  #status.warn{background:#fff4e0}
  #status.bad{background:#ffe9e9}
  #status.good{background:#eaf7ea}
  #modes{padding:8px 12px;border-bottom:1px solid #eee;display:flex;gap:8px}
  #modes button{padding:6px 12px;cursor:pointer}
  #modes button[aria-pressed=true]{background:#333;color:#fff}
  canvas{flex:1;min-height:0;display:block;cursor:crosshair}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{border-bottom:1px solid #eee;padding:4px 6px;text-align:right}
  th:first-child,td:first-child{text-align:left}
  .badge{background:#eee;border-radius:3px;padding:1px 5px;font-size:11px}
  .badge.unchecked{background:#ffe0b2}
  tr.worst td{background:#ffecec}
  h3{margin:14px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.04em}
</style>

<div id="left">
  <div id="status">—</div>
  <div id="modes">
    <button data-mode="point"   aria-pressed="true">1 Punkt</button>
    <button data-mode="wall"    aria-pressed="false">2 Wand</button>
    <button data-mode="measure" aria-pressed="false">3 Messung</button>
    <span id="hint" style="align-self:center;color:#666"></span>
  </div>
  <canvas id="cv"></canvas>
</div>
<div id="right">
  <h3>Messungen</h3>
  <table id="tbl"><thead><tr>
    <th>von→nach</th><th>d [m]</th><th>v [mm]</th><th>Red.</th><th>w</th><th></th>
  </tr></thead><tbody></tbody></table>
  <h3>Noch messen</h3>
  <div id="sugg"></div>
  <h3>Export</h3>
  <button id="exp">JSON in die Zwischenablage</button>
  <pre id="wl" style="font-size:12px;white-space:pre-wrap"></pre>
</div>
```

- [ ] **Step 2: UI-Block anlegen**

Ersetze den Block `<script id="ui">` (bzw. lege ihn nach `core` an, vor `checks`):

```html
<script id="ui">
"use strict";
const C=globalThis.CORE;
const M={ pts:[], walls:[], meas:[], mode:'point', sel:[], fit:null, an:null, drag:null };

// --- Punkt-IDs: A..Z, dann AA, AB, ...
function nextId(){
  let i=M.pts.length;
  let s='';
  do{ s=String.fromCharCode(65+i%26)+s; i=Math.floor(i/26)-1; }while(i>=0);
  return s;
}

// --- Weltkoordinaten (mm) <-> Bildschirm
const cv=document.getElementById('cv'), ctx=cv.getContext('2d');
let VIEW={s:1, ox:0, oy:0};
const toScr=p=>({x:p.x*VIEW.s+VIEW.ox, y:p.y*VIEW.s+VIEW.oy});
const toWorld=(x,y)=>({x:(x-VIEW.ox)/VIEW.s, y:(y-VIEW.oy)/VIEW.s});

function autofit(){
  const P=M.fit?M.fit.pts:M.pts;
  if(!P.length){ VIEW={s:1,ox:cv.width/2,oy:cv.height/2}; return; }
  const xs=P.map(p=>p.x), ys=P.map(p=>p.y);
  const w=Math.max(...xs)-Math.min(...xs)||1000, h=Math.max(...ys)-Math.min(...ys)||1000;
  const s=Math.min((cv.width-80)/w, (cv.height-80)/h);
  VIEW={ s, ox:cv.width/2-(Math.min(...xs)+w/2)*s, oy:cv.height/2-(Math.min(...ys)+h/2)*s };
}

function recompute(){
  if(M.pts.length>=2 && C.activeMeas(M.meas).length){
    M.fit=C.solve(M.pts, M.meas);
    M.an=C.analyze(M.fit.pts, M.meas);
  } else { M.fit=null; M.an=null; }
  render();
}

function render(){
  const dpr=devicePixelRatio||1;
  cv.width=cv.clientWidth*dpr; cv.height=cv.clientHeight*dpr;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,cv.width,cv.height);
  autofit();
  const P=M.fit?M.fit.pts:M.pts, I=C.idx(P);
  // Waende
  ctx.strokeStyle='#333'; ctx.lineWidth=2*dpr;
  M.walls.forEach(([a,b])=>{
    if(I[a]==null||I[b]==null) return;
    const p=toScr(P[I[a]]), q=toScr(P[I[b]]);
    ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.stroke();
  });
  // Messungen
  ctx.strokeStyle='#3a7'; ctx.lineWidth=1*dpr; ctx.setLineDash([6*dpr,4*dpr]);
  C.activeMeas(M.meas).forEach(m=>{
    if(I[m.a]==null||I[m.b]==null) return;
    const p=toScr(P[I[m.a]]), q=toScr(P[I[m.b]]);
    ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.stroke();
  });
  ctx.setLineDash([]);
  // Punkte
  P.forEach((pt,i)=>{
    const p=toScr(pt);
    ctx.fillStyle=M.sel.includes(pt.id)?'#c30':'#036';
    ctx.beginPath(); ctx.arc(p.x,p.y,5*dpr,0,7); ctx.fill();
    ctx.fillStyle='#000'; ctx.font=`${12*dpr}px system-ui`;
    ctx.fillText(pt.id, p.x+8*dpr, p.y-8*dpr);
  });
  renderPanel();
}

function hit(wx,wy){
  const P=M.fit?M.fit.pts:M.pts;
  let best=null, bd=Infinity;
  P.forEach(p=>{ const d=C.dist(p,{x:wx,y:wy}); if(d<bd){bd=d;best=p;} });
  return (best && bd*VIEW.s < 14) ? best : null;
}

cv.addEventListener('mousedown',e=>{
  const r=cv.getBoundingClientRect(), dpr=devicePixelRatio||1;
  const w=toWorld((e.clientX-r.left)*dpr, (e.clientY-r.top)*dpr);
  const h=hit(w.x,w.y);
  if(M.mode==='point'){
    if(h){ M.drag=h.id; return; }
    M.pts.push({id:nextId(), x:w.x, y:w.y}); recompute(); return;
  }
  if(!h) return;
  M.sel.push(h.id);
  if(M.sel.length===2){
    const [a,b]=M.sel; M.sel=[];
    if(a===b){ render(); return; }
    if(M.mode==='wall'){
      const k=[a,b].sort().join('|');
      const at=M.walls.findIndex(w2=>[w2[0],w2[1]].sort().join('|')===k);
      if(at>=0) M.walls.splice(at,1); else M.walls.push([a,b]);   // Klick toggelt
      recompute();
    } else {
      const s=prompt(`Abstand ${a}–${b} in mm:`);
      const d=parseFloat((s||'').replace(',','.'));
      if(isFinite(d) && d>0) M.meas.push({a,b,d,sigma:C.SIGMA_DEF,on:true});
      else if(s!==null) alert('Ungültig: Abstand muss eine Zahl größer 0 sein.');
      recompute();
    }
  } else render();
});

cv.addEventListener('mousemove',e=>{
  if(!M.drag) return;
  const r=cv.getBoundingClientRect(), dpr=devicePixelRatio||1;
  const w=toWorld((e.clientX-r.left)*dpr, (e.clientY-r.top)*dpr);
  const p=M.pts.find(x=>x.id===M.drag);
  if(p){ p.x=w.x; p.y=w.y; render(); }
});
addEventListener('mouseup',()=>{ if(M.drag){ M.drag=null; recompute(); } });

document.querySelectorAll('#modes button').forEach(b=>{
  b.onclick=()=>{
    M.mode=b.dataset.mode; M.sel=[];
    document.querySelectorAll('#modes button').forEach(x=>
      x.setAttribute('aria-pressed', String(x===b)));
    document.getElementById('hint').textContent=
      {point:'Klicken legt an, Ziehen verschiebt',
       wall:'Zwei Punkte klicken (nochmal klicken entfernt die Wand)',
       measure:'Zwei Punkte klicken, dann Maß eintippen'}[M.mode];
    render();
  };
});
addEventListener('keydown',e=>{
  const b=document.querySelector(`#modes button[data-mode="${
    {1:'point',2:'wall',3:'measure'}[e.key]}"]`);
  if(b) b.click();
});
addEventListener('resize',render);

function renderPanel(){ /* Task 11 */ }
recompute();
</script>
```

- [ ] **Step 3: Core-Checks laufen lassen**

Run: `node test/run.mjs`
Expected: unverändert alle PASS. Der `ui`-Block wird vom Runner nicht geladen; schlägt etwas fehl, wurde versehentlich `core` bearbeitet.

- [ ] **Step 4: Im Browser prüfen**

Öffne `raumaufmass.html`. Prüfe der Reihe nach:
1. Vier Punkte in Rechteckform klicken → vier Kreise mit Beschriftung A–D erscheinen.
2. Taste `2`, die vier Kanten klicken → durchgezogener Rahmen.
3. Taste `3`, `A` und `B` klicken, `4000` eingeben → grüne Strichlinie, das Bild springt auf Meterskala.
4. Zurück auf `1`, einen Punkt ziehen → er folgt der Maus, beim Loslassen rechnet es neu.

- [ ] **Step 5: Commit**

```bash
git add raumaufmass.html
git commit -m "feat: canvas sketchpad with point, wall and measurement modes"
```

---

### Task 11: Statuszeile und Messtabelle

**Files:**
- Modify: `raumaufmass.html` (Block `ui`)

**Interfaces:**
- Consumes: `M.an` aus Task 10
- Produces: `renderPanel()` füllt `#status` und `#tbl`

- [ ] **Step 1: `renderPanel` ersetzen**

Ersetze im Block `ui` die Zeile `function renderPanel(){ /* Task 11 */ }` durch:

```js
const fmtM=mm=>(mm/1000).toFixed(3);

function statusText(){
  if(M.pts.length<3) return ['Zu wenig Punkte — mindestens 3 anlegen.','warn'];
  if(!M.an) return ['Noch keine Messung eingetragen.','warn'];
  if(M.fit && !M.fit.converged)
    return ['Ausgleichung nicht konvergiert — Ergebnis ist nicht belastbar.','bad'];
  if(M.an.dof>0)
    return [`Unterbestimmt — ${M.an.dof} ${M.an.dof===1?'Messung fehlt':'Messungen fehlen'}. `
           +`Gezeigt wird der beste zur Skizze passende Fit.`,'warn'];
  if(M.an.redundancy===0)
    return ['Bestimmt, aber keine Messung überprüfbar — jede Messung geht ungeprüft ein.','warn'];
  return [`Überbestimmt — σ̂ = ${M.an.sigmaHat.toFixed(1)} mm`,'good'];
}

function renderPanel(){
  const [txt,cls]=statusText();
  const st=document.getElementById('status');
  st.textContent=txt; st.className=cls;

  const tb=document.querySelector('#tbl tbody');
  tb.innerHTML='';
  const act=C.activeMeas(M.meas);
  // Index des groessten normierten Residuums = wahrscheinlichster Ausreisser
  let worst=-1;
  if(M.an) M.an.w.forEach((x,i)=>{ if(x!=null && (worst<0 || x>M.an.w[worst])) worst=i; });

  // absteigend nach w sortiert anzeigen, aber die Originalindizes behalten
  const rows=act.map((m,i)=>({m,i,w:M.an?M.an.w[i]:null}));
  rows.sort((p,q)=>(q.w??-1)-(p.w??-1));

  rows.forEach(({m,i,w})=>{
    const tr=document.createElement('tr');
    if(i===worst && w!=null) tr.className='worst';
    const red=M.an?M.an.red[i]:null;
    const v=M.an?M.an.v[i]:null;
    tr.innerHTML=
      `<td>${m.a}→${m.b}</td>`+
      `<td><input value="${fmtM(m.d)}" size="6" style="text-align:right"></td>`+
      `<td>${v==null?'—':v.toFixed(1)}</td>`+
      `<td>${red==null?'—':red.toFixed(2)}</td>`+
      `<td>${w==null?'<span class="badge unchecked">nicht prüfbar</span>':w.toFixed(1)}</td>`+
      `<td><button title="Messung stilllegen/reaktivieren">${m.on===false?'aus':'an'}</button>`+
      `<button title="Messung löschen">×</button></td>`;
    const [inp]=tr.getElementsByTagName('input');
    inp.onchange=()=>{
      const d=parseFloat(inp.value.replace(',','.'))*1000;
      if(isFinite(d)&&d>0){ m.d=d; recompute(); }
      else { inp.value=fmtM(m.d); alert('Ungültig: Maß muss eine Zahl größer 0 sein.'); }
    };
    const [tog,del]=tr.getElementsByTagName('button');
    tog.onclick=()=>{ m.on=(m.on===false); recompute(); };
    del.onclick=()=>{ M.meas.splice(M.meas.indexOf(m),1); recompute(); };
    tb.appendChild(tr);
  });

  // Stillgelegte Messungen bleiben sichtbar, sonst findet man sie nie wieder
  M.meas.filter(m=>m.on===false).forEach(m=>{
    const tr=document.createElement('tr');
    tr.style.opacity='.45';
    tr.innerHTML=`<td>${m.a}→${m.b}</td><td>${fmtM(m.d)}</td><td>—</td><td>—</td>`+
                 `<td><span class="badge">stillgelegt</span></td><td><button>an</button></td>`;
    tr.getElementsByTagName('button')[0].onclick=()=>{ m.on=true; recompute(); };
    tb.appendChild(tr);
  });
}
```

- [ ] **Step 2: Core-Checks laufen lassen**

Run: `node test/run.mjs`
Expected: unverändert alle PASS.

- [ ] **Step 3: Im Browser prüfen — der Lügner-Fall**

Öffne `raumaufmass.html` und baue das Rechteck nach:
1. Vier Punkte, vier Wände.
2. Die vier Seiten messen: 4000, 3000, 4000, 3000.
   → Statuszeile: **„Unterbestimmt — 1 Messung fehlt"**, gelb.
3. Diagonale A–C mit 5000 messen.
   → Statuszeile: **„Bestimmt, aber keine Messung überprüfbar"**, gelb. In der Tabelle trägt **jede** Zeile das Badge *nicht prüfbar*, `Red.` steht überall auf `0.00`.
4. Zweite Diagonale B–D mit 5000 messen.
   → Statuszeile: **„Überbestimmt — σ̂ = 0.0 mm"**, grün. `Red.` jetzt überall größer 0.
5. B–D auf 5100 ändern.
   → σ̂ steigt, die Zeile B→D steht oben und ist rot hinterlegt.

Schritt 3 ist der entscheidende: stünde dort "alles gut" oder ein grünes Häkchen, wäre das Werkzeug falsch.

- [ ] **Step 4: Commit**

```bash
git add raumaufmass.html
git commit -m "feat: status line and measurement table with redundancy badges"
```

---

### Task 12: Vorschläge, Unsicherheiten, Export

**Files:**
- Modify: `raumaufmass.html` (Block `ui`)

**Interfaces:**
- Consumes: `CORE.suggest`, `CORE.covariance`, `CORE.ellipse`, `M.an.modes`
- Produces: vollständige UI

- [ ] **Step 1: Vorschlagsliste und Export ergänzen**

Am Ende von `renderPanel()` einfügen:

```js
  // --- Vorschläge, nach Zweck getrennt. Ungetrennt stünden hier fünf Einträge,
  //     während die Statuszeile "3 Messungen fehlen" meldet.
  const sg=document.getElementById('sugg');
  const list=(M.pts.length>=3 && M.an) ? C.suggest(M.fit?M.fit.pts:M.pts, M.walls, M.meas) : [];
  const grp=(t,w)=>{
    const e=list.filter(s=>s.why===w);
    return e.length ? `<div style="margin-bottom:6px"><b>${t}</b><br>`
      + e.map(s=>`${s.a} ↔ ${s.b}`).join(' &nbsp; ') + '</div>' : '';
  };
  if(!M.an) sg.textContent='—';
  else if(!list.length)
    sg.textContent = M.an.dof>0
      ? 'Keine messbare Strecke bringt das Netz weiter — fehlt eine Wand im Zug?'
      : 'Nichts mehr nötig.';
  else sg.innerHTML = grp('Damit der Raum bestimmt ist:','bestimmt')
                    + grp('Damit die Messungen prüfbar werden:','pruefbar');

  // --- Wandlängen
  const P=M.fit?M.fit.pts:M.pts, I=C.idx(P);
  document.getElementById('wl').textContent = M.walls
    .map(([a,b])=>`${a}–${b}  ${fmtM(C.dist(P[I[a]],P[I[b]]))} m`).join('\n');
```

Und einmalig, außerhalb von `renderPanel`:

```js
document.getElementById('exp').onclick=async()=>{
  const P=M.fit?M.fit.pts:M.pts;
  const json=JSON.stringify({
    pts:P.map(p=>({id:p.id, x:Math.round(p.x), y:Math.round(p.y)})),
    walls:M.walls,
    meas:M.meas,
    sigmaHat:M.an?M.an.sigmaHat:null,
  }, null, 2);
  try{ await navigator.clipboard.writeText(json); alert('JSON kopiert.'); }
  catch{ prompt('Kopieren mit Strg+C:', json); }
};
```

- [ ] **Step 2: Ellipsen und Flex-Pfeile zeichnen**

In `render()`, direkt vor dem Punkte-Block einfügen:

```js
  // Unsicherheiten. Drei Faelle, die verschieden aussehen muessen:
  // ueberbestimmt -> Ellipse aus sigmaHat; bestimmt -> Ellipse aus dem
  // angenommenen sigma; beweglich -> Pfeil, weil eine Ellipse dort unendlich
  // gross waere und die Zeichnung damit luegen wuerde.
  if(M.an){
    const moving=new Array(P.length).fill(false);
    M.an.modes.forEach(mo=>{
      const nrm=Math.hypot(...mo)||1;
      P.forEach((_,i)=>{
        if(Math.hypot(mo[2*i],mo[2*i+1])/nrm > C.TOL_MODE) moving[i]=true;
      });
    });
    const cov=M.an.dof===0 ? C.covariance(P, M.meas, M.an.sigmaHat) : null;
    ctx.lineWidth=1.5*dpr;
    P.forEach((pt,i)=>{
      const c=toScr(pt);
      if(moving[i]){
        ctx.strokeStyle='#c60';
        M.an.modes.forEach(mo=>{
          const nrm=Math.hypot(...mo)||1;
          const dx=mo[2*i]/nrm, dy=mo[2*i+1]/nrm;
          const L=34*dpr;
          ctx.beginPath();
          ctx.moveTo(c.x-dx*L, c.y-dy*L); ctx.lineTo(c.x+dx*L, c.y+dy*L);
          ctx.stroke();
        });
      } else if(cov){
        const e=C.ellipse(cov[i]);
        ctx.strokeStyle=M.an.sigmaHat!=null?'#07a':'#999';
        ctx.setLineDash(M.an.sigmaHat!=null?[]:[3*dpr,3*dpr]);
        ctx.save(); ctx.translate(c.x,c.y); ctx.rotate(e.ang);
        ctx.beginPath();
        // 3-fach ueberhoeht, sonst ist eine 6-mm-Ellipse im Meter-Massstab unsichtbar
        ctx.ellipse(0,0, Math.max(e.a*VIEW.s*3, 2*dpr), Math.max(e.b*VIEW.s*3, 2*dpr), 0, 0, 7);
        ctx.stroke(); ctx.restore(); ctx.setLineDash([]);
      }
    });
  }
```

Ergänze in der Legende unter der Zeichnung, also am Ende des `#modes`-Divs im Markup:

```html
    <span style="align-self:center;color:#666;margin-left:auto;font-size:12px">
      <span style="color:#07a">◯</span> gemessene Genauigkeit &nbsp;
      <span style="color:#999">◌</span> angenommen &nbsp;
      <span style="color:#c60">↔</span> noch beweglich
    </span>
```

- [ ] **Step 3: Core-Checks laufen lassen**

Run: `node test/run.mjs`
Expected: unverändert alle PASS.

- [ ] **Step 4: Im Browser prüfen**

Baue den L-Raum aus der Spec: sechs Punkte, sechs Wände, die sechs Wandlängen messen.
1. Statuszeile: **„Unterbestimmt — 3 Messungen fehlen"**. Unter *Damit der Raum bestimmt ist* stehen **genau drei** Paare — dieselbe Zahl wie in der Statuszeile. Darunter die zweite Gruppe *Damit die Messungen prüfbar werden* mit höchstens drei weiteren.
2. **`C ↔ F` darf in keiner der beiden Gruppen stehen** — diese Diagonale verlässt den Raum. Steht sie da, ist der Messbarkeitsfilter kaputt.
3. Auf mehreren Punkten stehen orange Doppelpfeile statt Ellipsen.
4. Die drei vorgeschlagenen Maße eintragen → Statuszeile springt auf *bestimmt*, Pfeile verschwinden, gestrichelte graue Ellipsen erscheinen.
5. Eine weitere Messung ergänzen → Ellipsen werden blau und durchgezogen, σ̂ erscheint.
6. Export klicken → JSON in der Zwischenablage, `pts` enthält sechs Einträge mit gerundeten mm.

- [ ] **Step 5: Commit**

```bash
git add raumaufmass.html
git commit -m "feat: suggestion list, uncertainty ellipses, flex arrows, json export"
```

---

## Selbstreview des Plans

**Spec-Abdeckung**

| Spec-Abschnitt | Task |
|---|---|
| Datenmodell `pts` / `walls` / `meas`, Duplikate, `on:false` | 1, 10, 11 |
| `residuals` | 1 |
| `jacobian` | 2 |
| Eichung durch Pinnen, nicht-degenerierte zweite Koordinate | 5 |
| Skizze skalieren | 6 |
| `solve` (Gauß-Newton + LM, ≤30 Iter, dichte Zerlegung) | 6 |
| Eine Zerlegung → Rang, Nullraum, Hebelwerte | 4 |
| Nullraum ohne Starrbewegungen (durch Pinnen) | 5, 7 |
| `dof`, Redundanzzahlen, `w`, `sigmaHat` | 7 |
| Schwellen `TOL_RANK` / `TOL_RED` / `TOL_MODE` | 1 (definiert), 4, 7, 12 |
| Kovarianz per freier Netzausgleichung | 8 |
| `suggest` mit Messbarkeitsfilter und Greedy | 9 |
| `suggest` schaltet bei `dof=0` auf Prüfbarkeit um, `why`-Feld, Deckel bei 3 | 9 |
| Drei Modi, Punkte ziehen, IDs A…Z/AA | 10 |
| Live-Neuberechnung ohne „Berechnen"-Knopf | 10 |
| Statuszeile, drei Zustände | 11 |
| Messtabelle, nach `w` sortiert, Badge *nicht prüfbar* | 11 |
| Vorschlagsliste, zwei Gruppen nach `why` | 12 |
| Ellipsen (3 Fälle: gemessen / angenommen / Pfeil) | 12 |
| Export JSON + Wandlängen | 12 |
| Fehlerfall < 3 Punkte | 11 (Statuszeile) |
| Fehlerfall Wandzug nicht geschlossen / Grad ≠ 2 | 9 (`wallPolygon → null`), 12 (Hinweistext) |
| Fehlerfall `d ≤ 0` | 10 (Eingabe), 11 (Tabelle) |
| Fehlerfall Solver konvergiert nicht | 11 (Statuszeile, rot) |
| Spec-Test 1 Ausreißer + Erholung nach Stilllegen | 7 |
| Spec-Test 2 fehlende Messungen | 7 |
| Spec-Test 3 Lügner-Fall | 7 |
| Spec-Test 4 Vorschlagsfilter | 9 |

Nicht als eigene Task abgedeckt und bewusst so: **isolierter Punkt / unverbundene Komponente**. `analyze` meldet ihn implizit — ein Punkt ohne Messung erzeugt zwei Flex-Moden und bekommt in Task 12 Pfeile in beide Richtungen. Die Statuszeile sagt „N Messungen fehlen". Eine eigene Komponentenanalyse ist damit überflüssig.

**Typkonsistenz** — geprüft: `analyze` gibt `red` (nicht `redundanz`) und `redundancy` (Skalar) zurück; beide werden in Task 11 und 12 unter genau diesen Namen gelesen. `gramSchmidt` gibt `k` zurück, `nullSpace` liest es (in Task 4 Schritt 3 nachgezogen). `covariance` erwartet `sigmaHat` als drittes Argument und verträgt `null`. Die Assert-Funktion heißt ab Task 3 durchgehend `A2`.

**Vorabprüfung der Sollwerte**

Der gesamte Mathe-Kern wurde vor Fertigstellung dieses Plans einmal
durchgerechnet, um die behaupteten Zahlen zu belegen. Dabei fielen drei Fehler
auf, die alle in diesen Plan eingearbeitet sind:

1. Prüfungen gegen absolute Koordinaten schlagen fehl, obwohl die Form exakt
   stimmt — Lage und Drehung erbt das Ergebnis von der Skizze. Alle Prüfungen
   vergleichen jetzt Abstände.
2. `suggest` liefert nach Erreichen der Bestimmtheit weitere Vorschläge zur
   Prüfbarkeit. Ohne das Feld `why` widerspräche die Liste der Statuszeile.
   Deshalb `why` und der Deckel `SUGGEST_CHECK_MAX`.
3. Die Spec behauptete ursprünglich eine Rekonstruktion auf ~2 mm trotz
   20-mm-Ausreißer. Tatsächlich verzieht der Ausreißer bei nur drei redundanten
   Messungen Abstände um bis zu 12,7 mm. Spec und Test sagen das jetzt so — und
   prüfen stattdessen die Erholung nach dem Stilllegen.

Gemessene Sollwerte zum Abgleich: `sigmaHat ≈ 6.98 mm` im L-Test, `rank = 9`,
`suggest` für das L in 0,4 ms.

**Bekannte Grenzen, bewusst so gelassen**

- `segInPoly` tastet ab und ist bei drei kollinearen Ecken willkürlich. Entarteter Raum.
- `suggest` ist greedy, nicht optimal. Bei 30 Punkten ist die Kandidatenschleife O(n²) je Runde — im L-Test 0,4 ms, also unkritisch.
- Kein Undo, kein Speichern im Browser. Der Export ist der Persistenzweg.

---

## Execution Handoff

Plan gespeichert unter `docs/superpowers/plans/2026-07-25-raumaufmass.md`.
