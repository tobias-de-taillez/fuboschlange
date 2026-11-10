// Browser-Test der Werkzeugfamilie: bedient Startbildschirm und Raumaufmaß wie
// ein Mensch (echte Klicks und Tasten) und prüft, was die Node-Tests nicht
// sehen: die Bedienung. Die 1018 Selbstchecks decken die Rechenkerne; dieser
// Lauf deckt den Weg Skizze, Maße, Wände, Ausgabe, zwei Fenster, eine
// unvollständig geladene Seite, den Fliesenplan und den Küchenplaner (je eine eigene Seite) und den Wechsel
// zwischen den Seiten (Ablauf seiten), und (Ablauf „stabil“) dass das gespeicherte Aufmaß beim Öffnen und
// Arbeiten nicht wandert.
//
//   node test/browser.mjs                 alle Abläufe in Chromium
//   node test/browser.mjs webkit          in WebKit (firefox ebenso)
//   node test/browser.mjs chromium fenster  nur ein Ablauf
//
// Braucht Playwright (devDependency in package.json):
//   npm install                   einmalig, danach  npx playwright install chromium webkit firefox
// Sonst findet der Test es im Suchpfad von Node oder in dem Ordner, den die Variable PLAYWRIGHT nennt, z. B.
//   PLAYWRIGHT=~/.npm/_npx/<hash>/node_modules node test/browser.mjs
// Fehlt es, endet der Lauf mit 2 und sagt das. Der Test liefert die Seiten
// selbst aus (eigener Port, leerer Speicher) und fasst keine andere Adresse an.
import http from 'node:http';
import {readFile, readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const WURZEL=fileURLToPath(new URL('..', import.meta.url));
const ENGINES=['chromium','webkit','firefox'];
const args=process.argv.slice(2);
const ENGINE=ENGINES.includes(args[0]) ? args.shift() : 'chromium';

async function ladePlaywright(){
  try{ return (await import('playwright')).default; }catch(e){}
  const ort=process.env.PLAYWRIGHT;
  if(ort){ try{ return createRequire(path.resolve(ort.replace(/^~/, process.env.HOME||''))+'/')('playwright'); }catch(e){} }
  console.error('Playwright nicht gefunden. Siehe Kopf von test/browser.mjs (Variable PLAYWRIGHT).');
  process.exit(2);
}

// ---------- Auslieferung: der Ordner des Repos, „/“ ist der Startbildschirm ----------
const TYP={'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8'};
function server(){
  const s=http.createServer(async (req, res)=>{
    const p=decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const datei=path.join(WURZEL, p==='/' ? 'raeume.html' : p);
    if(!datei.startsWith(WURZEL) || !TYP[path.extname(datei)]){ res.writeHead(404).end(); return; }
    try{ const b=await readFile(datei); res.writeHead(200, {'content-type':TYP[path.extname(datei)], 'cache-control':'no-cache'}).end(b); }
    catch(e){ res.writeHead(404).end(); }
  });
  return new Promise(ok=>s.listen(0, '127.0.0.1', ()=>ok(s)));
}

// ---------- Hilfen ----------
const sleep=ms=>new Promise(r=>setTimeout(r, ms));
// Wahre Lage der Ecken des L-Raums in Metern; die Skizze ist absichtlich schief.
const WAHR={A:[0,0], B:[4,0], C:[4,1.5], D:[2,1.5], E:[2,3], F:[0,3]};
const strecke=(a,b)=>Math.hypot(WAHR[a][0]-WAHR[b][0], WAHR[a][1]-WAHR[b][1]);
const de=x=>x.toFixed(3).replace('.', ',');
let BASE='', PW=null, rot=0, gruen=0;
const pruef=(name, ok, info='')=>{ ok ? gruen++ : rot++; console.log((ok ? 'ok   ' : 'ROT  ')+name+(info!=='' ? '  ('+info+')' : '')); };

async function fenster(opt={}){
  const browser=await PW[ENGINE].launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440, height:900}, locale:'de-DE', acceptDownloads:true, ...opt});
  const stoer=[];
  const horche=page=>{
    page.on('pageerror', e=>stoer.push('pageerror: '+e.message));
    page.on('dialog', async d=>{ stoer.push('nativer Dialog: '+d.message()); await d.dismiss().catch(()=>{}); });
    page.on('console', m=>{ if(m.type()==='error' && !/interactive-widget|favicon|Failed to load resource/.test(m.text())) stoer.push('console.error: '+m.text()); });
  };
  const page=await context.newPage(); horche(page);
  return {browser, context, page, stoer, horche};
}
const lage=(page, a, b, t=.5)=>page.evaluate(([a,b,t])=>{
  const P=viewPts(), A=P.find(q=>q.id===a), B=b ? P.find(q=>q.id===b) : A;
  const s=toScr({x:A.x+(B.x-A.x)*t, y:A.y+(B.y-A.y)*t}), r=cv.getBoundingClientRect(), d=DPR();
  return {x:r.left+s.x/d, y:r.top+s.y/d};
}, [a,b,t]);
const stand=page=>page.evaluate(()=>document.getElementById('statustxt').textContent);
const meldung=page=>page.evaluate(()=>{ const t=document.getElementById('toast'); return t.classList.contains('on') ? t.textContent : ''; });
async function skizziereL(page){
  const r=await page.evaluate(()=>{ const b=cv.getBoundingClientRect(); return {x:b.left+b.width/2, y:b.top+b.height/2}; });
  const P=[[-160,120],[160,125],[165,-5],[5,0],[-2,-118],[-158,-120]].map(([x,y])=>[r.x+x, r.y+y]);
  for(const p of [...P, P[0]]){ await page.mouse.move(p[0], p[1]); await sleep(40); await page.mouse.click(p[0], p[1]); await sleep(120); }
  await sleep(400);
}
async function messeGefuehrt(page){
  for(let i=0;i<20;i++){
    const text=await page.evaluate(()=>document.getElementById('entry').hidden ? null : document.getElementById('entryLabel').textContent);
    const m=text && /([A-Z]+)\s*[–-]\s*([A-Z]+)/.exec(text);
    if(!m) break;
    await page.keyboard.type(de(strecke(m[1], m[2]))); await page.keyboard.press('Enter'); await sleep(220);
  }
}
async function gemessenerRaum(f){
  await f.page.goto(BASE+'/'); await sleep(900);
  await skizziereL(f.page); await messeGefuehrt(f.page);
}

// Fliesenplan: je verlegter Fliese die Mitte im Raum (mm) und im Fenster (CSS-Pixel), Drehung, ob gewählt,
// und wand: die Abstände ihrer Ecken zur nächsten Wand (mm), aufsteigend.
const fliesenLage=page=>page.evaluate(()=>{
  const T=M.tiles||{items:[]}, K=tilesCtx(), r=cv.getBoundingClientRect(), d=DPR(), R=K.ring;
  const zurWand=q=>Math.min(...R.map((a,i)=>{ const b=R[(i+1)%R.length], vx=b.x-a.x, vy=b.y-a.y, t=Math.max(0, Math.min(1, ((q.x-a.x)*vx+(q.y-a.y)*vy)/(vx*vx+vy*vy||1))); return Math.hypot(q.x-a.x-t*vx, q.y-a.y-t*vy); }));
  return T.items.map(it=>{
    const P=TILES.tileCorners(T.spec, it), c={x:P.reduce((a,q)=>a+q.x, 0)/P.length, y:P.reduce((a,q)=>a+q.y, 0)/P.length}, s=toScr(TILES.toWorldF(K.F, c));
    return {id:it.id, kind:it.kind, rot:it.rot, mx:c.x, my:c.y, x:r.left+s.x/d, y:r.top+s.y/d, gewaehlt:TS.sel.has(it.id), wand:P.map(zurWand).sort((a,b)=>a-b)};
  });
});
// Mit gedrückter Maustaste von a nach b, in Schritten wie eine Hand.
async function ziehe(page, a, b, n=10){
  await page.mouse.move(a.x, a.y); await sleep(40); await page.mouse.down();
  for(let i=1;i<=n;i++){ await page.mouse.move(a.x+(b.x-a.x)*i/n, a.y+(b.y-a.y)*i/n); await sleep(15); }
  await page.mouse.up(); await sleep(300);
}

// ---------- Hilfen für den Küchenplaner ----------
// Küchenteile, wie sie im Raum stehen, dazu das gewählte Teil und die Zahl der Rückgängig-Schritte.
const kueche=page=>page.evaluate(()=>({sel:kitchenUiState().sel, undo:undoStack.length,
  teile:((M.kitchen && M.kitchen.items)||[]).map(i=>({id:i.id, kind:i.kind, dev:i.dev||'', wand:i.a ? i.a+i.b : '', x:Math.round(i.x), y:Math.round(i.y||0), w:i.w, rot:i.rot||0}))}));
const teilNr=async (page, id)=>(await kueche(page)).teile.find(t=>t.id===id);
// Mitte eines Teils auf dem Bildschirm; für Wandteile die Richtung der Wand im Bild (u) und
// die Pfeiltaste, die das Teil in dieser Richtung schiebt (plus) bzw. zurück (minus).
const teilLage=(page, id)=>page.evaluate(id=>{
  const K=M.kitchen, it=K.items.find(i=>i.id===id); if(!it) return null;
  const E=KITCHEN.makeEnv(M.fit.pts, M.walls, M.openings, M.hmeas, M.water, K.frame), g=KITCHEN.geom(E, K, it); if(!g) return null;
  const r=cv.getBoundingClientRect(), d=DPR(), s=toScr(g.c), o={x:r.left+s.x/d, y:r.top+s.y/d};
  if(it.a){ const W=KITCHEN.wallFrame(E, it.a, it.b), a=toScr(W.A), b=toScr(W.B), l=Math.hypot(b.x-a.x, b.y-a.y), u={x:(b.x-a.x)/l, y:(b.y-a.y)/l}, quer=Math.abs(u.x)>=Math.abs(u.y);
    Object.assign(o, {u, plus:quer ? (u.x>0 ? 'ArrowRight' : 'ArrowLeft') : (u.y>0 ? 'ArrowDown' : 'ArrowUp'), minus:quer ? (u.x>0 ? 'ArrowLeft' : 'ArrowRight') : (u.y>0 ? 'ArrowUp' : 'ArrowDown')}); }
  return o;
}, id);
async function waehleTeil(page, id){ const q=await teilLage(page, id); await page.mouse.move(q.x, q.y); await sleep(60); await page.mouse.click(q.x, q.y); await sleep(300); return q; }
async function ausLeiste(page, name){ await page.click(`#kPalette button[title="${name}"]`); await sleep(350); const k=await kueche(page); return k.teile[k.teile.length-1]; }
// Welcher Anteil eines Elements auf dem Bildschirm nicht die häufigste Farbe (den Grund) zeigt
// (Bildschirmfoto, grob gerastert): eine leere Fläche hat 0.
async function bemalt(page, sel){
  const png=(await page.locator(sel).screenshot()).toString('base64');
  return page.evaluate(async b=>{ const im=new Image(); im.src='data:image/png;base64,'+b; await im.decode();
    const c=document.createElement('canvas'); c.width=im.width; c.height=im.height; const x=c.getContext('2d'); x.drawImage(im, 0, 0);
    const d=x.getImageData(0, 0, c.width, c.height).data, N=new Map(); let n=0;
    for(let i=0;i<d.length;i+=28){ const f=(d[i]>>3)<<10 | (d[i+1]>>3)<<5 | d[i+2]>>3; N.set(f, (N.get(f)||0)+1); n++; }
    return n ? 1-Math.max(...N.values())/n : 0; }, png);
}
// Bildschirmfoto eines kleinen Flecks um einen Punkt, und der Anteil der Bildpunkte, in denen
// sich zwei gleich große Fotos deutlich unterscheiden (eine Auswahl-Tönung allein zählt nicht).
const fleck=(page, q, r=8)=>page.screenshot({clip:{x:Math.round(q.x)-r, y:Math.round(q.y)-r, width:2*r, height:2*r}});
async function unterschied(page, a, b){
  return page.evaluate(async B=>{
    const lies=async s=>{ const im=new Image(); im.src='data:image/png;base64,'+s; await im.decode();
      const c=document.createElement('canvas'); c.width=im.width; c.height=im.height; const x=c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
    const P=await lies(B[0]), Q=await lies(B[1]); if(P.length!==Q.length) return -1; let d=0;
    for(let i=0;i<P.length;i+=4) if(Math.abs(P[i]-Q[i])+Math.abs(P[i+1]-Q[i+1])+Math.abs(P[i+2]-Q[i+2])>60) d++;
    return P.length ? d/(P.length/4) : 0; }, [a.toString('base64'), b.toString('base64')]);
}

// ---------- Abläufe ----------
const ABLAEUFE={
  // Leerer Start bis zur Ausgabe, wie der Hauptweg im Papier.
  async hauptweg(){
    const f=await fenster(); const p=f.page;
    // Statt des Druckdialogs: zählen, und wie der Browser danach „afterprint“ melden.
    await p.addInitScript(()=>{ window.print=()=>{ try{ top.__druck=(top.__druck||0)+1; }catch(e){} setTimeout(()=>window.dispatchEvent(new Event('afterprint')), 0); }; });
    await p.goto(BASE+'/'); await sleep(900);
    pruef('leerer Start führt ins Werkzeug', /raumaufmass\.html/.test(p.url()) && await p.evaluate(()=>M.mode==='draw'));
    await skizziereL(p);
    pruef('sechs Ecken, Raum geschlossen, geführte Eingabe offen', await p.evaluate(()=>M.pts.length===6 && M.walls.length===6 && M.mode==='measure' && !document.getElementById('entry').hidden));
    await messeGefuehrt(p);
    pruef('geführt gemessen bis „Geprüft“', /^Geprüft ± /.test(await stand(p)), await stand(p));
    // Karte der Strecke per Tastatur, Wanddicke mit Einheit
    await p.evaluate(()=>{ document.getElementById('wlbox').open=true; });
    await p.focus('#wl .wrow'); await p.keyboard.press('Enter'); await sleep(250);
    pruef('Zeile + Enter öffnet die Karte der Strecke', await p.evaluate(()=>!document.getElementById('wpop').hidden));
    const dicke=p.locator('#wpopThick .thk'); await dicke.fill('24 cm'); await dicke.press('Tab'); await sleep(200);
    pruef('Wanddicke „24 cm“ sind 240 mm', await p.evaluate(()=>Object.values(M.thick)[0]===240));
    await p.keyboard.press('Escape'); await sleep(150);
    pruef('nach Esc steht der Fokus wieder auf der Zeile', await p.evaluate(()=>document.activeElement.classList.contains('wrow')));
    await p.keyboard.press('Escape');
    // Wände und Ausgabe
    await p.keyboard.press('3'); await sleep(400);
    await p.click('#wAdd [data-add=door]'); await sleep(250); await p.click('#wAdd [data-add=window]'); await sleep(250);
    pruef('Schritt Wände, Tür und Fenster gesetzt', await p.evaluate(()=>M.mode==='wall' && M.openings.length===2));
    await p.click('#goNext'); await sleep(500);
    pruef('Ausgabe aus dem Schritt Wände ist vollständig', await p.evaluate(()=>OUT.on && ['outPrint','outTiles','outKitchen','dxfsave','stepsave'].every(id=>document.getElementById(id).getBoundingClientRect().width>0)));
    pruef('Blattvorschau zeigt Grundriss und Wandansichten', await p.evaluate(()=>document.querySelectorAll('#sheets .bl-stapel > *').length>=2));
    await p.click('#outPrint'); await sleep(900);
    pruef('Drucken löst genau einen Druckauftrag aus', await p.evaluate(()=>top.__druck===1));
    await p.keyboard.press('Escape'); await sleep(200);
    pruef('nach dem Drucken gehören die Tasten wieder der Seite (Esc schließt die Ausgabe)', await p.evaluate(()=>!OUT.on));
    // Karte einer Öffnung bleibt nicht über dem Blatt
    await p.keyboard.press('2'); await sleep(300);
    const o=await p.evaluate(()=>{ const o=M.openings[0], P=viewPts(), A=P.find(q=>q.id===o.a), B=P.find(q=>q.id===o.b); return {a:o.a, b:o.b, t:(o.x+o.w/2)/Math.hypot(A.x-B.x, A.y-B.y)}; });
    const m=await lage(p, o.a, o.b, o.t); await p.mouse.move(m.x, m.y); await sleep(80); await p.mouse.click(m.x, m.y); await sleep(300);
    const karteOffen=await p.evaluate(()=>!document.getElementById('oppl').hidden);
    await p.keyboard.press('4'); await sleep(400);
    pruef('Klick auf eine Öffnung im Plan öffnet ihre Karte', karteOffen, JSON.stringify(await p.evaluate(()=>({sel:M.openSel, mode:M.mode, wpop:!document.getElementById('wpop').hidden, entry:!document.getElementById('entry').hidden}))));
    pruef('in der Ausgabe liegt keine Karte über dem Blatt', await p.evaluate(()=>OUT.on && document.getElementById('oppl').hidden));
    await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
    // Folgewerkzeuge
    await p.evaluate(()=>setTool('fliesen')); await sleep(1200);
    pruef('Fliesenplan öffnet', await p.evaluate(()=>TOOL==='fliesen' && document.title.includes('Fliesenplan')));
    await p.evaluate(()=>setTool('kueche')); await sleep(1400);
    await p.setViewportSize({width:1100, height:800}); await sleep(300);
    pruef('Küchenplaner öffnet, Leiste passt bei 1100 px', await p.evaluate(()=>{ const t=document.getElementById('tools'); return TOOL==='kueche' && t.scrollWidth<=t.clientWidth; }), await p.evaluate(()=>{ const t=document.getElementById('tools'); return `scrollWidth ${t.scrollWidth}, clientWidth ${t.clientWidth}`; }));
    await p.setViewportSize({width:1440, height:900});
    await p.evaluate(()=>setTool('aufmass')); await sleep(1200);
    await p.click('#backHome'); await sleep(900);
    pruef('Startbildschirm zeigt den Raum mit Stand und Fläche', /Geprüft ± [\d,]+ mm · 9,00 m²/.test(await p.evaluate(()=>document.body.innerText)));
    pruef('keine Fehler in der Konsole', f.stoer.length===0, f.stoer.join(' | '));
    await f.browser.close();
  },
  // Was die Eingabe annimmt, und dass Rückgängig in der Führung bleibt.
  async eingabe(){
    const f=await fenster(); const p=f.page;
    await p.goto(BASE+'/'); await sleep(900); await skizziereL(p);
    const tippe=async t=>{ await p.keyboard.type(t); await p.keyboard.press('Enter'); await sleep(250); };
    await tippe('3m50');
    pruef('„3m50“ wird abgewiesen', await p.evaluate(()=>M.meas.length===0 && document.getElementById('entryVal').classList.contains('bad')));
    await p.evaluate(()=>{ const e=document.getElementById('entryVal'); e.value=''; e.classList.remove('bad'); });
    await tippe('4000 mm');
    pruef('„4000 mm“ gilt als 4,000 m', await p.evaluate(()=>M.meas.length===1 && M.meas[0].d===4000));
    await tippe('1500');
    pruef('„1500“ in Metern gilt und nennt den Verdacht', await p.evaluate(()=>M.meas.length===2) && /sehr lang/.test(await meldung(p)), await meldung(p));
    await p.keyboard.press(process.platform==='darwin' ? 'Meta+z' : 'Control+z'); await sleep(350);
    pruef('Rückgängig im leeren Feld nimmt das Maß zurück und führt weiter', await p.evaluate(()=>M.meas.length===1 && !document.getElementById('entry').hidden && document.activeElement.id==='entryVal'));
    await f.browser.close();
  },
  // Spiegeln und Rückgängig lassen den Raum im Bild; eine gekürzte Wand nimmt eine geschätzte Öffnung mit.
  async ansicht(){
    const f=await fenster(); const p=f.page; await gemessenerRaum(f); await p.keyboard.press('Escape');
    const imBild=()=>p.evaluate(()=>{ const r=cv.getBoundingClientRect(), d=DPR(); return viewPts().every(q=>{ const s=toScr(q); return s.x/d>=0 && s.x/d<=r.width && s.y/d>=0 && s.y/d<=r.height; }); });
    await p.click('#roommenuBtn'); await sleep(150); await p.click('#mirror'); await sleep(400);
    await p.click('#undo'); await sleep(400);
    pruef('nach Spiegeln und Rückgängig liegt der Raum im Bild', await imBild());
    await p.click('#redo'); await sleep(400);
    pruef('nach Wiederherstellen ebenso', await imBild());
    await p.click('#undo'); await sleep(300);
    await p.keyboard.press('3'); await sleep(400); await p.click('#wAdd [data-add=window]'); await sleep(300);
    const r=await p.evaluate(()=>{
      // Fenster ans Ende der Wand legen, dann die Wand um 80 cm kürzen.
      const o=M.openings[0], lang=()=>{ const P=M.fit.pts, I=C.idx(P); return Math.hypot(P[I[o.a]].x-P[I[o.b]].x, P[I[o.a]].y-P[I[o.b]].y); };
      const vorher=lang(); snapshot(); o.x=vorher-o.w;
      M.meas.filter(m=>[m.a,m.b].sort().join()===[o.a,o.b].sort().join()).forEach(m=>{ m.d=vorher-800; }); recompute();
      return {dof:M.an.dof, kuerzer:lang()<vorher-500, drin:o.x>=-1e-6 && o.x+o.w<=lang()+1e-6};
    });
    pruef('geschätzte Öffnung rückt in die gekürzte Wand', r.dof===0 && r.kuerzer && r.drin);
    pruef('keine Fehler in der Konsole', f.stoer.length===0, f.stoer.join(' | '));
    await f.browser.close();
  },
  async tuerverbindung(){
    const f=await fenster(), p=f.page;
    const fixture=JSON.parse(await readFile(path.join(WURZEL,'test/fixtures/raum-voll.json'),'utf8'));
    await p.goto(BASE+'/raumaufmass.html'); await sleep(800);
    const ids=await p.evaluate(data=>{
      const a=STORE.create('Küche'), b=STORE.create('Flur'), c=STORE.create('Dach');
      for(const id of [a,b,c]) STORE.save(id,{data:structuredClone(data)});
      HAUS.gliederung(STORE.allRooms()); const h=HAUS.neuesGebaeude(a,'Haus');
      HAUS.ordneZu(b,h.geschoss); HAUS.neuesGeschoss(h.gebaeude,c,'Obergeschoss');
      openRoom(a); setMode('wall'); M.wallSel={a:'F',b:'A'}; M.openSel='o1'; render();
      return {a,b,c};
    },fixture.data);
    const choices=await p.locator('#opConnection select option').allTextContents();
    pruef('Tür-Auswahl bietet nur eine freie Tür im selben Geschoss', choices.length===1 && /Flur/.test(choices[0]) && !choices.some(s=>/Dach/.test(s)),choices.join(' | '));
    await p.getByRole('button',{name:'Türen verbinden'}).click(); await sleep(300);
    let state=await p.evaluate(({a,b})=>({a:STORE.load(a).data.shared['A|F'], b:STORE.load(b).data.shared['A|F'], neighbors:neighbors.map(n=>n.id)}),ids);
    pruef('Verbinden schreibt beide Türseiten und stellt den Nachbarraum dar', state.a?.room===ids.b && state.b?.room===ids.a && state.a?.tuer.op==='o1' && state.b?.tuer.op==='o1' && state.neighbors.includes(ids.b),JSON.stringify(state));
    await p.click('#opDel'); await sleep(150);
    pruef('Eine verbundene Tür kann nicht versehentlich einseitig gelöscht werden',
      await p.evaluate(()=>M.openings.some(o=>o.id==='o1') && /zuerst die Türverbindung lösen/.test(document.getElementById('hint').textContent)));
    await p.reload(); await sleep(800);
    await p.evaluate(()=>{ setMode('wall'); M.wallSel={a:'F',b:'A'}; M.openSel='o1'; render(); });
    pruef('Verbindung bleibt beim Neuladen sichtbar',await p.locator('#opConnection').innerText().then(s=>s.includes('Flur')));
    await p.getByRole('button',{name:'Verbindung lösen'}).click(); await sleep(300);
    state=await p.evaluate(({a,b})=>({a:STORE.load(a).data.shared['A|F'], b:STORE.load(b).data.shared['A|F'], doors:[STORE.load(a).data.openings.length,STORE.load(b).data.openings.length]}),ids);
    pruef('Lösen entfernt beide Verweise und behält beide Türen',!state.a && !state.b && state.doors[0]===1 && state.doors[1]===1,JSON.stringify(state));
    pruef('keine Fehler in der Konsole', f.stoer.length===0, f.stoer.join(' | '));
    await f.browser.close();
  },
  // Zwei Fenster: das im Hintergrund lädt neu, schreibt nichts, bleibt bei seinem Raum.
  async fenster(){
    const f=await fenster(); const A=f.page; await gemessenerRaum(f); await A.keyboard.press('Escape');
    const idA=await A.evaluate(()=>currentRoom);
    // Playwright meldet jeder Seite Fokus; ein Fenster im Hintergrund meldet keinen.
    const hinten=()=>A.evaluate(()=>{ document.hasFocus=()=>false; });
    await hinten();
    const B=await f.context.newPage(); f.horche(B); await B.goto(BASE+'/raumaufmass.html'); await sleep(1000);
    pruef('zweites Fenster öffnet denselben Raum', await B.evaluate(()=>currentRoom)===idA);
    await B.click('#backHome'); await sleep(800); await B.click('#neuBtn'); await sleep(1200);
    const idB=await B.evaluate(()=>currentRoom);
    pruef('„Neuer Raum“ im bedienten Fenster öffnet einen neuen, leeren Raum', idB!==idA && await B.evaluate(()=>M.pts.length===0));
    await skizziereL(B); await B.reload(); await sleep(1000);
    pruef('Neuladen bleibt beim Raum des Fensters', await B.evaluate(()=>currentRoom)===idB && await B.evaluate(()=>M.pts.length===6));
    pruef('das Hintergrundfenster blieb bei seinem Raum', await A.evaluate(()=>currentRoom)===idA && await A.evaluate(()=>M.meas.length>=10));
    await B.click('#backHome'); await sleep(800);
    await B.locator('.room', {hasText:'Geprüft'}).locator('.auf').click(); await sleep(1200);
    await B.keyboard.press('Escape'); await B.keyboard.press('3'); await sleep(400); await B.click('#wAdd [data-add=window]'); await sleep(700);
    pruef('eine Änderung im einen Fenster kommt im anderen an', await A.evaluate(()=>M.openings.length===1));
    const bild=()=>B.evaluate(()=>localStorage.getItem('raumaufmass.rooms')); const vor=await bild(); await sleep(900);
    pruef('danach bleibt der Speicher ruhig', vor===await bild());
    pruef('„zuletzt geöffnet“ gehört dem bedienten Fenster', await B.evaluate(()=>STORE.currentId()===currentRoom));
    pruef('keine Fehler in der Konsole', f.stoer.length===0, f.stoer.join(' | '));
    await f.browser.close();
  },
  // Kommt eine Kerndatei nicht an, startet das Werkzeug nicht und lässt den Speicher in Ruhe.
  async unvollstaendig(){
    const raum=[{id:'r1', name:'Bestand', updated:'2026-11-10T00:00:00.000Z', area:12, data:{idSeq:4,
      pts:[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}], walls:[['A','B'],['B','C'],['C','D'],['D','A']],
      meas:[['A','B',4000],['B','C',3000],['C','D',4000],['D','A',3000],['A','C',5000],['B','D',5000]].map(([a,b,d])=>({a,b,d,on:true}))}}];
    const kerne=['raum-kern.js','raum-fliesen.js','raum-kueche.js','raum-geometrie.js','raum-speicher.js','raum-modell.js','raum-zeichnung.js','raum-plan.js'];
    for(const datei of [...kerne, 'fliesenplan-einmessen.js', 'raum-checks.js', 'raum-blatt.js']){
      const f=await fenster(); const p=f.page;
      await f.context.addInitScript(r=>{ if(!localStorage.getItem('raumaufmass.rooms')){ localStorage.setItem('raumaufmass.rooms', JSON.stringify(r)); localStorage.setItem('raumaufmass.current', 'r1'); } }, raum);
      await f.context.route('**/'+datei, r=>r.fulfill({status:404, body:''}));
      await p.goto(BASE+'/raumaufmass.html'); await sleep(900);
      const z=await p.evaluate(()=>({karte:(document.getElementById('unvollstaendig')||{}).innerText||'', raeume:localStorage.getItem('raumaufmass.rooms'), current:localStorage.getItem('raumaufmass.current')}));
      const unberuehrt=JSON.parse(z.raeume).length===1 && z.current==='r1';
      if(kerne.includes(datei)) pruef(`ohne ${datei}: Karte nennt die Datei, Speicher unberührt`, z.karte.includes('unvollständig geladen') && z.karte.includes(datei) && unberuehrt);
      else pruef(`ohne ${datei}: das Werkzeug startet trotzdem`, z.karte==='' && unberuehrt && /^Geprüft/.test(await stand(p)));
      await f.browser.close();
    }
  },
  // Die Selbstchecks laufen auch im Browser grün.
  async selbstchecks(){
    const f=await fenster(); const p=f.page;
    await p.goto(BASE+'/raumaufmass.html?test'); await sleep(1500);
    const r=await p.evaluate(()=>{ const r=selfChecks(); return {n:r.out.length, ok:r.ok, rot:r.out.filter(z=>z.startsWith('FAIL')).slice(0,3)}; });
    pruef(`Selbstchecks im Browser (${r.n})`, r.ok && r.n>1000, r.rot.join(' | '));
    pruef('geladen sind 14 Skripte (mit den Selbstchecks), keine Karte', await p.evaluate(()=>document.querySelectorAll('script[src]').length===14 && !globalThis.RAUM_UNVOLLSTAENDIG));
    await f.browser.close();
  },
  // Fliesenplan: setzen, schieben, drehen, vervielfältigen, einmessen, Stückliste; die Fliesen überstehen Menü, Neuladen und Startbildschirm.
  async fliesenplan(){
    const f=await fenster(); const p=f.page; await gemessenerRaum(f); await p.keyboard.press('Escape');
    const MOD=process.platform==='darwin' ? 'Meta' : 'Control';
    const zahl=t=>parseFloat(String(t).replace(',', '.'));
    const weit=(a,b)=>Math.hypot(a.x-b.x, a.y-b.y), weitMm=(a,b)=>Math.hypot(a.mx-b.mx, a.my-b.my);
    const eine=async id=>(await fliesenLage(p)).find(t=>t.id===id);
    const txt=id=>p.evaluate(id=>document.getElementById(id).textContent, id);
    // Aus der Ausgabe in den Fliesenplan
    await p.keyboard.press('4'); await sleep(400);
    pruef('Ausgabe (Taste 4) nennt den Fliesenplan „noch nicht begonnen“', await p.evaluate(()=>OUT.on && !document.getElementById('outTiles').disabled) && await txt('outTilesNote')==='noch nicht begonnen', await txt('outTilesNote'));
    await p.click('#outTiles'); await sleep(1500);
    pruef('der Fliesenplan beginnt beim Fliesenset: es steht offen, „Weiter: Fliesen legen“ ist die Hauptaktion, die Leiste ist noch leer', await p.evaluate(()=>document.getElementById('tSpecBox').open && getComputedStyle(document.getElementById('tNext')).display!=='none' && document.getElementById('tNext').classList.contains('primary') && [...document.querySelectorAll('#tPalette button')].every(b=>b.getBoundingClientRect().width===0) && document.getElementById('tResBox').getBoundingClientRect().height===0));
    await p.click('#tNext'); await sleep(500);
    const leiste=await p.evaluate(()=>[...document.querySelectorAll('#tPalette button')].filter(b=>b.getBoundingClientRect().width>0).map(b=>b.getAttribute('aria-label')));
    pruef('„Öffnen“ führt in den Fliesenplan, die Leiste bietet Chevron L, R und das Paar', await p.evaluate(()=>TOOL==='fliesen' && document.title.includes('Fliesenplan') && !document.getElementById('tilesec').hidden) && /fliesenplan\.html$/.test(p.url()) && leiste.join('|')==='Chevron L legen|Chevron R legen|Chevron als Paar legen', leiste.join('|'));
    // Setzen: Klick legt in die Bildmitte, Ziehen dorthin, wo man loslässt
    await p.locator('#tPalette button').nth(0).click(); await sleep(300);
    let F=await fliesenLage(p);
    const mitte=await p.evaluate(()=>{ const r=cv.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; });
    pruef('Klick in der Leiste legt eine Fliese nahe der Bildmitte, an die Wand gerastet (eine Ecke liegt auf der Wand), sie ist gewählt', F.length===1 && F[0].kind==='L' && F[0].gewaehlt && weit(F[0], mitte)<40 && F[0].wand[0]<.01 && await txt('tSelInfo')==='1 Fliese ausgewählt', JSON.stringify(F));
    const erste=F[0];
    const knopf=await p.locator('#tPalette button').nth(1).boundingBox();
    const ort1=await lage(p, 'A', 'D');
    await ziehe(p, {x:knopf.x+knopf.width/2, y:knopf.y+knopf.height/2}, ort1);
    F=await fliesenLage(p);
    const zweite=F.find(t=>t.id!==erste.id);
    pruef('aus der Leiste gezogen liegt die zweite Fliese, wo sie losgelassen wurde', F.length===2 && !!zweite && zweite.kind==='R' && zweite.gewaehlt && weit(zweite, ort1)<6, JSON.stringify(zweite));
    const id2=zweite ? zweite.id : -1;
    // Verschieben mit Maus und Pfeiltasten
    const ort2=await lage(p, 'F', 'D');
    await ziehe(p, zweite, ort2);
    let z=await eine(id2);
    pruef('mit der Maus gezogen liegt sie am neuen Ort, die erste blieb liegen', weit(z, ort2)<6 && weitMm(z, zweite)>500 && weitMm(await eine(erste.id), erste)<.01, `${Math.round(weitMm(z, zweite))} mm`);
    let vor=z; await p.keyboard.press('ArrowRight'); await sleep(150); z=await eine(id2);
    pruef('Pfeil rechts schiebt die gewählte Fliese 1 mm nach rechts', Math.abs(weitMm(z, vor)-1)<.01 && z.x>vor.x && Math.abs(z.y-vor.y)<.01, weitMm(z, vor).toFixed(3)+' mm');
    vor=z; await p.keyboard.press('Shift+ArrowDown'); await sleep(150); z=await eine(id2);
    pruef('Umschalt+Pfeil unten schiebt 10 mm nach unten', Math.abs(weitMm(z, vor)-10)<.01 && z.y>vor.y && Math.abs(z.x-vor.x)<.01, weitMm(z, vor).toFixed(3)+' mm');
    // Drehen, Duplizieren, Löschen, Rückgängig, Wiederherstellen
    vor=z; await p.keyboard.press('e'); await sleep(150); z=await eine(id2);
    pruef('E dreht die Fliese um 15° um ihre Mitte', Math.abs(((z.rot-vor.rot)%360+360)%360-15)<1e-6 && weitMm(z, vor)<.01, `${vor.rot} → ${z.rot}`);
    await p.keyboard.press(MOD+'+d'); await sleep(250);
    F=await fliesenLage(p);
    const kopie0=F.find(t=>t.id!==erste.id && t.id!==id2);
    // Eine Reihe weiter: quer zur Längskante um Breite + Fuge, längs so weit, dass die Schrägkanten fluchten.
    const reihe=await p.evaluate(()=>{ const s=M.tiles.spec, d=s.set[0], h=d.w+s.joint; return {quer:h, laengs:h/Math.tan(d.angle*Math.PI/180)}; });
    const w=z.rot*Math.PI/180, dv={x:kopie0.mx-z.mx, y:kopie0.my-z.my};
    const quer=Math.abs(dv.y*Math.cos(w)-dv.x*Math.sin(w)), laengs=Math.abs(dv.x*Math.cos(w)+dv.y*Math.sin(w));
    pruef('Duplizieren legt eine gleiche Fliese eine Reihe weiter (quer um Breite + Fuge) und wählt sie', F.length===3 && kopie0.kind===z.kind && kopie0.rot===z.rot && kopie0.gewaehlt && !F.find(t=>t.id===id2).gewaehlt && Math.abs(quer-reihe.quer)<.01 && Math.abs(laengs-reihe.laengs)<.01 && /^Duplikat/.test(await txt('hint')), `quer ${quer.toFixed(2)} von ${reihe.quer}, längs ${laengs.toFixed(2)} mm`);
    // Ein Schritt zwischen Duplizieren und Löschen: sonst sähe „noch einmal rückgängig“ aus wie „wiederherstellen“.
    await p.keyboard.press('ArrowUp'); await sleep(150);
    const kopie=await eine(kopie0.id);
    pruef('Pfeil hoch schiebt nur die Kopie 1 mm nach oben', Math.abs(weitMm(kopie, kopie0)-1)<.01 && kopie.y<kopie0.y && Math.abs(kopie.x-kopie0.x)<.01 && weitMm(await eine(id2), z)<1e-9, weitMm(kopie, kopie0).toFixed(3)+' mm');
    await p.keyboard.press('Delete'); await sleep(250);
    F=await fliesenLage(p);
    pruef('Entf löscht die gewählte Fliese, die Auswahl ist leer', F.length===2 && !F.some(t=>t.id===kopie.id) && await p.evaluate(()=>document.getElementById('tSelBox').hidden));
    await p.keyboard.press(MOD+'+z'); await sleep(300);
    F=await fliesenLage(p);
    const wieder=F.find(t=>t.id===kopie.id);
    pruef('Rückgängig holt die gelöschte Fliese an ihren Platz zurück', F.length===3 && !!wieder && weitMm(wieder, kopie)<1e-6);
    await p.keyboard.press(MOD+'+Shift+z'); await sleep(300);
    F=await fliesenLage(p);
    pruef('Wiederherstellen löscht sie wieder', F.length===2 && !F.some(t=>t.id===kopie.id));
    // Spezifikation: Fuge
    await p.click('#tSpecBox > summary'); await sleep(250);
    await p.click('#tJ'); await p.keyboard.press(MOD+'+a'); await p.keyboard.type('3'); await p.keyboard.press('Tab'); await sleep(250);
    pruef('Fuge 3 in der Spezifikation steht in der Kopfzeile des Fliesensets', await p.evaluate(()=>M.tiles.spec.joint===3) && /Fuge 3 mm$/.test(await txt('tSpecSum')), await txt('tSpecSum'));
    // Fliese einmessen
    await p.click('#tMeasure'); await sleep(300);
    pruef('„Fliese einmessen…“ öffnet den Dialog, „Maße übernehmen“ wartet auf Strecken', await p.evaluate(()=>document.getElementById('measDlg').open && document.activeElement.dataset.k==='AB' && document.getElementById('mApply').disabled) && await txt('mTitle')==='Chevron einmessen', await txt('mTitle'));
    for(const [k,v] of Object.entries({AB:'600,2 599,9 600,1', DC:'600,0', AD:'156,8', BC:'156,5', AC:'711,0', BD:'513,4', W:'120,1 119,9'})){
      await p.click(`#mFields input[data-k="${k}"]`); await p.keyboard.type(v); await sleep(60);
    }
    await sleep(250);
    const erg=await p.evaluate(()=>({
      werte:Object.fromEntries([...document.querySelectorAll('#mVals .mvals > div')].map(d=>[d.querySelector('span').textContent, d.querySelector('b').textContent])),
      form:document.getElementById('mReal').textContent,
      ab:[...document.querySelectorAll('#mTable tbody tr')].map(r=>[...r.cells].map(c=>c.textContent.trim())).find(r=>r[0]==='AB')||[],
      frei:!document.getElementById('mApply').disabled}));
    pruef('die Messreihe ergibt Breite 120,0 mm, Länge 600,0 mm und Winkel 49,97°', erg.werte.Breite==='120,0 mm' && erg.werte['Länge']==='600,0 mm' && erg.werte.Winkel==='49,97°', JSON.stringify(erg.werte));
    pruef('die drei Messungen von AB sind gemittelt, die Strecken passen zusammen', /^600,1\s*3×$/.test(erg.ab[1]||'') && /Strecken passen zusammen/.test(erg.form) && erg.frei, erg.ab.join(' '));
    await p.click('#mApply'); await sleep(350);
    const feld=await p.evaluate(()=>({zu:!document.getElementById('measDlg').open, b:document.getElementById('tW').value, l:document.getElementById('tL').value, a:document.getElementById('tA').value}));
    pruef('„Maße übernehmen“ schließt den Dialog und trägt 120 × 600 mm und den Winkel 49,97° ins Fliesenset ein', feld.zu && zahl(feld.b)===120 && zahl(feld.l)===600 && feld.a==='49,97' && /eingemessene Maße übernommen/.test(await txt('hint')), `${feld.b} × ${feld.l}, ${feld.a}°`);
    await p.click('#tNext'); await sleep(400);
    // Stückliste und Einkauf
    const einkauf=(await txt('tKey')).replace(/\s+/g, ' ');
    pruef('Einkauf nennt 0,14 m² in 2 Fliesen, 1 L und 1 R; Einzelheiten liegen dahinter', /Einkauf\s*0,14 m² · 2 Fliesen/.test(einkauf) && /1 L, 1 R, ohne Recycling/.test(einkauf) && !/Belegt/.test(einkauf), einkauf.slice(0, 90));
    await p.click('#tDetails > summary'); await sleep(250);
    const liste=await p.evaluate(()=>({hoch:document.getElementById('tStats').getBoundingClientRect().height, ganz:([...document.querySelectorAll('#tStats tr')].map(r=>[...r.cells].map(c=>c.textContent.trim())).find(r=>r[0]==='ganz')||[]).join(' ')}));
    pruef('„Stückliste und Einzelheiten“ zeigt Stückzahl und belegte Fläche', liste.hoch>0 && liste.ganz==='ganz 1 1 2' && /Belegt\s*0,14 von 9,00 m²/.test((await txt('tStats')).replace(/\s+/g,' ')), liste.ganz);
    // Offenes Menü: die Pfeile gehören dem Menü
    const e1=await eine(erste.id);
    await p.mouse.move(e1.x, e1.y); await sleep(40); await p.mouse.click(e1.x, e1.y); await sleep(250);
    await p.click('#roommenuBtn'); await sleep(250);
    const punkt=()=>p.evaluate(()=>document.activeElement.closest('#roommenu') ? document.activeElement.id : '');
    const punkt1=await punkt();
    for(const t of ['ArrowRight','ArrowLeft','ArrowLeft','ArrowDown']){ await p.keyboard.press(t); await sleep(80); }
    const punkt2=await punkt(); let e2=await eine(erste.id);
    pruef('im offenen Menü wandern die Pfeile durch die Punkte, die gewählte Fliese bleibt liegen', await p.evaluate(()=>!document.getElementById('roommenu').hidden && document.getElementById('toAufmass').getBoundingClientRect().width>0) && e2.gewaehlt && weitMm(e2, e1)<1e-9 && punkt1!=='' && punkt2!=='' && punkt2!==punkt1, `${punkt1} → ${punkt2}, ${weitMm(e2, e1)} mm`);
    await p.keyboard.press('Escape'); await sleep(200); await p.keyboard.press('ArrowRight'); await sleep(150);
    e2=await eine(erste.id);
    pruef('nach Esc ist das Menü zu, und der Pfeil schiebt die Fliese wieder 1 mm', await p.evaluate(()=>document.getElementById('roommenu').hidden) && Math.abs(weitMm(e2, e1)-1)<.01, weitMm(e2, e1).toFixed(3)+' mm');
    // Zurück zum Raumaufmaß, neu laden, Startbildschirm
    await p.click('#roommenuBtn'); await sleep(250); await p.click('#toAufmass'); await sleep(1500);
    pruef('Menü „Zum Raumaufmaß“ führt zurück zu den Maßen', await p.evaluate(()=>TOOL==='aufmass' && M.mode==='measure' && document.title.includes('Raumaufmaß') && !document.getElementById('tilesec') && document.getElementById('toolname').hidden) && /raumaufmass\.html$/.test(p.url()) && /^Geprüft ± /.test(await stand(p)), await stand(p));
    const bild=()=>p.evaluate(()=>JSON.stringify(M.tiles)); const gelegt=await bild();
    await p.reload(); await sleep(1000);
    pruef('nach dem Neuladen liegen beide Fliesen unverändert im Raum', await p.evaluate(()=>M.tiles.items.length===2) && await bild()===gelegt);
    await p.keyboard.press('Escape'); await p.keyboard.press('4'); await sleep(400);
    pruef('die Ausgabe nennt jetzt „2 Fliesen verlegt“', await p.evaluate(()=>OUT.on) && await txt('outTilesNote')==='2 Fliesen verlegt', await txt('outTilesNote'));
    await p.keyboard.press('Escape'); await sleep(200);
    await p.click('#backHome'); await sleep(900);
    const start=await p.evaluate(()=>[...document.querySelectorAll('.room [data-werk]')].filter(b=>b.getBoundingClientRect().width>0).map(b=>b.textContent));
    pruef('der Startbildschirm zeigt am Raum den Knopf „Fliesenplan“', /raeume\.html/.test(p.url()) && start.join('|')==='Fliesenplan', start.join('|'));
    await p.click('.room [data-werk=fliesen]'); await sleep(1500);
    pruef('der Knopf öffnet den Fliesenplan mit beiden Fliesen', /fliesenplan\.html$/.test(p.url()) && await p.evaluate(()=>TOOL==='fliesen' && document.title.includes('Fliesenplan')) && (await fliesenLage(p)).length===2 && await bild()===gelegt);
    await p.reload(); await sleep(1000);
    pruef('Neuladen auf der Seite des Fliesenplans bleibt im Fliesenplan bei beiden Fliesen', /fliesenplan\.html$/.test(p.url()) && await p.evaluate(()=>TOOL==='fliesen' && document.title.includes('Fliesenplan') && !document.getElementById('tilesec').hidden) && (await fliesenLage(p)).length===2 && await bild()===gelegt);
    pruef('keine Fehler in der Konsole', f.stoer.length===0, f.stoer.join(' | '));
    await f.browser.close();
  },

  // Küchenplaner: gemessener Raum mit Höhe, Tür und Wasser; Teile setzen, schieben, drehen,
  // kopieren, löschen; Panel, Schalter, Menü; zurück ins Aufmaß, neu laden, Startbildschirm.
  async kuechenplaner(){
    const f=await fenster(); const p=f.page; await gemessenerRaum(f); await p.keyboard.press('Escape');
    const MOD=process.platform==='darwin' ? 'Meta' : 'Control';
    // Schritt Wände: Höhe an der linken Ecke, Tür, an der nächsten Wand der Wasseranschluss
    await p.keyboard.press('3'); await sleep(400);
    await p.click('#wHeights button[data-h]'); await sleep(250); await p.keyboard.type('2,5'); await p.keyboard.press('Enter'); await sleep(300);
    await p.click('#wAdd [data-add=door]'); await sleep(250); await p.keyboard.press('Escape'); await sleep(150);
    await p.keyboard.press('ArrowRight'); await sleep(250); await p.click('#wWater'); await sleep(250);
    const w=await p.evaluate(()=>({mode:M.mode, h:M.hmeas.map(m=>m.d), tuer:M.openings.map(o=>o.kind+o.a+o.b), wasser:M.water.map(x=>x.a+x.b)}));
    pruef('Schritt Wände: Höhe 2,500 m, Tür und Wasseranschluss an zwei Wänden', w.mode==='wall' && w.h.join()==='2500' && w.tuer.length===1 && /^door/.test(w.tuer[0]) && w.wasser.length===1 && w.wasser[0]!==w.tuer[0].slice(4), JSON.stringify(w));
    // Ausgabe, Küchenplaner
    await p.keyboard.press('4'); await sleep(500); await p.click('#outKitchen'); await sleep(1600);
    pruef('„Öffnen“ in der Ausgabe führt in den Küchenplaner mit Leiste', await p.evaluate(()=>TOOL==='kueche' && M.mode==='kitchen' && /kuechenplaner\.html$/.test(location.pathname) && document.title.includes('Küchenplaner') && [...document.querySelectorAll('#kPalette button')].filter(b=>b.getBoundingClientRect().width>0).length>=10));
    // Setzen
    const u0=(await kueche(p)).undo;
    const schrank=await ausLeiste(p, 'Schrank'); let k=await kueche(p);
    pruef('Klick auf „Schrank“ stellt einen Unterschrank an eine Wand und wählt ihn', k.teile.length===1 && schrank.kind==='base' && schrank.wand!=='' && k.sel===schrank.id && k.undo===u0+1 && /Unterschrank/.test(await p.evaluate(()=>document.getElementById('kSelBox').hidden ? '' : document.getElementById('kSelInfo').textContent)), JSON.stringify(k));
    const spuele=await ausLeiste(p, 'Spüle');
    pruef('„Spüle“ steht daneben an derselben Wand', spuele.dev==='sink' && spuele.wand===schrank.wand && Math.abs(spuele.x-schrank.x)===600, JSON.stringify(spuele));
    let hoch=await ausLeiste(p, 'Schrank'); await p.click('#kKind [data-kind="tall"]'); await sleep(300); hoch=await teilNr(p, hoch.id);
    pruef('Bauart „hoch“ macht aus dem dritten Schrank einen Hochschrank', hoch.kind==='tall' && /Hochschrank/.test(await p.evaluate(()=>document.getElementById('kSelInfo').textContent)), JSON.stringify(hoch));
    // Ziehen an der Wand
    let q=await teilLage(p, hoch.id); k=await kueche(p); const b0=await fleck(p, q);
    await p.mouse.move(q.x, q.y); await sleep(80); await p.mouse.down(); await p.mouse.move(q.x+8*q.u.x, q.y+8*q.u.y, {steps:3}); await p.mouse.move(q.x+90*q.u.x, q.y+90*q.u.y, {steps:10}); await sleep(120); await p.mouse.up(); await sleep(350);
    let h2=await teilNr(p, hoch.id), k2=await kueche(p); const leer=await unterschied(p, b0, await fleck(p, q));
    pruef('Ziehen schiebt den Hochschrank an seiner Wand entlang, im Plan ist sein alter Platz frei, ein Rückgängig-Schritt', h2.wand===hoch.wand && h2.x>hoch.x+700 && leer>=0.5 && k2.undo===k.undo+1 && k2.sel===hoch.id, `x ${hoch.x} → ${h2.x}, Schritte ${k.undo} → ${k2.undo}, alter Platz zu ${Math.round(leer*100)} % anders`);
    // Pfeiltasten
    q=await waehleTeil(p, hoch.id);
    await p.keyboard.press(q.plus); await sleep(200); let h3=await teilNr(p, hoch.id);
    await p.keyboard.press('Shift+'+q.minus); await sleep(200); let h4=await teilNr(p, hoch.id);
    pruef('Pfeiltaste schiebt 1 cm, mit ⇧ 10 cm zurück', h3.x===h2.x+10 && h4.x===h3.x-100, `${h2.x} → ${h3.x} → ${h4.x}`);
    k=await kueche(p);
    for(let i=0;i<6;i++){ await p.keyboard.down(q.plus); await sleep(40); } await p.keyboard.up(q.plus); await sleep(600);
    let h5=await teilNr(p, hoch.id); k2=await kueche(p);
    await p.keyboard.press(MOD+'+z'); await sleep(350); let h6=await teilNr(p, hoch.id);
    pruef('gehaltene Pfeiltaste schiebt weiter und ist ein einziger Rückgängig-Schritt', h5.x===h4.x+60 && k2.undo===k.undo+1 && h6.x===h4.x, `${h4.x} → ${h5.x} → ⌘Z ${h6.x}, Schritte ${k.undo} → ${k2.undo}`);
    // Drehen (frei stehende Insel)
    const insel=await ausLeiste(p, 'Insel');
    await p.keyboard.press('e'); await sleep(250); const r1=(await teilNr(p, insel.id)).rot;
    await p.click('#kR90'); await sleep(300); const r2=(await teilNr(p, insel.id)).rot;
    pruef('Insel: E dreht um 15°, „↻ 90°“ um weitere 90°', insel.kind==='island' && insel.wand==='' && r1===15 && r2===105, `${r1}°, ${r2}°`);
    // Pfeil während einer Mausgeste darf den Rückgängig-Schritt nicht teilen.
    const beforeRot=await kueche(p);
    await p.evaluate(()=>{ const rs=document.getElementById('kRs');
      rs.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
      rs.value='110'; rs.dispatchEvent(new Event('input',{bubbles:true}));
      rs.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
      rs.value='111'; rs.dispatchEvent(new Event('input',{bubbles:true}));
      rs.dispatchEvent(new Event('change',{bubbles:true}));
      rs.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowRight',bubbles:true}));
      rs.value='120'; rs.dispatchEvent(new Event('input',{bubbles:true}));
      rs.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));
      rs.dispatchEvent(new Event('change',{bubbles:true})); });
    await sleep(350); const afterRot=await kueche(p);
    await p.keyboard.press(MOD+'+z'); await sleep(350);
    const undoneRot=await teilNr(p,insel.id);
    pruef('Pfeiltaste beim Ziehen des Drehreglers teilt die Geste nicht: einmal Rückgängig stellt den Ausgangswinkel wieder her',
      afterRot.undo===beforeRot.undo+1 && undoneRot.rot===r2, `Schritte ${beforeRot.undo} → ${afterRot.undo}, Winkel nach Rückgängig ${undoneRot.rot}°`);
    await p.focus('#kRs'); const beforeKey=await kueche(p);
    await p.keyboard.down('ArrowRight'); await p.keyboard.down('ArrowRight'); await p.keyboard.up('ArrowRight'); await sleep(600);
    const afterKey=await kueche(p), movedKey=await teilNr(p,insel.id);
    await p.keyboard.press(MOD+'+z'); await sleep(350); const undoneKey=await teilNr(p,insel.id);
    pruef('gehaltene Pfeiltaste am Drehregler bleibt ein Rückgängig-Schritt',
      afterKey.undo===beforeKey.undo+1 && movedKey.rot>r2 && undoneKey.rot===r2, `${r2}° → ${movedKey.rot}° → ${undoneKey.rot}°`);
    // Duplizieren, Löschen, Rückgängig, Wiederherstellen
    await waehleTeil(p, schrank.id); k=await kueche(p);
    await p.keyboard.press(MOD+'+d'); await sleep(350); k2=await kueche(p); const kopie=k2.teile[k2.teile.length-1];
    pruef('⌘D stellt eine Kopie des Unterschranks an dieselbe Wand und wählt sie', k.sel===schrank.id && k2.teile.length===k.teile.length+1 && kopie.kind==='base' && kopie.w===schrank.w && kopie.wand===schrank.wand && kopie.x!==schrank.x && k2.sel===kopie.id, JSON.stringify(kopie));
    const qk=await teilLage(p, kopie.id);
    await p.keyboard.press('Delete'); await sleep(300); let k3=await kueche(p); const b3=await fleck(p, qk);
    pruef('Entf löscht das gewählte Teil und sagt, wie es zurückkommt', k3.teile.length===k.teile.length && !k3.teile.some(t=>t.id===kopie.id) && /Unterschrank 60 entfernt · (⌘|Strg\+)Z holt es zurück/.test(await p.evaluate(()=>document.getElementById('hint').textContent)), await p.evaluate(()=>document.getElementById('hint').textContent));
    await p.keyboard.press(MOD+'+z'); await sleep(350); const k4=await kueche(p), b4=await fleck(p, qk);
    await p.keyboard.press('Shift+'+MOD+'+z'); await sleep(350); const k5=await kueche(p), b5=await fleck(p, qk);
    const da4=await unterschied(p, b3, b4), fort5=await unterschied(p, b3, b5);
    pruef('⌘Z holt die Kopie zurück, ⇧⌘Z nimmt sie wieder, der Plan zeigt beides', k4.teile.some(t=>t.id===kopie.id) && k4.teile.length===k2.teile.length && !k5.teile.some(t=>t.id===kopie.id) && da4>=0.5 && fort5<=0.02, `${k3.teile.length} → ${k4.teile.length} → ${k5.teile.length}, Platz der Kopie zu ${Math.round(da4*100)} % anders, danach zu ${Math.round(fort5*100)} %`);
    // Breite im Panel
    await waehleTeil(p, hoch.id); await sleep(300);
    const d0=await p.locator('#cv3d').screenshot(); await sleep(200); const d1=await p.locator('#cv3d').screenshot();
    const breite=p.locator('#kW'); await breite.fill('800'); await breite.press('Enter'); await sleep(600);
    const ruhe=await unterschied(p, d0, d1), in3d=await unterschied(p, d1, await p.locator('#cv3d').screenshot());
    pruef('Breite „800“ im Panel macht den Hochschrank 80 cm breit, auch in 3D', (await teilNr(p, hoch.id)).w===800 && await p.evaluate(()=>document.getElementById('kSelInfo').textContent)==='Hochschrank 80' && in3d>=0.002 && in3d>ruhe, `3D zu ${(in3d*100).toFixed(2)} % anders, in Ruhe ${(ruhe*100).toFixed(2)} %`);
    // Küchenmaße
    await p.click('#kSpecBox summary'); await sleep(300);
    const km=await p.evaluate(()=>{ const P=document.getElementById('panel').getBoundingClientRect(), I=[...document.querySelectorAll('#kSpecGrid input')].map(i=>i.getBoundingClientRect());
      return {offen:document.getElementById('kSpecBox').open, n:I.length, drin:I.every(r=>r.width>20 && r.left>=P.left && r.right<=P.right), sum:document.getElementById('kSpecSum').textContent}; });
    pruef('Küchenmaße klappen auf, alle neun Felder bleiben im Panel', km.offen && km.n===9 && km.drin, JSON.stringify(km));
    const sockel=p.locator('#kS_plinth'); await sockel.fill('120'); await sockel.press('Tab'); await sleep(350);
    const km2=await p.evaluate(()=>({sockel:M.kitchen.spec.plinth, offen:document.getElementById('kSpecBox').open, sum:document.getElementById('kSpecSum').textContent}));
    pruef('Sockel „120“ senkt die Arbeitshöhe in der Zusammenfassung um 3 cm', km2.sockel===120 && km2.offen && km.sum.includes('Arbeitshöhe 910') && km2.sum.includes('Arbeitshöhe 880'), km.sum+' → '+km2.sum);
    // 3D aus und an
    await p.click('#k3dBtn'); await sleep(400);
    const aus=await p.evaluate(()=>({b:document.getElementById('k3dBtn').getAttribute('aria-pressed'), w:document.getElementById('cv3d').getBoundingClientRect().width}));
    await p.keyboard.press('v'); await sleep(900);
    const an=await p.evaluate(()=>({b:document.getElementById('k3dBtn').getAttribute('aria-pressed'), w:document.getElementById('cv3d').getBoundingClientRect().width, h:document.getElementById('cv3d').getBoundingClientRect().height, msg:document.getElementById('k3dMsg').hidden}));
    const nf=await bemalt(p, '#cv3d');
    pruef('Knopf „3D“ blendet die Ansicht aus, Taste V wieder ein', aus.b==='false' && aus.w===0 && an.b==='true' && an.w>300 && an.h>300, JSON.stringify([aus, an]));
    pruef('die 3D-Fläche ist gezeichnet, nicht leer', an.msg && nf>=0.1, Math.round(nf*100)+' % bemalt');
    // Wege, Analyse, Stückliste, Prüfung
    const wege=()=>p.evaluate(()=>({b:document.getElementById('kWayBtn').getAttribute('aria-pressed'), box:document.getElementById('kWayBox').getBoundingClientRect().height>0, n:document.querySelectorAll('#kWays [data-flow]').length, sum:document.getElementById('kWaySum').textContent, txt:document.getElementById('kWays').innerText.replace(/\n+/g,' | ').slice(0,200)}));
    const w0=await wege(); await p.click('#kWayBtn'); await sleep(400); const w1=await wege(), pl1=await p.locator('#cv').screenshot();
    await p.keyboard.press('w'); await sleep(400); const w2=await wege(), imPlan=await unterschied(p, pl1, await p.locator('#cv').screenshot());
    await p.click('#roommenuBtn'); await sleep(250); await p.click('#kAnaBtn'); await sleep(900);   // Wege-Analyse liegt im Menü
    const ana=await p.evaluate(()=>{ const a=document.getElementById('kAna'), r=a.getBoundingClientRect(); return {b:document.getElementById('kAnaBtn').getAttribute('aria-pressed'), w:r.width, h:r.height, txt:a.innerText.replace(/\n+/g,' | ').slice(0,300), knoepfe:a.querySelectorAll('button').length, c3:document.getElementById('cv3d').getBoundingClientRect().width}; });
    await p.keyboard.press('a'); await sleep(600);
    const ana2=await p.evaluate(()=>({b:document.getElementById('kAnaBtn').getAttribute('aria-pressed'), w:document.getElementById('kAna').getBoundingClientRect().width, c3:document.getElementById('cv3d').getBoundingClientRect().width}));
    await p.click('#kStockBox summary'); await sleep(300);
    const st=await p.evaluate(()=>({offen:document.getElementById('kStockBox').open, zeilen:document.querySelectorAll('#kStock tr').length, txt:document.getElementById('kStock').innerText.replace(/\s*\n+\s*/g,' | ').slice(0,400)}));
    pruef('die Prüfung steht als eine Zeile mit Punkt und Zahl im Panel, die Meldungen liegen dahinter', await p.evaluate(()=>{ const d=document.getElementById('kCheckBox'); return !d.open && d.dataset.lvl==='bad' && /geht nicht/.test(document.getElementById('kCheckCount').textContent) && !document.getElementById('kChecks').checkVisibility(); }));
    await p.click('#kCheckBox > summary'); await sleep(300);
    const pr=await p.evaluate(()=>({n:document.querySelectorAll('#kChecks .kfind').length, cnt:document.getElementById('kCheckCount').textContent, html:document.getElementById('kChecks').innerHTML.slice(0,600), txt:document.getElementById('kChecks').innerText.replace(/\s*\n+\s*/g,' | ').slice(0,400)}));
    pruef('„Wege“ schaltet die Wege im Plan und die Übersicht im Panel aus, Taste W wieder ein', w0.b==='true' && w0.box && w1.b==='false' && !w1.box && w2.b==='true' && w2.box && w2.n>=5 && /Abläufen/.test(w2.sum) && imPlan>=0.0001, JSON.stringify([w1.box, w2.box, w2.n, w2.sum])+`, Plan zu ${(imPlan*100).toFixed(2)} % anders`);
    pruef('„Analyse“ zeigt die Wege-Analyse statt 3D, Taste A holt 3D zurück', ana.b==='true' && ana.w>300 && ana.c3===0 && /Abläufe im Vergleich/.test(ana.txt) && ana.knoepfe>=3 && ana2.b==='false' && ana2.w===0 && ana2.c3>300, JSON.stringify([ana.w, ana.c3, ana.knoepfe, ana2]));
    pruef('Stückliste nennt Spüle, Hochschrank 80 cm, Insel und die Arbeitsplatte', st.offen && /Spüle 60 cm/.test(st.txt) && /Hochschrank 80 cm/.test(st.txt) && /Insel 180 cm/.test(st.txt) && /Arbeitsplatte/.test(st.txt), st.txt);
    pruef('Prüfung meldet, was nicht geht, und nennt die Teile', pr.n>=1 && pr.cnt!=='' && /Insel 180|Spüle 60/.test(pr.txt), pr.cnt+': '+pr.txt.slice(0, 120));
    const befund=p.locator('#kChecks .kfind.bad:not([aria-current])').first(), bt=await befund.textContent(); await befund.click(); await sleep(300);
    const bf=await p.evaluate(t=>{ const b=[...document.querySelectorAll('#kChecks .kfind')].find(b=>b.textContent===t); return {an:b ? b.getAttribute('aria-current') : '', sel:document.getElementById('kSelBox').hidden ? '' : document.getElementById('kSelInfo').textContent}; }, bt);
    pruef('Klick auf einen Befund wählt das Teil, das er nennt', bf.sel!=='' && bt.includes(bf.sel) && bf.an==='true', bt+' → '+bf.sel);
    // Abstände (NKBA) und Lineal: Schalter, Bild, Ziehen, Speicher
    { await p.keyboard.press('Escape'); await sleep(150);
      const bn=()=>p.evaluate(()=>({n:document.getElementById('kAbstBtn').getAttribute('aria-pressed'), l:document.getElementById('kRulerBtn').getAttribute('aria-pressed')}));
      const a0=await p.locator('#cv').screenshot();
      await p.keyboard.press('n'); await sleep(350); const an1=await bn(), a1=await p.locator('#cv').screenshot();
      await p.click('#roommenuBtn'); await p.click('#kAbstBtn'); await sleep(300); const an2=await bn();
      pruef('Abstände: Taste N zeichnet Maßlinien, der Menüpunkt schaltet sie wieder aus', an1.n==='true' && an2.n==='false' && await unterschied(p, a0, a1)>=0.0003, JSON.stringify([an1, an2, await unterschied(p, a0, a1)]));
      const kk=await kueche(p), box=await p.locator('#cv').boundingBox(), cx=box.x+box.width/2, cy=box.y+box.height/2;
      const r0=await p.locator('#cv').screenshot();
      await p.keyboard.press('l'); await sleep(350); const l1=await bn(), r1=await p.locator('#cv').screenshot();
      await p.mouse.move(cx, cy-15); await sleep(80); await p.mouse.down(); await p.mouse.move(cx+20, cy-5, {steps:3}); await p.mouse.move(cx+120, cy+45, {steps:8}); await sleep(100); await p.mouse.up(); await sleep(300);
      const r2=await p.locator('#cv').screenshot(), kl=await kueche(p), sp=await p.evaluate(()=>{ try{ const o=JSON.parse(localStorage.getItem('raumaufmass-kueche-lineal')||'{}'); return Object.values(o).length ? Object.values(o)[0] : null; }catch(e){ return null; } });
      pruef('Lineal: Taste L blendet es ein, Ziehen am Körper verschiebt es, ohne ein Küchenteil zu bewegen, die Lage bleibt im Browser', l1.l==='true' && await unterschied(p, r0, r1)>=0.0003 && await unterschied(p, r1, r2)>=0.0003 && kl.undo===kk.undo && sp && Math.abs(sp.b.x-sp.a.x)+Math.abs(sp.b.y-sp.a.y)>100, JSON.stringify([l1, kk.undo, kl.undo, sp]));
      { const vs=p.viewportSize(), out=[];
        for(const w of [1180, 1280, 1440, 1920]){ await p.setViewportSize({width:w, height:vs.height}); await sleep(350);
          out.push(await p.evaluate(()=>{ const t=document.getElementById('tools'); return `${innerWidth}: ${t.scrollWidth}/${t.clientWidth}`; })); }
        await p.setViewportSize(vs); await sleep(300);
        pruef('Küchenleiste mit Abstände und Lineal passt bei 1180, 1280, 1440 und 1920 px', out.every(x=>{ const m=x.match(/(\d+)\/(\d+)$/); return +m[1]<=+m[2]; }), out.join(' · ')); }
      await p.click('#roommenuBtn'); await p.click('#kRulerBtn'); await sleep(300); const l2=await bn();
      pruef('Lineal: der Menüpunkt blendet es wieder aus', l2.l==='false', JSON.stringify(l2)); }
    // Offenes Menü: die Pfeile gehören dem Menü, nicht dem gewählten Teil
    await waehleTeil(p, insel.id); k=await kueche(p); const i0=await teilNr(p, insel.id);
    await p.click('#roommenuBtn'); await sleep(250);
    for(const t of ['ArrowRight', 'ArrowLeft', 'ArrowLeft', 'ArrowDown']){ await p.keyboard.press(t); await sleep(120); }
    const mn=await p.evaluate(()=>({offen:!document.getElementById('roommenu').hidden, imMenue:!!document.activeElement.closest('#roommenu'), wo:document.activeElement.id||document.activeElement.textContent})); const i1=await teilNr(p, insel.id); k2=await kueche(p);
    pruef('im offenen Menü bewegen die Pfeiltasten die gewählte Insel nicht', k.sel===insel.id && mn.offen && mn.imMenue && i1.x===i0.x && i1.y===i0.y && k2.undo===k.undo, JSON.stringify([mn, i0, i1]));
    await p.click('#toAufmass'); await sleep(1500);
    pruef('„Zum Raumaufmaß“ im Menü führt zurück ins Aufmaß', await p.evaluate(()=>TOOL==='aufmass' && M.mode!=='kitchen' && document.getElementById('roommenu').hidden && !document.getElementById('kitchensec')), await p.evaluate(()=>TOOL+' '+M.mode+' '+location.hash));
    // Ecke löschen und zurückholen
    const vorher=await p.evaluate(()=>JSON.stringify(M.kitchen.items));
    // Abstand der Insel zu drei Ecken, die bleiben (mm): gleich, solange sie im Raum steht, wo sie stand.
    const inselOrt=()=>p.evaluate(()=>{ const K=M.kitchen, it=K.items.find(i=>i.kind==='island'), P=(M.fit && M.fit.pts)||M.pts, F=TILES.frameOf(P, null, K.frame); if(!it || !F) return null;
      const w=TILES.toWorldF(F, {x:it.x, y:it.y}); return ['C','D','E'].map(id=>{ const q=P.find(p=>p.id===id); return Math.round(Math.hypot(q.x-w.x, q.y-w.y)); }); });
    const o0=await inselOrt();
    await p.keyboard.press('2'); await sleep(300);
    const e=await lage(p, 'A'); await p.mouse.move(e.x+30, e.y-30); await sleep(60); await p.mouse.move(e.x, e.y, {steps:4}); await sleep(200);
    await p.keyboard.press('Delete'); await sleep(600);
    const weg=await p.evaluate(()=>({ecken:M.pts.length, teile:M.kitchen.items.length, stand:document.getElementById('statustxt').textContent})); weg.sagt=await meldung(p); const o1=await inselOrt();
    await p.keyboard.press(MOD+'+z'); await sleep(600);
    const da=await p.evaluate(()=>({ecken:M.pts.length, items:JSON.stringify(M.kitchen.items), stand:document.getElementById('statustxt').textContent}));
    pruef('Entf über Ecke A löscht sie, der Raum ist offen, die vier Küchenteile bleiben, die Insel an ihrem Platz', weg.ecken===5 && /Ecke A gelöscht · (⌘|Strg\+)Z holt sie zurück/.test(weg.sagt) && /offen/.test(weg.stand) && weg.teile===4 && !!o0 && !!o1 && o0.every((d,i)=>Math.abs(d-o1[i])<=2), JSON.stringify(weg)+` Insel zu C, D, E: ${o0} → ${o1}`);
    pruef('⌘Z holt die Ecke zurück, die Küchenteile stehen wie vorher', da.ecken===6 && da.items===vorher && /^Geprüft/.test(da.stand), da.stand+(da.items===vorher ? '' : ' '+da.items));
    // Neu laden
    await p.reload(); await sleep(1000);
    const neu=await p.evaluate(()=>({tool:TOOL, items:JSON.stringify(M.kitchen.items), wasser:M.water.length, h:M.hmeas.length, hash:location.hash}));
    pruef('nach dem Neuladen stehen dieselben Teile im Raum', neu.items===vorher && neu.wasser===1, neu.items.slice(0, 160));
    // Startbildschirm
    await p.click('#backHome'); await sleep(900);
    const start=await p.evaluate(()=>[...document.querySelectorAll('.room [data-werk]')].map(b=>({werk:b.dataset.werk, text:b.textContent, breit:b.getBoundingClientRect().width>0})));
    pruef('Startbildschirm zeigt am Raum den Knopf „Küche“', start.length===1 && start[0].werk==='kueche' && start[0].text==='Küche' && start[0].breit, JSON.stringify(start));
    if(start.length){ await p.click('.room [data-werk=kueche]'); await sleep(1600); }
    const wieder=await p.evaluate(()=>typeof TOOL==='undefined' ? {} : {tool:TOOL, hash:location.hash, items:JSON.stringify(M.kitchen.items), zeilen:document.querySelectorAll('#kChecks .kfind').length});
    pruef('der Knopf „Küche“ öffnet den Küchenplaner mit den Teilen', wieder.tool==='kueche' && wieder.items===vorher && wieder.zeilen>=1, JSON.stringify([wieder.tool, wieder.hash, wieder.zeilen]));
    pruef('keine Fehler in der Konsole', f.stoer.length===0, f.stoer.join(' | '));
    await f.browser.close();
  },
  // Die drei Werkzeuge sind eigene Seiten: derselbe Raum lädt in allen unverändert, jede Seite enthält nur ihr Werkzeug,
  // alte Adressen leiten weiter, Zurück führt zur vorigen Seite, Rückgängig beginnt je Seite neu.
  async seiten(){
    const fix=JSON.parse(await readFile(new URL('./fixtures/raum-voll.json', import.meta.url), 'utf8'));
    const raum={id:'probe', name:fix.name, updated:'2026-11-10T08:00:00.000Z', area:fix.area, stand:fix.stand, data:fix.data};
    const f=await fenster(); const p=f.page;
    await f.context.addInitScript(r=>{ try{ if(!localStorage.getItem('raumaufmass.rooms')){ localStorage.setItem('raumaufmass.rooms', JSON.stringify([r])); localStorage.setItem('raumaufmass.current', r.id); sessionStorage.setItem('raumaufmass.fenster', r.id); } }catch(e){} }, raum);
    const zustand=()=>p.evaluate(()=>({tool:TOOL, mode:M.mode, tiles:JSON.stringify(M.tiles), kitchen:JSON.stringify(M.kitchen), pts:M.pts.length, walls:M.walls.length,
      undo:undoStack.length, titel:document.title,
      fremd:{kachel:typeof drawTilesView!=='undefined', kueche:typeof drawKitchenView!=='undefined', wand:typeof drawWallView!=='undefined', aufmass:typeof aufmassPanel!=='undefined'},
      elemente:{modes:!!document.getElementById('modes'), tilesec:!!document.getElementById('tilesec'), kitchensec:!!document.getElementById('kitchensec'), cv3d:!!document.getElementById('cv3d'), tools:!!document.getElementById('tPalette'), kpal:!!document.getElementById('kPalette'), wallsec:!!document.getElementById('wallsec')},
      checks:typeof selfChecks}));
    const seite=async (url)=>{ await p.goto(BASE+'/'+url); await sleep(1500); return zustand(); };
    const a=await seite('raumaufmass.html'), fl=await seite('fliesenplan.html'), ku=await seite('kuechenplaner.html');
    pruef('der Raum lädt in allen drei Werkzeugen mit denselben Fliesen und Küchenteilen',
      a.tiles===fl.tiles && fl.tiles===ku.tiles && a.kitchen===fl.kitchen && fl.kitchen===ku.kitchen && JSON.parse(a.tiles).items.length===2 && JSON.parse(a.kitchen).items.length===4 && a.pts===fl.pts && fl.pts===ku.pts,
      `${a.tiles.length}/${fl.tiles.length}/${ku.tiles.length}`);
    pruef('jede Seite ist ihr Werkzeug (Titel, Modus)', a.tool==='aufmass' && fl.tool==='fliesen' && fl.mode==='tiles' && ku.tool==='kueche' && ku.mode==='kitchen' && /Raumaufmaß/.test(a.titel) && /Fliesenplan/.test(fl.titel) && /Küchenplaner/.test(ku.titel), [a.titel, fl.titel, ku.titel].join(' | '));
    pruef('das Raumaufmaß enthält nichts von Fliesenplan und Küchenplaner (Bedienung, Markup)',
      !a.fremd.kachel && !a.fremd.kueche && !a.elemente.tilesec && !a.elemente.kitchensec && !a.elemente.cv3d && !a.elemente.tools && !a.elemente.kpal && a.elemente.modes && a.elemente.wallsec, JSON.stringify([a.fremd, a.elemente]));
    pruef('Fliesenplan und Küchenplaner enthalten nichts vom Aufmaß (Wandansicht, Schritte, Wandabschnitt)',
      !fl.fremd.wand && !fl.fremd.aufmass && !ku.fremd.wand && !ku.fremd.aufmass && !fl.elemente.modes && !ku.elemente.modes && !fl.elemente.wallsec && !ku.elemente.wallsec && fl.elemente.tilesec && !fl.elemente.kitchensec && ku.elemente.kitchensec && !ku.elemente.tilesec, JSON.stringify([fl.fremd, ku.fremd, fl.elemente, ku.elemente]));
    pruef('ohne ?test sind die Selbstchecks nicht geladen', a.checks==='undefined' && fl.checks==='undefined' && ku.checks==='undefined');
    const gespeichert=await p.evaluate(()=>{ const r=JSON.parse(localStorage.getItem('raumaufmass.rooms'))[0]; return {tiles:JSON.stringify(r.data.tiles), kitchen:JSON.stringify(r.data.kitchen)}; });
    pruef('im Speicher stehen nach dem Durchlauf durch alle drei Seiten dieselben Fliesen und Küchenteile', gespeichert.tiles===a.tiles && gespeichert.kitchen===a.kitchen);
    // alte Adressen
    for(const [alt, neu, werk] of [['raumaufmass.html#fliesen','fliesenplan.html','fliesen'], ['raumaufmass.html#kueche','kuechenplaner.html','kueche']]){
      await p.goto(BASE+'/'+alt); await sleep(1500);
      const z=await p.evaluate(()=>({tool:TOOL, pfad:location.pathname, hash:location.hash}));
      pruef(`${alt} leitet auf ${neu} weiter`, z.pfad.endsWith('/'+neu) && z.tool===werk, JSON.stringify(z));
    }
    // Seitenwechsel: ein Rückgängig-Schritt im Fliesenplan, dann über das Menü ins Aufmaß und mit Zurück wieder hin
    await p.goto(BASE+'/fliesenplan.html'); await sleep(1500);
    const ort=await p.evaluate(()=>{ const K=tilesCtx(), T=M.tiles.items[0], P=TILES.tileCorners(M.tiles.spec, T), c={x:P.reduce((s,q)=>s+q.x,0)/P.length, y:P.reduce((s,q)=>s+q.y,0)/P.length}, s=toScr(TILES.toWorldF(K.F,c)), r=cv.getBoundingClientRect(), d=DPR(); return {x:r.left+s.x/d, y:r.top+s.y/d, id:T.id, mx:c.x}; });
    await p.mouse.move(ort.x, ort.y); await sleep(60); await p.mouse.click(ort.x, ort.y); await sleep(250);
    await p.keyboard.press('Shift+ArrowRight'); await sleep(300);
    const nachSchub=await p.evaluate(()=>({undo:undoStack.length, tiles:JSON.stringify(M.tiles)}));
    pruef('im Fliesenplan gibt es nach dem Schieben einen Rückgängig-Schritt', nachSchub.undo>=1 && nachSchub.tiles!==a.tiles, String(nachSchub.undo));
    await p.click('#roommenuBtn'); await sleep(250); await p.click('#toAufmass'); await sleep(1500);
    const imAufmass=await zustand();
    pruef('im Aufmaß liegt die geschobene Fliese, Rückgängig beginnt dort leer', imAufmass.tool==='aufmass' && imAufmass.tiles===nachSchub.tiles && imAufmass.undo===0, `${imAufmass.undo}`);
    await p.goBack(); await sleep(1500);
    const zurueck=await zustand();
    pruef('Zurück führt zum Fliesenplan, mit der geschobenen Fliese und leerem Rückgängig', zurueck.tool==='fliesen' && zurueck.tiles===nachSchub.tiles && zurueck.undo===0, zurueck.tool+' '+zurueck.undo);
    // Selbstchecks gibt es auf jeder Seite mit ?test
    for(const url of ['raumaufmass.html?test','fliesenplan.html?test','kuechenplaner.html?test']){
      await p.goto(BASE+'/'+url); await sleep(2500);
      const r=await p.evaluate(()=>typeof selfChecks==='function' ? (()=>{ const r=selfChecks(); return {n:r.out.length, ok:r.ok}; })() : null);
      pruef(`${url}: die Selbstchecks laden und laufen grün`, !!r && r.ok && r.n>1000, JSON.stringify(r));
    }
    pruef('keine Fehler in der Konsole', f.stoer.length===0, f.stoer.join(' | '));
    await f.browser.close();
    // eine liegengebliebene Übergabe (abgebrochener Wechsel) überstimmt nicht die Wahl auf dem Startbildschirm
    {
      const g=await fenster(); const q=g.page;
      const zwei=[raum, {id:'zweiter', name:'Zweiter', updated:'2026-11-10T09:00:00.000Z', area:null, data:{pts:[], walls:[], meas:[], idSeq:0}}];
      await g.context.addInitScript(r=>{ if(!localStorage.getItem('raumaufmass.rooms')){ localStorage.setItem('raumaufmass.rooms', JSON.stringify(r)); localStorage.setItem('raumaufmass.current', 'zweiter'); sessionStorage.setItem('raumaufmass.uebergabe', 'probe'); } }, zwei);
      await q.goto(BASE+'/raumaufmass.html'); await sleep(1200);
      const z=await q.evaluate(()=>({raum:currentRoom, schluessel:sessionStorage.getItem('raumaufmass.uebergabe')}));
      pruef('eine liegengebliebene Übergabe gilt nicht, wenn keine Werkzeugseite hierher geführt hat', z.raum==='zweiter' && z.schluessel===null, JSON.stringify(z));
      await g.browser.close();
    }
    // fehlt dem Fliesenplan oder dem Küchenplaner eine Kerndatei oder der Plan, startet er nicht und lässt den Speicher in Ruhe
    for(const [url, datei] of [['fliesenplan.html','raum-plan.js'], ['fliesenplan.html','raum-modell.js'], ['kuechenplaner.html','raum-plan.js'], ['kuechenplaner.html','raum-kueche.js']]){
      const g=await fenster(); const q=g.page;
      await g.context.addInitScript(r=>{ if(!localStorage.getItem('raumaufmass.rooms')){ localStorage.setItem('raumaufmass.rooms', JSON.stringify([r])); localStorage.setItem('raumaufmass.current', r.id); } }, raum);
      await g.context.route('**/'+datei, r=>r.fulfill({status:404, body:''}));
      await q.goto(BASE+'/'+url); await sleep(900);
      const z=await q.evaluate(()=>({karte:(document.getElementById('unvollstaendig')||{}).innerText||'', raeume:localStorage.getItem('raumaufmass.rooms')}));
      pruef(`${url} ohne ${datei}: Karte nennt die Datei, der Raum bleibt unberührt`, z.karte.includes('unvollständig geladen') && z.karte.includes(datei) && JSON.parse(z.raeume).length===1 && JSON.stringify(JSON.parse(z.raeume)[0].data)===JSON.stringify(raum.data), z.karte.slice(-60)+' | n='+JSON.parse(z.raeume).length+' | Raum gleich: '+(JSON.stringify(JSON.parse(z.raeume)[0].data)===JSON.stringify(raum.data)));
      await g.browser.close();
    }
  },
  // Das gespeicherte Aufmaß bleibt beim Öffnen und Arbeiten stabil. Neun Räume
  // (test/daten/stabil: L-Raum mit Messfehlern, 90°-Ausgleich, eigene Skizze,
  // Küche, Nachbarraum, zwei Räume aus dem alten Werkzeug ohne Stand, großer Raum
  // mit Insel, Wintergarten mit Schräge) werden in jedem der drei Werkzeuge
  // geöffnet, bearbeitet (Fliese bzw. Küchenteil setzen, Rückgängig,
  // Wiederherstellen) und dreimal neu geladen. Jede Seite, die den Raum rechnet,
  // muss ihn wie das Aufmaß rechnen: sonst wandern die Maße im Speicher (gemessen
  // an einer Probeseite ohne lageHalten: bis 1,3 mm je Öffnen). Prüfstand für
  // jeden Schnitt durch recompute (docs/superpowers/plans/2026-11-10-familie-schritt-3.md).
  async stabil(){
    const ordner=path.join(WURZEL, 'test', 'daten', 'stabil');
    const MOD=process.platform==='darwin' ? 'Meta' : 'Control';
    const ptsAbstand=(a,b)=>{ if(!a||!b||a.length!==b.length) return Infinity; let m=0; for(let i=0;i<a.length;i++){ if(a[i].id!==b[i].id) return Infinity; m=Math.max(m, Math.hypot(a[i].x-b[i].x, a[i].y-b[i].y)); } return m; };
    const gespeichert=(p,id)=>p.evaluate(id=>JSON.parse(localStorage.getItem('raumaufmass.rooms')).find(r=>r.id===id), id);
    for(const datei of (await readdir(ordner)).filter(n=>n.endsWith('.json')).sort()){
      const fall=JSON.parse(await readFile(path.join(ordner, datei), 'utf8')), name=datei.replace(/\.json$/, '');
      const id=fall.ls['raumaufmass.current'], start=JSON.parse(fall.ls['raumaufmass.rooms']).find(r=>r.id===id);
      for(const [hash, soll] of [['', 'aufmass'], ['#fliesen', 'fliesen'], ['#kueche', 'kueche']]){
        const f=await fenster(); const p=f.page, wo=`${name} ${soll}`;
        await f.context.addInitScript(ls=>{ if(!localStorage.getItem('raumaufmass.rooms')) for(const k in ls) localStorage.setItem(k, ls[k]); }, fall.ls);
        await p.goto(BASE+'/raumaufmass.html'+hash); await sleep(1300);
        const da=await p.evaluate(()=>({tool:TOOL, ecken:M.pts.length, raum:currentRoom}));
        if(da.tool!==soll || da.raum!==id){ pruef(`${wo}: öffnet im richtigen Werkzeug und Raum`, false, JSON.stringify(da)); await f.browser.close(); continue; }
        const r1=await gespeichert(p, id);
        pruef(`${wo}: bloßes Öffnen verschiebt das gespeicherte Aufmaß höchstens 0,001 mm`, ptsAbstand(r1.data.pts, start.data.pts)<=0.001, ptsAbstand(r1.data.pts, start.data.pts).toExponential(2)+' mm');
        // Der Stand steht nach dem Öffnen im Speicher, und zwar der, den das Aufmaß dort errechnet (die Räume
        // „roh“ kommen aus dem alten Werkzeug ohne Stand; ihr Zwilling ohne „-roh“ nennt den erwarteten).
        const zwilling=name.replace(/-roh$/, ''), erwartet=(fall.info||{}).stand || ((zwilling!==name && JSON.parse(await readFile(path.join(ordner, zwilling+'.json'), 'utf8')).info||{}).stand);
        pruef(`${wo}: der gespeicherte Stand ist der erwartete`, !!erwartet && !!r1.stand && r1.stand.text===erwartet, `${JSON.stringify(r1.stand && r1.stand.text)} gegen ${JSON.stringify(erwartet)}`);
        // Arbeiten: ein Teil setzen, zurück, vor
        if(soll==='fliesen'){
          if(await p.locator('#tNext').isVisible()) { await p.click('#tNext'); await sleep(300); }
          if(!await p.locator('#tPalette .tpal').count()){ await p.evaluate(()=>{ document.getElementById('tSpecBox').open=true; }); await p.click('#tSetAdd'); await sleep(300); }
          await p.locator('#tPalette .tpal').first().click(); await sleep(450);
        } else if(soll==='kueche'){ await p.locator('#kPalette button').first().click(); await sleep(450); }
        if(soll!=='aufmass'){ await p.keyboard.press(MOD+'+z'); await sleep(400); await p.keyboard.press(MOD+'+Shift+z'); await sleep(400); }
        const r2=await gespeichert(p, id), teile=r=>JSON.stringify(soll==='kueche' ? r.data.kitchen : r.data.tiles);
        for(let i=0;i<3;i++){ await p.reload(); await sleep(1100); }
        const r3=await gespeichert(p, id);
        pruef(`${wo}: nach Arbeiten und dreimal Neuladen höchstens 0,001 mm`, ptsAbstand(r3.data.pts, start.data.pts)<=0.001, ptsAbstand(r3.data.pts, start.data.pts).toExponential(2)+' mm');
        if(soll!=='aufmass') pruef(`${wo}: Teile nach Rückgängig und Wiederherstellen bleiben beim Neuladen`, teile(r2)===teile(r3));
        pruef(`${wo}: keine Fehler in der Konsole`, f.stoer.length===0, f.stoer.join(' | '));
        await f.browser.close();
      }
    }
  },
};

PW=await ladePlaywright();
const srv=await server(); BASE='http://127.0.0.1:'+srv.address().port;
const wahl=args.length ? args : Object.keys(ABLAEUFE);
for(const name of wahl){
  if(!ABLAEUFE[name]){ console.error('Unbekannter Ablauf: '+name+' (es gibt: '+Object.keys(ABLAEUFE).join(', ')+')'); rot++; continue; }
  console.log(`\n# ${name} (${ENGINE})`);
  try{ await ABLAEUFE[name](); }catch(e){ pruef(name+' läuft durch', false, e.message.split('\n')[0]); }
}
srv.close();
console.log(rot ? `\n${rot} ROT, ${gruen} ok` : `\nALLE ${gruen} PRÜFUNGEN GRÜN (${ENGINE})`);
process.exit(rot ? 1 : 0);
