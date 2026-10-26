// ------------------------------------------------ Karte: Landmarken (M5)
// Waagerechte Kanten (Decke-Wand, Boden-Wand, Stoerer) und Senkrechte (Ecken) als Landmarken der Karte:
// Vorhersage, Zuordnung, Kandidatenspuren, Schluessel-Beob, Intervalle, Durchblick, Zusammenfuehren und
// Trennen, Hoehe und Hoehenklasse, Ecken, Atlas (Einbinden, Neu-Zuordnen). Vertrag: ARCHITEKTUR v3,
// Abschnitte 3.3 (Beob, Wand, Ecke, KarteZustand), 4 (Block M5), 14.1 (Eigentum), 17.4 (Bauauftrag).
// Die Datei steht wortgleich als eigener Block { ... } im geo-Block; sie setzt G, M0 (G.gBei, G.gAnw,
// G.gPlan, G.wandN, G.KG) und den geo-Kern (G.ray, G.project, G.projectSegment, G.ndcToPix) voraus,
// ruft sie nur zur Laufzeit und haengt nur an G. Kein DOM, keine Uhr, kein Zufall.
//
// Fehlermass (6, landmarken 3.4 (6)): Ebene durch die Kamera c, die die Linie {n·p = rho, y = h} enthaelt,
//   Rest je Segmentende r = f·asin(m·d), m Einheitsnormale der Ebene, d Einheitsstrahl des Endes. In
//   geschlossener Form: m ~ (D·n_x, sd, D·n_z) mit D = h - c_y und sd = n·c - rho (> 0: Kamera frei).
//   Dieselbe Formel wie G.resSegment (M6); M5 rechnet sie fuer Anpassungen mit eigener analytischer
//   Jacobi (rest/restJ), G.resSegment nur beim Neu-Zuordnen gespeicherter Beob (Selbsttest vergleicht).
// Rahmen: Waende mit rahmen = -1 liegen in F0 (Beob ueber G.gBei(abschnitt, t)), mit rahmen = ab im
//   Bezug B_ab (Einheit). Hoehen im Rahmen der Wand: h 'c' = karte.hC (global) bzw. hLok.hC (lokal),
//   'f' = Boden (karte.hF bzw. 0 im Bezug), Zahl = eigene Hoehe (Stoerer), 'lokal' = hLokal.h.
// Hauptpunkt (6.7): karte.pp = {cx, cy} px im Erkennungsbild im Sinn von NDC (+x rechts, +y oben);
//   gespeicherte Strahlen bleiben roh, korrigiert wird beim Rechnen (ppKorr), vorhergesagte Pixel
//   bekommen den Versatz dazu.
// Eigentum (14.1): M5 legt Beob an (L, schluessel, nSeg; w/chi2/mu nur Startwerte), Waende (anlegen,
//   zusammenfuehren, trennen, einbinden; iv, boden, durchblick, cls, clsZaehler, hFrei, dChiC, dChiF,
//   zustand, Buchhaltung) und Ecken (anlegen, top, nPeil, art, senk, frei, waende). phi/rho/cov/h und
//   Ecke.p/cov schreibt M5 nur beim Anlegen und beim Einbinden (Umrechnung nach F0), sonst nur M6.
//   Abschnitte liest M5 nur. Eigene Buchhaltung in karte.spuren = {v, wandId, eckId, offen (Spuren),
//   peil (offene Peilungen), zuord (Stand je Abschnitt bei der letzten Zuordnung), naechste (ausstehende Rohklasse der
//   Hysterese je Wand-id), aend (Aenderungszaehler der Zuordnung je Rahmen und 'alle')}.
// Nur KarteZustand entscheidet: Merklisten (WeakMap neben der Karte: Hoehen-Anpassung je Wand, Strahlen-Verzeichnis je
//   Rahmen und Durchblick je Wand) gelten nur bei elementweise gleichem Schluessel aus allem, woraus sie rechnen; ein Klon
//   (structuredClone) rechnet neu und bekommt dasselbe. o.voll (lmDurchblick, lmZusammenfuehren, lmEcken) bzw. o.immer
//   (lmHoehenklasse) rechnen ohne Merkliste und Vorfilter (Pruefung, test/karte-landmarken.mjs).
// Zusatzfeld Wand.ausEcken = [idA, idB]: kurze Wand aus zwei Ecken ohne Segment-Beob (siehe kurzwaende).
// Ergaenzt gegen 4 (fehlende Namen fuer Pflichten aus 17.4): G.lmBodenguete (Bodenguete q, 6.2) und
//   G.lmSchrankVerdacht (Erkennen deckenhoher Schraenke, 8.2; cls 'schrank' setzt erst der Nutzer).
// Festlegungen, die 3/4 offen lassen (P-C):
//   - Rueckgaben tragen Zusatzfelder: lmZuordnen paare {i, L, chi2, art, s}, lmVorhersage {.., unten, seite},
//     lmHoehe {.., phi, rho, n, s2}, lmEinbinden {neu, zusammen, ty0 = hC - hLok.hC}, lmNeuZuordnen {geaendert, verfallen}.
//   - lmNeuZuordnen(o.immer): auch ohne Aenderung von g alle Beob pruefen (M10 ruft das z. B. je 2 s); dabei verfallen
//     Waende < 3 Schluessel-Beob und Ecken < 4 Peilungen, die seit 5 s nichts bekommen haben.
//   - lmHoehenklasse schreibt cls, clsZaehler, hFrei = {h, lo, hi, n, lokal, rand}, dChiC, dChiF, zustand; Klasse 'lokal'
//     heisst cls 'wand' mit hFrei.lokal = true (h = 'lokal' setzt M6). Δχ² fuer 'wand' ist der Rand der Wanddeutung (siehe
//     dort). Hysterese auch ab 'kandidat' (2 gleiche Rohklassen in Folge); Rueckgabe auch 'unterzug' (8.3).
//   - Beob.i <= -2: Peilung aus bildErg.senk[-2 - i] (G.verticalEdges); -1 bleibt die Erfassung.

const D2R=Math.PI/180, ZWEIPI=2*Math.PI, EINS={psi:0, tx:0, ty:0, tz:0};
const wrap=a=>Math.atan2(Math.sin(a), Math.cos(a)), wrap2pi=a=>{ a%=ZWEIPI; return a<0 ? a+ZWEIPI : a; };
const einh=v=>{ const l=Math.hypot(v[0], v[1], v[2]); return l>0 ? [v[0]/l, v[1]/l, v[2]/l] : v; };
const drehen=(psi,d)=>{ const c=Math.cos(psi), s=Math.sin(psi); return [c*d[0]-s*d[2], d[1], s*d[0]+c*d[2]]; };
const median=a=>{ if(!a.length) return NaN; const s=[...a].sort((x,y)=>x-y), k=s.length>>1; return s.length%2 ? s[k] : (s[k-1]+s[k])/2; };

// ------------------------------------------------ Vorgaben
// Werte aus 4; Zusatzwerte [S] (Herkunft im Kommentar), alle ueber o zu ueberschreiben.
const DEF={
  zuordnen:{chi2:9.21, mehrdeutig:4, winkelMin:3, gapZu:0.5, seite:0.1, drhoMax:0.05, hTol:0.05},
  schluessel:{dP:0.10, dWinkelDeg:5, dS:0.05},
  // Spuren: Gates wie lm/messung.mjs (< 4°, < 6 px quer, > 50 % Ueberlapp); gehoben auf der erwarteten Hoehe,
  // sonst 3 m; lueckeK: hoechstens 2 fehlende Bilder; maxBilder/maxDauer: Spur ohne Befoerderung verwerfen [S].
  spuren:{minBilder:5, minDauer:0.5, minStuetze:0.10, minStuetzeEcke:0.05, winkelDeg:4, querPx:6, ueber:0.5, hebM:3, lueckeK:3,
          maxBilder:40, maxDauer:6, entschieden:0.10, dchi:4, eckeNah:0.15, versuche:[5, 7, 10, 14, 20, 28, 40]},
  hoehe:{h:[-0.3, 3.2], dh:0.01, maxBeob:120},
  // Durchblick: Haufen laengs s mit Luecke <= 0,15 m, Standpunkte >= 0,10 m auseinander, je Ziel-Landmarke
  // hoechstens 60 Schluessel-Beob (gleichmaessig), Kreuzung >= 5 cm vor Kamera und Ziel [S].
  durchblick:{minStrahlen:3, minStandpunkte:2, unterHoehe:0.05, anteilUnterzug:0.8, haufen:0.15, standAbst:0.10, maxBeob:60, nah:0.05, rand:0.6, unterzugMinL:0.5, minSchl:5},
  // zusammen: |Δrho| in der Mitte der gemeinsamen Huelle; χ² mit Modellboden (0,2°)² / (1 cm)² je Landmarke [S]: ohne ihn
  // blieben auf F4 rund zwei gleiche Landmarken M-N+Q-A (Δrho 3,4 cm, Δphi 0,4°) wegen winziger Kovarianzen getrennt.
  zusammen:{cosSeite:Math.cos(5*D2R), chi2:9.21, drhoMax:0.05, lueckeMax:0.5, hTol:0.05, covBoden:[Math.pow(0.2*D2R, 2), 0, 1e-4]},
  intervalle:{gap:0.05},
  // Hoehenklasse (6.5, 8.3, 8.4): Rand der Wanddeutung dChiC (siehe lmHoehenklasse), lokal ab 3 cm in >= 2
  // Abschnitten (loesen < 2 cm, hoechstens 0,5 m [S]); Vorhang: Paar <= 0,25 m, naehere nahe Decke (0,15 m [S]),
  // fernere <= 3 cm an h_c.
  // Schalter Z3 (ARCHITEKTUR 19.2): unterzug 'an'|'aus' (Durchsicht-Regel 8.3, auch fuer lmDurchblick.unterzug), wandTol 0|m:
  // zusaetzlich 'wand', wenn die Hoehe entschieden ist, |h - hR| <= wandTol und basis >= basis (0,3 m). Vorgabe 'an' / 0 bis
  // R1 sie auf S0 misst (Messung rep/r1).
  klasse:{basis:0.3, halb:0.05, dchiSetzen:4, dchiLoesen:2, basisLoesen:0.2, runden:2, dchiStoer:9, lokalSetzen:0.03, lokalLoesen:0.02, lokalMax:0.5,
          lokalAb:2, lokalMinBeob:8, vorhangAbst:0.25, vorhangMin:0.02, vorhangDecke:0.15, vorhangWand:0.03, maxBeob:120, unterzug:'an', wandTol:0},
  // Ecken: Peilfehler 1,5 px/f, offene Peilungen hoechstens 150 je Sitzung und 10 s alt, Bogen >= 2° zwischen
  // zwei Peilungen, Haufen max(5 cm, 3σ·Abstand), Wand an der Ecke <= 10 cm quer und <= 0,3 m vom Ende [S].
  // Neue Ecke erst aus >= 4 Peilungen von >= 3 Standpunkten, Bogen >= 5° von der Ecke aus gesehen, obere Enden der
  // Senkrechten <= 10 cm gestreut (F4 rund ohne diese Bedingungen: 53 Ecken, 19 davon <= 2 cm an einer wahren) [S].
  ecken:{minPx:20, basis:0.2, winkel:30, sigPx:1.5, maxPeil:60, maxAlter:10, minWinkelDeg:2, haufen:0.05, waendeTol:0.10, endeTol:0.30,
         minAbst:0.3, dWinkelDeg:5, dP:0.10, minPeilNeu:4, minStand:3, minBogenDeg:5, topSpanne:0.10, folgeDeg:2.5, folge2Deg:1.0, lueckeK:3, maxSpur:60, maxSigma:0.03, spurPaar:0.15, topSpannePaar:0.05,
         topPaar:0.05, kurzMin:0.05, kurzMax:0.30, kurzWinkel:60},
  // neu: o.immer prueft alle Beob ohne Aenderung von g; dabei verfallen Waende mit < 3 Schluessel-Beob und Ecken mit
  // < 4 Peilungen, die seit 5 s nichts bekommen haben (landmarken 3.4 (7): 'unter 3 Beob zurueck zum Kandidaten') [S].
  neu:{dP:0.02, dPsiDeg:0.3, immer:false, verfall:5, minSchl:3, minPeil:4},
  schrank:{topTol:0.05, endeTol:0.15, sockel:[0.03, 0.10], dahinter:[0.3, 1.0]},
  boden:{bMax:0.6, minBeob:3},
  standpunkt:0.25,
};

// ------------------------------------------------ Zustand, Rahmen, Hoehen
const zustand=K=>{
  if(!K.beob) K.beob=[]; if(!K.waende) K.waende=new Map(); if(!K.ecken) K.ecken=new Map(); if(!K.bilder) K.bilder=new Map();
  if(!K.abschnitte) K.abschnitte=[];
  if(!K.spuren || K.spuren.v!==1) K.spuren={v:1, wandId:0, eckId:0, offen:[], peil:[], zuord:{}, naechste:{}};
  if(!K.spuren.naechste) K.spuren.naechste={};
  return K.spuren; };
// ausstehende Rohklasse der Hysterese (6.5) je Wand-id; geht mit der Wand (Klon, Serialisierung), nicht neben ihr
const naechsteWeg=(K,id)=>{ const st=zustand(K); delete st.naechste[id]; };
// Aenderungszaehler der Zuordnung je Rahmen (spuren.aend[r]) und fuer alle (spuren.aend.alle): jede Aenderung von W.beob,
// W.rahmen, Beob.L/schluessel/art durch M5 zaehlt (14.1: nur M5 schreibt sie). Gilt fuer das Strahlen-Verzeichnis von
// lmDurchblick als Stand der Beob eines Rahmens.
const aend=(K,r)=>{ const st=zustand(K); if(!st.aend || typeof st.aend!=='object') st.aend={alle:0}; const k=r==null ? 'alle' : String(r); st.aend[k]=(st.aend[k]||0)+1; };
const aendStand=(K,r)=>{ const a=zustand(K).aend; return a && typeof a==='object' ? [a.alle||0, a[String(r)]||0] : [0, 0]; };
const neueId=(K,art)=>{ const st=zustand(K), M=art==='w' ? K.waende : K.ecken, k=art==='w' ? 'wandId' : 'eckId'; let id=st[k];
  while(M.has(id)) id++; st[k]=id+1; return id; };
const abVon=(K,bild,o)=>{ if(o && Number.isFinite(o.ab)) return o.ab; const B=K.bilder && K.bilder.get(bild.k);
  if(B && Number.isFinite(B.ab)) return B.ab; if(G.sectionOf && K.schnitte) return G.sectionOf(K.schnitte, bild.t, bild.ep); return 0; };
// Rahmen, in dem ein Abschnitt seine Landmarken fuehrt (Atlas 3.3): lokal/lose oder ohne g -> eigener Bezug.
const rahmenVon=(K,ab)=>{ const A=K.abschnitte[ab]; return !A || !A.g || A.stufe==='lokal' || A.stufe==='lose' ? ab : -1; };
// Abbildung B_ab -> Rahmen r (F0 ueber G.gBei, lokal Einheit) oder null.
const gZu=(K,r,ab,t)=>{ if(r===ab) return EINS; if(r!==-1) return null; const A=K.abschnitte[ab]; return A ? G.gBei(A, t) : null; };
const hRefC=(K,r)=>{ if(r===-1) return Number.isFinite(K.hC) ? K.hC : null; const A=K.abschnitte[r]; return A && A.hLok && Number.isFinite(A.hLok.hC) ? A.hLok.hC : null; };
const hRefF=(K,r)=>r===-1 && Number.isFinite(K.hF) ? K.hF : 0;
const hSchaetz=K=>K.H && Number.isFinite(K.H.laser) ? K.H.laser : 2.4;     // nur zum Heben und als Startwert [S]
const istStoer=W=>typeof W.h==='number';
const hOben=(W,K)=>{ if(typeof W.h==='number') return W.h; if(W.h==='lokal' && W.hLokal && Number.isFinite(W.hLokal.h)) return W.hLokal.h;
  const r=hRefC(K, W.rahmen); return r!=null ? r : W.hFrei && Number.isFinite(W.hFrei.h) ? W.hFrei.h : hSchaetz(K); };
// Hoehe, auf der eine Beob ihre Wand sieht (Rahmen der Wand)
const hBeob=(b,W,K)=>b.art==='boden' ? hRefF(K, W.rahmen) : hOben(W, K);
const kantenVon=(W,K)=>istStoer(W) ? [{art:'stoer', h:W.h}] : [{art:'decke', h:hOben(W, K)}, {art:'boden', h:hRefF(K, W.rahmen)}];

// ------------------------------------------------ Strahlen, Hauptpunkt
// Hauptpunkt: beobachtet = nominal projiziert + pp, also wahrer Strahl = nominaler Strahl des Pixels - pp.
const ppKorr=(d,cT,f,pp)=>{ const zz=d[0]*cT[8]+d[1]*cT[9]+d[2]*cT[10]; if(!(zz<-1e-9)) return d;
  const a=(d[0]*cT[0]+d[1]*cT[1]+d[2]*cT[2])/-zz-pp.cx/f, b=(d[0]*cT[4]+d[1]*cT[5]+d[2]*cT[6])/-zz-pp.cy/f;
  return einh([a*cT[0]+b*cT[4]-cT[8], a*cT[1]+b*cT[5]-cT[9], a*cT[2]+b*cT[6]-cT[10]]); };
const ppAn=K=>K.pp && (K.pp.cx || K.pp.cy) ? K.pp : null;
// Strahlen einer Beob im Rahmen g (B_ab -> Rahmen), pp-korrigiert
const strahlen=(K,b,g)=>{ let da=b.da, db=b.db; const pp=ppAn(K);
  if(pp){ const B=K.bilder.get(b.k); if(B && B.camTo){ da=ppKorr(da, B.camTo, b.f, pp); if(db) db=ppKorr(db, B.camTo, b.f, pp); } }
  if(g===EINS || !g.psi && !g.tx && !g.ty && !g.tz) return {c:b.c, da, db};
  return {c:G.gAnw(g, b.c), da:drehen(g.psi, da), db:db && drehen(g.psi, db)}; };
// Strahlen eines Segments aus dem BildErgebnis (Bezug des Bilds), pp-korrigiert
const segStrahlen=(bild,i,pp)=>{ const D=bild.dir; let a=[D[6*i], D[6*i+1], D[6*i+2]], b=[D[6*i+3], D[6*i+4], D[6*i+5]];
  if(pp){ a=ppKorr(a, bild.camTo, bild.f, pp); b=ppKorr(b, bild.camTo, bild.f, pp); } return [a, b]; };

// ------------------------------------------------ Fehlermass und Anpassung
const rest=(c,d,nx,nz,rho,h,f)=>{ const D=h-c[1], sd=nx*c[0]+nz*c[2]-rho, N=Math.hypot(D, sd), s=(D*(nx*d[0]+nz*d[2])+sd*d[1])/N;
  return f*Math.asin(s>1 ? 1 : s<-1 ? -1 : s); };
// Rest und Ableitungen nach (phi, rho, h): dn/dphi = u, d sd/dphi = u·c, d sd/drho = -1, dD/dh = 1.
const restJ=(c,d,nx,nz,rho,h,f,J)=>{ const D=h-c[1], uc=-nz*c[0]+nx*c[2], sd=nx*c[0]+nz*c[2]-rho, N=Math.hypot(D, sd),
  a=nx*d[0]+nz*d[2], e=-nz*d[0]+nx*d[2], b=d[1], s=(D*a+sd*b)/N, k=f/Math.sqrt(Math.max(1e-12, 1-s*s))/N;
  J[0]=k*(D*e+uc*b-s*sd*uc/N); J[1]=k*(-b+s*sd/N); J[2]=k*(a-s*D/N);
  return f*Math.asin(s>1 ? 1 : s<-1 ? -1 : s); };
// R: [{c, d1, d2, w, sig, f}] im Rahmen der Linie; x = [phi, rho, h]
const kosten=(R,x)=>{ const nx=Math.cos(x[0]), nz=Math.sin(x[0]); let c=0;
  for(const z of R){ const a=rest(z.c, z.d1, nx, nz, x[1], x[2], z.f), b=rest(z.c, z.d2, nx, nz, x[1], x[2], z.f); c+=z.w/(z.sig*z.sig)*(a*a+b*b); }
  return c; };
const normal=(R,x,np)=>{ const N=new Float64Array(9), g=new Float64Array(3), J=[0,0,0], nx=Math.cos(x[0]), nz=Math.sin(x[0]);
  for(const z of R){ const q=z.w/(z.sig*z.sig);
    for(const d of [z.d1, z.d2]){ const r=restJ(z.c, d, nx, nz, x[1], x[2], z.f, J);
      for(let a=0;a<np;a++){ g[a]+=q*J[a]*r; for(let b=0;b<np;b++) N[3*a+b]+=q*J[a]*J[b]; } } }
  return {N, g}; };
const loese=(M,b,n)=>{ const A=[...M], x=[...b];
  for(let i=0;i<n;i++){ let p=i; for(let k=i+1;k<n;k++) if(Math.abs(A[3*k+i])>Math.abs(A[3*p+i])) p=k;
    if(!(Math.abs(A[3*p+i])>1e-300)) return null;
    if(p!==i){ for(let k=0;k<n;k++){ const t=A[3*i+k]; A[3*i+k]=A[3*p+k]; A[3*p+k]=t; } const t=x[i]; x[i]=x[p]; x[p]=t; }
    for(let k=i+1;k<n;k++){ const f=A[3*k+i]/A[3*i+i]; for(let j=i;j<n;j++) A[3*k+j]-=f*A[3*i+j]; x[k]-=f*x[i]; } }
  for(let i=n-1;i>=0;i--){ let s=x[i]; for(let j=i+1;j<n;j++) s-=A[3*i+j]*x[j]; x[i]=s/A[3*i+i]; }
  return x; };
// Levenberg-Marquardt ueber (phi, rho) bzw. (phi, rho, h); h in [hMin, hMax] gehalten.
const passe=(R,x0,frei,o={})=>{ const np=frei ? 3 : 2, it=o.iter||12, hMin=o.hMin ?? -Infinity, hMax=o.hMax ?? Infinity;
  let x=[x0[0], x0[1], x0[2]], c=kosten(R, x), lam=1e-4;
  for(let k=0;k<it;k++){ const {N, g}=normal(R, x, np); let besser=false;
    for(let t=0;t<8;t++){ const M=Float64Array.from(N); for(let a=0;a<np;a++) M[4*a]+=lam*Math.max(N[4*a], 1e-12);
      const dx=loese(M, [-g[0], -g[1], -g[2]], np); if(!dx){ lam*=10; continue; }
      const y=[x[0]+dx[0], x[1]+dx[1], frei ? Math.min(hMax, Math.max(hMin, x[2]+dx[2])) : x[2]], c2=kosten(R, y);
      if(c2<=c){ const sch=Math.abs(dx[0])+Math.abs(dx[1])+(frei ? Math.abs(dx[2]) : 0); x=y; c=c2; lam=Math.max(lam/10, 1e-9); besser=true; if(sch<1e-10) k=it; break; }
      lam*=10; }
    if(!besser) break; }
  return {x, c}; };
// Hoehe einer Linie aus vielen Sichten (lm/hoehe.mjs): (phi, rho, h) frei, dann Profil ueber h
// (phi, rho je h nachgefuehrt) bis Kosten <= Minimum + s2 (s2 = Varianzfaktor >= 1, also Δχ² <= 1 in σ).
const hoeheIntern=(R,x0,o)=>{ if(R.length<2) return null; const hMin=o.hMin, hMax=o.hMax, dh=o.dh||0.01; if(!(hMax>hMin)) return null;
  const L=passe(R, [x0[0], x0[1], Math.min(hMax, Math.max(hMin, x0[2]))], true, {hMin, hMax, iter:20}), x=L.x, c0=L.c;
  const dof=Math.max(1, 2*R.length-3), s2=Math.max(1, c0/dof), memo=new Map();
  const prof=h=>{ h=Math.min(hMax, Math.max(hMin, h)); let v=memo.get(h); if(v==null){ v=passe(R, [x[0], x[1], h], false, {iter:8}).c; memo.set(h, v); } return v; };
  const grenze=dir=>{ let a=x[2], b=null, st=0.02;
    for(let i=0;i<12;i++){ const h=x[2]+dir*st; if(dir>0 ? h>=hMax : h<=hMin){ const hb=dir>0 ? hMax : hMin; if(prof(hb)-c0<=s2) return hb; b=hb; break; }
      if(prof(h)-c0>s2){ b=h; break; } a=h; st*=2; }
    if(b==null) return a;
    for(let i=0;i<20 && Math.abs(b-a)>dh/2;i++){ const m=(a+b)/2; if(prof(m)-c0>s2) b=m; else a=m; }
    return a; };
  const lo=grenze(-1), hi=grenze(1); let q=0; const nx=Math.cos(x[0]), nz=Math.sin(x[0]);
  for(const z of R){ const a=rest(z.c, z.d1, nx, nz, x[1], x[2], z.f), b=rest(z.c, z.d2, nx, nz, x[1], x[2], z.f); q+=a*a+b*b; }
  return {h:x[2], lo, hi, rand:x[2]-hMin<dh || hMax-x[2]<dh, phi:wrap2pi(x[0]), rho:x[1], c0, s2, n:R.length, rms:Math.sqrt(q/(2*R.length)), prof}; };
// Startlinie aus Strahlpaaren: Richtung aus den Ebenen (doppelter Winkel, laengengewichtet), rho auf Hoehe h0,
// Normale zur Seite der Kameras.
const startLinie=(R,h0)=>{ let C=0, S=0;
  for(const z of R){ const nn=einh([z.d1[1]*z.d2[2]-z.d1[2]*z.d2[1], z.d1[2]*z.d2[0]-z.d1[0]*z.d2[2], z.d1[0]*z.d2[1]-z.d1[1]*z.d2[0]]), a=Math.atan2(-nn[0], nn[2]), w=z.w*(z.len||1);
    C+=w*Math.cos(2*a); S+=w*Math.sin(2*a); }
  let phi=Math.atan2(S, C)/2-Math.PI/2; const nx=Math.cos(phi), nz=Math.sin(phi), P=[];
  for(const z of R) for(const d of [z.d1, z.d2]){ let t=Math.abs(d[1])>1e-6 ? (h0-z.c[1])/d[1] : -1; if(!(t>0.2 && t<30)) t=3; P.push(nx*(z.c[0]+t*d[0])+nz*(z.c[2]+t*d[2])); }
  if(!P.length) return null; let rho=median(P), sd=0; for(const z of R) sd+=nx*z.c[0]+nz*z.c[2]-rho;
  if(sd<0){ phi+=Math.PI; rho=-rho; }
  return [wrap2pi(phi), rho, h0]; };
// Beob -> Strahlen im Rahmen r (gleichmaessig ausgeduennt auf hoechstens max)
const strahlenListe=(K,B,r,max)=>{ const out=[], n=B.length, m=max && n>max ? max : n;
  for(let j=0;j<m;j++){ const b=B[m<n ? Math.floor(j*n/m) : j]; if(!b.db) continue; const g=gZu(K, r, b.ab, b.t); if(!g) continue;
    const Z=strahlen(K, b, g); out.push({c:Z.c, d1:Z.da, d2:Z.db, w:1, sig:b.sPx||1, f:b.f, len:b.len, b}); }
  return out; };
const obenR=R=>{ let o=0; for(const z of R) o+=z.d1[1]+z.d2[1]>0 ? 1 : -1; return o>=0; };
const hGrenzen=(R,o)=>{ const cy=R.map(z=>z.c[1]); return obenR(R) ? [Math.max(o.h[0], Math.max(...cy)+0.05), o.h[1]] : [o.h[0], Math.min(o.h[1], Math.min(...cy)-0.05)]; };

// ------------------------------------------------ Waende: Lage, Heben, Buchhaltung
// Seite der Kamera und Laengskoordinaten der beiden Enden auf der senkrechten Wandebene (null: hinter der Kamera)
const hebeAuf=(c,d,nx,nz,rho)=>{ const nd=nx*d[0]+nz*d[2]; if(!(nd<-1e-6)) return null; const l=-(nx*c[0]+nz*c[2]-rho)/nd; if(!(l>0)) return null;
  return -nz*(c[0]+l*d[0])+nx*(c[2]+l*d[2]); };
const hebeS=(K,W,b)=>{ if(!b.db) return null; const g=gZu(K, W.rahmen, b.ab, b.t); if(!g) return null; const Z=strahlen(K, b, g), nx=Math.cos(W.phi), nz=Math.sin(W.phi);
  // rep/erf: Erfassung (nutzer) auf ihrer Hoehe heben und laengs projizieren: der Schnitt mit der senkrechten Wandebene laeuft
  // bei fast parallelem Strahl beliebig weit (gemessen A7 beide Orakel: Intervall einer Erfassungswand 722 m, Speicher 8 GB)
  if(b.nutzer){ const h=hBeob(b, W, K), lz=d=>{ const D=h-Z.c[1]; if(!(d[1]>1e-3) || !(D>0)) return null; const t=D/d[1]; return -nz*(Z.c[0]+t*d[0])+nx*(Z.c[2]+t*d[2]); };
    const a=lz(Z.da), e=lz(Z.db); return a==null || e==null ? null : [Math.min(a, e), Math.max(a, e)]; }
  const a=hebeAuf(Z.c, Z.da, nx, nz, W.rho), e=hebeAuf(Z.c, Z.db, nx, nz, W.rho); return a==null || e==null ? null : [Math.min(a, e), Math.max(a, e)]; };
const camIn=(K,W,b)=>{ const g=gZu(K, W.rahmen, b.ab, b.t); return g ? (g===EINS ? b.c : G.gAnw(g, b.c)) : null; };
// Zahl der Standpunkte (gierig, >= abst auseinander); mit max endet die Zaehlung dort (Vergleich '>= max' bleibt gleich)
const standpunkte=(P,abst,max=Infinity)=>{ const rep=[]; for(const p of P) if(!rep.some(q=>Math.hypot(q[0]-p[0], q[1]-p[1])<abst)){ rep.push(p); if(rep.length>=max) break; } return rep.length; };
const ivHuelle=W=>{ const L=(W.iv && W.iv.length ? W.iv : W.boden) || []; if(!L.length) return null;
  let a=Infinity, b=-Infinity; for(const x of L){ a=Math.min(a, x.s0); b=Math.max(b, x.s1); } return [a, b]; };
const ivListe=W=>[...(W.iv||[]), ...(W.boden||[])].map(x=>[x.s0, x.s1]).sort((a,b)=>a[0]-b[0]);
// Kennzahlen aus W.beob neu: nBilder, nSchluessel, abschnitte, nStandpunkte, basis (quer zur Linie, Oberkante)
const statistik=(K,W)=>{ const ks=new Set(), ab=new Set(), P=[], Q=[]; let nS=0; const nx=Math.cos(W.phi), nz=Math.sin(W.phi);
  for(const id of W.beob){ const b=K.beob[id]; ks.add(b.k); ab.add(b.ab); if(!b.schluessel) continue; nS++; const c=camIn(K, W, b); if(!c) continue;
    P.push([c[0], c[2]]); if(b.art!=='boden') Q.push(nx*c[0]+nz*c[2]); }
  if(!Q.length) for(const p of P) Q.push(nx*p[0]+nz*p[1]);
  W.nBilder=ks.size; W.nSchluessel=nS; W.abschnitte=[...ab].sort((a,b)=>a-b); W.nStandpunkte=standpunkte(P, DEF.standpunkt);
  W.basis=Q.length ? Math.max(...Q)-Math.min(...Q) : 0; };
// neue Beob an W haengen: Zaehler und Intervalle fortschreiben (voll neu in lmIntervalle)
const buchen=(K,W,b)=>{ const vor=W.beob.length>1 ? K.beob[W.beob[W.beob.length-2]] : null; aend(K, W.rahmen);
  if(!vor || vor.k!==b.k) W.nBilder++; if(b.schluessel) W.nSchluessel++; if(!W.abschnitte.includes(b.ab)) W.abschnitte=[...W.abschnitte, b.ab].sort((x,y)=>x-y);
  if(!b.schluessel) return; const s=hebeS(K, W, b); if(!s) return; const L=b.art==='boden' ? (W.boden=W.boden||[]) : W.iv;
  let x=L.find(v=>s[0]<=v.s1+DEF.intervalle.gap && s[1]>=v.s0-DEF.intervalle.gap);
  if(x){ x.s0=Math.min(x.s0, s[0]); x.s1=Math.max(x.s1, s[1]); x.n++; if(x.t1!=null) x.t1=Math.max(x.t1, b.t); }
  else L.push(b.art==='boden' ? {s0:s[0], s1:s[1], n:1} : {s0:s[0], s1:s[1], n:1, bilder:1, t0:b.t, t1:b.t, beidseits:false, ring:-1});
  L.sort((p,q)=>p.s0-q.s0); };
const wandNeu=(K,o)=>{ const id=neueId(K, 'w'); naechsteWeg(K, id);
  return {id, rahmen:o.rahmen, phi:o.phi, rho:o.rho, cov:o.cov || null, h:o.h, hLokal:null,
  cls:'kandidat', clsZaehler:0, hFrei:o.hFrei || null, dChiC:NaN, dChiF:NaN, beob:[], nBilder:0, nSchluessel:0, nStandpunkte:0, basis:0, abschnitte:[],
  iv:[], durchblick:[], boden:[], ecken:[], sSchwer:0, zustand:'kandidat', teile:[], ringe:[], insel:'nein', inselRunden:0}; };
const beobNeu=(K,o)=>{ const b={id:K.beob.length, k:o.k, t:o.t, ab:o.ab, ep:o.ep, i:o.i, art:o.art, L:o.L, c:[o.c[0], o.c[1], o.c[2]],
  da:[o.da[0], o.da[1], o.da[2]], db:o.db ? [o.db[0], o.db[1], o.db[2]] : null, sPx:o.sPx, f:o.f, len:o.len, nSeg:o.nSeg || 1,
  schluessel:false, nutzer:false, w:1, chi2:0, mu:16}; K.beob.push(b); return b; };
const artFuer=(W,unten)=>istStoer(W) ? 'stoer' : unten ? 'boden' : 'decke';

// ------------------------------------------------ Vorhersage (4, M5)
// Linie der Wand im Bezug B_ab: phi_B = phi - psi, rho_B = rho - n·t, s_B = s - u·t, Hoehen - ty.
const linieB=(W,g,K)=>{ const n=G.wandN(W.phi), u=G.wandU(W.phi), phi=W.phi-g.psi;
  return {phi, nx:Math.cos(phi), nz:Math.sin(phi), rho:W.rho-(n[0]*g.tx+n[1]*g.tz), ds:u[0]*g.tx+u[1]*g.tz,
    hO:hOben(W, K)-g.ty, hU:hRefF(K, W.rahmen)-g.ty}; };
// Band der Vorhersage (px) aus Wandkovarianz, Abschnittssigma und Hoehe, ueber die Ableitungen des Winkelrests:
// dr/drho = f·D/D3², dr/dh = f·sd/D3² [S]. s laengs der Wand im Rahmen der Wand.
const bandPx=(K,W,A,s,sd,D,f,decke)=>{ const D3=sd*sd+D*D; let lat=0;
  if(W.cov) lat=Math.max(0, s*s*W.cov[0]-2*s*W.cov[1]+W.cov[2]);
  if(W.rahmen===-1 && A && A.sig && Number.isFinite(A.sig.max)) lat+=A.sig.max*A.sig.max+D3*(A.sig.psi||0)*(A.sig.psi||0);
  let sh=0; if(decke && !istStoer(W)) sh=W.rahmen===-1 ? (K.sHC||0) : (A && A.hLok ? A.hLok.sHC||0 : 0);
  return f*Math.sqrt(lat*D*D+sh*sh*sd*sd)/D3; };
const klipp=(a,b)=>{ let u0=0, u1=1; const dx=b[0]-a[0], dy=b[1]-a[1];
  for(const [p,q] of [[-dx, a[0]+1], [dx, 1-a[0]], [-dy, a[1]+1], [dy, 1-a[1]]]){ if(p===0){ if(q<0) return null; continue; } const r=q/p;
    if(p<0){ if(r>u1) return null; if(r>u0) u0=r; } else { if(r<u0) return null; if(r<u1) u1=r; } }
  return [[a[0]+u0*dx, a[1]+u0*dy], [a[0]+u1*dx, a[1]+u1*dy]]; };
const pixStrecke=(kam,K,P1,P2)=>{ const s=G.projectSegment(kam.proj, kam.camTo, P1, P2, 0.05); if(!s) return null; const c=klipp(s[0], s[1]); if(!c) return null;
  const pp=ppAn(K), dx=pp ? 2*pp.cx/kam.w : 0, dy=pp ? 2*pp.cy/kam.h : 0;
  return c.map(p=>G.ndcToPix(p[0]+dx, p[1]+dy, kam.w, kam.h, kam.flipY)); };
G.lmVorhersage=(W,kam,karte,g)=>{
  const K=karte, A=K.abschnitte && K.abschnitte[kam.ab], aus={A:null, B:null, sigPx:Infinity, sichtbar:false, iv:[], unten:null, seite:NaN};
  const gg=W.rahmen===-1 ? (g || (A ? G.gBei(A, kam.t) : null)) : W.rahmen===kam.ab ? EINS : null; if(!gg) return aus;
  const L=linieB(W, gg, K), c=[kam.camTo[12], kam.camTo[13], kam.camTo[14]], sd=L.nx*c[0]+L.nz*c[2]-L.rho; aus.seite=sd;
  if(!(sd>DEF.zuordnen.seite)) return aus;
  const ux=-L.nz, uz=L.nx, sc=ux*c[0]+uz*c[2], f=kam.f || G.fokusPx(kam.proj, kam.h), P=(s,h)=>[L.rho*L.nx+s*ux, h, L.rho*L.nz+s*uz];
  const kante=h=>{ const p=pixStrecke(kam, K, P(sc-50, h), P(sc+50, h)); if(!p) return null; const D=h-c[1];
    return {A:p[0], B:p[1], sigPx:bandPx(K, W, A, sc+L.ds, sd, D, f, h===L.hO), iv:ivListe(W).map(([s0,s1])=>pixStrecke(kam, K, P(s0-L.ds, h), P(s1-L.ds, h))).filter(Boolean)}; };
  const o=istStoer(W) ? null : kante(L.hU), t=kante(L.hO);
  if(!t) return {...aus, unten:o};
  return {A:t.A, B:t.B, sigPx:t.sigPx, sichtbar:true, iv:t.iv, unten:o, seite:sd}; };

// ------------------------------------------------ Zuordnung
// Vorbereitete Waende eines Rahmens: Normale, Kanten (Hoehe), Intervalle und Durchblick laengs s.
const bereit=(K,W)=>({W, nx:Math.cos(W.phi), nz:Math.sin(W.phi), rho:W.rho, kanten:kantenVon(W, K), iv:ivListe(W), durch:W.durchblick||[]});
const bereitAlle=(K,r)=>{ const P=[]; for(const W of K.waende.values()) if(W.rahmen===r) P.push(bereit(K, W)); return P; };
// Luecke zwischen dem gehobenen Stueck [a, b] und den Intervallen: Abstand und Durchblick dazwischen
const luecke=(P,a,b)=>{ if(!P.iv.length) return {d:0, frei:true}; let best=Infinity, ziel=null;
  for(const v of P.iv){ const d=b<v[0] ? v[0]-b : a>v[1] ? a-v[1] : 0; if(d<best){ best=d; ziel=v; } }
  if(best===0) return {d:0, frei:true};
  const g0=b<ziel[0] ? b : ziel[1], g1=b<ziel[0] ? ziel[0] : a;
  return {d:best, frei:!P.durch.some(([x0,x1])=>x1>g0+0.02 && x0<g1-0.02)}; };
// Hoehenklasse fuer Vergleiche: volle Wand (c, f, lokal) oder eigene Hoehe
const hVertraeglich=(Wa,Wb,tol)=>istStoer(Wa)===istStoer(Wb) && (!istStoer(Wa) || Math.abs(Wa.h-Wb.h)<=tol);
// Querabstand der Linie Wb von Wa an der Stelle s von Wa
const quer=(Wa,Wb,s)=>{ const na=G.wandN(Wa.phi), ua=G.wandU(Wa.phi), nb=G.wandN(Wb.phi), p=[Wa.rho*na[0]+s*ua[0], Wa.rho*na[1]+s*ua[1]];
  return nb[0]*p[0]+nb[1]*p[1]-Wb.rho; };
const verwandt=(Wa,Wb,s,o)=>Wa.rahmen===Wb.rahmen && Math.cos(Wa.phi-Wb.phi)>=Math.cos(5*D2R) && Math.abs(quer(Wa, Wb, s))<=o.drhoMax && hVertraeglich(Wa, Wb, o.hTol);
// Kandidaten einer Strahlbeobachtung z = {c, d1, d2, sPx, len, f} (Rahmen der Waende) gegen P
const kandidaten=(K,z,P,o,A)=>{ const out=[], up=z.d1[1]>0 && z.d2[1]>0, dn=z.d1[1]<0 && z.d2[1]<0; if(!up && !dn) return out;
  const c=z.c, wtol=Math.max(z.len*Math.tan(o.winkelMin*D2R), 3*Math.SQRT2*z.sPx);
  for(const p of P){ const sd=p.nx*c[0]+p.nz*c[2]-p.rho; if(!(sd>o.seite)) continue;
    const n1=p.nx*z.d1[0]+p.nz*z.d1[2], n2=p.nx*z.d2[0]+p.nz*z.d2[2]; if(!(n1<-1e-6 && n2<-1e-6)) continue;
    const ux=-p.nz, uz=p.nx, l1=-sd/n1, l2=-sd/n2, s1=ux*(c[0]+l1*z.d1[0])+uz*(c[2]+l1*z.d1[2]), s2=ux*(c[0]+l2*z.d2[0])+uz*(c[2]+l2*z.d2[2]);
    // Luecke zu den Intervallen zuerst: sie haengt nicht an der Kante, und wer sie nicht besteht, liefert keinen Kandidaten
    const a=Math.min(s1, s2), b=Math.max(s1, s2), lu=luecke(p, a, b); if(lu.d>o.gapZu || !lu.frei) continue;
    for(const e of p.kanten){ const D=e.h-c[1]; if(up ? !(D>0.02) : !(D<-0.02)) continue;
      const r1=rest(c, z.d1, p.nx, p.nz, p.rho, e.h, z.f), r2=rest(c, z.d2, p.nx, p.nz, p.rho, e.h, z.f); if(Math.abs(r1-r2)>wtol) continue;
      const sp=bandPx(K, p.W, A, (a+b)/2, sd, D, z.f, e.art==='decke'), chi2=(r1*r1+r2*r2)/(z.sPx*z.sPx+sp*sp); if(!(chi2<o.chi2)) continue;
      out.push({p, L:p.W.id, chi2, art:e.art, s:[a, b], r:[r1, r2], sp}); } }
  return out; };
const entscheide=(cand,o)=>{ if(!cand.length) return null; cand.sort((x,y)=>x.chi2-y.chi2 || x.L-y.L);
  const b=cand[0], z=cand.find(x=>x.L!==b.L); if(!z || z.chi2-b.chi2>=o.mehrdeutig) return b;
  return verwandt(b.p.W, z.p.W, (b.s[0]+b.s[1])/2, o) ? b : {mehrdeutig:true, L:b.L}; };
G.lmZuordnen=(bildErg,karte,o={})=>{ o={...DEF.zuordnen, ...o}; const K=karte, bild=bildErg; zustand(K);
  const ab=abVon(K, bild, o), A=K.abschnitte[ab], r=rahmenVon(K, ab), g=r===-1 ? G.gBei(A, bild.t) : EINS, paare=[], neu=[], mehrdeutig=[];
  const KL=G.KG.KL, S=G.KG.SEG, pp=ppAn(K);
  if(!g){ for(let i=0;i<bild.n;i++) if(bild.cls[i]===KL.O || bild.cls[i]===KL.U) neu.push(i); return {paare, neu, mehrdeutig}; }
  const P=bereitAlle(K, r), c0=[bild.camTo[12], bild.camTo[13], bild.camTo[14]], c=g===EINS ? c0 : G.gAnw(g, c0);
  for(let i=0;i<bild.n;i++){ const k=bild.cls[i]; if(k!==KL.O && k!==KL.U) continue;
    let [d1, d2]=segStrahlen(bild, i, pp); if(g!==EINS){ d1=drehen(g.psi, d1); d2=drehen(g.psi, d2); }
    const e=entscheide(kandidaten(K, {c, d1, d2, sPx:Math.max(1, bild.seg[i*S+5]||1), len:bild.seg[i*S+9], f:bild.f}, P, o, A), o);
    if(!e) neu.push(i); else if(e.mehrdeutig) mehrdeutig.push(i); else paare.push({i, L:e.L, chi2:e.chi2, art:e.art, s:e.s}); }
  return {paare, neu, mehrdeutig}; };

// ------------------------------------------------ Zusammenfassen je (Bild, Landmarke) und Aufnehmen (5.3)
// Kollinear im Bild (<= 1,5°, <= 1,5 px) und laengs der Wand ohne Luecke (gehoben <= intervalle.gap): eine Beob mit
// den aeussersten Enden, nSeg, sPx aus der Anpassung. Ohne die Lueckenbedingung ueberspannte eine Beob die
// 0,31-m-Luecke M-N~Q-A (F4 rund: 3 Beob, gemessen) und loeschte die Luecke aus den Intervallen.
const kollinear=(bild,ps)=>{ const S=G.KG.SEG, sg=i=>[bild.seg[i*S], bild.seg[i*S+1], bild.seg[i*S+2], bild.seg[i*S+3]];
  const offen=[...ps].sort((a,b)=>bild.seg[b.i*S+9]-bild.seg[a.i*S+9] || a.i-b.i), out=[];
  while(offen.length){ const p0=offen.shift(), [x1,y1,x2,y2]=sg(p0.i), L=Math.hypot(x2-x1, y2-y1), ex=(x2-x1)/L, ey=(y2-y1)/L, grp=[p0];
    for(let j=0;j<offen.length;){ const [a,b,c,d]=sg(offen[j].i), l=Math.hypot(c-a, d-b), w=Math.abs(ex*(d-b)-ey*(c-a))/l,
      q1=Math.abs((a-x1)*ey-(b-y1)*ex), q2=Math.abs((c-x1)*ey-(d-y1)*ex);
      const p=offen[j], nah=!p.s || grp.some(x=>!x.s || p.s[0]<=x.s[1]+DEF.intervalle.gap && p.s[1]>=x.s[0]-DEF.intervalle.gap);
      if(w<=Math.sin(1.5*D2R) && q1<=1.5 && q2<=1.5 && nah){ grp.push(p); offen.splice(j, 1); } else j++; }
    out.push(grp); }
  return out; };
const beobAus=(K,bild,ab,grp)=>{ const S=G.KG.SEG, D=bild.dir, c=[bild.camTo[12], bild.camTo[13], bild.camTo[14]], p0=grp[0];
  const base={k:bild.k, t:bild.t, ab, ep:bild.ep, i:p0.i, art:p0.art, L:p0.L, c, f:bild.f};
  if(grp.length===1){ const i=p0.i; return beobNeu(K, {...base, da:[D[6*i], D[6*i+1], D[6*i+2]], db:[D[6*i+3], D[6*i+4], D[6*i+5]],
    sPx:Math.max(1, bild.seg[i*S+5]||1), len:bild.seg[i*S+9], nSeg:bild.nTeile ? bild.nTeile[i]||1 : 1}); }
  const x1=bild.seg[p0.i*S], y1=bild.seg[p0.i*S+1], x2=bild.seg[p0.i*S+2], y2=bild.seg[p0.i*S+3], L=Math.hypot(x2-x1, y2-y1), ex=(x2-x1)/L, ey=(y2-y1)/L;
  let lo=null, hi=null, q=0, sp=1, n=0, ns=0;
  for(const p of grp){ const i=p.i; sp=Math.max(sp, bild.seg[i*S+5]||1); ns+=bild.nTeile ? bild.nTeile[i]||1 : 1;
    for(const e of [0, 1]){ const x=bild.seg[i*S+2*e], y=bild.seg[i*S+2*e+1], t=(x-x1)*ex+(y-y1)*ey, v=(x-x1)*ey-(y-y1)*ex; q+=v*v; n++;
      const d=[D[6*i+3*e], D[6*i+3*e+1], D[6*i+3*e+2]]; if(!lo || t<lo.t) lo={t, d}; if(!hi || t>hi.t) hi={t, d}; } }
  return beobNeu(K, {...base, da:lo.d, db:hi.d, sPx:Math.max(sp, Math.sqrt(q/n)), len:hi.t-lo.t, nSeg:ns}); };
const mitte=b=>einh([b.da[0]+b.db[0], b.da[1]+b.db[1], b.da[2]+b.db[2]]);
G.lmSchluessel=(karte,beob,o={})=>{ o={...DEF.schluessel, ...o}; const K=karte, b=beob, W=K.waende.get(b.L); if(!W) return false;
  let v=null; for(let j=W.beob.length-1;j>=0;j--){ const x=K.beob[W.beob[j]]; if(x!==b && x.schluessel && x.ab===b.ab){ v=x; break; } }
  if(!v) return true;
  if(Math.hypot(b.c[0]-v.c[0], b.c[1]-v.c[1], b.c[2]-v.c[2])>=o.dP) return true;
  const ma=mitte(b), mv=mitte(v), w=Math.acos(Math.max(-1, Math.min(1, ma[0]*mv[0]+ma[1]*mv[1]+ma[2]*mv[2])));
  if(w>=o.dWinkelDeg*D2R) return true;
  const s=hebeS(K, W, b), L=(b.art==='boden' ? W.boden : W.iv) || [];
  if(s){ if(!L.length) return true; let aus=Infinity; for(const x of L) aus=Math.min(aus, Math.max(0, x.s0-s[0])+Math.max(0, s[1]-x.s1)); if(aus>=o.dS) return true; }
  // verstaerken: nSeg zaehlt die Teile, sPx wird der nach nSeg gewichtete RMS der Teile (kein Gewinn wie bei
  // unabhaengigen Messungen: die Teile stammen aus fast derselben Sicht)
  v.sPx=Math.sqrt((v.sPx*v.sPx*v.nSeg+b.sPx*b.sPx*b.nSeg)/(v.nSeg+b.nSeg)); v.nSeg+=b.nSeg; return false; };
G.lmAufnehmen=(karte,bildErg,o={})=>{ const K=karte, bild=bildErg, st=zustand(K), ab=abVon(K, bild, o);
  if(!K.bilder.has(bild.k)) K.bilder.set(bild.k, {t:bild.t, ab, ep:bild.ep, c:[bild.camTo[12], bild.camTo[13], bild.camTo[14]], camTo:Array.from(bild.camTo), f:bild.f, schluessel:false});
  const B=K.bilder.get(bild.k), Z=G.lmZuordnen(bild, K, {...o.zuordnen, ab}), gr=new Map();
  for(const p of Z.paare){ const key=p.L+':'+p.art; if(!gr.has(key)) gr.set(key, []); gr.get(key).push(p); }
  let zugeordnet=0;
  for(const ps of gr.values()) for(const grp of kollinear(bild, ps)){ const b=beobAus(K, bild, ab, grp), W=K.waende.get(b.L);
    b.schluessel=G.lmSchluessel(K, b, o.schluessel); W.beob.push(b.id); buchen(K, W, b); if(b.schluessel) B.schluessel=true; zugeordnet++; }
  if(!st.zuord[ab]) st.zuord[ab]=stand(K, ab);
  const sp=G.lmSpuren(st, bild, K, {...o.spuren, neu:Z.neu, ab});
  return {zugeordnet, neu:Z.neu.length, befoerdert:sp.befoerdert.map(W=>W.id), mehrdeutig:Z.mehrdeutig.length}; };

// ------------------------------------------------ Kandidatenspuren (landmarken 2.5, 3.4 (5) Punkt 7)
const pixVon=(bild,P)=>{ const p=G.project(bild.proj, bild.camTo, P); return p ? G.ndcToPix(p[0], p[1], bild.w, bild.h, bild.flipY) : null; };
G.lmSpuren=(st,bildErg,karte,o={})=>{ o={...DEF.spuren, ...o}; const K=karte, bild=bildErg, S=G.KG.SEG, KL=G.KG.KL, ab=Number.isFinite(o.ab) ? o.ab : abVon(K, bild, o), befoerdert=[];
  const frei=(o.neu || [...Array(bild.n).keys()]).filter(i=>bild.cls[i]===KL.O || bild.cls[i]===KL.U);
  st.offen=st.offen.filter(tr=>tr.ab===ab && bild.k-tr.kLetzt<=o.lueckeK);
  const r=rahmenVon(K, ab), A=K.abschnitte[ab], gB=r===-1 ? G.gBei(A, bild.t) : null;
  const hO=r===-1 ? (Number.isFinite(K.hC) && gB ? K.hC-gB.ty : hSchaetz(K)) : (hRefC(K, r) ?? hSchaetz(K)), hU=r===-1 && gB ? hRefF(K, -1)-gB.ty : 0;
  const c=[bild.camTo[12], bild.camTo[13], bild.camTo[14]], D=bild.dir, neuObs=i=>({k:bild.k, t:bild.t, ep:bild.ep, i, c, art:bild.cls[i]===KL.O ? 'O' : 'U',
    da:[D[6*i], D[6*i+1], D[6*i+2]], db:[D[6*i+3], D[6*i+4], D[6*i+5]], sPx:Math.max(1, bild.seg[i*S+5]||1), len:bild.seg[i*S+9], f:bild.f,
    px:[bild.seg[i*S], bild.seg[i*S+1], bild.seg[i*S+2], bild.seg[i*S+3]], nSeg:bild.nTeile ? bild.nTeile[i]||1 : 1});
  // Folge: letzte Beob der Spur auf erwarteter Hoehe (sonst hebM) heben und ins neue Bild projizieren
  const heb=(x,d)=>{ const h=x.art==='O' ? hO : hU; let t=Math.abs(d[1])>1e-6 ? (h-x.c[1])/d[1] : -1; if(!(t>0.3 && t<15)) t=o.hebM; return [x.c[0]+t*d[0], x.c[1]+t*d[1], x.c[2]+t*d[2]]; };
  const kand=[];
  for(const tr of st.offen){ const x=tr.obs[tr.obs.length-1], pa=pixVon(bild, heb(x, x.da)), pb=pixVon(bild, heb(x, x.db)); if(!pa || !pb) continue;
    const dx=pb[0]-pa[0], dy=pb[1]-pa[1], dl=Math.hypot(dx, dy); if(dl<5) continue;
    for(const i of frei){ if((bild.cls[i]===KL.O ? 'O' : 'U')!==tr.art) continue;
      const x1=bild.seg[i*S], y1=bild.seg[i*S+1], x2=bild.seg[i*S+2], y2=bild.seg[i*S+3], ex=x2-x1, ey=y2-y1, el=Math.hypot(ex, ey);
      const ang=Math.asin(Math.min(1, Math.abs(ex*dy-ey*dx)/(el*dl)))/D2R; if(ang>o.winkelDeg) continue;
      const mx=(pa[0]+pb[0])/2, my=(pa[1]+pb[1])/2, dq=Math.abs((mx-x1)*ey-(my-y1)*ex)/el; if(dq>o.querPx) continue;
      const ta=((pa[0]-x1)*ex+(pa[1]-y1)*ey)/el, tb=((pb[0]-x1)*ex+(pb[1]-y1)*ey)/el, ov=Math.min(el, Math.max(ta, tb))-Math.max(0, Math.min(ta, tb));
      if(ov<o.ueber*Math.min(el, dl)) continue;
      kand.push({tr, i, sc:dq+ang}); } }
  kand.sort((a,b)=>a.sc-b.sc || a.i-b.i || a.tr.id-b.tr.id);
  const vT=new Set(), vI=new Set();
  for(const k of kand){ if(vT.has(k.tr) || vI.has(k.i)) continue; vT.add(k.tr); vI.add(k.i); k.tr.obs.push(neuObs(k.i)); k.tr.kLetzt=bild.k; }
  for(const i of frei) if(!vI.has(i)){ st.spurId=(st.spurId||0)+1; st.offen.push({id:st.spurId, ab, art:bild.cls[i]===KL.O ? 'O' : 'U', obs:[neuObs(i)], kLetzt:bild.k, versuch:0}); }
  // Befoerdern
  const bleiben=[];
  for(const tr of st.offen){ const n=tr.obs.length, dt=tr.obs[n-1].t-tr.obs[0].t;
    if(n>=o.minBilder && dt>=o.minDauer && n>=o.versuche[Math.min(tr.versuch, o.versuche.length-1)]){ tr.versuch++;
      const W=befoerdern(K, tr, o); if(W){ befoerdert.push(W); continue; } }
    if(n>o.maxBilder || dt>o.maxDauer) continue;
    bleiben.push(tr); }
  st.offen=bleiben;
  return {st, befoerdert}; };
// Anpassung im Rahmen der neuen Wand: im Rahmen F0 jede Beob mit G.gBei(abschnitt, t) ihrer Zeit (Pflicht 7), lokal Einheit.
const befoerdern=(K,tr,o)=>{ const ab=tr.ab, r=rahmenVon(K, ab), A=K.abschnitte[ab], pp=ppAn(K), R=[];
  for(const x of tr.obs){ const g=r===-1 ? G.gBei(A, x.t) : EINS; if(!g) return null; let d1=x.da, d2=x.db;
    if(pp){ const B=K.bilder.get(x.k); if(B){ d1=ppKorr(d1, B.camTo, x.f, pp); d2=ppKorr(d2, B.camTo, x.f, pp); } }
    R.push(g===EINS ? {c:x.c, d1, d2, w:1, sig:x.sPx, f:x.f, len:x.len} : {c:G.gAnw(g, x.c), d1:drehen(g.psi, d1), d2:drehen(g.psi, d2), w:1, sig:x.sPx, f:x.f, len:x.len}); }
  const oben=tr.art==='O', hRb=hRefC(K, r), hFb=hRefF(K, r);
  const hBez=oben ? (hRb ?? hSchaetz(K)) : hFb, x0=startLinie(R, hBez); if(!x0) return null;
  const [hMin, hMax]=hGrenzen(R, DEF.hoehe), H=hoeheIntern(R, [x0[0], x0[1], Math.min(hMax, Math.max(hMin, x0[2]))], {hMin, hMax, dh:0.01}); if(!H) return null;
  const hw=(H.hi-H.lo)/2, entsch=hw<o.entschieden && !H.rand, passt=(H.prof(hBez)-H.c0)/H.s2<o.dchi; if(!entsch && !passt) return null;
  // Linie auf der Hoehe, die die Wand bekommt: eigene (Stoerer, entschieden und weit weg) oder Bezugshoehe
  const weit=entsch && Math.abs(H.h-hBez)>Math.max(3*hw, 0.05), hL=weit ? H.h : hBez, x=weit ? [H.phi, H.rho, H.h] : passe(R, [H.phi, H.rho, hBez], false, {iter:12}).x;
  const phiL=wrap2pi(x[0]), rhoL=x[1], nx=Math.cos(phiL), nz=Math.sin(phiL), ss=[]; let sd=0;
  for(const z of R){ sd+=nx*z.c[0]+nz*z.c[2]-rhoL; for(const d of [z.d1, z.d2]){ const s=hebeAuf(z.c, d, nx, nz, rhoL); if(s!=null) ss.push(s); } }
  if(ss.length<2 || !(sd/R.length>DEF.zuordnen.seite)) return null;
  const s0=Math.min(...ss), s1=Math.max(...ss), pE=s=>[rhoL*nx-s*nz, rhoL*nz+s*nx], ends=[pE(s0), pE(s1)];
  const eckNah=[...K.ecken.values()].some(E=>E.rahmen===r && ends.some(p=>Math.hypot(E.p[0]-p[0], E.p[1]-p[1])<=o.eckeNah));
  if(s1-s0<(eckNah ? o.minStuetzeEcke : o.minStuetze)) return null;
  const h=weit ? H.h : oben ? 'c' : 'f';
  // Kovarianz (phi, rho) bei fester Hoehe im Rahmen der Wand
  const {N}=normal(R, [phiL, rhoL, hL], 2), det=N[0]*N[4]-N[1]*N[3], s2=Math.max(1, kosten(R, [phiL, rhoL, hL])/Math.max(1, 2*R.length-2));
  const cov=det>0 ? [N[4]/det*s2, -N[1]/det*s2, N[0]/det*s2] : null;
  const W=wandNeu(K, {rahmen:r, phi:phiL, rho:rhoL, cov, h, hFrei:{h:H.h, lo:H.lo, hi:H.hi, n:H.n, rand:H.rand}});
  K.waende.set(W.id, W);
  for(const x of tr.obs){ const b=beobNeu(K, {...x, ab, art:artFuer(W, x.art==='U'), L:W.id}); b.schluessel=G.lmSchluessel(K, b); W.beob.push(b.id); buchen(K, W, b);
    const B=K.bilder.get(x.k); if(B && b.schluessel) B.schluessel=true; }
  G.lmIntervalle(W, K); return W; };

// ------------------------------------------------ Intervalle (LIMAP), Hoehe
const verbinden=(L,gap,alt,mitT)=>{ L.sort((a,b)=>a.s0-b.s0); const out=[];
  for(let i=0;i<L.length;){ let j=i, e=L[i].s1; while(j+1<L.length && L[j+1].s0<=e+gap){ j++; e=Math.max(e, L[j].s1); }
    const H=L.slice(i, j+1), n=H.length, a=H.map(x=>x.s0).sort((x,y)=>x-y), b=H.map(x=>x.s1).sort((x,y)=>y-x);
    let s0=n>=5 ? a[2] : a[0], s1=n>=5 ? b[2] : b[0]; if(!(s1>s0)){ s0=a[0]; s1=b[0]; }
    if(!mitT) out.push({s0, s1, n});
    else { const mid=(s0+s1)/2, us=H.map(x=>x.u), v=alt ? alt.reduce((best,x)=>{ const ov=Math.min(x.s1, s1)-Math.max(x.s0, s0); return ov>0 && x.ring>=0 && (!best || ov>best.ov) ? {ov, ring:x.ring} : best; }, null) : null;
      out.push({s0, s1, n, bilder:new Set(H.map(x=>x.k)).size, t0:Math.min(...H.map(x=>x.t)), t1:Math.max(...H.map(x=>x.t)),
        beidseits:us.some(u=>u<mid) && us.some(u=>u>mid), ring:v ? v.ring : -1}); }
    i=j+1; }
  return out; };
G.lmIntervalle=(W,karte,o={})=>{ o={...DEF.intervalle, ...o}; const K=karte, oben=[], unten=[], nx=Math.cos(W.phi), nz=Math.sin(W.phi); let ss=0, ns=0;
  for(const id of W.beob){ const b=K.beob[id]; if(!b.schluessel || b.L!==W.id || b.art==='ecke') continue; const s=hebeS(K, W, b); if(!s) continue;
    const c=camIn(K, W, b); (b.art==='boden' ? unten : oben).push({s0:s[0], s1:s[1], k:b.k, t:b.t, u:-nz*c[0]+nx*c[2]}); ss+=(s[0]+s[1])/2; ns++; }
  W.iv=verbinden(oben.length ? oben : unten, o.gap, W.iv, true); W.boden=verbinden(unten, o.gap, null, false); W.sSchwer=ns ? ss/ns : 0;
  if(W.ausEcken){ const sp=kurzIv(K, W); if(sp){ const H=ivHuelle(W); if(!W.iv.length) W.iv=[sp]; else if(!H || sp.s0<H[0] || sp.s1>H[1]){ W.iv=[...W.iv, sp].sort((a,b)=>a.s0-b.s0); } } }
  statistik(K, W); return W.iv; };
G.lmHoehe=(beob,karte,o={})=>{ o={...DEF.hoehe, ...o}; const K=karte; zustand(K);
  const B=beob.map(b=>typeof b==='number' ? K.beob[b] : b).filter(b=>b && b.db); if(B.length<2) return null;
  const W0=K.waende.get(B[0].L), r=o.rahmen ?? (W0 && B[0].art!=='ecke' ? W0.rahmen : rahmenVon(K, B[0].ab)), R=strahlenListe(K, B, r, o.maxBeob); if(R.length<2) return null;
  const [hMin, hMax]=hGrenzen(R, o), oben=obenR(R), h0=o.start ? o.start.h : oben ? (hRefC(K, r) ?? hSchaetz(K)) : hRefF(K, r);
  const x0=o.start ? [o.start.phi, o.start.rho, h0] : startLinie(R, h0); if(!x0) return null;
  const H=hoeheIntern(R, [x0[0], x0[1], Math.min(hMax, Math.max(hMin, h0))], {hMin, hMax, dh:o.dh});
  return H && {h:H.h, lo:H.lo, hi:H.hi, rms:H.rms, rand:H.rand, phi:H.phi, rho:H.rho, n:H.n, s2:H.s2}; };

// ------------------------------------------------ Durchblick (8.1, 8.3)
const schluesselBeob=(K,W,max)=>{ const B=[]; for(const id of W.beob){ const b=K.beob[id]; if(b.schluessel && b.db && b.L===W.id) B.push(b); }
  if(!max || B.length<=max) return B; const out=[]; for(let j=0;j<max;j++) out.push(B[Math.floor(j*B.length/max)]); return out; };
// Nur Landmarken mit >= minSchl Schluessel-Beob, als Linie wie als Ziel. Jeder Aufruf rechnet voll aus der Karte (kein
// Zwischenstand neben KarteZustand). Hoehenvergleich gegen hFrei.h, wenn die Hoehe der Linie entschieden ist
// (Halbbreite <= klasse.halb, nicht am Rand), sonst gegen die Bezugshoehe (Oeffnungen in Luecken); die Durchsicht-Regel
// 'unterzug' (8.3) gilt nur fuer Linien mit entschiedener Hoehe (A8: 24 von 137 Linien 'unterzug' gegen festes h_c).
const hEntschieden=W=>!!(W.hFrei && Number.isFinite(W.hFrei.h) && (W.hFrei.hi-W.hFrei.lo)/2<=DEF.klasse.halb && !W.hFrei.rand);
// an: Schalter klasse.unterzug (Z3, 19.2); 'aus' schaltet die Regel ab, sonst gilt sie wie bisher
const istUnterzug=(W,o,an)=>(an ?? DEF.klasse.unterzug)!=='aus' && hEntschieden(W) && belegt(W)>=o.unterzugMinL && unterzugAnteil(W)>=o.anteilUnterzug;
// Strahlen-Verzeichnis je Rahmen: die Strahlen der Schluessel-Beob aller Landmarken mit >= minSchl (Reihenfolge wie die volle
// Rechnung: Landmarken in karte.waende, Beob, Ende da/db) als flache Liste mit l2 und |d_xz|. Es aendert kein Ergebnis:
// neu gebaut, sobald sich etwas aendert, woraus es rechnet - spuren.aend des Rahmens und alle, Hauptpunkt, maxBeob, minSchl,
// Grenzen der Abschnitte (Umnummerieren in M10), im Rahmen F0 g und Knoten aller Abschnitte, phi/rho/nSchluessel jeder
// beteiligten Landmarke (elementweise, ohne Toleranz). Ein Klon baut es neu und bekommt dasselbe.
// Je Wand dazu das letzte Ergebnis, gueltig solange dasselbe Verzeichnis (unveraendert gebaut) und dieselbe eigene Lage,
// Hoehe, Huelle und Vorgaben gelten (elementweise).
const DVZ=new WeakMap(), DBW=new WeakMap();
const strahlVz=(K,r,o)=>{ const pp=ppAn(K), sch=[...aendStand(K, r), pp ? pp.cx : 0, pp ? pp.cy : 0, o.maxBeob, o.minSchl, K.abschnitte.length];
  for(const A of K.abschnitte) sch.push(A ? A.t0 : NaN, A ? A.t1 : NaN, A ? A.ep0 : NaN, A ? A.ep1 : NaN);
  if(r===-1) gStand(K, K.abschnitte.map((_,i)=>i), sch);
  let M=DVZ.get(K); if(!M){ M=new Map(); DVZ.set(K, M); } const alt=M.get(r);
  if(alt && gleichA(alt.sch, sch)){ let gl=true; for(let i=0;i<alt.W.length && gl;i++){ const X=alt.W[i]; gl=X.phi===alt.phi[i] && X.rho===alt.rho[i] && X.nSchluessel===alt.nS[i] && X.rahmen===r; } if(gl) return alt; }
  const Ws=[], phi=[], rho=[], nS=[], R=[];
  for(const W2 of K.waende.values()){ if(W2.rahmen!==r || W2.nSchluessel<o.minSchl) continue; const wi=Ws.length; Ws.push(W2); phi.push(W2.phi); rho.push(W2.rho); nS.push(W2.nSchluessel);
    const n2x=Math.cos(W2.phi), n2z=Math.sin(W2.phi);
    for(const b of schluesselBeob(K, W2, o.maxBeob)){ const g=b.ab===r ? EINS : r!==-1 ? null : gZu(K, r, b.ab, b.t); if(!g) continue;
      const Z=g===EINS && !pp ? b : strahlen(K, b, g), c=Z.c;
      for(let e=0;e<2;e++){ const d=e ? Z.db : Z.da, nd2=n2x*d[0]+n2z*d[2], l2=nd2<-1e-6 ? -(n2x*c[0]+n2z*c[2]-W2.rho)/nd2 : Infinity;
        R.push(c[0], c[1], c[2], d[0], d[1], d[2], l2, Math.hypot(d[0], d[2]), wi); } } }
  // zwei Stufen Huellkaesten (Kamera bis Treffpunkt in der Draufsicht): je Landmarke und je 16 Strahlen. Ein Strahl, der die
  // Linie im Stueck [lo, hi] quert, hat den Querpunkt in beiden Kaesten und auf der Linie: ein Kasten, der das Stueck nicht
  // ueberlappt oder ganz auf einer Seite der Linie liegt, kann nichts beitragen.
  const n=R.length/9, nC=Math.ceil(n/16), BC=new Float64Array(4*nC), grp=[];
  for(let ch=0;ch<nC;ch++){ let x0=Infinity, x1=-Infinity, z0=Infinity, z1=-Infinity;
    for(let q=16*ch;q<Math.min(n, 16*ch+16);q++){ const k=9*q, l2=R[k+6], hx=R[k]+l2*R[k+3], hz=R[k+2]+l2*R[k+5];
      if(!Number.isFinite(l2)){ x0=z0=-Infinity; x1=z1=Infinity; break; }
      x0=Math.min(x0, R[k], hx); x1=Math.max(x1, R[k], hx); z0=Math.min(z0, R[k+2], hz); z1=Math.max(z1, R[k+2], hz); }
    BC.set([x0, x1, z0, z1], 4*ch); }
  for(let q=0;q<n;){ const wi=R[9*q+8]; let e=q; while(e<n && R[9*e+8]===wi) e++; let x0=Infinity, x1=-Infinity, z0=Infinity, z1=-Infinity;
    for(let ch=q>>4;ch<=(e-1)>>4;ch++){ x0=Math.min(x0, BC[4*ch]); x1=Math.max(x1, BC[4*ch+1]); z0=Math.min(z0, BC[4*ch+2]); z1=Math.max(z1, BC[4*ch+3]); }
    grp.push([q, e, x0, x1, z0, z1]); q=e; }
  const V={sch, W:Ws, phi, rho, nS, R:Float64Array.from(R), n, BC, grp}; M.set(r, V); return V; };
// Proben (s laengs W, Kamera x, z) in Einfuegereihenfolge -> Stuecke: nach s geordnet (bei gleichem s nach Einfuegen, wie ein
// stabiles Sortieren), Haufen mit Luecke <= haufen, je Haufen >= minStrahlen Proben aus >= minStandpunkte Standpunkten
// (gierig wie standpunkte). Fuer minStandpunkte <= 2 ohne Sortieren der Proben: zwei Standpunkte gibt es genau dann, wenn
// eine Probe des Haufens >= standAbst von seiner ersten (kleinstes s, zuerst eingefuegt) liegt.
const durchStuecke=(S,X,Z,o)=>{ const n=S.length, out=[]; if(!n) return out;
  if(o.minStandpunkte>2){ const I=Array.from({length:n}, (_,i)=>i).sort((a,b)=>S[a]-S[b] || a-b);
    for(let i=0;i<n;){ let j=i; while(j+1<n && S[I[j+1]]-S[I[j]]<=o.haufen) j++;
      if(j-i+1>=o.minStrahlen){ const P=[]; for(let q=i;q<=j;q++) P.push([X[I[q]], Z[I[q]]]); if(standpunkte(P, o.standAbst, o.minStandpunkte)>=o.minStandpunkte) out.push([S[I[i]], S[I[j]]]); }
      i=j+1; }
    return out; }
  const T=Float64Array.from(S).sort(), lo=[], hi=[], cnt=[];
  for(let i=0;i<n;){ let j=i; while(j+1<n && T[j+1]-T[j]<=o.haufen) j++; lo.push(T[i]); hi.push(T[j]); cnt.push(j-i+1); i=j+1; }
  const m=lo.length, haufen=new Int32Array(n), erst=new Int32Array(m).fill(-1), zwei=new Uint8Array(m);
  for(let q=0;q<n;q++){ let a=0, b=m-1; while(a<b){ const c=(a+b+1)>>1; if(lo[c]<=S[q]) a=c; else b=c-1; } haufen[q]=a; if(S[q]===lo[a] && erst[a]<0) erst[a]=q; }
  if(o.minStandpunkte>1) for(let q=0;q<n;q++){ const c=haufen[q], f=erst[c]; if(!zwei[c] && Math.hypot(X[f]-X[q], Z[f]-Z[q])>=o.standAbst) zwei[c]=1; }
  for(let c=0;c<m;c++) if(cnt[c]>=o.minStrahlen && (o.minStandpunkte<=1 || zwei[c])) out.push([lo[c], hi[c]]);
  return out; };
G.lmDurchblick=(W,karte,o={})=>{ o={...DEF.durchblick, ...o}; const K=karte, nx=Math.cos(W.phi), nz=Math.sin(W.phi), ux=-nz, uz=nx, H=ivHuelle(W), PS=[], PX=[], PZ=[];
  if(!H || W.nSchluessel<o.minSchl){ W.durchblick=[]; return {durchblick:[], unterzug:false}; }
  const hT=hEntschieden(W) ? W.hFrei.h : hOben(W, K), lo=H[0]-o.rand, hi=H[1]+o.rand, r=W.rahmen, pp=ppAn(K);
  if(o.voll){ // volle Rechnung ohne Verzeichnis (Pruefung)
    for(const W2 of K.waende.values()){ if(W2===W || W2.rahmen!==r || W2.nSchluessel<o.minSchl) continue; const n2x=Math.cos(W2.phi), n2z=Math.sin(W2.phi);
      for(const b of schluesselBeob(K, W2, o.maxBeob)){ const g=b.ab===r ? EINS : r!==-1 ? null : gZu(K, r, b.ab, b.t); if(!g) continue;
        const Z=g===EINS && !pp ? b : strahlen(K, b, g), c=Z.c;
        for(let e=0;e<2;e++){ const d=e ? Z.db : Z.da, nd=nx*d[0]+nz*d[2]; if(Math.abs(nd)<1e-6) continue; const l=-(nx*c[0]+nz*c[2]-W.rho)/nd; if(!(l>0)) continue;
          const nd2=n2x*d[0]+n2z*d[2], l2=nd2<-1e-6 ? -(n2x*c[0]+n2z*c[2]-W2.rho)/nd2 : Infinity, dp=Math.hypot(d[0], d[2]);
          if(!(l*dp>o.nah && (l2-l)*dp>o.nah)) continue;
          if(!(c[1]+l*d[1]<hT-o.unterHoehe)) continue;
          const s=ux*(c[0]+l*d[0])+uz*(c[2]+l*d[2]); if(s<lo || s>hi) continue;
          PS.push(s); PX.push(c[0]); PZ.push(c[2]); } } } }
  else { const V=strahlVz(K, r, o), alt=DBW.get(W), sch=[W.phi, W.rho, hT, lo, hi, o.nah, o.unterHoehe, o.haufen, o.minStrahlen, o.standAbst, o.minStandpunkte, o.anteilUnterzug, o.unterzugMinL];
    if(alt && alt.V===V && gleichA(alt.sch, sch)){ W.durchblick=alt.st.map(x=>[...x]); return {durchblick:W.durchblick, unterzug:istUnterzug(W, o, o.unterzug)}; }
    const R=V.R, BC=V.BC, wo=V.W.indexOf(W), ax=W.rho*nx+lo*ux, az=W.rho*nz+lo*uz, bx=W.rho*nx+hi*ux, bz=W.rho*nz+hi*uz, e=1e-9;
    const qx0=Math.min(ax, bx)-e, qx1=Math.max(ax, bx)+e, qz0=Math.min(az, bz)-e, qz1=Math.max(az, bz)+e;
    const weg=(x0,x1,z0,z1)=>{ if(x1<qx0 || x0>qx1 || z1<qz0 || z0>qz1) return true; if(!(x0>-Infinity && x1<Infinity && z0>-Infinity && z1<Infinity)) return false;
      const a=nx*x0+nz*z0-W.rho, b=nx*x1+nz*z0-W.rho, c=nx*x0+nz*z1-W.rho, d=nx*x1+nz*z1-W.rho; return a>0 && b>0 && c>0 && d>0 || a<0 && b<0 && c<0 && d<0; };
    for(const [g0, g1, x0, x1, z0, z1] of V.grp){ if(R[9*g0+8]===wo || weg(x0, x1, z0, z1)) continue;
      for(let q=g0;q<g1;q++){ const ch=q>>4; if(q===g0 || (q&15)===0){ if(weg(BC[4*ch], BC[4*ch+1], BC[4*ch+2], BC[4*ch+3])){ q=Math.min(g1, 16*ch+16)-1; continue; } }
        const k=9*q, nd=nx*R[k+3]+nz*R[k+5]; if(Math.abs(nd)<1e-6) continue;
        const l=-(nx*R[k]+nz*R[k+2]-W.rho)/nd; if(!(l>0)) continue; const dp=R[k+7];
        if(!(l*dp>o.nah && (R[k+6]-l)*dp>o.nah)) continue;
        if(!(R[k+1]+l*R[k+4]<hT-o.unterHoehe)) continue;
        const s=ux*(R[k]+l*R[k+3])+uz*(R[k+2]+l*R[k+5]); if(s<lo || s>hi) continue;
        PS.push(s); PX.push(R[k]); PZ.push(R[k+2]); } } }
  const stuecke=durchStuecke(PS, PX, PZ, o); W.durchblick=stuecke; if(!o.voll) DBW.set(W, {V:strahlVz(K, r, o), sch:[W.phi, W.rho, hT, lo, hi, o.nah, o.unterHoehe, o.haufen, o.minStrahlen, o.standAbst, o.minStandpunkte, o.anteilUnterzug, o.unterzugMinL], st:stuecke.map(x=>[...x])});
  return {durchblick:stuecke, unterzug:istUnterzug(W, o, o.unterzug)}; };
const belegt=W=>(W.iv||[]).reduce((s,x)=>s+x.s1-x.s0, 0);
const unterzugAnteil=W=>{ let L=0, d=0; for(const x of W.iv||[]){ L+=x.s1-x.s0; for(const [a,b] of W.durchblick||[]) d+=Math.max(0, Math.min(b, x.s1)-Math.max(a, x.s0)); }
  return L>0 ? d/L : 0; };

// ------------------------------------------------ Zusammenfuehren, Trennen (3.3)
const lueckeFrei=(W,g0,g1)=>!(W.durchblick||[]).some(([a,b])=>b>g0+0.02 && a<g1-0.02);
// Regel 3.3: gleiche Seite (<= 5°), |Δrho| <= 5 cm an beiden Enden der gemeinsamen Huelle, χ² <= 9,21 (wenn
// Kovarianzen da), gleiche rahmen, vertraegliche Hoehe, Ueberlapp oder Luecke <= 0,5 m ohne Durchblick.
const zusammenPruef=(Wa,Wb,o)=>{ if(Wa.rahmen!==Wb.rahmen || Wa.cls==='schrank' || Wb.cls==='schrank') return false;
  if(Math.cos(Wa.phi-Wb.phi)<o.cosSeite || !hVertraeglich(Wa, Wb, o.hTol)) return false;
  const Ha=ivHuelle(Wa), Hb0=ivHuelle(Wb); if(!Ha || !Hb0) return false;
  const ua=G.wandU(Wa.phi), nb=G.wandN(Wb.phi), ub=G.wandU(Wb.phi), sb=s=>{ const p=[Wb.rho*nb[0]+s*ub[0], Wb.rho*nb[1]+s*ub[1]]; return ua[0]*p[0]+ua[1]*p[1]; };
  const Hb=[sb(Hb0[0]), sb(Hb0[1])].sort((x,y)=>x-y), u0=Math.min(Ha[0], Hb[0]), u1=Math.max(Ha[1], Hb[1]), sm=(u0+u1)/2, dq=quer(Wa, Wb, sm);
  if(Math.abs(dq)>o.drhoMax) return false;
  const cb=o.covBoden || [0, 0, 0], C=W=>W.cov ? [W.cov[0]+cb[0], W.cov[1]+cb[1], W.cov[2]+cb[2]] : null, Ca=C(Wa), Cb=C(Wb);
  if(Ca && Cb){ const dphi=wrap(Wa.phi-Wb.phi), vl=X=>Math.max(1e-10, sm*sm*X[0]-2*sm*X[1]+X[2]);
    if(dphi*dphi/Math.max(1e-12, Ca[0]+Cb[0])+dq*dq/(vl(Ca)+vl(Cb))>o.chi2) return false; }
  if(Ha[1]>=Hb[0] && Hb[1]>=Ha[0]) return true;
  const g0=Ha[1]<Hb[0] ? Ha[1] : Hb[1], g1=Ha[1]<Hb[0] ? Hb[0] : Ha[0];
  return g1-g0<=o.lueckeMax && lueckeFrei(Wa, g0, g1) && lueckeFrei(Wb, g0, g1); };
const verschmelzen=(K,W,X)=>{ aend(K, W.rahmen); aend(K, X.rahmen); for(const id of X.beob) K.beob[id].L=W.id; W.beob=[...W.beob, ...X.beob].sort((a,b)=>a-b);
  W.teile=[...W.teile, X.id, ...X.teile]; W.ecken=[...new Set([...W.ecken, ...X.ecken])];
  for(const E of K.ecken.values()) if(E.waende) E.waende=E.waende.map(i=>i===X.id ? W.id : i);
  W.durchblick=[...(W.durchblick||[]), ...(X.durchblick||[])].sort((a,b)=>a[0]-b[0]);
  if(W.zustand==='kandidat' && X.zustand!=='kandidat') W.zustand=X.zustand;
  K.waende.delete(X.id); naechsteWeg(K, X.id); G.lmIntervalle(W, K); };
const nSchl=(K,ids)=>{ let n=0; for(const id of ids) if(K.beob[id].schluessel) n++; return n; };
const vorzug=(K,a,b)=>{ const v=W=>(W.h==='f' ? 0 : 1); if(v(a)!==v(b)) return v(a)>v(b) ? [a, b] : [b, a];
  const na=nSchl(K, a.beob), nb=nSchl(K, b.beob); return na!==nb ? (na>nb ? [a, b] : [b, a]) : (a.id<b.id ? [a, b] : [b, a]); };
// Paare in fester Reihenfolge (nach Einfuegen in karte.waende); nach einem Zusammenfuehren geht es mit dem
// Ueberlebenden weiter, Durchgaenge bis nichts mehr geht. Vorfilter gegen O(n²) (A7 lokal: bis 2389 Landmarken [M]),
// der kein Paar der Regel 3.3 auslaesst: gleicher rahmen, Richtung in Faechern von 10° (Nachbarfaecher, |Δphi| <= 5°)
// und |Δrho| <= drhoMax + 2 sin(Δphi_max/2)·|p|, p der Punkt von a in der Mitte der gemeinsamen Huelle. |p|² <= rho_a² +
// max(Sa, Rb)², Sa der groessere Betrag der Huellen-Enden von a (laengs a), Rb der Abstand des ferneren Huellen-Endes von b
// vom Ursprung. Gesucht wird je Fach nach rho sortiert mit R = max Rb im Rahmen; waechst R oder Sa durch ein
// Zusammenfuehren, werden die Kandidaten von a neu bestimmt. o.voll: ohne Vorfilter (Pruefung).
const huelleS=W=>{ const H=ivHuelle(W); return H ? Math.max(Math.abs(H[0]), Math.abs(H[1])) : 0; };
const huelleR=W=>{ const H=ivHuelle(W); return H ? Math.sqrt(W.rho*W.rho+Math.max(H[0]*H[0], H[1]*H[1])) : 0; };
G.lmZusammenfuehren=(karte,o={})=>{ o={...DEF.zusammen, ...o}; const K=karte, paare=[]; zustand(K); const NF=36;
  const fv=W=>Math.floor(wrap2pi(W.phi)/ZWEIPI*NF)%NF, sinH=Math.sin(Math.acos(Math.min(1, o.cosSeite))/2), fenster=(rho,S)=>o.drhoMax+2*sinH*Math.sqrt(rho*rho+S*S);
  for(let weiter=true;weiter;){ weiter=false; const L=[...K.waende.values()], weg=new Set(), fach=new Map(), R=new Map(), Rb=L.map(huelleR);
    L.forEach((W,i)=>{ const k=W.rahmen+':'+fv(W); if(!fach.has(k)) fach.set(k, []); fach.get(k).push(i); R.set(W.rahmen, Math.max(R.get(W.rahmen)||0, Rb[i])); });
    for(const F of fach.values()) F.sort((x,y)=>L[x].rho-L[y].rho || x-y);
    const kand=(i,ab)=>{ const a=L[i], J=[];
      if(o.voll){ for(let j=ab+1;j<L.length;j++) if(L[j].rahmen===a.rahmen) J.push(j); return J; }
      const f=fv(a), Sa=huelleS(a), w=fenster(a.rho, Math.max(Sa, R.get(a.rahmen)||0));
      for(const df of [-1, 0, 1]){ const F=fach.get(a.rahmen+':'+((f+df+NF)%NF)); if(!F) continue; let lo=0, hi=F.length;
        while(lo<hi){ const m=(lo+hi)>>1; if(L[F[m]].rho<a.rho-w) lo=m+1; else hi=m; }
        for(let q=lo;q<F.length;q++){ const j=F[q], b=L[j]; if(b.rho>a.rho+w) break; if(j>ab && Math.abs(b.rho-a.rho)<=fenster(a.rho, Math.max(Sa, Rb[j]))) J.push(j); } }
      return J.sort((x,y)=>x-y); };
    for(let i=0;i<L.length;i++){ if(weg.has(L[i])) continue; let J=kand(i, i), Sa=huelleS(L[i]);
      for(let k=0;k<J.length;k++){ const j=J[k], a=L[i], b=L[j]; if(weg.has(a) || weg.has(b) || !zusammenPruef(a, b, o)) continue;
        const [W, X]=vorzug(K, a, b); verschmelzen(K, W, X); paare.push([W.id, X.id]); weg.add(X); weiter=true;
        const rn=huelleR(W), r0=R.get(W.rahmen)||0; Rb[W===a ? i : j]=rn; if(rn>r0) R.set(W.rahmen, rn); if(X===a) break;
        const sn=huelleS(W); if(rn>r0 || sn>Sa){ Sa=sn; J=kand(i, j); k=-1; } } } }
  return {paare}; };
G.lmTrennen=(karte,o={})=>{ const K=karte, getrennt=[]; zustand(K);
  for(const W of [...K.waende.values()]){ const iv=[...(W.iv||[])].sort((a,b)=>a.s0-b.s0); if(iv.length<2 || !(W.durchblick||[]).length) continue;
    let cut=null; for(let i=0;i+1<iv.length && cut==null;i++) if(!lueckeFrei(W, iv[i].s1, iv[i+1].s0)) cut=(iv[i].s1+iv[i+1].s0)/2;
    if(cut==null) continue;
    const links=[], rechts=[]; for(const id of W.beob){ const s=hebeS(K, W, K.beob[id]); (s && (s[0]+s[1])/2>cut ? rechts : links).push(id); }
    if(!nSchl(K, links) || !nSchl(K, rechts)) continue;
    const [bleibt, geht]=nSchl(K, links)>=nSchl(K, rechts) ? [links, rechts] : [rechts, links];
    let id=null; while(W.teile.length && id==null){ const t=W.teile.pop(); if(!K.waende.has(t)) id=t; }
    const N={...W, id:id ?? neueId(K, 'w'), beob:geht, teile:[], iv:[], boden:[], durchblick:[], ecken:[], ringe:[], hFrei:W.hFrei ? {...W.hFrei} : null,
      cov:W.cov ? [...W.cov] : null, hLokal:W.hLokal ? {...W.hLokal} : null, abschnitte:[...W.abschnitte], clsZaehler:0};
    naechsteWeg(K, N.id);
    aend(K, W.rahmen); W.beob=bleibt; W.durchblick=[]; for(const i of geht) K.beob[i].L=N.id; K.waende.set(N.id, N);
    G.lmIntervalle(W, K); G.lmIntervalle(N, K); getrennt.push(N.id); }
  return {getrennt}; };

// ------------------------------------------------ Hoehenklasse (6.5, 8.2-8.4)
// Rand der Wanddeutung dChiC = (min_{|h - h_c| >= halb} Kosten(h) - Kosten(h_c)) / s2: gross, wenn die Daten
// die Deckenhoehe tragen und andere Hoehen verwerfen; ~0 bei unentschiedener Hoehe; < 0 bei anderer Hoehe.
// 'wand' setzen bei dChiC >= 4 und Basis >= 0,3 m, loesen bei dChiC < 2 oder Basis < 0,2 m (je 2 Runden).
// dChiF: dasselbe fuer die Boden-Beob gegen h_f. 'stoer': Hoehe entschieden (Halbbreite <= halb) und h_c
// verworfen ((Kosten(h_c) - min)/s2 >= 9, also 3σ [S]) und >= halb neben h_c, bei Basis >= 0,3 m. 'lokal' (8.3):
// h_c ebenso verworfen, 3 cm bis 0,5 m daneben und in >= 2 Abschnitten gleichsinnig; cls bleibt 'wand', hFrei.lokal
// = true (h setzt M6). Gemessen (F4 rund, D-E): 18 Schluessel-Beob, h frei 2,389 ± 0,010 m bei h_c 2,416 m, also
// 2,7σ daneben - mit der Schwelle 4 (2σ) waere die Wand ein Stoerer geworden.
// Freie Hoehe einer Wand aus ihren Schluessel-Beob (oben: Decke/Stoerer, unten: Boden). Die Anpassung startet aus den
// Daten (startLinie auf der Schaetzhoehe hSchaetz bzw. 0), nicht aus der Lage, die M6 gerade hat: so haengt sie nur an
// den Strahlen. Merkliste je Wand und Art, die kein Ergebnis aendert: der Schluessel enthaelt alles, woraus gerechnet
// wird (Rahmen, Starthoehe, maxBeob, Hauptpunkt, je Schluessel-Beob id, ab, sPx, im Rahmen F0 g und Knoten jedes
// beteiligten Abschnitts), elementweise ohne Toleranz verglichen; ein Klon rechnet neu und bekommt dasselbe.
// o.immer (lmHoehenklasse): ohne Merkliste (Pruefung).
const FIT=new WeakMap();
const gStand=(K,abs,k)=>{ for(const ab of abs){ const A=K.abschnitte[ab], g=A && A.g; k.push(ab, g ? g.psi : NaN, g ? g.tx : NaN, g ? g.ty : NaN, g ? g.tz : NaN);
  const D=A ? knotD(A) : [], T=A && A.knoten ? (Array.isArray(A.knoten) ? A.knoten.map(x=>x.t) : A.knoten.t || []) : []; k.push(D.length);
  for(let j=0;j<D.length;j++) k.push(T[j], D[j][0], D[j][1], D[j][2], D[j][3]); } return k; };
const gleichA=(a,b)=>{ if(!a || a.length!==b.length) return false; for(let i=0;i<a.length;i++) if(!(a[i]===b[i] || a[i]!==a[i] && b[i]!==b[i])) return false; return true; };
const wandFit=(K,W,o,unten)=>{ const B=[]; for(const id of W.beob){ const b=K.beob[id]; if(b.schluessel && b.db && b.L===W.id && (b.art==='boden')===!!unten) B.push(b); }
  const hS=unten ? 0 : hSchaetz(K), pp=ppAn(K), key=unten ? 'u' : 'o', alt=FIT.get(W) || {}, a=alt[key];
  const sch=[W.rahmen, hS, o.maxBeob, pp ? pp.cx : 0, pp ? pp.cy : 0, B.length], abs=new Set();
  for(const b of B){ sch.push(b.id, b.ab, b.sPx); abs.add(b.ab); }
  if(W.rahmen===-1) gStand(K, [...abs].sort((x,y)=>x-y), sch);
  if(a && !o.immer && gleichA(a.sch, sch)) return a.erg;
  const R=strahlenListe(K, B, W.rahmen, o.maxBeob); let erg=null;
  if(R.length>=3){ const [hMin, hMax]=hGrenzen(R, DEF.hoehe), h0=Math.max(hMin, Math.min(hMax, hS)), x0=startLinie(R, h0);
    const H=x0 && hoeheIntern(R, [x0[0], x0[1], h0], {hMin, hMax, dh:0.01}); if(H) erg={H, R, B}; }
  FIT.set(W, {...alt, [key]:{sch, erg}}); return erg; };
const randDeutung=(H,hR,halb)=>{ const cR=H.prof(hR), mA=Math.abs(H.h-hR)>=halb ? H.c0 : Math.min(H.prof(hR-halb), H.prof(hR+halb)); return {d:(mA-cR)/H.s2, ab:(cR-H.c0)/H.s2}; };
const abschnitteAbw=(K,W,F,hR,o)=>{ const gr=new Map(); for(const z of F.R){ const ab=z.b.ab; if(!gr.has(ab)) gr.set(ab, []); gr.get(ab).push(z); }
  const vz=Math.sign(F.H.h-hR); let n=0;
  for(const R of gr.values()){ if(R.length<o.lokalMinBeob) continue; const [hMin, hMax]=hGrenzen(R, DEF.hoehe), H=hoeheIntern(R, [F.H.phi, F.H.rho, Math.max(hMin, Math.min(hMax, F.H.h))], {hMin, hMax, dh:0.01});
    if(H && (H.hi-H.lo)/2<=o.halb && Math.sign(H.h-hR)===vz && Math.abs(H.h-hR)>o.lokalSetzen) n++; }
  return n; };
// 8.4: liegt hinter W (gleiche Seite, 2-25 cm, Ueberlapp >= 50 % von W) eine Linie mit Hoehe <= 3 cm an h_c, und liegt
// W selbst nahe der Decke (<= 15 cm), ist W die naehere: Stoerer (Vorhangschiene, Sturz, Leiste). Nicht, wenn W selbst
// entschieden auf h_c liegt (<= 3 cm, Halbbreite <= 2 cm): das ist eine echte Stufe (B-C/D-E 0,22 m, Y-H/G-Z 0,17 m);
// auf F4 twechsel machte die Regel ohne diese Ausnahme D-E zum Stoerer, weil B-C ueber D-E hinaus zugeordnet war.
const vorhang=(K,W,o,hR)=>{ if(hR==null || !W.hFrei || Math.abs(W.hFrei.h-hR)>o.vorhangDecke) return false; const H=ivHuelle(W); if(!H) return false;
  if(Math.abs(W.hFrei.h-hR)<=o.vorhangWand && (W.hFrei.hi-W.hFrei.lo)/2<=0.02) return false;
  for(const X of K.waende.values()){ if(X===W || X.rahmen!==W.rahmen || Math.cos(X.phi-W.phi)<Math.cos(5*D2R) || !X.hFrei || istStoer(X)) continue;
    const sm=(H[0]+H[1])/2, d=quer(W, X, sm); if(!(d>=o.vorhangMin && d<=o.vorhangAbst)) continue;
    if(Math.abs(X.hFrei.h-hR)>o.vorhangWand || (X.hFrei.hi-X.hFrei.lo)/2>o.halb) continue;
    const HX=ivHuelle(X); if(!HX) continue; const u=G.wandU(W.phi), nX=G.wandN(X.phi), uX=G.wandU(X.phi), s=t=>u[0]*(X.rho*nX[0]+t*uX[0])+u[1]*(X.rho*nX[1]+t*uX[1]);
    const a=Math.min(s(HX[0]), s(HX[1])), b=Math.max(s(HX[0]), s(HX[1])); if(Math.min(b, H[1])-Math.max(a, H[0])>=0.5*(H[1]-H[0])) return true; }
  return false; };
// Beide Enden der Huelle tragen eine Ecke mit Senkrechter bis zur Decke (|top - h_c| <= 5 cm, <= 0,3 m vom Ende):
// unabhaengiger Hoehenbeleg fuer kurze Waende (7.1, landmarken 3.4 (10)) [S].
const eckBeleg=(K,W,hR,o)=>{ const H=ivHuelle(W); if(!H || W.nSchluessel<3 && !W.ausEcken) return false; const n=G.wandN(W.phi), u=G.wandU(W.phi), ids=[];
  const ok=[H[0], H[1]].every(s=>{ for(const E of K.ecken.values()){ if(E.rahmen!==W.rahmen || !E.senk || E.top==null || Math.abs(E.top-hR)>DEF.schrank.topTol) continue;
    if(Math.abs(n[0]*E.p[0]+n[1]*E.p[1]-W.rho)<=DEF.ecken.waendeTol && Math.abs(u[0]*E.p[0]+u[1]*E.p[1]-s)<=DEF.schrank.endeTol && !ids.includes(E.id)){ ids.push(E.id); return true; } }
    return false; });
  return ok; };
const klasseVon=W=>W.cls==='wand' && W.hFrei && W.hFrei.lokal ? 'lokal' : W.cls;
G.lmHoehenklasse=(W,karte,o={})=>{ o={...DEF.klasse, ...o}; const K=karte; zustand(K);
  if(W.cls==='schrank') return 'wand';
  if(nutzerKlasse(K, W, DEF.erfassung)) return klasseVon(W);   // rep/erf: Wand mit Erfassung bleibt 'wand'
  const alt=klasseVon(W), hR=hRefC(K, W.rahmen), F=wandFit(K, W, o, false); let roh='unklar';
  if(F){ const H=F.H, hw=(H.hi-H.lo)/2, entsch=hw<=o.halb && !H.rand; W.hFrei={h:H.h, lo:H.lo, hi:H.hi, n:H.n, lokal:!!(W.hFrei && W.hFrei.lokal), rand:H.rand};
    if(hR!=null){ const rd=randDeutung(H, hR, o.halb); W.dChiC=rd.d; const dA=Math.abs(H.h-hR);
      // Z3 (19.2): mit o.wandTol > 0 auch 'wand' bei entschiedener Hoehe |h - hR| <= wandTol und basis >= o.basis (Weg aus rep/m5)
      const eck=eckBeleg(K, W, hR, o), wand=(alt==='wand' ? !(rd.d<o.dchiLoesen || W.basis<o.basisLoesen) : rd.d>=o.dchiSetzen && W.basis>=o.basis) || eck && rd.ab<o.dchiStoer
        || o.wandTol>0 && entsch && W.basis>=o.basis && dA<=o.wandTol;
      const lokal=alt==='lokal' ? entsch && dA>=o.lokalLoesen : entsch && rd.ab>=o.dchiStoer && W.basis>=o.basis && dA>o.lokalSetzen && dA<=o.lokalMax && abschnitteAbw(K, W, F, hR, o)>=o.lokalAb;
      const stoer=entsch && rd.ab>=o.dchiStoer && dA>=o.halb && W.basis>=o.basis;
      roh=wand ? 'wand' : lokal ? 'lokal' : stoer ? 'stoer' : 'unklar'; } }
  const Fu=wandFit(K, W, o, true); if(Fu) W.dChiF=randDeutung(Fu.H, hRefF(K, W.rahmen), o.halb).d;
  if(!F && Fu) roh=alt==='wand' ? 'wand' : 'unklar';
  if(!F && W.ausEcken && hR!=null && eckBeleg(K, W, hR, o)) roh='wand';   // Kurzwand aus Ecken: beide Senkrechten bis zur Decke
  if(roh!=='stoer' && vorhang(K, W, o, hR)) roh='stoer';
  // Durchsicht-Regel 8.3 nur fuer Linien mit >= 0,5 m Beleg (Unterzug, Sturz; kurze Stuecke wie Z-AA 0,16 m sonst falsch [S])
  // und mit entschiedener Hoehe (hFrei, siehe lmDurchblick); Schalter o.unterzug (Z3)
  if(istUnterzug(W, DEF.durchblick, o.unterzug)) roh='unterzug';
  // Hysterese 6.5 auch ab 'kandidat': eine neue Klasse erst nach o.runden gleichen Rohklassen in Folge
  const nx=zustand(K).naechste;
  if(roh===alt){ W.clsZaehler=0; delete nx[W.id]; }
  else { W.clsZaehler=nx[W.id]===roh ? W.clsZaehler+1 : 1; nx[W.id]=roh; if(W.clsZaehler>=o.runden){ setzeKlasse(W, roh); W.clsZaehler=0; delete nx[W.id]; } }
  return klasseVon(W); };
const setzeKlasse=(W,roh)=>{ W.cls=roh==='lokal' ? 'wand' : roh; if(W.hFrei) W.hFrei.lokal=roh==='lokal';
  if(W.cls==='wand') W.zustand=W.zustand==='begrenzt' ? 'begrenzt' : 'bestaetigt'; else if(W.cls==='stoer' || W.cls==='unterzug') W.zustand='kandidat'; };
G.lmSchrankVerdacht=(W,karte,o={})=>{ o={...DEF.schrank, ...o}; const K=karte, hR=hRefC(K, W.rahmen), H=ivHuelle(W), grund=[];
  if(hR==null || !H || istStoer(W)) return {verdacht:false, grund:['ohne Bezug']};
  const n=G.wandN(W.phi), u=G.wandU(W.phi), ende=s=>[W.rho*n[0]+s*u[0], W.rho*n[1]+s*u[1]];
  const senk=[H[0], H[1]].map(s=>{ const p=ende(s); return [...K.ecken.values()].some(E=>E.rahmen===W.rahmen && E.senk && E.top!=null && Math.abs(E.top-hR)<=o.topTol && Math.hypot(E.p[0]-p[0], E.p[1]-p[1])<=o.endeTol); });
  // hinter W: gleiche Seite, Abstand im Bereich, und laengs ueberlappend: die belegten Intervalle von X (Decke iv bzw. Boden)
  // decken >= 50 % der Huelle von W (nicht die Huelle von X: T3 schrank sah L-M links und rechts der Schrankzeile, die
  // Huelle deckte sie ganz)
  const hinter=(X,[a,b],art)=>{ if(X===W || X.rahmen!==W.rahmen || Math.cos(X.phi-W.phi)<Math.cos(5*D2R)) return false; const d=quer(W, X, (H[0]+H[1])/2); if(!(d>=a && d<=b)) return false;
    const IX=(art==='boden' ? X.boden : X.iv) || []; if(!IX.length) return false; const nX=G.wandN(X.phi), uX=G.wandU(X.phi), s=t=>u[0]*(X.rho*nX[0]+t*uX[0])+u[1]*(X.rho*nX[1]+t*uX[1]);
    const P=IX.map(v=>[Math.max(H[0], Math.min(s(v.s0), s(v.s1))), Math.min(H[1], Math.max(s(v.s0), s(v.s1)))]).filter(v=>v[1]>v[0]).sort((p,q)=>p[0]-q[0]); let L=0, e=-Infinity;
    for(const [p,q] of P){ const p2=Math.max(p, e); if(q>p2) L+=q-p2; e=Math.max(e, q); } return L>=0.5*(H[1]-H[0]); };
  // Sockel: eine Bodenlinie 3-10 cm hinter W - eine eigene Landmarke (h 'f' oder mit Boden) oder die Boden-Beob von W selbst,
  // als Linie auf h_f angepasst (Start aus den Daten). Frei in der Hoehe ist die Bodenlinie aus einer Kamerahoehe kaum
  // bestimmt: T3 schrank (Kameras alle 1,45 m, 6,6 m entfernt) frei h 0,007 m, Rueckversatz 1,9 cm; auf h_f aus den Daten
  // gestartet 4,4 cm (rms 0,78 px), von der Front aus gestartet 1,9 cm (rms 0,87 px, Nebenminimum); Wahrheit 5,0 cm [M].
  const eigen=(()=>{ const B=W.beob.map(i=>K.beob[i]).filter(b=>b.art==='boden' && b.schluessel && b.db && b.L===W.id); if(B.length<DEF.boden.minBeob) return null;
    const hF=hRefF(K, W.rahmen), L=G.lmHoehe(B, K, {rahmen:W.rahmen, h:[hF-0.0005, hF+0.0005]}); if(!L) return null;
    const d=quer(W, {phi:L.phi, rho:L.rho}, (H[0]+H[1])/2); return d>=o.sockel[0] && d<=o.sockel[1] && Math.cos(L.phi-W.phi)>=Math.cos(5*D2R); })();
  const sockel=eigen || [...K.waende.values()].some(X=>hinter(X, o.sockel, 'boden') || X.h==='f' && hinter(X, o.sockel, 'iv'));
  const dahinter=[...K.waende.values()].some(X=>hinter(X, o.dahinter, 'iv') && X.cls==='wand' && X.h!=='f');
  if(senk[0] && senk[1]) grund.push('senkrechte'); if(sockel) grund.push('sockel'); if(dahinter) grund.push('wand-dahinter');
  return {verdacht:senk[0] && senk[1] && sockel && !dahinter, grund}; };
// Bodenguete q (6.2): b = groesste Basis einer Bodenlinie, die mit einer Deckenwand derselben Linie gekoppelt ist (gleiche
// Seite, |Δphi| <= 2°, |Δrho| <= 3σ, σ aus den cov, mindestens 1 cm); Kandidaten sind die Boden-Beob der Wand selbst und
// Bodenlinien-Landmarken (h 'f', mit Boden-Beob, oder Stoerer unter 0,3 m) daneben; von mehreren zaehlt die unterste
// (freie Hoehe), damit die Oberkante einer Sockelleiste nicht gewinnt.
G.lmBodenguete=(karte,o={})=>{ o={...DEF.boden, ...o}; const K=karte; let best=null;
  for(const W of K.waende.values()){ if(W.rahmen!==-1 || W.cls!=='wand' || istStoer(W)) continue; const HW=ivHuelle(W); if(!HW) continue; const kand=[];
    const Fw=wandFit(K, W, DEF.klasse, true); if(Fw && Fw.R.length>=o.minBeob) kand.push(Fw);
    for(const X of K.waende.values()){ if(X===W || X.rahmen!==-1 || Math.cos(X.phi-W.phi)<Math.cos(2*D2R)) continue;
      const d=quer(W, X, (HW[0]+HW[1])/2), sig=Math.sqrt(Math.max(1e-4, (W.cov ? W.cov[2] : 0)+(X.cov ? X.cov[2] : 0))); if(Math.abs(d)>3*sig) continue;
      const F=X.h==='f' || (X.boden||[]).length ? wandFit(K, X, DEF.klasse, true) : typeof X.h==='number' && X.h<0.3 ? wandFit(K, X, DEF.klasse, false) : null;
      if(F && F.R.length>=o.minBeob) kand.push(F); }
    if(!kand.length) continue; const F=kand.reduce((a,c)=>c.H.h<a.H.h ? c : a);
    const nx=Math.cos(W.phi), nz=Math.sin(W.phi), Q=F.R.map(z=>nx*z.c[0]+nz*z.c[2]), b=Math.max(...Q)-Math.min(...Q); if(best && b<=best.b) continue;
    const dchi=(F.H.prof(hRefF(K, -1))-F.H.c0)/F.H.s2; best={b, p:1/(1+Math.exp((dchi-4)/2)), dchi, wand:W.id, h:F.H.h}; }
  return best ? {q:Math.min(1, best.b/o.bMax)*best.p, ...best} : {q:0, b:0, p:0, dchi:NaN, wand:null, h:NaN}; };

// ------------------------------------------------ Ecken (Senkrechte, landmarken 3.4 (10))
const peilungen=(bild,K,o)=>{ const S=G.KG.SEG, pp=ppAn(K), c=[bild.camTo[12], bild.camTo[13], bild.camTo[14]], out=[], kor=d=>pp ? ppKorr(d, bild.camTo, bild.f, pp) : d;
  (bild.senk||[]).forEach((v,j)=>{ if(!v || !v.top) return; const rt=G.ray(bild.proj, bild.camTo, v.top[0], v.top[1]), rb=v.bottom ? G.ray(bild.proj, bild.camTo, v.bottom[0], v.bottom[1]) : null; if(!rt) return;
    const ob=kor(rt.d), un=rb ? kor(rb.d) : null; out.push({i:-2-j, c, al:Math.atan2(ob[2], ob[0]), oben:ob, unten:un, roh:[rt.d, rb ? rb.d : null], konkav:v.konkav, senk:true, len:v.len||0}); });
  const D=bild.dir;
  for(let i=0;i<bild.n;i++){ if(bild.cls[i]!==G.KG.KL.V || !(bild.seg[i*S+9]>=o.minPx)) continue;
    const a=[D[6*i], D[6*i+1], D[6*i+2]], b=[D[6*i+3], D[6*i+4], D[6*i+5]], ka=kor(a), kb=kor(b), al=Math.atan2(ka[2]+kb[2], ka[0]+kb[0]);
    if(out.some(x=>x.senk && Math.abs(wrap(x.al-al))<0.5*D2R)) continue;
    const ob=a[1]>=b[1]; out.push({i, c, al, oben:ob ? ka : kb, unten:ob ? kb : ka, roh:ob ? [a, b] : [b, a], konkav:null, senk:false, len:bild.seg[i*S+9]}); }
  return out; };
// Schnittpunkt von Peilungen (Plan): kleinste Quadrate der Querabstaende, Gewicht 1/(σ_α·Abstand)² (zweiter Durchgang
// mit den Abstaenden des ersten), Kovarianz in m².
const lsPunkt=Q=>{ let P=null;
  for(let it=0;it<2;it++){ let a=0, b=0, d=0, e=0, f=0;
    for(const q of Q){ const nx=-Math.sin(q.al), nz=Math.cos(q.al), dist=P ? Math.max(0.3, Math.hypot(P[0]-q.c[0], P[1]-q.c[2])) : 1, w=1/Math.pow(q.sig*dist, 2), r=nx*q.c[0]+nz*q.c[2];
      a+=w*nx*nx; b+=w*nx*nz; d+=w*nz*nz; e+=w*nx*r; f+=w*nz*r; }
    const det=a*d-b*b; if(!(det>1e-12)) return null; P=[(d*e-b*f)/det, (a*f-b*e)/det]; if(it===1) return {p:P, cov:[d/det, -b/det, a/det]}; } };
// groesster Winkel zwischen zwei Azimuten (|a - b| auf (-π, π] gewickelt, ohne Winkelfunktionen); mit grenze endet die Suche,
// sobald er erreicht ist (Vergleich '>= grenze' bleibt gleich)
const bogen=(az,grenze=Infinity)=>{ let bog=0; for(let i=0;i<az.length;i++) for(let j=i+1;j<az.length;j++){ const d=Math.abs(az[i]-az[j]), w=d>Math.PI ? ZWEIPI-d : d;
  if(w>bog){ bog=w; if(bog>=grenze) return bog; } } return bog; };
const sigMax=C=>{ const t=(C[0]+C[2])/2, q=Math.sqrt(Math.max(0, (C[0]-C[2])*(C[0]-C[2])/4+C[1]*C[1])); return Math.sqrt(Math.max(0, t+q)); };
const freiSektor=A=>{ if(!A.length) return []; const s=[...A].map(wrap2pi).sort((x,y)=>x-y); let gi=s.length-1, gl=s[0]+ZWEIPI-s[s.length-1];
  for(let i=0;i+1<s.length;i++) if(s[i+1]-s[i]>gl){ gl=s[i+1]-s[i]; gi=i; }
  const a0=s[(gi+1)%s.length], a1=s[gi]; return [[wrap(a0), wrap(a0)+wrap2pi(a1-a0)]]; };
// Peilungen aus G.verticalEdges tragen Beob.i = -2 - j (j Index in bildErg.senk; -1 ist die Erfassung),
// V-Segmente ihren Segmentindex. Nur die ersten geben top. Stimmen konkav/konvex je Ecke in spuren.stimmen.
const eckeAktualisieren=(K,E,o)=>{ const tops=[], az=[], st=zustand(K), kon=(st.stimmen && st.stimmen[E.id]) || [0, 0]; let n=0;
  for(const id of E.beob){ const b=K.beob[id]; if(b.L!==E.id) continue; const g=gZu(K, E.rahmen, b.ab, b.t); if(!g) continue; const Z=strahlen(K, b, g), c=Z.c; n++;
    az.push(Math.atan2(c[2]-E.p[1], c[0]-E.p[0]));
    if(b.i<=-2){ const dp=Math.hypot(Z.da[0], Z.da[2]), dist=Math.hypot(E.p[0]-c[0], E.p[1]-c[2]); if(dp>1e-6) tops.push(c[1]+Z.da[1]*dist/dp); } }
  E.nPeil=n; E.frei=freiSektor(az); if(tops.length){ E.senk=true; E.top=median(tops); }
  E.art=kon[0]+kon[1]>=2 ? (kon[0]>kon[1] ? 'konkav' : kon[1]>kon[0] ? 'konvex' : 'unklar') : E.art;
  eckWaende(K, E, o); };
const stimme=(K,E,konkav)=>{ if(konkav!==true && konkav!==false) return; const st=zustand(K); st.stimmen=st.stimmen || {};
  const v=st.stimmen[E.id] || (st.stimmen[E.id]=[0, 0]); v[konkav ? 0 : 1]++; };
// Waende an der Ecke: Linie <= waendeTol neben p, Ecke <= endeTol vom Ende der Huelle, Winkel >= winkel
const eckWaende=(K,E,o)=>{ const C=[];
  for(const W of K.waende.values()){ if(W.rahmen!==E.rahmen || istStoer(W)) continue; const n=G.wandN(W.phi), u=G.wandU(W.phi), d=Math.abs(n[0]*E.p[0]+n[1]*E.p[1]-W.rho); if(d>o.waendeTol) continue;
    const H=ivHuelle(W); if(!H) continue; const s=u[0]*E.p[0]+u[1]*E.p[1]; if(Math.min(Math.abs(s-H[0]), Math.abs(s-H[1]))>o.endeTol) continue; C.push({W, d}); }
  let best=null; for(let i=0;i<C.length;i++) for(let j=i+1;j<C.length;j++){ if(Math.abs(Math.sin(C[i].W.phi-C[j].W.phi))<Math.sin(o.winkel*D2R)) continue;
    const q=C[i].d+C[j].d; if(!best || q<best.q) best={q, a:C[i].W, b:C[j].W}; }
  const alt=E.waende; E.waende=best ? [best.a.id, best.b.id].sort((x,y)=>x-y) : null;
  if(alt) for(const id of alt){ const W=K.waende.get(id); if(W && !(E.waende||[]).includes(id)) W.ecken=W.ecken.filter(x=>x!==E.id); }
  if(E.waende) for(const id of E.waende){ const W=K.waende.get(id); if(W && !W.ecken.includes(E.id)) W.ecken=[...W.ecken, E.id]; } };
const eckBeob=(K,E,P,bild,ab)=>{ const b=beobNeu(K, {k:bild.k, t:bild.t, ab, ep:bild.ep, i:P.i, art:'ecke', L:E.id, c:P.c, da:P.roh[0], db:P.roh[1] || P.roh[0], sPx:DEF.ecken.sigPx, f:bild.f, len:P.len, nSeg:1});
  stimme(K, E, P.konkav);
  let v=null; for(let j=E.beob.length-1;j>=0;j--){ const x=K.beob[E.beob[j]]; if(x.schluessel && x.ab===ab){ v=x; break; } }
  b.schluessel=!v || Math.hypot(b.c[0]-v.c[0], b.c[2]-v.c[2])>=DEF.ecken.dP || Math.abs(wrap(Math.atan2(b.da[2], b.da[0])-Math.atan2(v.da[2], v.da[0])))>=DEF.ecken.dWinkelDeg*D2R || P.senk;
  E.beob.push(b.id); return b; };
G.lmEcken=(bildErg,karte,o={})=>{ o={...DEF.ecken, ...o}; const K=karte, bild=bildErg, st=zustand(K), ab=abVon(K, bild, o), r=rahmenVon(K, ab), A=K.abschnitte[ab];
  const g=r===-1 ? G.gBei(A, bild.t) : EINS; if(!g) return {zugeordnet:0, neu:0};
  const hC0=hRefC(K, r), hRb=hC0==null ? null : r===-1 ? hC0-g.ty : hC0;   // Deckenhoehe im Bezug des Bilds
  const P=peilungen(bild, K, o), Ec=[...K.ecken.values()].filter(E=>E.rahmen===r), sigA=o.sigPx/bild.f, offen=[]; let zu=0, neu=0;
  for(const p of P){ const cF=g===EINS ? p.c : G.gAnw(g, p.c), al=p.al+g.psi; let best=null, zweit=null;
    for(const E of Ec){ const dx=E.p[0]-cF[0], dz=E.p[1]-cF[2], dist=Math.hypot(dx, dz); if(dist<o.minAbst) continue;
      const sp=E.cov ? sigMax(E.cov) : 0.03, sig=Math.hypot(sigA, sp/dist), q=Math.abs(wrap(al-Math.atan2(dz, dx)))/sig;
      if(q<3){ if(!best || q<best.q){ zweit=best; best={E, q}; } else if(!zweit || q<zweit.q) zweit={E, q}; } }
    if(best && !(zweit && zweit.q-best.q<1)){ eckBeob(K, best.E, p, bild, ab); eckeAktualisieren(K, best.E, o); zu++; }
    else if(!best) offen.push(p); }
  // offene Peilungen: Peilspuren ueber Folgebilder desselben Abschnitts (Bezug B_ab). Folge: Azimut der Spur, ab 3
  // Peilungen mit Bogen >= 2° aus ihrem Schnittpunkt vorhergesagt (3σ + 0,3°), sonst letzter Azimut ± 2,5° [S].
  // Eine Spur ist eine Kante im Bild. Eine Ecke entsteht aus einer Spur oder aus zwei Spuren (auch zeitlich getrennt,
  // <= maxAlter s), deren Peilungen sich gemeinsam schneiden (alle Reste <= 3σ, Bogen >= 5°, >= 3 Standpunkte, obere
  // Enden <= 10 cm gestreut). Vorher schnitten sich Peilungen verschiedener Ecken (F4 hoehe: 15 falsche Ecken, gemessen).
  st.peil=st.peil.filter(tr=>tr.ab===ab && bild.t-tr.obs[tr.obs.length-1].t<=o.maxAlter);
  const kand=[];
  for(const tr of st.peil){ if(bild.k-tr.kLetzt>o.lueckeK) continue; const P0=tr.p, last=tr.obs[tr.obs.length-1];
    for(const p of offen){ let pred=last.al, tol=o.folgeDeg*D2R;
      if(tr.obs.length>=2 && !P0){ const v=tr.obs[tr.obs.length-2], dk=Math.max(1, last.k-v.k); pred=last.al+wrap(last.al-v.al)*(bild.k-last.k)/dk; tol=o.folge2Deg*D2R; }
      if(P0){ const dist=Math.hypot(P0[0]-p.c[0], P0[1]-p.c[2]); if(dist<o.minAbst) continue; pred=Math.atan2(P0[1]-p.c[2], P0[0]-p.c[0]); tol=3*Math.hypot(sigA, 0.02/dist)+0.3*D2R; }
      const d=Math.abs(wrap(p.al-pred)); if(d<=tol) kand.push({tr, p, d}); } }
  kand.sort((a,b)=>a.d-b.d || a.p.i-b.p.i || a.tr.id-b.tr.id);
  const vT=new Set(), vP=new Set();
  for(const k of kand){ if(vT.has(k.tr) || vP.has(k.p)) continue; vT.add(k.tr); vP.add(k.p); k.tr.obs.push({...k.p, ab, t:bild.t, k:bild.k, ep:bild.ep, f:bild.f}); k.tr.kLetzt=bild.k; }
  for(const p of offen) if(!vP.has(p)){ st.eckSpurId=(st.eckSpurId||0)+1; const tr={id:st.eckSpurId, ab, kLetzt:bild.k, p:null, bog:0, obs:[{...p, ab, t:bild.t, k:bild.k, ep:bild.ep, f:bild.f}]}; st.peil.push(tr); vT.add(tr); }
  const pruef=(Q,paar)=>{ if(Q.length<o.minPeilNeu) return null; const L=lsPunkt(Q.map(x=>({c:x.c, al:x.al, sig:sigA}))); if(!L) return null;
    const az=Q.map(x=>Math.atan2(x.c[2]-L.p[1], x.c[0]-L.p[0])), bog=bogen(az, o.minBogenDeg*D2R);
    if(bog<o.minBogenDeg*D2R || standpunkte(Q.map(x=>[x.c[0], x.c[2]]), o.basis, o.minStand)<o.minStand || sigMax(L.cov)>o.maxSigma) return null;
    if(Q.some(x=>{ const dist=Math.hypot(L.p[0]-x.c[0], L.p[1]-x.c[2]); return dist<o.minAbst || Math.abs(wrap(x.al-Math.atan2(L.p[1]-x.c[2], L.p[0]-x.c[0])))>3*Math.hypot(sigA, 0.01/dist); })) return null;
    const tp=Q.filter(x=>x.senk).map(x=>{ const dp=Math.hypot(x.oben[0], x.oben[2]); return x.c[1]+x.oben[1]*Math.hypot(L.p[0]-x.c[0], L.p[1]-x.c[2])/dp; });
    return tp.length<2 || Math.max(...tp)-Math.min(...tp)<=(paar ? o.topSpannePaar : o.topSpanne) ? L : null; };
  const weg=new Set(), lsM=new Map(), lsF=tr=>{ if(!lsM.has(tr)) lsM.set(tr, lsPunkt(tr.obs.map(x=>({c:x.c, al:x.al, sig:sigA})))); return lsM.get(tr); };
  for(const tr of [...st.peil].sort((a,b)=>a.id-b.id)){ if(weg.has(tr) || !vT.has(tr)) continue; const Q=tr.obs;
    if(Q.length>=3){ const L=lsPunkt(Q.map(x=>({c:x.c, al:x.al, sig:sigA}))), az=L ? Q.map(x=>Math.atan2(x.c[2]-L.p[1], x.c[0]-L.p[0])) : [], bog=bogen(az); tr.bog=bog; tr.p=L && bog>=o.minWinkelDeg*D2R ? L.p : null; }
    let best=null; const L1=pruef(Q); if(L1) best={L:L1, mit:null};
    // zwei Spuren nur, wenn jede fuer sich einen Schnittpunkt hat (Bogen >= 2°) und beide Punkte zusammenpassen
    // (<= 3σ und <= 15 cm): sonst verbanden sich Peilungen zweier Ecken, die von einem Standort aus in einer Flucht liegen.
    // Je Spur gilt statt des eigenen Punkts auch: >= 2 Senkrechte, deren Oberkanten am gemeinsamen Punkt <= topPaar an der
    // Deckenhoehe des Rahmens liegen (der falsche Schnittpunkt zweier Ecken verschiebt die Oberkante mit dem Abstand, h - c_y
    // ≈ 0,9 m: 5 cm sind ≈ 5 % Abstand). Ohne das fehlte auf F4 rund die Ecke V (Spuren aus 2-4 m mit Bogen 2,7° bzw. 0,7°,
    // eigener Punkt > 15 cm daneben; gemeinsam 0,5 cm an der Wahrheit, Oberkanten 2,417/2,418 m) [M].
    // Vorpruefung ohne Aenderung des Ergebnisses: kann keine der Spuren die Oberkanten nutzen und haben beide einen Punkt,
    // muessen beide <= spurPaar am gemeinsamen Punkt liegen, also <= 2·spurPaar auseinander. o.voll: ohne (Pruefung).
    const P1=tr.p ? lsF(tr) : null, nahP=(P,X)=>!P || Math.hypot(P.p[0]-X.p[0], P.p[1]-X.p[1])<=Math.min(o.spurPaar, 3*sigMax(P.cov)+0.02);
    const topsAn=(trk,X)=>{ if(hRb==null) return false; let n=0; for(const x of trk.obs){ if(!x.senk) continue; const dp=Math.hypot(x.oben[0], x.oben[2]);
      if(!(Math.abs(x.c[1]+x.oben[1]*Math.hypot(X.p[0]-x.c[0], X.p[1]-x.c[2])/dp-hRb)<=o.topPaar)) return false; n++; } return n>=2; };
    const kannTop=trk=>hRb!=null && trk.obs.filter(x=>x.senk).length>=2;
    if(!best && Q.length>=3) for(const tr2 of st.peil){ if(tr2===tr || weg.has(tr2) || tr2.obs.length<3 || !tr.p && !tr2.p) continue;
      if(P1 && tr2.p && !o.voll && !kannTop(tr) && !kannTop(tr2)){ const P2=lsF(tr2); if(P2 && Math.hypot(P1.p[0]-P2.p[0], P1.p[1]-P2.p[1])>2*o.spurPaar) continue; }
      const L2=pruef([...Q, ...tr2.obs], true); if(!L2) continue; const P2=tr2.p ? lsF(tr2) : null;
      if((nahP(P1, L2) || topsAn(tr, L2)) && (nahP(P2, L2) || topsAn(tr2, L2))){ best={L:L2, mit:tr2}; break; } }
    if(!best) continue;
    const Qa=best.mit ? [...Q, ...best.mit.obs] : Q, L=best.L, pF=g===EINS ? L.p : G.gPlan(g, L.p);
    const E={id:neueId(K, 'e'), rahmen:r, p:pF, cov:g===EINS ? L.cov : dreheCov(L.cov, g.psi), art:'unklar', waende:null, beob:[], frei:[], senk:false, top:null, nPeil:0};
    K.ecken.set(E.id, E); Ec.push(E);
    for(const x of Qa.sort((a,b)=>a.t-b.t || a.i-b.i)) eckBeob(K, E, x, {k:x.k, t:x.t, ep:x.ep, f:x.f}, ab);
    eckeAktualisieren(K, E, o); neu++; weg.add(tr); if(best.mit) weg.add(best.mit); }
  st.peil=st.peil.filter(tr=>!weg.has(tr) && tr.obs.length<o.maxSpur); if(st.peil.length>o.maxPeil) st.peil=st.peil.slice(st.peil.length-o.maxPeil);
  kurzwaende(K, r, o);
  return {zugeordnet:zu, neu}; };
// Kurze Wand aus zwei Ecken (10.4: V-W 0,166 m und H-G 0,175 m geben als Kante kaum Segmente; F4 rund: 5 bzw. 7 in 1800
// Bildern [M]): zwei Ecken des Rahmens mit senk und top <= topPaar an der Deckenhoehe, kurzMin..kurzMax auseinander, je
// ohne Wandpaar (waende null) und mit genau einer anliegenden Wand (Linie <= waendeTol, Ende <= endeTol), die >= kurzWinkel
// zur Verbindung steht; keine Wand liegt schon auf der Verbindung. Neue Wand h 'c' ohne Beob mit ausEcken = [E1, E2];
// iv ist die Verbindung (folgt den Ecken, lmIntervalle); beide Ecken fuehren sie danach in waende, so dass M6 sie ueber die
// Senkrechten beider Ecken (p = Schnitt der Waende) fuehrt. Normale zur Seite der Kameras, die die Ecken peilten.
const anliegend=(K,E,o)=>{ const C=[];
  for(const W of K.waende.values()){ if(W.rahmen!==E.rahmen || istStoer(W)) continue; const n=G.wandN(W.phi), u=G.wandU(W.phi);
    if(Math.abs(n[0]*E.p[0]+n[1]*E.p[1]-W.rho)>o.waendeTol) continue; const H=ivHuelle(W); if(!H) continue; const sx=u[0]*E.p[0]+u[1]*E.p[1];
    if(Math.min(Math.abs(sx-H[0]), Math.abs(sx-H[1]))<=o.endeTol) C.push(W); }
  return C; };
const kurzIv=(K,W)=>{ const E=W.ausEcken.map(id=>K.ecken.get(id)); if(E.some(x=>!x)) return null; const u=G.wandU(W.phi), a=u[0]*E[0].p[0]+u[1]*E[0].p[1], b=u[0]*E[1].p[0]+u[1]*E[1].p[1];
  return {s0:Math.min(a, b), s1:Math.max(a, b), n:0, bilder:0, t0:NaN, t1:NaN, beidseits:false, ring:W.iv && W.iv.length ? W.iv[0].ring : -1}; };
const kurzwaende=(K,r,o)=>{ const hR=hRefC(K, r); if(hR==null) return 0; let n=0;
  const Ec=[...K.ecken.values()].filter(E=>E.rahmen===r && E.senk && E.top!=null && Math.abs(E.top-hR)<=o.topPaar && !E.waende);
  const quer=(W,ex,ez)=>{ const u=G.wandU(W.phi); return Math.abs(u[0]*ez-u[1]*ex); };
  for(let i=0;i<Ec.length;i++) for(let j=i+1;j<Ec.length;j++){ const A=Ec[i], B=Ec[j]; if(A.waende || B.waende) continue;
    const dx=B.p[0]-A.p[0], dz=B.p[1]-A.p[1], L=Math.hypot(dx, dz); if(L<o.kurzMin || L>o.kurzMax) continue; const ex=dx/L, ez=dz/L;
    const WA=anliegend(K, A, o), WB=anliegend(K, B, o); if(WA.length!==1 || WB.length!==1 || WA[0]===WB[0]) continue;
    if(quer(WA[0], ex, ez)<Math.sin(o.kurzWinkel*D2R) || quer(WB[0], ex, ez)<Math.sin(o.kurzWinkel*D2R)) continue;
    if([...K.waende.values()].some(W=>W.rahmen===r && quer(W, ex, ez)<Math.sin(10*D2R) && [A, B].every(E=>Math.abs(G.wandN(W.phi)[0]*E.p[0]+G.wandN(W.phi)[1]*E.p[1]-W.rho)<=o.waendeTol))) continue;
    let nx=-ez, nz=ex, sd=0;
    for(const E of [A, B]) for(const id of E.beob){ const b=K.beob[id]; if(b.L!==E.id) continue; const g=gZu(K, r, b.ab, b.t); if(!g) continue; const c=g===EINS ? b.c : G.gAnw(g, b.c);
      sd+=nx*(c[0]-A.p[0])+nz*(c[2]-A.p[1]); }
    if(!(sd!==0)) continue; if(sd<0){ nx=-nx; nz=-nz; }
    const W=wandNeu(K, {rahmen:r, phi:wrap2pi(Math.atan2(nz, nx)), rho:nx*A.p[0]+nz*A.p[1], cov:null, h:'c'}); W.ausEcken=[A.id, B.id]; W.iv=[kurzIv(K, W)];
    K.waende.set(W.id, W); aend(K, r); eckWaende(K, A, o); eckWaende(K, B, o); n++; }
  return n; };
const dreheCov=(C,psi)=>{ const c=Math.cos(psi), s=Math.sin(psi), [xx,xz,zz]=C; return [c*c*xx-2*c*s*xz+s*s*zz, c*s*(xx-zz)+(c*c-s*s)*xz, s*s*xx+2*c*s*xz+c*c*zz]; };

// ------------------------------------------------ Atlas: Einbinden, Neu-Zuordnen (0 Punkt 2, 3.2.2)
// Lokale Wand B_ab -> F0 mit g: phi' = phi + psi, rho' = rho + n'·t, s' = s + u'·t, Hoehen + ty.
const umrechnen=(W,g)=>{ const phi=wrap2pi(W.phi+g.psi), n=G.wandN(phi), u=G.wandU(phi), a=n[0]*g.tx+n[1]*g.tz, b=u[0]*g.tx+u[1]*g.tz;
  W.phi=phi; W.rho+=a; if(W.cov) W.cov=[W.cov[0], W.cov[1]+b*W.cov[0], W.cov[2]+2*b*W.cov[1]+b*b*W.cov[0]];
  const sv=x=>({...x, s0:x.s0+b, s1:x.s1+b}); W.iv=(W.iv||[]).map(sv); W.boden=(W.boden||[]).map(sv); W.durchblick=(W.durchblick||[]).map(([p,q])=>[p+b, q+b]);
  W.sSchwer+=b; if(typeof W.h==='number') W.h+=g.ty; if(W.hLokal) W.hLokal={...W.hLokal, h:W.hLokal.h+g.ty, lo:W.hLokal.lo+g.ty, hi:W.hLokal.hi+g.ty};
  if(W.hFrei) W.hFrei={...W.hFrei, h:W.hFrei.h+g.ty, lo:W.hFrei.lo+g.ty, hi:W.hFrei.hi+g.ty}; };
G.lmEinbinden=(karte,ab)=>{ const K=karte, A=K.abschnitte[ab], g=A && A.g, neu=[], zusammen=[], st=zustand(K); if(!g) return {neu, zusammen, ty0:null};
  // v3: beim Einbinden ist K = 1 (gBei = g)
  const glob=[...K.waende.values()].filter(W=>W.rahmen===-1), lok=[...K.waende.values()].filter(W=>W.rahmen===ab).sort((a,b)=>a.id-b.id);
  aend(K); for(const W of lok){ umrechnen(W, g); W.rahmen=-1; }
  const o=DEF.zusammen;
  for(const W of lok){ let best=null; for(const X of glob){ if(!zusammenPruef(W, X, o)) continue; const H=ivHuelle(W), q=Math.abs(quer(W, X, H ? (H[0]+H[1])/2 : 0)); if(!best || q<best.q) best={X, q}; }
    if(best){ verschmelzen(K, best.X, W); zusammen.push([W.id, best.X.id]); } else { neu.push(W.id); G.lmIntervalle(W, K); } }
  for(const E of [...K.ecken.values()].filter(E=>E.rahmen===ab).sort((a,b)=>a.id-b.id)){ E.p=G.gPlan(g, E.p); if(E.cov) E.cov=dreheCov(E.cov, g.psi); if(E.top!=null) E.top+=g.ty;
    E.frei=(E.frei||[]).map(([a,b])=>[a+g.psi, b+g.psi]); E.rahmen=-1;
    const X=[...K.ecken.values()].find(F=>F!==E && F.rahmen===-1 && Math.hypot(F.p[0]-E.p[0], F.p[1]-E.p[1])<=DEF.ecken.waendeTol);
    if(X){ for(const id of E.beob) K.beob[id].L=X.id; X.beob=[...X.beob, ...E.beob].sort((a,b)=>a-b); K.ecken.delete(E.id);
      for(const W of K.waende.values()) if(W.ausEcken) W.ausEcken=W.ausEcken.map(i=>i===E.id ? X.id : i);
      const sv=st.stimmen || {}; if(sv[E.id]){ const v=sv[X.id] || (sv[X.id]=[0, 0]); v[0]+=sv[E.id][0]; v[1]+=sv[E.id][1]; delete sv[E.id]; } eckeAktualisieren(K, X, DEF.ecken); }
    else eckeAktualisieren(K, E, DEF.ecken); }
  const ty0=Number.isFinite(K.hC) && A.hLok && Number.isFinite(A.hLok.hC) ? K.hC-A.hLok.hC : null;
  return {neu, zusammen, ty0}; };
// Stand eines Abschnitts fuer lmNeuZuordnen: Rahmen, g, alle Knoten-d und die mittlere Kamera des Abschnitts (Bezug).
// Geaendert heisst: anderer Rahmen, andere Knotenzahl, oder g bzw. ein Knoten (gKomp(g, d_j)) verschiebt die mittlere
// Kamera um > dP, dreht um > dPsi oder hebt um > dP (v3: g ODER ein Knoten d_j, 4).
const knotD=A=>{ const K=A.knoten; if(!K) return []; if(Array.isArray(K)) return K.map(x=>[x.d[0], x.d[1], x.d[2], x.d[3]]);
  const n=Math.min((K.t||[]).length, Math.floor((K.d||[]).length/4)), out=[]; for(let j=0;j<n;j++) out.push([K.d[4*j], K.d[4*j+1], K.d[4*j+2], K.d[4*j+3]]); return out; };
const nKnoten=A=>!A.knoten ? 0 : Array.isArray(A.knoten) ? A.knoten.length : Math.min((A.knoten.t||[]).length, Math.floor((A.knoten.d||[]).length/4));
const stand=(K,ab)=>{ const A=K.abschnitte[ab], r=rahmenVon(K, ab); if(!A) return {r, nK:0, g:null, d:[], cm:[0, 0]};
  let x=0, z=0, n=0; for(const B of K.bilder.values()) if(B.ab===ab){ x+=B.c[0]; z+=B.c[2]; n++; }
  return {r, nK:nKnoten(A), g:A.g ? {psi:A.g.psi, tx:A.g.tx, ty:A.g.ty, tz:A.g.tz} : null, d:knotD(A), cm:n ? [x/n, z/n] : [0, 0]}; };
const geaendert=(K,ab,alt,o)=>{ const A=K.abschnitte[ab], r=rahmenVon(K, ab); if(alt.r!==r || (alt.nK||0)!==nKnoten(A)) return true; if(r!==-1) return false;
  if(!alt.g || !A.g) return true; const dN=knotD(A), L=Math.max(1, dN.length), D=v=>v ? {psi:v[0], tx:v[1], ty:v[2], tz:v[3]} : EINS;
  for(let j=0;j<L;j++){ const ga=G.gKomp(alt.g, D(alt.d[j])), gb=G.gKomp(A.g, D(dN[j])), pa=G.gPlan(ga, alt.cm), pb=G.gPlan(gb, alt.cm);
    if(Math.hypot(pa[0]-pb[0], pa[1]-pb[1])>o.dP || Math.abs(wrap(ga.psi-gb.psi))>o.dPsiDeg*D2R || Math.abs(ga.ty-gb.ty)>o.dP) return true; }
  return false; };
// Rest gespeicherter Beob gegen eine Wand: G.resSegment (M6), sonst dieselbe Formel hier
const resB=(K,b,W)=>{ if(G.resSegment) return G.resSegment(b, W, K); const g=gZu(K, W.rahmen, b.ab, b.t); if(!g) return null; const Z=strahlen(K, b, g), h=hBeob(b, W, K), nx=Math.cos(W.phi), nz=Math.sin(W.phi);
  return [rest(Z.c, Z.da, nx, nz, W.rho, h, b.f), rest(Z.c, Z.db, nx, nz, W.rho, h, b.f)]; };
G.lmNeuZuordnen=(karte,ab,o={})=>{ o={...DEF.zuordnen, ...DEF.neu, ...o}; const K=karte, st=zustand(K), A=K.abschnitte[ab]; if(!A) return {geaendert:0};
  const alt=st.zuord[ab]; if(alt && !o.immer && !geaendert(K, ab, alt, o)) return {geaendert:0, verfallen:0};
  const jetzt=stand(K, ab); st.zuord[ab]=jetzt; const r=jetzt.r, P=bereitAlle(K, r), Ec=[...K.ecken.values()].filter(E=>E.rahmen===r); let n=0;
  for(const b of K.beob){ if(b.ab!==ab) continue;
    if(b.art==='ecke'){ const g=gZu(K, r, ab, b.t); let L=-1; if(g){ const Z=strahlen(K, b, g), al=Math.atan2(Z.da[2], Z.da[0]); let best=null;
        for(const E of Ec){ const dx=E.p[0]-Z.c[0], dz=E.p[1]-Z.c[2], dist=Math.hypot(dx, dz); if(dist<DEF.ecken.minAbst) continue;
          const sp=E.cov ? Math.sqrt(Math.max(E.cov[0], E.cov[2], 0)) : 0.03, q=Math.abs(wrap(al-Math.atan2(dz, dx)))/Math.hypot(DEF.ecken.sigPx/b.f, sp/dist);
          if(q<3 && (!best || q<best.q)) best={E, q}; }
        if(best) L=best.E.id; }
      if(L!==b.L){ n++; b.L=L; } continue; }
    // rep/erf: Erfassung mit eigener Regel; die bisherige Wand gewinnt, solange sie das Tor besteht. Stoer-Erfassungen
    // (nutzer 'stoer', Z2) gehen wie Segment-Beob ueber den Weg darunter.
    if(b.nutzer===true){
      const Zs=erfStrahlen(K, b, r), Z=Zs && erfLinie(K, Zs.c, Zs.da, Zs.db, r, DEF.erfassung), X=K.waende.get(b.L);
      const bleibt=Z && X && X.rahmen===r && erfSuche(K, Z, r, {...DEF.erfassung, nur:X}), z=bleibt || (Z && erfSuche(K, Z, r, DEF.erfassung)), L=z ? z.W.id : -1;
      if(L!==b.L){ n++; b.L=L; } continue; }
    const g=gZu(K, r, ab, b.t); let L=-1, art=b.art;
    if(g && b.db){ const Z=strahlen(K, b, g), e=entscheide(kandidaten(K, {c:Z.c, d1:Z.da, d2:Z.db, sPx:b.sPx, len:b.len, f:b.f}, P, o, A), o);
      // Endpruefung mit dem Rest von M6 (G.resSegment), gleiches Band wie in der Zuordnung
      if(e && !e.mehrdeutig){ const rr=resB(K, {...b, art:e.art}, e.p.W); if(rr && (rr[0]*rr[0]+rr[1]*rr[1])/(b.sPx*b.sPx+e.sp*e.sp)<o.chi2){ L=e.L; art=e.art; } } }
    if(L!==b.L || art!==b.art){ n++; b.L=L; b.art=art; } }
  let verfallen=0;
  if(o.immer){ let tJ=-Infinity; for(const b of K.beob) if(b.t>tJ) tJ=b.t;
    const alt=(X,f)=>{ let t=-Infinity, k=0; for(const id of X.beob){ const b=K.beob[id]; if(b.L!==X.id || (b.art==='ecke')!==f) continue; if(b.t>t) t=b.t; if(b.schluessel) k++; } return {t, k}; };
    for(const W of K.waende.values()){ if(W.rahmen!==r || nutzerZahl(K, W)) continue; const a=alt(W, false); if(a.k<o.minSchl && tJ-a.t>o.verfall){ for(const id of W.beob) if(K.beob[id].L===W.id){ K.beob[id].L=-1; n++; } verfallen++; } }
    for(const E of K.ecken.values()){ if(E.rahmen!==r) continue; const a=alt(E, true); if(E.beob.length<o.minPeil && tJ-a.t>o.verfall){ for(const id of E.beob) if(K.beob[id].L===E.id){ K.beob[id].L=-1; n++; } verfallen++; } } }
  if(n){ aend(K); for(const W of K.waende.values()) W.beob=[]; for(const E of K.ecken.values()) E.beob=[];
    for(const b of K.beob){ if(b.L<0) continue; const X=b.art==='ecke' ? K.ecken.get(b.L) : K.waende.get(b.L); if(X) X.beob.push(b.id); else b.L=-1; }
    for(const W of [...K.waende.values()]){ if(!W.beob.length && !(W.ausEcken && W.ausEcken.every(id=>K.ecken.has(id)))){ K.waende.delete(W.id); naechsteWeg(K, W.id); for(const E of K.ecken.values()) if(E.waende && E.waende.includes(W.id)) E.waende=null; continue; } G.lmIntervalle(W, K); }
    for(const E of [...K.ecken.values()]){ if(!E.beob.length) K.ecken.delete(E.id); else eckeAktualisieren(K, E, DEF.ecken); } }
  return {geaendert:n, verfallen}; };

// ------------------------------------------------ Erfassungen (Fadenkreuz, nutzer; Vorschlag rep/erf zu 3.3/4)
// G.lmErfassung(karte, bildErg /*n = 1, erfassung {id, nutzer, urteil}*/, o = {ab, erfassung}) -> {zugeordnet, neu, L, grund}
// (Vertrag ARCHITEKTUR 19.2 Z1/Z2, 19.3: urteil = obs.final der App oder null; o.erfassung ueberschreibt DEF.erfassung)
// Eine Erfassung ist eine vom Nutzer gezeigte Wand-Decke-Kante (die App hat sie schon als solche geprueft). Sie geht
// NICHT ueber Kandidatenspuren (lmSpuren): eine Spur braucht >= 5 pixelstetige Bilder im selben Abschnitt, Erfassungen
// liegen Sekunden und Meter auseinander (gemessen: 57/138, 152/275, 85/192 verfallen dort). Statt dessen:
//   1. beide Strahlen auf h_c des Rahmens heben (lokal hLok.hC, sonst H_Laser; global karte.hC), Linie (phi, rho) mit n
//      zur Kamera;
//   2. zuordnen ohne Lueckentest gegen Waende desselben Rahmens: gleiche Seite (<= winkelDeg), beide Enden <= drho quer,
//      Kamera frei (> seite); die naechste gewinnt;
//   3. sonst neue Wand aus dieser einen Erfassung (h 'c', Kovarianz aus sPx/f und sigma von H).
// Beob: art 'decke', nutzer true, schluessel true (jede Erfassung ist eine eigene Geste, kein Verstaerken), sPx o.sPx.
// Klasse: eine Wand mit >= 1 nutzer-Beob ist cls 'wand'; zustand 'bestaetigt' ab minNutzer nutzer-Beob (lmHoehenklasse
// laesst sie so; lmNeuZuordnen ordnet nutzer-Beob mit derselben Regel neu zu und laesst ihre Waende nicht verfallen).
// Z2 (19.2): Traegt die Erfassung ein Urteil der App (bildErg.erfassung.urteil, Text aus obs.final), das einen Eintrag aus
// urteilStoer enthaelt, ist sie keine Wand-Erfassung: Beob nutzer 'stoer' (schluessel), Zuordnung wie ein Bildsegment
// (lmZuordnen: Hoehe der Landmarke, Lueckentest, eindeutig) an eine bestehende Landmarke, sonst ohne Landmarke (L -1).
// Keine neue Wand (eine Linie auf h_c waere fuer eine Kante unter der Decke falsch), keine Kandidatenspur, kein Zwang zu
// 'wand', kein Schutz vor Verfall; lmNeuZuordnen fuehrt sie wie eine Segment-Beob. Nur nutzer === true zaehlt als Erfassung.
// Vorgabe urteilStoer leer: R1 hat ohne Orakel keinen Gewinn gemessen (A6-A8, 20 von 605 Erfassungen betroffen; Export,
// Aussenring-IoU und Erfassungs-Median nach dem Lauf unveraendert, rep/r1). Einschalten mit
// o.erfassung.urteilStoer = ['verworfen: Kante tiefer als die Decke (Leiste, Stuck oder Schrank?)'] (Text aus obs.final).
DEF.erfassung={sPx:2, winkelDeg:5, drho:0.10, seite:0.1, minNutzer:2, hSigma:0.03, tMax:25, urteilStoer:[]};
const nutzerZahl=(K,W)=>{ let n=0; for(const id of W.beob){ const b=K.beob[id]; if(b && b.nutzer===true && b.L===W.id) n++; } return n; };
const nutzerKlasse=(K,W,o)=>{ if(W.cls==='schrank') return false; const n=nutzerZahl(K, W); if(!n) return false;
  W.cls='wand'; W.clsZaehler=0; naechsteWeg(K, W.id); if(W.zustand==='kandidat' && n>=o.minNutzer) W.zustand='bestaetigt'; return true; };
// Linie einer Erfassung im Rahmen r: {c, p1, p2, phi, rho, len, h, dist} oder null
const erfLinie=(K,c,d1,d2,r,o)=>{ if(!(d1[1]>1e-3 && d2[1]>1e-3)) return null;
  const h=hRefC(K, r) ?? hSchaetz(K), D=h-c[1]; if(!(D>0.05)) return null;
  const t1=D/d1[1], t2=D/d2[1]; if(!(t1<o.tMax && t2<o.tMax)) return null;
  const p1=[c[0]+t1*d1[0], c[2]+t1*d1[2]], p2=[c[0]+t2*d2[0], c[2]+t2*d2[2]], len=Math.hypot(p2[0]-p1[0], p2[1]-p1[1]); if(!(len>0.05)) return null;
  let n=[-(p2[1]-p1[1])/len, (p2[0]-p1[0])/len]; if(n[0]*(c[0]-p1[0])+n[1]*(c[2]-p1[1])<0) n=[-n[0], -n[1]];
  const rho=n[0]*p1[0]+n[1]*p1[1], sd=n[0]*c[0]+n[1]*c[2]-rho; if(!(sd>o.seite)) return null;
  const dist=Math.hypot((p1[0]+p2[0])/2-c[0], (p1[1]+p2[1])/2-c[2]);
  return {c, p1, p2, phi:wrap2pi(Math.atan2(n[1], n[0])), rho, len, h, D, dist, sd}; };
const erfSuche=(K,Z,r,o)=>{ let best=null;
  for(const W of (o.nur ? [o.nur] : K.waende.values())){ if(W.rahmen!==r || istStoer(W) || W.cls==='schrank' || W.h==='f') continue;
    if(Math.cos(W.phi-Z.phi)<Math.cos(o.winkelDeg*D2R)) continue;
    const nx=Math.cos(W.phi), nz=Math.sin(W.phi); if(!(nx*Z.c[0]+nz*Z.c[2]-W.rho>o.seite)) continue;
    const q1=Math.abs(nx*Z.p1[0]+nz*Z.p1[1]-W.rho), q2=Math.abs(nx*Z.p2[0]+nz*Z.p2[1]-W.rho), q=Math.max(q1, q2); if(q>o.drho) continue;
    if(!best || q<best.q || q===best.q && W.id<best.W.id) best={W, q}; }
  return best; };
const erfStrahlen=(K,b,r)=>{ const g=gZu(K, r, b.ab, b.t); if(!g) return null; const Z=strahlen(K, b, g); return Z.db ? Z : null; };
// Z2: Urteil der Erfassung aus urteilStoer? (Teiltext, damit Zahlen im Urteil nicht stoeren)
const urteilStoer=(bild,oe)=>{ const u=bild.erfassung && bild.erfassung.urteil; if(typeof u!=='string' || !u) return false;
  for(const s of oe.urteilStoer||[]) if(typeof s==='string' && s && u.includes(s)) return true;
  return false; };
// Z2: Stoer-Erfassung als Beob nutzer 'stoer' (siehe oben); d1, d2 pp-korrigiert im Bezug (nur fuer die Laenge in px)
const erfStoer=(K,bild,ab,o,oe,c0,d1,d2)=>{ const D=bild.dir, f=Number.isFinite(bild.f) && bild.f>0 ? bild.f : 500;
  const Zo=G.lmZuordnen(bild, K, {...(o.zuordnen||{}), ab}), p=Zo.paare.length ? Zo.paare[0] : null, W=p ? K.waende.get(p.L) : null;
  const cw=Math.max(-1, Math.min(1, d1[0]*d2[0]+d1[1]*d2[1]+d1[2]*d2[2]));
  const b=beobNeu(K, {k:bild.k, t:bild.t, ab, ep:bild.ep, i:-1, art:W ? p.art : 'decke', L:-1, c:c0, da:[D[0], D[1], D[2]], db:[D[3], D[4], D[5]], sPx:oe.sPx, f,
    len:Number.isFinite(bild.seg[9]) ? bild.seg[9] : f*Math.acos(cw), nSeg:1});
  b.nutzer='stoer'; b.schluessel=true; if(bild.erfassung) b.erf=bild.erfassung.id;
  if(!W) return {zugeordnet:0, neu:0, L:-1, grund:Zo.mehrdeutig.length ? 'stoer mehrdeutig' : 'stoer ohne Wand'};
  b.L=W.id; W.beob.push(b.id); buchen(K, W, b); K.bilder.get(bild.k).schluessel=true;
  return {zugeordnet:1, neu:0, L:W.id, grund:'stoer zugeordnet'}; };
G.lmErfassung=(karte,bildErg,o={})=>{ const K=karte, bild=bildErg, oe={...DEF.erfassung, ...(o.erfassung||{})}; zustand(K);
  const ab=abVon(K, bild, o), r=rahmenVon(K, ab), A=K.abschnitte[ab], g=r===-1 ? (A ? G.gBei(A, bild.t) : null) : EINS;
  if(!K.bilder.has(bild.k)) K.bilder.set(bild.k, {t:bild.t, ab, ep:bild.ep, c:[bild.camTo[12], bild.camTo[13], bild.camTo[14]], camTo:Array.from(bild.camTo), f:bild.f, schluessel:false});
  if(!g) return {zugeordnet:0, neu:0, L:-1, grund:'ohne g'};
  const c0=[bild.camTo[12], bild.camTo[13], bild.camTo[14]], pp=ppAn(K); let [d1, d2]=segStrahlen(bild, 0, pp);
  if(urteilStoer(bild, oe)) return erfStoer(K, bild, ab, o, oe, c0, d1, d2);
  const c=g===EINS ? c0 : G.gAnw(g, c0); if(g!==EINS){ d1=drehen(g.psi, d1); d2=drehen(g.psi, d2); }
  const Z=erfLinie(K, c, d1, d2, r, oe); if(!Z) return {zugeordnet:0, neu:0, L:-1, grund:'nicht hebbar'};
  const D=bild.dir, f=Number.isFinite(bild.f) && bild.f>0 ? bild.f : 500;
  const b=beobNeu(K, {k:bild.k, t:bild.t, ab, ep:bild.ep, i:-1, art:'decke', L:-1, c:c0, da:[D[0], D[1], D[2]], db:[D[3], D[4], D[5]], sPx:oe.sPx, f,
    len:Number.isFinite(bild.seg[9]) ? bild.seg[9] : Z.len*f/Math.max(0.3, Z.dist), nSeg:1});
  b.nutzer=true; b.schluessel=true; if(bild.erfassung) b.erf=bild.erfassung.id;
  const z=erfSuche(K, Z, r, oe); let W, neu=0;
  if(z) W=z.W;
  else { const sl=Z.dist*oe.sPx/f, sh=Z.dist/Math.max(0.3, Z.D)*oe.hSigma, sr2=sl*sl+sh*sh, sp2=2*sl*sl/(Z.len*Z.len);
    W=wandNeu(K, {rahmen:r, phi:Z.phi, rho:Z.rho, cov:[sp2, 0, sr2], h:'c', hFrei:null}); K.waende.set(W.id, W); neu=1; }
  b.L=W.id; W.beob.push(b.id); buchen(K, W, b); K.bilder.get(bild.k).schluessel=true;
  if(neu) G.lmIntervalle(W, K);
  nutzerKlasse(K, W, oe);
  return {zugeordnet:neu ? 0 : 1, neu, L:W.id, grund:neu ? 'neue Wand' : 'zugeordnet'}; };
