// ------------------------------------------------ Karte: Ringe und Export (M8)
// Ringe (Aussenring + Inseln, Meter in F0) pruefen und als Raumdaten fuer raumaufmass.html
// ausgeben. Vertrag: ARCHITEKTUR v3, Abschnitte 3.4 (Ring, RoomData, Teilen), 4 (Block M8),
// 7.3/7.5 (Export, ungesehene Waende), 7.6/7.7 (Abstand, Insel in Insel), 8.2 (Schrankfront),
// 1.4 (Spiegel), 10.6 (Abnahme), 17.7 (Bauauftrag). Die Datei steht wortgleich als eigener
// Block { ... } im geo-Block; sie setzt G voraus, braucht zur Laufzeit nur G.idOf (geo-Kern)
// und haengt nur G.ringePruefen, G.toRoomDataRinge, G.ringeHinweise an G.
// Kein DOM, keine Uhr, kein Math.random: laeuft im Hauptfaden, im Worker und in Node.
//
// Reihenfolge des Exports (eine Regel fuer alle drei Funktionen, Helfer folge): nur Ringe mit
// exportiert !== false, der Ring mit art 'aussen' zuerst, dann die Inseln in Eingabereihenfolge.
// IDs fortlaufend ueber alle Ringe (G.idOf wie nextId() der App), Wand k eines Rings laeuft von
// Ecke k nach Ecke k+1 (Ecke k = Schnitt der Linien von Wand k-1 und k, 3.4).
//
// Pruefen (ringePruefen) heisst: dieselben Regeln wie wallPolygon (raumaufmass.html: jeder Ring
// einfach, jede Insel ganz im Aussenring, keine in einer anderen, keine Kreuzung zwischen Ringen),
// aber STRENGER und auf genau den ganzen Millimetern, die der Export traegt. wallPolygon erkennt
// nur echte Kreuzungen (segCross: parallele und sich beruehrende Kanten zaehlen nicht); hier
// zaehlt jede Beruehrung, jede Ueberlappung und jede Spitze (Kante kehrt auf sich zurueck). Dazu
// die eigenen Mindestmasse aus 3.10 (live) fuer Inseln: Seite >= minSeite, Flaeche >= minFlaeche,
// Abstand zum Aussenring und zu jeder anderen Insel >= minAbstand. Damit gilt: ok und
// toRoomDataRinge(erg.ringe) wird von wallPolygon angenommen, mit erg.ringe.length - 1 Inseln.
// Der Spiegel (y = -round(1000 z)) negiert die Millimeter genau; die Pruefung gilt fuer beide.
// Eingeschmolzen wird NIE hier (7.6: das macht M7 mit aussenEinschmelzen). Eine Insel unter
// minAbstand am Aussenring ist darum ein Fehler von M7 und wird verworfen (10.6), nicht verschoben.
// Mindestseite und -flaeche gelten nur fuer Inseln (3.10 live: "verworfene Inseln"); der
// Aussenring darf Verspruenge ab jogMin = 4 cm haben (M7) und braucht nur Kanten > 0 mm.
// Insel in Insel: beide verworfen (7.7, wie zwei Inseln < minAbstand: nichts raten).
//
// Gruende (verworfen[].grund): Aussenring 'kein-aussenring', 'mehrere-aussenringe', 'zu-wenig-ecken',
// 'nicht-endlich', 'doppelte-ecke', 'kreuzt-sich', 'flaeche', 'aussen-klein' (Flaeche unter o.minAussen = 1,0 m²,
// 19.2 Z10: ein Splitter ist kein Raum) -> ok = false, nichts exportierbar.
// Inseln 'zu-wenig-ecken', 'nicht-endlich', 'seite', 'kreuzt-sich', 'flaeche', 'ragt-hinaus'
// (Kante schneidet oder beruehrt den Aussenring), 'ausserhalb', 'abstand-aussen', 'kreuzt-insel',
// 'insel-in-insel', 'abstand-insel' -> nur diese Insel faellt weg (bzw. beide bei den letzten drei).
//
// Abweichungen von der Signatur in 4 (zur Bestaetigung, additiv, Vorgaben wie bisher):
//   toRoomDataRinge o.schrank: Wand-ids mit cls 'schrank' (Ring traegt kein Schrank-Feld, die
//     Funktion bekommt keine Karte). Vorgabe [] -> kamera.schrankWaende leer.
//   ringeHinweise(ringe, roomData, basis): Grundname vom Aufrufer (mit Datum; das Modul liest keine
//     Uhr). Vorgabe 'Raumskizze'. liste[] traegt zusaetzlich art und laenge (m), Rueckgabe fehler.
//   kamera.inseln[] traegt zusaetzlich ring (Ring.id), fuer insel-entscheid.
//   Ungesehen ist Wand k, wenn Ring.hyp[k] wahr ist oder Ring.waende[k] null (Hypothesenlinie).
const GRUND={'kein-aussenring':'kein Außenring', 'mehrere-aussenringe':'mehr als ein Außenring', 'zu-wenig-ecken':'weniger als 3 Ecken',
  'nicht-endlich':'Ecke ohne endliche Koordinate', 'doppelte-ecke':'zwei Ecken auf demselben Millimeter', 'kreuzt-sich':'Ring kreuzt oder berührt sich selbst',
  'flaeche':'Fläche zu klein', 'aussen-klein':'Außenring unter der Mindestfläche'};
// Export-Folge: [{R, i}] mit i = Index in ringe.
const folge=ringe=>{ const f=[]; (ringe||[]).forEach((R,i)=>{ if(R && R.exportiert!==false) f.push({R, i}); });
  const a=f.filter(e=>e.R.art==='aussen'); return a.length ? [...a, ...f.filter(e=>e.R.art!=='aussen')] : f; };
const mmX=c=>Math.round(c[0]*1000), mmZ=c=>Math.round(c[1]*1000);
const ungesehen=(R,k)=>!!(R.hyp && R.hyp[k]) || (Array.isArray(R.waende) && R.waende[k]==null);

// ---- Geometrie auf ganzen mm (exakt: Produkte < 2^53)
const ori=(a,b,c)=>Math.sign((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));
const imKasten=(a,b,p)=>Math.min(a[0],b[0])<=p[0] && p[0]<=Math.max(a[0],b[0]) && Math.min(a[1],b[1])<=p[1] && p[1]<=Math.max(a[1],b[1]);
const aufSeg=(a,b,p)=>ori(a,b,p)===0 && imKasten(a,b,p);
// Strecken ab und cd haben einen gemeinsamen Punkt (Kreuzung, Beruehrung oder Ueberlappung).
const treffen=(a,b,c,d)=>{ const o1=ori(a,b,c), o2=ori(a,b,d), o3=ori(c,d,a), o4=ori(c,d,b);
  if(o1===0 && o2===0) return imKasten(a,b,c) || imKasten(a,b,d) || imKasten(c,d,a) || imKasten(c,d,b);
  return o1*o2<=0 && o3*o4<=0; };
const flaeche2=P=>{ let A=0; for(let i=0,j=P.length-1;i<P.length;j=i++) A+=P[j][0]*P[i][1]-P[i][0]*P[j][1]; return A; };   // doppelt, mm²
const segAbst=(p,a,b)=>{ const vx=b[0]-a[0], vy=b[1]-a[1], L=vx*vx+vy*vy; let t=L>0 ? ((p[0]-a[0])*vx+(p[1]-a[1])*vy)/L : 0;
  t=Math.max(0, Math.min(1, t)); return Math.hypot(a[0]+t*vx-p[0], a[1]+t*vy-p[1]); };
const ringAbst=(A,B)=>{ let m=Infinity; for(const [X,Y] of [[A,B],[B,A]]) for(const p of X) for(let k=0;k<Y.length;k++) m=Math.min(m, segAbst(p, Y[k], Y[(k+1)%Y.length])); return m; };
const ringeTreffen=(A,B)=>{ for(let a=0;a<A.length;a++) for(let b=0;b<B.length;b++) if(treffen(A[a], A[(a+1)%A.length], B[b], B[(b+1)%B.length])) return true; return false; };
// Strikt innen: nicht auf dem Rand, dann Strahl wie pointInRing der App (fuer randfreie Punkte eindeutig).
const innen=(p,P)=>{ for(let k=0;k<P.length;k++) if(aufSeg(P[k], P[(k+1)%P.length], p)) return false;
  let c=false; for(let i=0,j=P.length-1;i<P.length;j=i++){ const a=P[i], b=P[j];
    if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) c=!c; } return c; };
// Ring einfach im strengen Sinn: keine Kante trifft eine nicht benachbarte, keine Spitze (zwei
// benachbarte Kanten kollinear gegenlaeufig). Kanten der Laenge 0 prueft der Aufrufer vorher.
const einfach=P=>{ const n=P.length;
  for(let i=0;i<n;i++){ const a=P[i], b=P[(i+1)%n], c=P[(i+2)%n];
    if(ori(a,b,c)===0 && (b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1])<0) return false;
    for(let j=i+2;j<n;j++){ if(i===0 && j===n-1) continue; if(treffen(a, b, P[j], P[(j+1)%n])) return false; } }
  return true; };
const kurz=(P,min)=>{ for(let k=0;k<P.length;k++){ const q=P[(k+1)%P.length]; if(Math.hypot(q[0]-P[k][0], q[1]-P[k][1])<min) return true; } return false; };
// Einzelpruefung eines Rings auf mm; liefert Grund oder null. sMin: kleinste Seite (mm).
const ringGrund=(R,P,sMin,aMin)=>{
  if(!Array.isArray(R.pts) || R.pts.length<3) return 'zu-wenig-ecken';
  if(!P.every(p=>Number.isFinite(p[0]) && Number.isFinite(p[1]))) return 'nicht-endlich';
  if(kurz(P, 1)) return R.art==='aussen' ? 'doppelte-ecke' : 'seite';
  if(kurz(P, sMin)) return 'seite';
  if(!einfach(P)) return 'kreuzt-sich';
  if(Math.abs(flaeche2(P))/2<aMin) return 'flaeche';
  return null; };

G.ringePruefen=(ringe,o={})=>{
  o={minAbstand:0.05, minSeite:0.08, minFlaeche:0.02, minAussen:1.0, ...o};
  const F=folge(ringe), A=F.filter(e=>e.R.art==='aussen'), aus=(i,grund)=>({ok:false, ringe:[], verworfen:[{i, grund}], fehler:'Außenring: '+GRUND[grund]});
  if(A.length!==1) return {ok:false, ringe:[], verworfen:A.slice(1).map(e=>({i:e.i, grund:'mehrere-aussenringe'})),
    fehler:GRUND[A.length ? 'mehrere-aussenringe' : 'kein-aussenring']};
  const mm=R=>(R.pts||[]).map(c=>[mmX(c), mmZ(c)]);
  const Ra=A[0].R, Pa=mm(Ra), ga=ringGrund(Ra, Pa, 1, 1e6*o.minFlaeche);
  if(ga) return aus(A[0].i, ga);
  if(Math.abs(flaeche2(Pa))/2<1e6*o.minAussen) return aus(A[0].i, 'aussen-klein');
  const dMin=1000*o.minAbstand, I=[], grund=new Map();
  for(const e of F.slice(1)){ const P=mm(e.R);
    let g=ringGrund(e.R, P, 1000*o.minSeite, 1e6*o.minFlaeche);
    if(!g && ringeTreffen(P, Pa)) g='ragt-hinaus';
    if(!g && !P.every(p=>innen(p, Pa))) g=P.some(p=>innen(p, Pa)) ? 'ragt-hinaus' : 'ausserhalb';
    if(!g && ringAbst(P, Pa)<dMin) g='abstand-aussen';
    if(g) grund.set(e.i, g); else I.push({...e, P}); }
  // Paare nur unter den Inseln, die einzeln bestanden haben; je Insel zaehlt der erste Grund.
  for(let a=0;a<I.length;a++) for(let b=a+1;b<I.length;b++){ const X=I[a], Y=I[b];
    const g=ringeTreffen(X.P, Y.P) ? 'kreuzt-insel' : innen(X.P[0], Y.P) || innen(Y.P[0], X.P) ? 'insel-in-insel'
      : ringAbst(X.P, Y.P)<dMin ? 'abstand-insel' : null;
    if(g){ if(!grund.has(X.i)) grund.set(X.i, g); if(!grund.has(Y.i)) grund.set(Y.i, g); } }
  const verworfen=[...grund].map(([i, g])=>({i, grund:g})).sort((x,y)=>x.i-y.i);
  return {ok:true, ringe:[Ra, ...I.filter(e=>!grund.has(e.i)).map(e=>e.R)], verworfen, fehler:null};
};

G.toRoomDataRinge=(ringe,hLaserMm,o={})=>{
  o={kamera:true, spiegel:false, schrank:[], ...o};
  const sch=new Set(o.schrank||[]), pts=[], walls=[], hyp=[], schrank=[], inseln=[];
  let k=0;
  for(const {R} of folge(ringe)){
    const ids=R.pts.map(c=>{ const id=G.idOf(k++); pts.push({id, x:mmX(c), y:o.spiegel ? -mmZ(c) : mmZ(c)}); return id; });
    ids.forEach((id,j)=>{ const w=[id, ids[(j+1)%ids.length]]; walls.push(w);
      if(ungesehen(R, j)) hyp.push([...w]); else if(Array.isArray(R.waende) && sch.has(R.waende[j])) schrank.push([...w]); });
    if(R.art!=='aussen') inseln.push({ring:R.id ?? null, ids, teil:!!R.teil, sup:Number.isFinite(R.supRing) ? R.supRing : null, entscheid:R.entscheid ?? null}); }
  const hmeas=Number.isFinite(hLaserMm) && hLaserMm>0 && pts.length ? [{kind:'h', at:pts[0].id, d:Math.round(hLaserMm), sigma:5, on:true}] : [];
  const data={pts, walls, meas:[], openings:[], hmeas, idSeq:pts.length, openSeq:1};
  if(o.kamera) data.kamera={version:1, quelle:'karte', inseln, hypWaende:hyp, schrankWaende:schrank, gespiegelt:!!o.spiegel};
  return data;
};

G.ringeHinweise=(ringe,roomData,basis='Raumskizze')=>{
  const F=folge(ringe), P=new Map(((roomData && roomData.pts)||[]).map(p=>[p.id, p])), W=(roomData && roomData.walls)||[];
  const key=w=>w[0]+'|'+w[1], sch=new Set(((roomData && roomData.kamera && roomData.kamera.schrankWaende)||[]).map(key));
  const liste=[]; let k=0, fehler=null;
  for(const {R, i} of F){ const n=R.pts.length;
    for(let j=0;j<n;j++){ const soll=[G.idOf(k+j), G.idOf(k+(j+1)%n)], w=W[k+j];
      if(!w || w[0]!==soll[0] || w[1]!==soll[1] || !P.has(w[0]) || !P.has(w[1])){ fehler='Raumdaten passen nicht zu den Ringen (Wand '+(k+j)+')'; break; }
      const grund=ungesehen(R, j) ? 'ungesehen' : sch.has(key(w)) ? 'schrank' : null;
      if(grund){ const a=P.get(w[0]), b=P.get(w[1]);
        liste.push({ring:R.id ?? i, art:R.art, wand:[w[0], w[1]], grund, laenge:Math.round(Math.hypot(b.x-a.x, b.y-a.y))/1000}); } }
    if(fehler) break; k+=n; }
  if(fehler) return {name:basis, liste:[], fehler};
  const teil=(L,eins,mehr)=>{ if(!L.length) return null; const ids=L.slice(0, 8).map(e=>e.wand.join('-')).join(', ')+(L.length>8 ? ', …' : '');
    return (L.length===1 ? '1 '+eins : L.length+' '+mehr)+': '+ids; };
  const z=[teil(liste.filter(e=>e.grund==='ungesehen'), 'Wand ungesehen', 'Wände ungesehen'),
           teil(liste.filter(e=>e.grund==='schrank'), 'Schrankfront', 'Schrankfronten')].filter(Boolean);
  return {name:z.length ? (basis ? basis+' ' : '')+'('+z.join('; ')+')' : basis, liste, fehler:null};
};
