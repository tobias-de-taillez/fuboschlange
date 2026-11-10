// kuechenplaner-bedienung.js – die Bedienung des Küchenplaners: Teile stellen, schieben, Maße, Prüfung, Wege,
// 3D, Panel. Wörtlich aus dem früheren Block "kitchen-ui" von raumaufmass.html. Meldet sich am Ende bei der
// Seite an (meldeAn, raum-plan.js); die Rechnung steht in raum-kueche.js (KITCHEN).
"use strict";
if(globalThis.RAUM_UNVOLLSTAENDIG) throw new Error('Küchenplaner startet nicht: unvollständig geladen.');
// ================= Küche: Bedienung =================
// Hängt am ui-Block wie tiles-ui: M, VIEW, toScr/toWorld, snapshot,
// STORE. Eigene Namen bleiben in der IIFE; nach außen gehen nur die
// die Anmeldung (meldeAn am Ende), über die ui den Küchenplaner ruft.
(()=>{
const KX=globalThis.KITCHEN;
const KS={ sel:null, hover:null, hl:null, flow:null, lastWall:null, palDrag:null, drag:false,
  show3d:lsGet('raumaufmass.k3d','1')==='1', paths:lsGet('raumaufmass.kwege','1')==='1', open:false,
  ana:lsGet('raumaufmass.kana','0')==='1', heat:true, anaMode:'week', ref:null, kid:false, anaKey:'', sw:null, swKey:'', swT:0,
  abst:lsGet('raumaufmass.kabst','0')==='1', ctxKey:'', ctx:null, flowKey:'', flowRes:null, suggKey:'', sugg:null, selKey:'', clearArmed:null, clip:null, ptr:null };
function lsGet(k,d){ try{ const v=localStorage.getItem(k); return v==null?d:v; }catch(e){ return d; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
function kitchenData(){ if(!M.kitchen) M.kitchen=KX.normKitchen(null); return M.kitchen; }
// Nur mit eindeutiger Form: Schränke an Skizzenlinien wären Erfindung.
function kitchenEnv(){
  if(!kitchenReady()) return null;
  return KX.makeEnv(M.fit.pts, M.walls, M.openings, M.hmeas, M.water, M.kitchen && M.kitchen.frame);
}
// Alles Abgeleitete einmal je Zustand: Layout und Prüfung. Wege und
// Vorschläge rechnen erst, wenn das Panel sie zeigt (eigener Cache).
function kctx(){
  if(!M.fit) return null;
  const key=JSON.stringify([M.kitchen, M.fit.pts, M.walls, M.openings, M.water, M.hmeas, M.an&&M.an.dof]);
  // Auch das Objekt muss dasselbe sein: Undo/Import ersetzen M.kitchen.
  if(key===KS.ctxKey && KS.ctx && KS.ctx.K===M.kitchen) return KS.ctx;
  const E=kitchenEnv();
  if(!E){ KS.ctxKey=key; KS.ctx=null; return null; }
  const K=kitchenData(), L=KX.layout(E,K), NK=[], F=KX.check(E,K,L,NK);
  const bad=new Set(), warn=new Set();
  F.forEach(f=>f.ids.forEach(id=>(f.lvl==='bad'?bad:warn).add(id)));
  KS.ctxKey=key; KS.ctx={E,K,L,F,NK,bad,warn,key};
  return KS.ctx;
}
function kitchenSave(){
  KS.ctxKey='';
  nudgeSave.cancel();                              // ein volles Speichern erledigt auch das Vorgemerkte
  // Erstes freies Teil in einem neuen Raum: Bezugsecken jetzt festlegen.
  KX.anchorFrame(kitchenData(), M.pts, M.walls);
  if(currentRoom && !STORE.save(currentRoom, {data:JSON.parse(serialize()), area:polyAreaM2(), stand:standKurz()}))
    setHint('Speichern fehlgeschlagen (Speicher voll?). Raum als Datei sichern.');
  render();
}
// Gehaltene Pfeil-/Dreh-Taste: erster Druck speichert wie bisher; jede Wiederholung nur neu zeichnen (wie beim
// Ziehen) - gespeichert wird einmal beim Loslassen, sonst nach kurzer Ruhe (verliert das Fenster den Fokus,
// kommt kein keyup). Je Wiederholung zu speichern schrieb die ganze Raumbibliothek und baute Panel samt
// Wegen und Vorschlägen neu.
const nudgeSave=KX.deferSave(()=>kitchenSave(), 400);
addEventListener('keyup', ()=>{ nudgeSave.flush(); });
addEventListener('blur', ()=>{ nudgeSave.flush(); });
function nudged(e){
  if(!e.repeat){ kitchenSave(); return; }
  KS.ctxKey=''; nudgeSave.mark(); redraw();
}
const selItem=()=>KS.sel==null ? null : kitchenData().items.find(it=>it.id===KS.sel)||null;
const cmTxt=v=>String(Math.round(v/10));
const mTxt=v=>(v/1000).toFixed(2).replace('.',',');
const nm=it=>KX.nameOf(it);
// Wandbuchstaben zeigt die Küche nicht (Meldung M-20261109-145224-3ebe3b):
// in dieser Ansicht ist keine Wand beschriftet. Richtungen statt Namen, so
// wie der Plan gerade auf dem Bildschirm liegt (wie die Pfeiltasten):
// waagerechte Wand links/rechts, senkrechte oben/unten.
const wallTxt=it=>'';
// [Bezeichnung der Ecke a, der Ecke b, aFirst = Ecke a links bzw. oben]
function wallEnds(Wf){
  const p=toScr(Wf.A), q=toScr(Wf.B), dx=q.x-p.x, dy=q.y-p.y;
  const hz=Math.abs(dx)>=Math.abs(dy), aFirst=hz ? dx>0 : dy>0;
  const [f,l]=hz ? ['links','rechts'] : ['oben','unten'];
  return {a:aFirst?f:l, b:aFirst?l:f, aFirst};
}
const sidesTxt=(Wf,x,w)=>{ const e=wallEnds(Wf), a=`${e.a} ${Math.round(x)} mm`, b=`${e.b} ${Math.round(Wf.L-x-w)} mm`; return e.aFirst ? `${a} · ${b}` : `${b} · ${a}`; };

// ---------- Hinzufügen ----------
function defaultWall(c){
  // Wand des gewählten Teils, sonst die zuletzt benutzte, sonst die längste.
  const it=selItem();
  if(it && it.a){ const Wf=KX.wallFrame(c.E,it.a,it.b); if(Wf) return Wf; }
  if(KS.lastWall){ const Wf=KX.wallFrame(c.E,KS.lastWall[0],KS.lastWall[1]); if(Wf) return Wf; }
  let best=null;
  c.E.wallsByKey.forEach(W=>{ const Wf=KX.wallFrame(c.E,W.a,W.b); if(Wf && !Wf.hole && (!best || Wf.L>best.L)) best=Wf; });
  return best;
}
function kitchenAdd(key, world){
  const c=kctx(); if(!c) return;
  const pre=KX.PRESETS.find(p=>p.key===key); if(!pre) return;
  const K=c.K;
  const it={id:K.seq++, kind:pre.kind, w:pre.w};
  ['front','dev','hinge','d','corner','door','fz','doorT','swing'].forEach(k=>{ if(pre[k]!=null) it[k]=pre[k]; });
  // Inhalte der Vorlage nur, wenn sie noch nirgends liegen (Müll an der Spüle).
  if(pre.store){ const st=pre.store.filter(s=>!K.items.some(o=>(o.store||[]).includes(s))); if(st.length) it.store=st; }
  placeItem(c, it, world, pre.label, true);
}
// Setzt ein fertiges Teil (ohne Lage) in den Plan: frei stehende an den
// Punkt, Wandteile an die nächste Wand bzw. neben das gewählte Teil.
// shrink: passt die Breite nicht, die größte passende Rasterbreite nehmen
// (Leiste); beim Einfügen bleibt die kopierte Breite, sonst wäre es kein
// Kopieren mehr.
function placeItem(c, it, world, label, shrink){
  const K=c.K;
  let msg=null;
  if(KX.KIND[it.kind].free){
    const F=c.E.F;
    const p=world ? TILES.toLocal(F, world) : TILES.toLocal(F, innerPoint(c.E.ring));
    it.x=p.x; it.y=p.y; if(!Number.isFinite(it.rot)) it.rot=0;
  } else {
    let Wf=null, near=null;
    if(world){ const nw=KX.nearestWall(c.E, world, 0, null, it.w); if(nw){ Wf=nw.Wf;
      // Abgelegt: an der nächsten Kante einrasten (Nachbar, Tür, Fensterachse).
      near=KX.snapX(c.E,K,c.L,{...it,a:Wf.a,b:Wf.b},Wf,nw.s-it.w/2,14*DPR()/VIEW.s); } }
    if(!Wf){
      // Klick ohne Ziel: direkt neben das gewählte Teil (erst rechts, sonst
      // links davon) - so wächst eine Zeile Stück für Stück.
      Wf=defaultWall(c);
      const sel=selItem();
      const sf=sel && sel.a ? KX.wallFrame(c.E,sel.a,sel.b) : null;
      if(Wf && sf && sf.key===Wf.key){
        const g=c.L.byId.get(sel.id);
        // Wf ist der Rahmen sel.a->sel.b, also gilt sel.x direkt. „Rechts aus
        // Sicht davor“ ist +u, wenn die rechte Frontkante am Ende s1 liegt.
        if(g){ const sR=dotWf(Wf, KX.frontLR(g).R), right=sR>(g.s0+g.s1)/2;
          // Hängeschrank zu einem Unterschrank: bündig darüber, sonst daneben.
          near = (it.kind==='wall' && sel.kind!=='wall') ? sel.x : right ? sel.x+sel.w : sel.x-it.w; }
      }
    }
    if(!Wf) return;
    it.a=Wf.a; it.b=Wf.b;
    // Erste freie Stelle; Eckschrank in die nähere Ecke, Blende hinter die
    // Querzeile – auch wenn er nur geschrumpft passt (Lage je Breite).
    const sl=KX.placeOnWall(c.E,K,c.L,it,Wf,near,shrink);
    if(!sl){ K.seq--; setHint(`Kein freier Platz an dieser Wand für ${label}. ${shrink?'Auf eine andere Wand ziehen.':'Zeiger an eine andere Wand halten und noch einmal ⌘V.'}`); return false; }
    // Kein Platz in Standardbreite: die größte Rasterbreite, die passt.
    if(sl.w!==it.w){ it.w=sl.w; msg=`Nur noch ${Math.round(sl.w/10)} cm frei – ${label} ${Math.round(sl.w/10)} gesetzt.`; }
    it.x=sl.x; KS.lastWall=[Wf.a,Wf.b];
  }
  snapshot();
  K.items.push(KX.normItem(it));
  KS.sel=it.id;
  kitchenSave();
  setHint(msg || `${label} gesetzt${wallTxt(it)} · ziehen verschiebt, rechts Breite und Inhalt`);
  return true;
}
// ⌘C merkt sich das gewählte Teil, ⌘V setzt eine Kopie unter den Zeiger
// (steht er nicht über dem Plan: neben das gewählte Teil). Meldung
// M-20261109-140133-cc2275.
function kitchenCopy(it){
  const t=KX.clipItem(it);
  KS.clip=t; setHint(`${nm(it)} kopiert · ⌘V setzt es unter den Zeiger`);
}
function kitchenPaste(){
  const c=kctx(); if(!c || !KS.clip) return;
  const it={...JSON.parse(JSON.stringify(KS.clip)), id:c.K.seq++};
  const over=KS.ptr && cv.matches(':hover');
  placeItem(c, it, over ? toWorld(KS.ptr.x, KS.ptr.y) : null, `Kopie von ${nm(it)}`, false);
}
const dotWf=(Wf,p)=>(p.x-Wf.A.x)*Wf.u.x+(p.y-Wf.A.y)*Wf.u.y;
// Punkt sicher im Raum (L-Räume: das Eckenmittel liegt oft draußen):
// grob der Punkt mit dem größten Abstand zu den Wänden.
function innerPoint(R){
  const c=centroidW(R); if(TILES.pointInRoom(c,R)) return c;
  const xs=R.map(p=>p.x), ys=R.map(p=>p.y), x0=Math.min(...xs), x1=Math.max(...xs), y0=Math.min(...ys), y1=Math.max(...ys);
  let best=c, bd=-1;
  for(let i=1;i<40;i++) for(let j=1;j<40;j++){ const p={x:x0+(x1-x0)*i/40, y:y0+(y1-y0)*j/40};
    if(!TILES.pointInRoom(p,R)) continue; const n=TILES.nearestOnRing(R,p); if(n && n.dist>bd){ bd=n.dist; best=p; } }
  return best;
}
const centroidW=KX.centroid;                    // eine Quelle mit dem kitchen-Block

// ---------- Palette ----------
const ICONS={
  base:'<rect x="4" y="9" width="22" height="15"/><path d="M4 14h22M4 19h22M13 11.5h4M13 16.5h4M13 21.5h4"/>',
  sink:'<rect x="4" y="11" width="22" height="13"/><path d="M15 11V5h4v2"/><path d="M8 15h14v6H8z"/>',
  dw:'<rect x="4" y="9" width="22" height="15"/><path d="M4 12.5h22M8 10.8h3"/><circle cx="15" cy="18.3" r="3.8"/><circle cx="15" cy="18.3" r="1.5"/>',
  hob:'<rect x="4" y="9" width="22" height="15"/><path d="M4 12.5h22"/><rect x="8" y="15" width="14" height="6"/><path d="M10 9V4.5h10V9M8 4.5h14"/>',
  corner:'<path d="M3 24V10h24v14z"/><path d="M3 10l6-6h18v6M15 13v8"/><rect x="3" y="10" width="9" height="14" fill="currentColor" opacity=".18"/>',
  hood:'<path d="M5 4h20v7H5z"/><path d="M3 11h24l-2 4H5z"/><path d="M10 19c1 1.5 1 3 0 4.5M15 19c1 1.5 1 3 0 4.5M20 19c1 1.5 1 3 0 4.5" stroke-width="1"/>',
  wall:'<rect x="4" y="3" width="22" height="11"/><path d="M15 3v11M12 10v2M18 10v2"/><path d="M4 26h22" stroke-dasharray="2 2"/>',
  wcorner:'<rect x="3" y="3" width="24" height="11"/><rect x="3" y="3" width="9" height="11" fill="currentColor" opacity=".18"/><path d="M19 9v2"/><path d="M3 26h24" stroke-dasharray="2 2"/>',
  tall:'<rect x="8" y="2" width="14" height="25"/><path d="M8 13h14M19 6v4M19 16v4"/>',
  // Kalt: Kühlschrank rund mit Griffen und Tropfen, Gefrierschrank mit
  // Schneeflocke – beide anders als der eckige Hochschrank (Stauraum).
  fridge:'<rect x="7" y="2" width="16" height="25" rx="2.5"/><path d="M7 10h16M9.5 5v2.5M9.5 13v5"/><path d="M16.5 14.5c-1.4 1.9-2.1 3-2.1 3.9a2.1 2.1 0 0 0 4.2 0c0-.9-.7-2-2.1-3.9z" stroke-width="1.15"/>',
  freezer:'<rect x="7" y="2" width="16" height="25" rx="2.5"/><path d="M15 8.5v12M9.8 11.5l10.4 6M9.8 17.5l10.4-6M13.3 8.9l1.7 1.6 1.7-1.6M13.3 20.1l1.7-1.6 1.7 1.6" stroke-width="1.15"/>',
  mw:'<rect x="3" y="7" width="24" height="15" rx="1.5"/><rect x="6" y="10" width="13" height="9"/><path d="M22.5 10.5v1M22.5 14v1M22.5 17.5v1"/>',
  oven:'<rect x="8" y="2" width="14" height="25"/><rect x="10" y="10" width="10" height="7"/><path d="M8 8h14M8 19h14"/>',
  island:'<rect x="2" y="12" width="26" height="12"/><path d="M1 12h28"/>',
  table:'<path d="M3 11h24M6 11v13M24 11v13"/><path d="M1 17h4v7M29 17h-4v7" stroke-width="1.1"/>',
};
function buildPalette(){
  const box=$('kPalette'); if(!box || box.childElementCount) return;
  KX.PGROUPS.forEach(([gk,gl])=>{
    const grp=document.createElement('div'); grp.className='kpg'; grp.setAttribute('role','group'); grp.setAttribute('aria-label',gl);
    grp.innerHTML=`<span>${gl}</span><div></div>`;
    box.appendChild(grp);
    const row=grp.lastChild;
  KX.PRESETS.filter(p=>p.grp===gk && p.pal!==false).forEach(p=>{
    const b=document.createElement('button');
    b.className='tb kpal'; b.title=p.label;   // nur der Name; Klicken/Ziehen sagt die Statuszeile
    b.setAttribute('aria-label', p.label);
    b.innerHTML=`<svg viewBox="0 0 30 28" aria-hidden="true">${ICONS[p.key]}</svg>`;
    b.addEventListener('pointerdown',e=>{ if(e.button!==0) return; KS.palDrag={key:p.key}; b.setPointerCapture(e.pointerId); });
    b.addEventListener('click',e=>{ if(e.detail===0) kitchenAdd(p.key); });
    b.addEventListener('pointerup',e=>{
      if(!KS.palDrag) return; KS.palDrag=null;
      const r=cv.getBoundingClientRect(), br=b.getBoundingClientRect();
      const inR=R=>e.clientX>=R.left && e.clientX<=R.right && e.clientY>=R.top && e.clientY<=R.bottom;
      if(inR(r)) kitchenAdd(p.key, toWorld((e.clientX-r.left)*DPR(), (e.clientY-r.top)*DPR()));
      else if(inR(br)) kitchenAdd(p.key);
    });
    b.addEventListener('pointercancel',()=>{ KS.palDrag=null; });
    row.appendChild(b);
  });
  });
}

// ---------- Zeichnen (Draufsicht) ----------
const KINK={ floor:'#fbfaf6', top:'#dcc7a3', topEdge:'#8a6a42', base:'#f1ede4', tall:'#e2dccf', wallFill:'rgba(75,71,62,.10)',
  edge:'#24221d', sel:'#1d6fd6', selFill:'rgba(29,111,214,.10)', bad:'#b3261e', badFill:'rgba(179,38,30,.16)', warn:'#c98a1a',
  table:'#e9d8bb', dark:'#3a3833', env:'rgba(29,111,214,.55)', envOther:'rgba(75,71,62,.45)', sash:'rgba(46,125,79,.75)',
  grp:{ein:'#2e7d4f', zub:'#c2410c', aus:'#1d6fd6'} };
function poly(P){ ctx.beginPath(); P.forEach((p,i)=>{ const q=toScr(p); i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y); }); ctx.closePath(); }
// Schrift der Plan-Etiketten aus {px (Gerätepixel), weight, italic}; Größen
// stehen in KX.PLAN_TXT (≥ 11 CSS-px), überall CANVAS_FONT.
const kFont=f=>`${f.italic?'italic ':''}${f.weight||400} ${f.px}px ${CANVAS_FONT}`;
// Gemessene Breiten je Schrift und Text merken: der Etiketten-Layouter fragt
// je Bild viele Kandidaten ab, auch beim Ziehen.
const KMEAS=new Map();
const kMeasure=(t,f)=>{ const k=kFont(f)+'|'+t; let w=KMEAS.get(k);
  if(w==null){ if(KMEAS.size>4000) KMEAS.clear(); ctx.font=kFont(f); w=ctx.measureText(t).width; KMEAS.set(k,w); } return w; };
function drawKitchenView(){
  const dpr=DPR();
  // Erst die Aufteilung Plan|3D setzen, dann messen - sonst wird der Plan
  // beim ersten Bild auf voller Breite gerechnet und danach gestaucht.
  syncToggles();
  sizeCanvas(dpr);
  ctx.textBaseline='alphabetic'; ctx.font=`${12*dpr}px ${CANVAS_FONT}`;
  if(!cv.width || !cv.height) return;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,cv.width,cv.height);
  const c=kctx();
  if(!c) return;
  const {E,K,L}=c;
  if(KS.sel!=null && !L.byId.has(KS.sel) && !K.items.some(it=>it.id===KS.sel)) KS.sel=null;
  if(!userView && !KS.drag && cv.width>=200 && cv.height>=200) VIEW=fitView(E.ring, VIEW.rot, 500);
  drawGrid(dpr); drawScalebar(dpr);
  // Boden
  ctx.beginPath(); TILES.ringsOf(E.ring).forEach(R=>{ R.forEach((p,i)=>{ const q=toScr(p); i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y); }); ctx.closePath(); });
  ctx.fillStyle=KINK.floor; ctx.fill('evenodd');
  // Heatmap (Analyse): unter allem anderen, eine Farbe von hell nach dunkel.
  if(KS.ana && KS.heat && !KS.drag){ const H=anaHeat(c); if(H.max>0){ ctx.save(); ctx.clip('evenodd');
    for(let iy=0;iy<H.ny;iy++) for(let ix=0;ix<H.nx;ix++){ const v=H.v[iy*H.nx+ix]/H.max; if(v<0.03) continue;
      const a=toScr({x:H.x0+ix*H.cell, y:H.y0+iy*H.cell}), b=toScr({x:H.x0+(ix+1)*H.cell, y:H.y0+(iy+1)*H.cell});
      ctx.fillStyle=`rgba(109,40,217,${(0.06+0.54*Math.pow(v,0.6)).toFixed(3)})`; ctx.fillRect(Math.min(a.x,b.x), Math.min(a.y,b.y), Math.abs(b.x-a.x)+0.5, Math.abs(b.y-a.y)+0.5); }
    ctx.restore(); } }
  ctx.strokeStyle=INK.wall; ctx.lineWidth=2.5*dpr; ctx.stroke();
  drawOpeningsOnPlan(E.pts, E.I, dpr, KX.doorReach(E, L));
  // Wasseranschlüsse (aus dem Wände-Tab): blauer Punkt an der Wand.
  KX.waterPts(E).forEach(x=>{ const q=toScr(x.p); ctx.beginPath(); ctx.arc(q.x,q.y,5*dpr,0,2*Math.PI); ctx.fillStyle='#1d6fd6'; ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=1.5*dpr; ctx.stroke(); });
  // Fensterflügel nach innen (gestrichelt): sie schwenken über die Platte.
  E.openings.forEach(o=>KX.sashes(E,o).forEach(sa=>{
    ctx.setLineDash([4*dpr,3*dpr]); ctx.strokeStyle=KINK.sash; ctx.lineWidth=1.2*dpr;
    poly(sa.poly); ctx.stroke(); ctx.setLineDash([]);
  }));
  const order={table:0, island:1, base:2, tall:3, wall:4};
  const G=[...L.G].sort((p,q)=>order[p.it.kind]-order[q.it.kind]);
  // Arbeitsplatten unter den Hängeschränken, über den Unterschränken
  const drawItem=g=>{
    // Eckschrank über Eck / diagonal: das Hauptteil zeichnet den ganzen Umriss.
    if(g.wing) return;
    const it=g.it, isSel=it.id===KS.sel, bad=c.bad.has(it.id), warn=c.warn.has(it.id), shp=g.outline||g.poly;
    if(it.kind==='table'){
      KX.tableSides(g,c.E,c.L).forEach(s=>{ for(let k=0;k<s.seats;k++){
        const t=(k+0.5)/s.seats, m={x:s.a.x+(s.b.x-s.a.x)*t, y:s.a.y+(s.b.y-s.a.y)*t};
        const along=unitV(sub2(s.b,s.a)), o=add2(m, mul2(s.n, 120));
        poly([add2(add2(o,mul2(along,-210)),mul2(s.n,-60)), add2(add2(o,mul2(along,210)),mul2(s.n,-60)), add2(add2(o,mul2(along,210)),mul2(s.n,330)), add2(add2(o,mul2(along,-210)),mul2(s.n,330))]);
        ctx.fillStyle='rgba(75,71,62,.10)'; ctx.fill(); ctx.strokeStyle='rgba(75,71,62,.45)'; ctx.lineWidth=1*dpr; ctx.stroke(); } });
      poly(shp); ctx.fillStyle=KINK.table; ctx.fill();
    } else if(it.kind==='wall'){
      poly(shp); ctx.fillStyle=KINK.wallFill; ctx.fill();
      ctx.setLineDash([5*dpr,3*dpr]);
    } else {
      if(g.foot && !g.outline){
        // Tresen: Hocker unter dem Überstand; die Platte samt Überstand
        // zeichnet der Plattendurchgang unten.
        const n=KX.barSeats(g), back=mul2(g.n,-1), a=g.foot[0], b=g.foot[1], along=unitV(sub2(b,a));
        for(let k=0;k<n;k++){ const t=(k+0.5)/n, m=add2(add2(a, mul2(sub2(b,a),t)), mul2(back,-80));
          const q=toScr(m); ctx.beginPath(); ctx.arc(q.x,q.y,Math.max(3*dpr,180*VIEW.s),0,2*Math.PI);
          ctx.fillStyle='rgba(75,71,62,.10)'; ctx.fill(); ctx.strokeStyle='rgba(75,71,62,.45)'; ctx.lineWidth=1*dpr; ctx.stroke(); }
      }
      poly(shp); ctx.fillStyle = it.kind==='tall' ? KINK.tall : KINK.base; ctx.fill();
    }
    if(bad){ poly(shp); ctx.fillStyle=KINK.badFill; ctx.fill(); }
    poly(shp);
    ctx.strokeStyle = isSel ? KINK.sel : bad ? KINK.bad : warn ? KINK.warn : KINK.edge;
    ctx.lineWidth=(isSel||bad?2.4:1.2)*dpr; ctx.stroke(); ctx.setLineDash([]);
    if(isSel){ poly(shp); ctx.fillStyle=KINK.selFill; ctx.fill(); }
    // Front als dicke Linie
    if(it.kind!=='table') (g.frontLines||[g.front]).forEach(([f0,f1])=>{
      const p=toScr(f0), q=toScr(f1);
      ctx.strokeStyle=isSel?KINK.sel:KINK.dark; ctx.lineWidth=(it.kind==='wall'?1.2:2.2)*dpr;
      if(it.kind==='wall') ctx.setLineDash([5*dpr,3*dpr]);
      ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.stroke(); ctx.setLineDash([]);
    });
  };
  G.filter(g=>g.it.kind!=='wall').forEach(drawItem);
  // Auch die Insel trägt eine Platte (Meldung M-20261109-145755-b3f684).
  L.tops.forEach(t=>{ poly(t.poly); ctx.fillStyle='rgba(220,199,163,.55)'; ctx.fill(); ctx.strokeStyle=KINK.topEdge; ctx.lineWidth=1*dpr; ctx.stroke(); });
  // Passleisten: schmale schraffierte Streifen an der Front
  (L.fillers||[]).forEach(f=>{ poly([KX.wpt(f.Wf,f.s0,0),KX.wpt(f.Wf,f.s1,0),KX.wpt(f.Wf,f.s1,c.K.spec.baseD),KX.wpt(f.Wf,f.s0,c.K.spec.baseD)]);
    ctx.fillStyle='rgba(75,71,62,.28)'; ctx.fill(); });
  // Auswahl und Befunde der Unterschränke ÜBER der Platte nachziehen, sonst
  // verschluckt das Beige die Farbe.
  G.filter(g=>(g.it.kind==='base'||g.it.kind==='island') && !g.wing).forEach(g=>{ const id=g.it.id, isSel=id===KS.sel, bad=c.bad.has(id), warn=c.warn.has(id);
    if(!(isSel||bad||warn)) return;
    poly(g.outline||g.poly); ctx.strokeStyle = isSel ? KINK.sel : bad ? KINK.bad : KINK.warn; ctx.lineWidth=(isSel||bad?2.4:1.6)*dpr; ctx.stroke();
    if(isSel){ ctx.fillStyle=KINK.selFill; ctx.fill(); } });
  G.filter(g=>g.it.kind!=='wall' && g.it.kind!=='table').forEach(g=>deviceSymbol(c,g,dpr));
  G.filter(g=>g.it.kind==='wall').forEach(drawItem);
  // Beschriftung im Bildschirmraum (KX.planLabels, eine Belegt-Liste fürs
  // ganze Bild): Eingänge und Maßkette zuerst als Hindernisse – die Eingänge
  // jetzt über den Teilen, die sie früher verdeckten –, dann Breite mit
  // Gerätekürzel > Hängeschrank > Inhalt; die Wege-Stationen kommen zuletzt.
  const LP=globalThis.CORE.labelPlacer();
  drawEntryLabels(c, dpr, LP);
  drawChain(c, dpr, LP);
  // Heller Saum unter der Schrift: Kochfeldkreise, Spülbecken und die
  // gestrichelte Hängeschrank-Kante laufen nicht mehr durch die Ziffern.
  ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle=KX.PLAN_TXT.ink;
  ctx.strokeStyle='rgba(251,250,246,.85)'; ctx.lineWidth=3*dpr; ctx.lineJoin='round';
  KX.planLabels(L, {toScr, dpr, LP, measure:kMeasure}).labels.forEach(b=>{ ctx.font=kFont(b.font); ctx.strokeText(b.txt, b.x, b.y); ctx.fillText(b.txt, b.x, b.y); });
  ctx.restore();
  // Schwenkbereiche: gewähltes Teil immer, alle mit „Fronten offen“
  L.G.forEach(g=>{
    if(!(KS.open || g.it.id===KS.sel)) return;
    g.env.forEach(e=>{ poly(e.poly); ctx.setLineDash([4*dpr,3*dpr]);
      ctx.strokeStyle = g.it.id===KS.sel ? KINK.env : KINK.envOther; ctx.lineWidth=1.2*dpr; ctx.stroke(); ctx.setLineDash([]);
      // Weiter als 90°: die 90°-Stellung als Strich, damit der Kompromiss sichtbar ist.
      if(!e.leaf && e.deg>90){ const p=toScr(e.hinge), q=toScr(add2(e.hinge, mul2(e.n, e.r))); ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.stroke(); }
      if(!e.leaf) return;
      // Flügel mit Türdicke: offen bei 90° als Blatt, dazu der Bogen der
      // Außenecke bis „ganz offen“ – so sieht man, wie weit er seitlich ausschlägt.
      const lf=e.leaf, sel=g.it.id===KS.sel;
      poly(e.open90); ctx.fillStyle = sel ? 'rgba(29,111,214,.18)' : 'rgba(75,71,62,.12)'; ctx.fill();
      ctx.strokeStyle = sel ? KINK.env : KINK.envOther; ctx.lineWidth=1.2*dpr; ctx.stroke();
      ctx.beginPath();
      for(let a=90; a<=lf.full; a+=2){ const R=KX.leafRect(lf, a*Math.PI/180), q=toScr(R[2]); a===90 ? ctx.moveTo(q.x,q.y) : ctx.lineTo(q.x,q.y); }
      ctx.setLineDash([2*dpr,3*dpr]); ctx.stroke(); ctx.setLineDash([]);
      if(sel){ const R=KX.leafRect(lf, lf.full*Math.PI/180); poly(R); ctx.setLineDash([2*dpr,3*dpr]); ctx.stroke(); ctx.setLineDash([]); }
    });
  });
  if(KS.abst) drawGaps(c, dpr);
  // Befunde mit Ort: kleine Marke
  c.F.forEach(f=>{ if(!f.at || f.lvl==='info') return; const p=toScr(f.at);
    ctx.beginPath(); ctx.arc(p.x,p.y,4*dpr,0,2*Math.PI); ctx.fillStyle=f.lvl==='bad'?KINK.bad:KINK.warn; ctx.fill(); });
  if((KS.paths || (KS.ana && KS.hoverFlow)) && !KS.drag) drawPaths(c, dpr, LP);
  if(KS.ana && !KS.drag) drawAnaMarks(c, dpr);
  // Vorschlag unter dem Zeiger: Pfeil vom alten zum neuen Schrank
  if(KS.hl){ const b=L.byId.get(KS.hl.to), a=KS.hl.from!=null ? L.byId.get(KS.hl.from) : (b && {c:add2(b.frontMid, mul2(b.n, 700))});
    if(a && b){ const p=toScr(a.c), q=toScr(b.c), d=unitV(sub2(q,p)), s=10*dpr;
      ctx.strokeStyle=INK.accent; ctx.fillStyle=INK.accent; ctx.lineWidth=3*dpr;
      ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x-d.x*s,q.y-d.y*s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(q.x,q.y); ctx.lineTo(q.x-d.x*s-d.y*s*0.6,q.y-d.y*s+d.x*s*0.6); ctx.lineTo(q.x-d.x*s+d.y*s*0.6,q.y-d.y*s-d.x*s*0.6); ctx.closePath(); ctx.fill(); } }
  drawRuler(c, dpr);
}
// Maßkette für die Wand des gewählten Teils: Wand – Teile – Lücken – Wand,
// vor der Front, im Höhenband des Teils; an den Enden bis zur Wand, die man
// dort vor sich hat. Fensterachse als Strichmarke. Bei Insel und Tisch die
// Abstände aller Seiten. Wandabstände sind anklickbar (KS.dimHits).
// Erst messen, dann zeichnen (Meldung: Kästen kurzer Segmente überdeckten
// sich): in der Strecke nur, wenn der Kasten hineinpasst, sonst seitlich
// daneben, sonst entfällt die Zahl. Ein anklickbarer Wandabstand bleibt immer
// stehen, damit der Klick auf die Wand ihn findet. LP: Belegt-Liste des Bilds.
function dimLabel(txt, p, q, col, edit, dpr, LP){
  const w=ctx.measureText(txt).width+8*dpr, hgt=15*dpr, m={x:(p.x+q.x)/2, y:(p.y+q.y)/2};
  const l=Math.hypot(q.x-p.x, q.y-p.y)||1, nx=-(q.y-p.y)/l, ny=(q.x-p.x)/l, off=(Math.abs(nx)*w+Math.abs(ny)*hgt)/2+3*dpr;
  const at=c=>({x:c.x-w/2, y:c.y-hgt/2, w, h:hgt, hard:true});   // hart: kein Stationsetikett über der Zahl
  const cands=[KX.dimFits(p,q,w,hgt,2*dpr) ? at(m) : null, at({x:m.x+nx*off, y:m.y+ny*off}), at({x:m.x-nx*off, y:m.y-ny*off})];
  let r=LP ? LP.place(cands) : cands.find(Boolean);
  if(!r){ if(!edit) return; r=cands.find(Boolean); LP && LP.occupy(r); }
  const cx=r.x+w/2, cy=r.y+hgt/2;
  ctx.fillStyle='rgba(250,249,246,.94)'; ctx.fillRect(r.x, r.y, w, hgt);
  if(edit){ ctx.strokeStyle=col; ctx.lineWidth=1*dpr; ctx.setLineDash([2*dpr,2*dpr]); ctx.strokeRect(r.x+0.5, r.y+0.5, w-1, hgt-1); ctx.setLineDash([]);
    const hit={x:r.x-3*dpr, y:r.y-3*dpr, w:w+6*dpr, h:hgt+6*dpr, cx, cy, edit};
    // Die 3-px-Klickfläche belegt LP hier nicht (sonst verlören Teil-Etiketten
    // Platz, wenn ein Teil gewählt ist); drawPaths trägt sie für Stationen nach.
    KS.dimHits.push(hit); }
  ctx.fillStyle=col; ctx.fillText(txt, cx, cy);
}
function drawChain(c, dpr, LP){
  KS.dimHits=[];
  const it=selItem(); if(!it || KS.drag) return;
  const g=c.L.byId.get(it.id); if(!g) return;
  ctx.save();
  ctx.strokeStyle=INK.scale; ctx.lineWidth=1*dpr; ctx.font=kFont({px:KX.PLAN_TXT.sub*dpr}); ctx.textAlign='center'; ctx.textBaseline='middle';
  // Einheit der Zahlen einmal unter der Maßstabsleiste: Kette und Abstände in mm, die
  // Breite am Schrank in cm (KX.DIM_NOTE) - ohne Hinweis liest man 600 als cm.
  const note=()=>{ ctx.save(); ctx.textAlign='left'; ctx.fillStyle=INK.scale; ctx.fillText(KX.DIM_NOTE, 14*dpr, 40*dpr); ctx.restore(); };
  if(g.free){
    (KX.freeDims(c.E, c.L, g)||[]).forEach(d=>{
      if(d.val<1) return;
      const p=toScr(d.p0), q=toScr(d.p1), a=unitV(sub2(q,p)), t={x:-a.y*4*dpr, y:a.x*4*dpr};
      ctx.strokeStyle=INK.scale; ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y);
      ctx.moveTo(q.x-t.x,q.y-t.y); ctx.lineTo(q.x+t.x,q.y+t.y); ctx.stroke();
      dimLabel(String(Math.round(d.val)), p, q, d.wall?INK.meas:INK.scale, d.edit, dpr, LP);
    });
    note();
    ctx.restore();
    return;
  }
  const D=KX.chainDims(c.E, c.L, g, c.K); if(!D){ ctx.restore(); return; }
  const Wf=D.Wf, q=D.q, xs=D.xs;
  const P=s=>toScr(KX.wpt(Wf,s,q));
  const a0=P(xs[0]), a1=P(xs[xs.length-1]); ctx.beginPath(); ctx.moveTo(a0.x,a0.y); ctx.lineTo(a1.x,a1.y); ctx.stroke();
  xs.forEach(v=>{ const t=toScr(KX.wpt(Wf,v,q-60)), u=toScr(KX.wpt(Wf,v,q+60)); ctx.beginPath(); ctx.moveTo(t.x,t.y); ctx.lineTo(u.x,u.y); ctx.stroke(); });
  // Über den Wandversatz hinaus: dünne Hilfslinie von der Wandecke zur Kette.
  [[D.x0,0],[D.x1,Wf.L]].forEach(([x,e])=>{ if(Math.abs(x-e)<1) return;
    const t=toScr(KX.wpt(Wf,x,0)), u=toScr(KX.wpt(Wf,x,q)); ctx.save(); ctx.setLineDash([2*dpr,3*dpr]); ctx.beginPath(); ctx.moveTo(t.x,t.y); ctx.lineTo(u.x,u.y); ctx.stroke(); ctx.restore(); });
  D.segs.forEach(sg=>{
    const d=sg.b-sg.a; if(d<1) return;
    const col = sg.gap && d<=150 ? KINK.warn : sg.gap ? INK.meas : INK.scale;
    dimLabel(String(Math.round(d)), P(sg.a), P(sg.b), col, sg.edit||null, dpr, LP);
  });
  // Fensterachsen
  c.E.openings.forEach(o=>{ if(o.kind!=='window') return; const on=KX.openingOn(c.E,o,Wf); if(!on) return;
    const s0=(on.s0+on.s1)/2, t=toScr(KX.wpt(Wf,s0,q-120)), u=toScr(KX.wpt(Wf,s0,q+120));
    ctx.save(); ctx.setLineDash([3*dpr,3*dpr]); ctx.strokeStyle=KINK.sash; ctx.beginPath(); ctx.moveTo(t.x,t.y); ctx.lineTo(u.x,u.y); ctx.stroke(); ctx.restore(); });
  note();
  ctx.restore();
}
// Klick auf einen Wandabstand: Eingabefeld darüber, Enter setzt, Esc bricht ab.
function dimHitAt(d){ return (KS.dimHits||[]).find(h=>d.x>=h.x && d.x<=h.x+h.w && d.y>=h.y && d.y<=h.y+h.h) || null; }
let dimEd=null;                                  // offenes Maßfeld: {commit}
function openDimEdit(hit0){
  // Ist schon ein Feld offen, zuerst dessen Wert setzen (das rendert neu): der
  // Treffer kam beim Klick aus den Maßen von vor dem Setzen, danach haben sie
  // andere Werte und Grenzen. Darum dasselbe Maß frisch lesen, nicht den Treffer.
  if(dimEd && $('kDimEd')) dimEd.commit();
  const hit=KX.dimResolve(KS.dimHits, hit0);
  closeDimEdit();
  if(!hit){ setHint('Dieses Maß gibt es nach der Änderung nicht mehr.'); return; }
  const r=cv.getBoundingClientRect(), k=DPR();
  const inp=document.createElement('input');
  inp.id='kDimEd'; inp.inputMode='decimal'; inp.value=String(Math.round(hit.edit.cur));
  inp.title=`Abstand in mm (${Math.ceil(hit.edit.min)}–${Math.floor(hit.edit.max)}) · Enter setzt, Esc bricht ab`;
  Object.assign(inp.style, {position:'fixed', left:(r.left+hit.cx/k-34)+'px', top:(r.top+hit.cy/k-13)+'px', width:'68px', height:'26px', zIndex:50,
    font:'12px '+CANVAS_FONT, textAlign:'center', border:'1px solid var(--accent, #b4532a)', borderRadius:'4px', background:'var(--surface, #fff)'});
  document.body.appendChild(inp); inp.focus(); inp.select();
  let done=false;
  const commit=()=>{ if(done) return; done=true;
    const raw=inp.value; closeDimEdit();
    const c=kctx(); if(!c) return;
    // Erst prüfen, dann snapshot(): ein Wert, der nicht geht, legt nichts auf
    // den Undo-Stapel (snapshot leert den Redo-Stapel und schiebt bei vollem
    // Stapel den ältesten Schritt hinaus).
    const p=KX.dimInput(c.E, c.K, hit.edit, raw);
    if(p.kind==='none') return;
    if(p.kind==='range'){ setHint(`Geht nur zwischen ${Math.ceil(hit.edit.min)} und ${Math.floor(hit.edit.max)} mm.`); return; }
    if(p.kind!=='ok'){ setHint('Dort ist kein Platz: ein Nachbarteil, eine Tür oder die Wand ist im Weg.'); return; }
    snapshot();
    KX.applyDim(c.E, c.K, hit.edit, p.v);
    kitchenSave(); setHint(`Abstand ${Math.round(p.v)} mm gesetzt · ⌘Z nimmt es zurück`); };
  dimEd={commit};
  inp.onkeydown=e=>{ e.stopPropagation(); if(e.key==='Enter'){ e.preventDefault(); commit(); } else if(e.key==='Escape'){ done=true; closeDimEdit(); } };
  inp.onblur=()=>commit();
  setHint(`Abstand ${hit.edit.anchor!=null?'zum Hochschrank':hit.edit.wall===false?'zum Nachbarteil':'zur Wand'} eintragen (${Math.ceil(hit.edit.min)}–${Math.floor(hit.edit.max)} mm), Enter setzt, Esc bricht ab`);
}
// Eingang im Plan (Meldung M-20261109-145947-e89ebf): Türen tragen dieselbe
// Nummer wie die Auswahl im Panel, der Eingang ist grün markiert; ein Klick
// auf eine Tür macht sie zum Eingang. Etikett 300 mm vor der Türmitte.
function entryMarks(c){
  const doors=KX.entries(c.E), cur=doors.find(o=>o.id===c.K.spec.entry) || doors[0];
  return doors.map((o,i)=>{ const Wf=KX.wallFrame(c.E,o.a,o.b), on=Wf&&KX.openingOn(c.E,o,Wf); if(!on) return null;
    const m=(on.s0+on.s1)/2;
    return {o, i, on:cur===o, Wf, at:KX.wpt(Wf,m,300), P:KX.wpt(Wf,on.s0,0), Q:KX.wpt(Wf,on.s1,0),
            txt:`${o.kind==='door'?'Tür':'Durchgang'}${doors.length>1?' '+(i+1):''}`}; }).filter(Boolean);
}
// Pille einer Tür: Mitte q (Bildschirm), Text t, Größe w × h – eine Quelle fürs Zeichnen und für die Wege.
function entryPill(m, dpr){
  const q=toScr(m.at), t=m.on ? `Eingang · ${m.txt}` : m.txt;
  return {q, t, w:kMeasure(t, {px:KX.PLAN_TXT.sub*dpr, weight:600})+12*dpr, h:17*dpr};
}
// top: nur die Pille des Eingangs noch einmal obenauf (nach den Wegen, deren
// Punkt und Linienende sonst die Schrift verdecken) – ohne Belegt-Liste und Türbalken.
function drawEntryLabels(c, dpr, LP, top){
  const ms=entryMarks(c).filter(m=>!top || m.on); if(!ms.length) return;
  ctx.save(); ctx.font=kFont({px:KX.PLAN_TXT.sub*dpr, weight:600}); ctx.textAlign='center'; ctx.textBaseline='middle';
  ms.forEach(m=>{
    const {q, t, w, h}=entryPill(m, dpr);
    LP && LP.occupy({x:q.x-w/2, y:q.y-h/2, w, h, hard:true});   // hart: kein Stationsetikett darüber
    if(m.on && !top){ const p=toScr(m.P), r=toScr(m.Q); ctx.strokeStyle=KINK.grp.ein; ctx.lineWidth=4*dpr; ctx.globalAlpha=.8;
      ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(r.x,r.y); ctx.stroke(); ctx.globalAlpha=1; }
    ctx.fillStyle = m.on ? KINK.grp.ein : 'rgba(250,249,246,.92)';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(q.x-w/2, q.y-h/2, w, h, h/2) : ctx.rect(q.x-w/2, q.y-h/2, w, h); ctx.fill();
    if(!m.on){ ctx.strokeStyle='rgba(75,71,62,.45)'; ctx.lineWidth=1*dpr; ctx.stroke(); }
    ctx.fillStyle = m.on ? '#fff' : INK.scale; ctx.fillText(t, q.x, q.y);
  });
  ctx.restore();
}
// Tür (Lücke oder Etikett) unter dem Zeiger, nur wenn es mehr als einen Eingang gibt.
function entryAt(c, w){
  const ms=entryMarks(c); if(ms.length<2) return null;
  const R=14*DPR()/VIEW.s;
  return ms.find(m=>distToSeg(w, m.P, m.Q).d<R || Math.hypot(w.x-m.at.x, w.y-m.at.y)<Math.max(R, 250)) || null;
}
function closeDimEdit(){ const e=$('kDimEd'); if(e) e.remove(); dimEd=null; }
// Wand anklicken (Meldung M-20261109-145224-3ebe3b): bei gewähltem Teil
// öffnet ein Klick auf eine Wand das Abstandsmaß zu genau dieser Wand.
// {hit} mit dem gezeichneten Maß, {none:true} bei Wand ohne Maß, sonst null.
function wallDimAt(c, w){
  if(KS.sel==null) return null;
  const n=TILES.nearestOnRing(c.E.ring, w); if(!n || n.dist*VIEW.s > 10*DPR()) return null;
  const hit=(KS.dimHits||[]).find(h=>{ const wp=h.edit && h.edit.wp; if(!wp) return false;
    const m=TILES.nearestOnRing(c.E.ring, wp); return m && m.r===n.r && m.i===n.i; });
  return hit ? {hit} : {none:true};
}
// Spüle und Kochfeld als Symbol auf der Platte (einmal je Bild, nach den
// Platten). Die Gerätekürzel (GS, KS, BO …) stehen in der Breitenzeile
// (KX.planLabels) – früher fest 12 px unter der Mitte, bei Hochschrank und
// Insel doppelt gezeichnet und ohne Kollisionsprüfung.
function deviceSymbol(c, g, dpr){
  const it=g.it, K=c.K;
  if(!it.dev) return;
  const at=(a,b)=>it.kind==='island' ? add2(add2(add2(g.c, mul2(g.u,-it.w/2)), mul2(g.n,-g.d/2)), add2(mul2(g.u,a), mul2(g.n,b))) : KX.wpt(g.Wf, g.s0+a, b);
  ctx.strokeStyle=INK.scale; ctx.lineWidth=1.2*dpr;
  if(it.dev==='sink'){
    const w=it.w, d=g.d;
    poly([at(70,110),at(w-70,110),at(w-70,d-80),at(70,d-80)]); ctx.fillStyle='rgba(160,166,172,.35)'; ctx.fill(); ctx.stroke();
    const f=toScr(KX.faucetPoint(K,g)); ctx.beginPath(); ctx.arc(f.x,f.y,4*dpr,0,2*Math.PI); ctx.fillStyle=INK.scale; ctx.fill();
  } else if(it.dev==='hob'){
    const w=it.w, d=g.d;
    [[0.3,0.32],[0.7,0.32],[0.3,0.7],[0.7,0.7]].forEach(([a,b])=>{ const p=toScr(at(w*a, d*b)); ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(2*dpr, 75*VIEW.s),0,2*Math.PI); ctx.stroke(); });
  }
}
const sub2=(a,b)=>({x:a.x-b.x,y:a.y-b.y}), add2=(a,b)=>({x:a.x+b.x,y:a.y+b.y}), mul2=(a,k)=>({x:a.x*k,y:a.y*k});
const unitV=v=>{ const l=Math.hypot(v.x,v.y)||1; return {x:v.x/l,y:v.y/l}; };
function flowRes(c){
  if(KS.flowKey===c.key && KS.flowRes) return KS.flowRes;
  KS.flowKey=c.key; KS.flowRes=KX.flows(c.E,c.K,c.L);
  if(KS.flow){ const f=KS.flowRes.flows.find(x=>x.key===KS.flow); if(!f || !f.complete) KS.flow=null; }
  return KS.flowRes;
}
function drawPaths(c, dpr, LP){
  const R=flowRes(c), FL=KS.flow||KS.hoverFlow||null;
  const show=R.flows.filter(f=>!FL || f.key===FL);
  show.forEach(f=>{
    const col=KINK.grp[f.group], hl=!!FL;
    ctx.strokeStyle=col; ctx.globalAlpha=hl?0.9:0.35; ctx.lineWidth=(hl?3:1.6)*dpr; ctx.lineJoin='round';
    f.legs.forEach(l=>{
      // Gesperrter Weg (Engstelle): rot gestrichelt als Luftlinie.
      if(!l.ok){ ctx.save(); ctx.strokeStyle=KINK.bad; ctx.setLineDash([6*dpr,4*dpr]); ctx.globalAlpha=0.9; }
      ctx.beginPath(); l.path.forEach((p,i)=>{ const q=toScr(p); i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y); }); ctx.stroke();
      if(!l.ok){ ctx.restore(); return; }
      if(hl && l.path.length>1){                     // Pfeil am Ziel
        const a=toScr(l.path[l.path.length-2]), b=toScr(l.path[l.path.length-1]), d=unitV(sub2(b,a)), s=8*dpr;
        ctx.beginPath(); ctx.moveTo(b.x,b.y); ctx.lineTo(b.x-d.x*s-d.y*s*0.6, b.y-d.y*s+d.x*s*0.6); ctx.lineTo(b.x-d.x*s+d.y*s*0.6, b.y-d.y*s-d.x*s*0.6); ctx.closePath(); ctx.fillStyle=col; ctx.fill();
      }
    });
    ctx.globalAlpha=1; ctx.lineJoin='miter';
  });
  // Stationen des gezeigten Ablaufs beschriften
  if(FL){
    const f=R.flows.find(x=>x.key===FL); if(!f) return;
    const seen=new Map();
    f.legs.forEach(l=>{ [[l.from,l.path[0]],[l.to,l.path[l.path.length-1]]].forEach(([r,p])=>{ const k=Math.round(p.x)+','+Math.round(p.y); if(!seen.has(k)) seen.set(k,{p,r:new Set()}); seen.get(k).r.add(r); }); });
    // Belegt-Liste des Bilds (Teil-Etiketten liegen schon drin): erst alle
    // Punkte, dann je Station die erste freie Seite (KX.stationLabel).
    // Punkte sind hart (kein Etikett darüber). Der Eingang hat schon seine
    // Pille („Eingang · Tür 1“) – kein zweites Etikett, das sie verdeckt.
    // Erst alle Etiketten setzen, dann Führungslinien, Punkte, Schrift – so
    // läuft keine Linie durch einen später gesetzten Kasten.
    const lp=LP||globalThis.CORE.labelPlacer(), St=[...seen.values()].map(v=>({...v, q:toScr(v.p)}));
    KX.stationBlock(lp, St.map(s=>s.q), KS.dimHits, dpr);   // Punkte + Klickflächen der Maße hart
    const o={dpr, measure:kMeasure, view:{w:cv.width, h:cv.height}, skip:entryMarks(c).some(m=>m.on) ? ['eingang'] : []};
    const B=St.map(({q,r})=>KX.stationLabel(lp, q, [...r], o));
    ctx.save(); ctx.textAlign='start'; ctx.textBaseline='middle';
    ctx.strokeStyle=INK.wall; ctx.lineWidth=1.25*dpr; ctx.globalAlpha=0.85;   // Führungslinie: auch bei dpr 1 sichtbar
    B.forEach((b,i)=>{ if(!b || !b.lead) return; const q=St[i].q; ctx.beginPath(); ctx.moveTo(q.x,q.y); ctx.lineTo(b.lead.x,b.lead.y); ctx.stroke(); });
    ctx.globalAlpha=1;
    // Der Punkt des Eingangs (kein eigenes Etikett: B[i] null) steht 150 mm hinter der Mitte der Pille und ragte
    // als halbe Beule über ihren Rand: er entfällt, wo er die Pille berührt (3 px Luft), sonst bleibt er Wegmarke.
    const pm=entryMarks(c).find(m=>m.on), pl=pm && entryPill(pm, dpr);
    St.forEach(({q},i)=>{ if(!B[i] && pl && KX.pillTouch(q, pl, 4.5*dpr, 3*dpr)) return;
      ctx.beginPath(); ctx.arc(q.x,q.y,4.5*dpr,0,2*Math.PI); ctx.fillStyle=KINK.grp[f.group]; ctx.fill(); });
    B.forEach(b=>{ if(!b) return;
      ctx.fillStyle='rgba(250,249,246,.92)'; ctx.fillRect(b.r.x, b.r.y, b.r.w, b.r.h);
      ctx.font=kFont(b.font); ctx.fillStyle=INK.wall; ctx.fillText(b.txt, b.r.x+4*dpr, b.r.y+b.r.h/2); });
    ctx.restore();
  }
  drawEntryLabels(c, dpr, null, true);   // Eingangs-Pille über Punkt und Linienende
}

// Analyse im Plan: Kind im Weg (Scheibe an der Heatmap-Spitze) und zu
// zweit die Stellen, an denen sich die Wege begegnen.
function drawAnaMarks(c, dpr){
  const kid=anaKid(c);
  if(kid){ poly(kid.poly); ctx.fillStyle='rgba(201,138,26,.35)'; ctx.fill(); ctx.strokeStyle=KINK.warn; ctx.lineWidth=1.5*dpr; ctx.stroke();
    const q=toScr(kid.p); ctx.save(); ctx.font=kFont({px:KX.PLAN_TXT.main*dpr, weight:600}); ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle=INK.wall; ctx.fillText('Kind', q.x, q.y); ctx.restore(); }
  if((c.K.spec.persons||1)>=2){
    const r=Math.max(3*dpr, KX.BODY_R*VIEW.s*0.5);
    anaConfl(c).forEach(x=>x.pts.forEach(p=>{ const q=toScr(p); ctx.beginPath(); ctx.arc(q.x,q.y,r,0,2*Math.PI); ctx.fillStyle='rgba(201,138,26,.22)'; ctx.fill(); }));
  }
}
// ---------- Zeiger ----------
function hits(c, w){
  const pr={wall:0, tall:1, base:2, island:3, table:4};
  // Zweiter Schenkel eines Eckschranks: gemeint ist das Hauptteil.
  const hs=[...new Set(c.L.G.filter(g=>TILES.pointInRing(w, g.foot||g.poly)).map(g=>g.wing?g.main:g))];
  // Liegt der Klick vor der Front des Hängeschranks, ist der Unterschrank gemeint.
  const deep=g=>g.it.kind==='wall' ? 0 : 1;
  const wallHit=hs.find(g=>g.it.kind==='wall');
  const pastWall = wallHit && dotV(sub2(w,wallHit.Wf.A),wallHit.Wf.n) > wallHit.d-20;
  return hs.sort((p,q)=> pastWall ? (deep(q)-deep(p)) || (pr[p.it.kind]-pr[q.it.kind]) : pr[p.it.kind]-pr[q.it.kind]);
}
let gestureK=null;
function kitchenDown(e){
  const c=kctx(); if(!c) return false;
  if(rulerDown(e, c)) return true;             // Lineal liegt oben und greift zuerst
  const d=evDev(e), dh=dimHitAt(d);
  // Der Treffer stammt aus den Maßen von vor diesem Klick; ist ein Maßfeld offen,
  // setzt openDimEdit dessen Wert zuerst und liest das Maß danach frisch.
  if(dh){ gesture={t:'kdim', moved:false, x0:e.clientX, y0:e.clientY}; setTimeout(()=>openDimEdit(dh)); return true; }
  const w=toWorld(d.x,d.y), hs=hits(c,w);
  if(!hs.length){
    // Bei gewähltem Teil hat das Wandmaß Vorrang (Meldung 3ebe3b), sonst die Tür.
    const en = KS.sel!=null && wallDimAt(c,w) && wallDimAt(c,w).hit ? null : entryAt(c,w);
    if(en){ gesture={t:'kdim', moved:false, x0:e.clientX, y0:e.clientY};
      if(!en.on){ snapshot(); c.K.spec.entry=en.o.id; kitchenSave(); }
      setHint(`Eingang: ${en.txt} – von hier zählen Einkauf und Müll`); return true; }
    const wd=wallDimAt(c,w); if(!wd) return false;
    gesture={t:'kdim', moved:false, x0:e.clientX, y0:e.clientY};
    if(wd.hit) setTimeout(()=>openDimEdit(wd.hit));
    else setHint('Zu dieser Wand gibt es kein Maß – anklickbar sind die Wände, auf die das Teil zuläuft.');
    return true;
  }
  const g = hs.find(h=>h.it.id===KS.sel) || hs[0];
  const it=g.it;
  const grab = it.a ? dotV(sub2(w,g.Wf.A),g.Wf.u)-it.x : null;
  const off = it.a ? null : sub2({x:it.x,y:it.y}, TILES.toLocal(c.E.F,w));
  const qGrab = it.a ? Math.max(0, dotV(sub2(w,g.Wf.A),g.Wf.n)) : 0;
  gesture={t:'kitchen', id:it.id, x0:e.clientX, y0:e.clientY, moved:false, snap:serialize(), grab, frac:grab!=null?grab/it.w:0, qGrab, off, L0:c.L, hits:hs.map(h=>h.it.id)};
  return true;
}
const dotV=(a,b)=>a.x*b.x+a.y*b.y;
// Hat das Teil einen wählbaren Anschlag? (eine Drehtür, Kühlschrank)
// Seitlicher Platzbedarf des weitesten Flügels ganz offen (mm).
const fullReach=(c,it)=>{ const g=c.L.byId.get(it.id); return g ? Math.round(Math.max(0, ...KX.leaves(g).map(lf=>KX.leafReachSide(lf, lf.full*Math.PI/180)))) : 0; };
// Hochschrank mit Gerät: Anschlag der Schranktüren darüber und darunter.
const hasHinge=KX.hasHinge;                    // eine Quelle mit der Stückliste
function kitchenMove(e, g){
  if(!g.moved) return;
  const c=kctx(); if(!c) return;
  if(g.snap){ pushSnapshot(g.snap); g.snap=null; }
  const it=kitchenData().items.find(x=>x.id===g.id); if(!it) return;
  KS.drag=true; KS.sel=it.id;
  const d=evDev(e), w=toWorld(d.x,d.y);
  if(!it.a){
    const p=TILES.toLocal(c.E.F,w);
    it.x=p.x+g.off.x; it.y=p.y+g.off.y;
    // Insel nahe der Wand, ungefähr quer dazu: Stirnseite andocken.
    if(g.rot0==null) g.rot0=it.rot||0;
    it.rot=g.rot0;
    const tolS=24*DPR()/VIEW.s;
    let dk = e.altKey ? null : KX.dockFree(c.E, c.K, it, tolS);
    // An eine andere Insel einrasten; gewinnt, wenn näher als die Wand.
    const si = e.altKey ? null : KX.snapIsland(c.E, c.K, it, tolS);
    if(si && !(dk && Math.abs(dk.q)<=si.q)) dk=null;
    const nb = si && !dk ? kitchenData().items.find(x=>x.id===si.with) : null;
    if(dk){ it.x=dk.x; it.y=dk.y; it.rot=dk.rot; setHintLive(`${nm(it)} an ${dk.wall} angedockt – Auszüge öffnen parallel zur Wand · ⌥ ohne Andocken`); }
    else if(si){ it.x=si.x; it.y=si.y; it.rot=si.rot;
      const one = nb && Math.abs(KX.dims(c.K,it).z1-KX.dims(c.K,nb).z1)<=1;
      setHintLive(`${nm(it)} an ${nb?nm(nb):'die Insel'} eingerastet (${si.how})${one?' – Arbeitsplatte läuft durch':''} · ⌥ ohne Einrasten`); }
    else setHintLive(`${nm(it)} frei verschieben · Q/E dreht${it.kind==='island'?' · Stirnseite an eine Wand oder Seite an eine Insel ziehen rastet ein':''}`);
  } else {
    const nw=KX.nearestWall(c.E, w, g.qGrab, it.a?[it.a,it.b].sort().join('|'):null, it.w); if(!nw) return;
    const Wf=nw.Wf;
    const tol=e.altKey ? 0 : 14*DPR()/VIEW.s;
    const x0=nw.s - g.frac*it.w;
    const t={...it, a:Wf.a, b:Wf.b};
    let x=e.altKey ? Math.max(0, Math.min(Wf.L-it.w, x0)) : KX.snapX(c.E,c.K,g.L0,t,Wf,x0,tol);
    // Läge es auf einem Nachbarn (oder vor Tür/Fenster), springt es an die
    // nächste freie Stelle in Reichweite. Mit ⌥ bleibt es, wo es ist.
    if(!e.altKey && !KX.fitsAt(c.E,c.K,g.L0,t,Wf,x)){
      const xf=KX.freeSlot(c.E,c.K,g.L0,t,Wf,x0);
      if(xf!=null && Math.abs(xf-x0)<it.w*0.75+tol) x=xf;
    }
    it.a=Wf.a; it.b=Wf.b; it.x=x; KS.lastWall=[Wf.a,Wf.b];
    setHintLive(`${sidesTxt(Wf,x,it.w)} bis zur Ecke · ⌥ ohne Einrasten`);
  }
  KS.ctxKey='';
  redraw();
}
function kitchenUp(e, g){
  KS.drag=false;
  if(g.moved){
    const it=kitchenData().items.find(x=>x.id===g.id), c=kctx();
    if(it && it.a && c){
      const snap=!(e && e.altKey);
      // Krumme Werte vom Ziehen auf 10 mm runden – außer es ist eine
      // Rastkante (an schiefen Ecken ist die krumm und muss so bleiben).
      // Mit ⌥ bleibt die Lage, wie sie ist.
      const Wf=KX.wallFrame(c.E,it.a,it.b), cand=snap && Wf ? KX.slotCandidates(c.E,c.K,c.L,it,Wf) : [];
      if(snap && Wf && !cand.some(x=>Math.abs(x-it.x)<0.5)){ const r=Math.max(0,Math.min(Wf.L-it.w, Math.round(it.x/10)*10)); if(KX.fitsAt(c.E,c.K,c.L,it,Wf,r) || !KX.fitsAt(c.E,c.K,c.L,it,Wf,it.x)) it.x=r; }
      // Eckschrank: über Eck / diagonal in die nähere Ecke der neuen Wand; die
      // gesetzte Ecke (Halbeck) folgt ihm in die andere Ecke (dort in die Eckenlage),
      // auch mit ⌥ (dann ohne zu rücken).
      if(Wf && it.corner){ const r=KX.cornerDrop(c.E,c.K,c.L,it,Wf,snap); if(r){ it.cEnd=r.cEnd; it.x=r.x; } }
    }
    kitchenSave(); return; }
  // Klick: wählen; erneuter Klick auf überlagerte Teile wechselt durch.
  const hs=g.hits;
  if(KS.sel===g.id && hs.length>1){ const i=hs.indexOf(g.id); KS.sel=hs[(i+1)%hs.length]; }
  else KS.sel=g.id;
  render();
}
function kitchenTap(e){ if(KS.sel!=null){ KS.sel=null; render(); } }
function kitchenHover(e){
  const c=kctx(); if(!c) return;
  const d=evDev(e), w=toWorld(d.x,d.y), hs=hits(c,w);
  KS.ptr=d;
  const rh=rulerHit(c, d);
  if(rh){ cv.style.cursor=rh==='body'?'move':'grab'; KS.rulerCur=true; return; }
  if(KS.rulerCur){ cv.style.cursor=''; KS.rulerCur=false; }
  const wd = hs.length ? null : wallDimAt(c,w);
  cv.style.cursor = hs.length || (wd && wd.hit) || dimHitAt(d) ? 'pointer' : '';
}
function kitchenKey(e){
  const k=e.key, mod=e.ctrlKey||e.metaKey, it=selItem();
  if(mod && k.toLowerCase()==='d' && it){ e.preventDefault(); duplicate(it); return true; }
  if(mod && !e.altKey && !e.shiftKey && k.toLowerCase()==='c' && it){ e.preventDefault(); kitchenCopy(it); return true; }
  if(mod && !e.altKey && !e.shiftKey && k.toLowerCase()==='v' && KS.clip){ e.preventDefault(); kitchenPaste(); return true; }
  if(mod || e.altKey) return false;
  // Drehregler im Fokus: Pfeile (1°), Pos1/Ende, Bild auf/ab gehören ihm. true ohne preventDefault: der
  // globale Handler tut dann auch nichts (sonst schöbe er die Ansicht) und der Regler macht seinen Schritt.
  if(e.target && KX.controlOwnsKey(k, e.target.tagName, e.target.type)) return true;
  const lk=k.toLowerCase();
  if(lk==='v'){ toggle3d(); return true; }
  if(lk==='w'){ togglePaths(); return true; }
  if(lk==='o'){ toggleOpen(); return true; }
  if(lk==='n'){ toggleGaps(); return true; }
  if(lk==='l'){ rulerToggle(); return true; }
  if(lk==='a'){ toggleAna(); return true; }
  if(!it) return false;
  if(k==='Escape'){ KS.sel=null; render(); return true; }
  if(k==='Delete' || k==='Backspace'){ e.preventDefault(); removeItem(it); return true; }
  if(lk==='f' && hasHinge(it)){ if(e.repeat) return true; snapshot(); it.hinge = it.hinge==='right'?'left':'right'; kitchenSave(); setHint(`Anschlag ${it.hinge==='right'?'rechts':'links'}`); return true; }
  if((lk==='q'||lk==='e') && !it.a){ if(!e.repeat) snapshot(); it.rot=((it.rot||0)+(lk==='e'?1:-1)*(e.shiftKey?1:15)+360)%360; nudged(e); return true; }
  if(k.startsWith('Arrow')){
    e.preventDefault();
    const st=e.shiftKey?100:10;
    if(it.a){
      const c=kctx(), Wf=c && KX.wallFrame(c.E,it.a,it.b); if(!Wf) return true;
      // Pfeil in Bildrichtung: waagerechte Wand ←/→, senkrechte ↑/↓.
      const ps=toScr(Wf.A), qs=toScr(Wf.B), dx=qs.x-ps.x, dy=qs.y-ps.y;
      let dir=0;
      if(Math.abs(dx)>=Math.abs(dy)){ if(k==='ArrowRight') dir=Math.sign(dx); if(k==='ArrowLeft') dir=-Math.sign(dx); }
      else { if(k==='ArrowDown') dir=Math.sign(dy); if(k==='ArrowUp') dir=-Math.sign(dy); }
      if(!dir) return true;
      const nx=Math.max(0, Math.min(Wf.L-it.w, it.x+dir*st));
      if(Math.abs(nx-it.x)<1e-6) return true;           // am Ende: kein leerer Undo-Schritt
      if(!e.repeat) snapshot();                         // gehaltene Taste = ein Schritt
      it.x=nx;
    } else {
      if(!e.repeat) snapshot();
      const v={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[k];
      const c=kctx(), a=toWorld(0,0), b=toWorld(st*VIEW.s*v[0], st*VIEW.s*v[1]);
      const pa=TILES.toLocal(c.E.F,a), pb=TILES.toLocal(c.E.F,b);
      it.x+=pb.x-pa.x; it.y+=pb.y-pa.y;
    }
    nudged(e); return true;
  }
  return false;
}
function duplicate(it){
  const c=kctx(); if(!c) return;
  const K=c.K;
  let n;
  if(it.a){
    // Wandteil wie beim Einfügen (⌘V): ein Eckschrank kommt in eine Ecke statt mitten an die Wand.
    n=KX.dupOnWall(c.E,K,c.L,it,K.seq++);
    if(!n){ setHint(it.corner && it.ctype ? 'Keine freie Ecke an dieser Wand für eine Kopie.' : 'Daneben ist kein Platz frei.'); K.seq--; return; }
  } else {
    n={...it, id:K.seq++};
    if(n.store) n.store=[...n.store];
    // Freies Teil (Insel, Tisch): daneben in seiner Achse, wo es im Raum steht, nichts
    // überlappt und es nicht in einer Tür- oder Fensterzone steht - sonst kein Duplikat.
    const s=KX.copySpot(c.E,K,c.L,n);
    if(!s){ setHint('Daneben ist kein Platz frei.'); K.seq--; return; }
    n.x=s.x; n.y=s.y;
  }
  snapshot(); K.items.push(KX.normItem(n)||n); KS.sel=n.id; kitchenSave();
}
function removeItem(it){
  snapshot();
  const K=kitchenData(); K.items=K.items.filter(x=>x.id!==it.id);
  KS.sel=null; kitchenSave();
  setHint(`${nm(it)} entfernt · ⌘Z holt es zurück`);
}
// Bedienzustand für den Meldedialog (zustand und Nachstellen im meldung-Block):
// KS bleibt in dieser IIFE. Ohne ihn ließ sich eine Meldung zum Panel eines Teils
// nicht nachstellen - gewähltes Teil, offene Fronten, Ablauf, Analyse, Kind, Referenz.
// Restore nimmt nur Gültiges (KX.normUi), der Aufrufer zeichnet danach.
function kitchenUiState(){
  return {sel:KS.sel, open:KS.open, flow:KS.flow, anaMode:KS.anaMode, kid:KS.kid, heat:KS.heat, ref:KS.ref,
          ana:KS.ana, paths:KS.paths, show3d:KS.show3d};
}
function kitchenUiRestore(s){
  Object.assign(KS, KX.normUi(s, kitchenData()));
  KS.kidR=null; KS.swKey=''; KS.anaKey=''; KS.flowKey=''; KS.hl=null; KS.hoverFlow=null;
  syncToggles();
}
Object.assign(globalThis, { kitchenUiState, kitchenUiRestore });

// ---------- Schalter ----------
function toggle3d(){ KS.show3d=!KS.show3d; lsSet('raumaufmass.k3d',KS.show3d?'1':'0'); syncToggles(); render(); }
function togglePaths(){ KS.paths=!KS.paths; lsSet('raumaufmass.kwege',KS.paths?'1':'0'); syncToggles(); render(); }
function toggleOpen(){ KS.open=!KS.open; syncToggles(); render(); }
function toggleGaps(){ KS.abst=!KS.abst; lsSet('raumaufmass.kabst',KS.abst?'1':'0'); syncToggles(); render();
  setHint(KS.abst ? 'Abstände: Gänge, Arbeitsdreieck, Sitzplätze nach NKBA – rot und gelb, wo es eng wird' : 'Abstände aus.'); }
function toggleAna(){ KS.ana=!KS.ana; lsSet('raumaufmass.kana',KS.ana?'1':'0'); KS.anaKey=''; syncToggles(); render(); }
function syncToggles(){
  const set=(id,v)=>{ const b=$(id); if(b) b.setAttribute('aria-pressed',String(!!v)); };
  set('k3dBtn',KS.show3d); set('kWayBtn',KS.paths); set('kOpenBtn',KS.open); set('kAnaBtn',KS.ana); set('kAbstBtn',KS.abst); set('kRulerBtn',KR.on);
  // Wege-Uebersicht im Panel nur, wenn "Wege" oben an ist (Meldung M-20261109-133312-e804a0);
  // mit Analyse steht alles rechts neben dem Plan, das Panel bleibt schlank.
  { const wb=$('kWayBox'); if(wb) wb.hidden=!KS.paths || KS.ana; }
  document.body.classList.toggle('kana', M.mode==='kitchen' && KS.ana);
  document.body.classList.toggle('kitchenmode', M.mode==='kitchen');
  document.body.classList.toggle('k3d', M.mode==='kitchen' && KS.show3d);
}

// ---------- Panel ----------
const SPEC_FIELDS=[['plinth','Sockel'],['baseH','Korpus unten'],['baseD','Tiefe unten'],['topT','Platte'],['topD','Plattentiefe'],
  ['wallH','Hängeschrank'],['wallD','Tiefe oben'],['tallH','Hochschrank'],['faucetH','Armatur']];
function buildSpec(){
  const g=$('kSpecGrid'); if(!g || g.childElementCount) return;
  g.innerHTML=SPEC_FIELDS.map(([k,l])=>`<label><span>${l}</span><input id="kS_${k}" inputmode="decimal" autocomplete="off"> mm</label>`).join('');
  SPEC_FIELDS.forEach(([k])=>{
    const inp=$('kS_'+k);
    inp.addEventListener('change',()=>{
      const v=parseFloat(String(inp.value).replace(',','.')), [lo,hi]=KX.K_LIM[k], S=kitchenData().spec;
      if(!isFinite(v) || v<lo || v>hi){ inp.value=S[k]; setHint(`Ungültiger Wert. Erlaubt ${lo}–${hi} mm.`); return; }
      snapshot(); S[k]=Math.round(v); const n=KX.fitStores(kitchenData());
      if(n) setHint(`${n} Inhalt${n>1?'e':''} aus Hochschränken mit Gerät entfernt – passt mit diesen Küchenmaßen nicht mehr in deren Fächer.`);
      kitchenSave();
    });
  });
  $('kSpecReset').onclick=()=>{ const S=kitchenData().spec; snapshot(); KX.specReset(S); const n=KX.fitStores(kitchenData());
    setHint('Küchenmaße auf Standard zurückgesetzt.'+(n?` ${n} Inhalt${n>1?"e":""} aus Hochschränken mit Gerät entfernt.`:'')); kitchenSave(); };
}
function renderSpec(c){
  const S=c.K.spec, D=KX.derived(S);
  SPEC_FIELDS.forEach(([k])=>{ const inp=$('kS_'+k); if(inp && document.activeElement!==inp) inp.value=S[k]; });
  $('kSpecSum').textContent=`Arbeitshöhe ${D.workH} · Oberschränke ab ${D.wallZ} mm`;
}
const seg=(name, opts, cur)=>`<div class="seg" data-seg="${name}">${opts.map(([v,l])=>`<button data-v="${v}" aria-pressed="${String(v===cur)}">${l}</button>`).join('')}</div>`;
// ---------- Maße eines Teils ----------
// Breite × Tiefe × Höhe nebeneinander (Tisch: Länge × Breite × Höhe), bei
// Hängeschränken die Unterkante, darunter die Lage an der Wand von beiden
// Ecken. Jedes Feld zeigt den Wert, der gilt; der Standard steht im
// Tooltip, eine Abweichung ist markiert und mit ↺ zurückzusetzen.
// Übliche Werte (Raster, nobilia/Neff, DIN 18022) erscheinen beim Klick ins
// Feld als Knöpfe.
function dimSpec(c, it, widths){
  const tbl=it.kind==='table', fz=KX.fzOf(it), S=c.K.spec;
  const cur=KX.dims(c.K,it), std=KX.dims(c.K,{...it, d:undefined, h:undefined, z:undefined});
  const H=cur.z1-cur.z0, Hs=std.z1-std.z0;
  const uniq=a=>[...new Set(a.map(Math.round))].sort((p,q)=>p-q);
  const F=[];
  // Eckschrank: Breite nur lesbar und NICHT als kW – renderCorner blendet
  // sonst die Zeile von kW aus (dort steht der Korpus).
  F.push({id:it.corner?'kWc':'kW', key:'w', label:tbl?'Länge':'Breite', val:it.w, std:null, opts:widths, lim:[100,6000],
    ro: it.corner ? 'Korpusbreite wählt man unten im Eckschrank-Kasten' : null,
    tip: tbl ? 'Seite, an der die Plätze sitzen (60 cm je Platz)' : 'Breite der Front'});
  // Tisch: jede übliche Breite ist Standard (wie die Länge), kein Einzelwert.
  F.push({id:'kD', key:'d', label:tbl?'Breite':fz?'Tiefe mit Tür':'Tiefe', val:cur.d, std:tbl?null:std.d, lim:[100,3000],
    opts: tbl ? [700,800,900,1000,1100,1200] : it.kind==='island' ? uniq([600,900,1000,1200,std.d]) : it.kind==='wall' ? uniq([300,350,std.d,400]) : uniq([std.d]),
    tip: tbl ? 'Abstand zwischen zwei Gegenübersitzenden' : fz ? 'Tiefe samt Tür, wie im Datenblatt' : 'Tiefe mit Front, ab Wand'});
  F.push({id:'kH', key:'h', label:'Höhe', val:H, std:Hs, lim:[100,3000],
    ro: it.kind==='base' ? `Arbeitshöhe ${Math.round(H)} aus den Küchenmaßen – unten unter „Küchenmaße“ einstellen` : null,
    opts: tbl ? [720,750,900,1050] : it.kind==='wall' ? uniq([360,576,Hs,900]) : it.kind==='tall' && !fz ? uniq([1440,1800,Hs,2232]) : fz && fz.single ? uniq([1760,Hs,2030]) : it.kind==='island' ? uniq([Hs,950,1050]) : uniq([Hs]),
    tip: tbl ? 'Tischhöhe (Esstisch 720–750, Bar 1050)' : 'Höhe ab Boden'});
  if(it.kind==='wall') F.push({id:'kZ', key:'z', label:'Unterkante', val:cur.z0, std:std.z0, lim:[0,3000], opts:uniq([std.z0, std.z0-100, std.z0+100]),
    tip:'Höhe der Unterkante über dem Boden (Standard: bündig mit dem Hochschrank oben)'});
  F.forEach(f=>{ f.val=Math.round(f.val); f.dev = f.std!=null ? Math.abs(f.val-f.std)>0.5 : !f.opts.includes(f.val); if(f.std!=null) f.std=Math.round(f.std); });
  return F;
}
function dimBlock(c, it, widths, Wsel){
  const F=dimSpec(c, it, widths), anyDev=F.some(f=>f.dev && f.std!=null);
  const cell=f=>`<label class="kdim${f.dev?' dev':''}${f.ro?' ro':''}" title="${escapeHtml(f.ro || (f.tip + (f.std!=null ? ` · Standard ${f.std} mm` : '')))}"><span>${f.label}</span>`
    +`<input id="${f.id}" data-k="${f.key}" inputmode="decimal" autocomplete="off" value="${f.val}"${f.ro?' readonly tabindex="-1"':''}>`
    +(f.dev && f.std!=null && !f.ro ? `<button class="kdr" data-reset="${f.key}" title="Zurück auf Standard ${f.std} mm" aria-label="${f.label} zurück auf Standard">↺</button>` : '')
    +`</label>`;
  let h=`<div class="kdims"><div class="kdh"><b>Maße</b><small>in mm</small>${anyDev?`<button id="kStd" title="Tiefe, Höhe und Unterkante auf Standard">alle Standard</button>`:''}</div>`
    +`<div class="kdg${F.length>3?' k4':''}">${F.map(cell).join('')}</div><div class="kdo" id="kDimOpts" hidden></div>`;
  // Lage ohne Wandbuchstaben: Abstand zur Ecke links und rechts, so wie
  // man vor dem Schrank steht. Auf die Wand im Plan klicken geht auch.
  if(Wsel){ const e=wallEnds(Wsel);
    const fa=`<label title="Abstand zur Ecke ${e.a} im Plan">${e.a} <input id="kX" inputmode="decimal" autocomplete="off" value="${Math.round(it.x)}"></label>`,
          fb=`<label title="Abstand zur Ecke ${e.b} im Plan">${e.b} <input id="kXb" inputmode="decimal" autocomplete="off" value="${Math.round(Wsel.L-it.x-it.w)}"></label>`;
    h+=`<div class="kdl"><span title="Abstand zur Ecke, wie der Plan liegt – oder im Plan auf die Wand klicken">Lage</span>${e.aFirst ? fa+fb : fb+fa}</div>`; }
  return h+`</div>`;
}
function dimWire(box, c, it, Wsel, edit, num){
  const F=dimSpec(c, it, box._widths||[]);
  const set={
    w:(t,v)=>{ t.w=Math.round(v); },
    d:(t,v,f)=>{ if(f.std!=null && Math.abs(v-f.std)<0.5) delete t.d; else t.d=Math.round(v); },
    h:(t,v,f)=>{ if(f.std!=null && Math.abs(v-f.std)<0.5) delete t.h; else t.h=Math.round(v); },
    z:(t,v,f)=>{ if(f.std!=null && Math.abs(v-f.std)<0.5) delete t.z; else t.z=Math.round(v); },
  };
  F.forEach(f=>{ if(!f.ro) num(f.id, f.lim[0], f.lim[1], (t,v)=>set[f.key](t,v,f)); });
  if(Wsel){
    num('kX', 0, Math.max(0,Wsel.L-it.w), (t,v)=>{ t.x=Math.round(v); });
    num('kXb', 0, Math.max(0,Wsel.L-it.w), (t,v)=>{ t.x=Math.round(Wsel.L-t.w-v); });
  }
  box.querySelectorAll('[data-reset]').forEach(b=>b.onclick=e=>{ e.preventDefault(); const k=b.dataset.reset; edit(t=>{ delete t[k]; }); });
  // Übliche Werte beim Klick ins Feld; Knopf übernimmt sofort.
  const opt=$('kDimOpts');
  F.forEach(f=>{ const el=$(f.id); if(!el || f.ro) return;
    el.addEventListener('focus',()=>{ el.select();
      const vals=f.opts.filter(v=>v>=f.lim[0] && v<=f.lim[1]);
      if(vals.length<2 && (f.std==null || vals[0]===f.val)){ opt.hidden=true; return; }
      opt.innerHTML=`<span>${f.label}:</span>`+vals.map(v=>`<button data-v="${v}" class="${v===f.val?'on':''}${v===f.std?' std':''}" title="${v===f.std?'Standard':''}">${v}</button>`).join('');
      opt.hidden=false;
      opt.querySelectorAll('button').forEach(b=>b.onpointerdown=e=>{ e.preventDefault(); el.value=b.dataset.v; el.onchange(); });
    });
    el.addEventListener('blur',()=>{ setTimeout(()=>{ if(!box.contains(document.activeElement) || !document.activeElement.dataset || !document.activeElement.dataset.k) opt.hidden=true; },0); });
    el.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); el.blur(); } });
  });
}
function renderSel(c){
  const box=$('kSelBox'), it=selItem();
  box.hidden=!it;
  if(!it){ KS.selKey=''; KS.selIt=null; return; }
  const g=c.L.byId.get(it.id);
  const key=KX.selBoxKey(it, c.K.spec, c.bad.has(it.id), VIEW.rot);   // mit Ansichtsdrehung (wallEnds)
  $('kSelInfo').textContent=nm(it)+wallTxt(it);
  if(key===KS.selKey && it===KS.selIt) return;
  if(KS.freeFor!==it.id){ KS.freeFor=it.id; KS.freeOpen=false; }
  // Schieber wird gerade gezogen: kein Neubau, und der Schlüssel bleibt der alte, damit der nächste Render ihn nachholt
  // (er stand schon auf dem neuen Stand, und das Panel, z. B. die Platzzahl am Tisch, blieb veraltet).
  if(KS.rotDrag===it.id) return;
  KS.selKey=key; KS.selIt=it;
  const fid = box.contains(document.activeElement) ? document.activeElement.id : null;
  const dev=it.dev?KX.DEV[it.dev]:null, fz=KX.fzOf(it);
  const widths = it.kind==='table' ? [800,1000,1200,1400,1600,1800,2000,2200] : it.kind==='island' ? [1200,1500,1800,2000,2400,2700] : it.corner ? KX.CORNER[it.kind].bodies : fz ? fz.widths : dev ? dev.widths : KX.WIDTHS;
  // Beim Tisch heisst w Laenge (die Seite mit den Plaetzen, 60 cm je Platz)
  // und d Breite (Abstand zwischen zwei Gegenuebersitzenden).
  const tbl=it.kind==='table';
  // Maße zuerst: sie sind der Kern eines Küchenteils (Meldung
  // M-20261109-135341-423962). Vorbelegt mit dem Standard, ein Klick ins
  // Feld bietet die üblichen Werte an, Abweichungen sind markiert.
  const Wsel=it.a ? KX.wallFrame(c.E,it.a,it.b) : null;
  box._widths=widths;
  let h='';
  // Bauart (Meldung M-20261109-150551-fc7828): erst Schrank, Eckschrank
  // oder Insel, dann unten, hängend oder hoch. Geräte mit Einbau-Wahl
  // (Spülmaschine unten / hoch, Herd mit oder ohne Backofen) ebenso hier.
  if(it.a && !it.dev && !KX.fzOf(it)){
    const kinds = it.corner ? [['base','unten'],['wall','hängend']] : [['base','Unterschrank'],['wall','Hängeschrank'],['tall','Hochschrank']];
    h+=`<div class="krow"><label>Bauart</label><div class="seg" id="kKind">${kinds.map(([v,l])=>`<button data-kind="${v}" aria-pressed="${String(it.kind===v)}">${l}</button>`).join('')}</div></div>`;
  }
  let dwTip='';
  if(it.dev==='dw' && it.a){
    // Was die Fächer neben dem Gerät aufnehmen, nach den jetzigen Maßen (hoch gedacht).
    const nZ=KX.dwZones({...it, kind:'tall'}, c.K.spec).length;
    dwTip = nZ>1 ? ' Fächer darunter und darüber nehmen Inhalte auf: unten Vorräte, Töpfe, Seltenes; oben auch Geschirr.'
      : nZ===1 ? ' Darunter bleibt ein Fach für Vorräte, Töpfe, Seltenes; darüber ist zu wenig Platz.' : ' Der Schrank ist niedriger als das Gerät – kein Platz für Fächer.';
  }
  if(it.dev==='dw' && it.a)
    h+=`<div class="krow"><label title="Hoch eingebaut: im Hochschrank, Unterkorb auf Hüfthöhe – kein Bücken beim Ein- und Ausräumen.${dwTip}">Einbau</label><div class="seg" id="kKind">${[['base','unten'],['tall','hoch (Hüfthöhe)']].map(([v,l])=>`<button data-kind="${v}" aria-pressed="${String(it.kind===v)}">${l}</button>`).join('')}</div></div>`;
  if(it.dev==='hob' && it.kind==='base')
    h+=`<div class="krow"><label title="Ohne Backofen: nur Kochfeld, darunter Schubladen (Töpfe). Den Backofen dann im Hochschrank setzen (Leiste: Warm).">Backofen</label><div class="seg">${[['1','darunter'],['0','keiner (Schubladen)']].map(([v,l])=>`<button data-oven="${v}" aria-pressed="${String((it.noOven?'0':'1')===v)}">${l}</button>`).join('')}</div></div>`;
  h+=dimBlock(c, it, widths, Wsel);
  const devs=Object.entries(KX.DEV).filter(([,d])=>d.kinds.includes(it.kind));
  if(devs.length) h+=`<div class="krow"><label>Gerät</label><select id="kDev"><option value="">keins</option>${devs.map(([k,d])=>`<option value="${k}"${it.dev===k?' selected':''}>${d.label}</option>`).join('')}</select></div>`;
  if(KX.isCold(it) && it.kind==='tall'){
    const fzs=Object.entries(KX.FRIDGE).filter(([,f])=>f.devs.includes(it.dev));
    h+=`<div class="krow"><label>Bauform</label><div class="seg" id="kFz">${[['','Einbau'],...fzs.map(([k,f])=>[k,f.label])].map(([v,l])=>`<button data-fz="${v}" aria-pressed="${String((it.fz||'')===v)}">${l}</button>`).join('')}</div></div>`;
    if(it.dev==='fridge') h+=`<div class="krow"><label title="Eiswürfel- oder Wasserspender mit Festwasseranschluss: die Prüfung misst den Schlauchweg zum Wasseranschluss (Raumaufmaß, Schritt Wände)">Festwasser</label><div class="seg">${[['0','nein'],['1','ja']].map(([v,l])=>`<button data-fw="${v}" aria-pressed="${String((it.water?'1':'0')===v)}">${l}</button>`).join('')}</div></div>`;
    if(it.fz==='free' && it.dev==='fridge') h+=`<div class="krow"><label>Gefrierteil</label><div class="seg">${[['0','ohne'],['1','mit']].map(([v,l])=>`<button data-gf="${v}" aria-pressed="${String((it.gf?'1':'0')===v)}">${l}</button>`).join('')}</div></div>`;
    if(!fz) h+=`<div class="krow"><label title="Bis wohin die Tür aufgehen soll. Die Prüfung und der Schwenkbereich im Plan rechnen damit.">Tür auf</label><div class="seg" id="kSwing">${KX.SWINGS.map(v=>`<button data-swing="${v}" aria-pressed="${String(KX.swingOf(it)===v)}" title="${v===90?'Reicht zum Hineingreifen; Schalen und Fächer lassen sich oft nicht herausnehmen':'Schalen und Fächer lassen sich herausnehmen; braucht seitlich mehr Platz'}">${v}°</button>`).join('')}</div></div>`;
    if(fz) h+=`<div class="krow"><label>Türdicke</label><input id="kDT" inputmode="decimal" value="${Math.round(KX.doorTOf(it))}" title="Dicke der Tür samt Türfächern, ${KX.DOORT_LIM[0]}–${KX.DOORT_LIM[1]} mm. Offen steht der Flügel bei 90° um die halbe Türdicke seitlich über, ganz offen deutlich mehr."> mm <small>seitlich ${Math.round(KX.doorTOf(it)/2)} mm (90°) bis ${fullReach(c,it)} mm (ganz offen)</small></div>`;
  }
  const fk=KX.frontKind(it);
  if(it.kind!=='table' && !['dw','oven','mw'].includes(it.dev) && !KX.ovenBelow(it)){
    const fronts = it.kind==='wall' ? [['door','Drehtür'],['flap','Klappe'],['slide','Schiebetür'],['open','offen']]
                 : KX.isCold(it) ? [['door','Drehtür']]
                 : [['drawer','Schubladen'],['door','Drehtür'],['slide','Schiebetür'],['open','offen']];
    if(fronts.length>1) h+=`<div class="krow"><label>Front</label>${seg('front', fronts, fk)}</div>`;
    if(hasHinge(it)) h+=`<div class="krow"><label>Anschlag</label>${seg('hinge', [['left','links'],['right','rechts']], it.hinge||'left')}<kbd>F</kbd></div>`;
  }
  if(KX.tallDev(it))
    h+=`<div class="krow"><label title="Schranktüren über und unter dem Gerät${it.dev==='mw'?' (die Mikrowellentür selbst schlägt links an)':''}">Anschlag</label>${seg('hinge', [['left','links'],['right','rechts']], it.hinge||'left')}<kbd>F</kbd></div>`;
  if(it.dev==='sink'){
    const fh=it.faucetH!=null?it.faucetH:c.K.spec.faucetH;
    const opts=[[60,'Vorfenster, umgeklappt (60)'],[160,'flach (160)'],[c.K.spec.faucetH,`Standard (${c.K.spec.faucetH})`],[400,'hoch (400)']];
    const uniq=[...new Map(opts.map(o=>[o[0],o])).values()];
    h+=`<div class="krow"><label>Armatur</label><select id="kFau">${uniq.map(([v,l])=>`<option value="${v}"${fh===v?' selected':''}>${l}</option>`).join('')}</select></div>`;
  }
  if(tbl && g){
    // Plätze folgen aus Länge und Breite (60 cm je Platz) und dem Stuhlraum.
    const sd=KX.tableSides(g,c.E,c.L), n=sd.reduce((a,s)=>a+s.seats,0);
    const lg=sd.filter(s=>!s.end).map(s=>s.seats), en=sd.filter(s=>s.end).map(s=>s.seats);
    const blk=sd.filter(s=>!s.open).length;
    h+=`<div class="krow"><label title="60 cm Gedeckbreite je Platz; Stirnseite ab 60 cm Breite, wenn an den Ecken 20 cm frei bleiben">Plätze</label><span id="kSeatsTxt"><b>${n}</b> <small>· lang ${lg.join(' + ')}${en.some(v=>v)?` · Stirn ${en.join(' + ')}`:''}${blk?` · ${blk} Seite${blk>1?'n':''} ohne Stuhlraum`:''}</small></span></div>`;
  }
  const st=KX.storable(it, c.K.spec);
  if(st.length){
    // Hochschrank mit Gerät: je Fach ein Inhalt (Fach unten, Fach oben).
    const dwF=KX.tallDev(it) ? KX.devZones(it,c.K.spec) : null, dvN={dw:'der Spülmaschine', oven:'dem Backofen', mw:'der Mikrowelle'}[it.dev];
    const lowOnly=dwF && dwF[0] && dwF[0].only ? ' Ins untere Fach knapp über dem Boden nur Vorräte, Töpfe, Seltenes, Putzmittel.' : '';
    h+=`<div class="kgrp"><label${dwF?` title="Je Fach ${dwF.length>1?'unter und über':'unter'} ${dvN} ein Inhalt (hinter Türen).${lowOnly} Besteck, Messer und Müll gehören in Schubladen bzw. an die Spüle.${dwF.length>1?'':' Über dem Gerät ist zu wenig Platz für ein Fach.'}"`:''}>Inhalt${dwF?` <small>${dwF.length>1?'unten und oben, je eins':'nur unten, eins'}</small>`:''}</label><div class="kchips">${st.map(k=>{ const on=(it.store||[]).includes(k);
      return `<button data-store="${k}" aria-pressed="${on}">${escapeHtml(KX.CONTENTS.find(x=>x.key===k).label)}</button>`; }).join('')}</div></div>`;
  }
  if(it.kind==='island' && g){
    // Tresen: Überstand der Platte hinten (NKBA-Knieraum nach Höhe).
    const nk=KX.barNkba(g.z1), bars=[...new Set([0,250,300,nk,400,500,Math.round(it.bar||0)])].sort((p,q)=>p-q);
    h+=`<div class="krow"><label title="Platte steht hinten über, darunter Hocker (NKBA: Knieraum ${nk} mm bei ${Math.round(g.z1)} mm Höhe, 61 cm je Platz)">Tresen</label><select id="kBar">${bars.map(v=>`<option value="${v}"${Math.round(it.bar||0)===v?' selected':''}>${v?`${cmTxt(v)} cm Überstand${v===nk?' (NKBA)':''}`:'kein'}</option>`).join('')}</select>${it.bar?` <small>${KX.barSeats(g)} Hocker</small>`:''}</div>`;
  }
  if(!it.a){
    // Drehung sichtbar: Schieber (rastet beim Ziehen an 0/45/90° und an den
    // Wänden, ⌥ frei), Zahl, Vierteldrehung. Tastatur: Q/E.
    const r=Math.round(it.rot||0);
    h+=`<div class="krow"><label>Drehung</label><input id="kR" inputmode="decimal" value="${r}"> °<button id="kR90" title="Um 90° drehen (Q/E: 15°, mit ⇧ 1°)">↻ 90°</button>${it.kind==='island'?`<button id="kR180" title="Fronten auf die andere Längsseite (gleiche Stelle, Tresen wandert mit)">Front wenden</button>`:''}</div>`
      +`<div class="krow"><label></label><input id="kRs" type="range" min="0" max="359" step="1" value="${r}" style="flex:1 1 auto;width:auto;padding:0;border:0" title="Ziehen rastet an 0/45/90° und an schiefen Wänden ein, mit ⌥ frei · Pfeiltasten 1°"></div>`;
  }
  h+=`<div class="trow"><button id="kDup" title="Gleiches Teil daneben (⌘D)">Duplizieren</button><button id="kDel" title="Entfernen (Entf)">Löschen</button></div>`;
  $('kSelBody').innerHTML=h;
  // Verdrahtung. Die Handler holen das Teil zur Ereigniszeit (nach Undo
  // ist es ein anderes Objekt) und wirken erst nach dem Fokuswechsel, damit
  // der Neuaufbau den Fokus nicht verliert.
  // Hochschrank mit Gerät: wird der Schrank so niedrig, dass oben kein Fach
  // bleibt, fällt weg, was nur dort hinpasste (Meldung M-20261109-161527-05b8cd).
  // Hinweis vor dem Speichern: schlägt das Speichern fehl, gewinnt dessen Warnung.
  const edit=fn=>{ const cur=selItem(); if(!cur) return; snapshot(); fn(cur); const n=KX.fitStores(kitchenData(), cur);
    if(n) setHint(`${nm(cur)}: ${n} Inhalt${n>1?'e':''} entfernt – ${KX.devZones(cur,kitchenData().spec).length?'über dem Gerät ist kein Fach mehr':'der Schrank ist niedriger als das Gerät'}.`);
    kitchenSave(); };
  const num=(id,lo,hi,fn)=>{ const el=$(id); if(!el) return; el.onchange=()=>{ const v=parseFloat(String(el.value).replace(',','.'));
    setTimeout(()=>{ if(!isFinite(v)||v<lo||v>hi){ setHint(`Ungültiger Wert (${lo}–${hi}).`); KS.selKey=''; render(); return; } edit(cur=>fn(cur,v)); }); }; };
  dimWire(box, c, it, Wsel, edit, num);
  if($('kDev')) $('kDev').onchange=()=>edit(t=>{ const v=$('kDev').value; delete t.fz; delete t.doorT; delete t.gf; if(v){ t.dev=v; const dw=KX.DEV[v].widths; if(!dw.includes(t.w)) t.w=dw.includes(600)?600:dw[0]; t.store=(t.store||[]).filter(x=>KX.storable(t,kitchenData().spec).includes(x)); if(!t.store.length) delete t.store; } else delete t.dev; });
  // Bauform: Breite und Maße auf die der Bauform zurücksetzen (Einbau 60 cm).
  box.querySelectorAll('[data-fz]').forEach(b=>b.onclick=()=>edit(t=>{ const v=b.dataset.fz;
    if(v){ t.fz=v; const f=KX.FRIDGE[v]; if(!f.widths.includes(t.w)) t.w=f.widths.reduce((b,w)=>Math.abs(w-t.w)<Math.abs(b-t.w)?w:b); }
    else { delete t.fz; delete t.doorT; if(!KX.DEV[t.dev].widths.includes(t.w)) t.w=600; }
    if(!t.hinge) t.hinge='right';
    if(v!=='free') delete t.gf;
    if(v) delete t.swing; else if(!t.swing) t.swing=120;   // wie aus der Leiste
    delete t.d; delete t.h; }));
  num('kDT',KX.DOORT_LIM[0],KX.DOORT_LIM[1],(t,v)=>{ t.doorT=Math.round(v); });
  box.querySelectorAll('[data-gf]').forEach(b=>b.onclick=()=>edit(t=>{ if(b.dataset.gf==='1') t.gf=true; else delete t.gf; }));
  box.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{ const v=b.dataset.kind; if(selItem() && selItem().kind!==v) edit(t=>switchKind(t, v)); });
  box.querySelectorAll('[data-fw]').forEach(b=>b.onclick=()=>edit(t=>{ if(b.dataset.fw==='1') t.water=true; else delete t.water; }));
  box.querySelectorAll('[data-oven]').forEach(b=>b.onclick=()=>edit(t=>{ if(b.dataset.oven==='0'){ t.noOven=true; t.front='drawer'; } else { delete t.noOven; delete t.store; } }));
  box.querySelectorAll('[data-swing]').forEach(b=>b.onclick=()=>edit(t=>{ t.swing=+b.dataset.swing; }));
  box.querySelectorAll('[data-seg]').forEach(sg=>sg.querySelectorAll('button').forEach(b=>b.onclick=()=>edit(t=>{
    if(sg.dataset.seg==='front') KX.frontSet(t, b.dataset.v); else t[sg.dataset.seg]=b.dataset.v; })));
  if($('kFau')) $('kFau').onchange=()=>edit(t=>{ const v=+$('kFau').value; if(v===kitchenData().spec.faucetH) delete t.faucetH; else t.faucetH=v; });
  // Hochschrank mit Gerät: je Fach ein Inhalt – was nicht mehr in ein freies
  // Fach passt, wird nicht eingetragen (sonst räumte fitStores es gleich aus).
  box.querySelectorAll('[data-store]').forEach(b=>b.onclick=()=>{ const cur=selItem(), k=b.dataset.store;
    if(cur && KX.tallDev(cur) && !(cur.store||[]).includes(k) && !KX.storeFits(cur, kitchenData().spec, [...(cur.store||[]), k])){
      setHint(`${nm(cur)}: je Fach ein Inhalt${KX.devZones(cur,kitchenData().spec).some(z=>z.only)?', ins untere Fach nur Vorräte, Töpfe, Seltenes, Putzmittel':''} – erst einen anderen abwählen.`); return; }
    edit(t=>{ const st=new Set(t.store||[]); st.has(k)?st.delete(k):st.add(k); if(st.size) t.store=[...st]; else delete t.store; }); });
  num('kR',-360,360,(t,v)=>{ t.rot=((v%360)+360)%360; });
  if($('kR90')) $('kR90').onclick=()=>edit(t=>{ t.rot=(Math.round(t.rot||0)+90)%360; });
  if($('kR180')) $('kR180').onclick=()=>edit(t=>{ t.rot=((t.rot||0)+180)%360; });
  if($('kBar')) $('kBar').onchange=()=>edit(t=>{ const v=+$('kBar').value; if(v>0) t.bar=v; else delete t.bar; });
  const rs=$('kRs');
  if(rs){
    // Live drehen ohne Panel-Neubau (der risse den Schieber mitten im Ziehen
    // weg) und mit einem Rückgängig-Schritt je Geste.
    const ptr=e=>{ KS.rotPtr = e.type!=='pointerup'; KS.rotAlt=e.altKey; };
    rs.onpointerdown=ptr; rs.onpointermove=e=>{ if(KS.rotPtr) KS.rotAlt=e.altKey; }; rs.onpointerup=ptr;
    rs.oninput=()=>{ const cur=selItem(); if(!cur) return;
      if(KS.rotDrag!==cur.id){ snapshot(); KS.rotDrag=cur.id; }
      let v=+rs.value, how=null;
      if(KS.rotPtr && !KS.rotAlt){ const sn=KX.snapRot(kctx().E, v); v=sn.rot; how=sn.how; }
      cur.rot=v; if($('kR')) $('kR').value=String(Math.round(v*10)/10).replace('.',',');
      setHintLive(`Drehung ${String(Math.round(v*10)/10).replace('.',',')}°${how?` · eingerastet: ${how}`:''} · ⌥ frei`);
      KS.ctxKey=''; redraw(); };
    // Pfeile am Regler: die Taste verbraucht er selbst (1°), jede Wiederholung löst input und change aus.
    // Wie bei den Pfeilen auf dem Plan: eine gehaltene Taste ist ein Rückgängig-Schritt und wird einmal beim
    // Loslassen gespeichert (nudgeSave), nicht je Wiederholung samt Panel-Neubau.
    // Nur Tasten, die der Regler selbst verbraucht (Pfeile, Pos1/Ende, Bild auf/ab), und nicht während die Maus
    // zieht: ⌥ (frei drehen) oder eine andere Taste darf die Geste weder spalten noch mit der nächsten verschmelzen.
    const own=e=>KX.controlOwnsKey(e.key,'INPUT','range');
    rs.onkeydown=e=>{
      if(own(e)){ if(!KS.rotPtr) KS.rotKey=true; return; }
      // ⌘Z / ⌘⇧Z / Strg+Y mitten im Halten springen im Verlauf: das beendet die Geste, die nächste Drehung bekommt
      // wieder einen eigenen Schnappschuss (sonst fehlte ihr Rückgängig-Schritt und Wiederholen träfe den alten Winkel).
      if((e.ctrlKey || e.metaKey) && /^[zy]$/i.test(e.key)){ KS.rotKey=false; KS.rotDrag=null; } };
    rs.onkeyup=e=>{ if(!own(e)) return;
      KS.rotKey=false; KS.rotDrag=null;
      if(!nudgeSave.pending) kitchenSave(); };      // Ruhe-Timer schon durch (Taste über 400 ms ohne Wiederholung): Speicher und Panel nachziehen
    // Fokus weg (Tab, Klick, Fenster) vor dem Loslassen: war der Ruhe-Timer schon durch, kommt kein keyup mehr an den Regler,
    // also hier Speicher und Panel nachziehen (läuft der Timer noch, erledigt er es).
    rs.onblur=()=>{ const had=KS.rotDrag; KS.rotKey=false; KS.rotDrag=null;
      if(had!=null && !KS.rotPtr && !nudgeSave.pending) kitchenSave(); };
    rs.onchange=()=>{
      if(KS.rotKey && !KS.rotPtr){ KS.ctxKey=''; nudgeSave.mark(); return; }
      KS.rotDrag=null; KS.rotPtr=false; kitchenSave(); };
  }
  if($('kStd')) $('kStd').onclick=()=>edit(t=>{ delete t.d; delete t.h; delete t.z; });
  $('kDup').onclick=()=>{ const t=selItem(); if(t) duplicate(t); };
  $('kDel').onclick=()=>{ const t=selItem(); if(t) removeItem(t); };
  if(fid && $(fid)){ $(fid).focus(); if($(fid).select) $(fid).select(); }
}
// Bauart wechseln (unten / hängend / hoch): Maße auf den Standard der neuen
// Bauart, Front und Inhalte auf das, was dort geht, und an der Wand neu
// einrasten - möglichst an derselben Stelle (Hängeschrank über dem
// Unterschrank darf, ein Hochschrank daneben nicht). Eckschränke nehmen
// Korpus und Tür der neuen Lage (nobilia UE/WE) und rücken in die Ecke.
function switchKind(t, kind){
  const c=kctx(); if(!c || !KX.KIND[kind] || KX.KIND[kind].free) return;
  const was=nm(t);
  t.kind=kind; delete t.d; delete t.h; delete t.z;
  if(t.dev && !KX.DEV[t.dev].kinds.includes(kind)) delete t.dev;
  if(kind==='wall' && (t.front==='drawer' || !t.front)) t.front='door';
  if(kind==='tall' && t.front==='drawer') t.front='door';
  if(kind!=='wall' && t.front==='flap') t.front = kind==='base' ? 'drawer' : 'door';
  if(t.corner){
    const C=KX.CORNER[kind]; if(!C) KX.clearCorner(t);
    else {
      if(t.ctype){ const sh=KX.CSHAPE[kind][t.ctype]; if(sh){ t.w=sh.def; } else delete t.ctype; }
      if(!t.ctype){ t.w = kind==='wall' ? 782 : 1000; if(kind==='wall') t.door=350; else delete t.door; }
      const inn = t.ctype ? KX.CSHAPE[kind][t.ctype].inner : C.inner; if(t.inner && !inn[t.inner]) delete t.inner;
    }
  }
  const had=(t.store||[]).length;
  if(t.store){ t.store=t.store.filter(x=>KX.storable(t,c.K.spec).includes(x)); if(!t.store.length) delete t.store; }
  const lost=had-(t.store||[]).length;
  const Wf=KX.wallFrame(c.E,t.a,t.b);
  if(Wf){
    let x=KX.freeSlot(c.E,c.K,c.L,t,Wf,t.x);
    if(t.corner){ const xc=KX.cornerPlace(c.E,c.K,c.L,{...t, x:x!=null?x:t.x},Wf); if(xc!=null) x=xc; }
    if(x!=null) t.x=x;
  }
  setHint(`${was} → ${nm(t)}${wallTxt(t)}${lost?` · ${lost} Inhalt${lost>1?'e':''} entfernt – passt hier nicht hinein`:''}`);
}
// ---------- Eckschrank-Konfigurator (Meldung M-20261109-134919-c2a193) ----------
// Eigener Kasten über den übrigen Feldern, für Unter- und Hängeschränke an
// der Wand: Ecke, Korpus, Tür (nobilia-Typen oder „passend“), Innenleben.
// Jede Änderung setzt den Schrank neu an die Ecke: Blende hinter die
// Querzeile, Tür davor frei.
function cornerEdit(fn, msg){
  const c=kctx(), cur=selItem(); if(!c || !cur) return;
  snapshot(); fn(cur);
  const Wf=KX.wallFrame(c.E,cur.a,cur.b), x=Wf ? KX.cornerPlace(c.E,c.K,c.L,cur,Wf) : null;
  if(x!=null) cur.x=x;
  kitchenSave();
  setHint(x!=null ? (msg||'Eckschrank an die Ecke gesetzt') : 'So passt der Eckschrank nicht an die Ecke – Lage bleibt, Prüfung zeigt warum.');
}
// Eigene Segment-Attribute: renderSel verdrahtet alle [data-seg] im Auswahlkasten.
const cseg=(name, opts, cur)=>`<div class="seg" data-cseg="${name}">${opts.map(([v,l])=>`<button data-v="${v}" aria-pressed="${String(v===cur)}">${l}</button>`).join('')}</div>`;
function renderCorner(c){
  const box=$('kCorner'), it=selItem(), g=it && c.L.byId.get(it.id), C=it && KX.CORNER[it.kind];
  // Angeboten an Schränken nahe einer Ecke mit Querzeile; Eckschränke immer.
  // (die Querzeile steht vor seiner Front: Abstand zur Ecke < ihre Tiefe + Passblende)
  const nearCorner=()=>[true,false].some(a=>{ const cr=KX.crossAt(c.E,c.K,c.L.G,g,a); return cr && (a ? g.s0 : g.Wf.L-g.s1) < cr.d+50; });
  const can = !!(g && !g.free && C && (it.corner || !(it.dev && !(it.kind==='base' && it.dev==='sink')) && nearCorner()));
  if(!can){ box.hidden=true; box.innerHTML=''; box.dataset.key=''; return; }
  const key=KX.cornerBoxKey(it, c.key, VIEW.rot);                      // mit Ansichtsdrehung (wallEnds)
  if(box.dataset.key===key && !box.hidden) return;
  box.dataset.key=key; box.hidden=false;
  const nmC = it.kind==='wall' ? 'Eckhängeschrank' : 'Eckschrank';
  if(!it.corner){
    box.innerHTML=`<div class="kchead"><b>Ecke</b><button id="kCnOn" title="Halbeckschrank: Blende hinter der Querzeile, Tür auf dem freien Teil">Als ${nmC}</button></div>`;
    $('kCnOn').onclick=()=>cornerEdit(t=>{ t.corner=true; t.front='door'; delete t.door; delete t.hinge;
      if(!C.bodies.includes(Math.round(t.w))) t.w = t.kind==='wall' ? 782 : 1000; }, `Als ${nmC} an die Ecke gesetzt`);
    return;
  }
  const cb=KX.cornerBlind(g, c.K.spec), atS0=cb ? cb.atS0 : it.cEnd!=null ? it.cEnd===0 : g.s0<=g.Wf.L-g.s1;
  const SH=KX.CSHAPE[it.kind], sh=it.ctype ? SH[it.ctype] : null, INN=sh ? sh.inner : C.inner;
  const body=Math.round(it.w), doors=C.doors[body]||[];
  const typ=KX.cornerType(it), dist=atS0 ? g.s0 : g.Wf.L-g.s1, we=wallEnds(g.Wf), cid=atS0 ? we.a : we.b;
  const shLabel={halb:'Halbeck', L:'Über Eck', diag:'Diagonal'};
  let h=`<div class="kchead"><b>${nmC}</b><small>${typ?`nobilia ${typ}`:shLabel[it.ctype||'halb']}</small></div>`
    +`<div class="krow"><label title="Halbeck: Blende hinter der Querzeile · Über Eck: L-Korpus mit zwei Türen (Karussell möglich) · Diagonal: eine Tür auf der Schräge">Bauart</label>${cseg('cShape', Object.entries(shLabel), it.ctype||'halb')}</div>`
    +`<div class="krow"><label title="Ecke, wie der Plan liegt">Ecke</label>${cseg('cEnd', we.aFirst ? [['0',we.a],['1',we.b]] : [['1',we.b],['0',we.a]], atS0?'0':'1')}</div>`;
  if(sh){
    const lOpts=sh.legs.map(v=>[String(v), cmTxt(v)]); if(!sh.legs.includes(body)) lOpts.push([String(body), cmTxt(body)]);
    h+=`<div class="krow"><label title="Schenkellänge an beiden Wänden">Schenkel</label>${cseg('cLeg', lOpts, String(body))} cm</div>`;
  } else {
    const bOpts=C.bodies.map(v=>[String(v), String((C.nominal||{})[v] || cmTxt(v))]); if(!C.bodies.includes(body)) bOpts.push([String(body), cmTxt(body)]);
    const dCur = it.door==null ? 'auto' : String(Math.round(it.door));
    const dOpts=[['auto','passend'], ...doors.map(v=>[String(v), cmTxt(v)])]; if(it.door!=null && !doors.includes(Math.round(it.door))) dOpts.push([dCur, cmTxt(it.door)]);
    h+=`<div class="krow"><label title="Korpusbreite">Korpus</label>${cseg('cBody', bOpts, String(body))} cm</div>`
      +`<div class="krow"><label title="Türbreite – der Rest ist Blende hinter der Querzeile">Tür</label>${cseg('cDoor', dOpts, dCur)} cm</div>`;
  }
  if(Object.keys(INN).length>1) h+=`<div class="krow"><label>Innen</label><select id="kCnInner">${Object.entries(INN).map(([k,l])=>`<option value="${k}"${(it.inner||'boden')===k?' selected':''}>${l}</option>`).join('')}</select></div>`;
  if(sh) h+= g.wingG ? `<p class="knote">${cmTxt(body)} × ${cmTxt(body)} cm in der Ecke ${cid}, Tiefe ${Math.round(g.d)} mm · ${it.ctype==='diag'?`Tür ${Math.round(KX.envelopes(c.K,g)[0]?.r||0)} mm auf der Schräge`:'zwei Türen im Eckfeld'}</p>`
                     : `<p class="knote">Steht nicht bündig in einer rechtwinkligen Innenecke – „An die Ecke setzen“.</p>`;
  else h+= cb ? `<p class="knote">Blende ${cmTxt(cb.b)} cm zur Ecke ${cid}, Tür ${cmTxt(it.w-cb.b)} cm${g.cross?` · Querzeile ${Math.round(g.cross.d)} mm tief`:' · noch keine Querzeile'} · ${dist>0.5?`${Math.round(dist)} mm Abstand zur Ecke`:'bündig in der Ecke'}</p>`
         : `<p class="knote">Zu schmal für Blende und Tür.</p>`;
  h+=`<div class="trow"><button id="kCnPlace" title="${sh?'Bündig in die Ecke':'Blende hinter die Querzeile, Tür davor frei'}">An die Ecke setzen</button><button id="kCnOff">Normaler Schrank</button></div>`;
  box.innerHTML=h;
  box.querySelectorAll('[data-cseg]').forEach(sg=>sg.querySelectorAll('button').forEach(b=>b.onclick=()=>{
    const v=b.dataset.v, k=sg.dataset.cseg;
    if(k==='cShape') cornerEdit(t=>{ if(t.cEnd==null) t.cEnd=atS0?0:1;
      if(v==='halb'){ delete t.ctype; delete t.inner; if(!C.bodies.includes(Math.round(t.w))) t.w = t.kind==='wall' ? 782 : 1000; }
      else { const s2=SH[v]; t.ctype=v; delete t.door; if(!s2.legs.includes(Math.round(t.w))) t.w=s2.def; if(t.inner && !s2.inner[t.inner]) delete t.inner; if(v==='diag' && !t.hinge) t.hinge='left'; } },
      `Bauart: ${shLabel[v]}`);
    if(k==='cEnd') cornerEdit(t=>{ t.cEnd=+v; }, `Eckschrank in die Ecke ${+v===0?we.a:we.b}`);
    if(k==='cLeg') cornerEdit(t=>{ t.w=+v; });
    if(k==='cBody') cornerEdit(t=>{ t.w=+v; const ds=C.doors[+v]||[]; if(t.door!=null && !ds.includes(Math.round(t.door))) { if(ds.length) t.door=ds[ds.length-1]; else delete t.door; } });
    if(k==='cDoor') cornerEdit(t=>{ if(v==='auto') delete t.door; else t.door=+v; });
  }));
  if($('kCnInner')) $('kCnInner').onchange=()=>{ const v=$('kCnInner').value; cornerEdit(t=>{ if(v==='boden') delete t.inner; else t.inner=v; }, `Innen: ${INN[v]}`); };
  $('kCnPlace').onclick=()=>cornerEdit(t=>{ if(t.cEnd==null) t.cEnd=atS0?0:1; });
  $('kCnOff').onclick=()=>{ const t=selItem(); if(!t) return; snapshot(); KX.clearCorner(t); kitchenSave(); setHint('Wieder ein normaler Schrank.'); };
}
function renderChecks(c){
  const F=c.F, nb=F.filter(f=>f.lvl==='bad').length, nw=F.filter(f=>f.lvl==='warn').length;
  $('kCheckCount').textContent = [nb?`${nb} geht nicht`:'', nw?`${nw} Hinweis${nw>1?'e':''}`:''].filter(Boolean).join(' · ');
  const key=KX.checksKey(F, KS.sel);          // mit ids und Abhilfe: die Handler unten schließen F ein
  if($('kChecks').dataset.key===key) return;
  $('kChecks').dataset.key=key;
  if(!c.K.items.length){ $('kChecks').innerHTML=''; return; }
  const real=F.filter(f=>f.lvl!=='info');
  $('kChecks').innerHTML = (real.length ? '' : `<p class="tnote">Nichts stößt an: Fronten, Gerätetüren, Fenster und Türen sind frei, die Richtwerte (Gänge, Abstellflächen, Arbeitsdreieck) eingehalten.</p>`)
    + F.map((f,i)=>`<div class="kfrow"><button class="kfind ${f.lvl}" data-i="${i}"${f.ids.includes(KS.sel)?' aria-current="true"':''}><i></i><span>${escapeHtml(f.txt)}</span></button>${f.fix?`<button class="kfix" data-fix="${i}">${escapeHtml(f.fix.label)}</button>`:''}</div>`).join('');
  $('kChecks').querySelectorAll('.kfind').forEach(b=>b.onclick=()=>{ const f=F[+b.dataset.i]; if(f.ids.length){ KS.sel=f.ids[0]; render(); } });
  // Abhilfe mit einem Klick: setzt die genannten Felder am Teil.
  $('kChecks').querySelectorAll('.kfix').forEach(b=>b.onclick=()=>{ const f=F[+b.dataset.fix], it=kitchenData().items.find(x=>x.id===f.fix.id); if(!it) return;
    const changes=Object.entries(f.fix.set).some(([k,v])=>it[k]!==v) || (f.fix.del||[]).some(k=>k in it);
    if(!changes){ setHint('Schon so eingestellt.'); return; }
    snapshot(); Object.assign(it, f.fix.set); (f.fix.del||[]).forEach(k=>delete it[k]); KS.sel=it.id; kitchenSave(); setHint(`${f.fix.label}: geändert · ⌘Z nimmt es zurück`); });
}
function renderWays(c){
  const box=$('kWays');
  if(!c.K.items.length){ box.innerHTML=''; $('kWaySum').textContent=''; $('kSugg').innerHTML=''; return; }
  const R=flowRes(c);
  $('kWaySum').textContent=`≈ ${R.kmYear.toFixed(1).replace('.',',')} km/Jahr · ${R.complete} von ${R.flows.length} Abläufen`;
  const doors=KX.entries(c.E);
  const key=JSON.stringify([c.key, KS.flow, KS.paths]);
  if(box.dataset.key===key) return;
  box.dataset.key=key;
  let h='';
  if(doors.length>1) h+=`<div class="krow" title="Die Nummer steht im Plan an der Tür; ein Klick auf die Tür im Plan wählt sie auch."><label>Eingang</label><select id="kEntry">${KX.entryOptions(doors, c.K.spec.entry)}</select></div>`;
  else if(!doors.length) h+=`<p class="tnote">Ohne Tür gibt es keinen Eingang: Einkauf und Müll fehlen. Tür im Modus Wände setzen.</p>`;
  Object.entries(KX.GROUPS).forEach(([gk,gl])=>{
    h+=`<div class="kflowgrp"><b style="color:${KINK.grp[gk]}">${gl}</b>`;
    R.flows.filter(f=>f.group===gk).forEach(f=>{
      const miss=f.missing.length ? ` <em>fehlt: ${escapeHtml(KX.roleList(f.missing))}</em>` : '';
      const blk=f.blocked ? ` <em class="bad">${f.blocked} Weg${f.blocked>1?'e':''} gesperrt</em>` : '';
      const top=R.flows.filter(x=>x.complete).reduce((a,x)=>!a||x.week>a.week?x:a,null);
      const val = f.complete ? `${f.f}× · ${(f.m/1000).toFixed(1).replace('.',',')} m` : '–';
      h+=`<button class="kflow" data-flow="${f.key}" aria-pressed="${KS.flow===f.key}"${f.complete?'':' disabled'}><span>${top===f?'<b>':''}${escapeHtml(f.label)}${top===f?'</b>':''}${miss}${blk}</span><small title="${f.complete?Math.round(f.week/1000)+' m je Woche':'zählt erst, wenn alle Stationen da sind'}">${val}</small></button>`;
    });
    h+=`</div>`;
  });
  h+=`<p class="tnote">Je Ablauf: wie oft pro Woche × Weg. Häufigkeiten sind eine Annahme für 4 Personen; aussagekräftig ist der Vergleich vorher/nachher. Wege um Schränke, Insel und Tisch, mit 30 cm Abstand für den Körper.</p>`;
  box.innerHTML=h;
  box.querySelectorAll('.kflow').forEach(b=>b.onclick=()=>{ KS.flow = KS.flow===b.dataset.flow ? null : b.dataset.flow; if(!KS.paths){ KS.paths=true; lsSet('raumaufmass.kwege','1'); syncToggles(); } render(); });
  if($('kEntry')) $('kEntry').onchange=()=>{ snapshot(); c.K.spec.entry=$('kEntry').value; kitchenSave(); };
  // Umsortieren
  if(KS.suggKey!==c.key){ KS.suggKey=c.key; try{ KS.sugg=KX.suggest(c.E,c.K,c.L,3); }catch(err){ KS.sugg=[]; console.warn(err); } }
  const S=KS.sugg||[];
  if(KS.hl && !S.includes(KS.hl)) KS.hl=null;
  // Eindeutig benennen: Wand und Lage ab der ersten Ecke (m).
  const nmId=id=>{ const it=c.K.items.find(x=>x.id===id); if(!it) return '?';
    return nm(it); };
  const km=v=>v.toFixed(1).replace('.',',');
  const places=S.filter(s=>s.place), moves=S.filter(s=>!s.place);
  let hs='';
  // Optimal einräumen (Meldung M-20261109-150126-3b7705): exakt, deterministisch.
  if(KS.optKey!==c.key){ KS.optKey=c.key; try{ KS.opt=KX.optimalStore(c.E,c.K,c.L); }catch(err){ KS.opt=null; console.warn(err); } }
  const O=KS.opt;
  if(O){
    const lines=Object.entries(O.assign).filter(([,ids])=>ids.length).map(([k,ids])=>`<li>${escapeHtml(KX.ROLE_LABEL[k])}: ${ids.map(id=>escapeHtml(nmId(id))).join(' und ')}</li>`).join('');
    const dup=O.fixed.length ? ` Doppelt Eingeräumtes (${O.fixed.map(k=>escapeHtml(KX.ROLE_LABEL[k])).join(' · ')}) bleibt, wie es ist.` : '';
    const gain = O.completeAfter>O.completeBefore ? ` Danach sind ${O.completeAfter} statt ${O.completeBefore} Abläufe vollständig.`
      : O.placedAfter>O.placedBefore ? ` Räumt ${O.placedAfter-O.placedBefore} Inhalt${O.placedAfter-O.placedBefore>1?'e':''} ein, die noch keinen Platz haben.`
      : O.violationsAfter.length<O.violations.length ? ' Räumt um, was gegen die Regeln liegt.'
      : O.kmAfter<O.kmBefore-0.05 ? ` ≈ ${km(O.kmBefore)} → ${km(O.kmAfter)} km/Jahr.` : ' Wege etwa gleich, aber besser greifbar.';
    // Regelverstöße der jetzigen Belegung nennen; was mangels Platz so bleibt
    // (kept), ebenso - Optimal einräumen nimmt nie etwas heraus. Listen mit
    // „ · “ wie planLabels: Inhaltsnamen enthalten selbst Kommas („Messer, Bretter“).
    const WHY={nicht:'gehört dort nicht hin', schublade:'braucht eine Schublade', fach:'passt nicht in dieses Fach'};
    const lbl=k=>escapeHtml(KX.ROLE_LABEL[k]), capOf=id=>{ const it=c.K.items.find(x=>x.id===id); return it ? KX.storeCap(it,c.K.spec) : 0; };
    const viol=O.violations.map(v=>v.c ? `${lbl(v.c)} in ${escapeHtml(nmId(v.id))} (${WHY[v.why]})`
      : `${escapeHtml(nmId(v.id))} ${v.why==='voll' ? `zu voll (höchstens ${capOf(v.id)})` : '– Fächer passen nicht'}`).join(' · ');
    const stay=[...O.kept.map(x=>x.c), ...O.dropped];
    if(O.same || !O.better) hs+=`<p class="tnote">${O.kept.length ? 'Optimal eingeräumt, soweit die Schränke es zulassen.' : 'Optimal eingeräumt – keine Einteilung hat kürzere Wege.'}${dup}</p>`;
    else hs+=`<div class="ksugghead"><b>Optimal einräumen</b><button id="kOpt" class="primary">Einräumen</button></div>`
      +`<p class="tnote">Jeder Inhalt dorthin, wo die Wege aller Abläufe zusammen am kürzesten sind.${gain} Gerechnet, nicht geschätzt: dieselbe Küche ergibt immer dieselbe Einteilung. Besteck und Messer in Schubladen, Töpfe unten, Müll und Putzmittel an der Spüle, Seltenes in die schlechter greifbaren Fächer.${dup}</p>`
      +`<details class="kopt"><summary>Einteilung ansehen</summary><ul>${lines}</ul></details>`;
    if(O.violations.length) hs+=`<p class="tnote">Gegen die Regeln eingeräumt: ${viol}.${stay.length ? ` Bleibt, wo es ist, weil kein passender Platz frei ist: ${stay.map(lbl).join(' · ')}. Weitere Schränke setzen.` : ''}</p>`;
    const fresh=O.unplaced.filter(k=>!O.dropped.includes(k));
    if(fresh.length) hs+=`<p class="tnote">Kein passender Schrank frei für: ${fresh.map(lbl).join(' · ')}${fresh.length>1?' (Häufiges geht vor)':''}.</p>`;
  }
  if(S.length){
    hs+=`<div class="ksugghead"><b>${places.length?'Einräumen und umsortieren':'Umsortieren'}</b><button id="kSuggAll" class="primary">Alles übernehmen</button></div>`;
    if(moves.length && S.kmAfter<S.kmPlaced-0.05) hs+=`<p class="tnote">${places.length?'Nach dem Einräumen ':''}≈ ${km(S.kmPlaced)} → ${km(S.kmAfter)} km/Jahr (−${Math.round((1-S.kmAfter/S.kmPlaced)*100)} %)</p>`;
    else if(moves.length && S.kmAfter>S.kmPlaced+0.05) hs+=`<p class="tnote">Spart erst, wenn alle Abläufe vollständig sind (z. B. Tisch, Eingang); jetzt ≈ ${km(S.kmPlaced)} → ${km(S.kmAfter)} km/Jahr.</p>`;
    else if(moves.length && S.reachDelta<-0.05) hs+=`<p class="tnote">Wege etwa gleich, aber besser greifbar.</p>`;
    const firstOf=new Map(); S.forEach((s,i)=>{ if(!firstOf.has(s.grp)) firstOf.set(s.grp,i); });
    hs+=S.map((s,i)=>{ const n=S.filter(x=>x.grp===s.grp).length, lead=firstOf.get(s.grp)===i;
      return `<div class="ksugg${lead?'':' kdep'}"><span>${lead?'':'dazu: '}<b>${escapeHtml(KX.ROLE_LABEL[s.c])}</b> ${s.place?`einräumen: ${escapeHtml(nmId(s.to))}`:`von ${escapeHtml(nmId(s.from))} nach ${escapeHtml(nmId(s.to))}`}</span>${lead?`<button data-sg="${i}">${n>1?`Übernehmen (${n})`:'Übernehmen'}</button>`:''}</div>`; }).join('');
  }
  if(S.unplaced && S.unplaced.length) hs+=`<p class="tnote">Kein passender Schrank frei für: ${S.unplaced.map(k=>escapeHtml(KX.ROLE_LABEL[k])).join(' · ')}${S.unplaced.some(k=>k==='besteck'||k==='messer')?' (Besteck und Messer brauchen eine Schublade)':''}. Weitere Schränke setzen.</p>`;
  $('kSugg').innerHTML=hs;
  // Überfahren zeigt den Umzug als Pfeil im Plan.
  $('kSugg').querySelectorAll('.ksugg').forEach((row,i)=>{
    row.onmouseenter=()=>{ KS.hl=S[i]; redraw(); };
    row.onmouseleave=()=>{ KS.hl=null; redraw(); };
  });
  const apply=list=>{ KS.hl=null; snapshot();
    const items=kitchenData().items, take=(k,from)=>items.forEach(it=>{ if(it.id===from && it.store){ it.store=it.store.filter(x=>x!==k); if(!it.store.length) delete it.store; } }),
      put=(k,to)=>{ const t=items.find(it=>it.id===to); if(t) t.store=[...new Set([...(t.store||[]),k])]; };
    // Netto-Umzüge: erst alle herausnehmen, dann einräumen (Tausch geht so auf).
    list.forEach(s=>{ if(s.from!=null) take(s.c,s.from); });
    list.forEach(s=>put(s.c,s.to));
    kitchenSave(); setHint(KX.undoHint(`${KX.roleList(list.map(s=>s.c))} ${list.length>1?'eingeräumt/umgeräumt':'übernommen'}`)); };
  $('kSugg').querySelectorAll('[data-sg]').forEach(b=>b.onclick=()=>{ const g=S[+b.dataset.sg].grp; apply(S.filter(x=>x.grp===g)); });
  if($('kSuggAll')) $('kSuggAll').onclick=()=>apply(S);
  if($('kOpt')) $('kOpt').onclick=()=>{ KS.hl=null; snapshot();
    // Nur umräumen, was einen neuen Platz hat: nichts Eingeräumtes geht verloren.
    const items=kitchenData().items, keys=new Set(Object.keys(O.assign).filter(k=>O.assign[k].length));
    items.forEach(it=>{ if(it.store){ it.store=it.store.filter(k=>!keys.has(k)); if(!it.store.length) delete it.store; } });
    Object.entries(O.assign).forEach(([k,ids])=>ids.forEach(id=>{ const t=items.find(it=>it.id===id); if(t) t.store=[...(t.store||[]),k]; }));
    const st=[...O.kept.map(x=>x.c), ...O.dropped].map(k=>KX.ROLE_LABEL[k]);
    kitchenSave(); setHint(KX.undoHint(`Optimal eingeräumt: ≈ ${km(O.kmAfter)} km/Jahr${st.length?` · bleibt gegen die Regel: ${st.join(' · ')}`:''}`)); };
}
// ---------- Wege-Analyse (Meldungen M-20261109-151457-68b975, -151540-54f941) ----------
// Eigene Ansicht statt 3D: wenig Text, viel Information. Oben die Summe
// (mit Referenz zum Vergleichen), darunter die Abläufe als Balken gegen-
// einander, die Stationen als Matrix (was gesetzt ist, was fehlt), die
// Kurve „gewähltes Teil verschieben“ mit exaktem Optimum und Tausch, und
// zu zweit die Begegnungen. Die Heatmap liegt im Plan links.
const FSHORT={einkauf:'Einkauf', muellraus:'Müll raus', kochen:'Kochen', servieren:'Servieren', decken:'Tisch decken', abraeumen:'Abräumen', ausraeumen:'Ausräumen', kaffee:'Getränke', snack:'Snack'};
const fmtKm=v=>v.toFixed(1).replace('.',',');
const fmtD=v=>(v>0?'+':v<0?'−':'±')+Math.abs(v).toFixed(1).replace('.',',');
function anaHeat(c){
  const R=flowRes(c);
  if(KS.heatKey!==c.key){ KS.heatKey=c.key; KS.heatG=KX.heatGrid(c.E,R); KS.kidR=null; KS.confl=null; }
  return KS.heatG;
}
function anaKid(c){
  const H=anaHeat(c); if(!KS.kid || !H.peak) return null;
  if(!KS.kidR){ const P=KX.kidPoly(H.peak); KS.kidR={poly:P, p:H.peak, R:KX.flows(c.E,c.K,c.L,{planner:KX.planner(c.E,c.L,[P])})}; }
  return KS.kidR;
}
function anaConfl(c){ anaHeat(c); if(!KS.confl) KS.confl=KX.conflicts(flowRes(c)); return KS.confl; }
// Kurve fürs gewählte Teil: nach dem Ziehen und gedrosselt rechnen (je Lage
// ein voller Durchlauf, ≈ 4 ms).
function anaSweep(c){
  const it=selItem(); if(!it || it.corner || KX.fzOf(it)&&false) return null;
  const key=c.key+'|'+it.id+'|'+(KS.kid?1:0);
  if(KS.swKey===key) return KS.sw;
  if(KS.drag) return null;
  clearTimeout(KS.swT);
  KS.swT=setTimeout(()=>{ const cc=kctx(); if(!cc) return; const cur=selItem(); if(!cur) return;
    const k2=cc.key+'|'+cur.id+'|'+(KS.kid?1:0); if(KS.swKey===k2) return;
    const kid=anaKid(cc);
    try{ KS.sw=KX.sweep(cc.E,cc.K,cc.L,cur.id, kid?{extra:[kid.poly]}:{}); }catch(err){ KS.sw=null; console.warn(err); }
    KS.swKey=k2; KS.anaKey=''; render(); }, 120);
  return 'pending';
}
// cssW: Breite des Analysebereichs in CSS-px; viewBox = diese Breite, damit
// die Achsenschrift wirklich ≥ 11 px hat (KX.chartBox). pl/pr fest, die
// Zeigerlogik unten rechnet mit 44 und 56.
function sweepSvg(ax, unit, from, cssW){
  const {W, fs}=KX.chartBox(cssW), H=150, pl=44, pr=12, pt=10, pb=26;
  const P=ax.pts; if(P.length<2) return '';
  const xs=P.map(p=>p.v), ys=P.map(p=>p.km);
  let x0=Math.min(...xs), x1=Math.max(...xs), y0=Math.min(...ys), y1=Math.max(...ys);
  if(y1-y0<0.2){ const m=(y0+y1)/2; y0=m-0.1; y1=m+0.1; }
  const pad=(y1-y0)*0.12; y0-=pad; y1+=pad;
  const X=v=>pl+(v-x0)/(x1-x0||1)*(W-pl-pr), Y=v=>pt+(1-(v-y0)/(y1-y0))*(H-pt-pb);
  // Saubere Ticks
  const tick=(a,b,n)=>{ const r=(b-a)/n, m=Math.pow(10,Math.floor(Math.log10(r))), st=[1,2,5,10].map(k=>k*m).find(k=>k>=r)||r; const out=[]; for(let v=Math.ceil(a/st)*st; v<=b+1e-9; v+=st) out.push(+v.toFixed(6)); return out; };
  let g='';
  tick(y0,y1,3).forEach(v=>{ g+=`<line x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e7e3d8" stroke-width="1"/><text x="${pl-6}" y="${Y(v)+3.5}" text-anchor="end" font-size="${fs}" fill="#6f6a5e">${String(+v.toFixed(2)).replace('.',',')}</text>`; });
  tick(x0,x1,5).forEach(v=>{ g+=`<text x="${X(v)}" y="${H-8}" text-anchor="middle" font-size="${fs}" fill="#6f6a5e">${unit(v)}</text>`; });
  // Lücken (gesperrte Lagen) unterbrechen die Linie; Rasterschritt aus KX.sweepGaps
  // (nicht der kleinste Abstand: die jetzige Lage liegt meist neben dem Raster).
  const br=KX.sweepGaps(P, ax.cur);
  let d=''; P.forEach((p,i)=>{ d+=(i&&!br[i]?'L':'M')+X(p.v).toFixed(1)+' '+Y(p.km).toFixed(1); });
  g+=`<path d="${d}" fill="none" stroke="#24221d" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  // Lagen, die etwas verschlechtern (Weg gesperrt, neuer Befund): hohler Ring.
  P.filter(p=>!p.ok).forEach(p=>{ g+=`<circle cx="${X(p.v)}" cy="${Y(p.km)}" r="3.5" fill="#faf9f6" stroke="#b3261e" stroke-width="1.5"><title>${p.blocked?'Weg gesperrt':'neuer Befund in der Prüfung'}</title></circle>`; });
  const cur=P.find(p=>Math.abs(p.v-ax.cur)<1);
  if(cur) g+=`<line x1="${X(cur.v)}" x2="${X(cur.v)}" y1="${pt}" y2="${H-pb}" stroke="#6f6a5e" stroke-width="1"/><circle cx="${X(cur.v)}" cy="${Y(cur.km)}" r="5" fill="#6f6a5e" stroke="#faf9f6" stroke-width="2"/><text x="${X(cur.v)+6}" y="${pt+9}" font-size="${fs}" fill="#4b473e">jetzt</text>`;
  if(ax.best && (!cur || Math.abs(ax.best.v-cur.v)>=1)) g+=`<circle cx="${X(ax.best.v)}" cy="${Y(ax.best.km)}" r="5" fill="#2e7d4f" stroke="#faf9f6" stroke-width="2"/><text x="${X(ax.best.v)}" y="${Y(ax.best.km)+16}" text-anchor="middle" font-size="${fs}" fill="#24221d">Optimum</text>`;
  g+=`<rect class="ka-hit" x="${pl}" y="${pt}" width="${W-pl-pr}" height="${H-pt-pb}" fill="transparent" style="cursor:crosshair"/><line class="ka-cross" x1="0" x2="0" y1="${pt}" y2="${H-pb}" stroke="#4b473e" stroke-width="1" visibility="hidden"/>`;
  return `<div class="ka-chart" data-ax="${ax.key}" data-from="${from}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(ax.label)}: km pro Jahr je Lage">${g}</svg><div class="ka-tip"></div></div>`;
}
function renderAna(c){
  const box=$('kAna'); if(!box) return;
  if(!KS.ana || M.mode!=='kitchen'){ if(box.innerHTML) box.innerHTML=''; KS.anaKey=''; KS.anaW=null; return; }
  const R=flowRes(c), S=c.K.spec, it=selItem(), sw=anaSweep(c), kid=anaKid(c), persons=S.persons||1;
  // Innenbreite für die Kurven (viewBox = CSS-px); im Schlüssel, damit eine
  // andere Breite die Achsenschrift neu setzt. Gemessen nur einmal und dann per
  // ResizeObserver nachgeführt – nicht bei jedem Render (erzwang sonst nach den
  // innerHTML-Schreibern je Frame ein Layout beim Ziehen und Hovern).
  if(KS.anaW==null || typeof ResizeObserver!=='function'){
    const bs=getComputedStyle(box); KS.anaW=Math.max(0, box.clientWidth-parseFloat(bs.paddingLeft||0)-parseFloat(bs.paddingRight||0));
    if(typeof ResizeObserver==='function' && !box._kaRO){
      box._kaRO=new ResizeObserver(E=>{ const w=E[E.length-1].contentRect.width;
        if(Math.round(w/8)!==Math.round(KS.anaW/8)){ KS.anaW=w; if(KS.ana && M.mode==='kitchen') render(); } });
      box._kaRO.observe(box); } }
  const chartW=KS.anaW;
  const key=JSON.stringify([c.key, KS.sel, KS.anaMode, KS.ref&&KS.ref.kmYear, KS.kid, KS.flow, KS.heat, sw===KS.sw?KS.swKey:String(sw), Math.round(chartW/8)]);
  if(KS.anaKey===key) return;
  KS.anaKey=key;
  const ref=KS.ref;
  // Kopf: Summe, darunter nur, was vom Normalfall abweicht (unvollständig, Referenz, Kind).
  const sub=[R.complete<R.flows.length ? `${R.complete} von ${R.flows.length} Abläufen vollständig` : '',
    ref ? `Referenz ${fmtKm(ref.kmYear)} (${fmtD(R.kmYear-ref.kmYear)})` : '',
    kid ? `mit Kind im Weg ${fmtKm(kid.R.kmYear)} (${fmtD(kid.R.kmYear-R.kmYear)})${kid.R.flows.some(f=>f.blocked)?', Weg gesperrt':''}` : ''].filter(Boolean).join(' · ');
  let h=`<div class="ka-head"><div class="ka-big">${fmtKm(R.kmYear)} <small>km/Jahr</small></div>${sub?`<div class="ka-sub">${sub}</div>`:''}</div>`
    +`<div class="ka-ctl"><span class="ka-grp" title="Annahmen der Rechnung"><label>Personen</label><div class="seg">${[1,2,3].map(n=>`<button data-pers="${n}" aria-pressed="${persons===n}" title="${n===1?'Eine Person kocht':n+' Personen gleichzeitig: Gang nach NKBA mind. 1219 mm, Begegnungen unten'}">${n}</button>`).join('')}</div>`
    +`<button class="tog" data-kid aria-pressed="${KS.kid}" title="Ein Kind steht am meistbelaufenen Punkt (Heatmap-Spitze): wie viel länger werden die Wege, wird einer gesperrt?">Kind im Weg</button></span>`
    +`<span class="ka-grp"><button class="tog" data-heat aria-pressed="${KS.heat}" title="Heatmap im Plan: wo wie oft gelaufen wird">Heatmap <span class="ka-heatlg"></span></button>`
    +(ref?`<button data-ref="0" title="Vergleich beenden">Referenz löschen</button>`:`<button data-ref="1" title="Jetzigen Stand merken; danach zeigen Balken und Summe den Unterschied">Referenz merken</button>`)
    +`</span></div>`;
  // 1. Abläufe im Vergleich
  const mode=KS.anaMode, val=f=>mode==='week' ? f.week*52/1e6 : f.m/1000;
  const rows=R.flows.filter(f=>f.complete).sort((p,q)=>val(q)-val(p) || (p.key<q.key?-1:1));
  const rv=f=>ref && ref.flows[f.key] ? (mode==='week' ? ref.flows[f.key].week*52/1e6 : ref.flows[f.key].m/1000) : null;
  const mx=Math.max(1e-9, ...rows.map(val), ...rows.map(f=>rv(f)||0));
  h+=`<h4>Abläufe im Vergleich <small>${mode==='week'?'km/Jahr (Häufigkeit × Weg)':'Meter je Durchgang'}</small>${seg('anaMode',[['week','je Jahr'],['run','je Durchgang']],mode)}</h4>`;
  if(rows.length){
    h+=`<div class="ka-bars">${rows.map(f=>{ const v=val(f), r=rv(f), on=KS.flow===f.key;
      return `<span class="lb${on?' on':''}" data-fl="${f.key}">${escapeHtml(FSHORT[f.key]||f.label)}</span>`
        +`<span class="tr" data-fl="${f.key}" title="${escapeHtml(f.label)}: ${f.f}× je Woche, ${fmtKm(f.m/1000)} m je Durchgang${f.blocked?' – Weg gesperrt':''}"><span class="br" style="width:${(v/mx*100).toFixed(1)}%;background:${KINK.grp[f.group]};opacity:${KS.flow&&!on?0.35:1}"></span>${r!=null?`<span class="rf" style="left:${(r/mx*100).toFixed(1)}%"></span>`:''}</span>`
        +`<span class="vl">${mode==='week'?fmtKm(v):fmtKm(v)+' m'}${r!=null&&Math.abs(v-r)>=0.05?` <em>${fmtD(v-r)}</em>`:''}</span>`; }).join('')}</div>`
      +`<div class="ka-legend">${Object.entries(KX.GROUPS).map(([k,l])=>`<span><i style="background:${KINK.grp[k]}"></i>${l}</span>`).join('')}${ref?'<span><i style="background:var(--ink);width:2px"></i>Referenz</span>':''}</div>`;
  } else h+=`<p class="ka-note">Noch kein Ablauf vollständig – unten steht, was fehlt.</p>`;
  const St=R.stations, nmId=id=>{ const t=c.K.items.find(x=>x.id===id); return t?nm(t):''; };
  // 2. Verschieben und optimieren
  h+=`<h4 title="Gerechnet, nicht geschätzt: feste Schritte, bei Gleichstand die Lage nächst der jetzigen – dieselbe Küche ergibt immer dasselbe Optimum.">Verschieben und vergleichen${it?` <small>${escapeHtml(nm(it))}</small>`:''}</h4>`;
  if(!it) h+=`<p class="ka-note">Ein Teil im Plan wählen: die Kurve zeigt km/Jahr für jede Lage, an der es Platz hat.</p>`;
  else if(it.corner) h+=`<p class="ka-note">Eckschränke bleiben in ihrer Ecke.</p>`;
  else if(sw==='pending' || !sw) h+=`<p class="ka-note">Rechne …</p>`;
  else {
    sw.axes.forEach(ax=>{
      const unit = ax.key==='wall' ? v=>fmtKm(v/1000).replace(/,0$/,'')+' m' : v=>(v>0?'+':'')+String(+(v/1000).toFixed(1)).replace('.',',')+' m';
      if(ax.pts.length<2) h+=`<p class="ka-note">${escapeHtml(ax.label)}: kein freier Platz zum Schieben${sw.swaps&&sw.swaps.length?' – Tauschen unten':''}.</p>`;
      else h+=`<div class="ka-note">${escapeHtml(ax.label)} · km/Jahr${ax.key==='wall'?' · Lage ab Wandanfang':''}${ax.pts.some(p=>!p.ok)?' · Ringe: dort käme ein Befund dazu oder ein Weg wird versperrt':''}</div>`+sweepSvg(ax, unit, ax.key, chartW);
      const cur=ax.pts.find(p=>Math.abs(p.v-ax.cur)<1), b=ax.best;
      if(b && cur && b.km<cur.km-0.05) h+=`<div class="ka-row"><span>Optimum ${unit(b.v)}: ${fmtKm(b.km)} km/Jahr (${fmtD(b.km-cur.km)})</span><button class="primary" data-opt="${ax.key}">Dorthin setzen</button></div>`;
      else if(ax.pts.length>1) h+=`<div class="ka-row"><span>Liegt schon am kürzesten.</span></div>`;
    });
    const sws=(sw.swaps||[]).filter(x=>x.ok && x.d<-0.05).slice(0,3);
    if(sws.length) h+=sws.map(x=>`<div class="ka-row"><span>Platz tauschen mit ${escapeHtml(nmId(x.with))}: ${fmtKm(x.km)} km/Jahr (${fmtD(x.d)})</span><button data-swap="${x.with}">Tauschen</button></div>`).join('');
    else if(sw.swaps && sw.swaps.length) h+=`<p class="ka-note">Tauschen mit gleich breiten Teilen bringt nichts.</p>`;
    h+=`<p class="ka-note">Das Optimum bringt keinen neuen Befund in der Prüfung und versperrt keinen Weg.${KS.kid?' Mit Kind im Weg gerechnet.':''}</p>`;
  }
  // 3. Zu zweit
  if(persons>=2){
    const C=anaConfl(c).filter(x=>x.ok), cm=Math.max(1,...C.map(x=>x.len));
    h+=`<h4 title="Begegnung: Wegstück, auf dem die andere Person näher als 60 cm läuft. Welche Abläufe gleichzeitig laufen, ist eine Annahme.">Zu zweit in der Küche <small>Meter je Durchgang, auf denen man sich begegnet</small></h4>`;
    h+= C.length ? `<div class="ka-bars">${C.map(x=>`<span class="lb">${escapeHtml(x.label)}</span><span class="tr" title="${escapeHtml(x.label)}: ${fmtKm(x.len/1000)} m je Durchgang im Weg"><span class="br" style="width:${(x.len/cm*100).toFixed(1)}%;background:#c98a1a"></span></span><span class="vl">${fmtKm(x.len/1000)} m</span>`).join('')}</div>`
      +`<p class="ka-note">Im Plan gelb: wo es eng wird. Die Gangbreite zu zweit steht rechts in der Prüfung.</p>`
      : `<p class="ka-note">Erst wenn Kochen und ein zweiter Ablauf vollständig sind.</p>`;
  }
  // 4. Was steht wo – Stationen × Abläufe. Nachschlagen, nicht Ergebnis: zu,
  // solange alles gesetzt ist; offen, sobald etwas fehlt – bis man selbst klickt.
  const roles=[]; KX.FLOWS.forEach(F=>F.chains.flat().forEach(r=>{ if(!roles.includes(r)) roles.push(r); }));
  const order=['eingang','tisch','sink','dw','hob','kuehl','prep'];
  roles.sort((a,b)=>{ const ia=order.indexOf(a), ib=order.indexOf(b); return (ia<0?99:ia)-(ib<0?99:ib) || (KX.ROLE_LABEL[a]||a).localeCompare(KX.ROLE_LABEL[b]||b,'de'); });
  const missN=roles.filter(r=>!(St[r]||[]).length).length;
  const mxOpen=KS.mxOpen ?? missN>0;
  h+=`<details class="ka-mxbox"${mxOpen?' open':''}><summary class="ka-sum">Was steht wo <small>${missN?`${missN} fehlt${missN>1?'en':''}`:'alles gesetzt'} · Inhalte am gewählten Schrank rechts</small></summary>`;
  h+=`<table class="ka-mx"><thead><tr><th></th><th></th>${KX.FLOWS.map(F=>`<th class="v" title="${escapeHtml(F.label)}">${escapeHtml(FSHORT[F.key]||F.label)}</th>`).join('')}</tr></thead><tbody>`
    +roles.map(r=>{ const at=St[r]||[], miss=!at.length;
      const where = miss ? 'fehlt' : r==='eingang' ? 'Tür' : [...new Set(at.map(x=>x.id).filter(x=>x!=null).map(nmId))].join(', ');
      return `<tr><td class="r">${escapeHtml(KX.ROLE_LABEL[r]||r)}</td><td class="w${miss?' miss':''}" title="${escapeHtml(where)}">${escapeHtml(where)}</td>`
        +KX.FLOWS.map(F=>F.chains.flat().includes(r) ? `<td><span class="ka-dot${miss?' miss':''}" title="${escapeHtml(F.label)} braucht ${escapeHtml(KX.ROLE_LABEL[r]||r)}${miss?' – fehlt':''}"></span></td>` : '<td></td>').join('')+'</tr>'; }).join('')
    +`</tbody></table></details>`;
  const st=box.scrollTop;
  box.innerHTML=h; box.scrollTop=st;
  // Verdrahtung
  box.querySelectorAll('[data-pers]').forEach(b=>b.onclick=()=>{ const n=+b.dataset.pers, K=kitchenData(); if((K.spec.persons||1)===n) return; snapshot(); K.spec.persons=n; kitchenSave(); });
  const kb=box.querySelector('[data-kid]'); if(kb) kb.onclick=()=>{ KS.kid=!KS.kid; KS.kidR=null; KS.swKey=''; render(); };
  const hb=box.querySelector('[data-heat]'); if(hb) hb.onclick=()=>{ KS.heat=!KS.heat; render(); };
  const rb=box.querySelector('[data-ref]'); if(rb) rb.onclick=()=>{ KS.ref = rb.dataset.ref==='1' ? {kmYear:R.kmYear, flows:Object.fromEntries(R.flows.map(f=>[f.key,{week:f.week,m:f.m}]))} : null; render(); };
  box.querySelectorAll('[data-seg="anaMode"] button').forEach(b=>b.onclick=()=>{ KS.anaMode=b.dataset.v; render(); });
  // innerHTML baut neu: den Auf/Zu-Zustand selbst merken; das toggle-Ereignis
  // beim Einsetzen mit "open" ist kein Klick und zählt nicht.
  const mxb=box.querySelector('.ka-mxbox'); if(mxb) mxb.ontoggle=()=>{ if(mxb.open!==mxOpen) KS.mxOpen=mxb.open; };
  box.querySelectorAll('[data-fl]').forEach(el=>{
    el.onclick=()=>{ KS.flow = KS.flow===el.dataset.fl ? null : el.dataset.fl; if(!KS.paths){ KS.paths=true; lsSet('raumaufmass.kwege','1'); syncToggles(); } render(); };
    el.onmouseenter=()=>{ if(KS.flow) return; KS.hoverFlow=el.dataset.fl; redraw(); };
    el.onmouseleave=()=>{ KS.hoverFlow=null; redraw(); }; });
  const moveTo=(ax,p)=>{ const t=selItem(); if(!t) return; snapshot();
    if(ax.key==='wall') t.x=p.v; else { const o=p.v-ax.cur; t.x+=ax.dir.x*o; t.y+=ax.dir.y*o; }
    kitchenSave(); setHint(`${nm(t)} verschoben · ${fmtKm(p.km)} km/Jahr · ⌘Z nimmt es zurück`); };
  box.querySelectorAll('[data-opt]').forEach(b=>b.onclick=()=>{ const ax=KS.sw&&KS.sw.axes.find(a=>a.key===b.dataset.opt); if(ax&&ax.best) moveTo(ax, ax.best); });
  box.querySelectorAll('[data-swap]').forEach(b=>b.onclick=()=>{ const t=selItem(), o=kitchenData().items.find(x=>x.id===+b.dataset.swap); if(!t||!o) return;
    snapshot(); const a={a:t.a,b:t.b,x:t.x}; t.a=o.a; t.b=o.b; t.x=o.x; o.a=a.a; o.b=a.b; o.x=a.x; kitchenSave(); setHint(`${nm(t)} und ${nm(o)} getauscht · ⌘Z nimmt es zurück`); });
  box.querySelectorAll('.ka-chart').forEach(ch=>{
    const ax=KS.sw && KS.sw.axes.find(a=>a.key===ch.dataset.ax); if(!ax) return;
    const svg=ch.querySelector('svg'), hit=ch.querySelector('.ka-hit'), cr=ch.querySelector('.ka-cross'), tip=ch.querySelector('.ka-tip');
    const near=e=>{ const r=svg.getBoundingClientRect(), vb=svg.viewBox.baseVal, x=(e.clientX-r.left)/r.width*vb.width;
      const P=ax.pts, xs=P.map(p=>p.v), x0=Math.min(...xs), x1=Math.max(...xs), v=x0+(x-44)/(vb.width-56)*(x1-x0);
      return {p:P.reduce((a,q)=>Math.abs(q.v-v)<Math.abs(a.v-v)?q:a), r, vb, X:q=>44+(q.v-x0)/(x1-x0||1)*(vb.width-56)}; };
    hit.onmousemove=e=>{ const n=near(e); cr.setAttribute('x1',n.X(n.p)); cr.setAttribute('x2',n.X(n.p)); cr.setAttribute('visibility','visible');
      tip.style.display='block'; tip.textContent=`${ax.key==='wall'?fmtKm(n.p.v/1000)+' m':(n.p.v>0?'+':'')+fmtKm(n.p.v/1000)+' m'}: ${fmtKm(n.p.km)} km/Jahr${n.p.ok?'':n.p.blocked?' · Weg gesperrt':' · neuer Befund in der Prüfung'}${n.p.complete<R.complete?' (Ablauf unvollständig)':''} · Klick setzt hierhin`;
      tip.style.left=Math.min(n.X(n.p)/n.vb.width*n.r.width+8, n.r.width-200)+'px'; tip.style.top='4px'; };
    hit.onmouseleave=()=>{ cr.setAttribute('visibility','hidden'); tip.style.display='none'; };
    hit.onclick=e=>moveTo(ax, near(e).p);
  });
}
function renderStock(c){
  const S=KX.stock(c.K,c.L);
  $('kStock').innerHTML = S.list.length
    ? `<table>${S.list.map(r=>`<tr><td>${escapeHtml(r.text)}</td><td>${r.n}×</td></tr>`).join('')}`
      +S.tops.map((t,i)=>`<tr><td>${t.island?'Arbeitsplatte Insel':`Arbeitsplatte ${i+1}`}</td><td>${mTxt(t.len)} m × ${cmTxt(t.depth)} cm</td></tr>`).join('')
      +(S.fillers||[]).map(f=>`<tr><td>${f.corner?'Passblende Ecke':'Passleiste'}</td><td>${Math.round(f.w)} mm</td></tr>`).join('')+`</table>`
    : '<p class="tnote">Noch nichts geplant.</p>';
}
function renderKitchenPanel(){
  const on=M.mode==='kitchen';
  $('kitchensec').hidden=!on;
  document.body.classList.toggle('kitchenmode', on);
  syncToggles();
  if(!on) return;
  buildPalette(); buildSpec();
  const c=kctx();
  if(!c){ $('kEmpty').textContent='Die Küche braucht einen eindeutig eingemessenen Grundriss.'; return; }
  renderSpec(c);
  $('kEmpty').hidden = c.K.items.length>0;
  $('kEmpty').innerHTML = `<b>Schrank aus der Leiste oben auf eine Wand ziehen</b> – oder anklicken, dann setzt er sich an die nächste freie Stelle. Standardmaße stimmen meist; Breite, Front und Inhalt stellt man rechts ein, wenn ein Teil gewählt ist.`;
  if(KS.drag) return;
  renderSel(c); renderCorner(c); renderChecks(c); renderWays(c); renderStock(c); renderAna(c);
  $('kClear').hidden=!c.K.items.length;
}
// Scharf geschaltetes „Alle entfernen“ zurücknehmen: Uhr und Beschriftung (für den Raumwechsel).
function disarmClear(){
  if(!KS.clearArmed) return;
  clearTimeout(KS.clearArmed); KS.clearArmed=null;
  const b=$('kClear'); b.textContent='Alle Küchenteile entfernen'; b.classList.remove('arm');
}
function kitchenLeave(){ KS.sel=null; KS.drag=false; document.body.classList.remove('k3d'); document.body.classList.remove('kana'); }
$('k3dBtn').onclick=toggle3d; $('kWayBtn').onclick=togglePaths; $('kOpenBtn').onclick=toggleOpen; $('kAnaBtn').onclick=toggleAna; $('kAbstBtn').onclick=toggleGaps; $('kRulerBtn').onclick=()=>rulerToggle();
$('kSelX').onclick=()=>{ KS.sel=null; render(); };
$('kClear').onclick=()=>{
  const K=kitchenData(), b=$('kClear'); if(!K.items.length) return;
  if(!KS.clearArmed){ b.textContent=`Wirklich alle ${K.items.length} entfernen?`; b.classList.add('arm');
    KS.clearArmed=setTimeout(()=>{ KS.clearArmed=null; b.textContent='Alle Küchenteile entfernen'; b.classList.remove('arm'); },4000); return; }
  clearTimeout(KS.clearArmed); KS.clearArmed=null; b.textContent='Alle Küchenteile entfernen'; b.classList.remove('arm');
  snapshot(); K.items=[]; KS.sel=null; kitchenSave(); setHint('Küche geleert. ⌘Z holt alles zurück.');
};

// ================= 3D-Ansicht (WebGL2, ohne Bibliothek) =================
// Bewusst rohes WebGL2 statt vgpu: vgpu ist ein reines ES-Modul (≈ 220 KB
// gebündelt) ohne WebGL-Rückfall und läuft auf macOS vor Tahoe nicht.
// Für Quader mit flacher Schattierung reichen zwei Shader.
const cv3=$('cv3d');
const G3={gl:null, prog:null, tri:null, triN:0, wall:null, wallN:0, lin:null, linN:0, glass:null, glassN:0, key:'', raf:0,
  cam:{yaw:-0.65, pitch:0.62, dist:7000, t:[0,900,0]}, camFor:'', ptr:null, failed:false};
const VS=`#version 300 es
in vec3 aP; in vec3 aN; in vec4 aC; uniform mat4 uVP; out vec3 vN; out vec4 vC;
void main(){ gl_Position=uVP*vec4(aP,1.0); vN=aN; vC=aC; }`;
const FS=`#version 300 es
precision highp float; in vec3 vN; in vec4 vC; uniform float uFlat; out vec4 o;
void main(){ vec3 n=normalize(vN);
  float l=0.58+0.32*max(dot(n,normalize(vec3(0.35,1.0,0.25))),0.0)+0.12*max(dot(n,normalize(vec3(-0.6,0.35,-0.7))),0.0);
  o=vec4(uFlat>0.5?vC.rgb:vC.rgb*l, vC.a); }`;
function gl3(){
  if(G3.gl || G3.failed) return G3.gl;
  const gl=cv3.getContext('webgl2',{antialias:true, alpha:false});
  if(!gl){ G3.failed=true; $('k3dMsg').hidden=false; return null; }
  if(gl.isContextLost()) return null;                 // bis webglcontextrestored: nichts bauen, nichts melden
  const sh=(t,src)=>{ const s=gl.createShader(t); gl.shaderSource(s,src); gl.compileShader(s); if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p=gl.createProgram(); gl.attachShader(p,sh(gl.VERTEX_SHADER,VS)); gl.attachShader(p,sh(gl.FRAGMENT_SHADER,FS));
  gl.bindAttribLocation(p,0,'aP'); gl.bindAttribLocation(p,1,'aN'); gl.bindAttribLocation(p,2,'aC'); gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)) { G3.failed=true; $('k3dMsg').hidden=false; return null; }
  G3.gl=gl; G3.prog=p; G3.uVP=gl.getUniformLocation(p,'uVP'); G3.uFlat=gl.getUniformLocation(p,'uFlat');
  ['tri','wall','lin','glass'].forEach(k=>{ const vao=gl.createVertexArray(), buf=gl.createBuffer(); G3[k]={vao,buf}; });
  return gl;
}
// Kontextverlust (GPU-Wechsel, Ruhezustand, Speicherdruck): preventDefault,
// sonst stellt der Browser den Kontext nie wieder her. Alles, was am alten
// Kontext hing (Programm, Puffer, VAOs, Hochladeschlüssel), fällt weg; gl3()
// baut es beim nächsten Zeichnen neu auf.
const reset3=()=>{ G3.gl=G3.prog=G3.tri=G3.wall=G3.lin=G3.glass=null; G3.key=''; };
cv3.addEventListener('webglcontextlost',e=>{ e.preventDefault(); reset3(); });
cv3.addEventListener('webglcontextrestored',()=>{ reset3(); k3dSchedule(); });
// Welt (x,y Grundriss, z Höhe) -> GL (X=x, Y=z, Z=y). Ohne Spiegelung:
// von oben gesehen liegt X rechts und Z unten, wie im Plan.
function buildGeom(c){
  const tri=[], wall=[], lin=[], glass=[];
  const V=(arr,p,n,col,a=1)=>arr.push(p[0],p[1],p[2],n[0],n[1],n[2],col[0],col[1],col[2],a);
  const P3=(p,z)=>[p.x,z,p.y];
  const norm=(a,b,c2)=>{ const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]], v=[c2[0]-a[0],c2[1]-a[1],c2[2]-a[2]];
    const n=[u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]], l=Math.hypot(...n)||1; return n.map(x=>x/l); };
  const quad=(arr,a,b,c2,d,col,alpha=1,want)=>{ let n=norm(a,b,c2);
    if(want && n[0]*want[0]+n[1]*want[1]+n[2]*want[2]<0){ [b,d]=[d,b]; n=n.map(x=>-x); }
    V(arr,a,n,col,alpha);V(arr,b,n,col,alpha);V(arr,c2,n,col,alpha); V(arr,a,n,col,alpha);V(arr,c2,n,col,alpha);V(arr,d,n,col,alpha); };
  const edge=(a,b,col=[0.28,0.27,0.25])=>{ V(lin,a,[0,1,0],col); V(lin,b,[0,1,0],col); };
  const sc=KX.scene(c.E,c.K,c.L,{bad:c.bad, warn:c.warn, sel:new Set(KS.sel!=null?[KS.sel]:[]), open:KS.open});
  sc.prisms.forEach(pr=>{
    const P=pr.poly, n=P.length;
    // Umlaufsinn so, dass die Deckfläche nach oben zeigt
    let A2=0; for(let i=0;i<n;i++){ const p=P[i], q=P[(i+1)%n]; A2+=p.x*q.y-q.x*p.y; }
    const Q = A2<0 ? P : [...P].reverse();
    for(let i=1;i<n-1;i++){ V(tri,P3(Q[0],pr.z1),[0,1,0],pr.col); V(tri,P3(Q[i],pr.z1),[0,1,0],pr.col); V(tri,P3(Q[i+1],pr.z1),[0,1,0],pr.col);
                            V(tri,P3(Q[0],pr.z0),[0,-1,0],pr.col); V(tri,P3(Q[i+1],pr.z0),[0,-1,0],pr.col); V(tri,P3(Q[i],pr.z0),[0,-1,0],pr.col); }
    const cx=Q.reduce((s,p)=>s+p.x,0)/n, cy=Q.reduce((s,p)=>s+p.y,0)/n;
    for(let i=0;i<n;i++){ const p=Q[i], q=Q[(i+1)%n], m={x:(p.x+q.x)/2-cx, y:(p.y+q.y)/2-cy};
      quad(tri, P3(p,pr.z0), P3(q,pr.z0), P3(q,pr.z1), P3(p,pr.z1), pr.col, 1, [m.x,0,m.y]);
      if(pr.edge===true){ edge(P3(p,pr.z0),P3(q,pr.z0)); edge(P3(p,pr.z1),P3(q,pr.z1)); edge(P3(p,pr.z0),P3(p,pr.z1)); } }
    // Kantenliste statt eigener Kanten (gemeinsame Inselplatte: nur der Umriss).
    if(Array.isArray(pr.edge)) pr.edge.forEach(([p,q])=>{ edge(P3(p,pr.z0),P3(q,pr.z0)); edge(P3(p,pr.z1),P3(q,pr.z1)); edge(P3(p,pr.z0),P3(p,pr.z1)); });
  });
  // Boden (Ohrenschneiden, Inseln stehen als Pfeiler darauf) und Wände
  const ring=c.E.ring, fl=earcut(ring);
  fl.forEach(([a,b,c2])=>{ const pa=P3(ring[a],0), pb=P3(ring[b],0), pc=P3(ring[c2],0), n=norm(pa,pb,pc);
    const up=n[1]>=0; V(wall,pa,[0,1,0],KX.COL.floor); V(wall,up?pb:pc,[0,1,0],KX.COL.floor); V(wall,up?pc:pb,[0,1,0],KX.COL.floor); });
  const WF=KX.wallFaces(c.E);
  WF.quads.forEach(q=>{ const n=[q.n.x,0,q.n.y];
    quad(wall, P3(q.a,q.z0a), P3(q.b,q.z0b), P3(q.b,q.z1b), P3(q.a,q.z1a), KX.COL.wallFace, 1, n); });
  WF.tops.forEach(R=>{
    earcut(R).forEach(([i,j,k])=>{ const pa=[R[i].x,R[i].z,R[i].y], pb=[R[j].x,R[j].z,R[j].y], pc=[R[k].x,R[k].z,R[k].y], n=norm(pa,pb,pc), up=n[1]>=0;
      const col=[0.55,0.53,0.49], nn=up?n:n.map(x=>-x); V(tri,pa,nn,col); V(tri,up?pb:pc,nn,col); V(tri,up?pc:pb,nn,col); });
    R.forEach((p,i)=>{ const q=R[(i+1)%R.length]; edge([p.x,p.z,p.y],[q.x,q.z,q.y]); edge([p.x,0,p.y],[q.x,0,q.y]); });
  });
  WF.caps.forEach(cp=>{ const [a,b,c2,d]=cp.poly;
    quad(tri, P3(a,cp.za), P3(b,cp.zb), P3(c2,cp.zb), P3(d,cp.za), [0.55,0.53,0.49], 1, [0,1,0]);
    edge(P3(a,cp.za),P3(b,cp.zb)); edge(P3(a,0),P3(b,0)); });
  sc.glass.forEach(gq=>{ const [a,b]=gq.quad; quad(glass, P3(a,gq.z0), P3(b,gq.z0), P3(b,gq.z1), P3(a,gq.z1), KX.COL.glass, 0.38);
    edge(P3(a,gq.z0),P3(b,gq.z0),[0.3,0.45,0.55]); edge(P3(a,gq.z1),P3(b,gq.z1),[0.3,0.45,0.55]); edge(P3(a,gq.z0),P3(a,gq.z1),[0.3,0.45,0.55]); edge(P3(b,gq.z0),P3(b,gq.z1),[0.3,0.45,0.55]); });
  // Wege als Linien knapp über dem Boden
  if(KS.paths){
    const R=flowRes(c), hexc=h=>[parseInt(h.slice(1,3),16)/255, parseInt(h.slice(3,5),16)/255, parseInt(h.slice(5,7),16)/255];
    R.flows.filter(f=>!KS.flow||f.key===KS.flow).forEach(f=>f.legs.forEach(l=>{ for(let i=1;i<l.path.length;i++) edge(P3(l.path[i-1],8),P3(l.path[i],8),hexc(KINK.grp[f.group])); }));
  }
  return {tri:new Float32Array(tri), wall:new Float32Array(wall), lin:new Float32Array(lin), glass:new Float32Array(glass)};
}
// Ohrenschneiden für einen einfachen Ring (konkav erlaubt).
function earcut(R){
  const n=R.length, idx=[...Array(n).keys()], out=[];
  let A2=0; for(let i=0;i<n;i++){ const p=R[i], q=R[(i+1)%n]; A2+=p.x*q.y-q.x*p.y; }
  const sg=A2>0?1:-1, cr=(a,b,c2)=>((b.x-a.x)*(c2.y-a.y)-(b.y-a.y)*(c2.x-a.x))*sg;
  // Zwei Ringpunkte auf derselben Stelle (Ecke doppelt, Stichwand): der zweite
  // liegt auf einer Ohrecke und damit auf dem Rand, nicht im Ohr. Sonst
  // verwirft jedes Ohr den Doppelgänger, und der Boden bleibt zum Teil leer.
  const same=(p,q)=>Math.abs(p.x-q.x)<1e-6 && Math.abs(p.y-q.y)<1e-6;
  let guard=0;
  while(idx.length>3 && guard++<5000){
    let cut=false;
    for(let i=0;i<idx.length;i++){
      const ia=idx[(i+idx.length-1)%idx.length], ib=idx[i], ic=idx[(i+1)%idx.length], a=R[ia], b=R[ib], c2=R[ic];
      if(cr(a,b,c2)<=1e-9) continue;
      let inside=false;
      for(const j of idx){ if(j===ia||j===ib||j===ic) continue; const p=R[j];
        if(same(p,a)||same(p,b)||same(p,c2)) continue;
        if(cr(a,b,p)>=0 && cr(b,c2,p)>=0 && cr(c2,a,p)>=0){ inside=true; break; } }
      if(inside) continue;
      out.push([ia,ib,ic]); idx.splice(i,1); cut=true; break;
    }
    if(!cut) break;
  }
  if(idx.length===3) out.push([idx[0],idx[1],idx[2]]);
  return out;
}
function upload(gl, slot, data){
  const s=G3[slot]; gl.bindVertexArray(s.vao); gl.bindBuffer(gl.ARRAY_BUFFER, s.buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  const st=40; gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,st,0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,st,12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,4,gl.FLOAT,false,st,24);
  G3[slot+'N']=data.length/10;
}
function camFit(c, keep){
  const P=c.E.ring, xs=P.map(p=>p.x), ys=P.map(p=>p.y);
  const cx=(Math.min(...xs)+Math.max(...xs))/2, cy=(Math.min(...ys)+Math.max(...ys))/2;
  const span=Math.max(Math.max(...xs)-Math.min(...xs), Math.max(...ys)-Math.min(...ys), 2500);
  // Abstand so, dass der Raum auch in einer schmalen (hochkant) Ansicht
  // ganz drin ist: der engere der beiden Öffnungswinkel zählt.
  const a=Math.max(0.3, (cv3.clientWidth||4)/Math.max(1,cv3.clientHeight||3));
  const half=Math.min(22.5*Math.PI/180, Math.atan(Math.tan(22.5*Math.PI/180)*a));
  G3.cam.t=[cx, 900, cy]; G3.cam.dist=span*0.62/Math.tan(half);
  if(!keep){ G3.cam.yaw=-0.65; G3.cam.pitch=0.62; }
}
function mat(){
  const W=cv3.width, H=cv3.height, cm=G3.cam, t=cm.t, cp=Math.cos(cm.pitch);
  const eye=[t[0]+cm.dist*cp*Math.sin(cm.yaw), t[1]+cm.dist*Math.sin(cm.pitch), t[2]+cm.dist*cp*Math.cos(cm.yaw)];
  const f=norm3([t[0]-eye[0],t[1]-eye[1],t[2]-eye[2]]), r=norm3(cross3(f,[0,1,0])), u=cross3(r,f);
  const V=[r[0],u[0],-f[0],0, r[1],u[1],-f[1],0, r[2],u[2],-f[2],0, -dot3(r,eye),-dot3(u,eye),dot3(f,eye),1];
  const fov=45*Math.PI/180, a=W/Math.max(1,H), n=50, fr=200000, k=1/Math.tan(fov/2);
  const Pm=[k/a,0,0,0, 0,k,0,0, 0,0,(fr+n)/(n-fr),-1, 0,0,2*fr*n/(n-fr),0];
  return mul4(Pm,V);
}
const dot3=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2], cross3=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm3=a=>{ const l=Math.hypot(...a)||1; return a.map(x=>x/l); };
function mul4(A,B){ const o=new Array(16).fill(0); for(let c2=0;c2<4;c2++) for(let r=0;r<4;r++){ let s=0; for(let k=0;k<4;k++) s+=A[k*4+r]*B[c2*4+k]; o[c2*4+r]=s; } return o; }
function k3dSchedule(){ if(G3.raf || !(M.mode==='kitchen' && KS.show3d && !KS.ana)) return; G3.raf=requestAnimationFrame(()=>{ G3.raf=0; k3dDraw(); }); }
function k3dDraw(){
  if(!(M.mode==='kitchen' && KS.show3d)) return;
  const c=kctx(); if(!c) return;
  const gl=gl3(); if(!gl) return;
  const dpr=DPR(), W=Math.round(cv3.clientWidth*dpr), H=Math.round(cv3.clientHeight*dpr);
  if(!W||!H) return;
  if(cv3.width!==W || cv3.height!==H){ cv3.width=W; cv3.height=H; }
  if(G3.camFor!==currentRoom){ G3.camFor=currentRoom; camFit(c); }
  // Erst die Wege rechnen: flowRes kann KS.flow zurücksetzen, der Schlüssel
  // gilt dem Stand danach (sonst baut das nächste Bild noch einmal).
  if(KS.paths) flowRes(c);
  const key=c.key+'|'+KS.sel+'|'+KS.open+'|'+KS.paths+'|'+KS.flow;
  if(key!==G3.key){ G3.key=key; const g=buildGeom(c); upload(gl,'tri',g.tri); upload(gl,'wall',g.wall); upload(gl,'lin',g.lin); upload(gl,'glass',g.glass); }
  gl.viewport(0,0,W,H);
  gl.clearColor(0.96,0.953,0.93,1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.useProgram(G3.prog);
  gl.uniformMatrix4fv(G3.uVP,false,new Float32Array(mat()));
  gl.uniform1f(G3.uFlat,0);
  gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1,1);
  // Wände und Boden einseitig: von außen gesehen verschwinden sie (Puppenhaus).
  gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
  gl.bindVertexArray(G3.wall.vao); gl.drawArrays(gl.TRIANGLES,0,G3.wallN);
  gl.disable(gl.CULL_FACE);
  gl.bindVertexArray(G3.tri.vao); gl.drawArrays(gl.TRIANGLES,0,G3.triN);
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.uniform1f(G3.uFlat,1);
  gl.bindVertexArray(G3.lin.vao); gl.drawArrays(gl.LINES,0,G3.linN);
  gl.uniform1f(G3.uFlat,0);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
  gl.bindVertexArray(G3.glass.vao); gl.drawArrays(gl.TRIANGLES,0,G3.glassN);
  gl.depthMask(true); gl.disable(gl.BLEND);
  gl.bindVertexArray(null);
}
// Orbit: Ziehen dreht, Rechts-/Mittel-/⇧-Ziehen verschiebt, Rad zoomt,
// Doppelklick setzt zurück.
cv3.addEventListener('pointerdown',e=>{ cv3.setPointerCapture(e.pointerId); G3.ptr={x:e.clientX,y:e.clientY,pan:e.button!==0||e.shiftKey}; });
cv3.addEventListener('pointermove',e=>{
  if(!G3.ptr) return;
  const dx=e.clientX-G3.ptr.x, dy=e.clientY-G3.ptr.y; G3.ptr.x=e.clientX; G3.ptr.y=e.clientY;
  const cm=G3.cam;
  if(G3.ptr.pan){
    const s=cm.dist/ Math.max(300, cv3.clientHeight) * 1.0;
    const r=[Math.cos(cm.yaw),0,-Math.sin(cm.yaw)], f=[-Math.sin(cm.yaw),0,-Math.cos(cm.yaw)];
    cm.t[0]-= (r[0]*dx - f[0]*dy)*s; cm.t[2]-= (r[2]*dx - f[2]*dy)*s;
  } else { cm.yaw-=dx*0.008; cm.pitch=Math.max(0.05, Math.min(1.52, cm.pitch+dy*0.006)); }
  k3dSchedule();
});
const end3=()=>{ G3.ptr=null; };
cv3.addEventListener('pointerup',end3); cv3.addEventListener('pointercancel',end3);
cv3.addEventListener('contextmenu',e=>e.preventDefault());
cv3.addEventListener('dblclick',()=>{ const c=kctx(); if(c){ camFit(c); k3dSchedule(); } });
cv3.addEventListener('wheel',e=>{
  e.preventDefault();
  const cm=G3.cam;
  if(e.shiftKey && !e.ctrlKey){ cm.yaw-=(e.deltaY||e.deltaX)*0.003; }
  else cm.dist=Math.max(800, Math.min(60000, cm.dist*Math.exp(e.deltaY*(e.ctrlKey?0.01:0.0015))));
  k3dSchedule();
},{passive:false});
// Größe ändert die Geometrie nicht: k3dDraw passt Canvas und Viewport selbst an.
if(typeof ResizeObserver==='function') new ResizeObserver(()=>{ if(M.mode==='kitchen') k3dSchedule(); }).observe(cv3);

// ---------- Abstände (NKBA) ----------
// Die Messwerte kommen aus check (c.NK): Gang vor jeder Zeile, Arbeitsdreieck, Platz hinter Tisch und
// Tresen. Gezeichnet wird jeder als Maßlinie; grün, wenn der Wert reicht, gelb unter der Empfehlung,
// rot unter dem Mindestmaß. Bei den engen steht der Grund dabei.
const m2=v=>(v/1000).toFixed(2).replace('.',',');
const GAP_INK={ ok:'rgba(70,110,80,.75)', warn:'#b8860b', bad:'#c0392b' };
function drawGaps(c, dpr){
  const pills=[];
  const lab=r=>r.k==='summe' ? `Summe ${m2(r.val)} m` : r.k==='dreieck' ? `${m2(r.val)} m` : `${r.val} mm`;
  c.NK.forEach(r=>{
    const col=GAP_INK[r.lvl], a=toScr(r.a), b=toScr(r.b), tri=r.k==='dreieck';
    if(r.k!=='summe'){
      ctx.save(); ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=(r.lvl==='ok'?1.4:2.4)*dpr; ctx.setLineDash(tri?[6*dpr,4*dpr]:[]);
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); ctx.setLineDash([]);
      if(!tri){ const L=Math.hypot(b.x-a.x,b.y-a.y)||1, nx=-(b.y-a.y)/L*4*dpr, ny=(b.x-a.x)/L*4*dpr;      // Endstriche
        [a,b].forEach(q=>{ ctx.beginPath(); ctx.moveTo(q.x-nx,q.y-ny); ctx.lineTo(q.x+nx,q.y+ny); ctx.stroke(); }); }
      ctx.restore();
    }
    const m=r.k==='summe' ? a : {x:(a.x+b.x)/2, y:(a.y+b.y)/2};
    pills.push({m, col, txt:lab(r)+(r.why?' · '+r.why:''), tight:r.lvl!=='ok'});
  });
  // Enge zuletzt, damit ihre Schilder oben liegen.
  pills.sort((p,q)=>p.tight-q.tight).forEach(p=>{
    ctx.save(); ctx.font=`600 ${11*dpr}px ${CANVAS_FONT}`; ctx.textAlign='center'; ctx.textBaseline='middle';
    const w=ctx.measureText(p.txt).width+10*dpr, h=17*dpr;
    ctx.fillStyle='rgba(251,250,246,.92)'; ctx.strokeStyle=p.col; ctx.lineWidth=1.2*dpr;
    ctx.beginPath(); ctx.roundRect(p.m.x-w/2, p.m.y-h/2, w, h, 4*dpr); ctx.fill(); ctx.stroke();
    ctx.fillStyle=p.tight?p.col:'#3b4a40'; ctx.fillText(p.txt, p.m.x, p.m.y+0.5*dpr); ctx.restore();
  });
}

// ---------- Lineal ----------
// Wie im Fliesenplan: halbdurchsichtig, mm-/cm-Teilung, Körper ziehen verschiebt, ein Ende ziehen streckt
// und dreht (⇧: nur drehen), rastet an Ecken und Kanten von Wänden und Küchenteilen und im rechten Winkel
// dazu; ⌘/Strg hält frei. Lage je Raum im Browser, nicht im Raum und nicht im Rückgängig. Rechnung in
// Weltmillimetern (der Fliesenplan rechnet im Raumrahmen: eigener Speicher, keine Vermischung).
const RULER_STORE='raumaufmass-kueche-lineal', RULER_PX=34, RUL_ANG=2*Math.PI/180;
const KR={on:false, a:null, b:null, snap:null, room:undefined};
const kTol=()=>16*DPR()/VIEW.s;
const rulerLen=L=>`${(Math.round(L*10)/10).toLocaleString('de-DE')} mm`;
function rulerSave(){
  try{ const all=JSON.parse(localStorage.getItem(RULER_STORE)||'{}')||{};
       if(currentRoom && KR.a) all[currentRoom]={a:KR.a, b:KR.b};
       localStorage.setItem(RULER_STORE, JSON.stringify(all)); }catch(e){}
}
function rulerLoad(){
  let all={}; try{ all=JSON.parse(localStorage.getItem(RULER_STORE)||'{}')||{}; }catch(e){}
  const r=currentRoom && all[currentRoom];
  KR.a=r?.a||null; KR.b=r?.b||null; KR.room=currentRoom;
}
// Neu ins Bild: 1 m (höchstens 60 % der Bildbreite), waagerecht in der Bildmitte.
function rulerPlace(){
  const cx=cv.width/2, cy=cv.height/2, c=toWorld(cx,cy), q=toWorld(cx+1,cy);
  const L=Math.hypot(q.x-c.x,q.y-c.y)||1, u={x:(q.x-c.x)/L, y:(q.y-c.y)/L}, len=Math.min(1000, 0.6*cv.width/VIEW.s);
  KR.a={x:c.x-u.x*len/2, y:c.y-u.y*len/2}; KR.b={x:c.x+u.x*len/2, y:c.y+u.y*len/2};
}
function rulerToggle(on=!KR.on){
  if(!kctx()) return;
  if(KR.room!==currentRoom) rulerLoad();
  KR.on=on;
  if(on && !KR.a) rulerPlace();
  rulerSave(); syncToggles(); render();
  setHint(on ? 'Lineal: Körper ziehen verschiebt, Enden ziehen strecken und drehen (⇧: nur drehen). Rastet an Wänden, Küchenteilen, rechten Winkeln; ⌘/Strg frei.' : 'Lineal aus.');
}
function rulerScr(){
  const a=toScr(KR.a), b=toScr(KR.b), L=Math.hypot(b.x-a.x,b.y-a.y)||1;
  const u={x:(b.x-a.x)/L, y:(b.y-a.y)/L}, n={x:u.y, y:-u.x}, W=RULER_PX*DPR();
  return {a, b, u, n, L, W, poly:[a, b, {x:b.x+n.x*W, y:b.y+n.y*W}, {x:a.x+n.x*W, y:a.y+n.y*W}]};
}
function rulerHit(c, d){
  if(!KR.on || !KR.a || KR.room!==currentRoom) return null;
  const s=rulerScr(), tol=12*DPR();
  if(Math.hypot(d.x-s.a.x, d.y-s.a.y)<=tol) return 'a';
  if(Math.hypot(d.x-s.b.x, d.y-s.b.y)<=tol) return 'b';
  const t=(d.x-s.a.x)*s.u.x+(d.y-s.a.y)*s.u.y, h=(d.x-s.a.x)*s.n.x+(d.y-s.a.y)*s.n.y;
  return t>=0 && t<=s.L && h>=-4*DPR() && h<=s.W ? 'body' : null;
}
// Fangziele: Ecken und Kanten der Wände und aller Küchenteile (Korpus, bei Tresen die Hockerkante).
function rulerTargets(c){
  const pts=[], edges=[];
  const add=R=>R.forEach((p,i)=>{ const q=R[(i+1)%R.length]; pts.push(p); edges.push({a:p, b:q}); });
  TILES.ringsOf(c.E.ring).forEach(add);
  c.L.G.forEach(g=>{ add(g.poly); if(g.foot) add(g.foot); });
  return {pts, edges};
}
function rulerSnapDir(edges, O, P){
  const L=Math.hypot(P.x-O.x, P.y-O.y); if(L<1e-6) return null;
  const ang=Math.atan2(P.y-O.y, P.x-O.x);
  let best=null, bdA=RUL_ANG;
  edges.forEach(e=>{ const ea=Math.atan2(e.b.y-e.a.y, e.b.x-e.a.x);
    for(let k=0;k<4;k++){ const cc=ea+k*Math.PI/2, dA=Math.abs(Math.atan2(Math.sin(ang-cc), Math.cos(ang-cc)));
      if(dA<bdA){ bdA=dA; best={dir:cc, line:e, how:k%2?'rechtwinklig':'parallel'}; } } });
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
  const cc=Math.cos(ang-best.ea)>=0 ? best.ea : best.ea+Math.PI, ux=Math.cos(cc), uy=Math.sin(cc);
  const mp={x:m.x-best.nx*best.off, y:m.y-best.ny*best.off};
  return {a:{x:mp.x-ux*L/2, y:mp.y-uy*L/2}, b:{x:mp.x+ux*L/2, y:mp.y+uy*L/2}, how:'an Kante', line:best.e};
}
function rulerDown(e, c){
  const d=evDev(e), part=rulerHit(c, d); if(!part) return false;
  gesture={t:'kruler', part, x0:e.clientX, y0:e.clientY, moved:false, p0:toWorld(d.x,d.y), a0:{...KR.a}, b0:{...KR.b}, tg:rulerTargets(c)};
  return true;
}
function rulerMove(e, g, c){
  if(!c) return;
  const d=evDev(e), p=toWorld(d.x,d.y), free=e.metaKey||e.ctrlKey, tol=kTol(), R=KR;
  let sn={};
  if(g.part==='body'){
    const dx=p.x-g.p0.x, dy=p.y-g.p0.y, a={x:g.a0.x+dx,y:g.a0.y+dy}, b={x:g.b0.x+dx,y:g.b0.y+dy};
    sn=free ? {a,b} : rulerSnapBody(g, a, b, tol);
    R.a=sn.a; R.b=sn.b;
  } else {
    const O=g.part==='a' ? g.b0 : g.a0, P0=g.part==='a' ? g.a0 : g.b0;
    let P={x:P0.x+p.x-g.p0.x, y:P0.y+p.y-g.p0.y};
    if(e.shiftKey){
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
function drawRuler(c, dpr){
  const R=KR;
  if(!R.on) return;
  if(R.room!==currentRoom){ rulerLoad(); if(!R.a) rulerPlace(); }
  const s=rulerScr(), L=Math.hypot(R.b.x-R.a.x, R.b.y-R.a.y);
  ctx.save();
  ctx.fillStyle='rgba(247,214,120,.55)'; ctx.strokeStyle='rgba(110,82,20,.85)'; ctx.lineWidth=1*dpr;
  ctx.beginPath(); s.poly.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)); ctx.closePath(); ctx.fill(); ctx.stroke();
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
  const deg=((Math.atan2(R.b.y-R.a.y, R.b.x-R.a.x)*180/Math.PI)%180+180)%180;
  const label=`${rulerLen(L)} · ${(Math.round(deg*10)/10).toLocaleString('de-DE')}°${unitCm?' · Teilung in cm':' · Teilung in mm'}`;
  let rot=Math.atan2(s.u.y,s.u.x); if(rot>Math.PI/2||rot<-Math.PI/2) rot+=Math.PI;
  ctx.save(); ctx.translate((s.a.x+s.b.x)/2+s.n.x*s.W*0.74, (s.a.y+s.b.y)/2+s.n.y*s.W*0.74); ctx.rotate(rot);
  ctx.textBaseline='middle'; ctx.font=`600 ${11*dpr}px ${CANVAS_FONT}`; ctx.fillText(label,0,0); ctx.restore();
  [s.a,s.b].forEach(q=>{ ctx.fillStyle='#fff'; ctx.strokeStyle=INK.accent; ctx.lineWidth=2*dpr; ctx.beginPath(); ctx.arc(q.x,q.y,6*dpr,0,7); ctx.fill(); ctx.stroke(); });
  if(R.snap && gesture && gesture.t==='kruler'){
    ctx.strokeStyle=INK.accent; ctx.globalAlpha=.7; ctx.lineWidth=4*dpr;
    if(R.snap.line){ const a=toScr(R.snap.line.a), b=toScr(R.snap.line.b); ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); }
    if(R.snap.pt){ const q=toScr(R.snap.pt); ctx.beginPath(); ctx.arc(q.x,q.y,9*dpr,0,7); ctx.stroke(); }
  }
  ctx.restore();
}

// Hinweis je Zustand (modeHint liest KITCHEN_HINT)
function kitchenHint(){
  const it=selItem();
  if(it) return it.a ? `${nm(it)}: ziehen schiebt an der Wand (⌥ ohne Einrasten) · ←/→ 1 cm, ⇧ 10 cm${hasHinge(it)?' · F Anschlag':''} · ⌘D daneben · ⌘C/⌘V kopieren · Entf löscht`
                     : `${nm(it)}: ziehen verschiebt · Q/E dreht 15° · Pfeile 1 cm · ⌘C/⌘V kopieren · Entf löscht`;
  return 'Schrank aus der Leiste ziehen oder klicken · V 3D · W Wege · O Fronten offen · N Abstände · L Lineal · A Analyse';
}

// Anmeldung bei der Seite (meldeAn im Block ui): so ruft sie den Küchenplaner, ohne ihn zu kennen.
meldeAn('kitchen', {
  tasten:[
  ['Küche',[
    ['Teil setzen','Klick oder Ziehen aus der Leiste'], ['An der Wand schieben','Ziehen · ← →, mit ⇧ 10 cm'],
    ['Ohne Einrasten ziehen','⌥+Ziehen'], ['Tisch, Insel drehen','Q  E'], ['Anschlag tauschen','F'],
    ['Daneben duplizieren','⌘D'], ['Kopieren, unter dem Zeiger einfügen','⌘C  ⌘V'], ['Teil löschen','Entf'],
    ['3D · Wege · Fronten offen','V · W · O'], ['Abstände (NKBA) · Lineal','N · L'], ['3D drehen, verschieben, zoomen','Ziehen · Rechts-Ziehen · Rad'],
  ]]
  ],
  bereit:kitchenReady, absage:'Küche erst, wenn der Grundriss eindeutig eingemessen ist.',
  zeichne(){ drawKitchenView(); k3dSchedule(); },
  panel(){
    const kt=document.querySelector('#modes button[data-mode="kitchen"]');
    const ok=kitchenReady();
    if(kt){ kt.setAttribute('aria-disabled', String(!ok));
      kt.title = ok ? 'Küche (5)' : 'Küche (5): erst, wenn der Grundriss eindeutig eingemessen ist'; }
    if(M.mode==='kitchen' && !ok){ setTool('aufmass'); sag('Küchenplaner verlassen: die Form ist nicht mehr eindeutig.'); return true; }
    renderKitchenPanel();
    return false;
  },
  hinweis:kitchenHint,
  verlassen:kitchenLeave,
  // Vor dem Raumwechsel (currentRoom ist noch der alte Raum): Vorgemerktes Speichern ausführen.
  vorRaumwechsel(){ nudgeSave.flush(); },
  // Raumwechsel oder neuer Stand (M hält noch den alten): Vorgemerktes Speichern verwerfen statt hier zu schreiben,
  // sonst landeten die alten Daten im neuen Raum.
  neuerStand(){ nudgeSave.cancel(); disarmClear(); Object.assign(KS, KX.roomBound()); G3.camFor=''; },
  key:kitchenKey,
  entf(){ const it=selItem(); if(!it) return false; removeItem(it); return true; },
  down:kitchenDown, hover:kitchenHover, tap:kitchenTap,
  // 'kdim': die Maß-Eingabe ist offen, Ziehen und Loslassen tun nichts.
  gesten:['kitchen','kdim','kruler'],
  move(e, g){ if(g.t==='kitchen') kitchenMove(e, g); else if(g.t==='kruler') rulerMove(e, g, kctx()); },
  up(e, g){ if(g.t==='kitchen') kitchenUp(e, g); else if(g.t==='kruler'){ KR.snap=null; if(g.moved) rulerSave(); render(); } },
  pinch(g){ if(g.t==='kitchen' && g.moved) kitchenUp(null, g); },
});
})();
