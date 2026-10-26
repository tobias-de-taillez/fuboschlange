// ------------------------------------------------ Karte: Abschnitte (M4)
// Schnitte und ihre Klassen, Abschnitte (sectionOf), Startwerte ueber die Kette, Registrierung
// im Bild-Fehlermass mit Mehrfachhypothesen, Bindungen ueber die Schnitte als Max-Mixture,
// Stuetzstellen (Knoten) und ihre Folgekanten. Vertrag: ARCHITEKTUR v3, Abschnitte 3.2
// (Strukturen), 3.2.1 (Klassen, Max-Mixture, Bruchsignale), 3.2.2 (Stufen; gesetzt von M10,
// das Gewicht liefert M4), 3.2.3 (Knoten), 4 (Block M4), 14.1 (Eigentum), 17.3 (Bauauftrag).
// Setzt G mit M0 (raumskizze-karte-grund.js) und dem geo-Kern voraus; G.lmVorhersage (M5)
// nur zur Laufzeit in G.registriere. Kein DOM, keine Uhr, kein Zufall.
// Schreibt nur: Schnitt (ausser bindung.k), Abschnitt.g0, .reg, .knoten.t/s/c. Nie g, cov,
// sig (M6) und nie stufe (M10); knoten.d/cov nur beim Anlegen des Knotens als Leerwert (Float64Array(0), null),
// verlaengert werden sie nur von M6 (Vorschlag fuer 14.1).
// Wandmodell der Vorhersage (Festlegung P-C, Vorschlag fuer 4, Block M5): A/B/iv von G.lmVorhersage = Oberkante
// (Decke bei h 'c'/'f'/'lokal', eigene Hoehe bei Zahl), sichtbar gilt nur fuer sie; unten = {A, B, iv} = Bodenkante
// (null bei Stoerern), auch bei sichtbar = false. Beob-Art decke/stoer <-> Oberkante, boden <-> unten (registriere 3.).
// Zusatzfelder ueber 3.2/4 hinaus (Begruendung im Bericht P-A, Nachtrag in 3.2/4/14.1 durch Tobias offen):
//   Schnitt.bindung.dG   Planwirkung gAusT(T_A)^-1 ∘ gAusT(T_B). Bindung 'pose' und Kette brauchen
//                        sie; dT (rohe Differenzen) reicht nicht, weil die Verschiebung mit -psi_A dreht.
//   Abschnitt.knoten.c   Kamera (Plan, Bezug) je Knoten; c_{j+1} fuer r_P der Folgekante (3.2.3).
//   resKette komp[].r    eigener Rest der Komponente 'anker' (Mittel aus schnitt.anker, G.resAnker).
//   schnittKlasse -> dT, registriere -> arbeit, abschnittSigma(cov, {c, psi}) (Lage an einem Punkt).
//   reg.hyp[]: fest, sig [sigP m, sigPsi rad], schritt [p m, psi rad, y m] (Annahme-Bedingung, registriere 4.).
//   R2 (19.2 Z6-Z8, Vertrag 19.3): G.ketteNachF0; reg.hyp[] traegt weg, nErf, kette {dP, dY, veto}; reg und Rueckgabe
//   tragen weg (angenommener Weg oder null), veto ('kette' | 'ganz' | 'widerspruch', nur wenn es eine sonst angenommene
//   Hypothese verwarf) und kette {sP, sY, c, richtung, dP0, dY0} (dP0/dY0: g0 gegen die Kette an der Kameramitte);
//   arbeit.df (Distanzfeld, Wegspanne), arbeit.wege (Trichter je Weg), arbeit.kette.
// Optionen ueber 4 hinaus: sessionCuts o.anker (Zeilen wie anker.jsonl: [t, anlass, ..., [[id,x,y,z,psi]]]
//   an Index 8, oder {t, anker}), o.ankerFenster, o.rLoc/rPsiDeg/dtPause (an schnittKlasse).
// Ereignisse: Feld typ (M10) oder type (Protokoll). 'rest' traegt rP (m oder [x, z]) und rPsi (rad)
//   der Folgekante (3.2.3), 'ref-reset' nur t.
const D2R=Math.PI/180, VIERTEL=Math.PI/2;
const wrap=a=>Math.atan2(Math.sin(a), Math.cos(a));
const wrap90=a=>{ let d=((a%VIERTEL)+VIERTEL)%VIERTEL; return d>VIERTEL/2 ? d-VIERTEL : d; };   // (-45°, 45°]
const evTyp=e=>e && (e.typ || e.type);
const NULLG=()=>({psi:0, tx:0, ty:0, tz:0});
// Plan-Gier der Pose (ARCore-local): Matrix aus der Quaternion, gebraucht wird nur Spalte 2 (m[8], m[10]);
// ausgewertet ueber G.blickPlan wie camTo (1.2).
const poseBlick=p=>{ const x=p[3], y=p[4], z=p[5], w=p[6]; return G.blickPlan([0,0,0,0, 0,0,0,0, 2*(x*z+y*w),0,1-2*(x*x+y*y),0, 0,0,0,1]); };
const dTvon=(TA,TB)=>({psi:G.psiAusTpsi(wrap(TB[0]-TA[0])), tx:TB[1]-TA[1], ty:TB[2]-TA[2], tz:TB[3]-TA[3]});

// ------------------------------------------------ Max-Mixture (3.2.1)
// stetig: Bindung und sigma nach Klasse, w = 1. sprung: Mittel 0, 1 m / 20° / 0,3 m; w so, dass sprung erst ab
// chi²_stetig - chi²_sprung >= MM.schwelle gewinnt (Kosten ½chi² + ½ln|Σ| - ln w; |Σ| ueber rx, rz, rψ, ry).
// anker: Mittel aus schnitt.anker (G.resAnker), w = 0 bis zur Freigabe (AB1). M6 waehlt (mmSchwelle dort).
const MM={sP:1.0, sY:20*D2R, sH:0.3, schwelle:16, anker:{sP:0.05, sY:D2R, sH:0.02}};
const lnDet=(p,y,h)=>4*Math.log(p)+2*Math.log(y)+2*Math.log(h);
const mmVon=b=>[{name:'stetig', w:1, sP:b.sP, sY:b.sY, sH:b.sH},
  {name:'sprung', w:Math.exp(0.5*(lnDet(MM.sP, MM.sY, MM.sH)-lnDet(b.sP, b.sY, b.sH))-MM.schwelle/2), sP:MM.sP, sY:MM.sY, sH:MM.sH},
  {name:'anker', w:0, ...MM.anker}];

// ------------------------------------------------ Schnittklasse (3.2.1)
// zeilen[i-1] / zeilen[i]: letzte / erste PoseZeile beiderseits; zeilen[i-2] fuer die Vorhersage mit
// konstanter Geschwindigkeit (fehlt sie: rPose = rPsi = NaN, Klasse reloc). o.rest = Ereignis 'rest':
// rPose = |rP|, rPsi = |rPsi| der Folgekante, Klasse reloc (ausser Pause).
const SK_DEF={rLoc:0.02, rPsiDeg:1.0, dtPause:0.5, rest:null};
G.schnittKlasse=(zeilen,i,art,o0={})=>{
  const o={...SK_DEF, ...o0}, A=zeilen[i-1], B=zeilen[i], Z=zeilen[i-2], dt=B.t-A.t;
  let rPose=NaN, rPsi=NaN;
  if(Z){ const k=(B.t-A.t)/(A.t-Z.t), pr=[0,1,2].map(j=>A.pose[j]+(A.pose[j]-Z.pose[j])*k);
    const ga=poseBlick(A.pose), gb=poseBlick(Z.pose), gp=ga+wrap(ga-gb)*k;
    rPose=Math.hypot(B.pose[0]-pr[0], B.pose[1]-pr[1], B.pose[2]-pr[2]); rPsi=Math.abs(wrap(poseBlick(B.pose)-gp)); }
  if(art==='rest' && o.rest){ const r=o.rest.rP; rPose=Array.isArray(r) ? Math.hypot(r[0], r[1]) : Math.abs(r); rPsi=Math.abs(o.rest.rPsi); }
  const klasse=art==='anker-zurueck' ? 'zurueck' : dt>o.dtPause ? 'pause'
    : art!=='rest' && rPose<=o.rLoc && rPsi<=o.rPsiDeg*D2R ? 'nurT' : 'reloc';
  const dT=dTvon(A.T, B.T), dxz=Math.hypot(dT.tx, dT.tz);
  let b;
  if(klasse==='nurT') b={art:'pose', sP:Math.max(0.01, 0.3*dxz), sY:Math.max(0.2*D2R, 0.3*Math.abs(dT.psi)), sH:Math.max(0.01, 0.3*Math.abs(dT.ty))};
  else if(klasse==='reloc') b={art:'kamera', sP:0.03+0.7*dt+0.5*rPose, sY:(1+45*dt)*D2R+0.5*rPsi, sH:0.01+0.3*dt};
  else if(klasse==='pause') b={art:'kamera', sP:0.03+0.7*dt, sY:(1+45*dt)*D2R, sH:0.01+0.3*dt};
  else b={art:'pose', sP:0.02, sY:0.3*D2R, sH:0.01};
  b.kern='mm'; b.mm=mmVon(b); b.k=null;
  b.dG=klasse==='zurueck' ? NULLG() : G.gKomp(G.gInv(G.gAusT(A.T)), G.gAusT(B.T));
  return {klasse, rPose, rPsi, bindung:b, dT};
};

// ------------------------------------------------ Schnitte (3.2, 4)
// Quellen: Brueche (ohne kleine anker-spruenge), jede Zeile mit geaendertem T, Kamerasprung innerhalb einer
// Epoche (|Δ camTo| > camJump und > camV m/s), Ereignisse 'ref-reset' und 'rest', bei o.gyro die Abweichung
// |Δψ(Pose) - Σ imuPsi| > gyroDeg ueber 0,5 s. Ereignisse an derselben Zeilengrenze sind ein Schnitt; ein Schnitt
// ohne Epochenwechsel wird in den naechsten Epochenschnitt bis merge s eingeschmolzen (nie zwei Epochengrenzen
// zusammen, ein T-Wechsel ist immer Grenze). Der Schnitt liegt dann an der Epochengrenze (t, epA, epB), die Klasse an
// der Spanne Zeile vor dem ersten | Zeile nach dem letzten Ereignis. Abweichung vom F2-Erzeuger (karte/fixtures/
// erzeuge-f2.mjs Z. 66 nimmt die erste Zeile der Spanne): nur bei einem Sprung bis merge s VOR einer Epochengrenze;
// A6-A8 enthalten den Fall nicht, F2 bleibt bitgleich.
// Inkrementell: Schnitte ohne Epochenwechsel werden erst gemeldet, wenn merge s Posen danach vorliegen (so
// verschwindet nie ein gemeldeter Abschnitt); prev behaelt die Objekte (und bindung.k von M6) gemeldeter Schnitte.
// Das Ergebnis haengt nur von den Eingaengen ab: stueckweise eingespeist gleich wie auf einmal.
const SC_DEF={minJump:[0.05, 0.5], camJump:0.10, camV:1.5, merge:0.3, tWechsel:true, reset:true, rest:true, gyro:false, gyroDeg:null,
  anker:null, ankerFenster:5};
const ankerZeile=z=>Array.isArray(z) ? {t:z[0], A:z[8]} : {t:z.t, A:z.anker};
// Beidseits verfolgte Anker: letzte Lage bis fenster s vor tA und erste bis fenster s nach tB, im Bezug der Seite.
function ankerAm(zeilen, tA, TA, tB, TB, fenster){
  if(!zeilen || !zeilen.length) return [];
  const seite=(t, T, vorher)=>{ const gi=G.gInv(G.gAusT(T)), m=new Map(), Z=[];
    for(const z0 of zeilen){ const z=ankerZeile(z0); if(vorher ? (z.t<=t && z.t>=t-fenster) : (z.t>=t && z.t<=t+fenster)) Z.push(z); }
    if(!vorher) Z.reverse();
    for(const z of Z) for(const a of (z.A||[])) if(a && a.length>=5) m.set(a[0], {t:z.t, p:G.gAnw(gi, [a[1], a[2], a[3]]), psi:G.ankerPlan(a[4])+gi.psi});
    return m; };
  const vor=seite(tA, TA, true), nach=seite(tB, TB, false);
  return [...vor.keys()].filter(id=>nach.has(id)).sort((a,b)=>a-b).map(id=>{ const b=vor.get(id), a=nach.get(id);
    return {id, pb:[...b.p, b.psi], pa:[...a.p, a.psi], tb:b.t, ta:a.t}; });
}
G.sessionCuts=(posen,breaks,ereignisse,o0={},prev=null)=>{
  const o={...SC_DEF, ...o0}, P=posen||[], N=P.length;
  if(N<2) return [];
  const ersteAb=t=>{ let lo=0, hi=N; while(lo<hi){ const m=(lo+hi)>>1; if(P[m].t>=t) hi=m; else lo=m+1; } return lo; };
  const ev=[];
  for(const b of (breaks||[])){ if(!b || !Number.isFinite(b.t)) continue;
    if(b.grund==='anker-sprung' && b.d<o.minJump[0] && Math.abs(b.dpsiDeg)<o.minJump[1]) continue;
    const i=ersteAb(b.t); if(i>=1 && i<N) ev.push({i, q:'bruch', b}); }
  for(const e of (ereignisse||[])){ const a=evTyp(e), q=a==='ref-reset' && o.reset ? 'reset' : a==='rest' && o.rest ? 'rest' : null;
    if(!q || !Number.isFinite(e.t)) continue; const i=ersteAb(e.t); if(i>=1 && i<N) ev.push({i, q, e}); }
  for(let i=1;i<N;i++){ const a=P[i-1], b=P[i];
    if(o.tWechsel && a.T && b.T && (a.T[0]!==b.T[0] || a.T[1]!==b.T[1] || a.T[2]!==b.T[2] || a.T[3]!==b.T[3])) ev.push({i, q:'t-wechsel'});
    if(a.cam && b.cam && a.ep===b.ep){ const dt=b.t-a.t, d=Math.hypot(b.cam[0]-a.cam[0], b.cam[1]-a.cam[1], b.cam[2]-a.cam[2]);
      if(d>o.camJump && d/Math.max(dt, 0.05)>o.camV) ev.push({i, q:'kamera', d}); } }
  if(o.gyro && Number.isFinite(o.gyroDeg)){
    const bl=P.map(z=>poseBlick(z.pose)); let j=0, sperre=-Infinity;
    for(let i=1;i<N;i++){ while(P[i].t-P[j].t>0.5) j++; if(i===j || P[i].t<sperre) continue;
      let s=0, ok=true; for(let k=j+1;k<=i;k++){ const v=P[k].imuPsi; if(!Number.isFinite(v)){ ok=false; break; } s+=v; }
      if(ok && Math.abs(wrap(bl[i]-bl[j]-s))>o.gyroDeg*D2R){ ev.push({i, q:'gyro'}); sperre=P[i].t+0.5; } } }
  // Gruppen je Zeilengrenze, Einschmelzen, Zurueckhalten am Ende
  const gm=new Map();
  for(const e of ev){ let g=gm.get(e.i); if(!g){ g={i:e.i, i0:e.i, i1:e.i, es:[], ep:P[e.i].ep!==P[e.i-1].ep}; gm.set(e.i, g); } g.es.push(e); }
  let gr=[...gm.values()].sort((a,b)=>a.i-b.i);
  for(const g of gr){ if(g.ep || g.es.some(e=>e.q==='t-wechsel')) continue; let nah=null;
    for(const h of gr) if(h.ep && Math.abs(P[h.i].t-P[g.i].t)<=o.merge && (!nah || Math.abs(h.i-g.i)<Math.abs(nah.i-g.i))) nah=h;
    if(nah){ nah.es.push(...g.es); nah.i0=Math.min(nah.i0, g.i); nah.i1=Math.max(nah.i1, g.i); g.weg=true; } }
  const tEnde=P[N-1].t;
  gr=gr.filter(g=>!g.weg && (g.ep || P[g.i].t<=tEnde-o.merge));
  const NAN3=[NaN, NaN, NaN];
  const neu=gr.map(g=>{
    const tw=g.es.find(e=>e.q==='t-wechsel'), br=g.es.filter(e=>e.q==='bruch'), rs=g.es.find(e=>e.q==='reset'), re=g.es.find(e=>e.q==='rest'),
      ka=g.es.find(e=>e.q==='kamera'), gy=g.es.find(e=>e.q==='gyro');
    // Schnitt an der eigenen Zeilengrenze der Gruppe (bei Epochenwechsel die Epochengrenze, 3.2: zwischen letzter Zeile
    // von epA und erster von epB); eingeschmolzene Spruenge weiten nur die Spanne ia..ib der Klasse.
    const iCut=g.i, ia=g.i0-1, ib=g.i1, A=P[ia], B=P[ib];
    const art=tw ? 't-wechsel' : br.length ? 'bruch' : rs ? 'reset' : re ? 'rest' : ka ? 'kamera' : 'gyro';
    const K=G.schnittKlasse([P[ia-1], A, B], 2, art, {...o, rest:art==='rest' ? re.e : null});
    const cb=A.cam || NAN3, ca=B.cam || NAN3;
    return {t:P[iCut].t, epA:P[iCut-1].ep, epB:P[iCut].ep, art, klasse:K.klasse,
      grund:br.length ? [...new Set(br.map(e=>e.b.grund))].join('+') : rs ? 'ref-reset' : re ? 'rest' : ka ? 'kamera-sprung' : gy ? 'gyro' : null,
      dt:B.t-A.t, cb, ca, pb:[...cb, A.blick], pa:[...ca, B.blick], rPose:K.rPose, rPsi:K.rPsi,
      dCam:Math.hypot(ca[0]-cb[0], ca[1]-cb[1], ca[2]-cb[2]), dT:K.dT, bindung:K.bindung,
      anker:ankerAm(o.anker, A.t, A.T, B.t, B.T, o.ankerFenster), zurueckZu:null};
  });
  if(!prev || !prev.length) return neu;
  const frei=new Set(prev.map((_,j)=>j));
  return neu.map(c=>{ for(const j of frei){ const p=prev[j];
      if(p.epA===c.epA && p.epB===c.epB && Math.abs(p.t-c.t)<=o.merge){ frei.delete(j); const k=p.bindung ? p.bindung.k : null; Object.assign(p, c); p.bindung.k=k; return p; } }
    return c; });
};

// Abschnitt zu (t, ep): die Epoche entscheidet an Epochenschnitten, t nur an Schnitten innerhalb einer Epoche.
G.sectionOf=(schnitte,t,ep)=>{ let n=0; for(const c of schnitte) if(c.epA!==c.epB ? ep>=c.epB : (ep>c.epA || (ep===c.epA && t>=c.t))) n++; return n; };

// ------------------------------------------------ Kette (Startwerte g0)
// Fuer Abschnitte ohne g0: Abschnitt 0 Einheit; sonst aus dem Vorgaenger (g, falls M6 ihn schon hat, zur Schnittzeit
// ueber G.gBei, sonst g0): pose -> g_A ∘ ΔT; kamera -> Kamera und Blick in F0 stetig; rest -> g_A (gleicher Bezug);
// zurueck -> g des Abschnitts zurueckZu. Schreibt NUR g0.
const ketteG=(s,gA,gZ)=>{
  if(s.klasse==='zurueck') return gZ ? {...gZ} : null;
  if(s.art==='rest') return {psi:gA.psi, tx:gA.tx, ty:gA.ty, tz:gA.tz};
  if(s.bindung.art==='pose') return G.gKomp(gA, s.bindung.dG);
  const psi=gA.psi+s.pb[3]-s.pa[3], w=G.gAnw(gA, s.cb), c=Math.cos(psi), sn=Math.sin(psi);
  return {psi, tx:w[0]-(c*s.ca[0]-sn*s.ca[2]), ty:w[1]-s.ca[1], tz:w[2]-(sn*s.ca[0]+c*s.ca[2])};
};
const gVon=(A,t)=>A ? (A.g ? G.gBei(A, t) : A.g0) : null;
G.ketteStart=(schnitte,abschnitte)=>{
  for(let k=0;k<abschnitte.length;k++){ const B=abschnitte[k]; if(B.g0) continue;
    if(k===0){ B.g0=NULLG(); continue; }
    const s=schnitte[k-1]; if(!s){ B.g0=null; continue; }
    const gA=gVon(abschnitte[k-1], s.t), gZ=s.zurueckZu!=null ? gVon(abschnitte[s.zurueckZu], s.t) : null;
    B.g0=gA ? ketteG(s, gA, gZ) : null; }
  return abschnitte;
};

// ------------------------------------------------ Bindungen ueber den Schnitt (Max-Mixture)
// gA, gB = G.gBei(A, schnitt.t), G.gBei(B, schnitt.t); bei Klasse zurueck ist A der Abschnitt zurueckZu.
// pose:   r = gB ⊖ (gA ∘ ΔT), ausgewertet an der Kamera ca (Lage x, z), Gier, Hoehe.
// kamera: r = gB(ca) - gA(cb) (Lage), Plan-Gier-Differenz der Blicke, Hoehe der Kamera.
G.resKette=(s,gA,gB)=>{
  const b=s.bindung; let r;
  if(b.art==='pose'){ const gP=G.gKomp(gA, b.dG || NULLG()), c=[s.ca[0], s.ca[2]], q=G.gPlan(gB, c), p=G.gPlan(gP, c);
    r=[q[0]-p[0], q[1]-p[1], wrap(gB.psi-gP.psi), gB.ty-gP.ty]; }
  else if(b.art==='kamera'){ const qa=G.gAnw(gB, s.ca), qb=G.gAnw(gA, s.cb);
    r=[qa[0]-qb[0], qa[2]-qb[2], wrap(gB.psi+s.pa[3]-gA.psi-s.pb[3]), qa[1]-qb[1]]; }
  else r=[0, 0, 0, 0];
  const komp=(b.mm || mmVon(b)).map(k=>({name:k.name, w:b.art==='keine' ? 0 : k.w, sigma:[k.sP, k.sP, k.sY, k.sH]}));
  const ak=komp.find(k=>k.name==='anker');
  if(ak){ const ra=G.resAnker(s, gA, gB); ak.r=ra.r.length ? ra.r : null; if(ra.r.length) ak.sigma=ra.sigma; }
  return {r, komp, kern:'mm'};
};
// Rueckfall-Bindung ueber die beidseits verfolgten Anker (AB1): je Anker Lage x, z, Gier, Hoehe in F0.
G.resAnker=(s,gA,gB)=>{
  const r=[], sigma=[];
  for(const a of (s.anker||[])){ const qa=G.gAnw(gB, a.pa), qb=G.gAnw(gA, a.pb);
    r.push(qa[0]-qb[0], qa[2]-qb[2], wrap(gB.psi+a.pa[3]-gA.psi-a.pb[3]), qa[1]-qb[1]); sigma.push(MM.anker.sP, MM.anker.sP, MM.anker.sY, MM.anker.sH); }
  return {r, sigma};
};
// Einordnung ueber die Anker im Bezug: 'kamera' = Anker bleiben (<= 1 cm / 0,2°), die Kamera springt (nur der
// Betrachter); 'rahmen' = mehr als die Haelfte (mind. 1, bei 2 Ankern beide) folgt einer gemeinsamen starren
// Bewegung auf 2 cm / 0,5° (Bezug gesprungen); 'zurueck' bei art anker-zurueck; sonst 'unbekannt' (gemischt).
G.ankerEinordnen=s=>{
  if(s.art==='anker-zurueck' || s.zurueckZu!=null) return 'zurueck';
  const A=(s.anker||[]).filter(a=>a && a.pb && a.pa); if(!A.length) return 'unbekannt';
  const ruhig=A.every(a=>Math.hypot(a.pa[0]-a.pb[0], a.pa[1]-a.pb[1], a.pa[2]-a.pb[2])<=0.01 && Math.abs(wrap(a.pa[3]-a.pb[3]))<=0.2*D2R);
  if(ruhig) return s.dCam>0.02 || s.rPose>0.02 ? 'kamera' : 'unbekannt';
  let best=0;
  for(const h of A){ const psi=wrap(h.pa[3]-h.pb[3]), c=Math.cos(psi), sn=Math.sin(psi), t=[h.pa[0]-(c*h.pb[0]-sn*h.pb[2]), h.pa[1]-h.pb[1], h.pa[2]-(sn*h.pb[0]+c*h.pb[2])];
    let n=0; for(const a of A) if(Math.hypot(c*a.pb[0]-sn*a.pb[2]+t[0]-a.pa[0], a.pb[1]+t[1]-a.pa[1], sn*a.pb[0]+c*a.pb[2]+t[2]-a.pa[2])<=0.02
      && Math.abs(wrap(a.pa[3]-a.pb[3]-psi))<=0.5*D2R) n++;
    if(n>best) best=n; }
  return best>A.length/2 ? 'rahmen' : 'unbekannt';
};

// ------------------------------------------------ Sigma und Gewicht (3.2.2)
// cov: 16 Werte (psi, tx, ty, tz) oder knoten.cov (16 je Knoten) -> schlechtester Knoten (groesstes max).
// max/min: Halbachsen der Lage (tx, tz) am Ursprung des Bezugs, ang deren Richtung (rad), y Hoehe.
// o.c = [x, z] (Bezug) mit o.psi: Lage an diesem Punkt (Hebel der Gier, J = [-p_z, 1, 0; p_x, 0, 1], p = R(psi)·c).
G.abschnittSigma=(cov,o={})=>{
  if(!cov || cov.length<16) return null;
  const K=Math.floor(cov.length/16), IX=[0, 1, 3]; let best=null;
  for(let j=0;j<K;j++){ const C=(a,b)=>cov[16*j+4*a+b];
    let a=C(1,1), b=C(1,3), d=C(3,3);
    if(o.c){ const cs=Math.cos(o.psi||0), sn=Math.sin(o.psi||0), px=cs*o.c[0]-sn*o.c[1], pz=sn*o.c[0]+cs*o.c[1], u=[-pz, 1, 0], v=[px, 0, 1];
      const q=(x,y)=>{ let s=0; for(let m=0;m<3;m++) for(let n=0;n<3;n++) s+=x[m]*C(IX[m], IX[n])*y[n]; return s; };
      a=q(u,u); b=q(u,v); d=q(v,v); }
    const m=(a+d)/2, w=Math.sqrt(((a-d)/2)**2+b*b);
    const s={psi:Math.sqrt(Math.max(0, C(0,0))), max:Math.sqrt(Math.max(0, m+w)), min:Math.sqrt(Math.max(0, m-w)), ang:0.5*Math.atan2(2*b, a-d), y:Math.sqrt(Math.max(0, C(2,2)))};
    if(!best || s.max>best.max) best=s; }
  return best;
};
G.abschnittGewicht=A=>A && (A.stufe==='verbunden' || A.stufe==='locker') && A.sig && Number.isFinite(A.sig.max) ? Math.exp(-A.sig.max*A.sig.max/(2*0.05*0.05)) : 0;

// ------------------------------------------------ Stuetzstellen (3.2.3)
// Wandrichtung einer Beob in der Draufsicht (mod 180°) aus ihren Strahlen: Ebene durch Kamera und Linie hat die
// Normale N = da × db, eine waagerechte Linie darin laeuft laengs N × y. NaN, wenn die Ebene fast waagerecht ist.
const WANDART=new Set(['decke', 'boden', 'erfassung']);
const beobRichtung=b=>{ const a=b.da, c=b.db; if(!a || !c) return NaN;
  const nx=a[1]*c[2]-a[2]*c[1], ny=a[2]*c[0]-a[0]*c[2], nz=a[0]*c[1]-a[1]*c[0], h=Math.hypot(nx, nz);
  if(!(h>0.3*Math.hypot(nx, ny, nz))) return NaN;
  const r=Math.atan2(nx, -nz)%Math.PI; return r<0 ? r+Math.PI : r; };
// Zahl der Wandrichtungen: Histogramm 5° (mod 180°), Fenster +-15°, gierig Spitzen mit >= nMin, paarweise >= richtDeg.
const richtungen=(th,richtDeg,nMin)=>{
  const NB=36, h=new Float64Array(NB); for(const x of th) h[Math.min(NB-1, Math.floor(x/Math.PI*NB))]++;
  const w=new Float64Array(NB); for(let j=0;j<NB;j++) for(let r=-3;r<=3;r++) w[j]+=h[(j+r+NB)%NB];
  const abst=(a,b)=>{ const d=Math.abs(a-b)%NB; return 5*Math.min(d, NB-d); }, wahl=[];
  for(;;){ let jb=-1; for(let j=0;j<NB;j++) if(w[j]>=nMin && wahl.every(k=>abst(j, k)>=richtDeg) && (jb<0 || w[j]>w[jb])) jb=j;
    if(jb<0) break; wahl.push(jb); }
  return wahl.length; };
// Knoten nur fuer verbundene/lockere Abschnitte; nur hinten anhaengen, gesetzte nie verschieben. Neuer Knoten an
// der ersten Zeile mit Δt >= dT oder Δs >= dS seit dem letzten UND >= minBeob Schluessel-Beob (zugeordnet, Wandart)
// an >= minRicht Richtungen (>= richtDeg auseinander, je >= max(3, 0,2·minBeob)) im Intervall seither.
// Kuerzer als 2·dT oder < 2·minBeob Schluessel-Beob: K = 1 (knoten bleibt null). Erster Knoten bei der ersten
// Zeile des Abschnitts (s = 0). Schreibt knoten.t, s, c; d und cov verlaengert M6.
G.knotenSetzen=(A,posen,beob,o0)=>{
  const o={...G.KG.KNOTEN, ...o0};
  if(!A || !(A.stufe==='verbunden' || A.stufe==='locker')) return A ? A.knoten : null;
  const Z=(posen||[]).filter(z=>z.cam && z.t>=A.t0 && z.t<=A.t1 && z.ep>=A.ep0 && z.ep<=A.ep1);
  if(Z.length<2) return A.knoten;
  const s=new Float64Array(Z.length);
  for(let i=1;i<Z.length;i++) s[i]=s[i-1]+Math.hypot(Z[i].cam[0]-Z[i-1].cam[0], Z[i].cam[2]-Z[i-1].cam[2]);
  const B=[]; for(const b of (beob||[])) if(b.ab===A.ab && b.schluessel && b.L!=null && b.L!==-1 && WANDART.has(b.art)){ const r=beobRichtung(b); if(Number.isFinite(r)) B.push({t:b.t, r}); }
  B.sort((a,b)=>a.t-b.t);
  if(A.t1-A.t0<2*o.dT || B.length<2*o.minBeob) return A.knoten;
  const K=A.knoten, T=K ? Array.from(K.t) : [Z[0].t], S=K ? Array.from(K.s) : [0], C=K && K.c ? Array.from(K.c) : [Z[0].cam[0], Z[0].cam[2]];
  const nMin=Math.max(3, Math.ceil(0.2*o.minBeob)), n0=T.length;
  let tl=T[T.length-1], sl=S[S.length-1], jb=0;
  while(jb<B.length && B[jb].t<=tl) jb++;
  for(let i=0;i<Z.length;i++){ const z=Z[i]; if(!(z.t>tl)) continue;
    if(!(z.t-tl>=o.dT-1e-9 || s[i]-sl>=o.dS-1e-9)) continue;
    let je=jb; while(je<B.length && B[je].t<=z.t) je++;
    if(je-jb<o.minBeob || richtungen(B.slice(jb, je).map(x=>x.r), o.richtDeg, nMin)<o.minRicht) continue;
    T.push(z.t); S.push(s[i]); C.push(z.cam[0], z.cam[2]); tl=z.t; sl=s[i]; jb=je; }
  if(T.length===n0 || T.length<2) return A.knoten;
  if(K){ K.t=Float64Array.from(T); K.s=Float64Array.from(S); K.c=Float64Array.from(C); }
  else A.knoten={t:Float64Array.from(T), s:Float64Array.from(S), c:Float64Array.from(C), d:new Float64Array(0), cov:null};
  return A.knoten;
};
// Folgekante j -> j+1 (VINS-Mono Gl. 28 in Versatzform): r_P = d_{j+1}(c) - d_j(c) an der Kamera c des Knotens j+1,
// r_psi, r_y als Differenzen; kein Robustkern; sigma nach G.KG.KNOTEN mit Δs = s_{j+1} - s_j. dj: [psi, tx, ty, tz] oder {…}.
G.resKnoten=(A,j,dj,dj1)=>{
  const K=A.knoten, o=G.KG.KNOTEN, V=d=>Array.isArray(d) || ArrayBuffer.isView(d) ? {psi:d[0], tx:d[1], ty:d[2], tz:d[3]} : d;
  const a=V(dj), b=V(dj1), c=K && K.c ? [K.c[2*(j+1)], K.c[2*(j+1)+1]] : [0, 0], ds=K && K.s ? K.s[j+1]-K.s[j] : 0;
  const pa=G.gPlan(a, c), pb=G.gPlan(b, c), sP=Math.hypot(o.sP0, o.kP*ds);
  return {r:[pb[0]-pa[0], pb[1]-pa[1], b.psi-a.psi, b.ty-a.ty], sigma:[sP, sP, Math.hypot(o.sY0Deg, o.kYDeg*ds)*D2R, Math.hypot(o.sH0, o.kH*ds)]};
};

// ------------------------------------------------ Registrierung (Bild-Fehlermass, 4)
// 1. Gieren: 4 Lagen mod 90° aus den Hauptrichtungen (global gegen lokal; lokal aus den Waenden rahmen = ab, sonst
//    abschnitt.psi0, sonst den Beob), naechste an g0 zuerst; o.gier = 'kette': nur g0.psi.
// 2. Vorfilter in der Draufsicht (ohne Vorhersagen): Stichproben der lokalen Waende gegen Abstandsfelder der globalen
//    Waende je Seite (phi +-10°), gekappt bei 15 cm; Raster raster[0] in +-R um die Kette, gedreht um die Kamera am
//    Schnitt (Gieren +-dGrad); R = weit; ist 1,5·sP > weit, die ganze globale Karte mit groeberem Raster. sP ist das sigma
//    der Kette: sP der eigenen Bindung, mit den sP der Schnitte davor quadratisch aufsummiert, solange der Vorgaenger nicht
//    verbunden/locker ist (dessen g0 ist selbst nur Kette; ueber 4 hinaus; gemessen am ausgelieferten Stand: T3 schwer
//    3 -> 1 falsch angenommen, Platzhalter und echtes M5). Rasterpunkte in
//    der Reihenfolge der Kosten (zuerst der beste, dann der beste je Gierlage) werden Punkt-zu-Linie verfeinert; wer
//    in eine schon gefundene Lage laeuft (rivalLage / rivalWinkel am Schwerpunkt der Kameras), faellt weg. Ohne lokale
//    Waende: Ersatzwaende aus den Beob (gehoben auf hC - ty0 bzw. hF - ty0, hoechstens REG.ersatz), sonst blieben nur die
//    Gierlagen um die Kette und Gauss-Newton muesste die ganze Lage tragen (gemessen T3 'ohne lokale Karte' mit echtem M5:
//    vorher 41 von 56 richtig und 2 falsch angenommen, mit Ersatzwaenden 56 von 56 und 0 falsch).
// 3. Bewertung im Bild: G.lmVorhersage der globalen Waende (rahmen -1, nicht 'kandidat'), die die Sichtprobe in der
//    Draufsicht bestehen (Oberkante oder Bodenkante im Hoehenfenster), in gleichmaessig gewaehlten Schluesselbildern;
//    je waagerechter Beob (art decke, boden, stoer) min(d, tau)² beider Enden zur naechsten vorhergesagten Kante
//    gleicher Art mit Ueberlapp. Wandmodell von M5 (kantenVon, lmVorhersage): eine Wand traegt Ober- und Bodenkante;
//    A/B/iv der Vorhersage ist die Oberkante (art decke bei h 'c', 'f', 'lokal'; art stoer bei Zahl), sichtbar gilt nur
//    fuer sie; unten = {A, B, iv} ist die Bodenkante (art boden, null bei Stoerern), auch wenn sichtbar = false. Die
//    Art der Beob setzt M5 aus der Kante, der sie zugeordnet ist (artFuer). Gezaehlt wird ueber die Beob, die in
//    irgendeiner Auswertung derselben Stufe passen (sonst verduennen Beob ausserhalb der globalen Karte das
//    Verhaeltnis). Stufe A: alle Kandidaten bei ty0 = hC - hLok.hC (sonst g0.ty) auf wenigen Bildern (<= 25 % der
//    Arbeit), gekappt bei REG.tauA·tau: die Kandidaten sind dort nur in der Draufsicht verfeinert und ty0 traegt hLok.sHC,
//    mit tau allein passt fast nichts und die Rangfolge waere Zufall (gemessen am ausgelieferten Stand: T3 lokal 3 cm / 1°
//    mit Platzhalter 1 falsch angenommen bei tau, 0 bei 3·tau; echtes M5 0 und 0). Stufe B: Bestes und Gegenspieler aus A auf so vielen Bildern, wie die restliche Arbeit reicht, ty 1D
//    nachgefuehrt (Schritte tyRaster · 4, 2, 1, mit hLok.sHC <= 2 cm nur 1; hoechstens tyWeit), dann Gauss-Newton im
//    Bild (2 Schritte; die beste danach mit der Restarbeit bis REG.nachIter weitere, bis der Restschritt klein ist).
//    Inselwaende zaehlen erst ab 3 passenden Beob aus >= 2 Bildern.
// 4. hyp: zuerst die beiden aus Stufe B (vergleichbar), dann die uebrigen der Vorauswahl (Kosten aus Stufe A).
//    Annahme bei verhaeltnis = kosten(Gegenspieler)/kosten(beste) >= annehmen und >= minSeg passenden Segmenten aus
//    >= minRicht Richtungen und nur, wenn die beste fest ist (ueber 3.2.2 b hinaus, strenger): Restschritt des Gauss-Newton
//    an ihr klein (REG.konv: 1 cm an mitte, 0,1°, 0,5 cm Hoehe) UND bestimmt (N^-1 bei 1 px: groesste Halbachse der Lage
//    <= rivalLage, Gier <= rivalWinkel; sonst laege ein Gegenspieler in ihrer eigenen Unsicherheit). Gemessen auf T3:
//    vor den Ersatzwaenden nahm 'ohne lokale Karte' ohne diese Bedingung eine Lage 21 cm daneben an (sigma 1,8 m); mit
//    ihnen aendert sie auf T3 kein Ergebnis (Sicherung); richtige Annahmen: sigma <= 6,4 cm, Restschritt <= 1 cm. Eine schon gewaehlte gleiche Lage bleibt bis verhaeltnis < loesen. Ohne Gegenspieler
//    keine Annahme. Arbeit: hoechstens arbeit Vorhersagen; die Bildzahlen werden vorab so gewaehlt, dass sie reicht.
// 5. (R2) Kette und Tor (Z7): Mitte, Gier und Modus ganz kommen aus der Vorhersage der Kette vom naechsten verbundenen
//    Abschnitt (ketteVon, beide Richtungen); jede Hypothese traegt ihren Abstand zur Kette, eine sonst angenommene beste wird
//    verworfen, wenn sie ausserhalb 3 sigma der Kette liegt (Lage mit Gierhebel zur Kameramitte, siehe torHebel). Wege (Z6):
//    'segmente' wie oben, 'erfassungen' nur mit nutzer-Beob gegen Erfassungs-Waende anderer Abschnitte, 'beide' beides mit
//    geteilter Arbeit. Distanzfeld nur im Suchbereich (Z8).
// Schreibt abschnitt.reg und bei Annahme abschnitt.g0.
const REG_DEF={gier:'haupt', dGrad:2, raster:[0.10, 0.02], weit:2.0, tyWeit:0.20, tyRaster:0.02, tau:3, maxBilder:40, annehmen:1.25, loesen:1.10,
  minSeg:20, minRicht:2, rivalLage:0.15, rivalWinkel:2, maxHyp:4, arbeit:2000, ivPlus:24,
  weg:'segmente', kettentor:true, torSP:Infinity, torP:0.30, torYDeg:5, torHebel:true, ganzVerh:0, minErf:6, minErfJe:2, minNutzer:2, anteilErf:0.5, erfTyFest:true, erfGanz:false};
// ganzVerh (Z7 "bei Suche ueber die ganze Karte Verhaeltnis >= 2") ist aus (0): gemessen rep/r2/t3-tor.mjs verwarf 2 auf T3 eine
// richtige Hypothese (luecken s211 ab 4, sP 3,5 m, Verhaeltnis 1,35 und 1,97); die bekannte falsche Annahme im Modus ganz auf
// A6 (ab 8, 161 cm / 89°) hatte Verhaeltnis 4,2 und waere nicht verworfen worden. Rueckname nach der Regel in Z7.
// torSP unendlich und torHebel (statt Tor nur bei sP <= 0,5 m mit 3·sP): in der Nachstellung rep/kern/sim.mjs widersprachen
// mit 0,5 m angenommene Registrierungen in 8 von 30 Laeufen der Kette (9 Annahmen, Kette sP 0,52-1,07 m, 1,4-2,3 m und
// 71-166° daneben), mit dem Tor fuer jedes sP in 1 von 30 (1,62 m gegen 3·sP = 1,61 m). Ohne Hebel verwarf das Tor fuer jedes sP auf
// T3 17 richtige Hypothesen (luecken, Gierunsicherheit bis 136°), mit Hebel keine; dazu faellt die eine falsche Annahme des
// Stresstests T3 schwer (s41 ab 5, 180 cm / 90°) weg. Gemessen rep/r2/t3-tor.mjs, rep/r2/sim-matrix-H.txt.
const REG={tPlan:0.15, zelle:0.05, verl:0.30, seiteDeg:10, stich:120, randDeg:8, sichtMax:12, icp:6, versuche:30, ersatz:60, tauA:3, konv:{p:0.01, psiDeg:0.1, y:0.005}, nachIter:4,
  dfRand:1.0, dfMax:1<<26, erfNah:1.0, erfWinkelDeg:15};
// Spanne laengs u ueber die Intervalle der Oberkante (iv) und der Bodenkante (boden), wie ivListe in M5
const ivSpanne=W=>{ let a=Infinity, b=-Infinity;
  for(const x of [...(W.iv||[]), ...(W.boden||[])]){ const s0=Array.isArray(x) ? x[0] : x.s0, s1=Array.isArray(x) ? x[1] : x.s1; if(s0<a) a=s0; if(s1>b) b=s1; }
  return a<b ? [a, b] : null; };
const haupt90=L=>{ let C=0, S=0; for(const [phi, w] of L){ C+=w*Math.cos(4*phi); S+=w*Math.sin(4*phi); } return C*C+S*S>1e-12 ? Math.atan2(S, C)/4 : null; };
// 4x4-System N x = b (Gauss mit Spaltenpivot); null bei singulaer
const loese4=(N,b)=>{ const M=[0,1,2,3].map(r=>[N[4*r], N[4*r+1], N[4*r+2], N[4*r+3], b[r]]);
  for(let k=0;k<4;k++){ let p=k; for(let r=k+1;r<4;r++) if(Math.abs(M[r][k])>Math.abs(M[p][k])) p=r; if(!(Math.abs(M[p][k])>1e-15)) return null; [M[k], M[p]]=[M[p], M[k]];
    for(let r=k+1;r<4;r++){ const f=M[r][k]/M[k][k]; for(let c=k;c<5;c++) M[r][c]-=f*M[k][c]; } }
  const x=[0, 0, 0, 0]; for(let k=3;k>=0;k--){ let v=M[k][4]; for(let c=k+1;c<4;c++) v-=M[k][c]*x[c]; x[k]=v/M[k][k]; }
  return x; };
// Ersatzwaende aus Beob (Vorfilter ohne lokale Waende): je Beob die Strecke ihrer Enden, gehoben auf die erwartete Hoehe im
// Bezug (Decke hD, Boden hB; Stoerer nicht), Normale zur Kamera hin; hoechstens REG.ersatz Beob, gleichmaessig gewaehlt.
const gehoben=(beob,hD,hB)=>{ const L=[], B=beob.filter(b=>b.art==='decke' || b.art==='boden'), m=Math.min(B.length, REG.ersatz);
  for(let i=0;i<m;i++){ const b=B[m>1 ? Math.round(i*(B.length-1)/(m-1)) : 0], h=b.art==='decke' ? hD : hB; if(!Number.isFinite(h)) continue;
    const P=[b.da, b.db].map(d=>{ const lam=(h-b.c[1])/d[1]; return lam>0 && lam*Math.hypot(d[0], d[2])<REG.sichtMax ? [b.c[0]+lam*d[0], b.c[2]+lam*d[2]] : null; });
    if(!P[0] || !P[1]) continue; const ux=P[1][0]-P[0][0], uz=P[1][1]-P[0][1], l=Math.hypot(ux, uz); if(l<0.1) continue;
    let n=[-uz/l, ux/l]; if(n[0]*(b.c[0]-P[0][0])+n[1]*(b.c[2]-P[0][1])<0) n=[-n[0], -n[1]];
    const phi=((Math.atan2(n[1], n[0])%(2*Math.PI))+2*Math.PI)%(2*Math.PI), u=G.wandU(phi), s0=u[0]*P[0][0]+u[1]*P[0][1], s1=u[0]*P[1][0]+u[1]*P[1][1];
    L.push({phi, rho:n[0]*P[0][0]+n[1]*P[0][1], iv:[{s0:Math.min(s0, s1), s1:Math.max(s0, s1)}]}); }
  return L; };
const gUm=(psi,pv,q,ty)=>{ const c=Math.cos(psi), s=Math.sin(psi); return {psi, tx:q[0]-(c*pv[0]-s*pv[1]), ty, tz:q[1]-(s*pv[0]+c*pv[1])}; };
// Kanten einer Vorhersage p der Wand W (Wandmodell M5, siehe 3. unten): [[art, {A, B, iv}]], Oberkante vor Bodenkante
const REG_ART=new Set(['decke', 'boden', 'stoer']);
const kantenAus=(W,p)=>{ const K=[]; if(!p) return K;
  if(p.sichtbar && p.A && p.B) K.push([typeof W.h==='number' ? 'stoer' : 'decke', p]);
  if(p.unten && p.unten.A && p.unten.B) K.push(['boden', p.unten]);
  return K; };
// Vorhersage der Kette (Z7, 19.2) vom naechsten verbundenen oder lockeren Abschnitt c (mit g) ueber die Bindungen der Schnitte
// dazwischen, je Schnitt relativ rel = ketteG(s, Einheit) (pose dG, kamera Kamera und Blick stetig, rest Einheit):
// rueckwaerts g_ab = gBei(c, s.t) ∘ rel_c ∘ ... ∘ rel_(ab-1) (zurueck: weiter bei zurueckZu, ohne rel), vorwaerts
// g_ab = gBei(c, s.t) ∘ rel_(c-1)^-1 ∘ ... ∘ rel_ab^-1 (zurueck bricht ab). sP, sY der Bindungen auf dem Weg quadratisch
// summiert; gewaehlt die Richtung mit kleinerem sP (gleich: rueckwaerts). null, wenn kein verbundener Abschnitt erreichbar
// ist. Haengt nicht an g0 der Zwischenabschnitte (M4 und M10 ueberschreiben g0 bei Annahme mit der Hypothese).
const verbAb=V=>!!(V && V.g && (V.stufe==='verbunden' || V.stufe==='locker'));
const endlich=g=>!!g && Number.isFinite(g.psi) && Number.isFinite(g.tx) && Number.isFinite(g.ty) && Number.isFinite(g.tz);
const ketteVon=(KZ,ab)=>{ const AB=KZ.abschnitte||[], S=KZ.schnitte||[], gut=s=>!!(s && s.bindung && Number.isFinite(s.bindung.sP) && Number.isFinite(s.bindung.sY));
  let best=null, k=ab, R=NULLG(), s2=0, y2=0;
  for(let n=0;n<=AB.length && k>0;n++){ const s=S[k-1]; if(!gut(s)) break; s2+=s.bindung.sP*s.bindung.sP; y2+=s.bindung.sY*s.bindung.sY;
    const z=s.klasse==='zurueck' ? s.zurueckZu : k-1; if(!(z>=0 && z<AB.length)) break;
    if(s.klasse!=='zurueck'){ const r=ketteG(s, NULLG(), null); if(!endlich(r)) break; R=G.gKomp(r, R); }
    if(verbAb(AB[z])){ const gc=G.gBei(AB[z], s.t); if(endlich(gc)) best={g:G.gKomp(gc, R), sP:Math.sqrt(s2), sY:Math.sqrt(y2), c:z, richtung:'rueck'}; break; }
    k=z; }
  R=NULLG(); s2=0; y2=0;
  for(k=ab;k<AB.length-1;k++){ const s=S[k]; if(!gut(s) || s.klasse==='zurueck') break; s2+=s.bindung.sP*s.bindung.sP; y2+=s.bindung.sY*s.bindung.sY;
    const r=ketteG(s, NULLG(), null); if(!endlich(r)) break; R=G.gKomp(G.gInv(r), R);
    if(verbAb(AB[k+1])){ const gc=G.gBei(AB[k+1], s.t), sP=Math.sqrt(s2); if(endlich(gc) && (!best || sP<best.sP)) best={g:G.gKomp(gc, R), sP, sY:Math.sqrt(y2), c:k+1, richtung:'vor'}; break; } }
  return best; };
// Kette nach F0 (Z5, 19.2 und Vertrag 19.3, ruft M10 bei der Kernbildung): g0_s := g_kern ∘ g0_kern^-1 ∘ g0_s fuer alle s mit
// g0; g_kern = Einheit (ohne Orakel, oder M10 setzt g erst danach), sonst die schon gesetzte Lage des Kerns. Schreibt NUR g0;
// ein zweiter Aufruf aendert nichts mehr (g0_kern ist dann g_kern).
G.ketteNachF0=(abschnitte,kern)=>{ const K=abschnitte && abschnitte[kern]; if(!K || !K.g0) return abschnitte;
  const M=G.gKomp(K.g || NULLG(), G.gInv(K.g0));
  for(const A of abschnitte) if(A && A.g0) A.g0=G.gKomp(M, A.g0);
  return abschnitte; };
G.registriere=(KZ,ab,o0={})=>{
  const o={...REG_DEF, ...o0}, A=KZ.abschnitte[ab], arbeit={vorhersagen:0, bilder:0, bilderA:0, kandidaten:0, plan:0, verfeinert:0, wege:{}};
  const alle0=KZ.waende instanceof Map ? [...KZ.waende.values()] : (KZ.waende || []);
  // Z8 (19.2): Wegspanne = Diagonale der Kameralagen aller Bilder (je im eigenen Bezug) bzw. der verbundenen Abschnitte in
  // F0, die groessere; Waende, deren Intervall laenger ist als Wegspanne + ivPlus, fallen aus der Registrierung. ivPlus 24 m =
  // 2·REG.sichtMax (beidseits gesehen) statt 2 m: gemessen (rep/r2) verwarf 2 m frueh in der Sitzung (Wegspanne 1-5 m) lokale
  // Waende von 6-19 m und aenderte die Hypothesen und Annahmen in A6; mit 24 m fallen nur Intervalle >= 29 m (bis 382 m) aus,
  // und mit Z8 allein (ohne Z7) bleiben die Annahmen von S0 auf A6/A8 'beide' gleich (Ausschnitt des Felds allein: alle
  // 309 Aufrufe bitgleich).
  const span=[Infinity, Infinity, -Infinity, -Infinity], spanF=[Infinity, Infinity, -Infinity, -Infinity], dazu=(s,x,z)=>{ s[0]=Math.min(s[0], x); s[1]=Math.min(s[1], z); s[2]=Math.max(s[2], x); s[3]=Math.max(s[3], z); };
  const mAb=[0, 0]; let nAb=0;
  for(const B of (KZ.bilder instanceof Map ? KZ.bilder.values() : Object.values(KZ.bilder||{}))){ const c=B && B.camTo; if(!c) continue; dazu(span, c[12], c[14]);
    if(B.ab===ab){ mAb[0]+=c[12]; mAb[1]+=c[14]; nAb++; }
    const V=KZ.abschnitte[B.ab]; if(V && V.g && (V.stufe==='verbunden' || V.stufe==='locker')){ const g=G.gBei(V, B.t); if(g){ const p=G.gPlan(g, [c[12], c[14]]); dazu(spanF, p[0], p[1]); } } }
  const diag=s=>s[2]>=s[0] ? Math.hypot(s[2]-s[0], s[3]-s[1]) : 0, wegSpanne=Math.max(diag(span), diag(spanF));
  const alle=alle0.filter(W=>{ const s=ivSpanne(W); return !s || s[1]-s[0]<=wegSpanne+o.ivPlus; });
  arbeit.df={wegSpanne, lang:alle0.length-alle.length, langMax:alle0.reduce((m,W)=>{ const s=ivSpanne(W); return s && s[1]-s[0]>wegSpanne+o.ivPlus ? Math.max(m, s[1]-s[0]) : m; }, 0)};
  const opt=KZ.opt || {};
  const kamVon=(k,B)=>({k, t:B.t, ab, camTo:B.camTo, proj:B.proj || opt.proj, w:B.w || opt.w, h:B.h || opt.h, flipY:B.flipY ?? opt.flipY ?? false, f:B.f});
  // Kette (Z7): Vorhersage vom naechsten verbundenen Abschnitt (ketteVon); sie ist Mitte von Gier und Raster (statt g0, das
  // bei Annahme ueberschrieben wird und vor ketteNachF0 in B_0 lag), ihr sP entscheidet ueber den Modus ganz, und das
  // Kettentor misst jede Hypothese an der Kameramitte des Abschnitts (alle Bilder) gegen sie. Ohne Kette: g0, sP unendlich.
  const g0=A.g0 || NULLG(), schnitt=ab>0 && KZ.schnitte ? KZ.schnitte[ab-1] : null, K=ketteVon(KZ, ab), gK=K ? K.g : g0;
  const pv0=schnitt && Number.isFinite(schnitt.ca[0]) ? [schnitt.ca[0], schnitt.ca[2]] : null;
  const ty0=A.hLok && Number.isFinite(A.hLok.hC) && Number.isFinite(KZ.hC) ? KZ.hC-A.hLok.hC : gK.ty;
  const sP=K ? K.sP : Infinity, ganz=1.5*sP>o.weit, eng=!!o.kettentor && !!K && K.sP<=o.torSP;
  arbeit.ganz=ganz;
  if(nAb){ mAb[0]/=nAb; mAb[1]/=nAb; }
  const abstAb=(g,h)=>{ const p=G.gPlan(g, mAb), q=G.gPlan(h, mAb); return [Math.hypot(p[0]-q[0], p[1]-q[1]), Math.abs(wrap(g.psi-h.psi))]; };
  const kette=K ? (()=>{ const [dP0, dY0]=abstAb(g0, K.g); return {sP:K.sP, sY:K.sY, c:K.c, richtung:K.richtung, dP0, dY0}; })() : null;
  arbeit.kette=kette;
  // o.torHebel: Lage-Toleranz mit dem Hebel der Gier vom Schnitt zur Kameramitte (sqrt(sP² + (L·min(sY, 1))²)), sonst 3·sP
  const pvK=K && K.richtung==='vor' ? (KZ.schnitte && KZ.schnitte[ab] && KZ.schnitte[ab].cb) : (schnitt && schnitt.ca), hebel=pvK && Number.isFinite(pvK[0]) && nAb ? Math.hypot(mAb[0]-pvK[0], mAb[1]-pvK[2]) : 0;
  const tolP=K ? Math.max(o.torP, 3*(o.torHebel ? Math.hypot(K.sP, hebel*Math.min(K.sY, 1)) : K.sP)) : Infinity, tolY=K ? Math.max(o.torYDeg*D2R, 3*K.sY) : Infinity;
  const tor=g=>{ if(!K) return {dP:null, dY:null, veto:null}; const [dP, dY]=abstAb(g, K.g);
    return {dP, dY, veto:eng && (dP>tolP || dY>tolY) ? 'kette' : null}; };
  const fertig=(hyp,gewaehlt,verhaeltnis,weg=null,veto=null)=>{ A.reg={hyp, gewaehlt, verhaeltnis, versuche:(A.reg && A.reg.versuche || 0)+1, weg, veto, kette};
    if(gewaehlt>=0) A.g0={...hyp[gewaehlt].g}; return {hyp, gewaehlt, verhaeltnis, arbeit, weg, veto, kette}; };
  if(typeof G.lmVorhersage!=='function') return fertig([], -1, 0);
  // Quellen und Ziele je Weg (Z6): segmente wie bisher (alle waagerechten Beob gegen globale Waende ausser 'kandidat';
  // o.gw nur fuer die Nachstellung rep/kern/sim.mjs), erfassungen nur nutzer-Beob gegen globale Waende mit >= minNutzer
  // nutzer-Beob ANDERER Abschnitte (gezaehlt wie nutzerZahl in M5: b.nutzer === true und b.L === W.id, dazu b.ab != ab).
  // Ohne die Bedingung b.ab != ab registrierte sich ein Abschnitt nach einer frueheren Annahme an seinen eigenen, inzwischen
  // global gefuehrten Erfassungs-Waenden (gemessen A8 ab 11: Runde 182 7,4 cm, Runde 187 an 2 eigenen Waenden 29,5 cm,
  // Orakel 2,1 cm).
  const gwF=typeof o.gw==='function' ? o.gw : W=>W.zustand!=='kandidat';
  const nutzerZahl=(W,fremd)=>{ let n=0; for(const id of (W.beob||[])){ const b=KZ.beob && KZ.beob[id]; if(b && b.nutzer===true && b.L===W.id && (!fremd || b.ab!==ab)) n++; } return n; };
  const quelle=nur=>{ const m=new Map(); for(const b of (KZ.beob||[])) if(b.ab===ab && REG_ART.has(b.art) && b.da && b.db && (!nur || b.nutzer===true)){ let l=m.get(b.k); if(!l) m.set(b.k, l=[]); l.push(b); } return m; };
  // Ein Weg: Schritte 1-4 mit Quelle beobJe, Ziel GW und lokalen Waenden LW, hoechstens bis arbeit.vorhersagen = lim
  // (der Rumpf bleibt ohne zusaetzliche Einrueckung, damit er zeilengleich mit dem Stand vor R2 vergleichbar ist)
  const lauf=(weg,GW,beobJe,LW,lim)=>{
  const erf=weg==='erfassungen', budget=lim-arbeit.vorhersagen, info=arbeit.wege[weg]={nZiel:GW.length, nLokal:LW.length, nQuelle:[...beobJe.values()].reduce((s,l)=>s+l.length, 0)};
  const alleBilder=[...(KZ.bilder instanceof Map ? KZ.bilder.entries() : Object.entries(KZ.bilder||{}))]
    .filter(([k,B])=>B.ab===ab && B.schluessel!==false && beobJe.has(+k)).map(([k,B])=>[+k, B]).sort((a,b)=>a[0]-b[0]);
  if(!GW.length || !alleBilder.length) return null;
  const mitte=[0, 0]; for(const [,B] of alleBilder){ mitte[0]+=B.camTo[12]/alleBilder.length; mitte[1]+=B.camTo[14]/alleBilder.length; }
  const pv=pv0 || mitte, q0=G.gPlan(gK, pv);
  const abst=(g,h)=>{ const p=G.gPlan(g, mitte), q=G.gPlan(h, mitte); return [Math.hypot(p[0]-q[0], p[1]-q[1]), Math.abs(wrap(g.psi-h.psi))]; };
  const verschieden=(g,h)=>{ const [d, w]=abst(g, h); return d>o.rivalLage || w>o.rivalWinkel*D2R; };
  // ---- 1 Gieren
  const laenge=W=>{ const s=ivSpanne(W); return s[1]-s[0]; };
  const psiG=haupt90(GW.map(W=>[W.phi, laenge(W)]));
  let psiL=LW.length ? haupt90(LW.map(W=>[W.phi, laenge(W)])) : null;
  if(psiL==null && A.psi0!=null) psiL=typeof A.psi0==='number' ? A.psi0 : A.psi0.psi;
  if(psiL==null){ const L=[]; for(const l of beobJe.values()) for(const b of l){ const r=beobRichtung(b); if(Number.isFinite(r)) L.push([r, 1]); } psiL=haupt90(L); }
  const haupt=o.gier==='haupt' && psiG!=null && psiL!=null, basis=haupt ? gK.psi+wrap90(psiG-psiL-gK.psi) : gK.psi;
  const gieren=haupt ? [0, 1, 2, -1].map(k=>basis+k*VIERTEL) : [basis];
  // ---- 2 Vorfilter in der Draufsicht (ohne lokale Waende mit Ersatzwaenden aus den gehobenen Beob)
  let kand=[];
  const LV=LW.length ? LW : gehoben([...beobJe.values()].flat(), KZ.hC-ty0, (KZ.hF ?? 0)-ty0);
  arbeit.ersatz=LW.length ? 0 : LV.length;
  if(LV.length){
    const lges=LV.reduce((s,W)=>s+laenge(W), 0), schritt=Math.max(0.1, lges/REG.stich), stich=[];
    for(const W of LV){ const sp=ivSpanne(W), n=G.wandN(W.phi), u=G.wandU(W.phi), m=Math.max(1, Math.round((sp[1]-sp[0])/schritt));
      for(let i=0;i<=m;i++){ const s=sp[0]+(sp[1]-sp[0])*i/m; stich.push({x:n[0]*W.rho+u[0]*s-pv[0], z:n[1]*W.rho+u[1]*s-pv[1], phi:W.phi}); } }
    const klassen=[]; for(const W of [...GW].sort((a,b)=>a.phi-b.phi)){ let k=klassen.find(c=>Math.abs(wrap(W.phi-c.phi))<=REG.seiteDeg*D2R); if(!k) klassen.push(k={phi:W.phi, W:[]}); k.W.push(W); }
    const TP0=REG.tPlan, seg=GW.map(W=>{ const sp=ivSpanne(W), n=G.wandN(W.phi), u=G.wandU(W.phi), a=sp[0]-REG.verl, b=sp[1]+REG.verl;
      return {W, n, u, a, b, P:[[n[0]*W.rho+u[0]*a, n[1]*W.rho+u[1]*a], [n[0]*W.rho+u[0]*b, n[1]*W.rho+u[1]*b]]}; });
    let x0=Infinity, z0=Infinity, x1=-Infinity, z1=-Infinity;
    for(const S of seg) for(const p of S.P){ x0=Math.min(x0, p[0]); x1=Math.max(x1, p[0]); z0=Math.min(z0, p[1]); z1=Math.max(z1, p[1]); }
    // Suchbereich: +-weit um die Kette; ist die Bindung weicher (1,5·sP > weit, z. B. nach einer Pause), die ganze globale
    // Karte (+1 m) mit groeberem Raster und entsprechend breiterer Kappung im Vorfilter. sP, ganz: Kette (Z7, oben).
    let qc=q0, R=o.weit, st=o.raster[0];
    if(ganz){ qc=[(x0+x1)/2, (z0+z1)/2]; R=Math.max(x1-x0, z1-z0)/2+1; st=Math.max(o.raster[0], R/25); }
    const nR=Math.round(R/st), TP=Math.max(TP0, st);
    // Z8 (19.2): Feld nur ueber die Huelle der gedrehten Stichproben um den Suchbereich (jeder Rasterpunkt liegt in
    // qc +- nR·st, jede Stichprobe hoechstens rS von ihm) plus REG.dfRand fuer die Verfeinerung. Die Zellen bleiben auf dem
    // Gitter des ganzen Felds (Ursprung ox, oz = Huelle der Waende - TP; Ausschnitt ab Zelle jx, jz), darum sind die Werte im
    // Ausschnitt bitgleich. Im Modus ganz deckt der Suchbereich die ganze Karte; dort und allgemein begrenzt REG.dfMax die
    // Zellen ueber alle Seitenklassen (dann groeberes Gitter).
    const ox=x0-TP, oz=z0-TP; let Z=REG.zelle, jx=0, jz=0, nx=0, nz=0;
    if(!ganz){ let rS=0; for(const p of stich) rS=Math.max(rS, Math.hypot(p.x, p.z)); const m=rS+nR*st+REG.dfRand;
      x0=Math.max(x0, qc[0]-m); x1=Math.min(x1, qc[0]+m); z0=Math.max(z0, qc[1]-m); z1=Math.min(z1, qc[1]+m); }
    const gitter=()=>{ jx=Math.max(0, Math.floor((x0-TP-ox)/Z)); jz=Math.max(0, Math.floor((z0-TP-oz)/Z));
      nx=Math.max(0, Math.ceil((x1+TP-ox)/Z)+1-jx); nz=Math.max(0, Math.ceil((z1+TP-oz)/Z)+1-jz); };
    gitter();
    if(nx*nz*klassen.length>REG.dfMax){ Z*=Math.sqrt(nx*nz*klassen.length/REG.dfMax); gitter(); }
    Object.assign(arbeit.df, {ganz, nx, nz, nk:klassen.length, zelle:Z, huelle:[ox+TP, oz+TP, ...[0, 1].map(i=>seg.reduce((m,S)=>Math.max(m, S.P[0][i], S.P[1][i]), -Infinity))]});
    const DF=klassen.map(k=>{ const F=new Float32Array(nx*nz).fill(TP);
      for(const S of seg){ if(!k.W.includes(S.W)) continue;
        const ix0=Math.max(jx, Math.floor((Math.min(S.P[0][0], S.P[1][0])-TP-ox)/Z)), ix1=Math.min(jx+nx-1, Math.ceil((Math.max(S.P[0][0], S.P[1][0])+TP-ox)/Z));
        const iz0=Math.max(jz, Math.floor((Math.min(S.P[0][1], S.P[1][1])-TP-oz)/Z)), iz1=Math.min(jz+nz-1, Math.ceil((Math.max(S.P[0][1], S.P[1][1])+TP-oz)/Z));
        for(let iz=iz0;iz<=iz1;iz++) for(let ix=ix0;ix<=ix1;ix++){ const x=ox+ix*Z, z=oz+iz*Z, s=S.u[0]*x+S.u[1]*z; if(s<S.a || s>S.b) continue;
          const d=Math.abs(S.n[0]*x+S.n[1]*z-S.W.rho), q=(iz-jz)*nx+ix-jx; if(d<F[q]) F[q]=d; } }
      return F; });
    const kost=(psi,qx,qz)=>{ const c=Math.cos(psi), s=Math.sin(psi); let e=0;
      for(const p of stich){ let ki=-1; for(let k=0;k<klassen.length;k++) if(Math.abs(wrap(p.phi+psi-klassen[k].phi))<=REG.seiteDeg*D2R){ ki=k; break; }
        if(ki<0){ e+=TP*TP; continue; }
        const ix=Math.round((c*p.x-s*p.z+qx-ox)/Z)-jx, iz=Math.round((s*p.x+c*p.z+qz-oz)/Z)-jz, d=ix<0 || iz<0 || ix>=nx || iz>=nz ? TP : DF[ki][iz*nx+ix]; e+=d*d; }
      return e; };
    const roh=[];
    for(const ps0 of gieren) for(const dp of [-o.dGrad, 0, o.dGrad]){ const psi=ps0+dp*D2R, c=Math.cos(psi), s=Math.sin(psi);
      const ki=stich.map(p=>{ for(let k=0;k<klassen.length;k++) if(Math.abs(wrap(p.phi+psi-klassen[k].phi))<=REG.seiteDeg*D2R) return k; return -1; });
      const rx=stich.map(p=>c*p.x-s*p.z), rz=stich.map(p=>s*p.x+c*p.z);
      for(let a=-nR;a<=nR;a++) for(let b=-nR;b<=nR;b++){ const qx=qc[0]+a*st, qz=qc[1]+b*st; let e=0;
        for(let i=0;i<stich.length;i++){ const k=ki[i]; if(k<0){ e+=TP*TP; continue; }
          const ix=Math.round((rx[i]+qx-ox)/Z)-jx, iz=Math.round((rz[i]+qz-oz)/Z)-jz, d=ix<0 || iz<0 || ix>=nx || iz>=nz ? TP : DF[k][iz*nx+ix]; e+=d*d; }
        roh.push({e, psi, q:[qx, qz]}); } }
    arbeit.plan=roh.length;
    roh.sort((a,b)=>a.e-b.e);
    for(const x of roh) x.g=gUm(x.psi, pv, x.q, ty0);
    // Punkt-zu-Linie-Verfeinerung (Draufsicht), Drehung um den Schwerpunkt der Stichproben
    const icp=g=>{ for(let it=0;it<REG.icp;it++){ const c=Math.cos(g.psi), s=Math.sin(g.psi), Q=stich.map(p=>[c*(p.x+pv[0])-s*(p.z+pv[1])+g.tx, s*(p.x+pv[0])+c*(p.z+pv[1])+g.tz]);
        const m=[0, 0]; for(const q of Q){ m[0]+=q[0]/Q.length; m[1]+=q[1]/Q.length; }
        const N=[0,0,0, 0,0,0, 0,0,0], b=[0, 0, 0]; let n=0;
        stich.forEach((p,i)=>{ const q=Q[i]; let best=null;
          for(const S of seg){ if(Math.abs(wrap(p.phi+g.psi-S.W.phi))>REG.seiteDeg*D2R) continue; const sl=S.u[0]*q[0]+S.u[1]*q[1]; if(sl<S.a || sl>S.b) continue;
            const r=S.n[0]*q[0]+S.n[1]*q[1]-S.W.rho; if(Math.abs(r)<TP0 && (!best || Math.abs(r)<Math.abs(best.r))) best={r, n:S.n}; }
          if(!best) return; n++; const J=[best.n[0]*(-(q[1]-m[1]))+best.n[1]*(q[0]-m[0]), best.n[0], best.n[1]];
          for(let x=0;x<3;x++){ b[x]-=J[x]*best.r; for(let y=0;y<3;y++) N[3*x+y]+=J[x]*J[y]; } });
        if(n<3) break; for(let x=0;x<3;x++) N[4*x]+=1e-6;
        const det=N[0]*(N[4]*N[8]-N[5]*N[7])-N[1]*(N[3]*N[8]-N[5]*N[6])+N[2]*(N[3]*N[7]-N[4]*N[6]); if(!(Math.abs(det)>1e-18)) break;
        const sol=[0,1,2].map(k=>{ const M=N.slice(); for(let r=0;r<3;r++) M[3*r+k]=b[r];
          return (M[0]*(M[4]*M[8]-M[5]*M[7])-M[1]*(M[3]*M[8]-M[5]*M[6])+M[2]*(M[3]*M[7]-M[4]*M[6]))/det; });
        const dc=Math.cos(sol[0]), ds=Math.sin(sol[0]), tx=g.tx-m[0], tz=g.tz-m[1];
        g={psi:g.psi+sol[0], tx:dc*tx-ds*tz+m[0]+sol[1], ty:g.ty, tz:ds*tx+dc*tz+m[1]+sol[2]};
        if(Math.abs(sol[0])<1e-6 && Math.hypot(sol[1], sol[2])<1e-5) break; }
      return g; };
    // Kandidaten: Rasterpunkte in der Reihenfolge der Plan-Kosten (zuerst der beste, dann der beste je Gierlage), jeder
    // verfeinert; wer in einen schon gefundenen laeuft, faellt weg; hoechstens REG.versuche Verfeinerungen. Bleibt nur
    // einer, ist der Gegenspieler der beste Rasterpunkt ausserhalb rivalLage / rivalWinkel (unverfeinert).
    const fein=[], versucht=[];
    const versuch=x=>{ if(!x || fein.length>=2*o.maxHyp || versucht.length>=REG.versuche || !versucht.every(y=>verschieden(x.g, y.g))) return;
      versucht.push(x); const g=icp(x.g); if(fein.every(f=>verschieden(f.g, g))){ const p=G.gPlan(g, pv); fein.push({g, e:kost(g.psi, p[0], p[1])}); } };
    versuch(roh[0]); for(const ps0 of gieren) versuch(roh.find(y=>Math.abs(wrap(y.psi-ps0))<=o.dGrad*D2R+1e-9));
    for(const x of roh){ if(fein.length>=2*o.maxHyp || versucht.length>=REG.versuche) break; versuch(x); }
    fein.sort((a,b)=>a.e-b.e);
    if(fein.length===1){ const x=roh.find(y=>verschieden(y.g, fein[0].g)); if(x) fein.push({g:x.g, e:x.e}); }
    arbeit.verfeinert=versucht.length;
    kand=fein.map(x=>x.g);
  } else kand=gieren.map(psi=>gUm(psi, pv, q0, ty0));
  arbeit.kandidaten=kand.length;
  // ---- 3 Bewertung im Bild
  const wIdx=new Map(GW.map((W,i)=>[W, i]));
  const gleichm=(n,m)=>m>=n ? Array.from({length:n}, (_,i)=>i) : Array.from({length:m}, (_,i)=>m>1 ? Math.round(i*(n-1)/(m-1)) : (n>>1));
  const kams=gleichm(alleBilder.length, Math.min(o.maxBilder, alleBilder.length)).map(i=>alleBilder[i]).map(([k,B])=>{ const kam=kamVon(k, B), inv=G.m4inv(kam.camTo), L=beobJe.get(k);
    const px=d=>{ const c=kam.camTo, v=G.m4vec(inv, [c[12]+d[0], c[13]+d[1], c[14]+d[2], 1]), q=G.m4vec(kam.proj, v);
      return q[3]>1e-9 ? G.ndcToPix(q[0]/q[3], q[1]/q[3], kam.w, kam.h, kam.flipY) : null; };
    return {kam, L, P:L.map(b=>[px(b.da), px(b.db)])}; });
  // Sichtprobe in der Draufsicht (zaehlt nicht als Vorhersage): freie Seite, Abstand, Azimut im Faecher der Kamera
  // (Halbwinkel aus proj und der Neigung: oben im Bild weitet sich der Faecher), Elevation der Ober- ODER der Bodenkante
  // im Hoehenfenster (Hoehen wie hOben/hRefF in M5: Zahl = eigene, 'lokal' = hLokal.h, sonst hC; Boden hF, nicht bei Zahl).
  const hoehenW=W=>typeof W.h==='number' ? [W.h] : [W.h==='lokal' && W.hLokal ? W.hLokal.h : KZ.hC, KZ.hF ?? 0];
  const sieht=(g,kam,W)=>{ const m=kam.camTo, c=G.gPlan(g, [m[12], m[14]]), n=G.wandN(W.phi);
    if(n[0]*c[0]+n[1]*c[1]-W.rho<-0.05) return false;
    const sp=ivSpanne(W), u=G.wandU(W.phi), bl=G.blickPlan(m)+g.psi, P=s=>[n[0]*W.rho+u[0]*s-c[0], n[1]*W.rho+u[1]*s-c[1]];
    const a=P(sp[0]), b=P(sp[1]), vx=b[0]-a[0], vz=b[1]-a[1], l2=vx*vx+vz*vz, t=l2>0 ? Math.max(0, Math.min(1, -(a[0]*vx+a[1]*vz)/l2)) : 0;
    const dmin=Math.hypot(a[0]+t*vx, a[1]+t*vz), dmax=Math.max(Math.hypot(a[0], a[1]), Math.hypot(b[0], b[1]));
    if(dmin>REG.sichtMax) return false;
    // Neigung der Blickachse (-z) gegen die Waagerechte: Hoehenwinkel, keine Gier; 1.2 regelt nur Gierumrechnungen
    // (M0 hat dafuer keinen Helfer), darum hier bewusst direkt aus m[9]
    const th=Math.asin(Math.max(-1, Math.min(1, -m[9]))), ta=1/Math.abs(kam.proj[0]), tb=1/Math.abs(kam.proj[5]), RAND=REG.randDeg*D2R;
    const halb=Math.min(Math.PI/2, Math.atan(ta/Math.max(0.05, Math.cos(th)-tb*Math.abs(Math.sin(th))))+RAND);
    let lo=wrap(Math.atan2(a[1], a[0])-bl), sp2=wrap(Math.atan2(b[1], b[0])-bl-lo); if(sp2<0){ lo+=sp2; sp2=-sp2; lo=wrap(lo); }
    if(!((lo<=halb && lo+sp2>=-halb) || lo+sp2-2*Math.PI>=-halb)) return false;
    const v=Math.atan(tb)+RAND;
    for(const hw of hoehenW(W)){ const dy=hw-(m[13]+g.ty); if(!Number.isFinite(dy)) return true;
      const e0=Math.atan2(dy, Math.max(dmax, 1e-3)), e1=Math.atan2(dy, Math.max(dmin, 1e-3)); if(Math.max(e0, e1)>=th-v && Math.min(e0, e1)<=th+v) return true; }
    return false; };
  // Erfassungs-Weg: vorhergesagt werden nur Waende nahe einer Erfassung des Bilds (beide Enden auf hC gehoben mit dem
  // Kandidaten <= REG.erfNah quer, laengs im Intervall +- erfNah, Richtung <= REG.erfWinkelDeg); andere koennen die Erfassung
  // im Bild (tau Pixel) nicht treffen, kosteten aber je Bild eine Vorhersage
  const nahe=(g,K,W)=>{ if(!Number.isFinite(KZ.hC)) return true; const n=G.wandN(W.phi), u=G.wandU(W.phi), sp=ivSpanne(W), sw=Math.sin(REG.erfWinkelDeg*D2R);
    for(const b of K.L){ const P=[b.da, b.db].map(d=>{ const lam=(KZ.hC-(b.c[1]+g.ty))/d[1]; return lam>0 && lam*Math.hypot(d[0], d[2])<REG.sichtMax ? G.gPlan(g, [b.c[0]+lam*d[0], b.c[2]+lam*d[2]]) : null; });
      if(!P[0] || !P[1]) continue; const ex=P[1][0]-P[0][0], ez=P[1][1]-P[0][1], l=Math.hypot(ex, ez), s0=u[0]*P[0][0]+u[1]*P[0][1], s1=u[0]*P[1][0]+u[1]*P[1][1];
      if(l>0 && Math.abs(n[0]*ex+n[1]*ez)<=sw*l && P.every(p=>Math.abs(n[0]*p[0]+n[1]*p[1]-W.rho)<=REG.erfNah) && Math.max(s0, s1)>=sp[0]-REG.erfNah && Math.min(s0, s1)<=sp[1]+REG.erfNah) return true; }
    return false; };
  const sichtJe=kand.map(g=>kams.map(K=>GW.filter(W=>sieht(g, K.kam, W) && (!erf || nahe(g, K, W))))), nBild=kams.length, nVor=(ci,I)=>I.reduce((s,i)=>s+sichtJe[ci][i].length, 0);
  // Eine Auswertung: Kandidat ci mit Lage g auf der Bildmenge I (Stufe A Vorauswahl, B Entscheid); je Beob gekappte
  // Kosten, passende Wand (Index in GW) oder -1, vorzeichenbehaftete Abstaende der Enden und die Bildlinie des Treffers.
  const auswertungen=[];
  const auswerten=(stufe,I,ci,g)=>{ const nB=I.reduce((s,i)=>s+kams[i].L.length, 0), tu=stufe==='A' ? REG.tauA*o.tau : o.tau, tu2=tu*tu;
    const c=new Float32Array(nB).fill(2*tu2), L=new Int32Array(nB).fill(-1), bildVon=new Int32Array(nB), sd=new Float64Array(2*nB), lin=new Float64Array(4*nB); let off=0;
    for(const i of I){ const K=kams[i], pred=[];
      for(const W of sichtJe[ci][i]){ if(arbeit.vorhersagen>=lim) return null; arbeit.vorhersagen++;
        for(const [art, k] of kantenAus(W, G.lmVorhersage(W, K.kam, KZ, g)))
          for(const s of (k.iv && k.iv.length ? k.iv : [[k.A, k.B]])){ const A=s[0], B=s[1], ex=B[0]-A[0], ey=B[1]-A[1], l=Math.hypot(ex, ey); if(l>1) pred.push({W, art, A, ux:ex/l, uy:ey/l, l}); } }
      K.L.forEach((b,j)=>{ const [e1, e2]=K.P[j], jj=off+j; bildVon[jj]=i; if(!e1 || !e2) return;
        for(const p of pred){ if(p.art!==b.art) continue;
          const a1=(e1[0]-p.A[0])*p.ux+(e1[1]-p.A[1])*p.uy, a2=(e2[0]-p.A[0])*p.ux+(e2[1]-p.A[1])*p.uy, lo=Math.max(Math.min(a1, a2), -10), hi=Math.min(Math.max(a1, a2), p.l+10);
          if(hi-lo<0.5*Math.abs(a2-a1)) continue;
          const s1=(e1[1]-p.A[1])*p.ux-(e1[0]-p.A[0])*p.uy, s2=(e2[1]-p.A[1])*p.ux-(e2[0]-p.A[0])*p.uy, d1=Math.abs(s1), d2=Math.abs(s2), e=Math.min(d1, tu)**2+Math.min(d2, tu)**2;
          if(e<c[jj]){ c[jj]=e; L[jj]=d1<=tu && d2<=tu ? wIdx.get(p.W) : -1; sd[2*jj]=s1; sd[2*jj+1]=s2; lin.set([p.A[0], p.A[1], p.ux, p.uy], 4*jj); } } });
      off+=K.L.length; }
    // Inselwaende erst ab 3 passenden Beob aus >= 2 Bildern
    const je=new Map(); for(let j=0;j<nB;j++) if(L[j]>=0){ let x=je.get(L[j]); if(!x) je.set(L[j], x={n:0, b:new Set()}); x.n++; x.b.add(bildVon[j]); }
    for(let j=0;j<nB;j++) if(L[j]>=0 && GW[L[j]].insel==='ja'){ const x=je.get(L[j]); if(x.n<3 || x.b.size<2){ L[j]=-1; c[j]=2*tu2; } }
    const a={stufe, I, ci, g:{psi:g.psi, tx:g.tx, ty:g.ty, tz:g.tz}, c, L, bildVon, sd, lin, nB}; auswertungen.push(a); return a; };
  // Kosten ueber die Beob, die in irgendeiner Auswertung derselben Stufe passen
  const U=st=>{ let u=null; for(const a of auswertungen) if(a.stufe===st){ if(!u) u=new Uint8Array(a.nB); for(let j=0;j<a.nB;j++) if(a.L[j]>=0) u[j]=1; } return u; };
  const kosten=(a,u)=>{ let e=0; for(let j=0;j<a.nB;j++) if(u[j]) e+=a.c[j]; return e; };
  const rangVon=st=>{ const u=U(st), m=new Map(); for(const a of auswertungen) if(a.stufe===st){ const e=kosten(a, u), x=m.get(a.ci); if(!x || e<x.e) m.set(a.ci, {a, e}); }
    return [...m.values()].sort((x,y)=>x.e-y.e || x.a.ci-y.a.ci); };
  // Gauss-Newton im Bild ueber psi, tx, ty, tz auf den passenden Beob der Auswertung; Ableitung aus Differenzen der Vorhersage
  // (eine je Bild und Wand mit Treffern und Freiheit); Schritt nur, wenn die Kosten unter derselben Menge sinken. Die
  // Jede linearisierte Auswertung traegt schritt = {p, psi, y, sigP, sigPsi}: den Restschritt an ihr vor der Kappung (Lage an
  // mitte, m; Gier, rad; Hoehe, m) und die Bestimmtheit aus N^-1 bei 1 px Bildrest (groesste Halbachse der Lage an mitte,
  // Gier). Ist der Restschritt klein (REG.konv), endet die Verfeinerung dort (konvergiert).
  const DG=[1e-3, 1e-3, 1e-3, 1e-3], FREI=['psi', 'tx', 'ty', 'tz'];
  const klein=sc=>!!sc && sc.p<=REG.konv.p && sc.psi<=REG.konv.psiDeg*D2R && sc.y<=REG.konv.y;
  const verfeinern=(cur,iter)=>{
    for(let it=0;it<iter;it++){ const I=cur.I, paare=[], gruppen=new Map(); let off=0;
      for(const i of I){ const K=kams[i]; K.L.forEach((b,j)=>{ const jj=off+j; if(cur.L[jj]<0) return; const p={jj, P:K.P[j], m:paare.length, art:b.art}; paare.push(p);
        const key=i+':'+cur.L[jj]; let gr=gruppen.get(key); if(!gr) gruppen.set(key, gr={i, W:GW[cur.L[jj]], ps:[]}); gr.ps.push(p); }); off+=K.L.length; }
      if(paare.length<4 || arbeit.vorhersagen+4*gruppen.size>lim) return cur;
      const r0=new Float64Array(2*paare.length); for(const p of paare){ r0[2*p.m]=cur.sd[2*p.jj]; r0[2*p.m+1]=cur.sd[2*p.jj+1]; }
      const Jc=FREI.map((f,k)=>{ const gk={...cur.g}; gk[f]+=DG[k]; const r=new Float64Array(r0.length).fill(NaN);
        // eine Vorhersage je (Bild, Wand) liefert beide Kanten; jede Beob nimmt die Kante ihrer Art (Linie durch A, B)
        for(const gr of gruppen.values()){ arbeit.vorhersagen++; const ln=new Map();
          for(const [art, k] of kantenAus(gr.W, G.lmVorhersage(gr.W, kams[gr.i].kam, KZ, gk))){ const ex=k.B[0]-k.A[0], ey=k.B[1]-k.A[1], l=Math.hypot(ex, ey); if(l>1) ln.set(art, [k.A, ex/l, ey/l]); }
          for(const q of gr.ps){ const x=ln.get(q.art); if(!x) continue; const A=x[0]; let ux=x[1], uy=x[2]; if(ux*cur.lin[4*q.jj+2]+uy*cur.lin[4*q.jj+3]<0){ ux=-ux; uy=-uy; }
            for(const e of [0, 1]){ const P=q.P[e]; r[2*q.m+e]=(P[1]-A[1])*ux-(P[0]-A[0])*uy; } } }
        return r; });
      const N=new Float64Array(16), bv=new Float64Array(4);
      for(let m=0;m<r0.length;m++){ const J=Jc.map((r,k)=>(r[m]-r0[m])/DG[k]); if(!J.every(Number.isFinite)) continue;
        for(let x=0;x<4;x++){ bv[x]-=J[x]*r0[m]; for(let y=0;y<4;y++) N[4*x+y]+=J[x]*J[y]; } }
      for(let x=0;x<4;x++) N[5*x]+=1e-6*(1+N[5*x]);
      if(tyFest){ for(let x=0;x<4;x++){ N[4*x+2]=0; N[8+x]=0; } N[10]=1; bv[2]=0; }
      const d=loese4(N, bv); if(!d){ cur.schritt=null; return cur; }
      // Bestimmtheit: Kovarianz N^-1 (Bildrest 1 px) der Lage an mitte, groesste Halbachse, und der Gier
      const C=[0,1,2,3].map(k=>loese4(N, [0,1,2,3].map(j=>j===k ? 1 : 0)));
      let sigP=Infinity, sigPsi=Infinity;
      if(C.every(Boolean)){ const Jx=[-mitte[1], 1, 0, 0], Jz=[mitte[0], 0, 0, 1], q=(u,v)=>{ let t=0; for(let m=0;m<4;m++) for(let n=0;n<4;n++) t+=u[m]*C[m][n]*v[n]; return t; };
        const xa=q(Jx, Jx), xb=q(Jx, Jz), xd=q(Jz, Jz), mm=(xa+xd)/2, ww=Math.sqrt(((xa-xd)/2)**2+xb*xb); sigP=Math.sqrt(Math.max(0, mm+ww)); sigPsi=Math.sqrt(Math.max(0, C[0][0])); }
      const dp=Math.hypot(d[1]-d[0]*mitte[1], d[3]+d[0]*mitte[0]);
      cur.schritt={p:dp, psi:Math.abs(d[0]), y:Math.abs(d[2]), sigP, sigPsi}; if(klein(cur.schritt)) return cur;
      const ds=Math.max(dp/0.10, Math.abs(d[0])/D2R, Math.abs(d[2])/0.05, 1); for(let k=0;k<4;k++) d[k]/=ds;
      const g={psi:cur.g.psi+d[0], tx:cur.g.tx+d[1], ty:cur.g.ty+d[2], tz:cur.g.tz+d[3]}, neu=auswerten(cur.stufe, I, cur.ci, g); if(!neu) return cur;
      const u=U(cur.stufe); if(kosten(neu, u)<kosten(cur, u)) cur=neu; else return cur; }
    return cur; };
  // Stufe A: alle Kandidaten bei ty0 auf wenigen Bildern (hoechstens 25 % der Arbeit); nur bei mehr als 2 Kandidaten
  const tyFest=erf && !!o.erfTyFest, tyGrob=!tyFest && !(A.hLok && A.hLok.sHC<=0.02), nAus=tyGrob ? 12 : 8;   // Auswertungen je Kandidat in Stufe B (geschaetzt, GN mit Ableitungen)
  let IA=[];
  if(kand.length>2){ IA=gleichm(nBild, nBild); while(IA.length>1 && kand.reduce((s,_,ci)=>s+nVor(ci, IA), 0)>0.25*budget) IA=gleichm(nBild, Math.max(1, Math.floor(IA.length*0.8)));
    for(let ci=0;ci<kand.length;ci++) auswerten('A', IA, ci, {...kand[ci], ty:ty0}); }
  const rA=kand.length>2 ? rangVon('A') : kand.map((g,ci)=>({a:{ci, g:{...g, ty:ty0}}, e:0}));
  if(!rA.length) return null;
  // Stufe B: Bestes und Gegenspieler auf so vielen Bildern, wie die restliche Arbeit fuer zwei reicht; ohne verlaessliches
  // hLok erst ty grob (Schritte tyRaster · 4, 2, hoechstens tyWeit), dann 2 GN-Schritte im Bild. Gegenspieler ist der beste
  // der Vorauswahl, der auch NACH seiner Verfeinerung noch verschieden vom Besten ist (weitere Versuche nur mit Restarbeit;
  // ohne Gegenspieler keine Annahme).
  const reihe=rA.map(x=>x.a.ci), plan=Math.min(reihe.length, 2);
  let IB=gleichm(nBild, nBild); const rest=lim-arbeit.vorhersagen;
  // Reserve fuer die Pruefung des Restschritts an der besten (eine Linearisierung, hoechstens 4 Vorhersagen je Bild und Wand)
  while(IB.length>1 && reihe.slice(0, plan).reduce((s,ci)=>s+nAus*nVor(ci, IB), 0)+4*nVor(reihe[0], IB)>rest) IB=gleichm(nBild, Math.max(1, Math.floor(IB.length*0.8)));
  arbeit.bilder=IB.length; arbeit.bilderA=IA.length;
  const stufeB=ci=>{ let cur=auswerten('B', IB, ci, {...rA.find(x=>x.a.ci===ci).a.g, ty:ty0}); if(!cur) return null;
    if(tyGrob) for(const f of [4, 2]){ const st=f*o.tyRaster, neu=[];
      for(const t of [cur.g.ty-st, cur.g.ty+st]){ if(Math.abs(t-ty0)>o.tyWeit+1e-9) continue; const a=auswerten('B', IB, ci, {...cur.g, ty:t}); if(a) neu.push(a); }
      const u=U('B'); for(const a of neu) if(kosten(a, u)<kosten(cur, u)) cur=a; }
    return verfeinern(cur, 2); };
  const bestB=stufeB(reihe[0]), paar=[reihe[0]];
  if(bestB) for(const ci of reihe.slice(1)){ if(paar.length>=4 || !verschieden(rA.find(x=>x.a.ci===ci).a.g, bestB.g)) continue; paar.push(ci);
    const r=stufeB(ci); if(!r) break;
    if(verschieden(r.g, bestB.g)) break;
    for(let i=auswertungen.length-1;i>=0;i--) if(auswertungen[i].stufe==='B' && auswertungen[i].ci===ci) auswertungen.splice(i, 1); }
  // Restarbeit: die beste der Stufe B weiter verfeinern, bis ihr Restschritt klein ist (hoechstens REG.nachIter Schritte)
  let rB=rangVon('B');
  if(rB.length && !klein(rB[0].a.schritt)){ verfeinern(rB[0].a, REG.nachIter); rB=rangVon('B'); }
  // ---- 4 Hypothesen: zuerst die der Stufe B (vergleichbar, Verhaeltnis), dann die uebrigen der Vorauswahl; je Hypothese
  // weg, nErf (passende nutzer-Beob) und kette = {dP, dY, veto} (Z7); Richtungen im Erfassungs-Weg schon ab minErfJe je Richtung
  const hyp=[];
  const neuHyp=({a, e})=>{ if(hyp.length>=o.maxHyp || !hyp.every(h=>verschieden(h.g, a.g)) || !a.L) return;
    const ph=[], bi=new Set(); let nSeg=0, nErf=0, off=0; for(let j=0;j<a.nB;j++) if(a.L[j]>=0){ nSeg++; bi.add(a.bildVon[j]); ph.push(((GW[a.L[j]].phi%Math.PI)+Math.PI)%Math.PI); }
    for(const i of a.I){ const L=kams[i].L; for(let j=0;j<L.length;j++) if(a.L[off+j]>=0 && L[j].nutzer===true) nErf++; off+=L.length; }
    const sc=a.schritt, fest=klein(sc) && sc.sigP<=o.rivalLage && sc.sigPsi<=o.rivalWinkel*D2R, g={psi:a.g.psi, tx:a.g.tx, ty:a.g.ty, tz:a.g.tz};
    hyp.push({g, kosten:e, nSeg, nRicht:richtungen(ph, 60, erf ? o.minErfJe : 3), nBilder:bi.size, fest,
      sig:sc ? [sc.sigP, sc.sigPsi] : null, schritt:sc ? [sc.p, sc.psi, sc.y] : null, weg, nErf, kette:tor(g)}); };
  for(const x of rB) neuHyp(x);
  const nB2=hyp.length; for(const x of rA) if(!paar.includes(x.a.ci)) neuHyp(x);
  if(!hyp.length) return null;
  const verh=nB2>1 && hyp[0].nSeg>0 ? (hyp[0].kosten>0 ? hyp[1].kosten/hyp[0].kosten : Infinity) : 0;
  Object.assign(info, {ersatz:LW.length ? 0 : LV.length, kandidaten:kand.length, bilder:IB.length, nHyp:hyp.length, verh});
  return {weg, hyp, verh, verschieden};
  };
  // ---- 5 Entscheid je Weg: verhaeltnis >= annehmen (>= loesen, wenn dieselbe Lage desselben Wegs schon gewaehlt ist),
  // segmente >= minSeg passende Beob, erfassungen >= minErf passende Erfassungen, je >= minRicht Richtungen (60°), die beste
  // fest; dann das Tor (Z7): bei sP <= torSP der Kette nur innerhalb tolP (max(torP, 3·sP), mit torHebel 3·sqrt(sP² + (L·sY)²))
  // und max(torYDeg, 3·sY) an der Kameramitte, bei Suche ueber die ganze Karte nur mit verhaeltnis >= ganzVerh (Vorgabe aus);
  // Erfassungs-Weg nur ausserhalb des Modus ganz (erfGanz) und mit fester Hoehe ty0 (erfTyFest). Nie die zweite Hypothese statt einer
  // verworfenen besten. weg 'beide': erst erfassungen (hoechstens anteilErf der Arbeit), dann segmente mit dem Rest; nehmen
  // beide verschiedene Lagen an, gilt keine (veto 'widerspruch'), sonst die angenommene (bei beiden segmente).
  const wege=o.weg==='beide' ? ['erfassungen', 'segmente'] : [o.weg==='erfassungen' ? 'erfassungen' : 'segmente'], erg=[];
  for(const weg of wege){ let GW, bj, LW;
    if(weg==='segmente'){ GW=alle.filter(W=>W.rahmen===-1 && gwF(W) && ivSpanne(W)); bj=quelle(false); LW=alle.filter(W=>W.rahmen===ab && ivSpanne(W)); }
    else { GW=alle.filter(W=>W.rahmen===-1 && ivSpanne(W) && nutzerZahl(W, true)>=o.minNutzer); bj=quelle(true); LW=alle.filter(W=>W.rahmen===ab && ivSpanne(W) && nutzerZahl(W, false)>0);
      let nE=0; for(const l of bj.values()) nE+=l.length;
      if(nE<o.minErf || !GW.length || ganz && !o.erfGanz){ arbeit.wege[weg]={nZiel:GW.length, nQuelle:nE, aus:true, ganz}; continue; } }
    const lim=weg==='erfassungen' && wege.length>1 ? arbeit.vorhersagen+Math.floor(o.anteilErf*(o.arbeit-arbeit.vorhersagen)) : o.arbeit;
    const r=lauf(weg, GW, bj, LW, lim); if(r) erg.push(r); }
  const alt=A.reg && A.reg.gewaehlt>=0 ? A.reg.hyp[A.reg.gewaehlt] : null, hyp=[];
  for(const r of erg){ const h=r.hyp[0], schwelle=alt && (alt.weg || 'segmente')===r.weg && !r.verschieden(alt.g, h.g) ? o.loesen : o.annehmen;
    const ok=r.verh>=schwelle && (r.weg==='erfassungen' ? h.nErf>=o.minErf : h.nSeg>=o.minSeg) && h.nRicht>=o.minRicht && h.fest;
    if(o.kettentor && ganz && !(r.verh>=o.ganzVerh) && !h.kette.veto) h.kette.veto='ganz';
    r.ok=ok && !h.kette.veto; r.block=ok && h.kette.veto ? h.kette.veto : null; r.i0=hyp.length; hyp.push(...r.hyp);
    Object.assign(arbeit.wege[r.weg], {ok:r.ok, block:r.block, n:r.weg==='erfassungen' ? h.nErf : h.nSeg, nRicht:h.nRicht, fest:h.fest, tor:h.kette}); }
  if(!hyp.length) return fertig([], -1, 0);
  const an=erg.filter(r=>r.ok), rs=erg.find(r=>r.weg==='segmente') || erg[0];
  if(an.length>1 && an[0].verschieden(an[0].hyp[0].g, an[1].hyp[0].g)) return fertig(hyp, -1, rs.verh, null, 'widerspruch');
  if(an.length){ const r=an.find(x=>x.weg==='segmente') || an[0]; return fertig(hyp, r.i0, r.verh, r.weg, null); }
  const b=erg.find(r=>r.block); return fertig(hyp, -1, rs.verh, null, b ? b.block : null);
};
