// ------------------------------------------------ Senkrechte im Bild
// Raumecken (Wand-Wand-Kanten) sind senkrecht. Ihr Bild laeuft durch den
// Fluchtpunkt der Senkrechten v = Projektion der Richtung +Y - die Pose
// liefert ihn, nichts muss geschaetzt werden. Darum genuegt eine 1D-Hough:
// jedes Pixel liegt auf genau einer Senkrechten (der Geraden durch v), die
// die Bezugszeile in x_ref schneidet; es stimmt dort SIGNIERT mit seinem
// Gradienten quer zu dieser Geraden ab (wie edgeCandidates: entlang einer
// echten Kante addiert sich das Signal linear, Rauschen mit der Wurzel).
// Danach je Spitze: Stuetze entlang der Geraden (z wie lineSupport), oberes
// Ende T, und am oberen Ende die Probe auf die Deckenkante: Strahlen ab T.
//   - Raumecke: an T endet die Senkrechte, und es gehen eine oder zwei
//     Deckenkanten ab, die NICHT auf einer Geraden liegen (Knick).
//   - Fensterlaibung/Tuerzarge bis zur Decke: die Deckenkante laeuft gerade
//     durch T hindurch (zwei Strahlen, 180° auseinander) -> 'durch'.
//   - Tuerzarge, Bilderrahmen, Schrankseite: oben keine Deckenkante -> 'unten'.
//   - Geht die Senkrechte ueber T hinaus weiter, ist T kein Ende -> 'weiter'.
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
      let bv=-Infinity; for(const k of [-1,0,1]){ const v=resp(bx+k*L.nx, by+k*L.ny, L); if(v!==null && v>bv) bv=v; }
      const n1=resp(bx+6*L.nx,by+6*L.ny,L), n2=resp(bx-6*L.nx,by-6*L.ny,L);
      S.push({t, v:bv, nz:Math.max(Math.abs(n1??0),Math.abs(n2??0))}); tmin=Math.min(tmin,t); tmax=Math.max(tmax,t); }
    if(S.length<20) continue;
    const nz=S.map(s=>s.nz).sort((a,b)=>a-b), noise=nz[nz.length>>1]||0;
    const inBand=S.filter(s=>{ const y=L.py+s.t*L.dy; return y>=ya && y<=yb; }).map(s=>s.v).sort((a,b)=>a-b);
    const ref=inBand.length ? inBand[Math.floor(0.75*inBand.length)] : 0; if(!(ref>0)) continue;
    const thr=Math.max(0.3*ref, 2.5*noise), sup=S.filter(s=>s.v>=thr).map(s=>s.t);
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
    const J=junctionAt(g,W,H,T,L,{...o, proj, camTo, flipY});
    const Tn=G.pixToNdc(T[0],T[1],W,H,flipY), Bn=G.pixToNdc(Bt[0],Bt[1],W,H,flipY);
    out.push({top:Tn, bottom:Bn, z, len:tTop-best.lo, kind:J.kind, rays:J.rays, side:J.side, xr, sign:L.sign,
      ray:G.ray(proj,camTo,Tn[0],Tn[1])});
  }
  return out;
};
// Strahlen ab T: je 6°-Sektor das mittlere signierte Signal quer zum Strahl,
// mit Standardfehler (z). Die Senkrechte nach unten ist bekannt, nach oben
// darf nichts weitergehen.
function junctionAt(g,W,H,T,L,o){
  const R=o.junctionR??14, NS=60, sum=new Float64Array(NS), sq=new Float64Array(NS), n=new Int32Array(NS);
  for(let y=Math.max(1,Math.floor(T[1]-R)); y<=Math.min(H-2,Math.ceil(T[1]+R)); y++)
    for(let x=Math.max(1,Math.floor(T[0]-R)); x<=Math.min(W-2,Math.ceil(T[0]+R)); x++){
      const dx=x-T[0], dy=y-T[1], r=Math.hypot(dx,dy); if(r<3 || r>R) continue;
      const [gx,gy]=sobel(g,W,x,y), ux=dx/r, uy=dy/r, s=-gx*uy+gy*ux, p=gx*ux+gy*uy;
      if(p*p>0.5*s*s) continue;
      let a=Math.atan2(dy,dx); if(a<0) a+=2*Math.PI; const k=Math.min(NS-1,Math.floor(a/(2*Math.PI)*NS));
      sum[k]+=s; sq[k]+=s*s; n[k]++; }
  const zOf=k=>{ if(n[k]<4) return 0; const m=sum[k]/n[k], sd=Math.sqrt(Math.max(1e-9,(sq[k]-n[k]*m*m)/Math.max(1,n[k]-1))); return Math.abs(m)/(sd/Math.sqrt(n[k])); };
  const angOf=k=>(k+0.5)*2*Math.PI/NS, upA=Math.atan2(L.dy,L.dx), dn=a=>Math.abs(Math.atan2(Math.sin(a),Math.cos(a)));
  const rays=[];
  for(let k=0;k<NS;k++){ const z=zOf(k), zl=zOf((k+NS-1)%NS), zr=zOf((k+1)%NS); if(z<(o.rayZ??4) || z<zl || z<zr) continue;
    rays.push({a:angOf(k), z}); }
  const VT=o.vertTol??0.12, down=rays.filter(r=>dn(r.a-upA-Math.PI)<VT), zDown=Math.max(0,...down.map(r=>r.z));
  // Weiter nach oben nur, wenn dort eine Kante aehnlicher Staerke laeuft (Rauschen erreicht z 4-5).
  const up=rays.filter(r=>dn(r.a-upA)<VT && r.z>=Math.max(6, 0.35*zDown));
  // Seitenstrahlen in den Grundriss heben: ein Punkt 10 px den Strahl entlang
  // und T selbst, beide auf eine waagerechte Ebene ueber der Kamera. Die
  // Richtung im Grundriss haengt nicht von der Hoehe dieser Ebene ab (beide
  // Punkte werden um die Kamera gleich gestreckt) - also auch nicht von H.
  const lift=(px,py)=>{ const n=G.pixToNdc(px,py,W,H,o.flipY), r=G.ray(o.proj,o.camTo,n[0],n[1]); return r ? G.hitY(r, o.camTo[13]+1, 40) : null; };
  const T3=lift(T[0],T[1]);
  const side=[];
  for(const r of rays){ if(dn(r.a-upA)<VT || dn(r.a-upA-Math.PI)<VT) continue;
    const Q=T3 && lift(T[0]+10*Math.cos(r.a), T[1]+10*Math.sin(r.a)); if(!Q) continue;   // unter dem Horizont: keine Deckenkante
    side.push({...r, psi:Math.atan2(Q[2]-T3[2], Q[0]-T3[0])}); }
  // Liegt ueber T noch eine waagerechte Kante (die Deckenkante 10-120 px
  // hoeher), endet die Senkrechte UNTER der Decke: Bilderrahmen, Tuersturz,
  // Schrank. Profil des Gradienten entlang "oben" (quer gemittelt ueber 5 px)
  // gegen seinen eigenen Rauschboden (MAD).
  const prof=[];
  for(let t=4;t<=(o.aboveMax??220);t++){ let sm=0, nn=0;
    for(let k=-2;k<=2;k++){ const x=Math.round(T[0]+t*L.dx+k*L.nx), y=Math.round(T[1]+t*L.dy+k*L.ny); if(x<1||y<1||x>W-2||y>H-2) continue;
      const [gx,gy]=sobel(g,W,x,y); sm+=gx*L.dx+gy*L.dy; nn++; }
    if(nn) prof.push(Math.abs(sm/nn)); }
  let above=false;
  if(prof.length>=10){ const srt=[...prof].sort((p,q)=>p-q), mad=srt[srt.length>>1]*1.48+1e-6, mx=Math.max(...prof.slice(6));
    above=mx>=Math.max(o.aboveAbs??6, (o.aboveK??5)*mad); }
  let kind;
  if(up.length) kind='weiter';
  else if(above) kind='unten';
  else if(!side.length) kind='unten';
  else {
    // Zwei Seitenstrahlen im Grundriss gegenlaeufig: die Deckenkante laeuft gerade durch (Fenster, Zarge).
    // Zwei mit 30-150° Unterschied: zwei Waende treffen sich (Ecke).
    // Nur die zwei staerksten Seitenstrahlen, und nur, was mindestens ein
    // Viertel des staerksten erreicht (schwache Strahlen sind meist Rauschen).
    const zs=Math.max(...side.map(r=>r.z)), top2=side.filter(r=>r.z>=0.25*zs).sort((p,q)=>q.z-p.z).slice(0,2);
    const d=top2.length===2 ? dn(top2[0].psi-top2[1].psi) : null;
    kind=d!==null && d>Math.PI-(o.straightTol??0.2) ? 'durch' : 'ecke';
  }
  return {kind, rays:rays.map(r=>({deg:Math.round(r.a*180/Math.PI), z:+r.z.toFixed(1)})), side:side.map(r=>({psiDeg:Math.round(r.psi*180/Math.PI), z:+r.z.toFixed(1)})), down:down.length};
}
