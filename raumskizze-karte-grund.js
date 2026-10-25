// ------------------------------------------------ Karte: Grundlagen (M0)
// Rahmen, Gier, Waende, Hysterese, Robustkern und die duennbesetzte LDL^T fuer die
// Karte (Module M3-M10). Vertrag: ARCHITEKTUR v3, Abschnitte 1.1-1.3 (Konventionen),
// 3 (Strukturen, als JSDoc unten), 4 (Block M0), 17.1 (Bauauftrag). Die Datei steht
// wortgleich als eigener Block { ... } im geo-Block; sie setzt G und den geo-Kern
// (G.m4inv, G.m4mul, G.m4vec, G.ray, G.pixToNdc) voraus und haengt nur an G.
// Kein DOM, keine Uhr, kein Math.random: laeuft im Hauptfaden, im Worker und in Node.
//
// Rahmen (1.1):
//   ARCore-local: Rahmen der XR-Posen, y oben. Bodenbezug T je Zustandszeile (Tpsi, Tx, Ty, Tz):
//     T = [c,0,-s,0, 0,1,0,0, s,0,c,0, Tx,Ty,Tz,1] (spaltenweise, c = cos Tpsi, s = sin Tpsi).
//   Bezug B_s des Abschnitts s: camTo = T^-1 · Pose, Boden y ~ 0, Kamera camTo[12..14].
//   Sitzungsrahmen F0 = B_kern. Grundriss p = [x, z] in m.
//   Versatz g = {psi, tx, ty, tz} bildet B_s -> F0 ab (cs = cos psi, sn = sin psi):
//     x' = cs*x - sn*z + tx,   y' = y + ty,   z' = sn*x + cs*z + tz;   camTo_F0 = gMat(g)·camTo.
//   Wandlinie n·p = rho, n = [cos phi, sin phi] zeigt zur FREIEN Seite (dort stand die Kamera),
//     u = [-sin phi, cos phi], Laengskoordinate s = u·p, phi in [0, 2pi) (Gegenflaechen: phi + pi).
// Gier (1.2): Plan-Gier = Winkel in der Draufsicht (x, z), positiv von +x nach +z. g.psi und alle
//   Gier-Groessen in M4-M10 sind Plan-Gier. Einstiege nur ueber G.psiAusTpsi, G.blickPlan,
//   G.ankerPlan; kein anderes Modul ruft atan2 auf Matrixeintraege auf.
//   Differenzen von yawOfM (App) haben das umgekehrte Vorzeichen von Differenzen der Plan-Gier.
// Kern (1.3): der erste Abschnitt mit >= 8 Schluesselbildern an bestaetigten Landmarken auf
//   >= 2 Wandrichtungen (>= 60° auseinander). F0 := B_kern, g_kern = Einheit, fest fuer die Sitzung;
//   mit Stuetzstellen zusaetzlich d_0 = 0 in jedem Abschnitt. Gesetzt von M10, hier nur festgehalten.
//
// Strukturen (3), Kurzform; Felder und Eigentum wie ARCHITEKTUR 3 und 14.1:
/**
 * @typedef {{psi:number, tx:number, ty:number, tz:number}} Versatz  B_s -> F0 (bzw. Korrektur d_j im Bezug)
 * @typedef {{k:number, vi:number, t:number, ep:number, fmt:'rgba'|'luma8', w:number, h:number, buf:ArrayBuffer,
 *   voll:({w:number,h:number,buf:ArrayBuffer,fmt:'luma4'}|null), camTo:number[], proj:number[], flipY:boolean, senk:boolean}} Auftrag
 * @typedef {{k:number, vi:number, t:number, ep:number, camTo:Float64Array, proj:Float32Array, flipY:boolean, w:number, h:number,
 *   f:number, n:number, seg:Float32Array, cls:Int8Array, man:Int8Array, dir:Float32Array, nTeile:Uint8Array,
 *   psi0:({psi:number,sig:number,n:number}|null), senk:(Object[]|null), ms:Object}} BildErgebnis
 *   seg je Segment G.KG.SEG = 10 Werte: x1, y1, x2, y2 (px, Zeile 0 unten), sal, sPx, psi (Plan-Gier [0, pi) oder NaN),
 *   el1, el2 (rad), len (px); cls G.KG.KL; dir 6 je Segment (Einheitsstrahlen da, db im Bezug des Bilds).
 * @typedef {{t:number, ep:number, pose:number[], T:number[], cam:number[], blick:number, flags:number, imuPsi:(number|undefined)}} PoseZeile
 * @typedef {{t:number, epA:number, epB:number, art:'bruch'|'kamera'|'t-wechsel'|'anker-zurueck'|'reset'|'rest'|'gyro',
 *   klasse:'nurT'|'reloc'|'pause'|'zurueck', grund:*, dt:number, cb:number[], ca:number[], pb:number[], pa:number[],
 *   rPose:number, rPsi:number, dCam:number, dT:Versatz,
 *   bindung:{art:'pose'|'kamera'|'keine', sP:number, sY:number, sH:number, kern:'mm',
 *            mm:{name:'stetig'|'sprung'|'anker', w:number, sP:number, sY:number, sH:number}[], k:*},
 *   anker:{id:number, pb:number[], pa:number[]}[], zurueckZu:(number|null)}} Schnitt
 * @typedef {{t:Float64Array, s:Float64Array, d:Float64Array, cov:(Float64Array|null)}} Knoten  d: 4 je Knoten (psi, tx, ty, tz)
 * @typedef {{ab:number, t0:number, t1:number, ep0:number, ep1:number, g0:Versatz, g:(Versatz|null), cov:(Float64Array|null),
 *   knoten:(Knoten|null), hLok:({hC:number,sHC:number}|null), sig:(Object|null), reg:(Object|null),
 *   stufe:'lokal'|'verbunden'|'locker'|'lose', w:number, nBilder:number, nSchluessel:number, nBeob:number,
 *   mitWand:boolean, richtungen:*, psi0:*}} Abschnitt
 * @typedef {{id:*, k:number, t:number, ab:number, ep:number, i:number, art:'decke'|'boden'|'stoer'|'ecke'|'erfassung', L:*,
 *   c:number[], da:number[], db:(number[]|null), sPx:number, f:number, len:number, nSeg:number, schluessel:boolean,
 *   nutzer:boolean, w:number, chi2:number, mu:number}} Beob
 * @typedef {{id:*, rahmen:number, phi:number, rho:number, cov:number[], h:('c'|'f'|'lokal'|number), hLokal:(Object|null),
 *   cls:'kandidat'|'wand'|'unklar'|'stoer'|'schrank'|'unterzug', clsZaehler:number, hFrei:(Object|null), dChiC:number, dChiF:number,
 *   beob:number[], nBilder:number, nSchluessel:number, nStandpunkte:number, basis:number, abschnitte:number[],
 *   iv:{s0:number,s1:number,n:number,bilder:number,t0:number,t1:number,beidseits:boolean,ring:number}[],
 *   durchblick:number[][], boden:{s0:number,s1:number,n:number}[], ecken:number[], sSchwer:number,
 *   zustand:'kandidat'|'bestaetigt'|'begrenzt', teile:number[], ringe:number[], insel:'nein'|'verdacht'|'ja', inselRunden:number}} Wand
 * @typedef {{id:*, rahmen:number, p:number[], cov:number[], art:'konkav'|'konvex'|'unklar', waende:(Array|null), beob:number[],
 *   frei:number[][], senk:boolean, top:(number|null), nPeil:number}} Ecke
 * @typedef {Object} KarteZustand  opt, skala, hC, hF, sHC, sHF, H, hoehen, posen, epoche, schnitte, abschnitte, kern, bilder,
 *   warte, beob, waende (Map), ecken (Map), spuren, bloecke (Map 'L:ab:j'), pp {cx,cy,sig,frei}, ldl {struktur,perm,name,nnzL},
 *   tiefe, inselEntscheide (Map), umriss, runde, version, ms
 * @typedef {{id:*, n:number[], d:number, iv:number[][], side:number, w:number, sd:number, sth:number, hOk:boolean,
 *   kind:'decke'|'boden'|'ecken'|'lokal', kap:number[], wAb:number, vert:number[], durchblick:number[][]}} UmrissLinie
 * @typedef {{c:number[], a:number[], b:number[], line:*, ab:number, w:number}} Facher
 * @typedef {{lines:UmrissLinie[], fans:Facher[], path:{p:number[],w:number}[], bodenFrei:*, wBoden:number,
 *   inselFest:{id:*,poly:number[][]}[], ausschluss:{id:*,poly:number[][]}[]}} UmrissEingabe
 * @typedef {{id:string, quelle:'ecke'|'gegen'|'senk', linien:Array, ecken:Array, poly:number[][], A:number, U:number, dicke:number}} InselHyp
 * @typedef {{id:string, dE:number, dEn:number, phi:number, pfad:boolean, supRing:number, seiten:number,
 *   stufe:'nein'|'kandidat'|'teil'|'voll', runden:number}} InselBewertung
 * @typedef {{id:*, art:'aussen'|'insel', pts:number[][], waende:Array, sup:number[], hyp:boolean[], flaeche:number, teil:boolean,
 *   supRing:number, phi:number, dicke:number, quelle:'schnitt'|'hypothese',
 *   entscheid:'auto'|'offen'|'nutzer-ja'|'nutzer-nein'|'schrank', exportiert:boolean}} Ring
 * @typedef {{ringe:Ring[], kandidaten:Object[], hypothesen:InselBewertung[], aufgefuellt:*, verworfen:*,
 *   innenVerworfen:{A:number,n:number}[], nLinien:number, nZellen:number, arbeit:Object, ms:number, warn:string[]}} UmrissErgebnis
 * @typedef {{pts:{id:*,x:number,y:number}[], walls:Array[], meas:Array, openings:Array, hmeas:Array, idSeq:number, openSeq:number,
 *   kamera:(Object|undefined)}} RoomData
 * @typedef {{name:string, data:RoomData}} Teilen
 * @typedef {{t:number, id:*, ab:number, phi:number, rho:number, cov:number[], extent:number[], quelle:'ar'|'tiefe', wallId:*}} EbeneBeob
 * @typedef {{v:*, t:number, runde:number, waende:Object[], lokal:(Object|null), ecken:Object[], ringe:Ring[], kandidaten:Object[],
 *   hypothesen:InselBewertung[], abschnitte:{ab:number,t0:number,t1:number,g:(Versatz|null),sig:*,stufe:string,w:number,
 *   mitWand:boolean,knoten:({t:number,d:number[]}[]|null)}[], hoehen:Object, hinweise:Object[], raster:(Object|undefined),
 *   arbeit:Object, ms:Object, abschluss:{bereit:boolean,fehlt:string[],ausgeschlossen:number[]}, fehler:(string|null)}} KarteStand
 * @typedef {{runde:number, t:number, kBis:number, tPose:number, epoche:number, verdraengt:number[], arbeit:Object,
 *   lago:(null|{grund:string}), ldl:{n:number,nnzL:number,ordnung:string}, ms:Object, kopf:*}} RundeKopf
 */

// ------------------------------------------------ Konstanten
// rnd: Mulberry32 (deterministisch, Samen 32 bit). KNOTEN: Stuetzstellen 3.2.3; die Werte
// sind die Vorgabe der Architektur [S] (Lage 1 cm/m nach Hasler 2019, Gier 0,1 °/m, Hoehe
// 0,2 cm/m) und werden erst mit G-0.5 (T3, A7 mit Orakel-Landmarken, S6-M) geeicht; das
// Ergebnis kommt mit Herkunft hierher.
G.KG={SEG:10, KL:{X:0, V:1, O:2, U:3}, EPS:1e-9,
  rnd:seed=>{ let s=seed|0; return ()=>{ s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15, 1|s); t=t+Math.imul(t^t>>>7, 61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; },
  KNOTEN:{dT:15, dS:3.0, minBeob:30, minRicht:2, richtDeg:60, sP0:0.005, kP:0.010, sY0Deg:0.05, kYDeg:0.10, sH0:0.002, kH:0.002,
          chiRest:16, rundenRest:2}};

// ------------------------------------------------ Versatz g (B_s -> F0)
// Keine Rundung von psi auf (-pi, pi]: Gieren bleiben stetig fuer Ausgleich und Interpolation.
G.gMat=g=>{ const c=Math.cos(g.psi), s=Math.sin(g.psi), m=new Float64Array(16);
  m[0]=c; m[2]=s; m[5]=1; m[8]=-s; m[10]=c; m[12]=g.tx; m[13]=g.ty; m[14]=g.tz; m[15]=1; return m; };
G.gAnw=(g,P)=>{ const c=Math.cos(g.psi), s=Math.sin(g.psi); return [c*P[0]-s*P[2]+g.tx, P[1]+g.ty, s*P[0]+c*P[2]+g.tz]; };
G.gPlan=(g,p)=>{ const c=Math.cos(g.psi), s=Math.sin(g.psi); return [c*p[0]-s*p[1]+g.tx, s*p[0]+c*p[1]+g.tz]; };
G.gInv=g=>{ const c=Math.cos(g.psi), s=Math.sin(g.psi); return {psi:-g.psi, tx:-(c*g.tx+s*g.tz), ty:-g.ty, tz:s*g.tx-c*g.tz}; };
// a∘b: erst b, dann a. gMat(gKomp(a, b)) = gMat(a)·gMat(b).
G.gKomp=(a,b)=>{ const c=Math.cos(a.psi), s=Math.sin(a.psi);
  return {psi:a.psi+b.psi, tx:c*b.tx-s*b.tz+a.tx, ty:a.ty+b.ty, tz:s*b.tx+c*b.tz+a.tz}; };
// Planwirkung eines Bodenbezugs: T als 4x4 (spaltenweise) oder als Zustandsspalten [Tpsi, Tx, Ty, Tz].
G.gAusT=T=>T.length===4 ? {psi:G.psiAusTpsi(T[0]), tx:T[1], ty:T[2], tz:T[3]}
  : {psi:Math.atan2(T[2], T[0]), tx:T[12], ty:T[13], tz:T[14]};

// ------------------------------------------------ Gier (1.2)
G.psiAusTpsi=Tpsi=>-Tpsi;
G.blickPlan=m=>Math.atan2(-m[10], -m[8]);         // Plan-Gier der Kamera-Achse -z
G.ankerPlan=psi=>-psi;                             // anker.jsonl: Gier wie Tpsi

// ------------------------------------------------ Waende
G.wandN=phi=>[Math.cos(phi), Math.sin(phi)];
G.wandU=phi=>[-Math.sin(phi), Math.cos(phi)];
G.wandSchnitt=(Wa,Wb)=>{ const ca=Math.cos(Wa.phi), sa=Math.sin(Wa.phi), cb=Math.cos(Wb.phi), sb=Math.sin(Wb.phi), det=ca*sb-sa*cb;
  if(!(Math.abs(det)>G.KG.EPS)) return null;
  return [(Wa.rho*sb-Wb.rho*sa)/det, (ca*Wb.rho-cb*Wa.rho)/det]; };
G.wandSeite=(W,c)=>Math.cos(W.phi)*c[0]+Math.sin(W.phi)*c[1]-W.rho;   // > 0,1 m: Kamera auf der freien Seite

// F0 -> Bezug des laufenden Abschnitts (Zeichnen): Waende, Ecken, Ringe eines KarteStand mit gInv(g).
// Kovarianz der Wand bei festem g: rho' = rho + n'·t, d rho'/d phi = u'·t. Ohne Unsicherheit von g
// (die ergaenzt M6 in G.fehlerband).
const ZWEIPI=2*Math.PI, wrap2pi=a=>{ a%=ZWEIPI; return a<0 ? a+ZWEIPI : a; };
const ivVerschieben=(iv,d)=>iv.map(x=>Array.isArray(x) ? [x[0]+d, x[1]+d] : {...x, s0:x.s0+d, s1:x.s1+d});
G.zuBezug=(stand,g)=>{
  const gi=G.gInv(g), c=Math.cos(gi.psi), s=Math.sin(gi.psi);
  const waende=(stand.waende||[]).map(W=>{ const phi=wrap2pi(W.phi+gi.psi), n=G.wandN(phi), u=G.wandU(phi), a=n[0]*gi.tx+n[1]*gi.tz, b=u[0]*gi.tx+u[1]*gi.tz;
    const o={...W, phi, rho:W.rho+a};
    if(W.cov) o.cov=[W.cov[0], W.cov[1]+b*W.cov[0], W.cov[2]+2*b*W.cov[1]+b*b*W.cov[0]];
    if(W.iv) o.iv=ivVerschieben(W.iv, b);
    if(W.boden) o.boden=ivVerschieben(W.boden, b);
    if(W.durchblick) o.durchblick=ivVerschieben(W.durchblick, b);
    if(Number.isFinite(W.sSchwer)) o.sSchwer=W.sSchwer+b;
    return o; });
  const ecken=(stand.ecken||[]).map(E=>{ const o={...E, p:G.gPlan(gi, E.p)};
    if(E.cov){ const [xx,xz,zz]=E.cov; o.cov=[c*c*xx-2*c*s*xz+s*s*zz, c*s*(xx-zz)+(c*c-s*s)*xz, s*s*xx+2*c*s*xz+c*c*zz]; }
    return o; });
  const ringe=(stand.ringe||[]).map(R=>({...R, pts:R.pts.map(p=>G.gPlan(gi, p))}));
  return {waende, ecken, ringe};
};

// ------------------------------------------------ Kleinkram
G.fokusPx=(proj,h)=>proj[5]*h/2;                                    // Brennweite in px des Bilds der Hoehe h
// Hysterese: '>=' setzt bei wert >= setzen und loest bei wert < loesen; '<=' setzt bei wert <= setzen
// und loest bei wert > loesen. NaN behaelt den Zustand.
G.hyst=(alt,wert,setzen,loesen,richtung='>=')=>richtung==='<='
  ? (alt ? !(wert>loesen) : wert<=setzen)
  : (alt ? !(wert<loesen) : wert>=setzen);
G.gmGewicht=(r,c,mu)=>{ const k=mu*c*c, v=k/(r*r+k); return v*v; };   // Geman-McClure mit GNC-Stufe mu (6.5)

// ------------------------------------------------ Stuetzstellen (3.2.3)
// g zur Zeit t: gKomp(A.g, d(t)), d komponentenweise linear zwischen den Knoten, ausserhalb konstant.
// A: Abschnitt (knoten {t, d: Float64Array}) oder KarteStand-Eintrag (knoten [{t, d:[4]}]). Knoten,
// fuer die M6 d noch nicht verlaengert hat (knoten.t laenger als d/4), gelten als d des vorigen.
// A.g = null (Abschnitt lokal): null - ohne Versatz gibt es keinen Weg nach F0.
G.gBei=(A,t)=>{
  const g=A && A.g; if(!g) return null;
  const K=A.knoten;
  let n=0, tj, dj;
  if(Array.isArray(K)){ n=K.length; tj=j=>K[j].t; dj=(j,c)=>K[j].d[c]; }
  else if(K && K.t && K.d){ n=Math.min(K.t.length, Math.floor(K.d.length/4)); tj=j=>K.t[j]; dj=(j,c)=>K.d[4*j+c]; }
  if(n<1) return {psi:g.psi, tx:g.tx, ty:g.ty, tz:g.tz};
  let j0, j1, u;
  if(n===1 || t<=tj(0)){ j0=j1=0; u=0; }
  else if(t>=tj(n-1)){ j0=j1=n-1; u=0; }
  else { let lo=0, hi=n-1; while(hi-lo>1){ const m=(lo+hi)>>1; if(tj(m)<=t) lo=m; else hi=m; }
    j0=lo; j1=hi; const dt=tj(j1)-tj(j0); u=dt>0 ? (t-tj(j0))/dt : 1; }
  const d=[0,1,2,3].map(c=>dj(j0,c)+u*(dj(j1,c)-dj(j0,c)));
  return G.gKomp(g, {psi:d[0], tx:d[1], ty:d[2], tz:d[3]});
};

// ------------------------------------------------ Duennbesetzte LDL^T (5.4)
// Nach T. A. Davis, LDL (up-looking, Eliminationsbaum; ACM TOMS 31, 2005), Vorlage slam/bench-loeser.mjs.
// Eingang: symmetrische Matrix als CSC, nur oberes Dreieck (Eintraege mit Zeile > Spalte werden
// ignoriert). Die Permutation perm[k] = alte Nummer der k-ten Unbekannten: ldlSymb baut das obere
// Dreieck von P·A·P^T einmal auf (mit Streukarte je Eintrag von A), ldlNum faktorisiert es, ldlLoes
// loest mit P. nnzL = Zahl der Eintraege von L unter der Diagonalen (wie R13).
G.ldlSymb=(n,Ap,Ai,perm)=>{
  const pinv=new Int32Array(n);
  if(perm){ pinv.fill(-1); for(let k=0;k<n;k++){ const i=perm[k]; if(!(i>=0 && i<n) || pinv[i]>=0) throw new Error('ldlSymb: perm ist keine Permutation'); pinv[i]=k; } }
  else for(let k=0;k<n;k++) pinv[k]=k;
  const nzA=Ap[n], cnt=new Int32Array(n+1), map=new Int32Array(nzA).fill(-1);
  for(let j=0;j<n;j++) for(let p=Ap[j];p<Ap[j+1];p++){ const i=Ai[p]; if(i>j) continue; const a=pinv[i], b=pinv[j]; cnt[(a>b ? a : b)+1]++; }
  const Cp=new Int32Array(n+1); for(let k=0;k<n;k++) Cp[k+1]=Cp[k]+cnt[k+1];
  const next=Cp.slice(0, n), Ci=new Int32Array(Cp[n]);
  for(let j=0;j<n;j++) for(let p=Ap[j];p<Ap[j+1];p++){ const i=Ai[p]; if(i>j) continue; const a=pinv[i], b=pinv[j], col=a>b ? a : b, q=next[col]++;
    Ci[q]=a>b ? b : a; map[p]=q; }
  const Parent=new Int32Array(n), Lnz=new Int32Array(n), Flag=new Int32Array(n), Lp=new Int32Array(n+1);
  for(let k=0;k<n;k++){ Parent[k]=-1; Flag[k]=k; Lnz[k]=0;
    for(let p=Cp[k];p<Cp[k+1];p++){ let i=Ci[p]; if(i<k) for(; Flag[i]!==k; i=Parent[i]){ if(Parent[i]===-1) Parent[i]=k; Lnz[i]++; Flag[i]=k; } } }
  for(let k=0;k<n;k++) Lp[k+1]=Lp[k]+Lnz[k];
  return {n, perm:perm ? Int32Array.from(perm) : null, pinv, Cp, Ci, map, Parent, Lp, nnzL:Lp[n]};
};
// null, wenn ein Pivot nicht positiv ist oder relativ zu seinem Diagonaleintrag <= pivMin
// (singulaer oder indefinit); M6 schreibt dann nichts (ok = false).
G.ldlNum=(S,Ax,o={})=>{
  const pivMin=o.pivMin ?? 1e-12, n=S.n, {Cp, Ci, Parent, Lp, map}=S, Cx=new Float64Array(Cp[n]);
  for(let p=0;p<map.length;p++) if(map[p]>=0) Cx[map[p]]=Ax[p];
  const Li=new Int32Array(Lp[n]), Lx=new Float64Array(Lp[n]), D=new Float64Array(n), Y=new Float64Array(n),
        Pattern=new Int32Array(n), Flag=new Int32Array(n), Lnz=new Int32Array(n);
  for(let k=0;k<n;k++){
    Y[k]=0; let top=n, dkk=0; Flag[k]=k; Lnz[k]=0;
    for(let p=Cp[k];p<Cp[k+1];p++){ let i=Ci[p]; if(i===k) dkk+=Cx[p]; Y[i]+=Cx[p]; let len=0;
      for(; Flag[i]!==k; i=Parent[i]){ Pattern[len++]=i; Flag[i]=k; }
      while(len>0) Pattern[--top]=Pattern[--len]; }
    D[k]=Y[k]; Y[k]=0;
    for(; top<n; top++){ const i=Pattern[top], yi=Y[i]; Y[i]=0; const p2=Lp[i]+Lnz[i];
      for(let p=Lp[i];p<p2;p++) Y[Li[p]]-=Lx[p]*yi;
      const l=yi/D[i]; D[k]-=l*yi; Li[p2]=k; Lx[p2]=l; Lnz[i]++; }
    if(!(dkk>0) || !(D[k]>pivMin*dkk)) return null;
  }
  return {S, Li, Lx, D, y:new Float64Array(n)};
};
G.ldlLoes=(F,b,x)=>{
  const {S, Li, Lx, D, y}=F, n=S.n, Lp=S.Lp, perm=S.perm;
  for(let k=0;k<n;k++) y[k]=b[perm ? perm[k] : k];
  for(let j=0;j<n;j++){ const yj=y[j]; for(let p=Lp[j];p<Lp[j+1];p++) y[Li[p]]-=Lx[p]*yj; }
  for(let j=0;j<n;j++) y[j]/=D[j];
  for(let j=n-1;j>=0;j--){ let v=y[j]; for(let p=Lp[j];p<Lp[j+1];p++) v-=Lx[p]*y[Li[p]]; y[j]=v; }
  const out=x || new Float64Array(n);
  for(let k=0;k<n;k++) out[perm ? perm[k] : k]=y[k];
  return out;
};
// Reihenfolge: zaehlt nnz(L) symbolisch fuer jeden Kandidaten und nimmt den kleineren (Gleichstand: erster).
// gruppen: Gruppe je Unbekannte (0 Knoten/Posen in Zeitfolge, 1 Waende/Ecken, 2 global); innerhalb einer
// Gruppe bleibt die Reihenfolge der Eingabe. 'knotenZuerst' = 0, 1, 2; 'waendeZuerst' = 1, 0, 2.
// Andere Gruppennummern kommen in Eingabereihenfolge ans Ende.
const LDL_FOLGE={knotenZuerst:[0, 1, 2], waendeZuerst:[1, 0, 2]};
G.ldlOrdnung=(n,Ap,Ai,gruppen,o={})=>{
  const kand=o.kandidaten || ['knotenZuerst', 'waendeZuerst'];
  let best=null;
  for(const name of kand){ const f=LDL_FOLGE[name]; if(!f) throw new Error('ldlOrdnung: unbekannte Reihenfolge '+name);
    const perm=new Int32Array(n); let k=0;
    for(const gr of f) for(let i=0;i<n;i++) if(gruppen[i]===gr) perm[k++]=i;
    for(let i=0;i<n;i++) if(!f.includes(gruppen[i])) perm[k++]=i;
    const nnzL=G.ldlSymb(n, Ap, Ai, perm).nnzL;
    if(!best || nnzL<best.nnzL) best={perm, name, nnzL}; }
  return best;
};
