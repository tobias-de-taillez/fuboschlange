# Raumaufmaß Persistenz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raumbibliothek in localStorage, Datei-Export/Import und Raum-als-Link mit QR — alles serverlos in der einen `raumaufmass.html`.

**Architecture:** Zwei neue Script-Blöcke in der Single-File-App: `vendor` (lz-string + qrcode-generator, inline, MIT) und `store` (DOM-freie Persistenzlogik mit injizierbarem Storage, dadurch in Node testbar). Der `ui`-Block bekommt Bibliotheks-Overlay, Datei-/Link-Aktionen und die neue Boot-Sequenz. `core` und bestehende Checks bleiben unangetastet.

**Tech Stack:** Vanilla JS, localStorage, lz-string 1.5.0, qrcode-generator 1.4.4, Node-Testrunner `test/run.mjs` (extrahiert Script-Blöcke per Regex).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-31-raumaufmass-persistenz-design.md`.
- Single-File ohne Build: keine CDN-Loads, keine npm-Abhängigkeit; Vendor-Code wird eingebettet, mit Lizenzkommentar (Name, Version, Quelle, MIT).
- `<script id="core">` und der bestehende Inhalt von `selfChecks()` werden nicht verändert (nur ergänzt); `node test/run.mjs` muss nach jedem Task „ALLE CHECKS GRÜN" melden.
- Store-Block greift NIE auf DOM oder `localStorage` direkt zu — Storage wird injiziert (Node-Testbarkeit).
- Import (Datei/Link/Clipboard) validiert vollständig via bestehendem `importProblem()` VOR jeder Zustandsänderung und legt immer einen NEUEN Raum an.
- Alle UI-Texte deutsch, bestehender Ton (kein Jargon in Primär-UI).
- Arbeitsverzeichnis: Worktree `/Volumes/external/TobiCodetEndlichWieder/Zaene/.claude/worktrees/raum-scratchpad`.
- Browser-Verifikation gegen den laufenden Static-Server: `http://localhost:8741/raumaufmass.html` (launch.json-Eintrag `raumaufmass` existiert).

---

### Task 1: Vendor-Block (lz-string + qrcode-generator) einbetten

**Files:**
- Modify: `raumaufmass.html` (neuer `<script id="vendor">` direkt VOR `<script id="core">`)
- Modify: `test/run.mjs` (vendor mitladen)

**Interfaces:**
- Produces: `globalThis.LZString` mit `compressToEncodedURIComponent(str)` / `decompressFromEncodedURIComponent(str)`; `globalThis.qrcode(typeNumber, errorCorrectionLevel)` mit `.addData(str)`, `.make()`, `.getModuleCount()`, `.isDark(row, col)`.

- [ ] **Step 1: Bibliotheken pinned herunterladen**

```bash
cd /Volumes/external/TobiCodetEndlichWieder/Zaene/.claude/worktrees/raum-scratchpad
curl -sL https://unpkg.com/lz-string@1.5.0/libs/lz-string.min.js -o /tmp/lz-string.min.js
curl -sL https://unpkg.com/qrcode-generator@1.4.4/qrcode.js -o /tmp/qrcode.js
wc -c /tmp/lz-string.min.js /tmp/qrcode.js
```

Expected: beide Dateien > 3000 Bytes. (`qrcode.js` unminifiziert ist ok, ~40 KB; falls unpkg 404 liefert, alternativ `https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js`.)

- [ ] **Step 2: Vendor-Block einfügen**

In `raumaufmass.html` direkt vor der Zeile `<script id="core">` einfügen (Dateiinhalte an den markierten Stellen einsetzen):

```html
<script id="vendor">
/* Eingebettete Fremdbibliotheken - Single-File-Philosophie: kein CDN, kein
   Build; ein CDN-Load waere auf der Baustelle ohne Netz ein Ausfallpunkt.
   1) lz-string 1.5.0 (MIT, https://github.com/pieroxy/lz-string) -
      komprimiert den Raumzustand fuers URL-Fragment.
   2) qrcode-generator 1.4.4 (MIT, https://github.com/kazuhikoarase/qrcode-generator) -
      zeichnet den Teilen-Link als QR-Code. */
// --- lz-string@1.5.0 ---
[INHALT VON /tmp/lz-string.min.js]
// --- qrcode-generator@1.4.4 ---
[INHALT VON /tmp/qrcode.js]
</script>
```

Einfügen per Python (robust gegen Sonderzeichen im Minified-Code):

```bash
python3 - <<'EOF'
import pathlib
p = pathlib.Path('raumaufmass.html')
html = p.read_text()
lz = pathlib.Path('/tmp/lz-string.min.js').read_text().strip()
qr = pathlib.Path('/tmp/qrcode.js').read_text().strip()
assert '</script>' not in lz and '</script>' not in qr
block = ('<script id="vendor">\n'
 '/* Eingebettete Fremdbibliotheken - Single-File-Philosophie: kein CDN, kein\n'
 '   Build; ein CDN-Load waere auf der Baustelle ohne Netz ein Ausfallpunkt.\n'
 '   1) lz-string 1.5.0 (MIT, https://github.com/pieroxy/lz-string) -\n'
 '      komprimiert den Raumzustand fuers URL-Fragment.\n'
 '   2) qrcode-generator 1.4.4 (MIT, https://github.com/kazuhikoarase/qrcode-generator) -\n'
 '      zeichnet den Teilen-Link als QR-Code. */\n'
 '// --- lz-string@1.5.0 ---\n' + lz + '\n'
 '// --- qrcode-generator@1.4.4 ---\n' + qr + '\n'
 '</script>\n\n')
needle = '<script id="core">'
assert html.count(needle) == 1
p.write_text(html.replace(needle, block + needle, 1))
print('vendor eingefuegt')
EOF
```

- [ ] **Step 3: Failing check schreiben**

In `raumaufmass.html` im `<script id="checks">`-Block, INNERHALB von `selfChecks()` direkt vor `return {ok, out};` einfügen:

```js
  // --- vendor: lz-string und qrcode sind eingebettet und funktionieren ---
  {
    const s='Wohnzimmer äöü 4,25m — Punkt AA';
    const enc=globalThis.LZString && LZString.compressToEncodedURIComponent(s);
    chk('vendor: lz-string Roundtrip', !!enc && LZString.decompressFromEncodedURIComponent(enc)===s);
    chk('vendor: lz-string Ausgabe ist URL-sicher', !!enc && /^[A-Za-z0-9+$-]+$/.test(enc));
    chk('vendor: qrcode-generator vorhanden', (()=>{
      try{ const q=globalThis.qrcode(0,'M'); q.addData('https://example.com/#raum=abc'); q.make();
           return q.getModuleCount()>0 && typeof q.isDark(0,0)==='boolean'; }
      catch(e){ return false; }
    })());
  }
```

- [ ] **Step 4: Check läuft rot (vendor noch nicht in run.mjs geladen)**

```bash
node test/run.mjs | tail -5
```

Expected: `FAIL vendor: ...`-Zeilen und `CHECKS ROT` (LZString ist in Node noch nicht definiert — `chk` fängt das als false, weil `globalThis.LZString` undefined ist; wirft der Lauf stattdessen eine ReferenceError-Exception, ist das gleichwertig rot).

- [ ] **Step 5: run.mjs vendor mitladen lassen**

In `test/run.mjs` die Zeile

```js
new Function(pick('core')+'\n'+pick('checks'))();
```

ersetzen durch

```js
new Function(pick('vendor')+'\n'+pick('core')+'\n'+pick('checks'))();
```

- [ ] **Step 6: Checks grün**

```bash
node test/run.mjs | tail -3
```

Expected: `ALLE CHECKS GRÜN`, darunter kein FAIL. Zusätzlich `node test/run.mjs | grep vendor` zeigt 3× PASS.

- [ ] **Step 7: Commit**

```bash
git add raumaufmass.html test/run.mjs
git commit -m "feat: embed lz-string and qrcode-generator as vendor block"
```

---

### Task 2: Store-Block — Raumbibliothek mit injizierbarem Storage

**Files:**
- Modify: `raumaufmass.html` (neuer `<script id="store">` direkt NACH dem `core`-Block-Ende `</script>`, vor `<script id="ui">`; plus Checks in `selfChecks()`)
- Modify: `test/run.mjs` (store mitladen)

**Interfaces:**
- Consumes: nichts aus core; `LZString` erst in Task 3.
- Produces: `globalThis.STORE_FACTORY(storage)` → Objekt mit exakt:
  - `list() -> [{id,name,updated,area}]` (neueste zuerst, ohne `data`)
  - `load(id) -> {id,name,updated,area,data}|null`
  - `create(name) -> id` (legt `{data:{pts:[],walls:[],meas:[],idSeq:0}}` an)
  - `save(id, {name?, data?, area?}) -> boolean` (merge; `updated` = jetzt; false bei unbekannter id oder Quota-Fehler)
  - `rename(id, name) -> boolean`
  - `remove(id) -> void`
  - `currentId() -> id|null`, `setCurrent(id) -> void`
  - `migrate() -> boolean` (Alt-Schlüssel `raumaufmass` → Raum „Unbenannt", true wenn migriert)
  - `storageOk -> boolean` (false, wenn setItem beim Selbsttest wirft — Private Mode)
- `globalThis.STORE` = `STORE_FACTORY(localStorage)` nur wenn `typeof localStorage!=='undefined'` (Browser).

- [ ] **Step 1: Failing checks schreiben**

In `selfChecks()` vor `return {ok, out};` einfügen:

```js
  // --- store: Raumbibliothek (DOM-frei, Storage injiziert) ---
  {
    const fakeStorage=()=>{ const m=new Map(); return {
      getItem:k=>m.has(k)?m.get(k):null,
      setItem:(k,v)=>m.set(k,String(v)),
      removeItem:k=>m.delete(k),
    };};
    const mkData=()=>({pts:[{id:'A',x:0,y:0}],walls:[],meas:[],idSeq:1});

    const st=globalThis.STORE_FACTORY && STORE_FACTORY(fakeStorage());
    chk('store: Factory vorhanden', !!st);
    if(st){
      chk('store: leere Bibliothek', st.list().length===0 && st.currentId()===null);
      const id=st.create('Wohnzimmer');
      chk('store: create liefert id und listet', typeof id==='string' && st.list().length===1);
      chk('store: create legt leeres data an', st.load(id).data.pts.length===0 && st.load(id).data.idSeq===0);
      chk('store: save merged data und area', st.save(id,{data:mkData(),area:15.12})===true
        && st.load(id).data.pts.length===1 && st.load(id).area===15.12);
      chk('store: save auf unbekannte id -> false', st.save('gibtsnicht',{area:1})===false);
      chk('store: rename', st.rename(id,'Küche')===true && st.load(id).name==='Küche');
      chk('store: list ohne data, neueste zuerst', (()=>{
        const id2=st.create('Bad');
        const l=st.list();
        return l.length===2 && l[0].id===id2 && !('data' in l[0]);
      })());
      st.setCurrent(id);
      chk('store: current', st.currentId()===id);
      st.remove(id);
      chk('store: remove entfernt und raeumt current', st.list().length===1 && st.currentId()===null);
    }
    // Migration: Alt-Schluessel wird zu "Unbenannt"
    {
      const raw=fakeStorage();
      raw.setItem('raumaufmass', JSON.stringify(mkData()));
      const st2=globalThis.STORE_FACTORY && STORE_FACTORY(raw);
      const did=st2 && st2.migrate();
      chk('store: migrate uebernimmt Alt-Schluessel', did===true && st2.list().length===1
        && st2.list()[0].name==='Unbenannt' && st2.load(st2.list()[0].id).data.pts.length===1);
      chk('store: migrate loescht Alt-Schluessel', raw.getItem('raumaufmass')===null);
      chk('store: migrate nur einmal', st2.migrate()===false);
    }
    // Kaputter rooms-Eintrag darf nicht crashen
    {
      const raw=fakeStorage();
      raw.setItem('raumaufmass.rooms','{{kaputt');
      const st3=globalThis.STORE_FACTORY && STORE_FACTORY(raw);
      chk('store: kaputtes JSON -> leere Bibliothek statt Absturz', !!st3 && st3.list().length===0);
    }
    // Quota-Fehler: setItem wirft -> save false, storageOk false
    {
      const boom={getItem:()=>null,setItem:()=>{throw new Error('QuotaExceeded');},removeItem:()=>{}};
      const st4=globalThis.STORE_FACTORY && STORE_FACTORY(boom);
      chk('store: werfender Storage -> storageOk false', !!st4 && st4.storageOk===false);
      chk('store: save bei vollem Storage -> false statt Exception', (()=>{
        try{ const id=st4.create('X'); return st4.save(id,{area:1})===false || st4.list().length===0; }
        catch(e){ return false; }
      })());
    }
  }
```

- [ ] **Step 2: Rot laufen lassen**

```bash
node test/run.mjs | grep -c "FAIL store" 
```

Expected: mindestens `1` (alle store-Checks FAIL, weil `STORE_FACTORY` fehlt). Gesamtlauf: `CHECKS ROT`.

- [ ] **Step 3: Store-Block implementieren**

Nach dem `</script>` des core-Blocks (vor `<script id="ui">`) einfügen:

```html
<script id="store">
"use strict";
// Raumbibliothek. DOM-frei und mit injiziertem Storage: genau dadurch in
// Node testbar (test/run.mjs), wo es kein localStorage gibt. Alle Eintraege
// leben unter zwei Schluesseln - raumaufmass.rooms (Array) und
// raumaufmass.current (id). Der Alt-Schluessel "raumaufmass" (Einzelraum
// aus der Vor-Bibliothek-Version) wird einmalig migriert.
globalThis.STORE_FACTORY=function makeStore(storage){
  const K_ROOMS='raumaufmass.rooms', K_CUR='raumaufmass.current', K_OLD='raumaufmass';
  // Selbsttest statt Feature-Detection: Private-Mode-Safari hat setItem,
  // wirft aber. Einmal pruefen, Ergebnis als Flag fuer die UI.
  let storageOk=true;
  try{ storage.setItem(K_ROOMS+'.probe','1'); storage.removeItem(K_ROOMS+'.probe'); }
  catch(e){ storageOk=false; }

  const readRooms=()=>{
    try{
      const raw=storage.getItem(K_ROOMS);
      const arr=raw?JSON.parse(raw):[];
      return Array.isArray(arr)?arr:[];
    }catch(e){ return []; }   // kaputtes JSON: leere Bibliothek statt Absturz
  };
  const writeRooms=rooms=>{
    try{ storage.setItem(K_ROOMS, JSON.stringify(rooms)); return true; }
    catch(e){ return false; }
  };
  const newId=()=> (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,10);

  return {
    storageOk,
    list(){
      return readRooms()
        .map(r=>({id:r.id,name:r.name,updated:r.updated,area:r.area??null}))
        .sort((a,b)=>String(b.updated).localeCompare(String(a.updated)));
    },
    load(id){
      const r=readRooms().find(r=>r.id===id);
      return r?{...r}:null;
    },
    create(name){
      const rooms=readRooms();
      const id=newId();
      rooms.push({id, name:name||'Unbenannt', updated:new Date().toISOString(),
                  area:null, data:{pts:[],walls:[],meas:[],idSeq:0}});
      writeRooms(rooms);
      return id;
    },
    save(id,patch){
      const rooms=readRooms();
      const r=rooms.find(r=>r.id===id);
      if(!r) return false;
      if(patch.name!==undefined) r.name=patch.name;
      if(patch.data!==undefined) r.data=patch.data;
      if(patch.area!==undefined) r.area=patch.area;
      r.updated=new Date().toISOString();
      return writeRooms(rooms);
    },
    rename(id,name){ return this.save(id,{name}); },
    remove(id){
      writeRooms(readRooms().filter(r=>r.id!==id));
      if(this.currentId()===id){
        try{ storage.removeItem(K_CUR); }catch(e){}
      }
    },
    currentId(){
      try{ return storage.getItem(K_CUR); }catch(e){ return null; }
    },
    setCurrent(id){
      try{ storage.setItem(K_CUR,id); }catch(e){}
    },
    migrate(){
      let old=null;
      try{ old=storage.getItem(K_OLD); }catch(e){ return false; }
      if(!old) return false;
      let data=null;
      try{ data=JSON.parse(old); }catch(e){}
      try{ storage.removeItem(K_OLD); }catch(e){}
      if(!data || !Array.isArray(data.pts)) return false;
      const rooms=readRooms();
      rooms.push({id:newId(), name:'Unbenannt', updated:new Date().toISOString(),
                  area:null, data});
      writeRooms(rooms);
      return true;
    },
  };
};
// Im Browser sofort eine an localStorage gebundene Instanz; in Node bleibt
// nur die Factory (die Checks injizieren sich ihren eigenen Speicher).
if(typeof localStorage!=='undefined'){
  globalThis.STORE=globalThis.STORE_FACTORY(localStorage);
}
</script>

```

Hinweis zur Konsistenz mit den Checks: `remove` räumt `current` nur, wenn es auf die gelöschte id zeigt — der Check `remove entfernt und raeumt current` setzt vorher `setCurrent(id)`.

- [ ] **Step 4: run.mjs store mitladen**

In `test/run.mjs`:

```js
new Function(pick('vendor')+'\n'+pick('core')+'\n'+pick('store')+'\n'+pick('checks'))();
```

- [ ] **Step 5: Grün laufen lassen**

```bash
node test/run.mjs | tail -3 && node test/run.mjs | grep -c "PASS store"
```

Expected: `ALLE CHECKS GRÜN` und mindestens `15` PASS-store-Zeilen.

- [ ] **Step 6: Commit**

```bash
git add raumaufmass.html test/run.mjs
git commit -m "feat: room library store with injectable storage"
```

---

### Task 3: Share-Codec — Raum ↔ Link-Fragment

**Files:**
- Modify: `raumaufmass.html` (Funktionen im `store`-Block ergänzen; Checks in `selfChecks()`)

**Interfaces:**
- Consumes: `LZString` (Task 1).
- Produces: im `store`-Block, auf `globalThis`:
  - `encodeShare({name, data}) -> string` (lz-string-komprimiert, URL-sicher)
  - `decodeShare(str) -> {name, data}|null` (null bei jedem Müll)
  - `parseShareFragment(hash) -> {name, data}|null` (nimmt `location.hash`-Form `#raum=<blob>`; alles andere → null)

- [ ] **Step 1: Failing checks**

In `selfChecks()` vor `return {ok, out};`:

```js
  // --- share: Raum <-> Link-Fragment ---
  {
    const room={name:'Küche äöü', data:{pts:[{id:'AA',x:1,y:2}],walls:[['AA','AA']],meas:[],idSeq:27}};
    const enc=globalThis.encodeShare && encodeShare(room);
    chk('share: encode liefert URL-sicheren String', !!enc && /^[A-Za-z0-9+$-]+$/.test(enc));
    chk('share: Roundtrip identisch', !!enc && JSON.stringify(decodeShare(enc))===JSON.stringify(room));
    chk('share: decode von Muell -> null', globalThis.decodeShare && decodeShare('%%%nichtkomprimiert')===null);
    chk('share: decode von leer -> null', globalThis.decodeShare && decodeShare('')===null);
    chk('share: parseShareFragment happy path', (()=>{
      if(!globalThis.parseShareFragment) return false;
      const p=parseShareFragment('#raum='+enc);
      return !!p && p.name==='Küche äöü' && p.data.idSeq===27;
    })());
    chk('share: parseShareFragment ohne raum= -> null',
      globalThis.parseShareFragment && parseShareFragment('#foo=bar')===null
      && parseShareFragment('')===null && parseShareFragment('#raum=')===null);
  }
```

- [ ] **Step 2: Rot**

```bash
node test/run.mjs | grep -c "FAIL share"
```

Expected: mindestens `1`; Gesamtlauf `CHECKS ROT`.

- [ ] **Step 3: Implementierung**

Im `store`-Block, direkt vor der Zeile `if(typeof localStorage!=='undefined'){`:

```js
// Teilen-Link: Zustand -> JSON -> lz-string -> URL-Fragment. Das Fragment
// verlaesst den Browser nie (geht an keinen Server) - Persistenz und
// Weitergabe ohne jede Infrastruktur. decode ist die Vertrauensgrenze:
// jeder Muell ergibt null, nie eine Exception; die inhaltliche Pruefung
// macht danach importProblem() in der UI.
globalThis.encodeShare=function(room){
  return LZString.compressToEncodedURIComponent(JSON.stringify({name:room.name, data:room.data}));
};
globalThis.decodeShare=function(s){
  if(!s || typeof s!=='string') return null;
  let json=null;
  try{ json=LZString.decompressFromEncodedURIComponent(s); }catch(e){ return null; }
  if(!json) return null;
  try{
    const o=JSON.parse(json);
    if(!o || typeof o!=='object' || !o.data || typeof o.data!=='object') return null;
    return {name:typeof o.name==='string'?o.name:'Geteilter Raum', data:o.data};
  }catch(e){ return null; }
};
globalThis.parseShareFragment=function(hash){
  if(typeof hash!=='string') return null;
  const m=hash.match(/^#raum=(.+)$/);
  return m ? globalThis.decodeShare(m[1]) : null;
};
```

- [ ] **Step 4: Grün**

```bash
node test/run.mjs | tail -3
```

Expected: `ALLE CHECKS GRÜN`.

- [ ] **Step 5: Commit**

```bash
git add raumaufmass.html
git commit -m "feat: share codec room to url fragment and back"
```

---

### Task 4: Boot-Sequenz auf die Bibliothek umstellen

**Files:**
- Modify: `raumaufmass.html` (`ui`-Block: Boot-Code am Blockende ersetzen, Autosave in `recompute()` umstellen, Flächen-Helper, Raumname in Statuskarte; HTML: eine Zeile in `#status`)

**Interfaces:**
- Consumes: `STORE` (Task 2), `parseShareFragment` (Task 3), bestehende `serialize()/deserialize()/importProblem()/recompute()`.
- Produces: `ui`-Block-Globals für Task 5–7: `let currentRoom` (id|null), `function openRoom(id)`, `function newRoom(name)`, `function importAsNewRoom(name, dataObj)` (validiert, legt an, öffnet; Rückgabe `string|null` = Fehlertext), `function polyAreaM2()` (m²|null des aktuellen Fits).

- [ ] **Step 1: HTML — Raumname in die Statuskarte**

In `raumaufmass.html` die Zeile

```html
    <div id="status" class="warn"><div id="statustxt">—</div><div id="geo"></div></div>
```

ersetzen durch

```html
    <div id="status" class="warn"><div id="roomname" title="Antippen: Raum umbenennen">—</div><div id="statustxt">—</div><div id="geo"></div></div>
```

und im CSS (nach der `#statustxt`-Regel) einfügen:

```css
  #roomname{font-size:12px;color:var(--muted);cursor:pointer;margin-bottom:2px;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
```

- [ ] **Step 2: ui-Block — Helper und Raumverwaltung**

Im `ui`-Block direkt NACH der Definition von `recompute()` (nach deren schließender `}`) einfügen:

```js
// ================= Raumbibliothek (Anbindung) =================
let currentRoom=null;

// Flaeche des aktuellen Fits in m2 - fuer die Bibliotheksliste beim
// Speichern mitgerechnet, damit die Liste ohne Solver-Laeufe rendert.
function polyAreaM2(){
  if(!M.fit) return null;
  const P=M.fit.pts;
  const poly=C.wallPolygon(P, M.walls);
  if(!poly) return null;
  let a=0;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++)
    a+=poly[j].x*poly[i].y-poly[i].x*poly[j].y;
  return Math.abs(a)/2/1e6;
}

function openRoom(id){
  const r=STORE.load(id);
  if(!r) return;
  currentRoom=id;
  STORE.setCurrent(id);
  deserialize(r.data);
  userView=false;
  recompute();
}
function newRoom(name){
  const id=STORE.create(name||'Neuer Raum');
  openRoom(id);
  setMode('draw');
}
// Ein Import (Datei, Link, Clipboard) legt IMMER einen neuen Raum an und
// ueberschreibt nie stumm den aktuellen. Rueckgabe: Fehlertext oder null.
function importAsNewRoom(name, dataObj){
  const problem=importProblem(dataObj);
  if(problem) return problem;
  const id=STORE.create(name||'Importierter Raum');
  STORE.save(id,{data:dataObj});
  openRoom(id);
  return null;
}
```

- [ ] **Step 3: Autosave in recompute() umstellen**

Im `ui`-Block in `recompute()` den Block

```js
  try{ localStorage.setItem('raumaufmass', serialize()); }catch{}
```

ersetzen durch

```js
  if(currentRoom) STORE.save(currentRoom, {data:JSON.parse(serialize()), area:polyAreaM2()});
```

(Der umgebende Kommentar „Ein Aufmass dauert leicht eine halbe Stunde…" bleibt stehen.)

- [ ] **Step 4: Raumname rendern + Umbenennen**

In `renderPanel()` direkt nach `$('status').className=cls;` einfügen:

```js
  const room=currentRoom?STORE.load(currentRoom):null;
  $('roomname').textContent=room?room.name:'—';
```

Im `ui`-Block bei den anderen Button-Handlern (nach `$('fitview').onclick=...`) einfügen:

```js
$('roomname').onclick=()=>{
  if(!currentRoom) return;
  const r=STORE.load(currentRoom);
  const name=prompt('Raum umbenennen:', r?r.name:'');
  if(name && name.trim()){ STORE.rename(currentRoom, name.trim()); renderPanel(); }
};
```

- [ ] **Step 5: Boot-Sequenz ersetzen**

Am Ende des `ui`-Blocks den bisherigen Restore-Block

```js
// Ein Aufmass dauert leicht eine halbe Stunde. Ein Reload darf es nicht
// kosten - beim Start das letzte Autosave wiederherstellen, wenn eins da ist.
try{
  const gespeichert=localStorage.getItem('raumaufmass');
  if(gespeichert){
    const o=JSON.parse(gespeichert);
    if(o && Array.isArray(o.pts) && o.pts.length) deserialize(o);
  }
}catch{}

setMode('draw');
recompute();
```

ersetzen durch

```js
// ================= Boot =================
// Reihenfolge: Alt-Autosave migrieren -> Link-Fragment importieren ->
// zuletzt offenen Raum laden -> sonst neuesten -> sonst leeren anlegen.
STORE.migrate();
{
  const shared=parseShareFragment(location.hash);
  if(shared){
    // Fragment sofort aus der Adresszeile nehmen: ein Reload soll den Raum
    // nicht ein zweites Mal importieren.
    history.replaceState(null,'',location.pathname+location.search);
    const err=importAsNewRoom(shared.name, shared.data);
    if(err){ setHint('Geteilter Link ungültig: '+err); }
    else setHint('Geteilter Raum importiert — als eigener Raum gespeichert.');
  }
}
if(!currentRoom){
  const cur=STORE.currentId();
  if(cur && STORE.load(cur)) { openRoom(cur); }
  else {
    const l=STORE.list();
    if(l.length) openRoom(l[0].id);
    else { currentRoom=STORE.create('Mein erster Raum'); STORE.setCurrent(currentRoom); }
  }
}
if(!STORE.storageOk)
  setHint('Speichern auf diesem Gerät nicht möglich (privater Modus?) — Räume als Datei oder Link sichern.');
setMode('draw');
recompute();
```

Zusätzlich in `$('clr').onclick` (Alles verwerfen) — Verhalten bleibt „aktuellen Raum leeren", kein Storage-Direktzugriff nötig, da `recompute()` jetzt über STORE speichert. Keine Änderung dort.

- [ ] **Step 6: Browser-Verifikation**

1. `node test/run.mjs | tail -1` → `ALLE CHECKS GRÜN` (Node-Seite unberührt).
2. Browser-Tab `http://localhost:8741/raumaufmass.html` neu laden (dort liegt noch ein Alt-Autosave aus der Vorversion). Prüfen via JS-Konsole:
   - `JSON.parse(localStorage.getItem('raumaufmass.rooms')).length` ≥ 1
   - `localStorage.getItem('raumaufmass')` → `null` (migriert)
   - Statuskarte zeigt „Unbenannt", Zeichnung ist der alte Raum (A–D sichtbar).
3. Raumname antippen → prompt → „Testraum" → Statuskarte zeigt „Testraum".
4. Reload → gleicher Raum, gleicher Name (current-Mechanik).

- [ ] **Step 7: Commit**

```bash
git add raumaufmass.html
git commit -m "feat: boot from room library, autosave via store, room name in status"
```

---

### Task 5: Bibliotheks-Overlay „Meine Räume"

**Files:**
- Modify: `raumaufmass.html` (HTML: Toolbar-Button + Overlay; CSS; `ui`-Block: Renderer + Handler)

**Interfaces:**
- Consumes: `STORE`, `openRoom`, `newRoom`, `currentRoom` (Task 4), `fmt2` (bestehend).
- Produces: `function openLib()` / `closeLib()` (Task 6 nutzt `renderLib` nicht — Export je Zeile ruft die Datei-Funktion `exportRoomAsFile(id)` aus Task 6; bis dahin zeigt der Button einen Hinweis).

- [ ] **Step 1: HTML Toolbar-Button**

Die Zeile

```html
      <div id="tools">
        <button id="undo" title="Rückgängig (Strg+Z)" aria-label="Rückgängig">↶</button>
```

ersetzen durch

```html
      <div id="tools">
        <button id="lib" title="Meine Räume" aria-label="Meine Räume">▤</button>
        <button id="undo" title="Rückgängig (Strg+Z)" aria-label="Rückgängig">↶</button>
```

Damit die Leiste auf 375 px passt, im CSS die Regel `#modes button{border:0;border-radius:0;min-width:82px}` ersetzen durch `#modes button{border:0;border-radius:0;min-width:72px}` und `#topbar{display:flex;gap:8px;...}` → `gap:6px`.

- [ ] **Step 2: HTML Overlay**

Direkt vor `<div id="pop" hidden>...` einfügen:

```html
      <div id="libwrap" hidden>
        <div id="libbox">
          <div id="libhead">
            <h2>Meine Räume</h2>
            <button id="libnew">+ Neuer Raum</button>
            <button id="libclose" aria-label="Schließen">✕</button>
          </div>
          <div id="libnote">Räume liegen nur auf diesem Gerät — wichtige Aufmaße als Datei oder Link sichern.</div>
          <div id="liblist"></div>
        </div>
      </div>
```

- [ ] **Step 3: CSS**

Vor der `/* Panel */`-Zeile einfügen:

```css
  /* Bibliothek */
  #libwrap{position:fixed;inset:0;z-index:9;background:rgba(38,36,31,.35);
    display:flex;align-items:flex-end;justify-content:center}
  #libwrap[hidden]{display:none}
  #libbox{background:var(--surface);width:100%;max-width:560px;max-height:80dvh;
    overflow-y:auto;border-radius:12px 12px 0 0;padding:14px;
    border:1px solid var(--line);border-bottom:0}
  @media(min-width:880px){
    #libwrap{align-items:center}
    #libbox{border-radius:10px;border-bottom:1px solid var(--line);max-height:70dvh}
  }
  #libhead{display:flex;align-items:center;gap:8px}
  #libhead h2{font-size:15px;margin:0;flex:1}
  #libnote{font-size:12px;color:var(--muted);margin:8px 0 10px}
  .librow{display:flex;align-items:center;gap:10px;padding:10px 4px;
    border-top:1px solid var(--line);cursor:pointer}
  .librow .nm{flex:1;min-width:0}
  .librow .nm b{display:block;font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .librow .nm small{color:var(--muted);font-size:12px}
  .librow.cur .nm b{color:var(--accent)}
  .librow button{min-height:32px;padding:0 10px;font-size:12.5px;flex:none}
```

- [ ] **Step 4: Renderer + Handler im ui-Block**

Nach dem `$('roomname').onclick`-Handler (Task 4) einfügen:

```js
// ================= Bibliothek (Overlay) =================
const fmtDate=iso=>{
  const d=new Date(iso);
  return isFinite(d) ? d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}) : '';
};
function renderLib(){
  const list=STORE.list();
  const el=$('liblist');
  if(!list.length){ el.innerHTML='<div style="padding:14px 4px;color:var(--muted)">Noch keine Räume.</div>'; return; }
  el.innerHTML=list.map(r=>
    `<div class="librow${r.id===currentRoom?' cur':''}" data-id="${r.id}">
       <div class="nm"><b>${r.name.replace(/</g,'&lt;')}</b>
         <small>zuletzt ${fmtDate(r.updated)}${r.area!=null?` · ${fmt2(r.area)} m²`:''}</small></div>
       <button class="ren" title="Umbenennen">Name</button>
       <button class="exp2" title="Als Datei sichern">Datei</button>
       <button class="del2" title="Löschen">×</button>
     </div>`).join('');
  el.querySelectorAll('.librow').forEach(row=>{
    const id=row.dataset.id;
    row.onclick=e=>{
      if(e.target.tagName==='BUTTON') return;   // Aktionen nicht als "oeffnen" werten
      openRoom(id); closeLib();
    };
    row.querySelector('.ren').onclick=()=>{
      const r=STORE.load(id);
      const name=prompt('Raum umbenennen:', r?r.name:'');
      if(name && name.trim()){ STORE.rename(id,name.trim()); renderLib(); renderPanel(); }
    };
    row.querySelector('.exp2').onclick=()=>{
      if(typeof exportRoomAsFile==='function') exportRoomAsFile(id);
      else setHint('Datei-Export kommt im nächsten Schritt.');
    };
    row.querySelector('.del2').onclick=()=>{
      const r=STORE.load(id);
      if(!confirm(`Raum „${r?r.name:''}" löschen?`)) return;
      STORE.remove(id);
      if(id===currentRoom){
        const l=STORE.list();
        if(l.length) openRoom(l[0].id); else newRoom('Neuer Raum');
      }
      renderLib();
    };
  });
}
function openLib(){ renderLib(); $('libwrap').hidden=false; }
function closeLib(){ $('libwrap').hidden=true; }
$('lib').onclick=openLib;
$('libclose').onclick=closeLib;
$('libnew').onclick=()=>{ newRoom(prompt('Name des neuen Raums:','Neuer Raum')||'Neuer Raum'); closeLib(); };
$('libwrap').addEventListener('pointerdown',e=>{ if(e.target===$('libwrap')) closeLib(); });
```

Und im globalen `keydown`-Handler den Escape-Zweig erweitern — aus

```js
  if(e.key==='Escape'){
    hidePop();
```

wird

```js
  if(e.key==='Escape'){
    hidePop();
    if(!$('libwrap').hidden){ closeLib(); return; }
```

- [ ] **Step 5: Browser-Verifikation**

1. Reload → „▤" antippen: Overlay mit „Testraum" (aktiv, accent) sichtbar, Datum + Fläche in der Zeile.
2. „+ Neuer Raum" → prompt „Balkon" → leerer Raum offen, Statuskarte „Balkon"; „▤" → zwei Zeilen, „Balkon" markiert.
3. Zeile „Testraum" antippen → alter Raum samt Zeichnung zurück.
4. „Name" → umbenennen auf „Wohnzimmer" → Zeile und Statuskarte aktualisiert.
5. „×" auf „Balkon" → Rückfrage → weg; aktiver Raum bleibt „Wohnzimmer".
6. Mobile-Viewport 375×812: Topbar einzeilig (kein Umbruch), Overlay als Bottom-Sheet.
7. `node test/run.mjs | tail -1` → `ALLE CHECKS GRÜN`.

- [ ] **Step 6: Commit**

```bash
git add raumaufmass.html
git commit -m "feat: room library overlay with open rename delete new"
```

---

### Task 6: Datei sichern / Datei öffnen

**Files:**
- Modify: `raumaufmass.html` (HTML „Daten"-Sektion; `ui`-Block: Export-/Import-Funktionen)

**Interfaces:**
- Consumes: `STORE`, `currentRoom`, `importAsNewRoom` (Task 4), `serialize()` (bestehend).
- Produces: `function exportRoomAsFile(id)` (auch von Task 5 Bibliothekszeile gerufen).

- [ ] **Step 1: HTML Daten-Sektion erweitern**

Den Block

```html
      <div class="btnrow">
        <button id="exp">JSON kopieren</button>
        <button id="imp">JSON einfügen</button>
        <button id="clr">Alles verwerfen</button>
      </div>
```

ersetzen durch

```html
      <div class="btnrow">
        <button id="filesave">Als Datei sichern</button>
        <button id="fileopen">Datei öffnen</button>
      </div>
      <div class="btnrow" style="margin-top:8px">
        <button id="exp">JSON kopieren</button>
        <button id="imp">JSON einfügen</button>
        <button id="clr">Alles verwerfen</button>
      </div>
      <input id="filepick" type="file" accept=".json,application/json" hidden>
```

- [ ] **Step 2: Export/Import-Funktionen**

Im `ui`-Block nach dem Bibliotheks-Abschnitt (Task 5) einfügen:

```js
// ================= Datei sichern / oeffnen =================
const slug=s=>String(s||'raum').toLowerCase()
  .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
  .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'raum';

function roomFilePayload(id){
  const r=STORE.load(id);
  if(!r) return null;
  return {
    name:r.name,
    // Export-Format = importProblem-Form plus Zusatzfelder; ein Reimport
    // laeuft durch dieselbe Validierung wie jeder andere Import.
    ...r.data,
  };
}
async function exportRoomAsFile(id){
  const payload=roomFilePayload(id);
  if(!payload) return;
  const json=JSON.stringify(payload,null,2);
  const fname=`${slug(payload.name)}-${new Date().toISOString().slice(0,10)}.json`;
  const file=new File([json], fname, {type:'application/json'});
  // Handy: Share-Sheet (iCloud/Drive/Mail); Desktop oder ohne Share: Download.
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title:payload.name}); return; }
    catch(e){ if(e && e.name==='AbortError') return; }   // abgebrochen: kein Fehler
  }
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([json],{type:'application/json'}));
  a.download=fname;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
  setHint(`Gespeichert als ${fname} (Downloads).`);
}
$('filesave').onclick=()=>{ if(currentRoom) exportRoomAsFile(currentRoom); };
$('fileopen').onclick=()=>$('filepick').click();
$('filepick').onchange=async()=>{
  const f=$('filepick').files[0];
  $('filepick').value='';
  if(!f) return;
  let o=null;
  try{ o=JSON.parse(await f.text()); }catch(e){ alert('Das ist keine gültige JSON-Datei.'); return; }
  const name=(o && typeof o.name==='string' && o.name.trim()) ? o.name.trim()
    : f.name.replace(/\.json$/i,'');
  const err=importAsNewRoom(name, o);
  if(err) alert('Datei hat nicht die erwartete Form: '+err);
  else setHint(`„${name}" importiert — als eigener Raum gespeichert.`);
};
```

Hinweis: `importAsNewRoom` reicht das ganze Objekt an `importProblem()` — Zusatzfelder (`name`, `sigmaHat`) stören die Validierung nicht (sie prüft nur `pts/walls/meas`), und `deserialize()` liest nur die bekannten Felder.

- [ ] **Step 3: Browser-Verifikation**

1. „Als Datei sichern" am Desktop-Viewport → Download `wohnzimmer-<datum>.json`; Inhalt beginnt mit `{"name": "Wohnzimmer"` und enthält `"pts"`.
2. „Datei öffnen" → dieselbe Datei wählen → neuer Raum „Wohnzimmer" (Bibliothek hat jetzt 2 Einträge — Import überschreibt nie).
3. Kaputte Datei (z. B. `echo '{"pts":1}' > /tmp/kaputt.json`) öffnen → Meldung „…erwartete Form: pts fehlt oder ist keine Liste.", Bibliothek unverändert.
4. Bibliothekszeilen-Button „Datei" exportiert die jeweilige Zeile.
5. `node test/run.mjs | tail -1` → `ALLE CHECKS GRÜN`.

- [ ] **Step 4: Commit**

```bash
git add raumaufmass.html
git commit -m "feat: save room as file and open file as new room"
```

---

### Task 7: Link teilen + QR

**Files:**
- Modify: `raumaufmass.html` (HTML: Buttons + QR-Dialog; CSS; `ui`-Block: Handler)

**Interfaces:**
- Consumes: `encodeShare` (Task 3), `STORE`, `currentRoom`, `setHint`.
- Produces: nichts für spätere Tasks (letzter Feature-Task).

- [ ] **Step 1: HTML**

In der Daten-Sektion die erste `btnrow` (aus Task 6) ersetzen durch

```html
      <div class="btnrow">
        <button id="filesave">Als Datei sichern</button>
        <button id="fileopen">Datei öffnen</button>
        <button id="sharelink">Link teilen</button>
        <button id="shareqr">QR</button>
      </div>
```

Direkt vor `<div id="pop" hidden>` (im `#canvaswrap`) einfügen:

```html
      <div id="qrwrap" hidden>
        <div id="qrbox">
          <div id="qrhead"><h2>Raum als QR-Code</h2><button id="qrclose" aria-label="Schließen">✕</button></div>
          <canvas id="qrcv" width="300" height="300"></canvas>
          <div id="qrnote">Mit der Handy-Kamera scannen — der Raum öffnet sich als Kopie.</div>
        </div>
      </div>
```

- [ ] **Step 2: CSS**

Nach den `#libbox`-Regeln einfügen:

```css
  #qrwrap{position:fixed;inset:0;z-index:9;background:rgba(38,36,31,.35);
    display:flex;align-items:center;justify-content:center}
  #qrwrap[hidden]{display:none}
  #qrbox{background:var(--surface);border:1px solid var(--line);border-radius:10px;
    padding:14px;text-align:center;max-width:340px}
  #qrhead{display:flex;align-items:center}
  #qrhead h2{font-size:15px;margin:0;flex:1;text-align:left}
  #qrcv{margin:10px auto;display:block;image-rendering:pixelated}
  #qrnote{font-size:12px;color:var(--muted)}
```

- [ ] **Step 3: Handler**

Im `ui`-Block nach dem Datei-Abschnitt (Task 6) einfügen:

```js
// ================= Link teilen + QR =================
function shareUrl(){
  if(!currentRoom) return null;
  const r=STORE.load(currentRoom);
  if(!r) return null;
  return location.origin+location.pathname+'#raum='+encodeShare({name:r.name, data:r.data});
}
$('sharelink').onclick=async()=>{
  const url=shareUrl();
  if(!url) return;
  if(navigator.share){
    try{ await navigator.share({url, title:'Raumaufmaß'}); return; }
    catch(e){ if(e && e.name==='AbortError') return; }
  }
  try{ await navigator.clipboard.writeText(url); setHint('Link in der Zwischenablage.'); }
  catch(e){ prompt('Link kopieren mit Strg+C:', url); }
};
$('shareqr').onclick=()=>{
  const url=shareUrl();
  if(!url) return;
  // QR-Kapazitaet (Version 40, Level M, Binary) liegt bei ~2,3 KB - ein
  // normaler Raum (1-3 KB JSON) ist komprimiert weit darunter. Wird es doch
  // zu viel, sagt der Dialog das, statt einen unlesbaren Code zu malen.
  try{
    const q=qrcode(0,'M');
    q.addData(url);
    q.make();
    const n=q.getModuleCount(), cvq=$('qrcv');
    const s=Math.max(2, Math.floor(300/n)), pad=8;
    cvq.width=cvq.height=n*s+2*pad;
    const c=cvq.getContext('2d');
    c.fillStyle='#fff'; c.fillRect(0,0,cvq.width,cvq.height);
    c.fillStyle='#000';
    for(let r2=0;r2<n;r2++) for(let col=0;col<n;col++)
      if(q.isDark(r2,col)) c.fillRect(pad+col*s, pad+r2*s, s, s);
    $('qrwrap').hidden=false;
  }catch(e){
    alert('Dieser Raum ist zu groß für einen QR-Code — Link oder Datei nutzen.');
  }
};
$('qrclose').onclick=()=>{ $('qrwrap').hidden=true; };
$('qrwrap').addEventListener('pointerdown',e=>{ if(e.target===$('qrwrap')) $('qrwrap').hidden=true; });
```

Und im globalen Escape-Zweig (nach der `libwrap`-Zeile aus Task 5):

```js
    if(!$('qrwrap').hidden){ $('qrwrap').hidden=true; return; }
```

- [ ] **Step 4: Browser-Verifikation**

1. „Link teilen" am Desktop → Hint „Link in der Zwischenablage." (kein `navigator.share` im Desktop-Chrome-Pane → Clipboard-Pfad). Per JS: `(await navigator.clipboard.readText()).startsWith(location.origin+location.pathname+'#raum=')` → true.
2. Kopierten Link in die Adresszeile → App lädt, Hint „Geteilter Raum importiert…", Bibliothek +1 („Wohnzimmer" doppelt = korrekt: Kopie), Adresszeile ohne `#raum=` (replaceState).
3. `location.hash='#raum=%%%müll'` + Reload → Hint „Geteilter Link ungültig…", Bibliothek unverändert.
4. „QR" → Dialog mit gezeichnetem Code (dunkle Module sichtbar), ✕ und Backdrop schließen.
5. Mobile-Viewport: beide Dialoge bedienbar, Buttons ≥ 40 px.
6. `node test/run.mjs | tail -1` → `ALLE CHECKS GRÜN`.

- [ ] **Step 5: Commit**

```bash
git add raumaufmass.html
git commit -m "feat: share room as url fragment link with qr dialog"
```

---

### Task 8: Gesamtdurchlauf und Feinschliff

**Files:**
- Modify: `raumaufmass.html` (nur falls Durchlauf Fehler zeigt)

- [ ] **Step 1: Kompletter Nutzerpfad, Mobile 375×812**

Reihenfolge im Browser-Pane: Neuer Raum → 4 Ecken + Ring schließen → 2 Maße über Chips (guided) → Bibliothek öffnen/wechseln/zurück → „Als Datei sichern" → „Link teilen" → Link öffnen (Import als Kopie) → Raum löschen. Jede Stufe: keine Console-Errors (`read_console_messages onlyErrors`), Layout einzeilig, Overlays bedienbar.

- [ ] **Step 2: Desktop-Durchlauf 1280×800**

Gleiche Sequenz verkürzt: Bibliothek, Datei-Roundtrip, QR-Dialog, Escape schließt Overlays in der Reihenfolge QR → Bibliothek → Eingabe.

- [ ] **Step 3: Checks + Abschluss-Commit**

```bash
node test/run.mjs | tail -1
git status --short
git add -A && git commit -m "fix: polish from full persistence walkthrough" || echo "nichts zu committen"
```

Expected: `ALLE CHECKS GRÜN`; Commit nur, falls Schritt 1/2 Korrekturen erzwangen.

---

## Self-Review (erledigt)

- **Spec-Abdeckung:** Datenmodell+Migration→Task 2/4, Bibliothek-UI→5, Datei→6, Link/QR→7, Vendor inline→1, Quota/Private-Mode→2/4, Fehlerfälle (Müll-Fragment, kaputte Datei, AbortError)→3/6/7, Tests→1–3 (Node) + 4–8 (Browser). Backup-Hinweis→5 (`#libnote`). Stabile-Domain-Warnung ist Betriebs-, kein Code-Thema — steht in der Spec.
- **Platzhalter:** keine (alle Codeblöcke vollständig; Vendor-Inhalt kommt deterministisch per curl+Python).
- **Typkonsistenz:** `STORE_FACTORY/STORE`, `encodeShare/decodeShare/parseShareFragment`, `openRoom/newRoom/importAsNewRoom/exportRoomAsFile`, `currentRoom` — Namen in Tasks 4–7 gegen die Interfaces-Blöcke geprüft; `fmt2`, `setHint`, `importProblem`, `serialize/deserialize` existieren im Bestand.
