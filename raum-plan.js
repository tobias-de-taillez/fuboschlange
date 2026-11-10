// raum-plan.js – die Seite der Werkzeugfamilie: was jedes Werkzeug (Raumaufmaß, Fliesenplan,
// Küchenplaner) gleich macht. Die Anmeldung der Werkzeuge (meldeAn), Zeichnen und Panel-Schale, Zeigerführung
// (Ziehen, Pinch, Rad), Tasten, Rückgängig, Hinweiszeile und Rückmeldung am Ort (sag), Raum öffnen und
// sichern, Menü, Datei, Link und QR, der Abgleich zweier Fenster und der Boot (starteSeite).
// Wörtlich aus dem früheren Block "ui" von raumaufmass.html (scripts/umzug-plan.mjs); kennt kein Werkzeug,
// sondern ruft es über die Anmeldung.
// Braucht: die Kerne und geteilten Dateien (raum-kern.js … raum-zeichnung.js). Ein Werkzeug lädt diese Datei
// danach, meldet sich an und ruft zuletzt starteSeite().
"use strict";
// Ausgelagert in geteilte Dateien (docs/adr/0001-familie-mit-geteilten-js-dateien.md):
//   raum-modell.js    C, M, wallKey, viewPts, fitPts, serialize, deserialize,
//                     importProblem, Rückgängig-Stapel, nextId, currentRoom, polyAreaM2
//   raum-zeichnung.js $, INK, CANVAS_FONT, cv, ctx, DPR, VIEW, userView, toScr, toWorld,
//                     evDev, fitView, sizeCanvas, drawGrid, drawScalebar und die
//                     Zeichenbausteine des Grundrisses
// Der frühere Block "core" ist raum-kern.js, "store" ist raum-geometrie.js und
// raum-speicher.js, "vendor" ist raum-fremd.js.

// ================= UI-Konstanten =================
// Schwellwerte fuer die Ausreisser-Markierung in renderPanel(): markiert wird
// nicht mehr eine einzelne "schlimmste" Messung, sondern alle Messungen, die
// gleichzeitig (a) ueberhaupt statistisch auffaellig sind und (b) nahe genug
// am groessten w im Feld liegen, um mathematisch gleich verdaechtig zu sein.
// Bei Redundanz 1 sind alle w z.B. mathematisch gleich gross (w_i = |c|/sigma_i
// fuer jedes i - eine Identitaet, kein Zufall; die tatsaechlich berechneten
// Werte weichen nur durch Rundung/Konvergenzrauschen minimal voneinander ab,
// daher TIE_TOL statt exaktem Vergleich), bei einem perfekten Fit sind alle w
// exakt 0. Eine einzelne "Gewinnerin" waere dort reiner Rundungsstaub.
// Siehe task-11-report.md.
const BAARDA_W0 = 3.29; // Baardas kritischer Wert fuer Data Snooping - erst darueber gilt eine Messung ueberhaupt als Ausreisser
const TIE_TOL   = 0.02;
const ORTHO_TOL = 2;    // Grad: so nah an 90 muss eine Ecke liegen, damit "90°" sie setzen darf // Toleranzband ums groesste w (2% relativ): alles darin gilt als gleich verdaechtig statt durch Rundung getrennt

// Bei redundancy===0 ist jedes Residuum strukturell exakt 0 - ABER nur, wenn
// die Messungen zueinander passen. Widersprechen sie sich (z.B. ein Zahlendreher),
// kann der Fit nicht alle gleichzeitig erfuellen und verteilt den Widerspruch
// als grosse Residuen ueber das Netz. w ist hier ueberall null, also gibt es
// keinen normierten Test - aber ein Residuum von mehreren sigma ist unter
// normalem Messrauschen praktisch ausgeschlossen und beweist damit einen
// Widerspruch in den Daten, unabhaengig von jeder Redundanz. Verglichen wird
// je Messung gegen ihr EIGENES sigma.
const GROSS_ERROR_SIGMA = 5; // Vielfaches von sigma, ab dem ein Residuum nicht mehr als Messrauschen erklaerbar ist

// Bei kleiner Redundanz verschmiert ein grober Fehler ueber alle Messungen,
// ohne dass ein einzelnes w Baardas Schwelle reisst (gemessen: 50 mm Fehler
// im 6-Messungen-Rechteck -> sigmaHat 15,5 mm, aber alle w < 3). Ob das
// Netz als Ganzes stimmt, entscheidet deshalb der Chi-Quadrat-Globaltest
// (globalTestFails im store-Block) - ein fester sigmaHat-Faktor uebersah,
// dass sigmaHat mit jeder Wiederholung sinkt, waehrend der Fehler bleibt.
const netFails=()=>{
  if(!M.an || !(M.an.redundancy>0)) return false;
  const act=C.activeMeas(M.meas);
  // Festgelegte Werte mit ihrem kleinen sigma (sigma/FIX_WT), die Winkelzeilen
  // stehen in vc schon gewichtet in mm und zaehlen mit SIGMA_DEF - genau so
  // gingen sie in den Ausgleich ein.
  const vc=M.an.vc||[];
  return globalTestFails(M.an.v.concat(vc),
    act.map(m=>(m.sigma??C.SIGMA_DEF)/(m.fix?C.FIX_WT:1)).concat(vc.map(()=>C.SIGMA_DEF)),
    M.an.redundancy);
};

// Festgelegte Werte, die der Ausgleich NICHT einhalten kann: zwei davon
// widersprechen sich, oder alle uebrigen Maesse ziehen gemeinsam dagegen.
// Grenze 1 mm, auch fuer Winkel: als Versatz quer zum kuerzeren Schenkel.
// Eine Gradgrenze meldete an der 4-mm-Stufe der Dusche einen Widerspruch fuer
// 0,15 Grad - das sind dort 0,01 mm. Am Meterschenkel sind 1 mm 0,06 Grad.
const FIX_TOL_MM=1;
function fixVerletzt(){
  if(!M.an || !M.fit) return [];
  const out=[], act=C.activeMeas(M.meas), P=M.fit.pts;
  // Je Paar einmal - zwei festgelegte Werte derselben Strecke sind der
  // haeufigste Fall und sollen nicht doppelt dastehen.
  const paar=new Map();
  act.forEach((m,i)=>{ if(m.fix && Math.abs(M.an.v[i])>FIX_TOL_MM){
    const k=[m.a,m.b].sort().join('|');
    paar.set(k, Math.max(paar.get(k)||0, Math.abs(M.an.v[i])));
  } });
  paar.forEach((v,k)=>{ const [a,b]=k.split('|');
    out.push({txt:`${a}–${b} um ${v.toFixed(1).replace('.',',')} mm`, a, b}); });
  const I=C.idx(P);
  C.angleRows(P, M.angs).forEach(g=>{
    const ist=C.angleDeg(P, g);
    const leg=Math.min(C.dist(P[I[g.a]],P[I[g.c]]), C.dist(P[I[g.b]],P[I[g.c]]));
    if(Math.abs(ist-g.deg)*Math.PI/180*leg>FIX_TOL_MM)
      out.push({txt:`Winkel ${g.c} ${fmtGrad(ist)}° statt ${fmtGrad(g.deg)}°`, c:g.c});
  });
  return out;
}
const TAP_SLOP = 4;      // mehr Bewegung als das: kein Klick mehr, sondern Zug

// Plattform. Kuerzel heissen auf dem Mac ⌘ und ⌥, sonst Strg und Alt.
// Strg+Klick ist auf dem Mac ein Rechtsklick und taugt dort nicht als
// Modifier - deshalb nennt jeder Text auf dem Mac nur ⌘.
const IS_MAC=/mac/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '');
// Texte sind mit "⌘/Strg", "⌘" und "⌥" geschrieben; plat() setzt sie fuer
// die laufende Plattform um.
function plat(s){
  if(s==null) return s;
  s=String(s).replace(/⌘\/Strg|Strg\/⌘/g,'⌘');
  if(IS_MAC) return s.replace(/Strg\+?/g,'⌘').replace(/\bAlt\b/g,'⌥').replace(/\bEntf\b/g,'⌫');
  return s.replace(/⌘\+?/g,'Strg+').replace(/Strg\+(?=[\s:·,.)\/]|$)/g,'Strg').replace(/⌥/g,'Alt');
}
let swim=null;         // laufende Fahrt zum Nachbarraum

function autofit(){
  const P=viewPts();
  // Zu kleine oder noch nicht angeschlossene Zeichenflaeche: die Ansicht
  // NICHT anfassen. fitView zieht sonst den Rand von der Breite ab und
  // liefert einen negativen Massstab - daran ist der Boot schon einmal
  // gestorben (ctx.ellipse mit IndexSizeError).
  if(cv.width<200 || cv.height<200) return;
  if(!P.length){ VIEW={s:1,ox:cv.width/2,oy:cv.height/2,rot:VIEW.rot}; return; }
  // Aufgeklappte Waende stehen bis zu UNFOLD_MAX der Wandhoehe nach aussen - sie
  // gehoeren in die Bounding-Box, sonst ragen sie aus dem Bild. Ueber den
  // Rand zu rechnen waere zirkulaer (Rand braucht den Massstab, den er
  // selbst bestimmt) und lieferte einen negativen Massstab.
  let auf=0;
  if(ALLE.some(w=>w.aufgeklappt && w.aufgeklappt()) && M.openings.length){
    const H=cornerHeights(P, M.hmeas);
    auf=Math.max(...Object.values(H).map(x=>x.h), 0)*UNFOLD_MAX;
  }
  // Der Wandkoerper steht IMMER nach aussen, nicht nur beim Aufklappen -
  // sonst schneidet der Bildrand die Aussenkante ab.
  auf=Math.max(auf, Math.max(THICK_DEFAULT, ...Object.values(M.thick||{})));
  // Im Raumaufmaß mehr Luft: oben liegen Maßstab und Einpassen, unten der
  // Melde-Knopf, und die Karten brauchen Platz neben den Wänden.
  VIEW=fitView(P, VIEW.rot, auf, TOOL==='aufmass' ? 150*DPR() : 0);
}
// Zoom um einen festen Bildpunkt (Geraetepixel): der Weltpunkt darunter
// bleibt liegen.
function zoomAt(dx,dy,f){
  VIEW.s*=f;
  VIEW.ox=dx+(VIEW.ox-dx)*f;
  VIEW.oy=dy+(VIEW.oy-dy)*f;
  userView=true;
}
// Die AKTIVE Ansicht: im Wände-Modus die Wandansicht (WV), sonst der Plan.
// Rad, Pinch, Leertaste, Mitteltaste und Einpassen wirken immer auf die,
// die man sieht - frueher zoomte das Rad in der Wandansicht den
// unsichtbaren Plan, und zurueck im Plan war die Ansicht verstellt.
function viewZoomAt(x,y,f){
  if(!(f>0) || !isFinite(f)) return;
  const werk=werkzeug();
  if(werk && werk.zoom && werk.zoom(x,y,f)) return;
  const s=VIEW.s*f;
  if(s<1e-3 || s>40) return;             // Weltmeter bis Millimeterpapier, mehr nicht
  zoomAt(x,y,f);
}
function viewPanBy(dx,dy){
  const werk=werkzeug();
  if(werk && werk.pan && werk.pan(dx,dy)) return;
  VIEW.ox+=dx; VIEW.oy+=dy; userView=true;
}
function fitActiveView(){
  const werk=werkzeug();
  if(!(werk && werk.einpassen && werk.einpassen())){ userView=false; autofit(); }
  render();
}

// Welches Werkzeug der Familie diese Seite gerade ist: 'aufmass' (Skizze,
// Maße, Wände, Ausgabe), 'fliesen' oder 'kueche'. Siehe setTool().
let TOOL='aufmass';
// Freiheitsgrade beim vorigen Rechnen: daran erkennt recompute den Moment,
// in dem die Form eindeutig WIRD (und nur dann gleitet der Plan).
let lastDof={room:null, dof:Infinity};
// Die Form des Raums rechnen: Winkel, Ausgleich, Vorschläge, Verdächtige, Öffnungen.
// Kennt weder Panel noch Zeichenfläche (bis auf den Schalter für „Ausrichten“
// und die Gleitanimation); Rückgängig und alle Werkzeuge der Familie gehen darüber.
function rechneRaum(){
  const hadFit=!!M.fit;
  // Ecke der Küchen-Bezugsecken gelöscht: freie Teile im noch alten Fit auf
  // eine verbleibende Wand umrechnen, sie bleiben, wo sie stehen. Hier nur
  // umhängen, nie neu festlegen - nach einer Umordnung wäre walls[0] falsch.
  const KF=M.kitchen && M.kitchen.frame;
  if(KF && !(M.pts.some(p=>p.id===KF.a) && M.pts.some(p=>p.id===KF.b)))
    globalThis.KITCHEN.anchorFrame(M.kitchen, M.pts, M.walls, M.fit && M.fit.pts);
  // Ein festgelegter Winkel gehoert zu einer Ecke aus genau zwei Waenden.
  // Kommt eine dritte Wand dazu, faellt eine weg oder wird die Wand geteilt,
  // gilt er nicht mehr - und liesse sich im Ecken-Popup auch nicht mehr
  // loesen. Undo bringt ihn zusammen mit der Wand zurueck (ein Snapshot).
  M.angs=M.angs.filter(g=>{ const k=cornerOf(g.c);
    return k && ((k.a===g.a&&k.b===g.b) || (k.a===g.b&&k.b===g.a)); });
  if(M.pts.length>=2 && C.activeMeas(M.meas).length){
    if(M.ortho && M.walls.length){
      const r=C.orthoFit(M.pts, M.walls, M.meas, ORTHO_TOL, M.angs);
      M.fit=r.fit; M.orthoInfo=r;
    } else { M.fit=C.solve(M.pts, M.meas, M.angs); M.orthoInfo=null; }
    M.an=C.analyze(M.fit.pts, M.meas, M.angs);
    const I=C.idx(M.pts);
    // Maßhaltig von selbst: solange die Form nicht eindeutig ist, bleibt die
    // Skizze liegen (man verliert sich sonst beim Messen); sobald sie es ist,
    // zeigt der Plan die gemessene Form. Abschaltbar über M.snapOff.
    const soll=!M.snapOff && M.an.dof===0;
    if(soll!==M.snapfit){
      if(soll && lastDof.room===currentRoom && lastDof.dof>0 && !matchMedia('(prefers-reduced-motion:reduce)').matches)
        M.glide={from:M.pts.map(p=>({id:p.id,x:p.x,y:p.y})), t0:performance.now()};
      M.snapfit=soll; if(typeof syncSnapfitBtn==='function') syncSnapfitBtn();
    }
    lastDof={room:currentRoom, dof:M.an.dof};
    if(M.snapfit){
      // Skizze auf den Fit ziehen: solve() liefert frische Punkte in mm, M.pts
      // bliebe sonst auf Klick-Pixeln stehen, waehrend render/hit/autofit ab
      // hier M.fit.pts zeigen. Ziehen und Neuanlage schreiben aber immer in
      // M.pts - ohne Angleich liefen beide Arrays auseinander.
      lageHalten(M.fit.pts, M.pts);
      M.fit.pts.forEach(fp=>{ const p=M.pts[I[fp.id]]; if(p){ p.x=fp.x; p.y=fp.y; } });
    } else {
      // Ausrichten aus: die FORM der Skizze bleibt unangetastet, aber die
      // EINHEIT muss mitgehen. Sonst stuende M.pts weiter auf Klick-Pixeln,
      // waehrend M.fit.pts in Millimetern rechnet - dieselbe Divergenz wie
      // oben, nur andersherum. scaleSketch ist ein reiner Massstab: jeder
      // Punkt behaelt seinen Platz in der Zeichnung, der Zahlenbereich passt
      // sich an. Der Faktor laeuft ueber die Durchgaenge gegen 1.
      C.scaleSketch(M.pts, M.meas).forEach(sp=>{
        const p=M.pts[I[sp.id]]; if(p){ p.x=sp.x; p.y=sp.y; }
      });
    }
  } else { M.fit=null; M.an=null; lastDof={room:currentRoom, dof:Infinity}; }
  // Mit der ersten Messung springen die Koordinaten von Skizzenpixeln auf
  // Millimeter (scaleSketch) - eine gemerkte Nutzer-Ansicht zeigte dann ins
  // Leere. Neue Szene, neue Einpassung.
  if(!hadFit && M.fit) userView=false;
  // Einmal je Aenderung, nicht je Bild: suggest() ruft intern analyze() je
  // Kandidat auf, im Zug waere das ein Ruckeln.
  M.sugg = (M.an && M.pts.length>=3)
    // BEWUSST der Fit, nicht viewPts(): ob zwei Ecken einander sehen, ist eine
    // Frage an den echten Raum. Die Skizze darf verzerrt sein - dann schlaegt
    // sie Strecken vor, die es in Wirklichkeit nicht gibt.
    // Abgefangen: ein Fehler in den Vorschlaegen darf nie Speichern und
    // Zeichnen mitnehmen (sonst ist ab da jede Aenderung beim Neuladen weg).
    ? (()=>{ try{ return C.suggest(M.fit?M.fit.pts:M.pts, M.walls, M.meas, M.angs); }catch(e){ console.error(e); return []; } })() : [];
  // Einmal je Aenderung berechnet, von Tabelle UND Plan konsumiert - die
  // Indizes zaehlen ueber activeMeas, wie an.w selbst.
  M.suspects = M.an ? computeSuspects(M.an.w, BAARDA_W0, TIE_TOL) : new Set();
  // Eingemessene Oeffnungen an ihre Messungen ziehen - auch beim LADEN,
  // sonst zeigt die App eine Lage, die den eigenen Messwerten
  // widerspricht (browser-gesehen: 1220 gespeichert, 1200 gemessen).
  // Messungen schlagen Ziehen; ohne Messung bleibt die Lage unberuehrt.
  // Gemessen schlaegt auch geschaetzt: eine nur geschaetzt gesetzte Oeffnung
  // im Weg weicht aus (settleOpening). Bei einem Widerspruch bleibt alles
  // liegen; der Stand der Oeffnung und das Blatt nennen ihn.
  // Bis nichts mehr rueckt: macht eine spaetere Platz (kleiner geworden, Mass
  // geloescht), kommt eine frueher gepruefte erst im naechsten Durchgang auf
  // ihr Mass - sonst stuende sie daneben, und der Stand sagte "bestimmt".
  // Wird eine Wand kuerzer, als eine Oeffnung liegt, rueckt eine seitlich nur
  // geschaetzte in die Wand zurueck (an den Rand, sonst an die naechste freie
  // Kante). Nur bei eindeutiger Form: vorher sind die Wandlaengen geraten.
  // Eine seitlich eingemessene bleibt liegen, ihr Stand nennt den Widerspruch.
  if(M.openings.length && M.fit && M.an && M.an.dof===0){
    const P=M.fit.pts;
    M.openings.forEach(o=>{
      const sh=wallShape(P, M.hmeas, o.a, o.b);
      const x=sh ? rueckInDieWand(sh, o, openingsOnWall(o.a,o.b), M.opmeas) : null;
      if(x!=null) o.x=x;
    });
  }
  if(M.openings.length && M.opmeas.length && M.fit){
    const P=M.fit.pts;
    for(let lauf=0, rueckt=true; rueckt && lauf<=M.openings.length; lauf++){
      rueckt=false;
      M.openings.forEach(o=>{
        if(!M.opmeas.some(m=>m.op===o.id && m.on!==false)) return;
        const sh=wallShape(P, M.hmeas, o.a, o.b);
        if(!sh) return;
        const s=settleOpening(sh, o, openingsOnWall(o.a,o.b), M.opmeas);
        if(!s.platz) return;
        if(Math.abs(s.platz.x-o.x)>1e-6 || Math.abs(s.platz.y-o.y)>1e-6 || s.weicht.length) rueckt=true;
        o.x=s.platz.x; o.y=s.platz.y; s.weicht.forEach(w=>{ w.op.x=w.x; });
      });
    }
  }
  // Streuung auffaellig, aber kein EINZELNER Schuldiger isolierbar (leer =
  // alle unter der Schwelle, >1 = Gleichstand): dann helfen nur
  // Wiederholungen. Genau ein Verdaechtiger braucht keine Eingrenzung.
  M.narrow = (netFails() && M.suspects.size!==1)
    ? narrowCandidates(C.activeMeas(M.meas), M.an.v, C.SUGGEST_CHECK_MAX) : [];
}
// Den Raum sichern. Vor folgenAufmass: die Nachbarlagen lesen den Speicher.
// recompute.still und recompute.quotaWarned bleiben Merker der Funktion recompute.
function sichereRaum(){
  // Ein Aufmass dauert leicht eine halbe Stunde. Ein Reload darf es nicht
  // kosten. Bewusst ohne Debounce: serialize() ist bei den hier realistischen
  // Groessen unter einer Millisekunde. VOR dem Ableiten der Nachbarlagen -
  // die lesen den Speicher und braeuchten sonst den Stand von vorhin.
  if(currentRoom && !recompute.still){
    if(STORE.save(currentRoom, {data:JSON.parse(serialize()), area:polyAreaM2(), stand:standKurz()})){
      // Klappt es wieder, warnt der naechste Ausfall erneut - und die stehende
      // Warnung behauptet nichts Falsches mehr.
      if(recompute.quotaWarned && $('toast').textContent.startsWith('Speichern fehlgeschlagen')) sag(null);
      recompute.quotaWarned=false;
    }
    else if(!recompute.quotaWarned){
      // Einmal je Ausfall warnen, nicht je Aenderung - aber nie still
      // schlucken: sonst ist ein 30-Minuten-Aufmass beim Reload weg, ohne dass
      // es je ein Anzeichen gab. Erst NACH der Rueckmeldung der ausloesenden
      // Aktion (die setzt ihren Text gleich nach recompute() und ueberschriebe
      // die Warnung) - und stehend, bis die naechste Aktion etwas meldet.
      // Ist der Speicher von Anfang an gesperrt, sagt das die Startmeldung.
      recompute.quotaWarned=true;
      if(STORE.storageOk) setTimeout(speicherWarnung, 0);
    }
  }
}
function recompute(){
  rechneRaum();
  sichereRaum();
  alleWerkzeuge('folgen');
  render();
  if(M.glide){ const lauf=()=>{ redraw(); if(M.glide) requestAnimationFrame(lauf); }; requestAnimationFrame(lauf); }
}

// Der Ausgleich eicht an der ersten Ecke und skaliert vorher um den Nullpunkt:
// dieselbe Form kam bei jedem Durchgang (auch beim bloßen Öffnen) ein Stück
// verschoben und gedreht zurück, und der Raum wanderte im Speicher. Hat sich
// die Form nicht geändert, bleibt er deshalb liegen, wo er lag: F wird starr
// (Schwerpunkt und Drehung) auf P gelegt. Ändert ein Maß die Form, bleibt es
// bei der Lage des Ausgleichs.
function lageHalten(F, P){
  const I=C.idx(P), n=F.length;
  if(n<2 || F.some(f=>I[f.id]==null)) return;
  let fx=0, fy=0, px=0, py=0;
  F.forEach(f=>{ const p=P[I[f.id]]; fx+=f.x; fy+=f.y; px+=p.x; py+=p.y; });
  fx/=n; fy/=n; px/=n; py/=n;
  let s=0, c=0;
  F.forEach(f=>{ const p=P[I[f.id]], ax=f.x-fx, ay=f.y-fy, bx=p.x-px, by=p.y-py; c+=ax*bx+ay*by; s+=ax*by-ay*bx; });
  const w=Math.atan2(s, c), co=Math.cos(w), si=Math.sin(w);
  const neu=F.map(f=>{ const ax=f.x-fx, ay=f.y-fy; return {x:px+co*ax-si*ay, y:py+si*ax+co*ay}; });
  // Mehr als ein Zwanzigstel Millimeter daneben: die Form ist eine andere.
  if(F.some((f,i)=>{ const p=P[I[f.id]]; return Math.hypot(neu[i].x-p.x, neu[i].y-p.y)>0.05; })) return;
  F.forEach((f,i)=>{ f.x=neu[i].x; f.y=neu[i].y; });
}

// ================= Raumbibliothek (Anbindung) =================

// Derselbe Raum, in einem anderen Fenster geändert: dieses Fenster zöge sonst
// mit seiner nächsten Änderung den alten Stand darüber. Solange es nicht das
// bediente Fenster ist, lädt es den Raum deshalb still neu. Ohne zu speichern
// (recompute.still): sonst weckten sich zwei Fenster gegenseitig.
// Ob es DIESEN Raum trifft, sagt das Ereignis selbst (Speicher vorher und
// nachher): ein Schreiben an einem anderen Raum lässt dieses Fenster in Ruhe.
// Der Vergleich mit dem eigenen Stand taugt dafür nicht, weil der Ausgleich
// die Ecken beim Laden in den letzten Stellen anders rechnet.
addEventListener('storage', e=>{
  if(e.key!==null && e.key!=='raumaufmass.rooms') return;
  if(!currentRoom || document.hasFocus()) return;
  const r=STORE.load(currentRoom);
  if(!r){ location.replace('raeume.html'); return; }          // dort gelöscht
  // Umbenannt (der Name liegt neben den Daten): Kopfzeile und Titel nachziehen.
  if(r.name!==currentRoomName){ currentRoomName=r.name; renderPanel(); }
  if(e.key!==null){
    const raum=v=>{ try{ const l=JSON.parse(v||'[]'); return Array.isArray(l) ? l.find(x=>x && x.id===currentRoom) : null; }catch(err){ return null; } };
    // Auf ein Millionstel Millimeter gerundet: schon das bloße Öffnen im anderen
    // Fenster schreibt die Ecken mit anderen letzten Stellen zurück.
    const kern=x=>JSON.stringify(x.data, (k,v)=>typeof v==='number' ? Math.round(v*1e6)/1e6 : v);
    const vor=raum(e.oldValue), nach=raum(e.newValue);
    if(vor && nach && kern(vor)===kern(nach)) return;
  }
  if(JSON.stringify(r.data)===serialize()) return;
  alleWerkzeuge('neuerStand');   // nichts Vorgemerktes über den neuen Stand schreiben
  const zustand=ALLE.map(w=>w.vorNeuladen ? w.vorNeuladen() : undefined);
  recompute.still=true;
  try{ openRoom(currentRoom); } finally{ recompute.still=false; }
  ALLE.forEach((w,i)=>{ if(w.nachNeuladen) w.nachNeuladen(zustand[i]); });
});

function speicherWarnung(){
  // Verzögert gerufen: hat inzwischen ein Speichern geklappt, entfällt sie.
  if(recompute.quotaWarned) setHintLive('Speichern fehlgeschlagen (Speicher voll?). Raum als Datei oder Link sichern.');
}
function openRoom(id){
  // Gehaltene Pfeil-/Dreh-Taste: das Vorgemerkte noch in den ALTEN Raum schreiben (currentRoom zeigt auf ihn, M hält
  // seine Daten), und zwar vor dem Laden: öffnet man denselben Raum noch einmal, sieht auch er die Schritte.
  alleWerkzeuge('vorRaumwechsel');
  const r=STORE.load(id);
  if(!r) return;
  currentRoom=id;
  currentRoomName=r.name;
  // Das stille Neuladen eines Fensters im Hintergrund schreibt nichts: „zuletzt
  // geöffnet“ gehört dem bedienten Fenster (sonst öffnete dort „Neuer Raum“
  // oder ein Neuladen den Raum dieses Fensters).
  if(!recompute.still) STORE.setCurrent(id);
  // Welcher Raum in DIESEM Fenster offen ist: ein Neuladen bleibt bei ihm,
  // auch wenn ein anderes Fenster inzwischen einen anderen geöffnet hat.
  try{ sessionStorage.setItem('raumaufmass.fenster', id); }catch(e){}
  // Einnordung gehoert zum Raum, nicht zur Sitzung: sonst haengt die
  // Ansicht des naechsten Raums an einer Wand, die es dort nicht gibt
  // (browser-gesehen: schraeges Raster im frisch geoeffneten Raum).
  VIEW.rot=0;
  // Der Undo-Stapel gehoert zum Raum: ein Undo nach dem Wechsel wuerde
  // sonst die Geometrie des vorigen Raums in DIESEN Raum speichern.
  undoStack.length=0; redoStack.length=0;
  alleWerkzeuge('neuerStand');
  // Offene Eingabe/Popover gehoeren zum alten Raum: ein OK nach dem
  // Wechsel wuerde eine Messung mit fremden Punkt-IDs in DIESEN Raum
  // druecken - recompute() wirft dann bei jedem Bild.
  alleWerkzeuge('neuerRaum');
  deserialize(r.data);
  userView=false;
  recompute();     // sichert, leitet die Nachbarlagen ab und zeichnet
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
  // Fremddateien ohne idSeq: aus den Punkt-IDs zurueckrechnen, sonst erbt
  // deserialize() den Zaehler des vorigen Raums und vergibt Duplikat-IDs.
  const data={...dataObj};
  if(typeof data.idSeq!=='number')
    data.idSeq=data.pts.reduce((mx,p)=>Math.max(mx, idOrdinal(p.id)+1), 0);
  const id=STORE.create(name||'Importierter Raum');
  // Voller oder gesperrter Speicher: es wurde nichts angelegt. Dann beim
  // offenen Raum bleiben und das sagen, statt Erfolg zu melden.
  if(!STORE.save(id,{data}) || !STORE.load(id)){ STORE.remove(id); return IMPORT_VOLL; }
  openRoom(id);
  return null;
}
const IMPORT_VOLL='Der Speicher dieses Browsers ist voll oder gesperrt.';

// ================= Anmeldung der Werkzeuge =================
// Fliesenplan und Küchenplaner melden sich hier an (meldeAn), und die Seite ruft sie
// über diese Anmeldung, ohne sie zu kennen. Der Schlüssel ist der Modus (M.mode):
//   bereit()    darf der Raum so geöffnet werden?        absage: Text der Hinweiszeile, wenn nicht
//   zeichne()   die Zeichenfläche                        panel(): Abschnitt im Panel; true = der Modus
//   vorZeichnen() / nachZeichnen()  vor und nach dem Zeichnen (jede Anmeldung, nicht nur die des Modus)
//   modusAbgelehnt(modus) true = der Wechsel wurde mit einer Rückmeldung abgelehnt; vorModus() vor jedem Wechsel;
//   modusGewechselt(modus) danach; zoom/pan/einpassen(...) true = die Ansicht des Werkzeugs, nicht VIEW; aufgeklappt()
//   hinweisBelegt() true = die Hinweiszeile zeigt gerade etwas Eigenes
//   vorHistorie() vor einem Klick auf Rückgängig/Wiederherstellen, gibt eine Funktion für danach zurück; start() beim Boot
//   hinweis()   Standardtext der Hinweiszeile            wurde verlassen, die Seite rendert nicht weiter
//   Jede Funktion ist freiwillig: wer eine nicht hat, wird dort übergangen.
//   verlassen() beim Wechsel in einen anderen Modus
//   folgen()    was aus einer Änderung folgt (nach dem Sichern, vor dem Zeichnen)
//   neuerRaum() ein anderer Raum wird geladen: offene Eingaben und Karten gehören dem alten
//   vorNeuladen() / nachNeuladen(zustand)  ein anderes Fenster hat den Raum geändert: Zustand merken, danach wiederherstellen
//   vorRaumwechsel() Vorgemerktes noch in den alten Raum schreiben; neuerStand() Vorgemerktes verwerfen,
//               weil ein anderer Raum oder Stand geladen wird
//   esc() Esc löst etwas (true); taste(e) / pfeil(e) Tasten nach den Ansichtstasten bzw. Pfeile; nachResize()
//   vorRueckgaengig() merkt, nachRueckgaengig(v) / nachWiederherstellen(v) holt nach
//   key(e)      Taste behandelt (true)?                   entf(): Entf/⌫ löscht die Auswahl (true = getan)
//   vorDruecken(e) true = der Modus hat das Drücken ganz übernommen; popOffen()/popSchliessen() ein Lösch-Popover;
//   zeigerWeg() der Zeiger verlässt den Plan; ohneGeste() Loslassen ohne Geste; leer(e, g) Ende einer Geste im Leeren
//   Zeiger: down(e) legt eine Geste an (true) oder lässt der Seite das Ziehen im Leeren; hover(e) ohne
//   gedrückte Taste; move(e, g), up(e, g) und pinch(g) für Gesten, deren Typ g.t in gesten steht; tap(e)
//   für einen Klick ohne Ziehen, wenn down keine Geste angelegt hat.
// Die Anmeldung selbst steht beim Werkzeug; die Seite lädt es nach diesem Block.
const WERKZEUGE={}, ALLE=[];       // Modus -> Anmeldung; alle Anmeldungen in der Reihenfolge der Anmeldung
function meldeAn(modi, werk){ for(const m of [].concat(modi)) WERKZEUGE[m]=werk; ALLE.push(werk); }
const werkzeug=modus=>WERKZEUGE[modus===undefined ? M.mode : modus]||null;
// Ruft bei jedem angemeldeten Werkzeug die Funktion mit diesem Namen, wenn es sie hat.
const alleWerkzeuge=name=>{ for(const w of ALLE) if(w[name]) w[name](); };
const werkFuerGeste=g=>(g && ALLE.find(w=>w.gesten && w.gesten.includes(g.t)))||null;

function render(){
  redraw();
  renderPanel();
  refreshHint();
}
// Nur die Zeichenflaeche, passend zum Modus. Wer direkt drawCanvas() rief,
// malte im Wände-Modus den Grundriss ueber die Wandansicht. Offene Eingaben
// haengen an ihrer Strecke und wandern bei Zoom und Verschieben mit.
function redraw(){
  alleWerkzeuge('vorZeichnen');
  const werk=werkzeug(); if(werk && werk.zeichne) werk.zeichne();
  alleWerkzeuge('nachZeichnen');
}
function openingsOnWall(a,b){
  const k=wallKey(a,b);
  return M.openings.filter(o=>wallKey(o.a,o.b)===k);
}

// Abstand eines Punktes zu einer Strecke, plus Fusspunkt-Parameter.
function distToSeg(p,a,b){
  const vx=b.x-a.x, vy=b.y-a.y, L2=vx*vx+vy*vy;
  const t=L2? Math.max(0,Math.min(1,((p.x-a.x)*vx+(p.y-a.y)*vy)/L2)) : 0;
  return {d:Math.hypot(p.x-(a.x+vx*t), p.y-(a.y+vy*t)), t};
}

// ================= Gesten =================
// Ein Pointer-Modell fuer Maus UND Finger. Ein Tipp legt an oder waehlt aus,
// ein Zug verschiebt Punkt oder Ansicht, zwei Finger zoomen, langes Druecken
// loescht. Der Punkt entsteht deshalb erst beim Loslassen, nicht beim
// Druecken - vorher ist nicht bekannt, ob ein Zug daraus wird.

const pointers=new Map();      // pointerId -> letzte Client-Position
let gesture=null;              // {t:'point'|'selpt'|'bg', ...}
let pinch=null;                // {d0, cx0, cy0, view0}
let lpTimer=null;
let lastPtrType='mouse';
function cancelLongpress(){ if(lpTimer){ clearTimeout(lpTimer); lpTimer=null; } }

// Der Snapshot eines Zugs gehoert der ERSTEN echten Bewegung, nicht dem
// Druecken: sonst frisst ein blosser Tipp ohne Zug das naechste Undo.
function startPinch(){
  const [p1,p2]=[...pointers.values()];
  const r=cv.getBoundingClientRect(), dpr=DPR();
  pinch={ d0:Math.hypot(p1.x-p2.x,p1.y-p2.y)||1,
          cx0:((p1.x+p2.x)/2-r.left)*dpr, cy0:((p1.y+p2.y)/2-r.top)*dpr,
          view0:{...VIEW} };
  cancelLongpress();
  // Ein laufender Küchen-Zug wird abgeschlossen (gespeichert), sonst bliebe
  // er halb liegen und das Panel eingefroren.
  const gw=werkFuerGeste(gesture); if(gw && gw.pinch) gw.pinch(gesture);
  gesture=null;
  if(M.drag){ M.drag=null; M.dragMode=null; }
}
function updatePinch(){
  const [p1,p2]=[...pointers.values()];
  const r=cv.getBoundingClientRect(), dpr=DPR();
  const d=Math.hypot(p1.x-p2.x,p1.y-p2.y)||1;
  const cx=((p1.x+p2.x)/2-r.left)*dpr, cy=((p1.y+p2.y)/2-r.top)*dpr;
  const f=d/pinch.d0;
  VIEW.s=pinch.view0.s*f;
  VIEW.ox=cx+(pinch.view0.ox-pinch.cx0)*f;
  VIEW.oy=cy+(pinch.view0.oy-pinch.cy0)*f;
  userView=true;
  render();
}

// Leertaste gehalten: Ziehen verschiebt die Ansicht (Figma-/Photoshop-
// Konvention). Der einzige Pan-Weg, der auf jedem Geraet gleich geht - das
// Mac-Trackpad hat keine Mitteltaste, ein Windows-Touchpad meist auch nicht.
let spaceHeld=false;
let lastMidTap=-1e9;          // Doppelklick mit dem Mausrad: einpassen

function startPan(e, mid){
  e.preventDefault(); lastPtrType=e.pointerType;
  // Wer gerade die Mitteltaste benutzt, hat ein Rad in der Hand - aber nur
  // fuer ein paar Sekunden; das Touchpad daneben soll danach wieder schieben.
  if(mid){ wheelState.hint='mouse'; wheelState.hintT=e.timeStamp; }
  cv.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  gesture={t:'pan',mid,x0:e.clientX,y0:e.clientY,lx:e.clientX,ly:e.clientY,moved:false};
  alleWerkzeuge('popSchliessen');
  cv.style.cursor='grabbing';
}

cv.addEventListener('pointerdown',e=>{
  // Verschieben ohne etwas anzufassen - in jedem Modus, auf die Ansicht,
  // die man sieht: mittlere Maustaste, oder Leertaste + Ziehen.
  if(e.pointerType==='mouse' && e.button===1){ startPan(e,true); return; }
  if(spaceHeld && e.button===0){ startPan(e,false); return; }
  // Nur die Primaertaste zeichnet. Ein Rechtsklick kommt hier ebenfalls als
  // pointerdown an und wuerde sonst beim Loslassen eine Ecke setzen - der
  // gehoert dem contextmenu-Handler. Strg+Klick ist auf dem Mac ein
  // Rechtsklick und meldet sich trotzdem als Taste 0.
  if(e.pointerType==='mouse' && (e.button!==0 || (IS_MAC && e.ctrlKey))){ lastPtrType='mouse'; return; }
  const werk=werkzeug();
  if(werk && werk.vorDruecken && werk.vorDruecken(e)) return;
  cv.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  lastPtrType=e.pointerType;
  // Ein Klick, der nur das offene Loesch-Popover wegdrueckt, darf nicht
  // nebenbei eine Ecke setzen oder eine Eingabe oeffnen.
  const popOpen=ALLE.some(w=>w.popOffen && w.popOffen());
  alleWerkzeuge('popSchliessen');
  if(pointers.size===2){ startPinch(); return; }
  if(pointers.size>2 || pinch) return;
  if(werk && werk.down){
    if(!werk.down(e, popOpen)) gesture={t:'bg',x0:e.clientX,y0:e.clientY,lx:e.clientX,ly:e.clientY,moved:false,wall:null,popOpen};
    return;
  }
});
cv.addEventListener('pointerleave',()=>alleWerkzeuge('zeigerWeg'));

cv.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId)){
    if(spaceHeld){ cv.style.cursor='grab'; return; }
    const werk=werkzeug(); if(werk && werk.hover) werk.hover(e);
    return;
  }
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch){ if(pointers.size>=2) updatePinch(); return; }
  if(!gesture) return;
  const moved=Math.hypot(e.clientX-gesture.x0,e.clientY-gesture.y0)>TAP_SLOP;
  if(moved && !gesture.moved){ gesture.moved=true; cancelLongpress(); }
  if(gesture.t==='pan'){
    const dpr=DPR();
    viewPanBy((e.clientX-gesture.lx)*dpr, (e.clientY-gesture.ly)*dpr);
    gesture.lx=e.clientX; gesture.ly=e.clientY;
    redraw(); return;
  }
  const gw=werkFuerGeste(gesture); if(gw){ gw.move(e, gesture); return; }
  // Zug im Leeren verschiebt die Ansicht.
  if(gesture.t==='bg' && gesture.moved){
    const dpr=DPR();
    viewPanBy((e.clientX-gesture.lx)*dpr, (e.clientY-gesture.ly)*dpr);
    gesture.lx=e.clientX; gesture.ly=e.clientY;
    redraw();
  }
});

function endPointer(e){
  pointers.delete(e.pointerId);
  cancelLongpress();
  hintLive=false;                 // Live-Werte eines Zugs gelten nur waehrend des Zugs
  if(pinch){
    // Bleibt ein Finger liegen, soll daraus kein versehentlicher Tipp werden.
    if(pointers.size<2){ pinch=null; gesture=null; }
    return;
  }
  const g=gesture; gesture=null;
  if(!g){ alleWerkzeuge('ohneGeste'); return; }
  if(g.t==='pan'){
    cv.style.cursor=spaceHeld?'grab':'';
    // Doppelklick mit dem Mausrad passt die Ansicht ein (CAD-Konvention).
    if(g.mid && !g.moved && e.type!=='pointercancel'){
      if(e.timeStamp-lastMidTap<450){ lastMidTap=-1e9; fitActiveView(); }
      else lastMidTap=e.timeStamp;
    }
    return;
  }
  const gw=werkFuerGeste(g); if(gw){ gw.up(e, g); return; }
  const werk=werkzeug();
  if(werk && werk.leer){ werk.leer(e, g); return; }
  if(werk && werk.tap){
    if(g.moved) render();
    else if(e.type!=='pointercancel') werk.tap(e);
    return;
  }
}
cv.addEventListener('pointerup',endPointer);
cv.addEventListener('pointercancel',endPointer);

// Rechtsklick: Loeschen anbieten - fuer Ecke oder Wand im Plan, fuer die
// Oeffnung in der Wandansicht. Auf dem Mac auch Zwei-Finger-Klick und
// Strg+Klick; unter Windows die Rechtsklick-Zone des Touchpads.
// Rechtsklick tut im Plan nichts mehr: gelöscht wird auf der Karte des
// Objekts oder mit Entf (ein sichtbarer Weg, eine Taste).
cv.addEventListener('contextmenu',e=>{ e.preventDefault(); });

// ================= Rad, Touchpad, Pinch =================
// Mausrad, Zwei-Finger-Wischen und Pinch kommen alle als wheel an, und kein
// Browser sagt, welches Geraet es war.
// - Strg/⌘ und Pinch (Mac und Windows melden ihn als Strg-wheel): zoomen.
// - Umschalt: waagerecht verschieben.
// - sonst entscheidet die Einstellung "Scrollen" (Statuszeile):
//   automatisch: Rastungen (Zeilen-Deltas oder |dy| >= 40 ohne dx) sind ein
//   Mausrad und zoomen um den Zeiger (CAD-Konvention); feine Deltas oder ein
//   seitlicher Anteil sind ein Touchpad und verschieben. Je Strom einmal
//   entschieden (150 ms Pause = neuer Strom), damit der Nachlauf eines
//   Wischers nicht ins Zoomen kippt. Schlaegt die Erkennung fehl (Maus mit
//   Feinscrollen, altes Touchpad mit Rad-Emulation), legt man es fest.
// Früher einstellbar; „automatisch“ gilt jetzt fest (ein Rad zoomt, ein Touchpad verschiebt).
const wheelPref='auto';
const wheelState={cls:null, lastT:-1e9, hint:null, hintT:-1e9, gesture:false};
function wheelClass(mode,dx,dy,t){
  if(mode!==0) return 'mouse';               // Zeilen oder Seiten liefert nur ein Rad
  if(dx!==0) return 'trackpad';              // ein Rad hat kein X (Umschalt ist schon behandelt)
  if(Math.abs(dy)>=40) return 'mouse';       // Rastung: 100, 90,9 bei Browserzoom, 53 unter Linux
  const frisch=wheelState.hint==='mouse' ? t-wheelState.hintT<4000 : !!wheelState.hint;
  return frisch ? wheelState.hint : 'trackpad';
}
cv.addEventListener('wheel',e=>{
  e.preventDefault();
  if(swim) return;
  const mode=e.deltaMode;                    // zuerst lesen: Firefox rechnet sonst um
  const k=mode===1?16:mode===2?cv.clientHeight:1, dpr=DPR();
  const dx=e.deltaX*k, dy=e.deltaY*k;
  const d=evDev(e);
  const notch=mode!==0 || Math.abs(dy)>=40;
  if(e.ctrlKey||e.metaKey){
    if(wheelState.gesture) return;           // Safari: derselbe Pinch kam schon als Geste
    viewZoomAt(d.x,d.y, notch ? (dy<0?1.15:1/1.15) : Math.exp(-dy/100));
    redraw(); return;
  }
  if(e.shiftKey){ viewPanBy(-(dx||dy)*dpr, 0); redraw(); return; }
  // Seitlicher Anteil oder gebrochene Deltas sind eindeutig Touchpad.
  if(mode===0 && (dx!==0 || dy%1!==0)) wheelState.hint=null;
  if(e.timeStamp-wheelState.lastT>150) wheelState.cls=wheelClass(mode,dx,dy,e.timeStamp);
  wheelState.lastT=e.timeStamp;
  const dev = wheelPref==='auto' ? wheelState.cls : wheelPref==='zoom' ? 'mouse' : 'trackpad';
  if(dev==='mouse' && dx===0) viewZoomAt(d.x,d.y, notch ? (dy<0?1.15:1/1.15) : Math.exp(-dy*0.0015));
  else viewPanBy(-dx*dpr, -dy*dpr);
  redraw();
},{passive:false});
// Safari meldet Pinch als eigene Gesten. Ohne preventDefault zoomt die
// ganze Seite; mit preventDefault schickt Safari kein Strg-wheel mehr.
let gestLast=1;
cv.addEventListener('gesturestart',e=>{ e.preventDefault(); wheelState.gesture=true; wheelState.hint='trackpad'; gestLast=1; });
cv.addEventListener('gesturechange',e=>{
  e.preventDefault();
  const d=e.clientX!=null ? evDev(e) : {x:cv.width/2, y:cv.height/2};
  viewZoomAt(d.x,d.y, e.scale/gestLast); gestLast=e.scale;
  redraw();
});
cv.addEventListener('gestureend',e=>{ e.preventDefault(); wheelState.gesture=false; });
// Eine Ecke im Sinne des Winkels: genau zwei Waende treffen sich.
function cornerOf(id){
  const nb=M.walls.filter(([x,y])=>x===id||y===id).map(([x,y])=>x===id?y:x);
  return nb.length===2 ? {a:nb[0], c:id, b:nb[1]} : null;
}

// Die Ecke, an der ein Klick den Raum schliesst: laeuft der Zug an einem
// Ende eines offenen Zugs mit mindestens drei Ecken, ist es das andere -
// sofern die Wand dorthin den Raum wirklich schliesst (finishIfClosed fragt
// dasselbe; eine lose Ecke daneben haelt ihn offen). Der Ring im Plan und
// der Satz im Stand fragen beide hier, damit sie dasselbe sagen.
function zugZiel(){
  if(M.mode!=='draw' || M.chain==null || M.pts.length<3 || C.wallPolygonRing(M.pts, M.walls)) return null;
  const grad={}; M.walls.forEach(([a,b])=>{ grad[a]=(grad[a]||0)+1; grad[b]=(grad[b]||0)+1; });
  const enden=M.pts.filter(p=>grad[p.id]===1 && p.id!==M.chain);
  return enden.length===1 && C.wallPolygonRing(M.pts, M.walls.concat([[M.chain, enden[0].id]])) ? enden[0].id : null;
}

// Der Standardhinweis kommt vom Werkzeug des Modus (Anmeldung hinweis). Er haengt am Zustand, nicht nur
// am Modus: ein laufender Zeichenzug oder ein Fliesen-Werkzeug erklaert sich selbst - und zwar solange
// es aktiv ist, nicht nur vier Sekunden.
function modeHint(){
  const werk=werkzeug();
  return werk && werk.hinweis ? werk.hinweis() : undefined;
}
let hintTimer=null, hintLive=false;
// setHint(text): fluechtige Meldung, faellt nach ein paar Sekunden auf den
// Zustandshinweis zurueck. setHint(null) springt sofort dorthin.
function setHint(txt){
  clearTimeout(hintTimer); hintTimer=null; hintLive=false;
  if(TOOL==='aufmass'){ if(sagLive){ sagLive=false; sag(null); } if(txt!=null) sag(txt); return; }
  if(txt==null){ $('hint').textContent=$('hint').title=plat(modeHint()); return; }
  $('hint').textContent=$('hint').title=plat(txt);
  hintTimer=setTimeout(()=>{ hintTimer=null; $('hint').textContent=plat(modeHint()); }, 4000);
}
// Fuer den Live-Text waehrend eines Zugs: ohne Timeout. Das Ende des Zugs
// (endPointer) gibt die Zeile wieder frei.
function setHintLive(txt){ clearTimeout(hintTimer); hintTimer=null; hintLive=true;
  if(TOOL==='aufmass'){ sagLive=true; sag(txt, null, true); return; }
  $('hint').textContent=plat(txt); }
// Steht keine Meldung, folgt die Zeile dem Zustand (bei jedem render).
function refreshHint(){
  if(TOOL==='aufmass'){ if(sagLive && !hintLive){ sagLive=false; sag(null); } return; }
  if(!hintTimer && !hintLive && !ALLE.some(w=>w.hinweisBelegt && w.hinweisBelegt())){ const t=plat(modeHint()); $('hint').textContent=t; $('hint').title=t; } }

function setMode(mode){
  if(ALLE.some(w=>w.modusAbgelehnt && w.modusAbgelehnt(mode))) return;
  // Eine Rückmeldung gehört zu dem Schritt, in dem sie entstand.
  sag(null);
  alleWerkzeuge('vorModus');
  const ziel=werkzeug(mode);
  if(ziel && ziel.bereit && !ziel.bereit()){ setHint(ziel.absage); return; }
  // Beim Verlassen eines Werkzeugs: aufräumen (Fliesen: Werkzeug zurück, Auswahl weg).
  const alt=werkzeug();
  if(alt && mode!==M.mode && alt.verlassen) alt.verlassen();
  M.mode=mode; M.sel=[];
  for(const w of ALLE) if(w.modusGewechselt) w.modusGewechselt(mode);
  // Der Modus steht am body: CSS zeigt danach nur die Werkzeuge und
  // Panel-Abschnitte, die zu ihm gehoeren.
  document.body.dataset.mode=mode;
  setHint(null);
  render();
}

// Per Knopf: der Klick nimmt dem Eingabefeld den Fokus und lässt ihn auf dem
// Knopf - die nächste Zahl verpuffte, und Enter löste den Knopf noch einmal aus.
// Der Knopf schließt deshalb die offene Eingabe; lief die geführte Eingabe,
// geht sie beim ersten Vorschlag weiter und nimmt den Fokus. ⌘Z im Feld der
// Eingabe geht denselben Weg (e fehlt dann). Nach einem Zeigerklick (detail>0)
// gibt der Knopf den Fokus ab; ohne geführte Eingabe behält ihn die Tastatur.
function histKnopf(e, tun){
  const danach=ALLE.map(w=>w.vorHistorie ? w.vorHistorie() : null);
  tun();
  if(e && e.detail && e.currentTarget) e.currentTarget.blur();
  danach.forEach(f=>{ if(f) f(); });
}
$('undo').onclick=e=>histKnopf(e, doUndo);
$('redo').onclick=e=>histKnopf(e, doRedo);
$('fitview').onclick=fitActiveView;
// Umbenennen direkt am Namen in der Kopfleiste (auch ueber den Namen im
// Plan erreichbar). Enter oder Wegklicken uebernimmt, Esc verwirft.
function renameCurrentRoom(){
  if(!currentRoom || $('roomnameEdit')) return;
  const el=$('roomname');
  const inp=document.createElement('input');
  inp.id='roomnameEdit'; inp.value=currentRoomName; inp.setAttribute('aria-label','Raumname');
  el.hidden=true; el.after(inp); inp.focus(); inp.select();
  let fertig=false;
  const done=ok=>{
    if(fertig) return; fertig=true;
    const v=inp.value.trim();
    if(ok && v && v!==currentRoomName){ STORE.rename(currentRoom, v); currentRoomName=v; }
    inp.remove(); el.hidden=false; render();
  };
  inp.addEventListener('keydown',e=>{ e.stopPropagation(); if(e.key==='Enter') done(true); else if(e.key==='Escape') done(false); });
  inp.addEventListener('blur',()=>done(true));
}
$('roomname').onclick=renameCurrentRoom;
// ================= Raum-Menue =================
// Alles, was man pro Raum einmal tut (oeffnen, sichern, teilen, spiegeln,
// leeren), wohnt hier statt dauerhaft in der Leiste.
function openRoomMenu(on){
  const m=$('roommenu'), b=$('roommenuBtn');
  m.hidden=!on; b.setAttribute('aria-expanded', String(!!on));
  // Der erste SICHTBARE Punkt: im Fliesenplan und im Küchenplaner sind die oberen (nurAufmass) versteckt
  // und nähmen den Fokus nicht an - die Pfeile liefen dann am Menü vorbei in den Plan.
  if(on){ const f=[...m.querySelectorAll('button')].find(b=>b.offsetParent!==null); if(f) f.focus({preventScroll:true}); }
}
$('roommenuBtn').onclick=()=>openRoomMenu($('roommenu').hidden);
$('roommenu').addEventListener('click',e=>{ if(e.target.closest('button')) openRoomMenu(false); });
addEventListener('pointerdown',e=>{
  if(!$('roommenu').hidden && !e.target.closest('#histctl')) openRoomMenu(false);
},true);
$('roommenu').addEventListener('keydown',e=>{
  // Nur sichtbare Punkte: ein versteckter nähme den Fokus nicht an, und die Pfeile blieben davor hängen.
  const items=[...$('roommenu').querySelectorAll('button')].filter(b=>b.offsetParent!==null);
  const i=items.indexOf(document.activeElement);
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault(); e.stopPropagation();
    items[(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();
  } else if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); openRoomMenu(false); $('roommenuBtn').focus(); }
  // Solange der Fokus im Menü liegt, gehört die Taste dem Menü: sonst verschöben
  // Pfeil links/rechts dahinter die gewählte Fliese oder das gewählte Teil.
  // Enter und Leertaste lösen den Menüpunkt weiter aus, Tab wandert weiter.
  else e.stopPropagation();
});

// Die Hotkeys sind auf window gebunden, damit sie ueberall wirken - aber
// genau deshalb bubbelt auch ein Tastendruck in einem Eingabefeld bis
// hierher. Ohne die Sperre wuerde eine getippte "1" im Mass den Modus
// wechseln und das Feld aus dem DOM reissen.
// Textfelder behalten ihre Tasten (auch ihr eigenes Text-Rueckgaengig).
// Checkboxen und Knoepfe sind keine Textfelder - nach einem Klick darauf
// waren frueher alle Kuerzel tot.
const isText=t=>!!t && ((t.tagName==='INPUT' && !['checkbox','radio','button','range','color','file'].includes(t.type))
  || t.tagName==='TEXTAREA' || t.isContentEditable);
// Auswahllisten und Checkboxen geben den Fokus nach der Wahl ab - ausser
// der Haken wurde mit der Leertaste geschaltet (hakenTaste, siehe keydown).
let hakenTaste=null;
document.addEventListener('change',e=>{
  const t=e.target;
  if(t && t===hakenTaste){ hakenTaste=null; return; }
  hakenTaste=null;
  if(t && (t.tagName==='SELECT' || (t.tagName==='INPUT' && t.type==='checkbox'))) t.blur();
});
function zoomCenter(f){ viewZoomAt(cv.width/2, cv.height/2, f); redraw(); }
function doUndo(){
  const vor=ALLE.map(w=>w.vorRueckgaengig ? w.vorRueckgaengig() : undefined);
  if(!undo()){ setHint('Nichts mehr rückgängig zu machen.'); return; }
  ALLE.forEach((w,i)=>{ if(w.nachRueckgaengig) w.nachRueckgaengig(vor[i]); });
}
function doRedo(){
  const vor=ALLE.map(w=>w.vorRueckgaengig ? w.vorRueckgaengig() : undefined);
  if(!redo()){ setHint('Nichts wiederherzustellen.'); return; }
  ALLE.forEach((w,i)=>{ if(w.nachWiederherstellen) w.nachWiederherstellen(vor[i]); });
}
// Entf/⌫: loescht, was unter dem Zeiger liegt (Ecke vor Wand), in der
// Wandansicht die gewaehlte Oeffnung. Ohne Rueckfrage - Rueckgaengig holt
// es zurueck, und der Hinweis sagt wie.
function deleteTarget(){
  const werk=werkzeug();
  return !!(werk && werk.entf && werk.entf());
}
addEventListener('keydown',e=>{
  const t=e.target;
  if(isText(t)) return;
  const mod=e.ctrlKey||e.metaKey, k=e.key.toLowerCase();
  // Raeume, QR-Code und Kuerzel-Uebersicht sind modal: dahinter darf keine
  // Taste etwas veraendern, was man nicht sieht. Esc schliesst, ? auch.
  if(!$('qrwrap').hidden || !$('keyswrap').hidden || !$('helpwrap').hidden){
    if(e.key==='Escape'){ alleWerkzeuge('popSchliessen'); if(closeKeys()) return; if(closeHelp()) return; if(!$('qrwrap').hidden){ $('qrwrap').hidden=true; return; } }
    else if((e.key==='?' || k==='h') && !$('helpwrap').hidden) toggleHelp();
    return;
  }
  // Rueckgaengig ⌘Z/Strg+Z; Wiederherstellen ⇧⌘Z, Strg+⇧Z und Strg+Y -
  // ueberall ausser in Textfeldern. AltGr kommt unter Windows als Strg+Alt:
  // nie als Kuerzel lesen.
  if(mod && !e.altKey && (k==='z' || k==='y')){
    e.preventDefault();
    if(k==='y' || e.shiftKey) doRedo(); else doUndo();
    return;
  }
  // ⌘S sichert als Datei, ⌘O oeffnet eine - statt des Browser-Dialogs.
  if(mod && !e.altKey && !e.shiftKey && (k==='s' || k==='o')){
    e.preventDefault(); $(k==='s'?'filesave':'filepick').click(); return;
  }
  // Eine fokussierte Auswahlliste braucht ihre Tasten (Pfeile, Buchstaben,
  // Leertaste); Esc und Entf wirken weiter.
  if(t && t.tagName==='SELECT' && !['Escape','Delete','Backspace'].includes(e.key)) return;
  // Leertaste im Menue: der Eintrag loest nativ aus.
  if(e.code==='Space' && t && t.closest && t.closest('#roommenu')) return;
  // Leertaste auf einem Haken, den man mit Tab erreicht hat: er schaltet nativ
  // und behaelt den Fokus. Nach einem Mausklick hat er ihn schon abgegeben
  // (change-Listener oben), dort verschiebt die Leertaste weiter.
  if(e.code==='Space' && t && t.tagName==='INPUT' && t.type==='checkbox'){ hakenTaste=t; return; }
  // Leertaste gehalten: Ziehen verschiebt. preventDefault, sonst loest ein
  // fokussierter Knopf beim Loslassen aus.
  if(e.code==='Space'){
    e.preventDefault();
    if(t && t.tagName==='BUTTON') t.blur();
    if(!spaceHeld){ spaceHeld=true; if(!gesture) cv.style.cursor='grab'; }
    return;
  }
  if(e.key==='Escape'){
    alleWerkzeuge('popSchliessen');
    if(!$('roommenu').hidden){ openRoomMenu(false); return; }
    if(typeof closeKeys==='function' && closeKeys()) return;
    if(!$('qrwrap').hidden){ $('qrwrap').hidden=true; return; }
    if(ALLE.some(w=>w.esc && w.esc())) return;
  }
  { const werk=werkzeug(); if(werk && werk.key && werk.key(e)) return; }
  if(mod || e.altKey) return;
  if(e.key==='?' || k==='h'){ toggleHelp(); return; }
  // Ansicht: 0 oder ⇧1 passt ein, + und − zoomen um die Bildmitte.
  if(e.key==='0' || (e.shiftKey && e.code==='Digit1')){ e.preventDefault(); fitActiveView(); return; }
  if(e.key==='+' || e.key==='='){ zoomCenter(1.25); return; }
  if(e.key==='-'){ zoomCenter(1/1.25); return; }
  // Die Tasten des Werkzeugs, die nach den Ansichtstasten kommen (Raumaufmaß: Schritte 1–4; in der Ausgabe ruhen Löschen und Pfeile).
  if(ALLE.some(w=>w.taste && w.taste(e))) return;
  if(e.key==='Delete' || e.key==='Backspace'){ if(deleteTarget()) e.preventDefault(); return; }
  if(e.key.startsWith('Arrow')){
    e.preventDefault();
    // Wandansicht: ←/→ wechselt die Wand. Sonst verschieben die Pfeile die
    // Ansicht (mit ⇧ weiter).
    if(ALLE.some(w=>w.pfeil && w.pfeil(e))) return;
    const st=80*DPR()*(e.shiftKey?4:1);
    const v={ArrowLeft:[st,0],ArrowRight:[-st,0],ArrowUp:[0,st],ArrowDown:[0,-st]}[e.key];
    viewPanBy(v[0],v[1]); redraw();
  }
});
addEventListener('keyup',e=>{
  if(e.code==='Space' && spaceHeld){
    e.preventDefault();
    spaceHeld=false;
    if(!gesture || gesture.t!=='pan') cv.style.cursor='';
  }
});
// Fenster verliert den Fokus, waehrend die Leertaste unten ist: das keyup
// kommt nie an.
const dropSpace=()=>{ if(spaceHeld){ spaceHeld=false; cv.style.cursor=''; } };
addEventListener('blur', dropSpace);
document.addEventListener('visibilitychange', dropSpace);
addEventListener('resize',()=>{ render(); alleWerkzeuge('nachResize'); });

// ================= Datei sichern / oeffnen =================
const slug=s=>String(s||'raum').toLowerCase()
  .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
  .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'raum';

function roomFilePayload(id){
  const r=STORE.load(id);
  if(!r) return null;
  return {
    // Export-Format = importProblem-Form plus Zusatzfelder; ein Reimport
    // laeuft durch dieselbe Validierung wie jeder andere Import.
    // Spread ZUERST: ein data.name aus einem Fremdimport darf den
    // aktuellen Raumnamen nicht ueberschreiben.
    ...r.data,
    name:r.name,
    // Nur fuer den OFFENEN Raum ist M.an dessen Analyse - der Datei-Knopf
    // in der Bibliothek exportiert auch fremde Raeume.
    sigmaHat:(id===currentRoom&&M.an)?M.an.sigmaHat:null,
  };
}
async function exportRoomAsFile(id){
  const payload=roomFilePayload(id);
  if(!payload) return;
  const json=JSON.stringify(payload,null,2);
  const fname=`${slug(payload.name)}-${datumLokal()}.json`;
  // Am Schreibtisch direkt in die Downloads - das System-Teilen-Fenster
  // (macOS, Windows) waere ein Umweg.
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([json],{type:'application/json'}));
  a.download=fname;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
  setHint(`Gespeichert als ${fname} (Downloads).`);
}
$('filesave').onclick=()=>{ if(currentRoom) exportRoomAsFile(currentRoom); };
$('filepick').onchange=async()=>{
  const f=$('filepick').files[0];
  $('filepick').value='';
  if(!f) return;
  let o=null;
  try{ o=JSON.parse(await f.text()); }catch(e){ sag('Das ist keine gültige JSON-Datei. Eine mit „Als Datei sichern“ erzeugte Datei wählen.'); return; }
  const name=(o && typeof o.name==='string' && o.name.trim()) ? o.name.trim()
    : f.name.replace(/\.json$/i,'');
  const err=importAsNewRoom(name, o);
  if(err===IMPORT_VOLL) sag(`„${name}“ ließ sich nicht speichern. ${err}`);
  else if(err) sag('Die Datei hat nicht die erwartete Form: '+err);
  else setHint(STORE.storageOk ? `„${name}“ importiert und als eigener Raum gespeichert.` : `„${name}“ geöffnet. Auf diesem Gerät wird nichts gespeichert.`);
};

// ================= Link teilen + QR =================
function shareUrl(){
  if(!currentRoom) return null;
  const r=STORE.load(currentRoom);
  if(!r) return null;
  // Der Link führt auf den Startbildschirm: dort kommt ein geteilter Raum an.
  return new URL('raeume.html', location.href).href.split('#')[0]+'#raum='+encodeShare({name:r.name, data:r.data});
}
$('sharelink').onclick=async()=>{
  const url=shareUrl();
  if(!url) return;
  try{ await navigator.clipboard.writeText(url); setHint('Link in der Zwischenablage.'); }
  catch(e){ setHint(url.length<2300 ? 'Zwischenablage nicht erreichbar. Der QR-Code enthält denselben Link.'
                                    : 'Zwischenablage nicht erreichbar. Als Datei sichern (⌘S) geht immer.'); }
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
    setHint('Raum zu groß für einen QR-Code. Link kopieren oder als Datei sichern (⌘S).');
  }
};
$('qrclose').onclick=()=>{ $('qrwrap').hidden=true; };
$('qrwrap').addEventListener('pointerdown',e=>{ if(e.target===$('qrwrap')) $('qrwrap').hidden=true; });
// Millimeter -> Zahl OHNE Kuerzel, fuer Eingabefelder, deren Inhalt wieder
// durch parseLen laeuft.
// Datum für Dateinamen in Ortszeit: toISOString() ist UTC und trüge kurz nach Mitternacht den Vortag.
const datumLokal=()=>{ const d=new Date(), z=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate()); };
const fmt2=x=>x.toFixed(2).replace('.',',');

// Groesstes |v_i|/sigma_i ueber alle aktiven Messungen - je Messung gegen ihr
// EIGENES sigma normiert. Nur fuer den redundancy===0-Fall gedacht: dort ist
// w ueberall null, das ist also die einzige Kennzahl, die dort noch etwas
// ueber die Groesse der Widerspruechlichkeit aussagen kann.
function worstResidualRatio(){
  const act=C.activeMeas(M.meas);
  let ratio=0, v=0;
  M.an.v.forEach((vi,i)=>{
    const r=Math.abs(vi)/(act[i].sigma??C.SIGMA_DEF);
    if(r>ratio){ ratio=r; v=Math.abs(vi); }
  });
  return {ratio, v};
}

// Klartext statt Geodaesie: die Statuszeile beantwortet "wie weit bin ich,
// was fehlt, stimmt etwas nicht" - die Fachbegriffe (Redundanz, w, sigma)
// wohnen in der Detailansicht der Tabelle.
// Was der nächste Klick in der Skizze tut. Das Ziel des Zugs ist meist die
// erste Ecke; ist es eine andere (Zug an anderer Stelle aufgenommen), steht ihr Name da.
function zugSatz(){
  const z=zugZiel();
  if(z!=null) return 'Ein Klick auf '+(z===M.pts[0].id ? 'die erste' : z)+' schließt den Raum.';
  return M.chain!=null ? 'Ein Klick setzt die nächste Ecke.' : 'Ein Klick auf eine Ecke zeichnet dort weiter.';
}
function statusText(){
  // Fortschritt ist neutral ('prog'). Gelb nur fuer "fertig, aber
  // ungeprueft" und auffaellige Streuung, Rot nur fuer echte Widersprueche -
  // eine Karte, die fast immer gelb ist, sagt nichts mehr.
  if(!M.pts.length) return ['Noch keine Ecke. Ein Klick in den Plan setzt die erste.','skizze'];
  if(M.pts.length<3) return [M.pts.length===1 ? '1 Ecke gesetzt.' : M.pts.length+' Ecken gesetzt.','skizze'];
  if(!M.an){
    if(!C.wallPolygonRing(M.pts, M.walls)){
      // Der Satz sagt, was der naechste Klick tut: mit Ziel schliesst er den
      // Raum, mit Zug ohne Ziel setzt er die naechste Ecke, ohne Zug nimmt
      // er ihn an einer Ecke auf. Ausserhalb der Skizze zeichnet kein Klick.
      const n=M.pts.length+' Ecken. ';
      if(M.mode!=='draw') return [n+'Raum ist offen.','skizze'];
      return [n+zugSatz(),'skizze'];
    }
    return ['Raum geschlossen, noch kein Maß.','prog'];
  }
  if(M.fit && !M.fit.converged){
    // Nicht nur "nicht belastbar" - sagen, wo man anfaengt: beim Maß, das
    // am weitesten neben der ausgeglichenen Form liegt (festgelegte zaehlen
    // nicht, die stellt der Nutzer nicht in Frage).
    const act=C.activeMeas(M.meas);
    let wi=-1, wv=0;
    M.an.v.forEach((vi,i)=>{ if(!act[i].fix && Math.abs(vi)>wv){ wv=Math.abs(vi); wi=i; } });
    return [wi>=0 && wv>=1
      ? `Ausgleich kommt nicht zur Ruhe. Am weitesten daneben liegt ${act[wi].a}–${act[wi].b} (${wv.toFixed(0)} mm): nachmessen oder das Maß löschen.`
      : 'Ausgleich kommt nicht zur Ruhe. Das Ergebnis ist nicht belastbar.','bad'];
  }
  const verl=fixVerletzt();
  if(verl.length)
    return [`Festgelegtes passt nicht zusammen: ${verl.map(x=>x.txt).join(', ')}. Eines davon lösen oder die übrigen Maße prüfen.`,'bad'];
  // Ein offener Raum ist nie fertig, auch wenn seine Masse schon alles
  // festlegen (Wand oder Ecke nachtraeglich geloescht, aeltere Raeume).
  // Widersprueche in den Massen bleiben vorn; sonst sagt der Stand, was den
  // Raum schliesst. Mit Namen nur, wenn zwischen genau zwei losen Enden die
  // eine Wand fehlt - steht sie schon (freie Wand, begonnene Insel), naehme
  // derselbe Klick sie wieder weg (tapPointDraw).
  let offen=null;
  if(!C.wallPolygonRing(M.pts, M.walls)){
    const n={}; M.walls.forEach(w=>w.forEach(id=>{ n[id]=(n[id]||0)+1; }));
    const lose=M.pts.filter(p=>n[p.id]!==2);
    const paar=lose.length===2 && lose.every(p=>n[p.id]===1)
      && !M.walls.some(w=>w.includes(lose[0].id) && w.includes(lose[1].id));
    // Läuft in der Skizze ein Zug (Nachbarraum mit geerbtem Maß), gilt der Skizzen-Satz.
    offen=M.mode==='draw' && M.chain!=null ? [M.pts.length+' Ecken. '+zugSatz(),'skizze']
      : ['Raum ist offen. In der Skizze '+(paar
      ? 'schließt ihn ein Klick auf '+lose[0].id+', dann auf '+lose[1].id+'.'
      : 'braucht jede Ecke zwei Wände.'),'skizze'];
  }
  if(M.an.dof>0)
    return offen || [`Noch ${M.an.dof} ${M.an.dof===1?'Maß':'Maße'}, dann ist die Form eindeutig.`,'prog'];
  if(M.an.redundancy===0){
    // "Nicht pruefbar" gilt fuer die einzelne Messung, nicht fuers Netz:
    // passen die Messungen nicht zueinander, verteilt der Fit den Widerspruch
    // als grosse Residuen - harter Beweis fuer einen Fehler, auch wenn keine
    // einzelne Messung isoliert werden kann.
    const {ratio,v}=worstResidualRatio();
    if(ratio>GROSS_ERROR_SIGMA)
      return [`Mindestens ein Maß ist falsch, größte Abweichung ${v.toFixed(0)} mm. Welches, zeigt erst ein Kontrollmaß.`,'bad'];
    return offen || ['Form eindeutig, aber ungeprüft. Ein Kontrollmaß deckt Tippfehler auf.','warn'];
  }
  const txtS=M.an.sigmaHat.toFixed(1).replace('.',',');
  if(netFails()){
    if(M.suspects.size!==1)
      return [`Die Maße streuen mit ± ${txtS} mm mehr als erwartet. Die Vorschläge grenzen den Fehler ein${M.angs.length || C.activeMeas(M.meas).some(m=>m.fix) ? '; auch das Festgelegte kann es sein' : ''}.`,'warn'];
    // Genau ein Verdächtiger: die Strecke beim Namen nennen (Index über
    // activeMeas, wie M.suspects), in der Schreibweise der Liste: die Wand
    // wie gezeichnet, die Diagonale wie zuerst gemessen.
    const act=C.activeMeas(M.meas), sm=act[[...M.suspects][0]], sk=wallKey(sm.a,sm.b);
    const sw=M.walls.find(([a,b])=>wallKey(a,b)===sk), sd=act.find(m=>wallKey(m.a,m.b)===sk);
    // Ist etwas festgelegt (Winkel, exaktes Maß), kann auch das der Fehler sein.
    const fest=M.angs.length || act.some(m=>m.fix);
    return [`Ein Maß passt nicht: ${sw ? 'Wand '+sw[0]+'–'+sw[1] : 'Diagonale '+sd.a+'–'+sd.b}. Nachmessen, abschalten oder löschen${fest ? ', oder das Festgelegte prüfen' : ''}.`,'bad'];
  }
  return offen || [`Geprüft ± ${txtS} mm`,'good'];
}

// ================= Info-Kaestchen =================
// Ein gemeinsames Info-Kaestchen fuer Tabellenwerte. Hover zeigt, Verlassen
// versteckt; auf Touch zeigt der Tipp auf die Zelle dasselbe Kaestchen und
// der naechste Tipp irgendwo anders schliesst es (title-Attribute koennen
// Handys nicht anzeigen - deshalb ein eigenes Element).
function showTip(el, text){
  const tip=$('tip');
  tip.textContent=text;
  tip.hidden=false;
  const r=el.getBoundingClientRect(), tw=tip.offsetWidth, th2=tip.offsetHeight;
  let x=Math.max(8, Math.min(innerWidth-tw-8, r.left+r.width/2-tw/2));
  let y=r.top-th2-8;
  if(y<8) y=r.bottom+8;
  tip.style.left=x+'px'; tip.style.top=y+'px';
}
function hideTip(){ $('tip').hidden=true; }
addEventListener('pointerdown',e=>{
  // Tap ausserhalb einer Tip-Zelle schliesst das Kaestchen (Touch-Pfad).
  if(!(e.target.closest && e.target.closest('[data-tip]'))) hideTip();
});
function attachTip(el, text){
  if(!text) return;
  el.dataset.tip='1';
  el.onmouseenter=()=>showTip(el, text);
  el.onmouseleave=hideTip;
  el.addEventListener('pointerdown',()=>showTip(el, text));
}

// ================= Hover-Texte =================
// Die title-Tooltips des Browsers kommen erst nach 1-2 s. Fuer Maus und Stift
// zeigt dasselbe Info-Kaestchen den title-Text nach kurzer Pause; solange
// liegt der title in data-ttl, damit der Browser nicht zusaetzlich seinen
// zeigt. Von einem Hover-Text zum naechsten geht es ohne Pause weiter.
(()=>{
  const PAUSE=300, WARM=500;
  let cur=null, t=0, zuletzt=-1e9;
  const zurueck=el=>{
    if(el.dataset.ttl==null) return;
    if(!el.hasAttribute('title')) el.setAttribute('title', el.dataset.ttl);
    delete el.dataset.ttl;
  };
  const weg=()=>{
    clearTimeout(t);
    if(!cur) return;
    zurueck(cur); cur=null;
    if(!$('tip').hidden){ hideTip(); zuletzt=performance.now(); }
  };
  const zeigen=el=>{
    if(cur!==el || !el.isConnected) return;
    // Hat der Code den title inzwischen neu gesetzt, gilt der neue.
    if(el.hasAttribute('title')){ el.dataset.ttl=el.getAttribute('title'); el.removeAttribute('title'); }
    const tip=$('tip'), host=el.closest('dialog[open]') || document.body;
    if(tip.parentNode!==host) host.appendChild(tip);
    showTip(el, el.dataset.ttl);
  };
  addEventListener('pointerover',e=>{
    if(e.pointerType==='touch') return;
    const el=e.target.closest && e.target.closest('[data-ttl],[title]:not([data-tip])');
    if(el===cur) return;
    weg();
    if(!el || !el.getAttribute('title')) return;
    cur=el; el.dataset.ttl=el.getAttribute('title'); el.removeAttribute('title');
    t=setTimeout(()=>zeigen(el), performance.now()-zuletzt<WARM ? 0 : PAUSE);
  });
  addEventListener('pointerout',e=>{ if(!e.relatedTarget) weg(); });
  addEventListener('pointerdown',weg,true);
  addEventListener('wheel',weg,{passive:true,capture:true});
  addEventListener('keydown',weg,true);
  addEventListener('blur',weg);
})();

// Die Schale des Panels: Raumname, Titel, Rückgängig; den Rest malt jedes Werkzeug selbst (panel).
// Die Werkzeuge laden NACH diesem Block - beim ersten Bild waehrend des Boots gibt es sie noch nicht.
function renderPanel(){
  $('roomname').textContent=currentRoomName;
  document.title=(currentRoomName && currentRoomName!=='—' ? currentRoomName+' · ' : '')+(TOOLNAME[TOOL] || 'Raumaufmaß');
  $('undo').disabled = !undoStack.length;
  $('redo').disabled = !redoStack.length;
  for(const werk of ALLE) if(werk.panel && werk.panel()) return;
}

// ================= Tastenkuerzel =================
// Eine Tabelle fuer die Uebersicht (?). Schreibweise mit ⌘/⌥/Entf, plat()
// setzt sie fuer Windows um.
// Die Tasten, die in jedem Werkzeug gelten. Jedes Werkzeug hängt seine eigenen an (Anmeldung: tastenVorn
// vor, tasten nach diesen Gruppen).
const KEYS=[
  ['Allgemein',[
    ['Rückgängig','⌘Z'], ['Wiederherstellen','⇧⌘Z'],
    ['Als Datei sichern','⌘S'],
    ['Abbrechen, Karte schließen','Esc'], ['Hilfe und Tasten','?'],
  ]],
  ['Ansicht',[
    ['Zoomen','Mausrad · ⌘+Rad · Pinch · + −'],
    ['Verschieben','Wischen · Leertaste+Ziehen · Mitteltaste · Pfeile'],
    ['Einpassen','0 · Mitteltaste doppelt'],
  ]],
];
// Gruppen als Bloecke in zwei Spalten - frueher lief die Liste im Zickzack.
function renderKeys(){
  $('keysbody').innerHTML='<h3>Tasten und Maus</h3>'+[...ALLE.flatMap(w=>w.tastenVorn||[]), ...KEYS, ...ALLE.flatMap(w=>w.tasten||[])].map(([h,rows])=>`<section class="kgrp"><h4>${escapeHtml(h)}</h4>`
    +rows.map(([d,k])=>`<p><span>${escapeHtml(d)}</span><kbd>${escapeHtml(plat(k))}</kbd></p>`).join('')+'</section>').join('');
}
function closeKeys(){ const w=$('keyswrap'); if(w.hidden) return false; w.hidden=true; return true; }
$('keysclose').onclick=closeKeys;
$('keyswrap').addEventListener('pointerdown',e=>{ if(e.target===$('keyswrap')) closeKeys(); });
// Hilfe: der Ablauf in Worten, statisch im Markup.
function toggleHelp(){ const w=$('helpwrap');
  // Ein Nachschlage-Dialog: die Tastenliste steht unter dem Ablauf.
  if(w.hidden){ renderKeys(); if($('keysbody').parentNode!==$('helpbody')) $('helpbody').appendChild($('keysbody')); }
  w.hidden=!w.hidden;
  // Fokus in den Dialog: sonst rollen Pfeile und Bild-Tasten nichts.
  if(!w.hidden){ const b=$('helpbox'); b.tabIndex=-1; b.style.outline='none'; b.scrollTop=0; b.focus({preventScroll:true}); } }
function closeHelp(){ const w=$('helpwrap'); if(w.hidden) return false; w.hidden=true; return true; }
$('helpBtn').onclick=toggleHelp;
// Ein offener Dialog hält den Fokus: Tab wandert nicht in die verdeckte Seite
// (dort löste Enter sonst Knöpfe aus, die man nicht sieht).
document.addEventListener('focusin', e=>{
  const w=[$('helpwrap'), $('qrwrap'), $('keyswrap')].find(x=>x && !x.hidden);
  if(!w || w.contains(e.target) || (e.target.closest && e.target.closest('#mldwrap'))) return;
  const alle=[...w.querySelectorAll('button, [href], input, select, textarea, [tabindex]')].filter(x=>!x.disabled && x.offsetParent!==null);
  if(!alle.length) return;
  // Von vorn hinaus (⇧Tab auf dem ersten): weiter am Ende; sonst an den Anfang.
  (e.relatedTarget===alle[0] ? alle[alle.length-1] : alle[0]).focus({preventScroll:true});
});
$('helpclose').onclick=closeHelp;
$('helpwrap').addEventListener('pointerdown',e=>{ if(e.target===$('helpwrap')) closeHelp(); });
// Kuerzel und Tooltips in der Schreibweise der Plattform.
document.querySelectorAll('kbd[data-k]').forEach(k=>{ k.textContent=plat(k.dataset.k); });
document.querySelectorAll('[title]').forEach(el=>{ el.title=plat(el.title); });

// ================= Werkzeugfamilie =================
// Diese Datei ist drei Werkzeuge: das Raumaufmaß und, solange Fliesenplan und
// Küchenplaner noch keine eigene Datei haben, auch diese beiden. Welches sie
// gerade ist, steht in der Adresse (#fliesen, #kueche) und am body.
const TOOLNAME={aufmass:'', fliesen:'Fliesenplan', kueche:'Küchenplaner'};
// Jedes Werkzeug ist eine eigene Seite: ein anderes Werkzeug heißt eine andere Seite öffnen. Der Raum reist über
// sessionStorage mit (uebergabe), die Rückmeldung einer Absage ebenso (absage). Rückgängig, Ansicht und
// Auswahl beginnen auf der neuen Seite neu.
const SEITEN={aufmass:'raumaufmass.html', fliesen:'fliesenplan.html', kueche:'kuechenplaner.html'};
function wechsleSeite(tool, absage){
  alleWerkzeuge('vorRaumwechsel');            // Vorgemerktes noch in diesen Raum schreiben
  try{
    sessionStorage.setItem('raumaufmass.uebergabe', currentRoom);
    if(absage) sessionStorage.setItem('raumaufmass.absage', absage);
  }catch(e){}
  location.assign(SEITEN[tool]);
}
const raumGeschlossen=()=>!!C.wallPolygonRing(M.pts, M.walls);
function setTool(tool, boot){
  // Der Wechsel räumt jede ältere Rückmeldung weg (setMode); die eigene
  // Absage kommt deshalb erst danach.
  let absage=null;
  if(tool==='fliesen' && !tilesReady()){
    tool='aufmass'; absage='Der Fliesenplan braucht einen geschlossenen, eingemessenen Raum.'; }
  if(tool==='kueche' && !kitchenReady()){
    tool='aufmass'; absage='Der Küchenplaner braucht eine eindeutige Form.'; }
  if(tool!==TOOL){ wechsleSeite(tool, absage); return; }
  document.body.dataset.tool=tool;
  $('toolname').hidden = tool==='aufmass';
  $('toolname').textContent=TOOLNAME[tool];
  alleWerkzeuge('vorModus');
  $('hint').textContent='';
  // Die Planfläche ist je Werkzeug eine andere (der Küchenplaner teilt sie mit
  // 3D): eine gemerkte Ansicht passte dort nicht mehr, also neu einpassen.
  if(!boot) userView=false;
  if(tool==='fliesen') setMode('tiles');
  else if(tool==='kueche') setMode('kitchen');
  // Im Raumaufmaß beginnt man dort, wo der Raum steht: offen in der Skizze,
  // geschlossen bei den Maßen.
  else setMode((raumGeschlossen() || M.meas.length) ? 'measure' : 'draw');
  if(absage) sag(absage);
}
// „Zum Raumaufmaß“ im Menü gibt es nur auf den Seiten der Folgewerkzeuge.
if($('toAufmass')) $('toAufmass').onclick=()=>setTool('aufmass');

// ================= Rückmeldung am Ort =================
// Es gibt keine Statuszeile mehr. Was eine Aktion zurückmeldet, erscheint
// kurz dort, wo sie ausgelöst wurde: am Anker, über der offenen Karte oder am
// Zeiger.
let sagTimer=null, sagLive=false, lastPtr=null;
addEventListener('pointerdown',e=>{ lastPtr={x:e.clientX, y:e.clientY, t:performance.now(),
  plan:!!(e.target.closest && e.target.closest('#canvaswrap'))}; }, true);
function sag(txt, anker, bleibt){
  const el=$('toast');
  clearTimeout(sagTimer);
  if(!txt){ el.classList.remove('on'); sagLive=false; return; }
  el.textContent=plat(txt);
  // Erst messen, dann setzen: nahe am rechten Rand bräche der Text sonst früher um.
  el.style.left='0px';
  const w=el.offsetWidth, h=el.offsetHeight;
  const offen=[$('wpop'),$('cpop'),$('entry'),$('oppl')].find(x=>x && !x.hidden);
  const r=anker ? anker.getBoundingClientRect() : null, box=offen ? offen.getBoundingClientRect() : null;
  const plan=$('canvaswrap').getBoundingClientRect();
  const nah=lastPtr && performance.now()-lastPtr.t<1500;
  const imBox=box && nah && lastPtr.x>=box.left && lastPtr.x<=box.right && lastPtr.y>=box.top && lastPtr.y<=box.bottom;
  // x: Mitte, y: Oberkante.
  let x, y, links=12;
  // Über der offenen Karte; fehlt dort der Platz, darunter.
  const anKarte=()=>{ x=box.left+box.width/2; y=box.top-8-h; if(y<plan.top+4) y=box.bottom+8; };
  // Am Anker: darunter; fehlt dort der Platz, darüber. Nie auf ihm.
  // Sitzt der Anker in der offenen Karte, läge die Meldung auf ihr: dann an die Karte.
  if(r && r.width && offen && offen.contains(anker)) anKarte();
  else if(r && r.width){ x=r.left+r.width/2; y=r.bottom+10; if(y+h>innerHeight-8) y=r.top-10-h; }
  else {
    if(box && (imBox || !nah)) anKarte();
    // Am Zeiger nur im Plan: ein Klick im Panel oder in der Leiste ist kein Ort im Plan.
    else if(nah && lastPtr.plan){ x=lastPtr.x; y=lastPtr.y-16-h; }
    // Sonst unten mittig im Plan, neben dem Melde-Knopf und nie über dem Panel.
    else {
      x=plan.left+plan.width/2; y=plan.bottom-16-h;
      const f=$('mldFab'), fr=f ? f.getBoundingClientRect() : null;
      if(fr && fr.width && fr.top<y+h && fr.bottom>y) links=fr.right+8;
    }
    // Nie auf der offenen Karte.
    if(box && y<box.bottom && y+h>box.top && x-w/2<box.right && x+w/2>box.left) anKarte();
  }
  el.style.left=Math.max(links, Math.min(innerWidth-12-w, x-w/2))+'px';
  el.style.top=Math.max(8, Math.min(innerHeight-8-h, y))+'px';
  el.classList.add('on');
  if(!bleibt) sagTimer=setTimeout(()=>el.classList.remove('on'), 2600+Math.min(3200, txt.length*32));
}

// ================= Stand =================
// Kurzform für den Speicher (der Startbildschirm zeigt sie) und fürs Blatt.
function standInfo(){
  const [text, cls]=statusText();
  const eindeutig=!!(M.an && M.an.dof===0 && M.fit && M.fit.converged!==false);
  return {tone: cls==='good' ? 'good' : cls==='bad' ? 'bad' : cls==='skizze' ? '' : 'warn',
          text, eindeutig, geprueft: cls==='good'};
}
function standKurz(){ const s=standInfo(); return {tone:s.tone, text:s.text, eindeutig:s.eindeutig}; }
$('roomname').onkeydown=e=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); renameCurrentRoom(); } };
// Geteilter Link: beim Kaltstart UND als blosse Hash-Aenderung im offenen
// Tab (same-document navigation, kein Reload) - ein Pfad fuer beides.
function importFromHash(){
  const shared=parseShareFragment(location.hash);
  if(!shared) return null;
  history.replaceState(null,'',location.pathname+location.search);
  const err=importAsNewRoom(shared.name, shared.data);
  return err===IMPORT_VOLL ? 'Der Raum aus dem Link ließ sich nicht speichern. '+err
       : err ? 'Geteilter Link ungültig: '+err
             : STORE.storageOk ? 'Geteilter Raum importiert und als eigener Raum gespeichert.'
             : 'Geteilter Raum geöffnet. Auf diesem Gerät wird nichts gespeichert.';
}

// Der Boot: läuft, wenn die Seite alle ihre Skripte geladen hat (Aufruf am Ende des letzten Bedien-Skripts).
function starteSeite(tool){
  // Fehlt eine Kerndatei (Karte der Seite „unvollständig geladen“), startet nichts: kein Raum, kein Speichern.
  if(globalThis.RAUM_UNVOLLSTAENDIG) throw new Error('Die Seite startet nicht, unvollständig geladen: '+globalThis.RAUM_UNVOLLSTAENDIG.join(', '));

  // ================= Boot =================
  // Reihenfolge: migrieren -> Fragment-Import -> Raum laden -> UI aufbauen -
  // und ERST DANN die Hinweise: setMode() setzt den Modus-Standardhinweis,
  // jeder frueher gesetzte Text waere vor dem ersten Bild wieder weg.
  STORE.migrate();
  const bootMsg=importFromHash();
  addEventListener('hashchange',()=>{
    const msg=importFromHash();
    if(msg) setHint(msg);
  });
  if(!currentRoom){
    // deserialize() wirft auf manuell verbogenen Storage-Daten - das darf
    // den Boot nicht toeten, sonst bleibt die Seite leer statt leerzustarten.
    try{
      let cur=STORE.currentId();
      // Werkzeugwechsel: der Raum, den die vorige Seite übergeben hat. Neuladen, Zurück und Vor: der Raum
      // dieses Fensters, nicht der zuletzt irgendwo geöffnete.
      try{
        const nav=performance.getEntriesByType('navigation')[0], eigen=sessionStorage.getItem('raumaufmass.fenster');
        const uebergabe=sessionStorage.getItem('raumaufmass.uebergabe');
        sessionStorage.removeItem('raumaufmass.uebergabe');
        if(uebergabe && STORE.load(uebergabe)) cur=uebergabe;
        else if(nav && (nav.type==='reload' || nav.type==='back_forward') && eigen && STORE.load(eigen)) cur=eigen;
      }catch(e){}
      if(cur && STORE.load(cur)) openRoom(cur);
      else {
        const l=STORE.list();
        if(l.length) openRoom(l[0].id);
      }
    }catch(e){ currentRoom=null; }
    if(!currentRoom){
      currentRoom=STORE.create('Neuer Raum');
      STORE.setCurrent(currentRoom);
      currentRoomName='Neuer Raum';
    }
  }
  TOOL=tool; document.body.dataset.tool=TOOL;
  setMode('draw');
  alleWerkzeuge('start');
  recompute();
  // Fliesen und Küche laden nach diesem Block; erst danach steht fest, ob das
  // gewünschte Werkzeug den Raum schon öffnen kann.
  // setHintLive statt setHint: Boot-Meldungen duerfen nicht nach vier
  // Sekunden verschwinden, bevor ueberhaupt jemand hingesehen hat - sie
  // stehen, bis die erste Aktion etwas meldet. Erst NACH setTool: der
  // Werkzeugwechsel raeumt jede Rueckmeldung weg (setMode).
  addEventListener('DOMContentLoaded',()=>{
    setTool(TOOL, true);
    let absage=null;
    try{ absage=sessionStorage.getItem('raumaufmass.absage'); sessionStorage.removeItem('raumaufmass.absage'); }catch(e){}
    if(absage) sag(absage);
    if(bootMsg) setHintLive(bootMsg);
    if(!STORE.storageOk)
      setHintLive('Speichern auf diesem Gerät nicht möglich (privater Modus?). Räume als Datei oder Link sichern.');
    else if(recompute.quotaWarned)
      setHintLive('Speichern fehlgeschlagen (Speicher voll?). Raum als Datei oder Link sichern.');
  });
}

// Aus dem Seitencache zurückgeholt (Zurück-Taste): das Modell dieser Seite ist alt, ein anderes Werkzeug hat den
// Raum inzwischen geändert. Neu laden holt ihn aus dem Speicher (der Raum des Fensters bleibt über sessionStorage).
addEventListener('pageshow', e=>{ if(e.persisted) location.reload(); });
