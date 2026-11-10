// Vergleicht zwei Stände des Raumaufmaßes direkt: dieselben Räume, in beiden geöffnet, müssen
// dasselbe rechnen und speichern. Gedacht für jeden Umbau ohne Verhaltensänderung (zuletzt:
// recompute in Rechnen, Bewerten, Sichern, Folgen). Je Raum aus test/daten/stabil drei Fassungen:
// wie gespeichert, mit drei Maßen weniger (Vorschläge) und mit einem um 15 % falschen Maß
// (Verdächtige, Streuung). Verglichen werden serialize(), Vorschläge, Verdächtige, Streuung,
// Öffnungen, der Stand und der gespeicherte Raum.
//
//   git archive <alter Stand> | tar -x -C /tmp/alt      (irgendein Ordner mit den Dateien des alten Stands)
//   PLAYWRIGHT=<Ordner mit node_modules> node test/vergleich-staende.mjs <Ordner alt> [<Ordner neu>]
//
// Ohne zweiten Ordner gilt der Stand dieses Repos als neu. Endet mit 1, wenn etwas abweicht.
import http from 'node:http';
import {readFile, readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const WURZEL=fileURLToPath(new URL('..', import.meta.url));
const [altArg, neuArg]=process.argv.slice(2);
if(!altArg){ console.error('Aufruf: node test/vergleich-staende.mjs <Ordner alt> [<Ordner neu>]'); process.exit(2); }
const ORDNER={alt:path.resolve(altArg), neu:path.resolve(neuArg||WURZEL)};
let playwright=null;
try{ playwright=(await import('playwright')).default; }catch(e){}
if(!playwright && process.env.PLAYWRIGHT){ try{ playwright=createRequire(path.resolve(process.env.PLAYWRIGHT.replace(/^~/, process.env.HOME||''))+'/')('playwright'); }catch(e){} }
if(!playwright){ console.error('Playwright nicht gefunden. Siehe test/browser.mjs (Variable PLAYWRIGHT).'); process.exit(2); }

const serve=wurzel=>new Promise(ok=>{
  const s=http.createServer(async (req, res)=>{
    const p=decodeURIComponent(new URL(req.url, 'http://x').pathname);
    try{ const b=await readFile(path.join(wurzel, p==='/' ? 'raeume.html' : p));
      res.writeHead(200, {'content-type':p.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8', 'cache-control':'no-cache'}).end(b); }
    catch(e){ res.writeHead(404).end(); }
  });
  s.listen(0, '127.0.0.1', ()=>ok(s));
});
const server={alt:await serve(ORDNER.alt), neu:await serve(ORDNER.neu)};
const browser=await playwright.chromium.launch({headless:true});
const faelleOrdner=path.join(WURZEL, 'test', 'daten', 'stabil');
let gleich=0, anders=0;
for(const datei of (await readdir(faelleOrdner)).filter(f=>f.endsWith('.json')).sort()){
  const fall0=JSON.parse(await readFile(path.join(faelleOrdner, datei), 'utf8'));
  for(const variante of ['wie gespeichert', 'weniger Maße', 'falsches Maß']){
    const fall=JSON.parse(JSON.stringify(fall0));
    if(variante!=='wie gespeichert'){
      const R=JSON.parse(fall.ls['raumaufmass.rooms']), r=R.find(x=>x.id===fall.ls['raumaufmass.current']);
      if(variante==='weniger Maße') r.data.meas=r.data.meas.slice(0, Math.max(3, r.data.meas.length-3));
      else { const i=r.data.meas.findIndex(m=>m.d>500); if(i>=0) r.data.meas[i]={...r.data.meas[i], d:r.data.meas[i].d*1.15}; }
      delete r.stand; fall.ls['raumaufmass.rooms']=JSON.stringify(R);
    }
    const erg={};
    for(const wer of ['alt', 'neu']){
      const ctx=await browser.newContext({viewport:{width:1440, height:900}});
      await ctx.addInitScript(ls=>{ if(!localStorage.getItem('raumaufmass.rooms')) for(const k in ls) localStorage.setItem(k, ls[k]); }, fall.ls);
      const p=await ctx.newPage(); const fehler=[]; p.on('pageerror', e=>fehler.push(e.message));
      await p.goto('http://127.0.0.1:'+server[wer].address().port+'/raumaufmass.html'); await new Promise(r=>setTimeout(r, 1400));
      erg[wer]=await p.evaluate(()=>{ const ohne=r=>{ const {updated, ...x}=r; return x; };
        return {ser:serialize(), vorschlaege:JSON.stringify(M.sugg), verdaechtige:JSON.stringify([...M.suspects]), streuung:JSON.stringify(M.narrow), stand:JSON.stringify(standKurz()),
          oeffnungen:JSON.stringify(M.openings), speicher:JSON.stringify(JSON.parse(localStorage.getItem('raumaufmass.rooms')).map(ohne))}; }).then(x=>({...x, fehler:fehler.join(' | ')}));
      await ctx.close();
    }
    const felder=Object.keys(erg.alt).filter(k=>erg.alt[k]!==erg.neu[k]);
    felder.length ? anders++ : gleich++;
    const z=erg.alt;
    console.log((felder.length ? 'ROT  ' : 'ok   ')+`${datei.replace('.json', '')} (${variante})`.padEnd(40)+(felder.length ? 'weicht ab in: '+felder.join(', ')
      : `Vorschläge ${JSON.parse(z.vorschlaege).length}, Verdächtige ${JSON.parse(z.verdaechtige).length}, Öffnungen ${JSON.parse(z.oeffnungen).length}`));
  }
}
console.log(anders ? `\n${anders} ROT, ${gleich} gleich` : `\nALLE ${gleich} VERGLEICHE GLEICH`);
await browser.close(); server.alt.close(); server.neu.close();
process.exit(anders ? 1 : 0);
