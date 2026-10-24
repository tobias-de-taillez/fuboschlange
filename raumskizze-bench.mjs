// raumskizze-bench.mjs — Monte-Carlo-Messaufbau fuer die Schwenk-Auswertung
// von raumskizze-probe.html: zufaellige Raeume, zufaellige Schwenks,
// bekannte Wahrheit.
//
//   node raumskizze-bench.mjs [--n=200] [--seed=1] [--pipe=greedy,dp,dpH,app,appH]
//        [--class=rect,l,niche,chimney,oblique]
//        [--szen=basis,verschachtelt,verdeckt,schrankwand,pause,eckstart]
//        [--noise=normal|hart] [--hdrift=1] [--vdrift=1] [--gier=1] [--ausr=1]
//        [--kurve=drift|hdrift|vdrift|gier|ausr] [--arm=0.3] [--html=pfad] [--worst] [--diag] [--calib]
//
// Gemessen wird, was die Skizze leisten muss: richtige Topologie (jede Ecke
// gefunden, keine zu viel), Eckenfehler, und vor allem: schliesst der Raum
// FALSCH? Ein geschlossener Raum beendet in der App nach 5 s die Sitzung von
// selbst - eine falsche Skizze ohne Anlass, weiterzuschwenken. Darum steht
// P(falsch | geschlossen) als Sicherheitszahl neben der Trefferquote.
//
// Die Erfassungen entstehen direkt aus der Projektion der wahren
// Wand-Decke-Kante - ohne Rendering, dafuer mit einem ausdruecklichen
// Fehlermodell: Pixelrauschen, Posefehler je Bild, Drift als Zufallsweg
// (waagerecht, senkrecht und Gier getrennt), Relokalisierungssprung,
// Verwechslung an Ecken und Fehlgriffe (Gardinenleiste/Tuersturz unter der
// Decke, Schrankoberkante vor der Wand, Leuchtenkante). Fehlgriffe kommen als
// zusammenhaengende Folge, die die Deckenkante ERSETZT: die 2-von-2-Bestaetigung
// der App laesst einzelnes Flackern nicht durch, und solange die Leiste im
// Fangradius gewinnt, gewinnt sie Bild fuer Bild. Ob die Kante im Bild
// ueberhaupt gefunden wird, prueft test/raumskizze-probe.mjs mit gerenderten
// Bildern; hier geht es um die Statistik der Auswertung ueber viele Raeume.
//
// Das Driftmodell ist NICHT an echten Geraeten kalibriert. Die Kurve
// (--kurve) zeigt, wo die Auswertung kippt; den Arbeitspunkt muessen
// Protokolle echter Sitzungen liefern (LOG.anchorPath, res.auto.drift).
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const argv=process.argv.slice(2);
const flag=n=>argv.find(a=>a.startsWith('--'+n+'='))?.split('=')[1];
const N=+(flag('n')||200), SEED=+(flag('seed')||1);
const PIPES=(flag('pipe')||'greedy,dp').split(',');
const ALL_CLASSES=['rect','l','niche','chimney','oblique'];
const CLASSES=(flag('class')||ALL_CLASSES.join(',')).split(',');
const SZEN=(flag('szen')||'basis').split(',');
const HARD=flag('noise')==='hart', DIAG=argv.includes('--diag');
// --opt=key:val,key:val reicht Optionen an solveSweep durch (Ablation).
const OPT=Object.fromEntries((flag('opt')||'').split(',').filter(Boolean).map(kv=>{ const [k,v]=kv.split(':');
  return [k, v==='false' ? false : v==='true' ? true : Number(v)]; }));
// --html=pfad misst einen anderen Stand der Seite (z. B. vor einer Aenderung).
const HTML=flag('html') ? resolve(flag('html')) : new URL('./raumskizze-probe.html', import.meta.url);
const html=readFileSync(HTML,'utf8');
const pick=id=>{ const m=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`)); if(!m) throw new Error(id); return m[1]; };
new Function(pick('geo'))();
const G=globalThis.RAUMSKIZZE;

// ------------------------------------------------------------ Zufall
const rng=seed=>()=>{ seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed);
  t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
const gauss=R=>Math.sqrt(-2*Math.log(R()+1e-12))*Math.cos(2*Math.PI*R());
const U=(R,a,b)=>a+(b-a)*R();

// ------------------------------------------------------------ Raeume
// Polygone in Metern (x, z). Danach zufaellig gedreht und verschoben - der
// Ankerraum am Telefon hat keine Vorzugsrichtung.
const ROOMS={
  rect:R=>{ const w=U(R,2.5,6), d=U(R,2.5,5); return [[0,0],[w,0],[w,d],[0,d]]; },
  l:R=>{ const w=U(R,3.5,6.5), d=U(R,3,5.5), a=U(R,1,w/2), b=U(R,1,d/2);
    return [[0,0],[w,0],[w,d-b],[w-a,d-b],[w-a,d],[0,d]]; },
  // Nische nach aussen in der langen Wand.
  niche:R=>{ const w=U(R,3.5,6), d=U(R,3,5), c=U(R,0.6,1.5), x0=U(R,0.6,w-c-0.6), e=U(R,0.2,0.5);
    return [[0,0],[x0,0],[x0,-e],[x0+c,-e],[x0+c,0],[w,0],[w,d],[0,d]]; },
  // Kaminvorsprung in den Raum hinein.
  chimney:R=>{ const w=U(R,3.5,6), d=U(R,3,5), c=U(R,0.5,1.2), x0=U(R,0.6,w-c-0.6), e=U(R,0.25,0.5);
    return [[0,0],[x0,0],[x0,e],[x0+c,e],[x0+c,0],[w,0],[w,d],[0,d]]; },
  // Eine Ecke schraeg abgeschnitten.
  oblique:R=>{ const w=U(R,3,6), d=U(R,3,5), a=U(R,0.7,1.6), b=U(R,0.7,1.6);
    return [[0,0],[w-a,0],[w,b],[w,d],[0,d]]; },
};
const area=P=>{ let s=0; for(let i=0;i<P.length;i++){ const p=P[i], q=P[(i+1)%P.length]; s+=p[0]*q[1]-q[0]*p[1]; } return s/2; };
const inPoly=(P,x,z)=>{ let c=false; for(let i=0,j=P.length-1;i<P.length;j=i++){ const [xi,zi]=P[i],[xj,zj]=P[j];
  if((zi>z)!==(zj>z) && x<(xj-xi)*(z-zi)/(zj-zi)+xi) c=!c; } return c; };
const segDist=(p,a,b)=>{ const dx=b[0]-a[0], dz=b[1]-a[1], L2=dx*dx+dz*dz; const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/L2));
  return Math.hypot(p[0]-a[0]-t*dx, p[1]-a[1]-t*dz); };
const segX=(p1,p2,p3,p4)=>{ const d=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const d1=d(p3,p4,p1), d2=d(p3,p4,p2), d3=d(p1,p2,p3), d4=d(p1,p2,p4);
  return ((d1>0&&d2<0)||(d1<0&&d2>0)) && ((d3>0&&d4<0)||(d3<0&&d4>0)); };

// ------------------------------------------------------------ Kamera
const IW=288, IH=640;
const perspective=(fovyDeg, aspect, near=0.05, far=50)=>{ const f=1/Math.tan(fovyDeg*Math.PI/360);
  return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)/(near-far),-1, 0,0,2*far*near/(near-far),0]; };
const PROJ=perspective(62, IW/IH);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const nrm=v=>{ const n=Math.hypot(...v); return v.map(x=>x/n); };
const lookAt=(C,T)=>{ const f=nrm(sub(T,C)), r=nrm(cross(f,[0,1,0])), u=cross(r,f);
  return [r[0],r[1],r[2],0, u[0],u[1],u[2],0, -f[0],-f[1],-f[2],0, C[0],C[1],C[2],1]; };
// Starre Stoerung: Drehung um y (Gier), dann kleine Nick/Roll, dann Verschiebung - von links,
// also um den Weltursprung (so wirkt die Gier-Drift, so modelliert sie der Schaetzer).
const perturb=(m,dyaw,dpitch,droll,t)=>{
  const cy=Math.cos(dyaw), sy=Math.sin(dyaw), cp=Math.cos(dpitch), sp=Math.sin(dpitch), cr=Math.cos(droll), sr=Math.sin(droll);
  const Ry=[cy,0,-sy,0, 0,1,0,0, sy,0,cy,0, 0,0,0,1], Rx=[1,0,0,0, 0,cp,sp,0, 0,-sp,cp,0, 0,0,0,1], Rz=[cr,sr,0,0, -sr,cr,0,0, 0,0,1,0, 0,0,0,1];
  return G.m4mul([1,0,0,0, 0,1,0,0, 0,0,1,0, t[0],t[1],t[2],1], G.m4mul(Ry, G.m4mul(Rx, G.m4mul(Rz, m))));
};
// Lagerauschen je Bild dreht um die KAMERA, nicht um den Ursprung - sonst
// wird daraus ein Lagefehler, der mit dem Abstand zum Ursprung waechst und
// nicht mit dem Massstab skaliert (bis 2026-10-24 spaet war es so).
const turnAtCam=(m,dyaw,dpitch,droll)=>{ const c=[m[12],m[13],m[14]], m0=m.slice(); m0[12]=m0[13]=m0[14]=0;
  const M=perturb(m0,dyaw,dpitch,droll,[0,0,0]); M[12]=c[0]; M[13]=c[1]; M[14]=c[2]; return M; };
// Kameraort: aus der Hand kreist das Telefon beim Drehen um den Koerper
// (Arm ~0,3 m, --arm=0,3); Grundmodell: Wackeln ±5 cm um den Standpunkt.
const ARM=+(flag('arm')||0);

// ------------------------------------------------------------ Fehlermodell
const NOISE0=HARD
  ? {px:1.5, jitT:0.008, jitR:0.25, driftPerM:0.025, yawPerMin:1.0, pJump:0.5, jumpT:[0.04,0.10], jumpYaw:[0.5,1.5],
     pLintel:0.4, pWardrobe:0.3, pRand:0.05, pCorner:0.5}
  : {px:1.0, jitT:0.005, jitR:0.12, driftPerM:0.012, yawPerMin:0.4, pJump:0.2, jumpT:[0.03,0.06], jumpYaw:[0.3,0.8],
     pLintel:0.3, pWardrobe:0.2, pRand:0.03, pCorner:0.4};
// Getrennte Stellschrauben: waagerechte Drift, senkrechte Drift, Gier,
// Fehlgriffe (Wahrscheinlichkeiten). Je 1 = Grundmodell.
const MUL0={h:+(flag('hdrift')||flag('drift')||1), v:+(flag('vdrift')||flag('drift')||1), y:+(flag('gier')||1), o:+(flag('ausr')||1)};
const noiseOf=m=>({...NOISE0, driftH:NOISE0.driftPerM*m.h, driftV:NOISE0.driftPerM*m.v, yawPerMin:NOISE0.yawPerMin*m.y,
  pLintel:Math.min(1,NOISE0.pLintel*m.o), pWardrobe:Math.min(1,NOISE0.pWardrobe*m.o),
  pRand:Math.min(1,NOISE0.pRand*m.o), pCorner:Math.min(1,NOISE0.pCorner*m.o), mul:m});

// Ein Schwenk durch einen Raum. Liefert Erfassungen in Zeitfolge, mit der
// Wahrheit je Erfassung (Wandindex oder Art des Fehlgriffs) fuer die Diagnose.
// Szenarien:
//   basis          Fehlgriffe als zusammenhaengende Folge statt der Deckenkante
//   verschachtelt  alte Ablation: Fehlgriff ZUSAETZLICH, im Wechsel mit der Kante
//   verdeckt       die dritte Wand des Rundgangs zeigt keine Deckenkante
//   schrankwand    vor der dritten Wand ein Schrank ueber die ganze Breite (2,2 m
//                  hoch, 0,6 m tief) - erfasst wird seine Oberkante
//   pause          45 s Pause mitten im Rundgang, die Drift laeuft weiter
//   eckstart       Start direkt an einer Ecke, der Nutzer schwenkt am Ende
//                  weiter, bis der Raum schliesst (bis in die zweite Wand)
function simulate(poly, H, R, NZ, szen='basis'){
  const n=poly.length;
  // Standpunkte mit 0,5 m Abstand zu allen Waenden.
  const xs=poly.map(p=>p[0]), zs=poly.map(p=>p[1]);
  const stands=[];
  for(let tries=0; stands.length<1+Math.floor(R()*3) && tries<500; tries++){
    const p=[U(R,Math.min(...xs),Math.max(...xs)), U(R,Math.min(...zs),Math.max(...zs))];
    if(!inPoly(poly,p[0],p[1])) continue;
    if(poly.some((a,i)=>segDist(p,a,poly[(i+1)%n])<0.5)) continue;
    stands.push(p);
  }
  if(!stands.length) return null;
  const visible=(S,P,i)=>poly.every((a,j)=>{ if(j===i) return true; const b=poly[(j+1)%n];
    // Endpunkte der Nachbarwaende beruehren P an Ecken - die zaehlen nicht.
    if(segDist(P,a,b)<1e-6) return true; return !segX(S,P,a,b); });
  const h=U(R,1.35,1.7);
  const rev=R()<0.5, order=[];
  const i0=Math.floor(R()*n);
  let s0=U(R,0.15,0.85);
  if(szen==='eckstart') s0=R()<0.5 ? 0.02 : 0.97;
  for(let k=0;k<=n;k++) order.push(rev ? (i0-k+n*2)%n : (i0+k)%n);
  const special=order[2];   // verdeckt / schrankwand
  const contig=szen!=='verschachtelt';
  // Drift als Zufallsweg ueber die zurueckgelegte Strecke und Zeit.
  let drift=[0,0,0], dyaw=0, t=0, lastPos=null, jumped=false, paused=false;
  const jumpAt=R()<NZ.pJump ? U(R,0.2,0.8) : 2;
  const pauseAt=szen==='pause' ? U(R,0.3,0.7) : 2;
  const out=[], truth=[], twall=[];
  const total=poly.reduce((s,a,i)=>s+Math.hypot(poly[(i+1)%n][0]-a[0], poly[(i+1)%n][1]-a[1]),0);
  let walked=0;
  const capture=(i,s,kind,P3a,P3b,aim)=>{
    if(szen==='verdeckt' && i===special && kind!=='leuchte'){ t+=0.3; return; }
    const a=poly[i], b=poly[(i+1)%n];
    const P=[a[0]+s*(b[0]-a[0]), a[1]+s*(b[1]-a[1])];
    const cands=stands.filter(S=>visible(S,P,i) && Math.hypot(S[0]-P[0],S[1]-P[1])>0.8);
    if(!cands.length) return;
    cands.sort((p,q)=>Math.hypot(p[0]-P[0],p[1]-P[1])-Math.hypot(q[0]-P[0],q[1]-P[1]));
    const S=cands[0], dP=[P[0]-S[0],P[1]-S[1]], nP=Math.hypot(dP[0],dP[1])||1;
    const C=ARM ? [S[0]+ARM*dP[0]/nP+gauss(R)*0.02, h+gauss(R)*0.02, S[1]+ARM*dP[1]/nP+gauss(R)*0.02]
                : [S[0]+gauss(R)*0.05, h+gauss(R)*0.02, S[1]+gauss(R)*0.05];
    if(lastPos){ const d=Math.hypot(C[0]-lastPos[0], C[2]-lastPos[2]);
      for(let k=0;k<3;k++) drift[k]+=gauss(R)*(k===1 ? NZ.driftV : NZ.driftH)*Math.sqrt(d+0.05); }
    lastPos=C;
    t+=0.3; dyaw+=gauss(R)*NZ.yawPerMin*Math.PI/180*Math.sqrt(0.3/60);
    if(!jumped && walked/total>jumpAt){ jumped=true;
      const jt=U(R,...NZ.jumpT), ang=R()*2*Math.PI; drift[0]+=jt*Math.cos(ang); drift[2]+=jt*Math.sin(ang);
      dyaw+=(R()<0.5?-1:1)*U(R,...NZ.jumpYaw)*Math.PI/180; }
    if(!paused && walked/total>pauseAt){ paused=true;
      // Pause: die Drift laeuft mit der Zeit weiter (Rate wie das Vorwissen
      // des Schaetzers: 6 mm/sqrt(s) und 0,08°/sqrt(s)).
      const T=45; t+=T;
      for(let k=0;k<3;k++) drift[k]+=gauss(R)*0.006*Math.sqrt(T)*(k===1 ? NZ.mul.v : NZ.mul.h);
      dyaw+=gauss(R)*0.08*Math.PI/180*Math.sqrt(T)*NZ.mul.y; }
    const cam=lookAt(C, aim || [P[0], H+gauss(R)*0.03, P[1]]);
    // Endpunkte ins Bild; was ausserhalb liegt, zur Bildmitte hin kuerzen.
    const inImg=q=>q && Math.abs(q[0])<=0.98 && Math.abs(q[1])<=0.98;
    const clip=(A,B)=>{ let lo=0, hi=1; const at=u=>A.map((v,k)=>v+u*(B[k]-v));
      if(inImg(G.project(PROJ,cam,B))) return B;
      for(let k=0;k<25;k++){ const m=(lo+hi)/2; if(inImg(G.project(PROJ,cam,at(m)))) lo=m; else hi=m; } return at(lo); };
    const mid=P3a.map((v,k)=>(v+P3b[k])/2);
    if(!inImg(G.project(PROJ,cam,mid))) return;
    const A3=clip(mid,P3a), B3=clip(mid,P3b);
    const jit=q=>[q[0]+gauss(R)*NZ.px*2/IW, q[1]+gauss(R)*NZ.px*2/IH];
    const qa=jit(G.project(PROJ,cam,A3)), qb=jit(G.project(PROJ,cam,B3));
    const r=NZ.jitR*Math.PI/180;
    const bad=perturb(turnAtCam(cam, gauss(R)*r, gauss(R)*r, gauss(R)*r), dyaw, 0, 0,
      [drift[0]+gauss(R)*NZ.jitT, drift[1]+gauss(R)*NZ.jitT, drift[2]+gauss(R)*NZ.jitT]);
    out.push({ra:G.ray(PROJ,bad,qa[0],qa[1]), rb:G.ray(PROJ,bad,qb[0],qb[1]), t});
    truth.push(kind); twall.push(kind==='ecke' || typeof kind==='number' ? i : null);
  };
  const wallAt=(i,s,hl)=>{ const a=poly[i], b=poly[(i+1)%n], L=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const u=Math.min(1,s+hl/L), v=Math.max(0,s-hl/L);
    return [[a[0]+v*(b[0]-a[0]),H,a[1]+v*(b[1]-a[1])],[a[0]+u*(b[0]-a[0]),H,a[1]+u*(b[1]-a[1])]]; };
  const sweepWall=(k,from,to)=>{
    const i=order[k], a=poly[i], b=poly[(i+1)%n], L=Math.hypot(b[0]-a[0],b[1]-a[1]);
    // Schritte wie die automatische Erfassung: eine je 3° Drehung, also
    // abhaengig vom Abstand zum naechsten Standpunkt (mindestens 8 cm).
    // Rueckwaerts laeuft der Schwenk von b nach a.
    const ss=[];
    for(let s=from; s<=to+1e-9;){
      const ps=rev ? 1-s : s, P=[a[0]+ps*(b[0]-a[0]), a[1]+ps*(b[1]-a[1])];
      ss.push(ps);
      const d=Math.min(...stands.map(S=>Math.hypot(S[0]-P[0],S[1]-P[1])));
      s+=Math.max(0.08, 0.052*d)/L;
    }
    // Fehlgriffe dieser Wand: Gardinenleiste/Tuersturz (unter der Decke, gleiche
    // Wandflaeche) und Schrankoberkante (vor der Wand, tiefer).
    const lintel=R()<NZ.pLintel ? Math.floor(R()*ss.length) : -1, lintelN=2+Math.floor(R()*4), lintelD=U(R,0.08,0.6);
    const ward=R()<NZ.pWardrobe ? Math.floor(R()*ss.length) : -1, wardN=3+Math.floor(R()*4), wardH=U(R,1.9,2.3), wardIn=U(R,0.4,0.65);
    const nIn=(()=>{ const nx=-(b[1]-a[1])/L, nz=(b[0]-a[0])/L, m=[(a[0]+b[0])/2,(a[1]+b[1])/2];
      return inPoly(poly,m[0]+0.05*nx,m[1]+0.05*nz) ? [nx,nz] : [-nx,-nz]; })();
    const wardrobeAt=(s,hl,hgt,dIn)=>{ const [A3,B3]=wallAt(i,s,hl); [A3,B3].forEach(p=>{ p[0]+=dIn*nIn[0]; p[2]+=dIn*nIn[1]; p[1]=hgt; });
      return [A3,B3,[(A3[0]+B3[0])/2,hgt,(A3[2]+B3[2])/2]]; };
    ss.forEach((s,j)=>{
      walked+=L/Math.max(1,ss.length);
      const hl=U(R,0.2,0.6);
      const inL=lintel>=0 && j>=lintel && j<lintel+lintelN, inW=ward>=0 && j>=ward && j<ward+wardN;
      // An der Ecke rastet die Kante manchmal auf die Nachbarwand ein.
      const nearA=s*L<0.15, nearB=(1-s)*L<0.15;
      if((nearA||nearB) && R()<NZ.pCorner){
        const ni=nearB ? (i+1)%n : (i-1+n)%n, ns=nearB ? 0.05 : 0.95;
        const [A3,B3]=wallAt(ni,ns,hl); capture(ni,ns,'ecke',A3,B3);
      } else if(szen==='schrankwand' && i===special){
        const [A3,B3,aim]=wardrobeAt(s,hl,2.2,0.6); capture(i,s,'schrank',A3,B3,aim);
      } else if(!(contig && (inL||inW))){ const [A3,B3]=wallAt(i,s,hl); capture(i,s,i,A3,B3); }
      if(inL){
        const [A3,B3]=wallAt(i,s,hl); A3[1]=B3[1]=H-lintelD; capture(i,s,'leiste',A3,B3,[A3[0],H-lintelD,A3[2]]);
      } else if(inW){
        const [A3,B3,aim]=wardrobeAt(s,Math.min(hl,0.4),wardH,wardIn); capture(i,s,'schrank',A3,B3,aim);
      }
      if(R()<NZ.pRand){
        // Leuchtenkante: Decke, im Raum, beliebige Richtung.
        const ang=R()*Math.PI, c=[a[0]+s*(b[0]-a[0])+nIn[0]*U(R,0.5,1.5), a[1]+s*(b[1]-a[1])+nIn[1]*U(R,0.5,1.5)], l=U(R,0.15,0.4);
        capture(i,s,'leuchte',[c[0]-l*Math.cos(ang),H,c[1]-l*Math.sin(ang)],[c[0]+l*Math.cos(ang),H,c[1]+l*Math.sin(ang)]);
      }
    });
  };
  // Start in der ersten Wand, rundum, zurueck in die erste Wand.
  sweepWall(0, s0, 0.98);
  for(let k=1;k<n;k++) sweepWall(k, 0.02, 0.98);
  const retStart=out.length;
  const L0=Math.hypot(poly[(i0+1)%n][0]-poly[i0][0], poly[(i0+1)%n][1]-poly[i0][1]);
  if(szen==='eckstart'){
    // Geschlossener Kreis: weiter, bis die App schliesst - hier bis 1,5 m in
    // die zweite Wand; app/appH werten nur bis zum Schliessen aus.
    sweepWall(n, 0.02, 0.98);
    const i1=order[1], L1=Math.hypot(poly[(i1+1)%n][0]-poly[i1][0], poly[(i1+1)%n][1]-poly[i1][1]);
    order.push(i1); sweepWall(n+1, 0.02, Math.min(0.98, 0.02+1.5/L1));
  } else sweepWall(n, 0.02, Math.min(0.98, s0+U(R,0.5,1.5)/L0));
  return {obs:out, truth, twall, h, retStart};
}

// ------------------------------------------------------------ Bewertung
// Topologie richtig = gleich viele Ecken und eine zyklische Zuordnung (auch
// gespiegelt), bei der jede Ecke unter 40 cm liegt. "rel." verlangt
// zusaetzlich je Ecke weniger als die halbe kuerzere Nachbarwand - erst dann
// ist jede Ecke naeher an ihrer wahren als an der naechsten.
function assignments(C,T){
  const out=[];
  if(C && C.length===T.length) for(const dir of [1,-1]) for(let sft=0;sft<T.length;sft++)
    out.push(T.map((_,i)=>(sft+dir*i+C.length*2)%C.length));
  return out;
}
function score(C, T){
  if(!C || !C.length) return {topo:false, rel:false, nC:0, maxErr:Infinity};
  const edge=T.map((t,i)=>Math.hypot(T[(i+1)%T.length][0]-t[0], T[(i+1)%T.length][1]-t[1]));
  const tol=T.map((_,i)=>Math.min(0.4, 0.5*Math.min(edge[i], edge[(i-1+T.length)%T.length])));
  let best=Infinity, bestRel=Infinity;
  for(const m of assignments(C,T)){
    const e=T.map((t,i)=>Math.hypot(C[m[i]][0]-t[0], C[m[i]][1]-t[1]));
    best=Math.min(best, Math.max(...e)); bestRel=Math.min(bestRel, Math.max(...e.map((x,i)=>x/tol[i])));
  }
  return {topo:best<=0.4, rel:bestRel<=1, nC:C.length, maxErr:best,
          areaErr:Math.abs(Math.abs(area(C))-Math.abs(area(T)))/Math.abs(area(T))};
}
// Massstabsfrei: der Laser misst EINE Strecke (die laengste Wand, ±1 mm);
// damit wird die Skizze um ihren Schwerpunkt skaliert - wie in der App, wenn
// die Raumhoehe nicht bekannt war.
function scoreScaleFree(C, T, R){
  if(!C) return false;
  const edge=T.map((t,i)=>Math.hypot(T[(i+1)%T.length][0]-t[0], T[(i+1)%T.length][1]-t[1]));
  const ia=edge.indexOf(Math.max(...edge)), ib=(ia+1)%T.length, meas=edge[ia]+gauss(R)*0.001;
  const cx=C.reduce((s,c)=>s+c[0],0)/C.length, cz=C.reduce((s,c)=>s+c[1],0)/C.length;
  for(const m of assignments(C,T)){
    const ca=C[m[ia]], cb=C[m[ib]], f=meas/Math.max(1e-6, Math.hypot(cb[0]-ca[0], cb[1]-ca[1]));
    const e=T.map((t,i)=>{ const c=C[m[i]]; return Math.hypot(cx+f*(c[0]-cx)-t[0], cz+f*(c[1]-cz)-t[1]); });
    if(Math.max(...e)<=0.4) return true;
  }
  return false;
}
// Eine Abschlussdefinition fuer alle Verfahren: Rueckkehr gemeldet UND ein
// einfacher Umriss mit Drehsumme ±360°.
function closedOK(out){
  const C=out.corners; if(!out.closed || !C || C.length<3) return false;
  let turn=0; const n=C.length;
  for(let i=0;i<n;i++){ const a=C[i], b=C[(i+1)%n], c=C[(i+2)%n];
    turn+=Math.atan2((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]), (b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1])); }
  if(Math.abs(Math.abs(turn*180/Math.PI)-360)>45) return false;
  for(let i=0;i<n;i++) for(let j=i+2;j<n;j++){ if(i===0 && j===n-1) continue;
    if(segX(C[i],C[(i+1)%n],C[j],C[(j+1)%n])) return false; }
  return true;
}

// dp/app: Raumhoehe per Laser. dpH/appH: Raumhoehe NICHT bekannt - nur
// Vorwissen 2,55 ± 0,35 m, der Rest aus der Parallaxe. app/appH spielen die
// App nach: jeder Zwischenstand wird ausgewertet (jeder zweite - die App
// fasst waehrend einer laufenden Auswertung ebenfalls zusammen), beim ersten
// "geschlossen" endet die Sitzung mit genau diesem Stand. Schliesst er nie,
// beendet der Nutzer von Hand (ganzer Strom). Aufwand O(n²) - nur auf Wunsch.
const optL=H=>({H, ...OPT}), optF=()=>({H0:2.55, Hsigma:0.35, ...OPT});
const dpOut=s=>({corners:s.corners, closed:s.closed, H:s.H, sH:s.sH, nSeg:s.nSeg, nW:s.walls.length, s0:s.s0, warnings:s.warnings,
  nOut:(s.labels||[]).filter(l=>typeof l==='string' && l.startsWith('verworfen')).length});
const replay=(sim,o)=>{
  const n=sim.obs.length;
  for(let m=Math.min(6,n); m<=n; m=(m<n && m+2>n) ? n : m+2){
    let s; try{ s=G.solveSweep(sim.obs.slice(0,m),o); }catch(e){ return {corners:null, closed:false, thrown:String(e)}; }
    if(s.closed) return {...dpOut(s), m, early:m<=sim.retStart};
    if(m===n) break;
  }
  return {...dpOut(G.solveSweep(sim.obs,o)), m:null};
};
const PIPE={
  greedy:(sim,H)=>{ const cl=G.clusterSweep(sim.obs,H); const ring=cl.walls.length>=3 ? G.ringFromClusters(cl,sim.obs,H) : null;
    return {corners:ring && ring.corners, closed:cl.closed}; },
  dp:(sim,H)=>dpOut(G.solveSweep(sim.obs,optL(H))),
  dpH:(sim,H)=>({...dpOut(G.solveSweep(sim.obs,optF())), Htrue:H}),
  app:(sim,H)=>replay(sim,optL(H)),
  appH:(sim,H)=>({...replay(sim,optF()), Htrue:H}),
};

// ------------------------------------------------------------ Auswertung
const q=(a,p)=>{ if(!a.length) return NaN; const s=[...a].sort((x,y)=>x-y); return s[Math.min(s.length-1, Math.floor(p*s.length))]; };
const pct=x=>Number.isFinite(x) ? (100*x).toFixed(0).padStart(3)+' %' : '   –';
const cm=x=>x===Infinity ? '     ∞' : Number.isFinite(x) ? (100*x).toFixed(1).padStart(6) : '     –';
// Wilson-Intervall 95 %: bei n um 50 ist ±10 Punkte normal.
const wilson=(k,n)=>{ if(!n) return [NaN,NaN]; const z=1.96, p=k/n, d=1+z*z/n, c=(p+z*z/(2*n))/d, h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d; return [Math.max(0,c-h),Math.min(1,c+h)]; };
const CLASS_ID=Object.fromEntries(ALL_CLASSES.map((c,i)=>[c,i]));

function run(szen, mul, classes, pipes, worst){
  const NZ=noiseOf(mul), rows=[];
  for(const cls of classes){
    const res=Object.fromEntries(pipes.map(p=>[p,{n:0, topo:0, rel:0, topoS:0, cR:0, cW:0, oR:0, err:[], ms:[], nobs:[],
      obsN:0, obsTopo:0, herr:[], hz:[], early:0, thrown:0, at:[]}]));
    for(let k=0;k<N;k++){
      const R=rng(SEED*100003+k*7919+CLASS_ID[cls]*1000003);
      let poly=ROOMS[cls](R);
      const rot=R()*2*Math.PI, cs=Math.cos(rot), sn=Math.sin(rot), off=[U(R,-3,3),U(R,-3,3)];
      poly=poly.map(([x,z])=>[cs*x-sn*z+off[0], sn*x+cs*z+off[1]]);
      const H=U(R,2.4,2.9);
      const sim=simulate(poly,H,R,NZ,szen); if(!sim) continue;
      // Beobachtbar: jede wahre Wand hat mindestens zwei Erfassungen (auch
      // an Ecken verwechselte zaehlen). Nur Aufschluesselung - gezaehlt wird
      // jeder Lauf.
      const observable=poly.every((_,w)=>sim.twall.filter(x=>x===w).length>=2);
      for(const p of pipes){
        const t0=performance.now(); let out;
        try{ out=PIPE[p](sim,H); }catch(e){ out={corners:null, closed:false, thrown:String(e)}; }
        const dt=performance.now()-t0;
        const sc=score(out.corners, poly), r=res[p], cl=closedOK(out);
        r.n++; r.ms.push(dt); r.nobs.push(sim.obs.length); r.err.push(sc.maxErr);
        if(out.thrown) r.thrown++;
        if(sc.topo) r.topo++; if(sc.rel) r.rel++;
        if(scoreScaleFree(out.corners, poly, R)) r.topoS++;
        if(cl && sc.topo) r.cR++; else if(cl) r.cW++; else if(sc.topo) r.oR++;
        if(observable){ r.obsN++; if(sc.topo) r.obsTopo++; }
        if(out.early) r.early++;
        if(out.m) r.at.push(out.m-sim.retStart);
        if(out.Htrue!=null && Number.isFinite(out.H)){ r.herr.push(out.H-out.Htrue); if(out.sH>0) r.hz.push(Math.abs(out.H-out.Htrue)/out.sH); }
        if(DIAG && (p==='dp'||p==='app')) console.log(`${szen}/${cls}/${k}/${p}: wahr ${poly.length} Ecken, gefunden ${sc.nC}, Segmente ${out.nSeg}, Wände ${out.nW}, geschl. ${cl}, s0 ${out.s0&&out.s0.toFixed(1)}, aus ${out.nOut}, H ${out.H&&out.H.toFixed(3)}/${H.toFixed(3)} ${sc.topo?'OK':'FEHL'} ${(out.warnings||[]).join(' | ')}`);
        if(!sc.topo && worst) worst.push({szen, cls, k, p, nC:sc.nC, nT:poly.length, err:sc.maxErr, closed:cl, thrown:out.thrown});
      }
    }
    for(const p of pipes) rows.push({szen, cls, p, mul, ...res[p]});
  }
  return rows;
}
const HEAD='Szenario      Klasse   Verf.     n   Topologie [95%-KI]   rel.  geschl.: richtig falsch  P(falsch|geschl.)  max.Eckfehler/Lauf Med 90%   maßstabsfrei  ms   Erf.  beob.';
function printRow(r){
  const [lo,hi]=wilson(r.topo,r.n), nc=r.cR+r.cW;
  let s=`${r.szen.padEnd(13)} ${r.cls.padEnd(8)} ${r.p.padEnd(6)} ${String(r.n).padStart(4)}  ${pct(r.topo/r.n)} [${pct(lo)}–${pct(hi)}]  ${pct(r.rel/r.n)}`+
    `  ${pct(r.cR/r.n).padStart(15)} ${pct(r.cW/r.n).padStart(6)}  ${(nc ? pct(r.cW/nc)+` (${r.cW}/${nc})` : '–').padStart(17)}`+
    `  ${cm(q(r.err,0.5))} ${cm(q(r.err,0.9))} cm  ${pct(r.topoS/r.n).padStart(12)}  ${q(r.ms,0.5).toFixed(1).padStart(5)} ${String(q(r.nobs,0.5)).padStart(4)}  ${r.obsN}: ${pct(r.obsTopo/r.obsN)}`;
  if(r.herr.length){ const m=r.herr.reduce((a,b)=>a+b,0)/r.herr.length;
    s+=`  H-Fehler mittel ${(100*m).toFixed(1)} cm, |·| Med ${(100*q(r.herr.map(Math.abs),0.5)).toFixed(1)} 90% ${(100*q(r.herr.map(Math.abs),0.9)).toFixed(1)} cm, |·|/sH Med ${q(r.hz,0.5).toFixed(2)} (ideal 0,67)`; }
  if(r.p.startsWith('app')) s+=`  zu früh ${r.early}, Nachlauf bis Schluss Med ${q(r.at,0.5)} Erf.`;
  if(r.thrown) s+=`  AUSNAHMEN ${r.thrown}`;
  console.log(s);
}

console.log(`raumskizze-bench  n=${N} je Klasse  seed=${SEED}  Rauschen=${HARD?'hart':'normal'}  Drift waagerecht×${MUL0.h} senkrecht×${MUL0.v} Gier×${MUL0.y} Fehlgriffe×${MUL0.o}`+(flag('html') ? `  Seite=${flag('html')}` : ''));
const worst=argv.includes('--worst') ? [] : null;
const KURVE=flag('kurve');
if(KURVE){
  console.log(`Kurve über ${KURVE} (Szenario ${SZEN[0]}):`); console.log('Faktor '+HEAD);
  for(const f of [0.5,1,2,3,4]){
    const m={...MUL0}; if(KURVE==='drift'){ m.h=f; m.v=f; } else m[{hdrift:'h',vdrift:'v',gier:'y',ausr:'o'}[KURVE]]=f;
    for(const r of run(SZEN[0], m, CLASSES, PIPES, worst)){ process.stdout.write(`×${String(f).padEnd(5)}`); printRow(r); }
  }
} else {
  console.log(HEAD);
  for(const szen of SZEN) for(const r of run(szen, MUL0, CLASSES, PIPES, worst)) printRow(r);
}

// --calib: normierte Reste der Erfassungen gegen die WAHRE Wand - passt das
// Fehlermodell (ptSigma) zum simulierten Rauschen? Ideal: |z| Median 0,67, 90 % 1,64.
if(argv.includes('--calib')){
  const NZ=noiseOf(MUL0), zs=[], zd=[], zl=[];
  for(let k=0;k<40;k++){
    const R=rng(SEED*977+k); const poly=ROOMS.rect(R), H=U(R,2.4,2.9), sim=simulate(poly,H,R,NZ); if(!sim) continue;
    const P=G._sweep.prepSweep(sim.obs,H,null,{});
    for(const p of P){ const w=sim.truth[p.i]; if(typeof w!=='number') continue;
      const a=poly[w], b=poly[(w+1)%poly.length], L=Math.hypot(b[0]-a[0],b[1]-a[1]), nx=-(b[1]-a[1])/L, nz=(b[0]-a[0])/L;
      const r=(q)=>(q[0]-a[0])*nx+(q[1]-a[1])*nz;
      zs.push(Math.abs(r(p.a))*Math.sqrt(p.wa), Math.abs(r(p.b))*Math.sqrt(p.wb));
      zd.push(Math.abs(r(p.a)), Math.abs(r(p.b))); }
    // Lokal: Reste gegen die aus den Erfassungen DIESER Wand gefittete Gerade
    // (Drift zwischen den Waenden faellt heraus, innerhalb bleibt sie).
    for(let w=0;w<poly.length;w++){
      const mine=P.filter(p=>sim.truth[p.i]===w); if(mine.length<3) continue;
      const f=G.fitLine2D(mine.flatMap(p=>[[...p.a,p.wa],[...p.b,p.wb]])); const nx=-f.u[1], nz=f.u[0];
      for(const p of mine) for(const [pt,ww] of [[p.a,p.wa],[p.b,p.wb]]) zl.push(Math.abs((pt[0]-f.c[0])*nx+(pt[1]-f.c[1])*nz)*Math.sqrt(ww));
    }
  }
  console.log(`calib lokal: |z| Median ${q(zl,0.5).toFixed(2)}  90% ${q(zl,0.9).toFixed(2)}  99% ${q(zl,0.99).toFixed(2)}`);
  console.log(`calib: |z| Median ${q(zs,0.5).toFixed(2)}  90% ${q(zs,0.9).toFixed(2)}  99% ${q(zs,0.99).toFixed(2)}  |r| Median ${(100*q(zd,0.5)).toFixed(1)} cm 90% ${(100*q(zd,0.9)).toFixed(1)} cm`);
}
if(worst){
  // Falsch geschlossene zuerst - die beendet die App von selbst.
  worst.sort((a,b)=>(b.closed?1:0)-(a.closed?1:0));
  console.log('\nFehlschläge (Szenario/Klasse/Lauf/Verfahren: Ecken gefunden/wahr, max. Fehler, geschlossen):\n'+
    worst.slice(0,40).map(w=>`  ${w.szen}/${w.cls}/${w.k}/${w.p}: ${w.nC}/${w.nT}, ${cm(w.err)} cm${w.closed ? ', FALSCH GESCHLOSSEN' : ''}${w.thrown ? ', Ausnahme: '+w.thrown : ''}`).join('\n'));
}
