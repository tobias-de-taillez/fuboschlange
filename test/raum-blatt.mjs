// Aufmaßblatt (raum-blatt.js): BLATT.html läuft ohne DOM, alle Wände stehen
// in der Wandliste, ein ungeprüfter oder nicht eindeutiger Raum lässt sich
// drucken, und BLATT.modell() liest einen echten Raum über die Rechenwege der
// Familie. Aufruf: node test/raum-blatt.mjs
import {readFileSync} from 'node:fs';
const lies=f=>readFileSync(new URL('../'+f, import.meta.url),'utf8');
let ok=true;
const chk=(n,c,i='')=>{ ok=ok&&!!c; console.log((c?'ok   ':'ROT  ')+n+(i!==''?'  ('+i+')':'')); };
const texte=svg=>[...svg.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
  .map(x=>x[1].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'));
const blaetterVon=h=>[...h.matchAll(/<article class="bl-blatt"[\s\S]*?<\/article>/g)].map(x=>x[0]);
const fm=mm=>(mm/1000).toFixed(3).replace('.',',');

// ---------- 1. Nur raum-blatt.js, kein DOM, kleines Beispielmodell von Hand ----------
new Function(lies('raum-blatt.js'))();
const BLATT=globalThis.BLATT;
chk('kein DOM im Test', typeof document==='undefined' && typeof window==='undefined');
chk('Schnittstelle', BLATT && typeof BLATT.css==='string' && ['modell','html','dokument','drucken'].every(k=>typeof BLATT[k]==='function'));
chk('CSS trägt das Präfix und Druckregeln', /\.bl-blatt\{/.test(BLATT.css) && /@media print/.test(BLATT.css)
  && !/(^|[\s,}])(body|html|\*)\s*\{/.test(BLATT.css));

// Rechteck 4 × 3 m mit einer Nische (kurze Wand E–F 0,16 m) und einer Wand ohne Länge.
const ansicht=(L, links, rechts, extra)=>({L, hMax:2500, gespiegelt:false, links:{id:links,h:2500,gemessen:false}, rechts:{id:rechts,h:2500,gemessen:false},
  top:[{x:0,y:2500},{x:L,y:2500}], knicke:[], hoehe:'angenommen', oeffnungen:[], anschluesse:[], ...(extra||{})});
const klein={
  name:'Bad <oben> & "Flur"', datum:'9.11.2026', drehung:0, hatFit:true, eindeutig:true, geprueft:true,
  stand:{tone:'good', text:'Geprüft · Messgenauigkeit ± 2,1 mm', eindeutig:true, geprueft:true, genauigkeit:2.1},
  ecken:[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:1200,y:3000},{id:'E',x:1200,y:2840},{id:'F',x:0,y:2840}],
  ringe:[['A','B','C','D','E','F']], geschlossen:true, flaeche:11.808, umfang:14, inseln:0, belastbar:true,
  hoeheAngenommen:true, hoeheStandard:2500,
  waende:[
    {a:'A',b:'B',ring:0,laenge:4000,gemessen:true,dicke:240,ansicht:ansicht(4000,'A','B',{
      oeffnungen:[{id:'o1',nr:1,anschluss:false,art:'door',name:'Tür',x:1500,xa:1500,y:0,w:885,h:2010,
        lage:{seitlich:'geschätzt',hoehe:'Boden'},geschaetzt:true,widerspruch:false,symbol:{typ:'turn',bandLinks:true,aussen:false}}],
      anschluesse:[{id:'w1',nr:2,anschluss:true,art:'water',name:'Wasser',x:3200,xa:3200,y:500,w:0,h:0}]})},
    {a:'B',b:'C',ring:0,laenge:3000,gemessen:true,dicke:null,ansicht:ansicht(3000,'B','C')},
    {a:'C',b:'D',ring:0,laenge:2800,gemessen:true,dicke:null,ansicht:ansicht(2800,'C','D')},
    {a:'D',b:'E',ring:0,laenge:160,gemessen:true,dicke:null,ansicht:ansicht(160,'D','E')},
    {a:'E',b:'F',ring:0,laenge:1200,gemessen:true,dicke:null,ansicht:ansicht(1200,'E','F')},
    {a:'F',b:'A',ring:0,laenge:null,gemessen:false,dicke:null,ansicht:null},
  ],
  masse:[{a:'A',b:'B',wand:true,d:4000,an:true,fix:false,abw:-2.14,geprueft:true,verdaechtig:false,vonNachbar:false},
         {a:'A',b:'C',wand:false,d:5003,an:false,fix:false,abw:null,geprueft:false,verdaechtig:false,vonNachbar:false},
         {a:'B',b:'C',wand:true,d:3000,an:true,fix:false,abw:0.4,geprueft:true,verdaechtig:true,vonNachbar:false}],
  hoehenMasse:[], lageMasse:[],
};
const h1=BLATT.html(klein, {mitMassliste:false});
const b1=blaetterVon(h1);
chk('html liefert Blätter ohne DOM', typeof h1==='string' && b1.length>=2, b1.length+' Blätter');
chk('je Blatt ein SVG im A4-Maß', b1.every(b=>(b.match(/<svg /g)||[]).length===1 && /viewBox="0 0 560 792"/.test(b)));
const t1=texte(b1[0]);
chk('Kopf: Raumname und "Aufmaßblatt · Datum"', t1.some(t=>t.startsWith('Bad <oben>')) && t1.includes('Aufmaßblatt · 9.11.2026'));
chk('Raumname ist maskiert', !h1.includes('<oben>') && h1.includes('&lt;oben&gt;'));
// Alle Wände stehen in der Wandliste, jede mit ihrer Länge oder "–".
const fehlt=klein.waende.filter(w=>{
  const i=t1.indexOf(w.a+'–'+w.b);
  return i<0 || t1[i+1]!==(w.laenge==null ? '–' : fm(w.laenge));
});
chk('alle Wände stehen mit Länge in der Wandliste', fehlt.length===0, fehlt.map(w=>w.a+'–'+w.b).join(' '));
chk('Fuß: Fläche, Umfang, Stand', t1.includes('11,81 m²') && t1.includes('14,00 m') && t1.includes('Geprüft ± 2,1 mm'));
chk('Maßstab steht am Grundriss', t1.some(t=>/^M 1:\d+$/.test(t)) && t1.includes('1 m'));
chk('Wand ohne Länge ist gestrichelt und ohne Zahl', /stroke-dasharray="3\.2 2\.6"/.test(b1[0]));
const tA=b1.slice(1).map(texte).flat().join(' | ');
chk('Wandansichten: Höhe angenommen, Lage geschätzt, Anschluss', /Höhe angenommen/.test(tA) && /Lage geschätzt/.test(tA) && /Wasser/.test(tA) && /Tür 885 × 2010 mm/.test(tA));
chk('kurze Wand in der kompakten Zeile, Wand ohne Länge genannt', /Kurze Wände unter 0,3 m/.test(tA) && /Ohne Länge/.test(tA));
chk('ohne Haken keine Maßliste', !b1.some(b=>/data-art="Maße"/.test(b)));
const b2=blaetterVon(BLATT.html(klein, {mitMassliste:true}));
const tM=texte(b2[b2.length-1]);
chk('mit Haken folgt das Blatt "Maße"', /data-art="Maße"/.test(b2[b2.length-1]) && b2.length===b1.length+1);
chk('Maße: Abweichung mit echtem Minus, abgeschaltet als "aus", verdächtig benannt',
  tM.includes('−2,1 mm') && tM.includes('aus') && tM.includes('verdächtig') && tM.includes('+0,4 mm'));

// Nicht eindeutig: Stand ausgewiesen, Fläche und Umfang "–".
const offen={...klein, eindeutig:false, geprueft:false, belastbar:false,
  stand:{tone:'', text:'Noch 2 Maße, dann ist die Form eindeutig.', eindeutig:false, geprueft:false}};
const tO=texte(blaetterVon(BLATT.html(offen))[0]);
chk('nicht eindeutig: Fläche und Umfang sind "–"', tO[tO.indexOf('Fläche')+1]==='–' && tO[tO.indexOf('Umfang')+1]==='–');
chk('nicht eindeutig: Stand steht im Wortlaut, kein Maßstab', tO.includes('Form nicht eindeutig') && tO.some(t=>t.includes('Noch 2 Maße')) && !tO.some(t=>/^M 1:/.test(t)));

// Leerer Raum und halbe Angaben werfen nicht.
let leer='';
try{ leer=BLATT.html({name:'Neu', datum:'9.11.2026', ecken:[], waende:[]}, {mitMassliste:true}); }catch(e){ leer='FEHLER '+e.message; }
chk('leerer Raum wirft nicht', blaetterVon(leer).length===2 && /Noch keine Ecke gesetzt/.test(leer), leer.slice(0,60));
let einzel='';
try{ einzel=BLATT.html({ecken:[{id:'A',x:5,y:5}], waende:[]}); }catch(e){ einzel='FEHLER '+e.message; }
chk('eine einzelne Ecke wirft nicht', blaetterVon(einzel).length===1 && !/NaN|Infinity|undefined/.test(einzel));
chk('nirgends NaN, Infinity oder undefined im Ergebnis', ![h1, b2.join(''), leer].some(s=>/NaN|Infinity|undefined/.test(s)));
const doc=BLATT.dokument(klein, {mitMassliste:true});
chk('Druckdokument: A4 hoch ohne Rand, nur die Blätter', /^<!doctype html>/.test(doc) && /@page\{size:A4 portrait;margin:0\}/.test(doc)
  && blaetterVon(doc).length===b2.length);

// ---------- 2. Echte Rechenwege: Kern, Geometrie, Modell und Blatt in einem Geltungsbereich ----------
const env=new Function('"use strict";\n'+lies('raum-kern.js')+'\n'+lies('raum-geometrie.js')+'\n'+lies('raum-modell.js')+'\n'+lies('raum-blatt.js')
  +'\nreturn {M, C:globalThis.CORE, BLATT:globalThis.BLATT};')();
const {M, C}=env, B=env.BLATT;
function lade(o){
  M.pts=o.pts.map(p=>({...p})); M.walls=o.walls.map(w=>[...w]); M.meas=o.meas.map(m=>({...m}));
  M.openings=(o.openings||[]).map(x=>({...x})); M.hmeas=(o.hmeas||[]).map(x=>({...x})); M.opmeas=(o.opmeas||[]).map(x=>({...x}));
  M.water=(o.water||[]).map(x=>({...x})); M.thick={...(o.thick||{})}; M.angs=[];
  if(M.pts.length>=2 && C.activeMeas(M.meas).length){ M.fit=C.solve(M.pts, M.meas, M.angs); M.an=C.analyze(M.fit.pts, M.meas, M.angs); }
  else { M.fit=null; M.an=null; }
  M.suspects=M.an ? globalThis.computeSuspects(M.an.w, 3.29, 0.02) : new Set();
}
const q4=[{id:'A',x:100,y:100},{id:'B',x:420,y:110},{id:'C',x:430,y:330},{id:'D',x:90,y:320}];
const w4=[['A','B'],['B','C'],['C','D'],['D','A']];
const mm=(a,b,d,x)=>({a,b,d,sigma:5,on:true,...(x||{})});

// Geprüft: Rechteck 4 × 3 m mit beiden Diagonalen, Tür, Wasser, gemessener Höhe.
lade({pts:q4, walls:w4, meas:[mm('A','B',4000),mm('B','C',3000),mm('C','D',4001),mm('D','A',2999),mm('A','C',5000),mm('B','D',5001)],
  hmeas:[{kind:'h',at:'A',d:2480,on:true}],
  openings:[{id:'o1',kind:'door',a:'A',b:'B',x:600,y:0,w:885,h:2010,swing:{type:'turn',hinge:'left',out:false}}],
  opmeas:[{id:'om1',op:'o1',edge:'left',d:600,sigma:5,on:true}], water:[{id:'w1',a:'B',b:'A',x:1000,y:500}]});
const r=B.modell({name:'Zimmer', datum:'9.11.2026'});
chk('modell: geprüft mit Genauigkeit', r.eindeutig && r.geprueft && r.stand.tone==='good' && r.stand.genauigkeit>0, r.stand.text);
chk('modell: Fläche und Umfang aus dem Ausgleich', r.belastbar && Math.abs(r.flaeche-12)<0.02 && Math.abs(r.umfang-14)<0.01, r.flaeche+' / '+r.umfang);
chk('modell: vier Wände mit Länge und Ansicht', r.waende.length===4 && r.waende.every(w=>w.laenge>2990 && w.ansicht && w.ansicht.hoehe==='gemessen'));
const ab=r.waende.find(w=>w.a==='A'&&w.b==='B').ansicht;
chk('modell: Tür eingemessen, Wasser von der anderen Ecke umgerechnet', ab.oeffnungen.length===1 && !ab.oeffnungen[0].geschaetzt
  && ab.anschluesse.length===1 && Math.abs(ab.anschluesse[0].xa-(ab.L-1000))<1e-6);
chk('modell: Ansicht von innen, linke und rechte Ecke gehören zur Wand', new Set([ab.links.id, ab.rechts.id]).size===2 && ['A','B'].includes(ab.links.id));
chk('modell: alle Maße mit Abweichung', r.masse.length===6 && r.masse.every(x=>x.an && Number.isFinite(x.abw)) && r.lageMasse.length===1 && r.hoehenMasse.length===1);
const tr=texte(blaetterVon(B.html(r, {mitMassliste:true}))[0]);
chk('echter Raum: alle Wände in der Wandliste', r.waende.every(w=>tr[tr.indexOf(w.a+'–'+w.b)+1]===fm(w.laenge)));

// Eindeutig, aber ungeprüft: fünf Maße.
lade({pts:q4, walls:w4, meas:[mm('A','B',4000),mm('B','C',3000),mm('C','D',4000),mm('D','A',3000),mm('A','C',5000)]});
const u=B.modell({name:'Zimmer', datum:'9.11.2026'});
chk('ungeprüft: Stand sagt es, Höhe angenommen', u.eindeutig && !u.geprueft && u.stand.tone==='warn' && u.hoeheAngenommen
  && texte(blaetterVon(B.html(u))[0]).includes('Ungeprüft'));

// Nicht eindeutig: zwei Maße. Nur die gemessenen Wände haben eine Länge.
lade({pts:q4, walls:w4, meas:[mm('A','B',4000),mm('B','C',3000)]});
const n=B.modell({name:'Zimmer', datum:'9.11.2026'});
chk('nicht eindeutig: Länge nur an gemessenen Wänden, Fläche nicht belastbar',
  !n.eindeutig && !n.belastbar && n.waende.filter(w=>w.laenge!=null).length===2 && n.waende.filter(w=>w.ansicht).length===2);

// Skizze ohne Maße, offener Wandzug; danach der leere Raum.
lade({pts:q4.slice(0,3), walls:[['A','B'],['B','C']], meas:[]});
const s=B.modell({name:'Flur', datum:'9.11.2026'});
chk('Skizze: keine Länge, keine Fläche, ein Blatt', !s.hatFit && s.waende.every(w=>w.laenge==null) && s.flaeche==null && blaetterVon(B.html(s)).length===1);
lade({pts:[], walls:[], meas:[]});
chk('leerer Raum: modell und html werfen nicht', blaetterVon(B.html(B.modell({name:'Neu', datum:'9.11.2026'}))).length===1);

// Der echte Raum aus der Beispieldatei: 11 Wände, eine eingemessene Schiebetür.
const wg=JSON.parse(lies('wintergarten-2026-08-02.json'));
lade(wg);
const g=B.modell({name:wg.name, datum:'9.11.2026'});
const hg=B.html(g, {mitMassliste:true}), tg=texte(blaetterVon(hg)[0]);
chk('Wintergarten: alle 11 Wände in der Wandliste', g.waende.length===11 && g.waende.every(w=>tg[tg.indexOf(w.a+'–'+w.b)+1]===(w.laenge==null?'–':fm(w.laenge))));
chk('Wintergarten: Fläche wie polyAreaM2 des Werkzeugs', g.flaeche>0 && Math.abs(g.flaeche-C.roomArea(C.wallPolygon(M.fit.pts, M.walls))/1e6)<1e-9, g.flaeche.toFixed(2)+' m²');
chk('Wintergarten: kein NaN im Blatt', !/NaN|Infinity|undefined/.test(hg));

// Maße streuen: eindeutig, mit Kontrollmaßen, aber nicht "gut" - das Feld im Fuß sagt es.
chk('Wintergarten: Stand im Fuß benennt die Streuung', g.stand.tone!=='warn' || tg.includes('Maße streuen auffällig'), g.stand.text);
const wieWerkzeug=B.modell({name:wg.name, datum:'9.11.2026', standInfo:()=>({tone:'warn', text:g.stand.text, eindeutig:true, geprueft:false})});
chk('standInfo ohne Kurzform: Streuung wird nicht zu "Ungeprüft"', wieWerkzeug.stand.kurz==='Maße streuen auffällig');

// Der Stand kommt aus standInfo() des Werkzeugs, wenn es sie gibt.
const mitInfo=B.modell({name:'X', datum:'9.11.2026', standInfo:()=>({tone:'bad', text:'Ein Maß passt nicht: A–B weicht 40 mm ab.', eindeutig:true, geprueft:false})});
chk('standInfo des Werkzeugs hat Vorrang; bei Widerspruch keine Fläche', mitInfo.stand.tone==='bad' && !mitInfo.belastbar
  && texte(blaetterVon(B.html(mitInfo))[0]).includes('Widerspruch in den Maßen'));

// ---------- 3. Drucken: Rückgaben, mit nachgestelltem Dokument ----------
chk('drucken ohne Browser meldet es, statt zu werfen', B.drucken({modell:klein}).ok===false);
let gedruckt=0, geschrieben='';
const rahmen={style:{}, setAttribute(){}, remove(){}, isConnected:true,
  contentWindow:{document:{open(){}, write(t){ geschrieben=t; }, close(){}}, addEventListener(){}, focus(){}, print(){ gedruckt++; }}};
globalThis.document={getElementById:()=>null, createElement:()=>rahmen, body:{appendChild(){}}};
const d1=B.drucken({modell:klein, mitMassliste:true});
chk('drucken: eigener Rahmen, nur die Blätter', d1.ok && d1.weg==='rahmen' && gedruckt===1 && d1.blaetter===b2.length
  && blaetterVon(geschrieben).length===b2.length && !/<script/.test(geschrieben));
globalThis.window={open:()=>null};
const d2=B.drucken({modell:klein, fenster:true});
chk('drucken: blockiertes Pop-up kommt als Text zurück', d2.ok===false && d2.grund==='popup' && /Pop-ups/.test(d2.text) && d2.fehler===d2.text);
const d3=B.drucken({modell:{...klein, ecken:[], waende:[]}});
chk('drucken: leerer Raum kommt als Text zurück', d3.ok===false && d3.grund==='leer' && !!d3.text);
delete globalThis.document; delete globalThis.window;

console.log(ok?'\nALLE CHECKS GRÜN':'\nCHECKS ROT'); process.exit(ok?0:1);
