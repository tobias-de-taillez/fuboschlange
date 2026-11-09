// raum-blatt.js – das druckbare Aufmaßblatt der Werkzeugfamilie Raumaufmaß:
// Grundriss mit Längen, Fläche, Umfang und Stand; danach je Wand die Ansicht
// von innen; auf Wunsch die Liste aller Maße.
//
// Klassisches Skript, kein Modul, läuft per file://. Legt globalThis.BLATT an:
//   BLATT.css                          CSS der Blätter (Vorschau und Druckregeln, Präfix "bl-")
//   BLATT.modell([quelle])             liest den offenen Raum, liefert reine Daten
//   BLATT.html(modell, {mitMassliste})  reine Funktion, DOM-frei: die Blätter als HTML
//   BLATT.blaetter(modell, opt)        dasselbe als Liste {art, svg}
//   BLATT.dokument(modell, opt)        vollständiges Druckdokument als Zeichenkette (mit BLATT.druckCss)
//   BLATT.drucken({mitMassliste})      druckt nur die Blätter, A4 hoch, je Blatt eine Seite
//
// Braucht für modell(): raum-kern.js (CORE), raum-geometrie.js (wallShape,
// cornerHeights, solveOpening, outerNormal, globalTestFails, computeSuspects),
// raum-modell.js (M, fitPts, currentRoomName). Optional vom Werkzeug:
// standInfo() -> {tone, text, eindeutig, geprueft}; fehlt sie, wird der Stand
// wie in statusText hergeleitet. VIEW.rot (raum-zeichnung.js) dreht den
// Grundriss so, wie er auf dem Schirm liegt.
//
// Jedes Blatt ist EIN SVG im Maß 560 × 792 (A4, 1 Einheit = 0,375 mm). Damit
// sieht die Vorschau aus wie der Druck, und bei 100 % auf A4 stimmen die
// angegebenen Maßstäbe. Schriftgrößen wie in DESIGN.md, Abschnitt Blatt.
"use strict";
(function(){
const G=globalThis;

// ================= Konstanten =================
// Die vier Farben des Blatts (DESIGN.md, "Blatt (Druck)").
const TINTE='#1c1b18', GEDAEMPFT='#6b665b', LINIE='#e5e2da', FLAECHE='#f4f2ec', WEISS='#fff';
const SCHRIFT='system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
// Blatt in Einheiten: Innenrand 7 % seitlich, 6,5 % oben und unten.
const BB=560, BH=792, X0=39.2, X1=520.8, W=X1-X0, Y0=51.5, Y1=740.5;
const UPM=BB/210;                     // Einheiten je Millimeter Papier
const MASSSTAEBE=[5,10,20,25,50,75,100,125,150,200,250,500,1000];
const KURZ=300;                       // mm: darunter keine eigene Ansicht
const H_STANDARD=2500;
const ART={door:'Tür', window:'Fenster', hole:'Loch'};
const TYP={ door:{turn:'Drehflügel', slide:'Schiebetür', none:'ohne Türblatt'},
            window:{turntilt:'Dreh-Kipp', turn:'Dreh', tilt:'Kipp', top:'Klapp', pivot:'Schwing',
                    stulp:'Stulp (zweiflügelig)', fix:'fest verglast'} };

// ================= Kleine Helfer =================
const ESC={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g, c=>ESC[c]);
const komma=(x,n)=>x.toFixed(n).replace('.',',');
const fm=mm=>komma(mm/1000,3);                       // Länge in m, drei Stellen
const fmm=mm=>String(Math.round(mm));                // Öffnungsmaße in mm
const fAbw=v=>{ const r=Math.round(v*10)/10; return (r>0?'+':r<0?'−':'')+komma(Math.abs(r),1)+' mm'; };
const n2=x=>(Math.round(x*100)/100).toString();      // Koordinaten im SVG
const schluessel=(a,b)=>[a,b].sort().join('|');
const strecke=(a,b)=>a+'–'+b;
const hyp=(p,q)=>Math.hypot(p.x-q.x, p.y-q.y);

// Geschätzte Textbreite in Einheiten. Ohne DOM lässt sich nicht messen; die
// Werte sind für die Systemschrift eher zu breit als zu schmal angesetzt.
function breite(s, fs, fett){
  let w=0;
  for(const ch of String(s)){
    w += /[0-9]/.test(ch) ? .6 : (ch===' '||ch===' ') ? .28
      : /[.,:;·'|!ilIjtf()\/]/.test(ch) ? .33 : /[mwMW]/.test(ch) ? .88
      : /[A-ZÄÖÜ]/.test(ch) ? .68 : /[–—−+×=±]/.test(ch) ? .62 : .55;
  }
  // Kleine Grade laufen in den Systemschriften etwas weiter.
  return w*fs*(fett?1.06:1)*(fs<10?1.1:1);
}
function kuerzen(s, fs, fett, max){
  s=String(s);
  if(breite(s,fs,fett)<=max) return s;
  while(s.length>1 && breite(s+'…',fs,fett)>max) s=s.slice(0,-1);
  return s.trimEnd()+'…';
}
// Ein Textelement. o: {fs, a:'start'|'middle'|'end', f:Farbe, b:fett, hof:weißer Lichthof}
function T(x, y, s, o){
  if(s==null || s==='') return '';
  o=o||{};
  return `<text x="${n2(x)}" y="${n2(y)}"${o.fs?` font-size="${o.fs}"`:''}${o.a&&o.a!=='start'?` text-anchor="${o.a}"`:''}`
    +`${o.f?` fill="${o.f}"`:''}${o.b?' font-weight="600"':''}`
    +`${o.hof?` stroke="${WEISS}" stroke-width="${o.hof}" stroke-linejoin="round" paint-order="stroke"`:''}>${esc(s)}</text>`;
}
// Zeile aus Stücken [{t, b, f}] als ein Textelement mit tspans.
function Z(x, y, stuecke, fs){
  return `<text x="${n2(x)}" y="${n2(y)}" font-size="${fs}">`
    + stuecke.map(s=>`<tspan${s.b?' font-weight="600"':''}${s.f?` fill="${s.f}"`:''}>${esc(s.t)}</tspan>`).join('')+'</text>';
}
const stueckBreite=(st,fs)=>st.reduce((s,x)=>s+breite(x.t,fs,x.b),0);
// Gruppen von Stücken zu Zeilen umbrechen; zwischen Gruppen steht " · ".
function umbrechen(gruppen, fs, max){
  const zeilen=[]; let cur=[], w=0;
  const trenner={t:' · ', f:GEDAEMPFT}, tw=breite(' · ',fs);
  gruppen.forEach(g=>{
    const gw=stueckBreite(g,fs);
    if(cur.length && w+tw+gw>max){ zeilen.push(cur); cur=[]; w=0; }
    if(cur.length){ cur.push(trenner); w+=tw; }
    cur.push(...g); w+=gw;
  });
  if(cur.length) zeilen.push(cur);
  return zeilen;
}
// Fließtext an Leerzeichen umbrechen.
function textZeilen(s, fs, max){
  const out=[]; let cur='';
  String(s).split(/\s+/).filter(Boolean).forEach(wort=>{
    const probe=cur ? cur+' '+wort : wort;
    if(cur && breite(probe,fs)>max){ out.push(cur); cur=wort; } else cur=probe;
  });
  if(cur) out.push(cur);
  return out;
}

// ================= Modell: den offenen Raum lesen =================
// quelle (optional, für Tests und andere Werkzeuge der Familie):
// {M, name, datum, drehung, standInfo, statusText}. Ohne Angabe gelten die
// Globalen des Werkzeugs.
function modell(quelle){
  const q=quelle||{};
  const C=G.CORE;
  const Mglobal=typeof M!=='undefined' ? M : null;
  const Mx=q.M || Mglobal;
  if(!C || !Mx) throw new Error('BLATT.modell: CORE (raum-kern.js) oder M (raum-modell.js) fehlt.');
  // Stand, Name und Drehung des Werkzeugs gelten nur für dessen eigenen Raum.
  const eigen=Mx===Mglobal;
  const hatFit=!!(Mx.fit && Mx.fit.pts && Mx.fit.pts.length);
  // Zahlen immer aus dem Ausgleich, nie aus der Skizze (wie fitPts()).
  const P=hatFit ? Mx.fit.pts : (Mx.pts||[]);
  const I=C.idx(P);
  const walls=(Mx.walls||[]).filter(([a,b])=>I[a]!=null && I[b]!=null);
  const act=C.activeMeas(Mx.meas||[]);
  const an=Mx.an||null;
  const sus=(Mx.suspects instanceof Set) ? Mx.suspects
    : (an && G.computeSuspects ? G.computeSuspects(an.w, 3.29, 0.02) : new Set());

  const stand=standVon(Mx, C, q, sus, eigen);
  const eindeutig=stand.eindeutig, geprueft=stand.geprueft;

  // ---- Wandzug: Ringe, Fläche, Umfang ----
  const poly=walls.length ? C.wallPolygon(P, walls) : null;
  const ringe=poly ? [poly, ...(poly.holes||[])].map(R=>R.map(p=>p.id)) : [];
  let flaeche=null, umfang=null;
  if(poly && hatFit){
    flaeche=C.roomArea(poly)/1e6;
    let u=0;
    [poly, ...(poly.holes||[])].forEach(R=>{ for(let i=0,j=R.length-1;i<R.length;j=i++) u+=C.dist(R[j],R[i]); });
    umfang=u/1000;
  }
  const belastbar=!!(poly && hatFit && eindeutig && stand.tone!=='bad');

  // ---- Wände ringsum, mit Länge und Ansicht von innen ----
  const flipVon=(a,b)=>{
    if(!G.outerNormal) return false;
    const A=P[I[a]], B=P[I[b]], n=G.outerNormal(P, walls, a, b);
    return (B.x-A.x)*n.y-(B.y-A.y)*n.x > 0;
  };
  const gemessen=new Set(act.map(m=>schluessel(m.a,m.b)));
  const H=G.cornerHeights ? G.cornerHeights(P, Mx.hmeas||[]) : {};
  const eckHoehen=(Mx.hmeas||[]).filter(m=>m.kind==='h' && m.on!==false && Number.isFinite(m.d) && m.d>=0);
  const verschiedeneHoehen=new Set(eckHoehen.map(m=>Math.round(m.d))).size>1;
  const lageV=new Map();        // Lagemaß -> Abweichung
  const lageVerdacht=new Set(); // ids der Lagemaße, die nicht passen
  const lageVersetzt=new Set(); // ids der Lagemaße, auf denen ihre Öffnung nicht liegt
  const waende=wandFolge(C, P, walls, flipVon).map(({a,b,ring})=>{
    const k=schluessel(a,b);
    const L=C.dist(P[I[a]], P[I[b]]);
    const hatMass=gemessen.has(k);
    const laenge=(hatFit && (eindeutig || hatMass) && L>0) ? L : null;
    const t=Mx.thick && Mx.thick[k];
    const wand={a, b, ring, laenge, gemessen:hatMass, dicke:(t>0 ? t : null), ansicht:null};
    const shape=(laenge!=null && G.wallShape) ? G.wallShape(P, Mx.hmeas||[], a, b) : null;
    if(!shape || !(shape.L>0)) return wand;
    const flip=flipVon(a,b);
    const vx=x=>flip ? shape.L-x : x;
    const links=flip?b:a, rechts=flip?a:b;
    const top=shape.top.map(p=>({x:vx(p.x), y:p.y})).sort((p,q2)=>p.x-q2.x);
    const items=[];
    (Mx.openings||[]).filter(o=>schluessel(o.a,o.b)===k).forEach(o=>{
      const xa=o.a===a ? o.x : shape.L-o.x-o.w;          // ab Ecke a der Wand
      // Einmessung in der Richtung der Öffnung selbst (left = Seite von o.a).
      const sh=G.wallShape(P, Mx.hmeas||[], o.a, o.b);
      const r=(sh && G.solveOpening) ? G.solveOpening(sh, o, Mx.opmeas||[]) : null;
      const nx=r?r.x.n:0, ny=r?r.y.n:0;
      // Liegt die Öffnung nicht, wo ihre Maße sie hinlegen (sie stößt mit einer
      // anderen zusammen oder passt so nicht in die Wand), stehen in Ansicht
      // und Maßliste verschiedene Zahlen: als Widerspruch kennzeichnen.
      const st=(r && G.settleOpening) ? G.settleOpening(sh, o, (Mx.openings||[]).filter(x=>schluessel(x.a,x.b)===k), Mx.opmeas||[]) : null;
      const versetzt=!!st && (st.stoesst.length>0 || st.wand);
      if(r){
        let ix=0, iy=0;
        r.rows.forEach(row=>{
          const istX=row.achse==='x', n=istX ? nx : ny;
          // Lage minus eingemessene Lage: 0, solange die Öffnung auf ihrem Maß liegt.
          const ab=(istX ? o.x-r.x.wert : o.y-r.y.wert)||0, v=(istX ? r.x.v[ix++] : r.y.v[iy++])+ab;
          const daneben=versetzt && Math.abs(ab)>0.05;
          // Vorzeichen wie bei den Strecken: ausgeglichener Abstand minus Maß.
          lageV.set(row.m, (daneben || !(n>1 || Math.abs(ab)>0.05)) ? null : ((row.m.edge==='left'||row.m.edge==='bottom') ? v : -v));
          if(daneben) lageVersetzt.add(row.m.id);
        });
        r.verdacht.forEach(id=>lageVerdacht.add(id));
      }
      const tuer=o.kind==='door';
      const seitlich=nx>0, hoehe=tuer ? true : ny>0;
      const sw=o.swing||null;
      items.push({ id:o.id, anschluss:false, art:o.kind, name:ART[o.kind]||'Öffnung',
        typ:(sw && TYP[o.kind] && TYP[o.kind][sw.type]) || null,
        x:flip ? shape.L-xa-o.w : xa, xa, y:o.y, w:o.w, h:o.h,
        lage:{seitlich:seitlich?'eingemessen':'geschätzt', hoehe:tuer?'Boden':(ny>0?'eingemessen':'geschätzt')},
        geschaetzt:!(seitlich && hoehe) || versetzt, versetzt, widerspruch:!!(r && r.verdacht.size),
        // Band von innen gesehen links? hinge 'left' ist die Seite von o.a.
        symbol:sw ? {typ:sw.type, bandLinks:(sw.hinge==='left')===(o.a===links), aussen:!!sw.out} : null });
    });
    (Mx.water||[]).filter(w=>schluessel(w.a,w.b)===k).forEach(w=>{
      const xa=w.a===a ? w.x : shape.L-w.x;
      items.push({ id:w.id, anschluss:true, art:'water', name:'Wasser', x:vx(xa), xa, y:w.y, w:0, h:0 });
    });
    items.sort((p,q2)=>p.x-q2.x).forEach((it,i)=>{ it.nr=i+1; });
    wand.ansicht={
      L:shape.L, hMax:shape.hMax, gespiegelt:flip,
      links:{id:links, h:flip?shape.hb:shape.ha, gemessen:!!(H[links]&&H[links].gemessen)},
      rechts:{id:rechts, h:flip?shape.ha:shape.hb, gemessen:!!(H[rechts]&&H[rechts].gemessen)},
      top, knicke:shape.knicks.map(p=>({x:vx(p.x), y:p.y})).sort((p,q2)=>p.x-q2.x),
      // Wie in der Wandansicht des Werkzeugs: EINE gemessene Höhe für den
      // ganzen Raum ist der Normalfall. Erst bei verschiedenen Höhen ist eine
      // geerbte Ecke eine Annahme.
      hoehe:!eckHoehen.length ? 'angenommen' : (!shape.gemessen && verschiedeneHoehen) ? 'übernommen' : 'gemessen',
      oeffnungen:items.filter(it=>!it.anschluss), anschluesse:items.filter(it=>it.anschluss),
    };
    return wand;
  });

  // ---- Maße: Strecken, Höhen, Lage der Öffnungen ----
  const wandNr=new Map(waende.map((w,i)=>[schluessel(w.a,w.b), i]));
  const masse=(Mx.meas||[]).map((m,i)=>{
    const ai=act.indexOf(m);
    const w=(ai>=0 && an) ? an.w[ai] : null;
    return { a:m.a, b:m.b, wand:wandNr.has(schluessel(m.a,m.b)), d:m.d, an:m.on!==false, fix:!!m.fix,
      abw:(ai>=0 && an && hatFit && Number.isFinite(an.v[ai])) ? an.v[ai] : null,   // Länge minus Maß, mm
      geprueft:w!=null, verdaechtig:ai>=0 && sus.has(ai), vonNachbar:m.von==='nachbar', i };
  }).sort((x,y)=>{
    const kx=wandNr.get(schluessel(x.a,x.b)), ky=wandNr.get(schluessel(y.a,y.b));
    return (kx==null?1e9:kx)-(ky==null?1e9:ky) || x.i-y.i;       // Wände ringsum, dann Diagonalen
  }).map(({i, ...rest})=>rest);
  const jeEcke=new Map();
  eckHoehen.forEach(m=>{ if(!jeEcke.has(m.at)) jeEcke.set(m.at, []); jeEcke.get(m.at).push(m.d); });
  const mittel=a=>a.reduce((s,x)=>s+x,0)/a.length;
  const hoehenMasse=(Mx.hmeas||[]).map(m=>{
    if(m.kind==='h'){
      const l=jeEcke.get(m.at)||[];
      return {art:'ecke', ecke:m.at, d:m.d, an:m.on!==false,
              abw:(m.on!==false && l.length>1) ? mittel(l)-m.d : null};
    }
    if(m.kind==='k') return {art:'knick', a:m.a, b:m.b, x:m.x, d:m.d, an:m.on!==false, abw:null};
    return null;
  }).filter(Boolean);
  const lageMasse=(Mx.opmeas||[]).map(m=>{
    const o=(Mx.openings||[]).find(x=>x.id===m.op);
    if(!o) return null;
    const w=waende[wandNr.get(schluessel(o.a,o.b))];
    if(!w) return null;
    const it=w.ansicht && w.ansicht.oeffnungen.find(x=>x.id===o.id);
    return { a:w.a, b:w.b, nr:it?it.nr:null, art:ART[o.kind]||'Öffnung',
      kante:m.edge==='left' ? 'ab '+o.a : m.edge==='right' ? 'ab '+o.b : m.edge==='bottom' ? 'ab Boden' : 'ab Decke',
      d:m.d, an:m.on!==false, abw:lageV.has(m) ? lageV.get(m) : null, verdaechtig:lageVerdacht.has(m.id),
      widerspruch:lageVersetzt.has(m.id) };
  }).filter(Boolean);

  return {
    name:q.name!=null ? String(q.name) : (eigen && typeof currentRoomName!=='undefined' ? String(currentRoomName) : ''),
    datum:q.datum || new Date().toLocaleDateString('de-DE'),
    drehung:Number.isFinite(q.drehung) ? q.drehung
      : (eigen && typeof VIEW!=='undefined' && VIEW && Number.isFinite(VIEW.rot) ? VIEW.rot : 0),
    hatFit, eindeutig, geprueft, stand,
    ecken:P.map(p=>({id:p.id, x:p.x, y:p.y})),
    waende, ringe, geschlossen:!!poly,
    flaeche, umfang, inseln:poly ? (poly.holes||[]).length : 0, belastbar,
    hoeheAngenommen:!eckHoehen.length, hoeheStandard:H_STANDARD,
    masse, hoehenMasse, lageMasse,
  };
}

// Wände ringsum statt in Anlegereihenfolge: erst der Raum, dann jede Insel,
// jeweils so, dass die nächste Wand die ist, die von innen gesehen rechts
// anschließt (wie wallList im Werkzeug). ring: 0 = Raum, 1.. = Insel,
// -1 = kein geschlossener Wandzug.
function wandFolge(C, P, walls, flipVon){
  const roh=walls.map(([a,b])=>({a,b,ring:-1}));
  const loops=C.wallLoops(P, walls);
  if(!loops) return roh;
  const byKey=new Map(walls.map(([a,b])=>[schluessel(a,b),{a,b}]));
  const fl=L=>{ let s=0; for(let i=0,j=L.length-1;i<L.length;j=i++) s+=L[j].x*L[i].y-L[i].x*L[j].y; return Math.abs(s); };
  const out=[], drin=new Set();
  [...loops].sort((p,q)=>fl(q)-fl(p)).forEach((L,g)=>{
    let ids=L.map(p=>p.id);
    const w0=byKey.get(schluessel(ids[0],ids[1]));
    if(!w0) return;
    const rechts=flipVon(w0.a,w0.b) ? w0.a : w0.b;
    if(rechts!==ids[1]) ids=[ids[0], ...ids.slice(1).reverse()];
    ids.forEach((id,i)=>{
      const w=byKey.get(schluessel(id, ids[(i+1)%ids.length]));
      if(w && !drin.has(schluessel(w.a,w.b))){ drin.add(schluessel(w.a,w.b)); out.push({...w, ring:g}); }
    });
  });
  roh.forEach(w=>{ if(!drin.has(schluessel(w.a,w.b))) out.push(w); });
  return out;
}

// Der Stand: zuerst standInfo() des Werkzeugs, sonst statusText(), sonst
// dieselbe Herleitung hier. geprueft heißt: die Form ist eindeutig UND es
// gibt mindestens ein Kontrollmaß.
function standVon(Mx, C, q, sus, eigen){
  const an=Mx.an||null, fit=Mx.fit||null;
  const ruhig=!(fit && fit.converged===false);
  const eindeutig=!!(an && an.dof===0 && (Mx.walls||[]).length && ruhig);
  const red=an ? an.redundancy : 0;
  const genau=(eindeutig && red>0 && Number.isFinite(an.sigmaHat)) ? an.sigmaHat : null;
  // Kurzform fürs Feld im Fuß, wo Ton und Schalter allein nicht reichen: mit
  // Kontrollmaßen eindeutig und trotzdem nur "warn" heißt, die Maße streuen.
  const kurzZu=(tone, eind)=>(tone!=='good' && tone!=='bad' && eind && red>0) ? 'Maße streuen auffällig' : null;
  const fn=q.standInfo || (eigen && typeof standInfo==='function' ? standInfo : null);
  if(fn){
    try{
      const s=fn();
      if(s && typeof s.text==='string'){
        const tone=String(s.tone||'');
        return { tone, text:s.text, eindeutig:!!s.eindeutig, geprueft:!!s.geprueft,
          genauigkeit:Number.isFinite(s.genauigkeit) ? s.genauigkeit : (tone==='good' ? genau : null),
          kurz:typeof s.kurz==='string' ? s.kurz : kurzZu(tone, !!s.eindeutig) };
      }
    }catch(e){ /* dann die Herleitung unten */ }
  }
  const st=q.statusText || (eigen && typeof statusText==='function' ? statusText : null);
  if(st){
    try{
      const r=st();
      if(Array.isArray(r) && typeof r[0]==='string'){
        const tone=['good','warn','bad'].includes(r[1]) ? r[1] : '';     // prog, skizze: neutral
        return {tone, text:r[0], eindeutig, geprueft:eindeutig && red>0, genauigkeit:tone==='good' ? genau : null, kurz:kurzZu(tone, eindeutig)};
      }
    }catch(e){ /* dann die Herleitung unten */ }
  }
  const S=(tone,text,extra)=>({tone, text, eindeutig, geprueft:eindeutig && red>0, genauigkeit:null, kurz:null, ...(extra||{})});
  if(!(Mx.pts||[]).length) return S('', 'Noch keine Ecke.');
  if(Mx.pts.length<3 || !an) return S('', 'Skizze ohne Maße.');
  if(!ruhig) return S('bad', 'Der Ausgleich kommt nicht zur Ruhe. Das Ergebnis ist nicht belastbar.');
  const act=C.activeMeas(Mx.meas||[]);
  if(act.some((m,i)=>m.fix && Math.abs(an.v[i])>1))
    return S('bad', 'Festgelegtes passt nicht zusammen.');
  if(an.dof>0) return S('', `Noch ${an.dof} ${an.dof===1?'Maß':'Maße'}, dann ist die Form eindeutig.`);
  if(red===0){
    let ratio=0, v=0;
    an.v.forEach((vi,i)=>{ const r=Math.abs(vi)/(act[i].sigma??C.SIGMA_DEF); if(r>ratio){ ratio=r; v=Math.abs(vi); } });
    return ratio>5
      ? S('bad', `Mindestens ein Maß ist falsch, größte Abweichung ${v.toFixed(0)} mm.`)
      : S('warn', 'Form eindeutig, aber ungeprüft.');
  }
  const vc=an.vc||[];
  const netz=G.globalTestFails ? G.globalTestFails(an.v.concat(vc),
    act.map(m=>(m.sigma??C.SIGMA_DEF)/(m.fix?C.FIX_WT:1)).concat(vc.map(()=>C.SIGMA_DEF)), red) : false;
  const txtS=komma(an.sigmaHat,1);
  if(netz) return sus.size===1
    ? S('bad', 'Ein Maß passt nicht zu den übrigen.')
    : S('warn', `Die Maße streuen mehr als ± ${txtS} mm.`);
  return S('good', `Geprüft · Messgenauigkeit ± ${txtS} mm`, {genauigkeit:genau});
}

// ================= Blätter =================
function standKurz(m){
  const s=m.stand||{};
  if(!m.ecken.length) return '–';
  if(s.kurz) return s.kurz;
  if(s.tone==='good') return 'Geprüft'+(Number.isFinite(s.genauigkeit) ? ' ± '+komma(s.genauigkeit,1)+' mm' : '');
  if(s.tone==='bad') return 'Widerspruch in den Maßen';
  if(m.eindeutig) return m.geprueft ? 'Maße streuen auffällig' : 'Ungeprüft';
  return m.hatFit ? 'Form nicht eindeutig' : 'Skizze ohne Maße';
}
function kopf(m, art){
  const rechts=art+' · '+(m.datum||'');
  const name=kuerzen(m.name||'Raum', 15, true, W-breite(rechts,11)-16);
  return T(X0, Y0+14, name, {fs:15, b:1})
    + T(X1, Y0+14, rechts, {a:'end'})
    + `<path d="M${X0} ${Y0+21.5}H${X1}" stroke="${TINTE}" stroke-width="1"/>`;
}
const INHALT_OBEN=Y0+32;

// ---- Blatt 1: Grundriss, Wandliste, Fläche, Umfang, Stand ----
function blattGrundriss(m){
  let h=kopf(m, 'Aufmaßblatt');
  // Von unten nach oben gebaut: Stand im Wortlaut, Fuß, Wandliste; der
  // Grundriss bekommt, was bleibt.
  const s=m.stand||{tone:'',text:''};
  const hinweis=[];
  // Der Stand im Wortlaut, sofern er mehr sagt als das Feld im Fuß.
  // Sätze, die nur am Bildschirm etwas bedeuten (Klick, Vorschläge), bleiben weg.
  const aufPapier=s.text ? s.text.split(/(?<=\.)\s+/).filter(z=>!/Klick|Vorschläge|^Nachmessen|^In der Skizze|lösen oder/.test(z)).join(' ') : '';
  if(s.tone!=='good' && aufPapier && aufPapier.replace(/\.$/,'')!==standKurz(m))
    hinweis.push(...textZeilen('Stand: '+aufPapier, 9.5, W));
  if(!m.ecken.length) hinweis.length=0;          // der leere Grundriss sagt es selbst
  else if(!m.belastbar)
    hinweis.push(...textZeilen(m.geschlossen
      ? 'Fläche und Umfang stehen hier erst, wenn die Form eindeutig ist und die Maße zusammenpassen.'
      : 'Fläche und Umfang stehen hier erst, wenn der Raum geschlossen ist.', 9.5, W));
  const fussOben=Y1-40-(hinweis.length ? hinweis.length*12.5+3 : 0);
  h+=`<path d="M${X0} ${n2(fussOben)}H${X1}" stroke="${TINTE}" stroke-width="1"/>`;
  const zelle=(x, name, wert)=>T(x, fussOben+18, name, {f:GEDAEMPFT})+T(x, fussOben+35.5, wert, {fs:14, b:1});
  const inseln=m.inseln ? ` inkl. ${m.inseln} Insel${m.inseln>1?'n':''}` : '';
  h+=zelle(X0, 'Fläche', m.belastbar && m.flaeche!=null ? komma(m.flaeche,2)+' m²' : '–');
  h+=zelle(X0+122, 'Umfang'+inseln, m.belastbar && m.umfang!=null ? komma(m.umfang,2)+' m' : '–');
  h+=zelle(X0+282, 'Stand', kuerzen(standKurz(m), 14, true, W-282));
  hinweis.forEach((z,i)=>{ h+=T(X0, fussOben+40+12.5*(i+1), z, {fs:9.5, f:GEDAEMPFT}); });

  // Wandliste in sechs Spalten.
  const SP=6, ZH=11.5, sw=(W+10)/SP;
  const zeilen=Math.ceil(m.waende.length/SP);
  const listeOben=fussOben-8-(zeilen ? zeilen*ZH+6 : 0);
  if(zeilen){
    h+=`<path d="M${X0} ${n2(listeOben)}H${X1}" stroke="${LINIE}" stroke-width="1"/>`;
    m.waende.forEach((w,i)=>{
      const x=X0+(i%SP)*sw, y=listeOben+6+8.5+Math.floor(i/SP)*ZH;
      h+=T(x, y, kuerzen(strecke(w.a,w.b), 8.5, true, sw-36), {fs:8.5, b:1})
        +T(x+sw-10, y, w.laenge==null ? '–' : fm(w.laenge), {fs:8.5, a:'end'});
    });
  }
  h+=grundriss(m, {x:X0, y:INHALT_OBEN, w:W, h:listeOben-8-INHALT_OBEN});
  return {art:'Grundriss', svg:h};
}

// Der Grundriss in Tinte: Raumfläche, Wände (ohne Länge gestrichelt), Öffnungen
// als Lücke, Längen an den Wänden, Eckbuchstaben, Maßstab.
function grundriss(m, box){
  if(!m.ecken.length)
    return T(box.x+box.w/2, box.y+box.h/2, 'Noch keine Ecke gesetzt.', {a:'middle', f:GEDAEMPFT});
  // Rand für Längen und Eckbuchstaben. Reicht er außen nicht, weicht die Zahl
  // nach innen aus (siehe frei); so bleibt der größere Maßstab möglich.
  const FS=9, FE=6.5, RX=24, RY=20, BALKEN=16;
  const c=Math.cos(m.drehung||0), s=Math.sin(m.drehung||0);
  const R=m.ecken.map(p=>({id:p.id, x:p.x*c-p.y*s, y:p.x*s+p.y*c}));
  const xs=R.map(p=>p.x), ys=R.map(p=>p.y);
  const minx=Math.min(...xs), miny=Math.min(...ys), bw=Math.max(...xs)-minx, bh=Math.max(...ys)-miny;
  const aw=box.w-2*RX, ah=box.h-2*RY-BALKEN;
  // Maßstäblich nur, wenn die Form eindeutig ist: dann ein glatter Maßstab,
  // der bei 100 % auf A4 stimmt. Sonst füllt die Skizze den Platz.
  const massstaeblich=!!(m.hatFit && m.eindeutig);
  let N=null, k;
  if(massstaeblich) N=MASSSTAEBE.find(n=>bw*UPM/n<=aw && bh*UPM/n<=ah) || null;
  if(N) k=UPM/N;
  else k=Math.min(bw>0 ? aw/bw : Infinity, bh>0 ? ah/bh : Infinity);
  if(!Number.isFinite(k) || !(k>0)) k=1;
  const ox=box.x+RX+(aw-bw*k)/2-minx*k, oy=box.y+RY+(ah-bh*k)/2-miny*k;
  const Q={};
  R.forEach(p=>{ Q[p.id]={id:p.id, x:ox+p.x*k, y:oy+p.y*k}; });
  const ecken=R.map(p=>Q[p.id]);
  const mitte={x:ecken.reduce((a,p)=>a+p.x,0)/ecken.length, y:ecken.reduce((a,p)=>a+p.y,0)/ecken.length};
  const segs=m.waende.filter(w=>Q[w.a] && Q[w.b]).map(w=>({w, p:Q[w.a], q:Q[w.b], n:hyp(Q[w.a],Q[w.b])}));
  const ringPoly=(m.ringe||[]).map(ids=>ids.map(id=>Q[id]).filter(Boolean));
  let h='';

  // Raumfläche: Außenring und Inseln, gerade-ungerade.
  if(ringPoly.length && ringPoly.every(r=>r.length>=3))
    h+=`<path fill="${FLAECHE}" fill-rule="evenodd" d="${ringPoly.map(r=>'M'+r.map(p=>n2(p.x)+' '+n2(p.y)).join('L')+'Z').join('')}"/>`;

  // Wände: mit Länge in Tinte, ohne Länge dünn gestrichelt.
  segs.forEach(({w,p,q})=>{
    h+=w.laenge!=null
      ? `<path d="M${n2(p.x)} ${n2(p.y)}L${n2(q.x)} ${n2(q.y)}" stroke="${TINTE}" stroke-width="2.4" stroke-linecap="round"/>`
      : `<path d="M${n2(p.x)} ${n2(p.y)}L${n2(q.x)} ${n2(q.y)}" stroke="${GEDAEMPFT}" stroke-width="0.9" stroke-dasharray="3.2 2.6"/>`;
  });
  // Öffnungen: eingemessen eine Lücke mit Laibungsstrichen (Fenster mit
  // Brüstungslinie), nur geschätzt ein gestrichelter heller Strich in der Wand.
  segs.forEach(({w,p,q,n})=>{
    if(!w.ansicht || !(n>0)) return;
    const ux=(q.x-p.x)/n, uy=(q.y-p.y)/n, L=w.ansicht.L;
    w.ansicht.oeffnungen.forEach(o=>{
      const t0=Math.max(0,Math.min(1,o.xa/L)), t1=Math.max(0,Math.min(1,(o.xa+o.w)/L));
      const a={x:p.x+(q.x-p.x)*t0, y:p.y+(q.y-p.y)*t0}, b={x:p.x+(q.x-p.x)*t1, y:p.y+(q.y-p.y)*t1};
      const d=`M${n2(a.x)} ${n2(a.y)}L${n2(b.x)} ${n2(b.y)}`;
      if(o.lage.seitlich!=='eingemessen'){
        h+=`<path d="${d}" stroke="${WEISS}" stroke-width="1.1" stroke-dasharray="1.8 1.6"/>`;
        return;
      }
      h+=`<path d="${d}" stroke="${WEISS}" stroke-width="3.8"/>`;
      [a,b].forEach(e=>{ h+=`<path d="M${n2(e.x-uy*2.2)} ${n2(e.y+ux*2.2)}L${n2(e.x+uy*2.2)} ${n2(e.y-ux*2.2)}" stroke="${TINTE}" stroke-width="0.8"/>`; });
      if(o.art==='window') h+=`<path d="${d}" stroke="${TINTE}" stroke-width="0.6"/>`;
    });
  });

  // ---- Längen an den Wänden ----
  const inRing=(pt, ring)=>{
    let innen=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const a=ring[i], b=ring[j];
      if((a.y>pt.y)!==(b.y>pt.y) && pt.x<(b.x-a.x)*(pt.y-a.y)/(b.y-a.y)+a.x) innen=!innen;
    }
    return innen;
  };
  // Schneidet die Strecke das (um r erweiterte) Rechteck? Liang-Barsky.
  const segInRect=(p,q,R2,r)=>{
    const x0=R2.x-r, x1=R2.x+R2.w+r, y0=R2.y-r, y1=R2.y+R2.h+r;
    let t0=0, t1=1; const dx=q.x-p.x, dy=q.y-p.y;
    for(const [pp,qq] of [[-dx,p.x-x0],[dx,x1-p.x],[-dy,p.y-y0],[dy,y1-p.y]]){
      if(pp===0){ if(qq<0) return false; continue; }
      const t=qq/pp;
      if(pp<0){ if(t>t1) return false; if(t>t0) t0=t; }
      else { if(t<t0) return false; if(t<t1) t1=t; }
    }
    return true;
  };
  const zahlen=[];   // belegte Rechtecke der Längen
  const frei=(r, eigen)=>
    r.x>=box.x-2 && r.x+r.w<=box.x+box.w+2 && r.y>=box.y && r.y+r.h<=box.y+box.h-BALKEN+4
    && !zahlen.some(o=>r.x<o.x+o.w+1.5 && r.x+r.w>o.x-1.5 && r.y<o.y+o.h+1 && r.y+r.h>o.y-1)
    && !segs.some(sg=>sg!==eigen && segInRect(sg.p,sg.q,r,1.2))
    && !ecken.some(e=>e.x>r.x-2 && e.x<r.x+r.w+2 && e.y>r.y-2 && e.y<r.y+r.h+2);
  [...segs].sort((a,b)=>b.n-a.n).forEach(sg=>{
    const {w,p,q,n}=sg;
    if(w.laenge==null || !(n>0)) return;
    const txt=fm(w.laenge), hw=breite(txt,FS)/2+1, hh=FS*.5+.5;
    const ux=(q.x-p.x)/n, uy=(q.y-p.y)/n;
    const platz=Math.abs(ux)*2*hw+Math.abs(uy)*2*hh;      // Ausdehnung der Zahl längs der Wand
    if(n<platz*.9) return;                                 // zu kurz: die Länge steht in der Wandliste
    // Außenseite: weg von der Fläche des eigenen Rings, ohne Ring weg von der Mitte.
    let nx=-uy, ny=ux;
    const mx=(p.x+q.x)/2, my=(p.y+q.y)/2;
    const ring=w.ring>=0 ? ringPoly[w.ring] : null;
    if(ring && ring.length>=3 ? inRing({x:mx+nx*.6, y:my+ny*.6}, ring) : (mx-mitte.x)*nx+(my-mitte.y)*ny<0){ nx=-nx; ny=-ny; }
    const lagen=[[1,.5],[-1,.5]];
    if(n>platz*2.2) lagen.push([1,.32],[1,.68],[-1,.32],[-1,.68]);
    for(const [seite,t] of lagen){
      const ex=nx*seite, ey=ny*seite, ab=Math.abs(ex)*hw+Math.abs(ey)*hh+2.6;
      const cx=p.x+(q.x-p.x)*t+ex*ab, cy=p.y+(q.y-p.y)*t+ey*ab;
      const r={x:cx-hw, y:cy-hh, w:2*hw, h:2*hh};
      if(!frei(r, sg)) continue;
      zahlen.push(r);
      h+=T(cx, cy+FS*.35, txt, {fs:FS, a:'middle'});
      break;
    }
  });

  // ---- Eckbuchstaben: aus 16 Richtungen (nah, sonst etwas weiter mit
  // Hilfsstrich) die Lage, die Wänden, Nachbarecken, Längen und schon
  // gesetzten Buchstaben am weitesten ausweicht. ----
  const segAbst=(pt,p,q)=>{
    const dx=q.x-p.x, dy=q.y-p.y, t=Math.max(0,Math.min(1,((pt.x-p.x)*dx+(pt.y-p.y)*dy)/(dx*dx+dy*dy||1)));
    return Math.hypot(pt.x-p.x-t*dx, pt.y-p.y-t*dy);
  };
  const rectAbst=(pt,r)=>Math.hypot(Math.max(r.x-pt.x,0,pt.x-r.x-r.w), Math.max(r.y-pt.y,0,pt.y-r.y-r.h));
  const gesetzt=[];
  ecken.forEach(u=>{
    const halb=Math.max(0, breite(u.id,FE)/2-2.4);
    let best=null;
    [[FS*1.15,0],[FS*1.85,3]].forEach(([rad,malus])=>{
      for(let i=0;i<16;i++){
        const a=i*Math.PI/8, pt={x:u.x+Math.cos(a)*rad, y:u.y+Math.sin(a)*rad};
        if(pt.x<box.x+3 || pt.x>box.x+box.w-3 || pt.y<box.y+5 || pt.y>box.y+box.h-BALKEN) continue;
        let sc=FS*1.1;
        segs.forEach(sg=>{ sc=Math.min(sc, segAbst(pt,sg.p,sg.q)-halb); });
        ecken.forEach(e=>{ if(e!==u) sc=Math.min(sc, hyp(pt,e)-halb); });
        zahlen.forEach(r=>{ sc=Math.min(sc, rectAbst(pt,r)-3-halb); });
        gesetzt.forEach(g=>{ sc=Math.min(sc, hyp(pt,g)-5-halb-g.halb); });
        sc-=malus;
        if(hyp(pt,mitte)>hyp(u,mitte)) sc+=.2;             // bei Gleichstand nach außen
        if(!best || sc>best.sc) best={sc, pt, fern:malus>0};
      }
    });
    if(!best) best={pt:{x:u.x, y:u.y-FE}, fern:false};
    gesetzt.push({x:best.pt.x, y:best.pt.y, halb});
    if(best.fern){
      const d=hyp(best.pt,u)||1, ex=(best.pt.x-u.x)/d, ey=(best.pt.y-u.y)/d;
      h+=`<path d="M${n2(u.x+ex*2.5)} ${n2(u.y+ey*2.5)}L${n2(best.pt.x-ex*4)} ${n2(best.pt.y-ey*4)}" stroke="${GEDAEMPFT}" stroke-width="0.4"/>`;
    }
    h+=T(best.pt.x, best.pt.y+FE*.34, u.id, {fs:FE, a:'middle', f:GEDAEMPFT});
  });

  // ---- Maßstab ----
  const by=box.y+box.h-2;
  if(N){
    const meter=[1,5,10,0.5,0.1].find(x=>x*1000*k>=12 && x*1000*k<=160) || 1;
    const len=meter*1000*k, name=(meter<1 ? komma(meter,1) : String(meter))+' m';
    h+=`<path d="M${n2(box.x)} ${n2(by-3.2)}V${n2(by)}H${n2(box.x+len)}V${n2(by-3.2)}" fill="none" stroke="${TINTE}" stroke-width="0.8"/>`
      +T(box.x+len+4, by, name, {fs:7.5})
      +T(box.x+len+4+breite(name,7.5)+7, by, 'M 1:'+N, {fs:7.5, f:GEDAEMPFT});
  } else {
    h+=T(box.x, by, m.hatFit ? 'Form nicht eindeutig: Lage der Ecken vorläufig, nicht maßstäblich'
                             : 'Skizze ohne Maße, nicht maßstäblich', {fs:7.5, f:GEDAEMPFT});
  }
  return h;
}

// ---- Wandansichten: je Wand von innen, alle im selben Maßstab ----
function blaetterAnsichten(m){
  const mit=m.waende.filter(w=>w.ansicht);
  if(!mit.length) return [];
  const istKurz=w=>w.ansicht.L<KURZ && !w.ansicht.oeffnungen.length && !w.ansicht.anschluesse.length;
  const gross=mit.filter(w=>!istKurz(w)), kurz=mit.filter(istKurz), ohne=m.waende.filter(w=>!w.ansicht);
  const uneben=w=>w.ansicht.knicke.length>0 || Math.abs(w.ansicht.links.h-w.ansicht.rechts.h)>1;
  const FC=9, FL=8, LH=10, LUECKE=12;
  let N=null, s=0;
  if(gross.length){
    const Lmax=Math.max(...gross.map(w=>w.ansicht.L)), Hmax=Math.max(1, ...gross.map(w=>w.ansicht.hMax));
    N=MASSSTAEBE.find(n=>Lmax*UPM/n<=W-56 && Hmax*UPM/n<=200) || MASSSTAEBE[MASSSTAEBE.length-1];
    s=UPM/N;
  }
  const hoehenText=a=>{
    const ys=a.top.map(p=>p.y), lo=Math.min(...ys), hi=Math.max(...ys);
    return hi-lo>1 ? fm(lo)+' bis '+fm(hi)+' m' : fm(hi)+' m';
  };
  const lageText=(it, a)=>{
    const g=[[{t:fmm(it.x)+' mm ab '+a.links.id}]];
    if(it.anschluss || it.art!=='door' || it.y>0.5) g.push([{t:fmm(it.y)+' mm über Boden'}]);
    return g;
  };
  // Je Wand ein Block: Breite, Beschriftung in Zeilen.
  const bloecke=gross.map(w=>{
    const a=w.ansicht, un=uneben(w), pad=un ? 27 : 10;
    const nummern=a.oeffnungen.length+a.anschluesse.length>1;
    const kopfSt=[{t:strecke(w.a,w.b), b:1}, {t:un ? '  '+fm(a.L)+' m breit' : '  '+fm(a.L)+' × '+hoehenText(a)}];
    const bw=Math.min(W, Math.max(a.L*s+2*pad, stueckBreite(kopfSt,FC)+2, 112));
    const g=[kopfSt];
    if(un) g.push([{t:'Höhe '+hoehenText(a)}]);
    if(w.ring>0) g.push([{t:'Insel '+w.ring}]);
    if(a.hoehe!=='gemessen') g.push([{t:'Höhe '+a.hoehe}]);
    if(w.dicke) g.push([{t:'Wand '+fmm(w.dicke)+' mm dick'}]);
    const zeilen=umbrechen(g, FC, bw).map(st=>({st, fs:FC}));
    [...a.oeffnungen, ...a.anschluesse].sort((p,q)=>p.nr-q.nr).forEach(it=>{
      const g2=[[...(nummern ? [{t:it.nr+' ', b:1}] : []),
                 {t:it.anschluss ? it.name : `${it.name} ${fmm(it.w)} × ${fmm(it.h)} mm`}], ...lageText(it, a)];
      if(!it.anschluss){
        if(it.versetzt) g2.push([{t:'Lage widerspricht dem Maß'}]);
        else if(it.widerspruch) g2.push([{t:'ein Lagemaß passt nicht'}]);
        else if(it.lage.seitlich==='geschätzt' && it.lage.hoehe!=='eingemessen') g2.push([{t:'Lage geschätzt'}]);
        else if(it.lage.seitlich==='geschätzt') g2.push([{t:'seitliche Lage geschätzt'}]);
        else if(it.lage.hoehe==='geschätzt') g2.push([{t:'Höhenlage geschätzt'}]);
      }
      umbrechen(g2, FL, bw).forEach(st=>zeilen.push({st, fs:FL}));
    });
    return {w, a, un, pad, bw, nummern, zeilen};
  });
  // Blöcke wie Wörter in Zeilen setzen.
  const reihen=[]; let cur=null;
  bloecke.forEach(b=>{
    if(!cur || cur.breite+LUECKE+b.bw>W+.01){ cur={bl:[], breite:0}; reihen.push(cur); }
    cur.breite+=(cur.bl.length ? LUECKE : 0)+b.bw; cur.bl.push(b);
  });
  reihen.forEach(r=>{
    r.oben=r.bl.some(b=>b.un) ? 11 : 4;
    r.hMax=Math.max(...r.bl.map(b=>b.a.hMax));
    r.hoehe=r.oben+r.hMax*s+13+Math.max(...r.bl.map(b=>b.zeilen.length))*LH;
  });
  // Kompakte Zeilen am Ende: sehr kurze Wände und Wände ohne Länge.
  const fuss=[];
  if(kurz.length){
    // Gilt für alle dieselbe Auskunft zur Höhe, steht sie einmal in der Überschrift.
    const arten=new Set(kurz.map(w=>w.ansicht.hoehe)), eine=arten.size===1 ? [...arten][0] : null;
    const g=kurz.map(w=>[{t:strecke(w.a,w.b), b:1}, {t:' '+fm(w.ansicht.L)+' × '+hoehenText(w.ansicht)
      +(!eine && w.ansicht.hoehe!=='gemessen' ? ' ('+w.ansicht.hoehe+')' : '')}]);
    fuss.push([{t:`Kurze Wände unter ${komma(KURZ/1000,1)} m, ohne Ansicht`+(eine && eine!=='gemessen' ? ` (Höhe ${eine})` : '')+':', f:GEDAEMPFT}],
      ...umbrechen(g, FC, W));
  }
  if(ohne.length){
    const g=ohne.map(w=>[{t:strecke(w.a,w.b), b:1}]);
    fuss.push([{t:'Ohne Länge und deshalb ohne Ansicht:', f:GEDAEMPFT}], ...umbrechen(g, FC, W));
  }
  const FZ=11.5, fussH=fuss.length*FZ;

  const gestrichelt=mit.some(w=>w.ansicht.hoehe!=='gemessen' || w.ansicht.oeffnungen.some(o=>o.geschaetzt));
  const unterzeile=['Von innen gesehen', N ? 'Maßstab 1:'+N : null,
    [mit.some(w=>w.ansicht.oeffnungen.length) ? 'Öffnungen' : null, mit.some(w=>w.ansicht.anschluesse.length) ? 'Anschlüsse' : null]
      .filter(Boolean).join(' und ').replace(/(.+)/, '$1 in mm') || null,
    m.hoeheAngenommen ? 'Raumhöhe nicht gemessen, angenommen '+fm(m.hoeheStandard)+' m' : null,
    gestrichelt ? 'gestrichelt: angenommen oder geschätzt' : null].filter(Boolean);
  const unterZeilen=umbrechen(unterzeile.map(t=>[{t, f:GEDAEMPFT}]), 8.5, W);
  const OBEN=INHALT_OBEN+5+unterZeilen.length*10.5+4;
  const neu=()=>({art:'Wandansichten', svg:kopf(m,'Wandansichten')
    + unterZeilen.map((st,i)=>Z(X0, INHALT_OBEN+5+i*10.5, st, 8.5)).join('')});
  const blaetter=[]; let bl=neu(), y=OBEN;
  reihen.forEach(r=>{
    if(y+r.hoehe>Y1 && y>OBEN){ blaetter.push(bl); bl=neu(); y=OBEN; }
    let x=X0;
    const yBoden=y+r.oben+r.hMax*s;
    r.bl.forEach(b=>{ bl.svg+=ansicht(b, s, x, yBoden, LH); x+=b.bw+LUECKE; });
    y+=r.hoehe+14;
  });
  if(fuss.length){
    // Die Zeilen dürfen ein Stück in den unteren Rand, ehe sie ein eigenes Blatt bekommen.
    if(y+fussH>Y1+8 && y>OBEN){ blaetter.push(bl); bl=neu(); y=OBEN; }
    fuss.forEach((st,i)=>{ bl.svg+=Z(X0, y+7+i*FZ, st, FC); });
  }
  blaetter.push(bl);
  return blaetter;
}

// Eine Wand von innen: Fläche, Boden kräftig, Oberkante echt (Trapez, Knick),
// Öffnungen und Anschlüsse maßstäblich, darunter die Beschriftung.
function ansicht(b, s, x, yB, LH){
  const {w, a}=b;
  const x0=x+b.pad, x1=x0+a.L*s;
  const px=v=>x0+v*s, py=v=>yB-v*s;
  const top=a.top.map(p=>({x:px(p.x), y:py(p.y)}));
  let h=`<path fill="${FLAECHE}" d="M${n2(x0)} ${n2(yB)}L${top.map(p=>n2(p.x)+' '+n2(p.y)).join('L')}L${n2(x1)} ${n2(yB)}Z"/>`;
  // Oberkante und senkrechte Kanten. Gestrichelt ist, was nicht gemessen ist:
  // die Oberkante, sobald die Höhe angenommen oder übernommen ist, eine
  // senkrechte Kante, wenn genau diese Ecke keine eigene Höhe hat.
  const fest=a.hoehe==='gemessen';
  const tinte=`stroke="${TINTE}" stroke-width="0.9"`, blei=`stroke="${GEDAEMPFT}" stroke-width="0.8" stroke-dasharray="3 2.4"`;
  const kante=(xk, ecke, p)=>`<path d="M${n2(xk)} ${n2(yB)}L${n2(p.x)} ${n2(p.y)}" ${fest || (a.hoehe==='übernommen' && ecke.gemessen) ? tinte : blei}/>`;
  h+=`<path fill="none" stroke-linejoin="round" ${fest ? tinte : blei} d="M${top.map(p=>n2(p.x)+' '+n2(p.y)).join('L')}"/>`
    +kante(x0, a.links, top[0])+kante(x1, a.rechts, top[top.length-1]);
  h+=`<path d="M${n2(x0)} ${n2(yB)}H${n2(x1)}" stroke="${TINTE}" stroke-width="1.6"/>`;
  // Öffnungen
  a.oeffnungen.forEach(o=>{
    const ox=px(o.x), oy=py(o.y+o.h), ow=o.w*s, oh=o.h*s;
    h+=`<rect x="${n2(ox)}" y="${n2(oy)}" width="${n2(ow)}" height="${n2(oh)}" fill="${WEISS}" `
      +(o.geschaetzt ? `stroke="${GEDAEMPFT}" stroke-width="0.8" stroke-dasharray="2.2 1.8"/>` : `stroke="${TINTE}" stroke-width="0.9"/>`);
    h+=symbol(o, ox, oy, ow, oh);
    if(b.nummern) h+=nummer(o.nr, ow>=9 && oh>=10 ? ox+ow/2 : ox+ow+4, ow>=9 && oh>=10 ? oy+oh/2+2.6 : oy+7);
  });
  // Anschlüsse: Kreis mit Punkt.
  a.anschluesse.forEach(o=>{
    const cx=px(o.x), cy=py(o.y);
    h+=`<circle cx="${n2(cx)}" cy="${n2(cy)}" r="2.5" fill="${WEISS}" stroke="${TINTE}" stroke-width="0.8"/><circle cx="${n2(cx)}" cy="${n2(cy)}" r="0.8" fill="${TINTE}"/>`;
    if(b.nummern) h+=nummer(o.nr, cx+(cx+9>x1 ? -6 : 6), cy+2.6);
  });
  // Eckbuchstaben neben dem Boden, außen: auch an schmalen Wänden kollisionsfrei.
  h+=T(x0-2.6, yB+1, a.links.id, {fs:7, a:'end', f:GEDAEMPFT})+T(x1+2.6, yB+1, a.rechts.id, {fs:7, f:GEDAEMPFT});
  // Höhen nur, wo die Oberkante nicht eben ist: je Ecke und je Knick.
  if(b.un){
    const hy=v=>Math.min(py(v)+2.5, yB-8);
    h+=T(x0-2.6, hy(a.links.h), fm(a.links.h), {fs:7, a:'end'})+T(x1+2.6, hy(a.rechts.h), fm(a.rechts.h), {fs:7});
    // Knickhöhe innen unter der Oberkante: darüber läge sie auf der Schräge.
    a.knicke.forEach(k=>{
      const hw=breite(fm(k.y),7)/2+1.5, kx=x1-x0>2*hw ? Math.max(x0+hw, Math.min(x1-hw, px(k.x))) : px(k.x);
      h+=`<circle cx="${n2(px(k.x))}" cy="${n2(py(k.y))}" r="1.1" fill="${TINTE}"/>`+T(kx, py(k.y)+9.5, fm(k.y), {fs:7, a:'middle'});
    });
  }
  b.zeilen.forEach((z,i)=>{ h+=Z(x, yB+12+i*LH, z.st, z.fs); });
  return h;
}
const nummer=(nr,x,y)=>T(x, y, nr, {fs:7.5, a:'middle', b:1, hof:2.2});
// Aufrisssymbolik wie in der Wandansicht des Werkzeugs: Dreiecke, Spitze auf
// der Bandseite; durchgezogen nach innen, gestrichelt nach außen öffnend.
function symbol(o, x, y, w, h){
  const sy=o.symbol, t=sy && sy.typ;
  if(!t || t==='fix' || t==='none' || t==='slide' || o.art==='hole') return '';
  const tri=(ax,ay,bx,by,cx,cy)=>`M${n2(ax)} ${n2(ay)}L${n2(bx)} ${n2(by)}L${n2(cx)} ${n2(cy)}Z`;
  let d='';
  if(t==='turn'||t==='turntilt'||t==='stulp'){
    if(t==='stulp') d+=tri(x,y+h/2, x+w/2,y, x+w/2,y+h)+tri(x+w,y+h/2, x+w/2,y, x+w/2,y+h);
    else d+=sy.bandLinks ? tri(x,y+h/2, x+w,y, x+w,y+h) : tri(x+w,y+h/2, x,y, x,y+h);
  }
  if(t==='tilt'||t==='turntilt') d+=tri(x+w/2,y+h, x,y, x+w,y);
  if(t==='top') d+=tri(x+w/2,y, x,y+h, x+w,y+h);
  if(t==='pivot') d+=tri(x,y+h/2, x+w,y, x+w,y+h)+tri(x+w,y+h/2, x,y, x,y+h);
  return d ? `<path fill="none" stroke="${TINTE}" stroke-width="0.4" stroke-linejoin="round"${sy.aussen?' stroke-dasharray="1.6 1.3"':''} d="${d}"/>` : '';
}

// ---- Maße: Strecke, Maß, Abweichung; zweispaltig ----
function blaetterMasse(m){
  const eintraege=[];
  const teile=[m.masse.length, m.hoehenMasse.length, m.lageMasse.length].filter(Boolean).length;
  const bem=x=>!x.an ? '' : x.verdaechtig ? 'verdächtig' : x.fix ? 'exakt' : x.vonNachbar ? 'Nachbar' : x.geprueft===false ? 'ungeprüft' : '';
  // Ein ungeprüftes Maß hat strukturell die Abweichung 0; die Zahl sähe aus wie
  // eine bestandene Prüfung. Sie steht nur, wenn sie etwas sagt.
  const abw=x=>!x.an ? 'aus' : x.abw==null ? '' : (x.geprueft===false && !x.fix && Math.abs(x.abw)<0.05) ? '' : fAbw(x.abw);
  if(m.masse.length){
    if(teile>1) eintraege.push({titel:'Strecken'});
    m.masse.forEach(x=>eintraege.push({z:[strecke(x.a,x.b), fm(x.d), abw(x), bem(x)], aus:!x.an, falsch:x.an && x.verdaechtig}));
  }
  if(m.hoehenMasse.length){
    eintraege.push({titel:'Höhen'});
    m.hoehenMasse.forEach(x=>eintraege.push({z:[x.art==='ecke' ? 'Ecke '+x.ecke : `Knick ${strecke(x.a,x.b)} bei ${fm(x.x)}`, fm(x.d), abw(x), ''], aus:!x.an}));
  }
  if(m.lageMasse.length){
    eintraege.push({titel:'Lage der Öffnungen'});
    // Die Nummer aus der Wandansicht nur, wo die Wand mehrere Dinge trägt.
    const mehrere=new Set(m.waende.filter(w=>w.ansicht && w.ansicht.oeffnungen.length+w.ansicht.anschluesse.length>1).map(w=>schluessel(w.a,w.b)));
    // Die Bezugskante steht rechts; ein Lagemaß, das nicht passt, ist fett.
    // Liegt die Öffnung nicht auf diesem Maß, steht es dabei (statt einer Abweichung).
    m.lageMasse.forEach(x=>eintraege.push({z:[`${strecke(x.a,x.b)} ${x.art}${x.nr!=null && mehrere.has(schluessel(x.a,x.b)) ? ' '+x.nr : ''}`, fm(x.d), abw(x),
      x.an && x.widerspruch ? x.kante+' · Widerspruch' : x.kante], aus:!x.an, falsch:x.an && (x.verdaechtig || x.widerspruch)}));
  }
  const ZH=11.5, FS=8.5, SPALT=38, sb=(W-SPALT)/2, OBEN=INHALT_OBEN+4;
  const jeSpalte=Math.floor((Y1-OBEN-ZH)/ZH);
  const neu=()=>({art:'Maße', svg:kopf(m,'Maße')});
  const XM=126, XA=174;   // rechte Kanten der Spalten Maß und Abweichung
  const kopfzeile=(x,y)=>T(x, y, 'Strecke', {fs:7.5, f:GEDAEMPFT})+T(x+XM, y, 'Maß (m)', {fs:7.5, a:'end', f:GEDAEMPFT})
    +T(x+XA, y, 'Abweichung', {fs:7.5, a:'end', f:GEDAEMPFT})+`<path d="M${n2(x)} ${n2(y+3.2)}H${n2(x+sb)}" stroke="${LINIE}" stroke-width="1"/>`;
  if(!eintraege.length){
    const b=neu(); b.svg+=T(X0, OBEN+10, 'Noch keine Maße eingetragen.', {f:GEDAEMPFT});
    return [b];
  }
  const blaetter=[]; let bl=neu(), sp=0, zl=0;
  const weiter=()=>{ zl=0; if(++sp>1){ blaetter.push(bl); bl=neu(); sp=0; } };
  eintraege.forEach((e,i)=>{
    // Ein Titel bleibt nicht allein am Spaltenende stehen.
    if(zl>=jeSpalte || (e.titel && zl>=jeSpalte-1)) weiter();
    const x=X0+sp*(sb+SPALT);
    if(zl===0) bl.svg+=kopfzeile(x, OBEN+FS);
    const y=OBEN+FS+(zl+1)*ZH;
    if(e.titel) bl.svg+=T(x, y, e.titel, {fs:FS, b:1});
    else {
      const f=e.aus ? GEDAEMPFT : null;
      const b=e.falsch ? 1 : 0;
      bl.svg+=T(x, y, kuerzen(e.z[0], FS, b, XM-34), {fs:FS, f, b})+T(x+XM, y, e.z[1], {fs:FS, a:'end', f, b})
        +T(x+XA, y, e.z[2], {fs:FS, a:'end', f, b})
        +(e.z[3] ? T(x+sb, y, e.z[3], {fs:7, a:'end', f:GEDAEMPFT}) : '')
        +`<path d="M${n2(x)} ${n2(y+3.2)}H${n2(x+sb)}" stroke="${LINIE}" stroke-width="1"/>`;
    }
    zl++;
  });
  blaetter.push(bl);
  return blaetter;
}

// Alle Blätter als Liste {art, svg-Inhalt}; html() setzt sie zusammen.
function blaetter(m, opt){
  const o=opt||{};
  m={name:'', datum:'', drehung:0, ecken:[], waende:[], ringe:[], masse:[], hoehenMasse:[], lageMasse:[],
     stand:{tone:'', text:''}, hoeheStandard:H_STANDARD, ...(m||{})};
  const liste=[blattGrundriss(m), ...blaetterAnsichten(m)];
  if(o.mitMassliste) liste.push(...blaetterMasse(m));
  return liste;
}
// Reine Funktion, DOM-frei: die Blätter als HTML-Zeichenkette.
function html(m, opt){
  m=m||{};
  const liste=blaetter(m, opt), n=liste.length;
  return liste.map((b,i)=>{
    const titel=`Aufmaßblatt ${m.name||''}, Blatt ${i+1} von ${n}: ${b.art}`;
    return `<article class="bl-blatt" data-blatt="${i+1}" data-art="${esc(b.art)}">`
      +`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BB} ${BH}" role="img" aria-label="${esc(titel)}" `
      +`font-family='${SCHRIFT}' font-size="11" fill="${TINTE}" style="font-variant-numeric:tabular-nums">`
      +`<rect width="${BB}" height="${BH}" fill="${WEISS}"/>${b.svg}`
      +(n>1 ? T(X1, Y1+20, `Blatt ${i+1} von ${n}`, {fs:7.5, a:'end', f:GEDAEMPFT}) : '')
      +`</svg></article>`;
  }).join('');
}

// ================= CSS =================
// Vorschau: die Blätter mittig untereinander (.bl-stapel) auf der Tischfläche,
// 560 px breit, Schatten "Blatt". Alles hängt am Präfix bl-; die Druckregeln
// fassen nur diese Klassen an, damit das Werkzeug sie gefahrlos einbinden kann.
const css=`
.bl-stapel{display:grid;justify-items:center;align-content:start;gap:24px}
.bl-blatt{display:block;width:min(560px,calc(100% - 64px));aspect-ratio:210/297;margin:0;background:#fff;color:${TINTE};
  box-shadow:0 1px 2px rgba(36,34,29,.12),0 8px 24px rgba(36,34,29,.10);overflow:hidden}
.bl-blatt>svg{display:block;width:100%;height:auto}
.bl-blatt text{font-family:${SCHRIFT};font-variant-numeric:tabular-nums}
@media print{
  .bl-stapel{display:block;gap:0;padding:0;background:#fff}
  .bl-blatt{width:100%;max-height:296.8mm;aspect-ratio:auto;box-shadow:none;break-inside:avoid;page-break-inside:avoid;
    break-after:page;page-break-after:always;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .bl-blatt:last-child{break-after:auto;page-break-after:auto}
}`.trim();
// Nur im eigenen Druckdokument: Seitenformat ohne Rand, das Blatt bringt
// seinen Innenrand selbst mit. Hält ein Browser eigene Ränder, schrumpft das
// Blatt mit (Breite 100 %), statt abgeschnitten zu werden.
const druckCss=`
@page{size:A4 portrait;margin:0}
html,body{margin:0;padding:0}
body{background:#ebe8e0;padding:28px 0 48px}
@media print{html,body{background:#fff;padding:0}}
`.trim()+'\n'+css;

function dokument(m, opt){
  m=m||{};
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    +`<title>${esc('Aufmaßblatt '+(m.name||'')).trim()}</title><style>${druckCss}</style></head>`
    +`<body><main class="bl-stapel">${html(m, opt)}</main></body></html>`;
}

// ================= Drucken =================
// Druckt nur die Blätter. Standard ist ein unsichtbarer Rahmen in der Seite:
// kein Pop-up, der Druckdialog kommt sofort. opt.fenster:true (oder ein
// Fehler im Rahmen) nimmt ein eigenes Fenster wie beim Fliesenplan.
// Rückgabe: {ok:true, weg:'rahmen'|'fenster', blaetter:n}
//   oder {ok:false, grund:'leer'|'popup'|'fehler', text, fehler} - text ist für
//   den Nutzer; fehler trägt denselben Satz (so fragt ihn das Werkzeug ab).
const nein=(grund, text)=>({ok:false, grund, text, fehler:text});
function drucken(opt){
  const o=opt||{};
  let m, doc, n;
  try{
    m=o.modell || modell();
    if(!m.ecken || !m.ecken.length) return nein('leer', 'Noch nichts zu drucken: Der Raum hat keine Ecke.');
    n=blaetter(m, o).length;
    doc=dokument(m, o);
  }catch(e){
    return nein('fehler', 'Das Aufmaßblatt ließ sich nicht erstellen: '+(e && e.message || e));
  }
  if(typeof document==='undefined') return nein('fehler', 'Drucken geht nur im Browser.');
  if(!o.fenster){
    try{
      const alt=document.getElementById('bl-druckrahmen');
      if(alt) alt.remove();
      const f=document.createElement('iframe');
      f.id='bl-druckrahmen'; f.title='Aufmaßblatt (Druck)'; f.tabIndex=-1;
      f.setAttribute('aria-hidden','true');
      // Nicht display:none - manche Browser drucken einen solchen Rahmen leer.
      f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
      document.body.appendChild(f);
      const w=f.contentWindow, d=w.document;
      d.open(); d.write(doc); d.close();
      // Aufräumen erst nach dem Dialog; bleibt das Ereignis aus, räumt der
      // nächste Druck auf.
      w.addEventListener('afterprint', ()=>setTimeout(()=>{ if(f.isConnected) f.remove(); }, 500));
      w.focus();
      w.print();
      return {ok:true, weg:'rahmen', blaetter:n};
    }catch(e){ /* weiter mit dem Fenster */ }
  }
  let w=null;
  try{ w=window.open('', '_blank'); }catch(e){ w=null; }
  if(!w) return nein('popup', 'Das Druckfenster wurde blockiert. Pop-ups für diese Seite erlauben und noch einmal drucken.');
  try{
    w.document.open(); w.document.write(doc); w.document.close();
    w.focus();
    w.print();
  }catch(e){
    // Das Fenster steht mit den Blättern da; gedruckt wird dann von Hand.
    return {ok:true, weg:'fenster', blaetter:n, text:'Das Aufmaßblatt steht im neuen Fenster. Dort mit Strg+P oder ⌘P drucken.'};
  }
  return {ok:true, weg:'fenster', blaetter:n};
}

G.BLATT={ css, druckCss, modell, html, blaetter, dokument, drucken };
})();
