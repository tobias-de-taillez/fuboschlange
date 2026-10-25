// ------------------------------------------------ Karte: Segmente im Bild-Worker (M3)
// Vom Kamerabild zum BildErgebnis: Luma -> ELSED -> Einteilen -> Verschmelzen -> Gier -> (Senkrechte).
// Vertrag: ARCHITEKTUR v3, Abschnitte 1.1 (Bild: Zeile 0 UNTEN, w = bild.breite 287), 3.1 (Auftrag,
// BildErgebnis), 4 (Block M3), 17.2 (Bauauftrag). Vorlage der Einteilung: design/lm/messung.mjs, der Gier und
// der rechten Winkel: karte/fixtures/lib.mjs (F1); ohne Verschmelzen ist das Ergebnis bitgleich zu F1. Die Datei
// steht wortgleich als eigener Block { ... } im geo-Block; sie setzt G, den geo-Kern (G.m4inv, G.pixToNdc,
// G.vertVanish, G.verticalEdges, G.lumaKlein), M0 (G.KG, G.fokusPx) und M1 (G.elsed) voraus und haengt nur an G.
// Kein DOM, kein Zufall; die Uhr (Vorgabe performance.now wie in raumskizze-elsed.js, sonst bildNeu({uhr})) fuellt
// nur ms und entscheidet nie.
// Laeuft im Hauptfaden, im Worker und in Node.
//
// G.lumaAus(buf, fmt, w, h, aus) -> Uint8Array w*h, Zeilen wie im Puffer (Zeile 0 unten wie readPixels).
//   'rgba': (77 R + 150 G + 29 B) >> 8; 'luma8': 1 Byte je Pixel; 'luma4': 4 Luma je RGBA8-Texel, Zeile
//   ceil(w/4) Texel (Fuellbytes am Zeilenende werden nie gelesen). Gelesen werden nur die ersten w*h Pixel in
//   Zeilen der Breite w (ein groesserer Pool-Puffer ist erlaubt); zu kurz oder genau eine Spalte breiter
//   ((w+1)*h, Polsterspalte nicht abgeschnitten) wirft.
// G.lmSegmente(roh, w, h, proj, camTo, flipY, o) -> {seg, cls, dir, n}, n = roh.length (nichts faellt weg):
//   Strahlen durch die Enden (wie G.ray, bitgleich) im Bezug des Bilds; V, wenn der Winkel zur Richtung
//   auf den senkrechten Fluchtpunkt (G.vertVanish) an der Mitte < vDeg; sonst O bzw. U, wenn beide Enden
//   ueber +elDeg bzw. unter -elDeg liegen; sonst X; Abstand der Enden < minLen: X. psi = Plan-Gier der
//   waagerechten Deutung in [0, pi) aus der Ebene durch beide Strahlen (nur O/U, sonst NaN); sPx = 1.
// G.lmVerschmelzen(bild, o) -> neues bild. Je Bild, klassenunabhaengig, bis nichts mehr geht:
//   - parallel (Doppelkante): Winkel <= dDeg, Mitte des einen <= dPx quer zur Geraden des anderen, Ueberlapp
//     >= ueber * kuerzeres (in einer der beiden Richtungen; das Mass von design/lm/doppel.mjs);
//   - kollinear (Stuecke): Winkel < kollDeg, beide Enden des kuerzeren < kollPx quer zur Geraden des
//     laengeren, Luecke laengs < gapPx (Ueberlapp zaehlt als Luecke < 0).
//   Neue Gerade: mit parallelem Teil (Doppelkante, auch wenn danach Stuecke dazukommen) die Gerade des laengsten
//   Rohteils (bei gleicher Laenge des mit kleinerem Index), sonst (nur Stuecke) die Hauptachse der
//   laengengewichteten Momente aller Rohteile. Die Mittellinie einer Doppelkante zaehlte sie einfach und zog psi0
//   (A8 Abschnitt 8: +1,44° roh, -2,23° verschmolzen), die Gerade eines Rohteils nicht (P-B-Bericht). Enden =
//   aeusserste Projektionen aller Rohenden auf die Gerade, Richtung des laengsten Teils. sPx = max(1, sPx der
//   Teile, Streuung/2), Streuung = Spannweite der Querabstaende aller Rohenden zur Geraden (Doppelkante 3 px ->
//   sPx 1,5). nTeile = Zahl der Rohteile (hoechstens 255). sal: parallel das Maximum (dieselbe Kante zweimal),
//   kollinear die Summe. Verschmolzene werden neu eingeteilt (Enden zuerst auf float32 gerundet), unberuehrte
//   unveraendert uebernommen; man wird -1 (Indizes neu). Reihenfolge: nach dem kleinsten Rohindex. o.einteilen:
//   Optionen der Einteilung.
// G.lmGier(bild, o) -> {psi, sig, n} | null: Raumrichtung mod 90° (Plan-Gier) aus den O/U-Segmenten, wortgleich
//   lib.gier (F1, Platzhalter, T3): Histogramm von psi mod 90° (Faecher fachDeg, Gewicht Laenge), zyklisch mit
//   Gauss sigma glattDeg geglaettet (Radius ceil(3 sigma) Faecher), Spitze (erste bei Gleichstand), dann
//   laengengewichtetes Mittel der Abstaende im Fenster +-fensterDeg um die Spitze. n = Segmente in diesem Fenster,
//   sig = laengengewichteter RMS-Rest um psi / Wurzel(n) (rad); null bei weniger als minN (3) O/U-Segmenten oder
//   n < minN. sig ist die Streuung der Segmente, kein Fehler gegen die Wahrheit (der ist an A6/A8 vier- bis
//   elfmal groesser, P-B-Bericht): M4/M6 brauchen einen Boden oder eine Eichung.
// G.lmRechtwinklig(bild, psi0, o) -> neues bild mit man: k in {0, 1}, wenn |psi - psi0 - k·90°| < fensterDeg
//   (psi nur mod 180° bekannt, wortgleich lib.rechtwinklig), sonst -1; ohne psi0 alle -1.
// G.bildNeu(o) -> BildZustand {o, luma, nBilder}; o: elsed (ELSED-Parameter), segmente, verschm (false = aus),
//   gier, recht, senk (Optionen von G.verticalEdges), skala ('auto' = min(w, h)/287, sonst Zahl: px-Schwellen
//   minLineLen, minLen, dPx, kollPx, gapPx wachsen mit, wie live 3.5 Punkt 3), senkLang (Senkrechte auf
//   G.lumaKlein bis zu dieser Laenge, Vorgabe 640: die Fenster des Finders sind auf 287x640 abgestimmt), uhr
//   (Funktion in ms; Vorgabe performance.now, false = keine Uhr, ms dann 0).
// G.bild(BZ, auftrag) -> BildErgebnis (3.1), alle Felder neu (der Karten-Worker bekommt sie per Nachricht);
//   nur BZ.luma (Luma des letzten Bilds, fuer die Ansichten) bleibt im Zustand. Senkrechte nur bei
//   auftrag.senk, sonst senk = null. auftrag.voll wird nicht gelesen (Feinlage ist Stand 6b, nicht M3 v3).
//   ms = {luma, elsed, verschm, einteilen (Segmente + Gier + Rechtwinklig), senk, gesamt}.

const SEG_DEF={vDeg:2, elDeg:4, minLen:15};
const VERSCHM_DEF={dDeg:2, dPx:4, ueber:0.5, kollDeg:1.5, kollPx:1.5, gapPx:10};
const GIER_DEF={fachDeg:0.25, glattDeg:0.75, fensterDeg:3, minN:3};
const RECHT_DEF={fensterDeg:6};
const D2R=Math.PI/180, R2D=180/Math.PI, VIERTEL=Math.PI/2;
const d4=(a,b)=>{ const q=Math.PI/2; let d=((a-b)%q+q)%q; return d>q/2 ? d-q : d; };   // Abstand mod 90° in [-45°, 45°] (wie lib.mjs)

// ------------------------------------------------ Luma
G.lumaAus=(buf,fmt,w,h,aus)=>{
  const u8=buf instanceof Uint8Array ? buf : ArrayBuffer.isView(buf) ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) : new Uint8Array(buf);
  const n=w*h, g=aus && aus.length>=n ? (aus.length===n ? aus : aus.subarray(0, n)) : new Uint8Array(n);
  const bpp=fmt==='rgba' ? 4 : fmt==='luma8' ? 1 : fmt==='luma4' ? 0 : -1;
  if(bpp<0) throw new Error('lumaAus: unbekanntes Format '+fmt);
  const soll=bpp ? bpp*n : 4*Math.ceil(w/4)*h;
  if(u8.length<soll) throw new Error(`lumaAus: ${fmt} ${w}x${h} braucht ${soll} Bytes, Puffer hat ${u8.length}`);
  if(bpp && u8.length===bpp*(w+1)*h) throw new Error(`lumaAus: Puffer hat ${w+1} Spalten (Polsterspalte nicht abgeschnitten?), w ist ${w}`);
  if(fmt==='rgba') for(let i=0,j=0;i<n;i++,j+=4) g[i]=(77*u8[j]+150*u8[j+1]+29*u8[j+2])>>8;
  else if(fmt==='luma8') g.set(u8.length===n ? u8 : u8.subarray(0, n));
  else { const st=4*Math.ceil(w/4); for(let y=0;y<h;y++) g.set(u8.subarray(y*st, y*st+w), y*w); }
  return g;
};

// ------------------------------------------------ Einteilen
// Bildrahmen fuer die Einteilung: inverse Projektion und senkrechter Fluchtpunkt einmal je Bild.
const rahmen=(w,h,proj,camTo,flipY,o)=>({w, h, flipY:!!flipY, ip:G.m4inv(proj), c:camTo, V:G.vertVanish(proj, camTo, w, h, flipY),
  EL:Math.sin(o.elDeg*D2R), vDeg:o.vDeg, minLen:o.minLen});
// Strahl durch die Pixelmitte (x, y) wie G.ray(proj, camTo, ...G.pixToNdc(x, y, w, h, flipY)), gleiche
// Rechenschritte (bitgleich); Richtung nach aus[j..j+2]. false, wenn die Projektion entartet.
const strahl=(R,x,y,aus,j)=>{
  const nx=(x+0.5)/R.w*2-1, ny=R.flipY ? 1-(y+0.5)/R.h*2 : (y+0.5)/R.h*2-1, ip=R.ip, c=R.c;
  if(!ip) return false;
  const p0=ip[0]*nx+ip[4]*ny+ip[8]*-1+ip[12]*1, p1=ip[1]*nx+ip[5]*ny+ip[9]*-1+ip[13]*1,
        p2=ip[2]*nx+ip[6]*ny+ip[10]*-1+ip[14]*1, p3=ip[3]*nx+ip[7]*ny+ip[11]*-1+ip[15]*1;
  if(!p3) return false;
  let a=p0/p3, b=p1/p3, e=p2/p3, l=Math.hypot(a, b, e); a/=l; b/=l; e/=l;
  let u=c[0]*a+c[4]*b+c[8]*e, v=c[1]*a+c[5]*b+c[9]*e, z=c[2]*a+c[6]*b+c[10]*e; l=Math.hypot(u, v, z);
  aus[j]=u/l; aus[j+1]=v/l; aus[j+2]=z/l; return true;
};
// Ein Segment einteilen: schreibt seg[i*10 ..] und dir[i*6 ..], gibt die Klasse zurueck (wie lib.einteilen).
const tmp6=new Float64Array(6);
const einteilen1=(R,x1,y1,x2,y2,sal,sPx,i,seg,dir)=>{
  const KL=G.KG.KL, L=Math.hypot(x2-x1, y2-y1), mx=(x1+x2)/2, my=(y1+y2)/2, V=R.V;
  const okA=strahl(R, x1, y1, tmp6, 0), okB=strahl(R, x2, y2, tmp6, 3);
  if(!okA || !okB) tmp6.fill(NaN);
  const vx=V ? V[0]-mx*V[2] : 0, vy=V ? V[1]-my*V[2] : 1, aV=Math.asin(Math.min(1, Math.abs((x2-x1)*vy-(y2-y1)*vx)/(L*Math.hypot(vx, vy))))*R2D;
  const ea=tmp6[1], eb=tmp6[4]; let k, psi=NaN;
  if(L<R.minLen) k=KL.X;
  else if(aV<R.vDeg) k=KL.V;
  else if(ea>R.EL && eb>R.EL) k=KL.O;
  else if(ea<-R.EL && eb<-R.EL) k=KL.U;
  else k=KL.X;
  if(k===KL.O || k===KL.U){ const d0=tmp6[0], d1=tmp6[1], d2=tmp6[2], e0=tmp6[3], e1=tmp6[4], e2=tmp6[5];
    const nn0=d1*e2-d2*e1, nn2=d0*e1-d1*e0; psi=Math.atan2(-nn0, nn2); psi=((psi%Math.PI)+Math.PI)%Math.PI; }
  const j=i*G.KG.SEG;
  seg[j]=x1; seg[j+1]=y1; seg[j+2]=x2; seg[j+3]=y2; seg[j+4]=sal; seg[j+5]=sPx; seg[j+6]=psi;
  seg[j+7]=Math.asin(Math.max(-1, Math.min(1, ea))); seg[j+8]=Math.asin(Math.max(-1, Math.min(1, eb))); seg[j+9]=L;
  dir.set(tmp6, i*6);
  return k;
};
G.lmSegmente=(roh,w,h,proj,camTo,flipY,o={})=>{
  o={...SEG_DEF, ...o};
  const n=roh.length, R=rahmen(w, h, proj, camTo, flipY, o), seg=new Float32Array(n*G.KG.SEG), cls=new Int8Array(n), dir=new Float32Array(n*6);
  for(let i=0;i<n;i++){ const s=roh[i]; cls[i]=einteilen1(R, s.x1, s.y1, s.x2, s.y2, s.sal ?? s.salience, 1, i, seg, dir); }
  return {seg, cls, dir, n};
};

// ------------------------------------------------ Verschmelzen
G.lmVerschmelzen=(b,o={})=>{
  o={...VERSCHM_DEF, ...o};
  const S=G.KG.SEG, n=b.n, sg=b.seg, nT0=b.nTeile;
  const sinD=Math.sin(o.dDeg*D2R), sinK=Math.sin(o.kollDeg*D2R), wMax=Math.max(o.dDeg, o.kollDeg)*D2R+1e-9;
  // Beobachtungen, zunaechst je Rohsegment: Enden, Richtung, Laenge (LR roh, fest), Winkel mod pi, Momente, Rohteile
  const X1=new Float64Array(n), Y1=new Float64Array(n), X2=new Float64Array(n), Y2=new Float64Array(n), UX=new Float64Array(n), UY=new Float64Array(n),
        LL=new Float64Array(n), LR=new Float64Array(n), WI=new Float64Array(n), MA=new Float64Array(n), SX=new Float64Array(n), SY=new Float64Array(n),
        SXX=new Float64Array(n), SXY=new Float64Array(n), SYY=new Float64Array(n), SAL=new Float64Array(n), SPX=new Float64Array(n),
        NT=new Int32Array(n), LANG=new Int32Array(n), PAR=new Uint8Array(n), lebt=new Uint8Array(n), teile=new Array(n);
  const winkel=i=>{ const a=Math.atan2(UY[i], UX[i]); return ((a%Math.PI)+Math.PI)%Math.PI; };
  for(let i=0;i<n;i++){ const j=i*S, x1=sg[j], y1=sg[j+1], x2=sg[j+2], y2=sg[j+3], dx=x2-x1, dy=y2-y1, L=Math.hypot(dx, dy);
    X1[i]=x1; Y1[i]=y1; X2[i]=x2; Y2[i]=y2; LL[i]=L; LR[i]=L; UX[i]=L>0 ? dx/L : 1; UY[i]=L>0 ? dy/L : 0; WI[i]=winkel(i);
    const mx=(x1+x2)/2, my=(y1+y2)/2; MA[i]=L; SX[i]=L*mx; SY[i]=L*my; SXX[i]=L*(mx*mx+dx*dx/12); SXY[i]=L*(mx*my+dx*dy/12); SYY[i]=L*(my*my+dy*dy/12);
    SAL[i]=sg[j+4]; SPX[i]=sg[j+5]; NT[i]=nT0 ? nT0[i] : 1; LANG[i]=i; lebt[i]=1; teile[i]=[i]; }
  // 1 parallel, 2 kollinear, 0 nicht verschmelzen
  const passt=(a,c)=>{
    const cr=Math.abs(UX[a]*UY[c]-UY[a]*UX[c]);
    if(cr<=sinD) for(const [s,t] of [[a,c],[c,a]]){
      const dp=Math.abs(UX[s]*((Y1[t]+Y2[t])/2-Y1[s])-UY[s]*((X1[t]+X2[t])/2-X1[s]));
      if(dp>o.dPx) continue;
      const p1=(X1[t]-X1[s])*UX[s]+(Y1[t]-Y1[s])*UY[s], p2=(X2[t]-X1[s])*UX[s]+(Y2[t]-Y1[s])*UY[s];
      if(Math.min(LL[s], Math.max(p1, p2))-Math.max(0, Math.min(p1, p2))>=o.ueber*Math.min(LL[s], LL[t])) return 1; }
    if(cr<sinK){ const s=LL[a]>=LL[c] ? a : c, t=s===a ? c : a;
      const q1=UX[s]*(Y1[t]-Y1[s])-UY[s]*(X1[t]-X1[s]), q2=UX[s]*(Y2[t]-Y1[s])-UY[s]*(X2[t]-X1[s]);
      if(Math.abs(q1)<o.kollPx && Math.abs(q2)<o.kollPx){
        const p1=(X1[t]-X1[s])*UX[s]+(Y1[t]-Y1[s])*UY[s], p2=(X2[t]-X1[s])*UX[s]+(Y2[t]-Y1[s])*UY[s];
        if(Math.max(Math.min(p1, p2)-LL[s], -Math.max(p1, p2))<o.gapPx) return 2; } }
    return 0; };
  // c in a aufnehmen. Gerade: ohne parallelen Teil (nur Stuecke) die Hauptachse der Momente aller Rohteile, mit
  // parallelem Teil (Doppelkante, PAR) die Gerade des laengsten Rohteils; Enden und Querstreuung aus allen Rohenden
  const verschmelze=(a,c,art)=>{
    MA[a]+=MA[c]; SX[a]+=SX[c]; SY[a]+=SY[c]; SXX[a]+=SXX[c]; SXY[a]+=SXY[c]; SYY[a]+=SYY[c];
    for(const r of teile[c]) teile[a].push(r);
    NT[a]=Math.min(255, NT[a]+NT[c]); SAL[a]=art===1 ? Math.max(SAL[a], SAL[c]) : SAL[a]+SAL[c]; SPX[a]=Math.max(SPX[a], SPX[c]);
    if(LR[LANG[c]]>LR[LANG[a]] || (LR[LANG[c]]===LR[LANG[a]] && LANG[c]<LANG[a])) LANG[a]=LANG[c];
    PAR[a]=PAR[a] | PAR[c] | (art===1 ? 1 : 0); lebt[c]=0;
    const r0=LANG[a]*S, ldx=sg[r0+2]-sg[r0], ldy=sg[r0+3]-sg[r0+1]; let cx, cy, ux, uy;
    if(PAR[a]){ const l=Math.hypot(ldx, ldy); if(!(l>0)) return; cx=(sg[r0]+sg[r0+2])/2; cy=(sg[r0+1]+sg[r0+3])/2; ux=ldx/l; uy=ldy/l; }
    else { if(!(MA[a]>0)) return;
      cx=SX[a]/MA[a]; cy=SY[a]/MA[a]; const cxx=SXX[a]/MA[a]-cx*cx, cxy=SXY[a]/MA[a]-cx*cy, cyy=SYY[a]/MA[a]-cy*cy, th=0.5*Math.atan2(2*cxy, cxx-cyy);
      ux=Math.cos(th); uy=Math.sin(th); if(ux*ldx+uy*ldy<0){ ux=-ux; uy=-uy; } }
    let lo=Infinity, hi=-Infinity, qlo=Infinity, qhi=-Infinity;
    for(const r of teile[a]) for(let e=0;e<4;e+=2){ const x=sg[r*S+e]-cx, y=sg[r*S+e+1]-cy, p=x*ux+y*uy, q=ux*y-uy*x;
      if(p<lo) lo=p; if(p>hi) hi=p; if(q<qlo) qlo=q; if(q>qhi) qhi=q; }
    X1[a]=cx+lo*ux; Y1[a]=cy+lo*uy; X2[a]=cx+hi*ux; Y2[a]=cy+hi*uy; LL[a]=hi-lo; UX[a]=ux; UY[a]=uy; WI[a]=winkel(a);
    SPX[a]=Math.max(1, SPX[a], (qhi-qlo)/2); };
  // Fixpunkt: je Durchgang nach Winkel sortiert, nur Nachbarn im Winkelfenster (mit Umlauf bei pi) pruefen
  let neu=true;
  while(neu){ neu=false;
    const ord=[]; for(let i=0;i<n;i++) if(lebt[i]) ord.push(i);
    ord.sort((p,q)=>WI[p]-WI[q] || p-q); const m=ord.length;
    for(let ii=0;ii<m;ii++){ const a=ord[ii]; if(!lebt[a]) continue;
      for(let jj=ii+1;jj<ii+m;jj++){ const c=ord[jj%m], dw=WI[c]-WI[a]+(jj>=m ? Math.PI : 0);
        if(dw>wMax) break;
        if(!lebt[c] || c===a) continue;
        const art=passt(a, c); if(art){ verschmelze(a, c, art); neu=true; } } } }
  // Ausgabe nach kleinstem Rohindex; Unberuehrte unveraendert, Verschmolzene neu eingeteilt
  const aus=[]; for(let i=0;i<n;i++) if(lebt[i]) aus.push([Math.min(...teile[i]), i]);
  aus.sort((p,q)=>p[0]-q[0]);
  const m=aus.length, seg=new Float32Array(m*S), cls=new Int8Array(m), dir=new Float32Array(m*6), nTeile=new Uint8Array(m), fr=Math.fround;
  let R=null;   // Bildrahmen erst, wenn etwas verschmolzen ist (braucht b.camTo, b.proj, b.w, b.h, b.flipY)
  for(let k=0;k<m;k++){ const i=aus[k][1];
    if(teile[i].length===1){ seg.set(sg.subarray(i*S, i*S+S), k*S); cls[k]=b.cls[i]; dir.set(b.dir.subarray(i*6, i*6+6), k*6); nTeile[k]=NT[i]; continue; }
    if(!R){ if(!b.camTo || !b.proj) throw new Error('lmVerschmelzen: bild ohne camTo/proj'); R=rahmen(b.w, b.h, b.proj, b.camTo, b.flipY, {...SEG_DEF, ...o.einteilen}); }
    cls[k]=einteilen1(R, fr(X1[i]), fr(Y1[i]), fr(X2[i]), fr(Y2[i]), SAL[i], SPX[i], k, seg, dir); nTeile[k]=NT[i]; }
  return {...b, n:m, seg, cls, dir, nTeile, man:new Int8Array(m).fill(-1)};
};

// ------------------------------------------------ Gier und rechte Winkel
// Wortgleich zu lib.gier / lib.rechtwinklig (karte/fixtures/lib.mjs, F1) und dem Platzhalter der Seite: ohne
// Verschmelzen sind psi0 und man bitgleich zu F1.
G.lmGier=(b,o={})=>{
  o={...GIER_DEF, ...o};
  const S=G.KG.SEG, q=VIERTEL, NB=Math.round(90/o.fachDeg), hst=new Float64Array(NB), idx=[];
  for(let i=0;i<b.n;i++) if(b.cls[i]===G.KG.KL.O || b.cls[i]===G.KG.KL.U){ const p=b.seg[i*S+6], wl=b.seg[i*S+9]; idx.push(i);
    hst[Math.floor(((p%q+q)%q)/q*NB)%NB]+=wl; }
  if(idx.length<o.minN) return null;
  const sg=o.glattDeg/o.fachDeg, R=Math.ceil(3*sg), gl=new Float64Array(NB);
  for(let j=0;j<NB;j++){ let s=0; for(let r=-R;r<=R;r++) s+=hst[(j+r+NB)%NB]*Math.exp(-r*r/(2*sg*sg)); gl[j]=s; }
  let jb=0; for(let j=1;j<NB;j++) if(gl[j]>gl[jb]) jb=j;
  const c0=(jb+0.5)/NB*q, win=o.fensterDeg*D2R; let sw=0, sr=0, n=0;
  for(const i of idx){ const r=d4(b.seg[i*S+6], c0); if(Math.abs(r)<win){ const wl=b.seg[i*S+9]; sw+=wl; sr+=wl*r; n++; } }
  if(n<o.minN) return null;
  const psi=((c0+sr/sw)%q+q)%q; let s2=0;
  for(const i of idx){ const r=d4(b.seg[i*S+6], psi); if(Math.abs(r)<win) s2+=b.seg[i*S+9]*r*r; }
  return {psi, sig:Math.sqrt(s2/sw)/Math.sqrt(n), n};
};
G.lmRechtwinklig=(b,psi0,o={})=>{
  o={...RECHT_DEF, ...o};
  const S=G.KG.SEG, man=new Int8Array(b.n).fill(-1);
  if(psi0) for(let i=0;i<b.n;i++){ const p=b.seg[i*S+6]; if(!Number.isFinite(p)) continue;
    let d=((p-psi0.psi)%Math.PI+Math.PI)%Math.PI, k=Math.round(d/(Math.PI/2)); const r=d-k*Math.PI/2; k%=2;
    if(Math.abs(r)<o.fensterDeg*D2R) man[i]=k; }
  return {...b, man};
};

// ------------------------------------------------ Bild-Worker-Schritt
// Vorgabe-Uhr nur zum Messen (ms), wie raumskizze-elsed.js; keine Entscheidung haengt an ihr.
const UHR=typeof performance!=='undefined' && performance.now ? ()=>performance.now() : null;
G.bildNeu=(o={})=>({o:{elsed:{...o.elsed}, segmente:{...SEG_DEF, ...o.segmente}, verschm:o.verschm===false ? false : {...VERSCHM_DEF, ...o.verschm},
  gier:{...GIER_DEF, ...o.gier}, recht:{...RECHT_DEF, ...o.recht}, senk:{...o.senk}, skala:o.skala ?? 'auto', senkLang:o.senkLang ?? 640,
  uhr:o.uhr===false ? null : (o.uhr || UHR)}, luma:null, nBilder:0});
G.bild=(BZ,A)=>{
  const o=BZ.o, uhr=o.uhr || (()=>0), w=A.w, h=A.h, flipY=!!A.flipY;
  const t0=uhr();
  if(!BZ.luma || BZ.luma.length!==w*h) BZ.luma=new Uint8Array(w*h);
  const g=G.lumaAus(A.buf, A.fmt, w, h, BZ.luma);
  const t1=uhr();
  const sc=o.skala==='auto' ? Math.min(w, h)/287 : +o.skala, eo={...o.elsed};
  if(eo.minLineLen==null && sc!==1) eo.minLineLen=Math.round(15*sc);
  const roh=G.elsed(g, w, h, eo);
  const t2=uhr();
  const proj=Float32Array.from(A.proj), camTo=Float64Array.from(A.camTo), so=sc===1 ? o.segmente : {...o.segmente, minLen:o.segmente.minLen*sc};
  const r=G.lmSegmente(roh, w, h, proj, camTo, flipY, so);
  let b={k:A.k, vi:A.vi, t:A.t, ep:A.ep, camTo, proj, flipY, w, h, f:G.fokusPx(proj, h), n:r.n, seg:r.seg, cls:r.cls,
    man:new Int8Array(r.n).fill(-1), dir:r.dir, nTeile:new Uint8Array(r.n).fill(1), psi0:null, senk:null, ms:null};
  const t3=uhr();
  if(o.verschm) b=G.lmVerschmelzen(b, {...o.verschm, dPx:o.verschm.dPx*sc, kollPx:o.verschm.kollPx*sc, gapPx:o.verschm.gapPx*sc, einteilen:so});
  const t4=uhr();
  const psi0=G.lmGier(b, o.gier); b=G.lmRechtwinklig(b, psi0, o.recht); b.psi0=psi0;
  const t5=uhr();
  if(A.senk){ const kl=Math.max(w, h)>o.senkLang ? G.lumaKlein(g, w, h, o.senkLang) : {g, w, h}; b.senk=G.verticalEdges(kl.g, kl.w, kl.h, proj, camTo, flipY, o.senk); }
  const t6=uhr();
  b.ms={luma:t1-t0, elsed:t2-t1, verschm:t4-t3, einteilen:(t3-t2)+(t5-t4), senk:t6-t5, gesamt:t6-t0};
  BZ.nBilder++;
  return b;
};
