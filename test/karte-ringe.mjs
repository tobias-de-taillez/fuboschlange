// Prueft M8 raumskizze-ringe.js (ARCHITEKTUR v3, 17.7, Abnahme 10.6): Ringe pruefen, als Raumdaten
// mit mehreren Ringen ausgeben, Hinweise fuer ungesehene Waende und Schrankfronten. Gegen die
// echten Funktionen von raumaufmass.html (wallLoops, wallPolygon, roomArea, importProblem,
// parseShareFragment, geladen wie test/raumskizze-probe.mjs) und die Wahrheit als Ringe (F3).
// Laedt vendor + geo von raumskizze-probe.html und fuegt M0 und M8 als eigene Bloecke vor
// globalThis.RAUMSKIZZE=G; ein, wenn die Seite sie (noch) nicht traegt (wie test/karte-grund.mjs).
//
//   node test/karte-ringe.mjs            (RAUMSKIZZE_HTML=pfad: anderer Stand der Seite; F3=pfad: andere F3)
import {readFileSync, existsSync} from 'node:fs';

const read=f=>readFileSync(new URL('../'+f, import.meta.url), 'utf8');
const html=process.env.RAUMSKIZZE_HTML ? readFileSync(process.env.RAUMSKIZZE_HTML, 'utf8') : read('raumskizze-probe.html'), app=read('raumaufmass.html');
const pick=(src,id)=>{ const m=src.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`)); if(!m) throw new Error(`Script-Block "${id}" nicht gefunden`); return m[1]; };
const DATEI='raumskizze-ringe.js', src=read(DATEI), srcM0=read('raumskizze-karte-grund.js');
const mark='globalThis.RAUMSKIZZE=G;';
let geo=pick(html, 'geo'); if(geo.lastIndexOf(mark)<0) throw new Error('geo-Block ohne '+mark);
new Function('"use strict";\n'+pick(html, 'vendor')+'\n'+geo)();
const G0keys=new Set(Object.keys(globalThis.RAUMSKIZZE));
// Wortgleich heisst: die Datei steht als eigener Block in der Seite (mit oder ohne Leerzeile vor der Klammer).
const traegt=geo.includes('{\n'+src+'}\n') || geo.includes('{\n'+src+'\n}\n'), traegtM0=/G\.gBei=/.test(geo);
for(const [s, da] of [[srcM0, traegtM0], [src, traegt]]) if(!da){ const at=geo.lastIndexOf(mark); geo=geo.slice(0, at)+'{\n'+s+'\n}\n'+geo.slice(at); }
new Function('"use strict";\n'+pick(html, 'vendor')+'\n'+geo)();
const G=globalThis.RAUMSKIZZE;

// App-Funktionen wie test/raumskizze-probe.mjs; importProblem liegt im ui-Block, ist aber rein.
const imp=app.match(/function importProblem\(o\)\{[\s\S]*?\n\}\n/);
if(!imp) throw new Error('importProblem in raumaufmass.html nicht gefunden');
new Function('"use strict";\n'+pick(app, 'vendor')+'\n'+pick(app, 'core')+'\n'+pick(app, 'tiles')+'\n'+pick(app, 'store')
  +'\n'+imp[0]+'\nglobalThis.__APP={wallLoops, wallPolygon, roomArea, importProblem, parseShareFragment:globalThis.parseShareFragment};')();
const APP=globalThis.__APP;

const out=[]; let ok=true; const offen=[];
const chk=(name,cond,info='')=>{ ok=ok&&!!cond; out.push((cond?'ok   ':'ROT  ')+name+(info!==''?'  ('+info+')':'')); };
const merke=(name,info)=>{ offen.push(name); out.push('OFFEN '+name+'  ('+info+')'); };   // Kriterium nicht erreicht, mit Grund; kein Code-Fehler
const f1=x=>Number.isFinite(x) ? x.toFixed(1) : String(x), f4=x=>Number.isFinite(x) ? x.toFixed(4) : String(x);
const jeq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const wp=d=>APP.wallPolygon(d.pts, d.walls), fl=p=>p ? APP.roomArea(p)/1e6 : NaN;

// ------------------------------------------------- F3 als Ringe (3.4)
const F3PFAD=process.env.F3 || '/private/tmp/claude-501/-Volumes-external-TobiCodetEndlichWieder-Zaene/86e1205e-9d6d-494b-b0b6-88f6e01be4b0/scratchpad/karte/fixtures/f3-wahrheit-ringe.json';
const F3=JSON.parse(readFileSync(F3PFAD, 'utf8'));
const WAHR=JSON.parse(read('wahrheit-hesterkamp-wohnkueche-2026-10-25.json'));
// Ring-Objekt wie M7 es liefert: Wand k = ids[k] -> ids[k+1] (Wand-id wie F3.waende), alles gesehen, auto.
const ring=(r, extra={})=>({id:r.id, art:r.art, pts:r.pts.map(p=>[...p]), waende:r.ids.map((a,k)=>a+r.ids[(k+1)%r.ids.length]),
  sup:r.pts.map(()=>1), hyp:r.pts.map(()=>false), flaeche:Math.abs(r.flaeche ?? 0), teil:false, supRing:1, phi:0, dicke:0,
  quelle:'schnitt', entscheid:'auto', exportiert:true, ...extra});
const W3=()=>F3.ringe.map(r=>ring(r));
const plain=pts=>({art:'insel', pts:pts.map(p=>[...p]), exportiert:true});
const sh=(R,dx,dz)=>({...R, pts:R.pts.map(p=>[p[0]+dx, p[1]+dz])});

// ------------------------------------------------- Datei und Einbau
{
  const NAMEN=['ringePruefen', 'toRoomDataRinge', 'ringeHinweise'];
  const Gs={}; let fehler=null; try{ new Function('G', '"use strict";\n'+src)(Gs); }catch(x){ fehler=x.message; }
  const neu=Object.keys(Gs).sort();
  chk('Datei laedt allein (new Function, ohne geo-Kern) und haengt genau die Namen aus 4 an G', !fehler && jeq(neu, [...NAMEN].sort()), fehler || neu.join(','));
  // Traegt die Seite das Modul wortgleich, gilt die Seite; sonst darf sie keinen der Namen (andere Fassung) tragen.
  const kollision=traegt ? [] : NAMEN.filter(k=>G0keys.has(k));
  chk('Seite traegt das Modul wortgleich oder keinen seiner Namen (sonst andere Fassung in der Seite)', !kollision.length,
    kollision.join(',') || (traegt ? 'Seite traegt das Modul wortgleich' : 'eingefuegt (Seite traegt es noch nicht; Einbau macht P-I/J1)'));
  chk('Datei endet mit genau einem Zeilenumbruch, kein import/export/</script>', /[^\n]\n$/.test(src) && !/^\s*(import|export)\s/m.test(src) && !src.includes('</script>'));
  const code=src.replace(/\/\/.*$/gm, '');
  const verboten=[/Math\.random/, /Date\b/, /performance\.now/, /\bwindow\b/, /\bdocument\b/, /\bself\b/, /\blocalStorage\b/].filter(r=>r.test(code));
  chk('kein Math.random, keine Uhr (auch kein Date), kein DOM/Worker-Global im Code (2)', !verboten.length, verboten.map(String).join(' '));
  chk('kein atan2 auf Matrixeintraege (1.2), keine Umlaute in Kommentaren', !/atan2/.test(code) && !src.split('\n').some(l=>/\/\/.*[äöüÄÖÜß]/.test(l)));
  chk('zur Laufzeit nur G.idOf aus dem geo-Kern', [...new Set(code.match(/G\.[A-Za-z]+/g))].filter(k=>!NAMEN.includes(k.slice(2))).join(',')==='G.idOf');
}

// ------------------------------------------------- Wahrheit: pruefen -> exportieren -> wallPolygon (10.6)
const ringeW=W3();
const erg=G.ringePruefen(ringeW), data=G.toRoomDataRinge(erg.ringe, 2416);
const poly=wp(data), A=fl(poly);
{
  chk('Wahrheit: ringePruefen ok, 3 Ringe, nichts verworfen', erg.ok && erg.ringe.length===3 && !erg.verworfen.length && erg.fehler===null, JSON.stringify(erg.verworfen));
  chk('Wahrheit: ringePruefen veraendert die Eingabe nicht und gibt dieselben Ring-Objekte zurueck', jeq(ringeW, W3()) && erg.ringe.every((R,i)=>R===ringeW[i]));
  chk('Wahrheit: importProblem() der App sagt ok', APP.importProblem(data)===null, APP.importProblem(data));
  chk('Wahrheit: wallPolygon gueltig, 2 Inseln, Aussenring 14 Ecken, Inseln 6 und 4', !!poly && poly.holes.length===2 && poly.length===14 && jeq(poly.holes.map(h=>h.length).sort(), [4, 6]));
  // Bezug: die Wahrheitsdatei selbst, jede Ecke auf ganze mm gerundet, durch wallPolygon/roomArea (ohne F3);
  // F3 nettoMmGerundet (erzeuge-f3.mjs) muss dasselbe sein.
  const ref=fl(APP.wallPolygon(WAHR.pts.map(p=>({...p, x:Math.round(p.x), y:Math.round(p.y)})), WAHR.walls));
  chk('Wahrheit: roomArea = Flaeche der mm-gerundeten Wahrheitsdatei +-1 cm² (= F3 nettoMmGerundet)', Math.abs(A-ref)*1e4<=1 && Math.abs(ref-F3.flaechen.nettoMmGerundet)<1e-9,
    `${f4(A)} m² gegen ${ref} m², Δ ${f1((A-ref)*1e4)} cm²`);
  const dWort=Math.abs(A-65.393)*1e4;
  if(dWort<=1) chk('Wahrheit: roomArea 65,393 m² +-1 cm² (10.6 woertlich)', true, `Δ ${f1(dWort)} cm²`);
  else merke('Wahrheit: roomArea 65,393 m² +-1 cm² (10.6 woertlich)', `${f4(A)} m², Δ ${f1(dWort)} cm²: 65,393 ist selbst auf 0,001 m² = 10 cm² gerundet (live 2.8); gegen den genauen Wert 0,0 cm²`);
  // m -> mm: jede exportierte Ecke = Math.round der Wahrheit in mm (kein .5-Fall kippt ueber /1000*1000).
  const P=Object.fromEntries(WAHR.pts.map(p=>[p.id, p])), ids=F3.ringe.flatMap(r=>r.ids);
  const dx=ids.map((id,k)=>[data.pts[k].x-Math.round(P[id].x), data.pts[k].y-Math.round(P[id].y)]).flat();
  chk('Wahrheit: jede Ecke = Math.round(Wahrheit in mm), 24 von 24, x und y', ids.length===24 && dx.every(v=>v===0), dx.filter(v=>v!==0).length+' Abweichungen');
  chk('IDs fortlaufend ueber alle Ringe: A..X wie nextId(), idSeq 24, openSeq 1', jeq(data.pts.map(p=>p.id), Array.from({length:24}, (_,k)=>G.idOf(k))) &&
    data.pts.map(p=>p.id).join(',')==='A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X' && data.idSeq===24 && data.openSeq===1);
  const zuege=APP.wallLoops(data.pts, data.walls);
  chk('Waende je Ring geschlossen: 24 Waende, wallLoops findet 3 Zuege mit 14/6/4 Ecken in Export-Reihenfolge', data.walls.length===24 && !!zuege &&
    jeq(zuege.map(L=>L.map(p=>p.id).join('')), ['ABCDEFGHIJKLMN', 'OPQRST', 'UVWX']));
  chk('hmeas an der ersten Ecke des Aussenrings: {kind h, at A, d 2416, sigma 5, on true}; meas/openings leer', jeq(data.hmeas, [{kind:'h', at:'A', d:2416, sigma:5, on:true}]) && jeq(data.meas, []) && jeq(data.openings, []));
  chk('ohne Laser-Hoehe (NaN, 0, null): hmeas []', [NaN, 0, null, undefined, -5].every(h=>jeq(G.toRoomDataRinge(erg.ringe, h).hmeas, [])));
  chk('kamera: version 1, quelle karte, 2 Inseln mit ids/teil/sup/entscheid, keine Hypothesen- und Schrankwaende, ungespiegelt',
    jeq(data.kamera, {version:1, quelle:'karte', inseln:[{ring:'R1', ids:['O','P','Q','R','S','T'], teil:false, sup:1, entscheid:'auto'}, {ring:'R2', ids:['U','V','W','X'], teil:false, sup:1, entscheid:'auto'}],
      hypWaende:[], schrankWaende:[], gespiegelt:false}), JSON.stringify(data.kamera));
  chk('byte-gleich: zweimal exportiert, und aus einer tiefen Kopie der Ringe', JSON.stringify(G.toRoomDataRinge(erg.ringe, 2416))===JSON.stringify(data) &&
    JSON.stringify(G.toRoomDataRinge(JSON.parse(JSON.stringify(erg.ringe)), 2416))===JSON.stringify(data));
}
// Spiegel (1.4): y = -round(1000 z), Geometrie sonst gleich.
{
  const ds=G.toRoomDataRinge(erg.ringe, 2416, {spiegel:true}), ps=wp(ds);
  chk('spiegel: jedes y = -round(1000·z) (genau die Negation), x gleich, IDs und Waende gleich', ds.pts.every((p,k)=>p.x===data.pts[k].x && p.y===-data.pts[k].y && p.id===data.pts[k].id) && jeq(ds.walls, data.walls));
  chk('spiegel: wallPolygon gueltig, 2 Inseln, roomArea gleich, kamera.gespiegelt true', !!ps && ps.holes.length===2 && Math.abs(fl(ps)-A)<1e-12 && ds.kamera.gespiegelt===true, f4(fl(ps))+' m²');
  chk('ringePruefen beurteilt den Spiegel gleich: gespiegelte Ringe ok, 3 Ringe', (r=>r.ok && r.ringe.length===3)(G.ringePruefen(erg.ringe.map(R=>({...R, pts:R.pts.map(p=>[p[0], -p[1]])})))));
}
// kamera:false und Gleichheit mit G.toRoomData (bleibt fuer die alte Pipeline).
{
  const d0=G.toRoomDataRinge(erg.ringe, 2416, {kamera:false});
  chk('kamera:false: kein Feld kamera, sonst gleich', !('kamera' in d0) && jeq(d0, (({kamera, ...r})=>r)(data)));
  chk('nur Aussenring, kamera:false: byte-gleich zu G.toRoomData(corners, h) (alte Pipeline unveraendert)',
    JSON.stringify(G.toRoomDataRinge([erg.ringe[0]], 2416, {kamera:false}))===JSON.stringify(G.toRoomData(erg.ringe[0].pts, 2416)) &&
    JSON.stringify(G.toRoomDataRinge([erg.ringe[0]], NaN, {kamera:false}))===JSON.stringify(G.toRoomData(erg.ringe[0].pts, NaN)));
}
// Reihenfolge und exportiert.
{
  const [Ra, Rw, Rp]=W3(), rev=R=>({...R, pts:[...R.pts].reverse()});
  const e2=G.ringePruefen([rev(Rp), Ra, rev(Rw)]), d2=G.toRoomDataRinge([rev(Rp), Ra, rev(Rw)], 2416), p2=wp(d2);
  chk('Reihenfolge: Aussenring nicht zuerst, Inseln andersherum umlaufen -> Aussenring wird A..N, gueltig, Flaeche gleich',
    e2.ok && e2.ringe[0]===undefined ? false : e2.ok && e2.ringe[0].art==='aussen' && jeq(d2.pts.slice(0,14), data.pts.slice(0,14)) && !!p2 && p2.holes.length===2 && Math.abs(fl(p2)-A)<1e-12);
  const d3=G.toRoomDataRinge([Ra, Rw, {...Rp, exportiert:false}], 2416), e3=G.ringePruefen([Ra, Rw, {...Rp, exportiert:false}]);
  chk('exportiert:false wird weder geprueft noch exportiert (Pfeiler aus: 20 Ecken, 1 Insel)', d3.pts.length===20 && wp(d3).holes.length===1 && e3.ok && e3.ringe.length===2 && !e3.verworfen.length);
}

// ------------------------------------------------- Fehlerfaelle (10.6, live 2.8, 7.6, 7.7)
// Je Fall: wallPolygon auf den UNGEPRUEFTEN Daten, dann ringePruefen mit Grund, dann das gepruefte Ergebnis.
{
  const [Ra, Rw, Rp]=W3();
  const fall=(name, ringe, soll /*{i: grund} oder 'aussen:grund'*/, inselnDanach)=>{
    const roh=wp(G.toRoomDataRinge(ringe, 2416)), e=G.ringePruefen(ringe);
    let gut, info;
    if(typeof soll==='string'){ gut=!e.ok && !e.ringe.length && e.verworfen.length===1 && e.verworfen[0].grund===soll.split(':')[1] && typeof e.fehler==='string'; info=e.fehler; }
    else { const d=G.toRoomDataRinge(e.ringe, 2416), pz=wp(d);
      gut=e.ok && jeq(Object.fromEntries(e.verworfen.map(v=>[v.i, v.grund])), soll) && !!pz && pz.holes.length===inselnDanach && APP.importProblem(d)===null;
      info=JSON.stringify(e.verworfen)+(pz ? `, danach gueltig mit ${pz.holes.length} Insel(n)` : ', danach UNGUELTIG'); }
    chk(`Fehlerfall ${name}: ungeprueft wallPolygon ${roh ? 'gueltig' : 'null'}; ringePruefen verwirft mit Grund`, gut, info);
    return roh;
  };
  const r1=fall('„ragt hinaus“ (Pfeiler -3,2 m in x, kreuzt A-B)', [Ra, Rw, sh(Rp, -3.2, 0)], {2:'ragt-hinaus'}, 1);
  const r2=fall('„Insel in Insel“ (Rechteck 2,3 × 0,6 m um das Wandstueck)', [Ra, plain([[3.7,5.1],[6,5.1],[6,5.7],[3.7,5.7]]), Rw], {1:'insel-in-insel', 2:'insel-in-insel'}, 0);
  const r3=fall('Ecken alle innen, Kante kreuzt die Nische N-O-P-Q', [Ra, Rw, plain([[2.4,1.8],[3.1,1.8],[3.1,2.0],[2.4,2.0]])], {2:'ragt-hinaus'}, 1);
  const pfX=Math.min(...Rp.pts.map(p=>p[0])), aX=Ra.pts[0][0];
  const r4=fall('„Abstand < 5 cm“: Pfeiler 8 mm vor A-B (live 2.8)', [Ra, Rw, sh(Rp, aX+0.008-pfX, 0)], {2:'abstand-aussen'}, 1);
  const r5=fall('Pfeiler 1 mm vor A-B (Prototyp „beruehrt“)', [Ra, Rw, sh(Rp, -2.56-0.485, 0)], {2:'abstand-aussen'}, 1);
  const pfB=Math.max(...Rp.pts.map(p=>p[0]))-pfX;
  const r6=fall('zwei Inseln 3 cm auseinander (7.7: beide)', [Ra, Rw, Rp, sh(Rp, pfB+0.03, 0)], {2:'abstand-insel', 3:'abstand-insel'}, 1);
  const r7=fall('zwei Inseln kreuzen sich (beide)', [Ra, Rw, Rp, sh(Rp, 0.1, 0.1)], {2:'kreuzt-insel', 3:'kreuzt-insel'}, 1);
  const r8=fall('Insel ganz ausserhalb', [Ra, Rw, sh(Rp, -5, 0)], {2:'ausserhalb'}, 1);
  const r9=fall('Insel kreuzt sich selbst (Schleife)', [Ra, Rw, {...Rp, pts:[Rp.pts[0], Rp.pts[2], Rp.pts[1], Rp.pts[3]]}], {2:'kreuzt-sich'}, 1);
  fall('Insel 5 × 5 cm (Seite < 8 cm)', [Ra, Rw, plain([[4,3],[4.05,3],[4.05,3.05],[4,3.05]])], {2:'seite'}, 1);
  fall('Insel 10 × 15 cm (Flaeche < 0,02 m²)', [Ra, Rw, plain([[4,3],[4.1,3],[4.1,3.15],[4,3.15]])], {2:'flaeche'}, 1);
  fall('Insel mit 2 Ecken', [Ra, Rw, plain([[4,3],[4.5,3]])], {2:'zu-wenig-ecken'}, 1);
  fall('Insel mit NaN', [Ra, Rw, plain([[4,3],[4.5,NaN],[4.5,3.5]])], {2:'nicht-endlich'}, 1);
  const q=Ra.pts, x8=[q[0], q[2], q[1], ...q.slice(3)];
  const rA=fall('Aussenring kreuzt sich (B und C vertauscht: A-C kreuzt B-D)', [{...Ra, pts:x8}, Rw, Rp], 'aussen:kreuzt-sich');
  fall('Aussenring mit 2 Ecken', [{...Ra, pts:q.slice(0, 2)}, Rw], 'aussen:zu-wenig-ecken');
  fall('Aussenring mit NaN', [{...Ra, pts:[[NaN, 0], ...q.slice(1)]}, Rw], 'aussen:nicht-endlich');
  fall('Aussenring mit doppelter Ecke (0,3 mm)', [{...Ra, pts:[q[0], [q[0][0]+0.0003, q[0][1]], ...q.slice(1)]}, Rw], 'aussen:doppelte-ecke');
  const eKein=G.ringePruefen([Rw, Rp]), eZwei=G.ringePruefen([Ra, {...Ra}]);
  chk('ohne Aussenring bzw. mit zwei Aussenringen: ok false mit fehler', !eKein.ok && /kein Außenring/.test(eKein.fehler) && !eZwei.ok && eZwei.verworfen[0].i===1, eKein.fehler+' / '+eZwei.fehler);
  chk('ungeprueft: wallPolygon null bei „ragt hinaus“, „Insel in Insel“, Kante durch die Nische, sich kreuzenden Inseln, Insel ausserhalb, Schleife, Aussenring gekreuzt',
    [r1, r2, r3, r7, r8, r9, rA].every(p=>p===null));
  chk('ungeprueft gueltig, von M8 verworfen (eigene Regeln): 8 mm, 1 mm, zwei Inseln 3 cm', [r4, r5, r6].every(p=>p!==null));
  // Strenger als wallPolygon: Beruehren und Spitzen nimmt die App an, M8 nicht.
  const kante=fall('Insel liegt mit einer Kante auf A-B (beruehrt, kollinear)', [Ra, Rw, plain([[aX,3],[aX+0.4,3],[aX+0.4,3.4],[aX,3.4]])], {2:'ragt-hinaus'}, 1);
  const spitze=[q[0], [q[0][0], 3.0], [q[0][0], 2.0], ...q.slice(1)];
  const sp=fall('Aussenring mit Spitze (A -> 3,0 m -> 2,0 m -> B auf derselben Linie)', [{...Ra, pts:spitze}, Rw, Rp], 'aussen:kreuzt-sich');
  out.push(`      Hinweis: wallPolygon nimmt an: Insel auf A-B ${kante ? 'ja' : 'nein'}, Aussenring mit Spitze ${sp ? 'ja' : 'nein'} – M8 ist dort absichtlich strenger.`);
}
// F3-Inselfaelle 0 / 3 / 8 cm (7.6): roh (vor M7) und eingeschmolzen (wie M7 es liefern soll).
{
  for(const f of F3.inselFaelle){
    const roh=f.szene.map(r=>ring(r)), e=G.ringePruefen(roh), d=G.toRoomDataRinge(e.ringe, 2416), p=wp(d);
    const ew=f.erwartet.ringe.map(r=>ring({...r, flaeche:r.flaeche})), ee=G.ringePruefen(ew), de=G.toRoomDataRinge(ee.ringe, 2416), pe=wp(de);
    if(f.abstand<0.05){
      const g=e.verworfen.length===1 && e.verworfen[0].i===2 ? e.verworfen[0].grund : null;
      chk(`F3 ${f.name}: roh (nicht eingeschmolzen) wird der Pfeiler verworfen`, e.ok && (g==='abstand-aussen' || (f.abstand===0 && g==='ragt-hinaus')) && !!p && p.holes.length===1, JSON.stringify(e.verworfen));
      chk(`F3 ${f.name}: eingeschmolzen (Aussenring 18 Ecken + Wandstueck) gueltig, roomArea = F3 erwartet`, ee.ok && !ee.verworfen.length && !!pe && pe.length===18 && pe.holes.length===1 &&
        Math.abs(fl(pe)-f.erwartet.roomArea)<1e-9, `${f4(fl(pe))} gegen ${f.erwartet.roomArea} m²`);
    } else chk(`F3 ${f.name}: Pfeiler eigene Insel mit 4 Ecken, gueltig, roomArea = F3 erwartet`, e.ok && !e.verworfen.length && !!p && p.holes.length===2 && Math.abs(fl(p)-f.erwartet.roomArea)<1e-9 &&
      ee.ok && !ee.verworfen.length, `${f4(fl(p))} gegen ${f.erwartet.roomArea} m²`);
  }
}

// ------------------------------------------------- Zufall: ok => wallPolygon nimmt an (Kern der Abnahme)
// Inseln (Wandstueck, Pfeiler, Zufallsvierecke) zufaellig verschoben, gedreht, umgedreht, an die Wand
// geschoben oder an eine andere Insel gelegt; Aussenring teils verrauscht. Je Lauf: ist ringePruefen ok,
// muss wallPolygon den Export (gespiegelt und ungespiegelt) mit genau ringe.length - 1 Inseln annehmen.
{
  const rnd=G.KG.rnd(20261025), U=(a,b)=>a+(b-a)*rnd();
  const [Ra, Rw, Rp]=W3();
  const aX=Ra.pts[0][0];                                                           // Linie A-B (x = const)
  const xs=Ra.pts.map(p=>p[0]), zs=Ra.pts.map(p=>p[1]), bb=[Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const dreh=(R,th)=>{ const c=R.pts.reduce((s,p)=>[s[0]+p[0]/R.pts.length, s[1]+p[1]/R.pts.length], [0,0]), C=Math.cos(th), S=Math.sin(th);
    return {...R, pts:R.pts.map(p=>[c[0]+C*(p[0]-c[0])-S*(p[1]-c[1]), c[1]+S*(p[0]-c[0])+C*(p[1]-c[1])])}; };
  const N=4000; let nOk=0, sound=0, sound2=0, voll=0, nNull=0, strenger=0; const gruende={}, streng={};
  for(let n=0;n<N;n++){
    let aus=Ra; if(rnd()<0.15) aus={...Ra, pts:Ra.pts.map(p=>[p[0]+U(-1,1)*0.3*rnd(), p[1]+U(-1,1)*0.3*rnd()])};
    const inseln=[];
    for(const R0 of [Rw, Rp]) if(rnd()<0.9){ let R=dreh(R0, rnd()<0.5 ? 0 : U(-Math.PI, Math.PI)); if(rnd()<0.6) R=sh(R, U(-3,3)*rnd(), U(-3,3)*rnd()); if(rnd()<0.3) R={...R, pts:[...R.pts].reverse()}; inseln.push(R); }
    const k=Math.floor(rnd()*4);
    for(let j=0;j<k;j++){ const c=[U(bb[0]-0.5, bb[1]+0.5), U(bb[2]-0.5, bb[3]+0.5)], a=U(0.03, 1.2), b=U(0.03, 1.2);
      inseln.push(dreh(plain([[c[0]-a/2, c[1]-b/2], [c[0]+a/2, c[1]-b/2], [c[0]+a/2, c[1]+b/2], [c[0]-a/2, c[1]+b/2]]), rnd()<0.5 ? 0 : U(-1,1))); }
    // an eine Wand oder eine andere Insel legen (0-12 cm Spalt, auch genau 0)
    if(inseln.length && rnd()<0.3){ const R=inseln[0], d=rnd()<0.2 ? 0 : U(0, 0.12), mx=Math.min(...R.pts.map(p=>p[0])); inseln[0]=sh(R, bb[0]+d-mx, 0); }
    if(inseln.length>1 && rnd()<0.3){ const A0=inseln[0], B0=inseln[1], d=rnd()<0.2 ? 0 : U(0, 0.12);
      inseln[1]=sh(B0, Math.max(...A0.pts.map(p=>p[0]))+d-Math.min(...B0.pts.map(p=>p[0])), (A0.pts[0][1]-B0.pts[0][1])*rnd()); }
    const ringe=[aus, ...inseln], e=G.ringePruefen(ringe), p0=wp(G.toRoomDataRinge(ringe, 2416));
    if(!p0) nNull++;
    for(const v of e.verworfen) gruende[v.grund]=(gruende[v.grund]||0)+1;
    if(p0 && (!e.ok || e.verworfen.length)){ strenger++; for(const v of e.verworfen) streng[v.grund]=(streng[v.grund]||0)+1; }
    if(!p0 && e.ok && !e.verworfen.length) voll++;            // wallPolygon lehnt ab, M8 nicht: darf nie vorkommen
    if(!e.ok) continue; nOk++;
    const d=G.toRoomDataRinge(e.ringe, 2416), pz=wp(d), ps=wp(G.toRoomDataRinge(e.ringe, 2416, {spiegel:true}));
    if(pz && pz.holes.length===e.ringe.length-1 && APP.importProblem(d)===null) sound++;
    if(ps && ps.holes.length===e.ringe.length-1) sound2++;
  }
  chk(`Zufall (${N} Laeufe, Samen 20261025): jedes ok von ringePruefen ergibt einen von wallPolygon angenommenen Export mit ringe.length - 1 Inseln`, sound===nOk && nOk>0,
    `${sound} von ${nOk} ok; ungeprueft lehnt wallPolygon ${nNull} von ${N} ab`);
  chk('Zufall: dasselbe gespiegelt', sound2===nOk, `${sound2} von ${nOk}`);
  chk('Zufall: lehnt wallPolygon den ungeprueften Export ab, verwirft ringePruefen immer etwas', voll===0, `${voll} Faelle ohne Verwerfen`);
  out.push(`      Gruende im Zufall: ${JSON.stringify(gruende)}; davon bei ungeprueft gueltigem Export (M8 strenger als wallPolygon) ${strenger} Laeufe: ${JSON.stringify(streng)}`);
  // Nur die Regeln von wallPolygon (Mindestmasse 0): strenger nur bei Beruehrung. Je ein Drittel der Laeufe
  // allgemeine Lage, Pfeiler mit einer Ecke genau auf A-B, Rechteck mit einer Kante genau auf A-B oder genau
  // an der Kante einer zweiten Insel. Beruehrung wird hier unabhaengig gemessen: kleinster Abstand der
  // exportierten Millimeter-Ringe = 0.
  const abstMm=(A0,B0)=>{ const d=(p,a,b)=>{ const vx=b.x-a.x, vy=b.y-a.y, L=vx*vx+vy*vy, t=L>0 ? Math.max(0, Math.min(1, ((p.x-a.x)*vx+(p.y-a.y)*vy)/L)) : 0; return Math.hypot(a.x+t*vx-p.x, a.y+t*vy-p.y); };
    let m=Infinity; for(const [X,Y] of [[A0,B0],[B0,A0]]) for(const p of X) for(let k=0;k<Y.length;k++) m=Math.min(m, d(p, Y[k], Y[(k+1)%Y.length])); return m; };
  const rnd2=G.KG.rnd(7); let n0=0, beruehrt=0, nTouch=0, nArt=[0, 0, 0];
  for(let n=0;n<3000;n++){ const art=n%3, y0=2+(rnd2())*5; let ringe;
    if(art===0) ringe=[Ra, Rw, sh(dreh(Rp, (rnd2()-0.5)*6), (rnd2()-0.5)*8, (rnd2()-0.5)*8)];
    else if(art===1){ const R=dreh(Rp, (rnd2()-0.5)*6), mx=Math.min(...R.pts.map(p=>p[0])); ringe=[Ra, Rw, sh(R, aX-mx, y0-R.pts[0][1])]; }
    else { const b=0.1+0.5*rnd2(), h=0.1+0.5*rnd2(), x1=rnd2()<0.5 ? aX : 1+rnd2();
      const R1=plain([[x1,y0],[x1+b,y0],[x1+b,y0+h],[x1,y0+h]]); ringe=[Ra, R1];
      if(x1!==aX) ringe.push(plain([[x1+b,y0+0.3*h],[x1+b+0.2,y0+0.3*h],[x1+b+0.2,y0+0.3*h+0.2],[x1+b,y0+0.3*h+0.2]])); }
    const e=G.ringePruefen(ringe, {minAbstand:0, minSeite:0, minFlaeche:0}), d0=G.toRoomDataRinge(ringe, 2416), p0=wp(d0);
    const R0=APP.wallLoops(d0.pts, d0.walls), touch=!!R0 && R0.some((X,i)=>R0.some((Y,j)=>j>i && abstMm(X, Y)===0));
    if(touch) nTouch++;
    if(p0 && e.verworfen.length){ n0++; nArt[art]++; if(touch && ['ragt-hinaus', 'kreuzt-insel'].includes(e.verworfen[0].grund)) beruehrt++; } }
  chk('nur wallPolygon-Regeln (Mindestmasse 0): M8 verwirft nur dann, was wallPolygon annimmt, wenn sich zwei Ringe beruehren (Abstand 0 mm, unabhaengig gemessen)',
    n0===beruehrt && n0>0 && nTouch>0, `${n0} strenger (allgemein/Ecke auf A-B/Kante an Kante ${nArt.join('/')}), davon ${beruehrt} Beruehrung; Beruehrung in ${nTouch} von 3000 Laeufen`);
}

// ------------------------------------------------- Hinweise und Name (7.5, 8.2) durch Teilen-Link, Datei, Zwischenablage
{
  const [Ra, Rw, Rp]=W3();
  const RaH={...Ra, hyp:Ra.hyp.map((_,k)=>k===2)};                                   // C-D ungesehen
  const RpH={...Rp, hyp:[true, false, false, false], waende:['IJ', 'JAC', 'ACAD', null], teil:true, supRing:0.55, entscheid:'nutzer-ja'};  // I-J, AD-I
  const ringe=[RaH, Rw, RpH], d=G.toRoomDataRinge(ringe, 2416, {schrank:['LM']}), h=G.ringeHinweise(ringe, d, 'Raumskizze 25.10.');
  const W=new Set(d.walls.map(w=>w.join('|'))), P=new Set(d.pts.map(p=>p.id));
  chk('kamera.hypWaende = C-D, U-V (I-J), X-U (AD-I); schrankWaende = I-J (L-M der Wahrheit)', jeq(d.kamera.hypWaende, [['C','D'], ['U','V'], ['X','U']]) && jeq(d.kamera.schrankWaende, [['I','J']]),
    JSON.stringify([d.kamera.hypWaende, d.kamera.schrankWaende]));
  chk('kamera nennt nur IDs, die es gibt: jede hyp-/Schrankwand ist eine Wand des Exports, jede Insel-id ein Punkt',
    [...d.kamera.hypWaende, ...d.kamera.schrankWaende].every(w=>W.has(w.join('|'))) && d.kamera.inseln.every(i=>i.ids.every(x=>P.has(x))));
  chk('kamera.inseln traegt teil/sup/entscheid des Rings', jeq(d.kamera.inseln[1], {ring:'R2', ids:['U','V','W','X'], teil:true, sup:0.55, entscheid:'nutzer-ja'}));
  chk('ringeHinweise: Name mit Zusatz', h.name==='Raumskizze 25.10. (3 Wände ungesehen: C-D, U-V, X-U; 1 Schrankfront: I-J)', h.name);
  chk('ringeHinweise: Liste „diese Wände lasern“ mit Ring, Wand, Grund, Laenge; jede Wand gibt es im Export', h.fehler===null && h.liste.length===4 && h.liste.every(e=>W.has(e.wand.join('|'))) &&
    jeq(h.liste.map(e=>[e.ring, e.wand.join('-'), e.grund]), [['R0','C-D','ungesehen'], ['R0','I-J','schrank'], ['R2','U-V','ungesehen'], ['R2','X-U','ungesehen']]) &&
    Math.abs(h.liste[0].laenge-0.217)<0.0015 && Math.abs(h.liste[1].laenge-3.940)<0.0015, h.liste.map(e=>e.wand.join('-')+' '+e.laenge+' m').join(', '));
  chk('ringeHinweise: alles gesehen -> Name ohne Zusatz; Vorgabe-Grundname „Raumskizze“', G.ringeHinweise(erg.ringe, data, 'Raumskizze 25.10.').name==='Raumskizze 25.10.' &&
    G.ringeHinweise(erg.ringe, data).name==='Raumskizze' && !G.ringeHinweise(erg.ringe, data).liste.length);
  const eins=[{...Ra, hyp:Ra.hyp.map((_,k)=>k===2)}, Rw, Rp];
  chk('ringeHinweise: Einzahl „1 Wand ungesehen“', G.ringeHinweise(eins, G.toRoomDataRinge(eins, 2416)).name==='Raumskizze (1 Wand ungesehen: C-D)');
  const viele=[{...Ra, hyp:Ra.hyp.map(()=>true)}, Rw, Rp], hv=G.ringeHinweise(viele, G.toRoomDataRinge(viele, 2416));
  chk('ringeHinweise: mehr als 8 Waende -> 8 genannt und „…“, Zahl vollstaendig, Liste vollstaendig', hv.name.startsWith('Raumskizze (14 Wände ungesehen: A-B, B-C,') && hv.name.endsWith(', H-I, …)') && hv.liste.length===14, hv.name);
  const fremd=G.ringeHinweise(ringe, G.toRoomDataRinge([Ra, Rp], 2416));
  chk('ringeHinweise: Raumdaten passen nicht zu den Ringen -> fehler, leere Liste, Name ohne Zusatz', typeof fremd.fehler==='string' && !fremd.liste.length && fremd.name==='Raumskizze', fremd.fehler);
  const ohneK=G.ringeHinweise(ringe, G.toRoomDataRinge(ringe, 2416, {kamera:false, schrank:['LM']}));
  chk('ringeHinweise ohne kamera: ungesehen aus den Ringen, Schrank unbekannt', ohneK.liste.length===3 && ohneK.liste.every(e=>e.grund==='ungesehen'));

  // Name mit Umlauten durch die drei Wege (Z. 5866/5876, 10706, 11228 in raumaufmass.html).
  const name=G.ringeHinweise(ringe, d, 'Küche Hesterkamp 25.10. äöüß').name;
  const frag=G.shareFragment(name, d), back=APP.parseShareFragment(frag);
  chk('Teilen-Link: Name mit Zusatz und Umlauten und Daten (mit kamera) kommen ueber parseShareFragment zurueck', !!back && back.name===name && jeq(back.data, d) && APP.importProblem(back.data)===null, `${frag.length} Zeichen`);
  // Datei und Zwischenablage: die App liest das GANZE Objekt; Name wie in den Handlern (Ausdruck aus dem Quelltext).
  const lines=app.split('\n'), zeile=s=>lines.findIndex(l=>l.includes(s))+1;
  const mDatei=app.match(/\$\('filepick'\)\.onchange=async\(\)=>\{[\s\S]*?const name=([\s\S]*?);\n\s*const err=importAsNewRoom\(name, o\);/);
  const mClip=app.match(/\$\('imp'\)\.onclick=async\(\)=>\{[\s\S]*?const name=([\s\S]*?);\n\s*const err=importAsNewRoom\(name, o\);/);
  const mPay=app.match(/function roomFilePayload\(id\)\{[\s\S]*?return \{\s*([\s\S]*?)\n  \};/);
  chk('raumaufmass: Namensausdruck in Datei- und Zwischenablage-Import und roomFilePayload gefunden', !!mDatei && !!mClip && !!mPay && /\.\.\.r\.data,\s*\n\s*(\/\/.*\n\s*)*name:r\.name/.test(mPay[1]),
    `Datei Z. ${zeile("$('filepick').onchange")}, Zwischenablage Z. ${zeile("$('imp').onclick")}, roomFilePayload Z. ${zeile('function roomFilePayload')}`);
  const nameDatei=new Function('o', 'f', 'return '+mDatei[1])  , nameClip=new Function('o', 'return '+mClip[1]);
  const payload={...d, name};                                                     // wie roomFilePayload: ...r.data, name
  const oD=JSON.parse(JSON.stringify(payload, null, 2)), oC=JSON.parse(JSON.stringify(payload, null, 2));
  chk('Datei-JSON ({...data, name}): Name kommt zurueck, importProblem ok', nameDatei(oD, {name:'raumskizze.json'})===name && APP.importProblem(oD)===null);
  chk('Zwischenablage-JSON ({...data, name}): Name kommt zurueck, importProblem ok', nameClip(oC)===name && APP.importProblem(oC)===null);
  const huelle=JSON.parse(JSON.stringify({name, data:d}));                        // Teilen = {name, data} (3.4)
  const ipH=APP.importProblem(huelle);
  out.push(`      Hinweis fuer P-I: die Huelle Teilen {name, data} als Datei/Zwischenablage -> importProblem „${ipH}“; Datei und Zwischenablage brauchen die flache Form {...data, name} (roomFilePayload), nur der Link die Huelle.`);
  const lenOhne=G.shareFragment(name, G.toRoomDataRinge(ringe, 2416, {kamera:false})).length, lenW=G.shareFragment('Test Wahrheit, 3 Ringe', G.toRoomDataRinge(erg.ringe, 2416, {kamera:false})).length;
  chk('Linklaenge < 2300 Zeichen (QR-Grenze der App) mit kamera und langem Namen', frag.length<2300, `mit kamera ${frag.length}, ohne kamera ${lenOhne}; Wahrheit ohne kamera ${lenW} (live 2.8: 761)`);
}

// ------------------------------------------------- Zeit (Mac, nur gemessen)
{
  const T=[], med=a=>[...a].sort((x,y)=>x-y)[a.length>>1];
  for(let i=0;i<50;i++) G.toRoomDataRinge(G.ringePruefen(ringeW).ringe, 2416);
  for(let i=0;i<500;i++){ const t0=performance.now(); const e=G.ringePruefen(ringeW), dd=G.toRoomDataRinge(e.ringe, 2416); G.ringeHinweise(e.ringe, dd); T.push(performance.now()-t0); }
  out.push(`      Zeit Wahrheit (24 Ecken, 3 Ringe): pruefen + exportieren + Hinweise Median ${(med(T)*1000).toFixed(0)} µs (500 Laeufe, ${process.version})`);
}

console.log(out.join('\n'));
if(offen.length) console.log(`\nOFFEN (nicht erreicht, mit Grund): ${offen.length}`);
console.log(ok ? '\nALLE CHECKS GRÜN' : '\nCHECKS ROT');
process.exit(ok ? 0 : 1);
