// fliesenplan-bedienung.js – die Bedienung des Fliesenplans: Fliesen legen, schieben, drehen, Fugen, Lineal,
// Panel, Zeichnen der Fliesenansicht, Einmessen-Dialog. Wörtlich aus dem früheren Block "tiles-ui" von
// raumaufmass.html. Meldet sich am Ende bei der Seite an (meldeAn, raum-plan.js); die Rechnung steht in
// raum-fliesen.js (TILES) und fliesenplan-einmessen.js (TILEMEAS).
"use strict";
if(globalThis.RAUM_UNVOLLSTAENDIG) throw new Error('Fliesenplan startet nicht: unvollständig geladen.');
// ================= Fliesen: Bedienung =================
// Haengt am ui-Block: M, VIEW, toScr/toWorld, snapshot/pushSnapshot, STORE.
// Der Modus 'tiles' zeichnet ueber drawTilesView() (Einstieg ganz oben in
// drawCanvas) und bekommt seine Zeiger-Ereignisse aus den gemeinsamen
// Handlern (tilesDown/tilesMove/tilesUp/tilesTap).
const TL=globalThis.TILES;
const TD2R=Math.PI/180;
const TS={ tool:'move', sel:new Set(), vec:null, dup:null, lines:[],
           draft:null, hover:null, drag:false, cache:null, cacheKey:'', lastRot:0,
           showNums:true, jointKey:'', pal:null, axis:null };
// Auswahl BLAU, Ueberlappung ROT, eingerastete Kanten GRUEN - drei
// Bedeutungen, drei Farben (vorher teilten sich Auswahl und Ueberlappung ein Rot).
const TILE_INK={ L:'#e2c48f', R:'#c99b5e', cutL:'#f0dfc0', cutR:'#e3c79f', edge:'#6b4f2a',
                 joint:'#4a4a4a', floor:'#fbfaf6', overlap:'#d11a1a', overlapFill:'rgba(209,26,26,.45)',
                 // Auswahl bewusst Blau statt Akzent-Orange: auf Holztoenen und
                 // neben dem Ueberlappungs-Rot ist Orange kaum zu sehen.
                 sel:'#1d6fd6', selFill:'rgba(29,111,214,.12)', snap:'#1a6b34' };

function tilesData(){ if(!M.tiles) M.tiles=TL.normTiles(null); return M.tiles; }
// Raum im Fliesenrahmen - nur mit ausgeglichener, geschlossener Form.
function tilesCtx(){
  if(!M.fit) return null;
  const F=TL.frameOf(M.fit.pts, M.walls);
  const ringW=F && C.wallPolygon(M.fit.pts, M.walls);
  if(!ringW) return null;
  // Rahmenkoordinaten mit Ecken-ID (fuer Bemassungen), Inseln wie in CORE.
  const loc=R=>R.map(p=>({...TL.toLocal(F,p), id:p.id}));
  const ring=loc(ringW); ring.holes=ringW.holes.map(loc);
  // Verlegekante: je Wand die Wandfuge, sonst die globale Randfuge. Daran
  // rasten Fliesen ein, und sie begrenzt die Raumflaeche - die Wand selbst
  // bleibt fuer Zeichnung, Dehnungsfugen und Wandmasse.
  const T=tilesData();
  const lay=TL.insetRoom(ring, (a,b)=>{ const w=wallJointOf(T,a,b); return w ? w.width : T.spec.edgeGap; });
  // Die Randfuge ist Spiel fuer ungenaue Waende - sie soll Schnitte sparen.
  // Anschneiden an der Wand darf die Randfuge zur Haelfte nutzen (Toleranz):
  // geschnitten wird erst bei halber Randfuge. Wandfugen bleiben voll. Gilt
  // auch fuer Stueckliste und Schnittblaetter: was nur in diese Toleranz
  // ragt, ist ganz und wird dort nicht angerissen.
  const layCut=TL.insetRoom(ring, (a,b)=>{ const w=wallJointOf(T,a,b); return w ? w.width : T.spec.edgeGap/2; });
  return {F, ringW, ring, lay, layCut};
}
const wallJointOf=(T,a,b)=>(T.wallJoints||[]).find(w=>(w.a===a&&w.b===b)||(w.a===b&&w.b===a));
const tScr=(K,p)=>toScr(TL.toWorldF(K.F,p));
const tEvLocal=(K,e)=>{ const d=evDev(e); return TL.toLocal(K.F, toWorld(d.x,d.y)); };
const tTol=()=>16*DPR()/VIEW.s;                // Fangradius in mm, zoomunabhaengig
const selItems=()=>tilesData().items.filter(it=>TS.sel.has(it.id));
const fmtMm=v=>Math.round(v).toLocaleString('de-DE');
// Fugenversatz ist teuer (alle Fugenpaare) - nur neu rechnen, wenn sich
// Fliesen oder Masse geaendert haben.
let jOffCache={key:null, val:[]}, gapCache={key:null, val:null};
// Inkrementell: aendern sich nur einzelne Fliesen (Ziehen, Drehen, Schneiden),
// werden nur die Zellen um ihre alte und neue Lage neu bewertet. Raum, Fugen
// oder Fliesenmasse geaendert -> alles neu.
function uncoveredCached(){
  const T=tilesData(), K=tilesCtx(); if(!K) return null;
  const frame=JSON.stringify([T.spec,T.joints,K.lay,K.lay.holes]);
  const sig=new Map(T.items.map(it=>[it.id, JSON.stringify(it)]));
  if(gapCache.frame===frame && gapCache.sig && gapCache.val){
    const changed=[];
    sig.forEach((v,id)=>{ if(gapCache.sig.get(id)!==v) changed.push(id); });
    gapCache.sig.forEach((v,id)=>{ if(!sig.has(id)) changed.push(id); });
    if(!changed.length) return gapCache.val;
    if(changed.length<=60){
      const pad=T.spec.joint+1+2*8, box=it=>{ const Q=TL.tileCorners(T.spec,it), xs=Q.map(p=>p.x), ys=Q.map(p=>p.y);
        return [Math.min(...xs)-pad, Math.min(...ys)-pad, Math.max(...xs)+pad, Math.max(...ys)+pad]; };
      const rects=[];
      changed.forEach(id=>{ const now=T.items.find(it=>it.id===id); if(now) rects.push(box(now));
        const was=gapCache.items.get(id); if(was) rects.push(box(was)); });
      gapCache={frame, sig, items:new Map(T.items.map(it=>[it.id,it])),
                val:TL.uncovered(T.spec,T.items,K.lay,T.joints,8,1,{prev:gapCache.val, rects})};
      return gapCache.val;
    }
  }
  gapCache={frame, sig, items:new Map(T.items.map(it=>[it.id,it])), val:TL.uncovered(T.spec,T.items,K.lay,T.joints,8,1)};
  return gapCache.val;
}
function jointOffsetsCached(){
  const T=tilesData(), key=JSON.stringify([T.spec,T.items]);
  if(jOffCache.key!==key){
    const wall=T.items.map(it=>(it.cuts||[]).some(c=>c.wall) || (it.notches||[]).some(n=>n.by==='wall'));
    jOffCache={key, val:TL.jointOffsets(T.spec,T.items.map(it=>TL.tileCorners(T.spec,it)),undefined,wall)};
  }
  return jOffCache.val;
}

// Speichern ohne recompute(): Fliesen aendern die Geometrie des Raums nicht,
// der Solver muesste umsonst laufen.
function tilesSave(){
  TS.cacheKey='';
  if(currentRoom && !STORE.save(currentRoom, {data:JSON.parse(serialize()), area:polyAreaM2(), stand:standKurz()}))
    setHint('Speichern fehlgeschlagen (Speicher voll?). Raum als Datei sichern.');
  render();
}

// Schnittnummern und Recycling werden NUR beim Schnittmuster-PDF berechnet
// und eingefroren (TS.nestSnap). Die Zeichnung zeigt die Nummern dieses
// Stands; Stuecke, die es damals noch nicht gab, bekommen "?".
const cutKey=c=>`${c.item.id}:${Math.round(c.c.x)},${Math.round(c.c.y)}`;
function frozenNo(c){ const n=TS.nestSnap && TS.nestSnap.nums.get(cutKey(c)); return n!=null ? n : null; }
// Auswertung (Status, Schnittstuecke, Ueberlappungen) nur neu rechnen, wenn
// sich etwas geaendert hat - nicht je Mausbewegung.
function tilesEval(K){
  const T=tilesData();
  const key=JSON.stringify([T.spec,T.items,T.joints,K.layCut,K.layCut.holes,K.lay,K.lay.holes]);
  if(key===TS.cacheKey && TS.cache) return TS.cache;
  // ganz/geschnitten und Schnittstuecke an der Schnittkante (halbe Randfuge),
  // die Raumflaeche an der Verlegekante
  const stats=TL.tileStats(T.spec, T.items, K.layCut, T.joints, K.lay);
  const cuts=TL.cutList(T.spec, T.items, K.layCut, T.joints);
  const status=new Map();
  T.items.forEach(it=>status.set(it.id, TL.tileStatus(T.spec,it,K.layCut,T.joints).status));
  const polys=T.items.map(it=>TL.tileCorners(T.spec,it)), over=new Set(), overPolys=[];
  for(let i=0;i<polys.length;i++) for(let j=i+1;j<polys.length;j++)
    if(TL.convexOverlap(polys[i],polys[j]) && TL.tileOverlapArea(T.spec,T.items[i],T.items[j])>1){
      over.add(T.items[i].id); over.add(T.items[j].id);
      overPolys.push(TL.clipConvex(polys[i],polys[j]));
    }
  // Randfuge an Waenden ohne Wandfuge (die ist Silikon) mit Fugenmoertel
  const edge=TL.insetRoom(K.ring, (a,b)=>wallJointOf(T,a,b) ? 0 : T.spec.edgeGap);
  const grout=TL.groutAmount(T.spec, T.items, K.ring, edge);
  const spacers=TL.spacerCount(T.spec, T.items, K.layCut, T.joints);
  TS.cache={stats, cuts, status, over, overPolys, grout, spacers}; TS.cacheKey=key;
  return TS.cache;
}

// ---------- Zeichnen ----------
let hatchPat=null;
function hatch(dpr){
  if(hatchPat) return hatchPat;
  const c=document.createElement('canvas'); c.width=c.height=Math.round(8*dpr);
  const g=c.getContext('2d'); g.strokeStyle='rgba(107,79,42,.45)'; g.lineWidth=dpr;
  g.beginPath(); g.moveTo(0,c.height); g.lineTo(c.width,0); g.stroke();
  hatchPat=ctx.createPattern(c,'repeat');
  return hatchPat;
}
// Kerbenkanten, die im Inneren der Fliese liegen (nicht auf ihrem Rand) -
// nur die gehoeren zum sichtbaren Umriss.
function strokeNotchEdges(K, S, it){
  const P=TL.tileCorners(S,it), E=TL.edgesOf(P);
  const onRim=(a,b)=>E.some(e=>Math.abs((e.d.x*(a.y-e.a.y)-e.d.y*(a.x-e.a.x)))<0.5 && Math.abs((e.d.x*(b.y-e.a.y)-e.d.y*(b.x-e.a.x)))<0.5);
  TL.tileNotches(S,it).forEach(N=>N.forEach((a,i)=>{ const b=N[(i+1)%N.length]; if(onRim(a,b)) return;
    const p=tScr(K,a), q=tScr(K,b); ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.stroke(); }));
}
function drawTilesView(){
  const dpr=DPR();
  sizeCanvas(dpr);            // Puffer nur bei Groessenaenderung neu (Hover zeichnet oft)
  ctx.textBaseline='alphabetic'; ctx.font=`${12*dpr}px ${CANVAS_FONT}`;
  if(!cv.width || !cv.height) return;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,cv.width,cv.height);
  const K=tilesCtx();
  if(!K) return;
  // Auswahl von Fliesen bereinigen, die es nicht mehr gibt (Rueckgaengig,
  // Loeschen, Neuaufbau) - sonst zeigen Griffe auf Leere.
  if(TS.sel.size){ const ids=new Set(tilesData().items.map(it=>it.id)); [...TS.sel].forEach(id=>{ if(!ids.has(id)) TS.sel.delete(id); }); }
  if(!userView && !TS.drag && cv.width>=200 && cv.height>=200) VIEW=fitView(K.ringW, VIEW.rot, 250);
  drawGrid(dpr); drawScalebar(dpr);
  const T=tilesData(), S=T.spec;
  const sub=P=>{ P.forEach((p,i)=>{ const q=tScr(K,p); i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y); }); ctx.closePath(); };
  const path=P=>{ ctx.beginPath(); sub(P); };
  // Raum mit Inseln: alle Ringe in EINEM Pfad, gefuellt/geclippt even-odd.
  const room=()=>{ ctx.beginPath(); TL.ringsOf(K.ring).forEach(sub); };
  const ev=TS.drag ? null : tilesEval(K);
  room(); ctx.fillStyle=TILE_INK.floor; ctx.fill('evenodd');
  // Ueberstand ausserhalb des Raums blass - man sieht, was abgeschnitten wird.
  ctx.save(); ctx.globalAlpha=.18;
  T.items.forEach(it=>{ path(TL.tileCorners(S,it)); ctx.fillStyle=(TILE_INK[it.kind]||'#b9ccce'); ctx.fill(); });
  ctx.restore();
  const lay=()=>{ ctx.beginPath(); TL.ringsOf(K.lay).forEach(sub); };
  ctx.save(); lay(); ctx.clip('evenodd');
  T.items.forEach(it=>{
    const st=ev ? ev.status.get(it.id) : 'whole';
    // Ausklinkungen: JEDE Kerbe als eigener Ausschnitt (Clip "alles ausser
    // dieser Kerbe"); die Clips schneiden sich, uebrig bleibt Fliese ohne
    // die Vereinigung der Kerben. Ein gemeinsamer even-odd-Pfad kehrte
    // ueberlappende Kerben wieder um.
    const N=TL.tileNotches(S,it);
    ctx.save();
    N.forEach(n=>{ ctx.beginPath(); ctx.rect(0,0,cv.width,cv.height); sub(n); ctx.clip('evenodd'); });
    path(TL.tileCorners(S,it));
    ctx.fillStyle=st==='cut' ? (TILE_INK['cut'+it.kind]||'#dce7e7') : (TILE_INK[it.kind]||'#b9ccce'); ctx.fill();
    if(st==='cut'){ ctx.fillStyle=hatch(dpr); ctx.fill(); }
    ctx.strokeStyle=TILE_INK.edge; ctx.lineWidth=.8*dpr; ctx.stroke();
    // Kerbenraender innerhalb der Fliese nachziehen
    if(N.length){ ctx.restore(); ctx.save(); path(TL.tileCorners(S,it)); ctx.clip(); strokeNotchEdges(K,S,it); }
    ctx.restore();
  });
  // Ueberlappung: die Flaeche selbst rot, mit rotem Rand
  if(ev) ev.overPolys.forEach(P=>{ if(P.length<3) return; path(P); ctx.fillStyle=TILE_INK.overlapFill; ctx.fill();
    ctx.strokeStyle=TILE_INK.overlap; ctx.lineWidth=1.5*dpr; ctx.stroke(); });
  T.joints.forEach(j=>{ path(TL.jointStrip(j)); ctx.fillStyle=TILE_INK.joint; ctx.fill(); });
  ctx.restore();
  // Wandfugen: Band zwischen Wand und Verlegekante; markierte Toleranzfugen
  // kraeftig, die globale Randfuge nur zart
  ctx.save(); ctx.beginPath(); TL.ringsOf(K.ring).forEach(sub); TL.ringsOf(K.lay).forEach(sub);
  ctx.fillStyle='rgba(107,79,42,.18)'; ctx.fill('evenodd'); ctx.restore();
  (T.wallJoints||[]).forEach(w=>{
    TL.ringsOf(K.ring).forEach((R,ri)=>{ const Lr=TL.ringsOf(K.lay)[ri];
      R.forEach((pt,i)=>{ const nx=R[(i+1)%R.length];
        if(!((pt.id===w.a&&nx.id===w.b)||(pt.id===w.b&&nx.id===w.a))) return;
        path([pt, nx, Lr[(i+1)%R.length], Lr[i]]); ctx.fillStyle='rgba(14,116,144,.45)'; ctx.fill(); }); });
  });
  // Waende, Inseln grau hinterlegt
  K.ring.holes.forEach(h=>{ path(h); ctx.fillStyle='#d8d4c8'; ctx.fill(); });
  room(); ctx.strokeStyle=INK.wall; ctx.lineWidth=2.5*dpr; ctx.stroke();
  // Dehnungsfugen: Mittellinie gestrichelt, damit auch schmale sichtbar bleiben
  ctx.setLineDash([6*dpr,4*dpr]); ctx.strokeStyle=TILE_INK.joint; ctx.lineWidth=1.2*dpr;
  T.joints.forEach(j=>{ const a=tScr(K,j.a), b=tScr(K,j.b); ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); });
  ctx.setLineDash([]);
  // Nummer jeder Dehnungsfuge an ihrer Mitte - dieselbe wie in der Liste
  // im Panel und auf dem Druck, damit "DF 2" eine Stelle im Plan hat.
  ctx.font=`600 ${11*dpr}px ${CANVAS_FONT}`; ctx.textAlign='center'; ctx.textBaseline='middle';
  T.joints.forEach((j,i)=>{
    const a=tScr(K,j.a), b=tScr(K,j.b), m={x:(a.x+b.x)/2, y:(a.y+b.y)/2}, t='DF '+(i+1);
    const w=ctx.measureText(t).width+8*dpr;
    ctx.fillStyle='rgba(250,249,246,.94)'; ctx.fillRect(m.x-w/2, m.y-8*dpr, w, 16*dpr);
    ctx.fillStyle=TILE_INK.joint; ctx.fillText(t, m.x, m.y+.5*dpr);
  });
  ctx.textAlign='start'; ctx.textBaseline='alphabetic';
  // Auswahl
  ctx.strokeStyle=TILE_INK.sel; ctx.fillStyle=TILE_INK.selFill; ctx.lineWidth=2.2*dpr;
  // Umriss der tatsaechlichen Form: ausserhalb der Kerben, Kerbenraender innen
  selItems().forEach(it=>{
    const N=TL.tileNotches(S,it);
    ctx.save();
    N.forEach(n=>{ ctx.beginPath(); ctx.rect(0,0,cv.width,cv.height); sub(n); ctx.clip('evenodd'); });
    path(TL.tileCorners(S,it)); ctx.fill(); ctx.stroke();
    ctx.restore();
    if(N.length){ ctx.save(); path(TL.tileCorners(S,it)); ctx.clip(); strokeNotchEdges(K,S,it); ctx.restore(); }
  });
  // Typ der gewaehlten Fliesen (L/R): blaeulich hinterlegtes Kennzeichen,
  // etwas oberhalb der Mitte (die Mitte gehoert der Schnittnummer)
  ctx.save(); ctx.font=`700 ${12*dpr}px system-ui`; ctx.textAlign='center'; ctx.textBaseline='middle';
  // Bei grossen Auswahlen (⌘A) waeren es hunderte Kaestchen - dann keins.
  (TS.sel.size<=8 ? selItems() : []).forEach(it=>{
    const P=TL.tileCorners(S,it).map(p=>tScr(K,p));
    const c={x:P.reduce((a,p)=>a+p.x,0)/P.length, y:P.reduce((a,p)=>a+p.y,0)/P.length-20*dpr};
    const w=18*dpr, h=18*dpr, r=4*dpr;
    ctx.fillStyle='rgba(40,110,230,.22)'; ctx.strokeStyle='rgba(40,110,230,.55)'; ctx.lineWidth=dpr;
    ctx.beginPath(); ctx.roundRect(c.x-w/2,c.y-h/2,w,h,r); ctx.fill(); ctx.stroke();
    ctx.fillStyle=TILE_INK.sel; ctx.fillText(tileLabel(it.kind), c.x, c.y+.5*dpr);
  });
  ctx.restore();
  // Schnittnummern
  if(ev && TS.showNums){
    ctx.font=`600 ${11*dpr}px system-ui`; ctx.textAlign='center'; ctx.textBaseline='middle';
    ev.cuts.forEach(c=>{
      // Nur Stuecke, die im zuletzt gedruckten Schnittplan eine Nummer
      // haben. Frueher bekam jedes andere Schnittstueck ein graues "?" -
      // nach jedem Laden Dutzende Kreise an allen Waenden.
      const no=frozenNo(c);
      if(no==null) return;
      const txt=String(no);
      const sw=no!=null && TS.nestSnap.swap && TS.nestSnap.swap.has(cutKey(c));
      const q=tScr(K,c.c), r=(8+(txt.length>1?3:0)+(txt.length>2?3:0))*dpr;
      ctx.fillStyle='rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(q.x,q.y,r,0,7); ctx.fill();
      ctx.strokeStyle=sw ? '#d97a00' : TILE_INK.edge; ctx.lineWidth=(sw?2.5:1)*dpr; ctx.stroke();
      ctx.fillStyle='#24221d'; ctx.fillText(txt, q.x, q.y+.5*dpr);
    });
    ctx.textAlign='start'; ctx.textBaseline='alphabetic';
  }
  // Gehrungsgriff: Linie vom Drehpunkt, Raute am Ende, Winkel daneben
  const mh=miterHandle(K);
  if(mh){
    ctx.save(); ctx.strokeStyle=TILE_INK.sel; ctx.fillStyle='#fff'; ctx.lineWidth=1.5*dpr; ctx.setLineDash([4*dpr,3*dpr]);
    ctx.beginPath(); ctx.moveTo(mh.pv.x,mh.pv.y); ctx.lineTo(mh.h.x,mh.h.y); ctx.stroke(); ctx.setLineDash([]);
    // Raute an BEIDEN Enden: Ziehen an einem Ende dreht um das andere.
    const r=8*dpr;
    [mh.h, mh.pv].forEach(q=>{ ctx.beginPath(); ctx.moveTo(q.x,q.y-r); ctx.lineTo(q.x+r,q.y); ctx.lineTo(q.x,q.y+r); ctx.lineTo(q.x-r,q.y); ctx.closePath(); ctx.fill(); ctx.stroke(); });
    ctx.font=`600 ${11*dpr}px system-ui`; ctx.fillStyle=TILE_INK.sel;
    ctx.fillText(miterLabel(mh.inf.ang+mh.A.rot, mh.A, mh.B), mh.h.x+12*dpr, mh.h.y-10*dpr);
    ctx.restore();
  }
  // Drehgriff
  const hnd=rotHandle(K);
  if(hnd){
    ctx.strokeStyle=TILE_INK.sel; ctx.lineWidth=1.5*dpr;
    ctx.beginPath(); ctx.moveTo(hnd.c.x,hnd.c.y); ctx.lineTo(hnd.h.x,hnd.h.y); ctx.stroke();
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(hnd.h.x,hnd.h.y,9*dpr,0,7); ctx.fill(); ctx.stroke();
    ctx.fillStyle=TILE_INK.sel; ctx.font=`${12*dpr}px system-ui`; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('⟳', hnd.h.x, hnd.h.y); ctx.textAlign='start'; ctx.textBaseline='alphabetic';
  }
  if(TS.box){
    const {a,b}=TS.box;
    ctx.save(); ctx.setLineDash([5*dpr,4*dpr]); ctx.strokeStyle=TILE_INK.sel; ctx.lineWidth=1.2*dpr;
    ctx.fillStyle=TILE_INK.selFill;
    ctx.fillRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y));
    ctx.strokeRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y));
    ctx.restore();
  }
  if(TS.tool==='move' && TS.edgeHover && TS.sel.has(TS.edgeHover.item.id)){
    const a=tScr(K,TS.edgeHover.a), b=tScr(K,TS.edgeHover.b);
    ctx.save(); ctx.strokeStyle=TILE_INK.sel; ctx.lineWidth=5*dpr; ctx.globalAlpha=.7;
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); ctx.restore();
  }
  // Fluchten: gewaehlte Kante/Ecke der bewegten Fliese (blau) und das Ziel
  // unter dem Zeiger (gruen, die Bezugskante gestrichelt verlaengert)
  if(TS.tool==='align'){
    const T=tilesData(), line=(a,b,col,w)=>{ const p=tScr(K,a), q=tScr(K,b); ctx.strokeStyle=col; ctx.lineWidth=w*dpr; ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.stroke(); };
    const ring=(q,col)=>{ const s2=tScr(K,q); ctx.strokeStyle=col; ctx.lineWidth=3*dpr; ctx.beginPath(); ctx.arc(s2.x,s2.y,9*dpr,0,7); ctx.stroke(); };
    const src=TS.alignSrc && T.items.find(it=>it.id===TS.alignSrc.id);
    if(src){ const P=TL.tileCorners(S,src);
      if(TS.alignSrc.corner!=null) ring(P[TS.alignSrc.corner], TILE_INK.sel);
      else line(P[TS.alignSrc.i], P[(TS.alignSrc.i+1)%P.length], TILE_INK.sel, 5); }
    const h=TS.hoverEdge, col=TS.alignSrc ? TILE_INK.snap : TILE_INK.sel;
    if(h && h.corner) ring(h.q, col);
    else if(h){ line(h.a, h.b, col, 3);
      if(TS.alignSrc && TS.alignSrc.corner==null){
        const d={x:h.b.x-h.a.x,y:h.b.y-h.a.y}, L=Math.hypot(d.x,d.y)||1, k=3000/L;
        ctx.save(); ctx.setLineDash([6*dpr,5*dpr]); line({x:h.a.x-d.x*k,y:h.a.y-d.y*k},{x:h.b.x+d.x*k,y:h.b.y+d.y*k},col,1); ctx.restore(); } }
  }
  if(TS.tool==='miter2'){
    ctx.save(); ctx.strokeStyle=TILE_INK.sel; ctx.lineWidth=1.2*dpr;
    (TS.msnap||[]).forEach(q=>{ const s2=tScr(K,q), r=5*dpr; ctx.beginPath(); ctx.moveTo(s2.x-r,s2.y); ctx.lineTo(s2.x+r,s2.y); ctx.moveTo(s2.x,s2.y-r); ctx.lineTo(s2.x,s2.y+r); ctx.stroke(); });
    const pts=[...(TS.mpts||[]), ...(TS.hover?[TS.hover.q]:[])].map(q=>tScr(K,q));
    if(pts.length>=2){ ctx.setLineDash([6*dpr,4*dpr]); ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y); ctx.lineTo(pts[1].x,pts[1].y); ctx.stroke(); ctx.setLineDash([]); }
    pts.forEach((q,i)=>{ ctx.fillStyle=i<(TS.mpts||[]).length ? TILE_INK.sel : (TS.hover&&TS.hover.snapped ? TILE_INK.snap : '#fff');
      ctx.beginPath(); ctx.arc(q.x,q.y,5*dpr,0,7); ctx.fill(); ctx.stroke(); });
    ctx.restore();
  }
  // Zwei Fliesen markiert: Abstaende paralleler/fluchtender Kanten und
  // Winkel stossender Kanten
  if(TS.sel.size===2 && !TS.box){
    const [A,B]=selItems(), PA=TL.tileCorners(S,A), PB=TL.tileCorners(S,B);
    ctx.save(); ctx.font=`600 ${11*dpr}px system-ui`; ctx.textAlign='center'; ctx.textBaseline='middle';
    const placed=[];
    const label=(x,y,txt)=>{ const w=ctx.measureText(txt).width+8*dpr, h=16*dpr;
      // ueberlappende Beschriftungen nach unten ausweichen lassen
      while(placed.some(r=>Math.abs(r.x-x)<(r.w+w)/2 && Math.abs(r.y-y)<h)) y+=h+2*dpr;
      placed.push({x,y,w});
      ctx.fillStyle='rgba(255,255,255,.9)'; ctx.fillRect(x-w/2,y-8*dpr,w,16*dpr);
      ctx.fillStyle=TILE_INK.sel; ctx.fillText(txt,x,y); };
    const fmt1=v=>(Math.round(v*10)/10).toLocaleString('de-DE');
    TL.pairDims(PA,PB,Math.max(30,S.joint*4)).forEach(c=>{
      ctx.strokeStyle=TILE_INK.sel; ctx.lineWidth=1.2*dpr;
      if(c.kind==='angle'){
        const q=tScr(K,c.at), r=14*dpr; ctx.beginPath(); ctx.arc(q.x,q.y,r,0,7); ctx.stroke();
        label(q.x+r+18*dpr, q.y-r, fmt1(c.deg)+'°');
        return;
      }
      const a=tScr(K,c.a), b=tScr(K,c.b), d={x:b.x-a.x,y:b.y-a.y}, L=Math.hypot(d.x,d.y);
      const n=L>0.5 ? {x:-d.y/L,y:d.x/L} : {x:1,y:0}, t=4*dpr;
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
      [a,b].forEach(p=>{ ctx.moveTo(p.x-n.x*t,p.y-n.y*t); ctx.lineTo(p.x+n.x*t,p.y+n.y*t); }); ctx.stroke();
      const m={x:(a.x+b.x)/2+n.x*14*dpr, y:(a.y+b.y)/2+n.y*14*dpr};
      label(m.x, m.y, (c.kind==='flucht' ? (c.d<0.05 ? 'fluchtet' : 'Flucht '+fmt1(c.d)+' mm') : fmt1(c.d)+' mm'));
    });
    ctx.restore();
  }
  // Fugencheck: abweichende Fugen rot fuellen und beschriften
  if(TS.jcheck){
    const T=tilesData();
    const r1=v=>(Math.round(v*10)/10).toLocaleString('de-DE');
    const labs=[];
    ctx.save();
    TL.jointCheck(S,T.items).forEach(f=>{
      const off=(p,k)=>tScr(K,{x:p.x+f.n.x*k, y:p.y+f.n.y*k});
      const q=[off(f.s0,0),off(f.s1,0),off(f.s1,f.d1),off(f.s0,f.d0)];
      const eng=f.dmin<S.joint-0.2, col=eng ? '#d0021b' : '#e07b00';
      ctx.strokeStyle=col; ctx.lineWidth=Math.max(4*dpr, Math.abs(f.d)*VIEW.s+3*dpr);
      ctx.globalAlpha=.85; ctx.beginPath(); ctx.moveTo((q[0].x+q[3].x)/2,(q[0].y+q[3].y)/2); ctx.lineTo((q[1].x+q[2].x)/2,(q[1].y+q[2].y)/2); ctx.stroke();
      ctx.globalAlpha=1;
      labs.push({x:(q[0].x+q[2].x)/2, y:(q[0].y+q[2].y)/2, col, prio:eng?0:3, dev:Math.abs(f.d-S.joint),
                 txt:f.dmax-f.dmin>0.2 ? r1(f.dmin)+'–'+r1(f.dmax) : r1(f.d)});
    });
    // Unbelegte Flaechen: Zellen magenta, groessere Luecken beschriftet
    const g=uncoveredCached();
    if(g){
      const h=g.cell/2;
      ctx.fillStyle='rgba(214,0,170,.55)';
      g.cells.forEach(p=>{ const a=tScr(K,{x:p.x-h,y:p.y-h}), b=tScr(K,{x:p.x+h,y:p.y+h});
        ctx.fillRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x)+.5,Math.abs(b.y-a.y)+.5); });
      g.comps.filter(c=>c.area>=2000).forEach(c=>{ const q=tScr(K,c.c);
        labs.push({x:q.x, y:q.y, col:'#a0007f', prio:2, dev:c.area, txt:(c.area/100).toLocaleString('de-DE',{maximumFractionDigits:0})+' cm²'}); });
    }
    // Fugenversatz: Treffpunkte verbinden, Kreis drum
    jointOffsetsCached().forEach(f=>{
      const a=tScr(K,f.p), b=tScr(K,f.q), m={x:(a.x+b.x)/2, y:(a.y+b.y)/2};
      const r=Math.max(12*dpr, Math.hypot(b.x-a.x,b.y-a.y)/2+8*dpr);
      ctx.strokeStyle='#7b2cbf'; ctx.lineWidth=2.5*dpr;
      ctx.beginPath(); ctx.arc(m.x,m.y,r,0,7); ctx.stroke();
      ctx.lineWidth=4*dpr; ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      labs.push({x:m.x, y:m.y-r-10*dpr, col:'#7b2cbf', prio:1, dev:f.d, txt:r1(f.d)});
    });
    // Beschriftung: wichtigste zuerst (zu eng, Versatz, Luecke, zu weit; je
    // groesste Abweichung), was keinen freien Platz findet, entfaellt.
    ctx.font=`600 ${11*dpr}px ${CANVAS_FONT}`; ctx.textAlign='center'; ctx.textBaseline='middle';
    const belegt=[];
    labs.sort((a,b)=>a.prio-b.prio || b.dev-a.dev).forEach(L=>{
      const w=ctx.measureText(L.txt).width+6*dpr, hh=14*dpr, r={x:L.x-w/2, y:L.y-hh/2, w, h:hh};
      if(belegt.some(o=>r.x<o.x+o.w && r.x+r.w>o.x && r.y<o.y+o.h && r.y+r.h>o.y)) return;
      belegt.push(r);
      ctx.fillStyle='#fff'; ctx.fillRect(r.x, r.y, w, hh);
      ctx.fillStyle=L.col; ctx.fillText(L.txt, L.x, L.y+.5*dpr);
    });
    ctx.restore();
  }
  // Eingerastete Kanten
  ctx.strokeStyle=TILE_INK.snap; ctx.lineWidth=4*dpr; ctx.globalAlpha=.6;
  TS.lines.forEach(t=>{ const a=tScr(K,t.a), b=tScr(K,t.b); ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); });
  ctx.globalAlpha=1;
  // Dehnungsfuge im Entstehen
  if(TS.tool==='joint'){
    const dot=(p,col)=>{ const q=tScr(K,p); ctx.fillStyle=col; ctx.beginPath(); ctx.arc(q.x,q.y,6*dpr,0,7); ctx.fill(); };
    if(!TS.jalt) TL.ringsOf(K.ring).flat().forEach(p=>{ const q=tScr(K,p); ctx.strokeStyle=INK.mode; ctx.lineWidth=1.5*dpr; ctx.beginPath(); ctx.arc(q.x,q.y,10*dpr,0,7); ctx.stroke(); });
    if(TS.draft){
      dot(TS.draft.q, INK.accent);
      if(TS.hover){
        const a=tScr(K,TS.draft.q), b=tScr(K,TS.hover.q);
        const ok=TL.jointValid(K.ring, TS.draft.q, TS.hover.q);
        ctx.strokeStyle=ok?INK.accent:INK.measBad; ctx.lineWidth=Math.max(3*dpr, S.expWidth*VIEW.s);
        ctx.globalAlpha=.6; ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); ctx.globalAlpha=1;
      }
    }
    if(TS.hover) dot(TS.hover.q, TS.hover.how==='Ecke' ? INK.mode : '#0b72a3');
  }
  drawRuler(K, dpr);
}

// Drehgriff: 36 px ueber dem obersten Bildpunkt der Auswahl, waagerecht
// mittig - nie auf den Fliesen selbst, sonst greift man bei grossen Gruppen
// den Griff, wenn man verschieben will.
function selCentre(){
  const T=tilesData(), P=[]; selItems().forEach(it=>TL.tileCorners(T.spec,it).forEach(p=>P.push(p)));
  if(!P.length) return null;
  const xs=P.map(p=>p.x), ys=P.map(p=>p.y);
  return {x:(Math.min(...xs)+Math.max(...xs))/2, y:(Math.min(...ys)+Math.max(...ys))/2};
}
// Winkel der Gehrungslinie (Rahmen-Grad) zu den Laengskanten BEIDER Fliesen
// - an einer rechtwinkligen Ecke ergaenzen sie sich zu 90.
function miterLabel(absDeg, A, B){
  const rel=r=>{ const a=TL.normDeg(absDeg-r)%180; return fmtGrad(Math.min(a,180-a)); };
  return `${rel(A.rot)}° | ${rel(B.rot)}°`;
}
// Gehrungsgriff: genau zwei ausgewaehlte Fliesen mit gemeinsamer Gehrung.
function miterHandle(K){
  const sel=selItems();
  if(TS.tool!=='move' || sel.length!==2) return null;
  const [A,B]=sel, S=tilesData().spec;
  const m=(A.cuts||[]).map(k=>k.m).find(m=>m!=null && (B.cuts||[]).some(k=>k.m===m));
  if(m==null) return null;
  const inf=TL.miterInfo(S,A,B,m); if(!inf) return null;
  return {A, B, m, inf, pv:tScr(K,inf.pv), h:tScr(K,inf.end)};
}
function rotHandle(K){
  if(TS.tool!=='move' || !TS.sel.size) return null;
  const c0=selCentre(); if(!c0) return null;
  const c=tScr(K,c0), S=tilesData().spec;
  let top=Infinity; selItems().forEach(it=>TL.tileCorners(S,it).forEach(p=>{ top=Math.min(top, tScr(K,p).y); }));
  return {c0, c, h:{x:c.x, y:top-36*DPR()}};
}

// ---------- Zeiger ----------
function tileAt(p){
  const T=tilesData();
  for(let i=T.items.length-1;i>=0;i--)
    if(TL.pointInRing(p, TL.tileCorners(T.spec,T.items[i]))) return T.items[i];
  return null;
}
// true: Geste gehoert den Fliesen. false: Hintergrund (Verschieben der
// Ansicht; ein Tipp landet in tilesTap).
// Greifzone einer Fliesenkante: 8 Bildschirmpixel, aber nie mehr als ein
// gutes Fuenftel der schmalen Fliesenseite - sonst ist in der Uebersicht die
// ganze Fliese "Kante" und die Mitte verschiebt nicht mehr.
function edgeTol(S){ return Math.min(8*DPR()/VIEW.s, 0.22*Math.min(S.w, S.l)); }
// Spitze Ecke (Chevron, unter 85 Grad) einer ausgewaehlten Fliese unter dem
// Zeiger, nur solange sie noch ungekappt ist. Liefert die Spitze und die
// Richtung der kurzen Kante - lokal (Fliesenrahmen) und im Raumrahmen.
function tipAt(K, d){
  const S=tilesData().spec;
  for(const it of selItems()){
    const def=TL.tileDef(S,it.kind); if(def.shape!=='chevron') continue;
    const B=TL.tileShape(S,it.kind), Q=TL.tileCorners(S,it), n=B.length;
    const c=Math.cos(it.rot*TD2R), sn=Math.sin(it.rot*TD2R), W=v=>({x:it.x+v.x*c-v.y*sn, y:it.y+v.x*sn+v.y*c});
    for(let i=0;i<n;i++){
      const v=B[i], a=B[(i+n-1)%n], b=B[(i+1)%n];
      const ang=Math.abs(Math.atan2((a.x-v.x)*(b.y-v.y)-(a.y-v.y)*(b.x-v.x), (a.x-v.x)*(b.x-v.x)+(a.y-v.y)*(b.y-v.y)))/TD2R;
      if(ang>=85) continue;
      const w=W(v), sc=tScr(K,w);
      if(Math.hypot(sc.x-d.x, sc.y-d.y)>10*DPR()) continue;
      if(!Q.some(q=>Math.hypot(q.x-w.x,q.y-w.y)<0.5)) continue;             // schon gekappt/geschnitten
      const la=Math.hypot(a.x-v.x,a.y-v.y), lb=Math.hypot(b.x-v.x,b.y-v.y), s=la<lb?a:b, L=Math.min(la,lb);
      const ul={x:(s.x-v.x)/L, y:(s.y-v.y)/L}, uw={x:ul.x*c-ul.y*sn, y:ul.x*sn+ul.y*c};
      return {item:it, i, tl:v, ul, w, uw, len:L};
    }
  }
  return null;
}
function tilesDown(e){
  const K=tilesCtx(); if(!K) return false;
  if(rulerDown(e, K)) return true;            // Lineal liegt oben und greift zuerst
  if(TS.tool!=='move') return false;
  const d=evDev(e), p=tEvLocal(K,e), hnd=rotHandle(K), mh=miterHandle(K);
  // Gehrungsgriffe: gezogenes Ende bewegt sich, das andere ist Drehpunkt.
  if(mh){
    const nah=q=>Math.hypot(d.x-q.x, d.y-q.y)<=14*DPR();
    const fix = nah(mh.h) ? mh.inf.pv : nah(mh.pv) ? mh.inf.end : null;
    if(fix){
      gesture={t:'tiles', k:'miter', x0:e.clientX, y0:e.clientY, moved:false, snap:serialize(),
               A:{...mh.A}, B:{...mh.B}, m:mh.m, pv:fix};
      return true;
    }
  }
  if(hnd && Math.hypot(d.x-hnd.h.x, d.y-hnd.h.y)<=16*DPR()){
    gesture={t:'tiles', k:'rot', x0:e.clientX, y0:e.clientY, moved:false, snap:serialize(),
             c:hnd.c0, a0:Math.atan2(p.y-hnd.c0.y, p.x-hnd.c0.x), orig:selItems().map(it=>({...it}))};
    return true;
  }
  // Spitze Ecke einer Chevron-Fliese greifen: Spitze kappen, rechtwinklig zur kurzen Kante
  if(!e.shiftKey && TS.sel.size){
    const tp=tipAt(K, evDev(e));
    if(tp){ gesture={t:'tiles', k:'tip', x0:e.clientX, y0:e.clientY, moved:false, snap:serialize(), p0:p, orig:{...tp.item}, tip:tp}; return true; }
  }
  // Kante einer ausgewaehlten Fliese greifen: parallel ziehen
  if(!e.shiftKey && TS.sel.size){
    const S0=tilesData().spec, ne=TL.notchEdgeAt(S0, selItems(), p, edgeTol(S0));
    if(ne){
      // Normale in die Kerbe hinein (Fliese waechst bei positiver Bewegung)
      const N=TL.tileNotches(S0,ne.item)[ne.ni], c=N.reduce((s,q)=>({x:s.x+q.x/N.length,y:s.y+q.y/N.length}),{x:0,y:0});
      const dd={x:ne.b.x-ne.a.x,y:ne.b.y-ne.a.y}, Ld=Math.hypot(dd.x,dd.y)||1;
      let nIn={x:-dd.y/Ld, y:dd.x/Ld}; if((c.x-ne.a.x)*nIn.x+(c.y-ne.a.y)*nIn.y<0) nIn={x:-nIn.x,y:-nIn.y};
      gesture={t:'tiles', k:'nedge', x0:e.clientX, y0:e.clientY, moved:false, snap:serialize(), p0:p, orig:JSON.parse(JSON.stringify(ne.item)), ni:ne.ni, ei:ne.ei, nIn};
      return true;
    }
  }
  if(!e.shiftKey && TS.sel.size){
    const S=tilesData().spec, ed=TL.edgeAt(S, selItems(), p, edgeTol(S));
    if(ed){
      const a=ed.a, b=ed.b, dd={x:b.x-a.x,y:b.y-a.y}, Ld=Math.hypot(dd.x,dd.y)||1;
      const c=TL.tileCorners(S,ed.item).reduce((s,q)=>({x:s.x+q.x,y:s.y+q.y}),{x:0,y:0}), nP=TL.tileCorners(S,ed.item).length;
      let nOut={x:dd.y/Ld, y:-dd.x/Ld}; if((a.x-c.x/nP)*nOut.x+(a.y-c.y/nP)*nOut.y<0) nOut={x:-nOut.x,y:-nOut.y};
      gesture={t:'tiles', k:'edge', x0:e.clientX, y0:e.clientY, moved:false, snap:serialize(), p0:p, orig:{...ed.item}, a, b, nOut};
      return true;
    }
  }
  const it=tileAt(p);
  // Umschalt + Ziehen im Leeren: Auswahlrahmen (Bildschirmrechteck - die
  // Ansicht kann gedreht sein, der Rahmen bleibt trotzdem achsparallel).
  if(!it && e.shiftKey){
    gesture={t:'tiles', k:'box', x0:e.clientX, y0:e.clientY, moved:false, d0:d};
    return true;
  }
  if(!it) return false;
  if(e.shiftKey){
    TS.sel.has(it.id) ? TS.sel.delete(it.id) : TS.sel.add(it.id);
    gesture={t:'tiles', k:'none', x0:e.clientX, y0:e.clientY, moved:false};
    render(); return true;
  }
  if(!TS.sel.has(it.id)) TS.sel=new Set([it.id]);
  gesture={t:'tiles', k:'move', x0:e.clientX, y0:e.clientY, moved:false, snap:serialize(),
           p0:p, orig:selItems().map(x=>({...x}))};
  render();
  return true;
}
// Ziele in Reichweite - bei hunderten Fliesen nicht jede Kante pruefen.
function nearTargets(K, moving){
  const T=tilesData(), S=T.spec, reach=2*(S.l+S.w*2)+tTol();
  const ids=new Set(moving.map(it=>it.id));
  const others=T.items.filter(o=>!ids.has(o.id) && moving.some(m=>Math.hypot(o.x-m.x,o.y-m.y)<=reach))
                      .map(o=>TL.tileCorners(S,o));
  // Die Verlegekante enthaelt die Fuge schon - dort mit Abstand 0 einrasten.
  return TL.snapTargets({...S, edgeGap:0}, others, K.lay, T.joints);
}
function applyItems(list){
  const T=tilesData(), by=new Map(list.map(it=>[it.id,it]));
  T.items=T.items.map(it=>by.get(it.id)||it);
}
function snapMoving(K, cand, free){
  TS.lines=[];
  if(free) return cand;
  const S=tilesData().spec;
  // Bei grossen Gruppen nur die Randfliesen fangen lassen waere genauer -
  // jede Kante zu pruefen ist bei ueblichen Gruppengroessen schnell genug.
  const r=TL.snapGroup(cand.map(it=>TL.tileCorners(S,it)), nearTargets(K,cand), tTol());
  if(!r) return cand;
  TS.lines=r.lines;
  return cand.map(it=>TL.moveItem(it,r.m));
}
function tilesMove(e, g){
  const K=tilesCtx(); if(!K || !g.moved || g.k==='none') return;
  if(g.k==='ruler'){ TS.drag=true; rulerMove(e, g, K); return; }
  if(g.k==='tip'){
    if(g.snap){ pushSnapshot(g.snap); g.snap=null; }
    TS.drag=true;
    const p=tEvLocal(K,e), q=g.tip, it0=g.orig;
    // Weg entlang der kurzen Kante, von der Spitze nach innen; ganze Millimeter,
    // mit ⌘/Strg frei.
    let t=(p.x-q.w.x)*q.uw.x+(p.y-q.w.y)*q.uw.y;
    if(!(e.metaKey||e.ctrlKey)) t=Math.round(t);
    t=Math.max(0, Math.min(q.len-1, t));
    const cuts=(it0.cuts||[]).filter(k=>k.tip!==q.i);
    const item={...it0}; if(t>0) item.cuts=[...cuts, {p:{x:q.tl.x+q.ul.x*t, y:q.tl.y+q.ul.y*t}, n:q.ul, tip:q.i}];
    else if(cuts.length) item.cuts=cuts; else delete item.cuts;
    applyItems([item]);
    setHintLive(`Spitze gekappt: ${f1(t)} mm entlang der kurzen Kante, Schnitt rechtwinklig dazu · ⌘/Strg: frei`);
    render(); return;
  }
  if(g.k==='box'){ TS.box={a:g.d0, b:evDev(e)}; drawTilesView(); return; }
  if(g.snap){ pushSnapshot(g.snap); g.snap=null; }
  TS.drag=true;
  const p=tEvLocal(K,e);
  if(g.k==='move'){
    const dx=p.x-g.p0.x, dy=p.y-g.p0.y;
    applyItems(snapMoving(K, g.orig.map(it=>({...it, x:it.x+dx, y:it.y+dy})), e.altKey));
  } else if(g.k==='rot'){
    const a=Math.atan2(p.y-g.c.y, p.x-g.c.x), raw=(a-g.a0)/TD2R;
    // Ohne Taste rastet die Drehung (15er und Chevron-Lagen), mit ⌘/Strg
    // (oder Umschalt) ist sie frei.
    const free=e.metaKey||e.ctrlKey||e.shiftKey;
    const r0=g.orig[0].rot, want=free ? TL.normDeg(r0+raw) : chevronAngle(r0+raw);
    const m={dth:want-r0, px:g.c.x, py:g.c.y, dx:0, dy:0};
    applyItems(g.orig.map(it=>TL.moveItem(it,m)));
    setHintLive(`Drehung ${fmtGrad(TL.normDeg(want))}° · ⌘/Strg: frei`);
  } else if(g.k==='nedge'){
    const t=(p.x-g.p0.x)*g.nIn.x+(p.y-g.p0.y)*g.nIn.y;
    const r=TL.moveNotchEdge(tilesData().spec, g.orig, g.ni, g.ei, t);
    applyItems([r.item]);
    setHintLive(r.removed ? 'Ausklinkung entfällt: Kerbe auf null gezogen.' : `Kerbenkante ${t>=0?'+':''}${f1(t)} mm (${t>=0?'Kerbe kleiner':'Kerbe größer'})`);
  } else if(g.k==='edge'){
    const S=tilesData().spec;
    let t=(p.x-g.p0.x)*g.nOut.x+(p.y-g.p0.y)*g.nOut.y;
    // Einrasten: Kante mit Fugen-/Randabstand an einer gegenueberliegenden,
    // fast parallelen Kante (Nachbarfliese oder Wand); ⌘/Strg frei.
    if(!(e.metaKey||e.ctrlKey)){
      const tg=nearTargets(K,[g.orig]), dd={x:g.b.x-g.a.x,y:g.b.y-g.a.y}, Ld=Math.hypot(dd.x,dd.y)||1;
      let best=null;
      tg.forEach(q=>{ if(-(q.n.x*g.nOut.x+q.n.y*g.nOut.y)<Math.cos(2*TD2R)) return;
        const m={x:(g.a.x+g.b.x)/2, y:(g.a.y+g.b.y)/2};
        const dist=(m.x-q.a.x)*q.n.x+(m.y-q.a.y)*q.n.y;                // jetziger Abstand
        const want=dist-q.gap;                                        // so weit nach aussen
        const proj=((m.x-q.a.x)*q.d.x+(m.y-q.a.y)*q.d.y), Lq=Math.hypot(q.b.x-q.a.x,q.b.y-q.a.y);
        if(proj<-Ld || proj>Lq+Ld) return;
        if(Math.abs(want-t)<=tTol() && (!best || Math.abs(want-t)<Math.abs(best-t))) best=want; });
      if(best!=null) t=best;
      // Zeiger auf einer (fast) parallelen Kante einer anderen Fliese: so
      // weit ziehen, dass beide Kanten FLUCHTEN - hat Vorrang.
      const dd2={x:g.b.x-g.a.x,y:g.b.y-g.a.y}, L2=Math.hypot(dd2.x,dd2.y)||1, ud={x:dd2.x/L2,y:dd2.y/L2};
      let fl=null, flD=tTol();
      tilesData().items.forEach(o=>{ if(o.id===g.orig.id) return;
        const Q=TL.tileCorners(S,o);
        Q.forEach((qa,i)=>{ const qb=Q[(i+1)%Q.length], ed={x:qb.x-qa.x,y:qb.y-qa.y}, Le=Math.hypot(ed.x,ed.y)||1;
          if(Math.abs(ud.x*ed.y-ud.y*ed.x)/Le>Math.sin(2*TD2R)) return;              // nicht parallel
          if(ud.x*ed.x+ud.y*ed.y<0) return;     // gegenueberliegend (Fuge) - fluchten heisst gleich gerichtet
          const u=Math.max(0,Math.min(1,((p.x-qa.x)*ed.x+(p.y-qa.y)*ed.y)/(Le*Le)));
          const dz=Math.hypot(p.x-(qa.x+ed.x*u), p.y-(qa.y+ed.y*u));
          if(dz<flD){ flD=dz; fl={a:qa,b:qb}; } }); });
      if(fl){
        t=(fl.a.x-g.a.x)*g.nOut.x+(fl.a.y-g.a.y)*g.nOut.y;
        TS.lines=[{a:fl.a,b:fl.b}];
      } else if(TS.lines.length) TS.lines=[];
      // Schraeg auf eine Kante: die vorderste Ecke der gezogenen Kante kommt
      // im Fugenabstand vor einer Zielkante an (Fliese oder Wand), die bis 75
      // Grad von ihr abweicht (Chevron: kurze Kante auf Laengsseite = 45) ->
      // die Kante wird parallel zur Zielkante geschnitten, mit Fuge.
      // Auch fast parallele Kanten (bis 2 Grad) laufen hier durch: der reine
      // Abstands-Snap oben setzt nur den Abstand, die Kante bliebe leicht schief
      // und die Fuge wuerde keilfoermig (z. B. 2,3-2,8 statt 2,5 mm).
      if(!fl){
        const tg=nearTargets(K,[g.orig]), ud0={x:g.b.x-g.a.x,y:g.b.y-g.a.y}, Lu=Math.hypot(ud0.x,ud0.y)||1, ud={x:ud0.x/Lu,y:ud0.y/Lu};
        const Q0=TL.tileCorners(S,g.orig), cen={x:Q0.reduce((s2,q)=>s2+q.x,0)/Q0.length, y:Q0.reduce((s2,q)=>s2+q.y,0)/Q0.length};
        let tilt=null, td=Math.max(tTol(), 2*S.joint+4);
        tg.forEach(q=>{
          const Lq=Math.hypot(q.b.x-q.a.x,q.b.y-q.a.y)||1, qd={x:(q.b.x-q.a.x)/Lq, y:(q.b.y-q.a.y)/Lq};
          const sinA=Math.abs(ud.x*qd.y-ud.y*qd.x);
          if(sinA>Math.sin(75*TD2R)) return;                                         // quer ist kein Anlegen
          if(q.n.x*g.nOut.x+q.n.y*g.nOut.y>=0) return;                               // Zielkante muss uns zugewandt sein
          // Gezogene Kante an ihrer jetzigen Lage; vorderste Ecke = naechste zur Zielkante.
          const ea={x:g.a.x+g.nOut.x*t, y:g.a.y+g.nOut.y*t}, eb={x:g.b.x+g.nOut.x*t, y:g.b.y+g.nOut.y*t};
          const da=(ea.x-q.a.x)*q.n.x+(ea.y-q.a.y)*q.n.y, db=(eb.x-q.a.x)*q.n.x+(eb.y-q.a.y)*q.n.y;
          const lead=da<db ? ea : eb, dz=Math.abs(Math.min(da,db)-q.gap);
          const sq=(lead.x-q.a.x)*qd.x+(lead.y-q.a.y)*qd.y;
          if(sq<-td || sq>Lq+td) return;
          if((cen.x-q.a.x)*q.n.x+(cen.y-q.a.y)*q.n.y<=q.gap) return;                // Fliese muss diesseits bleiben
          if(dz<td){ td=dz; tilt=q; } });
        if(tilt){
          const it0=g.orig, c=Math.cos(-it0.rot*TD2R), sn=Math.sin(-it0.rot*TD2R);
          const loc=v=>({x:v.x*c-v.y*sn, y:v.x*sn+v.y*c});
          const P0={x:tilt.a.x+tilt.n.x*tilt.gap, y:tilt.a.y+tilt.n.y*tilt.gap};
          const la=loc({x:g.a.x-it0.x,y:g.a.y-it0.y}), lb=loc({x:g.b.x-it0.x,y:g.b.y-it0.y});
          // Bisheriger Schnitt dieser Kante faellt weg, der neue ersetzt ihn.
          const keep=(it0.cuts||[]).filter(k=>!(Math.abs((la.x-k.p.x)*k.n.x+(la.y-k.p.y)*k.n.y)<0.5 && Math.abs((lb.x-k.p.x)*k.n.x+(lb.y-k.p.y)*k.n.y)<0.5));
          const item={...it0, cuts:[...keep, {p:loc({x:P0.x-it0.x,y:P0.y-it0.y}), n:loc(tilt.n)}]};
          const Qn=TL.tileCorners(S,item);
          if(Qn.length>=3 && Math.abs(TL.polyArea(Qn))>=0.01*TL.tileArea(S,it0.kind)){
            applyItems([item]); TS.lines=[{a:tilt.a,b:tilt.b}];
            setHintLive(`Kante parallel zur ${tilt.kind==='wall'?'Wand':'Nachbarfliese'}, ${f1(tilt.gap)} mm ${tilt.kind==='wall'?'Randfuge':'Fuge'} · ⌘/Strg: ohne Einrasten`);
            render(); return;
          }
        }
      }
    }
    const r=TL.moveTileEdge(S, g.orig, g.a, g.b, t);
    if(r){ applyItems([r.item]); setHintLive(`Kante ${r.t>=0?'+':''}${f1(r.t)} mm${TS.lines.length?' · fluchtet':''}${r.atMax?' · Grundfliese erreicht (Maximum)':''} · ⌘/Strg: ohne Einrasten`); }
  } else if(g.k==='miter'){
    // Endpunkt: zuerst auf Kreuzungen der Kantenfluchten, sonst Winkel gegen
    // die Laengskante von A in 5er-Schritten; mit ⌘/Strg frei.
    const free=e.metaKey||e.ctrlKey;
    if(!g.snaps) g.snaps=TL.miterSnapPoints(tilesData().spec, g.A, g.B, g.m);
    const sn=free ? {snapped:false} : miterSnap(p, g.snaps);
    let ang, pe;
    if(sn.snapped){ pe=sn.q; ang=Math.atan2(pe.y-g.pv.y, pe.x-g.pv.x)*180/Math.PI - g.A.rot; }
    else {
      ang=Math.atan2(p.y-g.pv.y, p.x-g.pv.x)*180/Math.PI - g.A.rot;
      if(!free) ang=Math.round(ang/5)*5;
      const L=Math.hypot(p.x-g.pv.x, p.y-g.pv.y), a0=(ang+g.A.rot)*TD2R;
      pe={x:g.pv.x+Math.cos(a0)*L, y:g.pv.y+Math.sin(a0)*L};
    }
    const a=(ang+g.A.rot)*TD2R;
    if(!g.cover) g.cover=miterCover(g.A, g.B);
    const r=TL.miterAt(tilesData().spec, g.A, g.B, g.pv, {x:Math.cos(a), y:Math.sin(a)}, g.m, K.lay, pe, g.cover);
    if(r) applyItems(r);
    const lk=TL.miterAt.lastHole;
    setHintLive(`Gehrung ${miterLabel(ang+g.A.rot, g.A, g.B)} zu den Längskanten${!r?' · so bliebe von einer Fliese fast nichts':lk>100?` · Lücke ${f1(lk/100)} cm² ungedeckt`:''} · ⌘/Strg: frei`);
  }
  render();
}
function tilesUp(e, g){
  TS.drag=false; TS.lines=[];
  if(g.k==='ruler'){ TS.ruler.snap=null; if(g.moved) rulerSave(); render(); return; }
  if(g.k==='box'){
    const b=TS.box; TS.box=null;
    const K=tilesCtx();
    if(g.moved && b && K){
      // Nur Fliesen, die VOLLSTAENDIG im Rahmen liegen - Beruehren reicht nicht.
      const x0=Math.min(b.a.x,b.b.x), x1=Math.max(b.a.x,b.b.x), y0=Math.min(b.a.y,b.b.y), y1=Math.max(b.a.y,b.b.y);
      const S=tilesData().spec;
      tilesData().items.forEach(it=>{
        if(TL.tileCorners(S,it).every(p=>{ const q=tScr(K,p); return q.x>=x0&&q.x<=x1&&q.y>=y0&&q.y<=y1; })) TS.sel.add(it.id);
      });
    }
    render(); return;
  }
  if(g.moved && g.k!=='none'){
    const S=selItems();
    if(S.length) TS.lastRot=S[0].rot;
    // Wurde gerade ein Duplikat an seinen Platz gezogen, merkt sich das
    // Muster genau diesen Versatz - das naechste Duplizieren setzt ihn fort.
    const pc=TS.pchain;
    if(pc && g.k==='move' && g.moved && TS.sel.size===pc.last.length && pc.last.every(id=>TS.sel.has(id))){
      const it0=tilesData().items.find(it=>it.id===pc.last[0]);
      if(it0) pc.vec={x:it0.x-pc.prev.x, y:it0.y-pc.prev.y};
    }
    if(TS.dup && g.k==='move' && TS.sel.size===TS.dup.dst.length && TS.dup.dst.every(id=>TS.sel.has(id))){
      const T=tilesData();
      const src=T.items.find(it=>it.id===TS.dup.src[0]), dst=T.items.find(it=>it.id===TS.dup.dst[0]);
      if(src && dst){ TS.vec={x:dst.x-src.x, y:dst.y-src.y}; setHint('Versatz gemerkt. ⌘/Strg+D setzt das Muster mit diesem Versatz fort.'); }
    }
    tilesSave();
    return;
  }
  render();
}
// Tipp ins Leere
function tilesTap(e){
  const K=tilesCtx(); if(!K) return;
  const p=tEvLocal(K,e);
  if(TS.tool==='miter2'){
    const T=tilesData(), sn=(e.metaKey||e.ctrlKey) ? {q:p} : miterSnap(p, TS.msnap);
    TS.mpts.push(sn.q);
    if(TS.mpts.length<2){ setHintLive('Zweiten Punkt der Schnittlinie klicken · ⌘/Strg: ohne Einrasten · Esc bricht ab.'); render(); return; }
    const [p1,p2]=TS.mpts, S0=T.items.filter(it=>TS.mpair.includes(it.id));
    const S=S0.length===2 ? withoutMutualTrim(S0[0],S0[1]) : S0;
    const r=S.length===2 && TL.miterAt(T.spec, S[0], S[1], p1, {x:p2.x-p1.x, y:p2.y-p1.y}, T.seq++, K.lay, p2, miterCover(S[0],S[1]));
    if(!r){ TS.mpts=[]; setHintLive('Abgelehnt: bei dieser Linie bliebe von einer Fliese fast nichts übrig. Ersten Punkt neu setzen.'); render(); return; }
    const luecke=TL.miterAt.lastHole;
    snapshot(); applyItems(r); dropTrimSiblings(S[0],S[1]);
    setTileTool('move'); TS.sel=new Set(S.map(it=>it.id));
    if(luecke>100) setHintLive(`Auf Gehrung geschnitten. Im Raum bleibt eine Lücke von ${f1(luecke/100)} cm² ungedeckt: anschneiden oder ergänzen.`);
    else setHint('Auf Gehrung geschnitten. Endgriffe ziehen: rasten auf Fluchten-Kreuzungen, sonst in 5°-Schritten · ⌘/Strg: frei.');
    tilesSave();
    return;
  }
  if(TS.tool==='walljoint'){
    const n=TL.nearestOnRing(K.ring, p);
    if(!n || n.dist>tTol()*1.5){ setHint('Eine Wand anklicken.'); return; }
    const a=n.r[n.i].id, b=n.r[(n.i+1)%n.r.length].id, T=tilesData();
    T.wallJoints=T.wallJoints||[];
    snapshot();
    const w=wallJointOf(T,a,b);
    if(w){ T.wallJoints=T.wallJoints.filter(x=>x!==w); setHint(`Wandfuge ${a}–${b} aufgehoben.`); }
    else { T.wallJoints.push({a, b, width:10, tol:5}); setHint(`Wand ${a}–${b}: Toleranzfuge 10 mm ±5 mm, im Panel einstellbar.`); }
    TS.jointKey='';
    tilesSave();
    return;
  }
  if(TS.tool==='align'){
    // Erst die Fliese, die sich bewegt (Kante oder Ecke), dann das Ziel
    // (Bezugskante bzw. Kreuzungspunkt). Die bewegte Fliese nimmt ihre
    // Auswahl mit.
    const T=tilesData(), tol=tTol();
    const cornerAt=(items,q)=>{ let b=null; items.forEach(it=>TL.tileCorners(T.spec,it).forEach((c,i)=>{ const d=Math.hypot(c.x-q.x,c.y-q.y); if(d<=tol*0.8 && (!b||d<b.d)) b={item:it,i,d,q:c}; })); return b; };
    if(!TS.alignSrc){
      const cr=cornerAt(T.items,p), ed=cr ? null : TL.edgeAt(T.spec, T.items, p, tol);
      if(!cr && !ed){ setHint('Kante oder Ecke der Fliese klicken, die sich ausrichten soll.'); return; }
      TS.alignSrc = cr ? {id:cr.item.id, corner:cr.i} : {id:ed.item.id, i:ed.i};
      setHint(cr ? 'Ecke gewählt. Kreuzungspunkt klicken, an den sie soll.'
                 : 'Kante gewählt. Bezugskante auf einer anderen Fliese klicken · ⇧: rechtwinklig statt fluchtend.');
      render(); return;
    }
    const src=T.items.find(it=>it.id===TS.alignSrc.id); if(!src){ TS.alignSrc=null; return; }
    const group=TS.sel.has(src.id) ? selItems() : [src];
    const gIds=new Set(group.map(it=>it.id)), others=T.items.filter(it=>!gIds.has(it.id));
    if(TS.alignSrc.corner!=null){
      const cr=cornerAt(others,p);
      if(!cr){ setHint('Einen Kreuzungspunkt klicken: eine Ecke einer anderen Fliese.'); return; }
      const r=TL.matchCorner(T.spec, group, src, TS.alignSrc.corner, cr.q, others, 20);
      if(!r){ setHint('An dieser Kreuzung passt die Ecke in keiner Drehung ohne Überlappung.'); return; }
      snapshot(); applyItems(r.items);
      setHint(`Eingepasst: gedreht ${fmtGrad(Math.abs(r.th))}°, Ecke ${f1(r.off)} mm vom Kreuzungspunkt (Fuge).`);
    } else {
      const ed=TL.edgeAt(T.spec, others, p, tol);
      if(!ed){ setHint('Die Bezugskante muss auf einer anderen Fliese liegen.'); return; }
      if(e.shiftKey){
        // Umschalt: rechtwinklig zur Bezugskante drehen statt fluchten
        const Em=TL.edgesOf(TL.tileCorners(T.spec,src))[TS.alignSrc.i];
        const m=TL.squareMove({a:ed.a,b:ed.b}, {a:Em.a,b:Em.b});
        snapshot(); applyItems(group.map(it=>TL.moveItem(it,m)));
        setHint(`Rechtwinklig ausgerichtet: gedreht ${fmtGrad(Math.abs(m.dth))}° um die Kantenmitte.`);
        TS.alignSrc=null; TS.hoverEdge=null; tilesSave(); return;
      }
      const r=TL.alignTiles(T.spec, ed.item, ed.i, src, TS.alignSrc.i);
      snapshot(); applyItems(group.map(it=>TL.moveItem(it,r.m)));
      setHint(`Ausgerichtet: ${r.facing ? 'parallel mit Fuge' : 'fluchtend'}${!r.facing && r.slid==null ? ' (kein Nachbar zum Nachrücken)' : ''} · gedreht ${fmtGrad(Math.abs(r.m.dth))}°, verschoben ${f1(Math.hypot(r.m.dx,r.m.dy))} mm`);
    }
    TS.alignSrc=null; TS.hoverEdge=null;
    tilesSave();
    return;
  }
  if(TS.tool==='joint'){
    const s=jointPick(K, e, p);
    if(!s){ setHint('Wand oder Ecke klicken: Anfang und Ende der Fuge liegen auf Wänden.'); return; }
    if(!TS.draft){ TS.draft=s; setHint('Ende klicken: Ecke rastet ein, sonst 15°/90° zur Wand · ⌘/Strg: frei auf der Wand · ⌥: neben einer Ecke'); render(); return; }
    if(!TL.jointValid(K.ring, TS.draft.q, s.q)){ setHint('Die Fuge muss durch den Raum laufen. Anderen Endpunkt wählen.'); return; }
    const T=tilesData();
    snapshot();
    const nj={id:T.seq++, a:{...TS.draft.q}, b:{...s.q}, width:T.spec.expWidth};
    T.joints.push(nj);
    jointApply(nj);                                       // Fliesen an der Fuge teilen
    TS.draft=null;
    setHint('Dehnungsfuge gesetzt.');
    tilesSave();
    return;
  }
  if(TS.sel.size){ TS.sel.clear(); render(); }
}
// Startpunkt gesetzt, kein ⌘/Strg: Richtung auf 15° zur Wand am Start
// (90° eingeschlossen), Endpunkt = Auftreffpunkt auf die Wand.
function jointSnapped(K, e, p){
  if(!TS.draft || !TS.draft.wd || e.metaKey || e.ctrlKey) return null;
  const r=TL.jointRayEnd(K.ring, TS.draft.q, TS.draft.wd, p, 15);
  return r ? {q:r.q, deg:r.deg} : null;
}
// Ein Werkzeug, eine Regel fuer Anfang UND Ende:
//   Ecke in Reichweite  -> rastet auf die Ecke   (⌥: nicht - z.B. knapp daneben)
//   sonst, Ende         -> Winkelraster 15°/90° zur Wand am Start, Strahl bis zur Wand
//                          (⌘/Strg: frei - der Punkt auf der Wand unter dem Zeiger)
//   sonst               -> Punkt auf der naechsten Wand
function jointPick(K, e, p){
  const tol=tTol()*1.5, alt=e.altKey;
  if(!alt){ const c=TL.jointEndSnap(K.ring, p, tol, 'auto'); if(c && c.corner!=null) return {...c, how:'Ecke'}; }
  if(TS.draft){ const sn=jointSnapped(K, e, p); if(sn) return {q:sn.q, deg:sn.deg, how:'Winkel'}; }
  const w=TL.jointEndSnap(K.ring, p, tol, 'nocorner');
  return w ? {...w, how:'Wand'} : null;
}
function tilesHover(e){
  const K=tilesCtx(); if(!K) return;
  TS.ptr=tEvLocal(K,e);                 // Ziel fuers Einfuegen
  const rh=rulerHit(K, evDev(e));
  if(rh){ cv.style.cursor=rh==='body'?'move':'grab'; TS.rulerCur=true; return; }
  if(TS.rulerCur){ cv.style.cursor=''; TS.rulerCur=false; }
  if(TS.tool==='move' && TS.sel.size && tipAt(K, evDev(e))){ cv.style.cursor='crosshair'; return; }
  if(TS.tool==='move' && TS.sel.size){
    const S=tilesData().spec, ne=TL.notchEdgeAt(S, selItems(), TS.ptr, edgeTol(S));
    const ed=ne ? {item:ne.item, a:ne.a, b:ne.b, i:'n'+ne.ni+'_'+ne.ei} : TL.edgeAt(S, selItems(), TS.ptr, edgeTol(S));
    const k=ed ? ed.item.id+':'+ed.i : '';
    cv.style.cursor = ed ? 'col-resize' : '';
    if(k!==TS.edgeHoverKey){ TS.edgeHoverKey=k; TS.edgeHover=ed; drawTilesView(); }
  }
  if(TS.tool==='miter2'){ TS.hover=(e.metaKey||e.ctrlKey) ? {q:TS.ptr} : miterSnap(TS.ptr, TS.msnap); drawTilesView(); return; }
  if(TS.tool==='align'){
    // Ecke vor Kante: wer nahe an einer Ecke zeigt, meint die Ecke. Nach
    // einer Ecke als Quelle sind nur Ecken (Kreuzungspunkte) Ziele.
    const T=tilesData(), tol=tTol(); let c=null;
    T.items.forEach(it=>TL.tileCorners(T.spec,it).forEach(q=>{ const d=Math.hypot(q.x-TS.ptr.x,q.y-TS.ptr.y); if(d<=tol*0.8 && (!c||d<c.d)) c={q,d}; }));
    const wantCorner=TS.alignSrc && TS.alignSrc.corner!=null;
    TS.hoverEdge = c ? {corner:true, q:c.q} : wantCorner ? null : TL.edgeAt(T.spec,T.items,TS.ptr,tol);
    drawTilesView(); return;
  }
  if(TS.tool!=='joint') return;
  const p=tEvLocal(K,e), h=jointPick(K, e, p);
  TS.hover=h; TS.jalt=e.altKey;
  if(h) setHintLive(h.how==='Winkel' ? `Dehnungsfuge ${fmtGrad(Math.min(h.deg%180, 180-h.deg%180))}° zur Wand · ⌘/Strg: frei · ⌥: neben Ecke`
    : h.how==='Ecke' ? 'Ecke · ⌥: nicht auf die Ecke, frei daneben' : `Wand${TS.draft?' (frei)':''} · Ecken rasten ein, ⌥ nicht`);
  drawTilesView();
}

// ---------- Aktionen ----------
function tileCentreOffset(kind, rot){
  const P=TL.tileShape(tilesData().spec,kind);
  const c={x:P.reduce((s,p)=>s+p.x,0)/P.length, y:P.reduce((s,p)=>s+p.y,0)/P.length};
  const co=Math.cos(rot*TD2R), si=Math.sin(rot*TD2R);
  return {x:c.x*co-c.y*si, y:c.x*si+c.y*co};
}
// Drehraster: 15er-Schritte UND die Chevron-Lagen ±(90°-α) samt Vielfachen
// von 90° - bei einem Schnittwinkel wie 40° laegen die sonst zwischen zwei
// Rasterstufen.
function chevronAngle(a){
  const c=90-tilesData().spec.angle, cand=[];
  for(let k=0;k<24;k++) cand.push(k*15);
  for(let k=0;k<4;k++){ cand.push(TL.normDeg(c+k*90)); cand.push(TL.normDeg(-c+k*90)); }
  a=TL.normDeg(a);
  let best=cand[0], bd=Infinity;
  cand.forEach(x=>{ const d=Math.abs(TL.normDeg(a-x+180)-180); if(d<bd){ bd=d; best=x; } });
  return best;
}
// Chevron-Paar: L und R so gedreht, dass ihre Schraegkanten senkrecht stehen,
// Stoss an Stoss mit Fuge - die Keimzelle des Musters.
function tilesAddPair(def){
  const K=tilesCtx(); if(!K) return;
  const T=tilesData(), d=def||T.spec.set.find(d=>d.shape==='chevron'); if(!d) return; const S=T.spec, c=90-d.angle, kinds=TL.tileKinds(d);
  const p=TL.toLocal(K.F, toWorld(cv.width/2, cv.height/2));
  let L={id:T.seq++, kind:kinds[0], x:0, y:0, rot:TL.normDeg(c)};
  let R={id:T.seq++, kind:kinds[1], x:0, y:0, rot:TL.normDeg(-c)};
  const PL=TL.tileCorners(S,L), PR=TL.tileCorners(S,R);
  // R so verschieben, dass seine Ecke A an L's Ecke B liegt, dann einrasten
  R={...R, x:PL[1].x-PR[0].x+S.joint, y:PL[1].y-PR[0].y};
  const r=TL.snapGroup([TL.tileCorners(S,R)], TL.snapTargets(S,[TL.tileCorners(S,L)],null,[]), S.w);
  if(r) R=TL.moveItem(R,r.m);
  // Paar mittig unter die Bildmitte
  const all=[...TL.tileCorners(S,L),...TL.tileCorners(S,R)];
  const mx=(Math.min(...all.map(q=>q.x))+Math.max(...all.map(q=>q.x)))/2;
  const my=(Math.min(...all.map(q=>q.y))+Math.max(...all.map(q=>q.y)))/2;
  [L,R]=[L,R].map(it=>({...it, x:it.x+p.x-mx, y:it.y+p.y-my}));
  snapshot();
  T.items.push(L,R);
  TS.sel=new Set([L.id,R.id]); TS.dup=null; TS.lastRot=L.rot; TS.axis=null;
  setHint('Chevron-Paar gelegt. An eine Wand ziehen, dann mit ⌘/Strg+C/V oder ⌘/Strg+D vervielfältigen.');
  tilesSave();
}
// Neue Fliese mit Mittelpunkt an p (Rahmen); rastet sofort ein, wenn nah.
function tilesAdd(kind, p){
  const K=tilesCtx(); if(!K) return;
  const T=tilesData();
  if(!p) p=TL.toLocal(K.F, toWorld(cv.width/2, cv.height/2));
  const o=tileCentreOffset(kind, TS.lastRot);
  snapshot();
  let it={id:T.seq++, kind, x:p.x-o.x, y:p.y-o.y, rot:TS.lastRot};
  it=snapMoving(K,[it],false)[0]; TS.lines=[];
  T.items.push(it);
  TS.sel=new Set([it.id]); TS.dup=null; TS.axis=null;
  tilesSave();
}
function tilesRotate(deg){
  const S=selItems(), c=selCentre(); if(!S.length) return;
  snapshot();
  applyItems(S.map(it=>TL.moveItem(it,{dth:deg, px:c.x, py:c.y, dx:0, dy:0})));
  TS.lastRot=selItems()[0].rot;
  tilesSave();
}
// Spiegeln: L<->R an Ort und Stelle (Mittelpunkt bleibt liegen).
function tilesFlip(){
  const S=selItems(); if(!S.length) return;
  snapshot();
  applyItems(S.map(it=>{
    const k=TL.tileOther(tilesData().spec,it.kind), a=tileCentreOffset(it.kind,it.rot), b=tileCentreOffset(k,it.rot);
    // Ein Schnitt gehoert zur Form - gespiegelt passt er nicht mehr.
    const o={...it, kind:k, x:it.x+a.x-b.x, y:it.y+a.y-b.y}; delete o.cuts; return o;
  }));
  tilesSave();
}
// Gehrung: genau zwei ausgewaehlte, ueberlappende Fliesen.
// Gehrung: zwei Punkte setzen (rasten auf Schnittpunkte der Kantenfluchten),
// daraus die Schnittlinie. Enter nimmt die automatische Diagonale.
// Anschnitte, die sich die beiden Fliesen gegenseitig gesetzt haben, stehen
// einer Gehrung im Weg (sie haben die Ueberlappung entfernt) - fuer die
// Gehrung werden sie aufgehoben. Wandschnitte bleiben.
function withoutMutualTrim(A, B){
  const strip=(it,other)=>{ const cuts=(it.cuts||[]).filter(k=>k.by!==other.id), nts=(it.notches||[]).filter(n=>n.by!==other.id), o={...it};
    if(cuts.length) o.cuts=cuts; else delete o.cuts;
    if(nts.length) o.notches=nts; else delete o.notches;
    return o; };
  return [strip(A,B), strip(B,A)];
}
// Zerteilt ein Anschnitt eine Fliese, liegen Geschwisterreste (gleiche
// Herkunft, Schnitt vom anderen Partner) daneben. Hebt die Gehrung den
// Anschnitt auf, ist die Fliese wieder ganz - die Reste muessen weg.
function dropTrimSiblings(A, B){
  const T=tilesData(), pair=new Set([A.id,B.id]);
  const fromOf=it=>it.from!=null ? it.from : it.id;
  const fam=new Map([[fromOf(A),B.id],[fromOf(B),A.id]]);
  T.items=T.items.filter(it=>{
    if(pair.has(it.id)) return true;
    const other=fam.get(fromOf(it));
    return !(other!=null && (it.cuts||[]).some(k=>k.by===other));
  });
}
function tilesMiter(){
  let S=selItems();
  if(S.length!==2){ setHintLive('Für eine Gehrung genau zwei überlappende Fliesen auswählen (⇧+Klick).'); return; }
  S=withoutMutualTrim(S[0],S[1]);
  if(!TL.convexOverlap(TL.tileCorners(tilesData().spec,S[0]), TL.tileCorners(tilesData().spec,S[1]))){
    setHintLive('Die beiden Fliesen überlappen nicht. Erst übereinanderschieben.'); return; }
  const ids=S.map(it=>it.id);
  setTileTool('miter2');
  TS.mpair=ids; TS.mpts=[];
  TS.msnap=TL.miterSnapPoints(tilesData().spec, S[0], S[1], null);
  TS.sel=new Set(ids);
  setHintLive('Gehrung: ersten Punkt der Schnittlinie klicken, rastet auf Fluchten-Kreuzungen · Enter: automatisch · Esc bricht ab.');
  render();
}
function tilesMiterAuto(){
  const T=tilesData(), S0=T.items.filter(it=>(TS.mpair||[]).includes(it.id));
  setTileTool('move'); if(S0.length!==2) return;
  const S=withoutMutualTrim(S0[0],S0[1]);
  TS.sel=new Set(S.map(it=>it.id));
  const K=tilesCtx(), r=TL.miterPair(T.spec, S[0], S[1], T.seq++, K&&K.lay);
  if(!r){ setHintLive('Die beiden Fliesen überlappen nicht. Erst übereinanderschieben.'); return; }
  snapshot(); applyItems(r); dropTrimSiblings(S[0],S[1]);
  setHint('Auf Gehrung geschnitten. Endgriffe ziehen: rasten auf Fluchten-Kreuzungen, sonst in 5°-Schritten · ⌘/Strg: frei.');
  tilesSave();
}
// Naechster Fangpunkt (Fluchten-Kreuzung) zu p, sonst p selbst.
// Polygone der uebrigen Fliesen in der Naehe zweier Gehrungsfliesen.
function miterCover(A, B){
  const T=tilesData(), S=T.spec, ids=new Set([A.id,B.id]);
  const box=[A,B].flatMap(it=>TL.tileCorners(S,it)), m=S.l;
  const x0=Math.min(...box.map(p=>p.x))-m, x1=Math.max(...box.map(p=>p.x))+m, y0=Math.min(...box.map(p=>p.y))-m, y1=Math.max(...box.map(p=>p.y))+m;
  return T.items.filter(it=>!ids.has(it.id)).map(it=>TL.tileCorners(S,it))
    .filter(Q=>Q.some(p=>p.x>=x0&&p.x<=x1&&p.y>=y0&&p.y<=y1));
}
function miterSnap(p, pts){
  let b=null; (pts||[]).forEach(q=>{ const d=Math.hypot(q.x-p.x,q.y-p.y); if(d<=tTol() && (!b||d<b.d)) b={q,d}; });
  return b ? {q:b.q, snapped:true} : {q:p, snapped:false};
}
function tilesTrim(){
  const T=tilesData(), K=tilesCtx(), redo0=redoStack.slice();
  if(!selItems().length){ setHint('Erst die Fliese(n) auswählen, an denen geschnitten wird.'); return; }
  // Schritt 1: die Auswahl selbst an Wand und Raumecken anpassen
  let walled=0;
  const selIds=new Set(TS.sel), newIds=[];
  const repl=new Map();
  selItems().forEach(it=>{
    const parts=K && TL.trimToRoom(T.spec,it,K.layCut,T.joints);
    if(!parts) return;
    walled++;
    const from=it.from!=null ? it.from : it.id;
    repl.set(it.id, parts.map((q,i)=>i===0 ? {...q, ...(parts.length>1?{from}:{})} : {...q, id:T.seq++, from}));
  });
  if(walled){
    snapshot();
    T.items=T.items.flatMap(it=>repl.has(it.id) ? repl.get(it.id) : [it]);
    // Auswahl: alle Stuecke der angepassten Fliesen
    repl.forEach((parts,id)=>{ TS.sel.delete(id); parts.forEach(q=>TS.sel.add(q.id)); });
  }
  const cutters=selItems();
  // Jede Fliese nacheinander an jedem cutter; zerfaellt sie in mehrere
  // Reste, wird jeder Rest eigene Fliese (gleiche Herkunft from).
  let next=[], touched=0, extra=0;
  if(!walled) snapshot();
  T.items.forEach(it=>{
    if(TS.sel.has(it.id)){ next.push(it); return; }
    let parts=[it];
    // Deckung: alle uebrigen Fliesen ausser dieser und den Schneidern
    const cover=T.items.filter(o=>o.id!==it.id && !TS.sel.has(o.id)).map(o=>TL.tileCorners(T.spec,o))
      .filter(Q=>TL.convexOverlap(Q, TL.tileCorners(T.spec,it), -T.spec.l));
    cutters.forEach(c=>{ parts=parts.flatMap(q=>TL.trimBy(T.spec,c,q,cover)||[q]); });
    // Ragt ein angeschnittenes Stueck ueber die Wand, gehoert auch das weg:
    // sonst bliebe hinter der Ausklinkung ein Bein jenseits der Verlegekante
    // stehen, und Teile, die ganz draussen liegen, blieben als eigene Fliese.
    if(K && !(parts.length===1 && parts[0]===it)) parts=parts.flatMap(q=>{ const r=TL.trimToRoom(T.spec,q,K.layCut,T.joints); return r ? r : [q]; });
    if(parts.length===1 && parts[0]===it){ next.push(it); return; }
    touched++;
    const from=it.from!=null ? it.from : it.id;
    parts.forEach((q,i)=>{ next.push(i===0 ? {...q, ...(parts.length>1?{from}:{})} : {...q, id:T.seq++, from}); });
    extra+=parts.length-1;
  });
  if(!touched){
    if(!walled){ undoStack.pop(); redoStack.push(...redo0); setHintLive('Nichts anzuschneiden: keine Wand, hinter der kein Raum mehr liegt, und keine Fliese näher als eine Fuge.'); return; }
    setHint(`${walled} Fliese(n) an Wand/Raumecke angepasst.`); tilesSave(); return;
  }
  T.items=next;
  setHint((walled?`${walled} an Wand/Raumecke angepasst · `:'')+`${touched} Fliese(n) an der Auswahl angeschnitten, mit ${f1(T.spec.joint)} mm Fuge`+(extra?` · ${extra} zusätzliche Reste als eigene Fliesen`:'')+'.');
  tilesSave();
}
// Kopien bekommen eine eigene Herkunft: Reste derselben Fliese teilen sich
// "from"; je Kopie-Satz wird das konsistent neu vergeben.
function freshFrom(copies){
  const T=tilesData(), map=new Map(), mmap=new Map();
  // Eine Gehrung verbindet genau zwei Fliesen. Kopien bekommen eine eigene
  // Kennung je Kopie-Satz - sonst teilen sich Original und Kopie dieselbe
  // Gehrung, und der Griff findet den falschen Partner.
  return copies.map(c=>{
    let o=c;
    if(c.from!=null){ if(!map.has(c.from)) map.set(c.from, T.seq++); o={...o, from:map.get(c.from)}; }
    if(o.cuts && o.cuts.some(k=>k.m!=null)) o={...o, cuts:o.cuts.map(k=>{ if(k.m==null) return k; if(!mmap.has(k.m)) mmap.set(k.m, T.seq++); return {...k, m:mmap.get(k.m)}; })};
    return o;
  });
}
// Dehnungsfuge in die Fliesen schneiden bzw. wieder herausnehmen.
function jointApply(j){
  const T=tilesData();
  T.items=T.items.flatMap(it=>{
    const parts=TL.cutByJoint(T.spec,it,j);
    if(!parts) return [it];
    if(!parts.length) return [];
    const from=it.from!=null ? it.from : it.id;
    // Ursprungsstueck am Fugenschnitt merken: beim Entfernen der Fuge werden
    // NUR dessen Teile wieder eins (nicht alle Reste mit gleichem from).
    const tag=q=>({...q, cuts:q.cuts.map(k=>k.bj===j.id && k.src==null ? {...k, src:it.id} : k)});
    return parts.map((q,i)=>i===0 ? {...tag(q), ...(parts.length>1?{from}:{})} : {...tag(q), id:T.seq++, from});
  });
}
function jointRemove(jid){
  // Reste derselben Fliese (gleiches from) mit Schnitt dieser Fuge wieder
  // zu einer Fliese zusammenfuehren: ein Rest bleibt, ohne die Fugenschnitte.
  const T=tilesData(), seen=new Set();
  T.items=T.items.flatMap(it=>{
    const cut=(it.cuts||[]).find(k=>k.bj===jid);
    if(!cut) return [it];
    const key=cut.src!=null ? 's'+cut.src : 'f'+(it.from!=null ? it.from : it.id);
    if(seen.has(key)) return [];
    seen.add(key);
    const cuts=it.cuts.filter(k=>k.bj!==jid), o={...it};
    if(cuts.length) o.cuts=cuts; else delete o.cuts;
    if(o.from===o.id) delete o.from;                    // war nur fuer die Fugenreste gesetzt
    return [o];
  });
}
function tilesMerge(){
  const T=tilesData(), S=selItems();
  if(S.length<2){ setHintLive('Zum Verbinden mindestens zwei Stücke auswählen (⇧+Klick).'); return; }
  const K=tilesCtx(), r=TL.mergeTiles(T.spec, S, K&&K.lay);
  if(!r.item){ setHintLive('Abgelehnt: '+r.reason); return; }
  snapshot();
  const ids=new Set(S.map(it=>it.id));
  T.items=T.items.filter(it=>!ids.has(it.id) || it.id===r.item.id).map(it=>it.id===r.item.id ? r.item : it);
  TS.sel=new Set([r.item.id]);
  setHint(`${S.length} Stücke zu einer Fliese verbunden${r.item.cuts?` (${r.item.cuts.length} Schnitt${r.item.cuts.length>1?'e':''})`:' (wieder ganz)'}.`);
  tilesSave();
}
function tilesUncut(){
  const S=selItems().filter(it=>(it.cuts && it.cuts.length) || (it.notches && it.notches.length));
  if(!S.length) return;
  snapshot(); applyItems(S.map(it=>{ const o={...it}; delete o.cuts; delete o.notches; return o; }));
  tilesSave();
}
function tilesDelete(){
  if(!TS.sel.size) return;
  snapshot();
  const T=tilesData(); T.items=T.items.filter(it=>!TS.sel.has(it.id));
  TS.sel.clear(); TS.dup=null;
  tilesSave();
}
function tilesNudge(dx,dy){
  const S=selItems(); if(!S.length) return;
  snapshot();
  applyItems(S.map(it=>({...it, x:it.x+dx, y:it.y+dy})));
  tilesSave();
}
// Standardversatz fuers erste Duplikat: die naechste Fliese in derselben
// Chevron-Spalte - quer zur Laengskante um Breite+Fuge, laengs so weit, dass
// die Schraegkanten eine durchgehende Linie bilden.
function defaultVec(it){
  const spec=tilesData().spec, S=TL.tileDef(spec,it.kind), k=S.shape==='chevron'?1/Math.tan(S.angle*TD2R):0, h=S.w+spec.joint;
  const lx=(it.kind==='R'||it.kind.endsWith(':R')?-k:k)*h, ly=h, c=Math.cos(it.rot*TD2R), s=Math.sin(it.rot*TD2R);
  return {x:lx*c-ly*s, y:lx*s+ly*c};
}
function tilesDup(){
  const S=selItems(); if(!S.length){ setHint('Erst Fliesen auswählen.'); return; }
  const T=tilesData(), v=TS.vec||defaultVec(S[0]);
  snapshot();
  const copies=freshFrom(S.map(it=>({...it, id:T.seq++, x:it.x+v.x, y:it.y+v.y})));
  T.items.push(...copies);
  TS.dup={src:S.map(it=>it.id), dst:copies.map(it=>it.id)};
  TS.sel=new Set(TS.dup.dst);
  // Der Versatz gilt sofort als Muster - passt er, kann direkt
  // weitergestreckt werden; wird das Duplikat verschoben, gilt der neue.
  TS.vec=v;
  setHint('Duplikat liegt eine Reihe weiter. Passt es nicht, an seinen Platz ziehen · ⌘/Strg+D setzt fort.');
  tilesSave();
}
// Zwischenablage nur innerhalb der App - Fliesenlagen sind kein Text, den
// man woanders einfuegen will. Eingefuegt wird mit dem Mittelpunkt der
// Gruppe unter dem Zeiger, ohne Zeiger versetzt neben dem Original.
function tilesCopy(){
  const S=selItems(); if(!S.length) return;
  TS.clip=S.map(it=>JSON.parse(JSON.stringify(it)));
  TS.pchain=null;
  setHint(`${S.length} Fliese(n) kopiert.`);
}
function tilesPaste(){
  if(!TS.clip || !TS.clip.length){ setHint('Nichts kopiert.'); return; }
  const K=tilesCtx(); if(!K) return;
  const T=tilesData();
  // Einfuege-Kette wie in PowerPoint: wurde die letzte Einfuegung an ihren
  // Platz gezogen, setzt das naechste Strg+V mit genau diesem Versatz fort
  // (dieselben Fluchten, derselbe Fugenabstand).
  const ch=TS.pchain, last=ch && ch.vec && ch.last.map(id=>T.items.find(it=>it.id===id));
  if(last && last.every(Boolean)){
    snapshot();
    const add=freshFrom(last.map(it=>({...JSON.parse(JSON.stringify(it)), id:T.seq++, x:it.x+ch.vec.x, y:it.y+ch.vec.y})));
    T.items.push(...add);
    TS.pchain={prev:{x:last[0].x,y:last[0].y}, last:add.map(it=>it.id), vec:ch.vec};
    TS.sel=new Set(add.map(it=>it.id)); TS.dup=null;
    setHint(`${add.length} Fliese(n) eingefügt, gleicher Versatz wie zuvor. Verschieben ändert den Versatz fürs nächste Einfügen.`);
    tilesSave();
    return;
  }
  const P=TS.clip.flatMap(it=>TL.tileCorners(T.spec,it));
  const c={x:(Math.min(...P.map(p=>p.x))+Math.max(...P.map(p=>p.x)))/2, y:(Math.min(...P.map(p=>p.y))+Math.max(...P.map(p=>p.y)))/2};
  const to=TS.ptr || {x:c.x+T.spec.l/2, y:c.y+T.spec.l/2};
  snapshot();
  const add=freshFrom(TS.clip.map(it=>({...JSON.parse(JSON.stringify(it)), id:T.seq++, x:it.x+to.x-c.x, y:it.y+to.y-c.y})));
  T.items.push(...add);
  TS.sel=new Set(add.map(it=>it.id)); TS.dup=null;
  // Bezug ist das Original: nach dem Ziehen ergibt sich daraus der Versatz
  TS.pchain={prev:{x:TS.clip[0].x,y:TS.clip[0].y}, last:add.map(it=>it.id), vec:null};
  setHint(`${add.length} Fliese(n) eingefügt. An ihren Platz ziehen, sie rasten ein; danach setzt ⌘/Strg+V das Muster fort.`);
  tilesSave();
}
function tilesKey(e){
  const k=e.key, mod=e.ctrlKey||e.metaKey;
  if(mod && k.toLowerCase()==='c'){ if(TS.sel.size){ e.preventDefault(); tilesCopy(); return true; } return false; }
  if(mod && k.toLowerCase()==='v'){ if(TS.clip){ e.preventDefault(); tilesPaste(); return true; } return false; }
  if(mod && k.toLowerCase()==='d'){ e.preventDefault(); tilesDup(); return true; }
  if(mod && k.toLowerCase()==='a'){ e.preventDefault(); TS.sel=new Set(tilesData().items.map(it=>it.id)); render(); return true; }
  if(mod) return false;
  if(TS.tool==='miter2' && k==='Enter'){ e.preventDefault(); tilesMiterAuto(); return true; }
  if(k==='Escape'){
    if(TS.draft){ TS.draft=null; render(); return true; }
    if(TS.alignSrc){ TS.alignSrc=null; setHint('Fluchten: Kante oder Ecke der Fliese klicken, die sich bewegen soll.'); render(); return true; }
    if(TS.tool!=='move'){ setTileTool('move'); return true; }
    if(TS.sel.size){ TS.sel.clear(); render(); return true; }
    return false;
  }
  if(k==='Delete'||k==='Backspace'){ e.preventDefault(); tilesDelete(); return true; }
  if(k==='q'||k==='Q'){ tilesRotate(e.shiftKey?-1:-15); return true; }
  if(k==='e'||k==='E'){ tilesRotate(e.shiftKey?1:15); return true; }
  if(k==='f'||k==='F'){ tilesFlip(); return true; }
  if(k==='g'||k==='G'){ tilesMiter(); return true; }
  if(k==='a'||k==='A'){ setTileTool(TS.tool==='align'?'move':'align'); return true; }
  if(k==='t'||k==='T'){ tilesTrim(); return true; }
  if(k==='v'||k==='V'){ tilesMerge(); return true; }
  if(k==='w'||k==='W'){ setTileTool(TS.tool==='walljoint'?'move':'walljoint'); return true; }
  if(k==='j'||k==='J'){ setTileTool(TS.tool==='joint'?'move':'joint'); return true; }
  if(k==='k'||k==='K'){ $('tJCheck').click(); return true; }
  if(k==='l'||k==='L'){ rulerToggle(); return true; }
  // Pfeile schieben im BILD (die Ansicht kann gedreht sein) - also die
  // Bildrichtung in den Raumrahmen umrechnen. 1 mm, mit Umschalt 10 mm.
  const arr={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[k];
  if(arr && TS.sel.size){
    e.preventDefault();
    const K=tilesCtx(); if(!K) return true;
    const o=TL.toLocal(K.F,toWorld(0,0)), w=TL.toLocal(K.F,toWorld(arr[0],arr[1]));
    const d={x:w.x-o.x, y:w.y-o.y}, L=Math.hypot(d.x,d.y)||1, step=e.shiftKey?10:1;
    tilesNudge(d.x/L*step, d.y/L*step);
    return true;
  }
  return false;
}
function setTileTool(tool){
  if(tool!=='miter2'){ TS.mpts=[]; TS.msnap=null; }
  TS.tool=tool; TS.draft=null; TS.hover=null; TS.alignSrc=null; TS.hoverEdge=null;
  $('tAlign').setAttribute('aria-pressed', String(tool==='align'));
  if(tool==='joint') TS.sel.clear();
  TS.jalt=false;
  $('tJC').setAttribute('aria-pressed', String(tool==='joint'));
  setHint(null);
  render();
}
// Hinweis je Werkzeug und Schritt - steht, solange das Werkzeug aktiv ist.
const TILE_TOOL_HINTS={
  align:()=>TS.alignSrc
    ? 'Fluchten: jetzt die Bezugskante oder den Kreuzungspunkt klicken · ⇧: rechtwinklig statt fluchtend · Esc zurück'
    : 'Fluchten: Kante oder Ecke der Fliese klicken, die sich bewegen soll · Esc beendet',
  walljoint:()=>'Wandfuge: Wand anklicken markiert ihre Fuge als Toleranzfuge, ein zweiter Klick hebt sie auf · Esc beendet',
  joint:()=>TS.draft
    ? 'Dehnungsfuge: Ende auf Wand oder Ecke klicken · ⌘: Winkel frei · ⌥: neben der Ecke · Esc verwirft'
    : 'Dehnungsfuge: Anfang auf Wand oder Ecke klicken · ⌥: neben der Ecke · Esc beendet',
  miter2:()=>(TS.mpts && TS.mpts.length)
    ? 'Gehrung: zweiten Punkt der Schnittlinie klicken · ⌘: ohne Einrasten · Esc bricht ab'
    : 'Gehrung: ersten Punkt der Schnittlinie klicken · Enter: Diagonale automatisch · Esc bricht ab',
};

// ---------- Panel ----------
let activeTileId=null, tileSetKey='';
const TILE_LABELS={hexagon:'Hexagon',chevron:'Chevron',rectangle:'Viereck',triangle:'Dreieck'};
function activeTileDef(){ const defs=tilesData().spec.set; return defs.find(d=>d.id===activeTileId)||defs[0]; }
function tileLabel(kind){ const d=TL.tileDef(tilesData().spec,kind); return (d.name||TILE_LABELS[d.shape]||'Chevron')+(d.shape==='chevron' ? (kind==='R'||kind.endsWith(':R')?' R':' L'):''); }
function tileIcon(kind){
  const P=TL.tileShape(tilesData().spec,kind), xs=P.map(p=>p.x), ys=P.map(p=>p.y), x=Math.min(...xs), y=Math.min(...ys), w=Math.max(...xs)-x, h=Math.max(...ys)-y, scale=Math.min(36/w,24/h);
  return `<svg viewBox="0 0 44 32" aria-hidden="true"><polygon points="${P.map(p=>`${22+(p.x-x-w/2)*scale},${16+(p.y-y-h/2)*scale}`).join(' ')}" fill="#d5bd93" stroke="currentColor" stroke-width="1.3"/></svg>`;
}
function renderTileSet(){
  const T=tilesData(), d=activeTileDef();
  activeTileId=d?.id||null;
  const key=JSON.stringify([currentRoom,T.spec.set,activeTileId,[...new Set(T.items.map(it=>it.kind))]]);
  if(key!==tileSetKey){
    tileSetKey=key; const list=$('tSetList'), pal=$('tPalette'); list.replaceChildren(); pal.replaceChildren();
    T.spec.set.forEach(def=>{
      const row=document.createElement('div'); row.className='tile-set-row';
      const choose=document.createElement('button'); choose.type='button'; choose.setAttribute('aria-pressed',String(def.id===activeTileId));
      choose.innerHTML=tileIcon(TL.tileKinds(def)[0])+`<span>${escapeHtml(def.name||TILE_LABELS[def.shape])}<small>${TILE_LABELS[def.shape]} · ${def.l} × ${def.w} mm · ${def.thick} mm dick</small></span>`;
      choose.onclick=()=>{activeTileId=def.id; renderTilesPanel();}; row.append(choose);
      const del=document.createElement('button'); del.textContent='×'; del.title='Variante entfernen'; del.setAttribute('aria-label',(def.name||TILE_LABELS[def.shape])+' entfernen');
      del.disabled=T.items.some(it=>TL.tileKinds(def).includes(it.kind)); if(del.disabled) del.title='Zuerst die verlegten Fliesen dieser Variante entfernen';
      del.onclick=()=>{snapshot(); T.spec.set=T.spec.set.filter(d=>d.id!==def.id); tilesSave();}; row.append(del); list.append(row);
      TL.tileKinds(def).forEach(kind=>{const b=document.createElement('button'); b.className='tb tpal'; b.title=tileLabel(kind)+` · ${def.l} × ${def.w} × ${def.thick} mm · Klicken oder auf den Plan ziehen`; b.setAttribute('aria-label',tileLabel(kind)+' legen'); b.innerHTML=tileIcon(kind); bindTilePalette(b,kind); pal.append(b);});
      if(def.shape==='chevron'){ const b=document.createElement('button'); b.className='tb'; b.title=(def.name||'Chevron')+' als Paar legen'; b.setAttribute('aria-label',b.title); b.innerHTML='<svg viewBox="0 0 44 32" aria-hidden="true"><path d="M3 8 L21 20 L21 28 L3 16 Z M23 20 L41 8 L41 16 L23 28 Z" fill="#d5bd93" stroke="currentColor" stroke-width="1.3"/></svg>'; b.onclick=()=>tilesAddPair(def); pal.append(b); }
    });
    if(!T.spec.set.length) pal.innerHTML='<span class="tnote">Fliesenset zusammenstellen →</span>';
  }
  if(document.activeElement!==$('tName')) $('tName').value=d?.name||'';
  $('tW').closest('label').querySelector('span').textContent=d?.shape==='chevron'?'Breite':'Höhe';
  $('tL').closest('label').querySelector('span').textContent=d?.shape==='chevron'?'Länge':'Breite';
  $('tName').disabled=!d; $('tShape').disabled=!d; $('tShape').value=d?.shape||'hexagon';
  $('tA').closest('label').hidden=d?.shape!=='chevron'; $('tSame').closest('label').hidden=d?.shape!=='chevron';
  $('tShape').disabled=!d||T.items.some(it=>TL.tileKinds(d).includes(it.kind));
  $('tShape').title=$('tShape').disabled&&d?'Form erst ändern, nachdem die verlegten Fliesen dieser Variante entfernt sind':'';
}
$('tSetAdd').onclick=()=>{
  const T=tilesData(), shape=$('tNewShape').value; snapshot();
  const id='tile-'+Date.now().toString(36)+'-'+T.seq++;
  T.spec.set.push(TL.regularTileDef({id,name:TILE_LABELS[shape],shape,w:300,l:shape==='chevron'?850:300,thick:10,angle:45})); activeTileId=id;
  $('tSpecBox').open=true; tilesSave();
};
$('tName').onchange=()=>{const d=activeTileDef(); if(!d)return; snapshot(); d.name=$('tName').value.trim().slice(0,60)||TILE_LABELS[d.shape]; tilesSave();};
$('tShape').onchange=()=>{const d=activeTileDef(); if(!d||tilesData().items.some(it=>TL.tileKinds(d).includes(it.kind)))return; snapshot(); d.shape=$('tShape').value; Object.assign(d,TL.regularTileDef(d)); if(d.id==='legacy'&&d.shape!=='chevron')d.id='tile-'+Date.now().toString(36); activeTileId=d.id; tilesSave();};

const SPEC_FIELDS=[['tW','w'],['tL','l'],['tA','angle'],['tJ','joint'],['tE','edgeGap'],['tXW','expWidth'],['tT','thick']];
$('tSame').addEventListener('change',()=>{ const T=tilesData(); snapshot(); T.spec.sameColor=$('tSame').checked?1:0; tilesSave(); });
SPEC_FIELDS.forEach(([id,key])=>{
  $(id).addEventListener('change',()=>{
    const v=parseFloat($(id).value.replace(',','.'));
    const T=tilesData(), def=activeTileDef();
    const ok = Number.isFinite(v) && (key==='angle' ? v>=5 && v<=90 : (key==='joint'||key==='edgeGap') ? v>=0 : v>0);
    if(!ok){ $(id).value=String((['w','l','angle','thick'].includes(key)?def:T.spec)?.[key]??T.spec[key]).replace('.',','); setHint('Ungültiger Wert.'); return; }
    snapshot(); if(['w','l','angle','thick'].includes(key) && def){def[key]=v; if((def.shape==='hexagon'||def.shape==='triangle') && (key==='w'||key==='l')){if(key==='w')def.l=v*2/Math.sqrt(3); Object.assign(def,TL.regularTileDef(def));} if(def.id==='legacy') T.spec[key]=v;} else T.spec[key]=v; tilesSave();
  });
});
// Palette: Tippen legt die Fliese in die Bildmitte, Ziehen auf die
// Zeichenflaeche legt sie dort ab, wo der Zeiger losgelassen wird.
function bindTilePalette(b,kind){
  b.addEventListener('pointerdown',e=>{ if(e.button!==0) return; TS.pal={kind}; b.setPointerCapture(e.pointerId); });
  // Tastatur (Enter/Leertaste auf dem Knopf) kommt als click ohne Zeiger.
  b.addEventListener('click',e=>{ if(e.detail===0) tilesAdd(kind); });
  b.addEventListener('pointerup',e=>{
    if(!TS.pal) return;
    TS.pal=null;
    const r=cv.getBoundingClientRect(), br=b.getBoundingClientRect();
    const inR=R=>e.clientX>=R.left && e.clientX<=R.right && e.clientY>=R.top && e.clientY<=R.bottom;
    if(inR(r)){
      const K=tilesCtx(); if(!K) return;
      tilesAdd(kind, TL.toLocal(K.F, toWorld((e.clientX-r.left)*DPR(), (e.clientY-r.top)*DPR())));
    } else if(inR(br)) tilesAdd(kind);
  });
  b.addEventListener('pointercancel',()=>{ TS.pal=null; });
}
$('tDel').onclick=tilesDelete;
$('tMiter').onclick=tilesMiter;
$('tJCheck').onclick=()=>{
  TS.jcheck=!TS.jcheck; $('tJCheck').setAttribute('aria-pressed',String(!!TS.jcheck));
  setHint(TS.jcheck ? 'Fugencheck an. Befunde im Panel unter „Fugen“.' : 'Fugencheck aus.');
  render();
};
$('tAlign').onclick=()=>setTileTool(TS.tool==='align'?'move':'align');
$('tUncut').onclick=tilesUncut;
$('tTrim').onclick=tilesTrim;
// Doppelt bestaetigen: erster Klick schaerft den Knopf (rot, 4 s), erst der
// zweite entfernt.
let clearArmed=null;
$('tClear').onclick=()=>{
  const T=tilesData(), b=$('tClear'); if(!T.items.length) return;
  if(!clearArmed){
    b.textContent=`Wirklich alle ${T.items.length} entfernen?`; b.classList.add('arm');
    clearArmed=setTimeout(()=>{ clearArmed=null; b.textContent='Alle Fliesen entfernen'; b.classList.remove('arm'); },4000);
    return;
  }
  clearTimeout(clearArmed); clearArmed=null; b.textContent='Alle Fliesen entfernen'; b.classList.remove('arm');
  snapshot(); T.items=[]; TS.sel.clear(); TS.vec=null; TS.dup=null; tilesSave();
  setHint('Alle Fliesen entfernt. Rückgängig (⌘Z) holt sie zurück.');
};
$('tJC').onclick=()=>setTileTool(TS.tool==='joint'?'move':'joint');
$('tNums').onchange=()=>{ TS.showNums=$('tNums').checked; render(); };
$('tPrint').onclick=()=>tilesPrint();

function renderTilesPanel(){
  const on=M.mode==='tiles';
  $('tilesec').hidden=!on;
  document.body.classList.toggle('tilesmode', on);
  if(!on) return;
  const K=tilesCtx(), T=tilesData();
  renderTileSet();
  $('tRuler').setAttribute('aria-pressed', String(TS.ruler.on));
  const def=activeTileDef();
  SPEC_FIELDS.forEach(([id,key])=>{ if(document.activeElement!==$(id)) $(id).value=String(['w','l','angle','thick'].includes(key)?(def||T.spec)[key]:T.spec[key]).replace('.',','); $(id).disabled=['w','l','angle','thick'].includes(key)&&!def; });
  $('tSame').checked=!!T.spec.sameColor;
  // Die Fliese wird einmal je Projekt eingestellt: eine Zeile, die aufklappt.
  const sp=T.spec, num=v=>String(v).replace('.',',');
  $('tSpecSum').textContent=`${sp.set.length} Variante${sp.set.length===1?'':'n'} · Fuge ${num(sp.joint)} mm`;
  // Auswahl: nur die Aktionen, die auf GENAU diese Auswahl passen. Ohne
  // Auswahl gibt es den Block nicht - frueher stand dort eine graue Knopfwand.
  const n=TS.sel.size;
  $('tSelBox').hidden=!n;
  if(n){
    $('tSelInfo').textContent=`${n} Fliese${n>1?'n':''} ausgewählt`;
    $('tMiter').hidden = n!==2;
    $('tUncut').hidden = !selItems().some(it=>(it.cuts && it.cuts.length) || (it.notches && it.notches.length));
  }
  [['tAlign','align'],['tJC','joint'],['tMiter','miter2']]
    .forEach(([id,t])=>$(id).setAttribute('aria-pressed', String(TS.tool===t)));
  // Fugencheck: Befunde stehen hier, solange er an ist - mit den Farben
  // des Plans als Legende (frueher vier Sekunden in der Statuszeile).
  const ck=$('tCheck');
  ck.hidden=!TS.jcheck;
  if(TS.jcheck){
    const jc=TL.jointCheck(T.spec,T.items), eng=jc.filter(f=>f.dmin<T.spec.joint-0.2).length, weit=jc.length-eng;
    const v=jointOffsetsCached().length, g=uncoveredCached();
    const zeile=(farbe,txt)=>`<span><i style="background:${farbe}"></i>${txt}</span>`;
    const fu=String(T.spec.joint).replace('.',',');
    ck.innerHTML='<b>Fugencheck</b>'
      +(eng ? zeile('#d0021b',`${eng} Fuge${eng>1?'n':''} enger als ${fu} mm`) : '')
      +(weit ? zeile('#e07b00',`${weit} Fuge${weit>1?'n':''} weiter als ${fu} mm`) : '')
      +(v ? zeile('#7b2cbf',`${v}× Fugenversatz: Fugen treffen sich nicht in einem Punkt`) : '')
      +(g && g.comps.length ? zeile('rgba(214,0,170,.55)',`${g.comps.length} unbelegte Stelle${g.comps.length>1?'n':''}, ${(g.area/1e6).toLocaleString('de-DE',{maximumFractionDigits:3})} m²`) : '')
      +(!jc.length && !v && !(g && g.comps.length) ? zeile('var(--good)','Alle Fugen stimmen.') : '');
  }
  // Breite neuer Dehnungsfugen gilt nur fuer das Werkzeug J.
  $('tXWRow').hidden = TS.tool!=='joint';
  // Fugenliste nur neu bauen, wenn sich die Fugen aendern - sonst verliert
  // ein Eingabefeld bei jedem Bild den Fokus.
  const jk=JSON.stringify([T.joints, T.wallJoints]);
  if(jk!==TS.jointKey){
    TS.jointKey=jk;
    const L=$('tJList'); L.innerHTML='';
    if(!T.joints.length && !(T.wallJoints||[]).length)
      L.innerHTML=plat('<small>Noch keine. Dehnungsfuge (J) oder Wandfuge (W) über die Leiste oben.</small>');
    T.joints.forEach((j,i)=>{
      const row=document.createElement('div'); row.className='jrow';
      const len=Math.hypot(j.b.x-j.a.x, j.b.y-j.a.y);
      row.innerHTML=`<b>DF ${i+1} <small>${fmtMm(len)} mm</small></b>
        <label>Breite <input inputmode="decimal" value="${String(j.width).replace('.',',')}"> mm</label>
        <button class="rowbtn del" title="Dehnungsfuge löschen">✕</button>`;
      row.querySelector('input').onchange=ev=>{
        const v=parseFloat(ev.target.value.replace(',','.'));
        if(!(v>0)){ ev.target.value=String(j.width).replace('.',','); return; }
        snapshot(); const jj=tilesData().joints.find(x=>x.id===j.id); jointRemove(jj.id); jj.width=v; jointApply(jj); tilesSave();
      };
      row.querySelector('button').onclick=()=>{ snapshot(); jointRemove(j.id); tilesData().joints=tilesData().joints.filter(x=>x.id!==j.id); tilesSave(); };
      L.appendChild(row);
    });
    (T.wallJoints||[]).forEach(w=>{
      const row=document.createElement('div'); row.className='jrow';
      row.innerHTML=`<b>Wand ${escapeHtml(w.a)}–${escapeHtml(w.b)}</b>
        <label><input inputmode="decimal" value="${String(w.width).replace('.',',')}"> ± <input inputmode="decimal" value="${String(w.tol).replace('.',',')}"> mm</label>
        <button class="rowbtn del" title="Wandfuge aufheben">✕</button>`;
      const [iw,it]=row.querySelectorAll('input');
      const set=(key,inp)=>{ const v=parseFloat(inp.value.replace(',','.'));
        if(!(v>=0)){ inp.value=String(w[key]).replace('.',','); return; }
        snapshot(); const x=wallJointOf(tilesData(),w.a,w.b); if(x) x[key]=v; TS.jointKey=''; tilesSave(); };
      iw.onchange=()=>set('width',iw); it.onchange=()=>set('tol',it);
      row.querySelector('button').onclick=()=>{ snapshot(); T.wallJoints=T.wallJoints.filter(x=>x!==w); TS.jointKey=''; tilesSave(); };
      L.appendChild(row);
    });
  }
  if(!K){ $('tKey').innerHTML='<span>Fliesen gibt es erst, wenn der Grundriss geschlossen und eingemessen ist.</span>'; $('tStats').innerHTML=''; $('tWarn').innerHTML=''; return; }
  if(TS.drag) return;
  const ev0=tilesEval(K), s=ev0.stats, nest=TS.nestSnap && TS.nestSnap.key===TS.cacheKey ? TS.nestSnap.nest : null;
  const m2=v=>fmt2(v/1e6);
  const stk=k=>nest ? nest.stocks.filter(st=>st.kind===k).length : 0;
  const buyL=s.L.whole+stk('L'), buyR=s.R.whole+stk('R'), buy=buyL+buyR;
  // Ware kommt gemischt (gleich viele L und R): gekauft wird nach der
  // knapperen Sorte, in m².
  const tileA=T.spec.w*T.spec.l/1e6, bigger=Math.max(buyL,buyR), spareL=bigger-buyL, spareR=bigger-buyR;
  const sqm=v=>v.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
  const wasteN=buy ? 1-s.covered/(buy*T.spec.w*T.spec.l) : 0;
  const kg=(ev0.grout.litre*1.6*1.1).toLocaleString('de-DE',{maximumFractionDigits:1});
  // Warnungen zuerst, dann die Zahlen, die man zum Einkaufen braucht.
  $('tWarn').innerHTML=(M.an && M.an.dof>0 ? `<div class="twarn">Form noch nicht eindeutig: der Plan kann sich mit der nächsten Messung verschieben.</div>` : '')
    +(s.out?`<div class="twarn">${s.out} Fliese${s.out>1?'n liegen':' liegt'} ganz außerhalb <button id="tOut" class="rowbtn">entfernen</button></div>`:'')
    +(s.overlaps?`<div class="twarn">${s.overlaps} Überlappung${s.overlaps>1?'en':''}, rot markiert</div>`:'');
  $('tKey').innerHTML = nest
    ? `<span>Einkauf</span><b class="main">${sqm(2*bigger*tileA)} <small>m² · ${2*bigger} Fliesen</small></b>
       <span></span><b><small>${buyL} L, ${buyR} R mit Recycling${spareL+spareR?`, ${spareL+spareR} übrig`:''}</small></b>
       <span>Verschnitt</span><b>${fmt2(wasteN*100)} <small>%</small></b>`
    : `<span>Einkauf</span><b class="main">${sqm(s.placed*tileA)} <small>m² · ${s.placed} ${s.placed===1 ? 'Fliese' : 'Fliesen'}</small></b>
       <span></span><b><small>${s.L.whole+s.L.cut} L, ${s.R.whole+s.R.cut} R, ohne Recycling (mit Recycling rechnet der Druck)</small></b>
       <span>Verschnitt</span><b>${fmt2(s.waste*100)} <small>%</small></b>`;
  $('tKey').innerHTML += `<span>Fugenmörtel</span><b>≈ ${kg} <small>kg</small></b>
       <span>Fugenkreuze</span><b>${ev0.spacers.mid} <small>Mittelstück · </small>${ev0.spacers.fan} <small>Halbfächer · </small>${ev0.spacers.sideA}/${ev0.spacers.sideB} <small>45° A/B</small></b>
       <span>Belegt</span><b>${m2(s.covered)} <small>von ${m2(s.roomArea)} m²</small></b>`;
  const dash='<span class="tmut">—</span>';
  $('tStats').innerHTML=`<table class="ttab tfull">
    <tr><th></th><th>L</th><th>R</th><th>Σ</th></tr>
    <tr class="tsub"><td colspan="4">Verlegt</td></tr>
    <tr><td>ganz</td><td>${s.L.whole}</td><td>${s.R.whole}</td><td>${s.L.whole+s.R.whole}</td></tr>
    <tr><td>geschnitten</td><td>${s.L.cut}</td><td>${s.R.cut}</td><td>${s.L.cut+s.R.cut}</td></tr>
    <tr class="tsub"><td colspan="4">Einkauf</td></tr>
    <tr><td>ohne Recycling</td><td>${s.L.whole+s.L.cut}</td><td>${s.R.whole+s.R.cut}</td><td>${s.placed}</td></tr>
    <tr class="tsum"><td>mit Recycling</td><td>${nest?buyL:dash}</td><td>${nest?buyR:dash}</td><td>${nest?buy:dash}</td></tr>
    ${nest?`<tr><td>übrig (gleich viele L/R)</td><td>${spareL}</td><td>${spareR}</td><td>${spareL+spareR}</td></tr>`:''}
  </table>
  <table class="ttab tfull tkv">
    <tr><td>Schnittstücke</td><td>${s.pieces}${nest?` aus ${nest.stocks.length} Rohfliesen`:''}</td></tr>
    <tr><td>Verschnitt ohne Recycling</td><td>${fmt2(s.waste*100)} %</td></tr>
    <tr><td>Fugenkreuz Mittelstück</td><td>${ev0.spacers.mid} Stück</td></tr>
    <tr><td>Fugenkreuz Halbfächer</td><td>${ev0.spacers.fan} Stück</td></tr>
    <tr><td>Fugenkreuz 45° A / B</td><td>${ev0.spacers.sideA} / ${ev0.spacers.sideB} Stück</td></tr>
    <tr><td>Fugenmörtel</td><td>${(ev0.grout.litre).toLocaleString('de-DE',{maximumFractionDigits:1})} l</td></tr>
    <tr><td>offen (Fugen und Lücken)</td><td>${m2(Math.max(0,s.roomArea-s.covered))} m²</td></tr>
    ${TS.jcheck && gapCache.val ? `<tr><td>davon Lücken</td><td>${(gapCache.val.area/1e6).toLocaleString('de-DE',{maximumFractionDigits:3})} m²</td></tr>` : ''}
  </table>
  <div class="tnote">Fugenmörtel aus ${fmtMm(ev0.grout.length/1000)} m Fuge, ${m2(ev0.grout.area)} m² Fugenfläche, ${m2(ev0.grout.edgeArea)} m² Randfuge und ${String(T.spec.thick).replace('.',',')} mm Fliesenstärke; 1,6 kg/l plus 10 % (Herstellerangabe prüfen). Dehnungs- und markierte Wandfugen sind Silikon und nicht enthalten.</div>
  <div class="tnote">${nest ? `Recycling: mindestens ${nest.kerf} mm Schnittbreite, Reste im Umkreis von ${(nest.near/1000).toLocaleString('de-DE')} m.${nest.swapped?` ${nest.swapped} Stück aus der anderen Sorte${T.spec.sameColor?'':' (Randstücke, im Plan orange markiert)'}.`:''}`
    : `Recycling und Schnittnummern rechnet der Druck aus${TS.nestSnap?'; der letzte Stand ist veraltet':''}.`}</div>`;
  if(T.spec.set.length!==1 || T.spec.set[0]?.id!=='legacy' || T.spec.set[0]?.shape!=='chevron'){
    const kinds=T.spec.set.flatMap(TL.tileKinds), rows=kinds.map(k=>{const q=s[k]||{whole:0,cut:0}, stocks=nest?nest.stocks.filter(st=>st.kind===k).length:q.cut; return {k,q,buy:q.whole+stocks};});
    const buyArea=rows.reduce((a,r)=>a+r.buy*TL.tileArea(T.spec,r.k),0), buyCount=rows.reduce((a,r)=>a+r.buy,0);
    $('tKey').innerHTML=`<span>Einkauf</span><b class="main">${sqm(buyArea/1e6)} <small>m² · ${buyCount} ${buyCount===1 ? 'Fliese' : 'Fliesen'}</small></b><span>Verschnitt</span><b>${fmt2((buyArea?1-s.covered/buyArea:0)*100)} <small>%</small></b><span>Fugenmörtel</span><b>≈ ${kg} <small>kg</small></b><span>Belegt</span><b>${m2(s.covered)} <small>von ${m2(s.roomArea)} m²</small></b>`;
    $('tStats').innerHTML=`<table class="ttab tfull"><tr><th>Variante</th><th>ganz</th><th>Schnitt</th><th>Einkauf</th></tr>${rows.map(r=>`<tr><td>${escapeHtml(tileLabel(r.k))}<small> · ${TL.tileDef(T.spec,r.k).thick} mm</small></td><td>${r.q.whole}</td><td>${r.q.cut}</td><td>${r.buy}</td></tr>`).join('')}</table><div class="tnote">${nest?'Mit Recycling aus dem aktuellen Druck.':'Ohne Recycling; Schnittblätter berechnen die Wiederverwendung je Variante.'} Fugenvolumen mit der kleineren Dicke der angrenzenden Fliesen; ≈ 1,6 kg/l plus 10 %. Unterschiedliche Dicken erfordern einen Höhenausgleich.</div>`;
  }
  const bo=$('tOut');
  if(bo) bo.onclick=()=>{
    const ev=tilesEval(K);
    snapshot();
    T.items=T.items.filter(it=>ev.status.get(it.id)!=='out');
    TS.sel=new Set([...TS.sel].filter(id=>T.items.some(it=>it.id===id)));
    tilesSave();
  };
}

// ---------- Druck ----------
// Ein Fenster mit A4-Seiten: Seite 1 der Gesamtplan (blattfuellend, alle
// Schnittstuecke nummeriert), Seite 2 derselbe Plan als reines
// Verlegemuster (ohne Nummern und Schraffur), danach je Rohfliese ein Blatt
// mit der Fliese in Draufsicht und den Schnittmassen ab den Fliesenecken.
const f1=v=>(Math.round(v*10)/10).toLocaleString('de-DE');
const n2=v=>v.toFixed(2);
function svgPoly(P, attrs){ return `<polygon points="${P.map(p=>`${n2(p.x)},${n2(p.y)}`).join(' ')}" ${attrs}/>`; }
function svgText(x,y,t,attrs=''){ return `<text x="${n2(x)}" y="${n2(y)}" ${attrs}>${escapeHtml(t)}</text>`; }
function svgLine(a,b,attrs){ return `<line x1="${n2(a.x)}" y1="${n2(a.y)}" x2="${n2(b.x)}" y2="${n2(b.y)}" ${attrs}/>`; }
const CORNER_NAMES=['A','B','C','D','E','F'];

// Startfliese: die erste gelegte, im Raum liegende Fliese. Ihre Ecke A wird
// zu zwei nicht parallelen Waenden bemasst - von dort legt der Fliesenleger los.
function refDims(K, T, ev){
  const it=T.items.find(x=>ev.status.get(x.id)!=='out');
  if(!it) return null;
  const A=TL.tileCorners(T.spec,it)[0];
  const cands=TL.ringsOf(K.ring).flatMap(R=>TL.edgesOf(R)).map(e=>{
    const t=(A.x-e.a.x)*e.d.x+(A.y-e.a.y)*e.d.y, L=Math.hypot(e.b.x-e.a.x,e.b.y-e.a.y);
    const foot={x:e.a.x+e.d.x*t, y:e.a.y+e.d.y*t};
    return {e, foot, dist:Math.hypot(A.x-foot.x, A.y-foot.y), inSeg:t>=-1 && t<=L+1};
  }).filter(c=>c.inSeg).sort((a,b)=>a.dist-b.dist);
  if(!cands.length) return {it, A, dims:[]};
  const first=cands[0];
  const second=cands.find(c=>Math.abs(c.e.d.x*first.e.d.x+c.e.d.y*first.e.d.y)<Math.cos(30*TD2R));
  return {it, A, dims:[first, second].filter(Boolean)};
}

function overviewSvg(K, T, ev, L, ox, oy, opts={}){
  const pg=p=>{ const q=TL.printPt(L,p); return {x:q.x+ox, y:q.y+oy}; };
  const RP_of=R=>R.map(pg);
  const S=T.spec, out=[], id=opts.id||'o';
  const marks=()=>(opts.highlightPieces||[]).forEach(h=>{
    const P=h.poly.map(pg), m={x:P.reduce((a,p)=>a+p.x,0)/P.length, y:P.reduce((a,p)=>a+p.y,0)/P.length};
    out.push(svgPoly(P,'fill="#c00" fill-opacity=".8" stroke="#000" stroke-width="0.3"'));
    out.push(`<circle cx="${n2(m.x)}" cy="${n2(m.y-4)}" r="2.2" fill="#fff" stroke="#c00" stroke-width="0.3"/>`);
    out.push(svgText(m.x,m.y-3.9,String(h.no),'font-size="2.4" font-weight="700" text-anchor="middle" dominant-baseline="middle" fill="#c00"'));
  });
  // nur die Markierungen - der Plan darunter kommt als Bild (Schnittblaetter)
  if(opts.highlightOnly){ marks(); return out.join(''); }
  const ringP=K.ring.map(pg), holesP=K.ring.holes.map(h=>h.map(pg));
  const dOf=Rs=>Rs.map(R=>'M'+R.map(p=>`${n2(p.x)},${n2(p.y)}`).join('L')+'Z').join('');
  const roomD=dOf([ringP,...holesP]), layD=dOf(TL.ringsOf(K.lay).map(R=>R.map(pg)));
  // Nur die Legende nutzt das Muster noch. Die Flaechen selbst kommen ohne
  // clip-path, mask und pattern aus: der PDF-Export von Chrome macht daraus
  // Transparenzgruppen je Fliese und haengt bei ~600 Fliesen minutenlang.
  out.push(`<defs><pattern id="hat${id}" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <line x1="0" y1="0" x2="0" y2="1.6" stroke="#000" stroke-width="0.25" stroke-opacity=".45"/></pattern></defs>`);
  out.push(svgPoly(ringP,'fill="#fff" stroke="none"'));
  // Schraffur als echte Linien: Schar unter 45°, je Linie die Schnittpunkte
  // mit allen Raendern (gerade/ungerade = drinnen/draussen)
  const hatchD=Rs=>{
    const nx=Math.SQRT1_2, us=Rs.flat().map(p=>(p.x+p.y)*nx);
    const u0=Math.ceil(Math.min(...us)/1.6)*1.6, u1=Math.max(...us); let d='';
    for(let u=u0; u<=u1; u+=1.6){
      const vs=[];
      Rs.forEach(R=>R.forEach((a,i)=>{ const b=R[(i+1)%R.length], fa=(a.x+a.y)*nx-u, fb=(b.x+b.y)*nx-u;
        if((fa<0)!==(fb<0)){ const t=fa/(fa-fb); vs.push({x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t}); } }));
      vs.sort((p,q)=>(p.x-p.y)-(q.x-q.y));
      for(let k=0;k+1<vs.length;k+=2) d+=`M${n2(vs[k].x)},${n2(vs[k].y)}L${n2(vs[k+1].x)},${n2(vs[k+1].y)}`;
    }
    return d;
  };
  T.items.forEach(it=>{
    const st=ev.status.get(it.id); if(st==='out') return;
    // vorab auf die Verlegekante zugeschnitten; Kerben und Inseln als Loecher
    TL.tilePieces(S,it,K.lay,T.joints).forEach(q=>{
      const Rs=[q.poly, ...q.cutouts].map(R=>R.map(pg)), d=dOf(Rs);
      out.push(`<path d="${d}" fill-rule="evenodd" fill="${it.kind==='L'?'#ececec':'#c8c8c8'}" stroke="#333" stroke-width="${opts.thin?0.08:0.15}"/>`);
      // im kleinen Lageplan der Schnittblaetter und im reinen Verlegemuster
      // reicht die L/R-Farbe
      if(st==='cut' && !opts.thin && !opts.pattern){ const h=hatchD(Rs);
        if(h) out.push(`<path d="${h}" stroke="#8a8a8a" stroke-width="0.25" fill="none"/>`); }
    });
  });
  T.joints.forEach(j=>{ const J=TL.clipConvex(K.lay,TL.jointStrip(j)); if(J.length>=3) out.push(svgPoly(J.map(pg),'fill="#000"')); });
  holesP.forEach(h=>out.push(svgPoly(h,`fill="#bbb" stroke="none"`)));
  // Fuge an der Wand (Randfuge / Toleranzfuge): Band zwischen Wand und Verlegekante
  out.push(`<path d="${roomD}${layD}" fill="#9ab" fill-opacity=".35" fill-rule="evenodd" stroke="none"/>`);
  out.push(`<path d="${roomD}" fill="none" stroke="#000" stroke-width="${opts.thin?0.35:0.7}"/>`);
  if(opts.highlightPiece) out.push(svgPoly(opts.highlightPiece.map(pg),'fill="#c00" fill-opacity=".8" stroke="#000" stroke-width="0.3"'));
  marks();
  if(opts.thin) return out.join('');
  // Wandmasse und Eckbuchstaben - aussen am Raum, bei Inseln aussen an der
  // Insel (also im Raum; edgesOf zeigt dort ohnehin in den Raum).
  [[K.ring,ringP],...K.ring.holes.map((h,i)=>[h,holesP[i]])].forEach(([R,RP])=>{
  const nR=TL.edgesOf(RP);
  TL.edgesOf(R).forEach((e,i)=>{
    const a=pg(e.a), b=pg(e.b), n=nR[i].n;
    const m={x:(a.x+b.x)/2+n.x*3.2, y:(a.y+b.y)/2+n.y*3.2};
    let ang=Math.atan2(b.y-a.y,b.x-a.x)/TD2R; if(ang>90) ang-=180; if(ang<-90) ang+=180;
    out.push(svgText(m.x,m.y,fmtMm(Math.hypot(e.b.x-e.a.x,e.b.y-e.a.y)),
      `font-size="2.6" text-anchor="middle" dominant-baseline="middle" transform="rotate(${n2(ang)} ${n2(m.x)} ${n2(m.y)})"`));
  });
  R.forEach((pw,i)=>{
    const q=RP[i], n1=nR[(i+nR.length-1)%nR.length].n, n2_=nR[i].n;
    const n={x:n1.x+n2_.x, y:n1.y+n2_.y}, l=Math.hypot(n.x,n.y)||1;
    out.push(svgText(q.x+n.x/l*3.5, q.y+n.y/l*3.5, pw.id||'', 'font-size="3" font-weight="700" text-anchor="middle" dominant-baseline="middle"'));
  });
  });
  // Toleranzfugen an Waenden beschriften
  (T.wallJoints||[]).forEach(w=>{
    TL.ringsOf(K.ring).forEach(R=>R.forEach((pt,i)=>{ const nx=R[(i+1)%R.length];
      if(!((pt.id===w.a&&nx.id===w.b)||(pt.id===w.b&&nx.id===w.a))) return;
      const a=pg(pt), b=pg(nx), m={x:(a.x+b.x)/2, y:(a.y+b.y)/2};
      let ang=Math.atan2(b.y-a.y,b.x-a.x)/TD2R; if(ang>90) ang-=180; if(ang<-90) ang+=180;
      const e=TL.edgesOf(RP_of(R))[i];                // Aussennormale im Blatt
      out.push(svgText(m.x-e.n.x*3, m.y-e.n.y*3, `TF ${f1(w.width)} ±${f1(w.tol)}`,
        `font-size="2.3" fill="#0e7490" text-anchor="middle" dominant-baseline="middle" transform="rotate(${n2(ang)} ${n2(m.x-e.n.x*3)} ${n2(m.y-e.n.y*3)})"`));
    }));
  });
  // Dehnungsfugen: Lage der Enden ab der naechsten Ecke
  T.joints.forEach((j,k)=>{
    const a=pg(j.a), b=pg(j.b), m={x:(a.x+b.x)/2, y:(a.y+b.y)/2};
    const nm=d=>d ? `${d.corner.id||'?'}${d.dist?` + ${fmtMm(d.dist)}`:''}` : '?';
    out.push(svgText(m.x+1.5, m.y-1.5, `DF${k+1} · ${f1(j.width)} mm · ${nm(TL.endDim(K.ring,j.a))} → ${nm(TL.endDim(K.ring,j.b))}`,
      'font-size="2.3" stroke="#fff" stroke-width="0.6" paint-order="stroke"'));
  });
  // Schnittnummern - nicht im reinen Verlegemuster
  if(!opts.pattern) ev.cuts.forEach(c=>{
    const q=pg(c.c), r=c.no>99?2.3:c.no>9?1.9:1.6;
    // aus der anderen Sorte geschnitten (Farbe pruefen): doppelter Ring
    if(ev.markSwap && ev.markSwap.has(c.no)) out.push(`<circle cx="${n2(q.x)}" cy="${n2(q.y)}" r="${r+0.7}" fill="#fff" stroke="#000" stroke-width="0.35" stroke-dasharray="0.6 0.4"/>`);
    out.push(`<circle cx="${n2(q.x)}" cy="${n2(q.y)}" r="${r}" fill="#fff" stroke="#000" stroke-width="0.2"/>`);
    out.push(svgText(q.x,q.y+0.05,String(c.no),'font-size="2" font-weight="700" text-anchor="middle" dominant-baseline="middle"'));
  });
  // Startfliese
  const ref=refDims(K,T,ev);
  if(ref){
    out.push(svgPoly(TL.tileCorners(S,ref.it).map(pg),'fill="none" stroke="#000" stroke-width="0.6"'));
    const A=pg(ref.A);
    out.push(`<circle cx="${n2(A.x)}" cy="${n2(A.y)}" r="0.9" fill="#000"/>`);
    ref.dims.forEach(d=>{
      const f=pg(d.foot);
      out.push(svgLine(A,f,'stroke="#000" stroke-width="0.25" marker-end="url(#arr)" stroke-dasharray="1 0.6"'));
      out.push(svgText((A.x+f.x)/2+1, (A.y+f.y)/2-1, fmtMm(d.dist), 'font-size="2.6" font-weight="700" stroke="#fff" stroke-width="0.7" paint-order="stroke"'));
    });
    out.push(svgText(A.x+1.2, A.y+3.2, 'Start (Ecke A)', 'font-size="2.2" stroke="#fff" stroke-width="0.6" paint-order="stroke"'));
  }
  return out.join('');
}

// Schnittblatt je ROHFLIESE: alle Stuecke, die aus ihr geschnitten werden,
// in ihrer Lage darin (Recycling), alle Anrissmasse, und im Lageplan die
// Zielpositionen aller Stuecke mit Nummer. Spart Blaetter und Wege.
function stockSheet(K, T, ev, st, idx, total, head){
  const kind=st.kind, S={...T.spec,...TL.tileDef(T.spec,kind)}, sh=TL.tileShape(S,kind);
  const byNo=new Map(ev.cuts.map(c=>[c.no,c]));
  const cen=k=>{ const Q=TL.tileShape(S,k); return {x:Q.reduce((a,p)=>a+p.x,0)/Q.length, y:Q.reduce((a,p)=>a+p.y,0)/Q.length}; };
  // Stueck aus seinem Fliesenrahmen in die Rohfliese: ggf. 180° um die
  // Mitte der Herkunftsform, dann verschieben - wie beim Einpassen.
  const pieces=st.pieces.map(q=>{
    const c=byNo.get(q.no), C=cen(q.from||c.item.kind);
    const tf=p=>{ const r=q.rot180 ? {x:2*C.x-p.x, y:2*C.y-p.y} : p; return {x:r.x+q.dx, y:r.y+q.dy}; };
    const poly=c.tilePoly.map(tf), cut=c.tileCutouts.map(cu=>cu.map(tf));
    return {q, c, poly, cut, D:TL.pieceDims(S, kind, poly, cut)};
  });
  const xs=sh.map(p=>p.x), ys=sh.map(p=>p.y);
  const x0=Math.min(...xs), y0=Math.min(...ys), bw=Math.max(...xs)-x0, bh=Math.max(...ys)-y0;
  const notes=[];
  const sw=pieces.filter(P=>P.q.swapped);
  if(sw.length) notes.push({t:`Nr. ${sw.map(P=>P.q.no).join(', ')} wird aus dieser ${kind}-Fliese geschnitten, verlegt als ${sw[0].q.from}${ev.markSwap && sw.some(P=>ev.markSwap.has(P.q.no))?'. Farbe/Charge prüfen':''}.`, a:'font-weight="700" fill="#a40"'});
  if(pieces.length>1) notes.push({t:`Zwischen den Stücken mind. ${ev.nest.kerf} mm Schnittbreite lassen.`, a:''});
  const wrap=(t,n)=>{ const L=[]; let cur=''; t.split(' ').forEach(w=>{ if((cur+' '+w).trim().length>n){ L.push(cur); cur=w; } else cur=(cur+' '+w).trim(); }); if(cur) L.push(cur); return L; };
  const noteLines=notes.flatMap(nt=>wrap(nt.t,100).map(l=>({l, a:nt.a})));
  // Schnittplan vorab: die Masskette je Kante waechst nach aussen (oben
  // ueber A-B, unten unter C-D) - dafuer Platz lassen, sonst laeuft sie in
  // den Kopftext bzw. in die Legende.
  const plan=TL.cutPlan(S, kind, pieces.map(P=>({poly:P.poly})));
  const perE=[0,0,0,0];
  plan.marks.concat(...plan.notches.map(nt=>nt.lines)).forEach(ln=>(ln.ends||[]).forEach(m=>{ if(m.dist>=0.5) perE[m.edge]++; }));
  pieces.forEach(P=>P.D.marks.forEach(m=>{ if(m.cutout!=null) perE[m.edge]++; }));
  const dimH=k=>k ? 7+(k-1)*6+5 : 4;
  const dimTop=dimH(Math.max(perE[0],perE[1],perE[3])), dimBot=dimH(Math.max(perE[2],perE[1],perE[3]));
  const oy=Math.max(52, 38+noteLines.length*4.4+6)+dimTop;
  const sc=Math.min(160/bw, 70/bh), ox=25+(160-bw*sc)/2;
  // Der Fliesenrahmen ist nur gedreht, nicht gespiegelt: y laeuft wie im
  // Raum (und im Lageplan) nach unten. Nicht spiegeln - sonst zeigt das
  // Blatt eine L-Fliese als R-Fliese, und das Stueck passt nicht mehr.
  const tp=p=>({x:ox+(p.x-x0)*sc, y:oy+(p.y-y0)*sc});
  const out=[];
  out.push(svgText(15,18,`Rohfliese ${kind}${st.no}`,'font-size="9" font-weight="700"'));
  out.push(svgText(15,26,`Schnittstück${pieces.length>1?'e':''} Nr. ${pieces.map(P=>P.q.no).join(', ')} · ${escapeHtml(tileLabel(kind))} · ${fmtMm(S.w)} × ${fmtMm(S.l)} mm · Dicke ${f1(S.thick)} mm${S.shape==='chevron'?` · Winkel ${f1(S.angle)}°`:''} · Blatt ${idx} von ${total}`,'font-size="3.6"'));
  out.push(svgText(15,32,`${head} · Draufsicht auf die Sichtseite · Maße in mm ab der genannten Fliesenecke entlang der Kante`,'font-size="2.8" fill="#444"'));
  noteLines.forEach((n,i)=>out.push(svgText(15,38+i*4.4,n.l,`font-size="3" ${n.a}`)));
  out.push(`<defs><pattern id="ph" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="2" stroke="#000" stroke-width="0.3" stroke-opacity=".35"/></pattern>
    <marker id="tk" viewBox="-2 -2 4 4" markerWidth="4" markerHeight="4" orient="auto"><line x1="0" y1="-1.5" x2="0" y2="1.5" stroke="#c00" stroke-width="0.6"/></marker></defs>`);
  const shP=sh.map(tp);
  out.push(svgPoly(shP,'fill="url(#ph)" stroke="#000" stroke-width="0.3" stroke-dasharray="2 1"'));
  pieces.forEach(P=>{
    const pc=P.poly.map(tp);
    out.push(svgPoly(pc,'fill="#e8e8e8" stroke="#000" stroke-width="0.7"'));
    P.cut.forEach(cu=>out.push(svgPoly(cu.map(tp),'fill="#fff" stroke="#c00" stroke-width="0.5"')));
    const m={x:pc.reduce((a,p)=>a+p.x,0)/pc.length, y:pc.reduce((a,p)=>a+p.y,0)/pc.length};
    out.push(`<circle cx="${n2(m.x)}" cy="${n2(m.y)}" r="3.4" fill="#fff" stroke="#000" stroke-width="0.3"/>`);
    out.push(svgText(m.x,m.y+0.1,String(P.q.no),'font-size="3.4" font-weight="700" text-anchor="middle" dominant-baseline="middle"'));
  });
  const cx=shP.reduce((s2,p)=>s2+p.x,0)/shP.length, cy=shP.reduce((s2,p)=>s2+p.y,0)/shP.length;
  shP.forEach((p,i)=>{
    const d={x:p.x-cx, y:p.y-cy}, l=Math.hypot(d.x,d.y)||1;
    out.push(svgText(p.x+d.x/l*5, p.y+d.y/l*5, CORNER_NAMES[i], 'font-size="5" font-weight="700" text-anchor="middle" dominant-baseline="middle"'));
  });
  // Schnittplan: gerade Durchschnitte, jede Linie mit zwei Anrisspunkten auf
  // den Fliesenkanten. Ausklinkungen und Aussparungen eigens.
  const mkTxt=m=>m.dist<0.5 ? `Ecke ${CORNER_NAMES[m.corner]}` : `Kante ${CORNER_NAMES[m.edge]}–${CORNER_NAMES[(m.edge+1)%sh.length]} ${fmtMm(m.dist)} mm ab ${CORNER_NAMES[m.corner]}`;
  const lineTxt=ln=>ln.ends.map(mkTxt).join(' → ');
  const lineSvg=(ln,label,attrs)=>{
    const a=tp(ln.ends[0].p), b=tp(ln.ends[1].p);
    out.push(svgLine(a,b,attrs));
    const q={x:a.x+(b.x-a.x)*0.18, y:a.y+(b.y-a.y)*0.18};       // nicht an der Ecke: dort stehen A-D
    out.push(svgText(q.x,q.y,label,'font-size="2.6" font-weight="700" fill="#c00" text-anchor="middle" dominant-baseline="middle" stroke="#fff" stroke-width="0.6" paint-order="stroke"'));
  };
  plan.marks.forEach((ln,i)=>lineSvg(ln,`L${i+1}`,'stroke="#c00" stroke-width="0.2" stroke-dasharray="1.2 0.8"'));
  const notchLines=[];
  plan.notches.forEach(nt=>nt.lines.forEach(ln=>{ ln.no=notchLines.length+1; notchLines.push(ln);
    lineSvg(ln,`K${ln.no}`,'stroke="#06c" stroke-width="0.2" stroke-dasharray="0.6 0.8"');
    out.push(svgLine(tp(ln.seg[0]),tp(ln.seg[1]),'stroke="#06c" stroke-width="0.6"')); }));
  plan.notches.forEach(nt=>nt.inner.forEach(p=>{ const q=tp(p);
    out.push(`<circle cx="${n2(q.x)}" cy="${n2(q.y)}" r="1" fill="#06c"/>`); }));
  // Schnittreihenfolge an der Schnittstrecke
  plan.lines.forEach((ln,i)=>{ if(!ln.seg) return;
    const a=tp(ln.seg[0]), b=tp(ln.seg[1]), m={x:a.x+(b.x-a.x)*0.65, y:a.y+(b.y-a.y)*0.65};   // Mitte gehoert dem Laengenmass
    out.push(`<rect x="${n2(m.x-2)}" y="${n2(m.y-2)}" width="4" height="4" fill="#000"/>`);
    out.push(svgText(m.x,m.y+0.1,String(i+1),'font-size="2.8" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="middle"'));
  });
  // Anrisspunkte auf den Fliesenkanten (Linien, Ausklinkungen, Aussparungen)
  // - doppelte nur einmal; je Kante gestaffelt, kuerzeste innen.
  const marks=[];
  const addMark=m=>{ if(m.dist<0.5) return; if(!marks.some(o=>o.edge===m.edge && Math.abs(o.dist-m.dist)<0.5 && o.corner===m.corner)) marks.push(m); };
  plan.marks.forEach(ln=>ln.ends.forEach(addMark));
  notchLines.forEach(ln=>ln.ends.forEach(m=>addMark({...m, blue:true})));
  pieces.forEach(P=>P.D.marks.filter(m=>m.cutout!=null).forEach(addMark));
  const perEdge={};
  marks.slice().sort((a,b)=>a.dist-b.dist).forEach(m=>{ const k=m.edge; m.lvl=perEdge[k]=(perEdge[k]==null?0:perEdge[k]+1); });
  marks.forEach(m=>{
    const col=m.blue?'#06c':'#c00';
    const p=tp(m.p), a=tp(sh[m.corner]);
    const e={x:p.x-a.x, y:p.y-a.y}, el=Math.hypot(e.x,e.y)||1;
    const mid={x:(p.x+a.x)/2-cx, y:(p.y+a.y)/2-cy};
    let n={x:-e.y/el, y:e.x/el}; if(n.x*mid.x+n.y*mid.y<0) n={x:-n.x,y:-n.y};
    const o=7+m.lvl*6, A2={x:a.x+n.x*o, y:a.y+n.y*o}, P2={x:p.x+n.x*o, y:p.y+n.y*o};
    out.push(`<circle cx="${n2(p.x)}" cy="${n2(p.y)}" r="1" fill="${col}"/>`);
    out.push(svgLine(A2,P2,`stroke="${col}" stroke-width="0.3" marker-start="url(#tk)" marker-end="url(#tk)"`));
    out.push(svgLine(a,A2,`stroke="${col}" stroke-width="0.15"`));
    out.push(svgLine(p,P2,`stroke="${col}" stroke-width="0.15"`));
    const M2={x:(A2.x+P2.x)/2+n.x*2.8, y:(A2.y+P2.y)/2+n.y*2.8};
    out.push(svgText(M2.x,M2.y,fmtMm(m.dist),`font-size="3.4" font-weight="700" fill="${col}" text-anchor="middle" dominant-baseline="middle" stroke="#fff" stroke-width="0.8" paint-order="stroke"`));
  });
  pieces.forEach(P=>P.D.edges.filter(e=>e.cut).forEach(e=>{
    const a=tp(e.a), b=tp(e.b), m={x:(a.x+b.x)/2, y:(a.y+b.y)/2};
    if(Math.hypot(b.x-a.x,b.y-a.y)<25) return;               // kurze Kante: Mass steht unter Kontrolle
    const d={x:m.x-cx, y:m.y-cy}, l=Math.hypot(d.x,d.y)||1;
    out.push(svgText(m.x-d.x/l*4, m.y-d.y/l*4, `✂ ${fmtMm(e.len)}`,'font-size="2.6" text-anchor="middle" dominant-baseline="middle" fill="#333" stroke="#fff" stroke-width="0.6" paint-order="stroke"'));
  }));
  out.push(svgText(15,oy+bh*sc+dimBot+6,'Schraffiert = Verschnitt · grau = Stück · rot L = Anrisslinie · ■ = Schnittfolge · blau K = Ausklinkung','font-size="2.8" fill="#444"'));
  let y=oy+bh*sc+dimBot+14;
  const row=(t,a='font-size="3.2"')=>{ out.push(svgText(22,y,t,a)); y+=4.4; };
  const head2=t=>{ y+=1.5; out.push(svgText(15,y,t,'font-size="4" font-weight="700"')); y+=5.5; };
  if(!plan.ok) row(`Achtung: ${plan.err} Stücke einzeln aus eigenen Fliesen schneiden.`,'font-size="3.2" font-weight="700" fill="#c00"');
  head2('1. Anreißen – alle Linien auf der heilen Fliese');
  plan.marks.forEach((ln,i)=>row(`L${i+1}: ${lineTxt(ln)}`));
  notchLines.forEach(ln=>row(`K${ln.no}: ${lineTxt(ln)}`,'font-size="3.2" fill="#06c"'));
  pieces.forEach(P=>P.D.inner.forEach(m=>row(`Aussparung Nr. ${P.q.no}: ${fmtMm(m.along)} mm längs A–B ab Ecke A, ${fmtMm(m.off)} mm quer ab Kante A–B`)));
  head2('2. Schneiden – gerade, ganz durch das jeweilige Reststück');
  plan.lines.forEach((ln,i)=>{
    const w=ln.waste;
    const thin=w && w.w<10 ? ` – Streifen nur ${fmtMm(w.w)} mm: knabbern/schleifen statt brechen` : '';
    row(`${i+1}. entlang L${ln.mark+1}${w?' (Abschnitt ist Verschnitt)':' (trennt Stücke)'}${thin}`, thin?'font-size="3.2" fill="#a40"':'font-size="3.2"');
  });
  if(plan.notches.length){
    head2('3. Ausklinken – einschneiden bis zum Innenpunkt, nicht durchschneiden');
    plan.notches.forEach(nt=>{
      const P=pieces[nt.piece], ks=nt.lines.map(l=>'K'+l.no).join(' und ');
      const pt=nt.inner.map(p=>`(${fmtMm(p.x)} längs A–B ab A, ${fmtMm(p.y)} quer ab A–B)`).join(', ');
      row(`Nr. ${P.q.no}: entlang ${ks} bis Innenpunkt ${pt}`,'font-size="3.2" fill="#06c"');
    });
  }
  head2('Kontrolle');
  pieces.forEach(P=>{
    const rows=[];
    // Schnittkanten an einer Toleranzfuge: dort darf der Schnitt um das Spiel
    // abweichen - genau dafuer ist die Fuge da (schiefe Wand).
    (T.wallJoints||[]).forEach(w=>{
      if(!(w.tol>0)) return;
      TL.ringsOf(K.layCut).forEach(R=>R.forEach((pt,i)=>{ const nx=R[(i+1)%R.length];
        if(!((pt.id===w.a&&nx.id===w.b)||(pt.id===w.b&&nx.id===w.a))) return;
        const d={x:nx.x-pt.x,y:nx.y-pt.y}, L2=Math.hypot(d.x,d.y)||1;
        const onLine=q=>Math.abs(((q.x-pt.x)*d.y-(q.y-pt.y)*d.x)/L2)<0.5, cp=P.c.poly;
        for(let k=0;k<cp.length;k++){ const a=cp[k], b=cp[(k+1)%cp.length];
          if(onLine(a)&&onLine(b)&&Math.hypot(b.x-a.x,b.y-a.y)>1){ rows.push(`Schnitt an Toleranzfuge Wand ${w.a}–${w.b}: darf ±${f1(w.tol)} mm abweichen`); break; } }
      }));
    });
    const cutE=P.D.edges.filter(e=>e.cut);
    row(`Nr. ${P.q.no}: Kanten ${cutE.map(e=>fmtMm(e.len)).join(' / ')||'—'} mm · ${fmt2(P.D.area/1e4)} dm²${P.cut.length?` · ${P.cut.length} Aussparung(en)`:''}`,'font-size="3.2" font-weight="700"');
    rows.forEach(r=>row('• '+r));
  });
  y+=4;
  out.push(svgText(15,y,'Lage im Raum','font-size="4" font-weight="700"')); y+=4;
  const L=TL.printLayout(K.ring,[{w:180,h:Math.max(40,285-y),landscape:false}]);
  // Der Lageplan ist auf jedem Blatt derselbe: als Bild (einmal gerastert,
  // tilesPrint setzt es ein) statt ~600 Fliesen-Pfaden je Seite - sonst
  // haengt der Browser beim Drucken. Nur die Markierungen bleiben Vektor.
  const mx=15+(180-L.w*L.scale)/2, key=String(L.rot);
  if(ev.maps && !ev.maps.has(key)) ev.maps.set(key, L);
  out.push(`<image href="@@MAP:${key}@@" x="${n2(mx)}" y="${n2(y)}" width="${n2(L.w*L.scale)}" height="${n2(L.h*L.scale)}" preserveAspectRatio="none"/>`);
  out.push(overviewSvg(K,T,ev,L,mx,y,{highlightOnly:true,highlightPieces:pieces.map(P=>({poly:P.c.poly, no:P.q.no}))}));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297" width="210mm" height="297mm">${out.join('')}</svg>`;
}

// Lageplan der Schnittblaetter einmal als PNG rastern (~200 dpi).
async function rasterMap(K, T, ev, L){
  const W=L.w*L.scale, H=L.h*L.scale, px=8;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n2(W)} ${n2(H)}" width="${Math.round(W*px)}" height="${Math.round(H*px)}">${overviewSvg(K,T,ev,L,0,0,{thin:true,id:'r'})}</svg>`;
  const img=new Image(), url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
  img.src=url;
  try{ await img.decode(); } finally { URL.revokeObjectURL(url); }
  const c=document.createElement('canvas'); c.width=Math.round(W*px); c.height=Math.round(H*px);
  const g=c.getContext('2d'); g.drawImage(img,0,0,c.width,c.height);
  // Blob-URL statt data:-URL: das Bild steht dann nur EINMAL im Speicher,
  // nicht in jeder der ~150 Seiten. Das Druckfenster hat denselben Ursprung.
  const blob=await new Promise(r=>c.toBlob(r,'image/png'));
  return URL.createObjectURL(blob);
}
async function tilesPrint(){
  // Fenster sofort (im Klick) oeffnen, sonst blockt der Pop-up-Schutz
  const w=window.open('', '_blank');
  if(!w){ setHint('Druckfenster wurde blockiert. Pop-ups für diese Seite erlauben.'); return; }
  w.document.write('<p style="font:16px system-ui;padding:24px">Fliesenplan wird erstellt …</p>');
  const html=await tilesPrintDoc();
  if(!html){ w.close(); return; }
  w.document.open(); w.document.write(html); w.document.close();
}
// Druckdokument mit eingesetzten Lageplan-Bildern
async function tilesPrintDoc(){
  let html=tilesPrintHtml(); if(!html) return null;
  const P=TS.printMaps;
  for(const [key, L] of P.maps){
    const png=await rasterMap(P.K, P.T, P.ev, L);
    html=html.split(`@@MAP:${key}@@`).join(png);
  }
  return html;
}
function tilesPrintHtml(){
  const K=tilesCtx(); if(!K){ setHint('Erst den Grundriss schließen und einmessen.'); return null; }
  const T=tilesData();
  if(!T.items.length){ setHint('Noch keine Fliesen gelegt.'); return null; }
  TS.cacheKey='';
  const ev=tilesEval(K), s=ev.stats, S=T.spec;
  // Tausch L<->R: farbgleich -> jedes Stueck, das ungespiegelt in die andere
  // Form passt; sonst nur Randstuecke an der Wand (Farbe faellt dort am
  // wenigsten auf) - und die werden markiert.
  // an der Wand: auf der Schnittkante ODER der Verlegekante (aeltere
  // Zuschnitte enden dort)
  const onWall=c=>c.poly.some(p=>TL.ringsOf(K.layCut).concat(TL.ringsOf(K.lay)).some(R=>R.some((a,i)=>{ const b=R[(i+1)%R.length];
    const d={x:b.x-a.x,y:b.y-a.y}, L2=d.x*d.x+d.y*d.y||1, t=Math.max(0,Math.min(1,((p.x-a.x)*d.x+(p.y-a.y)*d.y)/L2));
    return Math.hypot(p.x-a.x-d.x*t, p.y-a.y-d.y*t)<1; })));
  ev.cuts.forEach(c=>{ c.maySwap = !!S.sameColor || onWall(c); });
  ev.nest=TL.nestCuts(S, ev.cuts, 30, 1500, {base:Object.fromEntries(S.set.flatMap(TL.tileKinds).map(k=>[k,s[k]?.whole||0]))});
  const swappedNos=new Set(ev.nest.stocks.flatMap(st=>st.pieces.filter(q=>q.swapped).map(q=>q.no)));
  ev.markSwap = S.sameColor ? new Set() : swappedNos;
  TS.nestSnap={key:TS.cacheKey, nest:ev.nest, nums:new Map(ev.cuts.map(c=>[cutKey(c), c.no])), swap:new Set(ev.cuts.filter(c=>ev.markSwap.has(c.no)).map(cutKey))};
  render(); renderTilesPanel();
  // A4 hoch 210x297 / quer 297x210: 10 mm Rand, 40 mm Fusszeile.
  const L=TL.printLayout(K.ring,[{w:190,h:237,landscape:false},{w:277,h:150,landscape:true}]);
  const land=L.box.landscape, PW=land?297:210, PH=land?210:297;
  const ox=10+(L.box.w-L.w*L.scale)/2, oy=10+(L.box.h-L.h*L.scale)/2;
  const head=`${currentRoomName} · ${new Date().toLocaleDateString('de-DE')}`;
  const bar=1000*L.scale, fy=PH-38;
  const frame=`<rect x="10" y="${fy}" width="${PW-20}" height="30" fill="none" stroke="#000" stroke-width="0.2"/>`;
  const specLine=svgText(13,fy+12,`Fliesenset: ${S.set.length} Varianten · Fuge ${f1(S.joint)} mm · Randfuge ${f1(S.edgeGap)} mm · Maßstab ≈ 1:${f1(1/L.scale)}`,'font-size="2.8"');
  // Legende rechts in Zeile 1, Massstabsbalken rechts in Zeile 2 - die
  // Zeilen 3 und 4 laufen ueber die volle Breite.
  const swatchLR=[
    `<rect x="${PW-62}" y="${fy+3}" width="4" height="3" fill="#ececec" stroke="#333" stroke-width="0.15"/>`, svgText(PW-57,fy+5.6,'Fliese','font-size="2.6"'),
    `<rect x="${PW-52}" y="${fy+3}" width="4" height="3" fill="#c8c8c8" stroke="#333" stroke-width="0.15"/>`, svgText(PW-47,fy+5.6,'','font-size="2.6"'),
  ];
  const scaleBar=[
    svgLine({x:PW-62,y:fy+10},{x:PW-62+bar,y:fy+10},'stroke="#000" stroke-width="0.8"'),
    svgText(PW-62,fy+13.5,'0','font-size="2.4"'), svgText(PW-62+bar,fy+13.5,'1 m','font-size="2.4" text-anchor="end"'),
  ];
  const legend=[
    frame, svgText(13,fy+6,`Fliesenplan · ${head}`,'font-size="4" font-weight="700"'), specLine,
    svgText(13,fy+17.5,`Fliesen ${s.placed} · ganz ${S.set.flatMap(TL.tileKinds).reduce((a,k)=>a+(s[k]?.whole||0),0)} · geschnitten ${S.set.flatMap(TL.tileKinds).reduce((a,k)=>a+(s[k]?.cut||0),0)} → ${s.pieces} nummerierte Schnittstücke · Verschnitt ${fmt2(s.waste*100)} %`,'font-size="2.8"'),
    svgText(13,fy+23,`Belegt ${fmt2(s.covered/1e6)} m² · Dehnungsfugen ${T.joints.length} · Maße in mm · Ecke A der Startfliese (fett) ist zu den Wänden bemaßt`,'font-size="2.8"'),
    ...swatchLR,
    `<rect x="${PW-42}" y="${fy+3}" width="4" height="3" fill="url(#hato)" stroke="#333" stroke-width="0.15"/>`, svgText(PW-37,fy+5.6,'Schnitt','font-size="2.6"'),
    ...scaleBar,
  ].join('');
  const patternLegend=[
    frame, svgText(13,fy+6,`Verlegemuster · ${head}`,'font-size="4" font-weight="700"'), specLine,
    svgText(13,fy+17.5,`Fliesen ${s.placed} · Dehnungsfugen ${T.joints.length} · Maße in mm · Ecke A der Startfliese (fett) ist zu den Wänden bemaßt`,'font-size="2.8"'),
    ...swatchLR, ...scaleBar,
  ].join('');
  const page=body=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PW} ${PH}" width="${PW}mm" height="${PH}mm">${body}</svg>`;
  const overview=page(`<defs><marker id="arr" viewBox="0 -2 4 4" refX="4" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 -1.5 L4 0 L0 1.5z" fill="#000"/></marker></defs>
    ${overviewSvg(K,T,ev,L,ox,oy)}${legend}`);
  // Seite 2: dasselbe Blatt als reines Verlegemuster - ohne Schnittnummern
  // und Schraffur, damit das Muster selbst lesbar bleibt
  const pattern=page(overviewSvg(K,T,ev,L,ox,oy,{id:'m', pattern:true})+patternLegend);
  // je Rohfliese ein Blatt, sortiert nach kleinster Stueck-Nummer (Laufweg)
  const stocks=ev.nest.stocks.slice().sort((a,b)=>Math.min(...a.pieces.map(q=>q.no))-Math.min(...b.pieces.map(q=>q.no)));
  stocks.forEach((st,i)=>{ st.no=i+1; });                   // Rohfliesen-Nr. = Blatt-Nr.
  ev.maps=new Map();                                        // Lageplan-Bilder je Drehung
  const sheets=stocks.map((st,i)=>`<section class="sheet p">${stockSheet(K,T,ev,st,i+1,stocks.length,head)}</section>`).join('');
  const html=`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Fliesenplan ${escapeHtml(currentRoomName)}</title>
<style>
  @page p{size:A4 portrait;margin:0} @page l{size:A4 landscape;margin:0}
  html,body{margin:0;background:#888;font-family:system-ui,sans-serif}
  .sheet{background:#fff;margin:8mm auto;box-shadow:0 2px 8px rgba(0,0,0,.3);break-after:page;overflow:hidden}
  .sheet:last-child{break-after:auto}
  .sheet.p{page:p;width:210mm;height:297mm} .sheet.l{page:l;width:297mm;height:210mm}
  .sheet svg{display:block;font-family:system-ui,sans-serif}
  .bar{position:sticky;top:0;background:#222;color:#fff;padding:8px 12px;display:flex;gap:12px;align-items:center;z-index:2}
  .bar button{font:inherit;padding:6px 12px}
  @media print{ html,body{background:#fff} .sheet{margin:0;box-shadow:none} .bar{display:none} }
</style></head><body>
<div class="bar"><b>Fliesenplan</b><span>Übersicht + Verlegemuster + ${ev.nest.stocks.length} Schnittblätter (je Rohfliese, ${ev.cuts.length} Schnittstücke) · Drucken → „Als PDF sichern“ · Skalierung 100 %</span><button onclick="print()">Drucken</button></div>
<section class="sheet ${land?'l':'p'}">${overview}</section><section class="sheet ${land?'l':'p'}">${pattern}</section>${sheets}
</body></html>`;
  TS.printMaps={maps:ev.maps, K, T, ev};
  return html;
}
// ---------- Fliese einmessen ----------
// Dialog am Fliesenset: Strecken der aktiven Variante eintragen, Werte mit ±
// ansehen, uebernehmen. Rechnung in TILEMEAS; die Eingaben bleiben je
// Variante im Browser liegen (Komfort, nicht Teil des Raums).
const TM=globalThis.TILEMEAS;
const MEAS_STORE='raumaufmass-einmessen';
let measDef=null, measResult=null;
const mnum=(x,n)=>(x<0?'−':'')+Math.abs(x).toFixed(n).replace('.',',');
const msgn=(x,n)=>(Math.abs(x)<0.5*10**-n ? '±' : x>0 ? '+' : '−')+Math.abs(x).toFixed(n).replace('.',',');
const measLabel=(def,f)=>f==='angle' ? 'Winkel' : def.shape==='chevron' ? (f==='l'?'Länge':'Breite') : (f==='l' ? (def.shape==='hexagon' ? 'Breite über die Spitzen' : def.shape==='triangle' ? 'Seite' : 'Breite') : 'Höhe');
function measLoad(){ try{ return JSON.parse(localStorage.getItem(MEAS_STORE)||'{}')||{}; }catch(e){ return {}; } }
function measSave(){
  if(!measDef) return;
  try{ const all=measLoad(); all[measDef.id]={fields:measFields(), sigma:$('mSigma').value}; localStorage.setItem(MEAS_STORE, JSON.stringify(all)); }catch(e){}
}
const measFields=()=>Object.fromEntries([...document.querySelectorAll('#mFields input')].map(i=>[i.dataset.k, i.value]));
const measSigma=()=>Number($('mSigma').value.trim().replace(',','.'));

// Skizze aus den Ecken der Variante. Lange, flache Fliesen werden fuer die
// Skizze gestreckt - sonst lagen Diagonalen und Kanten aufeinander.
function measSketch(def){
  const sh=TM.shapeOf(def.shape), P0=sh.corners(sh.fromDef(def));
  const xs=sh.pts.map(id=>P0[id].x), ys=sh.pts.map(id=>P0[id].y);
  const x0=Math.min(...xs), y0=Math.min(...ys), w=Math.max(...xs)-x0||1, h0=Math.max(...ys)-y0||1;
  const W=360, H=Math.max(120, Math.min(230, W*h0/w)), pad=28;
  const sx=(W-2*pad)/w, sy=(H-2*pad)/h0;
  const P={}; sh.pts.forEach(id=>P[id]={x:pad+(P0[id].x-x0)*sx, y:pad+(P0[id].y-y0)*sy});
  const cx=sh.pts.reduce((s,id)=>s+P[id].x,0)/sh.pts.length, cy=sh.pts.reduce((s,id)=>s+P[id].y,0)/sh.pts.length;
  const ring=sh.pts.map(id=>`${P[id].x.toFixed(1)},${P[id].y.toFixed(1)}`).join(' ');
  const edge=new Set(sh.pts.map((id,i)=>[id,sh.pts[(i+1)%sh.pts.length]].sort().join('')));
  let g='', di=0;
  sh.keys.forEach(([k,a,b])=>{
    const isEdge=edge.has([a,b].sort().join(''));
    // Kanten: Mitte, nach aussen versetzt. Diagonalen: je eigene Stelle
    // entlang der Linie, sonst stapeln sich alle Kuerzel in der Mitte.
    const t=isEdge ? 0.5 : [0.27,0.73,0.38,0.62,0.2,0.8][di++%6];
    let lx=P[a].x+(P[b].x-P[a].x)*t, ly=P[a].y+(P[b].y-P[a].y)*t;
    if(isEdge){ const dx=lx-cx, dy=ly-cy, L=Math.hypot(dx,dy)||1; lx+=dx/L*13; ly+=dy/L*13; }
    const ln=`x1="${P[a].x.toFixed(1)}" y1="${P[a].y.toFixed(1)}" x2="${P[b].x.toFixed(1)}" y2="${P[b].y.toFixed(1)}"`;
    g+=`<g data-k="${k}"><line class="${isEdge?'ms-edge':'ms-diag'}" ${ln}/><line class="ms-hit" ${ln}/>`
      +`<text class="ms-key" x="${lx.toFixed(1)}" y="${(ly+4).toFixed(1)}" text-anchor="middle">${k}</text></g>`;
  });
  // W: rechtwinklig von der Geraden zum Gegenpunkt bzw. zur Gegenkante.
  { const [a,b]=sh.W.line, c=P[sh.W.pt], A=P[a], B=P[b];
    const ux=B.x-A.x, uy=B.y-A.y, L=Math.hypot(ux,uy), ex=ux/L, ey=uy/L, nx=-ey, ny=ex;
    const d=(c.x-A.x)*nx+(c.y-A.y)*ny, s=Math.sign(d)||1;
    const t=sh.ends ? 0.62*L : def.shape==='hexagon' ? 0.82*L : (c.x-A.x)*ex+(c.y-A.y)*ey;
    const fx=A.x+ex*t, fy=A.y+ey*t, tx=fx+nx*d, ty=fy+ny*d;
    const ln=`x1="${fx.toFixed(1)}" y1="${fy.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}"`;
    g+=`<g data-k="W"><line class="ms-w" ${ln}/><line class="ms-hit" ${ln}/>`
      +`<path class="ms-ang" d="M ${(fx+ex*7).toFixed(1)} ${(fy+ey*7).toFixed(1)} l ${(nx*7*s).toFixed(1)} ${(ny*7*s).toFixed(1)} l ${(-ex*7).toFixed(1)} ${(-ey*7).toFixed(1)}"/>`
      +`<text class="ms-key" x="${((fx+tx)/2+7).toFixed(1)}" y="${((fy+ty)/2+4).toFixed(1)}">W</text></g>`; }
  const labels=sh.pts.map(id=>{ const dx=P[id].x-cx, dy=P[id].y-cy, L=Math.hypot(dx,dy)||1;
    return `<text class="ms-pt" x="${(P[id].x+dx/L*14).toFixed(1)}" y="${(P[id].y+dy/L*14+5).toFixed(1)}" text-anchor="middle">${id}</text>`; }).join('');
  const acute=(sh.acute||[]).map(id=>`<circle class="ms-acute" cx="${P[id].x.toFixed(1)}" cy="${P[id].y.toFixed(1)}" r="4"><title>spitze Ecke</title></circle>`).join('');
  return `<svg viewBox="0 0 ${W} ${H.toFixed(0)}" role="img" aria-label="Skizze der Fliese mit den Ecken ${sh.pts.join(', ')}"><polygon class="ms-tile" points="${ring}"/>${g}${acute}${labels}</svg>`;
}

function measHighlight(k){
  document.querySelectorAll('#mSketch g[data-k]').forEach(g=>g.classList.toggle('on', g.dataset.k===k));
  document.querySelectorAll('#mFields .mrow').forEach(r=>r.classList.toggle('on', r.dataset.k===k));
}

function openMeasure(){
  const def=activeTileDef(); if(!def) return;
  measDef=def;
  const sh=TM.shapeOf(def.shape), saved=measLoad()[def.id]||{};
  $('mTitle').textContent=`${def.name||TILE_LABELS[def.shape]} einmessen`;
  $('mSketch').innerHTML=measSketch(def);
  const rows=sh.keys.map(([k,,,name])=>[k,name]).concat([['W',sh.W.name]]);
  $('mFields').innerHTML=rows.map(([k,name])=>`<label class="mrow" data-k="${k}"><b>${k}</b><span>${escapeHtml(name)}</span>`
    +`<input data-k="${k}" inputmode="decimal" autocomplete="off" placeholder="mm" value="${escapeHtml(saved.fields?.[k]||'')}"></label>`).join('');
  $('mSigma').value=saved.sigma||'0,5';
  $('mNote').textContent=def.shape==='chevron'
    ? 'Spitze Ecken (Punkt) sind A und C. Links- und Rechtsfliese messen sich gleich, das Spiegelbild hat dieselben Strecken.'
    : def.shape==='hexagon' || def.shape==='triangle'
      ? 'Alle Seiten gleich lang: Schon eine Strecke bestimmt die Fliese. Jede weitere prüft, wie regelmäßig sie wirklich ist.'
      : 'Mit beiden Diagonalen zeigt die echte Form, wie rechtwinklig die Fliese ist.';
  $('mFields').querySelectorAll('input').forEach(i=>{
    i.addEventListener('input', measUpdate);
    i.addEventListener('focus', ()=>measHighlight(i.dataset.k));
    i.addEventListener('blur', ()=>measHighlight(null));
  });
  $('mSketch').querySelectorAll('g[data-k]').forEach(g=>{
    g.addEventListener('mouseenter', ()=>measHighlight(g.dataset.k));
    g.addEventListener('mouseleave', ()=>measHighlight(document.activeElement?.dataset?.k ?? null));
    g.addEventListener('click', ()=>$('mFields').querySelector(`input[data-k="${g.dataset.k}"]`).focus());
  });
  measUpdate();
  $('measDlg').showModal();
  $('mFields').querySelector('input').focus();
}

function measUpdate(){
  const def=measDef; if(!def) return;
  const r=TM.measure(def, measFields(), measSigma()); measResult=r;
  $('mFields').querySelectorAll('input').forEach(i=>i.classList.toggle('bad', !!r.bad?.includes(i.dataset.k)));
  $('mSigma').classList.toggle('bad', !(measSigma()>0));
  const sig=String(measSigma()).replace('.',','), ok=!!r.model;
  $('mApply').disabled=!ok;
  // Werte fuers Fliesenset: neu, ±, bisher.
  if(r.error) $('mVals').innerHTML=`<p class="mmsg bad">${escapeHtml(r.error)}</p>`;
  else if(!r.obs.length) $('mVals').innerHTML=`<p class="mmsg">Strecken mit Maßband oder Zollstock messen und links eintragen. Jede Strecke darf mehrfach hinein, getrennt durch Leerzeichen.</p>`;
  else if(r.missing) $('mVals').innerHTML=`<p class="mmsg">Noch nicht bestimmt. Es fehlt eine dieser Strecken: <b>${r.missing.join(', ')}</b>.</p>`;
  else {
    const m=r.model;
    $('mVals').innerHTML=`<div class="mvals">${Object.keys(m.def).map(k=>{ const n=k==='angle'?2:1, u=k==='angle'?'°':' mm', d=m.def[k]-def[k];
      return `<div><span>${measLabel(def,k)}</span><b>${mnum(m.def[k],n)}${u}</b>`
        +`<small>${m.sd[k]!=null?'± '+mnum(m.sd[k],n===1?1:2)+u:'&nbsp;'}</small>`
        +`<small class="was">bisher ${mnum(def[k],n)}${u}${Math.abs(d)>=0.5*10**-n?` (${msgn(d,n)})`:''}</small></div>`; }).join('')}</div>
      <p class="mmsg">± bei ${sig} mm je Strecke · ${m.redundancy>0?`${m.redundancy} Strecke${m.redundancy>1?'n':''} mehr als nötig`:'keine Strecke zu viel, also keine Kontrolle'}.${def.shape==='hexagon'||def.shape==='triangle'?' Die Höhe folgt aus der Seite.':''}</p>`;
  }
  const q=r.real;
  if(!ok) $('mReal').innerHTML='';
  else if(q.dof>0) $('mReal').innerHTML=`<h4>Echte Form</h4><p class="mmsg">Für die echte Form ${q.dof===1?'fehlt noch eine Strecke':`fehlen noch ${q.dof} Strecken`} zwischen den Ecken.</p>`;
  else {
    let v;
    if(q.redundancy===0) v=`<p class="mmsg warn">Keine Kontrolle: Jede Strecke wird gebraucht, ein Messfehler bliebe unsichtbar.</p>`;
    else if(q.maxW==null) v=`<p class="mmsg warn">Die zusätzlichen Strecken prüfen keine der übrigen.</p>`;
    else if(q.maxW<=TM.BAARDA_W0) v=`<p class="mmsg good">Strecken passen zusammen${q.sigmaHat!=null?` (Streuung ${mnum(q.sigmaHat,2)} mm)`:''}.</p>`;
    else v=`<p class="mmsg bad">Widerspruch: Die Strecken passen nicht zu einer Form${q.sigmaHat!=null?` (Streuung ${mnum(q.sigmaHat,2)} mm statt ± ${sig} mm)`:''}. ${q.redundancy===1?'Welche falsch ist, zeigt erst eine Wiederholung.':'Rot markierte Strecke nachmessen.'}</p>`;
    const sh=TM.shapeOf(def.shape);
    $('mReal').innerHTML=`<h4>Echte Form</h4>${v}<dl class="mfacts">
      <dt>Eckwinkel</dt><dd>${sh.pts.map(id=>`${id} ${mnum(q.ang[id],2)}°`).join(' · ')}</dd>
      ${q.widthD!=null?`<dt>${def.shape==='chevron'?'Breite':'Höhe'} an den Enden</dt><dd>bei D ${mnum(q.widthD,1)} · bei C ${mnum(q.widthC,1)} mm</dd>`:''}</dl>`;
  }
  if(!r.obs.length || r.error) $('mTable').innerHTML='';
  else {
    const s=measSigma();
    const rows=TM.keysOf(TM.shapeOf(def.shape)).map(k=>{
      const idx=r.obs.map((o,i)=>o.key===k?i:-1).filter(i=>i>=0); if(!idx.length) return '';
      const mean=idx.reduce((a,i)=>a+r.obs[i].d,0)/idx.length;
      let real='–', mod='–';
      if(q && q.dof===0 && k!=='W'){
        // Rot nur, wenn der Test eine Messung dieser Strecke verwirft - mit
        // nur einer Kontrolle schlaegt er ueberall gleich aus.
        const flag=q.redundancy>1 && idx.some(i=>q.w[i]!=null && q.w[i]>TM.BAARDA_W0);
        real=`<span class="${flag?'bad':''}">${msgn(q.lens[k]-mean,2)}</span>`;
      }
      if(ok){ const d=r.model.model[k]-mean; mod=`<span class="${Math.abs(d)>2*s?'warn':''}">${msgn(d,2)}</span>`; }
      return `<tr><td>${k}</td><td>${mnum(mean,1)}${idx.length>1?` <small>${idx.length}×</small>`:''}</td><td>${real}</td><td>${mod}</td></tr>`;
    }).join('');
    $('mTable').innerHTML=`<table><thead><tr><th>Strecke</th><th>gemessen</th><th title="Abweichung der frei ausgeglichenen Form: Messfehler">echte Form</th><th title="Abweichung vom Formmodell der App: Messfehler plus Formabweichung der Fliese">Modell</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  measSave();
}

$('tMeasure').onclick=openMeasure;
$('mSigma').addEventListener('input', measUpdate);
$('mClear').onclick=()=>{ $('mFields').querySelectorAll('input').forEach(i=>i.value=''); measUpdate(); $('mFields').querySelector('input').focus(); };
$('mCancel').onclick=()=>$('measDlg').close();
$('measDlg').addEventListener('keydown',e=>e.stopPropagation());   // App-Kuerzel ruhen, solange der Dialog offen ist
$('measDlg').addEventListener('close',()=>{ measDef=null; measResult=null; });
$('mApply').onclick=()=>{
  const def=measDef, r=measResult; if(!def || !r?.model) return;
  const T=tilesData(); snapshot();
  Object.entries(r.model.def).forEach(([k,v])=>{
    const x=k==='angle' ? Math.round(v*100)/100 : Math.round(v*10)/10;
    def[k]=x; if(def.id==='legacy') T.spec[k]=x;
  });
  if(def.shape==='hexagon'||def.shape==='triangle') Object.assign(def, TL.regularTileDef(def));
  $('measDlg').close(); tilesSave();
  setHint(`${def.name||TILE_LABELS[def.shape]}: eingemessene Maße übernommen.`);
};

// ---------- Lineal ----------
// Ein Lineal im Raumrahmen (mm): Messkante a->b, Koerper im Bild daneben,
// halbdurchsichtig. Am Koerper ziehen verschiebt, an einem Ende ziehen
// streckt und dreht um das andere Ende (mit Umschalt: nur drehen). Rastet
// auf Ecken von Fliesen und Waenden, auf Kanten (parallel, auf der Linie)
// und auf rechte Winkel zu ihnen; mit ⌘/Strg frei. Die Lage gilt je Raum
// und bleibt im Browser - sie gehoert nicht zum Raum und nicht zum Rueckgaengig.
const RULER_STORE='raumaufmass-lineal', RULER_PX=34;
TS.ruler={on:false, a:null, b:null, snap:null, room:undefined};
function rulerSave(){
  try{ const all=JSON.parse(localStorage.getItem(RULER_STORE)||'{}')||{};
       if(currentRoom && TS.ruler.a) all[currentRoom]={a:TS.ruler.a, b:TS.ruler.b};
       localStorage.setItem(RULER_STORE, JSON.stringify(all)); }catch(e){}
}
function rulerLoad(){
  let all={}; try{ all=JSON.parse(localStorage.getItem(RULER_STORE)||'{}')||{}; }catch(e){}
  const r=currentRoom && all[currentRoom];
  TS.ruler.a=r?.a||null; TS.ruler.b=r?.b||null; TS.ruler.room=currentRoom;
}
// Neu ins Bild: 1 m (hoechstens 60 % der Bildbreite), waagerecht in der Bildmitte.
function rulerPlace(K){
  const cx=cv.width/2, cy=cv.height/2, c=TL.toLocal(K.F,toWorld(cx,cy)), q=TL.toLocal(K.F,toWorld(cx+1,cy));
  const d={x:q.x-c.x, y:q.y-c.y}, L=Math.hypot(d.x,d.y)||1, u={x:d.x/L, y:d.y/L};
  const len=Math.min(1000, 0.6*cv.width/VIEW.s);
  TS.ruler.a={x:c.x-u.x*len/2, y:c.y-u.y*len/2}; TS.ruler.b={x:c.x+u.x*len/2, y:c.y+u.y*len/2};
}
function rulerToggle(on=!TS.ruler.on){
  const K=tilesCtx(); if(!K) return;
  if(TS.ruler.room!==currentRoom) rulerLoad();
  TS.ruler.on=on;
  if(on && !TS.ruler.a) rulerPlace(K);
  $('tRuler').setAttribute('aria-pressed', String(on));
  rulerSave(); render();
  setHint(on ? 'Lineal: Körper ziehen verschiebt, Enden ziehen strecken und drehen (⇧: nur drehen). Rastet an Fliesen, Wänden, rechten Winkeln; ⌘/Strg frei.' : 'Lineal aus.');
}
// Bildgeometrie: Enden, Richtung, Normale zur Koerperseite.
function rulerScr(K){
  const R=TS.ruler, a=tScr(K,R.a), b=tScr(K,R.b), L=Math.hypot(b.x-a.x,b.y-a.y)||1;
  const u={x:(b.x-a.x)/L, y:(b.y-a.y)/L}, n={x:u.y, y:-u.x}, W=RULER_PX*DPR();
  return {a, b, u, n, L, W, poly:[a, b, {x:b.x+n.x*W, y:b.y+n.y*W}, {x:a.x+n.x*W, y:a.y+n.y*W}]};
}
function rulerHit(K, d){
  if(!TS.ruler.on || !TS.ruler.a || TS.ruler.room!==currentRoom) return null;
  const s=rulerScr(K), tol=12*DPR();
  if(Math.hypot(d.x-s.a.x, d.y-s.a.y)<=tol) return 'a';
  if(Math.hypot(d.x-s.b.x, d.y-s.b.y)<=tol) return 'b';
  const t=(d.x-s.a.x)*s.u.x+(d.y-s.a.y)*s.u.y, h=(d.x-s.a.x)*s.n.x+(d.y-s.a.y)*s.n.y;
  return t>=0 && t<=s.L && h>=-4*DPR() && h<=s.W ? 'body' : null;
}
// Was das Lineal fangen kann: Ecken und Kanten von Waenden und Fliesen.
function rulerTargets(K){
  const S=tilesData().spec, pts=[], edges=[];
  const add=R=>R.forEach((p,i)=>{ const q=R[(i+1)%R.length]; pts.push(p); edges.push({a:p, b:q}); });
  TL.ringsOf(K.ring).forEach(add);
  tilesData().items.forEach(it=>add(TL.tileCorners(S,it)));
  return {pts, edges};
}
const RUL_ANG=2*TD2R;
// Richtung von O nach P auf eine Kante oder rechtwinklig dazu ziehen.
function rulerSnapDir(edges, O, P){
  const L=Math.hypot(P.x-O.x, P.y-O.y); if(L<1e-6) return null;
  const ang=Math.atan2(P.y-O.y, P.x-O.x);
  let best=null, bdA=RUL_ANG;
  edges.forEach(e=>{ const ea=Math.atan2(e.b.y-e.a.y, e.b.x-e.a.x);
    for(let k=0;k<4;k++){ const c=ea+k*Math.PI/2, dA=Math.abs(Math.atan2(Math.sin(ang-c), Math.cos(ang-c)));
      if(dA<bdA){ bdA=dA; best={dir:c, line:e, how:k%2?'rechtwinklig':'parallel'}; } } });
  return best;
}
// Ende P an fester Ecke O: Ecke > Richtung (parallel/rechtwinklig) > Ende auf einer Kante.
function rulerSnapEnd(g, O, P, tol){
  let best=null, bd=tol;
  g.tg.pts.forEach(q=>{ const dd=Math.hypot(q.x-P.x, q.y-P.y); if(dd<bd){ bd=dd; best=q; } });
  if(best) return {p:{x:best.x, y:best.y}, how:'Ecke', pt:best};
  const L=Math.hypot(P.x-O.x, P.y-O.y); if(L<1e-6) return {p:P};
  const sd=rulerSnapDir(g.tg.edges, O, P);
  let p=P;
  if(sd) p={x:O.x+Math.cos(sd.dir)*L, y:O.y+Math.sin(sd.dir)*L};
  // Auf einer Kante enden: Laenge bis zum Schnitt mit ihr.
  const ux=(p.x-O.x)/L, uy=(p.y-O.y)/L; let bt=tol, hit=null;
  g.tg.edges.forEach(e=>{ const ex=e.b.x-e.a.x, ey=e.b.y-e.a.y, den=ux*ey-uy*ex; if(Math.abs(den)<1e-9) return;
    const t=((e.a.x-O.x)*ey-(e.a.y-O.y)*ex)/den, s=((e.a.x-O.x)*uy-(e.a.y-O.y)*ux)/den;
    if(s<-1e-9||s>1+1e-9) return; if(Math.abs(t-L)<bt){ bt=Math.abs(t-L); hit={t,e}; } });
  if(hit) return {p:{x:O.x+ux*hit.t, y:O.y+uy*hit.t}, how:sd?sd.how+' · bis Kante':'bis Kante', line:hit.e};
  return {p, how:sd?.how, line:sd?.line};
}
// Ganzes Lineal: mit einem Ende auf eine Ecke, sonst an eine fast parallele Kante anlegen.
function rulerSnapBody(g, a, b, tol){
  for(const P of [a,b]){
    let best=null, bd=tol;
    g.tg.pts.forEach(q=>{ const dd=Math.hypot(q.x-P.x, q.y-P.y); if(dd<bd){ bd=dd; best=q; } });
    if(best){ const dx=best.x-P.x, dy=best.y-P.y; return {a:{x:a.x+dx,y:a.y+dy}, b:{x:b.x+dx,y:b.y+dy}, how:'Ecke', pt:best}; }
  }
  const L=Math.hypot(b.x-a.x,b.y-a.y), ang=Math.atan2(b.y-a.y,b.x-a.x), m={x:(a.x+b.x)/2, y:(a.y+b.y)/2};
  let best=null, bd=tol;
  g.tg.edges.forEach(e=>{ const ea=Math.atan2(e.b.y-e.a.y, e.b.x-e.a.x);
    if(Math.abs(Math.sin(ang-ea))>Math.sin(RUL_ANG)) return;
    const Le=Math.hypot(e.b.x-e.a.x,e.b.y-e.a.y)||1, nx=-(e.b.y-e.a.y)/Le, ny=(e.b.x-e.a.x)/Le;
    const off=(m.x-e.a.x)*nx+(m.y-e.a.y)*ny, s=((m.x-e.a.x)*(e.b.x-e.a.x)+(m.y-e.a.y)*(e.b.y-e.a.y))/Le;
    if(s<-L/2||s>Le+L/2) return;
    if(Math.abs(off)<bd){ bd=Math.abs(off); best={e, nx, ny, off, ea}; } });
  if(!best) return {a, b};
  const c=Math.cos(ang-best.ea)>=0 ? best.ea : best.ea+Math.PI, ux=Math.cos(c), uy=Math.sin(c);
  const mm={x:m.x-best.nx*best.off, y:m.y-best.ny*best.off};
  return {a:{x:mm.x-ux*L/2, y:mm.y-uy*L/2}, b:{x:mm.x+ux*L/2, y:mm.y+uy*L/2}, how:'an Kante', line:best.e};
}
function rulerDown(e, K){
  const part=rulerHit(K, evDev(e)); if(!part) return false;
  gesture={t:'tiles', k:'ruler', part, x0:e.clientX, y0:e.clientY, moved:false, snap:null,
           p0:tEvLocal(K,e), a0:{...TS.ruler.a}, b0:{...TS.ruler.b}, tg:rulerTargets(K)};
  return true;
}
function rulerMove(e, g, K){
  const p=tEvLocal(K,e), free=e.metaKey||e.ctrlKey, tol=tTol(), R=TS.ruler;
  let sn={};
  if(g.part==='body'){
    const dx=p.x-g.p0.x, dy=p.y-g.p0.y, a={x:g.a0.x+dx,y:g.a0.y+dy}, b={x:g.b0.x+dx,y:g.b0.y+dy};
    sn=free ? {a,b} : rulerSnapBody(g, a, b, tol);
    R.a=sn.a; R.b=sn.b;
  } else {
    const O=g.part==='a' ? g.b0 : g.a0, P0=g.part==='a' ? g.a0 : g.b0;
    let P={x:P0.x+p.x-g.p0.x, y:P0.y+p.y-g.p0.y};
    if(e.shiftKey){
      // Nur drehen: Laenge bleibt, Richtung rastet (ausser ⌘/Strg).
      const L0=Math.hypot(P0.x-O.x,P0.y-O.y), L=Math.hypot(P.x-O.x,P.y-O.y)||1;
      P={x:O.x+(P.x-O.x)*L0/L, y:O.y+(P.y-O.y)*L0/L};
      const sd=free ? null : rulerSnapDir(g.tg.edges, O, P);
      if(sd){ P={x:O.x+Math.cos(sd.dir)*L0, y:O.y+Math.sin(sd.dir)*L0}; sn={how:sd.how, line:sd.line}; }
    } else if(!free){ sn=rulerSnapEnd(g, O, P, tol); P=sn.p; }
    if(Math.hypot(P.x-O.x,P.y-O.y)<10) return;            // nicht auf null zusammenschieben
    if(g.part==='a') R.a=P; else R.b=P;
  }
  R.snap=sn.how ? {how:sn.how, pt:sn.pt, line:sn.line} : null;
  setHintLive(`Lineal ${rulerLen(Math.hypot(R.b.x-R.a.x, R.b.y-R.a.y))}${R.snap?' · '+R.snap.how:''} · ⌘/Strg: frei${g.part!=='body'?' · ⇧: nur drehen':''}`);
  render();
}
const rulerLen=L=>`${(Math.round(L*10)/10).toLocaleString('de-DE')} mm`;
// Zeichnen: Koerper, Teilung (Schritt nach Zoom), Laenge und Winkel, Griffe.
function drawRuler(K, dpr){
  const R=TS.ruler;
  if(!R.on) return;
  if(R.room!==currentRoom){ rulerLoad(); if(!R.a) rulerPlace(K); }
  const s=rulerScr(K), L=Math.hypot(R.b.x-R.a.x, R.b.y-R.a.y);
  ctx.save();
  ctx.fillStyle='rgba(247,214,120,.55)'; ctx.strokeStyle='rgba(110,82,20,.85)'; ctx.lineWidth=1*dpr;
  ctx.beginPath(); s.poly.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)); ctx.closePath(); ctx.fill(); ctx.stroke();
  // Messkante kraeftiger: an ihr wird abgelesen.
  ctx.lineWidth=1.6*dpr; ctx.beginPath(); ctx.moveTo(s.a.x,s.a.y); ctx.lineTo(s.b.x,s.b.y); ctx.stroke();
  ctx.lineWidth=1*dpr;
  // Teilung: kleinster Schritt mit mindestens 5 px, beschriftet alle >= 48 px.
  const steps=[1,2,5,10,20,50,100,200,500,1000,2000,5000];
  const minor=steps.find(st=>st*VIEW.s>=5*dpr)||5000;
  const major=steps.find(st=>st>=minor*5 && st%minor===0 && st*VIEW.s>=48*dpr)||minor*10;
  const mid=(major/2)%minor===0 && major/2>minor ? major/2 : 0;
  const pxPerMm=s.L/(L||1), unitCm=major>=10 && major%10===0;
  ctx.fillStyle='rgba(60,44,10,.95)'; ctx.font=`${10*dpr}px ${CANVAS_FONT}`; ctx.textAlign='center'; ctx.textBaseline='top';
  const n=Math.floor(L/minor+1e-9);
  for(let i=0;i<=n;i++){
    const t=i*minor, isMaj=t%major===0, isMid=mid && t%mid===0;
    const h=(isMaj?14:isMid?10:6)*dpr, x=s.a.x+s.u.x*t*pxPerMm, y=s.a.y+s.u.y*t*pxPerMm;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+s.n.x*h, y+s.n.y*h); ctx.stroke();
    if(isMaj && t>0 && t<L-major*0.3){
      ctx.save(); ctx.translate(x+s.n.x*(h+1*dpr), y+s.n.y*(h+1*dpr)); ctx.rotate(Math.atan2(s.u.y,s.u.x));
      ctx.fillText(unitCm ? String(t/10) : String(t), 0, 0); ctx.restore();
    }
  }
  // Laenge und Richtung zur ersten Wand (0° = parallel), mittig im Koerper.
  const deg=((Math.atan2(R.b.y-R.a.y, R.b.x-R.a.x)*180/Math.PI)%180+180)%180;
  const label=`${rulerLen(L)} · ${(Math.round(deg*10)/10).toLocaleString('de-DE')}°${unitCm?' · Teilung in cm':' · Teilung in mm'}`;
  let rot=Math.atan2(s.u.y,s.u.x); if(rot>Math.PI/2||rot<-Math.PI/2) rot+=Math.PI;
  ctx.save(); ctx.translate((s.a.x+s.b.x)/2+s.n.x*s.W*0.74, (s.a.y+s.b.y)/2+s.n.y*s.W*0.74); ctx.rotate(rot);
  ctx.textBaseline='middle'; ctx.font=`600 ${11*dpr}px ${CANVAS_FONT}`; ctx.fillText(label,0,0); ctx.restore();
  [s.a,s.b].forEach(q=>{ ctx.fillStyle='#fff'; ctx.strokeStyle=INK.accent; ctx.lineWidth=2*dpr; ctx.beginPath(); ctx.arc(q.x,q.y,6*dpr,0,7); ctx.fill(); ctx.stroke(); });
  // Eingerastet: Bezug hervorheben.
  if(R.snap && TS.drag){
    ctx.strokeStyle=TILE_INK.snap; ctx.globalAlpha=.7; ctx.lineWidth=4*dpr;
    if(R.snap.line){ const a=tScr(K,R.snap.line.a), b=tScr(K,R.snap.line.b); ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); }
    if(R.snap.pt){ const q=tScr(K,R.snap.pt); ctx.beginPath(); ctx.arc(q.x,q.y,9*dpr,0,7); ctx.stroke(); }
  }
  ctx.restore();
}
$('tRuler').onclick=()=>rulerToggle();

// Anmeldung bei der Seite (meldeAn im Block ui): so ruft sie den Fliesenplan, ohne ihn zu kennen.
meldeAn('tiles', {
  tasten:[
  ['Fliesen',[
    ['Drehen 15°, mit ⇧ 1°','Q  E'], ['L und R tauschen','F'],
    ['Gehrung · Anschneiden · Verbinden','G · T · V'],
    ['Fluchten · Wandfuge · Dehnungsfuge','A · W · J'], ['Fugencheck','K'],
    ['Kopieren, unter dem Zeiger einfügen','⌘C  ⌘V'], ['Muster fortsetzen','⌘D'], ['Alle wählen','⌘A'],
    ['Auswahl 1 mm schieben, mit ⇧ 10 mm','Pfeile'], ['Rahmenauswahl','⇧+Ziehen'],
    ['Ohne Einrasten ziehen','⌥+Ziehen'], ['Auswahl löschen','Entf'],
  ]]
  ],
  bereit:tilesReady, absage:'Fliesen erst, wenn der Raum geschlossen und eingemessen ist.',
  zeichne:drawTilesView,
  panel(){
    const ft=document.querySelector('#modes button[data-mode="tiles"]');
    if(ft){ const ok=tilesReady(); ft.setAttribute('aria-disabled', String(!ok));
      ft.title = ok ? 'Fliesen (4)' : 'Fliesen (4): erst, wenn der Raum geschlossen und eingemessen ist'; }
    // Fliesen-Modus ohne gueltigen Grundriss (z.B. nach Rueckgaengig): raus.
    if(M.mode==='tiles' && !tilesReady()){ setTool('aufmass'); return true; }
    renderTilesPanel();
    return false;
  },
  hinweis(){ const h=TILE_TOOL_HINTS[TS.tool]; return h ? h() : 'Fliese aus der Leiste ziehen · ⇧+Ziehen: Rahmen · Q/E drehen · ⌘D Muster fortsetzen'; },
  key:tilesKey,
  down:tilesDown, hover:tilesHover, tap:tilesTap,
  gesten:['tiles'], move:tilesMove, up:tilesUp,
  // Beim Verlassen des Fliesen-Modus: Werkzeug zurueck, Auswahl weg.
  verlassen(){ TS.sel.clear(); TS.tool='move'; TS.draft=null; TS.lines=[]; },
});
// Erstes Bild nach dem Boot: jetzt kennt renderPanel den Fliesen-Knopf. Ganz am
// Ende des Blocks, damit alles steht, was das Zeichnen der Fliesenansicht braucht
// (TS.ruler, RULER_PX, rulerLen ...): vorher gelang das Bild nur, weil die Seite
// beim Laden noch im Schritt Skizze steht.
render();
