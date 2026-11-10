// Browser-Test der Werkzeugfamilie: bedient Startbildschirm und Raumaufmaß wie
// ein Mensch (echte Klicks und Tasten) und prüft, was die Node-Tests nicht
// sehen: die Bedienung. Die 1018 Selbstchecks decken die Rechenkerne; dieser
// Lauf deckt den Weg Skizze, Maße, Wände, Ausgabe, zwei Fenster, eine
// unvollständig geladene Seite.
//
//   node test/browser.mjs                 alle Abläufe in Chromium
//   node test/browser.mjs webkit          in WebKit (firefox ebenso)
//   node test/browser.mjs chromium fenster  nur ein Ablauf
//
// Braucht Playwright, das NICHT zum Repo gehört (kein Build, keine
// Abhängigkeiten): entweder im Suchpfad von Node, oder der Ordner, in dem es
// liegt, in PLAYWRIGHT, z. B.
//   npx playwright install chromium webkit firefox
//   PLAYWRIGHT=~/.npm/_npx/<hash>/node_modules node test/browser.mjs
// Fehlt es, endet der Lauf mit 2 und sagt das. Der Test liefert die Seiten
// selbst aus (eigener Port, leerer Speicher) und fasst keine andere Adresse an.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
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
const TYP={'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8'};
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
    await p.evaluate(()=>setTool('fliesen')); await sleep(500);
    pruef('Fliesenplan öffnet', await p.evaluate(()=>TOOL==='fliesen' && document.title.includes('Fliesenplan')));
    await p.evaluate(()=>setTool('kueche')); await sleep(600);
    await p.setViewportSize({width:1100, height:800}); await sleep(300);
    pruef('Küchenplaner öffnet, Leiste passt bei 1100 px', await p.evaluate(()=>{ const t=document.getElementById('tools'); return TOOL==='kueche' && t.scrollWidth<=t.clientWidth; }));
    await p.setViewportSize({width:1440, height:900});
    await p.evaluate(()=>setTool('aufmass')); await sleep(300);
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
    const kerne=['raum-kern.js','raum-fliesen.js','fliesenplan-einmessen.js','raum-kueche.js','raum-geometrie.js','raum-speicher.js','raum-modell.js','raum-zeichnung.js'];
    for(const datei of [...kerne, 'raum-checks.js', 'raum-blatt.js']){
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
    await p.goto(BASE+'/raumaufmass.html'); await sleep(900);
    const r=await p.evaluate(()=>{ const r=selfChecks(); return {n:r.out.length, ok:r.ok, rot:r.out.filter(z=>z.startsWith('FAIL')).slice(0,3)}; });
    pruef(`Selbstchecks im Browser (${r.n})`, r.ok && r.n>1000, r.rot.join(' | '));
    pruef('geladen sind 13 Skripte, keine Karte', await p.evaluate(()=>document.querySelectorAll('script[src]').length===13 && !globalThis.RAUM_UNVOLLSTAENDIG));
    await f.browser.close();
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
