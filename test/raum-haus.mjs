// Prüft raum-haus.js (Gliederung Gebäude › Geschoss › Raum) und die
// DOM-freien Bausteine der Raumzeile aus raeume.html (Block "zeile") in Node.
// Aufruf: node test/raum-haus.mjs
import {readFileSync} from 'node:fs';

const lies=f=>readFileSync(new URL('../'+f, import.meta.url),'utf8');
const html=lies('raeume.html');
const pick=id=>{
  const m=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`));
  if(!m) throw new Error(`Script-Block "${id}" nicht gefunden`);
  return m[1];
};
// Reihenfolge wie die <script>-Tags im Browser.
new Function(lies('raum-fremd.js')+'\n'+lies('raum-kern.js')+'\n'+lies('raum-speicher.js')
            +'\n'+lies('raum-haus.js')+'\n'+pick('zeile'))();

const out=[]; let ok=true;
const chk=(name,cond)=>{ if(!cond) ok=false; out.push((cond?'ok   ':'ROT  ')+name); };
const gleich=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

const speicher=()=>{
  const m=new Map();
  return {m, getItem:k=>m.has(k)?m.get(k):null, setItem:(k,v)=>{ m.set(k,String(v)); }, removeItem:k=>{ m.delete(k); }};
};
const K='raumaufmass.haus';
const raum=(id,name,shared)=>({id, name, data:{pts:[],walls:[],meas:[],shared:shared||{}}});
const form=g=>({b:g.gebaeude.map(B=>[B.name, B.geschosse.map(G=>[G.name, G.raeume.map(r=>r.id)])]), e:g.einzeln.map(r=>r.id)});

// ---------- verbunden ----------
{
  const V=globalThis.HAUS_FACTORY.verbunden;
  const A=raum('a','Küche',{'A|B':{room:'b',wall:['A','B']}});
  const B=raum('b','Flur',{'A|B':{room:'a',wall:['A','B']}, 'C|D':{room:'c',wall:['A','B']}});
  const C=raum('c','Bad');                                   // nur einseitig verwiesen
  const D=raum('d','Wintergarten');
  const E=raum('e','Keller',{'A|B':{room:'gibtsnicht',wall:['A','B']}, 'B|C':{room:'e',wall:['B','C']}});
  chk('verbunden: Kette über einseitigen Verweis ist eine Gruppe', gleich(V([A,B,C,D,E]), [['a','b','c']]));
  chk('verbunden: ohne shared keine Gruppe', V([C,D]).length===0);
  chk('verbunden: Verweis auf fehlenden Raum und auf sich selbst zählt nicht', V([D,E]).length===0);
  chk('verbunden: Müll wirft nicht', V(null).length===0 && V([null,{},{id:'x',data:{shared:'quatsch'}},{id:'y',data:{shared:{k:null}}}]).length===0);
}

// ---------- Erstbefüllung ----------
{
  const st=speicher(), H=globalThis.HAUS_FACTORY(st);
  chk('storageOk bei beschreibbarem Speicher', H.storageOk===true && !st.m.has(K+'.probe'));
  const A=raum('a','Küche',{'A|B':{room:'b',wall:['A','B']}});
  const B=raum('b','Flur',{'A|B':{room:'a',wall:['A','B']}});
  const C=raum('c','Wintergarten');
  // Liste neueste zuerst (wie STORE.list), Anlage a, b, c.
  const g0=H.gliederung([], ['a','b','c']);
  chk('leere Raumliste: nichts gefüllt, nichts geschrieben', g0.gebaeude.length===0 && g0.einzeln.length===0 && !st.m.has(K));
  const g=H.gliederung([C,B,A], ['a','b','c']);
  chk('Erstbefüllung: verbundene Räume in ein Erdgeschoss, Name vom zuerst angelegten Raum',
      gleich(form(g), {b:[['Küche',[['Erdgeschoss',['a','b']]]]], e:['c']}));
  chk('Erstbefüllung: Gliederung liefert die übergebenen Raumobjekte', g.gebaeude[0].geschosse[0].raeume[0]===A && g.einzeln[0]===C);
  chk('Erstbefüllung: geschrieben', st.m.has(K));
  // Zweites Laden füllt nicht erneut: ein gelöster Raum bleibt gelöst.
  chk('loese', H.loese('b')===true);
  const g2=H.gliederung([C,B,A], ['a','b','c']);
  chk('nach dem Lösen bleibt der Raum einzeln, auch wenn die Wand noch geteilt ist',
      gleich(form(g2), {b:[['Küche',[['Erdgeschoss',['a']]]]], e:['c','b']}));
}
{
  // Platzhalternamen taugen nicht als Gebäudename; zwei Gruppen, zwei Gebäude.
  const st=speicher(), H=globalThis.HAUS_FACTORY(st);
  const r=[raum('a','Mein erster Raum',{k:{room:'b'}}), raum('b','Flur'),
           raum('c','  ',{k:{room:'d'}}), raum('d','Bad'), raum('e','Haus',{k:{room:'f'}}), raum('f','Neuer Raum')];
  const g=H.gliederung(r);
  chk('Erstbefüllung: Platzhalter- und leere Namen werden „Gebäude“, doppelte gezählt',
      gleich(g.gebaeude.map(B=>B.name), ['Gebäude','Gebäude 2','Haus']) && g.einzeln.length===0);
  chk('Erstbefüllung ohne Anlagereihenfolge: Listenfolge gilt', gleich(g.gebaeude[0].geschosse[0].raeume.map(x=>x.id), ['a','b']));
}
{
  // Anlagereihenfolge schlägt Listenfolge.
  const st=speicher(), H=globalThis.HAUS_FACTORY(st);
  const g=H.gliederung([raum('n','Flur',{k:{room:'o'}}), raum('o','Küche')], ['o','n']);
  chk('Erstbefüllung: Name und Reihenfolge nach Anlage', gleich(form(g), {b:[['Küche',[['Erdgeschoss',['o','n']]]]], e:[]}));
}
{
  // Ohne Verbindungen: Schlüssel wird trotzdem angelegt (Erstbefüllung erledigt).
  const st=speicher(), H=globalThis.HAUS_FACTORY(st);
  const g=H.gliederung([raum('a','Küche'), raum('b','Bad')]);
  chk('ohne Verbindungen bleiben alle einzeln', gleich(form(g), {b:[], e:['a','b']}) && st.m.has(K));
  // Später geteilte Wand füllt nicht nach - das legt der Mensch fest.
  const g2=H.gliederung([raum('a','Küche',{k:{room:'b'}}), raum('b','Bad')]);
  chk('Erstbefüllung läuft nur einmal', g2.gebaeude.length===0);
}

// ---------- Zuordnen, Anlegen, Umbenennen ----------
{
  const st=speicher(), H=globalThis.HAUS_FACTORY(st);
  const R=['a','b','c','d'].map(id=>raum(id,id.toUpperCase()));
  H.gliederung(R);
  const n=H.neuesGebaeude('a');
  chk('neuesGebaeude: liefert ids, Standardname, Erdgeschoss', !!n && gleich(form(H.gliederung(R)), {b:[['Gebäude',[['Erdgeschoss',['a']]]]], e:['b','c','d']}));
  chk('ordneZu', H.ordneZu('b', n.geschoss)===true && gleich(form(H.gliederung(R)).b, [['Gebäude',[['Erdgeschoss',['a','b']]]]]));
  chk('ordneZu: unbekanntes Geschoss ändert nichts', H.ordneZu('c','gibtsnicht')===false && H.ort('c')===null);
  chk('ordneZu: schon dort, Platz bleibt', H.ordneZu('a', n.geschoss)===true && gleich(form(H.gliederung(R)).b[0][1][0][1], ['a','b']));
  const og=H.neuesGeschoss(n.gebaeude, 'b');
  chk('neuesGeschoss: Standardname Obergeschoss, Raum zieht um',
      typeof og==='string' && gleich(form(H.gliederung(R)).b, [['Gebäude',[['Erdgeschoss',['a']],['Obergeschoss',['b']]]]]));
  chk('neuesGeschoss: unbekanntes Gebäude', H.neuesGeschoss('gibtsnicht','c')===null && H.ort('c')===null);
  const o=H.ort('b');
  chk('ort', !!o && o.gebaeude.id===n.gebaeude && o.geschoss.id===og && o.geschoss.name==='Obergeschoss' && H.ort('zzz')===null);
  chk('benenneGebaeude / benenneGeschoss', H.benenneGebaeude(n.gebaeude,'  Hesterkamp ')===true && H.benenneGeschoss(og,'Dach')===true
      && gleich(form(H.gliederung(R)).b, [['Hesterkamp',[['Erdgeschoss',['a']],['Dach',['b']]]]]));
  chk('umbenennen: leerer Name und unbekannte id ändern nichts', H.benenneGebaeude(n.gebaeude,'   ')===false && H.benenneGeschoss('gibtsnicht','x')===false
      && H.gliederung(R).gebaeude[0].name==='Hesterkamp');
  // Drittes Geschoss: Erd- und Obergeschoss gibt es (umbenannt zählt nicht mehr).
  const g3=H.neuesGeschoss(n.gebaeude,'c');
  chk('neuesGeschoss: nächster freier Standardname', H.ort('c').geschoss.name==='Obergeschoss' && typeof g3==='string');
  const g4=H.neuesGeschoss(n.gebaeude,'d');
  chk('neuesGeschoss: danach „Geschoss“', H.ort('d').geschoss.name==='Geschoss');
  // Der letzte Raum zieht aus: Geschoss verschwindet, Gebäude bleibt.
  chk('leeres Geschoss verschwindet von selbst', H.ordneZu('b', g3)===true
      && gleich(form(H.gliederung(R)).b, [['Hesterkamp',[['Erdgeschoss',['a']],['Obergeschoss',['c','b']],['Geschoss',['d']]]]]));
  // Zweites Gebäude, dann alles heraus: Gebäude verschwindet.
  const n2=H.neuesGebaeude('d','Gartenhaus');
  chk('neuesGebaeude mit Namen; altes Geschoss von d verschwindet',
      gleich(form(H.gliederung(R)).b, [['Hesterkamp',[['Erdgeschoss',['a']],['Obergeschoss',['c','b']]]],['Gartenhaus',[['Erdgeschoss',['d']]]]]));
  chk('leeres Gebäude verschwindet von selbst', H.loese('d')===true && H.gliederung(R).gebaeude.length===1 && gleich(form(H.gliederung(R)).e, ['d']));
  // neuesGeschoss für den einzigen Raum eines Gebäudes: Gebäude bleibt, altes Geschoss geht.
  H.loese('c'); H.loese('b');
  const g5=H.neuesGeschoss(n.gebaeude,'a','Keller');
  chk('einziger Raum zieht in neues Geschoss: Gebäude bleibt', typeof g5==='string' && gleich(form(H.gliederung(R)).b, [['Hesterkamp',[['Keller',['a']]]]]));
  chk('ids bleiben eindeutig', new Set([n.gebaeude,n.geschoss,og,g3,g4,n2.gebaeude,n2.geschoss,g5]).size===8);
  chk('ungültige Raum-id', H.neuesGebaeude('')===null && H.neuesGebaeude(null)===null && H.ordneZu('', g5)===false && H.neuesGeschoss(n.gebaeude, 7)===null);
}

// ---------- Aufräumen beim Lesen ----------
{
  const st=speicher(), H=globalThis.HAUS_FACTORY(st);
  const R=['a','b','c'].map(id=>raum(id,id));
  H.gliederung(R);
  const n=H.neuesGebaeude('a','Haus'); H.ordneZu('b', n.geschoss); H.neuesGeschoss(n.gebaeude,'c','Oben');
  // Raum c gelöscht: verwaiste id und ihr Geschoss verschwinden, und zwar im Speicher.
  const g=H.gliederung([R[0],R[1]]);
  chk('verwaiste Raum-id wird beim Lesen entfernt', gleich(form(g), {b:[['Haus',[['Erdgeschoss',['a','b']]]]], e:[]})
      && !st.m.get(K).includes('"c"') && !st.m.get(K).includes('Oben'));
  // Leere Raumliste räumt nichts weg.
  const vorher=st.m.get(K);
  H.gliederung([]);
  chk('leere Raumliste lässt die Zuordnungen stehen', st.m.get(K)===vorher);
  // Alle Räume des Gebäudes weg.
  chk('Gebäude ohne Räume verschwindet beim Lesen', H.gliederung([R[2]]).gebaeude.length===0 && JSON.parse(st.m.get(K)).gebaeude.length===0);
}
{
  // Verbogener Schlüssel: doppelte Räume, kaputte Einträge, doppelte ids.
  const st=speicher();
  st.setItem(K, JSON.stringify({v:1, seq:1, gebaeude:[
    {id:'b1', name:'Haus', geschosse:[{id:'g7', name:'EG', raeume:['a','a',5,null,'b']}, {id:'g7', name:'', raeume:['a','c']}, 'quatsch', {raeume:'x'}]},
    null, {id:'b1', name:7, geschosse:[{id:'g2', raeume:['d']}]}, {id:'b9', geschosse:'nein'}]}));
  const H=globalThis.HAUS_FACTORY(st);
  const R=['a','b','c','d'].map(id=>raum(id,id));
  const g=H.gliederung(R);
  chk('verbogener Schlüssel: tolerant gelesen, Raum nur einmal',
      gleich(form(g), {b:[['Haus',[['EG',['a','b']],['Geschoss',['c']]]],['Gebäude',[['Geschoss',['d']]]]], e:[]}));
  const ids=g.gebaeude.flatMap(B=>[B.id, ...B.geschosse.map(G=>G.id)]);
  chk('verbogener Schlüssel: doppelte ids neu vergeben', new Set(ids).size===ids.length);
  const n=H.neuesGebaeude('d');
  chk('Zähler liegt nie hinter vorhandenen ids', !!n && !ids.includes(n.gebaeude) && !ids.includes(n.geschoss));
}
{
  // Unlesbarer Schlüssel zählt als fehlend: Erstbefüllung.
  const st=speicher(); st.setItem(K,'{kaputt');
  const H=globalThis.HAUS_FACTORY(st);
  const g=H.gliederung([raum('a','Küche',{k:{room:'b'}}), raum('b','Flur')]);
  chk('unlesbarer Schlüssel: Erstbefüllung', gleich(form(g), {b:[['Küche',[['Erdgeschoss',['a','b']]]]], e:[]}));
}
{
  // Speicher wirft beim Schreiben: nichts stürzt ab, Änderungen melden Misserfolg.
  const m=new Map();
  const H=globalThis.HAUS_FACTORY({getItem:k=>m.has(k)?m.get(k):null, setItem:()=>{ throw new Error('voll'); }, removeItem:()=>{}});
  const R=[raum('a','Küche',{k:{room:'b'}}), raum('b','Flur'), raum('c','Bad')];
  chk('nicht beschreibbar: storageOk falsch', H.storageOk===false);
  chk('nicht beschreibbar: Gliederung wird trotzdem geliefert', gleich(form(H.gliederung(R)), {b:[['Küche',[['Erdgeschoss',['a','b']]]]], e:['c']}));
  chk('nicht beschreibbar: Änderungen melden Misserfolg', H.neuesGebaeude('c')===null && H.loese('a')===false && H.benenneGebaeude('b1','x')===false);
}
{
  // Zusammenspiel mit dem echten Speicher (STORE_FACTORY) auf demselben Storage.
  const st=speicher(), S=globalThis.STORE_FACTORY(st), H=globalThis.HAUS_FACTORY(st);
  const a=S.create('Küche'), b=S.create('Flur'), c=S.create('Bad');
  S.save(a,{data:{pts:[],walls:[],meas:[],shared:{'A|B':{room:b,wall:['A','B']}}}});
  S.save(b,{data:{pts:[],walls:[],meas:[],shared:{'A|B':{room:a,wall:['A','B']}}}});
  const liste=()=>S.list().map(r=>S.load(r.id));
  const g=H.gliederung(liste(), S.allRooms().map(r=>r.id));
  chk('mit STORE: Erstbefüllung aus den echten Einträgen', gleich(form(g), {b:[['Küche',[['Erdgeschoss',[a,b]]]]], e:[c]}));
  S.remove(b);
  chk('mit STORE: gelöschter Raum fällt heraus', gleich(form(H.gliederung(liste())), {b:[['Küche',[['Erdgeschoss',[a]]]]], e:[c]}));
  chk('mit STORE: Raumschlüssel bleiben unberührt', st.m.has('raumaufmass.rooms') && !JSON.parse(st.m.get('raumaufmass.rooms')).some(r=>'haus' in r || 'geschoss' in r));
}

// ---------- Raumzeile (Block "zeile" aus raeume.html) ----------
{
  const Z=globalThis.RAUMZEILE;
  const quad={pts:[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}],
              walls:[['A','B'],['B','C'],['C','D'],['D','A']], meas:[{a:'A',b:'B',d:4000}]};
  const offen={pts:quad.pts.slice(0,3), walls:[['A','B'],['B','C']], meas:[]};
  const insel={pts:[...quad.pts, {id:'E',x:1000,y:1000},{id:'F',x:2000,y:1000},{id:'G',x:2000,y:2000},{id:'H',x:1000,y:2000}],
               walls:[...quad.walls, ['E','F'],['F','G'],['G','H'],['H','E']], meas:quad.meas};

  // Stand
  chk('stand: gespeicherter Stand good mit Fläche', gleich(Z.stand({area:29.449, stand:{tone:'good', text:'Geprüft ± 3,1 mm'}, data:quad}),
      {tone:'good', text:'Geprüft ± 3,1 mm · 29,45 m²'}));
  chk('stand: good ohne Fläche bleibt ohne', Z.stand({area:null, stand:{tone:'good', text:'Geprüft ± 3,1 mm'}, data:quad}).text==='Geprüft ± 3,1 mm');
  chk('stand: Fläche nur bei good', Z.stand({area:12, stand:{tone:'warn', text:'Noch 2 Maße'}, data:quad}).text==='Noch 2 Maße'
      && gleich(Z.stand({area:12, stand:{tone:'bad', text:'Ein Maß passt nicht: Strecke A–B'}, data:quad}), {tone:'bad', text:'Ein Maß passt nicht: Strecke A–B'}));
  chk('stand: unbekannter Ton wird Skizze, leerer Text zählt als fehlend', Z.stand({stand:{tone:'lila', text:'x'}, data:quad}).tone===''
      && Z.stand({area:12, stand:{tone:'good', text:'  '}, data:quad}).text==='12,00 m²');
  chk('stand fehlt, offen: Skizze, n Ecken', gleich(Z.stand({area:null, data:offen}), {tone:'', text:'Skizze, 3 Ecken'}));
  chk('stand fehlt, eine Ecke', Z.stand({data:{pts:[quad.pts[0]], walls:[], meas:[]}}).text==='Skizze, 1 Ecke');
  chk('stand fehlt, leer', gleich(Z.stand({data:{pts:[],walls:[],meas:[]}}), {tone:'', text:'Noch leer'}) && Z.stand({}).text==='Noch leer');
  chk('stand fehlt, geschlossen mit Fläche: nur die Fläche, offener Ring', gleich(Z.stand({area:12, data:quad}), {tone:'warn', text:'12,00 m²'}));
  chk('stand fehlt, geschlossen ohne Maß: Skizze', gleich(Z.stand({area:null, data:{...quad, meas:[]}}), {tone:'', text:'Skizze, 4 Ecken'}));
  chk('stand fehlt, geschlossen mit Maßen, ohne Fläche: nur zählen', gleich(Z.stand({area:null, data:quad}), {tone:'warn', text:'4 Ecken, 1 Maß'}));
  chk('stand: abgeschaltete Maße zählen nicht', Z.stand({area:null, data:{...quad, meas:[{a:'A',b:'B',d:4000,on:false}]}}).text==='Skizze, 4 Ecken');

  // Folgewerkzeuge
  chk('hat: nichts ohne Fliesen und Küche', gleich(Z.hat({data:quad}), {fliesen:false, kueche:false}) && gleich(Z.hat({}), {fliesen:false, kueche:false}));
  chk('hat: Fliesenplan erst mit verlegten Fliesen', Z.hat({data:{...quad, tiles:{spec:{set:[{}]}, items:[]}}}).fliesen===false
      && Z.hat({data:{...quad, tiles:{spec:{}, items:[{id:1}]}}}).fliesen===true);
  chk('hat: Küche erst mit Küchenteilen', Z.hat({data:{...quad, kitchen:{spec:{entry:'o1'}, items:[]}}}).kueche===false
      && Z.hat({data:{...quad, kitchen:{items:[{id:1,kind:'base'}]}}}).kueche===true);

  // Miniatur
  const m=Z.miniatur({area:12, data:quad});
  chk('miniatur: geschlossener Raum in Tinte, ein Zug, im Rahmen', m.skizze===false && (m.d.match(/M/g)||[]).length===1 && m.d.endsWith('Z')
      && m.d.match(/-?\d+(\.\d+)?/g).map(Number).every(v=>v>=3-1e-9 && v<=61+1e-9));
  const zahlen=m.d.match(/-?\d+(\.\d+)?/g).map(Number), xs=zahlen.filter((_,i)=>i%2===0), ys=zahlen.filter((_,i)=>i%2===1);
  chk('miniatur: Seitenverhältnis bleibt, mittig', Math.abs((Math.max(...xs)-Math.min(...xs))/(Math.max(...ys)-Math.min(...ys))-4/3)<0.02
      && Math.abs(Math.min(...xs)+Math.max(...xs)-64)<0.2 && Math.abs(Math.min(...ys)+Math.max(...ys)-44)<0.2);
  chk('miniatur: Insel als zweiter Zug (ausgespart über evenodd)', (Z.miniatur({area:11, data:insel}).d.match(/Z/g)||[]).length===2);
  const mo=Z.miniatur({area:null, data:offen});
  chk('miniatur: offener Zug gestrichelt, Wände einzeln, nicht geschlossen', mo.skizze===true && (mo.d.match(/M/g)||[]).length===2 && !mo.d.includes('Z'));
  chk('miniatur: ohne Stand gestrichelt, solange kein Maß die Form festlegt', Z.miniatur({area:null, data:{...quad, meas:[]}}).skizze===true
      && Z.miniatur({area:null, data:quad}).skizze===false);
  chk('miniatur: Stand Skizze gestrichelt, sonst Tinte', Z.miniatur({area:null, stand:{tone:'',text:'Skizze, 4 Ecken'}, data:quad}).skizze===true
      && Z.miniatur({area:null, stand:{tone:'warn',text:'Noch 2 Maße'}, data:quad}).skizze===false);
  chk('miniatur: Skizze zeichnet die eigene Zeichnung, wenn es sie gibt',
      Z.miniatur({stand:{tone:'',text:'Skizze'}, data:{...quad, sketch:quad.pts.map(p=>({...p, x:p.x*3}))}}).d!==Z.miniatur({stand:{tone:'',text:'Skizze'}, data:quad}).d
      && Z.miniatur({stand:{tone:'good',text:'Geprüft'}, data:{...quad, sketch:quad.pts.map(p=>({...p, x:p.x*3}))}}).d===Z.miniatur({stand:{tone:'good',text:'Geprüft'}, data:quad}).d);
  const leer=Z.miniatur({data:{pts:[],walls:[],meas:[]}});
  chk('miniatur: leerer Raum ohne Zeichnung', leer.d==='' && leer.ecken.length===0 && Z.miniatur({}).d==='');
  const eine=Z.miniatur({data:{pts:[{id:'A',x:5,y:5}],walls:[],meas:[]}});
  chk('miniatur: eine Ecke ohne Wand als Punkt in der Mitte', eine.d==='' && eine.ecken.length===1 && Math.abs(eine.ecken[0].x-32)<1e-9 && Math.abs(eine.ecken[0].y-22)<1e-9);
  chk('miniatur: Müll wirft nicht', (()=>{ try{
    Z.miniatur({data:{pts:[{id:'A',x:NaN,y:0},null,{id:'B',x:1,y:1}], walls:[['A','B'],['B','Z'],'x'], meas:'nein'}});
    Z.stand({data:{pts:'x', walls:null}}); Z.hat({data:{tiles:{items:'x'}, kitchen:7}}); return true; }catch(e){ return false; } })());

  // Zahlen und Text
  chk('fmt2: Dezimalkomma, zwei Stellen', Z.fmt2(65.3951)==='65,40' && Z.fmt2(7)==='7,00');
  chk('esc: Markup wird Text', Z.esc('<b a="1">&\'')==='&lt;b a=&quot;1&quot;&gt;&amp;&#39;');
}

console.log(out.join('\n'));
console.log(ok?'\nALLE CHECKS GRÜN':'\nCHECKS ROT');
process.exit(ok?0:1);
