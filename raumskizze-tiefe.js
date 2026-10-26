// ------------------------------------------------ Karte: Tiefe und Ebenen (M9)
// ARCore-Tiefe als zweite Messquelle mit eigener Guetepforte, dazu Boden-Freiraum,
// Wandebenen aus Tiefe, Kantenpruefung und senkrechte ARCore-Ebenen. Vertrag:
// ARCHITEKTUR v3, Abschnitte 3.5 (Strukturen wie tiefe.md 3.2, sec -> ab), 4 (Block M9:
// Signaturen wie tiefe.md 4, dazu G.ebeneAusAR), 8.6/10.7 (Freigaben), 17.8 (Bauauftrag).
// Die Datei steht wortgleich als eigener Block { ... } im geo-Block; sie setzt G, den
// geo-Kern (G.m4inv) und zur Laufzeit M0 (G.KG.rnd) voraus und haengt nur an G.
// Kein DOM, keine Uhr, kein Math.random: laeuft im Hauptfaden, im Worker und in Node.
//
// Tiefensatz (tiefe.md 2.1, dreifach geprueft): w x h Werte u16 (160 x 90), zeilenweise,
// Wert*scale = z-Abstand zur Bildebene (nicht Strahllaenge). M = normDepthBufferFromNormView
// (spaltenweise), Ansicht oben links, v nach unten, kein Zeitversatz zur Pose. Strahl je
// Pixel fuer z = -1, NICHT auf Laenge 1 normiert (wie tiefe/tiefe-lib.mjs unproject):
//   (u, v) = M^-1 · ((i+0.5)/w, (j+0.5)/h),   X = 2u-1,  Y = 1-2v,
//   dir = ((X + proj[8])/proj[0], (Y + proj[9])/proj[5], -1),   P = camTo · (s·dir).
// Richtung je Punkt w = (P - Kamera)/s (Kameraachse -z hat Laenge 1). Die Pforten-Schwellen
// w_y > 0,25 (Decke) bzw. < -0,25 (Boden) und die erwartete z-Tiefe (H - c_y)/w_y bzw. -c_y/w_y
// beziehen sich auf diese Form, wie in den Messungen (tiefe/decke2.mjs, strahl2.mjs).
//
// Freigaben (8.6, 10.7): Boden-Freiraum geht mit wBoden = 0 in den Umriss bis T-M4; Waende
// aus Tiefe (G.resTiefe, M6) Gewicht 0 bis T-M1/T-M2; Kantenpruefung erst nach T-M1 und nur
// mit raw; ARCore-Ebenen (G.resEbene) Gewicht 0 bis T-M6. Die Funktionen sind trotzdem da,
// damit Pruefstand und Nachspiel sie rechnen. Waende und Ebenen folgen 1.1: n = [cos phi,
// sin phi] zeigt zur freien Seite (Kamera), Linie n·p = rho in [x, z], phi in [0, 2pi).
//
// Aufruf je Tiefenbild d (DepthFrame) durch M10/T1, die Pforte haelt der Aufrufer:
//   F = G.depthFlags(d.raw, vorigesRaw, d.scale); L = G.depthLift(d.raw, d.scale, rays, d.camTo);
//   q = G.depthQuality(L, rays, d.camTo, H, {frame:d, flags:F, freigabe});   // typ = d.type, raw/smooth getrennt zaehlen
//   B nur bei q.pass.floorFree, C nur bei q.pass.walls, D nur bei q.pass.edges. B/C/D pruefen die Pforte nicht selbst.
//
// Abweichungen vom Entwurf (stehen im Bericht P-G):
//  - B: die freie Strecke endet vorBoden (Vorgabe halbe Zelldiagonale, 3,5 cm bei 5 cm) vor dem Bodenpunkt;
//    tiefe.md 3.3 B laesst den Bodenpunkt selbst mitzaehlen. Grund: Zellen auf der Wandlinie haben die Mitte
//    aussen; mit Punkt sind auf der Wahrheit 1,2 % der freien Zellen aussen, T-M4 (10.7) verlangt < 1 %.
//    vorBoden: 0 gibt das Verhalten des Entwurfs.
//  - A: pass.edges zusaetzlich an freigabe.kanten (T-M1 bestanden) gebunden, wie 8.6 "Kantenpruefung erst nach T-M1".
//
// Bezug: Alles rechnet im Rahmen der uebergebenen camTo, also im Bezug B_ab des Abschnitts.
// Ein Versatz nach F0 wird hier nie angewandt; das tun die Leser (M7/M10) ueber G.gBei.
/**
 * @typedef {{vi:number, t:number, w:number, h:number, scale:number, raw:Uint16Array, M:Float32Array,
 *   camTo:Float64Array, ab:number, type:('raw'|'smooth'|null), flags:{stale:boolean, flat:boolean, empty:boolean}}} DepthFrame
 *   type aus session.depthType (Satzkopf v2, u8: 0 unbekannt -> null, 1 raw, 2 smooth), Pflicht (3.5).
 * @typedef {{key:string, w:number, h:number, dir:Float32Array, inView:Uint8Array}} DepthRays  dir: 3 je Pixel, z = -1
 * @typedef {{P:Float32Array, s:Float32Array, idx:Int32Array, n:number, nPix:number, nNull:number, cam:number[]}} DepthLift
 * @typedef {{ceilN:number, ceilOk:number, ceilBeyond:number, floorN:number, floorOk:number, validFrac:number,
 *   typ:('raw'|'smooth'|null), pass:{floorFree:boolean, walls:boolean, edges:boolean}}} DepthQuality
 * @typedef {{cell:number, x0:number, z0:number, nx:number, nz:number, free:Uint16Array, occ:Uint16Array, ab:Int16Array,
 *   n:number, stempel:Int32Array, stempelO:Int32Array, occPsi:Float32Array, occ2:Uint8Array}} FloorGrid
 *   Draufsicht im Rahmen der camTo (je Abschnitt im Bezug B_ab). free/occ zaehlen Tiefenbilder (je Bild und Zelle
 *   hoechstens 1), ab je Zelle: -1 leer (oder nur Bilder ohne gueltiges ab), Abschnitt des ersten Schreibers, -2 gemischt. Zusatzfelder (zu 3.5):
 *   n Bilder, Stempel je Zelle, occPsi erste Blickrichtung (Plan-Gier, NaN), occ2 = 1 ab einer zweiten >= 20° daneben.
 * @typedef {{frame:number, ab:*, theta:number, rho:number, cov:number[][], extent:number[], zMed:number, nInl:number,
 *   rms:number, wallId:*}} DepthPlaneObs  theta wie phi (1.1), Linie im Bezug; cov [[sθθ, sθρ], [sθρ, sρρ]] um den Ursprung
 * @typedef {{segId:*, kind:'sprung'|'knick'|'glatt'|'unbekannt', dz:number, angleDeg:number, n:number}} DepthEdgeCheck
 * @typedef {{t:number, id:*, orient:(string|null), pose:number[], poly:Float32Array, changed:*}} PlaneRec
 *   pose [x, y, z, qx, qy, qz, qw] des Ebenenraums (Normale +y, Polygon in x/z) in ARCore-local
 */

const D2R=Math.PI/180, ZWEIPI=2*Math.PI;
const wrap2pi=a=>{ a%=ZWEIPI; return a<0 ? a+ZWEIPI : a; };
const wrapPi=a=>{ a=wrap2pi(a); return a>Math.PI ? a-ZWEIPI : a; };
const median=a=>{ if(!a.length) return NaN; const s=Float64Array.from(a).sort(); return s[s.length>>1]; };

// ------------------------------------------------ A. Strahlen, Merkmale, Heben
// Strahlen je (M, proj, w, h) einmal; key zum Zwischenspeichern beim Aufrufer.
G.depthRays=(M,proj,w,h)=>{
  const iM=G.m4inv(Array.from(M)); if(!iM) return null;
  const n=w*h, dir=new Float32Array(3*n), inView=new Uint8Array(n), fx=proj[0], fy=proj[5], cx=proj[8], cy=proj[9];
  for(let j=0;j<h;j++) for(let i=0;i<w;i++){
    const bu=(i+0.5)/w, bv=(j+0.5)/h, u=iM[0]*bu+iM[4]*bv+iM[12], v=iM[1]*bu+iM[5]*bv+iM[13], p=j*w+i;
    inView[p]=u>=0 && u<=1 && v>=0 && v<=1 ? 1 : 0;
    dir[3*p]=(2*u-1+cx)/fx; dir[3*p+1]=(1-2*v+cy)/fy; dir[3*p+2]=-1; }
  return {key:Array.from(M).join(',')+'|'+[proj[0], proj[5], proj[8], proj[9]].join(',')+'|'+w+'x'+h, w, h, dir, inView};
};
// k-ter Wert (0-basiert) der aufsteigend sortierten Werte != 0 ueber ein zweistufiges Histogramm
// (oberes Byte, dann unteres): exakt wie Sortieren, ohne Sortieren.
const rangWert=(raw,hi,k)=>{
  let b=0, c=0; while(c+hi[b]<=k){ c+=hi[b]; b++; }
  const lo=new Int32Array(256); for(let i=0;i<raw.length;i++){ const r=raw[i]; if(r && (r>>8)===b) lo[r&255]++; }
  let a=0; while(c+lo[a]<=k){ c+=lo[a]; a++; }
  return (b<<8)|a;
};
// stale: bytegleich zum Vorgaenger; empty: < 1 % gueltig; flat: 2-98-%-Spanne der gueltigen Werte < 5 cm
// (Rang floor(0,02·n) und floor(0,98·n) wie tiefe/strahl2.mjs).
G.depthFlags=(raw,prevRaw,scale)=>{
  const n=raw.length; let stale=!!prevRaw && prevRaw.length===n;
  if(stale) for(let i=0;i<n;i++) if(raw[i]!==prevRaw[i]){ stale=false; break; }
  const hi=new Int32Array(256); let nv=0;
  for(let i=0;i<n;i++){ const r=raw[i]; if(r){ hi[r>>8]++; nv++; } }
  const validFrac=n ? nv/n : 0;
  const flat=nv>0 && (rangWert(raw, hi, Math.floor(nv*0.98))-rangWert(raw, hi, Math.floor(nv*0.02)))*scale<0.05;
  return {stale, flat, empty:validFrac<0.01, validFrac};
};
// Heben in den Rahmen der camTo. ansicht: nur Pixel, die in der Ansicht liegen (wie alle Messungen in
// tiefe.md; Zusatzoption). nPix: besuchte Pixel, nNull: davon ohne Wert (fuer validFrac der Pforte).
G.depthLift=(raw,scale,rays,camTo,o={})=>{
  const step=o.step ?? 1, sMax=o.sMax ?? 8, ansicht=o.ansicht ?? true, w=rays.w, h=rays.h, D=rays.dir, V=rays.inView, m=camTo;
  const cap=Math.ceil(w/step)*Math.ceil(h/step), P=new Float32Array(3*cap), s=new Float32Array(cap), idx=new Int32Array(cap);
  let n=0, nPix=0, nNull=0;
  for(let j=0;j<h;j+=step) for(let i=0;i<w;i+=step){
    const p=j*w+i; if(ansicht && !V[p]) continue; nPix++;
    const r=raw[p]; if(!r){ nNull++; continue; }
    const z=r*scale; if(z>sMax) continue;
    const x=D[3*p]*z, y=D[3*p+1]*z, zz=D[3*p+2]*z;
    P[3*n]=m[0]*x+m[4]*y+m[8]*zz+m[12]; P[3*n+1]=m[1]*x+m[5]*y+m[9]*zz+m[13]; P[3*n+2]=m[2]*x+m[6]*y+m[10]*zz+m[14];
    s[n]=z; idx[n]=p; n++; }
  return {P:P.subarray(0, 3*n), s:s.subarray(0, n), idx:idx.subarray(0, n), n, nPix, nNull, cam:[m[12], m[13], m[14]]};
};
// Guetepforte je Bild (tiefe.md 3.3 A), braucht nur H und den Boden y = 0. Decke: w_y > wy, erwartet
// <= sMax; ceilBeyond Verh. > 1+tol (unmoeglich), ceilOk 1-tol <= Verh. <= 1+tol. Boden: w_y < -wy,
// erwartet <= sMax, |Verh.-1| <= tol. Ohne H nur der Bodenteil. Zusatzoptionen (zu tiefe.md 4):
//   frame: der DepthFrame des Bilds; typ und flags kommen daraus, wenn o.typ/o.flags fehlen.
//   typ: DepthFrame.type; alles ausser 'raw'/'smooth' (null, 'unbekannt' aus T1) gilt als null.
//   flags: DepthFrame.flags bzw. G.depthFlags (stale/flat/empty sperren alles). Zusaetzlich sperrt immer
//     validFrac < 1 % aus dem Heben (empty ohne flags; stale braucht den Vorgaenger und bleibt beim Aufrufer).
//   freigabe.waende: T-M1/T-M2 bestanden (walls auch ohne raw); freigabe.kanten: T-M1 bestanden (edges).
//   Mindestzahlen und Schwellen [S] aus tiefe.md 3.3/3.4. rays bleibt fuer die Signatur, wird nicht gebraucht.
// Zaehlregel der Deckenpforte: nur Deckenpixel, dazu ceilBeyond <= 5 % und ceilN >= 200 (Entwurfstext 3.3 A).
// Der Prototyp (tiefe/strahl2.mjs) zaehlte Decken- und Bodenpixel zusammen (nur ok >= 50 %); daher dort
// 12 / 57 / 8 bestandene Bilder, hier 0 an A6-A8 (repro.mjs rechnet beide Zaehlungen).
G.depthQuality=(lift,rays,camTo,H,o={})=>{
  const fr=o.frame || null, t0=o.typ ?? (fr ? fr.type : null), typ=t0==='raw' || t0==='smooth' ? t0 : null;
  const sMax=o.sMax ?? 2.5, wy=o.wy ?? 0.25, tol=o.tol ?? 0.05, fl=o.flags || (fr && fr.flags) || null, fg=o.freigabe || {};
  const minDecke=o.minDecke ?? 200, minBoden=o.minBoden ?? 200, bodenOk=o.bodenOk ?? 0.4, jenseits=o.jenseits ?? 0.05, deckeOk=o.deckeOk ?? 0.5;
  const cy=camTo[13], P=lift.P, S=lift.s, mitH=H!=null && Number.isFinite(H);
  let ceilN=0, ceilOk=0, ceilBeyond=0, floorN=0, floorOk=0;
  for(let k=0;k<lift.n;k++){
    const s=S[k], vy=(P[3*k+1]-cy)/s;
    if(vy>wy){ if(!mitH) continue; const se=(H-cy)/vy; if(se>sMax) continue; const r=s/se; ceilN++;
      if(r>1+tol) ceilBeyond++; else if(r>=1-tol) ceilOk++; }
    else if(vy<-wy){ const se=-cy/vy; if(!(se>0) || se>sMax) continue; floorN++; if(Math.abs(s/se-1)<=tol) floorOk++; } }
  const validFrac=lift.nPix ? (lift.nPix-lift.nNull)/lift.nPix : 0;
  const gesperrt=!!(fl && (fl.stale || fl.flat || fl.empty)) || validFrac<0.01;
  const decke=mitH && ceilN>=minDecke && ceilBeyond<=jenseits*ceilN && ceilOk>=deckeOk*ceilN;
  const walls=!gesperrt && decke && (typ==='raw' || !!fg.waende);
  return {ceilN, ceilOk, ceilBeyond, floorN, floorOk, validFrac, typ,
    pass:{floorFree:!gesperrt && floorN>=minBoden && floorOk>=bodenOk*floorN, walls, edges:walls && typ==='raw' && !!fg.kanten}};
};

// ------------------------------------------------ B. Boden-Freiraum und Moebelhinweis
// Raster waechst bei Bedarf in ganzen Zellen (rand m Zugabe); alle Felder werden umkopiert.
// Ein Raster nur mit den Feldern aus 3.5 (cell, x0, z0, nx, nz, free, occ, ab) bekommt die Zusatzfelder dazu.
const rasterVorbereiten=g=>{
  if(!g.free){ g.cell=g.cell || 0.05; g.nx=0; g.nz=0; g.x0=g.x0 || 0; g.z0=g.z0 || 0; g.free=new Uint16Array(0); g.occ=new Uint16Array(0); }
  const N=g.nx*g.nz; g.n=g.n || 0;
  if(!g.occ) g.occ=new Uint16Array(N);
  if(!g.ab) g.ab=new Int16Array(N).fill(-1);
  if(!g.stempel) g.stempel=new Int32Array(N).fill(-1);
  if(!g.stempelO) g.stempelO=new Int32Array(N).fill(-1);
  if(!g.occPsi) g.occPsi=new Float32Array(N).fill(NaN);
  if(!g.occ2) g.occ2=new Uint8Array(N); };
const rasterDecken=(g,xa,za,xb,zb,rand)=>{
  const c=g.cell, I0=Math.round(g.x0/c), J0=Math.round(g.z0/c);
  if(g.nx>0 && Math.floor(xa/c)>=I0 && Math.floor(za/c)>=J0 && Math.floor(xb/c)<I0+g.nx && Math.floor(zb/c)<J0+g.nz) return;
  let i0=Math.floor((xa-rand)/c), j0=Math.floor((za-rand)/c), i1=Math.floor((xb+rand)/c), j1=Math.floor((zb+rand)/c);
  if(g.nx>0){ i0=Math.min(i0, I0); j0=Math.min(j0, J0); i1=Math.max(i1, I0+g.nx-1); j1=Math.max(j1, J0+g.nz-1); }
  const nx=i1-i0+1, nz=j1-j0+1, N=nx*nz, alt=g, neu={free:new Uint16Array(N), occ:new Uint16Array(N), ab:new Int16Array(N).fill(-1),
    stempel:new Int32Array(N).fill(-1), stempelO:new Int32Array(N).fill(-1), occPsi:new Float32Array(N).fill(NaN), occ2:new Uint8Array(N)};
  for(let j=0;j<alt.nz;j++) for(let i=0;i<alt.nx;i++){ const a=j*alt.nx+i, b=(J0+j-j0)*nx+(I0+i-i0);
    for(const k in neu) neu[k][b]=alt[k][a]; }
  Object.assign(g, neu, {x0:i0*c, z0:j0*c, nx, nz});
};
// Alle Zellen auf der Strecke a -> b je einmal (Amanatides-Woo), in Zellindizes des Rasters.
const strecke=(g,ax,az,bx,bz,besuch)=>{
  const c=g.cell, I0=Math.round(g.x0/c), J0=Math.round(g.z0/c);
  let ix=Math.floor(ax/c), iz=Math.floor(az/c); const jx=Math.floor(bx/c), jz=Math.floor(bz/c);
  const dx=bx-ax, dz=bz-az, sx=dx>0 ? 1 : -1, sz=dz>0 ? 1 : -1;
  const tdx=dx!==0 ? c/Math.abs(dx) : Infinity, tdz=dz!==0 ? c/Math.abs(dz) : Infinity;
  let tx=dx!==0 ? (sx>0 ? (ix+1)*c-ax : ax-ix*c)/Math.abs(dx) : Infinity, tz=dz!==0 ? (sz>0 ? (iz+1)*c-az : az-iz*c)/Math.abs(dz) : Infinity;
  besuch((iz-J0)*g.nx+(ix-I0));
  for(let k=Math.abs(jx-ix)+Math.abs(jz-iz);k>0;k--){ if(tx<tz){ tx+=tdx; ix+=sx; } else { tz+=tdz; iz+=sz; } besuch((iz-J0)*g.nx+(ix-I0)); }
};
// Bodenpixel: |y| < yTol, sMin <= s <= sMax, |s/s_Boden - 1| < tol -> Strecke Kamera -> Bodenpunkt frei,
// im Grundriss um vorBoden vor dem Bodenpunkt beendet (Vorgabe halbe Zelldiagonale; Grundriss-Abstand
// <= vorBoden: keine Strecke). vorBoden 0: Bodenpunkt eingeschlossen wie tiefe.md 3.3 B ("Boden sichtbar").
// Moebelhinweis: Bodenstrahl (w_y < -wy, s_Boden in [sMin, sMax]) endet frueh (s/s_Boden < early), Punkt
// hMoebel[0]..[1] hoch -> occ an der Punktzelle; "texturiert" (tiefe.md 3.3 B) kennt M9 nicht, der Aufrufer
// gibt es mit (Vorgabe true). jede: jeder k-te Bodenpunkt (Zusatzoption, Strahlen benachbarter Pixel decken
// dieselben Zellen). ab: ganze Zahl 0..32767, sonst (null, zu gross) bleibt grid.ab unberuehrt. Schreibt grid.
G.depthFloorFree=(lift,camTo,grid,ab,o={})=>{
  const yTol=o.yTol ?? 0.05, sMin=o.sMin ?? 0.8, sMax=o.sMax ?? 2.5, early=o.early ?? 0.85, tol=o.tol ?? 0.05, wy=o.wy ?? 0.25;
  const hM=o.hMoebel || [0.05, 1.2], jede=o.jede ?? 1, richt=(o.richtDeg ?? 20)*D2R, texturiert=o.texturiert ?? true, rand=o.rand ?? 1.0;
  rasterVorbereiten(grid);
  const vb=o.vorBoden ?? grid.cell*Math.SQRT1_2, abOk=Number.isInteger(ab) && ab>=0 && ab<=32767;
  const cx=camTo[12], cy=camTo[13], cz=camTo[14], P=lift.P, S=lift.s;
  const boden=[], moebel=[]; let xa=cx, xb=cx, za=cz, zb=cz, nb=0;
  for(let k=0;k<lift.n;k++){
    const s=S[k], y=P[3*k+1], vy=(y-cy)/s; if(!(vy<0)) continue;
    const se=-cy/vy; if(!(se>=sMin && se<=sMax)) continue;
    const r=s/se;
    if(Math.abs(y)<yTol && s>=sMin && s<=sMax && Math.abs(r-1)<tol){ if(nb++%jede) continue; boden.push(k); }
    else if(texturiert && vy<-wy && r<early && y>=hM[0] && y<=hM[1]) moebel.push(k);
    else continue;
    const x=P[3*k], z=P[3*k+2]; if(x<xa) xa=x; if(x>xb) xb=x; if(z<za) za=z; if(z>zb) zb=z; }
  grid.n++;
  if(!boden.length && !moebel.length) return {nFree:0, nOcc:0, nBoden:0, nMoebel:0};
  rasterDecken(grid, xa, za, xb, zb, rand);
  const st=grid.n, F=grid.free, A=grid.ab, ST=grid.stempel;
  let nFree=0, nOcc=0;
  const abSetzen=q=>{ if(abOk) A[q]=A[q]===-1 ? ab : A[q]===ab ? ab : -2; };
  const frei=q=>{ if(ST[q]===st) return; ST[q]=st; if(F[q]<65535) F[q]++; nFree++; abSetzen(q); };
  for(const k of boden){ const bx=P[3*k], bz=P[3*k+2];
    if(!(vb>0)){ strecke(grid, cx, cz, bx, bz, frei); continue; }
    const dx=bx-cx, dz=bz-cz, L=Math.sqrt(dx*dx+dz*dz); if(!(L>vb)) continue;
    const f=(L-vb)/L; strecke(grid, cx, cz, cx+f*dx, cz+f*dz, frei); }
  const c=grid.cell, I0=Math.round(grid.x0/c), J0=Math.round(grid.z0/c), O=grid.occ, SO=grid.stempelO, PS=grid.occPsi, O2=grid.occ2;
  for(const k of moebel){
    const x=P[3*k], z=P[3*k+2], q=(Math.floor(z/c)-J0)*grid.nx+(Math.floor(x/c)-I0);
    if(SO[q]===st) continue; SO[q]=st; if(O[q]<65535) O[q]++; nOcc++; abSetzen(q);
    const psi=Math.atan2(z-cz, x-cx);
    if(Number.isNaN(PS[q])) PS[q]=psi; else if(Math.abs(wrapPi(psi-PS[q]))>=richt) O2[q]=1; }
  return {nFree, nOcc, nBoden:boden.length, nMoebel:moebel.length};
};

// ------------------------------------------------ C. Wandebenen aus Tiefe (nur mit pass.walls, prueft der Aufrufer)
// 2D-RANSAC im Grundriss (Waende senkrecht): Punkte yMin..yMax hoch, s <= sMax; Schwelle
// tau(s) = max(tauMin, 2·sigma(s)); it Ziehungen, gezaehlt auf <= nMax Punkten; bis maxPlanes Ebenen
// nacheinander (hoechstens 2·maxPlanes Versuche), je >= minInl Inlier (alle Punkte) und >= minExt
// Ausdehnung; Feinlage mit Hauptachsen
// (2 Runden). cov aus den Inliern mit n_eff = min(n, nEff) statt n (Pixel korreliert, tiefe 2.6).
// Zusammenhang (Zusatz zu tiefe.md 3.3 C): die Inlier zerfallen laengs der Linie an Luecken > maxLuecke;
// nur das staerkste Stueck zaehlt. Sonst fasst eine schraege Linie senkrechte Streifen mehrerer Waende
// (im Grundriss je ein kurzes Stueck) und kollineare Nachbarwaende mit 1-4 cm Versatz (R3) zusammen.
// sigma: Platzhalter 1,5 cm [S], sigma0 und k kommen aus T-M3. Zufall nur ueber G.KG.rnd(seed).
// Zusatzoptionen: seed, bild (-> frame), ab, nEff, nMax, tauMin, minAbst, maxLuecke.
G.depthWallPlanes=(lift,o={})=>{
  const yMin=o.yMin ?? 0.3, yMax=o.yMax ?? 2.2, sMax=o.sMax ?? 6, it=o.it ?? 150, maxPlanes=o.maxPlanes ?? 3, minInl=o.minInl ?? 300;
  const minExt=o.minExt ?? 0.5, sigma=o.sigma || (()=>0.015), tauMin=o.tauMin ?? 0.03, nMax=o.nMax ?? 1500, nEff=o.nEff ?? 30;
  const minAbst=o.minAbst ?? 0.2, maxLuecke=o.maxLuecke ?? 0.3, rnd=G.KG.rnd(o.seed ?? 1), P=lift.P, S=lift.s, cam=lift.cam;
  const sel=[], tau=new Float32Array(lift.n);
  for(let k=0;k<lift.n;k++){ const y=P[3*k+1]; if(y<yMin || y>yMax || S[k]>sMax) continue; sel.push(k); tau[k]=Math.max(tauMin, 2*sigma(S[k])); }
  const benutzt=new Uint8Array(lift.n), aus=[];
  const inlier=(L,frei)=>frei.filter(k=>Math.abs(L.nx*P[3*k]+L.nz*P[3*k+2]-L.d)<tau[k]);
  const hauptachse=ids=>{ let mx=0, mz=0; for(const k of ids){ mx+=P[3*k]; mz+=P[3*k+2]; } mx/=ids.length; mz/=ids.length;
    let sxx=0, sxz=0, szz=0; for(const k of ids){ const a=P[3*k]-mx, b=P[3*k+2]-mz; sxx+=a*a; sxz+=a*b; szz+=b*b; }
    const al=0.5*Math.atan2(2*sxz, sxx-szz), nx=-Math.sin(al), nz=Math.cos(al); return {nx, nz, d:nx*mx+nz*mz, mx, mz}; };
  // staerkstes zusammenhaengendes Stueck laengs u (Luecken > maxLuecke trennen); Gleichstand: erstes
  const stueck=(L,ids)=>{ const ux=-L.nz, uz=L.nx, s=ids.map(k=>ux*P[3*k]+uz*P[3*k+2]), o=s.map((_,i)=>i).sort((a,b)=>s[a]-s[b]||ids[a]-ids[b]);
    let best=[0, 0], a=0; for(let i=1;i<=o.length;i++) if(i===o.length || s[o[i]]-s[o[i-1]]>maxLuecke){ if(i-a>best[1]-best[0]) best=[a, i]; a=i; }
    return o.slice(best[0], best[1]).map(i=>ids[i]).sort((x,y)=>x-y); };
  for(let versuch=0;aus.length<maxPlanes && versuch<2*maxPlanes;versuch++){   // hoechstens 2·maxPlanes Versuche
    const frei=sel.filter(k=>!benutzt[k]); if(frei.length<minInl) break;
    const schritt=Math.max(1, Math.floor(frei.length/nMax)); let best=null;
    for(let t=0;t<it;t++){
      const a=frei[Math.floor(rnd()*frei.length)], b=frei[Math.floor(rnd()*frei.length)];
      const dx=P[3*b]-P[3*a], dz=P[3*b+2]-P[3*a+2], L=Math.hypot(dx, dz); if(!(L>=minAbst)) continue;
      const nx=-dz/L, nz=dx/L, d=nx*P[3*a]+nz*P[3*a+2]; let c=0;
      for(let q=0;q<frei.length;q+=schritt){ const k=frei[q]; if(Math.abs(nx*P[3*k]+nz*P[3*k+2]-d)<tau[k]) c++; }
      if(!best || c>best.c) best={nx, nz, d, c}; }
    if(!best) break;
    let L=best, ids=stueck(L, inlier(L, frei));
    for(let r=0;r<2 && ids.length>=2;r++){ L=hauptachse(ids); ids=stueck(L, inlier(L, frei)); }
    if(ids.length<minInl){ for(const k of ids) benutzt[k]=1; continue; }
    for(const k of ids) benutzt[k]=1;
    const F=hauptachse(ids); let {nx, nz, d}=F;
    if(nx*cam[0]+nz*cam[2]-d<0){ nx=-nx; nz=-nz; d=-d; }
    const ux=-nz, uz=nx, us=ids.map(k=>ux*P[3*k]+uz*P[3*k+2]); let a=Infinity, b=-Infinity, mu=0, r2=0;
    for(const v of us){ if(v<a) a=v; if(v>b) b=v; mu+=v; } mu/=us.length;
    if(b-a<minExt) continue;
    let vu=0; for(const v of us) vu+=(v-mu)*(v-mu); vu/=us.length;
    for(const k of ids){ const r=nx*P[3*k]+nz*P[3*k+2]-d; r2+=r*r; }
    const N=ids.length, rms=Math.sqrt(r2/N), ne=Math.min(N, nEff), vt=rms*rms/(ne*Math.max(vu, 1e-12)), vr=rms*rms/ne;
    const uc=ux*F.mx+uz*F.mz;   // d rho / d theta an der Mitte
    aus.push({frame:o.bild ?? -1, ab:o.ab ?? null, theta:wrap2pi(Math.atan2(nz, nx)), rho:d, cov:[[vt, uc*vt], [uc*vt, uc*uc*vt+vr]],
      extent:[a, b], zMed:median(ids.map(k=>S[k])), nInl:N, rms, wallId:null}); }
  return aus;
};
// Zuordnung zur Landmarke (tiefe.md 3.3 C 4): |Delta phi| < maxDeg (mod 2pi: Gegenflaechen sind getrennte
// Waende), Mahalanobis chi2(2) < chi2 ueber (phi, rho) mit beiden Kovarianzen, Ueberlapp des gesehenen
// Stuecks mit einem Stuetzintervall (Wand.iv; fehlt iv, entfaellt die Pruefung). Mehrdeutig -> null.
// walls: Waende im Bezug der Beobachtung (z. B. G.zuBezug(stand, G.gBei(A, t)).waende), Felder wie Wand
// (phi oder theta, rho, cov [sφφ, sφρ, sρρ] oder 2x2, iv [{s0, s1}] oder [[s0, s1]]).
const cov3=c=>!c ? [0, 0, 0] : Array.isArray(c[0]) ? [c[0][0], c[0][1], c[1][1]] : [c[0], c[1], c[2]];
G.depthAssoc=(obs,walls,o={})=>{
  const maxDeg=o.maxDeg ?? 5, chi2=o.chi2 ?? 9.21, zu=o.ueberlapp ?? 0;
  return obs.map(b=>{
    const cb=cov3(b.cov), nb=[Math.cos(b.theta), Math.sin(b.theta)], ub=[-nb[1], nb[0]];
    const pa=[b.rho*nb[0]+b.extent[0]*ub[0], b.rho*nb[1]+b.extent[0]*ub[1]], pb=[b.rho*nb[0]+b.extent[1]*ub[0], b.rho*nb[1]+b.extent[1]*ub[1]];
    let wallId=null, nT=0;
    for(const W of walls){
      const phi=W.phi ?? W.theta, dphi=wrapPi(b.theta-phi); if(!(Math.abs(dphi)<maxDeg*D2R)) continue;
      const cw=cov3(W.cov), s11=cb[0]+cw[0], s12=cb[1]+cw[1], s22=cb[2]+cw[2], det=s11*s22-s12*s12; if(!(det>0)) continue;
      const dr=b.rho-W.rho, d2=(s22*dphi*dphi-2*s12*dphi*dr+s11*dr*dr)/det; if(!(d2<chi2)) continue;
      if(W.iv){ const uw=[-Math.sin(phi), Math.cos(phi)], s0=Math.min(uw[0]*pa[0]+uw[1]*pa[1], uw[0]*pb[0]+uw[1]*pb[1]),
          s1=Math.max(uw[0]*pa[0]+uw[1]*pa[1], uw[0]*pb[0]+uw[1]*pb[1]);
        if(!W.iv.some(v=>{ const v0=Array.isArray(v) ? v[0] : v.s0, v1=Array.isArray(v) ? v[1] : v.s1; return s0<=v1+zu && s1>=v0-zu; })) continue; }
      nT++; wallId=W.id; }
    return {...b, wallId:nT===1 ? wallId : null};
  });
};

// ------------------------------------------------ D. Kantenpruefung (nur mit pass.edges, also raw und T-M1, prueft der Aufrufer)
// Quer zum Segment (NDC der Ansicht, y oben) je Stichprobe ein Tiefenprofil +-halfPx Pufferpixel, je Seite
// eine Gerade z = a + b·o. dz = a_rechts - a_links an der Kante, Winkel der Seiten aus b/(z·radPx).
// sprung: |dz| > max(jump, 3·sigma) (verdeckende Kante); knick: stetig, Seiten > kneeDeg auseinander
// (Innenecke); glatt: stetig ohne Knick; unbekannt: < 3 gueltige Stichproben. Zusatzoptionen: w, h (Puffer),
// radPx (Winkel je Pufferpixel, Vorgabe 69,5°/160 aus tiefe.md 2.1), segId, minSeite.
G.depthEdgeCheck=(raw,scale,M,segNdc,o={})=>{
  const halfPx=o.halfPx ?? 6, jump=o.jump ?? 0.10, kneeDeg=o.kneeDeg ?? 30, w=o.w ?? 160, h=o.h ?? 90;
  const radPx=o.radPx ?? 69.5*D2R/160, segId=o.segId ?? -1, minSeite=o.minSeite ?? 3;
  const zuPuffer=q=>{ const u=(q[0]+1)/2, v=(1-q[1])/2; return [(M[0]*u+M[4]*v+M[12])*w-0.5, (M[1]*u+M[5]*v+M[13])*h-0.5]; };
  const A=zuPuffer(segNdc[0]), B=zuPuffer(segNdc[1]), L=Math.hypot(B[0]-A[0], B[1]-A[1]);
  const leer={segId, kind:'unbekannt', dz:NaN, angleDeg:NaN, n:0}; if(!(L>0)) return leer;
  const ex=(B[0]-A[0])/L, ey=(B[1]-A[1])/L, qx=-ey, qy=ex;
  const wert=(x,y)=>{ const i=Math.round(x), j=Math.round(y); return i<0 || j<0 || i>=w || j>=h ? 0 : raw[j*w+i]*scale; };
  const DZ=[], KN=[], SG=[];
  for(let k=0, nS=Math.max(1, Math.floor(L));k<=nS;k++){
    const px=A[0]+ex*k*L/nS, py=A[1]+ey*k*L/nS;
    const gerade=sg=>{ let n=0, so=0, sz=0, soo=0, soz=0; const pt=[];
      for(let q=1;q<=halfPx;q++){ const oo=sg*q, z=wert(px+qx*oo, py+qy*oo); if(z>0){ n++; so+=oo; sz+=z; soo+=oo*oo; soz+=oo*z; pt.push([oo, z]); } }
      if(n<minSeite) return null; const den=n*soo-so*so; if(!(Math.abs(den)>1e-12)) return null;
      const b=(n*soz-so*sz)/den, a=(sz-b*so)/n; let r2=0; for(const [oo, z] of pt) r2+=(z-a-b*oo)**2;
      return {a, b, s:Math.sqrt(r2/Math.max(1, n-2))}; };
    const l=gerade(-1), r=gerade(1); if(!l || !r) continue;
    const z0=(l.a+r.a)/2; if(!(z0>0)) continue;
    DZ.push(r.a-l.a); KN.push(Math.abs(Math.atan(r.b/(z0*radPx))-Math.atan(l.b/(z0*radPx)))/D2R); SG.push(Math.max(l.s, r.s)); }
  if(DZ.length<3) return {...leer, n:DZ.length};
  const dz=median(DZ), angleDeg=median(KN), sig=median(SG);
  const kind=Math.abs(dz)>Math.max(jump, 3*sig) ? 'sprung' : angleDeg>kneeDeg ? 'knick' : 'glatt';
  return {segId, kind, dz, angleDeg, n:DZ.length};
};

// ------------------------------------------------ G. Senkrechte ARCore-Ebenen (Gewicht 0 bis T-M6)
// PlaneRec -> EbeneBeob. bezug: 4x4 (spaltenweise) ARCore-local -> Bezug B_ab zur Zeit t, also T^-1 der
// Zustandszeile (Einheit, wenn die App die Pose schon im Bezug aufzeichnet). Ebenenraum: Normale +y,
// Polygon in x/z. Senkrecht heisst |n_y| <= sin(senkrechtDeg); extent = Polygon auf u projiziert, >= minExt.
// Freie Seite: o.kamera ([x, y, z] oder [x, z] im Bezug) auf der positiven Seite; ohne Kamera gilt die
// Ebenennormale. cov ist Platzhalter [S] (Ziel T-M6: 2° / 5 cm), um den Ursprung wie Wand.cov.
// Nimmt auch die Zeilen von ebenen.jsonl der App (Stand 6): o 'v'|'h'|null statt orient, poly [[x, z], ...].
// Zusatzoptionen: kamera, ab, sPhiDeg, sRho.
G.ebeneAusAR=(pr,bezug,o={})=>{
  const senkrechtDeg=o.senkrechtDeg ?? 5, minExt=o.minExt ?? 0.3, ka=o.kamera || null, sPhi=(o.sPhiDeg ?? 2)*D2R, sRho=o.sRho ?? 0.05;
  const orient=pr && (pr.orient ?? pr.o), poly=pr && pr.poly && (Array.isArray(pr.poly[0]) ? pr.poly.flat() : pr.poly);
  if(!(orient==='vertical' || orient==='v') || !pr.pose || !poly || poly.length<6) return null;
  const [px, py, pz, x, y, z, w]=pr.pose, B=bezug || [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  const ax=[1-2*(y*y+z*z), 2*(x*y+z*w), 2*(x*z-y*w)], ay=[2*(x*y-z*w), 1-2*(x*x+z*z), 2*(y*z+x*w)], az=[2*(x*z+y*w), 2*(y*z-x*w), 1-2*(x*x+y*y)];
  const lage=v=>[B[0]*v[0]+B[4]*v[1]+B[8]*v[2]+B[12], B[1]*v[0]+B[5]*v[1]+B[9]*v[2]+B[13], B[2]*v[0]+B[6]*v[1]+B[10]*v[2]+B[14]];
  const nw=[B[0]*ay[0]+B[4]*ay[1]+B[8]*ay[2], B[1]*ay[0]+B[5]*ay[1]+B[9]*ay[2], B[2]*ay[0]+B[6]*ay[1]+B[10]*ay[2]];
  const nl=Math.hypot(nw[0], nw[1], nw[2]), nh=Math.hypot(nw[0], nw[2]);
  if(!(nl>0) || Math.abs(nw[1])/nl>Math.sin(senkrechtDeg*D2R) || !(nh>0)) return null;
  let nx=nw[0]/nh, nz=nw[2]/nh; const c=lage([px, py, pz]); let rho=nx*c[0]+nz*c[2];
  if(ka){ const kx=ka[0], kz=ka.length>2 ? ka[2] : ka[1]; if(nx*kx+nz*kz-rho<0){ nx=-nx; nz=-nz; rho=-rho; } }
  const ux=-nz, uz=nx; let s0=Infinity, s1=-Infinity;
  for(let i=0;i+1<poly.length;i+=2){ const a=poly[i], b=poly[i+1];
    const q=lage([px+ax[0]*a+az[0]*b, py+ax[1]*a+az[1]*b, pz+ax[2]*a+az[2]*b]), s=ux*q[0]+uz*q[2]; if(s<s0) s0=s; if(s>s1) s1=s; }
  if(!(s1-s0>=minExt)) return null;
  const sm=(s0+s1)/2, vp=sPhi*sPhi;
  return {t:pr.t, id:pr.id, ab:o.ab ?? null, phi:wrap2pi(Math.atan2(nz, nx)), rho, cov:[vp, sm*vp, sm*sm*vp+sRho*sRho], extent:[s0, s1],
    quelle:'ar', wallId:null};
};
