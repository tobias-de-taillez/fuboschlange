// Phase-0-Spike: kreuzungsfreie bifilare Spirale auf beliebigem einfachem Polygon.
//
// Zwei Unterschiede zu proto2/proto3, die beide gescheitert sind:
//
// 1. Konturen kommen aus einem ABSTANDSFELD (exakter Randabstand je Rasterpunkt,
//    Iso-Linien per Marching Squares) statt aus einem Polygon-Offsetter. Kein
//    clipper2-js noetig, und das Aufspalten einer Kontur an einer Engstelle
//    faellt automatisch an statt als Sonderfall.
//
// 2. Jede Kontur bekommt eine LUECKE der Bogenlaenge g an einer gemeinsamen
//    Naht. Alle Ring-zu-Ring-Spruenge laufen durch diese Luecken. Genau das
//    fehlte proto2: dort wurden geschlossene Konturen aneinandergehaengt, jeder
//    Sprung musste die Zwischenkonturen an beliebiger Stelle durchstossen.
//    Das ist dieselbe Konstruktion, die doubleSpiral() im Rechteck schon faehrt.
//
// selfCross() ist unveraendert aus proto3.mjs uebernommen (Vorgabe des Plans).

// ---------- Vektor ----------
const sub=(p,q)=>({x:p.x-q.x,y:p.y-q.y});
const add=(p,q)=>({x:p.x+q.x,y:p.y+q.y});
const scl=(p,k)=>({x:p.x*k,y:p.y*k});
const dot=(p,q)=>p.x*q.x+p.y*q.y;
const dist=(p,q)=>Math.hypot(p.x-q.x,p.y-q.y);

function nearestOnSeg(p,a,b){
  const ab=sub(b,a), l2=dot(ab,ab)||1;
  const t=Math.max(0,Math.min(1,dot(sub(p,a),ab)/l2));
  const pt=add(a,scl(ab,t));
  return {pt,d:dist(p,pt),t};
}

// ---------- Selbstkreuzungs-Test (unveraendert aus proto3.mjs) ----------
function segX(a,b,c,d){const D=(b.x-a.x)*(d.y-c.y)-(b.y-a.y)*(d.x-c.x);if(Math.abs(D)<1e-12)return false;
  const t=((c.x-a.x)*(d.y-c.y)-(c.y-a.y)*(d.x-c.x))/D,u=((c.x-a.x)*(b.y-a.y)-(c.y-a.y)*(b.x-a.x))/D,e=1e-9;
  return t>e&&t<1-e&&u>e&&u<1-e;}
function selfCross(P){let n=0;for(let i=0;i<P.length-1;i++)for(let j=i+2;j<P.length-1;j++){
  if(i===0&&j===P.length-2)continue; if(segX(P[i],P[i+1],P[j],P[j+1]))n++;} return n;}

// ---------- Abstandsfeld ----------
// d > 0 im Raum, d = Abstand zur naechsten Wandkante. Exakt je Rasterpunkt
// (kein Fast-Marching-Fehler); nur die Iso-Linie wird interpoliert.
function signedDistanceField(poly,h){
  let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
  for(const p of poly){ minx=Math.min(minx,p.x); maxx=Math.max(maxx,p.x);
                        miny=Math.min(miny,p.y); maxy=Math.max(maxy,p.y); }
  // 2 Zellen Rand: die Iso-Linien duerfen den Feldrand nie beruehren, sonst
  // sind sie offene Ketten statt geschlossener Ringe.
  const x0=minx-2*h, y0=miny-2*h;
  const nx=Math.ceil((maxx-minx)/h)+5, ny=Math.ceil((maxy-miny)/h)+5;
  const d=new Float64Array(nx*ny);
  const n=poly.length;
  for(let j=0;j<ny;j++){
    const py=y0+j*h;
    for(let i=0;i<nx;i++){
      const px=x0+i*h;
      let best=Infinity, inside=false;
      for(let k=0,m=n-1;k<n;m=k++){
        const a=poly[m], b=poly[k];
        const dd=nearestOnSeg({x:px,y:py},a,b).d;
        if(dd<best) best=dd;
        // Strahlensatz nach +x
        if((a.y>py)!==(b.y>py) && px < a.x+(py-a.y)*(b.x-a.x)/(b.y-a.y)) inside=!inside;
      }
      d[j*nx+i]=inside?best:-best;
    }
  }
  return {x0,y0,h,nx,ny,d};
}

// ---------- Iso-Linien (Marching Squares) ----------
// Kantenpunkte werden pro Gitterkante EINMAL bestimmt und ueber ihren
// Kantenschluessel identifiziert - dadurch passen benachbarte Zellen exakt
// zusammen und das Zusammenfaedeln braucht keine Toleranz.
function isoContours(F,level,simplifyEps){
  const {x0,y0,h,nx,ny,d}=F;
  const V=(i,j)=>d[j*nx+i]-level;
  const pts=new Map();     // key -> {x,y}
  const nbr=new Map();     // key -> [key,...]
  const link=(a,b)=>{ (nbr.get(a)??nbr.set(a,[]).get(a)).push(b);
                      (nbr.get(b)??nbr.set(b,[]).get(b)).push(a); };
  const hKey=(i,j)=>`H${i},${j}`, vKey=(i,j)=>`V${i},${j}`;
  const hPt=(i,j)=>{ const a=V(i,j),b=V(i+1,j), t=a/(a-b);
                     return {x:x0+(i+t)*h, y:y0+j*h}; };
  const vPt=(i,j)=>{ const a=V(i,j),b=V(i,j+1), t=a/(a-b);
                     return {x:x0+i*h, y:y0+(j+t)*h}; };
  const put=(key,p)=>{ if(!pts.has(key)) pts.set(key,p); return key; };

  for(let j=0;j<ny-1;j++) for(let i=0;i<nx-1;i++){
    const a=V(i,j), b=V(i+1,j), c=V(i+1,j+1), e=V(i,j+1);
    const cs=(a>0?1:0)|(b>0?2:0)|(c>0?4:0)|(e>0?8:0);
    if(cs===0||cs===15) continue;
    const E0=()=>put(hKey(i,j),   hPt(i,j));      // unten
    const E1=()=>put(vKey(i+1,j), vPt(i+1,j));    // rechts
    const E2=()=>put(hKey(i,j+1), hPt(i,j+1));    // oben
    const E3=()=>put(vKey(i,j),   vPt(i,j));      // links
    switch(cs){
      case 1: case 14: link(E3(),E0()); break;
      case 2: case 13: link(E0(),E1()); break;
      case 3: case 12: link(E3(),E1()); break;
      case 4: case 11: link(E1(),E2()); break;
      case 6: case  9: link(E0(),E2()); break;
      case 7: case  8: link(E3(),E2()); break;
      case 5: case 10: {  // Sattel: ueber das Zellmittel aufloesen
        const mid=(a+b+c+e)/4, join=(cs===5)===(mid>0);
        if(join){ link(E3(),E2()); link(E0(),E1()); }
        else    { link(E3(),E0()); link(E1(),E2()); }
        break;
      }
    }
  }
  // Ringe zusammenfaedeln
  const seen=new Set(), rings=[];
  for(const start of pts.keys()){
    if(seen.has(start)) continue;
    const ring=[]; let cur=start, prev=null;
    while(cur && !seen.has(cur)){
      seen.add(cur); ring.push(pts.get(cur));
      const ns=nbr.get(cur)||[];
      const nxt=ns.find(k=>k!==prev&&!seen.has(k));
      prev=cur; cur=nxt;
    }
    if(ring.length>=3) rings.push(ring);
  }
  return rings.map(r=>orientCCW(simplify(r,simplifyEps))).filter(r=>r.length>=3);
}

const signedArea=r=>{let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=(r[j].x*r[i].y-r[i].x*r[j].y);return a/2;};
// Alle Ringe gleichsinnig (CCW). Loecher gibt es per Voraussetzung nicht, also
// ist jeder Ring die Aussenkontur einer Komponente.
const orientCCW=r=>signedArea(r)<0?r.slice().reverse():r;

// Douglas-Peucker auf einem GESCHLOSSENEN Ring: an den zwei weitest
// entfernten Punkten aufteilen, sonst haengt das Ergebnis am Startindex.
function simplify(ring,eps){
  if(ring.length<4) return ring;
  let i0=0,i1=0,best=-1;
  for(let i=1;i<ring.length;i++){ const dd=dist(ring[0],ring[i]); if(dd>best){best=dd;i1=i;} }
  const A=dp(ring.slice(i0,i1+1),eps), B=dp(ring.slice(i1).concat([ring[0]]),eps);
  return A.slice(0,-1).concat(B.slice(0,-1));
}
function dp(pl,eps){
  if(pl.length<3) return pl;
  let idx=0,max=0;
  for(let i=1;i<pl.length-1;i++){
    const dd=nearestOnSeg(pl[i],pl[0],pl[pl.length-1]).d;
    if(dd>max){max=dd;idx=i;}
  }
  if(max<=eps) return [pl[0],pl[pl.length-1]];
  return dp(pl.slice(0,idx+1),eps).slice(0,-1).concat(dp(pl.slice(idx),eps));
}

// ---------- Bogenlaenge auf einem Ring ----------
function ringArc(ring){
  const n=ring.length, cum=[0]; let L=0;
  for(let i=0;i<n;i++){ L+=dist(ring[i],ring[(i+1)%n]); cum.push(L); }
  return {cum,L};
}
function ptAtArc(ring,cum,L,t){
  const n=ring.length; t=((t%L)+L)%L;
  let i=0; while(i<n-1 && cum[i+1]<t) i++;
  const seg=cum[i+1]-cum[i];
  const f=seg>0?(t-cum[i])/seg:0;
  const a=ring[i], b=ring[(i+1)%n];
  return {x:a.x+(b.x-a.x)*f, y:a.y+(b.y-a.y)*f};
}
function arcOfNearest(ring,cum,P){
  let best=Infinity, bt=0;
  for(let i=0;i<ring.length;i++){
    const a=ring[i], b=ring[(i+1)%ring.length];
    const r=nearestOnSeg(P,a,b);
    if(r.d<best){ best=r.d; bt=cum[i]+dist(a,r.pt); }
  }
  return {t:bt,d:best};
}
// Offene Kette: Ring ohne die Luecke der Bogenlaenge g um t0. Laeuft in
// Ringrichtung von t0+g/2 bis t0+L-g/2.
function cutGap(ring,g,t0){
  const {cum,L}=ringArc(ring);
  if(g>=L*0.9) return null;                    // Ring zu kurz fuer eine Luecke
  const n=ring.length, s=t0+g/2, e=t0+L-g/2;
  const out=[ptAtArc(ring,cum,L,s)];
  for(let k=0;k<2*n;k++){
    const t=cum[k%n]+(k>=n?L:0);
    if(t>s+1e-9 && t<e-1e-9) out.push(ring[k%n]);
  }
  out.push(ptAtArc(ring,cum,L,e));
  return out;
}

// ---------- Bifilare Spirale auf einem linearen Konturstapel ----------
// rings[0] = aussen.
//
// Naht VON INNEN NACH AUSSEN bauen. Andersherum laeuft sie in Sackgassen: der
// Punkt der naechsten INNEREN Kontur, der dem bisherigen Nahtpunkt am naechsten
// liegt, kann beliebig weit weg sein, sobald die innere Kontur woanders sitzt
// als der lokale Ruecken, dem die Naht gefolgt ist (im T-Raum gemessen: 1691 mm
// statt 283 mm, und genau diese Sprungweite waren die Kreuzungen). Die aeussere
// Kontur UMSCHLIESST die innere dagegen immer, ihr naechster Punkt liegt daher
// per Konstruktion rund einen Bahnabstand entfernt.
//
// Reihenfolge exakt wie doubleSpiral() im Rechteck:
//   Eintritt in der Luecken-MITTE von Ring 0
//   -> ungerade Ringe nach innen (Ringrichtung, Vorlauf)
//   -> Kehre
//   -> gerade Ringe nach aussen (Gegenrichtung, Ruecklauf), Ring 0 zuletzt
// Sprung k -> k+2 quert das Niveau von k+1 in dessen Luecke; als Stuetzpunkt
// wird die Luecken-Mitte von k+1 eingehaengt, damit die Querung auch dort in
// der Luecke liegt, wo die Naht einen Knick macht.
function spiralLinear(rings,seed,g){
  const r=spiralParts(rings,seed,g);
  return r ? [...r.head,...r.inward,...r.turnVia,...r.outward] : [];
}
// Wie spiralLinear, aber Vorlauf und Ruecklauf getrennt: dazwischen haengen
// spaeter die Unterbaeume eines Verzweigungsknotens.
function spiralParts(rings,seed,g){
  if(!rings.length) return null;
  const n=rings.length, arc=rings.map(ringArc);
  const gapT=new Array(n), gapP=new Array(n);
  // Die Luecke braucht ein GERADES Wandstueck der Laenge g. Sitzt sie auf einer
  // Ecke, ist der Eckbogen so lang wie die Luecke selbst, und jeder Sprung
  // darin schneidet die Ecke ab statt in der Luecke zu bleiben. Deshalb wird
  // der Nahtpunkt im Fenster +-0,75g auf die geradeste Stelle geschoben:
  // gerade heisst, die Sehne ueber die Luecke ist so lang wie die Luecke.
  const straighten=(k,t0)=>{
    const {cum,L}=arc[k], r=rings[k];
    if(g>=L*0.5) return t0;
    let best=t0, bq=-1;
    for(let i=-6;i<=6;i++){
      const t=t0+i*g/8;
      const a=ptAtArc(r,cum,L,t-g/2), b=ptAtArc(r,cum,L,t+g/2);
      const q=dist(a,b)/g;
      if(q>bq){ bq=q; best=t; }
    }
    return best;
  };
  const setGap=(k,ref)=>{
    const {t}=arcOfNearest(rings[k],arc[k].cum,ref);
    gapT[k]=straighten(k,t); gapP[k]=ptAtArc(rings[k],arc[k].cum,arc[k].L,gapT[k]);
  };
  setGap(n-1,seed);                             // innerster Ring am Verteiler ausrichten
  for(let k=n-2;k>=0;k--) setGap(k,gapP[k+1]);  // dann nach aussen
  // Die Paritaet wird so gewaehlt, dass der VORLAUF auf der innersten Kontur
  // endet. Endete dort der Ruecklauf, muessten Hin- und Rueckweg zu den
  // Unterbaeumen dieselbe Luecke in derselben Reihenfolge queren - das ist
  // geometrisch nicht kreuzungsfrei aufloesbar (nachgemessen in U und Hantel).
  const par=(n-1)%2;
  const chains=rings.map((r,k)=>{
    const c=cutGap(r,g,gapT[k]);
    if(!c) return null;
    return k%2===par ? c : c.slice().reverse();   // Ruecklaufringe gegenlaeufig
  });
  const usable=k=>chains[k]&&chains[k].length>1;
  const odd=[], even=[];
  for(let k=0;k<n;k++) if(usable(k)) (k%2===par?odd:even).push(k);
  if(!odd.length&&!even.length) return null;
  // Stuetzpunkte der uebersprungenen Niveaus zwischen zwei Ringen derselben
  // Paritaet einhaengen (bei lueckenlosem Stapel genau einer).
  const via=(out,a,b)=>{ for(let k=Math.min(a,b)+1;k<Math.max(a,b);k++)
    if(gapP[k]) out.push(gapP[k]); };
  const run=seq=>{ const out=[];
    seq.forEach((k,i)=>{ if(i) via(out,seq[i-1],k); out.push(...chains[k]); });
    return out; };
  const back=even.slice().reverse();
  const tag=(a,n)=>a.map(p=>({x:p.x,y:p.y,_t:n}));
  return {
    head: usable(0)?tag([gapP[0]],'head'):[],   // Eintritt in der Luecken-Mitte
    inward: tag(run(odd),'vor'),
    outward: tag(run(back),'rueck'),
    // Kehre: von der innersten ungeraden auf die innerste gerade Kontur.
    turnVia: (odd.length&&back.length) ? (()=>{const o=[];via(o,odd[odd.length-1],back[0]);return o;})() : [],
    gapP,
    // Punkt in der Luecke von Ring k, seitlich um off versetzt. Hin- und
    // Rueckweg durch dieselbe Luecke brauchen verschiedene Seiten, sonst
    // kreuzen sie sich dort.
    gapAt:(k,off)=>gapT[k]==null?null:ptAtArc(rings[k],arc[k].cum,arc[k].L,gapT[k]+off),
    aIdx: odd.length?odd[odd.length-1]:0,      // Ring, auf dem der Vorlauf endet
    bIdx: back.length?back[0]:0,               // Ring, auf dem der Ruecklauf beginnt
    nIdx: n-1,
  };
}

// ---------- Konturbaum ----------
// {d >= L} schrumpft monoton mit L, also ist jeder Ring auf Niveau k+1 in genau
// einem Ring auf Niveau k enthalten. Daraus faellt der Baum ohne Sonderfaelle
// an: an einer Engstelle bekommt ein Knoten mehrere Kinder.
const inRing=(p,r)=>{
  let inside=false;
  for(let i=0,j=r.length-1;i<r.length;j=i++){
    if((r[j].y>p.y)!==(r[i].y>p.y) &&
       p.x < r[j].x+(p.y-r[j].y)*(r[i].x-r[j].x)/(r[i].y-r[j].y)) inside=!inside;
  }
  return inside;
};
function contourTree(F,e0,s,eps){
  let prev=[], roots=[], levels=0;
  for(let k=0;k<400;k++){
    const cs=isoContours(F,e0+k*s,eps);
    if(!cs.length) break;
    levels++;
    const nodes=cs.map(ring=>({k,ring,children:[]}));
    if(!k) roots=nodes;
    else nodes.forEach(nd=>{
      const p=prev.find(q=>inRing(nd.ring[0],q.ring));
      (p?p.children:roots).push(nd);          // ohne Elter (Rundungsfall): eigene Wurzel
    });
    prev=nodes;
  }
  return {roots,levels};
}
// Maximale Kette ab einem Knoten: laeuft, solange ein Knoten genau ein Kind
// hat. Gibt die Ringe der Kette und den Verzweigungsknoten am Ende zurueck.
function chainFrom(nd){
  const rings=[]; let cur=nd;
  while(cur){ rings.push(cur.ring);
    if(cur.children.length===1){ cur=cur.children[0]; continue; }
    break; }
  return {rings,end:cur,kInner:nd.k+rings.length-1};
}

// ---------- Verbinderring ----------
// Die Unterbaeume eines Verzweigungsknotens haengen nicht mehr aneinander,
// sobald man tiefer als die Engstelle geht - dort ist der Raum ja gerade
// zerfallen. Knapp OBERHALB der Engstelle haengen sie noch zusammen. Auf
// dieser Iso-Linie laeuft der Verbinder: sie liegt zwischen der innersten
// Kontur der Elternkette und den Kindkonturen, also in freiem Raum.
// Die Tiefe wird gesucht, nicht geraten - wo genau die Kontur zerfaellt, liegt
// irgendwo zwischen zwei abgetasteten Niveaus.
// Es sind ZWEI Ringe: Hinweg und Rueckweg. Auf einem einzigen Ring geht es
// nicht - der Rundgang laeuft nur in eine Richtung, also treffen sich Ein- und
// Ausstieg zwangslaeufig an derselben Naht und kreuzen sich dort. Der
// Rueckwegring liegt flacher; flacher heisst naeher an der Elternkontur, und
// da die Menge {d >= L} mit L nur schrumpft, haengt er sicher zusammen, sobald
// der Hinwegring es tut.
function linkRingsFor(F,lvlInner,s,eps,kids){
  const seeds=kids.map(c=>c.ring[0]);
  const at=f=>{
    const hit=isoContours(F,lvlInner+f*s,eps).filter(r=>seeds.every(p=>inRing(p,r)));
    return hit.length===1?hit[0]:null;
  };
  for(const f of [0.6,0.45,0.3,0.16,0.08]){
    const a=at(f), b=a&&at(f/2);
    if(a&&b) return {a,b};
  }
  return null;
}
// Bogen auf dem Verbinderring, immer VORWAERTS in Ringrichtung. Damit laufen
// aufeinanderfolgende Verbinder rundherum in einer Richtung und koennen sich
// nicht kreuzen.
function ringArcBetween(ring,arc,tFrom,tTo){
  const {cum,L}=arc, n=ring.length;
  const span=((tTo-tFrom)%L+L)%L;
  const out=[ptAtArc(ring,cum,L,tFrom)];
  for(let k=0;k<2*n;k++){
    const t=cum[k%n]+(k>=n?L:0);
    if(t>tFrom+1e-9 && t<tFrom+span-1e-9) out.push(ring[k%n]);
  }
  out.push(ptAtArc(ring,cum,L,tTo));
  return out;
}

// ---------- Ganzer Raum: Konturbaum als EIN Pfad ----------
// Die Unterbaeume eines Verzweigungsknotens werden zwischen Vorlauf und
// Ruecklauf der Elternkette eingehaengt. Jeder Unterbaum betritt und verlaesst
// sein Gebiet an derselben Stelle (der Luecke seiner aeussersten Kontur), also
// bleibt die bifilare Ordnung der Elternkette unberuehrt.
//
// Vorlaufende -> Kind 1 -> Kind 2 -> ... -> Ruecklaufanfang laeuft als EIN
// Rundgang auf dem Verbinderring, immer in derselben Richtung. Kinder werden
// dafuer nach ihrer Bogenlaenge auf diesem Ring sortiert. Ein Rundgang in
// einer Richtung ist eine einfache geschlossene Kurve - er kann sich nicht
// selbst kreuzen, und den Elternbahnen weicht er aus, weil er innerhalb der
// innersten Elternkontur bleibt.
function spiralNode(F,e0,s,eps,node,seed,g,stat){
  const {rings,end,kInner}=chainFrom(node);
  const P=spiralParts(rings,seed,g);
  if(!P) return [];
  const kids=end?end.children:[];
  let middle=P.turnVia;
  if(kids.length){
    const LR=linkRingsFor(F,e0+kInner*s,s,eps,kids);
    const A=P.inward[P.inward.length-1], B=P.outward[0];
    if(LR&&A&&B){
      const ring=LR.a, arc=ringArc(ring), L=arc.L;
      const rb=LR.b, arcB=ringArc(rb);
      const tOf=p=>arcOfNearest(ring,arc.cum,p).t;
      const tOfB=p=>arcOfNearest(rb,arcB.cum,p).t;
      // Einstieg wie Ausstieg vom ZIEL her: der Bogen beginnt am Ringpunkt, der
      // dem letzten Lueckenpunkt am naechsten liegt, sonst laeuft das
      // Anfahrstueck schraeg statt radial.
      const down0=[];
      for(let k=P.aIdx+1;k<=P.nIdx;k++){ const p=P.gapAt(k,-g/4); if(p) down0.push(p); }
      const tA=tOf(down0.length?down0[down0.length-1]:A);
      const fwd=t=>((t-tA)%L+L)%L;
      // Erst die Unterbaeume bauen, dann einsortieren. Ihre Naht liegt nicht
      // fest, wo man sie erwartet - sie waechst von innen nach aussen, also
      // steht der tatsaechliche Ein- und Austrittspunkt erst danach fest.
      // Nach einem geratenen Ringpunkt zu sortieren ergab Anfahrten quer durch
      // den halben Raum, und genau das waren die Kreuzungen.
      const subs=kids.map(c=>{
        const mid=c.ring.reduce((a,p)=>({x:a.x+p.x/c.ring.length,y:a.y+p.y/c.ring.length}),{x:0,y:0});
        const near=ptAtArc(ring,arc.cum,L,tOf(mid));
        const sp=spiralNode(F,e0,s,eps,c,near,g,stat);
        return sp.length>1 ? {sp,tIn:tOf(sp[0]),tOut:tOf(sp[sp.length-1])} : null;
      }).filter(Boolean).sort((a,b)=>fwd(a.tIn)-fwd(b.tIn));
      // Der Verbinderring liegt TIEFER als jede Elternkontur. Vorlaufende und
      // Ruecklaufanfang liegen aber nicht zwingend auf der innersten - der Weg
      // dorthin quert die dazwischenliegenden Konturen und muss das in deren
      // Luecken tun, sonst schneidet er sie (im Hantelraum genau eine solche
      // Kreuzung).
      // Hin- und Rueckweg queren dieselben Luecken. Der Hinweg laeuft auf der
      // Seite, auf der der Vorlauf endet (-g/2), der Rueckweg um g/4 versetzt
      // auf der anderen. Der Rundgang schliesst ebenfalls um g/4 vor seinem
      // Startpunkt, damit die beiden Radialstuecke am Verbinderring nicht
      // zusammenfallen.
      const down=[], up=[];
      for(let k=P.aIdx+1;k<=P.nIdx;k++){ const p=P.gapAt(k,-g/4); if(p) down.push({...p,_t:'ab'}); }
      for(let k=P.nIdx;k>P.bIdx;k--)   { const p=P.gapAt(k, g/4); if(p) up.push({...p,_t:'auf'}); }
      // Der Rundgang laeuft nur VORWAERTS. Ein Unterbaum wird an seinem
      // Eintritt betreten und um g/4 dahinter wieder verlassen - nicht an
      // seinem Austrittspunkt. Dessen Lage auf dem Ring ist nicht garantiert
      // hinter dem Eintritt, und liegt sie davor, laeuft der Bogen rueckwaerts
      // in sein eigenes vorheriges Stueck hinein.
      middle=[...down]; let fPrev=0;
      for(const sub of subs){
        const fIn=fwd(sub.tIn);
        middle.push(...ringArcBetween(ring,arc,tA+fPrev,tA+fIn).map(p=>({...p,_t:'hinweg'})));
        middle.push(...sub.sp);
        fPrev=fIn+g/4;
      }
      // Rueckweg: auf den flacheren Ring wechseln und ihn RUECKWAERTS bis kurz
      // vor die Naht laufen. Rueckwaerts, damit er den Hinweg nicht einholt.
      //
      // Wo er endet, wird vom ZIEL her bestimmt: der Punkt des Rings, der dem
      // Ausstiegspunkt am naechsten liegt. Nur dann ist das Schlussstueck eine
      // echte Radiale und laeuft monoton nach aussen. Vom Einstieg her
      // gerechnet endete es seitlich versetzt, schnitt die Ecke ab und kreuzte
      // dabei den eigenen Bogen - jede verbliebene Kreuzung war genau das.
      // Der Rueckweg muss KURZ VOR dem Einstieg enden. Der naechste Ringpunkt
      // zum Ausstieg liegt aber nicht zwangslaeufig davor - projiziert man zwei
      // Punkte, die auf der Elternkontur g/2 auseinanderliegen, ueber eine Ecke
      // hinweg auf den Verbinderring, kippt ihre Reihenfolge. Dann wickelt der
      // Bogen ueber den Einstieg hinweg und kreuzt ihn. Kippt sie, wird die
      // Lage direkt gesetzt statt projiziert.
      const E=up[0]??B, LB=arcB.L;
      const tB0=tOfB(down0.length?down0[down0.length-1]:A);
      const fwdB=t=>((t-tB0)%LB+LB)%LB;
      let eB=tOfB(E);
      if(!(fwdB(eB)>1 && fwdB(eB)<g)) eB=tB0+g/2;
      // Umstieg auf den Rueckwegring an derselben Stelle, an der der Hinweg
      // aufgehoert hat - massstaeblich uebertragen, weil beide Ringe
      // verschieden lang sind.
      const fEnd=tB0+fPrev*LB/L;
      middle.push(...ringArcBetween(rb,arcB,eB,fEnd).reverse()
                    .map(p=>({...p,_t:'rueckweg'})),...up);
    }else{
      stat.unlinked++;                       // kein Verbinderring gefunden
      kids.forEach(c=>{ middle=middle.concat(spiralNode(F,e0,s,eps,c,P.outward[0]||seed,g,stat)); });
    }
  }
  return [...P.head,...P.inward,...middle,...P.outward];
}
function spiralRoom(F,e0,s,eps,seed){
  const {roots,levels}=contourTree(F,e0,s,eps);
  const stat={unlinked:0};
  let path=[], ref=seed, nodes=0;
  const count=nd=>{ nodes++; nd.children.forEach(count); };
  roots.forEach(count);
  for(const r of roots){
    const p=spiralNode(F,e0,s,eps,r,ref,2*s,stat);
    if(p.length<2) continue;
    path=path.concat(p); ref=p[p.length-1];
  }
  return {path,levels,nodes,unlinked:stat.unlinked};
}

// ---------- Testraeume ----------
const ROOMS={
  'Rechteck 6x4'  : [{x:0,y:0},{x:6000,y:0},{x:6000,y:4000},{x:0,y:4000}],
  'Trapez schraeg': [{x:0,y:0},{x:6000,y:0},{x:4500,y:3000},{x:0,y:3000}],
  'L (Stamm)'     : [{x:0,y:0},{x:8000,y:0},{x:8000,y:2000},{x:3000,y:2000},{x:3000,y:5000},{x:0,y:5000}],
  'U-Raum'        : [{x:0,y:0},{x:6000,y:0},{x:6000,y:4000},{x:4000,y:4000},
                     {x:4000,y:1500},{x:2000,y:1500},{x:2000,y:4000},{x:0,y:4000}],
  'T-Raum'        : [{x:0,y:0},{x:6000,y:0},{x:6000,y:2000},{x:4000,y:2000},
                     {x:4000,y:5000},{x:2000,y:5000},{x:2000,y:2000},{x:0,y:2000}],
  // Hantel: zwei Koepfe an einem schmalen Hals - spaltet frueh in zwei Ketten
  'Hantel'        : [{x:0,y:0},{x:2500,y:0},{x:2500,y:1200},{x:5500,y:1200},
                     {x:5500,y:0},{x:8000,y:0},{x:8000,y:3000},{x:5500,y:3000},
                     {x:5500,y:1800},{x:2500,y:1800},{x:2500,y:3000},{x:0,y:3000}],
  // Fuenfeck mit zwei schraegen Waenden
  'Fuenfeck schraeg':[{x:0,y:0},{x:6000,y:0},{x:7000,y:2500},{x:3000,y:4500},{x:0,y:3000}],
};

// ---------- Deckung ----------
// Kein Punkt des Raums weiter als der Bahnabstand vom naechsten Rohr (Vorgabe
// aus dem Plan). Gerastert, weil eine analytische Schranke nichts ueber die
// tatsaechlich erzeugte Geometrie sagt.
function maxUncovered(poly,path,step){
  let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
  for(const p of poly){ minx=Math.min(minx,p.x); maxx=Math.max(maxx,p.x);
                        miny=Math.min(miny,p.y); maxy=Math.max(maxy,p.y); }
  let worst=0;
  for(let y=miny+step/2;y<maxy;y+=step) for(let x=minx+step/2;x<maxx;x+=step){
    const p={x,y};
    if(!inRing(p,poly)) continue;
    let best=Infinity;
    for(let i=0;i<path.length-1;i++){
      const d=nearestOnSeg(p,path[i],path[i+1]).d;
      if(d<best){ best=d; if(best<step) break; }
    }
    if(best>worst) worst=best;
  }
  return worst;
}
// Gegenstrom: benachbarte Bahnen muessen entgegengesetzt durchflossen werden.
// Geprueft am Vorzeichen des Skalarprodukts der Laufrichtungen an einem Punkt
// und seinem naechsten Nachbarn auf einer ANDEREN Bahn (mindestens s/2 entfernt
// entlang des Pfads, sonst ist es dieselbe Bahn).
function counterflowShare(path,s){
  const dir=i=>{const a=path[i],b=path[i+1];const l=dist(a,b)||1;
                return {x:(b.x-a.x)/l,y:(b.y-a.y)/l};};
  let good=0,tot=0;
  for(let i=0;i<path.length-1;i+=3){
    let best=Infinity,bj=-1;
    for(let j=0;j<path.length-1;j++){
      if(Math.abs(i-j)<4) continue;
      const d=nearestOnSeg(path[i],path[j],path[j+1]).d;
      if(d>s*0.4&&d<s*1.6&&d<best){best=d;bj=j;}
    }
    if(bj<0) continue;
    tot++; if(dot(dir(i),dir(bj))<0) good++;
  }
  return tot?good/tot:1;
}

// ---------- Lauf ----------
const H=20, EPS=2, E0=75;
console.log(`Raster ${H} mm, Vereinfachung ${EPS} mm, erste Bahn ${E0} mm von der Wand\n`);
console.log('Raum                s  Knoten  Punkte   Pfad     Kreuz.  max.Lücke  Gegenstrom');
let bad=0, uncov=0;
for(const [name,poly] of Object.entries(ROOMS)){
  const F=signedDistanceField(poly,H);
  for(const s of [100,150,200]){
    const {path,levels,nodes,unlinked}=spiralRoom(F,E0,s,EPS,poly[0]);
    const nBranches=nodes;
    const len=path.reduce((a,p,i)=>i?a+dist(p,path[i-1]):0,0);
    const x=selfCross(path);
    const gap=maxUncovered(poly,path,50);
    const cf=counterflowShare(path,s);
    if(x>0) bad++;
    if(gap>s) uncov++;
    console.log(`${name.padEnd(17)} ${String(s).padStart(3)} ${String(nBranches).padStart(6)}  `
      +`${String(path.length).padStart(6)}  ${(len/1000).toFixed(1).padStart(6)} m  `
      +`${String(x).padStart(6)}  ${gap.toFixed(0).padStart(6)} mm  ${(cf*100).toFixed(0).padStart(6)} %`
      +(levels?'':'  (leer)'));
  }
}
console.log(bad?`\n${bad} Faelle mit Kreuzungen`:'\nAlle Faelle kreuzungsfrei');
console.log(uncov?`${uncov} Faelle mit Luecke > s`:'Deckung ueberall <= s');
