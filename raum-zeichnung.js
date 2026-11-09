// raum-zeichnung.js – Raumzeichnung der Werkzeugfamilie ohne Bedienlogik:
// Zeichenfläche, Ansicht (VIEW, toScr, toWorld, fitView), Farben, Raster,
// Maßstab und die Zeichenbausteine des Grundrisses. Unverändert aus dem
// früheren Block "ui" von raumaufmass.html.
// Braucht: raum-kern.js, raum-geometrie.js, raum-modell.js und im Dokument
// <canvas id="cv"> vor diesem Skript.
// Erwartet vom Werkzeug: nichts.
"use strict";
// Zeichenfarben, abgestimmt auf die CSS-Tokens im Kopf der Datei.
// Zeichenfarben = CSS-Tokens im Kopf der Datei. Ellipsen und Freiheits-
// grade tragen keine eigene Farbe mehr (frueher ein zweites Blau und ein
// Bernstein neben dem Akzent): Tinte und Warnton reichen.
const INK = {
  wall:'#24221d', meas:'#2e7d4f', measHl:'#1d5535', todo:'#c73e2e', todoHl:'#8f1f14',
  measBad:'#b3261e', measBadHl:'#7f1a14', labelBadBg:'rgba(247,228,224,.95)',
  point:'#24221d', accent:'#c2410c', grid:'#e6e2d5', scale:'#4b473e',
  ellMeasured:'#4b473e', ellAssumed:'#8a857a', mode:'#8a5a10',
  canvas:'#f5f3ed', labelBg:'rgba(245,243,237,.92)', hover:'rgba(36,34,29,.10)',
  // Leiser Plan (DESIGN.md): Bleistift für nur Skizziertes, Tinte hell für
  // Maßzahlen und ruhende Diagonalen, gedämpft für Eckbuchstaben.
  pencil:'#a39d90', lab:'#4b473e', muted:'#6f6a5e',
};
const CANVAS_FONT='system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

// Kurzform für document.getElementById.
const $=id=>document.getElementById(id);

// Gradangaben mit deutschem Dezimalkomma - toFixed liefert einen Punkt.
const fmtGrad=v=>v.toFixed(1).replace('.', ',');

// Nutzer hat gezoomt oder verschoben - autofit() haelt sich dann zurueck,
// bis "Einpassen" gedrueckt wird oder eine neue Szene entsteht.
let userView=false;

// --- Weltkoordinaten (mm) <-> Bildschirm (Geraetepixel im Canvas)
const cv=$('cv'), ctx=cv.getContext('2d');
const DPR=()=>devicePixelRatio||1;
// rot dreht nur die ANSICHT (Einnorden einer Wand auf die Waagerechte) -
// Weltkoordinaten bleiben unberuehrt, Beschriftungen werden an der
// gedrehten Position gezeichnet, aber selbst nicht mitgedreht. Nicht
// persistiert: eine Darstellungslaune wie Zoom und Pan.
let VIEW={s:1, ox:0, oy:0, rot:0};

const toScr=p=>{
  const c=Math.cos(VIEW.rot), s2=Math.sin(VIEW.rot);
  return {x:(p.x*c-p.y*s2)*VIEW.s+VIEW.ox, y:(p.x*s2+p.y*c)*VIEW.s+VIEW.oy};
};
const toWorld=(x,y)=>{
  const c=Math.cos(VIEW.rot), s2=Math.sin(VIEW.rot);
  const xr=(x-VIEW.ox)/VIEW.s, yr=(y-VIEW.oy)/VIEW.s;
  return {x:xr*c+yr*s2, y:-xr*s2+yr*c};
};
// Pointer-Event -> Geraetepixel relativ zum Canvas.
function evDev(e){
  const r=cv.getBoundingClientRect();
  return {x:(e.clientX-r.left)*DPR(), y:(e.clientY-r.top)*DPR()};
}

// Ansicht, die eine Punktmenge bei gegebener Drehung einpasst - ohne VIEW
// anzufassen. Getrennt von autofit(), weil die Fahrt zum Nachbarraum ihr
// Ziel braucht, bevor sie dort ankommt.
function fitView(P, rot, auf){
  // Bounding-Box der GEDREHTEN Punkte: eingenordet eingepasst heisst, die
  // Wand liegt waagerecht UND der Raum fuellt den Schirm.
  const c=Math.cos(rot), s2=Math.sin(rot);
  const rx=P.map(p=>p.x*c-p.y*s2), ry=P.map(p=>p.x*s2+p.y*c);
  const a=auf||0;
  const w=(Math.max(...rx)-Math.min(...rx)+2*a)||1000,
        h=(Math.max(...ry)-Math.min(...ry)+2*a)||1000;
  const s=Math.min((cv.width-150)/w, (cv.height-150)/h);
  const mx=(Math.min(...rx)+Math.max(...rx))/2, my=(Math.min(...ry)+Math.max(...ry))/2;
  return { s, ox:cv.width/2-mx*s, oy:cv.height/2-my*s, rot };
}

function roomCentre(P){
  return {x:P.reduce((s,p)=>s+p.x,0)/P.length, y:P.reduce((s,p)=>s+p.y,0)/P.length};
}
// Raumname in der Raummitte, hell und UNTER allem anderen - so wie in einer
// Bauzeichnung. Die Diagonalen tragen ihre Masse genau dort; als Wasserzeichen
// stoert der Name sie nicht. Rueckgabe: Trefferfeld fuers Umbenennen.
function drawRoomLabel(name, P, dpr, col, px){
  if(!name || !P.length) return null;
  const s=toScr(roomCentre(P));
  // Etwas unter die Mitte: genau dort kreuzen sich die Diagonalen, und deren
  // Massbeschriftung sitzt mit deckendem Kaestchen auf dem Mittelpunkt
  // (browser-gesehen - der Name verschwand komplett darunter).
  s.y += 26*dpr;
  ctx.save();
  ctx.font=`${px*dpr}px system-ui`; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=col;
  ctx.fillText(name, s.x, s.y);
  const w=ctx.measureText(name).width;
  ctx.restore();
  return {x:s.x-w/2, y:s.y-px*dpr*0.7, w, h:px*dpr*1.4};
}

// Rasterschritt in mm so, dass die Linien auf dem Schirm weder kleben noch
// verhungern - gleiche 1-2-5-Logik wie beim Massstabsbalken.
function pickStep(minPx){
  const cand=[100,200,500,1000,2000,5000,10000,20000,50000];
  for(const s of cand) if(s*VIEW.s>=minPx) return s;
  return cand[cand.length-1];
}

function drawGrid(dpr){
  const step=pickStep(45*dpr);
  // Sichtfenster in Weltkoordinaten: bei gedrehter Ansicht ist es ein
  // gedrehtes Rechteck - die Bounding-Box der vier Ecken ueberdeckt es,
  // und die Linien laufen als WELT-Segmente durch toScr (Ueberstand wird
  // vom Canvas geclippt, das ist billiger als exaktes Zuschneiden).
  const corners=[toWorld(0,0), toWorld(cv.width,0), toWorld(0,cv.height), toWorld(cv.width,cv.height)];
  const x0=Math.min(...corners.map(c=>c.x)), x1=Math.max(...corners.map(c=>c.x));
  const y0=Math.min(...corners.map(c=>c.y)), y1=Math.max(...corners.map(c=>c.y));
  ctx.strokeStyle=INK.grid; ctx.lineWidth=Math.max(1,0.75*dpr);
  ctx.beginPath();
  for(let x=Math.floor(x0/step)*step; x<=x1; x+=step){
    const a=toScr({x,y:y0}), b=toScr({x,y:y1});
    ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
  }
  for(let y=Math.floor(y0/step)*step; y<=y1; y+=step){
    const a=toScr({x:x0,y}), b=toScr({x:x1,y});
    ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
  }
  ctx.stroke();
}

// Oben links, nicht unten: unten wohnt die Hinweiszeile, und zwei
// uebereinandergelegte Textzeilen sind keine.
function drawScalebar(dpr){
  const step=pickStep(70*dpr);
  const len=step*VIEW.s, x=14*dpr, y=20*dpr;
  ctx.strokeStyle=INK.scale; ctx.fillStyle=INK.scale; ctx.lineWidth=1.5*dpr;
  ctx.beginPath();
  ctx.moveTo(x,y); ctx.lineTo(x+len,y);
  ctx.moveTo(x,y-4*dpr); ctx.lineTo(x,y+4*dpr);
  ctx.moveTo(x+len,y-4*dpr); ctx.lineTo(x+len,y+4*dpr);
  ctx.stroke();
  ctx.font=`${11*dpr}px system-ui`; ctx.textAlign='left';
  ctx.fillText(step>=1000 ? (step/1000)+' m' : step+' mm', x+len+6*dpr, y+3.5*dpr);
}

// Backbuffer nur neu anlegen, wenn sich die Groesse aendert - das Ueberfahren
// mit der Maus zeichnet jetzt oft, und ein neuer Puffer je Bild ist auf
// Retina teuer. Ohne Neuanlage bleibt der Kontextzustand stehen: zuruecksetzen.
function sizeCanvas(dpr){
  const w=Math.round(cv.clientWidth*dpr), h=Math.round(cv.clientHeight*dpr);
  if(cv.width!==w || cv.height!==h){ cv.width=w; cv.height=h; }
  ctx.setTransform(1,0,0,1,0,0);
  ctx.setLineDash([]); ctx.globalAlpha=1; ctx.textAlign='start'; ctx.lineJoin='miter'; ctx.lineCap='butt';
}

// Aufrisssymbolik nach DIN-Praxis: Dreiecke, deren Spitze auf die
// Bandseite zeigt. Durchgezogen = nach innen oeffnend, gestrichelt =
// nach aussen. Fest verglast und Loch bekommen kein Symbol.
function drawOpeningSymbol(o,x,y,w,h,dpr,flip){
  const t=o.swing&&o.swing.type;
  if(!t||t==='fix'||o.kind==='hole') return;
  ctx.save();
  ctx.strokeStyle=INK.scale; ctx.lineWidth=1.2*dpr;
  if(o.swing.out) ctx.setLineDash([4*dpr,3*dpr]);
  const tri=(ax,ay,bx,by,cx,cy)=>{
    ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.lineTo(cx,cy);
    ctx.closePath(); ctx.stroke();
  };
  // hinge 'left' ist die Seite von Ecke a - gespiegelt liegt sie rechts.
  const links=(o.swing.hinge==='left')!==!!flip;
  if(t==='turn'||t==='turntilt'){
    // Dreh: Spitze auf der Bandseite
    if(links) tri(x,y+h/2, x+w,y, x+w,y+h);
    else      tri(x+w,y+h/2, x,y, x,y+h);
  }
  if(t==='tilt'||t==='turntilt') tri(x+w/2,y+h, x,y, x+w,y);   // Kipp: Achse unten
  if(t==='top')  tri(x+w/2,y, x,y+h, x+w,y+h);                 // Klapp: Achse oben
  if(t==='pivot'){                                             // Schwing: Achse mittig
    tri(x,y+h/2, x+w,y, x+w,y+h);
    tri(x+w,y+h/2, x,y, x,y+h);
  }
  ctx.restore();
}

// Marker fuer Waende, die schon eine Wandansicht haben - unabhaengig
// davon, ob die Abwicklung eingeschaltet ist. So sieht man auf einen
// Blick, welche Waende nur in ihrer LAENGE bekannt sind und welche schon
// mit Oeffnungen vermessen wurden.
function drawWallMarks(P, I, dpr){
  const bemasst=new Set(M.openings.map(o=>[o.a,o.b].sort().join('|')));
  if(!bemasst.size) return;
  M.walls.forEach(([a,b])=>{
    if(!bemasst.has([a,b].sort().join('|'))) return;
    if(I[a]==null||I[b]==null) return;
    const A=P[I[a]], B=P[I[b]];
    const n=outerNormal(P, M.walls, a, b);
    const m={x:(A.x+B.x)/2, y:(A.y+B.y)/2};
    // Zwei kurze Striche aussen an der Wandmitte - ruhig genug, um im
    // Plan nicht mit Messstrecken verwechselt zu werden.
    const L=C.dist(A,B)||1;
    const u={x:(B.x-A.x)/L, y:(B.y-A.y)/L};
    ctx.strokeStyle=INK.meas; ctx.lineWidth=2*dpr;
    [-1,1].forEach(k=>{
      const b0=toScr({x:m.x+u.x*k*90, y:m.y+u.y*k*90});
      const b1=toScr({x:m.x+u.x*k*90+n.x*180, y:m.y+u.y*k*90+n.y*180});
      ctx.beginPath(); ctx.moveTo(b0.x,b0.y); ctx.lineTo(b1.x,b1.y); ctx.stroke();
    });
  });
}

// Oeffnungen im Grundriss: Blatt und Schwenkbogen. Der Bogen laeuft bis
// kurz vor das naechste Hindernis (siehe swingLimit) statt pauschal 90
// Grad - so ist ablesbar, wieviel Platz die Tuer wirklich braucht.
// reach (nur Küche): je Tür-ID {deg, maxDeg} - das Blatt steht dann am
// ersten Küchenteil, der Rest des Bogens rot (unter 90°) bzw. gelb.
function drawOpeningsOnPlan(P, I, dpr, reach){
  if(!M.openings.length) return;
  M.openings.forEach(o=>{
    const r=openingWorld(P, o.a, o.b, o);
    if(!r) return;
    // Fenster und Loecher: nur die Bruestungslinie in der Luecke.
    if(o.kind!=='door' || !o.swing || o.swing.type==='slide' || o.swing.type==='none'){
      const p=toScr(r.P), q=toScr(r.Q);
      ctx.strokeStyle = o.kind==='window' ? INK.meas : INK.scale;
      ctx.lineWidth=1.6*dpr;
      ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.stroke();
      return;
    }
    // Drehtuer: Angel auf der Bandseite, Blatt so lang wie die Oeffnung.
    const {angel, dir0, sense, max:full}=doorSwing(P, M.walls, o);
    const rc=reach && reach.get(o.id), stop=rc && rc.deg<rc.maxDeg;
    const max=stop ? rc.deg*Math.PI/180 : full;
    const a0=toScr(angel);
    const tipW={x:angel.x+Math.cos(dir0+sense*max)*o.w,
                y:angel.y+Math.sin(dir0+sense*max)*o.w};
    const t=toScr(tipW);
    const hitCol = !stop ? null : rc.deg<90 ? '#b3261e' : '#c98a1a';   // KINK.bad / KINK.warn (Küchen-Skript)
    ctx.strokeStyle= stop ? hitCol : INK.scale;
    ctx.lineWidth=2*dpr;
    ctx.beginPath(); ctx.moveTo(a0.x,a0.y); ctx.lineTo(t.x,t.y); ctx.stroke();
    if(stop){
      // Rest des Schwenkbereichs, den die Tür nicht erreicht.
      ctx.strokeStyle=hitCol; ctx.globalAlpha=.55; ctx.lineWidth=1*dpr; ctx.setLineDash([2*dpr,4*dpr]);
      ctx.beginPath();
      ctx.arc(a0.x, a0.y, Math.max(0, o.w*VIEW.s), dir0+sense*max+VIEW.rot, dir0+sense*full+VIEW.rot, sense<0);
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha=1;
      ctx.strokeStyle=INK.scale;
    }
    // Bogen. Der Grundriss spiegelt y NICHT (anders als die Wandansicht),
    // also gelten die Weltwinkel direkt - nur die Ansichtsdrehung kommt
    // dazu. Das counterclockwise-Flag folgt dem Drehsinn.
    ctx.lineWidth=1*dpr; ctx.setLineDash([3*dpr,3*dpr]);
    ctx.beginPath();
    ctx.arc(a0.x, a0.y, Math.max(0, o.w*VIEW.s), dir0+VIEW.rot, dir0+sense*max+VIEW.rot, sense<0);
    ctx.stroke(); ctx.setLineDash([]);
  });
}

// Farben der Wandflaeche: gemessene Dicke satt, angenommene blass und mit
// gestrichelter Aussenkante - eine angenommene Dicke ist eine Aussage, die
// der Nutzer nie gemacht hat, und darf nicht wie eine Messung aussehen.
const BAND={ mess:'#d9d4c5', ann:'#eceae1', kante:'#b9b3a3',
             nachbarMess:'#e6e2d7', nachbarAnn:'#f0eee7', streit:'#f2ddd8' };

// Die Wand als Flaeche, an ihren Oeffnungen unterbrochen. Jedes Stueck
// reicht bis zur Gehrung, damit die Ecken geschlossen bleiben.
function drawBand(band, gaps, dpr, fuell, kante, streit){
  const {iA,iB,oA,oB,L,u}=band;
  const stuecke=[]; let von=0;
  gaps.forEach(([x0,x1])=>{ if(x0>von) stuecke.push([von,x0]); von=Math.max(von,x1); });
  if(von<L) stuecke.push([von,L]);
  // Innen- und Aussenkante laufen parallel, also derselbe Anteil auf beiden.
  const misch=(p,q,f)=>({x:p.x+(q.x-p.x)*f, y:p.y+(q.y-p.y)*f});
  stuecke.forEach(([x0,x1])=>{
    const f0=x0/L, f1=x1/L;
    const P=[misch(iA,iB,f0), misch(iA,iB,f1), misch(oA,oB,f1), misch(oA,oB,f0)]
      .map(toScr);
    ctx.beginPath();
    P.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.closePath();
    ctx.fillStyle=streit?BAND.streit:fuell; ctx.fill();
    if(!kante) return;
    // Nur die AUSSENkante zeichnen - die Innenkante ist die Wandlinie
    // selbst und wird gleich ohnehin gezogen.
    ctx.beginPath(); ctx.moveTo(P[3].x,P[3].y); ctx.lineTo(P[2].x,P[2].y);
    ctx.strokeStyle=streit?INK.measBad:BAND.kante;
    ctx.lineWidth=(streit?2:1)*dpr;
    ctx.setLineDash(band.assumed?[4*dpr,3*dpr]:[]);
    ctx.stroke(); ctx.setLineDash([]);
  });
}

// Gesetzte rechte Winkel: kleines Quadrat innen in der Ecke, wie im
// Bauplan. Nur fuer Ecken, die orthoFit wirklich gesetzt hat.
function drawOrthoMarks(P, I, dpr){
  if(!M.orthoInfo || !M.orthoInfo.ortho.length) return;
  const loops=C.wallLoops(P, M.walls);
  if(!loops) return;
  const set=new Set(M.orthoInfo.ortho), r=11*dpr;
  ctx.save(); ctx.strokeStyle=INK.meas; ctx.lineWidth=1.3*dpr;
  loops.forEach(L=>L.forEach((p,i)=>{
    if(!set.has(p.id)) return;
    const a=toScr(L[(i+L.length-1)%L.length]), c=toScr(p), b=toScr(L[(i+1)%L.length]);
    const u=(q)=>{ const l=Math.hypot(q.x-c.x,q.y-c.y)||1; return {x:(q.x-c.x)/l*r, y:(q.y-c.y)/l*r}; };
    const ua=u(a), ub=u(b);
    ctx.beginPath(); ctx.moveTo(c.x+ua.x,c.y+ua.y); ctx.lineTo(c.x+ua.x+ub.x,c.y+ua.y+ub.y); ctx.lineTo(c.x+ub.x,c.y+ub.y); ctx.stroke();
  }));
  ctx.restore();
}

// Festgelegte Winkel: 90 Grad als Quadrat wie die gesetzten rechten Winkel,
// sonst ein Bogen mit Gradzahl. In Akzentfarbe - das hat der Nutzer
// bestimmt, nicht der Ausgleich.
function drawFixAngles(P, I, dpr){
  const rows=C.angleRows(P, M.angs);
  if(!rows.length) return;
  const r=13*dpr;
  ctx.save(); ctx.strokeStyle=INK.accent; ctx.fillStyle=INK.accent; ctx.lineWidth=1.8*dpr;
  ctx.font=`600 ${11*dpr}px ${CANVAS_FONT}`; ctx.textAlign='center';
  rows.forEach(g=>{
    const a=toScr(P[I[g.a]]), c=toScr(P[I[g.c]]), b=toScr(P[I[g.b]]);
    const u=q=>{ const l=Math.hypot(q.x-c.x,q.y-c.y)||1; return {x:(q.x-c.x)/l, y:(q.y-c.y)/l}; };
    const ua=u(a), ub=u(b);
    ctx.beginPath();
    if(Math.abs(g.deg-90)<1e-6){
      ctx.moveTo(c.x+ua.x*r,c.y+ua.y*r); ctx.lineTo(c.x+(ua.x+ub.x)*r,c.y+(ua.y+ub.y)*r); ctx.lineTo(c.x+ub.x*r,c.y+ub.y*r);
    } else {
      // Bogen ueber den kleineren Winkel zwischen den Schenkeln.
      const t0=Math.atan2(ua.y,ua.x), t1=Math.atan2(ub.y,ub.x);
      let d=t1-t0; while(d>Math.PI) d-=2*Math.PI; while(d<-Math.PI) d+=2*Math.PI;
      ctx.arc(c.x, c.y, r, t0, t0+d, d<0);
      const tm=t0+d/2;
      ctx.fillText(`${fmtGrad(g.deg)}°`, c.x+Math.cos(tm)*(r+12*dpr), c.y+Math.sin(tm)*(r+12*dpr)+4*dpr);
    }
    ctx.stroke();
  });
  ctx.restore();
}
