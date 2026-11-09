// raum-modell.js – der offene Raum der Werkzeugfamilie: das Modell M, sein
// Weg in den Speicher und zurück (serialize, deserialize, importProblem),
// Rückgängig-Stapel und Ecken-IDs. Unverändert aus dem früheren Block "ui"
// von raumaufmass.html.
// Braucht: raum-kern.js, raum-geometrie.js, raum-speicher.js sowie TILES
// und KITCHEN (Fliesen- und Küchendaten bleiben am Raum).
// Erwartet vom Werkzeug, das diese Datei lädt (erst beim Aufruf, nicht beim
// Laden): opMeasSeq, recompute, render, syncOrthoBtn, syncSnapfitBtn.
// Greift beim Aufruf auf raum-zeichnung.js zu: VIEW, userView.
"use strict";
// Kurzname für den Rechenkern (raum-kern.js).
const C=globalThis.CORE;

// M.chain: letzter Punkt des aktiven Zeichenzugs. Tippen legt Ecken an und
// verbindet sie sofort - den Raum "ablaufen" statt Punkte- und Wandmodus zu
// jonglieren. null = kein Zug aktiv.
const M={ pts:[], walls:[], meas:[], mode:'draw', sel:[], chain:null,
          // Zieht sich die Skizze auf die ausgeglichene Form? Standard: nein.
          // Siehe den Ausrichten-Knopf und den Rueckschrieb in recompute().
          snapfit:false,
          // Maßhaltig geschieht von selbst, sobald die Form eindeutig ist
          // (recompute setzt dann snapfit). snapOff: der Mensch hat das
          // abgeschaltet. glide: laufendes Gleiten in die gemessene Form.
          snapOff:false, glide:null,
          // Rechte Winkel annehmen (orthoFit): Ecken innerhalb ORTHO_TOL von
          // 90 Grad werden gesetzt, sofern die Messungen es zulassen.
          ortho:false, orthoInfo:null,
          fit:null, an:null, sugg:[], suspects:new Set(), narrow:[],
          drag:null, dragMode:null, highlight:null, nearPairs:[],
          openings:[], hmeas:[], opmeas:[], wallSel:null, openSel:null,
          // Wasseranschlüsse (Meldung M-20261109-150408-6c7165): Punkte an
          // der Wand, KEINE Öffnungen (die schneiden Fliesen und sperren
          // Schränke). {id, a, b, x ab Ecke a, y über Boden} in mm.
          water:[], waterSel:null,
          // Wanddicke und geteilte Wand haengen an der Wand, aber Waende
          // sind ueberall im Programm Paare [a,b] - eine Karte ueber
          // pairKey ist dasselbe, ohne jede Zeile umzuschreiben, die
          // [a,b] auseinandernimmt. pairKey sortiert, die Dicke ist also
          // unabhaengig von der Zeichenrichtung.
          thick:{}, shared:{}, nbchecks:[],
          // Querstrecken durch eine Tuer in den Nachbarraum. GETRENNT von
          // M.meas wie hmeas und opmeas: der Grundriss-Solver dieses Raums
          // darf sie nie als eigene Strecke lesen - ihr zweiter Punkt liegt
          // gar nicht in diesem Raum.
          qmeas:[], quer:[], querHl:null, nahwaende:[], ring:[],
          // Festgelegte Eckwinkel {a,c,b,deg}. Getrennt von meas wie hmeas:
          // alles, was meas liest, erwartet eine Strecke a-b-d.
          angs:[] };

// Laufende Nummer für die IDs der Öffnungen; wird mit dem Raum gespeichert.
let openSeq=1;

// Schluessel einer Wand, richtungsunabhaengig - fuer M.thick und M.shared.
const wallKey=(a,b)=>[a,b].sort().join('|');

// Die Punkte, die der Nutzer SIEHT und anfasst. Mit Ausrichten die
// ausgeglichene Form, ohne sie die Skizze, wie sie angelegt wurde; waehrend
// eines Zugs immer die Skizze, sonst haengt der gezogene Punkt eine Iteration
// hinterher. Ausdruecklich NICHT dasselbe wie "was die Messungen beweisen" -
// Flaeche, Wandlaengen, Oeffnungslagen und Vorschlaege lesen weiter direkt
// M.fit.pts, damit Kontroll- und Fehlerlinien in beiden Stellungen stimmen.
const GLIDE_MS=420;
const viewPts=()=>{
  // Gleiten: für einen Augenblick liegen die sichtbaren Ecken zwischen der
  // Skizze und der gemessenen Form.
  if(M.glide && !M.drag && M.fit){
    const k=(performance.now()-M.glide.t0)/GLIDE_MS;
    if(k<1){
      const e=1-Math.pow(1-k,4), F=M.glide.from;
      return M.fit.pts.map((p,i)=>{
        const f=(F[i] && F[i].id===p.id) ? F[i] : (F.find(q=>q.id===p.id) || p);
        return {id:p.id, x:f.x+(p.x-f.x)*e, y:f.y+(p.y-f.y)*e};
      });
    }
    M.glide=null;
  }
  return (M.drag || !M.snapfit) ? M.pts : (M.fit ? M.fit.pts : M.pts);
};
// Fuer Zahlen (Flaeche, Laengen): der Ausgleich, solange es einen gibt.
const fitPts=()=>(M.fit && M.fit.pts) ? M.fit.pts : M.pts;

// Ein Zustand ist genau das, was der Nutzer eingegeben hat: Punkte, Waende,
// Messungen. Fit und Analyse werden daraus jederzeit neu gerechnet und
// gehoeren deshalb nicht hinein.
const serialize=()=>JSON.stringify({
  // pts ist das AUFMASS, nicht die Zeichnung. Andere Raeume lesen genau dieses
  // Feld, um ihre Lage im Gebaeude abzuleiten (ankopplung nimmt data.pts von
  // Eltern und Kind), und daraus kommen Wandlaengen und Flaeche. Steht
  // Ausrichten aus, sind Skizze und Aufmass verschiedene Formen - dann gehoert
  // hier die ausgeglichene hin, sonst baut das Gebaeude auf Handstrichen.
  pts:(M.fit?M.fit.pts:M.pts).map(p=>({id:p.id,x:p.x,y:p.y})),
  // Die Zeichnung gehoert nur DIESEM Raum und kommt beim Oeffnen und beim
  // Rueckgaengig zurueck. Mit Ausrichten an ist sie mit dem Aufmass identisch
  // und wird weggelassen - fehlt das Feld, ist das Aufmass die Zeichnung, und
  // damit verhalten sich aeltere Raeume und Fremdimporte wie bisher.
  sketch:M.snapfit ? undefined : M.pts.map(p=>({id:p.id,x:p.x,y:p.y})),
  walls:M.walls.map(w=>[...w]),
  meas:M.meas.map(m=>({...m})),
  openings:M.openings.map(o=>({...o})),
  water:M.water.length ? M.water.map(w=>({...w})) : undefined,
  hmeas:M.hmeas.map(m=>({...m})),
  opmeas:M.opmeas.map(m=>({...m})),
  thick:{...M.thick}, shared:{...M.shared},
  snapfit:M.snapfit,
  snapOff:M.snapOff || undefined,
  ortho:M.ortho || undefined,
  qmeas:M.qmeas.map(m=>({...m})),
  angs:M.angs.length ? M.angs.map(g=>({...g})) : undefined,
  // Fliesenverlegung - fehlt bei Raeumen ohne Fliesen ganz.
  tiles:(M.tiles && (M.tiles.spec.set || M.tiles.items.length || M.tiles.joints.length || (M.tiles.wallJoints||[]).length)) ? M.tiles : undefined,
  // Küche - fehlt, solange nichts geplant und nichts umgestellt ist.
  kitchen:(M.kitchen && !globalThis.KITCHEN.isEmpty(M.kitchen)) ? M.kitchen : undefined,
  idSeq, openSeq,
});
function deserialize(o){
  // Die eigene Zeichnung, falls es eine gibt; sonst ist das Aufmass zugleich
  // die Zeichnung (aeltere Raeume, Fremdimporte, Ausrichten an). Die Ecken
  // muessen dieselben sein - zeigten Zeichnung und Messungen auf verschiedene
  // Punkte, wirft recompute() bei jedem Bild. Lieber das Aufmass zeichnen als
  // einer kaputten Skizze glauben.
  const skizze = Array.isArray(o.sketch) && o.sketch.length===o.pts.length
    && o.sketch.every((p,i)=>p && p.id===o.pts[i].id
         && typeof p.x==='number' && typeof p.y==='number')
    ? o.sketch : o.pts;
  M.pts=skizze.map(p=>({...p}));
  M.walls=o.walls.map(w=>[...w]);
  M.meas=o.meas.map(m=>({...m}));
  // Oeffnungen sind optional: aeltere Raeume und Fremdimporte haben sie
  // nicht, und ein fehlendes Feld darf kein Fehler sein.
  M.openings=Array.isArray(o.openings) ? o.openings.map(x=>({...x})) : [];
  // Wasseranschlüsse: optional, kaputte fallen einzeln weg.
  M.water=Array.isArray(o.water) ? o.water.filter(w=>w && typeof w.a==='string' && typeof w.b==='string' && w.a!==w.b && Number.isFinite(w.x) && Number.isFinite(w.y))
    .map((w,i)=>({id:typeof w.id==='string'&&w.id ? w.id : 'w'+(i+1), a:w.a, b:w.b, x:w.x, y:Math.max(0,w.y)})) : [];
  M.waterSel=null;
  // Hoehen liegen BEWUSST getrennt von den Grundriss-Messungen: der
  // Solver darf sie nie als Strecke lesen (jacobian erwartet a/b).
  M.hmeas=Array.isArray(o.hmeas) ? o.hmeas.map(x=>({...x})) : [];
  M.opmeas=Array.isArray(o.opmeas) ? o.opmeas.map(x=>({...x})) : [];
  // Lagemass-IDs: Zaehler aus den Daten nachziehen, doppelte und unplausible
  // (Markup aus Datei oder Link, Zahlen) neu vergeben.
  opMeasSeq=globalThis.normOpMeasIds(M.opmeas, typeof opMeasSeq==='number'?opMeasSeq:1);
  // Wie die Oeffnungen optional: aeltere Raeume und Fremdimporte kennen
  // weder Dicke noch geteilte Wand.
  M.thick=(o.thick && typeof o.thick==='object') ? {...o.thick} : {};
  M.shared=(o.shared && typeof o.shared==='object') ? {...o.shared} : {};
  M.qmeas=Array.isArray(o.qmeas) ? o.qmeas.map(x=>({...x})) : [];
  // Festgelegte Winkel: optional, kaputte Eintraege fallen einzeln weg.
  M.angs=Array.isArray(o.angs) ? o.angs.filter(g=>g && g.a && g.b && g.c && isFinite(g.deg)).map(g=>({...g})) : [];
  // Fliesen: optional, fehlerhafte Eintraege fallen einzeln weg.
  M.tiles=globalThis.TILES.normTiles(o.tiles);
  // Küche: optional wie die Fliesen, kaputte Teile fallen einzeln weg.
  M.kitchen=globalThis.KITCHEN.normKitchen(o.kitchen);
  // Alte Stände ohne Bezugsecken: bisheriger Rahmen (erste Wand) wird fest.
  globalThis.KITCHEN.anchorFrame(M.kitchen, M.pts, M.walls);
  // Gehoert zum Raum, nicht zur Sitzung: ein fertig eingemessener Raum darf
  // ausgerichtet bleiben, waehrend der naechste frisch skizziert wird. Aeltere
  // Raeume und Fremdimporte kennen das Feld nicht - Standard ist aus.
  M.snapfit = o.snapfit===true;
  M.snapOff = o.snapOff===true; M.glide=null;
  M.ortho = o.ortho===true;
  if(typeof o.idSeq==='number') idSeq=o.idSeq;
  if(typeof o.openSeq==='number') openSeq=o.openSeq;
  else openSeq=M.openings.length+1;
  // Öffnungs-ids, die keine sind (präparierte Datei oder Link), neu vergeben
  // und die Verweise darauf mitziehen. Gültige Räume bleiben unverändert.
  // Numerische ids (Fremdimport) werden Strings - die Eingangs-Auswahl und
  // die data-Attribute liefern Strings, verglichen wird strikt.
  {
    const r=globalThis.normOpeningIds(M.openings, openSeq);
    if(r.map.size) openSeq=r.seq;
    globalThis.remapOpeningRefs(M, r.map);
  }
  M.sel=[]; M.chain=null; M.drag=null; M.fit=null; M.an=null;
  M.wallSel=null; M.openSel=null;
  // Hier, nicht bei den Aufrufern: deserialize() ist der EINZIGE Weg, auf dem
  // M.snapfit von aussen gesetzt wird - Raumwechsel, Import UND Rueckgaengig.
  // Am Aufrufer haengend log der Knopf nach einem Undo (nachgestellt: Modell
  // false, aria-pressed true).
  syncSnapfitBtn();
  if(typeof syncOrthoBtn==='function') syncOrthoBtn();
}

// Formvalidierung fuer alles, was deserialize() bekommt - VOLLSTAENDIG und
// VOR jeder Zustandsaenderung. deserialize() ersetzt M.pts/M.walls/M.meas
// nacheinander und wirft mittendrin, wenn die Form nur oberflaechlich
// geprueft wurde - der Zustand waere dann halb ersetzt, ohne dass irgendwo
// eine Meldung erscheint. Gibt die erste gefundene Unstimmigkeit als Text
// zurueck, sonst null.
function importProblem(o){
  if(!o || typeof o!=='object') return 'Datenstruktur fehlt.';
  if(!Array.isArray(o.pts)) return 'pts fehlt oder ist keine Liste.';
  if(!Array.isArray(o.walls)) return 'walls fehlt oder ist keine Liste.';
  if(!Array.isArray(o.meas)) return 'meas fehlt oder ist keine Liste.';
  const ids=new Set();
  for(const p of o.pts){
    if(!p || typeof p!=='object') return 'pts enthält einen Eintrag ohne Objektform.';
    if(typeof p.id!=='string' || !p.id) return 'pts enthält eine Ecke ohne gültige id.';
    if(!Number.isFinite(p.x) || !Number.isFinite(p.y))
      return `Ecke ${p.id}: x/y müssen endliche Zahlen sein.`;
    if(ids.has(p.id)) return `Ecke ${p.id} kommt mehrfach vor.`;
    ids.add(p.id);
  }
  for(const w of o.walls){
    if(!Array.isArray(w) || w.length!==2 || typeof w[0]!=='string' || typeof w[1]!=='string')
      return 'walls enthält einen Eintrag, der nicht aus genau zwei IDs besteht.';
    if(!ids.has(w[0]) || !ids.has(w[1]))
      return `Wand ${w[0]}–${w[1]} verweist auf eine unbekannte Ecke.`;
  }
  for(const m of o.meas){
    if(!m || typeof m!=='object') return 'meas enthält einen Eintrag ohne Objektform.';
    if(!ids.has(m.a) || !ids.has(m.b))
      return `Maß ${m.a}–${m.b} verweist auf eine unbekannte Ecke.`;
    if(!Number.isFinite(m.d) || !(m.d>0))
      return `Maß ${m.a}–${m.b}: d muss eine Zahl größer 0 sein.`;
    // sigma ist optional - fehlt es, greift SIGMA_DEF (siehe analyze()). Ist es
    // aber da, muss es eine echte, positive Zahl sein: sigma:0 ergaebe in
    // analyze() eine Division durch 0 und damit ein literales Infinity in der
    // w-Spalte. null/undefined zaehlen als "fehlt", nicht als ungueltiger Wert.
    if(m.sigma!=null && (!Number.isFinite(m.sigma) || !(m.sigma>0)))
      return `Maß ${m.a}–${m.b}: σ muss, wenn angegeben, eine Zahl größer 0 sein.`;
  }
  return null;
}

const UNDO_MAX=60;
const undoStack=[];
// Wiederherstellen: was Rueckgaengig zuruecknimmt, landet hier. Jede neue
// Aenderung (pushSnapshot) verwirft den Stapel - ein Zweig ohne Zukunft.
const redoStack=[];
function pushSnapshot(s){
  undoStack.push(s);
  if(undoStack.length>UNDO_MAX) undoStack.shift();
  redoStack.length=0;
}
// Vor jeder Aenderung aufrufen, nicht danach - der Stapel haelt den Zustand
// VOR dem Schritt, sonst macht das erste Undo nichts.
function snapshot(){ pushSnapshot(serialize()); }
function undo(){
  if(!undoStack.length) return false;
  redoStack.push(serialize());
  restoreSnapshot(undoStack.pop());
  return true;
}
function redo(){
  if(!redoStack.length) return false;
  undoStack.push(serialize());
  restoreSnapshot(redoStack.pop());
  return true;
}
// Wo ein offener Zug weiterlaeuft, wenn deserialize() ihn beendet hat: an
// seinem freien Ende. vor ist die Ecke, an der er lief, davor sind ihre
// Nachbarn von vorhin. Nimmt der Schritt die Ecke mit, geht es an der Ecke
// davor weiter; hat er sie nicht beruehrt, bleibt der Zug dort. Sonst gilt
// bei einer einzelnen Ecke diese und bei einem offenen Zug mit zwei Enden
// das spaetere - die erste Ecke bleibt das Ziel, das den Raum schliesst.
// null: Raum geschlossen oder kein eindeutiges freies Ende.
function zugEnde(vor, davor){
  if(C.wallPolygonRing(M.pts, M.walls)) return null;
  const grad=id=>M.walls.filter(w=>w.includes(id)).length;
  const frei=M.pts.map(p=>p.id).filter(id=>grad(id)<2);
  if(vor!=null){
    if(!M.pts.some(p=>p.id===vor)){ const d=davor.find(id=>frei.includes(id)); if(d!=null) return d; }
    else if(frei.includes(vor) && grad(vor)===davor.length) return vor;
  }
  if(frei.length===1) return frei[0];
  return frei.length===2 && grad(frei[0])===1 && grad(frei[1])===1 ? frei[1] : null;
}
function restoreSnapshot(json){
  // deserialize() raeumt die Auswahl - beim Undo einer Messung soll das
  // Popup aber offen bleiben, sonst verliert man nach jedem Schritt den
  // Kontext. Auswahl zurueckholen, falls es sie noch gibt.
  const wandVor=M.wallSel, offenVor=M.openSel;
  // Ebenso der Zeichenzug: wo er lief und von welcher Ecke er dorthin kam.
  const zugVor=M.chain, zugDavor=M.walls.filter(w=>w.includes(zugVor)).map(w=>w[0]===zugVor ? w[1] : w[0]);
  const eckenVor=M.pts.length;
  deserialize(JSON.parse(json));
  if(wandVor && M.walls.some(([a,b])=>a===wandVor.a&&b===wandVor.b)) M.wallSel=wandVor;
  if(offenVor && M.openings.some(o=>o.id===offenVor)) M.openSel=offenVor;
  // In der Skizze laeuft der Zug nach Rueckgaengig und Wiederherstellen
  // weiter, sonst setzte der naechste Klick eine lose Ecke ohne Wand. Lief
  // keiner, nimmt ihn nur ein Schritt auf, der Ecken bringt oder nimmt, und
  // nur ohne Masse: nach Esc oeffnet der Klick auf eine Wand weiter ihre
  // Karte, und ein vermessener Raum darf offen bleiben, ohne dass jeder
  // Schritt zurueck den Zug aufnimmt.
  if(M.mode==='draw' && (zugVor!=null || (M.pts.length!==eckenVor && !M.meas.length))) M.chain=zugEnde(zugVor, zugDavor);
  // deserialize() loescht M.fit - recompute() hielte das fuer eine neue
  // Szene und passte die Kamera neu ein. Rueckgaengig laesst die Ansicht.
  const viewVor={...VIEW};
  recompute();
  VIEW=viewVor; userView=true;
  render();
  return true;
}

// --- Punkt-IDs: A..Z, dann AA, AB, ...
// Der Zaehler laeuft monoton und wird beim Loeschen NICHT zurueckgesetzt.
// Waere er an M.pts.length gebunden, ergaebe "A,B,C anlegen, B loeschen,
// neuer Punkt" wieder ein C - und zwei Punkte haetten dieselbe ID.
let idSeq=0;
function nextId(){
  let i=idSeq++, s='';
  do{ s=String.fromCharCode(65+i%26)+s; i=Math.floor(i/26)-1; }while(i>=0);
  return s;
}
// Umkehrung von nextId(): aus einer ID die urspruengliche laufende Nummer
// zurueckrechnen (bijektive Basis-26, A=0). Fuer den Import gebraucht: nach
// einer Luecke ist o.pts.length keine verlaessliche Naeherung fuer idSeq mehr.
function idOrdinal(id){
  let n=0;
  for(const ch of String(id)) n=n*26+(ch.charCodeAt(0)-64);
  return n-1;
}

// Der offene Raum in der Raumliste (STORE): seine id und sein Name.
let currentRoom=null;
let currentRoomName='—';   // gecacht: renderPanel laeuft je Frame und darf nicht je Bild die ganze Bibliothek aus dem Storage parsen

// Flaeche des aktuellen Fits in m2 - fuer die Bibliotheksliste beim
// Speichern mitgerechnet, damit die Liste ohne Solver-Laeufe rendert.
function polyAreaM2(){
  if(!M.fit) return null;
  const P=M.fit.pts;
  const poly=C.wallPolygon(P, M.walls);
  if(!poly) return null;
  return C.roomArea(poly)/1e6;              // abzueglich Inseln
}
