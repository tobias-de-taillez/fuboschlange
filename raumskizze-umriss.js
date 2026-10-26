// ------------------------------------------------ Karte: Umriss mit Inseln (M7)
// Grundriss der globalen Karte als Aussenring plus Inselringe (Pfeiler, freistehende Wandstuecke).
// Vertrag: ARCHITEKTUR v3, Abschnitte 3.4 (Strukturen), 4 (Block M7), 7.1-7.7 (Inseln), 8.1-8.4
// (Sonderfaelle), 17.6 (Bauauftrag). Vorlage: design/umriss/umriss.mjs (Zerlegung + Min-Cut),
// design/rev/umriss-hyp.mjs und insel-hyp.mjs (Inselhypothesen). Die Datei steht wortgleich als
// eigener Block { ... } im geo-Block; sie setzt G voraus und haengt nur an G. Zur Laufzeit braucht
// sie aus M0 G.wandN, G.wandU, G.gBei, G.gPlan und G.hyst. Kein DOM, kein Zufall; die Uhr misst nur
// (ms), sie entscheidet nichts. Gleiche Eingabe gibt gleiche Ringe (bitgleich).
//
// Rahmen F0, Draufsicht p = [x, z] in m. Linie n·p = d, n = G.wandN(phi) zeigt zur FREIEN Seite
// (side = +1), u = [-n_z, n_x], Laengskoordinate s = u·p, gesehene Stuecke iv = [[s0, s1], ...].
//
// G.umriss(inp, opt), Ablauf:
//  1 Linien: numerisch Doppelte (<= mergeDeg, <= mergeD am Mittelpunkt) nur unter der Lueckenregel 3.3
//    zusammenlegen (Stuecke ueberlappen oder Luecke <= lueckeMax ohne Durchblick und ohne dort endende
//    Querlinie, W13). Durchblick-Stuecke einer Linie sind weder starke Linie noch Inselseite noch Stueckende
//    (7.2, 8.3); ihr Beleg fuer den Schnitt bleibt (die Wand steht ueber Sturz oder Unterzug).
//  2 Freiraum-Raster (tau): Faecher Kamera -> gehobenes Kantenstueck, back vor der Kante beendet, Gewicht w.
//    Sichtpruefung: ein Faecher endet an der ersten starken Linie (hOk, >= clipMinSup gesehen), die er von
//    ihrer freien Seite her innerhalb ihrer Stuecke quert. Quert er sie in einer Luecke oder einem Durchblick,
//    zaehlt er dahinter nur bis tuerTiefe (8.1). Linien, deren Faecher ganz hinter einer solchen Oeffnung
//    enden (Flur, Nachbarraum), verlieren ihren Beleg anteilig. Kameraweg: Scheibe pathR, Gewicht des Abschnitts.
//  3 Hypothesenlinien senkrecht durch die Enden gesehener Stuecke, nicht an Durchblick-Luecken innerhalb der Linie
//    (Tuer, Sturz: 8.1); Durchblick jenseits der Linienenden (Luecke zu einem kollinearen Nachbarn) sperrt sie nicht.
//  4 Zerlegung der Ebene durch alle Linien in konvexe Zellen, Nachbarschaften je Linie.
//  5 Energie (s = innen, t = aussen): aussen kostet betaF·A·phi + betaPfad·A·a·w (a Weganteil, w Gewicht des
//    Wegs; weich statt fest, 7.1), innen kostet betaU·A·(1 - phi); Randzellen fest aussen, inselFest fest
//    aussen. Wandbeleg kap je Nachbarkante (Ueberlapp mit den Stuecken, mal kap und w der Linie): Vorderzelle
//    rWall·l·kap auf aussen, Hinterzelle auf innen; Schnitt lam·l·(1 - kap) + eps·l (innen auf der freien
//    Seite) bzw. lam·l + eps·l.
//  6 Min-Cut (Dinic). Raum = groesste Innen-Komponente; andere Innen-Stuecke -> innenVerworfen (mit Flaeche).
//  7 Loecher (Aussen-Komponenten ohne Randkontakt) sind Inseln (Weg a), wenn: Flaeche islandMinA..islandMaxA,
//    Beleg >= islandMinSup von der richtigen Seite mit hOk, zwei nicht parallele oder zwei gegenueberliegende
//    belegte Seiten, Dicke A/(U/2) >= islandMinThick und Freiraum phi <= inselPhiSetzen (Hysterese bis
//    inselPhiLoesen, wenn es in opt.vorher schon Insel war). Sonst aufgefuellt. 'voll' (auto) verlangt zusaetzlich
//    eine gesehene Ecke: zwei belegte Seiten mit |Δφ - 90°| <= 15°, je >= hypMinSeite (Echt A6-A8: Platte zwischen zwei
//    gegenlaeufigen Linien, Enden nur Hypothesenlinien, sonst falsch exportiert; Bericht P-E). Inseln naeher als
//    aussenEinschmelzen am Aussenring werden eingeschmolzen (Raumzellen dazwischen aussen, auch Keile an Inselecken, 7.6).
//  8 Raender je Komponente verfolgen (innen links), Laeufe derselben Linie zusammenfassen, Ecke = Schnitt
//    der Nachbarlinien. Versprung zwischen fast parallelen Linien bleibt nur, wenn er >= jogMin und
//    > jogSigma·sqrt(sd1² + sd2²) ist; direkt folgende Kanten fast kollinearer Linien (<= mergeDeg) werden
//    zu einer Kante, wenn ihr Abstand nicht signifikant ist (7.6). Exportregel 7.3.
//  9 Inselhypothesen (Weg b, 7.2): G.inselHypothesen, je Hypothese ein zusaetzlicher Schnitt im selben
//    Graphen (G.inselBewerten: Restnetz des freien Schnitts fortgesetzt), hoechstens hypMax, Reihenfolge nach id.
//    Rechtecke, die eine Insel des freien Schnitts ueberlappen, entfallen (kein zweiter Ring fuer dasselbe Objekt).
//    Wie ARCHITEKTUR 4 (M10 Schritt 8) ruft M10 G.inselHypothesen/G.inselBewerten selbst; mit opt.hyp = true
//    erledigt G.umriss Weg b im selben Aufruf (T1, Tests ohne M10) und legt teil-Ringe und Kandidaten an.
//
// Optionen ausser G.UM_DEF (nur im Aufruf, nicht in UM_DEF, ARCHITEKTUR 4 bleibt unveraendert):
//   vorher: UmrissErgebnis der vorigen Runde (KZ.umriss) fuer die Hysteresen (phi-Tor Weg a, Stufen Weg b);
//     G.inselBewerten nimmt auch die vorige InselBewertung derselben id (so ruft M10);
//   hyp: true schaltet Weg b in G.umriss ein (Vorgabe aus, M10 macht es). Abweichung dokumentiert im Bericht P-E;
//     der endgueltige Schnitt mit einer vollen Hypothese ist deren erzwungener Schnitt (kein weiterer).
// G.umrissEingabe kennt zusaetzlich lokalOben ('gleich' | 'bis', 8.3), siehe dort.
// Rechenweg (gleiches Ergebnis wie der Prototyp-Weg, bitgleich geprueft): Zerlegung mit Huellrechteck-Vorpruefung, Min-Cut
// mit vorab aufgehobenen Endkanten, BFS bis zur Stufe von t und gesperrten Sackgassen (Bericht P-E, Arbeit 10.5).
G.UM_DEF={tau:0.05, back:0.12, margin:0.6, fMin:1, pathR:0.10, betaPfad:20, lam:1, eps:0.05, rWall:1, betaF:4, betaU:0.2,
  hypEnds:true, hypEndTol:0.08, hypThick:0, mergeDeg:1, mergeD:0.02, lueckeMax:0.5, tuerTiefe:0.3,
  islandMinA:0.01, islandMaxA:12, islandMinSup:0.5, islandFullSup:0.85, islandMinThick:0.08, inselPhiSetzen:0.45, inselPhiLoesen:0.55,
  hypMax:4, hypMinSeite:0.10, hypEckeTol:0.15, hypDEnSetzen:0.30, hypDEnLoesen:0.40, hypRunden:3,
  aussenEinschmelzen:0.05, jogMin:0.04, jogSigma:3, clip:true, clipMinSup:0.8, wBoden:0};

// ------------------------------------------------ Hilfen
const BIG=1e9, D2R=Math.PI/180;
const uhr=()=>{ const p=globalThis.performance; return p && p.now ? p.now() : 0; };   // nur Messung
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const lineOf=(n,d)=>{ const L=Math.hypot(n[0], n[1]); n=[n[0]/L, n[1]/L]; return {n, d:d/L, u:[-n[1], n[0]]}; };
const P_=(l,t)=>[l.n[0]*l.d+l.u[0]*t, l.n[1]*l.d+l.u[1]*t];
const sdist=(l,p)=>l.n[0]*p[0]+l.n[1]*p[1]-l.d;
const xLine=(a,b)=>{ const cr=a.n[0]*b.n[1]-a.n[1]*b.n[0]; if(Math.abs(cr)<1e-9) return null;
  return [(a.d*b.n[1]-b.d*a.n[1])/cr, (a.n[0]*b.d-b.n[0]*a.d)/cr]; };
const area2=P=>{ let a=0; for(let i=0,j=P.length-1;i<P.length;j=i++) a+=P[j][0]*P[i][1]-P[i][0]*P[j][1]; return a/2; };
const pip=(p,P)=>{ let c=false; for(let i=0,j=P.length-1;i<P.length;j=i++){ const a=P[i], b=P[j];
  if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) c=!c; } return c; };
const segAbst=(p,a,b)=>{ const ex=b[0]-a[0], ey=b[1]-a[1], L2=ex*ex+ey*ey, t=L2>0 ? Math.max(0, Math.min(1, ((p[0]-a[0])*ex+(p[1]-a[1])*ey)/L2)) : 0;
  return Math.hypot(p[0]-a[0]-t*ex, p[1]-a[1]-t*ey); };
const ivLen=iv=>iv.reduce((s,x)=>s+x[1]-x[0], 0);
const ivUnion=(iv,gap=0)=>{ const s=iv.map(x=>x[0]<x[1] ? [x[0],x[1]] : [x[1],x[0]]).sort((x,y)=>x[0]-y[0]), out=[];
  for(const v of s){ const o=out[out.length-1]; if(o && v[0]<=o[1]+gap) o[1]=Math.max(o[1], v[1]); else out.push([...v]); } return out; };
const ivMinus=(iv,cut)=>{ let out=iv.map(x=>[x[0], x[1]]);
  for(const [a,b] of cut) out=out.flatMap(([p,q])=>b<=p || a>=q ? [[p,q]] : [[p, Math.min(q,a)], [Math.max(p,b), q]].filter(([x,y])=>y-x>1e-9));
  return out; };
// Beleg ueber [t0, t1]: Integral des groessten Gewichts k der Stuecke [s0, s1, k], geteilt durch die Laenge
const beleg=(iv,t0,t1)=>{ const xs=[t0, t1]; let hat=false;
  for(const x of iv) if(x[1]>t0 && x[0]<t1){ hat=true; if(x[0]>t0) xs.push(x[0]); if(x[1]<t1) xs.push(x[1]); }
  if(!hat || !(t1>t0)) return 0; xs.sort((a,b)=>a-b); let s=0;
  for(let i=0;i+1<xs.length;i++){ const a=xs[i], b=xs[i+1]; if(!(b>a)) continue; const m=(a+b)/2; let k=0;
    for(const x of iv) if(x[0]<=m && x[1]>=m && x[2]>k) k=x[2]; s+=k*(b-a); }
  return s/(t1-t0); };
const idVgl=(a,b)=>{ const na=typeof a==='number', nb=typeof b==='number';
  if(na && nb) return a-b; if(na) return -1; if(nb) return 1; const x=String(a), y=String(b); return x<y ? -1 : x>y ? 1 : 0; };
// Zwei Polygone ueberlappen: eine Ecke oder der Schwerpunkt des einen liegt im anderen, oder zwei Kanten kreuzen sich
const ueberlappt=(P,Q)=>{ const kr=(a,b,c,d)=>{ const o=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]); return o(a,b,c)*o(a,b,d)<0 && o(c,d,a)*o(c,d,b)<0; };
  if(P.some(p=>pip(p, Q)) || Q.some(q=>pip(q, P)) || pip(schwer(P), Q) || pip(schwer(Q), P)) return true;
  for(let i=0;i<P.length;i++) for(let j=0;j<Q.length;j++) if(kr(P[i], P[(i+1)%P.length], Q[j], Q[(j+1)%Q.length])) return true;
  return false; };
const schwer=P=>{ let A=0, cx=0, cy=0; for(let i=0,j=P.length-1;i<P.length;j=i++){ const c=P[j][0]*P[i][1]-P[i][0]*P[j][1]; A+=c; cx+=(P[j][0]+P[i][0])*c; cy+=(P[j][1]+P[i][1])*c; }
  return Math.abs(A)>1e-12 ? [cx/(3*A), cy/(3*A)] : P.reduce((s,p)=>[s[0]+p[0]/P.length, s[1]+p[1]/P.length], [0,0]); };

// ------------------------------------------------ Eingabe aus der Karte
// G.umrissEingabe(karte, o) -> UmrissEingabe (3.4). Nur Waende (und Ecken) mit rahmen -1, nicht 'kandidat', cls 'wand'/'schrank' (Decke),
// 'unklar' mit w/2 (hOk false), Boden-Waende als kind 'boden' (Beleg, kein Freiraum, keine Inselseite),
// h 'lokal' als kind 'lokal' (hOk nur mit Senkrechten bis zur eigenen Oberkante an beiden Enden, 8.3, sonst
// wie 'unklar'), Waende zwischen zwei Senkrechten bis zur Decke als kind 'ecken' (7.1, kap = min(1, nPeil/10)).
// Gewicht wAb = Mittel von G.abschnittGewicht (Abschnitt.w) ueber die Beob; < minW faellt weg.
// Faecher aus Decken-Beob (und Erfassungen) solcher Linien, gehoben auf (h der Wand - ty) im Bezug und mit
// g = G.gBei(abschnitt, beob.t) nach F0 (v3, nie abschnitt.g direkt); Kameraweg je Bild ebenso.
// Zusaetzliche Optionen: faecher 'schluessel' (Vorgabe: nur Schluessel-Beob und Erfassungen) | 'alle',
// wegAbstand (m, Ausduennen des Wegs), eckTol (Senkrechte bis zur Decke: |top - hC| <= eckTol), lokalOben ('gleich': Senkrechte
// an den Enden einer lokal-Wand mit |top - hLokal| <= eckTol, 8.3 wie geschrieben | 'bis': top >= hLokal - eckTol, Lesart offen, Bericht P-E).
G.umrissEingabe=(karte,o={})=>{
  const oo={nurGlobal:true, minW:0.05, faecher:'schluessel', wegAbstand:0.05, eckTol:0.05, lokalOben:'gleich', ...o};
  const AB=new Map((karte.abschnitte||[]).map(A=>[A.ab, A]));
  const wAb=A=>!A || !A.g ? 0 : Number.isFinite(A.w) ? A.w : G.abschnittGewicht ? G.abschnittGewicht(A) : 0;
  const hC=Number.isFinite(karte.hC) ? karte.hC : null, liste=x=>x instanceof Map ? [...x.values()] : (x || []);
  const beob=karte.beob || [], beobId=new Map(beob.map((b,i)=>[b.id ?? i, b]));
  const global=x=>!oo.nurGlobal || x.rahmen===-1;
  const W=liste(karte.waende).filter(global).sort((a,b)=>idVgl(a.id, b.id)), E=liste(karte.ecken).filter(global);
  const mittelW=ids=>{ const bs=(ids||[]).map(id=>beobId.get(id)).filter(Boolean); return bs.length ? bs.reduce((s,b)=>s+wAb(AB.get(b.ab)), 0)/bs.length : null; };
  const lines=[], hoehe=new Map();
  for(const w of W){
    const cls=w.cls, h=w.h, n=G.wandN(w.phi), u=G.wandU(w.phi), sOf=p=>u[0]*p[0]+u[1]*p[1];
    if(cls==='stoer' || cls==='unterzug') continue;
    const iv=(w.iv || []).map(x=>Array.isArray(x) ? [x[0], x[1]] : [x.s0, x.s1]).filter(x=>x[1]>x[0]);
    const senk=E.filter(e=>e.senk && Number.isFinite(e.top) && Array.isArray(e.waende) && e.waende.includes(w.id));
    const decke=hC==null ? [] : senk.filter(e=>Math.abs(e.top-hC)<=oo.eckTol);
    let wa=mittelW(w.beob); if(wa==null && (w.abschnitte || []).length) wa=w.abschnitte.reduce((s,a)=>s+wAb(AB.get(a)), 0)/w.abschnitte.length;
    let kind=null, hOk=false, wl=wa, ivL=iv, kap=iv.map(()=>1), hl=null;
    const fest=w.zustand!=='kandidat';
    if((cls==='wand' || cls==='schrank') && h==='c' && fest && iv.length){ kind='decke'; hOk=true; }
    else if(cls==='wand' && h==='f' && fest && iv.length) kind='boden';
    else if((cls==='wand' || cls==='unklar') && (h==='lokal' || Number.isFinite(h)) && fest && iv.length){
      kind='lokal'; hl=Number.isFinite(h) ? h : w.hLokal && w.hLokal.h;
      const lo=Math.min(...iv.map(x=>x[0])), hi=Math.max(...iv.map(x=>x[1])), oben=senk.filter(e=>Number.isFinite(hl) && (oo.lokalOben==='bis' ? e.top>=hl-oo.eckTol : Math.abs(e.top-hl)<=oo.eckTol)).map(e=>sOf(e.p));
      hOk=cls==='wand' && Number.isFinite(hl) && oben.some(s=>Math.abs(s-lo)<=0.15) && oben.some(s=>Math.abs(s-hi)<=0.15);
      if(!hOk && wa!=null) wl=wa/2; }
    else if(cls==='unklar' && (h==='c' || h==='f') && fest && iv.length){ kind=h==='c' ? 'decke' : 'boden'; if(wa!=null) wl=wa/2; }
    else if(decke.length>=2 && (cls==='wand' || cls==='schrank' || cls==='unklar') && fest){   // 'unklar': w/2 ohne hOk (4)
      const sE=decke.map(e=>({s:sOf(e.p), k:Math.min(1, (e.nPeil || 0)/10), e})).sort((a,b)=>a.s-b.s), a=sE[0], b=sE[sE.length-1];
      if(b.s-a.s<0.02) continue;
      kind='ecken'; hOk=cls!=='unklar'; ivL=[[a.s, b.s]]; kap=[Math.min(a.k, b.k)];
      if(wa==null) wa=wl=mittelW([...(a.e.beob || []), ...(b.e.beob || [])]); if(cls==='unklar' && wa!=null) wl=wa/2; }
    if(!kind || !ivL.length || wa==null || !(wa>=oo.minW)) continue;
    const cov=w.cov, vert=decke.filter(e=>e.art==='konvex').map(e=>sOf(e.p)).sort((a,b)=>a-b);
    lines.push({id:w.id, n, d:w.rho, iv:ivL, side:1, w:wl, sd:cov ? Math.sqrt(Math.max(0, cov[2])) : 0, sth:cov ? Math.sqrt(Math.max(0, cov[0])) : 0,
      hOk, kind, kap, wAb:wa, vert, durchblick:(w.durchblick || []).map(x=>[Math.min(x[0], x[1]), Math.max(x[0], x[1])])});
    if(hOk && (kind==='decke' || kind==='lokal')) hoehe.set(w.id, kind==='lokal' ? hl : hC);
  }
  // Faecher: Decken-Beob (und Erfassungen) der Linien mit Freiraum, im Bezug gehoben, mit gBei nach F0
  const fans=[];
  for(const b of beob){
    if(b.art!=='decke' && b.art!=='erfassung') continue;
    if(oo.faecher==='schluessel' && !b.schluessel && !b.nutzer) continue;
    const hW=hoehe.get(b.L), A=AB.get(b.ab); if(hW==null || !A || !b.c || !b.da || !b.db) continue;
    const w=wAb(A); if(!(w>=oo.minW)) continue;
    const g=G.gBei(A, b.t); if(!g) continue;
    const y=hW-g.ty, heb=d=>{ if(!(d[1]>1e-6)) return null; const s=(y-b.c[1])/d[1]; return s>0 && s<=25 ? G.gPlan(g, [b.c[0]+s*d[0], b.c[2]+s*d[2]]) : null; };
    const pa=heb(b.da), pb=heb(b.db); if(!pa || !pb) continue;
    fans.push({c:G.gPlan(g, [b.c[0], b.c[2]]), a:pa, b:pb, line:b.L, ab:b.ab, w});
  }
  // Kameraweg je Bild (sonst je Beob), ausgeduennt
  const path=[], bilder=karte.bilder instanceof Map ? [...karte.bilder.entries()].sort((a,b)=>a[0]-b[0]).map(x=>x[1]) : (karte.bilder || []);
  const quelle=bilder.length ? bilder : [...beob].sort((a,b)=>a.t-b.t);
  let last=null;
  for(const B of quelle){ const A=AB.get(B.ab); if(!A || !B.c) continue; const w=wAb(A); if(!(w>=oo.minW)) continue; const g=G.gBei(A, B.t); if(!g) continue;
    const p=G.gPlan(g, [B.c[0], B.c[2]]); if(last && last.w===w && Math.hypot(p[0]-last.p[0], p[1]-last.p[1])<oo.wegAbstand) continue;
    last={p, w}; path.push(last); }
  // Inselentscheide des Nutzers (7.4): Lage aus dem Ergebnis der vorigen Runde (Ring oder Kandidat mit dieser id)
  const inselFest=[], ausschluss=[], alt=karte.umriss;
  const ent=karte.inselEntscheide instanceof Map ? [...karte.inselEntscheide.entries()] : Object.entries(karte.inselEntscheide || {});
  for(const [id, wahl] of ent.sort((a,b)=>idVgl(a[0], b[0]))){
    const r=alt && ((alt.ringe || []).find(x=>x.id===id) || (alt.kandidaten || []).find(x=>x.id===id)); if(!r || !r.pts || r.pts.length<3) continue;
    if(wahl==='ja') inselFest.push({id, poly:r.pts.map(p=>[p[0], p[1]])}); else ausschluss.push({id, poly:r.pts.map(p=>[p[0], p[1]]), wahl}); }
  const T=karte.tiefe;
  return {lines, fans, path, bodenFrei:T && T.boden ? T.boden : null, wBoden:Number.isFinite(oo.wBoden) ? oo.wBoden : G.UM_DEF.wBoden, inselFest, ausschluss};
};

// ------------------------------------------------ Linien
// UmrissLinie -> interne Linie: Stuecke [s0, s1, k] (k = kap·w). iv: Beleg fuer den Schnitt (auch ueber Durchblick-Stuecken:
// dort steht die Wand ueber Sturz/Unterzug, 8.3 nimmt nur Inselseite und Sichtpruefung aus); ivS: ohne Durchblick (Inselseite,
// Sichtpruefung, Stueckenden); hull = Vereinigung von ivS; db = Durchblick.
function linieAus(s){
  const sg=s.side===-1 ? -1 : 1, b=lineOf([sg*s.n[0], sg*s.n[1]], sg*s.d), f=sg===1 ? (x=>x) : (x=>[-x[1], -x[0]]);
  const db=ivUnion((s.durchblick || []).map(f)), w=Number.isFinite(s.w) ? Math.max(0, Math.min(1, s.w)) : 1, iv=[], ivS=[];
  (s.iv || []).forEach((x0,i)=>{ const x=f(x0[0]<=x0[1] ? x0 : [x0[1], x0[0]]), k=Math.max(0, Math.min(1, s.kap && Number.isFinite(s.kap[i]) ? s.kap[i] : 1))*w;
    iv.push([x[0], x[1], k]); for(const [p,q] of ivMinus([x], db)) if(q-p>=0.01) ivS.push([p, q, k]); });   // Reste unter 1 cm tragen nichts
  return {...b, iv, ivS, hull:ivUnion(ivS), db, side:1, hyp:false, id:s.id ?? null, ids:[s.id ?? null], kind:s.kind || 'decke', hOk:s.hOk!==false,
    w, sd:s.sd || 0, sth:s.sth || 0, vert:(s.vert || []).map(v=>sg*v)};
}
const refOf=l=>l.ref || (l.hull.length ? P_(l, l.hull.reduce((a,[x,y])=>a+(x+y)/2, 0)/l.hull.length) : P_(l, 0));
// Lueckenregel 3.3 fuer zwei fast gleiche Linien (Stuecke von l auf m projiziert): Ueberlapp oder Luecke <= lueckeMax
// ohne Durchblick; dazu endet in der Luecke keine quer laufende belegte Linie (dann sind es zwei Waende, z. B. M-N und
// Q-A beiderseits des Vorsprungs N-O-P-Q, nicht dieselbe Wand doppelt). lueckeMax = Infinity schaltet die Regel ab.
function lueckeOk(m, l, o, alle){
  const base=dot(P_(l,0), m.u), dir=dot(l.u, m.u), pr=x=>{ const a=base+dir*x[0], b=base+dir*x[1]; return a<b ? [a,b] : [b,a]; };
  const A=m.hull, B=l.hull.map(pr), db=ivUnion([...m.db, ...l.db.map(pr)]);
  if(!A.length || !B.length) return true;
  let best=Infinity, gap=null;
  for(const a of A) for(const b of B){ if(a[0]<b[1] && b[0]<a[1]) return true;
    const g=b[0]>=a[1] ? [a[1], b[0]] : [b[1], a[0]]; if(g[1]-g[0]<best){ best=g[1]-g[0]; gap=g; } }
  if(!Number.isFinite(o.lueckeMax)) return true;
  if(!(best<=o.lueckeMax)) return false;
  if(db.some(([p,q])=>Math.min(q, gap[1])-Math.max(p, gap[0])>1e-6)) return false;
  const cos30=Math.cos(30*D2R);
  return !alle.some(c=>{ if(c===m || c===l || Math.abs(dot(c.n, m.n))>=cos30 || !c.hull.length) return false; const X=xLine(m, c); if(!X) return false;
    const t=dot(X, m.u); if(t<gap[0]-o.hypEndTol || t>gap[1]+o.hypEndTol) return false; const tc=dot(X, c.u);
    return c.hull.some(([a,b])=>tc>=a-o.hypEndTol && tc<=b+o.hypEndTol); });
}
function linien(lines, o){
  const L=[], cosM=Math.cos(o.mergeDeg*D2R), alle=lines.map(linieAus);
  for(const l of alle){
    const m=L.find(m=>dot(m.n, l.n)>cosM && Math.abs(sdist(m, refOf(l)))<o.mergeD && lueckeOk(m, l, o, alle));
    if(m){ const base=dot(P_(l,0), m.u), dir=dot(l.u, m.u), pr=v=>base+dir*v, prI=x=>{ const a=pr(x[0]), b=pr(x[1]); return a<b ? [a,b] : [b,a]; };
      for(const x of l.iv) m.iv.push([...prI(x), x[2]]); for(const x of l.ivS) m.ivS.push([...prI(x), x[2]]);
      m.db=ivUnion([...m.db, ...l.db.map(prI)]); m.ivS=m.ivS.flatMap(x=>ivMinus([x], m.db).filter(([p,q])=>q-p>=0.01).map(([p,q])=>[p, q, x[2]]));
      m.hull=ivUnion(m.ivS); m.ids.push(l.id); m.vert.push(...l.vert.map(pr));
      m.hOk=m.hOk || l.hOk; if(m.kind==='boden' && l.kind!=='boden') m.kind=l.kind; m.w=Math.max(m.w, l.w); m.sd=Math.min(m.sd || l.sd, l.sd || m.sd); continue; }
    L.push(l); }
  return L;
}
// Hypothesenlinien senkrecht durch die Enden gesehener Stuecke (nicht an Durchblick-Luecken); optional Gegenwand (hypThick)
function hypLinien(L, R, o){
  const cosM=Math.cos(o.mergeDeg*D2R), cos30=Math.cos(30*D2R), nReal=L.length;
  const near=h=>L.find(m=>Math.abs(dot(m.n, h.n))>cosM && Math.abs(sdist(m, refOf(h)))<o.mergeD);
  const leer={iv:[], ivS:[], hull:[], db:[], side:0, hyp:true, id:null, ids:[], kind:'hyp', hOk:false, w:0, sd:0, sth:0, vert:[]};
  if(o.hypEnds) for(let i=0;i<nReal;i++){ const l=L[i]; if(!l.hOk && l.kind!=='boden' || !l.hull.length) continue;
    // Durchblick innerhalb der Linie (Tuer, Sturz): beiderseits belegte Stuecke; Durchblick am Ende (Strahlen an der Ecke vorbei) zaehlt nicht
    const innen=([p,q])=>l.hull.some(x=>x[1]<=p+0.1 && x[0]<p) && l.hull.some(x=>x[0]>=q-0.1 && x[1]>q);
    for(const [a,b] of l.hull) for(const t of [a,b]){
      if(l.db.some(x=>t>=x[0]-0.1 && t<=x[1]+0.1 && innen(x))) continue;
      const p=P_(l, t);
      if(L.some(m=>m!==l && Math.abs(dot(m.n, l.n))<cos30 && Math.abs(sdist(m, p))<o.hypEndTol)) continue;
      const h={...lineOf(l.u, dot(l.u, p)), ...leer, src:'ende', ref:p}; if(near(h)) continue; L.push(h); } }
  if(o.hypThick>0) for(let i=0;i<nReal;i++){ const l=L[i]; if(!l.hOk) continue;
    let nf=0, nt=0; for(const [a,b] of l.hull) for(let t=a;t<=b;t+=0.1){ const p=P_(l,t), q=[p[0]-0.3*l.n[0], p[1]-0.3*l.n[1]], k=zelle(R, q); nt++; if(k>=0 && R.F[k]>=o.fMin-1e-9) nf++; }
    if(nt && nf/nt>=0.3){ const r0=refOf(l), h={...lineOf(l.n, l.d-o.hypThick), ...leer, src:'dicke', ref:[r0[0]-o.hypThick*l.n[0], r0[1]-o.hypThick*l.n[1]]}; if(!near(h)) L.push(h); } }
  return L;
}

// ------------------------------------------------ Freiraum-Raster
const zelle=(R,p)=>{ const c=Math.floor((p[0]-R.box[0])/R.tau), r=Math.floor((p[1]-R.box[1])/R.tau); return c<0 || r<0 || c>=R.W || r>=R.H ? -1 : r*R.W+c; };
function raster(fans, path, box, o, stark, tuer, boden, wBoden){
  const tau=o.tau, W=Math.ceil((box[2]-box[0])/tau), H=Math.ceil((box[3]-box[1])/tau), F=new Float32Array(W*H), PW=new Float32Array(W*H);
  const fillTri=(A,B,C,w)=>{
    const r0=Math.max(0, Math.floor((Math.min(A[1], B[1], C[1])-box[1])/tau)), r1=Math.min(H-1, Math.ceil((Math.max(A[1], B[1], C[1])-box[1])/tau)), E=[[A,B],[B,C],[C,A]];
    for(let r=r0;r<=r1;r++){ const y=box[1]+(r+0.5)*tau; let lo=Infinity, hi=-Infinity;
      for(const [p,q] of E){ if((p[1]>y)===(q[1]>y)) continue; const x=p[0]+(y-p[1])*(q[0]-p[0])/(q[1]-p[1]); if(x<lo) lo=x; if(x>hi) hi=x; }
      if(!(hi>lo)) continue;
      const c0=Math.max(0, Math.ceil((lo-box[0])/tau-0.5)), c1=Math.min(W-1, Math.floor((hi-box[0])/tau-0.5));
      for(let c=c0;c<=c1;c++) F[r*W+c]+=w; } };
  // Strahl c -> p gegen eine Linie (Kamera auf der freien Seite): Anteil s des Schnitts oder null
  const quer=(l,c,p)=>{ const dc=sdist(l,c); if(!(dc>0)) return null; const dp=sdist(l,p); if(!(dp<0)) return null; return dc/(dc-dp); };
  let durch=false;
  const kappe=(c,p,L)=>{ let sMin=1; durch=false;
    for(const l of stark){ const s=quer(l,c,p); if(s==null || s>=sMin) continue; const t=dot([c[0]+s*(p[0]-c[0]), c[1]+s*(p[1]-c[1])], l.u);
      if(l.hull.some(([a,b])=>t>=a-0.1 && t<=b+0.1)) sMin=s; }
    // Oeffnung: Luecke zwischen Stuecken oder Durchblick (innerhalb der Ausdehnung). Gekappt wird tuerTiefe hinter der Linie;
    // 'durch' heisst: der Strahl laeuft durch die Oeffnung (einschliesslich 0,1 m an ihren Raendern, wo die Strahlen an
    // der Laibung streifen) und endet tiefer als tuerTiefe dahinter.
    for(const l of tuer){ const s=quer(l,c,p); if(s==null) continue;
      const t=dot([c[0]+s*(p[0]-c[0]), c[1]+s*(p[1]-c[1])], l.u);
      const lo=Math.min(l.hull.length ? l.hull[0][0] : Infinity, l.db.length ? l.db[0][0] : Infinity),
            hi=Math.max(l.hull.length ? l.hull[l.hull.length-1][1] : -Infinity, l.db.length ? l.db[l.db.length-1][1] : -Infinity);
      if(!(t>lo && t<hi) || l.hull.some(([a,b])=>t>=a+0.1 && t<=b-0.1)) continue;
      if(s<=sMin && -sdist(l, p)>o.tuerTiefe) durch=true;   // nicht schon vor dieser Linie an einer anderen Wand gekappt
      const s2=s+o.tuerTiefe/L; if(s2>=sMin || l.hull.some(([a,b])=>t>=a-0.1 && t<=b+0.1)) continue;
      sMin=s2; }
    return sMin; };
  // jeLinie: Linien-id -> [Faecher, davon ganz hinter einer Oeffnung: beide Enden durch tuerTiefe gekappt]
  let nClip=0; const jeLinie=new Map();
  for(const f of fans){ const w=Number.isFinite(f.w) ? f.w : 1; let nd=0;
    const sh=p=>{ const dx=p[0]-f.c[0], dy=p[1]-f.c[1], L=Math.hypot(dx, dy); if(L<=o.back+1e-3) return null;
      let s=(L-o.back)/L; if(stark.length || tuer.length){ const sc=kappe(f.c, p, L); if(durch) nd++; if(sc<1){ const s2=Math.max(0, sc-o.back/L); if(s2<s){ s=s2; nClip++; } } }
      return s>0 ? [f.c[0]+s*dx, f.c[1]+s*dy] : null; };
    const a=sh(f.a), b=sh(f.b);
    if(f.line!=null){ const z=jeLinie.get(f.line) || [0, 0]; z[0]++; if(nd===2) z[1]++; jeLinie.set(f.line, z); }
    if(!a || !b) continue; fillTri(f.c, a, b, w); }
  const rr=Math.ceil(o.pathR/tau);
  for(const q of path || []){ const p=q.p || q, w=Number.isFinite(q.w) ? q.w : 1, cc=Math.floor((p[0]-box[0])/tau), r0=Math.floor((p[1]-box[1])/tau);
    for(let r=r0-rr;r<=r0+rr;r++) for(let c=cc-rr;c<=cc+rr;c++){ if(r<0 || c<0 || r>=H || c>=W) continue;
      if((c-cc)**2+(r-r0)**2<=rr*rr && PW[r*W+c]<w) PW[r*W+c]=w; } }
  // Boden-Freiraum (FloorGrid in F0, Gewicht wBoden; Vorgabe 0 bis T-M4)
  if(wBoden>0 && boden && boden.free){ const cell=boden.cell || boden.zelle, nx=boden.nx || boden.w;
    for(let k=0;k<boden.free.length;k++){ if(!boden.free[k]) continue; const p=[boden.x0+(k%nx+0.5)*cell, boden.z0+(Math.floor(k/nx)+0.5)*cell], z=zelle({box, tau, W, H}, p); if(z>=0) F[z]+=wBoden; } }
  return {F, PW, W, H, tau, box, nClip, jeLinie};
}

// ------------------------------------------------ Zerlegung und Nachbarschaft
function clipHalf(P,E,l,sg,li){
  const n=P.length, s=P.map(p=>{ const v=sg*sdist(l,p); return Math.abs(v)<1e-10 ? 0 : v; }), Q=[], QE=[];
  for(let i=0;i<n;i++){ const j=(i+1)%n, a=P[i], b=P[j], sa=s[i], sb=s[j], e=E[i];
    if(sa>=0){ Q.push(a); QE.push(sa===0 && sb<0 ? li : e); }
    if((sa>0 && sb<0) || (sa<0 && sb>0)){ const t=sa/(sa-sb); Q.push([a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1])]); QE.push(sa>0 ? li : e); } }
  return Q.length>=3 && Math.abs(area2(Q))>1e-9 ? {P:Q, E:QE} : null;
}
// Huellrechteck einer Zelle (Vorpruefung: liegt es ganz auf einer Seite der Linie, liegt die Zelle es auch; gleiches Ergebnis)
const huelleB=P=>{ let x0=Infinity, y0=Infinity, x1=-Infinity, y1=-Infinity; for(const p of P){ if(p[0]<x0) x0=p[0]; if(p[0]>x1) x1=p[0]; if(p[1]<y0) y0=p[1]; if(p[1]>y1) y1=p[1]; }
  return [(x0+x1)/2, (y0+y1)/2, (x1-x0)/2, (y1-y0)/2]; };
function zerlegung(L, box){
  let faces=[{P:[[box[0],box[1]],[box[2],box[1]],[box[2],box[3]],[box[0],box[3]]], E:[-1,-1,-1,-1]}];
  for(let li=0;li<L.length;li++){ const l=L[li], out=[], nx=l.n[0], ny=l.n[1], ax=Math.abs(nx), ay=Math.abs(ny);
    for(const f of faces){ const b=f.b || (f.b=huelleB(f.P)), c=nx*b[0]+ny*b[1]-l.d, r=ax*b[2]+ay*b[3];
      if(c-r>-1e-10 || c+r<1e-10){ out.push(f); continue; }
      let mn=Infinity, mx=-Infinity; for(const p of f.P){ const v=sdist(l,p); if(v<mn) mn=v; if(v>mx) mx=v; }
      if(mn>-1e-10 || mx<1e-10){ out.push(f); continue; }
      const A=clipHalf(f.P, f.E, l, 1, li), B=clipHalf(f.P, f.E, l, -1, li); if(A) out.push(A); if(B) out.push(B); }
    faces=out; }
  return faces;
}
function nachbarn(faces, L){
  const per=L.map(()=>({p:[], m:[]}));
  faces.forEach((f,fi)=>{ const c=f.P.reduce((a,p)=>[a[0]+p[0]/f.P.length, a[1]+p[1]/f.P.length], [0,0]);
    f.c=c; f.A=Math.abs(area2(f.P)); f.bnd=f.E.includes(-1);
    let U=0; for(let i=0;i<f.P.length;i++){ const a=f.P[i], b=f.P[(i+1)%f.P.length]; U+=Math.hypot(b[0]-a[0], b[1]-a[1]); } f.U=U;
    f.E.forEach((li,i)=>{ if(li<0) return; const l=L[li], a=dot(f.P[i], l.u), b=dot(f.P[(i+1)%f.P.length], l.u);
      (sdist(l,c)>0 ? per[li].p : per[li].m).push({f:fi, lo:Math.min(a,b), hi:Math.max(a,b)}); }); });
  const adj=[];
  per.forEach((s,li)=>{ s.p.sort((x,y)=>x.lo-y.lo); s.m.sort((x,y)=>x.lo-y.lo);
    let i=0, j=0; while(i<s.p.length && j<s.m.length){ const A=s.p[i], B=s.m[j], lo=Math.max(A.lo, B.lo), hi=Math.min(A.hi, B.hi);
      if(hi-lo>1e-7) adj.push({fp:A.f, fm:B.f, li, t0:lo, t1:hi});
      if(A.hi<B.hi) i++; else j++; } });
  return adj;
}

// ------------------------------------------------ Min-Cut (Dinic)
// Netz: Kante j hat den Vorwaerts-Index 2j und den Rueckwaerts-Index 2j+1. dinic augmentiert auf dem Restnetz g (aendert
// g.cap) und liefert den zusaetzlichen Fluss und die Quellseite S. Ein Restnetz mit erhoehten Kapazitaeten (Zellen fest
// aussen) bleibt zulaessig: der Fluss des freien Schnitts wird nur fortgesetzt (Hypothesen-Schnitte, 7.2).
function netz(N, edges){
  const head=new Int32Array(N).fill(-1), M=edges.length*2, to=new Int32Array(M), nxt=new Int32Array(M), cap=new Float64Array(M);
  let k=0; for(const [a,b,c,cr] of edges){ to[k]=b; cap[k]=c; nxt[k]=head[a]; head[a]=k++; to[k]=a; cap[k]=cr || 0; nxt[k]=head[b]; head[b]=k++; }
  return {N, head, to, nxt, cap};
}
function dinic(g, s, t){
  const {N, head, to, nxt, cap}=g, lvl=new Int32Array(N), it=new Int32Array(N), q=new Int32Array(N);
  // BFS nur bis zur Stufe von t (tiefere Knoten liegen auf keinem kuerzesten Weg); Sackgassen der DFS werden gesperrt (lvl -1)
  const bfs=()=>{ lvl.fill(-1); let h=0, tl=0; q[tl++]=s; lvl[s]=0;
    while(h<tl){ const v=q[h++]; if(lvl[t]>=0 && lvl[v]>=lvl[t]) break;
      for(let e=head[v];e>=0;e=nxt[e]) if(cap[e]>1e-12 && lvl[to[e]]<0){ lvl[to[e]]=lvl[v]+1; q[tl++]=to[e]; } } return lvl[t]>=0; };
  // DFS schiebt je Aufruf so viel wie moeglich ueber mehrere Kanten (bleibt auf der Kante stehen, solange sie Rest hat)
  const dfs=(v,f)=>{ if(v===t) return f; let r=0; for(;it[v]>=0;it[v]=nxt[it[v]]){ const e=it[v], w=to[e];
      if(cap[e]>1e-12 && lvl[w]===lvl[v]+1){ const d=dfs(w, Math.min(f-r, cap[e])); if(d>0){ cap[e]-=d; cap[e^1]+=d; r+=d; if(!(f-r>1e-12)) break; } } }
    if(r===0) lvl[v]=-1; return r; };
  let flow=0; while(bfs()){ for(let v=0;v<N;v++) it[v]=head[v]; let f; while((f=dfs(s, Infinity))>0) flow+=f; }
  const S=new Uint8Array(N); { let h=0, tl=0; q[tl++]=s; S[s]=1; while(h<tl){ const v=q[h++]; for(let e=head[v];e>=0;e=nxt[e]) if(cap[e]>1e-12 && !S[to[e]]){ S[to[e]]=1; q[tl++]=to[e]; } } }
  return {flow, S};
}
// Ein Schnitt im Graphen ctx; fest[fi] = 1: Zelle fest aussen (inselFest, Hypothese). Liefert das Restnetz mit.
function schnitt(ctx, fest){
  // Endkanten vorab gegeneinander aufheben (Fluss s -> fi -> t = min der beiden): gleicher Schnitt, weniger Arbeit fuer Dinic
  const nF=ctx.nF, s=nF, t=nF+1, E=ctx.E.slice(); let f0=0;
  for(let fi=0;fi<nF;fi++){ const cs=ctx.Dout[fi], ct=ctx.Din[fi]+(fest && fest[fi] ? BIG : 0), m=Math.min(cs, ct); f0+=m; E.push([s, fi, cs-m, 0]); E.push([fi, t, ct-m, 0]); }
  const g=netz(nF+2, E), {S, flow}=dinic(g, s, t), lab=new Uint8Array(nF); for(let fi=0;fi<nF;fi++) lab[fi]=S[fi];
  return {lab, flow:f0+flow, g, fest:fest ? Uint8Array.from(fest) : new Uint8Array(nF)};
}
// Weiterer Schnitt ab dem Restnetz von S0: Zellen mit mehr[fi] zusaetzlich fest aussen (Kante fi -> t um BIG erhoeht)
function nachSchnitt(ctx, S0, mehr){
  const nF=ctx.nF, nP=ctx.E.length, g={...S0.g, cap:S0.g.cap.slice()}, fest=Uint8Array.from(S0.fest);
  for(let fi=0;fi<nF;fi++) if(mehr[fi] && !fest[fi]){ g.cap[2*(nP+2*fi+1)]+=BIG; fest[fi]=1; }
  const {S, flow}=dinic(g, nF, nF+1), lab=new Uint8Array(nF); for(let fi=0;fi<nF;fi++) lab[fi]=S[fi];
  return {lab, flow:S0.flow+flow, g, fest};
}

// ------------------------------------------------ Topologie
function komponenten(ctx, pred){
  const {nF, nb, adj}=ctx, id=new Int32Array(nF).fill(-1), out=[];
  for(let fi=0;fi<nF;fi++){ if(id[fi]>=0 || !pred(fi)) continue; const st=[fi], C=[]; id[fi]=out.length;
    while(st.length){ const v=st.pop(); C.push(v); for(const k of nb[v]){ const a=adj[k], w=a.fp===v ? a.fm : a.fp; if(id[w]<0 && pred(w)){ id[w]=out.length; st.push(w); } } }
    out.push(C.sort((a,b)=>a-b)); }
  return {id, out};
}
// Masse eines Lochs C gegen den Raum: Flaeche, Umfang, Beleg von der richtigen Seite mit hOk, Richtungen, phi, Dicke
function lochMass(ctx, C, inRoom){
  const {faces, nb, adj, L}=ctx, inC=new Set(C), dirs=[], ids=new Set(); let P=0, Ps=0, A=0, cx=0, cz=0, phi=0;
  for(const fi of C){ const f=faces[fi]; A+=f.A; cx+=f.c[0]*f.A; cz+=f.c[1]*f.A; phi+=f.phi*f.A;
    for(const k of nb[fi]){ const a=adj[k], w=a.fp===fi ? a.fm : a.fp; if(inC.has(w) || !inRoom[w]) continue;
      P+=a.len; const l=L[a.li], roomOnPlus=(w===a.fp); if(!l.hyp) for(const id of l.ids) if(id!=null) ids.add(id);
      if(!l.hyp && l.hOk && roomOnPlus && a.kapS>0){ Ps+=a.len*a.kapS; dirs.push([l.n, a.len*a.kapS]); } } }
  let nonPar=false, opp=false; for(const [n1,w1] of dirs) for(const [n2,w2] of dirs){ if(w1<0.05 || w2<0.05) continue; const c=dot(n1,n2); if(Math.abs(c)<0.7) nonPar=true; if(c<-0.9) opp=true; }
  const seiten=[]; for(const [n1,w1] of dirs){ const s=seiten.find(x=>dot(x.n, n1)>0.9); if(s) s.w+=w1; else seiten.push({n:n1, w:w1}); }
  // gesehene Ecke: zwei belegte Seiten mit |Δφ - 90°| <= 15° (Toleranz aus 7.2), je >= hypMinSeite belegt (Beleg fuer 'voll')
  const sin15=Math.sin(15*D2R), mS=ctx.o.hypMinSeite; let ecke=false;
  for(const a of seiten) for(const b of seiten) if(a.w>=mS && b.w>=mS && Math.abs(dot(a.n, b.n))<=sin15) ecke=true;
  const idl=[...ids].sort(idVgl);
  return {faces:C, A, P, Ps, sup:P>0 ? Ps/P : 0, phi:A>0 ? phi/A : 0, nonPar, opp, thick:P>0 ? A/(P/2) : 0, c:A>0 ? [cx/A, cz/A] : [0,0],
    seiten:seiten.filter(s=>s.w>=0.05).length, ecke, ids:idl, id:'R'+idl.join(',')};
}
function analyse(ctx, lab){
  const {faces, nF}=ctx, IN=komponenten(ctx, fi=>lab[fi]===1), fl=C=>C.reduce((a,fi)=>a+faces[fi].A, 0);
  let room=null, ra=-1; for(const C of IN.out){ const a=fl(C); if(a>ra){ ra=a; room=C; } }
  const innenVerworfen=IN.out.filter(C=>C!==room).map(C=>({A:fl(C), n:C.length}));
  const inRoom=new Uint8Array(nF); if(room) for(const fi of room) inRoom[fi]=1;
  const OUT=komponenten(ctx, fi=>!inRoom[fi]), aussen=new Uint8Array(nF), loecher=[];
  for(const C of OUT.out){ if(C.some(fi=>faces[fi].bnd)){ for(const fi of C) aussen[fi]=1; continue; } loecher.push(lochMass(ctx, C, inRoom)); }
  return {room, inRoom, aussen, innenVerworfen, loecher};
}

// ------------------------------------------------ Raender und Ringe
function verfolgen(segs){
  const key=p=>Math.round(p[0]*1e5)+','+Math.round(p[1]*1e5), pts=[];
  const snap=p=>{ for(const q of pts) if(Math.abs(q[0]-p[0])<1e-5 && Math.abs(q[1]-p[1])<1e-5) return q; pts.push(p); return p; };
  for(const s of segs){ s.a=snap(s.a); s.b=snap(s.b); }
  const out=new Map(); segs.forEach((s,i)=>{ const k=key(s.a); if(!out.has(k)) out.set(k, []); out.get(k).push(i); });
  const used=new Uint8Array(segs.length), loops=[];
  for(let i0=0;i0<segs.length;i0++){ if(used[i0]) continue; const Lp=[]; let i=i0;
    for(let g=0;g<segs.length+2;g++){ used[i]=1; Lp.push(segs[i]); const s=segs[i], cand=(out.get(key(s.b)) || []).filter(j=>!used[j] || j===i0);
      if(!cand.length) break; let j=cand[0];
      if(cand.length>1){ const din=[s.b[0]-s.a[0], s.b[1]-s.a[1]]; let best=Infinity;
        for(const c of cand){ const q=segs[c], dq=[q.b[0]-q.a[0], q.b[1]-q.a[1]], ang=Math.atan2(din[0]*dq[1]-din[1]*dq[0], dot(din, dq)); if(ang<best){ best=ang; j=c; } } }
      if(j===i0) break; i=j; }
    loops.push(Lp); }
  return loops;
}
// Rand des Raums gegen die Zellen mit draussen[fi] (innen links)
function randSegmente(ctx, inRoom, draussen){
  const segs=[];
  for(const a of ctx.adj){ const ip=inRoom[a.fp], im=inRoom[a.fm]; if(ip===im) continue; if(!draussen[ip ? a.fm : a.fp]) continue;
    const l=ctx.L[a.li], A0=P_(l, a.t0), A1=P_(l, a.t1);
    segs.push(im ? {a:A0, b:A1, li:a.li, kap:a.kap, len:a.len} : {a:A1, b:A0, li:a.li, kap:a.kap, len:a.len}); }
  return segs;
}
// Laeufe derselben Linie, Versprung (3σ) und kollineare Nachbarkanten (7.6), Ecke = Schnitt der Nachbarlinien;
// eine Zusammenfassung, nach der sich der Ring kreuzen wuerde, unterbleibt (wallPolygon verlangt einfache Ringe)
function vereinfachen(Lp, L, o){
  let runs=[]; for(const s of Lp){ const r=runs[runs.length-1]; if(r && r.li===s.li){ r.b=s.b; r.len+=s.len; r.sup+=s.len*s.kap; } else runs.push({li:s.li, a:s.a, b:s.b, len:s.len, sup:s.len*s.kap}); }
  if(runs.length>1 && runs[0].li===runs[runs.length-1].li){ const r=runs.pop(); runs[0].a=r.a; runs[0].len+=r.len; runs[0].sup+=r.sup; }
  const sig=(i,j)=>Math.hypot(L[i].sd || 0, L[j].sd || 0), cos10=Math.cos(10*D2R), cosM=Math.cos(o.mergeDeg*D2R), n=()=>runs.length;
  // eine Zusammenfassung gilt nur, wenn der Ring danach einfach bleibt (keine Kreuzung nicht benachbarter Kanten)
  const ecken=R=>R.map((r,i)=>xLine(L[r.li], L[R[(i+1)%R.length].li]) || r.b);
  const einfach=R=>{ const P=ecken(R), m=P.length, o=(a,b,c)=>Math.sign((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));
    for(let i=0;i<m;i++) for(let j=i+2;j<m;j++){ if(i===0 && j===m-1) continue; const a=P[i], b=P[(i+1)%m], c=P[j], d=P[(j+1)%m];
      if(o(a,b,c)*o(a,b,d)<0 && o(c,d,a)*o(c,d,b)<0) return false; } return true; };
  const ersetze=(idx, m)=>{ const R=[...runs]; for(const k of [...idx].sort((a,b)=>b-a)) R.splice(k, 1); R.splice(Math.min(...idx), 0, m);
    if(R.length>=3 && !einfach(R) && einfach(runs)) return false; runs=R; return true; };
  for(let changed=true; changed && n()>3;){ changed=false;
    // Versprung: kurzes Stueck zwischen zwei fast parallelen Linien -> die besser belegte gewinnt
    for(let i=0;i<n() && n()>3;i++){ const ip=(i-1+n())%n(), iq=(i+1)%n(), p=runs[ip], r=runs[i], q=runs[iq];
      if(r.len>=Math.max(o.jogMin, o.jogSigma*sig(p.li, q.li))) continue;
      if(Math.abs(dot(L[p.li].n, L[q.li].n))<cos10) continue;
      const keep=p.sup>=q.sup ? p : q; if(ersetze([ip, i, iq], {li:keep.li, a:p.a, b:q.b, len:p.len+r.len+q.len, sup:p.sup+q.sup})){ changed=true; break; } }
    if(changed) continue;
    // direkt folgende Kanten fast kollinearer Linien: nie als Schnitt, eine Kante, wenn der Abstand nicht signifikant ist
    for(let i=0;i<n() && n()>3;i++){ const iq=(i+1)%n(), p=runs[i], q=runs[iq], lp=L[p.li], lq=L[q.li];
      if(lp.hyp || lq.hyp || dot(lp.n, lq.n)<=cosM) continue;
      const mp=[(p.a[0]+p.b[0])/2, (p.a[1]+p.b[1])/2], mq=[(q.a[0]+q.b[0])/2, (q.a[1]+q.b[1])/2], ab=Math.max(Math.abs(sdist(lq, mp)), Math.abs(sdist(lp, mq)));
      if(ab>Math.max(o.jogMin, o.jogSigma*sig(p.li, q.li))) continue;
      const keep=p.sup>=q.sup ? p : q; if(ersetze([i, iq], {li:keep.li, a:p.a, b:q.b, len:p.len+q.len, sup:p.sup+q.sup})){ changed=true; break; } } }
  if(runs.length<3) return null;
  const ende=[]; for(let i=0;i<runs.length;i++){ const r=runs[i], q=runs[(i+1)%runs.length]; ende.push(xLine(L[r.li], L[q.li]) || r.b); }
  return {pts:[ende[runs.length-1], ...ende.slice(0, runs.length-1)], lines:runs.map(r=>r.li), sup:runs.map(r=>r.len>0 ? r.sup/r.len : 0), hyp:runs.map(r=>L[r.li].hyp)};
}
// Ringe des Raums gegen die Zellmenge draussen; groesste Schleife zuerst
function ringeVon(ctx, inRoom, draussen){
  return verfolgen(randSegmente(ctx, inRoom, draussen)).map(Lp=>vereinfachen(Lp, ctx.L, ctx.o)).filter(r=>r && r.pts.length>=3)
    .map(r=>({...r, A:Math.abs(area2(r.pts))})).sort((a,b)=>b.A-a.A);
}
const ringObj=(ctx, r, z)=>({id:z.id, art:z.art, pts:r.pts, waende:r.lines.map(li=>ctx.L[li].hyp ? null : ctx.L[li].id), sup:r.sup, hyp:r.hyp,
  flaeche:r.A, teil:!!z.teil, supRing:z.supRing ?? null, phi:z.phi ?? null, dicke:z.dicke ?? null, quelle:z.quelle || 'schnitt',
  entscheid:z.entscheid || 'auto', exportiert:!!z.exportiert});

// ------------------------------------------------ Graph aufbauen
function graphAus(inp, o){
  const T={}; let t0=uhr(); const tick=k=>{ const t=uhr(); T[k]=t-t0; t0=t; };
  const xs=[], ys=[], add=p=>{ xs.push(p[0]); ys.push(p[1]); };
  for(const f of inp.fans || []){ add(f.c); add(f.a); add(f.b); }
  for(const q of inp.path || []) add(q.p || q);
  if(!xs.length) return null;
  let x0=Infinity, x1=-Infinity, y0=Infinity, y1=-Infinity; for(let i=0;i<xs.length;i++){ if(xs[i]<x0) x0=xs[i]; if(xs[i]>x1) x1=xs[i]; if(ys[i]<y0) y0=ys[i]; if(ys[i]>y1) y1=ys[i]; }
  const box=[x0-o.margin, y0-o.margin, x1+o.margin, y1+o.margin];
  let L=linien(inp.lines || [], o);
  const stark=o.clip ? L.filter(l=>l.hOk && l.kind!=='boden' && ivLen(l.hull)>=o.clipMinSup) : [];
  const tuer=Number.isFinite(o.tuerTiefe) ? L.filter(l=>l.hOk && l.kind!=='boden' && (l.hull.length>1 || l.db.length)) : [];
  const R=raster(inp.fans || [], inp.path || [], box, o, stark, tuer, inp.bodenFrei, Number.isFinite(inp.wBoden) ? inp.wBoden : o.wBoden); tick('raster');
  // Linien, die nur durch eine Oeffnung (Luecke/Durchblick einer anderen Linie) und tiefer als tuerTiefe dahinter gesehen
  // werden (Flur, Nachbarraum), tragen keinen Beleg: er zaehlt nur mit dem Anteil der Faecher, die nicht ganz dahinter liegen.
  for(const l of L){ let n=0, d=0; for(const id of l.ids){ const z=R.jeLinie.get(id); if(z){ n+=z[0]; d+=z[1]; } }
    if(n>0 && d>0){ const fak=1-d/n; l.durch=d/n; for(const x of l.iv) x[2]*=fak; for(const x of l.ivS) x[2]*=fak; } }
  L=hypLinien(L, R, o); tick('linien');
  const faces=zerlegung(L, box); tick('zerlegung');
  const adj=nachbarn(faces, L); tick('nachbarn');
  const nF=faces.length, nCell=new Float64Array(nF), nFree=new Float64Array(nF), pw=new Float64Array(nF);
  faces.forEach((f,fi)=>{ const P=f.P; let ymin=Infinity, ymax=-Infinity; for(const p of P){ if(p[1]<ymin) ymin=p[1]; if(p[1]>ymax) ymax=p[1]; }
    const r0=Math.max(0, Math.ceil((ymin-box[1])/R.tau-0.5)), r1=Math.min(R.H-1, Math.floor((ymax-box[1])/R.tau-0.5));
    for(let r=r0;r<=r1;r++){ const y=box[1]+(r+0.5)*R.tau; let lo=Infinity, hi=-Infinity;
      for(let i=0;i<P.length;i++){ const p=P[i], q=P[(i+1)%P.length]; if((p[1]>y)===(q[1]>y)) continue; const x=p[0]+(y-p[1])*(q[0]-p[0])/(q[1]-p[1]); if(x<lo) lo=x; if(x>hi) hi=x; }
      if(!(hi>=lo)) continue;
      const c0=Math.max(0, Math.ceil((lo-box[0])/R.tau-0.5)), c1=Math.min(R.W-1, Math.floor((hi-box[0])/R.tau-0.5));
      for(let c=c0;c<=c1;c++){ const k=r*R.W+c; nCell[fi]++; if(R.F[k]>=o.fMin-1e-9) nFree[fi]++; pw[fi]+=R.PW[k]; } }
    if(!nCell[fi]){ const k=zelle(R, f.c); nCell[fi]=1; if(k>=0 && R.F[k]>=o.fMin-1e-9) nFree[fi]=1; if(k>=0) pw[fi]=R.PW[k]; } });
  tick('zellen');
  const Dout=new Float64Array(nF), Din=new Float64Array(nF), E=[];
  faces.forEach((f,fi)=>{ const phi=nFree[fi]/nCell[fi]; f.phi=phi; f.pfad=pw[fi]/nCell[fi];
    Dout[fi]+=o.betaF*f.A*phi+o.betaPfad*f.A*f.pfad; Din[fi]+=o.betaU*f.A*(1-phi)+(f.bnd ? BIG : 0); });
  for(const a of adj){ const l=L[a.li], len=a.t1-a.t0, kap=l.hyp ? 0 : beleg(l.iv, a.t0, a.t1); a.len=len; a.kap=kap; a.kapS=l.hyp ? 0 : beleg(l.ivS, a.t0, a.t1);
    E.push([a.fp, a.fm, o.lam*len*(1-kap)+o.eps*len, o.lam*len+o.eps*len]);
    if(kap>0){ Dout[a.fp]+=o.rWall*len*kap; Din[a.fm]+=o.rWall*len*kap; } }
  const nb=Array.from({length:nF}, ()=>[]); adj.forEach((a,k)=>{ nb[a.fp].push(k); nb[a.fm].push(k); });
  const festPoly=(polys)=>{ const m=new Uint8Array(nF); for(const P of polys) for(let fi=0;fi<nF;fi++) if(pip(faces[fi].c, P)) m[fi]=1; return m; };
  return {o, L, faces, adj, nb, nF, R, box, Dout, Din, E, T, festPoly};
}

// ------------------------------------------------ Hauptfunktion
// G.umriss(inp, opt) -> UmrissErgebnis (3.4). Ringe: Aussenring zuerst (id 'aussen'), dann Inseln. Insel-ids:
// inselFest-id, Hypothesen-id ('I'...) oder 'R' + sortierte Wand-ids ihres Rands (stabil ueber Runden).
// Die Zustaende des freien Schnitts haengen nicht aufzaehlbar als ergebnis.intern an (fuer G.inselBewerten).
G.umriss=(inp,opt={})=>{
  const o={...G.UM_DEF, ...opt}, tA=uhr(), warn=[], vorher=o.vorher || null;
  const leer=w=>({ringe:[], kandidaten:[], hypothesen:[], aufgefuellt:[], verworfen:[], innenVerworfen:[], nLinien:0, nZellen:0, arbeit:{schnitte:0, zellen:0}, ms:{gesamt:uhr()-tA}, warn:[w]});
  const ctx=graphAus(inp, o); if(!ctx) return leer('keine Faecher und kein Weg');
  const T=ctx.T; let t0=uhr(); const tick=k=>{ const t=uhr(); T[k]=(T[k] || 0)+t-t0; t0=t; };
  const fest=inp.inselFest || [], aus=inp.ausschluss || [];
  let festM=ctx.festPoly(fest.map(f=>f.poly)), schnitte=1;
  let S=schnitt(ctx, festM); ctx.flow=S.flow; ctx.festBasis=festM; ctx.frei=S; tick('schnitt');
  // Weg a: Loecher bewerten, Einschmelzen, Ringe; zweiter Durchgang, wenn volle Hypothesen fest werden
  const bauen=(S, festM, auto)=>{
    const an=analyse(ctx, S.lab), {inRoom, aussen}=an, inseln=[], aufgefuellt=[], verworfen=[], kandLoch=[];
    if(!an.room) return null;
    const warIn=h=>!!vorher && (vorher.ringe || []).some(r=>r.art==='insel' && r.quelle==='schnitt' && (r.id===h.id || Math.hypot(...[0,1].map(c=>schwer(r.pts)[c]-h.c[c]))<=0.3));
    for(const h of an.loecher){
      const f=fest.find(x=>pip(h.c, x.poly) || h.faces.some(fi=>festM[fi] && pip(ctx.faces[fi].c, x.poly))) || null, a=auto.find(x=>h.faces.some(fi=>pip(ctx.faces[fi].c, x.poly))) || null;
      const phiOk=G.hyst(warIn(h), h.phi, o.inselPhiSetzen, o.inselPhiLoesen, '<=');
      const grund=!(h.A>=o.islandMinA) ? 'flaeche-klein' : !(h.A<=o.islandMaxA) ? 'flaeche-gross' : !(h.sup>=o.islandMinSup) ? 'beleg' : !(h.nonPar || h.opp) ? 'seiten'
        : !(h.thick>=o.islandMinThick) ? 'dicke' : !phiOk ? 'phi' : null;
      if(f || a || !grund){ h.fest=f; h.auto=a; inseln.push(h); }
      else { aufgefuellt.push({A:h.A, sup:h.sup, phi:h.phi, grund}); if(h.A>=o.islandMinA) kandLoch.push({h, grund}); for(const fi of h.faces) inRoom[fi]=1; } }
    // Einschmelzen (7.6): liegt eine Insel naeher als aussenEinschmelzen am Aussenrand, werden die Raumzellen
    // dazwischen (von der Insel aus erreichbar, siehe zw) aussen.
    const sE=o.aussenEinschmelzen, nah=(p,S)=>{ let m=Infinity; for(const s of S){ const d=segAbst(p, s.a, s.b); if(d<m) m=d; } return m; };
    const aussenSeg=sE>0 && inseln.length ? randSegmente(ctx, inRoom, aussen) : [];
    for(const h of inseln){ if(!(sE>0)) break; const mh=new Uint8Array(ctx.nF); for(const fi of h.faces) mh[fi]=1; const hs=randSegmente(ctx, inRoom, mh);
      let dmin=Infinity; for(const s of hs) dmin=Math.min(dmin, nah(s.a, aussenSeg), nah(s.b, aussenSeg)); for(const s of aussenSeg) dmin=Math.min(dmin, nah(s.a, hs), nah(s.b, hs));
      if(!(dmin<sE)) continue;
      // Zelle dazwischen: alle Ecken naeher als sE an beiden Raendern, oder (Keil an einer Inselecke, schraege Engstelle) der
      // Schwerpunkt mit Abstandssumme zu beiden Raendern <= sE
      const zw=fi=>{ if(!inRoom[fi]) return false; const f=ctx.faces[fi]; if(f.P.every(p=>nah(p, hs)<=sE+1e-9 && nah(p, aussenSeg)<=sE+1e-9)) return true;
        return nah(f.c, hs)+nah(f.c, aussenSeg)<=sE+1e-9; }, mark=new Set(), st=[...h.faces];
      while(st.length){ const fi=st.pop(); for(const k of ctx.nb[fi]){ const e=ctx.adj[k], w=e.fp===fi ? e.fm : e.fp; if(mh[w] || mark.has(w) || !zw(w)) continue; mark.add(w); st.push(w); } }
      const verbunden=[...mark].some(fi=>ctx.nb[fi].some(k=>{ const e=ctx.adj[k], w=e.fp===fi ? e.fm : e.fp; return aussen[w]; }));
      if(!verbunden){ warn.push(`Insel ${h.id} ${(100*dmin).toFixed(1)} cm vor dem Aussenring, nicht eingeschmolzen`); continue; }
      for(const w of mark){ inRoom[w]=0; aussen[w]=1; } for(const fi of h.faces) aussen[fi]=1; h.eingeschmolzen=true; verworfen.push({id:h.fest ? h.fest.id : h.id, grund:'einschmelzen', A:h.A}); }
    const lebend=inseln.filter(h=>!h.eingeschmolzen);
    // Ringe: Aussen gegen die Randkomponenten, jede Insel fuer sich
    const RA=ringeVon(ctx, inRoom, aussen), ringe=[];
    if(!RA.length) return null;
    if(RA.length>1) warn.push(`Aussenrand in ${RA.length} Schleifen, groesste genommen`);
    const ra=RA[0], supA=ra.sup.reduce((s,v,i)=>s+v*Math.hypot(ra.pts[(i+1)%ra.pts.length][0]-ra.pts[i][0], ra.pts[(i+1)%ra.pts.length][1]-ra.pts[i][1]), 0);
    let lenA=0; for(let i=0;i<ra.pts.length;i++){ const p=ra.pts[i], q=ra.pts[(i+1)%ra.pts.length]; lenA+=Math.hypot(q[0]-p[0], q[1]-p[1]); }
    ringe.push(ringObj(ctx, ra, {id:'aussen', art:'aussen', supRing:lenA>0 ? supA/lenA : 0, entscheid:'auto', exportiert:true}));
    for(const h of lebend){ const m=new Uint8Array(ctx.nF); for(const fi of h.faces) m[fi]=1; const R=ringeVon(ctx, inRoom, m);
      if(!R.length){ warn.push('Insel ohne Rand: '+h.id); continue; } if(R.length>1) warn.push(`Insel ${h.id} in ${R.length} Schleifen`);
      const x=aus.find(e=>pip(h.c, e.poly)), teil=h.sup<o.islandFullSup || !h.ecke;
      if(!h.fest && !x && h.sup>=o.islandFullSup && !h.ecke) warn.push(`Insel ${h.id}: keine gesehene Ecke (zwei belegte Seiten rechtwinklig), offen statt auto`);
      const ent=h.fest ? 'nutzer-ja' : x ? (x.wahl==='schrank' ? 'schrank' : 'nutzer-nein') : h.auto ? 'auto' : teil ? 'offen' : 'auto';
      ringe.push(ringObj(ctx, R[0], {id:h.fest ? h.fest.id : h.auto ? h.auto.id : h.id, art:'insel', teil, supRing:h.sup, phi:h.phi, dicke:h.thick,
        quelle:h.auto ? 'hypothese' : 'schnitt', entscheid:ent, exportiert:ent==='auto' || ent==='nutzer-ja'})); }
    const kandidaten=kandLoch.map(({h, grund})=>{ const m=new Uint8Array(ctx.nF); for(const fi of h.faces) m[fi]=1; const tmp=Uint8Array.from(inRoom); for(const fi of h.faces) tmp[fi]=0;
      const R=ringeVon(ctx, tmp, m); return {id:h.id, pts:R.length ? R[0].pts : [], grund, dEn:null, phi:h.phi}; });
    for(const f of fest) if(!ringe.some(r=>r.id===f.id)){ warn.push('inselFest ohne Insel: '+f.id); kandidaten.push({id:f.id, pts:f.poly, grund:'fest-ohne-insel', dEn:null, phi:null}); }
    for(const x of aus) if(!ringe.some(r=>r.id===x.id)) kandidaten.push({id:x.id, pts:x.poly, grund:x.wahl==='schrank' ? 'schrank' : 'nutzer-nein', dEn:null, phi:null});
    return {an, ringe, kandidaten, aufgefuellt, verworfen};
  };
  let B=bauen(S, festM, []); tick('inseln');
  ctx.inRoomFrei=B ? B.an.inRoom : new Uint8Array(ctx.nF);
  if(!B){ const e=leer('Kein Innenraum.'); e.nLinien=ctx.L.length; e.nZellen=ctx.nF; e.arbeit={schnitte, zellen:ctx.nF}; return e; }
  // Weg b: Hypothesen im selben Graphen
  const erg={ringe:B.ringe, kandidaten:B.kandidaten, hypothesen:[], aufgefuellt:B.aufgefuellt, verworfen:B.verworfen, innenVerworfen:B.an.innenVerworfen,
    nLinien:ctx.L.length, nZellen:ctx.nF, arbeit:{schnitte, zellen:ctx.nF}, ms:T, warn};
  Object.defineProperty(erg, 'intern', {value:ctx, enumerable:false, writable:true});
  if(o.hyp===true && o.hypMax>0){
    const H=G.inselHypothesen(inp, erg, o), bew=[];
    for(const h of H){ const b=G.inselBewerten(inp, h, erg, o); schnitte+=b.pfad ? 0 : 1; bew.push({h, b}); }
    erg.hypothesen=bew.map(x=>x.b);
    // Ringe der Hypothesen (teil/voll), Ueberlappungen unterdrueckt; volle Hypothesen in den endgueltigen Schnitt
    const rang={voll:0, teil:1}, gut=bew.filter(x=>x.b.ring && rang[x.b.stufe]!=null).sort((x,y)=>rang[x.b.stufe]-rang[y.b.stufe] || y.b.supRing-x.b.supRing || x.b.dEn-y.b.dEn || idVgl(x.h.id, y.h.id));
    const genommen=[], drin=(p)=>erg.ringe.some(r=>r.art==='insel' && pip(p, r.pts)) || genommen.some(x=>pip(p, x.b.ring.pts));
    for(const x of gut) if(!drin(schwer(x.b.ring.pts)) && !drin(schwer(x.h.poly))) genommen.push(x);
    const voll=genommen.filter(x=>x.b.stufe==='voll');
    // endgueltiger Schnitt: bei einer vollen Hypothese ist es ihr erzwungener Schnitt (kein weiterer, Pflicht 7); bei mehreren
    // wird der der ersten fortgesetzt (ein Schnitt mehr)
    if(voll.length){ const m=ctx.festPoly(voll.map(x=>x.h.poly)), S1=voll[0].b.schnitt, S2=voll.length===1 && S1 ? S1 : nachSchnitt(ctx, S1 || S, m);
      if(S2!==S1) schnitte++; for(let fi=0;fi<ctx.nF;fi++) m[fi]|=festM[fi];
      const B2=bauen(S2, m, voll.map(x=>({id:x.h.id, poly:x.h.poly})));
      if(B2){ erg.ringe=B2.ringe; erg.kandidaten=B2.kandidaten; erg.aufgefuellt=B2.aufgefuellt; erg.verworfen=B2.verworfen; erg.innenVerworfen=B2.an.innenVerworfen; } }
    for(const x of bew) x.b.schnitt=null;   // Restnetz nicht im Ergebnis halten
    for(const x of genommen) if(x.b.stufe==='teil') erg.ringe.push({...x.b.ring, id:x.h.id, quelle:'hypothese', teil:true, entscheid:'offen', exportiert:false});
    for(const x of bew) if(x.b.stufe==='kandidat') erg.kandidaten.push({id:x.h.id, pts:x.b.ring ? x.b.ring.pts : x.h.poly, grund:'hypothese', dEn:x.b.dEn, phi:x.b.phi});
    tick('hyp');
  }
  erg.arbeit={schnitte, zellen:ctx.nF}; T.gesamt=uhr()-tA;
  return erg;
};

// vorige Bewertungen aus opt.vorher: UmrissErgebnis (hypothesen), Liste oder eine InselBewertung
const vorige=v=>!v ? [] : Array.isArray(v) ? v : Array.isArray(v.hypothesen) ? v.hypothesen : v.id!=null && v.stufe ? [v] : [];

// ------------------------------------------------ Inselhypothesen (Weg b, 7.2)
// G.inselHypothesen(inp, ergFrei, opt) -> InselHyp[] (hoechstens hypMax, nach id sortiert = Reihenfolge der Schnitte).
// Aus Linien mit hOk (Decke, Ecken, lokal mit Senkrechten): konvexe Ecke (|Δφ - 90°| <= 15°, beide Stuecke enden
// hoechstens hypEckeTol vor dem Schnittpunkt X, freie Seiten von X weg), Gegenflaechen (|Δφ - 180°| <= 5°, Abstand
// 0,08-1,5 m, freie Seiten voneinander weg, Ueberlapp >= 50 % der kuerzeren), Senkrechte (konvexe Senkrechte bis zur
// Decke an X auf einer Linie, deren Stueck dort endet; das zweite Stueck darf bis 3·hypEckeTol vor X enden).
// Rechteck aus den gesehenen Linien und Senkrechten durch die fernen Stueckenden. Rang: in opt.vorher schon
// verfolgt, dann Summe der Beleglaengen, dann id. Hypothesen, deren Rechteck eine Insel des freien Schnitts ueberlappt, in inselFest oder
// ausschluss entfallen, ebenso solche, deren Rechteck im freien Schnitt schon ueberwiegend ausserhalb des Raums liegt
// (konvexe Ecken des Aussenrings, z. B. eine Nische; dort aendert ein Schnitt nichts).
G.inselHypothesen=(inp,ergFrei,opt={})=>{
  const o={...G.UM_DEF, ...opt}, ctx=ergFrei && ergFrei.intern; if(!ctx) return [];
  const L=ctx.L.filter(l=>!l.hyp && l.hOk && l.kind!=='boden' && l.hull.length), H=new Map(), tol=o.hypEckeTol, sin15=Math.sin(15*D2R), cos5=Math.cos(5*D2R);
  const ende=(l,X,t1)=>{ const tX=dot(X, l.u); let b=null;
    for(const [s0,s1] of l.hull){
      if(Math.abs(s1-tX)<=t1 && s0<tX-o.hypMinSeite){ const z={dir:[-l.u[0], -l.u[1]], far:tX-s0, len:s1-s0}; if(!b || z.len>b.len) b=z; }
      else if(Math.abs(s0-tX)<=t1 && s1>tX+o.hypMinSeite){ const z={dir:[l.u[0], l.u[1]], far:s1-tX, len:s1-s0}; if(!b || z.len>b.len) b=z; } }
    return b; };
  const senkBei=(l,X)=>l.vert.some(v=>Math.abs(v-dot(X, l.u))<=tol);
  const neu=(quelle, a, b, poly, beleg, dicke)=>{
    const A=Math.abs(area2(poly)); let U=0; for(let i=0;i<poly.length;i++){ const p=poly[i], q=poly[(i+1)%poly.length]; U+=Math.hypot(q[0]-p[0], q[1]-p[1]); }
    if(!(A<=o.islandMaxA) || !(dicke>=o.islandMinThick)) return;
    for(let i=0;i<poly.length;i++){ const p=poly[i], q=poly[(i+1)%poly.length]; if(Math.hypot(q[0]-p[0], q[1]-p[1])<o.hypMinSeite) return; }
    const id='I'+[a.id, b.id].sort(idVgl).join(','), alt=H.get(id); if(alt && alt.beleg>=beleg) return;
    H.set(id, {id, quelle, linien:[a.id, b.id].sort(idVgl), ecken:[], poly, A, U, dicke, beleg}); };
  for(let i=0;i<L.length;i++) for(let j=i+1;j<L.length;j++){ const a=L[i], b=L[j], c=dot(a.n, b.n);
    if(Math.abs(c)<=sin15){ const X=xLine(a, b); if(!X) continue;
      let ea=ende(a, X, tol), eb=ende(b, X, tol), quelle='ecke';
      if(!ea || !eb){ if(ea && senkBei(a, X)){ eb=ende(b, X, 3*tol); quelle='senk'; } else if(eb && senkBei(b, X)){ ea=ende(a, X, 3*tol); quelle='senk'; } }
      if(!ea || !eb) continue;
      if(!(dot(a.n, eb.dir)<0) || !(dot(b.n, ea.dir)<0)) continue;
      const pa=[X[0]+ea.dir[0]*ea.far, X[1]+ea.dir[1]*ea.far], pb=[X[0]+eb.dir[0]*eb.far, X[1]+eb.dir[1]*eb.far];
      neu(quelle, a, b, [X, pa, [pa[0]+eb.dir[0]*eb.far, pa[1]+eb.dir[1]*eb.far], pb], ea.len+eb.len, Math.min(ea.far, eb.far)); }
    else if(c<=-cos5){ const ma=refOf(a), mb=refOf(b), da=-sdist(a, mb), db=-sdist(b, ma); if(!(da>=0.08 && da<=1.5 && db>0)) continue;
      // Stuecke von b auf a.u projiziert; bestes Paar nach Ueberlapp
      let best=null;
      for(const [p0,p1] of a.hull) for(const [q0,q1] of b.hull){ const x=[dot(P_(b,q0), a.u), dot(P_(b,q1), a.u)].sort((u,v)=>u-v), ov=Math.min(p1, x[1])-Math.max(p0, x[0]);
        if(ov>=0.5*Math.min(p1-p0, x[1]-x[0]) && (!best || ov>best.ov)) best={ov, s0:Math.min(p0, x[0]), s1:Math.max(p1, x[1]), beleg:(p1-p0)+(q1-q0)}; }
      if(!best) continue;
      const A0=P_(a, best.s0), A1=P_(a, best.s1), auf=p=>xLine(b, lineOf(a.u, dot(a.u, p))), B0=auf(A0), B1=auf(A1); if(!B0 || !B1) continue;
      neu('gegen', a, b, [A0, A1, B1, B0], best.beleg, da); } }
  const inseln=(ergFrei.ringe || []).filter(r=>r.art==='insel'), sperr=[...(inp.inselFest || []), ...(inp.ausschluss || [])].map(x=>x.poly);
  // Rechteck im freien Schnitt schon ueberwiegend ausserhalb des Raums (Vorsprung des Aussenrings, Insel): der Schnitt aendert nichts
  const draussen=P=>{ let a=0, b=0; for(let fi=0;fi<ctx.nF;fi++){ const f=ctx.faces[fi]; if(!pip(f.c, P)) continue; b+=f.A; if(!ctx.inRoomFrei[fi]) a+=f.A; } return b>0 && a>0.5*b; };
  const vor=new Map(vorige(o.vorher).map(b=>[b.id, b]));
  // Rechteck, das eine Insel des freien Schnitts ueberlappt (nicht nur ihren Schwerpunkt traegt), entfaellt: sonst entstehen
  // zwei Ringe fuer dasselbe Objekt (Weg a offen und Hypothese teil, T3 'unten', Bericht P-E)
  const liste=[...H.values()].filter(h=>{ const c=schwer(h.poly); return !inseln.some(r=>ueberlappt(h.poly, r.pts)) && !sperr.some(P=>pip(c, P)) && !draussen(h.poly); })
    .sort((x,y)=>{ const vx=vor.has(x.id) && vor.get(x.id).stufe!=='nein' ? 0 : 1, vy=vor.has(y.id) && vor.get(y.id).stufe!=='nein' ? 0 : 1; return vx-vy || y.beleg-x.beleg || idVgl(x.id, y.id); })
    .slice(0, Math.max(0, o.hypMax|0)).sort((x,y)=>idVgl(x.id, y.id));
  return liste.map(h=>({id:h.id, quelle:h.quelle, linien:h.linien, ecken:h.ecken, poly:h.poly, A:h.A, U:h.U, dicke:h.dicke}));
};

// ------------------------------------------------ Hypothese bewerten
// G.inselBewerten(inp, hyp, ergFrei, opt) -> InselBewertung. Ein zusaetzlicher Schnitt im Graphen des freien
// Schnitts (gleiche Zerlegung, nur die Zellen im Rechteck fest aussen): dE = E(fest) - E(frei), dEn = dE/U,
// phi = Freiraumanteil der Rasterzellen im Rechteck, pfad = Weganteil > 0,1 (dann sofort verworfen, kein Schnitt),
// supRing/seiten aus dem Loch des erzwungenen Schnitts. Stufen 7.2 mit Hysterese ueber opt.vorher (id):
// nein -> kandidat (phi- und dEn-Tor) -> teil (hypRunden Runden in Folge) -> voll (supRing >= islandFullSup).
// Der Ring des erzwungenen Schnitts haengt nicht aufzaehlbar als bewertung.ring an, der Schnitt selbst als bewertung.schnitt
// (G.umriss mit opt.hyp nimmt ihn als endgueltigen Schnitt, wenn genau eine Hypothese voll ist, und loest ihn danach).
G.inselBewerten=(inp,hyp,ergFrei,opt={})=>{
  const o={...G.UM_DEF, ...opt}; let e=ergFrei;
  if(!e || !e.intern) e=G.umriss(inp, {...opt, hyp:false});
  const ctx=e.intern, R=ctx.R, P=hyp.poly, prev=vorige(o.vorher).find(x=>x.id===hyp.id), war=prev ? prev.stufe : 'nein';
  let x0=Infinity, x1=-Infinity, y0=Infinity, y1=-Infinity; for(const p of P){ x0=Math.min(x0, p[0]); x1=Math.max(x1, p[0]); y0=Math.min(y0, p[1]); y1=Math.max(y1, p[1]); }
  let n=0, nf=0, np=0;
  const c0=Math.max(0, Math.floor((x0-R.box[0])/R.tau)), c1=Math.min(R.W-1, Math.floor((x1-R.box[0])/R.tau)), r0=Math.max(0, Math.floor((y0-R.box[1])/R.tau)), r1=Math.min(R.H-1, Math.floor((y1-R.box[1])/R.tau));
  for(let r=r0;r<=r1;r++) for(let c=c0;c<=c1;c++){ const p=[R.box[0]+(c+0.5)*R.tau, R.box[1]+(r+0.5)*R.tau]; if(!pip(p, P)) continue; const k=r*R.W+c; n++; if(R.F[k]>=o.fMin-1e-9) nf++; if(R.PW[k]>0) np++; }
  const phi=n ? nf/n : 0, pfad=n ? np/n>0.1 : false;
  const mk=(z, ring, S)=>{ const b={id:hyp.id, dE:z.dE, dEn:z.dEn, phi, pfad, supRing:z.supRing, seiten:z.seiten, stufe:z.stufe, runden:z.runden};
    Object.defineProperty(b, 'ring', {value:ring || null, enumerable:false}); Object.defineProperty(b, 'schnitt', {value:S || null, enumerable:false, writable:true}); return b; };
  if(pfad) return mk({dE:null, dEn:null, supRing:0, seiten:0, stufe:'nein', runden:0});
  // erzwungener Schnitt: Fluss des freien Schnitts fortsetzen (gleicher Graph, nur die Zellen im Rechteck fest aussen)
  const neu=ctx.festPoly([P]), S=nachSchnitt(ctx, ctx.frei, neu), dE=S.flow-ctx.flow, dEn=hyp.U>0 ? dE/hyp.U : null;
  // Loch mit dem Rechteck: Aussen-Komponente der festen Zellen ohne Randkontakt (Raum = alle Innenzellen)
  let h=null; { const C=[], seen=new Uint8Array(ctx.nF), st=[]; for(let fi=0;fi<ctx.nF;fi++) if(neu[fi] && !S.lab[fi]){ seen[fi]=1; st.push(fi); }
    while(st.length){ const v=st.pop(); C.push(v); for(const k of ctx.nb[v]){ const a=ctx.adj[k], w=a.fp===v ? a.fm : a.fp; if(!seen[w] && !S.lab[w]){ seen[w]=1; st.push(w); } } }
    if(C.length && !C.some(fi=>ctx.faces[fi].bnd)) h=lochMass(ctx, C.sort((a,b)=>a-b), S.lab); }
  let ring=null;
  if(h){ const mm=new Uint8Array(ctx.nF); for(const fi of h.faces) mm[fi]=1; const RR=ringeVon(ctx, S.lab, mm);
    if(RR.length) ring=ringObj(ctx, RR[0], {id:hyp.id, art:'insel', teil:h.sup<o.islandFullSup || !h.ecke, supRing:h.sup, phi, dicke:h.thick, quelle:'hypothese', entscheid:'offen', exportiert:false}); }
  const lief=war!=='nein', phiOk=G.hyst(lief, phi, o.inselPhiSetzen, o.inselPhiLoesen, '<='), dEnOk=dEn!=null && G.hyst(lief, dEn, o.hypDEnSetzen, o.hypDEnLoesen, '<=');
  let stufe='nein', runden=0;
  if(h && ring && phiOk && dEnOk){ runden=(lief ? prev.runden : 0)+1; stufe=runden>=o.hypRunden ? (h.sup>=o.islandFullSup && h.ecke ? 'voll' : 'teil') : 'kandidat'; }
  return mk({dE, dEn, supRing:h ? h.sup : 0, seiten:h ? h.seiten : 0, stufe, runden}, ring, e===ergFrei ? S : null);
};
