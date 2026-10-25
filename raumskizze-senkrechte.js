// ------------------------------------------------ Senkrechte im Bild
// Raumecken (Wand-Wand-Kanten) sind senkrecht. Ihr Bild laeuft durch den
// Fluchtpunkt der Senkrechten v = Projektion der Richtung +Y - die Pose
// liefert ihn, nichts muss geschaetzt werden. Darum genuegt eine 1D-Hough:
// jedes Pixel liegt auf genau einer Senkrechten (der Geraden durch v), die
// die Bezugszeile in x_ref schneidet; es stimmt dort SIGNIERT mit seinem
// Gradienten quer zu dieser Geraden ab (wie edgeCandidates: entlang einer
// echten Kante addiert sich das Signal linear, Rauschen mit der Wurzel).
// Danach je Spitze: Stuetze entlang der Geraden (z wie lineSupport), oberes
// Ende T, und am oberen Ende die Probe auf die Deckenkanten (junctionAt):
//   - Raumecke (konkav, von innen gesehen): an T gehen ZWEI Deckenkanten ab,
//     im Grundriss 30-150° auseinander, und die Kamera steht im Keil zwischen
//     ihnen (der Raum liegt zwischen den Waenden, die Kamera im Raum) -> 'ecke'
//     (konkav:true). Nur dann 'ecke'.
//   - Vorspringende Kante (Quaderoberkante, deckenhohes Regal, Aussenecke):
//     die Kamera steht ausserhalb des Keils. Aus einem Bild nicht zu trennen
//     -> 'unten' mit grund 'konvex' (konkav:false); die Peilung bleibt fuers
//     Modell. (o.konvexEcke: altes Verhalten, 'ecke' wenn ueber T nichts liegt.)
//   - Fensterlaibung/Tuerzarge/Schlagschatten bis zur Decke: die Deckenkante
//     laeuft durch T hindurch (zwei Richtungen mehr als 150° auseinander)
//     -> 'durch'.
//   - Nur eine waagerechte Kante an T (Tuerzarge, Bilderrahmen, Fenster,
//     Fuge Schrank-Wand, Ecke mit kaum sichtbarer zweiter Deckenkante) oder
//     keine -> 'unten' (grund 'eine-seite' / 'keine-seite').
//   - Geht die Senkrechte ueber T hinaus weiter, oder liegt T so nah am
//     Bildrand, dass die Probe nicht passt -> 'weiter' (grund 'weiter'/'rand').
// Zusatzfelder je Fund: grund, konkav (true/false/null), nSeiten, seiten
// (die zwei gewerteten Deckenkanten: Grundrissrichtung psiDeg und z).
// Die Peilung (Azimut im Grundriss) haengt weder von H noch von der
// Kamerahoehe ab: alle Punkte einer Senkrechten haben von der Kamera aus
// denselben Azimut (physik.mjs).
G.vertVanish=(proj,camTo,W,H,flipY)=>{
  const inv=G.m4inv(camTo); if(!inv) return null;
  const c=G.m4vec(proj, G.m4vec(inv,[0,1,0,0]));
  return [(c[0]+c[3])/2*W-0.5*c[3], flipY ? (c[3]-c[1])/2*H-0.5*c[3] : (c[1]+c[3])/2*H-0.5*c[3], c[3]];
};
// Richtung "oben" (Pixel) an (x,y) zum homogenen Fluchtpunkt V.
const upAt=(V,x,y)=>{ const dx=V[0]-x*V[2], dy=V[1]-y*V[2], n=Math.hypot(dx,dy); return n>1e-9 ? [dx/n, dy/n] : null; };
G.verticalEdges=(g,W,H,proj,camTo,flipY,o={})=>{
  const V=G.vertVanish(proj,camTo,W,H,flipY); if(!V) return [];
  const yr=(H-1)/2, c0=upAt(V,(W-1)/2,yr); if(!c0 || Math.abs(c0[1])<0.5) return [];   // Telefon quer: nicht hier
  const band=o.band??0.32, step=o.rowStep??3, x0=-0.5*W, NB=Math.ceil(4*W), acc=new Float64Array(NB), cnt=new Float64Array(NB);
  const ya=Math.max(1,Math.floor(yr-band*H)), yb=Math.min(H-2,Math.ceil(yr+band*H)), minG=o.minGrad??1.5;
  for(let y=ya;y<=yb;y+=step) for(let x=1;x<W-1;x++){
    const i=y*W+x;
    const gx=(g[i-W+1]+2*g[i+1]+g[i+W+1])-(g[i-W-1]+2*g[i-1]+g[i+W-1]);
    const gy=(g[i+W-1]+2*g[i+W]+g[i+W+1])-(g[i-W-1]+2*g[i-W]+g[i-W+1]);
    if(Math.abs(gx)+Math.abs(gy)<minG) continue;
    const d=upAt(V,x,y); if(!d || Math.abs(d[1])<0.3) continue;
    const s=-gx*d[1]+gy*d[0], p=gx*d[0]+gy*d[1];
    if(p*p>0.5*s*s) continue;                       // Gradient nicht quer zur Senkrechten (> ~35°)
    const xr=x+(yr-y)*d[0]/d[1], b=Math.round((xr-x0)*2);
    if(b<1 || b>=NB-1) continue;
    acc[b]+=s; cnt[b]++;
  }
  // Spitzen: |Summe| lokal maximal (±3 px), die staerksten zuerst.
  const pk=[];
  for(let b=2;b<NB-2;b++){ const a=Math.abs(acc[b-1]+acc[b]+acc[b+1]); if(a<=0) continue;
    let ok=true; for(let k=-6;k<=6 && ok;k++){ if(!k || b+k<2 || b+k>=NB-2) continue; if(Math.abs(acc[b+k-1]+acc[b+k]+acc[b+k+1])>a) ok=false; }
    if(ok) pk.push({b, a, sign:Math.sign(acc[b-1]+acc[b]+acc[b+1])||1}); }
  pk.sort((p,q)=>q.a-p.a);
  const out=[], resp=(x,y,L)=>{ const xi=Math.round(x), yi=Math.round(y); if(xi<1||yi<1||xi>W-2||yi>H-2) return null;
    const [gx,gy]=sobel(g,W,xi,yi); return (gx*L.nx+gy*L.ny)*L.sign; };
  for(const P0 of pk.slice(0, o.maxPeaks??5)){
    const xr=P0.b/2+x0, d=upAt(V,xr,yr); if(!d) continue;
    const L={px:xr, py:yr, dx:d[0], dy:d[1], nx:-d[1], ny:d[0], sign:P0.sign};
    // Stuetze entlang der Geraden (±1 px quer), Rauschboden 6 px daneben.
    const S=[]; let tmin=Infinity, tmax=-Infinity;
    for(let t=-H;t<=H;t++){ const bx=L.px+t*L.dx, by=L.py+t*L.dy; if(bx<1||by<1||bx>W-2||by>H-2) continue;
      let bv=-Infinity; const rk=[-1,0,1].map(k=>resp(bx+k*L.nx, by+k*L.ny, L)??0); for(const v of rk) if(v>bv) bv=v;
      const n1=resp(bx+6*L.nx,by+6*L.ny,L)??0, n2=resp(bx-6*L.nx,by-6*L.ny,L)??0;
      S.push({t, v:bv, rk, n1, n2, nz:Math.max(Math.abs(n1),Math.abs(n2))}); tmin=Math.min(tmin,t); tmax=Math.max(tmax,t); }
    if(S.length<20) continue;
    // Stuetze entscheiden auf dem gleitenden Mittel entlang der Geraden
    // (±sw px): die Senkrechte ist gerade, ihr Signal bleibt, Rauschen sinkt
    // mit der Wurzel. Einzelpixel zerrissen schwache Ecken (4-6 Stufen
    // Wand/Wand bei Rauschen 2) in Stuecke unter 40 px. Maximum ueber die
    // Querlage ±1 px erst NACH dem Mitteln, Rauschboden genauso gemittelt.
    const sw=o.glatt??3;
    if(sw>0){ const n=S.length, P=[0,1,2,3,4].map(()=>new Float64Array(n+1));
      for(let i=0;i<n;i++){ const s=S[i]; P[0][i+1]=P[0][i]+s.rk[0]; P[1][i+1]=P[1][i]+s.rk[1]; P[2][i+1]=P[2][i]+s.rk[2]; P[3][i+1]=P[3][i]+s.n1; P[4][i+1]=P[4][i]+s.n2; }
      for(let i=0;i<n;i++){ const a=Math.max(0,i-sw), b=Math.min(n,i+sw+1), m=j=>(P[j][b]-P[j][a])/(b-a);
        S[i].vs=Math.max(m(0),m(1),m(2)); S[i].nzs=Math.max(Math.abs(m(3)),Math.abs(m(4))); } }
    else for(const s of S){ s.vs=s.v; s.nzs=s.nz; }
    const nz=S.map(s=>s.nzs).sort((a,b)=>a-b), noise=nz[nz.length>>1]||0;
    const inBand=S.filter(s=>{ const y=L.py+s.t*L.dy; return y>=ya && y<=yb; }).map(s=>s.vs).sort((a,b)=>a-b);
    const ref=inBand.length ? inBand[Math.floor(0.75*inBand.length)] : 0; if(!(ref>0)) continue;
    const thr=Math.max(0.3*ref, 2.5*noise), sup=S.filter(s=>s.vs>=thr).map(s=>s.t);
    if(sup.length<12) continue;
    // Zusammenhaengendes Stueck um die dichteste Stelle im Band (Luecken bis 6 px).
    let best=null;
    for(let i=0;i<sup.length;){ let j=i; while(j+1<sup.length && sup[j+1]-sup[j]<=(o.gap??6)) j++;
      const run={lo:sup[i], hi:sup[j], n:j-i+1}; if(!best || run.n>best.n) best=run; i=j+1; }
    if(!best || best.hi-best.lo<(o.minLen??40)) continue;
    const z=G.lineSupport(g,W,H,L,best.lo,best.hi).z;
    if(!(z>=(o.zMin??8))) continue;
    // Oben = Richtung d (zur Decke). T = oberes Ende: bei schwachen Kanten
    // reisst die Stuetze vor der Decke ab (Luecken > 6 px). Darum wie ein
    // Bruchpunkt-Test: die Summe von (v - halbe Kantenstaerke) ab dem Lauf
    // waechst, solange die Kante da ist, und faellt danach - ihr Maximum ist T.
    const runV=S.filter(s=>s.t>=best.lo && s.t<=best.hi).map(s=>s.v).sort((a,b)=>a-b), mu0=0.5*(runV[runV.length>>1]||0);
    let cs=0, csMax=-Infinity, tTop=best.hi;
    for(const sm of S){ if(sm.t<best.lo) continue; cs+=sm.v-mu0; if(cs>csMax){ csMax=cs; tTop=sm.t; } }
    const T=[L.px+tTop*L.dx, L.py+tTop*L.dy], Bt=[L.px+best.lo*L.dx, L.py+best.lo*L.dy];
    // Laeuft die Kante ueber T weiter? Signierte Stuetze genau auf der Geraden
    // 4-30 px ueber T gegen 4-30 px darunter (z wie lineSupport). Auf der
    // Geraden selbst gemessen, nicht in Sektoren um T: eine duenne Linie
    // (Deckenfuge) hat quer gemittelt kein Signal, auf ihrer Flanke schon.
    const zAlong=(t0,t1)=>{ let n=0,s=0,s2=0; for(let t=t0;t<=t1;t++){ const v=resp(L.px+t*L.dx, L.py+t*L.dy, L); if(v===null) continue; n++; s+=v; s2+=v*v; }
      if(n<8) return {z:0, n}; const m=s/n, sd=Math.sqrt(Math.max(1e-9,(s2-n*m*m)/(n-1))); return {z:m/(sd/Math.sqrt(n)), n}; };
    const zUp=zAlong(tTop+4, tTop+30), zDn=zAlong(tTop-30, tTop-4);
    const J=junctionAt(g,W,H,T,L,{...o, proj, camTo, flipY, zUp, zDn});
    const Tn=G.pixToNdc(T[0],T[1],W,H,flipY), Bn=G.pixToNdc(Bt[0],Bt[1],W,H,flipY);
    out.push({top:Tn, bottom:Bn, z, len:tTop-best.lo, kind:J.kind, grund:J.grund, konkav:J.konkav, nSeiten:J.nSeiten, seiten:J.seiten, rays:J.rays, side:J.side, xr, sign:L.sign, extra:J.extra,
      ray:G.ray(proj,camTo,Tn[0],Tn[1])});
  }
  return out;
};
// Probe am oberen Ende T: welche waagerechten Kanten gehen von T ab?
// Eine waagerechte Kante durch den 3D-Punkt X_T mit Grundrissrichtung psi hat
// als Bild die Gerade durch T und den Fluchtpunkt von psi (auf dem Horizont,
// aus der Pose) - unabhaengig davon, wie hoch und wie weit X_T liegt. Darum
// wird nicht in Bildsektoren um T gesucht, sondern je Grundrissrichtung psi
// (2°-Schritte) die Halbgerade ab T im Bild abgetastet (8-120 px, signierter
// Gradient quer, z = Mittel/Standardfehler; Deckenkanten sind lang, z waechst
// mit der Wurzel der Laenge). Spitzen ueber psi sind die Deckenkanten (bzw.
// Quaderkanten) an T, ihre psi direkt die Grundrissrichtung. Schwelle zSide 7:
// an kantenfreien Stellen bleibt das Maximum ueber alle psi in 99 % darunter
// (gemessen an gerenderten Bildern, Rauschen 1,5-3; vorher z 4 bzw. 5 liess in
// gut der Haelfte solcher Stellen eine Schein-Deckenkante durch).
// Richtungen, deren Bild weniger als 20° von der Senkrechten abweicht, zaehlen
// nicht: dort liegt die Senkrechte selbst (und jede parallele Nachbarkante,
// Zarge, Rahmen) - die Kante ist 2-3 px breit, die Halbgerade muss ab ~10 px
// mehr als 3 px neben ihr liegen (sin 20° · 10 px = 3,4 px). Eine Wand, deren
// Deckenkante im Bild so steil liegt, sieht man fast von der Kante: deren
// Ecke wird nicht bestaetigt (S4: beide Deckenkanten messen).
const D2R=Math.PI/180;
function junctionAt(g,W,H,T,L,o){
  const dn=a=>Math.abs(Math.atan2(Math.sin(a),Math.cos(a)));
  const lift=(px,py)=>{ const n=G.pixToNdc(px,py,W,H,o.flipY), r=G.ray(o.proj,o.camTo,n[0],n[1]); return r ? G.hitY(r, o.camTo[13]+1, 40) : null; };
  const R=o.junctionR??14;
  const rand=Math.min(T[0],T[1],W-1-T[0],H-1-T[1])<R;
  const T3=lift(T[0],T[1]), C=[o.camTo[12], o.camTo[14]];
  const az=T3 ? Math.atan2(T3[2]-C[1], T3[0]-C[0]) : null, cBack=az!==null ? az+Math.PI : null;
  // Weiter nach oben nur, wenn dort eine Kante aehnlicher Staerke laeuft (Rauschen erreicht z 4-5).
  const weiter=o.zUp.n>=8 && o.zUp.z>=Math.max(6, 0.35*o.zDn.z);
  // Halbgeraden je Grundrissrichtung
  const NP=180, prof=new Array(NP).fill(null), cosV=Math.cos((o.vertExcl??20)*D2R);
  if(T3){ const dist=Math.hypot(T3[0]-C[0], T3[2]-C[1]), eps=0.05*dist;
    for(let k=0;k<NP;k++){ const psi=k*2*Math.PI/NP, q=G.project(o.proj,o.camTo,[T3[0]+eps*Math.cos(psi), T3[1], T3[2]+eps*Math.sin(psi)]); if(!q) continue;
      const pp=G.ndcToPix(q[0],q[1],W,H,o.flipY); let ux=pp[0]-T[0], uy=pp[1]-T[1]; const ul=Math.hypot(ux,uy); if(!(ul>1e-9)) continue; ux/=ul; uy/=ul;
      if(Math.abs(ux*L.dx+uy*L.dy)>cosV) continue;
      const nx=-uy, ny=ux; let n=0, s=0, s2=0;
      for(let t=(o.arm0??8);t<=(o.arm1??120);t++){ const xi=Math.round(T[0]+t*ux), yi=Math.round(T[1]+t*uy); if(xi<1||yi<1||xi>W-2||yi>H-2) break;
        const [gx,gy]=sobel(g,W,xi,yi), v=gx*nx+gy*ny; n++; s+=v; s2+=v*v; }
      if(n<10) continue;
      const m=s/n, sd=Math.sqrt(Math.max(1e-9,(s2-n*m*m)/(n-1)));
      prof[k]={psi, z:Math.abs(m)/(sd/Math.sqrt(n)), n, ux, uy}; } }
  // Spitzen ueber psi (±6°), z >= zSide und mindestens ein Viertel der staerksten.
  let peaks=[];
  for(let k=0;k<NP;k++){ const p=prof[k]; if(!p || p.z<(o.zSide??7)) continue; let ok=true;
    for(let j=-3;j<=3 && ok;j++){ const q=prof[(k+j+NP)%NP]; if(j && q && q.z>p.z) ok=false; } if(ok) peaks.push(p); }
  const zMax=Math.max(0,...peaks.map(p=>p.z)); peaks=peaks.filter(p=>p.z>=0.25*zMax).sort((p,q)=>q.z-p.z);
  // Liegt ueber T noch eine waagerechte Kante (die Deckenkante 10-120 px
  // hoeher), endet die Senkrechte UNTER der Decke: Bilderrahmen, Tuersturz,
  // Schrank. Profil des Gradienten entlang "oben" (quer gemittelt ueber 5 px)
  // gegen seinen eigenen Rauschboden (MAD). Nur noch Auskunft (grund
  // 'darueber') und fuer o.konvexEcke / o.konkavAbove: als Veto bei konkaven
  // Ecken kostet es echte Ecken, denn Deckenschiene, Fugen, Baender und Lampe
  // liegen auch ueber einer echten Ecke (Messung: 48 echte gegen 16 falsche).
  const prof2=[];
  for(let t=4;t<=(o.aboveMax??220);t++){ let sm=0, nn=0;
    for(let k=-2;k<=2;k++){ const x=Math.round(T[0]+t*L.dx+k*L.nx), y=Math.round(T[1]+t*L.dy+k*L.ny); if(x<1||y<1||x>W-2||y>H-2) continue;
      const [gx,gy]=sobel(g,W,x,y); sm+=gx*L.dx+gy*L.dy; nn++; }
    if(nn) prof2.push(Math.abs(sm/nn)); }
  let above=false;
  if(prof2.length>=10){ const srt=[...prof2].sort((p,q)=>p-q), mad=srt[srt.length>>1]*1.48+1e-6, mx=Math.max(...prof2.slice(6));
    above=mx>=Math.max(o.aboveAbs??6, (o.aboveK??5)*mad); }
  // Die zwei Seiten: die staerkste, dazu die staerkste mindestens 30° davon
  // (zwei Deckenkanten einer Ecke liegen im Grundriss nie enger).
  const imgSep=(p,q)=>Math.acos(Math.max(-1,Math.min(1,p.ux*q.ux+p.uy*q.uy)));
  const p1=peaks[0], p2=p1 && peaks.find(p=>dn(p.psi-p1.psi)>=(o.minSep??30)*D2R && imgSep(p,p1)>=(o.vertExcl??20)*D2R);
  let kind, grund, konkav=null;
  if(rand && o.randRegel!==false){ kind='weiter'; grund='rand'; }
  else if(weiter){ kind='weiter'; grund='weiter'; }
  else if(!T3){ kind='unten'; grund='unter-horizont'; }
  else if(!p1){ kind='unten'; grund=above ? 'darueber' : 'keine-seite'; }
  else if(!p2){ kind='unten'; grund='eine-seite'; }
  else {
    const d12=dn(p1.psi-p2.psi);
    // Raumecken haben Innenwinkel von 30-150°; was gerader ist, ist eine
    // durchlaufende Deckenkante (psi auf 2° gerastert, T auf 1-2 px genau -
    // das kippt eine gerade Kante im Grundriss um bis zu ~15°).
    if(d12>Math.PI-(o.straightTol??Math.PI/6)){ kind='durch'; grund='durch'; }
    else {
      // Keil: liegt die Richtung von T zur Kamera zwischen den beiden Seiten
      // (kuerzerer Bogen)? Dann ist die Ecke von innen gesehen (konkav).
      const a1=dn(cBack-p1.psi), a2=dn(cBack-p2.psi); konkav=Math.abs(a1+a2-d12)<1e-6;
      if(konkav){ kind=(o.konkavAbove && above) ? 'unten' : 'ecke'; grund=kind==='ecke' ? 'konkav' : 'konkav-darueber'; }
      // Vorspringend (Kamera ausserhalb des Keils): Quaderoberkante,
      // deckenhohes Regal oder Aussenecke des Raums. Aus einem Bild nicht zu
      // trennen - liegt die Deckenkante hinter dem Schrank im Bild kaum
      // sichtbar ueber T, sieht seine Oberkante aus wie eine Aussenecke, und
      // ein deckenhohes Regal IST oertlich eine. Darum nie 'ecke'; die
      // Peilung bleibt (konkav:false, grund 'konvex') fuer das Modell.
      else if(!o.konvexEcke){ kind='unten'; grund='konvex'; }
      else { kind=above ? 'unten' : 'ecke'; grund=above ? 'konvex-darueber' : 'konvex'; }
    }
  }
  const seiten=[p1,p2].filter(Boolean).map(p=>({psiDeg:Math.round(p.psi/D2R), z:+p.z.toFixed(1)}));
  return {kind, grund, konkav, nSeiten:peaks.length, seiten, rays:[], side:peaks.map(p=>({psiDeg:Math.round(p.psi/D2R), z:+p.z.toFixed(1)})),
    extra:{above, zUp:+o.zUp.z.toFixed(1), zDn:+o.zDn.z.toFixed(1), rand, az:az!==null ? +(az/D2R).toFixed(2) : null}};
}
