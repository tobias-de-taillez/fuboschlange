// ------------------------------------------------ Karte: Kartenlauf (M10)
// Zustandsmaschine des Karten-Workers, live und offline (raumskizze-karte.mjs, T1) gleich.
// Vertrag: ARCHITEKTUR v3, Abschnitte 3 (Strukturen), 4 (Block M10), 5.1-5.3 (Datenfluss,
// Arbeitsbudget), 3.2.2 (Stufen), 1.3 (Kern), 7.3/7.4 (Inseln), 8.5 (Abschluss), 14.1 (Eigentum),
// 17.9 (Bauauftrag). Die Datei steht wortgleich als eigener Block { ... } im geo-Block; sie setzt G
// und M0 (raumskizze-karte-grund.js) voraus und ruft M3-M9 nur zur Laufzeit ueber G.* auf.
// Kein DOM, kein Math.random. Die Uhr (opt.uhr, sonst performance.now) wird nur gemessen und in
// ms geschrieben, nie fuer eine Entscheidung benutzt; Runden folgen der Sitzungszeit (Takt) und
// dem Arbeitsbudget (5.3). Zwei Laeufe mit gleicher Eingabe geben dieselben Staende.
//
// Ablauf je Runde (G.karteRechnen, feste Reihenfolge, 4):
//   1 Schnitte/Abschnitte (G.sessionCuts inkrementell, auch Ereignisse 'ref-reset' und 'rest')
//   2 G.ketteStart fuer neue Abschnitte (g0)
//   3 Kern nach 1.3, dann stufe 'verbunden', g = Einheit, G.lmEinbinden
//   4 G.registriere fuer lokale und lose Abschnitte mit neuen Schluessel-Beob oder gewachsener globaler Karte
//     (Budget arbeit.reg Vorhersagen je Runde, je Aufruf mindestens regMin, reihum nach ab ab dem Zeiger der vorigen Runde)
//   4a nur bei opt.knoten: G.knotenSetzen fuer verbundene/lockere Abschnitte
//   5 G.lmBloecke, G.lmAusgleich global (lago aus dem Strukturwechsel); lokal je Abschnitt mit nurAb (relin
//     aus dem Rest des gemeinsamen Rundenbudgets, 5.3)
//   5a Folgekanten mit chi2 > chiRest in rundenRest Runden in Folge -> Ereignis 'rest' (je Kante einmal)
//   6 Stufen (3.2.2), G.lmEinbinden fuer neu verbundene, G.lmNeuZuordnen
//   7 G.lmDurchblick, G.lmZusammenfuehren, G.lmTrennen, G.lmIntervalle, G.lmHoehenklasse (je Wand nur bei
//     geaendertem Eingang, offener Hysterese oder lmAlle Runden ohne Besuch; hoechstens arbeit.lm Waende)
//   8 G.umriss (G.umrissEingabe, vorher = Umriss der vorigen Runde), G.inselHypothesen, G.inselBewerten
//     (hoechstens arbeit.hyp); nur 'voll' geht als inselFest in den zweiten Schnitt, 'teil' als offener Ring
//   9 W.ringe, iv[].ring, W.insel (3 Runden Hysterese) aus dem neuen Umriss
//  10 G.karteAbschluss
//
// Festlegungen dieses Moduls, wo der Vertrag offen ist (stehen im Bericht P-H als Abweichung):
//  - KZ.lauf: eigener Zustand von M10 (Brueche, Ereignisse, Zaehler, Verlauf); kein anderes Modul liest ihn.
//  - Abschnitt-Objekte legt M10 an (ab, t0, t1, ep0, ep1, Zaehler); g0/reg/knoten.t/s fuellt M4, g/cov/sig/
//    knoten.d/cov M6. Aendern sich vorhandene Schnitte (Einschmelzen, 'rest'), gliedert M10 neu: Beob.ab
//    und Bild-ab ueber G.sectionOf, Wand/Ecke.rahmen, KZ.kern, KZ.bloecke (geleert).
//  - Uebergang lokal -> verbunden: M10 schreibt g genau einmal, beim Uebergang (Startwert, danach nur M6):
//    (a) Bindung nurT/zurueck mit engem sigma: g := g_A ∘ ΔT, sofort 'verbunden' (3.2.2); (b) angenommene
//    Registrierung: g := g der gewaehlten Hypothese, 'verbunden' auf Probe; liefert M6 danach das erste sig
//    mit sig.max > 5 cm oder sig.psi > 1°, geht der Abschnitt nach 'locker' (zurueck nach 'verbunden' mit der
//    Hysterese bei <= 5 cm und <= 1°). Zurueck nach 'lokal' geht nicht, weil G.lmEinbinden nicht umkehrbar ist.
//  - lose -> lokal bei neuen Hypothesen (Lage > 0,15 m oder Gier > 2° neben allen Hypothesen zur Zeit des
//    Wechsels nach 'lose'); die 30 s bis 'lose' zaehlen dann ab der Rueckkehr.
//  - Erfassungen: G.lmErfassung(KZ, bildErg, o), wenn M5 sie hat; sonst als BildErgebnis mit einem Segment
//    (erfassung: {id, nutzer: true}) an G.lmAufnehmen (M5 kennt o.nutzer bisher nicht, Bericht P-H).
//  - G.registriere schreibt A.reg und A.g0 selbst (M4); M10 liest den Verbrauch aus r.arbeit.vorhersagen
//    (Zahl als Rueckfall) und schreibt A.reg/g0 nur, wenn das Modul sie nicht geschrieben hat (Platzhalter).
//  - lmDurchblick/lmIntervalle/lmHoehenklasse schreiben bei M5 durchblick, iv, cls und zustand selbst; M10
//    uebernimmt nur die Rueckgabe (gleicher Wert; fuer Platzhalter ohne eigenen Schreibzugriff). 'unterzug'
//    entscheidet allein lmHoehenklasse mit ihrer Hysterese.
//  - Hypothesen: Stufe und Runden kommen aus G.inselBewerten (7.2, vorige Bewertung je id als o.vorher);
//    M10 setzt Ring.entscheid/exportiert nach 7.3.
//  - karteAbschluss(stand, verlauf): verlauf = {t, topo: [{t, topo}], loseSeit: {ab: t}} aus KZ.lauf.
//  - Ereignis 'verdraengt' {k} (Bild-Worker latest-wins) zaehlt fuer RundeKopf.verdraengt.
//  - RundeKopf.arbeit.lm: Waende, fuer die Schritt 7 lmDurchblick/lmIntervalle/lmHoehenklasse rechnete.
const ML_DEF={H:null, quelle:'segmente', arbeit:{iter:3, lin:2, relin:20000, reg:2000, hyp:4, lm:150}, knoten:false, lago:'aus', pp:'fest',
  skala:'fest', umriss:true, umrissJede:2, reg:true, tiefe:0, ebenen:0, ohne:[], ohneAb:[], warteMax:1.0, loseNach:30, loseErledigt:10,
  proj:null, w:287, h:640, sPxErf:2, kopfRaster:1e6, topoRunden:3, topoDauer:3, verlaufMax:60, hypRunden:3, orakel:null, uhr:null,
  verbunden:{sP:0.05, sY:1*Math.PI/180}, locker:{max:0.08, psi:1.5*Math.PI/180}, lose:{max:0.20, zurueck:0.15},
  kern:{bilder:8, richtungen:2, winkelDeg:60}, eckeSigma:0.05, schnitt:{},
  // Registrierung erneut, wenn die globale Karte um >= 10 % (mindestens 1) nicht-kandidat Waende gewachsen ist
  // oder sich die Menge der verbundenen/lockeren Abschnitte geaendert hat [S]; neue Hypothese: neben allen alten
  // um > rivalLage / rivalWinkel wie G.registriere (4)
  regWachsen:0.10, hypNeu:{lage:0.15, gierDeg:2},
  // jeder Aufruf von G.registriere zaehlt gegen das Rundenbudget mindestens regMin Vorhersagen: gemessen A8 (Mac) kostet ein
  // Aufruf im Median 19 ms, p90 34 ms, auch wenn er nur 20-300 Vorhersagen braucht; so hoechstens 2 Aufrufe je Runde
  regMin:1000,
  // Schritt 7: Schwellen wie G.lmBloecke (0,05° / 2 mm), Rahmen-Schluessel +10 % wie der Durchblick-Cache von M5,
  // Lage eines Abschnitts 1 cm / 0,1° wie G.lmNeuZuordnen grob; jede Wand spaetestens nach lmAlle Runden [S]
  lmSchwelle:{phiDeg:0.05, rho:0.002, h:0.002, hBezug:0.002, rahmen:0.10, gP:0.01, gPsiDeg:0.1}, lmAlle:20};
const ML_D2R=Math.PI/180;
const mlIdVgl=(a,b)=>typeof a===typeof b ? (a<b ? -1 : a>b ? 1 : 0) : (typeof a==='number' ? -1 : 1);
const mlUhr=KZ=>{ const u=KZ.opt.uhr; return u ? u() : (globalThis.performance ? globalThis.performance.now() : 0); };
const mlRuf=(name, ...a)=>{ const f=G[name]; if(typeof f!=='function') throw new Error('Modul fehlt: G.'+name); return f(...a); };
const mlHat=name=>typeof G[name]==='function';
const mlEins=()=>({psi:0, tx:0, ty:0, tz:0});
const mlWrap=a=>Math.atan2(Math.sin(a), Math.cos(a));
// Richtung einer Wand mod pi (Linie ohne Seite), Abstand zweier Richtungen in [0, pi/2]
const mlRichtAbst=(a,b)=>{ let d=Math.abs(((a-b)%Math.PI+Math.PI)%Math.PI); return d>Math.PI/2 ? Math.PI-d : d; };
const mlGleicherSchnitt=(a,b)=>a.t===b.t && a.epA===b.epA && a.epB===b.epB && a.art===b.art;
const mlHatL=L=>L!=null && L!==-1;                 // Beob.L: Wand-/Ecke-id (Zahl oder Zeichenkette) oder -1

// ------------------------------------------------ Zustand
G.karteNeu=(o={})=>{
  const opt={...ML_DEF, ...o, arbeit:{...ML_DEF.arbeit, ...(o.arbeit||{})}, verbunden:{...ML_DEF.verbunden, ...(o.verbunden||{})},
    locker:{...ML_DEF.locker, ...(o.locker||{})}, lose:{...ML_DEF.lose, ...(o.lose||{})}, kern:{...ML_DEF.kern, ...(o.kern||{})}};
  opt.ohne=[...(opt.ohne||[])]; opt.ohneAb=[...(opt.ohneAb||[])];
  const KZ={opt, skala:1, hC:null, hF:0, sHC:null, sHF:null, H:opt.H || null,
    hoehen:{quelle:opt.H ? 'laser-weich' : 'parallaxe', q:0},
    posen:[], epoche:-1, schnitte:[], abschnitte:[], kern:null,
    bilder:new Map(), warte:[], beob:[], waende:new Map(), ecken:new Map(), spuren:null,
    bloecke:new Map(), pp:{cx:0, cy:0, sig:0, frei:opt.pp==='frei'}, ldl:null,
    tiefe:{boden:null, ebenen:[], ebenenAR:[]}, inselEntscheide:new Map(), umriss:null, runde:0, version:3, ms:{},
    lauf:{breaks:[], ereignisse:[], tMax:-Infinity, tPose:-Infinity, kBis:-1, verdraengt:[], pause:false, marken:[], schrank:new Set(),
      letzte:null, verlauf:[], loseSeit:{}, loseVon:{}, regStand:{}, lokalStand:{}, lokalSeit:{}, regSig:{}, probe:{}, regZeiger:0,
      restZahl:new Map(), restGemeldet:new Set(), lmBesuch:new Map(), lmZeiger:null, gVersion:{},
      struktur:null, hypVorher:new Map(), msZuordnen:0, msTiefe:0, nachRegel:false, entscheidNeu:false, zuletztFehler:null}};
  // Orakel-Landmarken (T1 --orakel-landmarken, Eichung G-0.5): Wahrheitswaende als feste globale Waende.
  if(opt.orakel && opt.orakel.waende) for(const w of opt.orakel.waende) KZ.waende.set(w.id, {rahmen:-1, cov:[1e-8, 0, 1e-8], h:'c', hLokal:null, cls:'wand',
    clsZaehler:0, hFrei:null, dChiC:0, dChiF:0, beob:[], nBilder:0, nSchluessel:0, nStandpunkte:0, basis:0, abschnitte:[], iv:[], durchblick:[], boden:[],
    ecken:[], sSchwer:0, zustand:'bestaetigt', teile:[], ringe:[], insel:'nein', inselRunden:0, ...w, fest:true});
  return KZ;
};

// ------------------------------------------------ Abschnitte gliedern
const mlAbschnittNeu=(ab,t0,ep0)=>({ab, t0, t1:t0, ep0, ep1:ep0, g0:null, g:null, cov:null, knoten:null, hLok:null, sig:null, reg:null,
  stufe:'lokal', w:0, nBilder:0, nSchluessel:0, nBeob:0, mitWand:false, richtungen:0, psi0:null});
const mlSchnittOpt=KZ=>{ const o=KZ.opt; return {...o.schnitt, reset:!o.ohne.includes('reset'), rest:true, gyro:false}; };
// Zeiten der Abschnitte aus den Posen; Epoche und Zeit entscheiden ueber G.sectionOf (Kritik 34).
const mlZeiten=(KZ)=>{
  const S=KZ.schnitte, A=KZ.abschnitte, ges=new Uint8Array(A.length);
  for(const p of KZ.posen){ const ab=G.sectionOf(S, p.t, p.ep), a=A[ab]; if(!a) continue;
    if(!ges[ab]){ ges[ab]=1; a.t0=p.t; a.ep0=p.ep; } a.t1=p.t; a.ep1=p.ep; }
};
// Neu gliedern nach jeder Aenderung der Schnitte: jedes alte Abschnitt-Objekt geht an den ersten neuen
// Abschnitt, in dem es beginnt; weitere Teile sind neue Objekte (lokal, g0 = null fuer G.ketteStart). Nur
// hinter einem Schnitt 'rest' erbt der neue Teil die Stufe des alten (Ausnahme 3.2.3). Beob.ab und Bild-ab
// kommen danach aus G.sectionOf, Wand/Ecke.rahmen und KZ.kern ueber die Zuordnung alt -> neu.
const mlGliedern=(KZ, altS)=>{
  const S=KZ.schnitte, L=KZ.lauf, altA=KZ.abschnitte, N=S.length+1, neuA=new Array(N).fill(null), abNeu=new Int32Array(altA.length).fill(-1);
  const start=new Array(N).fill(null);
  for(const p of KZ.posen){ const ab=G.sectionOf(S, p.t, p.ep); if(ab<N && !start[ab]) start[ab]=p; }
  for(let k=0;k<N;k++){ const p=start[k]; if(!p){ neuA[k]=mlAbschnittNeu(k, NaN, NaN); continue; }
    const j=G.sectionOf(altS, p.t, p.ep), a=altA[j];
    if(a && abNeu[j]<0){ abNeu[j]=k; a.ab=k; neuA[k]=a; }
    else { const b=mlAbschnittNeu(k, p.t, p.ep); if(a && S[k-1] && S[k-1].art==='rest'){ b.stufe=a.stufe; b.erbe=j; } neuA[k]=b; } }
  for(let j=0;j<altA.length;j++) if(abNeu[j]<0){ // alter Abschnitt ohne eigenen Anfang: geht im Vorgaenger auf
    const a=altA[j]; let k=0; for(const p of KZ.posen){ if(G.sectionOf(altS, p.t, p.ep)===j){ k=G.sectionOf(S, p.t, p.ep); break; } } abNeu[j]=k; }
  KZ.abschnitte=neuA;
  const mapAb=ab=>ab>=0 && ab<abNeu.length ? abNeu[ab] : ab;
  for(const b of KZ.beob) b.ab=G.sectionOf(S, b.t, b.ep);
  for(const [k,bi] of KZ.bilder) bi.ab=G.sectionOf(S, bi.t, bi.ep);
  for(const W of KZ.waende.values()){ if(W.rahmen>=0) W.rahmen=mapAb(W.rahmen); if(W.abschnitte) W.abschnitte=[...new Set(W.abschnitte.map(mapAb))].sort((a,b)=>a-b); }
  for(const E of KZ.ecken.values()) if(E.rahmen>=0) E.rahmen=mapAb(E.rahmen);
  if(KZ.kern!=null) KZ.kern=mapAb(KZ.kern);
  KZ.bloecke.clear();
  for(const feld of ['loseSeit', 'loseVon', 'regStand', 'lokalStand', 'lokalSeit', 'regSig', 'probe', 'gVersion']){ const alt=L[feld], neu={}; for(const k of Object.keys(alt)) neu[mapAb(+k)]=alt[k]; L[feld]=neu; }
  L.umgegliedert=(L.umgegliedert||0)+1;
};
// Schnitte neu holen; true, wenn sich etwas geaendert hat. bindung.k (M6) wandert auf gleiche Schnitte mit.
const mlSchnitte=(KZ)=>{
  if(!KZ.posen.length) return false;
  const L=KZ.lauf, neu=mlRuf('sessionCuts', KZ.posen, L.breaks, L.ereignisse, mlSchnittOpt(KZ), KZ.schnitte);
  if(!Array.isArray(neu)) return false;
  const alt=KZ.schnitte;
  const gleich=alt.length===neu.length && alt.every((c,i)=>mlGleicherSchnitt(c, neu[i]));
  for(let i=0;i<Math.min(alt.length, neu.length);i++) if(mlGleicherSchnitt(alt[i], neu[i]) && alt[i].bindung && neu[i].bindung && alt[i].bindung.k!=null) neu[i].bindung.k=alt[i].bindung.k;
  KZ.schnitte=neu;
  if(!KZ.abschnitte.length) KZ.abschnitte.push(mlAbschnittNeu(0, KZ.posen[0].t, KZ.posen[0].ep));
  if(gleich) return false;
  mlGliedern(KZ, alt); mlZeiten(KZ); return true;
};
const mlAbVon=(KZ,t,ep)=>{ const ab=G.sectionOf(KZ.schnitte, t, ep); return ab>=0 && ab<KZ.abschnitte.length ? ab : KZ.abschnitte.length-1; };

// ------------------------------------------------ Eingaenge
// Ausnahme eines Moduls beim Aufnehmen (Bild, Erfassung): nicht toedlich, gezaehlt, im naechsten Stand als fehler (5.2).
const mlEingangFehler=(KZ, e)=>{ const F=KZ.lauf.eingangFehler || (KZ.lauf.eingangFehler={n:0, msg:null}); F.n++; F.msg=String(e && e.message || e); };
const mlZeit=(KZ,t)=>{ if(Number.isFinite(t) && t>KZ.lauf.tMax) KZ.lauf.tMax=t; };
G.kartePose=(KZ, zeile)=>{
  const L=KZ.lauf;
  KZ.posen.push(zeile); KZ.epoche=zeile.ep; mlZeit(KZ, zeile.t); if(zeile.t>L.tPose) L.tPose=zeile.t;
  if(!KZ.abschnitte.length) KZ.abschnitte.push(mlAbschnittNeu(0, zeile.t, zeile.ep));
  if(!mlSchnitte(KZ)){ const a=KZ.abschnitte[KZ.abschnitte.length-1]; if(!Number.isFinite(a.t0)){ a.t0=zeile.t; a.ep0=zeile.ep; } a.t1=zeile.t; a.ep1=zeile.ep; }
  mlWarte(KZ);
};
// BildErgebnisse warten auf die PoseZeile mit t >= bildErg.t (5.2), hoechstens warteMax s Sitzungszeit.
const mlWarte=(KZ)=>{
  const L=KZ.lauf; if(!KZ.warte.length) return;
  const frei=[], rest=[];
  for(const b of KZ.warte) (L.tPose>=b.t || b.t<L.tMax-KZ.opt.warteMax ? frei : rest).push(b);
  if(!frei.length) return;
  KZ.warte=rest; frei.sort((a,b)=>a.k-b.k);
  for(const b of frei) mlBild(KZ, b);
};
G.karteBild=(KZ, b)=>{
  const L=KZ.lauf; mlZeit(KZ, b.t);
  if(!(L.tPose>=b.t)){ KZ.warte.push(b); mlWarte(KZ); return {zugeordnet:0, neu:0, wartet:KZ.warte.includes(b)}; }
  return mlBild(KZ, b);
};
const mlBild=(KZ, b)=>{
  const L=KZ.lauf, t0=mlUhr(KZ); if(b.k>L.kBis) L.kBis=b.k;
  if(!KZ.abschnitte.length) return {zugeordnet:0, neu:0, wartet:false};
  const ab=mlAbVon(KZ, b.t, b.ep), A=KZ.abschnitte[ab];
  KZ.bilder.set(b.k, {t:b.t, ab, ep:b.ep, c:[b.camTo[12], b.camTo[13], b.camTo[14]], camTo:b.camTo, f:b.f, schluessel:false});
  if(b.psi0){ const q=A.psi0 || {psi:0, n:0, c:0, s:0}; q.c+=Math.cos(4*b.psi0.psi); q.s+=Math.sin(4*b.psi0.psi); q.n++;
    q.psi=((Math.atan2(q.s, q.c)/4)%(Math.PI/2)+Math.PI/2)%(Math.PI/2); A.psi0=q; }
  let r={zugeordnet:0, neu:0, befoerdert:0};
  if(!L.pause && KZ.opt.quelle!=='erfassungen' && !KZ.opt.ohneAb.includes(ab)) try{
    r=mlRuf('lmAufnehmen', KZ, b, {ohne:KZ.opt.ohne}) || r;
    if(b.senk && b.senk.length && !KZ.opt.ohne.includes('senk') && mlHat('lmEcken')) G.lmEcken(b, KZ);
  }catch(e){ mlEingangFehler(KZ, e); r={zugeordnet:0, neu:0, fehler:true}; }
  L.msZuordnen+=mlUhr(KZ)-t0;
  return {zugeordnet:r.zugeordnet|0, neu:r.neu|0, wartet:false};
};
// Fadenkreuz-Erfassung (Strahlen ra, rb im Bezug der Zeile) als BildErgebnis mit einem Segment, Klasse
// waagerecht oben; nutzer = true soll bei M5 die Klasse 'wand' erzwingen (3.3). Vorschlag fuer 4:
// G.lmErfassung(karte, bildErg /*n = 1, erfassung {id, nutzer}*/, o = {ab}) -> {zugeordnet, neu, L}; fehlt sie,
// geht die Erfassung an G.lmAufnehmen (dort heute wie ein Bildsegment, also ueber Spuren). Optional erf.camTo (Kamera der
// Zeile, Lage = ra.o) und erf.ndc ([[x, y], [x, y]] der Enden, Protokoll obs.ndc) geben Ausrichtung und
// Pixel; ohne sie Einheitsdrehung und Pixel NaN.
G.karteErfassung=(KZ, erf)=>{
  const L=KZ.lauf, o=KZ.opt; mlZeit(KZ, erf.t);
  if(o.quelle==='segmente' || L.pause || !KZ.abschnitte.length) return {zugeordnet:0, neu:0};
  const ab=mlAbVon(KZ, erf.t, erf.ep); if(o.ohneAb.includes(ab)) return {zugeordnet:0, neu:0};
  const t0=mlUhr(KZ), da=erf.ra.d, db=erf.rb.d, nn=[da[1]*db[2]-da[2]*db[1], da[2]*db[0]-da[0]*db[2], da[0]*db[1]-da[1]*db[0]];
  let psi=Math.atan2(-nn[0], nn[2]); psi=((psi%Math.PI)+Math.PI)%Math.PI;
  const c=erf.ra.o, camTo=erf.camTo ? Float64Array.from(erf.camTo) : new Float64Array(16), fy=!!erf.flipY;
  if(!erf.camTo) camTo[0]=camTo[5]=camTo[10]=camTo[15]=1; camTo[12]=c[0]; camTo[13]=c[1]; camTo[14]=c[2];
  const f=o.proj ? G.fokusPx(o.proj, o.h) : NaN, el=d=>Math.asin(Math.max(-1, Math.min(1, d[1])));
  const px=erf.ndc && G.ndcToPix ? [G.ndcToPix(erf.ndc[0][0], erf.ndc[0][1], o.w, o.h, fy), G.ndcToPix(erf.ndc[1][0], erf.ndc[1][1], o.w, o.h, fy)] : null;
  const pxS=px ? [px[0][0], px[0][1], px[1][0], px[1][1], Math.hypot(px[1][0]-px[0][0], px[1][1]-px[0][1])] : [NaN, NaN, NaN, NaN, NaN];
  const b={k:-1-(erf.id|0), vi:-1, t:erf.t, ep:erf.ep, camTo, proj:o.proj ? Float32Array.from(o.proj) : null, flipY:fy, w:o.w, h:o.h, f, n:1,
    seg:Float32Array.from([pxS[0], pxS[1], pxS[2], pxS[3], 0, o.sPxErf, psi, el(da), el(db), pxS[4]]), cls:Int8Array.from([G.KG.KL.O]), man:Int8Array.from([-1]),
    dir:Float32Array.from([...da, ...db]), nTeile:Uint8Array.from([1]), psi0:null, senk:null, ms:{}, erfassung:{id:erf.id, nutzer:true}};
  let r={}; try{ r=(mlHat('lmErfassung') ? G.lmErfassung(KZ, b, {nutzer:true, ohne:o.ohne, ab}) : mlRuf('lmAufnehmen', KZ, b, {nutzer:true, ohne:o.ohne})) || {}; }catch(e){ mlEingangFehler(KZ, e); }
  L.msZuordnen+=mlUhr(KZ)-t0;
  return {zugeordnet:r.zugeordnet|0, neu:r.neu|0};
};
G.karteEreignis=(KZ, ev)=>{
  const L=KZ.lauf, typ=ev.typ; mlZeit(KZ, ev.t);
  if(typ==='bruch') L.breaks.push(ev);
  else if(typ==='pause') L.pause=true;
  else if(typ==='weiter') L.pause=false;
  else if(typ==='verdraengt') L.verdraengt.push(ev.k);
  else if(typ==='hoehe'){ const h=ev.laser ?? ev.H; KZ.H=Number.isFinite(h) && h>0 ? {laser:h, sigma:ev.sigma ?? 0.015} : null; }
  else if(typ==='insel-entscheid') G.karteEntscheid(KZ, {ring:ev.ring, wahl:ev.wahl, t:ev.t});
  else if(typ==='schrank'){ const W=KZ.waende.get(ev.wand); if(W){ W.cls='schrank'; L.schrank.add(ev.wand); } }
  else if(typ==='marke') L.marken.push(ev);
  else if(typ==='rueckgaengig'){ // Beobachtungen der letzten 2 s (oder ev.von..ev.bis) zuruecknehmen (live 3.8)
    const bis=ev.bis ?? ev.t, von=ev.von ?? bis-2, weg=new Set();
    KZ.beob=KZ.beob.filter(b=>{ const raus=b.t>=von && b.t<=bis; if(raus) weg.add(b.id); return !raus; });
    for(const W of KZ.waende.values()) W.beob=W.beob.filter(i=>!weg.has(i));
    for(const E of KZ.ecken.values()) E.beob=E.beob.filter(i=>!weg.has(i)); }
  else L.ereignisse.push(ev);                // 'ref-reset', 'rest', 'anker...' und Protokoll-Ereignisse fuer G.sessionCuts
  mlWarte(KZ);
};
G.karteEntscheid=(KZ, e)=>{ if(e.ring==null) return; KZ.inselEntscheide.set(e.ring, e.wahl); KZ.lauf.entscheidNeu=true; mlZeit(KZ, e.t); };
G.karteTiefe=(KZ, d)=>{
  const o=KZ.opt; mlZeit(KZ, d.t);
  if(o.ohne.includes('tiefe') || !mlHat('depthRays') || !mlHat('depthLift') || !KZ.abschnitte.length) return null;
  const t0=mlUhr(KZ), ab=d.ab ?? mlAbVon(KZ, d.t, d.ep ?? KZ.epoche);
  const rays=G.depthRays(d.M, o.proj, d.w, d.h); if(!rays) return null;
  const lift=G.depthLift(d.raw, d.scale, rays, d.camTo);
  const q=lift && mlHat('depthQuality') ? G.depthQuality(lift, rays, d.camTo, KZ.H ? KZ.H.laser : null) : null;
  if(lift && KZ.tiefe.boden && mlHat('depthFloorFree')) G.depthFloorFree(lift, d.camTo, KZ.tiefe.boden, ab);
  if(lift && mlHat('depthWallPlanes')) for(const e of (G.depthWallPlanes(lift) || [])) KZ.tiefe.ebenen.push({...e, ab, t:d.t});
  KZ.lauf.msTiefe+=mlUhr(KZ)-t0;
  return q;
};
// PlaneRec (local) mit dem Bodenbezug der letzten Zeile bis t (local -> Bezug) als EbeneBeob.
G.karteEbenen=(KZ, ebenen)=>{
  if(KZ.opt.ohne.includes('ebenen') || !mlHat('ebeneAusAR') || !KZ.posen.length) return 0;
  let n=0;
  for(const rec of ebenen||[]){ mlZeit(KZ, rec.t);
    let p=KZ.posen[0]; for(let i=KZ.posen.length-1;i>=0;i--) if(KZ.posen[i].t<=rec.t){ p=KZ.posen[i]; break; }
    const bezug=G.gMat(G.gInv(G.gAusT(p.T))), e=G.ebeneAusAR(rec, bezug);
    if(e){ e.ab=mlAbVon(KZ, rec.t, p.ep); KZ.tiefe.ebenenAR.push(e); n++; } }
  return n;
};

// ------------------------------------------------ Kern (1.3)
// Erster Abschnitt mit >= kern.bilder Schluesselbildern mit Beob an bestaetigten Landmarken (zustand
// 'bestaetigt' oder 'begrenzt') auf >= kern.richtungen Wandrichtungen, die >= kern.winkelDeg auseinander liegen.
const mlKernSuchen=(KZ)=>{
  const K=KZ.opt.kern, je=new Map();
  for(const b of KZ.beob){ if(!b.schluessel || !mlHatL(b.L)) continue; const W=KZ.waende.get(b.L); if(!W || !(W.zustand==='bestaetigt' || W.zustand==='begrenzt')) continue;
    let e=je.get(b.ab); if(!e){ e={bilder:new Set(), phi:[]}; je.set(b.ab, e); } e.bilder.add(b.k); e.phi.push(W.phi); }
  for(const ab of [...je.keys()].sort((a,b)=>a-b)){ const e=je.get(ab); if(e.bilder.size<K.bilder) continue;
    const R=[]; for(const p of e.phi) if(!R.some(r=>mlRichtAbst(r, p)<1*ML_D2R)) R.push(p);
    let ok=K.richtungen<=1 && R.length>=1;
    for(let i=0;i<R.length && !ok;i++) for(let j=i+1;j<R.length;j++) if(mlRichtAbst(R[i], R[j])>=K.winkelDeg*ML_D2R-1e-9){ ok=true; break; }
    if(ok) return ab; }
  return null;
};

// ------------------------------------------------ Strukturwechsel (5.4) aus dem Zustand
const mlStruktur=(KZ)=>{
  const S=KZ.schnitte;
  return {kern:KZ.kern, verb:KZ.abschnitte.filter(A=>A.stufe==='verbunden' || A.stufe==='locker').map(A=>A.ab).join(','),
    kn:KZ.abschnitte.filter(A=>A.knoten && A.knoten.t && A.knoten.t.length>1).map(A=>A.ab+':'+A.knoten.t.length).join(','),
    mm:S.map((s,i)=>s.bindung && s.bindung.k!=null ? s.t+':'+s.epB+':'+s.bindung.k : '').filter(Boolean).join(','),
    reg:KZ.abschnitte.filter(A=>A.reg && A.reg.gewaehlt>=0).map(A=>A.ab+':'+A.reg.gewaehlt).join(',')};
};
const mlStrukturGrund=(alt, neu, schluss)=>{
  if(!alt) return neu.kern!=null ? 'kern' : schluss ? 'schluss' : null;
  if(alt.kern!==neu.kern) return 'kern';
  if(alt.verb!==neu.verb) return 'verbunden';
  if(alt.kn!==neu.kn) return 'knoten';
  if(alt.mm!==neu.mm) return 'mm';
  if(alt.reg!==neu.reg) return 'reg';
  return schluss ? 'schluss' : null;
};

// ------------------------------------------------ Zaehler je Abschnitt
const mlZaehlen=(KZ)=>{
  const n=KZ.abschnitte.length, sch=Array.from({length:n}, ()=>new Set()), wand=Array.from({length:n}, ()=>new Set()), nB=new Int32Array(n), rich=Array.from({length:n}, ()=>[]);
  for(const b of KZ.beob){ const ab=b.ab; if(!(ab>=0 && ab<n)) continue; nB[ab]++;
    if(!b.schluessel) continue; sch[ab].add(b.k);
    const W=mlHatL(b.L) ? KZ.waende.get(b.L) : null;
    if(W && W.cls!=='stoer'){ wand[ab].add(b.k); if(!rich[ab].some(r=>mlRichtAbst(r, W.phi)<5*ML_D2R)) rich[ab].push(W.phi); } }
  const nBi=new Int32Array(n); for(const bi of KZ.bilder.values()) if(bi.ab>=0 && bi.ab<n) nBi[bi.ab]++;
  KZ.abschnitte.forEach((A,ab)=>{ A.nBeob=nB[ab]; A.nSchluessel=sch[ab].size; A.mitWand=wand[ab].size>=3; A.richtungen=rich[ab].length; A.nBilder=nBi[ab]; });
};

// ------------------------------------------------ Stufen (3.2.2)
// Bindung des Schnitts vor Abschnitt ab an einen verbundenen Abschnitt: nurT (g := g_A ∘ ΔT) oder
// zurueck (g := g des zurueckgekehrten Abschnitts), jeweils nur bei engem sigma.
const mlBindungG=(KZ, ab)=>{
  const o=KZ.opt.verbunden, A=KZ.abschnitte, verb=B=>B && B.g && (B.stufe==='verbunden' || B.stufe==='locker');
  for(let i=0;i<KZ.schnitte.length;i++){ const s=KZ.schnitte[i], b=s.bindung;
    if(!b || !(b.sP<=o.sP) || !(b.sY<=o.sY) || !(i===ab || i+1===ab)) continue;
    const andere=A[i===ab ? i+1 : i];
    if(s.klasse==='nurT' && verb(andere)){ const TA=mlZeileVor(KZ, s), TB=mlZeileNach(KZ, s); if(!TA || !TB) continue;
      const dT=G.gKomp(G.gInv(G.gAusT(TA.T)), G.gAusT(TB.T)), g=G.gBei(andere, s.t); if(!g) continue;
      return i+1===ab ? G.gKomp(g, dT) : G.gKomp(g, G.gInv(dT)); }
    if(s.klasse==='zurueck' && i+1===ab && s.zurueckZu!=null && verb(A[s.zurueckZu])) return G.gBei(A[s.zurueckZu], s.t); }
  return null;
};
const mlZeileVor=(KZ, s)=>{ let z=null; for(const p of KZ.posen){ if(p.ep===s.epA && p.t<=s.t) z=p; if(p.t>s.t) break; } return z; };
const mlZeileNach=(KZ, s)=>{ for(const p of KZ.posen) if(p.ep===s.epB && p.t>=s.t) return p; return null; };
// Orakel (T1 --orakel-rahmen, obere Schranke): g des Abschnitts aus der Wahrheit (Sitzung: gAt(t0); Aufnahme: g[ab]).
const mlOrakelG=(KZ, A)=>{ const O=KZ.opt.orakel; if(!O) return null; const g=O.gAt ? O.gAt(A.t0) : O.g ? O.g[A.ab] : null; return g ? {...g} : null; };
// Hypothesen eines Abschnitts als Lagen (g) zur Zeit des Wechsels nach 'lose'; neu ist eine Hypothese, die neben
// allen alten um > hypNeu.lage (Plan) oder > hypNeu.gierDeg liegt.
const mlHypLagen=reg=>reg && reg.hyp ? reg.hyp.filter(h=>h && h.g).map(h=>({psi:h.g.psi, tx:h.g.tx, tz:h.g.tz})) : [];
const mlHypNeu=(KZ, reg, alt)=>{ const o=KZ.opt.hypNeu, a=alt||[];
  return mlHypLagen(reg).some(h=>a.every(x=>Math.hypot(h.tx-x.tx, h.tz-x.tz)>o.lage || Math.abs(mlWrap(h.psi-x.psi))>o.gierDeg*ML_D2R)); };
const mlStufen=(KZ, kopf)=>{
  const o=KZ.opt, L=KZ.lauf, neuVerbunden=[];
  for(const A of KZ.abschnitte){ const ab=A.ab, alt=A.stufe, sg=A.sig;
    if(ab===KZ.kern){ A.stufe='verbunden'; delete L.probe[ab]; A.w=mlHat('abschnittGewicht') ? G.abschnittGewicht(A) : 1; continue; }
    if(KZ.kern==null){ A.stufe=alt==='lose' ? 'lose' : 'lokal'; }
    else if(alt==='lokal' || alt==='lose' && L.loseVon[ab]!=='locker'){
      // (a) enge Bindung an einen verbundenen Abschnitt, (b) angenommene Registrierung (auf Probe bis zum ersten sig von M6)
      const og=mlOrakelG(KZ, A), gB=og ? null : mlBindungG(KZ, ab), reg=A.reg && A.reg.gewaehlt>=0 ? A.reg.hyp[A.reg.gewaehlt] : null;
      if(og || gB || reg){ A.g=og || gB || {...reg.g}; A.stufe='verbunden'; neuVerbunden.push(ab);
        for(const f of ['loseSeit', 'loseVon', 'lokalSeit', 'regSig']) delete L[f][ab];
        if(!og && !gB) L.probe[ab]={runde:KZ.runde, sig:A.sig || null}; }
      else if(alt==='lokal' && L.tMax-Math.max(A.t1, L.tKern ?? -Infinity, L.lokalSeit[ab] ?? -Infinity)>=o.loseNach && ab<KZ.abschnitte.length-1){
        A.stufe='lose'; L.loseSeit[ab]=L.tMax; L.loseVon[ab]='lokal'; L.regSig[ab]=mlHypLagen(A.reg); }
      else if(alt==='lose' && mlHypNeu(KZ, A.reg, L.regSig[ab])){ A.stufe='lokal'; L.lokalSeit[ab]=L.tMax; for(const f of ['loseSeit', 'loseVon', 'regSig']) delete L[f][ab]; } }
    else if(L.probe[ab] && alt==='verbunden'){
      // (b) zweite Haelfte: erst das erste sig, das M6 nach dem Uebergang geschrieben hat, entscheidet
      if(sg && sg!==L.probe[ab].sig && Number.isFinite(sg.max)){ delete L.probe[ab];
        if(!(sg.max<=o.verbunden.sP && sg.psi<=o.verbunden.sY)) A.stufe='locker'; } }
    else if(sg && Number.isFinite(sg.max)){
      if(alt==='verbunden' && (sg.max>o.locker.max || sg.psi>o.locker.psi)) A.stufe='locker';
      else if(alt==='locker' && sg.max>o.lose.max){ A.stufe='lose'; L.loseSeit[ab]=L.tMax; L.loseVon[ab]='locker'; }
      else if(alt==='locker' && sg.max<=o.verbunden.sP && sg.psi<=o.verbunden.sY) A.stufe='verbunden';
      else if(alt==='lose' && sg.max<o.lose.zurueck){ A.stufe='locker'; delete L.loseSeit[ab]; delete L.loseVon[ab]; } }
    A.w=mlHat('abschnittGewicht') ? G.abschnittGewicht(A) : (A.stufe==='verbunden' || A.stufe==='locker' ? 1 : 0); }
  for(const ab of neuVerbunden) mlRuf('lmEinbinden', KZ, ab);
  return neuVerbunden;
};

// ------------------------------------------------ Folgekanten (5a)
// Zeit der Zustandszeile mit dem groessten Pose-Rest gegen konstante Geschwindigkeit im Kantenintervall.
const mlRestZeit=(KZ, ab, t0, t1)=>{
  const P=KZ.posen; let best=null, bestR=-1;
  for(let i=2;i<P.length;i++){ const z=P[i]; if(z.t<t0 || z.t>t1) continue; if(G.sectionOf(KZ.schnitte, z.t, z.ep)!==ab) continue;
    const a=P[i-1], b=P[i-2], dt=a.t-b.t; if(!(dt>0)) continue; const k=(z.t-a.t)/dt;
    const r=Math.hypot(z.pose[0]-(a.pose[0]+(a.pose[0]-b.pose[0])*k), z.pose[1]-(a.pose[1]+(a.pose[1]-b.pose[1])*k), z.pose[2]-(a.pose[2]+(a.pose[2]-b.pose[2])*k));
    if(r>bestR){ bestR=r; best=z.t; } }
  return best ?? (t0+t1)/2;
};
const mlRest=(KZ, rest)=>{
  const L=KZ.lauf, K=G.KG.KNOTEN, jetzt=new Set(), ev=[];
  for(const r of rest||[]){ if(!(r.chi2>K.chiRest)) continue; const A=KZ.abschnitte[r.ab]; if(!A || !A.knoten || !A.knoten.t) continue;
    const t0=A.knoten.t[r.j], t1=A.knoten.t[r.j+1]; if(!Number.isFinite(t0) || !Number.isFinite(t1)) continue;
    const key=t0+':'+t1; jetzt.add(key); const n=(L.restZahl.get(key)||0)+1; L.restZahl.set(key, n);
    if(n>=K.rundenRest && !L.restGemeldet.has(key)){ L.restGemeldet.add(key); ev.push({typ:'rest', t:mlRestZeit(KZ, r.ab, t0, t1), ab:r.ab, j:r.j, chi2:r.chi2, kante:key}); } }
  for(const key of [...L.restZahl.keys()]) if(!jetzt.has(key)) L.restZahl.delete(key);
  for(const e of ev) G.karteEreignis(KZ, e);
  return ev;
};

// ------------------------------------------------ Umriss, Inseln (8, 9)
const mlEntscheid=w=>w==='ja' ? 'nutzer-ja' : w==='nein' ? 'nutzer-nein' : w==='schrank' ? 'schrank' : null;
const mlPip=(p,P)=>{ let c=false; for(let i=0,j=P.length-1;i<P.length;j=i++){ const a=P[i], b=P[j];
  if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) c=!c; } return c; };
const mlSchwer=P=>{ let x=0, z=0; for(const p of P){ x+=p[0]; z+=p[1]; } return P.length ? [x/P.length, z/P.length] : [NaN, NaN]; };
// Weg (a) mit Hysterese: beide Schnitte bekommen vorher = Umriss der vorigen Runde (phi-Tor inselPhiSetzen/-Loesen, M7).
// Weg (b) wie G.umriss mit opt.hyp (M7): Stufe und Runden aus G.inselBewerten; teil/voll mit Ring nach Rang (voll vor
// teil, supRing, dEn, id), ueberlappende unterdrueckt; nur 'voll' als inselFest in den zweiten Schnitt (7.3), 'teil' als
// offener Ring (entscheid offen, nicht exportiert), 'kandidat' als Kandidat. Vom Nutzer bestaetigte Ringe kommen ueber
// G.umrissEingabe (inselEntscheide) als inselFest.
const mlUmriss=(KZ, kopf, schluss, A)=>{
  const o=KZ.opt, L=KZ.lauf;
  const inp=mlRuf('umrissEingabe', KZ, {nurGlobal:true, minW:0.05});
  if(!inp) return null;
  const opt={...(G.UM_DEF||{}), ...(o.umrissOpt||{}), vorher:KZ.umriss || null};
  let erg=mlRuf('umriss', inp, opt); kopf.arbeit.umriss++;
  if(!erg) return null;
  let bew=[], behalten=[];
  if(!o.ohne.includes('hyp') && mlHat('inselHypothesen')){
    const frei=erg, hyp=(G.inselHypothesen(inp, frei, opt) || []).slice().sort((a,b)=>mlIdVgl(a.id, b.id));
    behalten=hyp.slice(Math.max(0, A.hyp-kopf.arbeit.hyp)).map(h=>L.hypVorher.get(h.id)).filter(Boolean);   // ueber dem Budget: Stand bleibt
    for(const h of hyp){ if(kopf.arbeit.hyp>=A.hyp) break;
      const vorher=L.hypVorher.get(h.id) || null, b=mlRuf('inselBewerten', inp, h, frei, {...opt, vorher}); kopf.arbeit.hyp++;
      if(b) bew.push({b, h, ring:b.ring || null}); }
    const rang={voll:0, teil:1}, gut=bew.filter(x=>x.ring && x.ring.pts && rang[x.b.stufe]!=null)
      .sort((x,y)=>rang[x.b.stufe]-rang[y.b.stufe] || (y.b.supRing||0)-(x.b.supRing||0) || (x.b.dEn??0)-(y.b.dEn??0) || mlIdVgl(x.h.id, y.h.id));
    const genommen=[], drin=p=>(frei.ringe||[]).some(r=>r.art==='insel' && mlPip(p, r.pts)) || genommen.some(x=>mlPip(p, x.ring.pts));
    for(const x of gut) if(!drin(mlSchwer(x.ring.pts)) && !drin(mlSchwer(x.h.poly))) genommen.push(x);
    const voll=genommen.filter(x=>x.b.stufe==='voll');
    if(voll.length){ erg=mlRuf('umriss', {...inp, inselFest:[...(inp.inselFest||[]), ...voll.map(x=>({id:x.h.id, poly:x.h.poly}))]}, opt) || erg; kopf.arbeit.umriss++; }
    erg.ringe=[...(erg.ringe||[])]; erg.kandidaten=[...(erg.kandidaten||[])];
    for(const x of genommen) if(x.b.stufe==='teil') erg.ringe.push({...x.ring, pts:x.ring.pts.map(p=>[p[0], p[1]]), id:x.h.id, art:'insel', quelle:'hypothese', teil:true, entscheid:'offen', exportiert:false});
    for(const x of bew) if(x.b.stufe==='kandidat') erg.kandidaten.push({id:x.h.id, pts:(x.ring ? x.ring.pts : x.h.poly).map(p=>[p[0], p[1]]), grund:'hypothese', dEn:x.b.dEn ?? null, phi:x.b.phi ?? null}); }
  L.hypVorher=new Map([...behalten, ...bew.map(x=>({...x.b}))].map(b=>[b.id, b]));
  erg.hypothesen=bew.map(x=>({...x.b}));
  // Ring.entscheid und exportiert nach 7.3 (Nutzer ueber KZ.inselEntscheide)
  for(const R of erg.ringe||[]){
    if(R.art==='aussen'){ R.entscheid='auto'; R.exportiert=true; continue; }
    const e=mlEntscheid(KZ.inselEntscheide.get(R.id));
    if(e){ R.entscheid=e; R.exportiert=e==='nutzer-ja'; }
    else if(R.teil){ R.entscheid='offen'; R.exportiert=false; }
    else { R.entscheid='auto'; R.exportiert=true; } }
  return erg;
};
// W.ringe, iv[].ring und W.insel mit 3 Runden Hysterese aus dem Umriss dieser Runde (Kritik 37).
const mlRingeAnWaende=(KZ, erg)=>{
  const auf=new Map(), N=3;
  (erg.ringe||[]).forEach((R,ri)=>{ const n=R.pts.length;
    for(let k=0;k<n;k++){ const id=R.waende ? R.waende[k] : null; if(id==null) continue; const W=KZ.waende.get(id); if(!W) continue;
      const a=R.pts[k], b=R.pts[(k+1)%n], u=G.wandU(W.phi), s0=Math.min(u[0]*a[0]+u[1]*a[1], u[0]*b[0]+u[1]*b[1]), s1=Math.max(u[0]*a[0]+u[1]*a[1], u[0]*b[0]+u[1]*b[1]);
      if(!auf.has(id)) auf.set(id, []); auf.get(id).push({ri, art:R.art, s0, s1}); } });
  for(const W of KZ.waende.values()){ if(W.rahmen!==-1) continue;
    const st=auf.get(W.id) || [];
    W.ringe=[...new Set(st.map(x=>x.ri))].sort((a,b)=>a-b);
    for(const v of W.iv||[]){ if(Array.isArray(v)) continue; let r=-1, best=0;
      for(const x of st){ const ov=Math.min(v.s1, x.s1)-Math.max(v.s0, x.s0); if(ov>best){ best=ov; r=x.ri; } } v.ring=r; }
    const an=st.some(x=>x.art==='insel'), z=W.insel || 'nein';
    if(z==='ja'){ if(an) W.inselRunden=0; else if(++W.inselRunden>=N){ W.insel='nein'; W.inselRunden=0; } }
    else if(an){ W.inselRunden=(z==='verdacht' ? W.inselRunden : 0)+1; W.insel=W.inselRunden>=N ? 'ja' : 'verdacht'; if(W.insel==='ja') W.inselRunden=0; }
    else { W.insel='nein'; W.inselRunden=0; } }
};

// ------------------------------------------------ Registrierung faellig (4)
// Stempel der globalen Karte: Zahl der globalen Waende mit zustand != 'kandidat' (die nimmt G.registriere) und
// die verbundenen/lockeren Abschnitte. Faellig: nie registriert, Schluessel-Beob des Abschnitts um >= regWachsen
// (mindestens 1) gewachsen, globale Karte um >= regWachsen (mindestens 1 Wand) gewachsen oder andere verbundene
// Abschnitte. Das Wachstum statt jeder neuen Beob: der laufende Abschnitt bekommt fast jede Runde Schluessel-Beob,
// und ein Aufruf kostet auf A7 (Mac) bis 120 ms, auch mit nur 110-170 Vorhersagen (gemessen, Bericht P-H).
const mlRegStempel=KZ=>{ let n=0; for(const W of KZ.waende.values()) if(W.rahmen===-1 && W.zustand!=='kandidat') n++;
  return {n, verb:KZ.abschnitte.filter(A=>A.stufe==='verbunden' || A.stufe==='locker').map(A=>A.ab).join(',')}; };
const mlRegFaellig=(KZ, S, st)=>{ const r=KZ.lauf.regStand[S.ab];
  if(!r || typeof r!=='object') return true;
  const w=x=>x+Math.max(1, Math.ceil(KZ.opt.regWachsen*x));
  return S.nSchluessel>=w(r.nS) || S.nSchluessel<r.nS || r.verb!==st.verb || st.n>=w(r.n); };

// ------------------------------------------------ Landmarken pflegen (7) mit Arbeitsbudget
// Lageversion je Abschnitt: +1, wenn g sich seit dem Bezugswert um > gP bzw. gPsiDeg bewegt oder die Knotenzahl
// sich geaendert hat (Intervalle globaler Waende haengen ueber G.gBei an g).
const mlGVersionen=(KZ)=>{ const L=KZ.lauf, s=KZ.opt.lmSchwelle;
  for(const A of KZ.abschnitte){ const g=A.g, nk=A.knoten && A.knoten.t ? A.knoten.t.length : 0, v=L.gVersion[A.ab];
    if(!v){ L.gVersion[A.ab]={v:0, g:g ? {...g} : null, nk}; continue; }
    const bew=!g!==!v.g || nk!==v.nk || !!g && (Math.hypot(g.tx-v.g.tx, g.ty-v.g.ty, g.tz-v.g.tz)>s.gP || Math.abs(mlWrap(g.psi-v.g.psi))>s.gPsiDeg*ML_D2R);
    if(bew){ v.v++; v.g=g ? {...g} : null; v.nk=nk; } } };
// Senkrechte Ecken nahe der Linie (<= 0,15 m quer, gleicher Rahmen; lmHoehenklasse nimmt sie als Hoehenbeleg an den
// Enden, M5 eckBeleg 0,10 m / 0,30 m) mit Lage laengs (5 cm) und top (1 cm): aendert sich das, ist die Wand neu zu klassieren.
const mlEckNah=(KZ, W)=>{ const n=G.wandN(W.phi), u=G.wandU(W.phi); let z='';
  for(const E of KZ.ecken.values()){ if(E.rahmen!==W.rahmen || !E.senk || !E.p || Math.abs(n[0]*E.p[0]+n[1]*E.p[1]-W.rho)>0.15) continue;
    z+=E.id+':'+Math.round(20*(u[0]*E.p[0]+u[1]*E.p[1]))+':'+(Number.isFinite(E.top) ? Math.round(100*E.top) : '-')+';'; }
  return z; };
// Eingang einer Wand fuer lmDurchblick/lmIntervalle/lmHoehenklasse, soweit er sich billig fassen laesst.
const mlLmEingang=(KZ, W, schlR)=>{ const L=KZ.lauf, A=W.rahmen>=0 ? KZ.abschnitte[W.rahmen] : null; let gv=0;
  if(W.rahmen===-1) for(const ab of W.abschnitte||[]){ const v=L.gVersion[ab]; if(v) gv+=v.v; }
  return {nB:W.beob ? W.beob.length : 0, nS:W.nSchluessel|0, phi:W.phi, rho:W.rho, h:W.h, nR:schlR.get(W.rahmen)||0,
    hc:W.rahmen===-1 ? KZ.hC : A && A.hLok ? A.hLok.hC : null, hf:W.rahmen===-1 ? KZ.hF : 0, gv, eck:mlEckNah(KZ, W), runde:KZ.runde}; };
// Rueckgabe: der erste geaenderte Eingang ('' = unveraendert), fuer die Zaehlung in KZ.lauf.lmStat.grund
const mlLmGeaendert=(KZ, B, E)=>{ const s=KZ.opt.lmSchwelle, d=(a,b,t)=>Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a-b)>t : !Object.is(a, b);
  return B.nB!==E.nB || B.nS!==E.nS ? 'beob' : Math.abs(mlWrap((E.phi||0)-(B.phi||0)))>s.phiDeg*ML_D2R || d(E.rho, B.rho, s.rho) ? 'lage'
    : (typeof E.h==='number' || typeof B.h==='number' ? d(E.h, B.h, s.h) : E.h!==B.h) ? 'h' : E.nR>(1+s.rahmen)*B.nR ? 'rahmen'
    : d(E.hc, B.hc, s.hBezug) || d(E.hf, B.hf, s.hBezug) ? 'hBezug' : E.gv!==B.gv ? 'g' : E.eck!==B.eck ? 'ecken' : ''; };
// Auswahl der Runde in drei Stufen, je Stufe reihum nach id ab dem Zeiger der vorigen Runde, zusammen hoechstens budget:
// 0 neu, neue Beob oder offene Hysterese der Hoehenklasse (clsZaehler > 0, cls 'kandidat'); 1 anderer Eingang geaendert
// (Lage, Hoehe, Rahmen, Hoehenbezug, Abschnittslage, senkrechte Ecken nahe der Linie); 2 ohne Besuch seit lmAlle Runden. Ohne Stufen fiel auf A8 der
// Kern weg: eine neue Ecke machte alle Waende neu (Stempel ueber alle Ecken), die Waende dahinter warteten (gemessen, Bericht P-H).
const mlLmWahl=(KZ, budget, alle)=>{ const L=KZ.lauf, ids=[...KZ.waende.keys()].sort(mlIdVgl), schlR=new Map();
  for(const W of KZ.waende.values()) schlR.set(W.rahmen, (schlR.get(W.rahmen)||0)+(W.nSchluessel|0));
  for(const id of [...L.lmBesuch.keys()]) if(!KZ.waende.has(id)) L.lmBesuch.delete(id);
  let i0=0; if(L.lmZeiger!=null){ i0=ids.findIndex(id=>mlIdVgl(id, L.lmZeiger)>0); if(i0<0) i0=0; }
  const stufe=[[], [], []], grund={};
  for(let k=0;k<ids.length;k++){ const id=ids[(i0+k)%ids.length], W=KZ.waende.get(id), B=L.lmBesuch.get(id);
    if(alle || !B || B.nB!==(W.beob ? W.beob.length : 0) || B.nS!==(W.nSchluessel|0) || W.clsZaehler>0 || W.cls==='kandidat'){ stufe[0].push(id); continue; }
    const gr=mlLmGeaendert(KZ, B, mlLmEingang(KZ, W, schlR));
    if(gr){ stufe[1].push(id); grund[gr]=(grund[gr]||0)+1; } else if(KZ.runde-B.runde>=KZ.opt.lmAlle) stufe[2].push(id); }
  const wahl=[...stufe[0], ...stufe[1], ...stufe[2]].slice(0, budget);
  if(wahl.length) L.lmZeiger=wahl[wahl.length-1];
  L.lmStat={n:ids.length, s0:stufe[0].length, s1:stufe[1].length, s2:stufe[2].length, wahl:wahl.length, grund};
  return {wahl:wahl.sort(mlIdVgl), schlR}; };

// ------------------------------------------------ Stand, Pruefsumme, Abschluss
const mlArr=a=>a==null ? a : Array.from(a);
const mlIv=iv=>(iv||[]).map(v=>Array.isArray(v) ? [...v] : {...v});
const mlKnotenListe=(A)=>{ const K=A.knoten; if(!K || !K.t) return null;
  const n=Math.min(K.t.length, K.d ? Math.floor(K.d.length/4) : 0), out=[];
  for(let j=0;j<n;j++) out.push({t:K.t[j], d:[K.d[4*j], K.d[4*j+1], K.d[4*j+2], K.d[4*j+3]]});
  return out; };
const mlWandStand=(W)=>{ return {id:W.id, phi:W.phi, rho:W.rho, cov:mlArr(W.cov), cls:W.cls, h:W.h, sSchwer:W.sSchwer, iv:mlIv(W.iv), boden:mlIv(W.boden),
  nBeob:W.beob ? W.beob.length : 0, nStandpunkte:W.nStandpunkte, zustand:W.zustand, ringe:[...(W.ringe||[])], insel:W.insel}; };
const mlHinweise=(KZ, stand)=>{
  const H=[], A=KZ.abschnitte, lauf=A[A.length-1];
  if(lauf && lauf.stufe==='lokal') H.push({code:'teil-lokal', ab:lauf.ab});
  for(const a of A) if(a.stufe==='lose' && a.mitWand) H.push({code:'abschnitt-lose', ab:a.ab});
  for(const E of stand.ecken){ const s=E.cov ? Math.sqrt(Math.max(E.cov[0], E.cov[2])) : Infinity; if(!E.senk && s>KZ.opt.eckeSigma) H.push({code:'zur-ecke', ecke:E.id}); }
  if(KZ.umriss && !stand.ringe.some(r=>r.art==='aussen')) H.push({code:'luecke'});
  for(const b of stand.hypothesen||[]) if(b.stufe==='teil') H.push({code:'insel-erkannt', ring:b.id});
  for(const k of stand.kandidaten||[]) if(k.grund==='rund') H.push({code:'insel-rund', ring:k.id});
  for(const W of stand.waende) if(W.cls==='schrank') H.push({code:'schrank', wand:W.id});
  return H;
};
const mlStand=(KZ, kopf, fehler)=>{
  const lauf=KZ.abschnitte[KZ.abschnitte.length-1], U=KZ.umriss;
  const waende=[...KZ.waende.values()].filter(W=>W.rahmen===-1).sort((a,b)=>mlIdVgl(a.id, b.id)).map(mlWandStand);
  const lokal=lauf && lauf.stufe==='lokal' ? {ab:lauf.ab, waende:[...KZ.waende.values()].filter(W=>W.rahmen===lauf.ab).sort((a,b)=>mlIdVgl(a.id, b.id))
    .map(W=>({id:W.id, phi:W.phi, rho:W.rho, cls:W.cls, iv:mlIv(W.iv)}))} : null;
  const ecken=[...KZ.ecken.values()].filter(E=>E.rahmen===-1).sort((a,b)=>mlIdVgl(a.id, b.id)).map(E=>({id:E.id, p:mlArr(E.p), cov:mlArr(E.cov), art:E.art, senk:E.senk, waende:mlArr(E.waende)}));
  const stand={v:3, t:KZ.lauf.tMax, runde:KZ.runde, waende, lokal, ecken,
    ringe:U ? (U.ringe||[]).map(R=>({...R, pts:R.pts.map(p=>[p[0], p[1]]), waende:mlArr(R.waende), sup:mlArr(R.sup), hyp:mlArr(R.hyp)})) : [],
    kandidaten:U ? (U.kandidaten||[]).map(k=>({id:k.id, pts:k.pts, grund:k.grund})) : [], hypothesen:U ? (U.hypothesen||[]).map(b=>({...b})) : [],
    abschnitte:KZ.abschnitte.map(A=>({ab:A.ab, t0:A.t0, t1:A.t1, g:A.g ? {psi:A.g.psi, tx:A.g.tx, ty:A.g.ty, tz:A.g.tz} : null, sig:A.sig ? {...A.sig} : null,
      stufe:A.stufe, w:A.w, mitWand:A.mitWand, knoten:mlKnotenListe(A)})),
    hoehen:{hC:KZ.hC, sHC:KZ.sHC, hF:KZ.hF, sHF:KZ.sHF, skala:KZ.skala, quelle:KZ.hoehen.quelle, q:KZ.hoehen.q},
    hinweise:[], arbeit:{...kopf.arbeit}, ms:{...kopf.ms}, abschluss:{bereit:false, fehlt:[], ausgeschlossen:[]}, fehler:fehler||null};
  stand.hinweise=mlHinweise(KZ, stand);
  return stand;
};
// FNV-1a (zweimal 32 bit) ueber Waende (auch lokale), Abschnitte mit Knoten und Ringe, Zahlen auf
// 1/kopfRaster gerundet (Geraetevergleich, 10.9), Reihenfolge nach id bzw. ab.
const mlKopf=(KZ)=>{
  const r=KZ.opt.kopfRaster, z=x=>Number.isFinite(x) ? String(Math.round(x*r)) : String(x), T=[];
  for(const W of [...KZ.waende.values()].sort((a,b)=>mlIdVgl(a.id, b.id))) T.push('W', String(W.id), String(W.rahmen), z(W.phi), z(W.rho), String(W.cls), String(W.zustand));
  for(const A of KZ.abschnitte){ T.push('A', String(A.ab), A.stufe, A.g ? [A.g.psi, A.g.tx, A.g.ty, A.g.tz].map(z).join(',') : '-');
    const K=mlKnotenListe(A); if(K) for(const k of K) T.push(z(k.t), k.d.map(z).join(',')); }
  if(KZ.umriss) for(const R of KZ.umriss.ringe||[]) T.push('R', String(R.art), R.pts.map(p=>z(p[0])+','+z(p[1])).join(';'));
  const s=T.join('|'); let h1=0x811c9dc5, h2=0x01000193^0x5bd1e995;
  for(let i=0;i<s.length;i++){ const c=s.charCodeAt(i); h1=Math.imul(h1^c, 0x01000193); h2=Math.imul(h2^c, 0x01000193)^(h2>>>15); }
  return (h1>>>0).toString(16).padStart(8,'0')+(h2>>>0).toString(16).padStart(8,'0');
};
const mlTopo=stand=>stand.ringe.filter(R=>R.exportiert!==false).map(R=>R.art[0]+R.pts.length).join(',');
// Einfacher Ring: keine zwei nicht benachbarten Kanten schneiden sich.
const mlEinfach=(P)=>{ const n=P.length; if(n<3) return false;
  const kreuz=(a,b,c,d)=>{ const o=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]); return o(a,b,c)*o(a,b,d)<0 && o(c,d,a)*o(c,d,b)<0; };
  for(let i=0;i<n;i++) for(let j=i+2;j<n;j++){ if(i===0 && j===n-1) continue; if(kreuz(P[i], P[(i+1)%n], P[j], P[(j+1)%n])) return false; }
  return true; };
// Sigma einer Ringecke aus den beiden Wandkovarianzen (Schnitt zweier Linien, erste Ordnung).
const mlEckeSigma=(Wa, Wb)=>{
  if(!Wa || !Wb || !Wa.cov || !Wb.cov) return Infinity;
  const p=G.wandSchnitt(Wa, Wb); if(!p) return Infinity; const e=1e-6, J=[];
  for(const [W, k] of [[Wa,'phi'], [Wa,'rho'], [Wb,'phi'], [Wb,'rho']]){ const X={...W, [k]:W[k]+e}, q=W===Wa ? G.wandSchnitt(X, Wb) : G.wandSchnitt(Wa, X); if(!q) return Infinity; J.push([(q[0]-p[0])/e, (q[1]-p[1])/e]); }
  const C=(W)=>[[W.cov[0], W.cov[1]], [W.cov[1], W.cov[2]]], Ca=C(Wa), Cb=C(Wb); let sxx=0, szz=0;
  for(let i=0;i<2;i++) for(let j=0;j<2;j++){ sxx+=J[i][0]*Ca[i][j]*J[j][0]+J[2+i][0]*Cb[i][j]*J[2+j][0]; szz+=J[i][1]*Ca[i][j]*J[j][1]+J[2+i][1]*Cb[i][j]*J[2+j][1]; }
  return Math.sqrt(Math.max(sxx, szz, 0)); };
G.karteAbschluss=(stand, verlauf)=>{
  const fehlt=[], o=ML_DEF, V=verlauf && verlauf.topo ? verlauf : {t:stand.t, topo:[], loseSeit:{}};
  const aussen=stand.ringe.find(R=>R.art==='aussen' && R.exportiert!==false);
  if(!aussen || !mlEinfach(aussen.pts)) fehlt.push('aussenring');
  const offen=stand.abschnitte.filter(A=>A.mitWand && !(A.stufe==='verbunden' || A.stufe==='lose' && V.loseSeit && Number.isFinite(V.loseSeit[A.ab]) && stand.t-V.loseSeit[A.ab]>=o.loseErledigt));
  if(offen.length) fehlt.push('abschnitte:'+offen.map(A=>A.ab).join(','));
  if(aussen){ const wd=new Map(stand.waende.map(W=>[W.id, W])), senk=stand.ecken.filter(E=>E.senk);
    const n=aussen.pts.length; let schlecht=0;
    for(let k=0;k<n;k++){ const p=aussen.pts[k], Wa=wd.get(aussen.waende ? aussen.waende[(k+n-1)%n] : null), Wb=wd.get(aussen.waende ? aussen.waende[k] : null);
      if(senk.some(E=>Math.hypot(E.p[0]-p[0], E.p[1]-p[1])<=0.10)) continue;
      if(!(mlEckeSigma(Wa, Wb)<=o.eckeSigma)) schlecht++; }
    if(schlecht) fehlt.push('ecken:'+schlecht); }
  if(stand.ringe.some(R=>R.art==='insel' && R.entscheid==='offen') || (stand.hypothesen||[]).some(b=>b.stufe==='teil' && !stand.ringe.some(R=>R.id===b.id && R.entscheid!=='offen')))
    fehlt.push('insel-offen');
  const T=V.topo||[], jetzt=mlTopo(stand); let i=T.length; while(i>0 && T[i-1].topo===jetzt) i--;
  const gleich=T.length-i; if(gleich<o.topoRunden || !(stand.t-T[i].t>=o.topoDauer)) fehlt.push('stabil');
  const ausgeschlossen=stand.abschnitte.filter(A=>A.mitWand && (A.stufe==='lokal' || A.stufe==='lose')).map(A=>A.ab);
  return {bereit:!fehlt.length, fehlt, ausgeschlossen};
};
G.karteRundeKopf=KZ=>KZ.lauf.letzte ? JSON.parse(JSON.stringify(KZ.lauf.letzte)) : null;

// ------------------------------------------------ Runde
G.karteRechnen=(KZ, o0={})=>{
  const o={umriss:true, schluss:false, ...o0}, L=KZ.lauf, opt=KZ.opt, A={...opt.arbeit, ...(o.arbeit||{})}, tU=mlUhr(KZ), ms={};
  KZ.runde++;
  const kopf={runde:KZ.runde, t:L.tMax, kBis:L.kBis, tPose:L.tPose, epoche:KZ.epoche, verdraengt:L.verdraengt.splice(0),
    arbeit:{iter:0, lin:0, relin:0, reg:0, umriss:0, hyp:0, knoten:0, lm:0}, lago:null, ldl:{n:0, nnzL:0, ordnung:null}, ms, kopf:null};
  const stumm=[]; let fehler=null, stand=null;
  const mess=(k, f)=>{ const t=mlUhr(KZ); const r=f(); ms[k]=(ms[k]||0)+mlUhr(KZ)-t; return r; };
  try{
    mlWarte(KZ);
    // 1, 2 Schnitte, Abschnitte, Startwerte
    mess('schnitte', ()=>{ mlSchnitte(KZ); mlZeiten(KZ);
      if(KZ.abschnitte.some(a=>!a.g0)){ const r=mlRuf('ketteStart', KZ.schnitte, KZ.abschnitte); if(Array.isArray(r) && r.length===KZ.abschnitte.length) KZ.abschnitte=r; else if(r==null) stumm.push('ketteStart'); } });
    mlZaehlen(KZ);
    // 3 Kern
    if(KZ.kern==null){ const k=mlKernSuchen(KZ);
      if(k!=null){ const K=KZ.abschnitte[k], og=mlOrakelG(KZ, K);   // Orakel (T1 --orakel-rahmen): F0 = Rahmen der Wahrheit
        KZ.kern=k; L.tKern=L.tMax; K.stufe='verbunden'; K.g=og ? {...og} : mlEins(); K.cov=null;
        if(K.knoten && K.knoten.d) K.knoten.d.fill(0, 0, 4);
        mlRuf('lmEinbinden', KZ, k); } }
    // 4 Registrierung (Budget in Vorhersagen, reihum nach ab ab dem Zeiger; faellig nach mlRegFaellig)
    if(KZ.kern!=null && opt.reg && !opt.ohne.includes('reg')) mess('reg', ()=>{ let rest=A.reg;
      const st=mlRegStempel(KZ), n=KZ.abschnitte.length, z=((L.regZeiger|0)%Math.max(1, n)+n)%Math.max(1, n);
      const reihe=KZ.abschnitte.filter(S=>(S.stufe==='lokal' || S.stufe==='lose') && S.ab!==KZ.kern && S.nSchluessel && mlRegFaellig(KZ, S, st))
        .sort((a,b)=>(a.ab-z+n)%n-(b.ab-z+n)%n);
      for(const S of reihe){ if(rest<=0) break;
        const vorReg=S.reg, vorG0=S.g0, r=mlRuf('registriere', KZ, S.ab, {arbeit:rest});
        if(!r){ stumm.push('registriere'); break; }
        const v=r.arbeit && typeof r.arbeit==='object' ? r.arbeit.vorhersagen : r.arbeit, used=Number.isFinite(v) ? Math.max(0, Math.min(rest, v)) : rest;
        rest-=Math.max(used, opt.regMin); kopf.arbeit.reg+=used;
        if(S.reg===vorReg) S.reg={hyp:r.hyp||[], gewaehlt:r.gewaehlt ?? -1, verhaeltnis:r.verhaeltnis ?? null, versuche:((vorReg && vorReg.versuche)||0)+1};
        if(S.g0===vorG0 && S.reg.gewaehlt>=0 && S.reg.hyp[S.reg.gewaehlt]) S.g0={...S.reg.hyp[S.reg.gewaehlt].g};
        L.regStand[S.ab]={nS:S.nSchluessel, n:st.n, verb:st.verb}; L.regZeiger=S.ab+1; } });
    // 4a Knoten
    if(opt.knoten && KZ.kern!=null) for(const S of KZ.abschnitte){ if(!(S.stufe==='verbunden' || S.stufe==='locker')) continue;
      const vor=S.knoten && S.knoten.t ? S.knoten.t.length : 0, kn=mlRuf('knotenSetzen', S, KZ.posen, KZ.beob, G.KG.KNOTEN);
      if(kn && kn.t){ S.knoten=kn; kopf.arbeit.knoten+=Math.max(0, kn.t.length-vor); } }
    // 5 Ausgleich (global transaktional, dann lokal je Abschnitt)
    if(KZ.kern!=null) mess('ausgleich', ()=>{
      const st=mlStruktur(KZ), grund=mlStrukturGrund(L.struktur, st, o.schluss); L.struktur=st;
      const lago=opt.lago==='immer' ? 'immer' : opt.lago==='auto' && grund ? 'immer' : 'aus';
      if(lago==='immer') kopf.lago={grund:grund || 'immer'};
      // J1 (P-D): lmBloecke mit denselben Optionen wie der folgende lmAusgleich (sonst verfallen die Bloecke mit Knoten),
      // und seine neu linearisierten Reste gehen vom gemeinsamen Rundenbudget relin ab (sonst bis 2 x relin je Runde)
      const nb=mlHat('lmBloecke') ? G.lmBloecke(KZ, {knoten:!!opt.knoten, pp:opt.pp, nurAb:null, max:A.relin}) : null, relinRest=Math.max(0, A.relin-(nb && nb.relin|0));
      if(nb) kopf.arbeit.relin+=nb.relin|0;
      const r=mlRuf('lmAusgleich', KZ, {iter:A.iter, relinMax:relinRest, lin:A.lin, kette:true, laserH:KZ.H ? KZ.H.laser : null, skala:opt.skala, knoten:!!opt.knoten,
        lago, strukturwechsel:grund, pp:opt.pp, tiefe:opt.tiefe, ebenen:opt.ebenen, nurAb:null, orakel:opt.orakel});
      if(!r) stumm.push('lmAusgleich');
      else { kopf.arbeit.iter+=r.iter|0; kopf.arbeit.lin+=r.lin|0; kopf.arbeit.relin+=r.relin|0; if(r.ldl) kopf.ldl={...r.ldl};
        if(!r.ok) L.ausgleichOhne=(L.ausgleichOhne||0)+1;
        // 5a Folgekanten
        if(opt.knoten) mlRest(KZ, r.rest || []); } });
    for(const S of KZ.abschnitte){ if(S.stufe!=='lokal' || !S.nSchluessel || L.lokalStand[S.ab]===S.nSchluessel || S.ab===KZ.kern) continue;
      const r=mess('ausgleich', ()=>mlRuf('lmAusgleich', KZ, {iter:A.iter, relinMax:A.relin, nurAb:S.ab, knoten:false, lago:'aus', laserH:KZ.H ? KZ.H.laser : null}));
      if(!r) stumm.push('lmAusgleich(nurAb)'); else { kopf.arbeit.iter+=r.iter|0; kopf.arbeit.relin+=r.relin|0; }
      L.lokalStand[S.ab]=S.nSchluessel; }
    // 6 Stufen, Einbinden, neu zuordnen
    mess('stufen', ()=>{ mlStufen(KZ, kopf);
      if(mlHat('lmNeuZuordnen')) for(const S of KZ.abschnitte) if(S.stufe==='verbunden' || S.stufe==='locker') G.lmNeuZuordnen(KZ, S.ab); });
    mlZaehlen(KZ);
    // 7 Landmarken pflegen
    // 7 Landmarken pflegen: nur die Auswahl aus mlLmWahl (Schlussrunde: alle); Waende, die erst beim Zusammenfuehren oder
    // Trennen entstehen, bekommen Intervalle und Klasse sofort und gelten in der naechsten Runde als neu.
    mess('landmarken', ()=>{ mlGVersionen(KZ);
      const {wahl, schlR}=mlLmWahl(KZ, o.schluss ? Infinity : Math.max(0, A.lm ?? Infinity), !!o.schluss), vor=new Set(KZ.waende.keys());
      if(mlHat('lmDurchblick')) for(const id of wahl){ const W=KZ.waende.get(id), r=G.lmDurchblick(W, KZ); if(r) W.durchblick=r.durchblick || []; }
      if(mlHat('lmZusammenfuehren')) G.lmZusammenfuehren(KZ);
      if(mlHat('lmTrennen')) G.lmTrennen(KZ);
      const neuW=[...KZ.waende.keys()].filter(id=>!vor.has(id)).sort(mlIdVgl), rechne=[...wahl.filter(id=>KZ.waende.has(id)), ...neuW].sort(mlIdVgl);
      if(mlHat('lmIntervalle')) for(const id of rechne){ const W=KZ.waende.get(id), iv=G.lmIntervalle(W, KZ); if(iv) W.iv=iv; }
      if(mlHat('lmHoehenklasse')) for(const id of rechne){ const W=KZ.waende.get(id); if(L.schrank.has(id) || W.fest) continue;
        const k=G.lmHoehenklasse(W, KZ); if(k) W.cls=k==='lokal' ? 'wand' : k; }
      for(const id of wahl){ const W=KZ.waende.get(id); if(W) L.lmBesuch.set(id, mlLmEingang(KZ, W, schlR)); }
      kopf.arbeit.lm=rechne.length; });
    // 8, 9 Umriss und Inseln (live hoechstens jede umrissJede. Runde; offline gleich)
    const umJetzt=o.umriss && opt.umriss && !opt.ohne.includes('umriss') && KZ.kern!=null && (o.schluss || L.entscheidNeu || KZ.runde%Math.max(1, opt.umrissJede)===0);
    if(umJetzt) mess('umriss', ()=>{ const erg=mlUmriss(KZ, kopf, o.schluss, A);
      if(erg){ KZ.umriss=erg; mlRingeAnWaende(KZ, erg); L.entscheidNeu=false; } else stumm.push('umriss'); });
    // 10 Stand und Abschluss
    const EF=L.eingangFehler; L.eingangFehler=null;
    stand=mlStand(KZ, kopf, [stumm.length ? 'ohne Ergebnis: '+[...new Set(stumm)].join(', ') : '', EF ? `Eingang: ${EF.msg} (${EF.n}×)` : ''].filter(Boolean).join('; ') || null);
    L.verlauf.push({runde:KZ.runde, t:stand.t, topo:mlTopo(stand)}); if(L.verlauf.length>opt.verlaufMax) L.verlauf.shift();
    stand.abschluss=G.karteAbschluss(stand, {t:stand.t, topo:L.verlauf, loseSeit:{...L.loseSeit}});
  }catch(e){
    fehler=String(e && e.message || e); L.zuletztFehler={runde:KZ.runde, msg:fehler};
    try{ stand=mlStand(KZ, kopf, fehler); }catch(e2){ stand={v:3, t:L.tMax, runde:KZ.runde, waende:[], lokal:null, ecken:[], ringe:[], kandidaten:[], hypothesen:[],
      abschnitte:[], hoehen:{}, hinweise:[], arbeit:{...kopf.arbeit}, ms:{}, abschluss:{bereit:false, fehlt:['fehler'], ausgeschlossen:[]}, fehler}; }
  }
  ms.zuordnen=L.msZuordnen; ms.tiefe=L.msTiefe; L.msZuordnen=0; L.msTiefe=0; ms.gesamt=mlUhr(KZ)-tU;
  try{ kopf.kopf=mlKopf(KZ); }catch(e){ kopf.kopf=null; if(!stand.fehler) stand.fehler=String(e && e.message || e); }
  // KarteStand.ms mit den Feldern aus 3.6; RundeKopf.ms traegt zusaetzlich die Zeiten je Schritt (schnitte, reg, stufen, landmarken)
  stand.ms={zuordnen:ms.zuordnen||0, ausgleich:ms.ausgleich||0, umriss:ms.umriss||0, raster:0, tiefe:ms.tiefe||0, gesamt:ms.gesamt}; KZ.ms={...ms};
  L.letzte=kopf;
  return {stand, kopf};
};
