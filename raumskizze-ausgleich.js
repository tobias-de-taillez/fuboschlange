// ------------------------------------------------ Karte: Ausgleich (M6)
// Der einzige gemeinsame Ausgleich der Karte im Bild-Fehlermass (ARCHITEKTUR v3: 4 Block M6, 5.3, 5.4, 6.1, 6.2,
// 6.5, 3.2.1, 3.2.3; Bauauftrag 17.5). Die Datei steht wortgleich als eigener Block { ... } im geo-Block; sie setzt G
// mit M0 (G.gKomp, G.gInv, G.gBei, G.gmGewicht, G.hyst, G.wandSchnitt, G.ldl*) voraus und haengt nur an G:
//   G.resSegment, G.resSenk, G.resTiefe, G.resEbene, G.lmBloecke, G.lmAusgleich, G.covBlock, G.fehlerband.
// Zur Laufzeit ruft sie M4: G.resKette (Max-Mixture-Bindung), G.resKnoten (Folgekante), G.abschnittSigma.
// Kein DOM, keine Uhr, kein Math.random: laeuft im Hauptfaden, im Worker und in Node. Hilfsfunktionen sind const im
// Block (keine function-Deklarationen: der geo-Block laeuft ohne "use strict", Annex B wuerde sie global machen).
//
// Unbekannte (global): je verbundenem Abschnitt der Versatz G_j = gBei(A, t_j) an jedem Knoten (ohne Knoten nur
//   G_0 = A.g); der Kern hat G_0 = Einheit fest (Eichung, d_0 = 0), ein Abschnitt mit A.fest und quelle 'kette' (M10 Weg (c),
//   ARCHITEKTUR 19.2 Z9: A.g = g_kern ∘ g0) haelt G_0 = A.g ganz fest (tyKette 'fest', Vorgabe; rep/m6b: mit freiem ty schob
//   die Parallaxe ganze Ketten von Abschnitten um 16-46 cm, A7 ab 6-9, A8 ab 11-13). Ein anderer A.fest (oder tyKette als
//   Zahl bzw. null) haelt nur den Plan von G_0 (psi, tx, tz); ty bleibt Unbekannte mit Anker bzw. der Bindung des Schnitts
//   (6.1, rep/q1 ty-vgl: mit festem ty lag es 6,6/3,7/8,3 cm im Median neben der Kette). Zwischen den Knoten ist gBei komponentenweise
//   linear in den G_j, denn gKomp(g, lerp(d_j, d_j+1)) = lerp(gKomp(g, d_j), gKomp(g, d_j+1)); M6 schreibt
//   d_j = gKomp(gInv(G_0), G_j). Dazu je Wand phi, rho (und eine eigene Hoehe bei h = Zahl oder 'lokal'), je freier
//   Ecke p, global h_c, h_f, die Raumrichtung phi_ref der weichen Rechtwinkligkeit (je Aufruf neu gestartet) und mit
//   pp 'frei' der Hauptpunkt (cx, cy). Lokal (nurAb): Waende/Ecken mit rahmen = ab, hLok.hC und hLok.hF (Boden des
//   Bezugs), g fest Einheit; lokal gilt h_c = H mit sigma sHlok bei h_f = 0 (lokH 'hc', Vorgabe) bzw. h_c - h_f = H,
//   h_f ~ hfLok (lokH 'hcf'), siehe 19.2 Z4 und DEF_A.
// Reste: Segmentende r = f·asin(n_c·d) px gegen die Ebene durch die Kamera, die die Linie enthaelt; Senkrechte gegen
//   die senkrechte Ebene durch Kamera und Ecke. Jacobi analytisch. Ketten (G.resKette, Max-Mixture mit Hysterese) und
//   Folgekanten (G.resKnoten, ohne Robustkern) mit zentralen Differenzen ueber G (je Schnitt <= 8 bzw. 12 Werte).
//   Weich (6.2): h_c ~ H - dBoden (dBoden: Boden des Kerns ueber dem Boden von B_0 entlang der Kette, bodenVersatz); mit
//   Bodenkanten (Gruppen 'f') schwach (sigma hcPrior) und dazu h_f ~ hfPrior[0] - dBoden und h_c - h_f = H mit sigma_H(q);
//   ohne Boden ist h_f nicht im Ausgleich und h_c eng an H - dBoden gebunden (sigma hcPriorOhneBoden, Vorgabe 1 mm: die
//   Parallaxe verfaelscht h_c auf A6-A8 um 28-34 cm, rep/m6b). Rechtwinkligkeit phi - phi_ref - k·90° (sigma 1,5°,
//   nur bis rundDeg), pp ~ N(0, ppSigma). Robust: Geman-McClure je Beob mit GNC-Stufe mu (6.5); gmC gilt in Einheiten
//   von sigma (rn = sqrt(chi2/nr), chi2 = r^2/sPx^2), also nur bei sPx = 1 in px.
// Bloecke (5.3): Normalgleichungen je (Landmarke, Abschnitt, Knotenintervall) am Linearisierungspunkt, als lineares
//   Modell r ≈ r0 + J (x - x0) weitergefuehrt; neu linearisiert nur bei Bewegung ueber die Schwellen, neuen Beob oder
//   neuer GNC-Stufe, hoechstens relinMax Reste je Aufruf (Rangfolge: neu, Beob geaendert, bewegt, mu; dann Schluessel;
//   bei erschoepftem Budget kein Block mehr, ueberschritten hoechstens um einen Block je Aufruf).
//   Schluessel 'L:ab:j' (Decke bzw. eigene Hoehe), 'L:ab:j:f' (Bodenkante derselben Wand: andere Hoehenspalte),
//   'EL:ab:j' (Ecke). Ohne Knoten 7×7 (phi, rho, h, psi, tx, ty, tz), mit Knoten 11×11 (… G_j, G_j+1); Ecken 6/10
//   bzw. 8/12 (Schnitt zweier Waende); pp frei: +2.
// Loeser (5.4): duennbesetzt ueber G.ldlOrdnung/ldlSymb (nur bei Strukturwechsel)/ldlNum/ldlLoes, Daempfung 1e-8·diag.
//   Stufen: 1 Gier linear (Richtung je Segment, Folgekanten, Ketten, Manhattan-Rundung), 2 linear im Strahlbild bei
//   festen Gieren mit GNC (lin Loesungen, mu/gncFaktor), 3 Gauss-Newton im Bild (iter). Stufe 1/2 nur mit lago 'immer'
//   oder 'auto' bei Strukturwechsel (Kern, verbunden, Knoten, Max-Mixture, Registrierung, Schluss).
// Kovarianz: Takahashi-Gleichungen auf dem Muster von L (alle Diagonalbloecke in einem Durchgang). Je Wand dazu W.band
//   (Querblock Wand × G am letzten Knoten des laufenden Abschnitts aus Spaltenloesungen und die Koeffizienten des
//   Fehlerbands), damit G.fehlerband auch auf Kopien und im Hauptfaden gilt. G.covBlock: volle Querbloecke an der letzten
//   Faktorisierung (WeakMap je Karte), sonst aus dem Zustand mit Quelle je Groesse, unbekannte Querterme NaN (nie 0).
// Transaktional: alles wird erst nach der letzten Iteration geschrieben; ok = false -> nichts geschrieben.
// Rechenweg (aendert kein Ergebnis): Unbekannte je Aufruf in einem Feld mit Plaetzen aus einem Woerterbuch je Karte;
//   Gruppen und Bloecke tragen ihre Plaetze (ix), heisse Schleifen ohne Map-Zugriffe und ohne kleine Float64Array.

// ------------------------------------------------ Hilfen
const D2R=Math.PI/180, ZWEIPI=2*Math.PI;
const wrap=a=>a-ZWEIPI*Math.round(a/ZWEIPI), wrapPi=a=>a-Math.PI*Math.round(a/Math.PI);
const wrap2pi=a=>{ a%=ZWEIPI; return a<0 ? a+ZWEIPI : a; };
const pad=(v,n)=>{ const s=String(v); return s.length>=n ? s : '0'.repeat(n-s.length)+s; };
const idK=id=>typeof id==='number' ? pad(id, 9) : String(id);
const kG=(ab,j,c)=>'G'+pad(ab, 5)+':'+pad(j, 4)+':'+c, kW=(id,c)=>'W'+idK(id)+':'+c, kE=(id,c)=>'E'+idK(id)+':'+c;
const kL=(ab,c)=>'L'+pad(ab, 5)+':'+c;
const GLOBAL=['hc', 'hf', 'ref', 'ppx', 'ppy'];
// Art einer Unbekannten: Winkel (gewickelte Differenzen) und Schwelle der Neulinearisierung
const istWinkel=k=>k==='ref' || (k[0]==='W' && k.endsWith(':p')) || (k[0]==='G' && k.endsWith(':0'));
const schwelle=(k,B)=>k[0]==='G' ? (k.endsWith(':0') ? B.dPsi : B.dG) : istWinkel(k) ? B.dPhi : k[1]==='p' && k[0]==='p' ? B.dPp : B.dRho;
const gruppeVon=k=>k[0]==='G' ? 0 : (k[0]==='W' || k[0]==='E') ? 1 : 2;
const ordneSchl=(a,b)=>{ const ga=gruppeVon(a), gb=gruppeVon(b); if(ga!==gb) return ga-gb;
  if(ga===2){ const ia=GLOBAL.indexOf(a), ib=GLOBAL.indexOf(b); if(ia!==ib) return (ia<0 ? 99 : ia)-(ib<0 ? 99 : ib); }
  return a<b ? -1 : a>b ? 1 : 0; };
const fnv=s=>{ let h=0x811c9dc5; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h, 0x01000193); } return h>>>0; };
const hashIdx=a=>{ let h=0x811c9dc5; for(let i=0;i<a.length;i++){ h^=a[i]; h=Math.imul(h, 0x01000193); h^=h>>>15; } return h>>>0; };
const gleich=(a,b)=>{ if(a.length!==b.length) return false; for(let i=0;i<a.length;i++) if(a[i]!==b[i]) return false; return true; };
const DEF_A={iter:3, relinMax:20000, gmC:3, kette:true, rechtwinklig:1.5, laserH:null, hfPrior:[0, 0.3], sHmin:0.015, skala:'fest', tiefe:0, ebenen:0, nurAb:null,
  knoten:false, lago:'aus', lin:2, gncFaktor:1.4, rundDeg:10, basisMin:0.05, mmSchwelle:16, mmZurueck:9, pp:'fest', ppSigma:1,
  // 6.2 (rep/q1, rep/m6h): mit beobachtetem Boden (Gruppen 'f') ist h_c frei mit dem schwachen Prior hcPrior (m) um
  // H - dBoden, und H bindet h_c - h_f. Ohne Boden bindet hcPriorOhneBoden (m) h_c um H - dBoden (rep/m6b): die Parallaxe
  // verfaelscht h_c dort, statt nur zu streuen (frei 2,778 / 2,734 / 2,508 m gegen H - dBoden 2,441 / 2,409 / 2,224 m auf
  // A6-A8, formal sigma 24,6 / 4,2 / 1,5 cm), und der T2-Erfassungsmedian springt schon bei 2 mm h_c (A6 35,0 -> 46,5 cm);
  // mit 1 cm lag h_c 0,7 / 0,3 / 2,1 cm daneben. Vorgabe 1 mm: h_c praktisch H - dBoden, bleibt aber Unbekannte (sHC, cov).
  // null: hcPrior auch ohne Boden (alter Weg, nur zum Vergleich). Erfassungen sind kein Bodenbeleg (erfassungBoden Vorgabe
  // false): F0 ist der App-Boden des Kerns, und der liegt in A8 19,2 cm neben dem Boden von B_0; mit dem alten Beleg
  // (q >= qErfassung, sigma h_f = hfErfassung) hielt M6 h_c auf H ± 3 cm ueber diesem Boden (A8 Erfassungsmedian 35,3 statt
  // 8,2 cm der Kette). erfassungBoden true stellt den alten Weg her (nur zum Vergleich), ebenso festTy true (jeder A.fest
  // haelt G_0 ganz).
  // tyKette: ty eines Abschnitts mit A.fest und quelle 'kette' (M10 Weg (c)); 'fest' (Vorgabe, rep/m6b): G_0 = A.g ganz fest
  // wie beim Kern, also ty = (g_kern ∘ g0).ty der Kette; Zahl: Anker mit diesem sigma (m) um (g_kern ∘ g0).ty, auch mit Ketten
  // im Ausgleich; null: alter Weg (nur der Plan fest, ty frei, tyAnker nur ohne Kette). Mit freiem ty schob die Parallaxe
  // ganze Ketten von Abschnitten (A7 ab 6-9 +36..46 cm, A8 ab 11-13 -16 cm), mit h_c auf H - dBoden bis 150 cm (A6 ab 10/11).
  // tyAnker: sigma (m) fuer ty eines anderen Abschnitts mit A.fest ohne jede Kette im Ausgleich (sonst traegt ty nur die
  // Parallaxe), um ty der Kette (A.g0) bzw. den Startwert.
  // lokale Hoehe (nurAb): lokH 'hc' bindet h_c an H (sigma sHlok), h_f = 0 fest (Boden des Bezugs = Bodenanker);
  // 'hcf' bindet h_c - h_f an H (sigma sHlok), h_f ~ hfLok frei. Vorgabe 'hc' nach Messung R4 (rep/r4): mit 'hcf' lag
  // h_c auf A6-A8 in 9/29 (Segmente) bzw. 5/29 (Erfassungen) Abschnitten <= 5 cm an H, mit 'hc' in 22/29 bzw. 27/29;
  // h_f wanderte dabei bis +0,9 m (A8), die Bindung h_c - h_f = H haelt dort nur sich selbst.
  // sHC >= max(1,4826·MAD/sqrt(n) der entschiedenen Kantenhoehen (Halbbreite <= halbKante), sHCmin).
  // bodenKette false (Doku 12.8): dBoden = 0, h_c ~ H ueber dem Boden jedes Bezugs (die Kette lag auf A8 +19 cm daneben,
  // gemessen an ARCores Deckenebene; die Abstaende schrumpften dort auf das 0,46- bis 0,58-fache).
  bodenKette:true, erfassungBoden:false, qErfassung:1, hfErfassung:0.03, hcPrior:0.3, hcPriorOhneBoden:0.001, tyAnker:0.3, tyKette:'fest', festTy:false, lokH:'hc', sHlok:0.02, hfLok:[0, 0.3], sHCmin:0.02, halbKante:0.05,
  // intern (nicht in 4): Start-mu, Daempfung, groesster Schritt [rad, m], erzwungener lago-Grund (M10), Schlussrunde
  muStart:16, lambda:1e-8, schritt:[0.3, 1.0], lagoGrund:null, schluss:false};
const DEF_B={dPhi:0.05*D2R, dRho:0.002, dG:0.002, dPsi:0.05*D2R, dPp:0.05};
const CACHE=new WeakMap();   // je Karte und Bereich ('g' global, 'l'+ab lokal): Muster/Symbolik je Stufe, letzte Faktorisierung
                             // (fuer covBlock); je Karte das Woerterbuch der Unbekannten; aendert kein Ergebnis
const bereichC=(karte, sc)=>{ let C=CACHE.get(karte); if(!C){ C={}; CACHE.set(karte, C); } return C[sc] || (C[sc]={}); };
// Woerterbuch Schluessel -> Platz je Karte: waechst nur, nummeriert nie um. Bloecke halten ihre Plaetze (B.ix), gueltig,
// solange B.wnr die Nummer des Woerterbuchs ist (Kopie der Karte, structuredClone: neues Woerterbuch, Plaetze neu).
let WNR=0;
const woerterbuch=karte=>{ const C=bereichC(karte, 'w'); return C.D || (C.D={nr:++WNR, m:new Map(), keys:[]}); };
// Werte der Unbekannten eines Aufrufs (wie eine Map: get/set/has) mit Feld v je Platz; ungesetzt: get undefined, v NaN.
const werte=D=>{
  const n0=Math.max(256, 2*D.keys.length), X={D, v:new Float64Array(n0).fill(NaN), da:new Uint8Array(n0)};
  X.platz=k=>{ let p=D.m.get(k); if(p===undefined){ p=D.keys.length; D.m.set(k, p); D.keys.push(k); }
    if(p>=X.v.length){ const n=2*p+2, v=new Float64Array(n).fill(NaN), da=new Uint8Array(n); v.set(X.v); da.set(X.da); X.v=v; X.da=da; }
    return p; };
  X.set=(k,x)=>{ const p=X.platz(k); X.v[p]=x; X.da[p]=1; return X; };
  X.get=k=>{ const p=D.m.get(k); return p===undefined || p>=X.da.length || !X.da[p] ? undefined : X.v[p]; };
  X.has=k=>{ const p=D.m.get(k); return p!==undefined && p<X.da.length && X.da[p]===1; };
  return X;
}
// Art je Schluessel: 0 Gier eines Versatzes (dPsi), 1 Verschiebung (dG), 2 Winkel (dPhi), 3 Hauptpunkt (dPp), 4 sonst (dRho);
// 0 und 2 werden gewickelt verglichen.
const artVon=k=>k[0]==='G' ? (k.endsWith(':0') ? 0 : 1) : istWinkel(k) ? 2 : k[1]==='p' && k[0]==='p' ? 3 : 4;
const blockIx=(K, B)=>{ const D=K.X.D;
  if(B.wnr!==D.nr || !B.ix){ B.ix=Int32Array.from(B.keys, k=>K.X.platz(k)); B.art=Uint8Array.from(B.keys, artVon); B.wnr=D.nr; }
  return B.ix; };

// ------------------------------------------------ Reste mit analytischer Jacobi
// Ein Strahl d (Bezug) von der Kamera c (Bezug) gegen die waagerechte Linie n·p = rho, y = h (F0) unter dem Versatz
// G = (psi, tx, ty, tz): r = f·asin(n_c·d'), d' = R(psi) d, n_c Einheitsnormale von m = u × (q - c'), c' = G(c),
// q = (rho·n, h). J (7): dr/d(phi, rho, h, psi, tx, ty, tz). lin: Stufe 2 (Strahlbild) r = f·(d'·m)/|m0|, J linear.
// RL haelt k, n_c fuer die Kettenregel des Hauptpunkts.
const RL=new Float64Array(4);
const rLinie=(c, d, cs, sn, tx, ty, tz, nx, nz, rho, h, f, J, lin)=>{
  const prx=cs*c[0]-sn*c[2], prz=sn*c[0]+cs*c[2], cx=prx+tx, cy=c[1]+ty, cz=prz+tz;
  const dx=cs*d[0]-sn*d[2], dy=d[1], dz=sn*d[0]+cs*d[2];
  const ux=-nz, uz=nx, ax=rho*nx-cx, ay=h-cy, az=rho*nz-cz;
  const mx=-uz*ay, my=uz*ax-ux*az, mz=ux*ay, L=Math.sqrt(mx*mx+my*my+mz*mz);
  if(!(L>1e-12)){ if(J) J.fill(0); RL.fill(0); return 0; }
  const ex=mx/L, ey=my/L, ez=mz/L; let s=ex*dx+ey*dy+ez*dz;
  if(s>0.999999) s=0.999999; else if(s<-0.999999) s=-0.999999;
  const r=lin ? f*s : f*Math.asin(s); if(!J) return r;
  let k, gx, gy, gz;
  if(lin){ k=f; gx=dx/L; gy=dy/L; gz=dz/L; } else { k=f/Math.sqrt(1-s*s); gx=(dx-s*ex)/L; gy=(dy-s*ey)/L; gz=(dz-s*ez)/L; }
  RL[0]=k; RL[1]=ex; RL[2]=ey; RL[3]=ez;
  J[0]=k*(gx*nz*ay-gy*(nz*ax-nx*az)-gz*nx*ay);
  J[1]=k*gy;
  J[2]=k*(gz*ux-gx*uz);
  J[3]=k*(gy*(uz*prz+ux*prx)+(lin ? 0 : ez*dx-ex*dz));
  J[4]=-k*gy*uz;
  J[5]=k*(gx*uz-gz*ux);
  J[6]=k*gy*ux;
  return r;
}
// Senkrechte durch p = (px, pz) (F0): Ebene durch c' und die Senkrechte, m = ŷ × (q - c') = (az, 0, -ax).
// J (7): dr/d(px, pz, -, psi, tx, ty, tz).
const rSenk=(c, d, cs, sn, tx, tz, px, pz, f, J, lin)=>{
  const prx=cs*c[0]-sn*c[2], prz=sn*c[0]+cs*c[2], ax=px-prx-tx, az=pz-prz-tz;
  const dx=cs*d[0]-sn*d[2], dz=sn*d[0]+cs*d[2], L=Math.sqrt(ax*ax+az*az);
  if(!(L>1e-12)){ if(J) J.fill(0); RL.fill(0); return 0; }
  const ex=az/L, ez=-ax/L; let s=ex*dx+ez*dz;
  if(s>0.999999) s=0.999999; else if(s<-0.999999) s=-0.999999;
  const r=lin ? f*s : f*Math.asin(s); if(!J) return r;
  let k, gx, gz;
  if(lin){ k=f; gx=dx/L; gz=dz/L; } else { k=f/Math.sqrt(1-s*s); gx=(dx-s*ex)/L; gz=(dz-s*ez)/L; }
  RL[0]=k; RL[1]=ex; RL[2]=0; RL[3]=ez;
  J[0]=-k*gz; J[1]=k*gx; J[2]=0;
  J[3]=k*(-gx*prx-gz*prz+(lin ? 0 : ez*dx-ex*dz));
  J[4]=k*gz; J[5]=0; J[6]=-k*gx;
  return r;
}
// Hauptpunkt: Strahl durch (Pixel - pp). d (Bezug) war mit pp = 0 gerechnet; R = Drehung von camTo (spaltenweise).
// Ergebnis: korrigierter Strahl und dd/dcx, dd/dcy (Bezug); f fuer beide Achsen (fx/fy weichen 0,04 % ab).
const strahlPP=(d, R, f, cx, cy)=>{
  const vx=R[0]*d[0]+R[1]*d[1]+R[2]*d[2], vy=R[4]*d[0]+R[5]*d[1]+R[6]*d[2], vz=R[8]*d[0]+R[9]*d[1]+R[10]*d[2];
  if(!(vz<-1e-9)) return null;
  const wx=-vx/vz-cx/f, wy=-vy/vz-cy/f, n=Math.sqrt(wx*wx+wy*wy+1), qx=wx/n, qy=wy/n, qz=-1/n;
  const rot=(a,b,c)=>[R[0]*a+R[4]*b+R[8]*c, R[1]*a+R[5]*b+R[9]*c, R[2]*a+R[6]*b+R[10]*c];
  const pr=(ex,ey)=>{ const dt=ex*qx+ey*qy; return rot((ex-dt*qx)/n, (ey-dt*qy)/n, -dt*qz/n); };
  return {d:rot(qx, qy, qz), dx:pr(-1/f, 0), dy:pr(0, -1/f)};
}
const ppJ=(cs,sn,dd)=>RL[0]*(RL[1]*(cs*dd[0]-sn*dd[2])+RL[2]*dd[1]+RL[3]*(sn*dd[0]+cs*dd[2]));

// ------------------------------------------------ Hoehe einer Beobachtung
// Zahl/'lokal': eigene Hoehe der Wand; Bodenkante bzw. h = 'f': h_f (lokal: hLok.hF, fehlt -> 0); sonst h_c (lokal:
// hLok.hC des Abschnitts).
const hSchl=(W,b,glob,ab)=>(typeof W.h==='number' || W.h==='lokal') ? kW(W.id, 'h')
  : (b.art==='boden' || W.h==='f') ? (glob ? 'hf' : kL(ab, 'f')) : (glob ? 'hc' : kL(ab, 'c'));
const hLokF=(karte,ab)=>{ const A=karte.abschnitte && karte.abschnitte[ab]; return A && A.hLok && Number.isFinite(A.hLok.hF) ? A.hLok.hF : 0; };
const hWert=(karte,W,b,ab)=>{
  if(typeof W.h==='number') return W.h;
  if(W.h==='lokal') return W.hLokal && Number.isFinite(W.hLokal.h) ? W.hLokal.h : (karte.hC ?? 2.4);
  if(b.art==='boden' || W.h==='f') return W.rahmen===-1 ? (karte.hF ?? 0) : hLokF(karte, W.rahmen);
  if(W.rahmen===-1) return karte.hC ?? 2.4;
  const A=karte.abschnitte[ab]; return A && A.hLok && Number.isFinite(A.hLok.hC) ? A.hLok.hC : (karte.hC ?? 2.4);
};
// Bodenversatz des Kerns (6.2): Hoehe des Bodens von B_kern ueber dem Boden von B_0 entlang der Kette, wie G.ketteStart
// (pose: dG.ty, kamera: cb.y - ca.y, rest: 0, zurueck: wie zurueckZu); nur Daten der Schnitte, ohne Schnitt 0. Nicht aus
// A.g0, denn eine angenommene Registrierung ueberschreibt g0 (rep/q1 kette-vgl: g0 sonst bitgleich zur Kette).
// A8 (Kern 5): +19,2 cm, A6 (Kern 1): -2,5 cm, A7 (Kern 1): +0,7 cm.
const bodenVersatz=karte=>{ const S=karte.schnitte || [], k=karte.kern; if(!(k>0)) return 0;
  const ty=[0];
  for(let i=1;i<=k;i++){ const s=S[i-1], b=s && s.bindung; let v=ty[i-1];
    if(s && s.klasse==='zurueck' && s.zurueckZu!=null && s.zurueckZu>=0 && s.zurueckZu<i) v=ty[s.zurueckZu];
    else if(!s || s.art==='rest') v=ty[i-1];
    else if(b && b.art==='pose'){ const d=b.dG; v=ty[i-1]+(d && Number.isFinite(d.ty) ? d.ty : 0); }
    else if(s.ca && s.cb) v=ty[i-1]+s.cb[1]-s.ca[1];
    ty.push(Number.isFinite(v) ? v : ty[i-1]); }
  return ty[k]; };
const strahlen=b=>b.db ? [b.da, b.db] : [b.da];
const ppAn=karte=>karte.pp && (karte.pp.frei || karte.pp.cx || karte.pp.cy);
const bildR=(karte,b)=>{ const B=karte.bilder && karte.bilder.get ? karte.bilder.get(b.k) : null; return B && B.camTo ? B.camTo : null; };

// ------------------------------------------------ oeffentliche Reste (Zustand der Karte)
G.resSegment=(beob, W, karte)=>{
  const g=W.rahmen===-1 ? G.gBei(karte.abschnitte[beob.ab], beob.t) : {psi:0, tx:0, ty:0, tz:0};
  if(!g) return null;
  const cs=Math.cos(g.psi), sn=Math.sin(g.psi), nx=Math.cos(W.phi), nz=Math.sin(W.phi), h=hWert(karte, W, beob, beob.ab), R=ppAn(karte) ? bildR(karte, beob) : null;
  return strahlen(beob).map(d=>{ const q=R ? strahlPP(d, R, beob.f, karte.pp.cx, karte.pp.cy) : null;
    return rLinie(beob.c, q ? q.d : d, cs, sn, g.tx, g.ty, g.tz, nx, nz, W.rho, h, beob.f, null, false); });
};
G.resSenk=(beob, E, karte)=>{
  const p=Array.isArray(E) ? G.wandSchnitt(E[0], E[1]) : E.p, rahmen=Array.isArray(E) ? E[0].rahmen : E.rahmen;
  const g=rahmen===-1 ? G.gBei(karte.abschnitte[beob.ab], beob.t) : {psi:0, tx:0, ty:0, tz:0};
  if(!p || !g) return null;
  const R=ppAn(karte) ? bildR(karte, beob) : null, q=R ? strahlPP(beob.da, R, beob.f, karte.pp.cx, karte.pp.cy) : null;
  return [rSenk(beob.c, q ? q.d : beob.da, Math.cos(g.psi), Math.sin(g.psi), g.tx, g.tz, p[0], p[1], beob.f, null, false)];
};
// Tiefe (Gewicht 0 bis T-M1/T-M2): Punkte p = [x, z] im Bezug (obs.pts flach) oder die Enden der Ebenenlinie
// (theta, rho, extent) -> n·(R p + t) - rho je Punkt (m).
G.resTiefe=(obs, W, g)=>{
  let P=obs.pts;
  if(!P){ const n=[Math.cos(obs.theta), Math.sin(obs.theta)], u=[-n[1], n[0]], e=obs.extent || [0, 0];
    P=[obs.rho*n[0]+e[0]*u[0], obs.rho*n[1]+e[0]*u[1], obs.rho*n[0]+e[1]*u[0], obs.rho*n[1]+e[1]*u[1]]; }
  const c=Math.cos(g.psi), s=Math.sin(g.psi), nx=Math.cos(W.phi), nz=Math.sin(W.phi), out=new Float32Array(P.length>>1);
  for(let i=0;i<out.length;i++){ const x=P[2*i], z=P[2*i+1]; out[i]=nx*(c*x-s*z+g.tx)+nz*(s*x+c*z+g.tz)-W.rho; }
  return out;
};
// Senkrechte ARCore-Ebene (Gewicht 0 bis T-M6): Linie des Bezugs mit g nach F0, gegen die Wand.
G.resEbene=(eb, W, g)=>{ const phi=eb.phi+g.psi, rho=eb.rho+Math.cos(phi)*g.tx+Math.sin(phi)*g.tz; return [rho-W.rho, wrap(phi-W.phi)]; };

// ------------------------------------------------ Arbeitszustand
// Abschnitte im Ausgleich (global: Kern und verbunden/locker mit g; lokal: nur nurAb, g = Einheit) mit Knotenzeiten,
// Werte aller Unbekannten (X), Beob-Gruppen je Block, mu je Beob.
const kontext=(karte, o)=>{
  const glob=o.nurAb==null, X=werte(woerterbuch(karte)), I=new Map(), A=karte.abschnitte || [];
  const aktiv=a=>a && (glob ? (a.g && (a.ab===karte.kern || a.stufe==='verbunden' || a.stufe==='locker')) : a.ab===o.nurAb);
  // G_0 fest (fest0): Kern (Einheit, Eichung), A.fest mit quelle 'kette' bei tyKette 'fest' (Vorgabe, M10 Weg (c): g =
  // g_kern ∘ g0) und nur zum Messen der Orakel-Rahmen (T1 --orakel-rahmen, obere Schranke; o.orakelFest false schaltet ihn
  // ab). Fest heisst: A.g bleibt bitgleich, A.cov = 0. Ein anderer A.fest (M10, 19.2 Z9; mit festTy jeder: fest0) haelt nur
  // den Plan (plan0): psi, tx, tz von G_0 bleiben bitgleich, ty ist Unbekannte (6.1), A.cov traegt nur Var(ty).
  const fest=a=>a.ab===karte.kern || (o.festTy===true && a.fest===true) || (o.tyKette==='fest' && a.fest===true && a.quelle==='kette')
    || !!(o.orakel && o.orakel.g && o.orakel.g[a.ab] && o.orakelFest!==false);
  for(const a of A){ if(!aktiv(a)) continue;
    const f0=glob ? fest(a) : true, info={ab:a.ab, A:a, K:1, t:null, fest0:f0, plan0:glob && !f0 && a.fest===true, lokal:!glob, dfix:null,
      ty0:a.g && Number.isFinite(a.g.ty) ? a.g.ty : 0};
    if(glob){
      const Kn=a.knoten, nT=Kn && Kn.t ? Kn.t.length : 0;
      if(o.knoten && nT>=2){ info.K=nT; info.t=Float64Array.from(Kn.t);
        const g0=a.ab===karte.kern ? {psi:0, tx:0, ty:0, tz:0} : a.g, nd=Kn.d ? Math.floor(Kn.d.length/4) : 0;
        let d=[0, 0, 0, 0];
        for(let j=0;j<nT;j++){ if(j>0 && j<nd) d=[Kn.d[4*j], Kn.d[4*j+1], Kn.d[4*j+2], Kn.d[4*j+3]]; else if(j===0) d=[0, 0, 0, 0];
          const Gj=j===0 ? g0 : G.gKomp(g0, {psi:d[0], tx:d[1], ty:d[2], tz:d[3]});
          X.set(kG(a.ab, j, 0), Gj.psi); X.set(kG(a.ab, j, 1), Gj.tx); X.set(kG(a.ab, j, 2), Gj.ty); X.set(kG(a.ab, j, 3), Gj.tz); } }
      else { const g0=a.ab===karte.kern ? {psi:0, tx:0, ty:0, tz:0} : a.g;
        X.set(kG(a.ab, 0, 0), g0.psi); X.set(kG(a.ab, 0, 1), g0.tx); X.set(kG(a.ab, 0, 2), g0.ty); X.set(kG(a.ab, 0, 3), g0.tz);
        if(Kn && Kn.d && Kn.d.some(v=>v!==0)) info.dfix={g:{psi:0, tx:0, ty:0, tz:0}, knoten:Kn}; } }
    else X.set(kL(a.ab, 'c'), a.hLok && Number.isFinite(a.hLok.hC) ? a.hLok.hC : (karte.hC ?? 2.4)), X.set(kL(a.ab, 'f'), o.lokH==='hcf' ? hLokF(karte, a.ab) : 0);
    I.set(a.ab, info); }
  X.set('hc', karte.hC ?? 2.4); X.set('hf', karte.hF ?? 0);
  X.set('ppx', karte.pp ? karte.pp.cx || 0 : 0); X.set('ppy', karte.pp ? karte.pp.cy || 0 : 0);
  const beob=karte.beob || [];
  const K={karte, o, glob, ab:o.nurAb, scope:glob ? 'g' : 'l'+o.nurAb, X, I, frei:new Set(), gruppen:new Map(), mu:new Float64Array(beob.length), muVer:0, beob,
    ppFrei:glob && o.pp==='frei', ppAn:!!ppAn(karte) || (glob && o.pp==='frei'), waende:new Map(), ecken:new Map()};
  // Beob-Gruppen (je Landmarke ein Eintrag mit Map Code -> Gruppe; Landmarke, Pruefung und Schluesseltexte nur beim Anlegen)
  const W=karte.waende, E=karte.ecken, rahmen=glob ? -1 : o.nurAb, MW=new Map(), ME=new Map(), liste=[], PP=K.ppAn ? ['ppx', 'ppy'] : [];
  // Schluessel und Plaetze je Wand bzw. Abschnittsintervall nur einmal bilden (Plaetze der Gruppe: g.ix)
  const WK=new Map(), wk=w=>{ let e=WK.get(w.id); if(!e){ const p=kW(w.id, 'p'), r=kW(w.id, 'r'); e={p, r, ip:X.platz(p), ir:X.platz(r)}; WK.set(w.id, e); } return e; };
  const PPx=PP.map(k=>X.platz(k));
  for(let i=0;i<beob.length;i++){ const b=beob[i];
    if(!b || !b.schluessel || b.L==null || b.L===-1 || !b.da) continue;
    const info=I.get(b.ab); if(!info) continue;
    const ecke=b.art==='ecke', M=ecke ? ME : MW;
    let eL=M.get(b.L);
    if(eL===undefined){ const x=ecke ? E && E.get(b.L) : W && W.get(b.L);
      eL=!x || x.rahmen!==rahmen ? null : {x, eigen:!ecke && (typeof x.h==='number' || x.h==='lokal'), codes:new Map()}; M.set(b.L, eL); }
    if(eL===null) continue;
    const j=knotenJ(info, b.t), w=ecke ? null : eL.x, e=ecke ? eL.x : null;
    const code=ecke ? (b.ab*65536+j)*4 : (b.ab*65536+j)*4+(!eL.eigen && (b.art==='boden' || w.h==='f') ? 1 : 0);
    let g=eL.codes.get(code);
    if(!g){ const P=poseInfo(K, info, b.t); let art, keys, ix0, schl;
      if(e){ const wa=e.waende && W ? W.get(e.waende[0]) : null, wb=e.waende && W ? W.get(e.waende[1]) : null;
        if(wa && wb && wa.rahmen===rahmen && wb.rahmen===rahmen){ const ea=wk(wa), eb=wk(wb); art='x'; keys=[ea.p, ea.r, eb.p, eb.r]; ix0=[ea.ip, ea.ir, eb.ip, eb.ir];
          for(const x of [wa, wb]) if(!K.waende.has(x.id)) K.waende.set(x.id, x); }
        else { art='e'; keys=[kE(e.id, 'x'), kE(e.id, 'z')]; ix0=keys.map(k=>X.platz(k)); K.ecken.set(e.id, e); }
        schl='E'+b.L+':'+b.ab+':'+P.j; }
      else { const hk=hSchl(w, b, glob, b.ab), ew=wk(w); art=(code&1) ? 'f' : 'w';
        keys=[ew.p, ew.r, hk]; ix0=[ew.ip, ew.ir, X.platz(hk)]; schl=b.L+':'+b.ab+':'+P.j+(art==='f' ? ':f' : '');
        if(!K.waende.has(w.id)) K.waende.set(w.id, w);
        if(hk[0]==='W' && !X.has(hk)) X.set(hk, hWert(karte, w, b, b.ab)); }
      const kAll=[...keys, ...P.keys, ...PP], ix=new Int32Array(kAll.length), gx=gPlaetze(X, info, P);
      ix.set(ix0, 0); ix.set(gx, ix0.length); ix.set(PPx, ix0.length+gx.length);
      g={schl, art, L:b.L, ab:b.ab, j:P.j, keys:kAll, ix, idx:[], nRes:0, hash:0, muVer:-1, muS:0}; eL.codes.set(code, g); liste.push(g); }
    g.idx.push(i); g.nRes+=ecke ? 1 : (b.db ? 2 : 1);
    K.mu[i]=Number.isFinite(b.mu) && b.mu>0 ? b.mu : o.muStart; }
  liste.sort((a,b)=>a.schl<b.schl ? -1 : a.schl>b.schl ? 1 : 0);
  for(const g of liste){ g.hash=hashIdx(g.idx); K.gruppen.set(g.schl, g); }
  for(const w of K.waende.values()){ X.set(kW(w.id, 'p'), w.phi); X.set(kW(w.id, 'r'), w.rho); }
  for(const e of K.ecken.values()){ X.set(kE(e.id, 'x'), e.p[0]); X.set(kE(e.id, 'z'), e.p[1]); }
  // Raumrichtung (mod 90°) aus den Waenden, gewichtet mit der Zahl der Beob
  let sx=0, sz=0; for(const g of K.gruppen.values()) if(g.art==='w' || g.art==='f'){ const p=X.get(g.keys[0]); sx+=g.idx.length*Math.cos(4*p); sz+=g.idx.length*Math.sin(4*p); }
  X.set('ref', sx || sz ? Math.atan2(sz, sx)/4 : 0);
  return K;
}
// Summe der mu einer Gruppe (fuer die Rangfolge 4), gecacht bis Stufe 2 die mu aendert (K.muVer).
const muSumme=(K, g)=>{ if(g.muVer!==K.muVer){ let s=0; for(const i of g.idx) s+=K.mu[i]; g.muS=s; g.muVer=K.muVer; } return g.muS; };
// Knotenintervall j zur Zeit t (wie poseInfo, ohne Objekt).
const knotenJ=(info, t)=>{ if(info.lokal || info.K<2) return 0; const T=info.t, n=info.K;
  if(t<=T[0]) return 0; if(t>=T[n-1]) return n-1;
  let lo=0, hi=n-1; while(hi-lo>1){ const m=(lo+hi)>>1; if(T[m]<=t) lo=m; else hi=m; } return lo; }
// Versatz eines Abschnitts zur Zeit t: Knotenintervall j, Anteil u, Schluessel der beteiligten G (4 oder 8, gecacht).
const LEER=[];
const gSchl=(info, j0, j1)=>{ const C=info.kc || (info.kc=new Map()), k=j0*65536+j1; let v=C.get(k);
  if(!v){ v=[0, 1, 2, 3].map(c=>kG(info.ab, j0, c)); if(j1!==j0) for(let c=0;c<4;c++) v.push(kG(info.ab, j1, c)); C.set(k, v); }
  return v; }
const gPlaetze=(X, info, P)=>{ if(!P.keys.length) return LEER; const C=info.kx || (info.kx=new Map()), k=P.j0*65536+P.j1; let v=C.get(k);
  if(!v){ v=Int32Array.from(P.keys, s=>X.platz(s)); C.set(k, v); } return v; }
const poseInfo=(K, info, t)=>{
  if(info.lokal) return {j:0, j0:0, j1:0, u:0, keys:LEER, info};
  if(info.K<2) return {j:0, j0:0, j1:0, u:0, keys:gSchl(info, 0, 0), info};
  const T=info.t, n=info.K; let j0, j1, u;
  if(t<=T[0]){ j0=0; j1=1; u=0; }
  else if(t>=T[n-1]){ j0=j1=n-1; u=0; }
  else { let lo=0, hi=n-1; while(hi-lo>1){ const m=(lo+hi)>>1; if(T[m]<=t) lo=m; else hi=m; } j0=lo; j1=hi; u=(t-T[j0])/(T[j1]-T[j0]); }
  return {j:j0, j0, j1, u, keys:gSchl(info, j0, j1), info};
}
// Wert des Versatzes zur Zeit t aus Werten der Schluessel (v ab Stelle off) und Kettenregel-Faktoren M (dG/dG_0.psi).
const poseWert=(P, v, off, t, aus)=>{
  if(P.info.lokal){ aus.psi=0; aus.tx=0; aus.ty=0; aus.tz=0; aus.m1=0; aus.m3=0; return aus; }
  if(P.keys.length===8){ const u=P.u, w=1-u;
    aus.psi=w*v[off]+u*v[off+4]; aus.tx=w*v[off+1]+u*v[off+5]; aus.ty=w*v[off+2]+u*v[off+6]; aus.tz=w*v[off+3]+u*v[off+7]; aus.m1=0; aus.m3=0; return aus; }
  const g={psi:v[off], tx:v[off+1], ty:v[off+2], tz:v[off+3]};
  if(!P.info.dfix){ aus.psi=g.psi; aus.tx=g.tx; aus.ty=g.ty; aus.tz=g.tz; aus.m1=0; aus.m3=0; return aus; }
  const d=G.gBei(P.info.dfix, t), r=G.gKomp(g, d), c=Math.cos(g.psi), s=Math.sin(g.psi);
  aus.psi=r.psi; aus.tx=r.tx; aus.ty=r.ty; aus.tz=r.tz; aus.m1=-s*d.tx-c*d.tz; aus.m3=c*d.tx-s*d.tz; return aus;
}
// J (7, bezogen auf phi.., psi, tx, ty, tz von G(t)) auf die lokalen G-Spalten ab Stelle off verteilen.
const verteileG=(P, Jl, J, off, pw)=>{
  if(P.info.lokal) return;
  if(P.keys.length===8){ const u=P.u, w=1-u; for(let c=0;c<4;c++){ J[off+c]+=w*Jl[3+c]; J[off+4+c]+=u*Jl[3+c]; } return; }
  J[off]+=Jl[3]+pw.m1*Jl[4]+pw.m3*Jl[6]; J[off+1]+=Jl[4]; J[off+2]+=Jl[5]; J[off+3]+=Jl[6];
}
const pseudoBeob={schluessel:true};

// ------------------------------------------------ Linearisieren einer Gruppe
// modus 3: Bild-Fehlermass (Block mit x0); modus 2: Strahlbild, linear (Gewicht zusaetzlich min(1, basis/0,3));
// Gewicht Geman-McClure je Beob aus dem Rest am Punkt, mit mu (K.mu). aus: {w, chi2} je Beob-Index (optional).
// lo, hi: Spanne der Kameras quer zur Linie (n·c in F0) fuer die Bodenguete.
const JL=new Float64Array(7), JA=new Float64Array(16), JB=new Float64Array(16), VL=new Float64Array(16);   // Arbeitsfelder (m <= 14)
const linGruppe=(K, g, modus, aus, wBasis)=>{
  const keys=g.keys, m=keys.length, X=K.X, karte=K.karte, o=K.o;
  // modus 2: Faktor nur fuer diese Loesung, x0 wird nicht gehalten (Arbeitsfeld)
  const H=new Float64Array(m*m), gv=new Float64Array(m), v=modus===2 ? VL : new Float64Array(m), ix=g.ix || (g.ix=Int32Array.from(keys, k=>X.platz(k)));
  for(let a=0;a<m;a++) v[a]=X.v[ix[a]];
  const art=g.art, wand=art==='w' || art==='f', off=art==='x' ? 4 : art==='e' ? 2 : 3, info0=K.I.get(g.ab), P0=g.idx.length ? poseInfo(K, info0, K.beob[g.idx[0]].t) : null;
  // alle Beob einer Gruppe liegen im selben Knotenintervall j0 (Teil des Codes): nur der Anteil u wechselt
  const Pm=P0 && info0.K>=2 ? {...P0} : P0, T=info0 ? info0.t : null, nK=info0 ? info0.K : 0;
  const nG=P0 ? P0.keys.length : 0, offPP=off+nG, Jl=JL, J1=JA, J2=JB, pw={};
  const lin=modus===2, ppAn=K.ppAn, fm=lin && K.freiP ? K.freiP : null;
  const wB=wBasis && g.idx.length ? wBasis(K.beob[g.idx[0]]) : 1;   // Basisgewicht: je Landmarke, also je Gruppe gleich
  let nx=0, nz=0, rho=0, h=0, px=0, pz=0, D00=0, D01=0, D02=0, D03=0, D10=0, D11=0, D12=0, D13=0;
  if(wand){ nx=Math.cos(v[0]); nz=Math.sin(v[0]); rho=v[1]; h=v[2]; }
  else if(art==='e'){ px=v[0]; pz=v[1]; }
  else { const na0=Math.cos(v[0]), na1=Math.sin(v[0]), nb0=Math.cos(v[2]), nb1=Math.sin(v[2]), det=na0*nb1-na1*nb0;
    if(!(Math.abs(det)>1e-9)) return null;
    const i00=nb1/det, i01=-na1/det, i10=-nb0/det, i11=na0/det;
    px=i00*v[1]+i01*v[3]; pz=i10*v[1]+i11*v[3];
    const ua=-na1*px+na0*pz, ub=-nb1*px+nb0*pz;   // u·p; dp/d(phi_a, rho_a, phi_b, rho_b)
    D00=-i00*ua; D01=i00; D02=-i01*ub; D03=i01; D10=-i10*ua; D11=i10; D12=-i11*ub; D13=i11;
    nx=Math.cos(v[0]); nz=Math.sin(v[0]); }
  const cx=X.get('ppx'), cy=X.get('ppy');
  let c=0, nRes=0, muSum=0, lo=Infinity, hi=-Infinity, r1=0, r2=0, psi0=NaN, cs=NaN, sn=NaN;
  const fest=!!P0 && (P0.info.lokal || (P0.keys.length!==8 && !P0.info.dfix));
  for(const i of g.idx){ const b=K.beob[i], P=Pm;
    if(nK>=2){ const t=b.t; P.u=t<=T[0] || t>=T[nK-1] ? 0 : (t-T[P.j0])/(T[P.j1]-T[P.j0]); }
    // ohne Knoten und ohne festes d ist der Versatz in der Gruppe konstant: Gier-Drehung nur einmal
    const gw=fest && psi0===psi0 ? pw : poseWert(P, v, off, b.t, pw);
    if(gw.psi!==psi0){ psi0=gw.psi; cs=Math.cos(psi0); sn=Math.sin(psi0); }
    const Rc=ppAn ? bildR(karte, b) : null, nr=wand && b.db ? 2 : 1;
    const sq=nx*(cs*b.c[0]-sn*b.c[2]+gw.tx)+nz*(sn*b.c[0]+cs*b.c[2]+gw.tz); if(sq<lo) lo=sq; if(sq>hi) hi=sq;
    for(let q=0;q<nr;q++){ const d0=q ? b.db : b.da, pq=Rc ? strahlPP(d0, Rc, b.f, cx, cy) : null, d=pq ? pq.d : d0, J=q ? J2 : J1;
      for(let a=0;a<m;a++) J[a]=0;
      let r;
      if(wand){ r=rLinie(b.c, d, cs, sn, gw.tx, gw.ty, gw.tz, nx, nz, rho, h, b.f, Jl, lin); J[0]=Jl[0]; J[1]=Jl[1]; J[2]=Jl[2]; }
      else { r=rSenk(b.c, d, cs, sn, gw.tx, gw.tz, px, pz, b.f, Jl, lin);
        if(art==='e'){ J[0]=Jl[0]; J[1]=Jl[1]; }
        else { J[0]=Jl[0]*D00+Jl[1]*D10; J[1]=Jl[0]*D01+Jl[1]*D11; J[2]=Jl[0]*D02+Jl[1]*D12; J[3]=Jl[0]*D03+Jl[1]*D13; } }
      verteileG(P, Jl, J, off, pw);
      if(pq){ J[offPP]=ppJ(cs, sn, pq.dx); J[offPP+1]=ppJ(cs, sn, pq.dy); }
      if(q) r2=r; else r1=r; }
    const sP=b.sPx>0 ? b.sPx : 1, chi2=nr===2 ? (r1*r1+r2*r2)/(sP*sP) : r1*r1/(sP*sP), rn=Math.sqrt(chi2/nr);
    const mu=K.mu[i], w=G.gmGewicht(rn, o.gmC, mu), info=w*wB/(sP*sP);
    muSum+=mu; nRes+=nr;
    if(aus){ aus.w[i]=w; aus.chi2[i]=chi2; }
    for(let q=0;q<nr;q++){ const r=q ? r2 : r1, J=q ? J2 : J1; c+=info*r*r;
      for(let a=0;a<m;a++){ const ja=J[a]; if(ja===0 || (fm && fm[ix[a]]!==1)) continue; const wa=info*ja; gv[a]+=wa*r; const row=a*m; for(let e=a;e<m;e++) H[row+e]+=wa*J[e]; } } }
  if(modus===2) return {keys, ix, m, H, g:gv, c};
  return {schl:g.schl, art, L:g.L, ab:g.ab, j:g.j, keys, m, H, g:gv, c, x0:v, nRes, n:g.idx.length, beob:Int32Array.from(g.idx), muSum,
    hash:g.hash, lo, hi, scope:K.scope, ix, art:g.artK || (g.artK=Uint8Array.from(keys, artVon)), wnr:X.D.nr};
}
// Gradient und Kosten eines Blocks am aktuellen Punkt (lineares Modell um x0).
const DS=new Float64Array(32);   // Arbeitsfeld (m <= 14)
const blockAmPunkt=(K, B)=>{
  // gEff als gewoehnliches Feld: je Block und Iteration neu, kurzlebig (kleine Float64Array ab 9 Werten waeren teuer)
  const m=B.m, ix=blockIx(K, B), art=B.art, v=K.X.v, x0=B.x0, H=B.H, gB=B.g, d=DS, gEff=new Array(m);
  for(let a=0;a<m;a++) gEff[a]=gB[a];
  let bewegt=false;
  for(let a=0;a<m;a++){ let x=v[ix[a]]-x0[a]; if(art[a]===0 || art[a]===2) x=wrap(x); d[a]=x; if(x!==0) bewegt=true; }
  let c=B.c;
  if(bewegt){ for(let a=0;a<m;a++){ let s=0; for(let e=0;e<m;e++) s+=(a<=e ? H[a*m+e] : H[e*m+a])*d[e]; gEff[a]+=s; c+=d[a]*(gB[a]+gEff[a]); } }
  return {keys:B.keys, ix, m, H, g:gEff, c};
}

// ------------------------------------------------ Bloecke (5.3)
// Rangfolge: 1 neu, 2 Beob/Spalten geaendert, 3 bewegt (Schwellen), 4 mu geaendert; 0 behalten. Budget in Resten.
const bloeckeAuffrischen=(K, bloecke, o, budget, aus)=>{
  const kand=[], sw=[o.dPsi, o.dG, o.dPhi, o.dPp, o.dRho];   // Schwellen je Art (artVon)
  for(const [schl, g] of K.gruppen){ const B=bloecke.get(schl);
    let grund=0;
    if(!B) grund=1;
    else if(g.passt!==B && (B.n!==g.idx.length || B.hash!==g.hash || !gleich(B.keys, g.keys))) grund=2;
    else { g.passt=B; const ix=blockIx(K, B), art=B.art, x0=B.x0, v=K.X.v;
      for(let a=0;a<B.m;a++){ let x=v[ix[a]]-x0[a]; if(art[a]===0 || art[a]===2) x=wrap(x); if(Math.abs(x)>sw[art[a]]){ grund=3; break; } }
      if(!grund && muSumme(K, g)!==B.muSum) grund=4; }
    if(grund) kand.push({grund, schl, g}); }
  // nach Grund, darin nach Schluessel: K.gruppen ist schon nach Schluessel geordnet, also Faecher je Grund
  { const f=[[], [], [], [], []]; for(const c of kand) f[c.grund].push(c); kand.length=0; for(const x of f) for(const c of x) kand.push(c); }
  let rest=budget, neu=0;
  // Budget: kein Block bei erschoepftem Budget; ein einzelner Block groesser als der Rest wird noch genommen, wenn bisher
  // keiner genommen wurde (Ueberschreitung hoechstens um diesen einen Block je Aufruf; danach ist rest < 0)
  for(const c of kand){ if(rest<=0 || (c.g.nRes>rest && neu>0)) break;
    const B=linGruppe(K, c.g, 3, aus, null); if(!B) continue;
    bloecke.set(c.schl, B); rest-=B.nRes; neu++; }
  // nur Bloecke des eigenen Bereichs aufraeumen (global bzw. dieser lokale Abschnitt), die anderen bleiben
  for(const [schl, B] of bloecke) if(B.scope===K.scope && !K.gruppen.has(schl)) bloecke.delete(schl);
  return {neu, behalten:K.gruppen.size-neu, relin:budget-rest, offen:kand.length-neu};
}
// o (ueber 4 hinaus): knoten, nurAb, pp wie im folgenden lmAusgleich (sonst andere Bloecke), max = Budget in Resten
// (Vorgabe relinMax).
G.lmBloecke=(karte, o0={})=>{
  const o={...DEF_A, ...DEF_B, ...o0}, K=kontext(karte, o);
  if(!karte.bloecke) karte.bloecke=new Map();
  const r=bloeckeAuffrischen(K, karte.bloecke, o, o.max ?? o.relinMax, null);   // Vorgabe: relinMax (Rundenbudget: M10 zieht ab)
  return {neu:r.neu, behalten:r.behalten, relin:r.relin};   // relin: neu linearisierte Reste (fuer das Rundenbudget in M10)
};

// ------------------------------------------------ Loeser (Muster, Symbolik, Numerik)
// F: [{keys, m, H (m×m, oberes Dreieck genutzt), g, c}]; frei: Schluessel der Unbekannten. Muster und Symbolik
// werden je Stufe gehalten und nur bei anderer Struktur (Unbekannte und Spalten je Faktor) neu gebaut.
const loese=(K, F, stufe)=>{
  const X=K.X, D=X.D, ixs=F.map(f=>f.ix || (f.ix=Int32Array.from(f.keys, k=>X.platz(k))));
  for(const k of K.frei) X.platz(k);
  const N=D.keys.length, fr=new Uint8Array(N), spalte=new Int32Array(N).fill(-1), idx=new Map(), liste=[];
  for(const k of K.frei) fr[D.m.get(k)]=1;
  for(const ix of ixs) for(let a=0;a<ix.length;a++){ const p=ix[a]; if(fr[p]===1){ fr[p]=2; liste.push(D.keys[p]); } }
  liste.sort(ordneSchl); liste.forEach((k,i)=>{ idx.set(k, i); spalte[D.m.get(k)]=i; });
  const n=liste.length; if(!n) return {n:0, liste, idx, dx:new Float64Array(0), F:null};
  const V=ixs.map(ix=>{ const v=new Int32Array(ix.length); for(let a=0;a<ix.length;a++) v[a]=spalte[ix[a]]; return v; });
  let h1=fnv(liste.join(',')), h2=0x9747b28c, nv=0;
  for(const v of V){ for(let a=0;a<v.length;a++){ h1^=v[a]+1; h1=Math.imul(h1, 0x01000193); h2^=v[a]+0x9e37; h2=Math.imul(h2, 0x85ebca6b); h2^=h2>>>13; } h1^=0xff; h1=Math.imul(h1, 0x01000193); nv+=v.length; }
  const schl=(h1>>>0)+':'+(h2>>>0)+':'+nv+':'+n+':'+V.length;
  const C=bereichC(K.karte, K.scope);
  let S=C[stufe];
  if(!S || S.schl!==schl){
    const cols=Array.from({length:n}, (_, j)=>[j]);
    for(const v of V) for(let a=0;a<v.length;a++){ const i=v[a]; if(i<0) continue; for(let e=0;e<v.length;e++){ const j=v[e]; if(j>i) cols[j].push(i); } }
    const Ap=new Int32Array(n+1); let nz=0;
    for(let j=0;j<n;j++){ const c=[...new Set(cols[j])].sort((a,b)=>a-b); cols[j]=c; nz+=c.length; Ap[j+1]=nz; }
    const Ai=new Int32Array(nz); for(let j=0;j<n;j++) Ai.set(cols[j], Ap[j]);
    const such=(i,j)=>{ let lo=Ap[j], hi=Ap[j+1]-1; while(lo<=hi){ const m=(lo+hi)>>1; if(Ai[m]<i) lo=m+1; else if(Ai[m]>i) hi=m-1; else return m; } return -1; };
    const slots=V.map(v=>{ const m=v.length, s=new Int32Array(m*m).fill(-1);
      for(let a=0;a<m;a++){ if(v[a]<0) continue; for(let e=a;e<m;e++){ if(v[e]<0) continue; const i=Math.min(v[a], v[e]), j=Math.max(v[a], v[e]); s[a*m+e]=such(i, j); } } return s; });
    const diag=new Int32Array(n); for(let j=0;j<n;j++) diag[j]=such(j, j);
    const gruppen=new Int32Array(n); for(let i=0;i<n;i++) gruppen[i]=gruppeVon(liste[i]);
    const ord=G.ldlOrdnung(n, Ap, Ai, gruppen), Sy=G.ldlSymb(n, Ap, Ai, ord.perm);
    S={schl, hash:h1>>>0, n, Ap, Ai, slots, diag, Sy, perm:ord.perm, name:ord.name, nnzL:Sy.nnzL, neu:true}; C[stufe]=S; }
  else S.neu=false;
  const Ax=new Float64Array(S.Ap[n]), b=new Float64Array(n);
  F.forEach((f,q)=>{ const v=V[q], s=S.slots[q], m=f.m;
    for(let a=0;a<m;a++){ if(v[a]<0) continue; b[v[a]]+=f.g[a]; for(let e=a;e<m;e++){ const p=s[a*m+e]; if(p>=0) Ax[p]+=f.H[a*m+e]; } } });
  for(let i=0;i<n;i++){ const p=S.diag[i]; Ax[p]+=K.o.lambda*Ax[p]+1e-12; }
  const Fa=G.ldlNum(S.Sy, Ax); if(!Fa) return null;
  const nb=new Float64Array(n); for(let i=0;i<n;i++) nb[i]=-b[i];
  return {n, liste, idx, dx:G.ldlLoes(Fa, nb, null), F:Fa, S, b};
}
// Schritt anwenden, begrenzt auf o.schritt (rad, m) durch gleichmaessiges Kuerzen.
const schritt=(K, L, begrenzt)=>{
  let s=1;
  if(begrenzt){ let ma=0, mt=0; L.liste.forEach((k,i)=>{ const v=Math.abs(L.dx[i]); if(istWinkel(k)) ma=Math.max(ma, v); else if(k[0]==='G' || k[0]==='E' || k.endsWith(':r')) mt=Math.max(mt, v); });
    s=Math.min(1, K.o.schritt[0]/Math.max(ma, 1e-300), K.o.schritt[1]/Math.max(mt, 1e-300)); }
  L.liste.forEach((k,i)=>K.X.set(k, K.X.get(k)+s*L.dx[i]));
  let m=0; for(let i=0;i<L.dx.length;i++) m=Math.max(m, Math.abs(s*L.dx[i]));
  return m;
}
// Takahashi: Z = A^-1 auf dem Muster von L (permutiert); Zd Diagonale, Zx wie Lx.
const takahashi=(Fa)=>{
  const {S, Li, Lx, D}=Fa, n=S.n, Lp=S.Lp, Zx=new Float64Array(Lp[n]), Zd=new Float64Array(n), acc=new Float64Array(n);
  for(let j=n-1;j>=0;j--){ const p0=Lp[j], p1=Lp[j+1];
    for(let p=p0;p<p1;p++) acc[Li[p]]=0;
    for(let pa=p0;pa<p1;pa++){ const i=Li[pa], la=Lx[pa]; let ai=acc[i]-la*Zd[i];   // acc[i] lokal (gleiche Reihenfolge)
      let q=Lp[i];
      for(let pb=pa+1;pb<p1;pb++){ const k=Li[pb]; while(Li[q]<k) q++; const z=Zx[q]; ai-=Lx[pb]*z; acc[k]-=la*z; }
      acc[i]=ai; }
    let s=1/D[j]; for(let p=p0;p<p1;p++){ Zx[p]=acc[Li[p]]; s-=Lx[p]*Zx[p]; } Zd[j]=s; }
  const pinv=S.pinv;
  return (a,b)=>{ let i=pinv[a], j=pinv[b]; if(i===j) return Zd[i]; if(i<j){ const t=i; i=j; j=t; }
    let lo=Lp[j], hi=Lp[j+1]-1; while(lo<=hi){ const m=(lo+hi)>>1; if(Li[m]<i) lo=m+1; else if(Li[m]>i) hi=m-1; else return Zx[m]; } return NaN; };
}
// Volle Kovarianzspalten fuer die Indizes ix (Loesungen mit Einheitsvektoren); Ergebnis k×k zeilenweise.
const covSpalten=(Fa, n, ix)=>{
  const k=ix.length, out=new Float64Array(k*k), e=new Float64Array(n);
  for(let a=0;a<k;a++){ if(ix[a]<0) continue; e.fill(0); e[ix[a]]=1; const x=G.ldlLoes(Fa, e, null); for(let b=0;b<k;b++) out[b*k+a]=ix[b]<0 ? 0 : x[ix[b]]; }
  return out;
}

// ------------------------------------------------ weitere Faktoren
const faktor=(keys, r, J /*n×m zeilenweise*/, sig)=>{
  const m=keys.length, H=new Float64Array(m*m), g=new Float64Array(m); let c=0;
  for(let q=0;q<r.length;q++){ const w=1/(sig[q]*sig[q]); c+=w*r[q]*r[q];
    for(let a=0;a<m;a++){ const ja=J[q*m+a]; if(ja===0) continue; const wa=w*ja; g[a]+=wa*r[q]; for(let e=a;e<m;e++) H[a*m+e]+=wa*J[q*m+e]; } }
  return {keys, m, H, g, c};
}
const numJ=(fn, v, h)=>{ const r0=fn(v), m=v.length, n=r0.length, J=new Float64Array(n*m), w=Float64Array.from(v);
  for(let a=0;a<m;a++){ w[a]=v[a]+h; const rp=fn(w); w[a]=v[a]-h; const rm=fn(w); w[a]=v[a]; for(let i=0;i<n;i++) J[i*m+a]=(rp[i]-rm[i])/(2*h); }
  return {r:r0, J}; }
const gObj=pw=>({psi:pw.psi, tx:pw.tx, ty:pw.ty, tz:pw.tz});
// Schnitte zwischen Abschnitten im Ausgleich: Schnitt i trennt abschnitte[i] und abschnitte[i+1] (zurueck: zurueckZu).
const kettenPaare=(K)=>{
  const S=K.karte.schnitte || [], A=K.karte.abschnitte || [], out=[];
  S.forEach((s,i)=>{ if(!s || !s.bindung || s.bindung.art==='keine') return;
    const a=s.klasse==='zurueck' && s.zurueckZu!=null ? s.zurueckZu : (A[i] ? A[i].ab : i), b=A[i+1] ? A[i+1].ab : i+1;
    const ia=K.I.get(a), ib=K.I.get(b); if(!ia || !ib || a===b) return;
    out.push({i, s, ia, ib}); });
  return out;
}
// Kettenfaktor bei gewaehlter Komponente; liefert auch chi2 je Komponente.
const kettenAuswertung=(K, kp)=>{
  const Pa=poseInfo(K, kp.ia, kp.s.t), Pb=poseInfo(K, kp.ib, kp.s.t), keys=[...Pa.keys, ...Pb.keys], v=Float64Array.from(keys, k=>K.X.get(k));
  const pa={}, pb={}, na=Pa.keys.length;
  const fn=w=>{ poseWert(Pa, w, 0, kp.s.t, pa); poseWert(Pb, w, na, kp.s.t, pb); return G.resKette(kp.s, gObj(pa), gObj(pb)).r; };
  poseWert(Pa, v, 0, kp.s.t, pa); poseWert(Pb, v, na, kp.s.t, pb);
  const rk=G.resKette(kp.s, gObj(pa), gObj(pb));
  return {keys, v, fn, rk};
}
const chi2Von=(r,sig)=>{ let s=0; for(let q=0;q<r.length;q++) s+=(r[q]/sig[q])**2; return s; };
// Max-Mixture (3.2.1, 6.5): sprung setzen bei chi2_stetig >= mmSchwelle, loesen bei < mmZurueck; anker nur mit w > 0
// und kleinsten Kosten 1/2 chi2 + 1/2 ln|Sigma| - ln w.
const mmWahl=(K, kp, alt)=>{
  const ev=kettenAuswertung(K, kp), komp=ev.rk.komp || [], st=komp.find(c=>c.name==='stetig'), sp=komp.find(c=>c.name==='sprung' && c.w>0);
  if(!st) return {k:alt || 'stetig', ev, komp:null, chi2:NaN};
  const chi2=chi2Von(ev.rk.r, st.sigma);
  let k=sp && G.hyst(alt==='sprung', chi2, K.o.mmSchwelle, K.o.mmZurueck, '>=') ? 'sprung' : 'stetig';
  const an=komp.find(c=>c.name==='anker' && c.w>0);
  if(an){ const kost=c=>0.5*chi2Von(ev.rk.r, c.sigma)+c.sigma.reduce((s,x)=>s+Math.log(x), 0)-Math.log(c.w), kk=komp.find(c=>c.name===k);
    if(kost(an)<kost(kk)) k='anker'; }
  return {k, ev, komp:komp.find(c=>c.name===k), chi2};
}
const kettenFaktoren=(K, wahl, nurPsi)=>{
  const F=[];
  for(const kp of K.ketten){ const w=wahl.get(kp.i); if(!w || !w.komp) continue;
    const ev=kettenAuswertung(K, kp), {r, J}=numJ(ev.fn, ev.v, 1e-6), sig=w.komp.sigma;
    if(nurPsi){ const m=ev.keys.length, Jp=new Float64Array(m); for(let a=0;a<m;a++) Jp[a]=ev.keys[a].endsWith(':0') ? J[2*m+a] : 0; F.push(faktor(ev.keys, [r[2]], Jp, [sig[2]])); }
    else F.push(faktor(ev.keys, r, J, sig)); }
  return F;
}
// Folgekanten j -> j+1 (G.resKnoten, ohne Robustkern); d_j = gKomp(gInv(G_0), G_j).
const knotenFaktoren=(K, nurPsi, chiAus)=>{
  const F=chiAus ? null : [];
  for(const info of K.I.values()){ if(info.K<2) continue;
    for(let j=0;j+1<info.K;j++){
      const ks=[0, 1, 2, 3].map(c=>kG(info.ab, 0, c)), kj=[0, 1, 2, 3].map(c=>kG(info.ab, j, c)), kj1=[0, 1, 2, 3].map(c=>kG(info.ab, j+1, c));
      const keys=j===0 ? [...ks, ...kj1] : [...ks, ...kj, ...kj1], v=Float64Array.from(keys, k=>K.X.get(k));
      const fn=w=>{ const g0={psi:w[0], tx:w[1], ty:w[2], tz:w[3]}, i0=G.gInv(g0), o=j===0 ? 0 : 4;
        const gj=j===0 ? g0 : {psi:w[4], tx:w[5], ty:w[6], tz:w[7]}, gj1={psi:w[o+4], tx:w[o+5], ty:w[o+6], tz:w[o+7]};
        return G.resKnoten(info.A, j, G.gKomp(i0, gj), G.gKomp(i0, gj1)).r; };
      const g0={psi:v[0], tx:v[1], ty:v[2], tz:v[3]}, i0=G.gInv(g0), o=j===0 ? 0 : 4;
      const rk=G.resKnoten(info.A, j, G.gKomp(i0, j===0 ? g0 : {psi:v[4], tx:v[5], ty:v[6], tz:v[7]}), G.gKomp(i0, {psi:v[o+4], tx:v[o+5], ty:v[o+6], tz:v[o+7]}));
      if(chiAus) chiAus.push({ab:info.ab, j, chi2:chi2Von(rk.r, rk.sigma), r:[...rk.r], sigma:[...rk.sigma]});
      if(!F) continue;
      const {r, J}=numJ(fn, v, 1e-6), m=keys.length;
      if(nurPsi){ const Jp=new Float64Array(m); for(let a=0;a<m;a++) Jp[a]=keys[a].endsWith(':0') ? J[2*m+a] : 0; F.push(faktor(keys, [r[2]], Jp, [rk.sigma[2]])); }
      else F.push(faktor(keys, r, J, rk.sigma)); } }
  return F || [];
}
// h_f-Prior, H weich (6.2), Hauptpunkt-Prior, Rechtwinkligkeit (nur Stufe 1 und 3). Lokal (19.2 Z4): lokH 'hcf'
// h_f ~ hfLok und h_c - h_f = H (sigma K.sHlok), 'hc' h_c = H (sigma K.sHlok) bei h_f = 0 fest.
const priorFaktoren=(K, mitWinkel, nurHoehe)=>{
  const o=K.o, X=K.X, F=[], karte=K.karte;
  if(K.glob){
    // 6.2: h_c ~ H - dBoden, mit Boden schwach (hcPrior), ohne Boden eng (hcPriorOhneBoden, K.sHc); h_f und H (h_c - h_f)
    // nur mit beobachtetem Boden
    if(K.H!=null && K.sHc>0) F.push(faktor(['hc'], [X.get('hc')-K.hcM], Float64Array.of(1), [K.sHc]));
    if(K.boden){ F.push(faktor(['hf'], [X.get('hf')-K.hfM], Float64Array.of(1), [K.hfSig ?? o.hfPrior[1]]));
      if(K.H!=null) F.push(faktor(['hc', 'hf'], [X.get('hc')-X.get('hf')-K.H], Float64Array.of(1, -1), [K.sH])); }
    // ty eines Abschnitts mit A.fest (plan0) um ty der Kette: quelle 'kette' mit tyKette als Zahl immer (auch mit Ketten im
    // Ausgleich), sonst tyAnker nur ohne Kette im Ausgleich
    const sK=typeof o.tyKette==='number' && o.tyKette>0 ? o.tyKette : 0;
    if(o.tyAnker>0 || sK>0) for(const info of K.I.values()){ if(!info.plan0) continue;
      const ket=sK>0 && info.A.quelle==='kette', s=ket ? sK : o.tyAnker; if(!ket && (K.mitKette.has(info.ab) || !(s>0))) continue;
      const k=kG(info.ab, 0, 2), g0=info.A.g0, Ak=K.karte.abschnitte[K.karte.kern], gk=Ak && Ak.g ? Ak.g.ty : 0;
      const m=info.A.quelle==='kette' && g0 && Number.isFinite(g0.ty) ? gk+g0.ty : info.ty0;   // M10 (c): g = g_kern ∘ g0
      F.push(faktor([k], [X.get(k)-m], Float64Array.of(1), [s])); }
    if(K.ppFrei && !nurHoehe){ F.push(faktor(['ppx'], [X.get('ppx')], Float64Array.of(1), [o.ppSigma])); F.push(faktor(['ppy'], [X.get('ppy')], Float64Array.of(1), [o.ppSigma])); } }
  else { const kc=kL(K.ab, 'c'), kf=kL(K.ab, 'f');
    if(o.lokH==='hcf'){ F.push(faktor([kf], [X.get(kf)-o.hfLok[0]], Float64Array.of(1), [o.hfLok[1]]));
      if(K.H!=null) F.push(faktor([kc, kf], [X.get(kc)-X.get(kf)-K.H], Float64Array.of(1, -1), [K.sHlok])); }
    else if(K.H!=null) F.push(faktor([kc], [X.get(kc)-K.H], Float64Array.of(1), [K.sHlok])); }
  if(mitWinkel && o.rechtwinklig>0){ const ref=X.get('ref'), sig=o.rechtwinklig*D2R, lim=o.rundDeg*D2R;
    for(const w of K.waende.values()){ const k=kW(w.id, 'p'), r=wrap(X.get(k)-ref-Math.round((X.get(k)-ref)/(Math.PI/2))*Math.PI/2);
      if(Math.abs(r)<=lim) F.push(faktor([k, 'ref'], [r], Float64Array.of(1, -1), [sig])); } }
  return F;
}
// Ebenen (ARCore) und Tiefe mit Gewicht o.ebenen / o.tiefe (Vorgabe 0: nicht im Ausgleich).
const ebenenFaktoren=(K)=>{
  const F=[], o=K.o, T=K.karte.tiefe; if(!K.glob || !T) return F;
  const quellen=[];
  if(o.ebenen>0) for(const e of T.ebenenAR || []) quellen.push({e, w:o.ebenen, ar:true});
  if(o.tiefe>0) for(const e of T.ebenen || []) quellen.push({e, w:o.tiefe, ar:false});
  for(const {e, w, ar} of quellen){ const W=e.wallId!=null && K.waende.get(e.wallId), info=K.I.get(ar ? e.ab : (e.ab ?? e.sec)); if(!W || !info) continue;
    const P=poseInfo(K, info, e.t ?? 0), keys=[kW(W.id, 'p'), kW(W.id, 'r'), ...P.keys], v=Float64Array.from(keys, k=>K.X.get(k)), pw={};
    const fn=x=>{ poseWert(P, x, 2, e.t ?? 0, pw); const Wl={phi:x[0], rho:x[1]};
      return ar ? G.resEbene(e, Wl, gObj(pw)) : Array.from(G.resTiefe(e, Wl, gObj(pw))); };
    const {r, J}=numJ(fn, v, 1e-6), cv=e.cov || [1e-4, 0, 1e-4], sR=Math.sqrt(Array.isArray(cv[0]) ? cv[1][1] : cv[2]), sP=Math.sqrt(Array.isArray(cv[0]) ? cv[0][0] : cv[0]);
    F.push(faktor(keys, r, J, ar ? [sR/Math.sqrt(w), sP/Math.sqrt(w)] : r.map(()=>sR/Math.sqrt(w)))); }
  return F;
}

// ------------------------------------------------ Bodenguete q (6.2), vereinfacht
// q = max ueber Waende mit Decken- und Boden-Beob von min(1, b/0,6)·p, b = Spanne der Bodenkameras quer zur Linie,
// p = 1/(1 + exp((dchi2 - 4)/2)), dchi2 = chi2(h = h_f) - chi2(Hoehe der Bodenlinie frei) = g_h²/H_hh aus den
// Bodenbloecken am aktuellen Punkt (linear). Aus den vorhandenen Bloecken (vorige Linearisierung); ohne sie q der Karte.
const bodenGuete=(K, bloecke)=>{
  const je=new Map(), decke=new Set();
  for(const g of K.gruppen.values()){ const B=bloecke.get(g.schl); if(!B) continue;
    if(g.art==='w' && B.keys[2]==='hc') decke.add(g.L);
    if(g.art!=='f' || B.keys[2]!=='hf') continue;
    const P=blockAmPunkt(K, B), e=je.get(g.L) || {g:0, h:0, lo:Infinity, hi:-Infinity, n:0};
    e.g+=P.g[2]; e.h+=B.H[2*B.m+2]; e.lo=Math.min(e.lo, B.lo); e.hi=Math.max(e.hi, B.hi); e.n+=B.n; je.set(g.L, e); }
  if(!je.size) return K.karte.hoehen && Number.isFinite(K.karte.hoehen.q) ? K.karte.hoehen.q : 0;
  let q=0;
  for(const [L, e] of je){ if(!decke.has(L) || e.n<5 || !(e.h>0)) continue;
    const dchi=e.g*e.g/e.h, p=1/(1+Math.exp((dchi-4)/2)); q=Math.max(q, Math.min(1, (e.hi-e.lo)/0.6)*p); }
  return q;
}

// ------------------------------------------------ Stufe 1: Gier linear (5.4)
// Richtung je Segment-Beob: wrapPi(phi + 90° - psi(t) - psi_seg) mit psi_seg aus der Ebene der beiden Strahlen
// (hoehenfrei), sigma aus der Stoerung der Enden um sPx/f quer zur Ebene; dazu Folgekanten, Ketten (psi-Teil der
// gewaehlten Komponente) und die Manhattan-Rundung. Eine LDL^T. Ungewichtet robust (BLUE).
const psiSeg=(a,b)=>{ const nx=a[1]*b[2]-a[2]*b[1], ny=a[2]*b[0]-a[0]*b[2], nz=a[0]*b[1]-a[1]*b[0]; return {psi:Math.atan2(nx, -nz), n:[nx, ny, nz]}; };
// psi_seg und sigma je Beob: reine Funktion von da, db, sPx, f; gecacht je Beob-Objekt, solange diese gleich sind.
const SEGPSI=new WeakMap();
const segRichtung=b=>{ const s0=SEGPSI.get(b); if(s0 && s0.da===b.da && s0.db===b.db && s0.sPx===b.sPx && s0.f===b.f) return s0;
  const ps=psiSeg(b.da, b.db), nn=Math.hypot(...ps.n), s={da:b.da, db:b.db, sPx:b.sPx, f:b.f, ok:nn>1e-9, psi:ps.psi, sig:0};
  if(s.ok){ const e=(b.sPx>0 ? b.sPx : 1)/b.f, nh=ps.n.map(x=>x/nn), pa=psiSeg(b.da.map((x,q)=>x+e*nh[q]), b.db).psi, pb=psiSeg(b.da, b.db.map((x,q)=>x+e*nh[q])).psi;
    s.sig=Math.max(0.05*D2R, Math.hypot(wrapPi(pa-ps.psi), wrapPi(pb-ps.psi))); }
  SEGPSI.set(b, s); return s; };
const stufeGier=(K, wahl)=>{
  const F=[], X=K.X, pw={};
  for(const g of K.gruppen.values()){ if(g.art!=='w' && g.art!=='f') continue;
    const info0=K.I.get(g.ab), P0=poseInfo(K, info0, K.beob[g.idx[0]].t), keys=[g.keys[0], ...P0.keys.filter(k=>k.endsWith(':0'))], m=keys.length;
    const H=new Float64Array(m*m), gv=new Float64Array(m), v=Float64Array.from(g.keys, k=>X.get(k)), J=JA; let c=0;
    const P=info0.K>=2 ? {...P0} : P0, T=info0.t, nK=info0.K;   // ein Knotenintervall je Gruppe (wie linGruppe)
    for(const i of g.idx){ const b=K.beob[i]; if(!b.db) continue;
      const sg=segRichtung(b); if(!sg.ok) continue;
      if(nK>=2){ const t=b.t; P.u=t<=T[0] || t>=T[nK-1] ? 0 : (t-T[P.j0])/(T[P.j1]-T[P.j0]); }
      const gw=poseWert(P, v, 3, b.t, pw);
      const sig=sg.sig, r=wrapPi(v[0]+Math.PI/2-gw.psi-sg.psi), w=1/(sig*sig);
      for(let a=0;a<m;a++) J[a]=0; J[0]=1;
      if(m===3){ J[1]=-(1-P.u); J[2]=-P.u; } else if(m===2) J[1]=-1;
      c+=w*r*r; for(let a=0;a<m;a++){ gv[a]+=w*J[a]*r; for(let q=a;q<m;q++) H[a*m+q]+=w*J[a]*J[q]; } }
    F.push({keys, m, H, g:gv, c}); }
  F.push(...kettenFaktoren(K, wahl, true), ...knotenFaktoren(K, true, null), ...priorFaktoren(K, true, true).filter(f=>f.keys.includes('ref')));
  K.frei=new Set();
  for(const info of K.I.values()) if(!info.lokal) for(let j=0;j<info.K;j++) if(!(j===0 && (info.fest0 || info.plan0))) K.frei.add(kG(info.ab, j, 0));
  for(const w of K.waende.values()) K.frei.add(kW(w.id, 'p'));
  K.frei.add('ref');
  const L=loese(K, F, 'gier'); if(!L) return false;
  schritt(K, L, false);
  return true;
}

// ------------------------------------------------ Stufe 2: linear im Strahlbild (5.4)
// Bei festen Gieren und Wandrichtungen sind Reste, Ketten, Folgekanten und h_c - h_f = H linear in tx, ty, tz, rho,
// p, h_c, h_f. Waende mit Basis < basisMin und eigene Hoehen bleiben fest; Gewicht je Beob min(1, basis/0,3).
// GNC: vor jeder Loesung Gewichte aus dem Rest, danach mu <- max(1, mu/gncFaktor).
const stufeLinear=(K, wahl)=>{
  const X=K.X, o=K.o, basis=new Map(), pw={};
  // Basis je Wand: Spanne der Kameras quer zur Linie (ein Durchgang ueber die Wandgruppen)
  const span=new Map();
  for(const w of K.waende.values()) if(!Number.isFinite(w.basis)) span.set(w.id, {nx:Math.cos(X.get(kW(w.id, 'p'))), nz:Math.sin(X.get(kW(w.id, 'p'))), lo:Infinity, hi:-Infinity});
  for(const g of K.gruppen.values()){ if(g.art!=='w' && g.art!=='f') continue; const sp=span.get(g.L); if(!sp) continue;
    const v=Float64Array.from(g.keys, k=>X.get(k)), nx=sp.nx, nz=sp.nz, info0=K.I.get(g.ab), P0=poseInfo(K, info0, K.beob[g.idx[0]].t), P=info0.K>=2 ? {...P0} : P0, T=info0.t, nK=info0.K;
    let psi0=NaN, cs=NaN, sn=NaN;
    for(const i of g.idx){ const b=K.beob[i];
      if(nK>=2){ const t=b.t; P.u=t<=T[0] || t>=T[nK-1] ? 0 : (t-T[P.j0])/(T[P.j1]-T[P.j0]); }
      const gw=poseWert(P, v, 3, b.t, pw); if(gw.psi!==psi0){ psi0=gw.psi; cs=Math.cos(psi0); sn=Math.sin(psi0); }
      const s=nx*(cs*b.c[0]-sn*b.c[2]+gw.tx)+nz*(sn*b.c[0]+cs*b.c[2]+gw.tz); sp.lo=Math.min(sp.lo, s); sp.hi=Math.max(sp.hi, s); } }
  for(const w of K.waende.values()){ if(Number.isFinite(w.basis)){ basis.set(w.id, w.basis); continue; }
    const sp=span.get(w.id); basis.set(w.id, sp.hi>sp.lo ? sp.hi-sp.lo : 0); }
  // rep/erf: Waende mit Erfassungen (nutzer) haben die Tiefe aus h_c, nicht aus der Basis: Gewicht 1, rho frei
  const nutzerW=new Set(); for(const b of K.beob) if(b && b.nutzer && b.L!=null && b.L!==-1) nutzerW.add(b.L);
  const wBasis=b=>{ if(b.art==='ecke' || nutzerW.has(b.L)) return 1; const v=basis.get(b.L); return Math.min(1, (v ?? 0.3)/0.3); };
  K.frei=new Set();
  for(const info of K.I.values()) if(!info.lokal) for(let j=0;j<info.K;j++){ if(j===0 && info.fest0) continue;
    if(j===0 && info.plan0){ K.frei.add(kG(info.ab, 0, 2)); continue; }   // A.fest: nur ty (6.1)
    for(let c=1;c<4;c++) K.frei.add(kG(info.ab, j, c)); }
  // Hoehen nur global (h_c, h_f; 5.4): eigene Hoehen ('lokal', Zahl) bleiben in Stufe 2 fest (sonst zoege h auf Kamerahoehe)
  for(const w of K.waende.values()) if((basis.get(w.id) ?? 0)>=o.basisMin || nutzerW.has(w.id)) K.frei.add(kW(w.id, 'r'));
  for(const e of K.ecken.values()){ K.frei.add(kE(e.id, 'x')); K.frei.add(kE(e.id, 'z')); }
  K.frei.add('hc'); if(K.boden) K.frei.add('hf');
  // frei je Platz: linGruppe (modus 2) laesst die Zeilen fester Spalten aus (Gier, Wandrichtung; loese nutzt sie ohnehin nicht)
  for(const k of K.frei) K.X.platz(k);
  K.freiP=new Uint8Array(K.X.D.keys.length); for(const k of K.frei) K.freiP[K.X.D.m.get(k)]=1;
  let n=0;
  for(let l=0;l<o.lin;l++){
    const F=[];
    for(const g of K.gruppen.values()){ const B=linGruppe(K, g, 2, null, wBasis); if(B) F.push(B); }
    F.push(...kettenFaktoren(K, wahl, false), ...knotenFaktoren(K, false, null), ...priorFaktoren(K, false, true));
    const L=loese(K, F, 'lin'); if(!L) return -1;
    schritt(K, L, false); n++;
    for(const g of K.gruppen.values()) for(const i of g.idx) K.mu[i]=Math.max(1, K.mu[i]/o.gncFaktor);
    K.muVer++; }
  return n;
}

// ------------------------------------------------ Ausgleich
G.lmAusgleich=(karte, o0={})=>{
  const o={...DEF_A, ...DEF_B, ...o0}, K=kontext(karte, o), KN=G.KG.KNOTEN;
  const leer={chi2:0, iter:0, lin:0, relin:0, abgehaengt:0, cov:false, ok:false, stufen:{gier:false, lin:0, gn:0, grund:null}, ldl:{n:0, nnzL:0, ordnung:null}, mm:[], rest:[]};
  if(K.glob && karte.kern==null) return {...leer, grund:'kein Kern'};
  if(!K.gruppen.size) return {...leer, grund:'keine Beobachtungen'};
  // H weich mit sigma_H(q); q aus den Bodenkanten
  const Hl=o.laserH ?? (karte.H && Number.isFinite(karte.H.laser) ? karte.H.laser : null), bloecke=new Map(karte.bloecke || []), q=K.glob ? bodenGuete(K, bloecke) : 0;
  // 6.2 (rep/q1): Boden beobachtet = mindestens eine Gruppe 'f' (Bodenkante bzw. Wand mit h 'f') im globalen Ausgleich; nur
  // dann sind h_f und h_c - h_f = H im Ausgleich. Erfassungen (nutzer) gelten nur mit erfassungBoden (Vergleich, alter Weg
  // rep/erf: Bezugsboden als Beleg, q >= qErfassung, sigma h_f = hfErfassung) als Boden.
  const mitNutzer=o.erfassungBoden===true && (karte.beob||[]).some(b=>b && b.nutzer && b.schluessel && b.L!=null && b.L!==-1);
  const bodenF=K.glob && [...K.gruppen.values()].some(g=>g.art==='f');
  const qH=mitNutzer ? Math.max(q, o.qErfassung ?? 1) : q; K.hfSig=mitNutzer ? Math.min(o.hfPrior[1], o.hfErfassung ?? 0.03) : o.hfPrior[1];
  K.H=Hl; K.sH=Math.hypot(Math.max(o.sHmin, karte.H && karte.H.sigma || 0), 0.25*(1-qH));
  K.boden=K.glob && (bodenF || mitNutzer); K.dBoden=K.glob && o.bodenKette!==false ? bodenVersatz(karte) : 0;
  K.hcM=Hl!=null ? Hl-K.dBoden : null; K.hfM=o.hfPrior[0]-K.dBoden;
  K.sHc=!K.boden && o.hcPriorOhneBoden>0 ? o.hcPriorOhneBoden : o.hcPrior;   // sigma des h_c-Priors (6.2, rep/m6b)
  if(K.glob && !Number.isFinite(karte.hC) && K.hcM!=null) K.X.set('hc', K.hcM);   // Start ohne h_c der Karte: Mitte des Priors
  // lokal (19.2 Z4): eigene Bindung mit sHlok statt K.sH (dort wirkte qH aus den Erfassungen als h_c fest mit 1,5 cm)
  K.sHlok=Math.max(o.sHlok, karte.H && karte.H.sigma || 0);
  K.ketten=K.glob && o.kette ? kettenPaare(K) : [];
  K.mitKette=new Set(); for(const kp of K.ketten){ K.mitKette.add(kp.ia.ab); K.mitKette.add(kp.ib.ab); }
  const wahlAlt=new Map(K.ketten.map(kp=>[kp.i, kp.s.bindung.k || null])), wahl=new Map();
  const beobAus={w:new Float64Array(K.beob.length).fill(NaN), chi2:new Float64Array(K.beob.length)};
  const waehle=()=>{ for(const kp of K.ketten) wahl.set(kp.i, mmWahl(K, kp, (wahl.get(kp.i) || {}).k ?? wahlAlt.get(kp.i))); };
  // ---- Stufen 1/2 (nur global, lago)
  let grund=null, stufen={gier:false, lin:0, gn:0, grund:null}, lin=0;
  const sig=K.glob ? lagoSignatur(K) : null, alt=karte.ldl && karte.ldl.lagoSig;
  if(K.glob && o.lago!=='aus'){
    if(o.lago==='immer') grund='immer';
    else if(o.lagoGrund) grund=o.lagoGrund;
    else if(o.schluss) grund='schluss';
    else if(!alt) grund='kern';
    else if(alt!==sig) grund=lagoGrundVon(alt, sig); }
  if(grund){ waehle();
    if(!stufeGier(K, wahl)) return {...leer, grund:'Stufe 1 singulaer'};
    stufen.gier=true; lin++; waehle();
    const n=stufeLinear(K, wahl); if(n<0) return {...leer, grund:'Stufe 2 singulaer'};
    stufen.lin=n; lin+=n; stufen.grund=grund; }
  // ---- Stufe 3: Gauss-Newton im Bild
  K.frei=new Set();
  for(const info of K.I.values()) if(!info.lokal) for(let j=0;j<info.K;j++){ if(j===0 && info.fest0) continue;
    if(j===0 && info.plan0){ K.frei.add(kG(info.ab, 0, 2)); continue; }   // A.fest: nur ty (6.1)
    for(let c=0;c<4;c++) K.frei.add(kG(info.ab, j, c)); }
  for(const w of K.waende.values()){ K.frei.add(kW(w.id, 'p')); K.frei.add(kW(w.id, 'r')); if(typeof w.h==='number' || w.h==='lokal') K.frei.add(kW(w.id, 'h')); }
  for(const e of K.ecken.values()){ K.frei.add(kE(e.id, 'x')); K.frei.add(kE(e.id, 'z')); }
  K.frei.add('ref');
  if(K.glob){ K.frei.add('hc'); if(K.boden) K.frei.add('hf'); if(K.ppFrei){ K.frei.add('ppx'); K.frei.add('ppy'); } }
  else { K.frei.add(kL(K.ab, 'c')); if(o.lokH==='hcf') K.frei.add(kL(K.ab, 'f')); }
  let budget=o.relinMax, relin=0, it=0, L=null, F=null, offen=0;
  for(;it<o.iter;it++){
    waehle();
    const r=bloeckeAuffrischen(K, bloecke, o, budget, beobAus); budget-=r.relin; relin+=r.relin; offen=r.offen;
    F=[];
    for(const g of K.gruppen.values()){ const B=bloecke.get(g.schl); if(B) F.push(blockAmPunkt(K, B)); }
    // Nur Groessen mit linearisierten Daten loesen: Ketten, Folgekanten, Rechtwinkligkeit und Ebenen nur an Abschnitten
    // bzw. Waenden mit mindestens einem Block (sonst zoege allein der Prior, z. B. bei erschoepftem relinMax).
    const D=K.X.D, dat=new Uint8Array(D.keys.length), abDaten=new Set();
    for(const f of F){ const ix=f.ix; for(let a=0;a<ix.length;a++) dat[ix[a]]=1; }
    for(let p=0;p<dat.length;p++) if(dat[p] && D.keys[p][0]==='G') abDaten.add(+D.keys[p].slice(1, 6));
    const daten={has:k=>{ const p=D.m.get(k); return p!==undefined && dat[p]===1; }};
    const okAb=ab=>abDaten.has(ab) || (K.I.get(ab) && (K.I.get(ab).fest0 || K.I.get(ab).plan0) && K.I.get(ab).K<2);
    const ketten=K.ketten; K.ketten=ketten.filter(kp=>okAb(kp.ia.ab) && okAb(kp.ib.ab));
    const Fk=kettenFaktoren(K, wahl, false); K.ketten=ketten;
    const Fn=o.knoten ? knotenFaktoren(K, false, null).filter(f=>f.keys.some(k=>daten.has(k))) : [];
    const Fp=priorFaktoren(K, true, false).filter(f=>!f.keys.some(k=>k[0]==='W') || f.keys.every(k=>k[0]!=='W' || daten.has(k)));
    const Fe=ebenenFaktoren(K).filter(f=>f.keys.every(k=>k[0]!=='W' || daten.has(k)));
    F.push(...Fk, ...Fn, ...Fp, ...Fe);
    const Ln=loese(K, F, 'gn'); if(!Ln) return {...leer, iter:it, relin, grund:'singulaer'};
    L=Ln;
    const m=schritt(K, L, true);
    if(m<1e-9) { it++; break; } }
  stufen.gn=it;
  // ---- Kosten, Folgekanten, Kovarianz
  let chi2=0; if(F) for(const f of F) chi2+=f.c;
  const kn=[]; if(o.knoten) knotenFaktoren(K, false, kn);
  const rest=kn.filter(x=>x.chi2>KN.chiRest).map(x=>({ab:x.ab, j:x.j, chi2:x.chi2}));
  const Z=L && L.F ? takahashi(L.F) : null, ix=k=>L && L.idx.has(k) ? L.idx.get(k) : -1;
  const cv=(ks)=>{ const k=ks.length, out=new Float64Array(k*k); for(let a=0;a<k;a++) for(let b=0;b<k;b++){ const ia=ix(ks[a]), ib=ix(ks[b]); out[a*k+b]=ia>=0 && ib>=0 ? Z(ia, ib) : 0; } return out; };
  // ---- schreiben (nur, was in der Loesung stand: ohne Block, z. B. bei erschoepftem relinMax, bleiben Wert, cov und sig)
  const X=K.X, drin=k=>ix(k)>=0, k4=(ab,j)=>[0, 1, 2, 3].map(c=>kG(ab, j, c));
  for(const info of K.I.values()){ if(info.lokal) continue; const A=info.A;
    const Gj=j=>({psi:X.get(kG(A.ab, j, 0)), tx:X.get(kG(A.ab, j, 1)), ty:X.get(kG(A.ab, j, 2)), tz:X.get(kG(A.ab, j, 3))});
    let neu=false;
    if(info.fest0){ A.cov=new Float64Array(16); neu=true; }
    else if(info.plan0){ const ky=kG(A.ab, 0, 2), C=new Float64Array(16);   // A.fest: Plan bitgleich, ty aus dem Ausgleich
      if(drin(ky)){ A.g={psi:A.g.psi, tx:A.g.tx, ty:X.get(ky), tz:A.g.tz}; C[10]=Z(ix(ky), ix(ky)); }
      else if(A.cov && A.cov.length>=16) C[10]=A.cov[10];
      A.cov=C; neu=true; }
    else if(drin(kG(A.ab, 0, 0))){ A.g=Gj(0); A.cov=cv(k4(A.ab, 0)); neu=true; }
    if(info.K>=2){ const g0=Gj(0), i0=G.gInv(g0), d=new Float64Array(4*info.K), C=new Float64Array(16*info.K), alt=A.knoten.cov;
      for(let j=0;j<info.K;j++){ const dj=j===0 ? {psi:0, tx:0, ty:0, tz:0} : G.gKomp(i0, Gj(j)); d.set([dj.psi, dj.tx, dj.ty, dj.tz], 4*j);
        if(j===0 && A.cov) C.set(A.cov, 0);
        else if(drin(kG(A.ab, j, 0))){ C.set(cv(k4(A.ab, j)), 16*j); neu=true; }
        else if(alt && alt.length>=16*(j+1)) C.set(alt.subarray(16*j, 16*j+16), 16*j);
        else if(j>0) C.set(C.subarray(16*(j-1), 16*j), 16*j); }
      A.knoten.d=d; A.knoten.cov=C; if(neu) A.sig=G.abschnittSigma(C); }
    else if(neu) A.sig=G.abschnittSigma(A.cov); }
  for(const w of K.waende.values()){ const kp=kW(w.id, 'p'), kr=kW(w.id, 'r'); if(!drin(kp) || !drin(kr)) continue; const C=cv([kp, kr]);
    w.phi=wrap2pi(X.get(kp)); w.rho=X.get(kr); w.cov=[C[0], C[1], C[3]];
    const kh=kW(w.id, 'h');
    if(X.has(kh) && drin(kh)){ const s=Math.sqrt(Math.max(0, Z(ix(kh), ix(kh)))), h=X.get(kh);
      if(typeof w.h==='number') w.h=h; else if(w.h==='lokal') w.hLokal={h, lo:h-2*s, hi:h+2*s}; } }
  // Fehlerband (Kritik 35, 3.6): Querblock (phi, rho) × G am letzten Knoten des laufenden Abschnitts (letzter Abschnitt im
  // Ausgleich) aus Spaltenloesungen, dazu sigma_quer(s)^2 = k0 + 2·k1·s + k2·s^2 (s = u·p in F0 bzw. im Rahmen der lokalen
  // Wand). Damit gilt fehlerband ohne die Faktorisierung (Kopie, structuredClone, KarteStand). Lokal: g fest, nur W.cov.
  if(Z){ let lauf=null; if(K.glob) for(const info of K.I.values()) lauf=info;
    const jL=lauf ? lauf.K-1 : 0, kg=lauf ? k4(lauf.ab, jL) : null, ig=kg ? kg.map(ix) : [-1, -1, -1, -1];
    const sp=ig.map(i=>{ if(i<0) return null; const e=new Float64Array(L.n); e[i]=1; return G.ldlLoes(L.F, e, null); });
    const Cg=new Float64Array(16); for(let a=0;a<4;a++) for(let b=0;b<4;b++) Cg[a*4+b]=sp[a] && ig[b]>=0 ? sp[a][ig[b]] : 0;
    const gL=kg ? {psi:X.get(kg[0]), tx:X.get(kg[1]), ty:X.get(kg[2]), tz:X.get(kg[3])} : {psi:0, tx:0, ty:0, tz:0};
    for(const w of K.waende.values()){ const ip=ix(kW(w.id, 'p')), ir=ix(kW(w.id, 'r')); if(ip<0 || ir<0) continue;
      const quer=[0, 0, 0, 0, 0, 0, 0, 0]; for(let c=0;c<4;c++) if(sp[c]){ quer[c]=sp[c][ip]; quer[4+c]=sp[c][ir]; }
      w.band={ab:K.glob ? (lauf ? lauf.ab : null) : K.ab, j:jL, k:bandK(w.phi, w.cov, quer, Cg, gL), quer}; } }
  for(const e of K.ecken.values()){ if(!drin(kE(e.id, 'x')) || !drin(kE(e.id, 'z'))) continue; const C=cv([kE(e.id, 'x'), kE(e.id, 'z')]); e.p=[X.get(kE(e.id, 'x')), X.get(kE(e.id, 'z'))]; e.cov=[C[0], C[1], C[3]]; }
  // Ecken als Schnitt zweier Waende: p und cov aus den Waenden (aus Z; ausserhalb des Musters Spaltenloesungen)
  if(karte.ecken) for(const e of karte.ecken.values()){ if(!e.waende || e.rahmen!==(K.glob ? -1 : K.ab)) continue;
    const wa=K.waende.get(e.waende[0]), wb=K.waende.get(e.waende[1]); if(!wa || !wb) continue;
    const ks=[kW(wa.id, 'p'), kW(wa.id, 'r'), kW(wb.id, 'p'), kW(wb.id, 'r')]; if(!ks.every(drin)) continue;
    const p=G.wandSchnitt(wa, wb); if(!p) continue;
    let C=cv(ks); if(C.some(Number.isNaN)) C=covSpalten(L.F, L.n, ks.map(ix));
    const na=[Math.cos(wa.phi), Math.sin(wa.phi)], nb=[Math.cos(wb.phi), Math.sin(wb.phi)], det=na[0]*nb[1]-na[1]*nb[0], i00=nb[1]/det, i01=-na[1]/det, i10=-nb[0]/det, i11=na[0]/det;
    const ua=-na[1]*p[0]+na[0]*p[1], ub=-nb[1]*p[0]+nb[0]*p[1], D=[[-i00*ua, i00, -i01*ub, i01], [-i10*ua, i10, -i11*ub, i11]], P2=[0, 0, 0];
    for(let a=0;a<4;a++) for(let b=0;b<4;b++){ const c=C[a*4+b]; P2[0]+=D[0][a]*c*D[0][b]; P2[1]+=D[0][a]*c*D[1][b]; P2[2]+=D[1][a]*c*D[1][b]; }
    e.p=p; e.cov=P2; }
  const vH=k=>Math.sqrt(Math.max(0, Z(ix(k), ix(k))));
  if(K.glob){ if(drin('hc')){ karte.hC=X.get('hc'); karte.sHC=vH('hc'); } if(drin('hf')){ karte.hF=X.get('hf'); karte.sHF=vH('hf'); }
    // quelle: 'laser' bzw. 'laser-weich' nur mit beobachtetem Boden (H bindet h_c - h_f); ohne Boden 'laser-kette' (h_c eng um
    // H - dBoden, hcPriorOhneBoden) bzw. 'parallaxe' (ohne H oder hcPriorOhneBoden null: Prior hcPrior); hC, sHC, boden, dBoden,
    // hcM nur Bericht (rep/m6h, rep/m6b)
    const ohneB=Hl!=null && !K.boden && o.hcPriorOhneBoden>0;
    karte.hoehen={quelle:ohneB ? 'laser-kette' : Hl==null || !K.boden ? 'parallaxe' : q>=0.9 ? 'laser' : 'laser-weich', q, boden:K.boden, dBoden:K.dBoden, hcM:K.hcM,
      hC:karte.hC, sHC:karte.sHC};
    if(K.ppFrei && drin('ppx')) karte.pp={cx:X.get('ppx'), cy:X.get('ppy'), sig:Math.max(vH('ppx'), vH('ppy')), frei:true};
    else if(!K.ppFrei && karte.pp && karte.pp.frei) karte.pp={...karte.pp, frei:false}; }   // 'fest': cx, cy bleiben (geschaetzt)
  // lokal: hLok = {hC, sHC, hF} (19.3); sHC nach unten durch die Streuung der entschiedenen Kantenhoehen begrenzt (19.2 Z4)
  let lok=null;
  if(!K.glob && drin(kL(K.ab, 'c'))){ const A=karte.abschnitte[K.ab], kf=kL(K.ab, 'f'), st=kantenStreuung(K, o), sF=vH(kL(K.ab, 'c'));
    const hF=o.lokH==='hcf' && drin(kf) ? X.get(kf) : 0;
    A.hLok={hC:X.get(kL(K.ab, 'c')), sHC:Math.max(sF, st.s, o.sHCmin), hF};
    lok={sHCformal:sF, streu:st.s, nKanten:st.n, sHF:o.lokH==='hcf' && drin(kf) ? vH(kf) : 0}; }
  for(const g of K.gruppen.values()) for(const i of g.idx){ const b=K.beob[i];   // neu linearisierte Beob (nur Gruppen-Beob)
    if(!Number.isNaN(beobAus.w[i])){ b.w=beobAus.w[i]; b.chi2=beobAus.chi2[i]; }
    b.mu=Math.max(1, K.mu[i]/o.gncFaktor); if(!Number.isFinite(b.w)) b.w=1; }
  const mm=[];
  for(const kp of K.ketten){ const w=wahl.get(kp.i); if(!w) continue; kp.s.bindung.k=w.k; mm.push({schnitt:kp.i, t:kp.s.t, k:w.k, chi2:w.chi2}); }
  karte.bloecke=bloecke;
  const S=L ? L.S : null;
  if(K.glob) karte.ldl={struktur:S ? S.hash : null, perm:S ? S.perm : null, name:S ? S.name : null, nnzL:S ? S.nnzL : 0, lagoSig:sig};
  bereichC(karte, K.scope).letzte=L && L.F ? {F:L.F, n:L.n, idx:L.idx, glob:K.glob, ab:K.ab, kern:K.glob ? karte.kern : null,
    fest:K.glob ? [...K.I.values()].filter(i=>i.fest0).map(i=>i.ab) : null, plan:K.glob ? [...K.I.values()].filter(i=>i.plan0).map(i=>i.ab) : null} : null;
  return {chi2, iter:it, lin, relin, abgehaengt:0, cov:!!Z, ok:true, stufen, ldl:{n:L ? L.n : 0, nnzL:S ? S.nnzL : 0, ordnung:S ? S.name : null},
    mm, rest, offen, q, lok, hoehe:K.glob ? {hC:karte.hC, sHC:karte.sHC, boden:K.boden, dBoden:K.dBoden, hcM:K.hcM} : null};
};
// Streuung der entschiedenen Kantenhoehen eines lokalen Ausgleichs: Waende mit h 'c' (gemeinsame Deckenhoehe des
// Rahmens) und hFrei (M5) mit Halbbreite <= halbKante, nicht am Rand; s = 1,4826·MAD/sqrt(n) (robuste Streuung des
// Mittels), unter 2 Kanten 0.
const kantenStreuung=(K, o)=>{
  const h=[];
  for(const w of K.waende.values()){ const F=w.hFrei; if(w.h!=='c' || !F || !Number.isFinite(F.h) || F.rand || !((F.hi-F.lo)/2<=o.halbKante)) continue; h.push(F.h); }
  if(h.length<2) return {s:0, n:h.length};
  const med=a=>{ const x=[...a].sort((u,v)=>u-v), m=x.length>>1; return x.length%2 ? x[m] : (x[m-1]+x[m])/2; };
  const m=med(h), mad=med(h.map(x=>Math.abs(x-m)));
  return {s:1.4826*mad/Math.sqrt(h.length), n:h.length};
};
// Struktur fuer lago 'auto' (aus dem Zustand): Kern, verbundene Abschnitte, Knotenzahlen, gewaehlte Komponenten,
// gewaehlte Registrierungshypothesen.
const lagoSignatur=(K)=>{
  const k=K.karte, ab=[...K.I.values()].map(i=>i.ab+':'+i.K).join(','), mm=(k.schnitte || []).map(s=>s && s.bindung ? s.bindung.k || 'stetig' : '-').join(',');   // ungewaehlt (null) = stetig
  const reg=(k.abschnitte || []).map(a=>a && a.reg ? a.reg.gewaehlt : '-').join(',');
  return 'k'+k.kern+'|a'+ab+'|m'+mm+'|r'+reg;
}
const lagoGrundVon=(alt, neu)=>{
  const [ka, aa, ma, ra]=alt.split('|'), [kn, an, mn, rn]=neu.split('|');
  if(ka!==kn) return 'kern';
  const ab=s=>s.slice(1).split(',').filter(Boolean).map(x=>x.split(':'));
  const A=new Map(ab(aa)), N=new Map(ab(an));
  if([...N.keys()].some(x=>!A.has(x)) || [...A.keys()].some(x=>!N.has(x))) return 'verbunden';
  if([...N.entries()].some(([x, v])=>A.get(x)!==v)) return 'knoten';
  if(ma!==mn) return 'mm';
  if(ra!==rn) return 'reg';
  return 'verbunden';
}

// ------------------------------------------------ Kovarianz-Teilbloecke und Fehlerband
// J des Querfehlers an der Laengskoordinate s nach (phi, rho, psi, tx, ty, tz): J(s) = a + s·b mit a = (0, 1, -u·t, -nx, 0,
// -nz), b = (-1, 0, 1, 0, 0, 0) (Herleitung bei fehlerband). Koeffizienten k = (aCa, aCb, bCb) aus W.cov (3), dem Querblock
// quer (2×4 zeilenweise: phi, rho × psi, tx, ty, tz) und Cg (4×4) am Versatz g.
const bandK=(phi, cw, quer, Cg, g)=>{
  const nx=Math.cos(phi), nz=Math.sin(phi), ut=-nz*g.tx+nx*g.tz, a=[0, 1, -ut, -nx, 0, -nz], b=[-1, 0, 1, 0, 0, 0], C=new Float64Array(36);
  C[0]=cw[0]; C[1]=C[6]=cw[1]; C[7]=cw[2];
  for(let c=0;c<4;c++){ C[2+c]=C[(2+c)*6]=quer[c]; C[8+c]=C[(2+c)*6+1]=quer[4+c]; for(let d=0;d<4;d++) C[(2+c)*6+2+d]=Cg[c*4+d]; }
  const q=(x,y)=>{ let v=0; for(let i=0;i<6;i++) for(let k=0;k<6;k++) v+=x[i]*C[i*6+k]*y[k]; return v; };
  return [q(a, a), q(a, b), q(b, b)];
}
// Zugriffe, die auch die Form des KarteStand (3.6: Felder statt Map, knoten [{t, d}]) nehmen.
const holeW=(M, id)=>!M ? null : M.get ? M.get(id) : Array.isArray(M) ? M.find(x=>x && x.id===id) || null : null;
const holeA=(karte, ab)=>{ const A=karte && karte.abschnitte; if(!A) return null; const a=A[ab]; return a && a.ab===ab ? a : A.find(x=>x && x.ab===ab) || null; };
// G_0 des Abschnitts fest (Kern, A.fest mit quelle 'kette' bei tyKette 'fest', Orakel-Rahmen): aus der letzten Faktorisierung,
// sonst aus dem Zustand (nur der Kern; ein A.fest gilt dann als planAb mit gespeicherter cov, die 0 ist).
// Nur der Plan fest (A.fest, 6.1): psi, tx, tz von G_0 fest, ty frei (Lz.plan, sonst A.fest ausser am Kern).
const festAb=(karte, Lz, ab)=>{ if(Lz && Lz.fest) return Lz.fest.includes(ab); if(Lz) return Lz.kern===ab; return !!karte && karte.kern===ab; };
const planAb=(karte, Lz, ab)=>{ if(Lz && Lz.plan) return Lz.plan.includes(ab); const A=holeA(karte, ab); return !!(A && A.fest===true) && !(karte && karte.kern===ab); };
const knotenZahl=A=>!A || !A.knoten ? 0 : Array.isArray(A.knoten) ? A.knoten.length : A.knoten.t ? A.knoten.t.length : 0;
const letzterKnoten=A=>{ const n=knotenZahl(A); return n>1 ? n-1 : 0; };
const covGueltig=c=>!!c && c.length>=3 && c.every(Number.isFinite) && (c[0]>0 || c[2]>0);
// gespeicherte 4×4-Kovarianz von G_j: A.cov (j = 0) bzw. knoten.cov; fehlt der Knoten, der hoechste gespeicherte darunter
// (alt = true). null, wenn nichts gespeichert ist.
const covG=(A, j)=>{
  if(!A) return null;
  const Kc=A.knoten && !Array.isArray(A.knoten) ? A.knoten.cov : null, nK=Kc ? Math.floor(Kc.length/16) : 0;
  if(j>0 && nK>0){ const jj=Math.min(j, nK-1); return {c:Array.from(Kc.subarray ? Kc.subarray(16*jj, 16*jj+16) : Kc.slice(16*jj, 16*jj+16)), alt:jj<j}; }
  if(A.cov && A.cov.length>=16) return {c:Array.from(A.cov).slice(0, 16), alt:j>0};
  return null;
}
// ids: [{L}] -> (phi, rho), [{ab, j?}] -> (psi, tx, ty, tz) des Knotens j (Vorgabe 0), [{E}] -> (x, z).
// Quelle je id (Ergebnis.quelle): 'faktor' (alle Groessen in der letzten Faktorisierung dieser Karte: volle Querbloecke;
// A.fest mit j = 0: psi, tx, tz exakt 0, ty aus der Faktorisierung), 'fest' (Kern, A.fest mit quelle 'kette' bzw. Orakel-Rahmen mit j = 0, eigener
// Abschnitt einer lokalen Karte: 0 exakt), 'gespeichert' (W.cov, E.cov, A.cov/knoten.cov;
// 'gespeichert-alt': hoechster gespeicherter Knoten unter j), 'fehlt' (NaN). Querterme zwischen Quellen, die nicht beide
// 'faktor' sind: aus W.band.quer, wenn Abschnitt und Knoten passen ('band'), mit 'fest' 0, sonst NaN (nie still 0).
// Ergebnis.voll: keine NaN.
G.covBlock=(karte, ids)=>{
  // Bereich: lokal, wenn eine genannte Wand/Ecke zu einer lokalen Karte gehoert, sonst global
  let sc='g', rahmen=-1;
  for(const id of ids){ const x=id.L!=null ? holeW(karte.waende, id.L) : id.E!=null ? holeW(karte.ecken, id.E) : null; if(x && x.rahmen>=0){ sc='l'+x.rahmen; rahmen=x.rahmen; break; } }
  const C0=CACHE.get(karte), Lz=C0 && C0[sc] && C0[sc].letzte;
  const T=ids.map(id=>{
    const keys=id.L!=null ? [kW(id.L, 'p'), kW(id.L, 'r')] : id.E!=null ? [kE(id.E, 'x'), kE(id.E, 'z')] : [0, 1, 2, 3].map(c=>kG(id.ab, id.j || 0, c));
    const t={id, keys, n:keys.length, quelle:'fehlt', c:null};
    if(Lz && keys.every(k=>Lz.idx.has(k))){ t.quelle='faktor'; return t; }
    if(Lz && id.L==null && id.E==null && !(id.j>0) && rahmen<0 && planAb(karte, Lz, id.ab) && Lz.idx.has(keys[2])){ t.quelle='faktor'; return t; }
    if(id.L==null && id.E==null){ const j=id.j || 0;
      if(rahmen>=0 ? id.ab===rahmen : festAb(karte, Lz, id.ab) && j===0){ t.quelle='fest'; t.c=new Array(16).fill(0); return t; }
      const g=rahmen>=0 ? null : covG(holeA(karte, id.ab), j); if(g){ t.quelle=g.alt ? 'gespeichert-alt' : 'gespeichert'; t.c=g.c; }
      return t; }
    const x=id.L!=null ? holeW(karte.waende, id.L) : holeW(karte.ecken, id.E);
    if(x && covGueltig(x.cov)){ const c=x.cov; t.quelle='gespeichert'; t.c=[c[0], c[1], c[1], c[2]]; }
    return t; });
  const k=T.reduce((s,t)=>s+t.n, 0), out=new Float64Array(k*k).fill(NaN), off=[]; { let o=0; for(const t of T){ off.push(o); o+=t.n; } }
  // faktor × faktor: Spaltenloesungen
  const fk=T.filter(t=>t.quelle==='faktor');
  if(fk.length){ const ks=fk.flatMap(t=>t.keys), C=covSpalten(Lz.F, Lz.n, ks.map(s=>Lz.idx.has(s) ? Lz.idx.get(s) : -1)), pos=fk.flatMap(t=>t.keys.map((_, a)=>off[T.indexOf(t)]+a));
    for(let a=0;a<ks.length;a++) for(let b=0;b<ks.length;b++) out[pos[a]*k+pos[b]]=C[a*ks.length+b]; }
  // Diagonalbloecke aus dem Zustand
  T.forEach((t,q)=>{ if(!t.c) return; for(let a=0;a<t.n;a++) for(let b=0;b<t.n;b++) out[(off[q]+a)*k+off[q]+b]=t.c[a*t.n+b]; });
  // Querterme: fest -> 0; Wand × Abschnitt aus W.band.quer
  T.forEach((t,q)=>T.forEach((u,r)=>{ if(q===r || (t.quelle==='faktor' && u.quelle==='faktor')) return;
    if(t.quelle==='fest' || u.quelle==='fest'){ for(let a=0;a<t.n;a++) for(let b=0;b<u.n;b++) out[(off[q]+a)*k+off[r]+b]=0; return; }
    if(t.id.L!=null && u.id.L==null && u.id.E==null){ const W=holeW(karte.waende, t.id.L), B=W && W.band;
      if(B && B.quer && B.ab===u.id.ab && B.j===(u.id.j || 0)) for(let a=0;a<2;a++) for(let b=0;b<4;b++){ out[(off[q]+a)*k+off[r]+b]=B.quer[4*a+b]; out[(off[r]+b)*k+off[q]+a]=B.quer[4*a+b]; } } }));
  out.quelle=T.map(t=>t.quelle); out.voll=!out.some(Number.isNaN);
  return out;
};
// Querfehler (m) der Wand W an der Laengskoordinate s (F0, s = u·p; lokale Wand: im eigenen Rahmen) im Bezug des
// Abschnitts ab (letzter Knoten), aus der gemeinsamen Kovarianz von (phi, rho, G) (Kritik 35): Linie im Bezug
// n_B·p = rho - n·t, phi_B = phi - psi, d_quer = d rho_B - s_B·d phi_B, s_B = s - u·t. r (Abstand der Kamera) ist nicht
// noetig: der Gierhebel steckt in s_B. Reihenfolge der Quellen (aus.quelle, optional aus = {}):
//   'lokal'    lokale Wand im eigenen Abschnitt: g fest, exakt aus W.cov;
//   'faktor'   letzte Faktorisierung dieser Karte enthaelt Wand und G_j (Kern j = 0: G fest, A.fest j = 0: Plan fest): exakt;
//   'fest'     Kern bzw. A.fest (nur Plan fest, ty wirkt nicht quer) mit j = 0 ohne Faktorisierung: Querterm 0, exakt aus W.cov;
//   'band'     W.band fuer diesen Abschnitt (geschrieben von lmAusgleich; Kopie, structuredClone, KarteStand): exakt zum
//              Stand des letzten Ausgleichs; aus.knotenAlt, wenn seither ein Knoten angehaengt wurde;
//   'schranke' nur Diagonalbloecke (W.cov, A.cov/knoten.cov): sigma_W + sigma_G, nie zu schmal (Querterm unbekannt);
//   'fehlt'    NaN (keine gueltige Kovarianz der Wand oder des Abschnitts). Nie still 0.
G.fehlerband=(W, s, ab, r, karte, aus)=>{
  const A=holeA(karte, ab), j=letzterKnoten(A), setz=(q, v, alt)=>{ if(aus){ aus.quelle=q; aus.knotenAlt=!!alt; } return v; };
  const cw=W && W.cov, wand=c=>Math.sqrt(Math.max(0, c[2]-2*s*c[1]+s*s*c[0]));   // J_w = (-s, 1) bei t = 0
  if(W && W.rahmen>=0) return ab===W.rahmen && covGueltig(cw) ? setz('lokal', wand(cw)) : setz('fehlt', NaN);
  // A.fest (j = 0): Plan fest, ty frei; der Querfehler haengt nicht von ty ab (Jv[4] = 0), also exakt wie fest
  const C0=karte && CACHE.get(karte), Lz=C0 && C0.g && C0.g.letzte, fest=(festAb(karte, Lz, ab) || planAb(karte, Lz, ab)) && j===0;
  const kw=[kW(W.id, 'p'), kW(W.id, 'r')], kg=[0, 1, 2, 3].map(c=>kG(ab, j, c));
  const g=A ? (j ? G.gBei(A, Array.isArray(A.knoten) ? A.knoten[j].t : A.knoten.t[j]) : A.g) : null;
  const Jv=gg=>{ const nx=Math.cos(W.phi), nz=Math.sin(W.phi), ut=-nz*gg.tx+nx*gg.tz, sB=s-ut; return [-ut-sB, 1, sB, -nx, 0, -nz]; };
  if(Lz && kw.every(k=>Lz.idx.has(k)) && (fest || kg.every(k=>Lz.idx.has(k))) && (g || fest)){
    const C=G.covBlock(karte, [{L:W.id}, {ab, j}]), J=Jv(g || {psi:0, tx:0, ty:0, tz:0});
    let v=0; for(let a=0;a<6;a++) for(let b=0;b<6;b++) v+=J[a]*C[a*6+b]*J[b];
    if(Number.isFinite(v)) return setz('faktor', Math.sqrt(Math.max(0, v))); }
  const B=W && W.band;
  if(B && B.ab===ab && B.k && B.k.every(Number.isFinite)) return setz('band', Math.sqrt(Math.max(0, B.k[0]+2*B.k[1]*s+B.k[2]*s*s)), B.j<j);
  if(!covGueltig(cw)) return setz('fehlt', NaN);
  if(fest) return setz('fest', wand(cw));   // G fest: der Querterm ist 0, das Band exakt aus W.cov
  const cg=covG(A, j); if(!cg || !g || !cg.c.every(Number.isFinite)) return setz('fehlt', NaN);
  const J=Jv(g); let vw=J[0]*J[0]*cw[0]+2*J[0]*J[1]*cw[1]+J[1]*J[1]*cw[2], vg=0;
  for(let a=0;a<4;a++) for(let b=0;b<4;b++) vg+=J[2+a]*cg.c[a*4+b]*J[2+b];
  return setz('schranke', Math.sqrt(Math.max(0, vw))+Math.sqrt(Math.max(0, vg)), cg.alt);
};
