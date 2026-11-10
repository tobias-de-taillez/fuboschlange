#!/usr/bin/env node
// Bildvergleich alt gegen neu: derselbe Raum, dieselben Schritte in zwei Ständen des
// Werkzeugs (zwei Ordner, zwei eigene Ports), je Schritt Zeichenfläche und ganze Seite
// als Bildpunkte verglichen. Fängt, was test/browser.mjs nicht sieht: reine Zeichenfehler.
//
//   node scripts/bildvergleich.mjs <alter-Ordner> [<neuer-Ordner>] [chromium|webkit|firefox] [--aus <Ordner>]
//
// Der alte Stand ist ein Arbeitsverzeichnis auf einem früheren Commit (git worktree add <Ordner> <Commit>),
// der neue standardmäßig dieses Repo. Braucht Playwright (Variable PLAYWRIGHT wie in test/browser.mjs).
// Räume: test/fixtures/raum-voll.json (ungenau gemessen, 90°-Ausgleich, Höhe, Tür, Wasser, 2 Fliesen, 4 Küchenteile),
// dazu Abwandlungen: Diagonalen mit einem Ausreißer, und die Skizze ohne Maße.
// Die Adressen der Werkzeuge stehen in SEITEN; nach dem Schnitt zeigen fliesen und kueche auf die eigenen Seiten.
// Bei Abweichung liegen beide Bilder in <aus> (Standard: ./bildvergleich-aus). Ausgang 1 bei Abweichung.
import http from 'node:http';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';

const args=process.argv.slice(2); const aus_i=args.indexOf('--aus'); let AUS='bildvergleich-aus';
if(aus_i>=0){ AUS=args[aus_i+1]; args.splice(aus_i,2); }
const ENGINES=['chromium','webkit','firefox'];
const ENGINE=ENGINES.includes(args[args.length-1]) ? args.pop() : 'chromium';
const ALT=path.resolve(args[0]||''), NEU=path.resolve(args[1]||fileURLToPath(new URL('..', import.meta.url)));
if(!args[0]){ console.error('Aufruf: node scripts/bildvergleich.mjs <alter-Ordner> [<neuer-Ordner>] [engine] [--aus <Ordner>]'); process.exit(2); }
const SEITEN_ALT={aufmass:'raumaufmass.html', fliesen:'raumaufmass.html#fliesen', kueche:'raumaufmass.html#kueche'};
const SEITEN_NEU=process.env.NEUE_SEITEN==='geschnitten'
  ? {aufmass:'raumaufmass.html', fliesen:'fliesenplan.html', kueche:'kuechenplaner.html'} : SEITEN_ALT;

async function ladePlaywright(){
  try{ return (await import('playwright')).default; }catch(e){}
  const ort=process.env.PLAYWRIGHT;
  if(ort){ try{ return createRequire(path.resolve(ort.replace(/^~/, process.env.HOME||''))+'/')('playwright'); }catch(e){} }
  console.error('Playwright nicht gefunden (Variable PLAYWRIGHT, siehe Kopf von test/browser.mjs).'); process.exit(2);
}
const TYP={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=wurzel=>new Promise(ok=>{
  const s=http.createServer(async (q,r)=>{
    const p=decodeURIComponent(new URL(q.url,'http://x').pathname); const d=path.join(wurzel, p==='/' ? 'raeume.html' : p);
    if(!d.startsWith(wurzel)||!TYP[path.extname(d)]){ r.writeHead(404).end(); return; }
    try{ const b=await readFile(d); r.writeHead(200,{'content-type':TYP[path.extname(d)],'cache-control':'no-cache'}).end(b); }catch(e){ r.writeHead(404).end(); }
  }); s.listen(0,'127.0.0.1',()=>ok(s)); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hash=b=>createHash('sha1').update(b).digest('hex').slice(0,12);

const RAUM=JSON.parse(await readFile(new URL('../test/fixtures/raum-voll.json', import.meta.url),'utf8'));
// Abwandlungen des Raums (auf den Daten, ohne Bedienung)
const VARIANTEN={
  voll:d=>d,
  // zwei Diagonalen, eine davon 60 mm daneben: die Form ist überbestimmt, ein Verdächtiger steht im Plan
  ausreisser:d=>{ const o=JSON.parse(JSON.stringify(d)); const P=Object.fromEntries(o.pts.map(p=>[p.id,p]));
    const ids=o.pts.map(p=>p.id); const a=ids[0], c=ids[2], b=ids[1], e=ids[3];
    const dist=(u,v)=>Math.hypot(P[u].x-P[v].x,P[u].y-P[v].y);
    o.meas=[...(o.meas||[]), {a, b:c, d:dist(a,c), sigma:5, on:true}, {a:b, b:e, d:dist(b,e)+60, sigma:5, on:true}]; return o; },
  // nur die Skizze, keine Maße: unterbestimmt, kein Ausgleich
  skizze:d=>{ const o=JSON.parse(JSON.stringify(d)); o.meas=[]; o.opmeas=[]; o.hmeas=[]; o.angs=[]; o.ortho=false; o.snapfit=false; return o; },
};

const PW=await ladePlaywright();
const sAlt=await server(ALT), sNeu=await server(NEU);
const URL_={alt:'http://127.0.0.1:'+sAlt.address().port, neu:'http://127.0.0.1:'+sNeu.address().port};
const browser=await PW[ENGINE].launch({headless:true});

async function lauf(stand, seiten, variante, viewport){
  const ctx=await browser.newContext({viewport, locale:'de-DE', reducedMotion:'reduce', deviceScaleFactor:1});
  const raum={id:'probe', name:RAUM.name, updated:'2026-11-10T08:00:00.000Z', area:RAUM.area, stand:RAUM.stand, data:VARIANTEN[variante](RAUM.data)};
  await ctx.addInitScript(r=>{ try{ if(!localStorage.getItem('raumaufmass.rooms')){ localStorage.setItem('raumaufmass.rooms', JSON.stringify([r])); localStorage.setItem('raumaufmass.current', r.id); sessionStorage.setItem('raumaufmass.fenster', r.id); } }catch(e){} }, raum);
  const p=await ctx.newPage(); const fehler=[]; p.on('pageerror',e=>{ fehler.push(e.message); if(process.env.BV_DEBUG) console.log('pageerror',e.message); });
  p.on('console',m=>{ if(m.type()==='error' && !/Failed to load resource|favicon/.test(m.text())) fehler.push('console: '+m.text()); });
  await p.addStyleTag({content:'*{transition:none!important;animation:none!important;caret-color:transparent!important}'}).catch(()=>{});
  const bilder=[];
  const knipse=async name=>{
    await sleep(700);
    // Stempel (Mausposition) stören nicht; Fokusring und Texteingabe-Cursor sind abgeschaltet.
    const cvUrl=await p.evaluate(()=>{ try{ return cv.toDataURL(); }catch(e){ return 'FEHLER '+e.message; } });
    const png=await p.screenshot({animations:'disabled', caret:'hide'});
    bilder.push({name, cv:hash(cvUrl), cvUrl, shot:hash(png), png});
  };
  const eigen=(sel)=>p.evaluate(s=>{ const e=document.querySelector(s); if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; }, sel);
  const lage=(a,b,t=.5)=>p.evaluate(([a,b,t])=>{ const P=viewPts(), A=P.find(q=>q.id===a), B=b?P.find(q=>q.id===b):A;
    const s=toScr({x:A.x+(B.x-A.x)*t,y:A.y+(B.y-A.y)*t}), r=cv.getBoundingClientRect(), d=DPR(); return {x:r.left+s.x/d,y:r.top+s.y/d}; },[a,b,t]);
  // Nach einem Seitenwechsel liegt die Maus noch über dem Menü-Knopf und der Fokus ist weg: beides gleichziehen.
  const ruhe=async ()=>{ await p.mouse.move(5,5); await p.evaluate(()=>{ if(document.activeElement && document.activeElement.blur) document.activeElement.blur(); if(typeof undoStack!=='undefined'){ undoStack.length=0; redoStack.length=0; render(); } }); };
  // (Rückgängig beginnt je Seite neu; im Altstand lebt der Stapel über den Werkzeugwechsel hinweg: auch das gleichziehen.)
  const schritt=async (name, f)=>{ try{ await f(); }catch(e){ fehler.push(name+': '+e.message); } await knipse(name); };
  const ids=await (async()=>{ await p.goto(URL_[stand]+'/'+seiten.aufmass); await sleep(900); return p.evaluate(()=>M.pts.map(q=>q.id)); })();
  const [A,B,C]=ids;
  await knipse('aufmass-start');
  await schritt('aufmass-skizze-hover', async()=>{ const q=await lage(A,B); await p.mouse.move(q.x,q.y); });
  await schritt('aufmass-skizze-ecke-gewaehlt', async()=>{ const q=await lage(A); await p.mouse.click(q.x,q.y); await sleep(200); });
  await schritt('aufmass-skizze-leer', async()=>{ await p.keyboard.press('Escape'); await p.mouse.move(5,5); });
  await schritt('aufmass-masse', async()=>{ await p.keyboard.press('2'); });
  await schritt('aufmass-masse-hover-wand', async()=>{ const q=await lage(B,C); await p.mouse.move(q.x,q.y); });
  await schritt('aufmass-masse-zoom', async()=>{ const q=await eigen('#cv'); await p.mouse.move(q.x,q.y); await p.mouse.wheel(0,-300); await sleep(200); });
  await schritt('aufmass-masse-einpassen', async()=>{ await p.evaluate(()=>fitActiveView()); });
  await schritt('aufmass-waende', async()=>{ await p.keyboard.press('3'); });
  await schritt('aufmass-wand-gewaehlt', async()=>{ const q=await lage(A,B); await p.mouse.click(q.x,q.y); await sleep(300); });
  await schritt('aufmass-wand-weiter', async()=>{ await p.keyboard.press('ArrowRight'); });
  await schritt('aufmass-ausgabe', async()=>{ await p.keyboard.press('Escape'); await p.keyboard.press('4'); });
  await schritt('aufmass-menue', async()=>{ await p.keyboard.press('Escape'); await p.click('#roommenuBtn'); await sleep(200); });
  await schritt('aufmass-menue-zu', async()=>{ await p.keyboard.press('Escape'); });
  // Fliesenplan und Küchenplaner brauchen einen eindeutig geprüften Raum; die Skizze ohne Maße bleibt im Aufmaß
  if(variante==='skizze'){ const fehl=[...new Set(fehler)]; await ctx.close(); return {bilder, fehl}; }
  await p.goto(URL_[stand]+'/'+seiten.fliesen); await sleep(1000);
  await ruhe(); await knipse('fliesen-start');
  const kachel=async ()=>p.evaluate(()=>{ const T=M.tiles.items[0]; if(!T) return null; const K=tilesCtx(), P=TILES.tileCorners(M.tiles.spec,T), c={x:P.reduce((a,q)=>a+q.x,0)/P.length,y:P.reduce((a,q)=>a+q.y,0)/P.length}, s=toScr(TILES.toWorldF(K.F,c)), r=cv.getBoundingClientRect(), d=DPR(); return {x:r.left+s.x/d,y:r.top+s.y/d}; });
  await schritt('fliesen-hover', async()=>{ const q=await kachel(); if(q) await p.mouse.move(q.x,q.y); });
  await schritt('fliesen-gewaehlt', async()=>{ const q=await kachel(); if(q){ await p.mouse.click(q.x,q.y); await sleep(250); } });
  await schritt('fliesen-gedreht', async()=>{ await p.keyboard.press('e'); });
  await schritt('fliesen-geschoben', async()=>{ for(let i=0;i<5;i++) await p.keyboard.press('Shift+ArrowRight'); });
  await schritt('fliesen-rueckgaengig', async()=>{ await p.keyboard.press((process.platform==='darwin'?'Meta':'Control')+'+z'); await sleep(200); });
  await schritt('fliesen-lineal', async()=>{ await p.click('#tRuler'); await sleep(250); });
  await schritt('fliesen-zoom', async()=>{ const q=await eigen('#cv'); await p.mouse.move(q.x,q.y); await p.mouse.wheel(0,-400); await sleep(200); });
  await schritt('fliesen-spezifikation', async()=>{ await p.click('#tSpecBox > summary'); await sleep(250); });
  await schritt('fliesen-spezifikation-zu', async()=>{ await p.click('#tSpecBox > summary'); await sleep(250); });
  await schritt('fliesen-stueckliste', async()=>{ await p.click('#tDetails > summary'); await sleep(300); });
  await schritt('fliesen-einmessen', async()=>{ await p.click('#tMeasure'); await sleep(500); });
  await schritt('fliesen-einmessen-zu', async()=>{ await p.keyboard.press('Escape'); await sleep(300); });
  await schritt('fliesen-qr', async()=>{ await p.click('#roommenuBtn'); await sleep(200); await p.click('#shareqr'); await sleep(500); });
  await schritt('fliesen-qr-zu', async()=>{ await p.keyboard.press('Escape'); await sleep(300); });
  await schritt('fliesen-melden', async()=>{ await p.click('#mldOpen'); await sleep(500); });
  await schritt('fliesen-melden-zu', async()=>{ await p.keyboard.press('Escape'); await sleep(300); });
  // Küchenplaner
  await p.goto(URL_[stand]+'/'+seiten.kueche); await sleep(1200);
  await ruhe(); await knipse('kueche-start');
  const teil=()=>p.evaluate(()=>{ const K=M.kitchen, it=K.items[0]; if(!it) return null; const E=KITCHEN.makeEnv(M.fit.pts,M.walls,M.openings,M.hmeas,M.water,K.frame), g=KITCHEN.geom(E,K,it); if(!g) return null; const r=cv.getBoundingClientRect(), d=DPR(), s=toScr(g.c); return {x:r.left+s.x/d,y:r.top+s.y/d}; });
  await schritt('kueche-hover', async()=>{ const q=await teil(); if(q) await p.mouse.move(q.x,q.y); });
  await schritt('kueche-gewaehlt', async()=>{ const q=await teil(); if(q){ await p.mouse.click(q.x,q.y); await sleep(300); } });
  await schritt('kueche-rueckgaengig-leer', async()=>{ await p.keyboard.press('Escape'); });
  await schritt('kueche-zoom', async()=>{ const q=await eigen('#cv'); await p.mouse.move(q.x,q.y); await p.mouse.wheel(0,-300); await sleep(200); });
  await schritt('kueche-spezifikation', async()=>{ await p.click('#kSpecBox > summary'); await sleep(300); });
  await schritt('kueche-stueckliste', async()=>{ await p.click('#kStockBox > summary'); await sleep(300); });
  await schritt('kueche-ohne-3d', async()=>{ await p.click('#k3dBtn'); await sleep(500); });
  await schritt('kueche-wege', async()=>{ await p.click('#kWayBtn'); await sleep(500); });
  await schritt('kueche-offen', async()=>{ await p.click('#kOpenBtn'); await sleep(500); });
  await schritt('kueche-analyse', async()=>{ await p.click('#kAnaBtn'); await sleep(800); });
  await schritt('kueche-melden', async()=>{ await p.click('#mldOpen'); await sleep(500); });
  const fehl=[...new Set(fehler)];
  await ctx.close();
  return {bilder, fehl};
}

async function diff(a, b){   // Bildpunkte, die sich unterscheiden (PNG-Bytes dekodiert in einer leeren Seite)
  const p=await browser.newPage();
  const n=await p.evaluate(async ([x,y])=>{
    const lade=async s=>{ const im=new Image(); im.src=s; await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height; const g=c.getContext('2d'); g.drawImage(im,0,0); return g.getImageData(0,0,c.width,c.height); };
    const A=await lade(x), B=await lade(y); if(A.width!==B.width||A.height!==B.height) return -1; let n=0;
    for(let i=0;i<A.data.length;i+=4) if(A.data[i]!==B.data[i]||A.data[i+1]!==B.data[i+1]||A.data[i+2]!==B.data[i+2]) n++; return n; }, ['data:image/png;base64,'+a.toString('base64'), 'data:image/png;base64,'+b.toString('base64')]);
  await p.close(); return n;
}

await mkdir(AUS,{recursive:true});
let abweichung=0, schritte=0;
const LAEUFE=[['voll',{width:1440,height:900}],['ausreisser',{width:1440,height:900}],['skizze',{width:1440,height:900}],['voll',{width:1000,height:700}]];
// Zeitabhängiges Zeichnen (frisch gemessene Strecken blenden aus) kann einen Lauf verschieben: ein Lauf mit
// Abweichung wird einmal wiederholt, gemeldet wird nur, was in beiden Versuchen abweicht.
const vergleiche=async (variante, vp)=>{
  const alt=await lauf('alt', SEITEN_ALT, variante, vp), neu=await lauf('neu', SEITEN_NEU, variante, vp);
  const diffs=[];
  alt.bilder.forEach((a,i)=>{ const b=neu.bilder[i]; if(!(a.cv===b.cv && a.shot===b.shot)) diffs.push({i, a, b}); });
  return {alt, neu, diffs};
};
for(const [variante, vp] of LAEUFE){
  const kopf=`${variante} ${vp.width}x${vp.height}`;
  let r=await vergleiche(variante, vp);
  if(r.diffs.length){
    const zweit=await vergleiche(variante, vp);
    const nochmal=new Set(zweit.diffs.map(d=>d.i));
    const echt=r.diffs.filter(d=>nochmal.has(d.i));
    if(echt.length<r.diffs.length) console.log(`  (${kopf}: ${r.diffs.length-echt.length} Abweichung(en) beim zweiten Versuch verschwunden, zählen nicht)`);
    r={alt:zweit.alt, neu:zweit.neu, diffs:zweit.diffs.filter(d=>echt.some(e=>e.i===d.i))};
  }
  for(const f of r.alt.fehl) console.log(`  (alt, ${kopf}) Fehler: ${f}`);
  for(const f of r.neu.fehl) console.log(`  (neu, ${kopf}) Fehler: ${f}`);
  if(r.alt.fehl.length!==r.neu.fehl.length) abweichung++;
  schritte+=r.alt.bilder.length;
  for(const {i, a, b} of r.diffs){
    abweichung++;
    const stamm=path.join(AUS, `${variante}-${vp.width}-${String(i).padStart(2,'0')}-${a.name}`);
    await writeFile(stamm+'-alt.png', a.png); await writeFile(stamm+'-neu.png', b.png);
    const n=await diff(a.png, b.png);
    console.log(`ABWEICHUNG ${kopf} · ${a.name}: Zeichenfläche ${a.cv===b.cv?'gleich':'ANDERS'}, Seite ${n} Bildpunkte anders  (${stamm}-alt/neu.png)`);
  }
}
await browser.close(); sAlt.close(); sNeu.close();
console.log(abweichung ? `\n${abweichung} Abweichungen in ${schritte} Vergleichen (${ENGINE})` : `\nBILDGLEICH: ${schritte} Vergleiche in vier Läufen (${ENGINE})`);
process.exit(abweichung ? 1 : 0);
