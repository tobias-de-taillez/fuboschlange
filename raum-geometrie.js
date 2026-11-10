// raum-geometrie.js – Geometrie rund um den Raum, DOM-frei: verdächtige
// Maße, Kreuzungsbremse, Wandansichten und Höhen, Öffnungen, Wandaufbau,
// DXF und STEP, Abwicklung, Entwirren, Räume im Gebäude. Unverändert aus dem
// früheren Block "store" von raumaufmass.html; alles hängt an globalThis.
// Braucht: raum-kern.js.
"use strict";
// Verdaechtigen-Menge aus den normierten Residuen: statistisch auffaellig
// (w > w0, Baarda) UND innerhalb der Gleichstand-Toleranz des Maximums.
// DOM-frei HIER statt im ui-Block, damit test/run.mjs sie prueft - dieselbe
// Menge steuert Tabelle (rote Zeile, Badge) und Plan (rote Messstrecke),
// und zwei getrennte Implementierungen wuerden irgendwann verschieden luegen.
globalThis.computeSuspects=function(w, w0, tieTol){
  if(!Array.isArray(w)) return new Set();
  const wMax=w.reduce((mx,x)=>(x!=null&&x>mx)?x:mx, -Infinity);
  const s=new Set();
  w.forEach((x,i)=>{ if(x!=null && x>w0 && x>=wMax*(1-tieTol)) s.add(i); });
  return s;
};
// Eingrenzungs-Kandidaten, wenn der w-Test den Schuldigen NICHT isolieren
// kann: bei Redundanz 1 sind alle w mathematisch identisch - welcher Wert
// falsch ist, laesst sich aus den vorhandenen Zahlen prinzipiell nicht
// ablesen. Der Ausweg ist eine WIEDERHOLUNG: trifft sie den Fehler, klafft
// sie sofort; trifft sie ihn nicht, ist die Strecke entlastet und der
// Kreis kleiner. Vorgeschlagen werden aktive Paare (dedupliziert), nach
// groesstem Residuumsbetrag zuerst - eine stabile, erklaerbare Reihenfolge.
globalThis.narrowCandidates=function(meas, v, cap){
  const count=new Map();
  meas.forEach(m=>{ const k=[m.a,m.b].sort().join('|'); count.set(k,(count.get(k)||0)+1); });
  const seen=new Set(), out=[];
  meas.forEach((m,i)=>{
    const k=[m.a,m.b].sort().join('|');
    if(seen.has(k)) return;
    seen.add(k);
    // Schon wiederholte Paare nicht erneut vorschlagen: waere die
    // Wiederholung inkonsistent, haette der w-Test laengst isoliert -
    // ein drittes Mal messen bringt nichts Neues.
    if(count.get(k)>=2) return;
    // Festgelegt: der Nutzer ist sich sicher, nachmessen schlaegt man ihm nicht vor.
    if(m.fix) return;
    out.push({a:m.a, b:m.b, av:Math.abs(v && v[i]!=null ? v[i] : 0)});
  });
  out.sort((p,q)=>q.av-p.av);
  return out.slice(0, cap).map(({a,b})=>({a,b}));
};
// Globaltest der Ausgleichung: T = Sum((v_i/sigma_i)^2) gegen das
// 95-Prozent-Quantil von Chi-Quadrat mit r Freiheitsgraden. Ein fester
// sigmaHat-Faktor uebersieht, dass sigmaHat mit wachsender Redundanz
// SINKT, waehrend der Fehler drinbleibt - gemessen am Nutzerfall: nach
// einer Wiederholung fiel sigmaHat von 15,0 auf 11,3 mm und rutschte
// unter die alte 2,5-sigma-Schwelle, obwohl die falsche Kante noch im
// Netz stand. T=10,2 gegen chi2(2)=5,99 warnt dort korrekt weiter.
globalThis.globalTestFails=function(v, sigmas, r){
  if(!r || r<=0 || !Array.isArray(v) || !v.length) return false;
  let T=0;
  v.forEach((vi,i)=>{ const s=(sigmas && sigmas[i])||5; T+=(vi/s)*(vi/s); });
  const q=[0,3.84,5.99,7.81,9.49,11.07,12.59,14.07,15.51,16.92,18.31];
  const crit = r<=10 ? q[r]
    : r*Math.pow(1-2/(9*r)+1.645*Math.sqrt(2/(9*r)),3);   // Wilson-Hilferty, 95 %
  return T>crit;
};
// ================= Sanfte Kreuzungsbremse =================
// Beim Ziehen einer Ecke soll das Kreuzen zweier Waende SPUERBAR schwer
// werden, nicht verboten: der Widerstand waechst stufenlos, quer dazu
// bleibt die Bewegung frei (man gleitet an der Zone entlang statt
// festzustecken), und mit Nachdruck kommt man hindurch. Kein Nachrechnen
// der Gesamtlage - nur der aktuelle Schritt wird skaliert. Deshalb kann
// die Bremse die Form nie umkrempeln.
const PUSH_THROUGH = 0.06;   // Restdurchlass an der Grenze: nie ganz gesperrt

function ptSegDist(p, a, b){
  const vx=b.x-a.x, vy=b.y-a.y, L2=vx*vx+vy*vy;
  const t=L2 ? Math.max(0,Math.min(1,((p.x-a.x)*vx+(p.y-a.y)*vy)/L2)) : 0;
  return Math.hypot(p.x-(a.x+vx*t), p.y-(a.y+vy*t));
}
// Abstand zweier Strecken; 0 wenn sie sich echt kreuzen.
function segSegDist(p1,p2,p3,p4){
  const C=globalThis.CORE;
  if(C.segCross(p1,p2,p3,p4)) return 0;
  return Math.min(ptSegDist(p1,p3,p4), ptSegDist(p2,p3,p4),
                  ptSegDist(p3,p1,p2), ptSegDist(p4,p1,p2));
}
globalThis.segSegDist=segSegDist;

// Kantenpaare, die der gezogene Punkt gefaehrden kann: seine eigenen
// Kanten gegen alle, die ihn nicht beruehren.
function criticalPairs(pts, walls, id){
  const C=globalThis.CORE, I=C.idx(pts), out=[];
  const mine=walls.filter(([a,b])=>a===id||b===id);
  walls.forEach(([c,d])=>{
    if(c===id||d===id) return;
    mine.forEach(([a,b])=>{
      if(a===c||a===d||b===c||b===d) return;      // teilen einen Endpunkt
      if(I[a]==null||I[b]==null||I[c]==null||I[d]==null) return;
      out.push([a,b,c,d]);
    });
  });
  return out;
}

// Dämpft den Zugvektor (dx,dy) des Punktes id. soft = Breite der
// Weichzone in Weltkoordinaten (der Aufrufer rechnet sie aus Bildschirm-
// pixeln um, damit sich die Bremse bei jedem Zoom gleich anfuehlt).
// Liefert {dx,dy,near:[[a,b,c,d],...]} - near sind die Paare in der Zone,
// die die UI dezent einfaerbt.
globalThis.dampenDrag=function(pts, walls, id, dx, dy, soft){
  const C=globalThis.CORE, I=C.idx(pts);
  const pairs=criticalPairs(pts, walls, id);
  const near=[];
  if(!pairs.length || (!dx&&!dy)) return {dx, dy, near};
  const at=(v)=>{                       // Abstand des Paares bei Versatz v
    return (a,b,c,d)=>{
      const P={}, base=I;
      const shift=q=>q.id===id ? {x:q.x+v.x, y:q.y+v.y} : q;
      return segSegDist(shift(pts[base[a]]), shift(pts[base[b]]),
                        pts[base[c]], pts[base[d]]);
    };
  };
  let vx=dx, vy=dy;
  // Schon gebremste Richtungen. Eine Ecke hat ZWEI Kanten, die derselben
  // Wand nahekommen - ohne diese Sperre daempft dasselbe Hindernis zweimal,
  // der Faktor quadriert sich (gemessen 1,7 % statt 12 %) und der
  // zugesagte Restdurchlass sinkt von 6 % auf 0,4 %: gesperrt statt zaeh.
  const done=[];
  pairs.forEach(([a,b,c,d])=>{
    const d0=at({x:0,y:0})(a,b,c,d);
    // Schon gekreuzt: NICHT bewachen - sonst waere eine verhedderte
    // Skizze fuer immer eingefroren und nicht mehr aufzuloesen.
    if(d0<=0) return;
    if(d0>=soft*3) return;              // weit weg: kein Aufwand, kein Effekt
    // Richtung, in der der Abstand waechst - numerisch, zwei Auswertungen.
    const h=Math.max(soft*0.05, 1e-6);
    const gx=(at({x:h,y:0})(a,b,c,d)-d0)/h, gy=(at({x:0,y:h})(a,b,c,d)-d0)/h;
    const gl=Math.hypot(gx,gy);
    if(gl<1e-12) return;
    const nx=gx/gl, ny=gy/gl;           // zeigt WEG von der Gefahr
    const vn=vx*nx+vy*ny;
    if(vn>=0) return;                   // Bewegung entfernt sich: frei lassen
    if(d0<soft) near.push([a,b,c,d]);
    if(done.some(n=>n[0]*nx+n[1]*ny>0.9)) return;   // Richtung schon gebremst
    done.push([nx,ny]);
    // Zaeh, aber nie gesperrt: quadratisch einlaufender Faktor plus Rest.
    const f=Math.max(PUSH_THROUGH, Math.min(1, (d0/soft)*(d0/soft)));
    vx+=vn*nx*(f-1); vy+=vn*ny*(f-1);   // nur der Normalanteil wird gedaempft
  });
  return {dx:vx, dy:vy, near};
};

// ================= Wandansichten =================
// Die Deckenhoehe gehoert zur ECKE, nicht zur Wand: die Wand A-B ist dann
// das Viereck (0,0)-(L,0)-(L,h_B)-(0,h_A). Zwei benachbarte Waende teilen
// ihre senkrechte Kante damit PER KONSTRUKTION - h_B ist dieselbe Zahl.
// Eine wandweise Hoehe braeuchte je Ecke zwei konkurrierende Werte, die
// eine Zwangsbedingung zusammenhaelt; hier ist der Widerspruch nicht
// einmal formulierbar. Trapez, Dreieck und Dachschraege fallen ab.
const H_DEFAULT = 2500;   // uebliche Deckenhoehe, bis etwas gemessen ist

// Hoehe je Ecke aus den Hoehenmessungen. Solange nur EIN Wert gemessen
// ist, gilt er fuer alle Ecken (der Normalfall: ein Raum, eine Decke).
// Ab dem zweiten abweichenden Wert zaehlt jede Ecke fuer sich, und
// ungemessene erben den Mittelwert - als "angenommen", nicht als Messung.
globalThis.cornerHeights=function(pts, meas){
  // Hoehe 0 ist zulaessig (Dreieckswand, Spitze in der Ecke) - nur negativ nicht.
  const hm=(meas||[]).filter(m=>m.kind==='h' && m.on!==false && Number.isFinite(m.d) && m.d>=0);
  const byId=new Map();
  hm.forEach(m=>{
    if(!byId.has(m.at)) byId.set(m.at, []);
    byId.get(m.at).push(m.d);
  });
  const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
  const gemessen=new Map();
  byId.forEach((v,k)=>gemessen.set(k, mean(v)));
  // Ungemessene Ecken erben die ZUERST gemessene Ecke: die erste Hoehe ist
  // die Raumhoehe, jede weitere eine Abweichung an genau ihrer Ecke. Der
  // fruehere Mittelwert gab bei A 2500 / B 2000 allen uebrigen Ecken
  // stillschweigend 2250 - einen Wert, den niemand gemessen hat.
  const fallback = hm.length ? gemessen.get(hm[0].at) : H_DEFAULT;
  const out={};
  pts.forEach(p=>{
    out[p.id] = gemessen.has(p.id)
      ? {h:gemessen.get(p.id), gemessen:true}
      : {h:fallback, gemessen:false};
  });
  return out;
};

// Die Wandflaeche als Polygon in Wandkoordinaten (x von Ecke a nach b,
// y vom Boden). Trapez, weil die beiden Ecken verschieden hoch sein
// koennen; bei Hoehe 0 an einer Seite ein Dreieck.
// Knickpunkte der Oberkante (Giebel, Kniestock) stehen als {kind:'k', id,
// a, b, x, d} in derselben Liste wie die Eckhoehen: x in mm ab Ecke a der
// gespeicherten Richtung, d die Hoehe dort. cornerHeights liest nur kind
// 'h', also bleiben Ecken und Knicke sauber getrennt.
globalThis.wallKnicks=function(meas, a, b, L){
  const k=[a,b].sort().join('|');
  return (meas||[]).filter(m=>m.kind==='k' && m.on!==false && Number.isFinite(m.x)
      && Number.isFinite(m.d) && m.d>=0 && [m.a,m.b].sort().join('|')===k)
    .map(m=>({x:m.a===a ? m.x : L-m.x, y:m.d, id:m.id}))
    .filter(p=>p.x>1 && p.x<L-1)
    .sort((p,q)=>p.x-q.x);
};
globalThis.wallShape=function(pts, meas, a, b){
  const C=globalThis.CORE, I=C.idx(pts);
  if(I[a]==null||I[b]==null) return null;
  const L=C.dist(pts[I[a]], pts[I[b]]);
  const H=globalThis.cornerHeights(pts, meas);
  const ha=H[a]?H[a].h:H_DEFAULT, hb=H[b]?H[b].h:H_DEFAULT;
  const knicks=globalThis.wallKnicks(meas, a, b, L);
  // Oberkante als Polylinie von a nach b; ohne Knick das bekannte Trapez.
  const top=[{x:0,y:ha}, ...knicks.map(k=>({x:k.x,y:k.y})), {x:L,y:hb}];
  return {L, ha, hb, top, knicks, hMax:Math.max(...top.map(p=>p.y)),
          poly:[{x:0,y:0},{x:L,y:0}, ...top.slice().reverse()],
          gemessen:(H[a]&&H[a].gemessen)&&(H[b]&&H[b].gemessen)};
};

// Deckenhoehe an der Stelle x einer Wand - in einem Trapez laeuft die
// Decke schraeg, und genau daran muss sich eine Oeffnung messen lassen.
globalThis.ceilingAt=function(shape, x){
  if(!shape || !(shape.L>0)) return shape?shape.ha:0;
  const T=shape.top || [{x:0,y:shape.ha},{x:shape.L,y:shape.hb}];
  const u=Math.max(0, Math.min(shape.L, x));
  for(let i=0;i<T.length-1;i++){
    const p=T[i], q=T[i+1];
    if(u<=q.x || i===T.length-2){
      const t=q.x>p.x ? (u-p.x)/(q.x-p.x) : 0;
      return p.y+(q.y-p.y)*Math.max(0,Math.min(1,t));
    }
  }
  return T[T.length-1].y;
};
// Niedrigste Decke ueber [x0,x1]: an den Enden ODER an einem Knick dazwischen
// (eine Kehle laege sonst unbemerkt unter einer Oeffnung).
globalThis.ceilingMin=function(shape, x0, x1){
  const f=globalThis.ceilingAt;
  let m=Math.min(f(shape,x0), f(shape,x1));
  (shape&&shape.top||[]).forEach(p=>{ if(p.x>x0 && p.x<x1) m=Math.min(m,p.y); });
  return m;
};

// Passt die Oeffnung vollstaendig in die Wand? Geprueft wird gegen die
// SCHRAEGE Decke, nicht gegen ein Rechteck - sonst raschte eine Oeffnung
// in einer Trapezwand oben durch die Decke.
globalThis.openingFits=function(shape, op){
  if(!shape) return false;
  if(op.x<-1e-6 || op.y<-1e-6) return false;
  if(op.x+op.w > shape.L+1e-6) return false;
  return op.y+op.h <= globalThis.ceilingMin(shape, op.x, op.x+op.w)+1e-6;
};

// Oeffnung in die Wand zwingen: waagerecht hart an die Kanten, senkrecht
// gegen die (ggf. schraege) Decke. Liefert eine neue Oeffnung.
globalThis.clampOpening=function(shape, op){
  const o={...op};
  o.w=Math.min(o.w, shape.L);
  o.x=Math.max(0, Math.min(shape.L-o.w, o.x));
  const platz=globalThis.ceilingMin(shape, o.x, o.x+o.w);
  o.h=Math.min(o.h, platz);
  o.y=Math.max(0, Math.min(platz-o.h, o.y));
  return o;
};

// Oeffnungen sind exklusiv: eine Tuer im Fenster ergibt kein Bauteil.
// Beruehrung (gemeinsame Kante) ist erlaubt, echte Ueberdeckung nicht -
// zwei Fenster direkt nebeneinander mit gemeinsamem Pfosten sind ein
// realer Fall, ein Millimeter Ueberlappung dagegen ein Fehler.
const OVERLAP_EPS = 1;   // mm; darunter gilt es als Beruehrung, nicht als Ueberdeckung
// Öffnungs-ids aus Dateien und geteilten Links: die App vergibt 'o'+Zahl,
// Fremdimporte und Tests auch andere kurze Namen ('t2'). Was kein solcher
// Name ist (Markup, Anführungszeichen, Leerzeichen, Listen, Objekte), wird
// beim Laden neu vergeben - die id landet in Attributen und Auswahllisten.
// Ohne id bleibt ohne id (aeltere Raeume). Aendert in place; map: alt -> neu,
// damit deserialize() die Verweise (Lagemasse, Eingang, Nachbarwand) mitzieht.
// Zahlen (Fremdimport) werden Strings: Auswahllisten und data-Attribute
// liefern immer Strings, alle Vergleiche sind strikt. 7 -> '7', wenn frei,
// sonst neu vergeben wie oben.
const OPEN_ID_RE=/^[\p{L}\p{N}_.:-]{1,64}$/u;
globalThis.openingIdOk=id=>id==null || (typeof id==='string' && OPEN_ID_RE.test(id));
globalThis.normOpeningIds=function(openings, seq){
  if(!(Number.isInteger(seq) && seq>0)) seq=openings.length+1;
  const map=new Map(), used=new Set(openings.filter(o=>o && typeof o.id==='string' && globalThis.openingIdOk(o.id)).map(o=>o.id));
  openings.forEach(o=>{
    if(!o || typeof o!=='object' || globalThis.openingIdOk(o.id)) return;
    const s=Number.isFinite(o.id) ? String(o.id) : null;
    let id;
    if(s && OPEN_ID_RE.test(s) && !used.has(s)) id=s;
    else { while(used.has('o'+seq)) seq++; id='o'+(seq++); }
    // Doppelte id (Fremdimport): die ERSTE Öffnung gewinnt, wie find() sie früher
    // auflöste - sonst hängen Lagemaß, Nachbartür und Eingang an der zweiten.
    used.add(id); if(!map.has(o.id)) map.set(o.id, id); o.id=id;
  });
  return {map, seq};
};
// Verweise auf Öffnungs-ids nach normOpeningIds mitziehen: Lagemaße (op),
// Nachbarwand (shared[*].tuer.op), Küchen-Eingang (kitchen.spec.entry).
// Ein Eingang, der als Zahl ankam und auf keine Öffnung zeigt, wird String
// wie alle ids. Aendert R in place (shared-Eintraege werden ersetzt).
globalThis.remapOpeningRefs=function(R, map){
  const neu=id=>map.has(id) ? map.get(id) : id;
  (R.opmeas||[]).forEach(m=>{ if(m) m.op=neu(m.op); });
  const sh=R.shared||{};
  for(const k of Object.keys(sh)){ const s=sh[k];
    if(s && s.tuer && typeof s.tuer==='object') sh[k]={...s, tuer:{...s.tuer, op:neu(s.tuer.op)}}; }
  const sp=R.kitchen && R.kitchen.spec;
  if(sp && sp.entry!=null){ const e=neu(sp.entry); sp.entry=typeof e==='string' ? e : String(e); }
};
// Lagemaß-ids: wie die Öffnungs-ids landen sie in data-Attributen (Lagemaß-
// Liste). Fehlend, kein solcher Name (Markup, Zahl, Objekt) oder doppelt:
// neu als 'om'+n. Der Zähler wurde nie gespeichert – aus den Daten nachziehen
// (nach dem Laden begann er wieder bei om1, × löschte gleich zwei Maße).
// Aendert in place, gibt den nächsten freien Zähler zurück.
globalThis.normOpMeasIds=function(list, seq){
  const num=id=>{ const m=/^om(\d+)$/.exec(typeof id==='string' ? id : ''); return m ? +m[1] : 0; };
  seq=Math.max(Number.isInteger(seq) && seq>0 ? seq : 1, 1+Math.max(0, ...list.map(m=>num(m && m.id))));
  const seen=new Set();
  list.forEach(m=>{ if(!m || typeof m!=='object') return;
    if(!(typeof m.id==='string' && OPEN_ID_RE.test(m.id)) || seen.has(m.id)) m.id='om'+(seq++);
    seen.add(m.id); });
  return seq;
};
globalThis.openingsOverlap=function(a, b){
  return a.x + a.w > b.x + OVERLAP_EPS
      && b.x + b.w > a.x + OVERLAP_EPS
      && a.y + a.h > b.y + OVERLAP_EPS
      && b.y + b.h > a.y + OVERLAP_EPS;
};
// Passt die Oeffnung an dieser Stelle - in der Wand UND ohne die anderen
// zu ueberdecken?
globalThis.openingPlaceable=function(shape, op, others){
  if(!globalThis.openingFits(shape, op)) return false;
  return !(others||[]).some(o=>o.id!==op.id && globalThis.openingsOverlap(op, o));
};
// Zug aufloesen: erst die volle Bewegung, sonst nur waagerecht, sonst nur
// senkrecht, sonst gar nicht. Das laesst die Oeffnung an einer fremden
// Kante ENTLANGGLEITEN, statt sie stumpf festzuhalten.
globalThis.slideOpening=function(shape, op, ziel, others){
  const clamp=globalThis.clampOpening, ok=globalThis.openingPlaceable;
  const voll=clamp(shape, {...op, x:ziel.x, y:ziel.y});
  if(ok(shape, voll, others)) return voll;
  const nurX=clamp(shape, {...op, x:ziel.x, y:op.y});
  if(ok(shape, nurX, others)) return nurX;
  const nurY=clamp(shape, {...op, x:op.x, y:ziel.y});
  if(ok(shape, nurY, others)) return nurY;
  return {...op};
};
// Freien Platz suchen, wenn die Vorbelegung schon besetzt ist. Erst auf
// der Vorzugshoehe nach rechts wandern, dann in Hoehenstufen - so landet
// eine zweite Tuer neben der ersten und nicht darueber.
globalThis.findFreeSpot=function(shape, op, others){
  if(globalThis.openingPlaceable(shape, op, others)) return op;
  const schritt=Math.max(50, op.w/4);
  const hMax=shape.hMax!=null ? shape.hMax : Math.max(shape.ha, shape.hb);
  for(let dy=0; dy<=hMax; dy+=Math.max(100, op.h/2)){
    for(const y of (dy===0?[op.y]:[op.y+dy, op.y-dy])){
      if(y<0) continue;
      for(let x=0; x<=shape.L-op.w+1e-6; x+=schritt){
        const k=globalThis.clampOpening(shape, {...op, x, y});
        if(globalThis.openingPlaceable(shape, k, others)) return k;
      }
    }
  }
  return null;
};

// Vorbelegung beim Einsetzen: nichts erscheint an absurder Stelle, auch
// ohne eine einzige Messung. Tuer steht auf dem Boden, Fenster und
// Wandloch sitzen mittig im oberen Bereich.
globalThis.defaultOpening=function(shape, kind){
  if(kind==='door'){
    // Hoehe gegen die Decke UEBER der Tuer, nicht gegen die niedrigere Ecke:
    // in einer Dreieckswand waere die sonst 0.
    const w=Math.min(985, shape.L), x=(shape.L-w)/2;
    const h=Math.min(1985, globalThis.ceilingMin(shape, x, x+w));
    return globalThis.clampOpening(shape, {kind, w, h, x, y:0});
  }
  const hMit=globalThis.ceilingAt(shape, shape.L/2);
  const w=shape.L*2/3, h=hMit/3;
  return globalThis.clampOpening(shape, {kind, w, h, x:(shape.L-w)/2, y:hMit*0.4});
};

// ================= Öffnungen im Grundriss =================
// Die Oeffnung liegt in Wandkoordinaten (x entlang der Wand). Fuer den
// Grundriss werden daraus zwei Weltpunkte: Anfang und Ende der Luecke in
// der Wandlinie.
globalThis.openingWorld=function(pts, a, b, op){
  const C=globalThis.CORE, I=C.idx(pts);
  if(I[a]==null||I[b]==null) return null;
  const A=pts[I[a]], B=pts[I[b]];
  const L=C.dist(A,B);
  if(!(L>0)) return null;
  const ux=(B.x-A.x)/L, uy=(B.y-A.y)/L;          // entlang der Wand
  const t0=Math.max(0,Math.min(L,op.x)), t1=Math.max(0,Math.min(L,op.x+op.w));
  return {
    P:{x:A.x+ux*t0, y:A.y+uy*t0},
    Q:{x:A.x+ux*t1, y:A.y+uy*t1},
    u:{x:ux, y:uy}, n:{x:-uy, y:ux},             // Normale (Linksdrehung)
    L,
  };
};

// Wie weit kann das Blatt schwingen, bevor es irgendwo anstoesst? Der
// Strahl wird schrittweise gedreht und gegen alle Waende geprueft. Die
// EIGENE Wand ist ausgenommen - auf ihr steht das geschlossene Blatt.
// Gedeckelt bei 180 Grad, und kurz VOR dem Hindernis gestoppt: zeichnete
// man bis zur Beruehrung, waere der Bogen nicht mehr vom Winkel zwischen
// zwei Waenden zu unterscheiden.
const SWING_CLEAR = 4*Math.PI/180;    // Sicherheitsabstand, damit der Radius als Radius lesbar bleibt
globalThis.swingLimit=function(pts, walls, ownWall, hinge, radius, dir0, sense){
  const C=globalThis.CORE, I=C.idx(pts);
  const k=[ownWall[0],ownWall[1]].sort().join('|');
  const segs=walls.filter(([c,d])=>[c,d].sort().join('|')!==k
      && I[c]!=null && I[d]!=null).map(([c,d])=>[pts[I[c]],pts[I[d]]]);
  const step=2*Math.PI/180;
  let frei=0;
  for(let ang=step; ang<=Math.PI+1e-9; ang+=step){
    const th=dir0+sense*ang;
    const tip={x:hinge.x+Math.cos(th)*radius, y:hinge.y+Math.sin(th)*radius};
    // Beruehrt das Blatt in dieser Stellung eine Wand?
    const blockiert=segs.some(([p,q])=>C.segCross(hinge,tip,p,q));
    if(blockiert) break;
    frei=ang;
  }
  return Math.max(0, frei>0 ? frei-SWING_CLEAR : 0);
};

// Drehtuer im Grundriss: Angel, Startwinkel des geschlossenen Blatts,
// Drehsinn und wie weit es frei schwingt. null fuer alles ohne Schwenk
// (Fenster, Loch, Schiebetuer). Plan und DXF-Export teilen sich das, damit
// die Tuer in Shapr3D genau so aufgeht wie auf dem Bildschirm.
globalThis.doorSwing=function(pts, walls, o){
  if(o.kind!=='door' || !o.swing || o.swing.type==='slide' || o.swing.type==='none') return null;
  const C=globalThis.CORE, r=globalThis.openingWorld(pts, o.a, o.b, o);
  if(!r) return null;
  const links=o.swing.hinge==='left';
  const angel=links?r.P:r.Q;
  const dir0=Math.atan2(links?r.u.y:-r.u.y, links?r.u.x:-r.u.x);
  // Nach innen heisst: auf die Seite, auf der die Raumflaeche liegt.
  const poly=C.wallPolygon(pts, walls);
  let sense=+1;
  if(poly){
    const probe={x:angel.x+r.n.x*10, y:angel.y+r.n.y*10};
    const innen=C.pointInPoly(probe, poly);
    // Kreuzprodukt u x n ist +1; das Blatt dreht zur Normalen hin,
    // wenn sie nach innen zeigt (bzw. umgekehrt bei "nach aussen").
    const zurNormalen = links ? +1 : -1;
    sense = (innen !== !!o.swing.out) ? zurNormalen : -zurNormalen;
  }
  const max=globalThis.swingLimit(pts, walls, [o.a,o.b], angel, o.w, dir0, sense);
  return {r, angel, dir0, sense, max};
};

// ================= Wandaufbau fuer CAD (DXF und STEP) =================
// wallBands traegt jede Wand mit ihrer (meist angenommenen) Dicke nach aussen
// auf. Das geht schief an WANDZUNGEN: zwei gegenlaeufige Innenkanten mit
// kurzer Spitze dazwischen, deren Abstand kleiner ist als die beiden Dicken
// zusammen (Hesterkamp: F-V-W 152-166 mm, N-O-P-Q 315-333 mm, angenommen je
// 240). Dann laufen die Baender durch die Zunge in den Raum, ueberkreuzen
// sich an der Spitze und das DXF hat eine sich selbst schneidende
// Aussenkontur. Die Zunge ist aber gemessen - ihre Innenflaechen SIND die
// Wand. Darum wird sie vor den Baendern abgetrennt: sie wird ein eigener
// Koerper aus ihren echten Innenflaechen (Dicke = Abstand aus dem Aufmass,
// keine Annahme), und die Baender laufen ueber einen vereinfachten Ring.
//   1. Flanke laeuft weiter (F-V-W): Fusspunkt X = Gerade(E-F) x Gerade(W-L);
//      Ring E -> X -> L, Zunge F, V, W, X.
//   2. dasselbe gespiegelt: X = Gerade(L-M) x Gerade(F-V).
//   3. Vorsprung aus gerader Wand (N-O-P-Q): Ring M -> N -> Q -> A,
//      Zunge N, O, P, Q.
// Gekuerzte Baender behalten die Wand-ID (orig) - daran haengen Oeffnungen
// und gemessene Dicken. wallBands selbst bleibt unberuehrt (Plan, Nachbarn).
// Danach prueft ein Waechter jedes Band; was er nicht abnimmt, wird nicht
// exportiert, sondern beim Namen genannt.
globalThis.wallLayout=function(pts, walls, thick, hmeas){
  const C=globalThis.CORE;
  const ring=C.wallPolygon(pts, walls);
  if(!ring || ring.length<3) return null;
  const T0=globalThis.THICK_DEFAULT, MIN=50;
  const key=(a,b)=>[a,b].sort().join('|');
  const gem=k=>!!(thick && thick[k]>0);
  const tOf=k=>gem(k)?thick[k]:T0;
  const H=globalThis.cornerHeights(pts, hmeas), Hs={};
  const hOf=id=>Hs[id]!=null ? Hs[id] : H[id].h;
  const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y}), dot=(a,b)=>a.x*b.x+a.y*b.y;
  const len=v=>Math.hypot(v.x,v.y), dist=(a,b)=>len(sub(a,b));
  const unit=v=>{ const l=len(v); return {x:v.x/l,y:v.y/l}; };
  // Gerade p-q geschnitten mit Gerade r-s; t laeuft entlang r -> s.
  const schnitt=(p,q,r,s)=>{
    const d1=sub(q,p), d2=sub(s,r), den=d1.x*d2.y-d1.y*d2.x;
    if(Math.abs(den)<1e-9) return null;
    const w=sub(r,p), t=(w.x*d1.y-w.y*d1.x)/den;
    return {x:r.x+d2.x*t, y:r.y+d2.y*t, t};
  };
  const cosW=Math.cos(globalThis.NAH_WINKEL_CAD*Math.PI/180);
  // k: Wand-ID (sortiert, wie M.thick und Oeffnungen), nm: Name in Laufrichtung
  let R=ring.map((p,i)=>({p, k:key(p.id, ring[(i+1)%ring.length].id), nm:`${p.id}-${ring[(i+1)%ring.length].id}`}));
  R.forEach(n=>{ n.t=tOf(n.k); n.gem=gem(n.k); });
  const zungen=[];
  for(let runde=0; runde<50; runde++){
    const n=R.length;
    if(n<6) break;                       // danach muss ein Ring bleiben
    let A2=0; for(let i=0,j=n-1;i<n;j=i++) A2+=R[j].p.x*R[i].p.y-R[i].p.x*R[j].p.y;
    const ccw=A2>0, aussen=u=>ccw?{x:u.y,y:-u.x}:{x:-u.y,y:u.x};
    let neu=null;
    for(let i=0;i<n && !neu;i++){
      const nP=R[(i+n-1)%n], nA=R[i], nB=R[(i+1)%n], nC=R[(i+2)%n], nD=R[(i+3)%n], nN=R[(i+4)%n];
      const p=nP.p, a=nA.p, b=nB.p, c=nC.p, d=nD.p, nn=nN.p;
      const la=dist(a,b), lt=dist(b,c), lc=dist(c,d);
      if(!(la>1 && lt>1 && lc>1) || lt>NAH_MAX) continue;
      const u1=unit(sub(b,a)), u2=unit(sub(d,c));
      if(dot(u1,u2) > -cosW) continue;                    // nicht gegenlaeufig
      const gap=dot(sub(c,b), aussen(u1));                // Flanke 2 hinter Flanke 1?
      if(!(gap>1) || gap>=nA.t+nC.t) continue;            // keine Zunge / Baender stossen nicht
      const nah=q=>dist(q.a,q.b)<=1.5*gap+MIN;
      const hz=(q,r,t)=>hOf(q.id)+(hOf(r.id)-hOf(q.id))*t;
      // 1. Flanke 2 laeuft ueber den Fuss hinaus weiter
      let X=schnitt(p,a,c,d);
      if(X && X.t>0 && X.t*lc<lc-MIN && nah({a,b:X})){
        const id=`${a.id}~${d.id}`; Hs[id]=hz(c,d,X.t);
        neu={weg:[i,(i+1)%n,(i+2)%n], ein:{p:{id,x:X.x,y:X.y}, k:nC.k, nm:nC.nm, t:nC.t, gem:nC.gem},
             zunge:{poly:[a,b,c,{id,x:X.x,y:X.y}], kanten:[nA.k,nB.k], teil:nC.k}};
        break;
      }
      // 2. gespiegelt: Flanke 1 laeuft weiter
      X=schnitt(d,nn,a,b);
      if(X && X.t<1 && X.t*la>MIN && nah({a:d,b:X})){
        const id=`${d.id}~${a.id}`; Hs[id]=hz(a,b,X.t);
        neu={weg:[(i+1)%n,(i+2)%n,(i+3)%n], nach:i, ein:{p:{id,x:X.x,y:X.y}, k:nD.k, nm:nD.nm, t:nD.t, gem:nD.gem},
             zunge:{poly:[{id,x:X.x,y:X.y},b,c,d], kanten:[nB.k,nC.k], teil:nA.k}};
        break;
      }
      // 3. Vorsprung aus einer geraden Wand: Fuesse a und d auf einer Linie
      const ub=unit(sub(a,p)), ud=unit(sub(nn,d));
      const abw=Math.abs(dot(sub(d,a), {x:-ub.y,y:ub.x}));
      if(dot(ub,ud)>cosW && abw<0.25*gap+10 && dist(a,d)<=1.5*gap+MIN){
        const erb=nP.gem?nP:nD.gem?nD:nP;
        neu={weg:[(i+1)%n,(i+2)%n], nach:i, setze:{k:key(a.id,d.id), nm:`${a.id}-${d.id}`, t:erb.t, gem:erb.gem},
             zunge:{poly:[a,b,c,d], kanten:[nA.k,nB.k,nC.k]}};
        break;
      }
    }
    if(!neu) break;
    const anker=R[neu.nach!=null?neu.nach:neu.weg[0]];
    if(neu.setze) Object.assign(anker, neu.setze);
    const bleibt=R.filter((_,j)=>!neu.weg.includes(j));
    if(neu.ein){
      const pos=neu.nach!=null ? bleibt.indexOf(anker)+1 : bleibt.indexOf(R[(neu.weg[0]+n-1)%n])+1;
      bleibt.splice(pos, 0, neu.ein);
    }
    R=bleibt;
    zungen.push({...neu.zunge, name:'Wandzunge '+neu.zunge.poly.map(q=>q.id.includes('~')?'':q.id).filter(Boolean).join('-')});
  }
  // Baender ueber den vereinfachten Ring (Inseln bleiben, wie sie sind).
  const pts2=[...R.map(n=>n.p), ...ring.holes.flat()];
  const walls2=[...R.map((n,i)=>[n.p.id, R[(i+1)%R.length].p.id]),
                ...ring.holes.flatMap(h=>h.map((q,i)=>[q.id, h[(i+1)%h.length].id]))];
  const thick2={}, orig={};
  R.forEach((n,i)=>{ const k=key(n.p.id, R[(i+1)%R.length].p.id); orig[k]=n; if(n.gem) thick2[k]=n.t; });
  const bands=globalThis.wallBands(pts2, walls2, thick2, T0);
  if(bands.length!==R.length) return {ring, bands:[], zungen, hOf, fehler:['Wandaufbau: Ring nach dem Abtrennen ungültig']};
  bands.forEach(b=>{ const n=orig[key(b.a,b.b)]; b.orig=n.k; b.nm=n.nm; });
  // Waechter: jedes Band ein einfaches Viereck, ausserhalb des Raums, ohne
  // Ueberlappung mit einem nicht benachbarten Band.
  const fehler=[], nm=b=>b.nm;
  const quad=b=>[b.iA,b.iB,b.oB,b.oA];
  const kreuzt=(P,Q)=>P.some((p,i)=>Q.some((q,j)=>C.segCross(p,P[(i+1)%P.length],q,Q[(j+1)%Q.length])));
  const raumKanten=[ring,...ring.holes].flatMap(L=>L.map((q,i)=>[q,L[(i+1)%L.length]]));
  bands.forEach((b,i)=>{
    const Q=quad(b);
    if(C.segCross(Q[0],Q[1],Q[2],Q[3]) || C.segCross(Q[1],Q[2],Q[3],Q[0])) fehler.push(`Wand ${nm(b)}: Wandkörper verdreht`);
    else if([b.oA,b.oB,{x:(b.oA.x+b.oB.x)/2,y:(b.oA.y+b.oB.y)/2}].some(q=>C.pointInPoly(q, ring))
         || raumKanten.some(([p,q])=>C.segCross(b.oA,b.oB,p,q))) fehler.push(`Wand ${nm(b)} ragt in den Raum`);
  });
  for(let i=0;i<bands.length;i++) for(let j=i+1;j<bands.length;j++){
    const nb=j===i+1 || (i===0 && j===bands.length-1);
    if(!nb && kreuzt(quad(bands[i]),quad(bands[j]))) fehler.push(`Wände ${nm(bands[i])} und ${nm(bands[j])} überlappen`);
  }
  const alle=[...ring, ...ring.holes.flat(), ...bands.map(b=>b.oA)];
  const frame={x0:Math.min(...alle.map(p=>p.x)), y1:Math.max(...alle.map(p=>p.y))};
  return {ring, bands, zungen, hOf, H, frame, fehler};
};
globalThis.NAH_WINKEL_CAD=5;   // Grad, wie NAH_WINKEL: bis dahin gilt "gegenlaeufig"

// ================= DXF fuer CAD (Shapr3D) =================
// Shapr3D liest DXF als 2D-Skizze: geschlossene Linienzuege werden dort zu
// Flaechen, die man extrudiert. Deshalb nur LINE und ARC (Polylinien
// machen in Shapr3D-Skizzen Aerger), jede Kante genau einmal und gemeinsame
// Ecken ueber denselben Formatierer - sonst schliesst sich kein Zug.
// Shapr3D macht aus JEDEM Layer eine eigene Skizze, und Flaechen entstehen
// nur innerhalb einer Skizze (gemessen am Import). Darum liegen Innenkontur,
// Inseln, Wandaussenkante und Tuerlaibungen zusammen auf GRUNDRISS: dort
// werden Boden (mit Inseln als Loch), Inseln und die Wandstuecke zwischen
// den Tueren je eine Flaeche. Das Tuerblatt hat einen eigenen Layer, sonst
// zerschnitte sein Bogen die Bodenflaeche. WAND_ANGENOMMEN zeichnet die
// Aussenkanten mit angenommener Dicke noch einmal nach - nur als Hinweis,
// der Layer ist aus.
// Innenkontur = echter Ring, Aussenkontur = Baender des vereinfachten Rings
// (wallLayout) - die beiden Zuege haben nicht mehr gleich viele Kanten.
// Bildschirm-y zeigt nach unten, DXF-y nach oben: y wird gespiegelt, sonst
// kaeme der Raum seitenverkehrt an. Ursprung ist die linke untere Ecke der
// Aussenkontur, Einheit mm ($INSUNITS 4).
// Rueckgabe {dxf, fehler, hinweise}; dxf ist null, wenn der Waechter etwas
// findet.
globalThis.roomDxf=function(pts, walls, thick, openings, name){
  const W=globalThis.wallLayout(pts, walls, thick, []);
  if(!W) return null;
  if(W.fehler.length) return {dxf:null, fehler:W.fehler, hinweise:[]};
  const {ring, bands, frame}=W;
  const f=v=>{ const s=v.toFixed(3); return s==='-0.000' ? '0.000' : s; };
  const X=p=>f(p.x-frame.x0), Y=p=>f(frame.y1-p.y);
  const ents=[], used=new Set(), hinweise=[];
  const line=(lay,a,b)=>{
    if(X(a)===X(b) && Y(a)===Y(b)) return;
    used.add(lay);
    ents.push(`0\nLINE\n8\n${lay}\n10\n${X(a)}\n20\n${Y(a)}\n30\n0.0\n11\n${X(b)}\n21\n${Y(b)}\n31\n0.0`);
  };
  const zug=(lay,R)=>R.forEach((p,i)=>line(lay,p,R[(i+1)%R.length]));
  const key=(a,b)=>[a,b].sort().join('|');
  const band=new Map(bands.map(b=>[b.orig,b]));
  // Laibungen: innen auf der echten Kante, aussen auf dem Band derselben Wand.
  // Innen- und Aussenkante werden an jeder Laibung GETEILT: Shapr3D soll
  // keine T-Stoesse selbst verschneiden muessen.
  const lb=new Map();                      // Wand-ID -> [{innen, aussen}]
  (openings||[]).forEach(o=>{
    const k=key(o.a,o.b), b=band.get(k), r=globalThis.openingWorld(pts, o.a, o.b, o);
    if(!r) return;
    if(!b){ hinweise.push(`Öffnung in ${o.a}-${o.b} liegt an einer Wandzunge – ohne Laibung exportiert`); return; }
    [r.P, r.Q].forEach(p=>{
      const s=(p.x-b.iA.x)*b.u.x+(p.y-b.iA.y)*b.u.y;
      if(s>0.5 && s<b.L-0.5){
        if(!lb.has(k)) lb.set(k,[]);
        lb.get(k).push({innen:p, aussen:{x:p.x+b.n.x*b.t, y:p.y+b.n.y*b.t}, s});
      }
    });
  });
  const proj=(A,u,p)=>(p.x-A.x)*u.x+(p.y-A.y)*u.y;
  ring.forEach((p,i)=>{
    const q=ring[(i+1)%ring.length], L=Math.hypot(q.x-p.x,q.y-p.y), u={x:(q.x-p.x)/L,y:(q.y-p.y)/L};
    const S=(lb.get(key(p.id,q.id))||[]).map(j=>({t:proj(p,u,j.innen), pt:j.innen})).filter(j=>j.t>0.5&&j.t<L-0.5).sort((x,y)=>x.t-y.t);
    const kette=[p, ...S.map(j=>j.pt), q];
    for(let k=0;k+1<kette.length;k++) line('GRUNDRISS', kette[k], kette[k+1]);
  });
  bands.forEach((b,i)=>{
    const nb=bands[(i+1)%bands.length];
    const S=(lb.get(b.orig)||[]).slice().sort((x,y)=>x.s-y.s);
    // Gehrungspunkte einmal je Ecke: Endpunkt = Anfang des naechsten Bands.
    const kette=[b.oA, ...S.map(j=>j.aussen), nb.oA];
    for(let k=0;k+1<kette.length;k++) line('GRUNDRISS', kette[k], kette[k+1]);
    S.forEach(j=>line('GRUNDRISS', j.innen, j.aussen));
    if(b.assumed) line('WAND_ANGENOMMEN', b.oA, nb.oA);
  });
  ring.holes.forEach(h=>zug('GRUNDRISS', h));
  const deg=a=>{ let d=a*180/Math.PI%360; if(d<0) d+=360; return f(d); };
  (openings||[]).forEach(o=>{
    const s=globalThis.doorSwing(pts, walls, o);
    if(!s || !(s.max>0)) return;
    const th1=s.dir0+s.sense*s.max;
    line('TUERBLATT', s.angel, {x:s.angel.x+Math.cos(th1)*o.w, y:s.angel.y+Math.sin(th1)*o.w});
    // Mit gespiegeltem y wird aus Winkel t der Winkel -t, und der Drehsinn
    // kehrt sich um. DXF-Boegen laufen immer gegen den Uhrzeiger.
    const [von,bis] = s.sense<0 ? [-s.dir0, -th1] : [-th1, -s.dir0];
    used.add('TUERBLATT');
    ents.push(`0\nARC\n8\nTUERBLATT\n10\n${X(s.angel)}\n20\n${Y(s.angel)}\n30\n0.0\n40\n${f(o.w)}\n50\n${deg(von)}\n51\n${deg(bis)}`);
  });
  // Farben nach ACI: Grundriss weiss/schwarz, Tuerblatt cyan, angenommene
  // Wand hellgrau. Negative Farbe = Layer aus (DXF-Konvention).
  const FARBE={GRUNDRISS:7, TUERBLATT:4, WAND_ANGENOMMEN:-9};
  const layer=Object.keys(FARBE).filter(l=>used.has(l));
  const w=bands.map(b=>b.oA.x-frame.x0), h=bands.map(b=>frame.y1-b.oA.y);
  const dxf=[
    '999', `Raumaufmass ${String(name||'').replace(/[\r\n]+/g,' ')} - Masse in mm`,
    '0','SECTION','2','HEADER',
    '9','$ACADVER','1','AC1009',
    '9','$INSUNITS','70','4',
    '9','$MEASUREMENT','70','1',
    '9','$EXTMIN','10','0.000','20',f(Math.min(...h)),'30','0.0',
    '9','$EXTMAX','10',f(Math.max(...w)),'20',f(Math.max(...h)),'30','0.0',
    '0','ENDSEC',
    '0','SECTION','2','TABLES',
    '0','TABLE','2','LTYPE','70','1',
    '0','LTYPE','2','CONTINUOUS','70','0','3','Solid line','72','65','73','0','40','0.0',
    '0','ENDTAB',
    '0','TABLE','2','LAYER','70',String(layer.length),
    ...layer.flatMap(l=>['0','LAYER','2',l,'70','0','62',String(FARBE[l]),'6','CONTINUOUS']),
    '0','ENDTAB',
    '0','ENDSEC',
    '0','SECTION','2','ENTITIES',
    ents.join('\n'),
    '0','ENDSEC',
    '0','EOF',''
  ].join('\n');
  return {dxf, fehler:[], hinweise};
};

// ================= STEP fuer CAD (Shapr3D, 3D) =================
// Waende als Volumenkoerper. Je Wand ein Koerper aus ihrem Profil in
// Wandkoordinaten (s entlang der Innenkante ab Ecke iA, z vom Boden):
// Decke je Ecke (cornerHeights), Fenster/Loecher als Durchbruch, Tueren ab
// Boden als Aussparung von unten, Oeffnungen bis zur Decke als Aussparung
// von oben; eine Oeffnung vom Boden bis zur Decke teilt die Wand in zwei
// Koerper. Innen liegt das Profil auf der Innenkante, aussen auf der
// Aussenkante; an den Raumecken sitzen die Aussenpunkte auf der Gehrung
// (wallBands) - Nachbarwaende stossen dort exakt aneinander. Waende kommen
// aus wallLayout: Wandzungen und Inseln werden Pfeiler vom Boden bis zur
// Decke. Gleicher Ursprung und gleiche y-Spiegelung wie das DXF, damit beide
// Dateien uebereinander liegen.
globalThis.roomSolids=function(pts, walls, thick, openings, hmeas){
  const Wl=globalThis.wallLayout(pts, walls, thick, hmeas);
  if(!Wl) return null;
  if(Wl.fehler.length) return {solids:[], fehler:Wl.fehler, hinweise:[]};
  const {ring, bands, zungen, hOf, H, frame}=Wl;
  const P3=(p,z)=>[p.x-frame.x0, frame.y1-p.y, z];
  const add=(p,v,k)=>({x:p.x+v.x*k, y:p.y+v.y*k});
  const key=(a,b)=>[a,b].sort().join('|');
  const EPS=1;                                      // mm
  const solids=[], hinweise=[];
  const anBand=new Set(bands.map(b=>b.orig));
  (openings||[]).forEach(o=>{ if(!anBand.has(key(o.a,o.b))) hinweise.push(`Öffnung in ${o.a}-${o.b} liegt an einer Wandzunge – nicht ausgeschnitten`); });
  const IP=globalThis.CORE.idx(pts);
  bands.forEach(b=>{
    const L=b.L, ha=hOf(b.a), hb=hOf(b.b);
    // Knickpunkte dieser Wand in s-Lage (ab iA entlang b.u; die Wand kann
    // andersherum laufen als m.a -> m.b, siehe Oeffnungen unten).
    const kn=(hmeas||[]).filter(m=>m.kind==='k' && m.on!==false && Number.isFinite(m.x) && Number.isFinite(m.d)
        && m.d>=0 && key(m.a,m.b)===b.orig && IP[m.a]!=null && IP[m.b]!=null)
      .map(m=>{
        const A=pts[IP[m.a]], B=pts[IP[m.b]], l=Math.hypot(B.x-A.x,B.y-A.y)||1;
        const w={x:A.x+(B.x-A.x)*m.x/l, y:A.y+(B.y-A.y)*m.x/l};
        return [(w.x-b.iA.x)*b.u.x+(w.y-b.iA.y)*b.u.y, m.d];
      }).filter(([sk])=>sk>EPS && sk<L-EPS).sort((p,q)=>p[0]-q[0]);
    const top=[[0,ha], ...kn, [L,hb]];
    const ceil=s=>{
      for(let i=0;i<top.length-1;i++){
        const [s0,z0]=top[i], [s1,z1]=top[i+1];
        if(s<=s1 || i===top.length-2) return z0+(z1-z0)*Math.max(0,Math.min(1,(s-s0)/((s1-s0)||1)));
      }
      return hb;
    };
    const ceilMin=(s0,s1)=>Math.min(ceil(s0), ceil(s1), ...kn.filter(([sk])=>sk>s0 && sk<s1).map(k=>k[1]));
    // Oeffnungen dieser Wand in s-Lage (die Wand kann andersherum laufen
    // als o.a -> o.b, und ein gekuerztes Band beginnt nicht an o.a;
    // projiziert wird auf b.u ab iA).
    const ops=[];
    (openings||[]).forEach(o=>{
      if(key(o.a,o.b)!==b.orig) return;
      const r=globalThis.openingWorld(pts, o.a, o.b, o);
      if(!r || !(o.h>0)) return;
      const pr=p=>(p.x-b.iA.x)*b.u.x+(p.y-b.iA.y)*b.u.y;
      let s0=Math.min(pr(r.P),pr(r.Q)), s1=Math.max(pr(r.P),pr(r.Q));
      if(s0<-EPS || s1>L+EPS){ hinweise.push(`Öffnung in ${o.a}-${o.b} liegt an einer Wandzunge – nicht ausgeschnitten`); return; }
      s0=Math.max(0,s0); s1=Math.min(L,s1);
      if(s1-s0<EPS) return;
      if(s0<EPS) s0=0; if(s1>L-EPS) s1=L;
      const z0=Math.max(0,o.y||0), z1=z0+o.h;
      const unten=z0<EPS, oben=z1>=ceilMin(s0,s1)-EPS;
      if(unten && z1<=EPS) return;
      ops.push({s0,s1,z0,z1,unten,oben,kind:o.kind});
    });
    ops.sort((p,q)=>p.s0-q.s0);
    // Durchgehende Oeffnungen teilen die Wand in Stuecke [a,b].
    const stuecke=[]; let a=0;
    ops.filter(o=>o.unten&&o.oben).forEach(o=>{ if(o.s0-a>EPS) stuecke.push([a,o.s0]); a=o.s1; });
    if(L-a>EPS) stuecke.push([a,L]);
    stuecke.forEach(([sa,sb],k)=>{
      const imStueck=ops.filter(o=>!(o.unten&&o.oben) && o.s0>=sa-EPS && o.s1<=sb+EPS);
      const nah=(x,y)=>Math.abs(x-y)<EPS;
      // Profil gegen den Uhrzeiger (s nach rechts, z nach oben).
      const R=[];
      const unt=imStueck.filter(o=>o.unten), obn=imStueck.filter(o=>o.oben).reverse();
      // unten links -> rechts
      if(unt.length && nah(unt[0].s0,sa)) R.push([sa,unt[0].z1]); else R.push([sa,0]);
      unt.forEach(o=>{
        if(!nah(o.s0,sa)) R.push([o.s0,0],[o.s0,o.z1]);
        if(!nah(o.s1,sb)) R.push([o.s1,o.z1],[o.s1,0]); else R.push([sb,o.z1]);
      });
      if(!(unt.length && nah(unt[unt.length-1].s1,sb))) R.push([sb,0]);
      // oben rechts -> links
      if(obn.length && nah(obn[0].s1,sb)) R.push([sb,obn[0].z0]); else R.push([sb,ceil(sb)]);
      obn.forEach(o=>{
        if(!nah(o.s1,sb)) R.push([o.s1,ceil(o.s1)],[o.s1,o.z0]);
        if(!nah(o.s0,sa)) R.push([o.s0,o.z0],[o.s0,ceil(o.s0)]); else R.push([sa,o.z0]);
      });
      if(!(obn.length && nah(obn[obn.length-1].s0,sa))) R.push([sa,ceil(sa)]);
      // Knicke in die Oberkante: zwischen zwei Deckenpunkten, die von rechts
      // nach links laufen (die Unterkante laeuft andersherum - so landet ein
      // Knick nie im Boden, auch nicht bei Hoehe 0 an beiden Ecken).
      const anDecke=p=>Math.abs(p[1]-ceil(p[0]))<EPS;
      for(let i=R.length-1;i>=0;i--){
        const p=R[i], q=R[(i+1)%R.length];
        if(!(p[0]>q[0]+EPS && anDecke(p) && anDecke(q))) continue;
        const dazu=kn.filter(([sk])=>sk<p[0]-EPS && sk>q[0]+EPS).sort((x,y)=>y[0]-x[0]);
        R.splice(i+1, 0, ...dazu.map(k=>[k[0],k[1]]));
      }
      const prof=R.filter((p,i)=>{ const q=R[(i+R.length-1)%R.length]; return !(nah(p[0],q[0])&&nah(p[1],q[1])); });
      const loecher=imStueck.filter(o=>!o.unten&&!o.oben)
        .map(o=>[[o.s0,o.z0],[o.s0,o.z1],[o.s1,o.z1],[o.s1,o.z0]]);
      // Profilpunkt -> innen/aussen in 3D. An einer echten Raumecke liegt der
      // Aussenpunkt auf der Gehrung, an einem Schnitt senkrecht gegenueber.
      const verts=[], idx=new Map();
      const V=(p,z)=>{ const q=P3(p,z), kk=q.map(v=>v.toFixed(4)).join(','); if(!idx.has(kk)){ idx.set(kk,verts.length); verts.push(q); } return idx.get(kk); };
      const innen=([s,z])=>V(add(b.iA,b.u,s),z);
      const aussen=([s,z])=>{
        const p= (s<EPS) ? b.oA : (s>L-EPS) ? b.oB : add(add(b.iA,b.u,s),b.n,b.t);
        return V(p,z);
      };
      const faces=[];
      const loops=[prof,...loecher];
      faces.push(loops.map(l=>l.map(innen)));
      faces.push(loops.map(l=>l.map(aussen).reverse()));
      loops.forEach(l=>l.forEach((p,i)=>{
        const q=l[(i+1)%l.length];
        faces.push([[innen(q),innen(p),aussen(p),aussen(q)]]);
      }));
      solids.push({name:`Wand ${b.nm}${stuecke.length>1?` (${k+1})`:''}`, verts, faces});
    });
  });
  // Pfeiler vom Boden bis zur Decke der jeweiligen Ecke: Wandzungen und Inseln.
  const pfeiler=(h,name)=>{
    const verts=[], n=h.length;
    h.forEach(p=>verts.push(P3(p,0)));
    h.forEach(p=>verts.push(P3(p,hOf(p.id))));
    const faces=[[h.map((_,i)=>n-1-i)], [h.map((_,i)=>n+i)]];
    h.forEach((_,i)=>{ const j=(i+1)%n; faces.push([[i,j,n+j,n+i]]); });
    solids.push({name, verts, faces});
  };
  zungen.forEach(z=>pfeiler(z.poly, z.name));
  ring.holes.forEach((h,k)=>pfeiler(h, `Insel ${k+1} (${h.map(p=>p.id).join('-')})`));
  // Ein einziger gemessener Wert gilt in cornerHeights fuer alle Ecken (ein
  // Raum, eine Decke) - das ist dann keine Annahme.
  const gm=pts.filter(p=>H[p.id].gemessen), einWert=new Set(gm.map(p=>Math.round(H[p.id].h))).size===1;
  const g=einWert ? pts.length : gm.length;
  return {solids, fehler:[], hinweise:[...new Set(hinweise)],
          hoehen:[...new Set(pts.map(p=>Math.round(H[p.id].h)))],
          gemessen: g===pts.length ? 'alle' : g ? 'teils' : 'keine'};
};

// Geschlossene Polyeder -> STEP AP214 (ADVANCED_BREP aus ebenen Flaechen).
// Kopf, Produktkette und mm-Kontext wie ein Export von Open CASCADE 7.8.
// Invarianten, an denen handgeschriebenes STEP sonst scheitert: jede Kante
// genau zweimal mit Gegensinn (geteilte Ecken ueber einen Schluessel),
// Flaechen eben (sonst in Dreiecke zerlegt), Umlaufsinn nach aussen (aus
// dem Vorzeichen des Volumens - die y-Spiegelung kehrt ihn um), REAL immer
// mit Dezimalpunkt, Namen nur ASCII.
globalThis.solidPrepare=function(sol){
  const V=sol.verts;
  const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const newell=l=>{ const n=[0,0,0]; l.forEach((i,k)=>{ const p=V[i], q=V[l[(k+1)%l.length]];
    n[0]+=(p[1]-q[1])*(p[2]+q[2]); n[1]+=(p[2]-q[2])*(p[0]+q[0]); n[2]+=(p[0]-q[0])*(p[1]+q[1]); }); return n; };
  // Ohrenschneiden in der Ebene der groessten Normalenkomponente.
  const ears=l=>{
    const n=newell(l), ax=[0,1,2].reduce((m,i)=>Math.abs(n[i])>Math.abs(n[m])?i:m,0);
    const [u,v]=[[1,2],[2,0],[0,1]][ax], sg=Math.sign(n[ax])||1;
    const P=i=>[V[i][u],V[i][v]];
    const cr=(a,b,c)=>((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))*sg;
    const rest=[...l], out=[];
    let schutz=0;
    while(rest.length>3 && schutz++<1000){
      let ok=false;
      for(let i=0;i<rest.length;i++){
        const a=rest[(i+rest.length-1)%rest.length], b=rest[i], c=rest[(i+1)%rest.length];
        if(cr(P(a),P(b),P(c))<=1e-9) continue;
        if(rest.some(x=>x!==a&&x!==b&&x!==c && cr(P(a),P(b),P(x))>=0 && cr(P(b),P(c),P(x))>=0 && cr(P(c),P(a),P(x))>=0)) continue;
        out.push([a,b,c]); rest.splice(i,1); ok=true; break;
      }
      if(!ok) break;
    }
    out.push(rest);
    return out;
  };
  const faces=[];
  sol.faces.forEach(F=>{
    const n=newell(F[0]), ln=Math.hypot(...n);
    const p0=V[F[0][0]];
    const eben=ln>0 && F.every(l=>l.every(i=>Math.abs(dot(sub(V[i],p0),n))/ln<1e-3));
    if(eben || F.length>1) faces.push(F);
    else ears(F[0]).forEach(t=>faces.push([t]));
  });
  // Volumen (Divergenzsatz ueber Faecher je Schleife); negativ -> umdrehen.
  let vol=0;
  faces.forEach(F=>F.forEach(l=>{ for(let k=1;k+1<l.length;k++) vol+=dot(V[l[0]],cross(V[l[k]],V[l[k+1]]))/6; }));
  if(vol<0){ faces.forEach(F=>F.forEach(l=>l.reverse())); vol=-vol; }
  // Kanten: jede gerichtete genau einmal, jede ungerichtete genau zweimal.
  const ger=new Map();
  faces.forEach(F=>F.forEach(l=>l.forEach((i,k)=>{ const j=l[(k+1)%l.length], kk=i+'>'+j; ger.set(kk,(ger.get(kk)||0)+1); })));
  const dicht=[...ger].every(([kk,c])=>c===1 && ger.get(kk.split('>').reverse().join('>'))===1);
  const eben=faces.every(F=>{ const n=newell(F[0]), ln=Math.hypot(...n), p0=V[F[0][0]];
    return ln>0 && F.every(l=>l.every(i=>Math.abs(dot(sub(V[i],p0),n))/ln<1e-3)); });
  return {name:sol.name, verts:V, faces, vol, dicht, eben, newell};
};
globalThis.stepFile=function(solids, name){
  const ascii=s=>String(s||'').replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue')
    .replace(/Ä/g,'Ae').replace(/Ö/g,'Oe').replace(/Ü/g,'Ue').replace(/ß/g,'ss')
    .replace(/[^\x20-\x7e]/g,'_').replace(/\\/g,'/').replace(/'/g,"''");
  const R=v=>{ let s=(Math.abs(v)<5e-7?0:v).toFixed(6).replace(/0+$/,''); return s; };   // "2500." / "0.5"
  const out=[]; let id=0;
  const E=txt=>{ out.push(`#${++id}=${txt};`); return '#'+id; };
  const pt=p=>E(`CARTESIAN_POINT('',(${p.map(R).join(',')}))`);
  const dir=d=>{ const l=Math.hypot(...d); return E(`DIRECTION('',(${d.map(v=>R(v/l)).join(',')}))`); };
  const apd=E(`APPLICATION_CONTEXT('core data for automotive mechanical design processes')`);
  E(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${apd})`);
  const pc=E(`PRODUCT_CONTEXT('',${apd},'mechanical')`);
  const nm=ascii(name)||'Raum';
  const prod=E(`PRODUCT('${nm}','${nm}','Raumaufmass - Masse in mm',(${pc}))`);
  const pdf=E(`PRODUCT_DEFINITION_FORMATION('','',${prod})`);
  const pdc=E(`PRODUCT_DEFINITION_CONTEXT('part definition',${apd},'design')`);
  const pd=E(`PRODUCT_DEFINITION('design','',${pdf},${pdc})`);
  const pds=E(`PRODUCT_DEFINITION_SHAPE('','',${pd})`);
  E(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(${prod}))`);
  const mm=E(`( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )`);
  const rad=E(`( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )`);
  const sr=E(`( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )`);
  const unc=E(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-03),${mm},'distance_accuracy_value','confusion accuracy')`);
  const ctx=E(`( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${unc})) GLOBAL_UNIT_ASSIGNED_CONTEXT((${mm},${rad},${sr})) REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY') )`);
  const ach=E(`AXIS2_PLACEMENT_3D('',${pt([0,0,0])},${dir([0,0,1])},${dir([1,0,0])})`);
  const breps=solids.map(S=>{
    const V=S.verts;
    const vp=V.map(p=>E(`VERTEX_POINT('',${pt(p)})`));
    const kanten=new Map();
    const kante=(i,j)=>{
      const kk=i<j?i+'|'+j:j+'|'+i;
      if(!kanten.has(kk)){
        const [a,b]=i<j?[i,j]:[j,i], d=[0,1,2].map(k=>V[b][k]-V[a][k]), l=Math.hypot(...d);
        const ln=E(`LINE('',${pt(V[a])},${E(`VECTOR('',${dir(d)},${R(l)})`)})`);
        kanten.set(kk, E(`EDGE_CURVE('',${vp[a]},${vp[b]},${ln},.T.)`));
      }
      return E(`ORIENTED_EDGE('',*,*,${kanten.get(kk)},${i<j?'.T.':'.F.'})`);
    };
    const faces=S.faces.map(F=>{
      const n=S.newell(F[0]);
      const p0=V[F[0][0]], p1=V[F[0][1]];
      let r=[p1[0]-p0[0],p1[1]-p0[1],p1[2]-p0[2]];
      const ln=Math.hypot(...n), nn=n.map(v=>v/ln), d=r[0]*nn[0]+r[1]*nn[1]+r[2]*nn[2];
      r=r.map((v,k)=>v-d*nn[k]);
      const ebene=E(`PLANE('',${E(`AXIS2_PLACEMENT_3D('',${pt(p0)},${dir(nn)},${dir(r)})`)})`);
      const bounds=F.map((l,k)=>{
        const el=E(`EDGE_LOOP('',(${l.map((i,m)=>kante(i,l[(m+1)%l.length])).join(',')}))`);
        return E(`${k?'FACE_BOUND':'FACE_OUTER_BOUND'}('',${el},.T.)`);
      });
      return E(`ADVANCED_FACE('',(${bounds.join(',')}),${ebene},.T.)`);
    });
    return E(`MANIFOLD_SOLID_BREP('${ascii(S.name)}',${E(`CLOSED_SHELL('',(${faces.join(',')}))`)})`);
  });
  const rep=E(`ADVANCED_BREP_SHAPE_REPRESENTATION('${nm}',(${[ach,...breps].join(',')}),${ctx})`);
  E(`SHAPE_DEFINITION_REPRESENTATION(${pds},${rep})`);
  const t=new Date().toISOString().slice(0,19);
  return ['ISO-10303-21;','HEADER;',
    `FILE_DESCRIPTION(('Raumaufmass ${nm}'),'2;1');`,
    `FILE_NAME('${nm}.step','${t}',(''),(''),'Raumaufmass','Raumaufmass','');`,
    `FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));`,
    'ENDSEC;','DATA;', ...out, 'ENDSEC;','END-ISO-10303-21;',''].join('\n');
};

// ================= Abwicklung =================
// Die Waende legen sich im Grundriss flach hin wie ein SCHATTEN, mit dem
// Licht im Fokuspunkt: jeder Wandpunkt faellt radial vom Fokus weg, nicht
// entlang der Wandnormalen. Dadurch faechert die Wand auf, statt starr um
// ihre Fusslinie zu scharnieren. Der Klappgrad haengt vom Abstand zum
// Fokuspunkt ab: Waende direkt unter dem Fokus bleiben flach (nur eine
// Linie), ferne legen sich hin und zeigen ihren Inhalt. Ueber der
// Raummitte schwebend sind alle gleich weit weg - die symmetrische
// Uebersicht.
const VIEW_FADE = 0.3;   // ab diesem cos ist die Wand voll aufgeklappt
globalThis.unfoldFactor=function(mitte, fokus, refDist, nOut){
  if(!(refDist>0)) return 0;
  const vx=mitte.x-fokus.x, vy=mitte.y-fokus.y;
  const d=Math.hypot(vx,vy);
  let f=Math.max(0, Math.min(1, d/refDist));
  // Nur Waende aufklappen, auf die man VON INNEN schaut. Zeigt die
  // Aussennormale zum Fokus hin (cos < 0), steht der Betrachter
  // ausserhalb - dann klappte die Wand ihm entgegen, quer ueber den Raum
  // oder ueber andere Waende. Gemessen an einem U-Raum mit Fokus
  // ausserhalb: vier von acht Waenden hatten cos <= 0 und klappten
  // trotzdem voll auf. Betrifft auch die Kerbe eines konkaven Raums.
  if(nOut && d>1e-9){
    const cos=(vx*nOut.x+vy*nOut.y)/d;
    f*=Math.max(0, Math.min(1, cos/VIEW_FADE));
  }
  return f;
};
// Schattenwurf: die Richtung, in die eine Wand weggelegt wird, zeigt vom
// Fokus zur Wandmitte. EINE Richtung fuer die ganze Wand - laege jede Ecke
// radial zu ihrem eigenen Fusspunkt, waere die Wand-Decken-Kante nicht mehr
// parallel zur Wand-Boden-Kante und die Ansicht verzerrt.
globalThis.unfoldDir=function(mitte, fokus, nFallback){
  let dx=mitte.x-fokus.x, dy=mitte.y-fokus.y;
  const d=Math.hypot(dx,dy);
  if(d>1e-9) return {x:dx/d, y:dy/d};
  return nFallback ? {x:nFallback.x, y:nFallback.y} : {x:0, y:0};  // genau unterm Fokus
};
// Ein Wandpunkt (Fusspunkt base, Hoehe y) in der Welt. Die Auslenkung ist
// auf UNFOLD_MAX der Hoehe gedeckelt - voll ausgelegt deckte eine
// 2,5-m-Wand den halben Grundriss zu.
const UNFOLD_MAX = 1/3;
globalThis.unfoldPoint=function(base, dir, y, f){
  const s=y*f*UNFOLD_MAX;
  return {x:base.x+dir.x*s, y:base.y+dir.y*s};
};
// Halbe Diagonale der Bounding-Box - der natuerliche Bezug fuer "weit weg".
globalThis.planRefDist=function(pts){
  if(!pts.length) return 0;
  const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
  return Math.hypot(Math.max(...xs)-Math.min(...xs), Math.max(...ys)-Math.min(...ys))/2;
};
// Aussennormale einer Wand: die der beiden Normalen, die NICHT in den
// Raum zeigt. Ohne geschlossenes Polygon gibt es kein Innen - dann die
// Linksnormale, damit die Abwicklung wenigstens konsistent liegt.
globalThis.outerNormal=function(pts, walls, a, b){
  const C=globalThis.CORE, I=C.idx(pts);
  const A=pts[I[a]], B=pts[I[b]];
  const L=C.dist(A,B)||1;
  const n={x:-(B.y-A.y)/L, y:(B.x-A.x)/L};
  const poly=C.wallPolygon(pts, walls);
  if(!poly) return n;
  const mitte={x:(A.x+B.x)/2, y:(A.y+B.y)/2};
  const probe={x:mitte.x+n.x*1, y:mitte.y+n.y*1};
  return C.pointInPoly(probe, poly) ? {x:-n.x, y:-n.y} : n;
};

// ================= Öffnungen einmessen =================
// Eine Messung bindet EINE Kante der Oeffnung an EINE Bezugskante der
// Wand: {op, edge:'left'|'right'|'bottom'|'top', d, sigma}. Daraus wird
// jeweils die linke untere Ecke zurueckgerechnet:
//   left   -> x = d                 right -> x = L - w - d
//   bottom -> y = d                 top   -> y = Decke - h - d
// Jede Messung betrifft damit NUR x oder NUR y. Das Problem zerfaellt in
// zwei unabhaengige gewichtete Mittelwerte - kein Gauss-Newton noetig,
// und die Aussagen (Redundanz, normiertes Residuum) bleiben dieselben
// wie im Grundriss, weil der Mittelwert genau die Ausgleichung EINER
// Unbekannten ist.
function opObs(shape, op, m){
  const s=m.sigma||5;
  if(m.edge==='left')   return {achse:'x', wert:m.d, s};
  if(m.edge==='right')  return {achse:'x', wert:shape.L-op.w-m.d, s};
  if(m.edge==='bottom') return {achse:'y', wert:m.d, s};
  if(m.edge==='top'){
    // Gegen die Decke ueber der Oeffnungsmitte - in einer Trapezwand
    // laeuft sie schraeg, und genau daran misst man auf der Baustelle.
    const decke=globalThis.ceilingAt(shape, op.x+op.w/2);
    return {achse:'y', wert:decke-op.h-m.d, s};
  }
  return null;
}
// Gewichteter Mittelwert je Achse samt Kontrollgroessen. Bei n Messungen
// einer Unbekannten ist der Redundanzanteil jeder Messung 1 - 1/n (bei
// gleichen Gewichten) - dieselbe Groesse, die im Grundriss aus der
// Hutmatrix kommt, hier in geschlossener Form.
function axisFit(obs){
  if(!obs.length) return {n:0, wert:null, v:[], red:[], w:[], sigmaHat:null};
  let sw=0, swx=0;
  obs.forEach(o=>{ const g=1/(o.s*o.s); sw+=g; swx+=g*o.wert; });
  const wert=swx/sw;
  const v=obs.map(o=>wert-o.wert);
  const n=obs.length;
  const red=obs.map(o=>{ const g=1/(o.s*o.s); return Math.max(0, 1-g/sw); });
  const w=obs.map((o,i)=> red[i]<0.01 ? null : Math.abs(v[i])/(o.s*Math.sqrt(red[i])));
  const sigmaHat = n>1
    ? Math.sqrt(obs.reduce((s,o,i)=>s+v[i]*v[i]/(o.s*o.s),0)/(n-1))
    : null;
  return {n, wert, v, red, w, sigmaHat};
}
// Liefert die eingemessene Lage plus Diagnose. Ohne Messung bleibt die
// Achse, wie sie ist (gezogen oder vorbelegt) - ehrlich als "geschaetzt".
globalThis.solveOpening=function(shape, op, meas){
  const eigene=(meas||[]).filter(m=>m.op===op.id && m.on!==false);
  const obs=eigene.map(m=>({m, o:opObs(shape, op, m)})).filter(e=>e.o);
  const xs=obs.filter(e=>e.o.achse==='x'), ys=obs.filter(e=>e.o.achse==='y');
  const fx=axisFit(xs.map(e=>e.o)), fy=axisFit(ys.map(e=>e.o));
  const ziel={...op};
  if(fx.wert!=null) ziel.x=fx.wert;
  if(fy.wert!=null) ziel.y=fy.wert;
  // Verdaechtig ist, was Baardas Schwelle reisst - dieselbe Regel wie im
  // Grundriss, damit "verdaechtig" ueberall dasselbe heisst.
  // Verdaechtig ist, was Baardas Schwelle reisst UND nahe am groessten w
  // liegt - exakt computeSuspects wie im Grundriss. Die blosse Schwelle
  // reicht nicht: ein grober Ausreisser zieht den Mittelwert mit, dann
  // reissen ALLE Residuen die Schwelle und die Aussage waere wertlos
  // (gemessen an 1200/1205/1400: w = 16,7 / 15,5 / 32,3).
  const verdacht=new Set();
  [[xs,fx],[ys,fy]].forEach(([liste,fit])=>{
    const s2=globalThis.computeSuspects(fit.w, 3.29, 0.02);
    s2.forEach(i=>verdacht.add(liste[i].m.id));
  });
  return {ziel, x:fx, y:fy, verdacht,
          rows:obs.map((e,i)=>({m:e.m, achse:e.o.achse}))};
};
// Gemessen schlaegt geschaetzt: eine eingemessene Oeffnung nimmt die Lage
// ein, die ihre Masse ihr geben. Liegt dort eine, deren seitliche Lage nur
// geschaetzt ist (kein Mass von links oder rechts - ein Hoehenmass allein
// haelt sie nicht fest), weicht die seitlich aus - buendig an die naechste
// freie Kante, auf ihrer Hoehe. Geht das nicht (die andere ist selbst seitlich
// eingemessen, oder zum Ausweichen fehlt der Platz: eng), bleibt alles liegen
// und stoesst nennt, womit sie zusammenstoesst. Still verwerfen waere eine
// Luege: das Mass stuende in der Liste, die Oeffnung laege woanders.
// Aendert nichts. Liefert {platz, weicht:[{op,x}], stoesst:[op], wand, eng}:
// platz null = nicht eingemessen oder Widerspruch; wand = das Mass legt sie
// weiter aus der Wand, als die Messgenauigkeit hergibt (3,29 * 5 mm, Baardas
// Schwelle wie oben) - sie liegt dann am Rand.
globalThis.settleOpening=function(shape, op, others, meas){
  const fest=(o, seitlich)=>(meas||[]).some(m=>m.op===o.id && m.on!==false
    && (!seitlich || m.edge==='left' || m.edge==='right'));
  if(!fest(op)) return {platz:null, weicht:[], stoesst:[], wand:false, eng:false};
  const clamp=globalThis.clampOpening, so=globalThis.solveOpening;
  // Zweimal: "von der Decke" haengt unter einer Schraege an der seitlichen Lage.
  let ziel=so(shape, op, meas).ziel;
  ziel=so(shape, {...op, x:clamp(shape, ziel).x}, meas).ziel;
  const platz=clamp(shape, ziel);
  const wand=Math.max(Math.abs(platz.x-ziel.x), Math.abs(platz.y-ziel.y))>3.29*5;
  const rest=(others||[]).filter(o=>o.id!==op.id);
  const imWeg=rest.filter(o=>globalThis.openingsOverlap(platz, o));
  const stoesst=imWeg.filter(o=>fest(o, true)), weicht=[];
  // haengt: die Nachbarin im Weg ist eingemessen, liegt aber selbst nicht auf
  // ihrem Mass (etwas haelt sie fest), und dort, wo ihr Mass sie hinlegt, waere
  // sie nicht im Weg. Dann widersprechen sich die beiden Masse nicht.
  const soll=o=>{ let z=so(shape, o, meas).ziel; z=so(shape, {...o, x:clamp(shape, z).x}, meas).ziel; return clamp(shape, z); };
  const haengt=stoesst.length>0 && stoesst.every(o=>!globalThis.openingsOverlap(platz, soll(o)));
  let eng=false;
  // Naechste freie Lage neben dem, was schon liegt: buendig an eine Kante.
  const ruecke=(w, belegt)=>{
    const xs=[0, shape.L-w.w];
    belegt.forEach(b=>xs.push(b.x-w.w, b.x+b.w));
    return xs.sort((p,q)=>Math.abs(p-w.x)-Math.abs(q-w.x))
      .map(x=>({...w, x})).find(k=>globalThis.openingPlaceable(shape, k, belegt));
  };
  if(!stoesst.length){
    const belegt=[platz, ...rest.filter(o=>!imWeg.includes(o))];
    for(const w of imWeg){
      const frei=ruecke(w, belegt);
      if(!frei){ stoesst.push(w); eng=true; break; }
      weicht.push({op:w, x:frei.x}); belegt.push(frei);
    }
    // Fehlt der Platz nur, weil daneben eine andere geschaetzte liegt, rueckt
    // die mit: zweiter Anlauf, in dem alle seitlich nur geschaetzten ruecken
    // duerfen - erst die im Weg, dann die uebrigen, jede nur, wenn sie muss.
    // Geht auch das nicht, bleibt es beim Ergebnis des ersten Anlaufs.
    if(eng){
      const liegt=[platz, ...rest.filter(o=>fest(o, true))], kette=[];
      const lose=[...imWeg, ...rest.filter(o=>!imWeg.includes(o) && !fest(o, true))];
      const geht=lose.every(w=>{
        const frei=globalThis.openingPlaceable(shape, w, liegt) ? w : ruecke(w, liegt);
        if(!frei) return false;
        if(frei!==w) kette.push({op:w, x:frei.x});
        liegt.push(frei); return true;
      });
      if(geht){ stoesst.length=0; weicht.length=0; weicht.push(...kette); eng=false; }
    }
  }
  return stoesst.length ? {platz:null, weicht:[], stoesst, wand, eng, haengt} : {platz, weicht, stoesst, wand, eng, haengt};
};

// ================= Entwirren =================
// Ein geschlossener, teilgemessener Wandzug kann sich beim Skizzieren
// verheddern (Waende kreuzen sich). Gesucht: eine kreuzungsfreie Lage, die
// alle eingetragenen Masse weiter erfuellt. Heuristik nach der
// Extremwertbetrachtung: Ecken stossen praktisch nie mit ~180 Grad
// (kollinear) und nie mit wenigen Grad (Spitznadel) aufeinander - also
// Energie E = Sum(-log sin theta) minimieren: sie explodiert an BEIDEN
// Extremen und ist bei rechtwinkligen Ecken am kleinsten. Kreuzende Lagen
// sind hart verboten (Energie unendlich).
function ringAngleEnergy(ring, C){
  if(!ring || C.ringSelfIntersects(ring)) return Infinity;
  let E=0;
  const n=ring.length;
  for(let i=0;i<n;i++){
    const p=ring[(i-1+n)%n], q=ring[i], r=ring[(i+1)%n];
    const v1x=p.x-q.x, v1y=p.y-q.y, v2x=r.x-q.x, v2y=r.y-q.y;
    const th=Math.atan2(Math.abs(v1x*v2y-v1y*v2x), v1x*v2x+v1y*v2y);   // 0..pi
    E+=-Math.log(Math.max(Math.sin(th),1e-9));
  }
  return E;
}
globalThis.ringAngleEnergy=ringAngleEnergy;
// Deterministischer Zufall (mulberry32): Entwirren soll unter gleichem
// Seed gleich entscheiden - sonst sind die Selbstchecks Wuerfelwuerfe.
function mulberry32(seed){
  let a=seed>>>0;
  return function(){
    a|=0; a=(a+0x6D2B79F5)|0;
    let t=Math.imul(a^(a>>>15), 1|a);
    t=(t+Math.imul(t^(t>>>7), 61|t))^t;
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
// Liefert eine kreuzungsfreie Punktlage (Array wie pts) oder null.
// Kandidaten: 1) der aktuelle Zustand, 2) ein regelmaessiges Polygon in
// Anlegereihenfolge (per Konstruktion kreuzungsfrei, dann von solve() auf
// die Masse gezogen), 3) zufaellige Stoerungen entlang der freien Moden
// des Netzes, jeweils mit solve() als Korrektor. Gewinnt die kleinste
// Winkel-Energie unter den kreuzungsfreien, masshaltigen Lagen.
// Von zwei spiegelgleichen Loesungen die nehmen, die naeher an der Vorlage
// liegt. Gebraucht, weil Abstaende spiegelblind sind: ein Raum und sein
// Spiegelbild haben exakt dieselben Masse, und keine Lagesuche kann sie
// unterscheiden. Der Umlaufsinn des Wandrings taugt als Vergleich NICHT - die
// Vorlage kreuzt sich ja gerade, und ein gekreuzter Ring hat keine
// Haendigkeit (seine Flaeche ist die Differenz der Schlaufen, das Vorzeichen
// beliebig).
//
// Verglichen wird deshalb die LAGE: welche Variante laesst sich durch Drehen,
// Schieben und Skalieren besser auf die Vorlage legen. Das hat eine
// geschlossene Loesung - fasst man die zentrierten Punkte als komplexe Zahlen
// auf, ist der beste erreichbare Wert |Summe x*conj(y)|^2, und Spiegeln
// heisst dort schlicht conj(y) durch y ersetzen. Kein Suchen, ein Durchlauf.
function spiegelWieVorlage(vorlage, pts){
  const C=globalThis.CORE, I=C.idx(pts), paare=[];
  vorlage.forEach(p=>{ const q=pts[I[p.id]]; if(q) paare.push([p,q]); });
  if(paare.length<3) return pts;
  const n=paare.length;
  const mx=paare.reduce((s,[p])=>s+p.x,0)/n, my=paare.reduce((s,[p])=>s+p.y,0)/n;
  const nx=paare.reduce((s,[,q])=>s+q.x,0)/n, ny=paare.reduce((s,[,q])=>s+q.y,0)/n;
  let ar=0, ai=0, br=0, bi=0;              // a = Summe x*conj(y), b = Summe x*y
  paare.forEach(([p,q])=>{
    const xr=p.x-mx, xi=p.y-my, yr=q.x-nx, yi=q.y-ny;
    ar+=xr*yr+xi*yi;  ai+=xi*yr-xr*yi;
    br+=xr*yr-xi*yi;  bi+=xr*yi+xi*yr;
  });
  if(br*br+bi*bi <= ar*ar+ai*ai) return pts;
  // Am eigenen Schwerpunkt spiegeln, nicht an der y-Achse: der Raum soll sich
  // umdrehen, nicht zusaetzlich quer ueber den Bildschirm wandern.
  const cx=pts.reduce((s,p)=>s+p.x,0)/pts.length;
  return pts.map(p=>({...p, x:2*cx-p.x}));
}

globalThis.untangle=function(pts, walls, meas, tries, seed, angs){
  const C=globalThis.CORE;
  const ring0=C.wallPolygonRing(pts, walls);
  // Entwirren permutiert EINEN Ring - mit Inseln gibt es mehrere.
  if(!ring0 || ring0.holes.length) return null;
  const order=ring0.map(p=>p.id);
  const rnd=mulberry32(seed==null?1:seed);
  const act=C.activeMeas(meas);
  // Zielkantenlaenge: Mittel der gemessenen Werte, sonst der Skizze.
  let mean=0;
  if(act.length) mean=act.reduce((s,m)=>s+m.d,0)/act.length;
  else { for(let i=0;i<ring0.length;i++) mean+=Math.hypot(
      ring0[i].x-ring0[(i+1)%ring0.length].x, ring0[i].y-ring0[(i+1)%ring0.length].y)/ring0.length; }
  const evalCand=(cand)=>{
    // Masse halten: solve() ist der Korrektor; ohne Messungen bleibt die
    // Lage wie vorgeschlagen.
    const fit=act.length ? C.solve(cand, meas, angs) : {pts:cand, converged:true};
    const P=fit.pts;
    // Masshaltigkeit ist Pflicht: eine "entwirrte" Lage, die eingetragene
    // Werte verbiegt, waere eine Luege.
    if(act.length && C.residuals(P, meas).some(v=>Math.abs(v)>50)) return null;
    const I=C.idx(P);
    const ring=order.map(id=>P[I[id]]);
    return {P, E:ringAngleEnergy(ring, C)};
  };
  let best=null;
  const consider=r=>{ if(r && r.E<Infinity && (!best || r.E<best.E)) best=r; };
  consider(evalCand(pts.map(p=>({...p}))));
  // Regelmaessiges Polygon in Zug-Reihenfolge um den Schwerpunkt.
  {
    const n=order.length;
    const R=mean/(2*Math.sin(Math.PI/n));
    const I=C.idx(pts);
    const cx=pts.reduce((s,p)=>s+p.x,0)/pts.length, cy=pts.reduce((s,p)=>s+p.y,0)/pts.length;
    const cand=pts.map(p=>({...p}));
    order.forEach((id,k)=>{
      const a=2*Math.PI*k/n;
      cand[I[id]].x=cx+R*Math.cos(a);
      cand[I[id]].y=cy+R*Math.sin(a);
    });
    consider(evalCand(cand));
  }
  // Moden-Stoerungen des jeweils besten Stands: hin- und herschieben in
  // den Richtungen, die die Messungen freilassen.
  for(let t=0;t<(tries==null?24:tries);t++){
    const base=(best?best.P:pts).map(p=>({...p}));
    if(act.length){
      const an=C.analyze(base, meas, angs);
      if(an.modes.length){
        const amp=mean*0.35;
        an.modes.forEach(mo=>{
          const c=(rnd()*2-1)*amp;
          base.forEach((p,i)=>{ p.x+=c*mo[2*i]; p.y+=c*mo[2*i+1]; });
        });
      } else break;                      // starr bestimmt: nichts zu schieben
    } else {
      base.forEach(p=>{ p.x+=(rnd()*2-1)*mean*0.3; p.y+=(rnd()*2-1)*mean*0.3; });
    }
    consider(evalCand(base));
  }
  // Spiegelblind: der Kandidat "regelmaessiges Polygon" oben legt die Ecken
  // IMMER gegen den Uhrzeigersinn hin. Wer seinen Raum andersherum gezeichnet
  // hat, bekam ihn bisher seitenverkehrt zurueck - gemessen am Raum vom
  // 23.8.2026 in 40 von 40 Laeufen.
  return best ? spiegelWieVorlage(pts, best.P) : null;
};

// ================= Gebaeude: Raeume im gemeinsamen System =================
// origin verankert die Innenkontur eines Raums im Gebaeude:
//   p_gebaeude = R(origin.rot) * p_lokal + (origin.x, origin.y)
// roomTransform liefert die starre Abbildung von EINEM Raumsystem ins
// andere. Damit zeichnet der aktive Raum seine Nachbarn in seinen eigenen
// Koordinaten - gerendert wird nie in Gebaeudekoordinaten, und der ganze
// bestehende Zeichenweg (toScr, autofit, Einnorden) bleibt unberuehrt.
globalThis.roomTransform=function(from, to){
  const rf=(from&&from.rot)||0, rt=(to&&to.rot)||0;
  const dx=((from&&from.x)||0)-((to&&to.x)||0),
        dy=((from&&from.y)||0)-((to&&to.y)||0);
  // R(-rt) auf die Verschiebung: cos(-rt)=cos(rt), sin(-rt)=-sin(rt)
  const c=Math.cos(rt), s=Math.sin(rt);
  return {rot:rf-rt, x:dx*c+dy*s, y:-dx*s+dy*c};
};
globalThis.applyRoomTransform=function(T, p){
  const c=Math.cos(T.rot), s=Math.sin(T.rot);
  return {...p, x:p.x*c-p.y*s+T.x, y:p.x*s+p.y*c+T.y};
};

// Uebliche Wanddicken in mm - Vorschlaege, keine Auswahlpflicht.
globalThis.WALL_THICKNESS=[100,115,125,175,240,300,365];
globalThis.THICK_DEFAULT=240;   // angenommen, solange nichts bekannt ist

// Wandkoerper: das gemessene Polygon ist die INNENkontur, die Dicke wird
// nach AUSSEN aufgetragen. Je Wand ein Viereck aus den beiden Innenecken
// und den beiden AUSSENecken; die Aussenecke ist der Schnitt der beiden
// versetzten Parallelen, also eine Gehrung. Weil beide Waende einer Ecke
// denselben Schnittpunkt bekommen, stossen ihre Vierecke luecken- und
// ueberlappungsfrei aneinander - und wo drei Raeume zusammenlaufen, deckt
// die Gehrung die dreieckige Spitze mit ab, ohne dass sie je beschrieben
// werden muesste.
globalThis.wallBands=function(pts, walls, thick, defT){
  const C=globalThis.CORE, I=C.idx(pts);
  const ring=C.wallPolygon(pts, walls);
  if(!ring || ring.length<3) return [];
  const n=ring.length;
  // Umlaufsinn einmal: daraus folgt die Aussennormale jeder Kante direkt.
  // outerNormal je Wand zu fragen baute den Ring je Wand neu - im Zug waere
  // das ein Dutzend Polygonaufbauten pro Bild.
  let A2=0;
  for(let i=0,j=n-1;i<n;j=i++) A2+=ring[j].x*ring[i].y-ring[i].x*ring[j].y;
  const ccw=A2>0;
  const key=(a,b)=>[a,b].sort().join('|');
  const t0=(defT>0)?defT:globalThis.THICK_DEFAULT;
  const seg=[];
  for(let i=0;i<n;i++){
    const p=ring[i], q=ring[(i+1)%n];
    const L=C.dist(p,q);
    if(!(L>0)) return [];
    const u={x:(q.x-p.x)/L, y:(q.y-p.y)/L};
    const k=key(p.id, q.id);
    const gemessen=!!(thick && thick[k]>0);
    seg.push({a:p.id, b:q.id, p, q, u, L, t:gemessen?thick[k]:t0,
              assumed:!gemessen,
              // Im Gegenuhrzeigersinn liegt aussen RECHTS der Laufrichtung.
              n: ccw ? {x:u.y, y:-u.x} : {x:-u.y, y:u.x}});
  }
  // Gehrung an der gemeinsamen Ecke v der Waende s1 und s2. Symmetrisch in
  // s1/s2 - beide Waende bekommen denselben Punkt, auch im Ersatzfall.
  const ecke=(s1, s2, v)=>{
    const A={x:v.x+s1.n.x*s1.t, y:v.y+s1.n.y*s1.t};
    const B={x:v.x+s2.n.x*s2.t, y:v.y+s2.n.y*s2.t};
    const mitte={x:(A.x+B.x)/2, y:(A.y+B.y)/2};
    const cr=s1.u.x*s2.u.y - s1.u.y*s2.u.x;
    if(Math.abs(cr)<1e-9) return mitte;                    // parallel
    const s=((B.x-A.x)*s2.u.y - (B.y-A.y)*s2.u.x)/cr;
    const X={x:A.x+s1.u.x*s, y:A.y+s1.u.y*s};
    // Sehr spitze Ecken treiben die Gehrung ins Weite. Dann fuer BEIDE
    // Waende derselbe Ersatzpunkt - je Wand ein eigener risse die Ecke auf.
    const grenze=6*Math.max(s1.t, s2.t);
    return C.dist(X,v)>grenze ? mitte : X;
  };
  const out=[];
  for(let i=0;i<n;i++){
    const s=seg[i], vor=seg[(i-1+n)%n], nach=seg[(i+1)%n];
    out.push({a:s.a, b:s.b, t:s.t, L:s.L, assumed:s.assumed, u:s.u, n:s.n,
              iA:{x:s.p.x,y:s.p.y}, iB:{x:s.q.x,y:s.q.y},
              oA:ecke(s, vor, s.p), oB:ecke(s, nach, s.q)});
  }
  return out;
};

// Verankerung eines Nachbarraums, der hinter der Wand a-b entsteht.
// Die Innenkontur des Nachbarn liegt um die Dicke t nach AUSSEN versetzt;
// in SEINEM System soll die geerbte Wand von (0,0) nach (L,0) laufen und
// der Quellraum unter ihr liegen (negatives y) - dann zeichnet der Nutzer
// den neuen Raum wie gewohnt nach oben weg.
// Rueckgabe: origin des neuen Raums, Wandlaenge und welche Quellecke zu
// seinem Punkt A wurde.
globalThis.neighborOrigin=function(pts, walls, a, b, t, originR){
  const C=globalThis.CORE, I=C.idx(pts);
  if(I[a]==null||I[b]==null) return null;
  const A=pts[I[a]], B=pts[I[b]], L=C.dist(A,B);
  if(!(L>0) || !(t>0)) return null;
  const n=globalThis.outerNormal(pts, walls, a, b);
  const u={x:(B.x-A.x)/L, y:(B.y-A.y)/L};
  const Ao={x:A.x+n.x*t, y:A.y+n.y*t}, Bo={x:B.x+n.x*t, y:B.y+n.y*t};
  // Die lokale y-Achse des neuen Raums ist die Linksnormale seiner
  // Laufrichtung. Zeigt sie zum Quellraum zurueck, laeuft die Wand
  // andersherum - dann faengt sie an der anderen Ecke an.
  const flip=(-u.y*n.x + u.x*n.y) < 0;
  const P0=flip?Bo:Ao;
  const dir=flip?{x:-u.x,y:-u.y}:u;
  const rotR=(originR&&originR.rot)||0;
  const c=Math.cos(rotR), s=Math.sin(rotR);
  return {
    origin:{ x:((originR&&originR.x)||0) + P0.x*c - P0.y*s,
             y:((originR&&originR.y)||0) + P0.x*s + P0.y*c,
             rot:rotR + Math.atan2(dir.y, dir.x) },
    L, vonEcke: flip?b:a, bisEcke: flip?a:b,
  };
};

// ================= Zwei Waende, eine Wand =================
// Geht man im Ring durch die Wohnung, grenzt der neue Raum irgendwann auch
// an einen, zu dem es keine Tuer gibt. Dann muss man sagen koennen: das ist
// EINE Wand. Kandidaten sind zwei Innenkanten, die einander zugewandt sind,
// fast parallel liegen, sich ueberlappen und einen wandtypischen Abstand
// haben. Entschieden wird das nicht von der App - sie schlaegt vor.
const NAH_WINKEL = 5;      // Grad, bis dahin gilt "fast parallel"
const NAH_MIN    = 40;     // mm; duenner als das ist keine Wand
const NAH_MAX    = 600;    // mm; dicker auch nicht
globalThis.NAH_WINKEL=NAH_WINKEL;
// waendeA/waendeB: [{a,b,iA,iB,n}] - Innenkante mit ihrer AUSSENnormale,
// beide im selben Koordinatensystem.
globalThis.wandKandidaten=function(waendeA, waendeB, opt){
  const C=globalThis.CORE, o=opt||{};
  const maxW=o.winkel==null?NAH_WINKEL:o.winkel;
  const min=o.min==null?NAH_MIN:o.min, max=o.max==null?NAH_MAX:o.max;
  const cosGrenze=Math.cos(maxW*Math.PI/180);
  const out=[];
  waendeA.forEach(wa=>waendeB.forEach(wb=>{
    // Zugewandt: die beiden Aussennormalen zeigen aufeinander zu, stehen
    // also gegenlaeufig. Ohne diese Pruefung waere auch die abgewandte
    // Seite eines Nachbarn ein Kandidat.
    if(wa.n.x*wb.n.x + wa.n.y*wb.n.y > -cosGrenze) return;
    const f=globalThis.sharedWallFit(wa.iA, wa.iB, wb.iA, wb.iB);
    if(!f) return;
    if(f.winkel>maxW) return;
    if(f.dicke<min || f.dicke>max) return;
    // Die andere Wand muss AUSSEN liegen, nicht im eigenen Raum.
    const mA={x:(wa.iA.x+wa.iB.x)/2, y:(wa.iA.y+wa.iB.y)/2};
    const mB={x:(wb.iA.x+wb.iB.x)/2, y:(wb.iA.y+wb.iB.y)/2};
    if((mB.x-mA.x)*wa.n.x + (mB.y-mA.y)*wa.n.y <= 0) return;
    // Ein Zipfel gemeinsamer Laenge macht noch keine gemeinsame Wand.
    const noetig=Math.max(300, 0.25*Math.min(f.laengeHier, f.laengeDort));
    if(f.ueberlappung<noetig) return;
    out.push({a:wa.a, b:wa.b, fa:wb.a, fb:wb.b,
              dicke:f.dicke, winkel:f.winkel, ueberlappung:f.ueberlappung});
  }));
  // Das plausibelste zuerst: viel gemeinsame Laenge, wenig Schiefstand.
  return out.sort((x,y)=> (y.ueberlappung-x.ueberlappung) || (x.winkel-y.winkel));
};

// ================= Messen durch die Tuer =================
// Durch eine offene Tuer sieht man von einer Ecke des einen Raums eine Ecke
// des anderen. Genau diese Strecke laesst sich mit dem Laser messen - und
// aus ihr folgt, wie die beiden Raeume wirklich zueinander liegen.
//
// Welche Eckenpaare gehen? Die Verbindung muss BEIDE Laibungsebenen der
// Tuer durchqueren (die Wand hat Dicke, man schaut durch eine Leibung, nicht
// durch einen Schlitz), und zwar mit Abstand zu den Zargen - ein Strahl, der
// die Kante streift, ist geometrisch "durch", mit dem Laser aber nicht zu
// treffen. Der Abstand richtet sich nach der Tuerbreite, nicht nach einem
// festen Millimeterwert. Und sie darf keine Wand kreuzen.
const SICHT_RAND = 0.15;     // Anteil der Lueckenbreite, der je Seite frei bleibt
globalThis.SICHT_RAND=SICHT_RAND;
function schrumpfe(l, rand){
  return { P:{x:l.P.x+(l.Q.x-l.P.x)*rand, y:l.P.y+(l.Q.y-l.P.y)*rand},
           Q:{x:l.Q.x-(l.Q.x-l.P.x)*rand, y:l.Q.y-(l.Q.y-l.P.y)*rand} };
}
globalThis.sichtLinien=function(A, B, luecken, sperren, rand){
  const C=globalThis.CORE, out=[];
  if(!A.length || !B.length || !luecken.length) return out;
  const eng=luecken.map(l=>schrumpfe(l, rand==null?SICHT_RAND:rand));
  A.forEach(p=>B.forEach(q=>{
    if(!eng.every(l=>C.segCross(p,q,l.P,l.Q))) return;
    if((sperren||[]).some(([s1,s2])=>C.segCross(p,q,s1,s2))) return;
    out.push({a:p.id, b:q.id, laenge:C.dist(p,q)});
  }));
  return out.sort((x,y)=>x.laenge-y.laenge);
};

// Aus Querstrecken die Lage des Nachbarn bestimmen. Unbekannt sind nur
// ZWEI Zahlen: der Lotabstand t (die Wanddicke) und die Verschiebung d
// laengs der Wand. Die Drehung steht schon fest - die Innenkanten liegen
// sich gegenueber, das ist Geometrie und keine Messgroesse.
// obs: [{P, Q0, d}] - P im Elternsystem, Q0 die Grundlage des Kindpunktes
// im Elternsystem (also mit t0 und d=0 gerechnet).
globalThis.fitQuerlage=function(obs, u, n, t0){
  const act=obs.filter(o=>o && o.d>0);
  if(!act.length) return null;
  // Eine einzige Strecke kann nicht beides bestimmen. Dann bleibt die Tuer
  // der Laengsanker und nur die Dicke wird gerechnet.
  const zwei=act.length>=2;
  let dt=0, dd=0;
  for(let it=0; it<24; it++){
    let n11=0,n12=0,n22=0,g1=0,g2=0, maxR=0;
    for(const o of act){
      const qx=o.Q0.x+n.x*dt+u.x*dd, qy=o.Q0.y+n.y*dt+u.y*dd;
      const ex=qx-o.P.x, ey=qy-o.P.y;
      const L=Math.hypot(ex,ey);
      if(L<1e-9) return null;
      const r=L-o.d;
      const jn=(ex*n.x+ey*n.y)/L, ju=(ex*u.x+ey*u.y)/L;
      n11+=jn*jn; n12+=jn*ju; n22+=ju*ju; g1+=jn*r; g2+=ju*r;
      maxR=Math.max(maxR, Math.abs(r));
    }
    let s1, s2;
    if(zwei){
      const det=n11*n22-n12*n12;
      if(Math.abs(det)<1e-12) return null;      // Strecken zu aehnlich
      s1=(g1*n22-g2*n12)/det; s2=(g2*n11-g1*n12)/det;
    } else {
      if(Math.abs(n11)<1e-12) return null;      // Strecke steht quer zur Dicke
      s1=g1/n11; s2=0;
    }
    dt-=s1; dd-=s2;
    if(Math.abs(s1)<1e-7 && Math.abs(s2)<1e-7) break;
    if(maxR>1e7) return null;                   // laeuft weg
  }
  const t=t0+dt;
  if(!(t>0) || !isFinite(t) || !isFinite(dd)) return null;
  // Residuen zur Anzeige: was bleibt nach dem Ausgleich uebrig?
  const v=act.map(o=>{
    const qx=o.Q0.x+n.x*dt+u.x*dd, qy=o.Q0.y+n.y*dt+u.y*dd;
    return Math.hypot(qx-o.P.x, qy-o.P.y)-o.d;
  });
  return {t, d:dd, n:act.length, beides:zwei, v};
};

// ================= Die Lage eines Raums im Gebaeude ableiten ==============
// Nicht mehr einfrieren, sondern rechnen: ein Raum ist die Wurzel, jeder
// andere haengt ueber eine geteilte Wand an einem Vorgaenger. Aus dieser
// Wand folgt seine Lage vollstaendig - Drehung aus der Gegenueberlage der
// Innenkanten, Querabstand aus der Wanddicke, Laengslage aus der TUER.
// Damit vererbt sich die Parallelitaet durch die ganze Kette: verschiebt
// der Solver in einem Raum eine Wand, wandern die daran haengenden mit.

// Wo sitzt die Mitte der verankernden Tuer in dieser Wand, gemessen von
// der Ecke ca aus? null, wenn keine Tuer benannt ist.
function ankerX(room, wandKey, ca, cb, L){
  const sh=(room.data && room.data.shared || {})[wandKey];
  if(!sh || !sh.tuer || !sh.tuer.op) return null;
  const ops=(room.data.openings||[]).filter(o=>o.id===sh.tuer.op);
  if(!ops.length) return null;
  const o=ops[0];
  if([o.a,o.b].sort().join('|')!==wandKey) return null;
  const mitte=o.x+o.w/2;
  return (o.a===ca) ? mitte : L-mitte;
}
function dickeVon(room, wandKey){
  const t=(room.data && room.data.thick || {})[wandKey];
  return t>0 ? t : 0;
}
// Lage des Kindes IM SYSTEM DES ELTERNRAUMS.
globalThis.ankopplung=function(parent, child, wandP, wandC){
  const C=globalThis.CORE;
  const Pp=(parent.data||{}).pts, Wp=(parent.data||{}).walls;
  const Pc=(child.data||{}).pts,  Wc=(child.data||{}).walls;
  if(!Array.isArray(Pp)||!Array.isArray(Wp)||!Array.isArray(Pc)||!Array.isArray(Wc)) return null;
  const Ip=C.idx(Pp), Ic=C.idx(Pc);
  const [pa,pb]=wandP.split('|'), [ca,cb]=wandC.split('|');
  if(Ip[pa]==null||Ip[pb]==null||Ic[ca]==null||Ic[cb]==null) return null;
  const A=Pp[Ip[pa]], B=Pp[Ip[pb]], a2=Pc[Ic[ca]], b2=Pc[Ic[cb]];
  const Lp=C.dist(A,B), Lc=C.dist(a2,b2);
  if(!(Lp>0)||!(Lc>0)) return null;
  const u={x:(B.x-A.x)/Lp, y:(B.y-A.y)/Lp};
  const n=globalThis.outerNormal(Pp, Wp, pa, pb);
  const uc={x:(b2.x-a2.x)/Lc, y:(b2.y-a2.y)/Lc};
  // Ein frisch angelegter Nachbar besteht erst aus EINER Wand und hat noch
  // keine Innenseite - outerNormal faellt dort auf die Linksnormale zurueck,
  // also auf die falsche Seite (browser-gesehen: der Raum landete 15 mm
  // daneben und ungedreht). Solange kein Polygon da ist, gilt die Konvention
  // aus dem Anlegen: der Quellraum liegt unter der geerbten Wand, aussen ist
  // rechts von ca->cb. Sobald der Zug geschlossen ist, entscheidet wieder
  // die Geometrie.
  const nc=C.wallPolygon(Pc, Wc)
    ? globalThis.outerNormal(Pc, Wc, ca, cb)
    : {x:uc.y, y:-uc.x};
  const t=dickeVon(parent,wandP) || dickeVon(child,wandC) || globalThis.THICK_DEFAULT;
  // Drehung: die Aussennormale des Kindes muss auf den Elternraum
  // zurueckzeigen - die beiden Innenkanten liegen sich gegenueber.
  const theta=Math.atan2(-n.y,-n.x)-Math.atan2(nc.y,nc.x);
  const cs=Math.cos(theta), sn=Math.sin(theta);
  const ucP={x:uc.x*cs-uc.y*sn, y:uc.x*sn+uc.y*cs};
  // Laeuft die Kindwand danach mit oder gegen die Elternwand? Beides ist
  // moeglich, je nachdem herum die Raeume gezeichnet wurden.
  const s=(ucP.x*u.x+ucP.y*u.y)>=0 ? 1 : -1;
  const xp=ankerX(parent, wandP, pa, pb, Lp);
  const xc=ankerX(child,  wandC, ca, cb, Lc);
  // Ohne Tuer bleibt nur die Ecke als Anker - genau die Lage, die das
  // Anlegen erzeugt hat. Alte Raeume ohne Tuereintrag liegen dadurch
  // unveraendert.
  const XP = (xp!=null && xc!=null) ? xp : (s<0 ? Lp : 0);
  const XC = (xp!=null && xc!=null) ? xc : 0;
  const Ax=A.x+n.x*t+u.x*(XP-s*XC), Ay=A.y+n.y*t+u.y*(XP-s*XC);
  const T0={rot:theta, x:Ax-(a2.x*cs-a2.y*sn), y:Ay-(a2.x*sn+a2.y*cs)};
  // Gemessene Querstrecken schlagen Annahme und Tueranker: sie sagen
  // direkt, wie weit und wie versetzt der Nachbar liegt.
  const obs=querObs(parent, child, T0);
  const fit=obs.length ? globalThis.fitQuerlage(obs, u, n, t) : null;
  if(!fit) return {...T0, t, verankert:(xp!=null && xc!=null), quer:0};
  return { rot:theta,
           x:T0.x+n.x*(fit.t-t)+u.x*fit.d,
           y:T0.y+n.y*(fit.t-t)+u.y*fit.d,
           t:fit.t, verankert:true, quer:fit.n, querFit:fit };
};
// Querstrecken zwischen genau diesen beiden Raeumen einsammeln. Sie duerfen
// in JEDEM der beiden Raeume stehen - gemessen hat man sie ja von einer
// Seite aus. Rueckgabe in der Form, die fitQuerlage erwartet: P im
// Elternsystem, Q0 die Grundlage des Kindpunktes im Elternsystem.
function querObs(parent, child, T0){
  const C=globalThis.CORE, out=[];
  const Ip=C.idx(parent.data.pts||[]), Ic=C.idx(child.data.pts||[]);
  const cs=Math.cos(T0.rot), sn=Math.sin(T0.rot);
  const nachOben=q=>({x:q.x*cs-q.y*sn+T0.x, y:q.x*sn+q.y*cs+T0.y});
  const nimm=(m, hierEltern)=>{
    if(!m || m.on===false || !(m.d>0)) return;
    // a liegt im Raum, in dem die Messung steht; b im anderen.
    const pEltern = hierEltern ? m.a : m.b;
    const pKind   = hierEltern ? m.b : m.a;
    if(Ip[pEltern]==null || Ic[pKind]==null) return;
    out.push({P:parent.data.pts[Ip[pEltern]],
              Q0:nachOben(child.data.pts[Ic[pKind]]), d:m.d});
  };
  ((parent.data||{}).qmeas||[]).forEach(m=>{ if(m.raum===child.id) nimm(m, true); });
  ((child.data||{}).qmeas ||[]).forEach(m=>{ if(m.raum===parent.id) nimm(m, false); });
  return out;
}
// Zwei Lagen hintereinander ausfuehren: erst T, dann O.
function verkette(O, T){
  const c=Math.cos(O.rot||0), s=Math.sin(O.rot||0);
  return { rot:(O.rot||0)+T.rot,
           x:(O.x||0)+T.x*c-T.y*s, y:(O.y||0)+T.x*s+T.y*c };
}
// Alle Lagen aus den Verbindungen. Rueckgabe:
//   origins  - id -> {x,y,rot}
//   wurzeln  - je Zusammenhangskomponente der Startraum
//   kanten   - die benutzten Baumkanten
//   schluss  - Verbindungen, die KEINE Baumkante sind: dort schliesst sich
//              ein Ring, und dort steht der Schlussfehler (Etappe 4)
globalThis.buildingOrigins=function(rooms){
  const byId=new Map(rooms.map(r=>[r.id,r]));
  const adj=new Map();
  rooms.forEach(r=>{
    const sh=(r.data&&r.data.shared)||{};
    Object.keys(sh).forEach(k=>{
      const zu=sh[k]&&sh[k].room;
      if(!byId.has(zu) || zu===r.id) return;
      if(!adj.has(r.id)) adj.set(r.id,[]);
      adj.get(r.id).push({zu, wand:k, gegenwand:sh[k].wall
        ? [sh[k].wall[0],sh[k].wall[1]].sort().join('|') : null});
    });
  });
  const origins={}, wurzeln=[], kanten=[], schluss=[];
  const gesehen=new Set();
  // Jede Verbindung steht in BEIDEN Raeumen. Die Rueckkante zum Vorgaenger
  // ist deshalb keine Schlusskante, sondern dieselbe Kante von hinten -
  // gemerkt wird sie ueber die WAND, nicht ueber den Raum: zwei Raeume
  // koennen sich durchaus an zwei verschiedenen Wanden beruehren.
  const herVon=new Map();          // id -> Wandschluessel zum Vorgaenger
  const kantenId=(r1,w1,r2,w2)=>[r1+'/'+w1, r2+'/'+w2].sort().join('~');
  const bekannt=new Set();
  // Reihenfolge festlegen, damit dieselbe Bibliothek immer dieselbe
  // Wurzel bekommt: der bei {0,0,0} verankerte Raum zuerst, sonst nach id.
  const sortiert=rooms.slice().sort((a,b)=>{
    const w=r=>(r.origin && !r.origin.x && !r.origin.y && !r.origin.rot) ? 0 : 1;
    return w(a)-w(b) || String(a.id).localeCompare(String(b.id));
  });
  sortiert.forEach(start=>{
    if(gesehen.has(start.id)) return;
    if(!adj.has(start.id) && !start.origin) return;   // freistehend
    gesehen.add(start.id);
    origins[start.id]=start.origin || {x:0,y:0,rot:0};
    wurzeln.push(start.id);
    const q=[start.id];
    while(q.length){
      const hier=q.shift();
      (adj.get(hier)||[]).forEach(e=>{
        if(!e.gegenwand) return;
        if(e.wand===herVon.get(hier)) return;      // dieselbe Kante von hinten
        const kid=kantenId(hier, e.wand, e.zu, e.gegenwand);
        if(bekannt.has(kid)) return;
        if(gesehen.has(e.zu)){
          // Schon platziert - diese Verbindung schliesst einen Ring.
          bekannt.add(kid);
          schluss.push({a:hier, b:e.zu, wand:e.wand, gegenwand:e.gegenwand});
          return;
        }
        const T=globalThis.ankopplung(byId.get(hier), byId.get(e.zu), e.wand, e.gegenwand);
        if(!T) return;
        gesehen.add(e.zu);
        bekannt.add(kid);
        herVon.set(e.zu, e.gegenwand);
        origins[e.zu]=verkette(origins[hier], T);
        kanten.push({von:hier, zu:e.zu, wand:e.wand, gegenwand:e.gegenwand,
                     t:T.t, verankert:T.verankert, quer:T.quer||0,
                     beides:!!(T.querFit && T.querFit.beides)});
        q.push(e.zu);
      });
    }
  });
  return {origins, wurzeln, kanten, schluss};
};

// ================= Der Ring schliesst sich =================
// Sobald ein Raum an zwei bereits liegende grenzt, ist seine Lage
// ueberbestimmt. Die Ableitung folgt weiter dem Baum; jede Verbindung, die
// keine Baumkante ist, ist eine Schlusskante. Dort steht der Schlussfehler
// des Rings - und der wird gemeldet, nicht verteilt.

// Der Weg im Baum zwischen zwei Raeumen: zusammen mit der Schlusskante
// ergibt er den Ring. Ueber ihn haben sich die Fehler aufaddiert.
globalThis.ringPfad=function(kanten, von, zu){
  if(von===zu) return [von];
  const adj=new Map();
  (kanten||[]).forEach(e=>{
    if(!adj.has(e.von)) adj.set(e.von,[]);
    if(!adj.has(e.zu)) adj.set(e.zu,[]);
    adj.get(e.von).push(e.zu); adj.get(e.zu).push(e.von);
  });
  const vor=new Map([[von,null]]), q=[von];
  while(q.length){
    const h=q.shift();
    for(const n of (adj.get(h)||[])){
      if(vor.has(n)) continue;
      vor.set(n,h);
      if(n===zu){
        const p=[]; let c=zu;
        while(c!=null){ p.push(c); c=vor.get(c); }
        return p.reverse();
      }
      q.push(n);
    }
  }
  return null;
};

// Wie weit klafft der Ring an seiner Schlusskante? Verglichen werden die
// beiden Innenkanten, die dort EINE Wand sein sollten.
globalThis.schlussFehler=function(rooms, b){
  const C=globalThis.CORE;
  const byId=new Map(rooms.map(r=>[r.id,r]));
  return ((b&&b.schluss)||[]).map(s=>{
    const ra=byId.get(s.a), rb=byId.get(s.b);
    const oa=b.origins[s.a], ob=b.origins[s.b];
    if(!ra||!rb||!oa||!ob||!ra.data||!rb.data) return null;
    const Ia=C.idx(ra.data.pts||[]), Ib=C.idx(rb.data.pts||[]);
    const [a1,a2]=s.wand.split('|'), [b1,b2]=s.gegenwand.split('|');
    if(Ia[a1]==null||Ia[a2]==null||Ib[b1]==null||Ib[b2]==null) return null;
    const T=globalThis.roomTransform(ob, oa);
    const f=globalThis.sharedWallFit(
      ra.data.pts[Ia[a1]], ra.data.pts[Ia[a2]],
      globalThis.applyRoomTransform(T, rb.data.pts[Ib[b1]]),
      globalThis.applyRoomTransform(T, rb.data.pts[Ib[b2]]));
    if(!f) return null;
    const t=(ra.data.thick||{})[s.wand] || (rb.data.thick||{})[s.gegenwand]
          || globalThis.THICK_DEFAULT;
    return {a:s.a, b:s.b, wand:s.wand, gegenwand:s.gegenwand,
            dicke:f.dicke, soll:t, klaffen:f.dicke-t,
            winkel:f.winkel, versatz:f.versatz,
            ring:globalThis.ringPfad(b.kanten, s.a, s.b) || [s.a, s.b]};
  }).filter(Boolean);
};

// Passen zwei Raeume an ihrer gemeinsamen Wand noch zusammen? Verglichen
// werden die beiden Innenkanten - unsere (a1-b1) und die des Nachbarn
// (a2-b2), beide in UNSEREN Koordinaten. Geliefert wird, was man daraus
// ablesen kann; die Bewertung macht die UI.
//   dicke   - Lotabstand der beiden Kanten: die Wanddicke, wie sie in der
//             Geometrie wirklich steht
//   winkel  - Grad zwischen den Kanten; ueber null heisst, die Raeume
//             stehen schief zueinander
//   laengeD - wie viel laenger die Wand drueben gemessen wurde
//   versatz - wie weit die fremde Wand an einem Ende ueber unsere
//             hinausragt oder dahinter zurueckbleibt
globalThis.sharedWallFit=function(a1, b1, a2, b2){
  const C=globalThis.CORE;
  const L1=C.dist(a1,b1), L2=C.dist(a2,b2);
  if(!(L1>0) || !(L2>0)) return null;
  const u1={x:(b1.x-a1.x)/L1, y:(b1.y-a1.y)/L1};
  let p=a2, q=b2;
  // Die Wand drueben laeuft in aller Regel andersherum um den Raum. Fuer
  // den Vergleich zeigen beide in dieselbe Richtung.
  if(((q.x-p.x)*u1.x + (q.y-p.y)*u1.y) < 0){ const t=p; p=q; q=t; }
  const u2={x:(q.x-p.x)/L2, y:(q.y-p.y)/L2};
  const cos=Math.max(-1, Math.min(1, u1.x*u2.x + u1.y*u2.y));
  const n1={x:-u1.y, y:u1.x};
  const d0=(p.x-a1.x)*n1.x + (p.y-a1.y)*n1.y;
  const d1=(q.x-a1.x)*n1.x + (q.y-a1.y)*n1.y;
  const s0=(p.x-a1.x)*u1.x + (p.y-a1.y)*u1.y;
  const s1=(q.x-a1.x)*u1.x + (q.y-a1.y)*u1.y;
  return {
    dicke: Math.abs((d0+d1)/2),
    winkel: Math.acos(cos)*180/Math.PI,
    laengeHier: L1, laengeDort: L2, laengeD: L2-L1,
    versatz: Math.max(Math.abs(s0), Math.abs(s1-L1)),
    ueberlappung: Math.max(0, Math.min(L1,s1) - Math.max(0,s0)),
  };
};
